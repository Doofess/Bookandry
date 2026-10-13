import { compareLocal, startOfMonth } from '@/lib/dates';
import { sum } from '@/lib/money';
import type { Occurrence, PaymentMethod } from '@/types/domain';
import type { LocalDate, Minor } from '@/types/money';

import { billingDayOf, cardBills } from './cards';

export type MonthBill = {
  readonly card: PaymentMethod;
  readonly chargeDate: LocalDate;
  readonly totalMinor: Minor;
};
export type ChargeDay = {
  readonly date: LocalDate;
  readonly bills: readonly MonthBill[];
  readonly totalMinor: Minor;
  /** On or before today: the money has left the bank. */
  readonly charged: boolean;
};
export type MonthBills = {
  readonly days: readonly ChargeDay[];
  readonly totalMinor: Minor;
  readonly upcomingMinor: Minor;
  readonly lastDate: LocalDate | undefined;
  readonly byCard: ReadonlyMap<string, MonthBill>;
};

/**
 * The card bills charged in the selected calendar month, by day (§5.1's month
 * sheet, the wallet, Cards' summary): one source, so the lede, the month
 * sheet, the wallet and Cards never disagree. A card's bill this month is the
 * one `cardBills` dates in this month (last month's purchases).
 */
export function monthBills(
  cards: readonly PaymentMethod[],
  occurrences: readonly Occurrence[],
  today: LocalDate,
  selectedMonth: LocalDate = today,
): MonthBills {
  const month = startOfMonth(selectedMonth);
  const bills: MonthBill[] = [];
  for (const card of cards) {
    if (billingDayOf(card) === undefined) continue;
    const bill = cardBills(occurrences, card).find((b) => startOfMonth(b.chargeDate) === month);
    if (bill !== undefined && bill.totalMinor > 0) {
      bills.push({ card, chargeDate: bill.chargeDate, totalMinor: bill.totalMinor });
    }
  }
  const byDate = new Map<LocalDate, MonthBill[]>();
  for (const bill of bills) byDate.set(bill.chargeDate, [...(byDate.get(bill.chargeDate) ?? []), bill]);
  const days = [...byDate.entries()]
    .sort(([a], [b]) => compareLocal(a, b))
    .map(([date, list]) => ({
      date,
      bills: list,
      totalMinor: sum(list.map((b) => b.totalMinor)),
      charged: compareLocal(date, today) <= 0,
    }));
  return {
    days,
    totalMinor: sum(days.map((day) => day.totalMinor)),
    upcomingMinor: sum(days.filter((day) => !day.charged).map((day) => day.totalMinor)),
    lastDate: days.at(-1)?.date,
    byCard: new Map(bills.map((bill) => [bill.card.id, bill])),
  };
}

/**
 * How much the household's money moved since the month began (the balance
 * sheet's lede): income and bank-paid spending up to today, less the card
 * bills already charged. A card purchase counts on its bill, never twice.
 */
export function settledThisMonth(
  occurrences: readonly Occurrence[],
  methods: ReadonlyMap<string, PaymentMethod>,
  today: LocalDate,
  bills: MonthBills,
): Minor {
  let net = 0;
  for (const o of occurrences) {
    if (o.isProjected || o.isSkipped || compareLocal(o.date, today) > 0) continue;
    if (o.transaction.kind === 'income') net += o.money.baseAmountMinor;
    else if (billingDayOf(methods.get(o.paymentMethodId ?? '')) === undefined) net -= o.money.baseAmountMinor;
  }
  return net - sum(bills.days.filter((day) => day.charged).map((day) => day.totalMinor));
}
