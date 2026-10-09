import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/routes';
import { ScreenHead, ScreenSheet } from '@/app/screen-head';

/** One settings subject; the way back to the list of them sits above the title in the screen head. */
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
    <section className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8">
      <ScreenHead title={title}>
        <Link
          to={ROUTES.settings}
          className="-ms-1 mt-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm text-muted-foreground focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring hover-fine:text-foreground"
        >
          {/* Directional: it points back, so it flips. */}
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t('settings.title')}
        </Link>
      </ScreenHead>
      <ScreenSheet className="space-y-4 px-4 pt-6">
        {description === undefined ? null : <p className="text-sm text-muted-foreground">{description}</p>}
        {children}
      </ScreenSheet>
    </section>
  );
}
