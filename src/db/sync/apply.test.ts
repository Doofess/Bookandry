import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { updatePaymentMethod } from '@/db/repos/payment-methods';
import { makeRev } from '@/lib/rev';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { IsoInstant } from '@/types/money';

import { applyPage } from './apply';

const NOW = '2026-10-08T10:00:00.000Z' as IsoInstant;

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
});
afterEach(async () => {
  await handle.dispose();
});

/** A card as a later release might write it: a kind and a basis this one has never heard of. */
const laterCard = {
  billingDay: 10,
  catalog: { issuer: 'max', bank: '20', tier: 'international', version: 1 },
  overrides: {
    credit: { basis: 'prime', margin: '9' },
    long_credit: { basis: 'cpi', margin: '2', since: '2026-10' },
    revolving: { basis: 'prime', margin: '6', minPaymentPercent: '5' },
  },
};

const row = (card: unknown) => ({
  id: 'pm.max',
  profileId: 'p1',
  type: 'credit_card',
  label: 'Max',
  card,
  isArchived: 0,
  createdAt: NOW,
  updatedAt: NOW,
});

const record = (card: unknown) => ({
  tbl: 'paymentMethods' as const,
  id: 'pm.max',
  rev: makeRev({ ms: 1_000, counter: 0, deviceId: 'abcdefgh' }),
  deleted: false,
  row: row(card),
});

describe('a pulled card with rates a later release added', () => {
  it('is applied, kept whole, and survives an edit here', async () => {
    const report = await applyPage(handle.db, [record(laterCard)], 1);
    expect(report).toEqual({ applied: 1, skipped: 0, rejected: 0 });
    expect((await handle.db.paymentMethods.get('pm.max'))?.card).toEqual(laterCard);

    await updatePaymentMethod(handle.db, 'pm.max', { card: { ...laterCard, billingDay: 15 } as never }, NOW);
    expect((await handle.db.paymentMethods.get('pm.max'))?.card).toEqual({ ...laterCard, billingDay: 15 });
  });

  it('is still refused when a rate this release knows does not read', async () => {
    const bad = {
      ...laterCard,
      overrides: { ...laterCard.overrides, credit: { basis: 'prime', margin: 'x' } },
    };
    const report = await applyPage(handle.db, [record(bad)], 1);
    expect(report.rejected).toBe(1);
    expect(await handle.db.paymentMethods.get('pm.max')).toBeUndefined();
  });
});
