import type { TxFormParsed } from '@/domain/tx-form';
import { addPercentFee, convertMinor } from '@/lib/money';
import type { Currency, IsoInstant, LocalDate, MoneySnapshot, RateSource, RateString } from '@/types/money';

import type { BookandryDB } from './db';
import { createTransaction, type NewTransactionResult } from './series-edit';

/**
 * Turn a validated form into a row.
 *
 * Separate from the sheet so the money assembly - the part that can be silently
 * wrong - is testable against a real database without rendering anything.
 */
export type ResolvedRate = {
  readonly rate: RateString;
  readonly rateDate: LocalDate;
  readonly rateSource: RateSource;
};

export type SaveInput = {
  readonly parsed: TxFormParsed;
  readonly baseCurrency: Currency;
  /** Absent only when the transaction is already in the base currency. */
  readonly rate?: ResolvedRate;
  /** The paying card's foreign-currency fee (`fxFeeFor`), when it charges one. */
  readonly feeRate?: string;
  readonly now: IsoInstant;
  readonly newId: () => string;
};

export class RateMissingError extends Error {
  constructor() {
    super('A foreign-currency transaction cannot be saved without a rate');
    this.name = 'RateMissingError';
  }
}

/**
 * The money snapshot for a new transaction.
 *
 * ONE conversion, rounded once, from the ORIGINAL amount. Never from a
 * previously converted figure: round-tripping through the base is lossy
 * (1.000 KWD -> 501 JPY -> 1.001 KWD), which is also why the reconvert flow
 * recomputes from `(amountMinor, currency)` rather than from `baseAmountMinor`.
 */
export function buildMoney(input: SaveInput): MoneySnapshot {
  const money = convertedMoney(input);
  const fee = input.feeRate;
  if (fee === undefined) return money;
  // A card's foreign-currency fee: what the statement will charge, in the base.
  return { ...money, baseAmountMinor: addPercentFee(money.baseAmountMinor, fee), feeRate: fee };
}

function convertedMoney(input: SaveInput): MoneySnapshot {
  const { parsed, baseCurrency, rate } = input;

  if (parsed.currency === baseCurrency) {
    /*
     * The identity. `rateUsed: '1'` here is not the fabricated rate §4 fell
     * back to - the currencies genuinely match, which is the case
     * `convertMinor` short-circuits without arithmetic.
     *
     * `rateSource: 'manual'` because no provider was consulted. It costs
     * nothing downstream: the reconvert flow branches on
     * `currency === newBase` BEFORE it looks at the source, so an identity row
     * is never prefetched and never treated as a user-chosen rate.
     */
    return {
      amountMinor: parsed.amountMinor,
      currency: parsed.currency,
      baseCurrency,
      baseAmountMinor: parsed.amountMinor,
      rateUsed: '1',
      rateDate: parsed.date,
      rateSource: 'manual',
    };
  }

  if (rate === undefined) throw new RateMissingError();

  return {
    amountMinor: parsed.amountMinor,
    currency: parsed.currency,
    baseCurrency,
    baseAmountMinor: convertMinor(parsed.amountMinor, parsed.currency, baseCurrency, rate.rate),
    rateUsed: rate.rate,
    rateDate: rate.rateDate,
    rateSource: rate.rateSource,
  };
}

export async function saveNewTransaction(db: BookandryDB, input: SaveInput): Promise<NewTransactionResult> {
  const { parsed, now, newId } = input;
  const money = buildMoney(input);
  const id = newId();

  return createTransaction(db, {
    draft: {
      id,
      profileId: parsed.profileId,
      kind: parsed.kind,
      categoryId: parsed.categoryId,
      ...(parsed.paymentMethodId === undefined ? {} : { paymentMethodId: parsed.paymentMethodId }),
      ...(parsed.destinationId === undefined ? {} : { destinationId: parsed.destinationId }),
      money,
      recurrence: parsed.recurrence,
      date: parsed.date,
      ...(parsed.note === undefined ? {} : { note: parsed.note }),
      // A 30+ purchase: charged on the bill after next, at this rate.
      ...(parsed.deferral === undefined ? {} : { deferral: parsed.deferral }),
      // A new series is its own root. The field exists so that a later split
      // can be traced back, and seeding it with the id keeps every row's
      // lineage answerable without a null check.
      seriesRootId: id,
      createdAt: now,
      updatedAt: now,
    },
    ...(parsed.installmentTotalMinor === undefined
      ? {}
      : { installmentTotalMinor: parsed.installmentTotalMinor }),
    now,
    newId,
  });
}
