import { describe, expect, it } from 'vitest';

import { convertMinor } from '@/lib/money';
import type { CashMove, Override, Profile } from '@/types/domain';
import type { IsoInstant, MoneySnapshot } from '@/types/money';

import { collectRateRequests, planReconversion, type RateLookup, type ReconvertInput } from './reconvert';
import { d, makeTx } from './test-factories';

const ts = (s: string): IsoInstant => s as IsoInstant;

function money(over: Partial<MoneySnapshot> = {}): MoneySnapshot {
  return {
    amountMinor: 4500,
    currency: 'EUR',
    baseCurrency: 'USD',
    baseAmountMinor: 4910,
    rateUsed: '1.091',
    rateDate: d('2026-03-12'),
    rateSource: 'frankfurter',
    ...over,
  };
}

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Dana',
    color: '#16794a',
    openingBalanceMinor: 100_000,
    openingBalanceCurrency: 'USD',
    openingBalanceDate: d('2026-01-01'),
    createdAt: ts('2026-01-01T00:00:00.000Z'),
    updatedAt: ts('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

/** A lookup with fixed rates into ILS. */
const RATES: Record<string, string> = { EUR: '3.53', USD: '3.0491', JPY: '0.0207', KWD: '9.95' };

const toILS: RateLookup = (from, to, on) => {
  if (from === to) return { rate: '1', rateDate: on, source: 'frankfurter' };
  if (to !== 'ILS') return undefined;
  const rate = RATES[from];
  return rate === undefined ? undefined : { rate, rateDate: on, source: 'frankfurter' };
};

const emptyLookup: RateLookup = () => undefined;

function input(over: Partial<ReconvertInput> = {}): ReconvertInput {
  return {
    oldBase: 'USD',
    newBase: 'ILS',
    transactions: [],
    overrides: [],
    profiles: [],
    cashMoves: [],
    ...over,
  };
}

function move(over: Partial<CashMove> = {}): CashMove {
  return {
    id: 'm1',
    profileId: 'p1',
    kind: 'withdraw',
    amountMinor: 20000,
    date: d('2026-03-12'),
    isDeleted: 0,
    createdAt: ts('2026-01-01T00:00:00.000Z'),
    updatedAt: ts('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

/** USD into EUR at a rate that differs by date, so a test can tell which date was used. */
const USD_EUR: Record<string, string> = { '2026-03-12': '0.9215', '2026-04-01': '0.9102' };

const toEUR: RateLookup = (from, to, on) => {
  if (from === to) return { rate: '1', rateDate: on, source: 'frankfurter' };
  if (from !== 'USD' || to !== 'EUR') return undefined;
  const rate = USD_EUR[on];
  return rate === undefined ? undefined : { rate, rateDate: on, source: 'frankfurter' };
};

describe('collectRateRequests', () => {
  it('deduplicates by currency AND date', () => {
    const a = makeTx({ id: 'a', date: d('2026-03-12'), recurrence: { type: 'one_time' }, money: money() });
    const b = makeTx({ id: 'b', date: d('2026-03-12'), recurrence: { type: 'one_time' }, money: money() });
    const c = makeTx({ id: 'c', date: d('2026-04-01'), recurrence: { type: 'one_time' }, money: money() });

    const reqs = collectRateRequests(input({ transactions: [a, b, c] }));
    expect(reqs).toEqual([
      { currency: 'EUR', date: '2026-03-12' },
      { currency: 'EUR', date: '2026-04-01' },
    ]);
  });

  it('skips rows already in the new base', () => {
    const tx = makeTx({
      date: d('2026-03-12'),
      recurrence: { type: 'one_time' },
      money: money({ currency: 'ILS' }),
    });
    expect(collectRateRequests(input({ transactions: [tx] }))).toEqual([]);
  });

  it('requests a BRIDGE rate for a manual row', () => {
    // A user-supplied EUR rate was quoted against the OLD base, so carrying it
    // across needs old-base to new-base as well.
    const tx = makeTx({
      date: d('2026-03-12'),
      recurrence: { type: 'one_time' },
      money: money({ rateSource: 'manual', rateUsed: '3.95' }),
    });
    const reqs = collectRateRequests(input({ transactions: [tx] }));
    expect(reqs).toContainEqual({ currency: 'EUR', date: '2026-03-12' });
    expect(reqs).toContainEqual({ currency: 'USD', date: '2026-03-12' });
  });

  it('includes profile opening balances and override money', () => {
    const ov: Override = {
      id: 'ov1',
      transactionId: 'tx1',
      occurrenceDate: d('2026-05-01'),
      action: 'modify',
      patch: { money: money({ currency: 'JPY' }) },
      createdAt: ts('2026-01-01T00:00:00.000Z'),
      updatedAt: ts('2026-01-01T00:00:00.000Z'),
    };
    const reqs = collectRateRequests(
      input({ overrides: [ov], profiles: [profile({ openingBalanceCurrency: 'KWD' })] }),
    );
    expect(reqs).toContainEqual({ currency: 'JPY', date: '2026-05-01' });
    expect(reqs).toContainEqual({ currency: 'KWD', date: '2026-01-01' });
  });

  it('ignores soft-deleted transactions', () => {
    const tx = makeTx({
      date: d('2026-03-12'),
      recurrence: { type: 'one_time' },
      money: money(),
      isDeleted: 1,
    });
    expect(collectRateRequests(input({ transactions: [tx] }))).toEqual([]);
  });

  it('uses the MOVED date for a relocated override', () => {
    const ov: Override = {
      id: 'ov1',
      transactionId: 'tx1',
      occurrenceDate: d('2026-05-01'),
      action: 'modify',
      patch: { money: money(), date: d('2026-06-10') },
      createdAt: ts('2026-01-01T00:00:00.000Z'),
      updatedAt: ts('2026-01-01T00:00:00.000Z'),
    };
    expect(collectRateRequests(input({ overrides: [ov] }))).toEqual([
      { currency: 'EUR', date: '2026-06-10' },
    ]);
  });
});

describe('planReconversion', () => {
  it('recomputes from the ORIGINAL amount, never from the stored base amount', () => {
    // If it used baseAmountMinor, a deliberately corrupted one would leak into
    // the result. It must not.
    const tx = makeTx({
      date: d('2026-03-12'),
      recurrence: { type: 'one_time' },
      money: money({ baseAmountMinor: 999_999 }),
    });
    const plan = planReconversion(input({ transactions: [tx] }), toILS);
    // 45.00 EUR at 3.53 = 158.85 ILS
    expect(plan.transactions[0]?.money.baseAmountMinor).toBe(15_885);
  });

  it('is the exact identity when a row is already in the new base', () => {
    const tx = makeTx({
      date: d('2026-03-12'),
      recurrence: { type: 'one_time' },
      money: money({ currency: 'ILS', amountMinor: 12_345 }),
    });
    const plan = planReconversion(input({ transactions: [tx] }), toILS);
    expect(plan.transactions[0]?.money.baseAmountMinor).toBe(12_345);
    expect(plan.transactions[0]?.money.rateUsed).toBe('1');
  });

  it('stamps each row with ITS OWN date, which is what makes this idempotent', () => {
    const a = makeTx({ id: 'a', date: d('2026-03-12'), recurrence: { type: 'one_time' }, money: money() });
    const b = makeTx({ id: 'b', date: d('2026-07-01'), recurrence: { type: 'one_time' }, money: money() });
    const plan = planReconversion(input({ transactions: [a, b] }), toILS);
    expect(plan.transactions[0]?.money.rateDate).toBe('2026-03-12');
    expect(plan.transactions[1]?.money.rateDate).toBe('2026-07-01');
  });

  it('charges a card’s foreign-currency fee again, on the newly converted amount', () => {
    // 45.00 EUR at 3.53 = 158.85 ILS, plus 2.5% = 162.82.
    const tx = makeTx({
      date: d('2026-03-12'),
      recurrence: { type: 'one_time' },
      money: money({ feeRate: '2.5', baseAmountMinor: 5033 }),
    });
    const plan = planReconversion(input({ transactions: [tx] }), toILS);
    expect(plan.transactions[0]?.money).toMatchObject({ baseAmountMinor: 16_282, feeRate: '2.5' });
  });

  it('never charges the fee twice on a manual rate in an unchanged base', () => {
    // 45.00 EUR at 1.08 = 48.60 USD, plus 2.5% = 49.82 - the same as stored.
    const tx = makeTx({
      date: d('2026-03-12'),
      recurrence: { type: 'one_time' },
      money: money({ rateSource: 'manual', rateUsed: '1.08', baseAmountMinor: 4982, feeRate: '2.5' }),
    });
    const plan = planReconversion(input({ newBase: 'USD', transactions: [tx] }), toILS);
    expect(plan.transactions[0]?.money.baseAmountMinor).toBe(4982);
  });

  it('produces identical output when run twice', () => {
    // Because every input is a fact that cannot change, re-running is a no-op.
    const tx = makeTx({ date: d('2026-03-12'), recurrence: { type: 'one_time' }, money: money() });
    const first = planReconversion(input({ transactions: [tx] }), toILS);
    const second = planReconversion(input({ transactions: [tx] }), toILS);
    expect(first).toEqual(second);
  });

  it('PRESERVES a user-supplied rate by composing it with the bridge', () => {
    // The user said 1 EUR = 3.95 ILS... but the base was USD at the time, so
    // their figure is EUR->USD. Switching the base to ILS composes their leg
    // with USD->ILS rather than discarding what they entered.
    const tx = makeTx({
      date: d('2026-03-12'),
      recurrence: { type: 'one_time' },
      money: money({ rateSource: 'manual', rateUsed: '1.08', baseAmountMinor: 4860 }),
    });
    const plan = planReconversion(input({ transactions: [tx] }), toILS);
    const result = plan.transactions[0]!.money;

    // 1.08 * 3.0491 = 3.293028
    expect(result.rateUsed).toBe('3.293028');
    expect(result.rateSource).toBe('manual');
    // 45.00 EUR at 3.293028 = 148.19 ILS, from ONE rounding.
    expect(result.baseAmountMinor).toBe(14_819);
  });

  it('reports a manual row as unresolved when the bridge is unavailable', () => {
    // Rather than silently substituting a provider rate the user did not pick.
    const tx = makeTx({
      date: d('2026-03-12'),
      recurrence: { type: 'one_time' },
      money: money({ rateSource: 'manual', rateUsed: '1.08' }),
    });
    const noBridge: RateLookup = (from, to, on) =>
      from === 'EUR' && to === 'ILS' ? { rate: '3.53', rateDate: on, source: 'frankfurter' } : undefined;

    const plan = planReconversion(input({ transactions: [tx] }), noBridge);
    expect(plan.transactions).toEqual([]);
    expect(plan.unresolved[0]).toMatchObject({ kind: 'transaction', reason: 'no_bridge_rate' });
  });

  it('rewrites OVERRIDE money too', () => {
    // Missing these leaves those occurrences in the OLD base, giving a feed
    // whose totals silently mix two currencies.
    const ov: Override = {
      id: 'ov1',
      transactionId: 'tx1',
      occurrenceDate: d('2026-05-01'),
      action: 'modify',
      patch: { money: money({ amountMinor: 10_000 }) },
      createdAt: ts('2026-01-01T00:00:00.000Z'),
      updatedAt: ts('2026-01-01T00:00:00.000Z'),
    };
    const plan = planReconversion(input({ overrides: [ov] }), toILS);
    expect(plan.overrides[0]?.money.baseCurrency).toBe('ILS');
    expect(plan.overrides[0]?.money.baseAmountMinor).toBe(35_300);
  });

  it('ignores skip overrides, which carry no money', () => {
    const ov: Override = {
      id: 'ov1',
      transactionId: 'tx1',
      occurrenceDate: d('2026-05-01'),
      action: 'skip',
      createdAt: ts('2026-01-01T00:00:00.000Z'),
      updatedAt: ts('2026-01-01T00:00:00.000Z'),
    };
    expect(planReconversion(input({ overrides: [ov] }), toILS).overrides).toEqual([]);
  });

  it('converts profile opening balances at their own opening date', () => {
    // The spec had no currency on the opening balance at all, which forced a
    // lossy base-to-base round trip on every switch.
    const plan = planReconversion(input({ profiles: [profile()] }), toILS);
    expect(plan.profiles[0]?.openingBalanceMinor).toBe(304_910);
  });

  it('leaves an opening balance already in the new base untouched', () => {
    const plan = planReconversion(
      input({ profiles: [profile({ openingBalanceCurrency: 'ILS', openingBalanceMinor: 55_555 })] }),
      toILS,
    );
    expect(plan.profiles[0]?.openingBalanceMinor).toBe(55_555);
  });

  it('leaves soft-deleted rows alone so a restore returns what was deleted', () => {
    const tx = makeTx({
      date: d('2026-03-12'),
      recurrence: { type: 'one_time' },
      money: money(),
      isDeleted: 1,
    });
    expect(planReconversion(input({ transactions: [tx] }), toILS).transactions).toEqual([]);
  });

  it('collects every unresolved row rather than failing on the first', () => {
    const a = makeTx({ id: 'a', date: d('2026-03-12'), recurrence: { type: 'one_time' }, money: money() });
    const b = makeTx({ id: 'b', date: d('2026-04-01'), recurrence: { type: 'one_time' }, money: money() });
    const plan = planReconversion(
      input({ transactions: [a, b], profiles: [profile({ openingBalanceCurrency: 'GBP' })] }),
      emptyLookup,
    );
    expect(plan.unresolved).toHaveLength(3);
    expect(plan.unresolved.map((u) => u.kind)).toEqual(['transaction', 'transaction', 'profile']);
  });
});

describe('cash moves', () => {
  // A move stores no currency: its amount is in the household's base, which is
  // exactly what is changing. So it converts from the OLD base at its own date.

  it('requests the old base at the date of every move with money in it', () => {
    const reqs = collectRateRequests(
      input({
        newBase: 'EUR',
        cashMoves: [
          move({ id: 'a', date: d('2026-03-12') }),
          move({ id: 'b', date: d('2026-04-01'), kind: 'deposit' }),
          move({ id: 'c', date: d('2026-05-01'), kind: 'count', amountMinor: 0 }),
          move({ id: 'e', date: d('2026-05-02'), kind: 'start', amountMinor: 0 }),
        ],
      }),
    );
    expect(reqs).toEqual([
      { currency: 'USD', date: '2026-03-12' },
      { currency: 'USD', date: '2026-04-01' },
    ]);
  });

  it('converts a move at the rate for its own date', () => {
    const plan = planReconversion(
      input({ newBase: 'EUR', cashMoves: [move({ date: d('2026-04-01') })] }),
      toEUR,
    );
    expect(plan.cashMoves).toEqual([{ id: 'm1', amountMinor: convertMinor(20000, 'USD', 'EUR', '0.9102') }]);
    expect(plan.unresolved).toEqual([]);
  });

  it('leaves zero-amount and deleted moves alone, needing no rate', () => {
    const zero = move({ id: 'zero', kind: 'count', amountMinor: 0, date: d('2026-06-01') });
    const deleted = move({ id: 'gone', isDeleted: 1, date: d('2026-06-02') });
    const both = input({ newBase: 'EUR', cashMoves: [zero, deleted] });

    expect(collectRateRequests(both)).toEqual([]);
    const plan = planReconversion(both, emptyLookup);
    expect(plan.cashMoves).toEqual([]);
    expect(plan.unresolved).toEqual([]);
  });

  it('reports a move with no rate as unresolved', () => {
    const plan = planReconversion(
      input({ newBase: 'EUR', cashMoves: [move({ date: d('2026-07-07') })] }),
      toEUR,
    );
    expect(plan.cashMoves).toEqual([]);
    expect(plan.unresolved).toEqual([
      { kind: 'cashMove', id: 'm1', currency: 'USD', date: '2026-07-07', reason: 'no_rate' },
    ]);
  });

  it('converts a move of a kind this build does not know', () => {
    // The money is real even if the kind comes from a newer build.
    const odd = move({ id: 'odd', kind: 'lent_to_neighbour' });
    expect(collectRateRequests(input({ newBase: 'EUR', cashMoves: [odd] }))).toEqual([
      { currency: 'USD', date: '2026-03-12' },
    ]);
    const plan = planReconversion(input({ newBase: 'EUR', cashMoves: [odd] }), toEUR);
    expect(plan.cashMoves).toEqual([{ id: 'odd', amountMinor: convertMinor(20000, 'USD', 'EUR', '0.9215') }]);
  });
});
