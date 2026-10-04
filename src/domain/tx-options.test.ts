import { describe, expect, it } from 'vitest';

import { SHARED_OWNER, type Category, type PaymentMethod } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { categoriesFor, methodFits, methodsFor } from './tx-options';

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;

function category(over: Partial<Category> & { id: string }): Category {
  return {
    kind: 'expense',
    icon: 'tag',
    sortOrder: 0,
    isArchived: 0,
    source: 'custom',
    name: over.id,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as Category;
}

function method(over: Partial<PaymentMethod> & { id: string }): PaymentMethod {
  return {
    profileId: 'p1',
    type: 'credit_card',
    label: over.id,
    isArchived: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe('categoriesFor', () => {
  const all = [
    category({ id: 'rent', sortOrder: 2 }),
    category({ id: 'salary', kind: 'income', sortOrder: 1 }),
    category({ id: 'food', sortOrder: 1 }),
    category({ id: 'old', sortOrder: 0, isArchived: 1 }),
  ];

  it('offers only the matching kind', () => {
    // A Salary left selected on an expense files the row under a category the
    // feed groups with the opposite sign.
    expect(categoriesFor(all, 'expense').map((c) => c.id)).toEqual(['food', 'rent']);
    expect(categoriesFor(all, 'income').map((c) => c.id)).toEqual(['salary']);
  });

  it('sorts by the curated order, not alphabetically', () => {
    expect(categoriesFor(all, 'expense')[0]?.id).toBe('food');
  });

  it('hides archived categories', () => {
    expect(categoriesFor(all, 'expense').map((c) => c.id)).not.toContain('old');
  });

  it('keeps an archived category that is already on the row', () => {
    /*
     * Otherwise opening an old transaction blanks its category on sight, and
     * saving moves it somewhere the user never chose - a data change caused by
     * doing nothing at all.
     */
    expect(categoriesFor(all, 'expense', 'old').map((c) => c.id)).toEqual(['old', 'food', 'rent']);
  });

  it('keeps nothing extra when the kept id is not archived', () => {
    expect(categoriesFor(all, 'expense', 'food')).toHaveLength(2);
  });
});

describe('methodsFor', () => {
  const all = [
    method({ id: 'visa', profileId: 'p1', label: 'Visa' }),
    method({ id: 'joint', profileId: SHARED_OWNER, label: 'Household card' }),
    method({ id: 'theirs', profileId: 'p2', label: 'Their card' }),
    method({ id: 'closed', profileId: 'p1', label: 'Old card', isArchived: 1 }),
  ];

  it("offers the profile's own methods and the household's", () => {
    // The sentinel is not decoration: IndexedDB cannot index null, so a null
    // profileId would make every shared method invisible to its own index.
    expect(
      methodsFor(all, 'p1')
        .map((m) => m.id)
        .sort(),
    ).toEqual(['joint', 'visa']);
  });

  it("never offers another profile's method", () => {
    expect(methodsFor(all, 'p1').map((m) => m.id)).not.toContain('theirs');
  });

  it('hides archived methods but keeps one already in use', () => {
    expect(methodsFor(all, 'p1').map((m) => m.id)).not.toContain('closed');
    expect(methodsFor(all, 'p1', 'closed').map((m) => m.id)).toContain('closed');
  });

  it('sorts by label', () => {
    expect(methodsFor(all, 'p1').map((m) => m.label)).toEqual(['Household card', 'Visa']);
  });

  it('is empty for a profile with nothing of its own and no shared methods', () => {
    expect(methodsFor([method({ id: 'theirs', profileId: 'p2' })], 'p1')).toEqual([]);
  });
});

describe('what each kind of transaction can be paid with', () => {
  const card = method({ id: 'visa', type: 'credit_card' });
  const debit = method({ id: 'debit', type: 'debit_card' });
  const cash = method({ id: 'cash', type: 'cash', profileId: SHARED_OWNER });
  const cheque = method({ id: 'cheque', type: 'cheque', profileId: SHARED_OWNER });
  const all = [card, debit, cash, cheque];
  const offered = (mode: Parameters<typeof methodFits>[1], keep = '') =>
    methodsFor(all, 'p1', keep, mode).map((m) => m.id);

  it('a credit plan takes only credit cards', () => {
    expect(offered('credit')).toEqual(['visa']);
  });

  it('a cheque pays once or in instalments, never as a standing order', () => {
    expect(offered('one_time')).toContain('cheque');
    expect(offered('installments')).toContain('cheque');
    expect(offered('standing_order')).not.toContain('cheque');
    expect(methodFits(cheque, 'monthly')).toBe(false);
    expect(methodFits(cheque, 'yearly')).toBe(false);
  });

  it('a loan is paid back any way at all: by the bank, by cheque, in cash, by card', () => {
    expect(offered('loan')).toEqual(['cash', 'cheque', 'debit', 'visa']);
  });

  it('everything else stays on offer outside a credit plan', () => {
    expect(offered('standing_order')).toEqual(['cash', 'debit', 'visa']);
  });

  it('keeps what an old row already uses, even where it would not be offered now', () => {
    expect(offered('credit', 'debit')).toEqual(['debit', 'visa']);
  });
});
