import { describe, expect, it } from 'vitest';

import type { Override, Recurrence, Transaction } from '@/types/domain';
import type { MoneySnapshot } from '@/types/money';

import { listCommitments } from './commitments';
import { d, makeTx, modify, MONEY, skip } from './test-factories';

const TODAY = d('2026-09-15');

const ils = (amountMinor: number): MoneySnapshot => ({
  ...MONEY,
  amountMinor,
  baseAmountMinor: amountMinor,
  currency: 'ILS',
  baseCurrency: 'ILS',
  rateUsed: '1',
});

function series(
  id: string,
  recurrence: Recurrence,
  over: Partial<Transaction> = {},
  overrides: readonly Override[] = [],
): Transaction {
  return makeTx({ id, date: d('2026-03-10'), recurrence, money: ils(500_000), ...over }, overrides);
}

const run = (transactions: readonly Transaction[], overrides: readonly Override[] = []) =>
  listCommitments({ transactions, overrides, today: TODAY });

describe('what counts as a commitment', () => {
  it('ignores one-time transactions', () => {
    // They are things that happened, not things you are signed up for.
    const result = run([series('once', { type: 'one_time' })]);

    expect(result.commitments).toEqual([]);
  });

  it('ignores soft-deleted series', () => {
    const deleted = series('rent', { type: 'monthly', dayOfMonth: 10 }, { isDeleted: 1 });

    expect(run([deleted]).commitments).toEqual([]);
  });

  it('ignores a series whose last occurrence is behind us', () => {
    // Finished, not committed - it just has not been tidied away.
    const done = series('gym', { type: 'monthly', dayOfMonth: 10, endDate: d('2026-06-10') });

    expect(run([done]).commitments).toEqual([]);
  });

  it('keeps an open-ended series', () => {
    const rent = series('rent', { type: 'monthly', dayOfMonth: 10 });

    expect(run([rent]).commitments).toHaveLength(1);
  });
});

describe('the next payment', () => {
  it('is the first occurrence at or after today', () => {
    const rent = series('rent', { type: 'monthly', dayOfMonth: 10 });

    expect(run([rent]).commitments[0]?.next?.date).toBe('2026-10-10');
  });

  it('includes an occurrence falling exactly today', () => {
    // Today's occurrence is not projected and has not passed.
    const rent = series('rent', { type: 'monthly', dayOfMonth: 15 });

    expect(run([rent]).commitments[0]?.next?.date).toBe('2026-09-15');
  });

  it('SKIPS a skipped occurrence rather than promising it', () => {
    /*
     * Unlike the feed, which shows skipped rows ghosted. "What am I signed up
     * for" means the next payment that will actually happen; a month the user
     * has already cancelled is a date they would wait for in vain.
     */
    const rent = series('rent', { type: 'monthly', dayOfMonth: 10 });
    const overrides = [skip('rent', d('2026-10-10'))];

    expect(run([rent], overrides).commitments[0]?.next?.date).toBe('2026-11-10');
  });

  it('finds a yearly bill up to a year out', () => {
    const insurance = series('ins', { type: 'yearly', month: 3, day: 1 });

    expect(run([insurance]).commitments[0]?.next?.date).toBe('2027-03-01');
  });
});

describe('monthly equivalent', () => {
  it('is face value for a monthly bill', () => {
    const rent = series('rent', { type: 'monthly', dayOfMonth: 10 });

    expect(run([rent]).commitments[0]?.monthlyEquivalentMinor).toBe(500_000);
  });

  it('divides a yearly premium by twelve', () => {
    // The only way a 6,000 yearly premium is comparable with a 500 monthly one.
    const insurance = series('ins', { type: 'yearly', month: 3, day: 1 }, { money: ils(600_000) });

    expect(run([insurance]).commitments[0]?.monthlyEquivalentMinor).toBe(50_000);
  });

  it('rounds the division once, half away from zero', () => {
    const odd = series('odd', { type: 'yearly', month: 3, day: 1 }, { money: ils(100_000) });

    expect(run([odd]).commitments[0]?.monthlyEquivalentMinor).toBe(8333);
  });

  it('uses the NEXT occurrence, so a per-occurrence edit is what shows', () => {
    // Otherwise the list reports the series figure - the number the user has
    // already corrected for the month they are looking at.
    const rent = series('rent', { type: 'monthly', dayOfMonth: 10 });
    const overrides = [modify('rent', d('2026-10-10'), { money: ils(520_000) })];

    expect(run([rent], overrides).commitments[0]?.monthlyEquivalentMinor).toBe(520_000);
  });
});

describe('instalment plans', () => {
  const plan = (count: number) =>
    series('tv', { type: 'monthly', dayOfMonth: 10, installments: count }, { money: ils(33_333) });

  it('counts the payments still to come, including the next', () => {
    // Bought in March, 12 payments, now mid-September: March through September
    // have gone, so six remain.
    expect(run([plan(12)]).commitments[0]?.remaining).toBe(6);
  });

  it('ends after exactly N payments, whether or not an end date was written', () => {
    expect(run([plan(12)]).commitments[0]?.endsOn).toBe('2027-02-10');
  });

  it('drops out once the last payment has passed', () => {
    expect(run([plan(3)]).commitments).toEqual([]);
  });

  it('never reports a negative remaining count', () => {
    expect(run([plan(1)]).commitments[0]?.remaining ?? 0).toBeGreaterThanOrEqual(0);
  });
});

describe('ordering and totals', () => {
  it('sorts by next payment, then by size', () => {
    /*
     * The question is "what is coming". Sorting by amount buries a rent payment
     * due tomorrow under a yearly premium due in November.
     */
    const soon = series('soon', { type: 'monthly', dayOfMonth: 16 }, { money: ils(10_000) });
    const later = series('later', { type: 'monthly', dayOfMonth: 28 }, { money: ils(900_000) });

    expect(run([later, soon]).commitments.map((c) => c.transaction.id)).toEqual(['soon', 'later']);
  });

  it('breaks a date tie with the larger amount first', () => {
    const big = series('big', { type: 'monthly', dayOfMonth: 20 }, { money: ils(900_000) });
    const small = series('small', { type: 'monthly', dayOfMonth: 20 }, { money: ils(10_000) });

    expect(run([small, big]).commitments.map((c) => c.transaction.id)).toEqual(['big', 'small']);
  });

  it('totals expenses and income separately', () => {
    const rent = series('rent', { type: 'monthly', dayOfMonth: 10 }, { money: ils(500_000) });
    const salary = series(
      'salary',
      { type: 'monthly', dayOfMonth: 1 },
      { money: ils(1_800_000), kind: 'income' },
    );
    const insurance = series('ins', { type: 'yearly', month: 3, day: 1 }, { money: ils(600_000) });

    const result = run([rent, salary, insurance]);

    expect(result.monthlyExpenseMinor).toBe(550_000);
    expect(result.monthlyIncomeMinor).toBe(1_800_000);
  });

  it('totals in the BASE currency, so mixed currencies are comparable', () => {
    // A list mixing 45 EUR with 3,900 ILS ranks by neither figure.
    const euro = series(
      'eur',
      { type: 'monthly', dayOfMonth: 10 },
      {
        money: {
          ...MONEY,
          amountMinor: 4500,
          currency: 'EUR',
          baseCurrency: 'ILS',
          baseAmountMinor: 17_840,
          rateUsed: '3.9644',
        },
      },
    );

    expect(run([euro]).monthlyExpenseMinor).toBe(17_840);
  });
});
