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

import { LOGICAL_HINT, scanSource } from '../src/lib/rtl-scan.ts';

const PATTERNS = ['src/**/*.{ts,tsx,css}', '!src/**/*.test.*', '!src/test/fixtures/**'];

const files = await globby(PATTERNS);
const hits = [];
for (const file of files) {
  hits.push(...scanSource(file, await readFile(file, 'utf8')));
}

if (hits.length > 0) {
  console.error(`\ngate:rtl - ${hits.length} physical-direction utility/utilities found:\n`);
  for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.token}`);
  console.error(`\n${LOGICAL_HINT}`);
  console.error('If deliberately physical, scope it with rtl:/ltr: or add an `rtl-allow` comment.\n');
  process.exit(1);
}

console.log(`gate:rtl - clean (${files.length} files scanned).`);
