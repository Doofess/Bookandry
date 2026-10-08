import { describe, expect, it, vi } from 'vitest';

import { resolveCard, type ResolvedCard } from '@/data/card-catalog/resolve';
import type { Catalog, CatalogRate } from '@/data/card-catalog/types';
import type { CardDetails } from '@/types/domain';
import type { LocalDate } from '@/types/money';

import { cardDealRate, linkCard, refreshLinkedCard } from './card-catalog-link';

// The catalog at version 2, so a card linked at 1 is one release behind.
vi.mock('@/data/card-catalog', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  CATALOG_VERSION: 2,
}));

const src = { url: 'https://example.com/x', seen: '2026-10-01' as LocalDate };
const TODAY = '2026-10-08' as LocalDate;

function rate(basis: CatalogRate['basis'], quality: CatalogRate['quality'] = 'exact'): CatalogRate {
  return {
    basis,
    quality,
    compounding: 12,
    dayCount: '30/360',
    accrues: 'billing_date',
    fixedAtPurchase: true,
    source: src,
  };
}

function catalogWith(
  over: { late?: CatalogRate; credit?: CatalogRate; billingDays?: number[] } = {},
): Catalog {
  return {
    version: 2,
    issuers: [
      {
        id: 'cal',
        name: { he: 'כאל', en: 'Cal' },
        tiers: [{ id: 'gold', name: { he: 'זהב', en: 'Gold' }, issued: true }],
        clubs: [],
        billingDays: [2, 10, 15],
        foreignPosting: 'immediate',
        fxFee: '3',
        cardFees: [{ tier: 'gold', monthlyMinor: 1790, waivers: [] }],
        deals: [
          {
            kind: 'credit',
            label: { he: 'קרדיט', en: 'Credit' },
            abroad: true,
            rate: over.credit ?? rate({ kind: 'prime', margin: '9.5' }),
            source: src,
          },
        ],
        lateRate: rate({ kind: 'boi', margin: '16.40' }, 'typical'),
      },
    ],
    banks: [
      {
        id: '20',
        name: { he: 'מזרחי', en: 'Mizrahi' },
        issuers: ['cal'],
        fxFee: { cal: '2.7' },
        lateRate: over.late ?? rate({ kind: 'prime', margin: '13.80' }, 'max'),
        ...(over.billingDays ? { billingDays: over.billingDays } : {}),
      },
    ],
  };
}

const LINK = { issuer: 'cal', bank: '20', tier: 'gold' } as const;
const resolved = (c: Catalog = catalogWith(), link: { bank: string } = LINK): ResolvedCard =>
  resolveCard(c, { ...LINK, ...link })!;

describe('linkCard', () => {
  it('links, keeps the person’s own rates, and refreshes only what follows the catalog', () => {
    const card: CardDetails = {
      billingDay: 10,
      creditPrimeMargin: '9',
      overrides: { credit: { basis: 'prime', margin: '9' } },
    };
    const linked = linkCard(card, resolved(), LINK, { keepOverrides: true, month: '2026-10' });
    expect(linked).toEqual({
      billingDay: 10,
      creditPrimeMargin: '9', // the person's own, kept
      fxFeeRate: '2.7',
      lateRate: { basis: 'prime', margin: '13.80' },
      overrides: { credit: { basis: 'prime', margin: '9' } },
      catalog: { issuer: 'cal', bank: '20', tier: 'gold', version: 2 },
    });

    // A release later: the bank's late rate changed, its credit rate did too.
    const behind: CardDetails = { ...linked, catalog: { ...linked.catalog!, version: 1 } };
    const next = catalogWith({
      late: rate({ kind: 'prime', margin: '14' }, 'max'),
      credit: rate({ kind: 'prime', margin: '10' }),
    });
    const refreshed = refreshLinkedCard(behind, resolved(next), TODAY);
    expect(refreshed).toEqual({
      ...linked,
      lateRate: { basis: 'prime', margin: '14' }, // follows the catalog
      creditPrimeMargin: '9', // overridden: stays
      catalog: { issuer: 'cal', bank: '20', tier: 'gold', version: 2, updatedOn: TODAY },
    });
  });

  it('drops the overrides unless asked to keep them, and fills from the catalog', () => {
    const card: CardDetails = {
      creditPrimeMargin: '9',
      overrides: { credit: { basis: 'prime', margin: '9' } },
    };
    const linked = linkCard(card, resolved(), LINK, { keepOverrides: false, month: '2026-10' });
    expect(linked.overrides).toBeUndefined();
    expect(linked.creditPrimeMargin).toBe('9.5');
  });

  it('never overwrites a field whose kind the person overrode', () => {
    const card: CardDetails = {
      lateRate: { basis: 'fixed', rate: '17' },
      overrides: { late: { basis: 'fixed', rate: '17' } },
    };
    const linked = linkCard(card, resolved(), LINK, { keepOverrides: true, month: '2026-10' });
    expect(linked.lateRate).toEqual({ basis: 'fixed', rate: '17' });
  });

  it('fills a card fee only where there is none, from this month', () => {
    const none = linkCard(
      {},
      resolved(catalogWith(), { bank: 'none' }),
      { ...LINK, bank: 'none' },
      {
        keepOverrides: false,
        month: '2026-10',
      },
    );
    expect(none).toMatchObject({ monthlyFeeMinor: 1790, feeSince: '2026-10' });
    const own = linkCard(
      { monthlyFeeMinor: 1500, feeSince: '2025-01' },
      resolved(catalogWith(), { bank: 'none' }),
      { ...LINK, bank: 'none' },
      { keepOverrides: false, month: '2026-10' },
    );
    expect(own).toMatchObject({ monthlyFeeMinor: 1500, feeSince: '2025-01' });
  });

  it('keeps a late rate the card cannot hold (Bank of Israel based) out of lateRate', () => {
    const linked = linkCard(
      { lateRate: { basis: 'fixed', rate: '20' } },
      resolved(catalogWith(), { bank: 'none' }),
      { ...LINK, bank: 'none' },
      { keepOverrides: false, month: '2026-10' },
    );
    expect(linked.lateRate).toEqual({ basis: 'fixed', rate: '20' });
  });

  it('fills the billing day only when it is missing or off the menu, and the menu has one day', () => {
    const opts = { keepOverrides: false, month: '2026-10' };
    const one = resolved(catalogWith({ billingDays: [15] }));
    expect(linkCard({}, one, LINK, opts).billingDay).toBe(15);
    expect(linkCard({ billingDay: 2 }, one, LINK, opts).billingDay).toBe(15);
    expect(linkCard({ billingDay: 15 }, one, LINK, opts).billingDay).toBe(15);
    // Several days: the person's own day stays, and none is guessed.
    expect(linkCard({ billingDay: 10 }, resolved(), LINK, opts).billingDay).toBe(10);
    expect(linkCard({ billingDay: 20 }, resolved(), LINK, opts).billingDay).toBe(20);
    expect(linkCard({}, resolved(), LINK, opts)).not.toHaveProperty('billingDay');
  });

  it('leaves the FX fee alone when the catalog has none, and keeps the club in the link', () => {
    const c = catalogWith();
    const noFx: Catalog = { ...c, banks: [{ ...c.banks[0]!, fxFee: {} }] };
    const linked = linkCard({ fxFeeRate: '2.5' }, resolved(noFx), LINK, {
      keepOverrides: false,
      month: '2026-10',
    });
    expect(linked.fxFeeRate).toBe('2.5');
  });
});

describe('refreshLinkedCard', () => {
  const behind = (): CardDetails => ({
    billingDay: 10,
    fxFeeRate: '2.7',
    creditPrimeMargin: '9.5',
    lateRate: { basis: 'prime', margin: '13.80' },
    catalog: { issuer: 'cal', bank: '20', tier: 'gold', version: 1 },
  });

  it('an old card with no catalog link is untouched by refresh', () => {
    expect(refreshLinkedCard({ billingDay: 10, creditPrimeMargin: '3' }, resolved(), TODAY)).toBeUndefined();
  });

  it('returns nothing when the catalog changed nothing on the card', () => {
    expect(refreshLinkedCard(behind(), resolved(), TODAY)).toBeUndefined();
  });

  it('returns nothing for a card already at this catalog version', () => {
    const current = { ...behind(), catalog: { ...behind().catalog!, version: 2 } };
    const next = catalogWith({ late: rate({ kind: 'prime', margin: '14' }) });
    expect(refreshLinkedCard(current, resolved(next), TODAY)).toBeUndefined();
  });

  it('leaves a card whose link the catalog no longer knows exactly as it is', () => {
    expect(refreshLinkedCard(behind(), undefined, TODAY)).toBeUndefined();
  });

  it('touches only fields not in the overrides', () => {
    const card = { ...behind(), overrides: { late: { basis: 'prime', margin: '13.80' } } } as const;
    const next = catalogWith({
      late: rate({ kind: 'prime', margin: '14' }),
      credit: rate({ kind: 'prime', margin: '10' }),
    });
    expect(refreshLinkedCard(card, resolved(next), TODAY)).toEqual({
      ...card,
      creditPrimeMargin: '10',
      catalog: { ...card.catalog, version: 2, updatedOn: TODAY },
    });
  });
});

describe('cardDealRate', () => {
  const linked: CardDetails = {
    creditPrimeMargin: '9',
    lateRate: { basis: 'fixed', rate: '19' },
    catalog: { issuer: 'cal', bank: '20', tier: 'gold', version: 2 },
  };

  it('takes the person’s override first', () => {
    const card = { ...linked, overrides: { credit: { basis: 'boi', margin: '3' } } } as const;
    expect(cardDealRate(card, resolved(), 'credit')).toEqual({
      term: { basis: 'boi', margin: '3' },
      source: 'override',
    });
  });

  it('then the catalog’s rate, with its quality', () => {
    expect(cardDealRate(linked, resolved(), 'credit')).toEqual({
      term: { basis: 'prime', margin: '9.5' },
      source: 'catalog',
      quality: 'exact',
    });
    expect(cardDealRate(linked, resolved(), 'late')).toEqual({
      term: { basis: 'prime', margin: '13.80' },
      source: 'catalog',
      quality: 'max',
    });
    const boi = cardDealRate({}, resolved(catalogWith(), { bank: 'none' }), 'late');
    expect(boi).toEqual({ term: { basis: 'boi', margin: '16.40' }, source: 'catalog', quality: 'typical' });
  });

  it('then, for credit and late, the card’s own fields when the catalog publishes none', () => {
    const unpublished = resolved(catalogWith({ credit: rate(null, 'typical') }));
    expect(cardDealRate(linked, unpublished, 'credit')).toEqual({
      term: { basis: 'prime', margin: '9' },
      source: 'card',
    });
    // Nothing on the card either: the catalog's empty rate, so the screen can say "from your statement".
    expect(cardDealRate({}, unpublished, 'credit')).toEqual({
      term: null,
      source: 'catalog',
      quality: 'typical',
    });
  });

  it('falls back to the card’s own fields when its link no longer resolves', () => {
    expect(cardDealRate(linked, undefined, 'credit')).toEqual({
      term: { basis: 'prime', margin: '9' },
      source: 'card',
    });
    expect(cardDealRate(linked, undefined, 'late')).toEqual({
      term: { basis: 'fixed', rate: '19' },
      source: 'card',
    });
    expect(cardDealRate(linked, undefined, 'deferred')).toBeUndefined();
  });

  it('is undefined when nothing anywhere has the rate', () => {
    expect(cardDealRate({}, resolved(), 'deferred')).toBeUndefined();
  });
});
