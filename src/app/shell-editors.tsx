import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';

import { useFeedLookups } from '@/features/feed/use-feed-data';
import { TransactionSheet } from '@/features/transaction/transaction-sheet';
import { useIncomeHistory } from '@/features/transaction/use-income-history';
import { useTransactionSheet } from '@/features/transaction/use-transaction-sheet';

import { useSettings, useToday } from './app-context';
import { ROUTES } from './routes';

const ImportSheet = lazy(() =>
  import('@/features/import/import-sheet').then((m) => ({ default: m.ImportSheet })),
);

/** Screens that mount the add-and-edit editor themselves, with their own reaction to a save. */
const OWN_TRANSACTION_EDITOR: ReadonlySet<string> = new Set([ROUTES.feed, ROUTES.cash]);
/** Screens that mount Smart import themselves. */
const OWN_IMPORT: ReadonlySet<string> = new Set([ROUTES.feed]);

/**
 * The add and import editors on every other screen (§4.2).
 *
 * From lg, Add is in the rail on every screen, and its panel opens over
 * whatever screen is there: a save from Cards leaves the person on Cards.
 * The editors are driven by the address (?add=, ?edit=, ?import=), as on the
 * feed, so the rail's Add only writes the address and whichever editor the
 * screen has picks it up. Feed and Cash mount their own, so they are skipped.
 */
export function ShellEditors() {
  const { pathname } = useLocation();
  const sheet = useTransactionSheet();
  const lookups = useFeedLookups();
  const settings = useSettings();
  const today = useToday();
  const incomeHistory = useIncomeHistory(today);

  if (lookups === undefined) return null;
  const categories = [...lookups.categories.values()];
  const paymentMethods = [...lookups.paymentMethods.values()];

  return (
    <>
      {OWN_TRANSACTION_EDITOR.has(pathname) ? null : (
        <TransactionSheet
          target={sheet.target}
          onOpenChange={sheet.setOpen}
          profiles={lookups.profiles}
          categories={categories}
          paymentMethods={paymentMethods}
          activeProfileId={settings.activeProfileId}
          baseCurrency={settings.defaultCurrency}
          today={today}
          incomeHistory={incomeHistory}
          onSaved={() => {
            sheet.close();
          }}
        />
      )}
      {OWN_IMPORT.has(pathname) || sheet.target.mode !== 'import' ? null : (
        <Suspense fallback={null}>
          <ImportSheet
            target={sheet.target}
            onOpenChange={sheet.setOpen}
            onOpenRow={sheet.openImportRow}
            onOpenCard={sheet.openImportCard}
            profiles={lookups.profiles}
            categories={categories}
            paymentMethods={paymentMethods}
            activeProfileId={settings.activeProfileId}
            baseCurrency={settings.defaultCurrency}
            today={today}
            onSaved={() => {
              sheet.close();
            }}
          />
        </Suspense>
      )}
    </>
  );
}
