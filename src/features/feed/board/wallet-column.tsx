import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { CardSheet } from '@/components/ui/card-sheet';
import { Numeral } from '@/components/ui/numeral';
import { TitlePair } from '@/components/ui/title-pair';
import type { CashSummary } from '@/domain/cash';
import { cardKey } from '@/domain/money-key';
import type { MonthBills } from '@/domain/month-bills';
import { issuerLabel } from '@/features/cards/issuer-label';
import { CashSheet } from '@/features/cash/cash-sheet';
import { figureParts } from '@/i18n/money-format';
import { wholeMinor } from '@/lib/money';
import type { PaymentMethod, Profile } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

export type WalletColumnProps = {
  /** Active credit cards for the person in view. */
  readonly cards: readonly PaymentMethod[];
  readonly bills: MonthBills | undefined;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly cash: CashSummary | undefined;
  readonly currency: Currency;
  readonly today: LocalDate;
};

/** "₪8,942": whole units, as an LTR run so it reads the same inside Hebrew text. */
function wholeAmount(minor: number, currency: Currency, locale: string): string {
  const { sign, symbol, digits } = figureParts(wholeMinor(minor, currency), currency, {
    locale,
    whole: true,
  });
  return `⁦${sign}${symbol}${digits}⁩`;
}

/**
 * The wallet (§5.1): the cards heading with "+ Card", one card sheet per
 * card for the five largest bills this month (sides swapping, the bill as a
 * 104px figure cut at half depth, its billing day in the box), "All cards"
 * when there are more, then the cash box. Not a sheet itself: the paper shows
 * through between its sheets.
 */
export function WalletColumn({ cards, bills, profiles, cash, currency }: WalletColumnProps) {
  const { t, i18n } = useTranslation(['common', 'cards']);
  const { t: tCards } = useTranslation('cards');
  const titleId = useId();
  const top = [...cards]
    .sort((a, b) => (bills?.byCard.get(b.id)?.totalMinor ?? 0) - (bills?.byCard.get(a.id)?.totalMinor ?? 0))
    .slice(0, 5);
  return (
    <section data-slot="wallet" aria-labelledby={titleId} className="grid gap-2">
      <div className="flex items-center justify-between gap-4 px-2 pt-3.5 pb-2">
        <TitlePair
          id={titleId}
          as="h2"
          size="sheet"
          className="leading-[1.55] [&>span]:mt-1 [&>span]:text-[1.3125rem]"
          title={t('nav.cards')}
          subtitle={
            bills === undefined || bills.totalMinor === 0
              ? undefined
              : t('board.walletSub', {
                  amount: wholeAmount(bills.totalMinor, currency, i18n.language),
                })
          }
        />
        <Button
          variant="pill"
          nativeButton={false}
          render={<Link role="link" to={`${ROUTES.cards}?add=card`} />}
        >
          {t('board.addCard')}
        </Button>
      </div>
      {top.length === 0 ? (
        <p className="px-2 font-light">{t('board.walletEmpty')}</p>
      ) : (
        top.map((card) => {
          const bill = bills?.byCard.get(card.id);
          const owner = profiles.get(card.profileId)?.name ?? tCards('shared');
          return (
            <CardSheet
              key={card.id}
              moneyKey={cardKey(card)}
              name={issuerLabel(card, tCards)}
              holder={owner}
              lastDigits={card.card?.lastDigits}
              billing={
                card.card?.billingDay === undefined
                  ? undefined
                  : tCards('billedOn', { day: card.card.billingDay })
              }
              figure={<Numeral minor={bill?.totalMinor ?? 0} currency={currency} size="card" rounded />}
            />
          );
        })
      )}
      {cards.length > top.length ? (
        <Link to={ROUTES.cards} className="px-2 font-medium underline decoration-2 underline-offset-4">
          {tCards('allCards')}
        </Link>
      ) : null}
      {cash === undefined || cash.people.length === 0 ? null : (
        <CashSheet
          summary={cash}
          currency={currency}
          actions={
            <>
              <Button
                variant="pill"
                nativeButton={false}
                render={<Link role="link" to={`${ROUTES.cash}?do=count`} />}
              >
                {t('board.count')}
              </Button>
              <Button
                variant="pill"
                nativeButton={false}
                render={<Link role="link" to={`${ROUTES.cash}?do=withdraw`} />}
              >
                {t('board.withdraw')}
              </Button>
            </>
          }
        />
      )}
    </section>
  );
}
