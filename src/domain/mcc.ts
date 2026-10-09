export { isMcc } from './mcc-codes';

/**
 * Business types - Merchant Category Codes - by name, and found by search.
 *
 * Pure: the list is handed in. Its names are their own chunk
 * (src/data/mcc.json, loaded by src/services/mcc/mcc-list.ts), while the
 * codes alone are synchronous (`isMcc`, ./mcc-codes.ts), because schemas and
 * cleaners check a code without waiting for names. A code is always a
 * four-digit string: "0742" keeps its zero.
 */

/** One business type: its code, and its name in each language. */
export type MccEntry = { readonly code: string; readonly en: string; readonly he: string };

export type MccList = readonly MccEntry[];

/**
 * The shape a synced or imported row's code is held to. Whether the list has
 * it is `isMcc`: a later build's list may have codes this one does not, and
 * a row carrying one must not be refused for it.
 */
export const MCC_SHAPE = /^\d{4}$/;

const english = (language: string): boolean => !language.startsWith('he');
const nameOf = (entry: MccEntry, language: string): string => (english(language) ? entry.en : entry.he);

/** Each list's codes, indexed once: the feed looks a name up per row, per keystroke. */
const indexes = new WeakMap<MccList, ReadonlyMap<string, MccEntry>>();

function indexOf(list: MccList): ReadonlyMap<string, MccEntry> {
  let index = indexes.get(list);
  if (index === undefined) {
    index = new Map(list.map((entry) => [entry.code, entry]));
    indexes.set(list, index);
  }
  return index;
}

/** A code's name in the UI language, or undefined when the list does not have it. */
export function mccName(list: MccList, code: string, language: string): string | undefined {
  const entry = indexOf(list).get(code);
  return entry === undefined ? undefined : nameOf(entry, language);
}

/** Hebrew final letters, as their ordinary forms: "מרכולים" is found by "מרכולימ". */
const FINALS: Readonly<Record<string, string>> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

/**
 * Text as search compares it: lower case, without niqqud or accents, with
 * final letters in their ordinary form, and single spaces. The niqqud ranges
 * leave out the maqaf (U+05BE) and the sof pasuq (U+05C3), which separate
 * words.
 */
export function foldSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-֑ͯ-ׇֽֿׁׂׅׄ]/g, '')
    .replace(/[ךםןףץ]/g, (letter) => FINALS[letter] ?? letter)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Business types matching what was typed: its code, or its English or Hebrew
 * name, whichever language is shown. A code typed exactly comes first, then
 * codes that start with it, then names that start with it, then names that
 * hold it - each group by name. Nothing typed lists everything by name.
 */
export function searchMcc(list: MccList, query: string, language: string): MccEntry[] {
  const needle = foldSearch(query);
  const byName = (a: MccEntry, b: MccEntry): number =>
    nameOf(a, language).localeCompare(nameOf(b, language), language);
  if (needle === '') return [...list].sort(byName);
  const ranked: { readonly entry: MccEntry; readonly rank: number }[] = [];
  for (const entry of list) {
    const names = [foldSearch(entry.en), foldSearch(entry.he)];
    const rank =
      entry.code === needle
        ? 0
        : entry.code.startsWith(needle)
          ? 1
          : names.some((name) => name.startsWith(needle))
            ? 2
            : names.some((name) => name.includes(needle))
              ? 3
              : undefined;
    if (rank !== undefined) ranked.push({ entry, rank });
  }
  return ranked.sort((a, b) => a.rank - b.rank || byName(a.entry, b.entry)).map((r) => r.entry);
}

/** The sources a business type may be replaced from automatically. */
const REPLACEABLE: ReadonlySet<string> = new Set(['file', 'sector', 'history', 'ai']);

/**
 * Whether a business type from `source` may be replaced automatically. Never
 * the person's own ('user'), never one with no source, and never one from a
 * source a later build added and this one does not know.
 */
export function replaceableMcc(source: string | undefined): boolean {
  return source !== undefined && REPLACEABLE.has(source);
}
