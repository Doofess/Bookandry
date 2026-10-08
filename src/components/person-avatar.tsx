import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';

import { useAccount } from '@/app/account';
import { initialsOf, useAccountAvatar } from '@/app/account-avatar';
import { isStored, memberAvatarKey, type StoredAvatar } from '@/app/avatar-store';
import { db } from '@/db/db';

/**
 * A person of the household, as a round picture: their account's picture
 * when they are a linked account that has one - uploaded, else Google's -
 * else their initials on their colour. This account's own person shows the account's picture (its own
 * upload, else Google's).
 *
 * Decorative unless given a `label`: whatever sits next to it carries the name.
 */
const PERSON_SIZES = { sm: 32, md: 44, lg: 72 } as const;
export type PersonSize = keyof typeof PERSON_SIZES;

export type PersonLike = { readonly id: string; readonly name: string; readonly color: string };

export function PersonAvatar({
  person,
  size = 'md',
  label,
  className,
}: {
  readonly person: PersonLike;
  readonly size?: PersonSize;
  readonly label?: string;
  readonly className?: string;
}) {
  const view = useAccount();
  const me = view.status === 'signed_in' ? view.user.id : undefined;
  const own = useAccountAvatar();
  const stored = useLiveQuery(
    async () => (await db.meta.get(memberAvatarKey(person.id)))?.value,
    [person.id],
  );
  // Another member: the picture they uploaded, else Google's, which they share with the household.
  const google =
    view.status === 'signed_in'
      ? view.household?.members.find((m) => m.userId === person.id)?.pictureUrl
      : undefined;
  const src = person.id === me ? own.src : isStored(stored) ? urlFor(person.id, stored) : google;
  const px = PERSON_SIZES[size];
  const initials = initialsOf(person.name, undefined);

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none',
        className,
      )}
      style={{ width: px, height: px, backgroundColor: person.color, fontSize: Math.round(px * 0.4) }} // money-allow: a font size in pixels
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      data-person={person.id}
    >
      {src === undefined ? (
        <span aria-hidden="true">{initials}</span>
      ) : (
        <img src={src} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
      )}
    </span>
  );
}

/** One object URL per person and picture version, shared by every avatar on screen. */
const shown = new Map<string, { readonly version: number; readonly url: string }>();

function urlFor(id: string, stored: StoredAvatar): string {
  const current = shown.get(id);
  if (current?.version === stored.version) return current.url;
  if (current !== undefined) URL.revokeObjectURL(current.url);
  const url = URL.createObjectURL(new Blob([stored.bytes], { type: stored.type }));
  shown.set(id, { version: stored.version, url });
  return url;
}
