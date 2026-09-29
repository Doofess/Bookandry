import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { initAccount, type AccountView } from '@/app/account';
import { freshDb } from '@/test/db-harness';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { AccountCard } from './account-card';
import { AccountSheet, type Flow } from './account-sheet';
import { LockScreen } from './lock-screen';

/*
 * The screens' rules, not their styling: what each answer does, what is never
 * chosen for the person, and what stays disabled until they have chosen. The
 * logic behind them is tested against real Postgres in src/db/sync.
 */

const controller = initAccount(freshDb().db);

beforeAll(async () => {
  await initTestI18n();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function open(flow: Flow) {
  const onClose = vi.fn();
  renderWithProviders(<AccountSheet flow={flow} onClose={onClose} />);
  return { onClose, user: userEvent.setup() };
}

function signedIn(keys: Extract<AccountView, { status: 'signed_in' }>['keys']): AccountView {
  return {
    status: 'signed_in',
    user: { id: 'u1', email: 'dana@example.com', provider: 'google' },
    keys,
    sync: undefined,
    passwordRecovery: false,
  };
}

function showCard(view: AccountView) {
  vi.spyOn(controller, 'getView').mockReturnValue(view);
  renderWithProviders(<AccountCard />);
  return userEvent.setup();
}

describe('signing out', () => {
  it('sends what is waiting first, then signs out and clears the device when asked', async () => {
    vi.spyOn(controller, 'unsavedChanges').mockResolvedValue(0);
    const signOut = vi.spyOn(controller, 'signOut').mockResolvedValue();
    const { onClose, user } = open({ kind: 'signout' });

    expect(screen.getByRole('status')).toHaveTextContent(/saving your latest changes/i);
    const confirm = await screen.findByRole('button', { name: 'Sign out' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();

    await user.click(confirm);
    expect(signOut).toHaveBeenCalledWith();
    expect(onClose).toHaveBeenCalled();
  });

  it('warns when changes have not reached the account, and says how many', async () => {
    vi.spyOn(controller, 'unsavedChanges').mockResolvedValue(3);
    const signOut = vi.spyOn(controller, 'signOut').mockResolvedValue();
    const { user } = open({ kind: 'signout' });

    expect(await screen.findByRole('alert')).toHaveTextContent(/3 changes haven't reached your account/);
    await user.click(screen.getByRole('button', { name: 'Sign out anyway' }));
    expect(signOut).toHaveBeenCalled();
  });

  it('signs out the other devices only when confirmed', async () => {
    const others = vi.spyOn(controller, 'signOutOthers').mockResolvedValue();
    const { onClose, user } = open({ kind: 'signOutOthers' });
    expect(others).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Sign out all other devices' }));
    expect(others).toHaveBeenCalled();
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('says so, and stays open, when it does not work', async () => {
    vi.spyOn(controller, 'signOutOthers').mockRejectedValue(new Error('offline'));
    const { onClose, user } = open({ kind: 'signOutOthers' });
    await user.click(screen.getByRole('button', { name: 'Sign out all other devices' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('the account card', () => {
  it('says the data is safe, and asks nothing', () => {
    showCard(signedIn({ kind: 'ready' }));
    expect(screen.getByText('Everything is saved to your account.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sync|try again/i })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/sync|passphrase|recovery key/i);
  });

  it('offers a retry only when the account cannot be reached', async () => {
    const retry = vi.spyOn(controller, 'retry').mockReturnValue();
    const view = signedIn({ kind: 'ready' });
    const user = showCard({ ...view, sync: { kind: 'error' } } as AccountView);
    expect(screen.getByText(/couldn't reach your account/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('lets the person choose how soon an idle device locks, per device', async () => {
    const user = showCard(signedIn({ kind: 'ready' }));
    const group = screen.getByRole('radiogroup', { name: 'Lock after inactivity' });
    expect(within(group).getByRole('radio', { name: '15 min' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(group).getByRole('radio', { name: '1 hour' }));
    expect(localStorage.getItem('bookandry.lockAfter')).toBe('60');
  });

  it('pauses, and says why, when the server offers an older key', () => {
    showCard(signedIn({ kind: 'rolled_back' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/something is wrong with your account/i);
  });
});

describe('the lock screen', () => {
  it('names the account and offers only signing in, or removing the data', async () => {
    const remove = vi.spyOn(controller, 'removeFromDevice').mockResolvedValue();
    renderWithProviders(<LockScreen email="dana@example.com" idle />);
    const user = userEvent.setup();

    expect(screen.getByRole('heading', { name: 'Locked' })).toBeInTheDocument();
    expect(screen.getByText(/sign in as dana@example.com/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create an account/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove this data from the device' }));
    expect(remove).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove this data from the device' }));
    expect(remove).toHaveBeenCalled();
  });
});
