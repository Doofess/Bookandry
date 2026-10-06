-- Linked accounts: a household of up to ten accounts that see and edit each
-- other's data.
--
-- Nothing moves when accounts link. Every account keeps its records in its
-- own space - records.user_id, exactly as before - sealed with its own key.
-- Linking grants the other members access: the record functions take the
-- space to read or write (p_space, defaulting to the caller's own), and serve
-- another member's as readily as the caller's. Leaving, or being removed,
-- ends that access at once, and each account is left with exactly its own
-- space: "each keeps only their own" is the shape of the data, not a step
-- that has to succeed.
--
-- What members share is the household's data and nothing account-related:
-- never sign-in, passkeys, the second step, an email address (beyond the one
-- an inviter typed), or the account's other ways in to its key - another
-- member is handed the account's own key entry and nothing else.
--
-- The link is confirmed by email: an invite is a single-use token, held here
-- only as its SHA-256, mailed to the address by the send-invite function, and
-- accepted only by a signed-in account whose confirmed email is that address.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.households (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id   uuid not null references public.households (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  role           text not null check (role in ('owner', 'member')),
  -- What the other members call this account; the account sets it itself.
  display_name   text not null default '' check (length(display_name) <= 80),
  -- Bumped when the account's picture changes, so the others fetch it again.
  avatar_version integer not null default 0 check (avatar_version >= 0),
  joined_at      timestamptz not null default clock_timestamp(),
  primary key (household_id, user_id)
);

-- One household per account.
create unique index household_members_one_each on public.household_members (user_id);

create table public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  inviter      uuid not null references auth.users (id) on delete cascade,
  email        text not null,
  -- The household's currency when invited: the invitee converts to it first.
  currency     text not null check (currency ~ '^[A-Z]{3}$'),
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  unique (household_id, email)
);

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

-- Read and written only through the functions below.
revoke all on table public.households, public.household_members, public.household_invites
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.limits(name text) returns bigint
language sql immutable set search_path = '' as $$
  select case name
    when 'records_per_push'     then 500
    when 'ct_chars'             then 65536
    when 'push_chars'           then 4194304
    when 'records_per_user'     then 100000
    when 'bytes_per_user'       then 52428800
    when 'wraps_per_user'       then 20
    when 'pull_limit'           then 1000
    when 'household_members'    then 10
    when 'household_invites'    then 10
    when 'invites_per_day'      then 20
  end::bigint
$$;

-- Whether `uid` may read and write `space`: its own, or a fellow member's.
create function private.can_reach(uid uuid, space uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select space = uid or exists (
    select 1
      from public.household_members a
      join public.household_members b on b.household_id = a.household_id
     where a.user_id = uid and b.user_id = space)
$$;

-- The space a record function acts on: the one asked for, if the caller may.
create function private.require_space(space uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  target uuid := coalesce(space, uid);
begin
  if not private.can_reach(uid, target) then
    raise exception 'not_linked' using errcode = '42501';
  end if;
  return target;
end
$$;

create function private.token_hash(token text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(coalesce(token, ''), 'UTF8')), 'hex')
$$;

-- After someone leaves: a household needs an owner while it has members, and
-- stops existing once one account is left with nobody invited - a household
-- of one is just an account.
create function private.tidy_household(hid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare members integer;
begin
  select count(*) into members from public.household_members where household_id = hid;
  if members = 0
     or (members = 1 and not exists (select 1 from public.household_invites where household_id = hid))
  then
    delete from public.households where id = hid;
    return;
  end if;
  if not exists (select 1 from public.household_members where household_id = hid and role = 'owner') then
    update public.household_members set role = 'owner'
     where household_id = hid
       and user_id = (select m.user_id from public.household_members m
                       where m.household_id = hid order by m.joined_at, m.user_id limit 1);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Records and keys, now for any space the caller can reach
-- ---------------------------------------------------------------------------

drop function public.get_key_state();
drop function public.push_records(jsonb);
drop function public.pull_records(bigint, integer);

-- For the caller's own space: the key version and every way in to it. For a
-- fellow member's: the version and the account's own key entry only - never
-- its passkeys or passphrase, which are the account's, not the household's.
create function public.get_key_state(p_space uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  target uuid := private.require_space(p_space);
begin
  return jsonb_build_object(
    'keyVersion', coalesce((select s.key_version from public.user_state s where s.user_id = target), 0),
    'wraps', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', k.kind, 'id', k.id, 'keyVersion', k.key_version,
               'salt', k.salt, 'iv', k.iv, 'ct', k.ct, 'kdf', k.kdf) order by k.kind, k.id)
        from public.user_keys k
       where k.user_id = target and (target = uid or k.kind = 'account')), '[]'::jsonb));
end
$$;

-- As before (20260927000000_sync.sql), into the space asked for.
create function public.push_records(p_records jsonb, p_space uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target uuid := private.require_space(p_space);
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

  select * into st from public.user_state where user_id = target for update;
  if not found or st.key_version = 0 then
    raise exception 'keys_not_set_up' using errcode = '55000';
  end if;

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
      from public.records rec where rec.user_id = target and rec.rid = r ->> 'rid';

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
      values (target, r ->> 'rid', incoming, st.seq, push, st.key_version, r ->> 'iv', r ->> 'ct')
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
    raise exception 'quota_exceeded' using errcode = '54000';
  end if;

  update public.user_state
     set seq = st.seq,
         push_count = case when stored_any then push else push_count end,
         record_count = st.record_count,
         bytes_used = st.bytes_used
   where user_id = target;
  return results;
end
$$;

-- As before, from the space asked for.
create function public.pull_records(p_cursor bigint, p_limit integer, p_space uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  target uuid := private.require_space(p_space);
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
           where rec.user_id = target and rec.seq > p_cursor
           order by rec.seq limit p_limit) s
   order by s.seq desc limit 1;

  if last_seq is null then
    return jsonb_build_object('records', '[]'::jsonb, 'cursor', p_cursor, 'hasMore', false);
  end if;

  select coalesce(max(rec.seq), last_seq) into last_seq
    from public.records rec
   where rec.user_id = target and rec.push_id = last_push and rec.seq > last_seq;

  select coalesce(jsonb_agg(jsonb_build_object(
           'rid', rec.rid, 'rev', rec.rev, 'keyVersion', rec.key_version,
           'iv', rec.iv, 'ct', rec.ct) order by rec.seq), '[]'::jsonb)
    into page
    from public.records rec
   where rec.user_id = target and rec.seq > p_cursor and rec.seq <= last_seq;

  return jsonb_build_object(
    'records', page,
    'cursor', last_seq,
    'hasMore', exists (select 1 from public.records rec where rec.user_id = target and rec.seq > last_seq));
end
$$;

-- ---------------------------------------------------------------------------
-- The household
-- ---------------------------------------------------------------------------

-- The caller's household, or null: who is in it and who has been invited.
create function public.household() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  hid uuid;
begin
  select m.household_id into hid from public.household_members m where m.user_id = uid;
  if hid is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', hid,
    'members', (
      select jsonb_agg(jsonb_build_object(
               'userId', m.user_id, 'role', m.role, 'displayName', m.display_name,
               'avatarVersion', m.avatar_version, 'joinedAt', m.joined_at)
             order by m.joined_at, m.user_id)
        from public.household_members m where m.household_id = hid),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'expiresAt', i.expires_at)
             order by i.created_at)
        from public.household_invites i
       where i.household_id = hid and i.expires_at > now()), '[]'::jsonb));
end
$$;

-- What the account calls itself to the others, and its picture's version.
create function public.set_my_member(p_display_name text, p_avatar_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user();
begin
  if p_display_name is null or length(p_display_name) > 80
     or p_avatar_version is null or p_avatar_version < 0
  then
    raise exception 'malformed_member' using errcode = '22023';
  end if;
  update public.household_members
     set display_name = p_display_name, avatar_version = p_avatar_version
   where user_id = uid;
end
$$;

-- An invitation to join the caller's household, for one email address. The
-- caller's household is made here if it has none yet. Returns the token, once;
-- only its hash is kept. Inviting the same address again replaces the old
-- invitation, whose link then stops working.
create function public.create_invite(p_email text, p_currency text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  address text := lower(trim(coalesce(p_email, '')));
  hid uuid;
  token text;
  invite public.household_invites%rowtype;
begin
  if length(address) > 254 or address !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or coalesce(p_currency, '') !~ '^[A-Z]{3}$'
  then
    raise exception 'malformed_invite' using errcode = '22023';
  end if;
  if address = lower(coalesce((select u.email from auth.users u where u.id = uid), '')) then
    raise exception 'invite_self' using errcode = '22023';
  end if;
  if (select count(*) from public.household_invites i
       where i.inviter = uid and i.created_at > now() - interval '1 day')
     >= private.limits('invites_per_day')
  then
    raise exception 'too_many_invites' using errcode = '54000';
  end if;

  select m.household_id into hid from public.household_members m where m.user_id = uid;
  if hid is null then
    insert into public.households default values returning id into hid;
    insert into public.household_members (household_id, user_id, role) values (hid, uid, 'owner');
  end if;

  if exists (select 1 from public.household_members m join auth.users u on u.id = m.user_id
              where m.household_id = hid and lower(u.email) = address)
  then
    raise exception 'already_member' using errcode = '23505';
  end if;
  if (select count(*) from public.household_members where household_id = hid)
     >= private.limits('household_members')
  then
    raise exception 'household_full' using errcode = '54000';
  end if;

  delete from public.household_invites
   where household_id = hid and (email = address or expires_at <= now());
  if (select count(*) from public.household_invites where household_id = hid)
     >= private.limits('household_invites')
  then
    raise exception 'too_many_invites' using errcode = '54000';
  end if;

  -- 244 random bits, from the two version-4 uuids.
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.household_invites (household_id, inviter, email, currency, token_hash)
  values (hid, uid, address, p_currency, private.token_hash(token))
  returning * into invite;

  return jsonb_build_object('id', invite.id, 'token', token, 'expiresAt', invite.expires_at);
end
$$;

-- The pending invitation a token names, if it is for the signed-in caller.
create function private.invite_for(uid uuid, token text) returns public.household_invites
language plpgsql stable security definer set search_path = '' as $$
declare
  invite public.household_invites%rowtype;
  address text;
begin
  select * into invite from public.household_invites i
   where i.token_hash = private.token_hash(token) and i.expires_at > now();
  if not found then
    raise exception 'invite_invalid' using errcode = '22023';
  end if;
  select lower(u.email) into address from auth.users u
   where u.id = uid and u.email_confirmed_at is not null;
  if address is distinct from invite.email then
    raise exception 'invite_wrong_account' using errcode = '42501';
  end if;
  return invite;
end
$$;

-- What the invitee is asked to confirm: who is inviting them, into how many,
-- and the currency the household keeps its books in.
create function public.peek_invite(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  invite public.household_invites%rowtype := private.invite_for(uid, p_token);
begin
  return jsonb_build_object(
    'inviterName', coalesce((select m.display_name from public.household_members m
                              where m.user_id = invite.inviter and m.household_id = invite.household_id), ''),
    'members', (select count(*) from public.household_members m where m.household_id = invite.household_id),
    'currency', invite.currency,
    'alreadyMember', exists (select 1 from public.household_members m
                              where m.user_id = uid and m.household_id = invite.household_id),
    'linkedElsewhere', exists (select 1 from public.household_members m
                                where m.user_id = uid and m.household_id <> invite.household_id
                                  and (select count(*) from public.household_members o
                                        where o.household_id = m.household_id) > 1));
end
$$;

-- Join. The caller must already keep its books in the household's currency
-- (`p_currency` is the caller saying so): every member's amounts are in one
-- currency, and converting is the invitee's to do, before joining.
create function public.accept_invite(p_token text, p_currency text, p_display_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  invite public.household_invites%rowtype := private.invite_for(uid, p_token);
  current_hid uuid;
begin
  if p_currency is distinct from invite.currency then
    raise exception 'currency_mismatch' using errcode = '22023';
  end if;
  if p_display_name is null or length(p_display_name) > 80 then
    raise exception 'malformed_member' using errcode = '22023';
  end if;

  select m.household_id into current_hid from public.household_members m where m.user_id = uid;
  if current_hid = invite.household_id then
    delete from public.household_invites where id = invite.id;
    return public.household();
  end if;
  if current_hid is not null then
    if (select count(*) from public.household_members where household_id = current_hid) > 1 then
      raise exception 'already_linked' using errcode = '55000';
    end if;
    -- A household of one, waiting on invitations of its own: it gives way.
    delete from public.households where id = current_hid;
  end if;
  if (select count(*) from public.household_members where household_id = invite.household_id)
     >= private.limits('household_members')
  then
    raise exception 'household_full' using errcode = '54000';
  end if;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (invite.household_id, uid, 'member', p_display_name);
  delete from public.household_invites where id = invite.id;
  return public.household();
end
$$;

create function public.decline_invite(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  invite public.household_invites%rowtype := private.invite_for(uid, p_token);
begin
  delete from public.household_invites where id = invite.id;
  perform private.tidy_household(invite.household_id);
end
$$;

-- Any member may take back an invitation the household sent.
create function public.revoke_invite(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  hid uuid;
begin
  select m.household_id into hid from public.household_members m where m.user_id = uid;
  delete from public.household_invites where id = p_id and household_id = hid;
  if hid is not null then
    perform private.tidy_household(hid);
  end if;
end
$$;

-- Unlink: the caller leaves. From now on it reaches only its own space, and
-- the others only theirs - each keeps its own.
create function public.leave_household() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  hid uuid;
begin
  delete from public.household_members where user_id = uid returning household_id into hid;
  if hid is not null then
    perform private.tidy_household(hid);
  end if;
end
$$;

-- The household's owner unlinks another member.
create function public.remove_member(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  hid uuid;
begin
  select m.household_id into hid from public.household_members m
   where m.user_id = uid and m.role = 'owner';
  if hid is null or p_user is null or p_user = uid then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  delete from public.household_members where household_id = hid and user_id = p_user;
  perform private.tidy_household(hid);
end
$$;

-- Deleting an account leaves its household first, so the others are not left
-- in a household of one.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  hid uuid;
begin
  delete from public.household_members where user_id = uid returning household_id into hid;
  if hid is not null then
    perform private.tidy_household(hid);
  end if;
  delete from auth.users where id = uid;
end
$$;

-- ---------------------------------------------------------------------------
-- Pictures: members see each other's
-- ---------------------------------------------------------------------------

-- Whether the caller shares a household with the account named by a folder.
-- Text, not uuid: a folder name is whatever someone uploaded under.
create function private.shares_household(folder text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.household_members a
      join public.household_members b on b.household_id = a.household_id
     where a.user_id = auth.uid() and b.user_id::text = folder)
$$;

revoke all on function private.shares_household(text) from public, anon;
grant execute on function private.shares_household(text) to authenticated;

create policy "avatars: read household" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars'
         and (select private.account_open())
         and private.shares_household((storage.foldername(name))[1]));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function
  public.get_key_state(uuid), public.push_records(jsonb, uuid), public.pull_records(bigint, integer, uuid),
  public.household(), public.set_my_member(text, integer), public.create_invite(text, text),
  public.peek_invite(text), public.accept_invite(text, text, text), public.decline_invite(text),
  public.revoke_invite(uuid), public.leave_household(), public.remove_member(uuid),
  public.delete_my_account()
  from public, anon;
grant execute on function
  public.get_key_state(uuid), public.push_records(jsonb, uuid), public.pull_records(bigint, integer, uuid),
  public.household(), public.set_my_member(text, integer), public.create_invite(text, text),
  public.peek_invite(text), public.accept_invite(text, text, text), public.decline_invite(text),
  public.revoke_invite(uuid), public.leave_household(), public.remove_member(uuid),
  public.delete_my_account()
  to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.account_open(), private.shares_household(text) to authenticated;
