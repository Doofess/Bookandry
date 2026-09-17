import { describe, expect, it } from 'vitest';

import { applyFeedFilters, flattenFeed } from '@/domain/feed';
import { defaultFilters } from '@/domain/feed-filters';
import { expandOccurrences } from '@/domain/occurrences';
import { endOfMonth, startOfMonth } from '@/lib/dates';
import type { Transaction } from '@/types/domain';
import type { LocalDate } from '@/types/money';

import { d, makeTx } from './test-factories';

/**
 * The performance claim, at the size it is actually claimed about.
 *
 * The README says 5,000 transactions across ten years of monthly series is
 * ~600,000 occurrence objects, and that the answer is to REFUSE to compute them
 * rather than to compute them faster. Everything else in the suite runs at a
 * few dozen rows, where that distinction cannot fail: a design that expanded
 * the entire history on every keystroke would pass every other test in this
 * repository and fall over on the first real decade of data.
 *
 * So this file works at the real number. It does not assert a frame rate - that
 * belongs to Playwright, and a wall-clock threshold in a unit suite is a flake
 * generator. It asserts the INVARIANT that makes the frame rate possible: the
 * cost of a month is a function of how many series exist, and not of how long
 * they have been running.
 */

const TRANSACTIONS = 5_000;
const TODAY = d('2026-09-17');
const WINDOW_MONTH = d('2026-09-01');

/** Ten years back, which is what makes the full expansion enormous. */
const SERIES_START = d('2016-09-01');

function monthlySeries(count: number): Transaction[] {
  const rows: Transaction[] = [];
  for (let i = 0; i < count; i += 1) {
    rows.push(
      makeTx({
        id: `tx${String(i)}`,
        // Spread across the month so the feed has real day groups, and across
        // kinds so the filters have something to reject.
        date: d(`2016-09-${String((i % 28) + 1).padStart(2, '0')}`),
        kind: i % 3 === 0 ? 'income' : 'expense',
        recurrence: { type: 'monthly', dayOfMonth: (i % 28) + 1 },
      }),
    );
  }
  return rows;
}

function expandOver(rows: readonly Transaction[], from: LocalDate, to: LocalDate) {
  return rows.flatMap((tx) => expandOccurrences(tx, [], from, to, { today: TODAY }));
}

describe('the feed at ten years and five thousand series', () => {
  const rows = monthlySeries(TRANSACTIONS);

  it('would be ~600,000 occurrences expanded whole, which is the premise', () => {
    /*
     * Measured on ONE series and multiplied, deliberately.
     *
     * Building the real 600,000 objects here would cost the very 90-150MB the
     * design exists to avoid, inside a test runner, to prove a number nobody
     * disputes. What matters is that the per-series figure is what the README
     * claims - if a decade of monthly recurrence stopped yielding ~120
     * occurrences, the premise would have quietly changed.
     */
    const one = expandOccurrences(rows[0]!, [], SERIES_START, d('2026-09-30'), {
      today: TODAY,
    });

    expect(one.length).toBeGreaterThan(115); // 10 years, monthly, inclusive
    expect(one.length * TRANSACTIONS).toBeGreaterThan(575_000);
  });

  it('expands ONE MONTH to one occurrence per series, not one per month lived', () => {
    /*
     * The whole design in one assertion.
     *
     * Every one of these 5,000 series started in 2016 and is still running, so
     * all 5,000 are candidates for September 2026 - layer A cannot narrow them.
     * What keeps the month cheap is that layer B is bounded by the WINDOW: the
     * result is one occurrence per monthly series, and it would be identical if
     * the series had started last year or in 1970.
     */
    const occurrences = expandOver(rows, startOfMonth(WINDOW_MONTH), endOfMonth(WINDOW_MONTH));

    expect(occurrences).toHaveLength(TRANSACTIONS);
  });

  it('costs a decade-old series no more than a brand-new one', () => {
    /*
     * A RATIO, not a threshold.
     *
     * The regression this exists for is an expander that walks forward from the
     * series start to the window - right answer, O(months lived) to get there.
     * It would make these series ~120x more expensive than identical ones
     * created this month, while every correctness test in the suite stayed
     * green. An absolute millisecond budget would flake on a loaded machine;
     * the two measurements here run back to back on the same one, and the bound
     * is an order of magnitude looser than the defect it catches.
     */
    const fresh = monthlySeries(TRANSACTIONS).map((tx) =>
      makeTx({ ...tx, date: d('2026-09-01'), recurrence: tx.recurrence }),
    );

    const from = startOfMonth(WINDOW_MONTH);
    const to = endOfMonth(WINDOW_MONTH);

    const time = (input: readonly Transaction[]): number => {
      expandOver(input, from, to); // warm, so neither set pays for the JIT
      const started = performance.now();
      for (let i = 0; i < 3; i += 1) expandOver(input, from, to);
      return performance.now() - started;
    };

    const decade = time(rows);
    const young = time(fresh);

    expect(expandOver(rows, from, to)).toHaveLength(TRANSACTIONS);
    expect(decade).toBeLessThan(Math.max(young, 1) * 10);
  });

  it('filters and groups the month without re-expanding anything', () => {
    /*
     * Layer C, at the size it runs at.
     *
     * Typing in the search box re-runs only this - it must not touch layer B,
     * and the proof it did not is that it operates on the array it was handed.
     * 5,000 occurrences is the realistic worst case for one month, and it is
     * also the number the plan caps layer C at ("<= 2k items" is the typical
     * month; this is four times that).
     */
    const occurrences = expandOver(rows, startOfMonth(WINDOW_MONTH), endOfMonth(WINDOW_MONTH));

    const filtered = applyFeedFilters(
      occurrences,
      { ...defaultFilters({ profileId: 'p1', today: TODAY }), kind: 'income' },
      { categoryName: () => 'Groceries', paymentMethodLabel: () => undefined },
    );

    // Every third series is income, and each contributes exactly one occurrence.
    expect(filtered).toHaveLength(Math.ceil(TRANSACTIONS / 3));
    // The input array is untouched: layer C never mutates what layer B memoised.
    expect(occurrences).toHaveLength(TRANSACTIONS);

    const feedRows = flattenFeed(filtered, { today: TODAY });
    // Day headers plus rows, so strictly more entries than occurrences.
    expect(feedRows.length).toBeGreaterThan(filtered.length);
  });
});
