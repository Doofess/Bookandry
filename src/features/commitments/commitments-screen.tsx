import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useBaseCurrency, useToday } from '@/app/app-context';
import { ScreenHead } from '@/app/screen-head';
import { Money } from '@/components/money';
import { HuePill } from '@/components/ui/hue-pill';
import { Mark } from '@/components/ui/mark';
import { Sheet, SheetHead } from '@/components/ui/sheet-surface';
import { db } from '@/db/db';
import { categoryHue } from '@/domain/category-hue';
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

  const categoryName = (category: Category | undefined, id: string) =>
    category === undefined ? id : categoryDisplayName(category, t);

  const nextCharges =
    data === undefined
      ? []
      : data.commitments
          .filter((c): c is Commitment & { next: NonNullable<Commitment['next']> } => c.next !== undefined)
          .sort((a, b) => (a.next.date < b.next.date ? -1 : a.next.date > b.next.date ? 1 : 0))
          .slice(0, 5);

  return (
    <section className="px-3 pb-24 lg:px-0 lg:pb-8">
      <ScreenHead title={t('commitments.title')} subtitle={t('commitments.body')} />

      {data === undefined ? null : data.commitments.length === 0 ? (
        <Sheet kind="paper" data-slot="commitments-list" className="grid gap-1">
          <p className="font-light">{t('commitments.empty')}</p>
        </Sheet>
      ) : (
        <div className="grid gap-sheet @board/main:grid-cols-12">
          <Sheet kind="paper" data-slot="commitments-list" className="min-w-0 @board/main:col-span-8">
            <ul className="grid @vast/main:grid-cols-2 @vast/main:gap-x-8">
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
          </Sheet>

          <Sheet
            kind="paper"
            data-slot="commitments-totals"
            className="grid min-w-0 content-start gap-4 @board/main:col-span-4"
          >
            <SheetHead title={t('commitments.byKind')} />
            <dl className="grid">
              <TotalRow label={t('commitments.monthlyOut')}>
                <Mark>
                  <Money minor={data.monthlyExpenseMinor} currency={baseCurrency} announce={false} />
                </Mark>
              </TotalRow>
              <TotalRow label={t('commitments.monthlyIn')}>
                <Mark>
                  <Money minor={data.monthlyIncomeMinor} currency={baseCurrency} announce={false} />
                </Mark>
              </TotalRow>
            </dl>

            <h3 className="font-semibold">{t('commitments.nextCharges')}</h3>
            <ul data-slot="next-charges" className="grid">
              {nextCharges.map((c) => (
                <li
                  key={c.transaction.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b-2 border-border py-3 first:pt-0 last:border-b-0"
                >
                  <span className="min-w-0 truncate font-semibold">
                    {c.transaction.note ??
                      categoryName(data.categories.get(c.transaction.categoryId), c.transaction.categoryId)}
                  </span>
                  <Money
                    minor={
                      c.transaction.kind === 'income' ? c.monthlyEquivalentMinor : -c.monthlyEquivalentMinor
                    }
                    currency={baseCurrency}
                    announce={false}
                    className={`font-medium ${c.transaction.kind === 'income' ? 'text-income' : ''}`}
                  />
                  <span className="font-light">
                    {formatLocalDate(c.next.date, i18n.language, { day: 'numeric', month: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          </Sheet>
        </div>
      )}
    </section>
  );
}

/** One row on a 2px line: the label and its figure at the inline end. */
function TotalRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b-2 border-border py-3 first:pt-0 last:border-b-0">
      <dt className="font-semibold">{label}</dt>
      <dd className="text-lg">{children}</dd>
    </div>
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
    <li className="border-b-2 border-border last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        disabled={next === undefined}
        className="flex min-h-14 w-full items-center gap-3 py-3 text-start focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring active:opacity-80 disabled:opacity-60"
      >
        <HuePill hue={category === undefined ? undefined : categoryHue(category)} />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[1.0625rem] leading-[1.3] font-semibold">{name}</span>
          <span className="mt-0.75 block text-sm font-light text-muted-foreground">
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
            className={`block text-[1.0625rem] font-medium ${isIncome ? 'text-income' : ''}`}
          />
          {/* Said out loud for a yearly bill: a 500/month row that is really a
              6,000 annual premium is otherwise a figure nobody can reconcile
              against their bank. */}
          {isYearly ? (
            <span className="block text-xs font-light text-muted-foreground">
              {t('commitments.yearlyNote')}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}
