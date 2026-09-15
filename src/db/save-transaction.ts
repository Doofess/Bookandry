import {
  planSeriesEdit,
  type EditScope,
  type SeriesEditError,
  type SeriesEditPlan,
  type TransactionPatch,
} from '@/domain/series-edit';
import type { TxFormParsed } from '@/domain/tx-form';
import { convertMinor } from '@/lib/money';
import type { Override, Transaction } from '@/types/domain';
import type { Currency, IsoInstant, LocalDate, MoneySnapshot, RateSource, RateString } from '@/types/money';

import type { GreenbackDB } from './db';
import { applySeriesEdit, createTransaction, type NewTransactionResult } from './series-edit';

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

export async function saveNewTransaction(db: GreenbackDB, input: SaveInput): Promise<NewTransactionResult> {
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
      money,
      recurrence: parsed.recurrence,
      date: parsed.date,
      ...(parsed.note === undefined ? {} : { note: parsed.note }),
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

/**
 * Apply an edit to one occurrence, this-and-future, or the whole series.
 *
 * Thin by design: `planSeriesEdit` does the thinking purely and
 * `applySeriesEdit` writes the result in one transaction. This exists so the
 * sheet never touches either directly - it hands over a patch and a scope, and
 * gets back the warnings it has to show.
 */
export type EditTransactionInput = {
  readonly transaction: Transaction;
  readonly overrides: readonly Override[];
  readonly scope: EditScope;
  /** The ORIGINAL slot date, never the moved one: it is the override's key. */
  readonly at: LocalDate;
  readonly patch: TransactionPatch;
  readonly today: LocalDate;
  readonly now: IsoInstant;
  readonly newId: () => string;
};

export type EditTransactionResult =
  | { readonly ok: true; readonly plan: SeriesEditPlan }
  | { readonly ok: false; readonly error: SeriesEditError };

export async function applyTransactionEdit(
  db: GreenbackDB,
  input: EditTransactionInput,
): Promise<EditTransactionResult> {
  const planned = planSeriesEdit(input);
  if (!planned.ok) return planned;

  await applySeriesEdit(db, planned.plan);
  return { ok: true, plan: planned.plan };
}
