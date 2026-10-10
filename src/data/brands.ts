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
