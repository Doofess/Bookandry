import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { loadCashInput } from '@/db/repos/cash-moves';
import { cashActivity, cashSummary, compareStarts, type CashActivity, type CashSummary } from '@/domain/cash';
import type { CashMove } from '@/types/domain';
import type { LocalDate } from '@/types/money';

/**
 * A person with more than one live start: two devices set up offline and
 * synced. `keep` is the earliest (`compareStarts`), the only one the figure
 * counts; `extra` count for nothing until they are removed.
 */
export type TwoStarts = {
  readonly profileId: string;
  readonly keep: CashMove;
  readonly extra: readonly CashMove[];
};

export type CashData = {
  readonly summary: CashSummary;
  readonly activity: readonly CashActivity[];
  /** The people in view with more than one live start, to put right. */
  readonly twoStarts: readonly TwoStarts[];
};

function findTwoStarts(profileIds: readonly string[], moves: readonly CashMove[]): TwoStarts[] {
  const found: TwoStarts[] = [];
  for (const profileId of profileIds) {
    const starts = moves
      .filter((m) => m.isDeleted === 0 && m.kind === 'start' && m.profileId === profileId)
      .sort(compareStarts);
    const [keep, ...extra] = starts;
    if (keep !== undefined && extra.length > 0) found.push({ profileId, keep, extra });
  }
  return found;
}

/** The cash figure and its activity for one person, or everyone - live. */
export function useCashData(profileId: string, today: LocalDate): CashData | undefined {
  return useLiveQuery(async () => {
    const input = await loadCashInput(db, { profileId, today });
    return {
      summary: cashSummary(input),
      activity: cashActivity(input),
      twoStarts: findTwoStarts(input.profileIds, input.moves),
    };
  }, [profileId, today]);
}
