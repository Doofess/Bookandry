import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { materialize } from '@/db/materialize';
import { MAX_PROFILES, PROFILE_PALETTE } from '@/domain/palette';
import { MONEY, d } from '@/domain/test-factories';
import { InvalidNameError } from '@/domain/validation';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { CashMove, PaymentMethod } from '@/types/domain';
import { SHARED_OWNER } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import {
  ColorTakenError,
  createProfile,
  deleteProfile,
  listProfiles,
  nextAvailableColor,
  ProfileLimitError,
  ProfileNotEmptyError,
  updateProfile,
} from './profiles';
import { ensureSettings, getSettings, writeSettings } from './settings';

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;

let handle: TestDb;
beforeEach(async () => {
  handle = freshDb();
  await ensureSettings(handle.db, NOW);
});
afterEach(async () => {
  await handle.dispose();
});

const draft = (name: string) => ({
  name,
  openingBalanceMinor: 100_000,
  openingBalanceCurrency: 'USD',
  openingBalanceDate: d('2026-01-01'),
});

const addTx = async (id: string, profileId: string, over: { deletedAt?: IsoInstant } = {}) =>
  handle.db.transactions.put(
    materialize({
      id,
      profileId,
      kind: 'expense',
      categoryId: 'cat.groceries',
      money: MONEY,
      recurrence: { type: 'one_time' },
      date: d('2026-09-01'),
      seriesRootId: id,
      createdAt: NOW,
      updatedAt: NOW,
      ...over,
    }),
  );

describe('createProfile', () => {
  it('assigns the first free palette colour', async () => {
    const a = await createProfile(handle.db, 'p1', draft('Dana'), NOW);
    const b = await createProfile(handle.db, 'p2', draft('Yossi'), NOW);
    expect(a.color).toBe(PROFILE_PALETTE[0].hex);
    expect(b.color).toBe(PROFILE_PALETTE[1].hex);
  });

  it('refuses a colour another profile already has', async () => {
    await createProfile(handle.db, 'p1', draft('Dana'), NOW);
    await expect(
      createProfile(handle.db, 'p2', { ...draft('Yossi'), color: PROFILE_PALETTE[0].hex }, NOW),
    ).rejects.toThrow(ColorTakenError);
  });

  it('caps the app at the palette size', async () => {
    for (let i = 0; i < MAX_PROFILES; i += 1) {
      await createProfile(handle.db, `p${String(i)}`, draft(`Person ${String(i)}`), NOW);
    }
    expect(nextAvailableColor(await listProfiles(handle.db))).toBeUndefined();
    await expect(createProfile(handle.db, 'overflow', draft('One too many'), NOW)).rejects.toThrow(
      ProfileLimitError,
    );
  });

  it('trims the name and rejects an empty or oversized one', async () => {
    const trimmed = await createProfile(handle.db, 'p1', draft('  Dana  '), NOW);
    expect(trimmed.name).toBe('Dana');

    await expect(createProfile(handle.db, 'p2', draft('   '), NOW)).rejects.toThrow(InvalidNameError);
    await expect(createProfile(handle.db, 'p3', draft('x'.repeat(41)), NOW)).rejects.toThrow(
      InvalidNameError,
    );
    // Counted in code points, so 40 emoji is 40 characters, not 80.
    await expect(createProfile(handle.db, 'p4', draft('🦊'.repeat(40)), NOW)).resolves.toBeDefined();
  });

  it('writes nothing when the cap is hit', async () => {
    for (let i = 0; i < MAX_PROFILES; i += 1) {
      await createProfile(handle.db, `p${String(i)}`, draft(`Person ${String(i)}`), NOW);
    }
    await expect(createProfile(handle.db, 'overflow', draft('Nope'), NOW)).rejects.toThrow();
    expect(await handle.db.profiles.count()).toBe(MAX_PROFILES);
  });
});

describe('updateProfile', () => {
  it('refuses to take a colour that is already in use', async () => {
    await createProfile(handle.db, 'p1', draft('Dana'), NOW);
    await createProfile(handle.db, 'p2', draft('Yossi'), NOW);
    await expect(updateProfile(handle.db, 'p2', { color: PROFILE_PALETTE[0].hex }, NOW)).rejects.toThrow(
      ColorTakenError,
    );
  });

  it('allows a profile to keep its own colour', async () => {
    const a = await createProfile(handle.db, 'p1', draft('Dana'), NOW);
    const renamed = await updateProfile(handle.db, 'p1', { color: a.color, name: 'Dana K' }, NOW);
    expect(renamed.name).toBe('Dana K');
  });
});

describe('deleteProfile', () => {
  beforeEach(async () => {
    await createProfile(handle.db, 'p1', draft('Dana'), NOW);
    await createProfile(handle.db, 'p2', draft('Yossi'), NOW);
  });

  it('refuses to silently drop the money, and says how much', async () => {
    await addTx('t1', 'p1');
    await addTx('t2', 'p1');

    const attempt = deleteProfile(handle.db, 'p1', {}, NOW);
    await expect(attempt).rejects.toBeInstanceOf(ProfileNotEmptyError);
    await expect(attempt).rejects.toMatchObject({ transactionCount: 2 });
    expect(await handle.db.profiles.get('p1')).toBeDefined();
  });

  it('moves transactions, including soft-deleted ones', async () => {
    await addTx('t1', 'p1');
    await addTx('t2', 'p1', { deletedAt: NOW });

    const result = await deleteProfile(handle.db, 'p1', { reassignTo: 'p2' }, NOW);

    expect(result.transactionsMoved).toBe(2);
    expect((await handle.db.transactions.get('t1'))?.profileId).toBe('p2');
    // Restoring a deleted row into a profile that no longer exists is how
    // "Recently deleted" turns into a crash a week later.
    expect((await handle.db.transactions.get('t2'))?.profileId).toBe('p2');
  });

  it('moves the profile’s own payment methods and leaves shared ones alone', async () => {
    const method = (id: string, profileId: string): PaymentMethod => ({
      id,
      profileId,
      type: 'credit_card',
      label: `Card ${id}`,
      isArchived: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await handle.db.paymentMethods.bulkPut([method('m1', 'p1'), method('shared', SHARED_OWNER)]);

    const result = await deleteProfile(handle.db, 'p1', { reassignTo: 'p2' }, NOW);

    expect(result.paymentMethodsMoved).toBe(1);
    expect((await handle.db.paymentMethods.get('m1'))?.profileId).toBe('p2');
    expect((await handle.db.paymentMethods.get('shared'))?.profileId).toBe(SHARED_OWNER);
  });

  it('deletes an empty profile without a reassign target', async () => {
    await deleteProfile(handle.db, 'p1', {}, NOW);
    expect(await handle.db.profiles.get('p1')).toBeUndefined();
  });

  it('moves the active profile off the one it deleted', async () => {
    await writeSettings(handle.db, { activeProfileId: 'p1' }, NOW);
    await deleteProfile(handle.db, 'p1', {}, NOW);
    expect((await getSettings(handle.db))?.activeProfileId).toBe('p2');
  });

  it('falls back to the merged view when nothing is left', async () => {
    await deleteProfile(handle.db, 'p2', {}, NOW);
    await writeSettings(handle.db, { activeProfileId: 'p1' }, NOW);
    await deleteProfile(handle.db, 'p1', {}, NOW);

    expect(await handle.db.profiles.count()).toBe(0);
    expect((await getSettings(handle.db))?.activeProfileId).toBe('all');
  });

  it('rolls back completely when a write fails mid-flight', async () => {
    await addTx('t1', 'p1');

    const original = handle.db.profiles.delete.bind(handle.db.profiles);
    handle.db.profiles.delete = (() => Promise.reject(new Error('disk full'))) as unknown as typeof original;
    try {
      await expect(deleteProfile(handle.db, 'p1', { reassignTo: 'p2' }, NOW)).rejects.toThrow('disk full');
    } finally {
      handle.db.profiles.delete = original;
    }

    // The reassignment must not survive a failed delete: a transaction pointing
    // at p2 while p1 still exists is a silent, invisible misattribution.
    expect(await handle.db.profiles.get('p1')).toBeDefined();
    expect((await handle.db.transactions.get('t1'))?.profileId).toBe('p1');
  });

  it('rejects an unknown or self-referential target', async () => {
    await addTx('t1', 'p1');
    await expect(deleteProfile(handle.db, 'p1', { reassignTo: 'nope' }, NOW)).rejects.toThrow();
    await expect(deleteProfile(handle.db, 'p1', { reassignTo: 'p1' }, NOW)).rejects.toThrow();
  });

  it('moves the person’s cash moves with their transactions, or deletes them with no one to go to', async () => {
    const move = (id: string, profileId: string): CashMove => ({
      id,
      profileId,
      kind: 'withdraw',
      amountMinor: 20_000,
      date: d('2026-10-01'),
      isDeleted: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    // A deleted move goes too: "Recently deleted" may restore it.
    const deleted = (id: string, profileId: string): CashMove => ({
      ...move(id, profileId),
      isDeleted: 1,
      deletedAt: NOW,
    });
    await handle.db.cashMoves.bulkPut([move('m1', 'p1'), deleted('m1d', 'p1'), move('m2', 'p2')]);

    await deleteProfile(handle.db, 'p1', { reassignTo: 'p2' }, NOW);
    expect((await handle.db.cashMoves.get('m1'))?.profileId).toBe('p2');
    expect((await handle.db.cashMoves.get('m1d'))?.profileId).toBe('p2');

    await createProfile(handle.db, 'p3', draft('Noa'), NOW);
    await handle.db.cashMoves.bulkPut([move('m3', 'p3'), deleted('m3d', 'p3')]);
    await deleteProfile(handle.db, 'p3', {}, NOW);
    expect(await handle.db.cashMoves.get('m3')).toBeUndefined();
    expect(await handle.db.cashMoves.get('m3d')).toBeUndefined();
  });
});
