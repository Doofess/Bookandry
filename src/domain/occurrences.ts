import {
  addMonthsClamped,
  clampDay,
  compareLocal,
  daysInMonth,
  makeLocalDate,
  monthsBetween,
  parseLocalDate,
  SERIES_MAX,
} from '@/lib/dates';
import type { Occurrence, Override, Recurrence, Transaction } from '@/types/domain';
import type { LocalDate } from '@/types/money';

/**
 * Expand a stored transaction into its occurrences over [from, to].
 *
 * Pure: no DB, no clock, no I/O. `today` is an explicit parameter so results are
 * reproducible regardless of when the suite runs.
 *
 * The dangerous parts, and what this does about them:
 *
 *  - CLAMPING IS NON-STICKY. Each slot is computed from the series anchor, so a
 *    bill on the 31st yields 31, 28, 31, 30 and RETURNS to the 31st. Iterating
 *    from the previous occurrence gives 31, 28, 28, 28 - the series silently
 *    loses the 31st forever.
 *
 *  - MOVED OCCURRENCES. An override may carry `date`, moving an occurrence off
 *    its slot. Generating slots only inside the window (as the spec did) makes
 *    an occurrence moved INTO the window vanish from the feed and from the
 *    balance: money disappearing with no error. Handled without widening the
 *    generation window, since every move is recorded as an Override row and the
 *    moved-in set is therefore enumerable directly in O(#overrides).
 *
 *  - PROJECTION IS BOUNDED. An open-ended monthly series is infinite in
 *    principle; callers pass a finite `to`, and absurd windows are refused.
 */

/** Forward projection cap. The only thing that makes an "All" range computable. */
export const PROJECTION_HORIZON_MONTHS = 12;

/** Programming-error guard (100 years), not a runtime path. */
const MAX_WINDOW_MONTHS = 1200;

export type ExpandOptions = {
  readonly today: LocalDate;
  /** Occurrences strictly before this are dropped. Applied to the EFFECTIVE date. */
  readonly openingBalanceDate?: LocalDate;
  /** Include skipped occurrences, flagged, so the feed can offer Restore. */
  readonly includeSkipped?: boolean;
};

/** The last date a series can emit, before any override widening. */
export function seriesEndDate(recurrence: Recurrence): LocalDate {
  if (recurrence.type === 'one_time') return SERIES_MAX;
  return recurrence.endDate ?? SERIES_MAX;
}

/** Is `date` a real slot of this series? Arithmetic, not iteration. */
export function isValidSlot(tx: Transaction, date: LocalDate): boolean {
  if (compareLocal(date, tx.date) < 0) return false;
  if (compareLocal(date, seriesEndDate(tx.recurrence)) > 0) return false;

  const target = parseLocalDate(date);

  switch (tx.recurrence.type) {
    case 'one_time':
      return date === tx.date;

    case 'monthly': {
      if (target.day !== clampDay(target.year, target.month, tx.recurrence.dayOfMonth)) return false;
      const count = tx.recurrence.installments;
      if (count === undefined) return true;
      const index = monthsBetween(tx.date, date);
      return index >= 0 && index < count;
    }

    case 'yearly': {
      if (target.month !== tx.recurrence.month) return false;
      return target.day === clampDay(target.year, tx.recurrence.month, tx.recurrence.day);
    }
  }
}

function monthlySlots(tx: Transaction, dayOfMonth: number, from: LocalDate, to: LocalDate): LocalDate[] {
  const slots: LocalDate[] = [];
  const first = Math.max(0, monthsBetween(tx.date, from));
  const last = monthsBetween(tx.date, to);

  for (let i = first; i <= last; i += 1) {
    // Anchored, never chained: this is what makes clamping non-sticky.
    const slot = addMonthsClamped(tx.date, i, dayOfMonth);
    if (compareLocal(slot, from) >= 0 && compareLocal(slot, to) <= 0) slots.push(slot);
  }
  return slots;
}

function yearlySlots(month: number, day: number, from: LocalDate, to: LocalDate): LocalDate[] {
  const slots: LocalDate[] = [];
  for (let year = parseLocalDate(from).year; year <= parseLocalDate(to).year; year += 1) {
    // Feb 29 clamps to Feb 28 in a common year and RETURNS to Feb 29 in the next
    // leap year, through the same clampDay monthly uses. One code path.
    const slot = makeLocalDate(year, month, Math.min(day, daysInMonth(year, month)));
    if (compareLocal(slot, from) >= 0 && compareLocal(slot, to) <= 0) slots.push(slot);
  }
  return slots;
}

/** Raw slot dates within [from, to], before overrides. */
function generateSlots(tx: Transaction, from: LocalDate, to: LocalDate): LocalDate[] {
  const genFrom = compareLocal(from, tx.date) > 0 ? from : tx.date;
  const seriesEnd = seriesEndDate(tx.recurrence);
  const genTo = compareLocal(to, seriesEnd) < 0 ? to : seriesEnd;
  if (compareLocal(genFrom, genTo) > 0) return [];

  switch (tx.recurrence.type) {
    case 'one_time':
      return compareLocal(tx.date, genFrom) >= 0 && compareLocal(tx.date, genTo) <= 0 ? [tx.date] : [];

    case 'monthly': {
      const slots = monthlySlots(tx, tx.recurrence.dayOfMonth, genFrom, genTo);
      const count = tx.recurrence.installments;
      if (count === undefined) return slots;
      // תשלומים: exactly `count` payments, never more.
      return slots.filter((s) => {
        const index = monthsBetween(tx.date, s);
        return index >= 0 && index < count;
      });
    }

    case 'yearly':
      return yearlySlots(tx.recurrence.month, tx.recurrence.day, genFrom, genTo);
  }
}

function effectiveOccurrence(
  tx: Transaction,
  slot: LocalDate,
  override: Override | undefined,
  today: LocalDate,
): Occurrence {
  const patch = override?.action === 'modify' ? override.patch : undefined;
  const date = patch?.date ?? slot;

  // `null` in a patch means "clear this field", which Partial<Pick<>> could not
  // express - so clearing a note or a payment method was unrepresentable.
  const paymentMethodId =
    patch && 'paymentMethodId' in patch ? (patch.paymentMethodId ?? undefined) : tx.paymentMethodId;
  const note = patch && 'note' in patch ? (patch.note ?? undefined) : tx.note;

  return {
    // By reference when unpatched: a fresh object every render would defeat
    // React.memo on the row and force the virtualizer to re-measure.
    transaction: tx,
    seriesId: tx.id,
    date,
    originalDate: slot,
    key: `${tx.id}#${slot}`,
    money: patch?.money ?? tx.money,
    categoryId: patch?.categoryId ?? tx.categoryId,
    ...(paymentMethodId === undefined ? {} : { paymentMethodId }),
    ...(note === undefined ? {} : { note }),
    isOverridden: override !== undefined,
    isMoved: patch?.date !== undefined && patch.date !== slot,
    isSkipped: override?.action === 'skip',
    // Strictly greater: today's occurrences are NOT projected. This boundary is
    // shared verbatim with spentSoFar, so the two can never disagree.
    isProjected: compareLocal(date, today) > 0,
  };
}

export function expandOccurrences(
  tx: Transaction,
  overrides: readonly Override[],
  from: LocalDate,
  to: LocalDate,
  options: ExpandOptions,
): Occurrence[] {
  // Defensive: the query already filters, but a caller holding a stale array
  // must never resurrect money.
  if (tx.isDeleted === 1) return [];
  if (compareLocal(from, to) > 0) return [];

  const span = monthsBetween(from, to);
  if (Math.abs(span) > MAX_WINDOW_MONTHS) {
    throw new RangeError(
      `Expansion window of ${String(span)} months exceeds the ${String(MAX_WINDOW_MONTHS)}-month guard. Bound the query.`,
    );
  }

  const bySlot = new Map<string, Override>();
  for (const o of overrides) {
    if (o.transactionId === tx.id) bySlot.set(o.occurrenceDate, o);
  }

  const inWindow = (date: LocalDate): boolean => compareLocal(date, from) >= 0 && compareLocal(date, to) <= 0;

  const slots = generateSlots(tx, from, to);
  const seen = new Set<string>(slots);

  // Occurrences MOVED INTO the window from a slot outside it. Enumerated from
  // the override rows directly: no window widening, no extra reads, and bounded
  // by the number of overrides rather than by the span of the series.
  for (const o of bySlot.values()) {
    if (o.action !== 'modify') continue;
    const moved = o.patch.date;
    if (moved === undefined) continue;
    if (seen.has(o.occurrenceDate)) continue;
    if (!inWindow(moved) || inWindow(o.occurrenceDate)) continue;
    if (!isValidSlot(tx, o.occurrenceDate)) continue;
    slots.push(o.occurrenceDate);
    seen.add(o.occurrenceDate);
  }

  const result: Occurrence[] = [];

  for (const slot of slots) {
    const override = bySlot.get(slot);

    // Omitted entirely unless asked for, so the feed, the chart and both
    // calculators do not each have to remember the same filter.
    if (override?.action === 'skip' && options.includeSkipped !== true) continue;

    const occurrence = effectiveOccurrence(tx, slot, override, options.today);

    // These filters apply to the EFFECTIVE date, not the slot. An occurrence
    // moved out of the window must not still appear at its old slot.
    if (!inWindow(occurrence.date)) continue;

    if (
      options.openingBalanceDate !== undefined &&
      compareLocal(occurrence.date, options.openingBalanceDate) < 0
    ) {
      continue;
    }

    result.push(occurrence);
  }

  // Total, deterministic order: effective date, then slot. Two occurrences of
  // one series can legitimately land on the same day once a move is involved.
  result.sort((a, b) => compareLocal(a.date, b.date) || compareLocal(a.originalDate, b.originalDate));
  return result;
}

/**
 * Cheap upper bound on occurrence count, without expanding.
 *
 * Lets the chart choose the day-aggregated path BEFORE allocating hundreds of
 * thousands of objects it would immediately discard.
 */
export function estimateOccurrenceCount(txs: readonly Transaction[], from: LocalDate, to: LocalDate): number {
  const months = Math.max(0, monthsBetween(from, to)) + 1;
  let total = 0;
  for (const tx of txs) {
    switch (tx.recurrence.type) {
      case 'one_time':
        total += 1;
        break;
      case 'monthly':
        total += Math.min(months, tx.recurrence.installments ?? months);
        break;
      case 'yearly':
        total += Math.ceil(months / 12);
        break;
    }
  }
  return total;
}
