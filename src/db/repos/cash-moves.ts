import type { BookandryDB } from '@/db/db';
import { materialize } from '@/db/materialize';
import { undoableWrite, type UndoableAction } from '@/db/occurrence-actions';
import {
  CASH_FOUND_CATEGORY_ID,
  CASH_MISSING_CATEGORY_ID,
  cashSince,
  personCash,
  type CashInput,
} from '@/domain/cash';
import { expandOccurrences } from '@/domain/occurrences';
import { compareLocal, endOfMonth, isLocalDate } from '@/lib/dates';
import {
  ALL_PROFILES,
  CASH_METHOD_ID,
  CASH_MOVE_KINDS,
  SHARED_OWNER,
  type CashMove,
  type CashMoveKind,
  type Override,
  type Transaction,
} from '@/types/domain';
import type { Currency, IsoInstant, LocalDate, Minor } from '@/types/money';

import { listProfiles } from './profiles';
import { findCandidates, findOverrides } from './transactions';

/**
 * The cash tab's writes: the amount someone started with, money taken from
 * the bank or put back, and a count.
 *
 * Every write offers Undo the way the feed does (`undoableWrite`): what it
 * replaced is kept, and Undo puts exactly that back, in one transaction - or
 * refuses, whole, once any of those rows has changed since, so it never
 * silently overwrites a later edit.
 *
 * A person has at most one start. Setting up is `addCashMove` with kind
 * `start`: when the person already has a start row, live or deleted, that row
 * is rewritten (and brought back if it was deleted) instead of a second one
 * being added.
 */

export type CashMoveDraft = {
  readonly profileId: string;
  readonly kind: CashMoveKind;
  readonly amountMinor: Minor;
  readonly date: LocalDate;
  readonly accountId?: string;
  readonly note?: string;
};

export class InvalidCashMoveError extends Error {
  constructor(readonly reason: 'kind' | 'person' | 'amount' | 'date' | 'note') {
    super(`Not a cash move: ${reason}`);
    this.name = 'InvalidCashMoveError';
  }
}

const KINDS: ReadonlySet<string> = new Set(CASH_MOVE_KINDS);
/** The longest a move's note can be, once trimmed. */
export const CASH_NOTE_MAX = 2000;

/** The draft, held to what a move can be. Throws rather than writing half of one. */
function checked(draft: CashMoveDraft): {
  readonly fields: Pick<CashMove, 'profileId' | 'kind' | 'amountMinor' | 'date'>;
  readonly optional: Pick<CashMove, 'accountId' | 'note'>;
} {
  if (!KINDS.has(draft.kind)) throw new InvalidCashMoveError('kind');
  if (draft.profileId === '' || draft.profileId === SHARED_OWNER) throw new InvalidCashMoveError('person');
  const amount = draft.amountMinor;
  const fits =
    Number.isSafeInteger(amount) &&
    (draft.kind === 'count' ? amount === 0 : draft.kind === 'start' ? amount >= 0 : amount > 0);
  if (!fits) throw new InvalidCashMoveError('amount');
  if (!isLocalDate(draft.date)) throw new InvalidCashMoveError('date');
  const note = draft.note?.trim();
  if (note !== undefined && note.length > CASH_NOTE_MAX) throw new InvalidCashMoveError('note');
  return {
    fields: { profileId: draft.profileId, kind: draft.kind, amountMinor: amount, date: draft.date },
    optional: {
      ...(draft.accountId === undefined || draft.accountId === '' ? {} : { accountId: draft.accountId }),
      ...(note === undefined || note === '' ? {} : { note }),
    },
  };
}

/**
 * The row a person's start lives in: a live one first (the earliest, the one
 * the figure counts from), else a deleted one. Two devices offline can still
 * write two; which of them stays is the cash screen's call, not this one's.
 */
async function startRowOf(db: BookandryDB, profileId: string): Promise<CashMove | undefined> {
  const rows = await db.cashMoves
    .where('[profileId+isDeleted+date]')
    .between([profileId, 0, ''], [profileId, 1, '￿'], true, true)
    .filter((m) => m.kind === 'start')
    .toArray();
  // The index orders by isDeleted, then date: live before deleted, earliest first.
  return rows[0];
}

/**
 * Write a move. A `start` for someone who already has a start row rewrites
 * that row, under its own id, instead of adding a second; `id` is used only
 * when the row is new.
 */
export async function addCashMove(
  db: BookandryDB,
  id: string,
  draft: CashMoveDraft,
  now: IsoInstant,
): Promise<UndoableAction> {
  const { fields, optional } = checked(draft);

  // One transaction around the lookup and the write: two starts saved at once
  // (a double tap, two tabs) are serialised, so the second finds the first.
  return db.transaction('rw', db.cashMoves, async () => {
    if (fields.kind === 'start') {
      const existing = await startRowOf(db, fields.profileId);
      if (existing !== undefined) return rewrite(db, existing, fields, optional, now);
    }

    const row: CashMove = { id, ...fields, ...optional, isDeleted: 0, createdAt: now, updatedAt: now };
    return undoableWrite(db, [{ table: 'cashMoves', ids: [id] }], async () => {
      await db.cashMoves.add(row);
    });
  });
}

/**
 * Put a draft over an existing row: a field the form left empty is cleared, a
 * field a later build added rides along, and a deleted row comes back.
 */
function rewrite(
  db: BookandryDB,
  existing: CashMove,
  fields: Pick<CashMove, 'profileId' | 'kind' | 'amountMinor' | 'date'>,
  optional: Pick<CashMove, 'accountId' | 'note'>,
  now: IsoInstant,
): Promise<UndoableAction> {
  const { accountId: _account, note: _note, deletedAt: _deletedAt, ...kept } = existing;
  const row: CashMove = { ...kept, ...fields, ...optional, isDeleted: 0, updatedAt: now };
  return undoableWrite(db, [{ table: 'cashMoves', ids: [existing.id] }], async () => {
    await db.cashMoves.put(row);
  });
}

/**
 * Change a live move. Throws `Error('gone')` when it is missing or deleted,
 * and `Error('start_exists')` when the edit makes a start (a move becomes
 * one, or a start moves to another person) for someone who already has a
 * live one. Changing an existing start's amount or date always goes through,
 * even when a sync has brought in a second start for the same person.
 */
export async function editCashMove(
  db: BookandryDB,
  id: string,
  draft: CashMoveDraft,
  now: IsoInstant,
): Promise<UndoableAction> {
  const { fields, optional } = checked(draft);
  return db.transaction('rw', db.cashMoves, async () => {
    const existing = await db.cashMoves.get(id);
    if (existing === undefined || existing.isDeleted === 1) throw new Error('gone');
    const makesStart =
      fields.kind === 'start' && (existing.kind !== 'start' || existing.profileId !== fields.profileId);
    if (makesStart) {
      const start = await startRowOf(db, fields.profileId);
      if (start !== undefined && start.id !== id && start.isDeleted === 0) throw new Error('start_exists');
    }
    return rewrite(db, existing, fields, optional, now);
  });
}

/** A soft delete: the row stays, so Undo and a later sync can bring it back. */
export async function deleteCashMove(db: BookandryDB, id: string, now: IsoInstant): Promise<UndoableAction> {
  return db.transaction('rw', db.cashMoves, async () => {
    const existing = await db.cashMoves.get(id);
    if (existing === undefined || existing.isDeleted === 1) throw new Error('gone');
    return undoableWrite(db, [{ table: 'cashMoves', ids: [id] }], async () => {
      await db.cashMoves.put({ ...existing, isDeleted: 1, deletedAt: now, updatedAt: now });
    });
  });
}

/** Every live move, everyone's. A household writes a handful a week, so a scan is fine. */
export async function listCashMoves(db: BookandryDB): Promise<CashMove[]> {
  return db.cashMoves.filter((m) => m.isDeleted === 0).toArray();
}

/**
 * Whether a transaction can produce a cash occurrence: it names cash itself,
 * or one of its overrides does. An occurrence's method or destination is the
 * override's when it sets one and the series' otherwise, so a series where
 * neither names cash has no cash occurrence at all.
 */
function canBeCash(tx: Transaction, overrides: readonly Override[]): boolean {
  if (tx.paymentMethodId === CASH_METHOD_ID || tx.destinationId === CASH_METHOD_ID) return true;
  return overrides.some(
    (o) =>
      o.transactionId === tx.id &&
      (o.patch?.paymentMethodId === CASH_METHOD_ID || o.patch?.destinationId === CASH_METHOD_ID),
  );
}

/**
 * What the cash figure needs for the people in view: every live move, and
 * the cash rows' occurrences from the earliest start among them to the end of
 * today's month (the month's rows still to come are its "expected" line).
 */
export async function loadCashInput(
  db: BookandryDB,
  query: { readonly profileId: string; readonly today: LocalDate },
): Promise<CashInput> {
  const { today } = query;
  const profileIds =
    query.profileId === ALL_PROFILES ? (await listProfiles(db)).map((p) => p.id) : [query.profileId];
  const moves = await listCashMoves(db);

  let from: LocalDate | undefined;
  for (const id of profileIds) {
    const since = cashSince(moves, id);
    if (since === undefined || compareLocal(since, today) > 0) continue;
    if (from === undefined || compareLocal(since, from) < 0) from = since;
  }
  if (from === undefined) return { profileIds, moves, occurrences: [], today };

  const to = endOfMonth(today);
  const candidates = await findCandidates(db, { profileId: query.profileId, from, to });
  const overrides = await findOverrides(
    db,
    candidates.map((t) => t.id),
  );
  const occurrences = candidates
    .filter((tx) => canBeCash(tx, overrides))
    .flatMap((tx) =>
      expandOccurrences(
        tx,
        overrides.filter((o) => o.transactionId === tx.id),
        from,
        to,
        { today },
      ),
    );
  return { profileIds, moves, occurrences, today };
}

export type CountOutcome = 'found' | 'missing' | 'matched';

/**
 * "Count my cash": the difference between what is in the wallet and this
 * person's own figure, written so the figure agrees.
 *
 * - more than recorded: cash income ("Cash found"), so the balance rises with it;
 * - less: a cash expense ("Cash missing"), so the balance falls with it;
 * - the same: a `count` move of nothing, which only moves "Counted".
 *
 * A recount row is an ordinary cash row tagged `cashCount`, so an older build
 * sees a normal income or expense and its balance is right.
 */
export async function recordCount(
  db: BookandryDB,
  input: {
    readonly profileId: string;
    readonly countedMinor: Minor;
    readonly currency: Currency;
    readonly today: LocalDate;
    readonly now: IsoInstant;
    readonly newId: () => string;
  },
): Promise<{
  readonly undoable: UndoableAction;
  readonly outcome: CountOutcome;
  readonly differenceMinor: Minor;
}> {
  const { profileId, countedMinor, currency, today, now, newId } = input;
  if (!Number.isSafeInteger(countedMinor) || countedMinor < 0) throw new InvalidCashMoveError('amount');

  const loaded = await loadCashInput(db, { profileId, today });
  const figure = personCash(profileId, loaded.moves, loaded.occurrences, today);
  if (figure === undefined) throw new Error('not_set_up');

  const differenceMinor = countedMinor - figure.onHandMinor;
  const id = newId();

  if (differenceMinor === 0) {
    const undo = await addCashMove(db, id, { profileId, kind: 'count', amountMinor: 0, date: today }, now);
    return { undoable: undo, outcome: 'matched', differenceMinor };
  }

  const found = differenceMinor > 0;
  const amountMinor = Math.abs(differenceMinor);
  const row = materialize({
    id,
    profileId,
    kind: found ? 'income' : 'expense',
    categoryId: found ? CASH_FOUND_CATEGORY_ID : CASH_MISSING_CATEGORY_ID,
    ...(found ? { destinationId: CASH_METHOD_ID } : { paymentMethodId: CASH_METHOD_ID }),
    cashCount: true,
    // In the household's own currency: the identity snapshot a same-currency save writes.
    money: {
      amountMinor,
      currency,
      baseCurrency: currency,
      baseAmountMinor: amountMinor,
      rateUsed: '1',
      rateDate: today,
      rateSource: 'manual',
    },
    recurrence: { type: 'one_time' },
    date: today,
    seriesRootId: id,
    createdAt: now,
    updatedAt: now,
  });
  const undo = await undoableWrite(db, [{ table: 'transactions', ids: [id] }], async () => {
    await db.transactions.add(row);
  });
  return { undoable: undo, outcome: found ? 'found' : 'missing', differenceMinor };
}
