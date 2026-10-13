import { describe, expect, it } from 'vitest';

import type { LocalDate } from '@/types/money';

import type { FoundRow } from './import-check';
import { draftOf } from './import-review';
import type { Cell } from './import-sheet-map';
import {
  formatCurrency,
  groupPlans,
  readKnownExport,
  totalsOnly,
  type SheetInput,
} from './import-sheet-readers';

/*
 * Every value below is synthetic: years long past, amounts made up, cards
 * 9999 and 1111, places that do not exist. Only the layouts - titles,
 * headers, sheet names, footers, number formats and quirks - are the real
 * exports' own.
 */

const ctx = {
  file: 0,
  base: 'ILS',
  known: new Set(['ILS', 'USD', 'EUR', 'GBP']),
  anchor: '2026-10-10' as LocalDate,
};

// ---------------------------------------------------------------- Max

const MAX_HEADER = [
  'תאריך עסקה',
  'שם בית העסק',
  'קטגוריה',
  '4 ספרות אחרונות של כרטיס האשראי',
  'סוג עסקה',
  'סכום חיוב',
  'מטבע חיוב',
  'סכום עסקה מקורי',
  'מטבע עסקה מקורי',
  'תאריך חיוב',
  'הערות',
  'תיוגים',
  'מועדון הנחות',
  'מפתח דיסקונט',
  'אופן ביצוע ההעסקה',
  'שער המרה ממטבע מקור/התחשבנות לש"ח',
];

/** A foreign-sheet merchant as Max pads it: name (22), city (13), country code. */
const padded = (name: string, city: string, country: string) =>
  `${name.padEnd(22)} ${city.padEnd(13)} ${country}`;

const maxRow = (
  date: string,
  merchant: string,
  type: string,
  charged: Cell,
  chargedCur: string,
  original: Cell,
  originalCur: string,
  chargeDate: string,
  notes = '',
  rate = '',
  sector = 'שונות',
): Cell[] => [
  date,
  merchant,
  sector,
  '9999',
  type,
  charged,
  chargedCur,
  original,
  originalCur,
  chargeDate,
  notes,
  '',
  '',
  '',
  'אחר',
  rate,
];

const maxSheet = (name: string, rows: Cell[][], total: string): SheetInput => ({
  name,
  rows: [
    ['כל המשתמשים (1)', null, ''],
    ['9999-כרטיס לדוגמה', null, ''],
    ['2019-01-01-2019-12-31', null, ''],
    MAX_HEADER,
    ...rows,
    ['סך הכל'],
    [total],
  ],
  date1904: false,
});

const LOAN = 'הלוואה ברגע למולטי';

const maxLocal = maxSheet(
  'עסקאות במועד החיוב',
  [
    maxRow(
      '05-03-2019',
      'מכולת לדוגמה',
      'רגילה',
      37.15,
      '₪',
      37.15,
      '₪',
      '02-04-2019',
      '',
      '',
      'מזון וצריכה',
    ),
    // The card fee: charged with VAT, the original before it.
    maxRow('01-03-2019', 'דמי כרטיס', 'רגילה', 23.4, '₪', 19.83, '₪', '02-04-2019'),
    maxRow('07-03-2019', 'מכולת לדוגמה', 'רגילה', -11.5, '₪', 11.5, '₪', '02-04-2019', 'ביטול עסקה'),
    // Three payments of one deal: the original is the whole deal on each.
    maxRow('10-01-2019', 'רהיטי דוגמה', 'תשלומים', 191.25, '₪', 765, '₪', '02-02-2019', 'תשלום 1 מתוך 4'),
    maxRow('10-01-2019', 'רהיטי דוגמה', 'תשלומים', 191.25, '₪', 765, '₪', '02-03-2019', 'תשלום 2 מתוך 4'),
    maxRow('10-01-2019', 'רהיטי דוגמה', 'תשלומים', 191.25, '₪', 765, '₪', '02-04-2019', 'תשלום 3 מתוך 4'),
    // The card company's own loan: the disbursement, bridge interest, repayments and adjustments.
    maxRow('15-01-2019', 'מקס', LOAN, -4100, '₪', 4100, '₪', '16-01-2019', 'הלוואה'),
    maxRow('15-01-2019', 'מקס', LOAN, 9.61, '₪', 4100, '₪', '02-02-2019', 'ריבית גישור'),
    maxRow('15-01-2019', 'מקס', LOAN, 361.07, '₪', 4100, '₪', '02-03-2019', 'תשלום 1 מתוך 12'),
    maxRow('15-01-2019', 'מקס', LOAN, -8.13, '₪', 4100, '₪', '02-04-2019', 'תשלום 12 מתוך 12'),
    maxRow('15-01-2019', 'מקס', LOAN, 13.27, '₪', 4100, '₪', '02-04-2019', 'תשלום 12 מתוך 12'),
    maxRow('15-01-2019', 'מקס', LOAN, 359.84, '₪', 4100, '₪', '02-04-2019', 'תשלום 2 מתוך 12'),
  ],
  '0',
);

const walletSheet = (rows: Cell[][]) => maxSheet('עסקאות בארנק מט"ח', rows, '0');
const fxBuy = (date: string, shekels: number, note: string) =>
  maxRow(date, 'רכישת מט"ח', 'חיוב עסקות מיידי', shekels, '₪', shekels, '₪', date, note, ' 3.4500');
const walletSpend = (date: string, name: string, dollars: number) =>
  maxRow(date, padded(name, 'DEMO CITY', 'ZZZ'), 'חיוב חודשי', dollars, '$', dollars, '$', '02-08-2019');
const walletCredit = (date: string, dollars: number) =>
  maxRow(date, 'זיכוי מיתרת ארנק מט"ח', 'חיוב ארנק מטח', -dollars, '$', dollars, '$', '02-08-2019');

const maxForeign = maxSheet(
  'עסקאות חו"ל ומט"ח',
  [
    // A currency the export leaves blank, converted via the euro.
    maxRow(
      '12-05-2019',
      padded('CAFE SAMPLE', 'DEMO CITY', 'ZZZ'),
      'חיוב חודשי',
      17.62,
      '₪',
      113,
      '',
      '02-06-2019',
      '',
      'שער המרה מאירו לש"ח 3.9000',
    ),
    maxRow(
      '03-05-2019',
      padded('WEBSHOP SAMPLE', 'SAMPLE TOWN', 'ZZY'),
      'חיוב חודשי',
      44.38,
      '₪',
      12.7,
      '$',
      '02-06-2019',
      '',
      ' 3.4945',
    ),
    maxRow(
      '14-05-2019',
      padded('DELIVERY SAMPLE', 'SAMPLE TOWN', 'ZZY'),
      'חיוב חודשי',
      26.4,
      '₪',
      26.4,
      '₪',
      '02-06-2019',
      'חיוב עסקת חו"ל בש"ח ',
    ),
  ],
  '0',
);

const rowsOf = (sheets: readonly SheetInput[]): FoundRow[] =>
  readKnownExport(sheets, ctx)?.blocks.flatMap((b) => b.rows) ?? [];
const grouped = (sheets: readonly SheetInput[]) => groupPlans(rowsOf(sheets));

const plain = (r: FoundRow) => ({
  description: r.description,
  kind: r.kind,
  date: r.date,
  amountMinor: r.amountMinor,
  currency: r.currency,
  charged: r.charged ?? null,
  plan: r.plan,
  flags: r.flags,
  l4: r.wire.l4,
});

const draft = (row: FoundRow | undefined) =>
  row === undefined
    ? undefined
    : draftOf(row, {
        profileId: 'p',
        base: 'ILS',
        today: '2026-10-10' as LocalDate,
        primeRate: '6',
        categoryId: 'c',
        paymentMethodId: 'm',
      });

describe('a Max transaction-details export', () => {
  it('is recognised by its headers, sheet by sheet, with no column guessing', () => {
    const read = readKnownExport([maxLocal, walletSheet([]), maxForeign], ctx);
    expect(read?.format).toBe('max');
    expect(read?.blocks.map((b) => b.sheet)).toEqual([0, 1, 2]);
    expect(read?.rest).toEqual([]);
  });

  it('is still recognised with only its money columns and "הערות" - the rest optional', () => {
    const keep = [0, 1, 5, 6, 7, 8, 10];
    const slim: SheetInput = {
      ...maxForeign,
      rows: maxForeign.rows.map((row, i) => (i < 3 ? row : keep.map((c) => row[c] ?? null))),
    };
    const rows = rowsOf([slim]);
    expect(rows.map((r) => [r.amountMinor, r.currency, r.wire.l4, r.sector ?? null])).toEqual([
      [1_762, 'ILS', '9999', null],
      [1_270, 'USD', '9999', null],
      [2_640, 'ILS', '9999', null],
    ]);
  });

  it('saves what the card charged, not the original figure', () => {
    const rows = rowsOf([maxLocal]);
    const fee = rows.find((r) => r.description === 'דמי כרטיס');
    expect(fee && plain(fee)).toMatchObject({
      amountMinor: 2_340,
      currency: 'ILS',
      charged: null,
      l4: '9999',
    });
    expect(fee?.cardFee).toBe(true);
    const refund = rows.find((r) => r.kind === 'income' && r.description === 'מכולת לדוגמה');
    expect(refund && plain(refund)).toMatchObject({ amountMinor: 1_150, date: '2019-03-07' });
  });

  it("keeps Max's own sector beside each row, for the business type", () => {
    const [first] = rowsOf([maxLocal]);
    expect(first?.sector).toBe('מזון וצריכה');
    expect(first?.wire.sec).toBe('מזון וצריכה');
    expect(first?.wire.cd).toBe('02-04-2019');
  });

  it('reads a date a re-saved workbook keeps as a serial number', () => {
    const sheet = maxSheet(
      'עסקאות במועד החיוב',
      [maxRow(43_529 as unknown as string, 'מכולת לדוגמה', 'רגילה', 5, '₪', 5, '₪', '02-04-2019')],
      '0',
    );
    // Serial 43529 is 5 March 2019.
    expect(rowsOf([sheet])[0]).toMatchObject({ date: '2019-03-05', flags: [] });
  });

  it('reads instalments from "הערות": each row is this payment, the deal is the plan total, one plan per deal', () => {
    const series = grouped([maxLocal]).filter((r) => r.description === 'רהיטי דוגמה');
    expect(series.map((r) => [r.amountMinor, r.plan, r.flags])).toEqual([
      [19_125, { mode: 'installments', number: 1, count: 4, totalMinor: 76_500 }, []],
      [19_125, { mode: 'installments', number: 2, count: 4, totalMinor: 76_500 }, ['plan_in_import']],
      [19_125, { mode: 'installments', number: 3, count: 4, totalMinor: 76_500 }, ['plan_in_import']],
    ]);
  });

  it('leaves a credit deal’s total to its payments, which carry interest on top of the price', () => {
    const sheet = maxSheet(
      'עסקאות במועד החיוב',
      [maxRow('10-01-2019', 'חנות לדוגמה', 'קרדיט', 77.3, '₪', 850, '₪', '02-02-2019', 'תשלום 1 מתוך 12')],
      '0',
    );
    const [row] = rowsOf([sheet]);
    expect(row?.plan).toEqual({ mode: 'credit', number: 1, count: 12 });
    // Saved as payment × count, flagged as worked out - never at the bare price.
    expect(draft(row)).toMatchObject({ values: { amount: '927.60' }, flags: ['total_estimated'] });
  });

  it('saves a foreign deal paid in shekels at its shekel payments: $600 as 3 × ₪700 is ₪2,100, not ₪700', () => {
    const sheet = maxSheet(
      'עסקאות חו"ל ומט"ח',
      [
        maxRow('20-02-2019', 'SHOP SAMPLE', 'תשלומים', 700, '₪', 600, '$', '02-03-2019', 'תשלום 1 מתוך 3'),
        maxRow('20-02-2019', 'SHOP SAMPLE', 'תשלומים', 700, '₪', 600, '$', '02-04-2019', 'תשלום 2 מתוך 3'),
      ],
      '0',
    );
    const rows = groupPlans(rowsOf([sheet]));
    expect(rows.map((r) => [r.amountMinor, r.currency, r.charged ?? null, r.plan, r.flags])).toEqual([
      [70_000, 'ILS', null, { mode: 'installments', number: 1, count: 3 }, []],
      [70_000, 'ILS', null, { mode: 'installments', number: 2, count: 3 }, ['plan_in_import']],
    ]);
    expect(draft(rows[0])).toMatchObject({
      values: { amount: '2100.00', currency: 'ILS' },
      flags: ['total_estimated'],
    });
    // The deal in dollars stays as printed.
    expect(rows[0]?.wire.a).toBe('600');
  });

  it("reads the card company's loan as one loan: its payments, its corrections as they are, no income for the disbursement", () => {
    const loan = grouped([maxLocal]).filter((r) => r.description === 'מקס');
    expect(
      loan.map((r) => [r.kind, r.amountMinor, r.plan?.mode ?? null, r.plan?.number ?? null, r.flags]),
    ).toEqual([
      ['income', 410_000, null, null, ['loan_disbursement']],
      ['expense', 961, null, null, []],
      ['expense', 36_107, 'loan', 1, []],
      // "12 of 12" corrections: not payments of the loan, added as the amounts they are.
      ['income', 813, null, null, ['plan_adjustment']],
      ['expense', 1_327, null, null, ['plan_adjustment']],
      ['expense', 35_984, 'loan', 2, ['plan_in_import']],
    ]);
  });

  it('folds the FX wallet: the purchase at its shekel cost, no wallet credit, no second shekel row', () => {
    const local = maxSheet('עסקאות במועד החיוב', [fxBuy('20-07-2019', 41.4, 'USD 12.00')], '0');
    const wallet = walletSheet([walletSpend('14-07-2019', 'APP SAMPLE', 12), walletCredit('22-07-2019', 12)]);
    const rows = rowsOf([local, wallet]);
    expect(rows.map((r) => [r.description, r.kind, r.amountMinor, r.currency, r.charged ?? null])).toEqual([
      ['APP SAMPLE', 'expense', 1_200, 'USD', { minor: 4_140, currency: 'ILS' }],
    ]);
  });

  it('shares one currency purchase over the wallet purchases it paid for: $500 loaded, $120 + $380 spent', () => {
    const local = maxSheet('עסקאות במועד החיוב', [fxBuy('01-07-2019', 1_725, 'USD 500.00')], '0');
    const wallet = walletSheet([
      walletSpend('05-07-2019', 'HOTEL SAMPLE', 120),
      walletSpend('09-07-2019', 'TOURS SAMPLE', 380),
      walletCredit('06-07-2019', 120),
      walletCredit('10-07-2019', 380),
    ]);
    const rows = rowsOf([local, wallet]);
    expect(rows.map((r) => [r.description, r.amountMinor, r.currency, r.charged?.minor ?? null])).toEqual([
      ['HOTEL SAMPLE', 12_000, 'USD', 41_400],
      ['TOURS SAMPLE', 38_000, 'USD', 131_100],
    ]);
    // ₪1,725 in all - the load, counted once.
    expect(rows.reduce((sum, r) => sum + (r.charged?.minor ?? 0), 0)).toBe(172_500);
  });

  it('leaves the wallet as Max prints it when the purchases do not add up to the load - netting to the shekels', () => {
    const local = maxSheet('עסקאות במועד החיוב', [fxBuy('01-07-2019', 1_725, 'USD 500.00')], '0');
    const wallet = walletSheet([
      walletSpend('05-07-2019', 'HOTEL SAMPLE', 120),
      walletCredit('06-07-2019', 120),
    ]);
    const rows = rowsOf([local, wallet]);
    expect(rows.map((r) => [r.description, r.kind, r.amountMinor, r.currency])).toEqual([
      ['רכישת מט"ח', 'expense', 172_500, 'ILS'],
      ['HOTEL SAMPLE', 'expense', 12_000, 'USD'],
      ['זיכוי מיתרת ארנק מט"ח', 'income', 12_000, 'USD'],
    ]);
  });

  it('keeps a wallet purchase and its credit when the currency was bought in an earlier export', () => {
    const rows = rowsOf([
      walletSheet([walletSpend('14-07-2019', 'APP SAMPLE', 12), walletCredit('22-07-2019', 12)]),
    ]);
    expect(rows.map((r) => [r.kind, r.amountMinor, r.currency])).toEqual([
      ['expense', 1_200, 'USD'],
      ['income', 1_200, 'USD'],
    ]);
  });

  it('reads the foreign sheet: blank-currency rows at the shekel charge, named currencies with both amounts, padding gone', () => {
    const rows = rowsOf([maxForeign]);
    expect(rows.map((r) => [r.description, r.amountMinor, r.currency, r.charged ?? null, r.flags])).toEqual([
      ['CAFE SAMPLE', 1_762, 'ILS', null, []],
      ['WEBSHOP SAMPLE', 1_270, 'USD', { minor: 4_438, currency: 'ILS' }, []],
      ['DELIVERY SAMPLE', 2_640, 'ILS', null, []],
    ]);
    // The original figure is kept, as printed.
    expect(rows[0]?.wire.a).toBe('113');
  });

  it('skips the title, blank and total rows', () => {
    const read = readKnownExport([maxForeign], ctx);
    expect(read?.blocks[0]?.rows).toHaveLength(3);
    expect(read?.blocks[0]?.header[0]).toEqual(MAX_HEADER);
  });

  it('takes the card from the title when its column is empty', () => {
    const sheet: SheetInput = {
      ...maxForeign,
      rows: maxForeign.rows.map((r, i) => (i > 3 && r.length > 3 ? r.map((c, j) => (j === 3 ? '' : c)) : r)),
    };
    expect(rowsOf([sheet]).map((r) => r.wire.l4)).toEqual(['9999', '9999', '9999']);
  });

  it('flags a row whose amount or currency cannot be read, and one whose date cannot', () => {
    const sheet = maxSheet(
      'עסקאות במועד החיוב',
      [
        maxRow('05-03-2019', 'מכולת לדוגמה', 'רגילה', 'abc', '₪', 'abc', '₪', '02-04-2019'),
        maxRow('לא תאריך', 'מכולת לדוגמה', 'רגילה', 10, '₪', 10, '₪', '02-04-2019'),
        maxRow('05-03-2019', 'מכולת לדוגמה', 'רגילה', 5, 'XYZ', 5, '₪', '02-04-2019'),
        maxRow('06-03-2019', 'מכולת לדוגמה', 'רגילה', '7.50', '₪', null, '₪', '02-04-2019'),
      ],
      '0',
    );
    const rows = rowsOf([sheet]);
    expect(rows.map((r) => [r.amountMinor, r.date ?? null, r.flags])).toEqual([
      [undefined, '2019-03-05', ['amount_unreadable']],
      [1_000, null, ['date_unreadable']],
      // The charge's currency is unknown, so the row waits; the original is what it shows.
      [500, '2019-03-05', ['currency_unknown']],
      [750, '2019-03-06', []],
    ]);
  });

  it('leaves a sheet it does not know to the generic reader', () => {
    const other: SheetInput = { name: 'הערות', rows: [['משהו אחר'], ['עוד שורה']], date1904: false };
    const read = readKnownExport([maxLocal, other], ctx);
    expect(read?.blocks.map((b) => b.sheet)).toEqual([0]);
    expect(read?.rest).toEqual([1]);
    expect(readKnownExport([other], ctx)).toBeUndefined();
  });
});

// ---------------------------------------------------------------- Discount

const DISCOUNT_HEADER = [
  'כרטיס',
  'בית עסק',
  'תאריך עסקה',
  'סכום העסקה',
  'מנפיק',
  'סוג העסקה',
  'פירוט',
  'תאריך החיוב',
  'סכום החיוב',
  'כרטיס הוצג במעמד העסקה?',
  'מטבע העסקה',
  'שער ההמרה',
  'תאריך שער המרה',
  'עמלת ההמרה',
  'מדד בסיס',
  'שם המועדון',
  'אחוז הנחה',
  'סכום הנחה',
];

const DISCOUNT_TITLES: Cell[][] = [
  ['כרטיסי אשראי'],
  ['N/A'],
  ['חשבון: 000-0000-00-000000 | ישראל ישראלי'],
  ['הקודם: 000-0000-00-000000'],
  ['N/A'],
  ['פירוט עסקאות - כל הכרטיסים הבנקאיים '],
];

const ILS = '"₪"#,##0.00';
const discountRow = (
  merchant: string,
  date: Cell,
  amount: Cell,
  type: string,
  detail: string,
  charged: Cell,
  chargeDate = '02/02/2019',
): Cell[] => [
  'ויזה 1111',
  merchant,
  date,
  amount,
  'כאל',
  type,
  detail,
  chargeDate,
  charged,
  '--',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  0,
  '',
];
/** The formats beside a row: only the two money cells carry a currency. */
const fmt = (amount: string | null, charged: string | null): (string | null)[] =>
  DISCOUNT_HEADER.map((_, i) => (i === 3 ? amount : i === 8 ? charged : i === 17 ? '0.00%' : null));

const discountData: [Cell[], (string | null)[]][] = [
  [
    discountRow('מאפיית לדוגמה', '12/01/2019', 63.7, 'ישראל', ' מזהה כרטיס 0000 Apple Pay', 63.7),
    fmt(ILS, ILS),
  ],
  [
    discountRow(
      'WEBSHOP SAMPLE',
      '03/01/2019',
      21.5,
      'חו"ל',
      ' ארץ לדוגמה . ב- 4/01/19 הומר לש"ח בשער יציג 3.7000',
      79.55,
    ),
    fmt('"$"#,##0.00', ILS),
  ],
  [
    discountRow(
      'WEBSHOP SAMPLE',
      '05/01/2019',
      -8.4,
      'זיכוי-חו"ל',
      ' ארץ לדוגמה . ב- 6/01/19 הומר לש"ח בשער יציג 4.7000 .',
      -39.48,
    ),
    fmt('"£"#,##0.00', ILS),
  ],
  // A promotion: no transaction amount, only a credit charged.
  [
    discountRow('מסעדת לדוגמה', '25/01/2019', '--', '', ' מבצע הנחה לדוגמה', -2.35),
    fmt(null, '"ILS"#,##0.00'),
  ],
  // Discount writes a plan as "N/M" in the details, without "תשלום".
  [discountRow('חנות לדוגמה', '20/01/2019', 870, 'ישראל', ' 3/10', 87), fmt(ILS, ILS)],
  [discountRow('דמי כרטיס בנק לדוגמה', '04/01/2019', 7.45, 'עמלה-ישראל', '', 7.45), fmt(ILS, ILS)],
  // A currency the household does not use: its shekel charge is what is saved.
  [discountRow('MUSEUM SAMPLE', '15/01/2019', 140, 'חו"ל', ' ארץ לדוגמה .', 23.1), fmt('"CZK"#,##0.00', ILS)],
  // A standing order's note with a year-less date: no plan.
  [discountRow('ועד בית לדוגמה', '18/01/2019', 95, 'ישראל', ' הוראת קבע 4/12', 95), fmt(ILS, ILS)],
];

const discountSheet = (data = discountData, withFormats = true): SheetInput => {
  const rows: Cell[][] = [
    ...DISCOUNT_TITLES,
    ['8 עסקאות לחיוב בחודש ינואר בכל הכרטיסים'],
    // A running total across months viewed before the export: never this file's total.
    ['עסקאות באשראי - סה"כ חיוב:  + ₪100 + ₪200 + ₪300'],
    DISCOUNT_HEADER,
    ...data.map(([row]) => row),
    ['הודעה,המידע באחריות חברת כרטיסי האשראי.,בכל סתירה'],
  ];
  const formats = [...rows.slice(0, 9).map(() => []), ...data.map(([, f]) => f), []];
  return { name: 'כרטיסי אשראי', rows, ...(withFormats ? { formats } : {}), date1904: false };
};

describe('a Discount bank-cards export', () => {
  it('is recognised by its headers', () => {
    expect(readKnownExport([discountSheet()], ctx)?.format).toBe('discount');
  });

  it('takes each amount’s currency from its number format, and keeps both amounts of a foreign row', () => {
    const rows = rowsOf([discountSheet()]);
    expect(rows.map((r) => [r.description, r.kind, r.amountMinor, r.currency, r.charged ?? null])).toEqual([
      ['מאפיית לדוגמה', 'expense', 6_370, 'ILS', null],
      ['WEBSHOP SAMPLE', 'expense', 2_150, 'USD', { minor: 7_955, currency: 'ILS' }],
      ['WEBSHOP SAMPLE', 'income', 840, 'GBP', { minor: 3_948, currency: 'ILS' }],
      ['מסעדת לדוגמה', 'income', 235, 'ILS', null],
      ['חנות לדוגמה', 'expense', 8_700, 'ILS', null],
      ['דמי כרטיס בנק לדוגמה', 'expense', 745, 'ILS', null],
      ['MUSEUM SAMPLE', 'expense', 2_310, 'ILS', null],
      ['ועד בית לדוגמה', 'expense', 9_500, 'ILS', null],
    ]);
    expect(rows.every((r) => r.flags.length === 0)).toBe(true);
  });

  it('reads both dates, the card, the fee and the "N/M" plan - and no plan from a standing order’s "4/12"', () => {
    const rows = rowsOf([discountSheet()]);
    expect(rows[0]).toMatchObject({ date: '2019-01-12', wire: { cd: '02/02/2019', l4: '1111' } });
    expect(rows[4]?.plan).toEqual({ mode: 'installments', number: 3, count: 10, totalMinor: 87_000 });
    expect(rows[1]?.plan).toBeNull();
    expect(rows[5]?.cardFee).toBe(true);
    expect(rows[7]?.plan).toBeNull();
    expect(draft(rows[7])?.values.amount).toBe('95.00');
  });

  it('reads a date kept as a serial number, and flags one it cannot read rather than drop the row', () => {
    const rows = rowsOf([
      discountSheet([
        [discountRow('מאפיית לדוגמה', 43_477, 63.7, 'ישראל', '', 63.7), fmt(ILS, ILS)],
        [discountRow('מאפיית לדוגמה', 'לא תאריך', 12.4, 'ישראל', '', 12.4), fmt(ILS, ILS)],
      ]),
    ]);
    // Serial 43477 is 12 January 2019.
    expect(rows.map((r) => [r.date ?? null, r.amountMinor, r.flags])).toEqual([
      ['2019-01-12', 6_370, []],
      [null, 1_240, ['date_unreadable']],
    ]);
  });

  it('without number formats, saves every row at its shekel charge rather than guess a currency', () => {
    const rows = rowsOf([discountSheet(discountData, false)]);
    expect(rows.map((r) => [r.amountMinor, r.currency, r.charged ?? null])).toEqual([
      [6_370, 'ILS', null],
      [7_955, 'ILS', null],
      [3_948, 'ILS', null],
      [235, 'ILS', null],
      [8_700, 'ILS', null],
      [745, 'ILS', null],
      [2_310, 'ILS', null],
      [9_500, 'ILS', null],
    ]);
  });

  it('flags a row with no amount it can read', () => {
    const rows = rowsOf([
      discountSheet([[discountRow('דוגמה', '01/01/2019', '--', '', '', 'x'), fmt(null, ILS)]]),
    ]);
    expect(rows[0]?.flags).toEqual(['amount_unreadable']);
  });
});

const month3 = (n: number, charged: number, chargeDate: string) =>
  readKnownExport(
    [
      discountSheet([
        [
          discountRow('מוסך לדוגמה', '07/01/2019', 1000, 'ישראל', ` ${String(n)}/3`, charged, chargeDate),
          fmt(ILS, ILS),
        ],
      ]),
    ],
    ctx,
  )?.blocks.flatMap((b) => b.rows) ?? [];

describe('a deal across monthly files', () => {
  // ₪1,000 in three payments - 333.34, 333.33, 333.33 - one in each monthly file.
  const month = (detail: string, charged: number, chargeDate: string, file: number) =>
    readKnownExport(
      [
        discountSheet([
          [
            discountRow('מוסך לדוגמה', '07/01/2019', 1000, 'ישראל', detail, charged, chargeDate),
            fmt(ILS, ILS),
          ],
        ]),
      ],
      { ...ctx, file },
    )?.blocks.flatMap((b) => b.rows) ?? [];

  it('is one plan of the deal, whatever the rounding of each payment', () => {
    const rows = groupPlans([
      ...month(' 1/3', 333.34, '02/02/2019', 0),
      ...month(' 2/3', 333.33, '02/03/2019', 1),
    ]);
    expect(rows.map((r) => [r.file, r.amountMinor, r.plan?.totalMinor ?? null, r.flags])).toEqual([
      [0, 33_334, 100_000, []],
      [1, 33_333, 100_000, ['plan_in_import']],
    ]);
    expect(draft(rows[0])?.values.amount).toBe('1000.00');
  });

  it('is led by the earliest payment found, whichever file comes first', () => {
    const rows = groupPlans([
      ...month(' 3/3', 333.33, '02/04/2019', 0),
      ...month(' 2/3', 333.33, '02/03/2019', 1),
    ]);
    expect(rows.map((r) => [r.plan?.number, r.flags])).toEqual([
      [3, ['plan_in_import']],
      [2, []],
    ]);
  });

  it('counts a first payment that differs from the rest once: 400 + 300 + 300 of a ₪1,000 deal', () => {
    const month = (n: number, charged: number, chargeDate: string) => month3(n, charged, chargeDate);
    const rows = groupPlans([
      ...month(1, 400, '02/02/2019'),
      ...month(2, 300, '02/03/2019'),
      ...month(3, 300, '02/04/2019'),
    ]);
    expect(rows.map((r) => [r.amountMinor, r.flags])).toEqual([
      [40_000, []],
      [30_000, ['plan_in_import']],
      [30_000, ['plan_in_import']],
    ]);
  });

  it('leaves rows of no plan, and plan rows with no date, alone', () => {
    const plainRow = rowsOf([discountSheet([discountData[0]!])]);
    expect(groupPlans(plainRow)).toEqual(plainRow);
  });
});

const summary: SheetInput = {
  name: 'כרטיסי אשראי',
  rows: [
    ...DISCOUNT_TITLES,
    ['ריכוז חיובים קודמים'],
    ['חודש חיוב', 'מספר עסקאות', 'סכום החיוב בש"ח', 'סכום החיוב בדולר', 'סכום החיוב באירו'],
    ['012019', '12 עסקאות', 1000, 0, 0],
    ['022019', '9 עסקאות', 800, 0, 0],
    ['הודעה,המידע באחריות חברת כרטיסי האשראי.'],
  ],
  date1904: false,
};

describe("Discount's monthly-totals summary", () => {
  it('is recognised as totals only', () => {
    expect(totalsOnly([summary])).toBe(true);
    expect(totalsOnly([discountSheet()])).toBe(false);
    expect(totalsOnly([summary, discountSheet()])).toBe(false);
    expect(totalsOnly([maxLocal])).toBe(false);
    expect(totalsOnly([])).toBe(false);
  });

  it('gives no transactions and asks nothing', () => {
    expect(readKnownExport([summary], ctx)).toEqual({ format: 'totals', blocks: [], rest: [] });
  });
});

describe('a currency from a number format', () => {
  it('reads the quoted or bracketed mark, the base when there is none, undefined when unknown', () => {
    const known = ctx.known;
    expect(formatCurrency('"$"#,##0.00', 'ILS', known)).toBe('USD');
    expect(formatCurrency('"£"#,##0.00', 'ILS', known)).toBe('GBP');
    expect(formatCurrency('[$€-x-euro2] #,##0.00', 'ILS', known)).toBe('EUR');
    expect(formatCurrency('"ILS"#,##0.00', 'USD', known)).toBe('ILS');
    expect(formatCurrency('#,##0.00', 'ILS', known)).toBe('ILS');
    expect(formatCurrency(null, 'ILS', known)).toBe('ILS');
    expect(formatCurrency('"CZK"#,##0.00', 'ILS', known)).toBeUndefined();
  });
});
