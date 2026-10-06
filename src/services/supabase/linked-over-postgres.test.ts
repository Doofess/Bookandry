import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BookandryDB } from '@/db/db';
import { materialize } from '@/db/materialize';
import { ensureMember } from '@/db/members';
import { createProfile } from '@/db/repos/profiles';
import { ensureSettings } from '@/db/repos/settings';
import { connectDevice } from '@/db/sync/account';
import { encryptingTransport } from '@/db/sync/codec';
import { syncOnce, type SyncSpace } from '@/db/sync/engine';
import { loadKeys, loadSpaceKeys } from '@/db/sync/keystore';
import { connectLinked } from '@/db/sync/linked';
import { d, MONEY } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { freshDb, type TestDb } from '@/test/db-harness';
import { freshPg, type Session, type TestPg } from '@/test/pg-harness';
import type { Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { acceptInvite, getHousehold, leaveHousehold } from './household';
import { getKeyState, rotateKeys, rpcTransport, setupKeys } from './transport';

/*
 * Two linked accounts, end to end minus the network: each its own device,
 * its own key, its own space in real Postgres, linked by an invitation, kept
 * in step through the encryption codec - then unlinked.
 */

const ALICE = '00000000-0000-4000-8000-0000000000a1';
const BOB = '00000000-0000-4000-8000-0000000000b2';
const SEED_TIME = '2026-01-01T00:00:00.000Z' as IsoInstant;
const T0 = Date.parse('2026-10-07T10:00:00.000Z');
let clock = T0;
const now = (): IsoInstant => instantFromMs(clock);

type Device = { id: string; db: BookandryDB; handle: TestDb; session: Session; rejected: string[] };

let pg: TestPg;
let alice: Device;
let bob: Device;

async function device(id: string, email: string): Promise<Device> {
  await pg.pg.query(
    `insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now()) on conflict do nothing`,
    [id, email],
  );
  const handle = freshDb(Infinity, SEED_TIME);
  handle.db.syncNowMs = () => clock;
  await handle.db.open();
  await ensureSettings(handle.db, now());
  const session = pg.as(id);
  const server = {
    getKeyState: () => getKeyState(session.rpc),
    setupKeys: (w: Parameters<typeof setupKeys>[1]) => setupKeys(session.rpc, w),
    rotateKeys: (from: number, w: Parameters<typeof rotateKeys>[2]) => rotateKeys(session.rpc, from, w),
  };
  expect(await connectDevice(handle.db, server, id)).toEqual({ ok: true });
  return { id, db: handle.db, handle, session, rejected: [] };
}

/** One sync, the way the app runs it: the household asked for, then every space. */
async function sync(who: Device): Promise<void> {
  const household = await getHousehold(who.session.rpc);
  const members = household?.members.map((m) => m.userId) ?? [];
  const linked = await connectLinked(
    who.db,
    { getKeyState: (s) => getKeyState(who.session.rpc, s) },
    who.id,
    members,
  );
  const own = await loadKeys(who.db);
  if (own === undefined) throw new Error('no keys');
  const onRejected = (_rid: string, reason: string) => who.rejected.push(reason);
  const spaces: SyncSpace[] = [];
  for (const id of linked) {
    const keys = await loadSpaceKeys(who.db, id);
    if (keys === undefined) continue;
    spaces.push({
      id,
      transport: encryptingTransport(rpcTransport(who.session.rpc, id), {
        userId: id,
        keys: () => keys,
        onRejected,
      }),
    });
  }
  await syncOnce(
    who.db,
    {
      own: {
        id: who.id,
        transport: encryptingTransport(rpcTransport(who.session.rpc), {
          userId: who.id,
          keys: () => own,
          onRejected,
        }),
      },
      linked: spaces,
    },
    { now: now(), batchSize: 50 },
  );
}

function tx(id: string, profileId: string): Transaction {
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
  });
}

async function person(db: BookandryDB, id: string, name: string, color: string): Promise<void> {
  await createProfile(
    db,
    id,
    {
      name,
      color,
      openingBalanceMinor: 0,
      openingBalanceCurrency: 'USD',
      openingBalanceDate: d('2026-01-01'),
    },
    now(),
  );
}

async function link(): Promise<void> {
  const { token } = (await alice.session.rpc('create_invite', {
    p_email: 'bob@example.com',
    p_currency: 'USD',
  })) as { token: string };
  await acceptInvite(bob.session.rpc, token, 'USD', 'Bob');
}

const txIds = async (db: BookandryDB) => (await db.transactions.toArray()).map((t) => t.id).sort();

beforeEach(async () => {
  clock = T0;
  pg = await freshPg();
  alice = await device(ALICE, 'alice@example.com');
  bob = await device(BOB, 'bob@example.com');
});
afterEach(async () => {
  await alice.handle.dispose();
  await bob.handle.dispose();
  await pg.close();
});

describe('linked accounts over Postgres', () => {
  it('links, shows each the other’s rows sealed under their own key, and unlinks to each their own', async () => {
    // Alice had a household of profiles before linking; the first is her.
    await person(alice.db, 'legacy-alice', 'Alice', '#16794a');
    await person(alice.db, 'legacy-kid', 'Kid', '#0f766e');
    await alice.db.transactions.put(tx('a1', 'legacy-alice'));
    await alice.db.transactions.put(tx('k1', 'legacy-kid'));
    await person(bob.db, BOB, 'Bob', '#4338ca');
    await bob.db.transactions.put(tx('b1', BOB));
    await sync(alice);
    await sync(bob);
    expect(await ensureMember(alice.db, ALICE, 'Alice', now(), d('2026-10-07'))).toBe('merged');
    expect((await alice.db.transactions.get('a1'))?.profileId).toBe(ALICE);

    await link();
    for (let i = 0; i < 2; i += 1) {
      await sync(alice);
      await sync(bob);
    }

    expect(await txIds(bob.db)).toEqual(['a1', 'b1', 'k1']);
    expect(await txIds(alice.db)).toEqual(['a1', 'b1', 'k1']);
    expect((await bob.db.profiles.toArray()).map((p) => p.id).sort()).toEqual(
      [ALICE, BOB, 'legacy-kid'].sort(),
    );
    expect(alice.rejected).toEqual([]);
    expect(bob.rejected).toEqual([]);

    // Bob edits the kid's row, which lives in Alice's space.
    clock += 1_000;
    await bob.db.transactions.update('k1', { note: 'from Bob' });
    await sync(bob);
    await sync(alice);
    expect((await alice.db.transactions.get('k1'))?.note).toBe('from Bob');

    await leaveHousehold(bob.session.rpc);
    await sync(bob);
    await sync(alice);
    expect(await txIds(bob.db)).toEqual(['b1']);
    expect(await txIds(alice.db)).toEqual(['a1', 'k1']);
    expect((await alice.db.transactions.get('k1'))?.note).toBe('from Bob');
    expect(await loadSpaceKeys(bob.db, ALICE)).toBeUndefined();
  });

  it('fetches a linked account’s new key after it rotates', async () => {
    await person(alice.db, ALICE, 'Alice', '#16794a');
    await alice.db.transactions.put(tx('a1', ALICE));
    await link();
    await sync(alice);
    await sync(bob);
    const before = await loadSpaceKeys(bob.db, ALICE);
    expect(before?.current.version).toBe(1);

    // Alice starts her key over; her device re-sends everything under it.
    const { rotateAccountKey } = await import('@/db/sync/account');
    await rotateAccountKey(
      alice.db,
      {
        getKeyState: () => getKeyState(alice.session.rpc),
        setupKeys: (w) => setupKeys(alice.session.rpc, w),
        rotateKeys: (from, w) => rotateKeys(alice.session.rpc, from, w),
      },
      ALICE,
    );
    await sync(alice);

    await connectLinked(
      bob.db,
      { getKeyState: (s) => getKeyState(bob.session.rpc, s) },
      BOB,
      [ALICE, BOB],
      true,
    );
    expect((await loadSpaceKeys(bob.db, ALICE))?.current.version).toBe(2);
    clock += 1_000;
    await alice.db.transactions.update('a1', { note: 'new key' });
    await sync(alice);
    await sync(bob);
    expect((await bob.db.transactions.get('a1'))?.note).toBe('new key');
  });
});
