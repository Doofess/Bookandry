import { addRates } from '@/lib/money';

import type { Catalog, CatalogBank, CatalogIssuer, CatalogRate, DealRule, ExtraRateKind } from './types';

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
      merged = { ...merged, ...o.deal };
      if ('rate' in o.deal) from = 'bank'; // only a rate it supplies is the bank's
    }
    const row = bank?.rates?.find(
      (r) => r.issuer === issuer.id && r.tier === link.tier && r.deal === deal.kind,
    );
    if (row) return { ...merged, rate: row.rate, from: 'bank_table' as const };
    return { ...merged, from };
  });

  const extra: Partial<Record<ExtraRateKind, ResolvedRate>> = {};
  for (const [kind, rate] of extraLayer(issuer.lateRate, issuer.extraRates)) {
    extra[kind] = { rate, from: 'issuer' };
  }
  if (bank) {
    for (const [kind, rate] of extraLayer(bank.lateRate, bank.extraRates)) {
      extra[kind] = { rate, from: 'bank' };
    }
  }

  // A club's own figures, then the tier's, then the card company's.
  const tier = issuer.tiers.find((t) => t.id === link.tier);
  const club = link.club === undefined ? undefined : issuer.clubs.find((c) => c.id === link.club);
  const fxFee = bank?.fxFee?.[issuer.id] ?? club?.fxFee ?? tier?.fxFee ?? issuer.fxFee;
  const monthlyFeeMinor =
    club?.monthlyMinor ?? issuer.cardFees?.find((f) => f.tier === link.tier)?.monthlyMinor;
  const foreignPosting = club?.foreignPosting ?? tier?.foreignPosting ?? issuer.foreignPosting;

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
