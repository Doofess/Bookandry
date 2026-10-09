import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { findCandidates, findOverrides } from '@/db/repos/transactions';
import { DESTINATION_HISTORY_MONTHS } from '@/domain/income-destination';
import { expandOccurrences } from '@/domain/occurrences';
import { addMonthsClamped } from '@/lib/dates';
import { ALL_PROFILES, type Occurrence } from '@/types/domain';
import type { LocalDate } from '@/types/money';

/**
 * Everyone's income over the last six months, as payments: what "Goes to"
 * defaults from (`defaultDestination`). Live, and started with the screen
 * rather than the sheet, so it has long arrived by the time Add is tapped.
 */
export function useIncomeHistory(today: LocalDate): readonly Occurrence[] | undefined {
  return useLiveQuery(async () => {
    const from = addMonthsClamped(today, -DESTINATION_HISTORY_MONTHS);
    const income = (await findCandidates(db, { profileId: ALL_PROFILES, from, to: today })).filter(
      (tx) => tx.kind === 'income',
    );
    const overrides = await findOverrides(
      db,
      income.map((tx) => tx.id),
    );
    return income.flatMap((tx) =>
      expandOccurrences(
        tx,
        overrides.filter((o) => o.transactionId === tx.id),
        from,
        today,
        { today },
      ),
    );
  }, [today]);
}
