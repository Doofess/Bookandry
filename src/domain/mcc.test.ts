import { describe, expect, it } from 'vitest';

import shipped from '@/data/mcc.json';

import { foldSearch, isMcc, MCC_SHAPE, mccName, replaceableMcc, searchMcc, type MccList } from './mcc';

const LIST: MccList = [
  { code: '0742', en: 'Veterinary services', he: 'שירותי וטרינריה' },
  { code: '5411', en: 'Grocery stores and supermarkets', he: 'מרכולים וסופרמרקטים' },
  { code: '5812', en: 'Restaurant', he: 'מסעדות' },
  { code: '5814', en: 'Fast food', he: 'מזון מהיר' },
];

describe('a code', () => {
  it('is a business type only as a four-digit string the list has', () => {
    expect(isMcc('5812')).toBe(true);
    expect(isMcc('0742')).toBe(true);
    for (const bad of ['742', '9999', '58120', ' 5812', 5812, undefined, null]) {
      expect(isMcc(bad), String(bad)).toBe(false);
    }
  });

  it('has the shape a synced row is held to, which a later list may fill', () => {
    expect(MCC_SHAPE.test('9999')).toBe(true);
    expect(MCC_SHAPE.test('742')).toBe(false);
    expect(MCC_SHAPE.test('5812 ')).toBe(false);
  });
});

describe('mccName', () => {
  it('names a code in the language shown, and nothing for a code the list lacks', () => {
    expect(mccName(LIST, '5812', 'en')).toBe('Restaurant');
    expect(mccName(LIST, '5812', 'he')).toBe('מסעדות');
    expect(mccName(LIST, '5812', 'he-IL')).toBe('מסעדות');
    expect(mccName(LIST, '9999', 'en')).toBeUndefined();
  });

  it('names every code the app ships', () => {
    const list = shipped as MccList;
    expect(mccName(list, '0742', 'en')).toBe('Veterinary services');
    expect(list.every((entry) => mccName(list, entry.code, 'he') === entry.he)).toBe(true);
  });
});

describe('searchMcc', () => {
  const codes = (query: string, language = 'en') => searchMcc(LIST, query, language).map((e) => e.code);

  it('matches the code, the English and the Hebrew, whichever language is shown', () => {
    expect(codes('5812')).toEqual(['5812']);
    expect(codes('restaurant', 'he')).toEqual(['5812']);
    expect(codes('מסעדות')).toEqual(['5812']);
    expect(codes('nothing like it')).toEqual([]);
  });

  it('ignores case, niqqud and final letters', () => {
    expect(codes('RESTAURANT')).toEqual(['5812']);
    expect(codes('מִסְעָדוֹת', 'he')).toEqual(['5812']);
    // Typed with a plain mem where the name ends in a final one.
    expect(codes('מרכולימ', 'he')).toEqual(['5411']);
  });

  it('lists everything by name when nothing is typed, and codes before names', () => {
    expect(codes('')).toEqual(['5814', '5411', '5812', '0742']);
    expect(codes('  ', 'he')).toEqual(['5814', '5812', '5411', '0742']);
    expect(codes('581')).toEqual(['5814', '5812']);
  });
});

describe('foldSearch', () => {
  it('lower-cases, strips niqqud and accents, unfolds final letters and squeezes spaces', () => {
    expect(foldSearch('  שָׁלוֹם   World ')).toBe('שלומ world');
    expect(foldSearch('Café')).toBe('cafe');
    expect(foldSearch('ךםןףץ')).toBe('כמנפצ');
  });
});

describe('replaceableMcc', () => {
  it('lets the automatic sources be improved, and never the person or a source this build does not know', () => {
    for (const source of ['file', 'sector', 'history', 'ai'])
      expect(replaceableMcc(source), source).toBe(true);
    for (const source of ['user', 'a-later-source', '', undefined]) {
      expect(replaceableMcc(source), String(source)).toBe(false);
    }
  });
});
