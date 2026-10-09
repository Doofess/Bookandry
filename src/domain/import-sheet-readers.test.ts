import { describe, expect, it } from 'vitest';

import type { LocalDate } from '@/types/money';

import type { FoundRow } from './import-check';
import type { Cell } from './import-sheet-map';
import { formatCurrency, readKnownExport, totalsOnly, type SheetInput } from './import-sheet-readers';

/*
 * Every value below is invented. The layouts - titles, headers, sheet names,
 * footers, number formats and quirks - are the real exports' own.
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
  '0400',
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
    ['0400-כרטיס בדוי', null, ''],
    ['2025-06-11-2026-10-10', null, ''],
    MAX_HEADER,
    ...rows,
    ['סך הכל'],
    [total],
  ],
  date1904: false,
});

const maxLocal = maxSheet(
  'עסקאות במועד החיוב',
  [
    maxRow('05-09-2026', 'מכולת הבדיון', 'רגילה', 42.5, '₪', 42.5, '₪', '02-10-2026', '', '', 'מזון וצריכה'),
    // The card fee: charged with VAT, the original before it.
    maxRow('01-09-2026', 'דמי כרטיס', 'רגילה', 12.5, '₪', 10.59, '₪', '02-10-2026'),
    maxRow('07-09-2026', 'מכולת הבדיון', 'רגילה', -20, '₪', 20, '₪', '02-10-2026', 'ביטול עסקה'),
    // Three payments of one deal: the original is the whole deal on each.
    maxRow('10-07-2026', 'רהיטי דמה', 'תשלומים', 250, '₪', 1000, '₪', '02-08-2026', 'תשלום 1 מתוך 4'),
    maxRow('10-07-2026', 'רהיטי דמה', 'תשלומים', 250, '₪', 1000, '₪', '02-09-2026', 'תשלום 2 מתוך 4'),
    maxRow('10-07-2026', 'רהיטי דמה', 'תשלומים', 250, '₪', 1000, '₪', '02-10-2026', 'תשלום 3 מתוך 4'),
    // The card company's own loan: the disbursement, bridge interest, repayments and an adjustment.
    maxRow('15-05-2026', 'מקס', 'הלוואה ברגע למולטי', -5000, '₪', 5000, '₪', '16-05-2026', 'הלוואה'),
    maxRow('15-05-2026', 'מקס', 'הלוואה ברגע למולטי', 12.3, '₪', 5000, '₪', '02-06-2026', 'ריבית גישור'),
    maxRow('15-05-2026', 'מקס', 'הלוואה ברגע למולטי', 440.1, '₪', 5000, '₪', '02-07-2026', 'תשלום 1 מתוך 12'),
    maxRow(
      '15-05-2026',
      'מקס',
      'הלוואה ברגע למולטי',
      -10.2,
      '₪',
      5000,
      '₪',
      '02-08-2026',
      'תשלום 12 מתוך 12',
    ),
    maxRow('15-05-2026', 'מקס', 'הלוואה ברגע למולטי', 438.5, '₪', 5000, '₪', '02-08-2026', 'תשלום 2 מתוך 12'),
    // Shekels bought for the FX wallet, then spent from it on the wallet sheet.
    maxRow(
      '20-06-2026',
      'רכישת מט"ח',
      'חיוב עסקות מיידי',
      36.6,
      '₪',
      36.6,
      '₪',
      '21-06-2026',
      'USD 12.00',
      ' 3.0500',
    ),
  ],
  '1234.56₪',
);

const maxWallet = maxSheet(
  'עסקאות בארנק מט"ח',
  [
    maxRow('14-06-2026', padded('APPDEMO', 'DEMO TOWN', 'ZZY'), 'חיוב חודשי', 12, '$', 12, '$', '02-07-2026'),
    maxRow('22-06-2026', 'זיכוי מיתרת ארנק מט"ח', 'חיוב ארנק מטח', -12, '$', 12, '$', '02-07-2026'),
  ],
  '0',
);

const maxForeign = maxSheet(
  'עסקאות חו"ל ומט"ח',
  [
    // A currency the export leaves blank, converted via the euro.
    maxRow(
      '24-06-2026',
      padded('CAFE DEMO', 'DEMO CITY', 'ZZZ'),
      'חיוב חודשי',
      28.3,
      '₪',
      200,
      '',
      '02-07-2026',
      '',
      'שער המרה מאירו לש"ח 3.5000',
    ),
    maxRow(
      '03-08-2026',
      padded('WEBSHOP DEMO', 'SEATTLE', 'USA'),
      'חיוב חודשי',
      61.2,
      '₪',
      20,
      '$',
      '02-09-2026',
      '',
      ' 3.0600',
    ),
    maxRow(
      '10-06-2026',
      padded('DELIVERY DEMO', 'TEL AVIV', 'ISR'),
      'חיוב חודשי',
      50,
      '₪',
      50,
      '₪',
      '02-07-2026',
      'חיוב עסקת חו"ל בש"ח ',
    ),
  ],
  '139.50₪',
);

const rowsOf = (sheets: readonly SheetInput[]): FoundRow[] =>
  readKnownExport(sheets, ctx)?.blocks.flatMap((b) => b.rows) ?? [];

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

describe('a Max transaction-details export', () => {
  it('is recognised by its headers, sheet by sheet, with no column guessing', () => {
    const read = readKnownExport([maxLocal, maxWallet, maxForeign], ctx);
    expect(read?.format).toBe('max');
    expect(read?.blocks.map((b) => b.sheet)).toEqual([0, 1, 2]);
    expect(read?.rest).toEqual([]);
  });

  it('saves what the card charged, not the original figure', () => {
    const rows = rowsOf([maxLocal]);
    const fee = rows.find((r) => r.description === 'דמי כרטיס');
    expect(fee && plain(fee)).toMatchObject({
      amountMinor: 1250,
      currency: 'ILS',
      charged: null,
      l4: '0400',
    });
    expect(fee?.cardFee).toBe(true);
    const refund = rows.find((r) => r.kind === 'income' && r.description === 'מכולת הבדיון');
    expect(refund && plain(refund)).toMatchObject({ amountMinor: 2000, date: '2026-09-07' });
  });

  it("keeps Max's own sector beside each row, for the business type", () => {
    const [first] = rowsOf([maxLocal]);
    expect(first?.sector).toBe('מזון וצריכה');
    expect(first?.wire.sec).toBe('מזון וצריכה');
    expect(first?.wire.cd).toBe('02-10-2026');
  });

  it('reads instalments from "הערות": each row is this payment, the deal is the plan total, one plan per deal', () => {
    const series = rowsOf([maxLocal]).filter((r) => r.description === 'רהיטי דמה');
    expect(series.map((r) => [r.amountMinor, r.plan, r.flags])).toEqual([
      [25_000, { mode: 'installments', number: 1, count: 4, totalMinor: 100_000 }, []],
      [25_000, { mode: 'installments', number: 2, count: 4, totalMinor: 100_000 }, ['plan_in_import']],
      [25_000, { mode: 'installments', number: 3, count: 4, totalMinor: 100_000 }, ['plan_in_import']],
    ]);
  });

  it('reads a credit deal as credit', () => {
    const sheet = maxSheet(
      'עסקאות במועד החיוב',
      [maxRow('10-07-2026', 'חנות דמה', 'קרדיט', 100, '₪', 1200, '₪', '02-08-2026', 'תשלום 1 מתוך 12')],
      '0',
    );
    expect(rowsOf([sheet])[0]?.plan?.mode).toBe('credit');
  });

  it("reads the card company's loan as one loan: its payments, not the principal, and no income for the disbursement", () => {
    const loan = rowsOf([maxLocal]).filter((r) => r.description === 'מקס');
    expect(
      loan.map((r) => [r.kind, r.amountMinor, r.plan?.mode ?? null, r.plan?.number ?? null, r.flags]),
    ).toEqual([
      ['income', 500_000, null, null, ['plan_in_import']],
      ['expense', 1_230, null, null, []],
      ['expense', 44_010, 'loan', 1, []],
      ['income', 1_020, 'loan', 12, ['plan_in_import']],
      ['expense', 43_850, 'loan', 2, ['plan_in_import']],
    ]);
  });

  it('folds the FX wallet: the purchase from the wallet at its shekel cost, no wallet credit, no second shekel row', () => {
    const rows = rowsOf([maxLocal, maxWallet]);
    expect(rows.some((r) => r.description.includes('ארנק'))).toBe(false);
    expect(rows.some((r) => r.description.includes('רכישת מט'))).toBe(false);
    const app = rows.find((r) => r.description === 'APPDEMO');
    expect(app && plain(app)).toMatchObject({
      kind: 'expense',
      amountMinor: 1_200,
      currency: 'USD',
      charged: { minor: 3_660, currency: 'ILS' },
    });
  });

  it('keeps a wallet purchase with no shekel purchase to match, and still drops its wallet credit', () => {
    const rows = rowsOf([maxWallet]);
    expect(rows.map((r) => [r.description, r.amountMinor, r.currency, r.charged ?? null])).toEqual([
      ['APPDEMO', 1_200, 'USD', null],
    ]);
  });

  it('keeps a wallet credit no purchase accounts for', () => {
    const sheet = maxSheet(
      'עסקאות בארנק מט"ח',
      [maxRow('22-06-2026', 'זיכוי מיתרת ארנק מט"ח', 'חיוב ארנק מטח', -7, '$', 7, '$', '02-07-2026')],
      '0',
    );
    expect(rowsOf([sheet]).map((r) => [r.kind, r.amountMinor])).toEqual([['income', 700]]);
  });

  it('reads the foreign sheet: blank-currency rows at the shekel charge, named currencies with both amounts, padding gone', () => {
    const rows = rowsOf([maxForeign]);
    expect(rows.map((r) => [r.description, r.amountMinor, r.currency, r.charged ?? null, r.flags])).toEqual([
      ['CAFE DEMO', 2_830, 'ILS', null, []],
      ['WEBSHOP DEMO', 2_000, 'USD', { minor: 6_120, currency: 'ILS' }, []],
      ['DELIVERY DEMO', 5_000, 'ILS', null, []],
    ]);
    // The original figure is kept, as printed.
    expect(rows[0]?.wire.a).toBe('200');
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
    expect(rowsOf([sheet]).map((r) => r.wire.l4)).toEqual(['0400', '0400', '0400']);
  });

  it('flags a row whose amount or currency cannot be read, and one whose date cannot', () => {
    const sheet = maxSheet(
      'עסקאות במועד החיוב',
      [
        maxRow('05-09-2026', 'מכולת הבדיון', 'רגילה', 'abc', '₪', 'abc', '₪', '02-10-2026'),
        maxRow('לא תאריך', 'מכולת הבדיון', 'רגילה', 10, '₪', 10, '₪', '02-10-2026'),
        maxRow('05-09-2026', 'מכולת הבדיון', 'רגילה', 5, 'XYZ', 5, '₪', '02-10-2026'),
        maxRow('06-09-2026', 'מכולת הבדיון', 'רגילה', '7.50', '₪', null, '₪', '02-10-2026'),
      ],
      '0',
    );
    const rows = rowsOf([sheet]);
    expect(rows.map((r) => [r.amountMinor, r.date ?? null, r.flags])).toEqual([
      [undefined, '2026-09-05', ['amount_unreadable']],
      [1_000, null, ['date_unreadable']],
      // The charge's currency is unknown, so the row waits; the original is what it shows.
      [500, '2026-09-05', ['currency_unknown']],
      [750, '2026-09-06', []],
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
  date: string,
  amount: Cell,
  type: string,
  detail: string,
  charged: Cell,
): Cell[] => [
  'ויזה 9876',
  merchant,
  date,
  amount,
  'כאל',
  type,
  detail,
  '02/01/2026',
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
  [discountRow('מאפיית הבדיון', '12/12/2025', 80, 'ישראל', ' מזהה כרטיס 1111 Apple Pay', 80), fmt(ILS, ILS)],
  [
    discountRow(
      'WEBSHOP DEMO',
      '03/12/2025',
      30,
      'חו"ל',
      ' ארה"ב . ב- 4/12/25 הומר לש"ח בשער יציג 3.5167',
      105.5,
    ),
    fmt('"$"#,##0.00', ILS),
  ],
  [
    discountRow(
      'WEBSHOP DEMO',
      '05/12/2025',
      -10,
      'זיכוי-חו"ל',
      ' בריטניה . ב- 6/12/25 הומר לש"ח בשער יציג 4.5200 .',
      -45.2,
    ),
    fmt('"£"#,##0.00', ILS),
  ],
  // A promotion: no transaction amount, only a credit charged.
  [discountRow('מסעדת דמה', '25/12/2025', '--', '', ' מבצע הנחה לדוגמה', -3), fmt(null, '"ILS"#,##0.00')],
  // Discount writes a plan as "N/M" in the details, without "תשלום".
  [discountRow('חנות דמה', '20/12/2025', 1000, 'ישראל', ' 3/10', 100), fmt(ILS, ILS)],
  [discountRow('דמי כרטיס בנק בדוי', '04/12/2025', 9.9, 'עמלה-ישראל', '', 9.9), fmt(ILS, ILS)],
  // A currency the household does not use: its shekel charge is what is saved.
  [discountRow('MUSEUM DEMO', '15/12/2025', 200, 'חו"ל', " צ'כיה .", 30), fmt('"CZK"#,##0.00', ILS)],
];

const discountSheet = (withFormats = true): SheetInput => {
  const rows: Cell[][] = [
    ...DISCOUNT_TITLES,
    ['7 עסקאות לחיוב בחודש ינואר בכל הכרטיסים'],
    // A running total across months viewed before the export: never this file's total.
    ['עסקאות באשראי - סה"כ חיוב:  + ₪100 + ₪200 + ₪300'],
    DISCOUNT_HEADER,
    ...discountData.map(([row]) => row),
    ['הודעה,המידע באחריות חברת כרטיסי האשראי.,בכל סתירה'],
  ];
  const formats = [...rows.slice(0, 9).map(() => []), ...discountData.map(([, f]) => f), []];
  return { name: 'כרטיסי אשראי', rows, ...(withFormats ? { formats } : {}), date1904: false };
};

describe('a Discount bank-cards export', () => {
  it('is recognised by its headers', () => {
    expect(readKnownExport([discountSheet()], ctx)?.format).toBe('discount');
  });

  it('takes each amount’s currency from its number format, and keeps both amounts of a foreign row', () => {
    const rows = rowsOf([discountSheet()]);
    expect(rows.map((r) => [r.description, r.kind, r.amountMinor, r.currency, r.charged ?? null])).toEqual([
      ['מאפיית הבדיון', 'expense', 8_000, 'ILS', null],
      ['WEBSHOP DEMO', 'expense', 3_000, 'USD', { minor: 10_550, currency: 'ILS' }],
      ['WEBSHOP DEMO', 'income', 1_000, 'GBP', { minor: 4_520, currency: 'ILS' }],
      ['מסעדת דמה', 'income', 300, 'ILS', null],
      ['חנות דמה', 'expense', 10_000, 'ILS', null],
      ['דמי כרטיס בנק בדוי', 'expense', 990, 'ILS', null],
      ['MUSEUM DEMO', 'expense', 3_000, 'ILS', null],
    ]);
    expect(rows.every((r) => r.flags.length === 0)).toBe(true);
  });

  it('reads both dates, the card, the fee and the "N/M" plan', () => {
    const rows = rowsOf([discountSheet()]);
    expect(rows[0]).toMatchObject({ date: '2025-12-12', wire: { cd: '02/01/2026', l4: '9876' } });
    expect(rows[4]?.plan).toEqual({ mode: 'installments', number: 3, count: 10, totalMinor: 100_000 });
    expect(rows[1]?.plan).toBeNull();
    expect(rows[5]?.cardFee).toBe(true);
  });

  it('without number formats, saves every row at its shekel charge rather than guess a currency', () => {
    const rows = rowsOf([discountSheet(false)]);
    expect(rows.map((r) => [r.amountMinor, r.currency, r.charged ?? null])).toEqual([
      [8_000, 'ILS', null],
      [10_550, 'ILS', null],
      [4_520, 'ILS', null],
      [300, 'ILS', null],
      [10_000, 'ILS', null],
      [990, 'ILS', null],
      [3_000, 'ILS', null],
    ]);
  });

  it('flags a row with no amount it can read', () => {
    const sheet = discountSheet();
    const rows = sheet.rows.map((r, i) =>
      i === 9 ? discountRow('דמה', '01/12/2025', '--', '', '', '--') : r,
    );
    expect(rowsOf([{ ...sheet, rows }])[0]?.flags).toEqual(['amount_unreadable']);
  });
});

const summary: SheetInput = {
  name: 'כרטיסי אשראי',
  rows: [
    ...DISCOUNT_TITLES,
    ['ריכוז חיובים קודמים'],
    ['חודש חיוב', 'מספר עסקאות', 'סכום החיוב בש"ח', 'סכום החיוב בדולר', 'סכום החיוב באירו'],
    ['112025', '12 עסקאות', 1000, 0, 0],
    ['122025', '9 עסקאות', 800, 0, 0],
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
