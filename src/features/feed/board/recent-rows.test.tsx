import { describe, expect, it } from 'vitest';

import type { FeedRow } from '@/domain/feed';
import { d } from '@/domain/test-factories';

import { listMode, recentRows } from './list-mode';

const day = (date: string): FeedRow => ({
  kind: 'day',
  key: `day:${date}`,
  date: d(date),
  netMinor: 0,
  count: 1,
  isToday: false,
  isFuture: false,
});
const row = (key: string, date: string) =>
  ({ kind: 'row', key, date: d(date), occurrence: {} }) as unknown as FeedRow;

describe('recentRows', () => {
  it('takes the newest rows with their day headings, and drops a heading left with no row', () => {
    const rows = [
      day('2026-10-09'),
      row('a', '2026-10-09'),
      row('b', '2026-10-09'),
      day('2026-10-08'),
      row('c', '2026-10-08'),
      day('2026-10-07'),
      row('d', '2026-10-07'),
    ];
    expect(recentRows(rows, 3).map((r) => r.key)).toEqual([
      'day:2026-10-09',
      'a',
      'b',
      'day:2026-10-08',
      'c',
    ]);
    expect(recentRows(rows, 2).map((r) => r.key)).toEqual(['day:2026-10-09', 'a', 'b']);
  });

  it('never carries the horizon marker', () => {
    const rows = [
      day('2026-10-09'),
      row('a', '2026-10-09'),
      { kind: 'horizon', key: 'h', through: d('2027-04-30') } as FeedRow,
    ];
    expect(recentRows(rows, 8).map((r) => r.kind)).toEqual(['day', 'row']);
  });
});

describe('listMode', () => {
  it('is the board unless a filter is on or the whole list was asked for, at any size', () => {
    expect(listMode({ filtered: false, asked: false })).toBe(false);
    expect(listMode({ filtered: true, asked: false })).toBe(true);
    expect(listMode({ filtered: false, asked: true })).toBe(true);
  });
});
