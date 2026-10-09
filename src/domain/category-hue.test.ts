import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- test only: the built-in ids are the seed's, and a test may know the seed.
import { BUILTIN_EXPENSE, BUILTIN_INCOME } from '@/db/seed';

import { BUILTIN_HUES, categoryHue, hashHue, HUES, leastUsedHue, parseHue } from './category-hue';

describe('the built-in categories (§1.4)', () => {
  it('each has a hue', () => {
    for (const { id } of [...BUILTIN_EXPENSE, ...BUILTIN_INCOME]) expect(BUILTIN_HUES[id], id).toBeDefined();
  });

  it('no two expense built-ins share a hue and tone, and "Other" is neutral', () => {
    const marks = BUILTIN_EXPENSE.map(({ id }) => BUILTIN_HUES[id]).filter((hue) => hue !== 'neutral');
    expect(new Set(marks).size).toBe(marks.length);
    expect(BUILTIN_HUES['cat.otherExpense']).toBe('neutral');
  });

  it('no two income built-ins share a hue and tone either', () => {
    const marks = BUILTIN_INCOME.map(({ id }) => BUILTIN_HUES[id]).filter((hue) => hue !== 'neutral');
    expect(new Set(marks).size).toBe(marks.length);
    expect(BUILTIN_HUES['cat.otherIncome']).toBe('neutral');
  });

  it('keeps the concept’s twelve on tone A', () => {
    expect(BUILTIN_HUES['cat.rent']).toBe('indigo');
    expect(BUILTIN_HUES['cat.groceries']).toBe('green');
    expect(BUILTIN_HUES['cat.dining']).toBe('vermilion');
    expect(BUILTIN_HUES['cat.arnona']).toBe('lime-2');
  });
});

describe('parseHue', () => {
  it('reads a hue key with or without its tone', () => {
    expect(parseHue('teal')).toBe('teal');
    expect(parseHue('teal-2')).toBe('teal-2');
    expect(parseHue('neutral')).toBe('neutral');
  });

  it('refuses a key from a newer build or a colour value, rather than guessing', () => {
    expect(parseHue('teal-3')).toBeUndefined();
    expect(parseHue('ochre')).toBeUndefined();
    expect(parseHue('#ff0000')).toBeUndefined();
    expect(parseHue(undefined)).toBeUndefined();
  });
});

describe('categoryHue: stored, then the built-in map, then a hash', () => {
  it('takes a stored hue first, so a built-in can be re-coloured', () => {
    expect(categoryHue({ id: 'cat.rent', hue: 'lime' })).toBe('lime');
  });

  it('falls back to the built-in map for a hue it does not know', () => {
    expect(categoryHue({ id: 'cat.rent', hue: 'teal-3' })).toBe('indigo');
    expect(categoryHue({ id: 'cat.rent' })).toBe('indigo');
  });

  it('hashes a custom category with no hue onto the twelve tone-A hues', () => {
    expect(categoryHue({ id: 'c-1234' })).toBe('teal');
  });
});

describe('hashHue', () => {
  it('is stable for an id, and always one of the twelve', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 40 }), (id) => {
        expect(hashHue(id)).toBe(hashHue(id));
        expect(HUES).toContain(hashHue(id));
      }),
    );
  });

  it('is pinned: a change would recolour every custom category without a stored hue', () => {
    expect(hashHue('')).toBe('green');
    expect(hashHue('c-1234')).toBe('teal');
    expect(hashHue('c1')).toBe('cyan');
  });
});

describe('leastUsedHue', () => {
  it('picks the hue used least among active siblings, counting both tones', () => {
    const expense = BUILTIN_EXPENSE.map(({ id }) => ({ id, isArchived: 0 as const }));
    // Every hue has two expense built-ins except lime, whose tone A is free.
    expect(leastUsedHue(expense)).toBe('lime');
  });

  it('ignores archived siblings, and breaks ties in wheel order', () => {
    expect(leastUsedHue([])).toBe('indigo');
    expect(
      leastUsedHue([
        { id: 'a', hue: 'indigo', isArchived: 0 },
        { id: 'b', hue: 'green', isArchived: 1 },
      ]),
    ).toBe('green');
  });
});
