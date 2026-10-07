# Delete All Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person erase all of their budgeting data from Settings › Data & backup. When they are linked to other accounts, every other member must first confirm by email, and the erase then covers the whole household.

**Architecture:**
- **Server erase.** The server erases a space by deleting its `records` rows and raising a per-space counter, `user_state.epoch`.
- **Sync.** `pull_records` reports the epoch, and `push_records` refuses a push made under an older one. The sync engine clears local data the first time it sees a space's epoch rise.
- **Linked households.** A request is held in `wipe_requests`/`wipe_confirmations`. The edge function `send-wipe-requests` emails each other member a one-account token. `/wipe?t=…` lets them confirm or decline, and the last confirmation erases every member's space.

**Tech Stack:**
- Supabase Postgres (plpgsql, RLS), tested on PGlite (`src/test/pg-harness.ts`).
- Deno edge function with Resend.
- React 19, Dexie (`withoutTracking`), Vitest (projects `unit`/`db`/`dom`), Playwright, i18next (en/he).

**Spec:** `docs/superpowers/specs/2026-10-07-delete-all-data-design.md`

## Global Constraints

- **Toolchain:** Node and pnpm live in `%LOCALAPPDATA%\node`. In PowerShell, start with `$env:PATH = "$env:LOCALAPPDATA\node;$env:PATH"`.
- **Gate:** `pnpm verify` runs typecheck, lint, format:check, `gate:rtl`/`gate:money`, tests with coverage, and the build. It must pass at the end of every task.
- **Secrets:** never put secrets in the app, the repo or `.env.local`. `RESEND_API_KEY` lives only in Supabase Edge Function secrets.
- **Storage identifiers stay `greenback.*`** (for example `greenback.pendingWipe`).
- **RTL:** no physical-direction utilities (`ml-`, `pr-`, `left-`, `text-left`…). Use logical ones (`ms-`, `pe-`, `start-`, `text-start`).
- **Copy:** every new string goes in both `src/i18n/locales/en/*.json` and `src/i18n/locales/he/*.json`. Sentence case, plain verbs; errors say what happened and what to do.
- **Server errors** are raised by message, which is the code, and must be added to `ServerErrorCode`/`KNOWN` in `src/services/supabase/transport.ts`.
- **Typed confirmation word:** `DELETE` (en) / `מחיקה` (he). Matching trims, ignores case, and accepts either word in either language.
- **Timing:** a request expires 7 days after it is made, and a household can make at most one request per hour.
- **What is erased:** transactions, overrides, payment methods (cards and bank accounts), categories, redirects and import drafts.
- **What is kept:** settings, people (`profiles`), logins, pictures, the link, and device-local meta.
- **Commit messages** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **An old phone that was offline during the erase comes online.** It must not re-upload erased rows: its pushes are refused (`wiped`), it clears itself, and it keeps only settings and people. This is pinned in Task 4.
- **The same device sees two spaces' epochs rise in one sync** (a household erase). It must clear once, then keep the rows it pulls from the next space, not clear them again. Pinned in Task 4.
- **A member joins or leaves while a request is pending.** The request is cancelled; a confirmation already given must not erase a household that changed. Pinned in Task 2.
- **The link is opened while signed in as the wrong account, or opened twice.** Neither may confirm; each shows a clear message. Pinned in Tasks 2 and 8.
- **A person signed out of a local-only install deletes.** Only the device is cleared, built-ins are re-seeded, and the app stays usable with its people intact. Pinned in Task 5.

---

### Task 1: Server — erase counter, erasing alone, and the sync guard

**Files:**
- Create: `supabase/migrations/20261008000000_wipes.sql`
- Test: `src/services/supabase/wipes.sql.test.ts`

**Interfaces:**
- Produces, for SQL callers:
  - `public.wipe_my_data() returns integer`: the new epoch.
  - `public.push_records(p_records jsonb, p_space uuid default null, p_epoch integer default null) returns jsonb`.
  - `public.pull_records(...)`: its pages now carry `'epoch'`.
  - `private.erase_space(target uuid) returns integer`.
  - `private.household_size(uid uuid) returns integer`.
- New error codes: `wiped`, `linked_needs_confirmation`.

- [ ] **Step 1: Write the failing test** (`src/services/supabase/wipes.sql.test.ts`)

```ts
import { beforeEach, describe, expect, it } from 'vitest';

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
    { kind: 'account', id: 'a', keyVersion: 1, salt: toBase64Url(new Uint8Array(16)), iv: toBase64Url(new Uint8Array(12)), ct: toBase64Url(new Uint8Array(48)), kdf: 'none' },
  ]);
  return s;
}

let n = 0;
const record = (): EncryptedRecord => {
  n += 1;
  return {
    rid: toBase64Url(new Uint8Array(32).fill(n)).slice(0, 43),
    rev: makeRev(1_790_000_000_000 + n, 'abcd', n),
    keyVersion: 1,
    iv: toBase64Url(new Uint8Array(12)),
    ct: toBase64Url(new Uint8Array(32)),
  };
};
const push = (s: Session, records: EncryptedRecord[], epoch?: number, space?: string) =>
  s.rpc('push_records', {
    p_records: records,
    ...(epoch === undefined ? {} : { p_epoch: epoch }),
    ...(space === undefined ? {} : { p_space: space }),
  });
const pull = (s: Session, space?: string) =>
  s.rpc('pull_records', { p_cursor: 0, p_limit: 100, ...(space === undefined ? {} : { p_space: space }) }) as Promise<{
    records: unknown[];
    epoch: number;
  }>;
const refused = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'accepted';
  } catch (error) {
    return error instanceof ServerError ? error.code : String(error);
  }
};

beforeEach(async () => {
  t = await freshPg();
  alice = await account(ALICE, 'alice@example.com');
  bob = await account(BOB, 'bob@example.com');
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
    const [state] = await t.pg.query<{ record_count: number; bytes_used: number }>(
      'select record_count, bytes_used from public.user_state where user_id = $1',
      [ALICE],
    ).then((r) => r.rows);
    expect(state).toEqual({ record_count: 0, bytes_used: 0 });
  });

  it('is refused to an account linked with others: they must agree first', async () => {
    await alice.rpc('set_my_member', { p_display_name: 'Alice', p_avatar_version: 0 });
    const { token } = (await alice.rpc('create_invite', { p_email: 'bob@example.com', p_currency: 'ILS' })) as {
      token: string;
    };
    // Waiting on its own invitation, still alone: allowed.
    expect(await refused(alice.rpc('wipe_my_data', {}))).toBe('accepted');
    await bob.rpc('accept_invite', { p_token: token, p_currency: 'ILS', p_display_name: 'Bob' });
    expect(await refused(alice.rpc('wipe_my_data', {}))).toBe('linked_needs_confirmation');
  });
});
```

> If `setupKeys`' wrap shape differs, copy the `account()` helper's key setup from `src/services/supabase/households.sql.test.ts` exactly rather than this sketch. Do the same for `record()`: copy it if that file already has one.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/services/supabase/wipes.sql.test.ts`
Expected: FAIL. The function `public.wipe_my_data()` does not exist.

- [ ] **Step 3: Write the migration** (`supabase/migrations/20261008000000_wipes.sql`)

Copy `push_records` from `supabase/migrations/20261007000000_households.sql` (the `create function public.push_records(p_records jsonb, p_space uuid default null)` body) verbatim. Make exactly the two marked changes.

```sql
-- Deleting all data: alone at once; linked, once every other member confirms
-- by email (see the second half). A space is erased by deleting its records
-- and raising its counter - its epoch - which every pull reports and every
-- push must match, so no device can restore what was erased.

alter table public.user_state add column epoch integer not null default 0;

-- How many accounts share the caller's household; 1 when there is none.
create function private.household_size(uid uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select count(*)::integer from public.household_members m
                    where m.household_id = (select h.household_id from public.household_members h
                                             where h.user_id = uid)), 1)
$$;

create function private.erase_space(target uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare next_epoch integer;
begin
  delete from public.records where user_id = target;
  update public.user_state
     set epoch = epoch + 1, record_count = 0, bytes_used = 0
   where user_id = target
  returning epoch into next_epoch;
  return coalesce(next_epoch, 0);
end
$$;
revoke all on function private.erase_space(uuid), private.household_size(uuid) from public, anon, authenticated;

create function public.wipe_my_data() returns integer
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user();
begin
  if private.household_size(uid) > 1 then
    raise exception 'linked_needs_confirmation' using errcode = '42501';
  end if;
  return private.erase_space(uid);
end
$$;

drop function public.push_records(jsonb, uuid);

-- As before (20261007000000_households.sql), and only under the space's current epoch.
create function public.push_records(p_records jsonb, p_space uuid default null, p_epoch integer default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
-- ... the copied body, with:
-- CHANGE 1 - right after:
--   select * into st from public.user_state where user_id = target for update;
--   if not found or st.key_version = 0 then ... end if;
-- add:
--   if coalesce(p_epoch, 0) < st.epoch then
--     raise exception 'wiped' using errcode = '55000';
--   end if;
$$;
```

CHANGE 2: in `pull_records`, `create or replace` the function with its body from `20261007000000_households.sql`. Make these edits:
- At the top of `begin`, add `declare epoch_now integer;` to the declare block, then `select coalesce((select s.epoch from public.user_state s where s.user_id = target), 0) into epoch_now;`.
- Add `'epoch', epoch_now` to both `jsonb_build_object(...)` returns: the empty page and the full page.

Grants, at the end of the file:

```sql
revoke all on function public.wipe_my_data(), public.push_records(jsonb, uuid, integer) from public, anon;
grant execute on function public.wipe_my_data(), public.push_records(jsonb, uuid, integer) to authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/services/supabase/wipes.sql.test.ts src/services/supabase/households.sql.test.ts src/services/supabase/sync.sql.test.ts`
Expected: PASS. Use whichever sync SQL test file exists; `ls src/services/supabase/*.sql.test.ts` lists them. The existing push/pull tests must still pass, because an omitted `p_epoch` is 0, which equals a fresh space's epoch.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261008000000_wipes.sql src/services/supabase/wipes.sql.test.ts
git commit -m "Delete all data, server: erase a space alone, and refuse pushes from before the erase"
```

---

### Task 2: Server — a household's request, everyone's confirmation

**Files:**
- Modify: `supabase/migrations/20261008000000_wipes.sql` (append)
- Test: `src/services/supabase/wipes.sql.test.ts` (append)

**Interfaces:**
- Consumes: `private.erase_space`, `private.household_size` (Task 1).
- Produces (RPCs):
  - `request_wipe() returns jsonb`: `{ id: uuid, asks: [{ userId, email, token }] }`.
  - `wipe_status() returns jsonb | null`: `{ id, status: 'pending'|'done', mine: boolean, requesterName, createdAt, expiresAt, waitingFor: string[] }`.
  - `peek_wipe(p_token text) returns jsonb`: `{ requesterName, createdAt, expiresAt, members: integer }`.
  - `confirm_wipe(p_token text) returns text`: `'waiting'` or `'done'`.
  - `decline_wipe(p_token text) returns void`.
  - `cancel_wipe() returns void`.
- New error codes: `not_linked` (exists), `wipe_pending`, `too_many_wipe_requests`, `wipe_invalid`, `wipe_wrong_account`.

- [ ] **Step 1: Write the failing tests** (append to `wipes.sql.test.ts`)

```ts
const CAROL = '00000000-0000-4000-8000-00000000000c';

async function linkAll(...others: [Session, string, string][]): Promise<void> {
  await alice.rpc('set_my_member', { p_display_name: 'Alice', p_avatar_version: 0 });
  for (const [s, email, name] of others) {
    const { token } = (await alice.rpc('create_invite', { p_email: email, p_currency: 'ILS' })) as { token: string };
    await s.rpc('accept_invite', { p_token: token, p_currency: 'ILS', p_display_name: name });
  }
}
type Asks = { id: string; asks: { userId: string; email: string; token: string }[] };
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
    expect(asks.asks.map((a) => a.email).sort()).toEqual(['bob@example.com', 'carol@example.com']);
    expect(asks.asks.every((a) => /^[0-9a-f]{64}$/.test(a.token))).toBe(true);

    const status = (await bob.rpc('wipe_status', {})) as { status: string; waitingFor: string[]; mine: boolean };
    expect(status).toMatchObject({ status: 'pending', mine: false });
    expect(status.waitingFor.sort()).toEqual(['Bob', 'Carol']);
    expect(await bob.rpc('peek_wipe', { p_token: tokenFor(asks, BOB) })).toMatchObject({
      requesterName: 'Alice',
      members: 3,
    });

    expect(await bob.rpc('confirm_wipe', { p_token: tokenFor(asks, BOB) })).toBe('waiting');
    expect((await pull(alice)).records).toHaveLength(1);
    expect(await carol.rpc('confirm_wipe', { p_token: tokenFor(asks, CAROL) })).toBe('done');

    for (const s of [alice, bob, carol]) expect(await pull(s)).toEqual(expect.objectContaining({ records: [], epoch: 1 }));
    expect(await alice.rpc('wipe_status', {})).toMatchObject({ status: 'done', requesterName: 'Alice' });
  });

  it('works once, and only for the account the email was sent to', async () => {
    await linkAll([bob, 'bob@example.com', 'Bob'], [carol, 'carol@example.com', 'Carol']);
    const asks = (await alice.rpc('request_wipe', {})) as Asks;
    expect(await refused(carol.rpc('confirm_wipe', { p_token: tokenFor(asks, BOB) }))).toBe('wipe_wrong_account');
    expect(await refused(carol.rpc('peek_wipe', { p_token: tokenFor(asks, BOB) }))).toBe('wipe_wrong_account');
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
    await t.pg.query(`update public.wipe_requests set expires_at = now() - interval '1 second' where id = $1`, [asks.id]);
    expect(await alice.rpc('wipe_status', {})).toBeNull();
    expect(await refused(bob.rpc('confirm_wipe', { p_token: tokenFor(asks, BOB) }))).toBe('wipe_invalid');
    expect((await pull(bob)).records).toHaveLength(1);
  });

  it('is called off when someone joins or leaves before it completes', async () => {
    await linkAll([bob, 'bob@example.com', 'Bob']);
    const asks = (await alice.rpc('request_wipe', {})) as Asks;
    const { token } = (await alice.rpc('create_invite', { p_email: 'carol@example.com', p_currency: 'ILS' })) as {
      token: string;
    };
    await carol.rpc('accept_invite', { p_token: token, p_currency: 'ILS', p_display_name: 'Carol' });
    expect(await refused(bob.rpc('confirm_wipe', { p_token: tokenFor(asks, BOB) }))).toBe('wipe_invalid');
    expect(await alice.rpc('wipe_status', {})).toBeNull();
  });

  it('refuses one alone, a second while one is pending, and more than one an hour', async () => {
    expect(await refused(alice.rpc('request_wipe', {}))).toBe('not_linked');
    await linkAll([bob, 'bob@example.com', 'Bob']);
    await alice.rpc('request_wipe', {});
    expect(await refused(bob.rpc('request_wipe', {}))).toBe('wipe_pending');
    await alice.rpc('cancel_wipe', {});
    expect(await refused(bob.rpc('request_wipe', {}))).toBe('too_many_wipe_requests');
  });

  it('lets no one read or write the request tables directly', async () => {
    for (const table of ['wipe_requests', 'wipe_confirmations']) {
      expect(await refused(alice.query(`select * from public.${table}`))).toMatch(/permission denied/);
    }
  });
});
```

> `Session.query` and the permission-error text: mirror the existing "who can touch the household tables" test in `households.sql.test.ts`. If `refused` returns the raw message there, match `/permission denied/` the same way.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/services/supabase/wipes.sql.test.ts`
Expected: FAIL. The function `public.request_wipe()` does not exist.

- [ ] **Step 3: Append to the migration**

```sql
-- ---------------------------------------------------------------------------
-- A household's request: everyone else confirms by an emailed link
-- ---------------------------------------------------------------------------

create table public.wipe_requests (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  member_ids   uuid[] not null,
  status       text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  done_at      timestamptz
);
create unique index wipe_requests_one_pending on public.wipe_requests (household_id) where status = 'pending';

create table public.wipe_confirmations (
  request_id   uuid not null references public.wipe_requests (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  token_hash   text not null unique,
  confirmed_at timestamptz,
  declined_at  timestamptz,
  primary key (request_id, user_id)
);

alter table public.wipe_requests      enable row level security;
alter table public.wipe_confirmations enable row level security;
revoke all on table public.wipe_requests, public.wipe_confirmations from public, anon, authenticated;

-- Past its time, a pending request is a cancelled one.
create function private.expire_wipes(hid uuid) returns void
language sql security definer set search_path = '' as $$
  update public.wipe_requests set status = 'cancelled'
   where household_id = hid and status = 'pending' and expires_at <= now()
$$;

-- Someone joined or left: what was agreed was for a different household.
create function private.cancel_wipes_on_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.wipe_requests set status = 'cancelled'
   where household_id = coalesce(new.household_id, old.household_id) and status = 'pending';
  return null;
end
$$;
create trigger household_members_cancel_wipes
  after insert or delete on public.household_members
  for each row execute function private.cancel_wipes_on_change();

create function public.request_wipe() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  hid uuid;
  members uuid[];
  rid uuid;
  asks jsonb := '[]'::jsonb;
  m record;
  token text;
begin
  select household_id into hid from public.household_members where user_id = uid;
  if hid is null or private.household_size(uid) < 2 then
    raise exception 'not_linked' using errcode = '42501';
  end if;
  perform private.expire_wipes(hid);
  if exists (select 1 from public.wipe_requests where household_id = hid and status = 'pending') then
    raise exception 'wipe_pending' using errcode = '55000';
  end if;
  if exists (select 1 from public.wipe_requests
              where household_id = hid and created_at > now() - interval '1 hour') then
    raise exception 'too_many_wipe_requests' using errcode = '54000';
  end if;

  select array_agg(user_id order by user_id) into members from public.household_members where household_id = hid;
  insert into public.wipe_requests (household_id, requested_by, member_ids) values (hid, uid, members)
  returning id into rid;

  for m in
    select hm.user_id, u.email from public.household_members hm join auth.users u on u.id = hm.user_id
     where hm.household_id = hid and hm.user_id <> uid
  loop
    token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.wipe_confirmations (request_id, user_id, token_hash)
    values (rid, m.user_id, private.token_hash(token));
    asks := asks || jsonb_build_object('userId', m.user_id, 'email', m.email, 'token', token);
  end loop;
  return jsonb_build_object('id', rid, 'asks', asks);
end
$$;

-- The caller's confirmation and its request, checked: theirs, open, unanswered.
create function private.open_confirmation(p_token text, uid uuid)
returns public.wipe_confirmations
language plpgsql security definer set search_path = '' as $$
declare
  c public.wipe_confirmations;
  r public.wipe_requests;
begin
  select * into c from public.wipe_confirmations where token_hash = private.token_hash(p_token);
  if not found then
    raise exception 'wipe_invalid' using errcode = '22023';
  end if;
  if c.user_id <> uid then
    raise exception 'wipe_wrong_account' using errcode = '42501';
  end if;
  select * into r from public.wipe_requests where id = c.request_id;
  perform private.expire_wipes(r.household_id);
  select * into r from public.wipe_requests where id = c.request_id;
  if r.status <> 'pending' or c.confirmed_at is not null or c.declined_at is not null then
    raise exception 'wipe_invalid' using errcode = '22023';
  end if;
  return c;
end
$$;

create function public.peek_wipe(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.wipe_confirmations := private.open_confirmation(p_token, private.require_user());
  r public.wipe_requests;
begin
  select * into r from public.wipe_requests where id = c.request_id;
  return jsonb_build_object(
    'requesterName', coalesce((select display_name from public.household_members where user_id = r.requested_by), ''),
    'createdAt', r.created_at,
    'expiresAt', r.expires_at,
    'members', cardinality(r.member_ids));
end
$$;

create function public.confirm_wipe(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  c public.wipe_confirmations := private.open_confirmation(p_token, private.require_user());
  r public.wipe_requests;
  now_members uuid[];
  member uuid;
begin
  update public.wipe_confirmations set confirmed_at = now()
   where request_id = c.request_id and user_id = c.user_id;
  if exists (select 1 from public.wipe_confirmations
              where request_id = c.request_id and confirmed_at is null) then
    return 'waiting';
  end if;

  select * into r from public.wipe_requests where id = c.request_id for update;
  select array_agg(user_id order by user_id) into now_members
    from public.household_members where household_id = r.household_id;
  if now_members is distinct from r.member_ids then
    update public.wipe_requests set status = 'cancelled' where id = r.id;
    raise exception 'wipe_invalid' using errcode = '22023';
  end if;
  foreach member in array r.member_ids loop
    perform private.erase_space(member);
  end loop;
  update public.wipe_requests set status = 'done', done_at = now() where id = r.id;
  return 'done';
end
$$;

create function public.decline_wipe(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.wipe_confirmations := private.open_confirmation(p_token, private.require_user());
begin
  update public.wipe_confirmations set declined_at = now()
   where request_id = c.request_id and user_id = c.user_id;
  update public.wipe_requests set status = 'cancelled' where id = c.request_id;
end
$$;

create function public.cancel_wipe() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user();
begin
  update public.wipe_requests set status = 'cancelled'
   where requested_by = uid and status = 'pending' and expires_at > now();
  if not found then
    raise exception 'wipe_invalid' using errcode = '22023';
  end if;
end
$$;

-- The household's open request, or its last erase in the past 30 days (for the
-- "deleted at Dana's request" notice), or null.
create function public.wipe_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  hid uuid;
  r public.wipe_requests;
begin
  select household_id into hid from public.household_members where user_id = uid;
  if hid is null then
    return null;
  end if;
  perform private.expire_wipes(hid);
  select * into r from public.wipe_requests
   where household_id = hid and (status = 'pending' or (status = 'done' and done_at > now() - interval '30 days'))
   order by (status = 'pending') desc, created_at desc limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', r.id,
    'status', r.status,
    'mine', r.requested_by = uid,
    'requesterName', coalesce((select display_name from public.household_members where user_id = r.requested_by), ''),
    'createdAt', r.created_at,
    'expiresAt', r.expires_at,
    'waitingFor', coalesce((
      select jsonb_agg(hm.display_name order by hm.display_name)
        from public.wipe_confirmations c join public.household_members hm on hm.user_id = c.user_id
       where c.request_id = r.id and c.confirmed_at is null), '[]'::jsonb));
end
$$;

revoke all on function private.expire_wipes(uuid), private.open_confirmation(text, uuid),
  private.cancel_wipes_on_change() from public, anon, authenticated;
revoke all on function public.request_wipe(), public.peek_wipe(text), public.confirm_wipe(text),
  public.decline_wipe(text), public.cancel_wipe(), public.wipe_status() from public, anon;
grant execute on function public.request_wipe(), public.peek_wipe(text), public.confirm_wipe(text),
  public.decline_wipe(text), public.cancel_wipe(), public.wipe_status() to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/services/supabase/wipes.sql.test.ts src/services/supabase/households.sql.test.ts`
Expected: PASS.

> If a `raise` inside `confirm_wipe` after the `update … cancelled` rolls that update back, the test "called off when someone joins" still passes: the trigger already cancelled the request on `accept_invite`. Keep both.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261008000000_wipes.sql src/services/supabase/wipes.sql.test.ts
git commit -m "Delete all data, server: a household's request, confirmed by every other member"
```

---

### Task 3: Transport — epochs on the wire, and the client's calls

**Files:**
- Modify: `src/db/sync/protocol.ts` (`PullPage.epoch`, `push(records, epoch?)`, `SpaceWipedError`)
- Modify: `src/db/sync/codec.ts` (`EncryptedTransport` and `encryptingTransport` pass the epoch through)
- Modify: `src/services/supabase/transport.ts` (send `p_epoch`, read `epoch`, map `wiped`, new codes)
- Modify: `src/test/memory-sync-server.ts` (an epoch and `erase()`)
- Create: `src/services/supabase/wipe.ts`
- Test: `src/services/supabase/transport.test.ts` (or the existing transport test file), `src/services/supabase/wipe.test.ts`

**Interfaces:**
- Produces:
  - `class SpaceWipedError extends Error`.
  - `PullPage = { records; cursor; hasMore; epoch?: number }`.
  - `SyncTransport.push(records, epoch?: number)`.
  - `MemorySyncServer.erase(): void` and `MemorySyncServer.epoch: number`.
  - In `wipe.ts`:
    - `type WipeStatus = { id: string; status: 'pending' | 'done'; mine: boolean; requesterName: string; createdAt: string; expiresAt: string; waitingFor: readonly string[] }`
    - `type WipePreview = { requesterName: string; createdAt: string; expiresAt: string; members: number }`
    - `wipeMyData(rpc): Promise<number>`
    - `wipeStatus(rpc): Promise<WipeStatus | null>`
    - `peekWipe(rpc, token): Promise<WipePreview>`
    - `confirmWipe(rpc, token): Promise<'waiting' | 'done'>`
    - `declineWipe(rpc, token): Promise<void>`
    - `cancelWipe(rpc): Promise<void>`
    - `type SendWipeOutcome = { ok: true; asked: number } | { ok: false; error: 'not_linked' | 'wipe_pending' | 'too_many_wipe_requests' | 'email_failed' | 'offline' }` (type only; Task 6 sends it)
  - In `transport.ts`: the `ServerErrorCode`s `wiped`, `linked_needs_confirmation`, `wipe_pending`, `too_many_wipe_requests`, `wipe_invalid`, `wipe_wrong_account`.

- [ ] **Step 1: Write the failing tests**

`src/services/supabase/wipe.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { cancelWipe, confirmWipe, peekWipe, wipeMyData, wipeStatus } from './wipe';
import { MalformedResponseError, rpcTransport } from './transport';
import { SpaceWipedError } from '@/db/sync/protocol';
import { ServerError } from './transport';

describe('the wipe calls', () => {
  it('reads what the server answers, and refuses an answer of the wrong shape', async () => {
    const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<unknown>>();
    rpc.mockResolvedValueOnce(2);
    expect(await wipeMyData(rpc)).toBe(2);
    rpc.mockResolvedValueOnce(null);
    expect(await wipeStatus(rpc)).toBeNull();
    rpc.mockResolvedValueOnce({
      id: 'r', status: 'pending', mine: true, requesterName: 'Dana',
      createdAt: '2026-10-07T10:00:00Z', expiresAt: '2026-10-14T10:00:00Z', waitingFor: ['Noa'],
    });
    expect(await wipeStatus(rpc)).toMatchObject({ status: 'pending', waitingFor: ['Noa'] });
    rpc.mockResolvedValueOnce({ status: 'odd' });
    await expect(wipeStatus(rpc)).rejects.toBeInstanceOf(MalformedResponseError);
    rpc.mockResolvedValueOnce({ requesterName: 'Dana', createdAt: 'a', expiresAt: 'b', members: 2 });
    expect(await peekWipe(rpc, 'f'.repeat(64))).toMatchObject({ members: 2 });
    rpc.mockResolvedValueOnce('done');
    expect(await confirmWipe(rpc, 'f'.repeat(64))).toBe('done');
    rpc.mockResolvedValueOnce(null);
    await cancelWipe(rpc);
    expect(rpc).toHaveBeenLastCalledWith('cancel_wipe', {});
  });
});

describe('epochs on the wire', () => {
  it('sends the epoch with a push, reads it from a pull, and names a refused push', async () => {
    const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<unknown>>();
    rpc.mockResolvedValueOnce({ records: [], cursor: 0, hasMore: false, epoch: 3 });
    expect((await rpcTransport(rpc).pull(0, 10)).epoch).toBe(3);
    rpc.mockResolvedValueOnce([]);
    await rpcTransport(rpc, 'space').push([{ rid: 'r'.repeat(43), rev: '0000000000000001.abcd.00000001' as never, keyVersion: 1, iv: 'i'.repeat(16), ct: 'c'.repeat(22) }], 3);
    expect(rpc).toHaveBeenLastCalledWith('push_records', expect.objectContaining({ p_epoch: 3, p_space: 'space' }));
    rpc.mockRejectedValueOnce(new ServerError('wiped'));
    await expect(rpcTransport(rpc).push([{ rid: 'r'.repeat(43), rev: '0000000000000001.abcd.00000001' as never, keyVersion: 1, iv: 'i'.repeat(16), ct: 'c'.repeat(22) }], 0)).rejects.toBeInstanceOf(SpaceWipedError);
  });
});
```

> Check how `ServerError` is constructed (`src/services/supabase/transport.ts:73`) and adapt `new ServerError('wiped')` to its real constructor.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/services/supabase/wipe.test.ts`
Expected: FAIL. The module `./wipe` is not found.

- [ ] **Step 3: Implement**

In `protocol.ts`:

```ts
export type PullPage = {
  readonly records: readonly SyncRecord[];
  readonly cursor: number;
  readonly hasMore: boolean;
  /** The space's erase counter; absent from a server that keeps none. */
  readonly epoch?: number;
};

export type SyncTransport = {
  /** `epoch`: the space's erase counter as this device last saw it. A newer one refuses the push. */
  push(records: readonly SyncRecord[], epoch?: number): Promise<readonly PushResult[]>;
  pull(cursor: number, limit: number): Promise<PullPage>;
};

/** The space was erased since this device last pulled: pull, and clear, before pushing again. */
export class SpaceWipedError extends Error {
  constructor() {
    super('space wiped');
    this.name = 'SpaceWipedError';
  }
}
```

In `codec.ts`:
- Add `epoch?: number` to `EncryptedTransport.pull`'s return type, and `push(records, epoch?: number)`.
- In `encryptingTransport`, make `push(records, epoch)` call `inner.push(sealed, epoch)`.
- Make `pull` return `{ records, cursor: page.cursor, hasMore: page.hasMore, ...(page.epoch === undefined ? {} : { epoch: page.epoch }) }`.

In `transport.ts` `rpcTransport`:
- Push: add `...(epoch === undefined ? {} : { p_epoch: epoch })` to the args. Wrap the `await rpc('push_records', …)` in `try { … } catch (error) { if (error instanceof ServerError && error.code === 'wiped') throw new SpaceWipedError(); throw error; }`.
- Pull: read `epoch` from the answer. If present, it must be a non-negative safe integer, or the call throws `MalformedResponseError('pull page')`. Return it.
- Add the six codes to `ServerErrorCode` and `KNOWN`.

`wipe.ts`:

```ts
import { MalformedResponseError, type Rpc } from './transport';

/**
 * Deleting all data, over the database's functions (20261008000000_wipes.sql).
 * Like household.ts: written against a bare `rpc`, every answer checked.
 */

export type WipeStatus = {
  readonly id: string;
  readonly status: 'pending' | 'done';
  /** This account asked. */
  readonly mine: boolean;
  readonly requesterName: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  /** The members still to confirm, by name. */
  readonly waitingFor: readonly string[];
};

export type WipePreview = {
  readonly requesterName: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly members: number;
};

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
const isText = (v: unknown): v is string => typeof v === 'string';

export async function wipeMyData(rpc: Rpc): Promise<number> {
  const epoch = await rpc('wipe_my_data', {});
  if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch)) throw new MalformedResponseError('wipe');
  return epoch;
}

export async function wipeStatus(rpc: Rpc): Promise<WipeStatus | null> {
  const v = await rpc('wipe_status', {});
  if (v === null) return null;
  if (
    !isObject(v) || !isText(v['id']) || (v['status'] !== 'pending' && v['status'] !== 'done') ||
    typeof v['mine'] !== 'boolean' || !isText(v['requesterName']) || !isText(v['createdAt']) ||
    !isText(v['expiresAt']) || !Array.isArray(v['waitingFor']) || !v['waitingFor'].every(isText)
  ) {
    throw new MalformedResponseError('wipe status');
  }
  return {
    id: v['id'], status: v['status'], mine: v['mine'], requesterName: v['requesterName'],
    createdAt: v['createdAt'], expiresAt: v['expiresAt'], waitingFor: v['waitingFor'],
  };
}

export async function peekWipe(rpc: Rpc, token: string): Promise<WipePreview> {
  const v = await rpc('peek_wipe', { p_token: token });
  if (
    !isObject(v) || !isText(v['requesterName']) || !isText(v['createdAt']) || !isText(v['expiresAt']) ||
    typeof v['members'] !== 'number'
  ) {
    throw new MalformedResponseError('wipe preview');
  }
  return { requesterName: v['requesterName'], createdAt: v['createdAt'], expiresAt: v['expiresAt'], members: v['members'] };
}

export async function confirmWipe(rpc: Rpc, token: string): Promise<'waiting' | 'done'> {
  const v = await rpc('confirm_wipe', { p_token: token });
  if (v !== 'waiting' && v !== 'done') throw new MalformedResponseError('wipe confirm');
  return v;
}

export async function declineWipe(rpc: Rpc, token: string): Promise<void> {
  await rpc('decline_wipe', { p_token: token });
}

export async function cancelWipe(rpc: Rpc): Promise<void> {
  await rpc('cancel_wipe', {});
}

/** What sending the confirmation emails came to (send-wipe.ts, the send-wipe-requests function). */
export type SendWipeOutcome =
  | { readonly ok: true; readonly asked: number }
  | {
      readonly ok: false;
      readonly error: 'not_linked' | 'wipe_pending' | 'too_many_wipe_requests' | 'email_failed' | 'offline';
    };
```

In `memory-sync-server.ts` (`MemorySyncServer`):
- Add `epoch = 0;`.
- Add `erase(): void { this.reset(); this.epoch += 1; }`.
- `transport().push = (records, epoch) => (epoch ?? 0) < this.epoch ? Promise.reject(new SpaceWipedError()) : Promise.resolve(…as before)`.
- `pull` returns `{ ...this.pullRecords(cursor, limit), epoch: this.epoch }`.

- [ ] **Step 4: Run the tests and the existing sync suites**

Run: `pnpm exec vitest run src/services/supabase src/db/sync`
Expected: PASS. Existing suites still pass because `epoch` is optional everywhere.

- [ ] **Step 5: Commit**

```bash
git add src/db/sync/protocol.ts src/db/sync/codec.ts src/services/supabase/transport.ts src/services/supabase/wipe.ts src/services/supabase/wipe.test.ts src/test/memory-sync-server.ts
git commit -m "Delete all data: epochs on the wire, and the client's calls"
```

---

### Task 4: Sync engine — clear once when a space's epoch rises

**Files:**
- Modify: `src/db/sync/tables.ts` (`SYNC_EPOCH_KEY`, `epochKeyOf`)
- Create: `src/db/sync/erase.ts` (`eraseLocalData`)
- Modify: `src/db/sync/engine.ts` (pass epochs on push, watch them on pull, `SyncReport.wiped`)
- Test: `src/db/sync/erase.test.ts`

**Interfaces:**
- Consumes: `SpaceWipedError`, `PullPage.epoch`, `push(records, epoch)`, `MemorySyncServer.erase()` (Task 3).
- Produces:
  - `epochKeyOf(space: string | undefined): string`.
  - `eraseLocalData(db: BookandryDB): Promise<void>`.
  - `SyncReport.wiped: boolean`.

- [ ] **Step 1: Write the failing tests** (`src/db/sync/erase.test.ts`)

Copy the clock, `SEED_TIME`, `device()`, `tx()` and `addProfile()` helpers from the top of `src/db/sync/engine.test.ts` (lines 1-110) verbatim, then:

```ts
import { createCategory } from '@/db/repos/categories';
import { MemorySyncServer } from '@/test/memory-sync-server';

import { syncOnce, type SyncSpaces } from './engine';
import { eraseLocalData } from './erase';
import { cursorKeyOf, epochKeyOf } from './tables';

const customCategories = (db: BookandryDB) => db.categories.filter((c) => c.source !== 'builtin').count();

describe('an erase reaching a device', () => {
  it('clears everything but settings and people, once, and gives the server none of it back', async () => {
    await addProfile(a.db, 'p1');
    await createCategory(a.db, 'cat.custom', { name: 'Gym', kind: 'expense', icon: 'Circle' }, now());
    await a.db.transactions.put(tx('t1'));
    await a.sync();
    await b.sync();
    expect(await b.db.transactions.count()).toBe(1);

    server.erase();
    tick();
    // B, offline through the erase, made one more.
    await b.db.transactions.put(tx('t2'));

    const report = await b.sync();
    expect(report.wiped).toBe(true);
    expect(await b.db.transactions.count()).toBe(0);
    expect(await customCategories(b.db)).toBe(0);
    expect(await b.db.profiles.get('p1')).toBeDefined();
    expect(await b.db.settings.get('singleton')).toBeDefined();
    expect((await b.db.meta.get(epochKeyOf(undefined)))?.value).toBe(1);
    // The server got settings and people back - never t2, nor anything erased.
    expect(server.snapshot().map((r) => r.tbl).sort()).toEqual(['profiles', 'settings']);

    // A, syncing later, clears too and converges on the same.
    expect((await a.sync()).wiped).toBe(true);
    expect(await a.db.transactions.count()).toBe(0);
    expect(await b.sync()).toMatchObject({ wiped: false });
  });

  it('clears only once in a sync that sees two spaces erased, keeping what the second brings', async () => {
    const theirs = new MemorySyncServer();
    const spaces = (): SyncSpaces => ({
      own: { id: 'me', transport: server.transport() },
      linked: [{ id: 'them', transport: theirs.transport() }],
    });
    const syncBoth = () => syncOnce(b.db, spaces(), { now: now(), batchSize: 50 });
    await addProfile(b.db, 'p1');
    await b.db.transactions.put(tx('t1'));
    await syncBoth();

    server.erase();
    theirs.erase();
    // Their device already re-sent its settings after the erase.
    await theirs.transport().push(
      [{ tbl: 'categories', id: 'cat.after', rev: '9999999999999999.ffff.zzzzzzzz' as never, deleted: false,
         row: { id: 'cat.after', kind: 'expense', name: 'After', icon: 'Circle', source: 'custom', sortOrder: 99, isArchived: 0,
                createdAt: now(), updatedAt: now() } }],
      1,
    );

    const report = await syncBoth();
    expect(report.wiped).toBe(true);
    expect(await b.db.transactions.count()).toBe(0);
    expect(await b.db.categories.get('cat.after')).toBeDefined();
  });

  it("takes the epoch of a space it has never pulled from without clearing anything", async () => {
    server.erase();
    await addProfile(b.db, 'p1');
    await b.db.transactions.put(tx('t1'));
    const report = await b.sync();
    expect(report.wiped).toBe(false);
    expect(await b.db.transactions.count()).toBe(1);
    expect((await b.db.meta.get(epochKeyOf(undefined)))?.value).toBe(1);
  });

  it('eraseLocalData keeps settings and people queued to be sent again, and drops cursors and drafts', async () => {
    await addProfile(a.db, 'p1');
    await createCategory(a.db, 'cat.custom', { name: 'Gym', kind: 'expense', icon: 'Circle' }, now());
    await a.db.transactions.put(tx('t1'));
    await a.db.meta.bulkPut([
      { key: cursorKeyOf(undefined), value: 5 },
      { key: cursorKeyOf('x'), value: 7 },
      { key: 'importDraft:k', value: {} },
      { key: 'deviceId', value: 'd1' },
    ]);
    await eraseLocalData(a.db);
    expect(await a.db.transactions.count()).toBe(0);
    expect(await customCategories(a.db)).toBe(0);
    expect(await a.db.profiles.count()).toBe(1);
    expect((await a.db.outbox.toArray()).map((o) => o.tbl).sort()).toEqual(['profiles', 'settings']);
    for (const key of [cursorKeyOf(undefined), cursorKeyOf('x'), 'importDraft:k']) {
      expect(await a.db.meta.get(key)).toBeUndefined();
    }
    expect(await a.db.meta.get('deviceId')).toBeDefined();
  });
});
```

> The category row in the second test must match the real `Category` shape (`src/types/domain.ts`); copy one from a `categories.test.ts` fixture if a field differs. A pushed rev must be a valid `Rev` (`src/lib/rev.ts` `makeRev`); use `makeRev(clock + 10_000, 'ffff', 1)` rather than the literal if the literal fails `isRev`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/db/sync/erase.test.ts`
Expected: FAIL. The module `./erase` is not found.

- [ ] **Step 3: Implement**

`tables.ts`:

```ts
/** A space's erase counter, as this device last saw it (see 20261008000000_wipes.sql). */
export const SYNC_EPOCH_KEY = 'syncEpoch';

export function epochKeyOf(space: string | undefined): string {
  return space === undefined ? SYNC_EPOCH_KEY : `${SYNC_EPOCH_KEY}:${space}`;
}
```

`erase.ts`:

```ts
import { withoutTracking, type BookandryDB } from '../db';
import { SETTINGS_ID } from '../repos/settings';
import { PULLED_TO_HEAD_KEY } from './engine';
import { SYNC_CURSOR_KEY, SYNCED_TABLES, type OutboxRow } from './tables';

const KEPT = new Set(['settings', 'profiles']);
const DRAFT_PREFIX = 'importDraft:';

/**
 * Everything erased - here, untracked: the server already holds nothing, or
 * (signed out) there is no server. Settings and people stay, and are queued to
 * be sent again into a space that no longer holds them. Where every pull
 * resumes is forgotten, so the next sync starts from the top.
 */
export async function eraseLocalData(db: BookandryDB): Promise<void> {
  const tables = [...SYNCED_TABLES.map((t) => db.table(t)), db.syncState, db.outbox, db.meta];
  await withoutTracking(db, tables, async () => {
    for (const table of SYNCED_TABLES) if (!KEPT.has(table)) await db.table(table).clear();
    await db.syncState.filter((s) => !KEPT.has(s.tbl)).delete();
    await db.outbox.clear();
    const again: OutboxRow[] = (await db.profiles.toCollection().primaryKeys()).map((id) => ({
      tbl: 'profiles',
      id: String(id),
    }));
    if ((await db.settings.get(SETTINGS_ID)) !== undefined) again.push({ tbl: 'settings', id: SETTINGS_ID });
    await db.outbox.bulkPut(again);
    const keys = (await db.meta.toCollection().primaryKeys()).map(String);
    await db.meta.bulkDelete(
      keys.filter(
        (k) =>
          k === SYNC_CURSOR_KEY || k.startsWith(`${SYNC_CURSOR_KEY}:`) || k.startsWith(DRAFT_PREFIX) || k === PULLED_TO_HEAD_KEY,
      ),
    );
  });
}
```

> Import cycle check: `engine.ts` will import `erase.ts`, and `erase.ts` imports `PULLED_TO_HEAD_KEY` from `engine.ts`. Move `PULLED_TO_HEAD_KEY` into `tables.ts`, re-export it from `engine.ts` (`export { PULLED_TO_HEAD_KEY } from './tables'`) so `account.ts` keeps working, and import it from `./tables` in `erase.ts`.

`engine.ts`:
- `syncOnce` gets a `wiped` flag and reads the epochs. Replace the first `pushAll` and the pull loop with the following.

```ts
    const pulledBefore = new Set<string | undefined>();
    for (const space of [set.own, ...set.linked]) {
      const id = space === set.own ? undefined : space.id;
      if ((await db.meta.get(cursorKeyOf(id))) !== undefined) pulledBefore.add(id);
    }

    // A push into a space erased since this device last pulled is refused: the
    // pull below clears, and the second push sends what is left.
    let first = { pushed: 0, stale: 0 };
    try {
      first = await pushAll(db, set, batch);
    } catch (error) {
      if (!(error instanceof SpaceWipedError)) throw error;
    }

    let wiped = false;
    let applied = 0;
    let skipped = 0;
    let rejected = 0;
    for (const space of [set.own, ...set.linked]) {
      const id = space === set.own ? undefined : space.id;
      let cursor = await readCursor(db, id);
      let known = await readEpoch(db, id);
      for (let round = 0; ; round += 1) {
        if (round >= MAX_ROUNDS) throw new Error('Sync pull did not reach the head');
        const page = await space.transport.pull(cursor, batch);
        if (page.epoch !== undefined && page.epoch > known) {
          await db.meta.put({ key: epochKeyOf(id), value: page.epoch });
          known = page.epoch;
          if (pulledBefore.has(id)) {
            // Erased since this device last looked. One household erase raises
            // every member's space at once: clear once, then only start over.
            if (!wiped) await eraseLocalData(db);
            wiped = true;
            await db.meta.delete(cursorKeyOf(id));
            cursor = 0;
            continue;
          }
        }
        const report = await applyPage(db, page.records, page.cursor, id);
        applied += report.applied;
        skipped += report.skipped;
        rejected += report.rejected;
        cursor = page.cursor;
        if (!page.hasMore) break;
      }
    }
```

- Return `wiped` in the report. Add `readonly wiped: boolean;` to `SyncReport`.
- Add the helper:

```ts
async function readEpoch(db: BookandryDB, space: string | undefined): Promise<number> {
  const row = await db.meta.get(epochKeyOf(space));
  return typeof row?.value === 'number' ? row.value : 0;
}
```

- In `pushAll`, push with the space's epoch: `transport.push(records, await readEpoch(db, space === set.own.id ? undefined : space))`.

> A pull that clears and then `continue`s uses one more round, which `MAX_ROUNDS` allows.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run src/db/sync`
Expected: PASS, including `engine.test.ts`, `linked.test.ts` and `convergence.test.ts`, unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/db/sync
git commit -m "Delete all data, sync: a device clears once when a space it pulls from was erased"
```

---

### Task 5: The account — deleting, asking, answering, and being told

**Files:**
- Modify: `src/app/sync-runner.ts` (`onWiped` dependency)
- Modify: `src/app/account.ts` (methods and the wipe notice)
- Create: `src/app/erase-device.ts` (`eraseThisDevice`, for signed out and after a solo erase)
- Test: `src/app/erase-device.test.ts`, `src/app/sync-runner.test.ts` (append)

**Interfaces:**
- Consumes: `eraseLocalData` (Task 4), and the `wipe.ts` calls and `SendWipeOutcome` (Task 3). It also uses `sendWipeRequests` from `@/services/supabase/send-wipe` (Task 6), imported dynamically. Until Task 6 lands, create that file with only `export async function sendWipeRequests(): Promise<SendWipeOutcome> { return { ok: false, error: 'email_failed' }; }` so this task compiles; Task 6 replaces it.
- Produces on `AccountController`:
  - `wipeMyData(): Promise<void>`: alone, signed in.
  - `requestWipe(language: 'en' | 'he'): Promise<SendWipeOutcome>`
  - `wipeStatus(): Promise<WipeStatus | null>`
  - `peekWipe(token): Promise<WipePreview>`
  - `confirmWipe(token): Promise<'waiting' | 'done'>`
  - `declineWipe(token): Promise<void>`
  - `cancelWipe(): Promise<void>`
- Produces on the view: `wipeNotice?: { readonly by: string | undefined; readonly at: number }`, set when this device was cleared by an erase.
- Produces in `erase-device.ts`:
  - `reseedBuiltins(db: BookandryDB, now: IsoInstant): Promise<void>`: the built-in payment methods and categories.
  - `eraseThisDevice(db: BookandryDB, now: IsoInstant): Promise<void>`: `eraseLocalData`, then `reseedBuiltins`.

- [ ] **Step 1: Write the failing tests**

`src/app/erase-device.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createCategory } from '@/db/repos/categories';
import { freshDb } from '@/test/db-harness';

import { eraseThisDevice } from './erase-device';

describe('erasing this device', () => {
  it('leaves the built-ins and the people, and nothing else of the data', async () => {
    const { db } = freshDb();
    await db.open();
    // seed via the app's own repos: a custom category, a transaction, a card
    await createCategory(db, /* id, name, kind… copy the call shape from categories.test.ts */);
    const people = await db.profiles.count();
    await eraseThisDevice(db, '2026-10-07T10:00:00.000Z' as never);
    expect(await db.transactions.count()).toBe(0);
    expect((await db.categories.toArray()).every((c) => c.source === 'builtin')).toBe(true);
    expect(await db.categories.count()).toBeGreaterThan(20);
    expect(await db.paymentMethods.filter((m) => m.type === 'credit_card').count()).toBe(0);
    expect(await db.profiles.count()).toBe(people);
  });
});
```

Append to `src/app/sync-runner.test.ts` a test that `onWiped` runs exactly once when `syncOnce` reports `wiped: true`, and never otherwise. Mirror how that file already fakes `syncOnce`/the transport.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/app/erase-device.test.ts src/app/sync-runner.test.ts`
Expected: FAIL. The module `./erase-device` is not found.

- [ ] **Step 3: Implement**

`erase-device.ts`:

```ts
import type { BookandryDB } from '@/db/db';
import { ensureBuiltinCategories } from '@/db/repos/categories';
import { ensureBuiltinPaymentMethods } from '@/db/repos/payment-methods';
import { eraseLocalData } from '@/db/sync/erase';
import type { IsoInstant } from '@/types/money';

/** The built-ins, back as on a new install. */
export async function reseedBuiltins(db: BookandryDB, now: IsoInstant): Promise<void> {
  await ensureBuiltinPaymentMethods(db, now);
  await ensureBuiltinCategories(db, now);
}

/** This device emptied of the data, the built-ins back. */
export async function eraseThisDevice(db: BookandryDB, now: IsoInstant): Promise<void> {
  await eraseLocalData(db);
  await reseedBuiltins(db, now);
}
```

`sync-runner.ts`:
- Add `readonly onWiped?: () => Promise<void> | void;` to `SyncRunnerDeps`.
- In `run()` after `syncOnce`: `if (report.wiped) await deps.onWiped?.();`, before `onState(...)`.

`account.ts`:
- Pass `onWiped: () => this.afterWipe()` to `startSyncRunner`.
- Add these methods, following the existing `peekInvite`/`acceptInvite` style. They use `this.connect()` and the `wipe.ts` calls:

```ts
  /** This device was cleared by an erase: built-ins back, this account's person again, and say who asked. */
  private async afterWipe(): Promise<void> {
    // The engine already erased; only the built-ins come back.
    await reseedBuiltins(this.db, systemClock.nowIso());
    this.memberReady = false;
    let by: string | undefined;
    try {
      const status = await wipeStatus(await this.connect());
      if (status?.status === 'done') by = status.requesterName;
    } catch {
      // Named or not, the notice still shows.
    }
    this.patch({ wipeNotice: { by, at: systemClock.nowMs() } });
  }
```

```ts
  /** Alone: erase everything, on the server and here. Signed out: here only. */
  async wipeMyData(): Promise<void> {
    if (this.view.status !== 'signed_in') {
      await eraseThisDevice(this.db, systemClock.nowIso());
      return;
    }
    const epoch = await wipeMyData(await this.connect());
    await withLock(LOCK_SYNC, async () => {
      await eraseLocalData(this.db);
      await this.db.meta.put({ key: epochKeyOf(undefined), value: epoch });
    });
    await reseedBuiltins(this.db, systemClock.nowIso());
    this.memberReady = false;
    this.runner?.now();
  }

  async requestWipe(language: 'en' | 'he'): Promise<SendWipeOutcome> {
    if (this.view.status !== 'signed_in') return { ok: false, error: 'not_linked' };
    const user = this.view.user;
    const name = (await this.db.profiles.get(user.id))?.name ?? displayNameOf(user);
    const { sendWipeRequests } = await import('@/services/supabase/send-wipe');
    await this.connect();
    return sendWipeRequests(await getSupabase(), language, name);
  }

  async wipeStatus(): Promise<WipeStatus | null> {
    return wipeStatus(await this.connect());
  }
  async peekWipe(token: string): Promise<WipePreview> {
    return peekWipe(await this.connect(), token);
  }
  async confirmWipe(token: string): Promise<'waiting' | 'done'> {
    const outcome = await confirmWipe(await this.connect(), token);
    if (outcome === 'done') this.runner?.now();
    return outcome;
  }
  async declineWipe(token: string): Promise<void> {
    await declineWipe(await this.connect(), token);
  }
  async cancelWipe(): Promise<void> {
    await cancelWipe(await this.connect());
  }
```

- Add `wipeNotice?: { readonly by: string | undefined; readonly at: number }` to the signed-in view type, next to `household`.
- Import `withLock`/`LOCK_SYNC` from `@/db/lock`, `epochKeyOf` from `@/db/sync/tables`, `eraseLocalData` from `@/db/sync/erase`, and the `wipe.ts` functions statically. `wipe.ts` imports no supabase-js, so it stays in the main bundle safely, like `household.ts`.
- `SendWipeOutcome` is a type-only import from `@/services/supabase/wipe` (declared there in Task 6).

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run src/app src/db/sync`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app
git commit -m "Delete all data, account: erase alone, ask the household, answer, and be told"
```

---

### Task 6: Edge function — `send-wipe-requests`

**Files:**
- Create: `supabase/functions/send-wipe-requests/index.ts`
- Create: `src/services/supabase/send-wipe.ts`
- Test: `src/services/supabase/send-wipe.test.ts`

**Interfaces:**
- Consumes: `request_wipe()` and `cancel_wipe()` (Task 2).
- Produces:
  - `sendWipeRequests(client: SupabaseClient, language: 'en' | 'he', requesterName: string): Promise<SendWipeOutcome>`.

- [ ] **Step 1: Write the failing test** (`src/services/supabase/send-wipe.test.ts`)

Copy the structure of the existing `send-invite` client test. Find it with `ls src/services/supabase/send-invite*.test.ts`; if there is none, test against a fake `{ functions: { invoke } }` client:
- a 200 `{ ok: true, asked: 2 }` maps to `{ ok: true, asked: 2 }`;
- a `FunctionsHttpError` with body `{ error: 'wipe_pending' }` maps to `{ ok: false, error: 'wipe_pending' }`;
- an unknown error body maps to `email_failed`;
- a thrown `TypeError` (network) maps to `offline`.

```ts
import { FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { sendWipeRequests } from './send-wipe';

const client = (invoke: ReturnType<typeof vi.fn>) => ({ functions: { invoke } }) as never;

describe('sending the confirmation emails', () => {
  it('says how many were asked, or why not', async () => {
    expect(await sendWipeRequests(client(vi.fn().mockResolvedValue({ data: { ok: true, asked: 2 }, error: null })), 'en', 'Dana'))
      .toEqual({ ok: true, asked: 2 });
    const refused = new FunctionsHttpError(new Response(JSON.stringify({ error: 'wipe_pending' }), { status: 400 }));
    expect(await sendWipeRequests(client(vi.fn().mockResolvedValue({ data: null, error: refused })), 'en', 'Dana'))
      .toEqual({ ok: false, error: 'wipe_pending' });
    const odd = new FunctionsHttpError(new Response(JSON.stringify({ error: 'weird' }), { status: 502 }));
    expect(await sendWipeRequests(client(vi.fn().mockResolvedValue({ data: null, error: odd })), 'en', 'Dana'))
      .toEqual({ ok: false, error: 'email_failed' });
    expect(await sendWipeRequests(client(vi.fn().mockRejectedValue(new TypeError('net'))), 'en', 'Dana'))
      .toEqual({ ok: false, error: 'offline' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/services/supabase/send-wipe.test.ts`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement**

`send-wipe.ts`: mirror `src/services/supabase/send-invite.ts` line for line. Call `client.functions.invoke('send-wipe-requests', { body: { language, requesterName } })`, map `FunctionsHttpError` bodies whose `error` is one of `not_linked | wipe_pending | too_many_wipe_requests` through, map any other error body to `email_failed`, and map a thrown network error to `offline`.

`supabase/functions/send-wipe-requests/index.ts`: copy `supabase/functions/send-invite/index.ts` as the template. It keeps:
- the same `ORIGINS`/`cors`, `SENDER`, `escape`, the email layout (header and band images) and the Resend call;
- `createSupabaseContext` with auth 'user', and the user-scoped `createClient`;
- the `RESEND_API_KEY` check.

It differs as follows.
- The input is `{ language: 'en' | 'he'; requesterName: string ≤ 80 }`.
- `KNOWN = new Set(['not_linked', 'wipe_pending', 'too_many_wipe_requests'])`.
- It calls `db.rpc('request_wipe')`. On error it maps a known message through with status 400, and anything else to `email_failed` with status 502.
- For each `{ email, token }` in `asks`, it sends one email with link `${base}/wipe?t=${encodeURIComponent(token)}`. If any send fails, it calls `db.rpc('cancel_wipe')` and returns `email_failed` with status 502.
- On success it returns `{ ok: true, asked: asks.length }`.

The email copy:

English:
- **subject:** `${name} asked to delete all of your household's data on Bookandry`
- **title:** `A request to delete your household's data`
- **body:** `${who} asked to delete all of the data you share on Bookandry: every transaction, card, bank account, category and commitment, for everyone in the household. Nothing is deleted unless everyone else agrees. Your logins, pictures and the link between your accounts stay.`
- **button:** `Review the request`
- **expiry:** `The link works once and for seven days. To answer, sign in with this email address.`
- **ignore:** `Not expecting this? Don't confirm: nothing is deleted without you.`

Hebrew:
- **subject:** `${name} ביקש/ה למחוק את כל הנתונים של משק הבית ב־Bookandry`
- **title:** `בקשה למחוק את נתוני משק הבית`
- **body:** `${who} ביקש/ה למחוק את כל הנתונים המשותפים לכם ב־Bookandry: כל התנועות, הכרטיסים, חשבונות הבנק, הקטגוריות וההתחייבויות, של כל מי שבמשק הבית. שום דבר לא יימחק בלי הסכמה של כל השאר. החשבונות, התמונות והקישור ביניכם נשארים.`
- **button:** `לצפייה בבקשה`
- **expiry:** `הקישור תקף לשבעה ימים ולשימוש אחד. כדי לענות צריך להתחבר עם כתובת המייל הזו.`
- **ignore:** `לא ציפית לזה? אל תאשר/י, ושום דבר לא יימחק בלעדיך.`

- [ ] **Step 4: Run the test**

Run: `pnpm exec vitest run src/services/supabase/send-wipe.test.ts`
Expected: PASS. Also run `pnpm build` and check that the main chunk did not grow by supabase-js. `send-wipe.ts` must be imported only dynamically, which it is (Task 5).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-wipe-requests src/services/supabase/send-wipe.ts src/services/supabase/send-wipe.test.ts
git commit -m "Delete all data: the emails asking every other member to confirm"
```

---

### Task 7: Settings › Data & backup — the Delete section

**Files:**
- Create: `src/features/settings/delete-data.tsx` (the section, its dialog and the pending status)
- Modify: `src/features/settings/data-card.tsx` (render `<DeleteData />` last, after storage)
- Modify: `src/i18n/locales/en/common.json`, `src/i18n/locales/he/common.json` (the `settings.delete.*` keys)
- Test: `src/features/settings/delete-data.test.tsx`

**Interfaces:**
- Consumes:
  - From `accountController()`: `wipeMyData`, `requestWipe`, `wipeStatus`, `cancelWipe` (Task 5).
  - `useAccount()`: `status`, `household?.members`.
  - The existing export action in `data-card.tsx`. Lift `exportNow` into a prop, `onBackup: () => Promise<void>`.
- Produces: `<DeleteData onBackup={…} />`.

**Behaviour:**
- **Alone or signed out:** the button "Delete all data" opens an `AlertDialog`. It shows the list of what's erased and what stays, a secondary "Download a backup first" button (calls `onBackup`), a text input labelled "Type DELETE to confirm", and a destructive "Delete everything" button. That button is enabled only when `matchesWord(input)`.
  - On success: toast "All data was deleted", and the dialog closes.
- **Linked** (`household.members.length > 1`): the button reads "Ask to delete everyone's data". The dialog lists the other members by name ("Dana and Noa will each get an email…"), with the same word gate. The submit button is "Send the requests".
  - `ok` → toast "Requests sent. Nothing is deleted until everyone confirms."
  - Errors use the table in the spec.
- **Pending** (from `wipeStatus()` on mount and after a send): "Waiting for {{names}} to confirm · expires {{relative}}" replaces the button, with a "Cancel the request" button when `mine`.
- **Offline while signed in** (`navigator.onLine === false`): the button is disabled, with the hint "Connect to delete".

Pure helper, exported for tests:

```ts
/** DELETE or מחיקה, in either language, whatever the case or the spaces around it. */
export function matchesWord(input: string): boolean {
  const word = input.trim().toLocaleLowerCase();
  return word === 'delete' || word === 'מחיקה';
}
```

- [ ] **Step 1: Write the failing tests** (`delete-data.test.tsx`)

Mock `@/app/account` the way `src/features/import/import-sheet.test.tsx` does, with a controller whose methods are `vi.fn()`. Test:
1. `matchesWord`: `' Delete '`, `'DELETE'` and `'מחיקה'` are true; `'delet'` and `''` are false.
2. **Alone:** the "Delete everything" button stays disabled until "DELETE" is typed. Clicking it calls `wipeMyData` once, and the toast text appears.
3. **Linked** (two members, Dana is me, Noa is the other): the dialog names Noa. Sending calls `requestWipe('en')`; a `{ ok: false, error: 'email_failed' }` result shows "Couldn't send the confirmation emails. Nothing was deleted. Try again."
4. **Pending** (`wipeStatus` resolves `{ status: 'pending', mine: true, waitingFor: ['Noa'], … }`): the text "Waiting for Noa to confirm" shows, and "Cancel the request" calls `cancelWipe`.
5. **Hebrew:** render with `initTestI18n('he')`. The confirm label asks for "מחיקה".

- [ ] **Step 2: Run them to verify they fail.** Run: `pnpm exec vitest run src/features/settings/delete-data.test.tsx`. Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement** the component with the existing kit:
- `AlertDialog` from `src/components/ui/alert-dialog.tsx`, `Button` (variant `destructive` for the final action), and `Input`;
- `useTranslation()` keys under `settings.delete.*`;
- `formatRelative` the same way `data-card.tsx`'s `relative()` does;
- logical spacing only.

Add the copy:

| key | en | he |
|---|---|---|
| `settings.delete.title` | Delete all data | מחיקת כל הנתונים |
| `settings.delete.body` | Erase every transaction, card, bank account, category and commitment. Your login, pictures and settings stay. | מחיקת כל התנועות, הכרטיסים, חשבונות הבנק, הקטגוריות וההתחייבויות. החשבון, התמונות וההגדרות נשארים. |
| `settings.delete.open` | Delete all data | מחיקת כל הנתונים |
| `settings.delete.openLinked` | Ask to delete everyone's data | בקשה למחוק את הנתונים של כולם |
| `settings.delete.erased` | Erased: transactions, cards, bank accounts, categories you added, commitments, import drafts. | יימחקו: תנועות, כרטיסים, חשבונות בנק, קטגוריות שהוספתם, התחייבויות וטיוטות ייבוא. |
| `settings.delete.kept` | Kept: your login, pictures, settings and the people in your household. | יישארו: החשבון, התמונות, ההגדרות והאנשים במשק הבית. |
| `settings.delete.linkedAsk` | {{names}} will each get an email to confirm. Nothing is deleted until everyone does, and then it's deleted for everyone. | {{names}} יקבלו מייל לאישור. שום דבר לא יימחק עד שכולם יאשרו, ואז הנתונים יימחקו לכולם. |
| `settings.delete.backupFirst` | Download a backup first | קודם להוריד גיבוי |
| `settings.delete.typeLabel` | Type DELETE to confirm | כדי לאשר, הקלידו מחיקה |
| `settings.delete.confirm` | Delete everything | למחוק הכול |
| `settings.delete.send` | Send the requests | לשלוח את הבקשות |
| `settings.delete.done` | All data was deleted | כל הנתונים נמחקו |
| `settings.delete.sent` | Requests sent. Nothing is deleted until everyone confirms. | הבקשות נשלחו. שום דבר לא יימחק עד שכולם יאשרו. |
| `settings.delete.waiting` | Waiting for {{names}} to confirm · expires {{when}} | ממתינים לאישור של {{names}} · בתוקף עד {{when}} |
| `settings.delete.cancel` | Cancel the request | ביטול הבקשה |
| `settings.delete.cancelled` | Request cancelled | הבקשה בוטלה |
| `settings.delete.offline` | Connect to delete | צריך חיבור לאינטרנט כדי למחוק |
| `settings.delete.emailFailed` | Couldn't send the confirmation emails. Nothing was deleted. Try again. | לא הצלחנו לשלוח את מיילי האישור. שום דבר לא נמחק. אפשר לנסות שוב. |
| `settings.delete.pending` | A request is already waiting for answers. | כבר יש בקשה שממתינה לתשובות. |
| `settings.delete.tooSoon` | A request was made in the last hour. Try again later. | נשלחה בקשה בשעה האחרונה. אפשר לנסות שוב מאוחר יותר. |

Names join with `Intl.ListFormat(lang, { type: 'conjunction' })`.

- [ ] **Step 4: Run the tests.** Run: `pnpm exec vitest run src/features/settings`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings src/i18n/locales
git commit -m "Delete all data: the section in Data & backup, alone and for a household"
```

---

### Task 8: `/wipe` — reviewing a request from the email

**Files:**
- Create: `src/features/household/wipe-screen.tsx`
- Create: `src/features/household/pending-wipe.ts` (session key `greenback.pendingWipe`)
- Modify: `src/app/routes.ts` (`LINKED_ROUTES.wipe = '/wipe'`)
- Modify: `src/main.tsx` (the route)
- Modify: `src/app/app-shell.tsx`:
  - `useReturnToInvite` also returns to `/wipe` when `pendingWipe()` is set;
  - a `useWipeNotice()` that toasts `wipeNotice` once per `at`.
- Modify: locale files (`wipe.*` keys)
- Test: `src/features/household/wipe-screen.test.tsx`

**Interfaces:**
- Consumes: `peekWipe`, `confirmWipe` and `declineWipe` on `accountController()`, plus `view.wipeNotice` (Task 5).
- Produces:
  - `<WipeScreen />`.
  - `rememberPendingWipe(token)`, `pendingWipe()` and `forgetPendingWipe()`. These are the same shape as `pending-invite.ts`, with the same token regex `^[0-9a-f]{64}$`.

**Behaviour (mirrors `link-screen.tsx`):**
- **Signed out:** remember the token, show "Sign in to answer this request", and the sign-in entry the link screen uses.
- **Signed in:** call `peekWipe(token)`. The states are `loading | ready | invalid | wrong_account | offline`.
  - `ready`: "{{name}} asked to delete all of your household's data" (the copy names the requester by their display name), the erased/kept lists (reusing `settings.delete.erased`/`kept`), "Asked {{date}} · open until {{date}}", and the buttons **Confirm** (destructive) and **Decline** (outline).
  - **Confirm:** `'waiting'` → "Thanks. Waiting for the others."; `'done'` → "All data was deleted". Then it forgets the token and goes to the feed.
  - **Decline:** "Request declined. Nothing was deleted." Then it forgets the token and goes to the feed.
  - `invalid`: "This request is no longer open."
  - `wrong_account`: "This request isn't for this account. Sign in with the email it was sent to."

- [ ] **Step 1: Write the failing tests** (`wipe-screen.test.tsx`)

Use `MemoryRouter` with `initialEntries={['/wipe?t=' + 'a'.repeat(64)]}` and a mocked `@/app/account`. Cover: ready → Confirm → `confirmWipe` called and "Thanks. Waiting for the others." shows; Decline → `declineWipe` called; a `ServerError('wipe_wrong_account')` from `peekWipe` → the wrong-account text; a `ServerError('wipe_invalid')` → "This request is no longer open."; signed out → the token is kept in `sessionStorage` under `greenback.pendingWipe`.

- [ ] **Step 2: Run them to verify they fail.** Run: `pnpm exec vitest run src/features/household/wipe-screen.test.tsx`. Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement** by copying `link-screen.tsx`'s structure: the state machine, the effects and the leave handler. Remove the reconvert step. Add the copy:

| key | en | he |
|---|---|---|
| `wipe.title` | {{name}} asked to delete all of your household's data | {{name}} ביקש/ה למחוק את כל הנתונים של משק הבית |
| `wipe.when` | Asked {{asked}} · open until {{until}} | נשלחה {{asked}} · בתוקף עד {{until}} |
| `wipe.forEveryone` | If everyone confirms, it's deleted for all {{count}} of you. | אם כולם יאשרו, הנתונים יימחקו לכל {{count}} החשבונות. |
| `wipe.confirm` | Confirm | אישור |
| `wipe.decline` | Decline | דחייה |
| `wipe.waiting` | Thanks. Waiting for the others. | תודה. ממתינים לשאר. |
| `wipe.declined` | Request declined. Nothing was deleted. | הבקשה נדחתה. שום דבר לא נמחק. |
| `wipe.invalid` | This request is no longer open. | הבקשה הזו כבר לא פתוחה. |
| `wipe.wrongAccount` | This request isn't for this account. Sign in with the email it was sent to. | הבקשה לא מיועדת לחשבון הזה. צריך להתחבר עם כתובת המייל שאליה נשלחה. |
| `wipe.signIn` | Sign in to answer this request | כדי לענות על הבקשה צריך להתחבר |
| `wipe.notice` | All data was deleted at {{name}}'s request | כל הנתונים נמחקו לבקשת {{name}} |
| `wipe.noticeAnon` | All data was deleted | כל הנתונים נמחקו |

- [ ] **Step 4: Run the tests.** Run: `pnpm exec vitest run src/features/household src/app`. Expected: PASS. The `app-shell` tests stay green.

- [ ] **Step 5: Commit**

```bash
git add src/features/household src/app src/main.tsx src/i18n/locales
git commit -m "Delete all data: the page an emailed request opens, to confirm or decline"
```

---

### Task 9: Documents, browser test, and going live

**Files:**
- Modify: `public/privacy.html` (en and he: one sentence each in the data section)
- Modify: `README.md` (one line under Data & backup)
- Create: `e2e/delete-data.spec.ts`
- Modify: `supabase/functions/send-wipe-requests/index.ts` only if the deploy surfaces a Deno type error

- [ ] **Step 1: Write the browser test** (`e2e/delete-data.spec.ts`)

Follow the existing local-build specs (`e2e/*.spec.ts` with the demo-data helper) for setup.
1. Load demo data and open Settings › Data & backup.
2. Click "Delete all data". Check that "Delete everything" is disabled; type `DELETE`; click it.
3. Expect the toast "All data was deleted".
4. Expect the feed to show its empty state, while built-in categories still show in the add form's category picker.

- [ ] **Step 2: Run it**

Run: `pnpm exec playwright test e2e/delete-data.spec.ts`
Expected: PASS.

- [ ] **Step 3: Write the documents**

`privacy.html`, English: "You can delete all of your data from Settings › Data & backup. When your account is linked with others, everyone else in the household must confirm by email first, and then the data is deleted for every account in it." Hebrew: "אפשר למחוק את כל הנתונים מהגדרות › נתונים וגיבוי. כשהחשבון מקושר לחשבונות אחרים, כל השאר במשק הבית צריכים לאשר קודם במייל, ואז הנתונים נמחקים לכל החשבונות."

`README.md`: "Delete all data (Settings › Data & backup): immediate when alone; a linked household's every other member confirms by an emailed link first."

- [ ] **Step 4: Full verify**

Run: `pnpm verify` and then `pnpm exec playwright test`.
Expected: everything passes.

- [ ] **Step 5: Go live, in this order**

1. Apply the migration with the Supabase MCP `apply_migration`, name `wipes`, with the contents of `20261008000000_wipes.sql`. It drops a function, so the person may need to approve it. Then run `get_advisors` (security) and fix anything new it reports about these tables or functions.
2. Deploy `send-wipe-requests` with the Supabase MCP `deploy_edge_function`: files `send-wipe-requests/index.ts`, `verify_jwt: true`.
3. Commit and push, then run `pnpm release`.
4. Check the live function boots: `curl -X OPTIONS https://eanrighmesbmboergnhj.supabase.co/functions/v1/send-wipe-requests -H "Origin: https://bookandry.com"` must return 200.

- [ ] **Step 6: Commit**

```bash
git add public/privacy.html README.md e2e/delete-data.spec.ts
git commit -m "Delete all data: privacy page, README, and the end-to-end test"
```
