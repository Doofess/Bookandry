import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { LockScreen } from '@/features/account/lock-screen';

import { useAccount } from './account';

/**
 * An account's data is shown only while that account is signed in.
 *
 * Outside the whole app, BootGate included: a locked device renders the
 * sign-in screen and nothing else - no feed behind it, no totals in the tab
 * title. While the account is still being checked at boot, nothing of it is
 * shown either; that is a few milliseconds for a device with no account, and
 * the time to read a stored session for one with.
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const view = useAccount();

  if (view.status === 'loading')
    return (
      <div aria-busy="true" className="min-h-dvh">
        <span className="sr-only">{t('a11y.loading')}</span>
      </div>
    );
  if (view.status === 'locked') return <LockScreen email={view.email} idle={view.idle} />;
  return children;
}
