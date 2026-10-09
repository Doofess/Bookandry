import { useEffect, useState } from 'react';

import type { MccList } from '@/domain/mcc';
import { loadMccList } from '@/services/mcc/mcc-list';

/**
 * The business types' names, for a screen that shows them: undefined until
 * their chunk has loaded, and while it cannot be (offline on a first visit).
 * A screen shows the code itself until then.
 */
export function useMccList(): MccList | undefined {
  const [list, setList] = useState<MccList | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void loadMccList().then(
      (loaded) => {
        if (live) setList(loaded);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return list;
}
