import { compareLocal, SERIES_MAX } from '@/lib/dates';
import type { Override, Transaction } from '@/types/domain';
import type { LocalDate } from '@/types/money';

/**
 * The ONE gateway for the denormalised fields.
 *
 * `seriesStart`, `seriesEnd` and `isDeleted` exist only so the interval index
 * can work. They must never drift from the authoritative fields, so every write
 * goes through here.
 *
 * Deliberately NOT a Dexie creating/updating hook: hooks also fire inside
 * bulkPut during import (slow, and surprising), and they make transaction
 * boundaries harder to reason about.
 */
export type TransactionDraft = Omit<Transaction, 'seriesStart' | 'seriesEnd' | 'isDeleted'> & {
  readonly seriesStart?: LocalDate;
  readonly seriesEnd?: LocalDate;
  readonly isDeleted?: 0 | 1;
};

/**
 * Compute seriesEnd, WIDENED to cover any override that moves an occurrence
 * later than the series would otherwise reach.
 *
 * Without the widening, the moved-occurrence fix in expandOccurrences is dead
 * code: a series that ended in 2021 with an occurrence moved into 2026 is never
 * returned by the interval query, so expansion never sees it and the money
 * stays invisible. The two halves of that fix have to agree.
 */
export function computeSeriesEnd(
  tx: Pick<Transaction, 'id' | 'date' | 'recurrence'>,
  overrides: readonly Override[] = [],
): LocalDate {
  let end = tx.recurrence.type === 'one_time' ? tx.date : (tx.recurrence.endDate ?? SERIES_MAX);

  for (const o of overrides) {
    if (o.transactionId !== tx.id) continue;
    if (o.action !== 'modify') continue;
    const moved = o.patch.date;
    if (moved !== undefined && compareLocal(moved, end) > 0) end = moved;
  }

  return end;
}

export function materialize(draft: TransactionDraft, overrides: readonly Override[] = []): Transaction {
  return {
    ...draft,
    seriesStart: draft.date,
    seriesEnd: computeSeriesEnd(draft, overrides),
    isDeleted: draft.deletedAt === undefined ? 0 : 1,
  };
}

/** Dev-only invariant check, used by the integrity repair pass. */
export function assertMaterialized(tx: Transaction, overrides: readonly Override[] = []): string[] {
  const problems: string[] = [];
  if (tx.seriesStart !== tx.date) problems.push(`seriesStart ${tx.seriesStart} !== date ${tx.date}`);

  const expectedEnd = computeSeriesEnd(tx, overrides);
  if (tx.seriesEnd !== expectedEnd) problems.push(`seriesEnd ${tx.seriesEnd} !== ${expectedEnd}`);

  const expectedDeleted = tx.deletedAt === undefined ? 0 : 1;
  if (tx.isDeleted !== expectedDeleted) {
    problems.push(`isDeleted ${String(tx.isDeleted)} !== ${String(expectedDeleted)}`);
  }

  // A one-time transaction cannot outlive its own date.
  if (tx.recurrence.type === 'one_time' && tx.seriesEnd !== expectedEnd) {
    problems.push('one_time seriesEnd must equal its date (or a moved override)');
  }
  return problems;
}
