import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/db/db';
import { getSettings } from '@/db/repos/settings';

import { SettingsProvider } from './settings-provider';

/**
 * The single boot gate.
 *
 * `useLiveQuery` returns `undefined` on its first render. Any component doing
 * `settings?.defaultCurrency ?? 'USD'` would therefore convert one frame of
 * money at the wrong rate - and the summary card's count-up would ANIMATE FROM
 * that number, making the wrong figure the thing the eye follows. Resolving it
 * once here makes `defaultCurrency` and `activeProfileId` non-nullable for
 * every descendant, so that `??` never gets written in the first place.
 *
 * `useLiveQuery` is allowed HERE and in hooks, never in a leaf: one IndexedDB
 * subscription per feed row would be catastrophic.
 *
 * The profile COUNT is queried rather than the rows: the gate only needs to
 * know whether any exist, and a count is an index operation that does not
 * re-render the whole tree whenever a name changes.
 */
export function BootGate({ children, firstRun }: { children: ReactNode; firstRun: ReactNode }) {
  const state = useLiveQuery(async () => {
    const [settings, profileCount] = await Promise.all([getSettings(db), db.profiles.count()]);
    return { settings, profileCount };
  }, []);

  if (state?.settings === undefined) return <AppSkeleton />;

  return (
    <SettingsProvider value={state.settings}>
      {state.profileCount === 0 ? firstRun : children}
    </SettingsProvider>
  );
}

function AppSkeleton() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t('a11y.loading')}</span>
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="mt-4 h-4 w-24" />
      <div className="mt-4 space-y-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
