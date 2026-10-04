import { describe, expect, it } from 'vitest';

import type { LocalDate } from '@/types/money';

import {
  addDays,
  addMonthsClamped,
  assertLocalDate,
  clampDay,
  compareLocal,
  daysBetween,
  daysInMonth,
  dateOrderFor,
  formatTypedDate,
  parseTypedDate,
  endOfMonth,
  formatLocalDate,
  fromPickerDate,
  fromUtcInstant,
  isLastDayOfMonth,
  isLeapYear,
  isLocalDate,
  isWithin,
  makeLocalDate,
  maxDate,
  minDate,
  monthsBetween,
  parseLocalDate,
  isAfter,
  isBefore,
  isSameDay,
  nowIso,
  startOfMonth,
  startOfYear,
  todayLocal,
  toUtcInstant,
  toPickerDate,
  msUntilNextLocalMidnight,
  parseStatementDate,
  dateFromExcelSerial,
} from './dates';

const d = (s: string): LocalDate => assertLocalDate(s);

describe('validation', () => {
  it.each(['2026-09-15', '2024-02-29', '2026-12-31', '0001-01-01'])('accepts %s', (s) => {
    expect(isLocalDate(s)).toBe(true);
  });

  it.each([
    '2026-02-30',
    '2025-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-9-15',
    '2026/09/15',
    '2026-09-15T00:00:00Z',
    '',
    'today',
  ])('rejects %s', (s) => {
    expect(isLocalDate(s)).toBe(false);
  });

  it('throws with the offending value', () => {
    expect(() => assertLocalDate('2026-02-30')).toThrow(/2026-02-30/);
  });
});

describe('leap years and month lengths', () => {
  it.each([
    [2024, true],
    [2025, false],
    [2000, true],
    [1900, false],
    [2100, false],
  ])('isLeapYear(%s) === %s', (y, expected) => {
    expect(isLeapYear(y)).toBe(expected);
  });

  it.each([
    [2026, 1, 31],
    [2026, 2, 28],
    [2024, 2, 29],
    [2026, 4, 30],
    [2026, 12, 31],
  ])('daysInMonth(%s, %s) === %s', (y, m, expected) => {
    expect(daysInMonth(y, m)).toBe(expected);
  });

  it('rejects an out-of-range month', () => {
    expect(() => daysInMonth(2026, 13)).toThrow(RangeError);
  });
});

describe('todayLocal', () => {
  it('reads the DEVICE-LOCAL date, never the UTC one', () => {
    const localNewYear = new Date(2026, 0, 1, 0, 30, 0);
    expect(todayLocal(localNewYear)).toBe('2026-01-01');
  });

  it('does not drift for a late-evening local time', () => {
    expect(todayLocal(new Date(2026, 8, 15, 23, 59, 0))).toBe('2026-09-15');
  });
});

describe('comparison', () => {
  it('is lexicographic and needs no parsing', () => {
    expect(compareLocal(d('2026-09-09'), d('2026-09-10'))).toBe(-1);
    expect(compareLocal(d('2026-09-10'), d('2026-09-09'))).toBe(1);
    expect(compareLocal(d('2026-09-10'), d('2026-09-10'))).toBe(0);
  });

  it('sorts correctly across year boundaries', () => {
    const dates = ['2027-01-01', '2026-12-31', '2026-01-01'].map(d);
    expect([...dates].sort(compareLocal)).toEqual(['2026-01-01', '2026-12-31', '2027-01-01']);
  });

  it('isWithin is inclusive on both ends', () => {
    expect(isWithin(d('2026-09-01'), d('2026-09-01'), d('2026-09-30'))).toBe(true);
    expect(isWithin(d('2026-09-30'), d('2026-09-01'), d('2026-09-30'))).toBe(true);
    expect(isWithin(d('2026-08-31'), d('2026-09-01'), d('2026-09-30'))).toBe(false);
  });

  it('min and max', () => {
    expect(minDate(d('2026-09-01'), d('2026-09-30'))).toBe('2026-09-01');
    expect(maxDate(d('2026-09-01'), d('2026-09-30'))).toBe('2026-09-30');
  });
});

describe('addDays', () => {
  it.each([
    ['2026-09-15', 1, '2026-09-16'],
    ['2026-09-15', -1, '2026-09-14'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2027-01-01', -1, '2026-12-31'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2025-02-28', 1, '2025-03-01'],
    ['2026-09-15', 0, '2026-09-15'],
    ['2026-01-31', 30, '2026-03-02'],
  ])('addDays(%s, %s) === %s', (from, n, expected) => {
    expect(addDays(d(from), n)).toBe(expected);
  });

  it('crosses a spring-forward boundary without losing a day', () => {
    expect(addDays(d('2026-03-28'), 1)).toBe('2026-03-29');
    expect(addDays(d('2026-03-29'), 1)).toBe('2026-03-30');
  });

  it('crosses a MIDNIGHT DST transition, where local arithmetic breaks', () => {
    // Zones like America/Sao_Paulo have transitioned at 00:00, making the local
    // midnight nonexistent; setDate(+1) can skip or repeat a day there.
    expect(addDays(d('2018-11-03'), 1)).toBe('2018-11-04');
    expect(addDays(d('2018-11-04'), 1)).toBe('2018-11-05');
  });

  it('daysBetween is the inverse', () => {
    expect(daysBetween(d('2026-09-01'), d('2026-09-15'))).toBe(14);
    expect(daysBetween(d('2026-09-15'), d('2026-09-01'))).toBe(-14);
    expect(daysBetween(d('2026-02-28'), d('2026-03-01'))).toBe(1);
    expect(daysBetween(d('2024-02-28'), d('2024-03-01'))).toBe(2);
  });
});

describe('addMonthsClamped', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-01-31', 3, '2026-04-30'],
    ['2026-12-31', 1, '2027-01-31'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-01-15', 1, '2026-02-15'],
    ['2026-01-31', 0, '2026-01-31'],
  ])('addMonthsClamped(%s, %s) === %s', (from, n, expected) => {
    expect(addMonthsClamped(d(from), n)).toBe(expected);
  });

  it('is NON-STICKY when given the series anchor day', () => {
    // The whole point: a bill on the 31st RETURNS to the 31st after February.
    const anchor = 31;
    expect(addMonthsClamped(d('2026-01-31'), 1, anchor)).toBe('2026-02-28');
    expect(addMonthsClamped(d('2026-01-31'), 2, anchor)).toBe('2026-03-31');
    expect(addMonthsClamped(d('2026-01-31'), 3, anchor)).toBe('2026-04-30');
    expect(addMonthsClamped(d('2026-01-31'), 4, anchor)).toBe('2026-05-31');
  });

  it('demonstrates the sticky bug it avoids', () => {
    // Chaining from the previous occurrence loses the 31st permanently.
    const feb = addMonthsClamped(d('2026-01-31'), 1);
    expect(addMonthsClamped(feb, 1)).toBe('2026-03-28');
    expect(addMonthsClamped(d('2026-01-31'), 2, 31)).toBe('2026-03-31');
  });

  it('monthsBetween counts calendar months', () => {
    expect(monthsBetween(d('2026-01-15'), d('2026-03-15'))).toBe(2);
    expect(monthsBetween(d('2026-01-31'), d('2027-01-01'))).toBe(12);
    expect(monthsBetween(d('2026-03-15'), d('2026-01-15'))).toBe(-2);
  });
});

describe('month boundaries', () => {
  it.each([
    ['2026-09-15', '2026-09-01', '2026-09-30'],
    ['2026-02-10', '2026-02-01', '2026-02-28'],
    ['2024-02-10', '2024-02-01', '2024-02-29'],
    ['2026-12-25', '2026-12-01', '2026-12-31'],
  ])('%s spans %s..%s', (date, start, end) => {
    expect(startOfMonth(d(date))).toBe(start);
    expect(endOfMonth(d(date))).toBe(end);
  });

  it('identifies the last day of the month', () => {
    // The default for Israeli recurring bills, and why day 31 is labelled
    // "Last day of month" in the recurrence picker.
    expect(isLastDayOfMonth(d('2026-01-31'))).toBe(true);
    expect(isLastDayOfMonth(d('2026-02-28'))).toBe(true);
    expect(isLastDayOfMonth(d('2024-02-29'))).toBe(true);
    expect(isLastDayOfMonth(d('2024-02-28'))).toBe(false);
    expect(isLastDayOfMonth(d('2026-09-30'))).toBe(true);
  });

  it('clampDay never exceeds the month', () => {
    expect(clampDay(2026, 2, 31)).toBe(28);
    expect(clampDay(2024, 2, 31)).toBe(29);
    expect(clampDay(2026, 4, 31)).toBe(30);
    expect(clampDay(2026, 1, 31)).toBe(31);
    expect(clampDay(2026, 1, 15)).toBe(15);
  });
});

describe('UTC instants and formatting', () => {
  it('round-trips through a UTC instant', () => {
    expect(fromUtcInstant(toUtcInstant(d('2026-09-15')))).toBe('2026-09-15');
    expect(fromUtcInstant(toUtcInstant(d('2026-01-01')))).toBe('2026-01-01');
  });

  it('renders the same calendar day regardless of viewer timezone', () => {
    const iso = formatLocalDate(d('2026-09-15'), 'en-CA', { dateStyle: 'short' });
    expect(iso).toContain('2026');
    expect(iso).toContain('09');
    expect(iso).toContain('15');
  });

  it('formats in Hebrew with Western Arabic digits', () => {
    const he = formatLocalDate(d('2026-03-12'), 'he-IL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    expect(he).toMatch(/\d/);
    expect(he).toMatch(/[֐-׿]/);
    expect(he).toContain('2026');
  });

  it('parseLocalDate and makeLocalDate round-trip', () => {
    const parts = parseLocalDate(d('2026-09-15'));
    expect(parts).toEqual({ year: 2026, month: 9, day: 15 });
    expect(makeLocalDate(parts.year, parts.month, parts.day)).toBe('2026-09-15');
  });

  it('pads single-digit components', () => {
    expect(makeLocalDate(2026, 1, 5)).toBe('2026-01-05');
    expect(makeLocalDate(7, 1, 5)).toBe('0007-01-05');
  });
});

describe('remaining helpers', () => {
  it('startOfYear', () => {
    expect(startOfYear(d('2026-09-15'))).toBe('2026-01-01');
    expect(startOfYear(d('2026-01-01'))).toBe('2026-01-01');
  });

  it('nowIso produces a full ISO instant, distinct from a calendar date', () => {
    // This is the ONLY place an ISO timestamp is produced, and it is for
    // createdAt/updatedAt - never for a transaction date (§12).
    expect(nowIso(new Date(Date.UTC(2026, 8, 15, 12, 0, 0)))).toBe('2026-09-15T12:00:00.000Z');
  });

  it('isBefore, isAfter and isSameDay', () => {
    expect(isBefore(d('2026-09-01'), d('2026-09-02'))).toBe(true);
    expect(isBefore(d('2026-09-02'), d('2026-09-01'))).toBe(false);
    expect(isAfter(d('2026-09-02'), d('2026-09-01'))).toBe(true);
    expect(isAfter(d('2026-09-01'), d('2026-09-02'))).toBe(false);
    expect(isSameDay(d('2026-09-01'), d('2026-09-01'))).toBe(true);
    expect(isSameDay(d('2026-09-01'), d('2026-09-02'))).toBe(false);
  });

  it('parseLocalDate rejects a malformed value', () => {
    expect(() => parseLocalDate('nope' as unknown as LocalDate)).toThrow(RangeError);
  });
});

describe('minDate and maxDate cover both orderings', () => {
  it('returns the earlier or later value regardless of argument order', () => {
    expect(minDate(d('2026-09-30'), d('2026-09-01'))).toBe('2026-09-01');
    expect(maxDate(d('2026-09-01'), d('2026-09-30'))).toBe('2026-09-30');
    expect(minDate(d('2026-09-01'), d('2026-09-01'))).toBe('2026-09-01');
    expect(maxDate(d('2026-09-01'), d('2026-09-01'))).toBe('2026-09-01');
  });
});

describe('msUntilNextLocalMidnight', () => {
  it('counts to the next local midnight', () => {
    // The suite runs at Etc/UTC (cross-env + a guard test), so local is UTC.
    const now = new Date('2026-09-15T23:59:59.000Z');
    expect(msUntilNextLocalMidnight(now)).toBe(1000);
  });

  it('returns a full day at midnight exactly', () => {
    expect(msUntilNextLocalMidnight(new Date('2026-09-15T00:00:00.000Z'))).toBe(86_400_000);
  });

  it('never returns zero, so a timer cannot spin', () => {
    for (const iso of ['2026-09-15T23:59:59.999Z', '2026-12-31T23:59:59.999Z']) {
      expect(msUntilNextLocalMidnight(new Date(iso))).toBeGreaterThan(0);
    }
  });

  it('crosses a month and a year boundary', () => {
    expect(msUntilNextLocalMidnight(new Date('2026-09-30T12:00:00.000Z'))).toBe(43_200_000);
    expect(msUntilNextLocalMidnight(new Date('2026-12-31T12:00:00.000Z'))).toBe(43_200_000);
    // 29 February exists in 2028.
    expect(msUntilNextLocalMidnight(new Date('2028-02-28T12:00:00.000Z'))).toBe(43_200_000);
  });
});

describe('the date-picker bridge', () => {
  it('round-trips every day of a leap February', () => {
    for (let day = 1; day <= 29; day += 1) {
      const date = makeLocalDate(2028, 2, day);
      expect(fromPickerDate(toPickerDate(date))).toBe(date);
    }
  });

  it('round-trips the day a month ends', () => {
    // 2026-01-31 parsed as UTC midnight reads as January 30 in every
    // negative-offset zone, before any arithmetic happens.
    const date = assertLocalDate('2026-01-31');
    expect(fromPickerDate(toPickerDate(date))).toBe('2026-01-31');
  });

  it('produces a LOCAL date, which is what the picker reads', () => {
    const picker = toPickerDate(assertLocalDate('2026-01-31'));

    expect(picker.getFullYear()).toBe(2026);
    expect(picker.getMonth()).toBe(0);
    expect(picker.getDate()).toBe(31);
  });

  it('sits at noon, away from both DST edges', () => {
    // Local midnight does not exist at all on some transition days; noon leaves
    // twelve hours of headroom instead of one.
    expect(toPickerDate(assertLocalDate('2026-01-31')).getHours()).toBe(12);
  });
});

describe('typed dates', () => {
  it('reads month first in English and day first in Hebrew', () => {
    expect(dateOrderFor('en')).toBe('mdy');
    expect(dateOrderFor('he')).toBe('dmy');
    expect(parseTypedDate('11/01/2025', 'mdy')).toBe('2025-11-01');
    expect(parseTypedDate('01/11/2025', 'dmy')).toBe('2025-11-01');
  });

  it('writes them back the same way, padded, with a full year', () => {
    expect(formatTypedDate('2025-11-01' as LocalDate, 'mdy')).toBe('11/01/2025');
    expect(formatTypedDate('2025-11-01' as LocalDate, 'dmy')).toBe('01/11/2025');
  });

  it('takes the ways people actually type a date', () => {
    expect(parseTypedDate('1.11.2025', 'dmy')).toBe('2025-11-01');
    expect(parseTypedDate(' 1-11-25 ', 'dmy')).toBe('2025-11-01');
    expect(parseTypedDate('2/29/2028', 'mdy')).toBe('2028-02-29');
  });

  it('refuses what is not a date', () => {
    for (const text of [
      '',
      '11/2025',
      '31/04/2026',
      '13/13/2026',
      '29/02/2027',
      '01/11/1800',
      '01/01/2101',
      '00/01/2026',
      '01/00/2026',
      'abc',
      '1/1/202',
    ]) {
      expect(parseTypedDate(text, 'dmy')).toBeUndefined();
    }
    expect(parseTypedDate('13/01/2026', 'mdy')).toBeUndefined();
  });
});

describe('parseStatementDate', () => {
  const anchor = '2026-10-04' as LocalDate;

  it('reads the day first, as Israeli statements write it', () => {
    expect(parseStatementDate('03/04/26', anchor)).toEqual({ date: '2026-04-03', inferred: false });
    expect(parseStatementDate('3.4.2026', anchor)).toEqual({ date: '2026-04-03', inferred: false });
    expect(parseStatementDate('\u200F03-04-2026 21:40', anchor)).toEqual({
      date: '2026-04-03',
      inferred: false,
    });
    expect(parseStatementDate('2026-04-03', anchor)).toEqual({ date: '2026-04-03', inferred: false });
  });

  it('reads a month by name, in English or Hebrew', () => {
    expect(parseStatementDate('12 Nov 2025', anchor)).toEqual({ date: '2025-11-12', inferred: false });
    expect(parseStatementDate('12 בנובמבר 2025', anchor)).toEqual({ date: '2025-11-12', inferred: false });
    expect(parseStatementDate('1 בספט׳ 26', anchor)).toEqual({ date: '2026-09-01', inferred: false });
    expect(parseStatementDate('5 במרץ', anchor)).toEqual({ date: '2026-03-05', inferred: true });
    expect(parseStatementDate('5 Smarch', anchor)).toBeUndefined();
  });

  it('works out a missing year, never landing after the anchor or the period', () => {
    expect(parseStatementDate('12/03', anchor)).toEqual({ date: '2026-03-12', inferred: true });
    // December has not come yet in October: last December.
    expect(parseStatementDate('20/12', anchor)).toEqual({ date: '2025-12-20', inferred: true });
    expect(
      parseStatementDate('20/12', anchor, { from: '2026-12-01' as LocalDate, to: '2026-12-31' as LocalDate }),
    ).toEqual({ date: '2026-12-20', inferred: true });
    // 29 February with no year: neither this year nor last has one.
    expect(parseStatementDate('29/02', anchor)).toBeUndefined();
  });

  it('counts today and yesterday back from the anchor', () => {
    expect(parseStatementDate('היום', anchor)).toEqual({ date: anchor, inferred: true });
    expect(parseStatementDate('אתמול 21:40', anchor)).toEqual({ date: '2026-10-03', inferred: true });
    expect(parseStatementDate('Yesterday', anchor)).toEqual({ date: '2026-10-03', inferred: true });
  });

  it.each(['', 'soon', '31/04/26', '13/13/26', '00/01/26', '1/1/1800', '2026-02-30'])(
    'refuses %j',
    (text) => {
      expect(parseStatementDate(text, anchor)).toBeUndefined();
    },
  );
});

describe('dateFromExcelSerial', () => {
  it('counts the 1900 system the way Excel does, phantom leap day and all', () => {
    expect(dateFromExcelSerial(1, false)).toBe('1900-01-01');
    expect(dateFromExcelSerial(59, false)).toBe('1900-02-28');
    expect(dateFromExcelSerial(60, false)).toBeUndefined();
    expect(dateFromExcelSerial(61, false)).toBe('1900-03-01');
    expect(dateFromExcelSerial(45_000, false)).toBe('2023-03-15');
    // The time of day is dropped.
    expect(dateFromExcelSerial(45_000.75, false)).toBe('2023-03-15');
  });

  it('counts the 1904 system from its own start', () => {
    expect(dateFromExcelSerial(0, true)).toBe('1904-01-01');
    expect(dateFromExcelSerial(43_538, true)).toBe('2023-03-15');
  });

  it('refuses what no day matches', () => {
    expect(dateFromExcelSerial(0, false)).toBeUndefined();
    expect(dateFromExcelSerial(-1, true)).toBeUndefined();
    expect(dateFromExcelSerial(3_000_000, false)).toBeUndefined();
    expect(dateFromExcelSerial(3_000_000, true)).toBeUndefined();
    expect(dateFromExcelSerial(Number.NaN, false)).toBeUndefined();
  });
});
