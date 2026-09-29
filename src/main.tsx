// First, before any module that builds a schema: see the file.
import '@/lib/zod-jitless';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import '@fontsource-variable/inter';
import '@fontsource-variable/heebo';
import './index.css';

import { initAccount } from '@/app/account';
import { AccountGate } from '@/app/account-gate';
import { AppShell } from '@/app/app-shell';
import { BootGate } from '@/app/boot-gate';
import { AppDirection } from '@/app/direction-provider';
import { LINKED_ROUTES, ROUTES } from '@/app/routes';
import { TodayProvider } from '@/app/today-provider';
import { db } from '@/db/db';
import { ensureSettings } from '@/db/repos/settings';
import { startSweeper } from '@/db/sweeper';
import { ChartScreen } from '@/features/chart/chart-screen';
import { CommitmentsScreen } from '@/features/commitments/commitments-screen';
import { FeedScreen } from '@/features/feed/feed-screen';
import { FirstRun } from '@/features/first-run/first-run';
import { ProfilesScreen } from '@/features/profiles/profiles-screen';
import { CategoriesScreen } from '@/features/settings/categories-screen';
import { PaymentMethodsScreen } from '@/features/settings/payment-methods-screen';
import { SettingsScreen } from '@/features/settings/settings-screen';
import i18n, { initI18n } from '@/i18n';
import { systemClock } from '@/lib/clock';

const router = createBrowserRouter([
  {
    path: ROUTES.feed,
    element: <AppShell />,
    children: [
      { index: true, element: <FeedScreen /> },
      { path: ROUTES.chart, element: <ChartScreen /> },
      { path: ROUTES.profiles, element: <ProfilesScreen /> },
      { path: ROUTES.settings, element: <SettingsScreen /> },
      { path: LINKED_ROUTES.commitments, element: <CommitmentsScreen /> },
      { path: LINKED_ROUTES.categories, element: <CategoriesScreen /> },
      { path: LINKED_ROUTES.paymentMethods, element: <PaymentMethodsScreen /> },
    ],
  },
]);

async function bootstrap(): Promise<void> {
  // Ask for durable storage before anything writes. If denied, Settings > Data
  // surfaces a note (Phase 2) — export is the only backup story for a
  // local-first app with no sync.
  void navigator.storage.persist();

  // Open the database before the first render so `on('populate')` has run and
  // the settings singleton exists. The boot gate then distinguishes "still
  // loading" from "no profiles yet" instead of conflating them into one
  // skeleton that never resolves.
  await db.open();
  await ensureSettings(db, systemClock.nowIso());

  /*
   * Purge expired tombstones, unawaited.
   *
   * Soft-deleted rows are recoverable for 24 hours and hard-deleted after -
   * a promise the Recently deleted screen makes and only this call keeps.
   * Fire-and-forget: nobody is waiting on a purge, and it must not delay the
   * first paint.
   */
  startSweeper(db, () => systemClock.nowMs());

  /*
   * Accounts are optional. This loads nothing unless there is a session to
   * resume or a sign-in redirect to finish; signed-out people never download
   * the Supabase client at all.
   */
  initAccount(db).start();

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
