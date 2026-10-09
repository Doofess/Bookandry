import { cn } from 'cn';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { figureParts, formatMoney } from '@/i18n/money-format';
import { wholeMinor } from '@/lib/money';
import type { Currency, Minor } from '@/types/money';

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
 * The huge Karantina figure (§7.5). It fits its container (index.css sizes it
 * from `--glyphs` and `--numeral-max`, never under 28px) and runs off its
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
  className,
}: {
  readonly minor: Minor;
  readonly currency: Currency;
  readonly size: NumeralSize;
  /** Show whole units only; the twin keeps the exact amount. */
  readonly rounded?: boolean;
  readonly className?: string;
}) {
  const { i18n } = useTranslation();
  const whole = wholeMinor(minor, currency);
  const shown = rounded ? whole : minor;
  const isWhole = shown === whole;
  const parts = figureParts(shown, currency, { locale: i18n.language, whole: isWhole });
  // The sign and digits at full size, the symbol at half (rounded up): a glyph count, not money.
  const glyphs = parts.sign.length + parts.digits.length + Math.ceil(parts.symbol.length / 2); // money-allow: glyph count
  const bleeds = isWhole && !NEVER_BLEEDS.has(size);

  return (
    <span className={cn('relative block min-w-0', className)}>
      <span
        aria-hidden="true"
        data-numeral=""
        dir="ltr"
        className="block font-display whitespace-nowrap [unicode-bidi:isolate]"
        style={
          {
            '--glyphs': String(glyphs),
            '--numeral-max': NUMERAL_MAX[size],
            ...(bleeds ? {} : { '--b': '0' }),
          } as CSSProperties
        }
      >
        {parts.sign}
        {/* Half size, raised 0.62em, so it ends far above the cut (§9.4). */}
        <span className="me-[0.04em] align-[0.62em] text-[0.5em]">{parts.symbol}</span>
        {parts.digits}
      </span>
      <span className="sr-only">{formatMoney(minor, currency, { locale: i18n.language }).aria}</span>
    </span>
  );
}
