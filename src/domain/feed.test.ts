import { describe, expect, it } from 'vitest';

import type { Occurrence } from '@/types/domain';
import type { Kind, Minor } from '@/types/money';

import {
  activeHeaderIndex,
  applyFeedFilters,
  emptyReason,
  flattenFeed,
  headerIndices,
  indexAtOffset,
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
  destinationId?: string;
  note?: string;
  originalDate?: string;
  mcc?: string;
};

function occ(seed: OccurrenceSeed): Occurrence {
  const date = d(seed.date);
  const originalDate = seed.originalDate === undefined ? date : d(seed.originalDate);
  const transaction = makeTx({
    id: seed.id,
    kind: seed.kind ?? 'expense',
    date: originalDate,
    recurrence: { type: 'one_time' },
    ...(seed.mcc === undefined ? {} : { mcc: seed.mcc }),
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
    ...(seed.destinationId === undefined ? {} : { destinationId: seed.destinationId }),
    note: seed.note,
    isOverridden: false,
    isMoved: originalDate !== date,
    isSkipped: false,
    isProjected: date > TODAY,
  };
}

const lookup: FeedLookup = {
  categoryName: (id) => ({ 'cat.groceries': 'Groceries', 'cat.salary': 'Salary' })[id],
  paymentMethodLabel: (id) => ({ m1: 'Blue card', leumi: 'Leumi current' })[id],
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

  it('reads the first visible row from where the rows ARE, not from the first one drawn', () => {
    /*
     * The rendered range starts eight rows of overscan above the screen, so
     * its first item is not the first visible one: pinning from it kept the
     * first day stuck over later days' rows for the first screenful of scroll.
     */
    const items = [
      { index: 0, start: 0 },
      { index: 1, start: 36 },
      { index: 2, start: 100 },
      { index: 3, start: 164 },
      { index: 4, start: 200 },
    ];
    expect(indexAtOffset(items, 0)).toBe(0);
    expect(indexAtOffset(items, 120)).toBe(2);
    expect(indexAtOffset(items, 164)).toBe(3);
    expect(indexAtOffset(items, 999)).toBe(4);
    // A pinned header the extractor prepended sits first, out of order; it
    // never wins over a later row that covers the offset.
    expect(indexAtOffset([{ index: 0, start: 0 }, ...items.slice(2)], 170)).toBe(3);
    // Above the list entirely: the first item, as before.
    expect(indexAtOffset(items.slice(2), 10)).toBe(2);
    expect(indexAtOffset([], 10)).toBeUndefined();
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

  it('finds income by the account it went to, with the same filter and search as a card', () => {
    const withIncome = [
      ...items,
      occ({
        id: 'pay',
        date: '2026-09-10',
        kind: 'income',
        categoryId: 'cat.salary',
        destinationId: 'leumi',
      }),
    ];
    const run = (over: Partial<FeedFilters>) => applyFeedFilters(withIncome, { ...base, ...over }, lookup);
    expect(run({ paymentMethodIds: ['leumi'] }).map((o) => o.seriesId)).toEqual(['pay']);
    expect(run({ query: 'leumi' }).map((o) => o.seriesId)).toEqual(['pay']);
  });

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

describe('searching by business type', () => {
  const base = defaultFilters({ profileId: 'all', today: TODAY });
  const items = [
    occ({ id: 'cafe', date: '2026-09-05', note: 'Cafe Nero', mcc: '5812' }),
    occ({ id: 'bistro', date: '2026-09-06', note: 'Bistro', mcc: '5812' }),
    occ({ id: 'bakery', date: '2026-09-07', note: 'Bakery', mcc: '5462' }),
    occ({ id: 'plain', date: '2026-09-08', note: 'Something' }),
  ];
  const names: Record<string, string> = { '5812': 'מסעדות', '5462': 'מאפיות' };
  const withNames: FeedLookup = { ...lookup, businessTypeName: (code) => names[code] };
  const search = (query: string, using: FeedLookup = withNames) =>
    applyFeedFilters(items, { ...base, query }, using).map((o) => o.seriesId);

  it('finds every row of a business type by its name', () => {
    expect(search('מסעדות')).toEqual(['cafe', 'bistro']);
    expect(search('מאפיות')).toEqual(['bakery']);
  });

  it('ignores niqqud and final letters, as the picker does', () => {
    expect(search('מִסְעָדוֹת')).toEqual(['cafe', 'bistro']);
  });

  it('matches nothing by business type until the names are there', () => {
    expect(search('מסעדות', lookup)).toEqual([]);
    // The rest of the row still matches.
    expect(search('cafe', lookup)).toEqual(['cafe']);
  });
});
