import Dexie, { type Table } from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Canary for the `db` project.
 *
 * The plan requires a REAL Dexie round-trip here, not a trivial assertion:
 * §11's "pnpm test must pass" after a scaffold phase with no tests is vacuous,
 * and the fake-indexeddb + Dexie 4 + Vitest combination is exactly the kind of
 * thing that is cheap to prove now and expensive to debug in Phase 2.
 *
 * Note the isolation pattern later phases reuse: a fresh IDBFactory per test and
 * a counter-derived database name. Deterministic, and immune to cross-test
 * bleed without the documented `new IDBFactory()` reset that degrades badly.
 */
type Row = { id: string; amountMinor: number };

let counter = 0;
let open: Dexie | undefined;

function freshDb() {
  counter += 1;
  const db = new Dexie(`canary-${String(counter)}`, { indexedDB: new IDBFactory(), IDBKeyRange });
  db.version(1).stores({ rows: 'id' });
  open = db;
  return db as Dexie & { rows: Table<Row, string> };
}

afterEach(async () => {
  if (open) {
    await open.delete();
    open.close();
    open = undefined;
  }
});

describe('dexie over fake-indexeddb', () => {
  it('round-trips a record', async () => {
    const db = freshDb();
    await db.rows.put({ id: 'a', amountMinor: 4500 });
    await expect(db.rows.get('a')).resolves.toEqual({ id: 'a', amountMinor: 4500 });
  });

  it('rolls a failed multi-table transaction back entirely', async () => {
    const db = freshDb();
    await db.rows.put({ id: 'a', amountMinor: 4500 });

    await expect(
      db.transaction('rw', db.rows, async () => {
        await db.rows.put({ id: 'a', amountMinor: 1 });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // This is the property every destructive flow in Phase 2 depends on.
    await expect(db.rows.get('a')).resolves.toEqual({ id: 'a', amountMinor: 4500 });
  });

  it('isolates databases between tests', async () => {
    const db = freshDb();
    await expect(db.rows.count()).resolves.toBe(0);
  });
});
