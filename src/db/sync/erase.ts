import { withoutTracking, type BookandryDB } from '../db';
import { PULLED_TO_HEAD_KEY, SYNC_CURSOR_KEY, SYNCED_TABLES, type OutboxRow } from './tables';

const KEPT = new Set<string>(['settings', 'profiles']);
const DRAFT_PREFIX = 'importDraft:';

/**
 * Everything erased - here, untracked: the server already holds nothing, or
 * (signed out) there is no server. Settings and people stay, and are queued to
 * be sent again into a space that no longer holds them. Where every pull
 * resumes is forgotten, so the next sync starts from the top.
 */
export async function eraseLocalData(db: BookandryDB): Promise<void> {
  const tables = [...SYNCED_TABLES.map((t) => db.table(t)), db.syncState, db.outbox, db.meta];
  await withoutTracking(db, tables, async () => {
    for (const table of SYNCED_TABLES) if (!KEPT.has(table)) await db.table(table).clear();
    await db.syncState.filter((s) => !KEPT.has(s.tbl)).delete();
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
          k.startsWith(DRAFT_PREFIX) ||
          k === PULLED_TO_HEAD_KEY,
      ),
    );
  });
}
