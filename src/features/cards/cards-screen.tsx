import { cn } from 'cn';
import { ChevronDown, CreditCard, Pencil, Plus, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useBaseCurrency, useToday } from '@/app/app-context';
import { usePrime } from '@/app/prime';
import { Money } from '@/components/money';
import { Percent } from '@/components/percent';
import { Button } from '@/components/ui/button';
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
import { ordinalDay } from '@/i18n/ordinal';
import { formatLocalDate, compareLocal, startOfMonth } from '@/lib/dates';
import { SHARED_OWNER, type Occurrence, type PaymentMethod, type Profile } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

import { MethodEditor, OtherMethods } from './method-editor';
import { NetworkLogo } from './network-logo';
import { useCardsData } from './use-cards-data';

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
  const { t } = useTranslation('cards');
  const today = useToday();
  const baseCurrency = useBaseCurrency();
  const data = useCardsData(today, baseCurrency);
  const [editing, setEditing] = useState<PaymentMethod | 'new' | undefined>(undefined);
  // Each card's commitments, worked out once: its panel and the household's total both read them.
  const commitments = useMemo(
    () =>
      new Map(
        (data?.cards ?? []).map((card) => [card.id, cardCommitments(data?.occurrences ?? [], card, today)]),
      ),
    [data, today],
  );

  return (
    <section className="mx-auto max-w-4xl space-y-5 px-4 py-6 pb-24 lg:pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing('new');
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t('add')}
        </Button>
      </header>

      {data === undefined ? null : data.cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <CreditCard className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 font-medium">{t('emptyTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('emptyBody')}</p>
        </div>
      ) : (
        <>
          <HouseholdCommitments cards={data.cards} commitments={commitments} />
          <ul className="grid gap-6 md:grid-cols-2">
            {data.cards.map((card) => (
              <li key={card.id}>
                <CardPanel
                  card={card}
                  owner={data.profiles.get(card.profileId)}
                  occurrences={data.occurrences}
                  commitments={commitments.get(card.id)}
                  today={today}
                  baseCurrency={baseCurrency}
                  onEdit={() => {
                    setEditing(card);
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <OtherMethods />

      <MethodEditor
        target={editing}
        profiles={data === undefined ? [] : [...data.profiles.values()]}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        newType="credit_card"
      />
    </section>
  );
}

/** Issuer tints: a hint of whose card it is, never their artwork. */
const TINTS: Record<string, string> = {
  isracard: 'from-[#1f3a68] to-[#3b6bb0]',
  cal: 'from-[#0f5c56] to-[#2a9083]',
  max: 'from-[#5b1f63] to-[#b03a7a]',
  amex: 'from-[#1d4f7a] to-[#4a8cc4]',
  diners: 'from-[#2b2b2b] to-[#5a5a5a]',
  other: 'from-[#2f3b35] to-[#5b6d63]',
};

function CardPanel({
  card,
  owner,
  occurrences,
  commitments,
  today,
  baseCurrency,
  onEdit,
}: {
  readonly card: PaymentMethod;
  readonly owner: Profile | undefined;
  readonly occurrences: readonly Occurrence[];
  readonly commitments: CardCommitments | undefined;
  readonly today: LocalDate;
  readonly baseCurrency: Currency;
  readonly onEdit: () => void;
}) {
  const { t, i18n } = useTranslation('cards');
  const details = card.card;
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
        className={cn(
          'relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-md',
          TINTS[details?.issuer ?? 'other'],
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-medium opacity-90">
            {details?.issuer === undefined ? t('unknownIssuer') : t(`issuer.${details.issuer}`)}
          </span>
          {details?.network === undefined ? null : (
            <NetworkLogo network={details.network} className="shrink-0" />
          )}
        </div>
        <div>
          {details?.lastDigits === undefined ? null : (
            <p
              dir="ltr"
              className="mb-1 font-mono text-base tracking-widest tabular-nums opacity-90 rtl:text-end"
            >
              •••• {details.lastDigits}
            </p>
          )}
          <h2 id={`card-${card.id}`} className="text-xl font-semibold">
            {card.label}
          </h2>
          <p className="text-sm opacity-85">
            {[
              details?.tier,
              details?.club,
              details?.kind === undefined ? undefined : t(`kind.${details.kind}`),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex items-end justify-between gap-3 text-sm">
          <span className="opacity-90">
            {card.profileId === SHARED_OWNER ? t('shared') : (owner?.name ?? '')}
          </span>
          <span className="flex flex-col items-end">
            {details?.expiresMonth === undefined ? null : (
              <span dir="ltr" className="font-mono tabular-nums">
                {details.expiresMonth.slice(5, 7)}/{details.expiresMonth.slice(2, 4)}
              </span>
            )}
            {day === undefined ? null : (
              <span className="text-xs opacity-85">
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

      <ChargesList card={card} />

      {/* Fee lines exist only in a shekel base (`cardFeeOccurrences`); say nothing otherwise. */}
      {baseCurrency === CARD_CURRENCY ? (
        <FeeStatus card={card} occurrences={occurrences} today={today} />
      ) : null}

      {past.length === 0 && upcoming.length === 0 ? null : (
        <BillList bills={[...upcoming.slice(0, 2).reverse(), ...past]} today={today} />
      )}

      <Button type="button" variant="outline" size="sm" onClick={onEdit}>
        <Pencil className="size-4" aria-hidden="true" />
        {t('edit.open')}
      </Button>
    </article>
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
function CardCommitmentsBox({ commitments }: { readonly commitments: CardCommitments }) {
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
          style={{ width: `${String(Math.round(share * 1000) / 10)}%` }}
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

/** What the card charges, as its company quotes it. */
function ChargesList({ card }: { readonly card: PaymentMethod }) {
  const { t } = useTranslation('cards');
  const prime = usePrime();
  const details = card.card;
  const credit = cardCreditRate(card, prime.primeRate);
  const late = details?.lateRate === undefined ? undefined : rateOf(details.lateRate, prime.primeRate);
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
      value: <RateValue margin={details?.creditPrimeMargin} rate={credit} />,
    });
  }
  if (late !== undefined && details?.lateRate !== undefined) {
    rows.push({
      key: 'late',
      label: t('lateRate'),
      value: (
        <RateValue
          margin={details.lateRate.basis === 'prime' ? details.lateRate.margin : undefined}
          rate={late}
        />
      ),
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
                width: `${String(Math.round(earnedShare(fee.spentMinor, fee.discount.minSpendMinor) * 1000) / 10)}%`,
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
