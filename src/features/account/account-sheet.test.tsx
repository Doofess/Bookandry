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
  vi.unstubAllGlobals();
  localStorage.clear();
});

function open(flow: Flow) {
  const onClose = vi.fn();
  renderWithProviders(<AccountSheet flow={flow} onClose={onClose} />);
  return { onClose, user: userEvent.setup() };
}

function signedIn(keys: Extract<AccountView, { status: 'signed_in' }>['keys'], twoStep = false): AccountView {
  return {
    status: 'signed_in',
    user: { id: 'u1', email: 'dana@example.com', provider: 'google' },
    keys,
    sync: undefined,
    passwordRecovery: false,
    twoStep,
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

describe('Google', () => {
  it('leaves for Google from its button', async () => {
    const go = vi.spyOn(controller, 'signInWithGoogle').mockResolvedValue({ ok: true });
    const { user } = open({ kind: 'signin', mode: 'signin' });
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(go).toHaveBeenCalled();
  });

  it('says so when the page came back from Google without signing in', () => {
    vi.spyOn(controller, 'signInFailure').mockReturnValue('unknown');
    open({ kind: 'signin', mode: 'signin' });
    expect(screen.getByRole('alert')).toHaveTextContent("That didn't work. Try again.");
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

describe('two-step sign-in', () => {
  it('offers to turn codes on, and off once they are', () => {
    showCard(signedIn({ kind: 'ready' }));
    expect(screen.getByText(/^Off\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument();
  });

  it('says when they are on', () => {
    showCard(signedIn({ kind: 'ready' }, true));
    expect(screen.getByText(/^On\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument();
  });

  it('turns them on only once the app gives a right code', async () => {
    vi.spyOn(controller, 'startTwoStep').mockResolvedValue({
      factorId: 'f1',
      qr: 'data:image/png;base64,AAAA',
      secret: 'ABCDEFGHIJKL',
    });
    const finish = vi
      .spyOn(controller, 'finishTwoStep')
      .mockResolvedValueOnce({ ok: false, reason: 'wrong_code' })
      .mockResolvedValueOnce({ ok: true });
    const { onClose, user } = open({ kind: 'twoStepOn' });

    expect(await screen.findByRole('img', { name: /qr code/i })).toBeInTheDocument();
    expect(screen.getByText('ABCD EFGH IJKL')).toBeInTheDocument();

    const field = screen.getByLabelText('Code');
    const submit = screen.getByRole('button', { name: 'Continue' });
    await user.type(field, '12a3');
    expect(field).toHaveValue('123');
    expect(submit).toBeDisabled();

    await user.type(field, '456');
    await user.click(submit);
    expect(finish).toHaveBeenLastCalledWith('f1', '123456');
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn't work/);
    expect(onClose).not.toHaveBeenCalled();

    await user.type(field, '654321');
    await user.click(submit);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('asks for the code inside the card on a device joining the account', async () => {
    const verify = vi.spyOn(controller, 'verifyCode').mockResolvedValue({ ok: true });
    const cancel = vi.spyOn(controller, 'cancelSecondStep').mockResolvedValue();
    const user = showCard({
      status: 'second_step',
      user: { id: 'u1', email: 'dana@example.com', provider: 'email' },
      owned: false,
    });
    await user.type(screen.getByLabelText('Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(verify).toHaveBeenCalledWith('123456');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(cancel).toHaveBeenCalled();
  });
});

describe('passkeys', () => {
  it('are offered only where the browser has them', () => {
    showCard(signedIn({ kind: 'ready' }));
    expect(screen.queryByText('Passkeys')).not.toBeInTheDocument();
  });

  it('are listed, added and removed', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {
      return undefined;
    });
    const list = vi
      .spyOn(controller, 'listPasskeys')
      .mockResolvedValue([{ id: 'k1', name: 'iCloud Keychain', createdAt: '2026-09-29T10:00:00Z' }]);
    const add = vi.spyOn(controller, 'addPasskey').mockResolvedValue({ ok: false, reason: 'cancelled' });
    const remove = vi.spyOn(controller, 'removePasskey').mockResolvedValue({ ok: true });
    const user = showCard(signedIn({ kind: 'ready' }));

    expect(await screen.findByText('iCloud Keychain')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add a passkey' }));
    expect(add).toHaveBeenCalled();
    // Closing the browser's prompt is not an error.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove iCloud Keychain' }));
    expect(remove).toHaveBeenCalledWith('k1');
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2);
    });
  });

  it('sign in from the sign-in sheet', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {
      return undefined;
    });
    const passkey = vi.spyOn(controller, 'signInWithPasskey').mockResolvedValue({ ok: true });
    const { onClose, user } = open({ kind: 'signin', mode: 'signin' });
    await user.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
    expect(passkey).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
