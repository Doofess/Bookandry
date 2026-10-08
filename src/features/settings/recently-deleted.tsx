import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';

import { useBaseCurrency } from '@/app/app-context';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/db/db';
import { listRecentlyDeleted, restoreDeleted, RECOVERY_WINDOW_MS } from '@/db/repos/transactions';
import { categoryDisplayName } from '@/i18n/category-name';
import { systemClock } from '@/lib/clock';
import { formatLocalDate } from '@/lib/dates';
import type { Transaction } from '@/types/domain';

/**
 * The 24-hour recovery window, made reachable.
 *
 * The undo toast is a convenience; this is the recovery story. Without a screen
 * over the `deletedAt` index, a delete is permanent the moment the toast is
 * dismissed - on a device with no backup and no sync, which the plan names as
 * the single most costly gap in the spec.
 *
 * The rows are already in the database and already swept; this is a list and a
 * button over work Phase 2 finished.
 */
export function RecentlyDeleted() {
  const { t, i18n } = useTranslation(['common', 'categories']);
  const baseCurrency = useBaseCurrency();

  const rows = useLiveQuery(async () => {
    const deleted = await listRecentlyDeleted(db);
    const categories = await db.categories.toArray();
    const byId = new Map(categories.map((c) => [c.id, c]));
    return deleted.map((tx) => ({
      tx,
      category: byId.get(tx.categoryId),
    }));
  }, []);

  const hours = Math.round(RECOVERY_WINDOW_MS / 3_600_000); // money-allow: hours in the recovery window

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tx.deletedTitle')}</CardTitle>
        <CardDescription>{t('tx.deletedBody', { count: hours })}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows === undefined ? null : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('tx.deletedEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map(({ tx, category }) => (
              <li key={tx.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {tx.note ?? (category === undefined ? tx.categoryId : categoryDisplayName(category, t))}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatLocalDate(tx.date, i18n.language, { dateStyle: 'medium' })}
                  </span>
                </span>

                <Money
                  minor={tx.kind === 'income' ? tx.money.baseAmountMinor : -tx.money.baseAmountMinor}
                  currency={baseCurrency}
                  announce={false}
                  className="shrink-0 text-sm"
                />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Stamped with NOW, not with the delete's instant: the
                    // restore has to win the next import merge against the
                    // delete it reverses.
                    void restore(tx);
                  }}
                >
                  {t('tx.deletedRestore')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

async function restore(tx: Transaction): Promise<void> {
  await restoreDeleted(db, tx.id, systemClock.nowIso());
}
