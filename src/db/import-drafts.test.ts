import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readAccount, readCard } from '@/domain/import-cards';
import { freshDb, type TestDb } from '@/test/db-harness';

import {
  dropUnfinished,
  keepUnfinished,
  listUnfinished,
  restoreUnfinished,
  unfinishedKey,
  type FoundMethod,
} from './import-drafts';

const YEAR = 365 * 24 * 60 * 60 * 1000;

const card = (l4: string, id = `k-${l4}`): FoundMethod => ({
  kind: 'card',
  found: readCard(
    { s: 0, n: 'max executive', l4, nw: 'Mastercard', is: 'MAX', cr: '', lim: '', bd: '' },
    id,
    0,
    '',
  ),
});
const account = (no: string, id = `b-${no}`): FoundMethod => ({
  kind: 'account',
  found: readAccount({ s: 0, n: 'בנק הפועלים', bk: '12', br: '532', no, h: '' }, id, 0),
});

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
});
afterEach(async () => {
  await handle.dispose();
});

describe('unfinished cards and accounts', () => {
  it('knows a card by its last digits and an account by bank, branch and number', () => {
    expect(unfinishedKey(card('3200'))).toBe('card:3200');
    expect(unfinishedKey(account('123456'))).toBe('account:12-532-123456');
    // Nothing that stays the same between readings: only this reading is the same one.
    expect(unfinishedKey(card('', 'k9'))).toBe('card:k9');
    expect(unfinishedKey(account('', 'b9'))).toBe('account:b9');
  });

  it('keeps them, oldest first, until they are dropped - however long that takes', async () => {
    const { db } = handle;
    await keepUnfinished(db, [card('3200'), account('123456')], 'p1', 1_000);
    await keepUnfinished(db, [card('0400')], 'p2', 2_000);

    const kept = await listUnfinished(db);
    expect(kept.map((k) => [k.key, k.owner])).toEqual([
      ['account:12-532-123456', 'p1'],
      ['card:3200', 'p1'],
      ['card:0400', 'p2'],
    ]);

    // A later reading of anything else does not touch them, nor does time.
    await keepUnfinished(db, [card('2600')], 'p1', 1_000 + YEAR);
    expect(await listUnfinished(db)).toHaveLength(4);

    await dropUnfinished(db, 'card:3200');
    expect((await listUnfinished(db)).map((k) => k.key)).not.toContain('card:3200');
  });

  it('replaces one read again rather than listing it twice, and keeps when it was first found', async () => {
    const { db } = handle;
    await keepUnfinished(db, [card('3200', 'first')], 'p1', 1_000);
    await keepUnfinished(db, [card('3200', 'second')], 'p2', 5_000);
    const [only, ...rest] = await listUnfinished(db);
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ key: 'card:3200', at: 1_000, owner: 'p2', found: { id: 'second' } });
  });

  it('puts a deleted one back as it was', async () => {
    const { db } = handle;
    const [entry] = await keepUnfinished(db, [account('123456')], 'p1', 1_000);
    if (entry === undefined) throw new Error('not kept');
    await dropUnfinished(db, entry.key);
    expect(await listUnfinished(db)).toEqual([]);
    await restoreUnfinished(db, entry);
    expect(await listUnfinished(db)).toEqual([entry]);
  });
});
