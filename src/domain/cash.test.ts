import { describe, expect, it } from 'vitest';

import { CASH_METHOD_ID, type CashMove, type Override, type Transaction } from '@/types/domain';
import type { IsoInstant, Minor } from '@/types/money';

import {
  cashActivity,
  cashSigned,
  cashSince,
  cashSummary,
  earliestStart,
  isCashIn,
  isCashOut,
  moveSigned,
  personCash,
} from './cash';
import { expandOccurrences } from './occurrences';
import { d, makeTx, modify, MONEY, skip } from './test-factories';

const TODAY = d('2026-10-09');
const AT = '2026-10-01T00:00:00.000Z' as IsoInstant;

const move = (over: Partial<CashMove> & Pick<CashMove, 'kind' | 'amountMinor' | 'date'>): CashMove => ({
  id: `${over.profileId ?? 'p1'}-${over.kind}-${over.date}-${String(over.amountMinor)}`,
  profileId: 'p1',
  isDeleted: 0,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});
const start = (date: string, amountMinor: Minor, profileId = 'p1') =>
  move({ kind: 'start', date: d(date), amountMinor, profileId });

const money = (minor: Minor, base: Minor = minor) => ({
  ...MONEY,
  amountMinor: minor,
  baseAmountMinor: base,
});
/** Paid in cash. */
const spend = (id: string, date: string, minor: Minor, over: Partial<Transaction> = {}) =>
  makeTx({
    id,
    date: d(date),
    recurrence: { type: 'one_time' },
    paymentMethodId: CASH_METHOD_ID,
    money: money(minor),
    ...over,
  });
/** Received in cash. */
const earn = (id: string, date: string, minor: Minor, over: Partial<Transaction> = {}) =>
  makeTx({
    id,
    kind: 'income',
    categoryId: 'cat.salary',
    date: d(date),
    recurrence: { type: 'one_time' },
    destinationId: CASH_METHOD_ID,
    money: money(minor),
    ...over,
  });

function occurrencesOf(txs: readonly Transaction[], overrides: readonly Override[] = []) {
  return txs.flatMap((tx) =>
    expandOccurrences(
      tx,
      overrides.filter((o) => o.transactionId === tx.id),
      d('2026-01-01'),
      d('2026-12-31'),
      { today: TODAY, includeSkipped: true },
    ),
  );
}

function summary(
  moves: readonly CashMove[],
  txs: readonly Transaction[] = [],
  profileIds: readonly string[] = ['p1'],
  overrides: readonly Override[] = [],
) {
  return cashSummary({ profileIds, moves, occurrences: occurrencesOf(txs, overrides), today: TODAY });
}

describe('what is cash', () => {
  it('is income that went to cash, and spending paid in cash, and nothing else', () => {
    const [cashIn] = occurrencesOf([earn('a', '2026-10-02', 100)]);
    const [cashOut] = occurrencesOf([spend('b', '2026-10-02', 100)]);
    const [toBank] = occurrencesOf([earn('c', '2026-10-02', 100, { destinationId: 'pm.leumi' })]);
    const [onCard] = occurrencesOf([spend('e', '2026-10-02', 100, { paymentMethodId: 'visa' })]);
    expect(isCashIn(cashIn!)).toBe(true);
    expect(isCashOut(cashOut!)).toBe(true);
    expect([cashSigned(cashIn!), cashSigned(cashOut!), cashSigned(toBank!), cashSigned(onCard!)]).toEqual([
      100, -100, 0, 0,
    ]);
  });

  it('moves cash in on a start or a withdrawal, out on a deposit, and not at all on a count or a kind it does not know', () => {
    expect(moveSigned({ kind: 'start', amountMinor: 500 })).toBe(500);
    expect(moveSigned({ kind: 'withdraw', amountMinor: 200 })).toBe(200);
    expect(moveSigned({ kind: 'deposit', amountMinor: 100 })).toBe(-100);
    expect(moveSigned({ kind: 'count', amountMinor: 0 })).toBe(0);
    expect(moveSigned({ kind: 'exchange', amountMinor: 999 })).toBe(0);
  });
});

describe('a person’s cash', () => {
  it('adds the start, withdrawals and cash income, and takes off deposits and cash spending', () => {
    const result = summary(
      [
        start('2026-10-01', 50_000),
        move({ kind: 'withdraw', date: d('2026-10-02'), amountMinor: 20_000 }),
        move({ kind: 'deposit', date: d('2026-10-03'), amountMinor: 10_000 }),
      ],
      [earn('in', '2026-10-04', 3_000), spend('out', '2026-10-05', 5_000)],
    );
    expect(result.onHandMinor).toBe(58_000);
    expect(result.people).toEqual([
      { profileId: 'p1', since: '2026-10-01', onHandMinor: 58_000, countedOn: '2026-10-01' },
    ]);
  });

  it('leaves out income sent to an account, card spending, and rows with no method', () => {
    const result = summary(
      [start('2026-10-01', 50_000)],
      [
        earn('bank', '2026-10-02', 9_000, { destinationId: 'pm.leumi' }),
        earn('none', '2026-10-02', 9_000, { destinationId: undefined }),
        spend('card', '2026-10-03', 4_000, { paymentMethodId: 'visa' }),
        spend('blank', '2026-10-03', 4_000, { paymentMethodId: undefined }),
      ],
    );
    expect(result.onHandMinor).toBe(50_000);
  });

  it('counts nothing from before the first start, but does count the start day itself', () => {
    const result = summary(
      [start('2026-10-01', 50_000), move({ kind: 'withdraw', date: d('2026-09-25'), amountMinor: 20_000 })],
      [spend('old', '2026-09-20', 5_000), spend('same-day', '2026-10-01', 1_000)],
    );
    expect(result.onHandMinor).toBe(49_000);
  });

  it('has no figure for someone who has not set up, and says who', () => {
    const result = summary(
      [start('2026-10-01', 50_000)],
      [spend('p2s', '2026-10-02', 700, { profileId: 'p2' })],
      ['p1', 'p2'],
    );
    expect(result.people.map((p) => p.profileId)).toEqual(['p1']);
    expect(result.notSetUp).toEqual(['p2']);
    expect(result.onHandMinor).toBe(50_000);
    expect(personCash('p2', [], [], TODAY)).toBeUndefined();
  });

  it('is not set up by a start dated after today, until that day', () => {
    const moves = [
      start('2026-10-20', 50_000),
      move({ kind: 'withdraw', date: d('2026-10-02'), amountMinor: 20_000 }),
    ];
    const result = summary(moves, [earn('in', '2026-10-03', 3_000)]);
    expect(result.notSetUp).toEqual(['p1']);
    expect(result.people).toEqual([]);
    expect(result.onHandMinor).toBe(0);
    expect(cashSince(moves, 'p1')).toBe('2026-10-20');
  });

  it('goes below zero when more was spent in cash than it had', () => {
    expect(summary([start('2026-10-01', 1_000)], [spend('big', '2026-10-02', 3_000)]).onHandMinor).toBe(
      -2_000,
    );
  });

  it('ignores a kind a later build added, a count, and a deleted move', () => {
    const result = summary([
      start('2026-10-01', 50_000),
      move({ kind: 'exchange', date: d('2026-10-02'), amountMinor: 999 }),
      move({ kind: 'count', date: d('2026-10-03'), amountMinor: 0 }),
      move({ kind: 'withdraw', date: d('2026-10-04'), amountMinor: 20_000, isDeleted: 1 }),
    ]);
    expect(result.onHandMinor).toBe(50_000);
  });

  it('starts again from the first live start once that start is deleted', () => {
    const moves = [
      { ...start('2026-09-01', 10_000), isDeleted: 1 as const },
      start('2026-10-01', 50_000),
      move({ kind: 'withdraw', date: d('2026-09-15'), amountMinor: 700 }),
    ];
    expect(cashSince(moves, 'p1')).toBe('2026-10-01');
    const result = summary(moves, [spend('before', '2026-09-20', 5_000), spend('on', '2026-10-01', 300)]);
    expect(result.people[0]).toMatchObject({ since: '2026-10-01', onHandMinor: 49_700 });
  });

  it('never returns negative zero', () => {
    const result = summary([start('2026-10-01', 0)], [spend('free', '2026-10-02', 0)]);
    expect(Object.is(result.onHandMinor, 0)).toBe(true);
    expect(Object.is(result.people[0]!.onHandMinor, 0)).toBe(true);
    const [free] = occurrencesOf([spend('free', '2026-10-02', 0)]);
    expect(Object.is(cashSigned(free!), 0)).toBe(true);
    expect(Object.is(moveSigned({ kind: 'deposit', amountMinor: 0 }), 0)).toBe(true);
  });

  it('uses the base amount, not the original', () => {
    const result = summary(
      [start('2026-10-01', 50_000)],
      [
        spend('usd', '2026-10-02', 100, { money: money(100, 370) }),
        earn('eur', '2026-10-03', 200, { money: money(200, 800) }),
      ],
    );
    expect(result.onHandMinor).toBe(50_000 - 370 + 800);
  });

  it('leaves out skipped payments from the figure, what is expected and the activity', () => {
    const salary = earn('sal', '2026-08-01', 1_000, { recurrence: { type: 'monthly', dayOfMonth: 1 } });
    const skipped = [skip('sal', d('2026-09-01')), skip('sal', d('2026-10-20'))];
    const later = earn('sal', '2026-08-20', 1_000, { recurrence: { type: 'monthly', dayOfMonth: 20 } });
    const input = (tx: Transaction) => ({
      profileIds: ['p1'],
      moves: [start('2026-08-01', 0)],
      occurrences: occurrencesOf([tx], skipped),
      today: TODAY,
    });
    expect(cashSummary(input(salary)).onHandMinor).toBe(2_000);
    expect(cashActivity(input(salary)).filter((a) => a.type === 'occurrence')).toHaveLength(2);
    expect(cashSummary(input(later)).expected).toEqual({ inMinor: 0, outMinor: 0 });
  });

  it('leaves out moves dated after today, and counts one dated today', () => {
    const result = summary([
      start('2026-10-01', 50_000),
      move({ kind: 'withdraw', date: d('2026-10-10'), amountMinor: 20_000 }),
      move({ kind: 'deposit', date: d('2026-10-15'), amountMinor: 7_000 }),
      move({ kind: 'deposit', date: d('2026-10-09'), amountMinor: 3_000 }),
    ]);
    expect(result.onHandMinor).toBe(47_000);
  });

  it('counts a row dated today on hand, and only later rows this month as expected', () => {
    const result = summary(
      [start('2026-10-01', 0)],
      [
        earn('in-today', '2026-10-09', 100),
        spend('out-today', '2026-10-09', 40),
        earn('in-later', '2026-10-10', 7),
        spend('out-end', '2026-10-31', 3),
        spend('out-next', '2026-11-01', 11),
      ],
    );
    expect(result.onHandMinor).toBe(60);
    expect(result.expected).toEqual({ inMinor: 7, outMinor: 3 });
  });

  it('reads income from the destination and spending from the method, whatever else is set', () => {
    const result = summary(
      [start('2026-10-01', 50_000)],
      [
        earn('inc', '2026-10-02', 9_000, { destinationId: undefined, paymentMethodId: CASH_METHOD_ID }),
        spend('exp', '2026-10-03', 4_000, { paymentMethodId: undefined, destinationId: CASH_METHOD_ID }),
      ],
    );
    expect(result.onHandMinor).toBe(50_000);
  });

  it('starts at the earliest of two live starts, and counts only its amount', () => {
    const moves = [
      start('2026-10-01', 10_000),
      start('2026-10-05', 3_000),
      move({ kind: 'withdraw', date: d('2026-10-02'), amountMinor: 500 }),
    ];
    const result = summary(moves);
    expect(result.people[0]).toMatchObject({ since: '2026-10-01', onHandMinor: 10_500 });
  });

  it('counts 500 from two starts of 500 and 300: the later one is ignored until it is removed', () => {
    const result = summary([start('2026-10-01', 50_000), start('2026-10-05', 30_000)]);
    expect(result.onHandMinor).toBe(50_000);
  });

  it('keeps, of two starts on one day, the earlier written, then the lower id', () => {
    const later = move({
      id: 'a',
      kind: 'start',
      date: d('2026-10-01'),
      amountMinor: 30_000,
      createdAt: '2026-10-01T09:00:00.000Z' as IsoInstant,
    });
    const earlier = move({
      id: 'b',
      kind: 'start',
      date: d('2026-10-01'),
      amountMinor: 50_000,
      createdAt: '2026-10-01T08:00:00.000Z' as IsoInstant,
    });
    expect(summary([later, earlier]).onHandMinor).toBe(50_000);
    expect(earliestStart([later, earlier], 'p1')?.id).toBe('b');

    const sameTime = { ...later, createdAt: earlier.createdAt };
    expect(summary([earlier, sameTime]).onHandMinor).toBe(30_000);
    expect(earliestStart([earlier, sameTime], 'p1')?.id).toBe('a');
  });

  it('leaves a later start out of the activity too, so the list adds up to the figure', () => {
    const activity = cashActivity({
      profileIds: ['p1'],
      moves: [start('2026-10-01', 50_000), start('2026-10-05', 30_000)],
      occurrences: [],
      today: TODAY,
    });
    expect(activity.map((a) => a.signedMinor)).toEqual([50_000]);
  });

  it('follows the row’s person: a row given to someone else takes its cash with it', () => {
    const moves = [start('2026-10-01', 50_000), start('2026-10-01', 30_000, 'p2')];
    const result = summary(moves, [spend('moved', '2026-10-02', 5_000, { profileId: 'p2' })], ['p1', 'p2']);
    expect(result.people.map((p) => p.onHandMinor)).toEqual([50_000, 25_000]);
  });
});

describe('a recurring cash income', () => {
  const salary = (over: Partial<Transaction> = {}) =>
    earn('salary', '2026-06-01', 1_000, { recurrence: { type: 'monthly', dayOfMonth: 1 }, ...over });

  it('counts each payment from the start up to today', () => {
    // June to September are before the start; November is after today.
    expect(summary([start('2026-09-15', 10_000)], [salary()]).onHandMinor).toBe(11_000);
  });

  it('counts one payment sent to cash by an override, and only that one', () => {
    const toCash = [modify('salary', d('2026-09-01'), { destinationId: CASH_METHOD_ID })];
    const result = summary(
      [start('2026-08-01', 10_000)],
      [salary({ destinationId: 'pm.leumi' })],
      ['p1'],
      toCash,
    );
    expect(result.onHandMinor).toBe(11_000);
  });

  it('leaves out one payment an override sends elsewhere', () => {
    const away = [modify('salary', d('2026-09-01'), { destinationId: null })];
    const result = summary([start('2026-08-01', 10_000)], [salary()], ['p1'], away);
    // August and October, not September.
    expect(result.onHandMinor).toBe(12_000);
  });
});

describe('everyone’s cash', () => {
  it('adds up only the people who set up, and keeps each one’s figure', () => {
    const result = summary(
      [start('2026-10-01', 50_000), start('2026-10-01', 30_000, 'p2')],
      [spend('p2s', '2026-10-02', 5_000, { profileId: 'p2' })],
      ['p1', 'p2', 'p3'],
    );
    expect(result.onHandMinor).toBe(75_000);
    expect(result.people.map((p) => [p.profileId, p.onHandMinor])).toEqual([
      ['p1', 50_000],
      ['p2', 25_000],
    ]);
    expect(result.notSetUp).toEqual(['p3']);
  });
});

describe('what is still to come this month', () => {
  it('leaves rows after today out of what is on hand, and shows this month’s as expected', () => {
    const result = summary(
      [start('2026-10-01', 50_000)],
      [
        earn('later', '2026-10-20', 1_000),
        spend('soon', '2026-10-25', 400),
        spend('next', '2026-11-05', 900),
      ],
    );
    expect(result.onHandMinor).toBe(50_000);
    expect(result.expected).toEqual({ inMinor: 1_000, outMinor: 400 });
  });

  it('expects nothing for someone who has not set up', () => {
    expect(summary([], [earn('later', '2026-10-20', 1_000)]).expected).toEqual({ inMinor: 0, outMinor: 0 });
  });
});

describe('when it was counted', () => {
  it('is the start day until a count, then the latest count or recount', () => {
    expect(summary([start('2026-10-01', 50_000)]).countedOn).toBe('2026-10-01');

    const counted = [
      start('2026-10-01', 50_000),
      move({ kind: 'count', date: d('2026-10-03'), amountMinor: 0 }),
    ];
    expect(summary(counted).countedOn).toBe('2026-10-03');

    const recount = spend('rc', '2026-10-05', 1_000, { cashCount: true });
    expect(summary(counted, [recount]).countedOn).toBe('2026-10-05');
  });

  it('is, for everyone, the person counted longest ago', () => {
    const result = summary(
      [
        start('2026-10-01', 50_000),
        move({ kind: 'count', date: d('2026-10-08'), amountMinor: 0 }),
        start('2026-10-02', 30_000, 'p2'),
      ],
      [],
      ['p1', 'p2'],
    );
    expect(result.people.map((p) => p.countedOn)).toEqual(['2026-10-08', '2026-10-02']);
    expect(result.countedOn).toBe('2026-10-02');
  });

  it('is unknown when nobody has set up', () => {
    expect(summary([]).countedOn).toBeUndefined();
  });
});

describe('the activity', () => {
  it('lists cash rows and moves newest first, marks a recount, and leaves counts out', () => {
    const moves = [
      start('2026-10-01', 50_000),
      move({ kind: 'withdraw', date: d('2026-10-02'), amountMinor: 20_000 }),
      move({ kind: 'count', date: d('2026-10-05'), amountMinor: 0 }),
    ];
    const txs = [spend('rc', '2026-10-03', 1_000, { cashCount: true }), earn('in', '2026-10-04', 3_000)];
    const activity = cashActivity({
      profileIds: ['p1'],
      moves,
      occurrences: occurrencesOf(txs),
      today: TODAY,
    });

    expect(activity.map((a) => [a.date, a.type, a.signedMinor])).toEqual([
      ['2026-10-04', 'occurrence', 3_000],
      ['2026-10-03', 'occurrence', -1_000],
      ['2026-10-02', 'move', 20_000],
      ['2026-10-01', 'move', 50_000],
    ]);
    expect(activity.filter((a) => a.type === 'occurrence').map((a) => a.recount)).toEqual([false, true]);
  });

  it('leaves out a deleted move, and puts the newest-written first within a day', () => {
    const older = move({ kind: 'withdraw', date: d('2026-10-02'), amountMinor: 100 });
    const newer = move({
      kind: 'deposit',
      date: d('2026-10-02'),
      amountMinor: 200,
      createdAt: '2026-10-02T00:00:00.000Z' as IsoInstant,
    });
    const gone = move({ kind: 'withdraw', date: d('2026-10-03'), amountMinor: 300, isDeleted: 1 });
    const activity = cashActivity({
      profileIds: ['p1'],
      moves: [start('2026-10-01', 0), older, gone, newer],
      occurrences: [],
      today: TODAY,
    });
    expect(activity.map((a) => a.signedMinor)).toEqual([-200, 100, 0]);
  });

  it('shows only the people in view, from their own start, and nothing after today', () => {
    const moves = [start('2026-10-01', 50_000), start('2026-10-01', 30_000, 'p2')];
    const txs = [
      spend('old', '2026-09-30', 100),
      spend('theirs', '2026-10-02', 100, { profileId: 'p2' }),
      spend('later', '2026-10-20', 100),
    ];
    const activity = cashActivity({
      profileIds: ['p1'],
      moves,
      occurrences: occurrencesOf(txs),
      today: TODAY,
    });
    expect(activity.map((a) => a.key)).toEqual(['move:p1-start-2026-10-01-50000']);
  });
});
