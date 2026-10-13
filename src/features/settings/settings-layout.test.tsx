import { render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { SettingsProvider } from '@/app/settings-provider';
import { TodayProvider } from '@/app/today-provider';
import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { fixedClock } from '@/lib/clock';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, TEST_NOW } from '@/test/render';

const account = vi.hoisted((): { view: { status: string } } => ({ view: { status: 'signed_in' } }));
vi.mock('@/app/account', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAccount: () => account.view,
}));
vi.mock('@/app/account-avatar', () => ({
  useAccountAvatar: () => ({ name: 'Dana', email: 'dana@example.com' }),
}));
vi.mock('@/features/account/account-avatar', () => ({ AccountAvatar: () => <span /> }));

const { SettingsIndex, SettingsLayout } = await import('./settings-layout');
const { SettingsPage } = await import('./settings-page');

const SETTINGS = { ...DEFAULT_SETTINGS, updatedAt: instantFromMs(Date.parse('2026-09-15T10:00:00.000Z')) };

/** The layout with the real children's shape and a stub page in each subject. */
function mount(path: string, desktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: desktop && query.includes('min-width: 64rem'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  const page = (title: string) => (
    <SettingsPage title={title} description={`${title} hint`}>
      {title} body
    </SettingsPage>
  );
  const router = createMemoryRouter(
    [
      {
        path: '/settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <SettingsIndex /> },
          { path: 'account', element: page('Account') },
          { path: 'preferences', element: page('Preferences') },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <TodayProvider clock={fixedClock(TEST_NOW)}>
      <SettingsProvider value={SETTINGS}>
        <RouterProvider router={router} />
      </SettingsProvider>
    </TodayProvider>,
  );
  return router;
}

beforeAll(async () => {
  await initTestI18n('en');
});
afterEach(() => {
  account.view = { status: 'signed_in' };
});

describe('settings in two panes (§5.7)', () => {
  it('on a desktop, /settings lands on the account when signed in, replacing the address', async () => {
    const router = mount('/settings', true);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/settings/account');
    });
    expect(router.state.historyAction).toBe('REPLACE');
    const subjects = document.querySelector<HTMLElement>('[data-slot="settings-subjects"]');
    if (subjects === null) throw new Error('no subjects sheet');
    expect(within(subjects).getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
    expect(within(subjects).getByRole('link', { name: 'Preferences' })).not.toHaveAttribute('aria-current');
    expect(document.querySelector('[data-slot="settings-subject"]')).toHaveTextContent('Account body');
    // The head and the subjects stand in for the way back.
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('on a desktop without an account, /settings lands on Preferences and keeps the query', async () => {
    account.view = { status: 'signed_out' };
    const router = mount('/settings?import=1', true);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/settings/preferences');
    });
    expect(router.state.location.search).toBe('?import=1');
  });

  it('on a phone, /settings stays the list and no subject is open', () => {
    account.view = { status: 'signed_out' };
    const router = mount('/settings', false);
    expect(router.state.location.pathname).toBe('/settings');
    const subjects = document.querySelector<HTMLElement>('[data-slot="settings-subjects"]');
    if (subjects === null) throw new Error('no list');
    expect(within(subjects).getByRole('link', { name: /Preferences/ })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="settings-subject"]')).toBeNull();
  });

  it('on a phone, a subject keeps its way back to the list', () => {
    mount('/settings/preferences', false);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('heading', { level: 1, name: 'Preferences' })).toBeInTheDocument();
  });
});
