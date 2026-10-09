import { compareLocal } from '@/lib/dates';
import { sum } from '@/lib/money';
import type { Occurrence } from '@/types/domain';
import type { LocalDate, Minor } from '@/types/money';

import { matchesKind, type FeedFilters } from './feed-filters';

/**
 * The feed as a FLAT array.
 *
 * Day headers and rows in one list, because that is what a virtualizer can
 * measure and index. A nested shape (a day object holding its rows) forces the
 * virtualizer to treat a whole day as one item, which makes a 40-row Sunday a
 * single 3,000px cell that cannot be partially rendered.
 *
 * Pure, and the only part of the feed that CAN be unit-tested: jsdom returns 0
 * from `getBoundingClientRect`, `offsetHeight` and `ResizeObserver`, so the
 * virtualizer renders nothing there and mocking those measurements would only
 * assert a viewport that does not exist. The virtualizer is covered by
 * Playwright; this is covered here.
 */

export type FeedRow =
  | {
      readonly kind: 'day';
      readonly key: string;
      readonly date: LocalDate;
      /** Income minus expense for the day, in base minor units. */
      readonly netMinor: Minor;
      readonly count: number;
      readonly isToday: boolean;
      /** Strictly after today: every occurrence under it is projected. */
      readonly isFuture: boolean;
    }
  | { readonly kind: 'row'; readonly key: string; readonly date: LocalDate; readonly occurrence: Occurrence }
  | { readonly kind: 'horizon'; readonly key: string; readonly through: LocalDate };

export type FlattenOptions = {
  readonly today: LocalDate;
  /** Newest first, as every bank statement is. */
  readonly order?: 'desc' | 'asc';
  /** Renders the "Projections shown through ..." marker at the end. */
  readonly horizon?: LocalDate;
};

/** Searchable text per occurrence, supplied by the caller (domain has no DB). */
export type FeedLookup = {
  readonly categoryName: (id: string) => string | undefined;
  readonly paymentMethodLabel: (id: string) => string | undefined;
};

/**
 * Sort key for an occurrence within its day.
 *
 * Ties break on `originalDate` then `key`, both stable: two occurrences moved
 * onto the same day would otherwise swap places between renders, and a
 * virtualizer re-measures every row whose index changed.
 */
function compareWithinDay(a: Occurrence, b: Occurrence): number {
  return compareLocal(a.originalDate, b.originalDate) || a.key.localeCompare(b.key);
}

export function flattenFeed(occurrences: readonly Occurrence[], options: FlattenOptions): FeedRow[] {
  const { today, order = 'desc' } = options;

  const byDay = new Map<LocalDate, Occurrence[]>();
  for (const occurrence of occurrences) {
    const bucket = byDay.get(occurrence.date);
    if (bucket === undefined) byDay.set(occurrence.date, [occurrence]);
    else bucket.push(occurrence);
  }

  const direction = order === 'desc' ? -1 : 1;
  const days = [...byDay.keys()].sort((a, b) => compareLocal(a, b) * direction);

  const rows: FeedRow[] = [];
  for (const date of days) {
    const items = (byDay.get(date) ?? []).sort(compareWithinDay);

    const income = sum(
      items.filter((o) => o.transaction.kind === 'income').map((o) => o.money.baseAmountMinor),
    );
    const expense = sum(
      items.filter((o) => o.transaction.kind === 'expense').map((o) => o.money.baseAmountMinor),
    );

    rows.push({
      kind: 'day',
      key: `day:${date}`,
      date,
      netMinor: income - expense,
      count: items.length,
      isToday: date === today,
      // Strictly after today. Today's occurrences are NOT projected - they are
      // money that has already moved, and the balance counts them.
      isFuture: compareLocal(date, today) > 0,
    });

    for (const occurrence of items) {
      rows.push({ kind: 'row', key: occurrence.key, date, occurrence });
    }
  }

  if (options.horizon !== undefined && rows.length > 0) {
    // So the future does not simply stop dead with no explanation.
    rows.push({ kind: 'horizon', key: `horizon:${options.horizon}`, through: options.horizon });
  }

  return rows;
}

/**
 * Indices of the day headers, for the virtualizer's `rangeExtractor`.
 *
 * Only ONE header can be pinned at a time, so the extractor needs the whole set
 * to find the active one - hence a precomputed array rather than a scan per
 * range change.
 */
export function headerIndices(rows: readonly FeedRow[]): number[] {
  const indices: number[] = [];
  rows.forEach((row, index) => {
    if (row.kind === 'day') indices.push(index);
  });
  return indices;
}

/** The header that should be stuck to the top for a given first visible index. */
export function activeHeaderIndex(headers: readonly number[], firstVisible: number): number | undefined {
  let active: number | undefined;
  for (const index of headers) {
    if (index > firstVisible) break;
    active = index;
  }
  return active;
}

/**
 * The item at a scroll offset: the last one, in the order they are laid out,
 * whose start is at or above it. Not simply the first item drawn - the drawn
 * range begins with overscan rows above the screen, and with a pinned header
 * the extractor puts before them.
 *
 * Above the first item, the first item; with none, nothing.
 */
export function indexAtOffset(
  items: readonly { readonly index: number; readonly start: number }[],
  offset: number,
): number | undefined {
  let found: { readonly index: number; readonly start: number } | undefined;
  for (const item of items) {
    if (item.start <= offset && (found === undefined || item.start >= found.start)) found = item;
  }
  return (found ?? items[0])?.index;
}

/**
 * Apply the URL filters to an already-expanded window.
 *
 * Kept out of the expansion memo on purpose: typing in the search box must not
 * re-run `expandOccurrences`, let alone re-query IndexedDB. The three memo
 * layers have deliberately different dependency sets, and this is the only one
 * that depends on the filters.
 */
export function applyFeedFilters(
  occurrences: readonly Occurrence[],
  filters: FeedFilters,
  lookup: FeedLookup,
): Occurrence[] {
  const needle = filters.query.trim().toLocaleLowerCase();
  const categories = new Set(filters.categoryIds);
  const methods = new Set(filters.paymentMethodIds);

  return occurrences.filter((o) => {
    if (!matchesKind(filters.kind, o.transaction.kind)) return false;
    if (categories.size > 0 && !categories.has(o.categoryId)) return false;
    if (methods.size > 0) {
      // Income is found by the account it went to, as an expense is by its card:
      // the bank account's "Incoming" line links here with that account.
      const matches =
        (o.paymentMethodId !== undefined && methods.has(o.paymentMethodId)) ||
        (o.destinationId !== undefined && methods.has(o.destinationId));
      if (!matches) return false;
    }
    if (needle.length === 0) return true;

    // Note, category, payment method and where income went - what is visible on the row.
    // Searching a field the user cannot see returns results they cannot explain.
    const haystack = [
      o.note,
      lookup.categoryName(o.categoryId),
      o.paymentMethodId === undefined ? undefined : lookup.paymentMethodLabel(o.paymentMethodId),
      o.destinationId === undefined ? undefined : lookup.paymentMethodLabel(o.destinationId),
    ];
    return haystack.some((value) => value?.toLocaleLowerCase().includes(needle) === true);
  });
}

/** Why the feed is empty, so each case can say something useful. */
export type EmptyReason = 'no_data' | 'no_results' | 'empty_month';

export function emptyReason(
  totalInWindow: number,
  afterFilters: number,
  hasAnyTransactions: boolean,
): EmptyReason | undefined {
  if (afterFilters > 0) return undefined;
  // Four distinct empty states, because "Nothing here" answers none of the
  // questions a user actually has at each of them.
  if (!hasAnyTransactions) return 'no_data';
  if (totalInWindow === 0) return 'empty_month';
  return 'no_results';
}
