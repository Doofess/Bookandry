import { screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { monthBills } from '@/domain/month-bills';
import { MONEY, d } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Occurrence, PaymentMethod } from '@/types/domain';

import { MonthSheet } from './month-sheet';

beforeAll(async () => {
  await initTestI18n('en');
});

const TODAY = d('2026-10-09');
const occ = (kind: 'income' | 'expense', date: string, minor: number) =>
  ({
    key: `${kind}:${date}:${String(minor)}`,
    date: d(date),
    originalDate: d(date),
    isSkipped: false,
    isProjected: false,
    categoryId: kind === 'income' ? 'cat.salary' : 'cat.rent',
    money: { ...MONEY, amountMinor: minor, baseAmountMinor: minor },
    transaction: { kind, recurrence: { type: 'one_time' } },
  }) as unknown as Occurrence;
const card = (id: string, issuer: 'isracard' | 'max' | 'cal', billingDay: number) =>
  ({
    id,
    profileId: 'p',
    type: 'credit_card',
    label: id,
    card: { issuer, billingDay },
    isArchived: 0,
  }) as unknown as PaymentMethod;
const spend = (methodId: string, date: string, minor: number) =>
  ({ ...occ('expense', date, minor), paymentMethodId: methodId }) as Occurrence;

const cards = [card('isracard', 'isracard', 2), card('max', 'max', 10), card('cal', 'cal', 15)];
const bills = monthBills(
  cards,
  [
    spend('isracard', '2026-09-12', 423_700),
    spend('max', '2026-09-14', 282_900),
    spend('cal', '2026-09-25', 187_600),
  ],
  TODAY,
);

function draw() {
  return renderWithProviders(
    <MonthSheet
      month={d('2026-10-01')}
      today={TODAY}
      occurrences={[
        occ('income', '2026-10-01', 2_390_000),
        occ('expense', '2026-10-03', 1_436_200),
        occ('income', '2026-10-20', 99_900),
      ]}
      bills={bills}
      currency="ILS"
      nextIncome={{ name: 'Salary', date: d('2026-11-01') }}
      forecast={<p>forecast</p>}
      monthPicker={null}
    />,
  );
}

describe('the month sheet', () => {
  it('says how the month is going: in, out, the share, and what is left, as the concept does', () => {
    draw();
    const sheet = document.querySelector<HTMLElement>('[data-slot="month-sheet"]');
    expect(sheet).toHaveAttribute('data-sheet', 'sapphire');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/October so far/);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Day 9 of 31/);
    expect(screen.getByRole('img', { name: /60% of what came in went out/ })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="mark"]')).toHaveTextContent('60%');
    const left = document.querySelector('[data-slot="month-left"] [data-numeral]');
    expect(left).toHaveAttribute('data-numeral-size', 'left');
    expect(screen.getByText('forecast')).toBeInTheDocument(); // "expected this month" stays (behaviour kept)
  });

  it('lists the charges by day with each company as a chip, and strikes through the ones charged', () => {
    draw();
    const list = screen.getByRole('list', { name: 'Card charges by day' });
    const days = within(list).getAllByRole('listitem');
    expect(days).toHaveLength(3);
    expect(days[0]).toHaveTextContent('2');
    expect(days[0]).toHaveTextContent('charged');
    expect(days[0]?.querySelector('[data-slot="chip"]')).toHaveAttribute('data-money', 'issuer-isracard');
    expect(days[0]?.className).toMatch(/opacity-78/);
    expect(days[1]?.className).not.toMatch(/opacity-78/);
  });

  it('draws only what it has while the month loads', () => {
    renderWithProviders(
      <MonthSheet
        month={d('2026-10-01')}
        today={TODAY}
        occurrences={undefined}
        bills={undefined}
        currency="ILS"
        nextIncome={undefined}
        forecast={null}
        monthPicker={null}
      />,
    );
    expect(document.querySelector('[data-slot="month-sheet"]')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Card charges by day' })).toBeNull();
  });
});
