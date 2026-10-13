import { useTranslation } from 'react-i18next';

import { PersonAvatar } from '@/components/person-avatar';
import { Button } from '@/components/ui/button';
import { Numeral } from '@/components/ui/numeral';
import { Sheet } from '@/components/ui/sheet-surface';
import type { PersonCash } from '@/domain/cash';
import { formatLocalDate } from '@/lib/dates';
import type { Profile } from '@/types/domain';
import type { Currency } from '@/types/money';

/** One person's cash (§5.5): a paper sheet, sides swapping with the next, their figure and their three actions. */
export function CashPerson({
  person,
  cash,
  currency,
  onCount,
  onWithdraw,
  onDeposit,
}: {
  readonly person: Profile;
  readonly cash: PersonCash;
  readonly currency: Currency;
  readonly onCount: () => void;
  readonly onWithdraw: () => void;
  readonly onDeposit: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Sheet
      kind="paper"
      as="article"
      data-slot="cash-person"
      className="grid content-start gap-4 [&:nth-child(even_of_[data-slot=cash-person])_[data-slot=cash-person-head]]:flex-row-reverse"
    >
      <div data-slot="cash-person-head" className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-3 text-xl leading-[1.1] font-semibold">
          <PersonAvatar person={person} size="rail" />
          <span>
            {person.name}
            <span className="block text-[0.9375rem] font-light">
              {t('cash.counted', {
                date: formatLocalDate(cash.countedOn, i18n.language, { day: 'numeric', month: 'short' }),
              })}
            </span>
          </span>
        </h3>
        <Numeral minor={cash.onHandMinor} currency={currency} size="account" rounded />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="pill" onClick={onCount}>
          {t('board.count')}
        </Button>
        <Button variant="pill" onClick={onWithdraw}>
          {t('board.withdraw')}
        </Button>
        <Button variant="pill" onClick={onDeposit}>
          {t('board.deposit')}
        </Button>
      </div>
    </Sheet>
  );
}
