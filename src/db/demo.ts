import { buildDemoData, DEMO_PREFIX, type DemoInput, isDemoRow } from '@/domain/demo';
import { ALL_PROFILES } from '@/types/domain';

import type { GreenbackDB } from './db';
import { materialize } from './materialize';
import { SETTINGS_ID } from './repos/settings';

/**
 * Loading and removing the demo dataset.
 *
 * The spec dropped two profiles and sixty untagged rows straight into the same
 * database as real data, leaving "Clear all data" as the only way back. Every
 * demo row here carries the `demo.` id prefix, so removal is an exact,
 * reversible operation rather than a nuclear one.
 */

export type DemoCounts = {
  readonly profiles: number;
  readonly paymentMethods: number;
  readonly transactions: number;
  readonly overrides: number;
};

export async function hasDemoData(db: GreenbackDB): Promise<boolean> {
  const count = await db.transactions.where('id').startsWith(DEMO_PREFIX).count();
  if (count > 0) return true;
  return (await db.profiles.where('id').startsWith(DEMO_PREFIX).count()) > 0;
}

/**
 * Write the dataset in one transaction.
 *
 * `materialize` runs per row WITH that row's overrides, because seriesEnd has to
 * be widened for the moved loan payment. Materialising against an empty override
 * list would leave that occurrence outside every interval query - the exact
 * failure the fixture exists to catch.
 */
export async function loadDemoData(db: GreenbackDB, input: DemoInput): Promise<DemoCounts> {
  let counts: DemoCounts = { profiles: 0, paymentMethods: 0, transactions: 0, overrides: 0 };

  await db.transaction('rw', [db.profiles, db.paymentMethods, db.transactions, db.overrides], async () => {
    /*
     * Built INSIDE the transaction, because it depends on what is already here.
     *
     * The demo arrives on the last step of the wizard, after the user has named
     * themselves - and both were reaching for the first colour in the palette.
     * Reading the taken ones outside this transaction would leave a window in
     * which a second tab adds a profile and the collision comes back.
     *
     * `buildDemoData` and `materialize` are synchronous, so calling them here
     * cannot auto-commit the transaction the way awaiting a non-IDB promise
     * would.
     */
    const existing = await db.profiles.toArray();
    const data = buildDemoData({ ...input, takenColors: existing.map((p) => p.color) });
    const rows = data.transactions.map((t) => materialize(t, data.overrides));

    await db.profiles.bulkPut([...data.profiles]);
    await db.paymentMethods.bulkPut([...data.paymentMethods]);
    await db.transactions.bulkPut(rows);
    await db.overrides.bulkPut([...data.overrides]);

    counts = {
      profiles: data.profiles.length,
      paymentMethods: data.paymentMethods.length,
      transactions: rows.length,
      overrides: data.overrides.length,
    };
  });

  return counts;
}

export type DemoRemoval = {
  readonly removed: DemoCounts;
  /**
   * Demo profiles kept because the user put their OWN transactions in them.
   *
   * Deleting the profile would orphan real rows against a foreign key
   * IndexedDB does not enforce, so they survive and the UI names them.
   */
  readonly keptProfiles: readonly string[];
};

/**
 * Remove every demo row, without taking any of the user's data with it.
 *
 * Three hazards, all real once someone has used the demo for a week:
 *  - their own transaction filed under a demo profile (keep the profile);
 *  - their own transaction charged to a demo payment method (clear the link);
 *  - `activeProfileId` pointing at a profile that is about to vanish.
 */
export async function removeDemoData(db: GreenbackDB): Promise<DemoRemoval> {
  return db.transaction(
    'rw',
    [db.profiles, db.paymentMethods, db.transactions, db.overrides, db.settings],
    async () => {
      const demoTxIds = new Set(
        (await db.transactions.where('id').startsWith(DEMO_PREFIX).primaryKeys()).map(String),
      );

      const overrideIds = (await db.overrides.where('id').startsWith(DEMO_PREFIX).primaryKeys()).map(String);
      await db.overrides.bulkDelete(overrideIds);
      await db.transactions.bulkDelete([...demoTxIds]);

      // Anything still referencing a demo row belongs to the user.
      const survivors = await db.transactions.toArray();

      const demoProfiles = await db.profiles.where('id').startsWith(DEMO_PREFIX).primaryKeys();
      const claimed = new Set(survivors.map((t) => t.profileId).filter(isDemoRow));
      const removableProfiles = demoProfiles.map(String).filter((id) => !claimed.has(id));
      await db.profiles.bulkDelete(removableProfiles);

      const demoMethods = (await db.paymentMethods.where('id').startsWith(DEMO_PREFIX).primaryKeys()).map(
        String,
      );
      await db.paymentMethods.bulkDelete(demoMethods);

      const orphaned = survivors.filter(
        (t) => t.paymentMethodId !== undefined && isDemoRow(t.paymentMethodId),
      );
      if (orphaned.length > 0) {
        await db.transactions.bulkPut(orphaned.map((t) => ({ ...t, paymentMethodId: undefined })));
      }

      const settings = await db.settings.get(SETTINGS_ID);
      if (settings && removableProfiles.includes(settings.activeProfileId)) {
        await db.settings.put({ ...settings, activeProfileId: ALL_PROFILES });
      }

      return {
        removed: {
          profiles: removableProfiles.length,
          paymentMethods: demoMethods.length,
          transactions: demoTxIds.size,
          overrides: overrideIds.length,
        },
        keptProfiles: [...claimed].sort(),
      };
    },
  );
}
