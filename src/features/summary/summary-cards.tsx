import { Trans, useTranslation } from 'react-i18next';

import { useCountUp } from '@/components/count-up';
import { Money } from '@/components/money';
import { Skeleton } from '@/components/ui/skeleton';
import type { BalanceBreakdown, ForecastBreakdown } from '@/domain/breakdown';
import type { MonthlyExpenseResult } from '@/domain/calculators';
import { formatMoney } from '@/i18n/money-format';
import { formatLocalDate, compareLocal, startOfMonth } from '@/lib/dates';
import type { Currency, LocalDate } from '@/types/money';

import { BalancePopover, ForecastPopover } from './breakdown-popouts';
import type { BalanceState } from './use-balance';

/**
 * The two headline figures.
 *
 * Both were renamed. "Disposable income" means "what is left after essentials,
 * per month"; what this computes is a cumulative all-time balance, and the
 * spec's own Hebrew (יתרה) had already made the correction that its English had
 * not. "X remaining" became "still due" for the same reason - "remaining" reads
 * as a budget, and budgets are an explicit non-goal.
 *
 * The since-line matters as much as the number. A running total that matches no
 * bank account invites "that is not how much money I have"; saying what it
 * counts from turns that into a fact rather than a bug report.
 */
export function BalanceFigure({
  state,
  currency,
  breakdown,
  onFullBreakdown,
}: {
  readonly state: BalanceState;
  readonly currency: Currency;
  readonly breakdown?: BalanceBreakdown;
  readonly onFullBreakdown?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const target = state.status === 'ready' ? state.minor : 0;
  const animated = useCountUp(target);
  const title = t('summary.balance');

  if (state.status === 'loading') {
    return (
      <div>
        <p className="text-sm text-brand-deep-foreground/80">{title}</p>
        <Skeleton className="mt-1 h-11 w-48 bg-white/15" />
      </div>
    );
  }

  if (state.status === 'blocked') {
    return (
      <div>
        <p className="text-sm text-brand-deep-foreground/80">{title}</p>
        {/* Red on the deep blue fails contrast; the words carry the problem. */}
        <p className="mt-1 text-sm text-brand-deep-foreground">
          {t('summary.balanceBlocked', { currencies: state.currencies.join(', ') })}
        </p>
      </div>
    );
  }

  const settled = formatMoney(state.minor, currency, { locale: i18n.language });
  const since = t('summary.balanceSince', {
    date: formatLocalDate(state.since, i18n.language, { dateStyle: 'medium' }),
  });

  const figure = (
    <>
      {/* Two spans, so "Balance" is still its own text for anything that finds it by name. */}
      <span className="block text-sm text-brand-deep-foreground/80">
        <span>{title}</span> · <span>{since}</span>
      </span>
      {/*
        The animating figure is hidden from assistive tech and ONE live region
        carries the settled value. Announcing every frame turns a balance into
        ~39 interruptions; announcing nothing leaves a number that changed
        silently.

        Karantina's digits are proportional, so the box is reserved from the
        settled figure: an invisible copy shares the grid cell, and the line
        never jitters while the count runs (§2.3).
      */}
      <span
        className="mt-1 grid justify-items-start font-display text-[2.75rem] leading-none tracking-tight max-[359px]:text-[2.25rem]"
        data-testid="balance-amount"
      >
        <span aria-hidden="true" dir="ltr" className="invisible col-start-1 row-start-1">
          {settled.text}
        </span>
        <span className="col-start-1 row-start-1">
          <Money minor={animated} currency={currency} announce={false} />
        </span>
      </span>
    </>
  );

  return (
    <>
      {breakdown === undefined || onFullBreakdown === undefined ? (
        <div>{figure}</div>
      ) : (
        <BalancePopover
          breakdown={breakdown}
          since={state.since}
          currency={currency}
          onFullBreakdown={onFullBreakdown}
          triggerClassName={PANEL_FIGURE}
          triggerLabel={t('summary.breakdownOf', { title })}
        >
          {figure}
        </BalancePopover>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="balance-announced">
        {title}: {settled.aria}
      </p>
    </>
  );
}

export function ForecastLine({
  expense,
  currency,
  month,
  today,
  breakdown,
  onFullBreakdown,
}: {
  readonly expense: MonthlyExpenseResult | undefined;
  readonly currency: Currency;
  readonly month: LocalDate;
  readonly today: LocalDate;
  readonly breakdown?: ForecastBreakdown;
  readonly onFullBreakdown?: () => void;
}) {
  const { t } = useTranslation();

  if (expense === undefined) return <Skeleton className="h-5 w-56 bg-white/15" />;

  // A month already over has nothing "still due"; saying so would be wrong, and
  // saying nothing is right. The label changes too: "Spent" reads as history.
  const isPast = compareLocal(month, startOfMonth(today)) < 0;
  const title = isPast ? t('summary.spent') : t('summary.expected');

  const line = (
    <>
      <span className="block text-base font-medium">
        {title} <Money minor={expense.total} currency={currency} className="font-semibold" />
      </span>
      {isPast ? null : (
        <span className="mt-0.5 block text-xs text-brand-deep-foreground/80">
          {/*
          ONE key, not three fragments joined in JSX.
          "X spent so far / Y still due" is a sentence, and Hebrew reverses
          its clause order. Concatenating in code fixes the order in English
          and leaves the translator no way to change it - and the separator is
          bidi-neutral, so where it lands is decided by its neighbours rather
          than by anyone's intent.
        */}
          <Trans
            i18nKey="summary.splitLine"
            components={{
              spent: <Money minor={expense.spentSoFar} currency={currency} className="font-medium" />,
              due: <Money minor={expense.remaining} currency={currency} className="font-medium" />,
            }}
          />
        </span>
      )}
    </>
  );

  if (breakdown === undefined || onFullBreakdown === undefined) return <div>{line}</div>;
  return (
    <ForecastPopover
      breakdown={breakdown}
      month={month}
      currency={currency}
      onFullBreakdown={onFullBreakdown}
      triggerClassName={PANEL_FIGURE}
      triggerLabel={t('summary.breakdownOf', { title })}
    >
      {line}
    </ForecastPopover>
  );
}

/** The classes of a figure on the panel that opens what it is made of. */
const PANEL_FIGURE =
  '-mx-2 block min-h-11 rounded-xl px-2 py-1 text-start transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none';
