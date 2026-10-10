/**
 * Writes src/assets/grain.png: the paper grain (§9.1).
 *
 * Run once with `node scripts/make-grain.mjs`; the PNG is committed and
 * precached like any other image. A 180px greyscale tile of seeded noise:
 * the same file comes out every time, and noise has no edges to match, so it
 * tiles without a seam. Sixteen grey levels keep it small; at 7.5% strength
 * nobody can count them.
 *
 * A file rather than an inline SVG filter, so every browser and the
 * screenshot tests draw the same grain.
 */
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const SIZE = 180;

/** mulberry32: a small seeded generator, 0 <= n < 1. */
let state = 0x20261009;
function next() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// One filter byte (0, none) at the start of each row, then a byte per pixel.
const raw = Buffer.alloc((SIZE + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE + 1)] = 0;
  for (let x = 0; x < SIZE; x += 1) raw[y * (SIZE + 1) + 1 + x] = Math.floor(next() * 16) * 17;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 0; // greyscale
header[10] = 0; // deflate
header[11] = 0; // adaptive filtering
header[12] = 0; // no interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(new URL('../src/assets/grain.png', import.meta.url), png);
console.log(`src/assets/grain.png: ${String(png.length)} bytes`);
