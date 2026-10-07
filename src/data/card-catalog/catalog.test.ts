import { describe, expect, it } from 'vitest';

import { isLocalDate } from '@/lib/dates';
import { annualEffectiveRate } from '@/lib/money';

import { loadCatalog } from './index';
import { clubsOf, tiersOf } from './resolve';
import type { Catalog, CatalogRate } from './types';

const NOTE_RE = /^published nominal: (\d+(?:\.\d+)?); published effective: (\d+(?:\.\d+)?)$/;

/** The published nominal/מתואמת pair a rate records in its source note, if it does. */
function publishedPair(note: string | undefined): { nominal: string; effective: string } | undefined {
  const m = note ? NOTE_RE.exec(note) : null;
  return m ? { nominal: m[1]!, effective: m[2]! } : undefined;
}

/** A percent in whole hundredths ("12.68" is 1268), by digits, never by float. */
function hundredths(percent: string): number {
  const [whole = '0', frac = ''] = percent.split('.');
  return Number(whole + (frac + '00').slice(0, 2));
}

/** Every rate in the catalog, with where it sits, for messages. */
function allRates(catalog: Catalog): { where: string; rate: CatalogRate }[] {
  const out: { where: string; rate: CatalogRate }[] = [];
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
    for (const r of b.rates ?? []) add(`${b.id}.rates.${r.issuer}.${r.tier}.${r.deal}`, r.rate);
  }
  return out;
}

describe('the published pair in a source note', () => {
  it('is read from the agreed format and nothing else', () => {
    expect(publishedPair('published nominal: 10.5; published effective: 11.02')).toEqual({
      nominal: '10.5',
      effective: '11.02',
    });
    expect(publishedPair('something else')).toBeUndefined();
    expect(publishedPair(undefined)).toBeUndefined();
  });
  it('matches annualEffectiveRate for a known pair', () => {
    // 12% nominal compounded monthly is 12.68% effective.
    expect(annualEffectiveRate('12', 12)).toBe('12.68');
  });
});

describe('the real card catalog', async () => {
  const catalog = await loadCatalog();
  const issuerIds = new Set(catalog.issuers.map((i) => i.id));

  it('loads once and returns the same catalog', async () => {
    expect(await loadCatalog()).toBe(catalog);
  });

  it('cites an https source seen on a real date for every rate and deal', () => {
    const sources: { where: string; url: string; seen: string }[] = [];
    for (const { where, rate } of allRates(catalog)) sources.push({ where, ...rate.source });
    for (const i of catalog.issuers)
      for (const d of i.deals) sources.push({ where: `${i.id}.deal.${d.kind}`, ...d.source });
    for (const s of sources) {
      expect(s.url.startsWith('https://'), `${s.where} url`).toBe(true);
      expect(isLocalDate(s.seen), `${s.where} seen`).toBe(true);
    }
  });

  it('only names card companies that exist', () => {
    for (const b of catalog.banks) {
      for (const id of b.issuers) expect(issuerIds.has(id), `${b.id} -> ${id}`).toBe(true);
      for (const id of Object.keys(b.fxFee ?? {}))
        expect(b.issuers.includes(id as never), `${b.id} fxFee ${id}`).toBe(true);
    }
  });

  it('has bank rate rows that name an existing card company, tier and deal kind', () => {
    for (const b of catalog.banks) {
      for (const row of b.rates ?? []) {
        const where = `${b.id}.rates.${row.issuer}.${row.tier}.${row.deal}`;
        const issuer = catalog.issuers.find((i) => i.id === row.issuer);
        expect(issuer, `${where} issuer`).toBeDefined();
        expect(
          issuer?.tiers.some((t) => t.id === row.tier),
          `${where} tier`,
        ).toBe(true);
        expect(
          issuer?.deals.some((d) => d.kind === row.deal),
          `${where} deal`,
        ).toBe(true);
      }
      for (const o of b.dealOverrides ?? []) {
        const issuer = catalog.issuers.find((i) => i.id === o.issuer);
        expect(
          issuer?.deals.some((d) => d.kind === o.deal.kind),
          `${b.id}.override.${o.issuer}.${o.deal.kind}`,
        ).toBe(true);
      }
    }
  });

  it('agrees with every published nominal/effective pair to within 0.01', () => {
    for (const { where, rate } of allRates(catalog)) {
      const pair = publishedPair(rate.source.note);
      if (!pair) continue;
      const computed = annualEffectiveRate(pair.nominal, rate.compounding);
      const diff = hundredths(computed) - hundredths(pair.effective);
      expect(Math.abs(diff), `${where}: ${computed} vs published ${pair.effective}`).toBeLessThanOrEqual(1);
    }
  });

  it('never offers a club or tier that is no longer issued', () => {
    for (const i of catalog.issuers) {
      expect(tiersOf(i).every((t) => t.issued)).toBe(true);
      expect(clubsOf(i).every((c) => c.issued)).toBe(true);
      for (const c of i.clubs)
        if (c.movedTo)
          expect(
            i.clubs.some((x) => x.id === c.movedTo),
            `${i.id} ${c.id}`,
          ).toBe(true);
    }
  });
});
