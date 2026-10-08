import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/routes';
import { ScreenPanel, ScreenTitle } from '@/app/screen-panel';
import { PanelSheet } from '@/components/brand-panel';

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
    <section className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8">
      <ScreenPanel>
        <Link
          to={ROUTES.settings}
          className="-ms-1 mt-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm text-brand-deep-foreground/80 hover:text-brand-deep-foreground focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none sm:min-h-0 sm:py-0.5"
        >
          {/* Directional: it points back, so it flips. */}
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t('settings.title')}
        </Link>
        <ScreenTitle>{title}</ScreenTitle>
      </ScreenPanel>
      <PanelSheet className="space-y-4 px-4 pt-6">
        {description === undefined ? null : <p className="text-sm text-muted-foreground">{description}</p>}
        {children}
      </PanelSheet>
    </section>
  );
}
