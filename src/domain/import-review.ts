import { daysBetween, parseLocalDate } from '@/lib/dates';
import { rateFromAmounts, toDecimalString } from '@/lib/money';
import type { Occurrence, PaymentMethod } from '@/types/domain';
import type { Currency, LocalDate, RateString } from '@/types/money';

import { chargesFeeIn } from './cards';
import { withFlags, type Flag, type FoundRow } from './import-check';
import { defaultFormValues, NOTE_MAX_LENGTH, type TxFormValues } from './tx-form';

/**
 * What "Smart import" found, made ready for the person to review: rows read
 * twice where screenshots overlap folded into one, rows already in the
 * household flagged, and each row turned into the same form values a person
 * would have typed - so it is saved through the very same path.
 */

/*
 * A plan's payments are one deal's rows, equal in amount, date and merchant
 * and told apart by their number: the number is part of the key, or the
 * deal's payments in two files would fold into each other.
 */
const key = (row: FoundRow): string =>
  `${String(row.amountMinor ?? '')}|${row.date ?? ''}|${row.description.replace(/\s+/g, ' ').trim().toLowerCase()}|${
    row.plan === null ? '' : `${row.plan.mode}:${String(row.plan.number)}/${String(row.plan.count)}`
  }`;

/**
 * Overlapping screenshots, and the same transaction in two files.
 *
 * Two screenshots of one scrolling list share the rows at their seam: the
 * longest run at the end of one part that the next part starts with is the
 * same rows seen twice, and only that run is folded away. Anything else that
 * repeats across files is flagged, not dropped - two coffees of the same price
 * on the same day are real - and a row that repeats inside one document is
 * kept and merely noted.
 */
export function collapseOverlaps(rows: readonly FoundRow[]): FoundRow[] {
  const groups = new Map<string, FoundRow[]>();
  for (const row of rows) {
    const id = `${String(row.file)}#${String(row.part ?? 0)}`;
    const list = groups.get(id);
    if (list === undefined) groups.set(id, [row]);
    else list.push(row);
  }
  const ordered = [...groups.values()];
  const dropped = new Set<string>();
  for (let g = 1; g < ordered.length; g += 1) {
    const before = (ordered[g - 1] ?? []).filter((row) => !dropped.has(row.id));
    const after = ordered[g] ?? [];
    for (let run = Math.min(before.length, after.length); run > 0; run -= 1) {
      const tail = before.slice(-run).map(key);
      if (after.slice(0, run).every((row, i) => key(row) === tail[i])) {
        for (const row of after.slice(0, run)) dropped.add(row.id);
        break;
      }
    }
  }

  const kept = rows.filter((row) => !dropped.has(row.id));
  const firstFile = new Map<string, number>();
  const perSource = new Map<string, number>();
  for (const row of kept) {
    if (!firstFile.has(key(row))) firstFile.set(key(row), row.file);
    const sourceKey = `${String(row.file)}|${key(row)}`;
    perSource.set(sourceKey, (perSource.get(sourceKey) ?? 0) + 1);
  }
  return kept.map((row) => {
    if (firstFile.get(key(row)) !== row.file) return withFlags(row, 'in_another_file');
    return (perSource.get(`${String(row.file)}|${key(row)}`) ?? 0) > 1
      ? withFlags(row, 'twice_in_document')
      : row;
  });
}

/** What a row or an occurrence says about the card or payment method it was paid with. */
type Paid = { readonly id?: string; readonly digits?: string };

/**
 * Two sides that each name a card, and not the same one. The printed digits
 * decide when both sides have them - a card archived and added again, or
 * renamed, is still the card with those digits; the payment methods decide
 * only when one side has no digits.
 */
function differentCards(a: Paid, b: Paid): boolean {
  if (a.digits !== undefined && b.digits !== undefined) return a.digits !== b.digits;
  return a.id !== undefined && b.id !== undefined && a.id !== b.id;
}

const sameCard = (a: Paid, b: Paid): boolean =>
  a.digits !== undefined && b.digits !== undefined
    ? a.digits === b.digits
    : a.id !== undefined && a.id === b.id;

const words = (name: string): string[] =>
  name
    .toLowerCase()
    .replace(/בע["״'׳]?\s?מ/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((w) => w !== '');

/**
 * Whether two merchant names could be one merchant: one inside the other, or
 * a word of three letters or more in common - so two issuers' spellings of one
 * shop ("קפה רוזה", "ק.רוזה בע"מ") are one. A side with no name is no evidence.
 */
export function sameMerchant(a: string, b: string): boolean {
  const left = words(a);
  const right = words(b);
  if (left.length === 0 || right.length === 0) return true;
  const joinedLeft = left.join('');
  const joinedRight = right.join('');
  if (joinedLeft.includes(joinedRight) || joinedRight.includes(joinedLeft)) return true;
  return left.some((w) => w.length >= 3 && right.includes(w));
}

/**
 * Rows the household already has: the same kind and amount within two days
 * of an occurrence - compared with what the occurrence is in either its own
 * currency or the base - and plan payments of a plan that is already there.
 *
 * With `cards`, what each side was paid with counts (the import-samples
 * study's dedupe design): a row on one card is never an occurrence on another
 * - a household uses two cards at the same shops, for the same amounts. On the
 * same card, a different day lets the merchant break the tie; the same day and
 * amount is enough. Where either side names no card, the match is as it was.
 */
export function flagExisting(
  rows: readonly FoundRow[],
  occurrences: readonly Occurrence[],
  cards?: {
    readonly methods: readonly PaymentMethod[];
    /** The household's payment method a row names, by its card's digits or its alias. */
    readonly methodOf: (row: FoundRow) => PaymentMethod | undefined;
  },
): FoundRow[] {
  /** A card's digits, when it has some: '' is none. */
  const digits = (method: PaymentMethod | undefined): Paid => {
    const last = method?.card?.lastDigits ?? '';
    return last === '' ? {} : { digits: last };
  };
  const occurrencePaid = (o: Occurrence): Paid =>
    cards === undefined || o.paymentMethodId === undefined || o.paymentMethodId === ''
      ? {}
      : { id: o.paymentMethodId, ...digits(cards.methods.find((m) => m.id === o.paymentMethodId)) };
  return rows.map((row) => {
    if (row.date === undefined || row.amountMinor === undefined) return row;
    const date = row.date;
    const method = cards?.methodOf(row);
    const printed = row.wire.l4 === '' ? (row.statementCard?.lastDigits ?? '') : row.wire.l4;
    const rowPaid: Paid =
      cards === undefined
        ? {}
        : {
            ...(method === undefined ? {} : { id: method.id }),
            ...(printed === '' ? digits(method) : { digits: printed }),
          };
    if (row.plan !== null) {
      const plan = row.plan;
      const existing = occurrences.some((o) => {
        const recurrence = o.transaction.recurrence;
        return (
          recurrence.type === 'monthly' &&
          recurrence.installments === plan.count &&
          !differentCards(rowPaid, occurrencePaid(o)) &&
          Math.abs(o.money.amountMinor - (row.amountMinor ?? 0)) <= plan.count &&
          Math.abs(daysBetween(o.transaction.date, date)) <= 3
        );
      });
      if (existing) return withFlags(row, 'already_plan');
    }
    const amounts = new Set(
      [row.amountMinor, row.charged?.minor].filter((n): n is number => n !== undefined),
    );
    const other = { card: false };
    const match = occurrences.some((o) => {
      if (
        o.isSkipped ||
        o.transaction.kind !== row.kind ||
        Math.abs(daysBetween(o.date, date)) > 2 ||
        !(amounts.has(o.money.amountMinor) || amounts.has(o.money.baseAmountMinor))
      ) {
        return false;
      }
      const paid = occurrencePaid(o);
      if (differentCards(rowPaid, paid)) {
        other.card = true;
        return false;
      }
      // The same card a day or two apart: two purchases of one price, unless the merchant is the same.
      if (sameCard(rowPaid, paid) && o.date !== date) {
        return sameMerchant(row.description, o.note ?? '');
      }
      return true;
    });
    if (match) return withFlags(row, 'already_added');
    // Not blocked: only noted, in case it is this purchase saved earlier under another card.
    return other.card ? withFlags(row, 'similar_other_card') : row;
  });
}

/**
 * A card's monthly fee the app already charges - a statement's fee line is
 * that, not a new expense. Only for the line's own month: an archived card's
 * fee stops after the month it was archived (`chargesFeeIn`), so a later line
 * is new, and a household whose only fee card has closed counts no fee at all.
 */
export function flagCardFees(
  rows: readonly FoundRow[],
  method: (row: FoundRow) => PaymentMethod | undefined,
  cards: readonly PaymentMethod[],
): FoundRow[] {
  return rows.map((row) => {
    if (!row.cardFee) return row;
    const own = method(row);
    const charged =
      own === undefined ? cards.some((c) => chargesFeeIn(c, row.date)) : chargesFeeIn(own, row.date);
    return charged ? withFlags(row, 'card_fee_counted') : row;
  });
}

export type Draft = {
  readonly values: TxFormValues;
  /** A rate the document itself gives - a foreign purchase with its shekel charge. */
  readonly rate?: { readonly rate: RateString; readonly rateDate: LocalDate; readonly rateSource: 'manual' };
  /** Flags the mapping adds: an estimated plan total. */
  readonly flags: readonly Flag[];
  /** The card's foreign-currency fee applies: the rate was looked up, not printed. */
  readonly needsRate: boolean;
};

/**
 * One found row as the form's values.
 *
 * Money the document states exactly is kept exactly:
 *  - a foreign purchase charged in the base currency keeps its original amount
 *    with the rate the two printed amounts imply, so its base amount IS the
 *    statement's charge - no looked-up rate, no fee added on top;
 *  - charged in some other currency, the charged amount is what is saved, and
 *    the original goes in the note;
 *  - an instalment row is one payment of a plan: the plan is saved whole,
 *    from its first payment, at the printed total - or the payment times the
 *    count, flagged as estimated.
 */
export function draftOf(
  row: FoundRow,
  ctx: {
    readonly profileId: string;
    readonly base: Currency;
    readonly today: LocalDate;
    readonly primeRate: string;
    readonly categoryId: string;
    readonly paymentMethodId: string;
  },
): Draft | undefined {
  if (row.date === undefined || row.amountMinor === undefined || row.currency === undefined) return undefined;
  const flags: Flag[] = [];
  let currency = row.currency;
  let amountMinor = row.amountMinor;
  let note = row.description;
  let rate: Draft['rate'];
  if (
    row.currency !== ctx.base &&
    row.charged !== undefined &&
    row.amountMinor > 0 &&
    row.charged.minor > 0
  ) {
    if (row.charged.currency === ctx.base) {
      rate = {
        rate: rateFromAmounts(row.amountMinor, row.currency, row.charged.minor, ctx.base),
        rateDate: row.date,
        rateSource: 'manual',
      };
    } else {
      note = `${row.description} (${toDecimalString(row.amountMinor, row.currency)} ${row.currency})`;
      currency = row.charged.currency;
      amountMinor = row.charged.minor;
    }
  }

  const base = defaultFormValues({
    profileId: ctx.profileId,
    currency,
    today: ctx.today,
    primeRate: ctx.primeRate,
  });
  const day = String(parseLocalDate(row.date).day);
  let planValues: Partial<TxFormValues> = {};
  if (row.plan?.mode === 'loan') {
    /*
     * A loan's repayments, interest and all: the statement prints this
     * payment, not the rate, and its total is usually what was lent. So the
     * payments are what is saved - at no further interest, they sum to
     * exactly what will be charged.
     */
    amountMinor *= row.plan.count;
    planValues = {
      mode: 'loan',
      installmentCount: String(row.plan.count),
      rateBasis: 'fixed',
      annualRate: '',
    };
  } else if (row.plan !== null) {
    const total = row.plan.totalMinor ?? amountMinor * row.plan.count;
    if (row.plan.totalMinor === undefined) flags.push('total_estimated');
    amountMinor = total;
    planValues = {
      mode: row.plan.mode,
      installmentCount: String(row.plan.count),
      annualRate: '',
    };
  }
  const values: TxFormValues = {
    ...base,
    kind: row.kind,
    categoryId: ctx.categoryId,
    paymentMethodId: row.kind === 'expense' ? ctx.paymentMethodId : '',
    amount: toDecimalString(amountMinor, currency),
    currency,
    date: row.date,
    dayOfMonth: day,
    note: note.slice(0, NOTE_MAX_LENGTH),
    ...planValues,
  };
  return {
    values,
    ...(rate === undefined ? {} : { rate }),
    flags,
    needsRate: currency !== ctx.base && rate === undefined,
  };
}
