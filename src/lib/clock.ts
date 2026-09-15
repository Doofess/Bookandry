import type { IsoInstant, LocalDate } from '@/types/money';

import { msUntilNextLocalMidnight, nowIso, todayLocal } from './dates';

/**
 * The injectable clock.
 *
 * Everything in this app is today-relative: the balance window, isProjected,
 * "Upcoming (next 30 days)", the Today/Yesterday headers, "spent so far". A
 * suite written in September that reads the ambient clock passes in September
 * and fails in March, on the 1st of a month, and on 29 February.
 *
 * So: pure functions take `today` as an explicit PARAMETER and never read a
 * clock, and this is the only module (with dates.ts) allowed to touch the host
 * clock at all. ESLint enforces that.
 */
export type Clock = {
  today(): LocalDate;
  nowIso(): IsoInstant;
  /**
   * How long until `today()` would return a different date.
   *
   * On the Clock rather than computed at the call site so that the one place
   * allowed to read the host clock stays the one place that reads it - a
   * `new Date()` in a React effect is exactly the drift this type prevents.
   */
  msUntilNextDay(): number;
  /**
   * Epoch milliseconds.
   *
   * Needed by the rates cache, whose freshness window is a duration rather than
   * a calendar fact. On the Clock for the same reason everything else here is:
   * a `Date.now()` inside the gateway would make its 12-hour TTL untestable
   * without waiting twelve hours.
   */
  nowMs(): number;
};

export const systemClock: Clock = {
  today: () => todayLocal(new Date()),
  nowIso: () => nowIso(new Date()),
  msUntilNextDay: () => msUntilNextLocalMidnight(new Date()),
  nowMs: () => Date.now(),
};

/** A clock frozen at a given instant. */
export function fixedClock(instant: Date): Clock {
  return {
    today: () => todayLocal(instant),
    nowIso: () => nowIso(instant),
    msUntilNextDay: () => msUntilNextLocalMidnight(instant),
    nowMs: () => instant.getTime(),
  };
}
