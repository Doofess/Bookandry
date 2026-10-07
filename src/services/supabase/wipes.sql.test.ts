import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EncryptedRecord } from '@/db/sync/codec';
import { makeRev } from '@/lib/rev';
import { toBase64Url } from '@/services/crypto/bytes';
import { freshPg, type Session, type TestPg } from '@/test/pg-harness';

import { ServerError, setupKeys } from './transport';

/*
 * Erasing all data on real Postgres: a space's records go, its counter rises,
 * and a push made before the erase can no longer restore what was erased.
 */

const ALICE = '00000000-0000-4000-8000-00000000000a';
const BOB = '00000000-0000-4000-8000-00000000000b';

let t: TestPg;
let alice: Session;
let bob: Session;

async function account(id: string, email: string): Promise<Session> {
  await t.pg.query(
    `insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())
     on conflict (id) do update set email = excluded.email`,
    [id, email],
  );
  const s = t.as(id);
  await setupKeys(s.rpc, [
    {
      kind: 'account',
      id: 'account',
      keyVersion: 1,
      salt: '',
      iv: '',
      ct: toBase64Url(new Uint8Array(32).fill(id.endsWith('a') ? 1 : 2)),
    },
    {
      kind: 'passkey',
      id: toBase64Url(new Uint8Array(16).fill(7)),
      keyVersion: 1,
      salt: toBase64Url(new Uint8Array(16).fill(1)),
      iv: toBase64Url(new Uint8Array(12).fill(2)),
      ct: toBase64Url(new Uint8Array(48).fill(3)),
    },
  ]);
  return s;
}

let n = 0;
const record = (): EncryptedRecord => {
  n += 1;
  return {
    rid: toBase64Url(new Uint8Array(32).fill(n)),
    rev: makeRev({ ms: 1_790_000_000_000 + n, counter: 0, deviceId: 'dev00001' }),
    keyVersion: 1,
    iv: toBase64Url(new Uint8Array(12).fill(n)),
    ct: toBase64Url(new Uint8Array(40).fill(n)),
  };
};
const push = (s: Session, records: EncryptedRecord[], epoch?: number, space?: string) =>
  s.rpc('push_records', {
    p_records: records,
    ...(epoch === undefined ? {} : { p_epoch: epoch }),
    ...(space === undefined ? {} : { p_space: space }),
  });
const pull = (s: Session, space?: string) =>
  s.rpc('pull_records', {
    p_cursor: 0,
    p_limit: 100,
    ...(space === undefined ? {} : { p_space: space }),
  }) as Promise<{
    records: unknown[];
    epoch: number;
  }>;
const refused = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'accepted';
  } catch (error) {
    return error instanceof ServerError
      ? error.code === 'unknown'
        ? error.message
        : error.code
      : String(error);
  }
};

beforeEach(async () => {
  t = await freshPg();
  alice = await account(ALICE, 'alice@example.com');
  bob = await account(BOB, 'bob@example.com');
});
afterEach(async () => {
  await t.close();
});

describe('erasing alone', () => {
  it("empties the account's space, raises its counter, and says so on every pull", async () => {
    await push(alice, [record(), record()], 0);
    expect((await pull(alice)).records).toHaveLength(2);
    expect((await pull(alice)).epoch).toBe(0);

    expect(await alice.rpc('wipe_my_data', {})).toBe(1);
    const after = await pull(alice);
    expect(after.records).toEqual([]);
    expect(after.epoch).toBe(1);
    // Someone else's space is untouched.
    await push(bob, [record()], 0);
    expect((await pull(bob)).records).toHaveLength(1);
  });

  it('refuses a push made before the erase, or by an app that sends no counter at all', async () => {
    await push(alice, [record()], 0);
    await alice.rpc('wipe_my_data', {});
    expect(await refused(push(alice, [record()], 0))).toBe('wiped');
    expect(await refused(push(alice, [record()]))).toBe('wiped');
    expect(await refused(push(alice, [record()], 1))).toBe('accepted');
  });

  it('counts the account as empty again, so its quota is free', async () => {
    await push(alice, [record(), record(), record()], 0);
    await alice.rpc('wipe_my_data', {});
    const [state] = await t.pg
      .query<{ record_count: number; bytes_used: number }>(
        'select record_count, bytes_used from public.user_state where user_id = $1',
        [ALICE],
      )
      .then((r) => r.rows);
    expect(state).toEqual({ record_count: 0, bytes_used: 0 });
  });

  it('is refused to an account linked with others: they must agree first', async () => {
    await alice.rpc('set_my_member', { p_display_name: 'Alice', p_avatar_version: 0 });
    const { token } = (await alice.rpc('create_invite', {
      p_email: 'bob@example.com',
      p_currency: 'ILS',
    })) as {
      token: string;
    };
    // Waiting on its own invitation, still alone: allowed.
    expect(await refused(alice.rpc('wipe_my_data', {}))).toBe('accepted');
    await bob.rpc('accept_invite', { p_token: token, p_currency: 'ILS', p_display_name: 'Bob' });
    expect(await refused(alice.rpc('wipe_my_data', {}))).toBe('linked_needs_confirmation');
  });
});
