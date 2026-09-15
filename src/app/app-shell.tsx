import { cn } from 'cn';
import { BarChart3, Receipt, Settings, Users } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';

import { Logo } from '@/components/logo';

import { NAV_ORDER, ROUTES, type RouteKey } from './routes';

const ICONS: Record<RouteKey, ComponentType<{ className?: string }>> = {
  feed: Receipt,
  chart: BarChart3,
  profiles: Users,
  settings: Settings,
};

/**
 * ONE nav element with responsive classes, not two copies behind `lg:hidden` /
 * `hidden lg:flex`. Two copies double the aria-current bookkeeping and the React
 * tree for no gain, and screen readers see both.
 *
 * Tab labels are kept at every size: an icon-only bottom bar is a known
 * comprehension and a11y regression, and four items are not crowded.
 */
function PrimaryNav() {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t('nav.primary')}
      className={cn(
        // Mobile: fixed bottom bar, respecting the home-indicator inset.
        'fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 backdrop-blur',
        'pb-[env(safe-area-inset-bottom,0px)]',
        'ps-[max(0.5rem,env(safe-area-inset-left,0px))] pe-[max(0.5rem,env(safe-area-inset-right,0px))]',
        // Desktop: a vertical rail on the inline-start edge.
        'lg:inset-y-0 lg:start-0 lg:end-auto lg:w-56 lg:flex-col lg:items-stretch lg:gap-1',
        'lg:border-e lg:border-t-0 lg:p-3 lg:pt-6',
      )}
    >
      <div className="mb-6 hidden items-center gap-2 px-3 lg:flex">
        <Logo size={28} decorative />
        <span className="text-base font-semibold tracking-tight">{t('app.name')}</span>
      </div>

      {NAV_ORDER.map((key) => {
        const Icon = ICONS[key];
        return (
          <NavLink
            key={key}
            to={ROUTES[key]}
            end={key === 'feed'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium',
                'rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                'lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-2 lg:text-sm',
                isActive
                  ? 'text-primary lg:bg-muted lg:text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="size-5 lg:size-4" />
                <span>{t(`nav.${key}` as const)}</span>
                {isActive ? <span className="sr-only">(current)</span> : null}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function AppShell() {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only rounded-lg bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:ring-2"
      >
        {t('a11y.skipToContent')}
      </a>

      <header className="flex items-center gap-2 px-4 pt-[env(safe-area-inset-top,0px)] lg:hidden">
        <Logo size={24} decorative />
        <span className="py-3 text-sm font-semibold tracking-tight">{t('app.name')}</span>
      </header>

      <PrimaryNav />

      <main
        id="main"
        tabIndex={-1}
        className="pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:ps-56 lg:pb-0"
      >
        <Outlet />
      </main>
    </div>
  );
}
