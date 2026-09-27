import { startOfMonth } from '@/lib/dates';
import type { AvatarKey, Profile } from '@/types/domain';
import type { Currency, IsoInstant, LocalDate, Minor } from '@/types/money';

import { AVATAR_ROTATION } from './avatars';
import type { Language } from './locale-defaults';
import { MAX_PROFILES, nextFreeColor, PROFILE_PALETTE } from './palette';
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
 * The draft lives here, pure, so every rule about it - the colour assignment,
 * the twelve-profile cap, what a "couple plus household" actually builds - is
 * testable without rendering anything.
 */

export type PersonDraft = {
  /** Stable across reorders; NOT the profile id, which is minted on save. */
  readonly key: string;
  readonly name: string;
  readonly avatar: AvatarKey;
  readonly color: string;
  readonly openingBalanceMinor?: Minor;
};

/**
 * The third shape is the point of the screen.
 *
 * A couple who are not offered "two of us plus a shared household" will spend
 * three months mis-attributing joint groceries to one partner, then give up and
 * live in "All" - at which point profiles were decoration. Nobody invents this
 * pattern unaided, and it cannot be retrofitted without re-filing history.
 */
export type SetupShape = 'solo' | 'couple';

export type FirstRunDraft = {
  readonly language: Language;
  readonly currency: Currency;
  readonly shape: SetupShape;
  readonly people: readonly PersonDraft[];
};

const FIRST_COLOR = PROFILE_PALETTE[0].hex;

function person(index: number, name: string, taken: readonly string[]): PersonDraft {
  return {
    key: `person-${String(index)}`,
    name,
    avatar: AVATAR_ROTATION[index % AVATAR_ROTATION.length] ?? 'fox',
    color: nextFreeColor(taken) ?? FIRST_COLOR,
  };
}

export function initialDraft(language: Language, currency: Currency): FirstRunDraft {
  return { language, currency, shape: 'solo', people: [person(0, '', [])] };
}

/**
 * Switch shape, preserving anything the user already typed.
 *
 * Household is a real profile, not a flag: shared bills need somewhere to live
 * that is not either partner, and "All" has to keep summing correctly.
 */
export function applyShape(draft: FirstRunDraft, shape: SetupShape, householdName: string): FirstRunDraft {
  if (shape === draft.shape) return draft;

  if (shape === 'solo') {
    const first = draft.people[0] ?? person(0, '', []);
    return { ...draft, shape, people: [first] };
  }

  const people: PersonDraft[] = [];
  for (let i = 0; i < 3; i += 1) {
    const existing = draft.people[i];
    const taken = people.map((p) => p.color);
    const seeded = person(i, i === 2 ? householdName : '', taken);
    people.push(existing === undefined ? seeded : { ...existing, color: seeded.color });
  }
  // The household keeps its name even if the slot was empty before.
  const household = people[2];
  if (household?.name.trim() === '') {
    people[2] = { ...household, name: householdName };
  }

  return { ...draft, shape, people };
}

export function addPerson(draft: FirstRunDraft): FirstRunDraft {
  if (draft.people.length >= MAX_PROFILES) return draft;
  const taken = draft.people.map((p) => p.color);
  return { ...draft, people: [...draft.people, person(draft.people.length, '', taken)] };
}

export function removePerson(draft: FirstRunDraft, key: string): FirstRunDraft {
  // Never below one: a database with zero profiles routes straight back here.
  if (draft.people.length <= 1) return draft;
  return { ...draft, people: draft.people.filter((p) => p.key !== key) };
}

export function updatePerson(
  draft: FirstRunDraft,
  key: string,
  patch: Partial<Omit<PersonDraft, 'key'>>,
): FirstRunDraft {
  return {
    ...draft,
    people: draft.people.map((p) => (p.key === key ? { ...p, ...patch } : p)),
  };
}

export function canAddPerson(draft: FirstRunDraft): boolean {
  return draft.people.length < MAX_PROFILES;
}

export type DraftIssue =
  | { readonly key: string; readonly field: 'name'; readonly reason: 'empty' | 'too_long' | 'duplicate' }
  | { readonly key: string; readonly field: 'color'; readonly reason: 'duplicate' };

/**
 * Validate the people step.
 *
 * Duplicate NAMES are rejected as well as duplicate colours. Two profiles both
 * called "Dana" are indistinguishable in the switcher, the filter chips and
 * every breakdown sheet - and the app offers no other way to tell them apart.
 */
export function validateDraft(draft: FirstRunDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const seenNames = new Map<string, string>();
  const seenColors = new Map<string, string>();

  for (const p of draft.people) {
    const trimmed = p.name.trim();
    if (trimmed.length === 0) {
      issues.push({ key: p.key, field: 'name', reason: 'empty' });
    } else if (graphemeLength(trimmed) > NAME_MAX_LENGTH) {
      issues.push({ key: p.key, field: 'name', reason: 'too_long' });
    } else {
      const folded = trimmed.toLocaleLowerCase();
      if (seenNames.has(folded)) issues.push({ key: p.key, field: 'name', reason: 'duplicate' });
      else seenNames.set(folded, p.key);
    }

    if (seenColors.has(p.color)) issues.push({ key: p.key, field: 'color', reason: 'duplicate' });
    else seenColors.set(p.color, p.key);
  }

  return issues;
}

export function isDraftValid(draft: FirstRunDraft): boolean {
  return validateDraft(draft).length === 0;
}

export type BuildProfilesInput = {
  readonly draft: FirstRunDraft;
  /** One id per person, in order. Injected so the result is byte-stable. */
  readonly ids: readonly string[];
  readonly today: LocalDate;
  readonly now: IsoInstant;
};

/**
 * Turn the draft into rows.
 *
 * The opening balance date is the START OF THIS MONTH, not today. "Bookandry
 * ignores everything before today" is the sentence the user reads, but anchoring
 * on today would drop the salary that arrived on the 1st and the rent that left
 * on the 2nd - so the first month the user sees would be missing most of itself.
 * Starting at the month boundary makes the first summary card meaningful on day
 * one, and it is the boundary the month cursor already works in.
 */
export function buildProfiles(input: BuildProfilesInput): Profile[] {
  const { draft, ids, today, now } = input;
  const openingBalanceDate = startOfMonth(today);

  return draft.people.map((p, index) => ({
    id: ids[index] ?? `profile-${String(index)}`,
    name: normalizeName(p.name),
    avatar: p.avatar,
    color: p.color,
    openingBalanceMinor: p.openingBalanceMinor ?? 0,
    openingBalanceCurrency: draft.currency,
    openingBalanceDate,
    createdAt: now,
    updatedAt: now,
  }));
}
