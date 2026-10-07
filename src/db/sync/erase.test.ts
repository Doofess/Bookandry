import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BookandryDB } from '@/db/db';
import { materialize } from '@/db/materialize';
import { createCategory, setCategoryArchived } from '@/db/repos/categories';
import { createProfile } from '@/db/repos/profiles';
import { ensureSettings, writeSettings } from '@/db/repos/settings';
import { buildSeedCategories, buildSeedPaymentMethods } from '@/db/seed';
import { d, MONEY } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import type { Rev } from '@/lib/rev';
import { freshDb, type TestDb } from '@/test/db-harness';
import { MemorySyncServer } from '@/test/memory-sync-server';
import { CASH_METHOD_ID, type Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { syncOnce, type SyncSpaces } from './engine';
import { eraseLocalData } from './erase';
import { forgetSyncIdentity } from './keystore';
import type { SyncRecord, SyncTransport } from './protocol';
import { requeueEverything } from './rotate';
import { forgetSpace } from './spaces';
import { cursorKeyOf, epochKeyOf, SYNC_WIPED_KEY } from './tables';

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

/** The account's own space, by its id - in the app, the account's user id. */
const ME = 'me';

type Device = {
  db: BookandryDB;
  handle: TestDb;
  sync: () => ReturnType<typeof syncOnce>;
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
    sync: () =>
      syncOnce(
        db,
        { own: { id: ME, transport: server.transport() }, linked: [] },
        { now: now(), batchSize: 50 },
      ),
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
const held = () =>
  server
    .snapshot()
    .map((r) => r.tbl)
    .sort();

/** A, holding a person, a chosen currency, a category and a transaction; B, in step with it. */
async function household(): Promise<void> {
  await addProfile(a.db, 'p1');
  // Chosen, so it has a rev to send again: a pristine default never syncs.
  await writeSettings(a.db, { defaultCurrency: 'ILS' }, now());
  await createCategory(a.db, 'cat.custom', { name: 'Gym', kind: 'expense', icon: 'Circle' }, now());
  await a.db.transactions.put(tx('t1'));
  await a.sync();
  await b.sync();
}

/** Two spaces, and a way to break the next pull from the second. */
function linkedPair() {
  const theirs = new MemorySyncServer();
  const hooks = { beforeTheirPull: undefined as (() => void) | undefined };
  const spaces = (): SyncSpaces => {
    const inner = theirs.transport();
    const transport: SyncTransport = {
      push: (records, epoch) => inner.push(records, epoch),
      pull: (cursor, limit) => {
        const hook = hooks.beforeTheirPull;
        hooks.beforeTheirPull = undefined;
        hook?.();
        return inner.pull(cursor, limit);
      },
    };
    return { own: { id: ME, transport: server.transport() }, linked: [{ id: 'them', transport }] };
  };
  const syncBoth = () => syncOnce(b.db, spaces(), { now: now(), batchSize: 50 });
  return { theirs, hooks, syncBoth };
}

describe('an erase reaching a device', () => {
  it('clears everything but settings and people, once, and gives the server none of it back', async () => {
    await household();
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
    expect((await b.db.meta.get(epochKeyOf(ME)))?.value).toBe(1);
    // The server got settings and people back - never t2, nor anything erased.
    expect(held()).toEqual(['profiles', 'settings']);

    // A, syncing later, clears too and converges on the same.
    expect((await a.sync()).wiped).toBe(true);
    expect(await a.db.transactions.count()).toBe(0);
    expect(await b.sync()).toMatchObject({ wiped: false });
  });

  it('keeps the built-ins, so what is filed under one after the erase stays there everywhere', async () => {
    await household();
    server.erase();
    tick();
    expect((await a.sync()).wiped).toBe(true);

    // Made after the erase, in a built-in category, paid from a built-in method.
    await a.db.transactions.put(tx('t3', { categoryId: 'cat.groceries', paymentMethodId: CASH_METHOD_ID }));
    await a.sync();

    // B catches up: cleared, then given t3 - and nothing to repair.
    const report = await b.sync();
    expect(report.wiped).toBe(true);
    expect(report.repair.found).toEqual([]);
    const onB = await b.db.transactions.get('t3');
    expect(onB?.categoryId).toBe('cat.groceries');
    expect(onB?.paymentMethodId).toBe(CASH_METHOD_ID);

    expect((await a.sync()).repair.found).toEqual([]);
    expect((await a.db.transactions.get('t3'))?.categoryId).toBe('cat.groceries');
  });

  it('clears only once in a sync that sees two spaces erased, keeping what both bring', async () => {
    const { theirs, syncBoth } = linkedPair();
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
    // Cleared once, before the first space was pulled again: never after, so
    // each space was pulled again once, and each row arrived once.
    expect(await b.db.categories.get('cat.mine')).toBeDefined();
    expect(await b.db.categories.get('cat.after')).toBeDefined();
    expect(report.applied).toBe(2);
  });

  it('pulls every space again when the erase first shows in a later one, and pushes into all of them', async () => {
    const { theirs, hooks, syncBoth } = linkedPair();
    await addProfile(b.db, 'p1');
    await b.db.transactions.put(tx('t1'));
    await syncBoth();
    // Another device's row, pulled from this account's own space in the next sync.
    await server.transport().push([category('cat.mine')], 0);

    // The household's erase lands after this device pulled its own space,
    // before it pulls theirs.
    hooks.beforeTheirPull = () => {
      server.erase();
      theirs.erase();
    };
    const report = await syncBoth();
    expect(report.wiped).toBe(true);
    expect(await b.db.transactions.count()).toBe(0);
    expect(await b.db.categories.get('cat.mine')).toBeUndefined();
    // Both epochs taken before the second push, which both spaces accepted.
    expect((await b.db.meta.get(epochKeyOf(ME)))?.value).toBe(1);
    expect((await b.db.meta.get(epochKeyOf('them')))?.value).toBe(1);
    expect(held()).toEqual(['profiles']);
  });

  it('pulls again what was pulled before an erase seen only in a later space', async () => {
    const { theirs, syncBoth } = linkedPair();
    await addProfile(b.db, 'p1');
    await b.db.transactions.put(tx('t1'));
    await syncBoth();
    await server.transport().push([category('cat.mine')], 0);

    theirs.erase();
    expect((await syncBoth()).wiped).toBe(true);
    // Cleared, then this account's own space pulled again from the top.
    expect(await b.db.transactions.get('t1')).toBeDefined();
    expect(await b.db.categories.get('cat.mine')).toBeDefined();
  });

  it('still reports the erase when the sync that cleared failed afterwards', async () => {
    const { theirs, hooks, syncBoth } = linkedPair();
    await addProfile(b.db, 'p1');
    await syncBoth();

    server.erase();
    theirs.erase();
    hooks.beforeTheirPull = () => {
      throw new Error('network: pull dropped');
    };
    await expect(syncBoth()).rejects.toThrow('pull dropped');
    expect(await b.db.meta.get(SYNC_WIPED_KEY)).toBeDefined();

    expect((await syncBoth()).wiped).toBe(true);
    expect((await syncBoth()).wiped).toBe(false);
  });

  it('reaches a device that signed out keeping its data, and back in', async () => {
    await household();
    // What joining again does: keys and cursors forgotten, the data kept and
    // queued to be sent again in full.
    await forgetSyncIdentity(b.db);
    server.erase();
    tick();
    await requeueEverything(b.db);

    expect((await b.sync()).wiped).toBe(true);
    expect(await b.db.transactions.count()).toBe(0);
    expect(await customCategories(b.db)).toBe(0);
    expect(held()).toEqual(['profiles', 'settings']);
  });

  it('does not clear for an erase of a space it was unlinked from', async () => {
    const { theirs, syncBoth } = linkedPair();
    await addProfile(b.db, 'p1');
    await b.db.transactions.put(tx('t1'));
    await syncBoth();

    await forgetSpace(b.db, 'them');
    theirs.erase();
    // Linked again later: their space is new to this device.
    expect((await syncBoth()).wiped).toBe(false);
    expect(await b.db.transactions.get('t1')).toBeDefined();
  });

  it('takes the epoch of a space it has never pulled from without clearing anything', async () => {
    server.erase();
    await addProfile(b.db, 'p1');
    await b.db.transactions.put(tx('t1'));
    const report = await b.sync();
    expect(report.wiped).toBe(false);
    expect(await b.db.transactions.count()).toBe(1);
    expect((await b.db.meta.get(epochKeyOf(ME)))?.value).toBe(1);
  });

  it('records an epoch of 0 too, so a first erase still reaches a device', async () => {
    await household();
    expect((await b.db.meta.get(epochKeyOf(ME)))?.value).toBe(0);
  });

  it('clears again, harmlessly, after a clear whose epoch was never recorded', async () => {
    await household();
    server.erase();
    tick();
    // A crash between clearing and recording what was answered.
    await eraseLocalData(b.db);
    expect((await b.db.meta.get(epochKeyOf(ME)))?.value).toBe(0);

    await b.sync();
    expect(await b.db.transactions.count()).toBe(0);
    expect((await b.db.meta.get(epochKeyOf(ME)))?.value).toBe(1);
    expect(held()).toEqual(['profiles', 'settings']);
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
});

describe('eraseLocalData', () => {
  it('keeps settings and people queued to be sent again, and drops cursors and drafts', async () => {
    await addProfile(a.db, 'p1');
    await writeSettings(a.db, { defaultCurrency: 'ILS' }, now());
    await createCategory(a.db, 'cat.custom', { name: 'Gym', kind: 'expense', icon: 'Circle' }, now());
    await a.db.transactions.put(tx('t1'));
    await a.db.meta.bulkPut([
      { key: cursorKeyOf(undefined), value: 5 },
      { key: cursorKeyOf('x'), value: 7 },
      { key: epochKeyOf('x'), value: 3 },
      { key: 'importDraft:k', value: {} },
      { key: 'deviceId', value: 'd1' },
    ]);
    await eraseLocalData(a.db);
    expect(await a.db.transactions.count()).toBe(0);
    expect(await customCategories(a.db)).toBe(0);
    expect(await a.db.profiles.count()).toBe(1);
    expect((await a.db.settings.get('singleton'))?.defaultCurrency).toBe('ILS');
    expect((await a.db.outbox.toArray()).map((o) => o.tbl).sort()).toEqual(['profiles', 'settings']);
    for (const key of [cursorKeyOf(undefined), cursorKeyOf('x'), 'importDraft:k', SYNC_WIPED_KEY]) {
      expect(await a.db.meta.get(key)).toBeUndefined();
    }
    expect(await a.db.meta.get('deviceId')).toBeDefined();
    // An erase counter is how a later erase still reaches this device.
    expect((await a.db.meta.get(epochKeyOf('x')))?.value).toBe(3);
  });

  it('brings the built-ins back as on a new install', async () => {
    await setCategoryArchived(a.db, 'cat.groceries', true, now());
    await eraseLocalData(a.db);
    expect(await a.db.categories.count()).toBe(buildSeedCategories(now()).length);
    expect(await a.db.paymentMethods.count()).toBe(buildSeedPaymentMethods(now()).length);
    expect((await a.db.categories.get('cat.groceries'))?.isArchived).toBe(0);
    // Pristine, so never sent.
    expect(await a.db.syncState.filter((s) => s.tbl === 'categories').count()).toBe(0);
    expect(await a.db.outbox.count()).toBe(0);
  });

  it('keeps a settings row nobody chose, without queuing it', async () => {
    await addProfile(b.db, 'p1');
    await eraseLocalData(b.db);
    expect(await b.db.settings.get('singleton')).toBeDefined();
    expect((await b.db.outbox.toArray()).map((o) => o.tbl)).toEqual(['profiles']);
  });

  it('records the epochs it answers, and marks a clear made by a sync', async () => {
    await eraseLocalData(a.db, { epochs: new Map([['x', 4]]), bySync: true });
    expect((await a.db.meta.get(epochKeyOf('x')))?.value).toBe(4);
    expect(await a.db.meta.get(SYNC_WIPED_KEY)).toBeDefined();
  });
});
