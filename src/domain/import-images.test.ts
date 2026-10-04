import { describe, expect, it } from 'vitest';

import { computeTiles, fitSize, groupSmall, MAX_EDGE, MAX_PATCHES, patches } from './import-images';

describe('what an image costs', () => {
  it('is one token a 28-pixel patch', () => {
    expect(patches(28, 28)).toBe(1);
    expect(patches(29, 28)).toBe(2);
    expect(patches(1000, 1000)).toBe(1296);
  });
});

describe('sizing an image to be read', () => {
  it('leaves an image inside the limits exactly as it is - never larger', () => {
    expect(fitSize(1170, 2532)).toEqual({ width: 1170, height: 2532 });
    expect(fitSize(200, 100)).toEqual({ width: 200, height: 100 });
  });

  it('scales a larger one down just inside both the edge and the patch limit', () => {
    const fitted = fitSize(4000, 3000);
    expect(Math.max(fitted.width, fitted.height)).toBeLessThanOrEqual(MAX_EDGE);
    expect(patches(fitted.width, fitted.height)).toBeLessThanOrEqual(MAX_PATCHES);
    expect(fitted.width / fitted.height).toBeCloseTo(4 / 3, 1);
  });
});

describe('a long scrolling screenshot', () => {
  it('is sliced at full width, every slice inside the limits, overlapping', () => {
    const tiles = computeTiles(1080, 7000);
    expect(tiles.length).toBeGreaterThan(1);
    for (const tile of tiles) {
      expect(tile.height).toBeLessThanOrEqual(MAX_EDGE);
      expect(patches(1080, tile.height)).toBeLessThanOrEqual(MAX_PATCHES);
    }
    // Every pixel row is in some slice, and consecutive slices share at least 200px.
    expect(tiles[0]?.y).toBe(0);
    const last = tiles.at(-1);
    expect((last?.y ?? 0) + (last?.height ?? 0)).toBe(7000);
    for (let i = 1; i < tiles.length; i += 1) {
      const before = tiles[i - 1];
      expect((before?.y ?? 0) + (before?.height ?? 0) - (tiles[i]?.y ?? 0)).toBeGreaterThanOrEqual(200);
    }
  });

  it('is one piece when it is not that tall', () => {
    expect(computeTiles(1080, 2400)).toEqual([{ y: 0, height: 2400 }]);
    expect(computeTiles(4000, 3000)).toEqual([{ y: 0, height: 3000 }]);
  });
});

describe('small images', () => {
  it('are read together, five or about 8,000 patches to a call', () => {
    const images = Array.from({ length: 7 }, (_, i) => ({ id: i, patches: 1000 }));
    expect(groupSmall(images).map((g) => g.map((x) => x.id))).toEqual([
      [0, 1, 2, 3, 4],
      [5, 6],
    ]);
    const heavy = [3000, 3000, 3000].map((p, i) => ({ id: i, patches: p }));
    expect(groupSmall(heavy).map((g) => g.length)).toEqual([2, 1]);
    expect(groupSmall([])).toEqual([]);
  });
});
