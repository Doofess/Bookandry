import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BookandryDB, withoutTracking } from '@/db/db';
import { materialize } from '@/db/materialize';
import { MONEY, d, modify } from '@/domain/test-factories';
import { InvalidNameError } from '@/domain/validation';
import { parseRev, type Rev } from '@/lib/rev';
import { freshDb, type TestDb } from '@/test/db-harness';
import {
  BUILTIN_METHOD_IDS,
  BUILTIN_METHODS_SINCE,
  CASH_METHOD_ID,
  CHEQUE_METHOD_ID,
  OTHER_METHOD_ID,
  SHARED_OWNER,
  STANDING_ORDER_METHOD_ID,
  TRANSFER_METHOD_ID,
  WALLET_METHOD_ID,
} from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import {
  createPaymentMethod,
  deletePaymentMethod,
  ensureBuiltinPaymentMethods,
  listPaymentMethods,
  putArchiveState,
  setPaymentMethodArchived,
  updatePaymentMethod,
} from './payment-methods';

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
/** The built-ins that are synced rows (spec 10.2). */
const SYNCED_IDS = [TRANSFER_METHOD_ID, STANDING_ORDER_METHOD_ID, WALLET_METHOD_ID, OTHER_METHOD_ID];
const LATER = '2026-09-16T10:00:00.000Z' as IsoInstant;

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
});
afterEach(async () => {
  await handle.dispose();
});

const addTx = async (id: string, paymentMethodId?: string) =>
  handle.db.transactions.put(
    materialize({
      id,
      profileId: 'p1',
      kind: 'expense',
      categoryId: 'cat.groceries',
      paymentMethodId,
      money: MONEY,
      recurrence: { type: 'one_time' },
      date: d('2026-09-01'),
      seriesRootId: id,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );

describe('listPaymentMethods', () => {
  beforeEach(async () => {
    await createPaymentMethod(
      handle.db,
      'mine',
      { label: 'My card', type: 'credit_card', profileId: 'p1' },
      NOW,
    );
    await createPaymentMethod(
      handle.db,
      'theirs',
      { label: 'Their card', type: 'credit_card', profileId: 'p2' },
      NOW,
    );
    await createPaymentMethod(
      handle.db,
      'joint',
      { label: 'Joint card', type: 'credit_card', profileId: SHARED_OWNER },
      NOW,
    );
  });

  it('returns a profile’s own methods plus the shared ones, never another profile’s', async () => {
    const ids = (await listPaymentMethods(handle.db, { profileId: 'p1' })).map((m) => m.id);
    // The SHARED_OWNER sentinel exists precisely so these rows are reachable: a
    // null owner would be invisible to the [profileId+isArchived] index.
    // The six built-ins are seeded by populate() and shared by every profile.
    expect(ids.sort()).toEqual(['joint', 'mine', ...BUILTIN_METHOD_IDS].sort());
    expect(ids).not.toContain('theirs');
  });

  it('returns the archive state it replaced, and puts one back exactly', async () => {
    const march = '2026-03-12T09:00:00.000Z' as IsoInstant;
    expect(await setPaymentMethodArchived(handle.db, 'mine', true, march)).toEqual({
      isArchived: 0,
      archivedAt: undefined,
    });
    const restoredFrom = await setPaymentMethodArchived(handle.db, 'mine', false, NOW);
    expect(restoredFrom).toEqual({ isArchived: 1, archivedAt: march });
    expect((await handle.db.paymentMethods.get('mine'))?.archivedAt).toBeUndefined();

    if (restoredFrom === undefined) throw new Error('no state');
    await putArchiveState(handle.db, 'mine', restoredFrom, NOW);
    const back = await handle.db.paymentMethods.get('mine');
    expect(back?.isArchived).toBe(1);
    expect(back?.archivedAt).toBe(march);
    expect(back?.updatedAt).toBe(NOW);
    expect(await setPaymentMethodArchived(handle.db, 'missing', true, NOW)).toBeUndefined();
  });

  it('hides archived methods unless asked', async () => {
    await setPaymentMethodArchived(handle.db, 'mine', true, NOW);
    expect((await listPaymentMethods(handle.db, { profileId: 'p1' })).map((m) => m.id).sort()).toEqual(
      ['joint', ...BUILTIN_METHOD_IDS].sort(),
    );
    expect(
      (await listPaymentMethods(handle.db, { profileId: 'p1', includeArchived: true }))
        .map((m) => m.id)
        .sort(),
    ).toEqual(['joint', 'mine', ...BUILTIN_METHOD_IDS].sort());
  });

  it('supports הוראת קבע as its own type', async () => {
    const standing = await createPaymentMethod(
      handle.db,
      'ho',
      { label: 'Standing order', type: 'standing_order', profileId: SHARED_OWNER },
      NOW,
    );
    expect(standing.type).toBe('standing_order');
  });
});

describe('labels are labels', () => {
  it('trims and bounds the label', async () => {
    const created = await createPaymentMethod(
      handle.db,
      'm1',
      { label: '  Blue card  ', type: 'credit_card', profileId: 'p1' },
      NOW,
    );
    expect(created.label).toBe('Blue card');

    await expect(
      createPaymentMethod(handle.db, 'm2', { label: '', type: 'cash', profileId: 'p1' }, NOW),
    ).rejects.toThrow(InvalidNameError);
    await expect(updatePaymentMethod(handle.db, 'm1', { label: 'x'.repeat(41) }, NOW)).rejects.toThrow(
      InvalidNameError,
    );
  });
});

describe('deletePaymentMethod', () => {
  beforeEach(async () => {
    await createPaymentMethod(
      handle.db,
      'm1',
      { label: 'Old card', type: 'credit_card', profileId: 'p1' },
      NOW,
    );
    await createPaymentMethod(
      handle.db,
      'm2',
      { label: 'New card', type: 'credit_card', profileId: 'p1' },
      NOW,
    );
  });

  it('clears the reference when there is nothing to move to', async () => {
    await addTx('t1', 'm1');
    const result = await deletePaymentMethod(handle.db, 'm1', {}, NOW);

    expect(result.transactionsUpdated).toBe(1);
    const tx = await handle.db.transactions.get('t1');
    expect(tx).toBeDefined();
    // Unlike a category, this field is optional, so clearing it is a legitimate
    // outcome rather than a dangling pointer.
    expect(tx?.paymentMethodId).toBeUndefined();
  });

  it('reassigns when given a replacement', async () => {
    await addTx('t1', 'm1');
    await deletePaymentMethod(handle.db, 'm1', { reassignTo: 'm2' }, NOW);
    expect((await handle.db.transactions.get('t1'))?.paymentMethodId).toBe('m2');
  });

  it('clears a per-occurrence edit with null, not undefined', async () => {
    await addTx('t1', 'm2');
    await handle.db.overrides.put({
      ...modify('t1', d('2026-09-01'), { paymentMethodId: 'm1' }),
      id: 'o1',
    });

    await deletePaymentMethod(handle.db, 'm1', {}, NOW);

    const override = await handle.db.overrides.get('o1');
    // `null` is "clear this field"; `undefined` would mean "unchanged", which
    // would silently re-inherit the parent's payment method.
    expect(override?.action === 'modify' ? override.patch.paymentMethodId : 'missing').toBeNull();
  });

  it('rejects an unknown or self-referential target', async () => {
    await expect(deletePaymentMethod(handle.db, 'm1', { reassignTo: 'nope' }, NOW)).rejects.toThrow();
    await expect(deletePaymentMethod(handle.db, 'm1', { reassignTo: 'm1' }, NOW)).rejects.toThrow();
    expect(await handle.db.paymentMethods.get('m1')).toBeDefined();
  });
});

describe('cash is built in', () => {
  /*
   * Cash is the one payment method nobody creates and nobody should be able to
   * remove. There is exactly one of it, it is seeded with the install, it is
   * shared by every profile, and there is no longer an "add cash" anywhere - so
   * a delete would leave the database without the only universally available
   * method and no screen able to put it back.
   *
   * Enforced in the repository, not only in the UI that hides the buttons: the
   * UI is one caller, and an import, a future bulk action or a second screen
   * would each have to remember the rule independently.
   */
  const seedCash = async () =>
    handle.db.paymentMethods.put({
      id: CASH_METHOD_ID,
      profileId: SHARED_OWNER,
      type: 'cash',
      label: 'Cash',
      isArchived: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

  it('refuses to be deleted', async () => {
    await seedCash();

    await expect(deletePaymentMethod(handle.db, CASH_METHOD_ID, {}, NOW)).rejects.toThrow(/built in/);
    expect(await handle.db.paymentMethods.get(CASH_METHOD_ID)).toBeDefined();
  });

  it('refuses to be renamed or reassigned', async () => {
    await seedCash();

    await expect(
      updatePaymentMethod(handle.db, CASH_METHOD_ID, { label: 'Pocket money' }, NOW),
    ).rejects.toThrow(/built in/);
    await expect(updatePaymentMethod(handle.db, CASH_METHOD_ID, { profileId: 'p1' }, NOW)).rejects.toThrow(
      /built in/,
    );

    const row = await handle.db.paymentMethods.get(CASH_METHOD_ID);
    expect(row?.label).toBe('Cash');
    expect(row?.profileId).toBe(SHARED_OWNER);
  });

  it('cannot be put away either: cash and cheques are always there', async () => {
    await seedCash();
    await expect(setPaymentMethodArchived(handle.db, CASH_METHOD_ID, true, NOW)).rejects.toThrow(/built in/);
    await expect(setPaymentMethodArchived(handle.db, CHEQUE_METHOD_ID, true, NOW)).rejects.toThrow(
      /built in/,
    );
  });

  it('is offered even when an older install archived it', async () => {
    await seedCash();
    await handle.db.paymentMethods.update(CASH_METHOD_ID, { isArchived: 1 });
    expect((await listPaymentMethods(handle.db)).map((m) => m.id)).toContain(CASH_METHOD_ID);
  });

  it('leaves every other method deletable', async () => {
    // The guard is the built-in id, not the 'cash' TYPE: a database or an
    // imported file from before this rule may hold user-made cash rows, and
    // those stay entirely ordinary.
    await createPaymentMethod(
      handle.db,
      'pm.old-cash',
      { label: 'Wallet', type: 'cash', profileId: 'p1' },
      NOW,
    );

    await expect(deletePaymentMethod(handle.db, 'pm.old-cash', {}, NOW)).resolves.toBeDefined();
    expect(await handle.db.paymentMethods.get('pm.old-cash')).toBeUndefined();
  });
});

describe('a card’s credit rate', () => {
  it('is stored as typed, trimmed', async () => {
    const card = await createPaymentMethod(
      handle.db,
      'pm.visa',
      { label: 'Visa', type: 'credit_card', profileId: 'p1', creditAnnualRate: ' 12.5 ' },
      NOW,
    );
    expect(card.creditAnnualRate).toBe('12.5');
  });

  it('is refused when it is not a rate, by the repository and not only the screen', async () => {
    // The screen is one caller. Anything that reaches the table is copied onto
    // every קרדיט plan charged to the card.
    await expect(
      createPaymentMethod(
        handle.db,
        'pm.visa',
        { label: 'Visa', type: 'credit_card', profileId: 'p1', creditAnnualRate: '1.2.3' },
        NOW,
      ),
    ).rejects.toThrow(RangeError);

    await createPaymentMethod(
      handle.db,
      'pm.visa',
      { label: 'Visa', type: 'credit_card', profileId: 'p1' },
      NOW,
    );
    await expect(updatePaymentMethod(handle.db, 'pm.visa', { creditAnnualRate: '150' }, NOW)).rejects.toThrow(
      RangeError,
    );
    expect((await handle.db.paymentMethods.get('pm.visa'))?.creditAnnualRate).toBeUndefined();
  });

  it('is left alone by undefined, set by a string and cleared by null', async () => {
    await createPaymentMethod(
      handle.db,
      'pm.visa',
      { label: 'Visa', type: 'credit_card', profileId: 'p1', creditAnnualRate: '12' },
      NOW,
    );

    await updatePaymentMethod(handle.db, 'pm.visa', { label: 'Visa Gold' }, NOW);
    expect((await handle.db.paymentMethods.get('pm.visa'))?.creditAnnualRate).toBe('12');

    await updatePaymentMethod(handle.db, 'pm.visa', { creditAnnualRate: '9.9' }, NOW);
    expect((await handle.db.paymentMethods.get('pm.visa'))?.creditAnnualRate).toBe('9.9');

    await updatePaymentMethod(handle.db, 'pm.visa', { creditAnnualRate: null }, NOW);
    expect((await handle.db.paymentMethods.get('pm.visa'))?.creditAnnualRate).toBeUndefined();
  });
});

describe('the built-in methods on an older install', () => {
  it('adds the ones it lacks - and only those - without announcing them as edits', async () => {
    // As a device from before cheques: cash, archived there, and no cheque.
    await handle.db.paymentMethods.delete(CHEQUE_METHOD_ID);
    await handle.db.paymentMethods.update(CASH_METHOD_ID, { isArchived: 1 });
    await handle.db.outbox.clear();

    await ensureBuiltinPaymentMethods(handle.db, NOW);

    expect(await handle.db.paymentMethods.get(CHEQUE_METHOD_ID)).toMatchObject({
      type: 'cheque',
      profileId: SHARED_OWNER,
      isArchived: 0,
    });
    expect((await handle.db.paymentMethods.get(CASH_METHOD_ID))?.isArchived).toBe(1);
    // Only the newer four are ever sent; cash and cheques never are.
    expect((await handle.db.outbox.toArray()).map((o) => o.id).sort()).toEqual([...SYNCED_IDS].sort());
  });
});

describe('the six built-ins', () => {
  it.each(BUILTIN_METHOD_IDS)('%s cannot be renamed, given an owner, archived or deleted', async (id) => {
    const { db } = handle;
    await ensureBuiltinPaymentMethods(db, NOW);
    await expect(updatePaymentMethod(db, id, { label: 'Mine' }, NOW)).rejects.toThrow(/built in/);
    await expect(updatePaymentMethod(db, id, { profileId: 'p1' }, NOW)).rejects.toThrow(/built in/);
    await expect(setPaymentMethodArchived(db, id, true, NOW)).rejects.toThrow(/built in/);
    await expect(deletePaymentMethod(db, id, {}, NOW)).rejects.toThrow(/built in/);
  });

  it('adds the new four to an older database, dated the fixed instant, and queues each for upload', async () => {
    const { db } = handle;
    await db.paymentMethods.clear();
    await db.syncState.clear();
    await db.outbox.clear();
    await ensureBuiltinPaymentMethods(db, NOW);
    const transfer = await db.paymentMethods.get(TRANSFER_METHOD_ID);
    expect(transfer).toMatchObject({ type: 'bank_transfer', profileId: SHARED_OWNER });
    expect(transfer?.createdAt).toBe(BUILTIN_METHODS_SINCE);
    const state = await db.syncState.get(['paymentMethods', TRANSFER_METHOD_ID]);
    expect(parseRev((state?.rev ?? '') as Rev).ms).toBe(Date.parse(BUILTIN_METHODS_SINCE));
    expect(await db.outbox.get(['paymentMethods', TRANSFER_METHOD_ID])).toBeDefined();
    // Cash and cheques stay untracked, as before.
    expect(await db.syncState.get(['paymentMethods', CASH_METHOD_ID])).toBeUndefined();
  });

  it('queues the newer four for upload on a new install, where they were seeded untracked', async () => {
    const { db } = handle;
    await db.open(); // populate only: all six seeded, nothing sent
    expect(await db.outbox.count()).toBe(0);
    await ensureBuiltinPaymentMethods(db, NOW);
    for (const id of SYNCED_IDS) {
      const state = await db.syncState.get(['paymentMethods', id]);
      expect(state?.deleted, id).toBe(0);
      expect(parseRev((state?.rev ?? '') as Rev).ms, id).toBe(Date.parse(BUILTIN_METHODS_SINCE));
      expect(await db.outbox.get(['paymentMethods', id]), id).toBeDefined();
    }
    for (const id of [CASH_METHOD_ID, CHEQUE_METHOD_ID]) {
      expect(await db.syncState.get(['paymentMethods', id]), id).toBeUndefined();
      expect(await db.outbox.get(['paymentMethods', id]), id).toBeUndefined();
    }
  });

  it('never queues again a built-in this device has already sent or edited', async () => {
    const { db } = handle;
    await ensureBuiltinPaymentMethods(db, NOW);
    await db.paymentMethods.update(WALLET_METHOD_ID, { color: 'red' }); // tracked: a later rev
    const edited = await db.syncState.get(['paymentMethods', WALLET_METHOD_ID]);
    await db.outbox.clear(); // as after a push the server acknowledged
    await ensureBuiltinPaymentMethods(db, LATER);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.syncState.get(['paymentMethods', WALLET_METHOD_ID])).toEqual(edited);
  });

  it('lets two tabs booting at once both add the missing ones, without either failing', async () => {
    const indexedDB = new IDBFactory();
    const tab = () => new BookandryDB('two-tabs', { indexedDB, IDBKeyRange });
    const first = tab();
    await first.open();
    // As an older install: cash and cheques only, and no record of the rest.
    await withoutTracking(first, [first.paymentMethods], () => first.paymentMethods.bulkDelete(SYNCED_IDS));
    const second = tab();
    await second.open();
    try {
      await expect(
        Promise.all([ensureBuiltinPaymentMethods(first, NOW), ensureBuiltinPaymentMethods(second, NOW)]),
      ).resolves.toBeDefined();
      expect((await first.paymentMethods.toArray()).map((m) => m.id).sort()).toEqual(
        [...BUILTIN_METHOD_IDS].sort(),
      );
    } finally {
      second.close();
      await first.delete();
      first.close();
    }
  });

  it('leaves a row this device already holds alone', async () => {
    const { db } = handle;
    await ensureBuiltinPaymentMethods(db, NOW);
    await db.paymentMethods.update(WALLET_METHOD_ID, { isArchived: 1 });
    await ensureBuiltinPaymentMethods(db, LATER);
    expect((await db.paymentMethods.get(WALLET_METHOD_ID))?.isArchived).toBe(1);
  });

  it('adds back, with a newer rev, a built-in an older build deleted', async () => {
    const { db } = handle;
    await ensureBuiltinPaymentMethods(db, NOW);
    await db.paymentMethods.delete(OTHER_METHOD_ID); // tracked: the sync state records a deletion
    const deleted = await db.syncState.get(['paymentMethods', OTHER_METHOD_ID]);
    expect(deleted?.deleted).toBe(1);
    await ensureBuiltinPaymentMethods(db, LATER);
    const back = await db.syncState.get(['paymentMethods', OTHER_METHOD_ID]);
    expect(await db.paymentMethods.get(OTHER_METHOD_ID)).toBeDefined();
    expect(back?.deleted).toBe(0);
    expect(back !== undefined && deleted !== undefined && back.rev > deleted.rev).toBe(true);
  });
});

describe('a credit card’s details', () => {
  const card = { issuer: 'max', billingDay: 10, expiresMonth: '2029-04', fxFeeRate: '2.5' } as const;

  it('are kept with the card, set whole and removed with null', async () => {
    const made = await createPaymentMethod(
      handle.db,
      'visa',
      { label: 'Visa', type: 'credit_card', profileId: 'p1', card },
      NOW,
    );
    expect(made.card).toEqual(card);

    await updatePaymentMethod(handle.db, 'visa', { label: 'Visa Gold' }, NOW);
    expect((await handle.db.paymentMethods.get('visa'))?.card).toEqual(card);

    await updatePaymentMethod(handle.db, 'visa', { card: { billingDay: 2 } }, NOW);
    expect((await handle.db.paymentMethods.get('visa'))?.card).toEqual({ billingDay: 2 });

    await updatePaymentMethod(handle.db, 'visa', { card: null }, NOW);
    expect((await handle.db.paymentMethods.get('visa'))?.card).toBeUndefined();
  });

  it('are validated but stored with the keys this version does not know', async () => {
    await createPaymentMethod(
      handle.db,
      'visa',
      { label: 'Visa', type: 'credit_card', profileId: 'p1', card },
      NOW,
    );
    const next = await updatePaymentMethod(
      handle.db,
      'visa',
      { card: { billingDay: 2, future: { x: 1 } } as never },
      NOW,
    );
    expect(next.card).toMatchObject({ billingDay: 2, future: { x: 1 } });
    expect((await handle.db.paymentMethods.get('visa'))?.card).toMatchObject({ future: { x: 1 } });
    await expect(updatePaymentMethod(handle.db, 'visa', { card: { billingDay: 99 } }, NOW)).rejects.toThrow();
  });

  it('keep keys a later release adds inside the catalog link, through an edit here', async () => {
    const linked = {
      billingDay: 10,
      catalog: {
        issuer: 'max',
        bank: '20',
        tier: 'international',
        version: 1,
        later: 'kept',
        filled: { fxFeeRate: '3', laterToo: 1 },
      },
    };
    await createPaymentMethod(
      handle.db,
      'visa',
      { label: 'Visa', type: 'credit_card', profileId: 'p1', card: linked },
      NOW,
    );
    await updatePaymentMethod(handle.db, 'visa', { card: { ...linked, billingDay: 15 } }, NOW);
    expect((await handle.db.paymentMethods.get('visa'))?.card).toEqual({ ...linked, billingDay: 15 });
    // Still validated: a known key that does not read is refused.
    await expect(
      updatePaymentMethod(handle.db, 'visa', { card: { catalog: { ...linked.catalog, version: 0 } } }, NOW),
    ).rejects.toThrow();
  });

  it('are refused when they do not read, by the repository and not only the screen', async () => {
    await expect(
      createPaymentMethod(
        handle.db,
        'bad',
        { label: 'Bad', type: 'credit_card', profileId: 'p1', card: { billingDay: 40 } },
        NOW,
      ),
    ).rejects.toThrow();
    await createPaymentMethod(
      handle.db,
      'visa',
      { label: 'Visa', type: 'credit_card', profileId: 'p1' },
      NOW,
    );
    await expect(
      updatePaymentMethod(handle.db, 'visa', { card: { expiresMonth: '09/28' } }, NOW),
    ).rejects.toThrow();
  });
});

describe('a bank account', () => {
  const account = {
    bank: '12',
    branch: '689',
    number: '123456',
    holding: 'joint' as const,
    holders: ['p1', 'p2'],
    overdraftLimitMinor: 1_000_000,
  };

  it('is kept with its details, set whole and removed with null', async () => {
    await createPaymentMethod(
      handle.db,
      'acc',
      { label: 'Joint', type: 'bank_account', profileId: SHARED_OWNER, account },
      NOW,
    );
    expect((await handle.db.paymentMethods.get('acc'))?.account).toEqual(account);
    await updatePaymentMethod(
      handle.db,
      'acc',
      { account: { ...account, holding: 'personal', holders: undefined } },
      NOW,
    );
    expect((await handle.db.paymentMethods.get('acc'))?.account?.holding).toBe('personal');
    await updatePaymentMethod(handle.db, 'acc', { account: null }, NOW);
    expect((await handle.db.paymentMethods.get('acc'))?.account).toBeUndefined();
  });

  it('is refused when its details do not read, by the repository and not only the screen', async () => {
    await expect(
      createPaymentMethod(
        handle.db,
        'bad',
        { label: 'Bad', type: 'bank_account', profileId: 'p1', account: { ...account, number: '12-34' } },
        NOW,
      ),
    ).rejects.toThrow();
    await expect(
      createPaymentMethod(
        handle.db,
        'bad',
        { label: 'Bad', type: 'bank_account', profileId: 'p1', account: { ...account, holders: [] } },
        NOW,
      ),
    ).rejects.toThrow();
  });

  it('when deleted, lets go of the cards paid from it - which keep their bank’s name', async () => {
    await createPaymentMethod(
      handle.db,
      'acc',
      { label: 'Joint', type: 'bank_account', profileId: 'p1', account },
      NOW,
    );
    await createPaymentMethod(
      handle.db,
      'visa',
      {
        label: 'Visa',
        type: 'credit_card',
        profileId: 'p1',
        card: { bank: 'בנק הפועלים', accountId: 'acc', billingDay: 10 },
      },
      NOW,
    );
    await deletePaymentMethod(handle.db, 'acc', {}, NOW);
    expect((await handle.db.paymentMethods.get('visa'))?.card).toEqual({
      bank: 'בנק הפועלים',
      billingDay: 10,
    });
  });
});

describe('a card’s colour', () => {
  it('is kept by key, left alone by undefined, and cleared back to the company’s by null', async () => {
    await createPaymentMethod(
      handle.db,
      'pm.visa',
      { label: 'Visa', type: 'credit_card', profileId: 'p1', color: 'gold' },
      NOW,
    );
    expect((await handle.db.paymentMethods.get('pm.visa'))?.color).toBe('gold');

    await updatePaymentMethod(handle.db, 'pm.visa', { label: 'Visa Gold' }, NOW);
    expect((await handle.db.paymentMethods.get('pm.visa'))?.color).toBe('gold');

    await updatePaymentMethod(handle.db, 'pm.visa', { color: 'black' }, NOW);
    expect((await handle.db.paymentMethods.get('pm.visa'))?.color).toBe('black');

    await updatePaymentMethod(handle.db, 'pm.visa', { color: null }, NOW);
    expect((await handle.db.paymentMethods.get('pm.visa'))?.color).toBeUndefined();
  });
});
