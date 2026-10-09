import { describe, expect, it } from 'vitest';

import type { Occurrence, PaymentMethod } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import { readRow, type FoundRow, type ReadContext } from './import-check';
import { collapseOverlaps, draftOf, flagCardFees, flagExisting } from './import-review';
import { expandOccurrences } from './occurrences';
import { d, makeTx, wireRow as wire } from './test-factories';
import { txFormSchema } from './tx-form';

const ctx: ReadContext = {
  file: 0,
  base: 'ILS',
  known: new Set(['ILS', 'USD', 'EUR']),
  anchor: '2026-10-04' as LocalDate,
  today: '2026-10-04' as LocalDate,
};
const at = (
  file: number,
  part: number | null,
  id: string,
  a: string,
  m = 'קפה',
  date = '03/10/26',
): FoundRow => ({
  ...readRow(wire({ a, m, d: date }), id, { ...ctx, file }),
  part,
});

describe('screenshots that overlap', () => {
  it('folds the rows two parts of one capture share at their seam, and nothing else', () => {
    const rows = [
      at(0, 1, 'a', '10.00', 'א'),
      at(0, 1, 'b', '20.00', 'ב'),
      at(0, 1, 'c', '30.00', 'ג'),
      at(0, 2, 'd', '20.00', 'ב'),
      at(0, 2, 'e', '30.00', 'ג'),
      at(0, 2, 'f', '40.00', 'ד'),
    ];
    expect(collapseOverlaps(rows).map((r) => r.id)).toEqual(['a', 'b', 'c', 'f']);
  });

  it('keeps two identical rows in one document - two coffees are two coffees - and notes it', () => {
    const rows = [at(0, null, 'a', '12.00'), at(0, null, 'b', '12.00')];
    expect(collapseOverlaps(rows).map((r) => [r.id, r.flags])).toEqual([
      ['a', ['twice_in_document']],
      ['b', ['twice_in_document']],
    ]);
  });

  it('flags the same row in a second file, which is not at a seam', () => {
    const rows = [
      at(0, null, 'a', '12.00', 'x'),
      at(0, null, 'b', '15.00', 'y'),
      at(1, null, 'c', '99.00', 'z'),
      at(1, null, 'd', '12.00', 'x'),
    ];
    expect(collapseOverlaps(rows).map((r) => [r.id, r.flags])).toEqual([
      ['a', []],
      ['b', []],
      ['c', []],
      ['d', ['in_another_file']],
    ]);
  });
});

const NOW = '2026-01-01T00:00:00.000Z' as IsoInstant;

describe('rows the household already has', () => {
  const occurrencesOf = (...txs: ReturnType<typeof makeTx>[]): Occurrence[] =>
    txs.flatMap((tx) =>
      expandOccurrences(tx, [], d('2026-01-01'), d('2026-12-31'), { today: d('2026-10-04') }),
    );
  const money = (minor: number) => ({
    amountMinor: minor,
    currency: 'ILS',
    baseCurrency: 'ILS',
    baseAmountMinor: minor,
    rateUsed: '1',
    rateDate: d('2026-10-01'),
    rateSource: 'manual' as const,
  });

  it('matches the same kind and amount a day or two away', () => {
    const existing = occurrencesOf(
      makeTx({ id: 'coffee', date: d('2026-10-02'), money: money(1_200), recurrence: { type: 'one_time' } }),
    );
    const rows = flagExisting([at(0, null, 'a', '12.00'), at(0, null, 'b', '13.00')], existing);
    expect(rows.map((r) => r.flags)).toEqual([['already_added'], []]);
  });

  it('sees a standing order’s month, not only rows typed once', () => {
    const existing = occurrencesOf(
      makeTx({
        id: 'gym',
        date: d('2026-01-03'),
        money: money(20_000),
        recurrence: { type: 'monthly', dayOfMonth: 3 },
      }),
    );
    expect(flagExisting([at(0, null, 'a', '200.00', 'gym', '03/10/26')], existing)[0]?.flags).toEqual([
      'already_added',
    ]);
  });

  it('knows a plan already added, from any of its payments', () => {
    const existing = occurrencesOf(
      makeTx({
        id: 'tv',
        date: d('2026-08-14'),
        money: money(20_000),
        recurrence: { type: 'monthly', dayOfMonth: 14, installments: 6 },
      }),
    );
    const payment = {
      ...readRow(
        wire({ a: '200.00', d: '14/08/26', pl: { md: 'installments', n: 3, of: 6, tot: null } }),
        'p',
        ctx,
      ),
    };
    expect(flagExisting([payment], existing)[0]?.flags).toEqual(['already_plan']);
  });

  it('leaves rows it cannot date or price alone', () => {
    const row = readRow(wire({ d: 'soon' }), 'x', ctx);
    expect(flagExisting([row], [])[0]).toBe(row);
  });

  it('knows a card’s monthly fee is already charged by the app', () => {
    const card = (fee?: number): PaymentMethod => ({
      id: 'visa',
      profileId: 'p1',
      type: 'credit_card',
      label: 'Visa',
      isArchived: 0,
      createdAt: NOW,
      updatedAt: NOW,
      ...(fee === undefined ? {} : { card: { monthlyFeeMinor: fee } }),
    });
    const fee = readRow(wire({ a: '14.90', m: 'דמי כרטיס', fee: true }), 'f', ctx);
    expect(flagCardFees([fee], () => card(1_490), [])[0]?.flags).toEqual(['card_fee_counted']);
    expect(flagCardFees([fee], () => card(), [])[0]?.flags).toEqual([]);
    expect(flagCardFees([fee], () => undefined, [card(1_490)])[0]?.flags).toEqual(['card_fee_counted']);
    const plain = at(0, null, 'p', '14.90');
    expect(flagCardFees([plain], () => card(1_490), [])[0]).toBe(plain);
  });

  it('counts an archived card’s fee only up to the month it was archived', () => {
    // The fee line is dated 3 October 2026.
    const fee = readRow(wire({ a: '14.90', m: 'דמי כרטיס', fee: true }), 'f', ctx);
    const archivedOn = (at: string): PaymentMethod => ({
      id: 'closed',
      profileId: 'p1',
      type: 'credit_card',
      label: 'Closed',
      isArchived: 1,
      archivedAt: at as IsoInstant,
      createdAt: NOW,
      updatedAt: NOW,
      card: { monthlyFeeMinor: 1_490 },
    });
    const august = archivedOn('2026-08-15T09:00:00.000Z');
    const october = archivedOn('2026-10-02T09:00:00.000Z');

    // A fee line nothing names, in a household whose only fee card closed before it: a new expense.
    expect(flagCardFees([fee], () => undefined, [august])[0]?.flags).toEqual([]);
    // On the archived card itself, after it closed: the app charges nothing that month.
    expect(flagCardFees([fee], () => august, [august])[0]?.flags).toEqual([]);
    // Within its last month: already charged.
    expect(flagCardFees([fee], () => october, [october])[0]?.flags).toEqual(['card_fee_counted']);
    expect(flagCardFees([fee], () => undefined, [october])[0]?.flags).toEqual(['card_fee_counted']);
  });
});

describe('a found row as form values', () => {
  const base = {
    profileId: 'p1',
    base: 'ILS',
    today: d('2026-10-04'),
    primeRate: '6',
    categoryId: 'cat.groceries',
    paymentMethodId: 'visa',
  };

  it('is what a person would have typed, and passes the form', () => {
    const draft = draftOf(at(0, null, 'a', '120.50', 'שופרסל'), base);
    expect(draft?.values).toMatchObject({
      kind: 'expense',
      amount: '120.50',
      currency: 'ILS',
      date: '2026-10-03',
      dayOfMonth: '3',
      note: 'שופרסל',
      categoryId: 'cat.groceries',
      paymentMethodId: 'visa',
      mode: 'one_time',
    });
    expect(txFormSchema.safeParse(draft?.values).success).toBe(true);
    expect(draft?.needsRate).toBe(false);
  });

  it('keeps a foreign purchase at exactly what the card charged for it', () => {
    const row = readRow(wire({ a: '45.99', c: '$', ca: '172.30', cc: '₪' }), 'f', ctx);
    const draft = draftOf(row, base);
    expect(draft?.values).toMatchObject({ amount: '45.99', currency: 'USD' });
    expect(draft?.rate).toMatchObject({ rateSource: 'manual', rateDate: '2026-10-03' });
    expect(draft?.needsRate).toBe(false);
  });

  it('saves a charge in another currency as charged, with the original in the note', () => {
    const row = readRow(wire({ a: '45.99', c: '$', ca: '42.10', cc: '€' }), 'f', ctx);
    const draft = draftOf(row, base);
    expect(draft?.values).toMatchObject({ amount: '42.10', currency: 'EUR', note: 'שופרסל (45.99 USD)' });
    expect(draft?.needsRate).toBe(true);
  });

  it('looks up a rate for a foreign row with no charge printed', () => {
    expect(draftOf(readRow(wire({ a: '10.00', c: '$' }), 'u', ctx), base)?.needsRate).toBe(true);
  });

  it('saves a plan payment as the whole plan, from the printed total or flagged as worked out', () => {
    const printed = readRow(
      wire({ a: '200.00', d: '14/08/26', pl: { md: 'installments', n: 3, of: 6, tot: '1,200.00' } }),
      'p',
      ctx,
    );
    const draft = draftOf(printed, base);
    expect(draft?.values).toMatchObject({
      mode: 'installments',
      installmentCount: '6',
      amount: '1200.00',
      date: '2026-08-14',
    });
    expect(draft?.flags).toEqual([]);
    expect(txFormSchema.safeParse(draft?.values).success).toBe(true);

    const estimated = readRow(wire({ a: '207.06', pl: { md: 'credit', n: 2, of: 6, tot: null } }), 'q', ctx);
    expect(draftOf(estimated, base)).toMatchObject({
      values: { mode: 'credit', amount: '1242.36' },
      flags: ['total_estimated'],
    });
  });

  it('saves a loan from a statement as a loan: its payments, interest and all', () => {
    // A card company's loan: payment 3 of 24, and what was lent printed beside it.
    const loan = readRow(
      wire({ a: '512.40', m: 'הלוואה מקס', pl: { md: 'loan', n: 3, of: 24, tot: '11,000.00' } }),
      'l',
      ctx,
    );
    const draft = draftOf(loan, base);
    expect(draft?.values).toMatchObject({
      mode: 'loan',
      installmentCount: '24',
      // 24 × 512.40: what will be charged, not what was lent.
      amount: '12297.60',
      rateBasis: 'fixed',
      annualRate: '',
    });
    expect(draft?.flags).toEqual([]);
    expect(txFormSchema.safeParse(draft?.values).success).toBe(true);
  });

  it('files money back with no payment method', () => {
    const refund = readRow(wire({ a: '-50.00' }), 'r', ctx);
    expect(draftOf(refund, base)?.values).toMatchObject({ kind: 'income', paymentMethodId: '' });
  });

  it('has nothing to offer for a row it cannot read', () => {
    expect(draftOf(readRow(wire({ a: 'x' }), 'x', ctx), base)).toBeUndefined();
  });
});
