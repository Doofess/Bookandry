import { useMemo } from 'react';

import {
  balanceBreakdown,
  forecastBreakdown,
  type BalanceBreakdown,
  type ForecastBreakdown,
} from '@/domain/breakdown';
import type { ExpenseGroup } from '@/domain/calculators';

import type { BalanceState } from './use-balance';

/**
 * The one place the breakdowns are worked out. The feed passes the result to
 * the pop-outs under the figures AND to the full sheets, so nothing is
 * computed twice and the two views can never disagree.
 */
export function useBreakdowns(
  balance: BalanceState,
  groups: readonly ExpenseGroup[],
): { readonly balance: BalanceBreakdown | undefined; readonly forecast: ForecastBreakdown } {
  const parts = balance.status === 'ready' ? balance.parts : undefined;
  const balanceView = useMemo(() => (parts === undefined ? undefined : balanceBreakdown(parts)), [parts]);
  const forecast = useMemo(() => forecastBreakdown(groups), [groups]);
  return { balance: balanceView, forecast };
}
