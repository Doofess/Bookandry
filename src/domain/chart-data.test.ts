import { describe, expect, it } from 'vitest';

import { addDays, fromUtcInstant, toUtcInstant } from '@/lib/dates';
import { sum } from '@/lib/money';
import type { Occurrence } from '@/types/domain';
import type { Kind, Minor } from '@/types/money';

import {
  AGGREGATION_THRESHOLD,
  axisTicks,
  buildChartData,
  rangeWindow,
  shouldAggregate,
  symlogTicks,
  Z_AREA_RANGE,
} from './chart-data';
import { d, makeTx, MONEY } from './test-factories';

let serial = 0;

function occ(date: string, kind: Kind, amountMinor: Minor): Occurrence {
  serial += 1;
  const on = d(date);
  const transaction = makeTx({ id: `tx${String(serial)}`, kind, date: on, recurrence: { type: 'one_time' } });
  return {
    transaction,
    seriesId: transaction.id,
    date: on,
    originalDate: on,
    key: `${transaction.id}@${date}`,
    money: { ...MONEY, amountMinor, baseAmountMinor: amountMinor },
    categoryId: transaction.categoryId,
    isOverridden: false,
    isMoved: false,
    isSkipped: false,
    isProjected: false,
  };
}

/** N occurrences spread one per day from `start`, alternating kind. */
function spread(count: number, start: string): Occurrence[] {
  let date = d(start);
  const result: Occurrence[] = [];
  for (let i = 0; i < count; i += 1) {
    result.push(occ(date, i % 3 === 0 ? 'income' : 'expense', 1000 + i));
    date = addDays(date, 1);
  }
  return result;
}

const WINDOW = { from: d('2020-01-01'), to: d('2030-12-31'), openingMinor: 0 };

describe('the aggregation threshold', () => {
  /*
   * The exact boundary, because "roughly 1,500" is not a specification and the
   * mode flips the meaning of every point on the chart.
   */
  it('draws 1,499 rows individually', () => {
    expect(shouldAggregate(AGGREGATION_THRESHOLD - 1)).toBe(false);
    expect(buildChartData({ ...WINDOW, occurrences: spread(1499, '2021-01-01') }).aggregated).toBe(false);
  });

  it('still draws exactly 1,500 individually - the threshold is inclusive', () => {
    expect(shouldAggregate(AGGREGATION_THRESHOLD)).toBe(false);
    expect(buildChartData({ ...WINDOW, occurrences: spread(1500, '2021-01-01') }).aggregated).toBe(false);
  });

  it('aggregates at 1,501', () => {
    expect(shouldAggregate(AGGREGATION_THRESHOLD + 1)).toBe(true);
    expect(buildChartData({ ...WINDOW, occurrences: spread(1501, '2021-01-01') }).aggregated).toBe(true);
  });

  it('lets the caller force either mode', () => {
    const few = spread(10, '2026-01-01');
    expect(buildChartData({ ...WINDOW, occurrences: few, mode: 'aggregated' }).aggregated).toBe(true);
    expect(
      buildChartData({ ...WINDOW, occurrences: spread(1600, '2021-01-01'), mode: 'points' }).aggregated,
    ).toBe(false);
  });
});

describe('aggregation conserves the money', () => {
  const occurrences = spread(1501, '2021-01-01');
  const expanded = buildChartData({ ...WINDOW, occurrences, mode: 'points' });
  const rolled = buildChartData({ ...WINDOW, occurrences, mode: 'aggregated' });

  /*
   * The property the plan names outright. A second aggregating implementation
   * would have to agree with the first about the sign rule, the skip rule and
   * the rounding forever; one generator with a bucket key cannot disagree with
   * itself. This asserts that it in fact did not.
   */
  it('sums to the same total, point for point', () => {
    const total = (data: {
      income: readonly { signedMinor: Minor }[];
      expense: readonly { signedMinor: Minor }[];
    }) => sum([...data.income, ...data.expense].map((p) => p.signedMinor));

    expect(total(rolled)).toBe(total(expanded));
  });

  it('keeps income and expense separate, rather than netting the month', () => {
    // A month collapsed to ONE dot would have to net income against expense,
    // and a dot at -0 for a month with a salary and a rent payment is a lie
    // that looks like data.
    expect(rolled.income.every((p) => p.signedMinor > 0)).toBe(true);
    expect(rolled.expense.every((p) => p.signedMinor < 0)).toBe(true);
  });

  it('reports the same range summary either way', () => {
    expect(rolled.summary).toEqual(expanded.summary);
  });

  it('lands the balance line on the same closing figure', () => {
    expect(rolled.balance.at(-1)?.balanceMinor).toBe(expanded.balance.at(-1)?.balanceMinor);
  });

  it('counts every row it swallowed', () => {
    const counted = sum([...rolled.income, ...rolled.expense].map((p) => p.count));
    expect(counted).toBe(1501);
  });

  it('drops the occurrence link, because a month is not a row', () => {
    expect(rolled.expense.every((p) => p.occurrence === undefined)).toBe(true);
    expect(expanded.expense.every((p) => p.occurrence !== undefined)).toBe(true);
  });
});

describe('points', () => {
  it('signs expenses negative and income positive, from kind alone', () => {
    const data = buildChartData({
      ...WINDOW,
      occurrences: [occ('2026-03-04', 'expense', 4500), occ('2026-03-05', 'income', 900000)],
    });

    expect(data.expense[0]?.signedMinor).toBe(-4500);
    expect(data.income[0]?.signedMinor).toBe(900000);
  });

  it('keeps magnitude positive for the bubble scale', () => {
    const data = buildChartData({ ...WINDOW, occurrences: [occ('2026-03-04', 'expense', 4500)] });

    expect(data.expense[0]?.magnitudeMinor).toBe(4500);
  });

  it('excludes occurrences outside the window', () => {
    const data = buildChartData({
      from: d('2026-03-01'),
      to: d('2026-03-31'),
      openingMinor: 0,
      occurrences: [
        occ('2026-02-28', 'expense', 100),
        occ('2026-03-01', 'expense', 200),
        occ('2026-04-01', 'expense', 400),
      ],
    });

    expect(data.rows).toHaveLength(1);
    expect(data.expense[0]?.magnitudeMinor).toBe(200);
  });

  it('includes both window edges', () => {
    const data = buildChartData({
      from: d('2026-03-01'),
      to: d('2026-03-31'),
      openingMinor: 0,
      occurrences: [occ('2026-03-01', 'expense', 100), occ('2026-03-31', 'expense', 200)],
    });

    expect(data.rows).toHaveLength(2);
  });

  it('orders points by date, so the line and the dots agree', () => {
    const data = buildChartData({
      ...WINDOW,
      occurrences: [occ('2026-03-09', 'expense', 100), occ('2026-03-02', 'expense', 200)],
    });

    expect(data.expense.map((p) => p.date)).toEqual(['2026-03-02', '2026-03-09']);
  });
});

describe('the bubble scale', () => {
  it('clamps the giant outlier instead of collapsing everything else', () => {
    /*
     * 99 coffees and one rent payment. Scaling to the true maximum would put
     * every coffee on the floor radius - a whole dimension spent representing
     * one point faithfully.
     */
    const occurrences = [
      ...Array.from({ length: 99 }, (_, i) =>
        occ(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, 'expense', 1500),
      ),
      occ('2026-02-01', 'expense', 900000),
    ];

    const data = buildChartData({ ...WINDOW, occurrences, mode: 'points' });
    const rent = data.expense.find((p) => p.magnitudeMinor === 900000);

    expect(data.zDomain[1]).toBe(1500);
    expect(rent?.magnitudeMinor).toBe(900000);
    expect(rent?.z).toBe(1500);
  });

  it('keeps the true magnitude on the point, for the tooltip', () => {
    // The tooltip reports what was spent, not what was drawn. Clamping the
    // stored value too would make the chart quietly misreport the outlier.
    const data = buildChartData({
      ...WINDOW,
      occurrences: [occ('2026-01-01', 'expense', 7)],
      mode: 'points',
    });

    expect(data.expense[0]?.magnitudeMinor).toBe(7);
  });

  it('never hands Recharts a zero-width Z domain', () => {
    // An empty window would otherwise give [0, 0], which divides by zero inside
    // the scale and drops every future point off the chart.
    const data = buildChartData({ ...WINDOW, occurrences: [] });

    expect(data.zDomain[1]).toBeGreaterThan(0);
  });

  it('measures area, not radius', () => {
    // ZAxis `range` is px^2. The spec's [3, 10] would render radii of ~1-1.8px.
    const [low, high] = Z_AREA_RANGE;
    expect(Math.sqrt(low / Math.PI)).toBeCloseTo(3, 10);
    expect(Math.sqrt(high / Math.PI)).toBeCloseTo(10, 10);
  });
});

describe('the balance line', () => {
  it('starts from the balance before the window, not from zero', () => {
    const data = buildChartData({
      from: d('2026-03-01'),
      to: d('2026-03-31'),
      openingMinor: 500000,
      occurrences: [occ('2026-03-10', 'expense', 4500)],
    });

    expect(data.balance[0]?.balanceMinor).toBe(495500);
  });

  it('carries one point per day, after everything on that day', () => {
    const data = buildChartData({
      ...WINDOW,
      openingMinor: 0,
      occurrences: [
        occ('2026-03-10', 'expense', 1000),
        occ('2026-03-10', 'expense', 500),
        occ('2026-03-11', 'income', 4000),
      ],
    });

    expect(data.balance.map((p) => [p.date, p.balanceMinor])).toEqual([
      ['2026-03-10', -1500],
      ['2026-03-11', 2500],
    ]);
  });

  it('dates an aggregated bucket at its month end', () => {
    const data = buildChartData({
      from: d('2026-01-01'),
      to: d('2026-12-31'),
      openingMinor: 0,
      occurrences: [occ('2026-03-10', 'expense', 1000), occ('2026-04-02', 'expense', 1000)],
      mode: 'aggregated',
    });

    expect(data.balance.map((p) => p.date)).toEqual(['2026-03-31', '2026-04-30']);
  });

  it('never runs past the window, even mid-month', () => {
    // A line drawn to 31 March inside a window ending on the 15th is a balance
    // for days the chart does not cover.
    const data = buildChartData({
      from: d('2026-03-01'),
      to: d('2026-03-15'),
      openingMinor: 0,
      occurrences: [occ('2026-03-10', 'expense', 1000)],
      mode: 'aggregated',
    });

    expect(data.balance[0]?.date).toBe('2026-03-15');
  });

  it('stops at today, while the projected bills stay on the chart', () => {
    /*
     * The balance card above the chart excludes projections and says so. A line
     * that walked on through next week's rent would report a different balance
     * from the card, for the same month, on the same screen.
     */
    const data = buildChartData({
      from: d('2026-03-01'),
      to: d('2026-03-31'),
      openingMinor: 100000,
      lineThrough: d('2026-03-15'),
      occurrences: [occ('2026-03-10', 'expense', 1000), occ('2026-03-20', 'expense', 900000)],
    });

    expect(data.balance.map((p) => p.date)).toEqual(['2026-03-10']);
    expect(data.balance.at(-1)?.balanceMinor).toBe(99000);
    expect(data.expense).toHaveLength(2);
  });

  it('never lets lineThrough push the line past the window', () => {
    const data = buildChartData({
      from: d('2026-03-01'),
      to: d('2026-03-15'),
      openingMinor: 0,
      lineThrough: d('2026-12-31'),
      occurrences: [occ('2026-03-10', 'expense', 1000)],
      mode: 'aggregated',
    });

    expect(data.balance[0]?.date).toBe('2026-03-15');
  });

  it('rounds its axis to round numbers', () => {
    /*
     * Recharts ticks an explicit domain by dividing it evenly, so un-rounded
     * bounds give ticks like "$30.2K, $36.7K, $43.2K" - true, and useless,
     * because nobody reads a balance against a scale marked in 6.5s.
     */
    const data = buildChartData({
      from: d('2026-03-01'),
      to: d('2026-03-31'),
      openingMinor: 3_012_345,
      occurrences: [occ('2026-03-10', 'income', 2_500_000)],
    });

    expect(data.balanceDomain).toEqual([2_000_000, 6_000_000]);
    expect(data.balanceTicks).toEqual([2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000]);
  });

  it('shows where the balance started even when nothing happened', () => {
    const data = buildChartData({ ...WINDOW, occurrences: [], openingMinor: 250000 });

    expect(data.balance).toHaveLength(0);
    expect(data.balanceDomain[0]).toBeLessThan(250000);
    expect(data.balanceDomain[1]).toBeGreaterThan(250000);
  });
});

describe('the symlog axis', () => {
  it('ticks in powers of ten, with zero', () => {
    expect(symlogTicks([-100000, 100000])).toEqual([-100000, -10000, -1000, 0, 1000, 10000, 100000]);
  });

  it('caps the ticks per side, keeping the LARGEST', () => {
    /*
     * Every decade from one currency unit upward is eleven labels on a 260px
     * axis. The bottom few fall inside symlog's linear region, where they
     * crowd together and describe almost nothing - so the cap drops those,
     * not the ones at the ends that set the scale.
     */
    expect(symlogTicks([-10_000_000, 10_000_000])).toEqual([
      -10_000_000, -1_000_000, -100_000, 0, 100_000, 1_000_000, 10_000_000,
    ]);
  });

  it('keeps a round bound strictly OUTSIDE the data', () => {
    /*
     * A dot has a radius. A bound merely equal to the largest value centres
     * that dot on the frame and clips half of it away - and the amounts that
     * land exactly on a round bound are salaries, so the clipped dot would
     * reliably be the most important one on the chart.
     */
    const data = buildChartData({ ...WINDOW, occurrences: [occ('2026-01-01', 'income', 1_000_000)] });

    expect(data.amountDomain[1]).toBe(2_000_000);
  });

  it('does not round a rent up by a whole decade', () => {
    // Powers of ten alone would take a 2,000 rent to 10,000 and spend two
    // thirds of the axis on nothing.
    const data = buildChartData({ ...WINDOW, occurrences: [occ('2026-01-01', 'expense', 200_000)] });

    expect(data.amountDomain[0]).toBe(-500_000);
  });

  it('gives a one-sided domain one-sided ticks', () => {
    // An expense-only window wastes half the plot if the axis is symmetric.
    expect(symlogTicks([0, 1000])).toEqual([0, 100, 1000]);
  });

  it('encloses the data rather than cutting it off', () => {
    const data = buildChartData({ ...WINDOW, occurrences: [occ('2026-01-01', 'expense', 4500)] });

    expect(data.amountDomain[0]).toBe(-5000);
    expect(data.amountDomain[1]).toBe(0);
  });

  it('floors a tiny domain at one currency unit', () => {
    // A window whose largest row is 7 agorot would otherwise get a domain of
    // [-7, 0] and an axis with no readable tick on it at all.
    const data = buildChartData({ ...WINDOW, occurrences: [occ('2026-01-01', 'expense', 7)] });

    expect(data.amountDomain[0]).toBe(-200);
  });
});

describe('the range window', () => {
  const MARCH = d('2026-03-17');
  const EARLIEST = d('2019-06-04');

  it('ends at the end of the cursor month, whatever the range', () => {
    for (const range of ['1m', '3m', '6m', '1y', 'all'] as const) {
      expect(rangeWindow(range, MARCH, EARLIEST).to).toBe('2026-03-31');
    }
  });

  it('covers exactly the cursor month at 1m', () => {
    expect(rangeWindow('1m', MARCH, EARLIEST).from).toBe('2026-03-01');
  });

  it('counts the cursor month as one of the three', () => {
    // "3 months" ending in March is Jan-Mar, not Dec-Mar. Off by one here is
    // off by one on every figure under the chart.
    expect(rangeWindow('3m', MARCH, EARLIEST).from).toBe('2026-01-01');
  });

  it('crosses the year boundary', () => {
    expect(rangeWindow('6m', MARCH, EARLIEST).from).toBe('2025-10-01');
    expect(rangeWindow('1y', MARCH, EARLIEST).from).toBe('2025-04-01');
  });

  it('crosses it from January too', () => {
    expect(rangeWindow('3m', d('2026-01-09'), EARLIEST).from).toBe('2025-11-01');
    expect(rangeWindow('1y', d('2026-01-09'), EARLIEST).from).toBe('2025-02-01');
  });

  it('starts at the first thing that ever happened for "all"', () => {
    expect(rangeWindow('all', MARCH, EARLIEST).from).toBe('2019-06-04');
  });

  it('does not start "all" after it ends on a brand-new install', () => {
    // First run: the earliest date IS today, and a window whose start is after
    // its end renders an empty chart on the very first transaction.
    const window = rangeWindow('all', d('2026-03-17'), d('2026-09-15'));
    expect(window.from).toBe('2026-03-31');
    expect(window.from <= window.to).toBe(true);
  });
});

describe('the x axis ticks', () => {
  const asDates = (ticks: readonly number[]) => ticks.map((t) => fromUtcInstant(t));

  it('ticks weekly inside a single month', () => {
    // Monthly ticks over a 31-day window give ONE label, and an axis with one
    // label is a decoration.
    expect(asDates(axisTicks(d('2026-03-01'), d('2026-03-31')))).toEqual([
      '2026-03-01',
      '2026-03-08',
      '2026-03-15',
      '2026-03-22',
      '2026-03-29',
    ]);
  });

  it('ticks on month boundaries over a longer window', () => {
    expect(asDates(axisTicks(d('2026-01-01'), d('2026-06-30')))).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
    ]);
  });

  it('skips a first month the window only partly covers', () => {
    // "All" starts at an opening-balance date, so the window rarely begins on
    // the 1st - and a tick behind the axis start draws outside the plot.
    expect(asDates(axisTicks(d('2026-01-20'), d('2026-05-31')))[0]).toBe('2026-02-01');
  });

  it('thins by stepping, never by dropping the tail', () => {
    // An axis whose labels stop two thirds of the way across reads as broken.
    const ticks = asDates(axisTicks(d('2020-01-01'), d('2026-12-31')));

    expect(ticks.length).toBeLessThanOrEqual(7);
    expect(ticks[0]).toBe('2020-01-01');
    expect(ticks.at(-1)?.slice(0, 4)).toBe('2026');
  });

  it('still gives two ticks for a window narrower than a week', () => {
    expect(asDates(axisTicks(d('2026-03-10'), d('2026-03-12')))).toEqual(['2026-03-10']);
  });
});

describe('the table source', () => {
  it('is the same rows the chart drew, ascending', () => {
    // The visually-hidden table is the conformance path for the chart, so it
    // has to come from the same array. Two queries would eventually disagree.
    const data = buildChartData({
      ...WINDOW,
      occurrences: [occ('2026-03-09', 'expense', 100), occ('2026-03-02', 'income', 200)],
    });

    expect(data.rows.map((r) => r.date)).toEqual(['2026-03-02', '2026-03-09']);
    expect(data.summary.netMinor).toBe(100);
  });
});

describe('the time axis', () => {
  it('pads both ends, so an edge dot is not drawn on the frame', () => {
    // A transaction on the first day of the window would otherwise be centred
    // on the axis line, half of it over the Y-axis labels.
    const data = buildChartData({ ...WINDOW, from: d('2026-03-01'), to: d('2026-03-31'), occurrences: [] });

    expect(data.xDomain[0]).toBeLessThan(toUtcInstant(d('2026-03-01')));
    expect(data.xDomain[1]).toBeGreaterThan(toUtcInstant(d('2026-03-31')));
  });

  it('pads by a fraction of the span, so it stays the same few pixels', () => {
    const month = buildChartData({ ...WINDOW, from: d('2026-03-01'), to: d('2026-03-31'), occurrences: [] });
    const decade = buildChartData({ ...WINDOW, from: d('2016-01-01'), to: d('2026-03-31'), occurrences: [] });

    const padOf = (data: { xDomain: readonly [number, number] }, from: string) =>
      toUtcInstant(d(from)) - data.xDomain[0];

    expect(padOf(decade, '2016-01-01')).toBeGreaterThan(padOf(month, '2026-03-01'));
  });
});
