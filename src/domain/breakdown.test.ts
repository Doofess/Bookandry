import { describe, expect, it } from 'vitest';

import { balanceBreakdown, forecastBreakdown } from './breakdown';
import type { ExpenseGroup } from './calculators';

const group = (kind: ExpenseGroup['kind'], totalMinor: number): ExpenseGroup => ({
  kind,
  totalMinor,
  occurrences: [],
});

describe('balanceBreakdown', () => {
  it('lists income and expenses (no opening line), the total, and apart from them what cards owe', () => {
    const view = balanceBreakdown({
      openingMinor: 100_000,
      incomeMinor: 50_000,
      expenseMinor: 30_000,
      cardPendingMinor: 4_500,
    });

    expect(view.lines).toEqual([
      { key: 'income', minor: 50_000 },
      { key: 'expense', minor: -30_000 },
    ]);
    // Pending card spending is not in the balance yet: said apart, as an amount, not a minus.
    expect(view.totalMinor).toBe(120_000);
    expect(view.pendingOnCardsMinor).toBe(4_500);
  });

  it('has nothing pending on cards when nothing is', () => {
    expect(
      balanceBreakdown({ openingMinor: 0, incomeMinor: 0, expenseMinor: 0 }).pendingOnCardsMinor,
    ).toBeUndefined();
    expect(
      balanceBreakdown({ openingMinor: 0, incomeMinor: 0, expenseMinor: 0, cardPendingMinor: 0 })
        .pendingOnCardsMinor,
    ).toBeUndefined();
  });
});

describe('forecastBreakdown', () => {
  it('keeps the four largest groups, counts the rest, and totals them all', () => {
    const groups = [
      group('recurring', 500),
      group('loans', 900),
      group('installments', 100),
      group('yearly', 700),
      group('one_time', 300),
    ];
    const view = forecastBreakdown(groups);

    expect(view.top.map((g) => g.kind)).toEqual(['loans', 'yearly', 'recurring', 'one_time']);
    expect(view.moreCount).toBe(1);
    expect(view.totalMinor).toBe(2_500);
    // The sheet still sees every group, in their own order.
    expect(view.groups).toBe(groups);
  });

  it('has nothing more when there are four or fewer', () => {
    expect(forecastBreakdown([group('recurring', 1)]).moreCount).toBe(0);
    expect(forecastBreakdown([]).totalMinor).toBe(0);
  });
});
