import { describe, expect, it } from 'vitest';

import type { IsoInstant } from '@/types/money';

import {
  addPerson,
  applyShape,
  buildProfiles,
  canAddPerson,
  initialDraft,
  isDraftValid,
  removePerson,
  updatePerson,
  validateDraft,
  type FirstRunDraft,
} from './first-run';
import { MAX_PROFILES } from './palette';
import { d } from './test-factories';

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
const TODAY = d('2026-09-15');

const named = (draft: FirstRunDraft, ...names: string[]): FirstRunDraft =>
  names.reduce((acc, name, i) => {
    const key = acc.people[i]?.key;
    return key === undefined ? acc : updatePerson(acc, key, { name });
  }, draft);

describe('initialDraft', () => {
  it('starts with one empty person on the first palette colour', () => {
    const draft = initialDraft('he', 'ILS');
    expect(draft).toMatchObject({ language: 'he', currency: 'ILS', shape: 'solo' });
    expect(draft.people).toHaveLength(1);
    expect(draft.people[0]?.name).toBe('');
    expect(draft.people[0]?.color).toBe('#16794a');
  });
});

describe('applyShape', () => {
  it('builds two people plus a named household', () => {
    // Nobody invents this pattern unaided, and it cannot be retrofitted later
    // without re-filing history.
    const draft = applyShape(initialDraft('en', 'ILS'), 'couple', 'Household');

    expect(draft.people).toHaveLength(3);
    expect(draft.people[2]?.name).toBe('Household');
    expect(new Set(draft.people.map((p) => p.color)).size).toBe(3);
  });

  it('keeps what the user already typed', () => {
    const solo = named(initialDraft('en', 'ILS'), 'Dana');
    const couple = applyShape(solo, 'couple', 'Household');
    expect(couple.people[0]?.name).toBe('Dana');
  });

  it('collapses back to one person', () => {
    const couple = applyShape(named(initialDraft('en', 'ILS'), 'Dana'), 'couple', 'Household');
    const solo = applyShape(couple, 'solo', 'Household');
    expect(solo.people).toHaveLength(1);
    expect(solo.people[0]?.name).toBe('Dana');
  });

  it('is a no-op for the shape it already has', () => {
    const draft = initialDraft('en', 'ILS');
    expect(applyShape(draft, 'solo', 'Household')).toBe(draft);
  });
});

describe('people list', () => {
  it('gives each new person a free colour', () => {
    let draft = initialDraft('en', 'USD');
    for (let i = 0; i < 4; i += 1) draft = addPerson(draft);
    expect(new Set(draft.people.map((p) => p.color)).size).toBe(draft.people.length);
  });

  it('rotates avatars so two people never start identical', () => {
    let draft = initialDraft('en', 'USD');
    draft = addPerson(draft);
    expect(draft.people[0]?.avatar).not.toBe(draft.people[1]?.avatar);
  });

  it('stops at the palette size', () => {
    let draft = initialDraft('en', 'USD');
    while (canAddPerson(draft)) draft = addPerson(draft);

    expect(draft.people).toHaveLength(MAX_PROFILES);
    // The Add button is disabled with a reason, not a form that fails on submit.
    expect(canAddPerson(draft)).toBe(false);
    expect(addPerson(draft)).toBe(draft);
  });

  it('never removes the last person', () => {
    const draft = initialDraft('en', 'USD');
    const key = draft.people[0]?.key ?? '';
    // A database with zero profiles routes straight back to this wizard.
    expect(removePerson(draft, key)).toBe(draft);
  });

  it('removes by key, not by index', () => {
    const draft = addPerson(addPerson(initialDraft('en', 'USD')));
    const key = draft.people[1]?.key ?? '';
    const after = removePerson(draft, key);
    expect(after.people.map((p) => p.key)).not.toContain(key);
    expect(after.people).toHaveLength(2);
  });
});

describe('validateDraft', () => {
  it('accepts a named person', () => {
    expect(isDraftValid(named(initialDraft('en', 'USD'), 'Dana'))).toBe(true);
  });

  it('requires a name', () => {
    expect(validateDraft(initialDraft('en', 'USD'))).toEqual([
      { key: 'person-0', field: 'name', reason: 'empty' },
    ]);
  });

  it('treats whitespace as empty', () => {
    expect(validateDraft(named(initialDraft('en', 'USD'), '   '))[0]?.reason).toBe('empty');
  });

  it('bounds the name in code points, not UTF-16 units', () => {
    const long = named(initialDraft('en', 'USD'), 'x'.repeat(41));
    expect(validateDraft(long)[0]?.reason).toBe('too_long');
    // 40 emoji is 40 characters to the user and 80 to `.length`.
    expect(isDraftValid(named(initialDraft('en', 'USD'), '\u{1F98A}'.repeat(40)))).toBe(true);
  });

  it('rejects two people with the same name', () => {
    // Two profiles called "Dana" are indistinguishable in the switcher, the
    // filter chips and every breakdown sheet.
    const draft = named(addPerson(initialDraft('en', 'USD')), 'Dana', 'dana');
    expect(validateDraft(draft)).toEqual([{ key: 'person-1', field: 'name', reason: 'duplicate' }]);
  });

  it('rejects two people with the same colour', () => {
    let draft = named(addPerson(initialDraft('en', 'USD')), 'Dana', 'Yossi');
    const first = draft.people[0]?.color ?? '';
    draft = updatePerson(draft, draft.people[1]?.key ?? '', { color: first });
    expect(validateDraft(draft)).toEqual([{ key: 'person-1', field: 'color', reason: 'duplicate' }]);
  });
});

describe('buildProfiles', () => {
  const draft = named(applyShape(initialDraft('he', 'ILS'), 'couple', 'Household'), 'Dana', 'Yossi');
  const build = (over: Partial<FirstRunDraft> = {}) =>
    buildProfiles({ draft: { ...draft, ...over }, ids: ['a', 'b', 'c'], today: TODAY, now: NOW });

  it('mints one profile per person, in order', () => {
    expect(build().map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(build().map((p) => p.name)).toEqual(['Dana', 'Yossi', 'Household']);
  });

  it('anchors the opening balance to the start of the month, not to today', () => {
    // "Greenback starts counting from here" is what the user reads, but
    // anchoring on the 15th would drop the salary that arrived on the 1st and
    // the rent that left on the 2nd, so the first month shown would be missing
    // most of itself.
    for (const p of build()) expect(p.openingBalanceDate).toBe('2026-09-01');
  });

  it('denominates the opening balance in the chosen currency', () => {
    for (const p of build()) expect(p.openingBalanceCurrency).toBe('ILS');
  });

  it('defaults a skipped balance to zero', () => {
    expect(build().map((p) => p.openingBalanceMinor)).toEqual([0, 0, 0]);
  });

  it('keeps a negative opening balance', () => {
    const key = draft.people[0]?.key ?? '';
    const withMinus = updatePerson(draft, key, { openingBalanceMinor: -125_000 });
    expect(build({ people: withMinus.people })[0]?.openingBalanceMinor).toBe(-125_000);
  });

  it('trims the stored name', () => {
    const padded = named(initialDraft('en', 'USD'), '  Dana  ');
    expect(buildProfiles({ draft: padded, ids: ['a'], today: TODAY, now: NOW })[0]?.name).toBe('Dana');
  });

  it('is byte-stable for the same inputs', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});
