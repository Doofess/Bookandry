import { compareLocal, endOfMonth, startOfMonth } from '@/lib/dates';
import { add, sum } from '@/lib/money';
import { CASH_METHOD_ID, type CashMove, type Occurrence, type Transaction } from '@/types/domain';
import type { LocalDate, Minor } from '@/types/money';

/**
 * How much of the balance is cash on hand (docs/superpowers/specs/2026-10-09-cash-deposit-design.md, section 2).
 *
 * Cash is PART of the balance, never added to it: cash income raises both,
 * paying cash lowers both, and moving money between the bank and the wallet
 * (a withdrawal, a deposit, the amount someone started with) moves only this
 * figure. So nothing here is ever summed into the balance, and nothing in the
 * balance is summed in here twice.
 *
 *   cash(person, today) =
 *       Σ start + Σ withdraw − Σ deposit            (live moves, start..today)
 *     + Σ income occurrences that went to cash      (start..today)
 *     − Σ expense occurrences paid in cash          (start..today)
 *
 * "start" is the person's FIRST start move: cash rows from before they set up
 * the tab never count, so years of old cash spending cannot drive the figure
 * negative. Amounts are each occurrence's base amount, as the balance uses.
 */

/** Where a recount files cash it found, and cash that was missing. */
export const CASH_FOUND_CATEGORY_ID = 'cat.cash_found';
export const CASH_MISSING_CATEGORY_ID = 'cat.cash_missing';

type CashLike = Pick<Occurrence, 'destinationId' | 'paymentMethodId'> & {
  readonly transaction: Pick<Transaction, 'kind'>;
};

/** Income that went to cash. */
export function isCashIn(o: CashLike): boolean {
  return o.transaction.kind === 'income' && o.destinationId === CASH_METHOD_ID;
}

/** Spending paid in cash. */
export function isCashOut(o: CashLike): boolean {
  return o.transaction.kind === 'expense' && o.paymentMethodId === CASH_METHOD_ID;
}

/** What one occurrence does to the cash: + in, − out, 0 for anything not cash. */
export function cashSigned(o: Occurrence): Minor {
  if (isCashIn(o)) return o.money.baseAmountMinor;
  if (isCashOut(o)) return -o.money.baseAmountMinor;
  return 0;
}

/** What one move does to the cash. */
export function moveSigned(move: Pick<CashMove, 'kind' | 'amountMinor'>): Minor {
  switch (move.kind) {
    case 'start':
    case 'withdraw':
      return move.amountMinor;
    case 'deposit':
      return -move.amountMinor;
    default:
      // 'count' is 0 by definition. A kind a later build added is not this
      // build's to sum: ignoring it is what lets that build add it safely.
      return 0;
  }
}

/** The day a person set up the cash tab: their earliest live start move. */
export function cashSince(moves: readonly CashMove[], profileId: string): LocalDate | undefined {
  let since: LocalDate | undefined;
  for (const m of moves) {
    if (m.isDeleted !== 0 || m.profileId !== profileId || m.kind !== 'start') continue;
    if (since === undefined || compareLocal(m.date, since) < 0) since = m.date;
  }
  return since;
}

const within = (date: LocalDate, from: LocalDate, to: LocalDate): boolean =>
  compareLocal(date, from) >= 0 && compareLocal(date, to) <= 0;

export type PersonCash = {
  readonly profileId: string;
  readonly since: LocalDate;
  readonly onHandMinor: Minor;
  /** The latest recount (a recount row, or a count that matched), else `since`. */
  readonly countedOn: LocalDate;
};

/**
 * One person's cash on `today`, or undefined when they have not set up -
 * including when their only start is dated after today.
 *
 * Whose an amount is comes from its row's `profileId`, so a row given to
 * someone else takes its cash with it.
 */
export function personCash(
  profileId: string,
  moves: readonly CashMove[],
  occurrences: readonly Occurrence[],
  today: LocalDate,
): PersonCash | undefined {
  const since = cashSince(moves, profileId);
  if (since === undefined || compareLocal(since, today) > 0) return undefined;

  let onHand: Minor = 0;
  let countedOn = since;

  for (const m of moves) {
    if (m.isDeleted !== 0 || m.profileId !== profileId || !within(m.date, since, today)) continue;
    onHand = add(onHand, moveSigned(m));
    if (m.kind === 'count' && compareLocal(m.date, countedOn) > 0) countedOn = m.date;
  }

  for (const o of occurrences) {
    if (o.isSkipped || o.transaction.profileId !== profileId || !within(o.date, since, today)) continue;
    if (!isCashIn(o) && !isCashOut(o)) continue;
    onHand = add(onHand, cashSigned(o));
    if (o.transaction.cashCount === true && compareLocal(o.date, countedOn) > 0) countedOn = o.date;
  }

  return { profileId, since, onHandMinor: onHand, countedOn };
}

export type CashInput = {
  /** The people in view: one, or everyone. Order is kept. */
  readonly profileIds: readonly string[];
  /** Every cash move this device holds; deleted ones are skipped here. */
  readonly moves: readonly CashMove[];
  /** Expanded over [the earliest start, the end of the month shown]. */
  readonly occurrences: readonly Occurrence[];
  readonly today: LocalDate;
  /** Any day of the month "expected" is for; today's month when absent. */
  readonly month?: LocalDate;
};

export type CashSummary = {
  /** The people in view who have set up, in `profileIds` order. */
  readonly people: readonly PersonCash[];
  /** The people in view who have not. */
  readonly notSetUp: readonly string[];
  readonly onHandMinor: Minor;
  /**
   * When the pot was last counted: the person counted longest ago, since the
   * pot is only verified as of then. Undefined while nobody has set up.
   */
  readonly countedOn?: LocalDate;
  /** Cash still to come in and go out this month, after today: never on hand. */
  readonly expected: { readonly inMinor: Minor; readonly outMinor: Minor };
};

export function cashSummary(input: CashInput): CashSummary {
  const people: PersonCash[] = [];
  const notSetUp: string[] = [];
  for (const id of input.profileIds) {
    const figure = personCash(id, input.moves, input.occurrences, input.today);
    if (figure === undefined) notSetUp.push(id);
    else people.push(figure);
  }

  const ready = new Set(people.map((p) => p.profileId));
  const month = input.month ?? input.today;
  const from = startOfMonth(month);
  const to = endOfMonth(month);
  let inMinor: Minor = 0;
  let outMinor: Minor = 0;
  for (const o of input.occurrences) {
    if (o.isSkipped || !ready.has(o.transaction.profileId)) continue;
    if (compareLocal(o.date, input.today) <= 0 || !within(o.date, from, to)) continue;
    if (isCashIn(o)) inMinor = add(inMinor, o.money.baseAmountMinor);
    else if (isCashOut(o)) outMinor = add(outMinor, o.money.baseAmountMinor);
  }

  const countedOn = people.reduce<LocalDate | undefined>(
    (oldest, p) => (oldest === undefined || compareLocal(p.countedOn, oldest) < 0 ? p.countedOn : oldest),
    undefined,
  );

  return {
    people,
    notSetUp,
    onHandMinor: sum(people.map((p) => p.onHandMinor)),
    ...(countedOn === undefined ? {} : { countedOn }),
    expected: { inMinor, outMinor },
  };
}

export type CashActivity =
  | {
      readonly type: 'occurrence';
      readonly key: string;
      readonly date: LocalDate;
      readonly profileId: string;
      readonly signedMinor: Minor;
      /** Written by a recount: tagged "Recount" in the list. */
      readonly recount: boolean;
      readonly occurrence: Occurrence;
    }
  | {
      readonly type: 'move';
      readonly key: string;
      readonly date: LocalDate;
      readonly profileId: string;
      readonly signedMinor: Minor;
      readonly move: CashMove;
    };

/** Moves shown in the list. A count carries no money; a kind from a later build is not ours to name. */
const LISTED_MOVES: ReadonlySet<string> = new Set(['start', 'withdraw', 'deposit']);

/**
 * What moved the cash, newest first: each person's cash rows and moves from
 * their own start to today. Ties on a day go newest-written first.
 */
export function cashActivity(input: CashInput): CashActivity[] {
  const since = new Map<string, LocalDate>();
  for (const id of input.profileIds) {
    const from = cashSince(input.moves, id);
    if (from !== undefined && compareLocal(from, input.today) <= 0) since.set(id, from);
  }
  const shown = (profileId: string, date: LocalDate): boolean => {
    const from = since.get(profileId);
    return from !== undefined && within(date, from, input.today);
  };

  const rows: { readonly entry: CashActivity; readonly written: string }[] = [];
  for (const o of input.occurrences) {
    if (o.isSkipped || !shown(o.transaction.profileId, o.date)) continue;
    if (!isCashIn(o) && !isCashOut(o)) continue;
    rows.push({
      written: o.transaction.createdAt,
      entry: {
        type: 'occurrence',
        key: o.key,
        date: o.date,
        profileId: o.transaction.profileId,
        signedMinor: cashSigned(o),
        recount: o.transaction.cashCount === true,
        occurrence: o,
      },
    });
  }
  for (const m of input.moves) {
    if (m.isDeleted !== 0 || !LISTED_MOVES.has(m.kind) || !shown(m.profileId, m.date)) continue;
    rows.push({
      written: m.createdAt,
      entry: {
        type: 'move',
        key: `move:${m.id}`,
        date: m.date,
        profileId: m.profileId,
        signedMinor: moveSigned(m),
        move: m,
      },
    });
  }

  rows.sort(
    (a, b) =>
      compareLocal(b.entry.date, a.entry.date) ||
      b.written.localeCompare(a.written) ||
      a.entry.key.localeCompare(b.entry.key),
  );
  return rows.map((row) => row.entry);
}
