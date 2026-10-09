import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { loadCashInput } from '@/db/repos/cash-moves';
import { cashActivity, cashSummary, type CashActivity, type CashSummary } from '@/domain/cash';
import { compareLocal } from '@/lib/dates';
import type { CashMove } from '@/types/domain';
import type { LocalDate } from '@/types/money';

/**
 * A person with more than one live start: two devices set up offline and
 * synced. `keep` is the earliest, the one the figure already counts from.
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

/** Earliest first: by date, then by when it was written, then by id - stable everywhere. */
const earliest = (a: CashMove, b: CashMove): number =>
  compareLocal(a.date, b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

function findTwoStarts(profileIds: readonly string[], moves: readonly CashMove[]): TwoStarts[] {
  const found: TwoStarts[] = [];
  for (const profileId of profileIds) {
    const starts = moves
      .filter((m) => m.isDeleted === 0 && m.kind === 'start' && m.profileId === profileId)
      .sort(earliest);
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
