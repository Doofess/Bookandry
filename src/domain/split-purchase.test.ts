import { describe, expect, it } from 'vitest';

import { loadCatalog } from '@/data/card-catalog';
import { resolveCard, type ResolvedCard } from '@/data/card-catalog/resolve';
import { requestDatePrincipal, spitzerPayment } from '@/lib/money';
import type { PaymentMethod, Transaction } from '@/types/domain';

import { chargeDate } from './cards';
import {
  isSplitCount,
  splitRate,
  splitRecurrence,
  splitRuleFor,
  splitSchedule,
  splitTiming,
} from './split-purchase';
import { d, makeTx, MONEY } from './test-factories';

const PRIME = { primeRate: '4.75', boiRate: '3.25' };

describe('splitTiming', () => {
  it('not billed yet: the purchase stays where it is, and its own bill is the first payment', () => {
    const timing = splitTiming(d('2026-09-20'), 10, d('2026-10-08'));
    expect(timing).toEqual({ planDate: '2026-09-20', firstCharge: '2026-10-10', billed: false });
    expect(chargeDate(timing.planDate, 10)).toBe(timing.firstCharge);
  });

  it('already billed: the first payment is the billing date after the next one', () => {
    // Billed on 10 October; the next bill is 10 November, so payments start on 10 December.
    const after = splitTiming(d('2026-09-02'), 10, d('2026-10-12'));
    expect(after).toEqual({ planDate: '2026-11-02', firstCharge: '2026-12-10', billed: true });
    expect(chargeDate(after.planDate, 10)).toBe(after.firstCharge);
    // Billed on 10 September, asked on 8 October: the next bill is 10 October, so 10 November.
    expect(splitTiming(d('2026-08-20'), 10, d('2026-10-08'))).toEqual({
      planDate: '2026-10-20',
      firstCharge: '2026-11-10',
      billed: true,
    });
    // Billed today counts as billed.
    expect(splitTiming(d('2026-09-02'), 10, d('2026-10-10')).firstCharge).toBe('2026-12-10');
  });

  it('keeps the purchase’s day, clamped to a shorter month', () => {
    expect(splitTiming(d('2026-08-31'), 2, d('2026-10-05'))).toEqual({
      planDate: '2026-11-30',
      firstCharge: '2026-12-02',
      billed: true,
    });
  });

  it('on a card without a billing day, keeps the purchase’s own date', () => {
    expect(splitTiming(d('2026-09-20'), undefined, d('2026-10-08'))).toEqual({
      planDate: '2026-09-20',
      billed: false,
    });
  });
});

describe('splitSchedule', () => {
  const base = {
    principalMinor: 300_000,
    rate: '12',
    count: 12,
    today: d('2026-10-08'),
    dayCount: '30/360',
    compounding: 12,
    primeRate: '4.75',
  } as const;

  it('a regular month from the request to the first payment is an ordinary Spitzer schedule', () => {
    const plan = splitSchedule({ ...base, firstCharge: d('2026-11-08') });
    const payment = spitzerPayment(300_000, '12', 12);
    expect(plan).toMatchObject({ count: 12, paymentMinor: payment, interestMinor: 12 * payment - 300_000 });
    expect(plan?.effective).toBe('12.68');
    // And so is a card that has no billing date to count to.
    expect(splitSchedule({ ...base, firstCharge: undefined })).toEqual(plan);
  });

  it('charges interest from the day of the split, not from the purchase', () => {
    // Two days to the first payment: less than a month's interest in it.
    const soon = splitSchedule({ ...base, firstCharge: d('2026-10-10') });
    const payment = spitzerPayment(requestDatePrincipal(300_000, '12', 2, 360), '12', 12);
    expect(soon).toMatchObject({ paymentMinor: payment, interestMinor: 12 * payment - 300_000 });
    // Two months and two days: more.
    const later = splitSchedule({ ...base, firstCharge: d('2026-12-10') });
    expect(later?.paymentMinor).toBe(spitzerPayment(requestDatePrincipal(300_000, '12', 62, 360), '12', 12));
    expect(soon!.interestMinor).toBeLessThan(later!.interestMinor);
    // Counted in actual days where the rate says so.
    expect(
      splitSchedule({ ...base, dayCount: 'actual/365', firstCharge: d('2026-12-10') })?.paymentMinor,
    ).toBe(spitzerPayment(requestDatePrincipal(300_000, '12', 63, 365), '12', 12));
  });

  it('where the deal follows prime, says what the payments from the reset come to', () => {
    const plan = splitSchedule({ ...base, count: 24, firstCharge: d('2026-11-08'), resetAt: 19 });
    expect(plan?.reset?.atPayment).toBe(19);
    expect(splitSchedule({ ...base, count: 18, firstCharge: d('2026-11-08'), resetAt: 19 })?.reset).toBe(
      undefined,
    );
  });

  it('is nothing until it is a plan', () => {
    expect(splitSchedule({ ...base, count: 1, firstCharge: undefined })).toBeUndefined();
    expect(splitSchedule({ ...base, principalMinor: 0, firstCharge: undefined })).toBeUndefined();
  });
});

function method(card: PaymentMethod['card'], over: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    id: 'max',
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

const LINK = { issuer: 'max', bank: '20', tier: 'international', version: 1 };

describe('splitRuleFor', () => {
  const ils = { ...MONEY, currency: 'ILS', baseCurrency: 'ILS' };
  const purchase = (over: Partial<Transaction> = {}) =>
    makeTx({
      date: d('2026-09-20'),
      recurrence: { type: 'one_time' },
      money: ils,
      paymentMethodId: 'max',
      ...over,
    });

  it('offers Max’s חלוקת עסקה on a saved purchase charged to a linked Max card', async () => {
    const resolved = resolveCard(await loadCatalog(), LINK);
    const rule = splitRuleFor(purchase(), method({ billingDay: 10, catalog: LINK }), resolved);
    expect(rule).toMatchObject({ kind: 'split_purchase', label: { he: 'חלוקת עסקה' } });
  });

  it('offers it on nothing else', async () => {
    const resolved = resolveCard(await loadCatalog(), LINK);
    const linked = method({ billingDay: 10, catalog: LINK });
    const monthly = { type: 'monthly', dayOfMonth: 20, installments: 3, plan: 'installments' } as const;
    expect(splitRuleFor(purchase({ recurrence: monthly }), linked, resolved)).toBeUndefined();
    expect(splitRuleFor(purchase({ kind: 'income' }), linked, resolved)).toBeUndefined();
    expect(splitRuleFor(purchase({ deferral: { rate: '12' } }), linked, resolved)).toBeUndefined();
    expect(splitRuleFor(purchase({ isDeleted: 1 }), linked, resolved)).toBeUndefined();
    // Not linked, or its catalog not loaded: nothing to split by.
    expect(splitRuleFor(purchase(), method({ billingDay: 10 }), resolved)).toBeUndefined();
    expect(splitRuleFor(purchase(), linked, undefined)).toBeUndefined();
    expect(splitRuleFor(purchase(), undefined, resolved)).toBeUndefined();
    // A card whose company has no such deal.
    const none: ResolvedCard = {
      ...resolved!,
      deals: resolved!.deals.filter((x) => x.kind !== 'split_purchase'),
    };
    expect(splitRuleFor(purchase(), linked, none)).toBeUndefined();
  });
});

describe('splitRate', () => {
  it('asks for the rate where nobody has published or entered it', async () => {
    const resolved = resolveCard(await loadCatalog(), LINK);
    expect(splitRate(method({ catalog: LINK }), resolved, PRIME)).toEqual({ rate: '', missing: true });
  });

  it('takes the person’s own rate for the card', async () => {
    const resolved = resolveCard(await loadCatalog(), LINK);
    const own = method({ catalog: LINK, overrides: { split_purchase: { basis: 'prime', margin: '9' } } });
    expect(splitRate(own, resolved, PRIME)).toEqual({ rate: '13.75', missing: false });
    expect(splitRate(undefined, resolved, PRIME)).toEqual({ rate: '', missing: true });
  });
});

describe('splitRecurrence', () => {
  it('is a קרדיט plan from the plan date, at the rate snapshotted', () => {
    expect(
      splitRecurrence({ planDate: d('2026-11-02'), count: 12, rate: '14.5', primeRate: '4.75' }),
    ).toEqual({
      type: 'monthly',
      dayOfMonth: 2,
      installments: 12,
      plan: 'credit',
      creditAnnualRate: '14.5',
    });
  });

  it('records prime today where the plan reaches the payment it re-prices at', () => {
    const plan = (count: number, rate = '14.5') =>
      splitRecurrence({ planDate: d('2026-09-20'), count, rate, resetAt: 19, primeRate: '4.75' });
    expect(plan(24)).toMatchObject({ reset: { atPayment: 19, primeAtPurchase: '4.75' } });
    expect(plan(18)).not.toHaveProperty('reset');
    expect(plan(24, '')).not.toHaveProperty('reset');
    expect(plan(24, '')).not.toHaveProperty('creditAnnualRate');
  });
});

describe('isSplitCount', () => {
  it('takes 2 to 60 whole payments', () => {
    expect([1, 2, 36, 60, 61, 2.5, Number.NaN].map(isSplitCount)).toEqual([
      false,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});
