import { X } from 'lucide-react';
import { useId } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Money } from '@/components/money';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { splitInstallments } from '@/domain/calculators';
import {
  firstOccurrenceDate,
  isInstallmentMode,
  isLastDayChoice,
  lastInstallmentDate,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  planTotal,
  recurrenceDefaults,
  type RecurrenceMode,
  type StandingOrderFrequency,
  type TxFormValues,
} from '@/domain/tx-form';
import { formatLocalDate, isLocalDate, parseLocalDate } from '@/lib/dates';
import { creditSchedule, normalizeAnnualRate } from '@/lib/money';
import type { Recurrence } from '@/types/domain';
import type { Currency, LocalDate, Minor } from '@/types/money';

import { DateField } from './date-field';

/**
 * What KIND of expense this is - or, for income, how often it repeats.
 *
 * An expense is not described by how often it repeats; it is described by what
 * it IS, and in Israel that is a short list everybody already knows: a regular
 * purchase, a תשלומים plan, a קרדיט plan, or a הוראת קבע. "Repeats: monthly"
 * asks the user to translate their own word for the thing into the app's, and
 * the two plans - which repeat monthly - are not repeats in any sense they
 * would recognise.
 *
 * Income keeps the plain repeat vocabulary: a salary arrives every month and
 * is nobody's standing order.
 *
 * Instalments stay a separate mode from a repeating charge even though the
 * data model stores both as monthly recurrence, because they ask opposite
 * questions - "how much each month, until when" versus "what did it cost in
 * total, over how many payments" - and one control serving both is how a
 * 12,000 shekel total gets entered as a 12,000 shekel monthly bill.
 *
 * Everything under the picker is derived and shown rather than left to be
 * discovered in the feed: which day the first payment lands on, and for a
 * plan, what each payment is and when the last one falls.
 */
export function RecurrenceFields({
  values,
  onChange,
  isExpense,
  submitted,
  currency,
  amountMinor,
  errors,
}: {
  readonly values: TxFormValues;
  readonly onChange: (patch: Partial<TxFormValues>) => void;
  /** Expenses are described by TYPE; income by how often it repeats. */
  readonly isExpense: boolean;
  /**
   * Whether a save has been attempted.
   *
   * The frequency is the one required field with no default, so the resolver
   * flags it the instant the type is chosen - before the user could possibly
   * have answered. Showing that as an ERROR is scolding somebody for not yet
   * having done the thing you just asked them to do; the neutral hint says the
   * same thing until they actually try to leave without it.
   */
  readonly submitted: boolean;
  readonly currency: Currency;
  /** The parsed amount, for the instalment preview. Undefined while unparseable. */
  readonly amountMinor: Minor | undefined;
  readonly errors: Readonly<Partial<Record<keyof TxFormValues, string>>>;
}) {
  const { t, i18n } = useTranslation();
  const modeLabelId = useId();
  const freqLabelId = useId();
  const dayId = useId();
  const countId = useId();
  const rateId = useId();
  const endId = useId();

  const mode = values.mode;
  /*
   * Undefined when the field does not hold a date.
   *
   * `as LocalDate` would be the short way and would crash the render: every
   * derived hint below runs through `parseLocalDate`, which throws on anything
   * that is not YYYY-MM-DD. The picker cannot produce one, but "cannot" is
   * what a cast asserts and a guard proves.
   */
  const date = isLocalDate(values.date) ? values.date : undefined;

  /*
   * A standing order IS monthly or yearly recurrence, so it reuses those
   * controls rather than growing a parallel set that would drift from them.
   * Until the frequency is answered it shows neither, which is the point:
   * there is nothing to configure yet.
   */
  const monthlyShaped = mode === 'monthly' || (mode === 'standing_order' && values.frequency === 'monthly');
  const yearlyShaped = mode === 'yearly' || (mode === 'standing_order' && values.frequency === 'yearly');

  return (
    <div className="space-y-3">
      <Label id={modeLabelId}>{isExpense ? t('tx.type') : t('tx.repeat')}</Label>
      <Segmented<RecurrenceMode>
        value={mode}
        labelledBy={modeLabelId}
        onChange={(next) => {
          onChange(recurrenceDefaults(next, values));
        }}
        options={
          isExpense
            ? [
                { value: 'one_time', label: t('tx.typeRegular') },
                { value: 'installments', label: t('tx.typeInstallments') },
                { value: 'credit', label: t('tx.typeCredit') },
                { value: 'standing_order', label: t('tx.typeStandingOrder') },
              ]
            : [
                { value: 'one_time', label: t('tx.repeatOnce') },
                { value: 'monthly', label: t('tx.repeatMonthly') },
                { value: 'yearly', label: t('tx.repeatYearly') },
              ]
        }
        size="sm"
      />

      {mode === 'standing_order' ? (
        <div className="space-y-1.5">
          <Label id={freqLabelId}>{t('tx.frequency')}</Label>
          {/*
            No default, on purpose.

            Monthly is the likelier answer, and preselecting it would still be
            wrong: arnona and most insurance policies are yearly, and a default
            that is right most of the time is exactly how the wrong one gets
            saved without ever being read. The form will not submit until this
            is answered.
          */}
          <Segmented<StandingOrderFrequency>
            value={values.frequency}
            labelledBy={freqLabelId}
            onChange={(frequency) => {
              onChange({ frequency });
            }}
            options={[
              { value: 'monthly', label: t('tx.frequencyMonthly') },
              { value: 'yearly', label: t('tx.frequencyYearly') },
            ]}
            size="sm"
          />
          {/* Asked until answered: once monthly or yearly is chosen there is nothing left to say. */}
          {values.frequency !== '' ? null : errors.frequency === undefined || !submitted ? (
            <p className="text-xs text-muted-foreground">{t('tx.frequencyHint')}</p>
          ) : (
            <p className="text-xs text-destructive">{errors.frequency}</p>
          )}
        </div>
      ) : null}

      {monthlyShaped && date !== undefined ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={dayId}>{t('tx.dayOfMonth')}</Label>
            <Input
              id={dayId}
              // `text` with a numeric inputMode, not `number`: a number input
              // silently discards what it cannot parse, so a half-typed value
              // vanishes from under the cursor, and its spinners are a 16px
              // target sitting on a 44px control.
              type="text"
              inputMode="numeric"
              value={values.dayOfMonth}
              onChange={(event) => {
                onChange({ dayOfMonth: event.target.value.replace(/\D/g, '').slice(0, 2) });
              }}
              aria-invalid={errors.dayOfMonth !== undefined}
              aria-describedby={`${dayId}-hint`}
              className="h-11 w-24"
            />
            <p id={`${dayId}-hint`} className="text-xs text-muted-foreground">
              {isLastDayChoice(Number(values.dayOfMonth))
                ? /*
                   * The non-sticky clamping already makes 31 behave as
                   * last-day - 31/28/31/30 - but nobody discovers that, and
                   * everyone who picks 31 assumes it breaks in February.
                   */
                  t('tx.lastDayOfMonth')
                : t('tx.firstOccurrence', {
                    date: formatLocalDate(firstOccurrenceDate(date, monthlyRule(values)), i18n.language, {
                      dateStyle: 'medium',
                    }),
                  })}
            </p>
            {errors.dayOfMonth === undefined ? null : (
              <p className="text-xs text-destructive">{errors.dayOfMonth}</p>
            )}
          </div>

          <EndDateField
            id={endId}
            value={values.endDate}
            onChange={(endDate) => {
              onChange({ endDate });
            }}
            after={date}
            error={errors.endDate}
          />
        </div>
      ) : null}

      {isInstallmentMode(mode) && date !== undefined ? (
        <div className="space-y-1.5">
          <Label htmlFor={countId}>{t('tx.installmentCount')}</Label>
          <Input
            id={countId}
            type="text"
            inputMode="numeric"
            value={values.installmentCount}
            onChange={(event) => {
              onChange({ installmentCount: event.target.value.replace(/\D/g, '').slice(0, 3) });
            }}
            aria-invalid={errors.installmentCount !== undefined}
            aria-describedby={`${countId}-hint`}
            className="h-11 w-24"
          />
          <p id={`${countId}-hint`} className="text-xs text-muted-foreground">
            {t('tx.installmentsTotalHint')}
          </p>
          {mode === 'credit' ? (
            <div className="space-y-1.5 pt-2">
              <Label htmlFor={rateId}>{t('tx.annualRate')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={rateId}
                  type="text"
                  inputMode="decimal"
                  value={values.annualRate}
                  onChange={(event) => {
                    // Digits and points only. A second point is left for the
                    // schema to report rather than eaten mid-keystroke, and a
                    // number input would swallow "12." on the way to "12.5".
                    onChange({ annualRate: event.target.value.replace(/[^\d.]/g, '').slice(0, 6) });
                  }}
                  aria-invalid={errors.annualRate !== undefined}
                  aria-describedby={`${rateId}-hint`}
                  className="h-11 w-24"
                />
                <span className="text-sm text-muted-foreground">{t('tx.annualRateUnit')}</span>
              </div>
              <p id={`${rateId}-hint`} className="text-xs text-muted-foreground">
                {errors.annualRate === undefined ? t('tx.annualRateHint') : ''}
              </p>
              {errors.annualRate === undefined ? null : (
                <p className="text-xs text-destructive">{errors.annualRate}</p>
              )}
            </div>
          ) : null}

          {errors.installmentCount === undefined ? (
            <InstallmentPreview
              date={date}
              count={Number(values.installmentCount)}
              principalMinor={amountMinor}
              totalMinor={planTotal(values)}
              annualRate={mode === 'credit' ? values.annualRate : ''}
              currency={currency}
            />
          ) : (
            <p className="text-xs text-destructive">{errors.installmentCount}</p>
          )}
        </div>
      ) : null}

      {yearlyShaped && date !== undefined ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t('tx.firstOccurrence', {
              date: formatLocalDate(date, i18n.language, { day: 'numeric', month: 'long' }),
            })}
          </p>
          <EndDateField
            id={endId}
            value={values.endDate}
            onChange={(endDate) => {
              onChange({ endDate });
            }}
            after={date}
            error={errors.endDate}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * What each payment comes to, shown before saving rather than after.
 *
 * Israeli תשלומים carry no interest, so the payments must sum to the total
 * EXACTLY: 1,000 over three is 333.34 + 333.33 + 333.33, with the FIRST
 * absorbing the remainder, which is the card-issuer convention. Showing the
 * split here is how the user confirms they entered a total and not a monthly
 * figure - the single most likely mistake on this screen.
 */
function InstallmentPreview({
  date,
  count,
  principalMinor,
  totalMinor,
  annualRate,
  currency,
}: {
  readonly date: LocalDate;
  readonly count: number;
  /** What was entered: the purchase price. */
  readonly principalMinor: Minor | undefined;
  /** What it will cost: the same, plus interest on a קרדיט plan. */
  readonly totalMinor: Minor | undefined;
  /** '' for an interest-free plan, which is every תשלומים. */
  readonly annualRate: string;
  readonly currency: Currency;
}) {
  const { t, i18n } = useTranslation();

  if (totalMinor === undefined || totalMinor <= 0 || !Number.isInteger(count) || count < MIN_INSTALLMENTS) {
    return null;
  }
  if (count > MAX_INSTALLMENTS) return null;

  /*
   * Priced from the PRINCIPAL, not from the total.
   *
   * `totalMinor` already includes the interest, so re-deriving the schedule
   * from it would compound the rate onto itself. The schedule is only needed
   * for the summary line; the payments below come from splitting the total,
   * which is exactly what the save path will do.
   */
  const rate = normalizeAnnualRate(annualRate);
  const interest =
    rate === undefined || principalMinor === undefined || principalMinor <= 0
      ? undefined
      : creditSchedule(principalMinor, rate, count);

  const payments = splitInstallments(totalMinor, count);
  const first = payments[0] ?? totalMinor;
  const regular = payments[1] ?? first;
  const recurrence: Recurrence = {
    type: 'monthly',
    dayOfMonth: parseLocalDate(date).day,
    installments: count,
  };
  const last = lastInstallmentDate(date, recurrence);

  return (
    <p className="text-xs text-muted-foreground">
      {/*
       * `<Trans>`, not string concatenation.
       *
       * The amounts are bidi islands with their own `dir="ltr"`, and Hebrew
       * reverses the clause order - so building this sentence by joining
       * pieces puts the money at the wrong end of it. One key, whole.
       */}
      {/*
       * Two sentences, because the remainder is the whole point.
       *
       * תשלומים carry no interest, so the payments must sum to the total
       * EXACTLY - 1,000 over three is 333.34 + 333.33 + 333.33, the first
       * absorbing the odd agora, which is the card-issuer convention. When the
       * split happens to be even there is no odd agora, and "the first $400.00"
       * is then noise that buries the number that does matter on the occasions
       * it differs.
       */}
      {first === regular ? (
        <Trans
          i18nKey="tx.installmentsEven"
          count={count}
          components={{ amount: <Money minor={regular} currency={currency} announce={false} /> }}
        />
      ) : (
        <Trans
          i18nKey="tx.installmentsSummary"
          count={count}
          components={{
            amount: <Money minor={regular} currency={currency} announce={false} />,
            first: <Money minor={first} currency={currency} announce={false} />,
          }}
        />
      )}
      {last === undefined ? null : (
        <>
          {' '}
          {t('tx.lastPayment', {
            date: formatLocalDate(last, i18n.language, { month: 'long', year: 'numeric' }),
          })}
        </>
      )}
      {/*
        What the interest actually costs, in money, before saving.

        A percentage is not a number anybody can feel. "12.5%" on a ₪1,200
        purchase is ₪42.36, and seeing the shekels is the difference between
        agreeing to a plan and noticing it.
      */}
      {interest === undefined ? null : (
        <>
          <br />
          <Trans
            i18nKey="tx.creditInterestSummary"
            components={{
              total: <Money minor={interest.totalMinor} currency={currency} announce={false} />,
              interest: <Money minor={interest.interestMinor} currency={currency} announce={false} />,
            }}
          />
        </>
      )}
    </p>
  );
}

function EndDateField({
  id,
  value,
  onChange,
  after,
  error,
}: {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly after: LocalDate;
  readonly error?: string;
}) {
  const { t } = useTranslation();
  const labelId = `${id}-label`;

  if (value === '') {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          onChange(after);
        }}
      >
        {t('tx.endDate')}
      </Button>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label id={labelId}>{t('tx.endDate')}</Label>
      <div className="flex items-center gap-2">
        <DateField
          value={value as LocalDate}
          onChange={onChange}
          labelledBy={labelId}
          invalid={error !== undefined}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('tx.endDateClear')}
          onClick={() => {
            onChange('');
          }}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {error === undefined ? (
        <p className="text-xs text-muted-foreground">{t('tx.endDateNever')}</p>
      ) : (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

function monthlyRule(values: TxFormValues): Recurrence {
  return { type: 'monthly', dayOfMonth: Number(values.dayOfMonth) };
}
