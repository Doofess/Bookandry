import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerError } from '@/services/supabase/transport';
import { initTestI18n, renderWithProviders } from '@/test/render';

const account = vi.hoisted(() => ({
  view: { status: 'signed_out' },
  controller: {
    wipeMyData: vi.fn(),
    requestWipe: vi.fn(),
    wipeStatus: vi.fn(),
    cancelWipe: vi.fn(),
    refreshHousehold: vi.fn(),
  },
}));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/app/account', () => ({
  useAccount: () => account.view,
  accountController: () => account.controller,
}));
vi.mock('sonner', () => ({ toast: toasts }));

const { DeleteData } = await import('./delete-data');
const { matchesWord } = await import('./delete-word');

const ASK_EVERYONE = "Ask to delete everyone's data";

const alone = {
  status: 'signed_in',
  user: { id: 'u1' },
  household: { members: [{ userId: 'u1', displayName: 'Dana' }] },
};
const linked = {
  status: 'signed_in',
  user: { id: 'u1' },
  household: {
    members: [
      { userId: 'u1', displayName: 'Dana' },
      { userId: 'u2', displayName: 'Noa' },
    ],
  },
};
const status = (over: Record<string, unknown>) => ({
  id: 'w1',
  status: 'pending',
  mine: true,
  requesterName: 'Dana',
  createdAt: '2026-10-07T10:00:00.000Z',
  expiresAt: '2026-10-14T10:00:00.000Z',
  waitingFor: ['Noa'],
  ...over,
});

const onBackup = vi.fn(() => Promise.resolve());
const render = () => renderWithProviders(<DeleteData onBackup={onBackup} />);

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(() => {
  vi.clearAllMocks();
  account.view = { status: 'signed_out' };
  account.controller.wipeStatus.mockResolvedValue(null);
  account.controller.wipeMyData.mockResolvedValue(undefined);
  account.controller.cancelWipe.mockResolvedValue(undefined);
  account.controller.refreshHousehold.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('matchesWord', () => {
  it('takes the word in either language, whatever the case or the spaces', () => {
    expect(matchesWord(' Delete ')).toBe(true);
    expect(matchesWord('DELETE')).toBe(true);
    expect(matchesWord('מחיקה')).toBe(true);
    expect(matchesWord('delet')).toBe(false);
    expect(matchesWord('')).toBe(false);
  });
});

describe('deleting all data', () => {
  it('alone: the button waits for the word, then erases once and says so', async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole('button', { name: 'Delete all data' }));
    const confirm = screen.getByRole('button', { name: 'Delete everything' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => {
      expect(toasts.success).toHaveBeenCalledWith('All data was deleted');
    });
    expect(account.controller.wipeMyData).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('a failed erase shows an error and leaves the dialog usable', async () => {
    account.controller.wipeMyData.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole('button', { name: 'Delete all data' }));
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'delete');
    await user.click(screen.getByRole('button', { name: 'Delete everything' }));

    await waitFor(() => {
      expect(toasts.error).toHaveBeenCalledWith(
        "Couldn't confirm the delete. If it went through, this device clears on its next sync.",
      );
    });
    expect(screen.getByRole('button', { name: 'Delete everything' })).toBeEnabled();
  });

  it('alone, but linked meanwhile: says everyone must now confirm, and looks at the household again', async () => {
    account.view = alone;
    account.controller.wipeMyData.mockRejectedValue(new ServerError('linked_needs_confirmation'));
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole('button', { name: 'Delete all data' }));
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Delete everything' }));

    await waitFor(() => {
      expect(toasts.error).toHaveBeenCalledWith(
        'Your account is now linked with others, so everyone must confirm. Open this again to ask them.',
      );
    });
    expect(account.controller.refreshHousehold).toHaveBeenCalledTimes(1);
    expect(toasts.success).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('signed in: waits for the household before offering either way to delete', async () => {
    const loading = { status: 'signed_in', user: { id: 'u1' } };
    account.view = loading;
    render();

    expect(screen.getByRole('button', { name: 'Delete all data' })).toBeDisabled();
    await waitFor(() => {
      expect(account.controller.wipeStatus).toHaveBeenCalled();
    });
  });

  it('signed in alone, once the household is known: offers to delete', () => {
    account.view = alone;
    render();

    expect(screen.getByRole('button', { name: 'Delete all data' })).toBeEnabled();
  });

  it('linked: names the other member and reports emails that could not be sent', async () => {
    account.view = linked;
    account.controller.requestWipe.mockResolvedValue({ ok: false, error: 'email_failed' });
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole('button', { name: ASK_EVERYONE }));
    // One other member: asked as one.
    expect(
      screen.getByText(/^Noa will get an email to confirm. Nothing is deleted until they do/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Dana will/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Send the requests' }));

    await waitFor(() => {
      expect(toasts.error).toHaveBeenCalledWith(
        "Couldn't send the confirmation emails. Nothing was deleted. Try again.",
      );
    });
    expect(account.controller.requestWipe).toHaveBeenCalledWith('en');
  });

  it('linked with several: asks each of them, by name', async () => {
    const three = {
      ...linked,
      household: {
        members: [...linked.household.members, { userId: 'u3', displayName: 'Omer' }],
      },
    };
    account.view = three;
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole('button', { name: ASK_EVERYONE }));
    expect(
      screen.getByText(
        /^Noa and Omer will each get an email to confirm. Nothing is deleted until everyone does/,
      ),
    ).toBeInTheDocument();
  });

  it('linked: a sent request says so and asks the server for the pending status', async () => {
    account.view = linked;
    account.controller.requestWipe.mockResolvedValue({ ok: true, asked: 1 });
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole('button', { name: ASK_EVERYONE }));
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Send the requests' }));

    await waitFor(() => {
      expect(toasts.success).toHaveBeenCalledWith(
        'Requests sent. Nothing is deleted until everyone confirms.',
      );
    });
    await waitFor(() => {
      expect(account.controller.wipeStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('pending: shows who is awaited and cancels on request', async () => {
    account.view = linked;
    account.controller.wipeStatus.mockResolvedValue(status({}));
    const user = userEvent.setup();
    render();

    expect(await screen.findByText(/Waiting for Noa to confirm/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ASK_EVERYONE })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel the request' }));
    await waitFor(() => {
      expect(account.controller.cancelWipe).toHaveBeenCalledTimes(1);
    });
  });

  it('a finished erase is history, not a wait: the button stays', async () => {
    account.view = linked;
    account.controller.wipeStatus.mockResolvedValue(status({ status: 'done', waitingFor: [] }));
    render();

    await waitFor(() => {
      expect(account.controller.wipeStatus).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: ASK_EVERYONE })).toBeEnabled();
  });

  it('is disabled while the account is locked', () => {
    account.view = { status: 'locked' };
    render();

    expect(screen.getByRole('button', { name: 'Delete all data' })).toBeDisabled();
  });

  it('is disabled with a hint when signed in and offline', async () => {
    account.view = alone;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render();

    expect(screen.getByRole('button', { name: 'Delete all data' })).toBeDisabled();
    expect(screen.getByText('Connect to delete')).toBeInTheDocument();
    await waitFor(() => {
      expect(account.controller.wipeStatus).toHaveBeenCalled();
    });
  });

  it('in Hebrew, says when a pending request expires', async () => {
    await initTestI18n('he');
    try {
      account.view = linked;
      account.controller.wipeStatus.mockResolvedValue(status({}));
      render();

      expect(await screen.findByText(/^ממתינים לאישור של Noa · פג תוקף /)).toBeInTheDocument();
    } finally {
      await initTestI18n('en');
    }
  });

  it('in Hebrew, asks for the Hebrew word', async () => {
    await initTestI18n('he');
    try {
      const user = userEvent.setup();
      render();

      await user.click(screen.getByRole('button', { name: 'מחיקת כל הנתונים' }));
      expect(screen.getByLabelText('כדי לאשר, הקלידו מחיקה')).toBeInTheDocument();
    } finally {
      await initTestI18n('en');
    }
  });
});
