import { useEffect, useState } from 'react';

import { findBranch, type BranchLookup } from '@/domain/bank-branches';
import { isBranchNumber } from '@/domain/banks';
import { liveBranches, loadBranches } from '@/services/banks/branches';

export type BranchState = BranchLookup | { readonly status: 'idle' } | { readonly status: 'looking' };

/**
 * A branch number's name, as the Bank of Israel lists it: from the app's copy
 * of the list, and from the live list when the copy does not have it (a
 * branch opened since). Idle until there is a bank and a number to look up.
 */
export function useBranch(bank: string, branch: string, language: string, today: string): BranchState {
  const ready = bank !== '' && isBranchNumber(branch);
  const key = `${bank}/${branch}/${language}`;
  const [result, setResult] = useState<{ readonly key: string; readonly state: BranchState }>({
    key: '',
    state: { status: 'idle' },
  });

  useEffect(() => {
    if (!ready) return;
    const run = { current: true };
    void (async () => {
      const found = findBranch(await loadBranches(), bank, branch, language);
      if (found.status !== 'unknown') {
        if (run.current) setResult({ key, state: found });
        return;
      }
      const live = await liveBranches(today);
      const again = live === undefined ? found : findBranch(live, bank, branch, language);
      if (run.current) setResult({ key, state: again });
    })();
    return () => {
      run.current = false;
    };
  }, [ready, key, bank, branch, language, today]);

  if (!ready) return { status: 'idle' };
  return result.key === key ? result.state : { status: 'looking' };
}
