import type { Rev } from '@/lib/rev';

import type { BookandryDB } from '../db';
import type { PushResult, SyncRecord } from './protocol';
import type { SyncedTable } from './tables';

/**
 * The next batch of local changes to push.
 *
 * Read in one transaction so the rev and the row it describes are
 * from the same moment: a row edited between reading its rev and reading its
 * content would be sent with the OLD rev and the NEW content, and every other
 * device would store the new content under a rev that later loses to itself.
 */
export async function collectOutgoing(db: BookandryDB, limit: number): Promise<SyncRecord[]> {
  const tables = [
    db.outbox,
    db.syncState,
    db.profiles,
    db.categories,
    db.paymentMethods,
    db.transactions,
    db.overrides,
    db.settings,
  ];
  return db.transaction('rw', tables, async () => {
    const queued = await db.outbox.limit(limit).toArray();
    const records: SyncRecord[] = [];
    const unsendable: [string, string][] = [];

    for (const { tbl, id } of queued) {
      const state = await db.syncState.get([tbl, id]);
      const deleted = state?.deleted === 1;
      const row = state === undefined || deleted ? null : await contentOf(db, tbl, id);
      /*
       * Queued with no rev, or "live" with no row: neither can happen through
       * the middleware, only by writing around it. Sending either would be
       * worse than not - and leaving it queued would hand the same entry to
       * every push forever - so it is dropped here, once.
       */
      if (state === undefined || (!deleted && row === undefined)) {
        unsendable.push([tbl, id]);
        continue;
      }
      records.push({ tbl, id, rev: state.rev as Rev, deleted, row });
    }

    if (unsendable.length > 0) await db.outbox.bulkDelete(unsendable);
    return records;
  });
}

async function contentOf(db: BookandryDB, tbl: SyncedTable, id: string): Promise<unknown> {
  if (tbl === 'settings') {
    const settings = await db.settings.get(id);
    // Only the synced field ever leaves the device.
    return settings === undefined ? undefined : { defaultCurrency: settings.defaultCurrency };
  }
  return db.table(tbl).get(id);
}

/**
 * Take acknowledged rows out of the outbox.
 *
 * ONLY if the row's rev is still the one that was pushed. An edit made while
 * the push was in flight has a newer rev and must stay queued; clearing it
 * because an older version was acknowledged would lose it silently.
 *
 * `stale` rows leave the outbox too: the server's copy is newer, and the next
 * pull replaces ours with it.
 */
export async function acknowledge(db: BookandryDB, results: readonly PushResult[]): Promise<void> {
  if (results.length === 0) return;
  await db.transaction('rw', [db.outbox, db.syncState], async () => {
    const states = await db.syncState.bulkGet(results.map((r) => [r.tbl, r.id] as [string, string]));
    const done = results
      .filter((r, i) => states[i]?.rev === r.rev)
      .map((r) => [r.tbl, r.id] as [string, string]);
    await db.outbox.bulkDelete(done);
  });
}
