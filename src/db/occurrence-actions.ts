import {
  planSeriesEdit,
  type EditScope,
  type SeriesEditPlan,
  type TransactionPatch,
} from '@/domain/series-edit';
import { compareLocal } from '@/lib/dates';
import type { Occurrence, Override, Transaction } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import type { BookandryDB } from './db';
import { materialize } from './materialize';
import { restoreDeleted, softDelete } from './repos/transactions';
import { applySeriesEdit } from './series-edit';

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

/**
 * Apply a series-edit plan and keep what it overwrote, so Undo puts back
 * every row it touched exactly as it was.
 *
 * A row that did not exist before (a split's continuation, a new override)
 * is deleted on undo; every other row is written back whole, stamped with
 * the undo instant so it wins a later merge. Both halves are one transaction.
 *
 * Undo refuses, whole, once any of those rows has changed since: the series
 * deleted, or the same row saved again, inside the toast's window. Putting
 * the old rows back then would silently overwrite that later change. Each
 * row's `updatedAt` as the plan left it (or its absence) is the witness.
 */
export async function applyUndoablePlan(db: BookandryDB, plan: SeriesEditPlan): Promise<UndoableAction> {
  const transactionIds = plan.transactions.map((t) => t.id);
  const overrideIds = [...new Set([...plan.overrides.map((o) => o.id), ...plan.deleteOverrideIds])];
  let transactionsBefore: readonly (Transaction | undefined)[] = [];
  let overridesBefore: readonly (Override | undefined)[] = [];
  let written: readonly (IsoInstant | undefined)[] = [];

  const stamps = async (): Promise<readonly (IsoInstant | undefined)[]> => [
    ...(await db.transactions.bulkGet(transactionIds)).map((row) => row?.updatedAt),
    ...(await db.overrides.bulkGet(overrideIds)).map((row) => row?.updatedAt),
  ];

  await db.transaction('rw', [db.transactions, db.overrides], async () => {
    transactionsBefore = await db.transactions.bulkGet(transactionIds);
    overridesBefore = await db.overrides.bulkGet(overrideIds);
    await applySeriesEdit(db, plan);
    written = await stamps();
  });

  return {
    undo: async (undoneAt: IsoInstant) => {
      await db.transaction('rw', [db.transactions, db.overrides], async () => {
        const now = await stamps();
        // Thrown inside the transaction, so nothing below is written.
        if (now.some((stamp, i) => stamp !== written[i])) throw new Error('changed_since');
        for (const [i, id] of overrideIds.entries()) {
          const before = overridesBefore[i];
          if (before === undefined) await db.overrides.delete(id);
          else await db.overrides.put({ ...before, updatedAt: undoneAt });
        }
        for (const [i, id] of transactionIds.entries()) {
          const before = transactionsBefore[i];
          if (before === undefined) await db.transactions.delete(id);
          else await db.transactions.put({ ...before, updatedAt: undoneAt });
        }
      });
    },
  };
}

/**
 * One edit of one occurrence, through exactly the path the edit form takes
 * (`planSeriesEdit`, then `applySeriesEdit`), so overrides and splits behave
 * as they do there. Throws when the plan is refused or the row is gone.
 */
export async function editOccurrence(
  db: BookandryDB,
  input: {
    readonly occurrence: Occurrence;
    readonly scope: EditScope;
    readonly patch: TransactionPatch;
    readonly today: LocalDate;
    readonly now: IsoInstant;
    readonly newId: () => string;
  },
): Promise<UndoableAction> {
  const transaction = await db.transactions.get(input.occurrence.transaction.id);
  if (transaction === undefined || transaction.isDeleted === 1) throw new Error('gone');
  const overrides = await db.overrides.where('transactionId').equals(transaction.id).toArray();

  const planned = planSeriesEdit({
    transaction,
    overrides,
    scope: input.scope,
    // The ORIGINAL slot, never the moved date: it is the override's key.
    at: input.occurrence.originalDate,
    patch: input.patch,
    today: input.today,
    now: input.now,
    newId: input.newId,
  });
  if (!planned.ok) throw new Error(planned.error.kind);
  return applyUndoablePlan(db, planned.plan);
}

/**
 * The category pop-out's write. "Only this time" is scope `one`; "from now on"
 * is `future` for a plain series; "every payment" is `all` for a plan, which
 * the domain never splits - the same choices the edit form's scope offers.
 */
export async function changeCategory(
  db: BookandryDB,
  input: {
    readonly occurrence: Occurrence;
    readonly categoryId: string;
    readonly scope: 'one' | 'future' | 'all';
    readonly today: LocalDate;
    readonly now: IsoInstant;
    readonly newId: () => string;
  },
): Promise<UndoableAction> {
  const { categoryId, ...rest } = input;
  return editOccurrence(db, { ...rest, patch: { categoryId } });
}

/**
 * Move a projected occurrence to another day: "Charged today", or a date
 * picked in the "not counted yet" pop-out.
 *
 * A series occurrence moves the way the edit form moves one: a `modify`
 * override at scope `one`, which keeps any amount or note already changed on
 * it. A one-time row is its own only occurrence and the planner never moves a
 * date outside scope `one`, so its own date moves instead, and an override on
 * that day moves with it; that also keeps `seriesStart` in step, so the feed
 * still finds it. A series occurrence cannot move to before the series' own
 * start: nothing would find it there.
 *
 * Only the date moves: the money keeps its snapshot, rate and all. A changed
 * amount is the edit form's job ("A different amount…").
 */
export async function moveOccurrence(
  db: BookandryDB,
  input: {
    readonly occurrence: Occurrence;
    readonly to: LocalDate;
    readonly today: LocalDate;
    readonly now: IsoInstant;
    readonly newId: () => string;
  },
): Promise<UndoableAction> {
  const transaction = await db.transactions.get(input.occurrence.transaction.id);
  if (transaction === undefined || transaction.isDeleted === 1) throw new Error('gone');

  if (transaction.recurrence.type === 'one_time') {
    const owned = await db.overrides.where('transactionId').equals(transaction.id).toArray();
    return applyUndoablePlan(db, {
      transactions: [{ ...transaction, date: input.to, updatedAt: input.now }],
      overrides: owned
        .filter((o) => o.occurrenceDate === transaction.date)
        .map((o) => ({ ...o, occurrenceDate: input.to, updatedAt: input.now })),
      deleteOverrideIds: [],
      warnings: [],
      effectiveScope: 'all',
    });
  }

  if (compareLocal(input.to, transaction.date) < 0) throw new Error('before_series_start');
  const overrides = await db.overrides.where('transactionId').equals(transaction.id).toArray();
  const planned = planSeriesEdit({
    transaction,
    overrides,
    scope: 'one',
    // The ORIGINAL slot, never the moved date: it is the override's key.
    at: input.occurrence.originalDate,
    patch: { date: input.to },
    today: input.today,
    now: input.now,
    newId: input.newId,
  });
  if (!planned.ok) throw new Error(planned.error.kind);
  /*
   * Scope `one` writes the override alone. The series goes through with it
   * only when the override changes what the series row stores: a payment
   * moved past the series' end widens `seriesEnd` (or one moved back
   * narrows it), and `applySeriesEdit` materialises the series against the new
   * override, so the feed still finds it in its new month.
   *
   * Otherwise the series is left alone, row and sync state both. Sync is
   * whole-row last-write-wins: re-putting an unchanged series would push this
   * device's copy over an edit to it that another device made and this one has
   * not pulled yet. Undo restores only what the plan wrote, so it leaves the
   * series alone too.
   */
  const { plan } = planned;
  const written = new Set(plan.overrides.map((o) => o.id));
  const after = [...overrides.filter((o) => !written.has(o.id)), ...plan.overrides];
  const rematerialized = materialize(transaction, after);
  const changes =
    rematerialized.seriesStart !== transaction.seriesStart ||
    rematerialized.seriesEnd !== transaction.seriesEnd;
  return applyUndoablePlan(db, changes ? { ...plan, transactions: [transaction] } : plan);
}
