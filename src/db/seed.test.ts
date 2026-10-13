import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PROFILE_PALETTE } from '@/domain/palette';
import { freshDb, type TestDb } from '@/test/db-harness';
import { BUILTIN_METHOD_IDS } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { BUILTIN_EXPENSE, BUILTIN_INCOME, buildSeedPaymentMethods, FALLBACK_CATEGORY } from './seed';

const SEED_NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
});
afterEach(async () => {
  await handle.dispose();
});

describe('populate', () => {
  it('seeds the built-in categories on first open', async () => {
    const categories = await handle.db.categories.toArray();
    expect(categories).toHaveLength(BUILTIN_INCOME.length + BUILTIN_EXPENSE.length);
    expect(categories.every((c) => c.source === 'builtin')).toBe(true);
  });

  it('seeds the six shared built-in ways to pay, so the first transaction is savable', async () => {
    const methods = await handle.db.paymentMethods.toArray();
    // The table hands rows back in id order; the seed itself is in "Paid with" order.
    expect(methods.map((m) => m.id).sort()).toEqual([...BUILTIN_METHOD_IDS].sort());
    expect(buildSeedPaymentMethods(SEED_NOW).map((m) => m.id)).toEqual([...BUILTIN_METHOD_IDS]);
    expect(methods.every((m) => m.profileId === '*')).toBe(true);
  });

  it('does not run again on reopen', async () => {
    // The reason this lives in populate() and not a React effect: StrictMode
    // double-invokes effects, so an effect-based seed ships a duplicate set to
    // anyone who opens the app twice.
    const before = await handle.db.categories.count();
    handle.db.close();
    await handle.db.open();
    expect(await handle.db.categories.count()).toBe(before);
  });

  it('gives every built-in a deterministic id and a unique sort order per kind', async () => {
    const categories = await handle.db.categories.toArray();
    expect(categories.every((c) => c.id.startsWith('cat.'))).toBe(true);

    for (const kind of ['income', 'expense'] as const) {
      const orders = categories.filter((c) => c.kind === kind).map((c) => c.sortOrder);
      expect(new Set(orders).size).toBe(orders.length);
    }
  });

  it('seeds both fallback categories the repair pass depends on', async () => {
    for (const id of Object.values(FALLBACK_CATEGORY)) {
      expect(await handle.db.categories.get(id)).toBeDefined();
    }
  });

  it('offers twelve distinct profile colours', () => {
    // Colour uniqueness is what caps the app at twelve profiles, so a duplicate
    // in the palette would quietly cost a slot.
    expect(new Set(PROFILE_PALETTE.map((c) => c.hex)).size).toBe(PROFILE_PALETTE.length);
    expect(PROFILE_PALETTE).toHaveLength(12);
  });
});
