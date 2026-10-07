import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BookandryDB } from '@/db/db';
import { materialize } from '@/db/materialize';
import { createCategory } from '@/db/repos/categories';
import { createProfile } from '@/db/repos/profiles';
import { ensureSettings, writeSettings } from '@/db/repos/settings';
import { d, MONEY } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import type { Rev } from '@/lib/rev';
import { freshDb, type TestDb } from '@/test/db-harness';
import { MemorySyncServer } from '@/test/memory-sync-server';
import type { Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { syncOnce, type SyncSpaces } from './engine';
import { eraseLocalData } from './erase';
import type { SyncRecord, SyncTransport } from './protocol';
import { cursorKeyOf, epochKeyOf } from './tables';

/*
 * Deleting all data, as the devices see it: the server forgets everything and
 * moves the space's epoch on. Every device that pulled from it before clears
 * itself once, and nothing it still held - not even an edit made offline -
 * goes back.
 */

const T0 = Date.parse('2026-09-27T10:00:00.000Z');
let clock = T0;
const now = (): IsoInstant => instantFromMs(clock);
/** Real time passes between steps; revs must reflect it. */
const tick = (ms = 1_000): void => {
  clock += ms;
};

type Device = {
  db: BookandryDB;
  handle: TestDb;
  sync: (transport?: SyncTransport) => ReturnType<typeof syncOnce>;
};

let server: MemorySyncServer;
let a: Device;
let b: Device;

const SEED_TIME = '2026-01-01T00:00:00.000Z' as IsoInstant;

async function device(): Promise<Device> {
  const handle = freshDb(Infinity, SEED_TIME);
  const db = handle.db;
  db.syncNowMs = () => clock;
  await db.open();
  await ensureSettings(db, now());
  return {
    db,
    handle,
    sync: (transport = server.transport()) => syncOnce(db, transport, { now: now(), batchSize: 50 }),
  };
}

beforeEach(async () => {
  clock = T0;
  server = new MemorySyncServer();
  a = await device();
  b = await device();
});
afterEach(async () => {
  await a.handle.dispose();
  await b.handle.dispose();
});

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
    createdAt: now(),
    updatedAt: now(),
    ...over,
  });
}

async function addProfile(db: BookandryDB, id: string): Promise<void> {
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
    now(),
  );
}

/** A custom category as another device would push it. */
const category = (id: string): SyncRecord => ({
  tbl: 'categories',
  id,
  rev: '9999999999999999.ffff.zzzzzzzz' as Rev,
  deleted: false,
  row: {
    id,
    kind: 'expense',
    name: id,
    icon: 'Circle',
    source: 'custom',
    sortOrder: 99,
    isArchived: 0,
    createdAt: now(),
    updatedAt: now(),
  },
});

const customCategories = (db: BookandryDB) => db.categories.filter((c) => c.source !== 'builtin').count();

describe('an erase reaching a device', () => {
  it('clears everything but settings and people, once, and gives the server none of it back', async () => {
    await addProfile(a.db, 'p1');
    // Chosen, so it has a rev to send again: a pristine default never syncs.
    await writeSettings(a.db, { defaultCurrency: 'ILS' }, now());
    await createCategory(a.db, 'cat.custom', { name: 'Gym', kind: 'expense', icon: 'Circle' }, now());
    await a.db.transactions.put(tx('t1'));
    await a.sync();
    await b.sync();
    expect(await b.db.transactions.count()).toBe(1);

    server.erase();
    tick();
    // B, offline through the erase, made one more.
    await b.db.transactions.put(tx('t2'));

    const report = await b.sync();
    expect(report.wiped).toBe(true);
    expect(await b.db.transactions.count()).toBe(0);
    expect(await customCategories(b.db)).toBe(0);
    expect(await b.db.profiles.get('p1')).toBeDefined();
    expect(await b.db.settings.get('singleton')).toBeDefined();
    expect((await b.db.meta.get(epochKeyOf(undefined)))?.value).toBe(1);
    // The server got settings and people back - never t2, nor anything erased.
    expect(
      server
        .snapshot()
        .map((r) => r.tbl)
        .sort(),
    ).toEqual(['profiles', 'settings']);

    // A, syncing later, clears too and converges on the same.
    expect((await a.sync()).wiped).toBe(true);
    expect(await a.db.transactions.count()).toBe(0);
    expect(await b.sync()).toMatchObject({ wiped: false });
  });

  it('clears only once in a sync that sees two spaces erased, keeping what the second brings', async () => {
    const theirs = new MemorySyncServer();
    const spaces = (): SyncSpaces => ({
      own: { id: 'me', transport: server.transport() },
      linked: [{ id: 'them', transport: theirs.transport() }],
    });
    const syncBoth = () => syncOnce(b.db, spaces(), { now: now(), batchSize: 50 });
    await addProfile(b.db, 'p1');
    await b.db.transactions.put(tx('t1'));
    await syncBoth();

    server.erase();
    theirs.erase();
    // Other devices already sent something into each space after the erase.
    await server.transport().push([category('cat.mine')], 1);
    await theirs.transport().push([category('cat.after')], 1);

    const report = await syncBoth();
    expect(report.wiped).toBe(true);
    expect(await b.db.transactions.count()).toBe(0);
    // Cleared once, before the first space was pulled again: never after.
    expect(await b.db.categories.get('cat.mine')).toBeDefined();
    expect(await b.db.categories.get('cat.after')).toBeDefined();
  });

  it('takes the epoch of a space it has never pulled from without clearing anything', async () => {
    server.erase();
    await addProfile(b.db, 'p1');
    await b.db.transactions.put(tx('t1'));
    const report = await b.sync();
    expect(report.wiped).toBe(false);
    expect(await b.db.transactions.count()).toBe(1);
    expect((await b.db.meta.get(epochKeyOf(undefined)))?.value).toBe(1);
  });

  it('still fails a sync whose push was refused for any other reason, and clears nothing', async () => {
    await addProfile(a.db, 'p1');
    await a.db.transactions.put(tx('t1'));
    await a.sync();
    await a.db.transactions.put(tx('t2'));

    server.failNextPush = true;
    await expect(a.sync()).rejects.toThrow('push dropped');
    expect(await a.db.transactions.count()).toBe(2);
    expect(await a.db.outbox.get(['transactions', 't2'])).toBeDefined();
  });

  it('eraseLocalData keeps settings and people queued to be sent again, and drops cursors and drafts', async () => {
    await addProfile(a.db, 'p1');
    await writeSettings(a.db, { defaultCurrency: 'ILS' }, now());
    await createCategory(a.db, 'cat.custom', { name: 'Gym', kind: 'expense', icon: 'Circle' }, now());
    await a.db.transactions.put(tx('t1'));
    await a.db.meta.bulkPut([
      { key: cursorKeyOf(undefined), value: 5 },
      { key: cursorKeyOf('x'), value: 7 },
      { key: 'importDraft:k', value: {} },
      { key: 'deviceId', value: 'd1' },
    ]);
    await eraseLocalData(a.db);
    expect(await a.db.transactions.count()).toBe(0);
    expect(await customCategories(a.db)).toBe(0);
    expect(await a.db.profiles.count()).toBe(1);
    expect((await a.db.settings.get('singleton'))?.defaultCurrency).toBe('ILS');
    expect((await a.db.outbox.toArray()).map((o) => o.tbl).sort()).toEqual(['profiles', 'settings']);
    for (const key of [cursorKeyOf(undefined), cursorKeyOf('x'), 'importDraft:k']) {
      expect(await a.db.meta.get(key)).toBeUndefined();
    }
    expect(await a.db.meta.get('deviceId')).toBeDefined();
  });

  it('eraseLocalData keeps a settings row nobody chose, without queuing it', async () => {
    await addProfile(b.db, 'p1');
    await eraseLocalData(b.db);
    expect(await b.db.settings.get('singleton')).toBeDefined();
    expect((await b.db.outbox.toArray()).map((o) => o.tbl)).toEqual(['profiles']);
  });
});
