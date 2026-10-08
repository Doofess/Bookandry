import { screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsProvider } from '@/app/settings-provider';
import { db } from '@/db/db';
import { createPaymentMethod, setPaymentMethodArchived } from '@/db/repos/payment-methods';
import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { d, makeTx, MONEY } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { IsoInstant } from '@/types/money';

vi.mock('@/app/account', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAccount: () => ({ status: 'signed_out' }),
}));

const { BankAccountsScreen } = await import('./bank-accounts-screen');

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
const SETTINGS = { ...DEFAULT_SETTINGS, updatedAt: instantFromMs(Date.parse(NOW)) };

const render = () =>
  renderWithProviders(
    <SettingsProvider value={SETTINGS}>
      <BankAccountsScreen />
    </SettingsProvider>,
  );

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(async () => {
  await db.paymentMethods.filter((m) => m.id === 'leumi' || m.id === 'closed').delete();
  await createPaymentMethod(
    db,
    'leumi',
    {
      label: 'Leumi current',
      type: 'bank_account',
      profileId: 'p1',
      account: { bank: '10', holding: 'personal' },
    },
    NOW,
  );
  await createPaymentMethod(
    db,
    'closed',
    {
      label: 'Closed card',
      type: 'credit_card',
      profileId: 'p1',
      card: { issuer: 'max', billingDay: 10, accountId: 'leumi' },
    },
    NOW,
  );
  await setPaymentMethodArchived(db, 'closed', true, NOW);
});

afterEach(async () => {
  await db.transactions.delete('tv');
});

const account = async () => screen.findByRole('article', { name: 'Leumi current' });

describe('an account’s card bills', () => {
  it('still lists an archived card with payments left, and its next debit', async () => {
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
        paymentMethodId: 'closed',
        recurrence: { type: 'monthly', dayOfMonth: 5, installments: 12, plan: 'installments' },
      }),
    );
    render();

    const panel = await account();
    expect(await within(panel).findByText('Closed card')).toBeInTheDocument();
    expect(within(panel).getByText(/^on /)).toBeInTheDocument();
  });

  it('leaves out an archived card with nothing left to pay', async () => {
    render();

    const panel = await account();
    expect(within(panel).queryByText('Card bills paid from this account')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Closed card')).not.toBeInTheDocument();
  });
});
