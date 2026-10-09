import { withoutTracking, type BookandryDB } from '../db';
import { LINKED_SPACES_KEY, spaceKeysKey } from './keystore';
import {
  cursorKeyOf,
  epochKeyOf,
  EVERYWHERE,
  REPLICATED_TABLES,
  SYNCED_TABLES,
  type OutboxRow,
} from './tables';

/**
 * Linked accounts' spaces, as this device knows them.
 *
 * Each account's data lives in its own space; a linked account's rows reach
 * this device from theirs (see route.ts). These are the two moments a space
 * comes or goes.
 */

export async function knownSpaces(db: BookandryDB): Promise<readonly string[]> {
  const value = (await db.meta.get(LINKED_SPACES_KEY))?.value;
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export async function rememberSpaces(db: BookandryDB, spaces: readonly string[]): Promise<void> {
  await db.meta.put({ key: LINKED_SPACES_KEY, value: [...spaces] });
}

/**
 * A space this device has never pulled from: the household's structure goes
 * there too. Queues every row of the shared tables, and every card, account
 * and cash move, to be sent again; the push files each where it lives (a
 * personal card only in its owner's space), and a rev the space already holds
 * is taken as stored.
 */
export async function shareWith(db: BookandryDB, space: string): Promise<boolean> {
  const seen = await db.meta.get(cursorKeyOf(space));
  if (seen !== undefined) return false;
  await db.transaction('rw', [db.syncState, db.outbox], async () => {
    const rows = await db.syncState
      .filter(
        (s) =>
          REPLICATED_TABLES.has(s.tbl) ||
          s.tbl === 'paymentMethods' ||
          // A person's cash moves too: the push files each in its owner's space only.
          s.tbl === 'cashMoves' ||
          s.home === EVERYWHERE,
      )
      .toArray();
    await db.outbox.bulkPut(rows.map((r): OutboxRow => ({ tbl: r.tbl, id: r.id })));
  });
  return true;
}

/**
 * Unlinked: the rows that live in that account's space leave this device -
 * theirs, kept by them - and so does everything this device held to reach it.
 * The household's structure lives in every space, this account's included,
 * so it stays. Untracked: nothing is deleted from anyone's account.
 */
export async function forgetSpace(db: BookandryDB, space: string): Promise<number> {
  const tables = [...SYNCED_TABLES.map((t) => db.table(t)), db.syncState, db.outbox, db.meta];
  const removed = await withoutTracking(db, tables, async () => {
    const theirs = await db.syncState.filter((s) => s.home === space).toArray();
    for (const { tbl, id } of theirs) await db.table(tbl).delete(id);
    const keys = theirs.map((s) => [s.tbl, s.id] as [string, string]);
    await db.syncState.bulkDelete(keys);
    await db.outbox.bulkDelete(keys);
    // Its erase counter too: an erase of a space this device no longer holds
    // anything from is not one to answer by clearing.
    await db.meta.bulkDelete([cursorKeyOf(space), epochKeyOf(space), spaceKeysKey(space)]);
    return theirs.length;
  });
  await rememberSpaces(
    db,
    (await knownSpaces(db)).filter((s) => s !== space),
  );
  return removed;
}
