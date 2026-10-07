import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EncryptedRecord } from '@/db/sync/codec';
import { makeRev } from '@/lib/rev';
import { toBase64Url } from '@/services/crypto/bytes';
import { freshPg, type Session, type TestPg } from '@/test/pg-harness';

import { ServerError, setupKeys, type Rpc } from './transport';

/*
 * Linked accounts on real Postgres dressed as Supabase: an emailed invitation
 * links accounts into a household whose members read and write each other's
 * spaces - and only theirs, only while linked, and nothing of each other's
 * account beyond the key the data is sealed with.
 */

const ALICE = '00000000-0000-4000-8000-00000000000a';
const BOB = '00000000-0000-4000-8000-00000000000b';
const CAROL = '00000000-0000-4000-8000-00000000000c';

let t: TestPg;
let alice: Session;
let bob: Session;
let carol: Session;

async function account(id: string, email: string, confirmed = true): Promise<Session> {
  await t.pg.query(
    `insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)
     on conflict (id) do update set email = excluded.email, email_confirmed_at = excluded.email_confirmed_at`,
    [id, email, confirmed ? new Date().toISOString() : null],
  );
  return t.as(id);
}

beforeEach(async () => {
  t = await freshPg();
  alice = await account(ALICE, 'alice@example.com');
  bob = await account(BOB, 'Bob@Example.com');
  carol = await account(CAROL, 'carol@example.com');
});
afterEach(async () => {
  await t.close();
});

const b64 = (n: number, fill: number): string => toBase64Url(new Uint8Array(n).fill(fill));

async function setUp(rpc: Rpc, fill: number): Promise<void> {
  await setupKeys(rpc, [
    { kind: 'account', id: 'account', keyVersion: 1, salt: '', iv: '', ct: b64(32, fill) },
    { kind: 'passkey', id: b64(16, 7), keyVersion: 1, salt: b64(16, 1), iv: b64(12, 2), ct: b64(48, 3) },
  ]);
}

function record(n: number, ms: number): EncryptedRecord {
  return {
    rid: b64(32, n),
    rev: makeRev({ ms, counter: 0, deviceId: 'dev00001' }),
    keyVersion: 1,
    iv: b64(12, n),
    ct: b64(40, n),
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
      : error instanceof Error
        ? error.message
        : String(error);
  }
  throw new Error('expected a refusal, got success');
}

type Invite = { id: string; token: string };
type Household = {
  id: string;
  members: {
    userId: string;
    role: string;
    displayName: string;
    avatarVersion: number;
    pictureUrl?: string | null;
  }[];
  invites: { id: string; email: string }[];
} | null;

const invite = async (s: Session, email: string, currency = 'ILS') =>
  (await s.rpc('create_invite', { p_email: email, p_currency: currency })) as Invite;
const accept = (s: Session, token: string, currency = 'ILS', name = 'Bob') =>
  s.rpc('accept_invite', { p_token: token, p_currency: currency, p_display_name: name });
const household = async (s: Session) => (await s.rpc('household', {})) as Household;
const push = (s: Session, space: string | null, records: EncryptedRecord[]) =>
  s.rpc('push_records', { p_records: records, ...(space === null ? {} : { p_space: space }) });
const pull = async (s: Session, space: string | null) =>
  (
    (await s.rpc('pull_records', {
      p_cursor: 0,
      p_limit: 100,
      ...(space === null ? {} : { p_space: space }),
    })) as { records: EncryptedRecord[] }
  ).records.map((r) => r.rid);

async function link(): Promise<void> {
  await alice.rpc('set_my_member', { p_display_name: 'Alice', p_avatar_version: 0 });
  const { token } = await invite(alice, 'bob@example.com');
  await accept(bob, token);
}

describe('inviting by email', () => {
  it('links two accounts once the invitee accepts, and shows each the household', async () => {
    const sent = await invite(alice, ' BOB@example.com ');
    expect(sent.token).toMatch(/^[0-9a-f]{64}$/);

    // Before accepting there is a household of one, waiting on the invitation.
    const waiting = await household(alice);
    expect(waiting?.members.map((m) => m.userId)).toEqual([ALICE]);
    expect(waiting?.invites).toEqual([expect.objectContaining({ email: 'bob@example.com' })]);
    expect(await household(bob)).toBeNull();

    await alice.rpc('set_my_member', { p_display_name: 'Alice', p_avatar_version: 2 });
    expect(await bob.rpc('peek_invite', { p_token: sent.token })).toEqual({
      inviterName: 'Alice',
      members: 1,
      currency: 'ILS',
      alreadyMember: false,
      linkedElsewhere: false,
    });

    await accept(bob, sent.token);
    const linked = await household(alice);
    expect(linked?.members.map((m) => [m.userId, m.role, m.displayName])).toEqual([
      [ALICE, 'owner', 'Alice'],
      [BOB, 'member', 'Bob'],
    ]);
    expect(linked?.invites).toEqual([]);
    expect((await household(bob))?.id).toBe(linked?.id);
  });

  it('keeps only a hash of the token', async () => {
    const { token } = await invite(alice, 'bob@example.com');
    const rows = await t.pg.query<{ token_hash: string }>('select token_hash from public.household_invites');
    expect(rows.rows[0]?.token_hash).not.toContain(token);
    expect(rows.rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('works once, and only for the account whose confirmed email it was sent to', async () => {
    const { token } = await invite(alice, 'bob@example.com');
    expect(await refused(carol.rpc('peek_invite', { p_token: token }))).toBe('invite_wrong_account');
    expect(await refused(accept(carol, token))).toBe('invite_wrong_account');

    await account(BOB, 'bob@example.com', false);
    expect(await refused(accept(bob, token))).toBe('invite_wrong_account');
    await account(BOB, 'bob@example.com');

    await accept(bob, token);
    expect(await refused(accept(bob, token))).toBe('invite_invalid');
    expect(await refused(bob.rpc('peek_invite', { p_token: 'nonsense' }))).toBe('invite_invalid');
  });

  it('expires after seven days', async () => {
    const { token } = await invite(alice, 'bob@example.com');
    const [row] = (
      await t.pg.query<{ days: number }>(
        `select extract(day from expires_at - created_at)::int as days from public.household_invites`,
      )
    ).rows;
    expect(row?.days).toBe(7);
    await t.pg.query(`update public.household_invites set expires_at = now() - interval '1 second'`);
    expect(await refused(accept(bob, token))).toBe('invite_invalid');
    expect((await household(alice))?.invites).toEqual([]);
  });

  it('replaces an earlier invitation to the same address, whose link stops working', async () => {
    const first = await invite(alice, 'bob@example.com');
    const second = await invite(alice, 'bob@example.com');
    expect((await household(alice))?.invites).toHaveLength(1);
    expect(await refused(accept(bob, first.token))).toBe('invite_invalid');
    await accept(bob, second.token);
  });

  it('asks the invitee to keep their books in the household currency first', async () => {
    const { token } = await invite(alice, 'bob@example.com', 'ILS');
    expect(await refused(accept(bob, token, 'USD'))).toBe('currency_mismatch');
    expect(await household(bob)).toBeNull();
  });

  it('refuses nonsense, yourself, and someone already in the household', async () => {
    expect(await refused(invite(alice, 'not an email'))).toBe('malformed_invite');
    expect(await refused(invite(alice, 'bob@example.com', 'shekels'))).toBe('malformed_invite');
    expect(await refused(invite(alice, 'ALICE@example.com'))).toBe('invite_self');
    await link();
    expect(await refused(invite(alice, 'bob@example.com'))).toBe('already_member');
  });

  it('can be declined, or taken back by the household', async () => {
    const first = await invite(alice, 'bob@example.com');
    await bob.rpc('decline_invite', { p_token: first.token });
    expect(await refused(accept(bob, first.token))).toBe('invite_invalid');
    // Nobody left to wait for: no household of one lingers.
    expect(await household(alice)).toBeNull();

    const second = await invite(alice, 'bob@example.com');
    await carol.rpc('revoke_invite', { p_id: second.id }); // not Carol's to take back
    expect((await household(alice))?.invites).toHaveLength(1);
    await alice.rpc('revoke_invite', { p_id: second.id });
    expect(await refused(accept(bob, second.token))).toBe('invite_invalid');
    expect(await household(alice)).toBeNull();
  });

  it('refuses someone already linked with others, until they leave', async () => {
    const dave = await account('00000000-0000-4000-8000-00000000000d', 'dave@example.com');
    const { token: toDave } = await invite(carol, 'dave@example.com');
    await accept(dave, toDave);

    const { token } = await invite(alice, 'dave@example.com');
    expect(await dave.rpc('peek_invite', { p_token: token })).toMatchObject({ linkedElsewhere: true });
    expect(await refused(accept(dave, token))).toBe('already_linked');
    await dave.rpc('leave_household', {});
    await accept(dave, token);
    expect((await household(alice))?.members).toHaveLength(2);
  });

  it('lets a household of one waiting on its own invitations join another', async () => {
    await invite(bob, 'carol@example.com');
    const { token } = await invite(alice, 'bob@example.com');
    await accept(bob, token);
    expect((await household(bob))?.members.map((m) => m.userId)).toEqual([ALICE, BOB]);
  });

  it('holds at most ten members', async () => {
    const ids = Array.from(
      { length: 9 },
      (_, i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
    );
    for (const [i, id] of ids.entries()) {
      const s = await account(id, `m${String(i)}@example.com`);
      const { token } = await invite(alice, `m${String(i)}@example.com`);
      await accept(s, token);
    }
    expect((await household(alice))?.members).toHaveLength(10);
    expect(await refused(invite(alice, 'bob@example.com'))).toBe('household_full');
  });

  it('limits how many invitations an account sends in a day', async () => {
    for (let i = 0; i < 10; i += 1) await invite(alice, `p${String(i)}@example.com`);
    // Ten waiting at once is the household's limit.
    expect(await refused(invite(alice, 'more@example.com'))).toBe('too_many_invites');
  });
});

describe("reaching each other's data", () => {
  it('lets members push and pull in each other’s spaces, and nobody else', async () => {
    await setUp(alice.rpc, 9);
    await setUp(bob.rpc, 8);
    await push(alice, null, [record(1, 1000)]);

    expect(await refused(pull(bob, ALICE))).toBe('not_linked');
    expect(await refused(push(bob, ALICE, [record(2, 2000)]))).toBe('not_linked');
    expect(await refused(bob.rpc('get_key_state', { p_space: ALICE }))).toBe('not_linked');

    await link();
    await push(bob, ALICE, [record(2, 2000)]);
    expect(await pull(bob, ALICE)).toEqual([b64(32, 1), b64(32, 2)]);
    expect(await pull(alice, null)).toEqual([b64(32, 1), b64(32, 2)]);
    // Bob's own space is untouched by what he wrote in Alice's.
    expect(await pull(bob, null)).toEqual([]);

    expect(await refused(pull(carol, ALICE))).toBe('not_linked');
    expect(await refused(pull(carol, BOB))).toBe('not_linked');
  });

  it("hands a member the account's own key entry, never its other ways in", async () => {
    await setUp(alice.rpc, 9);
    await link();
    const mine = (await alice.rpc('get_key_state', {})) as { wraps: { kind: string }[] };
    expect(mine.wraps.map((w) => w.kind).sort()).toEqual(['account', 'passkey']);
    const theirs = (await bob.rpc('get_key_state', { p_space: ALICE })) as {
      keyVersion: number;
      wraps: { kind: string; ct: string }[];
    };
    expect(theirs.keyVersion).toBe(1);
    expect(theirs.wraps).toEqual([expect.objectContaining({ kind: 'account', ct: b64(32, 9) })]);
  });

  it('keeps key changes to the account itself', async () => {
    await setUp(alice.rpc, 9);
    await link();
    // setup, rotation and wraps act on the caller's own space only.
    await setUp(bob.rpc, 8);
    const bobs = (await bob.rpc('get_key_state', {})) as { wraps: { ct: string }[] };
    expect(bobs.wraps.map((w) => w.ct)).toContain(b64(32, 8));
    const alices = (await alice.rpc('get_key_state', {})) as { wraps: { ct: string }[] };
    expect(alices.wraps.map((w) => w.ct)).not.toContain(b64(32, 8));
  });

  it('serves a member with codes turned on only after the code, in any space', async () => {
    await setUp(alice.rpc, 9);
    await link();
    await t.pg.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [BOB]);
    expect(await refused(pull(bob, ALICE))).toBe('second_step_required');
    expect(await pull(t.as(BOB, { aal: 'aal2' }), ALICE)).toEqual([]);
  });
});

describe('unlinking', () => {
  it('leaves each with exactly their own, and no way into the other’s', async () => {
    await setUp(alice.rpc, 9);
    await setUp(bob.rpc, 8);
    await link();
    await push(alice, null, [record(1, 1000)]);
    await push(bob, null, [record(2, 1000)]);

    await bob.rpc('leave_household', {});
    expect(await household(alice)).toBeNull();
    expect(await household(bob)).toBeNull();
    expect(await refused(pull(bob, ALICE))).toBe('not_linked');
    expect(await refused(pull(alice, BOB))).toBe('not_linked');
    expect(await pull(alice, null)).toEqual([b64(32, 1)]);
    expect(await pull(bob, null)).toEqual([b64(32, 2)]);
  });

  it("lets only the household's owner remove someone, and passes ownership on", async () => {
    await link();
    const { token } = await invite(bob, 'carol@example.com');
    await accept(carol, token, 'ILS', 'Carol');

    expect(await refused(bob.rpc('remove_member', { p_user: CAROL }))).toBe('not_owner');
    expect(await refused(alice.rpc('remove_member', { p_user: ALICE }))).toBe('not_owner');
    await alice.rpc('remove_member', { p_user: CAROL });
    expect(await household(carol)).toBeNull();
    expect((await household(alice))?.members.map((m) => m.userId)).toEqual([ALICE, BOB]);

    // The owner leaving a household that goes on: the longest-standing member takes over.
    const again = await invite(alice, 'carol@example.com');
    await accept(carol, again.token, 'ILS', 'Carol');
    await alice.rpc('leave_household', {});
    expect((await household(bob))?.members.map((m) => [m.userId, m.role])).toEqual([
      [BOB, 'owner'],
      [CAROL, 'member'],
    ]);
  });

  it('takes a deleted account out of its household', async () => {
    await link();
    await bob.rpc('delete_my_account', {});
    expect(await household(alice)).toBeNull();
  });
});

describe('pictures', () => {
  const put = (s: Session, name: string) =>
    s.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [name]);
  const names = async (s: Session) =>
    (await s.query<{ name: string }>(`select name from storage.objects where bucket_id = 'avatars'`)).map(
      (r) => r.name,
    );

  it("shows members each other's picture, only while linked, and lets nobody change another's", async () => {
    await put(alice, `${ALICE}/avatar`);
    await put(carol, `${CAROL}/avatar`);
    expect(await names(bob)).toEqual([]);

    await link();
    expect(await names(bob)).toEqual([`${ALICE}/avatar`]);
    expect(await refused(put(bob, `${ALICE}/other`))).toMatch(/row-level security/);
    await bob.query(`delete from storage.objects where name = $1`, [`${ALICE}/avatar`]);
    expect(await names(alice)).toEqual([`${ALICE}/avatar`]);

    await bob.rpc('leave_household', {});
    expect(await names(bob)).toEqual([]);
  });

  it("shows members each other's Google picture - only an address on Google's image host", async () => {
    const google = 'https://lh3.googleusercontent.com/a/ACg8ocK_x-1=s96-c';
    await link();
    await alice.rpc('set_my_member', { p_display_name: 'Alice', p_avatar_version: 0, p_picture_url: google });
    const seen = (await household(bob))?.members.find((m) => m.userId === ALICE);
    expect(seen?.pictureUrl).toBe(google);

    // An app from before keeps calling without one: the picture is left as it was.
    await alice.rpc('set_my_member', { p_display_name: 'Alicia', p_avatar_version: 0 });
    expect((await household(bob))?.members.find((m) => m.userId === ALICE)?.pictureUrl).toBe(google);

    for (const elsewhere of [
      'https://evil.example/a.png',
      'http://lh3.googleusercontent.com/a/x',
      `${google}"`,
    ]) {
      expect(
        await refused(
          alice.rpc('set_my_member', {
            p_display_name: 'Alice',
            p_avatar_version: 0,
            p_picture_url: elsewhere,
          }),
        ),
      ).toBe('malformed_member');
    }
    await alice.rpc('set_my_member', { p_display_name: 'Alice', p_avatar_version: 0, p_picture_url: null });
    expect((await household(bob))?.members.find((m) => m.userId === ALICE)?.pictureUrl).toBeNull();
    expect(await household(carol)).toBeNull();
  });
});

describe('who can touch the household tables', () => {
  it('lets no one read or write them directly', async () => {
    await link();
    for (const table of ['households', 'household_members', 'household_invites']) {
      expect(await refused(alice.query(`select * from public.${table}`))).toMatch(/permission denied/);
    }
    expect(await refused(alice.query(`update public.household_members set role = 'owner'`))).toMatch(
      /permission denied/,
    );
    expect(await refused(t.as(null).query('select public.household()'))).toMatch(/permission denied/);
    expect(await refused(alice.query(`select private.can_reach($1, $2)`, [ALICE, BOB]))).toMatch(
      /permission denied/,
    );
  });
});
