import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SettingsProvider } from '@/app/settings-provider';
import { db } from '@/db/db';
import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { buildSeedCategories } from '@/db/seed';
import { d, makeTx, MONEY } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { IsoInstant } from '@/types/money';

const { CommitmentsScreen } = await import('./commitments-screen');

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;

function Where() {
  return <output data-testid="where">{useLocation().search}</output>;
}

const render = () =>
  renderWithProviders(
    <SettingsProvider
      value={{ ...DEFAULT_SETTINGS, defaultCurrency: 'USD', updatedAt: instantFromMs(Date.parse(NOW)) }}
    >
      <CommitmentsScreen />
      <Where />
    </SettingsProvider>,
    { route: '/commitments' },
  );

const slot = (container: HTMLElement, name: string) =>
  waitFor(() => {
    const el = container.querySelector<HTMLElement>(`[data-slot="${name}"]`);
    if (el === null) throw new Error(`no ${name}`);
    return el;
  });

const money = (minor: number) => ({ ...MONEY, amountMinor: minor, baseAmountMinor: minor });

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(async () => {
  await Promise.all([db.transactions.clear(), db.overrides.clear(), db.categories.clear()]);
  await db.categories.bulkPut(buildSeedCategories(NOW));
});

const seedMany = async (count: number) => {
  for (let i = 0; i < count; i += 1) {
    await db.transactions.put(
      makeTx({
        id: `bill${String(i)}`,
        date: d(`2026-09-${String(16 + i).padStart(2, '0')}`),
        recurrence: { type: 'monthly', dayOfMonth: 16 + i },
        categoryId: 'cat.groceries',
        note: `Bill ${String(i)}`,
        money: money(1000),
      }),
    );
  }
};

describe('the commitments screen', () => {
  beforeEach(async () => {
    await db.transactions.bulkPut([
      makeTx({
        id: 'rent',
        date: d('2026-09-01'),
        recurrence: { type: 'monthly', dayOfMonth: 1 },
        categoryId: 'cat.rent',
        note: 'Rent',
        money: money(400_000),
      }),
      makeTx({
        id: 'salary',
        date: d('2026-09-10'),
        kind: 'income',
        recurrence: { type: 'monthly', dayOfMonth: 10 },
        categoryId: 'cat.salary',
        note: 'Salary',
        money: money(900_000),
      }),
    ]);
  });

  it('is two paper sheets: the list and the totals', async () => {
    const { container } = render();

    const list = await slot(container, 'commitments-list');
    const totals = container.querySelector('[data-slot="commitments-totals"]');
    expect(list).toHaveAttribute('data-sheet', 'paper');
    expect(totals).toHaveAttribute('data-sheet', 'paper');
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
  });

  it('leads each row with its category hue pill', async () => {
    const { container } = render();

    const list = await slot(container, 'commitments-list');
    const pills = list.querySelectorAll('[data-slot="hue-pill"]');
    expect(pills).toHaveLength(2);
    expect(
      within(list).getByText('Rent').closest('li')?.querySelector('[data-slot="hue-pill"]'),
    ).toHaveAttribute('data-hue', 'indigo');
  });

  it('shows the monthly out and in figures, each in a mark', async () => {
    const { container } = render();

    const totals = await slot(container, 'commitments-totals');
    const marks = [...totals.querySelectorAll('[data-slot="mark"]')];
    expect(marks).toHaveLength(2);
    expect(marks[0]?.querySelector('[data-value]')).toHaveAttribute('data-value', '400000');
    expect(marks[1]?.querySelector('[data-value]')).toHaveAttribute('data-value', '900000');
  });

  it('lists the next charges soonest first', async () => {
    const { container } = render();

    const totals = await slot(container, 'commitments-totals');
    const next = [...totals.querySelectorAll('[data-slot="next-charges"] li')].map((li) => li.textContent);
    expect(next).toHaveLength(2);
    expect(next[0]).toContain('Rent');
    expect(next[1]).toContain('Salary');
  });

  it('opens the edit sheet of the next occurrence when a row is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render();

    const list = await slot(container, 'commitments-list');
    await user.click(within(list).getByRole('button', { name: /Rent/ }));

    expect(screen.getByTestId('where')).toHaveTextContent(/^\?m=2026-10&edit=rent&at=2026-10-01$/);
  });
});

describe('the next charges', () => {
  it('stop at five', async () => {
    await seedMany(7);
    const { container } = render();

    await waitFor(() => {
      expect(container.querySelector('[data-slot="next-charges"]')).not.toBeNull();
    });
    expect(container.querySelectorAll('[data-slot="next-charges"] li')).toHaveLength(5);
  });
});

describe('with nothing repeating', () => {
  it('says so', async () => {
    render();
    expect(await screen.findByText(/Nothing repeats yet/)).toBeInTheDocument();
  });
});
