import { compareLocal, endOfMonth, startOfMonth } from '@/lib/dates';
import { convertMinor, sum } from '@/lib/money';
import type { Occurrence, Profile } from '@/types/domain';
import type { Currency, LocalDate, Minor, RateString } from '@/types/money';

/**
 * The two headline figures.
 *
 * Every ambiguity the spec left open is pinned here rather than being decided
 * differently at each call site.
 */

/** Signed contribution of one occurrence, in the base currency. */
export function signedBaseAmount(occurrence: Occurrence): Minor {
  const amount = occurrence.money.baseAmountMinor;
  return occurrence.transaction.kind === 'income' ? amount : -amount;
}

export type BalanceInput = {
  /** Exactly the profiles in scope: one, or all of them. */
  readonly profiles: readonly Profile[];
  /** Expanded over [min(openingBalanceDate) .. today], cutoffs already applied. */
  readonly occurrences: readonly Occurrence[];
  readonly baseCurrency: Currency;
  /** Rate per profile opening-balance currency, keyed by currency code. */
  readonly openingRates?: Readonly<Record<string, RateString>>;
};

/**
 * Available balance ("Balance" / יתרה in the UI).
 *
 * Renamed from the spec's "Disposable income": that phrase means "what is left
 * after essentials, per month", whereas this is a cumulative balance since the
 * opening date. The spec's own Hebrew (יתרה פנויה, literally "available
 * balance") already made the correction; the English had not.
 *
 * Pinned decisions:
 *  - "All" DOES sum every in-scope profile's opening balance. Without this the
 *    "All" figure is silently less than the sum of the per-profile figures.
 *  - Each profile's openingBalanceDate applies only to its own occurrences.
 *  - Projected occurrences are excluded BY CONSTRUCTION (the caller's window
 *    ends at today), so there is no isProjected check here. One boundary rule,
 *    enforced in one place.
 *  - Skipped and soft-deleted rows are already excluded upstream; this trusts
 *    that rather than re-filtering.
 */
export function availableBalance(input: BalanceInput): Minor {
  const opening = input.profiles.map((p) => {
    if (p.openingBalanceCurrency === input.baseCurrency) return p.openingBalanceMinor;
    const rate = input.openingRates?.[p.openingBalanceCurrency];
    if (rate === undefined) {
      throw new Error(
        `No rate for opening balance of profile ${p.id} (${p.openingBalanceCurrency} -> ${input.baseCurrency}).`,
      );
    }
    return convertMinor(p.openingBalanceMinor, p.openingBalanceCurrency, input.baseCurrency, rate);
  });

  return sum([...opening, ...input.occurrences.map(signedBaseAmount)]);
}

export type MonthlyExpenseResult = {
  readonly total: Minor;
  readonly spentSoFar: Minor;
  readonly remaining: Minor;
};

/**
 * Expected monthly expense for the month containing `monthAnchor`.
 *
 * The spec described this as three enumerated sources (monthly recurring +
 * yearly falling this month + one-time this month). That is a DESCRIPTION of
 * what the window produces, not an implementation: writing three branches
 * guarantees they drift. It is exactly one predicate.
 *
 * Pinned decisions:
 *  - Skipped occurrences are EXCLUDED. "Expected" means what you expect to pay,
 *    and a skipped bill is not expected. (Handled upstream by expandOccurrences;
 *    not re-filtered here.)
 *  - A series whose endDate falls mid-month contributes only if its slot is on
 *    or before that end. This falls out of the window automatically - there is
 *    deliberately no special case for it.
 *  - `spentSoFar` splits at today INCLUSIVE, sharing its boundary verbatim with
 *    isProjected, so spentSoFar + remaining === total holds by construction.
 *  - Opening balances are NOT involved: this is a cash-flow figure, not a balance.
 */
export function expectedMonthlyExpense(
  occurrences: readonly Occurrence[],
  today: LocalDate,
  monthAnchor: LocalDate = today,
): MonthlyExpenseResult {
  const from = startOfMonth(monthAnchor);
  const to = endOfMonth(monthAnchor);

  const expenses = occurrences.filter(
    (o) =>
      o.transaction.kind === 'expense' && compareLocal(o.date, from) >= 0 && compareLocal(o.date, to) <= 0,
  );

  const total = sum(expenses.map((o) => o.money.baseAmountMinor));
  const spentSoFar = sum(
    expenses.filter((o) => compareLocal(o.date, today) <= 0).map((o) => o.money.baseAmountMinor),
  );

  return { total, spentSoFar, remaining: total - spentSoFar };
}

export type CategoryTotal = { readonly categoryId: string; readonly totalMinor: Minor };

/** Totals by category for a range, descending. Used by the chart's stat cards. */
export function totalsByCategory(
  occurrences: readonly Occurrence[],
  kind: 'income' | 'expense',
): CategoryTotal[] {
  const totals = new Map<string, number>();
  for (const o of occurrences) {
    if (o.transaction.kind !== kind) continue;
    totals.set(o.categoryId, (totals.get(o.categoryId) ?? 0) + o.money.baseAmountMinor);
  }
  return [...totals.entries()]
    .map(([categoryId, totalMinor]) => ({ categoryId, totalMinor }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
}

export type RangeSummary = {
  readonly incomeMinor: Minor;
  readonly expenseMinor: Minor;
  readonly netMinor: Minor;
};

/** Income, expense and net over a set of occurrences. */
export function summariseRange(occurrences: readonly Occurrence[]): RangeSummary {
  const incomeMinor = sum(
    occurrences.filter((o) => o.transaction.kind === 'income').map((o) => o.money.baseAmountMinor),
  );
  const expenseMinor = sum(
    occurrences.filter((o) => o.transaction.kind === 'expense').map((o) => o.money.baseAmountMinor),
  );
  return { incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor };
}

/**
 * Split an interest-free instalment total (תשלומים) into exactly N payments.
 *
 * Israeli card instalments are interest-free, so the payments must sum to the
 * original total EXACTLY. Dividing and rounding each payment independently
 * loses or gains agorot; the FIRST payment absorbs the remainder, which is the
 * card-issuer convention.
 */
export function splitInstallments(totalMinor: Minor, count: number): Minor[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`Instalment count must be a positive integer, got ${String(count)}`);
  }
  if (!Number.isSafeInteger(totalMinor)) throw new RangeError('totalMinor must be a safe integer');

  const sign = totalMinor < 0 ? -1 : 1;
  const magnitude = Math.abs(totalMinor);
  const base = Math.floor(magnitude / count);
  const remainder = magnitude - base * count;

  return Array.from({ length: count }, (_, i) => sign * (base + (i === 0 ? remainder : 0)));
}
