import { cn } from 'cn';
import { Landmark, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useBaseCurrency, useSettings, useToday } from '@/app/app-context';
import { ROUTES } from '@/app/routes';
import { ScreenHead } from '@/app/screen-head';
import { Money } from '@/components/money';
import { PersonAvatar } from '@/components/person-avatar';
import { Button } from '@/components/ui/button';
import { Mark } from '@/components/ui/mark';
import { Sheet } from '@/components/ui/sheet-surface';
import { TitlePair } from '@/components/ui/title-pair';
import { db } from '@/db/db';
import { writeSettings } from '@/db/repos/settings';
import { bankByCode, bankName } from '@/domain/banks';
import { CARD_CURRENCY, cardBills } from '@/domain/cards';
import { monthParam, PARAM } from '@/domain/feed-filters';
import { methodKey } from '@/domain/money-key';
import { methodOwnedBy } from '@/domain/tx-options';
import { MethodEditor } from '@/features/cards/method-editor';
import { UnfinishedNotice } from '@/features/cards/unfinished-notice';
import { useBranch } from '@/features/cards/use-branch';
import { useCardsData } from '@/features/cards/use-cards-data';
import { ProfileSwitcher } from '@/features/feed/profile-switcher';
import { categoryDisplayName } from '@/i18n/category-name';
import { systemClock } from '@/lib/clock';
import { compareLocal, formatLocalDate } from '@/lib/dates';
import {
  ALL_PROFILES,
  type Category,
  type Occurrence,
  type PaymentMethod,
  type Profile,
} from '@/types/domain';
import type { LocalDate } from '@/types/money';

import { useIncoming } from './use-incoming';

/** A row on a bank's sheet: a 2px line in the sheet's own tint above it. */
const LINE = 'border-t-2 border-current/25';

/**
 * The household's bank accounts: which bank and branch, whose, how far below
 * zero each may go, and the card bills each one pays.
 *
 * Its own page, reached from the account menu with the other things the
 * household is set up with - not a tab: an account is set up once and looked
 * at now and then, while the cards' bills are looked at every week.
 *
 * Each account is a sheet in its bank's colour (§5.4): the colour is the
 * bank, so there is no logo, and the money coming in sits in the box.
 */
export function BankAccountsScreen() {
  const { t } = useTranslation('cards');
  const today = useToday();
  const baseCurrency = useBaseCurrency();
  const data = useCardsData(today, baseCurrency);
  const incoming = useIncoming(today);
  const [editing, setEditing] = useState<PaymentMethod | 'new' | undefined>(undefined);
  // Whose accounts: the same choice as the feed's. A joint account is everyone's who holds it.
  const whose = useSettings().activeProfileId;
  const accounts = (data?.accounts ?? []).filter(
    (account) => whose === ALL_PROFILES || methodOwnedBy(account, whose),
  );

  return (
    <section className="px-3 pb-24 lg:px-0 lg:pb-8">
      <ScreenHead
        title={t('accounts.title')}
        subtitle={t('accounts.body')}
        actions={
          <>
            {data === undefined ? null : (
              <ProfileSwitcher
                profiles={[...data.profiles.values()]}
                active={whose}
                onSelect={(profileId) => {
                  void writeSettings(db, { activeProfileId: profileId }, systemClock.nowIso());
                }}
              />
            )}
            <Button
              type="button"
              variant="pill-solid"
              onClick={() => {
                setEditing('new');
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t('accounts.add')}
            </Button>
          </>
        }
      />
      <div className="mbs-sheet grid gap-sheet">
        <UnfinishedNotice kind="account" />

        {data === undefined ? null : accounts.length === 0 ? (
          <Sheet kind="paper" className="grid justify-items-center gap-3 text-center">
            <Landmark className="size-8" aria-hidden="true" />
            <p className="font-light">{t('accounts.empty')}</p>
          </Sheet>
        ) : (
          <div className="grid gap-sheet @board/main:grid-cols-2 @wide/main:grid-cols-3 @vast/main:grid-cols-4">
            {accounts.map((account) => (
              <AccountPanel
                key={account.id}
                account={account}
                // An archived card still owed on is still debited from the account.
                cards={[...data.cards, ...data.owing].filter((card) => card.card?.accountId === account.id)}
                occurrences={data.occurrences}
                profiles={data.profiles}
                incoming={incoming?.next.get(account.id)}
                categories={incoming?.categories}
                onEdit={() => {
                  setEditing(account);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <MethodEditor
        target={editing}
        profiles={data === undefined ? [] : [...data.profiles.values()]}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        newType="bank_account"
      />
    </section>
  );
}

/** "12-689-123456", the way a cheque and a bank statement print it. */
function printedAccount(bank: string, branch: string | undefined, number: string | undefined): string {
  return [bank.padStart(2, '0'), branch, number].filter((part) => part !== undefined).join('-');
}

function AccountPanel({
  account,
  cards,
  occurrences,
  profiles,
  incoming,
  categories,
  onEdit,
}: {
  readonly account: PaymentMethod;
  readonly cards: readonly PaymentMethod[];
  readonly occurrences: readonly Occurrence[];
  readonly profiles: ReadonlyMap<string, Profile>;
  /** The next income expected into this account, if any. */
  readonly incoming: Occurrence | undefined;
  readonly categories: ReadonlyMap<string, Category> | undefined;
  readonly onEdit: () => void;
}) {
  const { t, i18n } = useTranslation('cards');
  const today = useToday();
  const details = account.account;
  const bank = bankByCode(details?.bank ?? '');
  const holders = (
    details?.holding === 'personal' || details?.holders === undefined ? [account.profileId] : details.holders
  )
    .map((id) => profiles.get(id))
    .filter((profile) => profile !== undefined);
  const titleId = `account-${account.id}`;

  return (
    <Sheet
      as="article"
      kind="money"
      moneyKey={methodKey(account)}
      data-slot="bank-account-sheet"
      aria-labelledby={titleId}
      className="grid min-w-0 content-start gap-3"
    >
      <div className="min-w-0">
        <TitlePair as="h2" size="sheet" title={account.label} id={titleId} className="truncate" />
        {bank === undefined ? null : (
          <p className="truncate font-light">
            {bankName(bank, i18n.language)}
            {bank.ar === undefined ? null : (
              <>
                {' · '}
                <span lang="ar" dir="rtl">
                  {bank.ar}
                </span>
              </>
            )}
          </p>
        )}
        {details === undefined ? null : (
          <>
            <p dir="ltr" className="text-start font-mono font-light tabular-nums">
              {printedAccount(details.bank, details.branch, details.number)}
            </p>
            {details.branch === undefined ? null : <BranchName bank={details.bank} branch={details.branch} />}
          </>
        )}
      </div>

      <dl className="grid gap-3">
        <div>
          <dt className="text-xs font-light">
            {t('accounts.holders')}
            {details === undefined ? '' : ` · ${t(`accounts.holding.${details.holding}`)}`}
          </dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {holders.map((profile) => (
              <span key={profile.id} className="inline-flex items-center gap-1.5">
                <PersonAvatar person={profile} size="sm" />
                {profile.name}
              </span>
            ))}
            {details?.otherHolders === undefined ? null : <span>{details.otherHolders}</span>}
          </dd>
        </div>
        {details?.overdraftLimitMinor === undefined ? null : (
          <div className={cn(LINE, 'pt-2')}>
            <dt className="text-xs font-light">{t('accounts.overdraft')}</dt>
            <dd className="mt-1 font-semibold">
              <Money minor={details.overdraftLimitMinor} currency={CARD_CURRENCY} />
            </dd>
          </div>
        )}
      </dl>

      {cards.length === 0 ? null : (
        <div className="space-y-1.5">
          <p className="text-xs font-light">{t('accounts.cardsFrom')}</p>
          <ul>
            {cards.map((card) => (
              <CardCharge key={card.id} card={card} occurrences={occurrences} today={today} />
            ))}
          </ul>
        </div>
      )}

      {incoming === undefined ? null : (
        <IncomingLine accountId={account.id} incoming={incoming} categories={categories} />
      )}

      <div>
        <Button type="button" variant="pill" onClick={onEdit}>
          <Pencil className="size-4" aria-hidden="true" />
          {t('accounts.edit.open')}
        </Button>
      </div>
    </Sheet>
  );
}

/** The branch's name from the Bank of Israel's list; nothing while it is looked up or when it is not listed. */
function BranchName({ bank, branch }: { readonly bank: string; readonly branch: string }) {
  const { t, i18n } = useTranslation('cards');
  const today = useToday();
  const state = useBranch(bank, branch, i18n.language, today);
  const label = t('accounts.branch', { branch });
  if (state.status !== 'found') return <p className="font-light">{label}</p>;
  const found = state.branch;
  const date = (value: LocalDate) => formatLocalDate(value, i18n.language, { dateStyle: 'medium' });
  return (
    <>
      <p className="font-light">
        {label} · {found.name}, {found.city}
      </p>
      {found.closed === undefined ? null : (
        <p className="text-xs font-semibold">
          {found.mergedInto === undefined
            ? t('accounts.branchClosed', { date: date(found.closed) })
            : t('accounts.branchMerged', { date: date(found.closed), into: found.mergedInto.branch })}
        </p>
      )}
    </>
  );
}

/** A card paid from the account, and its next bill: what will leave the account, and when. */
function CardCharge({
  card,
  occurrences,
  today,
}: {
  readonly card: PaymentMethod;
  readonly occurrences: readonly Occurrence[];
  readonly today: LocalDate;
}) {
  const { t, i18n } = useTranslation('cards');
  const next = cardBills(occurrences, card)
    .filter((bill) => compareLocal(bill.chargeDate, today) >= 0)
    .at(-1);
  return (
    <li className={cn(LINE, 'flex items-center justify-between gap-3 py-2 text-sm')}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate">{card.label}</span>
        {/* Why a closed card is here: it is still being paid off from the account. */}
        {card.isArchived === 1 ? (
          <span className="shrink-0 rounded-full border-2 border-current px-2 text-xs font-light">
            {t('accounts.archivedCard')}
          </span>
        ) : null}
      </span>
      {next === undefined ? (
        <span className="font-light">{t('accounts.noCharge')}</span>
      ) : (
        <span className="flex shrink-0 items-baseline gap-1.5">
          <Money minor={next.totalMinor} currency={CARD_CURRENCY} className="font-semibold" />
          <span className="text-xs font-light">
            {t('accounts.chargeOn', {
              date: formatLocalDate(next.chargeDate, i18n.language, { day: 'numeric', month: 'short' }),
            })}
          </span>
        </span>
      )}
    </li>
  );
}

/**
 * The next income into the account: "Salary · 10 Nov", its figure in the
 * box, linking to the feed of that account's income in that month.
 */
function IncomingLine({
  accountId,
  incoming,
  categories,
}: {
  readonly accountId: string;
  readonly incoming: Occurrence;
  readonly categories: ReadonlyMap<string, Category> | undefined;
}) {
  const { t, i18n } = useTranslation(['cards', 'categories']);
  const baseCurrency = useBaseCurrency();
  const category = categories?.get(incoming.categoryId);
  const name = incoming.note ?? (category === undefined ? '' : categoryDisplayName(category, t));
  const date = formatLocalDate(incoming.date, i18n.language, { day: 'numeric', month: 'short' });
  const params = new URLSearchParams({
    [PARAM.kind]: 'income',
    [PARAM.methods]: accountId,
    [PARAM.month]: monthParam(incoming.date),
  });

  return (
    <div className={cn(LINE, 'space-y-1.5 pt-2')}>
      <p className="text-xs font-light">{t('accounts.incoming')}</p>
      <Link
        to={`${ROUTES.feed}?${params.toString()}`}
        className="flex min-h-11 items-center justify-between gap-3 rounded-tile text-sm focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring"
      >
        <span className="min-w-0 truncate">{[name, date].filter((part) => part !== '').join(' · ')}</span>
        <Mark className="shrink-0">
          <Money minor={incoming.money.baseAmountMinor} currency={baseCurrency} />
        </Mark>
      </Link>
    </div>
  );
}
