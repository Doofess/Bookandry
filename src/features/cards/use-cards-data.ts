import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { findCandidates, findOverrides } from '@/db/repos/transactions';
import { cardCommitments, cardFeeOccurrences } from '@/domain/cards';
import { expandOccurrences } from '@/domain/occurrences';
import { isInstallmentPlan } from '@/domain/tx-edit';
import { MAX_LOAN_PAYMENTS } from '@/domain/tx-form';
import { addMonthsClamped, compareLocal, endOfMonth, startOfMonth } from '@/lib/dates';
import { ALL_PROFILES, type Occurrence, type PaymentMethod, type Profile } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

/** How far back the bill history goes. */
const HISTORY_MONTHS = 6;
/** How far ahead the bills go. */
const AHEAD_MONTHS = 60;
/**
 * How far ahead a plan is followed: to its last payment, since every payment
 * still to come is a commitment and counts against the limit - and a loan
 * charged to a card can run to 360.
 */
const PLAN_AHEAD_MONTHS = MAX_LOAN_PAYMENTS;

export type CardsData = {
  readonly cards: readonly PaymentMethod[];
  /** The credit cards put away, for "Archived cards" to bring back. */
  readonly archived: readonly PaymentMethod[];
  /**
   * The archived cards still owed on: a purchase waiting for its bill, or a
   * plan's payments still to come (cardCommitments). Archiving puts a card
   * out of sight; what it will still take from the bank stays in the
   * household's total until it is paid.
   */
  readonly owing: readonly PaymentMethod[];
  /** The household's bank accounts, unarchived. */
  readonly accounts: readonly PaymentMethod[];
  readonly profiles: ReadonlyMap<string, Profile>;
  /** Every occurrence paid by one of the cards, in the window. */
  readonly occurrences: readonly Occurrence[];
};

/** The household's credit cards and bank accounts, and what has been and will be charged to the cards. */
export function useCardsData(today: LocalDate, baseCurrency: Currency): CardsData | undefined {
  return useLiveQuery(async () => {
    const methods = await db.paymentMethods.toArray();
    const cards = methods
      .filter((m) => m.type === 'credit_card' && m.isArchived === 0)
      .sort((a, b) => a.label.localeCompare(b.label));
    const archived = methods
      .filter((m) => m.type === 'credit_card' && m.isArchived === 1)
      .sort((a, b) => a.label.localeCompare(b.label));
    const accounts = methods
      .filter((m) => m.type === 'bank_account' && m.isArchived === 0)
      .sort((a, b) => a.label.localeCompare(b.label));
    const profiles = new Map((await db.profiles.toArray()).map((p) => [p.id, p]));
    const all = [...cards, ...archived];
    if (all.length === 0) return { cards, archived, owing: [], accounts, profiles, occurrences: [] };

    const ids = new Set(all.map((c) => c.id));
    const from = startOfMonth(addMonthsClamped(today, -HISTORY_MONTHS, 1));
    const to = endOfMonth(addMonthsClamped(today, AHEAD_MONTHS, 1));
    const planTo = endOfMonth(addMonthsClamped(today, PLAN_AHEAD_MONTHS, 1));
    const transactions = (await findCandidates(db, { profileId: ALL_PROFILES, from, to: planTo })).filter(
      (tx) => isInstallmentPlan(tx.recurrence) || compareLocal(tx.seriesStart, to) <= 0,
    );
    const overrides = await findOverrides(
      db,
      transactions.map((t) => t.id),
    );
    const purchases = transactions
      .flatMap((tx) =>
        expandOccurrences(
          tx,
          overrides.filter((o) => o.transactionId === tx.id),
          from,
          isInstallmentPlan(tx.recurrence) ? planTo : to,
          { today },
        ),
      )
      .filter((o) => o.paymentMethodId !== undefined && ids.has(o.paymentMethodId));
    // Each card's monthly fee, on its bills like a purchase.
    // An archived card's too: its fee stops after the month it was archived, not before.
    const fees = cardFeeOccurrences({
      cards: all,
      occurrences: purchases,
      from,
      to,
      today,
      baseCurrency,
      profileId: ALL_PROFILES,
      allProfiles: ALL_PROFILES,
    });

    const occurrences = [...purchases, ...fees];
    const owing = archived.filter((card) => cardCommitments(occurrences, card, today).totalMinor > 0);
    return { cards, archived, owing, accounts, profiles, occurrences };
  }, [today, baseCurrency]);
}
