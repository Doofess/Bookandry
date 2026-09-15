import { FALLBACK_CATEGORY } from '@/db/seed';
import { PROFILE_PALETTE } from '@/domain/palette';
import type { Category, Override, Profile, Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import type { GreenbackDB } from './db';
import { LOCK_REPAIR, withLock } from './lock';
import { assertMaterialized, materialize } from './materialize';
import { ensureSettings } from './repos/settings';

/**
 * Referential integrity, done by hand.
 *
 * IndexedDB has no foreign keys and no constraints beyond uniqueness on an
 * index, so nothing in the store prevents a transaction pointing at a category
 * that was deleted, or a `seriesEnd` that no longer matches the recurrence it
 * was derived from. Every repo here is careful, but "careful" is not a
 * guarantee across an interrupted import, a half-applied schema upgrade, or a
 * file someone hand-edited before importing it.
 *
 * Split in two on purpose: `checkIntegrity` is read-only and safe to run
 * anywhere (including a dev overlay), `repairIntegrity` writes.
 */

export type IntegrityIssue =
  | { readonly kind: 'missing_settings' }
  | { readonly kind: 'missing_profile'; readonly transactionId: string; readonly profileId: string }
  | { readonly kind: 'missing_category'; readonly transactionId: string; readonly categoryId: string }
  | { readonly kind: 'kind_mismatch'; readonly transactionId: string; readonly categoryId: string }
  | {
      readonly kind: 'missing_payment_method';
      readonly transactionId: string;
      readonly paymentMethodId: string;
    }
  | {
      readonly kind: 'denormalised_drift';
      readonly transactionId: string;
      readonly problems: readonly string[];
    }
  | { readonly kind: 'orphan_override'; readonly overrideId: string; readonly transactionId: string }
  | { readonly kind: 'duplicate_color'; readonly profileIds: readonly string[]; readonly color: string };

type Snapshot = {
  profiles: Profile[];
  categories: Map<string, Category>;
  methods: Set<string>;
  transactions: Transaction[];
  overrides: Override[];
  hasSettings: boolean;
};

async function snapshot(db: GreenbackDB): Promise<Snapshot> {
  const [profiles, categories, methods, transactions, overrides, settings] = await Promise.all([
    db.profiles.toArray(),
    db.categories.toArray(),
    db.paymentMethods.toArray(),
    db.transactions.toArray(),
    db.overrides.toArray(),
    db.settings.get('singleton'),
  ]);

  return {
    profiles,
    categories: new Map(categories.map((c) => [c.id, c])),
    methods: new Set(methods.map((m) => m.id)),
    transactions,
    overrides,
    hasSettings: settings !== undefined,
  };
}

export async function checkIntegrity(db: GreenbackDB): Promise<IntegrityIssue[]> {
  const state = await snapshot(db);
  const issues: IntegrityIssue[] = [];

  if (!state.hasSettings) issues.push({ kind: 'missing_settings' });

  const profileIds = new Set(state.profiles.map((p) => p.id));
  const byId = new Map(state.transactions.map((t) => [t.id, t]));
  const overridesByTx = new Map<string, Override[]>();
  for (const o of state.overrides) {
    const list = overridesByTx.get(o.transactionId) ?? [];
    list.push(o);
    overridesByTx.set(o.transactionId, list);
  }

  for (const t of state.transactions) {
    if (!profileIds.has(t.profileId)) {
      issues.push({ kind: 'missing_profile', transactionId: t.id, profileId: t.profileId });
    }

    const category = state.categories.get(t.categoryId);
    if (category === undefined) {
      issues.push({ kind: 'missing_category', transactionId: t.id, categoryId: t.categoryId });
    } else if (category.kind !== t.kind) {
      // An income row filed under an expense category flips its sign in every
      // calculator while looking perfectly ordinary in the feed.
      issues.push({ kind: 'kind_mismatch', transactionId: t.id, categoryId: t.categoryId });
    }

    if (t.paymentMethodId !== undefined && !state.methods.has(t.paymentMethodId)) {
      issues.push({
        kind: 'missing_payment_method',
        transactionId: t.id,
        paymentMethodId: t.paymentMethodId,
      });
    }

    const problems = assertMaterialized(t, overridesByTx.get(t.id) ?? []);
    if (problems.length > 0) {
      issues.push({ kind: 'denormalised_drift', transactionId: t.id, problems });
    }
  }

  for (const o of state.overrides) {
    // A hard delete cascades, but an interrupted one leaves rows that resurrect
    // if the id is ever reused, and count against the unique index forever.
    if (!byId.has(o.transactionId)) {
      issues.push({ kind: 'orphan_override', overrideId: o.id, transactionId: o.transactionId });
    }
  }

  const byColor = new Map<string, string[]>();
  for (const p of state.profiles) {
    byColor.set(p.color, [...(byColor.get(p.color) ?? []), p.id]);
  }
  for (const [color, ids] of byColor) {
    if (ids.length > 1) issues.push({ kind: 'duplicate_color', profileIds: ids.sort(), color });
  }

  return issues;
}

export type RepairReport = {
  readonly found: readonly IntegrityIssue[];
  readonly repaired: readonly IntegrityIssue[];
  /** Issues nothing can fix without inventing data. Surfaced, never guessed at. */
  readonly unrepairable: readonly IntegrityIssue[];
};

/**
 * Fix what can be fixed from facts already in the database.
 *
 * The one thing it will NOT do is invent a profile. A transaction pointing at a
 * profile that does not exist is real money with no owner; if some other profile
 * exists it is adopted by the oldest one, and if none does the issue is
 * reported so the first-run wizard can take over. Silently creating "Recovered"
 * would hide the only signal that something went wrong.
 */
export async function repairIntegrity(db: GreenbackDB, now: IsoInstant): Promise<RepairReport> {
  return withLock(LOCK_REPAIR, async () => {
    const found = await checkIntegrity(db);
    if (found.length === 0) return { found, repaired: [], unrepairable: [] };

    if (found.some((i) => i.kind === 'missing_settings')) await ensureSettings(db, now);

    const repaired: IntegrityIssue[] = [];
    const unrepairable: IntegrityIssue[] = [];

    await db.transaction(
      'rw',
      // settings is in scope because snapshot() reads it; Dexie refuses a table
      // the enclosing transaction did not declare.
      [db.profiles, db.categories, db.paymentMethods, db.transactions, db.overrides, db.settings],
      async () => {
        const state = await snapshot(db);
        const oldestProfile = [...state.profiles].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        const overridesByTx = new Map<string, Override[]>();
        for (const o of state.overrides) {
          overridesByTx.set(o.transactionId, [...(overridesByTx.get(o.transactionId) ?? []), o]);
        }

        const patched = new Map<string, Transaction>();
        const touch = (t: Transaction): Transaction => patched.get(t.id) ?? t;

        for (const issue of found) {
          switch (issue.kind) {
            case 'missing_settings':
              repaired.push(issue);
              break;

            case 'missing_profile': {
              const tx = state.transactions.find((t) => t.id === issue.transactionId);
              if (!tx) break;
              if (oldestProfile === undefined) {
                unrepairable.push(issue);
                break;
              }
              patched.set(tx.id, { ...touch(tx), profileId: oldestProfile.id, updatedAt: now });
              repaired.push(issue);
              break;
            }

            case 'missing_category':
            case 'kind_mismatch': {
              const tx = state.transactions.find((t) => t.id === issue.transactionId);
              if (!tx) break;
              patched.set(tx.id, { ...touch(tx), categoryId: FALLBACK_CATEGORY[tx.kind], updatedAt: now });
              repaired.push(issue);
              break;
            }

            case 'missing_payment_method': {
              const tx = state.transactions.find((t) => t.id === issue.transactionId);
              if (!tx) break;
              patched.set(tx.id, { ...touch(tx), paymentMethodId: undefined, updatedAt: now });
              repaired.push(issue);
              break;
            }

            case 'denormalised_drift': {
              const tx = state.transactions.find((t) => t.id === issue.transactionId);
              if (!tx) break;
              patched.set(tx.id, materialize(touch(tx), overridesByTx.get(tx.id) ?? []));
              repaired.push(issue);
              break;
            }

            case 'orphan_override': {
              await db.overrides.delete(issue.overrideId);
              repaired.push(issue);
              break;
            }

            case 'duplicate_color': {
              // The oldest profile keeps the colour; the others take the next
              // free one. Uniqueness is what caps the app at twelve profiles,
              // so a duplicate quietly costs a slot.
              const taken = new Set(state.profiles.map((p) => p.color));
              const clashing = issue.profileIds
                .map((id) => state.profiles.find((p) => p.id === id))
                .filter((p): p is Profile => p !== undefined)
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                .slice(1);

              let fixedAll = true;
              for (const profile of clashing) {
                const free = PROFILE_PALETTE.find((c) => !taken.has(c.hex))?.hex;
                if (free === undefined) {
                  fixedAll = false;
                  break;
                }
                taken.add(free);
                await db.profiles.put({ ...profile, color: free, updatedAt: now });
              }
              (fixedAll ? repaired : unrepairable).push(issue);
              break;
            }
          }
        }

        // One write per transaction, however many issues it had: re-materialise
        // last so the denormalised fields reflect every other repair.
        const rows = [...patched.values()].map((t) => materialize(t, overridesByTx.get(t.id) ?? []));
        if (rows.length > 0) await db.transactions.bulkPut(rows);
      },
    );

    return { found, repaired, unrepairable };
  });
}
