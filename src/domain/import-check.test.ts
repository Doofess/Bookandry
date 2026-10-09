import { describe, expect, it } from 'vitest';

import type { LocalDate } from '@/types/money';

import {
  alignReads,
  combineReads,
  currencyFromText,
  disagreements,
  groundInText,
  readRow,
  reconcile,
  withFlags,
  withoutFlags,
  type ReadContext,
} from './import-check';
import type { WireRow, WireTotal } from './import-wire';
import { wireRow } from './test-factories';

const known = new Set(['ILS', 'USD', 'EUR', 'GBP', 'JPY']);
const ctx: ReadContext = {
  file: 0,
  base: 'ILS',
  known,
  anchor: '2026-10-04' as LocalDate,
  today: '2026-10-04' as LocalDate,
};

const wire = wireRow;

const read = (over: Partial<WireRow> = {}, id = 'r0', c: ReadContext = ctx) => readRow(wire(over), id, c);

describe('reading a transcribed row', () => {
  it('reads the money, the date and the currency with the app’s own parsers', () => {
    expect(read()).toMatchObject({
      kind: 'expense',
      date: '2026-10-03',
      amountMinor: 12_050,
      currency: 'ILS',
      flags: [],
    });
  });

  it('knows the currency marks Israeli documents print', () => {
    for (const [mark, currency] of [
      ['₪', 'ILS'],
      ['ש"ח', 'ILS'],
      ['ש״ח', 'ILS'],
      ['NIS', 'ILS'],
      ['$', 'USD'],
      ['דולר', 'USD'],
      ['€', 'EUR'],
      ['יורו', 'EUR'],
      ['£', 'GBP'],
      ['JPY', 'JPY'],
    ] as const) {
      expect(currencyFromText(mark, 'ILS', known), mark).toBe(currency);
    }
    expect(currencyFromText(null, 'USD', known)).toBe('USD');
    expect(currencyFromText(' ', 'USD', known)).toBe('USD');
    expect(currencyFromText('XYZ', 'ILS', known)).toBeUndefined();
    expect(currencyFromText('doubloons', 'ILS', known)).toBeUndefined();
  });

  it('reads money coming back from its sign or its words, whatever the model said', () => {
    expect(read({ a: '-50.00' })).toMatchObject({ kind: 'income', amountMinor: 5_000 });
    expect(read({ a: '50.00', sg: 'זיכוי' })).toMatchObject({ kind: 'income' });
    expect(read({ a: '50.00', sg: '-' })).toMatchObject({ kind: 'income' });
    expect(read({ k: 'i' })).toMatchObject({ kind: 'income' });
    expect(read({ sg: 'רגיל' })).toMatchObject({ kind: 'expense' });
  });

  it('flags what it cannot read, rather than guessing', () => {
    expect(read({ a: '1.234' }).flags).toContain('amount_unreadable');
    expect(read({ c: 'doubloons' }).flags).toEqual(['currency_unknown']);
    expect(read({ d: 'soon' }).flags).toContain('date_unreadable');
    expect(read({ d: '01/01/20' }).flags).toContain('date_out_of_range');
    expect(read({ d: '12/12/26' }).flags).toContain('date_out_of_range');
    expect(read({ d: '12/03' }).flags).toEqual(['date_inferred']);
    expect(read({ st: 'pending' }).flags).toEqual(['pending']);
  });

  it('keeps a statement’s period as the earliest a date may be', () => {
    const period = { from: '2024-01-01' as LocalDate, to: '2024-01-31' as LocalDate };
    expect(read({ d: '15/01/24' }, 'r0', { ...ctx, period }).flags).toEqual([]);
  });

  it('keeps what a foreign purchase was charged, in its own currency', () => {
    expect(read({ a: '45.99', c: '$', ca: '172.30', cc: '₪' })).toMatchObject({
      currency: 'USD',
      amountMinor: 4_599,
      charged: { minor: 17_230, currency: 'ILS' },
    });
    // A charge in the same currency is no information.
    expect(read({ ca: '120.50', cc: '₪' }).charged).toBeUndefined();
  });

  it('reads a plan payment, and its printed total', () => {
    expect(read({ a: '200', pl: { md: 'installments', n: 3, of: 6, tot: '1,200.00' } }).plan).toEqual({
      mode: 'installments',
      number: 3,
      count: 6,
      totalMinor: 120_000,
    });
    expect(read({ pl: { md: 'credit', n: 1, of: 12, tot: null } }).plan).toEqual({
      mode: 'credit',
      number: 1,
      count: 12,
    });
    expect(read({ pl: { md: 'credit', n: 1, of: 12, tot: 'lots' } }).flags).toContain('amount_unreadable');
  });

  it('adds and takes off flags without repeating them', () => {
    const row = withFlags(read(), 'pending', 'pending');
    expect(row.flags).toEqual(['pending']);
    expect(withoutFlags(row, 'pending').flags).toEqual([]);
  });
});

describe('grounding in a text source', () => {
  const text = 'שופרסל דיל 03/10/2026 1234.50\nקפה 12,00 ₪\nUSD 45.99 → 172.30';

  it('finds the amount among the numbers printed, however they are written', () => {
    const rows = groundInText(
      [
        read({ a: '1,234.50' }),
        read({ a: '12.00' }, 'r1'),
        read({ a: '45.99', c: '$', ca: '172.30', cc: '₪' }, 'r2'),
      ],
      text,
    );
    expect(rows.map((r) => r.flags)).toEqual([[], [], []]);
  });

  it('flags an amount the text does not print', () => {
    const [row] = groundInText([read({ a: '1,243.50' })], text);
    expect(row?.flags).toEqual(['amount_not_in_source']);
    const [charged] = groundInText([read({ a: '45.99', c: '$', ca: '999.00', cc: '₪' })], text);
    expect(charged?.flags).toEqual(['amount_not_in_source']);
  });

  it('leaves unreadable rows to their own flags', () => {
    const [row] = groundInText([read({ a: 'x' })], text);
    expect(row?.flags).toEqual(['amount_unreadable']);
  });
});

describe('two reads of one image', () => {
  const first = [
    read({ a: '10.00' }, 'a0'),
    read({ a: '20.00', d: '04/10/26' }, 'a1'),
    read({ a: '30.00' }, 'a2'),
  ];

  it('pairs rows by amount and a date within a day', () => {
    const second = [
      read({ a: '20.00', d: '05/10/26' }, 'b0'),
      read({ a: '10.00' }, 'b1'),
      read({ a: '99.00' }, 'b2'),
    ];
    const { pairs, onlyFirst, onlySecond } = alignReads(first, second);
    expect(pairs.map(([a, b]) => [a.id, b.id])).toEqual([
      ['a0', 'b1'],
      ['a1', 'b0'],
    ]);
    expect(onlyFirst.map((r) => r.id)).toEqual(['a2']);
    expect(onlySecond.map((r) => r.id)).toEqual(['b2']);
  });

  it('trusts what both found alike, and flags the rest for a look', () => {
    const second = [
      read({ a: '10.00' }, 'b0'),
      read({ a: '20.00', d: '05/10/26' }, 'b1'),
      read({ a: '55.00' }, 'b2'),
    ];
    const combined = combineReads(first, second);
    expect(combined.map((r) => [r.id, r.flags])).toEqual([
      ['a0', []],
      ['a1', ['reads_disagree']],
      ['a2', ['one_read_only']],
      ['b2b', ['one_read_only']],
    ]);
    expect(combined[1]?.otherRead?.date).toBe('2026-10-05');
  });

  it('names what two reads of a row disagree on', () => {
    expect(disagreements(read(), read())).toEqual([]);
    expect(
      disagreements(
        read({ k: 'e', c: '₪', ca: null, pl: null }),
        read({
          k: 'i',
          c: '$',
          ca: '9',
          cc: '₪',
          pl: { md: 'installments', n: 1, of: 3, tot: null },
          d: '04/10/26',
        }),
      ),
    ).toEqual(['date', 'kind', 'currency', 'charged', 'plan']);
  });
});

describe('holding rows to the totals a statement prints', () => {
  const total = (a: string, c: string | null = '₪'): WireTotal & { file: number } => ({
    l: 'סה"כ לחיוב',
    a,
    c,
    s: 0,
    p: null,
    file: 0,
  });
  const rows = [
    read({ a: '100.00' }, 'r0'),
    read({ a: '250.00' }, 'r1'),
    read({ a: '50.00', sg: 'זיכוי' }, 'r2'),
  ];

  it('reconciles when the charges less the credits are the total', () => {
    expect(reconcile(rows, [total('300.00')], ctx)).toEqual([
      { file: 0, totalMinor: 30_000, currency: 'ILS', sumMinor: 30_000, differenceMinor: 0, suspects: [] },
    ]);
  });

  it('holds a file to whichever of its totals the rows meet', () => {
    const [result] = reconcile(rows, [total('999.00'), total('300.00')], ctx);
    expect(result?.differenceMinor).toBe(0);
  });

  it('counts a foreign purchase at what it was charged, and leaves pending rows out', () => {
    const foreign = [
      read({ a: '10.00', c: '$', ca: '37.00', cc: '₪' }, 'f0'),
      read({ a: '63.00' }, 'f1'),
      read({ a: '500', st: 'pending' }, 'f2'),
    ];
    expect(reconcile(foreign, [total('100.00')], ctx)[0]?.differenceMinor).toBe(0);
  });

  it('points at a row that is missing or doubled', () => {
    const [result] = reconcile(rows, [total('550.00')], ctx);
    expect(result?.differenceMinor).toBe(25_000);
    expect(result?.suspects).toEqual([{ id: 'r1', hint: 'missing_or_duplicated' }]);
  });

  it('points at a decimal point in the wrong place', () => {
    // 250.00 read as 25.00: the gap is nine times the row as read.
    const shifted = [read({ a: '100.00' }, 'r0'), read({ a: '25.00' }, 'r1')];
    const [result] = reconcile(shifted, [total('350.00')], ctx);
    expect(result?.suspects).toEqual([{ id: 'r1', hint: 'decimal_shift' }]);
    // And the other way: 25.00 read as 250.00.
    const [back] = reconcile(
      [read({ a: '100.00' }, 'r0'), read({ a: '250.00' }, 'r1')],
      [total('125.00')],
      ctx,
    );
    expect(back?.suspects).toEqual([{ id: 'r1', hint: 'decimal_shift' }]);
  });

  it('suspects swapped digits when the gap is a multiple of nine', () => {
    // 145.00 read as 154.00: a gap of 9.00.
    const [result] = reconcile(
      [read({ a: '154.00' }, 'r0'), read({ a: '20.00' }, 'r1')],
      [total('165.00')],
      ctx,
    );
    expect(result?.suspects.map((s) => s.hint)).toEqual(['digits', 'digits']);
  });

  it('says nothing for a file with no total it can read', () => {
    expect(reconcile(rows, [total('lots')], ctx)).toEqual([]);
    expect(reconcile(rows, [total('300', 'doubloons')], ctx)).toEqual([]);
    expect(reconcile(rows, [], ctx)).toEqual([]);
  });
});

/**
 * The checks, held to their purpose: inject one kind of mistake a reader
 * makes into rows that are right, and see that something catches it - the
 * row is flagged, or the statement no longer adds up.
 */
describe('mistakes the checks must catch', () => {
  const text = [
    '03/10/26 שופרסל 120.50',
    '04/10/26 פז 245.00',
    '05/10/26 נטפליקס 54.90',
    '06/10/26 ארומה 38.00',
    'סה"כ לחיוב 458.40',
  ].join('\n');
  const truth: WireRow[] = [
    wire({ d: '03/10/26', a: '120.50', m: 'שופרסל' }),
    wire({ d: '04/10/26', a: '245.00', m: 'פז' }),
    wire({ d: '05/10/26', a: '54.90', m: 'נטפליקס' }),
    wire({ d: '06/10/26', a: '38.00', m: 'ארומה' }),
  ];
  const totals = [{ l: 'סה"כ לחיוב', a: '458.40', c: '₪', s: 0, p: null, file: 0 }];
  const caught = (rows: readonly WireRow[]): boolean => {
    const found = groundInText(
      rows.map((r, i) => readRow(r, `r${String(i)}`, ctx)),
      text,
    );
    const flagged = found.some((r) => r.flags.length > 0);
    const [sum] = reconcile(found, totals, ctx);
    return flagged || (sum !== undefined && sum.differenceMinor !== 0);
  };
  const mutate = (i: number, over: Partial<WireRow>) =>
    truth.map((r, j) => (j === i ? { ...r, ...over } : r));

  it('passes the rows as they are', () => {
    expect(caught(truth)).toBe(false);
  });

  it.each([
    ['a dropped digit', mutate(0, { a: '12.50' })],
    ['a doubled digit', mutate(1, { a: '2245.00' })],
    ['swapped digits', mutate(2, { a: '45.90' })],
    ['a moved decimal point', mutate(3, { a: '3.80' })],
    ['a flipped sign', mutate(1, { a: '-245.00' })],
    ['a credit word that is not there', mutate(2, { sg: 'זיכוי' })],
    ['the wrong currency', mutate(0, { c: '$' })],
    ['a missing row', truth.slice(1)],
    ['a doubled row', [...truth, truth[3]!]],
    ['a row that was never there', [...truth, wire({ a: '19.90', m: 'רמי לוי' })]],
  ])('catches %s', (_what, rows) => {
    expect(caught(rows)).toBe(true);
  });

  it('catches a day and month swapped, when the swap makes a date in the future', () => {
    const found = readRow(wire({ d: '10/06/26' }), 'r0', ctx);
    expect(found.date).toBe('2026-06-10');
    const swapped = readRow(wire({ d: '06/12/26' }), 'r0', ctx);
    expect(swapped.flags).toContain('date_out_of_range');
  });
});

describe('a transcribed row’s business type', () => {
  it('is the reader’s, on an expense, when the list has it - and its sector as printed', () => {
    expect(readRow(wire({ mcc: '5812', sec: 'מסעדות' }), 'r1', ctx)).toMatchObject({
      aiMcc: '5812',
      sector: 'מסעדות',
    });
    expect(readRow(wire({ mcc: '9999' }), 'r2', ctx)).not.toHaveProperty('aiMcc');
    expect(readRow(wire({}), 'r3', ctx)).not.toHaveProperty('aiMcc');
  });

  it('is none when the row turns out to be money coming back', () => {
    const credit = readRow(wire({ a: '-50.00', mcc: '5812' }), 'r4', ctx);
    expect(credit.kind).toBe('income');
    expect(credit).not.toHaveProperty('aiMcc');
  });
});
