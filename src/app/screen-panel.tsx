import { cn } from 'cn';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';

import { BrandPanel } from '@/components/brand-panel';
import { Logo } from '@/components/logo';
import { UserMenu } from '@/features/account/user-menu';

import { ROUTES } from './routes';

/**
 * The top of every screen: the front door's engraved panel, carried in.
 *
 * Its first row is what the phone header used to hold: the mark, which goes
 * home, at the start, and the account menu at the end, top right in English
 * and top left in Hebrew. On a desktop the rail carries the mark, so only the
 * menu stays. It reaches under the status bar, whose colour is the panel's
 * (index.html's theme-color), so the two run together.
 */
export function ScreenPanel({
  children,
  className,
}: {
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  const { t } = useTranslation();
  return (
    <BrandPanel
      className={cn(
        // A square foot on desktop too: the sheet's rounded top rises into it,
        // as on a phone, rather than leaving two curves crossing.
        'px-4 pt-[max(0.5rem,env(safe-area-inset-top,0px))] pb-10 lg:mt-4 lg:rounded-3xl lg:rounded-b-none lg:px-8 lg:pt-5 lg:pb-12',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 lg:justify-end">
        <NavLink
          to={ROUTES.feed}
          end
          className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none lg:hidden"
        >
          <Logo size={24} tone="inverse" decorative />
          <span className="text-base font-semibold tracking-tight">{t('app.name')}</span>
        </NavLink>
        <UserMenu />
      </div>
      {children}
    </BrandPanel>
  );
}

/** The page's own h1, set in the brand's face on the panel. */
export function ScreenTitle({ children }: { readonly children: ReactNode }) {
  return <h1 className="mt-3 font-display text-[2rem] leading-tight">{children}</h1>;
}
