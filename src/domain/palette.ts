/**
 * The profile colour palette.
 *
 * A domain constant, not a database seed: colour uniqueness across profiles is
 * what caps the app at twelve, so the palette IS the limit rather than a
 * decoration stored alongside one. The first-run wizard needs it before any
 * database write happens, and `domain/` cannot reach into `@/db`.
 *
 * Every swatch is dark enough to carry white text and to read as a ring against
 * both themes. Names are i18n keys; the hex is the stored value.
 */
/**
 * `as const`, not a type annotation, so `nameKey` keeps its literal type.
 * i18next's typed `t()` only accepts a known key, and a widened `string`
 * would force a cast at every call site - which is the same as not having the
 * key check at all.
 */
export const PROFILE_PALETTE = [
  { hex: '#16794a', nameKey: 'profiles:color.emerald' },
  { hex: '#0f766e', nameKey: 'profiles:color.teal' },
  { hex: '#0369a1', nameKey: 'profiles:color.ocean' },
  { hex: '#4338ca', nameKey: 'profiles:color.indigo' },
  { hex: '#7e22ce', nameKey: 'profiles:color.violet' },
  { hex: '#a21caf', nameKey: 'profiles:color.orchid' },
  { hex: '#be123c', nameKey: 'profiles:color.ruby' },
  { hex: '#c2410c', nameKey: 'profiles:color.ember' },
  { hex: '#a16207', nameKey: 'profiles:color.amber' },
  { hex: '#4d7c0f', nameKey: 'profiles:color.olive' },
  { hex: '#57534e', nameKey: 'profiles:color.stone' },
  { hex: '#1e293b', nameKey: 'profiles:color.slate' },
] as const satisfies readonly { hex: string; nameKey: string }[];

/** Twelve, because that is how many distinct colours the palette holds. */
export const MAX_PROFILES = PROFILE_PALETTE.length;

export type ColorNameKey = (typeof PROFILE_PALETTE)[number]['nameKey'];

export function colorNameKey(hex: string): ColorNameKey | undefined {
  return PROFILE_PALETTE.find((c) => c.hex === hex)?.nameKey;
}

/** The first palette colour nobody in `taken` is using. */
export function nextFreeColor(taken: readonly string[]): string | undefined {
  const used = new Set(taken);
  return PROFILE_PALETTE.find((c) => !used.has(c.hex))?.hex;
}
