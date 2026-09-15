import { z } from 'zod';

import {
  addMonthsClamped,
  clampDay,
  compareLocal,
  isLocalDate,
  makeLocalDate,
  parseLocalDate,
} from '@/lib/dates';
import { toMinor } from '@/lib/money';
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
export type RecurrenceMode = 'one_time' | 'monthly' | 'installments' | 'yearly';

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

    mode: z.enum(['one_time', 'monthly', 'installments', 'yearly']),
    /** Only read in the monthly and instalment modes. */
    dayOfMonth: digits('day_invalid'),
    /** '' means open-ended. */
    endDate: z.string(),
    installmentCount: z.string(),
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

    if (values.mode === 'monthly' || values.mode === 'installments') {
      const day = Number(values.dayOfMonth);
      if (day < 1 || day > LAST_DAY_OF_MONTH) {
        ctx.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'day_out_of_range' });
      }
    }

    if (values.mode === 'installments') {
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
    if (values.endDate !== '' && (values.mode === 'monthly' || values.mode === 'yearly')) {
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
      amountMinor: parseAmount(values.amount, values.currency) ?? 0,
      currency: values.currency,
      date,
      note: values.note.trim() === '' ? undefined : values.note.trim(),
      recurrence: toRecurrence(values, date),
      /**
       * The entered amount IS the total for תשלומים - that is the question the
       * form asked. `createTransaction` splits it so the payments sum to it
       * exactly, with the first absorbing the remainder.
       */
      installmentTotalMinor:
        values.mode === 'installments' ? (parseAmount(values.amount, values.currency) ?? 0) : undefined,
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
      };

    case 'yearly': {
      const { month, day } = parseLocalDate(date);
      return { type: 'yearly', month, day, ...(endDate === undefined ? {} : { endDate }) };
    }
  }
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
