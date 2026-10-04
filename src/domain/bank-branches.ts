import { isLocalDate } from '@/lib/dates';
import type { LocalDate } from '@/types/money';

/**
 * A branch number to its name, from the Bank of Israel's list of branches.
 *
 * Pure: the list is handed in. The app carries a snapshot of it
 * (src/data/bank-branches.json, refreshed by `pnpm data:banks`) and fetches the
 * live list only when a number is not in the snapshot
 * (src/services/banks/branches.ts).
 */

/** [branch, Hebrew name, Hebrew city, English name, English city, closed on, merged into bank, merged into branch] */
export type BranchRow = readonly [
  number,
  string,
  string,
  string,
  string,
  string | null,
  number | null,
  number | null,
];

export type BranchList = {
  readonly fetched: string;
  /** Bank code -> its branches, by branch number. */
  readonly banks: Readonly<Record<string, readonly BranchRow[]>>;
};

export type Branch = {
  readonly bank: string;
  readonly code: number;
  readonly name: string;
  readonly city: string;
  /** The branch has closed. */
  readonly closed?: LocalDate;
  /** Where its accounts went, when it closed into another branch. */
  readonly mergedInto?: { readonly bank: string; readonly branch: number };
};

export type BranchLookup =
  /** The list does not cover this bank (the Arab banks' branches are not in it). */
  | { readonly status: 'unlisted' }
  | { readonly status: 'found'; readonly branch: Branch }
  | { readonly status: 'unknown' };

function branchOf(bank: string, row: BranchRow, language: string): Branch {
  const [code, heName, heCity, enName, enCity, closed, intoBank, intoBranch] = row;
  const english = !language.startsWith('he');
  return {
    bank,
    code,
    name: english && enName !== '' ? enName : heName,
    city: english && enCity !== '' ? enCity : heCity,
    ...(closed !== null && isLocalDate(closed) ? { closed } : {}),
    ...(intoBranch === null ? {} : { mergedInto: { bank: String(intoBank ?? bank), branch: intoBranch } }),
  };
}

/** The branch `branch` (digits) of bank `bank`, in the UI language where the list has it. */
export function findBranch(list: BranchList, bank: string, branch: string, language: string): BranchLookup {
  const rows = list.banks[bank];
  if (rows === undefined) return { status: 'unlisted' };
  const code = Number(branch);
  // A number listed twice is a closed branch and the one open under it now: the open one.
  const row = rows.find((r) => r[0] === code && r[5] === null) ?? rows.find((r) => r[0] === code);
  return row === undefined
    ? { status: 'unknown' }
    : { status: 'found', branch: branchOf(bank, row, language) };
}

/** "14/05/2026" to "2026-05-14"; anything else to null. */
function isoDate(text: unknown): string | null {
  const match = typeof text === 'string' ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim()) : null;
  if (match === null) return null;
  return `${match[3] ?? ''}-${(match[2] ?? '').padStart(2, '0')}-${(match[1] ?? '').padStart(2, '0')}`;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const whole = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/**
 * The live list, as data.gov.il's datastore answers it, in the snapshot's
 * shape - or undefined when the answer is not that list. Rows that do not
 * read are skipped; the Hebrew list only, so English names fall back to it.
 */
export function branchListFromDatastore(body: unknown, fetched: string): BranchList | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const result = (body as { result?: { records?: unknown } }).result;
  if (!Array.isArray(result?.records)) return undefined;
  const banks: Record<string, BranchRow[]> = {};
  for (const record of result.records as unknown[]) {
    if (typeof record !== 'object' || record === null) continue;
    const r = record as Record<string, unknown>;
    const bank = whole(r.Bank_Code);
    const branch = whole(r.Branch_Code);
    if (bank === null || branch === null) continue;
    const intoBranch = whole(r.Merge_Branch);
    (banks[String(bank)] ??= []).push([
      branch,
      text(r.Branch_Name),
      text(r.City),
      '',
      '',
      isoDate(r.Close_Date),
      intoBranch === null ? null : (whole(r.Merge_Bank) ?? bank),
      intoBranch,
    ]);
  }
  return Object.keys(banks).length === 0 ? undefined : { fetched, banks };
}
