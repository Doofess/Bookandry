import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { chargeDate } from '@/domain/cards';
import { expandOccurrences } from '@/domain/occurrences';
import { splitTiming } from '@/domain/split-purchase';
import { d, makeTx, modify, MONEY } from '@/domain/test-factories';
import { counterIdFactory } from '@/lib/id';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { NotSplittableError, splitPurchase, type SplitPurchaseInput } from './split-purchase';

const NOW = '2026-10-12T09:00:00.000Z' as IsoInstant;

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
});
afterEach(async () => {
  await handle.dispose();
});

const ils = {
  ...MONEY,
  currency: 'ILS',
  baseCurrency: 'ILS',
  amountMinor: 120_000,
  baseAmountMinor: 120_000,
};
const purchase = (date: string, over: Partial<Transaction> = {}) =>
  makeTx({
    id: 'tv',
    date: d(date),
    recurrence: { type: 'one_time' },
    money: ils,
    paymentMethodId: 'max',
    ...over,
  });

const input = (over: Partial<SplitPurchaseInput>): SplitPurchaseInput => ({
  transactionId: 'tv',
  count: 3,
  rate: '12',
  totalMinor: 122_412,
  timing: splitTiming(d('2026-10-02'), 10, d('2026-10-08')),
  primeRate: '4.75',
  now: NOW,
  newId: counterIdFactory('ov'),
  ...over,
});

const payments = (tx: Transaction, overrides = [] as Parameters<typeof expandOccurrences>[1]) =>
  expandOccurrences(tx, overrides, d('2026-01-01'), d('2027-12-31'), { today: d('2026-10-12') });

describe('splitPurchase', () => {
  it('not yet billed: the same row becomes the plan, its first payment on the purchase’s own bill', async () => {
    await handle.db.transactions.put(purchase('2026-10-02'));
    await handle.db.outbox.clear();
    const timing = splitTiming(d('2026-10-02'), 10, d('2026-10-08'));
    await splitPurchase(handle.db, input({ timing }));

    expect(await handle.db.transactions.count()).toBe(1);
    const row = (await handle.db.transactions.get('tv'))!;
    expect(row).toMatchObject({
      id: 'tv',
      date: '2026-10-02',
      seriesStart: '2026-10-02',
      updatedAt: NOW,
      recurrence: { type: 'monthly', dayOfMonth: 2, installments: 3, plan: 'credit', creditAnnualRate: '12' },
    });
    const list = payments(row, await handle.db.overrides.toArray());
    expect(list).toHaveLength(3);
    expect(chargeDate(list[0]!.date, 10)).toBe('2026-11-10');
    // The total split exactly, the first absorbing the remainder: 40,804 × 3.
    expect(list.map((o) => o.money.amountMinor)).toEqual([40_804, 40_804, 40_804]);
    expect((await handle.db.outbox.toArray()).map((r) => r.id)).toContain('tv');
  });

  it('already billed: the first payment is the bill after next', async () => {
    await handle.db.transactions.put(purchase('2026-09-02'));
    const timing = splitTiming(d('2026-09-02'), 10, d('2026-10-12'));
    await splitPurchase(handle.db, input({ timing, totalMinor: 122_413 }));

    const row = (await handle.db.transactions.get('tv'))!;
    expect(row).toMatchObject({ id: 'tv', date: '2026-11-02', recurrence: { dayOfMonth: 2 } });
    const list = payments(row, await handle.db.overrides.toArray());
    expect(chargeDate(list[0]!.date, 10)).toBe('2026-12-10');
    expect(list.map((o) => o.money.amountMinor)).toEqual([40_805, 40_804, 40_804]);
    expect(list.reduce((sum, o) => sum + o.money.baseAmountMinor, 0)).toBe(122_413);
  });

  it('splits what was on screen, and lets the one-off’s own edit go', async () => {
    const edited = modify('tv', d('2026-10-02'), {
      money: { ...ils, amountMinor: 90_000, baseAmountMinor: 90_000 },
      note: 'Television',
      categoryId: 'cat.home',
      paymentMethodId: 'max',
    });
    await handle.db.transactions.put(purchase('2026-10-02', { note: 'TV' }));
    await handle.db.overrides.put(edited);
    await splitPurchase(handle.db, input({ totalMinor: 91_809 }));

    const row = (await handle.db.transactions.get('tv'))!;
    expect(row).toMatchObject({ note: 'Television', categoryId: 'cat.home', paymentMethodId: 'max' });
    expect((await handle.db.overrides.toArray()).map((o) => o.id)).not.toContain(edited.id);
  });

  it('records prime today where the deal re-prices with it', async () => {
    await handle.db.transactions.put(purchase('2026-10-02'));
    await splitPurchase(handle.db, input({ count: 24, resetAt: 19, totalMinor: 135_576 }));
    const row = await handle.db.transactions.get('tv');
    expect(row?.recurrence).toMatchObject({ reset: { atPayment: 19, primeAtPurchase: '4.75' } });
  });

  it('refuses a row that is no longer a one-off purchase', async () => {
    await expect(splitPurchase(handle.db, input({}))).rejects.toBeInstanceOf(NotSplittableError);
    await handle.db.transactions.put(purchase('2026-10-02', { isDeleted: 1 }));
    await expect(splitPurchase(handle.db, input({}))).rejects.toBeInstanceOf(NotSplittableError);
  });
});
