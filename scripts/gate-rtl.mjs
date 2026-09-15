/**
 * gate:rtl — bans physical-direction utilities (§7, §12).
 *
 * The spec's approach ("audit and patch every generated component by hand") does
 * not survive five phases of new code. This runs in `pnpm verify` from Phase 0
 * and covers what no ESLint rule reaches: classes inside cn()/cva()/clsx(),
 * template literals, and .css files.
 *
 * `src/components/ui/**` is deliberately NOT exempt — that is the entire point.
 *
 * Legitimate physical usage is recognised rather than blanket-allowed:
 *   - a variant chain containing `rtl:` or `ltr:`  (an explicit per-direction rule)
 *   - a variant chain containing `data-[side=...]` (pairs with a physical side prop)
 *   - a line carrying an `rtl-allow` comment       (reviewed escape hatch)
 */
import { globby } from 'globby';
import { readFile } from 'node:fs/promises';

/** Utility heads that have a logical equivalent and must not be used bare. */
const PHYSICAL = [
  /^-?(ml|mr|pl|pr)-/,
  /^-?(left|right)-/,
  /^(text|float|origin|object|bg)-(left|right)$/,
  /^-?scroll-(ml|mr)-/,
  /^-?scroll-(pl|pr)-/,
  /^rounded-(l|r|tl|tr|bl|br)(?![a-z])/,
  /^border-(l|r)(?![a-z])/,
];

export const LOGICAL_HINT =
  'Use the logical form: ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e/rounded-s/rounded-e.';

/** Split a Tailwind token on ':' at bracket depth 0, so `[&_svg:not(...)]:size-4` stays intact. */
function splitVariants(token) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of token) {
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    if (ch === ':' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return { variants: parts.slice(0, -1), utility: parts.at(-1) ?? '' };
}

function isExempt(variants) {
  return variants.some((v) => v === 'rtl' || v === 'ltr' || v.startsWith('data-[side='));
}

const CSS_PHYSICAL =
  /(?<![\w-])(margin|padding|border|inset|scroll-margin|scroll-padding)-(left|right)\s*:|(?<![\w-])(left|right)\s*:/;

/** Scan one file's source text. Exported so the gate can be tested against a fixture. */
export function scanSource(file, src) {
  const hits = [];
  src.split(/\r?\n/).forEach((line, i) => {
    if (line.includes('rtl-allow')) return;

    if (file.endsWith('.css')) {
      if (CSS_PHYSICAL.test(line)) hits.push({ file, line: i + 1, token: line.trim().slice(0, 90) });
      return;
    }

    for (const raw of line.split(/[\s"'`{}(),;]+/)) {
      if (!raw || raw.length > 200) continue;
      const { variants, utility } = splitVariants(raw);
      if (!utility || isExempt(variants)) continue;
      if (PHYSICAL.some((re) => re.test(utility))) hits.push({ file, line: i + 1, token: utility });
    }
  });
  return hits;
}

export async function scanPaths(patterns) {
  const files = await globby(patterns);
  const hits = [];
  for (const file of files) hits.push(...scanSource(file, await readFile(file, 'utf8')));
  return { files, hits };
}

export const DEFAULT_PATTERNS = ['src/**/*.{ts,tsx,css}', '!src/**/*.test.*', '!src/test/fixtures/**'];

if (import.meta.filename === process.argv[1]) {
  const { files, hits } = await scanPaths(DEFAULT_PATTERNS);
  if (hits.length > 0) {
    console.error(`\ngate:rtl — ${hits.length} physical-direction utility/utilities found:\n`);
    for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.token}`);
    console.error(`\n${LOGICAL_HINT}`);
    console.error('If deliberately physical, scope it with rtl:/ltr: or add an `rtl-allow` comment.\n');
    process.exit(1);
  }
  console.log(`gate:rtl — clean (${files.length} files scanned).`);
}
