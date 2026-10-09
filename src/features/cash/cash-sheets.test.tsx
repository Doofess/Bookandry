import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsProvider } from '@/app/settings-provider';
import { db } from '@/db/db';
import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { d } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';
import { ALL_PROFILES, type CashMove, type PaymentMethod, type Profile } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal<object>()), toast: toastMock }));
vi.mock('@/app/account', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAccount: () => ({ status: 'signed_out' }),
}));

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
const leumi: PaymentMethod = {
  id: 'pm.leumi',
  profileId: 'p1',
  type: 'bank_account',
  label: 'Leumi current',
  account: { bank: '10', holding: 'personal' },
  isArchived: 0,
  createdAt: NOW,
  updatedAt: NOW,
};
const amount = () => screen.findByTestId('cash-amount');
const withdrawals = async () =>
  (await db.cashMoves.toArray()).filter((m) => m.kind === 'withdraw' && m.isDeleted === 0);

async function openMenuItem(user: ReturnType<typeof userEvent.setup>, name: RegExp): Promise<void> {
  await user.click(await screen.findByTestId('add-button'));
  await user.click(await screen.findByRole('menuitem', { name }));
}

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(async () => {
  toastMock.mockClear();
  // The pickers' list (cmdk) measures itself; jsdom has nothing to measure with.
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
  await Promise.all([
    db.cashMoves.clear(),
    db.transactions.clear(),
    db.overrides.clear(),
    db.profiles.clear(),
  ]);
  await db.paymentMethods.delete('pm.leumi');
  await db.profiles.bulkPut([person('p1', 'Dana', '#16794a'), person('p2', 'Yossi', '#0369a1')]);
});

describe('the cash Add menu', () => {
  it('offers withdraw, deposit and count, a divider, then cash expense and income', async () => {
    const user = userEvent.setup();
    await db.cashMoves.put(move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }));
    render();
    await user.click(await screen.findByTestId('add-button'));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'Withdraw from ATMFrom the bank into cash',
      'Deposit to the bankFrom cash into the bank',
      'Count my cashMake the figure match the wallet',
      'Cash expensePaid in cash',
      'Cash incomeReceived in cash',
    ]);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('holds the cash moves back until someone has said how much they have', async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByTestId('add-button'));
    const items = await screen.findAllByRole('menuitem');
    for (const item of items.slice(0, 3)) {
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveTextContent('Say how much cash you have first');
    }
    expect(items[3]).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('opens the normal form, paid in cash, for a cash expense', async () => {
    const user = userEvent.setup();
    render();
    await openMenuItem(user, /^Cash expense/);
    const dialog = await screen.findByRole('dialog', { name: 'New transaction' });
    expect(within(dialog).getByRole('combobox', { name: /Paid with/ })).toHaveAccessibleName(/Cash/);
  });
});

describe('a withdrawal', () => {
  beforeEach(async () => {
    await db.cashMoves.put(move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }));
    await db.paymentMethods.put(leumi);
  });

  it('is saved with its account, moves the cash and not the balance, and can be undone', async () => {
    const user = userEvent.setup();
    render();
    await openMenuItem(user, /^Withdraw from ATM/);
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw from ATM' });
    const save = within(dialog).getByRole('button', { name: 'Save' });
    const field = within(dialog).getByLabelText('Amount');

    expect(save).toBeDisabled();
    await user.type(field, '0');
    expect(save).toBeDisabled();
    await user.clear(field);
    await user.type(field, '200');
    await user.click(within(dialog).getByRole('combobox', { name: /Bank account/ }));
    await user.click(await screen.findByRole('option', { name: /Leumi current/ }));
    await user.click(save);

    await waitFor(async () => {
      expect(await withdrawals()).toMatchObject([
        { profileId: 'p1', amountMinor: 20_000, accountId: 'pm.leumi', date: '2026-09-15' },
      ]);
    });
    await waitFor(async () => {
      expect((await amount()).querySelector('[data-value]')).toHaveAttribute('data-value', '70000');
    });
    expect(await db.transactions.count()).toBe(0);

    const [message, options] = toastMock.mock.calls.at(-1) as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe('Saved');
    expect(options.action.label).toBe('Undo');
    options.action.onClick();
    await waitFor(async () => {
      expect(await withdrawals()).toEqual([]);
    });
  });

  it('is changed and deleted from its row in the activity', async () => {
    const user = userEvent.setup();
    await db.cashMoves.put(move({ id: 'w1', kind: 'withdraw', amountMinor: 20_000, date: d('2026-09-05') }));
    render();
    const list = await screen.findByRole('region', { name: 'Activity' });
    await user.click(within(list).getByRole('button', { name: /Withdrawn from the ATM/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw from ATM' });
    const field = within(dialog).getByLabelText('Amount');
    expect(field).toHaveValue('200.00');
    await user.clear(field);
    await user.type(field, '250');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      expect((await db.cashMoves.get('w1'))?.amountMinor).toBe(25_000);
    });

    await user.click(
      within(await screen.findByRole('region', { name: 'Activity' })).getByRole('button', {
        name: /Withdrawn from the ATM/,
      }),
    );
    const again = await screen.findByRole('dialog', { name: 'Withdraw from ATM' });
    await user.click(within(again).getByRole('button', { name: 'Delete' }));
    await waitFor(async () => {
      expect((await db.cashMoves.get('w1'))?.isDeleted).toBe(1);
    });
  });

  it('returns a person to setting up when their starting amount is deleted', async () => {
    const user = userEvent.setup();
    render();
    const list = await screen.findByRole('region', { name: 'Activity' });
    await user.click(within(list).getByRole('button', { name: /Cash when you started/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Cash when you started' });
    expect(within(dialog).queryByRole('combobox', { name: /Bank account/ })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByTestId('cash-setup')).toBeInTheDocument();
  });
});

describe('Count my cash', () => {
  it('shows the difference against the chosen person’s own cash, and records it for them', async () => {
    const user = userEvent.setup();
    await db.cashMoves.bulkPut([
      move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }),
      move({ id: 's2', profileId: 'p2', kind: 'start', amountMinor: 30_000, date: d('2026-09-01') }),
    ]);
    render(ALL_PROFILES);
    await openMenuItem(user, /^Count my cash/);
    const dialog = await screen.findByRole('dialog', { name: 'Count my cash' });

    await user.click(within(dialog).getByRole('radio', { name: 'Yossi' }));
    expect(
      within(dialog)
        .getByText(/^Recorded:/)
        .querySelector('[data-value="30000"]'),
    ).not.toBeNull();
    await user.type(within(dialog).getByLabelText('How much is in the wallet now?'), '280');
    const difference = within(dialog).getByTestId('count-difference');
    expect(difference).toHaveTextContent(/missing$/);
    expect(difference.querySelector('[data-value="2000"]')).not.toBeNull();

    await user.clear(within(dialog).getByLabelText('How much is in the wallet now?'));
    await user.type(within(dialog).getByLabelText('How much is in the wallet now?'), '312');
    expect(difference).toHaveTextContent(/more than recorded$/);

    await user.clear(within(dialog).getByLabelText('How much is in the wallet now?'));
    await user.type(within(dialog).getByLabelText('How much is in the wallet now?'), '280');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      expect(await db.transactions.toArray()).toMatchObject([
        { profileId: 'p2', kind: 'expense', categoryId: 'cat.cash_missing', cashCount: true },
      ]);
    });
    expect(toastMock).toHaveBeenLastCalledWith('Recorded as cash missing', expect.anything());
  });

  it('records a count that matched, which moves only "Counted"', async () => {
    const user = userEvent.setup();
    await db.cashMoves.put(move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }));
    render();
    await openMenuItem(user, /^Count my cash/);
    const dialog = await screen.findByRole('dialog', { name: 'Count my cash' });
    await user.type(within(dialog).getByLabelText('How much is in the wallet now?'), '500');
    expect(within(dialog).getByTestId('count-difference')).toHaveTextContent('Matches what is recorded');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect(await screen.findByTestId('cash-counted')).toHaveTextContent('Counted Sep 15, 2026');
    });
    expect(await db.transactions.count()).toBe(0);
  });
});

/** Two submits in one tick, before React has re-rendered: a double tap, or Enter held down. */
async function submitTwice(form: HTMLFormElement): Promise<void> {
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

describe('saving a move', () => {
  beforeEach(async () => {
    await db.cashMoves.put(move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }));
  });

  it('writes one withdrawal for a double tap', async () => {
    const user = userEvent.setup();
    render();
    await openMenuItem(user, /^Withdraw from ATM/);
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw from ATM' });
    await user.type(within(dialog).getByLabelText('Amount'), '40');
    const form = within(dialog).getByRole('button', { name: 'Save' }).closest('form');
    if (form === null) throw new Error('no form');
    await submitTwice(form);
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith('Saved', expect.anything());
    });
    expect(await withdrawals()).toHaveLength(1);
  });

  it('says at the note when it is too long, and writes nothing', async () => {
    const user = userEvent.setup();
    render();
    await openMenuItem(user, /^Withdraw from ATM/);
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw from ATM' });
    await user.type(within(dialog).getByLabelText('Amount'), '40');
    const note = within(dialog).getByLabelText('Note');
    await user.click(note);
    await user.paste('x'.repeat(2001));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Notes are limited to 2000 characters.');
    expect(note).toHaveAttribute('aria-invalid', 'true');
    expect(note).toHaveAttribute('aria-describedby', alert.id);
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(await withdrawals()).toEqual([]);

    await user.type(note, '{Backspace}');
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('says so when a starting amount is moved to someone who already has one', async () => {
    const user = userEvent.setup();
    await db.cashMoves.put(
      move({ id: 's2', profileId: 'p2', kind: 'start', amountMinor: 30_000, date: d('2026-09-01') }),
    );
    render(ALL_PROFILES);
    const list = await screen.findByRole('region', { name: 'Activity' });
    const [first] = within(list).getAllByRole('button', { name: /Cash when you started/ });
    if (first === undefined) throw new Error('no start row');
    await user.click(first);
    const dialog = await screen.findByRole('dialog', { name: 'Cash when you started' });
    const other = within(dialog)
      .getAllByRole('radio')
      .find((r) => r.getAttribute('aria-checked') !== 'true');
    if (other === undefined) throw new Error('no other person');
    await user.click(other);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      `${other.textContent} already has a starting amount.`,
    );
    expect(toastMock.error).not.toHaveBeenCalled();
    expect((await db.cashMoves.get('s1'))?.profileId).toBe('p1');
    expect((await db.cashMoves.get('s2'))?.profileId).toBe('p2');
  });

  it('writes one count for a double tap', async () => {
    const user = userEvent.setup();
    render();
    await openMenuItem(user, /^Count my cash/);
    const dialog = await screen.findByRole('dialog', { name: 'Count my cash' });
    await user.type(within(dialog).getByLabelText('How much is in the wallet now?'), '500');
    const form = within(dialog).getByRole('button', { name: 'Save' }).closest('form');
    if (form === null) throw new Error('no form');
    await submitTwice(form);
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith('Counted. It matches.', expect.anything());
    });
    const counts = (await db.cashMoves.toArray()).filter((m) => m.kind === 'count');
    expect(counts).toHaveLength(1);
  });
});
