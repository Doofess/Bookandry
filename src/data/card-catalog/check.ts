import { isLocalDate } from '@/lib/dates';
import { addRates, annualEffectiveRate } from '@/lib/money';

import type { Catalog, CatalogRate } from './types';

const DECIMAL_RE = /^\d+(?:\.\d+)?$/;
const NOTE_RE = /^published nominal: (\d+(?:\.\d+)?); published effective: (\d+(?:\.\d+)?)$/;

/** A percent in whole hundredths ("12.68" is 1268), by digits, never by float. */
function hundredths(percent: string): number {
  const [whole = '0', frac = ''] = percent.split('.');
  return Number(whole + (frac + '00').slice(0, 2));
}

type Located = { where: string; rate: CatalogRate };

function allRates(catalog: Catalog): Located[] {
  const out: Located[] = [];
  const add = (where: string, rate: CatalogRate | undefined) => {
    if (rate) out.push({ where, rate });
  };
  for (const i of catalog.issuers) {
    add(`${i.id}.lateRate`, i.lateRate);
    for (const [k, r] of Object.entries(i.extraRates ?? {})) add(`${i.id}.extra.${k}`, r);
    for (const d of i.deals) add(`${i.id}.deal.${d.kind}`, d.rate);
  }
  for (const b of catalog.banks) {
    add(`${b.id}.lateRate`, b.lateRate);
    for (const [k, r] of Object.entries(b.extraRates ?? {})) add(`${b.id}.extra.${k}`, r);
    for (const o of b.dealOverrides ?? []) add(`${b.id}.override.${o.deal.kind}`, o.deal.rate);
    for (const r of b.rates ?? [])
      add(`${b.id}.rates.${r.issuer}.${r.tier ?? '*'}.${r.club ?? '*'}.${r.deal}`, r.rate);
  }
  return out;
}

function duplicates(ids: readonly string[]): string[] {
  return ids.filter((id, n) => ids.indexOf(id) !== n);
}

/**
 * Everything wrong with a catalog, as readable lines; empty when it is sound.
 * The data tests run this over the real catalog, and over small broken ones
 * to show that each check catches what it is for.
 */
export function catalogProblems(catalog: Catalog): string[] {
  const p: string[] = [];
  const issuerIds = new Set(catalog.issuers.map((i) => i.id));

  // Sources: https, and a real date.
  const checkSource = (where: string, s: { url: string; seen: string }) => {
    if (!s.url.startsWith('https://')) p.push(`${where}: source url is not https (${s.url})`);
    if (!isLocalDate(s.seen)) p.push(`${where}: source date is not a valid date (${s.seen})`);
  };
  for (const { where, rate } of allRates(catalog)) checkSource(where, rate.source);
  for (const i of catalog.issuers) for (const d of i.deals) checkSource(`${i.id}.deal.${d.kind}`, d.source);
  for (const i of catalog.issuers) {
    for (const [k, s] of Object.entries(i.sources ?? {})) checkSource(`${i.id}.sources.${k}`, s);
    for (const t of i.tiers) if (t.source) checkSource(`${i.id}.tier.${t.id}`, t.source);
    for (const c of i.clubs) if (c.source) checkSource(`${i.id}.club.${c.id}`, c.source);
    for (const f of i.cardFees ?? []) if (f.source) checkSource(`${i.id}.fee.${f.tier}`, f.source);
  }
  for (const b of catalog.banks) {
    for (const o of b.dealOverrides ?? [])
      if (o.deal.source) checkSource(`${b.id}.override.${o.deal.kind}`, o.deal.source);
    for (const f of b.fxFeeTiers ?? []) checkSource(`${b.id}.fxFeeTiers.${f.issuer}.${f.tier}`, f.source);

    // Every bank-level figure names its source.
    const s = b.sources ?? {};
    const need = (key: string, present: boolean, source: { url: string; seen: string } | undefined) => {
      if (!present) return;
      if (source) checkSource(`${b.id}.sources.${key}`, source);
      else p.push(`${b.id}.sources.${key}: no source`);
    };
    need('issuers', true, s.issuers);
    need('billingDays', b.billingDays !== undefined, s.billingDays);
    need('foreignPosting', b.foreignPosting !== undefined, s.foreignPosting);
    for (const id of Object.keys(b.fxFee ?? {}) as (keyof NonNullable<typeof s.fxFee>)[])
      need(`fxFee.${id}`, true, s.fxFee?.[id]);
  }

  // Duplicate ids.
  for (const id of duplicates(catalog.issuers.map((i) => i.id))) p.push(`duplicate issuer ${id}`);
  for (const id of duplicates(catalog.banks.map((b) => b.id))) p.push(`duplicate bank ${id}`);
  for (const i of catalog.issuers) {
    for (const id of duplicates(i.tiers.map((t) => t.id))) p.push(`${i.id}: duplicate tier ${id}`);
    for (const k of duplicates(i.deals.map((d) => d.kind))) p.push(`${i.id}: duplicate deal ${k}`);
  }

  // Issuers: fees name real tiers, moved clubs go somewhere still issued, one late rate.
  for (const i of catalog.issuers) {
    for (const f of i.cardFees ?? [])
      if (!i.tiers.some((t) => t.id === f.tier)) p.push(`${i.id}: card fee for unknown tier ${f.tier}`);
    for (const c of i.clubs) {
      if (!c.movedTo) continue;
      const to = i.clubs.find((x) => x.id === c.movedTo);
      if (!to) p.push(`${i.id}: club ${c.id} moved to unknown club ${c.movedTo}`);
      else if (!to.issued) p.push(`${i.id}: club ${c.id} moved to ${c.movedTo}, which is not issued`);
    }
    if (i.lateRate && i.extraRates?.late) p.push(`${i.id}: late rate given twice`);

    // FX fees are plain decimals; waivers climb by spend, each one cheaper than the fee.
    const fx: [string, string | undefined][] = [
      [i.id, i.fxFee],
      ...i.tiers.map((t): [string, string | undefined] => [`${i.id}.tier.${t.id}`, t.fxFee]),
      ...i.clubs.map((c): [string, string | undefined] => [`${i.id}.club.${c.id}`, c.fxFee]),
    ];
    for (const [where, fee] of fx)
      if (fee !== undefined && !DECIMAL_RE.test(fee)) p.push(`${where}: FX fee is not a decimal (${fee})`);
    for (const f of i.cardFees ?? []) {
      const where = `${i.id}.fee.${f.tier}`;
      const spends = f.waivers.map((w) => w.spendMinor);
      if (spends.some((s, n) => n > 0 && s <= (spends[n - 1] ?? s)))
        p.push(`${where}: waivers not in ascending spend`);
      for (const w of f.waivers)
        if ('feeMinor' in w && w.feeMinor >= f.monthlyMinor) p.push(`${where}: waiver fee not below the fee`);
    }

    // A higher minimum payment starts inside the payment range and is higher.
    for (const d of i.deals) {
      const from = d.minPaymentFrom;
      if (!from) continue;
      const where = `${i.id}.deal.${d.kind}`;
      if (!d.payments || from.payments <= d.payments.min || from.payments > d.payments.max)
        p.push(`${where}: minPaymentFrom outside the payment range`);
      if (from.minPaymentMinor <= (d.minPaymentMinor ?? 0))
        p.push(`${where}: minPaymentFrom not above the minimum payment`);
    }
  }

  // Banks: references that must resolve and be reachable.
  for (const b of catalog.banks) {
    for (const id of b.issuers) if (!issuerIds.has(id)) p.push(`${b.id}: unknown card company ${id}`);
    for (const [id, fee] of Object.entries(b.fxFee ?? {})) {
      if (!b.issuers.includes(id as never)) p.push(`${b.id}: fxFee for undistributed ${id}`);
      if (!DECIMAL_RE.test(fee)) p.push(`${b.id}.fxFee.${id}: FX fee is not a decimal (${fee})`);
    }
    for (const f of b.fxFeeTiers ?? []) {
      const where = `${b.id}.fxFeeTiers.${f.issuer}.${f.tier}`;
      if (!DECIMAL_RE.test(f.fee)) p.push(`${where}: FX fee is not a decimal (${f.fee})`);
      if (!b.issuers.includes(f.issuer)) p.push(`${where}: FX fee for undistributed ${f.issuer}`);
      const issuer = catalog.issuers.find((i) => i.id === f.issuer);
      if (issuer && !issuer.tiers.some((t) => t.id === f.tier)) p.push(`${where}: FX fee for unknown tier`);
    }
    if (b.lateRate && b.extraRates?.late) p.push(`${b.id}: late rate given twice`);
    for (const row of b.rates ?? []) {
      const where = `${b.id}.rates.${row.issuer}.${row.tier ?? '*'}.${row.club ?? '*'}.${row.deal}`;
      const issuer = catalog.issuers.find((i) => i.id === row.issuer);
      if (row.tier === undefined && row.club === undefined)
        p.push(`${where}: names neither a tier nor a club`);
      if (!issuer) p.push(`${where}: unknown card company`);
      else {
        if (row.tier !== undefined && !issuer.tiers.some((t) => t.id === row.tier))
          p.push(`${where}: unknown tier`);
        if (row.club !== undefined && !issuer.clubs.some((c) => c.id === row.club))
          p.push(`${where}: unknown club`);
        if (!issuer.deals.some((d) => d.kind === row.deal)) p.push(`${where}: unknown deal`);
      }
      if (!b.issuers.includes(row.issuer)) p.push(`${where}: bank does not distribute it`);
    }
    for (const o of b.dealOverrides ?? []) {
      const where = `${b.id}.override.${o.issuer}.${o.deal.kind}`;
      const issuer = catalog.issuers.find((i) => i.id === o.issuer);
      if (!issuer) p.push(`${where}: unknown card company`);
      else if (!issuer.deals.some((d) => d.kind === o.deal.kind)) p.push(`${where}: unknown deal`);
      if (!b.issuers.includes(o.issuer)) p.push(`${where}: bank does not distribute it`);
    }
  }

  // Published nominal/effective pairs.
  for (const { where, rate } of allRates(catalog)) {
    const note = rate.source.note;
    if (!note) continue;
    const m = NOTE_RE.exec(note);
    const nominal = m?.[1];
    const effective = m?.[2];
    if (nominal === undefined || effective === undefined) {
      if (/published (nominal|effective)/.test(note))
        p.push(`${where}: malformed published-pair note (${note})`);
      continue;
    }
    if (!rate.basis) {
      p.push(`${where}: a published pair on a rate with no basis`);
      continue;
    }
    if (rate.basis.kind === 'fixed' && addRates(rate.basis.rate, '0') !== addRates(nominal, '0'))
      p.push(`${where}: note nominal ${nominal} differs from fixed rate ${rate.basis.rate}`);
    const computed = annualEffectiveRate(nominal, rate.compounding);
    if (Math.abs(hundredths(computed) - hundredths(effective)) > 1)
      p.push(`${where}: effective ${computed} vs published ${effective}`);
  }

  return p;
}
