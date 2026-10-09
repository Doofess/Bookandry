import { isDemoRow } from '@/domain/demo';
import { PROFILE_PALETTE } from '@/domain/palette';
import type { Profile } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import type { BookandryDB } from './db';
import { deleteProfile, nextAvailableColor } from './repos/profiles';
import { SETTINGS_ID } from './repos/settings';
import { NOWHERE } from './sync/tables';

/**
 * This account's own person in the household.
 *
 * Linked accounts are the household's people: a member's profile row has the
 * account's id for its id, so everything that already sorts rows by person -
 * the filter, the owner of a card, a balance per person - sorts them by
 * account. Each account writes its own row; it lives in its own space.
 *
 * Before accounts could link, the people of a household were profiles made
 * inside one account. The first of them (the person who set the account up)
 * becomes the account's own person here: their rows move to it, and the old
 * profile becomes a redirect, exactly as when a profile is deleted. Any others
 * stay as they are - "from before linking" - until they are given to a member.
 *
 * Called once the device has everything the account holds, so it never
 * mistakes a profile it has not pulled yet for one that does not exist.
 */
export type MemberOutcome = 'exists' | 'merged' | 'created' | 'none';

export async function ensureMember(
  db: BookandryDB,
  me: string,
  name: string,
  now: IsoInstant,
  today: LocalDate,
): Promise<MemberOutcome> {
  if ((await db.profiles.get(me)) !== undefined) return 'exists';
  const all = await db.profiles.toArray();
  // Nobody at all: the first-run steps make this account's person.
  if (all.length === 0) return 'none';

  const own = await fromBefore(db, all);
  const first = [...own].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )[0];

  if (first !== undefined) {
    await db.transaction(
      'rw',
      [db.profiles, db.transactions, db.paymentMethods, db.cashMoves, db.settings, db.redirects],
      async () => {
        await db.profiles.put({ ...first, id: me, updatedAt: now });
        const active = (await db.settings.get(SETTINGS_ID))?.activeProfileId;
        await deleteProfile(db, first.id, { reassignTo: me }, now);
        if (active === first.id) await db.settings.update(SETTINGS_ID, { activeProfileId: me });
      },
    );
    return 'merged';
  }

  const currency = (await db.settings.get(SETTINGS_ID))?.defaultCurrency ?? 'ILS';
  const profile: Profile = {
    id: me,
    name: name.trim() === '' ? 'Me' : name.trim().slice(0, 40),
    color: nextAvailableColor(all) ?? PROFILE_PALETTE[0].hex,
    openingBalanceMinor: 0,
    openingBalanceCurrency: currency,
    openingBalanceDate: today,
    createdAt: now,
    updatedAt: now,
  };
  await db.profiles.put(profile);
  return 'created';
}

/**
 * The people made inside this account before it could link: profiles that
 * live in its own space (or were never sent anywhere), and are not sample data.
 */
export async function fromBefore(db: BookandryDB, profiles: readonly Profile[]): Promise<Profile[]> {
  const states = await db.syncState.bulkGet(profiles.map((p) => ['profiles', p.id] as [string, string]));
  return profiles.filter((p, i) => {
    const home = states[i]?.home;
    return !isDemoRow(p.id) && (home === undefined || home === NOWHERE);
  });
}
