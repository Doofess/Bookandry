import { dateFromExcelSerial, parseStatementDate } from '@/lib/dates';
import { minorFromNumber, parseStatementAmount, type DecimalMark } from '@/lib/money';
import type { Currency, LocalDate } from '@/types/money';

import { currencyFromText, type Flag, type FoundPlan, type FoundRow } from './import-check';
import type { WireMap, WireRow } from './import-wire';
import { isMcc } from './mcc';

/**
 * Spreadsheets are read by code, not by the model.
 *
 * An Excel or CSV export from a bank or card company is already a table: the
 * only question is which column is which, and a dictionary of the headers
 * Israeli exports use answers it most of the time. When it cannot, the model
 * is shown the block's first rows - never the whole sheet - and answers with
 * column numbers (`WireMap`); either way every row is then read here, exactly,
 * so a 500-row statement cannot come back with three amounts misread or cut
 * off half way.
 */

export type Cell = string | number | boolean | null;

/**
 * A sheet's columns. `mcc` and `sector` come from the dictionary only - the
 * model's map never names them - including on a header row the model found.
 */
export type ColumnMap = Omit<WireMap, 'mc' | 'hr'> & {
  readonly headerRow: number;
  readonly mcc: number | null;
  readonly sector: number | null;
};

const HEADERS: Readonly<Record<keyof Omit<ColumnMap, 'headerRow' | 'dec' | 'df'>, readonly string[]>> = {
  date: ['תאריך עסקה', 'תאריך העסקה', 'תאריך רכישה', 'תאריך', 'date', 'transaction date', 'purchase date'],
  desc: [
    'שם בית העסק',
    'שם בית עסק',
    'בית עסק',
    'בית העסק',
    'תיאור',
    'תיאור התנועה',
    'פרטים',
    'הפעולה',
    'description',
    'merchant',
    'details',
  ],
  amt: ['סכום עסקה', 'סכום העסקה', 'סכום מקורי', 'סכום', 'amount', 'transaction amount'],
  debit: ['חובה', 'בחובה', 'debit', 'withdrawal'],
  credit: ['זכות', 'בזכות', 'credit', 'deposit'],
  cur: ['מטבע עסקה', 'מטבע מקור', 'מטבע', 'currency'],
  chg: ['סכום חיוב', 'סכום לחיוב', 'סכום החיוב', 'charged amount', 'charge amount'],
  chgCur: ['מטבע חיוב', 'מטבע החיוב', 'charge currency'],
  chgDate: ['תאריך חיוב', 'מועד חיוב', 'charge date', 'billing date'],
  plan: ['פירוט נוסף', 'הערות', 'סוג עסקה', 'פרטי עסקה', 'notes', 'type'],
  card: [
    '4 ספרות אחרונות של כרטיס האשראי',
    '4 ספרות אחרונות',
    'ספרות אחרונות',
    'מספר כרטיס',
    'כרטיס אשראי',
    'כרטיס',
    'card',
    'card number',
    'card no',
    'last 4 digits',
    'last four digits',
  ],
  mcc: ['mcc', 'קוד ענף', 'merchant category code', 'sic'],
  sector: ['ענף', 'ענף עסקי', 'תחום', 'קטגוריה', 'category', 'sector'],
};

const norm = (cell: Cell): string =>
  String(cell ?? '')
    .replace(/[\u200E\u200F"״'׳:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Which field a header cell names, or undefined. The longer names are tried first, so "סכום חיוב" is not taken for "סכום". */
function fieldOf(cell: Cell): keyof typeof HEADERS | undefined {
  const text = norm(cell);
  if (text === '') return undefined;
  let best: { field: keyof typeof HEADERS; length: number } | undefined;
  for (const [field, names] of Object.entries(HEADERS) as [keyof typeof HEADERS, readonly string[]][]) {
    for (const name of names) {
      if (
        (text === name || text.startsWith(`${name} `)) &&
        (best === undefined || name.length > best.length)
      ) {
        best = { field, length: name.length };
      }
    }
  }
  return best?.field;
}

/**
 * Find the header row in a sheet's first rows and map its columns, or
 * undefined when the dictionary does not know this export.
 */
export function mapByDictionary(rows: readonly (readonly Cell[])[], scan = 30): ColumnMap | undefined {
  for (let r = 0; r < Math.min(scan, rows.length); r += 1) {
    const found: Partial<Record<keyof typeof HEADERS, number>> = {};
    (rows[r] ?? []).forEach((cell, c) => {
      const field = fieldOf(cell);
      if (field !== undefined && found[field] === undefined) found[field] = c;
    });
    const hasMoney = found.amt !== undefined || found.debit !== undefined || found.credit !== undefined;
    if (found.date === undefined || found.desc === undefined || !hasMoney) continue;
    return {
      headerRow: r,
      date: found.date,
      desc: found.desc,
      amt: found.amt ?? null,
      debit: found.debit ?? null,
      credit: found.credit ?? null,
      cur: found.cur ?? null,
      chg: found.chg ?? null,
      chgCur: found.chgCur ?? null,
      chgDate: found.chgDate ?? null,
      plan: found.plan ?? null,
      card: found.card ?? null,
      mcc: found.mcc ?? null,
      sector: found.sector ?? null,
      dec: decimalOf(rows, r, found.amt ?? found.debit ?? found.credit ?? 0),
      df: 'dmy',
    };
  }
  return undefined;
}

/**
 * The decimal mark a column of text amounts uses, decided once from all of
 * it: a "1.234,56" anywhere settles it, as does any ",56" ending. Numeric
 * cells say nothing and default to '.'.
 */
function decimalOf(rows: readonly (readonly Cell[])[], header: number, column: number): DecimalMark {
  for (const row of rows.slice(header + 1)) {
    const cell = row[column];
    if (typeof cell !== 'string') continue;
    const text = cell.replace(/[^\d.,]/g, '');
    if (/\.\d{3},\d{1,2}$/.test(text) || /^\d+,\d{1,2}$/.test(text)) return ',';
    if (/,\d{3}\.\d{1,2}$/.test(text) || /^\d+\.\d{1,2}$/.test(text)) return '.';
  }
  return '.';
}

/** A model's map, as a column map: with the MCC and sector columns its header row names, by the dictionary. */
export function fromWireMap(map: WireMap, rows: readonly (readonly Cell[])[] = []): ColumnMap {
  const { hr, mc: _merchants, ...rest } = map;
  const header = rows[hr] ?? [];
  const column = (field: 'mcc' | 'sector'): number | null => {
    const at = header.findIndex((cell) => fieldOf(cell) === field);
    return at === -1 ? null : at;
  };
  return { ...rest, headerRow: hr, mcc: column('mcc'), sector: column('sector') };
}

const TOTAL_WORDS = /סה["״]?כ|סך הכל|total|יתרה|balance/i;
const PLAN_TEXT = /(?:תשלום|payment)\s*(\d{1,3})\s*(?:מתוך|of|\/)\s*(\d{1,3})/i;

/** "תשלום 3 מתוך 6" as a plan, if a cell says so. */
export function planFromText(text: string): Omit<FoundPlan, 'totalMinor'> | undefined {
  const match = PLAN_TEXT.exec(text);
  if (match === null) return undefined;
  const number = Number(match[1]);
  const count = Number(match[2]);
  if (count < 2 || number < 1 || number > count) return undefined;
  return { mode: /קרדיט|credit/i.test(text) ? 'credit' : 'installments', number, count };
}

function cellDate(
  cell: Cell,
  df: ColumnMap['df'],
  anchor: LocalDate,
  date1904: boolean,
): LocalDate | undefined {
  if (typeof cell === 'number') return dateFromExcelSerial(cell, date1904);
  if (typeof cell !== 'string') return undefined;
  if (df === 'mdy') {
    const [, month = '', day = '', yearText = ''] =
      /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\s*$/.exec(cell) ?? [];
    return yearText === '' ? undefined : parseStatementDate(`${day}/${month}/${yearText}`, anchor)?.date;
  }
  if (df === 'ymd') {
    const [, year = '', month = '', day = ''] =
      /^\s*(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\s*$/.exec(cell) ?? [];
    return year === '' ? undefined : parseStatementDate(`${year}-${month}-${day}`, anchor)?.date;
  }
  return parseStatementDate(cell, anchor)?.date;
}

function cellMoney(cell: Cell, currency: Currency, dec: DecimalMark): number | undefined {
  if (typeof cell === 'number') return minorFromNumber(cell, currency);
  if (typeof cell !== 'string' || cell.trim() === '') return undefined;
  return parseStatementAmount(cell, currency, dec);
}

const text = (cell: Cell | undefined): string =>
  cell === null || cell === undefined ? '' : String(cell).trim();

/**
 * A card's last four digits, from a cell holding its number or only those
 * digits - '' when it holds fewer. A number cell has lost its leading zeros.
 */
function cardDigits(cell: Cell | undefined): string {
  if (typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell < 10_000) {
    return String(cell).padStart(4, '0');
  }
  const digits = text(cell).replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}

const CARD_WORDS = /כרטיס|המסתיים|מסתיים|\bcard\b|ending|[*•xX]{2,}/i;
/** A run of exactly four digits that is not part of a date. */
const FOUR = /(?<![\d/.-])(\d{4})(?![\d/.-])/;

/**
 * The card a whole sheet is for, when the lines above its table say so -
 * "פירוט עסקאות לכרטיס מקס 1234" - and name only one.
 */
export function cardAbove(rows: readonly (readonly Cell[])[], headerRow: number): string {
  const found = new Set<string>();
  for (const row of rows.slice(0, headerRow)) {
    for (const cell of row) {
      const line = text(cell);
      const at = line.search(CARD_WORDS);
      if (at === -1) continue;
      const digits = FOUR.exec(line.slice(at))?.[1];
      if (digits !== undefined) found.add(digits);
    }
  }
  const [only, ...more] = [...found];
  return only !== undefined && more.length === 0 ? only : '';
}

/**
 * A business type from an MCC cell. Excel keeps a code as a number, so 742
 * is "0742" and 5411.0 is "5411"; a text cell may carry spaces or ".0".
 * Anything the list does not have is none - never a flag on the row.
 */
function mccFromCell(cell: Cell | undefined): string | undefined {
  let code: string | undefined;
  if (typeof cell === 'number') {
    code = Number.isInteger(cell) && cell >= 0 && cell < 10_000 ? String(cell).padStart(4, '0') : undefined;
  } else if (typeof cell === 'string') {
    code = /^\s*(\d{1,4})(?:\.0+)?\s*$/.exec(cell)?.[1]?.padStart(4, '0');
  }
  return isMcc(code) ? code : undefined;
}

export type SheetRead = {
  readonly rows: FoundRow[];
  /** Rows under the header that were not transactions: totals, blanks, notes. */
  readonly skipped: number;
  /** Rows that looked like transactions and could not be read. */
  readonly unreadable: number;
};

/**
 * Every transaction in a sheet block, read with `map`. A row is one when its
 * date and its amount both read; a totals row, or one with neither, is
 * skipped and counted. Money is exact: numeric cells are rounded once, text
 * cells are read with the column's own decimal mark.
 */
export function readSheet(
  rows: readonly (readonly Cell[])[],
  map: ColumnMap,
  ctx: {
    readonly file: number;
    readonly base: Currency;
    readonly known: ReadonlySet<Currency>;
    readonly anchor: LocalDate;
    readonly date1904: boolean;
    readonly idPrefix: string;
  },
): SheetRead {
  const out: FoundRow[] = [];
  let skipped = 0;
  let unreadable = 0;
  const sheetCard = cardAbove(rows, map.headerRow);
  rows.slice(map.headerRow + 1).forEach((row, i) => {
    const description = text(row[map.desc]);
    const dateCell = row[map.date] ?? null;
    if (TOTAL_WORDS.test(description) || row.every((cell) => text(cell) === '')) {
      skipped += 1;
      return;
    }
    const currency = map.cur === null ? ctx.base : currencyFromText(text(row[map.cur]), ctx.base, ctx.known);
    const date = cellDate(dateCell, map.df, ctx.anchor, ctx.date1904);
    const flags: Flag[] = [];
    let kind: FoundRow['kind'] = 'expense';
    let amount: number | undefined;
    if (currency !== undefined) {
      if (map.amt !== null) amount = cellMoney(row[map.amt] ?? null, currency, map.dec);
      if (amount === undefined || amount === 0) {
        const debit = map.debit === null ? undefined : cellMoney(row[map.debit] ?? null, currency, map.dec);
        const credit =
          map.credit === null ? undefined : cellMoney(row[map.credit] ?? null, currency, map.dec);
        if (credit !== undefined && credit !== 0) {
          amount = Math.abs(credit);
          kind = 'income';
        } else if (debit !== undefined && debit !== 0) amount = Math.abs(debit);
      } else if (amount < 0) {
        amount = Math.abs(amount);
        kind = 'income';
      }
    }
    if (date === undefined && amount === undefined) {
      skipped += 1;
      return;
    }
    if (currency === undefined) flags.push('currency_unknown');
    if (amount === undefined) flags.push('amount_unreadable');
    if (date === undefined) flags.push('date_unreadable');
    if (flags.length > 0) unreadable += 1;

    const chargedCurrency =
      map.chg === null
        ? undefined
        : map.chgCur === null
          ? ctx.base
          : currencyFromText(text(row[map.chgCur]), ctx.base, ctx.known);
    const chargedMinor =
      map.chg === null || chargedCurrency === undefined
        ? undefined
        : cellMoney(row[map.chg] ?? null, chargedCurrency, map.dec);
    const planText = map.plan === null ? undefined : planFromText(text(row[map.plan]));
    /*
     * An instalment row on a card export: the transaction amount is the whole
     * deal, the charged amount is this month's payment. The row is the
     * payment; the deal's amount is the plan's total.
     */
    const payment =
      planText !== undefined &&
      chargedMinor !== undefined &&
      chargedMinor !== 0 &&
      chargedCurrency === currency
        ? Math.abs(chargedMinor)
        : undefined;
    const plan =
      planText === undefined
        ? undefined
        : { ...planText, ...(payment === undefined || amount === undefined ? {} : { totalMinor: amount }) };

    const wire: WireRow = {
      s: 0,
      p: null,
      k: kind === 'income' ? 'i' : 'e',
      st: 'posted',
      fee: false,
      d: text(dateCell),
      a: map.amt === null ? '' : text(row[map.amt]),
      c: map.cur === null ? null : text(row[map.cur]),
      sg: null,
      ca: map.chg === null ? null : text(row[map.chg]),
      cc: map.chgCur === null ? null : text(row[map.chgCur]),
      cd: map.chgDate === null ? null : text(row[map.chgDate]),
      m: description,
      cat: null,
      pm: null,
      pl: plan === undefined ? null : { md: plan.mode, n: plan.number, of: plan.count, tot: null },
      l4: (map.card === null ? '' : cardDigits(row[map.card])) || sheetCard,
    };
    const fileMcc = map.mcc === null ? undefined : mccFromCell(row[map.mcc]);
    const sector = map.sector === null ? '' : text(row[map.sector]);
    out.push({
      id: `${ctx.idPrefix}${String(i)}`,
      file: ctx.file,
      part: null,
      kind,
      date,
      amountMinor: payment ?? amount,
      currency,
      ...(chargedMinor === undefined ||
      chargedCurrency === undefined ||
      chargedCurrency === currency ||
      chargedMinor === 0
        ? {}
        : { charged: { minor: Math.abs(chargedMinor), currency: chargedCurrency } }),
      description,
      categoryAlias: null,
      methodAlias: null,
      plan: plan ?? null,
      cardFee: description.includes('דמי כרטיס'),
      flags,
      wire,
      ...(fileMcc === undefined ? {} : { fileMcc }),
      ...(sector === '' ? {} : { sector }),
    });
  });
  return { rows: out, skipped, unreadable };
}

/** A map is trusted when nearly every row it reads, reads: 95%, or it is asked for again. */
export function mapHolds(read: SheetRead): boolean {
  const tried = read.rows.length;
  return tried > 0 && (tried - read.unreadable) / tried >= 0.95;
}

/** What a map call is shown: the block's first rows, as text, capped. */
export function sampleRows(rows: readonly (readonly Cell[])[], count = 15): string[][] {
  return rows.slice(0, count).map((row) => row.slice(0, 40).map((cell) => text(cell).slice(0, 200)));
}
