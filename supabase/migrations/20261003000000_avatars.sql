-- Profile pictures.
--
-- One small square image per account, in Supabase Storage: the private
-- `avatars` bucket, one folder per account, named by the account's id. Only
-- the account itself can read, add, replace or remove what is in its folder,
-- and - as everywhere else - only once the second step is done, for an account
-- that has one (see 20260930000000_second_step.sql). The picture is resized
-- in the browser before it is sent (256 x 256), so the limit below is a
-- backstop, not the plan.
--
-- No one else ever sees it: the app shows it only to the account it belongs
-- to, through a signed-in download, never a public URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- private.require_user() raises, which a policy cannot use; this asks the same
-- question and answers it. Security definer: it reads auth.mfa_factors, which
-- the caller cannot.
create or replace function private.account_open() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and (coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
          or not exists (select 1 from auth.mfa_factors f
                         where f.user_id = auth.uid() and f.status = 'verified'))
$$;

-- Policies run as the caller, so the caller must be able to reach the
-- function: usage on the schema (it holds no tables a caller could read) and
-- execute on this one function only - every other function in it stays
-- revoked.
grant usage on schema private to authenticated;
revoke all on function private.account_open() from public, anon;
grant execute on function private.account_open() to authenticated;

create policy "avatars: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and (select private.account_open()));

create policy "avatars: add own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select private.account_open()));

create policy "avatars: replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and (select private.account_open()))
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select private.account_open()));

create policy "avatars: remove own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and (select private.account_open()));
