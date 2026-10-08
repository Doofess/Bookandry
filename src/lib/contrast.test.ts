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
  // Sapphire. The brand is a TEXT colour now (links, the active tab), not only a fill.
  { name: 'primary as text on background', on: 'background', text: 'primary', min: TEXT },
  { name: 'primary as text on card', on: 'card', text: 'primary', min: TEXT },
  { name: 'primary as text on popover', on: 'popover', text: 'primary', min: TEXT },
  // The active phone tab: a sapphire icon and label on the soft accent pill.
  { name: 'primary on accent', on: 'accent', text: 'primary', min: TEXT },
  // A focused menu item: the popover's own text on the accent highlight.
  { name: 'popover-foreground on accent', on: 'accent', text: 'popover-foreground', min: TEXT },
  // The panel: every title, figure and pill label on it.
  {
    name: 'brand-deep-foreground on brand-deep',
    on: 'brand-deep',
    text: 'brand-deep-foreground',
    min: TEXT,
  },
  { name: 'ring against card', on: 'card', text: 'ring', min: COMPONENT },
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

/*
 * Dark-only pairs. The Add pill's 1px brand-vivid ring exists only in dark
 * mode, where the deep pill alone would not show its boundary on the
 * near-black page. In light mode the pill itself is 10.1:1 against white.
 */
describe('dark theme only', () => {
  it('the Add pill ring is at least 3:1 against the page', () => {
    expect(contrastRatio(get(DARK, '--background'), get(DARK, '--brand-vivid'))).toBeGreaterThanOrEqual(
      COMPONENT,
    );
  });
});

describe('the brand', () => {
  it('is sapphire, not green', () => {
    // Hue 261.5 is the spec's #0F3A8A. Green sat at 156-158.
    expect(get(LIGHT, '--brand-deep')).toEqual({ l: 0.374, c: 0.142, h: 261.5 });
    expect(get(DARK, '--brand-deep')).toEqual({ l: 0.314, c: 0.117, h: 261.7 });
    expect(get(LIGHT, '--primary')).toEqual({ l: 0.462, c: 0.175, h: 262.6 });
    expect(get(DARK, '--primary')).toEqual({ l: 0.779, c: 0.113, h: 259.7 });
  });

  it('pins the remaining sapphire tokens, so a floor-passing drift still fails', () => {
    expect(get(LIGHT, '--primary-hover')).toEqual({ l: 0.374, c: 0.142, h: 261.5 });
    expect(get(DARK, '--primary-hover')).toEqual({ l: 0.836, c: 0.082, h: 258.8 });
    expect(get(LIGHT, '--ring')).toEqual({ l: 0.546, c: 0.215, h: 262.9 });
    expect(get(DARK, '--ring')).toEqual({ l: 0.779, c: 0.113, h: 259.7 });
    expect(get(LIGHT, '--accent')).toEqual({ l: 0.959, c: 0.019, h: 260.2 });
    expect(get(DARK, '--accent')).toEqual({ l: 0.314, c: 0.085, h: 263.5 });
    expect(get(LIGHT, '--accent-foreground')).toEqual({ l: 0.374, c: 0.142, h: 261.5 });
    expect(get(DARK, '--accent-foreground')).toEqual({ l: 0.779, c: 0.113, h: 259.7 });
    expect(get(LIGHT, '--primary-foreground')).toEqual({ l: 1, c: 0, h: 0 });
    expect(get(DARK, '--primary-foreground')).toEqual({ l: 0.253, c: 0.084, h: 263 });
    expect(get(LIGHT, '--brand-vivid')).toEqual({ l: 0.702, c: 0.158, h: 255.6 });
    expect(get(DARK, '--brand-vivid')).toEqual({ l: 0.702, c: 0.158, h: 255.6 });
  });

  it('keeps the dark front-door links readable: brand-vivid text on the page is 7:1', () => {
    expect(contrastRatio(get(DARK, '--background'), get(DARK, '--brand-vivid'))).toBeGreaterThanOrEqual(7);
  });

  it('keeps income green', () => {
    expect(get(LIGHT, '--income').h).toBeCloseTo(156.1, 1);
    expect(get(DARK, '--chart-income').h).toBeCloseTo(159.7, 1);
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
