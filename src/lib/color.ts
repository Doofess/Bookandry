/**
 * OKLCH to sRGB, and WCAG contrast.
 *
 * The design tokens are authored in OKLCH - which is what shadcn generates
 * under Tailwind v4, and what makes a perceptually even palette possible - but
 * WCAG 2.2 defines contrast over sRGB relative luminance. Without this
 * conversion "contrast-audited" means somebody pasted a hex value into a web
 * tool once, and every later tweak is unverified.
 *
 * The matrices are Björn Ottosson's published OKLab constants. They are
 * reproduced rather than approximated: a rounded matrix shifts a ratio by a
 * few hundredths, which is exactly the margin a 4.5:1 requirement is decided by.
 */

export type Oklch = { readonly l: number; readonly c: number; readonly h: number };

/** `oklch(0.523 0.121 156.1)` -> its components. Returns undefined if unparseable. */
export function parseOklch(value: string): Oklch | undefined {
  const match = /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i.exec(value);
  if (match === null) return undefined;

  const [, rawL, rawC, rawH] = match;
  if (rawL === undefined || rawC === undefined || rawH === undefined) return undefined;

  // CSS allows either 0..1 or a percentage for lightness.
  const l = rawL.endsWith('%')
    ? Number(rawL.slice(0, -1)) / 100 // money-allow: a CSS percentage, not an amount.
    : Number(rawL);

  return { l, c: Number(rawC), h: Number(rawH) };
}

/** Gamma-encoded sRGB, each channel 0..1, clipped into gamut. */
export function oklchToSrgb({ l, c, h }: Oklch): readonly [number, number, number] {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const lCone = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCone = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCone = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear = [
    4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone,
  ];

  return linear.map(encodeGamma) as unknown as readonly [number, number, number];
}

function encodeGamma(channel: number): number {
  const clipped = Math.min(Math.max(channel, 0), 1);
  return clipped <= 0.0031308 ? clipped * 12.92 : 1.055 * clipped ** (1 / 2.4) - 0.055;
}

function decodeGamma(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.2 relative luminance of a gamma-encoded sRGB triple. */
export function relativeLuminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb.map(decodeGamma) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.2 contrast ratio between two colours, 1:1 to 21:1.
 *
 * Symmetric by construction - the lighter colour always ends up on top - so a
 * caller cannot get a different answer by passing the pair the other way round.
 */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const first = relativeLuminance(oklchToSrgb(a));
  const second = relativeLuminance(oklchToSrgb(b));
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);

  return (lighter + 0.05) / (darker + 0.05);
}
