import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { loadIncomeOccurrences } from '@/db/repos/transactions';
import { DESTINATION_HISTORY_MONTHS } from '@/domain/income-destination';
import { addMonthsClamped } from '@/lib/dates';
import type { Occurrence } from '@/types/domain';
import type { LocalDate } from '@/types/money';

/**
 * Everyone's income over the last six months, as payments: what "Goes to"
 * defaults from (`defaultDestination`). Live, and started with the screen
 * rather than the sheet, so it has long arrived by the time Add is tapped.
 */
export function useIncomeHistory(today: LocalDate): readonly Occurrence[] | undefined {
  return useLiveQuery(
    () =>
      loadIncomeOccurrences(db, {
        from: addMonthsClamped(today, -DESTINATION_HISTORY_MONTHS),
        to: today,
        today,
      }),
    [today],
  );
}
