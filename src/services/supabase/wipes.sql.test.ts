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

describe('erase_space', () => {
  it('takes the space lock before it deletes, so an in-flight push cannot survive the erase', async () => {
    const [row] = (
      await t.pg.query<{ src: string }>(`select prosrc as src from pg_proc where proname = 'erase_space'`)
    ).rows;
    const src = row?.src ?? '';
    expect(src.indexOf('for update')).toBeGreaterThan(-1);
    expect(src.indexOf('for update')).toBeLessThan(src.indexOf('delete from public.records'));
  });
});

const CAROL = '00000000-0000-4000-8000-00000000000c';

async function linkAll(...others: [Session, string, string][]): Promise<void> {
  for (const [s, email, name] of others) {
    const { token } = (await alice.rpc('create_invite', { p_email: email, p_currency: 'ILS' })) as {
      token: string;
    };
    await s.rpc('accept_invite', { p_token: token, p_currency: 'ILS', p_display_name: name });
  }
  // The first invitation is what makes Alice's household, so she can only be named after it.
  await alice.rpc('set_my_member', { p_display_name: 'Alice', p_avatar_version: 0 });
}
type Asks = { id: string; requesterName: string; asks: { userId: string; token: string }[] };
const tokenFor = (asks: Asks, id: string) => asks.asks.find((a) => a.userId === id)!.token;

describe('erasing a household', () => {
  let carol: Session;
  beforeEach(async () => {
    carol = await account(CAROL, 'carol@example.com');
  });

  it('erases every member’s space only once every other member confirms', async () => {
    await linkAll([bob, 'bob@example.com', 'Bob'], [carol, 'carol@example.com', 'Carol']);
    await push(alice, [record()], 0);
    await push(bob, [record()], 0);
    await push(carol, [record()], 0);

    const asks = (await alice.rpc('request_wipe', {})) as Asks;
    expect(asks.asks.map((a) => a.userId).sort()).toEqual([BOB, CAROL]);
    // Members share no email: a member who asks learns no one's address.
    expect(asks.asks.some((a) => 'email' in a)).toBe(false);
    expect(asks.requesterName).toBe('Alice');
    expect(asks.asks.every((a) => /^[0-9a-f]{64}$/.test(a.token))).toBe(true);

    const status = (await bob.rpc('wipe_status', {})) as {
      status: string;
      waitingFor: string[];
      mine: boolean;
    };
    expect(status).toMatchObject({ status: 'pending', mine: false });
    expect(status.waitingFor.sort()).toEqual(['Bob', 'Carol']);
    expect(await bob.rpc('peek_wipe', { p_token: tokenFor(asks, BOB) })).toMatchObject({
      requesterName: 'Alice',
      members: 3,
    });

    expect(await bob.rpc('confirm_wipe', { p_token: tokenFor(asks, BOB) })).toBe('waiting');
    expect((await pull(alice)).records).toHaveLength(1);
    expect(await carol.rpc('confirm_wipe', { p_token: tokenFor(asks, CAROL) })).toBe('done');

    for (const s of [alice, bob, carol]) {
      expect(await pull(s)).toEqual(expect.objectContaining({ records: [], epoch: 1 }));
    }
    expect(await alice.rpc('wipe_status', {})).toMatchObject({ status: 'done', requesterName: 'Alice' });
  });

  it('works once, and only for the account the email was sent to', async () => {
    await linkAll([bob, 'bob@example.com', 'Bob'], [carol, 'carol@example.com', 'Carol']);
    const asks = (await alice.rpc('request_wipe', {})) as Asks;
    expect(await refused(carol.rpc('confirm_wipe', { p_token: tokenFor(asks, BOB) }))).toBe(
      'wipe_wrong_account',
    );
    expect(await refused(carol.rpc('peek_wipe', { p_token: tokenFor(asks, BOB) }))).toBe(
      'wipe_wrong_account',
    );
    await bob.rpc('confirm_wipe', { p_token: tokenFor(asks, BOB) });
    expect(await refused(bob.rpc('confirm_wipe', { p_token: tokenFor(asks, BOB) }))).toBe('wipe_invalid');
    expect(await refused(bob.rpc('peek_wipe', { p_token: 'nonsense' }))).toBe('wipe_invalid');
  });

  it('is called off by a decline, by the one who asked, or by seven days passing', async () => {
    await linkAll([bob, 'bob@example.com', 'Bob']);
    await push(bob, [record()], 0);

    let asks = (await alice.rpc('request_wipe', {})) as Asks;
    await bob.rpc('decline_wipe', { p_token: tokenFor(asks, BOB) });
    expect(await alice.rpc('wipe_status', {})).toBeNull();
    expect(await refused(bob.rpc('confirm_wipe', { p_token: tokenFor(asks, BOB) }))).toBe('wipe_invalid');

    await t.pg.query(`update public.wipe_requests set created_at = now() - interval '2 hours'`);
    asks = (await alice.rpc('request_wipe', {})) as Asks;
    expect(await refused(bob.rpc('cancel_wipe', {}))).toBe('wipe_invalid');
    await alice.rpc('cancel_wipe', {});
    expect(await refused(bob.rpc('confirm_wipe', { p_token: tokenFor(asks, BOB) }))).toBe('wipe_invalid');

    await t.pg.query(`update public.wipe_requests set created_at = now() - interval '2 hours'`);
    asks = (await alice.rpc('request_wipe', {})) as Asks;
    await t.pg.query(
      `update public.wipe_requests set expires_at = now() - interval '1 second' where id = $1`,
      [asks.id],
    );
    expect(await alice.rpc('wipe_status', {})).toBeNull();
    expect(await refused(bob.rpc('confirm_wipe', { p_token: tokenFor(asks, BOB) }))).toBe('wipe_invalid');
    expect((await pull(bob)).records).toHaveLength(1);
  });

  it('is called off when someone joins or leaves before it completes', async () => {
    await linkAll([bob, 'bob@example.com', 'Bob']);
    const asks = (await alice.rpc('request_wipe', {})) as Asks;
    const { token } = (await alice.rpc('create_invite', {
      p_email: 'carol@example.com',
      p_currency: 'ILS',
    })) as {
      token: string;
    };
    await carol.rpc('accept_invite', { p_token: token, p_currency: 'ILS', p_display_name: 'Carol' });
    expect(await refused(bob.rpc('confirm_wipe', { p_token: tokenFor(asks, BOB) }))).toBe('wipe_invalid');
    expect(await alice.rpc('wipe_status', {})).toBeNull();
  });

  it('is called off, and erases nothing, when a member leaves before it completes', async () => {
    await linkAll([bob, 'bob@example.com', 'Bob'], [carol, 'carol@example.com', 'Carol']);
    await push(bob, [record()], 0);
    const asks = (await alice.rpc('request_wipe', {})) as Asks;
    await carol.rpc('leave_household', {});
    expect(await refused(bob.rpc('confirm_wipe', { p_token: tokenFor(asks, BOB) }))).toBe('wipe_invalid');
    expect(await bob.rpc('wipe_status', {})).toBeNull();
    expect((await pull(bob)).records).toHaveLength(1);
    expect((await pull(bob)).epoch).toBe(0);
  });

  it('answers "cancelled", and erases nothing, if the household changed unseen by the trigger', async () => {
    await linkAll([bob, 'bob@example.com', 'Bob']);
    await push(bob, [record()], 0);
    const asks = (await alice.rpc('request_wipe', {})) as Asks;
    // A member added while the request was being made: the trigger saw no pending request then.
    await t.pg.query(`update public.wipe_requests set member_ids = array[$1::uuid]`, [ALICE]);
    expect(await bob.rpc('confirm_wipe', { p_token: tokenFor(asks, BOB) })).toBe('cancelled');
    expect(await alice.rpc('wipe_status', {})).toBeNull();
    expect((await pull(bob)).records).toHaveLength(1);
  });

  it('refuses one alone, a second while one is pending, and more than one an hour', async () => {
    expect(await refused(alice.rpc('request_wipe', {}))).toBe('not_linked');
    await linkAll([bob, 'bob@example.com', 'Bob']);
    await alice.rpc('request_wipe', {});
    expect(await refused(bob.rpc('request_wipe', {}))).toBe('wipe_pending');
    await alice.rpc('cancel_wipe', {});
    expect(await refused(bob.rpc('request_wipe', {}))).toBe('too_many_wipe_requests');
  });

  it('lets the mailer remove a request no email went out for, so trying again is not refused', async () => {
    await linkAll([bob, 'bob@example.com', 'Bob']);
    const asks = (await alice.rpc('request_wipe', {})) as Asks;
    await t.pg.transaction(async (tx) => {
      await tx.exec('set local role service_role');
      await tx.query('select public.discard_wipe($1)', [asks.id]);
    });
    const { rows } = await t.pg.query<{ n: number }>(
      `select (select count(*) from public.wipe_requests)::int
            + (select count(*) from public.wipe_confirmations)::int as n`,
    );
    expect(rows[0]?.n).toBe(0);
    expect(await refused(bob.rpc('peek_wipe', { p_token: tokenFor(asks, BOB) }))).toBe('wipe_invalid');
    // Not counted against the hour: the request can be made again at once.
    expect(await refused(alice.rpc('request_wipe', {}))).toBe('accepted');
  });

  it('keeps removing a request to the mailer: no member can call it', async () => {
    await linkAll([bob, 'bob@example.com', 'Bob']);
    const asks = (await alice.rpc('request_wipe', {})) as Asks;
    for (const s of [alice, bob, t.as(null)]) {
      expect(await refused(s.rpc('discard_wipe', { p_id: asks.id }))).toMatch(/permission denied/);
    }
    expect(await bob.rpc('wipe_status', {})).toMatchObject({ status: 'pending' });
  });

  it('lets no one read or write the request tables directly', async () => {
    for (const table of ['wipe_requests', 'wipe_confirmations']) {
      expect(await refused(alice.query(`select * from public.${table}`))).toMatch(/permission denied/);
    }
  });

  it('locks the request before recording a confirmation, so the last two confirmers take turns', async () => {
    for (const fn of ['confirm_wipe', 'decline_wipe']) {
      const { rows } = await t.pg.query<{ src: string }>(
        `select prosrc as src from pg_proc where proname = $1`,
        [fn],
      );
      const src = rows[0]?.src ?? '';
      expect(src.indexOf('for update')).toBeGreaterThan(-1);
      expect(src.indexOf('for update')).toBeLessThan(src.indexOf('update public.wipe_confirmations'));
    }
  });
});
