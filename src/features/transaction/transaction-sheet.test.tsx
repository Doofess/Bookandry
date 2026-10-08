import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db/db';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Category, PaymentMethod, Profile } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import { TransactionSheet } from './transaction-sheet';

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
const TODAY = '2026-10-08' as LocalDate;

const groceries: Category = {
  id: 'cat.groceries',
  kind: 'expense',
  icon: 'Circle',
  sortOrder: 0,
  isArchived: 0,
  source: 'builtin',
  nameKey: 'categories:builtin.groceries',
  createdAt: NOW,
  updatedAt: NOW,
};
const profile = {
  id: 'p1',
  name: 'Dana',
  color: '#16794a',
  openingBalanceMinor: 0,
  openingBalanceCurrency: 'ILS',
  openingBalanceDate: '2026-01-01',
  createdAt: NOW,
  updatedAt: NOW,
} as Profile;

/** A Max International card through Mizrahi-Tefahot: its קרדיט rate is published, its קרדיט פלוס rate is not. */
const maxCard: PaymentMethod = {
  id: 'pm.max',
  profileId: 'p1',
  type: 'credit_card',
  label: 'Max',
  card: { billingDay: 10, catalog: { issuer: 'max', bank: '20', tier: 'international', version: 1 } },
  isArchived: 0,
  createdAt: NOW,
  updatedAt: NOW,
};
const plainCard: PaymentMethod = {
  ...maxCard,
  id: 'pm.plain',
  label: 'Plain',
  card: { billingDay: 10, creditPrimeMargin: '9' },
};

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(async () => {
  // The pickers' list (cmdk) measures itself; jsdom has nothing to measure with.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
  await db.transactions.clear();
  await db.paymentMethods.clear();
  await db.overrides.clear();
});

function open(methods: readonly PaymentMethod[] = [maxCard, plainCard]) {
  const onSaved = vi.fn();
  renderWithProviders(
    <TransactionSheet
      target={{ mode: 'add' }}
      onOpenChange={() => undefined}
      profiles={[profile]}
      categories={[groceries]}
      paymentMethods={methods}
      activeProfileId="p1"
      baseCurrency="ILS"
      today={TODAY}
      onSaved={onSaved}
    />,
  );
  return { onSaved, user: userEvent.setup() };
}

async function fill(user: ReturnType<typeof userEvent.setup>, amount: string, card: string) {
  await user.type(screen.getByLabelText('Amount'), amount);
  await user.click(screen.getByRole('combobox', { name: /Paid with/ }));
  await user.click(await screen.findByRole('option', { name: new RegExp(card) }));
}

const save = () => screen.getByRole('button', { name: 'Save' });

describe('a purchase on a card linked to the catalog', () => {
  it('offers the card’s own deals once the catalog has loaded, and today’s on a card not linked', async () => {
    const { user } = open();
    await fill(user, '3000', 'Max');
    expect(await screen.findByRole('radio', { name: 'Credit Plus' })).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: /Paid with/ }));
    await user.click(await screen.findByRole('option', { name: /Plain/ }));
    expect(screen.queryByRole('radio', { name: 'Credit Plus' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Credit installment' })).toBeInTheDocument();
  });

  it('fills a קרדיט from the bank’s published rate', async () => {
    const { user } = open();
    await fill(user, '3000', 'Max');
    await user.click(await screen.findByRole('radio', { name: 'Credit' }));
    // Mizrahi: prime + 10.75 = 15.5.
    expect(screen.getByLabelText('Annual interest')).toHaveValue('15.5');
  });

  it('holds the save of a קרדיט פלוס until its rate is given, then saves the plan with prime at purchase', async () => {
    const { user, onSaved } = open();
    await fill(user, '3000', 'Max');
    await user.click(await screen.findByRole('radio', { name: 'Credit Plus' }));
    expect(screen.getByRole('alert')).toHaveTextContent("Enter this card's Credit Plus rate first.");
    expect(screen.getByRole('button', { name: 'Open the card' })).toBeInTheDocument();
    expect(save()).toBeDisabled();

    const count = screen.getByLabelText('Number of payments');
    await user.clear(count);
    await user.type(count, '24');
    await user.type(screen.getByLabelText('Annual interest'), '15.5');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(save()).toBeEnabled();
    await user.click(save());

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const [saved] = await db.transactions.toArray();
    expect(saved?.recurrence).toMatchObject({
      type: 'monthly',
      installments: 24,
      plan: 'credit',
      creditAnnualRate: '15.5',
      reset: { atPayment: 19, primeAtPurchase: '4.75' },
    });
  });

  it('opens the card to give the rate, and comes back with it filled in, the purchase unsaved', async () => {
    await db.paymentMethods.put(maxCard);
    const { user, onSaved } = open();
    await fill(user, '3000', 'Max');
    await user.click(await screen.findByRole('radio', { name: 'Credit Plus' }));
    await user.click(screen.getByRole('button', { name: 'Open the card' }));

    // The card's rate table, its קרדיט פלוס row asking for the rate.
    const row = within(await screen.findByTestId('rate-long_credit'));
    await user.type(row.getByRole('textbox'), '10.75');
    const cardSheet = screen.getByRole('dialog', { name: 'Edit payment method' });
    await user.click(within(cardSheet).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Annual interest')).toHaveValue('15.5');
    });
    expect((await db.paymentMethods.get('pm.max'))?.card?.overrides).toEqual({
      long_credit: { basis: 'prime', margin: '10.75' },
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(await db.transactions.count()).toBe(0);
  });

  it('saves a 30+ purchase a month later, with its month of interest and its rate', async () => {
    const { user, onSaved } = open();
    await fill(user, '1000', 'Max');
    await user.click(await screen.findByRole('radio', { name: '30 Plus' }));
    await user.type(screen.getByLabelText('Annual interest'), '15.5');
    await user.click(save());

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const [saved] = await db.transactions.toArray();
    expect(saved?.recurrence).toEqual({ type: 'one_time' });
    expect(saved?.money.amountMinor).toBe(101_292);
    expect(saved?.deferral).toEqual({ rate: '15.5' });
  });
});
