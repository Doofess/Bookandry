/**
 * gate:money - §12 "No floats for money. Integer minor units everywhere."
 *
 * Float arithmetic on money is invisible in review and catastrophic in a ledger.
 * `src/lib/money.ts` is the ONLY module allowed to convert between display
 * strings and minor units, and the only place rounding may happen.
 *
 * `src/components/ui/**` is excluded: generated presentational primitives carry
 * no money logic by construction, and their arbitrary CSS values (e.g.
 * `calc(var(--stack-shrink)*100%)`) are not arithmetic. This is a narrow,
 * justified exemption - unlike gate:rtl, where covering them is the whole point.
 */
import { globby } from 'globby';
import { readFile } from 'node:fs/promises';

const BANNED = [
  { re: /\bparseFloat\s*\(/, msg: 'parseFloat on money loses precision - use toMinor() from @/lib/money.' },
  { re: /\.toFixed\s*\(/, msg: 'toFixed() is float formatting - format at the edge via @/lib/money.' },
  {
    re: /\bNumber\s*\(\s*[a-zA-Z_$][\w$]*\s*\)\s*\*\s*100\b/,
    msg: 'Float to minor conversion - use toMinor().',
  },
  { re: /(?<![\w.])\/\s*100(?![\d.%])/, msg: 'Dividing by 100 outside money.ts - use toDisplay().' },
  { re: /(?<![\w.])\*\s*100(?![\d.%])/, msg: 'Multiplying by 100 outside money.ts - use toMinor().' },
];

const BACKSLASH = String.fromCharCode(92);
const ALLOWED = ['src/lib/money.ts'];

const files = await globby([
  'src/**/*.{ts,tsx}',
  '!src/**/*.test.*',
  '!src/test/fixtures/**',
  '!src/components/ui/**',
]);

const hits = [];
for (const file of files) {
  if (ALLOWED.includes(file.split(BACKSLASH).join('/'))) continue;
  const src = await readFile(file, 'utf8');
  src.split(/\r?\n/).forEach((line, i) => {
    if (line.includes('money-allow')) return;
    const code = line.replace(/\/\/.*$/, '');
    for (const { re, msg } of BANNED) {
      if (re.test(code)) hits.push(`${file}:${i + 1}  ${msg}\n      ${line.trim().slice(0, 100)}`);
    }
  });
}

if (hits.length > 0) {
  console.error(`\ngate:money - ${hits.length} float-money violation(s):\n`);
  for (const h of hits) console.error('  ' + h);
  console.error('');
  process.exit(1);
}
console.log(`gate:money - clean (${files.length} files scanned).`);
