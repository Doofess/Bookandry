import { z } from 'zod';

import {
  addMonthsClamped,
  clampDay,
  compareLocal,
  isLocalDate,
  makeLocalDate,
  parseLocalDate,
} from '@/lib/dates';
import { creditSchedule, normalizeAnnualRate, toMinor } from '@/lib/money';
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
 * INCOME keeps the plain repeat vocabulary: a salary is monthly, and it is not
 * a standing order, which is a thing you set up to pay someone else.
 */
export type RecurrenceMode = 'one_time' | 'monthly' | 'installments' | 'credit' | 'standing_order' | 'yearly';

/** Both plans split a purchase the same way; only the interest differs. */
export function isInstallmentMode(mode: RecurrenceMode): boolean {
  return mode === 'installments' || mode === 'credit';
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

    mode: z.enum(['one_time', 'monthly', 'installments', 'credit', 'standing_order', 'yearly']),
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
    if (
      values.mode === 'credit' &&
      values.annualRate !== '' &&
      normalizeAnnualRate(values.annualRate) === undefined
    ) {
      ctx.addIssue({ code: 'custom', path: ['annualRate'], message: 'rate_out_of_range' });
    }

    if (isInstallmentMode(values.mode)) {
      const count = Number(values.installmentCount);
      if (!/^\d+$/.test(values.installmentCount) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) {
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
      amountMinor: planTotal(values) ?? parseAmount(values.amount, values.currency) ?? 0,
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
    annualRate: string;
  },
  date: LocalDate,
): Recurrence {
  const endDate = isLocalDate(values.endDate) ? values.endDate : undefined;

  switch (values.mode) {
    case 'one_time':
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
        plan: values.mode === 'credit' ? 'credit' : 'installments',
        // Snapshotted, like an exchange rate: the card's rate can change next
        // year and this plan's payments cannot.
        ...(values.mode === 'credit' && values.annualRate !== ''
          ? { creditAnnualRate: values.annualRate.trim() }
          : {}),
      };

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
export function planTotal(values: {
  mode: RecurrenceMode;
  amount: string;
  currency: string;
  installmentCount: string;
  annualRate: string;
}): Minor | undefined {
  if (!isInstallmentMode(values.mode)) return undefined;

  const principal = parseAmount(values.amount, values.currency);
  if (principal === undefined || principal <= 0) return undefined;

  const count = Number(values.installmentCount);
  if (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) return undefined;

  // תשלומים, or קרדיט at no interest: the payments sum to the purchase.
  if (values.mode !== 'credit' || values.annualRate === '') return principal;

  const rate = normalizeAnnualRate(values.annualRate);
  if (rate === undefined) return undefined;

  return creditSchedule(principal, rate, count).totalMinor;
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
        ...(mode === 'credit' ? {} : { annualRate: '' }),
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
