import { withoutTracking, type BookandryDB } from '@/db/db';
import { buildSeedPaymentMethods } from '@/db/seed';
import { accountSchema, cardSchema } from '@/domain/transfer-schema';
import { normalizeName } from '@/domain/validation';
import { normalizeAnnualRate } from '@/lib/money';
import {
  isActiveMethod,
  isBuiltinPaymentMethod,
  redirectId,
  SHARED_OWNER,
  type BankAccountDetails,
  type CardDetails,
  type PaymentMethod,
  type PaymentMethodType,
} from '@/types/domain';
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
  db: BookandryDB,
  query: PaymentMethodQuery = {},
): Promise<PaymentMethod[]> {
  const rows = await db.paymentMethods.toArray();
  return rows
    .filter((m) => {
      if (query.includeArchived !== true && !isActiveMethod(m)) return false;
      if (query.profileId === undefined) return true;
      return m.profileId === query.profileId || m.profileId === SHARED_OWNER;
    })
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

export async function createPaymentMethod(
  db: BookandryDB,
  id: string,
  draft: {
    label: string;
    type: PaymentMethodType;
    profileId: string;
    color?: string;
    creditAnnualRate?: string;
    card?: CardDetails;
    account?: BankAccountDetails;
  },
  now: IsoInstant,
): Promise<PaymentMethod> {
  // §12: a LABEL, never a number or any other credential. gate:pci keeps it
  // that way.
  const label = normalizeName(draft.label);
  const creditAnnualRate =
    draft.creditAnnualRate === undefined ? undefined : checkedRate(draft.creditAnnualRate);

  const row: PaymentMethod = {
    id,
    profileId: draft.profileId,
    type: draft.type,
    label,
    color: draft.color,
    ...(creditAnnualRate === undefined ? {} : { creditAnnualRate }),
    ...(draft.card === undefined ? {} : { card: checkedCard(draft.card) }),
    ...(draft.account === undefined ? {} : { account: checkedAccount(draft.account) }),
    isArchived: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.paymentMethods.add(row);
  return row;
}

export async function updatePaymentMethod(
  db: BookandryDB,
  id: string,
  patch: Partial<Pick<PaymentMethod, 'label' | 'type' | 'color' | 'profileId'>> & {
    /** `null` CLEARS it, which `Partial<>` alone cannot express. */
    readonly creditAnnualRate?: string | null;
    /** The card's details, whole; `null` removes them. */
    readonly card?: CardDetails | null;
    /** The bank account's details, whole; `null` removes them. */
    readonly account?: BankAccountDetails | null;
  },
  now: IsoInstant,
): Promise<PaymentMethod> {
  const label = patch.label === undefined ? undefined : normalizeName(patch.label);
  const rate =
    patch.creditAnnualRate === undefined || patch.creditAnnualRate === null
      ? patch.creditAnnualRate
      : checkedRate(patch.creditAnnualRate);

  /*
   * The built-in keeps its name and its owner.
   *
   * Its label is not stored copy at all - `methodDisplayName` resolves it from
   * the UI language - so a rename would write a value nothing ever reads. And
   * cash belongs to the household, not a person: moving it to one profile would
   * take it away from everyone else on the device.
   */
  if (isBuiltinPaymentMethod(id) && (patch.label !== undefined || patch.profileId !== undefined)) {
    throw new Error(`${id} is built in: its name and owner are fixed`);
  }

  return db.transaction('rw', db.paymentMethods, async () => {
    const current = await db.paymentMethods.get(id);
    if (!current) throw new Error(`No such payment method: ${id}`);
    const { creditAnnualRate: _raw, card, account, ...rest } = patch;
    const next: PaymentMethod = {
      ...current,
      ...rest,
      ...(label === undefined ? {} : { label }),
      // undefined leaves it alone; null clears it; a string sets it.
      ...(rate === undefined
        ? {}
        : rate === null
          ? { creditAnnualRate: undefined }
          : { creditAnnualRate: rate }),
      ...(card === undefined ? {} : { card: card === null ? undefined : checkedCard(card) }),
      ...(account === undefined ? {} : { account: account === null ? undefined : checkedAccount(account) }),
      updatedAt: now,
    };
    await db.paymentMethods.put(next);
    return next;
  });
}

/**
 * A rate the rest of the app can price with, or a thrown error.
 *
 * Checked here and not only in the editor, for the same reason the built-in
 * rules are: the screen is one caller. A rate that reached the table as "1e1"
 * or "12.5.1" would be copied onto every קרדיט plan charged to the card.
 */
/** Card details the rest of the app can read, or a thrown error - the same rule an import is held to. */
function checkedCard(card: CardDetails): CardDetails {
  return cardSchema.parse(card);
}

function checkedAccount(account: BankAccountDetails): BankAccountDetails {
  return accountSchema.parse(account);
}

function checkedRate(input: string): string {
  const rate = normalizeAnnualRate(input);
  if (rate === undefined) throw new RangeError(`Not an annual rate: ${JSON.stringify(input)}`);
  return rate;
}

export async function setPaymentMethodArchived(
  db: BookandryDB,
  id: string,
  archived: boolean,
  now: IsoInstant,
): Promise<void> {
  // Cash and cheques are always there: nobody can be left without them.
  if (isBuiltinPaymentMethod(id)) throw new Error(`${id} is built in and is always available`);
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
  db: BookandryDB,
  id: string,
  options: { reassignTo?: string },
  now: IsoInstant,
): Promise<{ transactionsUpdated: number; overridesUpdated: number }> {
  /*
   * Enforced HERE, not only in the UI that hides the button.
   *
   * Cash is seeded rather than created, and a transaction can point at it from
   * any profile. Deleting it would leave the only universally available method
   * missing on an install that has no way to recreate it - there is no "add
   * cash" any more, by design.
   */
  if (isBuiltinPaymentMethod(id)) {
    throw new Error(`${id} is built in and cannot be deleted; archive it instead`);
  }

  return db.transaction('rw', [db.paymentMethods, db.transactions, db.overrides, db.redirects], async () => {
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

    /*
     * Cards debited from a deleted account let go of it.
     *
     * Their `bank` already holds the bank's name, so they still say where
     * the bill goes; only the link to a row that is gone is dropped.
     */
    const debited = (await db.paymentMethods.toArray()).filter((m) => m.card?.accountId === id);
    if (debited.length > 0) {
      await db.paymentMethods.bulkPut(
        debited.map((m) => {
          const { accountId: _gone, ...card } = m.card ?? {};
          return { ...m, card, updatedAt: now };
        }),
      );
    }

    await db.paymentMethods.delete(id);
    // Where references went, for a device that kept using this row while it
    // was offline: it follows the choice made here, not the fallback.
    await db.redirects.put({
      id: redirectId('paymentMethods', id),
      tbl: 'paymentMethods',
      from: id,
      to: target ?? null,
      createdAt: now,
      updatedAt: now,
    });
    return { transactionsUpdated: affected.length, overridesUpdated: overrides.length };
  });
}

/**
 * The built-in methods, on an install made before one of them existed.
 *
 * A new database gets them from `populate` (db.ts); this adds any that an
 * older one lacks - Cheque, for installs from before it. Untracked, like the
 * seed: every install writes the identical row, and as an edit it would
 * overwrite an archive made on another device. A built-in cannot be deleted,
 * so a missing one was never there.
 */
export async function ensureBuiltinPaymentMethods(db: BookandryDB, now: IsoInstant): Promise<void> {
  await withoutTracking(db, [db.paymentMethods], async () => {
    for (const method of buildSeedPaymentMethods(now)) {
      if ((await db.paymentMethods.get(method.id)) === undefined) await db.paymentMethods.add(method);
    }
  });
}
