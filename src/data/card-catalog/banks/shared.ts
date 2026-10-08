// Helpers shared by the bank files. Every figure they build is passed in from
// a bank file, which names its research section; nothing here is data.
import type { LocalDate } from '@/types/money';

import type { BankRateRow, CatalogRate, CatalogSource, DealKind, IssuerId } from '../types';

export const SEEN = '2026-10-08' as LocalDate;

export const at = (url: string, note?: string): CatalogSource =>
  note ? { url, seen: SEEN, note } : { url, seen: SEEN };

/** The agreed note for a published nominal / מתואמת pair, digits only. */
export const pair = (nominal: string, effective: string): string =>
  `published nominal: ${nominal}; published effective: ${effective}`;

/** How a bank's rate behaves; the figure itself is given per row. */
export type RateShape = Omit<CatalogRate, 'basis' | 'source'>;

/** One table cell: prime + margin, with its source. */
export const primeRate = (shape: RateShape, margin: string, source: CatalogSource): CatalogRate => ({
  ...shape,
  basis: { kind: 'prime', margin },
  source,
});

/** The same rate for several tiers of one card company. */
export const forTiers = (
  issuer: IssuerId,
  tiers: readonly string[],
  deal: DealKind,
  rate: CatalogRate,
): BankRateRow[] => tiers.map((tier) => ({ issuer, tier, deal, rate }));
