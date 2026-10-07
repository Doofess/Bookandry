import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCategory } from '@/db/repos/categories';
import { createPaymentMethod } from '@/db/repos/payment-methods';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { IsoInstant } from '@/types/money';

import { eraseThisDevice } from './erase-device';
import { SHARED_FILES_CACHE } from './shared-files';

const NOW = '2026-10-07T10:00:00.000Z' as IsoInstant;

let handle: TestDb;
afterEach(async () => {
  vi.unstubAllGlobals();
  await handle.dispose();
});

describe('erasing this device', () => {
  it('leaves the built-ins and the people, and nothing else of the data', async () => {
    handle = freshDb();
    const { db } = handle;
    await db.open();
    await createCategory(db, 'c-custom', { name: 'Pets', kind: 'expense', icon: 'Dog' }, NOW);
    await createPaymentMethod(db, 'm-card', { label: 'My card', type: 'credit_card', profileId: 'p1' }, NOW);
    await db.profiles.put({ id: 'p1', name: 'Dana' } as never);
    await db.transactions.put({ id: 't1' } as never);

    await eraseThisDevice(db);

    expect(await db.transactions.count()).toBe(0);
    expect((await db.categories.toArray()).every((c) => c.source === 'builtin')).toBe(true);
    expect(await db.categories.count()).toBeGreaterThan(20);
    expect(await db.paymentMethods.filter((m) => m.type === 'credit_card').count()).toBe(0);
    expect(await db.profiles.get('p1')).toBeDefined();
  });

  it('clears the files shared to the app and not yet read', async () => {
    handle = freshDb();
    await handle.db.open();
    const remove = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal('caches', { delete: remove });

    await eraseThisDevice(handle.db);

    expect(remove).toHaveBeenCalledWith(SHARED_FILES_CACHE);
  });

  it('is done even if the shared files cannot be cleared', async () => {
    handle = freshDb();
    await handle.db.open();
    await handle.db.transactions.put({ id: 't1' } as never);
    vi.stubGlobal('caches', { delete: () => Promise.reject(new Error('blocked')) });

    await eraseThisDevice(handle.db);

    expect(await handle.db.transactions.count()).toBe(0);
  });
});
