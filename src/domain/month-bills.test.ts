import { describe, expect, it } from 'vitest';

import type { Occurrence, PaymentMethod } from '@/types/domain';

import { monthBills, settledThisMonth } from './month-bills';
import { d, MONEY } from './test-factories';

const card = (id: string, billingDay: number): PaymentMethod =>
  ({
    id,
    profileId: 'p',
    type: 'credit_card',
    label: id,
    card: { issuer: 'max', billingDay },
    isArchived: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }) as PaymentMethod;

const spend = (
  methodId: string | undefined,
  date: string,
  minor: number,
  kind: 'expense' | 'income' = 'expense',
) =>
  ({
    key: `${methodId ?? 'bank'}:${date}:${String(minor)}`,
    date: d(date),
    originalDate: d(date),
    paymentMethodId: methodId,
    isSkipped: false,
    isProjected: false,
    categoryId: 'cat.groceries',
    money: { ...MONEY, amountMinor: minor, baseAmountMinor: minor },
    transaction: { kind, recurrence: { type: 'one_time' } },
  }) as unknown as Occurrence;

const TODAY = d('2026-10-09');
const isracard = card('isracard', 2);
const max = card('max', 10);
const cal = card('cal', 15);

describe('monthBills', () => {
  const bills = monthBills(
    [isracard, max, cal],
    [
      spend('isracard', '2026-09-12', 321_400),
      spend('max', '2026-09-14', 214_000),
      spend('cal', '2026-09-25', 187_600),
      spend('max', '2026-10-03', 9_999),
    ],
    TODAY,
  );

  it("groups this month's bills by their day, in order, and says which are charged", () => {
    expect(bills.days.map((day) => [day.date, day.totalMinor, day.charged])).toEqual([
      ['2026-10-02', 321_400, true],
      ['2026-10-10', 214_000, false],
      ['2026-10-15', 187_600, false],
    ]);
  });

  it('sums the month, what is still to come, and when the last one falls', () => {
    expect(bills.totalMinor).toBe(723_000);
    expect(bills.upcomingMinor).toBe(401_600);
    expect(bills.lastDate).toBe('2026-10-15');
    expect(bills.byCard.get('max')?.totalMinor).toBe(214_000);
  });

  it('has nothing for a month with no bills', () => {
    expect(monthBills([], [], TODAY)).toMatchObject({
      days: [],
      totalMinor: 0,
      upcomingMinor: 0,
      lastDate: undefined,
    });
  });
});

describe('settledThisMonth', () => {
  it('counts income and bank-paid spending to today, and the bills already charged, never a card purchase', () => {
    const methods = new Map([[isracard.id, isracard]]);
    const occurrences = [
      spend(undefined, '2026-10-01', 2_390_000, 'income'),
      spend(undefined, '2026-10-07', 41_200),
      spend('isracard', '2026-10-09', 41_260),
      spend(undefined, '2026-10-20', 99_999, 'income'),
    ];
    const bills = monthBills([isracard], [spend('isracard', '2026-09-12', 423_700)], TODAY);
    expect(settledThisMonth(occurrences, methods, TODAY, bills)).toBe(2_390_000 - 41_200 - 423_700);
  });
});
