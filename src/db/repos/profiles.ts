import type { GreenbackDB } from '@/db/db';
import { MAX_PROFILES, nextFreeColor } from '@/domain/palette';
import { normalizeName } from '@/domain/validation';
import { ALL_PROFILES, SHARED_OWNER, type AvatarKey, type Profile } from '@/types/domain';
import type { Currency, IsoInstant, LocalDate, Minor } from '@/types/money';

import { SETTINGS_ID } from './settings';

export class ProfileLimitError extends Error {
  constructor(readonly limit: number) {
    super(`At most ${String(limit)} profiles are supported`);
    this.name = 'ProfileLimitError';
  }
}

export class ColorTakenError extends Error {
  constructor(readonly color: string) {
    super(`Colour ${color} is already used by another profile`);
    this.name = 'ColorTakenError';
  }
}

/**
 * Deleting a profile that still owns money needs somewhere to put it.
 *
 * Refusing with the count is the whole point: a dialog that says "move 214
 * transactions to..." is a decision, while a silent cascade is data loss the
 * user discovers a month later.
 */
export class ProfileNotEmptyError extends Error {
  constructor(
    readonly profileId: string,
    readonly transactionCount: number,
  ) {
    super(`Profile ${profileId} still has ${String(transactionCount)} transactions`);
    this.name = 'ProfileNotEmptyError';
  }
}

export type ProfileDraft = {
  readonly name: string;
  readonly avatar: AvatarKey;
  readonly color?: string;
  readonly openingBalanceMinor: Minor;
  readonly openingBalanceCurrency: Currency;
  readonly openingBalanceDate: LocalDate;
};

export async function listProfiles(db: GreenbackDB): Promise<Profile[]> {
  const rows = await db.profiles.toArray();
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/**
 * The first palette colour nobody has taken.
 *
 * Returns undefined when all twelve are in use, which is exactly the condition
 * that disables the Add button - surfaced as a reason, not as a form that fails
 * on submit.
 */
export function nextAvailableColor(existing: readonly Profile[]): string | undefined {
  return nextFreeColor(existing.map((p) => p.color));
}

/**
 * Create a profile, with the cap and the colour check inside the transaction.
 *
 * Reading the profile list and writing the new row in separate steps lets two
 * tabs both pass the cap check and both take emerald.
 */
export async function createProfile(
  db: GreenbackDB,
  id: string,
  draft: ProfileDraft,
  now: IsoInstant,
): Promise<Profile> {
  const name = normalizeName(draft.name);

  return db.transaction('rw', db.profiles, async () => {
    const existing = await db.profiles.toArray();
    if (existing.length >= MAX_PROFILES) throw new ProfileLimitError(MAX_PROFILES);

    const color = draft.color ?? nextAvailableColor(existing);
    if (color === undefined) throw new ProfileLimitError(MAX_PROFILES);
    if (existing.some((p) => p.color === color)) throw new ColorTakenError(color);

    const row: Profile = {
      id,
      name,
      avatar: draft.avatar,
      color,
      openingBalanceMinor: draft.openingBalanceMinor,
      openingBalanceCurrency: draft.openingBalanceCurrency,
      openingBalanceDate: draft.openingBalanceDate,
      createdAt: now,
      updatedAt: now,
    };
    await db.profiles.add(row);
    return row;
  });
}

export async function updateProfile(
  db: GreenbackDB,
  id: string,
  patch: Partial<Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>>,
  now: IsoInstant,
): Promise<Profile> {
  const name = patch.name === undefined ? undefined : normalizeName(patch.name);

  return db.transaction('rw', db.profiles, async () => {
    const current = await db.profiles.get(id);
    if (!current) throw new Error(`No such profile: ${id}`);

    if (patch.color !== undefined && patch.color !== current.color) {
      const clash = await db.profiles.filter((p) => p.id !== id && p.color === patch.color).first();
      if (clash) throw new ColorTakenError(patch.color);
    }

    const next: Profile = { ...current, ...patch, ...(name === undefined ? {} : { name }), updatedAt: now };
    await db.profiles.put(next);
    return next;
  });
}

export type DeleteProfileOptions = {
  /** Where this profile's transactions and payment methods go. */
  readonly reassignTo?: string;
};

export type DeleteProfileResult = {
  readonly transactionsMoved: number;
  readonly paymentMethodsMoved: number;
  readonly paymentMethodsDeleted: number;
};

/**
 * Delete a profile, atomically, taking nothing with it by accident.
 *
 * One transaction covering profiles, transactions, payment methods and settings.
 * Four writes that must all land or none: a crash between "reassign the
 * transactions" and "delete the profile" leaves rows pointing at a profile that
 * still exists, which looks fine; a crash the other way round leaves them
 * pointing at nothing, which looks like the transactions were deleted.
 *
 * Soft-deleted rows are moved too. They are still recoverable, and restoring a
 * transaction into a profile that no longer exists is how "Recently deleted"
 * turns into a crash.
 */
export async function deleteProfile(
  db: GreenbackDB,
  id: string,
  options: DeleteProfileOptions,
  now: IsoInstant,
): Promise<DeleteProfileResult> {
  return db.transaction('rw', [db.profiles, db.transactions, db.paymentMethods, db.settings], async () => {
    const profile = await db.profiles.get(id);
    if (!profile) throw new Error(`No such profile: ${id}`);

    const owned = await db.transactions.where('profileId').equals(id).toArray();
    const { reassignTo } = options;

    if (owned.length > 0 && reassignTo === undefined) {
      throw new ProfileNotEmptyError(id, owned.length);
    }
    if (reassignTo !== undefined) {
      if (reassignTo === id) throw new Error('Cannot reassign a profile to itself');
      const target = await db.profiles.get(reassignTo);
      if (!target) throw new Error(`No such profile: ${reassignTo}`);
    }

    if (owned.length > 0 && reassignTo !== undefined) {
      await db.transactions.bulkPut(owned.map((t) => ({ ...t, profileId: reassignTo, updatedAt: now })));
    }

    // Shared methods (SHARED_OWNER) belong to nobody and are untouched.
    const methods = await db.paymentMethods.where('profileId').equals(id).toArray();
    let moved = 0;
    let removed = 0;
    if (reassignTo === undefined) {
      await db.paymentMethods.bulkDelete(methods.map((m) => m.id));
      removed = methods.length;
    } else {
      await db.paymentMethods.bulkPut(methods.map((m) => ({ ...m, profileId: reassignTo, updatedAt: now })));
      moved = methods.length;
    }

    await db.profiles.delete(id);

    // A dangling activeProfileId renders an empty feed with no explanation.
    const settings = await db.settings.get(SETTINGS_ID);
    if (settings?.activeProfileId === id) {
      const remaining = await db.profiles.toCollection().first();
      await db.settings.put({
        ...settings,
        activeProfileId: reassignTo ?? remaining?.id ?? ALL_PROFILES,
        updatedAt: now,
      });
    }

    return {
      transactionsMoved: reassignTo === undefined ? 0 : owned.length,
      paymentMethodsMoved: moved,
      paymentMethodsDeleted: removed,
    };
  });
}

/** Profiles a transaction may be filed under, plus the shared sentinel. */
export function isRealProfileId(id: string): boolean {
  return id !== ALL_PROFILES && id !== SHARED_OWNER;
}
