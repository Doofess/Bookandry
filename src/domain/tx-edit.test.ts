import { describe, expect, it } from 'vitest';

import type { Occurrence, Override, Transaction } from '@/types/domain';
import type { MoneySnapshot } from '@/types/money';

import { expandOccurrences } from './occurrences';
import { d, makeTx, modify, MONEY } from './test-factories';
import {
  buildPatch,
  isEmptyPatch,
  isInstallmentPlan,
  occurrenceToFormValues,
  recurrenceModeOf,
  scopeAllowsMove,
  scopeAllowsRecurrence,
} from './tx-edit';
import { txFormSchema, type TxFormValues } from './tx-form';

const TODAY = d('2026-09-15');

/** Monthly on the 10th from March, so September is the seventh occurrence. */
const rent = (over: Partial<Transaction> = {}, overrides: readonly Override[] = []) =>
  makeTx(
    {
      id: 'rent',
      date: d('2026-03-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10 },
      money: { ...MONEY, currency: 'ILS', baseCurrency: 'ILS', rateUsed: '1' },
      ...over,
    },
    overrides,
  );

function occurrenceOf(tx: Transaction, overrides: readonly Override[], on: string): Occurrence {
  const found = expandOccurrences(tx, overrides, d('2020-01-01'), d('2030-01-01'), {
    today: TODAY,
    includeSkipped: true,
  }).find((o) => o.originalDate === on);
  if (found === undefined) throw new Error(`no occurrence at ${on}`);
  return found;
}

function parse(values: TxFormValues) {
  const result = txFormSchema.safeParse(values);
  if (!result.success) throw new Error(result.error.issues.map((i) => i.message).join(', '));
  return result.data;
}

describe('scope rules', () => {
  it('mirrors the two refusals the planner makes', () => {
    // Not UI preferences: a per-occurrence rule change is uninterpretable, and
    // a date move applied to a rule silently moves every occurrence.
    expect(scopeAllowsRecurrence('one')).toBe(false);
    expect(scopeAllowsRecurrence('future')).toBe(true);
    expect(scopeAllowsRecurrence('all')).toBe(true);

    expect(scopeAllowsMove('one')).toBe(true);
    expect(scopeAllowsMove('future')).toBe(false);
    expect(scopeAllowsMove('all')).toBe(false);
  });
});

describe('recurrenceModeOf', () => {
  it.each([
    [{ type: 'one_time' } as const, 'one_time'],
    [{ type: 'monthly', dayOfMonth: 10 } as const, 'monthly'],
    [{ type: 'monthly', dayOfMonth: 10, installments: 3 } as const, 'installments'],
    [{ type: 'yearly', month: 3, day: 1 } as const, 'yearly'],
  ])('reads %o as %s', (recurrence, expected) => {
    expect(recurrenceModeOf(recurrence)).toBe(expected);
  });

  it('separates an instalment plan from an ordinary monthly bill', () => {
    expect(isInstallmentPlan({ type: 'monthly', dayOfMonth: 10, installments: 3 })).toBe(true);
    expect(isInstallmentPlan({ type: 'monthly', dayOfMonth: 10 })).toBe(false);
    expect(isInstallmentPlan({ type: 'one_time' })).toBe(false);
  });
});

describe('occurrenceToFormValues', () => {
  it('seeds from the series when there is no override', () => {
    const tx = rent();
    const values = occurrenceToFormValues(occurrenceOf(tx, [], '2026-09-10'), tx);

    expect(values).toMatchObject({
      kind: 'expense',
      amount: '45.00',
      currency: 'ILS',
      date: '2026-09-10',
      mode: 'monthly',
      dayOfMonth: '10',
      endDate: '',
    });
  });

  it('seeds from the OCCURRENCE, not the series, when one is overridden', () => {
    /*
     * The difference that matters: seeding from the parent would show the
     * series' amount and note, and saving would then write those over the
     * per-occurrence edit the user opened the sheet to look at.
     */
    const patched: MoneySnapshot = { ...MONEY, amountMinor: 9900, currency: 'ILS', baseCurrency: 'ILS' };
    const override = modify('rent', d('2026-09-10'), { money: patched, note: 'with the fee' });
    const tx = rent({}, [override]);

    const values = occurrenceToFormValues(occurrenceOf(tx, [override], '2026-09-10'), tx);

    expect(values).toMatchObject({ amount: '99.00', note: 'with the fee' });
  });

  it('opens a moved occurrence on the day it was moved to', () => {
    const override = modify('rent', d('2026-09-10'), { date: d('2026-09-12') });
    const tx = rent({}, [override]);

    expect(occurrenceToFormValues(occurrenceOf(tx, [override], '2026-09-10'), tx).date).toBe('2026-09-12');
  });

  it('round-trips through the schema', () => {
    const tx = rent();
    const values = occurrenceToFormValues(occurrenceOf(tx, [], '2026-09-10'), tx);

    expect(parse(values).recurrence).toEqual({ type: 'monthly', dayOfMonth: 10 });
  });

  it('carries an end date and an instalment count', () => {
    const plan = rent({
      recurrence: { type: 'monthly', dayOfMonth: 10, installments: 6 },
      date: d('2026-03-10'),
    });
    const ended = rent({ recurrence: { type: 'monthly', dayOfMonth: 10, endDate: d('2027-03-10') } });

    expect(occurrenceToFormValues(occurrenceOf(plan, [], '2026-03-10'), plan)).toMatchObject({
      mode: 'installments',
      installmentCount: '6',
    });
    expect(occurrenceToFormValues(occurrenceOf(ended, [], '2026-09-10'), ended)).toMatchObject({
      endDate: '2027-03-10',
    });
  });
});

describe('buildPatch', () => {
  const tx = rent();
  const occurrence = occurrenceOf(tx, [], '2026-09-10');
  const base = occurrenceToFormValues(occurrence, tx);

  const patchFor = (over: Partial<TxFormValues> = {}, scope: 'one' | 'future' | 'all' = 'one') =>
    buildPatch({
      parsed: parse({ ...base, ...over }),
      occurrence,
      transaction: tx,
      scope,
      money: occurrence.money,
    });

  it('is empty when nothing changed', () => {
    // Writing anyway would bump updatedAt and hand the next import merge a
    // winner that represents no actual edit.
    expect(isEmptyPatch(patchFor())).toBe(true);
  });

  it('names only the field that changed', () => {
    expect(patchFor({ note: 'paid late' })).toEqual({ note: 'paid late' });
  });

  it('clears a note with null, not by omitting it', () => {
    /*
     * `undefined` means "leave alone" and `null` means "clear". Omitting the
     * key would make deleting a note impossible - the reason the Override patch
     * type distinguishes the two rather than using Partial.
     */
    const withNote = modify('rent', d('2026-09-10'), { note: 'old' });
    const parent = rent({}, [withNote]);
    const target = occurrenceOf(parent, [withNote], '2026-09-10');

    const patch = buildPatch({
      parsed: parse({ ...occurrenceToFormValues(target, parent), note: '' }),
      occurrence: target,
      transaction: parent,
      scope: 'one',
      money: target.money,
    });

    expect(patch).toEqual({ note: null });
  });

  it('clears a payment method with null', () => {
    const withMethod = modify('rent', d('2026-09-10'), { paymentMethodId: 'pm1' });
    const parent = rent({}, [withMethod]);
    const target = occurrenceOf(parent, [withMethod], '2026-09-10');

    const patch = buildPatch({
      parsed: parse({ ...occurrenceToFormValues(target, parent), paymentMethodId: '' }),
      occurrence: target,
      transaction: parent,
      scope: 'one',
      money: target.money,
    });

    expect(patch).toEqual({ paymentMethodId: null });
  });

  it('includes a new money snapshot only when it differs', () => {
    const changed: MoneySnapshot = { ...occurrence.money, amountMinor: 5000, baseAmountMinor: 5000 };

    expect(
      buildPatch({ parsed: parse(base), occurrence, transaction: tx, scope: 'one', money: changed }),
    ).toEqual({ money: changed });
  });

  it('sends a date move on scope one', () => {
    expect(patchFor({ date: d('2026-09-12') }, 'one')).toEqual({ date: '2026-09-12' });
  });

  it('DROPS a date move on a series-wide scope', () => {
    // The planner refuses `move_needs_single` outright. Sending it anyway would
    // turn a save into an error message for a field the form had disabled.
    expect(patchFor({ date: d('2026-09-12') }, 'all')).toEqual({});
  });

  it('sends a rule change on a series-wide scope', () => {
    expect(patchFor({ dayOfMonth: '5' }, 'future')).toEqual({
      recurrence: { type: 'monthly', dayOfMonth: 5 },
    });
  });

  it('DROPS a rule change on scope one', () => {
    expect(patchFor({ dayOfMonth: '5' }, 'one')).toEqual({});
  });

  it('never sends a rule change for an instalment plan', () => {
    /*
     * Changing the count would have to re-split the payments AND rewrite the
     * first-occurrence remainder override in step, or the plan stops summing to
     * its total. The UI shows the plan read-only; this is the backstop.
     */
    const plan = rent({ recurrence: { type: 'monthly', dayOfMonth: 10, installments: 6 } });
    const target = occurrenceOf(plan, [], '2026-03-10');
    const values = occurrenceToFormValues(target, plan);

    const patch = buildPatch({
      parsed: parse({ ...values, installmentCount: '3' }),
      occurrence: target,
      transaction: plan,
      scope: 'all',
      money: target.money,
    });

    expect(patch).not.toHaveProperty('recurrence');
  });

  it('combines several changes into one patch', () => {
    const changed: MoneySnapshot = { ...occurrence.money, amountMinor: 5000, baseAmountMinor: 5000 };
    const patch = buildPatch({
      parsed: parse({ ...base, note: 'new', categoryId: 'cat.rent' }),
      occurrence,
      transaction: tx,
      scope: 'one',
      money: changed,
    });

    expect(patch).toEqual({ money: changed, categoryId: 'cat.rent', note: 'new' });
  });
});
