/**
 * How an image is sent to be read: as small as it can be while every line of
 * text in it stays as sharp as the model can use.
 *
 * Claude sees an image in 28×28-pixel patches, and an image costs one token a
 * patch. The models that read first see up to 2576 pixels on the long edge and
 * 4784 patches; anything larger they shrink themselves. So:
 *  - an image inside both limits is sent as it is - never enlarged, since that
 *    adds tokens and no detail;
 *  - a larger one is scaled down to just fit;
 *  - a very tall one - a long scrolling screenshot - would be shrunk until its
 *    text is unreadable, so it is cut into overlapping slices at full width
 *    instead, each inside the limits.
 */

export const MAX_EDGE = 2576;
export const MAX_PATCHES = 4784;
const PATCH = 28;
/** Taller than this many widths, and an image is sliced rather than shrunk. */
export const TALL_RATIO = 2.4;

/** What an image of this size costs to read. */
export function patches(width: number, height: number): number {
  return Math.ceil(width / PATCH) * Math.ceil(height / PATCH);
}

/** The largest size, in the image's own proportions, inside both limits - never larger than it is. */
export function fitSize(width: number, height: number): { readonly width: number; readonly height: number } {
  let scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  while (scale > 0 && patches(Math.floor(width * scale), Math.floor(height * scale)) > MAX_PATCHES) {
    scale *= 0.98;
  }
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

export type Tile = { readonly y: number; readonly height: number };

/**
 * Horizontal slices of a tall image at its full width, each inside the limits,
 * overlapping by about 15% (at least 200px) so no line is cut in two without
 * also appearing whole in the next slice. One slice for an image that fits.
 */
export function computeTiles(width: number, height: number): Tile[] {
  // Not tall: one piece, scaled to fit by `fitSize` if it must be.
  if (height <= width * TALL_RATIO) return [{ y: 0, height }];
  // As tall as a slice can be at this width, within the edge and the patch limits.
  let sliceHeight = Math.min(MAX_EDGE, height);
  while (patches(Math.min(width, MAX_EDGE), sliceHeight) > MAX_PATCHES) sliceHeight -= PATCH;
  const overlap = Math.max(200, Math.floor(sliceHeight * 0.15));
  const step = Math.max(1, sliceHeight - overlap);
  const tiles: Tile[] = [];
  for (let y = 0; ; y += step) {
    const end = Math.min(height, y + sliceHeight);
    tiles.push({ y, height: end - y });
    if (end >= height) break;
  }
  return tiles;
}

/**
 * Small images - phone notifications, receipts - read together in one call,
 * so the instructions and the household's lists are paid for once rather than
 * per image: up to five images or about 8,000 patches a call.
 */
export function groupSmall<T extends { readonly patches: number }>(
  images: readonly T[],
  maxImages = 5,
  maxPatches = 8000,
): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const image of images) {
    if (current.length > 0 && (current.length >= maxImages || size + image.patches > maxPatches)) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(image);
    size += image.patches;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}
