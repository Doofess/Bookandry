import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Numeral } from '@/components/ui/numeral';
import { Sheet } from '@/components/ui/sheet-surface';
import type { CashSummary } from '@/domain/cash';
import { formatLocalDate } from '@/lib/dates';
import type { Currency } from '@/types/money';

/**
 * The cash box (§5.5): the yellow cash sheet, its title and when it was last
 * counted, its pills at the inline end, and the pot as the huge numeral
 * running off the foot. Cash owns it; the feed's wallet shows it too.
 */
export function CashSheet({
  summary,
  currency,
  actions,
}: {
  readonly summary: CashSummary;
  readonly currency: Currency;
  readonly actions?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Sheet
      kind="money"
      moneyKey="cash"
      radius="cash"
      bleed
      data-slot="cash-sheet"
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 border-0 px-7 pt-5.5"
    >
      <h3 className="text-[1.375rem] leading-[1.55] font-semibold tracking-[-0.01em]">
        {t('nav.cashBox')}
        {summary.countedOn === undefined ? null : (
          <span className="mt-0.5 block text-[1.0625rem] leading-[1.15] font-light tracking-normal">
            {t('cash.counted', {
              date: formatLocalDate(summary.countedOn, i18n.language, { day: 'numeric', month: 'short' }),
            })}
          </span>
        )}
      </h3>
      {actions === undefined ? null : <div className="flex flex-wrap gap-2 self-start">{actions}</div>}
      <div className="col-span-full min-w-0">
        <Numeral minor={summary.onHandMinor} currency={currency} size="cash" rounded />
      </div>
    </Sheet>
  );
}
