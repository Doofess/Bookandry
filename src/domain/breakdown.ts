import { sum } from '@/lib/money';
import type { Minor } from '@/types/money';

import type { BalanceParts, ExpenseGroup } from './calculators';

/**
 * What the balance and the forecast are made of, worked out ONCE for both the
 * small pop-out under each figure and the full sheet behind it.
 */

export type BalanceLine = {
  readonly key: 'income' | 'expense' | 'cardPending';
  readonly minor: Minor;
};
export type BalanceBreakdown = { readonly lines: readonly BalanceLine[]; readonly totalMinor: Minor };

/**
 * The starting balance is part of the total but is not listed (user ruling):
 * the total is still the balance the panel shows.
 */
export function balanceBreakdown(parts: BalanceParts): BalanceBreakdown {
  const lines: BalanceLine[] = [
    { key: 'income', minor: parts.incomeMinor },
    { key: 'expense', minor: -parts.expenseMinor },
  ];
  // Bought, and not yet taken: said, so the balance is not read as having missed it.
  if (parts.cardPendingMinor !== undefined && parts.cardPendingMinor !== 0) {
    lines.push({ key: 'cardPending', minor: -parts.cardPendingMinor });
  }
  return { lines, totalMinor: parts.openingMinor + parts.incomeMinor - parts.expenseMinor };
}

export type ForecastBreakdown = {
  /** Every group, in the order the sheet lists them. */
  readonly groups: readonly ExpenseGroup[];
  /** The largest few, for the pop-out. */
  readonly top: readonly ExpenseGroup[];
  readonly moreCount: number;
  readonly totalMinor: Minor;
};

export function forecastBreakdown(groups: readonly ExpenseGroup[], topCount = 4): ForecastBreakdown {
  const largest = [...groups].sort((a, b) => b.totalMinor - a.totalMinor);
  return {
    groups,
    top: largest.slice(0, topCount),
    moreCount: Math.max(0, largest.length - topCount),
    totalMinor: sum(groups.map((g) => g.totalMinor)),
  };
}
