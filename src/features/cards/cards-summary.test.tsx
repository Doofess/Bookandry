import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { monthBills } from '@/domain/month-bills';
import { d, MONEY } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Occurrence, PaymentMethod } from '@/types/domain';

import { CardsSummary } from './cards-summary';

beforeAll(async () => {
  await initTestI18n('en');
});

const card = (id: string, issuer: string, billingDay: number) =>
  ({
    id,
    profileId: 'p',
    type: 'credit_card',
    label: id,
    card: { issuer, billingDay },
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

describe('the cards summary', () => {
  it('says what leaves the bank this month as the huge figure, and the next charge in the box with its account', () => {
    const cards = [card('isracard', 'isracard', 2), card('max', 'max', 10)];
    const bills = monthBills(cards, [spend('isracard', 423_700), spend('max', 282_900)], d('2026-10-09'));
    renderWithProviders(
      <CardsSummary
        bills={bills}
        cardCount={2}
        accountName={(id) => (id === 'max' ? 'Leumi' : undefined)}
        currency="ILS"
      />,
    );
    const sheet = document.querySelector('[data-slot="cards-summary"]');
    expect(sheet).toHaveAttribute('data-sheet', 'night');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Leaves the bank this month/);
    expect(sheet?.querySelector('[data-numeral]')).toHaveAttribute('data-numeral-size', 'balance');
    expect(sheet?.querySelector('[data-slot="mark"]')).toHaveTextContent('2,829');
    expect(sheet).toHaveTextContent(/from Leumi/);
  });
});
