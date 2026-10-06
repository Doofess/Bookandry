import { useLiveQuery } from 'dexie-react-hooks';
import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/routes';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/db';
import { listUnfinished } from '@/db/import-drafts';

/**
 * Cards or accounts "Smart import" found only part of, waiting to be finished:
 * said where the household's cards and accounts are, with the way back to
 * them - straight to the one, when there is one.
 */
export function UnfinishedNotice({ kind }: { readonly kind: 'card' | 'account' }) {
  const { t } = useTranslation('cards');
  const waiting = useLiveQuery(
    async () => (await listUnfinished(db)).filter((entry) => entry.kind === kind),
    [kind],
  );
  const [first] = waiting ?? [];
  if (waiting === undefined || first === undefined) return null;
  const search = new URLSearchParams({ import: '1', ...(waiting.length === 1 ? { card: first.key } : {}) });
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2"
      data-testid="unfinished-notice"
    >
      <p className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
        <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
        {t(kind === 'card' ? 'unfinished.cards' : 'unfinished.accounts', { count: waiting.length })}
      </p>
      <Link
        to={{ pathname: ROUTES.feed, search: `?${search.toString()}` }}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        {t('unfinished.open')}
      </Link>
    </div>
  );
}
