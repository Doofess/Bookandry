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

describe('an account’s bank', () => {
  afterEach(async () => {
    await db.paymentMethods.filter((m) => m.id === 'other' || m.id === 'mine').delete();
  });

  it('is a sheet in its bank’s colour, with no logo and no accent edge', async () => {
    render();

    const panel = await account();
    expect(panel).toHaveAttribute('data-slot', 'bank-account-sheet');
    expect(panel).toHaveAttribute('data-sheet', 'money');
    expect(panel).toHaveAttribute('data-money', 'bank-10');
    expect(panel.querySelector('img')).toBeNull();
    expect(panel.querySelector('[data-slot="account-accent"]')).toBeNull();
  });

  it('keeps a bank with no colour of its own on the neutral sheet', async () => {
    await createPaymentMethod(
      db,
      'other',
      {
        label: 'Jerusalem savings',
        type: 'bank_account',
        profileId: 'p1',
        account: { bank: '54', holding: 'personal' },
      },
      NOW,
    );
    render();

    const panel = await screen.findByRole('article', { name: 'Jerusalem savings' });
    expect(panel).toHaveAttribute('data-money', 'neutral');
    expect(panel.querySelector('img')).toBeNull();
  });

  it('takes the colour the person gave it over the bank’s', async () => {
    await createPaymentMethod(
      db,
      'mine',
      {
        label: 'My red one',
        type: 'bank_account',
        profileId: 'p1',
        color: 'red',
        account: { bank: '10', holding: 'personal' },
      },
      NOW,
    );
    render();

    const panel = await screen.findByRole('article', { name: 'My red one' });
    expect(panel).toHaveAttribute('data-money', 'card-red');
  });

  it('has Edit as a pill button', async () => {
    render();

    const panel = await account();
    expect(within(panel).getByRole('button', { name: 'Edit account' })).toHaveAttribute(
      'data-variant',
      'pill',
    );
  });
});

describe('an archived card on the account', () => {
  afterEach(async () => {
    await db.paymentMethods.delete('open');
    await initTestI18n('en');
  });

  it('says it is archived, which is why a closed card is still listed', async () => {
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
    await createPaymentMethod(
      db,
      'open',
      {
        label: 'Open card',
        type: 'credit_card',
        profileId: 'p1',
        card: { issuer: 'cal', billingDay: 2, accountId: 'leumi' },
      },
      NOW,
    );
    render();

    const panel = await account();
    const closed = (await within(panel).findByText('Closed card')).closest('li');
    const open = within(panel).getByText('Open card').closest('li');
    expect(closed).not.toBeNull();
    expect(open).not.toBeNull();
    if (closed === null || open === null) return;
    expect(within(closed).getByText('Archived')).toBeInTheDocument();
    expect(within(open).queryByText('Archived')).toBeNull();
  });

  it('says so in Hebrew', async () => {
    await initTestI18n('he');
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
    const closed = (await within(panel).findByText('Closed card')).closest('li');
    expect(closed).not.toBeNull();
    if (closed !== null) expect(within(closed).getByText('בארכיון')).toBeInTheDocument();
  });
});

describe('an account’s incoming money', () => {
  afterEach(async () => {
    await db.transactions.bulkDelete(['pay', 'elsewhere']);
  });

  const income = (id: string, destinationId: string) =>
    makeTx({
      id,
      profileId: 'p1',
      kind: 'income',
      categoryId: 'cat.salary',
      date: d('2026-08-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10 },
      destinationId,
      money: { ...MONEY, amountMinor: 1_240_000, baseAmountMinor: 1_240_000 },
    });

  it('shows the next income going into it, and links to the feed of that account’s income that month', async () => {
    await db.transactions.put(income('pay', 'leumi'));
    render();

    const panel = await account();
    const link = await within(panel).findByRole('link', { name: /^Salary · Oct 10/ });
    expect(link.querySelector('[data-slot="mark"] [data-value="1240000"]')).not.toBeNull();
    const href = new URL(link.getAttribute('href') ?? '', 'http://x');
    expect(href.pathname).toBe('/');
    expect(href.searchParams.get('pm')).toBe('leumi');
    expect(href.searchParams.get('k')).toBe('income');
    expect(href.searchParams.get('m')).toBe('2026-10');
  });

  it('shows nothing for an account no income is expected into', async () => {
    await db.transactions.put(income('elsewhere', 'pm.cash'));
    render();

    const panel = await account();
    expect(within(panel).queryByText('Incoming')).toBeNull();
  });
});
