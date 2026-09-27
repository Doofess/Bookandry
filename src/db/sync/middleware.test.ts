import { liveQuery } from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BookandryDB, withoutTracking } from '@/db/db';
import { loadDemoData, removeDemoData } from '@/db/demo';
import { repairIntegrity } from '@/db/integrity';
import { materialize } from '@/db/materialize';
import { restoreOccurrence, skipOccurrence } from '@/db/occurrence-actions';
import { createCategory, deleteCategory } from '@/db/repos/categories';
import { createPaymentMethod, deletePaymentMethod } from '@/db/repos/payment-methods';
import { createProfile, deleteProfile } from '@/db/repos/profiles';
import { ensureSettings, writeSettings } from '@/db/repos/settings';
import { purgeExpiredDeletions, removeOverride } from '@/db/repos/transactions';
import { applySeriesEdit } from '@/db/series-edit';
import { buildExport, importDocument } from '@/db/transfer';
import { expandOccurrences } from '@/domain/occurrences';
import { d, MONEY, skip } from '@/domain/test-factories';
import { counterIdFactory } from '@/lib/id';
import { compareRev, isRev, parseRev, type Rev } from '@/lib/rev';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { DEVICE_ID_KEY } from './device';
import { LOCAL_TABLES, SYNCED_TABLES, type SyncStateRow } from './tables';

const NOW = '2026-09-27T10:00:00.000Z' as IsoInstant;
const T0 = Date.parse(NOW);

let handle: TestDb;
let db: BookandryDB;

beforeEach(async () => {
  handle = freshDb();
  db = handle.db;
  db.syncNowMs = () => T0;
  await db.open();
});
afterEach(async () => {
  await handle.dispose();
});

async function stateOf(tbl: string, id: string): Promise<SyncStateRow | undefined> {
  return db.syncState.get([tbl, id]);
}
async function queued(tbl: string, id: string): Promise<boolean> {
  return (await db.outbox.get([tbl, id])) !== undefined;
}
/** Tracking recorded "this row is gone", and it is waiting to be pushed. */
async function expectTombstone(tbl: string, id: string): Promise<void> {
  expect((await stateOf(tbl, id))?.deleted, `${tbl}/${id} tombstone`).toBe(1);
  expect(await queued(tbl, id), `${tbl}/${id} queued`).toBe(true);
}
async function expectEdit(tbl: string, id: string): Promise<void> {
  expect((await stateOf(tbl, id))?.deleted, `${tbl}/${id} edit`).toBe(0);
  expect(await queued(tbl, id), `${tbl}/${id} queued`).toBe(true);
}

function tx(id: string, over: Partial<Transaction> = {}): Transaction {
  return materialize({
    id,
    profileId: 'p1',
    kind: 'expense',
    categoryId: 'cat.groceries',
    money: MONEY,
    recurrence: { type: 'one_time' },
    date: d('2026-09-01'),
    seriesRootId: id,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  });
}

async function addProfile(id: string): Promise<void> {
  await createProfile(
    db,
    id,
    {
      name: `P ${id}`,
      avatar: 'fox',
      openingBalanceMinor: 0,
      openingBalanceCurrency: 'USD',
      openingBalanceDate: d('2026-01-01'),
    } as never,
    NOW,
  );
}

describe('the classification', () => {
  it('puts every table on exactly one list', () => {
    // A new table nobody classified would never leave the device, silently.
    const names = db.tables.map((t) => t.name).sort();
    const classified = [...SYNCED_TABLES, ...LOCAL_TABLES].sort();
    expect(names).toEqual(classified);
    expect(new Set(classified).size).toBe(classified.length);
  });
});

describe('the device id', () => {
  it('is created once and survives a reopen', async () => {
    const first = db.deviceId;
    expect(first).toMatch(/^[0-9a-z]{8}$/);
    db.close();
    await db.open();
    expect(db.deviceId).toBe(first);
    expect((await db.meta.get(DEVICE_ID_KEY))?.value).toBe(first);
  });

  it('is the same for two connections that open a new database at once', async () => {
    // Two tabs on a first visit must not each keep a different id in memory.
    const factory = new IDBFactory();
    const a = new BookandryDB('twin', { indexedDB: factory, IDBKeyRange });
    const b = new BookandryDB('twin', { indexedDB: factory, IDBKeyRange });
    await Promise.all([a.open(), b.open()]);
    expect(a.deviceId).toBeDefined();
    expect(a.deviceId).toBe(b.deviceId);
    a.close();
    b.close();
  });
});

describe('what is NOT an edit', () => {
  it('leaves a fresh install with nothing to push', async () => {
    // The built-in categories, cash and the default settings are identical on
    // every install. Pushed, they would overwrite real edits made elsewhere.
    await ensureSettings(db, NOW);
    expect(await db.categories.count()).toBeGreaterThan(0);
    expect(await db.syncState.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('does not track writes made through withoutTracking', async () => {
    await withoutTracking(db, [db.transactions], () => db.transactions.put(tx('t.sync')));
    expect(await stateOf('transactions', 't.sync')).toBeUndefined();
    expect(await queued('transactions', 't.sync')).toBe(false);
  });

  it('never tracks the device-local tables', async () => {
    await db.meta.put({ key: 'x', value: 1 });
    await db.ratesMeta.put({ id: 'r' } as never);
    expect(await db.syncState.count()).toBe(0);
  });
});

describe('every write shape', () => {
  it('tracks add, put, update and modify as edits', async () => {
    await db.transactions.add(tx('t.add'));
    await db.transactions.put(tx('t.put'));
    await db.transactions.put(tx('t.upd'));
    await db.transactions.update('t.upd', { note: 'changed' });
    await db.transactions.put(tx('t.mod'));
    await db.transactions.where('id').equals('t.mod').modify({ note: 'modified' });

    for (const id of ['t.add', 't.put', 't.upd', 't.mod']) await expectEdit('transactions', id);
  });

  it('tracks bulkAdd and bulkPut row by row', async () => {
    await db.transactions.bulkAdd([tx('b1'), tx('b2')]);
    await db.transactions.bulkPut([tx('b3'), tx('b1', { note: 'again' })]);
    for (const id of ['b1', 'b2', 'b3']) await expectEdit('transactions', id);
    expect(await db.outbox.count()).toBe(3);
  });

  it('tracks delete, bulkDelete, a where().delete() and clear() as deletions', async () => {
    await db.transactions.bulkAdd([tx('d1'), tx('d2'), tx('d3'), tx('d4'), tx('d5')]);

    await db.transactions.delete('d1');
    await db.transactions.bulkDelete(['d2', 'd3']);
    await db.transactions.where('id').equals('d4').delete();
    await expectTombstone('transactions', 'd1');
    await expectTombstone('transactions', 'd2');
    await expectTombstone('transactions', 'd3');
    await expectTombstone('transactions', 'd4');

    await db.transactions.clear();
    await expectTombstone('transactions', 'd5');
  });

  it('only tracks the rows of a bulk write that actually landed', async () => {
    await db.transactions.add(tx('dup'));
    await db.transaction('rw', db.transactions, async () => {
      // A partial failure the caller chose to swallow: the duplicate fails,
      // the new row lands, and only the new row is an edit.
      await db.transactions.bulkAdd([tx('fresh'), tx('dup', { note: 'second' })]).catch(() => undefined);
    });
    await expectEdit('transactions', 'fresh');
    const dup = await stateOf('transactions', 'dup');
    expect(parseRev(dup!.rev as Rev).counter).toBe(0); // untouched by the failed add
  });
});

describe('revs', () => {
  it('increase on every write to a row, even when the clock goes backwards', async () => {
    await db.transactions.put(tx('r'));
    const first = (await stateOf('transactions', 'r'))!.rev as Rev;

    db.syncNowMs = () => T0 - 60_000; // the device clock was corrected backwards
    await db.transactions.put(tx('r', { note: 'later' }));
    const second = (await stateOf('transactions', 'r'))!.rev as Rev;

    expect(isRev(first)).toBe(true);
    expect(compareRev(second, first)).toBe(1);
  });

  it('carry the wall clock and this device', async () => {
    db.syncNowMs = () => T0 + 5_000;
    await db.transactions.put(tx('c'));
    const rev = parseRev((await stateOf('transactions', 'c'))!.rev as Rev);
    expect(rev.ms).toBe(T0 + 5_000);
    expect(rev.deviceId).toBe(db.deviceId);
  });

  it('a delete after an edit is newer than the edit', async () => {
    await db.transactions.put(tx('x'));
    const edit = (await stateOf('transactions', 'x'))!.rev as Rev;
    await db.transactions.delete('x');
    const gone = await stateOf('transactions', 'x');
    expect(gone?.deleted).toBe(1);
    expect(compareRev(gone!.rev as Rev, edit)).toBe(1);
  });
});

describe('atomicity', () => {
  it('rolls the tracking back with an aborted write', async () => {
    await expect(
      db.transaction('rw', db.transactions, async () => {
        await db.transactions.put(tx('ghost'));
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');

    expect(await db.transactions.get('ghost')).toBeUndefined();
    expect(await stateOf('transactions', 'ghost')).toBeUndefined();
    expect(await queued('transactions', 'ghost')).toBe(false);
  });

  it('tracks a write inside a transaction that never declared the side tables', async () => {
    // Every caller declares its own table list; none of them lists syncState.
    await db.transaction('rw', [db.transactions], () => db.transactions.put(tx('scoped')));
    await expectEdit('transactions', 'scoped');
  });
});

describe('settings sync one field', () => {
  it('ignores a language or theme change', async () => {
    await ensureSettings(db, NOW);
    await writeSettings(db, { language: 'he', theme: 'dark' }, NOW);
    expect(await queued('settings', 'singleton')).toBe(false);
  });

  it('tracks a base currency change', async () => {
    await ensureSettings(db, NOW);
    await writeSettings(db, { defaultCurrency: 'ILS' }, NOW);
    await expectEdit('settings', 'singleton');
  });
});

describe('each function that hard-deletes a synced row', () => {
  // The ten call sites Phase 0 listed. None of them was changed; the
  // middleware sees them all, and this is what proves it.

  it('purgeExpiredDeletions', async () => {
    await db.transactions.put(
      tx('old', { isDeleted: 1, deletedAt: '2026-09-01T00:00:00.000Z' as IsoInstant }),
    );
    await db.overrides.put(skip('old', d('2026-09-01')));
    const overrideId = (await db.overrides.toArray())[0]!.id;
    await purgeExpiredDeletions(db, T0);
    await expectTombstone('transactions', 'old');
    await expectTombstone('overrides', overrideId);
  });

  it('removeOverride (a compound-index delete)', async () => {
    await db.overrides.put(skip('t9', d('2026-09-10')));
    const id = (await db.overrides.toArray())[0]!.id;
    await removeOverride(db, 't9', d('2026-09-10'));
    await expectTombstone('overrides', id);
  });

  it('deleteCategory, including the rows it reassigns', async () => {
    const cat = await createCategory(
      db,
      'c.tmp',
      { kind: 'expense', name: 'Temp', icon: 'tag' } as never,
      NOW,
    );
    await db.transactions.put(tx('uses-cat', { categoryId: cat.id }));
    await db.outbox.clear(); // start from "everything pushed"
    await deleteCategory(db, cat.id, {}, NOW);
    await expectTombstone('categories', cat.id);
    await expectEdit('transactions', 'uses-cat');
  });

  it('deletePaymentMethod', async () => {
    await createPaymentMethod(db, 'pm.visa', { label: 'Visa', type: 'credit_card', profileId: 'p1' }, NOW);
    await deletePaymentMethod(db, 'pm.visa', {}, NOW);
    await expectTombstone('paymentMethods', 'pm.visa');
  });

  it('deleteProfile, including the payment methods it deletes', async () => {
    await addProfile('p1');
    await addProfile('p2');
    await createPaymentMethod(db, 'pm.own', { label: 'Own', type: 'credit_card', profileId: 'p2' }, NOW);
    await deleteProfile(db, 'p2', {}, NOW);
    await expectTombstone('profiles', 'p2');
    await expectTombstone('paymentMethods', 'pm.own');
  });

  it('applySeriesEdit', async () => {
    await db.overrides.put(skip('s1', d('2026-09-10')));
    const id = (await db.overrides.toArray())[0]!.id;
    await applySeriesEdit(db, {
      transactions: [],
      overrides: [],
      deleteOverrideIds: [id],
      warnings: [],
      effectiveScope: 'all',
    });
    await expectTombstone('overrides', id);
  });

  it('restoreOccurrence', async () => {
    const series = tx('rent', { recurrence: { type: 'monthly', dayOfMonth: 1 } });
    await db.transactions.put(series);
    const occurrence = expandOccurrences(series, [], d('2026-09-01'), d('2026-09-30'), {
      today: d('2026-09-27'),
    })[0]!;
    const ids = counterIdFactory('ov');
    await skipOccurrence(db, occurrence, NOW, ids);
    const overrideId = (await db.overrides.toArray())[0]!.id;
    await restoreOccurrence(db, { ...occurrence, isSkipped: true }, NOW, ids);
    await expectTombstone('overrides', overrideId);
  });

  it('repairIntegrity (an orphaned override)', async () => {
    await ensureSettings(db, NOW);
    await db.overrides.put({ ...skip('gone', d('2026-09-01')), id: 'o-orphan' });
    await repairIntegrity(db, NOW);
    await expectTombstone('overrides', 'o-orphan');
  });

  it('removeDemoData', async () => {
    await ensureSettings(db, NOW);
    await loadDemoData(db, { today: d('2026-09-15'), baseCurrency: 'ILS', now: NOW });
    const demoIds = (await db.transactions.toArray()).map((t) => t.id);
    expect(demoIds.length).toBeGreaterThan(0);
    await removeDemoData(db);
    for (const id of demoIds.slice(0, 5)) await expectTombstone('transactions', id);
  });

  it('a replace import (clear() on every user table)', async () => {
    await ensureSettings(db, NOW);
    await addProfile('p1');
    await db.transactions.bulkPut([tx('keep'), tx('drop')]);
    const doc = await buildExport(db, NOW);
    const withoutDrop = {
      ...doc,
      counts: { ...doc.counts, transactions: 1 },
      data: { ...doc.data, transactions: doc.data.transactions.filter((t) => t.id === 'keep') },
    };

    const result = await importDocument(db, withoutDrop, { mode: 'replace', now: NOW });
    expect(result.ok).toBe(true);
    await expectTombstone('transactions', 'drop');
    // Cleared and re-added in one transaction: the survivor ends as an edit.
    await expectEdit('transactions', 'keep');
  });
});

describe('liveQuery still sees every kind of write', () => {
  /*
   * The middleware sits in the mutate path of every screen's data. If it ever
   * stopped passing Dexie's change notifications through, the app would keep
   * rendering stale rows and no other test would notice.
   */
  async function sees(write: () => Promise<unknown>, read: () => Promise<unknown>): Promise<boolean> {
    const values: unknown[] = [];
    const sub = liveQuery(read).subscribe((v) => values.push(v));
    await new Promise((r) => setTimeout(r, 30));
    const before = values.length;
    await write();
    await new Promise((r) => setTimeout(r, 60));
    sub.unsubscribe();
    return values.length > before;
  }
  const count = () => db.transactions.count();

  it.each([
    ['add', () => db.transactions.add(tx('l1'))],
    ['put', () => db.transactions.put(tx('l2'))],
    ['bulkPut', () => db.transactions.bulkPut([tx('l3'), tx('l4')])],
    ['delete', () => db.transactions.delete('seed')],
    ['bulkDelete', () => db.transactions.bulkDelete(['seed'])],
    ['clear', () => db.transactions.clear()],
    ['untracked put', () => withoutTracking(db, [db.transactions], () => db.transactions.put(tx('l5')))],
  ])('%s', async (_label, write) => {
    await db.transactions.put(tx('seed'));
    expect(await sees(write, count)).toBe(true);
  });

  it('update (same count, new content)', async () => {
    await db.transactions.put(tx('u'));
    expect(
      await sees(
        () => db.transactions.update('u', { note: 'n' }),
        () => db.transactions.get('u'),
      ),
    ).toBe(true);
  });
});

describe('upgrading an existing install from v1', () => {
  it('queues every existing user row, dated by its own updatedAt', async () => {
    const factory = new IDBFactory();
    const name = 'upgrade-me';

    // An install from before sync existed.
    const v1 = new BookandryDB(name, { indexedDB: factory, IDBKeyRange }, 1, NOW);
    await v1.open();
    const edited = '2026-05-05T05:05:05.000Z';
    await v1.transactions.put({ ...tx('t.old'), updatedAt: edited as IsoInstant });
    await v1.categories.update('cat.groceries', { updatedAt: edited as IsoInstant }); // a builtin, renamed
    await v1.settings.put({ id: 'singleton', defaultCurrency: 'ILS', updatedAt: NOW } as never);
    const pristineBuiltins = await v1.categories.where('id').notEqual('cat.groceries').primaryKeys();
    v1.close();

    // The same install after the update.
    const v2 = new BookandryDB(name, { indexedDB: factory, IDBKeyRange }, Infinity, NOW);
    await v2.open();

    const txState = await v2.syncState.get(['transactions', 't.old']);
    expect(parseRev(txState!.rev as Rev).ms).toBe(Date.parse(edited));
    expect(parseRev(txState!.rev as Rev).deviceId).toBe(v2.deviceId);
    expect(await v2.outbox.get(['transactions', 't.old'])).toBeDefined();

    // An edited builtin is a real edit; an untouched one is not.
    expect(await v2.syncState.get(['categories', 'cat.groceries'])).toBeDefined();
    for (const id of pristineBuiltins) expect(await v2.syncState.get(['categories', id])).toBeUndefined();
    expect(await v2.syncState.get(['paymentMethods', 'pm.cash'])).toBeUndefined();

    // Settings wait for the first sign-in to decide.
    expect(await v2.syncState.get(['settings', 'singleton'])).toBeUndefined();

    // And the data itself is exactly where it was.
    expect((await v2.transactions.get('t.old'))?.updatedAt).toBe(edited);
    expect((await v2.settings.get('singleton'))?.defaultCurrency).toBe('ILS');
    v2.close();
  });
});
