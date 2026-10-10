/** A token in OKLab: [bin, L, a, b]. */
export type Tok = readonly [string, number, number, number];

export function parseOklch(value: string): readonly [number, number, number] | undefined {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+|none)/.exec(value);
  if (m === null) return undefined;
  return [Number(m[1]), Number(m[2]), m[3] === 'none' ? 0 : Number(m[3])];
}

/** The concept's tokens as OKLab bins, first name winning where two share a value (light night = ink). */
export function toBins(tokens: Record<string, string>): Tok[] {
  const seen = new Set<string>();
  const bins: Tok[] = [];
  for (const [bin, value] of Object.entries(tokens)) {
    const lch = parseOklch(value);
    if (lch === undefined || seen.has(value)) continue;
    seen.add(value);
    const [l, c, h] = lch;
    bins.push([bin, l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)]);
  }
  return bins;
}

export type ScoreInput = {
  readonly a: string;
  readonly b: string;
  readonly w: number;
  readonly h: number;
  readonly tokens: readonly Tok[];
  readonly deltaE: number;
  readonly minShare: number;
};
export type ScoreOutput = {
  readonly structure: number;
  readonly palette: number;
  readonly sharesA: Record<string, number>;
  readonly sharesB: Record<string, number>;
  readonly coloursA: string[];
  readonly coloursB: string[];
  readonly map: number[];
  readonly mapW: number;
  readonly mapH: number;
};

/** Runs in the browser. Both images are drawn at w×h (B scaled to A's frame), then compared. */
export async function scoreInBrowser(input: ScoreInput): Promise<ScoreOutput> {
  const { w, h } = input;
  const load = async (src: string) => createImageBitmap(await (await fetch(src)).blob());
  const [ia, ib] = await Promise.all([load(input.a), load(input.b)]);
  const pixels = (img: ImageBitmap) => {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  };
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const oklab = (r8: number, g8: number, b8: number): [number, number, number] => {
    const r = lin(r8);
    const g = lin(g8);
    const b = lin(b8);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const da = pixels(ia);
  const db = pixels(ib);
  const labA = Array.from({ length: w * h }, (_, i) =>
    oklab(da[4 * i] ?? 0, da[4 * i + 1] ?? 0, da[4 * i + 2] ?? 0),
  );
  const labB = Array.from({ length: w * h }, (_, i) =>
    oklab(db[4 * i] ?? 0, db[4 * i + 1] ?? 0, db[4 * i + 2] ?? 0),
  );

  // Structure: SSIM of OKLab L over 8×8 windows, stride 4.
  const win = 8;
  const step = 4;
  const c1 = 0.01 ** 2;
  const c2 = 0.03 ** 2;
  const map: number[] = [];
  let mapW = 0;
  let mapH = 0;
  for (let y = 0; y + win <= h; y += step) {
    mapH += 1;
    mapW = 0;
    for (let x = 0; x + win <= w; x += step) {
      mapW += 1;
      let ma = 0;
      let mb = 0;
      for (let j = 0; j < win; j++)
        for (let i = 0; i < win; i++) {
          ma += labA[(y + j) * w + x + i]?.[0] ?? 0;
          mb += labB[(y + j) * w + x + i]?.[0] ?? 0;
        }
      ma /= win * win;
      mb /= win * win;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let j = 0; j < win; j++)
        for (let i = 0; i < win; i++) {
          const p = (labA[(y + j) * w + x + i]?.[0] ?? 0) - ma;
          const q = (labB[(y + j) * w + x + i]?.[0] ?? 0) - mb;
          va += p * p;
          vb += q * q;
          cov += p * q;
        }
      const n = win * win - 1;
      map.push(
        ((2 * ma * mb + c1) * ((2 * cov) / n + c2)) / ((ma * ma + mb * mb + c1) * (va / n + vb / n + c2)),
      );
    }
  }
  const structure = map.length === 0 ? 0 : map.reduce((s, v) => s + v, 0) / map.length;

  // Palette: the share of pixels nearest each token (within deltaE), else "other".
  const shares = (lab: readonly [number, number, number][]) => {
    const counts: Record<string, number> = {};
    for (const [l, a, b] of lab) {
      let best = 'other';
      let distance = input.deltaE;
      for (const [bin, tl, ta, tb] of input.tokens) {
        const e = Math.hypot(l - tl, a - ta, b - tb);
        if (e < distance) {
          distance = e;
          best = bin;
        }
      }
      counts[best] = (counts[best] ?? 0) + 1;
    }
    for (const key of Object.keys(counts)) counts[key] = (counts[key] ?? 0) / lab.length;
    return counts;
  };
  const sharesA = shares(labA);
  const sharesB = shares(labB);
  let palette = 0;
  for (const key of new Set([...Object.keys(sharesA), ...Object.keys(sharesB)])) {
    palette += Math.min(sharesA[key] ?? 0, sharesB[key] ?? 0);
  }
  const colourful = (s: Record<string, number>) =>
    Object.entries(s)
      .filter(([bin, share]) => /^(money|hue|sapphire|night)/.test(bin) && share >= input.minShare)
      .map(([bin]) => bin)
      .sort();
  return {
    structure,
    palette,
    sharesA,
    sharesB,
    coloursA: colourful(sharesA),
    coloursB: colourful(sharesB),
    map,
    mapW,
    mapH,
  };
}

export type ComposeInput = {
  readonly a: string;
  readonly b: string;
  readonly map: readonly number[];
  readonly mapW: number;
  readonly mapH: number;
  readonly labelA: string;
  readonly labelB: string;
};

/** Runs in the browser: concept, app, and the structure map (red where the windows disagree), as a PNG in base64. */
export async function composeInBrowser(input: ComposeInput): Promise<string> {
  const load = async (src: string) => createImageBitmap(await (await fetch(src)).blob());
  const [ia, ib] = await Promise.all([load(input.a), load(input.b)]);
  const panel = 720;
  const ha = Math.round((ia.height * panel) / ia.width);
  const hb = Math.round((ib.height * panel) / ib.width);
  const canvas = new OffscreenCanvas(panel * 3 + 32, Math.max(ha, hb) + 40);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2d context');
  ctx.fillStyle = '#888';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.font = '600 18px system-ui';
  ctx.fillText(input.labelA, 8, 24);
  ctx.fillText(input.labelB, panel + 24, 24);
  ctx.fillText('structure', panel * 2 + 40, 24);
  ctx.drawImage(ia, 0, 32, panel, ha);
  ctx.drawImage(ib, panel + 16, 32, panel, hb);
  ctx.globalAlpha = 0.35;
  ctx.drawImage(ia, panel * 2 + 32, 32, panel, ha);
  ctx.globalAlpha = 1;
  const cw = panel / Math.max(1, input.mapW);
  const ch = ha / Math.max(1, input.mapH);
  input.map.forEach((value, i) => {
    const col = i % input.mapW;
    const row = Math.floor(i / input.mapW);
    ctx.fillStyle = `rgba(220, 0, 0, ${String(Math.min(1, Math.max(0, 1 - value)))})`;
    ctx.fillRect(panel * 2 + 32 + col * cw, 32 + row * ch, cw, ch);
  });
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
