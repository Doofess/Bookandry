import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { loadCashInput } from '@/db/repos/cash-moves';
import { cashActivity, cashSummary, compareStarts, type CashActivity, type CashSummary } from '@/domain/cash';
import { compareLocal } from '@/lib/dates';
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
  /**
   * Each person's earliest live withdrawal or deposit: their start cannot be
   * moved past it, or it would vanish from the figure and the list.
   */
  readonly firstMoves: ReadonlyMap<string, LocalDate>;
};

function findFirstMoves(moves: readonly CashMove[]): Map<string, LocalDate> {
  const first = new Map<string, LocalDate>();
  for (const m of moves) {
    if (m.isDeleted !== 0 || (m.kind !== 'withdraw' && m.kind !== 'deposit')) continue;
    const seen = first.get(m.profileId);
    if (seen === undefined || compareLocal(m.date, seen) < 0) first.set(m.profileId, m.date);
  }
  return first;
}

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
      firstMoves: findFirstMoves(input.moves),
    };
  }, [profileId, today]);
}
