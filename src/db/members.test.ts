import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { materialize } from '@/db/materialize';
import { d, MONEY } from '@/domain/test-factories';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { Profile } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import type { BookandryDB } from './db';
import { ensureMember } from './members';
import { ensureSettings, SETTINGS_ID } from './repos/settings';

const ME = '00000000-0000-4000-8000-0000000000aa';
const NOW = '2026-10-07T10:00:00.000Z' as IsoInstant;
const TODAY = d('2026-10-07');

let handle: TestDb;
let db: BookandryDB;

beforeEach(async () => {
  handle = freshDb();
  db = handle.db;
  await db.open();
  await ensureSettings(db, NOW);
});
afterEach(async () => {
  await handle.dispose();
});

function person(id: string, createdAt: string, color: string): Profile {
  return {
    id,
    name: id,
    color,
    openingBalanceMinor: 500,
    openingBalanceCurrency: 'USD',
    openingBalanceDate: d('2026-01-01'),
    createdAt: createdAt as IsoInstant,
    updatedAt: createdAt as IsoInstant,
  };
}

const tx = (id: string, profileId: string) =>
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
  });

describe("this account's own person", () => {
  it('leaves an empty device to the first-run steps', async () => {
    expect(await ensureMember(db, ME, 'Dana', NOW, TODAY)).toBe('none');
    expect(await db.profiles.count()).toBe(0);
  });

  it('becomes the first person made before linking, taking their rows and the active view', async () => {
    await db.profiles.bulkPut([
      person('kid', '2026-03-01T00:00:00.000Z', '#0f766e'),
      person('dana', '2026-02-01T00:00:00.000Z', '#16794a'),
    ]);
    await db.transactions.bulkPut([tx('t1', 'dana'), tx('t2', 'kid')]);
    await db.cashMoves.put({
      id: 'm1',
      profileId: 'dana',
      kind: 'start',
      amountMinor: 50_000,
      date: d('2026-10-01'),
      isDeleted: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.settings.update(SETTINGS_ID, { activeProfileId: 'dana' });

    expect(await ensureMember(db, ME, 'ignored', NOW, TODAY)).toBe('merged');

    const me = await db.profiles.get(ME);
    expect(me).toMatchObject({ name: 'dana', color: '#16794a', openingBalanceMinor: 500 });
    expect(await db.profiles.get('dana')).toBeUndefined();
    expect((await db.transactions.get('t1'))?.profileId).toBe(ME);
    expect((await db.cashMoves.get('m1'))?.profileId).toBe(ME);
    // Anyone else from before stays as they were, until given to someone.
    expect((await db.transactions.get('t2'))?.profileId).toBe('kid');
    expect((await db.settings.get(SETTINGS_ID))?.activeProfileId).toBe(ME);
    // Old links to the merged person still land on this account's.
    expect(await db.redirects.count()).toBe(1);
  });

  it("joins a household whose people are all other accounts' as a new person", async () => {
    await db.profiles.put(person('00000000-0000-4000-8000-0000000000bb', NOW, '#16794a'));
    await db.syncState.put({
      tbl: 'profiles',
      id: '00000000-0000-4000-8000-0000000000bb',
      rev: '0000000000000001.0000.dev00001',
      deleted: 0,
      home: '00000000-0000-4000-8000-0000000000bb',
    });

    expect(await ensureMember(db, ME, 'Bob', NOW, TODAY)).toBe('created');
    const me = await db.profiles.get(ME);
    expect(me?.name).toBe('Bob');
    expect(me?.color).not.toBe('#16794a');
    expect(await db.profiles.count()).toBe(2);
  });

  it('does nothing once the person is there', async () => {
    await db.profiles.put(person(ME, NOW, '#16794a'));
    expect(await ensureMember(db, ME, 'Dana', NOW, TODAY)).toBe('exists');
  });
});
