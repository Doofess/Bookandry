import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { type Mock, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsProvider } from '@/app/settings-provider';
import { db } from '@/db/db';
import { createPaymentMethod } from '@/db/repos/payment-methods';
import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { chargesFeeIn } from '@/domain/cards';
import { d, makeTx, MONEY } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';

const account = vi.hoisted((): { view: Record<string, unknown> } => ({ view: { status: 'signed_out' } }));
const toasts = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) as Mock & { error: Mock },
}));

vi.mock('@/app/account', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAccount: () => account.view,
}));
vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal<object>()), ...toasts }));

const { CardsScreen } = await import('./cards-screen');

const SETTINGS = { ...DEFAULT_SETTINGS, updatedAt: instantFromMs(Date.parse('2026-09-15T10:00:00.000Z')) };
const NOW = '2026-09-15T10:00:00.000Z' as Parameters<typeof createPaymentMethod>[3];

function Feed() {
  const location = useLocation();
  return <output data-testid="feed">{location.search}</output>;
}

const render = () =>
  renderWithProviders(
    <SettingsProvider value={SETTINGS}>
      <Routes>
        <Route path="/cards" element={<CardsScreen />} />
        <Route path="/" element={<Feed />} />
      </Routes>
    </SettingsProvider>,
    { route: '/cards' },
  );

const options = () => screen.findByRole('button', { name: 'Options for Max Gold' });

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(async () => {
  vi.clearAllMocks();
  account.view = { status: 'signed_out' };
  await db.paymentMethods.filter((m) => m.type === 'credit_card').delete();
  await createPaymentMethod(
    db,
    'card-1',
    {
      label: 'Max Gold',
      type: 'credit_card',
      profileId: 'p1',
      card: { issuer: 'max', billingDay: 10, lastDigits: '4821' },
    },
    NOW,
  );
});

describe('a card on the Cards screen', () => {
  it('has one control to reach its menu, the ⋯; the face is a larger target for pointers only', async () => {
    const user = userEvent.setup();
    render();
    await options();

    expect(screen.getAllByRole('button', { name: 'Options for Max Gold' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Edit card' })).not.toBeInTheDocument();

    const face = screen.getByTestId('card-face').querySelector('button[aria-hidden="true"]');
    expect(face).toHaveAttribute('tabindex', '-1');
    if (!(face instanceof HTMLElement)) throw new Error('no face button');
    await user.click(face);
    expect(await screen.findByRole('menu')).toBeInTheDocument();

    // Escape: back to the card's ⋯, not the face's hidden button.
    await user.keyboard('{Escape}');
    await expect.poll(() => screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Options for Max Gold' })).toHaveFocus();
  });

  it('opens the editor from Edit card', async () => {
    const user = userEvent.setup();
    render();
    await user.click(await options());
    await user.click(await screen.findByRole('menuitem', { name: 'Edit card' }));

    const editor = await screen.findByRole('dialog');
    expect(within(editor).getByDisplayValue('Max Gold')).toBeInTheDocument();
  });

  it('opens the editor on the rates from Interest table, for a card linked to the catalog', async () => {
    const user = userEvent.setup();
    await db.paymentMethods.update('card-1', {
      card: {
        issuer: 'max',
        billingDay: 10,
        catalog: { issuer: 'max', bank: '20', tier: 'gold', version: 1 },
      },
    } as never);
    render();
    await user.click(await options());
    await user.click(await screen.findByRole('menuitem', { name: 'Interest table' }));

    await screen.findByRole('dialog');
    await expect.poll(() => document.activeElement?.getAttribute('data-section')).toBe('rates');
  });

  it('opens the feed on this card’s transactions', async () => {
    const user = userEvent.setup();
    render();
    await user.click(await options());
    await user.click(await screen.findByRole('menuitem', { name: 'Transactions on this card' }));

    expect(await screen.findByTestId('feed')).toHaveTextContent('?pm=card-1');
  });

  it('opens Smart import on this card', async () => {
    const user = userEvent.setup();
    render();
    await user.click(await options());
    await user.click(await screen.findByRole('menuitem', { name: 'Import a statement' }));

    expect(await screen.findByTestId('feed')).toHaveTextContent('?import=1&via=card-1');
  });

  it('archives the card, with an Undo that brings it back', async () => {
    const user = userEvent.setup();
    render();
    await user.click(await options());
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));

    await expect.poll(async () => (await db.paymentMethods.get('card-1'))?.isArchived).toBe(1);
    expect(toasts.toast).toHaveBeenCalledWith('Max Gold archived', expect.anything());

    const [, options_] = toasts.toast.mock.calls[0] as [string, { action: { onClick: () => void } }];
    options_.action.onClick();
    await expect.poll(async () => (await db.paymentMethods.get('card-1'))?.isArchived).toBe(0);
    expect((await db.paymentMethods.get('card-1'))?.archivedAt).toBeUndefined();
  });

  it('undoes a Restore exactly: the card is archived again on the day it first was, with no fees after', async () => {
    const march = '2026-03-12T09:00:00.000Z' as typeof NOW;
    const before = await db.paymentMethods.get('card-1');
    if (before?.card === undefined) throw new Error('no card');
    await db.paymentMethods.update('card-1', {
      isArchived: 1,
      archivedAt: march,
      card: { ...before.card, monthlyFeeMinor: 1990 },
    });
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole('button', { name: 'Archived cards (1)' }));
    const list = screen.getByRole('list', { name: 'Archived cards (1)' });
    await user.click(within(list).getByRole('button', { name: 'Options for Max Gold' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Restore' }));
    await expect.poll(async () => (await db.paymentMethods.get('card-1'))?.isArchived).toBe(0);

    const [, restored] = toasts.toast.mock.lastCall as [string, { action: { onClick: () => void } }];
    restored.action.onClick();
    await expect.poll(async () => (await db.paymentMethods.get('card-1'))?.isArchived).toBe(1);

    const card = await db.paymentMethods.get('card-1');
    expect(card?.archivedAt).toBe(march);
    if (card === undefined) throw new Error('no card');
    expect(chargesFeeIn(card, d('2026-03-31'))).toBe(true);
    expect(chargesFeeIn(card, d('2026-04-30'))).toBe(false);
    expect(chargesFeeIn(card, d('2026-09-30'))).toBe(false);
  });

  it('keeps an archived card under Archived cards, and Restore brings it back', async () => {
    const user = userEvent.setup();
    render();
    await user.click(await options());
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    await expect.poll(() => screen.queryByTestId('card-face')).toBeNull();

    // Quiet: folded, with the count.
    const disclosure = await screen.findByRole('button', { name: 'Archived cards (1)' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await user.click(disclosure);
    const list = screen.getByRole('list', { name: 'Archived cards (1)' });
    expect(within(list).getByText('Max Gold')).toBeInTheDocument();
    expect(within(list).getByText('•••• 4821')).toBeInTheDocument();
    expect(within(list).getByText('Max')).toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: 'Options for Max Gold' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Restore' }));

    await expect.poll(async () => (await db.paymentMethods.get('card-1'))?.isArchived).toBe(0);
    expect((await db.paymentMethods.get('card-1'))?.archivedAt).toBeUndefined();
    expect(await screen.findByTestId('card-face')).toBeInTheDocument();
    await expect.poll(() => screen.queryByRole('button', { name: /^Archived cards/ })).toBeNull();
    expect(toasts.toast).toHaveBeenLastCalledWith('Max Gold restored', expect.anything());
    // Not dropped on the page: on the restored card's ⋯.
    await expect.poll(() => document.activeElement?.getAttribute('aria-label')).toBe('Options for Max Gold');
    expect(document.activeElement?.closest('[data-testid="card-face"]')).not.toBeNull();
  });
});

describe('an archived card in the household commitments', () => {
  const archive = async () => {
    const user = userEvent.setup();
    render();
    await user.click(await options());
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    await expect.poll(() => screen.queryByTestId('card-face')).toBeNull();
  };

  it('still counts while payments are left to run off it', async () => {
    await db.transactions.put(
      makeTx({
        id: 'tv',
        profileId: 'p1',
        date: d('2026-08-05'),
        money: {
          ...MONEY,
          currency: 'ILS',
          baseCurrency: 'ILS',
          amountMinor: 10_000,
          baseAmountMinor: 10_000,
        },
        paymentMethodId: 'card-1',
        recurrence: { type: 'monthly', dayOfMonth: 5, installments: 12, plan: 'installments' },
      }),
    );
    try {
      await archive();
      const household = await screen.findByTestId('household-commitments');
      expect(within(household).getByText('Instalments')).toBeInTheDocument();
    } finally {
      await db.transactions.delete('tv');
    }
  });

  it('drops out once nothing is left to pay on it', async () => {
    await archive();
    await screen.findByRole('button', { name: 'Archived cards (1)' });
    expect(screen.queryByTestId('household-commitments')).not.toBeInTheDocument();
  });
});

describe('a card’s face', () => {
  const face = async () => {
    render();
    await options();
    return screen.getByTestId('card-face');
  };

  it('is a money sheet in its company’s colour when it was given none', async () => {
    const el = await face();
    expect(el).toHaveAttribute('data-sheet', 'money');
    expect(el).toHaveAttribute('data-money', 'issuer-max');
  });

  it('is in its own colour when it has one', async () => {
    await db.paymentMethods.update('card-1', { color: 'gold' });
    expect(await face()).toHaveAttribute('data-money', 'card-gold');
  });

  it('falls back to its company for a colour an older build stored as hex', async () => {
    await db.paymentMethods.update('card-1', { color: '#ff0000' });
    expect(await face()).toHaveAttribute('data-money', 'issuer-max');
  });

  it('is the neutral ink sheet for a card of an "other" company with no colour', async () => {
    await db.paymentMethods.update('card-1', {
      card: { issuer: 'other', billingDay: 10, lastDigits: '4821' },
    });
    expect(await face()).toHaveAttribute('data-money', 'neutral');
  });

  it('writes no colour of its own: no white text, no translucent text that would drop under 4.5:1', async () => {
    const el = await face();
    expect(el.querySelector('[class*="text-white"]')).toBeNull();
    expect(el.querySelector('[class*="opacity-"]')).toBeNull();
  });
});
