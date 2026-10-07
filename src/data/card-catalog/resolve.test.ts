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

  it('keeps the card company values where the bank has none', () => {
    const r = resolveCard(catalog, { issuer: 'cal', bank: 'b2', tier: 'gold' });
    expect(r?.fxFee).toBe('2.5');
    expect(r?.billingDays).toEqual([2, 10]);
    expect(r?.deals.find((d) => d.kind === 'credit')?.rate).toBe(issuerCredit);
  });

  it('still resolves a tier that is no longer issued, and a known club', () => {
    expect(resolveCard(catalog, { issuer: 'cal', bank: 'none', tier: 'old' })).toBeDefined();
    expect(resolveCard(catalog, { issuer: 'cal', bank: 'none', tier: 'gold', club: 'b' })).toBeDefined();
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
