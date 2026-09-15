/**
 * Pure scanner behind `gate:rtl` (§7, §12).
 *
 * Lives in lib/ rather than in the script so it is type-checked, unit-tested and
 * covered like any other logic. `scripts/gate-rtl.mjs` supplies the file I/O.
 *
 * Legitimate physical usage is recognised rather than blanket-allowed:
 *   - a variant chain containing `rtl:` or `ltr:`  (an explicit per-direction rule)
 *   - a variant chain containing `data-[side=...]` (pairs with a physical side prop)
 *   - a line carrying an `rtl-allow` comment       (reviewed escape hatch)
 */

export type RtlHit = { file: string; line: number; token: string };

/**
 * Utility heads with a logical equivalent. The `(?![a-z])` guards matter: without
 * them `rounded-lg` reads as `rounded-l` and `border-ring` as `border-r`, the  rtl-allow: prose, not classes
 * gate cries wolf, and everyone learns to ignore it.
 */
const PHYSICAL: readonly RegExp[] = [
  /^-?(ml|mr|pl|pr)-/,
  /**
   * A REAL positional utility always takes a value: a number, a fraction,
   * `auto`, `full`, `px`, or an arbitrary `[...]`/`(...)`. Matching a bare
   * `left-` prefix instead makes the gate fire on the words "left-to-right"
   * and "right-to-left" in a comment - which it did, on the very file
   * documenting bidi handling. A gate that cries wolf gets ignored.
   */
  /^-?(left|right)-(\d|auto$|full$|px$|\[|\()/,
  /^(text|float|origin|object|bg)-(left|right)$/,
  /^-?scroll-(ml|mr|pl|pr)-/,
  /^rounded-(l|r|tl|tr|bl|br)(?![a-z])/,
  /^border-(l|r)(?![a-z])/,
];

const CSS_PHYSICAL =
  /(?<![\w-])(margin|padding|border|inset|scroll-margin|scroll-padding)-(left|right)\s*:|(?<![\w-])(left|right)\s*:/;

/** Split a Tailwind token on ':' at bracket depth 0, so `[&_svg:not(...)]:size-4` stays intact. */
export function splitVariants(token: string): { variants: string[]; utility: string } {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of token) {
    if (ch === '[' || ch === '(') depth += 1;
    else if (ch === ']' || ch === ')') depth -= 1;
    if (ch === ':' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return { variants: parts.slice(0, -1), utility: parts[parts.length - 1] ?? '' };
}

function isExempt(variants: readonly string[]): boolean {
  return variants.some((v) => v === 'rtl' || v === 'ltr' || v.startsWith('data-[side='));
}

export function scanSource(file: string, src: string): RtlHit[] {
  const hits: RtlHit[] = [];
  const isCss = file.endsWith('.css');

  src.split(/\r?\n/).forEach((line, index) => {
    if (line.includes('rtl-allow')) return;

    if (isCss) {
      if (CSS_PHYSICAL.test(line)) {
        hits.push({ file, line: index + 1, token: line.trim().slice(0, 90) });
      }
      return;
    }

    // Parens are deliberately NOT separators: splitting on them tore
    // `left-(--x)` into `left-` and `--x`, and `[&_svg:not(...)]:size-4` into  rtl-allow: the example IS the class
    // pieces that `splitVariants` was written to keep whole. Quotes, braces and
    // commas already bound every class string.
    for (const raw of line.split(/[\s"'`{},;]+/)) {
      if (!raw || raw.length > 200) continue;
      const { variants, utility } = splitVariants(raw);
      if (!utility || isExempt(variants)) continue;
      if (PHYSICAL.some((re) => re.test(utility))) {
        hits.push({ file, line: index + 1, token: utility });
      }
    }
  });

  return hits;
}

export const LOGICAL_HINT =
  'Use the logical form: ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e/rounded-s/rounded-e.';

/**
 * Variants used in source but never declared in CSS.
 *
 * `rtl:` and `ltr:` are NOT built-in in Tailwind v4, and an undeclared variant
 * does not warn - it compiles to nothing at all. The failure is invisible in the
 * worst possible way: v4 handles LOGICAL utilities' direction by itself, so the
 * stylesheet is full of `:dir(rtl)` rules while every `rtl:`-prefixed class
 * silently does nothing. That disabled the RTL corrections shadcn's own
 * `rtl: true` transform had generated - dialogs off-centre by their own width,
 * every directional chevron pointing the wrong way - and nothing anywhere said so.
 */
export function findUndeclaredVariants(cssSource: string, usedVariants: Iterable<string>): string[] {
  const declared = new Set(
    [...cssSource.matchAll(/@custom-variant\s+([a-zA-Z][\w-]*)/g)].map((match) => match[1] ?? ''),
  );
  // Tailwind's own built-ins never need declaring; only the ones v4 dropped.
  const mustDeclare = new Set(['rtl', 'ltr']);

  return [...new Set(usedVariants)]
    .filter((variant) => mustDeclare.has(variant) && !declared.has(variant))
    .sort();
}

/** Every variant prefix appearing on a class in this source file. */
export function collectVariants(src: string): string[] {
  const found: string[] = [];
  for (const line of src.split(/\r?\n/)) {
    for (const raw of line.split(/[\s"'`{},;]+/)) {
      if (!raw || raw.length > 200) continue;
      const { variants } = splitVariants(raw);
      found.push(...variants);
    }
  }
  return [...new Set(found)];
}
