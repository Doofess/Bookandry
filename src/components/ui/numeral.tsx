import { cn } from 'cn';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { figureParts, formatMoney } from '@/i18n/money-format';
import { wholeMinor } from '@/lib/money';
import type { Currency, Minor } from '@/types/money';

import { numeralUnits } from './numeral-units';

export type NumeralSize = 'balance' | 'left' | 'cash' | 'card' | 'account' | 'day';

/**
 * Each size's cap (§9.5), fluid from its phone size at 390 to its desktop
 * size at 1440, within good-css's 2.5x zoom limit. The figure is smaller when
 * its container is narrower: index.css fits it by glyph count.
 */
export const NUMERAL_MAX: Record<NumeralSize, string> = {
  balance: 'clamp(7.375rem, 4.2643rem + 12.7619vw, 15.75rem)', // 118 -> 252
  left: 'clamp(6rem, 4.3286rem + 6.8571vw, 10.5rem)', // 96 -> 168
  cash: 'clamp(6rem, 4.7464rem + 5.1429vw, 9.375rem)', // 96 -> 150
  card: 'clamp(5.75rem, 5.4714rem + 1.1429vw, 6.5rem)', // 92 -> 104
  account: 'clamp(2.5rem, 2.2214rem + 1.1429vw, 3.25rem)', // 40 -> 52
  day: '2.125rem', // 34
};

/** Figures that never run off their sheet (§9.4: account sheets' figures, the charges list's days). */
const NEVER_BLEEDS: ReadonlySet<NumeralSize> = new Set(['account', 'day']);

/**
 * The huge Karantina figure (§7.5). It fits its own column by Karantina's real
 * advance widths (index.css sizes it from `--numeral-units` and `--numeral-max`,
 * never under 28px); a parent must give that column its width (a block, a grid
 * cell or a `flex-1` item), never size it to its content. It runs off its
 * sheet's foot by `--numeral-bleed` (§9.4) - unless it has a fraction, which
 * never bleeds, or its size never does.
 *
 * Cutting is visual only. The visible figure is aria-hidden and a visually
 * hidden twin says the exact amount, agorot included, as Money does.
 */
export function Numeral({
  minor,
  currency,
  size,
  rounded = false,
  fit,
  className,
}: {
  readonly minor: Minor;
  readonly currency: Currency;
  readonly size: NumeralSize;
  /** Show whole units only; the twin keeps the exact amount. */
  readonly rounded?: boolean;
  /** Size the figure for this amount instead (a count-up passes the settled one), so it never jitters. */
  readonly fit?: Minor;
  readonly className?: string;
}) {
  const { i18n } = useTranslation();
  const whole = wholeMinor(minor, currency);
  const shown = rounded ? whole : minor;
  const isWhole = shown === whole;
  const parts = figureParts(shown, currency, { locale: i18n.language, whole: isWhole });
  const fitted =
    fit === undefined
      ? parts
      : figureParts(rounded ? wholeMinor(fit, currency) : fit, currency, {
          locale: i18n.language,
          whole: isWhole,
        });
  const units = numeralUnits(fitted); // money-allow: glyph widths, not money
  const bleeds = isWhole && !NEVER_BLEEDS.has(size);

  return (
    // Its own size container: 100cqi is this column, never a wider ancestor's (CAN WAIT 2). The small
    // figures that never bleed (an account's, a charge day's) sit in auto-sized cells and take their cap.
    <span
      className={cn(
        NEVER_BLEEDS.has(size) ? 'relative inline-block' : '@container relative block min-w-0',
        className,
      )}
    >
      <span
        aria-hidden="true"
        data-numeral=""
        data-value={shown}
        data-numeral-size={size}
        dir="ltr"
        className="block font-display [unicode-bidi:isolate]"
        style={
          {
            '--numeral-units': String(units),
            '--numeral-max': NUMERAL_MAX[size],
            ...(bleeds ? {} : { '--b': '0' }),
          } as CSSProperties
        }
      >
        {parts.sign}
        {/* Half size, raised 0.62em, so it ends far above the cut (9.4). */}
        <span className="me-[0.04em] align-[0.62em] text-[0.5em]">{parts.symbol}</span>
        {/* A figure that would need less than 28px breaks here, never inside the digits (12). */}
        <wbr />
        <span className="whitespace-nowrap">{parts.digits}</span>
      </span>
      <span className="sr-only">{formatMoney(minor, currency, { locale: i18n.language }).aria}</span>
    </span>
  );
}
