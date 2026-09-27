import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BookandryDB } from '@/db/db';
import { materialize } from '@/db/materialize';
import { createProfile } from '@/db/repos/profiles';
import { ensureSettings } from '@/db/repos/settings';
import { d, MONEY } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { toBase64Url } from '@/services/crypto/bytes';
import { deriveKeyring, newDataKey, type Keyring } from '@/services/crypto/keys';
import { freshDb, type TestDb } from '@/test/db-harness';
import { MemoryCipherServer } from '@/test/memory-sync-server';
import type { Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { CURSOR_KEY } from './apply';
import { encryptingTransport, KeyUnavailableError, type EncryptedRecord } from './codec';
import { syncOnce } from './engine';
import { adoptKeyring, dropOlderKeys, loadKeys } from './keystore';
import { requeueEverything } from './rotate';

/*
 * The same two devices, now through a server that only ever holds ciphertext
 * - and a server that is actively trying to cheat.
 */

const USER = 'user-1';
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

let server: MemoryCipherServer;
let ringV1: Keyring;
let a: Device;
let b: Device;

async function device(userId = USER, ring?: Keyring): Promise<Device> {
  const handle = freshDb(Infinity, SEED_TIME);
  const db = handle.db;
  db.syncNowMs = () => clock;
  await db.open();
  await ensureSettings(db, now());
  await adoptKeyring(db, userId, ring ?? ringV1);
  const rejected: string[] = [];
  const transport = encryptingTransport(server.transport(), {
    userId,
    keys: () => {
      if (keysCache.get(db) === undefined) throw new Error('keys not loaded');
      return keysCache.get(db)!;
    },
    onRejected: (_rid, reason) => rejected.push(reason),
  });
  const sync = async () => {
    keysCache.set(db, await loadKeys(db));
    return syncOnce(db, transport, { now: now(), batchSize: 50 });
  };
  return { db, handle, rejected, sync };
}
const keysCache = new Map<BookandryDB, Awaited<ReturnType<typeof loadKeys>>>();

beforeEach(async () => {
  clock = T0;
  server = new MemoryCipherServer();
  ringV1 = await deriveKeyring(newDataKey(), 1);
  a = await device();
  b = await device();
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
  keysCache.clear();
});

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

async function converge(): Promise<void> {
  await a.sync();
  await b.sync();
  await a.sync();
}

/** The server record currently holding a given row, found the only way it can be: by trying. */
async function heldFor(tbl: string, id: string): Promise<EncryptedRecord> {
  const { blindRecordId } = await import('@/services/crypto/keys');
  const keys = (await loadKeys(a.db))!;
  const rid = await blindRecordId(keys.current, tbl, id);
  const found = server.snapshot().find((r) => r.rid === rid);
  if (found === undefined) throw new Error(`nothing held for ${tbl}/${id}`);
  return found;
}

describe('through a ciphertext-only server', () => {
  it('two devices still converge', async () => {
    await a.db.transactions.put(tx('t1', 'first'));
    await converge();
    tick();
    await b.db.transactions.update('t1', { note: 'edited on the phone' });
    await converge();
    expect((await a.db.transactions.get('t1'))?.note).toBe('edited on the phone');
    expect(a.rejected).toEqual([]);
    expect(b.rejected).toEqual([]);
  });

  it('the server learns no table, no id, no note and no amount', async () => {
    await a.db.transactions.put(tx('0192f000-dead-7000-8000-00000000beef', 'dentist, second visit'));
    await a.sync();
    const everything = JSON.stringify(server.snapshot());
    // Only strings long enough that random base64 cannot contain them by
    // chance: a two-letter id like "p1" turns up in ciphertext and device ids
    // on its own, and a leak test that fails at random teaches people to
    // ignore it.
    for (const secret of [
      'transactions',
      'profiles',
      '0192f000-dead',
      'dentist, second visit',
      'cat.groceries',
      'amountMinor',
      'openingBalance',
    ]) {
      expect(everything, secret).not.toContain(secret);
    }
    // What it does see: opaque ids, revs, one key version, ciphertext.
    expect(Object.keys(server.snapshot()[0]!).sort()).toEqual(['ct', 'iv', 'keyVersion', 'rev', 'rid']);
  });

  it('a device of another account cannot read a thing', async () => {
    await a.db.transactions.put(tx('t1', 'private'));
    await a.sync();
    const stranger = await device('user-2');
    await stranger.sync();
    expect(await stranger.db.transactions.count()).toBe(0);
    expect(stranger.rejected.length).toBeGreaterThan(0);
    await stranger.handle.dispose();
  });
});

describe('a server that cheats', () => {
  beforeEach(async () => {
    await a.db.transactions.bulkPut([tx('t1', 'one'), tx('t2', 'two')]);
    await a.sync();
  });

  it('cannot alter a record: it is refused, and the rest still arrives', async () => {
    const held = await heldFor('transactions', 't1');
    server.tamper(held.rid, (r) => {
      const flipped = r.ct.charAt(5) === 'A' ? 'B' : 'A';
      return { ...r, ct: r.ct.slice(0, 5) + flipped + r.ct.slice(6) };
    });
    await b.sync();
    expect(b.rejected).toContain('decrypt');
    expect(await b.db.transactions.get('t1')).toBeUndefined();
    expect(await b.db.transactions.get('t2')).toBeDefined();
  });

  it("cannot move one row's ciphertext onto another", async () => {
    const one = await heldFor('transactions', 't1');
    const two = await heldFor('transactions', 't2');
    server.tamper(two.rid, () => ({ ...one, rid: two.rid }));
    await b.sync();
    expect(b.rejected).toContain('decrypt');
    expect((await b.db.transactions.get('t1'))?.note).toBe('one');
    expect(await b.db.transactions.get('t2')).toBeUndefined();
  });

  it('cannot bump a rev to make an old version win', async () => {
    const held = await heldFor('transactions', 't1');
    server.tamper(held.rid, (r) => ({ ...r, rev: `9${r.rev.slice(1)}` as typeof r.rev }));
    await b.sync();
    expect(b.rejected).toContain('decrypt');
  });

  it('cannot forge a deletion: the flag is inside the ciphertext', async () => {
    // There is no plaintext "deleted" to flip. The closest a server can get
    // is swapping in some other record's bytes, which fails to open.
    expect(Object.keys(await heldFor('transactions', 't1'))).not.toContain('deleted');
    await b.sync();
    expect(await b.db.transactions.get('t1')).toBeDefined();
  });

  it('replaying an older, authentic version changes nothing', async () => {
    await b.sync();
    const old = await heldFor('transactions', 't1');
    tick();
    await a.db.transactions.update('t1', { note: 'newer' });
    await converge();

    // The server serves the old ciphertext again, as though it were news.
    server.tamper(old.rid, () => old);
    await b.sync();
    expect((await b.db.transactions.get('t1'))?.note).toBe('newer');
    expect(b.rejected).toEqual([]); // authentic, just not newer: skipped
  });
});

describe('rotating the data key', () => {
  it('locks out a device that has only the old key, until it unlocks with the new one', async () => {
    await a.db.transactions.put(tx('t1', 'before'));
    await converge();

    // A lost phone: A rotates. New data key, server wiped, everything re-sealed.
    const ringV2 = await deriveKeyring(newDataKey(), 2);
    await adoptKeyring(a.db, USER, ringV2);
    server.rotateTo(2);
    expect(await requeueEverything(a.db)).toBeGreaterThan(0);
    tick();
    await a.db.transactions.update('t1', { note: 'after' });
    await a.sync();
    await dropOlderKeys(a.db);
    expect(server.snapshot().every((r) => r.keyVersion === 2)).toBe(true);

    // B still has only v1: it stops, and does NOT skip past what it cannot read.
    const cursorBefore = (await b.db.meta.get(CURSOR_KEY))?.value;
    await expect(b.sync()).rejects.toThrow(KeyUnavailableError);
    expect((await b.db.meta.get(CURSOR_KEY))?.value).toBe(cursorBefore);
    expect((await b.db.transactions.get('t1'))?.note).toBe('before');

    // B unlocks with the new key (from a factor, in the real flow) and catches up.
    await adoptKeyring(b.db, USER, ringV2);
    await b.sync();
    expect((await b.db.transactions.get('t1'))?.note).toBe('after');
    expect(b.rejected).toEqual([]);
  });

  it("keeps a stale device's edit queued until it unlocks, instead of filing it where nobody can read it", async () => {
    await a.db.transactions.put(tx('t1', 'before'));
    await converge();

    const ringV2 = await deriveKeyring(newDataKey(), 2);
    await adoptKeyring(a.db, USER, ringV2);
    server.rotateTo(2);
    await requeueEverything(a.db);
    await a.sync();
    await dropOlderKeys(a.db);

    // B, offline through the rotation, edits under the key it has.
    tick();
    await b.db.transactions.update('t1', { note: 'edited on b' });
    await expect(b.sync()).rejects.toThrow(/retired key/);
    expect(await b.db.outbox.get(['transactions', 't1'])).toBeDefined();
    expect(server.snapshot().every((r) => r.keyVersion === 2)).toBe(true);

    // Once B unlocks, the edit goes out under the new key and reaches A.
    await adoptKeyring(b.db, USER, ringV2);
    await b.sync();
    await a.sync();
    expect((await a.db.transactions.get('t1'))?.note).toBe('edited on b');
    expect(a.rejected).toEqual([]);
  });

  it('passes over a record under a retired key rather than stopping the account at it forever', async () => {
    await a.db.transactions.put(tx('t1', 'before'));
    await a.sync();
    const sealedUnderV1 = await heldFor('transactions', 't1');

    const ringV2 = await deriveKeyring(newDataKey(), 2);
    await adoptKeyring(a.db, USER, ringV2);
    server.reset(); // a server that forgets to enforce the barrier...
    await requeueEverything(a.db);
    await a.sync();
    await dropOlderKeys(a.db);
    await server.transport().push([sealedUnderV1]); // ...and files a v1 record after it
    tick();
    await a.db.transactions.put(tx('t2', 'after the stray'));
    await a.sync();

    // A device that only ever held v2 reads straight past it.
    const c = await device(USER, ringV2);
    try {
      await c.sync();
      expect(c.rejected).toEqual(['retired-key']);
      expect((await c.db.transactions.get('t1'))?.note).toBe('before');
      expect(await c.db.transactions.get('t2')).toBeDefined();
      // And it does not come back on the next round.
      await c.sync();
      expect(c.rejected).toEqual(['retired-key']);
    } finally {
      await c.handle.dispose();
    }
  });
});

describe('the keystore', () => {
  it('keeps the working keys across a reopen, still non-extractable', async () => {
    a.db.close();
    await a.db.open();
    const keys = await loadKeys(a.db);
    expect(keys?.userId).toBe(USER);
    expect(keys?.current.version).toBe(1);
    expect(keys?.current.enc.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', keys!.current.enc)).rejects.toThrow();
    // No raw key material anywhere in meta.
    const meta = JSON.stringify(await a.db.meta.toArray(), (_k, v: unknown) =>
      v instanceof Uint8Array ? toBase64Url(v) : v,
    );
    expect(meta).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });
});
