import { describe, expect, it } from 'vitest';

import type { LocalDate } from '@/types/money';

import { clubsOf, issuersAt, rateToday, resolveCard, tiersOf } from './resolve';
import type { Catalog, CatalogRate, DealRule } from './types';

const SEEN = '2026-10-01' as LocalDate;
const src = { url: 'https://example.com/x', seen: SEEN };

function rate(basis: CatalogRate['basis'], note?: string): CatalogRate {
  return {
    basis,
    quality: 'exact',
    compounding: 12,
    dayCount: '30/360',
    accrues: 'purchase',
    fixedAtPurchase: true,
    source: note ? { ...src, note } : src,
  };
}

const issuerCredit = rate({ kind: 'prime', margin: '2' });
const issuerLate = rate({ kind: 'fixed', rate: '11' });
const bankLate = rate({ kind: 'fixed', rate: '9' });
const tableCredit = rate({ kind: 'prime', margin: '1.25' });

const creditDeal: DealRule = {
  kind: 'credit',
  label: { he: 'קרדיט', en: 'Credit' },
  payments: { min: 3, max: 12 },
  minDealMinor: 10000,
  abroad: false,
  rate: issuerCredit,
  source: src,
};
const regularDeal: DealRule = {
  kind: 'regular',
  label: { he: 'רגיל', en: 'Regular' },
  abroad: true,
  source: src,
};

const catalog: Catalog = {
  version: 1,
  issuers: [
    {
      id: 'cal',
      name: { he: 'כאל', en: 'Cal' },
      tiers: [
        { id: 'gold', name: { he: 'זהב', en: 'Gold' }, issued: true },
        { id: 'old', name: { he: 'ישן', en: 'Old' }, issued: false },
      ],
      clubs: [
        { id: 'a', name: 'A', issued: true },
        { id: 'b', name: 'B', issued: false, movedTo: 'a' },
      ],
      billingDays: [2, 10],
      foreignPosting: 'immediate',
      fxFee: '2.5',
      cardFees: [{ tier: 'gold', monthlyMinor: 1500, waivers: [] }],
      deals: [regularDeal, creditDeal],
      lateRate: issuerLate,
      extraRates: { cash: rate({ kind: 'fixed', rate: '14' }) },
    },
    {
      id: 'max',
      name: { he: 'מקס', en: 'Max' },
      tiers: [{ id: 'std', name: { he: 'רגיל', en: 'Std' }, issued: true }],
      clubs: [],
      billingDays: [10],
      foreignPosting: 'billing_date',
      deals: [],
    },
  ],
  banks: [
    {
      id: 'b1',
      name: { he: 'בנק א', en: 'Bank A' },
      issuers: ['cal'],
      fxFee: { cal: '2' },
      lateRate: bankLate,
      billingDays: [15],
      dealOverrides: [{ issuer: 'cal', deal: { kind: 'credit', minDealMinor: 50000 } }],
      rates: [{ issuer: 'cal', tier: 'gold', deal: 'credit', rate: tableCredit }],
    },
    { id: 'b2', name: { he: 'בנק ב', en: 'Bank B' }, issuers: ['cal', 'max'] },
  ],
};

describe('resolveCard', () => {
  it('uses the card company alone for a card not through a bank', () => {
    const r = resolveCard(catalog, { issuer: 'cal', bank: 'none', tier: 'gold' });
    expect(r?.bank).toBeUndefined();
    expect(r?.billingDays).toEqual([2, 10]);
    expect(r?.fxFee).toBe('2.5');
    expect(r?.monthlyFeeMinor).toBe(1500);
    expect(r?.foreignPosting).toBe('immediate');
    const credit = r?.deals.find((d) => d.kind === 'credit');
    expect(credit?.rate).toBe(issuerCredit);
    expect(credit?.minDealMinor).toBe(10000);
    expect(credit?.from).toBe('issuer');
    expect(r?.extra.late).toEqual({ rate: issuerLate, from: 'issuer' });
    expect(r?.extra.cash?.from).toBe('issuer');
  });

  it('layers the bank over the card company: overrides, then its rate table', () => {
    const r = resolveCard(catalog, { issuer: 'cal', bank: 'b1', tier: 'gold' });
    expect(r?.billingDays).toEqual([15]);
    expect(r?.fxFee).toBe('2');
    const credit = r?.deals.find((d) => d.kind === 'credit');
    expect(credit?.minDealMinor).toBe(50000); // overridden field
    expect(credit?.payments).toEqual({ min: 3, max: 12 }); // untouched field kept
    expect(credit?.rate).toBe(tableCredit); // table replaces the rate
    expect(credit?.from).toBe('bank_table');
    expect(r?.deals.find((d) => d.kind === 'regular')?.from).toBe('issuer');
    expect(r?.extra.late).toEqual({ rate: bankLate, from: 'bank' });
    expect(r?.extra.cash?.from).toBe('issuer'); // bank has none: company's stays
  });

  it('keeps a rate from the card company when the bank override does not touch it', () => {
    const c: Catalog = {
      ...catalog,
      banks: [{ ...catalog.banks[0]!, rates: [] }, catalog.banks[1]!],
    };
    const r = resolveCard(c, { issuer: 'cal', bank: 'b1', tier: 'gold' });
    const credit = r?.deals.find((d) => d.kind === 'credit');
    expect(credit?.minDealMinor).toBe(50000);
    expect(credit?.from).toBe('issuer');
    expect(credit?.rate).toBe(issuerCredit);
  });

  it('labels a rate from the bank when its override supplies one', () => {
    const c: Catalog = {
      ...catalog,
      banks: [
        {
          ...catalog.banks[0]!,
          rates: [],
          dealOverrides: [{ issuer: 'cal', deal: { kind: 'credit', rate: tableCredit } }],
        },
        catalog.banks[1]!,
      ],
    };
    const credit = resolveCard(c, { issuer: 'cal', bank: 'b1', tier: 'gold' })?.deals.find(
      (d) => d.kind === 'credit',
    );
    expect(credit?.rate).toBe(tableCredit);
    expect(credit?.from).toBe('bank');
  });

  it('keeps the card company’s rules where the bank has none, but never its fees', () => {
    const r = resolveCard(catalog, { issuer: 'cal', bank: 'b2', tier: 'gold' });
    expect(r?.billingDays).toEqual([2, 10]);
    expect(r?.deals.find((d) => d.kind === 'credit')?.rate).toBe(issuerCredit);
    // A bank card pays the bank's fees: the card company's tariff is for its own cards.
    expect(r?.fxFee).toBeUndefined();
    expect(r?.monthlyFeeMinor).toBeUndefined();
  });

  it('takes no FX fee or card fee from a card company’s tier or club on a bank card', () => {
    const cal = catalog.issuers[0]!;
    const c: Catalog = {
      ...catalog,
      issuers: [
        {
          ...cal,
          tiers: [{ ...cal.tiers[0]!, fxFee: '2' }, cal.tiers[1]!],
          clubs: [{ ...cal.clubs[0]!, monthlyMinor: 990, fxFee: '1' }, cal.clubs[1]!],
        },
        catalog.issuers[1]!,
      ],
    };
    const r = resolveCard(c, { issuer: 'cal', bank: 'b2', tier: 'gold', club: 'a' });
    expect(r?.fxFee).toBeUndefined();
    expect(r?.monthlyFeeMinor).toBeUndefined();
    expect(resolveCard(c, { issuer: 'cal', bank: 'b1', tier: 'gold', club: 'a' })?.fxFee).toBe('2');
  });

  it('takes a bank’s own FX fee for one card type over its fee for the card company', () => {
    const c: Catalog = {
      ...catalog,
      banks: [
        {
          ...catalog.banks[0]!,
          fxFeeTiers: [{ issuer: 'cal', tier: 'gold', fee: '1.5', source: src }],
        },
        catalog.banks[1]!,
      ],
    };
    expect(resolveCard(c, { issuer: 'cal', bank: 'b1', tier: 'gold' })?.fxFee).toBe('1.5');
    expect(resolveCard(c, { issuer: 'cal', bank: 'b1', tier: 'old' })?.fxFee).toBe('2');
  });

  it('takes a bank’s foreign-posting rule over the card company’s, tier’s and club’s', () => {
    const cal = catalog.issuers[0]!;
    const c: Catalog = {
      ...catalog,
      issuers: [
        { ...cal, tiers: [{ ...cal.tiers[0]!, foreignPosting: 'immediate' }, cal.tiers[1]!] },
        catalog.issuers[1]!,
      ],
      banks: [{ ...catalog.banks[0]!, foreignPosting: 'billing_date' }, catalog.banks[1]!],
    };
    expect(resolveCard(c, { issuer: 'cal', bank: 'b1', tier: 'gold' })?.foreignPosting).toBe('billing_date');
    expect(resolveCard(c, { issuer: 'cal', bank: 'b2', tier: 'gold' })?.foreignPosting).toBe('immediate');
  });

  it('never gives a bank card the card company’s late rate: it is the bank account’s', () => {
    const r = resolveCard(catalog, { issuer: 'cal', bank: 'b2', tier: 'gold' });
    expect(r?.extra.late).toBeUndefined();
    expect(r?.extra.cash?.from).toBe('issuer'); // other rates still layer
  });

  it('does not claim a rate for the bank from an override whose rate key is undefined', () => {
    const c: Catalog = {
      ...catalog,
      banks: [
        {
          ...catalog.banks[0]!,
          rates: [],
          dealOverrides: [{ issuer: 'cal', deal: { kind: 'credit', rate: undefined } }],
        },
        catalog.banks[1]!,
      ],
    };
    const credit = resolveCard(c, { issuer: 'cal', bank: 'b1', tier: 'gold' })?.deals.find(
      (d) => d.kind === 'credit',
    );
    expect(credit?.from).toBe('issuer');
    expect(credit?.rate).toBe(issuerCredit);
  });

  it('takes a bank’s rate for a club over its rate for the tier, and club and tier over club alone', () => {
    const forClub = rate({ kind: 'prime', margin: '5' });
    const forClubTier = rate({ kind: 'prime', margin: '6' });
    const c: Catalog = {
      ...catalog,
      banks: [
        {
          ...catalog.banks[0]!,
          rates: [
            { issuer: 'cal', tier: 'gold', deal: 'credit', rate: tableCredit },
            { issuer: 'cal', club: 'a', deal: 'credit', rate: forClub },
          ],
        },
        catalog.banks[1]!,
      ],
    };
    const credit = (link: { tier: string; club?: string }) =>
      resolveCard(c, { issuer: 'cal', bank: 'b1', ...link })?.deals.find((d) => d.kind === 'credit');
    expect(credit({ tier: 'gold' })?.rate).toBe(tableCredit);
    expect(credit({ tier: 'gold', club: 'a' })?.rate).toBe(forClub);
    expect(credit({ tier: 'old', club: 'a' })?.rate).toBe(forClub);
    expect(credit({ tier: 'old' })?.from).toBe('issuer');

    c.banks[0]!.rates!.push({ issuer: 'cal', tier: 'gold', club: 'a', deal: 'credit', rate: forClubTier });
    expect(credit({ tier: 'gold', club: 'a' })?.rate).toBe(forClubTier);
    expect(credit({ tier: 'old', club: 'a' })?.rate).toBe(forClub);
  });

  it('still resolves a tier that is no longer issued, and a known club', () => {
    expect(resolveCard(catalog, { issuer: 'cal', bank: 'none', tier: 'old' })).toBeDefined();
    expect(resolveCard(catalog, { issuer: 'cal', bank: 'none', tier: 'gold', club: 'b' })).toBeDefined();
  });

  it('takes a club’s own figures over the tier’s, and the tier’s over the card company’s', () => {
    const cal = catalog.issuers[0]!;
    const c: Catalog = {
      ...catalog,
      issuers: [
        {
          ...cal,
          tiers: [{ ...cal.tiers[0]!, fxFee: '2', foreignPosting: 'billing_date' }, cal.tiers[1]!],
          clubs: [{ ...cal.clubs[0]!, monthlyMinor: 0, fxFee: '1' }, cal.clubs[1]!],
        },
        catalog.issuers[1]!,
      ],
    };
    const byTier = resolveCard(c, { issuer: 'cal', bank: 'none', tier: 'gold' });
    expect(byTier).toMatchObject({ fxFee: '2', foreignPosting: 'billing_date', monthlyFeeMinor: 1500 });
    const byClub = resolveCard(c, { issuer: 'cal', bank: 'none', tier: 'gold', club: 'a' });
    expect(byClub).toMatchObject({ fxFee: '1', foreignPosting: 'billing_date', monthlyFeeMinor: 0 });
    // On a bank card, the bank's FX fee.
    expect(resolveCard(c, { issuer: 'cal', bank: 'b1', tier: 'gold', club: 'a' })?.fxFee).toBe('2');
    // The old tier has none of its own: the card company's stand.
    expect(resolveCard(c, { issuer: 'cal', bank: 'none', tier: 'old' })).toMatchObject({
      fxFee: '2.5',
      foreignPosting: 'immediate',
    });
  });

  it('is undefined for an unknown link', () => {
    expect(resolveCard(catalog, { issuer: 'nope', bank: 'none', tier: 'gold' })).toBeUndefined();
    expect(resolveCard(catalog, { issuer: 'cal', bank: 'none', tier: 'nope' })).toBeUndefined();
    expect(resolveCard(catalog, { issuer: 'cal', bank: 'zzz', tier: 'gold' })).toBeUndefined();
    expect(resolveCard(catalog, { issuer: 'cal', bank: 'none', tier: 'gold', club: 'zzz' })).toBeUndefined();
    // b1 does not distribute max
    expect(resolveCard(catalog, { issuer: 'max', bank: 'b1', tier: 'std' })).toBeUndefined();
  });
});

describe('rateToday', () => {
  it('adds a prime margin exactly', () => {
    expect(rateToday(rate({ kind: 'prime', margin: '-0.4' }), '4.75', '3.25')).toBe('4.35');
  });
  it('adds a Bank of Israel margin', () => {
    expect(rateToday(rate({ kind: 'boi', margin: '3' }), '4.75', '3.25')).toBe('6.25');
  });
  it('returns a fixed rate as is', () => {
    expect(rateToday(rate({ kind: 'fixed', rate: '11.5' }), '4.75', '3.25')).toBe('11.5');
  });
  it('is undefined when the rate is not published', () => {
    expect(rateToday(rate(null), '4.75', '3.25')).toBeUndefined();
  });
});

describe('issuersAt, tiersOf, clubsOf', () => {
  it('filters card companies by bank', () => {
    expect(issuersAt(catalog, 'b1').map((i) => i.id)).toEqual(['cal']);
    expect(issuersAt(catalog, 'b2').map((i) => i.id)).toEqual(['cal', 'max']);
    expect(issuersAt(catalog, 'none').map((i) => i.id)).toEqual(['cal', 'max']);
    expect(issuersAt(catalog, 'unknown')).toEqual([]);
  });
  it('hides tiers and clubs no longer issued', () => {
    const cal = catalog.issuers[0]!;
    expect(tiersOf(cal).map((t) => t.id)).toEqual(['gold']);
    expect(clubsOf(cal).map((c) => c.id)).toEqual(['a']);
  });
});
