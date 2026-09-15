import { cn } from 'cn';
import { Trans, useTranslation } from 'react-i18next';

import { useCountUp } from '@/components/count-up';
import { Money } from '@/components/money';
import { Skeleton } from '@/components/ui/skeleton';
import type { MonthlyExpenseResult } from '@/domain/calculators';
import { formatMoney } from '@/i18n/money-format';
import { formatLocalDate, compareLocal, startOfMonth } from '@/lib/dates';
import type { Currency, LocalDate } from '@/types/money';

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
export function BalanceCard({
  state,
  currency,
  onOpenBreakdown,
}: {
  state: BalanceState;
  currency: Currency;
  onOpenBreakdown?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const target = state.status === 'ready' ? state.minor : 0;
  const animated = useCountUp(target);

  if (state.status === 'loading') {
    return <CardShell title={t('summary.balance')}>{<Skeleton className="h-9 w-40" />}</CardShell>;
  }

  if (state.status === 'blocked') {
    return (
      <CardShell title={t('summary.balance')}>
        <p className="text-sm text-destructive">
          {t('summary.balanceBlocked', { currencies: state.currencies.join(', ') })}
        </p>
      </CardShell>
    );
  }

  const settled = formatMoney(state.minor, currency, { locale: i18n.language });

  return (
    <CardShell
      title={t('summary.balance')}
      subtitle={t('summary.balanceSince', {
        date: formatLocalDate(state.since, i18n.language, { dateStyle: 'medium' }),
      })}
      onClick={onOpenBreakdown}
    >
      {/*
        The animating figure is hidden from assistive tech and ONE live region
        carries the settled value. Announcing every frame turns a balance into
        ~39 interruptions; announcing nothing leaves a number that changed
        silently.
      */}
      <p className="text-3xl font-semibold tracking-tight">
        <Money minor={animated} currency={currency} announce={false} />
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {t('summary.balance')}: {settled.aria}
      </p>
    </CardShell>
  );
}

export function ExpectedCard({
  expense,
  currency,
  month,
  today,
  onOpenBreakdown,
}: {
  expense: MonthlyExpenseResult | undefined;
  currency: Currency;
  month: LocalDate;
  today: LocalDate;
  onOpenBreakdown?: () => void;
}) {
  const { t } = useTranslation();

  if (expense === undefined) {
    return <CardShell title={t('summary.expected')}>{<Skeleton className="h-9 w-32" />}</CardShell>;
  }

  // A month already over has nothing "still due"; saying so would be wrong, and
  // saying nothing is right. The label changes too: "Spent" reads as history.
  const isPast = compareLocal(month, startOfMonth(today)) < 0;

  return (
    <CardShell title={isPast ? t('summary.spent') : t('summary.expected')} onClick={onOpenBreakdown}>
      <p className="text-3xl font-semibold tracking-tight">
        <Money minor={expense.total} currency={currency} />
      </p>
      {isPast ? null : (
        <p className="mt-1 text-sm text-muted-foreground">
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
              spent: (
                <Money
                  minor={expense.spentSoFar}
                  currency={currency}
                  className="font-medium text-foreground"
                />
              ),
              due: (
                <Money
                  minor={expense.remaining}
                  currency={currency}
                  className="font-medium text-foreground"
                />
              ),
            }}
          />
        </p>
      )}
    </CardShell>
  );
}

function CardShell({
  title,
  subtitle,
  children,
  onClick,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  const interactive = onClick !== undefined;

  const body = (
    <>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {children}
      {subtitle === undefined ? null : <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </>
  );

  if (!interactive) {
    return <div className="rounded-2xl border border-border bg-card p-4">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('summary.breakdownOf', { title })}
      className={cn(
        'rounded-2xl border border-border bg-card p-4 text-start transition',
        'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      )}
    >
      {body}
    </button>
  );
}
