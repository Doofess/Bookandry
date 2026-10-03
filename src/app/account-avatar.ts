import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';

import { useAccount, type AccountUser } from './account';
import { AVATAR_KEY, isStored, type StoredAvatar } from './avatar-store';

/**
 * The account's picture, as every screen shows it.
 *
 * This device keeps a copy of the uploaded picture in `meta` (device-local,
 * never exported or synced as a record), so it shows at once and offline; the
 * controller keeps the copy in step with the account's `avatarVersion`. With
 * no picture of its own, an account signed in with Google shows Google's,
 * and otherwise its initials.
 */

export type AvatarView = {
  /** The picture to show, when there is one. */
  readonly src: string | undefined;
  /** Up to two letters, for when there is not. Empty without an account. */
  readonly initials: string;
  readonly name: string | undefined;
  readonly email: string | undefined;
  /** Whether the account has a picture of its own (not Google's). */
  readonly uploaded: boolean;
};

export function initialsOf(name: string | undefined, email: string | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    const first = words[0] ?? '';
    const last = words.length > 1 ? (words[words.length - 1] ?? '') : '';
    return (Array.from(first)[0] ?? '') + (Array.from(last)[0] ?? '');
  }
  return Array.from(email ?? '')[0]?.toUpperCase() ?? '';
}

export function useAccountAvatar(): AvatarView {
  const view = useAccount();
  const user: AccountUser | undefined =
    view.status === 'signed_in' || view.status === 'second_step' ? view.user : undefined;
  const stored = useLiveQuery(async () => (await db.meta.get(AVATAR_KEY))?.value, []);
  const current =
    user?.avatarVersion !== undefined && isStored(stored) && stored.version === user.avatarVersion
      ? stored
      : undefined;
  const url = current === undefined ? undefined : urlFor(current);

  return {
    src: url ?? user?.picture,
    initials: initialsOf(user?.name, user?.email),
    name: user?.name,
    email: user?.email,
    uploaded: user?.avatarVersion !== undefined,
  };
}

/**
 * One object URL per picture version, for every avatar on screen: made the
 * first time a version is shown, released when a newer one replaces it.
 * Shared and idempotent, so any number of avatars - and React rendering them
 * twice - never make or leak more than one.
 */
let shown: { readonly version: number; readonly url: string } | undefined;

function urlFor(stored: StoredAvatar): string {
  if (shown?.version === stored.version) return shown.url;
  if (shown !== undefined) URL.revokeObjectURL(shown.url);
  shown = {
    version: stored.version,
    url: URL.createObjectURL(new Blob([stored.bytes], { type: stored.type })),
  };
  return shown.url;
}
