import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useBaseCurrency, useToday } from '@/app/app-context';
import { CategoryIcon } from '@/components/category-icon';
import { Money } from '@/components/money';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/db/db';
import { listCommitments, type Commitment } from '@/domain/commitments';
import { categoryDisplayName } from '@/i18n/category-name';
import { formatLocalDate } from '@/lib/dates';
import type { Category } from '@/types/domain';

/**
 * What the household is signed up for.
 *
 * The feed cannot answer this: it shows one month, so six standing orders and
 * three instalment plans are nine rows scattered across it with no total
 * anywhere. This screen is the drill-down from "Expected monthly expense" and
 * the answer to "what am I actually paying for" - which, with a handful of
 * הוראות קבע and a couple of תשלומים plans running, nobody can hold in their
 * head.
 *
 * Reached from Settings and from the expense breakdown rather than the tab bar:
 * four tabs is the right number, and a fifth for a screen visited monthly would
 * cost every other screen a share of the bar.
 */
export function CommitmentsScreen() {
  const { t, i18n } = useTranslation(['common', 'categories']);
  const today = useToday();
  const baseCurrency = useBaseCurrency();
  const navigate = useNavigate();

  const data = useLiveQuery(async () => {
    /*
     * Every non-deleted transaction, not an interval query.
     *
     * The interval index answers "what falls in this window"; this screen asks
     * "what repeats at all", which is a different question and a much smaller
     * result - a household has dozens of series, not thousands.
     */
    const transactions = await db.transactions.where('isDeleted').equals(0).toArray();
    const recurring = transactions.filter((tx) => tx.recurrence.type !== 'one_time');
    const overrides = await db.overrides
      .where('transactionId')
      .anyOf(recurring.map((tx) => tx.id))
      .toArray();
    const categories = await db.categories.toArray();

    return {
      ...listCommitments({ transactions: recurring, overrides, today }),
      categories: new Map(categories.map((c) => [c.id, c])),
    };
  }, [today]);

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6 pb-24 lg:pb-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('commitments.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('commitments.body')}</p>
      </header>

      {data === undefined ? null : data.commitments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('commitments.empty')}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t('commitments.monthlyOut')}</CardDescription>
                <CardTitle className="text-2xl">
                  <Money minor={data.monthlyExpenseMinor} currency={baseCurrency} announce={false} />
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t('commitments.monthlyIn')}</CardDescription>
                <CardTitle className="text-2xl">
                  <Money minor={data.monthlyIncomeMinor} currency={baseCurrency} announce={false} />
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {data.commitments.map((commitment) => (
                  <CommitmentRow
                    key={commitment.transaction.id}
                    commitment={commitment}
                    category={data.categories.get(commitment.transaction.categoryId)}
                    baseCurrency={baseCurrency}
                    locale={i18n.language}
                    onOpen={() => {
                      /*
                       * Straight into the edit sheet for the NEXT occurrence,
                       * which is the one anybody wants to change. The feed owns
                       * that sheet, so the link carries its parameters rather
                       * than this screen growing a second copy of it.
                       */
                      const next = commitment.next;
                      if (next === undefined) return;
                      void navigate(
                        `/?m=${next.date.slice(0, 7)}&edit=${commitment.transaction.id}&at=${next.originalDate}`,
                      );
                    }}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}

function CommitmentRow({
  commitment,
  category,
  baseCurrency,
  locale,
  onOpen,
}: {
  readonly commitment: Commitment;
  readonly category: Category | undefined;
  readonly baseCurrency: string;
  readonly locale: string;
  readonly onOpen: () => void;
}) {
  const { t } = useTranslation(['common', 'categories']);
  const { transaction, next, monthlyEquivalentMinor, remaining, endsOn } = commitment;

  const name =
    transaction.note ?? (category === undefined ? transaction.categoryId : categoryDisplayName(category, t));
  const isYearly = transaction.recurrence.type === 'yearly';
  const isIncome = transaction.kind === 'income';

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        disabled={next === undefined}
        className="flex w-full items-center gap-3 p-3 text-start transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CategoryIcon name={category?.icon ?? 'Circle'} className="size-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block text-xs text-muted-foreground">
            {next === undefined
              ? t('commitments.nextNone')
              : t('commitments.nextOn', {
                  date: formatLocalDate(next.date, locale, { day: 'numeric', month: 'short' }),
                })}
            {remaining === undefined ? null : ` · ${t('commitments.remaining', { count: remaining })}`}
            {remaining === undefined && endsOn !== undefined
              ? ` · ${t('commitments.endsOn', { date: formatLocalDate(endsOn, locale, { month: 'short', year: 'numeric' }) })}`
              : null}
          </span>
        </span>

        <span className="shrink-0 text-end">
          <Money
            minor={isIncome ? monthlyEquivalentMinor : -monthlyEquivalentMinor}
            currency={baseCurrency}
            announce={false}
            className={`block text-sm font-semibold ${isIncome ? 'text-income' : ''}`}
          />
          {/* Said out loud for a yearly bill: a 500/month row that is really a
              6,000 annual premium is otherwise a figure nobody can reconcile
              against their bank. */}
          {isYearly ? (
            <span className="block text-[11px] text-muted-foreground">{t('commitments.yearlyNote')}</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}
