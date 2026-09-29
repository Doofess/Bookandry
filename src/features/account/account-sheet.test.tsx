import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { initAccount, type AccountView } from '@/app/account';
import { freshDb } from '@/test/db-harness';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { AccountCard } from './account-card';
import { AccountSheet, type Flow } from './account-sheet';

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
  it('chooses nothing for the person, and does what they chose', async () => {
    const signOut = vi.spyOn(controller, 'signOut').mockResolvedValue();
    const { onClose, user } = open({ kind: 'signout' });

    const confirm = screen.getByRole('button', { name: 'Sign out' });
    expect(confirm).toBeDisabled();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('radio', { name: /remove it/i }));
    await user.click(confirm);
    expect(signOut).toHaveBeenCalledWith(true);
    expect(onClose).toHaveBeenCalled();
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
  it('asks nothing of a signed-in device but shows it syncing', () => {
    showCard(signedIn({ kind: 'ready' }));
    expect(screen.getByText('Syncing…')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/passphrase|recovery key/i)).not.toBeInTheDocument();
  });

  it("stops at another account's data, and adds it only when asked", async () => {
    const add = vi.spyOn(controller, 'addExistingData').mockResolvedValue();
    const erase = vi.spyOn(controller, 'eraseDevice').mockResolvedValue();
    const user = showCard(signedIn({ kind: 'foreign', profiles: 2, transactions: 40 }));

    expect(screen.getByText(/2 people, 40 transactions/)).toBeInTheDocument();
    expect(add).not.toHaveBeenCalled();
    expect(erase).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Add it to my account' }));
    expect(add).toHaveBeenCalled();
    expect(erase).not.toHaveBeenCalled();
  });

  it('offers to remove it instead', async () => {
    const erase = vi.spyOn(controller, 'eraseDevice').mockResolvedValue();
    const user = showCard(signedIn({ kind: 'foreign', profiles: 1, transactions: 0 }));
    await user.click(screen.getByRole('button', { name: 'Remove it from this device' }));
    expect(erase).toHaveBeenCalled();
  });

  it('starts an old passphrase account over only after a confirmation', async () => {
    const fresh = vi.spyOn(controller, 'startFresh').mockResolvedValue();
    const user = showCard(signedIn({ kind: 'legacy_locked' }));
    await user.click(screen.getByRole('button', { name: /start the synced copy over/i }));
    expect(fresh).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) =>
      /start the synced copy over/i.test(b.textContent),
    );
    if (confirm === undefined) throw new Error('no confirm button in the dialog');
    await user.click(confirm);
    expect(fresh).toHaveBeenCalled();
  });

  it('pauses, and says why, when the server offers an older key', () => {
    showCard(signedIn({ kind: 'rolled_back' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/older lock/i);
  });
});
