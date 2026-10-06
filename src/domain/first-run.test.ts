import { describe, expect, it } from 'vitest';

import type { IsoInstant } from '@/types/money';

import { buildProfile, FIRST_RUN_COLOR, initialDraft, personName, type FirstRunDraft } from './first-run';
import { d } from './test-factories';
import { graphemeLength, NAME_MAX_LENGTH } from './validation';

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
const TODAY = d('2026-09-15');

describe('initialDraft', () => {
  it('starts from the locale and no opening balance', () => {
    const draft = initialDraft('he', 'ILS');
    expect(draft).toEqual({ language: 'he', currency: 'ILS' });
  });
});

describe('personName', () => {
  it("uses the account's name", () => {
    expect(personName('Dana Levi', 'Me')).toBe('Dana Levi');
  });

  it('trims it', () => {
    expect(personName('  Dana  ', 'Me')).toBe('Dana');
  });

  it('falls back when the account has no name', () => {
    expect(personName(undefined, 'Me')).toBe('Me');
    expect(personName('   ', 'Me')).toBe('Me');
  });

  it('shortens a name past the limit rather than refusing it, in code points', () => {
    // Not something the user typed, and nothing on this screen could fix it.
    expect(graphemeLength(personName('x'.repeat(60), 'Me'))).toBe(NAME_MAX_LENGTH);
    // 41 emoji is 41 characters to the user and 82 to `.length`.
    expect(personName('\u{1F98A}'.repeat(41), 'Me')).toBe('\u{1F98A}'.repeat(40));
  });
});

describe('buildProfile', () => {
  const draft = initialDraft('he', 'ILS');
  const build = (over: Partial<FirstRunDraft> = {}) =>
    buildProfile({ draft: { ...draft, ...over }, id: 'acc-1', name: 'Dana', today: TODAY, now: NOW });

  it('makes the one person, with the id it is given', () => {
    // Signed in, that id is the account's: the person IS the account.
    expect(build()).toMatchObject({ id: 'acc-1', name: 'Dana', color: FIRST_RUN_COLOR });
  });

  it('writes no picture: a person is their account picture or their initials', () => {
    expect(build().avatar).toBeUndefined();
  });

  it('anchors the opening balance to the start of the month, not to today', () => {
    // "Bookandry starts counting from here" is what the user reads, but
    // anchoring on the 15th would drop the salary that arrived on the 1st and
    // the rent that left on the 2nd, so the first month shown would be missing
    // most of itself.
    expect(build().openingBalanceDate).toBe('2026-09-01');
  });

  it('denominates the opening balance in the chosen currency', () => {
    expect(build().openingBalanceCurrency).toBe('ILS');
  });

  it('defaults a skipped balance to zero', () => {
    expect(build().openingBalanceMinor).toBe(0);
  });

  it('keeps a negative opening balance', () => {
    expect(build({ openingBalanceMinor: -125_000 }).openingBalanceMinor).toBe(-125_000);
  });

  it('trims the stored name', () => {
    const padded = buildProfile({ draft, id: 'a', name: '  Dana  ', today: TODAY, now: NOW });
    expect(padded.name).toBe('Dana');
  });

  it('is byte-stable for the same inputs', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});
