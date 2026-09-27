import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { initAccount } from '@/app/account';
import { freshDb } from '@/test/db-harness';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { AccountSheet, type Flow } from './account-sheet';

/*
 * The flows' rules, not their styling: what stays disabled until the person
 * has done the thing that matters, and what each answer from the controller
 * turns into on screen. The controller's own logic is tested against real
 * Postgres in src/db/sync/account.test.ts.
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

const KEY = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-23*';

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
});

describe('turning on sync', () => {
  it('needs a long enough passphrase, typed the same twice', async () => {
    const { user } = open({ kind: 'setup' });
    const submit = screen.getByRole('button', { name: 'Turn on sync' });
    const [first, second] = screen.getAllByLabelText(/sync passphrase|type it again/i);

    await user.type(first!, 'short');
    expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(submit).toBeDisabled();

    await user.clear(first!);
    await user.type(first!, 'a long passphrase');
    await user.type(second!, 'a long passphrasE');
    expect(screen.getByText("The two don't match.")).toBeInTheDocument();
    expect(submit).toBeDisabled();

    await user.clear(second!);
    await user.type(second!, 'a long passphrase');
    expect(submit).toBeEnabled();
  });

  it('shows the recovery key once, and will not finish until it has been kept', async () => {
    const setUp = vi.spyOn(controller, 'setUp').mockResolvedValue({ recoveryKey: KEY });
    const finish = vi.spyOn(controller, 'finishSetUp').mockResolvedValue();
    const { onClose, user } = open({ kind: 'setup' });

    const [first, second] = screen.getAllByLabelText(/sync passphrase|type it again/i);
    await user.type(first!, 'a long passphrase');
    await user.type(second!, 'a long passphrase');
    await user.click(screen.getByRole('button', { name: 'Turn on sync' }));

    expect(setUp).toHaveBeenCalledWith('a long passphrase');
    const shown = await screen.findByLabelText('Recovery key');
    expect(shown).toHaveTextContent(KEY);
    expect(shown).toHaveAttribute('dir', 'ltr');

    const done = screen.getByRole('button', { name: "I've saved it" });
    expect(done).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    // user-event installs its own clipboard; what landed there is what matters.
    expect(await navigator.clipboard.readText()).toBe(KEY);
    expect(done).toBeEnabled();

    await user.click(done);
    expect(finish).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('says so when another device got there first', async () => {
    const { ServerError } = await import('@/services/supabase/transport');
    vi.spyOn(controller, 'setUp').mockRejectedValue(new ServerError('already_set_up'));
    const { user } = open({ kind: 'setup' });
    const [first, second] = screen.getAllByLabelText(/sync passphrase|type it again/i);
    await user.type(first!, 'a long passphrase');
    await user.type(second!, 'a long passphrase');
    await user.click(screen.getByRole('button', { name: 'Turn on sync' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/another device turned on sync first/i);
  });
});

describe('unlocking', () => {
  it('turns each refusal into its own sentence', async () => {
    const unlock = vi.spyOn(controller, 'unlock');
    const { onClose, user } = open({ kind: 'unlock' });
    const passphrase = screen.getByLabelText('Sync passphrase', { selector: 'input' });

    unlock.mockResolvedValueOnce({ ok: false, reason: 'wrong' });
    await user.type(passphrase, 'nope');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That doesn't unlock it.");

    await user.click(screen.getByRole('radio', { name: 'Recovery key' }));
    const key = screen.getByLabelText('Recovery key', { selector: 'input' });
    expect(key).toHaveAttribute('dir', 'ltr');
    unlock.mockResolvedValueOnce({ ok: false, reason: 'malformed', detail: 'checksum' });
    await user.type(key, 'abcd');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/typo/i);
    });

    unlock.mockResolvedValueOnce({ ok: true });
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(unlock).toHaveBeenLastCalledWith({ kind: 'recovery', text: 'abcd' });
  });
});
