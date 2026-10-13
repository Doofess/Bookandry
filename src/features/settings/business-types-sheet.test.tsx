import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

const NOW = '2026-10-01T10:00:00.000Z' as IsoInstant;
const SETTINGS = { ...DEFAULT_SETTINGS, updatedAt: instantFromMs(Date.parse(NOW)) };
const renderScreen = () =>
  renderWithProviders(
    <SettingsProvider value={SETTINGS}>
      <CategoriesScreen />
    </SettingsProvider>,
  );
const custom = (id: string, name: string, over: Partial<Category> = {}): Category =>
  ({
    id,
    kind: 'expense',
    icon: 'Circle',
    sortOrder: 50,
    isArchived: 0,
    source: 'custom',
    name,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  }) as Category;
const expense = (id: string, over: Partial<Transaction> = {}) =>
  materialize({
    id,
    profileId: 'p1',
    kind: 'expense',
    categoryId: 'cat.dining',
    money: MONEY,
    recurrence: { type: 'one_time' },
    date: d('2026-09-01'),
    mcc: '5812',
    mccSource: 'ai',
    seriesRootId: id,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
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
  toasts.toast.mockClear();
  await db.categories.clear();
  await db.transactions.clear();
  await db.categories.bulkPut([...buildSeedCategories(NOW), custom('c.coffee', 'Coffee')]);
});

async function openTypes(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: `Business types: ${name}` }));
  return screen.findByRole('dialog', { name: `Business types: ${name}` });
}

async function add(
  user: ReturnType<typeof userEvent.setup>,
  sheet: HTMLElement,
  query: string,
  option: RegExp,
) {
  await user.click(within(sheet).getByRole('button', { name: 'Add a business type' }));
  const popout = await screen.findByRole('dialog', { name: 'Business type' });
  await user.type(within(popout).getByPlaceholderText('Search by name or code'), query);
  await user.click(within(popout).getByRole('option', { name: option }));
}

describe('business types per category', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('lists a category’s business types, the first 8 and the rest on request', async () => {
    const user = userEvent.setup();
    renderScreen();
    const dining = await openTypes(user, 'Eating out');
    expect(within(dining).getByText('Restaurant')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    const other = await openTypes(user, 'Other');
    const more = within(other).getByRole('button', { name: /^and \d+ more$/ });
    const shown = within(other).getAllByRole('listitem').length;
    expect(shown).toBe(8);
    await user.click(more);
    expect(within(other).getAllByRole('listitem').length).toBeGreaterThan(8);
  }, 15_000);

  it('adding a business type moves it out of the category it was in', async () => {
    await db.categories.put(custom('c.lunch', 'Lunch', { mccs: ['5812'] }));
    const user = userEvent.setup();
    renderScreen();
    const sheet = await openTypes(user, 'Coffee');
    await add(user, sheet, 'restaurant', /^Restaurant/);

    await waitFor(async () => {
      expect((await db.categories.get('c.coffee'))?.mccs).toEqual(['5812']);
    });
    expect((await db.categories.get('c.lunch'))?.mccs).toEqual([]);
    // Nothing was filed under it before, so nothing is asked.
    expect(screen.queryByRole('alertdialog')).toBeNull();
  }, 15_000);

  it('moves exactly the past expenses the old mapping filed, after asking, and Undo restores them', async () => {
    await db.transactions.bulkPut([
      expense('moves'),
      expense('by-hand', { categoryId: 'cat.groceries' }),
      expense('deleted', { deletedAt: NOW }),
      expense('other-type', { mcc: '5814' }),
    ]);
    const user = userEvent.setup();
    renderScreen();
    const sheet = await openTypes(user, 'Coffee');
    await add(user, sheet, '5812', /^Restaurant/);

    const question = await screen.findByRole('alertdialog', {
      name: 'Move the 1 past expense with this business type here too?',
    });
    await user.click(within(question).getByRole('button', { name: 'Move them' }));
    await waitFor(async () => {
      expect((await db.transactions.get('moves'))?.categoryId).toBe('c.coffee');
    });
    expect((await db.transactions.get('by-hand'))?.categoryId).toBe('cat.groceries');
    expect((await db.transactions.get('deleted'))?.categoryId).toBe('cat.dining');
    expect((await db.transactions.get('other-type'))?.categoryId).toBe('cat.dining');

    const [message, options] = toasts.toast.mock.lastCall as [string, { action: { onClick: () => void } }];
    expect(message).toBe('Moved 1 expense');
    options.action.onClick();
    await waitFor(async () => {
      expect((await db.transactions.get('moves'))?.categoryId).toBe('cat.dining');
    });
  }, 15_000);

  it('does not offer to move past expenses into an archived category, whose moves do not apply', async () => {
    await db.categories.put(custom('c.coffee', 'Coffee', { isArchived: 1 }));
    await db.transactions.put(expense('stays'));
    const user = userEvent.setup();
    renderScreen();
    const sheet = await openTypes(user, 'Coffee');
    await add(user, sheet, '5812', /^Restaurant/);
    await waitFor(async () => {
      expect((await db.categories.get('c.coffee'))?.mccs).toEqual(['5812']);
    });
    // The question, were it asked, follows the move by one more read.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((await db.transactions.get('stays'))?.categoryId).toBe('cat.dining');
  }, 15_000);

  it('"Return to default" gives a moved type back to its default category', async () => {
    await db.categories.put(custom('c.coffee', 'Coffee', { mccs: ['5812'] }));
    const user = userEvent.setup();
    renderScreen();
    const sheet = await openTypes(user, 'Coffee');
    await user.click(within(sheet).getByRole('button', { name: 'Return to default: Restaurant' }));
    await waitFor(async () => {
      expect((await db.categories.get('c.coffee'))?.mccs).toEqual([]);
    });
    expect(await within(sheet).findByText('No business types yet.')).toBeInTheDocument();
  }, 15_000);

  it('says when a category is archived, and offers business types on expense categories only', async () => {
    await db.categories.put(custom('c.coffee', 'Coffee', { mccs: ['5812'], isArchived: 1 }));
    const user = userEvent.setup();
    renderScreen();
    const sheet = await openTypes(user, 'Coffee');
    expect(
      within(sheet).getByText(
        'This category is archived, so meanwhile these business types are filed by default.',
      ),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('radio', { name: 'Income' }));
    // Both sheets are in the page now (one is hidden by width): the income sheet has none.
    const income = document.querySelector<HTMLElement>('[data-slot="categories-income"]');
    expect(income).not.toBeNull();
    expect(within(income!).queryByRole('button', { name: /^Business types:/ })).toBeNull();
  }, 15_000);
});

describe('business types per category, in Hebrew', () => {
  beforeAll(async () => {
    await initTestI18n('he');
  });
  afterAll(async () => {
    await initTestI18n('en');
  });

  it('adds one in Hebrew', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'סוגי עסק: Coffee' }));
    const sheet = await screen.findByRole('dialog', { name: 'סוגי עסק: Coffee' });
    await user.click(within(sheet).getByRole('button', { name: 'הוספת סוג עסק' }));
    const popout = await screen.findByRole('dialog', { name: 'סוג עסק' });
    await user.type(within(popout).getByPlaceholderText('חיפוש לפי שם או קוד'), 'מאפיות');
    await user.click(within(popout).getByRole('option', { name: /^מאפיות/ }));
    await waitFor(async () => {
      expect((await db.categories.get('c.coffee'))?.mccs).toEqual(['5462']);
    });
    expect(await within(sheet).findByText('מאפיות')).toBeInTheDocument();
  }, 15_000);
});
