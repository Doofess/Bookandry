import type { BookandryDB } from '@/db/db';

/**
 * This device's copy of the account's picture, in `meta`: device-local, never
 * exported, never a synced record. Kept current by the account controller;
 * shown by useAccountAvatar (account-avatar.ts).
 */
export const AVATAR_KEY = 'accountAvatar';

export type StoredAvatar = { readonly version: number; readonly type: string; readonly bytes: ArrayBuffer };

export function isStored(value: unknown): value is StoredAvatar {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<StoredAvatar>;
  return typeof v.version === 'number' && typeof v.type === 'string' && v.bytes instanceof ArrayBuffer;
}

export async function readAvatarVersion(database: BookandryDB): Promise<number | undefined> {
  const row = await database.meta.get(AVATAR_KEY);
  return isStored(row?.value) ? row.value.version : undefined;
}

export async function storeAvatar(database: BookandryDB, version: number, image: Blob): Promise<void> {
  const value: StoredAvatar = { version, type: image.type, bytes: await image.arrayBuffer() };
  await database.meta.put({ key: AVATAR_KEY, value });
}

export async function forgetAvatar(database: BookandryDB): Promise<void> {
  await database.meta.delete(AVATAR_KEY);
}

/**
 * Linked accounts' pictures, one per account, the same way: device-local
 * copies, in step with the version each account publishes to the household.
 */
export const memberAvatarKey = (userId: string): string => `memberAvatar:${userId}`;

export async function readMemberAvatarVersion(
  database: BookandryDB,
  userId: string,
): Promise<number | undefined> {
  const row = await database.meta.get(memberAvatarKey(userId));
  return isStored(row?.value) ? row.value.version : undefined;
}

export async function storeMemberAvatar(
  database: BookandryDB,
  userId: string,
  version: number,
  image: Blob,
): Promise<void> {
  const value: StoredAvatar = { version, type: image.type, bytes: await image.arrayBuffer() };
  await database.meta.put({ key: memberAvatarKey(userId), value });
}

export async function forgetMemberAvatar(database: BookandryDB, userId: string): Promise<void> {
  await database.meta.delete(memberAvatarKey(userId));
}
