// First, before any module that builds a schema: see the file.
import '@/lib/zod-jitless';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import '@fontsource-variable/inter';
import '@fontsource-variable/heebo';
import '@fontsource-variable/frank-ruhl-libre';
import './index.css';

import { initAccount } from '@/app/account';
import { AccountGate } from '@/app/account-gate';
import { appRoutes } from '@/app/app-routes';
import { AppShell } from '@/app/app-shell';
import { BootGate } from '@/app/boot-gate';
import { capturePendingLinks } from '@/app/capture-pending';
import { AppDirection } from '@/app/direction-provider';
import { allowLongCreditSweep, startPrimeWatcher } from '@/app/prime';
import { ROUTES } from '@/app/routes';
import { keepUpToDate } from '@/app/sw-update';
import { TodayProvider } from '@/app/today-provider';
import { refreshCatalogCards } from '@/db/catalog-refresh';
import { db } from '@/db/db';
import { ensureBuiltinCategories } from '@/db/repos/categories';
import { ensureBuiltinPaymentMethods } from '@/db/repos/payment-methods';
import { ensureSettings } from '@/db/repos/settings';
import { startSweeper } from '@/db/sweeper';
import { FirstRun } from '@/features/first-run/first-run';
import i18n, { initI18n } from '@/i18n';
import { systemClock } from '@/lib/clock';
import { captureArrival } from '@/services/supabase/id-token';

/*
 * Back from signing in with Google: take Google's answer out of
 * the address before the router reads it (it would find no /auth/callback
 * screen) and before anything else could see it. The account controller
 * finishes the sign-in when it starts.
 */
captureArrival();

// An emailed invitation's or delete request's token, kept before the gates
// below can show the welcome screen in place of its page: see the file.
capturePendingLinks();

const router = createBrowserRouter([{ path: ROUTES.feed, element: <AppShell />, children: appRoutes }]);

async function bootstrap(): Promise<void> {
  // index.html's boot script is sending this visit to https://bookandry.com
  // (it came over http, or on www). Start nothing here - no database, no
  // service worker, no session - on a page that is already leaving.
  if (document.documentElement.hasAttribute('data-leaving')) return;

  // The service worker, exactly as vite-plugin-pwa's own registerSW.js did it
  // (injectRegister is off so that this check comes first). Synchronous here,
  // before the first await, so it is always listening before `load` fires.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          keepUpToDate(registration);
        })
        .catch(() => undefined);
    });
  }

  // Ask for durable storage before anything writes. If denied, Settings > Data
  // surfaces a note (Phase 2) — export is the only backup story for a
  // local-first app with no sync.
  // Optional: some browsers, and any insecure page, have no StorageManager.
  // Losing the request must never stop the app from starting.
  const storage = (navigator as Partial<Pick<Navigator, 'storage'>>).storage;
  void storage?.persist().catch(() => undefined);

  // Open the database before the first render so `on('populate')` has run and
  // the settings singleton exists. The boot gate then distinguishes "still
  // loading" from "no profiles yet" instead of conflating them into one
  // skeleton that never resolves.
  await db.open();
  await ensureSettings(db, systemClock.nowIso());
  await ensureBuiltinPaymentMethods(db, systemClock.nowIso());
  await ensureBuiltinCategories(db, systemClock.nowIso());

  /*
   * Purge expired tombstones, unawaited.
   *
   * Soft-deleted rows are recoverable for 24 hours and hard-deleted after -
   * a promise the Recently deleted screen makes and only this call keeps.
   * Fire-and-forget: nobody is waiting on a purge, and it must not delay the
   * first paint.
   */
  startSweeper(db, () => systemClock.nowMs());

  // Cards linked to an older card catalog follow the new one, unawaited. The
  // catalog's own chunk is fetched only when some card is behind it.
  void refreshCatalogCards(db, systemClock.today(), systemClock.nowIso()).catch(() => undefined);

  // Israeli prime, kept current from the Bank of Israel. Unawaited: the app
  // has a figure to show from the first paint, and a fresher one replaces it.
  startPrimeWatcher();

  /*
   * Accounts are optional. This loads nothing unless there is a session to
   * resume or a sign-in redirect to finish; signed-out people never download
   * the Supabase client at all.
   */
  const account = initAccount(db);

  /*
   * Long קרדיט plans that follow prime are re-priced (and frozen once their
   * reset payment is due) when this start's data is settled: at once without
   * an account, after the first sync has pulled with one - so values another
   * device froze arrive before this one works out its own.
   */
  account.onDataReady(() => {
    void allowLongCreditSweep();
  });
  account.start();

  await initI18n();

  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('#root not found');

  createRoot(rootEl).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <AppDirection>
          <AccountGate>
            <TodayProvider>
              <BootGate firstRun={<FirstRun />}>
                <RouterProvider router={router} />
              </BootGate>
            </TodayProvider>
          </AccountGate>
        </AppDirection>
      </I18nextProvider>
    </StrictMode>,
  );
}

void bootstrap();
