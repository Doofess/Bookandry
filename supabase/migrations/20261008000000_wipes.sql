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
  -- Lock the space first: push_records holds this row for its whole run, so the
  -- delete below then sees every push already in flight, and later pushes see
  -- the raised epoch.
  perform 1 from public.user_state where user_id = target for update;
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
  if coalesce(p_epoch, 0) < st.epoch then
    raise exception 'wiped' using errcode = '55000';
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

-- As before, and it now reports the space's epoch.
create or replace function public.pull_records(p_cursor bigint, p_limit integer, p_space uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  target uuid := private.require_space(p_space);
  last_seq bigint;
  last_push bigint;
  page jsonb;
  epoch_now integer;
begin
  select coalesce((select s.epoch from public.user_state s where s.user_id = target), 0) into epoch_now;

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
    return jsonb_build_object('records', '[]'::jsonb, 'cursor', p_cursor, 'hasMore', false, 'epoch', epoch_now);
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
    'epoch', epoch_now,
    'cursor', last_seq,
    'hasMore', exists (select 1 from public.records rec where rec.user_id = target and rec.seq > last_seq));
end
$$;

revoke all on function public.wipe_my_data(), public.push_records(jsonb, uuid, integer) from public, anon;
grant execute on function public.wipe_my_data(), public.push_records(jsonb, uuid, integer) to authenticated;

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

-- Returns each other member's one-time token, not their address: members share
-- no email beyond the one an inviter typed. The mailer looks addresses up itself.
-- The requester is named here, by the server: a name the client sent could pose as anyone.
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
  begin
    insert into public.wipe_requests (household_id, requested_by, member_ids) values (hid, uid, members)
    returning id into rid;
  exception when unique_violation then
    raise exception 'wipe_pending' using errcode = '55000';
  end;

  for m in
    select hm.user_id from public.household_members hm
     where hm.household_id = hid and hm.user_id <> uid
  loop
    token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.wipe_confirmations (request_id, user_id, token_hash)
    values (rid, m.user_id, private.token_hash(token));
    asks := asks || jsonb_build_object('userId', m.user_id, 'token', token);
  end loop;
  return jsonb_build_object('id', rid, 'asks', asks, 'requesterName',
    coalesce((select display_name from public.household_members where user_id = uid), ''));
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

-- 'waiting', 'done', or 'cancelled' (the household changed since the request).
create function public.confirm_wipe(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  c public.wipe_confirmations := private.open_confirmation(p_token, private.require_user());
  r public.wipe_requests;
  now_members uuid[];
  member uuid;
begin
  -- Lock the request first: the last two confirmers must take turns, so the
  -- second sees the first's confirmation. open_confirmation ran before the
  -- lock, so the request, or this answer, may have changed meanwhile.
  select * into r from public.wipe_requests where id = c.request_id for update;
  if r.status <> 'pending' or not exists (
    select 1 from public.wipe_confirmations
     where request_id = c.request_id and user_id = c.user_id
       and confirmed_at is null and declined_at is null)
  then
    raise exception 'wipe_invalid' using errcode = '22023';
  end if;

  update public.wipe_confirmations set confirmed_at = now()
   where request_id = c.request_id and user_id = c.user_id;
  if exists (select 1 from public.wipe_confirmations
              where request_id = c.request_id and confirmed_at is null) then
    return 'waiting';
  end if;

  select array_agg(user_id order by user_id) into now_members
    from public.household_members where household_id = r.household_id;
  if now_members is distinct from r.member_ids then
    update public.wipe_requests set status = 'cancelled' where id = r.id;
    return 'cancelled';
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
declare
  c public.wipe_confirmations := private.open_confirmation(p_token, private.require_user());
  r public.wipe_requests;
begin
  -- Same lock and re-checks as confirm_wipe.
  select * into r from public.wipe_requests where id = c.request_id for update;
  if r.status <> 'pending' or not exists (
    select 1 from public.wipe_confirmations
     where request_id = c.request_id and user_id = c.user_id
       and confirmed_at is null and declined_at is null)
  then
    raise exception 'wipe_invalid' using errcode = '22023';
  end if;
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

-- For the mailer only (service_role): a request whose emails never went out is
-- removed, not cancelled, so it does not count against the hourly limit and
-- "Try again" works. Its confirmations go with it. Once any email has gone out,
-- the mailer cancels instead (cancel_wipe), and the limit stands.
create function public.discard_wipe(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.wipe_requests where id = p_id and status = 'pending'
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
revoke all on function public.discard_wipe(uuid) from public, anon, authenticated;
grant execute on function public.discard_wipe(uuid) to service_role;
