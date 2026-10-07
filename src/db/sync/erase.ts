import { instantFromMs } from '@/lib/dates';

import { withoutTracking, type BookandryDB } from '../db';
import { DRAFT_PREFIX } from '../import-drafts';
import { buildSeedCategories, buildSeedPaymentMethods } from '../seed';
import {
  epochKeyOf,
  PULLED_TO_HEAD_KEY,
  SYNC_CURSOR_KEY,
  SYNC_EPOCH_KEY,
  SYNC_WIPED_KEY,
  SYNCED_TABLES,
  type OutboxRow,
} from './tables';

const KEPT = new Set<string>(['settings', 'profiles']);

export type EraseOptions = {
  /**
   * Erase counters to record, by space id, in the same transaction: the clear
   * and the erase it answers are one step, so neither survives a crash alone.
   * Every other space's is forgotten: this device holds nothing of it now, so
   * its next pull takes its counter instead of clearing again.
   */
  readonly epochs?: ReadonlyMap<string, number>;
  /** Cleared by a sync: the next sync to finish reports it (SYNC_WIPED_KEY). */
  readonly bySync?: boolean;
};

/**
 * Everything erased - here, untracked: the server already holds nothing, or
 * (signed out) there is no server. Settings and people stay (each person's
 * opening balance back to nothing), and are queued to
 * be sent again into a space that no longer holds them. The built-ins come
 * back as on a new install. Where every pull resumes is forgotten, so the next
 * sync starts from the top, and so is every space's erase counter but those
 * this clear answers (see EraseOptions.epochs).
 */
export async function eraseLocalData(db: BookandryDB, options: EraseOptions = {}): Promise<void> {
  const tables = [...SYNCED_TABLES.map((t) => db.table(t)), db.syncState, db.outbox, db.meta];
  await withoutTracking(db, tables, async () => {
    for (const table of SYNCED_TABLES) if (!KEPT.has(table)) await db.table(table).clear();
    await db.syncState.filter((s) => !KEPT.has(s.tbl)).delete();
    // Never synced, so no pull brings them back - and without them every
    // transaction pulled in a built-in category would be "repaired" away.
    const now = instantFromMs(db.syncNowMs());
    await db.categories.bulkAdd(buildSeedCategories(now));
    await db.paymentMethods.bulkAdd(buildSeedPaymentMethods(now));

    // The people stay, but the balance each started from was data too: left
    // behind, it would still show once everything else is gone.
    await db.profiles.toCollection().modify({ openingBalanceMinor: 0 });

    await db.outbox.clear();
    // What has a rev: every person, and the settings once someone chose a
    // currency. A pristine default row was never sent, and is not now.
    const kept = await db.syncState.filter((s) => KEPT.has(s.tbl) && s.deleted === 0).toArray();
    await db.outbox.bulkPut(kept.map(({ tbl, id }): OutboxRow => ({ tbl, id })));

    const keys = (await db.meta.toCollection().primaryKeys()).map(String);
    await db.meta.bulkDelete(
      keys.filter(
        (k) =>
          k === SYNC_CURSOR_KEY ||
          k.startsWith(`${SYNC_CURSOR_KEY}:`) ||
          k.startsWith(`${SYNC_EPOCH_KEY}:`) ||
          k.startsWith(DRAFT_PREFIX) ||
          k === PULLED_TO_HEAD_KEY,
      ),
    );
    for (const [space, epoch] of options.epochs ?? []) {
      await db.meta.put({ key: epochKeyOf(space), value: epoch });
    }
    if (options.bySync === true) await db.meta.put({ key: SYNC_WIPED_KEY, value: true });
  });
}
