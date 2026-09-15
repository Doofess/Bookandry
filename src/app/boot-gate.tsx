import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * The single boot gate.
 *
 * `useLiveQuery` returns `undefined` on its first render. Any component doing
 * `settings?.defaultCurrency ?? 'USD'` would therefore convert one frame of
 * money at the wrong rate — and the summary card's count-up would ANIMATE FROM
 * that wrong number, making it visible. Gating once here makes `defaultCurrency`
 * and `activeProfileId` non-nullable for every descendant, so that `??` never
 * gets written in the first place.
 *
 * Phase 2 replaces `ready` with the Dexie settings singleton, and adds the
 * zero-profiles branch that routes to first-run.
 */
export function BootGate({ ready, children }: { ready: boolean; children: ReactNode }) {
  const { t } = useTranslation();

  if (!ready) {
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

  return <>{children}</>;
}
