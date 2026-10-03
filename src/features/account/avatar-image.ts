/**
 * A picture made ready to be a profile picture, in the browser, before it
 * goes anywhere: the largest centred square, 256 pixels a side, WebP (JPEG
 * where the browser cannot write WebP). A phone photo of several megabytes
 * leaves as a few kilobytes, and nothing of it but those pixels - the
 * location and camera details a photo carries are not drawn onto a canvas.
 */

export const AVATAR_SIZE = 256;

/** The largest centred square of a width x height image. */
export function coverSquare(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: (width - side) / 2, sy: (height - side) / 2, side };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

/** Rejects for anything that is not an image the browser can read. */
export async function squareAvatar(file: Blob, size = AVATAR_SIZE): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const { sx, sy, side } = coverSquare(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('no 2d canvas');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
    // A browser that cannot write WebP quietly writes PNG instead; JPEG is
    // the smaller fallback for a photo.
    const webp = await toBlob(canvas, 'image/webp', 0.86);
    if (webp?.type === 'image/webp') return webp;
    const jpeg = await toBlob(canvas, 'image/jpeg', 0.88);
    if (jpeg === null) throw new Error('could not encode the picture');
    return jpeg;
  } finally {
    bitmap.close();
  }
}
