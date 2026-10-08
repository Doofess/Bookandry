import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as CatalogModule from '@/data/card-catalog';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { IsoInstant, LocalDate } from '@/types/money';

import { refreshCatalogCards } from './catalog-refresh';
import { createPaymentMethod } from './repos/payment-methods';

// The catalog one release ahead of a card linked at version 1; and a count of
// how often the catalog's chunk is fetched.
const loads = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/data/card-catalog', async (importOriginal) => {
  const real = await importOriginal<typeof CatalogModule>();
  return {
    ...real,
    CATALOG_VERSION: 2,
    loadCatalog: () => {
      loads.count += 1;
      return real.loadCatalog();
    },
  };
});

const NOW = '2026-10-08T09:00:00.000Z' as IsoInstant;
const TODAY = '2026-10-08' as LocalDate;

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
  loads.count = 0;
});
afterEach(async () => {
  await handle.dispose();
});

const addCard = (id: string, card: object) =>
  createPaymentMethod(handle.db, id, { label: id, type: 'credit_card', profileId: 'p1', card }, NOW);

describe('refreshCatalogCards', () => {
  it('does not fetch the catalog when no card is behind it', async () => {
    await addCard('plain', { billingDay: 10 });
    await addCard('current', {
      billingDay: 10,
      catalog: { issuer: 'max', bank: '20', tier: 'international', version: 2 },
    });
    expect(await refreshCatalogCards(handle.db, TODAY, NOW)).toBe(0);
    expect(loads.count).toBe(0);
  });

  it('brings a card linked to an older catalog up to date, once, through a tracked write', async () => {
    await addCard('max', {
      billingDay: 10,
      creditPrimeMargin: '10',
      overrides: { late: { basis: 'fixed', rate: '20' } },
      lateRate: { basis: 'fixed', rate: '20' },
      catalog: { issuer: 'max', bank: '20', tier: 'international', version: 1 },
    });
    await addCard('plain', { billingDay: 2 });
    await handle.db.outbox.clear();

    expect(await refreshCatalogCards(handle.db, TODAY, NOW)).toBe(1);
    expect(loads.count).toBe(1);
    const card = (await handle.db.paymentMethods.get('max'))?.card;
    expect(card).toMatchObject({
      creditPrimeMargin: '10.75', // Mizrahi's Max International קרדיט: 15.50 on prime 4.75
      fxFeeRate: '3',
      lateRate: { basis: 'fixed', rate: '20' }, // overridden: stays
      catalog: { issuer: 'max', bank: '20', tier: 'international', version: 2, updatedOn: TODAY },
    });
    expect((await handle.db.paymentMethods.get('plain'))?.card).toEqual({ billingDay: 2 });
    // A tracked write: it is queued to sync like any edit.
    expect(await handle.db.outbox.toArray()).toEqual([{ tbl: 'paymentMethods', id: 'max' }]);

    // Converged: nothing left to do.
    expect(await refreshCatalogCards(handle.db, TODAY, NOW)).toBe(0);
  });

  it('leaves a card whose link the catalog no longer knows untouched', async () => {
    const card = {
      billingDay: 10,
      creditPrimeMargin: '3',
      catalog: { issuer: 'amex', bank: '17', tier: 'gold', version: 1 }, // Mercantile has no Amex
    };
    await addCard('gone', card);
    expect(await refreshCatalogCards(handle.db, TODAY, NOW)).toBe(0);
    expect((await handle.db.paymentMethods.get('gone'))?.card).toEqual(card);
  });
});
