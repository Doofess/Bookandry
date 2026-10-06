import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BookandryDB } from '@/db/db';
import { materialize } from '@/db/materialize';
import { createProfile } from '@/db/repos/profiles';
import { ensureSettings } from '@/db/repos/settings';
import { encryptingTransport } from '@/db/sync/codec';
import { syncOnce } from '@/db/sync/engine';
import { adoptKeyring, dropOlderKeys, loadKeys, type LoadedKeys } from '@/db/sync/keystore';
import { requeueEverything } from '@/db/sync/rotate';
import { d, MONEY } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { deriveKeyring, newDataKey, type Keyring } from '@/services/crypto/keys';
import { freshDb, type TestDb } from '@/test/db-harness';
import { freshPg, type TestPg } from '@/test/pg-harness';
import type { Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { rotateKeys, rpcTransport, setupKeys } from './transport';

/*
 * The whole path, end to end, minus only the network: two devices' Dexie
 * databases, the merge engine, the encryption codec, the RPC transport, and
 * the migration running on real Postgres. What the in-memory server promised
 * in Phase 2, the SQL must keep.
 */

const USER = '00000000-0000-4000-8000-0000000000aa';
const SEED_TIME = '2026-01-01T00:00:00.000Z' as IsoInstant;
const T0 = Date.parse('2026-09-27T10:00:00.000Z');
let clock = T0;
const now = (): IsoInstant => instantFromMs(clock);
const tick = (): void => {
  clock += 1_000;
};

type Device = {
  db: BookandryDB;
  handle: TestDb;
  rejected: string[];
  sync: () => ReturnType<typeof syncOnce>;
};

let pg: TestPg;
let ringV1: Keyring;
let a: Device;
let b: Device;

async function device(ring: Keyring): Promise<Device> {
  const handle = freshDb(Infinity, SEED_TIME);
  const db = handle.db;
  db.syncNowMs = () => clock;
  await db.open();
  await ensureSettings(db, now());
  await adoptKeyring(db, USER, ring);
  const rejected: string[] = [];
  let keys: LoadedKeys | undefined;
  const transport = encryptingTransport(rpcTransport(pg.as(USER).rpc), {
    userId: USER,
    keys: () => {
      if (keys === undefined) throw new Error('keys not loaded');
      return keys;
    },
    onRejected: (_rid, reason) => rejected.push(reason),
  });
  const sync = async () => {
    keys = await loadKeys(db);
    return syncOnce(db, transport, { now: now(), batchSize: 50 });
  };
  return { db, handle, rejected, sync };
}

function tx(id: string, note: string): Transaction {
  return materialize({
    id,
    profileId: 'p1',
    kind: 'expense',
    categoryId: 'cat.groceries',
    money: MONEY,
    recurrence: { type: 'one_time' },
    date: d('2026-09-01'),
    seriesRootId: id,
    note,
    createdAt: now(),
    updatedAt: now(),
  });
}

beforeEach(async () => {
  clock = T0;
  pg = await freshPg();
  // The wraps' contents are not this suite's concern; the server only checks their shape.
  const fake = (kind: 'recovery') => ({
    kind,
    id: kind,
    keyVersion: 1,
    salt: 'A'.repeat(22),
    iv: 'A'.repeat(16),
    ct: 'A'.repeat(64),
  });
  await setupKeys(pg.as(USER).rpc, [fake('recovery')]);
  ringV1 = await deriveKeyring(newDataKey(), 1);
  a = await device(ringV1);
  b = await device(ringV1);
  await createProfile(
    a.db,
    'p1',
    {
      name: 'Dana',
      avatar: 'fox',
      openingBalanceMinor: 0,
      openingBalanceCurrency: 'USD',
      openingBalanceDate: d('2026-01-01'),
    } as never,
    now(),
  );
});
afterEach(async () => {
  await a.handle.dispose();
  await b.handle.dispose();
  await pg.close();
});

describe('two devices through Postgres', () => {
  it('converge on adds, edits and deletes from both sides', async () => {
    await a.db.transactions.bulkPut([tx('t1', 'from a'), tx('t2', 'also a')]);
    await a.sync();
    await b.sync();
    expect((await b.db.transactions.get('t1'))?.note).toBe('from a');

    tick();
    await b.db.transactions.update('t1', { note: 'edited on b' });
    await b.db.transactions.delete('t2');
    await b.db.transactions.put(tx('t3', 'from b'));
    await b.sync();
    await a.sync();

    expect((await a.db.transactions.get('t1'))?.note).toBe('edited on b');
    expect(await a.db.transactions.get('t2')).toBeUndefined();
    expect((await a.db.transactions.get('t3'))?.note).toBe('from b');
    expect(await a.db.transactions.count()).toBe(await b.db.transactions.count());
    expect([...a.rejected, ...b.rejected]).toEqual([]);
  });

  it('settle a concurrent edit the same way on both devices', async () => {
    await a.db.transactions.put(tx('t1', 'original'));
    await a.sync();
    await b.sync();

    tick();
    await a.db.transactions.update('t1', { note: 'a wins? no' });
    tick();
    await b.db.transactions.update('t1', { note: 'b is later' });
    await a.sync();
    await b.sync();
    await a.sync();

    expect((await a.db.transactions.get('t1'))?.note).toBe('b is later');
    expect((await b.db.transactions.get('t1'))?.note).toBe('b is later');
  });

  // 180 rows through an in-process Postgres: seconds alone, longer under the full run with coverage.
  it('pull many pages without losing a row', async () => {
    await a.db.transactions.bulkPut(
      Array.from({ length: 180 }, (_, i) => tx(`t${String(i)}`, `n${String(i)}`)),
    );
    await a.sync();
    await b.sync();
    expect(await b.db.transactions.count()).toBe(180);
  }, 30_000);

  it('hold a stale device at the rotation barrier until it unlocks, then deliver its edit', async () => {
    await a.db.transactions.put(tx('t1', 'before'));
    await a.sync();
    await b.sync();

    const ringV2 = await deriveKeyring(newDataKey(), 2);
    const fake = {
      kind: 'recovery',
      id: 'recovery',
      keyVersion: 2,
      salt: 'B'.repeat(22),
      iv: 'B'.repeat(16),
      ct: 'B'.repeat(64),
    } as const;
    expect(await rotateKeys(pg.as(USER).rpc, 1, [fake])).toBe(2);
    await adoptKeyring(a.db, USER, ringV2);
    await requeueEverything(a.db);
    await a.sync();
    await dropOlderKeys(a.db);

    tick();
    await b.db.transactions.update('t1', { note: 'edited on b' });
    await expect(b.sync()).rejects.toThrow('stale_key_version');
    expect(await b.db.outbox.get(['transactions', 't1'])).toBeDefined();

    await adoptKeyring(b.db, USER, ringV2);
    await b.sync();
    await a.sync();
    expect((await a.db.transactions.get('t1'))?.note).toBe('edited on b');
    expect([...a.rejected, ...b.rejected]).toEqual([]);
  });
});
