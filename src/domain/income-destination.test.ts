import { describe, expect, it } from 'vitest';

import {
  CASH_METHOD_ID,
  SHARED_OWNER,
  type Occurrence,
  type PaymentMethod,
  type Transaction,
} from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { defaultDestination, destinationsFor, isDestinationType, nextIncoming } from './income-destination';
import { expandOccurrences } from './occurrences';
import { d, makeTx, MONEY, skip } from './test-factories';

const AT = '2026-01-01T00:00:00.000Z' as IsoInstant;
const TODAY = d('2026-10-09');

const method = (id: string, over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id,
  profileId: 'p1',
  type: 'bank_account',
  label: id,
  account: { bank: '10', holding: 'personal' },
  isArchived: 0,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});
const cash = method(CASH_METHOD_ID, {
  profileId: SHARED_OWNER,
  type: 'cash',
  label: 'Cash',
  account: undefined,
});
const card = method('visa', { type: 'credit_card', account: undefined });
const leumi = method('Leumi');
const hapoalim = method('Hapoalim');
const joint = method('Joint', {
  profileId: SHARED_OWNER,
  account: { bank: '12', holding: 'joint', holders: ['p1', 'p2'] },
});
const parents = method('Parents', {
  profileId: SHARED_OWNER,
  account: { bank: '12', holding: 'joint', holders: ['p2', 'p3'] },
});
const yossis = method('Yossi', { profileId: 'p2' });
const closed = method('Closed', { isArchived: 1 });
const ALL = [cash, card, leumi, hapoalim, joint, parents, yossis, closed];

describe('where income can go', () => {
  it('is a bank account or cash, never a card', () => {
    expect(isDestinationType(leumi)).toBe(true);
    expect(isDestinationType(cash)).toBe(true);
    expect(isDestinationType(card)).toBe(false);
    expect(isDestinationType(method('wallet', { type: 'digital_wallet' }))).toBe(false);
  });

  it('is the person’s own accounts and the joint ones they hold, by name, then cash', () => {
    expect(destinationsFor(ALL, 'p1').map((m) => m.id)).toEqual([
      'Hapoalim',
      'Joint',
      'Leumi',
      CASH_METHOD_ID,
    ]);
    expect(destinationsFor(ALL, 'p2').map((m) => m.id)).toEqual([
      'Joint',
      'Parents',
      'Yossi',
      CASH_METHOD_ID,
    ]);
  });

  it('keeps an archived account already on the row, and offers it to no one else', () => {
    expect(destinationsFor(ALL, 'p1', 'Closed').map((m) => m.id)).toContain('Closed');
    expect(destinationsFor(ALL, 'p1').map((m) => m.id)).not.toContain('Closed');
  });
});

describe('where new income goes by default', () => {
  const income = (
    id: string,
    date: string,
    destinationId: string | undefined,
    over: Partial<Transaction> = {},
  ) =>
    makeTx({
      id,
      kind: 'income',
      categoryId: 'cat.salary',
      date: d(date),
      recurrence: { type: 'one_time' },
      money: MONEY,
      ...(destinationId === undefined ? {} : { destinationId }),
      ...over,
    });
  const history = (...txs: Transaction[]): Occurrence[] =>
    txs.flatMap((tx) => expandOccurrences(tx, [], d('2025-01-01'), TODAY, { today: TODAY }));

  it('is where this person’s income went most often in the last six months, counted by payment', () => {
    const salary = income('salary', '2026-05-01', 'Leumi', {
      recurrence: { type: 'monthly', dayOfMonth: 1 },
    });
    const gifts = [income('g1', '2026-09-01', CASH_METHOD_ID), income('g2', '2026-09-02', CASH_METHOD_ID)];
    expect(defaultDestination(history(salary, ...gifts), 'p1', ALL, TODAY)).toBe('Leumi');
  });

  it('goes to the more recent of two equally frequent', () => {
    const txs = [income('a', '2026-06-01', 'Leumi'), income('b', '2026-08-01', 'Hapoalim')];
    expect(defaultDestination(history(...txs), 'p1', ALL, TODAY)).toBe('Hapoalim');
  });

  it('is not assigned when nothing in six months said where it went', () => {
    const txs = [income('old', '2026-03-01', 'Leumi'), income('blank', '2026-09-01', undefined)];
    expect(defaultDestination(history(...txs), 'p1', ALL, TODAY)).toBe('');
  });

  it('counts only this person’s income, and only somewhere they can still use', () => {
    const txs = [
      income('theirs', '2026-09-01', 'Yossi', { profileId: 'p2' }),
      income('archived', '2026-09-02', 'Closed'),
      income('gone', '2026-09-03', 'pm.deleted'),
    ];
    expect(defaultDestination(history(...txs), 'p1', ALL, TODAY)).toBe('');
  });

  const wide = (txs: Transaction[], overrides: Parameters<typeof expandOccurrences>[1] = []) =>
    txs.flatMap((tx) =>
      expandOccurrences(tx, overrides, d('2025-01-01'), d('2030-01-01'), {
        today: TODAY,
        includeSkipped: true,
      }),
    );

  it('does not count a skipped payment', () => {
    const salary = income('salary', '2026-07-01', 'Leumi', {
      recurrence: { type: 'monthly', dayOfMonth: 1 },
    });
    const skips = ['07', '08', '09', '10'].map((m) => skip('salary', d(`2026-${m}-01`)));
    const found = wide([salary, income('o', '2026-09-05', 'Hapoalim')], skips);
    expect(found.some((o) => o.isSkipped)).toBe(true);
    expect(defaultDestination(found, 'p1', ALL, TODAY)).toBe('Hapoalim');
  });

  it('does not count someone else’s income, even to a place this person can use', () => {
    const txs = [
      income('p2cash', '2026-09-01', CASH_METHOD_ID, { profileId: 'p2' }),
      income('p2joint', '2026-09-02', 'Joint', { profileId: 'p2' }),
    ];
    expect(defaultDestination(history(...txs), 'p1', ALL, TODAY)).toBe('');
  });

  it('counts from exactly six months ago, not a day before, and never the future', () => {
    const at = (date: string) => defaultDestination(wide([income('x', date, 'Leumi')]), 'p1', ALL, TODAY);
    expect(at('2026-04-09')).toBe('Leumi');
    expect(at('2026-04-08')).toBe('');
    expect(at('2026-10-09')).toBe('Leumi');
    expect(at('2026-10-10')).toBe('');
  });
});

describe('the next income into each account', () => {
  it('is the earliest payment after today for each destination', () => {
    const salary = makeTx({
      id: 'salary',
      kind: 'income',
      categoryId: 'cat.salary',
      date: d('2026-08-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10 },
      destinationId: 'Leumi',
    });
    const gift = makeTx({
      id: 'gift',
      kind: 'income',
      categoryId: 'cat.gift',
      date: d('2026-10-20'),
      recurrence: { type: 'one_time' },
      destinationId: CASH_METHOD_ID,
    });
    const today = makeTx({
      id: 'today',
      kind: 'income',
      categoryId: 'cat.gift',
      date: TODAY,
      recurrence: { type: 'one_time' },
      destinationId: 'Hapoalim',
    });
    const all = [salary, gift, today].flatMap((tx) =>
      expandOccurrences(tx, [], TODAY, d('2027-10-31'), { today: TODAY }),
    );

    const next = nextIncoming(all, TODAY);
    expect(next.get('Leumi')?.date).toBe('2026-10-10');
    expect(next.get(CASH_METHOD_ID)?.date).toBe('2026-10-20');
    // Arriving today is not "expected": it is already here.
    expect(next.has('Hapoalim')).toBe(false);
  });

  it('does not choose a skipped earlier payment', () => {
    const salary = makeTx({
      id: 'salary',
      kind: 'income',
      categoryId: 'cat.salary',
      date: d('2026-08-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10 },
      destinationId: 'Leumi',
    });
    const all = expandOccurrences(salary, [skip('salary', d('2026-10-10'))], TODAY, d('2027-10-31'), {
      today: TODAY,
      includeSkipped: true,
    });
    expect(all.some((o) => o.isSkipped)).toBe(true);
    expect(nextIncoming(all, TODAY).get('Leumi')?.date).toBe('2026-11-10');
  });
});
