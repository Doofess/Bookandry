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
 *
 * A hue written `none` (a grey, white or black that is mixed with something)
 * is `Number.NaN` here, as CSS treats it: a missing component. It converts as
 * hue 0, which with chroma 0 is the same colour, and a mix takes the other
 * colour's hue instead of pulling toward red.
 */

export type Oklch = { readonly l: number; readonly c: number; readonly h: number };

/** Gamma-encoded sRGB, each channel 0..1. */
export type Rgb = readonly [number, number, number];

/** `oklch(0.523 0.121 156.1)` or `oklch(0.9 0 none / 0.5)` -> its components. Undefined if unparseable. */
export function parseOklch(value: string): Oklch | undefined {
  const match = /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+|none)/i.exec(value);
  if (match === null) return undefined;

  const [, rawL, rawC, rawH] = match;
  if (rawL === undefined || rawC === undefined || rawH === undefined) return undefined;

  // CSS allows either 0..1 or a percentage for lightness.
  const l = rawL.endsWith('%')
    ? Number(rawL.slice(0, -1)) / 100 // money-allow: a CSS percentage, not an amount.
    : Number(rawL);

  return { l, c: Number(rawC), h: rawH.toLowerCase() === 'none' ? Number.NaN : Number(rawH) };
}

/** Gamma-encoded sRGB, each channel 0..1, clipped into gamut as a screen shows it. */
export function oklchToSrgb({ l, c, h }: Oklch): Rgb {
  const radians = Number.isNaN(h) ? 0 : (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const lCone = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3; // money-allow: colour space maths
  const mCone = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3; // money-allow: colour space maths
  const sCone = (l - 0.0894841775 * a - 1.291485548 * b) ** 3; // money-allow: colour space maths

  const linear = [
    4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone,
  ];

  return linear.map(encodeGamma) as unknown as Rgb;
}

function encodeGamma(channel: number): number {
  const clipped = Math.min(Math.max(channel, 0), 1);
  return clipped <= 0.0031308 ? clipped * 12.92 : 1.055 * clipped ** (1 / 2.4) - 0.055; // money-allow: colour space maths
}

function decodeGamma(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; // money-allow: colour space maths
}

/** WCAG 2.2 relative luminance of a gamma-encoded sRGB triple. */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(decodeGamma) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 contrast ratio between two sRGB colours, 1:1 to 21:1. */
export function contrastRatioRgb(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG 2.2 contrast ratio between two colours, 1:1 to 21:1.
 *
 * Symmetric by construction - the lighter colour always ends up on top - so a
 * caller cannot get a different answer by passing the pair the other way round.
 */
export function contrastRatio(a: Oklch, b: Oklch): number {
  return contrastRatioRgb(oklchToSrgb(a), oklchToSrgb(b));
}

/**
 * `color-mix(in oklch, a <share>, b)` for two opaque colours: lightness and
 * chroma linearly, the hue the shorter way round the wheel. A missing hue
 * takes the other colour's, as CSS Color 4 says.
 */
export function mixOklch(a: Oklch, b: Oklch, share: number): Oklch {
  const l = a.l * share + b.l * (1 - share);
  const c = a.c * share + b.c * (1 - share);
  if (Number.isNaN(a.h) && Number.isNaN(b.h)) return { l, c, h: Number.NaN };

  const from = Number.isNaN(a.h) ? b.h : a.h;
  const to = Number.isNaN(b.h) ? a.h : b.h;
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  return { l, c, h: (((from + delta * (1 - share)) % 360) + 360) % 360 };
}

/** A translucent colour painted over an opaque one, the way the browser composites: in gamma-encoded sRGB. */
export function compositeOver(top: Oklch, alpha: number, bottom: Oklch): Rgb {
  const upper = oklchToSrgb(top);
  const lower = oklchToSrgb(bottom);
  return [0, 1, 2].map((i) => (upper[i] ?? 0) * alpha + (lower[i] ?? 0) * (1 - alpha)) as unknown as Rgb;
}

/** Whether an alpha written in a colour (`0`, `0%`) makes it transparent. */
function isClear(amount: string | undefined): boolean {
  return amount !== undefined && Number(amount.replace('%', '')) === 0;
}

/**
 * A colour as getComputedStyle reports it - rgb(), rgba(), oklch() as
 * written, or color(srgb …) for a color-mix() - as the #RRGGBB the browser's
 * chrome takes (`<meta name="theme-color">`). Undefined for a transparent
 * colour, or anything else.
 */
export function cssColorToHex(css: string): string | undefined {
  const value = css.trim();
  let channels: Rgb | undefined;

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(value);
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(value);
  if (rgb !== null) {
    if (isClear(rgb[4])) return undefined;
    channels = [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  } else if (srgb !== null) {
    if (isClear(srgb[4])) return undefined;
    channels = [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])];
  } else if (/^oklch\(/i.test(value)) {
    if (isClear(/\/\s*([\d.]+%?)\s*\)$/.exec(value)?.[1])) return undefined;
    const color = parseOklch(value);
    if (color !== undefined) channels = oklchToSrgb(color);
  }
  if (channels === undefined) return undefined;

  const hex = channels.map((channel) =>
    Math.round(Math.min(Math.max(channel, 0), 1) * 255) // money-allow: a colour channel, not money
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${hex.join('')}`.toUpperCase();
}
