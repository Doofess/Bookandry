import { describe, expect, it } from 'vitest';

import type { Category } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { categoryFromText, knownCategory } from './import-categories';

const NOW = '2026-10-07T00:00:00.000Z' as IsoInstant;
const category = (id: string, kind: 'income' | 'expense', isArchived: 0 | 1 = 0): Category => ({
  id,
  kind,
  icon: 'Circle',
  sortOrder: 0,
  isArchived,
  source: 'builtin',
  nameKey: `categories:builtin.${id.slice(4)}`,
  createdAt: NOW,
  updatedAt: NOW,
});
const household = [category('cat.dining', 'expense'), category('cat.loans', 'expense')];
const expense = (description: string) => ({ kind: 'expense' as const, description });

describe('categoryFromText', () => {
  it('files a loan under Loans, however the statement spells it', () => {
    for (const text of [
      'מקס איט פיננסים - הלוואה',
      'החזר הלואה מקס',
      'הלוואות',
      'פירעון הלוואה',
      'פרעון',
      'Max loan 3/24',
      'LOAN REPAYMENT',
    ]) {
      expect(categoryFromText(expense(text), household), text).toBe('cat.loans');
    }
  });

  it("files a statement's loan plan under Loans, whatever its line says", () => {
    expect(categoryFromText({ ...expense('מקס איט פיננסים'), plan: { mode: 'loan' } }, household)).toBe(
      'cat.loans',
    );
    expect(
      categoryFromText({ ...expense('שופרסל'), plan: { mode: 'installments' } }, household),
    ).toBeUndefined();
  });

  it('files a card company named and nothing more under Other: its bill or its loan, never a restaurant', () => {
    const withOther = [...household, category('cat.otherExpense', 'expense')];
    for (const text of ['מקס איט פיננסים', 'MAX IT FINANCE', 'ישראכרט', 'כאל - חיוב חודשי']) {
      expect(categoryFromText(expense(text), withOther), text).toBe('cat.otherExpense');
    }
    expect(categoryFromText(expense('מקס איט פיננסים - הלוואה'), withOther)).toBe('cat.loans');
    expect(categoryFromText(expense('כאלה ואחרים'), withOther)).toBeUndefined();
  });

  it('leaves everything else to the history and the reading', () => {
    expect(categoryFromText(expense('מקס איט פיננסים'), household)).toBeUndefined();
    expect(categoryFromText(expense('Shufersal'), household)).toBeUndefined();
    // A word that merely contains the letters.
    expect(categoryFromText(expense('Sloane Square'), household)).toBeUndefined();
  });

  it('files only an expense there: a loan paid out to the household is income', () => {
    expect(categoryFromText({ kind: 'income', description: 'הלוואה ממקס' }, household)).toBeUndefined();
  });

  it('says nothing when the household has no Loans category to use', () => {
    expect(categoryFromText(expense('הלוואה'), [category('cat.dining', 'expense')])).toBeUndefined();
    expect(categoryFromText(expense('הלוואה'), [category('cat.loans', 'expense', 1)])).toBeUndefined();
  });
});

describe('knownCategory', () => {
  const all = [
    'cat.subscriptions',
    'cat.transport',
    'cat.fitness',
    'cat.currencyExchange',
    'cat.otherExpense',
    'cat.loans',
    'cat.dining',
  ].map((id) => category(id, 'expense'));

  it('files names everyone knows, whatever the reading or the history says', () => {
    const cases: [string, string][] = [
      ['SPOTIFY P2B3C4D5', 'cat.subscriptions'],
      ['HBO MAX', 'cat.subscriptions'],
      ['Netflix.com', 'cat.subscriptions'],
      ['LIME*RIDE', 'cat.transport'],
      ['Gett', 'cat.transport'],
      ['רב-קו', 'cat.transport'],
      ["Gold's Gym Landmark", 'cat.fitness'],
      ['גולדס ג׳ים', 'cat.fitness'],
      ['הולמס פלייס', 'cat.fitness'],
      ['רכישת מט"ח', 'cat.currencyExchange'],
      ['רכישת מט״ח בסניף', 'cat.currencyExchange'],
      ['מקס איט פיננסים', 'cat.otherExpense'],
      ['מקס', 'cat.otherExpense'],
      ['MAX IT FINANCE', 'cat.otherExpense'],
      ['Max', 'cat.otherExpense'],
    ];
    for (const [text, id] of cases) expect(knownCategory(expense(text), all), text).toBe(id);
  });

  it('leaves alone what only looks like one, a loan, income, and a category the household lacks', () => {
    for (const text of ['מקסים', 'Sublime Cafe', 'Maxim Bakery', 'כאלה', 'Shufersal']) {
      expect(knownCategory(expense(text), all), text).toBeUndefined();
    }
    expect(knownCategory(expense('מקס - הלוואה'), all)).toBeUndefined();
    expect(knownCategory({ kind: 'income', description: 'Spotify' }, all)).toBeUndefined();
    expect(knownCategory(expense('Spotify'), household)).toBeUndefined();
  });
});
