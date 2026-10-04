-- One cap for every call.
--
-- The first version allowed "follow-up" calls (a correction, a continuation)
-- past the cap, so a check under way could finish. But whether a call is a
-- follow-up is the caller's say-so - the function is stateless - so anyone
-- could mark every call as one and read past the cap. A cap the caller can
-- raise is not a cap: every call now counts against the same 80.
create or replace function public.ai_take_quota(p_followup boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  taken integer;
begin
  insert into private.ai_usage as u (user_id, day, calls)
  values (uid, today, 1)
  on conflict (user_id, day) do update set calls = u.calls + 1
    where u.calls < 80
  returning u.calls into taken;
  return taken;
end
$$;
