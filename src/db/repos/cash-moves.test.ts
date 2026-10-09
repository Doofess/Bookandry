import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { materialize } from '@/db/materialize';
import { cashSummary, personCash } from '@/domain/cash';
import { d, MONEY } from '@/domain/test-factories';
import { counterIdFactory } from '@/lib/id';
import { freshDb, type TestDb } from '@/test/db-harness';
import { ALL_PROFILES, CASH_METHOD_ID, SHARED_OWNER } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import type { InvalidCashMoveError } from './cash-moves';
import {
  addCashMove,
  deleteCashMove,
  editCashMove,
  listCashMoves,
  loadCashInput,
  recordCount,
  type CashMoveDraft,
} from './cash-moves';

const NOW = '2026-10-09T10:00:00.000Z' as IsoInstant;
const LATER = '2026-10-09T10:05:00.000Z' as IsoInstant;
const UNDONE = '2026-10-09T10:10:00.000Z' as IsoInstant;
const TODAY = d('2026-10-09');

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
});
afterEach(async () => {
  await handle.dispose();
});

const draft = (over: Partial<CashMoveDraft> = {}): CashMoveDraft => ({
  profileId: 'p1',
  kind: 'withdraw',
  amountMinor: 20_000,
  date: d('2026-10-02'),
  ...over,
});

/** One person's figure, through the same loading the cash tab uses. */
async function onHand(profileId = 'p1'): Promise<number | undefined> {
  const input = await loadCashInput(handle.db, { profileId: ALL_PROFILES, today: TODAY });
  return personCash(profileId, input.moves, input.occurrences, TODAY)?.onHandMinor;
}

async function person(id: string): Promise<void> {
  await handle.db.profiles.put({
    id,
    name: id,
    color: id === 'p1' ? '#16794a' : '#0369a1',
    openingBalanceMinor: 0,
    openingBalanceCurrency: 'USD',
    openingBalanceDate: d('2026-01-01'),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

beforeEach(async () => {
  await person('p1');
  await person('p2');
});

describe('adding a move', () => {
  it('writes it, and Undo takes it away', async () => {
    const undoable = await addCashMove(
      handle.db,
      'm1',
      draft({ accountId: 'pm.leumi', note: '  ATM  ' }),
      NOW,
    );
    expect(await handle.db.cashMoves.get('m1')).toMatchObject({
      kind: 'withdraw',
      amountMinor: 20_000,
      accountId: 'pm.leumi',
      note: 'ATM',
      isDeleted: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await undoable.undo(UNDONE);
    expect(await handle.db.cashMoves.get('m1')).toBeUndefined();
  });

  it('takes a start of nothing, for someone with no cash', async () => {
    await addCashMove(handle.db, 's1', draft({ kind: 'start', amountMinor: 0 }), NOW);
    expect(await onHand()).toBe(0);
  });

  it('refuses what is not a move, and writes nothing', async () => {
    const bad: [Partial<CashMoveDraft>, InvalidCashMoveError['reason']][] = [
      [{ amountMinor: 0 }, 'amount'],
      [{ amountMinor: -500 }, 'amount'],
      [{ amountMinor: 12.5 }, 'amount'],
      [{ kind: 'deposit', amountMinor: 0 }, 'amount'],
      [{ kind: 'count', amountMinor: 100 }, 'amount'],
      [{ kind: 'start', amountMinor: -1 }, 'amount'],
      [{ kind: 'exchange' as never }, 'kind'],
      [{ profileId: SHARED_OWNER }, 'person'],
      [{ profileId: '' }, 'person'],
      [{ date: '2026-02-30' as LocalDate }, 'date'],
      [{ note: 'x'.repeat(2001) }, 'note'],
    ];
    for (const [over, reason] of bad) {
      await expect(
        addCashMove(handle.db, 'bad', draft(over), NOW),
        JSON.stringify(over),
      ).rejects.toMatchObject({
        name: 'InvalidCashMoveError',
        reason,
      });
    }
    expect(await handle.db.cashMoves.count()).toBe(0);
  });

  it('stores a note of only spaces as no note', async () => {
    await addCashMove(handle.db, 'm1', draft({ note: '   \n\t ' }), NOW);
    expect(await handle.db.cashMoves.get('m1')).not.toHaveProperty('note');
  });

  it('takes a note of exactly 2000 characters, once trimmed', async () => {
    const note = 'x'.repeat(2000);
    await addCashMove(handle.db, 'm1', draft({ note: `  ${note}  ` }), NOW);
    expect((await handle.db.cashMoves.get('m1'))?.note).toBe(note);
  });
});

describe('editing a move', () => {
  it('changes it, clears what the form left empty, and Undo puts it back as it was', async () => {
    await addCashMove(handle.db, 'm1', draft({ accountId: 'pm.leumi', note: 'ATM' }), NOW);
    const undoable = await editCashMove(handle.db, 'm1', draft({ amountMinor: 25_000 }), LATER);

    const edited = await handle.db.cashMoves.get('m1');
    expect(edited).toMatchObject({ amountMinor: 25_000, updatedAt: LATER, createdAt: NOW });
    expect(edited).not.toHaveProperty('accountId');
    expect(edited).not.toHaveProperty('note');

    await undoable.undo(UNDONE);
    expect(await handle.db.cashMoves.get('m1')).toMatchObject({
      amountMinor: 20_000,
      accountId: 'pm.leumi',
      note: 'ATM',
      updatedAt: UNDONE,
    });
  });

  it('keeps a field a later build added', async () => {
    await handle.db.cashMoves.put({ ...(await addAndGet()), laterField: 'kept' } as never);
    await editCashMove(handle.db, 'm1', draft({ amountMinor: 1_000 }), LATER);
    expect(await handle.db.cashMoves.get('m1')).toMatchObject({ laterField: 'kept', amountMinor: 1_000 });
  });

  it('says the move is gone when it was deleted meanwhile', async () => {
    await addCashMove(handle.db, 'm1', draft(), NOW);
    await deleteCashMove(handle.db, 'm1', NOW);
    await expect(editCashMove(handle.db, 'm1', draft(), LATER)).rejects.toThrow('gone');
  });

  async function addAndGet() {
    await addCashMove(handle.db, 'm1', draft(), NOW);
    return (await handle.db.cashMoves.get('m1'))!;
  }
});

describe('deleting a move', () => {
  it('hides it, and Undo brings it back', async () => {
    await addCashMove(handle.db, 'm1', draft(), NOW);
    const undoable = await deleteCashMove(handle.db, 'm1', LATER);
    expect(await handle.db.cashMoves.get('m1')).toMatchObject({ isDeleted: 1, deletedAt: LATER });
    expect(await listCashMoves(handle.db)).toEqual([]);

    await undoable.undo(UNDONE);
    expect(await listCashMoves(handle.db)).toHaveLength(1);
    expect(await handle.db.cashMoves.get('m1')).not.toHaveProperty('deletedAt');
  });

  it('returns a person to "not set up" when it is their start, until Undo', async () => {
    await addCashMove(
      handle.db,
      's1',
      draft({ kind: 'start', amountMinor: 50_000, date: d('2026-10-01') }),
      NOW,
    );
    expect(await onHand()).toBe(50_000);

    const undoable = await deleteCashMove(handle.db, 's1', LATER);
    expect(await onHand()).toBeUndefined();

    await undoable.undo(UNDONE);
    expect(await onHand()).toBe(50_000);
  });
});

describe('setting up, when the person already has a start', () => {
  const start = (amountMinor: number, date = '2026-10-01') =>
    draft({ kind: 'start', amountMinor, date: d(date) });

  it('edits that start rather than adding a second, and Undo puts it back as it was', async () => {
    await addCashMove(handle.db, 's1', start(50_000), NOW);
    const undoable = await addCashMove(handle.db, 's2', start(30_000, '2026-10-03'), LATER);

    expect(await handle.db.cashMoves.count()).toBe(1);
    expect(await handle.db.cashMoves.get('s2')).toBeUndefined();
    expect(await handle.db.cashMoves.get('s1')).toMatchObject({
      amountMinor: 30_000,
      date: '2026-10-03',
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(await onHand()).toBe(30_000);

    await undoable.undo(UNDONE);
    expect(await handle.db.cashMoves.get('s1')).toMatchObject({ amountMinor: 50_000, date: '2026-10-01' });
    expect(await handle.db.cashMoves.count()).toBe(1);
  });

  it('brings back a start that was deleted, under its own id', async () => {
    await addCashMove(handle.db, 's1', start(50_000), NOW);
    await deleteCashMove(handle.db, 's1', NOW);

    await addCashMove(handle.db, 's2', start(12_000), LATER);
    expect(await handle.db.cashMoves.count()).toBe(1);
    const row = await handle.db.cashMoves.get('s1');
    expect(row).toMatchObject({ isDeleted: 0, amountMinor: 12_000, updatedAt: LATER });
    expect(row).not.toHaveProperty('deletedAt');
    expect(await onHand()).toBe(12_000);
  });

  it('returns that start to deleted on Undo of bringing it back', async () => {
    await addCashMove(handle.db, 's1', start(50_000), NOW);
    await deleteCashMove(handle.db, 's1', NOW);
    const undoable = await addCashMove(handle.db, 's2', start(12_000), LATER);

    await undoable.undo(UNDONE);
    expect(await handle.db.cashMoves.get('s1')).toMatchObject({
      isDeleted: 1,
      deletedAt: NOW,
      amountMinor: 50_000,
      updatedAt: UNDONE,
    });
    expect(await onHand()).toBeUndefined();
  });

  it('leaves another person’s start alone', async () => {
    await addCashMove(handle.db, 's1', start(50_000), NOW);
    await addCashMove(handle.db, 's2', { ...start(30_000), profileId: 'p2' }, NOW);
    expect(await handle.db.cashMoves.count()).toBe(2);
    expect(await onHand('p1')).toBe(50_000);
    expect(await onHand('p2')).toBe(30_000);
  });

  it('refuses an edit that would make a second live start', async () => {
    await addCashMove(handle.db, 's1', start(50_000), NOW);
    await addCashMove(handle.db, 'm1', draft(), NOW);
    await expect(editCashMove(handle.db, 'm1', start(1_000), LATER)).rejects.toThrow('start_exists');
    expect((await handle.db.cashMoves.get('m1'))?.kind).toBe('withdraw');
  });

  it('refuses moving a start to someone who already has one', async () => {
    await addCashMove(handle.db, 's1', start(50_000), NOW);
    await addCashMove(handle.db, 's2', { ...start(30_000), profileId: 'p2' }, NOW);
    await expect(editCashMove(handle.db, 's1', { ...start(50_000), profileId: 'p2' }, LATER)).rejects.toThrow(
      'start_exists',
    );
    expect((await handle.db.cashMoves.get('s1'))?.profileId).toBe('p1');
  });

  it('still edits a start when a sync has brought in a second one for the same person', async () => {
    await addCashMove(handle.db, 's1', start(50_000), NOW);
    // Another device's start, written while offline: the repo would never add it.
    await handle.db.cashMoves.put({
      id: 's2',
      profileId: 'p1',
      kind: 'start',
      amountMinor: 40_000,
      date: d('2026-10-05'),
      isDeleted: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await editCashMove(handle.db, 's2', start(45_000, '2026-10-06'), LATER);
    expect(await handle.db.cashMoves.get('s2')).toMatchObject({ amountMinor: 45_000, date: '2026-10-06' });
  });

  it('writes one start when two are saved at once', async () => {
    await Promise.all([
      addCashMove(handle.db, 'a', start(10_000), NOW),
      addCashMove(handle.db, 'b', start(20_000), NOW),
    ]);
    const starts = (await listCashMoves(handle.db)).filter((m) => m.kind === 'start');
    expect(starts).toHaveLength(1);
  });
});

describe('an Undo offered before a later change', () => {
  it('is refused, whole, and leaves the later change in place', async () => {
    const added = await addCashMove(handle.db, 'm1', draft(), NOW);
    await editCashMove(handle.db, 'm1', draft({ amountMinor: 30_000 }), LATER);

    await expect(added.undo(UNDONE)).rejects.toThrow('changed_since');
    expect((await handle.db.cashMoves.get('m1'))?.amountMinor).toBe(30_000);
  });
});

describe('counting the cash', () => {
  beforeEach(async () => {
    await addCashMove(
      handle.db,
      's1',
      draft({ kind: 'start', amountMinor: 50_000, date: d('2026-10-01') }),
      NOW,
    );
  });

  const count = (countedMinor: number, profileId = 'p1') =>
    recordCount(handle.db, {
      profileId,
      countedMinor,
      currency: 'USD',
      today: TODAY,
      now: LATER,
      newId: counterIdFactory('rc'),
    });

  it('writes what is missing as a cash expense marked as a recount, which moves the balance', async () => {
    const result = await count(49_000);
    expect(result).toMatchObject({ outcome: 'missing', differenceMinor: -1_000 });

    const [row] = await handle.db.transactions.toArray();
    expect(row).toMatchObject({
      profileId: 'p1',
      kind: 'expense',
      categoryId: 'cat.cash_missing',
      paymentMethodId: CASH_METHOD_ID,
      cashCount: true,
      date: TODAY,
      recurrence: { type: 'one_time' },
      money: { amountMinor: 1_000, baseAmountMinor: 1_000, currency: 'USD', baseCurrency: 'USD' },
    });
    expect(row).not.toHaveProperty('destinationId');
    expect(await onHand()).toBe(49_000);
  });

  it('writes what was found as cash income marked as a recount', async () => {
    const result = await count(51_200);
    expect(result).toMatchObject({ outcome: 'found', differenceMinor: 1_200 });
    const [row] = await handle.db.transactions.toArray();
    expect(row).toMatchObject({
      kind: 'income',
      categoryId: 'cat.cash_found',
      destinationId: CASH_METHOD_ID,
      cashCount: true,
    });
    expect(row).not.toHaveProperty('paymentMethodId');
    expect(await onHand()).toBe(51_200);
  });

  it('writes a count of nothing when it matched, which only moves "Counted"', async () => {
    const result = await count(50_000);
    expect(result).toMatchObject({ outcome: 'matched', differenceMinor: 0 });
    expect(await handle.db.transactions.count()).toBe(0);
    const input = await loadCashInput(handle.db, { profileId: 'p1', today: TODAY });
    expect(cashSummary(input).countedOn).toBe(TODAY);
    expect(await handle.db.cashMoves.filter((m) => m.kind === 'count').first()).toMatchObject({
      amountMinor: 0,
      date: TODAY,
    });
  });

  it('takes the recount away again on Undo', async () => {
    const { undoable } = await count(49_000);
    await undoable.undo(UNDONE);
    expect(await handle.db.transactions.count()).toBe(0);
    expect(await onHand()).toBe(50_000);
  });

  it('measures one person’s count against that person’s cash, never the pot', async () => {
    await addCashMove(
      handle.db,
      's2',
      draft({ profileId: 'p2', kind: 'start', amountMinor: 30_000, date: d('2026-10-01') }),
      NOW,
    );

    const result = await count(28_000, 'p2');
    expect(result).toMatchObject({ outcome: 'missing', differenceMinor: -2_000 });
    expect((await handle.db.transactions.toArray())[0]).toMatchObject({ profileId: 'p2' });
    expect(await onHand('p1')).toBe(50_000);
    expect(await onHand('p2')).toBe(28_000);
  });

  it('refuses for someone who has not set up', async () => {
    await handle.db.cashMoves.clear();
    await expect(count(1_000)).rejects.toThrow('not_set_up');
  });

  it('refuses a count below nothing, and writes nothing', async () => {
    await expect(count(-1)).rejects.toMatchObject({ name: 'InvalidCashMoveError', reason: 'amount' });
    expect(await handle.db.transactions.count()).toBe(0);
    expect(await handle.db.cashMoves.count()).toBe(1);
  });
});

describe('loading what the cash figure needs', () => {
  it('finds a payment sent to cash by an override on a series that is not cash', async () => {
    await addCashMove(
      handle.db,
      's1',
      draft({ kind: 'start', amountMinor: 10_000, date: d('2026-08-01') }),
      NOW,
    );
    await handle.db.transactions.put(
      materialize({
        id: 'salary',
        profileId: 'p1',
        kind: 'income',
        categoryId: 'cat.salary',
        destinationId: 'pm.leumi',
        money: { ...MONEY, amountMinor: 1_000, baseAmountMinor: 1_000 },
        recurrence: { type: 'monthly', dayOfMonth: 1 },
        date: d('2026-06-01'),
        seriesRootId: 'salary',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );
    await handle.db.overrides.put({
      id: 'o1',
      transactionId: 'salary',
      occurrenceDate: d('2026-09-01'),
      action: 'modify',
      patch: { destinationId: CASH_METHOD_ID },
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(await onHand()).toBe(11_000);
  });

  it('loads nothing to expand while nobody in view has set up', async () => {
    await handle.db.transactions.put(
      materialize({
        id: 'cash',
        profileId: 'p1',
        kind: 'expense',
        categoryId: 'cat.groceries',
        paymentMethodId: CASH_METHOD_ID,
        money: MONEY,
        recurrence: { type: 'one_time' },
        date: d('2026-10-02'),
        seriesRootId: 'cash',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );
    const input = await loadCashInput(handle.db, { profileId: 'p1', today: TODAY });
    expect(input.occurrences).toEqual([]);
    expect(input.profileIds).toEqual(['p1']);
  });

  const cashExpense = (id: string, profileId: string, date: string) =>
    materialize({
      id,
      profileId,
      kind: 'expense',
      categoryId: 'cat.groceries',
      paymentMethodId: CASH_METHOD_ID,
      money: MONEY,
      recurrence: { type: 'one_time' },
      date: d(date),
      seriesRootId: id,
      createdAt: NOW,
      updatedAt: NOW,
    });

  it('loads the cash still to come this month, for its "expected" line', async () => {
    await addCashMove(
      handle.db,
      's1',
      draft({ kind: 'start', amountMinor: 10_000, date: d('2026-10-01') }),
      NOW,
    );
    await handle.db.transactions.put(cashExpense('later', 'p1', '2026-10-20'));

    const input = await loadCashInput(handle.db, { profileId: 'p1', today: TODAY });
    expect(cashSummary(input).expected).toEqual({ inMinor: 0, outMinor: MONEY.baseAmountMinor });
    expect(await onHand()).toBe(10_000);
  });

  it('loads everyone from the earliest start in view', async () => {
    await addCashMove(
      handle.db,
      's1',
      draft({ kind: 'start', amountMinor: 10_000, date: d('2026-08-01') }),
      NOW,
    );
    await addCashMove(
      handle.db,
      's2',
      draft({ profileId: 'p2', kind: 'start', amountMinor: 30_000, date: d('2026-10-01') }),
      NOW,
    );
    await handle.db.transactions.put(cashExpense('sept', 'p1', '2026-09-10'));

    const input = await loadCashInput(handle.db, { profileId: ALL_PROFILES, today: TODAY });
    expect(input.profileIds).toEqual(['p1', 'p2']);
    expect(input.occurrences.map((o) => o.transaction.id)).toEqual(['sept']);
    expect(await onHand('p1')).toBe(10_000 - MONEY.baseAmountMinor);
    expect(await onHand('p2')).toBe(30_000);
  });
});
