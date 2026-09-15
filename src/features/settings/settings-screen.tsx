import { useTranslation } from 'react-i18next';

import { RecentlyDeleted } from './recently-deleted';

export function SettingsScreen() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.settings')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('app.tagline')}</p>
      </header>

      {/* The rest of the Settings cards land in Phase 5. This one ships now
          because it is the only way back from a delete once the toast is gone,
          and a 24-hour window nothing can reach is not a recovery story. */}
      <RecentlyDeleted />
    </section>
  );
}
