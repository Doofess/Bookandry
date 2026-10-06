import { rowSchemas, syncedSettingsSchema } from '@/domain/transfer-schema';
import { instantFromMs } from '@/lib/dates';
import { nextRev, ZERO_REV, type Rev } from '@/lib/rev';
import { SHARED_OWNER, type Override } from '@/types/domain';

import { withoutTracking, type BookandryDB } from '../db';
import type { SyncRecord } from './protocol';
import {
  cursorKeyOf,
  EVERYWHERE,
  REPLICATED_TABLES,
  SYNCED_TABLES,
  type OutboxRow,
  type SyncStateRow,
} from './tables';
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
  /** The linked account's space the page came from; undefined for this account's own. */
  space?: string,
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
      if (local !== undefined && !supersedes(record, local)) {
        skipped += 1;
        continue;
      }

      const outcome = await applyOne(db, record, space);
      if (outcome === 'rejected') {
        rejected += 1;
        continue;
      }
      applied += 1;
    }

    await db.meta.put({ key: cursorKeyOf(space), value: cursor });
    return { applied, skipped, rejected };
  });
}

/**
 * Whether a pulled record replaces what this device holds: a newer rev - or
 * the SAME rev, live, over a deletion.
 *
 * The same rev arrives twice only when a row moved from one linked account's
 * space to another's: the move files it live in the new space and as a
 * tombstone in the old, at one rev (see deliveries()). Whichever space is
 * pulled first, the live one must win, or a device that met the tombstone
 * first would lose the row.
 */
function supersedes(record: SyncRecord, local: SyncStateRow): boolean {
  if (record.rev !== local.rev) return record.rev > local.rev;
  return !record.deleted && local.deleted === 1;
}

/**
 * Where a pulled row lives: the household's structure and joint cards
 * everywhere, anything else in the space it came from.
 */
function homeOfPulled(record: SyncRecord, space: string | undefined): string | undefined {
  if (REPLICATED_TABLES.has(record.tbl)) return space === undefined ? undefined : EVERYWHERE;
  if (
    record.tbl === 'paymentMethods' &&
    !record.deleted &&
    (record.row as { profileId?: unknown } | null)?.profileId === SHARED_OWNER
  ) {
    return EVERYWHERE;
  }
  return space;
}

async function applyOne(
  db: BookandryDB,
  record: SyncRecord,
  space: string | undefined,
): Promise<'applied' | 'rejected'> {
  const home = homeOfPulled(record, space);
  if (record.tbl === 'settings') {
    // Settings are never deleted; the only thing that syncs is the currency.
    if (record.deleted) return settle(db, record, home);
    const parsed = syncedSettingsSchema.safeParse(record.row);
    if (!parsed.success) return 'rejected';
    const current = await db.settings.get(record.id);
    await db.settings.put({
      ...(current ?? { ...DEFAULT_SETTINGS, updatedAt: instantFromMs(0) }),
      defaultCurrency: parsed.data.defaultCurrency,
    });
    return settle(db, record, home);
  }

  const table = db.table(record.tbl);
  if (record.deleted) {
    await table.delete(record.id);
    return settle(db, record, home);
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
  return settle(db, record, home);
}

/**
 * Record that this device now holds `record`'s rev, and drop any local edit
 * of the same row that it supersedes.
 */
async function settle(db: BookandryDB, record: SyncRecord, home: string | undefined): Promise<'applied'> {
  await db.syncState.put({
    tbl: record.tbl,
    id: record.id,
    rev: record.rev,
    deleted: record.deleted ? 1 : 0,
    ...(home === undefined ? {} : { home }),
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
