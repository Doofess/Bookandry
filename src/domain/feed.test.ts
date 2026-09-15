import { describe, expect, it } from 'vitest';

import type { Occurrence } from '@/types/domain';
import type { Kind, Minor } from '@/types/money';

import {
  activeHeaderIndex,
  applyFeedFilters,
  emptyReason,
  flattenFeed,
  headerIndices,
  type FeedLookup,
} from './feed';
import { defaultFilters, type FeedFilters } from './feed-filters';
import { MONEY, d, makeTx } from './test-factories';

const TODAY = d('2026-09-15');

type OccurrenceSeed = {
  id: string;
  date: string;
  kind?: Kind;
  amount?: Minor;
  categoryId?: string;
  paymentMethodId?: string;
  note?: string;
  originalDate?: string;
};

function occ(seed: OccurrenceSeed): Occurrence {
  const date = d(seed.date);
  const originalDate = seed.originalDate === undefined ? date : d(seed.originalDate);
  const transaction = makeTx({
    id: seed.id,
    kind: seed.kind ?? 'expense',
    date: originalDate,
    recurrence: { type: 'one_time' },
  });

  return {
    transaction,
    seriesId: seed.id,
    date,
    originalDate,
    key: `${seed.id}@${originalDate}`,
    money: { ...MONEY, amountMinor: seed.amount ?? 1000, baseAmountMinor: seed.amount ?? 1000 },
    categoryId: seed.categoryId ?? 'cat.groceries',
    paymentMethodId: seed.paymentMethodId,
    note: seed.note,
    isOverridden: false,
    isMoved: originalDate !== date,
    isSkipped: false,
    isProjected: date > TODAY,
  };
}

const lookup: FeedLookup = {
  categoryName: (id) => ({ 'cat.groceries': 'Groceries', 'cat.salary': 'Salary' })[id],
  paymentMethodLabel: (id) => ({ m1: 'Blue card' })[id],
};

describe('flattenFeed', () => {
  it('returns an empty list for no occurrences', () => {
    expect(flattenFeed([], { today: TODAY })).toEqual([]);
  });

  it('emits one header per day, newest first', () => {
    const rows = flattenFeed([occ({ id: 'a', date: '2026-09-10' }), occ({ id: 'b', date: '2026-09-12' })], {
      today: TODAY,
    });
    expect(rows.map((r) => r.kind)).toEqual(['day', 'row', 'day', 'row']);
    expect(rows.filter((r) => r.kind === 'day').map((r) => r.date)).toEqual(['2026-09-12', '2026-09-10']);
  });

  it('can run oldest first', () => {
    const rows = flattenFeed([occ({ id: 'a', date: '2026-09-10' }), occ({ id: 'b', date: '2026-09-12' })], {
      today: TODAY,
      order: 'asc',
    });
    expect(rows.filter((r) => r.kind === 'day').map((r) => r.date)).toEqual(['2026-09-10', '2026-09-12']);
  });

  it('nets income against expense per day', () => {
    const rows = flattenFeed(
      [
        occ({ id: 'a', date: '2026-09-10', kind: 'income', amount: 500_000 }),
        occ({ id: 'b', date: '2026-09-10', amount: 120_000 }),
      ],
      { today: TODAY },
    );
    const header = rows[0];
    if (header?.kind !== 'day') throw new Error('expected a day header first');
    expect(header.netMinor).toBe(380_000);
    expect(header.count).toBe(2);
  });

  it('marks today, and only strictly later days as future', () => {
    const rows = flattenFeed(
      [
        occ({ id: 'past', date: '2026-09-14' }),
        occ({ id: 'today', date: '2026-09-15' }),
        occ({ id: 'future', date: '2026-09-16' }),
      ],
      { today: TODAY },
    );
    const headers = rows.filter((r) => r.kind === 'day');
    // Today's money has already moved; it is not a projection.
    expect(headers.map((h) => [h.date, h.isToday, h.isFuture])).toEqual([
      ['2026-09-16', false, true],
      ['2026-09-15', true, false],
      ['2026-09-14', false, false],
    ]);
  });

  it('orders ties inside a day by original slot, then key', () => {
    const rows = flattenFeed(
      [
        occ({ id: 'moved', date: '2026-09-10', originalDate: '2026-09-30' }),
        occ({ id: 'native', date: '2026-09-10' }),
      ],
      { today: TODAY },
    );
    // Stable: a virtualizer re-measures every row whose index changed, so an
    // unstable sort would thrash the whole viewport on any re-render.
    expect(rows.filter((r) => r.kind === 'row').map((r) => r.occurrence.seriesId)).toEqual([
      'native',
      'moved',
    ]);
  });

  it('appends a horizon marker only when there is something above it', () => {
    expect(flattenFeed([], { today: TODAY, horizon: d('2027-09-30') })).toEqual([]);

    const rows = flattenFeed([occ({ id: 'a', date: '2026-09-10' })], {
      today: TODAY,
      horizon: d('2027-09-30'),
    });
    expect(rows.at(-1)).toEqual({ kind: 'horizon', key: 'horizon:2027-09-30', through: '2027-09-30' });
  });

  it('gives every row a stable, unique key', () => {
    const rows = flattenFeed([occ({ id: 'a', date: '2026-09-10' }), occ({ id: 'b', date: '2026-09-10' })], {
      today: TODAY,
    });
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('sticky header indices', () => {
  const rows = flattenFeed(
    [
      occ({ id: 'a', date: '2026-09-12' }),
      occ({ id: 'b', date: '2026-09-10' }),
      occ({ id: 'c', date: '2026-09-10' }),
    ],
    { today: TODAY },
  );

  it('lists the header positions', () => {
    expect(headerIndices(rows)).toEqual([0, 2]);
  });

  it('pins the header at or above the first visible row', () => {
    const headers = headerIndices(rows);
    // Only ONE header can be pinned at a time; they snap rather than push.
    expect(activeHeaderIndex(headers, 0)).toBe(0);
    expect(activeHeaderIndex(headers, 1)).toBe(0);
    expect(activeHeaderIndex(headers, 2)).toBe(2);
    expect(activeHeaderIndex(headers, 4)).toBe(2);
  });

  it('has nothing to pin above the first header', () => {
    expect(activeHeaderIndex([3], 0)).toBeUndefined();
    expect(activeHeaderIndex([], 0)).toBeUndefined();
  });
});

describe('applyFeedFilters', () => {
  const base = defaultFilters({ profileId: 'all', today: TODAY });
  const items = [
    occ({ id: 'salary', date: '2026-09-01', kind: 'income', categoryId: 'cat.salary', note: 'September' }),
    occ({ id: 'shop', date: '2026-09-05', paymentMethodId: 'm1', note: 'Pizza night' }),
    occ({ id: 'bus', date: '2026-09-06' }),
  ];
  const filter = (over: Partial<FeedFilters>) => applyFeedFilters(items, { ...base, ...over }, lookup);

  it('passes everything through by default', () => {
    expect(filter({})).toHaveLength(3);
  });

  it('filters by kind', () => {
    expect(filter({ kind: 'income' }).map((o) => o.seriesId)).toEqual(['salary']);
    expect(filter({ kind: 'expense' })).toHaveLength(2);
  });

  it('filters by category and by payment method', () => {
    expect(filter({ categoryIds: ['cat.salary'] }).map((o) => o.seriesId)).toEqual(['salary']);
    expect(filter({ paymentMethodIds: ['m1'] }).map((o) => o.seriesId)).toEqual(['shop']);
  });

  it('excludes rows with no payment method when filtering by one', () => {
    expect(filter({ paymentMethodIds: ['m1', 'm2'] }).map((o) => o.seriesId)).toEqual(['shop']);
  });

  it('searches the note, the category and the payment method', () => {
    expect(filter({ query: 'pizza' }).map((o) => o.seriesId)).toEqual(['shop']);
    // The three things actually visible on the row. Matching a hidden field
    // returns results the user cannot explain.
    expect(filter({ query: 'salary' }).map((o) => o.seriesId)).toEqual(['salary']);
    expect(filter({ query: 'blue card' }).map((o) => o.seriesId)).toEqual(['shop']);
    expect(filter({ query: 'groceries' }).map((o) => o.seriesId)).toEqual(['shop', 'bus']);
  });

  it('ignores case', () => {
    expect(filter({ query: 'PIZZA' }).map((o) => o.seriesId)).toEqual(['shop']);
  });

  it('combines filters', () => {
    expect(filter({ kind: 'expense', query: 'september' })).toEqual([]);
  });
});

describe('emptyReason', () => {
  it('says nothing when there are results', () => {
    expect(emptyReason(5, 3, true)).toBeUndefined();
  });

  it('distinguishes the three ways a feed can be empty', () => {
    // "Nothing here" answers none of the questions a user has at any of them.
    expect(emptyReason(0, 0, false)).toBe('no_data');
    expect(emptyReason(0, 0, true)).toBe('empty_month');
    expect(emptyReason(9, 0, true)).toBe('no_results');
  });
});
