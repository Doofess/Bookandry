-- Bookandry sync: an end-to-end encrypted record store.
--
-- The server holds ciphertext it cannot read, plus the minimum it needs to
-- order and route it: a blinded record id, a rev, a key version. Every write
-- goes through push_records(); the tables themselves are read-only to clients,
-- and only to their own rows.
--
-- The client-side rules these functions must match are pinned by
-- src/test/memory-sync-server.ts, and this file is tested against real
-- Postgres by src/services/supabase/schema.test.ts.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per account that has set up sync. Also the per-user lock: every
-- push takes this row FOR UPDATE, so sequence numbers are handed out in commit
-- order. (A bigserial would not be: two concurrent pushes can commit out of
-- order, and a device that pulled in between would skip a row for good.)
create table public.user_state (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  -- The data key records must be sealed with. 0 = keys not set up yet.
  key_version  integer not null default 0 check (key_version >= 0),
  seq          bigint  not null default 0,
  push_count   bigint  not null default 0,
  record_count integer not null default 0,
  bytes_used   bigint  not null default 0,
  created_at   timestamptz not null default now()
);

-- The data key, wrapped once per way in. The server can open none of them.
create table public.user_keys (
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('passkey', 'recovery', 'passphrase')),
  id          text not null,
  key_version integer not null,
  salt        text not null,
  iv          text not null,
  ct          text not null,
  kdf         jsonb,
  created_at  timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create table public.records (
  user_id     uuid not null references auth.users (id) on delete cascade,
  rid         text not null,
  -- Fixed-width, so byte order IS time order - but only under the C collation;
  -- a linguistic one may ignore the dots and compare revs wrongly.
  rev         text collate "C" not null,
  seq         bigint not null,
  push_id     bigint not null,
  key_version integer not null,
  iv          text not null,
  ct          text not null,
  primary key (user_id, rid)
);

create index records_user_seq on public.records (user_id, seq);

-- ---------------------------------------------------------------------------
-- Access: read your own rows; write only through the functions below
-- ---------------------------------------------------------------------------

alter table public.user_state enable row level security;
alter table public.user_keys  enable row level security;
alter table public.records    enable row level security;

-- Supabase grants every role everything on new tables by default. Undo that.
revoke all on table public.user_state, public.user_keys, public.records from public, anon, authenticated;
grant select on table public.user_state, public.user_keys, public.records to authenticated;

create policy "own state"   on public.user_state for select to authenticated using (user_id = (select auth.uid()));
create policy "own keys"    on public.user_keys  for select to authenticated using (user_id = (select auth.uid()));
create policy "own records" on public.records    for select to authenticated using (user_id = (select auth.uid()));

-- Helpers live outside the API's schema, where no client can call them.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------

create function private.limits(name text) returns bigint
language sql immutable set search_path = '' as $$
  select case name
    when 'records_per_push' then 500
    when 'ct_chars'         then 65536       -- one sealed row, base64url
    when 'push_chars'       then 4194304     -- one push, all rows together
    when 'records_per_user' then 100000
    when 'bytes_per_user'   then 52428800    -- 50 MiB of ciphertext
    when 'wraps_per_user'   then 20
    when 'pull_limit'       then 1000
  end::bigint
$$;

create function private.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  return uid;
end
$$;

-- One wrapped key, as the client sends it: {kind,id,keyVersion,salt,iv,ct,kdf?}.
-- The client re-checks all of this on unlock; checking here keeps garbage and
-- oversized values out of the table, and out of other devices' way.
create function private.check_wrap(w jsonb, version integer) returns void
language plpgsql immutable set search_path = '' as $$
declare kdf jsonb := w -> 'kdf';
begin
  if jsonb_typeof(w) is distinct from 'object'
     or w ->> 'kind' is null
     or w ->> 'kind' not in ('passkey', 'recovery', 'passphrase')
     or jsonb_typeof(w -> 'keyVersion') is distinct from 'number'
     or (w ->> 'keyVersion') !~ '^[0-9]{1,9}$'
     or (w ->> 'keyVersion')::integer <> version
     or coalesce(w ->> 'salt', '') !~ '^[A-Za-z0-9_-]{22}$'
     or coalesce(w ->> 'iv', '')   !~ '^[A-Za-z0-9_-]{16}$'
     or coalesce(w ->> 'ct', '')   !~ '^[A-Za-z0-9_-]{64}$'
  then
    raise exception 'malformed_wrap' using errcode = '22023';
  end if;

  if w ->> 'kind' = 'passkey' then
    -- A WebAuthn credential id is at most 1023 bytes: 1364 base64url chars.
    if coalesce(w ->> 'id', '') !~ '^[A-Za-z0-9_-]+$'
       or length(w ->> 'id') not between 16 and 1366
       or kdf is not null
    then
      raise exception 'malformed_wrap' using errcode = '22023';
    end if;
  elsif w ->> 'kind' = 'recovery' then
    if w ->> 'id' is distinct from 'recovery' or kdf is not null then
      raise exception 'malformed_wrap' using errcode = '22023';
    end if;
  else
    if w ->> 'id' is distinct from 'passphrase'
       or jsonb_typeof(kdf) is distinct from 'object'
       or kdf ->> 'alg' is distinct from 'argon2id'
       or coalesce(kdf ->> 'm', '') !~ '^[0-9]{1,6}$'
       or coalesce(kdf ->> 't', '') !~ '^[0-9]{1,2}$'
       or coalesce(kdf ->> 'p', '') !~ '^[0-9]$'
       or (kdf ->> 'm')::integer not between 19456 and 262144
       or (kdf ->> 't')::integer not between 2 and 8
       or (kdf ->> 'p')::integer not between 1 and 4
    then
      raise exception 'malformed_wrap' using errcode = '22023';
    end if;
  end if;
end
$$;

-- A full set of wraps for a new key version: setup and rotation both need one.
-- Exactly one recovery wrap, always: nobody is ever left with no way back in.
create function private.replace_wraps(uid uuid, wraps jsonb, version integer) returns void
language plpgsql set search_path = '' as $$
declare w jsonb;
begin
  if jsonb_typeof(wraps) is distinct from 'array'
     or jsonb_array_length(wraps) = 0
     or jsonb_array_length(wraps) > private.limits('wraps_per_user')
  then
    raise exception 'malformed_wrap' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(wraps) e where e.value ->> 'kind' = 'recovery') <> 1 then
    raise exception 'recovery_wrap_required' using errcode = '22023';
  end if;

  delete from public.user_keys where user_id = uid;
  for w in select value from jsonb_array_elements(wraps) loop
    perform private.check_wrap(w, version);
    insert into public.user_keys (user_id, kind, id, key_version, salt, iv, ct, kdf)
    values (uid, w ->> 'kind', w ->> 'id', version, w ->> 'salt', w ->> 'iv', w ->> 'ct', w -> 'kdf');
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Keys
-- ---------------------------------------------------------------------------

-- First-time setup: the account's first data key. Refused if another device
-- got there first - that device's key is the account's, and this one unlocks
-- with it instead.
create function public.setup_keys(p_wraps jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  st public.user_state%rowtype;
begin
  insert into public.user_state (user_id) values (uid) on conflict (user_id) do nothing;
  select * into st from public.user_state where user_id = uid for update;
  if st.key_version <> 0 then
    raise exception 'already_set_up' using errcode = '55000';
  end if;
  perform private.replace_wraps(uid, p_wraps, 1);
  update public.user_state set key_version = 1 where user_id = uid;
  return 1;
end
$$;

-- Rotation ("I lost my phone"): a new data key. Every record sealed under the
-- old one is dropped - the rotating device re-pushes everything under the new
-- key - and from here on a push under the old key is refused (the barrier in
-- push_records), so a device that has not unlocked with the new key keeps its
-- changes queued rather than filing them where nobody can ever read them.
--
-- `p_from` is the version the caller rotated FROM: if another device rotated
-- in the meantime, this one must unlock with that key first, not trample it.
-- Sequence numbers keep counting up, so every device's cursor stays valid.
create function public.rotate_keys(p_from integer, p_wraps jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  st public.user_state%rowtype;
  next_version integer;
begin
  select * into st from public.user_state where user_id = uid for update;
  if not found or st.key_version = 0 then
    raise exception 'keys_not_set_up' using errcode = '55000';
  end if;
  if st.key_version <> p_from then
    raise exception 'key_version_changed' using errcode = '40001';
  end if;
  next_version := st.key_version + 1;
  perform private.replace_wraps(uid, p_wraps, next_version);
  delete from public.records where user_id = uid;
  update public.user_state
     set key_version = next_version, record_count = 0, bytes_used = 0
   where user_id = uid;
  return next_version;
end
$$;

-- The current key version and every way in to it: what a device needs to
-- unlock. Version 0 and no wraps = sync not set up on this account yet.
create function public.get_key_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := private.require_user();
begin
  return jsonb_build_object(
    'keyVersion', coalesce((select s.key_version from public.user_state s where s.user_id = uid), 0),
    'wraps', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', k.kind, 'id', k.id, 'keyVersion', k.key_version,
               'salt', k.salt, 'iv', k.iv, 'ct', k.ct, 'kdf', k.kdf) order by k.kind, k.id)
        from public.user_keys k where k.user_id = uid), '[]'::jsonb));
end
$$;

-- Add or replace one way in for the current key: a new passkey, a changed
-- passphrase, a regenerated recovery key.
create function public.put_wrap(p_wrap jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  st public.user_state%rowtype;
begin
  select * into st from public.user_state where user_id = uid for update;
  if not found or st.key_version = 0 then
    raise exception 'keys_not_set_up' using errcode = '55000';
  end if;
  perform private.check_wrap(p_wrap, st.key_version);
  insert into public.user_keys (user_id, kind, id, key_version, salt, iv, ct, kdf)
  values (uid, p_wrap ->> 'kind', p_wrap ->> 'id', st.key_version,
          p_wrap ->> 'salt', p_wrap ->> 'iv', p_wrap ->> 'ct', p_wrap -> 'kdf')
  on conflict (user_id, kind, id) do update
    set key_version = excluded.key_version, salt = excluded.salt, iv = excluded.iv,
        ct = excluded.ct, kdf = excluded.kdf, created_at = now();
  if (select count(*) from public.user_keys where user_id = uid) > private.limits('wraps_per_user') then
    raise exception 'too_many_wraps' using errcode = '54000';
  end if;
end
$$;

-- Remove a passkey's or the passphrase's way in. The recovery key cannot be
-- removed, only replaced.
create function public.delete_wrap(p_kind text, p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user();
begin
  if p_kind = 'recovery' then
    raise exception 'recovery_wrap_required' using errcode = '22023';
  end if;
  delete from public.user_keys where user_id = uid and kind = p_kind and id = p_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Records
-- ---------------------------------------------------------------------------

-- The only way a record gets written. For each record:
--   rev older than held  -> 'stale', not stored
--   rev newer (or new)   -> stored with the next sequence number
--   rev equal            -> 'stored': it is already here (a lost ack, resent)
-- A record sealed under any key version but the current one refuses the whole
-- push, with 'stale_key_version', before anything is written.
create function public.push_records(p_records jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  st public.user_state%rowtype;
  r jsonb;
  held_rev text collate "C";
  held_len integer;
  incoming text collate "C";
  push bigint;
  stored_any boolean := false;
  results jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'malformed_record' using errcode = '22023';
  end if;
  if jsonb_array_length(p_records) = 0 then
    return results;
  end if;
  if jsonb_array_length(p_records) > private.limits('records_per_push')
     or (select sum(length(coalesce(e.value ->> 'ct', ''))) from jsonb_array_elements(p_records) e)
        > private.limits('push_chars')
  then
    raise exception 'push_too_large' using errcode = '54000';
  end if;

  select * into st from public.user_state where user_id = uid for update;
  if not found or st.key_version = 0 then
    raise exception 'keys_not_set_up' using errcode = '55000';
  end if;

  -- Check everything before writing anything.
  for r in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(r) is distinct from 'object'
       or coalesce(r ->> 'rid', '') !~ '^[A-Za-z0-9_-]{43}$'
       or coalesce(r ->> 'rev', '') !~ '^[0-9]{16}\.[0-9a-f]{4}\.[0-9a-z]{8}$'
       or coalesce(r ->> 'iv', '')  !~ '^[A-Za-z0-9_-]{16}$'
       or coalesce(r ->> 'ct', '')  !~ '^[A-Za-z0-9_-]{22,}$'
       or length(r ->> 'ct') > private.limits('ct_chars')
       or jsonb_typeof(r -> 'keyVersion') is distinct from 'number'
    then
      raise exception 'malformed_record' using errcode = '22023';
    end if;
    if (r ->> 'keyVersion') is distinct from st.key_version::text then
      raise exception 'stale_key_version' using errcode = '55000';
    end if;
  end loop;

  push := st.push_count + 1;
  for r in select value from jsonb_array_elements(p_records) loop
    incoming := r ->> 'rev';
    select rec.rev, length(rec.ct) into held_rev, held_len
      from public.records rec where rec.user_id = uid and rec.rid = r ->> 'rid';

    if held_rev is not null and incoming < held_rev then
      results := results || jsonb_build_object('rid', r ->> 'rid', 'rev', incoming, 'status', 'stale');
      continue;
    end if;

    if held_rev is null or incoming > held_rev then
      st.seq := st.seq + 1;
      st.bytes_used := st.bytes_used + length(r ->> 'ct') - coalesce(held_len, 0);
      if held_rev is null then
        st.record_count := st.record_count + 1;
      end if;
      insert into public.records (user_id, rid, rev, seq, push_id, key_version, iv, ct)
      values (uid, r ->> 'rid', incoming, st.seq, push, st.key_version, r ->> 'iv', r ->> 'ct')
      on conflict (user_id, rid) do update
        set rev = excluded.rev, seq = excluded.seq, push_id = excluded.push_id,
            key_version = excluded.key_version, iv = excluded.iv, ct = excluded.ct;
      stored_any := true;
    end if;
    results := results || jsonb_build_object('rid', r ->> 'rid', 'rev', incoming, 'status', 'stored');
  end loop;

  if st.record_count > private.limits('records_per_user')
     or st.bytes_used > private.limits('bytes_per_user')
  then
    -- Raising rolls every write above back.
    raise exception 'quota_exceeded' using errcode = '54000';
  end if;

  update public.user_state
     set seq = st.seq,
         push_count = case when stored_any then push else push_count end,
         record_count = st.record_count,
         bytes_used = st.bytes_used
   where user_id = uid;
  return results;
end
$$;

-- Records written after `p_cursor`, oldest first. A page is never cut inside
-- one push: an instalment and its first payment's override arrive together,
-- or not at all.
create function public.pull_records(p_cursor bigint, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  last_seq bigint;
  last_push bigint;
  page jsonb;
begin
  if p_cursor is null or p_cursor < 0 or p_limit is null or p_limit < 1
     or p_limit > private.limits('pull_limit')
  then
    raise exception 'malformed_pull' using errcode = '22023';
  end if;

  select s.seq, s.push_id into last_seq, last_push
    from (select rec.seq, rec.push_id from public.records rec
           where rec.user_id = uid and rec.seq > p_cursor
           order by rec.seq limit p_limit) s
   order by s.seq desc limit 1;

  if last_seq is null then
    return jsonb_build_object('records', '[]'::jsonb, 'cursor', p_cursor, 'hasMore', false);
  end if;

  -- Sequence numbers are handed out push by push, so the rest of this push
  -- is exactly what lies between here and its last row.
  select coalesce(max(rec.seq), last_seq) into last_seq
    from public.records rec
   where rec.user_id = uid and rec.push_id = last_push and rec.seq > last_seq;

  select coalesce(jsonb_agg(jsonb_build_object(
           'rid', rec.rid, 'rev', rec.rev, 'keyVersion', rec.key_version,
           'iv', rec.iv, 'ct', rec.ct) order by rec.seq), '[]'::jsonb)
    into page
    from public.records rec
   where rec.user_id = uid and rec.seq > p_cursor and rec.seq <= last_seq;

  return jsonb_build_object(
    'records', page,
    'cursor', last_seq,
    'hasMore', exists (select 1 from public.records rec where rec.user_id = uid and rec.seq > last_seq));
end
$$;

-- ---------------------------------------------------------------------------
-- The account itself
-- ---------------------------------------------------------------------------

-- Delete the caller's account. Everything above cascades from auth.users.
-- Other devices keep their local copy; that is theirs, not the server's.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user();
begin
  delete from auth.users where id = uid;
end
$$;

-- Supabase lets every role execute new functions by default. Undo that too.
revoke all on function
  public.get_key_state(), public.setup_keys(jsonb), public.rotate_keys(integer, jsonb), public.put_wrap(jsonb),
  public.delete_wrap(text, text), public.push_records(jsonb), public.pull_records(bigint, integer),
  public.delete_my_account()
  from public, anon;
grant execute on function
  public.get_key_state(), public.setup_keys(jsonb), public.rotate_keys(integer, jsonb), public.put_wrap(jsonb),
  public.delete_wrap(text, text), public.push_records(jsonb), public.pull_records(bigint, integer),
  public.delete_my_account()
  to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
