import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EncryptedRecord } from '@/db/sync/codec';
import { makeRev } from '@/lib/rev';
import { toBase64Url } from '@/services/crypto/bytes';
import type { WrappedKey } from '@/services/crypto/wrap';
import { freshPg, type Session, type TestPg } from '@/test/pg-harness';

import {
  deleteMyAccount,
  deleteWrap,
  getKeyState,
  putWrap,
  rotateKeys,
  rpcTransport,
  ServerError,
  setupKeys,
  type Rpc,
} from './transport';

/*
 * The migration, run on real Postgres dressed as Supabase: who can read what,
 * who can write what, and the push/pull rules the sync engine relies on.
 */

const ALICE = '00000000-0000-4000-8000-00000000000a';
const BOB = '00000000-0000-4000-8000-00000000000b';

let t: TestPg;
let alice: Session;
let bob: Session;

beforeEach(async () => {
  t = await freshPg();
  alice = t.as(ALICE);
  bob = t.as(BOB);
});
afterEach(async () => {
  await t.close();
});

const b64 = (n: number, fill: number): string => toBase64Url(new Uint8Array(n).fill(fill));

function wrap(kind: WrappedKey['kind'], keyVersion = 1, extra: Partial<WrappedKey> = {}): WrappedKey {
  return {
    kind,
    id: kind === 'passkey' ? b64(16, 7) : kind,
    keyVersion,
    salt: b64(16, 1),
    iv: b64(12, 2),
    ct: b64(48, 3),
    ...(kind === 'passphrase' ? { kdf: { alg: 'argon2id', m: 65_536, t: 3, p: 1 } } : {}),
    ...extra,
  };
}

const rev = (ms: number, device = 'dev00001') => makeRev({ ms, counter: 0, deviceId: device });

function record(n: number, ms: number, keyVersion = 1, ctFill = n): EncryptedRecord {
  return {
    rid: b64(32, n),
    rev: rev(ms),
    keyVersion,
    iv: b64(12, n),
    ct: b64(40, ctFill),
  };
}

async function refused(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof ServerError
      ? error.code === 'unknown'
        ? error.message
        : error.code
      : String(error);
  }
  throw new Error('expected a refusal, got success');
}

async function setUp(rpc: Rpc): Promise<void> {
  await setupKeys(rpc, [wrap('recovery'), wrap('passphrase')]);
}

describe('who can read and write what', () => {
  it('lets nobody signed out read a table or call a function', async () => {
    const anon = t.as(null);
    for (const table of ['records', 'user_keys', 'user_state']) {
      expect(await refused(anon.query(`select * from public.${table}`))).toMatch(/permission denied/);
    }
    for (const call of [
      'public.get_key_state()',
      'public.push_records($1)',
      'public.pull_records(0, 10)',
      'public.delete_my_account()',
    ]) {
      const params = call.includes('$1') ? ['[]'] : [];
      expect(await refused(anon.query(`select ${call}`, params))).toMatch(/permission denied/);
    }
  });

  it('lets no signed-in user write a table directly, only through the functions', async () => {
    await setUp(alice.rpc);
    const attempts = [
      `insert into public.records values ('${ALICE}', 'x', '${rev(1)}', 1, 1, 1, 'iv', 'ct')`,
      `update public.records set ct = 'x'`,
      `delete from public.records`,
      `insert into public.user_keys (user_id, kind, id, key_version, salt, iv, ct) values ('${ALICE}', 'recovery', 'r2', 1, 's', 'i', 'c')`,
      `delete from public.user_keys`,
      `update public.user_state set key_version = 99`,
    ];
    for (const sql of attempts) expect(await refused(alice.query(sql))).toMatch(/permission denied/);
  });

  it('keeps the helper functions out of reach', async () => {
    expect(await refused(alice.query(`select private.limits('records_per_push')`))).toMatch(
      /permission denied/,
    );
  });

  it("never shows one account another's records, keys or state", async () => {
    await setUp(alice.rpc);
    await rpcTransport(alice.rpc).push([record(1, 1_000)]);

    expect((await getKeyState(bob.rpc)).wraps).toEqual([]);

    // Bob's own records under the same rid are his, and change nothing of Alice's.
    await setUp(bob.rpc);
    await rpcTransport(bob.rpc).push([record(1, 9_000, 1, 99)]);
    const alices = await rpcTransport(alice.rpc).pull(0, 100);
    expect(alices.records).toEqual([record(1, 1_000)]);
  });

  it('lets no one read a table directly, not even their own rows: only through the functions', async () => {
    await setUp(alice.rpc);
    for (const table of ['records', 'user_keys', 'user_state'])
      expect(await refused(alice.query(`select * from public.${table}`))).toMatch(/permission denied/);
  });
});

describe('two-step sign-in', () => {
  async function turnOnCodes(userId: string): Promise<void> {
    await alice.query('select 1'); // creates the auth user
    await t.pg.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [userId]);
  }

  it('serves an account with codes turned on only after the code', async () => {
    await setUp(alice.rpc);
    await turnOnCodes(ALICE);

    for (const call of [
      () => getKeyState(alice.rpc),
      () => rpcTransport(alice.rpc).pull(0, 100),
      () => rpcTransport(alice.rpc).push([record(1, 1_000)]),
      () => deleteMyAccount(alice.rpc),
    ])
      await expect(call()).rejects.toMatchObject({ code: 'second_step_required' });

    const afterCode = t.as(ALICE, { aal: 'aal2' });
    expect((await getKeyState(afterCode.rpc)).keyVersion).toBe(1);
  });

  it('asks nothing more of an account without codes', async () => {
    await setUp(alice.rpc);
    await t.pg.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'unverified')`, [ALICE]);
    expect((await getKeyState(alice.rpc)).keyVersion).toBe(1);
  });
});

describe('keys', () => {
  it('sets up once, with a recovery key always among the ways in', async () => {
    expect(await refused(setupKeys(alice.rpc, [wrap('passphrase')]))).toBe('recovery_wrap_required');
    expect(await refused(setupKeys(alice.rpc, [wrap('recovery'), wrap('recovery')]))).toBe(
      'recovery_wrap_required',
    );
    expect(await setupKeys(alice.rpc, [wrap('recovery'), wrap('passphrase')])).toBe(1);

    const state = await getKeyState(alice.rpc);
    expect(state.keyVersion).toBe(1);
    expect(state.wraps).toEqual([wrap('passphrase'), wrap('recovery')]);

    // A second device racing to set up loses, and unlocks with this key instead.
    expect(await refused(setupKeys(alice.rpc, [wrap('recovery')]))).toBe('already_set_up');
  });

  it('refuses malformed wraps, including KDF parameters a phone could not run', async () => {
    const bad: WrappedKey[] = [
      wrap('passphrase', 1, { kdf: { alg: 'argon2id', m: 4_000_000, t: 3, p: 1 } }),
      wrap('passphrase', 1, { kdf: { alg: 'argon2id', m: 1_024, t: 1, p: 1 } }),
      wrap('passphrase', 1, { kdf: undefined }),
      wrap('recovery', 1, { kdf: { alg: 'argon2id', m: 65_536, t: 3, p: 1 } }),
      wrap('recovery', 1, { id: 'not-recovery' }),
      wrap('recovery', 1, { salt: 'short' }),
      wrap('recovery', 1, { ct: 'x'.repeat(10_000) }),
      wrap('recovery', 2),
    ];
    for (const w of bad) {
      const set = w.kind === 'recovery' ? [w] : [wrap('recovery'), w];
      expect(await refused(setupKeys(alice.rpc, set))).toBe('malformed_wrap');
    }
    expect((await getKeyState(alice.rpc)).keyVersion).toBe(0);
  });

  it('adds and removes a passkey, but never the recovery key', async () => {
    await setUp(alice.rpc);
    await putWrap(alice.rpc, wrap('passkey'));
    expect((await getKeyState(alice.rpc)).wraps.map((w) => w.kind)).toEqual([
      'passkey',
      'passphrase',
      'recovery',
    ]);
    await deleteWrap(alice.rpc, 'passkey', wrap('passkey').id);
    expect(await refused(deleteWrap(alice.rpc, 'recovery', 'recovery'))).toBe('recovery_wrap_required');
    expect((await getKeyState(alice.rpc)).wraps.map((w) => w.kind)).toEqual(['passphrase', 'recovery']);

    // A wrap must be for the CURRENT key.
    expect(await refused(putWrap(alice.rpc, wrap('passkey', 2)))).toBe('malformed_wrap');
  });

  it('rotates: new version, records dropped, and the old key is refused from then on', async () => {
    await setUp(alice.rpc);
    const transport = rpcTransport(alice.rpc);
    await transport.push([record(1, 1_000), record(2, 1_000)]);

    expect(await refused(rotateKeys(alice.rpc, 7, [wrap('recovery', 2)]))).toBe('key_version_changed');
    expect(await rotateKeys(alice.rpc, 1, [wrap('recovery', 2)])).toBe(2);

    const state = await getKeyState(alice.rpc);
    expect(state).toEqual({ keyVersion: 2, wraps: [wrap('recovery', 2)] });
    expect((await transport.pull(0, 100)).records).toEqual([]);

    // The barrier: a device still on v1 is refused, and nothing is written.
    expect(await refused(transport.push([record(3, 2_000, 2), record(1, 3_000, 1)]))).toBe(
      'stale_key_version',
    );
    expect((await transport.pull(0, 100)).records).toEqual([]);
    await transport.push([record(1, 3_000, 2)]);
    expect((await transport.pull(0, 100)).records).toEqual([record(1, 3_000, 2)]);
  });
});

describe('push and pull', () => {
  it('refuses a push before keys are set up', async () => {
    expect(await refused(rpcTransport(alice.rpc).push([record(1, 1_000)]))).toBe('keys_not_set_up');
  });

  it('stores newer, refuses older, and takes an equal rev as already stored', async () => {
    await setUp(alice.rpc);
    const transport = rpcTransport(alice.rpc);
    expect(await transport.push([record(1, 2_000)])).toEqual([
      { rid: record(1, 0).rid, rev: rev(2_000), status: 'stored' },
    ]);
    const first = await transport.pull(0, 100);

    expect((await transport.push([record(1, 1_000)]))[0]?.status).toBe('stale');
    // A resend after a lost ack: stored, and NOT a new change for others to pull.
    expect((await transport.push([record(1, 2_000)]))[0]?.status).toBe('stored');
    expect((await transport.pull(first.cursor, 100)).records).toEqual([]);

    expect((await transport.push([record(1, 3_000)]))[0]?.status).toBe('stored');
    const next = await transport.pull(first.cursor, 100);
    expect(next.records.map((r) => r.rev)).toEqual([rev(3_000)]);
  });

  it('orders revs byte by byte, whatever the database collation', async () => {
    await setUp(alice.rpc);
    const transport = rpcTransport(alice.rpc);
    // Same millisecond; the counter decides. Under a linguistic collation that
    // skips punctuation these could compare as their digits alone.
    const low = { ...record(1, 5_000), rev: makeRev({ ms: 5_000, counter: 9, deviceId: 'zzzzzzzz' }) };
    const high = { ...record(1, 5_000), rev: makeRev({ ms: 5_000, counter: 10, deviceId: '00000000' }) };
    await transport.push([high]);
    expect((await transport.push([low]))[0]?.status).toBe('stale');
  });

  it('never ends a page inside one push', async () => {
    await setUp(alice.rpc);
    const transport = rpcTransport(alice.rpc);
    await transport.push([record(1, 1_000), record(2, 1_000), record(3, 1_000)]);
    await transport.push([record(4, 1_000)]);

    const page = await transport.pull(0, 1);
    expect(page.records.map((r) => r.rid)).toEqual([1, 2, 3].map((n) => record(n, 0).rid));
    expect(page.hasMore).toBe(true);
    const rest = await transport.pull(page.cursor, 1);
    expect(rest.records.map((r) => r.rid)).toEqual([record(4, 0).rid]);
    expect(rest.hasMore).toBe(false);
    expect(await transport.pull(rest.cursor, 1)).toEqual({
      records: [],
      cursor: rest.cursor,
      hasMore: false,
      epoch: 0,
    });
  });

  it('still keeps the rest of a push together after part of it was overwritten', async () => {
    await setUp(alice.rpc);
    const transport = rpcTransport(alice.rpc);
    await transport.push([record(1, 1_000), record(2, 1_000), record(3, 1_000)]);
    await transport.push([record(2, 2_000)]); // record 2 moves to the later push

    const page = await transport.pull(0, 1);
    expect(page.records.map((r) => r.rid)).toEqual([record(1, 0).rid, record(3, 0).rid]);
    const rest = await transport.pull(page.cursor, 10);
    expect(rest.records.map((r) => r.rev)).toEqual([rev(2_000)]);
  });

  it('refuses a malformed record, and writes none of the push', async () => {
    await setUp(alice.rpc);
    const transport = rpcTransport(alice.rpc);
    const malformed: EncryptedRecord[] = [
      { ...record(1, 1_000), rid: 'short' },
      { ...record(1, 1_000), rev: 'not-a-rev' as EncryptedRecord['rev'] },
      { ...record(1, 1_000), iv: 'x' },
      { ...record(1, 1_000), ct: 'has spaces' },
      { ...record(1, 1_000), ct: 'x'.repeat(70_000) },
    ];
    for (const bad of malformed) {
      expect(await refused(alice.rpc('push_records', { p_records: [record(2, 1_000), bad] }))).toBe(
        'malformed_record',
      );
    }
    expect((await transport.pull(0, 100)).records).toEqual([]);
  });

  it('enforces the per-push and per-account limits', async () => {
    await setUp(alice.rpc);
    const many = Array.from({ length: 501 }, (_, i) => ({
      ...record(1, 1_000),
      rid: b64(32, 0) + String(i),
    }));
    expect(await refused(alice.rpc('push_records', { p_records: many }))).toBe('push_too_large');

    // Lower the account quota for the test, as the migration's owner could.
    await t.pg.exec(`
      create or replace function private.limits(name text) returns bigint
      language sql immutable set search_path = '' as $$
        select case name when 'records_per_user' then 2 when 'records_per_push' then 500
          when 'ct_chars' then 65536 when 'push_chars' then 4194304
          when 'bytes_per_user' then 52428800 when 'wraps_per_user' then 20 when 'pull_limit' then 1000 end::bigint
      $$;`);
    const transport = rpcTransport(alice.rpc);
    await transport.push([record(1, 1_000), record(2, 1_000)]);
    expect(await refused(transport.push([record(3, 1_000)]))).toBe('quota_exceeded');
    // Rewriting what is already there is not growth.
    expect((await transport.push([record(1, 2_000)]))[0]?.status).toBe('stored');
  });

  it('splits a large batch into pushes the server will accept', async () => {
    await setUp(alice.rpc);
    const calls: number[] = [];
    const counting: Rpc = (fn, args) => {
      if (fn === 'push_records') calls.push((args['p_records'] as unknown[]).length);
      return alice.rpc(fn, args);
    };
    const big = (n: number): EncryptedRecord => ({ ...record(n, 1_000), ct: 'A'.repeat(60_000) });
    const results = await rpcTransport(counting).push(Array.from({ length: 40 }, (_, i) => big(i + 1)));
    expect(results.every((r) => r.status === 'stored')).toBe(true);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.reduce((a, b) => a + b, 0)).toBe(40);
  });
});

describe('deleting the account', () => {
  it('removes the user and everything the server held for them, and nobody else', async () => {
    await setUp(alice.rpc);
    await setUp(bob.rpc);
    await rpcTransport(alice.rpc).push([record(1, 1_000)]);
    await rpcTransport(bob.rpc).push([record(1, 1_000)]);

    await alice.rpc('delete_my_account', {});

    const count = async (table: string, id: string) =>
      (
        await t.pg.query<{ n: number }>(
          `select count(*)::int as n from ${table} where ${table === 'auth.users' ? 'id' : 'user_id'} = $1`,
          [id],
        )
      ).rows[0]?.n;
    for (const table of ['auth.users', 'public.user_state', 'public.user_keys', 'public.records']) {
      expect(await count(table, ALICE)).toBe(0);
      expect(await count(table, BOB)).toBe(1 + (table === 'public.user_keys' ? 1 : 0));
    }
  });
});
