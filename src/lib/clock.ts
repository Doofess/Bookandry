import type { IsoInstant, LocalDate } from '@/types/money';

import { nowIso, todayLocal } from './dates';

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
};

export const systemClock: Clock = {
  today: () => todayLocal(new Date()),
  nowIso: () => nowIso(new Date()),
};

/** A clock frozen at a given instant. */
export function fixedClock(instant: Date): Clock {
  return {
    today: () => todayLocal(instant),
    nowIso: () => nowIso(instant),
  };
}
