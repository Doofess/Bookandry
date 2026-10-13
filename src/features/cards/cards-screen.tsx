import { cn } from 'cn';
import { ChevronDown, CreditCard, MoreHorizontal, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAccount } from '@/app/account';
import { useBaseCurrency, useSettings, useToday } from '@/app/app-context';
import { usePrime } from '@/app/prime';
import { ROUTES } from '@/app/routes';
import { ScreenHead } from '@/app/screen-head';
import { useMediaQuery } from '@/app/use-desktop';
import { Money } from '@/components/money';
import { Percent } from '@/components/percent';
import { Button } from '@/components/ui/button';
import { CardSheet } from '@/components/ui/card-sheet';
import {
  EditorPanel,
  EditorPanelBody,
  EditorPanelContent,
  EditorPanelHeader,
  EditorPanelTitle,
} from '@/components/ui/editor-panel';
import { Numeral } from '@/components/ui/numeral';
import { Sheet, SheetHead } from '@/components/ui/sheet-surface';
import type { ResolvedCard } from '@/data/card-catalog/resolve';
import { db } from '@/db/db';
import { putArchiveState, setPaymentMethodArchived } from '@/db/repos/payment-methods';
import { writeSettings } from '@/db/repos/settings';
import { bankByCode, bankName } from '@/domain/banks';
import { cardDealRate } from '@/domain/card-catalog-link';
import {
  billingDayOf,
  CARD_CURRENCY,
  cardBills,
  cardCommitments,
  cardCreditRate,
  cardFeeFor,
  isCardFee,
  chargeDate,
  expiryStatus,
  householdCommitments,
  rateOf,
  type CardBill,
  type CardCommitments,
} from '@/domain/cards';
import { rateOfTerm } from '@/domain/deal-rules';
import { PARAM } from '@/domain/feed-filters';
import { followsPrimeFrom } from '@/domain/long-credit';
import { cardKey } from '@/domain/money-key';
import { methodOwnedBy } from '@/domain/tx-options';
import { ProfileSwitcher } from '@/features/feed/profile-switcher';
import { useUndoableWrite } from '@/features/feed/use-row-actions';
import { useResolvedCards } from '@/features/transaction/use-transaction-sheet';
import { ordinalDay } from '@/i18n/ordinal';
import { systemClock } from '@/lib/clock';
import { formatLocalDate, compareLocal, startOfMonth } from '@/lib/dates';
import {
  ALL_PROFILES,
  SHARED_OWNER,
  type Occurrence,
  type PaymentMethod,
  type Profile,
  type Recurrence,
} from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

import { CardMenu, type CardMenuTarget } from './card-menu';
import { CardsSummary } from './cards-summary';
import { tierName } from './catalog-names';
import { issuerLabel } from './issuer-label';
import { MethodEditor, OtherMethods } from './method-editor';
import { NetworkLogo } from './network-logo';
import { UnfinishedNotice } from './unfinished-notice';
import { useCardsData } from './use-cards-data';
import { useMonthBills } from './use-month-bills';

/**
 * The household's credit cards, the way a card company's app shows them:
 * what the card is, when it bills, what is on the next bill, how much of the
 * limit is taken, and what it charges. Never its number.
 *
 * The bills are the point. A card does not take money out of the account when
 * something is bought; it collects the month and the bank pays it on the
 * billing day - so "what will leave the account on the 10th" is a question
 * only this screen answers.
 */
export function CardsScreen() {
  const { t, i18n } = useTranslation('cards');
  const { t: tCommon } = useTranslation('common');
  const today = useToday();
  const baseCurrency = useBaseCurrency();
  const data = useCardsData(today, baseCurrency);
  const [editing, setEditing] = useState<PaymentMethod | 'new' | undefined>(undefined);
  // The editor opened from "Interest table" goes straight to the rates.
  const [section, setSection] = useState<'rates' | undefined>(undefined);
  // One card menu for the screen, anchored to the face or ⋯ that opened it.
  const [menuFor, setMenuFor] = useState<CardMenuTarget | undefined>(undefined);
  const navigate = useNavigate();
  const account = useAccount();
  const undoable = useUndoableWrite();
  // Whose cards: the same choice as the feed's, so it follows the person between screens.
  const whose = useSettings().activeProfileId;
  const cards = useMemo(
    () => (data?.cards ?? []).filter((card) => whose === ALL_PROFILES || methodOwnedBy(card, whose)),
    [data, whose],
  );
  const archived = useMemo(
    () => (data?.archived ?? []).filter((card) => whose === ALL_PROFILES || methodOwnedBy(card, whose)),
    [data, whose],
  );
  // What the household's total counts: the cards on the screen, and any archived one still owed on.
  const counted = useMemo(
    () => [
      ...cards,
      ...(data?.owing ?? []).filter((card) => whose === ALL_PROFILES || methodOwnedBy(card, whose)),
    ],
    [cards, data, whose],
  );
  /*
   * A card restored from "Archived cards": its line, and with the last one the
   * whole list, leaves the page with the ⋯ that had focus. Focus goes to the
   * card's own ⋯ once the card is back on the screen.
   */
  const restoring = useRef<string | undefined>(undefined);
  useEffect(() => {
    const id = restoring.current;
    if (id === undefined || !cards.some((card) => card.id === id)) return;
    restoring.current = undefined;
    const more = [...document.querySelectorAll<HTMLElement>('[data-card-menu]')].find(
      (button) => button.dataset['cardMenu'] === id,
    );
    more?.focus();
  }, [cards]);
  // Each linked card's catalog entry: its rates and names, as every other screen reads them.
  const resolvedCards = useResolvedCards(cards);
  // Each card's commitments, worked out once: its panel and the household's total both read them.
  const commitments = useMemo(
    () => new Map(counted.map((card) => [card.id, cardCommitments(data?.occurrences ?? [], card, today)])),
    [counted, data, today],
  );

  const [params, setParams] = useSearchParams();
  // main >= 1080px (@wide) beside the 256px rail: the details sit beside the sheets, not in a panel.
  const wide = useMediaQuery('(min-width: 83.5rem)');
  const bills = useMonthBills(today, baseCurrency, whose);
  // ?card= chooses a card (Smart import's own ?card= is read only while ?import= is open).
  const chosenId = params.get('import') === null ? params.get('card') : null;
  const chosen = chosenId === null ? undefined : cards.find((card) => card.id === chosenId);
  const openCard = (id: string) => {
    setParams((p) => {
      p.set('card', id);
      return p;
    });
  };
  const closeCard = () => {
    setParams(
      (p) => {
        p.delete('card');
        return p;
      },
      { replace: true },
    );
  };
  // A ?card= naming a card that is archived or gone closes, and is removed (§12).
  useEffect(() => {
    if (chosenId !== null && data !== undefined && chosen === undefined) {
      setParams(
        (p) => {
          p.delete('card');
          return p;
        },
        { replace: true },
      );
    }
  }, [chosenId, chosen, data, setParams]);
  // ?add=card opens "Add a card" (the add-card flow takes this over when it lands).
  const target = editing ?? (params.get('add') === 'card' ? 'new' : undefined);
  // The biggest bill first, as the concept stacks them; the same bill by name.
  const bySize = [...cards].sort(
    (a, b) =>
      (bills?.byCard.get(b.id)?.totalMinor ?? 0) - (bills?.byCard.get(a.id)?.totalMinor ?? 0) ||
      a.label.localeCompare(b.label),
  );
  const accountName = (cardId: string) => {
    const accountId = cards.find((c) => c.id === cardId)?.card?.accountId;
    const account = accountId === undefined ? undefined : data?.accounts.find((a) => a.id === accountId);
    const bank = account === undefined ? undefined : bankByCode(account.account?.bank ?? '');
    return bank === undefined ? account?.label : bankName(bank, i18n.language);
  };
  // Task 14 replaces this with the card's page; until then the chosen card's existing panel.
  const details = (card: PaymentMethod) => (
    <CardPanel
      card={card}
      resolved={resolvedCards.get(card.id)}
      owner={data?.profiles.get(card.profileId)}
      occurrences={data?.occurrences ?? []}
      commitments={commitments.get(card.id)}
      today={today}
      baseCurrency={baseCurrency}
      onMenu={(anchor, returnFocus) => {
        setMenuFor({ card, anchor, returnFocus });
      }}
    />
  );

  return (
    <section className="px-3 pb-24 lg:px-0 lg:pb-8">
      <ScreenHead
        className="lg:mb-sheet"
        title={tCommon('nav.cards')}
        actions={
          <Button
            variant="pill-solid"
            onClick={() => {
              setEditing('new');
            }}
          >
            {tCommon('board.addCard')}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-sheet @board/main:grid-cols-12 @board/main:items-start">
        <div className="min-w-0 @board/main:col-span-12">
          <CardsSummary
            bills={bills}
            cardCount={cards.length}
            accountName={accountName}
            currency={baseCurrency}
          />
        </div>
        {cards.length === 0 ? null : (
          <div
            data-slot="card-sheets"
            className="grid min-w-0 gap-2 @board/main:col-span-12 @wide/main:col-span-7 @vast/main:col-span-8 @vast/main:grid-cols-2"
          >
            {bySize.map((card) => (
              <CardSheet
                key={card.id}
                moneyKey={cardKey(card)}
                name={issuerLabel(card, t)}
                holder={data?.profiles.get(card.profileId)?.name ?? t('shared')}
                lastDigits={card.card?.lastDigits}
                billing={
                  card.card?.billingDay === undefined
                    ? undefined
                    : t('billedOn', { day: card.card.billingDay })
                }
                figure={
                  <Numeral
                    minor={bills?.byCard.get(card.id)?.totalMinor ?? 0}
                    currency={baseCurrency}
                    size="card"
                    rounded
                  />
                }
                onOpen={() => {
                  openCard(card.id);
                }}
                openLabel={t('details.open', { name: card.label })}
                selected={chosen?.id === card.id}
                menu={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 rounded-full"
                    data-card-menu={card.id}
                    aria-label={t('cardMenu.label', { name: card.label })}
                    onClick={(event) => {
                      setMenuFor({ card, anchor: event.currentTarget });
                    }}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                }
              />
            ))}
          </div>
        )}
        <aside
          data-slot="card-details"
          className="hidden min-w-0 @wide/main:col-span-5 @wide/main:col-start-8 @wide/main:row-start-2 @wide/main:block @vast/main:col-span-4 @vast/main:col-start-9"
        >
          {!wide ? null : chosen === undefined ? (
            <Sheet kind="paper" className="grid gap-4">
              <SheetHead title={t('details.title')} />
              <p className="font-light">{t('details.empty')}</p>
              {counted.length === 0 ? null : (
                <HouseholdCommitments cards={counted} commitments={commitments} />
              )}
            </Sheet>
          ) : (
            <Sheet kind="paper">{details(chosen)}</Sheet>
          )}
        </aside>
        <Sheet
          kind="paper"
          className="grid min-w-0 gap-5 @board/main:col-span-12 @wide/main:col-span-7 @vast/main:col-span-8"
        >
          <UnfinishedNotice kind="card" />

          {data === undefined ? null : (
            <ProfileSwitcher
              profiles={[...data.profiles.values()]}
              active={whose}
              onSelect={(profileId) => {
                void writeSettings(db, { activeProfileId: profileId }, systemClock.nowIso());
              }}
            />
          )}

          {data === undefined || cards.length > 0 ? null : (
            <div className="text-center">
              <CreditCard className="mx-auto size-8" aria-hidden="true" />
              <h2 className="mt-3 font-semibold">{t('emptyTitle')}</h2>
              <p className="mt-1 font-light">{t('emptyBody')}</p>
            </div>
          )}

          {/* Below the wide layout there is no pane for the household's total: it stays on the page. */}
          {wide || data === undefined || counted.length === 0 ? null : (
            <HouseholdCommitments cards={counted} commitments={commitments} />
          )}

          <OtherMethods />

          {archived.length === 0 ? null : (
            <ArchivedCards
              cards={archived}
              onMenu={(card, anchor) => {
                setMenuFor({ card, anchor });
              }}
            />
          )}
        </Sheet>
      </div>

      {wide || chosen === undefined ? null : (
        <EditorPanel
          open
          onOpenChange={(open) => {
            if (!open) closeCard();
          }}
        >
          <EditorPanelContent aria-label={t('details.title')}>
            <EditorPanelHeader>
              <EditorPanelTitle>{chosen.label}</EditorPanelTitle>
            </EditorPanelHeader>
            <EditorPanelBody>{details(chosen)}</EditorPanelBody>
          </EditorPanelContent>
        </EditorPanel>
      )}

      <MethodEditor
        target={target}
        profiles={data === undefined ? [] : [...data.profiles.values()]}
        onOpenChange={(open) => {
          if (open) return;
          setEditing(undefined);
          setSection(undefined);
          if (params.get('add') === 'card') {
            setParams(
              (p) => {
                p.delete('add');
                return p;
              },
              { replace: true },
            );
          }
        }}
        newType="credit_card"
        section={section}
      />

      <CardMenu
        target={menuFor}
        variant={menuFor?.card.isArchived === 1 ? 'archived' : 'active'}
        aiAvailable={account.status !== 'unavailable'}
        onClose={() => {
          setMenuFor(undefined);
        }}
        onAction={(action, card) => {
          // Closed first, unconditionally: left open over a toast, it covers the Undo.
          setMenuFor(undefined);
          switch (action) {
            case 'edit':
              setEditing(card);
              return;
            case 'rates':
              setSection('rates');
              setEditing(card);
              return;
            case 'transactions':
              // The feed's own payment-method filter, on the month it opens on.
              void navigate({
                pathname: ROUTES.feed,
                search: `?${PARAM.methods}=${encodeURIComponent(card.id)}`,
              });
              return;
            case 'import':
              void navigate({
                pathname: ROUTES.feed,
                search: `?import=1&via=${encodeURIComponent(card.id)}`,
              });
              return;
            case 'archive':
            case 'restore': {
              // One write path both ways. Undo puts back exactly what was there, archive date and all.
              const archived = action === 'archive';
              if (!archived) restoring.current = card.id;
              void undoable(
                async () => {
                  const before = await setPaymentMethodArchived(db, card.id, archived, systemClock.nowIso());
                  return {
                    undo: async (at) => {
                      if (before !== undefined) await putArchiveState(db, card.id, before, at);
                    },
                  };
                },
                t(archived ? 'cardMenu.archived' : 'cardMenu.restored', { name: card.label }),
              );
              return;
            }
          }
        }}
      />
    </section>
  );
}

function CardPanel({
  card,
  resolved,
  owner,
  occurrences,
  commitments,
  today,
  baseCurrency,
  onMenu,
}: {
  readonly card: PaymentMethod;
  /** Its catalog entry, once loaded; undefined for a card not linked. */
  readonly resolved: ResolvedCard | undefined;
  readonly owner: Profile | undefined;
  readonly occurrences: readonly Occurrence[];
  readonly commitments: CardCommitments | undefined;
  readonly today: LocalDate;
  readonly baseCurrency: Currency;
  /**
   * Open the card's menu, anchored to what was pressed: its ⋯, or its face.
   * From the face, focus goes back to the ⋯ (`returnFocus`), the one the
   * keyboard and screen readers know.
   */
  readonly onMenu: (anchor: HTMLElement, returnFocus?: HTMLElement) => void;
}) {
  const { t, i18n } = useTranslation('cards');
  const more = useRef<HTMLButtonElement>(null);
  const details = card.card;
  const tier = tierName(details, resolved, i18n.language);
  const day = billingDayOf(card);
  const bills = cardBills(occurrences, card);
  const upcoming = bills.filter((bill) => compareLocal(bill.chargeDate, today) >= 0).reverse();
  const past = bills.filter((bill) => compareLocal(bill.chargeDate, today) < 0).slice(0, 6);
  const next = upcoming[0];
  // What this month's purchases add up to so far, and the day they are charged.
  const building =
    day === undefined
      ? undefined
      : (upcoming.find((bill) => compareLocal(bill.month, startOfMonth(today)) === 0) ??
        ({
          chargeDate: chargeDate(today, day),
          month: startOfMonth(today),
          totalMinor: 0,
          occurrences: [],
        } satisfies CardBill));
  // What is held against the limit is what the card is committed to charge.
  const used = day === undefined ? 0 : (commitments?.totalMinor ?? 0);
  const limit = details?.creditLimitMinor;
  const expiry = expiryStatus(details?.expiresMonth, today);
  const date = (value: LocalDate) =>
    formatLocalDate(value, i18n.language, { day: 'numeric', month: 'short' });
  const monthName = (value: LocalDate) => formatLocalDate(value, i18n.language, { month: 'long' });

  return (
    <article className="space-y-3" aria-labelledby={`card-${card.id}`}>
      {/* The card itself: everything on its face but the number. */}
      <div
        data-testid="card-face"
        data-color={card.color ?? ''}
        // A money sheet: the card's own colour, else its company's, else the
        // neutral ink sheet. Its text is the sheet's tint, never white (§1.3).
        data-sheet="money"
        data-money={cardKey(card)}
        className="relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-2xl p-5"
      >
        {/*
          The face is a button too: a larger pointer target for the same menu
          as the ⋯. Stretched under the text, so the name stays a heading; out
          of the tab order and hidden from assistive tech, where the ⋯ is the
          one control, and two identical stops per card would be noise.
        */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={(event) => {
            onMenu(event.currentTarget, more.current ?? undefined);
          }}
          className="absolute inset-0 rounded-2xl focus-visible:outline-none"
        />
        <div className="pointer-events-none relative flex items-start justify-between gap-3">
          <span className="text-sm font-medium">
            {details?.issuer === undefined ? t('unknownIssuer') : t(`issuer.${details.issuer}`)}
          </span>
          <span className="flex items-start gap-1">
            {details?.network === undefined ? null : (
              <NetworkLogo network={details.network} className="shrink-0" />
            )}
            <button
              ref={more}
              type="button"
              data-card-menu={card.id}
              aria-label={t('cardMenu.label', { name: card.label })}
              onClick={(event) => {
                onMenu(event.currentTarget);
              }}
              className="pointer-events-auto -me-3 -mt-3 flex size-11 items-center justify-center rounded-full text-current focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none active:bg-accent"
            >
              <MoreHorizontal className="size-5" aria-hidden="true" />
            </button>
          </span>
        </div>
        <div className="pointer-events-none relative">
          {details?.lastDigits === undefined ? null : (
            <p dir="ltr" className="mb-1 font-mono text-base tracking-widest tabular-nums rtl:text-end">
              •••• {details.lastDigits}
            </p>
          )}
          <h2 id={`card-${card.id}`} className="text-xl font-semibold">
            {card.label}
          </h2>
          <p className="text-sm font-light">
            {[tier, details?.club, details?.kind === undefined ? undefined : t(`kind.${details.kind}`)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="pointer-events-none relative flex items-end justify-between gap-3 text-sm">
          <span className="font-light">
            {card.profileId === SHARED_OWNER ? t('shared') : (owner?.name ?? '')}
          </span>
          <span className="flex flex-col items-end">
            {details?.expiresMonth === undefined ? null : (
              <span dir="ltr" className="font-mono tabular-nums">
                {details.expiresMonth.slice(5, 7)}/{details.expiresMonth.slice(2, 4)}
              </span>
            )}
            {day === undefined ? null : (
              <span className="text-xs font-light">
                {t('billsOn', { day: ordinalDay(day, i18n.language) })}
              </span>
            )}
          </span>
        </div>
      </div>

      {expiry === 'expired' || expiry === 'soon' ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          {expiry === 'expired' ? t('expired') : t('expiresSoon')}
        </p>
      ) : null}

      {day === undefined ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{t('noBillingDay')}</p>
      ) : (
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border p-3">
            <dt className="text-xs text-muted-foreground">
              {next === undefined ? t('nextBillNone') : t('nextBill', { date: date(next.chargeDate) })}
            </dt>
            <dd className="mt-1 text-lg font-semibold">
              <Money minor={next?.totalMinor ?? 0} currency={CARD_CURRENCY} />
            </dd>
            {next === undefined ? null : (
              <dd className="text-xs text-muted-foreground">
                {t('forMonth', { month: monthName(next.month) })}
              </dd>
            )}
          </div>
          {building === undefined || building.chargeDate === next?.chargeDate ? null : (
            <div className="rounded-xl border border-border p-3">
              <dt className="text-xs text-muted-foreground">
                {t('soFar', { month: monthName(building.month) })}
              </dt>
              <dd className="mt-1 text-lg font-semibold">
                <Money minor={building.totalMinor} currency={CARD_CURRENCY} />
              </dd>
              <dd className="text-xs text-muted-foreground">
                {t('chargedOn', { date: date(building.chargeDate) })}
              </dd>
            </div>
          )}
        </dl>
      )}

      {limit === undefined ? null : <LimitBar used={used} limit={limit} />}

      {commitments === undefined ? null : <CardCommitmentsBox commitments={commitments} />}

      <ChargesList card={card} resolved={resolved} />

      {/* Fee lines exist only in a shekel base (`cardFeeOccurrences`); say nothing otherwise. */}
      {baseCurrency === CARD_CURRENCY ? (
        <FeeStatus card={card} occurrences={occurrences} today={today} />
      ) : null}

      {past.length === 0 && upcoming.length === 0 ? null : (
        <BillList bills={[...upcoming.slice(0, 2).reverse(), ...past]} today={today} />
      )}
    </article>
  );
}

/**
 * The cards put away, folded at the foot of the screen, so one archived from
 * its menu is never lost once the toast's Undo has gone. Each is a line, not a
 * face, with its own ⋯ for Restore and Edit.
 */
function ArchivedCards({
  cards,
  onMenu,
}: {
  readonly cards: readonly PaymentMethod[];
  readonly onMenu: (card: PaymentMethod, anchor: HTMLElement) => void;
}) {
  const { t } = useTranslation('cards');
  const [open, setOpen] = useState(false);
  const listId = useId();
  const title = t('cardMenu.archivedCards', { count: cards.length });
  return (
    <section className="rounded-xl border border-border" data-testid="archived-cards">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen(!open);
        }}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-start text-sm text-muted-foreground hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span>{title}</span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open ? (
        <ul id={listId} aria-label={title} className="divide-y divide-border border-t border-border">
          {cards.map((card) => (
            <li key={card.id} className="flex items-center gap-3 py-1 ps-3 pe-1 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{card.label}</span>
                <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  {card.card?.lastDigits === undefined ? null : (
                    <span dir="ltr" className="font-mono tabular-nums">
                      •••• {card.card.lastDigits}
                    </span>
                  )}
                  {card.card?.issuer === undefined ? null : <span>{t(`issuer.${card.card.issuer}`)}</span>}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                aria-label={t('cardMenu.label', { name: card.label })}
                onClick={(event) => {
                  onMenu(card, event.currentTarget);
                }}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * סך הכל התחייבויות בכרטיסים: what every card in the household will still
 * charge the bank, and how much of it is on each card.
 */
function HouseholdCommitments({
  cards,
  commitments,
}: {
  readonly cards: readonly PaymentMethod[];
  readonly commitments: ReadonlyMap<string, CardCommitments>;
}) {
  const { t } = useTranslation('cards');
  const total = householdCommitments([...commitments.values()]);
  return (
    <section
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
      aria-labelledby="household-commitments"
      data-testid="household-commitments"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 id="household-commitments" className="font-semibold">
            {t('commitments.householdTitle')}
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">{t('commitments.householdBody')}</p>
        </div>
        <Money minor={total.totalMinor} currency={CARD_CURRENCY} className="text-2xl font-semibold" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <CommitmentRows commitments={total} />
        {cards.length < 2 ? null : (
          <div>
            <h3 className="mb-1 text-xs text-muted-foreground">{t('commitments.byCard')}</h3>
            <dl className="divide-y divide-border text-sm">
              {cards.map((card) => (
                <div key={card.id} className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="min-w-0 truncate">{card.label}</dt>
                  <dd>
                    <Money minor={commitments.get(card.id)?.totalMinor ?? 0} currency={CARD_CURRENCY} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}

/** One card's סך הכל התחייבויות בכרטיס, and the plans behind it. */
export function CardCommitmentsBox({ commitments }: { readonly commitments: CardCommitments }) {
  const { t, i18n } = useTranslation('cards');
  const [open, setOpen] = useState(false);
  const date = (value: LocalDate) =>
    formatLocalDate(value, i18n.language, { month: 'short', year: 'numeric' });
  return (
    <div className="rounded-xl border border-border" data-testid="card-commitments">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2">
        <h3 className="text-sm font-medium">{t('commitments.title')}</h3>
        <Money minor={commitments.totalMinor} currency={CARD_CURRENCY} className="font-semibold" />
      </div>
      <div className="px-3 py-2">
        <CommitmentRows commitments={commitments} />
      </div>
      {commitments.plans.length === 0 ? null : (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              setOpen(!open);
            }}
            className="flex w-full items-center justify-between gap-3 border-t border-border px-3 py-2 text-start text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span>
              {t('commitments.plans')} ({commitments.plans.length})
            </span>
            <ChevronDown
              className={cn('size-4 transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
          {open ? (
            <ul className="divide-y divide-border bg-muted/40 text-sm">
              {commitments.plans.map((plan) => (
                <li key={plan.seriesId} className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">
                      {plan.transaction.note ?? t('unnamed')}{' '}
                      <span className="text-xs text-muted-foreground">({t(`commitments.${plan.plan}`)})</span>
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t('commitments.planLeft', {
                        left: plan.remaining,
                        count: plan.count,
                        date: date(plan.last.date),
                      })}
                    </span>
                    <FollowsPrime recurrence={plan.transaction.recurrence} />
                  </span>
                  <Money minor={plan.remainingMinor} currency={CARD_CURRENCY} className="shrink-0" />
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}

/** A long קרדיט that will re-price with prime: from which payment. */
function FollowsPrime({ recurrence }: { readonly recurrence: Recurrence }) {
  const { t } = useTranslation('cards');
  const at = followsPrimeFrom(recurrence);
  return at === undefined ? null : (
    <span className="block text-xs text-muted-foreground">{t('followsPrime', { at })}</span>
  );
}

/** The parts of a commitments total that are not zero, and the interest inside them. */
function CommitmentRows({ commitments }: { readonly commitments: CardCommitments }) {
  const { t } = useTranslation('cards');
  const rows = (
    [
      ['purchases', commitments.purchasesMinor],
      ['installments', commitments.byPlan.installments],
      ['credit', commitments.byPlan.credit],
      ['loan', commitments.byPlan.loan],
    ] as const
  ).filter(([, minor]) => minor > 0);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t('commitments.none')}</p>;
  return (
    <div className="space-y-1">
      <dl className="space-y-1 text-sm">
        {rows.map(([key, minor]) => (
          <div key={key} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{t(`commitments.${key}`)}</dt>
            <dd>
              <Money minor={minor} currency={CARD_CURRENCY} />
            </dd>
          </div>
        ))}
        {commitments.interestMinor === 0 ? null : (
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <dt className="text-muted-foreground">{t('commitments.interest')}</dt>
            <dd>
              <Money minor={commitments.interestMinor} currency={CARD_CURRENCY} />
            </dd>
          </div>
        )}
      </dl>
      {commitments.byPlan.credit + commitments.byPlan.loan === 0 ? null : (
        <p className="text-xs text-muted-foreground">{t('commitments.interestHint')}</p>
      )}
    </div>
  );
}

function LimitBar({ used, limit }: { readonly used: number; readonly limit: number }) {
  const { t } = useTranslation('cards');
  const share = limit <= 0 ? 0 : Math.min(1, used / limit);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{t('limit')}</span>
        <span>
          <Trans
            i18nKey="limitUsed"
            ns="cards"
            components={{
              used: <Money minor={used} currency={CARD_CURRENCY} className="font-medium" />,
              limit: <Money minor={limit} currency={CARD_CURRENCY} />,
            }}
          />
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={t('limit')}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
      >
        <div
          className={cn('h-full rounded-full', share >= 0.9 ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${String(Math.round(share * 1000) / 10)}%` }} // money-allow: a CSS width
        />
      </div>
      <p className="text-xs text-muted-foreground">
        <Trans
          i18nKey="limitLeft"
          ns="cards"
          components={{ left: <Money minor={Math.max(0, limit - used)} currency={CARD_CURRENCY} /> }}
        />
      </p>
    </div>
  );
}

/**
 * What the card charges, as its company quotes it. A linked card's credit and
 * late rates are read the way the purchase form reads them (`cardDealRate`):
 * the person's own over the catalog's, so the two screens never disagree.
 */
export function ChargesList({
  card,
  resolved,
}: {
  readonly card: PaymentMethod;
  readonly resolved: ResolvedCard | undefined;
}) {
  const { t } = useTranslation('cards');
  const prime = usePrime();
  const details = card.card;
  const linked = resolved !== undefined && details?.catalog !== undefined;
  const termOf = (kind: 'credit' | 'late') =>
    linked ? cardDealRate(details, resolved, kind)?.term : undefined;
  const creditTerm = termOf('credit');
  const lateTerm = termOf('late');
  const credit = linked
    ? creditTerm == null
      ? ''
      : (rateOfTerm(creditTerm, prime) ?? '')
    : cardCreditRate(card, prime.primeRate);
  const creditMargin = linked
    ? creditTerm?.basis === 'prime'
      ? creditTerm.margin
      : undefined
    : details?.creditPrimeMargin;
  const lateShown = linked ? (lateTerm ?? undefined) : details?.lateRate;
  const late =
    lateShown === undefined
      ? undefined
      : linked
        ? rateOfTerm(lateShown, prime)
        : details?.lateRate === undefined
          ? undefined
          : rateOf(details.lateRate, prime.primeRate);
  const rows: { key: string; label: string; value: React.ReactNode }[] = [];

  if (details?.monthlyFeeMinor !== undefined) {
    rows.push({
      key: 'fee',
      label: t('monthlyFee'),
      value: <Money minor={details.monthlyFeeMinor} currency={CARD_CURRENCY} />,
    });
  }
  if (details?.fxFeeRate !== undefined) {
    rows.push({ key: 'fx', label: t('fxFee'), value: <Percent rate={details.fxFeeRate} /> });
  }
  if (credit !== '') {
    rows.push({
      key: 'credit',
      label: t('creditRate'),
      value: <RateValue margin={creditMargin} rate={credit} />,
    });
  }
  if (late !== undefined && lateShown !== undefined) {
    rows.push({
      key: 'late',
      label: t('lateRate'),
      value: <RateValue margin={lateShown.basis === 'prime' ? lateShown.margin : undefined} rate={late} />,
    });
  }
  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-border">
      <h3 className="border-b border-border px-3 py-2 text-sm font-medium">{t('charges')}</h3>
      <dl className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-end font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** "Prime + 1.5 (6.25%)", or just the fixed rate. */
function RateValue({ margin, rate }: { readonly margin: string | undefined; readonly rate: string }) {
  if (margin === undefined) return <Percent rate={rate} />;
  return (
    <Trans
      i18nKey="primePlus"
      ns="cards"
      components={{
        margin: <Percent rate={margin.startsWith('-') ? margin : `+${margin}`} />,
        rate: <Percent rate={rate} />,
      }}
    />
  );
}

/**
 * This month's fee, and how close the card is to earning its discount - the
 * thing worth knowing before the month ends, not after.
 */
function FeeStatus({
  card,
  occurrences,
  today,
}: {
  readonly card: PaymentMethod;
  readonly occurrences: readonly Occurrence[];
  readonly today: LocalDate;
}) {
  const { t, i18n } = useTranslation('cards');
  const month = startOfMonth(today);
  const fee = cardFeeFor(card, month, occurrences);
  const terms = card.card?.feeDiscount;
  if (fee === undefined) return null;
  const until =
    terms?.until === undefined
      ? undefined
      : formatLocalDate(`${terms.until}-01` as LocalDate, i18n.language, { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-2 rounded-xl border border-border p-3 text-sm" data-testid="fee-status">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-muted-foreground">
          {t('feeThisMonth', { month: formatLocalDate(month, i18n.language, { month: 'long' }) })}
        </span>
        <Money minor={fee.feeMinor} currency={CARD_CURRENCY} className="font-medium" />
      </div>
      {terms === undefined ? null : fee.discount === undefined ? (
        <p className="text-xs text-muted-foreground">{t('discountEnded')}</p>
      ) : (
        <>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label={t('discountProgress')}
            aria-valuemin={0}
            aria-valuemax={fee.discount.minSpendMinor}
            aria-valuenow={Math.min(fee.spentMinor, fee.discount.minSpendMinor)}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${String(Math.round(earnedShare(fee.spentMinor, fee.discount.minSpendMinor) * 1000) / 10)}%`, // money-allow: a CSS width
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            <Trans
              i18nKey={fee.discount.earned ? 'discountEarned' : 'discountToGo'}
              ns="cards"
              components={{
                spent: <Money minor={fee.spentMinor} currency={CARD_CURRENCY} />,
                target: <Money minor={fee.discount.minSpendMinor} currency={CARD_CURRENCY} />,
                percent: <Percent rate={fee.discount.percent} />,
              }}
            />{' '}
            {until === undefined ? t('discountNoEnd') : t('discountUntil', { date: until })}
          </p>
        </>
      )}
    </div>
  );
}

/** How far toward the discount's spend this month is, from 0 to 1. */
function earnedShare(spent: number, target: number): number {
  return target <= 0 ? 1 : Math.min(1, spent / target);
}

function BillList({ bills, today }: { readonly bills: readonly CardBill[]; readonly today: LocalDate }) {
  const { t, i18n } = useTranslation('cards');
  const [open, setOpen] = useState<LocalDate | undefined>(undefined);
  const date = (value: LocalDate) =>
    formatLocalDate(value, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="rounded-xl border border-border">
      <h3 className="border-b border-border px-3 py-2 text-sm font-medium">{t('bills')}</h3>
      <ul className="divide-y divide-border">
        {bills.map((bill) => {
          const expanded = open === bill.chargeDate;
          const charged = compareLocal(bill.chargeDate, today) < 0;
          return (
            <li key={bill.chargeDate}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => {
                  setOpen(expanded ? undefined : bill.chargeDate);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span>
                  <span className="block">{date(bill.chargeDate)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {charged
                      ? t('billCharged', { count: bill.occurrences.length })
                      : t('billUpcoming', { count: bill.occurrences.length })}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Money minor={bill.totalMinor} currency={CARD_CURRENCY} className="font-medium" />
                  <ChevronDown
                    className={cn('size-4 transition-transform', expanded && 'rotate-180')}
                    aria-hidden="true"
                  />
                </span>
              </button>
              {expanded ? (
                <ul className="space-y-1 bg-muted/40 px-3 py-2 text-sm">
                  {bill.occurrences.map((o) => (
                    <li key={o.key} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate">
                        <span className="text-xs text-muted-foreground">
                          {formatLocalDate(o.date, i18n.language, { day: 'numeric', month: 'short' })}
                        </span>{' '}
                        {isCardFee(o) ? t('feeLine') : (o.note ?? t('unnamed'))}
                      </span>
                      <Money minor={o.money.baseAmountMinor} currency={CARD_CURRENCY} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
