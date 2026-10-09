import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { contrastRatio, oklchToSrgb, parseOklch, relativeLuminance } from './color';
import { declarations, paintRatio, resolveTheme } from './css-tokens';

/**
 * The contrast audit, mechanised, for the house: ink on warm paper, sapphire
 * for the app's own actions (§1.1). Money colours and category hues are
 * `money-colours.test.ts`.
 *
 * Read out of the token file itself and resolved as a browser resolves it,
 * aliases and mixes included, so a tweak to a token is checked by the suite
 * rather than by whoever next looks at the screen in the wrong theme.
 */

const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const ROOT = declarations(CSS, ':root');
const DARK_LAYER = declarations(CSS, '.dark');
const LIGHT = resolveTheme(ROOT);
const DARK = resolveTheme(ROOT, DARK_LAYER);

/** WCAG 2.2: body text 4.5:1; a component boundary or focus indicator 3:1 (1.4.11). */
const TEXT = 4.5;
const COMPONENT = 3;

const PAIRS = [
  { name: 'ink on the page', text: 'foreground', on: 'background', min: TEXT },
  { name: 'ink on the paper sheet', text: 'foreground', on: 'card', min: TEXT },
  { name: 'quiet text on the page', text: 'muted-foreground', on: 'background', min: TEXT },
  { name: 'quiet text on the sheet', text: 'muted-foreground', on: 'card', min: TEXT },
  { name: 'quiet text on muted', text: 'muted-foreground', on: 'muted', min: TEXT },
  { name: 'secondary text', text: 'secondary-foreground', on: 'secondary', min: TEXT },
  { name: 'text on sapphire', text: 'primary-foreground', on: 'primary', min: TEXT },
  { name: 'sapphire as text on the page', text: 'primary-ink', on: 'background', min: TEXT },
  { name: 'sapphire as text on the sheet', text: 'primary-ink', on: 'card', min: TEXT },
  { name: 'sapphire as text on a popover', text: 'primary-ink', on: 'popover', min: TEXT },
  { name: 'a menu item on its highlight', text: 'popover-foreground', on: 'accent', min: TEXT },
  { name: 'sapphire on the highlight', text: 'primary-ink', on: 'accent', min: TEXT },
  { name: 'the box', text: 'on-box', on: 'box-fill', min: TEXT },
  { name: 'lifted sapphire in the box', text: 'primary-hi', on: 'box-fill', min: TEXT },
  { name: 'paper on the ink sheet', text: 'on-night', on: 'night', min: TEXT },
  { name: 'the flipped box on the ink sheet', text: 'night', on: 'on-night', min: TEXT },
  { name: 'a pressed control', text: 'on-press', on: 'press', min: TEXT },
  { name: 'the front door panel', text: 'brand-deep-foreground', on: 'brand-deep', min: TEXT },
  { name: 'destructive fill', text: 'destructive-foreground', on: 'destructive', min: TEXT },
  { name: 'destructive as text on the page', text: 'destructive', on: 'background', min: TEXT },
  { name: 'destructive as text on the sheet', text: 'destructive', on: 'card', min: TEXT },
  { name: 'destructive on muted', text: 'destructive', on: 'muted', min: TEXT },
  { name: 'income on the page', text: 'income', on: 'background', min: TEXT },
  { name: 'income on the sheet', text: 'income', on: 'card', min: TEXT },
  { name: 'income on muted', text: 'income', on: 'muted', min: TEXT },
  { name: 'expense on the page', text: 'expense', on: 'background', min: TEXT },
  { name: 'expense on the sheet', text: 'expense', on: 'card', min: TEXT },
  { name: 'expense on muted', text: 'expense', on: 'muted', min: TEXT },
  // Component boundaries: 1.4.11, not 1.4.3. --input is a field's only affordance (decision 15).
  { name: 'field edge on the page', text: 'input', on: 'background', min: COMPONENT },
  { name: 'field edge on the sheet', text: 'input', on: 'card', min: COMPONENT },
  { name: 'focus ring on the page', text: 'ring', on: 'background', min: COMPONENT },
  { name: 'focus ring on the sheet', text: 'ring', on: 'card', min: COMPONENT },
  { name: 'chart income dots', text: 'chart-income', on: 'card', min: COMPONENT },
  { name: 'chart expense dots', text: 'chart-expense', on: 'card', min: COMPONENT },
  { name: 'chart balance line', text: 'chart-balance', on: 'card', min: COMPONENT },
] as const;

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s theme', (_theme, palette) => {
  it.each(PAIRS)('$name is at least $min:1', ({ text, on, min }) => {
    const ratio = paintRatio(palette(`--${text}`), palette(`--${on}`), palette('--popover'));

    expect(ratio).toBeGreaterThanOrEqual(min);
  });
});

/** Names whose :root value is a literal oklch(): the colours a theme must restate. */
const literals = (layer: ReadonlyMap<string, string>) =>
  [...layer].filter(([, value]) => value.startsWith('oklch(')).map(([name]) => name);

describe('the two themes', () => {
  it('restate every literal colour in dark mode', () => {
    // A literal missing from .dark inherits the light value into dark mode,
    // which is how a white-on-white label happens.
    const dark = new Set(DARK_LAYER.keys());
    expect(literals(ROOT).filter((name) => !dark.has(name))).toEqual([]);
  });

  it('declare nothing in dark mode that light mode lacks', () => {
    expect([...DARK_LAYER.keys()].filter((name) => !ROOT.has(name))).toEqual([]);
  });
});

describe('the house (§1.1), pinned so a floor-passing drift still fails', () => {
  it('is warm paper and cool ink', () => {
    expect(LIGHT('--background').color).toEqual({ l: 0.962, c: 0.012, h: 85 });
    expect(LIGHT('--card').color).toEqual({ l: 0.992, c: 0.006, h: 85 });
    expect(LIGHT('--foreground').color).toEqual({ l: 0.2, c: 0.018, h: 265 });
    expect(DARK('--background').color).toEqual({ l: 0.2, c: 0.012, h: 70 });
    expect(DARK('--card').color).toEqual({ l: 0.255, c: 0.012, h: 70 });
    expect(DARK('--foreground').color).toEqual({ l: 0.95, c: 0.012, h: 85 });
  });

  it('keeps sapphire for the app, deeper in dark mode, with its own text token', () => {
    expect(LIGHT('--primary').color).toEqual({ l: 0.462, c: 0.175, h: 263 });
    expect(DARK('--primary').color).toEqual({ l: 0.42, c: 0.165, h: 263 });
    expect(LIGHT('--primary-ink').color).toEqual(LIGHT('--primary').color);
    expect(DARK('--primary-ink').color).toEqual({ l: 0.78, c: 0.12, h: 263 });
    // Decision 14: the dark fill as text on the dark paper would be 2.06:1.
    expect(contrastRatio(DARK('--primary').color, DARK('--background').color)).toBeLessThan(TEXT);
  });

  it('focuses in sapphire on the paper: the fill in light, the text token in dark', () => {
    expect(LIGHT('--ring').color).toEqual(LIGHT('--primary').color);
    expect(DARK('--ring').color).toEqual(DARK('--primary-ink').color);
  });

  it('keeps income green and the highlight neutral', () => {
    expect(LIGHT('--income').color.h).toBe(155);
    expect(DARK('--income').color.h).toBe(155);
    expect(LIGHT('--accent').alpha).toBeCloseTo(0.06, 10);
    expect(LIGHT('--accent').color).toEqual(LIGHT('--foreground').color);
  });

  it('keeps the front door’s dark links readable', () => {
    // The front door keeps its sapphire panel (decision 39); its dark-mode links take --brand-vivid.
    expect(contrastRatio(DARK('--background').color, DARK('--brand-vivid').color)).toBeGreaterThanOrEqual(
      TEXT,
    );
  });

  it('has no --primary-hover any more: nothing used it', () => {
    expect(ROOT.has('--primary-hover')).toBe(false);
  });
});

describe('the colour maths', () => {
  it('converts the OKLCH extremes to the sRGB ones', () => {
    expect(oklchToSrgb({ l: 0, c: 0, h: 0 })).toEqual([0, 0, 0]);
    expect(oklchToSrgb({ l: 1, c: 0, h: 0 }).map((c) => Math.round(c))).toEqual([1, 1, 1]);
  });

  it('agrees with the WCAG reference values', () => {
    const white = { l: 1, c: 0, h: 0 };
    const black = { l: 0, c: 0, h: 0 };

    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(relativeLuminance(oklchToSrgb(white))).toBeCloseTo(1, 5);
    expect(relativeLuminance(oklchToSrgb(black))).toBeCloseTo(0, 5);
  });

  it('treats a none hue as the grey it is', () => {
    expect(oklchToSrgb({ l: 0.5, c: 0, h: Number.NaN })).toEqual(oklchToSrgb({ l: 0.5, c: 0, h: 0 }));
  });

  it('is symmetric, so a pair cannot be argued either way', () => {
    const a = LIGHT('--primary').color;
    const b = LIGHT('--background').color;

    expect(contrastRatio(a, b)).toBe(contrastRatio(b, a));
  });

  it('accepts a percentage lightness and a none hue, which CSS allows', () => {
    expect(parseOklch('oklch(52.3% 0.121 156.1)')?.l).toBeCloseTo(0.523, 5);
    expect(Number.isNaN(parseOklch('oklch(0.9 0 none)')?.h)).toBe(true);
  });

  it('returns undefined for something that is not a colour', () => {
    expect(parseOklch('var(--primary)')).toBeUndefined();
  });
});
