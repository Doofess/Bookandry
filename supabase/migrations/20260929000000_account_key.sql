-- The account holds the key.
--
-- Until now the data key existed on the server only wrapped under secrets the
-- person held - a sync passphrase and a recovery key - so nobody at the server
-- could read a thing, and nobody could get back in without one of them. That
-- asked too much of people for a household ledger: signing in (with MFA or a
-- passkey protecting the account) is meant to be enough.
--
-- So an account now holds its data key itself, in an 'account' entry that only
-- the signed-in owner can read. Records are still sealed with it - the server
-- stores ciphertext, blinded ids and authenticated revs exactly as before - but
-- the protection is now the account's, not a secret only the person knows:
-- whoever can read this table (the project's operators, or a breach of the
-- database) can read the key, and with it the data. The README says so.
--
-- The passphrase and recovery kinds stay valid, so an account can still add a
-- secret-held way in later if that is ever wanted again.

alter table public.user_keys drop constraint user_keys_kind_check;
alter table public.user_keys
  add constraint user_keys_kind_check check (kind in ('passkey', 'recovery', 'passphrase', 'account'));

-- 'account': the data key itself, base64url, 32 bytes. No salt, no IV: there
-- is nothing to derive a wrapping key from, and pretending otherwise would be
-- decoration. It is exactly as private as this row.
create or replace function private.check_wrap(w jsonb, version integer) returns void
language plpgsql immutable set search_path = '' as $$
declare kdf jsonb := w -> 'kdf';
begin
  if jsonb_typeof(w) is distinct from 'object'
     or w ->> 'kind' is null
     or w ->> 'kind' not in ('passkey', 'recovery', 'passphrase', 'account')
     or jsonb_typeof(w -> 'keyVersion') is distinct from 'number'
     or (w ->> 'keyVersion') !~ '^[0-9]{1,9}$'
     or (w ->> 'keyVersion')::integer <> version
  then
    raise exception 'malformed_wrap' using errcode = '22023';
  end if;

  if w ->> 'kind' = 'account' then
    if w ->> 'id' is distinct from 'account'
       or coalesce(w ->> 'salt', 'x') <> ''
       or coalesce(w ->> 'iv', 'x') <> ''
       or coalesce(w ->> 'ct', '') !~ '^[A-Za-z0-9_-]{43}$'
       or kdf is not null
    then
      raise exception 'malformed_wrap' using errcode = '22023';
    end if;
    return;
  end if;

  if coalesce(w ->> 'salt', '') !~ '^[A-Za-z0-9_-]{22}$'
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

-- A key set must leave a way back in that does not depend on one device: the
-- account's own entry, or a recovery key. At most one of each.
create or replace function private.replace_wraps(uid uuid, wraps jsonb, version integer) returns void
language plpgsql set search_path = '' as $$
declare
  w jsonb;
  recovery integer;
  account integer;
begin
  if jsonb_typeof(wraps) is distinct from 'array'
     or jsonb_array_length(wraps) = 0
     or jsonb_array_length(wraps) > private.limits('wraps_per_user')
  then
    raise exception 'malformed_wrap' using errcode = '22023';
  end if;
  select count(*) filter (where e.value ->> 'kind' = 'recovery'),
         count(*) filter (where e.value ->> 'kind' = 'account')
    into recovery, account
    from jsonb_array_elements(wraps) e;
  if recovery > 1 or account > 1 or recovery + account = 0 then
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

-- Neither the account's entry nor the recovery key can be removed one at a
-- time; a new key set (rotate_keys) replaces them together.
create or replace function public.delete_wrap(p_kind text, p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user();
begin
  if p_kind in ('recovery', 'account') then
    raise exception 'recovery_wrap_required' using errcode = '22023';
  end if;
  delete from public.user_keys where user_id = uid and kind = p_kind and id = p_id;
end
$$;

-- `create or replace` keeps existing grants, but say it again: nothing here is
-- anyone's but the signed-in owner's.
revoke all on function public.delete_wrap(text, text) from public, anon;
grant execute on function public.delete_wrap(text, text) to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
