import { compositeOver, contrastRatioRgb, mixOklch, oklchToSrgb, parseOklch, type Oklch } from './color';

/**
 * The token file, read the way a browser reads it.
 *
 * The house colours are literals and almost everything else is an alias
 * (`--foreground: var(--ink)`) or a mix (`--border: color-mix(in oklch,
 * var(--foreground) 14%, transparent)`). A contrast test that only read
 * literal `oklch()` values would skip the very tokens components use, so this
 * follows `var()` and `color-mix(in oklch, …)` through every `:root` rule,
 * with a `.dark` layer on top for the dark theme - which is what the cascade
 * does on `<html class="dark">`.
 *
 * It reads only what the token file actually writes. Anything else throws
 * with the value in the message, so a new kind of value gets support here on
 * purpose instead of being measured as something it is not.
 */

/** A colour and its opacity. `alpha` is 1 for every literal without a `/ alpha`. */
export type Paint = { readonly color: Oklch; readonly alpha: number };

const TRANSPARENT: Paint = { color: { l: 0, c: 0, h: Number.NaN }, alpha: 0 };

/**
 * Every custom property declared in a TOP-LEVEL rule whose selector is
 * exactly `selector`, merged in file order. Indented rules (inside `@media`,
 * `@layer`) are not top level and are skipped.
 */
export function declarations(css: string, selector: string): ReadonlyMap<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'gm');
  const out = new Map<string, string>();
  let found = false;

  for (const [, body = ''] of css.matchAll(rule)) {
    found = true;
    const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, name, value] of clean.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (name !== undefined && value !== undefined) out.set(name, value.replace(/\s+/g, ' ').trim());
    }
  }

  if (!found) throw new Error(`No ${selector} rule in the stylesheet`);
  return out;
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts;
}

function alphaOf(value: string): number {
  const match = /\/\s*([\d.]+)(%?)\s*\)\s*$/.exec(value);
  if (match === null) return 1;
  const amount = Number(match[1]);
  return match[2] === '%' ? amount / 100 : amount; // money-allow: a CSS percentage, not an amount.
}

/** Premultiplied interpolation, as CSS Color 5 mixes colours that are not opaque. */
function mixPaint(a: Paint, b: Paint, share: number): Paint {
  const alpha = a.alpha * share + b.alpha * (1 - share);
  if (alpha === 0) return TRANSPARENT;
  const weight = (a.alpha * share) / alpha;
  return {
    color: {
      l: a.color.l * weight + b.color.l * (1 - weight),
      c: a.color.c * weight + b.color.c * (1 - weight),
      h: mixOklch(a.color, b.color, share).h,
    },
    alpha,
  };
}

/** Resolve tokens through the given layers, later layers winning: `(:root)` for light, `(:root, .dark)` for dark. */
export function resolveTheme(...layers: readonly ReadonlyMap<string, string>[]): (name: string) => Paint {
  const decls = new Map<string, string>();
  for (const layer of layers) for (const [name, value] of layer) decls.set(name, value);
  const memo = new Map<string, Paint>();

  const token = (name: string, trail: readonly string[]): Paint => {
    const known = memo.get(name);
    if (known !== undefined) return known;
    if (trail.includes(name)) throw new Error(`Token cycle: ${[...trail, name].join(' -> ')}`);
    const value = decls.get(name);
    if (value === undefined) throw new Error(`Token ${name} is not declared`);
    const paint = read(value, [...trail, name]);
    memo.set(name, paint);
    return paint;
  };

  const read = (value: string, trail: readonly string[]): Paint => {
    const text = value.trim();
    if (text === 'transparent') return TRANSPARENT;

    const variable = /^var\(\s*(--[\w-]+)\s*\)$/.exec(text);
    if (variable?.[1] !== undefined) return token(variable[1], trail);

    if (/^oklch\(/i.test(text)) {
      const color = parseOklch(text);
      if (color !== undefined) return { color, alpha: alphaOf(text) };
    }

    const mix = /^color-mix\(\s*in oklch\s*,([\s\S]*)\)$/i.exec(text);
    if (mix?.[1] !== undefined) {
      const [first = '', second = ''] = splitTopLevel(mix[1]);
      const [aText, aShare] = withShare(first);
      const [bText, bShare] = withShare(second);
      const share = aShare ?? (bShare === undefined ? 0.5 : 1 - bShare);
      return mixPaint(read(aText, trail), read(bText, trail), share);
    }

    throw new Error(`Not a colour this reader understands: ${text}`);
  };

  return (name) => token(name, []);
}

/** `var(--a) 14%` -> ['var(--a)', 0.14]; `transparent` -> ['transparent', undefined]. */
function withShare(argument: string): [string, number | undefined] {
  const match = /^([\s\S]*?)\s+([\d.]+)%$/.exec(argument.trim());
  if (match?.[1] === undefined || match[2] === undefined) return [argument.trim(), undefined];
  return [match[1], Number(match[2]) / 100]; // money-allow: a CSS percentage, not an amount.
}

/**
 * Contrast of `text` on `on`. A translucent `on` (a highlight, a line) is
 * composited over `under` first, as it is on screen.
 */
export function paintRatio(text: Paint, on: Paint, under: Paint): number {
  const surface = on.alpha >= 1 ? oklchToSrgb(on.color) : compositeOver(on.color, on.alpha, under.color);
  const ink = text.alpha >= 1 ? oklchToSrgb(text.color) : compositeOver(text.color, text.alpha, on.color);
  return contrastRatioRgb(ink, surface);
}
