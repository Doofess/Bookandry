-- "Add with AI": a daily cap on reads, per person, so a stolen session or a
-- runaway client cannot run up the household's Anthropic bill.
--
-- Counted per call to the model, in Israel's day. A follow-up (a correction,
-- a continuation) may go a little past the cap, so a check already under way
-- finishes rather than leaving a half-read document. The tokens each call used
-- are kept beside the count: the only record of what reading costs.
--
-- Nothing of what was read is stored here, or anywhere.

create table private.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  calls integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, day)
);

alter table private.ai_usage enable row level security;
revoke all on private.ai_usage from public, anon, authenticated;

-- Reserve one call. Returns the day's count after it, or null at the cap.
create function public.ai_take_quota(p_followup boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  cap integer := case when p_followup then 80 else 60 end;
  taken integer;
begin
  insert into private.ai_usage as u (user_id, day, calls)
  values (uid, today, 1)
  on conflict (user_id, day) do update set calls = u.calls + 1
    where u.calls < cap
  returning u.calls into taken;
  return taken;
end
$$;

-- What the call just made used.
create function public.ai_record_tokens(p_input bigint, p_output bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  today date := (now() at time zone 'Asia/Jerusalem')::date;
begin
  if p_input < 0 or p_output < 0 or p_input > 10000000 or p_output > 1000000 then
    raise exception 'invalid_usage' using errcode = '22023';
  end if;
  update private.ai_usage
    set input_tokens = input_tokens + p_input, output_tokens = output_tokens + p_output
    where user_id = uid and day = today;
end
$$;

revoke all on function public.ai_take_quota(boolean), public.ai_record_tokens(bigint, bigint) from public, anon;
grant execute on function public.ai_take_quota(boolean), public.ai_record_tokens(bigint, bigint) to authenticated;
