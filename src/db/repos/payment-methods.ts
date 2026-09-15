import type { GreenbackDB } from '@/db/db';
import { normalizeName } from '@/domain/validation';
import { SHARED_OWNER, type PaymentMethod, type PaymentMethodType } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

export type PaymentMethodQuery = {
  /** Omit for every method in the database. */
  readonly profileId?: string;
  readonly includeArchived?: boolean;
};

/**
 * A profile's own methods PLUS the shared ones.
 *
 * `profileId` is never null - IndexedDB cannot index null, so a nullable owner
 * would make every shared method invisible to the `[profileId+isArchived]`
 * index it is supposed to be found by. SHARED_OWNER ('*') is a real, indexable
 * value, which is the entire reason it exists.
 */
export async function listPaymentMethods(
  db: GreenbackDB,
  query: PaymentMethodQuery = {},
): Promise<PaymentMethod[]> {
  const rows = await db.paymentMethods.toArray();
  return rows
    .filter((m) => {
      if (query.includeArchived !== true && m.isArchived === 1) return false;
      if (query.profileId === undefined) return true;
      return m.profileId === query.profileId || m.profileId === SHARED_OWNER;
    })
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

export async function createPaymentMethod(
  db: GreenbackDB,
  id: string,
  draft: { label: string; type: PaymentMethodType; profileId: string; color?: string },
  now: IsoInstant,
): Promise<PaymentMethod> {
  // §12: a LABEL, never a number, expiry or any other credential. The label is
  // the only free text this table holds, and gate:pci keeps it that way.
  const label = normalizeName(draft.label);

  const row: PaymentMethod = {
    id,
    profileId: draft.profileId,
    type: draft.type,
    label,
    color: draft.color,
    isArchived: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.paymentMethods.add(row);
  return row;
}

export async function updatePaymentMethod(
  db: GreenbackDB,
  id: string,
  patch: Partial<Pick<PaymentMethod, 'label' | 'type' | 'color' | 'profileId'>>,
  now: IsoInstant,
): Promise<PaymentMethod> {
  const label = patch.label === undefined ? undefined : normalizeName(patch.label);

  return db.transaction('rw', db.paymentMethods, async () => {
    const current = await db.paymentMethods.get(id);
    if (!current) throw new Error(`No such payment method: ${id}`);
    const next: PaymentMethod = {
      ...current,
      ...patch,
      ...(label === undefined ? {} : { label }),
      updatedAt: now,
    };
    await db.paymentMethods.put(next);
    return next;
  });
}

export async function setPaymentMethodArchived(
  db: GreenbackDB,
  id: string,
  archived: boolean,
  now: IsoInstant,
): Promise<void> {
  await db.paymentMethods.update(id, {
    isArchived: archived ? 1 : 0,
    archivedAt: archived ? now : undefined,
    updatedAt: now,
  });
}

/**
 * Delete a payment method, moving or clearing every reference.
 *
 * Unlike a category, `paymentMethodId` is optional on a transaction, so
 * clearing it is a legitimate outcome rather than a dangling pointer - the row
 * simply stops claiming it was paid by a card that no longer exists.
 */
export async function deletePaymentMethod(
  db: GreenbackDB,
  id: string,
  options: { reassignTo?: string },
  now: IsoInstant,
): Promise<{ transactionsUpdated: number; overridesUpdated: number }> {
  return db.transaction('rw', [db.paymentMethods, db.transactions, db.overrides], async () => {
    const current = await db.paymentMethods.get(id);
    if (!current) throw new Error(`No such payment method: ${id}`);

    const target = options.reassignTo;
    if (target !== undefined) {
      if (target === id) throw new Error('Cannot reassign a payment method to itself');
      const replacement = await db.paymentMethods.get(target);
      if (!replacement) throw new Error(`No such payment method: ${target}`);
    }

    const affected = await db.transactions.where('paymentMethodId').equals(id).toArray();
    if (affected.length > 0) {
      await db.transactions.bulkPut(affected.map((t) => ({ ...t, paymentMethodId: target, updatedAt: now })));
    }

    const overrides = (await db.overrides.toArray()).filter(
      (o) => o.action === 'modify' && o.patch.paymentMethodId === id,
    );
    if (overrides.length > 0) {
      await db.overrides.bulkPut(
        overrides.map((o) =>
          o.action === 'modify'
            ? // `null` is "clear this field", which is why patch.paymentMethodId
              // is `string | null` rather than optional: an optional field cannot
              // express the difference between "unchanged" and "removed".
              { ...o, patch: { ...o.patch, paymentMethodId: target ?? null }, updatedAt: now }
            : o,
        ),
      );
    }

    await db.paymentMethods.delete(id);
    return { transactionsUpdated: affected.length, overridesUpdated: overrides.length };
  });
}
