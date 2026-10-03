import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAccount } from '@/app/account';
import { useSettings, useToday } from '@/app/app-context';

import { DataCard } from './data-card';
import { RecentlyDeleted } from './recently-deleted';
import { SettingsPage } from './settings-page';

/** Settings > Backup and data: a copy of your own, restoring one, and what was deleted lately. */
export function DataScreen() {
  const { t } = useTranslation();
  const settings = useSettings();
  const today = useToday();
  const persisted = usePersisted();
  const signedIn = useAccount().status === 'signed_in';

  return (
    <SettingsPage title={t('settings.sections.data')}>
      <DataCard
        lastExportedAt={settings.lastExportedAt}
        today={today}
        persisted={persisted}
        signedIn={signedIn}
      />
      <RecentlyDeleted />
    </SettingsPage>
  );
}

/**
 * Whether the browser has promised to keep the database.
 *
 * `navigator.storage.persist()` is requested at boot and can be DENIED - a
 * best-effort store may be evicted when the device runs low on space, which is
 * exactly when the backup nudge stops being optional. Asked once, here, rather
 * than assumed anywhere.
 */
function usePersisted(): boolean | undefined {
  const [persisted, setPersisted] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    // Absent on an insecure page and in some browsers, whatever the types say.
    const storage = (navigator as Partial<Pick<Navigator, 'storage'>>).storage;
    if (typeof storage?.persisted !== 'function') return;

    void storage.persisted().then((value) => {
      if (!cancelled) setPersisted(value);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return persisted;
}
