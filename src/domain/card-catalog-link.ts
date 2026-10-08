import { CATALOG_VERSION } from '@/data/card-catalog';
import type { ResolvedCard } from '@/data/card-catalog/resolve';
import type { CatalogRate } from '@/data/card-catalog/types';
import type {
  CardCatalogLink,
  CardDetails,
  CardRateTerm,
  CatalogFilled,
  DealKind,
  ExtraRateKind,
  RateTerm,
} from '@/types/domain';
import type { LocalDate } from '@/types/money';

/*
 * A card linked to the built-in catalog, and kept in step with it.
 *
 * The card's own fields (billingDay, fxFeeRate, monthlyFeeMinor,
 * creditPrimeMargin, lateRate) stay the stored truth for what the card uses.
 * Linking fills them from the catalog, and `catalog.filled` records what was
 * written. A field that still holds its filled value is the catalog's: a
 * relink or a later release replaces it, or clears it when the catalog no
 * longer gives a figure, so one bank's rate never lingers as another's. A
 * field the person typed, changed or cleared after it was filled no longer
 * matches, and is theirs: a refresh never touches it. `overrides` names the
 * rates (credit, late) the person set over the catalog's.
 *
 * This module never imports catalog data: the caller resolves the card
 * (`resolveCard` over `loadCatalog()`) and passes the result in.
 */

/** A catalog rate as a card's term; null when the catalog publishes no figure. */
function termOf(rate: CatalogRate): CardRateTerm | null {
  const b = rate.basis;
  if (!b) return null;
  switch (b.kind) {
    case 'prime':
      return { basis: 'prime', margin: b.margin };
    case 'boi':
      return { basis: 'boi', margin: b.margin };
    case 'fixed':
      return { basis: 'fixed', rate: b.rate };
  }
}

function catalogRate(resolved: ResolvedCard, kind: DealKind | ExtraRateKind): CatalogRate | undefined {
  if (kind === 'late' || kind === 'over_limit' || kind === 'cash') return resolved.extra[kind]?.rate;
  return resolved.deals.find((d) => d.kind === kind)?.rate;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type FilledField = keyof CatalogFilled;
const FILLED_FIELDS: readonly FilledField[] = [
  'fxFeeRate',
  'monthlyFeeMinor',
  'creditPrimeMargin',
  'lateRate',
];
/** The rate kind whose override keeps the catalog off a field. */
const OVERRIDE_KIND: Partial<Record<FilledField, DealKind | ExtraRateKind>> = {
  creditPrimeMargin: 'credit',
  lateRate: 'late',
};

/** What the catalog gives for each field it fills; undefined where it gives nothing. */
function catalogValues(resolved: ResolvedCard): CatalogFilled {
  const credit = catalogRate(resolved, 'credit');
  const late = resolved.extra.late?.rate;
  const lateTerm = late ? termOf(late) : null;
  return {
    ...(resolved.fxFee !== undefined ? { fxFeeRate: resolved.fxFee } : {}),
    ...(resolved.monthlyFeeMinor !== undefined ? { monthlyFeeMinor: resolved.monthlyFeeMinor } : {}),
    ...(credit?.basis?.kind === 'prime' ? { creditPrimeMargin: credit.basis.margin } : {}),
    // lateRate holds prime or fixed terms only; a Bank of Israel-based rate is
    // read from the catalog (cardDealRate) and never written onto the card.
    ...(lateTerm && lateTerm.basis !== 'boi' ? { lateRate: lateTerm satisfies RateTerm } : {}),
  };
}

/** Whether the card's value in `field` is the catalog's: it still holds what was filled. */
function catalogOwns(card: CardDetails, field: FilledField): boolean {
  const was = card.catalog?.filled?.[field];
  return was !== undefined && same(card[field], was);
}

/** Whether `field` is the person's: typed, or changed or cleared after it was filled. */
function personOwns(card: CardDetails, field: FilledField): boolean {
  if (catalogOwns(card, field)) return false;
  return card[field] !== undefined || card.catalog?.filled?.[field] !== undefined;
}

/**
 * The catalog's values written onto a card.
 *
 * `relink`: the person chose this entry, so the catalog's figure replaces
 * theirs (rates they override excepted); a figure the catalog no longer gives
 * is cleared only where the card still holds the catalog's own. The card fee
 * is the exception: a fee of the person's own always stays.
 * Refresh: only fields the catalog owns, or that are empty and were never
 * filled, follow it.
 *
 * `month` (YYYY-MM) dates a card fee filled for the first time, so filling it
 * never bills months already past.
 */
function fill(
  card: CardDetails,
  resolved: ResolvedCard,
  month: string,
  relink: boolean,
): { next: CardDetails; filled: CatalogFilled } {
  const next: Mutable<CardDetails> = { ...card };
  const filled: Mutable<CatalogFilled> = {};
  const cleared = new Set<string>();
  const values = catalogValues(resolved);

  // The billing day: kept while it is on the menu; set only when the menu leaves
  // one choice. With several, the person's day stays and none is guessed. It is
  // the card's real date once set, so it is never cleared.
  const days = resolved.billingDays;
  const onMenu = card.billingDay !== undefined && days.includes(card.billingDay);
  if (!onMenu && days.length === 1) next.billingDay = days[0];

  for (const field of FILLED_FIELDS) {
    const kind = OVERRIDE_KIND[field];
    if (kind !== undefined && card.overrides?.[kind] !== undefined) continue;
    const theirs = personOwns(card, field);
    if (theirs && !(relink && field !== 'monthlyFeeMinor' && values[field] !== undefined)) continue;

    const value = values[field];
    if (value === undefined) {
      cleared.add(field);
      if (field === 'monthlyFeeMinor') cleared.add('feeSince');
      continue;
    }
    if (field === 'monthlyFeeMinor' && card.monthlyFeeMinor === undefined) next.feeSince = month;
    (next as Record<FilledField, unknown>)[field] = value;
    (filled as Record<FilledField, unknown>)[field] = value;
  }
  const kept = Object.fromEntries(Object.entries(next).filter(([key]) => !cleared.has(key)));
  return { next: kept, filled };
}

/**
 * Link a card to a catalog entry and fill it in. Without `keepOverrides` the
 * person's changed rates are dropped, so the catalog's fill every field.
 */
export function linkCard(
  card: CardDetails,
  resolved: ResolvedCard,
  link: Omit<CardCatalogLink, 'version' | 'updatedOn' | 'filled'>,
  opts: { readonly keepOverrides: boolean; /** YYYY-MM: this month. */ readonly month: string },
): CardDetails {
  const { overrides, ...rest } = card;
  const base: CardDetails = opts.keepOverrides && overrides !== undefined ? { ...rest, overrides } : rest;
  const { next, filled } = fill(base, resolved, opts.month, true);
  return {
    ...next,
    catalog: { ...link, version: CATALOG_VERSION, ...(Object.keys(filled).length > 0 ? { filled } : {}) },
  };
}

/**
 * A linked card after a catalog release, for a card whose `catalog.version`
 * is behind. Its version always moves up, so the catalog is not fetched again
 * for it; `updatedOn` moves only when a value on the card changed. A link the
 * catalog no longer knows (`resolved` undefined) keeps every field it has.
 * Undefined when there is nothing to write: no link, or already current.
 */
export function refreshLinkedCard(
  card: CardDetails,
  resolved: ResolvedCard | undefined,
  today: LocalDate,
): CardDetails | undefined {
  const link = card.catalog;
  if (!link || link.version >= CATALOG_VERSION) return undefined;
  if (!resolved) return { ...card, catalog: { ...link, version: CATALOG_VERSION } };

  const { next, filled } = fill(card, resolved, today.slice(0, 7), false);
  const changed = (['billingDay', 'feeSince', ...FILLED_FIELDS] as const).some(
    (f) => !same(next[f], card[f]),
  );
  const { filled: _old, ...linkRest } = link;
  return {
    ...next,
    catalog: {
      ...linkRest,
      version: CATALOG_VERSION,
      ...(changed ? { updatedOn: today } : {}),
      ...(Object.keys(filled).length > 0 ? { filled } : {}),
    },
  };
}

export type CardDealRate = {
  readonly term: CardRateTerm | null;
  readonly source: 'override' | 'catalog' | 'card';
  readonly quality?: CatalogRate['quality'];
};

/**
 * The rate a card charges for a deal or an extra kind, and where it comes
 * from: the person's override, then the catalog's published rate, then (for
 * credit and late) the card's own fields. A catalog rate with no published
 * figure gives way to the card's own; with neither, it is returned empty, so
 * the screen can ask for it "from your statement". A card field that still
 * holds what the catalog filled is never presented as the card's own.
 * Undefined when nothing anywhere has the rate.
 */
export function cardDealRate(
  card: CardDetails,
  resolved: ResolvedCard | undefined,
  kind: DealKind | ExtraRateKind,
): CardDealRate | undefined {
  const override = card.overrides?.[kind];
  if (override !== undefined) return { term: override, source: 'override' };

  const rate = resolved ? catalogRate(resolved, kind) : undefined;
  const published = rate ? termOf(rate) : null;
  if (rate && published) return { term: published, source: 'catalog', quality: rate.quality };

  // Under a link that still resolves, a filled value is the catalog's, not the
  // card's own. A retired link has nothing better: its filled values stand.
  const own = (field: FilledField) => resolved === undefined || !catalogOwns(card, field);
  if (kind === 'credit' && card.creditPrimeMargin !== undefined && own('creditPrimeMargin'))
    return { term: { basis: 'prime', margin: card.creditPrimeMargin }, source: 'card' };
  if (kind === 'late' && card.lateRate !== undefined && own('lateRate'))
    return { term: card.lateRate, source: 'card' };

  if (rate) return { term: null, source: 'catalog', quality: rate.quality };
  return undefined;
}
