/**
 * gate:pci — §12 "Never store or request card numbers, CVVs, IBANs, or any
 * credential."
 *
 * A credit card keeps what its company shows about it - billing day, fees,
 * interest, and the month it expires (`expiresMonth`, as a reminder of when the
 * new card is due; on its own it identifies and authorises nothing). The names
 * below are what must never appear beside them.
 *
 * Ten lines that permanently close an entire class of spec violation, and give
 * the README something concrete to point at. Scans source AND i18n JSON, because
 * the fastest way to grow a card-number field is to add the label first.
 */
import { globby } from 'globby';
import { readFile } from 'node:fs/promises';

const FORBIDDEN =
  /\b(cvv|cvc|card_?number|cardnum|pan_?number|expiry_?date|expiration_?date|iban|swift_?code|routing_?number|security_?code|sort_?code)\b/i;

const files = await globby([
  'src/**/*.{ts,tsx,json}',
  'e2e/**/*.ts',
  // What reads documents on the server, and the service worker that receives shared files.
  'supabase/functions/**/*.ts',
  'public/*.js',
  '!src/**/*.test.*',
  '!src/test/fixtures/**',
]);

const hits = [];
for (const file of files) {
  const src = await readFile(file, 'utf8');
  src.split(/\r?\n/).forEach((line, i) => {
    const m = FORBIDDEN.exec(line);
    if (m) hits.push(`${file}:${i + 1}  "${m[0]}"  →  ${line.trim().slice(0, 90)}`);
  });
}

if (hits.length > 0) {
  console.error(`\ngate:pci — ${hits.length} forbidden credential field reference(s):\n`);
  for (const h of hits) console.error('  ' + h);
  console.error('\nPayment methods store a user-chosen LABEL only (§12). No exceptions.\n');
  process.exit(1);
}
console.log(`gate:pci — clean (${files.length} files scanned).`);
