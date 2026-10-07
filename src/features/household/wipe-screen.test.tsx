import { renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { type Mock, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerError } from '@/services/supabase/transport';
import { initTestI18n, renderWithProviders } from '@/test/render';

const account = vi.hoisted(
  (): {
    view: Record<string, unknown>;
    controller: { peekWipe: Mock; confirmWipe: Mock; declineWipe: Mock };
  } => ({
    view: { status: 'signed_out' },
    controller: { peekWipe: vi.fn(), confirmWipe: vi.fn(), declineWipe: vi.fn() },
  }),
);
const toasts = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

vi.mock('@/app/account', () => ({
  useAccount: () => account.view,
  accountController: () => account.controller,
}));
vi.mock('sonner', () => toasts);

const { WipeScreen } = await import('./wipe-screen');
const { useWipeNotice, NAME_WAIT_MS } = await import('@/app/use-wipe-notice');

const TOKEN = 'a'.repeat(64);
const KEY = 'greenback.pendingWipe';
const PREVIEW = {
  requesterName: 'Dana',
  createdAt: '2026-10-07T10:00:00.000Z',
  expiresAt: '2026-10-14T10:00:00.000Z',
  members: 3,
};

const render = (search = `?t=${TOKEN}`) =>
  renderWithProviders(
    <Routes>
      <Route path="/wipe" element={<WipeScreen />} />
      <Route path="/" element={<p>feed page</p>} />
    </Routes>,
    { route: `/wipe${search}` },
  );

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  account.view = { status: 'signed_in', user: { id: 'u1' } };
  account.controller.peekWipe.mockResolvedValue(PREVIEW);
  account.controller.confirmWipe.mockResolvedValue('waiting');
  account.controller.declineWipe.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WipeScreen', () => {
  it('names the requester, what is erased and kept, and the dates, with both buttons', async () => {
    render();
    expect(await screen.findByText("Dana asked to delete all of your household's data")).toBeInTheDocument();
    expect(screen.getByText(/^Erased:/)).toBeInTheDocument();
    expect(screen.getByText(/^Kept:/)).toBeInTheDocument();
    expect(screen.getByText(/Asked .+ · open until /)).toBeInTheDocument();
    expect(screen.getByText("If everyone confirms, it's deleted for all 3 of you.")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeEnabled();
    expect(account.controller.peekWipe).toHaveBeenCalledWith(TOKEN);
  });

  it('confirming, with others still to answer, says so and goes to the feed', async () => {
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(account.controller.confirmWipe).toHaveBeenCalledWith(TOKEN);
    expect(toasts.toast).toHaveBeenCalledWith('Thanks. Waiting for the others.');
    expect(await screen.findByText('feed page')).toBeInTheDocument();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('confirming last goes to the feed without its own toast', async () => {
    account.controller.confirmWipe.mockResolvedValue('done');
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('feed page')).toBeInTheDocument();
    expect(toasts.toast).not.toHaveBeenCalled();
  });

  it('a confirmation the server no longer accepts shows that the request is closed', async () => {
    account.controller.confirmWipe.mockRejectedValue(new ServerError('wipe_invalid'));
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('This request is no longer open.')).toBeInTheDocument();
  });

  it('declining tells the server, says nothing was deleted, and goes to the feed', async () => {
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    expect(account.controller.declineWipe).toHaveBeenCalledWith(TOKEN);
    expect(toasts.toast).toHaveBeenCalledWith('Request declined. Nothing was deleted.');
    expect(await screen.findByText('feed page')).toBeInTheDocument();
  });

  it('an answer refused for the wrong account shows that, for Confirm and for Decline', async () => {
    account.controller.confirmWipe.mockRejectedValue(new ServerError('wipe_wrong_account'));
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText(/isn't for this account/)).toBeInTheDocument();
    expect(toasts.toast.error).not.toHaveBeenCalled();
  });

  it('a decline refused for the wrong account shows that too', async () => {
    account.controller.declineWipe.mockRejectedValue(new ServerError('wipe_wrong_account'));
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    expect(await screen.findByText(/isn't for this account/)).toBeInTheDocument();
  });

  it('two quick clicks send one answer', async () => {
    account.controller.confirmWipe.mockReturnValue(new Promise(() => undefined));
    render();
    const button = await screen.findByRole('button', { name: 'Confirm' });
    await userEvent.dblClick(button);
    expect(account.controller.confirmWipe).toHaveBeenCalledTimes(1);
  });

  it('a request meant for another account says to sign in with the right email', async () => {
    account.controller.peekWipe.mockRejectedValue(new ServerError('wipe_wrong_account'));
    render();
    expect(
      await screen.findByText("This request isn't for this account. Sign in with the email it was sent to."),
    ).toBeInTheDocument();
  });

  it('a used, expired or cancelled request is no longer open', async () => {
    account.controller.peekWipe.mockRejectedValue(new ServerError('wipe_invalid'));
    render();
    expect(await screen.findByText('This request is no longer open.')).toBeInTheDocument();
  });

  it('a malformed token is no longer open, without asking the server', async () => {
    render('?t=not-a-token');
    expect(await screen.findByText('This request is no longer open.')).toBeInTheDocument();
    expect(account.controller.peekWipe).not.toHaveBeenCalled();
  });

  it('a network failure says the account could not be reached', async () => {
    account.controller.peekWipe.mockRejectedValue(new Error('offline'));
    render();
    expect(await screen.findByText(/Couldn't reach your account/)).toBeInTheDocument();
  });

  it('signed out: keeps the token for the visit and offers to sign in', async () => {
    account.view = { status: 'signed_out' };
    render();
    expect(await screen.findByText('Sign in to answer this request')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(sessionStorage.getItem(KEY)).toBe(TOKEN);
    expect(account.controller.peekWipe).not.toHaveBeenCalled();
  });

  it('uses the remembered token when the link has none', async () => {
    sessionStorage.setItem(KEY, TOKEN);
    render('');
    await waitFor(() => {
      expect(account.controller.peekWipe).toHaveBeenCalledWith(TOKEN);
    });
  });
});

describe('useWipeNotice', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
  const useNotice = () => {
    useWipeNotice();
  };

  it('toasts once for a given erase, named when the requester is known', () => {
    account.view = { status: 'signed_in', wipeNotice: { by: 'Dana', at: 1 } };
    const { rerender } = renderHook(useNotice, { wrapper });
    rerender();
    expect(toasts.toast).toHaveBeenCalledTimes(1);
    expect(toasts.toast).toHaveBeenCalledWith("All data was deleted at Dana's request");

    account.view = { status: 'signed_in', wipeNotice: { by: undefined, at: 2 } };
    rerender();
    expect(toasts.toast).toHaveBeenCalledTimes(2);
    expect(toasts.toast).toHaveBeenLastCalledWith('All data was deleted');
  });

  it('waits briefly for who asked, then toasts once, named', () => {
    vi.useFakeTimers();
    try {
      account.view = { status: 'signed_in', wipeNotice: { by: undefined, at: 3, naming: true } };
      const { rerender } = renderHook(useNotice, { wrapper });
      expect(toasts.toast).not.toHaveBeenCalled();

      account.view = { status: 'signed_in', wipeNotice: { by: 'Dana', at: 3 } };
      rerender();
      vi.advanceTimersByTime(NAME_WAIT_MS * 2);
      expect(toasts.toast).toHaveBeenCalledTimes(1);
      expect(toasts.toast).toHaveBeenCalledWith("All data was deleted at Dana's request");
    } finally {
      vi.useRealTimers();
    }
  });

  it('toasts unnamed once the wait is up, and not again when the name comes late', () => {
    vi.useFakeTimers();
    try {
      account.view = { status: 'signed_in', wipeNotice: { by: undefined, at: 4, naming: true } };
      const { rerender } = renderHook(useNotice, { wrapper });
      vi.advanceTimersByTime(NAME_WAIT_MS);
      expect(toasts.toast).toHaveBeenCalledTimes(1);
      expect(toasts.toast).toHaveBeenLastCalledWith('All data was deleted');

      account.view = { status: 'signed_in', wipeNotice: { by: 'Dana', at: 4 } };
      rerender();
      expect(toasts.toast).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says nothing without a notice', () => {
    account.view = { status: 'signed_in' };
    renderHook(useNotice, { wrapper });
    expect(toasts.toast).not.toHaveBeenCalled();
  });
});
