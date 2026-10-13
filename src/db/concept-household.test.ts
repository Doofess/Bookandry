import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { availableBalance, summariseRange, totalsByCategory } from '@/domain/calculators';
import { cardBills, splitBySettlement } from '@/domain/cards';
import { cashSummary } from '@/domain/cash';
import { expandOccurrences } from '@/domain/occurrences';
import { d } from '@/domain/test-factories';
import { envelopeSchema } from '@/domain/transfer-schema';
import { freshDb, type TestDb } from '@/test/db-harness';
import { ALL_PROFILES } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { loadCashInput } from './repos/cash-moves';
import { ensureSettings, writeSettings } from './repos/settings';
import { findCandidates, findOverrides } from './repos/transactions';
import { buildSeedCategories, buildSeedPaymentMethods } from './seed';
import { buildExport, importDocument } from './transfer';
import {
  CARDS,
  CONCEPT_BALANCE_MINOR,
  conceptHousehold,
  type Envelope,
} from '../../e2e/fidelity/concept-household';

const NOW = '2026-10-09T06:00:00.000Z' as IsoInstant;
const TODAY = d('2026-10-09');

let handle: TestDb;

beforeEach(async () => {
  handle = freshDb();
  await ensureSettings(handle.db, NOW);
  await writeSettings(handle.db, { defaultCurrency: 'ILS' }, NOW);
  await handle.db.categories.bulkPut(buildSeedCategories(NOW));
  await handle.db.paymentMethods.bulkPut(buildSeedPaymentMethods(NOW));
});
afterEach(async () => {
  await handle.dispose();
});

async function restore(): Promise<Envelope> {
  const base = (await buildExport(handle.db, NOW)) as unknown as Envelope;
  const household = conceptHousehold(base);
  const result = await importDocument(handle.db, household, { mode: 'replace', now: NOW });
  expect(result).toMatchObject({ ok: true });
  return household;
}

async function occurrences(from: string, to: string) {
  const transactions = await findCandidates(handle.db, { profileId: ALL_PROFILES, from: d(from), to: d(to) });
  const overrides = await findOverrides(
    handle.db,
    transactions.map((t) => t.id),
  );
  return transactions.flatMap((tx) =>
    expandOccurrences(
      tx,
      overrides.filter((o) => o.transactionId === tx.id),
      d(from),
      d(to),
      { today: TODAY },
    ),
  );
}

describe("the concept's household", () => {
  it('is a valid backup the app restores', async () => {
    const base = (await buildExport(handle.db, NOW)) as unknown as Envelope;
    expect(envelopeSchema.safeParse(conceptHousehold(base)).success).toBe(true);
    await restore();
  });

  it('refuses a base in another currency, rather than restoring the wrong money', async () => {
    const base = (await buildExport(handle.db, NOW)) as unknown as Envelope;
    expect(() => conceptHousehold({ ...base, defaultCurrency: 'USD' })).toThrow(/ILS/);
  });

  it('has the balance the concept shows: ₪58,555', async () => {
    await restore();
    const profiles = await handle.db.profiles.toArray();
    const methods = new Map((await handle.db.paymentMethods.toArray()).map((m) => [m.id, m]));
    // As useBalance does: from a month before the earliest opening, to today, settled by billing day.
    // The household's cards carry no monthly fee, so cardFeeOccurrences adds nothing here.
    const expanded = await occurrences('2026-08-01', '2026-10-09');
    const cutoffs = new Map(profiles.map((p) => [p.id, p.openingBalanceDate]));
    const { settled } = splitBySettlement(expanded, methods, TODAY, cutoffs);
    expect(availableBalance({ profiles, occurrences: settled, baseCurrency: 'ILS' })).toBe(
      CONCEPT_BALANCE_MINOR,
    );
  });

  it('has October so far as the concept: ₪23,900 in, ₪14,362 out, 128 rows, nothing projected', async () => {
    await restore();
    const october = await occurrences('2026-10-01', '2026-10-31');
    expect(october).toHaveLength(128);
    expect(october.every((o) => !o.isProjected)).toBe(true);
    expect(summariseRange(october)).toMatchObject({ incomeMinor: 2_390_000, expenseMinor: 1_436_200 });
  });

  it("has the concept's ten categories this month", async () => {
    await restore();
    const totals = totalsByCategory(await occurrences('2026-10-01', '2026-10-09'), 'expense');
    expect(totals.map((t) => [t.categoryId, t.totalMinor])).toEqual([
      ['cat.rent', 560_000],
      ['cat.groceries', 284_000],
      ['cat.dining', 121_500],
      ['cat.kids', 112_000],
      ['cat.transport', 96_000],
      ['cat.utilities', 84_000],
      ['cat.shopping', 72_800],
      ['cat.health', 46_000],
      ['cat.subscriptions', 38_900],
      ['cat.entertainment', 21_000],
    ]);
  });

  it("bills the concept's cards in October: ₪8,942 on the 2nd, 10th and 15th", async () => {
    await restore();
    const methods = await handle.db.paymentMethods.toArray();
    const all = await occurrences('2026-09-01', '2026-10-31');
    const october = (id: string) => {
      const card = methods.find((m) => m.id === id);
      if (card === undefined) throw new Error(id);
      return cardBills(all, card).find((bill) => bill.chargeDate.startsWith('2026-10'));
    };
    expect(october(CARDS.isracard)).toMatchObject({ chargeDate: '2026-10-02', totalMinor: 321_400 });
    expect(october(CARDS.diners)).toMatchObject({ chargeDate: '2026-10-02', totalMinor: 102_300 });
    expect(october(CARDS.max)).toMatchObject({ chargeDate: '2026-10-10', totalMinor: 214_000 });
    expect(october(CARDS.amex)).toMatchObject({ chargeDate: '2026-10-10', totalMinor: 68_900 });
    expect(october(CARDS.cal)).toMatchObject({ chargeDate: '2026-10-15', totalMinor: 187_600 });
  });

  it('has ₪1,830 in cash, counted on 6 October', async () => {
    await restore();
    const summary = cashSummary(await loadCashInput(handle.db, { profileId: ALL_PROFILES, today: TODAY }));
    expect(summary.onHandMinor).toBe(183_000);
    expect(summary.countedOn).toBe('2026-10-06');
  });
});
