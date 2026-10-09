import { describe, expect, it } from 'vitest';

import { DEAL_KINDS, EXTRA_RATE_KINDS, type DealKind, type ExtraRateKind } from '@/types/domain';

import type { ExportEnvelope } from './transfer-schema';
import { validateEnvelope } from './transfer-validate';

/**
 * Fixture built as a plain literal, then cast.
 *
 * The schema's date fields resolve to the BRANDED LocalDate, because
 * isLocalDate is a type predicate and Zod narrows .refine() output through it -
 * so a raw "2026-03-12" is correctly not assignable. That is the brand doing
 * its job; the fixture just declares that it is feeding the validator raw JSON.
 */
function envelope(over: Partial<ExportEnvelope> = {}): unknown {
  const base = {
    app: 'bookandry',
    schemaVersion: 1,
    appVersion: '0.1.0',
    exportedAt: '2026-09-15T10:00:00.000Z',
    defaultCurrency: 'USD',
    counts: { profiles: 1, categories: 1, paymentMethods: 1, transactions: 1, overrides: 0 },
    settings: { defaultCurrency: 'USD', language: 'en', theme: 'system', activeProfileId: 'all' },
    data: {
      profiles: [
        {
          id: 'p1',
          name: 'Dana',
          color: '#16794a',
          openingBalanceMinor: 100000,
          openingBalanceCurrency: 'USD',
          openingBalanceDate: '2026-01-01',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      categories: [
        {
          id: 'cat.groceries',
          kind: 'expense',
          icon: 'ShoppingBasket',
          sortOrder: 0,
          isArchived: 0,
          source: 'builtin',
          nameKey: 'categories:builtin.groceries',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      paymentMethods: [
        {
          id: 'pm.cash',
          profileId: '*',
          type: 'cash',
          label: 'Cash',
          isArchived: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      transactions: [
        {
          id: 'tx1',
          profileId: 'p1',
          kind: 'expense',
          categoryId: 'cat.groceries',
          paymentMethodId: 'pm.cash',
          money: {
            amountMinor: 4500,
            currency: 'EUR',
            baseCurrency: 'USD',
            baseAmountMinor: 4910,
            rateUsed: '1.091',
            rateDate: '2026-03-12',
            rateSource: 'frankfurter',
          },
          recurrence: { type: 'one_time' },
          date: '2026-03-12',
          seriesStart: '2026-03-12',
          seriesEnd: '2026-03-12',
          isDeleted: 0,
          seriesRootId: 'tx1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      overrides: [],
    },
  } as unknown as ExportEnvelope;
  return { ...base, ...over };
}

describe('validateEnvelope', () => {
  it('accepts a well-formed document', () => {
    const result = validateEnvelope(envelope());
    expect(result.ok).toBe(true);
  });

  it('still accepts a backup made before the app was renamed', () => {
    // Every file exported as Greenback says so. The rename must not turn them
    // into files the app refuses to restore.
    expect(validateEnvelope(envelope({ app: 'greenback' })).ok).toBe(true);
  });

  it('rejects a document from any other app', () => {
    expect(validateEnvelope(envelope({ app: 'something-else' } as never)).ok).toBe(false);
  });

  it('rejects a NEWER schema version with its own reason', () => {
    // Deserves a clear message, not a wall of shape errors that makes a
    // perfectly good file from a future build look corrupt.
    const result = validateEnvelope(envelope({ schemaVersion: 999 }));
    expect(result).toMatchObject({ ok: false, reason: 'unknown_version', docVersion: 999 });
  });

  it('rejects a foreign document', () => {
    const result = validateEnvelope({ app: 'something-else', schemaVersion: 1 });
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('rejects malformed JSON shapes without throwing', () => {
    for (const bad of [null, 42, 'text', [], {}]) {
      expect(validateEnvelope(bad).ok).toBe(false);
    }
  });
});

describe('referential integrity', () => {
  function withTx(patch: Record<string, unknown>): unknown {
    const doc = envelope() as ExportEnvelope;
    return {
      ...doc,
      data: { ...doc.data, transactions: [{ ...doc.data.transactions[0]!, ...patch }] },
    };
  }

  it('rejects a transaction pointing at a missing profile', () => {
    // IndexedDB has no foreign keys, so if this is not caught here it is not
    // caught at all - and the feed renders rows with no owner.
    const result = validateEnvelope(withTx({ profileId: 'ghost' }));
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
    if (!result.ok && result.reason === 'invalid') {
      expect(result.issues[0]?.message).toContain('No profile ghost');
    }
  });

  it('rejects a transaction pointing at a missing category', () => {
    const result = validateEnvelope(withTx({ categoryId: 'cat.nope' }));
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('rejects an expense filed under an INCOME category', () => {
    // It would flip sign in every total that groups by category.
    const result = validateEnvelope(withTx({ kind: 'income', paymentMethodId: undefined }));
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
    if (!result.ok && result.reason === 'invalid') {
      expect(result.issues.some((i) => i.message.includes('is expense'))).toBe(true);
    }
  });

  it('rejects a missing payment method', () => {
    expect(validateEnvelope(withTx({ paymentMethodId: 'pm.ghost' })).ok).toBe(false);
  });

  it('rejects a row whose base currency disagrees with the file header', () => {
    // Every baseAmountMinor in the file must be in one unit, or the totals
    // computed from them are meaningless.
    const result = validateEnvelope(
      withTx({
        money: {
          amountMinor: 4500,
          currency: 'EUR',
          baseCurrency: 'ILS',
          baseAmountMinor: 15885,
          rateUsed: '3.53',
          rateDate: '2026-03-12',
          rateSource: 'frankfurter',
        },
      }),
    );
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('rejects two profiles sharing a colour', () => {
    const doc = envelope() as ExportEnvelope;
    const p1 = doc.data.profiles[0]!;
    const result = validateEnvelope({
      ...doc,
      counts: { ...doc.counts, profiles: 2 },
      data: { ...doc.data, profiles: [p1, { ...p1, id: 'p2', name: 'Yossi' }] },
    });
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('rejects counts that disagree with the payload, catching a truncated file', () => {
    const doc = envelope() as ExportEnvelope;
    const result = validateEnvelope({ ...doc, counts: { ...doc.counts, transactions: 99 } });
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
    if (!result.ok && result.reason === 'invalid') {
      expect(result.issues.some((i) => i.path === 'counts.transactions')).toBe(true);
    }
  });

  it('accepts a קרדיט plan with its rate, and refuses a rate that is not one', () => {
    const plan = (creditAnnualRate: string) =>
      withTx({
        recurrence: { type: 'monthly', dayOfMonth: 12, installments: 6, plan: 'credit', creditAnnualRate },
        seriesEnd: '2026-08-12',
      });

    expect(validateEnvelope(plan('12.5')).ok).toBe(true);
    // A file is just another caller: "1e1" would be priced as ten percent and
    // shown to nobody as anything readable.
    for (const bad of ['1e1', '1.2.3', '-3', '101', ' 12']) {
      expect(validateEnvelope(plan(bad)).ok, bad).toBe(false);
    }
  });

  it('accepts a loan as long as a mortgage', () => {
    const loan = (installments: number, seriesEnd: string) =>
      withTx({
        recurrence: { type: 'monthly', dayOfMonth: 12, installments, plan: 'loan', creditAnnualRate: '5' },
        seriesEnd,
      });
    expect(validateEnvelope(loan(360, '2056-02-12')).ok).toBe(true);
    expect(validateEnvelope(loan(361, '2056-03-12')).ok).toBe(false);
  });

  it('accepts a loan at prime plus a margin, and refuses a margin that is not one', () => {
    const loan = (primeMargin: string) =>
      withTx({
        recurrence: {
          type: 'monthly',
          dayOfMonth: 12,
          installments: 6,
          plan: 'loan',
          creditAnnualRate: '6.25',
          rateBasis: 'prime',
          primeMargin,
        },
        seriesEnd: '2026-08-12',
      });
    expect(validateEnvelope(loan('1.5')).ok).toBe(true);
    expect(validateEnvelope(loan('-0.5')).ok).toBe(true);
    for (const bad of ['', '+1', '1e1', 'x']) {
      expect(validateEnvelope(loan(bad)).ok, bad).toBe(false);
    }
  });

  it('keeps a long credit’s prime reset and a 30+ purchase’s rate, and reads rows from before them', () => {
    const plan = (reset: unknown) =>
      validateEnvelope(
        withTx({
          recurrence: {
            type: 'monthly',
            dayOfMonth: 12,
            installments: 24,
            plan: 'credit',
            creditAnnualRate: '15.5',
            ...(reset === undefined ? {} : { reset }),
          },
          seriesEnd: '2028-02-12',
        }),
      );
    const kept = plan({ atPayment: 19, primeAtPurchase: '4.75' });
    expect(kept.ok && kept.doc.data.transactions[0]?.recurrence).toMatchObject({
      reset: { atPayment: 19, primeAtPurchase: '4.75' },
    });
    const frozen = plan({
      atPayment: 19,
      primeAtPurchase: '4.75',
      rate: '16',
      paymentMinor: 13_000,
      frozen: true,
    });
    expect(frozen.ok).toBe(true);
    // What the plan borrowed, kept for its reset; a reset from before it was kept still reads.
    const priced = plan({ atPayment: 19, primeAtPurchase: '4.75', principalMinor: 300_000 });
    expect(priced.ok && priced.doc.data.transactions[0]?.recurrence).toMatchObject({
      reset: { principalMinor: 300_000 },
    });
    expect(kept.ok && kept.doc.data.transactions[0]?.recurrence).not.toHaveProperty('reset.principalMinor');
    for (const bad of [
      { atPayment: 19, primeAtPurchase: '4.75', principalMinor: 0 },
      { atPayment: 19, primeAtPurchase: '4.75', principalMinor: 1.5 },
      { atPayment: 0, primeAtPurchase: '4.75' },
      { atPayment: 19, primeAtPurchase: 'x' },
      {},
    ]) {
      expect(plan(bad).ok, JSON.stringify(bad)).toBe(false);
    }
    // Written before this release: no reset, read exactly as before.
    const old = plan(undefined);
    expect(old.ok && old.doc.data.transactions[0]?.recurrence).toEqual({
      type: 'monthly',
      dayOfMonth: 12,
      installments: 24,
      plan: 'credit',
      creditAnnualRate: '15.5',
    });

    const deferred = validateEnvelope(withTx({ deferral: { rate: '15.5' } }));
    expect(deferred.ok && deferred.doc.data.transactions[0]?.deferral).toEqual({ rate: '15.5' });
    expect(validateEnvelope(withTx({ deferral: { rate: '1e1' } })).ok).toBe(false);
    const before = validateEnvelope(withTx({}));
    expect(before.ok && before.doc.data.transactions[0]).not.toHaveProperty('deferral');
  });

  it('accepts what a card company shows about a card, and refuses what does not read', () => {
    const doc = envelope() as ExportEnvelope;
    const [first] = doc.data.paymentMethods;
    const withCard = (card: unknown) =>
      validateEnvelope({ ...doc, data: { ...doc.data, paymentMethods: [{ ...first, card }] } });
    expect(
      withCard({
        issuer: 'max',
        network: 'mastercard',
        kind: 'non_bank',
        bank: 'Leumi',
        tier: 'Platinum',
        club: 'FLY CARD',
        expiresMonth: '2029-04',
        billingDay: 10,
        creditLimitMinor: 1_500_000,
        monthlyFeeMinor: 1_490,
        fxFeeRate: '2.5',
        creditPrimeMargin: '3.5',
        lateRate: { basis: 'prime', margin: '8' },
      }).ok,
    ).toBe(true);
    for (const bad of [
      { billingDay: 32 },
      { expiresMonth: '09/28' },
      { issuer: 'leumicard' },
      { fxFeeRate: '1e1' },
      { creditPrimeMargin: '+1' },
      { lateRate: { basis: 'fixed', rate: '-1' } },
      { creditLimitMinor: -1 },
    ]) {
      expect(withCard(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('keeps a card’s catalog link and the rates the person changed, and refuses ones that do not read', () => {
    const doc = envelope() as ExportEnvelope;
    const [first] = doc.data.paymentMethods;
    const withCard = (card: unknown) =>
      validateEnvelope({ ...doc, data: { ...doc.data, paymentMethods: [{ ...first, card }] } });
    const card = {
      billingDay: 10,
      catalog: {
        issuer: 'max',
        bank: '20',
        tier: 'international',
        club: 'skymax',
        version: 1,
        updatedOn: '2026-10-08',
        filled: { fxFeeRate: '3', creditPrimeMargin: '10.75', lateRate: { basis: 'prime', margin: '13.80' } },
      },
      overrides: {
        credit: { basis: 'prime', margin: '9' },
        long_credit: { basis: 'fixed', rate: '14.5' },
        late: { basis: 'boi', margin: '16.40' },
      },
    };
    const result = withCard(card);
    expect(result.ok).toBe(true);
    expect(result.ok && result.doc.data.paymentMethods[0]?.card).toEqual(card);
    for (const bad of [
      { catalog: { issuer: 'max', bank: '20', tier: 'international', version: 0 } },
      { catalog: { issuer: 'max', bank: '20', tier: 'international', version: 1.5 } },
      { catalog: { issuer: 'max', bank: '20', version: 1 } },
      { catalog: { issuer: 'max', bank: '20', tier: 'gold', version: 1, updatedOn: '2026-02-30' } },
      { overrides: { late: { basis: 'boi', margin: '+1' } } },
      { overrides: { credit: { basis: 'fixed', rate: '-1' } } },
      { catalog: { issuer: 'max', bank: '20', tier: 'gold', version: 1, filled: { fxFeeRate: '1e1' } } },
    ]) {
      expect(withCard(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('accepts an override for exactly the deal and extra-rate kinds, the same list the types use', () => {
    const doc = envelope() as ExportEnvelope;
    const [first] = doc.data.paymentMethods;
    const withOverride = (kind: string) =>
      validateEnvelope({
        ...doc,
        data: {
          ...doc.data,
          paymentMethods: [{ ...first, card: { overrides: { [kind]: { basis: 'prime', margin: '1' } } } }],
        },
      }).ok;
    // A record keyed by the union: the compiler fails this if a kind is added to one and not the other.
    const every: Record<DealKind | ExtraRateKind, true> = {
      regular: true,
      installments: true,
      credit: true,
      long_credit: true,
      deferred: true,
      split_purchase: true,
      late: true,
      over_limit: true,
      cash: true,
    };
    expect(Object.keys(every).sort()).toEqual([...DEAL_KINDS, ...EXTRA_RATE_KINDS].sort());
    for (const kind of Object.keys(every)) expect(withOverride(kind), kind).toBe(true);
    // A kind a later release adds is kept as it came, so this one never refuses the card.
    expect(withOverride('surcharge')).toBe(true);
  });

  it('rejects an impossible calendar date', () => {
    // A regex alone would wave 2026-02-30 through, and it would only surface
    // much later inside occurrence expansion.
    expect(validateEnvelope(withTx({ date: '2026-02-30' })).ok).toBe(false);
  });

  it('rejects a non-integer amount rather than coercing it', () => {
    const result = validateEnvelope(
      withTx({
        money: {
          amountMinor: 45.5,
          currency: 'EUR',
          baseCurrency: 'USD',
          baseAmountMinor: 4910,
          rateUsed: '1.091',
          rateDate: '2026-03-12',
          rateSource: 'frankfurter',
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('caps the reported issues but states the true total', () => {
    // A 5,000-row file with one systematic problem must not print 5,000 errors.
    const doc = envelope() as ExportEnvelope;
    const many = Array.from({ length: 50 }, (_, i) => ({
      ...doc.data.transactions[0]!,
      id: `tx${String(i)}`,
      profileId: 'ghost',
    }));
    const result = validateEnvelope({
      ...doc,
      counts: { ...doc.counts, transactions: 50 },
      data: { ...doc.data, transactions: many },
    });

    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
    if (!result.ok && result.reason === 'invalid') {
      expect(result.issues).toHaveLength(20);
      expect(result.totalIssues).toBe(50);
    }
  });
});

describe('where income went, and what a recount wrote', () => {
  const salary = {
    id: 'cat.salary',
    kind: 'income',
    icon: 'Wallet',
    sortOrder: 0,
    isArchived: 0,
    source: 'builtin',
    nameKey: 'categories:builtin.salary',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  function withRow(row: Record<string, unknown>, overrides: unknown[] = []): unknown {
    const doc = envelope() as ExportEnvelope;
    return {
      ...doc,
      counts: { ...doc.counts, categories: 2, overrides: overrides.length },
      data: {
        ...doc.data,
        categories: [...doc.data.categories, salary],
        transactions: [{ ...doc.data.transactions[0]!, ...row }],
        overrides,
      },
    };
  }

  const income = { kind: 'income', categoryId: 'cat.salary', paymentMethodId: undefined };

  it('accepts income that went to cash, or to an account the file does not have', () => {
    // A destination that names nothing is shown as "not assigned": never an error.
    for (const destinationId of ['pm.cash', 'pm.gone']) {
      expect(validateEnvelope(withRow({ ...income, destinationId })).ok, destinationId).toBe(true);
    }
  });

  it('refuses a destination on an expense', () => {
    const result = validateEnvelope(withRow({ destinationId: 'pm.cash' }));
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
    if (!result.ok && result.reason === 'invalid') {
      expect(result.issues.map((i) => i.path)).toContain('transactions.tx1.destinationId');
    }
  });

  it('refuses a destination an override gives one payment of an expense', () => {
    const override = {
      id: 'o1',
      transactionId: 'tx1',
      occurrenceDate: '2026-03-12',
      action: 'modify',
      patch: { destinationId: 'pm.cash' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const result = validateEnvelope(withRow({}, [override]));
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
    if (!result.ok && result.reason === 'invalid') {
      expect(result.issues.map((i) => i.path)).toContain('overrides.o1.patch.destinationId');
    }
    // The same override on income is fine.
    expect(validateEnvelope(withRow(income, [override])).ok).toBe(true);
  });

  it('keeps a recount’s tag', () => {
    const result = validateEnvelope(withRow({ cashCount: true }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.data.transactions[0]?.cashCount).toBe(true);
  });

  it('reads a file from before either existed exactly as before', () => {
    const result = validateEnvelope(envelope());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.data.transactions[0]).not.toHaveProperty('destinationId');
      expect(result.doc.data.transactions[0]).not.toHaveProperty('cashCount');
    }
  });
});
