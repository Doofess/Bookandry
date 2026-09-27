import type { BookandryDB } from '../db';
import type { OutboxRow } from './tables';

/**
 * Queue every row this device knows - live and deleted - to be sent again.
 *
 * Used when the household rotates its data key ("I lost my phone"). The
 * server's copy is wiped and rebuilt from this device, re-sealed under the new
 * key and under new blinded ids (the blinding key rotates too, so the old ids
 * mean nothing to anyone holding the old key).
 *
 * Revs are NOT changed. Nothing about the rows is newer; they are the same
 * rows under a new lock. Other devices already hold them at these revs and
 * will skip them - once they have unlocked with the new key.
 *
 * What rotation cannot do, and the UI says so: take back plaintext that is
 * already on the lost device. It stops that device from reading anything
 * written from now on, and from pushing into the account.
 */
export async function requeueEverything(db: BookandryDB): Promise<number> {
  return db.transaction('rw', [db.syncState, db.outbox], async () => {
    const all = await db.syncState.toArray();
    await db.outbox.bulkPut(all.map((r): OutboxRow => ({ tbl: r.tbl, id: r.id })));
    return all.length;
  });
}
