import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { type Mock, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsProvider } from '@/app/settings-provider';
import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';

const account = vi.hoisted(
  (): {
    view: Record<string, unknown>;
    controller: { peekInvite: Mock; acceptInvite: Mock; declineInvite: Mock };
  } => ({
    view: { status: 'signed_in', user: { id: 'u1', email: 'yossi@example.com' } },
    controller: { peekInvite: vi.fn(), acceptInvite: vi.fn(), declineInvite: vi.fn() },
  }),
);
const toasts = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

vi.mock('@/app/account', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAccount: () => account.view,
  accountController: () => account.controller,
}));
vi.mock('sonner', () => toasts);

const { LinkScreen } = await import('./link-screen');

const TOKEN = 'c'.repeat(64);
const SETTINGS = { ...DEFAULT_SETTINGS, updatedAt: instantFromMs(Date.parse('2026-10-08T10:00:00.000Z')) };

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  account.controller.peekInvite.mockResolvedValue({
    inviterName: 'Dana',
    members: 1,
    currency: SETTINGS.defaultCurrency,
    alreadyMember: false,
    linkedElsewhere: false,
  });
  account.controller.acceptInvite.mockResolvedValue(undefined);
});

describe('LinkScreen', () => {
  it('names what it is, and after linking opens Account linking in Settings', async () => {
    renderWithProviders(
      <SettingsProvider value={SETTINGS}>
        <Routes>
          <Route path="/link" element={<LinkScreen />} />
          <Route path="/settings/linking" element={<p>linking page</p>} />
          <Route path="/household" element={<p>old household tab</p>} />
        </Routes>
      </SettingsProvider>,
      { route: `/link?t=${TOKEN}` },
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Account linking' })).toBeInTheDocument();
    expect(await screen.findByText('Dana invited you to link your accounts.')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Accept and link' }));

    expect(await screen.findByText('linking page')).toBeInTheDocument();
    await waitFor(() => {
      expect(account.controller.acceptInvite).toHaveBeenCalledWith(TOKEN, SETTINGS.defaultCurrency);
    });
  });
});
