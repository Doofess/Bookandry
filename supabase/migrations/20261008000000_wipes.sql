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
