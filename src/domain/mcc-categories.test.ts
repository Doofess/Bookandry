import { describe, expect, it } from 'vitest';

import type { Category } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { businessTypesOf, categoryForMcc, defaultCategoryForMcc } from './mcc-categories';

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
