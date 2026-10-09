import type { Category } from '@/types/domain';

import { CASH_FOUND_CATEGORY_ID, CASH_MISSING_CATEGORY_ID } from './cash';

/**
 * Category hues (§1.4): twelve bold hues around the wheel, each in two tones
 * (`teal`, `teal-2`), so the 24 built-in expense categories get 24 distinct
 * marks. Hues are marks only - bars, pills, strips - and never carry text.
 *
 * Data stores only the key. The colour a category shows is resolved in this
 * order: its stored `hue`, if this build knows the key; then BUILTIN_HUES by
 * id; then a stable hash of the id onto the twelve tone-A hues. An unknown
 * key from a newer build therefore never breaks anything, and nothing is
 * rewritten to "fix" it.
 */

export const HUES = [
  'indigo',
  'green',
  'vermilion',
  'amber',
  'orange',
  'cyan',
  'violet',
  'rose',
  'magenta',
  'teal',
  'blue',
  'lime',
] as const;

export type Hue = (typeof HUES)[number];

/** A hue's tone A (`teal`), its tone B (`teal-2`), or neutral ("Other"). */
export type HueToken = Hue | `${Hue}-2` | 'neutral';

/**
 * Every built-in's hue. Never written to rows: re-colouring a built-in writes
 * `hue` on its row, which wins over this map. Income and expense are never
 * drawn in the same bar list, so they share hues.
 */
export const BUILTIN_HUES: Readonly<Record<string, HueToken>> = {
  'cat.rent': 'indigo',
  'cat.buildingFee': 'indigo-2',
  'cat.groceries': 'green',
  'cat.fitness': 'green-2',
  'cat.investment': 'green',
  'cat.dining': 'vermilion',
  'cat.cardFees': 'vermilion-2',
  'cat.kids': 'amber',
  'cat.pets': 'amber-2',
  [CASH_FOUND_CATEGORY_ID]: 'amber',
  'cat.transport': 'orange',
  'cat.currencyExchange': 'orange-2',
  'cat.utilities': 'cyan',
  'cat.phoneInternet': 'cyan-2',
  'cat.salary': 'cyan',
  'cat.shopping': 'violet',
  'cat.aiSoftware': 'violet-2',
  'cat.freelance': 'violet',
  'cat.health': 'rose',
  'cat.insurance': 'rose-2',
  'cat.subscriptions': 'magenta',
  [CASH_MISSING_CATEGORY_ID]: 'magenta-2',
  'cat.entertainment': 'teal',
  'cat.travel': 'teal-2',
  'cat.education': 'blue',
  'cat.loans': 'blue-2',
  'cat.refund': 'blue',
  'cat.arnona': 'lime-2',
  'cat.gift': 'lime',
  // "Other" never looks like a category of its own.
  'cat.otherExpense': 'neutral',
  'cat.otherIncome': 'neutral',
};

const KNOWN: ReadonlySet<string> = new Set<string>([...HUES, ...HUES.map((hue) => `${hue}-2`), 'neutral']);

/** A stored hue key this build knows, or undefined. */
export function parseHue(value: string | undefined): HueToken | undefined {
  return value !== undefined && KNOWN.has(value) ? (value as HueToken) : undefined;
}

/** FNV-1a over the id's UTF-16 code units, onto the twelve tone-A hues. Stable across builds. */
export function hashHue(id: string): Hue {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return HUES[hash % HUES.length] ?? 'indigo';
}

/** The hue a category shows. */
export function categoryHue(category: Pick<Category, 'id' | 'hue'>): HueToken {
  return parseHue(category.hue) ?? BUILTIN_HUES[category.id] ?? hashHue(category.id);
}

/** The hue used least among the active categories of one kind, both tones counted; ties go in wheel order. */
export function leastUsedHue(siblings: readonly Pick<Category, 'id' | 'hue' | 'isArchived'>[]): Hue {
  const uses = new Map<Hue, number>(HUES.map((hue) => [hue, 0]));
  for (const sibling of siblings) {
    if (sibling.isArchived === 1) continue;
    const token = categoryHue(sibling);
    if (token === 'neutral') continue;
    const base = token.replace(/-2$/, '') as Hue;
    uses.set(base, (uses.get(base) ?? 0) + 1);
  }
  let best: Hue = HUES[0];
  for (const hue of HUES) if ((uses.get(hue) ?? 0) < (uses.get(best) ?? 0)) best = hue;
  return best;
}
