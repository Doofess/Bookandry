-- Two-step sign-in, enforced where it counts: here.
--
-- A person who turns on authenticator-app codes expects the account to need
-- one. Supabase issues a session after the password (or Google) alone - at
-- assurance level aal1 - and only a verified code raises it to aal2. A screen
-- asking for the code is not the protection; a session at aal1 can call these
-- functions directly. So every function checks: an account with a verified
-- factor is served only to an aal2 session. Accounts without one are served as
-- before ("enforce only for users that have opted in", in Supabase's terms).

create or replace function private.require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
     and exists (select 1 from auth.mfa_factors f where f.user_id = uid and f.status = 'verified')
  then
    raise exception 'second_step_required' using errcode = '28000';
  end if;
  return uid;
end
$$;

-- The tables were readable directly under row-level security. Nothing in the
-- app reads them that way - every read goes through the functions above - and
-- a direct read would skip the second step. So no one reads them directly.
revoke select on table public.user_state, public.user_keys, public.records from authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
