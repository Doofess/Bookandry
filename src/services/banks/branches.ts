import { branchListFromDatastore, type BranchList } from '@/domain/bank-branches';

/**
 * The Bank of Israel's list of branches: the copy the app ships, and the live
 * list when that copy does not know a number.
 *
 * The copy is its own chunk, loaded the first time an account is edited - it
 * is 125KB nobody needs to open the feed. The live list is fetched whole,
 * never by the number typed: data.gov.il learns that someone looked at bank
 * branches, not which one.
 */
const LIVE =
  'https://data.gov.il/api/3/action/datastore_search?resource_id=2202bada-4baf-45f5-aa61-8c5bad9646d3&limit=5000&fields=Bank_Code,Branch_Code,Branch_Name,City,Close_Date,Merge_Bank,Merge_Branch';

let snapshot: Promise<BranchList> | undefined;
let live: Promise<BranchList | undefined> | undefined;

export function loadBranches(): Promise<BranchList> {
  snapshot ??= import('@/data/bank-branches.json').then((module) => module.default as unknown as BranchList);
  return snapshot;
}

/** The live list, once a session; undefined when it cannot be had (offline, or the answer did not read). */
export function liveBranches(today: string): Promise<BranchList | undefined> {
  live ??= fetch(LIVE, { signal: AbortSignal.timeout(15_000) })
    .then(async (response) =>
      response.ok ? branchListFromDatastore(await response.json(), today) : undefined,
    )
    .catch(() => undefined)
    .then((list) => {
      // A failure is not remembered: the next lookup, back online, tries again.
      if (list === undefined) live = undefined;
      return list;
    });
  return live;
}
