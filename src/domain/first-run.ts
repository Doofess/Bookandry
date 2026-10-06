import { startOfMonth } from '@/lib/dates';
import type { Profile } from '@/types/domain';
import type { Currency, IsoInstant, LocalDate, Minor } from '@/types/money';

import type { Language } from './locale-defaults';
import { PROFILE_PALETTE } from './palette';
import { graphemeLength, NAME_MAX_LENGTH, normalizeName } from './validation';

/**
 * The first-run wizard, as data.
 *
 * Nothing in the original spec ever created a profile, yet the feed filters by
 * `activeProfileId`, "All" merges profiles, and the opening balance is per
 * profile. On a fresh install the hero showed an animated $0.00 that meant
 * nothing, and the Add form could not be submitted because the profile field
 * had no options. Two independent reviewers found the same thing: as specified,
 * the app could not save its first transaction.
 *
 * It makes exactly ONE person: this account's own. The household's other
 * people are the accounts linked with it, and each of those makes its own
 * person on its own first run - so there is nobody here to name, add or
 * remove, and the person's name is the account's rather than typed again.
 */

export type FirstRunDraft = {
  readonly language: Language;
  readonly currency: Currency;
  /** The person's opening balance; undefined is "skipped", which is zero. */
  readonly openingBalanceMinor?: Minor;
};

/** Nobody else exists yet to have taken a colour, so the first one. */
export const FIRST_RUN_COLOR = PROFILE_PALETTE[0].hex;

export function initialDraft(language: Language, currency: Currency): FirstRunDraft {
  return { language, currency };
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * What the person is called: the account's name, else `fallback` ("Me").
 *
 * Shortened rather than refused. A Google name past the forty-character limit
 * is not something the user typed and cannot fix here, and a setup that fails
 * on it fails at the one screen with no way around it.
 */
export function personName(accountName: string | undefined, fallback: string): string {
  const trimmed = accountName?.trim() ?? '';
  if (trimmed === '') return fallback;
  if (graphemeLength(trimmed) <= NAME_MAX_LENGTH) return trimmed;
  return Array.from(segmenter.segment(trimmed), (part) => part.segment)
    .slice(0, NAME_MAX_LENGTH)
    .join('')
    .trimEnd();
}

export type BuildProfileInput = {
  readonly draft: FirstRunDraft;
  /**
   * The account's id when signed in - a member's person has the account's id
   * for its id - else a fresh one. Injected so the result is byte-stable.
   */
  readonly id: string;
  readonly name: string;
  readonly today: LocalDate;
  readonly now: IsoInstant;
};

/**
 * Turn the draft into the person's row.
 *
 * The opening balance date is the START OF THIS MONTH, not today. "Bookandry
 * ignores everything before today" is the sentence the user reads, but anchoring
 * on today would drop the salary that arrived on the 1st and the rent that left
 * on the 2nd - so the first month the user sees would be missing most of itself.
 * Starting at the month boundary makes the first summary card meaningful on day
 * one, and it is the boundary the month cursor already works in.
 */
export function buildProfile(input: BuildProfileInput): Profile {
  const { draft, id, name, today, now } = input;
  return {
    id,
    name: normalizeName(name),
    color: FIRST_RUN_COLOR,
    openingBalanceMinor: draft.openingBalanceMinor ?? 0,
    openingBalanceCurrency: draft.currency,
    openingBalanceDate: startOfMonth(today),
    createdAt: now,
    updatedAt: now,
  };
}
