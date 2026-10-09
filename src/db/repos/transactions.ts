import type { BookandryDB } from '@/db/db';
import { LOCK_SWEEP, withLock } from '@/db/lock';
import { materialize, type TransactionDraft } from '@/db/materialize';
import { SYNC_CURSOR_KEY } from '@/db/sync/tables';
import { isMcc } from '@/domain/mcc';
import { defaultCategoryForMcc } from '@/domain/mcc-categories';
import { merchantKey } from '@/domain/merchant-key';
import { expandOccurrences } from '@/domain/occurrences';
import { compareLocal, instantFromMs } from '@/lib/dates';
import type { Occurrence, Override, Transaction } from '@/types/domain';
import type { IsoInstant, Kind, LocalDate } from '@/types/money';

export const ALL_PROFILES = 'all';

/**
 * How long a soft-deleted row stays recoverable.
 *
 * The toast offers Undo for 6 seconds, but the row survives for 24 HOURS and is
 * listed under Settings > Recently deleted.
 *
 * The spec hard-deleted on toast expiry, which is unsafe two ways: `onDismiss`
 * fires when the user swipes the toast away to clear clutter (purging at
 * t~0.8s), and `onAutoClose` never fires at all if the tab closes or the route
 * changes, leaving tombstones forever. Mobile delete is a SWIPE - the highest
 * accident-rate gesture in any list - so 30 seconds of grace helps nobody who
 * realises in the shower.
 */
export const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type TransactionQuery = {
  readonly profileId: string;
  readonly from: LocalDate;
  readonly to: LocalDate;
};

/**
 * Candidate transactions whose series interval overlaps [from, to].
 *
 * Half of interval overlap is done by the B-tree (seriesEnd >= from); the other
 * half (seriesStart <= to) is an in-memory filter over the already-narrow
 * result. IndexedDB cannot express both bounds in one index.
 */
export async function findCandidates(db: BookandryDB, q: TransactionQuery): Promise<Transaction[]> {
  const collection =
    q.profileId === ALL_PROFILES
      ? db.transactions.where('[isDeleted+seriesEnd]').between([0, q.from], [0, '￿'], true, true)
      : db.transactions
          .where('[profileId+isDeleted+seriesEnd]')
          .between([q.profileId, 0, q.from], [q.profileId, 0, '￿'], true, true);

  const rows = await collection.toArray();
  return rows.filter((t) => compareLocal(t.seriesStart, q.to) <= 0);
}

/**
 * How many ids are worth looking up one at a time.
 *
 * `anyOf` walks the index once PER KEY, so 2,000 candidate transactions means
 * 2,000 index seeks - which measured as the single largest cost in loading a
 * dense month. Above this, one full scan of a table that is small by
 * construction wins easily: an override exists only where someone edited a
 * single occurrence of a series, so there are orders of magnitude fewer of them
 * than transactions.
 */
const OVERRIDE_LOOKUP_LIMIT = 200;

/** Overrides for a set of transactions, via the unique compound index. */
export async function findOverrides(db: BookandryDB, ids: readonly string[]): Promise<Override[]> {
  if (ids.length === 0) return [];

  if (ids.length > OVERRIDE_LOOKUP_LIMIT) {
    const wanted = new Set(ids);
    const all = await db.overrides.toArray();
    return all.filter((o) => wanted.has(o.transactionId));
  }

  return db.overrides
    .where('transactionId')
    .anyOf([...ids])
    .toArray();
}

/**
 * Everyone's income over [from, to], expanded into payments with its overrides
 * applied. The one query behind "where income usually lands" and an account's
 * "Incoming" line.
 */
export async function loadIncomeOccurrences(
  db: BookandryDB,
  q: { readonly from: LocalDate; readonly to: LocalDate; readonly today: LocalDate },
): Promise<Occurrence[]> {
  const income = (await findCandidates(db, { profileId: ALL_PROFILES, from: q.from, to: q.to })).filter(
    (tx) => tx.kind === 'income',
  );
  const byTransaction = new Map<string, Override[]>();
  for (const o of await findOverrides(
    db,
    income.map((tx) => tx.id),
  )) {
    const list = byTransaction.get(o.transactionId);
    if (list === undefined) byTransaction.set(o.transactionId, [o]);
    else list.push(o);
  }
  return income.flatMap((tx) =>
    expandOccurrences(tx, byTransaction.get(tx.id) ?? [], q.from, q.to, { today: q.today }),
  );
}

export async function putTransaction(
  db: BookandryDB,
  draft: TransactionDraft,
  overrides: readonly Override[] = [],
): Promise<Transaction> {
  const row = materialize(draft, overrides);
  await db.transactions.put(row);
  return row;
}

/** Soft delete. The row stays queryable for undo and for Recently deleted. */
export async function softDelete(db: BookandryDB, id: string, now: IsoInstant): Promise<void> {
  await db.transactions.update(id, { deletedAt: now, isDeleted: 1, updatedAt: now });
}

export async function restoreDeleted(db: BookandryDB, id: string, now: IsoInstant): Promise<void> {
  await db.transactions.update(id, { deletedAt: undefined, isDeleted: 0, updatedAt: now });
}

export async function listRecentlyDeleted(db: BookandryDB): Promise<Transaction[]> {
  // The deletedAt index contains ONLY soft-deleted rows, because IndexedDB
  // cannot index undefined. What is normally a limitation is exactly the query
  // we want here.
  return db.transactions.where('deletedAt').notEqual('').reverse().toArray();
}

/**
 * Purge rows whose recovery window has elapsed, cascading their overrides.
 *
 * The cascade is the part the spec never mentions: without it, every deleted
 * recurring transaction leaks its per-occurrence edits permanently, and those
 * orphans resurrect if an id is ever reused.
 *
 * Runs on boot and on an interval, independent of any toast.
 */
export async function purgeExpiredDeletions(
  db: BookandryDB,
  nowMs: number,
  windowMs = RECOVERY_WINDOW_MS,
): Promise<{ purged: number; overridesRemoved: number }> {
  const cutoff = instantFromMs(nowMs - windowMs);

  return db.transaction('rw', db.transactions, db.overrides, async () => {
    const expired = await db.transactions.where('deletedAt').below(cutoff).toArray();
    if (expired.length === 0) return { purged: 0, overridesRemoved: 0 };

    const ids = expired.map((t) => t.id);
    const orphans = await db.overrides.where('transactionId').anyOf(ids).primaryKeys();

    await db.overrides.bulkDelete(orphans);
    await db.transactions.bulkDelete(ids);

    return { purged: ids.length, overridesRemoved: orphans.length };
  });
}

/**
 * The sweeper's entry point.
 *
 * Queues rather than refusing: two tabs both sweeping is harmless in outcome
 * but races on the same tombstones, and unlike the reconvert there is no user
 * waiting on a progress bar. The lock-free primitive above stays directly
 * testable.
 */
export async function sweepExpiredDeletions(
  db: BookandryDB,
  nowMs: number,
  windowMs = RECOVERY_WINDOW_MS,
): Promise<{ purged: number; overridesRemoved: number }> {
  return withLock(LOCK_SWEEP, async () => {
    /*
     * A device that syncs purges only inside a sync, right after pulling to
     * the head (see syncOnce). Purging here, on a timer, could hard-delete a
     * row that another device has since RESTORED: this device would not have
     * seen the restore yet, and its purge would then be the newest word on a
     * row somebody deliberately brought back.
     */
    if ((await db.meta.get(SYNC_CURSOR_KEY)) !== undefined) return { purged: 0, overridesRemoved: 0 };
    return purgeExpiredDeletions(db, nowMs, windowMs);
  });
}

/**
 * Undo a per-occurrence skip by DELETING the override row.
 *
 * Never an "unskip" action: that would pile tombstones against the unique
 * [transactionId+occurrenceDate] index and start throwing ConstraintError after
 * a few skip/undo cycles.
 */
export async function removeOverride(
  db: BookandryDB,
  transactionId: string,
  occurrenceDate: LocalDate,
): Promise<void> {
  await db.overrides.where('[transactionId+occurrenceDate]').equals([transactionId, occurrenceDate]).delete();
}

/** What the household's history says about a merchant. */
export type MerchantHistory = {
  /** The person's own choice for this merchant (spec §3 step 2), when there is one. */
  readonly categoryId?: string;
  /** The business type of the newest such expense that has one (spec §2 step 3). */
  readonly mcc?: string;
};

/**
 * Where this name was filed before, and its business type: "Claude Max Plan"
 * goes where the person put it, without asking anyone. What they corrected
 * stays corrected.
 *
 * The same text first - ignoring case and spacing, so "netflix " is Netflix -
 * then the same merchant printed another way (`merchantKey`): "שופרסל דיל 45
 * ת"א" for "שופרסל דיל 123 ת"א". Newest first, every person's, live rows of
 * this kind only.
 *
 * A row filed exactly where the default table files its own business type
 * was filed by the table, not by the person: then there is no choice of
 * theirs to follow, and the business type decides (spec point 5). Without
 * that, a business type moved to another category would never reach a
 * merchant already seen.
 *
 * ONE walk, newest first, that stops as soon as the same text - and, for an
 * expense, the same text with a business type - is found. A name it has never
 * seen reads to the end, as it always did. Callers memoise per import.
 */
export async function merchantHistory(db: BookandryDB, kind: Kind, name: string): Promise<MerchantHistory> {
  const text = sameName(name);
  if (text === '') return {};
  const key = merchantKey(name);
  const seen: {
    byText?: Transaction;
    byKey?: Transaction;
    mccByText?: string;
    mccByKey?: string;
  } = {};
  const done = (): boolean =>
    seen.byText !== undefined && (kind === 'income' || seen.mccByText !== undefined);

  await db.transactions
    .orderBy('updatedAt')
    .reverse()
    .until(done)
    .each((tx) => {
      if (tx.isDeleted !== 0 || tx.kind !== kind) return;
      const note = tx.note ?? '';
      const code = kind === 'expense' && isMcc(tx.mcc) ? tx.mcc : undefined;
      if (sameName(note) === text) {
        seen.byText ??= tx;
        seen.mccByText ??= code;
      } else if (key !== '' && merchantKey(note) === key) {
        seen.byKey ??= tx;
        seen.mccByKey ??= code;
      }
    });

  const decider = seen.byText ?? seen.byKey;
  const mcc = seen.mccByText ?? seen.mccByKey;
  const tableChose = decider?.mcc !== undefined && decider.categoryId === defaultCategoryForMcc(decider.mcc);
  return {
    ...(decider === undefined || tableChose ? {} : { categoryId: decider.categoryId }),
    ...(mcc === undefined ? {} : { mcc }),
  };
}

const sameName = (name: string): string => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
