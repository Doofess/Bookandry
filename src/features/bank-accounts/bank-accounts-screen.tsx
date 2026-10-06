import { Landmark, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBaseCurrency, useSettings, useToday } from '@/app/app-context';
import { Money } from '@/components/money';
import { PersonAvatar } from '@/components/person-avatar';
import { Button } from '@/components/ui/button';
import { db } from '@/db/db';
import { writeSettings } from '@/db/repos/settings';
import { bankByCode, bankName } from '@/domain/banks';
import { CARD_CURRENCY, cardBills } from '@/domain/cards';
import { methodOwnedBy } from '@/domain/tx-options';
import { MethodEditor } from '@/features/cards/method-editor';
import { UnfinishedNotice } from '@/features/cards/unfinished-notice';
import { useBranch } from '@/features/cards/use-branch';
import { useCardsData } from '@/features/cards/use-cards-data';
import { ProfileSwitcher } from '@/features/feed/profile-switcher';
import { systemClock } from '@/lib/clock';
import { compareLocal, formatLocalDate } from '@/lib/dates';
import { ALL_PROFILES, type Occurrence, type PaymentMethod, type Profile } from '@/types/domain';
import type { LocalDate } from '@/types/money';

/**
 * The household's bank accounts: which bank and branch, whose, how far below
 * zero each may go, and the card bills each one pays.
 *
 * Its own page, reached from the account menu with the other things the
 * household is set up with - not a tab: an account is set up once and looked
 * at now and then, while the cards' bills are looked at every week.
 */
export function BankAccountsScreen() {
  const { t } = useTranslation('cards');
  const today = useToday();
  const baseCurrency = useBaseCurrency();
  const data = useCardsData(today, baseCurrency);
  const [editing, setEditing] = useState<PaymentMethod | 'new' | undefined>(undefined);
  // Whose accounts: the same choice as the feed's. A joint account is everyone's who holds it.
  const whose = useSettings().activeProfileId;
  const accounts = (data?.accounts ?? []).filter(
    (account) => whose === ALL_PROFILES || methodOwnedBy(account, whose),
  );

  return (
    <section className="mx-auto max-w-4xl space-y-5 px-4 py-6 pb-24 lg:pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('accounts.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('accounts.body')}</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing('new');
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t('accounts.add')}
        </Button>
      </header>

      <UnfinishedNotice kind="account" />

      {data === undefined ? null : (
        <ProfileSwitcher
          profiles={[...data.profiles.values()]}
          active={whose}
          onSelect={(profileId) => {
            void writeSettings(db, { activeProfileId: profileId }, systemClock.nowIso());
          }}
        />
      )}

      {data === undefined ? null : accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Landmark className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">{t('accounts.empty')}</p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => (
            <li key={account.id}>
              <AccountPanel
                account={account}
                cards={data.cards.filter((card) => card.card?.accountId === account.id)}
                occurrences={data.occurrences}
                profiles={data.profiles}
                onEdit={() => {
                  setEditing(account);
                }}
              />
            </li>
          ))}
        </ul>
      )}

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
  onEdit,
}: {
  readonly account: PaymentMethod;
  readonly cards: readonly PaymentMethod[];
  readonly occurrences: readonly Occurrence[];
  readonly profiles: ReadonlyMap<string, Profile>;
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
    <article aria-labelledby={titleId} className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Landmark className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="truncate font-semibold">
              {account.label}
            </h2>
            {bank === undefined ? null : (
              <p className="truncate text-sm text-muted-foreground">
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
          </div>
        </div>
        {details === undefined ? null : (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
            {t(`accounts.holding.${details.holding}`)}
          </span>
        )}
      </div>

      {details === undefined ? null : (
        <div className="space-y-0.5">
          <p dir="ltr" className="text-start font-mono text-lg tabular-nums">
            {printedAccount(details.bank, details.branch, details.number)}
          </p>
          {details.branch === undefined ? null : <BranchName bank={details.bank} branch={details.branch} />}
        </div>
      )}

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t('accounts.holders')}</dt>
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
          <div>
            <dt className="text-xs text-muted-foreground">{t('accounts.overdraft')}</dt>
            <dd className="mt-1 font-semibold">
              <Money minor={details.overdraftLimitMinor} currency={CARD_CURRENCY} />
            </dd>
          </div>
        )}
      </dl>

      {cards.length === 0 ? null : (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{t('accounts.cardsFrom')}</p>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {cards.map((card) => (
              <CardCharge key={card.id} card={card} occurrences={occurrences} today={today} />
            ))}
          </ul>
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={onEdit}>
        <Pencil className="size-4" aria-hidden="true" />
        {t('accounts.edit.open')}
      </Button>
    </article>
  );
}

/** The branch's name from the Bank of Israel's list; nothing while it is looked up or when it is not listed. */
function BranchName({ bank, branch }: { readonly bank: string; readonly branch: string }) {
  const { t, i18n } = useTranslation('cards');
  const today = useToday();
  const state = useBranch(bank, branch, i18n.language, today);
  const label = t('accounts.branch', { branch });
  if (state.status !== 'found') return <p className="text-sm text-muted-foreground">{label}</p>;
  const found = state.branch;
  const date = (value: LocalDate) => formatLocalDate(value, i18n.language, { dateStyle: 'medium' });
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {label} · {found.name}, {found.city}
      </p>
      {found.closed === undefined ? null : (
        <p className="text-xs text-amber-800 dark:text-amber-300">
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
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="min-w-0 truncate">{card.label}</span>
      {next === undefined ? (
        <span className="text-muted-foreground">{t('accounts.noCharge')}</span>
      ) : (
        <span className="flex shrink-0 items-baseline gap-1.5">
          <Money minor={next.totalMinor} currency={CARD_CURRENCY} className="font-medium" />
          <span className="text-xs text-muted-foreground">
            {t('accounts.chargeOn', {
              date: formatLocalDate(next.chargeDate, i18n.language, { day: 'numeric', month: 'short' }),
            })}
          </span>
        </span>
      )}
    </li>
  );
}
