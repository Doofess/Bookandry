import { addMonthsClamped, compareLocal } from '@/lib/dates';
import { CASH_METHOD_ID, isActiveMethod, type Occurrence, type PaymentMethod } from '@/types/domain';
import type { LocalDate } from '@/types/money';

import { methodOwnedBy } from './tx-options';

/**
 * Where income lands: "Goes to" on the income form, the feed row's mark, and
 * an account's "Incoming" line.
 *
 * A bank account it lands in is a label (per-account balances are not
 * modelled); cash is what the cash tab counts. A card is never offered:
 * income does not land on a card.
 */

/** A bank account, or the built-in cash. */
export function isDestinationType(method: Pick<PaymentMethod, 'id' | 'type'>): boolean {
  return method.id === CASH_METHOD_ID || method.type === 'bank_account';
}

/**
 * The "Goes to" options for one person: their own bank accounts and the joint
 * ones they hold (`methodOwnedBy`, the rule the payment picker uses), by name,
 * then cash. Archived accounts are left out, except the one already on the
 * row, which an edit must not silently lose.
 */
export function destinationsFor(
  methods: readonly PaymentMethod[],
  profileId: string,
  keepId = '',
): readonly PaymentMethod[] {
  const usable = methods.filter(
    (m) => isDestinationType(m) && methodOwnedBy(m, profileId) && (m.id === keepId || isActiveMethod(m)),
  );
  return [
    ...usable.filter((m) => m.id !== CASH_METHOD_ID).sort((a, b) => a.label.localeCompare(b.label)),
    ...usable.filter((m) => m.id === CASH_METHOD_ID),
  ];
}

/** How far back "where it usually goes" looks. */
export const DESTINATION_HISTORY_MONTHS = 6;

/**
 * Where new income goes unless the person says otherwise: where this person's
 * income went most often in the last six months, counted by PAYMENT - a
 * monthly salary is six arrivals, a gift is one - with a tie going to the
 * more recent. '' ("Not assigned") when none of it said, or when it went
 * somewhere this person can no longer use.
 */
export function defaultDestination(
  history: readonly Occurrence[],
  profileId: string,
  methods: readonly PaymentMethod[],
  today: LocalDate,
): string {
  const from = addMonthsClamped(today, -DESTINATION_HISTORY_MONTHS);
  const usable = new Set(destinationsFor(methods, profileId).map((m) => m.id));
  const tally = new Map<string, { count: number; last: LocalDate }>();

  for (const o of history) {
    if (o.transaction.kind !== 'income' || o.transaction.profileId !== profileId || o.isSkipped) continue;
    if (compareLocal(o.date, from) < 0 || compareLocal(o.date, today) > 0) continue;
    const id = o.destinationId;
    if (id === undefined || !usable.has(id)) continue;
    const seen = tally.get(id);
    tally.set(id, {
      count: (seen?.count ?? 0) + 1,
      last: seen === undefined || compareLocal(o.date, seen.last) > 0 ? o.date : seen.last,
    });
  }

  let best: { id: string; count: number; last: LocalDate } | undefined;
  for (const [id, { count, last }] of tally) {
    if (
      best === undefined ||
      count > best.count ||
      (count === best.count && compareLocal(last, best.last) > 0)
    ) {
      best = { id, count, last };
    }
  }
  return best?.id ?? '';
}
