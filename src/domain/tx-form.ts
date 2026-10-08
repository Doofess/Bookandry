import { z } from 'zod';

import {
  addMonthsClamped,
  clampDay,
  compareLocal,
  daysBetween,
  isLocalDate,
  makeLocalDate,
  parseLocalDate,
} from '@/lib/dates';
import {
  addRates,
  creditSchedule,
  normalizeAnnualRate,
  normalizeRateMargin,
  prorateMinor,
  toMinor,
  withMonthOfInterest,
} from '@/lib/money';
import type { Recurrence } from '@/types/domain';
import type { Kind, LocalDate, Minor } from '@/types/money';

import { graphemeLength } from './validation';

/**
 * The add/edit form's schema, and the pure translation from what the user typed
 * into what the database stores.
 *
 * `z.input` and `z.output` are deliberately DIFFERENT types. Every field a
 * person types into is a string - an amount, a day of the month, a number of
 * payments - and the temptation is to have the form hold numbers and let the
 * input coerce. That fails in three specific ways this project has already
 * decided against elsewhere:
 *
 *  - `z.coerce.number()` on an amount accepts "12.5" and yields a float, which
 *    is the single defect the entire money layer exists to prevent.
 *  - A number-valued input cannot hold the intermediate states of typing. "3."
 *    and "" are both `NaN`, so the field fights the user mid-keystroke.
 *  - An empty numeric field coerces to 0, and 0 is a legitimate value for some
 *    of these fields but not others - so "untouched" and "zero" become
 *    indistinguishable exactly where it matters.
 *
 * So the input side is strings, the output side is parsed, and the boundary is
 * one `parse` call.
 */

/** The note truncates in the feed row rather than wrapping; this bounds it anyway. */
export const NOTE_MAX_LENGTH = 140;

/**
 * תשלומים bounds.
 *
 * One payment is a one-time purchase wearing a costume, and the UI offers that
 * separately; the upper bound is generous against Israeli cards, which commonly
 * go to 36 and occasionally beyond.
 */
export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 60;
/** A 30-year mortgage. */
export const MAX_LOAN_PAYMENTS = 360;
/**
 * קרדיט פלוס: long קרדיט runs 19 to 36 payments at every card company. The
 * card's own rule is checked as a warning (`dealWarnings`); 36 is the hard
 * ceiling, and 19 is where the form starts one.
 */
export const LONG_CREDIT_MIN = 19;
export const LONG_CREDIT_MAX = 36;

/** The sentinel day that means "the last day of whatever month this is". */
export const LAST_DAY_OF_MONTH = 31;

/**
 * Instalments are a MODE on the form, not a `Recurrence` variant.
 *
 * In the data model תשלומים is monthly recurrence carrying an `installments`
 * count, which is right for expansion. But the form asks two completely
 * different questions - "how much each month, until when" versus "what did it
 * cost in total, over how many payments" - and collapsing them into one control
 * is how users end up entering a 12,000 shekel total as a 12,000 shekel
 * monthly bill.
 */
/**
 * What the form is asking for, which is not the same list as the data model's.
 *
 * An EXPENSE is described by its type: a regular purchase, a תשלומים plan, a
 * קרדיט plan, or a הוראת קבע. The last of those is stored as ordinary monthly
 * or yearly recurrence - a standing order IS a repeating charge - so the mode
 * carries the user's word for it and `frequency` carries the shape.
 *
 * A הלוואה is the plans' shape again - N payments on a לוח שפיצר - for money
 * borrowed rather than spent, and so it asks for the amount borrowed.
 *
 * INCOME keeps the plain repeat vocabulary: a salary is monthly, and it is not
 * a standing order, which is a thing you set up to pay someone else.
 */
/*
 * A card linked to the catalog adds its own deals: `long_credit` (קרדיט
 * פלוס, 19-36 payments, stored as a קרדיט plan) and `deferred` (30+: one
 * charge on the billing date after next, with a month's interest).
 */
export type RecurrenceMode =
  | 'one_time'
  | 'monthly'
  | 'installments'
  | 'credit'
  | 'long_credit'
  | 'deferred'
  | 'loan'
  | 'standing_order'
  | 'yearly';

/** The plans and a loan split an amount the same way; only the interest differs. */
export function isInstallmentMode(mode: RecurrenceMode): boolean {
  return mode === 'installments' || mode === 'credit' || mode === 'long_credit' || mode === 'loan';
}

/** The modes priced with a rate: the card's credit deals, and a loan. */
export function chargesInterest(mode: RecurrenceMode): boolean {
  return mode === 'credit' || mode === 'long_credit' || mode === 'deferred' || mode === 'loan';
}

/** What a loan's interest follows: prime plus a margin, or a fixed rate. */
export type RateBasis = 'prime' | 'fixed';

type RateInputs = {
  readonly mode: RecurrenceMode;
  readonly annualRate: string;
  readonly rateBasis?: RateBasis;
  readonly primeMargin?: string;
  readonly primeRate?: string;
};

/**
 * Whether this is a loan whose interest is prime plus a margin - the usual
 * Israeli arrangement, and so the default for a loan.
 */
export function isPrimeLinked(values: RateInputs): boolean {
  return values.mode === 'loan' && (values.rateBasis ?? 'prime') === 'prime';
}

/**
 * The annual rate a plan is priced at: '' for none, undefined while it cannot
 * be worked out.
 *
 * For a prime-linked loan that is prime - the Bank of Israel's, never typed -
 * plus the margin the agreement adds (which may be negative: prime minus half
 * a point is an ordinary mortgage track). Otherwise it is the rate as typed.
 */
export function effectiveRate(values: RateInputs): string | undefined {
  if (!chargesInterest(values.mode)) return '';
  if (!isPrimeLinked(values)) {
    return values.annualRate.trim() === '' ? '' : normalizeAnnualRate(values.annualRate);
  }
  const margin = normalizeRateMargin(values.primeMargin ?? '');
  const prime = normalizeAnnualRate(values.primeRate ?? '');
  if (margin === undefined || prime === undefined) return undefined;
  // Below zero is not a rate any lender charges.
  return normalizeAnnualRate(addRates(prime, margin));
}

/** How many payments a plan may have: a card's plans stop at 60, a mortgage does not. */
export function maxPaymentsFor(mode: RecurrenceMode): number {
  if (mode === 'long_credit') return LONG_CREDIT_MAX;
  return mode === 'loan' ? MAX_LOAN_PAYMENTS : MAX_INSTALLMENTS;
}

/** Nothing is preselected: a standing order has to say which it is. */
export type StandingOrderFrequency = '' | 'monthly' | 'yearly';

const localDate = z.string().refine(isLocalDate, { message: 'invalid_date' });

const digits = (message: string) => z.string().regex(/^\d+$/, message);

/**
 * The raw form shape. `z.input<typeof txFormSchema>` is what react-hook-form
 * holds; `z.output<…>` is what `handleSubmit` receives.
 */
export const txFormSchema = z
  .object({
    profileId: z.string().min(1, 'profile_required'),
    kind: z.enum(['income', 'expense']),
    categoryId: z.string().min(1, 'category_required'),
    /** '' when none is chosen, and always '' for income. */
    paymentMethodId: z.string(),

    amount: z.string().min(1, 'amount_required'),
    currency: z.string().regex(/^[A-Z]{3}$/, 'currency_invalid'),
    date: localDate,
    note: z.string(),

    mode: z.enum([
      'one_time',
      'monthly',
      'installments',
      'credit',
      'long_credit',
      'deferred',
      'loan',
      'standing_order',
      'yearly',
    ]),
    /** Only read in the monthly, standing-order and instalment modes. */
    dayOfMonth: digits('day_invalid'),
    /** '' means open-ended. */
    endDate: z.string(),
    installmentCount: z.string(),
    /**
     * Standing orders only, and deliberately EMPTY by default.
     *
     * "Monthly" is the likelier answer and preselecting it would still be
     * wrong: arnona and most insurance are yearly, and a default that is right
     * most of the time is how the wrong one gets saved without being read. The
     * form refuses to submit until this is answered.
     */
    frequency: z.enum(['', 'monthly', 'yearly']),
    /**
     * The annual nominal rate for עסקת קרדיט, as typed.
     *
     * Prefilled from the CARD, because that is what it belongs to - it is on
     * the statement and it is the same for every קרדיט charged to it. Still
     * editable per purchase: a promotional rate on one item is ordinary, and a
     * field that cannot be corrected is a field people work around.
     *
     * '' means interest-free, which makes a קרדיט plan arithmetically identical
     * to תשלומים rather than an error.
     */
    annualRate: z.string(),
    /** A loan's interest: prime plus `primeMargin`, or the fixed `annualRate`. */
    rateBasis: z.enum(['prime', 'fixed']).default('prime'),
    /** What the loan adds to prime, as typed: "1.5", "-0.4", or '' for prime itself. */
    primeMargin: z.string().default(''),
    /**
     * Prime when the form was filled in, from the Bank of Israel (the sheet
     * supplies it; nobody types it). Here so the schema prices the loan with
     * the same figure the form showed.
     */
    primeRate: z.string().default(''),
    /**
     * A monthly rule whose first payment falls between two billing days pays
     * only for the days it covers first (`firstPartialPeriod`). Turned on when
     * a first payment is picked, and only ever offered, and applied, when the
     * dates actually leave a part-month.
     */
    partialFirst: z.boolean().default(false),
    /**
     * A long קרדיט whose card resets its rate with prime: the payment it
     * resets at (Max: 19). Set by the sheet from the card's rule, never typed;
     * saved with `primeRate` as prime at purchase.
     */
    resetAt: z.number().int().positive().optional(),
  })
  .superRefine((values, ctx) => {
    const amountMinor = parseAmount(values.amount, values.currency);
    if (amountMinor === undefined) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'amount_invalid' });
    } else if (amountMinor <= 0) {
      // The `amountMinor > 0` invariant: `kind` carries the sign, never the
      // number. A negative expense would subtract from the expense total.
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'amount_not_positive' });
    }

    if (graphemeLength(values.note.trim()) > NOTE_MAX_LENGTH) {
      // Graphemes, not `.length`: a note of emoji is half as long as UTF-16
      // claims, and rejecting it by code units is inexplicable to the person
      // who typed it.
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'note_too_long' });
    }

    const monthlyShaped =
      values.mode === 'monthly' ||
      isInstallmentMode(values.mode) ||
      (values.mode === 'standing_order' && values.frequency !== 'yearly');

    if (monthlyShaped) {
      const day = Number(values.dayOfMonth);
      if (day < 1 || day > LAST_DAY_OF_MONTH) {
        ctx.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'day_out_of_range' });
      }
    }

    // The one field with no default: a standing order that has not said
    // monthly or yearly is not a standing order yet.
    if (values.mode === 'standing_order' && values.frequency === '') {
      ctx.addIssue({ code: 'custom', path: ['frequency'], message: 'frequency_required' });
    }

    // An upper bound as well as a lower one: a mistyped "1200" is a plan whose
    // payments are absurd, and absurd is easier to catch here than in the feed
    // six months later.
    if (isPrimeLinked(values)) {
      // The margin is the only part typed, so it is where any problem is said.
      if (normalizeRateMargin(values.primeMargin) === undefined) {
        ctx.addIssue({ code: 'custom', path: ['primeMargin'], message: 'margin_invalid' });
      } else if (effectiveRate(values) === undefined) {
        ctx.addIssue({ code: 'custom', path: ['primeMargin'], message: 'rate_out_of_range' });
      }
    } else if (
      chargesInterest(values.mode) &&
      values.annualRate !== '' &&
      normalizeAnnualRate(values.annualRate) === undefined
    ) {
      ctx.addIssue({ code: 'custom', path: ['annualRate'], message: 'rate_out_of_range' });
    }

    if (isInstallmentMode(values.mode)) {
      const count = Number(values.installmentCount);
      if (
        !/^\d+$/.test(values.installmentCount) ||
        count < MIN_INSTALLMENTS ||
        count > maxPaymentsFor(values.mode)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['installmentCount'],
          message: 'installments_out_of_range',
        });
      }
    }

    /*
     * An end date is only offered for the open-ended modes.
     *
     * תשלומים already ends after exactly N payments, so a second end date
     * could contradict the count - and the two would disagree silently, with
     * expansion honouring whichever bound came first.
     */
    if (
      values.endDate !== '' &&
      (values.mode === 'monthly' || values.mode === 'yearly' || values.mode === 'standing_order')
    ) {
      if (!isLocalDate(values.endDate)) {
        ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'invalid_date' });
      } else if (isLocalDate(values.date) && compareLocal(values.endDate, values.date) < 0) {
        ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'end_before_start' });
      }
    }
  })
  .transform((values) => {
    const date = values.date;
    return {
      profileId: values.profileId,
      kind: values.kind satisfies Kind,
      categoryId: values.categoryId,
      /*
       * Income never carries a payment method.
       *
       * Stripped rather than rejected: a stale id here is what toggling
       * expense -> income leaves behind, which is the form's own doing and not
       * a mistake the user can see, let alone correct.
       */
      paymentMethodId:
        values.kind === 'expense' && values.paymentMethodId !== '' ? values.paymentMethodId : undefined,
      // The credit total, where there is one: the money snapshot is what gets
      // split into payments and converted to the base currency, so pricing the
      // plan anywhere later would leave the base amount denominated in the
      // purchase price while the payments were not.
      amountMinor:
        planTotal(values) ?? deferredTotal(values) ?? parseAmount(values.amount, values.currency) ?? 0,
      currency: values.currency,
      date,
      note: values.note.trim() === '' ? undefined : values.note.trim(),
      recurrence: toRecurrence(values, date),
      /**
       * The entered amount IS the total for תשלומים - that is the question the
       * form asked. `createTransaction` splits it so the payments sum to it
       * exactly, with the first absorbing the remainder.
       */
      /**
       * What the plan will actually COST, which is not what was entered.
       *
       * For תשלומים the two are the same: the payments sum to the purchase.
       * For קרדיט the issuer adds interest, so the amount stored per occurrence
       * has to be the לוח שפיצר payment - what the card will charge each month
       * - and the series total is that times the count. Entering ₪1,200 over 6
       * at 12% is six payments of ₪207.06, not of ₪200.
       */
      installmentTotalMinor: isInstallmentMode(values.mode) ? planTotal(values) : undefined,
      /** The one-off charge for the part-month before the first full payment, when there is one. */
      partialFirst: partialFirstOf(values),
      /** A 30+ purchase's rate, snapshotted: '0' when none was entered. */
      deferral: values.mode === 'deferred' ? { rate: deferralRate(values) } : undefined,
    };
  });

export type TxFormValues = z.input<typeof txFormSchema>;
export type TxFormParsed = z.output<typeof txFormSchema>;

function toRecurrence(
  values: {
    mode: RecurrenceMode;
    dayOfMonth: string;
    endDate: string;
    installmentCount: string;
    frequency: StandingOrderFrequency;
  } & RateInputs & { resetAt?: number | undefined },
  date: LocalDate,
): Recurrence {
  const endDate = isLocalDate(values.endDate) ? values.endDate : undefined;

  switch (values.mode) {
    case 'one_time':
    case 'deferred':
      // 30+ is one charge; when it is debited is the card's to say (`settleDate`).
      return { type: 'one_time' };

    case 'monthly':
      return {
        type: 'monthly',
        dayOfMonth: Number(values.dayOfMonth),
        ...(endDate === undefined ? {} : { endDate }),
      };

    case 'standing_order': {
      /*
       * Stored as plain recurrence, because that is what it is.
       *
       * A הוראת קבע is a repeating charge the bank makes on a schedule: the
       * word is the user's, the shape is monthly or yearly. A fourth
       * recurrence type for it would hand expansion, the chart and the
       * commitments list one more case each, all behaving identically.
       */
      if (values.frequency === 'yearly') {
        const { month, day } = parseLocalDate(date);
        return { type: 'yearly', month, day, ...(endDate === undefined ? {} : { endDate }) };
      }
      return {
        type: 'monthly',
        dayOfMonth: Number(values.dayOfMonth),
        ...(endDate === undefined ? {} : { endDate }),
      };
    }

    case 'credit':
    case 'loan':
    case 'installments':
      /*
       * The day comes from the purchase date, and is NOT user-settable here.
       *
       * Expansion anchors monthly slots on `tx.date` and emits indices 0..N-1,
       * dropping any slot that falls before the date itself. A plan bought on
       * the 20th with payments on the 5th therefore loses its index-0 slot and
       * emits N-1 payments - which silently breaks the one invariant תשלומים
       * has, that the payments sum to the total. Anchoring on the date's own
       * day makes index 0 land exactly on the date, so there are always N.
       */
      return {
        type: 'monthly',
        dayOfMonth: parseLocalDate(date).day,
        installments: Number(values.installmentCount),
        plan: values.mode,
        ...rateFields(values),
      };

    case 'long_credit': {
      /*
       * Stored as a קרדיט plan: an older app reads it as an ordinary fixed
       * קרדיט, which is right for every payment before the reset and close to
       * right after it. The reset, where the card has one, is what this
       * version adds - prime on the day, so payment 19 can be re-priced by how
       * far it has moved.
       */
      const count = Number(values.installmentCount);
      const priced = rateFields(values);
      const prime = normalizeAnnualRate(values.primeRate ?? '');
      const at = values.resetAt;
      const resets =
        at !== undefined && at <= count && priced.creditAnnualRate !== undefined && prime !== undefined;
      return {
        type: 'monthly',
        dayOfMonth: parseLocalDate(date).day,
        installments: count,
        plan: 'credit',
        ...priced,
        ...(resets ? { reset: { atPayment: at, primeAtPurchase: prime } } : {}),
      };
    }

    case 'yearly': {
      const { month, day } = parseLocalDate(date);
      return { type: 'yearly', month, day, ...(endDate === undefined ? {} : { endDate }) };
    }
  }
}

/**
 * What an instalment plan totals, priced.
 *
 * Returns undefined for anything that is not a plan, and for a plan whose
 * inputs are not yet valid - the schema reports those, and pricing a
 * half-typed form would be answering a question nobody asked.
 */
export function planTotal(
  values: {
    amount: string;
    currency: string;
    installmentCount: string;
  } & RateInputs,
): Minor | undefined {
  if (!isInstallmentMode(values.mode)) return undefined;

  const principal = parseAmount(values.amount, values.currency);
  if (principal === undefined || principal <= 0) return undefined;

  const count = Number(values.installmentCount);
  if (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > maxPaymentsFor(values.mode)) {
    return undefined;
  }

  const rate = effectiveRate(values);
  if (rate === undefined) return undefined;
  // תשלומים, or קרדיט or a loan at no interest: the payments sum to the amount.
  if (rate === '') return principal;

  return creditSchedule(principal, rate, count).totalMinor;
}

/** A 30+ purchase's rate as it is snapshotted: '0' for none entered. */
function deferralRate(values: RateInputs): string {
  const rate = effectiveRate(values);
  return rate === undefined || rate === '' ? '0' : rate;
}

/**
 * What a 30+ purchase is charged: the purchase and a month of interest,
 * rounded once. Undefined for anything else, or while it cannot be priced.
 */
function deferredTotal(values: { amount: string; currency: string } & RateInputs): Minor | undefined {
  if (values.mode !== 'deferred') return undefined;
  const principal = parseAmount(values.amount, values.currency);
  if (principal === undefined || principal <= 0) return undefined;
  const rate = effectiveRate(values);
  if (rate === undefined) return undefined;
  return rate === '' ? principal : withMonthOfInterest(principal, rate);
}

/**
 * The rate a plan keeps, snapshotted like an exchange rate: the card's rate
 * can change next year, and prime at the next decision, and this plan's
 * payments do not. A prime-linked loan also keeps HOW it was priced - the
 * margin over prime - so the row can say so.
 */
function rateFields(
  values: RateInputs,
): Pick<Extract<Recurrence, { type: 'monthly' }>, 'creditAnnualRate' | 'rateBasis' | 'primeMargin'> {
  const rate = effectiveRate(values);
  const priced = rate === undefined || rate === '' ? {} : { creditAnnualRate: rate };
  if (!isPrimeLinked(values)) return priced;
  return { ...priced, rateBasis: 'prime', primeMargin: normalizeRateMargin(values.primeMargin ?? '') ?? '0' };
}

function parseAmount(display: string, currency: string): Minor | undefined {
  if (display.trim() === '') return undefined;
  try {
    const minor = toMinor(display, currency);
    return Number.isSafeInteger(minor) ? minor : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The form's starting values.
 *
 * `dayOfMonth` defaults to the chosen date's own day, so switching a one-time
 * expense to monthly does not silently move it.
 */
export function defaultFormValues(input: {
  readonly profileId: string;
  readonly currency: string;
  readonly today: LocalDate;
  /** Prime today, for a loan priced on it. */
  readonly primeRate?: string;
}): TxFormValues {
  return {
    profileId: input.profileId,
    kind: 'expense',
    categoryId: '',
    paymentMethodId: '',
    amount: '',
    currency: input.currency,
    date: input.today,
    note: '',
    mode: 'one_time',
    dayOfMonth: String(parseLocalDate(input.today).day),
    endDate: '',
    installmentCount: '',
    frequency: '',
    annualRate: '',
    rateBasis: 'prime',
    primeMargin: '',
    primeRate: input.primeRate ?? '',
    // Off until a first payment is actually chosen (the sheet turns it on
    // then): today's date and the last-day default are not a person saying
    // "it started mid-month", and rent entered on the 4th is not a part-month.
    partialFirst: false,
  };
}

/**
 * Whether a day-of-month means "the last day".
 *
 * The non-sticky clamping already makes 31 behave as last-day - 31/28/31/30 -
 * but nobody will discover that, and everyone who picks 31 assumes it breaks
 * in February. The picker labels it, using this.
 */
export function isLastDayChoice(dayOfMonth: number): boolean {
  return dayOfMonth >= LAST_DAY_OF_MONTH;
}

/**
 * The default day for a recurring bill: the last day of the month.
 *
 * Rent, arnona, the va'ad and most הוראות קבע land there, and the alternative -
 * defaulting to whatever day the user happened to open the form - produces a
 * series that is right once and wrong every month after.
 */
export function defaultRecurringDay(): number {
  return LAST_DAY_OF_MONTH;
}

/**
 * The date of the first occurrence a series will actually emit.
 *
 * Shown under the recurrence controls, because the first slot is NOT always the
 * date in the picker: a bill dated the 5th and set to the last day of the month
 * first lands on the 30th. Deriving it here rather than leaving the user to
 * discover it in the feed is the difference between a rule and a surprise.
 */
export function firstOccurrenceDate(date: LocalDate, recurrence: Recurrence): LocalDate {
  if (recurrence.type === 'one_time') return date;

  if (recurrence.type === 'yearly') {
    const { year } = parseLocalDate(date);
    const here = yearlySlot(year, recurrence.month, recurrence.day);
    return compareLocal(here, date) >= 0 ? here : yearlySlot(year + 1, recurrence.month, recurrence.day);
  }

  // Anchored on `date`, exactly as monthlySlots does it - one clamping rule,
  // not two that must be kept in agreement.
  const slot = addMonthsClamped(date, 0, recurrence.dayOfMonth);
  return compareLocal(slot, date) >= 0 ? slot : addMonthsClamped(date, 1, recurrence.dayOfMonth);
}

/**
 * The payments a repeating rule that STARTS IN THE PAST has already made, up
 * to and including today: "11 payments, November 2025 to September 2026".
 *
 * Nothing is written for them - the rule produces every month from its start,
 * as it always has, and they appear in their months by themselves. This only
 * says so before saving, so starting a הוראת קבע a year back reads as filling
 * that year in rather than as a mistake.
 *
 * A plan or a loan counts too, up to its own number of payments: a mortgage
 * taken in 2020 has already made its first seventy-odd.
 */
export function pastPayments(
  date: LocalDate,
  recurrence: Recurrence,
  today: LocalDate,
): { readonly count: number; readonly first: LocalDate; readonly last: LocalDate } | undefined {
  if (recurrence.type === 'one_time') return undefined;
  // Starting today is not starting in the past: there is nothing behind it.
  if (compareLocal(date, today) >= 0) return undefined;
  const limit = recurrence.type === 'monthly' ? (recurrence.installments ?? Infinity) : Infinity;
  const until = recurrence.endDate !== undefined && recurrence.endDate < today ? recurrence.endDate : today;

  let count = 0;
  let first: LocalDate | undefined;
  let last: LocalDate | undefined;
  // Bounded: a rule started in 1900 still stops looking after a century of months.
  for (let k = 0; k < Math.min(1200, limit); k++) {
    const slot =
      recurrence.type === 'yearly'
        ? yearlySlot(parseLocalDate(date).year + k, recurrence.month, recurrence.day)
        : addMonthsClamped(date, k, recurrence.dayOfMonth);
    if (compareLocal(slot, date) < 0) continue;
    if (compareLocal(slot, until) > 0) break;
    first ??= slot;
    last = slot;
    count++;
  }
  return first === undefined || last === undefined ? undefined : { count, first, last };
}

/**
 * The part-month before a monthly rule's first full payment.
 *
 * A subscription taken on 16 November and billed on the 1st first charges for
 * 16-30 November: 15 of that billing month's 30 days, so ₪150 of ₪300, on the
 * day it starts. Measured against the billing month it falls in - from the
 * billing day before it to the one after - so a rule billed on the 10th
 * counts 10 October to 10 November, and a February one 28 or 29 days.
 *
 * Undefined when the first payment IS a billing day: there is no part-month.
 */
export function firstPartialPeriod(
  date: LocalDate,
  dayOfMonth: number,
): { readonly days: number; readonly periodDays: number; readonly nextBilling: LocalDate } | undefined {
  const nextBilling = firstOccurrenceDate(date, { type: 'monthly', dayOfMonth });
  if (nextBilling === date) return undefined;
  const previousBilling = addMonthsClamped(nextBilling, -1, dayOfMonth);
  return {
    days: daysBetween(date, nextBilling),
    periodDays: daysBetween(previousBilling, nextBilling),
    nextBilling,
  };
}

/**
 * The partial first charge the form will save alongside a monthly rule, or
 * undefined: a one-off, a yearly or open-ended-but-unanswered standing order, a
 * plan, a first payment that falls on a billing day, or the option turned off.
 */
export function partialFirstOf(values: {
  readonly mode: RecurrenceMode;
  readonly frequency: StandingOrderFrequency;
  readonly date: string;
  readonly dayOfMonth: string;
  readonly amount: string;
  readonly currency: string;
  readonly partialFirst: boolean;
}):
  | {
      readonly amountMinor: Minor;
      readonly days: number;
      readonly periodDays: number;
      readonly nextBilling: LocalDate;
    }
  | undefined {
  const monthly =
    values.mode === 'monthly' || (values.mode === 'standing_order' && values.frequency === 'monthly');
  if (!monthly || !values.partialFirst || !isLocalDate(values.date)) return undefined;
  const day = Number(values.dayOfMonth);
  if (!(day >= 1 && day <= LAST_DAY_OF_MONTH)) return undefined;
  const amountMinor = parseAmount(values.amount, values.currency);
  if (amountMinor === undefined || amountMinor <= 0) return undefined;
  const period = firstPartialPeriod(values.date, day);
  if (period === undefined) return undefined;
  return { amountMinor: prorateMinor(amountMinor, period.days, period.periodDays), ...period };
}

/**
 * `pastPayments` for the form as it stands, or undefined while it does not yet
 * describe a repeating rule: a one-off, a standing order whose frequency is
 * still unanswered, a plan whose count is not a count yet, a date or day still
 * being typed.
 */
export function pastPaymentsOf(values: TxFormValues, today: LocalDate): ReturnType<typeof pastPayments> {
  const repeating =
    values.mode === 'monthly' ||
    values.mode === 'yearly' ||
    (values.mode === 'standing_order' && values.frequency !== '');
  if (isInstallmentMode(values.mode)) {
    const count = Number(values.installmentCount);
    if (!isLocalDate(values.date) || !(count >= MIN_INSTALLMENTS && count <= maxPaymentsFor(values.mode))) {
      return undefined;
    }
    return pastPayments(values.date, toRecurrence(values, values.date), today);
  }
  if (!repeating || !isLocalDate(values.date)) return undefined;
  const day = Number(values.dayOfMonth);
  if (values.mode !== 'yearly' && values.frequency !== 'yearly' && !(day >= 1 && day <= LAST_DAY_OF_MONTH)) {
    return undefined;
  }
  return pastPayments(values.date, toRecurrence(values, values.date), today);
}

/**
 * The final payment of an instalment plan, for the "last payment July 2027" line.
 *
 * Anchored on `date`, like every index expansion produces - not chained off the
 * first slot, which would drift by a month the moment clamping moved one.
 */
export function lastInstallmentDate(date: LocalDate, recurrence: Recurrence): LocalDate | undefined {
  if (recurrence.type !== 'monthly' || recurrence.installments === undefined) return undefined;
  return addMonthsClamped(date, recurrence.installments - 1, recurrence.dayOfMonth);
}

function yearlySlot(year: number, month: number, day: number): LocalDate {
  return makeLocalDate(year, month, clampDay(year, month, day));
}

/**
 * Sensible values when the recurrence mode changes.
 *
 * Pure, and here rather than beside the controls so the component file exports
 * nothing but components - which is what lets Vite hot-swap it instead of
 * reloading the page, losing a half-filled form each time.
 *
 * A recurring bill defaults to the LAST day of the month: rent, arnona, the
 * va'ad and most הוראות קבע land there, and defaulting to whatever day the form
 * happened to be opened produces a series that is right once and wrong every
 * month after. Switching back to one-time restores the date's own day, so
 * toggling twice does not quietly move the row.
 */
export function recurrenceDefaults(mode: RecurrenceMode, values: TxFormValues): Partial<TxFormValues> {
  // The raw form value, so it may not be a date at all - the field is a
  // string until the schema says otherwise. Falling back to the 1st keeps this
  // total rather than throwing inside a change handler.
  const dayOfDate = isLocalDate(values.date) ? String(parseLocalDate(values.date).day) : '1';

  switch (mode) {
    case 'one_time':
      return {
        mode,
        dayOfMonth: dayOfDate,
        endDate: '',
        installmentCount: '',
        frequency: '',
        annualRate: '',
      };

    case 'deferred':
      // A one-off with a rate: the sheet fills in the card's.
      return { mode, dayOfMonth: dayOfDate, endDate: '', installmentCount: '', frequency: '' };

    case 'long_credit': {
      // Into the deal's range: a קרדיט's 12 is not one, and 48 is past it.
      const count = Number(values.installmentCount);
      const installmentCount =
        values.installmentCount === '' || !(count >= LONG_CREDIT_MIN)
          ? String(LONG_CREDIT_MIN)
          : count > LONG_CREDIT_MAX
            ? String(LONG_CREDIT_MAX)
            : values.installmentCount;
      return { mode, dayOfMonth: dayOfDate, endDate: '', installmentCount, frequency: '' };
    }

    case 'monthly':
      return {
        mode,
        // Only impose the last-day default if the user has not already chosen a
        // day: overwriting a deliberate 10th on every toggle would be worse
        // than having no default at all.
        dayOfMonth: values.dayOfMonth === dayOfDate ? String(defaultRecurringDay()) : values.dayOfMonth,
        installmentCount: '',
        annualRate: '',
      };

    case 'credit':
    case 'loan':
    case 'installments':
      return {
        mode,
        dayOfMonth: dayOfDate,
        endDate: '',
        // Kept across a switch between the two plans: they ask the same
        // question, and re-typing "12" because you reclassified the purchase
        // is the form being pedantic at somebody.
        installmentCount: values.installmentCount === '' ? '12' : values.installmentCount,
        frequency: '',
        // Cleared leaving credit, kept entering it: the sheet fills it from the
        // chosen card, and a rate left behind on a תשלומים plan would be read
        // by nothing and mean nothing.
        // A loan keeps one too: its rate is typed, and switching between the
        // two priced modes is a reclassification, not a new rate.
        ...(chargesInterest(mode) ? {} : { annualRate: '' }),
      };

    case 'standing_order':
      return {
        mode,
        // Blank, every time. See the schema: the point is that it gets
        // answered rather than accepted.
        frequency: '',
        dayOfMonth: values.dayOfMonth === dayOfDate ? String(defaultRecurringDay()) : values.dayOfMonth,
        installmentCount: '',
        annualRate: '',
      };

    case 'yearly':
      return { mode, installmentCount: '', frequency: '', annualRate: '' };
  }
}
