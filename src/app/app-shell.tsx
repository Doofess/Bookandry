import { cn } from 'cn';
import { BarChart3, CreditCard, Receipt, Settings, Users } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';

import { Engraving } from '@/components/engraving';
import { Logo } from '@/components/logo';

import { NAV_ORDER, ROUTES, type RouteKey } from './routes';
import { Toaster } from './toaster';
import { useReturnToInvite } from './use-return-to-invite';
import { useWipeNotice } from './use-wipe-notice';

const ICONS: Record<RouteKey, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  feed: Receipt,
  chart: BarChart3,
  cards: CreditCard,
  household: Users,
  settings: Settings,
};

/**
 * ONE nav element with responsive classes, not two copies behind `lg:hidden` /
 * `hidden lg:flex`. Two copies double the aria-current bookkeeping and the React
 * tree for no gain, and screen readers see both.
 *
 * Tab labels are kept at every size: an icon-only bottom bar is a known
 * comprehension and a11y regression, and three items are not crowded.
 */
function PrimaryNav() {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t('nav.primary')}
      className={cn(
        // Mobile: fixed bottom bar, white, respecting the home-indicator inset.
        'fixed inset-x-0 bottom-0 isolate z-40 flex border-t bg-background/95 backdrop-blur',
        'pb-[env(safe-area-inset-bottom,0px)]',
        'ps-[max(0.5rem,env(safe-area-inset-left,0px))] pe-[max(0.5rem,env(safe-area-inset-right,0px))]',
        // Desktop: the rail is the brand panel, the engraving's bands along its foot.
        'lg:inset-y-0 lg:start-0 lg:end-auto lg:w-56 lg:flex-col lg:items-stretch lg:gap-1 lg:overflow-hidden',
        'lg:border-t-0 lg:bg-brand-deep lg:p-3 lg:pt-6 lg:text-brand-deep-foreground lg:backdrop-blur-none',
      )}
    >
      <Engraving
        variant="bands"
        className="absolute inset-0 -z-10 hidden size-full text-brand-vivid/45 lg:block rtl:-scale-x-100"
      />
      {/*
        The mark goes home, which is what every user already expects of it.

        It sits INSIDE the nav rail, so it is a second route to the feed
        alongside the Feed tab - deliberate, and the reason it is not given its
        own "(current)" treatment: the tab below already says where you are, and
        two controls announcing the same current page is noise, not redundancy.
      */}
      <NavLink
        to={ROUTES.feed}
        end
        className="mb-6 hidden items-center gap-2 rounded-lg px-3 py-2 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none lg:flex"
      >
        <Logo size={28} tone="inverse" decorative />
        <span className="font-display text-lg font-bold tracking-tight">{t('app.name')}</span>
      </NavLink>

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
                'lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:rounded-full lg:px-3 lg:py-2 lg:text-sm lg:focus-visible:ring-white/60',
                isActive
                  ? 'text-primary lg:bg-white/15 lg:text-brand-deep-foreground'
                  : 'text-muted-foreground hover:text-foreground lg:text-brand-deep-foreground/75 lg:hover:bg-white/10 lg:hover:text-brand-deep-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Phone: the active tab's icon sits on a soft sapphire pill. */}
                <span
                  data-slot="tab-pill"
                  className={cn(
                    'flex h-8 w-14 items-center justify-center rounded-full lg:h-auto lg:w-auto',
                    isActive ? 'bg-accent lg:bg-transparent' : null,
                  )}
                >
                  <Icon className="size-5 lg:size-4" strokeWidth={1.75} />
                </span>
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
  useReturnToInvite();
  useWipeNotice();

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only rounded-lg bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:ring-2"
      >
        {t('a11y.skipToContent')}
      </a>

      <PrimaryNav />

      {/*
        The rail's width is mirrored on the other side once the window is wide
        enough to spare it, so a page is centred in the window - not in what
        the rail leaves, which reads as pushed to one side in full screen.
      */}
      <main
        id="main"
        tabIndex={-1}
        className="pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:ps-56 lg:pb-0 xl:pe-56"
      >
        <Outlet />
      </main>

      {/* At shell level, so a toast raised on the feed survives navigating
          away - the undo is still valid wherever the user has gone. */}
      <Toaster />
    </div>
  );
}
