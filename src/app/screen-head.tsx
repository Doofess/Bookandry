import { cn } from 'cn';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { AppMark } from '@/components/app-mark';
import { TitlePair } from '@/components/ui/title-pair';
import { UserMenu } from '@/features/account/user-menu';

import { ROUTES } from './routes';

/**
 * The top of every screen (§7.7, §4.3, §4.4), on the paper. The engraved
 * panel stays on the front door only (decision 39).
 *
 * Phone: the mark, which goes home, and the account menu (Settings is
 * reached from it on a phone: routes.ts), then the screen's name in
 * Karantina at 76px with the screen's one action beside it.
 * Desktop: the top bar - the title pair at 38/21 and the screen's controls;
 * the mark and the account menu are in the rail. The search pill and the
 * month picker join the top bar with the screens that own them (phase 3).
 *
 * useThemeColor() paints the status bar from whatever is at the top.
 */
export function ScreenHead({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  readonly title?: string;
  readonly subtitle?: string;
  /** The screen's one action (a pill), or its controls on the desktop top bar. */
  readonly actions?: ReactNode;
  /** Above the title: a settings page's way back. */
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <header
      data-slot="screen-head"
      className={cn(
        'px-4 pt-[max(0.5rem,env(safe-area-inset-top,0px))] pb-2 lg:px-3.5 lg:pt-1 lg:pb-3',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <Link
          to={ROUTES.feed}
          className="-mx-2 flex min-h-12 items-center rounded-full px-2 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring"
        >
          <AppMark />
        </Link>
        <UserMenu />
      </div>
      {children}
      {title === undefined ? null : (
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3 lg:mt-0 lg:items-center">
          <TitlePair as="h1" size="screen" title={title} subtitle={subtitle} className="min-w-0" />
          {actions === undefined ? null : <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
    </header>
  );
}

/**
 * The ink sheet at the top of the feed and of Cash (§5.1, §5.5). Until phase 3
 * lays those screens out, it carries what the engraved panel carried: the
 * month, people and prime pills, the balance and the forecast, the cash total.
 * Their `tone="panel"` styles are near-white, which reads on the ink in both
 * themes.
 */
export function HeroSheet({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      data-slot="hero-sheet"
      data-sheet="night"
      className={cn('mbs-sheet rounded-sheet px-5 pt-4 pb-6 lg:px-8 lg:pt-6 lg:pb-8', className)}
    >
      {children}
    </div>
  );
}

/** A screen's body: a rounded paper body one sheet gap below the head. Still one column until phase 3. */
export function ScreenSheet({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div data-slot="screen-sheet" className={cn('mbs-sheet rounded-sheet bg-card pb-6', className)}>
      {children}
    </div>
  );
}
