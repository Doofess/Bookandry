import { FALLBACK_CATEGORY } from '@/db/seed';
import { PROFILE_PALETTE } from '@/domain/palette';
import {
  ALL_PROFILES,
  redirectId,
  type CashMove,
  type Category,
  type Override,
  type Profile,
  type Redirect,
  type RedirectTable,
  type Transaction,
} from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import type { BookandryDB } from './db';
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
  /** A cash move whose person is gone: given away or deleted on another device. */
  | { readonly kind: 'orphan_cash_move'; readonly cashMoveId: string; readonly profileId: string }
  | { readonly kind: 'duplicate_color'; readonly profileIds: readonly string[]; readonly color: string }
  /** The feed is filtered to a profile that no longer exists: deleted on another device. */
  | { readonly kind: 'dangling_active_profile'; readonly activeProfileId: string };

type Snapshot = {
  profiles: Profile[];
  categories: Map<string, Category>;
  methods: Set<string>;
  transactions: Transaction[];
  overrides: Override[];
  cashMoves: CashMove[];
  hasSettings: boolean;
  activeProfileId: string | undefined;
  redirects: Map<string, Redirect>;
};

async function snapshot(db: BookandryDB): Promise<Snapshot> {
  const [profiles, categories, methods, transactions, overrides, cashMoves, settings, redirects] =
    await Promise.all([
      db.profiles.toArray(),
      db.categories.toArray(),
      db.paymentMethods.toArray(),
      db.transactions.toArray(),
      db.overrides.toArray(),
      db.cashMoves.toArray(),
      db.settings.get('singleton'),
      db.redirects.toArray(),
    ]);

  return {
    profiles,
    categories: new Map(categories.map((c) => [c.id, c])),
    methods: new Set(methods.map((m) => m.id)),
    transactions,
    overrides,
    cashMoves,
    hasSettings: settings !== undefined,
    activeProfileId: settings?.activeProfileId,
    redirects: new Map(redirects.map((r) => [r.id, r])),
  };
}

/**
 * Oldest first, and by id when two were created in the same millisecond.
 *
 * Every device holding the same rows must pick the same winner, or each one
 * repairs differently and the "fix" becomes a conflict that never settles.
 */
function byAge(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/**
 * Where a deleted row's references were sent, following chains (A was merged
 * into B, which was later merged into C). Undefined when nobody said, or when
 * the chain ends at a row that is gone too; null when they were cleared.
 */
function followRedirect(
  redirects: ReadonlyMap<string, Redirect>,
  tbl: RedirectTable,
  from: string,
  exists: (id: string) => boolean,
): string | null | undefined {
  let current = from;
  for (let hop = 0; hop < 16; hop += 1) {
    const redirect = redirects.get(redirectId(tbl, current));
    if (redirect === undefined) return undefined;
    if (redirect.to === null) return null;
    if (exists(redirect.to)) return redirect.to;
    current = redirect.to;
  }
  return undefined; // a cycle or an absurd chain: fall back
}

export async function checkIntegrity(db: BookandryDB): Promise<IntegrityIssue[]> {
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

  for (const m of state.cashMoves) {
    // Out of every person's pot, and a backup that holds it will not restore.
    if (!profileIds.has(m.profileId)) {
      issues.push({ kind: 'orphan_cash_move', cashMoveId: m.id, profileId: m.profileId });
    }
  }

  if (
    state.activeProfileId !== undefined &&
    state.activeProfileId !== ALL_PROFILES &&
    !profileIds.has(state.activeProfileId)
  ) {
    issues.push({ kind: 'dangling_active_profile', activeProfileId: state.activeProfileId });
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
export async function repairIntegrity(db: BookandryDB, now: IsoInstant): Promise<RepairReport> {
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
      [
        db.profiles,
        db.categories,
        db.paymentMethods,
        db.transactions,
        db.overrides,
        db.cashMoves,
        db.settings,
        db.redirects,
      ],
      async () => {
        const state = await snapshot(db);
        const oldestProfile = [...state.profiles].sort(byAge)[0];
        const profileIds = new Set(state.profiles.map((p) => p.id));
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
              const redirected = followRedirect(state.redirects, 'profiles', issue.profileId, (id) =>
                profileIds.has(id),
              );
              const target = redirected ?? oldestProfile?.id;
              if (target === undefined) {
                unrepairable.push(issue);
                break;
              }
              patched.set(tx.id, { ...touch(tx), profileId: target, updatedAt: now });
              repaired.push(issue);
              break;
            }

            case 'missing_category':
            case 'kind_mismatch': {
              const tx = state.transactions.find((t) => t.id === issue.transactionId);
              if (!tx) break;
              const redirected =
                issue.kind === 'missing_category'
                  ? followRedirect(state.redirects, 'categories', issue.categoryId, (id) =>
                      state.categories.has(id),
                    )
                  : undefined;
              const target =
                redirected !== undefined &&
                redirected !== null &&
                state.categories.get(redirected)?.kind === tx.kind
                  ? redirected
                  : FALLBACK_CATEGORY[tx.kind];
              patched.set(tx.id, { ...touch(tx), categoryId: target, updatedAt: now });
              repaired.push(issue);
              break;
            }

            case 'missing_payment_method': {
              const tx = state.transactions.find((t) => t.id === issue.transactionId);
              if (!tx) break;
              const redirected = followRedirect(
                state.redirects,
                'paymentMethods',
                issue.paymentMethodId,
                (id) => state.methods.has(id),
              );
              patched.set(tx.id, { ...touch(tx), paymentMethodId: redirected ?? undefined, updatedAt: now });
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

            case 'dangling_active_profile': {
              const settings = await db.settings.get('singleton');
              if (settings !== undefined)
                await db.settings.put({ ...settings, activeProfileId: ALL_PROFILES, updatedAt: now });
              repaired.push(issue);
              break;
            }

            case 'orphan_override': {
              await db.overrides.delete(issue.overrideId);
              repaired.push(issue);
              break;
            }

            case 'orphan_cash_move': {
              // Where the person's transactions went; with no one named, the
              // move is deleted rather than given to a guess: it never changed
              // the balance, so no money leaves it.
              const move = state.cashMoves.find((m) => m.id === issue.cashMoveId);
              if (!move) break;
              const target = followRedirect(state.redirects, 'profiles', issue.profileId, (id) =>
                profileIds.has(id),
              );
              if (target === undefined || target === null) {
                await db.cashMoves.delete(move.id);
              } else {
                await db.cashMoves.put({ ...move, profileId: target, updatedAt: now });
              }
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
                .sort(byAge)
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
