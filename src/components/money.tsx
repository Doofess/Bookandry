import { cn } from 'cn';
import { useTranslation } from 'react-i18next';

import { formatMoney, type SignMode } from '@/i18n/money-format';
import type { Currency, Minor } from '@/types/money';

export type MoneyProps = {
  readonly minor: Minor;
  readonly currency: Currency;
  readonly signMode?: SignMode;
  readonly className?: string;
};

/**
 * An amount, in a left-to-right island.
 *
 * Three things are happening here, none of them optional:
 *
 * 1. `dir="ltr"`. An amount is a mathematical run - symbol, digits, separators -
 *    and it reads the same way in every language. Left to inherit the page's
 *    RTL direction, a Hebrew "1,234.50 ₪" puts the symbol on the wrong side and
 *    a leading minus jumps to the end of the number.
 *
 * 2. The visible text is `aria-hidden` and a visually-hidden sibling carries the
 *    spoken form. `aria-label` on a plain `<span>` is not reliably exposed -
 *    the accessible-name calculation only applies it to elements with a role -
 *    and the spoken form is genuinely different: "1,234.50 US dollars" rather
 *    than a symbol a screen reader may or may not announce.
 *
 * 3. `data-value` carries the INTEGER. Every e2e assertion reads that, never the
 *    formatted string: pinning "$1,234.50" in a test makes the suite fail the
 *    next time ICU changes a separator, which it has done before.
 */
export function Money({ minor, currency, signMode = 'negative', className }: MoneyProps) {
  const { i18n } = useTranslation();
  const display = formatMoney(minor, currency, { locale: i18n.language, signMode });

  return (
    <span
      dir="ltr"
      className={cn('tabular inline-block', className)}
      data-value={minor}
      data-currency={currency}
    >
      <span aria-hidden="true">{display.text}</span>
      <span className="sr-only">{display.aria}</span>
    </span>
  );
}
