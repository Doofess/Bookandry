import { describe, expect, it } from 'vitest';

import {
  SHARED_OWNER,
  type Occurrence,
  type Override,
  type PaymentMethod,
  type Transaction,
} from '@/types/domain';
import type { IsoInstant, MoneySnapshot } from '@/types/money';

import { expandOccurrences } from './occurrences';
import { d, makeTx, modify, MONEY } from './test-factories';
import {
  buildPatch,
  duplicateFormValues,
  isEmptyPatch,
  isInstallmentPlan,
  frequencyOf,
  occurrenceToFormValues,
  recurrenceModeOf,
  scopeAllowsMove,
  scopeAllowsRecurrence,
} from './tx-edit';
import { defaultFormValues, txFormSchema, type TxFormValues } from './tx-form';

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
  /*
   * The same stored recurrence, described by two vocabularies.
   *
   * An expense that repeats monthly is a הוראת קבע - that is what an Israeli
   * calls the arrangement, and it is what the form asks for. Income that
   * arrives monthly is a salary, and calling it a standing order would be
   * wrong in the ordinary sense of the words: a standing order is something
   * you set up to pay somebody else.
   */
  it.each([
    [{ type: 'one_time' } as const, 'expense', 'one_time'],
    [{ type: 'one_time' } as const, 'income', 'one_time'],
    [{ type: 'monthly', dayOfMonth: 10 } as const, 'expense', 'standing_order'],
    [{ type: 'monthly', dayOfMonth: 10 } as const, 'income', 'monthly'],
    [{ type: 'yearly', month: 3, day: 1 } as const, 'expense', 'standing_order'],
    [{ type: 'yearly', month: 3, day: 1 } as const, 'income', 'yearly'],
    [{ type: 'monthly', dayOfMonth: 10, installments: 3 } as const, 'expense', 'installments'],
    [{ type: 'monthly', dayOfMonth: 10, installments: 3, plan: 'credit' } as const, 'expense', 'credit'],
    [{ type: 'monthly', dayOfMonth: 10, installments: 120, plan: 'loan' } as const, 'expense', 'loan'],
  ])('reads %o on %s as %s', (recurrence, kind, expected) => {
    expect(recurrenceModeOf(recurrence, kind as 'expense' | 'income')).toBe(expected);
  });

  it('reads a plan with no recorded kind as תשלומים', () => {
    // Rows written before קרדיט existed could not have been anything else: the
    // form had one plan, and it was the interest-free one.
    expect(recurrenceModeOf({ type: 'monthly', dayOfMonth: 10, installments: 3 })).toBe('installments');
  });

  it('reports the frequency a standing order was stored with', () => {
    expect(frequencyOf({ type: 'monthly', dayOfMonth: 10 }, 'expense')).toBe('monthly');
    expect(frequencyOf({ type: 'yearly', month: 3, day: 1 }, 'expense')).toBe('yearly');
    // Not a standing order at all, so there is no frequency to report.
    expect(frequencyOf({ type: 'monthly', dayOfMonth: 10 }, 'income')).toBe('');
    expect(frequencyOf({ type: 'one_time' }, 'expense')).toBe('');
    expect(frequencyOf({ type: 'monthly', dayOfMonth: 10, installments: 3 }, 'expense')).toBe('');
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
      // An expense on a monthly rule IS a standing order, and the form opens
      // on the control the user would have created it with.
      mode: 'standing_order',
      frequency: 'monthly',
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

  it('never re-prices a קרדיט plan that is only being corrected', () => {
    /*
     * The amount field of a saved plan holds ONE PAYMENT. Handing the schema
     * the plan's rate as well would treat ₪207.06 as a purchase and add the
     * interest again - so fixing the note on one payment would save it as
     * six times itself.
     */
    const plan = rent({
      recurrence: {
        type: 'monthly',
        dayOfMonth: 10,
        installments: 6,
        plan: 'credit',
        creditAnnualRate: '12',
      },
      money: {
        ...MONEY,
        amountMinor: 20_706,
        baseAmountMinor: 20_706,
        currency: 'ILS',
        baseCurrency: 'ILS',
        rateUsed: '1',
      },
    });
    const target = occurrenceOf(plan, [], '2026-05-10');
    const values = occurrenceToFormValues(target, plan);

    expect(values).toMatchObject({ mode: 'credit', amount: '207.06', annualRate: '' });

    const parsed = parse({ ...values, note: 'fixed' });
    expect(parsed.amountMinor).toBe(20_706);

    const patch = buildPatch({
      parsed,
      occurrence: target,
      transaction: plan,
      scope: 'one',
      money: target.money,
    });
    expect(patch).toEqual({ note: 'fixed' });
  });

  it('keeps unknown plan fields when an edit keeps the plan kind', () => {
    const future = rent({
      recurrence: {
        type: 'monthly',
        dayOfMonth: 10,
        reset: { every: 3 },
      } as unknown as Transaction['recurrence'],
    });
    const target = occurrenceOf(future, [], '2026-09-10');
    const values = occurrenceToFormValues(target, future);
    const patch = buildPatch({
      parsed: parse({ ...values, dayOfMonth: '12' }),
      occurrence: target,
      transaction: future,
      scope: 'all',
      money: target.money,
    });
    expect(patch.recurrence).toMatchObject({ type: 'monthly', dayOfMonth: 12, reset: { every: 3 } });
  });

  it('does not carry unknown plan fields into a different kind of recurrence', () => {
    const future = rent({
      recurrence: {
        type: 'monthly',
        dayOfMonth: 10,
        reset: { every: 3 },
      } as unknown as Transaction['recurrence'],
    });
    const target = occurrenceOf(future, [], '2026-09-10');
    const values = occurrenceToFormValues(target, future);
    const patch = buildPatch({
      parsed: parse({ ...values, mode: 'one_time' }),
      occurrence: target,
      transaction: future,
      scope: 'all',
      money: target.money,
    });
    expect(patch.recurrence).toEqual({ type: 'one_time' });
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

describe('long credit and 30+ rows, and rows from before them', () => {
  const plan = (reset?: { atPayment: number; primeAtPurchase: string }) =>
    makeTx({
      id: 'plus',
      date: d('2026-10-08'),
      recurrence: {
        type: 'monthly',
        dayOfMonth: 8,
        installments: 24,
        plan: 'credit',
        creditAnnualRate: '15.5',
        ...(reset === undefined ? {} : { reset }),
      },
    });

  it('opens a long credit, reset or not, as the קרדיט plan it is stored as - read-only, unchanged', () => {
    for (const tx of [plan(), plan({ atPayment: 19, primeAtPurchase: '4.75' })]) {
      expect(recurrenceModeOf(tx.recurrence)).toBe('credit');
      expect(isInstallmentPlan(tx.recurrence)).toBe(true);
      const occurrence = occurrenceOf(tx, [], '2026-10-08');
      expect(occurrenceToFormValues(occurrence, tx)).toMatchObject({
        mode: 'credit',
        installmentCount: '24',
      });
    }
  });

  it('keeps a 30+ purchase’s deferral through an edit of its note, and adds none to an old row', () => {
    const deferred = makeTx({
      id: 'later',
      date: d('2026-10-08'),
      recurrence: { type: 'one_time' },
      deferral: { rate: '15.5' },
    });
    const old = makeTx({ id: 'old', date: d('2026-10-08'), recurrence: { type: 'one_time' } });
    for (const tx of [deferred, old]) {
      const occurrence = occurrenceOf(tx, [], '2026-10-08');
      const form = occurrenceToFormValues(occurrence, tx);
      expect(form.mode).toBe('one_time');
      const patch = buildPatch({
        parsed: parse({ ...form, note: 'tv' }),
        occurrence,
        transaction: tx,
        scope: 'all',
        money: occurrence.money,
      });
      // Only the note: nothing that would drop, or add, a deferral.
      expect(patch).toEqual({ note: 'tv' });
    }
  });
});

describe('duplicateFormValues', () => {
  const NOW = '2026-01-01T00:00:00.000Z' as IsoInstant;
  const card = (id: string, profileId: string): PaymentMethod => ({
    id,
    profileId,
    type: 'credit_card',
    label: id,
    isArchived: 0,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const profiles = [{ id: 'p1' }, { id: 'p2' }];
  const base = (profileId = 'p1') =>
    defaultFormValues({ profileId, currency: 'ILS', today: d('2026-10-08') });

  it('copies what the row says, dated today and one-time, whatever the source was', () => {
    const plan = makeTx({
      id: 'sofa',
      date: d('2026-03-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10, installments: 12 },
      note: 'Sofa',
      paymentMethodId: 'card-1',
    });
    const occurrence = occurrenceOf(plan, [], '2026-09-10');

    expect(
      duplicateFormValues(occurrence, plan, base('p2'), d('2026-10-08'), {
        profiles,
        methods: [card('card-1', 'p1')],
      }),
    ).toMatchObject({
      profileId: 'p1',
      kind: plan.kind,
      categoryId: occurrence.categoryId,
      amount: occurrenceToFormValues(occurrence, plan).amount,
      currency: occurrence.money.currency,
      paymentMethodId: 'card-1',
      note: 'Sofa',
      date: '2026-10-08',
      mode: 'one_time',
      installmentCount: '',
    });
  });

  it('copies an occurrence’s own edits, not the series’', () => {
    const patched: MoneySnapshot = { ...MONEY, amountMinor: 9900, currency: 'ILS', baseCurrency: 'ILS' };
    const override = modify('rent', d('2026-09-10'), { money: patched, note: 'with the fee' });
    const tx = rent({}, [override]);

    expect(
      duplicateFormValues(occurrenceOf(tx, [override], '2026-09-10'), tx, base(), d('2026-10-08'), {
        profiles,
        methods: [],
      }),
    ).toMatchObject({ amount: '99.00', note: 'with the fee', date: '2026-10-08', mode: 'one_time' });
  });

  it('keeps the row’s person, and so their own card, whoever the form would have started on', () => {
    // Viewing p1 (or everyone, where the form starts on the person signed in).
    const tx = rent({ profileId: 'p2', paymentMethodId: 'dana-card' });

    expect(
      duplicateFormValues(occurrenceOf(tx, [], '2026-09-10'), tx, base('p1'), d('2026-10-08'), {
        profiles,
        methods: [card('dana-card', 'p2')],
      }),
    ).toMatchObject({ profileId: 'p2', paymentMethodId: 'dana-card' });
  });

  it('drops a card the person it starts on cannot pay with, never keeping one the picker cannot show', () => {
    // p2 has since been removed: the form starts on p1, and p2's card is not p1's.
    const tx = rent({ profileId: 'p2', paymentMethodId: 'dana-card' });

    expect(
      duplicateFormValues(occurrenceOf(tx, [], '2026-09-10'), tx, base('p1'), d('2026-10-08'), {
        profiles: [{ id: 'p1' }],
        methods: [card('dana-card', 'p2')],
      }),
    ).toMatchObject({ profileId: 'p1', paymentMethodId: '' });
  });

  it('keeps a household card for anyone, and drops one that no longer exists', () => {
    const shared = rent({ profileId: 'p2', paymentMethodId: 'house' });
    const gone = rent({ profileId: 'p2', paymentMethodId: 'deleted' });
    const owners = { profiles: [{ id: 'p1' }], methods: [card('house', SHARED_OWNER)] };

    expect(
      duplicateFormValues(occurrenceOf(shared, [], '2026-09-10'), shared, base('p1'), d('2026-10-08'), owners)
        .paymentMethodId,
    ).toBe('house');
    expect(
      duplicateFormValues(occurrenceOf(gone, [], '2026-09-10'), gone, base('p1'), d('2026-10-08'), owners)
        .paymentMethodId,
    ).toBe('');
  });
});

describe('where income went, in the edit form', () => {
  const salary = (over: Partial<Transaction> = {}, overrides: readonly Override[] = []) =>
    rent({ kind: 'income', categoryId: 'cat.salary', destinationId: 'Leumi', ...over }, overrides);

  it('opens on the occurrence’s own destination', () => {
    const toCash = modify('rent', d('2026-09-10'), { destinationId: 'pm.cash' });
    const tx = salary({}, [toCash]);
    expect(occurrenceToFormValues(occurrenceOf(tx, [toCash], '2026-09-10'), tx).destinationId).toBe(
      'pm.cash',
    );
    expect(occurrenceToFormValues(occurrenceOf(tx, [toCash], '2026-08-10'), tx).destinationId).toBe('Leumi');
    const none = rent();
    expect(occurrenceToFormValues(occurrenceOf(none, [], '2026-09-10'), none).destinationId).toBe('');
  });

  it('patches it only when it changed, and clears it with null', () => {
    const tx = salary();
    const occurrence = occurrenceOf(tx, [], '2026-09-10');
    const base = occurrenceToFormValues(occurrence, tx);
    const patchFor = (destinationId: string) =>
      buildPatch({
        parsed: parse({ ...base, destinationId }),
        occurrence,
        transaction: tx,
        scope: 'one',
        money: occurrence.money,
      });

    expect(isEmptyPatch(patchFor('Leumi'))).toBe(true);
    expect(patchFor('pm.cash')).toEqual({ destinationId: 'pm.cash' });
    expect(patchFor('')).toEqual({ destinationId: null });
  });

  it('clears it when an income becomes an expense', () => {
    const tx = salary();
    const occurrence = occurrenceOf(tx, [], '2026-09-10');
    const base = occurrenceToFormValues(occurrence, tx);
    const patch = buildPatch({
      parsed: parse({ ...base, kind: 'expense', destinationId: 'Leumi' }),
      occurrence,
      transaction: tx,
      scope: 'one',
      money: occurrence.money,
    });
    expect(patch.destinationId).toBeNull();
  });

  it('keeps it on a duplicate the person can use, and drops it otherwise', () => {
    const NOW = '2026-01-01T00:00:00.000Z' as IsoInstant;
    const account = (id: string, profileId: string): PaymentMethod => ({
      id,
      profileId,
      type: 'bank_account',
      label: id,
      account: { bank: '10', holding: 'personal' },
      isArchived: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const tx = salary({ profileId: 'p2', destinationId: 'yossi-bank' });
    const occurrence = occurrenceOf(tx, [], '2026-09-10');
    const base = defaultFormValues({ profileId: 'p1', currency: 'ILS', today: d('2026-10-08') });
    const methods = [account('yossi-bank', 'p2')];

    expect(
      duplicateFormValues(occurrence, tx, base, d('2026-10-08'), {
        profiles: [{ id: 'p1' }, { id: 'p2' }],
        methods,
      }).destinationId,
    ).toBe('yossi-bank');
    expect(
      duplicateFormValues(occurrence, tx, base, d('2026-10-08'), { profiles: [{ id: 'p1' }], methods })
        .destinationId,
    ).toBe('');
  });
});

describe('the business type, in the edit form', () => {
  const tx = rent({ mcc: '6513', mccSource: 'ai' });
  const occurrence = occurrenceOf(tx, [], '2026-09-10');
  const base = occurrenceToFormValues(occurrence, tx);
  const patchFor = (over: Partial<TxFormValues>) =>
    buildPatch({
      parsed: parse({ ...base, ...over }),
      occurrence,
      transaction: tx,
      scope: 'one',
      money: occurrence.money,
    });

  it('opens with the series’ business type, and an unchanged one is no change', () => {
    expect(base).toMatchObject({ mcc: '6513', mccSource: 'ai' });
    expect(isEmptyPatch(patchFor({}))).toBe(true);
  });

  it('names a new business type, a new source, or a cleared one', () => {
    expect(patchFor({ mcc: '7011', mccSource: 'user' })).toEqual({ mcc: '7011', mccSource: 'user' });
    expect(patchFor({ mccSource: 'user' })).toEqual({ mcc: '6513', mccSource: 'user' });
    expect(patchFor({ mcc: '', mccSource: '' })).toEqual({ mcc: null, mccSource: null });
  });

  it('opens a row from before business types with none', () => {
    expect(occurrenceToFormValues(occurrenceOf(rent(), [], '2026-09-10'), rent())).toMatchObject({
      mcc: '',
      mccSource: '',
    });
  });

  it('is carried into a duplicate, which is another purchase from the same business', () => {
    const copy = duplicateFormValues(
      occurrence,
      tx,
      defaultFormValues({ profileId: 'p1', currency: 'ILS', today: TODAY }),
      TODAY,
      { profiles: [{ id: 'p1' }], methods: [] },
    );
    expect(copy).toMatchObject({ mcc: '6513', mccSource: 'ai' });
  });
});
