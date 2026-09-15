import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RateQuote } from '@/domain/reconvert';
import { d, MONEY } from '@/domain/test-factories';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { Profile } from '@/types/domain';
import type { Currency, IsoInstant, LocalDate, MoneySnapshot } from '@/types/money';

import { materialize } from './materialize';
import { applyReconvertPlan, prefetchRates, reconvertDefaultCurrency } from './reconvert';
import { ensureSettings, getSettings } from './repos/settings';

const ts = (s: string): IsoInstant => s as IsoInstant;
const NOW = ts('2026-09-15T10:00:00.000Z');

/** Rates INTO ILS, and back into USD, so a round trip can be exercised. */
const TABLE: Record<string, Record<string, string>> = {
  ILS: { USD: '3.0491', EUR: '3.53', JPY: '0.0207' },
  USD: { ILS: '0.327965', EUR: '1.157', JPY: '0.00679' },
  EUR: { USD: '0.864', ILS: '0.2833', JPY: '0.00587' },
};

function quoteFor(to: Currency) {
  return (currency: Currency, date: LocalDate): Promise<RateQuote | undefined> => {
    const rate = TABLE[to]?.[currency];
    return Promise.resolve(rate === undefined ? undefined : { rate, rateDate: date, source: 'frankfurter' });
  };
}

let handle: TestDb;

beforeEach(async () => {
  handle = freshDb();
  await ensureSettings(handle.db, NOW);
});

afterEach(async () => {
  await handle.dispose();
});

function money(over: Partial<MoneySnapshot> = {}): MoneySnapshot {
  return { ...MONEY, currency: 'EUR', baseCurrency: 'USD', rateSource: 'frankfurter', ...over };
}

async function seedTx(id: string, date: string, m: MoneySnapshot) {
  await handle.db.transactions.put(
    materialize({
      id,
      profileId: 'p1',
      kind: 'expense',
      categoryId: 'cat.groceries',
      money: m,
      date: d(date),
      recurrence: { type: 'one_time' },
      seriesRootId: id,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );
}

async function seedProfile(over: Partial<Profile> = {}) {
  await handle.db.profiles.put({
    id: 'p1',
    name: 'Dana',
    avatar: 'fox',
    color: '#16794a',
    openingBalanceMinor: 100_000,
    openingBalanceCurrency: 'USD',
    openingBalanceDate: d('2026-01-01'),
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  });
}

describe('reconvertDefaultCurrency', () => {
  it('rewrites every row and the settings singleton together', async () => {
    await seedTx('tx1', '2026-03-12', money({ amountMinor: 4500 }));
    await seedProfile();

    const result = await reconvertDefaultCurrency(handle.db, 'USD', 'ILS', {
      fetchQuote: quoteFor('ILS'),
      now: NOW,
    });

    expect(result).toMatchObject({ ok: true });
    const tx = await handle.db.transactions.get('tx1');
    expect(tx?.money.baseCurrency).toBe('ILS');
    expect(tx?.money.baseAmountMinor).toBe(15_885);
    // The original amount is untouched: it is the authoritative fact.
    expect(tx?.money.amountMinor).toBe(4500);
    expect(tx?.money.currency).toBe('EUR');

    const profile = await handle.db.profiles.get('p1');
    expect(profile?.openingBalanceCurrency).toBe('ILS');

    const settings = await getSettings(handle.db);
    expect(settings?.defaultCurrency).toBe('ILS');
  });

  it('is a no-op when the base is unchanged', async () => {
    await seedTx('tx1', '2026-03-12', money());
    const result = await reconvertDefaultCurrency(handle.db, 'USD', 'USD', {
      fetchQuote: () => Promise.reject(new Error('should not fetch')),
      now: NOW,
    });
    expect(result).toEqual({ ok: true, changed: { transactions: 0, overrides: 0, profiles: 0 } });
  });

  it('reports progress across the prefetch', async () => {
    await seedTx('tx1', '2026-03-12', money());
    await seedTx('tx2', '2026-04-01', money({ currency: 'JPY' }));

    const seen: { fetched: number; total: number }[] = [];
    await reconvertDefaultCurrency(handle.db, 'USD', 'ILS', {
      fetchQuote: quoteFor('ILS'),
      onProgress: (p) => seen.push(p),
      now: NOW,
    });

    // The seconds are in phase A, which is exactly where a progress bar belongs.
    expect(seen[0]).toEqual({ fetched: 0, total: 2 });
    expect(seen.at(-1)).toEqual({ fetched: 2, total: 2 });
  });
});

describe('abort before writing', () => {
  it('writes NOTHING when a rate cannot be fetched', async () => {
    // Half-converting a ledger leaves base amounts in two currencies with no
    // way to tell which is which. Better to change nothing at all.
    await seedTx('tx1', '2026-03-12', money({ currency: 'EUR' }));
    await seedTx('tx2', '2026-03-12', money({ currency: 'GBP' }));

    const result = await reconvertDefaultCurrency(handle.db, 'USD', 'ILS', {
      fetchQuote: quoteFor('ILS'),
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, reason: 'fetch_failed' });
    const rows = await handle.db.transactions.toArray();
    expect(rows.every((t) => t.money.baseCurrency === 'USD')).toBe(true);
    expect((await getSettings(handle.db))?.defaultCurrency).toBe('USD');
  });

  it('writes NOTHING when the fetcher throws', async () => {
    await seedTx('tx1', '2026-03-12', money());
    const result = await reconvertDefaultCurrency(handle.db, 'USD', 'ILS', {
      fetchQuote: () => Promise.reject(new Error('offline')),
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, reason: 'fetch_failed' });
    expect((await handle.db.transactions.get('tx1'))?.money.baseCurrency).toBe('USD');
    expect((await getSettings(handle.db))?.defaultCurrency).toBe('USD');
  });

  it('never leaves a manual row stranded without a bridge', async () => {
    // The deadlock to avoid: someone who typed a rate by hand for a currency
    // the provider does not cover must still be able to change base currency.
    await seedTx('tx1', '2026-03-12', money({ rateSource: 'manual', rateUsed: '1.08' }));

    const result = await reconvertDefaultCurrency(handle.db, 'USD', 'ILS', {
      fetchQuote: quoteFor('ILS'),
      now: NOW,
    });

    expect(result).toMatchObject({ ok: true });
    const tx = await handle.db.transactions.get('tx1');
    expect(tx?.money.rateSource).toBe('manual');
    expect(tx?.money.rateUsed).toBe('3.293028');
  });
});

describe('atomicity', () => {
  it('rolls back ENTIRELY when the write fails mid-flight', async () => {
    await seedTx('tx1', '2026-03-12', money({ amountMinor: 4500 }));
    await seedTx('tx2', '2026-04-01', money({ amountMinor: 9900 }));
    await seedProfile();

    const plan = {
      transactions: [
        { id: 'tx1', money: money({ baseCurrency: 'ILS', baseAmountMinor: 15_885 }) },
        { id: 'tx2', money: money({ baseCurrency: 'ILS', baseAmountMinor: 34_947 }) },
      ],
      overrides: [],
      profiles: [{ id: 'p1', openingBalanceMinor: 304_910 }],
      unresolved: [],
    };

    // Dexie returns its own PromiseExtended; a plain rejected Promise is enough
    // to abort the transaction, so the cast is about types, not behaviour.
    const spy = vi
      .spyOn(handle.db.profiles, 'update')
      .mockImplementation((() => Promise.reject(new Error('disk full'))) as never);

    await expect(applyReconvertPlan(handle.db, plan, 'ILS', NOW)).rejects.toThrow('disk full');
    spy.mockRestore();

    // Every transaction back in the old base, and settings untouched.
    const rows = await handle.db.transactions.toArray();
    expect(rows.every((t) => t.money.baseCurrency === 'USD')).toBe(true);
    expect((await handle.db.profiles.get('p1'))?.openingBalanceCurrency).toBe('USD');
    expect((await getSettings(handle.db))?.defaultCurrency).toBe('USD');
  });

  it('does not fetch inside the write transaction', async () => {
    // An IndexedDB transaction auto-commits on any non-Dexie await, so a fetch
    // inside it would silently END the transaction and drop atomicity without
    // raising anything at all. Phase A must finish before phase B begins.
    await seedTx('tx1', '2026-03-12', money());

    let inTransaction = false;
    const fetchSpy = vi.fn(() => {
      expect(inTransaction).toBe(false);
      return Promise.resolve({
        rate: '3.53',
        rateDate: d('2026-03-12'),
        source: 'frankfurter' as const,
      });
    });

    const realTransaction = handle.db.transaction.bind(handle.db);
    const txSpy = vi.spyOn(handle.db, 'transaction').mockImplementation(((...args: unknown[]) => {
      inTransaction = true;
      const run = realTransaction as unknown as (...a: unknown[]) => Promise<unknown>;
      return Promise.resolve(run(...args)).finally(() => {
        inTransaction = false;
      });
    }) as never);

    await reconvertDefaultCurrency(handle.db, 'USD', 'ILS', { fetchQuote: fetchSpy, now: NOW });
    expect(fetchSpy).toHaveBeenCalled();
    txSpy.mockRestore();
  });
});

describe('round-trip integrity', () => {
  it('USD to ILS to USD leaves the ORIGINAL amounts bit-identical', async () => {
    // The structural guarantee: every pass recomputes from (amountMinor,
    // currency), and a same-currency conversion short-circuits to the identity.
    // Round-tripping through baseAmountMinor would drift instead.
    const seeds: [string, string, Currency, number][] = [
      ['t1', '2026-03-12', 'EUR', 4500],
      ['t2', '2026-04-01', 'JPY', 10_000],
      ['t3', '2026-05-20', 'USD', 123_456],
    ];
    for (const [id, date, currency, amountMinor] of seeds) {
      await seedTx(id, date, money({ currency, amountMinor }));
    }
    await seedProfile();

    const before = await handle.db.transactions.orderBy('id').toArray();

    await reconvertDefaultCurrency(handle.db, 'USD', 'ILS', { fetchQuote: quoteFor('ILS'), now: NOW });
    await reconvertDefaultCurrency(handle.db, 'ILS', 'USD', { fetchQuote: quoteFor('USD'), now: NOW });

    const after = await handle.db.transactions.orderBy('id').toArray();
    for (const [i, row] of after.entries()) {
      expect(row.money.amountMinor).toBe(before[i]?.money.amountMinor);
      expect(row.money.currency).toBe(before[i]?.money.currency);
    }

    // A row already in the target currency comes back EXACTLY, because the
    // identity path never multiplies and so never rounds.
    expect(after.find((t) => t.id === 't3')?.money.baseAmountMinor).toBe(123_456);
    expect((await getSettings(handle.db))?.defaultCurrency).toBe('USD');
  });
});

describe('prefetchRates', () => {
  it('names every currency and date it could not resolve', async () => {
    const tx = materialize({
      id: 'tx1',
      profileId: 'p1',
      kind: 'expense',
      categoryId: 'cat.groceries',
      money: money({ currency: 'GBP' }),
      date: d('2026-03-12'),
      recurrence: { type: 'one_time' },
      seriesRootId: 'tx1',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { failed } = await prefetchRates(
      { oldBase: 'USD', newBase: 'ILS', transactions: [tx], overrides: [], profiles: [] },
      { fetchQuote: quoteFor('ILS'), now: NOW },
    );
    // Surfaced to the user rather than silently skipped.
    expect(failed).toEqual(['GBP on 2026-03-12']);
  });
});

describe('two tabs', () => {
  it('refuses a second reconvert while one is running', async () => {
    await seedTx('t1', '2026-03-12', money({ currency: 'EUR', amountMinor: 4500 }));
    await seedProfile();

    // Hold the first run inside its fetch - the seconds a real prefetch spends
    // on the network are exactly when a second tab would start its own.
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const slowQuote = async (currency: Currency, on: LocalDate) => {
      await held;
      return quoteFor('ILS')(currency, on);
    };

    const first = reconvertDefaultCurrency(handle.db, 'USD', 'ILS', {
      fetchQuote: slowQuote,
      now: NOW,
    });
    await Promise.resolve();

    const second = await reconvertDefaultCurrency(handle.db, 'USD', 'ILS', {
      fetchQuote: quoteFor('ILS'),
      now: NOW,
    });
    expect(second).toEqual({ ok: false, reason: 'busy' });

    release();
    expect(await first).toMatchObject({ ok: true });
    // Exactly one conversion happened, so the base was never split.
    expect((await handle.db.transactions.get('t1'))?.money.baseCurrency).toBe('ILS');
  });
});
