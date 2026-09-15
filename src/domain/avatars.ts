import type { AvatarKey } from '@/types/domain';

/**
 * Every avatar, in picker order.
 *
 * Ordered by silhouette rather than alphabetically: the pointed ears, then the
 * round ears, then the ones with no ears at all. A picker sorted by name puts
 * `bear` next to `bunny` and `otter` next to `owl`, which is precisely the pair
 * a glance cannot separate.
 *
 * `satisfies` rather than a plain annotation, so adding a key to `AvatarKey`
 * without adding it here is a compile error rather than a face nobody can pick.
 */
export const ALL_AVATARS = [
  'fox',
  'cat',
  'bunny',
  'koala',
  'bear',
  'panda',
  'monkey',
  'otter',
  'sloth',
  'hedgehog',
  'owl',
  'duck',
  'penguin',
  'frog',
  'whale',
  'robot',
] as const satisfies readonly AvatarKey[];

/**
 * The defaults the first-run wizard cycles through.
 *
 * A short, deliberately varied prefix: the first four people added should look
 * obviously different from each other, which alphabetical order does not give.
 */
export const AVATAR_ROTATION: readonly AvatarKey[] = ['fox', 'owl', 'bear', 'cat'];
