import { describe, expect, it } from 'vitest';

import {
  DIRECTIONAL_ICONS,
  iconFlipClass,
  inlineEnd,
  inlineStart,
  mirrorSide,
  NON_DIRECTIONAL_ICONS,
  toastPosition,
} from './rtl';

describe('rtl side computation', () => {
  it('maps inline-end to the physical edge per direction', () => {
    expect(inlineEnd('ltr')).toBe('right');
    expect(inlineEnd('rtl')).toBe('left');
    expect(inlineStart('ltr')).toBe('left');
    expect(inlineStart('rtl')).toBe('right');
  });

  it('leaves vertical sides alone', () => {
    expect(mirrorSide('top', 'rtl')).toBe('top');
    expect(mirrorSide('bottom', 'rtl')).toBe('bottom');
  });

  it('mirrors horizontal sides only in rtl', () => {
    expect(mirrorSide('left', 'ltr')).toBe('left');
    expect(mirrorSide('left', 'rtl')).toBe('right');
    expect(mirrorSide('right', 'rtl')).toBe('left');
  });

  it('computes the toast corner, which sonner does not do logically', () => {
    expect(toastPosition('ltr')).toBe('bottom-right');
    expect(toastPosition('rtl')).toBe('bottom-left');
  });
});

describe('directional icon allowlist', () => {
  it('flips reading-direction icons', () => {
    expect(iconFlipClass('ChevronRight')).toBe('rtl:rotate-180');
    expect(iconFlipClass('ArrowLeft')).toBe('rtl:rotate-180');
  });

  it('never flips non-directional icons', () => {
    for (const name of NON_DIRECTIONAL_ICONS) expect(iconFlipClass(name)).toBe('');
  });

  it('never flips trend icons, whose slope carries the meaning', () => {
    // A mirrored "trending up" reads as trending down. This is the one that
    // would ship as a silent, confident lie in a finance app.
    expect(iconFlipClass('TrendingUp')).toBe('');
    expect(iconFlipClass('TrendingDown')).toBe('');
  });

  it('keeps the two allowlists disjoint', () => {
    for (const name of DIRECTIONAL_ICONS) expect(NON_DIRECTIONAL_ICONS.has(name)).toBe(false);
  });
});
