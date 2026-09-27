import type { Occurrence, Override } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import type { BookandryDB } from './db';
import { restoreDeleted, softDelete } from './repos/transactions';

/**
 * Skipping, restoring and deleting - the three destructive-ish row actions.
 *
 * All three are reversible, and the plan is emphatic about why: on a device
 * with no backup and no sync, anything that removes data without a way back is
 * permanent loss. So a delete is a tombstone with a 24-hour window, a skip is
 * an override that can be removed, and neither ever drops a row outright.
 */

export type UndoableAction = {
  /**
   * The inverse, applied when the user takes the toast's Undo.
   *
   * Takes the instant rather than reading a clock, so the restored row's
   * `updatedAt` is when the undo HAPPENED - which is what decides the winner
   * the next time two devices' exports are merged. Reusing the delete's
   * timestamp would make an undo lose to the delete it reversed.
   */
  readonly undo: (now: IsoInstant) => Promise<void>;
};

/**
 * Mark one occurrence as not having happened.
 *
 * Writes a `skip` override rather than deleting anything, because the
 * occurrence is generated from a rule and there is nothing to delete. The
 * unique `[transactionId+occurrenceDate]` index allows one override per slot,
 * so a skip on an already-edited occurrence REPLACES that row - which is why
 * the superseded patch is carried across rather than discarded.
 */
export async function skipOccurrence(
  db: BookandryDB,
  occurrence: Occurrence,
  now: IsoInstant,
  newId: () => string,
): Promise<UndoableAction> {
  const transactionId = occurrence.transaction.id;
  const at = occurrence.originalDate;

  await db.transaction('rw', db.overrides, async () => {
    const existing = await db.overrides
      .where('[transactionId+occurrenceDate]')
      .equals([transactionId, at])
      .first();

    const row: Override = {
      // The SAME id when one exists. A delete-then-insert would work today and
      // throw ConstraintError the moment the two halves are reordered.
      id: existing?.id ?? newId(),
      transactionId,
      occurrenceDate: at,
      action: 'skip',
      ...(existing?.patch === undefined ? {} : { patch: existing.patch }),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await db.overrides.put(row);
  });

  return {
    undo: async (undoneAt: IsoInstant) => {
      await restoreOccurrence(db, occurrence, undoneAt, newId);
    },
  };
}

/**
 * Un-skip: delete the skip row, or put back the edit it superseded.
 *
 * NEVER an "unskip" action recorded as a third state. That would pile
 * tombstones against the unique index and start throwing ConstraintError after
 * a few skip/undo cycles - and an occurrence that is neither skipped nor
 * modified is exactly an occurrence with no override.
 */
export async function restoreOccurrence(
  db: BookandryDB,
  occurrence: Occurrence,
  now: IsoInstant,
  newId: () => string,
): Promise<UndoableAction> {
  const transactionId = occurrence.transaction.id;
  const at = occurrence.originalDate;

  await db.transaction('rw', db.overrides, async () => {
    const existing = await db.overrides
      .where('[transactionId+occurrenceDate]')
      .equals([transactionId, at])
      .first();

    if (existing === undefined) return;

    if (existing.action === 'skip' && existing.patch !== undefined) {
      // The occurrence had its own edit before it was skipped. Restoring it as
      // a plain slot would quietly revert it to the series' values.
      await db.overrides.put({
        id: existing.id,
        transactionId,
        occurrenceDate: at,
        action: 'modify',
        patch: existing.patch,
        createdAt: existing.createdAt,
        updatedAt: now,
      });
      return;
    }

    await db.overrides.delete(existing.id);
  });

  return {
    undo: async (undoneAt: IsoInstant) => {
      await skipOccurrence(db, occurrence, undoneAt, newId);
    },
  };
}

/**
 * Soft-delete a whole series (or a one-time transaction).
 *
 * The row stays queryable for 24 hours: the toast's Undo is a convenience, not
 * the recovery story. The plan is explicit that hard-deleting on toast dismissal
 * is unsafe, because `onDismiss` also fires when someone swipes a toast away to
 * clear clutter - which would make tidying the screen destroy data.
 */
export async function deleteTransaction(
  db: BookandryDB,
  transactionId: string,
  now: IsoInstant,
): Promise<UndoableAction> {
  await softDelete(db, transactionId, now);

  return {
    undo: async (undoneAt: IsoInstant) => {
      await restoreDeleted(db, transactionId, undoneAt);
    },
  };
}
