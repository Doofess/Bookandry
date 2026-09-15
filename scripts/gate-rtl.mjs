/**
 * gate:rtl - bans physical-direction utilities (§7, §12).
 *
 * The spec's approach ("audit and patch every generated component by hand") does
 * not survive several phases of new code, so this runs in `pnpm verify` from
 * Phase 0. It covers what no ESLint rule reaches: classes inside cn()/cva(),
 * template literals, and .css files.
 *
 * `src/components/ui/**` is deliberately NOT exempt - that is the entire point.
 *
 * The scanning logic is pure and lives in src/lib/rtl-scan.ts so it is
 * type-checked and unit-tested; this file is I/O only.
 */
import { globby } from 'globby';
import { readFile } from 'node:fs/promises';

import { collectVariants, findUndeclaredVariants, LOGICAL_HINT, scanSource } from '../src/lib/rtl-scan.ts';

const PATTERNS = ['src/**/*.{ts,tsx,css}', '!src/**/*.test.*', '!src/test/fixtures/**'];
const TOKENS_CSS = 'src/index.css';

const files = await globby(PATTERNS);
const hits = [];
const usedVariants = new Set();
for (const file of files) {
  const src = await readFile(file, 'utf8');
  hits.push(...scanSource(file, src));
  if (!file.endsWith('.css')) for (const v of collectVariants(src)) usedVariants.add(v);
}

/*
 * An undeclared variant compiles to NOTHING and warns about nothing.
 *
 * rtl:/ltr: are not built in to Tailwind v4, so every `rtl:`-prefixed class in
 * the codebase - including the ones shadcn's own `rtl: true` transform
 * generated - silently did nothing until the variants were declared. The
 * stylesheet looked healthy the whole time, because v4 handles LOGICAL
 * utilities' direction by itself.
 */
const undeclared = findUndeclaredVariants(await readFile(TOKENS_CSS, 'utf8'), usedVariants);
if (undeclared.length > 0) {
  console.error(`\ngate:rtl - variant(s) used but never declared: ${undeclared.join(', ')}\n`);
  for (const variant of undeclared) {
    console.error(
      `  @custom-variant ${variant} (&:where(:dir(${variant}), [dir='${variant}'], [dir='${variant}'] *));`,
    );
  }
  console.error(`\nAdd the declaration to ${TOKENS_CSS}; without it the classes emit no CSS at all.\n`);
  process.exit(1);
}

if (hits.length > 0) {
  console.error(`\ngate:rtl - ${hits.length} physical-direction utility/utilities found:\n`);
  for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.token}`);
  console.error(`\n${LOGICAL_HINT}`);
  console.error('If deliberately physical, scope it with rtl:/ltr: or add an `rtl-allow` comment.\n');
  process.exit(1);
}

console.log(`gate:rtl - clean (${files.length} files scanned).`);
