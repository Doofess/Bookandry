import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { AppMark } from '@/components/app-mark';
import { db } from '@/db/db';
import { UserMenu } from '@/features/account/user-menu';
import { AddMenu } from '@/features/feed/add-menu';
import { useTransactionSheet } from '@/features/transaction/use-transaction-sheet';

import { useAccount } from './account';
import { navDirection, PHONE_PLACES, RAIL_PLACES, RAIL_SETUP, ROUTES, type RailPlace } from './routes';
import { ShellEditors } from './shell-editors';
import { Toaster } from './toaster';
import { useDesktop, useMediaQuery } from './use-desktop';
import { useReturnToInvite } from './use-return-to-invite';
import { useThemeColor } from './use-theme-color';
import { useWipeNotice } from './use-wipe-notice';

/**
 * A place as a text pill, no icon (§4.2, decision 29): 44px on the phone's
 * tab bar, 48px in the rail. The current one is filled with ink and set in
 * weight 600, and says "(current)" to a screen reader.
 */
const PILL = cn(
  'flex min-h-11 items-center justify-center gap-2 rounded-full px-2 text-[0.84375rem]',
  'transition-[background-color,color] duration-(--dur-press) ease-fill hover-fine:bg-accent',
  'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring',
  'aria-[current=page]:bg-press aria-[current=page]:font-semibold aria-[current=page]:text-on-press',
  'lg:min-h-12 lg:justify-between lg:px-4.5 lg:text-[1.0625rem]',
);

/** How many cards and bank accounts there are, shown beside their places in weight 300. */
function useRailCounts(): Partial<Record<RailPlace['key'], number>> {
  return (
    useLiveQuery(async () => {
      const methods = await db.paymentMethods.filter((method) => method.isArchived === 0).toArray();
      return {
        cards: methods.filter((method) => method.type === 'credit_card').length,
        bankAccounts: methods.filter((method) => method.type === 'bank_account').length,
      };
    }, []) ?? {}
  );
}

const PHONE_ORDER = PHONE_PLACES.map((p) => p.to);
const RAIL_ORDER = [...RAIL_PLACES, ...RAIL_SETUP].map((p) => p.to);

function Place({
  place,
  label,
  order,
  count,
  reduced,
}: {
  readonly place: RailPlace;
  readonly label: string;
  readonly order: readonly string[];
  readonly count?: number;
  readonly reduced: boolean;
}) {
  const { pathname } = useLocation();
  return (
    <NavLink
      to={place.to}
      end={place.to === ROUTES.feed}
      // Same-document view transitions (§8.2), skipped when motion is reduced.
      viewTransition={!reduced}
      onClick={() => {
        document.documentElement.setAttribute('data-nav-dir', navDirection(pathname, place.to, order));
      }}
      data-slot="nav-place"
      className={PILL}
    >
      {({ isActive }) => (
        <>
          <span className="min-w-0 text-center lg:text-start">{label}</span>
          {count === undefined ? null : (
            <span aria-hidden="true" className="hidden shrink-0 text-sm font-light lg:inline">
              {count}
            </span>
          )}
          {isActive ? <span className="sr-only">(current)</span> : null}
        </>
      )}
    </NavLink>
  );
}

/** Add, at the top of the rail on every desktop screen (§4.2). */
function RailAdd() {
  const sheet = useTransactionSheet();
  const account = useAccount();
  const people = useLiveQuery(() => db.profiles.count(), []);
  return (
    <div className="mb-5 hidden lg:block">
      <AddMenu
        placement="rail"
        // A transaction belongs to a profile: with none, the form has nothing to submit.
        disabled={(people ?? 0) === 0}
        aiAvailable={account.status !== 'unavailable'}
        onAdd={(kind) => {
          sheet.openAdd(kind);
        }}
        onAddWithAi={() => {
          sheet.openImport();
        }}
      />
    </div>
  );
}

/**
 * ONE nav element with responsive classes, not two copies behind `lg:hidden`
 * / `hidden lg:flex`: two copies double the aria-current bookkeeping, and
 * screen readers see both.
 *
 * Phone: four text pills across the bottom, on the paper. From lg: the rail
 * at the inline start, 256px, with a 2px line at its inline end - the mark,
 * Add, the places, a line, the set-up places, and the account menu at the foot.
 */
function PrimaryNav() {
  const { t } = useTranslation();
  const desktop = useDesktop();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const counts = useRailCounts();
  return (
    <nav
      aria-label={t('nav.primary')}
      // Anchored pop-outs keep clear of it on a phone (`useCollisionPadding`).
      data-slot="tab-bar"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-0.5 border-t-2 border-border bg-background',
        'pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]',
        'ps-[max(0.625rem,env(safe-area-inset-left,0px))] pe-[max(0.625rem,env(safe-area-inset-right,0px))]',
        'lg:inset-y-0 lg:start-0 lg:end-auto lg:flex lg:w-64 lg:flex-col lg:gap-1 lg:overflow-y-auto lg:overscroll-contain',
        'lg:border-e-2 lg:border-t-0 lg:bg-transparent lg:px-4.5 lg:pt-7 lg:pb-5.5',
      )}
    >
      {/* The mark goes home. A Link, not a NavLink: the Feed place already says where you are. */}
      <Link
        to={ROUTES.feed}
        viewTransition={!reduced}
        className="mb-5.5 hidden min-h-12 items-center rounded-full px-2.5 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring lg:flex"
      >
        <AppMark />
      </Link>

      {desktop ? <RailAdd /> : null}

      {/* The phone's four tabs, in their order. Hidden from lg, so a screen reader meets one list at a time. */}
      <div className="contents lg:hidden">
        {PHONE_PLACES.map((place) => (
          <Place
            key={place.key}
            place={place}
            label={t(`nav.${place.key}` as const)}
            order={PHONE_ORDER}
            reduced={reduced}
          />
        ))}
      </div>
      {/* The rail's places, in the concept's order. */}
      <div className="hidden lg:contents">
        {RAIL_PLACES.map((place) => (
          <Place
            key={place.key}
            place={place}
            label={t(`nav.${place.railLabel ?? place.key}` as const)}
            order={RAIL_ORDER}
            reduced={reduced}
            count={place.key === 'cards' || place.key === 'bankAccounts' ? counts[place.key] : undefined}
          />
        ))}
      </div>
      <div aria-hidden="true" className="my-3 hidden h-0.5 shrink-0 bg-border lg:block" />
      <div className="hidden lg:contents">
        {RAIL_SETUP.map((place) => (
          <Place
            key={place.key}
            place={place}
            label={t(`nav.${place.key}` as const)}
            order={RAIL_ORDER}
            reduced={reduced}
          />
        ))}
      </div>

      <div className="mt-auto hidden pt-3 lg:block">
        <UserMenu placement="rail" />
      </div>
    </nav>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  useReturnToInvite();
  useWipeNotice();
  useThemeColor();

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
        main is a size container (§4.3): screens lay out by the room they
        really have, with @board/main:, @wide/main: and @vast/main: variants,
        never viewport ones. No pad on the far side: content fills main up to
        1680px, centred, with 24px round it.
      */}
      <main
        id="main"
        tabIndex={-1}
        className="@container/main pb-[calc(var(--tab-bar-h)+env(safe-area-inset-bottom,0px))] lg:ps-64 lg:pb-0"
      >
        <div data-slot="content-box" className="mx-auto max-w-[105rem] lg:p-6">
          <Outlet />
        </div>
      </main>

      {/* The add and import editors for screens that host none: the rail's Add works on every screen. */}
      <ShellEditors />

      {/* At shell level, so a toast raised on the feed survives navigating
          away - the undo is still valid wherever the user has gone. */}
      <Toaster />
    </div>
  );
}
