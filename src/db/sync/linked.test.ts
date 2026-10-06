import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BookandryDB } from '@/db/db';
import { materialize } from '@/db/materialize';
import { createCategory } from '@/db/repos/categories';
import { createProfile } from '@/db/repos/profiles';
import { ensureSettings } from '@/db/repos/settings';
import { d, MONEY, skip } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { freshDb, type TestDb } from '@/test/db-harness';
import { MemorySyncServer } from '@/test/memory-sync-server';
import { SHARED_OWNER, type PaymentMethod, type Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { syncOnce, type SyncSpaces } from './engine';
import { forgetSpace } from './spaces';

/*
 * Two linked accounts, each with its own space on the server, each on its own
 * device. Each account's rows live in its own space; the household's
 * structure in both. Linking shows each the other's; unlinking leaves each
 * exactly its own.
 */

const ALICE = 'alice-uid';
const BOB = 'bob-uid';
const T0 = Date.parse('2026-10-07T10:00:00.000Z');
let clock = T0;
const now = (): IsoInstant => instantFromMs(clock);
const tick = (ms = 1_000): void => {
  clock += ms;
};
const SEED_TIME = '2026-01-01T00:00:00.000Z' as IsoInstant;

type Device = { db: BookandryDB; handle: TestDb; linked: boolean };

const servers = new Map<string, MemorySyncServer>();
let alice: Device;
let bob: Device;

async function device(): Promise<Device> {
  const handle = freshDb(Infinity, SEED_TIME);
  handle.db.syncNowMs = () => clock;
  await handle.db.open();
  await ensureSettings(handle.db, now());
  return { db: handle.db, handle, linked: true };
}

function spacesFor(own: string, linked: readonly string[]): SyncSpaces {
  const space = (id: string) => ({ id, transport: servers.get(id)!.transport() });
  return { own: space(own), linked: linked.map(space) };
}

const sync = (who: Device) =>
  syncOnce(
    who.db,
    who === alice ? spacesFor(ALICE, who.linked ? [BOB] : []) : spacesFor(BOB, who.linked ? [ALICE] : []),
    { now: now(), batchSize: 50 },
  );

beforeEach(async () => {
  clock = T0;
  servers.set(ALICE, new MemorySyncServer());
  servers.set(BOB, new MemorySyncServer());
  alice = await device();
  bob = await device();
  await person(alice.db, ALICE);
  await person(bob.db, BOB);
});
afterEach(async () => {
  await alice.handle.dispose();
  await bob.handle.dispose();
});

async function person(db: BookandryDB, id: string): Promise<void> {
  await createProfile(
    db,
    id,
    {
      name: id,
      avatar: 'fox',
      openingBalanceMinor: 0,
      openingBalanceCurrency: 'USD',
      openingBalanceDate: d('2026-01-01'),
    } as never,
    now(),
  );
}

function tx(id: string, profileId: string, over: Partial<Transaction> = {}): Transaction {
  return materialize({
    id,
    profileId,
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

function card(id: string, profileId: string): PaymentMethod {
  return {
    id,
    profileId,
    type: 'credit_card',
    label: id,
    isArchived: 0,
    createdAt: now(),
    updatedAt: now(),
  };
}

/** The ids of a table's rows a server's space holds, live ones only. */
function held(space: string, tbl: string): string[] {
  return servers
    .get(space)!
    .snapshot()
    .filter((r) => r.tbl === tbl && !r.deleted)
    .map((r) => r.id)
    .sort();
}

const ids = async (db: BookandryDB, tbl: 'transactions' | 'paymentMethods' | 'profiles' | 'categories') =>
  (await db.table(tbl).toArray()).map((r: { id: string }) => r.id).sort();

async function everyoneSyncs(): Promise<void> {
  await sync(alice);
  await sync(bob);
  await sync(alice);
  await sync(bob);
}

describe('linked accounts', () => {
  it("keeps each account's rows in its own space, and shows both to both", async () => {
    await alice.db.transactions.put(tx('a1', ALICE));
    await bob.db.transactions.put(tx('b1', BOB));
    await everyoneSyncs();

    expect(held(ALICE, 'transactions')).toEqual(['a1']);
    expect(held(BOB, 'transactions')).toEqual(['b1']);
    expect(held(ALICE, 'profiles')).toEqual([ALICE]);
    expect(await ids(alice.db, 'transactions')).toEqual(['a1', 'b1']);
    expect(await ids(bob.db, 'transactions')).toEqual(['a1', 'b1']);
    expect(await ids(bob.db, 'profiles')).toEqual([ALICE, BOB]);
    expect(await alice.db.outbox.count()).toBe(0);
  });

  it("files an edit of the partner's row in the partner's space", async () => {
    await alice.db.transactions.put(tx('a1', ALICE));
    await everyoneSyncs();
    tick();
    await bob.db.transactions.update('a1', { note: 'from Bob' });
    await everyoneSyncs();

    expect(held(BOB, 'transactions')).toEqual([]);
    expect((await alice.db.transactions.get('a1'))?.note).toBe('from Bob');
  });

  it("files the household's structure and joint cards in every space", async () => {
    await createCategory(alice.db, 'pets', { kind: 'expense', name: 'Pets', icon: 'tag' }, now());
    await alice.db.paymentMethods.put(card('joint', SHARED_OWNER));
    await alice.db.paymentMethods.put(card('alices', ALICE));
    await everyoneSyncs();

    expect(held(BOB, 'categories')).toContain('pets');
    expect(held(BOB, 'paymentMethods')).toEqual(['joint']);
    expect(held(ALICE, 'paymentMethods')).toEqual(['alices', 'joint']);
  });

  it('shares what an account had before linking with the newly linked space', async () => {
    alice.linked = false;
    bob.linked = false;
    await createCategory(alice.db, 'pets', { kind: 'expense', name: 'Pets', icon: 'tag' }, now());
    await sync(alice);
    alice.linked = true;
    bob.linked = true;
    await everyoneSyncs();
    expect(await bob.db.categories.get('pets')).toBeDefined();
  });

  it('moves a row given to the other person, and every device agrees where it went', async () => {
    await alice.db.transactions.put(tx('a1', ALICE));
    await alice.db.overrides.put({ ...skip('a1', d('2026-09-01')), id: 'o1' });
    await everyoneSyncs();
    tick();
    await alice.db.transactions.update('a1', { profileId: BOB });
    await everyoneSyncs();

    expect(held(ALICE, 'transactions')).toEqual([]);
    expect(held(BOB, 'transactions')).toEqual(['a1']);
    expect((await alice.db.transactions.get('a1'))?.profileId).toBe(BOB);
    expect((await bob.db.transactions.get('a1'))?.profileId).toBe(BOB);

    // A device meeting the old space's tombstone first still keeps the row.
    const fresh = await device();
    try {
      fresh.db.syncNowMs = () => clock;
      await syncOnce(fresh.db, spacesFor(ALICE, [BOB]), { now: now() });
      expect((await fresh.db.transactions.get('a1'))?.profileId).toBe(BOB);
    } finally {
      await fresh.handle.dispose();
    }
  });

  it('deletes a row from every space', async () => {
    await alice.db.transactions.put(tx('a1', ALICE));
    await everyoneSyncs();
    tick();
    await bob.db.transactions.delete('a1');
    await everyoneSyncs();
    expect(held(ALICE, 'transactions')).toEqual([]);
    expect(await ids(alice.db, 'transactions')).toEqual([]);
  });
});

describe('unlinking', () => {
  it('leaves each account exactly its own, and the household structure', async () => {
    await createCategory(bob.db, 'pets', { kind: 'expense', name: 'Pets', icon: 'tag' }, now());
    await alice.db.transactions.put(tx('a1', ALICE));
    await alice.db.paymentMethods.put(card('alices', ALICE));
    await alice.db.paymentMethods.put(card('joint', SHARED_OWNER));
    await bob.db.transactions.put(tx('b1', BOB));
    await bob.db.paymentMethods.put(card('bobs', BOB));
    await everyoneSyncs();
    tick();
    // Edited by the other just before the end: still the owner's.
    await bob.db.transactions.update('a1', { note: 'from Bob' });
    await everyoneSyncs();

    alice.linked = false;
    bob.linked = false;
    await forgetSpace(alice.db, BOB);
    await forgetSpace(bob.db, ALICE);
    await sync(alice);
    await sync(bob);

    expect(await ids(alice.db, 'transactions')).toEqual(['a1']);
    expect(await ids(bob.db, 'transactions')).toEqual(['b1']);
    expect(await ids(alice.db, 'paymentMethods')).toEqual(expect.arrayContaining(['alices', 'joint']));
    expect(await ids(alice.db, 'paymentMethods')).not.toContain('bobs');
    expect(await ids(bob.db, 'paymentMethods')).toEqual(expect.arrayContaining(['bobs', 'joint']));
    expect(await ids(bob.db, 'paymentMethods')).not.toContain('alices');
    expect(await ids(alice.db, 'profiles')).toEqual([ALICE]);
    expect(await ids(bob.db, 'profiles')).toEqual([BOB]);
    expect(await alice.db.categories.get('pets')).toBeDefined();
    expect((await alice.db.transactions.get('a1'))?.note).toBe('from Bob');

    // Nothing of the other's was deleted from anyone's space.
    expect(held(BOB, 'transactions')).toEqual(['b1']);
    expect(held(ALICE, 'transactions')).toEqual(['a1']);
  });

  it('drops edits to the departed account’s rows that never left', async () => {
    await bob.db.transactions.put(tx('b1', BOB));
    await everyoneSyncs();
    tick();
    await alice.db.transactions.update('b1', { note: 'unsent' });
    alice.linked = false;
    await forgetSpace(alice.db, BOB);
    expect(await alice.db.outbox.count()).toBe(0);
    await sync(alice);
    expect(held(ALICE, 'transactions')).toEqual([]);
  });
});
