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
  isLastDayChoice,
  lastInstallmentDate,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  recurrenceDefaults,
  type RecurrenceMode,
  type TxFormValues,
} from '@/domain/tx-form';
import { formatLocalDate, isLocalDate, parseLocalDate } from '@/lib/dates';
import type { Recurrence } from '@/types/domain';
import type { Currency, LocalDate, Minor } from '@/types/money';

import { DateField } from './date-field';

/**
 * The recurrence controls.
 *
 * Instalments are a separate MODE from monthly, even though the data model
 * stores both as monthly recurrence. The two ask completely different
 * questions - "how much each month, until when" versus "what did it cost in
 * total, over how many payments" - and a single control that tries to serve
 * both is how a 12,000 shekel total gets entered as a 12,000 shekel bill.
 *
 * Everything under the mode picker is derived and shown rather than left to be
 * discovered in the feed: which day the first payment lands on, and for
 * תשלומים, what each payment is and when the last one falls.
 */
export function RecurrenceFields({
  values,
  onChange,
  currency,
  amountMinor,
  errors,
}: {
  readonly values: TxFormValues;
  readonly onChange: (patch: Partial<TxFormValues>) => void;
  readonly currency: Currency;
  /** The parsed amount, for the instalment preview. Undefined while unparseable. */
  readonly amountMinor: Minor | undefined;
  readonly errors: Readonly<Partial<Record<keyof TxFormValues, string>>>;
}) {
  const { t, i18n } = useTranslation();
  const modeLabelId = useId();
  const dayId = useId();
  const countId = useId();
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

  return (
    <div className="space-y-3">
      <Label id={modeLabelId}>{t('tx.repeat')}</Label>
      <Segmented<RecurrenceMode>
        value={mode}
        labelledBy={modeLabelId}
        onChange={(next) => {
          onChange(recurrenceDefaults(next, values));
        }}
        options={[
          { value: 'one_time', label: t('tx.repeatOnce') },
          { value: 'monthly', label: t('tx.repeatMonthly') },
          { value: 'installments', label: t('tx.repeatInstallments') },
          { value: 'yearly', label: t('tx.repeatYearly') },
        ]}
        size="sm"
      />

      {mode === 'monthly' && date !== undefined ? (
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

      {mode === 'installments' && date !== undefined ? (
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
          {errors.installmentCount === undefined ? (
            <InstallmentPreview
              date={date}
              count={Number(values.installmentCount)}
              totalMinor={amountMinor}
              currency={currency}
            />
          ) : (
            <p className="text-xs text-destructive">{errors.installmentCount}</p>
          )}
        </div>
      ) : null}

      {mode === 'yearly' && date !== undefined ? (
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
  totalMinor,
  currency,
}: {
  readonly date: LocalDate;
  readonly count: number;
  readonly totalMinor: Minor | undefined;
  readonly currency: Currency;
}) {
  const { t, i18n } = useTranslation();

  if (totalMinor === undefined || totalMinor <= 0 || !Number.isInteger(count) || count < MIN_INSTALLMENTS) {
    return null;
  }
  if (count > MAX_INSTALLMENTS) return null;

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
