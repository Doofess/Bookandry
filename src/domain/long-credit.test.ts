import { describe, expect, it } from 'vitest';

import { longCreditPayments, presentValueMinor, spitzerPayment } from '@/lib/money';
import type { Recurrence, Transaction } from '@/types/domain';

import { followsPrimeFrom, nextReset } from './long-credit';
import { d, makeTx, MONEY } from './test-factories';

type Monthly = Extract<Recurrence, { type: 'monthly' }>;

// Max's קרדיט פלוס: ₪3,000 over 24 at 15.5%, bought at prime 6, re-priced at payment 19.
const payment = spitzerPayment(300_000, '15.5', 24);
const money = {
  ...MONEY,
  currency: 'ILS',
  baseCurrency: 'ILS',
  amountMinor: payment,
  baseAmountMinor: payment,
};
const plan = (reset: Monthly['reset'], over: Partial<Monthly> = {}, tx: Partial<Transaction> = {}) =>
  makeTx({
    id: 'tv',
    date: d('2026-01-05'),
    money,
    recurrence: {
      type: 'monthly',
      dayOfMonth: 5,
      installments: 24,
      plan: 'credit',
      creditAnnualRate: '15.5',
      ...(reset === undefined ? {} : { reset }),
      ...over,
    },
    ...tx,
  });
const fresh = { atPayment: 19, primeAtPurchase: '6' } as const;

// What the plan's own payments say it borrowed, and the payment from 19 at a rate.
const principal = presentValueMinor(Array<number>(24).fill(payment), '15.5');
const after = (rate: string) => longCreditPayments(principal, '15.5', 24, { atPayment: 19, rate }).afterReset;

describe('nextReset', () => {
  it('works from what the plan charges, which is what it borrowed to the agora or so', () => {
    expect(Math.abs(principal - 300_000)).toBeLessThan(15);
  });

  it('before payment 19 is due, re-prices it at prime today', () => {
    expect(nextReset(plan(fresh), '6.5', d('2027-07-04'))).toEqual({
      ...fresh,
      rate: '16',
      paymentMinor: after('16'),
    });
    // And again when prime moves on, still unfrozen.
    expect(
      nextReset(plan({ ...fresh, rate: '16', paymentMinor: after('16') }), '5.5', d('2027-07-04')),
    ).toEqual({ ...fresh, rate: '15', paymentMinor: after('15') });
  });

  it('on payment 19’s date and after it, freezes at the values worked out then', () => {
    for (const today of [d('2027-07-05'), d('2028-03-01')]) {
      expect(nextReset(plan(fresh), '6.5', today)).toEqual({
        ...fresh,
        rate: '16',
        paymentMinor: after('16'),
        frozen: true,
      });
    }
  });

  it('leaves a frozen plan alone, whatever prime does', () => {
    const frozen = { ...fresh, rate: '16', paymentMinor: after('16'), frozen: true } as const;
    expect(nextReset(plan(frozen), '9', d('2027-07-04'))).toBeUndefined();
    expect(nextReset(plan(frozen), '6.5', d('2028-01-01'))).toBeUndefined();
  });

  it('has nothing to write when nothing changed', () => {
    expect(nextReset(plan({ ...fresh, rate: '16', paymentMinor: after('16') }), '6.5', d('2027-07-04'))).toBe(
      undefined,
    );
  });

  it('touches no other row', () => {
    const today = d('2027-07-04');
    expect(nextReset(plan(undefined), '6.5', today)).toBeUndefined();
    expect(nextReset(plan(fresh, {}, { isDeleted: 1 }), '6.5', today)).toBeUndefined();
    expect(nextReset(plan(fresh, { creditAnnualRate: undefined }), '6.5', today)).toBeUndefined();
    expect(nextReset(plan(fresh, { installments: undefined }), '6.5', today)).toBeUndefined();
    expect(nextReset(plan({ ...fresh, atPayment: 25 }), '6.5', today)).toBeUndefined();
    expect(nextReset(plan({ ...fresh, primeAtPurchase: 'x' }), '6.5', today)).toBeUndefined();
    expect(nextReset(plan(fresh), 'x', today)).toBeUndefined();
    expect(nextReset(makeTx({ date: d('2026-01-05'), recurrence: { type: 'one_time' } }), '6.5', today)).toBe(
      undefined,
    );
  });
});

describe('followsPrimeFrom', () => {
  it('names the payment a plan still re-prices at, and nothing once it is frozen or never resets', () => {
    expect(followsPrimeFrom(plan(fresh).recurrence)).toBe(19);
    expect(followsPrimeFrom(plan({ ...fresh, frozen: true }).recurrence)).toBeUndefined();
    expect(followsPrimeFrom(plan(undefined).recurrence)).toBeUndefined();
    expect(followsPrimeFrom({ type: 'one_time' })).toBeUndefined();
  });
});
