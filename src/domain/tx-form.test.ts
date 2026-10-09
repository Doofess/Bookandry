import { describe, expect, it } from 'vitest';

import { creditSchedule } from '@/lib/money';

import { splitInstallments } from './calculators';
import { expandOccurrences } from './occurrences';
import { d, makeTx } from './test-factories';
import {
  chargesInterest,
  defaultFormValues,
  effectiveRate,
  isInstallmentMode,
  isPrimeLinked,
  defaultRecurringDay,
  firstOccurrenceDate,
  firstPartialPeriod,
  partialFirstOf,
  pastPayments,
  pastPaymentsOf,
  isLastDayChoice,
  lastInstallmentDate,
  MAX_INSTALLMENTS,
  MAX_LOAN_PAYMENTS,
  maxPaymentsFor,
  NOTE_MAX_LENGTH,
  planTotal,
  recurrenceDefaults,
  txFormSchema,
  type TxFormValues,
} from './tx-form';

const TODAY = d('2026-09-15');

function values(over: Partial<TxFormValues> = {}): TxFormValues {
  return {
    ...defaultFormValues({ profileId: 'p1', currency: 'ILS', today: TODAY }),
    categoryId: 'cat.groceries',
    amount: '45',
    ...over,
  };
}

/** Issue messages for one field, so a failure names the rule rather than a path. */
function issuesFor(input: TxFormValues, field: string): string[] {
  const result = txFormSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.filter((i) => i.path[0] === field).map((i) => i.message);
}

function parse(input: TxFormValues) {
  const result = txFormSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`expected a valid form, got: ${result.error.issues.map((i) => i.message).join(', ')}`);
  }
  return result.data;
}

describe('the amount field', () => {
  it('parses through the money layer, never a float', () => {
    // 1.005 is the canonical float trap: 1.005 * 100 is 100.49999999999999, so
    // a coercing schema stores 100 agorot for a shekel and a half.
    expect(parse(values({ amount: '1.005' })).amountMinor).toBe(101);
  });

  it('rounds a paste with more decimals than the currency has', () => {
    expect(parse(values({ amount: '1.2345', currency: 'JPY' })).amountMinor).toBe(1);
    expect(parse(values({ amount: '1.2345', currency: 'KWD' })).amountMinor).toBe(1235);
  });

  it('accepts a European-formatted paste', () => {
    expect(parse(values({ amount: '1.234,56' })).amountMinor).toBe(123_456);
  });

  it.each([
    ['', 'amount_required'],
    ['abc', 'amount_invalid'],
    ['0', 'amount_not_positive'],
    ['-5', 'amount_not_positive'],
  ])('rejects %s', (amount, message) => {
    expect(issuesFor(values({ amount }), 'amount')).toContain(message);
  });
});

describe('the note field', () => {
  it('counts graphemes, not UTF-16 units', () => {
    // 40 flag emoji: 40 characters to a person, 160 UTF-16 units. Rejecting
    // this by `.length` is inexplicable to whoever typed it.
    const flags = '\u{1F1EE}\u{1F1F1}'.repeat(40);

    expect(issuesFor(values({ note: flags }), 'note')).toEqual([]);
  });

  it('rejects past the limit', () => {
    expect(issuesFor(values({ note: 'x'.repeat(NOTE_MAX_LENGTH + 1) }), 'note')).toEqual(['note_too_long']);
  });

  it('is undefined rather than an empty string when blank', () => {
    // An empty string in the row would render as a blank second line in the
    // feed, reserving space for nothing.
    expect(parse(values({ note: '   ' })).note).toBeUndefined();
  });
});

describe('the payment method', () => {
  it('is kept for an expense', () => {
    expect(parse(values({ kind: 'expense', paymentMethodId: 'pm1' })).paymentMethodId).toBe('pm1');
  });

  it('is stripped from income rather than reported as an error', () => {
    // Toggling expense -> income leaves the old id behind. That is the form's
    // doing, not a mistake the user can see or correct.
    expect(parse(values({ kind: 'income', paymentMethodId: 'pm1' })).paymentMethodId).toBeUndefined();
  });

  it('is undefined when none was chosen', () => {
    expect(parse(values({ paymentMethodId: '' })).paymentMethodId).toBeUndefined();
  });
});

describe('recurrence', () => {
  it('defaults to one-time', () => {
    expect(parse(values()).recurrence).toEqual({ type: 'one_time' });
  });

  it('builds a monthly rule from the day field', () => {
    expect(parse(values({ mode: 'monthly', dayOfMonth: '10' })).recurrence).toEqual({
      type: 'monthly',
      dayOfMonth: 10,
    });
  });

  it('takes the yearly month and day from the date, not a second control', () => {
    expect(parse(values({ mode: 'yearly', date: d('2026-03-07') })).recurrence).toEqual({
      type: 'yearly',
      month: 3,
      day: 7,
    });
  });

  it('omits endDate entirely when open-ended', () => {
    // `endDate: undefined` and an absent key are the same to JS and different
    // to IndexedDB and to a JSON export diff.
    expect(parse(values({ mode: 'monthly' })).recurrence).not.toHaveProperty('endDate');
  });

  it('carries an end date through', () => {
    const parsed = parse(values({ mode: 'monthly', dayOfMonth: '10', endDate: '2027-03-10' }));

    expect(parsed.recurrence).toMatchObject({ endDate: '2027-03-10' });
  });

  it('rejects an end date before the start', () => {
    expect(issuesFor(values({ mode: 'monthly', endDate: '2020-01-01' }), 'endDate')).toEqual([
      'end_before_start',
    ]);
  });

  it('ignores an end date left over from another mode', () => {
    // תשלומים already ends after exactly N payments. A second bound could
    // contradict the count, and expansion would honour whichever came first.
    const parsed = parse(values({ mode: 'installments', installmentCount: '3', endDate: '2020-01-01' }));

    expect(parsed.recurrence).not.toHaveProperty('endDate');
  });

  it.each([
    ['0', 'day_out_of_range'],
    ['32', 'day_out_of_range'],
  ])('rejects day %s', (dayOfMonth, message) => {
    expect(issuesFor(values({ mode: 'monthly', dayOfMonth }), 'dayOfMonth')).toEqual([message]);
  });

  it('does not check the day in a mode that does not use it', () => {
    expect(issuesFor(values({ mode: 'one_time', dayOfMonth: '99' }), 'dayOfMonth')).toEqual([]);
  });
});

describe('תשלומים', () => {
  it('treats the entered amount as the TOTAL', () => {
    const parsed = parse(values({ mode: 'installments', amount: '1000', installmentCount: '3' }));

    expect(parsed.installmentTotalMinor).toBe(100_000);
    expect(parsed.recurrence).toMatchObject({ type: 'monthly', installments: 3 });
  });

  it('is undefined for every other mode', () => {
    expect(parse(values({ mode: 'monthly' })).installmentTotalMinor).toBeUndefined();
  });

  it.each([['1'], ['0'], [String(MAX_INSTALLMENTS + 1)], ['']])('rejects a count of %s', (count) => {
    expect(issuesFor(values({ mode: 'installments', installmentCount: count }), 'installmentCount')).toEqual([
      'installments_out_of_range',
    ]);
  });

  it('anchors the payment day on the purchase date', () => {
    const parsed = parse(
      values({ mode: 'installments', date: d('2026-09-20'), dayOfMonth: '5', installmentCount: '3' }),
    );

    /*
     * The day field is IGNORED here, deliberately.
     *
     * Expansion anchors monthly slots on the transaction date and emits
     * indices 0..N-1, dropping any that falls before the date itself. Payments
     * on the 5th of a plan bought on the 20th would lose index 0 - so the plan
     * would emit two payments instead of three, and their sum would no longer
     * equal the total. That is the single invariant תשלומים has.
     */
    expect(parsed.recurrence).toMatchObject({ dayOfMonth: 20 });
  });

  it.each([
    ['2026-09-20', 3],
    ['2026-01-31', 12],
    ['2026-02-28', 6],
    ['2026-09-15', 36],
  ])('emits exactly N payments from %s over %i', (date, count) => {
    const parsed = parse(values({ mode: 'installments', date: d(date), installmentCount: String(count) }));
    const tx = makeTx({ date: parsed.date, recurrence: parsed.recurrence });

    // Through the REAL expander, over a window wide enough to catch an extra
    // payment as well as a missing one.
    const emitted = expandOccurrences(tx, [], d('2020-01-01'), d('2035-01-01'), { today: TODAY });

    expect(emitted).toHaveLength(count);
  });

  it('sums to the total exactly, with the first payment absorbing the remainder', () => {
    const parsed = parse(values({ mode: 'installments', amount: '1000', installmentCount: '3' }));
    const payments = splitInstallments(parsed.installmentTotalMinor ?? 0, 3);

    expect(payments).toEqual([33_334, 33_333, 33_333]);
    expect(payments.reduce((a, b) => a + b, 0)).toBe(parsed.installmentTotalMinor);
  });
});

describe('firstOccurrenceDate', () => {
  it('is the date itself for a one-time row', () => {
    expect(firstOccurrenceDate(d('2026-09-15'), { type: 'one_time' })).toBe('2026-09-15');
  });

  it('moves forward to the chosen day within the same month', () => {
    // A bill dated the 5th, set to the last day of the month, first lands on
    // the 30th. Surfacing that under the control is the difference between a
    // rule and a surprise.
    expect(firstOccurrenceDate(d('2026-09-05'), { type: 'monthly', dayOfMonth: 31 })).toBe('2026-09-30');
  });

  it('rolls into next month when the day has already passed', () => {
    expect(firstOccurrenceDate(d('2026-09-20'), { type: 'monthly', dayOfMonth: 5 })).toBe('2026-10-05');
  });

  it('agrees with the expander', () => {
    const tx = makeTx({ date: d('2026-09-20'), recurrence: { type: 'monthly', dayOfMonth: 5 } });
    const emitted = expandOccurrences(tx, [], d('2026-01-01'), d('2027-01-01'), { today: TODAY });

    expect(emitted[0]?.date).toBe(firstOccurrenceDate(tx.date, tx.recurrence));
  });

  it('rolls a yearly rule into next year when its month has passed', () => {
    expect(firstOccurrenceDate(d('2026-09-15'), { type: 'yearly', month: 3, day: 1 })).toBe('2027-03-01');
  });

  it('clamps Feb 29 in a common year', () => {
    expect(firstOccurrenceDate(d('2026-01-01'), { type: 'yearly', month: 2, day: 29 })).toBe('2026-02-28');
  });
});

describe('lastInstallmentDate', () => {
  it('is the Nth payment, anchored on the purchase date', () => {
    expect(lastInstallmentDate(d('2026-09-20'), { type: 'monthly', dayOfMonth: 20, installments: 12 })).toBe(
      '2027-08-20',
    );
  });

  it('agrees with the expander on a clamping plan', () => {
    const recurrence = { type: 'monthly', dayOfMonth: 31, installments: 6 } as const;
    const tx = makeTx({ date: d('2026-01-31'), recurrence });
    const emitted = expandOccurrences(tx, [], d('2020-01-01'), d('2030-01-01'), { today: TODAY });

    expect(emitted.at(-1)?.date).toBe(lastInstallmentDate(tx.date, recurrence));
  });

  it('is undefined for an open-ended series', () => {
    expect(lastInstallmentDate(d('2026-09-20'), { type: 'monthly', dayOfMonth: 20 })).toBeUndefined();
  });
});

describe('the last-day-of-month default', () => {
  it('defaults a recurring bill to the last day', () => {
    // Rent, arnona and the va'ad all land there. Defaulting to whatever day
    // the form happened to be opened makes a series that is right once.
    expect(defaultRecurringDay()).toBe(31);
  });

  it('labels 31 as the last day', () => {
    expect(isLastDayChoice(31)).toBe(true);
    expect(isLastDayChoice(30)).toBe(false);
  });

  it('really does mean the last day, in every month length', () => {
    const tx = makeTx({ date: d('2026-01-31'), recurrence: { type: 'monthly', dayOfMonth: 31 } });
    const emitted = expandOccurrences(tx, [], d('2026-01-01'), d('2026-05-01'), { today: TODAY });

    // And returns to the 31st after February, rather than sticking at the 28th.
    expect(emitted.map((o) => o.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });
});

describe('defaultFormValues', () => {
  it('starts on today, as an expense, with no category chosen', () => {
    const initial = defaultFormValues({ profileId: 'p1', currency: 'ILS', today: TODAY });

    expect(initial).toMatchObject({ date: TODAY, kind: 'expense', categoryId: '', mode: 'one_time' });
  });

  it('takes the day from today so switching to monthly does not move the row', () => {
    expect(defaultFormValues({ profileId: 'p1', currency: 'ILS', today: TODAY }).dayOfMonth).toBe('15');
  });

  it('is not submittable as-is: a category and an amount are required', () => {
    const result = txFormSchema.safeParse(
      defaultFormValues({ profileId: 'p1', currency: 'ILS', today: TODAY }),
    );

    expect(result.success).toBe(false);
  });
});

describe('recurrenceDefaults', () => {
  const base = values({ date: d('2026-09-15'), dayOfMonth: '15' });

  it('defaults a monthly bill to the last day of the month', () => {
    // Rent, arnona, the va'ad and most הוראות קבע land there. Defaulting to
    // whatever day the form happened to be opened gives a series that is right
    // once and wrong every month after.
    expect(recurrenceDefaults('monthly', base)).toMatchObject({ dayOfMonth: '31' });
  });

  it('does not overwrite a day the user chose', () => {
    expect(recurrenceDefaults('monthly', { ...base, dayOfMonth: '10' })).toMatchObject({
      dayOfMonth: '10',
    });
  });

  it('restores the date own day when switching back to one-time', () => {
    // Toggling monthly and back must not quietly move the transaction.
    expect(recurrenceDefaults('one_time', { ...base, dayOfMonth: '31' })).toMatchObject({
      dayOfMonth: '15',
    });
  });

  it('anchors instalments on the purchase date and seeds a plausible count', () => {
    expect(recurrenceDefaults('installments', base)).toMatchObject({
      dayOfMonth: '15',
      installmentCount: '12',
    });
  });

  it('keeps a count the user already typed', () => {
    expect(recurrenceDefaults('installments', { ...base, installmentCount: '3' })).toMatchObject({
      installmentCount: '3',
    });
  });

  it('clears the instalment count outside that mode', () => {
    // A leftover count on a monthly rule would turn an open-ended bill into a
    // plan that silently stops after N payments.
    for (const mode of ['one_time', 'monthly', 'yearly'] as const) {
      expect(recurrenceDefaults(mode, { ...base, installmentCount: '12' })).toMatchObject({
        installmentCount: '',
      });
    }
  });

  it('clears an end date where the mode cannot express one', () => {
    expect(recurrenceDefaults('installments', { ...base, endDate: '2027-01-01' })).toMatchObject({
      endDate: '',
    });
  });

  it('survives a date field that is not a date', () => {
    // The field is a raw string until the schema validates it, and a change
    // handler must not throw inside `parseLocalDate`.
    expect(() => recurrenceDefaults('monthly', { ...base, date: 'nonsense' })).not.toThrow();
  });
});

describe('the expense type', () => {
  /*
   * An expense is described by WHAT IT IS, not by how often it repeats.
   *
   * The four types are the ones an Israeli already uses: עסקה רגילה, עסקת
   * תשלומים, עסקת קרדיט, הוראת קבע. Three of them collapse onto recurrence the
   * data model already had; the tests here are about the collapse being exact.
   */

  it('stores a קרדיט plan as an instalment series that says it is credit', () => {
    const parsed = parse(values({ mode: 'credit', amount: '1200', installmentCount: '6' }));

    expect(parsed.recurrence).toMatchObject({
      type: 'monthly',
      installments: 6,
      plan: 'credit',
    });
    // The entered amount is the TOTAL for both plans, which is what makes the
    // split mean anything.
    expect(parsed.installmentTotalMinor).toBe(120_000);
  });

  it('stores תשלומים as the same series, recorded as interest-free', () => {
    const parsed = parse(values({ mode: 'installments', amount: '1200', installmentCount: '6' }));

    expect(parsed.recurrence).toMatchObject({ type: 'monthly', installments: 6, plan: 'installments' });
    expect(parsed.installmentTotalMinor).toBe(120_000);
  });

  it('splits both plans identically when the קרדיט carries no rate', () => {
    // Only the interest differs, so with none the stored payments must be the
    // same either way. An empty rate is a real answer - an interest-free card -
    // not a missing one.
    const credit = parse(values({ mode: 'credit', amount: '1000', installmentCount: '3' }));
    const plain = parse(values({ mode: 'installments', amount: '1000', installmentCount: '3' }));

    expect(credit.installmentTotalMinor).toBe(plain.installmentTotalMinor);
    expect({ ...credit.recurrence, plan: undefined }).toEqual({ ...plain.recurrence, plan: undefined });
  });

  it('refuses a standing order that has not said monthly or yearly', () => {
    // The one field with no default. Monthly is likelier, and preselecting it
    // would still be wrong: arnona and most insurance are yearly.
    expect(issuesFor(values({ mode: 'standing_order', frequency: '' }), 'frequency')).toEqual([
      'frequency_required',
    ]);
  });

  it('stores a monthly standing order as monthly recurrence', () => {
    const parsed = parse(values({ mode: 'standing_order', frequency: 'monthly', dayOfMonth: '31' }));

    expect(parsed.recurrence).toEqual({ type: 'monthly', dayOfMonth: 31 });
  });

  it('stores a yearly standing order as yearly recurrence, anchored on the date', () => {
    const parsed = parse(values({ mode: 'standing_order', frequency: 'yearly', date: d('2026-03-01') }));

    expect(parsed.recurrence).toEqual({ type: 'yearly', month: 3, day: 1 });
  });

  it('lets a standing order end, and a plan not', () => {
    /*
     * תשלומים already ends after exactly N payments, so a second bound could
     * contradict the count and the two would disagree silently. A standing
     * order has no such bound, so an end date is the only way to stop it.
     */
    const ending = parse(
      values({
        mode: 'standing_order',
        frequency: 'monthly',
        dayOfMonth: '10',
        endDate: d('2027-03-10'),
      }),
    );
    expect(ending.recurrence).toMatchObject({ endDate: '2027-03-10' });

    const plan = parse(values({ mode: 'credit', installmentCount: '3', endDate: d('2027-03-10') }));
    expect(plan.recurrence).not.toHaveProperty('endDate');
  });

  it('keeps the payment count when the plan is reclassified', () => {
    // The two ask the same question. Clearing the answer because the user
    // decided it was קרדיט after all is the form being pedantic at somebody.
    const started = values({ mode: 'installments', installmentCount: '6' });
    const patch = recurrenceDefaults('credit', started);

    expect(patch.installmentCount).toBe('6');
    expect(patch.frequency).toBe('');
  });

  it('never carries a stale frequency out of standing order', () => {
    // Left behind, it would be read by nothing and mean nothing - until a
    // future branch checked it.
    const wasStanding = values({ mode: 'standing_order', frequency: 'yearly' });

    for (const mode of ['one_time', 'installments', 'credit', 'yearly'] as const) {
      expect(recurrenceDefaults(mode, wasStanding).frequency, mode).toBe('');
    }
  });
});

describe('עסקת קרדיט interest', () => {
  /*
   * ₪1,200 over 6 at 12% a year is 1% a month: six payments of ₪207.06. That
   * is the number the card will charge, so it is the number that is stored -
   * the purchase price is only what the user typed.
   */
  const credit = (over: Partial<TxFormValues> = {}) =>
    values({ mode: 'credit', amount: '1200', installmentCount: '6', annualRate: '12', ...over });

  it('stores what the plan will cost, not what was entered', () => {
    const parsed = parse(credit());

    expect(parsed.installmentTotalMinor).toBe(20_706 * 6);
    // The money snapshot carries the same total, because it is what gets split
    // and converted to the base currency. A snapshot left at ₪1,200 would put
    // the base amount in one unit and the payments in another.
    expect(parsed.amountMinor).toBe(20_706 * 6);
    expect(splitInstallments(parsed.installmentTotalMinor!, 6)).toEqual(Array(6).fill(20_706));
  });

  it('snapshots the rate onto the plan', () => {
    // Like an exchange rate: the card's rate can change next year and this
    // plan's payments cannot.
    expect(parse(credit({ annualRate: ' 12.5 ' })).recurrence).toMatchObject({
      plan: 'credit',
      creditAnnualRate: '12.5',
    });
  });

  it('leaves no rate on an interest-free plan', () => {
    expect(parse(credit({ annualRate: '' })).recurrence).not.toHaveProperty('creditAnnualRate');
    expect(parse(credit({ mode: 'installments' })).recurrence).not.toHaveProperty('creditAnnualRate');
  });

  it('prices a zero rate as exactly the purchase', () => {
    // Not payment × count: ₪1,000 over 3 at 0% is 333.33 × 3 = ₪999.99, and
    // the missing agora would surface as "−₪0.01 of interest".
    const parsed = parse(values({ mode: 'credit', amount: '1000', installmentCount: '3', annualRate: '0' }));
    expect(parsed.installmentTotalMinor).toBe(100_000);
  });

  it('ignores a rate on תשלומים', () => {
    // A stray rate on an interest-free plan must not price it. recurrenceDefaults
    // clears it on the way out of קרדיט; this is the backstop.
    const parsed = parse(credit({ mode: 'installments' }));
    expect(parsed.installmentTotalMinor).toBe(120_000);
  });

  it.each(['1.2.3', '.', '100.01', '1200'])('refuses %j as a rate', (annualRate) => {
    expect(issuesFor(credit({ annualRate }), 'annualRate')).toEqual(['rate_out_of_range']);
  });

  it.each(['0', '12', '12.', '.5', '100'])('accepts %j as a rate', (annualRate) => {
    expect(issuesFor(credit({ annualRate }), 'annualRate')).toEqual([]);
  });

  it('only checks the rate on a קרדיט plan', () => {
    // Anywhere else nothing reads it, so it cannot be wrong.
    expect(issuesFor(credit({ mode: 'installments', annualRate: '1.2.3' }), 'annualRate')).toEqual([]);
  });

  it('prices nothing until the plan is complete', () => {
    // Pricing a half-typed form answers a question nobody asked, and the
    // preview reads this: it must be quiet rather than wrong.
    expect(planTotal(credit({ amount: '' }))).toBeUndefined();
    expect(planTotal(credit({ amount: '0' }))).toBeUndefined();
    expect(planTotal(credit({ installmentCount: '' }))).toBeUndefined();
    expect(planTotal(credit({ installmentCount: String(MAX_INSTALLMENTS + 1) }))).toBeUndefined();
    expect(planTotal(credit({ annualRate: '1.2.3' }))).toBeUndefined();
    expect(planTotal(credit({ mode: 'one_time' }))).toBeUndefined();
  });

  it('clears the rate leaving קרדיט and keeps it entering', () => {
    // Entering, the sheet fills it from the card; a rate left behind on
    // תשלומים would be read by nothing.
    const wasCredit = credit();
    for (const mode of ['one_time', 'installments', 'standing_order', 'yearly', 'monthly'] as const) {
      expect(recurrenceDefaults(mode, wasCredit).annualRate, mode).toBe('');
    }
    expect(recurrenceDefaults('credit', wasCredit)).not.toHaveProperty('annualRate');
  });
});

describe('a loan', () => {
  /*
   * Money borrowed and paid back on a לוח שפיצר. ₪500,000 over 30 years at
   * 5% is ₪2,684.11 a month - the number the bank debits, so the number stored.
   */
  const loan = (over: Partial<TxFormValues> = {}) =>
    values({
      mode: 'loan',
      rateBasis: 'fixed',
      amount: '500000',
      installmentCount: '360',
      annualRate: '5',
      ...over,
    });

  it('stores the repayments, a plan that says it is a loan, and its rate', () => {
    const parsed = parse(loan());
    expect(parsed.installmentTotalMinor).toBe(268_411 * 360);
    expect(parsed.recurrence).toMatchObject({
      type: 'monthly',
      installments: 360,
      plan: 'loan',
      creditAnnualRate: '5',
    });
  });

  it('runs as long as a mortgage, and no longer', () => {
    expect(issuesFor(loan({ installmentCount: String(MAX_LOAN_PAYMENTS) }), 'installmentCount')).toEqual([]);
    expect(issuesFor(loan({ installmentCount: String(MAX_LOAN_PAYMENTS + 1) }), 'installmentCount')).toEqual([
      'installments_out_of_range',
    ]);
    // A card's plan keeps its own limit.
    expect(issuesFor(loan({ mode: 'credit', installmentCount: '61' }), 'installmentCount')).toEqual([
      'installments_out_of_range',
    ]);
    expect(planTotal(loan({ installmentCount: String(MAX_LOAN_PAYMENTS + 1) }))).toBeUndefined();
  });

  it('is the amount borrowed, split evenly, without interest', () => {
    // A loan from family: no rate, and the payments sum to what was borrowed.
    const parsed = parse(loan({ amount: '12000', installmentCount: '24', annualRate: '' }));
    expect(parsed.installmentTotalMinor).toBe(1_200_000);
    expect(parsed.recurrence).not.toHaveProperty('creditAnnualRate');
  });

  it('checks its rate', () => {
    expect(issuesFor(loan({ annualRate: '1.2.3' }), 'annualRate')).toEqual(['rate_out_of_range']);
  });

  it('keeps a rate across a switch from קרדיט, and lets it go leaving', () => {
    expect(recurrenceDefaults('loan', loan({ mode: 'credit' }))).not.toHaveProperty('annualRate');
    expect(recurrenceDefaults('installments', loan()).annualRate).toBe('');
  });

  it('is told apart by what can charge interest and how long it may run', () => {
    expect(chargesInterest('loan')).toBe(true);
    expect(chargesInterest('credit')).toBe(true);
    expect(chargesInterest('installments')).toBe(false);
    expect(maxPaymentsFor('loan')).toBe(MAX_LOAN_PAYMENTS);
    expect(maxPaymentsFor('installments')).toBe(MAX_INSTALLMENTS);
  });
});

describe('a loan at prime plus a margin', () => {
  /*
   * Prime is the Bank of Israel's 3.25 plus 1.5: 4.75. A loan at P+1.5 is
   * priced at 6.25%, which on ₪500,000 over 30 years is ₪3,078.59 a month.
   */
  const loan = (over: Partial<TxFormValues> = {}) =>
    values({
      mode: 'loan',
      amount: '500000',
      installmentCount: '360',
      primeRate: '4.75',
      primeMargin: '1.5',
      ...over,
    });

  it('is prime-linked unless said otherwise', () => {
    expect(isPrimeLinked(loan())).toBe(true);
    expect(isPrimeLinked(loan({ rateBasis: 'fixed' }))).toBe(false);
    expect(isPrimeLinked(loan({ mode: 'credit' }))).toBe(false);
  });

  it('prices at prime plus the margin, and keeps how', () => {
    const parsed = parse(loan());
    expect(parsed.installmentTotalMinor).toBe(307_859 * 360);
    expect(parsed.recurrence).toMatchObject({
      plan: 'loan',
      creditAnnualRate: '6.25',
      rateBasis: 'prime',
      primeMargin: '1.5',
    });
  });

  it('takes a margin below prime, and none at all', () => {
    expect(effectiveRate(loan({ primeMargin: '-0.5' }))).toBe('4.25');
    expect(parse(loan({ primeMargin: '-0.5' })).installmentTotalMinor).toBe(245_970 * 360);
    expect(effectiveRate(loan({ primeMargin: '' }))).toBe('4.75');
    expect(parse(loan({ primeMargin: '+2' })).recurrence).toMatchObject({ primeMargin: '2' });
  });

  it('never reads the typed rate on a prime-linked loan', () => {
    expect(effectiveRate(loan({ annualRate: '99' }))).toBe('6.25');
    expect(issuesFor(loan({ annualRate: '1.2.3' }), 'annualRate')).toEqual([]);
  });

  it('says what is wrong with the margin, beside the margin', () => {
    expect(issuesFor(loan({ primeMargin: '1.2.3' }), 'primeMargin')).toEqual(['margin_invalid']);
    // Prime minus more than prime is no rate at all.
    expect(issuesFor(loan({ primeMargin: '-5' }), 'primeMargin')).toEqual(['rate_out_of_range']);
    expect(planTotal(loan({ primeMargin: '-5' }))).toBeUndefined();
  });

  it('cannot be priced without prime', () => {
    expect(effectiveRate(loan({ primeRate: '' }))).toBeUndefined();
    expect(issuesFor(loan({ primeRate: '' }), 'primeMargin')).toEqual(['rate_out_of_range']);
  });

  it('has no rate at all outside the priced modes', () => {
    expect(effectiveRate(loan({ mode: 'installments' }))).toBe('');
    expect(effectiveRate(loan({ rateBasis: 'fixed', annualRate: '' }))).toBe('');
  });
});

describe('pastPayments', () => {
  const today = d('2026-10-04');

  it('counts the months a standing order started in the past has already paid', () => {
    expect(pastPayments(d('2025-11-01'), { type: 'monthly', dayOfMonth: 1 }, today)).toEqual({
      count: 12,
      first: '2025-11-01',
      last: '2026-10-01',
    });
  });

  it('starts at the first real payment and stops at an end date', () => {
    expect(
      pastPayments(d('2025-11-15'), { type: 'monthly', dayOfMonth: 31, endDate: d('2026-03-31') }, today),
    ).toEqual({ count: 5, first: '2025-11-30', last: '2026-03-31' });
  });

  it('counts years for a yearly one', () => {
    expect(pastPayments(d('2024-01-15'), { type: 'yearly', month: 1, day: 15 }, today)).toEqual({
      count: 3,
      first: '2024-01-15',
      last: '2026-01-15',
    });
  });

  it('has nothing to say about the future, today or a one-off', () => {
    expect(pastPayments(d('2026-11-01'), { type: 'monthly', dayOfMonth: 1 }, today)).toBeUndefined();
    expect(pastPayments(today, { type: 'monthly', dayOfMonth: 4 }, today)).toBeUndefined();
    expect(pastPayments(d('2025-11-01'), { type: 'one_time' }, today)).toBeUndefined();
  });

  it('counts a plan or a loan only as far as its own number of payments', () => {
    // A loan from November 2025: twelve repayments made of 360.
    expect(
      pastPayments(
        d('2025-11-01'),
        { type: 'monthly', dayOfMonth: 1, installments: 360, plan: 'loan' },
        today,
      ),
    ).toEqual({ count: 12, first: '2025-11-01', last: '2026-10-01' });
    // Six תשלומים from 2025, all of them behind it.
    expect(
      pastPayments(d('2025-01-10'), { type: 'monthly', dayOfMonth: 10, installments: 6 }, today),
    ).toEqual({ count: 6, first: '2025-01-10', last: '2025-06-10' });
  });

  it('says it for a loan on the form only once the count is a count', () => {
    const form = (installmentCount: string) =>
      pastPaymentsOf(
        values({ mode: 'loan', date: d('2025-11-01'), amount: '1000', installmentCount, annualRate: '' }),
        today,
      );
    expect(form('360')).toMatchObject({ count: 12 });
    expect(form('')).toBeUndefined();
    expect(form('361')).toBeUndefined();
  });
});

describe('the first month of a monthly rule that starts between billing days', () => {
  it('is the days left to the next billing day, out of that billing month', () => {
    // The example: billed on the 1st, started on 16 November - 15 of 30 days.
    expect(firstPartialPeriod(d('2025-11-16'), 1)).toEqual({
      days: 15,
      periodDays: 30,
      nextBilling: '2025-12-01',
    });
    // Billed on the 10th: the billing month runs 10 October to 10 November.
    expect(firstPartialPeriod(d('2025-10-25'), 10)).toEqual({
      days: 16,
      periodDays: 31,
      nextBilling: '2025-11-10',
    });
    // February is a short billing month.
    expect(firstPartialPeriod(d('2026-02-15'), 1)).toEqual({
      days: 14,
      periodDays: 28,
      nextBilling: '2026-03-01',
    });
  });

  it('is nothing when the first payment is itself a billing day', () => {
    expect(firstPartialPeriod(d('2025-12-01'), 1)).toBeUndefined();
    expect(firstPartialPeriod(d('2026-02-28'), 31)).toBeUndefined();
  });

  const form = {
    mode: 'standing_order' as const,
    frequency: 'monthly' as const,
    date: '2025-11-16',
    dayOfMonth: '1',
    amount: '300',
    currency: 'ILS',
    partialFirst: true,
  };

  it('charges 300 a month for 15 of 30 days as 150', () => {
    expect(partialFirstOf(form)).toEqual({
      amountMinor: 15000,
      days: 15,
      periodDays: 30,
      nextBilling: '2025-12-01',
    });
  });

  it('rounds to the agora, once', () => {
    // 100 x 16 / 31 = 51.6129...
    expect(
      partialFirstOf({ ...form, amount: '100', date: '2025-10-25', dayOfMonth: '10' })?.amountMinor,
    ).toBe(5161);
  });

  it('is off when turned off, yearly, unanswered, a plan, or a one-off', () => {
    expect(partialFirstOf({ ...form, partialFirst: false })).toBeUndefined();
    expect(partialFirstOf({ ...form, frequency: 'yearly' })).toBeUndefined();
    expect(partialFirstOf({ ...form, frequency: '' })).toBeUndefined();
    expect(partialFirstOf({ ...form, mode: 'installments' })).toBeUndefined();
    expect(partialFirstOf({ ...form, mode: 'one_time' })).toBeUndefined();
    expect(partialFirstOf({ ...form, amount: '' })).toBeUndefined();
  });
});

describe('קרדיט פלוס: long credit', () => {
  const long = (over: Partial<TxFormValues> = {}) =>
    values({
      mode: 'long_credit',
      amount: '3000',
      installmentCount: '24',
      annualRate: '15.5',
      primeRate: '4.75',
      ...over,
    });

  it('charges interest, as a plan of up to 36 payments', () => {
    expect(chargesInterest('long_credit')).toBe(true);
    expect(isInstallmentMode('long_credit')).toBe(true);
    expect(maxPaymentsFor('long_credit')).toBe(36);
    expect(issuesFor(long({ installmentCount: '36' }), 'installmentCount')).toEqual([]);
    expect(issuesFor(long({ installmentCount: '37' }), 'installmentCount')).toEqual([
      'installments_out_of_range',
    ]);
  });

  it('is stored as a קרדיט plan, so an older app reads it as one', () => {
    const parsed = parse(long());
    expect(parsed.recurrence).toEqual({
      type: 'monthly',
      dayOfMonth: 15,
      installments: 24,
      plan: 'credit',
      creditAnnualRate: '15.5',
    });
    expect(parsed.installmentTotalMinor).toBe(creditSchedule(300_000, '15.5', 24).totalMinor);
  });

  it('records prime at purchase where the card’s rate resets with it', () => {
    const parsed = parse(long({ resetAt: 19 }));
    expect(parsed.recurrence).toMatchObject({
      plan: 'credit',
      installments: 24,
      // And what it borrowed, so payment 19 is re-priced from the schedule shown.
      reset: { atPayment: 19, primeAtPurchase: '4.75', principalMinor: 300_000 },
    });
  });

  it('records no reset that cannot happen: no rate, no prime, or a plan that ends first', () => {
    expect(parse(long({ resetAt: 19, annualRate: '' })).recurrence).not.toHaveProperty('reset');
    expect(parse(long({ resetAt: 19, primeRate: '' })).recurrence).not.toHaveProperty('reset');
    expect(parse(long({ resetAt: 19, installmentCount: '18' })).recurrence).not.toHaveProperty('reset');
    // Not for an ordinary קרדיט, whatever a stale field says.
    expect(parse(long({ resetAt: 19, mode: 'credit' })).recurrence).not.toHaveProperty('reset');
  });

  it('starts at 19 payments, and keeps a count already in range', () => {
    expect(recurrenceDefaults('long_credit', values({ installmentCount: '' })).installmentCount).toBe('19');
    expect(recurrenceDefaults('long_credit', values({ installmentCount: '12' })).installmentCount).toBe('19');
    expect(recurrenceDefaults('long_credit', values({ installmentCount: '24' })).installmentCount).toBe('24');
    expect(recurrenceDefaults('long_credit', values({ installmentCount: '48' })).installmentCount).toBe('36');
    expect(recurrenceDefaults('long_credit', long())).not.toHaveProperty('annualRate');
  });
});

describe('30+: a deferred purchase', () => {
  const deferred = (over: Partial<TxFormValues> = {}) =>
    values({ mode: 'deferred', amount: '1000', annualRate: '15.5', ...over });

  it('is one charge, a month later, with a month of interest rounded once', () => {
    expect(chargesInterest('deferred')).toBe(true);
    expect(isInstallmentMode('deferred')).toBe(false);
    const parsed = parse(deferred());
    expect(parsed.recurrence).toEqual({ type: 'one_time' });
    // ₪1,000 × (1 + 15.5% / 12) = ₪1,012.9166…
    expect(parsed.amountMinor).toBe(101_292);
    expect(parsed.deferral).toEqual({ rate: '15.5' });
    expect(parsed.installmentTotalMinor).toBeUndefined();
  });

  it('snapshots a zero rate when none is entered', () => {
    const parsed = parse(deferred({ annualRate: '' }));
    expect(parsed.amountMinor).toBe(100_000);
    expect(parsed.deferral).toEqual({ rate: '0' });
  });

  it('refuses a rate that is not one', () => {
    expect(issuesFor(deferred({ annualRate: '1.2.3' }), 'annualRate')).toEqual(['rate_out_of_range']);
  });

  it('carries no deferral on anything else', () => {
    expect(parse(values()).deferral).toBeUndefined();
  });

  it('keeps the rate entering it, and asks for no count or end', () => {
    const next = recurrenceDefaults('deferred', values({ installmentCount: '12', endDate: '2027-01-01' }));
    expect(next).toMatchObject({ mode: 'deferred', installmentCount: '', endDate: '', frequency: '' });
    expect(next).not.toHaveProperty('annualRate');
    expect(recurrenceDefaults('one_time', deferred()).annualRate).toBe('');
  });
});

describe('where income went', () => {
  it('is kept for income', () => {
    expect(parse(values({ kind: 'income', destinationId: 'pm.cash' })).destinationId).toBe('pm.cash');
  });

  it('is stripped from an expense, which only says what paid for it', () => {
    // Switching income -> expense leaves the old destination behind; saving it
    // would count the expense as cash coming in, and a file would refuse it.
    expect(parse(values({ kind: 'expense', destinationId: 'pm.cash' })).destinationId).toBeUndefined();
  });

  it('is undefined when not assigned, and starts that way', () => {
    expect(defaultFormValues({ profileId: 'p1', currency: 'ILS', today: TODAY }).destinationId).toBe('');
    expect(parse(values({ kind: 'income', destinationId: '' })).destinationId).toBeUndefined();
  });

  it('is never confused with a payment method switching the other way', () => {
    const parsed = parse(values({ kind: 'income', paymentMethodId: 'pm.cash', destinationId: '' }));
    expect(parsed.paymentMethodId).toBeUndefined();
    expect(parsed.destinationId).toBeUndefined();
  });
});

describe('the business type', () => {
  it('is kept on an expense, with where it came from', () => {
    expect(parse(values({ mcc: '5411', mccSource: 'user' }))).toMatchObject({
      mcc: '5411',
      mccSource: 'user',
    });
  });

  it('is stripped from income: what switching an expense to income leaves behind (Review Focus 4)', () => {
    const parsed = parse(values({ kind: 'income', categoryId: 'cat.salary', mcc: '5411', mccSource: 'ai' }));
    expect(parsed.mcc).toBeUndefined();
    expect(parsed.mccSource).toBeUndefined();
  });

  it('is none when empty or not a code, and parses when a caller never set it', () => {
    expect(parse(values({ mcc: '', mccSource: 'ai' }))).toMatchObject({
      mcc: undefined,
      mccSource: undefined,
    });
    expect(parse(values({ mcc: '58', mccSource: 'ai' })).mcc).toBeUndefined();
    const { mcc: _code, mccSource: _source, ...older } = values();
    expect(parse(older).mcc).toBeUndefined();
  });

  it('keeps a code a later list added, so opening and saving a row does not erase it', () => {
    expect(parse(values({ mcc: '9999', mccSource: 'history' })).mcc).toBe('9999');
  });
});
