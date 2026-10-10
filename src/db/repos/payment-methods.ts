import { withoutTracking, type BookandryDB } from '@/db/db';
import { buildSeedPaymentMethods } from '@/db/seed';
import { readOrCreateDeviceId } from '@/db/sync/device';
import { accountSchema, cardSchema } from '@/domain/transfer-schema';
import { normalizeName } from '@/domain/validation';
import { normalizeAnnualRate } from '@/lib/money';
import { revFromIso } from '@/lib/rev';
import {
  BUILTIN_METHODS_SINCE,
  isActiveMethod,
  isBuiltinPaymentMethod,
  OTHER_METHOD_ID,
  redirectId,
  SHARED_OWNER,
  STANDING_ORDER_METHOD_ID,
  TRANSFER_METHOD_ID,
  WALLET_METHOD_ID,
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
  patch: Partial<Pick<PaymentMethod, 'label' | 'type' | 'profileId'>> & {
    /** `null` clears it: back to the card company's colour. */
    readonly color?: string | null;
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
    const { creditAnnualRate: _raw, card, account, color, ...rest } = patch;
    const next: PaymentMethod = {
      ...current,
      ...rest,
      ...(label === undefined ? {} : { label }),
      ...(color === undefined ? {} : { color: color ?? undefined }),
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
  // A newer version may store keys this one doesn't know; an edit here must not erase them.
  return { ...card, ...cardSchema.parse(card) };
}

function checkedAccount(account: BankAccountDetails): BankAccountDetails {
  return accountSchema.parse(account);
}

function checkedRate(input: string): string {
  const rate = normalizeAnnualRate(input);
  if (rate === undefined) throw new RangeError(`Not an annual rate: ${JSON.stringify(input)}`);
  return rate;
}

/** Whether a method is archived, and since when: what an Undo of Archive or Restore puts back. */
export type ArchiveState = Pick<PaymentMethod, 'isArchived' | 'archivedAt'>;

/**
 * Archive or restore a method. Returns what it was before, so an Undo can put
 * exactly that back with `putArchiveState`: re-archiving with a fresh date
 * would move the card's last fee month to today and charge the months between.
 */
export async function setPaymentMethodArchived(
  db: BookandryDB,
  id: string,
  archived: boolean,
  now: IsoInstant,
): Promise<ArchiveState | undefined> {
  return putArchiveState(db, id, archived ? { isArchived: 1, archivedAt: now } : { isArchived: 0 }, now);
}

/** Write an archive state as given (an Undo's), returning the one it replaced. */
export async function putArchiveState(
  db: BookandryDB,
  id: string,
  state: ArchiveState,
  now: IsoInstant,
): Promise<ArchiveState | undefined> {
  // Cash and cheques are always there: nobody can be left without them.
  if (isBuiltinPaymentMethod(id)) throw new Error(`${id} is built in and is always available`);
  return db.transaction('rw', db.paymentMethods, async () => {
    const before = await db.paymentMethods.get(id);
    if (before === undefined) return undefined;
    await db.paymentMethods.update(id, {
      isArchived: state.isArchived,
      archivedAt: state.isArchived === 1 ? state.archivedAt : undefined,
      updatedAt: now,
    });
    return { isArchived: before.isArchived, archivedAt: before.archivedAt };
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

/** The newer built-ins: synced rows, unlike cash and cheques (spec 10.2). */
const SYNCED_BUILTINS: ReadonlySet<string> = new Set([
  TRANSFER_METHOD_ID,
  STANDING_ORDER_METHOD_ID,
  WALLET_METHOD_ID,
  OTHER_METHOD_ID,
]);

/**
 * The newer built-ins this device holds but has never sent, queued for upload
 * dated the one fixed instant (spec 10.2).
 *
 * A fresh install and an erased one seed all six untracked, so without this
 * no device on this build would ever send them, and a device on an older
 * build would clear a transaction that names one. A pristine row is identical
 * on every device, and any real edit has a later rev, so sending it never
 * undoes anything. Cash and cheques are never sent.
 *
 * Runs inside the caller's untracked transaction, which must hold
 * `paymentMethods`, `syncState` and `outbox`.
 */
export async function queueBuiltinUploads(db: BookandryDB, deviceId: string): Promise<void> {
  for (const id of SYNCED_BUILTINS) {
    if ((await db.paymentMethods.get(id)) === undefined) continue;
    if ((await db.syncState.get(['paymentMethods', id])) !== undefined) continue;
    await db.syncState.put({
      tbl: 'paymentMethods',
      id,
      rev: revFromIso(BUILTIN_METHODS_SINCE, deviceId),
      deleted: 0,
    });
    await db.outbox.put({ tbl: 'paymentMethods', id });
  }
}

/**
 * The built-ins, on any install that lacks one.
 *
 * A new database gets them from `populate` (db.ts); this adds any that an
 * older one lacks. Cash and cheques are added untracked, as they always were:
 * every install writes the identical row. The newer four, added here or
 * already here, are uploaded if this device has never sent them (see
 * `queueBuiltinUploads`). One that an older build deleted is added back as an
 * ordinary edit, so it returns everywhere.
 *
 * Every read and write is inside a transaction, so two tabs booting this build
 * at once serialise here and the second finds the rows the first added.
 */
export async function ensureBuiltinPaymentMethods(db: BookandryDB, now: IsoInstant): Promise<void> {
  const seeds = buildSeedPaymentMethods(now);
  const deletedElsewhere = await withoutTracking(
    db,
    [db.paymentMethods, db.syncState, db.outbox, db.meta],
    async () => {
      const deleted: PaymentMethod[] = [];
      for (const method of seeds) {
        if ((await db.paymentMethods.get(method.id)) !== undefined) continue;
        const state = await db.syncState.get(['paymentMethods', method.id]);
        if (SYNCED_BUILTINS.has(method.id) && state?.deleted === 1) deleted.push(method);
        else await db.paymentMethods.add(method);
      }
      await queueBuiltinUploads(db, await readOrCreateDeviceId(db.meta));
      return deleted;
    },
  );
  if (deletedElsewhere.length === 0) return;
  // Tracked: the middleware gives each a rev newer than the deletion.
  await db.transaction('rw', [db.paymentMethods, db.syncState, db.outbox], async () => {
    for (const method of deletedElsewhere) {
      if ((await db.paymentMethods.get(method.id)) !== undefined) continue;
      await db.paymentMethods.put({ ...method, updatedAt: now });
    }
  });
}
