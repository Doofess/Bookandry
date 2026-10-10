import { describe, expect, it } from 'vitest';

import type { Category } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import {
  businessTypesOf,
  categoryForMcc,
  categoryForMccOrNone,
  chooseExpenseCategory,
  defaultCategoryForMcc,
  isCashWithdrawal,
  pickMcc,
  tableFiles,
} from './mcc-categories';

const NOW = '2026-10-01T00:00:00.000Z' as IsoInstant;
const LATER = '2026-10-05T00:00:00.000Z' as IsoInstant;

const builtin = (id: string, over: Partial<Category> = {}): Category =>
  ({
    id,
    kind: 'expense',
    icon: 'Circle',
    sortOrder: 0,
    isArchived: 0,
    source: 'builtin',
    nameKey: `categories:builtin.${id.slice(4)}`,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  }) as Category;
const custom = (id: string, over: Partial<Category> = {}): Category =>
  ({ ...builtin(id), source: 'custom', name: id, ...over }) as Category;

const CATEGORIES = ['cat.dining', 'cat.groceries', 'cat.travel', 'cat.otherExpense'].map((id) => builtin(id));

describe('defaultCategoryForMcc', () => {
  it.each([
    // The spec's examples (§1.2).
    ['3000', 'cat.travel'],
    ['3299', 'cat.travel'],
    ['4511', 'cat.travel'],
    ['3501', 'cat.travel'],
    ['7011', 'cat.travel'],
    ['4722', 'cat.travel'],
    ['5411', 'cat.groceries'],
    ['5422', 'cat.groceries'],
    ['5462', 'cat.groceries'],
    ['5499', 'cat.groceries'],
    ['5811', 'cat.dining'],
    ['5814', 'cat.dining'],
    ['4111', 'cat.transport'],
    ['4121', 'cat.transport'],
    ['4131', 'cat.transport'],
    ['4784', 'cat.transport'],
    ['5541', 'cat.transport'],
    ['5542', 'cat.transport'],
    ['7523', 'cat.transport'],
    ['4812', 'cat.phoneInternet'],
    ['4814', 'cat.phoneInternet'],
    ['4816', 'cat.phoneInternet'],
    ['4899', 'cat.phoneInternet'],
    ['4900', 'cat.utilities'],
    ['5912', 'cat.health'],
    ['8011', 'cat.health'],
    ['8099', 'cat.health'],
    ['5815', 'cat.subscriptions'],
    ['5818', 'cat.subscriptions'],
    ['7841', 'cat.subscriptions'],
    ['7832', 'cat.entertainment'],
    ['7922', 'cat.entertainment'],
    ['7991', 'cat.entertainment'],
    ['7999', 'cat.entertainment'],
    ['8211', 'cat.education'],
    ['8299', 'cat.education'],
    ['0742', 'cat.pets'],
    ['5995', 'cat.pets'],
    ['7997', 'cat.fitness'],
    ['7941', 'cat.fitness'],
    ['6300', 'cat.insurance'],
    ['5960', 'cat.insurance'],
    ['6010', 'cat.currencyExchange'],
    ['6011', 'cat.currencyExchange'],
    ['6051', 'cat.currencyExchange'],
    ['5641', 'cat.kids'],
    ['5945', 'cat.kids'],
    ['5311', 'cat.shopping'],
    ['5999', 'cat.shopping'],
    // The plan's readings (spec point 14).
    ['5511', 'cat.transport'],
    ['5013', 'cat.transport'],
    ['5172', 'cat.transport'],
    ['5734', 'cat.aiSoftware'],
    ['7372', 'cat.aiSoftware'],
    ['5962', 'cat.travel'],
    ['3351', 'cat.travel'],
    ['7512', 'cat.travel'],
    ['5968', 'cat.subscriptions'],
    ['7375', 'cat.subscriptions'],
    ['5975', 'cat.health'],
    ['5976', 'cat.health'],
    ['5047', 'cat.health'],
    ['5122', 'cat.health'],
    ['4119', 'cat.health'],
    ['7277', 'cat.health'],
    ['7297', 'cat.health'],
    ['7298', 'cat.health'],
    ['5983', 'cat.utilities'],
    ['6513', 'cat.rent'],
    ['8351', 'cat.kids'],
    // Everything else.
    ['1520', 'cat.otherExpense'],
    ['4829', 'cat.otherExpense'],
    ['9311', 'cat.otherExpense'],
  ])('files %s under %s', (code, id) => {
    expect(defaultCategoryForMcc(code)).toBe(id);
  });
});

describe('categoryForMcc', () => {
  it('follows the default table when nobody moved the business type', () => {
    expect(categoryForMcc('5812', CATEGORIES)).toBe('cat.dining');
    expect(categoryForMcc('9311', CATEGORIES)).toBe('cat.otherExpense');
  });

  it('puts the person’s move before the default', () => {
    const coffee = custom('c.coffee', { mccs: ['5812'] });
    expect(categoryForMcc('5812', [...CATEGORIES, coffee])).toBe('c.coffee');
  });

  it('skips an archived category: its moves stop applying, and an archived default gives nothing', () => {
    const coffee = custom('c.coffee', { mccs: ['5812'], isArchived: 1 });
    expect(categoryForMcc('5812', [...CATEGORIES, coffee])).toBe('cat.dining');
    const archived = CATEGORIES.map((c) => (c.id === 'cat.dining' ? { ...c, isArchived: 1 as const } : c));
    expect(categoryForMcc('5812', archived)).toBeUndefined();
    expect(categoryForMcc('5812', [])).toBeUndefined();
  });

  it('settles two categories claiming one business type by the one updated last', () => {
    const coffee = custom('c.coffee', { mccs: ['5812'], updatedAt: NOW });
    const lunch = custom('c.lunch', { mccs: ['5812'], updatedAt: LATER });
    expect(categoryForMcc('5812', [...CATEGORIES, coffee, lunch])).toBe('c.lunch');
    expect(categoryForMcc('5812', [...CATEGORIES, lunch, coffee])).toBe('c.lunch');
  });
});

describe('categoryForMccOrNone: only a real answer, never the fall-through to Other', () => {
  it('gives nothing for a code no range names, and the table or a move otherwise', () => {
    expect(categoryForMccOrNone('9311', CATEGORIES)).toBeUndefined();
    expect(categoryForMccOrNone('6012', CATEGORIES)).toBeUndefined();
    expect(categoryForMccOrNone('5812', CATEGORIES)).toBe('cat.dining');
    // The person's own move counts, into a category of theirs or into Other itself.
    expect(categoryForMccOrNone('9311', [...CATEGORIES, custom('c.city', { mccs: ['9311'] })])).toBe(
      'c.city',
    );
    const other = CATEGORIES.map((c) => (c.id === 'cat.otherExpense' ? { ...c, mccs: ['9311'] } : c));
    expect(categoryForMccOrNone('9311', other)).toBe('cat.otherExpense');
  });

  it('tableFiles says whether the table names a code at all, for import to know what to ask about', () => {
    expect(tableFiles('5812')).toBe(true);
    expect(tableFiles('0742')).toBe(true);
    expect(tableFiles('9311')).toBe(false);
    expect(tableFiles('6012')).toBe(false);
    expect(tableFiles('8641')).toBe(false);
  });
});

describe('businessTypesOf', () => {
  it('lists the table’s codes, then the ones moved in, and not the ones moved out', () => {
    expect(businessTypesOf(builtin('cat.dining'), CATEGORIES)).toEqual({
      defaults: ['5811', '5812', '5813', '5814'],
      moved: [],
    });
    const coffee = custom('c.coffee', { mccs: ['5812'] });
    const all = [...CATEGORIES, coffee];
    expect(businessTypesOf(builtin('cat.dining'), all).defaults).toEqual(['5811', '5813', '5814']);
    expect(businessTypesOf(coffee, all)).toEqual({ defaults: [], moved: ['5812'] });
  });

  it('gives a code back to its default while the category it was moved to is archived', () => {
    const coffee = custom('c.coffee', { mccs: ['5812'], isArchived: 1 });
    expect(businessTypesOf(builtin('cat.dining'), [...CATEGORIES, coffee]).defaults).toContain('5812');
  });

  it('lists nothing for an income category', () => {
    expect(businessTypesOf(builtin('cat.salary', { kind: 'income' }), CATEGORIES)).toEqual({
      defaults: [],
      moved: [],
    });
  });
});

describe('pickMcc', () => {
  const ALL = [...CATEGORIES, builtin('cat.subscriptions'), builtin('cat.shopping')];
  const expense = (description: string) => ({ kind: 'expense' as const, description });

  it('takes the first source that has a listed code: file, sector, history, then Claude', () => {
    const all = { file: '5812', sector: '5411', history: '5499', ai: '5999' };
    expect(pickMcc(expense('Cafe'), all, ALL)).toEqual({ mcc: '5812', source: 'file' });
    expect(pickMcc(expense('Cafe'), { ...all, file: undefined }, ALL)).toEqual({
      mcc: '5411',
      source: 'sector',
    });
    expect(pickMcc(expense('Cafe'), { history: '5499', ai: '5999' }, ALL)).toEqual({
      mcc: '5499',
      source: 'history',
    });
    expect(pickMcc(expense('Cafe'), { ai: '5999' }, ALL)).toEqual({ mcc: '5999', source: 'ai' });
    expect(pickMcc(expense('Cafe'), { file: '9999', ai: '5999' }, ALL)).toEqual({
      mcc: '5999',
      source: 'ai',
    });
    expect(pickMcc(expense('Cafe'), {}, ALL)).toBeUndefined();
  });

  it('drops Claude’s code when it files the row somewhere a name rule says it is not (Review Focus 2)', () => {
    // Netflix is a subscription by name; 5411 would file it as groceries, and then spread through history.
    expect(pickMcc(expense('Netflix'), { ai: '5411' }, ALL)).toBeUndefined();
    expect(pickMcc(expense('Netflix'), { ai: '5968' }, ALL)).toEqual({ mcc: '5968', source: 'ai' });
    // A code from the file or the card company's sector is the document's word, and is kept.
    expect(pickMcc(expense('Netflix'), { sector: '5411' }, ALL)).toEqual({ mcc: '5411', source: 'sector' });
    expect(pickMcc(expense('Netflix'), { file: '5411' }, ALL)).toEqual({ mcc: '5411', source: 'file' });
  });

  it('gives income none, whatever any source says', () => {
    expect(
      pickMcc({ kind: 'income', description: 'Cafe' }, { file: '5812', ai: '5812' }, ALL),
    ).toBeUndefined();
  });
});

describe('chooseExpenseCategory: the order of spec §3, one case per step', () => {
  const ALL = [
    ...CATEGORIES,
    builtin('cat.subscriptions'),
    builtin('cat.loans'),
    custom('c.coffee'),
    builtin('cat.salary', { kind: 'income' }),
  ];
  const expense = (description: string) => ({ kind: 'expense' as const, description });

  it('1. a well-known name beats the business type', () => {
    expect(chooseExpenseCategory(expense('Netflix'), { mcc: '5812' }, ALL)).toBe('cat.subscriptions');
  });

  it('2. the person’s own choice for this merchant beats the business type', () => {
    expect(chooseExpenseCategory(expense('Cafe'), { history: 'c.coffee', mcc: '5812' }, ALL)).toBe(
      'c.coffee',
    );
  });

  it('3. the business type beats the row’s own words and Claude', () => {
    expect(chooseExpenseCategory(expense('הלוואה מהבנק'), { mcc: '5812', claude: 'cat.travel' }, ALL)).toBe(
      'cat.dining',
    );
  });

  it('4. the row’s own words, then 5. Claude’s category, then nothing', () => {
    expect(chooseExpenseCategory(expense('הלוואה מהבנק'), { claude: 'cat.travel' }, ALL)).toBe('cat.loans');
    expect(chooseExpenseCategory(expense('Cafe'), { claude: 'cat.travel' }, ALL)).toBe('cat.travel');
    expect(chooseExpenseCategory(expense('Cafe'), {}, ALL)).toBeUndefined();
  });

  it('3. lets a business type that only falls through to Other decide nothing (final review C1)', () => {
    const all = [...ALL, builtin('cat.arnona'), builtin('cat.buildingFee')];
    // Claude's Arnona over its own vague 9311 (tax payments).
    expect(
      chooseExpenseCategory(expense('ארנונה עיריית תל אביב'), { mcc: '9311', claude: 'cat.arnona' }, all),
    ).toBe('cat.arnona');
    // The loan rule over 6012 (financial institutions).
    expect(chooseExpenseCategory(expense('פירעון הלוואה'), { mcc: '6012' }, all)).toBe('cat.loans');
    // Claude's building fee over 8641 (associations).
    expect(chooseExpenseCategory(expense('ועד בית'), { mcc: '8641', claude: 'cat.buildingFee' }, all)).toBe(
      'cat.buildingFee',
    );
    // Nothing else known: the caller's Other, as before.
    expect(chooseExpenseCategory(expense('Somewhere'), { mcc: '9311' }, all)).toBeUndefined();
    // The person moved 9311 into Other themselves: that is a decision, and it stands.
    const moved = all.map((c) => (c.id === 'cat.otherExpense' ? { ...c, mccs: ['9311'] } : c));
    expect(
      chooseExpenseCategory(expense('ארנונה עיריית תל אביב'), { mcc: '9311', claude: 'cat.arnona' }, moved),
    ).toBe('cat.otherExpense');
  });

  it('never takes a choice that is archived, missing, or of the other kind', () => {
    const archived = ALL.map((c) => (c.id === 'c.coffee' ? { ...c, isArchived: 1 as const } : c));
    expect(chooseExpenseCategory(expense('Cafe'), { history: 'c.coffee', mcc: '5812' }, archived)).toBe(
      'cat.dining',
    );
    expect(
      chooseExpenseCategory(expense('Cafe'), { history: 'c.gone', claude: 'cat.salary' }, ALL),
    ).toBeUndefined();
  });

  it('never maps income through the business type', () => {
    expect(
      chooseExpenseCategory({ kind: 'income', description: 'Cafe' }, { mcc: '5812' }, ALL),
    ).toBeUndefined();
    expect(
      chooseExpenseCategory({ kind: 'income', description: 'Pay' }, { history: 'cat.salary' }, ALL),
    ).toBe('cat.salary');
  });
});

describe('isCashWithdrawal', () => {
  it('is 6010 and 6011 only', () => {
    expect(isCashWithdrawal('6010')).toBe(true);
    expect(isCashWithdrawal('6011')).toBe(true);
    expect(isCashWithdrawal('6051')).toBe(false);
    expect(isCashWithdrawal(undefined)).toBe(false);
  });
});
