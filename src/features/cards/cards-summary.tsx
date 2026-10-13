import { Trans, useTranslation } from 'react-i18next';

import { Mark } from '@/components/ui/mark';
import { Numeral } from '@/components/ui/numeral';
import { Sheet, SheetHead } from '@/components/ui/sheet-surface';
import type { MonthBills } from '@/domain/month-bills';
import { figureParts } from '@/i18n/money-format';
import { formatLocalDate } from '@/lib/dates';
import { wholeMinor } from '@/lib/money';
import type { Currency } from '@/types/money';

/**
 * What the cards take from the bank this month (§5.3, the concept's phone):
 * the ink sheet, the next charge in the box with the account it comes from,
 * and the month's bills as the huge numeral (118px on a phone, 252 at 1440).
 */
export function CardsSummary({
  bills,
  cardCount,
  accountName,
  currency,
}: {
  readonly bills: MonthBills | undefined;
  readonly cardCount: number;
  readonly accountName: (cardId: string) => string | undefined;
  readonly currency: Currency;
}) {
  const { t, i18n } = useTranslation('cards');
  const next = bills?.days.find((day) => !day.charged);
  const from =
    next === undefined
      ? undefined
      : next.bills.map((b) => accountName(b.card.id)).find((name) => name !== undefined);
  // Whole units, as an isolated run, as the concept's box reads "₪2,829".
  const amount = (minor: number) => {
    const parts = figureParts(wholeMinor(minor, currency), currency, { locale: i18n.language, whole: true });
    return `⁦${parts.sign}${parts.symbol}${parts.digits}⁩`;
  };
  return (
    <Sheet
      kind="night"
      bleed
      data-slot="cards-summary"
      className="grid gap-y-1 border-0 forced-colors:border-2"
    >
      <SheetHead
        size="hero"
        title={t('summary.title')}
        subtitle={t('summary.sub', { cards: cardCount, days: bills?.days.length ?? 0 })}
      />
      {next === undefined ? null : (
        <p className="text-[0.90625rem] leading-[1.7] font-light @board/main:text-lede">
          <Trans
            t={t}
            i18nKey={from === undefined ? 'summary.next' : 'summary.nextFrom'}
            values={{
              amount: amount(next.totalMinor),
              date: formatLocalDate(next.date, i18n.language, { day: 'numeric', month: 'long' }),
              account: from,
            }}
            components={{ box: <Mark /> }}
          />
        </p>
      )}
      <Numeral minor={bills?.totalMinor ?? 0} currency={currency} size="balance" rounded />
    </Sheet>
  );
}
