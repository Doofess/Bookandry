import { rowSchemas, syncedSettingsSchema } from '@/domain/transfer-schema';
import { instantFromMs } from '@/lib/dates';
import { nextRev, ZERO_REV, type Rev } from '@/lib/rev';
import type { Override } from '@/types/domain';

import { withoutTracking, type BookandryDB } from '../db';
import type { SyncRecord } from './protocol';
import { SYNC_CURSOR_KEY as CURSOR_KEY, SYNCED_TABLES, type OutboxRow } from './tables';
import { DEFAULT_SETTINGS } from '../repos/settings';

export { SYNC_CURSOR_KEY as CURSOR_KEY } from './tables';

export type ApplyReport = {
  /** Newer than what this device had: written. */
  readonly applied: number;
  /** Not newer - already seen, or this device holds a later edit of its own. */
  readonly skipped: number;
  /** Failed validation. Never written; reported, never guessed at. */
  readonly rejected: number;
};

/**
 * Apply one pulled page, all or nothing, and move the cursor with it.
 *
 * One transaction for the page AND the cursor: a crash half way through
 * leaves neither, and the next pull fetches the same page again - which is
 * harmless, because a record that is not newer than what this device holds is
 * skipped. That idempotency is the whole crash-recovery story.
 *
 * The writes are untracked: they ARE the server's state, and tracking them
 * would echo every pull straight back up. The side tables are written by hand
 * instead, with the record's own rev, so this device knows it has seen it.
 *
 * Callers must decrypt BEFORE calling. Awaiting WebCrypto inside a Dexie
 * transaction lets it auto-commit mid-page.
 */
export async function applyPage(
  db: BookandryDB,
  records: readonly SyncRecord[],
  cursor: number,
): Promise<ApplyReport> {
  // From SYNCED_TABLES, never a hand-written list: a new synced table that
  // this list forgot would make every page containing it fail to apply.
  const tables = [...SYNCED_TABLES.map((t) => db.table(t)), db.syncState, db.outbox, db.meta];

  return withoutTracking(db, tables, async () => {
    let applied = 0;
    let skipped = 0;
    let rejected = 0;

    for (const record of records) {
      const local = await db.syncState.get([record.tbl, record.id]);
      if (local !== undefined && record.rev <= local.rev) {
        skipped += 1;
        continue;
      }

      const outcome = await applyOne(db, record);
      if (outcome === 'rejected') {
        rejected += 1;
        continue;
      }
      applied += 1;
    }

    await db.meta.put({ key: CURSOR_KEY, value: cursor });
    return { applied, skipped, rejected };
  });
}

async function applyOne(db: BookandryDB, record: SyncRecord): Promise<'applied' | 'rejected'> {
  if (record.tbl === 'settings') {
    // Settings are never deleted; the only thing that syncs is the currency.
    if (record.deleted) return settle(db, record);
    const parsed = syncedSettingsSchema.safeParse(record.row);
    if (!parsed.success) return 'rejected';
    const current = await db.settings.get(record.id);
    await db.settings.put({
      ...(current ?? { ...DEFAULT_SETTINGS, updatedAt: instantFromMs(0) }),
      defaultCurrency: parsed.data.defaultCurrency,
    });
    return settle(db, record);
  }

  const table = db.table(record.tbl);
  if (record.deleted) {
    await table.delete(record.id);
    return settle(db, record);
  }

  const parsed = rowSchemas[record.tbl].safeParse(record.row);
  if (!parsed.success || (parsed.data as { id: string }).id !== record.id) return 'rejected';

  if (record.tbl === 'overrides') {
    const won = await claimOverrideSlot(db, parsed.data as Override, record.rev);
    if (!won) return 'applied'; // lost the slot: recorded as a deletion instead
  }

  /*
   * Validated against the schema, but stored AS RECEIVED.
   *
   * Zod's output drops keys the schema does not know. A newer version of the
   * app on another device may send a field this one has never heard of; if it
   * were stripped here, this device's next edit of the row would push it back
   * without the field and erase it everywhere. Unknown fields ride along
   * untouched instead - found by the convergence property test.
   */
  await table.put(record.row);
  return settle(db, record);
}

/**
 * Record that this device now holds `record`'s rev, and drop any local edit
 * of the same row that it supersedes.
 */
async function settle(db: BookandryDB, record: SyncRecord): Promise<'applied'> {
  await db.syncState.put({
    tbl: record.tbl,
    id: record.id,
    rev: record.rev,
    deleted: record.deleted ? 1 : 0,
  });
  await db.outbox.delete([record.tbl, record.id]);
  return 'applied';
}

/**
 * Two devices edited the same occurrence while apart.
 *
 * Overrides are unique per [transactionId+occurrenceDate], but each device
 * gave its edit a fresh random id - so the incoming row cannot simply be
 * written: IndexedDB would throw ConstraintError, the page would abort, and
 * the next pull would fetch the same page and abort again, forever.
 *
 * The higher rev keeps the slot, exactly as last-write-wins decides every
 * other conflict. The loser is not just dropped: it gets a tombstone, so the
 * server and every other device learn it is gone. Every device holding both
 * reaches the same decision, so they converge.
 *
 * Returns whether the incoming override won.
 */
async function claimOverrideSlot(db: BookandryDB, incoming: Override, incomingRev: Rev): Promise<boolean> {
  const occupant = await db.overrides
    .where('[transactionId+occurrenceDate]')
    .equals([incoming.transactionId, incoming.occurrenceDate])
    .first();
  if (occupant === undefined || occupant.id === incoming.id) return true;

  const occupantRev = ((await db.syncState.get(['overrides', occupant.id]))?.rev ?? ZERO_REV) as Rev;

  if (incomingRev > occupantRev) {
    await db.overrides.delete(occupant.id);
    await tombstone(db, occupant.id, occupantRev);
    return true;
  }

  await tombstone(db, incoming.id, incomingRev);
  return false;
}

/** A deletion this device decided on while applying, queued like a user's. */
async function tombstone(db: BookandryDB, id: string, previous: Rev): Promise<void> {
  const deviceId = db.deviceId;
  if (deviceId === undefined) throw new Error('Applying sync before the device id was loaded');
  const rev = nextRev(previous, db.syncNowMs(), deviceId);
  await db.syncState.put({ tbl: 'overrides', id, rev, deleted: 1 });
  await db.outbox.put({ tbl: 'overrides', id } satisfies OutboxRow);
}
