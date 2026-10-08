/**
 * gate:money - §12 "No floats for money. Integer minor units everywhere."
 *
 * Float arithmetic on money is invisible in review and catastrophic in a ledger.
 * `src/lib/money.ts` is the ONLY module allowed to convert between display
 * strings and minor units, and the only place rounding may happen.
 *
 * Math.pow, ** and Math.round are banned too: compounding a rate and rounding
 * the result back to agorot is exactly where a float slips into a ledger. A
 * line that rounds something that is not money (a CSS width, a pixel) says so
 * with a `money-allow` comment naming what it rounds.
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
  // Interest is where floats creep in: a rate raised to a power, then rounded
  // back to agorot. Exact rational maths for it lives in money.ts.
  { re: /\bMath\.pow\s*\(/, msg: 'Math.pow is float arithmetic - compound interest belongs in @/lib/money.' },
  { re: /[\w)\]]\s*\*\*\s*[\w(]/, msg: '** is float arithmetic - compound interest belongs in @/lib/money.' },
  {
    re: /\bMath\.round\s*\(/,
    msg: 'Math.round outside money.ts - round money via @/lib/money; a non-money use carries money-allow.',
  },
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
  // Block-comment state, carried across lines. Prose is not arithmetic, and a
  // gate that fires on the JSDoc EXPLAINING why a pattern was avoided teaches
  // people to reach for the escape hatch instead of reading the message.
  let inBlockComment = false;

  src.split(/\r?\n/).forEach((line, i) => {
    if (line.includes('money-allow')) return;

    let code = line;
    if (inBlockComment) {
      const end = code.indexOf('*/');
      if (end === -1) return;
      inBlockComment = false;
      code = code.slice(end + 2);
    }
    code = code.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const open = code.indexOf('/*');
    if (open !== -1) {
      inBlockComment = true;
      code = code.slice(0, open);
    }
    code = code.replace(/\/\/.*$/, '');

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
