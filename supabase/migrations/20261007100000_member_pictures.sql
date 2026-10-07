-- Linked accounts see each other's Google picture.
--
-- A member's picture reached the others only when uploaded to Bookandry
-- (avatar_version, a file in storage they may read). An account signed in with
-- Google and no upload of its own showed Google's picture to itself - and its
-- initials to everyone else: the picture's address lives in the account's own
-- sign-in details, which no other account can read. Now the member says it,
-- like its name: only an address on Google's image host, and only while linked.

alter table public.household_members
  add column picture_url text
  check (picture_url is null or (length(picture_url) <= 500
         and picture_url ~ '^https://lh3\.googleusercontent\.com/[A-Za-z0-9/_=.-]+$'));

-- The old two-argument form stays for an app from before; it leaves the picture as it is.
create function public.set_my_member(p_display_name text, p_avatar_version integer, p_picture_url text)
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user();
begin
  if p_display_name is null or length(p_display_name) > 80
     or p_avatar_version is null or p_avatar_version < 0
     or (p_picture_url is not null and (length(p_picture_url) > 500
         or p_picture_url !~ '^https://lh3\.googleusercontent\.com/[A-Za-z0-9/_=.-]+$'))
  then
    raise exception 'malformed_member' using errcode = '22023';
  end if;
  update public.household_members
     set display_name = p_display_name, avatar_version = p_avatar_version, picture_url = p_picture_url
   where user_id = uid;
end
$$;

create or replace function public.household() returns jsonb
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
               'avatarVersion', m.avatar_version, 'pictureUrl', m.picture_url, 'joinedAt', m.joined_at)
             order by m.joined_at, m.user_id)
        from public.household_members m where m.household_id = hid),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'expiresAt', i.expires_at)
             order by i.created_at)
        from public.household_invites i
       where i.household_id = hid and i.expires_at > now()), '[]'::jsonb));
end
$$;

revoke all on function public.set_my_member(text, integer, text) from public, anon;
grant execute on function public.set_my_member(text, integer, text) to authenticated;
