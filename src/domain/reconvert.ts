import { addPercentFee, convertMinor, multiplyRates } from '@/lib/money';
import type { Override, Profile, Transaction } from '@/types/domain';
import type { Currency, LocalDate, MoneySnapshot, RateSource, RateString } from '@/types/money';

/**
 * Changing the default currency, planned as a PURE function.
 *
 * All the dangerous decisions live here, with no DB and no network, so every
 * one of them is directly testable:
 *
 *  - Recompute from (amountMinor, currency), NEVER from baseAmountMinor.
 *    Round-tripping through the base is lossy - 1.000 KWD becomes 1.001 KWD
 *    after one there-and-back - so the original amount is the only input.
 *  - Use each row's OWN date, not today. That makes the operation idempotent:
 *    running it twice produces identical output, because the answer depends
 *    only on facts that cannot change.
 *  - Never silently discard a rate the USER supplied. A manual rate is carried
 *    across by composing it with the provider old-base to new-base rate, so
 *    their figure still governs its own leg.
 *  - Overrides carrying their own money snapshot are rewritten too. Missing
 *    them would leave those occurrences denominated in the OLD base, giving a
 *    feed whose totals silently mix two currencies.
 */

export type RateQuote = {
  readonly rate: RateString;
  readonly rateDate: LocalDate;
  readonly source: RateSource;
};

export type RateLookup = (from: Currency, to: Currency, on: LocalDate) => RateQuote | undefined;

export type RateRequest = { readonly currency: Currency; readonly date: LocalDate };

export type ReconvertInput = {
  readonly oldBase: Currency;
  readonly newBase: Currency;
  readonly transactions: readonly Transaction[];
  readonly overrides: readonly Override[];
  readonly profiles: readonly Profile[];
};

export type UnresolvedRow = {
  readonly kind: 'transaction' | 'override' | 'profile';
  readonly id: string;
  readonly currency: Currency;
  readonly date: LocalDate;
  readonly reason: 'no_rate' | 'no_bridge_rate';
};

export type ReconvertPlan = {
  readonly transactions: readonly { id: string; money: MoneySnapshot }[];
  readonly overrides: readonly { id: string; money: MoneySnapshot }[];
  readonly profiles: readonly { id: string; openingBalanceMinor: number }[];
  /** Rows that cannot be converted. A non-empty list ABORTS the whole flow. */
  readonly unresolved: readonly UnresolvedRow[];
};

function overrideMoney(o: Override): MoneySnapshot | undefined {
  return o.action === 'modify' ? o.patch.money : undefined;
}

function overrideDate(o: Override): LocalDate {
  return (o.action === 'modify' ? o.patch.date : undefined) ?? o.occurrenceDate;
}

/**
 * Every (currency, date) pair the prefetch must obtain BEFORE any write.
 *
 * Deduplicated: a household has a handful of currencies across many dates, so
 * fetching per row would be pointlessly slow and would hammer a free API.
 */
export function collectRateRequests(input: ReconvertInput): RateRequest[] {
  const seen = new Set<string>();
  const out: RateRequest[] = [];

  const add = (currency: Currency, date: LocalDate) => {
    if (currency === input.newBase) return;
    const key = `${currency}|${date}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ currency, date });
  };

  for (const tx of input.transactions) {
    if (tx.isDeleted === 1) continue;
    add(tx.money.currency, tx.date);
    // A manual rate needs a BRIDGE from the old base to the new one, so the
    // user own figure can be composed rather than thrown away.
    if (tx.money.rateSource === 'manual') add(input.oldBase, tx.date);
  }

  for (const o of input.overrides) {
    const money = overrideMoney(o);
    if (!money) continue;
    const date = overrideDate(o);
    add(money.currency, date);
    if (money.rateSource === 'manual') add(input.oldBase, date);
  }

  for (const p of input.profiles) {
    add(p.openingBalanceCurrency, p.openingBalanceDate);
  }

  return out;
}

type Resolved = { money: MoneySnapshot } | { reason: UnresolvedRow['reason'] };

/**
 * Rebuild one snapshot in the new base, from its ORIGINAL amount - and with
 * the card's foreign-currency fee on top again, where one was charged.
 */
function resolveMoney(
  money: MoneySnapshot,
  date: LocalDate,
  input: ReconvertInput,
  lookup: RateLookup,
): Resolved {
  const resolved = convertMoney(money, date, input, lookup);
  if (!('money' in resolved) || money.feeRate === undefined) return resolved;
  return {
    money: {
      ...resolved.money,
      baseAmountMinor: addPercentFee(resolved.money.baseAmountMinor, money.feeRate),
    },
  };
}

function convertMoney(
  money: MoneySnapshot,
  date: LocalDate,
  input: ReconvertInput,
  lookup: RateLookup,
): Resolved {
  const { newBase, oldBase } = input;

  // Same currency as the new base: the identity, with no rate and no rounding.
  // This is what makes USD to ILS to USD return bit-identical integers.
  if (money.currency === newBase) {
    return {
      money: {
        ...money,
        baseCurrency: newBase,
        baseAmountMinor: money.amountMinor,
        rateUsed: '1',
        rateDate: date,
      },
    };
  }

  if (money.rateSource === 'manual') {
    if (oldBase === newBase) {
      // Recomputed rather than kept, so the fee above lands on the converted
      // amount once - never on a figure that already includes it.
      return {
        money: {
          ...money,
          baseCurrency: newBase,
          baseAmountMinor: convertMinor(money.amountMinor, money.currency, newBase, money.rateUsed),
        },
      };
    }

    // Preserve the deliberate figure by composing it with the bridge, rather
    // than replacing it with a provider rate the user did not choose.
    const bridge = lookup(oldBase, newBase, date);
    if (!bridge) return { reason: 'no_bridge_rate' };

    const composed = multiplyRates(money.rateUsed, bridge.rate);
    return {
      money: {
        ...money,
        baseCurrency: newBase,
        baseAmountMinor: convertMinor(money.amountMinor, money.currency, newBase, composed),
        rateUsed: composed,
        rateDate: bridge.rateDate,
        rateSource: 'manual',
      },
    };
  }

  const quote = lookup(money.currency, newBase, date);
  if (!quote) return { reason: 'no_rate' };

  return {
    money: {
      ...money,
      baseCurrency: newBase,
      // From the ORIGINAL amount. Never from baseAmountMinor.
      baseAmountMinor: convertMinor(money.amountMinor, money.currency, newBase, quote.rate),
      rateUsed: quote.rate,
      rateDate: quote.rateDate,
      rateSource: quote.source,
    },
  };
}

export function planReconversion(input: ReconvertInput, lookup: RateLookup): ReconvertPlan {
  const transactions: { id: string; money: MoneySnapshot }[] = [];
  const overrides: { id: string; money: MoneySnapshot }[] = [];
  const profiles: { id: string; openingBalanceMinor: number }[] = [];
  const unresolved: UnresolvedRow[] = [];

  for (const tx of input.transactions) {
    // Soft-deleted rows are left untouched: they are still recoverable, and a
    // restore should bring back exactly what was deleted.
    if (tx.isDeleted === 1) continue;

    const result = resolveMoney(tx.money, tx.date, input, lookup);
    if ('money' in result) {
      transactions.push({ id: tx.id, money: result.money });
    } else {
      unresolved.push({
        kind: 'transaction',
        id: tx.id,
        currency: tx.money.currency,
        date: tx.date,
        reason: result.reason,
      });
    }
  }

  for (const o of input.overrides) {
    const money = overrideMoney(o);
    if (!money) continue;
    const date = overrideDate(o);

    const result = resolveMoney(money, date, input, lookup);
    if ('money' in result) {
      overrides.push({ id: o.id, money: result.money });
    } else {
      unresolved.push({ kind: 'override', id: o.id, currency: money.currency, date, reason: result.reason });
    }
  }

  for (const p of input.profiles) {
    if (p.openingBalanceCurrency === input.newBase) {
      profiles.push({ id: p.id, openingBalanceMinor: p.openingBalanceMinor });
      continue;
    }

    const quote = lookup(p.openingBalanceCurrency, input.newBase, p.openingBalanceDate);
    if (!quote) {
      unresolved.push({
        kind: 'profile',
        id: p.id,
        currency: p.openingBalanceCurrency,
        date: p.openingBalanceDate,
        reason: 'no_rate',
      });
      continue;
    }

    profiles.push({
      id: p.id,
      openingBalanceMinor: convertMinor(
        p.openingBalanceMinor,
        p.openingBalanceCurrency,
        input.newBase,
        quote.rate,
      ),
    });
  }

  return { transactions, overrides, profiles, unresolved };
}
