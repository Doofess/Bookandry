import { compareLocal, endOfMonth, nowIso, startOfMonth } from '@/lib/dates';
import { add, sum } from '@/lib/money';
import { CASH_METHOD_ID, type CashMove, type Occurrence, type Transaction } from '@/types/domain';
import type { IsoInstant, LocalDate, Minor } from '@/types/money';

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
 *         start + Σ withdraw − Σ deposit            (live moves, start..today)
 *     + Σ income occurrences that went to cash      (start..today)
 *     − Σ expense occurrences paid in cash          (start..today)
 *
 * "start" is the person's FIRST live start move (`earliestStart`), and only
 * it: a second start a sync brought in counts for nothing, date or amount,
 * until the cash screen's fix-up removes it. Cash rows from before they set
 * up the tab never count, so years of old cash spending cannot drive the
 * figure negative. On the start day itself only rows written after the start
 * count: the amount typed already holds the rest. Amounts are each
 * occurrence's base amount, as the balance
 * uses.
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
  if (isCashOut(o)) return 0 - o.money.baseAmountMinor;
  return 0;
}

/** What one move does to the cash. */
export function moveSigned(move: Pick<CashMove, 'kind' | 'amountMinor'>): Minor {
  switch (move.kind) {
    case 'start':
    case 'withdraw':
      return move.amountMinor;
    case 'deposit':
      return 0 - move.amountMinor;
    default:
      // 'count' is 0 by definition. A kind a later build added is not this
      // build's to sum: ignoring it is what lets that build add it safely.
      return 0;
  }
}

/**
 * Which of two starts came first: by date, then by when it was written, then
 * by id. The same order on every device, so two devices putting a doubled
 * start right offline keep the same one.
 */
export function compareStarts(a: CashMove, b: CashMove): number {
  return compareLocal(a.date, b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/**
 * A person's earliest live start: the one their cash counts from. Two devices
 * set up offline can sync in a second; until it is removed, a later start
 * counts for nothing - neither its date nor its amount.
 */
export function earliestStart(moves: readonly CashMove[], profileId: string): CashMove | undefined {
  let first: CashMove | undefined;
  for (const m of moves) {
    if (m.isDeleted !== 0 || m.profileId !== profileId || m.kind !== 'start') continue;
    if (first === undefined || compareStarts(m, first) < 0) first = m;
  }
  return first;
}

/** The day a person set up the cash tab: their earliest live start's date. */
export function cashSince(moves: readonly CashMove[], profileId: string): LocalDate | undefined {
  return earliestStart(moves, profileId)?.date;
}

/**
 * One of a merged person's moves, joining the pot of the person they were
 * merged into (`to`, whose own earliest live start is `targetStart`).
 *
 * The merged person's start, when the target already has one, would be a
 * second start and count for nothing: it becomes a withdrawal of the same
 * amount instead, which adds to the pot exactly as the start did (both are
 * +amount, and neither touches the balance). It is dated no earlier than the
 * target's start, so it counts, and written no earlier than that start, so it
 * counts on that start day too. `note` (say "Cash from Dad") goes on it when
 * it has none of its own.
 *
 * Anything else follows its person as it is: a deleted start, a later start
 * that already counted for nothing, every other move.
 *
 * Accepted: the merged person's moves and cash rows dated before the target's
 * start stop counting, since the pot counts only from its own start.
 */
export function joinPot(
  move: CashMove,
  to: string,
  starts: { readonly mine: CashMove | undefined; readonly target: CashMove | undefined },
  note: string | undefined,
  now: IsoInstant,
): CashMove {
  const { mine, target } = starts;
  if (target === undefined || move.id !== mine?.id) {
    return { ...move, profileId: to, updatedAt: now };
  }
  const kept = move.note ?? note;
  const { note: _note, ...rest } = move;
  return {
    ...rest,
    profileId: to,
    kind: 'withdraw',
    date: compareLocal(move.date, target.date) < 0 ? target.date : move.date,
    ...(kept === undefined || kept === '' ? {} : { note: kept }),
    // Written at the merge - or, when this device's clock is behind the one
    // that wrote the target's start, just after that start. A row dated on the
    // start day counts only when written after it (`counts`), so a slow clock
    // must not make the pot drop what it just took in.
    createdAt: now > target.createdAt ? now : nowIso(new Date(Date.parse(target.createdAt) + 1)),
    updatedAt: now,
  };
}

/** A live start that is not the person's earliest: it counts for nothing, and is not listed. */
const isLaterStart = (m: CashMove, first: CashMove | undefined): boolean =>
  m.kind === 'start' && m.id !== first?.id;

const within = (date: LocalDate, from: LocalDate, to: LocalDate): boolean =>
  compareLocal(date, from) >= 0 && compareLocal(date, to) <= 0;

/**
 * Whether a row counts toward the cash of someone who started at `first`:
 * dated from the start through today, and, on the start day itself, written
 * after the start. The setup card asks how much is in the wallet now, so a
 * coffee recorded that morning, or a recurring cash payment due that day (an
 * occurrence carries its series' `createdAt`), is already in the amount typed.
 * The start itself always counts.
 */
function counts(date: LocalDate, written: string, first: CashMove, today: LocalDate): boolean {
  if (!within(date, first.date, today)) return false;
  return compareLocal(date, first.date) !== 0 || written > first.createdAt;
}

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
  const first = earliestStart(moves, profileId);
  if (first === undefined || compareLocal(first.date, today) > 0) return undefined;
  const since = first.date;

  let onHand: Minor = 0;
  let countedOn = since;

  for (const m of moves) {
    if (m.isDeleted !== 0 || m.profileId !== profileId) continue;
    if (m.id !== first.id && (isLaterStart(m, first) || !counts(m.date, m.createdAt, first, today))) continue;
    onHand = add(onHand, moveSigned(m));
    if (m.kind === 'count' && compareLocal(m.date, countedOn) > 0) countedOn = m.date;
  }

  for (const o of occurrences) {
    if (o.isSkipped || o.transaction.profileId !== profileId) continue;
    if (!counts(o.date, o.transaction.createdAt, first, today)) continue;
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
  const firsts = new Map<string, CashMove>();
  for (const id of input.profileIds) {
    const first = earliestStart(input.moves, id);
    if (first === undefined || compareLocal(first.date, input.today) > 0) continue;
    firsts.set(id, first);
  }
  // The same rows `personCash` counts, so the list adds up to the figure.
  const shown = (profileId: string, date: LocalDate, written: string): boolean => {
    const first = firsts.get(profileId);
    return first !== undefined && counts(date, written, first, input.today);
  };

  const rows: { readonly entry: CashActivity; readonly written: string }[] = [];
  for (const o of input.occurrences) {
    if (o.isSkipped || !shown(o.transaction.profileId, o.date, o.transaction.createdAt)) continue;
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
    if (m.isDeleted !== 0 || !LISTED_MOVES.has(m.kind) || !firsts.has(m.profileId)) continue;
    const first = firsts.get(m.profileId);
    if (m.id !== first?.id && (isLaterStart(m, first) || !shown(m.profileId, m.date, m.createdAt))) continue;
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
