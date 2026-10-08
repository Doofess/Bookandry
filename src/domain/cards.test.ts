import { describe, expect, it } from 'vitest';

import { endOfMonth, startOfMonth } from '@/lib/dates';
import { presentValueMinor } from '@/lib/money';
import {
  SHARED_OWNER,
  type CardDetails,
  type Occurrence,
  type PaymentMethod,
  type Transaction,
} from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import {
  billingDayOf,
  CARD_FEES_CATEGORY_ID,
  cardBills,
  cardCommitments,
  cardFeeFor,
  cardFeeOccurrences,
  cardCreditRate,
  chargeDate,
  deferredChargeDate,
  expiryStatus,
  fxFeeFor,
  householdCommitments,
  isCardFee,
  isExpiresMonth,
  limitUsedMinor,
  rateOf,
  settleDate,
  splitBySettlement,
} from './cards';
import { expandOccurrences } from './occurrences';
import { d, makeTx, MONEY } from './test-factories';

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

describe('the commitments on a card', () => {
  const visa = card();
  /** Every occurrence of `tx` through 2029: long enough for a loan to run out. */
  const whole = (tx: Transaction, amountMinor: number) =>
    expandOccurrences(tx, [], d('2026-01-01'), d('2029-12-31'), { today: TODAY }).map((o) => ({
      ...o,
      money: { ...o.money, amountMinor, baseAmountMinor: amountMinor },
    }));
  const plan = (
    id: string,
    date: string,
    recurrence: Partial<Extract<Transaction['recurrence'], { type: 'monthly' }>>,
  ) =>
    purchase(id, date, {
      recurrence: { type: 'monthly', dayOfMonth: Number(date.slice(8)), ...recurrence },
    });

  const list = [
    // Charged on 10 September: done.
    ...whole(purchase('aug', '2026-08-15'), 1_000),
    // On the bill of 10 October, and November's.
    ...whole(purchase('sept', '2026-09-15'), 5_000),
    ...whole(purchase('oct', '2026-10-02'), 3_000),
    // Not bought yet.
    ...whole(purchase('later', '2026-10-20'), 9_000),
    // A standing order: September's and October's are bought; the rest are not yet.
    ...whole(purchase('gym', '2026-08-01', { recurrence: { type: 'monthly', dayOfMonth: 1 } }), 20_000),
    // תשלומים: 3 × 100 from September, none charged yet.
    ...whole(plan('tv', '2026-09-20', { installments: 3 }), 10_000),
    // קרדיט: 6 × 207.06 at 12% from July; July's and August's are paid.
    ...whole(plan('sofa', '2026-07-05', { installments: 6, plan: 'credit', creditAnnualRate: '12' }), 20_706),
    // A loan on the card: 24 × 500 at 6%, from September.
    ...whole(plan('car', '2026-09-25', { installments: 24, plan: 'loan', creditAnnualRate: '6' }), 50_000),
    // Not this card's, not an expense, and a skipped payment: none of them count.
    ...whole(purchase('other', '2026-10-01', { paymentMethodId: 'amex' }), 7_000),
    ...whole(purchase('refund', '2026-10-01', { kind: 'income' }), 7_000),
    ...whole(purchase('skipped', '2026-10-01'), 7_000).map((o) => ({ ...o, isSkipped: true })),
  ];

  it('adds up what is bought and not yet billed, and every plan payment still to come', () => {
    const result = cardCommitments(list, visa, TODAY);
    // sept 5,000 + oct 3,000 + the gym's September and October.
    expect(result.purchasesMinor).toBe(48_000);
    expect(result.byPlan).toEqual({ installments: 30_000, credit: 4 * 20_706, loan: 24 * 50_000 });
    expect(result.totalMinor).toBe(48_000 + 30_000 + 4 * 20_706 + 24 * 50_000);
    // The same money the card holds against its limit.
    expect(result.totalMinor).toBe(limitUsedMinor(list, visa, TODAY));
  });

  it('says how much of the plans is interest, on each plan’s own rate', () => {
    const result = cardCommitments(list, visa, TODAY);
    const [tv, sofa, car] = result.plans;
    expect(tv).toMatchObject({
      seriesId: expect.stringContaining('tv'),
      plan: 'installments',
      remaining: 3,
      count: 3,
    });
    expect(tv?.interestMinor).toBe(0);
    expect(sofa).toMatchObject({ plan: 'credit', remaining: 4, count: 6, remainingMinor: 82_824 });
    // Four payments of 207.06 at 1% a month are ₪807.94 of principal; the rest is interest.
    expect(sofa?.interestMinor).toBe(82_824 - 80_794);
    expect(car).toMatchObject({ plan: 'loan', remaining: 24, count: 24 });
    expect(car?.interestMinor).toBe(
      24 * 50_000 -
        presentValueMinor(
          Array.from({ length: 24 }, () => 50_000),
          '6',
        ),
    );
    expect(result.interestMinor).toBe((sofa?.interestMinor ?? 0) + (car?.interestMinor ?? 0));
    // The one ending soonest first, with its next and last payment.
    expect(car?.next.date).toBe('2026-09-25');
    expect(car?.last.date).toBe('2028-08-25');
    expect(sofa?.next.date).toBe('2026-09-05');
  });

  it('on a card without a billing day, is only the plans’ payments still ahead', () => {
    const result = cardCommitments(list, card({}), TODAY);
    expect(result.purchasesMinor).toBe(0);
    // The tv's October and November; the sofa's October to December; the car's last 23.
    expect(result.byPlan).toEqual({ installments: 20_000, credit: 3 * 20_706, loan: 23 * 50_000 });
  });

  it('adds the household’s cards up', () => {
    const amex = card({ billingDay: 2 }, { id: 'amex', label: 'Amex' });
    const visaPart = cardCommitments(list, visa, TODAY);
    const amexPart = cardCommitments(list, amex, TODAY);
    // Amex: the 'other' purchase of 1 October, on the bill of 2 November.
    expect(amexPart.totalMinor).toBe(7_000);
    const both = householdCommitments([visaPart, amexPart]);
    expect(both.totalMinor).toBe(visaPart.totalMinor + 7_000);
    expect(both.purchasesMinor).toBe(48_000 + 7_000);
    expect(both.byPlan).toEqual(visaPart.byPlan);
    expect(both.interestMinor).toBe(visaPart.interestMinor);
    expect(both.plans.map((p) => p.plan)).toEqual(['installments', 'credit', 'loan']);
    expect(householdCommitments([]).totalMinor).toBe(0);
  });

  it('takes a plan without a rate, or written before plans had kinds, as interest-free תשלומים', () => {
    const old = cardCommitments(
      whole(plan('tv', '2026-10-20', { installments: 2, creditAnnualRate: 'x' }), 10_000),
      visa,
      TODAY,
    );
    expect(old.plans[0]).toMatchObject({ plan: 'installments', interestMinor: 0 });
    expect(cardCommitments([], visa, TODAY)).toEqual({
      totalMinor: 0,
      purchasesMinor: 0,
      byPlan: { installments: 0, credit: 0, loan: 0 },
      interestMinor: 0,
      plans: [],
    });
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

describe('the monthly card fee', () => {
  const feeCard = (over: Partial<CardDetails> = {}) =>
    card({
      billingDay: 10,
      monthlyFeeMinor: 1_490,
      feeSince: '2026-08',
      feeDiscount: { minSpendMinor: 300_000, percent: '100', until: '2026-12' },
      ...over,
    });
  const spend = (id: string, date: string, amount: number) => occurrences(purchase(id, date), amount);

  it('is waived in a month the card was used enough, and charged in full otherwise', () => {
    const list = [...spend('big', '2026-09-05', 300_000), ...spend('small', '2026-10-05', 1_000)];
    expect(cardFeeFor(feeCard(), d('2026-09-01'), list)).toEqual({
      feeMinor: 0,
      fullMinor: 1_490,
      spentMinor: 300_000,
      discount: { minSpendMinor: 300_000, percent: '100', earned: true },
    });
    expect(cardFeeFor(feeCard(), d('2026-10-01'), list)).toMatchObject({
      feeMinor: 1_490,
      spentMinor: 1_000,
    });
  });

  it('takes a partial discount, ends when the discount does, and starts when the fee was set', () => {
    const list = spend('big', '2026-09-05', 500_000);
    expect(
      cardFeeFor(feeCard({ feeDiscount: { minSpendMinor: 100_000, percent: '50' } }), d('2026-09-01'), list)
        ?.feeMinor,
    ).toBe(745);
    const ended = cardFeeFor(feeCard(), d('2027-01-01'), spend('jan', '2027-01-05', 500_000));
    expect(ended).toEqual({ feeMinor: 1_490, fullMinor: 1_490, spentMinor: 500_000 });
    expect(cardFeeFor(feeCard(), d('2026-07-01'), list)).toBeUndefined();
    expect(cardFeeFor(card({ billingDay: 10 }), d('2026-09-01'), list)).toBeUndefined();
    expect(cardFeeFor(feeCard({ feeSince: undefined }), d('2020-01-01'), [])).toMatchObject({
      feeMinor: 1_490,
    });
  });

  const fees = (over: Partial<Parameters<typeof cardFeeOccurrences>[0]> = {}) =>
    cardFeeOccurrences({
      cards: [feeCard()],
      occurrences: spend('big', '2026-09-05', 300_000),
      from: d('2026-07-01'),
      to: d('2026-11-30'),
      today: TODAY,
      baseCurrency: 'ILS',
      profileId: 'all',
      allProfiles: 'all',
      ...over,
    });

  it('is a line on the card at each month’s end, from the month it was set, and none when waived', () => {
    const list = fees();
    expect(list.map((o) => [o.date, o.money.baseAmountMinor, o.isProjected])).toEqual([
      ['2026-08-31', 1_490, false],
      ['2026-10-31', 1_490, true],
      ['2026-11-30', 1_490, true],
    ]);
    const [first] = list;
    expect(first).toMatchObject({ paymentMethodId: 'visa', categoryId: CARD_FEES_CATEGORY_ID, note: 'Visa' });
    expect(isCardFee(first!)).toBe(true);
    // It rides on the next month's bill like any purchase.
    expect(settleDate(first!, methods(feeCard()))).toBe('2026-09-10');
    expect(isCardFee(spend('big', '2026-09-05', 1)[0]!)).toBe(false);
  });

  it('is in a shekel base only, for its owner or the household, and never for a closed card', () => {
    expect(fees({ baseCurrency: 'USD' })).toEqual([]);
    expect(fees({ profileId: 'p1' })).toHaveLength(3);
    expect(fees({ profileId: 'p2' })).toEqual([]);
    expect(fees({ cards: [{ ...feeCard(), profileId: SHARED_OWNER }], profileId: 'p1' })).toEqual([]);
    expect(fees({ cards: [{ ...feeCard(), profileId: SHARED_OWNER }] })).toHaveLength(3);
    expect(fees({ cards: [{ ...feeCard(), isArchived: 1 }] })).toEqual([]);
    expect(fees({ cards: [card({ billingDay: 10 })] })).toEqual([]);
    // Only whole month-ends inside the window.
    expect(fees({ from: d('2026-08-31'), to: d('2026-09-15') }).map((o) => o.date)).toEqual(['2026-08-31']);
  });
});

describe('a 30+ purchase', () => {
  const visa = card();
  const later = (id: string, date: string) => purchase(id, date, { deferral: { rate: '15.5' } });

  it('is charged on the billing date after next', () => {
    expect(deferredChargeDate(d('2026-10-05'), 10)).toBe('2026-12-10');
    expect(deferredChargeDate(d('2026-12-20'), 31)).toBe('2027-02-28');
    // Bought on the billing day itself: that day's bill is the month before's, so this one is two months on.
    expect(chargeDate(d('2026-10-10'), 10)).toBe('2026-11-10');
    expect(deferredChargeDate(d('2026-10-10'), 10)).toBe('2026-12-10');
    const all = methods(visa);
    const [o] = occurrences(later('a', '2026-10-05'));
    expect(settleDate(o!, all)).toBe('2026-12-10');
    // Not on a card without a billing day: nothing to defer it to.
    expect(settleDate(o!, methods(card({})))).toBe('2026-10-05');
  });

  it('goes on that later bill, and holds the limit until then', () => {
    const list = [
      ...occurrences(later('tv', '2026-09-15'), 5_000),
      ...occurrences(purchase('a', '2026-09-03'), 1_000),
    ];
    expect(cardBills(list, visa).map((b) => [b.chargeDate, b.totalMinor])).toEqual([
      ['2026-11-10', 5_000],
      ['2026-10-10', 1_000],
    ]);
    // On the 12th of October September's bill is paid, but the 30+ purchase is not.
    expect(limitUsedMinor(list, visa, d('2026-10-12'))).toBe(5_000);
    expect(cardCommitments(list, visa, d('2026-10-12')).purchasesMinor).toBe(5_000);
  });

  it('leaves a purchase written before 30+ existed on its usual bill', () => {
    const [o] = occurrences(purchase('old', '2026-10-05'));
    expect(o!.transaction).not.toHaveProperty('deferral');
    expect(settleDate(o!, methods(visa))).toBe('2026-11-10');
  });
});

describe('a long credit that follows prime, on the card', () => {
  const money = {
    ...MONEY,
    currency: 'ILS',
    baseCurrency: 'ILS',
    amountMinor: 10_000,
    baseAmountMinor: 10_000,
  };
  const plan = (reset: NonNullable<Extract<Transaction['recurrence'], { type: 'monthly' }>['reset']>) =>
    purchase('tv', '2026-01-05', {
      money,
      recurrence: {
        type: 'monthly',
        dayOfMonth: 5,
        installments: 24,
        plan: 'credit',
        creditAnnualRate: '12',
        reset,
      },
    });
  const all = (tx: Transaction) =>
    expandOccurrences(tx, [], d('2026-01-01'), d('2029-12-31'), { today: TODAY });

  it('commits the re-priced payments, and takes each part’s interest at its own rate', () => {
    const tx = plan({ atPayment: 19, primeAtPurchase: '6', rate: '13', paymentMinor: 10_100 });
    const [found] = cardCommitments(all(tx), card(), TODAY).plans;
    // Payments 9 to 24 are still to be billed: ten at the plan's, six re-priced.
    expect(found).toMatchObject({ remaining: 16, remainingMinor: 10 * 10_000 + 6 * 10_100 });
    // Payments 19 on are what is owed at the reset, at the reset's rate; that
    // balance is owed with payment 18, at the plan's.
    const owed = presentValueMinor(Array<number>(6).fill(10_100), '13');
    const principal = presentValueMinor([...Array<number>(9).fill(10_000), 10_000 + owed], '12');
    expect(found?.interestMinor).toBe(10 * 10_000 + 6 * 10_100 - principal);
    // The bill each payment lands on carries it too.
    expect(cardBills(all(tx), card()).find((b) => b.chargeDate === '2027-08-10')?.totalMinor).toBe(10_100);
  });

  it('once only re-priced payments are left, discounts them at the reset’s rate alone', () => {
    const tx = plan({ atPayment: 2, primeAtPurchase: '6', rate: '13', paymentMinor: 10_100, frozen: true });
    const [found] = cardCommitments(all(tx), card(), TODAY).plans;
    expect(found?.interestMinor).toBe(16 * 10_100 - presentValueMinor(Array<number>(16).fill(10_100), '13'));
  });

  it('reads a plan whose reset is not priced yet as an ordinary קרדיט', () => {
    const tx = plan({ atPayment: 19, primeAtPurchase: '6' });
    const [found] = cardCommitments(all(tx), card(), TODAY).plans;
    expect(found?.remainingMinor).toBe(16 * 10_000);
    expect(found?.interestMinor).toBe(16 * 10_000 - presentValueMinor(Array<number>(16).fill(10_000), '12'));
  });
});
