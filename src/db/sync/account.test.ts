import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureSettings } from '@/db/repos/settings';
import { d } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { toBase64Url } from '@/services/crypto/bytes';
import { blindRecordId, deriveKeyring, newDataKey } from '@/services/crypto/keys';
import { getKeyState, rotateKeys, rpcTransport, setupKeys } from '@/services/supabase/transport';
import { freshDb, type TestDb } from '@/test/db-harness';
import { freshPg, type TestPg } from '@/test/pg-harness';

import { connectDevice, DATA_OWNER_KEY, joinCheck, rotateAccountKey, type KeyServer } from './account';
import { adoptKeyring, forgetSyncIdentity, loadKeys } from './keystore';

/*
 * Getting a device the account's key - against the real SQL, both migrations
 * applied, so the move from passphrase-held keys is exercised too.
 */

const USER = '00000000-0000-4000-8000-0000000000cc';
const OTHER = '00000000-0000-4000-8000-0000000000dd';
const NOW = instantFromMs(Date.parse('2026-09-29T10:00:00.000Z'));

let pg: TestPg;
let server: KeyServer;
let phone: TestDb;
let laptop: TestDb;

beforeEach(async () => {
  pg = await freshPg();
  const rpc = pg.as(USER).rpc;
  server = {
    getKeyState: () => getKeyState(rpc),
    setupKeys: (wraps) => setupKeys(rpc, wraps),
    rotateKeys: (from, wraps) => rotateKeys(rpc, from, wraps),
  };
  phone = freshDb();
  laptop = freshDb();
  for (const device of [phone, laptop]) {
    await device.db.open();
    await ensureSettings(device.db, NOW);
  }
});
afterEach(async () => {
  await phone.dispose();
  await laptop.dispose();
  await pg.close();
});

const version = async (device: TestDb) => (await loadKeys(device.db))?.current.version;

/** The id a device would file transaction t1 under: equal ids, equal keys. */
async function fingerprint(device: TestDb): Promise<string | undefined> {
  const keys = await loadKeys(device.db);
  return keys === undefined ? undefined : blindRecordId(keys.current, 'transactions', 't1');
}

async function sameKey(a: TestDb, b: TestDb): Promise<boolean> {
  const fa = await fingerprint(a);
  return fa !== undefined && fa === (await fingerprint(b));
}

describe('signing in is enough', () => {
  it('makes the key on the first device and hands it to the next', async () => {
    expect(await connectDevice(phone.db, server, USER)).toEqual({ ok: true, needsAccountKey: false });
    expect(await connectDevice(laptop.db, server, USER)).toEqual({ ok: true, needsAccountKey: false });
    expect(await sameKey(phone, laptop)).toBe(true);

    const state = await getKeyState(pg.as(USER).rpc);
    expect(state.keyVersion).toBe(1);
    expect(state.wraps.map((w) => w.kind)).toEqual(['account']);
  });

  it('is safe to call on every sign-in', async () => {
    await connectDevice(phone.db, server, USER);
    const before = await fingerprint(phone);
    expect(await connectDevice(phone.db, server, USER)).toEqual({ ok: true, needsAccountKey: false });
    expect(await fingerprint(phone)).toBe(before);
    expect(await version(phone)).toBe(1);
  });

  it('lets two devices race to be first, and both end with the same key', async () => {
    await connectDevice(phone.db, server, USER);
    // The laptop read "no key yet" just before the phone made one.
    let stale = true;
    const racing: KeyServer = {
      ...server,
      getKeyState: () => {
        if (stale) {
          stale = false;
          return Promise.resolve({ keyVersion: 0, wraps: [] });
        }
        return server.getKeyState();
      },
    };
    expect(await connectDevice(laptop.db, racing, USER)).toEqual({ ok: true, needsAccountKey: false });
    expect(await sameKey(phone, laptop)).toBe(true);
  });

  it('never lets another account read the key', async () => {
    await connectDevice(phone.db, server, USER);
    expect((await getKeyState(pg.as(OTHER).rpc)).wraps).toEqual([]);
    expect(await pg.as(OTHER).query('select * from public.user_keys')).toEqual([]);
  });

  it('refuses an account entry that is not a key', async () => {
    const rpc = pg.as(USER).rpc;
    const entry = (salt: string, ct: string) => [
      { kind: 'account' as const, id: 'account', keyVersion: 1, salt, iv: '', ct },
    ];
    await expect(setupKeys(rpc, entry('', 'short'))).rejects.toMatchObject({ code: 'malformed_wrap' });
    await expect(setupKeys(rpc, entry('x', toBase64Url(newDataKey())))).rejects.toMatchObject({
      code: 'malformed_wrap',
    });
  });
});

describe("never uploading someone else's data", () => {
  /** The laptop was someone else's synced device; they signed out and kept the data. */
  async function leftBehindByAnotherAccount(): Promise<void> {
    await laptop.db.meta.put({ key: DATA_OWNER_KEY, value: OTHER });
    await laptop.db.profiles.put({ id: 'p-theirs' } as never);
    await laptop.db.outbox.clear();
  }

  it('refuses until the person chooses, then adds it only when asked', async () => {
    await connectDevice(phone.db, server, USER);
    await leftBehindByAnotherAccount();

    expect(await connectDevice(laptop.db, server, USER)).toEqual({
      ok: false,
      reason: 'foreign_data',
      profiles: 1,
      transactions: 0,
    });
    expect(await loadKeys(laptop.db)).toBeUndefined();
    expect(await laptop.db.outbox.count()).toBe(0);

    expect(await connectDevice(laptop.db, server, USER, { addExistingData: true })).toMatchObject({
      ok: true,
    });
    expect(await laptop.db.outbox.get(['profiles', 'p-theirs'])).toBeDefined();
    expect((await laptop.db.meta.get(DATA_OWNER_KEY))?.value).toBe(USER);
  });

  it('refuses to be the first device of a new account on top of it, too', async () => {
    await leftBehindByAnotherAccount();
    expect(await connectDevice(laptop.db, server, USER)).toMatchObject({ ok: false, reason: 'foreign_data' });
    expect((await getKeyState(pg.as(USER).rpc)).keyVersion).toBe(0); // nothing reached the server
  });

  it('lets the same account back in without asking', async () => {
    await connectDevice(laptop.db, server, USER);
    await laptop.db.profiles.put({ id: 'p-mine' } as never);
    await forgetSyncIdentity(laptop.db); // signed out, kept the data
    expect(await joinCheck(laptop.db, USER)).toEqual({ kind: 'fresh' });
    expect(await connectDevice(laptop.db, server, USER)).toMatchObject({ ok: true });
  });

  it("does not count sample data as anyone's, and never uploads it", async () => {
    const { loadDemoData, hasDemoData } = await import('@/db/demo');
    await laptop.db.meta.put({ key: DATA_OWNER_KEY, value: OTHER });
    await loadDemoData(laptop.db, { today: d('2026-09-15'), baseCurrency: 'ILS', now: NOW });
    expect(await joinCheck(laptop.db, USER)).toEqual({ kind: 'fresh' });
    await connectDevice(laptop.db, server, USER);
    expect(await hasDemoData(laptop.db)).toBe(false);
  });

  it('queues everything already on a device joining, and forgets an old cursor', async () => {
    await laptop.db.profiles.put({ id: 'p-mine' } as never);
    await laptop.db.meta.put({ key: 'syncCursor', value: 999 });
    await laptop.db.outbox.clear();
    await connectDevice(laptop.db, server, USER);
    expect(await laptop.db.meta.get('syncCursor')).toBeUndefined();
    expect(await laptop.db.outbox.get(['profiles', 'p-mine'])).toBeDefined();
  });
});

describe('signing out other devices', () => {
  it('moves the account to a new key the others fetch, and re-queues everything', async () => {
    await connectDevice(phone.db, server, USER);
    await connectDevice(laptop.db, server, USER);
    await phone.db.profiles.put({ id: 'p1' } as never);
    await phone.db.outbox.clear();

    await rotateAccountKey(phone.db, server, USER);
    expect(await version(phone)).toBe(2);
    expect(await phone.db.outbox.get(['profiles', 'p1'])).toBeDefined();
    expect(await sameKey(phone, laptop)).toBe(false);

    expect(await connectDevice(laptop.db, server, USER)).toMatchObject({ ok: true });
    expect(await sameKey(phone, laptop)).toBe(true);
  });

  it('refuses a server that hands back the key it retired', async () => {
    await connectDevice(phone.db, server, USER);
    const retired = await server.getKeyState();
    await rotateAccountKey(phone.db, server, USER);

    const replaying: KeyServer = { ...server, getKeyState: () => Promise.resolve(retired) };
    expect(await connectDevice(phone.db, replaying, USER)).toEqual({ ok: false, reason: 'downgrade' });
    await expect(rotateAccountKey(phone.db, replaying, USER)).rejects.toThrow(RangeError);
    expect(await version(phone)).toBe(2);
  });
});

describe('accounts set up behind a sync passphrase', () => {
  /** The old way: only secret-held wraps on the server; the phone holds v1. */
  async function legacyAccount(): Promise<void> {
    const ring = await deriveKeyring(newDataKey(), 1);
    const rpc = pg.as(USER).rpc;
    await setupKeys(rpc, [
      {
        kind: 'recovery',
        id: 'recovery',
        keyVersion: 1,
        salt: 'A'.repeat(22),
        iv: 'A'.repeat(16),
        ct: 'A'.repeat(64),
      },
    ]);
    await adoptKeyring(phone.db, USER, ring);
    await phone.db.meta.put({ key: DATA_OWNER_KEY, value: USER });
    await rpcTransport(rpc).push([
      {
        rid: 'B'.repeat(43),
        rev: '0000001000000000.0000.dev00001' as never,
        keyVersion: 1,
        iv: 'A'.repeat(16),
        ct: 'A'.repeat(30),
      },
    ]);
  }

  it('keeps syncing on the device that holds the key, and says it should move over', async () => {
    await legacyAccount();
    expect(await connectDevice(phone.db, server, USER)).toEqual({ ok: true, needsAccountKey: true });
  });

  it('moves over from that device: a new key the account holds, and the old copy dropped', async () => {
    await legacyAccount();
    await rotateAccountKey(phone.db, server, USER);

    const state = await getKeyState(pg.as(USER).rpc);
    expect(state.keyVersion).toBe(2);
    expect(state.wraps.map((w) => w.kind)).toEqual(['account']);
    expect((await rpcTransport(pg.as(USER).rpc).pull(0, 100)).records).toEqual([]);
    expect(await connectDevice(phone.db, server, USER)).toEqual({ ok: true, needsAccountKey: false });

    // Any other device now just signs in.
    expect(await connectDevice(laptop.db, server, USER)).toMatchObject({ ok: true });
    expect(await sameKey(phone, laptop)).toBe(true);
  });

  it('tells a device that never held the old key, which can start the copy over', async () => {
    await legacyAccount();
    expect(await connectDevice(laptop.db, server, USER)).toEqual({ ok: false, reason: 'legacy_locked' });
    await rotateAccountKey(laptop.db, server, USER);
    expect(await connectDevice(laptop.db, server, USER)).toEqual({ ok: true, needsAccountKey: false });
    // The phone, which held v1, meets v2 and fetches it like anyone else.
    expect(await connectDevice(phone.db, server, USER)).toMatchObject({ ok: true });
    expect(await sameKey(phone, laptop)).toBe(true);
  });
});
