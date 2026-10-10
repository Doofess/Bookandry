import type { SeedLanguage } from './seed';

/**
 * The widths the Colour of money redesign is measured at (§13.3): a phone, a
 * laptop and a large desktop, plus the narrowest phone still sold and the
 * window where the desktop layout starts.
 */
export const LAYOUT_WIDTHS = [390, 1440, 1920] as const;
export const EDGE_WIDTHS = [320, 1024] as const;

/** Language and browser locale together, so a Hebrew screen is in shekels (see screens.spec.ts). */
export const LANGUAGES: readonly { readonly lang: SeedLanguage; readonly locale: string }[] = [
  { lang: 'en', locale: 'en-US' },
  { lang: 'he', locale: 'he-IL' },
];

/** Every screen the shell reaches. */
export const APP_ROUTES = [
  '/',
  '/chart',
  '/cards',
  '/cash',
  '/bank-accounts',
  '/categories',
  '/commitments',
  '/settings',
] as const;

/** A phone is held upright; a desktop window is 1000px tall. */
export function viewportFor(width: number): { width: number; height: number } {
  return { width, height: width < 1024 ? 844 : 1000 };
}
