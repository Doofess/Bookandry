import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

import { BookandryDB } from '@/db/db';
import type { IsoInstant } from '@/types/money';

/**
 * Per-test database isolation.
 *
 * A fresh IDBFactory per test with a counter-derived name: deterministic (no
 * randomUUID, so fixtures stay byte-stable) and immune to cross-test bleed.
 * The delete/open path also re-runs the real version(1) upgrade every time,
 * which is a free migration regression check.
 */
export type TestDb = { db: BookandryDB; dispose: () => Promise<void> };

let counter = 0;

export function freshDb(upTo = Infinity, seedNow?: IsoInstant): TestDb {
  counter += 1;
  const db = new BookandryDB(
    `bookandry-test-${String(counter)}`,
    { indexedDB: new IDBFactory(), IDBKeyRange },
    upTo,
    ...(seedNow === undefined ? [] : [seedNow]),
  );
  return {
    db,
    dispose: async () => {
      await db.delete();
      db.close();
    },
  };
}
