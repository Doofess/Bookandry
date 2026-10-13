import { cn } from 'cn';
import type { TFunction } from 'i18next';
import { HandCoins, Layers, MoreHorizontal, Percent, Repeat } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Money } from '@/components/money';
import { PersonAvatar } from '@/components/person-avatar';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { HuePill } from '@/components/ui/hue-pill';
import { bankByCode, bankName } from '@/domain/banks';
import { isCardFee } from '@/domain/cards';
import { categoryHue } from '@/domain/category-hue';
import { cardKey, methodKey, type MoneyKey } from '@/domain/money-key';
import { recurrenceModeOf } from '@/domain/tx-edit';
import { standingViaOf } from '@/domain/tx-options';
import { issuerLabel } from '@/features/cards/issuer-label';
import { categoryDisplayName } from '@/i18n/category-name';
import { methodDisplayName } from '@/i18n/method-name';
import { formatLocalDate, monthsBetween } from '@/lib/dates';
import {
  CASH_METHOD_ID,
  type Category,
  type Occurrence,
  type PaymentMethod,
  type Profile,
} from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

export type RowContext = {
  readonly currency: Currency;
  readonly today: LocalDate;
  readonly categories: ReadonlyMap<string, Category>;
  readonly profiles: ReadonlyMap<string, Profile>;
  /** To show which card paid. */
  readonly methods?: ReadonlyMap<string, PaymentMethod>;
  /** Only in the merged view: one profile makes the avatar column noise. */
  readonly showProfile: boolean;
};

/**
 * A day header.
 *
 * `aria-hidden`, and the date is folded into each row's accessible name
 * instead. The header is a visual grouping device; announcing it as a heading
 * would make a screen reader read the date twice for the first row of every
 * day, and `role="list"` cannot legally contain one anyway.
 */
export function DayHeader({
  date,
  netMinor,
  isToday,
  currency,
  className,
  bare = false,
}: {
  date: LocalDate;
  netMinor: number;
  isToday: boolean;
  currency: Currency;
  className?: string;
  /** The board's short list draws the concept's heading: the day alone, no net total. */
  bare?: boolean;
}) {
  const { t, i18n } = useTranslation();

  return (
    <div
      aria-hidden="true"
      data-slot="day-heading"
      className={cn(
        // On the sheet's own colour (opaque, as before: a pinned heading sits over a half-scrolled row),
        // 600 at 14px over the concept's 2px line.
        'flex items-baseline justify-between gap-2 border-be-2 border-border px-0 pt-4 pb-1.5',
        bare ? 'bg-transparent' : 'bg-card',
        'text-sm font-semibold',
        className,
      )}
    >
      <span>
        {isToday
          ? t('feed.today')
          : formatLocalDate(date, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}
      </span>
      {bare ? null : (
        <Money
          minor={netMinor}
          currency={currency}
          signMode="always"
          announce={false}
          className="text-xs font-light"
        />
      )}
    </div>
  );
}

/**
 * What kind of transaction a row belongs to, in the words the form used to make
 * it: "Standing order", "Payment 3 of 12", "Credit 3 of 12", "Loan 3 of 120".
 *
 * Nothing for a regular one-off - it is most of the feed, and a chip on every
 * row would drown the few that say something. The payment number is counted
 * from the slot, not the moved date: payment 3 moved into next month is still
 * payment 3.
 */
function rowType(
  occurrence: Occurrence,
  t: TFunction<['common', 'categories']>,
  methods: ReadonlyMap<string, PaymentMethod> | undefined,
): { readonly label: string; readonly icon: typeof Repeat } | undefined {
  const { recurrence, kind, date } = occurrence.transaction;
  const mode = recurrenceModeOf(recurrence, kind);
  if (mode === 'one_time' || recurrence.type === 'one_time') return undefined;
  if (mode === 'installments' || mode === 'credit' || mode === 'loan') {
    const values = {
      index: monthsBetween(date, occurrence.originalDate) + 1,
      count: recurrence.type === 'monthly' ? (recurrence.installments ?? 0) : 0,
    };
    if (mode === 'loan') return { label: t('feed.typeLoan', values), icon: HandCoins };
    return mode === 'credit'
      ? { label: t('feed.typeCredit', values), icon: Percent }
      : { label: t('feed.typeInstallment', values), icon: Layers };
  }
  if (mode === 'standing_order') {
    // הוראת קבע בכרטיס is collected with the card's bill; one from the bank leaves on its own date.
    const method = methods?.get(occurrence.transaction.paymentMethodId ?? '');
    const onCard = method !== undefined && standingViaOf(method) === 'card';
    return { label: t(onCard ? 'feed.typeCardStandingOrder' : 'feed.typeStandingOrder'), icon: Repeat };
  }
  return { label: t(mode === 'yearly' ? 'feed.typeYearly' : 'feed.typeMonthly'), icon: Repeat };
}

/**
 * The card an expense was paid with, as a chip: its last four digits, the way
 * the card company shows them - or, for a card without them, its name.
 */
function cardOf(
  occurrence: Occurrence,
  methods: ReadonlyMap<string, PaymentMethod> | undefined,
  t: TFunction<['common', 'categories']>,
  tCards: TFunction<'cards'>,
):
  | { readonly text: string; readonly label: string; readonly name: string; readonly key: MoneyKey }
  | undefined {
  if (occurrence.transaction.kind !== 'expense' || occurrence.paymentMethodId === undefined) return undefined;
  const method = methods?.get(occurrence.paymentMethodId);
  if (method === undefined || (method.type !== 'credit_card' && method.type !== 'debit_card'))
    return undefined;
  const digits = method.card?.lastDigits;
  const key = cardKey(method);
  return digits === undefined
    ? { text: method.label, label: t('feed.paidWith', { name: method.label }), name: method.label, key }
    : {
        text: `${issuerLabel(method, tCards)} ${digits}`,
        label: t('feed.cardEnding', { digits }),
        name: method.label,
        key,
      };
}

/**
 * Where an income went, shown the way an expense shows its card: the bank's
 * mark and the account's name, or the cash icon. Nothing when it is not
 * assigned, or names an account that no longer exists - which is "not
 * assigned", never an error. An archived account still shows: the row keeps
 * its label.
 */
function destinationOf(
  occurrence: Occurrence,
  methods: ReadonlyMap<string, PaymentMethod> | undefined,
  t: TFunction<['common', 'profiles']>,
  language: string,
): { readonly text: string; readonly label: string; readonly key: MoneyKey } | undefined {
  if (occurrence.transaction.kind !== 'income' || occurrence.destinationId === undefined) return undefined;
  const method = methods?.get(occurrence.destinationId);
  if (method === undefined) return undefined;
  const text = methodDisplayName(method, t);
  const label = t('feed.into', { name: text });
  if (method.id === CASH_METHOD_ID) return { text, label, key: 'cash' };
  if (method.type !== 'bank_account') return undefined;
  const bank = bankByCode(method.account?.bank ?? '');
  return { text: bank === undefined ? text : bankName(bank, language), label, key: methodKey(method) };
}

/**
 * One occurrence.
 *
 * `memo` is load-bearing, not decoration: `effectiveTransaction` returns the
 * row object BY REFERENCE when there is no override, so an unchanged row is
 * referentially identical between renders and skips re-rendering entirely. A
 * virtualizer re-measures every element it re-renders, so a feed that spreads
 * its rows unconditionally re-measures the whole viewport on any state change.
 */
export const TransactionRow = memo(function TransactionRow({
  occurrence,
  context,
  position,
  setSize,
  onOpen,
  onMenu,
  onCategory,
  onProjected,
}: {
  occurrence: Occurrence;
  context: RowContext;
  /**
   * 1-based index among the ROWS, and the total.
   *
   * A virtualised list has a handful of elements in the DOM out of hundreds, so
   * without these a screen reader announces "item 3 of 8" for a row that is
   * actually the 214th of 600.
   */
  position: number;
  setSize: number;
  onOpen?: (occurrence: Occurrence) => void;
  onMenu?: (occurrence: Occurrence, anchor: HTMLElement) => void;
  /** The chip was tapped: change the category from the row. */
  onCategory?: (occurrence: Occurrence, anchor: HTMLElement) => void;
  /** "Not counted yet" was tapped: count it now, or change its amount or day. */
  onProjected?: (occurrence: Occurrence, anchor: HTMLElement) => void;
}) {
  const { t, i18n } = useTranslation(['common', 'categories']);
  // The method's own namespace too, for cash's name in the UI language.
  const { t: tMethod } = useTranslation(['common', 'profiles']);
  const { t: tCards } = useTranslation('cards');

  const category = context.categories.get(occurrence.categoryId);
  const categoryName = category === undefined ? occurrence.categoryId : categoryDisplayName(category, t);

  const profile = context.profiles.get(occurrence.transaction.profileId);
  const isIncome = occurrence.transaction.kind === 'income';
  const type = rowType(occurrence, t, context.methods);
  const card = cardOf(occurrence, context.methods, t, tCards);
  const destination = destinationOf(occurrence, context.methods, tMethod, i18n.language);
  const signed = isIncome ? occurrence.money.baseAmountMinor : -occurrence.money.baseAmountMinor;

  // The date is part of the NAME, so the row is self-describing when the
  // aria-hidden day header above it is not announced.
  const dateLabel = formatLocalDate(occurrence.date, i18n.language, { dateStyle: 'medium' });
  // The profile is named only when its avatar is actually shown. Announcing
  // "Dana" while nothing on screen says Dana describes a different interface
  // from the one the sighted user is looking at.
  const label = [
    dateLabel,
    categoryName,
    occurrence.note,
    type?.label,
    card?.label,
    destination?.label,
    context.showProfile ? profile?.name : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  // "Not counted yet" is a question the person can answer, except on a card's
  // fee (changed where the card is) and on a skipped row (nothing to count).
  const projectedChip =
    occurrence.isProjected && onProjected !== undefined && !occurrence.isSkipped && !isCardFee(occurrence);

  return (
    <div
      role="listitem"
      aria-posinset={position}
      aria-setsize={setSize}
      className={cn(
        // `relative`: the row's own button is stretched over all of it (see below).
        'relative flex min-h-16 items-center gap-3.5 border-be-2 border-border py-2 max-sm:gap-2',
        occurrence.isSkipped && 'opacity-50',
      )}
      data-projected={occurrence.isProjected ? 'true' : undefined}
      data-key={occurrence.key}
    >
      {/*
        Its own button, beside the row's: a button inside a button is not one.
        The ring is inset: the row clips what is outside it, and the chip sits at its edge.
        The inert chip is not raised: the row's stretched button lies over it, so a
        tap on it opens the row, as it did when the row was one button.
        The raised ones are `relative z-10`, above that button.
      */}
      {onCategory === undefined || occurrence.isSkipped || isCardFee(occurrence) ? (
        <span className="-ms-3.75 flex size-11 shrink-0 items-center justify-center" aria-hidden="true">
          <HuePill hue={category === undefined ? undefined : categoryHue(category)} />
        </span>
      ) : (
        <button
          type="button"
          aria-label={t('categoryPop.chip', { name: categoryName })}
          onClick={(event) => {
            onCategory(occurrence, event.currentTarget);
          }}
          className="relative z-10 -ms-3.75 flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        >
          <HuePill hue={category === undefined ? undefined : categoryHue(category)} />
        </button>
      )}

      {/*
        The row's own button, stretched over the whole row: a tap anywhere
        opens the row, while the chip, "not counted yet" and ⋯ sit above it as
        buttons of their own (a button inside a button is not one). It is the
        row's real size, not a small title grown by a pseudo-element, so a
        target-size check measures what a finger can hit.
      */}
      <button
        type="button"
        onClick={() => onOpen?.(occurrence)}
        aria-label={label}
        className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      />

      {/*
        What the row says. Everything here was inside the old button, named by
        its label and hidden by it; it is hidden explicitly now, so a screen
        reader hears the row as before: its label, then its buttons. Nothing
        here catches a pointer but "not counted yet": the avatar is
        positioned, and would otherwise sit over the row's button.
      */}
      <span className="pointer-events-none flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
        <span className="min-w-0 flex-1" data-testid="row-text">
          <span
            data-slot="row-title"
            className="block truncate text-[1.0625rem] leading-[1.3] font-semibold"
            aria-hidden="true"
          >
            {occurrence.note ?? categoryName}
          </span>
          <span className="mt-0.75 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-light text-muted-foreground">
            {occurrence.note === undefined ? null : (
              <span className="min-w-0 truncate" aria-hidden="true">
                {categoryName}
              </span>
            )}
            {card === undefined ? null : (
              <Chip
                moneyKey={card.key}
                data-testid="row-card"
                title={card.name}
                className="max-w-full truncate"
              >
                {card.text}
              </Chip>
            )}
            {destination === undefined ? null : (
              <Chip
                moneyKey={destination.key}
                data-testid="row-destination"
                title={destination.text}
                className="max-w-full truncate"
              >
                {destination.text}
              </Chip>
            )}
            {type === undefined ? null : (
              <span
                title={type.label}
                aria-hidden="true"
                // A phone has room for one chip, and "not counted yet" matters more.
                className={cn(
                  'inline-flex min-w-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[11px] whitespace-nowrap',
                  occurrence.isProjected && 'max-sm:hidden',
                )}
              >
                <type.icon className="size-3 shrink-0" aria-hidden="true" />
                {/* Below sm the icon stands for it: the label is in the row's name and the title. */}
                <span className="truncate max-sm:sr-only">{type.label}</span>
              </span>
            )}

            {/*
              Muted grey is not an explanation for an 18,000 salary sitting in
              the feed and not in the balance. Where it can be answered, it is
              a button around the small chip: 24px tall itself, in the room the
              chip's line already has (-my-1), and 44px tall to a finger
              through its ::before (taller only, so its width stays the chip's).
            */}
            {!occurrence.isProjected ? null : projectedChip ? (
              <button
                type="button"
                aria-label={t('projected.chip')}
                onClick={(event) => {
                  onProjected(occurrence, event.currentTarget);
                }}
                className="pointer-events-auto relative z-10 -my-1 shrink-0 rounded-full py-1 text-[11px] whitespace-nowrap before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-[''] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                data-testid="row-not-counted"
              >
                <span className="block rounded-full bg-accent px-1 py-0.5 text-accent-foreground sm:px-1.5">
                  {t('summary.notCountedYet')}
                </span>
              </button>
            ) : (
              <span
                title={t('summary.notCountedYet')}
                aria-hidden="true"
                className="shrink-0 rounded-full bg-muted px-1 py-0.5 text-[11px] whitespace-nowrap sm:px-1.5"
                data-testid="row-not-counted"
              >
                {t('summary.notCountedYet')}
              </span>
            )}
            {occurrence.isSkipped ? (
              <span
                className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] whitespace-nowrap"
                aria-hidden="true"
              >
                {t('feed.skipped')}
              </span>
            ) : null}
          </span>
        </span>

        {context.showProfile && profile !== undefined ? (
          <PersonAvatar person={profile} size="sm" className="max-sm:size-6!" />
        ) : null}

        {/*
          Always present, never hover-revealed, and 44x44.
          Swipe is invisible to assistive tech and hover is invisible to a
          keyboard, so a row whose only actions live behind either has no actions
          at all for a large share of users.
        */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="pointer-events-auto relative z-10 size-11 shrink-0 max-sm:-mx-1"
          data-testid="row-more"
          aria-label={t('a11y.rowActions', { name: label })}
          onClick={(event) => onMenu?.(occurrence, event.currentTarget)}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
        <span className="flex shrink-0 flex-col items-end" data-testid="row-amount" aria-hidden="true">
          <Money
            minor={signed}
            currency={context.currency}
            announce={false}
            className={cn('text-[1.0625rem] font-medium', isIncome ? 'text-income' : 'text-foreground')}
          />
        </span>
      </span>
    </div>
  );
});
