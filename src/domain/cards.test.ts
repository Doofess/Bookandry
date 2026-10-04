import { describe, expect, it } from 'vitest';

import { endOfMonth, startOfMonth } from '@/lib/dates';
import type { CardDetails, Occurrence, PaymentMethod, Transaction } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import {
  billingDayOf,
  cardBills,
  cardCreditRate,
  chargeDate,
  expiryStatus,
  fxFeeFor,
  isExpiresMonth,
  limitUsedMinor,
  rateOf,
  settleDate,
  splitBySettlement,
} from './cards';
import { expandOccurrences } from './occurrences';
import { d, makeTx } from './test-factories';

const NOW = '2026-01-01T00:00:00.000Z' as IsoInstant;
const TODAY = d('2026-10-04');

const card = (
  details: CardDetails = { billingDay: 10 },
  over: Partial<PaymentMethod> = {},
): PaymentMethod => ({
  id: 'visa',
  profileId: 'p1',
  type: 'credit_card',
  label: 'Visa',
  card: details,
  isArchived: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const methods = (...list: PaymentMethod[]) => new Map(list.map((m) => [m.id, m]));

/** Every occurrence of `tx` from August through the end of next year. */
function occurrences(tx: Transaction, amountMinor = 10_000): Occurrence[] {
  return expandOccurrences(tx, [], d('2026-01-01'), d('2027-12-31'), { today: TODAY }).map((o) => ({
    ...o,
    money: { ...o.money, amountMinor, baseAmountMinor: amountMinor },
  }));
}

const purchase = (id: string, date: string, over: Partial<Transaction> = {}) =>
  makeTx({ id, date: d(date), recurrence: { type: 'one_time' }, paymentMethodId: 'visa', ...over });

describe('the billing day', () => {
  it('is a credit card’s own, and a real day of the month', () => {
    expect(billingDayOf(card())).toBe(10);
    expect(billingDayOf(card({}))).toBeUndefined();
    expect(billingDayOf(card({ billingDay: 32 }))).toBeUndefined();
    expect(billingDayOf(card({ billingDay: 10 }, { type: 'debit_card' }))).toBeUndefined();
    expect(billingDayOf(undefined)).toBeUndefined();
  });

  it('charges a month’s purchases together, on that day of the next month', () => {
    expect(chargeDate(d('2026-10-01'), 10)).toBe('2026-11-10');
    expect(chargeDate(d('2026-10-31'), 2)).toBe('2026-11-02');
    expect(chargeDate(d('2026-12-20'), 15)).toBe('2027-01-15');
    // A day February does not have lands on its last.
    expect(chargeDate(d('2027-01-05'), 31)).toBe('2027-02-28');
  });

  it('moves only what a billing card paid for', () => {
    const all = methods(
      card(),
      card({}, { id: 'old' }),
      card({ billingDay: 10 }, { id: 'debit', type: 'debit_card' }),
    );
    expect(settleDate({ date: d('2026-10-05'), paymentMethodId: 'visa' }, all)).toBe('2026-11-10');
    expect(settleDate({ date: d('2026-10-05'), paymentMethodId: 'old' }, all)).toBe('2026-10-05');
    expect(settleDate({ date: d('2026-10-05'), paymentMethodId: 'debit' }, all)).toBe('2026-10-05');
    expect(settleDate({ date: d('2026-10-05'), paymentMethodId: undefined }, all)).toBe('2026-10-05');
    expect(settleDate({ date: d('2026-10-05'), paymentMethodId: 'gone' }, all)).toBe('2026-10-05');
  });
});

describe('a card’s rates', () => {
  it('reads prime plus a margin against prime today, or a fixed rate', () => {
    expect(rateOf({ basis: 'prime', margin: '3.5' }, '4.75')).toBe('8.25');
    expect(rateOf({ basis: 'prime', margin: '-0.5' }, '4.75')).toBe('4.25');
    expect(rateOf({ basis: 'fixed', rate: '12' }, '4.75')).toBe('12');
    expect(rateOf({ basis: 'prime', margin: 'x' }, '4.75')).toBeUndefined();
    expect(rateOf({ basis: 'prime', margin: '1' }, '')).toBeUndefined();
  });

  it('prices קרדיט at prime plus the card’s margin, else its fixed rate', () => {
    expect(cardCreditRate(card({ creditPrimeMargin: '3.5' }, { creditAnnualRate: '12' }), '4.75')).toBe(
      '8.25',
    );
    expect(cardCreditRate(card({}, { creditAnnualRate: '12' }), '4.75')).toBe('12');
    expect(cardCreditRate(card({}), '4.75')).toBe('');
    expect(cardCreditRate(card({ creditPrimeMargin: 'x' }), '4.75')).toBe('');
    expect(cardCreditRate(undefined, '4.75')).toBe('');
  });

  it('charges its foreign-currency fee off the shekel only', () => {
    const visa = card({ fxFeeRate: '2.5' });
    expect(fxFeeFor(visa, 'USD')).toBe('2.5');
    expect(fxFeeFor(visa, 'ILS')).toBeUndefined();
    expect(fxFeeFor(card({ fxFeeRate: '0' }), 'USD')).toBeUndefined();
    expect(fxFeeFor(card({ fxFeeRate: 'lots' }), 'USD')).toBeUndefined();
    expect(fxFeeFor(card({}), 'USD')).toBeUndefined();
    expect(fxFeeFor(card({ fxFeeRate: '2.5' }, { type: 'debit_card' }), 'USD')).toBeUndefined();
    expect(fxFeeFor(undefined, 'USD')).toBeUndefined();
  });
});

describe('a card’s bills', () => {
  const visa = card();

  it('collects each month into the next month’s bill, newest first, without what was skipped', () => {
    const list = [
      ...occurrences(purchase('a', '2026-09-03'), 5_000),
      ...occurrences(purchase('b', '2026-09-28'), 2_000),
      ...occurrences(purchase('c', '2026-10-02'), 1_000),
      ...occurrences(purchase('cash', '2026-10-02', { paymentMethodId: 'pm.cash' })),
      { ...occurrences(purchase('skipped', '2026-10-03'))[0]!, isSkipped: true },
      ...occurrences(
        makeTx({
          id: 'pay',
          kind: 'income',
          date: d('2026-10-01'),
          recurrence: { type: 'one_time' },
          paymentMethodId: 'visa',
        }),
      ),
    ];
    const bills = cardBills(list, visa);
    expect(
      bills.map((b) => [b.chargeDate, b.month, b.totalMinor, b.occurrences.map((o) => o.seriesId)]),
    ).toEqual([
      ['2026-11-10', '2026-10-01', 1_000, ['c']],
      ['2026-10-10', '2026-09-01', 7_000, ['b', 'a']],
    ]);
  });

  it('puts each instalment on its own month’s bill', () => {
    const plan = purchase('tv', '2026-09-20', {
      recurrence: { type: 'monthly', dayOfMonth: 20, installments: 3 },
    });
    expect(cardBills(occurrences(plan), visa).map((b) => b.chargeDate)).toEqual([
      '2026-12-10',
      '2026-11-10',
      '2026-10-10',
    ]);
  });

  it('has none without a billing day', () => {
    expect(cardBills(occurrences(purchase('a', '2026-09-03')), card({}))).toEqual([]);
  });
});

describe('the credit limit', () => {
  const visa = card();

  it('holds what is bought and not yet charged, and a whole plan from the day it was bought', () => {
    const list = [
      // Charged on 10 September: paid off.
      ...occurrences(purchase('aug', '2026-08-15'), 1_000),
      // September's: on the bill of 10 October, still to come on the 4th.
      ...occurrences(purchase('sept', '2026-09-15'), 5_000),
      // Bought this month: on November's bill.
      ...occurrences(purchase('oct', '2026-10-02'), 3_000),
      // Not bought yet.
      ...occurrences(purchase('later', '2026-10-20'), 9_000),
      // Three payments of 100 bought in September: none charged yet, all held.
      ...occurrences(
        purchase('tv', '2026-09-20', { recurrence: { type: 'monthly', dayOfMonth: 20, installments: 3 } }),
        10_000,
      ),
      // A standing order: September's and October's payments are held; its
      // future months are not purchases yet.
      ...occurrences(
        purchase('gym', '2026-08-01', { recurrence: { type: 'monthly', dayOfMonth: 1 } }),
        20_000,
      ),
    ];
    // sept 5,000 + oct 3,000 + tv 3 × 10,000 + gym 2 × 20,000.
    expect(limitUsedMinor(list, visa, TODAY)).toBe(78_000);
    // After the 10th, September's bill has been paid.
    // oct 3,000 + tv 2 × 10,000 + gym's October 20,000.
    expect(limitUsedMinor(list, visa, d('2026-10-12'))).toBe(43_000);
    expect(limitUsedMinor(list, card({}), TODAY)).toBe(0);
  });
});

describe('expiry', () => {
  it('warns in the last two months, and after', () => {
    expect(expiryStatus('2026-09', TODAY)).toBe('expired');
    expect(expiryStatus('2026-10', TODAY)).toBe('soon');
    expect(expiryStatus('2026-11', TODAY)).toBe('soon');
    expect(expiryStatus('2026-12', TODAY)).toBe('valid');
    expect(expiryStatus(undefined, TODAY)).toBeUndefined();
    expect(expiryStatus('soon', TODAY)).toBeUndefined();
  });

  it('is a printed month and year', () => {
    expect(isExpiresMonth('2028-09')).toBe(true);
    for (const bad of ['2028-13', '2028-00', '1999-01', '2101-01', '2028-9', '09/28']) {
      expect(isExpiresMonth(bad), bad).toBe(false);
    }
  });
});

describe('the balance, by when money leaves the account', () => {
  const all = methods(card());
  const today: LocalDate = d('2026-10-04');
  const window = (tx: Transaction) =>
    expandOccurrences(tx, [], startOfMonth(d('2026-08-01')), endOfMonth(today), { today });

  it('counts a card purchase on its bill, and holds back what is still to be charged', () => {
    const list = [
      ...window(purchase('sept', '2026-09-15')),
      ...window(purchase('oct', '2026-10-02')),
      ...window(purchase('cash', '2026-10-02', { paymentMethodId: undefined })),
    ];
    const { settled, pendingOnCards } = splitBySettlement(list, all, today, new Map());
    expect(settled.map((o) => o.seriesId)).toEqual(['cash']);
    expect(pendingOnCards.map((o) => o.seriesId)).toEqual(['sept', 'oct']);

    // After the 10th, September's purchases have been charged.
    const later = splitBySettlement(list, all, d('2026-10-12'), new Map());
    expect(later.settled.map((o) => o.seriesId)).toEqual(['sept', 'cash']);
  });

  it('applies the opening date to the day the money left, and leaves out skips', () => {
    const list = [
      ...window(purchase('aug', '2026-08-20')),
      { ...window(purchase('skipped', '2026-08-21'))[0]!, isSkipped: true },
      ...window(purchase('before', '2026-08-30', { paymentMethodId: undefined })),
    ];
    // Opened on 1 September: an August card purchase is charged on 10
    // September, after it, so it counts; an August cash one does not.
    const { settled } = splitBySettlement(list, all, today, new Map([['p1', d('2026-09-01')]]));
    expect(settled.map((o) => o.seriesId)).toEqual(['aug']);
  });
});
