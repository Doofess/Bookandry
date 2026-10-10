import { describe, expect, it } from 'vitest';

import { cssColorToHex } from './color';

describe('cssColorToHex: a computed colour as the browser chrome takes it', () => {
  it('reads rgb() and rgba()', () => {
    expect(cssColorToHex('rgb(246, 242, 234)')).toBe('#F6F2EA');
    expect(cssColorToHex('rgba(26, 21, 16, 0.9)')).toBe('#1A1510');
  });

  it('reads oklch(), which Chrome reports as written', () => {
    expect(cssColorToHex('oklch(0.962 0.012 85)')).toBe('#F6F2EA');
    expect(cssColorToHex('oklch(0.2 0.012 70)')).toBe('#1A1510');
  });

  it('reads color(srgb …), which a color-mix() computes to', () => {
    expect(cssColorToHex('color(srgb 1 0 0)')).toBe('#FF0000');
  });

  it('is undefined for a transparent colour, or anything it cannot read', () => {
    expect(cssColorToHex('rgba(0, 0, 0, 0)')).toBeUndefined();
    expect(cssColorToHex('oklch(0.5 0.1 200 / 0)')).toBeUndefined();
    expect(cssColorToHex('transparent')).toBeUndefined();
    expect(cssColorToHex('')).toBeUndefined();
  });
});
