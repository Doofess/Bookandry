import { CATALOG_VERSION } from '@/data/card-catalog';
import type { ResolvedCard } from '@/data/card-catalog/resolve';
import type { CatalogRate } from '@/data/card-catalog/types';
import type {
  CardCatalogLink,
  CardDetails,
  CardRateTerm,
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
 * Linking fills them from the catalog; a later catalog release refreshes the
 * ones the person never changed. `overrides` names the rates they did change.
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

const sameTerm = (a: RateTerm | undefined, b: RateTerm | undefined): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * The catalog's values written onto a card, skipping every field whose kind
 * is in `overrides`. `month` (YYYY-MM) dates a card fee filled in for the first
 * time, so filling it never bills months already past.
 */
function fill(card: CardDetails, resolved: ResolvedCard, month: string): CardDetails {
  const next: Mutable<CardDetails> = { ...card };
  const overridden = (kind: DealKind | ExtraRateKind) => card.overrides?.[kind] !== undefined;

  // The billing day: kept while it is on the menu; set only when the menu leaves
  // one choice. With several, the person's day stays and none is guessed.
  const days = resolved.billingDays;
  const onMenu = card.billingDay !== undefined && days.includes(card.billingDay);
  if (!onMenu && days.length === 1) next.billingDay = days[0];

  if (resolved.fxFee !== undefined) next.fxFeeRate = resolved.fxFee;

  if (card.monthlyFeeMinor === undefined && resolved.monthlyFeeMinor !== undefined) {
    next.monthlyFeeMinor = resolved.monthlyFeeMinor;
    next.feeSince = month;
  }

  const credit = catalogRate(resolved, 'credit');
  if (!overridden('credit') && credit?.basis?.kind === 'prime') next.creditPrimeMargin = credit.basis.margin;

  // lateRate holds prime or fixed terms only; a Bank of Israel-based rate is
  // read from the catalog (cardDealRate) and never written onto the card.
  const late = resolved.extra.late?.rate;
  const lateTerm = late ? termOf(late) : null;
  if (!overridden('late') && lateTerm && lateTerm.basis !== 'boi') next.lateRate = lateTerm;

  return next;
}

/**
 * Link a card to a catalog entry and fill it in. Without `keepOverrides` the
 * person's changed rates are dropped, so the catalog's fill every field.
 */
export function linkCard(
  card: CardDetails,
  resolved: ResolvedCard,
  link: Omit<CardCatalogLink, 'version' | 'updatedOn'>,
  opts: { readonly keepOverrides: boolean; /** YYYY-MM: this month. */ readonly month: string },
): CardDetails {
  const { overrides, catalog: _old, ...rest } = card;
  const base: CardDetails = opts.keepOverrides && overrides !== undefined ? { ...rest, overrides } : rest;
  return { ...fill(base, resolved, opts.month), catalog: { ...link, version: CATALOG_VERSION } };
}

/**
 * A linked card after a catalog release: the same fill, for a card whose
 * `catalog.version` is behind. Undefined when there is nothing to write: no
 * link, already current, a link the catalog no longer knows (`resolved`
 * undefined: the card keeps every field it has), or no value changed.
 */
export function refreshLinkedCard(
  card: CardDetails,
  resolved: ResolvedCard | undefined,
  today: LocalDate,
): CardDetails | undefined {
  const link = card.catalog;
  if (!link || link.version >= CATALOG_VERSION || !resolved) return undefined;
  const next = fill(card, resolved, today.slice(0, 7));
  const changed =
    next.billingDay !== card.billingDay ||
    next.fxFeeRate !== card.fxFeeRate ||
    next.monthlyFeeMinor !== card.monthlyFeeMinor ||
    next.creditPrimeMargin !== card.creditPrimeMargin ||
    !sameTerm(next.lateRate, card.lateRate);
  if (!changed) return undefined;
  return { ...next, catalog: { ...link, version: CATALOG_VERSION, updatedOn: today } };
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
 * the screen can ask for it "from your statement". Undefined when nothing
 * anywhere has the rate.
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

  if (kind === 'credit' && card.creditPrimeMargin !== undefined)
    return { term: { basis: 'prime', margin: card.creditPrimeMargin }, source: 'card' };
  if (kind === 'late' && card.lateRate !== undefined) return { term: card.lateRate, source: 'card' };

  if (rate) return { term: null, source: 'catalog', quality: rate.quality };
  return undefined;
}
