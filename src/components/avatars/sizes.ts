export const AVATAR_SIZES = { sm: 32, md: 44, lg: 72 } as const;
export type AvatarSize = keyof typeof AVATAR_SIZES;

/**
 * Stroke weight is STEPPED, not scaled.
 *
 * The viewBox is 48 units wide whatever the rendered size, so a constant stroke
 * shrinks with the avatar: 2 units at 32px renders as 1.33 CSS pixels, which on
 * a non-retina screen is a grey smear rather than a line. Small avatars get
 * proportionally heavier strokes so they read at every size.
 */
export const AVATAR_STROKE: Record<AvatarSize, number> = { sm: 3, md: 2.4, lg: 2 };
