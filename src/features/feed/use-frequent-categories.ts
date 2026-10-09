import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';

import { db } from '@/db/db';
import { findCandidates, findOverrides } from '@/db/repos/transactions';
import { frequentCategories } from '@/domain/category-usage';
import { expandOccurrences } from '@/domain/occurrences';
import { addDays } from '@/lib/dates';
import { ALL_PROFILES, type Category, type Occurrence, type Override } from '@/types/domain';
import type { Kind, LocalDate } from '@/types/money';

/** How far back "used most often" looks. */
const LOOKBACK_DAYS = 90;

/**
 * The categories a row's pop-out offers, most used first: the household's
 * occurrences of the last 90 days, every profile's, read only while a
 * category pop-out is open. Undefined while they load.
 */
export function useFrequentCategories(
  kind: Kind,
  currentId: string,
  categories: readonly Category[],
  today: LocalDate,
): readonly Category[] | undefined {
  const recent = useLiveQuery(async (): Promise<readonly Occurrence[]> => {
    const from = addDays(today, -LOOKBACK_DAYS);
    const transactions = await findCandidates(db, { profileId: ALL_PROFILES, from, to: today });
    const overrides = await findOverrides(
      db,
      transactions.map((t) => t.id),
    );
    const byTransaction = new Map<string, Override[]>();
    for (const o of overrides) {
      const list = byTransaction.get(o.transactionId);
      if (list === undefined) byTransaction.set(o.transactionId, [o]);
      else list.push(o);
    }
    return transactions.flatMap((tx) =>
      expandOccurrences(tx, byTransaction.get(tx.id) ?? [], from, today, { today }),
    );
  }, [today]);

  return useMemo(
    () => (recent === undefined ? undefined : frequentCategories(recent, categories, kind, currentId)),
    [recent, categories, kind, currentId],
  );
}
