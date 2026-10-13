import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsProvider } from '@/app/settings-provider';
import { db } from '@/db/db';
import { materialize } from '@/db/materialize';
import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { buildSeedCategories } from '@/db/seed';
import { d, MONEY } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Category, Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

const toasts = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) as Mock & { error: Mock },
}));
vi.mock('@/app/account', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAccount: () => ({ status: 'signed_out' }),
}));
vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal<object>()), ...toasts }));

const { CategoriesScreen } = await import('./categories-screen');

const NOW = '2026-09-10T10:00:00.000Z' as IsoInstant;
const SETTINGS = { ...DEFAULT_SETTINGS, updatedAt: instantFromMs(Date.parse(NOW)) };
const renderScreen = () =>
  renderWithProviders(
    <SettingsProvider value={SETTINGS}>
      <CategoriesScreen />
    </SettingsProvider>,
  );
const coffee = {
  id: 'c.coffee',
  kind: 'expense',
  icon: 'Circle',
  sortOrder: 50,
  isArchived: 0,
  source: 'custom',
  name: 'Coffee',
  createdAt: NOW,
  updatedAt: NOW,
} as Category;
const expense = (id: string, categoryId: string, amountMinor: number): Transaction =>
  materialize({
    id,
    profileId: 'p1',
    kind: 'expense',
    categoryId,
    money: { ...MONEY, amountMinor, baseAmountMinor: amountMinor },
    recurrence: { type: 'one_time' },
    date: d('2026-09-02'),
    seriesRootId: id,
    createdAt: NOW,
    updatedAt: NOW,
  });

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
  await db.categories.clear();
  await db.transactions.clear();
  await db.categories.bulkPut([...buildSeedCategories(NOW), coffee]);
  await db.transactions.bulkPut([expense('t1', 'cat.groceries', 90_000), expense('t2', 'cat.rent', 450_000)]);
});

describe('the categories screen', () => {
  it('shows expenses and incomes as two sheets of rows, each led by its hue pill, with this month as hue bars', async () => {
    const { container } = renderScreen();
    const expenses = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('[data-slot="categories-expense"]');
      expect(el).not.toBeNull();
      return el!;
    });
    const income = container.querySelector<HTMLElement>('[data-slot="categories-income"]');
    expect(income).not.toBeNull();

    await waitFor(() => {
      expect(container.querySelectorAll('[data-slot="category-row"]').length).toBeGreaterThan(10);
    });
    const rows = container.querySelectorAll('[data-slot="category-row"]');
    for (const row of rows) expect(row.querySelector('[data-slot="hue-pill"]')).not.toBeNull();

    await waitFor(() => {
      expect(expenses.querySelectorAll('[data-slot="hue-bars"] i[data-hue]')).toHaveLength(2);
    });
    expect(within(expenses).getByRole('button', { name: 'Business types: Groceries' })).toBeInTheDocument();
  }, 15_000);

  it("saves the hue chosen in a custom category's editor on its row", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Rename category: Coffee' }));
    await user.click(await screen.findByRole('radio', { name: 'Indigo, deeper' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect((await db.categories.get('c.coffee'))?.hue).toBe('indigo-2');
    });
    await waitFor(() => {
      const row = [...container.querySelectorAll('[data-slot="category-row"]')].find((r) =>
        r.textContent.includes('Coffee'),
      );
      expect(row?.querySelector('[data-slot="hue-pill"]')?.getAttribute('data-hue')).toBe('indigo-2');
    });
  }, 15_000);
});
