import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { db } from '@/db/db';
import { LockScreen } from '@/features/account/lock-screen';
import { SecondStepScreen } from '@/features/account/second-step';
import { WelcomeScreen } from '@/features/account/welcome-screen';

import { accountController, useAccount, type AccountView } from './account';

/**
 * Nothing of the app is shown until an account is signed in.
 *
 * Outside the whole app, BootGate included:
 * - signed out: the front door - sign in, or create an account;
 * - a device holding an account's data without its session (locked after
 *   inactivity, signed out elsewhere): the sign-in screen for that account;
 * - owing the second step: the code;
 * - signed in on a device with nothing yet: the account's data is fetched
 *   first, so an account that has data opens straight into the app and only a
 *   new, empty one reaches the setup wizard.
 *
 * A build without Supabase configured (a fork, the e2e suite's local build)
 * has no accounts at all, and is the local-only app it always was.
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const view = useAccount();

  switch (view.status) {
    case 'unavailable':
      return children;
    case 'loading':
      return <Blank />;
    case 'signed_out':
      return <WelcomeScreen />;
    case 'locked':
      return <LockScreen email={view.email} idle={view.idle} />;
    case 'second_step':
      return <SecondStepScreen />;
    case 'signed_in':
      return <Arriving view={view}>{children}</Arriving>;
  }
}

function Blank() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="min-h-dvh">
      <span className="sr-only">{t('a11y.loading')}</span>
    </div>
  );
}

/**
 * Between signing in and the app. A device that already holds data opens at
 * once; one with none waits for the account's first complete fetch, and only
 * then decides - the app if data arrived, the setup of a new account if the
 * account is empty. Deciding sooner would offer a returning person the setup
 * wizard while their data was still on its way.
 */
function Arriving({
  view,
  children,
}: {
  readonly view: Extract<AccountView, { status: 'signed_in' }>;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation();
  const profiles = useLiveQuery(() => db.profiles.count(), []);

  if (profiles === undefined) return <Blank />;
  if (profiles > 0) return children;

  const { keys, sync } = view;
  const fetched = sync !== undefined && 'lastSyncedAt' in sync && sync.lastSyncedAt !== undefined;
  if (keys.kind === 'ready' && fetched) return children;

  const trouble =
    keys.kind === 'unknown' || keys.kind === 'rolled_back' || sync?.kind === 'error'
      ? t('account.arriving.error')
      : sync?.kind === 'offline'
        ? t('account.arriving.offline')
        : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <Logo size={32} title={t('app.name')} />
      {trouble === undefined ? (
        <p role="status" aria-busy="true" className="text-sm text-muted-foreground">
          {t('account.arriving.body')}
        </p>
      ) : (
        <div className="space-y-3">
          <p role="alert" className="text-sm">
            {trouble}
          </p>
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              const c = accountController();
              if (keys.kind === 'ready') c.retry();
              else void c.refreshKeys();
            }}
          >
            {t('action.retry')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => void accountController().signOut()}
          >
            {t('account.signOut')}
          </Button>
        </div>
      )}
    </main>
  );
}
