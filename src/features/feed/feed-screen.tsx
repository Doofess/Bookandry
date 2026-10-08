import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useAccount } from '@/app/account';
import { useSettings, useToday } from '@/app/app-context';
import { ROUTES } from '@/app/routes';
import { ScreenPanel } from '@/app/screen-panel';
import { pendingShares, sweepShared } from '@/app/shared-files';
import { PanelSheet } from '@/components/brand-panel';
import { db } from '@/db/db';
import { forgetImportReads } from '@/db/import-cache';
import { expectedMonthlyExpense, groupMonthlyExpenses } from '@/domain/calculators';
import { isCardFee } from '@/domain/cards';
import { emptyReason } from '@/domain/feed';
import { hasActiveFilters } from '@/domain/feed-filters';
import { categoryDisplayName } from '@/i18n/category-name';
import { methodDisplayName } from '@/i18n/method-name';
import { systemClock } from '@/lib/clock';
import { startOfMonth } from '@/lib/dates';
import { ALL_PROFILES, type Occurrence } from '@/types/domain';

import { AddMenu } from './add-menu';
import { EmptyState } from './empty-state';
import type { RowContext } from './feed-rows';
import { FilterBar } from './filter-bar';
import { ProfileSwitcher } from './profile-switcher';
import { RowActionsSheet } from './row-actions-sheet';
import { monthWindow, useCandidates, useFeedLookups, useFeedRows, useOccurrences } from './use-feed-data';
import { useFeedFilters } from './use-feed-filters';
import { useRowActions } from './use-row-actions';
import { VirtualFeed } from './virtual-feed';
import { BalanceBreakdownSheet, ExpenseBreakdownSheet } from '../summary/breakdown-sheet';
import { CollapsedSummaryBar } from '../summary/collapsed-bar';
import { MonthCursor } from '../summary/month-cursor';
import { PrimePill } from '../summary/prime-pill';
import { BalanceFigure, ForecastLine } from '../summary/summary-cards';
import { useBalance } from '../summary/use-balance';
import { COLLAPSED_HEIGHT, useCollapsingHeader } from '../summary/use-collapsing-header';
import { SplitPurchaseSheet } from '../transaction/split-purchase';
import { TransactionSheet } from '../transaction/transaction-sheet';
import { useSplitOffer, type SplitOffer } from '../transaction/use-split-offer';
import { useTransactionSheet } from '../transaction/use-transaction-sheet';

/** "Smart import": its own chunk, fetched the first time it is opened. */
const ImportSheet = lazy(() => import('../import/import-sheet').then((m) => ({ default: m.ImportSheet })));

type Breakdown = 'balance' | 'expense' | undefined;

export function FeedScreen() {
  const { t } = useTranslation(['common', 'categories', 'profiles']);
  const today = useToday();
  const settings = useSettings();
  const { filters, stepMonth, setMonth, set, setProfile, clear } = useFeedFilters();
  const sheet = useTransactionSheet();
  const account = useAccount();
  const navigate = useNavigate();
  const [breakdown, setBreakdown] = useState<Breakdown>(undefined);
  /*
   * The row whose menu is open, held here rather than in the URL.
   *
   * Unlike the edit sheet, this is not somewhere you navigated to: it is a
   * transient menu, and pushing a history entry for it would make the back
   * button walk through every menu the user opened and dismissed.
   */
  const [menuFor, setMenuFor] = useState<Occurrence | undefined>(undefined);
  const runAction = useRowActions();
  /** The purchase being split into payments, kept once its menu has closed. */
  const [splitting, setSplitting] = useState<SplitOffer | undefined>(undefined);
  const { collapsed: headerCollapsed, measure: measureHeader } = useCollapsingHeader();

  const window = useMemo(() => monthWindow(filters.month), [filters.month]);

  // Layers A and B: neither depends on the filters, so typing in the search box
  // touches neither IndexedDB nor the expansion.
  const candidates = useCandidates(filters.profileId, window);
  const occurrences = useOccurrences(candidates, window, today, filters.profileId, settings.defaultCurrency);
  const lookups = useFeedLookups();
  const splitMenu = useSplitOffer(menuFor, lookups?.paymentMethods);

  /*
   * Files shared from the phone wait in the service worker's cache: open the
   * import sheet on the newest share once there is a profile to file it under
   * - also after signing in, which lands elsewhere first. Stale shares and
   * old reads are swept on the way.
   */
  const shareChecked = useRef(false);
  const hasProfiles = (lookups?.profiles.length ?? 0) > 0;
  const openImport = sheet.openImport;
  const sheetMode = sheet.target.mode;
  useEffect(() => {
    if (!hasProfiles || shareChecked.current) return;
    shareChecked.current = true;
    void (async () => {
      const now = systemClock.nowMs();
      await Promise.all([sweepShared(now), forgetImportReads(db)]).catch(() => undefined);
      const [latest] = await pendingShares().catch(() => []);
      if (latest !== undefined && sheetMode === 'closed') openImport(latest);
    })();
  }, [hasProfiles, openImport, sheetMode]);

  const translateCategory = useMemo(
    () => (category: Parameters<typeof categoryDisplayName>[0]) => categoryDisplayName(category, t),
    [t],
  );

  const translateMethod = useMemo(
    () => (method: Parameters<typeof methodDisplayName>[0]) => methodDisplayName(method, t),
    [t],
  );

  const { rows, windowCount, isLoading } = useFeedRows(
    occurrences,
    filters,
    lookups,
    today,
    translateCategory,
    translateMethod,
  );

  const balance = useBalance(filters.profileId, today, settings.defaultCurrency);

  // The summary cards use the UNFILTERED window: "expected this month" must not
  // change because the user searched for "pizza".
  const expense = useMemo(
    () => (occurrences === undefined ? undefined : expectedMonthlyExpense(occurrences, today, filters.month)),
    [occurrences, today, filters.month],
  );

  const expenseGroups = useMemo(
    () =>
      occurrences === undefined
        ? []
        : groupMonthlyExpenses(occurrences.filter((o) => o.date >= window.from && o.date <= window.to)),
    [occurrences, window.from, window.to],
  );

  const context = useMemo<RowContext | undefined>(
    () =>
      lookups === undefined
        ? undefined
        : {
            currency: settings.defaultCurrency,
            today,
            categories: lookups.categories,
            profiles: new Map(lookups.profiles.map((p) => [p.id, p])),
            methods: lookups.paymentMethods,
            // One profile makes the avatar column pure noise.
            showProfile: filters.profileId === ALL_PROFILES && lookups.profiles.length > 1,
          },
    [lookups, settings.defaultCurrency, today, filters.profileId],
  );

  const hasAnyTransactions = (candidates?.transactions.length ?? 0) > 0 || windowCount > 0;
  const reason = isLoading ? undefined : emptyReason(windowCount, rows.length, hasAnyTransactions);

  return (
    // The FAB floats above the tab bar, so the list needs clearance for BOTH or
    // the last row of every month sits under a button. The shell already pads
    // for the tab bar; this is the FAB's share.
    <section
      className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8"
      /*
       * The day headers pin against this. A fixed bar cannot set it for them.
       *
       * It carries the safe-area inset for the same reason the bar's height
       * does: on an installed app with a notch the bar is 48px PLUS the inset,
       * and a sticky header told to stop 48px down slides underneath it.
       */
      style={{
        ['--feed-sticky-top' as string]: headerCollapsed
          ? `calc(${String(COLLAPSED_HEIGHT)}px + env(safe-area-inset-top, 0px))`
          : '0px',
      }}
    >
      <h1 className="sr-only">{t('nav.feed')}</h1>

      {/*
        FIRST in the DOM, and deliberately so.

        The FAB is `position: fixed`, so where it sits in the markup does not
        move it on screen - but it does decide where it sits in the TAB ORDER,
        and rendered last it came after every transaction row. With sixty rows,
        each carrying its own actions menu, reaching the app's primary action by
        keyboard took over a hundred presses. The keyboard walkthrough is what
        found it; nothing about the screen looks wrong.

        Disabled until there is a profile to own the row: a transaction belongs
        to exactly one profile, so with none the form has nothing to submit, and
        a button that opens a sheet you cannot complete is worse than one that
        is visibly unavailable.
      */}
      <AddMenu
        disabled={(lookups?.profiles.length ?? 0) === 0}
        aiAvailable={account.status !== 'unavailable'}
        onAddManually={sheet.openAdd}
        onAddWithAi={() => {
          sheet.openImport();
        }}
      />

      {headerCollapsed ? (
        <CollapsedSummaryBar
          state={balance}
          currency={settings.defaultCurrency}
          onOpenBreakdown={() => {
            setBreakdown('balance');
          }}
        />
      ) : null}

      <div ref={measureHeader} data-testid="feed-header">
        <ScreenPanel>
          {/*
            At most two lines on a phone: below sm the profile pill is faces
            only and prime drops its icon. 375: month + profile, then prime.
            320: month, then profile + prime. One row from sm up.
          */}
          <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="panel-pills">
            <MonthCursor month={filters.month} today={today} onStep={stepMonth} tone="panel" />
            {lookups === undefined ? null : (
              <ProfileSwitcher
                profiles={lookups.profiles}
                active={filters.profileId}
                onSelect={setProfile}
                tone="panel"
              />
            )}
            <PrimePill />
          </div>
          <div className="mt-5">
            <BalanceFigure
              state={balance}
              currency={settings.defaultCurrency}
              onOpenBreakdown={() => {
                setBreakdown('balance');
              }}
            />
          </div>
          <div className="mt-2">
            <ForecastLine
              expense={expense}
              currency={settings.defaultCurrency}
              month={filters.month}
              today={today}
              onOpenBreakdown={() => {
                setBreakdown('expense');
              }}
            />
          </div>
        </ScreenPanel>
      </div>

      <PanelSheet className="px-4 pt-4">
        <FilterBar filters={filters} onChange={set} onClear={clear} />

        <div className="mt-3">
          {reason !== undefined ? (
            <EmptyState
              reason={reason}
              month={filters.month}
              onClearFilters={hasActiveFilters(filters) ? clear : undefined}
            />
          ) : context === undefined ? null : (
            <VirtualFeed
              rows={rows}
              context={context}
              // Both the row body and its always-present menu open the editor.
              // The menu will grow skip/delete next; until it does, pointing it
              // at the same place is honest, where a dead button is not.
              // A card's fee is worked out from the card, not a row anyone saved:
              // it is changed where the card is, so it opens the Cards screen.
              onOpen={(occurrence) => {
                if (isCardFee(occurrence)) void navigate(ROUTES.cards);
                else sheet.openEdit(occurrence);
              }}
              onMenu={(occurrence) => {
                if (isCardFee(occurrence)) void navigate(ROUTES.cards);
                else setMenuFor(occurrence);
              }}
            />
          )}
        </div>
      </PanelSheet>

      {lookups === undefined ? null : (
        <TransactionSheet
          target={sheet.target}
          onOpenChange={sheet.setOpen}
          profiles={lookups.profiles}
          categories={[...lookups.categories.values()]}
          paymentMethods={[...lookups.paymentMethods.values()]}
          activeProfileId={filters.profileId}
          baseCurrency={settings.defaultCurrency}
          today={today}
          onSaved={(date) => {
            sheet.close();
            // Jump to the month the row landed in, so a bill dated next month
            // does not save into apparent nothingness - and so an edit that
            // MOVED an occurrence follows it. liveQuery brings the data; this
            // is only about which window is on screen.
            setMonth(startOfMonth(date));
          }}
        />
      )}

      {lookups === undefined || sheet.target.mode !== 'import' ? null : (
        <Suspense fallback={null}>
          <ImportSheet
            target={sheet.target}
            onOpenChange={sheet.setOpen}
            onOpenRow={sheet.openImportRow}
            onOpenCard={sheet.openImportCard}
            profiles={lookups.profiles}
            categories={[...lookups.categories.values()]}
            paymentMethods={[...lookups.paymentMethods.values()]}
            activeProfileId={filters.profileId}
            baseCurrency={settings.defaultCurrency}
            today={today}
            onSaved={(date) => {
              sheet.close();
              setMonth(startOfMonth(date));
            }}
          />
        </Suspense>
      )}

      <RowActionsSheet
        occurrence={menuFor}
        split={splitMenu?.kind}
        onOpenChange={(open) => {
          if (!open) setMenuFor(undefined);
        }}
        onAction={(action, occurrence) => {
          // Closed first, unconditionally: leaving it open over a toast covers
          // the Undo the toast just offered.
          setMenuFor(undefined);
          if (action === 'edit') {
            sheet.openEdit(occurrence);
            return;
          }
          if (action === 'split') {
            if (splitMenu?.kind === 'offer') setSplitting(splitMenu.offer);
            return;
          }
          void runAction(action, occurrence);
        }}
      />

      <SplitPurchaseSheet
        offer={splitting}
        today={today}
        onOpenChange={(open) => {
          if (!open) setSplitting(undefined);
        }}
        onDone={(date) => {
          setSplitting(undefined);
          setMonth(startOfMonth(date));
        }}
      />

      {balance.status === 'ready' ? (
        <BalanceBreakdownSheet
          open={breakdown === 'balance'}
          onOpenChange={(open) => {
            setBreakdown(open ? 'balance' : undefined);
          }}
          parts={balance.parts}
          since={balance.since}
          currency={settings.defaultCurrency}
        />
      ) : null}

      {context !== undefined ? (
        <ExpenseBreakdownSheet
          open={breakdown === 'expense'}
          onOpenChange={(open) => {
            setBreakdown(open ? 'expense' : undefined);
          }}
          groups={expenseGroups}
          month={filters.month}
          currency={settings.defaultCurrency}
          categories={context.categories}
        />
      ) : null}
    </section>
  );
}
