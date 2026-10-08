import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsProvider } from '@/app/settings-provider';
import { db } from '@/db/db';
import { DEFAULT_SETTINGS, ensureSettings } from '@/db/repos/settings';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';

const account = vi.hoisted((): { view: Record<string, unknown> } => ({ view: {} }));

vi.mock('@/app/account', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAccount: () => account.view,
}));

const { HouseholdScreen } = await import('./household-screen');

const INSTANT = instantFromMs(Date.parse('2026-10-08T10:00:00.000Z'));
const SETTINGS = { ...DEFAULT_SETTINGS, updatedAt: INSTANT };

const SIGNED_IN = {
  status: 'signed_in',
  user: {
    id: 'u1',
    email: 'dana@example.com',
    provider: 'google',
    name: 'Dana',
    picture: undefined,
    avatarVersion: undefined,
    language: undefined,
  },
  keys: { kind: 'ready' },
  sync: undefined,
  passwordRecovery: false,
  twoStep: false,
  household: null,
};

const render = () =>
  renderWithProviders(
    <SettingsProvider value={SETTINGS}>
      <Routes>
        <Route path="/settings/linking" element={<HouseholdScreen />} />
        <Route path="/settings" element={<p>settings list</p>} />
      </Routes>
    </SettingsProvider>,
    { route: '/settings/linking' },
  );

beforeAll(async () => {
  await initTestI18n('en');
  await db.open();
  await ensureSettings(db, INSTANT);
});

beforeEach(() => {
  account.view = SIGNED_IN;
});

describe('Settings > Account linking', () => {
  it('is a settings page: its title, and the way back to Settings', async () => {
    render();
    expect(await screen.findByRole('heading', { level: 1, name: 'Account linking' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('list', { name: 'Linked accounts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invite someone' })).toBeInTheDocument();
  });

  it.each(['signed_out', 'unavailable'])('%s, goes back to Settings, as Account does', async (status) => {
    account.view = { status };
    render();
    expect(await screen.findByText('settings list')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Account linking' })).not.toBeInTheDocument();
  });
});
