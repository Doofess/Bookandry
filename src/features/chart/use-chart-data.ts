import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { findCandidates, findOverrides } from '@/db/repos/transactions';
import { availableBalance } from '@/domain/calculators';
import { billingDayOf, cardFeeOccurrences, settleDate } from '@/domain/cards';
import { buildChartData, rangeWindow, type ChartData, type ChartRange } from '@/domain/chart-data';
import { expandOccurrences } from '@/domain/occurrences';
import { addMonthsClamped, compareLocal, minDate, startOfMonth } from '@/lib/dates';
import { ALL_PROFILES, type Override } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

export type ChartWindow = { readonly from: LocalDate; readonly to: LocalDate };

export type ChartState =
  | { readonly status: 'loading' }
  /** A profile's opening balance is in a currency we have no rate for. */
  | { readonly status: 'blocked'; readonly currencies: readonly Currency[] }
  | { readonly status: 'ready'; readonly data: ChartData; readonly window: ChartWindow };

/**
 * The chart's data, from its own query.
 *
 * Like the balance card, and for the same reason: the feed shows one month
 * while the chart shows up to a year, and the balance LINE needs everything
 * back to the opening date to know where it starts. Sharing the feed's memo
 * would either drag a decade of occurrences into the feed or start the line at
 * the wrong number - and the second failure looks like data.
 *
 * One query and ONE expansion covering [opening .. window end], split at the
 * window start: everything before it becomes the line's opening figure,
 * everything inside it becomes the chart. Two queries would let the opening
 * figure and the first plotted point be computed from different reads.
 */
export function useChartData(
  profileId: string,
  range: ChartRange,
  month: LocalDate,
  today: LocalDate,
  baseCurrency: Currency,
): ChartState {
  const state = useLiveQuery(async (): Promise<ChartState> => {
    const all = await db.profiles.toArray();
    const profiles = profileId === ALL_PROFILES ? all : all.filter((p) => p.id === profileId);

    const earliest = profiles.reduce<LocalDate>(
      (soonest, p) => (compareLocal(p.openingBalanceDate, soonest) < 0 ? p.openingBalanceDate : soonest),
      profiles[0]?.openingBalanceDate ?? today,
    );
    const window = rangeWindow(range, month, earliest);

    if (profiles.length === 0) {
      return { status: 'ready', window, data: empty(window, today) };
    }

    const missing = [
      ...new Set(
        profiles
          .filter((p) => p.openingBalanceCurrency !== baseCurrency)
          .map((p) => p.openingBalanceCurrency),
      ),
    ];
    // Same refusal as the balance card. A chart whose line is off by an
    // unconverted opening balance is a confident picture of the wrong thing.
    if (missing.length > 0) return { status: 'blocked', currencies: missing };

    const methods = new Map((await db.paymentMethods.toArray()).map((m) => [m.id, m]));
    // A card's purchases are debited the month after: the line reaches back
    // one more month for the bill that falls at its start.
    const anyBillingCard = [...methods.values()].some((m) => billingDayOf(m) !== undefined);
    const firstDay = minDate(earliest, window.from);
    const queryFrom = anyBillingCard ? startOfMonth(addMonthsClamped(firstDay, -1, 1)) : firstDay;
    const transactions = await findCandidates(db, { profileId, from: queryFrom, to: window.to });
    const overrides = await findOverrides(
      db,
      transactions.map((t) => t.id),
    );

    const byTransaction = new Map<string, Override[]>();
    for (const override of overrides) {
      const list = byTransaction.get(override.transactionId);
      if (list === undefined) byTransaction.set(override.transactionId, [override]);
      else list.push(override);
    }

    const cutoffs = new Map(profiles.map((p) => [p.id, p.openingBalanceDate]));

    const purchases = transactions.flatMap((tx) =>
      expandOccurrences(tx, byTransaction.get(tx.id) ?? [], queryFrom, window.to, { today }),
    );
    const everything = [
      ...purchases,
      ...cardFeeOccurrences({
        cards: [...methods.values()],
        occurrences: purchases,
        from: queryFrom,
        to: window.to,
        today,
        baseCurrency,
        profileId,
        allProfiles: ALL_PROFILES,
      }),
    ];

    // The dots: when it was bought, from each profile's own opening date.
    const inside = everything.filter((o) => {
      const cutoff = cutoffs.get(o.transaction.profileId);
      return (
        compareLocal(o.date, window.from) >= 0 && (cutoff === undefined || compareLocal(o.date, cutoff) >= 0)
      );
    });
    /*
     * The line: when it left the account - a card purchase on its bill - by
     * the same rule as the balance card, so the line ends where that figure
     * is. Each profile's cutoff applies to its own rows only.
     */
    const settled = everything
      .map((o) => {
        const date = settleDate(o, methods);
        return date === o.date ? o : { ...o, date };
      })
      .filter((o) => {
        const cutoff = cutoffs.get(o.transaction.profileId);
        return cutoff === undefined || compareLocal(o.date, cutoff) >= 0;
      });
    const before = settled.filter((o) => compareLocal(o.date, window.from) < 0);
    const lineInside = settled.filter((o) => compareLocal(o.date, window.from) >= 0);

    return {
      status: 'ready',
      window,
      data: buildChartData({
        occurrences: inside,
        balanceOccurrences: lineInside,
        from: window.from,
        to: window.to,
        // Opening balances plus everything that happened before the window.
        openingMinor: availableBalance({ profiles, occurrences: before, baseCurrency }),
        lineThrough: today,
      }),
    };
  }, [profileId, range, month, today, baseCurrency]);

  return state ?? { status: 'loading' };
}

function empty(window: ChartWindow, today: LocalDate): ChartData {
  return buildChartData({
    occurrences: [],
    from: window.from,
    to: window.to,
    openingMinor: 0,
    lineThrough: today,
  });
}
