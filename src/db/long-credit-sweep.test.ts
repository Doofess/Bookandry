import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { d, makeTx, MONEY } from '@/domain/test-factories';
import { longCreditPayments, presentValueMinor, spitzerPayment } from '@/lib/money';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { Recurrence, Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { LOCK_SYNC, withLock } from './lock';
import { sweepLongCredit } from './long-credit-sweep';
import { applyUndoablePlan } from './occurrence-actions';

const EDITED = '2027-07-04T09:00:00.000Z' as IsoInstant;
const SWEPT = '2027-07-04T09:00:02.000Z' as IsoInstant;
const UNDONE = '2027-07-04T09:00:05.000Z' as IsoInstant;

type Reset = NonNullable<Extract<Recurrence, { type: 'monthly' }>['reset']>;

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
});
afterEach(async () => {
  await handle.dispose();
});

// Max's קרדיט פלוס: ₪3,000 over 24 at 15.5%, bought at prime 6; payment 19 is due 5 July 2027.
const payment = spitzerPayment(300_000, '15.5', 24);
const money = {
  ...MONEY,
  currency: 'ILS',
  baseCurrency: 'ILS',
  amountMinor: payment,
  baseAmountMinor: payment,
};
const plan = (id: string, reset: Reset | undefined): Transaction =>
  makeTx({
    id,
    date: d('2026-01-05'),
    money,
    recurrence: {
      type: 'monthly',
      dayOfMonth: 5,
      installments: 24,
      plan: 'credit',
      creditAnnualRate: '15.5',
      ...(reset === undefined ? {} : { reset }),
    },
  });
const fresh: Reset = { atPayment: 19, primeAtPurchase: '6' };
const principal = presentValueMinor(Array<number>(24).fill(payment), '15.5');
const after = (rate: string) => longCreditPayments(principal, '15.5', 24, { atPayment: 19, rate }).afterReset;

const resetOf = async (id: string) => {
  const row = await handle.db.transactions.get(id);
  return row?.recurrence.type === 'monthly' ? row.recurrence.reset : undefined;
};
const queued = async () => (await handle.db.outbox.toArray()).map((r) => `${r.tbl}:${r.id}`);

describe('sweepLongCredit', () => {
  it('before payment 19 is due, re-prices it when prime moves, as an edit that syncs', async () => {
    await handle.db.transactions.put(plan('tv', fresh));
    await handle.db.outbox.clear();

    expect(await sweepLongCredit(handle.db, '6.5', d('2027-07-04'), SWEPT)).toBe(1);
    expect(await resetOf('tv')).toEqual({ ...fresh, rate: '16', paymentMinor: after('16') });
    expect(await queued()).toEqual(['transactions:tv']);

    // Prime moves again before the date: re-priced again.
    expect(await sweepLongCredit(handle.db, '5.5', d('2027-07-04'), SWEPT)).toBe(1);
    expect(await resetOf('tv')).toEqual({ ...fresh, rate: '15', paymentMinor: after('15') });
  });

  it('on and after the date, freezes; a later prime change leaves it as it froze', async () => {
    await handle.db.transactions.put(plan('tv', fresh));
    expect(await sweepLongCredit(handle.db, '6.5', d('2027-07-05'), SWEPT)).toBe(1);
    const frozen = { ...fresh, rate: '16', paymentMinor: after('16'), frozen: true };
    expect(await resetOf('tv')).toEqual(frozen);

    await handle.db.outbox.clear();
    expect(await sweepLongCredit(handle.db, '9', d('2027-09-01'), SWEPT)).toBe(0);
    expect(await resetOf('tv')).toEqual(frozen);
    expect(await queued()).toEqual([]);
  });

  it('never touches a row frozen elsewhere, even one this device would price differently', async () => {
    const elsewhere = { ...fresh, rate: '17', paymentMinor: 1, frozen: true } as const;
    const row = plan('tv', elsewhere);
    await handle.db.transactions.put(row);
    await handle.db.outbox.clear();
    expect(await sweepLongCredit(handle.db, '6.5', d('2027-07-04'), SWEPT)).toBe(0);
    expect(await handle.db.transactions.get('tv')).toEqual(row);
    expect(await queued()).toEqual([]);
  });

  it('writes nothing the second time, and nothing at all for plans without a reset', async () => {
    await handle.db.transactions.bulkPut([plan('tv', fresh), plan('sofa', undefined)]);
    await sweepLongCredit(handle.db, '6.5', d('2027-07-04'), SWEPT);
    await handle.db.outbox.clear();
    const before = await handle.db.transactions.toArray();

    expect(await sweepLongCredit(handle.db, '6.5', d('2027-07-04'), SWEPT)).toBe(0);
    expect(await handle.db.transactions.toArray()).toEqual(before);
    expect(await queued()).toEqual([]);
    expect(await resetOf('sofa')).toBeUndefined();
  });

  it('keeps an edit made while it waited for the sync lock, and changes only the reset', async () => {
    await handle.db.transactions.put(plan('tv', fresh));

    let release = (): void => undefined;
    const held = withLock(LOCK_SYNC, () => new Promise<void>((resolve) => (release = resolve)));
    const sweep = sweepLongCredit(handle.db, '6.5', d('2027-07-04'), SWEPT);
    // Let it find the plan and queue for the lock, then a pull lands an edit.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const row = (await handle.db.transactions.get('tv'))!;
    await handle.db.transactions.put({ ...row, note: 'Edited elsewhere', categoryId: 'cat.home' });
    release();
    await held;

    expect(await sweep).toBe(1);
    const swept = await handle.db.transactions.get('tv');
    expect(swept).toEqual({
      ...row,
      note: 'Edited elsewhere',
      categoryId: 'cat.home',
      recurrence: { ...row.recurrence, reset: { ...fresh, rate: '16', paymentMinor: after('16') } },
      updatedAt: SWEPT,
    });
  });

  it('stamps what it writes, so an Undo from before it refuses rather than put the old price back', async () => {
    await handle.db.transactions.put(plan('tv', fresh));
    const row = (await handle.db.transactions.get('tv'))!;
    const undoable = await applyUndoablePlan(handle.db, {
      transactions: [{ ...row, note: 'Sofa', updatedAt: EDITED }],
      overrides: [],
      deleteOverrideIds: [],
      warnings: [],
      effectiveScope: 'all',
    });

    expect(await sweepLongCredit(handle.db, '6.5', d('2027-07-04'), SWEPT)).toBe(1);
    await expect(undoable.undo(UNDONE)).rejects.toThrow('changed_since');
    expect(await resetOf('tv')).toEqual({ ...fresh, rate: '16', paymentMinor: after('16') });
    expect((await handle.db.transactions.get('tv'))?.note).toBe('Sofa');
  });

  it('skips a plan that froze while it waited for the lock', async () => {
    await handle.db.transactions.put(plan('tv', fresh));
    let release = (): void => undefined;
    const held = withLock(LOCK_SYNC, () => new Promise<void>((resolve) => (release = resolve)));
    const sweep = sweepLongCredit(handle.db, '9', d('2027-07-04'), SWEPT);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const pulled = plan('tv', { ...fresh, rate: '16', paymentMinor: 123, frozen: true });
    await handle.db.transactions.put(pulled);
    release();
    await held;

    expect(await sweep).toBe(0);
    expect(await handle.db.transactions.get('tv')).toEqual(pulled);
  });
});
