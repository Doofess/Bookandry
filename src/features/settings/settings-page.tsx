import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/routes';
import { ScreenHead } from '@/app/screen-head';
import { useDesktop } from '@/app/use-desktop';
import { Sheet, SheetHead } from '@/components/ui/sheet-surface';

/**
 * One settings subject, on a paper sheet with its title pair. On a phone the
 * screen head carries the title and the way back to the list; from the
 * desktop the layout's head and its subjects stand in for both.
 */
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
  const desktop = useDesktop();
  return (
    <section className={desktop ? undefined : 'px-3 pb-24'}>
      {desktop ? null : (
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
      )}
      <Sheet kind="paper" as="div" className={desktop ? 'grid gap-4' : 'mbs-sheet grid gap-4'}>
        {desktop ? (
          <SheetHead title={title} {...(description === undefined ? {} : { subtitle: description })} />
        ) : description === undefined ? null : (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {children}
      </Sheet>
    </section>
  );
}
