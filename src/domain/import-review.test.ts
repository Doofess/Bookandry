import { describe, expect, it } from 'vitest';

import type { Occurrence, PaymentMethod } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import { BLOCKING, readRow, type FoundRow, type ReadContext } from './import-check';
import { collapseOverlaps, draftOf, flagCardFees, flagExisting, sameMerchant } from './import-review';
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

  describe('when both sides name a card', () => {
    // Synthetic: two cards of one household, used at the same shops.
    const card = (id: string, lastDigits?: string, isArchived: 0 | 1 = 0): PaymentMethod => ({
      id,
      profileId: 'p1',
      type: 'credit_card',
      label: id,
      isArchived,
      createdAt: NOW,
      updatedAt: NOW,
      ...(lastDigits === undefined ? {} : { card: { lastDigits } }),
    });
    const methods = [card('a', '1111'), card('b')];
    const onCard = (minor: number, date: string, paymentMethodId?: string, note = 'מרקט לדוגמה') =>
      occurrencesOf(
        makeTx({
          id: `${date}-${String(minor)}`,
          date: d(date),
          money: money(minor),
          recurrence: { type: 'one_time' },
          note,
          ...(paymentMethodId === undefined ? {} : { paymentMethodId }),
        }),
      );
    const row = (id: string, a: string, date: string, l4: string, m = 'מרקט לדוגמה'): FoundRow => {
      const found = at(0, null, id, a, m, date);
      return { ...found, wire: { ...found.wire, l4 } };
    };
    const byDigits = (r: FoundRow) => methods.find((m) => m.card?.lastDigits === r.wire.l4);
    const cards = { methods, methodOf: byDigits };

    it('never takes a row on one card for an occurrence on another, and only notes the likeness: the five near-misses', () => {
      const existing = [
        ...onCard(3_770, '2026-02-03', 'a'),
        ...onCard(3_770, '2026-03-11', 'a'),
        ...onCard(3_770, '2026-03-24', 'a'),
        ...onCard(3_820, '2026-02-26', 'a'),
      ];
      // The other card, not yet in the household: its digits are all the row has.
      const rows = [
        row('r1', '37.70', '04/02/26', '9999'),
        row('r2', '37.70', '11/03/26', '9999'),
        row('r3', '37.70', '23/03/26', '9999'),
        row('r4', '37.70', '25/03/26', '9999'),
        row('r5', '38.20', '27/02/26', '9999'),
      ];
      // Not blocked - ticked - but noted, in case it was saved earlier under the wrong card.
      expect(flagExisting(rows, existing, cards).map((r) => r.flags)).toEqual(
        Array(5).fill(['similar_other_card']),
      );
      expect(BLOCKING.has('similar_other_card')).toBe(false);
      // Without what the cards say, as before: every one looks already added.
      expect(flagExisting(rows, existing).map((r) => r.flags)).toEqual(Array(5).fill(['already_added']));
    });

    it('still knows a re-import on the same card', () => {
      const existing = onCard(3_770, '2026-02-03', 'a');
      expect(flagExisting([row('r', '37.70', '04/02/26', '1111')], existing, cards)[0]?.flags).toEqual([
        'already_added',
      ]);
    });

    it('on the same card a day apart, lets the merchant break the tie; on the same day, the amount is enough', () => {
      const existing = onCard(3_770, '2026-02-03', 'a', 'קפה פלוני');
      const flags = (date: string) =>
        flagExisting([row('r', '37.70', date, '1111', 'מרקט לדוגמה')], existing, cards)[0]?.flags;
      expect(flags('04/02/26')).toEqual([]);
      expect(flags('03/02/26')).toEqual(['already_added']);
      // A different spelling of the same shop is the same shop.
      expect(
        flagExisting([row('r', '37.70', '04/02/26', '1111', 'ק.פלוני בע"מ')], existing, cards)[0]?.flags,
      ).toEqual(['already_added']);
    });

    it('compares the payment methods themselves when the row has no digits', () => {
      const existing = onCard(3_770, '2026-02-03', 'a');
      const named = (r: FoundRow) => (r.id === 'r' ? methods[1] : undefined);
      expect(
        flagExisting([row('r', '37.70', '03/02/26', '')], existing, { methods, methodOf: named })[0]?.flags,
      ).toEqual(['similar_other_card']);
    });

    it('lets equal digits decide over different payment methods: an archived card added again', () => {
      // The occurrence is on the old, archived card; the row's alias names the new one with the same digits.
      const old = card('old', '1111', 1);
      const added = card('new', '1111');
      const existing = onCard(3_770, '2026-02-03', 'old');
      const everyCard = { methods: [old, added], methodOf: () => added };
      expect(flagExisting([row('r', '37.70', '03/02/26', '1111')], existing, everyCard)[0]?.flags).toEqual([
        'already_added',
      ]);
      // The row prints nothing; its method's digits still match the old card's.
      expect(flagExisting([row('r', '37.70', '03/02/26', '')], existing, everyCard)[0]?.flags).toEqual([
        'already_added',
      ]);
    });

    it('lets equal digits decide for a renamed card the row names by its new name', () => {
      const renamed = { ...card('renamed', '1111'), label: 'הכרטיס החדש' };
      const existing = onCard(3_770, '2026-02-03', 'a');
      const both = { methods: [...methods, renamed], methodOf: () => renamed };
      expect(flagExisting([row('r', '37.70', '03/02/26', '')], existing, both)[0]?.flags).toEqual([
        'already_added',
      ]);
    });

    it('keeps today’s match when either side carries no card', () => {
      const noMethod = onCard(3_770, '2026-02-03');
      expect(flagExisting([row('r', '37.70', '04/02/26', '9999')], noMethod, cards)[0]?.flags).toEqual([
        'already_added',
      ]);
      const onA = onCard(3_770, '2026-02-03', 'a');
      expect(flagExisting([row('r', '37.70', '04/02/26', '')], onA, cards)[0]?.flags).toEqual([
        'already_added',
      ]);
    });

    it('does not take a plan on one card for a plan on another', () => {
      const existing = occurrencesOf(
        makeTx({
          id: 'tv',
          date: d('2026-08-14'),
          money: money(20_000),
          recurrence: { type: 'monthly', dayOfMonth: 14, installments: 6 },
          paymentMethodId: 'a',
        }),
      );
      const payment = readRow(
        wire({ a: '200.00', d: '14/08/26', l4: '9999', pl: { md: 'installments', n: 3, of: 6, tot: null } }),
        'p',
        ctx,
      );
      expect(flagExisting([payment], existing, cards)[0]?.flags).not.toContain('already_plan');
      expect(
        flagExisting([{ ...payment, wire: { ...payment.wire, l4: '1111' } }], existing, cards)[0]?.flags,
      ).toEqual(['already_plan']);
    });
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

describe('one merchant, two spellings', () => {
  it('is one when a name sits inside the other or they share a real word', () => {
    expect(sameMerchant('בר פלוני', 'ברפלוני סניף לדוגמה')).toBe(true);
    expect(sameMerchant('קפה פלוני', 'ק.פלוני בע"מ')).toBe(true);
    expect(sameMerchant('DEMOEATS', 'DemoEats (12.00 USD)')).toBe(true);
    expect(sameMerchant('מרקט לדוגמה', 'קפה פלוני')).toBe(false);
    expect(sameMerchant('', 'קפה פלוני')).toBe(true);
  });
});
