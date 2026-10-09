import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { contrastRatio, mixOklch, type Oklch } from './color';
import { declarations, resolveTheme } from './css-tokens';

/**
 * Money colours (§1.3), category hues (§1.4) and the sheet contexts (§1.6).
 *
 * The rules a person cannot see break in a screenshot until it is too late:
 * tint text that dropped under 4.5:1, a tint whose hue drifted from its
 * sheet's, a hue too pale to see on the paper, a field edge that vanishes
 * inside a sheet. All of them are here, for every key, in both themes.
 */

const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const ROOT = declarations(CSS, ':root');
const LIGHT = resolveTheme(ROOT);
const DARK = resolveTheme(ROOT, declarations(CSS, '.dark'));
const THEMES = [
  ['light', LIGHT],
  ['dark', DARK],
] as const;

const BANKS = ['10', '12', '11', '20', '17', '31', '52', '14', '26', '46', '4', '18'];
const ISSUERS = ['isracard', 'cal', 'max', 'amex', 'diners'];
const CARDS = ['black', 'silver', 'blue', 'teal', 'green', 'gold', 'orange', 'red', 'rose', 'purple'];
const MONEY_KEYS = [
  ...BANKS.map((code) => `bank-${code}`),
  ...ISSUERS.map((issuer) => `issuer-${issuer}`),
  ...CARDS.map((key) => `card-${key}`),
  'cash',
];
const HUES = [
  'indigo',
  'green',
  'vermilion',
  'amber',
  'orange',
  'cyan',
  'violet',
  'rose',
  'magenta',
  'teal',
  'blue',
  'lime',
];

const color = (theme: (name: string) => { color: Oklch }, name: string) => theme(name).color;
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

describe.each(THEMES)('money colours, %s', (_name, theme) => {
  it.each(MONEY_KEYS)('%s: its tint reads at 4.5:1 on its fill', (key) => {
    expect(
      contrastRatio(color(theme, `--money-${key}-on`), color(theme, `--money-${key}`)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(MONEY_KEYS)('%s: its lifted colour reads at 7:1 in the black box', (key) => {
    expect(
      contrastRatio(color(theme, `--money-${key}-hi`), color(theme, '--box-fill')),
    ).toBeGreaterThanOrEqual(7);
  });

  it.each(MONEY_KEYS)('%s: tint and lifted colour keep the fill’s hue within 2°', (key) => {
    const fill = color(theme, `--money-${key}`);
    if (fill.c < 0.01) return; // a grey fill (One Zero) has no hue to keep
    expect(hueGap(color(theme, `--money-${key}-on`).h, fill.h)).toBeLessThanOrEqual(2);
    expect(hueGap(color(theme, `--money-${key}-hi`).h, fill.h)).toBeLessThanOrEqual(2);
  });

  it.each(MONEY_KEYS)('%s: its tint follows the rule for a dark or a light sheet', (key) => {
    const tint = color(theme, `--money-${key}-on`);
    if (tint.l > 0.5) {
      // a dark sheet speaks in a pale tint
      expect(tint.l).toBeGreaterThanOrEqual(0.95);
      expect(tint.l).toBeLessThanOrEqual(0.97);
      expect(tint.c).toBeLessThanOrEqual(0.03);
    } else {
      // a light sheet speaks in a deep tint
      expect(tint.l).toBeGreaterThanOrEqual(0.2);
      expect(tint.l).toBeLessThanOrEqual(0.22);
      expect(tint.c).toBeGreaterThanOrEqual(0.045);
      expect(tint.c).toBeLessThanOrEqual(0.06);
    }
  });

  it.each([...MONEY_KEYS, 'neutral'])('%s: a field edge and the focus ring inside it reach 3:1', (key) => {
    const fill = color(theme, `--money-${key}`);
    const tint = color(theme, `--money-${key}-on`);
    // [data-sheet] { --input: color-mix(in oklch, var(--on-fill) 70%, var(--fill)); --ring: currentColor }
    expect(contrastRatio(mixOklch(tint, fill, 0.7), fill)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(tint, fill)).toBeGreaterThanOrEqual(3);
  });
});

describe('money colours, the pins (decision 8, §13.1)', () => {
  const light = (key: string) =>
    contrastRatio(color(LIGHT, `--money-${key}-on`), color(LIGHT, `--money-${key}`));

  it('measures the three darkened brands where the spec says', () => {
    expect(light('bank-12')).toBeCloseTo(5.44, 2);
    expect(light('issuer-max')).toBeCloseTo(5.42, 2);
    expect(light('issuer-amex')).toBeCloseTo(5.0, 2);
  });

  it('measures the light sheets where the spec says', () => {
    expect(light('bank-20')).toBeCloseTo(6.02, 2);
    expect(light('issuer-cal')).toBeCloseTo(5.93, 2);
    expect(light('cash')).toBeCloseTo(11.26, 2);
  });

  it('deepens brand fills in dark mode and keeps their tints', () => {
    for (const key of MONEY_KEYS.filter((k) => k !== 'cash' && k !== 'issuer-diners')) {
      expect(color(DARK, `--money-${key}`).l, key).toBeLessThan(color(LIGHT, `--money-${key}`).l);
      expect(color(DARK, `--money-${key}-on`), key).toEqual(color(LIGHT, `--money-${key}-on`));
    }
  });
});

describe.each(THEMES)('category hues, %s', (_name, theme) => {
  it.each(HUES)('%s: both tones show at 3:1 on the paper and on the sheet', (hue) => {
    for (const tone of [`--hue-${hue}`, `--hue-${hue}-2`]) {
      expect(contrastRatio(color(theme, tone), color(theme, '--background')), tone).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(color(theme, tone), color(theme, '--card')), tone).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(HUES)('%s: tone B is at least 0.12 away from tone A in lightness', (hue) => {
    const gap = Math.abs(color(theme, `--hue-${hue}`).l - color(theme, `--hue-${hue}-2`).l);
    expect(gap).toBeGreaterThanOrEqual(0.12 - 1e-9);
  });

  it('draws the neutral mark at 3:1 too', () => {
    expect(contrastRatio(color(theme, '--hue-neutral'), color(theme, '--card'))).toBeGreaterThanOrEqual(3);
  });
});

describe.each(THEMES)('the house sheets, %s', (_name, theme) => {
  const sheets = {
    paper: ['--paper-sheet', '--ink', '--box-fill', '--on-box'],
    night: ['--night', '--on-night', '--on-night', '--night'],
    sapphire: ['--primary', '--primary-foreground', '--box-fill', '--primary-hi'],
  } as const;

  it.each(Object.entries(sheets))(
    '%s: text, field edge, focus and box all read',
    (_kind, [fill, on, box, boxText]) => {
      const f = color(theme, fill);
      const t = color(theme, on);
      expect(contrastRatio(t, f)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(mixOklch(t, f, 0.7), f)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(color(theme, boxText), color(theme, box))).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('the mapping (§1.5)', () => {
  /** The declarations of one top-level `[data-…]` rule, read from the stylesheet itself. */
  const rule = (selector: string) => declarations(CSS, selector);

  it.each(MONEY_KEYS)('%s: has a rule that points at its own three tokens', (key) => {
    const decls = rule(`[data-money='${key}']`);
    expect(decls.get('--fill')).toBe(`var(--money-${key})`);
    expect(decls.get('--on-fill')).toBe(`var(--money-${key}-on)`);
    expect(decls.get('--box')).toBe('var(--box-fill)');
    expect(decls.get('--box-text')).toBe(`var(--money-${key}-hi)`);
  });

  it('falls through to the neutral ink sheet for a key it does not know', () => {
    const decls = rule('[data-money]');
    expect(decls.get('--fill')).toBe('var(--money-neutral)');
    expect(decls.get('--on-fill')).toBe('var(--money-neutral-on)');
    // The ink sheet's box flips to paper with ink text (§1.5).
    expect(decls.get('--box')).toBe('var(--on-night)');
  });

  it.each(HUES)('%s: both tones have a rule', (hue) => {
    expect(rule(`[data-hue='${hue}']`).get('--hue')).toBe(`var(--hue-${hue})`);
    expect(rule(`[data-hue='${hue}-2']`).get('--hue')).toBe(`var(--hue-${hue}-2)`);
  });

  it('retints everything inside a sheet from the sheet', () => {
    const sheet = rule('[data-sheet]');
    expect(sheet.get('--foreground')).toBe('var(--on-fill)');
    expect(sheet.get('--muted-foreground')).toBe('var(--on-fill)');
    expect(sheet.get('--input')).toBe('color-mix(in oklch, var(--on-fill) 70%, var(--fill))');
    expect(sheet.get('--ring')).toBe('currentColor');
    expect(sheet.get('--press')).toBe('var(--box)');
    expect(sheet.get('--on-press')).toBe('var(--box-text)');
  });

  it('paints every sheet and hue mark an edge that forced colours keep (§1.8)', () => {
    expect(CSS).toMatch(/\[data-sheet\],\s*\[data-hue\]\s*\{\s*border:\s*2px solid transparent;/);
  });
});
