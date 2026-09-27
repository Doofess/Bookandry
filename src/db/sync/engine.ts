import type { IsoInstant } from '@/types/money';

import type { BookandryDB } from '../db';
import { repairIntegrity, type RepairReport } from '../integrity';
import { LOCK_SYNC, withLock } from '../lock';
import { applyPage, CURSOR_KEY } from './apply';
import { acknowledge, collectOutgoing } from './outbox';
import type { SyncTransport } from './protocol';
import { rebaseStaleRows, type RebaseDeps, type RebaseReport } from './rebase';
import { purgeExpiredDeletions } from '../repos/transactions';

/** When this device last saw everything the server had. */
export const PULLED_TO_HEAD_KEY = 'syncPulledToHeadAt';

export type SyncOptions = {
  readonly now: IsoInstant;
  /** Rows per push and per pull page. */
  readonly batchSize?: number;
  /**
   * How to price rows that arrive in a base currency the household has since
   * left. Without it they are still found and reported, just not fixed.
   */
  readonly rebase?: Omit<RebaseDeps, 'now'>;
};

export type SyncReport = {
  readonly pushed: number;
  /** Pushed, but the server already had something newer; the pull brought it. */
  readonly stale: number;
  readonly applied: number;
  readonly skipped: number;
  readonly rejected: number;
  /** Undefined when no rate source was given. */
  readonly rebase: RebaseReport | undefined;
  readonly purged: number;
  readonly repair: RepairReport;
};

const DEFAULT_BATCH = 500;
/**
 * A cycle that keeps finding more to push or pull is a bug or an attack, not a
 * busy household. Bounded so it fails loudly instead of spinning a phone's
 * battery flat.
 */
const MAX_ROUNDS = 1_000;

/**
 * One full sync: push what changed here, pull what changed elsewhere, then
 * make the result consistent and push the fixes.
 *
 * Push FIRST, so that a pull never has to decide between the server's copy and
 * a local edit the server has not seen yet - it only ever meets local edits
 * that the server has already ranked. Last-write-wins would get the same
 * answer either way; this order just means fewer rows cross the wire twice.
 *
 * Integrity repair runs only at the pull HEAD. Part-way through, a transaction
 * whose category arrives in the next page looks orphaned; repairing it then
 * would move it to the fallback for no reason, on this device alone.
 */
export function syncOnce(
  db: BookandryDB,
  transport: SyncTransport,
  options: SyncOptions,
): Promise<SyncReport> {
  const batch = options.batchSize ?? DEFAULT_BATCH;

  return withLock(LOCK_SYNC, async () => {
    const first = await pushAll(db, transport, batch);

    let applied = 0;
    let skipped = 0;
    let rejected = 0;
    let cursor = await readCursor(db);
    for (let round = 0; ; round += 1) {
      if (round >= MAX_ROUNDS) throw new Error('Sync pull did not reach the head');
      const page = await transport.pull(cursor, batch);
      const report = await applyPage(db, page.records, page.cursor);
      applied += report.applied;
      skipped += report.skipped;
      rejected += report.rejected;
      cursor = page.cursor;
      if (!page.hasMore) break;
    }
    await db.meta.put({ key: PULLED_TO_HEAD_KEY, value: options.now });

    // At the head, and still holding the sync lock: this device has now seen
    // every restore any other device made, so purging cannot undo one.
    const { purged } = await purgeExpiredDeletions(db, Date.parse(options.now));

    const rebase =
      options.rebase === undefined
        ? undefined
        : await rebaseStaleRows(db, { ...options.rebase, now: options.now });

    const repair = await repairIntegrity(db, options.now);
    // Repairs, and deletions decided while applying, are ordinary queued edits.
    const second = await pushAll(db, transport, batch);

    return {
      pushed: first.pushed + second.pushed,
      stale: first.stale + second.stale,
      applied,
      skipped,
      rejected,
      rebase,
      purged,
      repair,
    };
  });
}

async function pushAll(
  db: BookandryDB,
  transport: SyncTransport,
  batch: number,
): Promise<{ pushed: number; stale: number }> {
  let pushed = 0;
  let stale = 0;
  for (let round = 0; ; round += 1) {
    if (round >= MAX_ROUNDS) throw new Error('Sync push did not drain the outbox');
    const outgoing = await collectOutgoing(db, batch);
    if (outgoing.length === 0) return { pushed, stale };

    const results = await transport.push(outgoing);
    await acknowledge(db, results);
    pushed += results.filter((r) => r.status === 'stored').length;
    stale += results.filter((r) => r.status === 'stale').length;

    // Nothing acknowledged would mean the same batch forever.
    if (results.length === 0) throw new Error('Sync push was not acknowledged');
  }
}

async function readCursor(db: BookandryDB): Promise<number> {
  const row = await db.meta.get(CURSOR_KEY);
  return typeof row?.value === 'number' ? row.value : 0;
}
