import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useMemo } from 'react';

import { db } from '@/db/db';
import { findCandidates, findOverrides } from '@/db/repos/transactions';
import { applyFeedFilters, flattenFeed, type FeedRow } from '@/domain/feed';
import type { FeedFilters } from '@/domain/feed-filters';
import { expandOccurrences } from '@/domain/occurrences';
import { endOfMonth, startOfMonth } from '@/lib/dates';
import type { Category, Occurrence, Override, PaymentMethod, Profile, Transaction } from '@/types/domain';
import type { LocalDate } from '@/types/money';

/**
 * Three memo layers with DELIBERATELY different dependency sets.
 *
 * 5,000 transactions across ten years of monthly series is ~600,000 occurrence
 * objects, or 90-150MB. The answer is not to compute it faster; it is to refuse
 * to compute it at all:
 *
 *   A  Dexie interval query   deps: profile + window          NOT filters
 *   B  expansion              deps: candidates + window + today   NOT filters
 *   C  filter, group, flatten deps: everything, over <= 2k items
 *
 * That split is the whole performance design. Typing in the search box must not
 * touch IndexedDB and must not re-expand a single series - it re-runs C only.
 * Collapse the layers into one memo and every keystroke re-queries the database.
 *
 * A worker is deliberately NOT used: structured-cloning 600k objects costs more
 * than computing them, so it only helps in the case where it also cannot help.
 */

export type FeedWindow = { readonly from: LocalDate; readonly to: LocalDate };

export function monthWindow(month: LocalDate): FeedWindow {
  return { from: startOfMonth(month), to: endOfMonth(month) };
}

export type FeedCandidates = {
  readonly transactions: readonly Transaction[];
  readonly overrides: readonly Override[];
};

/**
 * Layer A: the interval query.
 *
 * Deps are the profile and the window ONLY. `useLiveQuery` re-runs whenever
 * IndexedDB changes, which is what keeps the feed live after a save - but it
 * must never re-run because the user typed a letter.
 */
export function useCandidates(profileId: string, window: FeedWindow): FeedCandidates | undefined {
  return useLiveQuery(async () => {
    const transactions = await findCandidates(db, { profileId, from: window.from, to: window.to });
    const overrides = await findOverrides(
      db,
      transactions.map((t) => t.id),
    );
    return { transactions, overrides };
  }, [profileId, window.from, window.to]);
}

/** Layer B: expansion. Pure, and pointedly independent of the filters. */
export function useOccurrences(
  candidates: FeedCandidates | undefined,
  window: FeedWindow,
  today: LocalDate,
): readonly Occurrence[] | undefined {
  return useMemo(() => {
    if (candidates === undefined) return undefined;

    const byTransaction = new Map<string, Override[]>();
    for (const override of candidates.overrides) {
      const list = byTransaction.get(override.transactionId);
      if (list === undefined) byTransaction.set(override.transactionId, [override]);
      else list.push(override);
    }

    return candidates.transactions.flatMap((tx) =>
      expandOccurrences(tx, byTransaction.get(tx.id) ?? [], window.from, window.to, { today }),
    );
  }, [candidates, window.from, window.to, today]);
}

export type FeedLookups = {
  readonly profiles: readonly Profile[];
  readonly categories: ReadonlyMap<string, Category>;
  readonly paymentMethods: ReadonlyMap<string, PaymentMethod>;
};

/**
 * Reference data, queried once for the whole screen.
 *
 * `useLiveQuery` is confined to hooks and route containers. One subscription per
 * feed row - which is what a per-row category lookup would become - is
 * thousands of IndexedDB observers on a list the user is flinging past.
 */
export function useFeedLookups(): FeedLookups | undefined {
  return useLiveQuery(async () => {
    const [profiles, categories, paymentMethods] = await Promise.all([
      db.profiles.toArray(),
      db.categories.toArray(),
      db.paymentMethods.toArray(),
    ]);
    return {
      profiles,
      categories: new Map(categories.map((c) => [c.id, c])),
      paymentMethods: new Map(paymentMethods.map((m) => [m.id, m])),
    };
  }, []);
}

export type FeedResult = {
  readonly rows: readonly FeedRow[];
  readonly filtered: readonly Occurrence[];
  /** Before filtering, so an empty result can say WHY it is empty. */
  readonly windowCount: number;
  readonly isLoading: boolean;
};

/**
 * Layer C: filter, group, flatten.
 *
 * Runs over at most a couple of thousand occurrences, so it is cheap enough to
 * redo on every keystroke - which it will, because `query` is in its deps.
 *
 * The search term goes through `useDeferredValue`: typing stays at input
 * priority while the list re-renders behind it, so a slow frame lands on the
 * list rather than on the cursor.
 */
export function useFeedRows(
  occurrences: readonly Occurrence[] | undefined,
  filters: FeedFilters,
  lookups: FeedLookups | undefined,
  today: LocalDate,
  /**
   * Resolves a category to the text the user can SEE.
   *
   * Passed in rather than derived here, because a built-in category stores an
   * i18n key and not a name. Matching the key would let an English speaker find
   * "groceries" and leave a Hebrew speaker unable to search for מצרכים at all -
   * searching a string that is never on screen is the same defect in reverse.
   */
  categoryName: (category: Category) => string,
  /**
   * The same argument, for the same reason: cash is a BUILT-IN method whose
   * name follows the UI language, so the string on screen is not the string in
   * the row. Resolving it here rather than reading `label` is what lets a
   * Hebrew speaker find מזומן.
   */
  methodName: (method: PaymentMethod) => string,
): FeedResult {
  const deferredQuery = useDeferredValue(filters.query);

  return useMemo(() => {
    if (occurrences === undefined || lookups === undefined) {
      return { rows: [], filtered: [], windowCount: 0, isLoading: true };
    }

    const filtered = applyFeedFilters(
      occurrences,
      { ...filters, query: deferredQuery },
      {
        categoryName: (id) => {
          const category = lookups.categories.get(id);
          return category === undefined ? undefined : categoryName(category);
        },
        paymentMethodLabel: (id) => {
          // The NAME the user can see, for the same reason the category lookup
          // resolves one: searching a string that is never on screen is a
          // search that silently does not work.
          const method = lookups.paymentMethods.get(id);
          return method === undefined ? undefined : methodName(method);
        },
      },
    );

    return {
      rows: flattenFeed(filtered, { today }),
      filtered,
      windowCount: occurrences.length,
      isLoading: false,
    };
  }, [occurrences, lookups, filters, deferredQuery, today, categoryName, methodName]);
}
