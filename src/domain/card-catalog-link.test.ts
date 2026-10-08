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
      {
        // A bank that publishes nothing: no FX fee, an unpublished credit and late rate.
        id: '10',
        name: { he: 'לאומי', en: 'Leumi' },
        issuers: ['cal'],
        lateRate: rate(null, 'max'),
        dealOverrides: [{ issuer: 'cal', deal: { kind: 'credit', rate: rate(null, 'typical') } }],
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
      catalog: {
        issuer: 'cal',
        bank: '20',
        tier: 'gold',
        version: 2,
        filled: { fxFeeRate: '2.7', lateRate: { basis: 'prime', margin: '13.80' } },
      },
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
      catalog: {
        issuer: 'cal',
        bank: '20',
        tier: 'gold',
        version: 2,
        updatedOn: TODAY,
        filled: { fxFeeRate: '2.7', lateRate: { basis: 'prime', margin: '14' } },
      },
    });
  });

  it('clears on a relink every figure the old entry filled that the new one does not give', () => {
    const opts = { keepOverrides: false, month: '2026-10' };
    const viaNone = linkCard({}, resolved(catalogWith(), { bank: 'none' }), { ...LINK, bank: 'none' }, opts);
    expect(viaNone).toMatchObject({ fxFeeRate: '3', monthlyFeeMinor: 1790, feeSince: '2026-10' });
    const atMizrahi = linkCard(viaNone, resolved(), LINK, opts);
    // A bank card: the bank's FX fee; the card company's fee is gone, with its date.
    expect(atMizrahi).toMatchObject({ fxFeeRate: '2.7', creditPrimeMargin: '9.5' });
    expect(atMizrahi).not.toHaveProperty('monthlyFeeMinor');
    expect(atMizrahi).not.toHaveProperty('feeSince');

    // Mizrahi's figures never linger as Leumi's.
    const LEUMI = { ...LINK, bank: '10' };
    const atLeumi = linkCard(atMizrahi, resolved(catalogWith(), { bank: '10' }), LEUMI, opts);
    for (const field of ['fxFeeRate', 'creditPrimeMargin', 'lateRate', 'monthlyFeeMinor'])
      expect(atLeumi, field).not.toHaveProperty(field);
    expect(atLeumi.catalog).toEqual({ issuer: 'cal', bank: '10', tier: 'gold', version: 2 });
    expect(cardDealRate(atLeumi, resolved(catalogWith(), { bank: '10' }), 'credit')).toEqual({
      term: null,
      source: 'catalog',
      quality: 'typical',
    });
  });

  it('keeps on a relink a figure the person typed that the new entry does not give', () => {
    const opts = { keepOverrides: false, month: '2026-10' };
    const typed: CardDetails = {
      creditPrimeMargin: '7',
      fxFeeRate: '2.5',
      monthlyFeeMinor: 1500,
      feeSince: '2025-01',
    };
    const atLeumi = linkCard(typed, resolved(catalogWith(), { bank: '10' }), { ...LINK, bank: '10' }, opts);
    expect(atLeumi).toMatchObject({ creditPrimeMargin: '7', fxFeeRate: '2.5', monthlyFeeMinor: 1500 });
    expect(cardDealRate(atLeumi, resolved(catalogWith(), { bank: '10' }), 'credit')).toEqual({
      term: { basis: 'prime', margin: '7' },
      source: 'card',
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
  const FILLED = {
    fxFeeRate: '2.7',
    creditPrimeMargin: '9.5',
    lateRate: { basis: 'prime', margin: '13.80' },
  } as const;
  // As linkCard left it, one release ago.
  const behind = (): CardDetails => ({
    billingDay: 10,
    ...FILLED,
    catalog: { issuer: 'cal', bank: '20', tier: 'gold', version: 1, filled: FILLED },
  });

  it('an old card with no catalog link is untouched by refresh', () => {
    expect(refreshLinkedCard({ billingDay: 10, creditPrimeMargin: '3' }, resolved(), TODAY)).toBeUndefined();
  });

  it('only moves the version up when the catalog changed nothing on the card, keeping updatedOn', () => {
    expect(refreshLinkedCard(behind(), resolved(), TODAY)).toEqual({
      ...behind(),
      catalog: { ...behind().catalog, version: 2 },
    });
    const earlier = { ...behind(), catalog: { ...behind().catalog!, updatedOn: '2026-01-05' as LocalDate } };
    expect(refreshLinkedCard(earlier, resolved(), TODAY)?.catalog).toEqual({
      ...earlier.catalog,
      version: 2,
    });
  });

  it('clears a figure the catalog withdrew, where the card still holds the catalog’s own', () => {
    const next = catalogWith({ credit: rate(null, 'typical') });
    const refreshed = refreshLinkedCard(behind(), resolved(next), TODAY)!;
    expect(refreshed).not.toHaveProperty('creditPrimeMargin');
    expect(refreshed.catalog).toEqual({
      issuer: 'cal',
      bank: '20',
      tier: 'gold',
      version: 2,
      updatedOn: TODAY,
      filled: { fxFeeRate: '2.7', lateRate: { basis: 'prime', margin: '13.80' } },
    });
  });

  it('never touches a figure the person typed or changed after it was filled', () => {
    const edited = { ...behind(), fxFeeRate: '1.5', creditPrimeMargin: '8' };
    const next = catalogWith({ credit: rate(null, 'typical'), late: rate({ kind: 'prime', margin: '14' }) });
    const refreshed = refreshLinkedCard(edited, resolved(next), TODAY)!;
    expect(refreshed).toMatchObject({
      fxFeeRate: '1.5',
      creditPrimeMargin: '8',
      lateRate: { basis: 'prime', margin: '14' }, // still the catalog's: it follows
    });
    // The records of what was filled stay, so the edits stay the person's.
    expect(refreshed.catalog?.filled).toEqual({
      fxFeeRate: '2.7',
      creditPrimeMargin: '9.5',
      lateRate: { basis: 'prime', margin: '14' },
    });

    // Cleared by the person after it was filled: it stays cleared.
    const { fxFeeRate: _gone, ...cleared } = behind();
    expect(refreshLinkedCard(cleared, resolved(), TODAY)).not.toHaveProperty('fxFeeRate');
  });

  it('does not present a figure the catalog filled as the card’s own', () => {
    const next = catalogWith({ credit: rate(null, 'typical') });
    expect(cardDealRate(behind(), resolved(next), 'credit')).toEqual({
      term: null,
      source: 'catalog',
      quality: 'typical',
    });
  });

  it('returns nothing for a card already at this catalog version', () => {
    const current = { ...behind(), catalog: { ...behind().catalog!, version: 2 } };
    const next = catalogWith({ late: rate({ kind: 'prime', margin: '14' }) });
    expect(refreshLinkedCard(current, resolved(next), TODAY)).toBeUndefined();
  });

  it('leaves every field of a card whose link the catalog no longer knows, moving only its version', () => {
    expect(refreshLinkedCard(behind(), undefined, TODAY)).toEqual({
      ...behind(),
      catalog: { ...behind().catalog, version: 2 },
    });
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
      catalog: {
        ...card.catalog,
        version: 2,
        updatedOn: TODAY,
        // The overridden late rate's record stays: once the override goes, the card's
        // 13.80 is still known for the catalog's.
        filled: { fxFeeRate: '2.7', creditPrimeMargin: '10', lateRate: { basis: 'prime', margin: '13.80' } },
      },
    });
  });

  describe('keeps a field the person’s through release after release', () => {
    // Two releases, each changing every figure, so any field the refresh owned would move.
    const release1 = catalogWith({
      credit: rate({ kind: 'prime', margin: '10' }),
      late: rate({ kind: 'prime', margin: '14' }),
    });
    const c = catalogWith({
      credit: rate({ kind: 'prime', margin: '11' }),
      late: rate({ kind: 'prime', margin: '15' }),
    });
    const release2: Catalog = { ...c, banks: [{ ...c.banks[0]!, fxFee: { cal: '3.1' } }, c.banks[1]!] };
    /** Refresh at release 1, then mark it one behind again and refresh at release 2. */
    const twice = (card: CardDetails): CardDetails => {
      const first = refreshLinkedCard(card, resolved(release1), TODAY)!;
      const behindAgain = { ...first, catalog: { ...first.catalog!, version: 1 } };
      return refreshLinkedCard(behindAgain, resolved(release2), '2026-11-08' as LocalDate)!;
    };

    it('(a) a figure the person cleared stays cleared', () => {
      const { fxFeeRate: _gone, creditPrimeMargin: _also, ...cleared } = behind();
      const after = twice(cleared);
      expect(after).not.toHaveProperty('fxFeeRate');
      expect(after).not.toHaveProperty('creditPrimeMargin');
      expect(after.lateRate).toEqual({ basis: 'prime', margin: '15' }); // the catalog's: it follows
    });

    it('(b) a figure the person changed stays theirs', () => {
      const after = twice({ ...behind(), fxFeeRate: '1.5', creditPrimeMargin: '8' });
      expect(after).toMatchObject({ fxFeeRate: '1.5', creditPrimeMargin: '8' });
    });

    it('(c) an overridden figure stays, and follows the catalog again once the override goes', () => {
      const overridden = { ...behind(), overrides: { credit: { basis: 'prime', margin: '7' } } } as const;
      const after = twice(overridden);
      expect(after.creditPrimeMargin).toBe('9.5');
      // Without the override, the card's 9.5 is still the catalog's own: the next release moves it.
      const { overrides: _none, ...plain } = after;
      const next = refreshLinkedCard(
        { ...plain, catalog: { ...plain.catalog!, version: 1 } },
        resolved(release2),
        TODAY,
      );
      expect(next?.creditPrimeMargin).toBe('11');
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
