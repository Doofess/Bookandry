import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db/db';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { initAccount, type AccountView } from './account';
import { AccountGate } from './account-gate';

/*
 * The front door's rules: nothing of the app before a sign-in, and after one,
 * the setup wizard only for an account that has been fetched and found empty.
 */

const controller = initAccount(db);

beforeAll(async () => {
  await initTestI18n('en');
});
beforeEach(async () => {
  await db.open();
  await db.profiles.clear();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.profiles.clear();
});

const APP = 'the app (or, with no profiles, the setup wizard)';

function show(view: AccountView) {
  vi.spyOn(controller, 'getView').mockReturnValue(view);
  renderWithProviders(
    <AccountGate>
      <p>{APP}</p>
    </AccountGate>,
  );
}

function signedIn(change: Partial<Extract<AccountView, { status: 'signed_in' }>> = {}): AccountView {
  return {
    status: 'signed_in',
    user: {
      id: 'u1',
      email: 'dana@example.com',
      provider: 'google',
      name: undefined,
      picture: undefined,
      avatarVersion: undefined,
      language: undefined,
    },
    keys: { kind: 'ready' },
    sync: undefined,
    passwordRecovery: false,
    twoStep: false,
    ...change,
  };
}

describe('the front door', () => {
  it('is the sign-in screen when no one is signed in', async () => {
    show({ status: 'signed_out' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to Bookandry' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.queryByText(APP)).not.toBeInTheDocument();
  });

  it('is the very same page on a device that holds an account locked away - nothing about the device', async () => {
    show({ status: 'locked', email: 'dana@example.com', idle: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to Bookandry' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/dana@example\.com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/device/i)).not.toBeInTheDocument();
    expect(screen.queryByText(APP)).not.toBeInTheDocument();
  });

  it('switches between signing in, creating an account and resetting a password', async () => {
    show({ status: 'signed_out' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Create an account' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in to Bookandry' })).toBeInTheDocument();
  });

  it('asks for the code before anything else', () => {
    show({
      status: 'second_step',
      user: {
        id: 'u1',
        email: undefined,
        provider: 'email',
        name: undefined,
        picture: undefined,
        avatarVersion: undefined,
        language: undefined,
      },
      owned: false,
    });
    expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeInTheDocument();
    expect(screen.queryByText(APP)).not.toBeInTheDocument();
  });

  it('is simply the app in a build without accounts', () => {
    show({ status: 'unavailable' });
    expect(screen.getByText(APP)).toBeInTheDocument();
  });
});

describe('after signing in', () => {
  it("waits for the account's data on an empty device, instead of offering setup", async () => {
    show(signedIn({ sync: { kind: 'syncing' } }));
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(APP)).not.toBeInTheDocument();
  });

  it('decides once the first fetch is complete: an empty account goes on to setup', async () => {
    show(signedIn({ sync: { kind: 'idle', lastSyncedAt: 1 } }));
    expect(await screen.findByText(APP)).toBeInTheDocument();
  });

  it('opens at once on a device that already has data', async () => {
    await db.profiles.put({ id: 'p1' } as never);
    show(signedIn({ keys: { kind: 'checking' } }));
    expect(await screen.findByText(APP)).toBeInTheDocument();
  });

  it('says so when the data cannot be fetched, with a way to try again or leave', async () => {
    show(signedIn({ sync: { kind: 'offline' } }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/i);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByText(APP)).not.toBeInTheDocument();
  });
});
