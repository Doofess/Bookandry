import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useAccount } from '@/app/account';
import { useSettings, useToday } from '@/app/app-context';
import { ROUTES } from '@/app/routes';
import { ScreenHead } from '@/app/screen-head';
import { pendingShares, sweepShared } from '@/app/shared-files';
import { greetingKey, SearchPill, useGreetingName } from '@/app/top-bar';
import { useDesktop } from '@/app/use-desktop';
import { Mark } from '@/components/ui/mark';
import { db } from '@/db/db';
import { forgetImportReads } from '@/db/import-cache';
import { changeCategory, moveOccurrence } from '@/db/occurrence-actions';
import { bankByCode, bankName } from '@/domain/banks';
import { expectedMonthlyExpense, groupMonthlyExpenses } from '@/domain/calculators';
import { isCardFee } from '@/domain/cards';
import { emptyReason } from '@/domain/feed';
import { hasActiveFilters } from '@/domain/feed-filters';
import { mccName } from '@/domain/mcc';
import { methodKey } from '@/domain/money-key';
import { settledThisMonth } from '@/domain/month-bills';
import { methodOwnedBy } from '@/domain/tx-options';
import { categoryDisplayName } from '@/i18n/category-name';
import { methodDisplayName } from '@/i18n/method-name';
import { figureParts } from '@/i18n/money-format';
import { systemClock } from '@/lib/clock';
import { compareLocal, formatLocalDate, startOfMonth } from '@/lib/dates';
import { newId } from '@/lib/id';
import { wholeMinor } from '@/lib/money';
import { ALL_PROFILES } from '@/types/domain';

import { AddMenu } from './add-menu';
import { useIncoming } from '../bank-accounts/use-incoming';
import { useMonthBills } from '../cards/use-month-bills';
import { useCashData } from '../cash/use-cash-data';
import { AccountSheets, type AccountItem } from './board/account-sheets';
import { BalanceSheet } from './board/balance-sheet';
import { CategoriesSheet } from './board/categories-sheet';
import { FeedBoard } from './board/feed-board';
import { MonthSheet } from './board/month-sheet';
import { TransactionsSheet } from './board/transactions-sheet';
import { WalletColumn } from './board/wallet-column';
import { CategoryPopout, type CategoryTarget } from './category-popout';
import { EmptyState } from './empty-state';
import type { RowContext } from './feed-rows';
import { FilterBar } from './filter-bar';
import { ProfileSwitcher } from './profile-switcher';
import { ProjectedPopout, type ProjectedTarget } from './projected-popout';
import { RowActionsMenu, type RowMenuTarget } from './row-actions-menu';
import { monthWindow, useCandidates, useFeedLookups, useFeedRows, useOccurrences } from './use-feed-data';
import { useFeedFilters } from './use-feed-filters';
import { offerUndo, useRowActions, useUndoableWrite } from './use-row-actions';
import { RecentFeed, VirtualFeed } from './virtual-feed';
import { useMccList } from '../business-type/use-mcc-list';
import { BalanceBreakdownSheet, ExpenseBreakdownSheet } from '../summary/breakdown-sheet';
import { CollapsedSummaryBar } from '../summary/collapsed-bar';
import { MonthCursor } from '../summary/month-cursor';
import { PrimePill } from '../summary/prime-pill';
import { BalanceNumeral, ForecastLine } from '../summary/summary-cards';
import { useBalance } from '../summary/use-balance';
import { useBreakdowns } from '../summary/use-breakdowns';
import { COLLAPSED_HEIGHT, useCollapsingHeader } from '../summary/use-collapsing-header';
import { SplitPurchaseSheet } from '../transaction/split-purchase';
import { TransactionSheet } from '../transaction/transaction-sheet';
import { useIncomeHistory } from '../transaction/use-income-history';
import { useSplitOffer, type SplitOffer } from '../transaction/use-split-offer';
import { useTransactionSheet } from '../transaction/use-transaction-sheet';

/** "Smart import": its own chunk, fetched the first time it is opened. */
const ImportSheet = lazy(() => import('../import/import-sheet').then((m) => ({ default: m.ImportSheet })));

type Breakdown = 'balance' | 'expense' | undefined;

export function FeedScreen() {
  const { t, i18n } = useTranslation(['common', 'categories', 'profiles']);
  const today = useToday();
  const settings = useSettings();
  const { filters, stepMonth, setMonth, set, setProfile, clear } = useFeedFilters();
  const desktop = useDesktop();
  const greetingName = useGreetingName();
  const sheet = useTransactionSheet();
  const account = useAccount();
  const navigate = useNavigate();
  const [breakdown, setBreakdown] = useState<Breakdown>(undefined);
  /*
   * The row whose menu is open, held here rather than in the URL.
   *
   * Unlike the edit sheet, this is not somewhere you navigated to: it is a
   * transient menu, and pushing a history entry for it would make the back
   * button walk through every menu the user opened and dismissed. It carries
   * the row's ⋯ button, which the menu is anchored to.
   */
  const [menuFor, setMenuFor] = useState<RowMenuTarget | undefined>(undefined);
  const runAction = useRowActions();
  /** The row whose category pop-out is open, with its chip: transient, like the menu. */
  const [categoryFor, setCategoryFor] = useState<CategoryTarget | undefined>(undefined);
  const undoable = useUndoableWrite();
  /** The row whose "not counted yet" pop-out is open, with its chip: transient, like the menu. */
  const [projectedFor, setProjectedFor] = useState<ProjectedTarget | undefined>(undefined);
  /** The purchase being split into payments, kept once its menu has closed. */
  const [splitting, setSplitting] = useState<SplitOffer | undefined>(undefined);
  const { collapsed: headerCollapsed, measure: measureHeader } = useCollapsingHeader();

  /** The board shows the newest rows; the round arrow on the sheet opens the whole month (list mode). */
  const [showAll, setShowAll] = useState(false);

  const window = useMemo(() => monthWindow(filters.month), [filters.month]);

  // Layers A and B: neither depends on the filters, so typing in the search box
  // touches neither IndexedDB nor the expansion.
  const candidates = useCandidates(filters.profileId, window);
  const occurrences = useOccurrences(candidates, window, today, filters.profileId, settings.defaultCurrency);
  const lookups = useFeedLookups();
  const splitMenu = useSplitOffer(menuFor?.occurrence, lookups?.paymentMethods);

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

  // Business type names for the search box: their own chunk, loaded once the feed is up.
  const mccList = useMccList();
  const businessTypeName = useMemo(
    () => (code: string) => (mccList === undefined ? undefined : mccName(mccList, code, i18n.language)),
    [mccList, i18n.language],
  );

  const { rows, windowCount, isLoading } = useFeedRows(
    occurrences,
    filters,
    lookups,
    today,
    translateCategory,
    translateMethod,
    businessTypeName,
  );

  const balance = useBalance(filters.profileId, today, settings.defaultCurrency);
  const bills = useMonthBills(today, settings.defaultCurrency, filters.profileId);
  const incoming = useIncoming(today);
  const cashData = useCashData(filters.profileId, today);
  const incomeHistory = useIncomeHistory(today);

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
  const breakdowns = useBreakdowns(balance, expenseGroups);

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

  const methods = lookups?.paymentMethods;
  const accounts = useMemo<AccountItem[]>(() => {
    if (methods === undefined) return [];
    const items = [...methods.values()]
      .filter((m) => m.type === 'bank_account' && m.isArchived === 0)
      .filter((m) => filters.profileId === ALL_PROFILES || methodOwnedBy(m, filters.profileId))
      .map((m) => {
        const bank = bankByCode(m.account?.bank ?? '');
        const next = incoming?.next.get(m.id);
        return {
          id: m.id,
          moneyKey: methodKey(m),
          name: bank === undefined ? m.label : bankName(bank, i18n.language),
          label:
            next === undefined
              ? m.label
              : `${m.label} · ${t('board.accountNext', { date: formatLocalDate(next.date, i18n.language, { day: 'numeric', month: 'short' }) })}`,
          figure: next?.money.baseAmountMinor,
        };
      })
      .sort((a, b) => (b.figure ?? -1) - (a.figure ?? -1));
    const cash = cashData?.summary;
    if (cash !== undefined && cash.people.length > 0) {
      items.push({
        id: 'cash',
        moneyKey: 'cash',
        name: t('board.cashName'),
        label: t('board.cashLabel', {
          date:
            cash.countedOn === undefined
              ? ''
              : formatLocalDate(cash.countedOn, i18n.language, { day: 'numeric', month: 'short' }),
        }),
        figure: cash.onHandMinor,
      });
    }
    return items;
  }, [methods, incoming, cashData, filters.profileId, i18n.language, t]);
  const banks = new Set(accounts.filter((a) => a.id !== 'cash').map((a) => a.moneyKey)).size;
  const net =
    occurrences === undefined || bills === undefined || methods === undefined
      ? undefined
      : settledThisMonth(occurrences, methods, today, bills);
  const nextIncome = useMemo(() => {
    const soonest = [...(incoming?.next.values() ?? [])].sort((a, b) => compareLocal(a.date, b.date))[0];
    if (soonest === undefined) return undefined;
    const category = incoming?.categories.get(soonest.categoryId);
    // Its own words first (a salary's note), then its category's name; never an id.
    const name =
      soonest.transaction.note ?? (category === undefined ? t('board.in') : categoryDisplayName(category, t));
    return { name, date: soonest.date };
  }, [incoming, t]);

  /** A figure in a sentence, as the concept writes it: whole shekels, the symbol first. */
  const wholeText = (minor: number) => {
    const parts = figureParts(wholeMinor(minor, settings.defaultCurrency), settings.defaultCurrency, {
      locale: i18n.language,
      whole: true,
    });
    return `${parts.sign}${parts.symbol}${parts.digits}`;
  };

  const hasAnyTransactions = (candidates?.transactions.length ?? 0) > 0 || windowCount > 0;
  const reason = isLoading ? undefined : emptyReason(windowCount, rows.length, hasAnyTransactions);

  return (
    // The Add pill floats above the tab bar, so the list needs clearance for BOTH or
    // the last row of every month sits under a button. The shell already pads
    // for the tab bar; this is the Add pill's share.
    <section
      className="px-3 pb-24 lg:px-0 lg:pb-8"
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
      {/*
        FIRST in the DOM, and deliberately so.

        The Add pill is `position: fixed`, so where it sits in the markup does not
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
        onAdd={sheet.openAdd}
        onAddWithAi={() => {
          sheet.openImport();
        }}
      />

      {headerCollapsed ? (
        <CollapsedSummaryBar
          state={balance}
          currency={settings.defaultCurrency}
          breakdown={breakdowns.balance}
          onFullBreakdown={() => {
            setBreakdown('balance');
          }}
        />
      ) : null}

      <ScreenHead
        className="lg:mb-sheet"
        // The phone's head is the screen's name in Karantina; the desktop's top bar greets (decision 2).
        title={
          desktop
            ? t(greetingKey(new Date(systemClock.nowMs()).getHours()), { name: greetingName ?? '' })
            : t('nav.feed')
        }
        subtitle={
          desktop
            ? formatLocalDate(today, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
            : undefined
        }
        actions={
          desktop ? (
            <>
              <SearchPill
                value={filters.query}
                onChange={(query) => {
                  set({ query });
                }}
              />
              {lookups === undefined ? null : (
                <ProfileSwitcher
                  profiles={lookups.profiles}
                  active={filters.profileId}
                  onSelect={setProfile}
                />
              )}
              <PrimePill tone="paper" />
              <MonthCursor
                month={filters.month}
                today={today}
                onStep={stepMonth}
                onPick={setMonth}
                tone="bold"
              />
            </>
          ) : undefined
        }
      />
      <FeedBoard
        balance={
          <div ref={measureHeader} data-testid="feed-header">
            <BalanceSheet
              title={t('board.balanceTitle')}
              subtitle={t('board.balanceSub', { count: banks })}
              actions={
                desktop ? undefined : (
                  <div className="flex flex-wrap items-center gap-2" data-testid="panel-pills">
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
                )
              }
              lede={
                <>
                  {net === undefined ? null : (
                    <Trans
                      i18nKey={net >= 0 ? 'board.ledeUp' : 'board.ledeDown'}
                      values={{
                        amount: wholeText(Math.abs(net)),
                      }}
                      components={{ box: <Mark /> }}
                    />
                  )}{' '}
                  {bills === undefined || bills.upcomingMinor === 0 || bills.lastDate === undefined ? null : (
                    <Trans
                      i18nKey="board.ledeCards"
                      values={{
                        amount: wholeText(bills.upcomingMinor),
                        date: formatLocalDate(bills.lastDate, i18n.language, {
                          day: 'numeric',
                          month: 'short',
                        }),
                      }}
                      components={{ box: <Mark /> }}
                    />
                  )}
                </>
              }
              figure={
                <BalanceNumeral
                  state={balance}
                  currency={settings.defaultCurrency}
                  breakdown={breakdowns.balance}
                  onFullBreakdown={() => {
                    setBreakdown('balance');
                  }}
                />
              }
              accounts={<AccountSheets items={accounts} currency={settings.defaultCurrency} />}
            />
          </div>
        }
        month={
          <MonthSheet
            month={filters.month}
            today={today}
            occurrences={occurrences}
            bills={bills}
            currency={settings.defaultCurrency}
            nextIncome={nextIncome}
            forecast={
              <ForecastLine
                expense={expense}
                currency={settings.defaultCurrency}
                month={filters.month}
                today={today}
                breakdown={breakdowns.forecast}
                onFullBreakdown={() => {
                  setBreakdown('expense');
                }}
              />
            }
            monthPicker={
              desktop ? null : (
                <MonthCursor
                  month={filters.month}
                  today={today}
                  onStep={stepMonth}
                  onPick={setMonth}
                  tone="bold"
                />
              )
            }
          />
        }
        categories={
          <CategoriesSheet
            month={filters.month}
            today={today}
            occurrences={occurrences}
            categories={lookups?.categories}
            currency={settings.defaultCurrency}
            limit={desktop ? 10 : 7}
          />
        }
        transactions={
          <TransactionsSheet
            count={windowCount}
            onAll={
              showAll
                ? undefined
                : () => {
                    setShowAll(true);
                  }
            }
            filterBar={
              showAll || hasActiveFilters(filters) ? (
                <FilterBar filters={filters} onChange={set} onClear={clear} />
              ) : null
            }
            list={
              <>
                {reason !== undefined ? (
                  <EmptyState
                    reason={reason}
                    month={filters.month}
                    onClearFilters={hasActiveFilters(filters) ? clear : undefined}
                  />
                ) : context === undefined ? null : showAll ? (
                  <VirtualFeed
                    rows={rows}
                    context={context}
                    // The row body opens the editor; its always-present ⋯ opens the
                    // row menu, anchored to that button.
                    // A card's fee is worked out from the card, not a row anyone saved:
                    // it is changed where the card is, so it opens the Cards screen.
                    onOpen={(occurrence) => {
                      if (isCardFee(occurrence)) void navigate(ROUTES.cards);
                      else sheet.openEdit(occurrence);
                    }}
                    onMenu={(occurrence, anchor) => {
                      if (isCardFee(occurrence)) void navigate(ROUTES.cards);
                      else setMenuFor({ occurrence, anchor });
                    }}
                    onCategory={(occurrence, anchor) => {
                      setCategoryFor({ occurrence, anchor });
                    }}
                    onProjected={(occurrence, anchor) => {
                      setProjectedFor({ occurrence, anchor });
                    }}
                  />
                ) : (
                  <RecentFeed
                    rows={rows}
                    context={context}
                    // The row body opens the editor; its always-present ⋯ opens the
                    // row menu, anchored to that button.
                    // A card's fee is worked out from the card, not a row anyone saved:
                    // it is changed where the card is, so it opens the Cards screen.
                    onOpen={(occurrence) => {
                      if (isCardFee(occurrence)) void navigate(ROUTES.cards);
                      else sheet.openEdit(occurrence);
                    }}
                    onMenu={(occurrence, anchor) => {
                      if (isCardFee(occurrence)) void navigate(ROUTES.cards);
                      else setMenuFor({ occurrence, anchor });
                    }}
                    onCategory={(occurrence, anchor) => {
                      setCategoryFor({ occurrence, anchor });
                    }}
                    onProjected={(occurrence, anchor) => {
                      setProjectedFor({ occurrence, anchor });
                    }}
                  />
                )}
              </>
            }
          />
        }
        wallet={
          <WalletColumn
            cards={[...(methods?.values() ?? [])].filter(
              (m) =>
                m.type === 'credit_card' &&
                m.isArchived === 0 &&
                (filters.profileId === ALL_PROFILES || methodOwnedBy(m, filters.profileId)),
            )}
            bills={bills}
            profiles={new Map((lookups?.profiles ?? []).map((p) => [p.id, p]))}
            cash={cashData?.summary}
            currency={settings.defaultCurrency}
            today={today}
          />
        }
      />
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
          incomeHistory={incomeHistory}
          onSaved={(date, undone, onlyAmount) => {
            // A save from "not counted yet" is offered back, like the pop-out's
            // other two choices: "Amount changed" when that is all it was, a
            // plain "Saved" otherwise. Every other save is as before.
            const fromChip = sheet.target.mode === 'edit' && sheet.target.focus === 'amount';
            sheet.close();
            // Jump to the month the row landed in, so a bill dated next month
            // does not save into apparent nothingness - and so an edit that
            // MOVED an occurrence follows it. liveQuery brings the data; this
            // is only about which window is on screen.
            setMonth(startOfMonth(date));
            if (fromChip && undone !== undefined)
              offerUndo(t(onlyAmount === true ? 'projected.amountSaved' : 'projected.saved'), undone, t);
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

      <RowActionsMenu
        target={menuFor}
        split={splitMenu?.kind}
        onClose={() => {
          setMenuFor(undefined);
        }}
        onAction={(action, occurrence) => {
          // Closed first, unconditionally: leaving it open over a toast covers
          // the Undo the toast just offered.
          setMenuFor(undefined);
          if (action === 'edit') {
            sheet.openEdit(occurrence);
            return;
          }
          if (action === 'duplicate') {
            sheet.openDuplicate(occurrence);
            return;
          }
          if (action === 'split') {
            if (splitMenu?.kind === 'offer') setSplitting(splitMenu.offer);
            return;
          }
          void runAction(action, occurrence);
        }}
      />

      {context === undefined ? null : (
        <CategoryPopout
          target={categoryFor}
          categories={context.categories}
          today={today}
          onClose={() => {
            setCategoryFor(undefined);
          }}
          onChange={(occurrence, categoryId, scope) => {
            // Closed first, so the toast's Undo is not under it.
            setCategoryFor(undefined);
            const category = context.categories.get(categoryId);
            void undoable(
              () =>
                changeCategory(db, {
                  occurrence,
                  categoryId,
                  scope,
                  today,
                  now: systemClock.nowIso(),
                  newId,
                }),
              t('categoryPop.changed', {
                name: category === undefined ? categoryId : categoryDisplayName(category, t),
              }),
            );
          }}
        />
      )}

      <ProjectedPopout
        target={projectedFor}
        today={today}
        {...(lookups === undefined ? {} : { methods: lookups.paymentMethods })}
        onClose={() => {
          setProjectedFor(undefined);
        }}
        onMove={(occurrence, to) => {
          // Closed first, so the toast's Undo is not under it.
          setProjectedFor(undefined);
          void undoable(
            async () => {
              const undoable = await moveOccurrence(db, {
                occurrence,
                to,
                today,
                now: systemClock.nowIso(),
                newId,
              });
              // Follow the row to its new month, as a save from the sheet does.
              setMonth(startOfMonth(to));
              return undoable;
            },
            t('projected.moved', { date: formatLocalDate(to, i18n.language, { dateStyle: 'medium' }) }),
          );
        }}
        onAmount={(occurrence) => {
          setProjectedFor(undefined);
          sheet.openEdit(occurrence, { focus: 'amount' });
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

      {breakdowns.balance !== undefined && balance.status === 'ready' ? (
        <BalanceBreakdownSheet
          open={breakdown === 'balance'}
          onOpenChange={(open) => {
            setBreakdown(open ? 'balance' : undefined);
          }}
          breakdown={breakdowns.balance}
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
          breakdown={breakdowns.forecast}
          month={filters.month}
          currency={settings.defaultCurrency}
          categories={context.categories}
        />
      ) : null}
    </section>
  );
}
