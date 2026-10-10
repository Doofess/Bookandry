import { addDays, compareLocal, daysBetween, parseStatementDate } from '@/lib/dates';
import { parseStatementAmount } from '@/lib/money';
import type { Currency, LocalDate } from '@/types/money';

import type { WireRow, WireTotal } from './import-wire';
import { isMcc } from './mcc';

/**
 * The mistake-correction stage of "Smart import": what the model transcribed,
 * read into money and dates by the app's own parsers, and checked.
 *
 * The model is asked to copy text, never to compute, so every number here is
 * one the app read itself - and every check is something the app can see:
 *  - the text parses at all, as an amount, a date, a currency;
 *  - for a text source, the amount is really printed in it;
 *  - two independent reads of an image agree;
 *  - the rows add up to the total the document prints.
 * A row that fails is not dropped: it is shown, unticked, with the reason.
 */

/** Why a found row needs a look before it is added. */
export type Flag =
  | 'amount_unreadable'
  | 'date_unreadable'
  | 'currency_unknown'
  | 'amount_not_in_source'
  | 'date_inferred'
  | 'date_out_of_range'
  | 'reads_disagree'
  | 'one_read_only'
  | 'pending'
  | 'twice_in_document'
  | 'in_another_file'
  | 'already_added'
  | 'already_plan'
  /** Another payment of a deal this import already adds as one plan, or a loan's own disbursement. */
  | 'plan_in_import'
  /** A row of a plan's deal that is not one of its payments - a correction, an interest adjustment: added as it is. */
  | 'plan_adjustment'
  /** A card company's loan paid out: the loan coming in, not income - it is added from its payments. */
  | 'loan_disbursement'
  /** The same amount a day or two away, on another card: noted, in case it is the same purchase saved under the wrong card. */
  | 'similar_other_card'
  | 'card_fee_counted'
  | 'total_estimated'
  | 'total_mismatch'
  | 'not_saveable'
  | 'rate_missing'
  | 'whose_unknown'
  /** Cash taken out (6010, 6011): not an expense in an import. Left out until the person keeps it. */
  | 'cash_withdrawal';

/** Flags that leave a row unticked: it is not added unless the person says so. */
export const BLOCKING: ReadonlySet<Flag> = new Set<Flag>([
  'amount_unreadable',
  'date_unreadable',
  'currency_unknown',
  'amount_not_in_source',
  'date_out_of_range',
  'reads_disagree',
  'one_read_only',
  'pending',
  'in_another_file',
  'already_added',
  'already_plan',
  'plan_in_import',
  'loan_disbursement',
  'card_fee_counted',
  'not_saveable',
  'rate_missing',
  'whose_unknown',
  'cash_withdrawal',
]);

export type FoundPlan = {
  readonly mode: 'installments' | 'credit' | 'loan';
  /** This payment's number, and the count. */
  readonly number: number;
  readonly count: number;
  /** The deal's whole amount when the document prints it. */
  readonly totalMinor?: number;
};

/** One transaction found in a file, read and checked. */
export type FoundRow = {
  readonly id: string;
  /** Which picked file, and the page or part of it. */
  readonly file: number;
  readonly part: number | null;
  readonly kind: 'expense' | 'income';
  readonly date: LocalDate | undefined;
  /** Positive; which way the money went is `kind`. */
  readonly amountMinor: number | undefined;
  readonly currency: Currency | undefined;
  /** What the card charged, in which currency - a foreign purchase on an Israeli statement. */
  readonly charged?: { readonly minor: number; readonly currency: Currency };
  readonly description: string;
  readonly categoryAlias: string | null;
  readonly methodAlias: string | null;
  readonly plan: FoundPlan | null;
  /**
   * The card the whole file is for - a statement of one card - when the row
   * itself does not say: how it is charged to that card.
   */
  readonly statementCard?: { readonly label: string; readonly lastDigits?: string };
  readonly cardFee: boolean;
  readonly flags: readonly Flag[];
  /** What was transcribed, kept for a second look. */
  readonly wire: WireRow;
  /** The business type the file's MCC column gave, when the list has it. */
  readonly fileMcc?: string;
  /** The card company's business sector (ענף), as printed. */
  readonly sector?: string;
  /**
   * The business type the reader gave - for a PDF or image row, transcribed
   * or guessed (spec point 7); for a sheet row, Claude's answer for its
   * merchant (Task 8). Only a code the list has.
   */
  readonly aiMcc?: string;
  /** What the other read said, when the two disagree. */
  readonly otherRead?: FoundRow;
};

const CURRENCY_WORDS: readonly (readonly [RegExp, Currency])[] = [
  [/₪|ש["״'׳]{0,2}ח|\bnis\b|\bils\b|שקל/i, 'ILS'],
  [/\$|\busd\b|דולר/i, 'USD'],
  [/€|\beur\b|יורו/i, 'EUR'],
  [/£|\bgbp\b|ליש["״]?ט|פאונד/i, 'GBP'],
];

/**
 * The currency a printed mark means, or undefined when it is none the app
 * knows. Nothing printed is the document's own currency, `fallback`.
 */
export function currencyFromText(
  text: string | null,
  fallback: Currency,
  known: ReadonlySet<Currency>,
): Currency | undefined {
  if (text === null || text.trim() === '') return fallback;
  for (const [pattern, currency] of CURRENCY_WORDS) if (pattern.test(text)) return currency;
  const code = /\b([A-Z]{3})\b/.exec(text.toUpperCase())?.[1];
  return code !== undefined && known.has(code) ? code : undefined;
}

/** Words that mark money coming back or in, wherever they are printed. */
const CREDIT_WORDS = /זיכוי|החזר|ביטול|refund|credit|reversal/i;

export type ReadContext = {
  readonly file: number;
  /** The document's currency when a row prints none: the base. */
  readonly base: Currency;
  readonly known: ReadonlySet<Currency>;
  /** When the file was made, for dates with no year. */
  readonly anchor: LocalDate;
  readonly today: LocalDate;
  readonly period?: { readonly from: LocalDate; readonly to: LocalDate };
};

/**
 * One transcribed row, read by the app's parsers. Signs are read, not
 * trusted: a negative amount, or a credit word, on an expense makes it money
 * coming back.
 */
export function readRow(wire: WireRow, id: string, ctx: ReadContext): FoundRow {
  const flags: Flag[] = [];
  const currency = currencyFromText(wire.c, ctx.base, ctx.known);
  if (currency === undefined) flags.push('currency_unknown');
  const signed = currency === undefined ? undefined : parseStatementAmount(wire.a, currency);
  if (signed === undefined && currency !== undefined) flags.push('amount_unreadable');

  const parsedDate = parseStatementDate(wire.d, ctx.anchor, ctx.period);
  if (parsedDate === undefined) flags.push('date_unreadable');
  else {
    if (parsedDate.inferred) flags.push('date_inferred');
    const latest = addDays(ctx.today, 31);
    const earliest = ctx.period?.from ?? addDays(ctx.today, -731);
    if (compareLocal(parsedDate.date, latest) > 0 || compareLocal(parsedDate.date, earliest) < 0) {
      flags.push('date_out_of_range');
    }
  }

  const credit =
    (signed !== undefined && signed < 0) ||
    (wire.sg !== null && (wire.sg.includes('-') || CREDIT_WORDS.test(wire.sg)));
  const kind: FoundRow['kind'] = wire.k === 'i' || credit ? 'income' : 'expense';

  const chargedCurrency = wire.ca === null ? undefined : currencyFromText(wire.cc, ctx.base, ctx.known);
  const chargedSigned =
    wire.ca === null || chargedCurrency === undefined
      ? undefined
      : parseStatementAmount(wire.ca, chargedCurrency);

  const totalCurrency = currency ?? ctx.base;
  const total =
    wire.pl?.tot === null || wire.pl === null ? undefined : parseStatementAmount(wire.pl.tot, totalCurrency);
  if (wire.pl !== null && wire.st === 'posted' && total === undefined && wire.pl.tot !== null)
    flags.push('amount_unreadable');
  if (wire.st === 'pending') flags.push('pending');

  return {
    id,
    file: ctx.file,
    part: wire.p,
    kind,
    date: parsedDate?.date,
    amountMinor: signed === undefined ? undefined : Math.abs(signed),
    currency,
    ...(chargedSigned === undefined || chargedCurrency === undefined || chargedCurrency === currency
      ? {}
      : { charged: { minor: Math.abs(chargedSigned), currency: chargedCurrency } }),
    description: wire.m,
    categoryAlias: wire.cat,
    methodAlias: wire.pm,
    plan:
      wire.pl === null
        ? null
        : {
            mode: wire.pl.md,
            number: wire.pl.n,
            count: wire.pl.of,
            ...(total === undefined ? {} : { totalMinor: Math.abs(total) }),
          },
    cardFee: wire.fee,
    flags,
    wire,
    // An expense's only: money coming back has no business type, whatever the reader said.
    ...(kind === 'expense' && isMcc(wire.mcc) ? { aiMcc: wire.mcc } : {}),
    ...(wire.sec === undefined || wire.sec === '' ? {} : { sector: wire.sec }),
  };
}

/** A row with more flags. */
export const withFlags = (row: FoundRow, ...more: Flag[]): FoundRow => ({
  ...row,
  flags: [...new Set([...row.flags, ...more])],
});

/** A row with flags taken off - when a later check settles them. */
export const withoutFlags = (row: FoundRow, ...gone: Flag[]): FoundRow => ({
  ...row,
  flags: row.flags.filter((f) => !gone.includes(f)),
});

/** Every number printed in a text, as money in `currency`. */
function amountsIn(text: string, currency: Currency): Set<number> {
  const found = new Set<number>();
  for (const token of text.match(/\d[\d.,]*/g) ?? []) {
    const value = parseStatementAmount(token.replace(/[.,]+$/, ''), currency);
    if (value !== undefined) found.add(Math.abs(value));
  }
  return found;
}

/**
 * Grounding for a text source: the row's amount must be a number printed in
 * the text - compared as money, not as characters, so "1,234.50" in the row
 * finds "1234.50" in the file, and a Hebrew text layer that reversed the
 * order of a line still has its numbers whole.
 */
export function groundInText(rows: readonly FoundRow[], text: string): FoundRow[] {
  const cache = new Map<Currency, Set<number>>();
  return rows.map((row) => {
    if (row.amountMinor === undefined || row.currency === undefined) return row;
    let printed = cache.get(row.currency);
    if (printed === undefined) {
      printed = amountsIn(text, row.currency);
      cache.set(row.currency, printed);
    }
    const ok = printed.has(row.amountMinor) && (row.charged === undefined || printed.has(row.charged.minor));
    return ok ? row : withFlags(row, 'amount_not_in_source');
  });
}

/**
 * Two independent reads of the same image, matched row to row: same file,
 * the same amount exactly, dates within a day. Greedy and in order, which is
 * how both reads list a statement.
 */
export function alignReads(
  first: readonly FoundRow[],
  second: readonly FoundRow[],
): {
  readonly pairs: readonly (readonly [FoundRow, FoundRow])[];
  readonly onlyFirst: FoundRow[];
  readonly onlySecond: FoundRow[];
} {
  const used = new Set<number>();
  const pairs: [FoundRow, FoundRow][] = [];
  const onlyFirst: FoundRow[] = [];
  for (const row of first) {
    const index = second.findIndex(
      (other, i) =>
        !used.has(i) &&
        other.file === row.file &&
        other.amountMinor !== undefined &&
        other.amountMinor === row.amountMinor &&
        row.date !== undefined &&
        other.date !== undefined &&
        Math.abs(daysBetween(row.date, other.date)) <= 1,
    );
    const match = second[index];
    if (match === undefined) onlyFirst.push(row);
    else {
      used.add(index);
      pairs.push([row, match]);
    }
  }
  return { pairs, onlyFirst, onlySecond: second.filter((_, i) => !used.has(i)) };
}

/** Which fields two reads of the same row disagree on. */
export function disagreements(a: FoundRow, b: FoundRow): string[] {
  const out: string[] = [];
  if (a.date !== b.date) out.push('date');
  if (a.kind !== b.kind) out.push('kind');
  if (a.currency !== b.currency) out.push('currency');
  if ((a.charged?.minor ?? null) !== (b.charged?.minor ?? null)) out.push('charged');
  if (
    (a.plan?.count ?? null) !== (b.plan?.count ?? null) ||
    (a.plan?.number ?? null) !== (b.plan?.number ?? null)
  ) {
    out.push('plan');
  }
  return out;
}

/**
 * Settle two reads: rows both found alike are trusted; rows they read
 * differently, or only one of them found, are flagged for the person (or a
 * third look). The first read's version is kept, the second shown beside it.
 */
export function combineReads(first: readonly FoundRow[], second: readonly FoundRow[]): FoundRow[] {
  const { pairs, onlyFirst, onlySecond } = alignReads(first, second);
  const out: FoundRow[] = [];
  for (const [a, b] of pairs) {
    out.push(disagreements(a, b).length === 0 ? a : { ...withFlags(a, 'reads_disagree'), otherRead: b });
  }
  for (const row of onlyFirst) out.push(withFlags(row, 'one_read_only'));
  for (const row of onlySecond) out.push(withFlags({ ...row, id: `${row.id}b` }, 'one_read_only'));
  return out;
}

/** What a row adds to its statement's total, as the statement counts it: charges up, credits down. */
function statementMinor(row: FoundRow, currency: Currency): number | undefined {
  const own =
    row.charged?.currency === currency
      ? row.charged.minor
      : row.currency === currency
        ? row.amountMinor
        : undefined;
  if (own === undefined) return undefined;
  return row.kind === 'income' ? -own : own;
}

export type Reconciliation = {
  readonly file: number;
  /** The printed total the rows were held to. */
  readonly totalMinor: number;
  readonly currency: Currency;
  readonly sumMinor: number;
  /** total \u2212 sum: what the rows are short of the document. */
  readonly differenceMinor: number;
  /** Rows the difference points at, with what it suggests about them. */
  readonly suspects: readonly {
    readonly id: string;
    readonly hint: 'missing_or_duplicated' | 'decimal_shift' | 'digits';
  }[];
};

/**
 * Hold each file's rows to the totals it prints. A file whose rows add up to
 * any of its totals reconciles; otherwise the closest total is reported with
 * the rows the difference points at:
 *  - the difference IS one row's amount: that row is missing or doubled;
 *  - it is 9 or 0.9 times a row's amount: a decimal point moved in that row;
 *  - it is a multiple of 9 (in minor units): two digits were swapped somewhere.
 * Pending rows are not on a statement's bill and are left out of the sum.
 */
export function reconcile(
  rows: readonly FoundRow[],
  totals: readonly (WireTotal & { readonly file: number })[],
  ctx: { readonly base: Currency; readonly known: ReadonlySet<Currency> },
): Reconciliation[] {
  const out: Reconciliation[] = [];
  const files = [...new Set(totals.map((t) => t.file))];
  for (const file of files) {
    const candidates = totals
      .filter((t) => t.file === file)
      .map((t) => {
        const currency = currencyFromText(t.c, ctx.base, ctx.known);
        const minor = currency === undefined ? undefined : parseStatementAmount(t.a, currency);
        return currency === undefined || minor === undefined
          ? undefined
          : { currency, minor: Math.abs(minor) };
      })
      .filter((t): t is { currency: Currency; minor: number } => t !== undefined);
    if (candidates.length === 0) continue;
    const own = rows.filter((r) => r.file === file && !r.flags.includes('pending'));
    let best: Reconciliation | undefined;
    for (const total of candidates) {
      const sumMinor = own.reduce((sum, r) => sum + (statementMinor(r, total.currency) ?? 0), 0);
      const differenceMinor = total.minor - sumMinor;
      const result: Reconciliation = {
        file,
        totalMinor: total.minor,
        currency: total.currency,
        sumMinor,
        differenceMinor,
        suspects: [],
      };
      if (differenceMinor === 0) {
        best = result;
        break;
      }
      if (best === undefined || Math.abs(differenceMinor) < Math.abs(best.differenceMinor)) best = result;
    }
    if (best === undefined) continue;
    out.push(
      best.differenceMinor === 0
        ? best
        : { ...best, suspects: locate(own, best.differenceMinor, best.currency) },
    );
  }
  return out;
}

function locate(
  rows: readonly FoundRow[],
  difference: number,
  currency: Currency,
): Reconciliation['suspects'] {
  const gap = Math.abs(difference);
  const suspects: { id: string; hint: Reconciliation['suspects'][number]['hint'] }[] = [];
  for (const row of rows) {
    const amount = Math.abs(statementMinor(row, currency) ?? 0);
    if (amount === 0) continue;
    if (amount === gap) suspects.push({ id: row.id, hint: 'missing_or_duplicated' });
    else if (gap === amount * 9 || gap * 10 === amount * 9)
      suspects.push({ id: row.id, hint: 'decimal_shift' });
  }
  if (suspects.length === 0 && gap % 9 === 0) {
    for (const row of rows) suspects.push({ id: row.id, hint: 'digits' });
  }
  return suspects;
}
