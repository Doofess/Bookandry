import { useTranslation } from 'react-i18next';

export function ProfilesScreen() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('nav.profiles')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('app.tagline')}</p>
    </section>
  );
}
