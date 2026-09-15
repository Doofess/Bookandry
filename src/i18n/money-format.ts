import { exponentOf } from '@/lib/currency-meta';
import { toDecimalString } from '@/lib/money';
import type { Currency, Minor } from '@/types/money';

/**
 * Rendering money, which is almost entirely a bidi problem.
 *
 * Verified against this ICU build rather than recalled:
 *
 *   en / USD  "$1,234.50"
 *   he / ILS  "\u200F1,234.50\u00A0\u200F\u20AA"   <- TWO RLM marks, and an NBSP
 *   he / USD  "\u200F1,234.50\u00A0\u200F$"
 *   en / KWD  "KWD\u00A01,234.500"                 <- code, not a symbol; 3 decimals
 *
 * CLDR's `he` currency pattern injects a right-to-left mark before the number
 * AND before the symbol. Left in place inside an LTR island they reorder the
 * run; stripped out and rendered LTR, the amount reads correctly in both
 * languages. So: always `formatToParts`, never the concatenated string.
 */

/** Bidi controls CLDR injects, plus the isolates a pasted value can carry. */
const BIDI_MARKS = /[\u200E\u200F؜‪-‮⁦-⁩]/g;

/** U+2212, not an ASCII hyphen: this is a mathematical minus, not a dash. */
export const MINUS_SIGN = '−';
export const PLUS_SIGN = '+';

export type SignMode = 'never' | 'negative' | 'always';

export type MoneyDisplay = {
  /** The magnitude, bidi marks removed. Render inside a `dir="ltr"` island. */
  readonly magnitude: string;
  /** '', '−' or '+'. Owned by us, because `kind` carries the sign. */
  readonly sign: string;
  /** sign + magnitude, for tests and for a plain-text context. */
  readonly text: string;
  /** Spoken form, with the currency NAMED rather than symbolised. */
  readonly aria: string;
};

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, currency: Currency, display: 'symbol' | 'name'): Intl.NumberFormat {
  const key = `${locale}|${currency}|${display}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;

  const digits = exponentOf(currency);
  const created = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: display,
    // We own the sign. `Intl`'s own minus varies by locale and would sit on the
    // wrong side of an RTL run.
    signDisplay: 'never',
    // Pinned to the FROZEN ISO exponent, not left to CLDR: `minorUnits` differ
    // between ICU builds, and the stored integer means nothing without it.
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  formatterCache.set(key, created);
  return created;
}

/**
 * Hand an exact decimal string to `Intl`.
 *
 * `Intl.NumberFormat` has accepted decimal strings since ES2023 and parses
 * them exactly, which is the whole point: `Number("12345678901234567.89")`
 * loses digits, and this is money. The lib types describe the parameter as the
 * template-literal type `StringNumericLiteral`, which no computed string can
 * satisfy, so the cast is the assertion that `toDecimalString` emits exactly
 * that shape - and it always does, by construction.
 */
function partsOf(format: Intl.NumberFormat, decimal: string): Intl.NumberFormatPart[] {
  return format.formatToParts(decimal as Intl.StringNumericLiteral);
}

function stripBidi(value: string): string {
  return value.replace(BIDI_MARKS, '');
}

/**
 * Assemble from parts, dropping the bidi marks CLDR puts in the literals.
 *
 * Only `literal` parts are touched. Stripping the whole formatted string would
 * also be correct today, but would silently start removing content the day a
 * locale puts a mark inside a `currency` part.
 */
function assemble(parts: readonly Intl.NumberFormatPart[]): string {
  return parts.map((part) => (part.type === 'literal' ? stripBidi(part.value) : part.value)).join('');
}

/**
 * Format a stored integer amount.
 *
 * The value reaches `Intl` as an exact DECIMAL STRING, never a Number.
 * `Intl.NumberFormat` has accepted strings since ES2023 and parses them
 * exactly, so an amount near the safe-integer ceiling formats with every digit
 * intact - `Number("12345678901234567.89")` would not.
 */
export function formatMoney(
  minor: Minor,
  currency: Currency,
  options: { locale: string; signMode?: SignMode },
): MoneyDisplay {
  const { locale, signMode = 'negative' } = options;

  const negative = minor < 0;
  // Math.abs(-0) is 0, which is what we want: a zero balance is never "minus".
  const decimal = toDecimalString(Math.abs(minor), currency);

  const magnitude = assemble(partsOf(formatter(locale, currency, 'symbol'), decimal));
  const named = assemble(partsOf(formatter(locale, currency, 'name'), decimal));

  let sign = '';
  if (signMode !== 'never') {
    if (negative) sign = MINUS_SIGN;
    else if (signMode === 'always' && minor !== 0) sign = PLUS_SIGN;
  }

  return {
    magnitude,
    sign,
    text: `${sign}${magnitude}`,
    aria: `${sign}${named}`,
  };
}

/** The sign a calculator applies, given the row's kind. */
export function signedMinor(kind: 'income' | 'expense', amountMinor: Minor): Minor {
  return kind === 'income' ? amountMinor : -amountMinor;
}

/**
 * An exchange rate, as a sentence with both units.
 *
 * Never a bare "Exchange rate" field: the direction is otherwise ambiguous and
 * getting it backwards is a ~15x error in the headline balance.
 */
export function formatRateSentence(
  from: Currency,
  to: Currency,
  rate: string,
  locale: string,
): { from: string; to: string; rate: string } {
  const decimals = Math.min(8, (rate.split('.')[1] ?? '').length);
  return {
    from,
    to,
    rate: new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: false,
    }).format(rate as Intl.StringNumericLiteral),
  };
}

/** Localised currency name for the picker; falls back to the code itself. */
export function currencyName(code: Currency, locale: string): string {
  try {
    const names = new Intl.DisplayNames([locale], { type: 'currency', fallback: 'none' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * A compact amount for a chart axis tick: "$1.2K", "‏₪1.2 אלף".
 *
 * Axis labels have room for about six characters, and a full "1,234,567.00"
 * tick either overlaps its neighbour or forces the plot area down to nothing.
 *
 * Still no float: `Intl.NumberFormat` has accepted exact decimal STRINGS since
 * ES2023, so the value reaches the formatter with every digit intact and the
 * rounding to one decimal is the formatter's, not ours. The bidi marks are
 * stripped for the same reason as everywhere else - the tick renders inside the
 * chart's LTR island.
 */
export function formatCompactMoney(minor: Minor, currency: Currency, locale: string): string {
  const decimal = toDecimalString(Math.abs(minor), currency);
  const text = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
  })
    .format(decimal as Intl.StringNumericLiteral)
    .replace(BIDI_MARKS, '');

  return minor < 0 ? `${MINUS_SIGN}${text}` : text;
}
