import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { initAccount, type AccountView } from '@/app/account';
import { SettingsProvider } from '@/app/settings-provider';
import { db } from '@/db/db';
import { DEFAULT_SETTINGS, ensureSettings } from '@/db/repos/settings';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { UserMenu } from './user-menu';

const INSTANT = instantFromMs(Date.parse('2026-09-15T10:00:00.000Z'));

/*
 * The account menu's rules: who is signed in at the top, every settings page
 * in it, the everyday switches right there, and signing out last.
 */

const controller = initAccount(db);

beforeAll(async () => {
  await initTestI18n('en');
});
beforeEach(async () => {
  await db.open();
  await ensureSettings(db, INSTANT);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const signedIn: AccountView = {
  status: 'signed_in',
  user: {
    id: 'u1',
    email: 'dana@example.com',
    provider: 'google',
    name: 'Dana Levi',
    picture: undefined,
    avatarVersion: undefined,
    language: undefined,
  },
  keys: { kind: 'ready' },
  sync: undefined,
  passwordRecovery: false,
  twoStep: false,
};

async function openMenu(view: AccountView) {
  vi.spyOn(controller, 'getView').mockReturnValue(view);
  renderWithProviders(
    <SettingsProvider value={{ ...DEFAULT_SETTINGS, updatedAt: INSTANT }}>
      <UserMenu />
    </SettingsProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Account and settings' }));
  return { user, menu: await screen.findByRole('menu') };
}

describe('the account menu', () => {
  it('opens from the picture, showing initials when there is no picture', async () => {
    vi.spyOn(controller, 'getView').mockReturnValue(signedIn);
    renderWithProviders(
      <SettingsProvider value={{ ...DEFAULT_SETTINGS, updatedAt: INSTANT }}>
        <UserMenu />
      </SettingsProvider>,
    );
    const trigger = await screen.findByRole('button', { name: 'Account and settings' });
    expect(trigger).toHaveTextContent('DL');
  });

  it('names who is signed in, lists every settings page, and ends with signing out', async () => {
    const { menu } = await openMenu(signedIn);
    expect(within(menu).getByText('Dana Levi')).toBeInTheDocument();
    expect(within(menu).getByText('dana@example.com')).toBeInTheDocument();

    const items = within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent);
    expect(items[0]).toBe('Account');
    // Account linking sits with the account, between it and security.
    expect(items[1]).toBe('Account linking');
    expect(items[2]).toBe('Sign-in and security');
    for (const label of [
      'Sign-in and security',
      'Preferences',
      'Recurring commitments',
      'Categories',
      'Bank accounts',
      'Cards and payment methods',
      'Backup and data',
    ])
      expect(items).toContain(label);
    expect(items.at(-1)).toBe('Sign out');
  });

  it('signs out only after the usual confirmation', async () => {
    const signOut = vi.spyOn(controller, 'signOut').mockResolvedValue();
    vi.spyOn(controller, 'unsavedChanges').mockResolvedValue(0);
    const { user, menu } = await openMenu(signedIn);
    await user.click(within(menu).getByRole('menuitem', { name: 'Sign out' }));
    const dialog = await screen.findByRole('dialog');
    expect(signOut).not.toHaveBeenCalled();
    await user.click(await within(dialog).findByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalled();
  });

  it('is the same menu less the account in a build without accounts', async () => {
    const { menu } = await openMenu({ status: 'unavailable' });
    const items = within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent);
    expect(items).toContain('Preferences');
    expect(items).not.toContain('Account');
    expect(items).not.toContain('Account linking');
    expect(items).not.toContain('Sign out');
  });
});
