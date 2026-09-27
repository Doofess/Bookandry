import { planReconversion, type RateQuote, type UnresolvedRow } from '@/domain/reconvert';
import type { Override, Transaction } from '@/types/domain';
import type { Currency, IsoInstant, LocalDate, MoneySnapshot } from '@/types/money';

import type { BookandryDB } from '../db';
import { prefetchRates } from '../reconvert';
import { SETTINGS_ID } from '../repos/settings';

/**
 * Rows whose base amounts are in a currency that is no longer the base.
 *
 * How they happen: the laptop switches the household from USD to ILS and
 * reconverts every row it holds. The phone was offline and added three
 * expenses, in USD base. When those sync, the laptop holds ILS rows and three
 * USD ones, and every total that adds them up is adding two different units.
 *
 * Each row's own `money.baseCurrency` says which unit it is in, so the stale
 * ones are found exactly - no guessing from timestamps.
 */
export type StaleRows = {
  readonly base: Currency;
  readonly transactions: readonly Transaction[];
  readonly overrides: readonly Override[];
};

function overrideMoney(o: Override): MoneySnapshot | undefined {
  return o.action === 'modify' ? o.patch.money : undefined;
}

/** Stale rows, grouped by the base they are stuck in. Empty when consistent. */
export async function findStaleRows(db: BookandryDB): Promise<StaleRows[]> {
  const [settings, transactions, overrides] = await Promise.all([
    db.settings.get(SETTINGS_ID),
    db.transactions.toArray(),
    db.overrides.toArray(),
  ]);
  if (settings === undefined) return [];
  const base = settings.defaultCurrency;

  const groups = new Map<Currency, { transactions: Transaction[]; overrides: Override[] }>();
  const group = (c: Currency) => {
    const existing = groups.get(c);
    if (existing !== undefined) return existing;
    const created = { transactions: [] as Transaction[], overrides: [] as Override[] };
    groups.set(c, created);
    return created;
  };

  // Soft-deleted rows stay as they were deleted, exactly like a reconvert
  // leaves them: a restore should bring back what was deleted.
  for (const t of transactions) {
    if (t.isDeleted !== 1 && t.money.baseCurrency !== base) group(t.money.baseCurrency).transactions.push(t);
  }
  for (const o of overrides) {
    const money = overrideMoney(o);
    if (money !== undefined && money.baseCurrency !== base) group(money.baseCurrency).overrides.push(o);
  }

  return [...groups].map(([stale, rows]) => ({ base: stale, ...rows }));
}

export type RebaseDeps = {
  /** Rate for (currency -> the current base) on a date. The network lives here. */
  readonly fetchQuote: (currency: Currency, date: LocalDate) => Promise<RateQuote | undefined>;
  readonly now: IsoInstant;
};

export type RebaseReport = {
  readonly rebased: number;
  /** Rows still in an old base: a rate was missing. Surfaced, never guessed. */
  readonly unresolved: readonly UnresolvedRow[];
  readonly failedFetches: readonly string[];
};

/**
 * Bring every stale row into the current base.
 *
 * Reuses reconvert's planner group by group, each with its OWN old base: the
 * planner bridges through `oldBase` for manual rates, so treating a USD row and
 * a EUR row as one group would convert one of them through the wrong currency.
 *
 * Profiles are left alone. Their opening balances carry their own currency and
 * are converted when displayed, so there is nothing stale to fix.
 *
 * The writes are ordinary tracked edits: every device that holds the stale
 * rows computes the same fix, and last-write-wins settles who sent it.
 */
export async function rebaseStaleRows(db: BookandryDB, deps: RebaseDeps): Promise<RebaseReport> {
  const settings = await db.settings.get(SETTINGS_ID);
  const groups = await findStaleRows(db);
  if (settings === undefined || groups.length === 0) return { rebased: 0, unresolved: [], failedFetches: [] };

  const newBase = settings.defaultCurrency;
  const unresolved: UnresolvedRow[] = [];
  const failedFetches: string[] = [];
  const writes: {
    transactions: { id: string; money: MoneySnapshot }[];
    overrides: { id: string; money: MoneySnapshot }[];
  } = { transactions: [], overrides: [] };

  // Phase A, network only, for every group before any write.
  for (const g of groups) {
    const input = {
      oldBase: g.base,
      newBase,
      transactions: g.transactions,
      overrides: g.overrides,
      profiles: [],
    };
    const { lookup, failed } = await prefetchRates(input, { fetchQuote: deps.fetchQuote, now: deps.now });
    failedFetches.push(...failed);
    const plan = planReconversion(input, lookup);
    unresolved.push(...plan.unresolved);
    // Partial is right here, unlike a user's reconvert: every row this fixes
    // is one fewer wrong number, and the rest stay flagged and are retried.
    const blocked = new Set(plan.unresolved.map((u) => u.id));
    writes.transactions.push(...plan.transactions.filter((t) => !blocked.has(t.id)));
    writes.overrides.push(...plan.overrides.filter((o) => !blocked.has(o.id)));
  }

  // Phase B, one transaction, Dexie only.
  let rebased = 0;
  await db.transaction('rw', [db.transactions, db.overrides, db.settings], async () => {
    // Re-check under the transaction: a pull may have changed the base again,
    // or replaced a row, since the rates were fetched.
    const current = await db.settings.get(SETTINGS_ID);
    if (current?.defaultCurrency !== newBase) return;

    for (const entry of writes.transactions) {
      const row = await db.transactions.get(entry.id);
      if (row === undefined || row.money.baseCurrency === newBase) continue;
      await db.transactions.put({ ...row, money: entry.money, updatedAt: deps.now });
      rebased += 1;
    }
    for (const entry of writes.overrides) {
      const row = await db.overrides.get(entry.id);
      if (row?.action !== 'modify' || row.patch.money?.baseCurrency === newBase) continue;
      await db.overrides.put({ ...row, patch: { ...row.patch, money: entry.money }, updatedAt: deps.now });
      rebased += 1;
    }
  });

  return { rebased, unresolved, failedFetches };
}
