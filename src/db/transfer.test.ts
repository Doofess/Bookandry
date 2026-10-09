import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RateLookup } from '@/domain/reconvert';
import { d, MONEY } from '@/domain/test-factories';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { CashMove, Category, PaymentMethod, Profile } from '@/types/domain';
import type { IsoInstant, MoneySnapshot } from '@/types/money';

import { materialize } from './materialize';
import { ensureSettings, getSettings, writeSettings } from './repos/settings';
import { buildExport, importDocument } from './transfer';

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
const EARLIER = '2026-01-01T00:00:00.000Z' as IsoInstant;

let handle: TestDb;

beforeEach(async () => {
  handle = freshDb();
  await ensureSettings(handle.db, NOW);
});
afterEach(async () => {
  await handle.dispose();
});

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'p1',
  name: 'Dana',
  color: '#16794a',
  openingBalanceMinor: 100_000,
  openingBalanceCurrency: 'USD',
  openingBalanceDate: d('2026-01-01'),
  createdAt: EARLIER,
  updatedAt: EARLIER,
  ...over,
});

const category = (over: Partial<Category> = {}): Category =>
  ({
    id: 'cat.groceries',
    kind: 'expense',
    icon: 'ShoppingBasket',
    sortOrder: 0,
    isArchived: 0,
    source: 'builtin',
    nameKey: 'categories:builtin.groceries',
    createdAt: EARLIER,
    updatedAt: EARLIER,
    ...over,
  }) as Category;

const method = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: 'pm.cash',
  profileId: '*',
  type: 'cash',
  label: 'Cash',
  isArchived: 0,
  createdAt: EARLIER,
  updatedAt: EARLIER,
  ...over,
});

const money = (over: Partial<MoneySnapshot> = {}): MoneySnapshot => ({
  ...MONEY,
  currency: 'EUR',
  baseCurrency: 'USD',
  rateSource: 'frankfurter',
  ...over,
});

async function seed(txId = 'tx1', m: MoneySnapshot = money(), updatedAt: IsoInstant = EARLIER) {
  await handle.db.profiles.put(profile());
  await handle.db.categories.put(category());
  await handle.db.paymentMethods.put(method());
  await handle.db.transactions.put(
    materialize({
      id: txId,
      profileId: 'p1',
      kind: 'expense',
      categoryId: 'cat.groceries',
      paymentMethodId: 'pm.cash',
      money: m,
      date: d('2026-03-12'),
      recurrence: { type: 'one_time' },
      seriesRootId: txId,
      createdAt: EARLIER,
      updatedAt,
    }),
  );
}

const cashMove = (over: Partial<CashMove> = {}): CashMove => ({
  id: 'm1',
  profileId: 'p1',
  kind: 'start',
  amountMinor: 50_000,
  date: d('2026-10-01'),
  isDeleted: 0,
  createdAt: EARLIER,
  updatedAt: EARLIER,
  ...over,
});

describe('export', () => {
  it('produces a valid, self-describing envelope', async () => {
    await seed();
    const doc = await buildExport(handle.db, NOW);

    expect(doc.app).toBe('bookandry');
    expect(doc.schemaVersion).toBe(1);
    expect(doc.defaultCurrency).toBe('USD');
    expect(doc.counts.transactions).toBe(1);
    expect(doc.data.transactions).toHaveLength(1);
  });

  it('EXCLUDES the rates cache, which is regenerable', async () => {
    // A stale rate table baked into a shipped file is a liability, not a feature.
    await seed();
    await handle.db.ratesTables.put({
      key: 'frankfurter|USD|latest',
      schema: 1,
      source: 'frankfurter',
      base: 'USD',
      date: 'latest',
      rates: { ILS: 3.05 },
      rateDates: {},
      fetchedAt: NOW,
      expiresAt: '2030-01-01T00:00:00.000Z',
    });

    const doc = await buildExport(handle.db, NOW);
    expect(Object.keys(doc.data)).toEqual([
      'profiles',
      'categories',
      'paymentMethods',
      'transactions',
      'overrides',
      'cashMoves',
    ]);
  });

  it('round-trips through JSON without loss', async () => {
    await seed();
    const doc = await buildExport(handle.db, NOW);
    const reparsed: unknown = JSON.parse(JSON.stringify(doc));
    const result = await importDocument(handle.db, reparsed, { mode: 'replace', now: NOW });
    expect(result.ok).toBe(true);
  });
});

describe('import: replace', () => {
  it('restores the ledger exactly', async () => {
    await seed();
    const doc = await buildExport(handle.db, NOW);

    await handle.db.transactions.clear();
    await handle.db.profiles.clear();

    const result = await importDocument(handle.db, doc, { mode: 'replace', now: NOW });
    expect(result).toMatchObject({ ok: true, mode: 'replace' });
    expect(await handle.db.transactions.count()).toBe(1);
    expect((await handle.db.transactions.get('tx1'))?.money.amountMinor).toBe(4500);
  });

  it('restores a backup exported before the app was renamed', async () => {
    // Byte-for-byte what an old export looks like: identical but for the name.
    await seed();
    const doc = { ...(await buildExport(handle.db, NOW)), app: 'greenback' };

    await handle.db.transactions.clear();

    const result = await importDocument(handle.db, doc, { mode: 'replace', now: NOW });
    expect(result).toMatchObject({ ok: true, mode: 'replace' });
    expect(await handle.db.transactions.count()).toBe(1);
  });

  it('adopts the file settings, which is what makes a differently-based file coherent', async () => {
    // The rows must genuinely be denominated in the file's base currency; the
    // validator rejects a file whose header and rows disagree, which is exactly
    // what changing defaultCurrency WITHOUT reconverting would produce.
    await writeSettings(handle.db, { defaultCurrency: 'ILS', language: 'he' }, NOW);
    await seed('tx1', money({ baseCurrency: 'ILS', baseAmountMinor: 15_885 }));
    const doc = await buildExport(handle.db, NOW);
    expect(doc.defaultCurrency).toBe('ILS');

    await writeSettings(handle.db, { defaultCurrency: 'USD', language: 'en' }, NOW);
    const result = await importDocument(handle.db, doc, { mode: 'replace', now: NOW });

    expect(result.ok).toBe(true);
    expect((await getSettings(handle.db))?.defaultCurrency).toBe('ILS');
    expect((await getSettings(handle.db))?.language).toBe('he');
  });

  it('refuses an export whose rows disagree with its own header', async () => {
    // Guards the inconsistent state above: changing the base currency without
    // running the reconvert flow must not silently produce an importable file.
    await seed('tx1', money({ baseCurrency: 'USD' }));
    await writeSettings(handle.db, { defaultCurrency: 'ILS' }, NOW);
    const doc = await buildExport(handle.db, NOW);

    const result = await importDocument(handle.db, doc, { mode: 'replace', now: NOW });
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('discards local rows not present in the file', async () => {
    await seed();
    const doc = await buildExport(handle.db, NOW);
    await seed('tx-extra');
    expect(await handle.db.transactions.count()).toBe(2);

    await importDocument(handle.db, doc, { mode: 'replace', now: NOW });
    expect(await handle.db.transactions.count()).toBe(1);
  });
});

describe('import: merge', () => {
  it('adds new rows and leaves existing ones alone', async () => {
    await seed('tx1');
    const doc = await buildExport(handle.db, NOW);

    // A second row that only exists locally must survive the merge.
    await seed('tx-local');
    const result = await importDocument(handle.db, doc, { mode: 'merge', now: NOW });

    expect(result).toMatchObject({ ok: true, mode: 'merge' });
    expect(await handle.db.transactions.count()).toBe(2);
  });

  it('is idempotent: importing the same file twice changes nothing', async () => {
    await seed();
    const doc = await buildExport(handle.db, NOW);

    await importDocument(handle.db, doc, { mode: 'merge', now: NOW });
    const first = await handle.db.transactions.toArray();
    await importDocument(handle.db, doc, { mode: 'merge', now: NOW });
    const second = await handle.db.transactions.toArray();

    expect(second).toEqual(first);
    expect(second).toHaveLength(1);
  });

  it('takes the NEWER edit rather than skipping the duplicate id', async () => {
    // "Skip duplicate IDs" would have discarded this edit silently.
    await seed('tx1', money({ amountMinor: 4500 }), EARLIER);
    const doc = await buildExport(handle.db, NOW);

    const edited = {
      ...doc,
      data: {
        ...doc.data,
        transactions: [
          {
            ...doc.data.transactions[0]!,
            money: { ...doc.data.transactions[0]!.money, amountMinor: 9999 },
            updatedAt: '2026-12-01T00:00:00.000Z',
          },
        ],
      },
    };

    await importDocument(handle.db, edited, { mode: 'merge', now: NOW });
    expect((await handle.db.transactions.get('tx1'))?.money.amountMinor).toBe(9999);
  });

  it('does NOT adopt the file settings', async () => {
    // Inheriting someone else's theme and active profile as a side effect of
    // importing their transactions is absurd.
    await seed();
    await writeSettings(handle.db, { language: 'he', theme: 'dark' }, NOW);
    const doc = await buildExport(handle.db, NOW);

    await writeSettings(handle.db, { language: 'en', theme: 'light' }, NOW);
    await importDocument(handle.db, doc, { mode: 'merge', now: NOW });

    expect((await getSettings(handle.db))?.language).toBe('en');
    expect((await getSettings(handle.db))?.theme).toBe('light');
  });

  it('does not duplicate built-in categories, because their ids are deterministic', async () => {
    // With generated ids, every merge between two installs would add a second
    // full set of built-in categories with identical names.
    await seed();
    const before = await handle.db.categories.count();

    const doc = await buildExport(handle.db, NOW);
    await importDocument(handle.db, doc, { mode: 'merge', now: NOW });

    // Covers the whole seeded built-in set, not one fixture row.
    expect(before).toBeGreaterThan(1);
    expect(await handle.db.categories.count()).toBe(before);
  });
});

describe('base currency mismatch on merge', () => {
  /** Build a file denominated in ILS, from a separate database. */
  async function ilsFile() {
    const other = freshDb();
    await ensureSettings(other.db, NOW);
    await writeSettings(other.db, { defaultCurrency: 'ILS' }, NOW);

    await other.db.profiles.put(profile({ id: 'p2', color: '#0369a1', openingBalanceCurrency: 'ILS' }));
    await other.db.categories.put(category());
    await other.db.paymentMethods.put(method());
    await other.db.transactions.put(
      materialize({
        id: 'tx-ils',
        profileId: 'p2',
        kind: 'expense',
        categoryId: 'cat.groceries',
        money: {
          amountMinor: 4500,
          currency: 'EUR',
          baseCurrency: 'ILS',
          baseAmountMinor: 15_885,
          rateUsed: '3.53',
          rateDate: d('2026-03-12'),
          rateSource: 'frankfurter',
        },
        date: d('2026-03-12'),
        recurrence: { type: 'one_time' },
        seriesRootId: 'tx-ils',
        createdAt: EARLIER,
        updatedAt: EARLIER,
      }),
    );

    const doc = await buildExport(other.db, NOW);
    await other.dispose();
    return doc;
  }

  it('REFUSES a merge when the bases differ and no rates are supplied', async () => {
    // The hole the spec left open. Merging blindly would have
    // availableBalance() add ILS-denominated and USD-denominated integers into
    // one confident headline figure, with no error anywhere.
    await seed();
    const doc = await ilsFile();

    const result = await importDocument(handle.db, doc, { mode: 'merge', now: NOW });

    expect(result).toMatchObject({
      ok: false,
      reason: 'base_mismatch',
      fileCurrency: 'ILS',
      localCurrency: 'USD',
    });
    // And nothing was written.
    expect(await handle.db.transactions.count()).toBe(1);
  });

  it('re-denominates incoming rows when rates ARE supplied', async () => {
    await seed();
    const doc = await ilsFile();

    const lookup: RateLookup = (from, to, on) => {
      if (from === to) return { rate: '1', rateDate: on, source: 'frankfurter' };
      if (to !== 'USD') return undefined;
      const rates: Record<string, string> = { EUR: '1.157', ILS: '0.327965' };
      const rate = rates[from];
      return rate === undefined ? undefined : { rate, rateDate: on, source: 'frankfurter' };
    };

    const result = await importDocument(handle.db, doc, {
      mode: 'merge',
      now: NOW,
      rateLookup: lookup,
    });

    expect(result).toMatchObject({ ok: true });
    const imported = await handle.db.transactions.get('tx-ils');
    // Recomputed from the ORIGINAL 45.00 EUR, not from the ILS base amount.
    expect(imported?.money.amountMinor).toBe(4500);
    expect(imported?.money.currency).toBe('EUR');
    expect(imported?.money.baseCurrency).toBe('USD');
    expect(imported?.money.baseAmountMinor).toBe(5207);
  });

  it('refuses rather than half-converting when a rate is missing', async () => {
    await seed();
    const doc = await ilsFile();
    const partial: RateLookup = () => undefined;

    const result = await importDocument(handle.db, doc, {
      mode: 'merge',
      now: NOW,
      rateLookup: partial,
    });

    expect(result).toMatchObject({ ok: false, reason: 'base_mismatch' });
    expect(await handle.db.transactions.count()).toBe(1);
  });

  it('allows a REPLACE of a differently-based file without rates', async () => {
    // Replace brings the file's settings along, so its base governs the whole
    // database and there is nothing to reconcile.
    await seed();
    const doc = await ilsFile();

    const result = await importDocument(handle.db, doc, { mode: 'replace', now: NOW });
    expect(result).toMatchObject({ ok: true });
    expect((await getSettings(handle.db))?.defaultCurrency).toBe('ILS');
  });
});

describe('import rejection', () => {
  it('rejects a newer schema version and writes nothing', async () => {
    await seed();
    const doc = await buildExport(handle.db, NOW);
    const result = await importDocument(
      handle.db,
      { ...doc, schemaVersion: 999 },
      { mode: 'replace', now: NOW },
    );

    expect(result).toMatchObject({ ok: false, reason: 'unknown_version', docVersion: 999 });
    expect(await handle.db.transactions.count()).toBe(1);
  });

  it('rejects malformed input without touching the database', async () => {
    await seed();
    for (const bad of [null, 'nonsense', {}, { app: 'bookandry' }, { app: 'greenback' }]) {
      const result = await importDocument(handle.db, bad, { mode: 'replace', now: NOW });
      expect(result.ok).toBe(false);
    }
    expect(await handle.db.transactions.count()).toBe(1);
  });
});

describe('cash moves in a backup', () => {
  it('are exported, counted, and restored by a replace', async () => {
    await seed();
    await handle.db.cashMoves.put(cashMove());
    const doc = await buildExport(handle.db, NOW);
    expect(doc.counts.cashMoves).toBe(1);
    expect(doc.data.cashMoves).toEqual([cashMove()]);

    await handle.db.cashMoves.clear();
    const result = await importDocument(handle.db, JSON.parse(JSON.stringify(doc)), {
      mode: 'replace',
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, applied: { cashMoves: 1 } });
    expect(await handle.db.cashMoves.get('m1')).toEqual(cashMove());
  });

  it('merge by the newer edit, like every other row', async () => {
    await seed();
    await handle.db.cashMoves.put(cashMove());
    const doc = await buildExport(handle.db, NOW);
    await handle.db.cashMoves.put(cashMove({ amountMinor: 40_000, updatedAt: NOW }));

    await importDocument(handle.db, doc, { mode: 'merge', now: NOW });
    expect((await handle.db.cashMoves.get('m1'))?.amountMinor).toBe(40_000);
  });

  it('are left alone by a file from before the cash tab, which still imports', async () => {
    await seed();
    const doc = await buildExport(handle.db, NOW);
    const { cashMoves: _moves, ...data } = doc.data;
    const { cashMoves: _count, ...counts } = doc.counts;
    await handle.db.cashMoves.put(cashMove());

    const merged = await importDocument(handle.db, { ...doc, counts, data }, { mode: 'merge', now: NOW });
    expect(merged).toMatchObject({ ok: true, applied: { cashMoves: 0 } });
    expect(await handle.db.cashMoves.count()).toBe(1);
  });

  it('are converted into this device’s currency when a merge converts the rest', async () => {
    await seed();
    const doc = await buildExport(handle.db, NOW);
    // As if this file came from a household that keeps its money in shekels.
    const shekels = {
      ...doc,
      defaultCurrency: 'ILS',
      settings: { ...doc.settings, defaultCurrency: 'ILS' },
      counts: { ...doc.counts, transactions: 0, cashMoves: 1 },
      data: { ...doc.data, transactions: [], cashMoves: [cashMove({ id: 'm.ils', amountMinor: 100_000 })] },
    };
    // A rate for each day, so a move converted at any day but its own comes out wrong.
    const lookup: RateLookup = (from, to, on) =>
      from === 'ILS' && to === 'USD'
        ? { rate: on === '2026-10-01' ? '0.327965' : '0.25', rateDate: on, source: 'frankfurter' }
        : undefined;

    const result = await importDocument(handle.db, shekels, { mode: 'merge', now: NOW, rateLookup: lookup });
    expect(result).toMatchObject({ ok: true, reconverted: 1 });
    // ₪1,000.00 at its own day's 0.327965, rounded half away from zero, once.
    expect((await handle.db.cashMoves.get('m.ils'))?.amountMinor).toBe(32_797);

    const refused = await importDocument(handle.db, shekels, {
      mode: 'merge',
      now: NOW,
      rateLookup: () => undefined,
    });
    expect(refused).toMatchObject({ ok: false, reason: 'base_mismatch' });
  });
});
