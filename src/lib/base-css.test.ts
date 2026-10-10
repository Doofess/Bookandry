import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { declarations } from './css-tokens';

/**
 * The base layer: shape and motion tokens, and the good-css reset rules the
 * app has adopted (§9.1, §8.1, §10).
 *
 * The fluid tokens are worked out from two points each (good-css "Fluid
 * sizes"), so they are checked at those points: a clamp whose maths is off
 * by a typo still looks plausible in the file.
 */

const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const ROOT = declarations(CSS, ':root');

function token(name: string): string {
  const value = ROOT.get(name);
  if (value === undefined) throw new Error(`${name} is not declared`);
  return value;
}

/** The px a `clamp(<rem>, <rem> + <vw>, <rem>)` token comes to in a window `width` px wide. */
function clampAt(value: string, width: number): number {
  const match = /^clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)rem\s*\+\s*([\d.]+)vw\s*,\s*([\d.]+)rem\s*\)$/.exec(
    value,
  );
  if (match === null) throw new Error(`Not a fluid token: ${value}`);
  const [min, base, slope, max] = match.slice(1).map(Number) as [number, number, number, number];
  return Math.min(max * 16, Math.max(min * 16, base * 16 + (slope * width) / 100));
}

describe('the radius scale (§9.1)', () => {
  it.each([
    ['--r-sheet', 36, 56],
    ['--r-sheet-s', 34, 36],
    ['--r-sheet-cash', 36, 44],
    ['--r-tile', 28, 32],
  ] as const)('%s is %ipx on a 390 phone and %ipx at 1440', (name, phone, desktop) => {
    expect(clampAt(token(name), 390)).toBeCloseTo(phone, 0);
    expect(clampAt(token(name), 1440)).toBeCloseTo(desktop, 0);
  });

  it.each([
    ['--r-row', '1.625rem'],
    ['--r-face', '1.375rem'],
    ['--r-preview', '3.25rem'],
    ['--r-dialog', '4rem'],
    ['--r-mark', '3px'],
    ['--r-pill', '999px'],
  ] as const)('%s is fixed at %s', (name, value) => {
    expect(token(name)).toBe(value);
  });

  it('puts sheets 8px apart on a phone and 16px apart from a 1024 window up', () => {
    expect(clampAt(token('--gap-sheet'), 390)).toBeCloseTo(8, 0);
    expect(clampAt(token('--gap-sheet'), 1024)).toBeCloseTo(16, 0);
    expect(clampAt(token('--gap-sheet'), 1920)).toBe(16);
  });
});

describe('motion (§8.1)', () => {
  it.each([
    ['--dur-press', 150],
    ['--dur-pop', 200],
    ['--dur-move', 250],
    ['--dur-panel', 300],
  ] as const)('%s is %ims, within good-css’s 300ms', (name, ms) => {
    expect(token(name)).toBe(`${String(ms)}ms`);
    expect(ms).toBeLessThanOrEqual(300);
  });

  it('eases out with good-css’s curve, and fills with the concept’s', () => {
    expect(CSS).toContain('--ease-out: cubic-bezier(0.23, 1, 0.32, 1);');
    expect(CSS).toContain('--ease-fill: cubic-bezier(0.4, 0, 0.2, 1);');
  });

  it('hovers only with a fine pointer (§9.6)', () => {
    expect(CSS).toMatch(/@custom-variant hover-fine \{\s*@media \(hover: hover\) and \(pointer: fine\)/);
  });
});

describe('the reset, rule by rule (§10)', () => {
  it.each([
    'min-width: 0;',
    'overflow-wrap: break-word;',
    'text-wrap: pretty;',
    'text-wrap: balance;',
    '-webkit-tap-highlight-color: transparent;',
    '-webkit-text-size-adjust: 100%;',
    'scrollbar-gutter: stable;',
    'font-size: max(16px, 1rem);',
    'touch-action: manipulation;',
    'user-select: none;',
    'outline: 3px solid var(--ring);',
  ])('declares %s', (declaration) => {
    expect(CSS).toContain(declaration);
  });

  it('never removes a focus outline outright', () => {
    expect(CSS).not.toMatch(/outline:\s*none/);
  });
});
