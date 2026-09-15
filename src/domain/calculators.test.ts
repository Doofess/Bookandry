import { describe, expect, it } from 'vitest';

import type { Occurrence, Profile } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import {
  availableBalance,
  expectedMonthlyExpense,
  signedBaseAmount,
  splitInstallments,
  summariseRange,
  totalsByCategory,
} from './calculators';
import { expandOccurrences } from './occurrences';
import { d, makeTx, MONEY, skip } from './test-factories';

const TODAY = d('2026-09-15');
const ts = (s: string): IsoInstant => s as IsoInstant;

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Dana',
    avatar: 'fox',
    color: '#16794a',
    openingBalanceMinor: 100_000,
    openingBalanceCurrency: 'USD',
    openingBalanceDate: d('2026-01-01'),
    createdAt: ts('2026-01-01T00:00:00.000Z'),
    updatedAt: ts('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

function occ(over: {
  kind?: 'income' | 'expense';
  date: string;
  amount: number;
  categoryId?: string;
  profileId?: string;
}): Occurrence {
  const tx = makeTx({
    id: `tx-${over.date}-${String(over.amount)}`,
    date: d(over.date),
    recurrence: { type: 'one_time' },
    kind: over.kind ?? 'expense',
    categoryId: over.categoryId ?? 'cat.groceries',
    profileId: over.profileId ?? 'p1',
    money: { ...MONEY, amountMinor: over.amount, baseAmountMinor: over.amount },
  });
  return expandOccurrences(tx, [], d(over.date), d(over.date), { today: TODAY })[0]!;
}

describe('signedBaseAmount', () => {
  it('takes the sign from kind, never from the stored number', () => {
    expect(signedBaseAmount(occ({ kind: 'income', date: '2026-09-01', amount: 4500 }))).toBe(4500);
    expect(signedBaseAmount(occ({ kind: 'expense', date: '2026-09-01', amount: 4500 }))).toBe(-4500);
  });
});

describe('availableBalance', () => {
  it('is opening balance plus income minus expenses', () => {
    const result = availableBalance({
      profiles: [profile()],
      occurrences: [
        occ({ kind: 'income', date: '2026-09-01', amount: 500_000 }),
        occ({ kind: 'expense', date: '2026-09-02', amount: 120_000 }),
        occ({ kind: 'expense', date: '2026-09-03', amount: 30_000 }),
      ],
      baseCurrency: 'USD',
    });
    expect(result).toBe(100_000 + 500_000 - 120_000 - 30_000);
  });

  it('sums opening balances across ALL profiles', () => {
    // Without this the "All" figure is silently smaller than the sum of the
    // per-profile figures, and nothing in the UI explains why.
    const result = availableBalance({
      profiles: [
        profile({ id: 'p1', openingBalanceMinor: 100_000 }),
        profile({ id: 'p2', openingBalanceMinor: 250_000 }),
      ],
      occurrences: [],
      baseCurrency: 'USD',
    });
    expect(result).toBe(350_000);
  });

  it('converts an opening balance held in another currency', () => {
    const result = availableBalance({
      profiles: [profile({ openingBalanceMinor: 100_000, openingBalanceCurrency: 'ILS' })],
      occurrences: [],
      baseCurrency: 'USD',
      openingRates: { ILS: '0.3275037' },
    });
    expect(result).toBe(32_750);
  });

  it('refuses to guess when an opening-balance rate is missing', () => {
    // Silently treating 1000 ILS as 1000 USD is the class of error that makes a
    // headline figure confidently wrong.
    expect(() =>
      availableBalance({
        profiles: [profile({ openingBalanceCurrency: 'ILS' })],
        occurrences: [],
        baseCurrency: 'USD',
      }),
    ).toThrow(/No rate/);
  });

  it('is zero for a brand-new profile with no transactions', () => {
    expect(
      availableBalance({
        profiles: [profile({ openingBalanceMinor: 0 })],
        occurrences: [],
        baseCurrency: 'USD',
      }),
    ).toBe(0);
  });
});

describe('expectedMonthlyExpense', () => {
  const september = [
    occ({ date: '2026-09-01', amount: 500_000 }), // rent, already paid
    occ({ date: '2026-09-10', amount: 40_000 }), // groceries, paid
    occ({ date: '2026-09-15', amount: 12_000 }), // today
    occ({ date: '2026-09-28', amount: 80_000 }), // still due
    occ({ kind: 'income', date: '2026-09-05', amount: 1_800_000 }), // ignored
    occ({ date: '2026-08-31', amount: 99_999 }), // previous month
    occ({ date: '2026-10-01', amount: 99_999 }), // next month
  ];

  it('counts only expenses dated in the anchored month', () => {
    const r = expectedMonthlyExpense(september, TODAY);
    expect(r.total).toBe(500_000 + 40_000 + 12_000 + 80_000);
  });

  it('splits spentSoFar at today INCLUSIVE', () => {
    const r = expectedMonthlyExpense(september, TODAY);
    expect(r.spentSoFar).toBe(500_000 + 40_000 + 12_000);
    expect(r.remaining).toBe(80_000);
  });

  it('guarantees spentSoFar + remaining === total', () => {
    // Shares the today-inclusive boundary with isProjected by construction, so
    // the two can never disagree.
    const r = expectedMonthlyExpense(september, TODAY);
    expect(r.spentSoFar + r.remaining).toBe(r.total);
  });

  it('can be anchored at a PAST month, which is what the month cursor needs', () => {
    const r = expectedMonthlyExpense(september, TODAY, d('2026-08-15'));
    expect(r.total).toBe(99_999);
    // Every occurrence in a past month is already spent.
    expect(r.spentSoFar).toBe(99_999);
    expect(r.remaining).toBe(0);
  });

  it('excludes skipped occurrences, because a skipped bill is not expected', () => {
    const tx = makeTx({
      date: d('2026-09-05'),
      recurrence: { type: 'monthly', dayOfMonth: 5 },
      money: { ...MONEY, amountMinor: 60_000, baseAmountMinor: 60_000 },
    });
    const withSkip = expandOccurrences(tx, [skip('tx1', d('2026-09-05'))], d('2026-09-01'), d('2026-09-30'), {
      today: TODAY,
    });
    expect(expectedMonthlyExpense(withSkip, TODAY).total).toBe(0);
  });

  it('honours a series that ends mid-month, with no special case', () => {
    // Monthly on the 15th, ending Sept 10: contributes nothing this month.
    const endsBefore = makeTx({
      date: d('2026-01-15'),
      recurrence: { type: 'monthly', dayOfMonth: 15, endDate: d('2026-09-10') },
      money: { ...MONEY, amountMinor: 70_000, baseAmountMinor: 70_000 },
    });
    const occurrences = expandOccurrences(endsBefore, [], d('2026-09-01'), d('2026-09-30'), { today: TODAY });
    expect(expectedMonthlyExpense(occurrences, TODAY).total).toBe(0);

    // The same series ending Sept 20 does contribute once.
    const endsAfter = makeTx({
      date: d('2026-01-15'),
      recurrence: { type: 'monthly', dayOfMonth: 15, endDate: d('2026-09-20') },
      money: { ...MONEY, amountMinor: 70_000, baseAmountMinor: 70_000 },
    });
    const occurrences2 = expandOccurrences(endsAfter, [], d('2026-09-01'), d('2026-09-30'), { today: TODAY });
    expect(expectedMonthlyExpense(occurrences2, TODAY).total).toBe(70_000);
  });

  it('is zero for an empty month', () => {
    const r = expectedMonthlyExpense([], TODAY);
    expect(r).toEqual({ total: 0, spentSoFar: 0, remaining: 0 });
  });
});

describe('summariseRange and totalsByCategory', () => {
  const rows = [
    occ({ kind: 'income', date: '2026-09-01', amount: 1_800_000 }),
    occ({ date: '2026-09-02', amount: 500_000, categoryId: 'cat.rent' }),
    occ({ date: '2026-09-03', amount: 40_000, categoryId: 'cat.groceries' }),
    occ({ date: '2026-09-04', amount: 25_000, categoryId: 'cat.groceries' }),
  ];

  it('summarises income, expense and net', () => {
    expect(summariseRange(rows)).toEqual({
      incomeMinor: 1_800_000,
      expenseMinor: 565_000,
      netMinor: 1_235_000,
    });
  });

  it('ranks categories descending', () => {
    expect(totalsByCategory(rows, 'expense')).toEqual([
      { categoryId: 'cat.rent', totalMinor: 500_000 },
      { categoryId: 'cat.groceries', totalMinor: 65_000 },
    ]);
  });

  it('separates income from expense categories', () => {
    expect(totalsByCategory(rows, 'income')).toEqual([
      { categoryId: 'cat.groceries', totalMinor: 1_800_000 },
    ]);
  });
});

describe('splitInstallments (תשלומים)', () => {
  it('splits evenly when it divides exactly', () => {
    expect(splitInstallments(360_000, 12)).toEqual(Array.from({ length: 12 }, () => 30_000));
  });

  it('gives the remainder to the FIRST payment, per card-issuer convention', () => {
    // 1000.00 in 3 payments: 333.34 + 333.33 + 333.33
    expect(splitInstallments(100_000, 3)).toEqual([33_334, 33_333, 33_333]);
  });

  it('ALWAYS sums back to the exact total, because instalments are interest-free', () => {
    for (const total of [100_000, 99_999, 1, 7, 360_000, 123_457]) {
      for (const count of [2, 3, 6, 12, 36]) {
        const parts = splitInstallments(total, count);
        expect(parts).toHaveLength(count);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it('handles a single payment', () => {
    expect(splitInstallments(4500, 1)).toEqual([4500]);
  });

  it('preserves sign', () => {
    const parts = splitInstallments(-100_000, 3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-100_000);
  });

  it('rejects a nonsensical count', () => {
    expect(() => splitInstallments(1000, 0)).toThrow(RangeError);
    expect(() => splitInstallments(1000, -1)).toThrow(RangeError);
    expect(() => splitInstallments(1000, 1.5)).toThrow(RangeError);
  });
});
