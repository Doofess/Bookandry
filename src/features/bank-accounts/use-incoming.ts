import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { loadIncomeOccurrences } from '@/db/repos/transactions';
import { nextIncoming } from '@/domain/income-destination';
import { PROJECTION_HORIZON_MONTHS } from '@/domain/occurrences';
import { addDays, addMonthsClamped, endOfMonth } from '@/lib/dates';
import type { Category, Occurrence } from '@/types/domain';
import type { LocalDate } from '@/types/money';

/**
 * The next income expected into each account, as far ahead as the feed
 * projects, and the categories to name it by.
 */
export function useIncoming(
  today: LocalDate,
):
  | { readonly next: ReadonlyMap<string, Occurrence>; readonly categories: ReadonlyMap<string, Category> }
  | undefined {
  return useLiveQuery(async () => {
    const occurrences = await loadIncomeOccurrences(db, {
      from: addDays(today, 1),
      to: endOfMonth(addMonthsClamped(today, PROJECTION_HORIZON_MONTHS)),
      today,
    });
    const categories = new Map((await db.categories.toArray()).map((c) => [c.id, c]));
    return { next: nextIncoming(occurrences, today), categories };
  }, [today]);
}
