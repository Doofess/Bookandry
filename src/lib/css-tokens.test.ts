import { describe, expect, it } from 'vitest';

import { contrastRatio } from './color';
import { declarations, paintRatio, resolveTheme } from './css-tokens';

const CSS = `
:root {
  --a: oklch(0.5 0.1 200);
  --b: var(--a);
  --grey: oklch(0.9 0 none);
  --half: color-mix(in oklch, var(--a) 50%, var(--grey));
  --line: color-mix(in oklch, var(--a) 14%, transparent);
  --scrim: oklch(0.2 0.018 265 / 0.5);
}

.dark {
  --a: oklch(0.8 0.1 200);
}

@media (forced-colors: active) {
  :root {
    --a: oklch(0 0 none);
  }
}

:root {
  --later: var(--b);
}
`;

describe('declarations', () => {
  it('merges every top-level rule with exactly that selector, and skips nested ones', () => {
    const root = declarations(CSS, ':root');
    expect(root.get('--a')).toBe('oklch(0.5 0.1 200)');
    expect(root.get('--later')).toBe('var(--b)');
    expect(declarations(CSS, '.dark').get('--a')).toBe('oklch(0.8 0.1 200)');
  });

  it('throws for a selector the file never uses', () => {
    expect(() => declarations(CSS, '.nope')).toThrow(/No .nope/);
  });
});

describe('resolveTheme', () => {
  const light = resolveTheme(declarations(CSS, ':root'));
  const dark = resolveTheme(declarations(CSS, ':root'), declarations(CSS, '.dark'));

  it('follows var() through aliases, and a dark layer overrides the light one', () => {
    expect(light('--later').color).toEqual({ l: 0.5, c: 0.1, h: 200 });
    expect(dark('--later').color).toEqual({ l: 0.8, c: 0.1, h: 200 });
  });

  it('reads a none hue as missing, and an alpha', () => {
    expect(Number.isNaN(light('--grey').color.h)).toBe(true);
    expect(light('--scrim').alpha).toBeCloseTo(0.5, 10);
  });

  it('mixes in oklch: a missing hue takes the other colour’s', () => {
    const half = light('--half');
    expect(half.color.l).toBeCloseTo(0.7, 10);
    expect(half.color.c).toBeCloseTo(0.05, 10);
    expect(half.color.h).toBeCloseTo(200, 10);
    expect(half.alpha).toBe(1);
  });

  it('mixes with transparent as a translucent version of the colour', () => {
    const line = light('--line');
    expect(line.color).toEqual({ l: 0.5, c: 0.1, h: 200 });
    expect(line.alpha).toBeCloseTo(0.14, 10);
  });

  it('names the token it cannot find, and a cycle', () => {
    expect(() => light('--missing')).toThrow(/--missing/);
    const loop = resolveTheme(
      new Map([
        ['--x', 'var(--y)'],
        ['--y', 'var(--x)'],
      ]),
    );
    expect(() => loop('--x')).toThrow(/cycle/);
  });

  it('refuses a value it cannot read, rather than guessing', () => {
    const odd = resolveTheme(new Map([['--odd', 'rgb(1 2 3)']]));
    expect(() => odd('--odd')).toThrow(/rgb\(1 2 3\)/);
  });
});

describe('paintRatio', () => {
  it('is contrastRatio for two opaque colours', () => {
    const light = resolveTheme(declarations(CSS, ':root'));
    expect(paintRatio(light('--a'), light('--grey'), light('--grey'))).toBeCloseTo(
      contrastRatio(light('--a').color, light('--grey').color),
      10,
    );
  });

  it('composites a translucent surface over what is under it first', () => {
    const light = resolveTheme(declarations(CSS, ':root'));
    // 14% of a mid blue over near-white is still near-white: text in the blue reads against it.
    const over = paintRatio(light('--a'), light('--line'), light('--grey'));
    const bare = paintRatio(light('--a'), light('--grey'), light('--grey'));
    expect(over).toBeLessThan(bare);
    expect(over).toBeGreaterThan(bare * 0.8);
  });
});
