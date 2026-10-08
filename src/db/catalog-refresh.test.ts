import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as CatalogModule from '@/data/card-catalog';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { IsoInstant, LocalDate } from '@/types/money';

import { refreshCatalogCards } from './catalog-refresh';
import { createPaymentMethod } from './repos/payment-methods';

// The catalog one release ahead of a card linked at version 1; a count of how
// often the catalog's chunk is fetched; and a hook that runs while it is.
const loads = vi.hoisted(() => ({ count: 0, during: undefined as (() => Promise<unknown>) | undefined }));
vi.mock('@/data/card-catalog', async (importOriginal) => {
  const real = await importOriginal<typeof CatalogModule>();
  return {
    ...real,
    CATALOG_VERSION: 2,
    loadCatalog: async () => {
      loads.count += 1;
      await loads.during?.();
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
  loads.during = undefined;
});
afterEach(async () => {
  await handle.dispose();
});

const addCard = (id: string, card: object) =>
  createPaymentMethod(handle.db, id, { label: id, type: 'credit_card', profileId: 'p1', card }, NOW);

// Max through Mizrahi, International, as linked one release ago at a margin of 10.
const behindCard = {
  billingDay: 10,
  creditPrimeMargin: '10',
  overrides: { late: { basis: 'fixed', rate: '20' } },
  lateRate: { basis: 'fixed', rate: '20' },
  catalog: {
    issuer: 'max',
    bank: '20',
    tier: 'international',
    version: 1,
    filled: { creditPrimeMargin: '10' },
  },
};

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

  it('brings a card linked to an older catalog up to date, once, without queueing it to sync', async () => {
    await addCard('max', behindCard);
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
    // Untracked, like the other startup writes: every device computes the same card.
    expect(await handle.db.outbox.toArray()).toEqual([]);

    // Converged: nothing left to do, and the catalog is not fetched again.
    expect(await refreshCatalogCards(handle.db, TODAY, NOW)).toBe(0);
    expect(loads.count).toBe(1);
  });

  it('keeps an edit pulled while the catalog was being fetched', async () => {
    await addCard('max', behindCard);
    loads.during = async () => {
      // A sync pull lands: the card was renamed and given its digits elsewhere.
      const row = (await handle.db.paymentMethods.get('max'))!;
      await handle.db.paymentMethods.put({
        ...row,
        label: 'Renamed elsewhere',
        card: { ...row.card, lastDigits: '1234' },
      });
    };
    expect(await refreshCatalogCards(handle.db, TODAY, NOW)).toBe(1);
    const row = await handle.db.paymentMethods.get('max');
    expect(row?.label).toBe('Renamed elsewhere');
    expect(row?.card).toMatchObject({ lastDigits: '1234', creditPrimeMargin: '10.75' });
  });

  it('moves only the version of a card whose link the catalog no longer knows', async () => {
    const card = {
      billingDay: 10,
      creditPrimeMargin: '3',
      catalog: { issuer: 'amex', bank: '17', tier: 'gold', version: 1 }, // Mercantile has no Amex
    };
    await addCard('gone', card);
    expect(await refreshCatalogCards(handle.db, TODAY, NOW)).toBe(1);
    expect((await handle.db.paymentMethods.get('gone'))?.card).toEqual({
      ...card,
      catalog: { ...card.catalog, version: 2 },
    });
    expect(await refreshCatalogCards(handle.db, TODAY, NOW)).toBe(0);
    expect(loads.count).toBe(1);
  });
});
