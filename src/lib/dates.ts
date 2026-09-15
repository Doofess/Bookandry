import type { IsoInstant, LocalDate } from '@/types/money';

/**
 * Local calendar dates as "YYYY-MM-DD" strings.
 *
 * Hand-rolled rather than date-fns or Temporal, for reasons that are not taste:
 *
 *  - date-fns operates on `Date`. `new Date('2026-01-31')` is parsed as UTC
 *    midnight per ECMA-262, so in any negative-offset zone the local getters
 *    already read January 30 BEFORE any arithmetic happens.
 *  - Temporal is not viable in 2026: Safari still ships it only behind a flag,
 *    so a PWA would carry a 40-200KB polyfill for a domain that is entirely
 *    "YYYY-MM-DD".
 *  - ISO-8601 dates are lexicographically ordered, so comparison and sorting
 *    need no parsing at all. That property is worth more than any library.
 *
 * TWO DISTINCT CLOCKS, and conflating them is a real bug:
 *  - `todayLocal()` reads the DEVICE-LOCAL calendar date (what the user calls
 *    "today").
 *  - `formatLocalDate()` pins Intl to UTC so a stored date renders as the same
 *    day for every viewer, regardless of their zone.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Sorts after every real date; used as an open-ended series end. */
export const SERIES_MAX = '9999-12-31' as LocalDate;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) throw new RangeError(`Month out of range: ${String(month)}`);
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return DAYS_IN_MONTH[month - 1]!;
}

export function isLocalDate(value: string): value is LocalDate {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  // Rejects "2026-02-30", which a naive regex would wave through and which
  // would only surface much later, inside occurrence expansion.
  return day >= 1 && day <= daysInMonth(year, month);
}

export function assertLocalDate(value: string): LocalDate {
  if (!isLocalDate(value)) throw new RangeError(`Not a valid calendar date: ${value}`);
  return value;
}

export function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Not a valid calendar date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function makeLocalDate(year: number, month: number, day: number): LocalDate {
  const y = String(year).padStart(4, '0');
  const mo = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${mo}-${d}` as LocalDate;
}

/**
 * The device-local calendar date. Never `toISOString()`, which shifts the day
 * by the UTC offset - the exact defect §12 forbids.
 */
export function todayLocal(now: Date): LocalDate {
  return makeLocalDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Lexicographic comparison; no parsing needed. */
export function compareLocal(a: LocalDate, b: LocalDate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const isBefore = (a: LocalDate, b: LocalDate): boolean => a < b;
export const isAfter = (a: LocalDate, b: LocalDate): boolean => a > b;
export const isSameDay = (a: LocalDate, b: LocalDate): boolean => a === b;

/** Inclusive on both ends. */
export function isWithin(date: LocalDate, from: LocalDate, to: LocalDate): boolean {
  return date >= from && date <= to;
}

export const minDate = (a: LocalDate, b: LocalDate): LocalDate => (a <= b ? a : b);
export const maxDate = (a: LocalDate, b: LocalDate): LocalDate => (a >= b ? a : b);

/**
 * Day arithmetic through Date.UTC.
 *
 * UTC has no DST, so this is transition-proof. Using local-time arithmetic
 * breaks in zones with a MIDNIGHT transition (America/Sao_Paulo, Asia/Tehran,
 * Australia/Lord_Howe), where a local midnight can simply not exist and
 * `d.setDate(d.getDate() + 1)` silently skips or repeats a day.
 */
export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  const t = new Date(Date.UTC(year, month - 1, day + days));
  return makeLocalDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

/** Clamp a day-of-month to a month that may be shorter. */
export function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

/**
 * Add months, clamping the day to the target month's length.
 *
 * NON-STICKY: pass the SERIES ANCHOR day, not the previous occurrence's day.
 * Iterating (Jan 31 -> Feb 28 -> Mar 28) permanently loses the 31st; anchoring
 * gives Jan 31 -> Feb 28 -> Mar 31, which is what a monthly bill actually does.
 */
export function addMonthsClamped(date: LocalDate, months: number, anchorDay?: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  const targetDay = anchorDay ?? day;
  const total = year * 12 + (month - 1) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return makeLocalDate(newYear, newMonth, clampDay(newYear, newMonth, targetDay));
}

export function monthsBetween(from: LocalDate, to: LocalDate): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

export function startOfMonth(date: LocalDate): LocalDate {
  const { year, month } = parseLocalDate(date);
  return makeLocalDate(year, month, 1);
}

export function endOfMonth(date: LocalDate): LocalDate {
  const { year, month } = parseLocalDate(date);
  return makeLocalDate(year, month, daysInMonth(year, month));
}

export function startOfYear(date: LocalDate): LocalDate {
  return makeLocalDate(parseLocalDate(date).year, 1, 1);
}

/** True when the date is the final day of its month - the default for recurring bills. */
export function isLastDayOfMonth(date: LocalDate): boolean {
  const { year, month, day } = parseLocalDate(date);
  return day === daysInMonth(year, month);
}

/**
 * A UTC instant for a calendar date, for chart axes and Intl.
 * Pinning to UTC keeps the rendered day identical in every timezone.
 */
export function toUtcInstant(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return Date.UTC(year, month - 1, day);
}

export function fromUtcInstant(ms: number): LocalDate {
  const d = new Date(ms);
  return makeLocalDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Intl ALWAYS gets timeZone: 'UTC' here, or half the planet renders the wrong day. */
export function formatLocalDate(
  date: LocalDate,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(toUtcInstant(date));
}

export function nowIso(now: Date): IsoInstant {
  return now.toISOString() as IsoInstant;
}

/**
 * Parse an external ISO-ish timestamp (e.g. an API's `time_last_update_utc`)
 * down to a calendar date.
 *
 * Lives here because this is one of only two modules permitted to construct a
 * Date; callers elsewhere must not, so that no module can quietly acquire a
 * dependency on the host clock.
 */
export function externalTimestampToLocalDate(value: string): LocalDate | undefined {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return makeLocalDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
}
