import { TriangleAlert, X } from 'lucide-react';
import { useId } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Money } from '@/components/money';
import { Percent } from '@/components/percent';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ResolvedCard } from '@/data/card-catalog/resolve';
import { splitInstallments } from '@/domain/calculators';
import {
  availableModes,
  dealRuleFor,
  dealSchedule,
  dealWarnings,
  type DealSchedule,
  type DealWarning,
} from '@/domain/deal-rules';
import type { PrimeView } from '@/domain/prime';
import {
  chargesInterest,
  effectiveRate,
  firstOccurrenceDate,
  isInstallmentMode,
  isLastDayChoice,
  lastInstallmentDate,
  maxPaymentsFor,
  MIN_INSTALLMENTS,
  planTotal,
  recurrenceDefaults,
  type RateBasis,
  type RecurrenceMode,
  type StandingOrderFrequency,
  type TxFormValues,
} from '@/domain/tx-form';
import { formatMoney } from '@/i18n/money-format';
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
 * purchase, a תשלומים plan, a קרדיט plan, a הוראת קבע, or a הלוואה. "Repeats: monthly"
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
  prime,
  card,
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
  /** Prime from the Bank of Israel, for a loan priced on it. */
  readonly prime: PrimeView;
  /**
   * The paying card, when it is linked to the catalog and its entry has
   * loaded: its own deals, their rules and their schedules. Absent - no card,
   * a card not linked, the catalog still loading or failed - the form is
   * exactly what it always was.
   */
  readonly card?: CardDeals;
}) {
  const { t, i18n } = useTranslation();
  const modeLabelId = useId();
  const freqLabelId = useId();
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

  /*
   * A standing order IS monthly or yearly recurrence, so it reuses those
   * controls rather than growing a parallel set that would drift from them.
   * Until the frequency is answered it shows neither, which is the point:
   * there is nothing to configure yet.
   */
  const monthlyShaped = mode === 'monthly' || (mode === 'standing_order' && values.frequency === 'monthly');
  const yearlyShaped = mode === 'yearly' || (mode === 'standing_order' && values.frequency === 'yearly');

  /*
   * The choices: today's, or a linked card's own deals under the card
   * company's own names. One the card does not offer stays listed while it is
   * the one chosen, so the control never shows nothing selected.
   */
  const lang = i18n.language.startsWith('he') ? 'he' : 'en';
  const resolved = isExpense ? card?.resolved : undefined;
  const offered = availableModes(resolved, isExpense ? 'expense' : 'income').filter(
    (m) => m !== 'deferred' || card?.offerDeferred !== false,
  );
  const modes = offered.includes(mode) ? offered : [...offered, mode];
  const fallbackLabel: Record<RecurrenceMode, string> = {
    one_time: isExpense ? t('tx.typeRegular') : t('tx.repeatOnce'),
    installments: t('tx.typeInstallments'),
    credit: t('tx.typeCredit'),
    long_credit: t('tx.typeLongCredit'),
    deferred: t('tx.typeDeferred'),
    standing_order: t('tx.typeStandingOrder'),
    loan: t('tx.typeLoan'),
    monthly: t('tx.repeatMonthly'),
    yearly: t('tx.repeatYearly'),
  };
  const labelOf = (m: RecurrenceMode) => dealRuleFor(resolved, m)?.label[lang] ?? fallbackLabel[m];
  const deal = dealRuleFor(resolved, mode);

  // The deal's rules, as warnings: never a refusal.
  const count = isInstallmentMode(mode) ? Number(values.installmentCount) : 1;
  const warnings: readonly DealWarning[] =
    deal === undefined || card === undefined || !Number.isInteger(count) || count < 1
      ? []
      : dealWarnings(deal, {
          // The minimums are in shekels: unchecked while the amount is not known in them.
          amountMinor: card.shekelsMinor ?? Number.MAX_SAFE_INTEGER,
          payments: count,
          abroad: card.abroad,
        }).filter(
          (w) => card.shekelsMinor !== undefined || (w.code !== 'min_deal' && w.code !== 'min_payment'),
        );

  const rate = effectiveRate(values);
  const schedule =
    deal === undefined || (mode !== 'credit' && mode !== 'long_credit') || rate === undefined || rate === ''
      ? undefined
      : dealSchedule({
          principalMinor: amountMinor,
          rate,
          count,
          maxCount: maxPaymentsFor(mode),
          compounding: deal.rate?.compounding ?? 12,
          reset: mode === 'long_credit' ? deal.rate?.reset : undefined,
          primeRate: prime.primeRate,
        });

  return (
    <div className="space-y-3">
      <Label id={modeLabelId}>{isExpense ? t('tx.type') : t('tx.repeat')}</Label>
      <Segmented<RecurrenceMode>
        value={mode}
        labelledBy={modeLabelId}
        onChange={(next) => {
          onChange(recurrenceDefaults(next, values));
        }}
        options={modes.map((value) => ({ value, label: labelOf(value) }))}
        size="sm"
      />

      {mode === 'deferred' ? (
        <AnnualRateField
          value={values.annualRate}
          onChange={(annualRate) => {
            onChange({ annualRate });
          }}
          hint={t('tx.annualRateHint')}
          error={errors.annualRate}
        />
      ) : null}

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
          <Label htmlFor={countId}>{mode === 'loan' ? t('tx.loanCount') : t('tx.installmentCount')}</Label>
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
            {mode === 'loan' ? t('tx.loanTotalHint') : t('tx.installmentsTotalHint')}
          </p>
          {mode === 'loan' ? (
            <LoanRate values={values} onChange={onChange} errors={errors} prime={prime} />
          ) : chargesInterest(mode) ? (
            <AnnualRateField
              value={values.annualRate}
              onChange={(annualRate) => {
                onChange({ annualRate });
              }}
              hint={t('tx.annualRateHint')}
              error={errors.annualRate}
            />
          ) : null}

          {errors.installmentCount === undefined ? (
            <InstallmentPreview
              date={date}
              count={Number(values.installmentCount)}
              principalMinor={amountMinor}
              totalMinor={planTotal(values)}
              annualRate={effectiveRate(values) ?? ''}
              maxCount={maxPaymentsFor(mode)}
              currency={currency}
              // The card's own schedule line says the interest, and the מתואמת rate with it.
              showInterest={schedule === undefined}
            />
          ) : (
            <p className="text-xs text-destructive">{errors.installmentCount}</p>
          )}
          {schedule === undefined ? null : <ScheduleLines schedule={schedule} currency={currency} />}
        </div>
      ) : null}

      {card !== undefined && deal !== undefined ? (
        <DealNotes
          dealName={deal.label[lang]}
          warnings={warnings}
          needRate={card.needRate && chargesInterest(mode)}
          onOpenCard={card.onOpenCard}
        />
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
  maxCount,
  currency,
  showInterest,
}: {
  readonly date: LocalDate;
  readonly count: number;
  /** What was entered: the purchase price. */
  readonly principalMinor: Minor | undefined;
  /** What it will cost: the same, plus interest on a קרדיט plan. */
  readonly totalMinor: Minor | undefined;
  /** '' for an interest-free plan, which is every תשלומים. */
  readonly annualRate: string;
  /** 60 for a card's plan, 360 for a loan. */
  readonly maxCount: number;
  readonly currency: Currency;
  /** Off where the card's own schedule line already says the interest. */
  readonly showInterest: boolean;
}) {
  const { t, i18n } = useTranslation();

  if (totalMinor === undefined || totalMinor <= 0 || !Number.isInteger(count) || count < MIN_INSTALLMENTS) {
    return null;
  }
  if (count > maxCount) return null;

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
      {interest === undefined || !showInterest ? null : (
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

/** What the purchase form knows of a card linked to the catalog. */
export type CardDeals = {
  readonly resolved: ResolvedCard;
  /** The deal's rate is neither published nor entered: saving waits for it. */
  readonly needRate: boolean;
  /** Open the card's editor, where its rate table is. */
  readonly onOpenCard: () => void;
  /** Bought abroad (in a foreign currency): some deals are not offered then. */
  readonly abroad: boolean;
  /** The amount in shekels, for the deal's minimums; undefined while it is not known in them. */
  readonly shekelsMinor: Minor | undefined;
  /** 30+ is a new purchase only: an edit has no way to make one. */
  readonly offerDeferred: boolean;
};

/** An amount inside a sentence: one left-to-right island, so Hebrew does not reorder it. */
function moneyText(minor: Minor, currency: Currency, locale: string): string {
  return `⁦${formatMoney(minor, currency, { locale }).text}⁩`;
}

/**
 * A linked card's schedule for קרדיט and קרדיט פלוס: each payment, the
 * interest, and the מתואמת rate; and where the deal follows prime from a
 * payment on, the payments after it at today's prime, said as an estimate.
 */
function ScheduleLines({
  schedule,
  currency,
}: {
  readonly schedule: DealSchedule;
  readonly currency: Currency;
}) {
  const { t, i18n } = useTranslation();
  const money = (minor: Minor) => moneyText(minor, currency, i18n.language);
  return (
    <div className="space-y-1 text-xs text-muted-foreground" data-testid="deal-schedule">
      <p>
        {t('deal.schedule', {
          n: schedule.count,
          payment: money(schedule.paymentMinor),
          interest: money(schedule.interestMinor),
          eff: schedule.effective,
        })}
      </p>
      {schedule.reset === undefined ? null : (
        <p>
          {t('deal.resetSchedule', {
            last: schedule.reset.atPayment - 1,
            first: money(schedule.reset.firstMinor),
            at: schedule.reset.atPayment,
            after: money(schedule.reset.afterMinor),
          })}
        </p>
      )}
    </div>
  );
}

/**
 * The card's rules a purchase breaks, said as warnings - the store or the
 * card company may know better - and the one thing that does hold a save
 * back: a deal whose rate nobody has given, with the way to give it.
 */
function DealNotes({
  dealName,
  warnings,
  needRate,
  onOpenCard,
}: {
  readonly dealName: string;
  readonly warnings: readonly DealWarning[];
  readonly needRate: boolean;
  readonly onOpenCard: () => void;
}) {
  const { t, i18n } = useTranslation();
  const money = (minor: string | number | undefined) =>
    typeof minor === 'number' ? moneyText(minor, 'ILS', i18n.language) : '';
  const sentence = (w: DealWarning): string => {
    switch (w.code) {
      case 'min_deal':
        return t('deal.minDeal', { deal: dealName, min: money(w.values.min) });
      case 'min_payment':
        return t('deal.minPayment', { min: money(w.values.min) });
      case 'payments':
        return t('deal.payments', { deal: dealName, min: w.values.min, max: w.values.max });
      case 'abroad':
        return t('deal.abroad', { deal: dealName });
    }
  };
  if (warnings.length === 0 && !needRate) return null;
  return (
    <div className="space-y-1.5">
      {warnings.length === 0 ? null : (
        <ul className="space-y-1" aria-live="polite">
          {warnings.map((w) => (
            <li key={w.code} className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span>{sentence(w)}</span>
            </li>
          ))}
        </ul>
      )}
      {needRate ? (
        <div className="flex flex-wrap items-center gap-x-2">
          <p role="alert" className="text-xs text-destructive">
            {t('deal.needRate', { deal: dealName })}
          </p>
          <Button type="button" variant="link" className="min-h-11 px-0" onClick={onOpenCard}>
            {t('deal.openCard')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** A rate typed as it is: a card's, or a fixed-rate loan's. */
function AnnualRateField({
  value,
  onChange,
  hint,
  error,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint: string;
  readonly error: string | undefined;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="space-y-1.5 pt-2">
      <Label htmlFor={id}>{t('tx.annualRate')}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          dir="ltr"
          value={value}
          onChange={(event) => {
            // Digits and points only. A second point is left for the schema
            // to report rather than eaten mid-keystroke, and a number input
            // would swallow "12." on the way to "12.5".
            onChange(event.target.value.replace(/[^\d.]/g, '').slice(0, 6));
          }}
          aria-invalid={error !== undefined}
          aria-describedby={`${id}-hint`}
          className="h-11 w-24"
        />
        <span className="text-sm text-muted-foreground">{t('tx.annualRateUnit')}</span>
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {error === undefined ? hint : ''}
      </p>
      {error === undefined ? null : <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * A loan's interest: prime plus a margin, or fixed.
 *
 * Prime is the Bank of Israel's - its rate plus 1.5 - and is shown, never
 * typed: it is the same number for every loan in the country, and a field
 * that could be edited is a field somebody would get wrong. What the loan
 * adds on top (the agreement's "P+1.5", or "P-0.5" on a mortgage track) is
 * the part that is the borrower's own.
 */
function LoanRate({
  values,
  onChange,
  errors,
  prime,
}: {
  readonly values: TxFormValues;
  readonly onChange: (patch: Partial<TxFormValues>) => void;
  readonly errors: Readonly<Partial<Record<keyof TxFormValues, string>>>;
  readonly prime: PrimeView;
}) {
  const { t, i18n } = useTranslation();
  const basisId = useId();
  const primeId = useId();
  const marginId = useId();
  const basis = values.rateBasis ?? 'prime';
  const rate = effectiveRate(values);
  const day = (date: LocalDate) => formatLocalDate(date, i18n.language, { dateStyle: 'medium' });

  return (
    <div className="space-y-3 pt-2">
      <div className="space-y-1.5">
        <Label id={basisId}>{t('tx.loanInterest')}</Label>
        <Segmented<RateBasis>
          value={basis}
          labelledBy={basisId}
          onChange={(rateBasis) => {
            onChange({ rateBasis });
          }}
          options={[
            { value: 'prime', label: t('tx.basisPrime') },
            { value: 'fixed', label: t('tx.basisFixed') },
          ]}
          size="sm"
        />
      </div>

      {basis === 'fixed' ? (
        <AnnualRateField
          value={values.annualRate}
          onChange={(annualRate) => {
            onChange({ annualRate });
          }}
          hint={t('tx.loanRateHint')}
          error={errors.annualRate}
        />
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={primeId}>{t('tx.prime')}</Label>
              <div className="flex items-center gap-2">
                {/* Read-only, not disabled: still reachable and read out, just not editable. */}
                <Input
                  id={primeId}
                  readOnly
                  dir="ltr"
                  value={values.primeRate ?? ''}
                  aria-describedby={`${primeId}-source`}
                  className="h-11 w-24 bg-muted text-muted-foreground"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <span className="pb-3 text-sm text-muted-foreground" aria-hidden="true">
              +
            </span>
            <div className="space-y-1.5">
              <Label htmlFor={marginId}>{t('tx.primeMargin')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={marginId}
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  placeholder="0"
                  value={values.primeMargin ?? ''}
                  onChange={(event) => {
                    // A sign may lead: prime minus half a point is a margin of -0.5.
                    onChange({ primeMargin: event.target.value.replace(/[^\d.+-]/g, '').slice(0, 7) });
                  }}
                  aria-invalid={errors.primeMargin !== undefined}
                  aria-describedby={`${marginId}-hint`}
                  className="h-11 w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          <p id={`${primeId}-source`} className="text-xs text-muted-foreground">
            <Trans i18nKey="tx.primeSource" components={{ boi: <Percent rate={prime.boiRate} /> }} />{' '}
            {prime.source.kind === 'built_in'
              ? t('tx.primeBuiltIn', { date: day(prime.source.asOf) })
              : prime.nextDecision === undefined
                ? null
                : t('tx.primeNextDecision', { date: day(prime.nextDecision) })}
          </p>
          <p id={`${marginId}-hint`} className="text-xs text-muted-foreground">
            {t('tx.primeMarginHint')}
          </p>
          {errors.primeMargin !== undefined ? (
            <p className="text-xs text-destructive">{errors.primeMargin}</p>
          ) : rate === undefined || rate === '' ? null : (
            <p className="text-sm font-medium">
              <Trans i18nKey="tx.primeTotal" components={{ rate: <Percent rate={rate} /> }} />
            </p>
          )}
        </div>
      )}
    </div>
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
