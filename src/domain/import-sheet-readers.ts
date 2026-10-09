import { daysBetween, parseStatementDate } from '@/lib/dates';
import { minorFromNumber, parseStatementAmount } from '@/lib/money';
import type { Currency, LocalDate } from '@/types/money';

import { currencyFromText, withFlags, type Flag, type FoundPlan, type FoundRow } from './import-check';
import { planFromText, type Cell } from './import-sheet-map';
import type { WireRow } from './import-wire';

/**
 * Exact readers for the exports the app knows by name.
 *
 * The dictionary (`import-sheet-map`) maps the columns of any export by its
 * headers, one field at a time - and on these exports the first header that
 * fits is the wrong one: Max prints the deal's whole amount beside the
 * payment, and the instalment text in "הערות" beside a "סוג עסקה" column;
 * Discount keeps a row's currency only in its cell's number format. Each
 * reader here is keyed on the export's exact headers and reads every row the
 * way that export means it:
 *  - the amount is what the card charged; the original amount and currency
 *    are kept beside it only when it was a named foreign currency;
 *  - an instalment or loan row is this payment, of a plan whose total is the
 *    deal - and a deal's rows make one plan, not one each;
 *  - Max's FX wallet, which shows one foreign purchase three times, gives it
 *    once, at its shekel cost.
 * A sheet no reader knows is left to the dictionary and the model, as before.
 */

/** One sheet as prepared: its rows, and each numeric cell's number format where it has one. */
export type SheetInput = {
  readonly name: string;
  readonly rows: readonly (readonly Cell[])[];
  readonly formats?: readonly (readonly (string | null)[])[];
  readonly date1904: boolean;
};

export type ReaderContext = {
  readonly file: number;
  readonly base: Currency;
  readonly known: ReadonlySet<Currency>;
  readonly anchor: LocalDate;
};

export type KnownBlock = {
  readonly sheet: number;
  /** The header row and the two under it - what a categories call is shown. */
  readonly header: readonly (readonly Cell[])[];
  readonly rows: FoundRow[];
};

export type KnownRead = {
  readonly format: 'max' | 'discount' | 'totals';
  readonly blocks: readonly KnownBlock[];
  /** Sheets no reader knows, for the generic path. */
  readonly rest: readonly number[];
};

const norm = (cell: Cell | undefined): string =>
  String(cell ?? '')
    .replace(/[‎‏"״'׳:?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const text = (cell: Cell | undefined): string =>
  cell === null || cell === undefined ? '' : String(cell).trim();

const MAX = {
  date: 'תאריך עסקה',
  desc: 'שם בית העסק',
  sector: 'קטגוריה',
  card: '4 ספרות אחרונות של כרטיס האשראי',
  type: 'סוג עסקה',
  chg: 'סכום חיוב',
  chgCur: 'מטבע חיוב',
  orig: 'סכום עסקה מקורי',
  origCur: 'מטבע עסקה מקורי',
  chgDate: 'תאריך חיוב',
  notes: 'הערות',
} as const;

const DISCOUNT = {
  card: 'כרטיס',
  desc: 'בית עסק',
  date: 'תאריך עסקה',
  amt: 'סכום העסקה',
  issuer: 'מנפיק',
  type: 'סוג העסקה',
  detail: 'פירוט',
  chgDate: 'תאריך החיוב',
  chg: 'סכום החיוב',
} as const;

const TOTALS = ['חודש חיוב', 'מספר עסקאות', 'סכום החיוב בשח'] as const;

/** Where a sheet's header row is and where each named column sits in it - every name present - or undefined. */
function findHeader<K extends string>(
  rows: readonly (readonly Cell[])[],
  names: Readonly<Record<K, string>>,
  scan = 30,
): { readonly row: number; readonly col: Readonly<Record<K, number>> } | undefined {
  for (let r = 0; r < Math.min(scan, rows.length); r += 1) {
    const cells = (rows[r] ?? []).map(norm);
    const col: Partial<Record<K, number>> = {};
    let all = true;
    for (const [key, name] of Object.entries(names) as [K, string][]) {
      const at = cells.indexOf(norm(name));
      if (at === -1) {
        all = false;
        break;
      }
      col[key] = at;
    }
    if (all) return { row: r, col: col as Record<K, number> };
  }
  return undefined;
}

const isTotals = (sheet: SheetInput): boolean =>
  findHeader(sheet.rows, { a: TOTALS[0], b: TOTALS[1], c: TOTALS[2] }) !== undefined;
const isMax = (sheet: SheetInput) => findHeader(sheet.rows, MAX) !== undefined;
const isDiscount = (sheet: SheetInput) => findHeader(sheet.rows, DISCOUNT) !== undefined;

/**
 * A workbook of monthly charge totals only - Discount's one-page summary of
 * the months its monthly files hold row by row. Read as rows, it would count
 * every month twice.
 */
export function totalsOnly(sheets: readonly SheetInput[]): boolean {
  return sheets.some(isTotals) && !sheets.some((sheet) => isMax(sheet) || isDiscount(sheet));
}

/**
 * The currency a number format prints: its quoted text ("$"#,##0.00) or its
 * bracketed symbol ([$€-x-euro2]); the base when it prints none, undefined
 * when it prints one the app does not know.
 */
export function formatCurrency(
  format: string | null | undefined,
  base: Currency,
  known: ReadonlySet<Currency>,
): Currency | undefined {
  if (format === null || format === undefined) return base;
  const marks = [
    ...[...format.matchAll(/"([^"]*)"/g)].map((m) => m[1] ?? ''),
    ...[...format.matchAll(/\[\$([^\]-]*)/g)].map((m) => m[1] ?? ''),
  ]
    .join(' ')
    .trim();
  return currencyFromText(marks === '' ? null : marks, base, known);
}

function cellMinor(cell: Cell | undefined, currency: Currency): number | undefined {
  if (typeof cell === 'number') return minorFromNumber(cell, currency);
  if (typeof cell !== 'string' || cell.trim() === '') return undefined;
  return parseStatementAmount(cell, currency, '.');
}

/** A card's last four digits from a cell: "0400", "ויזה 1234". */
function lastFour(cell: Cell | undefined): string {
  if (typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell < 10_000) {
    return String(cell).padStart(4, '0');
  }
  const digits = text(cell).replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}

/** Max's title line "1234-<card name>": the card the sheet is for. */
function titleCard(rows: readonly (readonly Cell[])[], header: number): string {
  for (const row of rows.slice(0, header)) {
    const match = /^\s*(\d{4})-\D/.exec(text(row[0]));
    if (match?.[1] !== undefined) return match[1];
  }
  return '';
}

/**
 * Max's foreign-sheet merchant, padded to fixed widths - name (22), city
 * (13), country code - as the name alone, so it matches the same merchant
 * elsewhere.
 */
export function merchantName(description: string): string {
  if (description.length === 40 && description[22] === ' ' && /^ [A-Z]{3}$/.test(description.slice(36))) {
    return description.slice(0, 22).trim();
  }
  return description.trim();
}

/** Discount's "N/M" in the details column - never a date's "4/12/25". */
function slashPlan(detail: string): Omit<FoundPlan, 'totalMinor'> | undefined {
  const match = /(?<![\d/])(\d{1,3})\/(\d{1,3})(?![\d/])/.exec(detail);
  if (match === null) return undefined;
  const number = Number(match[1]);
  const count = Number(match[2]);
  if (count < 2 || number < 1 || number > count) return undefined;
  return { mode: 'installments', number, count };
}

const dateOf = (cell: Cell | undefined, anchor: LocalDate): LocalDate | undefined =>
  typeof cell === 'string' ? parseStatementDate(cell, anchor)?.date : undefined;

/** What a reader settled for one row, before it becomes a found row. */
type Money = {
  readonly kind: FoundRow['kind'];
  readonly amountMinor: number | undefined;
  readonly currency: Currency | undefined;
  readonly charged?: FoundRow['charged'];
  readonly flags: readonly Flag[];
};

/**
 * One row's money: the charged amount, in the charged currency - unless the
 * original was in a named currency other than that, when the original is the
 * amount and the charge stands beside it (the rate is then the two amounts').
 * An original in a currency the app does not know, or none named, is
 * foreign-unknown: the charge is the amount.
 */
function settle(input: {
  readonly charged: number | undefined;
  readonly chargedCurrency: Currency | undefined;
  readonly original: number | undefined;
  readonly originalCurrency: Currency | undefined;
}): Money {
  const { charged, chargedCurrency, original, originalCurrency } = input;
  const flags: Flag[] = [];
  if (chargedCurrency === undefined) flags.push('currency_unknown');
  const signed = charged ?? original;
  const kind = signed !== undefined && signed < 0 ? 'income' : 'expense';
  if (
    originalCurrency !== undefined &&
    originalCurrency !== chargedCurrency &&
    original !== undefined &&
    original !== 0
  ) {
    return {
      kind,
      amountMinor: Math.abs(original),
      currency: originalCurrency,
      ...(charged === undefined || charged === 0 || chargedCurrency === undefined
        ? {}
        : { charged: { minor: Math.abs(charged), currency: chargedCurrency } }),
      flags,
    };
  }
  if (charged === undefined || chargedCurrency === undefined) flags.push('amount_unreadable');
  return {
    kind,
    amountMinor: charged === undefined || chargedCurrency === undefined ? undefined : Math.abs(charged),
    currency: chargedCurrency,
    flags,
  };
}

type Draft = {
  readonly row: FoundRow;
  /** What the export says the row is, for the rules that read across rows. */
  readonly type: string;
  readonly notes: string;
  readonly wallet: boolean;
};

function found(
  id: string,
  ctx: ReaderContext,
  money: Money,
  fields: {
    readonly date: LocalDate | undefined;
    readonly dateText: string;
    readonly description: string;
    readonly amountText: string;
    readonly currencyText: string | null;
    readonly chargedText: string;
    readonly chargedCurrencyText: string | null;
    readonly chargeDate: string;
    readonly plan: FoundPlan | null;
    readonly l4: string;
    readonly sector: string;
  },
): FoundRow {
  const flags = [...money.flags];
  if (fields.date === undefined) flags.push('date_unreadable');
  const { plan } = fields;
  const wire: WireRow = {
    s: 0,
    p: null,
    k: money.kind === 'income' ? 'i' : 'e',
    st: 'posted',
    fee: false,
    d: fields.dateText,
    a: fields.amountText,
    c: fields.currencyText,
    sg: null,
    ca: fields.chargedText,
    cc: fields.chargedCurrencyText,
    cd: fields.chargeDate,
    m: fields.description,
    cat: null,
    pm: null,
    pl: plan === null ? null : { md: plan.mode, n: plan.number, of: plan.count, tot: null },
    l4: fields.l4,
    ...(fields.sector === '' ? {} : { sec: fields.sector }),
  };
  return {
    id,
    file: ctx.file,
    part: null,
    kind: money.kind,
    date: fields.date,
    amountMinor: money.amountMinor,
    currency: money.currency,
    ...(money.charged === undefined ? {} : { charged: money.charged }),
    description: fields.description,
    categoryAlias: null,
    methodAlias: null,
    plan,
    cardFee: fields.description.includes('דמי כרטיס'),
    flags,
    wire,
    ...(fields.sector === '' ? {} : { sector: fields.sector }),
  };
}

/** A plan's total: the deal's amount, when it is in the payment's own currency. */
function withTotal(
  plan: Omit<FoundPlan, 'totalMinor'> | undefined,
  money: Money,
  original: number | undefined,
  originalCurrency: Currency | undefined,
): FoundPlan | null {
  if (plan === undefined) return null;
  return original !== undefined && original !== 0 && originalCurrency === money.currency
    ? { ...plan, totalMinor: Math.abs(original) }
    : plan;
}

function readMaxSheet(
  sheet: SheetInput,
  s: number,
  ctx: ReaderContext,
): { block: KnownBlock; drafts: Draft[] } {
  const header = findHeader(sheet.rows, MAX);
  /* c8 ignore next -- only called on a sheet whose header was found */
  if (header === undefined) throw new Error('not a Max sheet');
  const { col } = header;
  const sheetCard = titleCard(sheet.rows, header.row);
  const wallet = sheet.name.includes('ארנק');
  const drafts: Draft[] = [];
  sheet.rows.slice(header.row + 1).forEach((row, i) => {
    const raw = text(row[col.desc]);
    const date = dateOf(row[col.date], ctx.anchor);
    const chargedCell = row[col.chg];
    if (date === undefined && (raw === '' || text(chargedCell) === '')) return;
    const chargedCurrencyText = text(row[col.chgCur]);
    const originalCurrencyText = text(row[col.origCur]);
    const chargedCurrency = currencyFromText(chargedCurrencyText, ctx.base, ctx.known);
    // Blank is foreign-unknown here, never the base: the charge is the amount.
    const originalCurrency =
      originalCurrencyText === '' ? undefined : currencyFromText(originalCurrencyText, ctx.base, ctx.known);
    const charged = chargedCurrency === undefined ? undefined : cellMinor(chargedCell, chargedCurrency);
    const original = originalCurrency === undefined ? undefined : cellMinor(row[col.orig], originalCurrency);
    const money = settle({ charged, chargedCurrency, original, originalCurrency });
    const type = text(row[col.type]);
    const notes = text(row[col.notes]);
    const planText = planFromText(notes);
    const plan = withTotal(
      planText === undefined
        ? undefined
        : {
            ...planText,
            mode: type.includes('הלוואה') ? 'loan' : type.includes('קרדיט') ? 'credit' : planText.mode,
          },
      money,
      original,
      originalCurrency,
    );
    drafts.push({
      row: found(`f${String(ctx.file)}s${String(s)}r${String(i)}`, ctx, money, {
        date,
        dateText: text(row[col.date]),
        description: merchantName(raw),
        amountText: text(row[col.orig]) || text(chargedCell),
        currencyText: originalCurrencyText,
        chargedText: text(chargedCell),
        chargedCurrencyText,
        chargeDate: text(row[col.chgDate]),
        plan,
        l4: lastFour(row[col.card]) || sheetCard,
        sector: text(row[col.sector]),
      }),
      type,
      notes,
      wallet,
    });
  });
  return {
    block: { sheet: s, header: sheet.rows.slice(header.row, header.row + 3), rows: [] },
    drafts,
  };
}

const FX_NOTE = /^([A-Z]{3})\s+([\d,]+(?:\.\d+)?)$/;

/**
 * Max's FX wallet shows one foreign purchase three times: the shekels that
 * bought the currency (local sheet, "רכישת מט"ח", its amount in "הערות"), the
 * purchase itself (wallet sheet, in the currency), and the wallet paying the
 * card back for it (wallet sheet, a credit of the same amount). Kept: the
 * purchase, at the shekels it cost when they can be matched. Dropped: the
 * other two.
 */
function foldWallet(drafts: readonly Draft[]): Draft[] {
  const dropped = new Set<string>();
  const paid = new Set<string>();
  const charged = new Map<string, FoundRow['charged']>();
  const purchases = drafts.filter((d) => d.wallet && d.row.kind === 'expense');
  for (const credit of drafts) {
    if (!credit.wallet || credit.row.kind !== 'income' || credit.row.date === undefined) continue;
    if (!credit.row.description.includes('ארנק') && !credit.type.includes('ארנק')) continue;
    const creditDate = credit.row.date;
    const match = purchases.find(
      (p) =>
        !paid.has(p.row.id) &&
        p.row.currency === credit.row.currency &&
        p.row.amountMinor === credit.row.amountMinor &&
        p.row.date !== undefined &&
        daysBetween(p.row.date, creditDate) >= 0 &&
        daysBetween(p.row.date, creditDate) <= 31,
    );
    if (match === undefined) continue;
    paid.add(match.row.id);
    dropped.add(credit.row.id);
  }
  for (const purchase of purchases) {
    const date = purchase.row.date;
    if (date === undefined) continue;
    const fx = drafts.find((d) => {
      if (dropped.has(d.row.id) || d.wallet || d.row.kind !== 'expense' || d.row.date === undefined)
        return false;
      if (!d.row.description.includes('רכישת מט')) return false;
      const [, code, amount] = FX_NOTE.exec(d.notes) ?? [];
      if (code !== purchase.row.currency || amount === undefined || purchase.row.currency === undefined)
        return false;
      return (
        parseStatementAmount(amount, purchase.row.currency, '.') === purchase.row.amountMinor &&
        Math.abs(daysBetween(date, d.row.date)) <= 14
      );
    });
    if (fx?.row.amountMinor === undefined || fx.row.currency === undefined) continue;
    dropped.add(fx.row.id);
    charged.set(purchase.row.id, { minor: fx.row.amountMinor, currency: fx.row.currency });
  }
  return drafts
    .filter((d) => !dropped.has(d.row.id))
    .map((d) => {
      const cost = charged.get(d.row.id);
      return cost === undefined ? d : { ...d, row: { ...d.row, charged: cost } };
    });
}

const merchantKey = (description: string): string => description.replace(/[\s"״'׳.,-]+/g, '').toLowerCase();

/**
 * A deal's payments, in one export, as one plan: every row of the same card,
 * purchase date, merchant, count and total is a payment of it. The earliest
 * payment found carries the plan; the rest are marked as part of it - as is
 * a loan's disbursement, which is the loan coming in, not income.
 */
function groupPlans(rows: readonly FoundRow[], loans: (row: FoundRow) => boolean): FoundRow[] {
  const keyOf = (row: FoundRow, plan: { mode: string; count: number; totalMinor?: number }) =>
    [
      row.wire.l4,
      row.date ?? '',
      merchantKey(row.description),
      plan.mode,
      plan.count,
      plan.totalMinor ?? '',
    ].join('|');
  const lead = new Map<string, FoundRow>();
  for (const row of rows) {
    if (row.plan === null || row.date === undefined) continue;
    const key = keyOf(row, row.plan);
    const current = lead.get(key);
    if (current?.plan === undefined || current.plan === null || row.plan.number < current.plan.number) {
      lead.set(key, row);
    }
  }
  const loanTotals = new Set(
    [...lead.values()]
      .filter((row) => row.plan?.mode === 'loan' && row.plan.totalMinor !== undefined)
      .map((row) => [row.wire.l4, row.date, merchantKey(row.description), row.plan?.totalMinor].join('|')),
  );
  return rows.map((row) => {
    if (row.plan !== null && row.date !== undefined) {
      return lead.get(keyOf(row, row.plan)) === row ? row : withFlags(row, 'plan_in_import');
    }
    const disbursement =
      row.kind === 'income' &&
      loans(row) &&
      loanTotals.has([row.wire.l4, row.date, merchantKey(row.description), row.amountMinor].join('|'));
    return disbursement ? withFlags(row, 'plan_in_import') : row;
  });
}

function readMax(sheets: readonly SheetInput[], ctx: ReaderContext): KnownRead {
  const blocks: { block: KnownBlock; drafts: Draft[] }[] = [];
  const rest: number[] = [];
  sheets.forEach((sheet, s) => {
    if (isMax(sheet)) blocks.push(readMaxSheet(sheet, s, ctx));
    else rest.push(s);
  });
  const all = foldWallet(blocks.flatMap((b) => b.drafts));
  const types = new Map(all.map((d) => [d.row.id, d.type]));
  const grouped = groupPlans(
    all.map((d) => d.row),
    (row) => (types.get(row.id) ?? '').includes('הלוואה'),
  );
  return {
    format: 'max',
    blocks: blocks.map(({ block }) => ({
      ...block,
      rows: grouped.filter((row) => row.id.startsWith(`f${String(ctx.file)}s${String(block.sheet)}r`)),
    })),
    rest,
  };
}

function readDiscountSheet(sheet: SheetInput, s: number, ctx: ReaderContext): KnownBlock {
  const header = findHeader(sheet.rows, DISCOUNT);
  /* c8 ignore next -- only called on a sheet whose header was found */
  if (header === undefined) throw new Error('not a Discount sheet');
  const { col } = header;
  const rows: FoundRow[] = [];
  const hasFormats = sheet.formats !== undefined;
  sheet.rows.slice(header.row + 1).forEach((row, i) => {
    const r = header.row + 1 + i;
    const date = dateOf(row[col.date], ctx.anchor);
    const description = text(row[col.desc]);
    if (date === undefined) return;
    const formats = sheet.formats?.[r] ?? [];
    const chargedCurrency = formatCurrency(formats[col.chg], ctx.base, ctx.known);
    const charged = chargedCurrency === undefined ? undefined : cellMinor(row[col.chg], chargedCurrency);
    // Without formats the amount's currency cannot be known: the charge, in the base, is what is certain.
    const originalCurrency = hasFormats ? formatCurrency(formats[col.amt], ctx.base, ctx.known) : undefined;
    const original =
      originalCurrency === undefined || text(row[col.amt]) === '--'
        ? undefined
        : cellMinor(row[col.amt], originalCurrency);
    const money = settle({ charged, chargedCurrency, original, originalCurrency });
    const detail = text(row[col.detail]);
    const plan = withTotal(planFromText(detail) ?? slashPlan(detail), money, original, originalCurrency);
    rows.push(
      found(`f${String(ctx.file)}s${String(s)}r${String(i)}`, ctx, money, {
        date,
        dateText: text(row[col.date]),
        description,
        amountText: text(row[col.amt]),
        currencyText: null,
        chargedText: text(row[col.chg]),
        chargedCurrencyText: null,
        chargeDate: text(row[col.chgDate]),
        plan,
        l4: lastFour(row[col.card]),
        sector: '',
      }),
    );
  });
  return {
    sheet: s,
    header: sheet.rows.slice(header.row, header.row + 3),
    rows: groupPlans(rows, () => false),
  };
}

/**
 * The workbook read by the reader that knows it, or undefined when none
 * does. A totals-only summary is known too, and gives nothing.
 */
export function readKnownExport(sheets: readonly SheetInput[], ctx: ReaderContext): KnownRead | undefined {
  if (sheets.some(isMax)) return readMax(sheets, ctx);
  if (sheets.some(isDiscount)) {
    const blocks: KnownBlock[] = [];
    const rest: number[] = [];
    sheets.forEach((sheet, s) => {
      if (isDiscount(sheet)) blocks.push(readDiscountSheet(sheet, s, ctx));
      else rest.push(s);
    });
    return { format: 'discount', blocks, rest };
  }
  if (totalsOnly(sheets)) return { format: 'totals', blocks: [], rest: [] };
  return undefined;
}
