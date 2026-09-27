import { describe, expect, it } from 'vitest';

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
          avatar: 'fox',
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
