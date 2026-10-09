import { describe, expect, it } from 'vitest';

import type { Override, Recurrence, Transaction } from '@/types/domain';

import { estimateOccurrenceCount, expandOccurrences, isValidSlot, seriesEndDate } from './occurrences';
import { d, makeTx, modify, MONEY, skip } from './test-factories';

const TODAY = d('2026-09-15');
const opts = { today: TODAY };

/** Convenience: expand and return just the effective dates. */
function dates(...args: Parameters<typeof expandOccurrences>): string[] {
  return expandOccurrences(...args).map((o) => o.date);
}

describe('monthly clamping (non-sticky)', () => {
  it('case 1: day 31 clamps per month and RETURNS to 31', () => {
    const tx = makeTx({ date: d('2026-01-31'), recurrence: { type: 'monthly', dayOfMonth: 31 } });
    expect(dates(tx, [], d('2026-01-01'), d('2026-06-30'), opts)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ]);
  });

  it('clamps to 29 February in a leap year', () => {
    const tx = makeTx({ date: d('2024-01-31'), recurrence: { type: 'monthly', dayOfMonth: 31 } });
    expect(dates(tx, [], d('2024-02-01'), d('2024-02-29'), opts)).toEqual(['2024-02-29']);
  });

  it('case 2: endDate is INCLUSIVE', () => {
    const tx = makeTx({
      date: d('2026-01-31'),
      recurrence: { type: 'monthly', dayOfMonth: 31, endDate: d('2026-02-28') },
    });
    expect(dates(tx, [], d('2026-01-01'), d('2026-12-31'), opts)).toEqual(['2026-01-31', '2026-02-28']);
  });

  it('case 3: a slot one day after endDate is excluded', () => {
    const tx = makeTx({
      date: d('2026-01-31'),
      recurrence: { type: 'monthly', dayOfMonth: 31, endDate: d('2026-02-27') },
    });
    expect(dates(tx, [], d('2026-01-01'), d('2026-12-31'), opts)).toEqual(['2026-01-31']);
  });
});

describe('yearly', () => {
  it('case 4: Feb 29 clamps in common years and returns in the next leap year', () => {
    const tx = makeTx({ date: d('2024-02-29'), recurrence: { type: 'yearly', month: 2, day: 29 } });
    expect(dates(tx, [], d('2024-01-01'), d('2028-12-31'), opts)).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });
});

describe('one-time', () => {
  it('case 5: emits on its own date', () => {
    const tx = makeTx({ date: d('2026-05-10'), recurrence: { type: 'one_time' } });
    expect(dates(tx, [], d('2026-05-10'), d('2026-05-10'), opts)).toEqual(['2026-05-10']);
  });

  it('case 6: emits nothing outside the window', () => {
    const tx = makeTx({ date: d('2026-05-10'), recurrence: { type: 'one_time' } });
    expect(dates(tx, [], d('2026-05-11'), d('2026-06-01'), opts)).toEqual([]);
  });
});

describe('openingBalanceDate cutoff', () => {
  it('case 7: drops occurrences before the profile opened', () => {
    const tx = makeTx({ date: d('2026-01-15'), recurrence: { type: 'monthly', dayOfMonth: 15 } });
    const result = dates(tx, [], d('2026-01-01'), d('2026-05-31'), {
      today: TODAY,
      openingBalanceDate: d('2026-03-01'),
    });
    expect(result).toEqual(['2026-03-15', '2026-04-15', '2026-05-15']);
  });
});

describe('skip', () => {
  it('case 8: a skipped occurrence is omitted entirely', () => {
    const tx = makeTx({ date: d('2026-01-01'), recurrence: { type: 'monthly', dayOfMonth: 1 } });
    const ov = [skip('tx1', d('2026-03-01'))];
    expect(dates(tx, ov, d('2026-01-01'), d('2026-04-30'), opts)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-04-01',
    ]);
  });

  it('case 9: includeSkipped returns it flagged, so Restore is reachable', () => {
    // Without this the Override row exists and NOTHING renders it: the
    // occurrence is unreachable forever and the skip cannot be undone.
    const tx = makeTx({ date: d('2026-01-01'), recurrence: { type: 'monthly', dayOfMonth: 1 } });
    const ov = [skip('tx1', d('2026-03-01'))];
    const result = expandOccurrences(tx, ov, d('2026-01-01'), d('2026-04-30'), {
      today: TODAY,
      includeSkipped: true,
    });
    expect(result).toHaveLength(4);
    expect(result.find((o) => o.date === '2026-03-01')?.isSkipped).toBe(true);
  });
});

describe('moved occurrences (the defect the spec shipped)', () => {
  const tx = (ov: ReturnType<typeof modify>[] = []) =>
    makeTx({ date: d('2026-01-01'), recurrence: { type: 'monthly', dayOfMonth: 1 } }, ov);

  it('case 10: an occurrence moved OUT of the window does not appear at its old slot', () => {
    const ov = [modify('tx1', d('2026-03-01'), { date: d('2026-04-02') })];
    // The spec filtered on the slot, so it returned 2026-03-01 here: money shown
    // on a day it had explicitly been moved off.
    expect(dates(tx(ov), ov, d('2026-03-01'), d('2026-03-31'), opts)).toEqual([]);
  });

  it('case 11: an occurrence moved INTO the window appears', () => {
    const ov = [modify('tx1', d('2026-03-01'), { date: d('2026-04-02') })];
    // The spec generated slots only inside the window, so this occurrence
    // vanished from the feed AND from the balance. Money disappearing silently.
    const result = expandOccurrences(tx(ov), ov, d('2026-04-01'), d('2026-04-30'), opts);
    expect(result.map((o) => o.date)).toEqual(['2026-04-01', '2026-04-02']);

    const moved = result[1]!;
    expect(moved.originalDate).toBe('2026-03-01');
    expect(moved.isMoved).toBe(true);
    // The Override lookup key survives the move, so clicking the row finds the
    // record that produced it.
    expect(moved.key).toBe('tx1#2026-03-01');
  });

  it('case 12: the openingBalanceDate cutoff applies to the EFFECTIVE date', () => {
    const ov = [modify('tx1', d('2026-02-01'), { date: d('2026-04-02') })];
    const result = dates(tx(ov), ov, d('2026-04-01'), d('2026-04-30'), {
      today: TODAY,
      openingBalanceDate: d('2026-03-01'),
    });
    // The slot (Feb 1) precedes the cutoff, but the money moved to April.
    expect(result).toEqual(['2026-04-01', '2026-04-02']);
  });

  it('case 15: an override on a non-slot date is ignored, with no phantom row', () => {
    const ov = [modify('tx1', d('2026-03-20'), { date: d('2026-03-21') })];
    const t = makeTx({ date: d('2026-01-15'), recurrence: { type: 'monthly', dayOfMonth: 15 } }, ov);
    expect(dates(t, ov, d('2026-03-01'), d('2026-03-31'), opts)).toEqual(['2026-03-15']);
  });

  it('case 16: two occurrences may legitimately land on the same day', () => {
    const ov = [
      modify('tx1', d('2026-03-01'), { date: d('2026-05-05') }),
      modify('tx1', d('2026-04-01'), { date: d('2026-05-05') }),
    ];
    const result = expandOccurrences(tx(ov), ov, d('2026-05-01'), d('2026-05-31'), opts);
    expect(result.map((o) => o.date)).toEqual(['2026-05-01', '2026-05-05', '2026-05-05']);
    // Ties broken by slot, so the order is total and deterministic.
    expect(result.map((o) => o.originalDate)).toEqual(['2026-05-01', '2026-03-01', '2026-04-01']);
  });

  it('case 22: a clamped slot is still a valid override key', () => {
    const ov = [modify('tx1', d('2026-02-28'), { date: d('2026-02-27') })];
    const t = makeTx({ date: d('2026-01-31'), recurrence: { type: 'monthly', dayOfMonth: 31 } }, ov);
    expect(dates(t, ov, d('2026-02-01'), d('2026-02-28'), opts)).toEqual(['2026-02-27']);
  });
});

describe('projection boundary', () => {
  it('case 13: isProjected is strictly date > today', () => {
    const tx = makeTx({ date: d('2026-01-15'), recurrence: { type: 'monthly', dayOfMonth: 15 } });
    const result = expandOccurrences(tx, [], d('2026-09-01'), d('2026-10-31'), opts);
    expect(result.map((o) => [o.date, o.isProjected])).toEqual([
      ['2026-09-15', false],
      ['2026-10-15', true],
    ]);
  });

  it('case 14: projection follows the effective date, not the slot', () => {
    const ov = [modify('tx1', d('2026-10-15'), { date: d('2026-09-10') })];
    const tx = makeTx({ date: d('2026-01-15'), recurrence: { type: 'monthly', dayOfMonth: 15 } }, ov);
    const result = expandOccurrences(tx, ov, d('2026-09-01'), d('2026-10-31'), opts);
    expect(result.find((o) => o.date === '2026-09-10')?.isProjected).toBe(false);
  });
});

describe('guards', () => {
  it('case 17: a soft-deleted transaction emits nothing', () => {
    const tx = makeTx({
      date: d('2026-01-01'),
      recurrence: { type: 'monthly', dayOfMonth: 1 },
      isDeleted: 1,
    });
    expect(dates(tx, [], d('2026-01-01'), d('2026-12-31'), opts)).toEqual([]);
  });

  it('case 18: an endDate before the start emits nothing', () => {
    const tx = makeTx({
      date: d('2026-05-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10, endDate: d('2026-05-01') },
    });
    expect(dates(tx, [], d('2026-01-01'), d('2026-12-31'), opts)).toEqual([]);
  });

  it('case 19: an unbounded window throws rather than allocating forever', () => {
    const tx = makeTx({ date: d('2026-01-01'), recurrence: { type: 'monthly', dayOfMonth: 1 } });
    expect(() => expandOccurrences(tx, [], d('1900-01-01'), d('2099-12-31'), opts)).toThrow(RangeError);
  });

  it('returns nothing when from is after to', () => {
    const tx = makeTx({ date: d('2026-01-01'), recurrence: { type: 'monthly', dayOfMonth: 1 } });
    expect(dates(tx, [], d('2026-06-01'), d('2026-01-01'), opts)).toEqual([]);
  });
});

describe('referential stability', () => {
  it('case 21: an unpatched occurrence keeps the transaction BY REFERENCE', () => {
    // A fresh object per render defeats React.memo on the row and forces the
    // virtualizer to re-measure every item.
    const tx = makeTx({ date: d('2026-01-01'), recurrence: { type: 'monthly', dayOfMonth: 1 } });
    const result = expandOccurrences(tx, [], d('2026-02-01'), d('2026-02-01'), opts);
    expect(result[0]?.transaction).toBe(tx);
  });

  it('case 20: a money patch applies without mutating the parent', () => {
    const base = makeTx({ date: d('2026-01-01'), recurrence: { type: 'one_time' } });
    const ov = [modify('tx1', d('2026-02-01'), { money: { ...base.money, amountMinor: 999 } })];
    const tx = makeTx({ date: d('2026-01-01'), recurrence: { type: 'monthly', dayOfMonth: 1 } }, ov);
    const result = expandOccurrences(tx, ov, d('2026-02-01'), d('2026-02-01'), opts);
    expect(result[0]?.money.amountMinor).toBe(999);
    expect(result[0]?.isOverridden).toBe(true);
    expect(result[0]?.isMoved).toBe(false);
    expect(tx.money.amountMinor).toBe(4500);
  });

  it('clears a note when the patch sets it to null', () => {
    const ov = [modify('tx1', d('2026-02-01'), { note: null })];
    const tx = makeTx(
      { date: d('2026-01-01'), recurrence: { type: 'monthly', dayOfMonth: 1 }, note: 'weekly shop' },
      ov,
    );
    expect(expandOccurrences(tx, ov, d('2026-02-01'), d('2026-02-01'), opts)[0]?.note).toBeUndefined();
  });
});

describe('instalments (תשלומים)', () => {
  it('emits exactly the stated number of payments', () => {
    const tx = makeTx({
      date: d('2026-01-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10, installments: 12 },
    });
    const result = dates(tx, [], d('2026-01-01'), d('2028-12-31'), opts);
    expect(result).toHaveLength(12);
    expect(result[0]).toBe('2026-01-10');
    expect(result[11]).toBe('2026-12-10');
  });

  it('stops after the final payment even with an open window', () => {
    const tx = makeTx({
      date: d('2026-01-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10, installments: 3 },
    });
    expect(dates(tx, [], d('2026-01-01'), d('2026-12-31'), opts)).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
    ]);
  });
});

describe('isValidSlot', () => {
  it('accepts real slots and rejects everything else', () => {
    const tx = makeTx({ date: d('2026-01-31'), recurrence: { type: 'monthly', dayOfMonth: 31 } });
    expect(isValidSlot(tx, d('2026-01-31'))).toBe(true);
    expect(isValidSlot(tx, d('2026-02-28'))).toBe(true);
    expect(isValidSlot(tx, d('2026-02-27'))).toBe(false);
    expect(isValidSlot(tx, d('2025-12-31'))).toBe(false);
  });

  it('bounds an instalment series', () => {
    const tx = makeTx({
      date: d('2026-01-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10, installments: 3 },
    });
    expect(isValidSlot(tx, d('2026-03-10'))).toBe(true);
    expect(isValidSlot(tx, d('2026-04-10'))).toBe(false);
  });

  it('handles yearly slots', () => {
    const tx = makeTx({ date: d('2024-02-29'), recurrence: { type: 'yearly', month: 2, day: 29 } });
    expect(isValidSlot(tx, d('2025-02-28'))).toBe(true);
    expect(isValidSlot(tx, d('2025-02-27'))).toBe(false);
    expect(isValidSlot(tx, d('2025-03-29'))).toBe(false);
  });
});

describe('estimateOccurrenceCount', () => {
  it('bounds the cost without expanding', () => {
    const monthly = makeTx({ date: d('2026-01-01'), recurrence: { type: 'monthly', dayOfMonth: 1 } });
    const yearly = makeTx({
      id: 'tx2',
      date: d('2026-01-01'),
      recurrence: { type: 'yearly', month: 1, day: 1 },
    });
    const once = makeTx({ id: 'tx3', date: d('2026-01-01'), recurrence: { type: 'one_time' } });
    // 12 monthly + 1 yearly + 1 one-time over the window.
    expect(estimateOccurrenceCount([monthly, yearly, once], d('2026-01-01'), d('2026-12-01'))).toBe(14);
  });

  it('counts an instalment series by its payment count', () => {
    const tx = makeTx({
      date: d('2026-01-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10, installments: 3 },
    });
    expect(estimateOccurrenceCount([tx], d('2026-01-01'), d('2027-12-01'))).toBe(3);
  });
});

describe('isValidSlot for one-time transactions', () => {
  it('accepts only its own date', () => {
    const tx = makeTx({ date: d('2026-05-10'), recurrence: { type: 'one_time' } });
    expect(isValidSlot(tx, d('2026-05-10'))).toBe(true);
    expect(isValidSlot(tx, d('2026-05-11'))).toBe(false);
    expect(isValidSlot(tx, d('2026-05-09'))).toBe(false);
  });
});

describe('seriesEndDate', () => {
  it('is open-ended for a one-time or unbounded series', () => {
    expect(seriesEndDate({ type: 'one_time' })).toBe('9999-12-31');
    expect(seriesEndDate({ type: 'monthly', dayOfMonth: 1 })).toBe('9999-12-31');
    expect(seriesEndDate({ type: 'yearly', month: 1, day: 1 })).toBe('9999-12-31');
  });

  it('returns the explicit end when set', () => {
    expect(seriesEndDate({ type: 'monthly', dayOfMonth: 1, endDate: d('2026-06-30') })).toBe('2026-06-30');
    expect(seriesEndDate({ type: 'yearly', month: 1, day: 1, endDate: d('2030-01-01') })).toBe('2030-01-01');
  });
});

describe('moved-in enumeration guards', () => {
  it('ignores a move whose target is outside the window', () => {
    const ov = [modify('tx1', d('2026-03-01'), { date: d('2026-08-02') })];
    const tx = makeTx({ date: d('2026-01-01'), recurrence: { type: 'monthly', dayOfMonth: 1 } }, ov);
    expect(dates(tx, ov, d('2026-04-01'), d('2026-04-30'), opts)).toEqual(['2026-04-01']);
  });

  it('does not double-count a move within the window', () => {
    const ov = [modify('tx1', d('2026-04-01'), { date: d('2026-04-20') })];
    const tx = makeTx({ date: d('2026-01-01'), recurrence: { type: 'monthly', dayOfMonth: 1 } }, ov);
    expect(dates(tx, ov, d('2026-04-01'), d('2026-04-30'), opts)).toEqual(['2026-04-20']);
  });

  it('ignores overrides belonging to a different transaction', () => {
    const ov = [modify('other-tx', d('2026-03-01'), { date: d('2026-04-02') })];
    const tx = makeTx({ date: d('2026-01-01'), recurrence: { type: 'monthly', dayOfMonth: 1 } });
    expect(dates(tx, ov, d('2026-04-01'), d('2026-04-30'), opts)).toEqual(['2026-04-01']);
  });

  it('ignores a skip override that carries no move', () => {
    const ov = [skip('tx1', d('2026-03-01'))];
    const tx = makeTx({ date: d('2026-01-01'), recurrence: { type: 'monthly', dayOfMonth: 1 } }, ov);
    expect(dates(tx, ov, d('2026-04-01'), d('2026-04-30'), opts)).toEqual(['2026-04-01']);
  });
});

describe('yearly windowing', () => {
  it('emits nothing when the anniversary falls outside the window', () => {
    const tx = makeTx({ date: d('2026-03-15'), recurrence: { type: 'yearly', month: 3, day: 15 } });
    expect(dates(tx, [], d('2026-06-01'), d('2026-08-31'), opts)).toEqual([]);
  });
});

describe('patch field precedence', () => {
  const base = { date: d('2026-01-01'), recurrence: { type: 'monthly' as const, dayOfMonth: 1 } };

  it('inherits payment method and note from the parent when unpatched', () => {
    const tx = makeTx({ ...base, paymentMethodId: 'pm1', note: 'rent' });
    const o = expandOccurrences(tx, [], d('2026-02-01'), d('2026-02-01'), opts)[0]!;
    expect(o.paymentMethodId).toBe('pm1');
    expect(o.note).toBe('rent');
  });

  it('omits both when the parent has neither', () => {
    const tx = makeTx(base);
    const o = expandOccurrences(tx, [], d('2026-02-01'), d('2026-02-01'), opts)[0]!;
    expect(o.paymentMethodId).toBeUndefined();
    expect(o.note).toBeUndefined();
  });

  it('replaces payment method and note when the patch supplies values', () => {
    const ov = [modify('tx1', d('2026-02-01'), { paymentMethodId: 'pm2', note: 'moved to Visa' })];
    const tx = makeTx({ ...base, paymentMethodId: 'pm1', note: 'rent' }, ov);
    const o = expandOccurrences(tx, ov, d('2026-02-01'), d('2026-02-01'), opts)[0]!;
    expect(o.paymentMethodId).toBe('pm2');
    expect(o.note).toBe('moved to Visa');
  });

  it('clears the payment method when the patch sets it to null', () => {
    const ov = [modify('tx1', d('2026-02-01'), { paymentMethodId: null })];
    const tx = makeTx({ ...base, paymentMethodId: 'pm1' }, ov);
    const o = expandOccurrences(tx, ov, d('2026-02-01'), d('2026-02-01'), opts)[0]!;
    expect(o.paymentMethodId).toBeUndefined();
  });

  it('replaces the category when patched', () => {
    const ov = [modify('tx1', d('2026-02-01'), { categoryId: 'cat.dining' })];
    const tx = makeTx(base, ov);
    const o = expandOccurrences(tx, ov, d('2026-02-01'), d('2026-02-01'), opts)[0]!;
    expect(o.categoryId).toBe('cat.dining');
  });

  it('treats a patch with the same date as not moved', () => {
    const ov = [modify('tx1', d('2026-02-01'), { date: d('2026-02-01') })];
    const tx = makeTx(base, ov);
    const o = expandOccurrences(tx, ov, d('2026-02-01'), d('2026-02-01'), opts)[0]!;
    expect(o.isMoved).toBe(false);
    expect(o.isOverridden).toBe(true);
  });
});

describe('final slot guards', () => {
  it('rejects a date after the series endDate', () => {
    const tx = makeTx({
      date: d('2026-01-01'),
      recurrence: { type: 'monthly', dayOfMonth: 1, endDate: d('2026-06-01') },
    });
    expect(isValidSlot(tx, d('2026-06-01'))).toBe(true);
    expect(isValidSlot(tx, d('2026-07-01'))).toBe(false);
  });

  it('ignores a moved-in override whose slot was never a real slot', () => {
    // Slot outside the window AND not on the series rhythm (the 20th, for a
    // series that runs on the 1st). A stale or hand-edited override row must not
    // conjure an occurrence out of nothing.
    const ov = [modify('tx1', d('2026-02-20'), { date: d('2026-04-15') })];
    const tx = makeTx({ date: d('2026-01-01'), recurrence: { type: 'monthly', dayOfMonth: 1 } }, ov);
    expect(dates(tx, ov, d('2026-04-01'), d('2026-04-30'), opts)).toEqual(['2026-04-01']);
  });
});

describe('a long credit that follows prime', () => {
  type Reset = NonNullable<Extract<Recurrence, { type: 'monthly' }>['reset']>;
  const money = {
    ...MONEY,
    currency: 'ILS',
    baseCurrency: 'ILS',
    amountMinor: 14_620,
    baseAmountMinor: 14_620,
  };
  const plan = (reset?: Reset) =>
    makeTx({
      id: 'sofa',
      date: d('2026-01-05'),
      money,
      recurrence: {
        type: 'monthly',
        dayOfMonth: 5,
        installments: 24,
        plan: 'credit',
        creditAnnualRate: '15.5',
        ...(reset === undefined ? {} : { reset }),
      },
    });
  const all = (tx: Transaction, overrides: Override[] = []) =>
    expandOccurrences(tx, overrides, d('2026-01-01'), d('2027-12-31'), opts);
  const priced: Reset = { atPayment: 19, primeAtPurchase: '6', rate: '16', paymentMinor: 14_700 };

  it('charges the plan’s payment before the reset and the re-priced one from it', () => {
    const payments = all(plan(priced));
    expect(payments).toHaveLength(24);
    expect(payments.slice(0, 18).map((o) => o.money.amountMinor)).toEqual(Array(18).fill(14_620));
    expect(payments.slice(18).map((o) => o.money.amountMinor)).toEqual(Array(6).fill(14_700));
    expect(payments.slice(18).map((o) => o.money.baseAmountMinor)).toEqual(Array(6).fill(14_700));
    // Payment 19 is the 19th slot: 5 July 2027.
    expect(payments[18]?.date).toBe('2027-07-05');
    expect(payments[17]?.money).toBe(money);
  });

  it('adds up exactly: the first absorbing its remainder, then the plan’s, then the reset’s', () => {
    const tx = plan(priced);
    const first = modify('sofa', d('2026-01-05'), {
      money: { ...money, amountMinor: 14_623, baseAmountMinor: 14_623 },
    });
    const total = all(tx, [first]).reduce((sum, o) => sum + o.money.amountMinor, 0);
    expect(total).toBe(14_623 + 17 * 14_620 + 6 * 14_700);
  });

  it('keeps a payment the person changed', () => {
    const edited = modify('sofa', d('2027-08-05'), {
      money: { ...money, amountMinor: 1, baseAmountMinor: 1 },
    });
    expect(all(plan(priced), [edited])[19]?.money.amountMinor).toBe(1);
  });

  it('charges every payment the same without a re-priced payment, and on rows from before resets', () => {
    for (const tx of [plan(), plan({ atPayment: 19, primeAtPurchase: '6' })]) {
      const payments = all(tx);
      expect(payments).toHaveLength(24);
      // By reference, exactly as before: nothing new is made for these rows.
      expect(payments.every((o) => o.money === money)).toBe(true);
    }
  });

  it('converts a foreign plan’s re-priced payment at its own rate, with its card fee', () => {
    const usd = { ...money, currency: 'USD', rateUsed: '3.7', feeRate: '2.5' } as const;
    const tx = { ...plan({ ...priced, paymentMinor: 10_000 }), money: usd };
    const later = all(tx)[18];
    expect(later?.money).toMatchObject({ amountMinor: 10_000, currency: 'USD', baseAmountMinor: 37_925 });
    // One snapshot per plan, not one per payment.
    expect(all(tx)[19]?.money).toBe(later?.money);
  });
});

describe('the income destination', () => {
  const salary = {
    date: d('2026-01-10'),
    recurrence: { type: 'monthly' as const, dayOfMonth: 10 },
    kind: 'income' as const,
    categoryId: 'cat.salary',
  };

  it('inherits the series’ destination', () => {
    const tx = makeTx({ ...salary, destinationId: 'pm.leumi' });
    const o = expandOccurrences(tx, [], d('2026-02-10'), d('2026-02-10'), opts)[0]!;
    expect(o.destinationId).toBe('pm.leumi');
  });

  it('carries no destination when the series has none', () => {
    const o = expandOccurrences(makeTx(salary), [], d('2026-02-10'), d('2026-02-10'), opts)[0]!;
    expect(o).not.toHaveProperty('destinationId');
  });

  it('takes one payment’s own destination from its override, and clears it with null', () => {
    const ov = [
      modify('tx1', d('2026-02-10'), { destinationId: 'pm.cash' }),
      modify('tx1', d('2026-03-10'), { destinationId: null }),
    ];
    const tx = makeTx({ ...salary, destinationId: 'pm.leumi' }, ov);
    const [feb, mar, apr] = expandOccurrences(tx, ov, d('2026-02-01'), d('2026-04-30'), opts);
    expect(feb?.destinationId).toBe('pm.cash');
    expect(mar?.destinationId).toBeUndefined();
    expect(apr?.destinationId).toBe('pm.leumi');
  });
});
