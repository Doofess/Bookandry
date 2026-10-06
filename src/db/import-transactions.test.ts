import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readRow } from '@/domain/import-check';
import { d, wireRow } from '@/domain/test-factories';
import { txFormSchema, type TxFormValues } from '@/domain/tx-form';
import { counterIdFactory } from '@/lib/id';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { IsoInstant, LocalDate } from '@/types/money';

import { forgetImportReads } from './import-cache';
import { redoImport, saveImported, undoImport } from './import-transactions';

const NOW = '2026-10-04T10:00:00.000Z' as IsoInstant;

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
});
afterEach(async () => {
  await handle.dispose();
});

function parsed(over: Partial<TxFormValues> = {}) {
  return txFormSchema.parse({
    profileId: 'p1',
    kind: 'expense',
    categoryId: 'cat.groceries',
    paymentMethodId: '',
    amount: '45',
    currency: 'ILS',
    date: d('2026-10-03'),
    note: 'שופרסל',
    mode: 'one_time',
    dayOfMonth: '3',
    endDate: '',
    installmentCount: '',
    frequency: '',
    annualRate: '',
    ...over,
  });
}

describe('saving what was found', () => {
  it('saves every row through the form’s own path, in one go', async () => {
    const ids = await saveImported(
      handle.db,
      [
        { parsed: parsed() },
        { parsed: parsed({ amount: '1200', mode: 'installments', installmentCount: '6' }) },
        {
          parsed: parsed({ amount: '45.99', currency: 'USD' }),
          rate: { rate: '3.7464666232', rateDate: d('2026-10-03'), rateSource: 'manual' },
        },
      ],
      { baseCurrency: 'ILS', now: NOW, newId: counterIdFactory('tx') },
    );
    expect(ids).toHaveLength(3);
    const saved = await handle.db.transactions.bulkGet(ids);
    expect(saved.map((t) => t?.money.baseAmountMinor)).toEqual([4_500, 20_000, 17_230]);
    // The plan's odd agorot are on its first payment, as the form would have it.
    expect(await handle.db.overrides.count()).toBe(0);
  });

  it('saves nothing when one row cannot be saved', async () => {
    await expect(
      saveImported(handle.db, [{ parsed: parsed() }, { parsed: parsed({ currency: 'USD' }) }], {
        baseCurrency: 'ILS',
        now: NOW,
        newId: counterIdFactory('tx'),
      }),
    ).rejects.toThrow();
    expect(await handle.db.transactions.count()).toBe(0);
  });

  it('undoes the whole import in one step, and brings it back', async () => {
    const ids = await saveImported(handle.db, [{ parsed: parsed() }, { parsed: parsed({ amount: '10' }) }], {
      baseCurrency: 'ILS',
      now: NOW,
      newId: counterIdFactory('tx'),
    });
    await undoImport(handle.db, ids, NOW);
    expect((await handle.db.transactions.bulkGet(ids)).map((t) => t?.isDeleted)).toEqual([1, 1]);
    await redoImport(handle.db, ids, NOW);
    expect((await handle.db.transactions.bulkGet(ids)).map((t) => t?.isDeleted)).toEqual([0, 0]);
  });
});

describe('files already read', () => {
  const row = readRow(wireRow(), 'r0', {
    file: 3,
    base: 'ILS',
    known: new Set(['ILS']),
    anchor: '2026-10-04' as LocalDate,
    today: '2026-10-04' as LocalDate,
  });

  it('kept by older versions are cleared, and nothing else with them', async () => {
    await handle.db.meta.put({ key: 'importCache:abc', value: { v: 3, at: 0, rows: [row] } });
    await handle.db.meta.put({ key: 'importDraft:card:3214', value: {} });
    await forgetImportReads(handle.db);
    expect(await handle.db.meta.get('importCache:abc')).toBeUndefined();
    // Cards and accounts still to finish stay until they are finished or deleted.
    expect(await handle.db.meta.get('importDraft:card:3214')).toBeDefined();
  });
});
