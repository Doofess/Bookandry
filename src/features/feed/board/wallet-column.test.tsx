import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { monthBills } from '@/domain/month-bills';
import { MONEY, d } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Occurrence, PaymentMethod } from '@/types/domain';

import { WalletColumn } from './wallet-column';

const card = (id: string, issuer: string, billingDay: number, lastDigits: string) =>
  ({
    id,
    profileId: 'p',
    type: 'credit_card',
    label: id,
    card: { issuer, billingDay, lastDigits },
    isArchived: 0,
  }) as unknown as PaymentMethod;
const spend = (methodId: string, minor: number) =>
  ({
    key: methodId,
    date: d('2026-09-12'),
    originalDate: d('2026-09-12'),
    paymentMethodId: methodId,
    isSkipped: false,
    isProjected: false,
    categoryId: 'cat.groceries',
    money: { ...MONEY, amountMinor: minor, baseAmountMinor: minor },
    transaction: { kind: 'expense', recurrence: { type: 'one_time' } },
  }) as unknown as Occurrence;

const cards = [
  card('cal', 'cal', 15, '3306'),
  card('isracard', 'isracard', 2, '4821'),
  card('max', 'max', 10, '0937'),
  card('diners', 'diners', 2, '7712'),
  card('amex', 'amex', 10, '1009'),
  card('sixth', 'max', 10, '1111'),
];
const bills = monthBills(
  cards,
  [
    spend('isracard', 321_400),
    spend('max', 214_000),
    spend('cal', 187_600),
    spend('diners', 102_300),
    spend('amex', 68_900),
  ],
  d('2026-10-09'),
);

beforeAll(async () => {
  await initTestI18n('en');
});

describe('the wallet', () => {
  it('shows the five largest bills as card sheets, largest first, each with its billing day in the box', () => {
    renderWithProviders(
      <WalletColumn
        cards={cards}
        bills={bills}
        profiles={new Map()}
        cash={undefined}
        currency="ILS"
        today={d('2026-10-09')}
      />,
    );
    const sheets = document.querySelectorAll('[data-card-sheet]');
    expect(sheets).toHaveLength(5);
    expect([...sheets].map((s) => s.getAttribute('data-money'))).toEqual([
      'issuer-isracard',
      'issuer-max',
      'issuer-cal',
      'issuer-diners',
      'issuer-amex',
    ]);
    expect(sheets[0]?.querySelector('[data-slot="mark"]')).toHaveTextContent('Charged on day 2');
    expect(sheets[0]?.querySelector('[data-numeral]')).toHaveAttribute('data-numeral-size', 'card');
    expect(screen.getByRole('link', { name: 'All cards' })).toHaveAttribute('href', '/cards');
    expect(screen.getByRole('link', { name: '+ Card' })).toHaveAttribute('href', '/cards?add=card');
  });

  it('says so when there are no cards, and shows no cash sheet before cash is set up', () => {
    renderWithProviders(
      <WalletColumn
        cards={[]}
        bills={undefined}
        profiles={new Map()}
        cash={undefined}
        currency="ILS"
        today={d('2026-10-09')}
      />,
    );
    expect(screen.getByText('No cards yet.')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="cash-sheet"]')).toBeNull();
  });
});
