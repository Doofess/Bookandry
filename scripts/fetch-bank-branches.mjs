/**
 * pnpm data:banks — refresh src/data/bank-branches.json from the Bank of
 * Israel's list of bank branches (data.gov.il, "סניפי בנקים פיזיים", updated
 * daily by the Bank of Israel).
 *
 * The app ships this snapshot so a branch number is recognised offline and
 * without telling anyone which branch was typed; when a number is not in it,
 * the app fetches the same list live (src/services/banks/branches.ts). Run
 * this now and then so the snapshot stays close to the live list.
 */
import { writeFile } from 'node:fs/promises';

const API = 'https://data.gov.il/api/3/action/datastore_search';
const HEBREW = '2202bada-4baf-45f5-aa61-8c5bad9646d3';
const ENGLISH = '6f3bda2a-8cde-4b86-a1c8-2761862b1224';
const FIELDS = 'Bank_Code,Branch_Code,Branch_Name,City,Close_Date,Merge_Bank,Merge_Branch';

async function records(resource) {
  const url = `${API}?resource_id=${resource}&limit=5000&fields=${FIELDS}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const body = await response.json();
  if (body.success !== true) throw new Error(`${url}: not a success`);
  return body.result.records;
}

const clean = (text) => (typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '');

/** The English list writes cities in capitals: "TEL AVIV - YAFO" to "Tel Aviv - Yafo". */
const titled = (text) =>
  clean(text)
    .toLowerCase()
    .replace(/(^|[\s'(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

/** An English name all in capitals or all in lower case, title-cased; one already mixed, as it is. */
const cased = (text) => {
  const value = clean(text);
  return value === value.toUpperCase() || value === value.toLowerCase() ? titled(value) : value;
};

/** "14/05/2026" to "2026-05-14"; anything else to null. */
function isoDate(text) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(clean(text));
  if (match === null) return null;
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

const [he, en] = await Promise.all([records(HEBREW), records(ENGLISH)]);
// A number can appear twice - a closed branch and the one that took its place -
// so the two lists are matched by number and by which of its rows it is.
const english = new Map();
for (const r of en) {
  const key = `${r.Bank_Code}-${r.Branch_Code}`;
  english.set(key, [...(english.get(key) ?? []), r]);
}
const seen = new Map();

/** bank code -> [branch, Hebrew name, Hebrew city, English name, English city, closed, merged into bank, merged into branch] */
const banks = {};
for (const r of he) {
  const key = `${r.Bank_Code}-${r.Branch_Code}`;
  const nth = seen.get(key) ?? 0;
  seen.set(key, nth + 1);
  const e = english.get(key)?.[nth];
  const row = [
    Number(r.Branch_Code),
    clean(r.Branch_Name),
    clean(r.City),
    cased(e?.Branch_Name),
    titled(e?.City),
    isoDate(r.Close_Date),
    r.Merge_Branch === null || r.Merge_Branch === undefined ? null : Number(r.Merge_Bank ?? r.Bank_Code),
    r.Merge_Branch === null || r.Merge_Branch === undefined ? null : Number(r.Merge_Branch),
  ];
  (banks[String(r.Bank_Code)] ??= []).push(row);
}
for (const rows of Object.values(banks)) rows.sort((a, b) => a[0] - b[0]);

const snapshot = {
  source: 'https://data.gov.il/dataset/branches',
  fetched: new Date().toISOString().slice(0, 10),
  banks,
};
await writeFile(new URL('../src/data/bank-branches.json', import.meta.url), JSON.stringify(snapshot) + '\n');
console.log(`bank-branches.json: ${he.length} branches of ${Object.keys(banks).length} banks.`);
