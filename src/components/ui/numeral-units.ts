/**
 * Karantina 700's advance widths, in units per 1000 em, measured in Chromium
 * from @fontsource/karantina 5.3.0 (canvas measureText at 1000px, 2026-10-10).
 * The digits are proportional (243 to 383), so a figure's width is the sum of
 * its glyphs, not their count: "₪58,555" is 2.096em, which is what lets the
 * concept's 252px balance fit its 580px column exactly (phase 3 plan,
 * decision 6). Zero-width direction marks a Hebrew format adds count nothing.
 */
export const KARANTINA_ADVANCE: Readonly<Record<string, number>> = {
  '0': 350,
  '1': 243,
  '2': 307,
  '3': 307,
  '4': 383,
  '5': 307,
  '6': 340,
  '7': 319,
  '8': 350,
  '9': 350,
  ',': 152,
  '.': 143,
  '₪': 652,
  $: 346,
  '€': 427,
  '£': 431,
  '¥': 409,
  '−': 280,
  '-': 274,
  ' ': 200,
  ' ': 200,
  '‎': 0,
  '‏': 0,
  '⁦': 0,
  '⁧': 0,
  '⁨': 0,
  '⁩': 0,
};

/** The widest digit: an unknown glyph is assumed this wide, so a figure never overflows. */
const WIDEST = 383;

/** The symbol is drawn at half size with 0.04em after it (section 9.5). */
const SYMBOL_GAP = 40;

export function numeralUnits(parts: {
  readonly sign: string;
  readonly symbol: string;
  readonly digits: string;
}): number {
  const width = (text: string) => {
    let total = 0;
    for (const glyph of text) total += KARANTINA_ADVANCE[glyph] ?? WIDEST;
    return total;
  };
  const symbol = parts.symbol === '' ? 0 : Math.ceil(width(parts.symbol) / 2) + SYMBOL_GAP;
  return width(parts.sign) + symbol + width(parts.digits);
}
