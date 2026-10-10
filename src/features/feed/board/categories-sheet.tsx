import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { LINKED_ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { HueBars, type HueBarItem } from '@/components/ui/hue-bars';
import { Sheet, SheetHead } from '@/components/ui/sheet-surface';
import { totalsByCategory } from '@/domain/calculators';
import { categoryHue } from '@/domain/category-hue';
import { categoryDisplayName } from '@/i18n/category-name';
import { figureParts } from '@/i18n/money-format';
import { compareLocal, endOfMonth, formatLocalDate, startOfMonth } from '@/lib/dates';
import { sum, wholeMinor } from '@/lib/money';
import type { Category, Occurrence } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

export type CategoriesSheetProps = {
  readonly month: LocalDate;
  readonly today: LocalDate;
  readonly occurrences: readonly Occurrence[] | undefined;
  readonly categories: ReadonlyMap<string, Category> | undefined;
  readonly currency: Currency;
  /** 10 bars on the board, 7 on a phone (§1.4). */
  readonly limit: number;
};

/**
 * The month by category (§5.1): the paper sheet with one 30px hue bar per
 * category (the largest 10 on the board, 7 on a phone, then "Other"), each
 * against the largest, its name and its amount beside it; a pill to the
 * Categories screen. Up to today in the current month, the whole month before.
 */
export function CategoriesSheet({
  month,
  today,
  occurrences,
  categories,
  currency,
  limit,
}: CategoriesSheetProps) {
  const { t, i18n } = useTranslation(['common', 'categories']);
  const current = startOfMonth(month) === startOfMonth(today);
  const upTo = current ? today : endOfMonth(month);
  const items = useMemo<HueBarItem[]>(
    () =>
      totalsByCategory(
        (occurrences ?? []).filter((o) => !o.isProjected && !o.isSkipped && compareLocal(o.date, upTo) <= 0),
        'expense',
      ).map(({ categoryId, totalMinor }) => {
        const category = categories?.get(categoryId);
        return {
          id: categoryId,
          name: category === undefined ? t('sheets.other') : categoryDisplayName(category, t),
          minor: totalMinor,
          hue: category === undefined ? 'neutral' : categoryHue(category),
        };
      }),
    [occurrences, categories, upTo, t],
  );
  const total = sum(items.map((item) => item.minor));
  const parts = figureParts(wholeMinor(total, currency), currency, { locale: i18n.language, whole: true });
  // An amount is a left-to-right run, isolated so Hebrew text around it cannot reorder it.
  const wholeAmount = `⁦${parts.sign}${parts.symbol}${parts.digits}⁩`;
  const name = formatLocalDate(month, i18n.language, { month: 'long' });

  return (
    <Sheet kind="paper" data-slot="categories-sheet" className="grid content-start gap-4.5">
      <SheetHead
        className="mt-1.5"
        title={t('board.categoriesTitle', { month: name })}
        subtitle={
          items.length === 0
            ? undefined
            : t('board.categoriesSub', {
                count: items.length,
                amount: wholeAmount,
              })
        }
        action={
          <Button
            variant="pill"
            nativeButton={false}
            role="link"
            render={<Link to={LINKED_ROUTES.categories} />}
          >
            {t('nav.categories')}
          </Button>
        }
      />
      {items.length === 0 ? (
        <p className="font-light">{t('board.categoriesEmpty')}</p>
      ) : (
        <div className="mt-3.5">
          <HueBars items={items} currency={currency} limit={limit} />
        </div>
      )}
    </Sheet>
  );
}
