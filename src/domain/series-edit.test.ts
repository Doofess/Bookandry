import { describe, expect, it } from 'vitest';

import { counterIdFactory } from '@/lib/id';
import type { Override, Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { isSlot, planSeriesEdit, previousSlot, type SeriesEditInput } from './series-edit';
import { d, makeTx, modify, MONEY, skip } from './test-factories';

const TODAY = d('2026-09-15');
const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;

/** Monthly on the 10th, starting in March, no end date. */
const monthly = (over: Partial<Transaction> = {}): Transaction =>
  makeTx({
    id: 'rent',
    date: d('2026-03-10'),
    recurrence: { type: 'monthly', dayOfMonth: 10 },
    ...over,
  });

function plan(input: Partial<SeriesEditInput> & Pick<SeriesEditInput, 'scope' | 'at'>) {
  const result = planSeriesEdit({
    transaction: monthly(),
    overrides: [],
    patch: {},
    today: TODAY,
    now: NOW,
    newId: counterIdFactory('new'),
    ...input,
  });
  if (!result.ok) throw new Error(`planning failed: ${result.error.kind}`);
  return result.plan;
}

describe('slot helpers', () => {
  it('recognises a real slot', () => {
    expect(isSlot(monthly(), [], d('2026-06-10'), TODAY)).toBe(true);
    expect(isSlot(monthly(), [], d('2026-06-11'), TODAY)).toBe(false);
  });

  it('still counts a SKIPPED slot as a slot', () => {
    // Otherwise "edit this and future" from a skipped occurrence would be
    // refused, and the user has no way to see why.
    const overrides = [skip('rent', d('2026-06-10'))];
    expect(isSlot(monthly(), overrides, d('2026-06-10'), TODAY)).toBe(true);
  });

  it('finds the previous slot, and reports none for the first', () => {
    expect(previousSlot(monthly(), [], d('2026-06-10'), TODAY)).toBe('2026-05-10');
    expect(previousSlot(monthly(), [], d('2026-03-10'), TODAY)).toBeUndefined();
  });

  it('finds the previous slot of a yearly series a year back', () => {
    const yearly = makeTx({
      id: 'y',
      date: d('2020-03-15'),
      recurrence: { type: 'yearly', month: 3, day: 15 },
    });
    expect(previousSlot(yearly, [], d('2026-03-15'), TODAY)).toBe('2025-03-15');
  });
});

describe('scope: one', () => {
  it('writes an override and leaves the series alone', () => {
    const result = plan({ scope: 'one', at: d('2026-06-10'), patch: { note: 'One-off' } });
    expect(result.transactions).toEqual([]);
    expect(result.overrides).toHaveLength(1);
    expect(result.overrides[0]).toMatchObject({
      transactionId: 'rent',
      occurrenceDate: '2026-06-10',
      action: 'modify',
      patch: { note: 'One-off' },
    });
  });

  it('merges into an existing override rather than replacing it', () => {
    const existing = modify('rent', d('2026-06-10'), { note: 'Kept' });
    const result = plan({
      scope: 'one',
      at: d('2026-06-10'),
      overrides: [{ ...existing, id: 'o1' }],
      patch: { money: MONEY },
    });
    // Editing the amount must not silently discard a note set earlier.
    expect(result.overrides[0]?.id).toBe('o1');
    const patch = result.overrides[0]?.action === 'modify' ? result.overrides[0].patch : undefined;
    expect(patch?.note).toBe('Kept');
    expect(patch?.money).toEqual(MONEY);
  });

  it('refuses a recurrence change on a single occurrence', () => {
    // A slot whose own rule disagrees with its parent's is not interpretable.
    const result = planSeriesEdit({
      transaction: monthly(),
      overrides: [],
      scope: 'one',
      at: d('2026-06-10'),
      patch: { recurrence: { type: 'monthly', dayOfMonth: 1 } },
      today: TODAY,
      now: NOW,
      newId: counterIdFactory('new'),
    });
    expect(result).toEqual({ ok: false, error: { kind: 'rule_change_needs_series', scope: 'one' } });
  });

  it('refuses a move applied to a whole series', () => {
    const result = planSeriesEdit({
      transaction: monthly(),
      overrides: [],
      scope: 'all',
      at: d('2026-06-10'),
      patch: { date: d('2026-06-12') },
      today: TODAY,
      now: NOW,
      newId: counterIdFactory('new'),
    });
    // Applied to a series this would silently mean "change the rule".
    expect(result).toEqual({ ok: false, error: { kind: 'move_needs_single', scope: 'all' } });
  });

  it('refuses a date that is not a slot', () => {
    const result = planSeriesEdit({
      transaction: monthly(),
      overrides: [],
      scope: 'one',
      at: d('2026-06-11'),
      patch: {},
      today: TODAY,
      now: NOW,
      newId: counterIdFactory('new'),
    });
    expect(result).toEqual({ ok: false, error: { kind: 'not_a_slot', at: '2026-06-11' } });
  });
});

describe('scope: all', () => {
  it('edits the series in place, creating nothing', () => {
    const result = plan({ scope: 'all', at: d('2026-06-10'), patch: { note: 'Everywhere' } });
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({ id: 'rent', note: 'Everywhere', updatedAt: NOW });
    expect(result.overrides).toEqual([]);
  });

  it('treats every scope as "all" for a one-time transaction', () => {
    const once = makeTx({ id: 'coffee', date: d('2026-09-10'), recurrence: { type: 'one_time' } });
    for (const scope of ['one', 'future', 'all'] as const) {
      const result = plan({ transaction: once, scope, at: d('2026-09-10'), patch: { note: 'x' } });
      // One occurrence means the three scopes are the same edit; saying so here
      // keeps three branches from each having to know it.
      expect(result.effectiveScope).toBe('all');
      expect(result.transactions).toHaveLength(1);
    }
  });

  it('can clear a field, which Partial cannot express', () => {
    const withNote = monthly({ note: 'Old', paymentMethodId: 'm1' });
    const result = plan({
      transaction: withNote,
      scope: 'all',
      at: d('2026-06-10'),
      patch: { note: null, paymentMethodId: null },
    });
    expect(result.transactions[0]?.note).toBeUndefined();
    expect(result.transactions[0]?.paymentMethodId).toBeUndefined();
  });
});

describe('scope: future — the split', () => {
  it('closes the original at the PREVIOUS slot, not at the split point', () => {
    const result = plan({ scope: 'future', at: d('2026-06-10'), patch: { money: MONEY } });
    const [original, continuation] = result.transactions;

    // Closing AT the split point would emit the occurrence twice.
    expect(original?.recurrence).toMatchObject({ endDate: '2026-05-10' });
    expect(continuation?.date).toBe('2026-06-10');
    expect(continuation?.seriesStart).toBe('2026-06-10');
  });

  it('inherits an existing end date, so the continuation does not bill forever', () => {
    const ending = monthly({ recurrence: { type: 'monthly', dayOfMonth: 10, endDate: d('2026-12-10') } });
    const result = plan({ transaction: ending, scope: 'future', at: d('2026-06-10'), patch: {} });
    const [original, continuation] = result.transactions;

    expect(original?.recurrence).toMatchObject({ endDate: '2026-05-10' });
    // The spec dropped this, so every continuation billed forever.
    expect(continuation?.recurrence).toMatchObject({ endDate: '2026-12-10' });
  });

  it('links the continuation back to its origin', () => {
    const result = plan({ scope: 'future', at: d('2026-06-10'), patch: {} });
    const continuation = result.transactions[1];

    // Without lineage nothing can tell two rows were once one series, and undo
    // has nothing to key on.
    expect(continuation).toMatchObject({
      seriesRootId: 'rent',
      splitFromId: 'rent',
      splitAtDate: '2026-06-10',
    });
    expect(continuation?.id).not.toBe('rent');
  });

  it('promotes a split at the FIRST occurrence to a whole-series edit', () => {
    const result = plan({ scope: 'future', at: d('2026-03-10'), patch: { note: 'x' } });

    // The spec produced endDate < date here: a series that can never emit
    // anything and looks entirely normal in the table.
    expect(result.effectiveScope).toBe('all');
    expect(result.transactions).toHaveLength(1);
    expect(result.warnings).toEqual([{ kind: 'scope_promoted', from: 'future', to: 'all' }]);
  });

  it('edits a whole plan, never splitting it, so its payment count and prime reset stay where they are', () => {
    const credit = makeTx({
      id: 'plus',
      date: d('2026-10-08'),
      recurrence: {
        type: 'monthly',
        dayOfMonth: 8,
        installments: 36,
        plan: 'credit',
        creditAnnualRate: '15.5',
        reset: { atPayment: 19, primeAtPurchase: '4.75', principalMinor: 300_000 },
      },
    });
    // A category change "this and future" at payment 5.
    const result = plan({
      transaction: credit,
      scope: 'future',
      at: d('2027-02-08'),
      patch: { categoryId: 'cat.other' },
      today: d('2027-02-01'),
    });

    expect(result.effectiveScope).toBe('all');
    expect(result.warnings).toEqual([{ kind: 'scope_promoted', from: 'future', to: 'all' }]);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      id: 'plus',
      date: '2026-10-08',
      categoryId: 'cat.other',
      recurrence: { installments: 36, reset: { atPayment: 19 } },
    });
  });

  it('re-homes future overrides onto the continuation, keeping their ids', () => {
    const overrides: Override[] = [
      { ...skip('rent', d('2026-04-10')), id: 'past' },
      { ...skip('rent', d('2026-07-10')), id: 'future' },
    ];
    const result = plan({ scope: 'future', at: d('2026-06-10'), overrides, patch: {} });

    // Left behind they point at a series that no longer reaches them, and they
    // RESURRECT the day someone extends the original's endDate.
    expect(result.overrides).toHaveLength(1);
    expect(result.overrides[0]).toMatchObject({ id: 'future', transactionId: result.transactions[1]?.id });
    // A re-homed override keeps its key, so a put updates it in place.
    expect(result.deleteOverrideIds).toEqual([]);
  });

  it('leaves overrides before the split point with the original', () => {
    const overrides: Override[] = [{ ...skip('rent', d('2026-04-10')), id: 'past' }];
    const result = plan({ scope: 'future', at: d('2026-06-10'), overrides, patch: {} });
    expect(result.overrides.map((o) => o.id)).not.toContain('past');
  });

  it('drops future overrides when the RULE changed, and says how many', () => {
    const overrides: Override[] = [
      { ...skip('rent', d('2026-07-10')), id: 'a' },
      { ...skip('rent', d('2026-08-10')), id: 'b' },
    ];
    const result = plan({
      scope: 'future',
      at: d('2026-06-10'),
      overrides,
      patch: { recurrence: { type: 'monthly', dayOfMonth: 1 } },
    });

    // Their slots may no longer exist at all under the new rule, so re-homing
    // would pin them to dates the series never emits.
    expect(result.overrides).toEqual([]);
    expect([...result.deleteOverrideIds].sort()).toEqual(['a', 'b']);
    expect(result.warnings).toEqual([{ kind: 'overrides_dropped', count: 2 }]);
  });

  it('applies a new rule to the continuation only', () => {
    const result = plan({
      scope: 'future',
      at: d('2026-06-10'),
      patch: { recurrence: { type: 'monthly', dayOfMonth: 1 } },
    });
    const [original, continuation] = result.transactions;
    expect(original?.recurrence).toMatchObject({ dayOfMonth: 10, endDate: '2026-05-10' });
    expect(continuation?.recurrence).toMatchObject({ dayOfMonth: 1 });
  });

  it('is byte-stable for the same inputs', () => {
    const once = plan({ scope: 'future', at: d('2026-06-10'), patch: {} });
    const twice = plan({ scope: 'future', at: d('2026-06-10'), patch: {} });
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });
});

describe('a rule change across the whole series', () => {
  /*
   * The defect this section exists for, found by walking the UI in a browser
   * rather than by reading the code: scope 'all' with a rule change left every
   * per-occurrence override in the table, keyed to slots the new rule no longer
   * emits. Expansion iterates slots, so they were invisible - and would have
   * reappeared, months later, the moment anyone changed the rule back.
   */
  const edits = () => [
    modify('rent', d('2026-11-10'), { note: 'november' }),
    modify('rent', d('2026-12-10'), { note: 'december' }),
  ];

  it('drops overrides whose slot the new rule no longer emits', () => {
    const overrides = edits();

    const result = plan({
      overrides,
      scope: 'all',
      at: d('2026-09-10'),
      patch: { recurrence: { type: 'monthly', dayOfMonth: 20 } },
    });

    expect(result.deleteOverrideIds).toEqual(overrides.map((o) => o.id));
  });

  it('reports how many, so the confirmation can name a number', () => {
    const result = plan({
      overrides: edits(),
      scope: 'all',
      at: d('2026-09-10'),
      patch: { recurrence: { type: 'monthly', dayOfMonth: 20 } },
    });

    expect(result.warnings).toContainEqual({ kind: 'overrides_dropped', count: 2 });
  });

  it('KEEPS an override whose slot survives the new rule', () => {
    // Ending the series in November leaves that slot intact; only December
    // falls outside the new rule.
    const overrides = edits();

    const result = plan({
      overrides,
      scope: 'all',
      at: d('2026-09-10'),
      patch: { recurrence: { type: 'monthly', dayOfMonth: 10, endDate: d('2026-11-10') } },
    });

    expect(result.deleteOverrideIds).toEqual([overrides[1]?.id]);
  });

  it('touches no override when the rule is unchanged', () => {
    // Editing the amount for the whole series must not disturb per-occurrence
    // edits: every one of their slots is still a slot.
    const result = plan({
      overrides: edits(),
      scope: 'all',
      at: d('2026-09-10'),
      patch: { note: 'renamed' },
    });

    expect(result.deleteOverrideIds).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe('a 30+ purchase', () => {
  const later = makeTx({
    id: 'later',
    date: d('2026-09-08'),
    recurrence: { type: 'one_time' },
    deferral: { rate: '15.5' },
  });

  it('stops being 30+ when its type leaves one-time, so no payment is billed a month late', () => {
    for (const recurrence of [
      { type: 'monthly', dayOfMonth: 8, installments: 3, plan: 'installments' },
      { type: 'monthly', dayOfMonth: 8, installments: 24, plan: 'credit', creditAnnualRate: '15.5' },
      { type: 'monthly', dayOfMonth: 8 },
    ] as const) {
      const [written] = plan({
        transaction: later,
        scope: 'all',
        at: d('2026-09-08'),
        patch: { recurrence },
      }).transactions;
      expect(written?.recurrence).toEqual(recurrence);
      expect(written).not.toHaveProperty('deferral');
    }
  });

  it('stays 30+ through an edit that keeps it one-time', () => {
    const [written] = plan({
      transaction: later,
      scope: 'all',
      at: d('2026-09-08'),
      patch: { note: 'tv', recurrence: { type: 'one_time' } },
    }).transactions;
    expect(written?.deferral).toEqual({ rate: '15.5' });
    const [noteOnly] = plan({
      transaction: later,
      scope: 'all',
      at: d('2026-09-08'),
      patch: { note: 'tv' },
    }).transactions;
    expect(noteOnly?.deferral).toEqual({ rate: '15.5' });
  });
});

describe('the income destination', () => {
  const salary = (over: Partial<Transaction> = {}): Transaction =>
    monthly({ kind: 'income', categoryId: 'cat.salary', destinationId: 'pm.leumi', ...over });

  it('sends one payment to cash as an override, leaving the series where it was', () => {
    const result = plan({
      transaction: salary(),
      scope: 'one',
      at: d('2026-06-10'),
      patch: { destinationId: 'pm.cash' },
    });
    expect(result.transactions).toEqual([]);
    expect(result.overrides[0]).toMatchObject({
      action: 'modify',
      occurrenceDate: '2026-06-10',
      patch: { destinationId: 'pm.cash' },
    });
  });

  it('moves the whole series, and clears it with null', () => {
    const moved = plan({
      transaction: salary(),
      scope: 'all',
      at: d('2026-06-10'),
      patch: { destinationId: 'pm.cash' },
    });
    expect(moved.transactions[0]?.destinationId).toBe('pm.cash');

    const cleared = plan({
      transaction: salary(),
      scope: 'all',
      at: d('2026-06-10'),
      patch: { destinationId: null },
    });
    expect(cleared.transactions[0]?.destinationId).toBeUndefined();
  });

  it('sends this and later payments to cash through the split, and keeps the earlier ones', () => {
    const result = plan({
      transaction: salary(),
      scope: 'future',
      at: d('2026-06-10'),
      patch: { destinationId: 'pm.cash' },
    });
    const [original, continuation] = result.transactions;
    expect(original?.destinationId).toBe('pm.leumi');
    expect(continuation?.destinationId).toBe('pm.cash');
  });

  it('keeps a recount’s tag through an edit of its note', () => {
    const recount = makeTx({
      id: 'rc',
      date: d('2026-06-10'),
      recurrence: { type: 'one_time' },
      paymentMethodId: 'pm.cash',
      cashCount: true,
    });
    const result = plan({
      transaction: recount,
      scope: 'all',
      at: d('2026-06-10'),
      patch: { note: 'wallet' },
    });
    expect(result.transactions[0]).toMatchObject({
      cashCount: true,
      paymentMethodId: 'pm.cash',
      note: 'wallet',
    });
  });
});
