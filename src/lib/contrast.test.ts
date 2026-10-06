import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { contrastRatio, oklchToSrgb, parseOklch, relativeLuminance, type Oklch } from './color';

/**
 * The contrast audit, mechanised.
 *
 * "Audit every screen" is a gate nobody can check twice the same way. These are
 * the pairs the design actually depends on, read out of the token file itself,
 * so a tweak to a token is checked by the suite rather than by whoever next
 * happens to look at the screen in the wrong theme.
 *
 * Five of these pairs FAILED in the original spec - the accent at 3.30:1
 * against a 4.5:1 requirement, white on the fill at 2.39:1, the input border at
 * 1.27:1, the dark chart expense at 2.50:1. They were fixed by hand once. This
 * is what keeps them fixed.
 */

const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

/** Tokens declared in one block: `:root` for light, `.dark` for dark. */
function tokens(selector: string): Record<string, Oklch> {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`No ${selector} block in index.css`);

  const open = CSS.indexOf('{', start);
  const close = CSS.indexOf('\n}', open);
  const block = CSS.slice(open, close);

  const out: Record<string, Oklch> = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*(oklch\([^)]*\))/g)) {
    if (name === undefined || value === undefined) continue;
    const parsed = parseOklch(value);
    if (parsed !== undefined) out[name] = parsed;
  }
  return out;
}

const LIGHT = tokens(':root {');
const DARK = tokens('.dark {');

const get = (theme: Record<string, Oklch>, name: string): Oklch => {
  const token = theme[name];
  if (token === undefined) throw new Error(`Token ${name} not found`);
  return token;
};

/**
 * WCAG 2.2 minimums.
 *
 * Body text is 4.5:1. A UI COMPONENT BOUNDARY is 3:1 under 1.4.11 - which is
 * why `--border` and `--input` are separate tokens at all: a decorative divider
 * has no requirement, and the edge of a text field is the only thing telling a
 * low-vision user where to tap.
 */
const TEXT = 4.5;
const COMPONENT = 3;

const PAIRS = [
  // The headline correction. The spec's accent measured 3.30:1 on white.
  { name: 'primary-foreground on primary', on: 'primary', text: 'primary-foreground', min: TEXT },
  { name: 'foreground on background', on: 'background', text: 'foreground', min: TEXT },
  { name: 'foreground on card', on: 'card', text: 'foreground', min: TEXT },
  { name: 'muted-foreground on background', on: 'background', text: 'muted-foreground', min: TEXT },
  { name: 'muted-foreground on card', on: 'card', text: 'muted-foreground', min: TEXT },
  { name: 'muted-foreground on muted', on: 'muted', text: 'muted-foreground', min: TEXT },
  { name: 'accent-foreground on accent', on: 'accent', text: 'accent-foreground', min: TEXT },
  { name: 'secondary-foreground on secondary', on: 'secondary', text: 'secondary-foreground', min: TEXT },
  {
    name: 'destructive-foreground on destructive',
    on: 'destructive',
    text: 'destructive-foreground',
    min: TEXT,
  },
  /*
   * Destructive as TEXT, which is how `text-destructive` is actually used -
   * "Replace everything", "Delete profile". Checking only the pair above passed
   * a dark palette that carried the light-mode red straight over, leaving that
   * label at 3.03:1 on the dark page. axe caught it; this is what stops it
   * coming back.
   */
  { name: 'destructive as text on background', on: 'background', text: 'destructive', min: TEXT },
  { name: 'destructive as text on card', on: 'card', text: 'destructive', min: TEXT },
  // Amounts. An expense that fails contrast is a number the user misreads.
  { name: 'income on background', on: 'background', text: 'income', min: TEXT },
  { name: 'expense on background', on: 'background', text: 'expense', min: TEXT },
  { name: 'income on card', on: 'card', text: 'income', min: TEXT },
  { name: 'expense on card', on: 'card', text: 'expense', min: TEXT },
  // The tightest surface either amount actually lands on.
  { name: 'income on muted', on: 'muted', text: 'income', min: TEXT },
  { name: 'expense on muted', on: 'muted', text: 'expense', min: TEXT },

  /*
   * The FAB, which is the primary action on every screen.
   *
   * Its plus is BLACK on the vivid green, not white: white on that green is
   * 2.40:1 and fails outright, which is the trap the vivid accent set. The disc
   * itself is only 2.40:1 against a white page, so its boundary would not be
   * perceivable - the deeper rim is what carries 1.4.11, and is the reason that
   * token exists at all.
   */
  { name: 'fab-foreground on fab', on: 'fab', text: 'fab-foreground', min: TEXT },
  { name: 'fab-rim against background', on: 'background', text: 'fab-rim', min: COMPONENT },

  // Component boundaries: 1.4.11, not 1.4.3.
  { name: 'input against background', on: 'background', text: 'input', min: COMPONENT },
  { name: 'input against card', on: 'card', text: 'input', min: COMPONENT },
  { name: 'ring against background', on: 'background', text: 'ring', min: COMPONENT },
  // The chart encodes kind by SHAPE as well, but the dots still have to be
  // distinguishable from the surface they sit on.
  { name: 'chart-income against card', on: 'card', text: 'chart-income', min: COMPONENT },
  { name: 'chart-expense against card', on: 'card', text: 'chart-expense', min: COMPONENT },
  { name: 'chart-balance against card', on: 'card', text: 'chart-balance', min: COMPONENT },
] as const;

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s theme', (_theme, palette) => {
  it.each(PAIRS)('$name is at least $min:1', ({ on, text, min }) => {
    const ratio = contrastRatio(get(palette, `--${on}`), get(palette, `--${text}`));

    expect(ratio).toBeGreaterThanOrEqual(min);
  });

  it('defines every token the other theme defines', () => {
    // A token present in one theme and missing from the other inherits the
    // light value into dark mode, which is how a white-on-white label happens.
    const other = palette === LIGHT ? DARK : LIGHT;

    expect(Object.keys(palette).sort()).toEqual(Object.keys(other).sort());
  });
});

describe('the colour maths', () => {
  it('converts the OKLCH extremes to the sRGB ones', () => {
    expect(oklchToSrgb({ l: 0, c: 0, h: 0 })).toEqual([0, 0, 0]);
    expect(oklchToSrgb({ l: 1, c: 0, h: 0 }).map((c) => Math.round(c))).toEqual([1, 1, 1]);
  });

  it('agrees with the WCAG reference values', () => {
    // Black on white is 21:1 exactly. If this drifts, every threshold above is
    // measuring something other than contrast.
    const white = { l: 1, c: 0, h: 0 };
    const black = { l: 0, c: 0, h: 0 };

    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(relativeLuminance(oklchToSrgb(white))).toBeCloseTo(1, 5);
    expect(relativeLuminance(oklchToSrgb(black))).toBeCloseTo(0, 5);
  });

  it('is symmetric, so a pair cannot be argued either way', () => {
    const a = get(LIGHT, '--primary');
    const b = get(LIGHT, '--background');

    expect(contrastRatio(a, b)).toBe(contrastRatio(b, a));
  });

  it('accepts a percentage lightness, which CSS allows', () => {
    expect(parseOklch('oklch(52.3% 0.121 156.1)')?.l).toBeCloseTo(0.523, 5);
    expect(parseOklch('oklch(0.523 0.121 156.1)')?.l).toBeCloseTo(0.523, 5);
  });

  it('returns undefined for something that is not a colour', () => {
    expect(parseOklch('var(--primary)')).toBeUndefined();
  });
});
