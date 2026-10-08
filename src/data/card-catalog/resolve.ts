import { addRates } from '@/lib/money';

import type {
  BankRateRow,
  Catalog,
  CatalogBank,
  CatalogIssuer,
  CatalogRate,
  DealRule,
  ExtraRateKind,
} from './types';

export type Provenance = 'issuer' | 'bank' | 'bank_table';
export type ResolvedRate = { rate: CatalogRate; from: Provenance };
export type ResolvedCard = {
  issuer: CatalogIssuer;
  bank: CatalogBank | undefined; // undefined: not through a bank
  tier: string;
  billingDays: readonly number[];
  fxFee?: string;
  foreignPosting: 'immediate' | 'billing_date';
  monthlyFeeMinor?: number;
  deals: readonly (DealRule & { rate?: CatalogRate; from: Provenance })[];
  extra: Partial<Record<ExtraRateKind, ResolvedRate>>;
};

function extraLayer(
  late: CatalogRate | undefined,
  more: Partial<Record<ExtraRateKind, CatalogRate>> | undefined,
): [ExtraRateKind, CatalogRate][] {
  const all: Partial<Record<ExtraRateKind, CatalogRate>> = { ...(late ? { late } : {}), ...more };
  return Object.entries(all) as [ExtraRateKind, CatalogRate][];
}

/**
 * The bank's table row for this deal and card: club and tier, then club
 * alone, then tier alone.
 */
function bankRow(
  rows: readonly BankRateRow[],
  issuer: string,
  deal: string,
  link: { tier: string; club?: string },
): BankRateRow | undefined {
  const fits = rows.filter(
    (r) =>
      r.issuer === issuer &&
      r.deal === deal &&
      (r.tier === undefined || r.tier === link.tier) &&
      (r.club === undefined || r.club === link.club),
  );
  return (
    fits.find((r) => r.club !== undefined && r.tier !== undefined) ??
    fits.find((r) => r.club !== undefined) ??
    fits.find((r) => r.tier !== undefined)
  );
}

/**
 * A card's settings: the card company's rules and rates, then the bank's
 * overrides of those rules field by field, then the bank's own rate for this
 * company, tier and deal. Undefined when the link names something the
 * catalog does not know.
 */
export function resolveCard(
  catalog: Catalog,
  link: { issuer: string; bank: string /* 'none': not through a bank */; tier: string; club?: string },
): ResolvedCard | undefined {
  const issuer = catalog.issuers.find((i) => i.id === link.issuer);
  if (!issuer) return undefined;
  if (!issuer.tiers.some((t) => t.id === link.tier)) return undefined;
  if (link.club !== undefined && !issuer.clubs.some((c) => c.id === link.club)) return undefined;

  let bank: CatalogBank | undefined;
  if (link.bank !== 'none') {
    bank = catalog.banks.find((b) => b.id === link.bank);
    if (!bank?.issuers.includes(issuer.id)) return undefined;
  }

  const deals = issuer.deals.map((deal) => {
    let merged: DealRule = deal;
    let from: Provenance = 'issuer';
    for (const o of bank?.dealOverrides ?? []) {
      if (o.issuer !== issuer.id || o.deal.kind !== deal.kind) continue;
      // A key present but undefined overrides nothing.
      const entries: [string, unknown][] = Object.entries(o.deal);
      const given = Object.fromEntries(entries.filter(([, v]) => v !== undefined));
      merged = { ...merged, ...given };
      if (o.deal.rate !== undefined) from = 'bank'; // only a rate it supplies is the bank's
    }
    const row = bankRow(bank?.rates ?? [], issuer.id, deal.kind, link);
    if (row) return { ...merged, rate: row.rate, from: 'bank_table' as const };
    return { ...merged, from };
  });

  /*
   * Late interest on a bank card is the bank account's rate, never the card
   * company's (banks-leumi-hapoalim-mizrahi.md, cross-bank finding 5;
   * banks-others.md §10.5): the card company's late rate is for its own cards.
   */
  const extra: Partial<Record<ExtraRateKind, ResolvedRate>> = {};
  for (const [kind, rate] of extraLayer(issuer.lateRate, issuer.extraRates)) {
    if (bank && kind === 'late') continue;
    extra[kind] = { rate, from: 'issuer' };
  }
  if (bank) {
    for (const [kind, rate] of extraLayer(bank.lateRate, bank.extraRates)) {
      extra[kind] = { rate, from: 'bank' };
    }
  }

  const tier = issuer.tiers.find((t) => t.id === link.tier);
  const club = link.club === undefined ? undefined : issuer.clubs.find((c) => c.id === link.club);
  /*
   * Fees. A card not through a bank: the club's own figure, then the tier's,
   * then the card company's. A bank card pays the BANK's fees (max.md §3 and
   * §8: "Bank-issued Max cards follow the bank's tariff" and "pay the bank's
   * card fees"; isracard.md §3: the club FX fees are "במקום 2.9%" on non-bank
   * cards, and each bank has its own Isracard schedule). So on a bank card the
   * card company's tier and club figures do not apply: the FX fee is the bank's
   * own for this card type, else the bank's for this card company, else
   * unknown; the card fee is unknown (the catalog holds no bank card fees).
   *
   * Counter-evidence, weighed: banks-others §10.1 reads Discount's and
   * Mercantile's tariffs ("העמלות נקבעות על ידה, למעט דמי כרטיס") as the card
   * company setting the FX fee, and Yahav's FlyAll page gives a club rate (1% in
   * year 1) on a bank card. Even where the card company sets it, the figure for a
   * bank card is the one in that bank's schedule, which differs from the non-bank
   * one (Isracard 2.7% at Mizrahi against 2.9%). So "unknown" is kept over
   * showing a non-bank figure that may be wrong; no figure is invented.
   */
  const fxFee = bank
    ? (bank.fxFeeTiers?.find((f) => f.issuer === issuer.id && f.tier === link.tier)?.fee ??
      bank.fxFee?.[issuer.id])
    : (club?.fxFee ?? tier?.fxFee ?? issuer.fxFee);
  const monthlyFeeMinor = bank
    ? undefined
    : (club?.monthlyMinor ?? issuer.cardFees?.find((f) => f.tier === link.tier)?.monthlyMinor);
  // The bank's rule for this card type, then its bank-wide rule ("על אף" the
  // card's own date: Hapoalim §8.4), then the card company's.
  const foreignPosting =
    bank?.foreignPostingTiers?.find((f) => f.issuer === issuer.id && f.tier === link.tier)?.posting ??
    bank?.foreignPosting ??
    club?.foreignPosting ??
    tier?.foreignPosting ??
    issuer.foreignPosting;

  return {
    issuer,
    bank,
    tier: link.tier,
    billingDays: bank?.billingDays ?? issuer.billingDays,
    ...(fxFee !== undefined ? { fxFee } : {}),
    foreignPosting,
    ...(monthlyFeeMinor !== undefined ? { monthlyFeeMinor } : {}),
    deals,
    extra,
  };
}

/** The nominal annual rate today, or undefined when the rate is not published. */
export function rateToday(rate: CatalogRate, primePercent: string, boiPercent: string): string | undefined {
  const basis = rate.basis;
  if (!basis) return undefined;
  switch (basis.kind) {
    case 'prime':
      return addRates(primePercent, basis.margin);
    case 'boi':
      return addRates(boiPercent, basis.margin);
    case 'fixed':
      return basis.rate;
  }
}

/** The card companies reachable through a bank; 'none' is a card not through a bank, so every one. */
export function issuersAt(
  catalog: Catalog,
  bank: string /* 'none': not through a bank */,
): readonly CatalogIssuer[] {
  if (bank === 'none') return catalog.issuers;
  const b = catalog.banks.find((x) => x.id === bank);
  if (!b) return [];
  return catalog.issuers.filter((i) => b.issuers.includes(i.id));
}

/** The tiers still issued: the ones a person can pick for a new card. */
export function tiersOf(issuer: CatalogIssuer): readonly CatalogIssuer['tiers'][number][] {
  return issuer.tiers.filter((t) => t.issued);
}

/** The clubs still issued: the ones a person can pick for a new card. */
export function clubsOf(issuer: CatalogIssuer): readonly CatalogIssuer['clubs'][number][] {
  return issuer.clubs.filter((c) => c.issued);
}
