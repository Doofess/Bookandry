import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { MONEY, d } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Category, Occurrence } from '@/types/domain';

import { CategoriesSheet } from './categories-sheet';

const cat = (id: string, hue?: string) =>
  ({
    id,
    kind: 'expense',
    icon: 'Circle',
    source: 'custom',
    name: id,
    sortOrder: 0,
    isArchived: 0,
    ...(hue ? { hue } : {}),
  }) as unknown as Category;
const spent = (categoryId: string, minor: number, date = '2026-10-03') =>
  ({
    key: `${categoryId}:${date}`,
    date: d(date),
    originalDate: d(date),
    isSkipped: false,
    isProjected: false,
    categoryId,
    money: { ...MONEY, amountMinor: minor, baseAmountMinor: minor },
    transaction: { kind: 'expense', recurrence: { type: 'one_time' } },
  }) as unknown as Occurrence;

beforeAll(async () => {
  await initTestI18n('en');
});

describe('the categories sheet', () => {
  it("draws this month's categories as hue bars, the largest first, with the total and a way to Categories", () => {
    renderWithProviders(
      <CategoriesSheet
        month={d('2026-10-01')}
        today={d('2026-10-09')}
        currency="ILS"
        limit={10}
        categories={
          new Map([
            ['rent', cat('rent', 'indigo')],
            ['food', cat('food', 'green')],
          ])
        }
        occurrences={[spent('food', 284_000), spent('rent', 560_000), spent('food', 1, '2026-10-20')]}
      />,
    );
    expect(document.querySelector('[data-slot="categories-sheet"]')).toHaveAttribute('data-sheet', 'paper');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/October by category/);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/in 2 categories/);
    const bars = document.querySelectorAll('[data-slot="hue-bars"] i[data-hue]');
    expect([...bars].map((bar) => bar.getAttribute('data-hue'))).toEqual(['indigo', 'green']);
    expect(screen.getByRole('link', { name: 'Categories' })).toHaveAttribute('href', '/categories');
  });

  it('says so when nothing was spent yet', () => {
    renderWithProviders(
      <CategoriesSheet
        month={d('2026-10-01')}
        today={d('2026-10-09')}
        currency="ILS"
        limit={10}
        categories={new Map()}
        occurrences={[]}
      />,
    );
    expect(screen.getByText('Nothing spent this month yet.')).toBeInTheDocument();
  });
});
