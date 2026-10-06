import { cn } from 'cn';
import { BarChart3, CreditCard, Receipt, Settings, Users } from 'lucide-react';
import type { ComponentType } from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Logo } from '@/components/logo';
import { UserMenu } from '@/features/account/user-menu';
import { pendingInvite } from '@/features/household/pending-invite';

import { useAccount } from './account';
import { LINKED_ROUTES, NAV_ORDER, ROUTES, type RouteKey } from './routes';
import { Toaster } from './toaster';

const ICONS: Record<RouteKey, ComponentType<{ className?: string }>> = {
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
        // Mobile: fixed bottom bar, respecting the home-indicator inset.
        'fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 backdrop-blur',
        'pb-[env(safe-area-inset-bottom,0px)]',
        'ps-[max(0.5rem,env(safe-area-inset-left,0px))] pe-[max(0.5rem,env(safe-area-inset-right,0px))]',
        // Desktop: a vertical rail on the inline-start edge.
        'lg:inset-y-0 lg:start-0 lg:end-auto lg:w-56 lg:flex-col lg:items-stretch lg:gap-1',
        'lg:border-e lg:border-t-0 lg:p-3 lg:pt-6',
      )}
    >
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
        className="mb-6 hidden items-center gap-2 rounded-lg px-3 py-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:flex"
      >
        <Logo size={28} decorative />
        <span className="text-base font-semibold tracking-tight">{t('app.name')}</span>
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

/**
 * Back from signing in (or from the first-run steps) with an invitation still
 * waiting: straight back to it.
 */
function useReturnToInvite(): void {
  const signedIn = useAccount().status === 'signed_in';
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (signedIn && pathname !== LINKED_ROUTES.link && pendingInvite() !== undefined) {
      void navigate(LINKED_ROUTES.link, { replace: true });
    }
  }, [signedIn, pathname, navigate]);
}

export function AppShell() {
  const { t } = useTranslation();
  useReturnToInvite();

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only rounded-lg bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:ring-2"
      >
        {t('a11y.skipToContent')}
      </a>

      {/*
        The top bar: the mark (on a phone; the rail carries it on a desktop) at
        the start, the account menu at the end - top right in English, top left
        in Hebrew, where every app people use keeps it.
      */}
      <header className="flex items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top,0px)] lg:ms-56 lg:h-16 lg:justify-end lg:px-6">
        {/*
          Tappable, and sized to be tappable: the padding is on the LINK rather
          than on the header, so the target is the full height of the bar
          instead of a 24px mark somebody has to aim at.
        */}
        <NavLink
          to={ROUTES.feed}
          end
          className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
        >
          <Logo size={24} decorative />
          <span className="text-sm font-semibold tracking-tight">{t('app.name')}</span>
        </NavLink>
        <UserMenu />
      </header>

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
