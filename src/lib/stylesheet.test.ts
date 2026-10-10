import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { declarations } from './css-tokens';

/**
 * The Phase 2 stylesheet contract: the rules that Phase 2's components and
 * Phase 3's screens are keyed to (§4.3, §6.2, §8.2, §9.1, §9.4, §9.5).
 *
 * Each rule waits on an attribute (data-slot, data-numeral, data-nav-dir), so
 * it is written once and its component lands separately. This pins the values
 * the spec fixed, so a later edit changes them on purpose.
 */

const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const ROOT = declarations(CSS, ':root');
/** The stylesheet with every run of whitespace as one space: prettier may wrap a long value. */
const FLAT = CSS.replace(/\s+/g, ' ');

const theme = (name: string): string => {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(CSS);
  if (match?.[1] === undefined) throw new Error(`${name} is not in the stylesheet`);
  return match[1].trim();
};

/** The px a `clamp(<rem>, <rem> + <vw>, <rem>)` token comes to in a window `width` px wide. */
function clampAt(value: string, width: number): number {
  const match = /^clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)rem\s*\+\s*([\d.]+)vw\s*,\s*([\d.]+)rem\s*\)$/.exec(
    value,
  );
  if (match === null) throw new Error(`Not a fluid token: ${value}`);
  const [min, base, slope, max] = match.slice(1).map(Number) as [number, number, number, number];
  return Math.min(max * 16, Math.max(min * 16, base * 16 + (slope * width) / 100));
}

describe('main and the pop-out lay out by their own width (§4.3, §6.2)', () => {
  it.each([
    ['--container-board', '47.5rem'],
    ['--container-wide', '67.5rem'],
    ['--container-vast', '90rem'],
    ['--container-pane2', '45rem'],
    ['--container-pane3', '65rem'],
  ])('%s is %s', (name, value) => {
    expect(theme(name)).toBe(value);
  });

  it('gives the pop-out one pane, then steps from 720px, then a preview from 1040px', () => {
    expect(FLAT).toContain('@container popout (width >= 45rem)');
    expect(FLAT).toContain('@container popout (width >= 65rem)');
    expect(FLAT).toContain("'steps body preview' minmax(0, 1fr) / 14.5rem minmax(0, 1fr) 22.5rem");
  });

  it('knows the phone’s tab bar height, for what must clear it', () => {
    expect(ROOT.get('--tab-bar-h')).toBe('3.875rem');
  });
});

describe('title pairs (§9.5)', () => {
  it.each([
    ['--text-title-hero', 20, 40],
    ['--text-sub-hero', 16, 24],
    ['--text-title-sheet', 20, 30],
    ['--text-sub-sheet', 16, 21],
    ['--text-title-question', 32, 48],
    ['--text-sub-question', 19, 24],
    ['--text-title-steps', 24, 26],
    ['--text-sub-steps', 17, 18],
  ] as const)(
    '%s is %ipx on a phone and %ipx at 1440, within the 2.5x zoom limit',
    (name, phone, desktop) => {
      expect(clampAt(theme(name), 390)).toBeCloseTo(phone, 0);
      expect(clampAt(theme(name), 1440)).toBeCloseTo(desktop, 0);
      expect(desktop / phone).toBeLessThanOrEqual(2.5);
    },
  );

  it('sets the phone’s screen name at 76px and the desktop top bar at 38 / 21', () => {
    expect(theme('--text-screen-name')).toBe('4.75rem');
    expect(theme('--text-title-screen')).toBe('2.375rem');
    expect(theme('--text-sub-screen')).toBe('1.3125rem');
  });
});

describe('numerals that run off a sheet (§9.4)', () => {
  it('bleeds 0.06 of the glyph from lg and 0.03 below, with v2’s cap height', () => {
    expect(ROOT.get('--numeral-bleed')).toBe('0.06');
    expect(ROOT.get('--numeral-cap')).toBe('0.61');
    expect(CSS).toMatch(/@media \(width < 64rem\) \{\s*:root \{\s*--numeral-bleed: 0\.03;/);
  });

  it('halves the bleed inside a card sheet, and cuts the foot by the formula', () => {
    expect(CSS).toMatch(
      /\[data-card-sheet\] \[data-numeral\] \{\s*--b: calc\(var\(--numeral-bleed\) \* 0\.5\);/,
    );
    expect(FLAT).toContain('margin-block-end: calc(var(--b) * var(--numeral-cap) * -1em - 0.02em);');
    expect(FLAT).toContain('line-height: 0.74;');
  });

  it('never sets a numeral under 28px', () => {
    expect(FLAT).toContain(
      'font-size: max(1.75rem, min(var(--numeral-max, 7.375rem), calc(100cqi / (var(--glyphs, 6) * 0.34))));',
    );
  });
});

describe('route changes (§8.2)', () => {
  it('keeps the rail, the tab bar and the collapsed bar still while main changes', () => {
    expect(CSS).toMatch(/\[data-slot='tab-bar'\] \{\s*view-transition-name: nav;/);
    expect(CSS).toMatch(/#main \{\s*view-transition-name: main;/);
    expect(CSS).toMatch(/\[data-testid='collapsed-summary'\] \{\s*view-transition-name: collapsed-bar;/);
  });

  it('slides only when motion is welcome, mirrored for right-to-left', () => {
    const motion = /@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/.exec(
      CSS.slice(CSS.indexOf('Route changes')),
    )?.[1];
    expect(motion).toContain("html[data-nav-dir='forward']::view-transition-new(main)");
    expect(motion).toContain("html[data-nav-dir='forward']:dir(rtl)::view-transition-new(main)");
  });

  it('does not bounce the page on a trackpad', () => {
    expect(CSS).toMatch(/@media \(pointer: fine\) \{\s*html \{\s*overscroll-behavior-y: none;/);
  });
});

describe('the grain (§9.1)', () => {
  it('is drawn on the paper and on every sheet, at 7.5% in light and 6% in dark', () => {
    expect(FLAT).toContain("url('./assets/grain.png')");
    expect(ROOT.get('--grain-veil')).toBe('92.5%');
    expect(declarations(CSS, '.dark').get('--grain-veil')).toBe('94%');
    expect(ROOT.get('--grain-blend')).toBe('multiply');
    expect(declarations(CSS, '.dark').get('--grain-blend')).toBe('screen');
  });

  it('is a 180px greyscale PNG', () => {
    const png = readFileSync(new URL('../assets/grain.png', import.meta.url));
    expect([...png.subarray(1, 4)].map((byte) => String.fromCharCode(byte)).join('')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
    expect(png[25]).toBe(0); // colour type 0: greyscale
  });
});
