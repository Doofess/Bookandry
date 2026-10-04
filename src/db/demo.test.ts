import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEMO_CATEGORY_IDS, DEMO_PREFIX } from '@/domain/demo';
import { expandOccurrences } from '@/domain/occurrences';
import { assertLocalDate } from '@/lib/dates';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { IsoInstant, LocalDate } from '@/types/money';

import { hasDemoData, loadDemoData, removeDemoData } from './demo';
import { materialize } from './materialize';
import { ensureSettings, getSettings, writeSettings } from './repos/settings';
import { findCandidates, findOverrides } from './repos/transactions';
import { buildSeedCategories, buildSeedPaymentMethods } from './seed';

const TODAY = assertLocalDate('2026-09-15');
const NOW = '2026-09-15T08:00:00.000Z' as IsoInstant;
const INPUT = { today: TODAY, baseCurrency: 'ILS', now: NOW } as const;

let handle: TestDb;

beforeEach(async () => {
  handle = freshDb();
  await ensureSettings(handle.db, NOW);
  await handle.db.categories.bulkPut(buildSeedCategories(NOW));
  await handle.db.paymentMethods.bulkPut(buildSeedPaymentMethods(NOW));
});
afterEach(async () => {
  await handle.dispose();
});

/** Every occurrence the app could show, from the opening date to the horizon. */
async function expandAll(from: LocalDate, to: LocalDate): Promise<ReturnType<typeof expandOccurrences>> {
  const candidates = await findCandidates(handle.db, { profileId: 'all', from, to });
  const overrides = await findOverrides(
    handle.db,
    candidates.map((c) => c.id),
  );
  return candidates.flatMap((tx) =>
    expandOccurrences(
      tx,
      overrides.filter((o) => o.transactionId === tx.id),
      from,
      to,
      { today: TODAY },
    ),
  );
}

describe('loadDemoData', () => {
  it('writes the whole dataset in one go', async () => {
    const counts = await loadDemoData(handle.db, INPUT);
    expect(counts.profiles).toBe(3);
    expect(counts.paymentMethods).toBe(5);
    expect(counts.transactions).toBeGreaterThan(60);
    expect(await handle.db.transactions.count()).toBe(counts.transactions);
    expect(await hasDemoData(handle.db)).toBe(true);
  });

  it('reports no demo data on a clean database', async () => {
    expect(await hasDemoData(handle.db)).toBe(false);
  });

  it('references only categories the populate step actually seeds', async () => {
    await loadDemoData(handle.db, INPUT);
    const seeded = new Set((await handle.db.categories.toArray()).map((c) => c.id));
    for (const id of DEMO_CATEGORY_IDS) expect(seeded.has(id)).toBe(true);

    for (const t of await handle.db.transactions.toArray()) {
      expect(seeded.has(t.categoryId)).toBe(true);
    }
  });

  it('references only payment methods that exist', async () => {
    await loadDemoData(handle.db, INPUT);
    const methods = new Set((await handle.db.paymentMethods.toArray()).map((m) => m.id));
    for (const t of await handle.db.transactions.toArray()) {
      if (t.paymentMethodId !== undefined) expect(methods.has(t.paymentMethodId)).toBe(true);
    }
  });

  it('is idempotent — reloading replaces rather than duplicates', async () => {
    const first = await loadDemoData(handle.db, INPUT);
    await loadDemoData(handle.db, INPUT);
    expect(await handle.db.transactions.count()).toBe(first.transactions);
    expect(await handle.db.overrides.count()).toBe(first.overrides);
  });
});

describe('the fixtures that only work if Phase 1 and Phase 2 agree', () => {
  beforeEach(async () => {
    await loadDemoData(handle.db, INPUT);
  });

  it('finds the loan payment that was moved past the series end', async () => {
    const loan = await handle.db.transactions.get(`${DEMO_PREFIX}tx.loan`);
    expect(loan).toBeDefined();
    const endDate = loan?.recurrence.type === 'monthly' ? loan.recurrence.endDate : undefined;
    expect(endDate).toBeDefined();

    // materialize() must have WIDENED seriesEnd past the recurrence's own end.
    expect(loan?.seriesEnd).not.toBe(endDate);

    // Query a window that starts AFTER the series ended. Without the widening
    // the interval index never returns this row; without the moved-in handling
    // in expandOccurrences it returns the row but emits nothing.
    const from = assertLocalDate('2026-08-01');
    const to = assertLocalDate('2026-08-31');
    const moved = (await expandAll(from, to)).filter((o) => o.seriesId === `${DEMO_PREFIX}tx.loan`);

    expect(moved).toHaveLength(1);
    expect(moved[0]?.isMoved).toBe(true);
    expect(moved[0]?.originalDate).toBe(endDate);
  });

  it('emits exactly twelve instalments that sum to the original total', async () => {
    const fridge = await handle.db.transactions.get(`${DEMO_PREFIX}tx.fridge`);
    expect(fridge).toBeDefined();

    const from = assertLocalDate('2026-01-01');
    const to = assertLocalDate('2028-12-31');
    const payments = (await expandAll(from, to))
      .filter((o) => o.seriesId === `${DEMO_PREFIX}tx.fridge`)
      .sort((a, b) => a.date.localeCompare(b.date));

    expect(payments).toHaveLength(12);

    const amounts = payments.map((p) => p.money.amountMinor);
    const total = amounts.reduce((a, b) => a + b, 0);
    // Interest-free: the payments must land on the total EXACTLY, and the first
    // one carries the remainder.
    expect(total).toBe(359_000);
    expect(amounts[0]).toBeGreaterThanOrEqual(amounts[1] ?? 0);
    expect(new Set(amounts.slice(1)).size).toBe(1);
  });

  it('clamps the last-day-of-month series through February', async () => {
    const from = assertLocalDate('2027-01-01');
    const to = assertLocalDate('2027-04-30');
    const dates = (await expandAll(from, to))
      .filter((o) => o.seriesId === `${DEMO_PREFIX}tx.buildingFee`)
      .map((o) => o.date)
      .sort();

    // Non-sticky: it RETURNS to the 31st after February.
    expect(dates).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('hides the skipped occurrence unless asked for it', async () => {
    const from = assertLocalDate('2026-08-01');
    const to = assertLocalDate('2026-08-31');
    const visible = (await expandAll(from, to)).filter((o) => o.seriesId === `${DEMO_PREFIX}tx.buildingFee`);
    expect(visible).toHaveLength(0);

    const tx = (await handle.db.transactions.get(`${DEMO_PREFIX}tx.buildingFee`))!;
    const overrides = await findOverrides(handle.db, [tx.id]);
    const withSkipped = expandOccurrences(tx, overrides, from, to, { today: TODAY, includeSkipped: true });
    expect(withSkipped).toHaveLength(1);
    expect(withSkipped[0]?.isSkipped).toBe(true);
  });
});

describe('removeDemoData', () => {
  it('leaves the database exactly as it found it', async () => {
    const before = {
      profiles: await handle.db.profiles.count(),
      methods: await handle.db.paymentMethods.count(),
      categories: await handle.db.categories.count(),
    };

    await loadDemoData(handle.db, INPUT);
    const removal = await removeDemoData(handle.db);

    expect(removal.keptProfiles).toEqual([]);
    expect(await handle.db.transactions.count()).toBe(0);
    expect(await handle.db.overrides.count()).toBe(0);
    expect(await handle.db.profiles.count()).toBe(before.profiles);
    expect(await handle.db.paymentMethods.count()).toBe(before.methods);
    // Built-in categories are NOT demo rows and must survive.
    expect(await handle.db.categories.count()).toBe(before.categories);
    expect(await hasDemoData(handle.db)).toBe(false);
  });

  it('keeps a demo profile the user has filed their own transactions under', async () => {
    await loadDemoData(handle.db, INPUT);
    const donor = (await handle.db.transactions.get(`${DEMO_PREFIX}tx.rent`))!;
    await handle.db.transactions.put(
      materialize({
        ...donor,
        id: 'mine-1',
        seriesRootId: 'mine-1',
        profileId: `${DEMO_PREFIX}profile.dana`,
      }),
    );

    const removal = await removeDemoData(handle.db);

    expect(removal.keptProfiles).toEqual([`${DEMO_PREFIX}profile.dana`]);
    expect(await handle.db.profiles.get(`${DEMO_PREFIX}profile.dana`)).toBeDefined();
    expect(await handle.db.profiles.get(`${DEMO_PREFIX}profile.yossi`)).toBeUndefined();
    expect(await handle.db.transactions.get('mine-1')).toBeDefined();
  });

  it('clears a demo payment method off the user’s own row rather than orphaning it', async () => {
    await loadDemoData(handle.db, INPUT);
    const donor = (await handle.db.transactions.get(`${DEMO_PREFIX}tx.rent`))!;
    await handle.db.transactions.put(
      materialize({
        ...donor,
        id: 'mine-2',
        seriesRootId: 'mine-2',
        paymentMethodId: `${DEMO_PREFIX}pm.jointCard`,
      }),
    );

    await removeDemoData(handle.db);

    const survivor = await handle.db.transactions.get('mine-2');
    expect(survivor).toBeDefined();
    expect(survivor?.paymentMethodId).toBeUndefined();
  });

  it('moves the active profile off a profile it is about to delete', async () => {
    await loadDemoData(handle.db, INPUT);
    await writeSettings(handle.db, { activeProfileId: `${DEMO_PREFIX}profile.yossi` }, NOW);

    await removeDemoData(handle.db);

    expect((await getSettings(handle.db))?.activeProfileId).toBe('all');
  });

  it('is safe to call when there is nothing to remove', async () => {
    const removal = await removeDemoData(handle.db);
    expect(removal.removed.transactions).toBe(0);
    expect(removal.keptProfiles).toEqual([]);
  });
});
