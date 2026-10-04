import {
  addDays,
  addMonthsClamped,
  daysBetween,
  endOfMonth,
  isWithin,
  minDate,
  startOfMonth,
  toUtcInstant,
} from '@/lib/dates';
import { sum } from '@/lib/money';
import type { Occurrence } from '@/types/domain';
import type { Kind, LocalDate, Minor } from '@/types/money';

import { signedBaseAmount, summariseRange, type RangeSummary } from './calculators';

/**
 * Everything the chart draws, computed once, purely.
 *
 * The chart component does no arithmetic: it receives points, domains and ticks
 * and hands them to Recharts. That split is what makes a scatter plot testable
 * at all - Recharts renders through an SVG layout engine that jsdom cannot
 * measure, so anything computed inside the component is verified by nobody.
 */

/**
 * Above this many occurrences, one dot per row stops being a chart.
 *
 * Not a performance limit - 5,000 SVG circles render acceptably. It is a
 * LEGIBILITY limit: past roughly this density the dots merge into a band and
 * the reader loses both the individual points and the shape. The threshold is
 * exclusive, so exactly 1,500 rows still draw individually.
 */
export const AGGREGATION_THRESHOLD = 1500;

/**
 * The 98th percentile of magnitude bounds the bubble-size scale.
 *
 * One rent payment is two orders of magnitude above a coffee. Scaling to the
 * true maximum collapses every ordinary purchase onto the floor radius, which
 * throws away the dimension entirely to represent a single outlier faithfully.
 */
export const MAGNITUDE_PERCENTILE = 0.98;

/**
 * ZAxis `range` is an AREA in px^2, not a radius.
 *
 * The spec's [3, 10] yields radii of ~1-1.8px - invisible dots that look like a
 * rendering bug. These are the areas of 3px and 10px circles, which also gives
 * perceptually correct sqrt scaling for free (area, not radius, is what the eye
 * reads as quantity).
 */
export const Z_AREA_RANGE: readonly [number, number] = [
  Math.PI * 9,
  Math.PI * 100, // money-allow: pi*r^2 for r = 10px. Pixels, not minor units.
];

/**
 * The radius of the largest bubble, in px, derived from the area above.
 *
 * The plot's top margin must clear it. A dot is positioned by its CENTRE, so
 * the biggest income of the window - drawn near the top of the axis by
 * definition - loses its upper half to the edge of the SVG unless the margin
 * leaves room for it. Derived rather than typed as a number, because the two
 * would drift apart the first time the size range is tuned.
 */
export const MAX_DOT_RADIUS = Math.ceil(Math.sqrt(Z_AREA_RANGE[1] / Math.PI));

/**
 * symlog's linear-to-log crossover, in MINOR units.
 *
 * d3's default constant of 1 means "one agora", which puts the entire linear
 * region below a hundredth of a shekel and makes the scale indistinguishable
 * from a plain log. 50 minor units - half a currency unit - keeps small
 * purchases readable while still compressing the rent.
 */
export const SYMLOG_CONSTANT = 50;

export type ChartRange = '1m' | '3m' | '6m' | '1y' | 'all';

export const CHART_RANGES: readonly ChartRange[] = ['1m', '3m', '6m', '1y', 'all'];

/** Points are drawn individually, or collapsed to one per month per kind. */
export type ChartMode = 'auto' | 'points' | 'aggregated';

export type ChartPoint = {
  readonly key: string;
  /** X axis: UTC midnight of the date, so the axis never shifts per viewer. */
  readonly t: number;
  readonly date: LocalDate;
  readonly kind: Kind;
  /** Left Y axis. Expenses are NEGATIVE - the sign comes from `kind`, once. */
  readonly signedMinor: Minor;
  /** Always positive. The true size, before the percentile clamp. */
  readonly magnitudeMinor: Minor;
  /** What the bubble scale sees: magnitude clamped into the Z domain. */
  readonly z: number;
  /** 1 for a real occurrence, N for an aggregated month. */
  readonly count: number;
  /**
   * The row behind the dot, for the tooltip and for tap-to-open.
   *
   * Absent when aggregated: a month of groceries has no single occurrence to
   * open, and inventing one (the largest, the first) would make tapping the
   * chart do something different from what the dot represents.
   */
  readonly occurrence?: Occurrence;
};

export type BalancePoint = {
  readonly t: number;
  readonly date: LocalDate;
  /** Running balance AFTER everything on this date. Right-hand Y axis. */
  readonly balanceMinor: Minor;
};

export type ChartInput = {
  readonly occurrences: readonly Occurrence[];
  /**
   * What the balance LINE is drawn from, when that differs from the dots:
   * occurrences re-dated to the day the money left the account (a card
   * purchase on its bill). Absent: the dots themselves.
   */
  readonly balanceOccurrences?: readonly Occurrence[];
  readonly from: LocalDate;
  readonly to: LocalDate;
  /**
   * The balance immediately BEFORE `from`, in base minor units.
   *
   * The chart window is rarely the whole history, so the line has to start
   * somewhere. Passing it in keeps this function pure and keeps the line
   * continuous when the month cursor moves.
   */
  readonly openingMinor: Minor;
  /**
   * The last date the balance line is drawn through. Callers pass `today`.
   *
   * Projected occurrences ARE drawn as dots - they are bills that exist, and
   * hiding them would make the current month look emptier than it is - but they
   * must not move the line. The balance card excludes projections by
   * construction and labels them "Not counted yet"; a line running past today
   * would report a different balance from the card directly above it, for the
   * same month, on the same screen.
   *
   * Defaults to `to`, which is the right answer for any window in the past.
   */
  readonly lineThrough?: LocalDate;
  readonly mode?: ChartMode;
};

export type ChartData = {
  readonly aggregated: boolean;
  readonly income: readonly ChartPoint[];
  readonly expense: readonly ChartPoint[];
  readonly balance: readonly BalancePoint[];
  /** Left Y axis (symlog), in minor units, already widened to a tick. */
  readonly amountDomain: readonly [number, number];
  readonly amountTicks: readonly number[];
  /** Right Y axis (linear), in minor units. */
  readonly balanceDomain: readonly [number, number];
  readonly balanceTicks: readonly number[];
  readonly zDomain: readonly [number, number];
  readonly xDomain: readonly [number, number];
  readonly summary: RangeSummary;
  /** Every occurrence in the window, ascending - the "View as table" source. */
  readonly rows: readonly Occurrence[];
};

/**
 * The date window for a range, anchored on the month cursor.
 *
 * Every range ENDS at the end of the cursor month. The cursor is the right edge
 * of the chart, so stepping it back slides the whole window rather than
 * changing what "3 months" means. A range that ignored the cursor would leave
 * the header reporting one month while the chart showed another - the exact
 * self-contradiction the month cursor was added to remove.
 */
export function rangeWindow(
  range: ChartRange,
  monthAnchor: LocalDate,
  earliest: LocalDate,
): { readonly from: LocalDate; readonly to: LocalDate } {
  const to = endOfMonth(monthAnchor);
  if (range === 'all') return { from: minDate(earliest, to), to };

  const months = range === '1m' ? 1 : range === '3m' ? 3 : range === '6m' ? 6 : 12;
  const start = startOfMonth(monthAnchor);
  const { year, month } = splitMonth(start);

  // Months are 1-based, so subtracting (months - 1) can cross a year boundary.
  const zeroBased = year * 12 + (month - 1) - (months - 1);
  const from = monthStart(Math.floor(zeroBased / 12), (zeroBased % 12) + 1);

  return { from, to };
}

function splitMonth(date: LocalDate): { year: number; month: number } {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

function monthStart(year: number, month: number): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01` as LocalDate;
}

/**
 * X-axis ticks: weekly inside a month, monthly beyond it.
 *
 * Left to generate its own ticks on a numeric (millisecond) axis, Recharts
 * picks round NUMBERS, which are not round dates - the labels land on the 7th,
 * the 21st and the 4th of the next month, and a reader tries to work out what
 * those have in common. Dates are ticked on date boundaries or not at all.
 */
export function axisTicks(from: LocalDate, to: LocalDate, max = 7): number[] {
  const dates: LocalDate[] = [];

  if (daysBetween(from, to) <= 45) {
    for (let cursor = from; cursor <= to; cursor = addDays(cursor, 7)) dates.push(cursor);
  } else {
    // The window rarely starts on the 1st ("all" starts at an opening balance
    // date), so the first month's start is usually behind `from`.
    let cursor = startOfMonth(from);
    if (cursor < from) cursor = addMonthsClamped(cursor, 1, 1);
    for (; cursor <= to; cursor = addMonthsClamped(cursor, 1, 1)) dates.push(cursor);
  }

  if (dates.length === 0) return [toUtcInstant(from), toUtcInstant(to)];

  // Thinned by taking every Nth, never by dropping the tail: a run of labels
  // that stops two thirds of the way across reads as a broken axis.
  const step = Math.ceil(dates.length / max);
  return dates.filter((_, i) => i % step === 0).map(toUtcInstant);
}

/**
 * Whether a dataset of this size is drawn individually.
 *
 * Exported so the UI can say "aggregated by month" BEFORE building the data,
 * and so the boundary is asserted in one place rather than at three call sites.
 */
export function shouldAggregate(count: number): boolean {
  return count > AGGREGATION_THRESHOLD;
}

/**
 * The chart's data, in either mode.
 *
 * ONE generator with a mode flag, not two implementations. The modes differ in
 * exactly one expression - the bucket key - and share the sign rule, the
 * magnitude rule, the clamping and the balance accumulation. A second
 * aggregating implementation would have to stay in agreement with this one
 * about all four, forever, and the day it stops the totals under the chart
 * disagree with the dots above them.
 */
export function buildChartData(input: ChartInput): ChartData {
  const { from, to, openingMinor } = input;

  const inWindow = (list: readonly Occurrence[]) =>
    list
      .filter((o) => isWithin(o.date, from, to))
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key.localeCompare(b.key)));
  const rows = inWindow(input.occurrences);
  const lineRows = input.balanceOccurrences === undefined ? rows : inWindow(input.balanceOccurrences);

  const mode = input.mode ?? 'auto';
  const aggregated = mode === 'auto' ? shouldAggregate(rows.length) : mode === 'aggregated';

  const points = buildPoints(rows, aggregated);
  const lineThrough = minDate(input.lineThrough ?? to, to);
  const balance = buildBalance(lineRows, openingMinor, aggregated, lineThrough);

  const magnitudes = points.map((p) => p.magnitudeMinor).sort((a, b) => a - b);
  const zMax = Math.max(percentile(magnitudes, MAGNITUDE_PERCENTILE), 1);

  const signed = points.map((p) => p.signedMinor);
  const amountDomain = symlogDomain(signed);
  const balanceScale = balanceAxis(balance, openingMinor);

  return {
    aggregated,
    income: points
      .filter((p) => p.kind === 'income')
      .map((p) => ({ ...p, z: Math.min(p.magnitudeMinor, zMax) })),
    expense: points
      .filter((p) => p.kind === 'expense')
      .map((p) => ({ ...p, z: Math.min(p.magnitudeMinor, zMax) })),
    balance,
    amountDomain,
    amountTicks: symlogTicks(amountDomain),
    balanceDomain: balanceScale.domain,
    balanceTicks: balanceScale.ticks,
    zDomain: [0, zMax],
    xDomain: paddedXDomain(from, to),
    summary: summariseRange(rows),
    rows,
  };
}

/**
 * The only difference between the two modes.
 *
 * Raw mode gives every occurrence its own bucket; aggregated mode buckets by
 * month AND kind, so income and expense never net each other out into a
 * meaningless dot. Everything downstream is identical, which is why
 * `sum(aggregated) === sum(expanded)` holds by construction rather than by
 * being tested into agreement.
 */
function buildPoints(rows: readonly Occurrence[], aggregated: boolean): ChartPoint[] {
  const buckets = new Map<string, Occurrence[]>();

  for (const occurrence of rows) {
    const key = aggregated ? `${occurrence.date.slice(0, 7)}|${occurrence.transaction.kind}` : occurrence.key;
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [occurrence]);
    else bucket.push(occurrence);
  }

  const points: ChartPoint[] = [];
  for (const [key, bucket] of buckets) {
    const first = bucket[0];
    if (first === undefined) continue;

    const signedMinor = sum(bucket.map(signedBaseAmount));
    const date = aggregated ? startOfMonth(first.date) : first.date;

    points.push({
      key,
      t: toUtcInstant(date),
      date,
      kind: first.transaction.kind,
      signedMinor,
      magnitudeMinor: Math.abs(signedMinor),
      // Replaced with the clamped value once the percentile is known; kept here
      // so the shape is complete rather than partially built.
      z: Math.abs(signedMinor),
      count: bucket.length,
      ...(aggregated ? {} : { occurrence: first }),
    });
  }

  return points.sort((a, b) => a.t - b.t || a.key.localeCompare(b.key));
}

/**
 * The running balance line.
 *
 * One point per day with activity, or per month when aggregated - carrying the
 * balance AFTER everything on that date, so the last point is the same figure
 * in both modes. An aggregated bucket is dated at the earlier of its month end
 * and the window end, because a line that runs past the window's right edge
 * would be drawing a balance for days the chart does not cover.
 */
function buildBalance(
  rows: readonly Occurrence[],
  openingMinor: Minor,
  aggregated: boolean,
  lineEnd: LocalDate,
): BalancePoint[] {
  const points: BalancePoint[] = [];
  let running = openingMinor;
  let bucketKey: string | undefined;
  let bucketDate: LocalDate | undefined;

  const flush = (): void => {
    if (bucketDate === undefined) return;
    points.push({ t: toUtcInstant(bucketDate), date: bucketDate, balanceMinor: running });
  };

  for (const occurrence of rows) {
    // Rows are ascending, so the first one past the line's end ends the line.
    if (occurrence.date > lineEnd) break;

    const key = aggregated ? occurrence.date.slice(0, 7) : occurrence.date;
    if (key !== bucketKey) {
      flush();
      bucketKey = key;
      bucketDate = aggregated ? minDate(endOfMonth(occurrence.date), lineEnd) : occurrence.date;
    }
    running += signedBaseAmount(occurrence);
  }
  flush();

  return points;
}

/**
 * The time axis, with a sliver of padding at each end.
 *
 * A transaction on the first or last day of the window would otherwise be drawn
 * centred on the frame, half of it on top of the Y-axis labels. The padding is
 * a fraction of the span rather than a fixed number of days, so it stays the
 * same few pixels whether the window is one month or ten years - and the ticks
 * still sit on the real dates, so nothing about the window is misreported.
 */
function paddedXDomain(from: LocalDate, to: LocalDate): readonly [number, number] {
  const start = toUtcInstant(from);
  const end = toUtcInstant(to);
  const pad = Math.max(Math.round((end - start) / 40), DAY_MS);

  return [start - pad, end + pad];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Nearest-rank percentile over an ascending array. */
function percentile(ascending: readonly number[], p: number): number {
  if (ascending.length === 0) return 0;
  const index = Math.min(Math.ceil(p * ascending.length) - 1, ascending.length - 1);
  return ascending[Math.max(index, 0)] ?? 0;
}

/**
 * The symlog domain: a nice bound STRICTLY outside the data.
 *
 * Recharts needs an explicit `domain` plus `allowDataOverflow` for a symlog
 * axis - left to "auto" it computes a linear domain and then draws it through a
 * log scale, which silently puts the dots in the wrong places.
 *
 * Strictly outside, because a dot has a RADIUS. A bound merely equal to the
 * largest value draws that dot centred on the frame with half of it clipped
 * away - and the values that land exactly on a round bound are salaries, so the
 * clipped dot would reliably be the most important one on the chart.
 */
function symlogDomain(values: readonly number[]): readonly [number, number] {
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  return [-niceAbove(Math.abs(min)), niceAbove(max)];
}

/**
 * The smallest 1, 2 or 5 x 10^k strictly greater than `value`.
 *
 * Powers of ten alone would round a 2,000 rent up to 10,000 and spend most of
 * the axis on empty space; 1/2/5 is the standard nice-number ladder and never
 * wastes more than a factor of two. Floored at one currency unit, so a window
 * containing nothing but a few agorot still has a readable axis.
 */
function niceAbove(value: number): number {
  if (value <= 0) return 0;
  const floored = Math.max(value, 100);
  const power = Math.pow(10, Math.floor(Math.log10(floored)));

  for (const step of [1, 2, 5]) {
    if (step * power > floored) return step * power;
  }
  return power * 10;
}

/**
 * Ticks for the symlog axis: zero, then powers of ten out to the domain.
 *
 * Powers of ten ONLY. A symlog axis with evenly-spaced tick VALUES draws them
 * at wildly uneven positions, which reads as a rendering fault.
 *
 * Capped per side, largest first. Every decade from one currency unit upward is
 * eleven labels on a 260px axis, and the bottom few of those - a tick at one
 * unit, at ten - fall inside symlog's linear region where they crowd together
 * and describe almost nothing.
 */
export function symlogTicks(domain: readonly [number, number], perSide = 3): number[] {
  const [min, max] = domain;

  const powers = (limit: number): number[] => {
    const out: number[] = [];
    for (let value = 100; value <= Math.abs(limit); value = value * 10) out.push(value);
    return out.slice(-perSide);
  };

  return [
    ...powers(min)
      .map((value) => -value)
      .reverse(),
    0,
    ...powers(max),
  ];
}

/**
 * The balance axis: padded off the frame, then rounded to round numbers.
 *
 * Padded because a line drawn along the top edge of the plot cannot be read.
 * Rounded because Recharts ticks an explicit domain by dividing it evenly, so
 * un-rounded bounds produce ticks like "$30.2K, $36.7K, $43.2K" - true, and
 * useless, since nobody reads a balance against a scale marked in 6.5s.
 *
 * Includes the opening balance even when no point carries it, so a window whose
 * balance only ever falls still shows where it started.
 */
function balanceAxis(
  points: readonly BalancePoint[],
  openingMinor: Minor,
): { domain: readonly [number, number]; ticks: number[] } {
  const values = [openingMinor, ...points.map((p) => p.balanceMinor)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(Math.round((max - min) / 10), 100);
  const step = niceStep((max - min + pad + pad) / 4);

  const low = Math.floor((min - pad) / step) * step;
  const high = Math.ceil((max + pad) / step) * step;

  // Ticks are listed rather than left to Recharts, which divides the domain
  // into an even count regardless of where round numbers fall: a domain of
  // 3,000,000 over four intervals gives ticks every 7,500 - each one true,
  // and none of them a number anybody thinks in.
  const ticks: number[] = [];
  for (let value = low; value <= high; value += step) ticks.push(value);

  return { domain: [low, high], ticks };
}

/** The smallest 1, 2 or 5 x 10^k at or above `rough`. */
function niceStep(rough: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1))));

  for (const step of [1, 2, 5]) {
    if (step * power >= rough) return step * power;
  }
  return power * 10;
}
