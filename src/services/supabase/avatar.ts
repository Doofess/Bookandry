import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The account's profile picture, in Supabase Storage (the private `avatars`
 * bucket: supabase/migrations/20261003000000_avatars.sql).
 *
 * One file per account, always at the same path, replaced in place. Which
 * version is current is a number in the account's own metadata
 * (`avatar_version`, set as the picture is saved), so every device can tell
 * whether the copy it keeps is current without downloading anything; null
 * means there is no picture.
 */

const BUCKET = 'avatars';

const pathFor = (userId: string): string => `${userId}/avatar`;

/** Save a new picture (already squared and shrunk), and return its version. */
export async function uploadAvatar(
  supabase: SupabaseClient,
  userId: string,
  image: Blob,
  version: number,
): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(pathFor(userId), image, {
    upsert: true,
    contentType: image.type,
    cacheControl: '0',
  });
  if (error !== null) throw error;
  const { error: metaError } = await supabase.auth.updateUser({ data: { avatar_version: version } });
  if (metaError !== null) throw metaError;
}

export async function downloadAvatar(supabase: SupabaseClient, userId: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(pathFor(userId));
  if (error !== null) throw error;
  return data;
}

export async function removeAvatar(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([pathFor(userId)]);
  if (error !== null) throw error;
  const { error: metaError } = await supabase.auth.updateUser({ data: { avatar_version: null } });
  if (metaError !== null) throw metaError;
}
