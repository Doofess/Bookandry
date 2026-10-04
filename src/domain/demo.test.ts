import { describe, expect, it } from 'vitest';

import { addMonthsClamped, assertLocalDate, compareLocal, startOfMonth } from '@/lib/dates';
import { convertMinor } from '@/lib/money';
import type { Currency, IsoInstant } from '@/types/money';

import { splitInstallments } from './calculators';
import {
  buildDemoData,
  DEMO_CATEGORY_IDS,
  DEMO_PREFIX,
  DEMO_RATES,
  DEMO_SEED,
  type DemoData,
  isDemoRow,
  isDemoSupported,
  mulberry32,
} from './demo';

const TODAY = assertLocalDate('2026-09-15');
const NOW = '2026-09-15T08:00:00.000Z' as IsoInstant;

const build = (base: Currency = 'ILS', seed = DEMO_SEED): DemoData =>
  buildDemoData({ today: TODAY, baseCurrency: base, now: NOW, seed });

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = Array.from({ length: 8 }, mulberry32(42));
    const b = Array.from({ length: 8 }, mulberry32(42));
    expect(a).toEqual(b);
  });

  it('produces different streams for different seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('stays inside [0, 1)', () => {
    const rng = mulberry32(DEMO_SEED);
    for (let i = 0; i < 500; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('buildDemoData — determinism', () => {
  it('is byte-stable for the same inputs', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it('changes with the seed', () => {
    expect(JSON.stringify(build('ILS', 1))).not.toBe(JSON.stringify(build('ILS', 2)));
  });

  it('never calls a clock, so the same today always gives the same dates', () => {
    const first = build().transactions.map((t) => t.date);
    const second = build().transactions.map((t) => t.date);
    expect(first).toEqual(second);
  });
});

describe('buildDemoData — tagging', () => {
  it('prefixes every row it creates', () => {
    const data = build();
    for (const row of [...data.profiles, ...data.paymentMethods, ...data.transactions, ...data.overrides]) {
      expect(isDemoRow(row.id)).toBe(true);
    }
  });

  it('references only seeded payment methods or its own', () => {
    for (const t of build().transactions) {
      if (t.paymentMethodId === undefined) continue;
      expect(t.paymentMethodId === 'pm.cash' || t.paymentMethodId.startsWith(DEMO_PREFIX)).toBe(true);
    }
  });

  it('references only built-in category ids', () => {
    const declared = new Set(DEMO_CATEGORY_IDS);
    for (const t of build().transactions) expect(declared.has(t.categoryId)).toBe(true);
  });
});

/**
 * The invariant the import validator enforces on every file: a snapshot whose
 * base amount does not follow from its own rate is silently wrong money.
 */
describe.each(['ILS', 'USD', 'EUR', 'JPY', 'KWD'] as const)('money invariants in %s', (base) => {
  const data = build(base);
  const snapshots = [
    ...data.transactions.map((t) => t.money),
    ...data.overrides.flatMap((o) => (o.action === 'modify' && o.patch.money ? [o.patch.money] : [])),
  ];

  it('stamps every row with the requested base', () => {
    expect(snapshots.length).toBeGreaterThan(50);
    for (const m of snapshots) expect(m.baseCurrency).toBe(base);
  });

  it('derives baseAmountMinor from the stored rate', () => {
    for (const m of snapshots) {
      expect(convertMinor(m.amountMinor, m.currency, m.baseCurrency, m.rateUsed)).toBe(m.baseAmountMinor);
    }
  });

  it('keeps every amount a positive safe integer', () => {
    for (const m of snapshots) {
      expect(Number.isSafeInteger(m.amountMinor)).toBe(true);
      expect(m.amountMinor).toBeGreaterThan(0);
      expect(m.baseAmountMinor).toBeGreaterThan(0);
    }
    for (const p of data.profiles) expect(Number.isSafeInteger(p.openingBalanceMinor)).toBe(true);
  });

  it('marks every rate as demo, never as a provider quote', () => {
    for (const m of snapshots) expect(m.rateSource).toBe('demo');
  });

  it('carries exactly one foreign-currency row', () => {
    const foreign = data.transactions.filter((t) => t.money.currency !== base);
    expect(foreign).toHaveLength(1);
    expect(foreign[0]?.money.rateUsed).not.toBe('1');
  });
});

describe('buildDemoData — unsupported currencies', () => {
  it('reports what it can produce', () => {
    expect(isDemoSupported('ILS')).toBe(true);
    expect(isDemoSupported('USD')).toBe(true);
    expect(isDemoSupported('XPF')).toBe(false);
  });

  it('throws rather than inventing a rate', () => {
    expect(() => build('XPF')).toThrow(RangeError);
  });

  it('quotes every listed currency as a positive decimal string', () => {
    for (const [code, rate] of Object.entries(DEMO_RATES)) {
      expect(code).toMatch(/^[A-Z]{3}$/);
      expect(Number(rate)).toBeGreaterThan(0);
    }
  });
});

describe('buildDemoData — shape', () => {
  const data = build();

  it('creates the household the onboarding wizard offers', () => {
    expect(data.profiles).toHaveLength(3);
    expect(new Set(data.profiles.map((p) => p.id)).size).toBe(3);
    expect(new Set(data.profiles.map((p) => p.color)).size).toBe(3);
    expect(new Set(data.profiles.map((p) => p.avatar)).size).toBe(3);
  });

  it('starts counting six months back, on a month boundary', () => {
    const expected = startOfMonth(addMonthsClamped(TODAY, -6));
    for (const p of data.profiles) {
      expect(p.openingBalanceDate).toBe(expected);
      expect(p.openingBalanceCurrency).toBe('ILS');
    }
  });

  it('shares the joint card, the joint account and the standing order across profiles', () => {
    const shared = data.paymentMethods.filter((m) => m.profileId === '*');
    expect(shared.map((m) => m.type).sort()).toEqual(['bank_account', 'credit_card', 'standing_order']);
  });

  it('pays two of the cards from the joint account, held by the couple', () => {
    const account = data.paymentMethods.find((m) => m.type === 'bank_account');
    expect(account?.account?.holders).toHaveLength(2);
    expect(data.paymentMethods.filter((m) => m.card?.accountId === account?.id)).toHaveLength(2);
  });

  it('includes a last-day-of-month standing order', () => {
    const lastDay = data.transactions.find(
      (t) => t.recurrence.type === 'monthly' && t.recurrence.dayOfMonth === 31,
    );
    expect(lastDay?.id).toBe(`${DEMO_PREFIX}tx.buildingFee`);
  });

  it('includes a yearly commitment', () => {
    expect(data.transactions.some((t) => t.recurrence.type === 'yearly')).toBe(true);
  });

  it('never emits an occurrence before the opening balance date', () => {
    const opening = startOfMonth(addMonthsClamped(TODAY, -6));
    for (const t of data.transactions) expect(compareLocal(t.date, opening)).toBeGreaterThanOrEqual(0);
  });

  it('keeps every one-off in the past', () => {
    const oneOffs = data.transactions.filter((t) => t.recurrence.type === 'one_time');
    expect(oneOffs.length).toBeGreaterThan(50);
    for (const t of oneOffs) expect(compareLocal(t.date, TODAY)).toBeLessThanOrEqual(0);
  });

  it('is sorted chronologically, so an export reads like a statement', () => {
    const dates = data.transactions.map((t) => t.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe('buildDemoData — fixtures for the two hardest code paths', () => {
  const data = build();

  it('plans a תשלומים series with exactly twelve payments', () => {
    const fridge = data.transactions.find((t) => t.id === `${DEMO_PREFIX}tx.fridge`);
    expect(fridge?.recurrence).toMatchObject({ type: 'monthly', installments: 12 });
  });

  it('puts the instalment remainder on the first payment only', () => {
    const fridge = data.transactions.find((t) => t.id === `${DEMO_PREFIX}tx.fridge`);
    const first = data.overrides.find((o) => o.id === `${DEMO_PREFIX}ov.fridge.first`);
    expect(first?.action).toBe('modify');
    expect(first?.occurrenceDate).toBe(fridge?.date);

    const regular = fridge?.money.amountMinor ?? 0;
    const opening = first?.action === 'modify' ? (first.patch.money?.amountMinor ?? 0) : 0;
    const total = opening + regular * 11;
    // The convention, restated as an assertion: dividing the total again has to
    // reproduce these exact payments, in this order.
    expect(splitInstallments(total, 12)).toEqual([opening, ...Array.from({ length: 11 }, () => regular)]);
    expect(opening).toBeGreaterThanOrEqual(regular);
  });

  it('moves a finished series’ last payment past its own end date', () => {
    const loan = data.transactions.find((t) => t.id === `${DEMO_PREFIX}tx.loan`);
    const moved = data.overrides.find((o) => o.id === `${DEMO_PREFIX}ov.loan.moved`);

    expect(loan?.recurrence.type).toBe('monthly');
    const endDate = loan?.recurrence.type === 'monthly' ? loan.recurrence.endDate : undefined;
    expect(endDate).toBeDefined();
    expect(moved?.occurrenceDate).toBe(endDate);

    const to = moved?.action === 'modify' ? moved.patch.date : undefined;
    expect(to).toBeDefined();
    // Past the end, so only a widened seriesEnd can find it again.
    expect(compareLocal(to!, endDate!)).toBe(1);
  });

  it('ghosts one occurrence so Restore has something to restore', () => {
    const skipped = data.overrides.filter((o) => o.action === 'skip');
    expect(skipped).toHaveLength(1);
  });
});

describe('buildDemoData — language', () => {
  it('writes Hebrew names into the rows, not i18n keys', () => {
    const he = buildDemoData({ today: TODAY, baseCurrency: 'ILS', now: NOW, language: 'he' });
    expect(he.profiles.map((p) => p.name)).toEqual(['דנה', 'יוסי', 'משק בית']);
    expect(he.paymentMethods.some((m) => m.label === 'הוראת קבע')).toBe(true);
  });

  it('keeps the numbers identical across languages', () => {
    const en = buildDemoData({ today: TODAY, baseCurrency: 'ILS', now: NOW, language: 'en' });
    const he = buildDemoData({ today: TODAY, baseCurrency: 'ILS', now: NOW, language: 'he' });
    expect(he.transactions.map((t) => t.money.amountMinor)).toEqual(
      en.transactions.map((t) => t.money.amountMinor),
    );
  });
});
