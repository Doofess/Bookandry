import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { materialize } from '@/db/materialize';
import { MONEY, d, modify } from '@/domain/test-factories';
import { InvalidNameError } from '@/domain/validation';
import { freshDb, type TestDb } from '@/test/db-harness';
import { CASH_METHOD_ID, SHARED_OWNER } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import {
  createPaymentMethod,
  deletePaymentMethod,
  listPaymentMethods,
  setPaymentMethodArchived,
  updatePaymentMethod,
} from './payment-methods';

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;

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
    // pm.cash is seeded by populate() and shared by every profile.
    expect(ids.sort()).toEqual(['joint', 'mine', 'pm.cash']);
    expect(ids).not.toContain('theirs');
  });

  it('hides archived methods unless asked', async () => {
    await setPaymentMethodArchived(handle.db, 'mine', true, NOW);
    expect((await listPaymentMethods(handle.db, { profileId: 'p1' })).map((m) => m.id).sort()).toEqual([
      'joint',
      'pm.cash',
    ]);
    expect(
      (await listPaymentMethods(handle.db, { profileId: 'p1', includeArchived: true }))
        .map((m) => m.id)
        .sort(),
    ).toEqual(['joint', 'mine', 'pm.cash']);
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

  it('can still be archived, like a built-in category', async () => {
    // Someone who never carries cash should be able to put it away. That is a
    // different thing from removing it, and it is reversible.
    await seedCash();
    await setPaymentMethodArchived(handle.db, CASH_METHOD_ID, true, NOW);

    expect((await handle.db.paymentMethods.get(CASH_METHOD_ID))?.isArchived).toBe(1);
    expect(await listPaymentMethods(handle.db)).toEqual([]);
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
