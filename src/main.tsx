import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import '@fontsource-variable/inter';
import '@fontsource-variable/heebo';
import './index.css';

import { AppShell } from '@/app/app-shell';
import { BootGate } from '@/app/boot-gate';
import { AppDirection } from '@/app/direction-provider';
import { ROUTES } from '@/app/routes';
import { TodayProvider } from '@/app/today-provider';
import { db } from '@/db/db';
import { ensureSettings } from '@/db/repos/settings';
import { ChartScreen } from '@/features/chart/chart-screen';
import { FeedScreen } from '@/features/feed/feed-screen';
import { FirstRun } from '@/features/first-run/first-run';
import { ProfilesScreen } from '@/features/profiles/profiles-screen';
import { SettingsScreen } from '@/features/settings/settings-screen';
import i18n, { initI18n } from '@/i18n';
import { readBootMirror } from '@/i18n/boot';
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

  await initI18n();

  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('#root not found');

  const { theme } = readBootMirror();

  createRoot(rootEl).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <AppDirection theme={theme}>
          <TodayProvider>
            <BootGate firstRun={<FirstRun />}>
              <RouterProvider router={router} />
            </BootGate>
          </TodayProvider>
        </AppDirection>
      </I18nextProvider>
    </StrictMode>,
  );
}

void bootstrap();
