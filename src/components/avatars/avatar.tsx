import { cn } from 'cn';

import type { AvatarKey } from '@/types/domain';

import { FACES, FALLBACK_FACE } from './faces';
import { AVATAR_SIZES, AVATAR_STROKE, type AvatarSize } from './sizes';

export type AvatarProps = {
  readonly avatar: AvatarKey;
  /** A hex from the curated palette. Drawn as the RING, never behind features. */
  readonly color: string;
  readonly size?: AvatarSize;
  /**
   * The profile's name. Omit for a decorative avatar sitting next to its own
   * name in text - a second announcement of "Dana" helps nobody.
   */
  readonly label?: string;
  readonly className?: string;
};

export function Avatar({ avatar, color, size = 'md', label, className }: AvatarProps) {
  const px = AVATAR_SIZES[size];
  const Face = FACES[avatar] ?? FALLBACK_FACE;
  const decorative = label === undefined;

  return (
    <svg
      viewBox="0 0 48 48"
      width={px}
      height={px}
      className={cn('shrink-0', className)}
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={label}
      focusable="false"
    >
      {/* Paper outer ring: keeps the coloured ring off an unknown background,
          so the palette never has to contrast with the page. */}
      <circle cx={24} cy={24} r={24} fill="var(--avatar-paper)" />
      <circle cx={24} cy={24} r={21.6} fill="none" stroke={color} strokeWidth={4.8} />
      {/* Face mass: always paper, whatever colour the ring is. */}
      <circle cx={24} cy={24} r={19.2} fill="var(--avatar-paper)" />
      <Face stroke={AVATAR_STROKE[size]} />
    </svg>
  );
}
