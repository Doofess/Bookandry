import type { CardIssuer, CardNetwork } from '@/types/domain';

/**
 * The banks', card companies' and networks' own logos, for the pickers and the
 * bank accounts screen.
 *
 * A bank is keyed by its catalog id - the Masav code - a card company by its
 * `CardIssuer` and a network by its `CardNetwork`. Amex, Diners and Isracard are
 * both a company and a network and have a file under each key, so that a key
 * maps to a file by name and nothing else.
 *
 * Local files, shown through <img>: an SVG rendered that way can neither run
 * script nor load anything, which matters for artwork from outside the project,
 * and they are precached with the rest of the app so they work offline. Where
 * each one came from is in src/assets/brands/SOURCES.md.
 */
export type BrandKey = `bank-${string}` | `issuer-${CardIssuer}` | `network-${CardNetwork}`;

const FILES: Readonly<Record<string, string>> = import.meta.glob<string>('/src/assets/brands/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** File name without its folder and extension: "bank-31-wordmark". */
const URLS = new Map(
  Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.svg'.length), url]),
);

/**
 * Banks shown by their wordmark rather than their mark.
 *
 * The FIBI group - FIBI, PAGI, Otsar HaHayal and Massad - share one yellow
 * zigzag, so only the name in the wordmark tells them apart. (U-Bank, also of
 * the group, has only a wordmark, which is its one file.) The choice lives
 * here so that no caller ever picks a variant.
 */
const WORDMARK: ReadonlySet<BrandKey> = new Set(['bank-31', 'bank-52', 'bank-14', 'bank-46']);

/** The URL of the logo the pickers show for a brand, or undefined when there is none. */
export function brandLogo(key: BrandKey): string | undefined {
  return URLS.get(WORDMARK.has(key) ? `${key}-wordmark` : key);
}

/** Each brand's own colour, as its logo prints it. */
const COLORS: Readonly<Partial<Record<BrandKey, string>>> = {
  'bank-10': '#0066FF', // Leumi
  'bank-12': '#F0000B', // Hapoalim
  'bank-20': '#F58220', // Mizrahi-Tefahot
  'bank-11': '#62A93B', // Discount
  'bank-17': '#2E6633', // Mercantile
  'bank-31': '#00529B', // FIBI
  'bank-52': '#002D6E', // PAGI
  'bank-14': '#00529C', // Otsar HaHayal
  'bank-26': '#004B87', // U-Bank
  'bank-46': '#004895', // Massad
  'bank-4': '#283D99', // Yahav
  'bank-18': '#000000', // One Zero
  'issuer-isracard': '#101820',
  'issuer-cal': '#1F5BBE',
  'issuer-max': '#000000',
  'issuer-amex': '#2E77BC',
  'issuer-diners': '#004C97',
  'network-visa': '#1A1F71',
  'network-mastercard': '#EB001B',
  'network-amex': '#2E77BC',
  'network-diners': '#004C97',
  'network-isracard': '#101820',
};

/**
 * The brand's own colour, for an accent beside its logo - never as the colour
 * of text, whose contrast stays the app's own. Undefined for a brand it does
 * not know.
 */
export function brandColor(key: BrandKey): string | undefined {
  return COLORS[key];
}
