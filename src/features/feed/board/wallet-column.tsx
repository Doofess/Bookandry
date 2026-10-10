import { useTranslation } from 'react-i18next';

import { TitlePair } from '@/components/ui/title-pair';
import type { CashSummary } from '@/domain/cash';
import type { MonthBills } from '@/domain/month-bills';
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

/** Task 11 draws the card sheets and the cash sheet; until then, the column's heading. */
export function WalletColumn(_props: WalletColumnProps) {
  const { t } = useTranslation();
  return (
    <div data-slot="wallet" className="grid gap-2">
      <TitlePair as="h2" size="sheet" title={t('nav.cards')} />
    </div>
  );
}
