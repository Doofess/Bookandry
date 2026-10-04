import { assertLocalDate, SERIES_MAX } from '@/lib/dates';
import type { Override, Recurrence, Transaction } from '@/types/domain';
import type { IsoInstant, LocalDate, MoneySnapshot } from '@/types/money';

import type { WireRow } from './import-wire';

/** Test-only builders. Kept beside the domain so the shapes cannot drift apart. */

export const d = (s: string): LocalDate => assertLocalDate(s);
const ts = (s: string): IsoInstant => s as IsoInstant;

export const MONEY: MoneySnapshot = {
  amountMinor: 4500,
  currency: 'USD',
  baseCurrency: 'USD',
  baseAmountMinor: 4500,
  rateUsed: '1',
  rateDate: d('2026-01-01'),
  rateSource: 'demo',
};

/**
 * Mirrors the real `materialize()` gateway: seriesEnd is widened to cover any
 * override that moves an occurrence later, or the interval query would never
 * return the row and the moved-in handling would be dead code.
 */
export function makeTx(
  partial: Partial<Transaction> & { date: LocalDate; recurrence: Recurrence },
  overrides: readonly Override[] = [],
): Transaction {
  const id = partial.id ?? 'tx1';

  let end: LocalDate =
    partial.recurrence.type === 'one_time' ? partial.date : (partial.recurrence.endDate ?? SERIES_MAX);

  for (const o of overrides) {
    if (o.transactionId !== id) continue;
    if (o.action === 'modify' && o.patch.date !== undefined && o.patch.date > end) {
      end = o.patch.date;
    }
  }

  return {
    profileId: 'p1',
    kind: 'expense',
    categoryId: 'cat.groceries',
    money: MONEY,
    isDeleted: 0,
    createdAt: ts('2026-01-01T00:00:00.000Z'),
    updatedAt: ts('2026-01-01T00:00:00.000Z'),
    ...partial,
    // Derived fields come last: they must win over anything passed in, exactly
    // as the real materialize() gateway behaves.
    id,
    seriesStart: partial.date,
    seriesEnd: end,
    seriesRootId: partial.seriesRootId ?? id,
  };
}

export function skip(transactionId: string, occurrenceDate: LocalDate): Override {
  return {
    id: `ov-skip-${occurrenceDate}`,
    transactionId,
    occurrenceDate,
    action: 'skip',
    createdAt: ts('2026-01-01T00:00:00.000Z'),
    updatedAt: ts('2026-01-01T00:00:00.000Z'),
  };
}

export function modify(
  transactionId: string,
  occurrenceDate: LocalDate,
  patch: Extract<Override, { action: 'modify' }>['patch'],
): Override {
  return {
    id: `ov-mod-${occurrenceDate}`,
    transactionId,
    occurrenceDate,
    action: 'modify',
    patch,
    createdAt: ts('2026-01-01T00:00:00.000Z'),
    updatedAt: ts('2026-01-01T00:00:00.000Z'),
  };
}

/** A transcribed row, as the reader would send it: a plain purchase unless told otherwise. */
export const wireRow = (over: Partial<WireRow> = {}): WireRow => ({
  s: 0,
  p: null,
  k: 'e',
  st: 'posted',
  fee: false,
  d: '03/10/26',
  a: '120.50',
  c: '₪',
  sg: null,
  ca: null,
  cc: null,
  cd: null,
  m: 'שופרסל',
  cat: null,
  pm: null,
  pl: null,
  ...over,
});
