import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureSettings } from '@/db/repos/settings';
import { instantFromMs } from '@/lib/dates';
import type { ArgonParams } from '@/services/crypto/kdf';
import { getKeyState, putWrap, rotateKeys, ServerError, setupKeys } from '@/services/supabase/transport';
import { freshDb, type TestDb } from '@/test/db-harness';
import { freshPg, type TestPg } from '@/test/pg-harness';

import {
  changePassphrase,
  keyStatus,
  replaceRecoveryKey,
  rotateDataKey,
  setUpSync,
  unlock,
  type AccountOptions,
  type KeyServer,
} from './account';
import { loadKeys } from './keystore';

/*
 * The account's key flows, against the real SQL. Argon2id runs with toy
 * parameters here; production parameters are pinned in crypto.test.ts.
 */

const USER = '00000000-0000-4000-8000-0000000000cc';
const FAST: ArgonParams = { alg: 'argon2id', m: 64, t: 1, p: 1 };
const OPTS: AccountOptions = { argon: FAST, allowWeakKdf: true };
const NOW = instantFromMs(Date.parse('2026-09-27T10:00:00.000Z'));

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
    putWrap: (wrap) => putWrap(rpc, wrap),
    rotateKeys: (from, wraps) => rotateKeys(rpc, from, wraps),
  };
  // The server refuses weak Argon2id outright; these tests use toy parameters,
  // so its floor is lowered here - and only here.
  await pg.pg.exec(`
    create or replace function private.check_wrap(w jsonb, version integer) returns void
    language plpgsql immutable set search_path = '' as $$ begin
      if (w ->> 'keyVersion')::integer <> version then raise exception 'malformed_wrap'; end if;
    end $$;`);
  phone = freshDb();
  laptop = freshDb();
  for (const d of [phone, laptop]) {
    await d.db.open();
    await ensureSettings(d.db, NOW);
  }
});
afterEach(async () => {
  await phone.dispose();
  await laptop.dispose();
  await pg.close();
});

describe('setting up and unlocking', () => {
  it('sets up on one device and unlocks on another with the passphrase', async () => {
    expect(await keyStatus(phone.db, server, USER)).toBe('not_set_up');
    const { recoveryKey } = await setUpSync(phone.db, server, USER, 'correct horse', OPTS);
    expect(recoveryKey).toMatch(/^([0-9A-Z*~$=]{4}-){6}[0-9A-Z*~$=]{3}$/);
    expect(await keyStatus(phone.db, server, USER)).toBe('unlocked');
    expect(await keyStatus(laptop.db, server, USER)).toBe('locked');

    expect(await unlock(laptop.db, server, USER, { kind: 'passphrase', passphrase: 'wrong' }, OPTS)).toEqual({
      ok: false,
      reason: 'wrong',
    });
    expect(
      await unlock(laptop.db, server, USER, { kind: 'passphrase', passphrase: 'correct horse' }, OPTS),
    ).toEqual({
      ok: true,
    });
    expect(await keyStatus(laptop.db, server, USER)).toBe('unlocked');

    // Both devices now seal and open with the same key.
    const [a, b] = [await loadKeys(phone.db), await loadKeys(laptop.db)];
    const { blindRecordId } = await import('@/services/crypto/keys');
    expect(await blindRecordId(a!.current, 'transactions', 't1')).toBe(
      await blindRecordId(b!.current, 'transactions', 't1'),
    );
  });

  it('unlocks with the recovery key typed the way people type', async () => {
    const { recoveryKey } = await setUpSync(phone.db, server, USER, 'pass', OPTS);
    const typed = recoveryKey.toLowerCase().replaceAll('-', ' ');
    expect(await unlock(laptop.db, server, USER, { kind: 'recovery', text: typed }, OPTS)).toEqual({
      ok: true,
    });
  });

  it('tells a typo from a wrong key', async () => {
    const { recoveryKey } = await setUpSync(phone.db, server, USER, 'pass', OPTS);
    const typo = (recoveryKey.startsWith('A') ? 'B' : 'A') + recoveryKey.slice(1);
    expect(await unlock(laptop.db, server, USER, { kind: 'recovery', text: typo }, OPTS)).toMatchObject({
      ok: false,
      reason: 'malformed',
    });
    expect(await unlock(laptop.db, server, USER, { kind: 'recovery', text: 'short' }, OPTS)).toEqual({
      ok: false,
      reason: 'malformed',
      detail: 'length',
    });
    const other = (await import('@/services/crypto/recovery-key')).newRecoveryKey().display;
    expect(await unlock(laptop.db, server, USER, { kind: 'recovery', text: other }, OPTS)).toEqual({
      ok: false,
      reason: 'wrong',
    });
  });

  it('lets only one device be first', async () => {
    await setUpSync(phone.db, server, USER, 'one', OPTS);
    const second = setUpSync(laptop.db, server, USER, 'two', OPTS);
    await expect(second).rejects.toThrow(ServerError);
    await expect(second).rejects.toMatchObject({ code: 'already_set_up' });
    expect(await loadKeys(laptop.db)).toBeUndefined();
    expect(
      await unlock(laptop.db, server, USER, { kind: 'passphrase', passphrase: 'two' }, OPTS),
    ).toMatchObject({
      ok: false,
    });
  });

  it('says so when there is nothing to unlock yet', async () => {
    expect(await unlock(laptop.db, server, USER, { kind: 'passphrase', passphrase: 'x' }, OPTS)).toEqual({
      ok: false,
      reason: 'not_set_up',
    });
  });
});

describe('joining an account', () => {
  it('queues everything already on the device, and forgets an old account entirely', async () => {
    await setUpSync(phone.db, server, USER, 'pass', OPTS);

    // The laptop was signed in to some OTHER account before, and synced with it.
    const { adoptKeyring } = await import('./keystore');
    const { deriveKeyring, newDataKey } = await import('@/services/crypto/keys');
    await adoptKeyring(laptop.db, 'someone-else', await deriveKeyring(newDataKey(), 3));
    await laptop.db.profiles.put({ id: 'p-mine' } as never);
    await laptop.db.meta.put({ key: 'syncCursor', value: 999 });
    await laptop.db.outbox.clear(); // the old account had acknowledged everything

    expect(await unlock(laptop.db, server, USER, { kind: 'passphrase', passphrase: 'pass' }, OPTS)).toEqual({
      ok: true,
    });
    expect(await laptop.db.meta.get('syncCursor')).toBeUndefined();
    expect(await laptop.db.outbox.get(['profiles', 'p-mine'])).toBeDefined();
    const keys = await loadKeys(laptop.db);
    expect(keys?.userId).toBe(USER);
    expect([...(keys?.byVersion.keys() ?? [])]).toEqual([1]);
  });

  it('leaves sample data behind', async () => {
    const { loadDemoData, hasDemoData } = await import('@/db/demo');
    const { d } = await import('@/domain/test-factories');
    await loadDemoData(laptop.db, { today: d('2026-09-15'), baseCurrency: 'ILS', now: NOW });
    expect(await hasDemoData(laptop.db)).toBe(true);
    await setUpSync(laptop.db, server, USER, 'pass', OPTS);
    expect(await hasDemoData(laptop.db)).toBe(false);
  });

  it('changes nothing for a device already on this account, locked by a rotation', async () => {
    await setUpSync(phone.db, server, USER, 'pass', OPTS);
    await unlock(laptop.db, server, USER, { kind: 'passphrase', passphrase: 'pass' }, OPTS);
    await laptop.db.meta.put({ key: 'syncCursor', value: 5 });
    await rotateDataKey(phone.db, server, USER, { kind: 'passphrase', passphrase: 'pass' }, 'pass', OPTS);

    await unlock(laptop.db, server, USER, { kind: 'passphrase', passphrase: 'pass' }, OPTS);
    expect((await laptop.db.meta.get('syncCursor'))?.value).toBe(5);
    expect([...((await loadKeys(laptop.db))?.byVersion.keys() ?? [])].sort()).toEqual([1, 2]);
  });
});

describe('changing the ways in', () => {
  it('replaces the recovery key: the new one works, the old one no longer does', async () => {
    const { recoveryKey: old } = await setUpSync(phone.db, server, USER, 'pass', OPTS);
    const replaced = await replaceRecoveryKey(server, USER, { kind: 'passphrase', passphrase: 'pass' }, OPTS);
    if (!replaced.ok || !('recoveryKey' in replaced)) throw new Error('expected a new key');

    expect(await unlock(laptop.db, server, USER, { kind: 'recovery', text: old }, OPTS)).toEqual({
      ok: false,
      reason: 'wrong',
    });
    expect(
      await unlock(laptop.db, server, USER, { kind: 'recovery', text: replaced.recoveryKey }, OPTS),
    ).toEqual({
      ok: true,
    });
  });

  it('changes the passphrase, proven with the recovery key', async () => {
    const { recoveryKey } = await setUpSync(phone.db, server, USER, 'old pass', OPTS);
    expect(
      await changePassphrase(server, USER, { kind: 'recovery', text: recoveryKey }, 'new pass', OPTS),
    ).toEqual({ ok: true });
    expect(
      await unlock(laptop.db, server, USER, { kind: 'passphrase', passphrase: 'old pass' }, OPTS),
    ).toMatchObject({
      ok: false,
    });
    expect(
      await unlock(laptop.db, server, USER, { kind: 'passphrase', passphrase: 'new pass' }, OPTS),
    ).toEqual({
      ok: true,
    });
  });

  it('refuses every change without a correct secret', async () => {
    await setUpSync(phone.db, server, USER, 'pass', OPTS);
    const wrong = { kind: 'passphrase', passphrase: 'nope' } as const;
    expect(await replaceRecoveryKey(server, USER, wrong, OPTS)).toMatchObject({ ok: false, reason: 'wrong' });
    expect(await changePassphrase(server, USER, wrong, 'x', OPTS)).toMatchObject({
      ok: false,
      reason: 'wrong',
    });
    expect(await rotateDataKey(phone.db, server, USER, wrong, 'x', OPTS)).toMatchObject({
      ok: false,
      reason: 'wrong',
    });
    expect((await getKeyState(pg.as(USER).rpc)).keyVersion).toBe(1);
  });
});

describe('rotating after a lost device', () => {
  it('locks out the old key and every old way in, and queues everything to re-upload', async () => {
    const { recoveryKey: oldRecovery } = await setUpSync(phone.db, server, USER, 'pass', OPTS);
    await unlock(laptop.db, server, USER, { kind: 'passphrase', passphrase: 'pass' }, OPTS);
    await phone.db.profiles.put({ id: 'p1' } as never);
    await phone.db.outbox.clear(); // as though already synced

    const rotated = await rotateDataKey(
      phone.db,
      server,
      USER,
      { kind: 'passphrase', passphrase: 'pass' },
      'new pass',
      OPTS,
    );
    if (!rotated.ok || !('recoveryKey' in rotated)) throw new Error('expected rotation');

    expect(await keyStatus(phone.db, server, USER)).toBe('unlocked');
    expect((await loadKeys(phone.db))?.current.version).toBe(2);
    expect(await phone.db.outbox.get(['profiles', 'p1'])).toBeDefined();

    // The laptop (standing in for the lost phone) is locked out of v2...
    expect(await keyStatus(laptop.db, server, USER)).toBe('locked');
    // ...and nothing it held opens the new key.
    expect(
      await unlock(laptop.db, server, USER, { kind: 'passphrase', passphrase: 'pass' }, OPTS),
    ).toMatchObject({
      ok: false,
    });
    expect(
      await unlock(laptop.db, server, USER, { kind: 'recovery', text: oldRecovery }, OPTS),
    ).toMatchObject({
      ok: false,
    });
    expect(
      await unlock(laptop.db, server, USER, { kind: 'recovery', text: rotated.recoveryKey }, OPTS),
    ).toEqual({
      ok: true,
    });
  });

  it('refuses to rotate over a rotation it has not seen', async () => {
    await setUpSync(phone.db, server, USER, 'pass', OPTS);
    const proof = { kind: 'passphrase', passphrase: 'pass' } as const;
    // Another device rotates first, between this one reading and writing.
    const racing: KeyServer = {
      ...server,
      rotateKeys: async (from, wraps) => {
        await rotateDataKey(laptop.db, server, USER, proof, 'pass', OPTS);
        return server.rotateKeys(from, wraps);
      },
    };
    await unlock(laptop.db, server, USER, proof, OPTS);
    await expect(rotateDataKey(phone.db, racing, USER, proof, 'pass', OPTS)).rejects.toMatchObject({
      code: 'key_version_changed',
    });
    expect((await loadKeys(phone.db))?.current.version).toBe(1);
  });
});
