import { dateFromExcelSerial, daysBetween, parseStatementDate } from '@/lib/dates';
import { minorFromNumber, parseStatementAmount, prorateMinor } from '@/lib/money';
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
 * reader here is keyed on the export's own headers and reads every row the
 * way that export means it:
 *  - the amount is what the card charged; the original amount and currency
 *    are kept beside it only when it was a named foreign currency, and never
 *    on a plan's payment, whose original is the whole deal;
 *  - an instalment or loan row is this payment, of a plan whose total is the
 *    deal when it is in the payment's currency (`groupPlans` then makes a
 *    deal's rows, across the import's files, one plan);
 *  - Max's FX wallet, which shows one foreign purchase three times, gives it
 *    once, at its shekel cost - when the shekels that bought the currency
 *    can be matched to what it bought; otherwise as Max prints it, netting to
 *    nothing on the card.
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

/** The columns that make a sheet Max's: the two amounts, their currencies, and "הערות". */
const MAX = {
  date: 'תאריך עסקה',
  desc: 'שם בית העסק',
  chg: 'סכום חיוב',
  chgCur: 'מטבע חיוב',
  orig: 'סכום עסקה מקורי',
  origCur: 'מטבע עסקה מקורי',
  notes: 'הערות',
} as const;
const MAX_MORE = {
  sector: 'קטגוריה',
  card: '4 ספרות אחרונות של כרטיס האשראי',
  type: 'סוג עסקה',
  chgDate: 'תאריך חיוב',
} as const;

const DISCOUNT = {
  card: 'כרטיס',
  desc: 'בית עסק',
  date: 'תאריך עסקה',
  amt: 'סכום העסקה',
  chg: 'סכום החיוב',
} as const;
const DISCOUNT_MORE = {
  type: 'סוג העסקה',
  detail: 'פירוט',
  chgDate: 'תאריך החיוב',
} as const;

const TOTALS = { month: 'חודש חיוב', count: 'מספר עסקאות', sum: 'סכום החיוב בשח' } as const;

type Header<K extends string, O extends string> = {
  readonly row: number;
  readonly col: Readonly<Record<K, number>>;
  /** Optional columns: -1 where the sheet has none. */
  readonly more: Readonly<Record<O, number>>;
};

/** Where a sheet's header row is - every required name in it - and where each named column sits, or undefined. */
function findHeader<K extends string, O extends string = never>(
  rows: readonly (readonly Cell[])[],
  names: Readonly<Record<K, string>>,
  optional: Readonly<Record<O, string>> = {} as Record<O, string>,
  scan = 30,
): Header<K, O> | undefined {
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
    if (!all) continue;
    const more = Object.fromEntries(
      (Object.entries(optional) as [O, string][]).map(([key, name]) => [key, cells.indexOf(norm(name))]),
    ) as Record<O, number>;
    return { row: r, col: col as Record<K, number>, more };
  }
  return undefined;
}

const isTotals = (sheet: SheetInput): boolean => findHeader(sheet.rows, TOTALS) !== undefined;
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

/** A card's last four digits from a cell: "0088", "ויזה 1234". */
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

/** A date cell: printed text, or the serial number a re-saved workbook keeps. */
const dateOf = (cell: Cell | undefined, anchor: LocalDate, date1904: boolean): LocalDate | undefined => {
  if (typeof cell === 'number') return dateFromExcelSerial(cell, date1904);
  return typeof cell === 'string' ? parseStatementDate(cell, anchor)?.date : undefined;
};

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
 * foreign-unknown: the charge is the amount. So is a plan's payment: its
 * original is the whole deal, and a rate taken from deal and payment would
 * save the deal at one payment's cost.
 */
function settle(input: {
  readonly charged: number | undefined;
  readonly chargedCurrency: Currency | undefined;
  readonly original: number | undefined;
  readonly originalCurrency: Currency | undefined;
  readonly plan: boolean;
}): Money {
  const { charged, chargedCurrency, original, originalCurrency } = input;
  const flags: Flag[] = [];
  if (chargedCurrency === undefined) flags.push('currency_unknown');
  const signed = charged ?? original;
  const kind = signed !== undefined && signed < 0 ? 'income' : 'expense';
  if (
    !input.plan &&
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

/**
 * A plan's total: the deal's amount, when it is in the payment's own
 * currency. A credit deal's payments carry interest on top of the price, so
 * its total is left to the payments (payment × count, flagged as worked out).
 */
function withTotal(
  plan: Omit<FoundPlan, 'totalMinor'> | undefined,
  money: Money,
  original: number | undefined,
  originalCurrency: Currency | undefined,
): FoundPlan | null {
  if (plan === undefined) return null;
  return plan.mode !== 'credit' &&
    original !== undefined &&
    original !== 0 &&
    originalCurrency === money.currency
    ? { ...plan, totalMinor: Math.abs(original) }
    : plan;
}

const at = (row: readonly Cell[], column: number): Cell | undefined =>
  column === -1 ? undefined : row[column];

function readMaxSheet(
  sheet: SheetInput,
  s: number,
  ctx: ReaderContext,
): { block: KnownBlock; drafts: Draft[] } {
  const header = findHeader(sheet.rows, MAX, MAX_MORE);
  /* c8 ignore next -- only called on a sheet whose header was found */
  if (header === undefined) throw new Error('not a Max sheet');
  const { col, more } = header;
  const sheetCard = titleCard(sheet.rows, header.row);
  const wallet = sheet.name.includes('ארנק');
  const drafts: Draft[] = [];
  sheet.rows.slice(header.row + 1).forEach((row, i) => {
    const raw = text(row[col.desc]);
    const date = dateOf(row[col.date], ctx.anchor, sheet.date1904);
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
    const type = text(at(row, more.type));
    const notes = text(row[col.notes]);
    const planText = planFromText(notes);
    const money = settle({
      charged,
      chargedCurrency,
      original,
      originalCurrency,
      plan: planText !== undefined,
    });
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
        chargeDate: text(at(row, more.chgDate)),
        plan,
        l4: lastFour(at(row, more.card)) || sheetCard,
        sector: text(at(row, more.sector)),
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
/** How far apart, in days, a currency purchase and what it paid for may be. */
const FX_WINDOW = 45;
/** The most wallet purchases one currency purchase is tried against. */
const FX_CANDIDATES = 12;

/** The smallest set of `amounts` that adds up to `target` exactly, as indexes - or undefined. */
function exactSubset(amounts: readonly number[], target: number): number[] | undefined {
  let best: number[] | undefined;
  for (let mask = 1; mask < 1 << amounts.length; mask += 1) {
    const picked: number[] = [];
    let total = 0;
    amounts.forEach((amount, i) => {
      if ((mask & (1 << i)) !== 0) {
        picked.push(i);
        total += amount;
      }
    });
    if (total === target && (best === undefined || picked.length < best.length)) best = picked;
  }
  return best;
}

/**
 * Max's FX wallet shows one foreign purchase three times: the shekels that
 * bought the currency (local sheet, "רכישת מט"ח", its amount in "הערות"), the
 * purchase itself (wallet sheet, in the currency), and the wallet paying the
 * card back for it (wallet sheet, a credit of the same amount).
 *
 * When the wallet purchases a currency purchase paid for add up to exactly
 * the currency it bought - one purchase, or several - those purchases are
 * kept at the shekels it cost, shared by their amounts, and the currency
 * purchase and the purchases' wallet credits are dropped. Anything that does
 * not add up - currency bought in an earlier export, or not all spent yet -
 * is left as Max prints it: the shekels as spent, and each wallet purchase
 * with its credit, which net to nothing.
 */
function foldWallet(drafts: readonly Draft[]): Draft[] {
  const dropped = new Set<string>();
  const folded = new Map<string, NonNullable<FoundRow['charged']>>();
  const purchases = drafts.filter((d) => d.wallet && d.row.kind === 'expense' && d.row.date !== undefined);
  const buys = drafts.filter(
    (d) =>
      !d.wallet &&
      d.row.kind === 'expense' &&
      d.row.description.includes('רכישת מט') &&
      d.row.date !== undefined,
  );
  for (const buy of buys) {
    const [, code, amount] = FX_NOTE.exec(buy.notes) ?? [];
    const buyDate = buy.row.date;
    if (code === undefined || amount === undefined || buyDate === undefined) continue;
    const bought = parseStatementAmount(amount, code, '.');
    if (bought === undefined || buy.row.amountMinor === undefined || buy.row.currency === undefined) continue;
    const candidates = purchases
      .filter(
        (p) =>
          !folded.has(p.row.id) &&
          p.row.currency === code &&
          p.row.amountMinor !== undefined &&
          p.row.date !== undefined &&
          Math.abs(daysBetween(buyDate, p.row.date)) <= FX_WINDOW,
      )
      .sort(
        (a, b) =>
          Math.abs(daysBetween(buyDate, a.row.date ?? buyDate)) -
          Math.abs(daysBetween(buyDate, b.row.date ?? buyDate)),
      )
      .slice(0, FX_CANDIDATES);
    const subset = exactSubset(
      candidates.map((p) => p.row.amountMinor ?? 0),
      bought,
    );
    if (subset === undefined) continue;
    const cost = buy.row.amountMinor;
    let left = cost;
    subset.forEach((index, n) => {
      const purchase = candidates[index];
      /* c8 ignore next -- an index the subset took from these candidates */
      if (purchase === undefined) return;
      const share =
        n === subset.length - 1 ? left : prorateMinor(cost, purchase.row.amountMinor ?? 0, bought);
      left -= share;
      folded.set(purchase.row.id, { minor: share, currency: buy.row.currency ?? 'ILS' });
    });
    dropped.add(buy.row.id);
  }
  // Each folded purchase's own wallet credit: the same amount back, after it.
  for (const purchase of purchases) {
    if (!folded.has(purchase.row.id)) continue;
    const date = purchase.row.date ?? '';
    const credit = drafts.find(
      (d) =>
        d.wallet &&
        d.row.kind === 'income' &&
        !dropped.has(d.row.id) &&
        (d.row.description.includes('ארנק') || d.type.includes('ארנק')) &&
        d.row.currency === purchase.row.currency &&
        d.row.amountMinor === purchase.row.amountMinor &&
        d.row.date !== undefined &&
        daysBetween(date as LocalDate, d.row.date) >= 0 &&
        daysBetween(date as LocalDate, d.row.date) <= 31,
    );
    if (credit !== undefined) dropped.add(credit.row.id);
  }
  return drafts
    .filter((d) => !dropped.has(d.row.id))
    .map((d) => {
      const cost = folded.get(d.row.id);
      return cost === undefined ? d : { ...d, row: { ...d.row, charged: cost } };
    });
}

/**
 * A loan's disbursement - the card company's loan paid out, a credit of its
 * whole principal on the day its payments start from - is the loan coming in,
 * not income: the loan is added from its payments.
 */
function markDisbursements(drafts: readonly Draft[]): FoundRow[] {
  const loanKey = (row: FoundRow, total: number | undefined) =>
    [row.wire.l4, row.date ?? '', merchantKey(row.description), total ?? ''].join('|');
  const loans = new Set(
    drafts
      .filter((d) => d.row.plan?.mode === 'loan' && d.row.plan.totalMinor !== undefined)
      .map((d) => loanKey(d.row, d.row.plan?.totalMinor)),
  );
  return drafts.map((d) =>
    d.row.kind === 'income' &&
    d.row.plan === null &&
    d.type.includes('הלוואה') &&
    loans.has(loanKey(d.row, d.row.amountMinor))
      ? withFlags(d.row, 'loan_disbursement')
      : d.row,
  );
}

const merchantKey = (description: string): string => description.replace(/[\s"״'׳.,-]+/g, '').toLowerCase();

/** A payment close enough to the plan's own to be one of its payments: within a tenth. */
const paymentLike = (amount: number | undefined, lead: number | undefined): boolean =>
  amount !== undefined && lead !== undefined && Math.abs(amount - lead) * 10 <= lead;

/**
 * A deal's payments, across every file of an import, as one plan: rows of
 * the same card, purchase date, merchant, kind, count and total whose amount
 * is the plan's payment, give or take rounding, are payments of it. The
 * earliest payment found carries the plan; the rest are marked as part of it.
 *
 * A row of the same deal that is not a payment - a correction Max labels
 * "N of N", an interest adjustment, a credit back - is no plan of its own:
 * it is added as the amount it is, noted.
 */
export function groupPlans(rows: readonly FoundRow[]): FoundRow[] {
  const keyOf = (row: FoundRow, plan: FoundPlan) =>
    [
      row.wire.l4,
      row.date ?? '',
      merchantKey(row.description),
      plan.mode,
      plan.count,
      plan.totalMinor ?? '',
    ].join('|');
  const groups = new Map<string, FoundRow[]>();
  for (const row of rows) {
    if (row.plan === null || row.date === undefined) continue;
    const key = keyOf(row, row.plan);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const lead = new Map<string, FoundRow>();
  for (const [key, members] of groups) {
    // The plan is the deal's own direction: an expense deal is led by an expense.
    const kind = members.some((r) => r.kind === 'expense') ? 'expense' : 'income';
    const first = members
      .filter((r) => r.kind === kind)
      .reduce((a, b) => ((b.plan?.number ?? 0) < (a.plan?.number ?? 0) ? b : a));
    lead.set(key, first);
  }
  return rows.map((row) => {
    if (row.plan === null || row.date === undefined) return row;
    const first = lead.get(keyOf(row, row.plan));
    if (first === undefined || first === row) return row;
    if (row.kind === first.kind && paymentLike(row.amountMinor, first.amountMinor)) {
      return withFlags(row, 'plan_in_import');
    }
    return withFlags({ ...row, plan: null, wire: { ...row.wire, pl: null } }, 'plan_adjustment');
  });
}

function readMax(sheets: readonly SheetInput[], ctx: ReaderContext): KnownRead {
  const blocks: { block: KnownBlock; drafts: Draft[] }[] = [];
  const rest: number[] = [];
  sheets.forEach((sheet, s) => {
    if (isMax(sheet)) blocks.push(readMaxSheet(sheet, s, ctx));
    else rest.push(s);
  });
  const rows = markDisbursements(foldWallet(blocks.flatMap((b) => b.drafts)));
  return {
    format: 'max',
    blocks: blocks.map(({ block }) => ({
      ...block,
      rows: rows.filter((row) => row.id.startsWith(`f${String(ctx.file)}s${String(block.sheet)}r`)),
    })),
    rest,
  };
}

function readDiscountSheet(sheet: SheetInput, s: number, ctx: ReaderContext): KnownBlock {
  const header = findHeader(sheet.rows, DISCOUNT, DISCOUNT_MORE);
  /* c8 ignore next -- only called on a sheet whose header was found */
  if (header === undefined) throw new Error('not a Discount sheet');
  const { col, more } = header;
  const rows: FoundRow[] = [];
  const hasFormats = sheet.formats !== undefined;
  sheet.rows.slice(header.row + 1).forEach((row, i) => {
    const r = header.row + 1 + i;
    const date = dateOf(row[col.date], ctx.anchor, sheet.date1904);
    const amountText = text(row[col.amt]);
    const chargedText = text(row[col.chg]);
    // Neither a date nor an amount: a title, a total line, the footer.
    if (date === undefined && (amountText === '' || amountText === '--') && chargedText === '') return;
    const formats = sheet.formats?.[r] ?? [];
    const chargedCurrency = formatCurrency(formats[col.chg], ctx.base, ctx.known);
    const charged = chargedCurrency === undefined ? undefined : cellMinor(row[col.chg], chargedCurrency);
    // Without formats the amount's currency cannot be known: the charge, in the base, is what is certain.
    const originalCurrency = hasFormats ? formatCurrency(formats[col.amt], ctx.base, ctx.known) : undefined;
    const original =
      originalCurrency === undefined || amountText === '--'
        ? undefined
        : cellMinor(row[col.amt], originalCurrency);
    const detail = text(at(row, more.detail));
    /*
     * "תשלום N מתוך M" says so; a bare "N/M" only when the deal and this
     * charge differ in one currency - "4/12" in a standing order's note is
     * no plan.
     */
    const dealDiffers =
      original !== undefined &&
      charged !== undefined &&
      originalCurrency === chargedCurrency &&
      Math.abs(original) !== Math.abs(charged);
    const planText = planFromText(detail) ?? (dealDiffers ? slashPlan(detail) : undefined);
    const money = settle({
      charged,
      chargedCurrency,
      original,
      originalCurrency,
      plan: planText !== undefined,
    });
    rows.push(
      found(`f${String(ctx.file)}s${String(s)}r${String(i)}`, ctx, money, {
        date,
        dateText: text(row[col.date]),
        description: text(row[col.desc]),
        amountText,
        currencyText: null,
        chargedText,
        chargedCurrencyText: null,
        chargeDate: text(at(row, more.chgDate)),
        plan: withTotal(planText, money, original, originalCurrency),
        l4: lastFour(row[col.card]),
        sector: '',
      }),
    );
  });
  return { sheet: s, header: sheet.rows.slice(header.row, header.row + 3), rows };
}

/**
 * The workbook read by the reader that knows it, or undefined when none
 * does. A totals-only summary is known too, and gives nothing. A deal's
 * payments are made one plan by `groupPlans`, over the whole import.
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
