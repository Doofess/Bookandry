import { CalendarClock } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import { Percent } from '@/components/percent';
import { billingDayOf, chargeDate, fxFeeFor } from '@/domain/cards';
import { formatLocalDate, isLocalDate } from '@/lib/dates';
import type { PaymentMethod } from '@/types/domain';
import type { Currency, Minor } from '@/types/money';

/**
 * What paying by this card means, said under the picker before saving: the
 * day the bank is actually charged for it, and the foreign-currency fee when
 * there is one. Nothing for anything that is not a credit card with a billing
 * day, because then there is nothing to say.
 */
export function CardChargeNote({
  method,
  date,
  currency,
  amountMinor,
}: {
  readonly method: PaymentMethod | undefined;
  readonly date: string;
  readonly currency: Currency;
  readonly amountMinor: Minor | undefined;
}) {
  const { t, i18n } = useTranslation();
  const day = billingDayOf(method);
  const fee = fxFeeFor(method, currency);
  if ((day === undefined || !isLocalDate(date)) && fee === undefined) return null;

  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid="card-charge-note">
      <CalendarClock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {day === undefined || !isLocalDate(date)
          ? null
          : t('tx.cardCharged', {
              date: formatLocalDate(chargeDate(date, day), i18n.language, { dateStyle: 'medium' }),
            })}
        {fee === undefined || amountMinor === undefined ? null : (
          <>
            {' '}
            <Trans i18nKey="tx.cardFxFee" components={{ rate: <Percent rate={fee} /> }} />
          </>
        )}
      </span>
    </p>
  );
}
