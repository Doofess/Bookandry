import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

import { useAccount } from '@/app/account';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SettingsPage } from '@/features/settings/settings-page';

import { LockAfterChoice, Passkeys, TwoStep } from './account-card';
import { AccountSheet, type Flow } from './account-sheet';

/** Settings > Sign-in and security: how the account is opened, and closed. */
export function SecurityScreen() {
  const { t } = useTranslation();
  const view = useAccount();
  const [flow, setFlow] = useState<Flow | undefined>(undefined);

  if (view.status !== 'signed_in') return <Navigate to={ROUTES.settings} replace />;

  const open = (next: Flow) => () => {
    setFlow(next);
  };

  return (
    <SettingsPage title={t('account.security')}>
      <Card>
        <CardContent className="space-y-6 divide-y divide-border [&>*:not(:first-child)]:pt-6">
          <Passkeys />
          <TwoStep on={view.twoStep} open={open} />
          <LockAfterChoice />
        </CardContent>
      </Card>

      <div>
        <Button type="button" variant="outline" onClick={open({ kind: 'signOutOthers' })}>
          {t('account.signOutOthers')}
        </Button>
      </div>

      <AccountSheet
        flow={flow}
        onClose={() => {
          setFlow(undefined);
        }}
      />
    </SettingsPage>
  );
}
