import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PROFILE_PALETTE } from '@/domain/palette';
import { MONEY, d } from '@/domain/test-factories';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { Profile, Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { checkIntegrity, repairIntegrity } from './integrity';
import { materialize } from './materialize';
import { ensureSettings } from './repos/settings';
import { buildSeedCategories, buildSeedPaymentMethods } from './seed';

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
const EARLIER = '2026-01-01T00:00:00.000Z' as IsoInstant;

let handle: TestDb;

const profile = (id: string, over: Partial<Profile> = {}): Profile => ({
  id,
  name: id,
  color: PROFILE_PALETTE[0].hex,
  openingBalanceMinor: 0,
  openingBalanceCurrency: 'USD',
  openingBalanceDate: d('2026-01-01'),
  createdAt: EARLIER,
  updatedAt: EARLIER,
  ...over,
});

const tx = (over: Partial<Transaction> & { id: string }): Transaction =>
  materialize({
    profileId: 'p1',
    kind: 'expense',
    categoryId: 'cat.groceries',
    money: MONEY,
    recurrence: { type: 'one_time' },
    date: d('2026-09-01'),
    seriesRootId: over.id,
    createdAt: EARLIER,
    updatedAt: EARLIER,
    ...over,
  });

beforeEach(async () => {
  handle = freshDb();
  await ensureSettings(handle.db, NOW);
  await handle.db.categories.bulkPut(buildSeedCategories(NOW));
  await handle.db.paymentMethods.bulkPut(buildSeedPaymentMethods(NOW));
  await handle.db.profiles.put(profile('p1'));
});
afterEach(async () => {
  await handle.dispose();
});

describe('checkIntegrity', () => {
  it('is silent on a healthy database', async () => {
    await handle.db.transactions.put(tx({ id: 't1' }));
    expect(await checkIntegrity(handle.db)).toEqual([]);
  });

  it('finds every class of damage', async () => {
    await handle.db.transactions.bulkPut([
      tx({ id: 'no-profile', profileId: 'ghost' }),
      tx({ id: 'no-category', categoryId: 'cat.nope' }),
      tx({ id: 'wrong-kind', kind: 'income', categoryId: 'cat.groceries' }),
      tx({ id: 'no-method', paymentMethodId: 'pm.nope' }),
    ]);
    await handle.db.overrides.put({
      id: 'o-orphan',
      transactionId: 'gone',
      occurrenceDate: d('2026-09-01'),
      action: 'skip',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await handle.db.profiles.put(profile('p2', { createdAt: NOW, updatedAt: NOW }));

    const kinds = (await checkIntegrity(handle.db)).map((i) => i.kind).sort();
    expect(kinds).toEqual([
      'duplicate_color',
      'kind_mismatch',
      'missing_category',
      'missing_payment_method',
      'missing_profile',
      'orphan_override',
    ]);
  });

  it('spots denormalised fields that drifted out of step', async () => {
    // Written past the materialize() gateway, the way a hand-edited import or a
    // half-applied upgrade would leave them.
    await handle.db.transactions.put({
      ...tx({ id: 't1', recurrence: { type: 'monthly', dayOfMonth: 1, endDate: d('2027-01-01') } }),
      seriesEnd: d('2026-01-01'),
    });

    const issues = await checkIntegrity(handle.db);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe('denormalised_drift');
  });

  it('reports missing settings', async () => {
    await handle.db.settings.clear();
    expect((await checkIntegrity(handle.db)).map((i) => i.kind)).toContain('missing_settings');
  });
});

describe('repairIntegrity', () => {
  it('does nothing, and says so, on a healthy database', async () => {
    await handle.db.transactions.put(tx({ id: 't1' }));
    const report = await repairIntegrity(handle.db, NOW);
    expect(report).toEqual({ found: [], repaired: [], unrepairable: [] });
  });

  it('moves an ownerless transaction to the oldest profile', async () => {
    await handle.db.profiles.put(profile('p2', { color: PROFILE_PALETTE[1].hex, createdAt: NOW }));
    await handle.db.transactions.put(tx({ id: 't1', profileId: 'ghost' }));

    await repairIntegrity(handle.db, NOW);

    expect((await handle.db.transactions.get('t1'))?.profileId).toBe('p1');
    expect(await checkIntegrity(handle.db)).toEqual([]);
  });

  it('refuses to invent a profile when there is none', async () => {
    await handle.db.profiles.clear();
    await handle.db.transactions.put(tx({ id: 't1', profileId: 'ghost' }));

    const report = await repairIntegrity(handle.db, NOW);

    // Creating a "Recovered" profile would hide the only signal that something
    // went wrong; the first-run wizard handles an empty profile list.
    expect(report.unrepairable.map((i) => i.kind)).toEqual(['missing_profile']);
    expect((await handle.db.transactions.get('t1'))?.profileId).toBe('ghost');
  });

  it('files a dangling category under the fallback for its own kind', async () => {
    await handle.db.transactions.bulkPut([
      tx({ id: 'spend', categoryId: 'cat.nope' }),
      tx({ id: 'earn', kind: 'income', categoryId: 'cat.nope' }),
    ]);

    await repairIntegrity(handle.db, NOW);

    expect((await handle.db.transactions.get('spend'))?.categoryId).toBe('cat.otherExpense');
    expect((await handle.db.transactions.get('earn'))?.categoryId).toBe('cat.otherIncome');
  });

  it('re-files an income row sitting in an expense category', async () => {
    await handle.db.transactions.put(tx({ id: 't1', kind: 'income', categoryId: 'cat.groceries' }));
    await repairIntegrity(handle.db, NOW);
    expect((await handle.db.transactions.get('t1'))?.categoryId).toBe('cat.otherIncome');
  });

  it('clears a payment method that no longer exists', async () => {
    await handle.db.transactions.put(tx({ id: 't1', paymentMethodId: 'pm.nope' }));
    await repairIntegrity(handle.db, NOW);
    expect((await handle.db.transactions.get('t1'))?.paymentMethodId).toBeUndefined();
  });

  it('recomputes drifted denormalised fields', async () => {
    await handle.db.transactions.put({
      ...tx({ id: 't1', recurrence: { type: 'monthly', dayOfMonth: 1, endDate: d('2027-01-01') } }),
      seriesEnd: d('2026-01-01'),
      seriesStart: d('2020-01-01'),
    });

    await repairIntegrity(handle.db, NOW);

    const fixed = await handle.db.transactions.get('t1');
    expect(fixed?.seriesStart).toBe('2026-09-01');
    expect(fixed?.seriesEnd).toBe('2027-01-01');
  });

  it('deletes overrides whose transaction is gone', async () => {
    await handle.db.overrides.put({
      id: 'o1',
      transactionId: 'gone',
      occurrenceDate: d('2026-09-01'),
      action: 'skip',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await repairIntegrity(handle.db, NOW);
    expect(await handle.db.overrides.get('o1')).toBeUndefined();
  });

  it('gives the younger of two same-coloured profiles a free colour', async () => {
    await handle.db.profiles.put(profile('p2', { createdAt: NOW, updatedAt: NOW }));

    await repairIntegrity(handle.db, NOW);

    const [a, b] = [await handle.db.profiles.get('p1'), await handle.db.profiles.get('p2')];
    expect(a?.color).toBe(PROFILE_PALETTE[0].hex);
    expect(b?.color).toBe(PROFILE_PALETTE[1].hex);
  });

  it('applies several repairs to one row in a single write', async () => {
    await handle.db.transactions.put({
      ...tx({ id: 't1', profileId: 'ghost', categoryId: 'cat.nope', paymentMethodId: 'pm.nope' }),
      seriesEnd: d('1999-01-01'),
    });

    const report = await repairIntegrity(handle.db, NOW);
    expect(report.repaired.length).toBeGreaterThanOrEqual(4);

    const fixed = await handle.db.transactions.get('t1');
    expect(fixed?.profileId).toBe('p1');
    expect(fixed?.categoryId).toBe('cat.otherExpense');
    expect(fixed?.paymentMethodId).toBeUndefined();
    expect(fixed?.seriesEnd).toBe('2026-09-01');
    expect(await checkIntegrity(handle.db)).toEqual([]);
  });

  it('recreates missing settings', async () => {
    await handle.db.settings.clear();
    await repairIntegrity(handle.db, NOW);
    expect(await handle.db.settings.get('singleton')).toBeDefined();
  });

  it('is idempotent', async () => {
    await handle.db.transactions.put(tx({ id: 't1', categoryId: 'cat.nope' }));
    await repairIntegrity(handle.db, NOW);
    expect(await repairIntegrity(handle.db, NOW)).toEqual({ found: [], repaired: [], unrepairable: [] });
  });
});
