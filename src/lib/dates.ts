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

/**
 * Formatter cache.
 *
 * Constructing an `Intl.DateTimeFormat` is expensive - it resolves a locale and
 * builds an ICU pattern - and the feed formats a date on every visible row plus
 * every day header. It showed up as ~2% of a load profile with 2,000 rows, for
 * work whose inputs never change: a handful of (locale, options) pairs across
 * the whole app.
 *
 * Keyed on the options, so a caller asking for `{ weekday: 'short' }` does not
 * get the `{ dateStyle: 'medium' }` formatter.
 */
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  const cached = dateFormatters.get(key);
  if (cached) return cached;
  // Intl ALWAYS gets timeZone: 'UTC' here, or half the planet renders the wrong
  // day: a LocalDate is a calendar date, not an instant.
  const created = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
  dateFormatters.set(key, created);
  return created;
}

export function formatLocalDate(
  date: LocalDate,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return dateFormatter(locale, options).format(toUtcInstant(date));
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

/**
 * An ISO instant from epoch milliseconds.
 *
 * For createdAt/updatedAt/deletedAt only - NEVER for a transaction date, which
 * is a local calendar date and would shift by the UTC offset (§12).
 */
export function instantFromMs(ms: number): IsoInstant {
  return new Date(ms).toISOString() as IsoInstant;
}

/**
 * Milliseconds until the LOCAL calendar date changes.
 *
 * `todayLocal()` goes stale: a PWA left open overnight keeps computing
 * `isProjected` and the "Today" header against yesterday, so tomorrow's salary
 * silently counts toward the balance. A timer needs to know when to re-read.
 *
 * Built from local Y/M/D rather than by adding 86_400_000, because a DST day is
 * 23 or 25 hours long. In the handful of zones where local midnight does not
 * exist at all (Asia/Tehran, America/Sao_Paulo historically), the engine yields
 * 01:00 instead, which fires an hour late rather than never - and the
 * visibilitychange listener covers the gap.
 */
export function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  // Never zero or negative: a 0ms timeout would spin.
  return Math.max(1, next.getTime() - now.getTime());
}

/**
 * A LocalDate as a Date at LOCAL midnight, for date-picker components.
 *
 * react-day-picker compares days with `getFullYear/getMonth/getDate`, which are
 * local getters. Handing it `new Date('2026-01-31')` - parsed as UTC midnight
 * per ECMA-262 - makes every viewer west of Greenwich see January 30 selected,
 * and clicking the 31st then "does nothing" because it is already the value.
 *
 * So the bridge is local in both directions, and it lives here because this is
 * one of the two modules permitted to construct a Date at all.
 */
export function toPickerDate(date: LocalDate): Date {
  const { year, month, day } = parseLocalDate(date);
  // Noon, not midnight. A few zones (Asia/Tehran, historically
  // America/Sao_Paulo) skip local midnight entirely on a DST transition day, and
  // the engine then yields 01:00 of the SAME day - harmless here, but noon
  // leaves twelve hours of headroom on either side instead of one.
  return new Date(year, month - 1, day, 12);
}

export function fromPickerDate(value: Date): LocalDate {
  return makeLocalDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

/**
 * The order a date is typed in: month first in English, as Americans write
 * it (11/01/2025 is November 1st); day first in Hebrew, as Israelis do
 * (01/11/2025 is the 1st of November).
 */
export type DateOrder = 'mdy' | 'dmy';

export const dateOrderFor = (language: string): DateOrder => (language.startsWith('en') ? 'mdy' : 'dmy');

const two = (n: number): string => String(n).padStart(2, '0');

/** A date as it is typed: 11/01/2025 or 01/11/2025, always with slashes and a full year. */
export function formatTypedDate(date: LocalDate, order: DateOrder): string {
  const { year, month, day } = parseLocalDate(date);
  return order === 'mdy'
    ? `${two(month)}/${two(day)}/${String(year)}`
    : `${two(day)}/${two(month)}/${String(year)}`;
}

/**
 * A typed date, or undefined if it is not one.
 *
 * Lenient about how it is written - slashes, dots or dashes, one or two
 * digits, a two-digit year read as 20xx - and strict about what it says: no
 * 31st of April, no thirteenth month, nothing outside 1900-2100.
 */
export function parseTypedDate(text: string, order: DateOrder): LocalDate | undefined {
  const parts = /^\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})\s*$/.exec(text);
  if (parts === null) return undefined;
  // The pattern matched, so all three groups are there.
  const [first, second, yearText] = [Number(parts[1]), Number(parts[2]), String(parts[3])];
  const [month, day] = order === 'mdy' ? [first, second] : [second, first];
  const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) return undefined;
  if (day > daysInMonth(year, month)) return undefined;
  return makeLocalDate(year, month, day);
}
