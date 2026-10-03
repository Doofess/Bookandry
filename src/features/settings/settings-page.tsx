import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/routes';

/** One settings subject, with the way back to the list of them. */
export function SettingsPage({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6 pb-24 lg:pb-8">
      <Link
        to={ROUTES.settings}
        className="-ms-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {/* Directional: it points back, so it flips. */}
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t('settings.title')}
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description === undefined ? null : <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
