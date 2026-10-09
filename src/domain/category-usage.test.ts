import { describe, expect, it } from 'vitest';

import type { Category, Occurrence } from '@/types/domain';

import { frequentCategories } from './category-usage';

const cat = (id: string, sortOrder: number, kind: 'expense' | 'income' = 'expense'): Category =>
  ({ id, kind, icon: 'Circle', sortOrder, isArchived: 0 }) as Category;
const used = (categoryId: string, kind: 'expense' | 'income' = 'expense'): Occurrence =>
  ({ categoryId, transaction: { kind } }) as unknown as Occurrence;

const CATS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id, i) => cat(id, i));

describe('frequentCategories', () => {
  it('orders by use, then by the list order, seven of them', () => {
    const occ = [used('h'), used('h'), used('h'), used('c'), used('c'), used('x', 'income')];

    expect(frequentCategories(occ, CATS, 'expense', 'h').map((c) => c.id)).toEqual([
      'h',
      'c',
      'a',
      'b',
      'd',
      'e',
      'f',
    ]);
  });

  it('always shows the current one, in the seventh place when it is not among them', () => {
    expect(frequentCategories([], CATS, 'expense', 'i').map((c) => c.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'i',
    ]);
  });

  it('counts only the row kind', () => {
    expect(
      frequentCategories([used('z', 'income')], [...CATS, cat('z', 99, 'income')], 'expense', 'a'),
    ).not.toContainEqual(expect.objectContaining({ id: 'z' }));
  });
});
