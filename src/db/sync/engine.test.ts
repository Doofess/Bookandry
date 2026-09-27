import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BookandryDB } from '@/db/db';
import { materialize } from '@/db/materialize';
import { createCategory, deleteCategory, renameCategory, setCategoryArchived } from '@/db/repos/categories';
import { createProfile } from '@/db/repos/profiles';
import { ensureSettings, writeSettings } from '@/db/repos/settings';
import { d, MONEY, skip } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { freshDb, type TestDb } from '@/test/db-harness';
import { MemorySyncServer } from '@/test/memory-sync-server';
import type { Override, Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { CURSOR_KEY } from './apply';
import { syncOnce } from './engine';
import { acknowledge, collectOutgoing } from './outbox';
import type { SyncTransport } from './protocol';

/*
 * Two devices and one server, all in memory.
 *
 * Every scenario here is one the plan named as a way sync goes wrong in real
 * households: the same row edited on both phones, a delete racing an edit,
 * the same occurrence edited twice, a currency change, a lost network reply,
 * a crash half way through applying. Each ends the same way - both devices
 * holding the same data, and the server holding it too.
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

/**
 * Two installs seed identical built-ins, but stamp them with their own install
 * time - and those rows never sync, by design, because an untouched default is
 * not an edit. So the devices get one seed time here, or the comparison would
 * report a difference nobody can see and nothing ever reads.
 */
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

/** Everything that syncs, in a form two devices can be compared by. */
async function synced(db: BookandryDB): Promise<unknown> {
  const sort = <T extends { id: string }>(rows: T[]): T[] => rows.sort((x, y) => x.id.localeCompare(y.id));
  const settings = await db.settings.get('singleton');
  return {
    profiles: sort(await db.profiles.toArray()),
    categories: sort(await db.categories.toArray()),
    paymentMethods: sort(await db.paymentMethods.toArray()),
    transactions: sort(await db.transactions.toArray()),
    overrides: sort(await db.overrides.toArray()),
    currency: settings?.defaultCurrency,
  };
}

/** Sync until both devices have seen everything, then compare. */
async function converge(): Promise<void> {
  await a.sync();
  await b.sync();
  await a.sync();
  expect(await synced(b.db)).toEqual(await synced(a.db));
  expect(await a.db.outbox.count()).toBe(0);
  expect(await b.db.outbox.count()).toBe(0);
}

describe('the basics', () => {
  it('carries a new transaction from one device to the other', async () => {
    await addProfile(a.db, 'p1');
    await a.db.transactions.put(tx('t1'));
    await a.sync();
    await b.sync();
    expect((await b.db.transactions.get('t1'))?.money.amountMinor).toBe(MONEY.amountMinor);
    expect(await b.db.profiles.get('p1')).toBeDefined();
  });

  it('sends an edit back the other way', async () => {
    await addProfile(a.db, 'p1');
    await a.db.transactions.put(tx('t1'));
    await converge();

    tick();
    await b.db.transactions.update('t1', { note: 'from the phone' });
    await converge();
    expect((await a.db.transactions.get('t1'))?.note).toBe('from the phone');
  });

  it('does not bounce what it pulled straight back up', async () => {
    await addProfile(a.db, 'p1');
    await a.db.transactions.put(tx('t1'));
    await a.sync();
    const report = await b.sync();
    expect(report.applied).toBeGreaterThan(0);
    expect(await b.db.outbox.count()).toBe(0);
  });

  it('carries a deletion', async () => {
    await addProfile(a.db, 'p1');
    await a.db.transactions.put(tx('t1'));
    await converge();

    tick();
    await a.db.transactions.delete('t1');
    await converge();
    expect(await b.db.transactions.get('t1')).toBeUndefined();
  });
});

describe('conflicts: the later edit wins, on both devices', () => {
  beforeEach(async () => {
    await addProfile(a.db, 'p1');
    await a.db.transactions.put(tx('t1'));
    await converge();
  });

  it('two edits of the same row made apart', async () => {
    tick();
    await a.db.transactions.update('t1', { note: 'laptop' });
    tick();
    await b.db.transactions.update('t1', { note: 'phone, later' });
    await converge();
    expect((await a.db.transactions.get('t1'))?.note).toBe('phone, later');
  });

  it('a delete that came after an edit', async () => {
    tick();
    await b.db.transactions.update('t1', { note: 'edited first' });
    tick();
    await a.db.transactions.delete('t1');
    await converge();
    expect(await b.db.transactions.get('t1')).toBeUndefined();
  });

  it('an edit that came after a delete brings the row back', async () => {
    // Last write wins, including over a delete. Losing an edit someone made
    // AFTER the delete would be the worse surprise.
    tick();
    await a.db.transactions.delete('t1');
    tick();
    await b.db.transactions.update('t1', { note: 'still needed' });
    await converge();
    expect((await a.db.transactions.get('t1'))?.note).toBe('still needed');
  });

  it('a device whose clock is behind still wins with an edit made after it saw the other', async () => {
    tick();
    await a.db.transactions.update('t1', { note: 'from a fast clock' });
    await converge();

    // B's clock is an hour slow, but B edits AFTER seeing A's edit: the rev
    // is built on the row's own history, not on B's wall clock alone.
    clock -= 3_600_000;
    await b.db.transactions.update('t1', { note: 'later, slow clock' });
    clock += 3_600_000;
    await converge();
    expect((await a.db.transactions.get('t1'))?.note).toBe('later, slow clock');
  });
});

describe('the same occurrence edited on both devices', () => {
  it('keeps one override in the slot, the same one everywhere', async () => {
    await addProfile(a.db, 'p1');
    await a.db.transactions.put(tx('rent', { recurrence: { type: 'monthly', dayOfMonth: 1 } }));
    await converge();

    // Apart, each device writes its own override for 1 October, each with
    // its own random id. Applied naively, the unique index throws on every
    // pull, forever.
    tick();
    const fromA: Override = {
      ...skip('rent', d('2026-10-01')),
      id: 'ov-a',
      createdAt: now(),
      updatedAt: now(),
    };
    await a.db.overrides.put(fromA);
    tick();
    const fromB: Override = {
      ...skip('rent', d('2026-10-01')),
      id: 'ov-b',
      createdAt: now(),
      updatedAt: now(),
    };
    await b.db.overrides.put(fromB);

    await converge();
    const onA = await a.db.overrides.toArray();
    expect(onA.map((o) => o.id)).toEqual(['ov-b']); // the later one
    expect(await b.db.overrides.toArray()).toEqual(onA);
    // The loser is gone from the server too, not just from the devices.
    expect(server.snapshot().find((r) => r.id === 'ov-a')?.deleted).toBe(true);
  });
});

describe('settings', () => {
  it('syncs a base currency change', async () => {
    tick();
    await writeSettings(a.db, { defaultCurrency: 'ILS' }, now());
    await converge();
    expect((await b.db.settings.get('singleton'))?.defaultCurrency).toBe('ILS');
  });

  it('never lets a theme or language change carry a currency along', async () => {
    tick();
    await writeSettings(a.db, { defaultCurrency: 'ILS' }, now());
    await a.sync();
    tick();
    // B has not synced yet; its row still says USD. Changing its theme must
    // not push that stale USD over A's choice.
    await writeSettings(b.db, { theme: 'dark', language: 'he' }, now());
    await converge();
    expect((await a.db.settings.get('singleton'))?.defaultCurrency).toBe('ILS');
    expect((await b.db.settings.get('singleton'))?.theme).toBe('dark');
    expect((await a.db.settings.get('singleton'))?.theme).not.toBe('dark');
  });
});

describe('built-ins every install has', () => {
  it('a fresh device takes an archive made elsewhere instead of undoing it', async () => {
    tick();
    await setCategoryArchived(a.db, 'cat.groceries', true, now());
    await a.sync();

    const report = await b.sync();
    expect(report.pushed).toBe(0); // nothing pristine went up
    expect((await b.db.categories.get('cat.groceries'))?.isArchived).toBe(1);
  });

  it('an archive on one device and a restore on the other: the later one holds', async () => {
    tick();
    await setCategoryArchived(a.db, 'cat.groceries', true, now());
    await converge();
    tick();
    await setCategoryArchived(b.db, 'cat.groceries', false, now());
    await converge();
    expect((await a.db.categories.get('cat.groceries'))?.isArchived).toBe(0);
  });
});

describe('custom categories', () => {
  it('a rename on each device resolves like any other row', async () => {
    await createCategory(a.db, 'c.food', { name: 'Food', kind: 'expense', icon: 'tag' }, now());
    await converge();
    tick();
    await renameCategory(a.db, 'c.food', 'Groceries', now());
    tick();
    await renameCategory(b.db, 'c.food', 'Supermarket', now());
    await converge();
    expect((await a.db.categories.get('c.food')) as unknown).toMatchObject({ name: 'Supermarket' });
  });
});

describe('a category deleted on one device while the other uses it', () => {
  it('ends with the transaction somewhere valid on both, the same place', async () => {
    await addProfile(a.db, 'p1');
    await createCategory(a.db, 'c.gym', { name: 'Gym', kind: 'expense', icon: 'tag' }, now());
    await converge();

    tick();
    await deleteCategory(a.db, 'c.gym', {}, now());
    tick();
    await b.db.transactions.put(tx('t.gym', { categoryId: 'c.gym' }));

    await converge();
    const onA = await a.db.transactions.get('t.gym');
    expect(onA).toBeDefined();
    expect(await a.db.categories.get(onA!.categoryId)).toBeDefined();
  });
});

describe('when the network misbehaves', () => {
  beforeEach(async () => {
    await addProfile(a.db, 'p1');
  });

  it('a lost acknowledgement: the push is resent and counted once', async () => {
    await a.db.transactions.put(tx('t1'));
    server.loseNextAck = true;
    await expect(a.sync()).rejects.toThrow('ack lost');
    expect(await a.db.outbox.count()).toBeGreaterThan(0); // still queued

    await converge();
    expect(server.snapshot().filter((r) => r.id === 't1')).toHaveLength(1);
  });

  it('a dropped push: nothing is lost, the next sync sends it', async () => {
    await a.db.transactions.put(tx('t1'));
    server.failNextPush = true;
    await expect(a.sync()).rejects.toThrow('push dropped');
    await converge();
    expect(await b.db.transactions.get('t1')).toBeDefined();
  });

  it('the same page delivered twice changes nothing the second time', async () => {
    await a.db.transactions.put(tx('t1'));
    await a.sync();
    server.duplicateNextPull = true;
    const report = await b.sync();
    expect(report.skipped).toBeGreaterThan(0);
    await converge();
  });

  it('a crash half way through applying a page leaves the cursor where it was', async () => {
    await a.db.transactions.bulkPut([tx('t1'), tx('t2'), tx('t3')]);
    await a.sync();

    // B fails while writing the second transaction of the page. Injected at
    // db.table(), which is how the apply step reaches every table.
    const table = b.db.table.bind(b.db);
    let calls = 0;
    b.db.table = ((name: string) => {
      const real = table(name);
      if (name !== 'transactions') return real;
      return new Proxy(real, {
        get(target, prop, receiver) {
          if (prop !== 'put') return Reflect.get(target, prop, receiver) as unknown;
          return (row: Transaction) => {
            calls += 1;
            return calls === 2 ? Promise.reject(new Error('crash')) : target.put(row);
          };
        },
      });
    }) as typeof b.db.table;
    await expect(b.sync()).rejects.toThrow('crash');
    b.db.table = table;

    expect(await b.db.meta.get(CURSOR_KEY)).toBeUndefined();
    expect(await b.db.transactions.count()).toBe(0); // all or nothing
    await converge();
    expect(await b.db.transactions.count()).toBe(3);
  });

  it('an edit made while its previous version was being pushed is not lost', async () => {
    await a.db.transactions.put(tx('t1'));
    const inner = server.transport();
    let edited = false;
    const racing: SyncTransport = {
      push: async (records) => {
        const results = await inner.push(records);
        if (!edited) {
          // The user edits t1 again while the first push is in flight. The
          // acknowledgement that follows is for the OLD version.
          edited = true;
          tick();
          await a.db.transactions.update('t1', { note: 'mid-flight' });
        }
        return results;
      },
      pull: (c, l) => inner.pull(c, l),
    };
    await a.sync(racing);

    // The stale acknowledgement did not clear the newer edit: it went up too.
    expect((server.snapshot().find((r) => r.id === 't1')?.row as Transaction).note).toBe('mid-flight');
    await converge();
    expect((await b.db.transactions.get('t1'))?.note).toBe('mid-flight');
  });

  it('an acknowledgement for an older rev leaves the newer edit queued', async () => {
    await a.db.transactions.put(tx('t1'));
    const [pushed] = await collectOutgoing(a.db, 10);
    tick();
    await a.db.transactions.update('t1', { note: 'newer' });

    await acknowledge(a.db, [{ tbl: 'transactions', id: 't1', rev: pushed!.rev, status: 'stored' }]);
    expect(await a.db.outbox.get(['transactions', 't1'])).toBeDefined();
  });
});

describe('pages', () => {
  it('never split one push, so a row and its companion arrive together', async () => {
    await addProfile(a.db, 'p1');
    await a.db.transaction('rw', [a.db.transactions, a.db.overrides], async () => {
      await a.db.transactions.put(tx('plan'));
      await a.db.overrides.put({ ...skip('plan', d('2026-09-01')), id: 'first-payment' });
    });
    await a.sync();

    const inner = server.transport();
    const pages: string[][] = [];
    const spy: SyncTransport = {
      push: (r) => inner.push(r),
      pull: async (cursor) => {
        const page = await inner.pull(cursor, 1); // a page size of ONE
        pages.push(page.records.map((r) => r.id));
        return page;
      },
    };
    await b.sync(spy);
    const withPlan = pages.find((p) => p.includes('plan'));
    expect(withPlan).toContain('first-payment');
  });
});
