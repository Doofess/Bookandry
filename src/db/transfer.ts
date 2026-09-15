import type { GreenbackDB } from '@/db/db';
import { planReconversion, type RateLookup } from '@/domain/reconvert';
import { planMerge, type Timestamped } from '@/domain/transfer-merge';
import { CURRENT_DOC_VERSION, type ExportEnvelope } from '@/domain/transfer-schema';
import { validateEnvelope, type ValidationIssue } from '@/domain/transfer-validate';
import type { Override, Transaction } from '@/types/domain';
import type { Currency, IsoInstant } from '@/types/money';

import { SETTINGS_ID } from './repos/settings';

export const APP_VERSION = '0.1.0';

type AppliedCounts = {
  profiles: number;
  categories: number;
  paymentMethods: number;
  transactions: number;
  overrides: number;
};

/** The minimal surface planMerge needs, so the tables share one call signature. */
type MergeableTable = {
  toArray(): Promise<Timestamped[]>;
  bulkPut(rows: readonly Timestamped[]): Promise<unknown>;
};

/**
 * JSON export and import.
 *
 * `ratesTables`, `ratesMeta`, `currencyLists` and `meta` are deliberately
 * EXCLUDED: they are regenerable caches, and a stale rate table baked into a
 * shipped file is a liability rather than a feature.
 */
export async function buildExport(db: GreenbackDB, now: IsoInstant): Promise<ExportEnvelope> {
  const [profiles, categories, paymentMethods, transactions, overrides, settings] = await Promise.all([
    db.profiles.toArray(),
    db.categories.toArray(),
    db.paymentMethods.toArray(),
    db.transactions.toArray(),
    db.overrides.toArray(),
    db.settings.get(SETTINGS_ID),
  ]);

  return {
    app: 'greenback',
    schemaVersion: CURRENT_DOC_VERSION,
    appVersion: APP_VERSION,
    exportedAt: now,
    // Load-bearing: every baseAmountMinor below is denominated in this.
    defaultCurrency: settings?.defaultCurrency ?? 'USD',
    counts: {
      profiles: profiles.length,
      categories: categories.length,
      paymentMethods: paymentMethods.length,
      transactions: transactions.length,
      overrides: overrides.length,
    },
    settings: {
      defaultCurrency: settings?.defaultCurrency ?? 'USD',
      language: settings?.language ?? 'en',
      theme: settings?.theme ?? 'system',
      activeProfileId: settings?.activeProfileId ?? 'all',
    },
    data: {
      profiles,
      categories,
      paymentMethods,
      transactions,
      overrides,
    },
  };
}

export type ImportMode = 'replace' | 'merge';

export type ImportOptions = {
  readonly mode: ImportMode;
  readonly now: IsoInstant;
  /**
   * Supplied only when merging a file whose base currency differs from the
   * local one. Without it such a merge is REFUSED rather than silently summing
   * two different units into one headline figure.
   */
  readonly rateLookup?: RateLookup;
};

export type ImportResult =
  | {
      readonly ok: true;
      readonly mode: ImportMode;
      readonly applied: {
        profiles: number;
        categories: number;
        paymentMethods: number;
        transactions: number;
        overrides: number;
      };
      readonly conflicts: readonly { entity: string; id: string }[];
      readonly reconverted: number;
    }
  | { readonly ok: false; readonly reason: 'unknown_version'; readonly docVersion: number }
  | {
      readonly ok: false;
      readonly reason: 'invalid';
      readonly issues: readonly ValidationIssue[];
      readonly totalIssues: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'base_mismatch';
      readonly fileCurrency: Currency;
      readonly localCurrency: Currency;
    };

/**
 * Re-denominate incoming rows into the LOCAL base currency.
 *
 * Reuses the reconvert planner rather than writing a second conversion path:
 * the rules about recomputing from the original amount, preserving manual
 * rates and using each row's own date are identical here, and two
 * implementations of that would drift.
 */
function redenominate(
  doc: ExportEnvelope,
  localCurrency: Currency,
  lookup: RateLookup,
): { transactions: Transaction[]; overrides: Override[]; converted: number } | undefined {
  const transactions = doc.data.transactions as unknown as Transaction[];
  const overrides = doc.data.overrides as unknown as Override[];

  const plan = planReconversion(
    {
      oldBase: doc.defaultCurrency,
      newBase: localCurrency,
      transactions,
      overrides,
      profiles: doc.data.profiles as unknown as never,
    },
    lookup,
  );

  if (plan.unresolved.length > 0) return undefined;

  const txById = new Map(plan.transactions.map((t) => [t.id, t.money]));
  const ovById = new Map(plan.overrides.map((o) => [o.id, o.money]));

  return {
    transactions: transactions.map((t) => {
      const money = txById.get(t.id);
      return money ? { ...t, money } : t;
    }),
    overrides: overrides.map((o) => {
      const money = ovById.get(o.id);
      return money && o.action === 'modify' ? { ...o, patch: { ...o.patch, money } } : o;
    }),
    converted: plan.transactions.length + plan.overrides.length,
  };
}

export async function importDocument(
  db: GreenbackDB,
  input: unknown,
  options: ImportOptions,
): Promise<ImportResult> {
  const validated = validateEnvelope(input);
  if (!validated.ok) {
    return validated.reason === 'unknown_version'
      ? { ok: false, reason: 'unknown_version', docVersion: validated.docVersion }
      : { ok: false, reason: 'invalid', issues: validated.issues, totalIssues: validated.totalIssues };
  }

  const doc = validated.doc;
  const settings = await db.settings.get(SETTINGS_ID);
  const localCurrency = settings?.defaultCurrency ?? 'USD';

  let transactions = doc.data.transactions as unknown as Transaction[];
  let overrides = doc.data.overrides as unknown as Override[];
  let reconverted = 0;

  /**
   * The hole the spec left wide open.
   *
   * On REPLACE the file's settings come along, so its base currency governs
   * everything and there is nothing to reconcile. On MERGE the local base
   * governs, and incoming baseAmountMinor values are denominated in a
   * different unit - so `availableBalance` would add EUR-denominated and
   * USD-denominated integers together and render the result as one confident
   * number, with no error anywhere.
   */
  if (options.mode === 'merge' && doc.defaultCurrency !== localCurrency) {
    if (!options.rateLookup) {
      return {
        ok: false,
        reason: 'base_mismatch',
        fileCurrency: doc.defaultCurrency,
        localCurrency,
      };
    }

    const redone = redenominate(doc, localCurrency, options.rateLookup);
    if (!redone) {
      return {
        ok: false,
        reason: 'base_mismatch',
        fileCurrency: doc.defaultCurrency,
        localCurrency,
      };
    }

    transactions = redone.transactions;
    overrides = redone.overrides;
    reconverted = redone.converted;
  }

  const conflicts: { entity: string; id: string }[] = [];

  const applied = await db.transaction(
    'rw',
    [db.profiles, db.categories, db.paymentMethods, db.transactions, db.overrides, db.settings],
    async (): Promise<AppliedCounts> => {
      if (options.mode === 'replace') {
        await Promise.all([
          db.profiles.clear(),
          db.categories.clear(),
          db.paymentMethods.clear(),
          db.transactions.clear(),
          db.overrides.clear(),
        ]);

        await db.profiles.bulkAdd(doc.data.profiles as never);
        await db.categories.bulkAdd(doc.data.categories as never);
        await db.paymentMethods.bulkAdd(doc.data.paymentMethods as never);
        await db.transactions.bulkAdd(transactions);
        await db.overrides.bulkAdd(overrides);

        // Settings ride along on replace, which is the only reason a replace of
        // a differently-based file is coherent at all.
        const current = await db.settings.get(SETTINGS_ID);
        await db.settings.put({
          ...(current ?? { id: SETTINGS_ID }),
          ...doc.settings,
          id: SETTINGS_ID,
          updatedAt: options.now,
        } as never);

        return {
          profiles: doc.data.profiles.length,
          categories: doc.data.categories.length,
          paymentMethods: doc.data.paymentMethods.length,
          transactions: transactions.length,
          overrides: overrides.length,
        };
      }

      // Parent-first, so a child never lands before the row it references.
      const pairs: [keyof AppliedCounts, MergeableTable, readonly Timestamped[]][] = [
        ['profiles', db.profiles, doc.data.profiles],
        ['categories', db.categories, doc.data.categories],
        ['paymentMethods', db.paymentMethods, doc.data.paymentMethods],
        ['transactions', db.transactions, transactions],
        ['overrides', db.overrides, overrides],
      ];

      const counts: AppliedCounts = {
        profiles: 0,
        categories: 0,
        paymentMethods: 0,
        transactions: 0,
        overrides: 0,
      };

      for (const [name, table, incoming] of pairs) {
        const local = await table.toArray();
        const plan = planMerge(local, incoming);

        await table.bulkPut([...plan.inserts, ...plan.updates]);
        for (const c of plan.conflicts) conflicts.push({ entity: name, id: c.id });
        counts[name] = plan.inserts.length + plan.updates.length;
      }

      // Settings are NOT merged: adopting someone else's theme and active
      // profile as a side effect of importing their transactions is absurd.
      return counts;
    },
  );

  return { ok: true, mode: options.mode, applied, conflicts, reconverted };
}
