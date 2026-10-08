import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

import { cardCommitments } from '@/domain/cards';
import { expandOccurrences } from '@/domain/occurrences';
import { d, makeTx, MONEY } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { PaymentMethod, Recurrence } from '@/types/domain';

import { CardCommitmentsBox } from './cards-screen';

beforeAll(async () => {
  await initTestI18n();
});

const max: PaymentMethod = {
  id: 'max',
  profileId: 'p1',
  type: 'credit_card',
  label: 'Max',
  card: { billingDay: 10 },
  isArchived: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as PaymentMethod;

const money = {
  ...MONEY,
  currency: 'ILS',
  baseCurrency: 'ILS',
  amountMinor: 10_000,
  baseAmountMinor: 10_000,
};
type Reset = NonNullable<Extract<Recurrence, { type: 'monthly' }>['reset']>;

const commitmentsWith = (reset: Reset | undefined) => {
  const tx = makeTx({
    id: 'tv',
    date: d('2026-08-05'),
    money,
    note: 'Television',
    paymentMethodId: 'max',
    recurrence: {
      type: 'monthly',
      dayOfMonth: 5,
      installments: 24,
      plan: 'credit',
      creditAnnualRate: '15.5',
      ...(reset === undefined ? {} : { reset }),
    },
  });
  const today = d('2026-09-15');
  return cardCommitments(expandOccurrences(tx, [], d('2026-01-01'), d('2029-12-31'), { today }), max, today);
};

async function openPlans(reset: Reset | undefined, lng: 'en' | 'he' = 'en') {
  await initTestI18n(lng);
  renderWithProviders(<CardCommitmentsBox commitments={commitmentsWith(reset)} />);
  await userEvent.click(screen.getByRole('button', { name: /\(1\)/ }));
}

describe('a plan that follows prime, on the Cards screen', () => {
  it('says from which payment it follows prime', async () => {
    await openPlans({ atPayment: 19, primeAtPurchase: '6', rate: '16', paymentMinor: 10_100 });
    expect(screen.getByText('Follows prime from payment 19')).toBeInTheDocument();
  });

  it('says it in Hebrew', async () => {
    await openPlans({ atPayment: 19, primeAtPurchase: '6' }, 'he');
    expect(screen.getByText('צמוד לפריים מתשלום 19')).toBeInTheDocument();
    await initTestI18n('en');
  });

  it('says nothing once it is frozen, or for a plan fixed for its whole life', async () => {
    await openPlans({ atPayment: 19, primeAtPurchase: '6', rate: '16', paymentMinor: 10_100, frozen: true });
    expect(screen.queryByText(/Follows prime/)).not.toBeInTheDocument();
  });

  it('says nothing for a plan with no reset', async () => {
    await openPlans(undefined);
    expect(screen.getByText('Television', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/Follows prime/)).not.toBeInTheDocument();
  });
});
