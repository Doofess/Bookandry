import { describe, expect, it } from 'vitest';

import { loadCatalog } from '@/data/card-catalog';
import { resolveCard, type ResolvedCard } from '@/data/card-catalog/resolve';
import type { CatalogRate, DealRule } from '@/data/card-catalog/types';
import { creditSchedule, longCreditPayments } from '@/lib/money';
import type { PaymentMethod } from '@/types/domain';
import type { LocalDate } from '@/types/money';

import { availableModes, dealKindOf, dealRate, dealRuleFor, dealSchedule, dealWarnings } from './deal-rules';

const src = { url: 'https://example.com/x', seen: '2026-10-01' as LocalDate };
const PRIME = { primeRate: '4.75', boiRate: '3.25' };

function rate(basis: CatalogRate['basis'], over: Partial<CatalogRate> = {}): CatalogRate {
  return {
    basis,
    quality: 'exact',
    compounding: 12,
    dayCount: '30/360',
    accrues: 'purchase',
    fixedAtPurchase: true,
    source: src,
    ...over,
  };
}

/** Max's קרדיט פלוס, as the catalog has it. */
const longCredit: DealRule = {
  kind: 'long_credit',
  label: { he: 'קרדיט פלוס', en: 'Credit Plus' },
  payments: { min: 19, max: 36 },
  minDealMinor: 95_000,
  minPaymentMinor: 5_000,
  abroad: false,
  source: src,
};

/** Max's חלוקת עסקה: ₪25 a payment, ₪50 from payment 19. */
const split: DealRule = {
  kind: 'split_purchase',
  label: { he: 'חלוקת עסקה', en: 'Split a purchase' },
  payments: { min: 3, max: 36 },
  minDealMinor: 7_500,
  minPaymentMinor: 2_500,
  minPaymentFrom: { payments: 19, minPaymentMinor: 5_000 },
  abroad: false,
  source: src,
};

const codes = (rule: DealRule, input: { amountMinor: number; payments: number; abroad: boolean }) =>
  dealWarnings(rule, input).map((w) => w.code);

describe('dealWarnings', () => {
  it('says nothing for a deal inside every rule', () => {
    expect(dealWarnings(longCredit, { amountMinor: 95_000, payments: 19, abroad: false })).toEqual([]);
  });

  it('warns under the minimum deal: ₪949.99 is under ₪950, ₪950 is not', () => {
    expect(dealWarnings(longCredit, { amountMinor: 94_999, payments: 18, abroad: false })).toContainEqual({
      code: 'min_deal',
      values: { min: 95_000 },
    });
    expect(codes(longCredit, { amountMinor: 95_000, payments: 19, abroad: false })).not.toContain('min_deal');
  });

  it('warns outside the payment range: 18 is under 19, 19 and 36 are in it, 37 is over', () => {
    const at = (payments: number) => codes(longCredit, { amountMinor: 1_000_000, payments, abroad: false });
    expect(dealWarnings(longCredit, { amountMinor: 1_000_000, payments: 18, abroad: false })).toEqual([
      { code: 'payments', values: { min: 19, max: 36 } },
    ]);
    expect(at(19)).toEqual([]);
    expect(at(36)).toEqual([]);
    expect(at(37)).toEqual(['payments']);
  });

  it('warns when a payment would be under the minimum payment', () => {
    // ₪950 over 19 is exactly ₪50 a payment; an agora less is not.
    expect(codes(longCredit, { amountMinor: 95_000, payments: 19, abroad: false })).toEqual([]);
    expect(dealWarnings(longCredit, { amountMinor: 189_999, payments: 38, abroad: false })).toContainEqual({
      code: 'min_payment',
      values: { min: 5_000 },
    });
  });

  it('applies the higher minimum payment from its number of payments up', () => {
    // ₪900 over 18 is ₪50 a payment: fine at ₪25. Over 19 it is ₪47.36: under ₪50.
    expect(codes(split, { amountMinor: 90_000, payments: 18, abroad: false })).toEqual([]);
    expect(dealWarnings(split, { amountMinor: 90_000, payments: 19, abroad: false })).toEqual([
      { code: 'min_payment', values: { min: 5_000 } },
    ]);
    // ₪99.99 over 4 is ₪24.99 and change.
    expect(dealWarnings(split, { amountMinor: 9_999, payments: 4, abroad: false })).toEqual([
      { code: 'min_payment', values: { min: 2_500 } },
    ]);
  });

  it('warns about a purchase abroad only where the deal is not offered abroad', () => {
    expect(codes(longCredit, { amountMinor: 95_000, payments: 19, abroad: true })).toEqual(['abroad']);
    expect(
      codes({ ...longCredit, abroad: true }, { amountMinor: 95_000, payments: 19, abroad: true }),
    ).toEqual([]);
  });

  it('lists every broken rule, in a fixed order', () => {
    expect(codes(longCredit, { amountMinor: 50_000, payments: 12, abroad: true })).toEqual([
      'min_deal',
      'min_payment',
      'payments',
      'abroad',
    ]);
  });

  it('checks nothing a deal does not state', () => {
    const regular: DealRule = {
      kind: 'regular',
      label: { he: 'רגילה', en: 'Regular' },
      abroad: true,
      source: src,
    };
    expect(dealWarnings(regular, { amountMinor: 1, payments: 1, abroad: true })).toEqual([]);
  });
});

function resolvedWith(kinds: DealRule['kind'][], over: Partial<DealRule> = {}): ResolvedCard {
  return {
    issuer: { id: 'max' } as ResolvedCard['issuer'],
    bank: undefined,
    tier: 'gold',
    billingDays: [2],
    foreignPosting: 'immediate',
    deals: kinds.map((kind) => ({
      kind,
      label: { he: `${kind}-he`, en: kind },
      abroad: true,
      source: src,
      ...over,
      from: 'issuer' as const,
    })),
    extra: {},
  };
}

describe('availableModes', () => {
  it('gives today’s modes for no card, or a card not linked to the catalog', () => {
    expect(availableModes(undefined, 'expense')).toEqual([
      'one_time',
      'installments',
      'credit',
      'standing_order',
      'loan',
    ]);
    expect(availableModes(undefined, 'income')).toEqual(['one_time', 'monthly', 'yearly']);
  });

  it('gives a linked card’s own deals, in the order רגילה, תשלומים, קרדיט, קרדיט פלוס, 30+', () => {
    const card = resolvedWith([
      'deferred',
      'split_purchase',
      'long_credit',
      'credit',
      'installments',
      'regular',
    ]);
    expect(availableModes(card, 'expense')).toEqual([
      'one_time',
      'installments',
      'credit',
      'long_credit',
      'deferred',
      'standing_order',
      'loan',
    ]);
  });

  it('leaves out what the card does not have', () => {
    expect(availableModes(resolvedWith(['regular', 'installments']), 'expense')).toEqual([
      'one_time',
      'installments',
      'standing_order',
      'loan',
    ]);
  });

  it('keeps income’s repeats whatever the card', () => {
    expect(availableModes(resolvedWith(['regular', 'long_credit']), 'income')).toEqual([
      'one_time',
      'monthly',
      'yearly',
    ]);
  });

  it('offers קרדיט פלוס on a Max card through Mizrahi', async () => {
    const card = resolveCard(await loadCatalog(), { issuer: 'max', bank: '20', tier: 'international' });
    expect(availableModes(card, 'expense')).toContain('long_credit');
    expect(dealRuleFor(card, 'long_credit')?.label.he).toBe('קרדיט פלוס');
  });
});

describe('dealKindOf and dealRuleFor', () => {
  it('maps the form’s modes to the catalog’s deal kinds', () => {
    expect(dealKindOf('one_time')).toBe('regular');
    expect(dealKindOf('installments')).toBe('installments');
    expect(dealKindOf('credit')).toBe('credit');
    expect(dealKindOf('long_credit')).toBe('long_credit');
    expect(dealKindOf('deferred')).toBe('deferred');
    expect(dealKindOf('loan')).toBeUndefined();
    expect(dealKindOf('standing_order')).toBeUndefined();
  });

  it('finds the card’s rule for a mode, and nothing without a link', () => {
    const card = resolvedWith(['regular', 'credit']);
    expect(dealRuleFor(card, 'credit')?.kind).toBe('credit');
    expect(dealRuleFor(card, 'long_credit')).toBeUndefined();
    expect(dealRuleFor(card, 'loan')).toBeUndefined();
    expect(dealRuleFor(undefined, 'credit')).toBeUndefined();
  });
});

function method(card: PaymentMethod['card'], over: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    id: 'pm1',
    profileId: 'p1',
    type: 'credit_card',
    label: 'Max',
    card,
    isArchived: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as PaymentMethod;
}

const LINK = { issuer: 'max', bank: 'none', tier: 'gold', version: 1 };

describe('dealRate', () => {
  it('keeps today’s rate for a card not linked: its קרדיט rate, and nothing else', () => {
    const plain = method({ creditPrimeMargin: '10' });
    expect(dealRate(plain, undefined, 'credit', PRIME)).toEqual({ rate: '14.75', missing: false });
    expect(dealRate(plain, undefined, 'installments', PRIME)).toEqual({ rate: '', missing: false });
    expect(dealRate(undefined, undefined, 'credit', PRIME)).toEqual({ rate: '', missing: false });
    // A link whose catalog has not loaded yet: today's behaviour until it does.
    expect(dealRate(method({ catalog: LINK, creditPrimeMargin: '9' }), undefined, 'credit', PRIME)).toEqual({
      rate: '13.75',
      missing: false,
    });
  });

  it('prices a linked card’s deal from the catalog, prime-based, fixed or on the Bank of Israel rate', () => {
    const linked = method({ catalog: LINK });
    const prime = resolvedWith(['long_credit'], { rate: rate({ kind: 'prime', margin: '10.75' }) });
    expect(dealRate(linked, prime, 'long_credit', PRIME)).toEqual({ rate: '15.5', missing: false });
    const fixed = resolvedWith(['deferred'], { rate: rate({ kind: 'fixed', rate: '12' }) });
    expect(dealRate(linked, fixed, 'deferred', PRIME)).toEqual({ rate: '12', missing: false });
    const boi = resolvedWith(['credit'], { rate: rate({ kind: 'boi', margin: '1' }) });
    expect(dealRate(linked, boi, 'credit', PRIME)).toEqual({ rate: '4.25', missing: false });
  });

  it('takes the person’s own rate for the card over the catalog’s', () => {
    const linked = method({ catalog: LINK, overrides: { long_credit: { basis: 'fixed', rate: '9.9' } } });
    const card = resolvedWith(['long_credit'], { rate: rate(null) });
    expect(dealRate(linked, card, 'long_credit', PRIME)).toEqual({ rate: '9.9', missing: false });
  });

  it('says the rate is missing when the catalog publishes none and the person has entered none', () => {
    const card = resolvedWith(['long_credit', 'credit'], { rate: rate(null) });
    expect(dealRate(method({ catalog: LINK }), card, 'long_credit', PRIME)).toEqual({
      rate: '',
      missing: true,
    });
  });

  it('asks for nothing on a deal without interest, or one the catalog gives no rate entry for', () => {
    const card = resolvedWith(['regular', 'installments', 'credit']);
    const linked = method({ catalog: LINK });
    expect(dealRate(linked, card, 'installments', PRIME)).toEqual({ rate: '', missing: false });
    expect(dealRate(linked, card, 'one_time', PRIME)).toEqual({ rate: '', missing: false });
    expect(dealRate(linked, card, 'loan', PRIME)).toEqual({ rate: '', missing: false });
    // No rate entry at all: the card's own fields, as cardDealRate reads them.
    expect(dealRate(method({ catalog: LINK, creditPrimeMargin: '8' }), card, 'credit', PRIME)).toEqual({
      rate: '12.75',
      missing: false,
    });
    expect(dealRate(linked, card, 'credit', PRIME)).toEqual({ rate: '', missing: false });
  });
});

describe('dealSchedule', () => {
  const base = {
    principalMinor: 300_000,
    rate: '15.5',
    count: 24,
    maxCount: 36,
    compounding: 12 as const,
    primeRate: '4.75',
  };

  it('gives each payment, the interest and the מתואמת rate', () => {
    const plan = creditSchedule(300_000, '15.5', 24);
    expect(dealSchedule(base)).toEqual({
      count: 24,
      paymentMinor: plan.paymentMinor,
      interestMinor: plan.interestMinor,
      effective: '16.65',
    });
    // A quarterly product's מתואמת figure is at m = 4.
    expect(dealSchedule({ ...base, compounding: 4 })?.effective).toBe('16.42');
  });

  it('adds the payments from the reset on, at today’s prime', () => {
    const plan = dealSchedule({ ...base, reset: { atPayment: 19 } });
    const exact = longCreditPayments(300_000, '15.5', 24, { atPayment: 19, rate: '15.5' });
    expect(plan?.reset).toEqual({ atPayment: 19, firstMinor: exact.first, afterMinor: exact.afterReset });
  });

  it('has no reset for a plan that ends before it', () => {
    expect(dealSchedule({ ...base, count: 18, reset: { atPayment: 19 } })).not.toHaveProperty('reset');
    expect(dealSchedule({ ...base, reset: { atPayment: 1 } })).not.toHaveProperty('reset');
  });

  it('is undefined while the plan is not complete', () => {
    expect(dealSchedule({ ...base, principalMinor: undefined })).toBeUndefined();
    expect(dealSchedule({ ...base, principalMinor: 0 })).toBeUndefined();
    expect(dealSchedule({ ...base, count: Number.NaN })).toBeUndefined();
    expect(dealSchedule({ ...base, count: 1 })).toBeUndefined();
    expect(dealSchedule({ ...base, count: 37 })).toBeUndefined();
  });
});
