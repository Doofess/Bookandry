import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsProvider } from '@/app/settings-provider';
import { db } from '@/db/db';
import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { d, makeTx, MONEY } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';
import { ALL_PROFILES, CASH_METHOD_ID, type CashMove, type Profile, type Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

const toasts = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) as Mock & { error: Mock },
}));

vi.mock('@/app/account', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAccount: () => ({ status: 'signed_out' }),
}));
vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal<object>()), ...toasts }));

const { CashScreen } = await import('./cash-screen');

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;

const render = (activeProfileId = 'p1') =>
  renderWithProviders(
    <SettingsProvider
      value={{
        ...DEFAULT_SETTINGS,
        activeProfileId,
        defaultCurrency: 'USD',
        updatedAt: instantFromMs(Date.parse(NOW)),
      }}
    >
      <CashScreen />
    </SettingsProvider>,
    { route: '/cash' },
  );

const person = (id: string, name: string, color: string): Profile => ({
  id,
  name,
  color,
  openingBalanceMinor: 0,
  openingBalanceCurrency: 'USD',
  openingBalanceDate: d('2026-01-01'),
  createdAt: NOW,
  updatedAt: NOW,
});

const move = (
  over: Partial<CashMove> & Pick<CashMove, 'id' | 'kind' | 'amountMinor' | 'date'>,
): CashMove => ({
  profileId: 'p1',
  isDeleted: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const cashRow = (id: string, date: string, minor: number, over: Partial<Transaction> = {}) =>
  makeTx({
    id,
    date: d(date),
    recurrence: { type: 'one_time' },
    paymentMethodId: CASH_METHOD_ID,
    money: { ...MONEY, amountMinor: minor, baseAmountMinor: minor },
    ...over,
  });

const amount = () => screen.findByTestId('cash-amount');

/** The Undo of the latest toast. */
const lastUndo = () => {
  const [, options] = toasts.toast.mock.lastCall as [string, { action: { onClick: () => void } }];
  return options.action.onClick;
};

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(async () => {
  toasts.toast.mockClear();
  toasts.toast.error.mockClear();
  await Promise.all([
    db.cashMoves.clear(),
    db.transactions.clear(),
    db.overrides.clear(),
    db.profiles.clear(),
  ]);
  await db.profiles.bulkPut([person('p1', 'Dana', '#16794a'), person('p2', 'Yossi', '#0369a1')]);
});

describe('setting up', () => {
  it('asks someone who has not set up how much cash they have, and starts from it', async () => {
    const user = userEvent.setup();
    render();

    const card = await screen.findByTestId('cash-setup');
    expect(within(card).getByRole('heading', { name: 'How much cash do you have now?' })).toBeInTheDocument();
    expect(screen.queryByTestId('cash-amount')).toBeNull();

    await user.type(within(card).getByLabelText('Amount'), '500');
    await user.click(within(card).getByRole('button', { name: 'Save' }));

    expect((await amount()).querySelector('[data-value]')).toHaveAttribute('data-value', '50000');
    expect(await db.cashMoves.toArray()).toMatchObject([
      { profileId: 'p1', kind: 'start', amountMinor: 50_000, date: '2026-09-15' },
    ]);
    expect(screen.queryByTestId('cash-setup')).toBeNull();
  });

  it('can take the setup back from its toast', async () => {
    const user = userEvent.setup();
    render();

    const card = await screen.findByTestId('cash-setup');
    await user.type(within(card).getByLabelText('Amount'), '500');
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    await amount();
    expect(toasts.toast).toHaveBeenLastCalledWith('Cash on hand saved', expect.anything());

    lastUndo()();
    expect(await screen.findByTestId('cash-setup')).toBeInTheDocument();
    expect(await db.cashMoves.count()).toBe(0);
  });

  it('shows, for everyone, the pot of those who set up and asks those who have not', async () => {
    await db.cashMoves.put(move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }));
    render(ALL_PROFILES);

    expect((await amount()).querySelector('[data-value]')).toHaveAttribute('data-value', '50000');
    const cards = await screen.findAllByTestId('cash-setup');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('Yossi');
  });
});

describe('two starting amounts', () => {
  beforeEach(async () => {
    // Two devices set up offline, then synced: two live starts for Dana.
    await db.cashMoves.bulkPut([
      move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }),
      move({ id: 's2', kind: 'start', amountMinor: 20_000, date: d('2026-09-03') }),
    ]);
  });

  it('keeps the earlier one when asked, and can put the other back', async () => {
    const user = userEvent.setup();
    render();

    const fix = await screen.findByTestId('cash-two-starts');
    expect(fix).toHaveTextContent('Two starting amounts were recorded for Dana. Keep the earlier one?');

    await user.click(within(fix).getByRole('button', { name: 'Keep the earlier one' }));

    await waitFor(() => {
      expect(screen.queryByTestId('cash-two-starts')).toBeNull();
    });
    expect((await amount()).querySelector('[data-value]')).toHaveAttribute('data-value', '50000');
    expect(await db.cashMoves.get('s1')).toMatchObject({ isDeleted: 0 });
    expect(await db.cashMoves.get('s2')).toMatchObject({ isDeleted: 1 });
    expect(toasts.toast).toHaveBeenLastCalledWith('Kept the earlier starting amount', expect.anything());

    lastUndo()();
    expect(await screen.findByTestId('cash-two-starts')).toBeInTheDocument();
    expect(await db.cashMoves.get('s2')).toMatchObject({ isDeleted: 0 });
  });

  it('asks only about the person who has two', async () => {
    await db.cashMoves.put(
      move({ id: 'y1', profileId: 'p2', kind: 'start', amountMinor: 1_000, date: d('2026-09-02') }),
    );
    render(ALL_PROFILES);

    const fixes = await screen.findAllByTestId('cash-two-starts');
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toHaveTextContent('Dana');
  });

  it('is not asked in the view of someone else', async () => {
    render('p2');
    await screen.findByTestId('cash-setup');
    expect(screen.queryByTestId('cash-two-starts')).toBeNull();
  });
});

describe('the figure', () => {
  it('shows the cash on hand, when it was counted, and says so when it is below zero', async () => {
    await db.cashMoves.put(move({ id: 's1', kind: 'start', amountMinor: 10_000, date: d('2026-09-01') }));
    await db.transactions.put(cashRow('big', '2026-09-10', 30_000));
    render();

    expect((await amount()).querySelector('[data-value]')).toHaveAttribute('data-value', '-20000');
    expect(screen.getByTestId('cash-counted')).toHaveTextContent('Counted Sep 1, 2026');
    expect(screen.getByText('More spent in cash than you have. Count your cash?')).toBeInTheDocument();
  });

  it('shows what is still to come this month, apart from what is on hand', async () => {
    await db.cashMoves.put(move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }));
    await db.transactions.bulkPut([
      cashRow('gift', '2026-09-20', 10_000, {
        kind: 'income',
        categoryId: 'cat.gift',
        paymentMethodId: undefined,
        destinationId: CASH_METHOD_ID,
      }),
      cashRow('market', '2026-09-25', 4_000),
    ]);
    render();

    expect((await amount()).querySelector('[data-value]')).toHaveAttribute('data-value', '50000');
    const expected = await screen.findByTestId('cash-expected');
    expect(expected.querySelector('[data-value="10000"]')).not.toBeNull();
    expect(expected.querySelector('[data-value="4000"]')).not.toBeNull();
  });
});

describe('the activity', () => {
  beforeEach(async () => {
    await db.cashMoves.bulkPut([
      move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }),
      move({ id: 'w1', kind: 'withdraw', amountMinor: 20_000, date: d('2026-09-05'), accountId: 'pm.gone' }),
    ]);
    await db.transactions.put(
      cashRow('rc', '2026-09-10', 1_000, { categoryId: 'cat.cash_missing', cashCount: true }),
    );
  });

  it('lists what moved the cash, newest first, and tags a recount', async () => {
    render();
    const list = await screen.findByRole('region', { name: 'Activity' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Recount'),
      expect.stringContaining('Withdrawn from the ATM'),
      expect.stringContaining('Cash when you started'),
    ]);
    // The account it came from is gone: the label falls back, the money stays.
    expect(rows[1]).toHaveTextContent('A bank account');
  });

  it('opens a cash payment in the edit form, as the feed does', async () => {
    const user = userEvent.setup();
    render();
    const list = await screen.findByRole('region', { name: 'Activity' });
    await user.click(within(list).getByRole('button', { name: /Recount/ }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit transaction' })).toBeInTheDocument();
    });
  });
});
