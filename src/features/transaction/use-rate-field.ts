import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { db } from '@/db/db';
import { quoteRate, type RateQuote } from '@/db/rates-gateway';
import { resolveRate, type RateEntry, type RateResolution } from '@/domain/tx-rate';
import { systemClock } from '@/lib/clock';
import { toDecimalString } from '@/lib/money';
import type { Currency, LocalDate, Minor } from '@/types/money';

/**
 * The rate field's state, including the lookup.
 *
 * The lookup is deliberately NOT part of the Zod schema. It is asynchronous and
 * it touches IndexedDB and possibly the network, neither of which a schema can
 * express - and pretending otherwise would make every keystroke in the amount
 * field revalidate against a promise. The schema covers what is schema-able;
 * this hook owns the rest, and the sheet refuses to submit while it is invalid.
 */
export type RateState = {
  readonly resolution: RateResolution;
  readonly entry: RateEntry;
  /** The text in the rate input, exactly as typed. */
  readonly rate: string;
  readonly charged: Minor | undefined;
  /** What the lookup found, for the provenance line under the field. */
  readonly known: RateQuote | undefined;
  readonly isLooking: boolean;
};

export type RateFieldApi = RateState & {
  readonly setRate: (value: string) => void;
  readonly setCharged: (minor: Minor | undefined) => void;
  readonly setEntry: (entry: RateEntry) => void;
};

/** What a stored answer answers. Changing any part of it invalidates the lookup. */
function lookupKey(from: Currency, to: Currency, on: LocalDate): string {
  return `${from}|${to}|${on}`;
}

export function useRateField({
  amount,
  currency,
  baseCurrency,
  date,
  today,
  /**
   * The rate already on the row, when editing.
   *
   * Without it, opening a 2024 EUR row while offline would find nothing in the
   * cache for that date and empty a required field - trapping the user inside a
   * form they only opened to fix a typo in the note.
   */
  existing,
}: {
  readonly amount: string;
  readonly currency: Currency;
  readonly baseCurrency: Currency;
  readonly date: LocalDate;
  readonly today: LocalDate;
  readonly existing?: RateQuote;
}): RateFieldApi {
  const [entry, setEntry] = useState<RateEntry>('rate');
  const [rate, setRateText] = useState(existing?.rate ?? '');
  const [charged, setCharged] = useState<Minor | undefined>(undefined);

  /*
   * The lookup result, tagged with the question it answers.
   *
   * Stored as one { key, quote } pair rather than as separate `known` and
   * `isLooking` pieces of state, because that is what removes every synchronous
   * setState from the effect below: "we are still looking" becomes a comparison
   * between the key we want and the key we have, and the effect only ever
   * writes state from inside an async callback.
   *
   * It also makes the stale-response case impossible to get wrong. Changing the
   * currency twice quickly starts two lookups and the FIRST can resolve second;
   * a tagged answer for a currency the form no longer holds simply does not
   * match, so it is ignored rather than displayed and saved.
   */
  const [settled, setSettled] = useState<{ key: string; quote: RateQuote | undefined } | undefined>(
    undefined,
  );

  /*
   * Once the user types, the lookup stops writing to the field.
   *
   * Not a `rate !== ''` check: the prefill also makes it non-empty, so a later
   * lookup would decline to update a value nobody chose. Read only inside
   * handlers and async callbacks, never during render.
   */
  const touchedRef = useRef(false);

  const needsRate = currency !== baseCurrency;
  const wanted = lookupKey(currency, baseCurrency, date);

  useEffect(() => {
    if (!needsRate) return;

    let cancelled = false;
    const controller = new AbortController();

    void quoteRate(db, currency, baseCurrency, date, {
      nowMs: systemClock.nowMs(),
      today,
      signal: controller.signal,
    }).then(
      (quote) => {
        if (cancelled) return;
        const resolved = quote ?? existing;
        setSettled({ key: wanted, quote: resolved });
        if (!touchedRef.current && resolved !== undefined) setRateText(resolved.rate);
      },
      () => {
        // `quoteRate` already swallows provider failures; this catches only a
        // Dexie error, and an unanswered lookup must still stop the spinner.
        if (!cancelled) setSettled({ key: wanted, quote: existing });
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [needsRate, currency, baseCurrency, date, today, existing, wanted]);

  const answered = settled?.key === wanted;
  const known = needsRate && answered ? settled.quote : needsRate ? existing : undefined;
  const isLooking = needsRate && !answered;

  const setRate = useCallback((value: string) => {
    touchedRef.current = true;
    setRateText(value);
  }, []);

  const setChargedAmount = useCallback((minor: Minor | undefined) => {
    touchedRef.current = true;
    setCharged(minor);
  }, []);

  const changeEntry = useCallback(
    (next: RateEntry) => {
      setEntry(next);
      /*
       * Seed the field being switched TO from the one being switched from.
       *
       * Switching to "total charged" with an empty box would invalidate a form
       * that was valid a moment ago, for a value the user can already see
       * computed one line below. Carrying it across makes the toggle a change
       * of viewpoint rather than a loss of data.
       */
      if (next === 'charged' && charged === undefined) {
        const current = resolveRate(
          {
            amount,
            currency,
            baseCurrency,
            rate,
            charged: '',
            entry: 'rate',
            ...(known === undefined ? {} : { known }),
          },
          today,
        );
        if (current.status === 'resolved' && current.chargedMinor > 0) setCharged(current.chargedMinor);
      }
    },
    [amount, currency, baseCurrency, rate, charged, known, today],
  );

  const resolution = useMemo(
    () =>
      resolveRate(
        {
          amount,
          currency,
          baseCurrency,
          rate,
          charged: charged === undefined ? '' : toDecimalString(charged, baseCurrency),
          entry,
          ...(known === undefined ? {} : { known }),
        },
        today,
      ),
    [amount, currency, baseCurrency, rate, charged, entry, known, today],
  );

  return {
    resolution,
    entry,
    rate,
    charged,
    known,
    isLooking,
    setRate,
    setCharged: setChargedAmount,
    setEntry: changeEntry,
  };
}
