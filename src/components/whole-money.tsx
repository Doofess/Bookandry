import { cn } from 'cn';
import { useTranslation } from 'react-i18next';

import { figureParts, formatMoney } from '@/i18n/money-format';
import { wholeMinor } from '@/lib/money';
import type { Currency, Minor } from '@/types/money';

/**
 * A whole-unit figure as the concept draws it (₪23,900): the sign, the symbol
 * and the digits, in a left-to-right island; the exact amount, agorot and
 * all, for a screen reader.
 */
export function WholeMoney({
  minor,
  currency,
  className,
}: {
  readonly minor: Minor;
  readonly currency: Currency;
  readonly className?: string;
}) {
  const { i18n } = useTranslation();
  const parts = figureParts(wholeMinor(minor, currency), currency, { locale: i18n.language, whole: true });
  return (
    <>
      <span aria-hidden="true" dir="ltr" className={cn('[unicode-bidi:isolate]', className)}>
        {parts.sign}
        {parts.symbol}
        {parts.digits}
      </span>
      <span className="sr-only">{formatMoney(minor, currency, { locale: i18n.language }).aria}</span>
    </>
  );
}
