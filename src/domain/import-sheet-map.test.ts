import { describe, expect, it } from 'vitest';

import type { LocalDate } from '@/types/money';

import {
  fromWireMap,
  mapByDictionary,
  mapHolds,
  planFromText,
  readSheet,
  sampleRows,
  type Cell,
} from './import-sheet-map';

const ctx = {
  file: 0,
  base: 'ILS',
  known: new Set(['ILS', 'USD', 'EUR']),
  anchor: '2026-10-04' as LocalDate,
  date1904: false,
  idPrefix: 'r',
};

/** A card company's export as it comes: a title, blank lines, then the table, then totals. */
const cardExport: Cell[][] = [
  ['פירוט עסקאות לכרטיס מקס'],
  [null],
  ['תאריך עסקה', 'שם בית העסק', 'סכום עסקה', 'מטבע עסקה', 'סכום חיוב', 'פירוט נוסף'],
  ['03/10/2026', 'שופרסל דיל', '120.50', '₪', '120.50', null],
  [45_934, 'AMAZON MKTPLACE', 45.99, 'USD', 172.3, null],
  ['14/08/2026', 'ק.ס.ם', '1,200.00', '₪', '200.00', 'תשלום 3 מתוך 6'],
  ['05/10/2026', 'החזר', '-50.00', '₪', '-50.00', null],
  [null, 'סה"כ לחיוב', null, null, '442.80', null],
];

describe('reading a spreadsheet by its headers', () => {
  it('finds the header row and names each column from the dictionary', () => {
    expect(mapByDictionary(cardExport)).toMatchObject({
      headerRow: 2,
      date: 0,
      desc: 1,
      amt: 2,
      cur: 3,
      chg: 4,
      plan: 5,
      debit: null,
      credit: null,
      dec: '.',
    });
  });

  it('reads every transaction exactly, and skips totals and blanks', () => {
    const map = mapByDictionary(cardExport)!;
    const read = readSheet(cardExport, map, ctx);
    expect(read.skipped).toBe(1);
    expect(read.unreadable).toBe(0);
    expect(read.rows.map((r) => [r.date, r.amountMinor, r.currency, r.kind])).toEqual([
      ['2026-10-03', 12_050, 'ILS', 'expense'],
      // Excel's serial 45934 is 4 October 2025; the dollar cell is a number, rounded once.
      ['2025-10-04', 4_599, 'USD', 'expense'],
      // The plan row is this month's payment; the deal's amount is the plan's total.
      ['2026-08-14', 20_000, 'ILS', 'expense'],
      ['2026-10-05', 5_000, 'ILS', 'income'],
    ]);
    expect(read.rows[1]?.charged).toEqual({ minor: 17_230, currency: 'ILS' });
    expect(read.rows[2]?.plan).toEqual({ mode: 'installments', number: 3, count: 6, totalMinor: 120_000 });
    expect(mapHolds(read)).toBe(true);
  });

  it('reads a bank statement’s debit and credit columns', () => {
    const bank: Cell[][] = [
      ['תאריך', 'תיאור', 'חובה', 'זכות', 'יתרה'],
      ['01/10/26', 'משכורת', null, '12,500.00', '15,000.00'],
      ['02/10/26', 'חברת חשמל', '430.20', null, '14,569.80'],
    ];
    const map = mapByDictionary(bank)!;
    expect(map).toMatchObject({ date: 0, desc: 1, debit: 2, credit: 3, amt: null });
    expect(readSheet(bank, map, ctx).rows.map((r) => [r.kind, r.amountMinor])).toEqual([
      ['income', 1_250_000],
      ['expense', 43_020],
    ]);
  });

  it('reads a column written with decimal commas, once it has shown so', () => {
    const european: Cell[][] = [
      ['Date', 'Description', 'Amount'],
      ['03.10.2026', 'Cafe', '1.234,50'],
      ['04.10.2026', 'Bar', '12,00'],
    ];
    const map = mapByDictionary(european)!;
    expect(map.dec).toBe(',');
    expect(readSheet(european, map, ctx).rows.map((r) => r.amountMinor)).toEqual([123_450, 1_200]);
  });

  it('says it does not know an export with headers it has never seen', () => {
    expect(mapByDictionary([['when', 'what', 'how much']])).toBeUndefined();
    expect(mapByDictionary([])).toBeUndefined();
  });

  it('marks rows it could not read, and does not trust a map that misreads most of them', () => {
    const bad: Cell[][] = [
      ['תאריך', 'תיאור', 'סכום'],
      ['03/10/26', 'א', 'abc'],
      ['nope', 'ב', '10.00'],
      ['04/10/26', 'ג', '10.00', 'doubloons'],
    ];
    const read = readSheet(bad, { ...mapByDictionary(bad)!, cur: 3 }, ctx);
    expect(read.rows.map((r) => r.flags)).toEqual([
      ['amount_unreadable'],
      ['date_unreadable'],
      ['currency_unknown', 'amount_unreadable'],
    ]);
    expect(mapHolds(read)).toBe(false);
    expect(mapHolds({ rows: [], skipped: 3, unreadable: 0 })).toBe(false);
  });
});

describe('a map from the model', () => {
  const rows: Cell[][] = [
    ['when', 'what', 'how much'],
    ['10/03/2026', 'Cafe', 12.5],
    ['2026-10-04', 'Bar', 7],
  ];

  it('reads dates in the order the model says the sheet uses', () => {
    const map = fromWireMap({
      hr: 0,
      date: 0,
      desc: 1,
      amt: 2,
      debit: null,
      credit: null,
      cur: null,
      chg: null,
      chgCur: null,
      chgDate: null,
      plan: null,
      dec: '.',
      df: 'mdy',
      mc: [],
    });
    expect(readSheet(rows, map, ctx).rows[0]?.date).toBe('2026-10-03');
    expect(readSheet(rows, map, ctx).rows[1]?.date).toBeUndefined();
    const ymd = { ...map, df: 'ymd' as const };
    expect(readSheet(rows, ymd, ctx).rows[1]?.date).toBe('2026-10-04');
    expect(readSheet(rows, ymd, ctx).rows[0]?.date).toBeUndefined();
  });

  it('is shown only the first rows, as text', () => {
    expect(sampleRows([[1, null, true, 'x'.repeat(300)]])).toEqual([['1', '', 'true', 'x'.repeat(200)]]);
    expect(sampleRows(Array.from({ length: 40 }, () => ['a'])).length).toBe(15);
  });
});

describe('plan text', () => {
  it('reads "payment 3 of 6" in Hebrew and English, and קרדיט as credit', () => {
    expect(planFromText('תשלום 3 מתוך 6')).toEqual({ mode: 'installments', number: 3, count: 6 });
    expect(planFromText('קרדיט - תשלום 1 מתוך 12')).toEqual({ mode: 'credit', number: 1, count: 12 });
    expect(planFromText('Payment 2 of 4')).toEqual({ mode: 'installments', number: 2, count: 4 });
    expect(planFromText('תשלום 7 מתוך 6')).toBeUndefined();
    expect(planFromText('רגילה')).toBeUndefined();
  });
});
