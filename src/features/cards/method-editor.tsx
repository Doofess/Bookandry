import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArchiveRestore, Banknote, Pencil, Plus, ScrollText, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { PersonAvatar } from '@/components/person-avatar';
import { Segmented } from '@/components/segmented';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  EditorPanel,
  EditorPanelActions,
  EditorPanelContent,
  EditorPanelHeader,
  EditorPanelTitle,
} from '@/components/ui/editor-panel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/db/db';
import {
  createPaymentMethod,
  deletePaymentMethod,
  setPaymentMethodArchived,
  updatePaymentMethod,
} from '@/db/repos/payment-methods';
import { accountDraftOf, accountFromDraft, type AccountDraft } from '@/domain/account-draft';
import { bankByCode, bankName } from '@/domain/banks';
import { cardDraftOf, cardFromDraft, EMPTY_CARD_DRAFT, type CardDraft } from '@/domain/card-draft';
import { methodTypeOf } from '@/domain/tx-options';
import { methodDisplayName } from '@/i18n/method-name';
import { systemClock } from '@/lib/clock';
import { newId } from '@/lib/id';
import {
  CASH_METHOD_ID,
  CHEQUE_METHOD_ID,
  isActiveMethod,
  isBuiltinPaymentMethod,
  SHARED_OWNER,
  type PaymentMethod,
  type PaymentMethodType,
  type Profile,
} from '@/types/domain';

import { AccountFields } from './account-fields';
import { CardColorField } from './card-color-field';
import { CARD_COLORS, type CardColor } from './card-colors';
import { CardFields } from './card-fields';

/**
 * The payment-method editor, and the list of the ways to pay that are not cards.
 *
 * What it stores is a LABEL the user chose and, for a credit card, what the
 * card company shows about it - billing day, fees, interest, the month it
 * expires. Never anything that identifies or charges the card: no number, no
 * code from the back, and that is not a convention anyone has to remember - `gate:pci` fails
 * the build on those field names anywhere in src or e2e, with no escape hatch.
 *
 * Cash and cheques are built in: every install has them, for every profile,
 * and they can be neither deleted nor put away (`isActiveMethod`).
 *
 * Methods belong to a profile or to the household. The shared owner is a real
 * indexable sentinel rather than a null, because IndexedDB cannot index null -
 * a nullable owner would make every shared method invisible to the very index
 * that exists to find it.
 */

/**
 * The types a method can be CREATED as. Cash is deliberately absent.
 *
 * There is exactly one cash, it is seeded with every install, and it is the
 * same cash for everyone on the device - so "add a cash payment method" offers
 * the user a decision with no content, and a second one called "Cash 2" is a
 * mess nothing downstream can tell apart. Older databases and imported files
 * may still contain user-made cash rows; those keep working and keep their
 * type, they simply cannot be created here any more.
 */
const TYPES: readonly PaymentMethodType[] = [
  'credit_card',
  'bank_account',
  'debit_card',
  'bank_transfer',
  'standing_order',
  'digital_wallet',
  'other',
];

/** One arbitrary member of the profiles key union; see `categoryDisplayName`. */
type MethodTypeKey = 'profiles:method.cash';

const TYPE_KEY: Record<PaymentMethodType, string> = {
  cash: 'profiles:method.cash',
  cheque: 'profiles:method.cheque',
  credit_card: 'profiles:method.credit_card',
  debit_card: 'profiles:method.debit_card',
  bank_transfer: 'profiles:method.bank_transfer',
  standing_order: 'profiles:method.standing_order',
  digital_wallet: 'profiles:method.digital_wallet',
  bank_account: 'profiles:method.bank_account',
  other: 'profiles:method.other',
};

/**
 * Every way to pay that is not a credit card or a bank account - debit cards,
 * wallets, transfers, standing orders - under the cards, where the household
 * looks for how it pays. Cash and cheques head the list: built in, there for
 * everyone, and never put away or deleted.
 */
export function OtherMethods() {
  const { t } = useTranslation(['common', 'categories', 'profiles', 'cards']);
  const displayName = (method: PaymentMethod): string => methodDisplayName(method, t);
  const [editing, setEditing] = useState<PaymentMethod | 'new' | undefined>(undefined);
  const [deleting, setDeleting] = useState<PaymentMethod | undefined>(undefined);

  const data = useLiveQuery(async () => {
    const methods = await db.paymentMethods.toArray();
    const profiles = await db.profiles.toArray();
    const transactions = await db.transactions.toArray();

    const counts = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.paymentMethodId === undefined) continue;
      counts.set(tx.paymentMethodId, (counts.get(tx.paymentMethodId) ?? 0) + 1);
    }

    return {
      methods: methods.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id)),
      profiles,
      counts,
    };
  }, []);

  const all = data?.methods ?? [];
  const profiles = data?.profiles ?? [];
  // Cash first, then cheques: the order they are reached for.
  const builtins = BUILTIN_ORDER.flatMap((id) => all.filter((m) => m.id === id));
  const others = all.filter(
    (m) => !isBuiltinPaymentMethod(m.id) && m.type !== 'credit_card' && m.type !== 'bank_account',
  );

  const ownerName = (profileId: string): string =>
    profileId === SHARED_OWNER
      ? t('categories:manage.methodShared')
      : (profiles.find((p) => p.id === profileId)?.name ?? profileId);

  return (
    <section aria-labelledby="other-methods" className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="other-methods" className="text-xl font-semibold tracking-tight">
            {t('cards:other.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('cards:other.body')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={profiles.length === 0}
          onClick={() => {
            setEditing('new');
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t('cards:other.add')}
        </Button>
      </header>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {builtins.map((method) => (
          <li key={method.id} className="flex min-h-14 items-center gap-3 p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {method.id === CASH_METHOD_ID ? (
                <Banknote className="size-4" aria-hidden="true" />
              ) : (
                <ScrollText className="size-4" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{displayName(method)}</span>
              <span className="block text-xs text-muted-foreground">{t('cards:other.builtin')}</span>
            </span>
          </li>
        ))}
        {others.map((method) => {
          const archived = method.isArchived === 1;
          const profile = profiles.find((p) => p.id === method.profileId);
          return (
            <li key={method.id} className={`flex items-center gap-3 p-3 ${archived ? 'opacity-60' : ''}`}>
              {profile === undefined ? (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {/* The household, which has no avatar of its own. */}
                  {t('categories:manage.methodShared').slice(0, 2)}
                </span>
              ) : (
                <PersonAvatar person={profile} size="sm" />
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{displayName(method)}</span>
                <span className="block text-xs text-muted-foreground">
                  {t(TYPE_KEY[methodTypeOf(method)] as MethodTypeKey)} · {ownerName(method.profileId)}
                  {archived ? ` · ${t('categories:manage.archived')}` : ''}
                </span>
              </span>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={`${archived ? t('categories:manage.unarchive') : t('categories:manage.archive')}: ${displayName(method)}`}
                onClick={() => {
                  void setPaymentMethodArchived(db, method.id, !archived, systemClock.nowIso());
                }}
              >
                {archived ? (
                  <ArchiveRestore className="size-4" aria-hidden="true" />
                ) : (
                  <Archive className="size-4" aria-hidden="true" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={`${t('categories:manage.methodEdit')}: ${method.label}`}
                onClick={() => {
                  setEditing(method);
                }}
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 text-destructive"
                aria-label={t('categories:manage.methodDeleteTitle', { name: method.label })}
                onClick={() => {
                  setDeleting(method);
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ul>

      <MethodEditor
        target={editing}
        profiles={profiles}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        newType="debit_card"
      />

      <DeleteMethodDialog
        method={deleting}
        others={all.filter((m) => m.id !== deleting?.id && isActiveMethod(m))}
        count={deleting === undefined ? 0 : (data?.counts.get(deleting.id) ?? 0)}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
      />
    </section>
  );
}

/** The built-in methods, in the order they are listed. */
const BUILTIN_ORDER = [CASH_METHOD_ID, CHEQUE_METHOD_ID];

/** The payment-method editor in a sheet of its own: the Cards and Bank accounts screens'. */
export function MethodEditor({
  target,
  profiles,
  onOpenChange,
  newType = 'credit_card',
  section,
}: {
  readonly target: PaymentMethod | 'new' | undefined;
  readonly profiles: readonly Profile[];
  readonly onOpenChange: (open: boolean) => void;
  /** What a new method starts as. */
  readonly newType?: PaymentMethodType;
  /** Opened from a card's "Interest table": straight to its rates, in view and focused. */
  readonly section?: 'rates' | undefined;
}) {
  const { t } = useTranslation(['common', 'categories']);
  return (
    <EditorPanel open={target !== undefined} onOpenChange={onOpenChange}>
      <EditorPanelContent
        // The rates' wrapper is there as the sheet opens; a linked card's table
        // loads into it in place, so it is focused without waiting for that.
        initialFocus={
          section === 'rates'
            ? () => {
                const rates = document.querySelector<HTMLElement>('[data-section="rates"]');
                rates?.scrollIntoView({ block: 'start' });
                return rates;
              }
            : undefined
        }
      >
        <EditorPanelHeader>
          <EditorPanelTitle>
            {target === 'new' ? t('categories:manage.methodNew') : t('categories:manage.methodEdit')}
          </EditorPanelTitle>
        </EditorPanelHeader>
        <MethodForm
          target={target}
          profiles={profiles}
          newType={newType}
          className="px-5 pb-6 lg:px-7"
          onDone={() => {
            onOpenChange(false);
          }}
        />
      </EditorPanelContent>
    </EditorPanel>
  );
}

/**
 * The editor's form, wherever it is shown: in its own sheet, or inside "Smart
 * import", opened on what a document showed of a card or an account so only
 * the rest is left to fill in.
 */
export function MethodForm({
  target,
  profiles,
  newType = 'credit_card',
  prefill,
  className,
  onDone,
}: {
  readonly target: PaymentMethod | 'new' | undefined;
  readonly profiles: readonly Profile[];
  /** What a new method starts as. */
  readonly newType?: PaymentMethodType;
  /** A new method's starting fields - what a document showed - in place of empty ones. */
  readonly prefill?: PaymentMethod;
  readonly className?: string;
  /** Saved (with what was saved) or cancelled (with nothing). */
  readonly onDone: (saved: PaymentMethod | undefined) => void;
}) {
  const { t, i18n } = useTranslation(['common', 'categories', 'profiles']);
  const isNew = target === 'new';
  const existing = target === 'new' ? undefined : target;
  const source = existing ?? (isNew ? prefill : undefined);

  const [label, setLabel] = useState('');
  const [type, setType] = useState<PaymentMethodType>('credit_card');
  const [owner, setOwner] = useState<string>(SHARED_OWNER);
  const [card, setCard] = useState<CardDraft>(EMPTY_CARD_DRAFT);
  const [color, setColor] = useState<CardColor | ''>('');
  const [account, setAccount] = useState<AccountDraft>(() => accountDraftOf(undefined, SHARED_OWNER));

  // The household's bank accounts, for a card to say which one pays its bill.
  const accounts =
    useLiveQuery(
      async () =>
        (await db.paymentMethods.toArray())
          .filter((m) => m.type === 'bank_account' && m.id !== existing?.id)
          .sort((a, b) => a.label.localeCompare(b.label)),
      [existing?.id],
    ) ?? [];
  /** Set by a save attempt: the rate error waits until somebody tries. */
  const [attempted, setAttempted] = useState(false);
  const [seeded, setSeeded] = useState<string | undefined>(undefined);

  const labelId = useId();
  const typeId = useId();
  const ownerId = useId();

  // Derived from the target during render, not synchronised in an effect: an
  // effect would paint one frame of the previous method's label.
  const identity =
    target === undefined ? undefined : isNew ? `new:${prefill?.id ?? ''}` : (existing?.id ?? '');
  if (identity !== seeded) {
    setSeeded(identity);
    setLabel(source?.label ?? '');
    setType(source?.type ?? newType);
    setOwner(source?.profileId ?? profiles[0]?.id ?? SHARED_OWNER);
    setCard(cardDraftOf(source));
    setColor(CARD_COLORS.find((c) => c.key === source?.color)?.key ?? '');
    setAccount(accountDraftOf(source, profiles[0]?.id ?? SHARED_OWNER));
    setAttempted(false);
  }

  const parsedCard = cardFromDraft(card, {
    previous: existing?.card,
    month: systemClock.today().slice(0, 7),
  });
  const cardInvalid = type === 'credit_card' && !parsedCard.ok;
  const parsedAccount = accountFromDraft(account);
  const accountInvalid = type === 'bank_account' && !parsedAccount.ok;

  /**
   * A new account is named after its bank until it is named otherwise: picking
   * Leumi fills in "Bank Leumi", and picking again follows - but never over a
   * name somebody typed.
   */
  const changeAccount = (patch: Partial<AccountDraft>): void => {
    setAccount((current) => ({ ...current, ...patch }));
    const next = patch.bank === undefined ? undefined : bankByCode(patch.bank);
    if (next === undefined || patch.bank === account.bank) return;
    const previous = bankByCode(account.bank);
    if (label.trim() === '' || (previous !== undefined && label === bankName(previous, i18n.language))) {
      setLabel(bankName(next, i18n.language));
    }
  };

  /** A new card paid from one of the accounts belongs, to begin with, to whoever holds it. */
  const changeCard = (patch: Partial<CardDraft>): void => {
    setCard((current) => ({ ...current, ...patch }));
    const from = accounts.find((a) => a.id === patch.accountId);
    if (isNew && from !== undefined) setOwner(from.profileId);
  };

  const save = async (): Promise<void> => {
    const now = systemClock.nowIso();
    /*
     * Only a card charges קרדיט interest, so only a card keeps a rate.
     *
     * Dropped rather than preserved when the type changes: a rate left on a
     * bank transfer is a number nothing reads, until the day something does.
     * `null` rather than omission, because the patch type uses `undefined` for
     * "leave alone" - omitting it would make the rate unclearable.
     */
    const isCard = type === 'credit_card' && parsedCard.ok;
    const creditAnnualRate = isCard ? parsedCard.creditAnnualRate : null;
    const details = isCard ? parsedCard.card : undefined;
    // An account's owner is its holder, or the household when several hold it.
    const accountDetails = type === 'bank_account' && parsedAccount.ok ? parsedAccount.account : undefined;
    const profileId = type === 'bank_account' && parsedAccount.ok ? parsedAccount.profileId : owner;

    try {
      let saved: PaymentMethod | undefined;
      if (isNew) {
        saved = await createPaymentMethod(
          db,
          newId(),
          {
            label,
            type,
            profileId,
            ...(isCard && color !== '' ? { color } : {}),
            ...(creditAnnualRate === null ? {} : { creditAnnualRate }),
            ...(details === undefined ? {} : { card: details }),
            ...(accountDetails === undefined ? {} : { account: accountDetails }),
          },
          now,
        );
      } else if (existing !== undefined) {
        saved = await updatePaymentMethod(
          db,
          existing.id,
          {
            label,
            type,
            profileId,
            // A card's colour is set here; any other method keeps whatever it had.
            ...(type === 'credit_card' ? { color: color === '' ? null : color } : {}),
            // Only a credit card's details are edited here. Any other card keeps
            // what it has, including keys a later version wrote: writing null
            // would wipe a debit, prepaid or gift card's details (spec 13.8).
            ...(type === 'credit_card' ? { creditAnnualRate, card: details ?? null } : {}),
            ...(type === 'bank_account' ? { account: accountDetails ?? null } : {}),
            // A credit card turned into anything else leaves its rate behind.
            ...(existing.type === 'credit_card' && type !== 'credit_card' ? { creditAnnualRate: null } : {}),
          },
          now,
        );
      }
      onDone(saved);
    } catch {
      toast.error(t('tx.toastFailed'));
    }
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (label.trim() !== '' && !cardInvalid && !accountInvalid) void save();
      }}
      data-slot="editor-panel-body"
      className={cn('space-y-4', className)}
    >
      <div className="space-y-1.5">
        <Label htmlFor={labelId}>{t('categories:manage.methodLabel')}</Label>
        <Input
          id={labelId}
          value={label}
          placeholder={t('categories:manage.methodLabelPlaceholder')}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label id={typeId}>{t('categories:manage.methodType')}</Label>
        <Segmented<PaymentMethodType>
          value={type}
          labelledBy={typeId}
          onChange={setType}
          size="sm"
          options={TYPES.map((option) => ({
            value: option,
            label: t(TYPE_KEY[option] as MethodTypeKey),
          }))}
        />
      </div>

      {/*
            Everything a card company shows about the card - its billing day,
            its fees, its interest - asked once instead of per purchase, and
            never its number. Only for a credit card: nothing else is billed
            monthly or charges קרדיט.
          */}
      {type === 'credit_card' ? (
        <CardColorField value={color} issuer={card.issuer || undefined} onChange={setColor} />
      ) : null}

      {type === 'credit_card' ? (
        <CardFields
          key={seeded}
          draft={card}
          onChange={changeCard}
          invalid={attempted && !parsedCard.ok ? parsedCard.invalid : []}
          accounts={accounts}
        />
      ) : null}

      {/*
            A bank account names its own holders - one person, or several on
            a joint or business account - so it does not ask "belongs to".
          */}
      {type === 'bank_account' ? (
        <AccountFields
          draft={account}
          onChange={changeAccount}
          invalid={attempted && !parsedAccount.ok ? parsedAccount.invalid : []}
          profiles={profiles}
        />
      ) : (
        <div className="space-y-1.5">
          <Label id={ownerId}>{t('categories:manage.methodOwner')}</Label>
          <Segmented
            value={owner}
            labelledBy={ownerId}
            onChange={setOwner}
            size="sm"
            options={[
              ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
              { value: SHARED_OWNER, label: t('categories:manage.methodShared') },
            ]}
          />
          {owner === SHARED_OWNER ? (
            <p className="text-xs text-muted-foreground">{t('categories:manage.methodSharedHint')}</p>
          ) : null}
        </div>
      )}

      <EditorPanelActions>
        <Button
          type="button"
          variant="pill"
          onClick={() => {
            onDone(undefined);
          }}
        >
          {t('action.cancel')}
        </Button>
        <Button type="submit" variant="pill-solid" disabled={label.trim() === ''}>
          {t('action.save')}
        </Button>
      </EditorPanelActions>
    </form>
  );
}

function DeleteMethodDialog({
  method,
  others,
  count,
  onOpenChange,
}: {
  readonly method: PaymentMethod | undefined;
  readonly others: readonly PaymentMethod[];
  readonly count: number;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(['common', 'categories']);
  /** undefined means "clear the field", which is a legitimate outcome here. */
  const [reassignTo, setReassignTo] = useState<string | undefined>(undefined);
  const groupId = useId();

  const remove = async (): Promise<void> => {
    if (method === undefined) return;
    try {
      await deletePaymentMethod(
        db,
        method.id,
        reassignTo === undefined ? {} : { reassignTo },
        systemClock.nowIso(),
      );
      onOpenChange(false);
    } catch {
      toast.error(t('tx.toastFailed'));
    }
  };

  return (
    <AlertDialog
      open={method !== undefined}
      onOpenChange={(open) => {
        if (!open) setReassignTo(undefined);
        onOpenChange(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('categories:manage.methodDeleteTitle', { name: method?.label ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {count > 0 ? t('categories:manage.methodDeleteBody', { count }) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {count === 0 ? null : (
          <div className="space-y-2 px-1">
            <Label id={groupId}>{t('categories:manage.methodDeleteMove')}</Label>
            <div role="radiogroup" aria-labelledby={groupId} className="grid gap-1.5">
              {/*
                "No payment method" is a real option, first.
                Unlike a category, `paymentMethodId` is OPTIONAL on a
                transaction, so clearing it is a valid outcome rather than a
                dangling pointer - the row simply stops claiming it was paid by
                a card that no longer exists.
              */}
              <Option
                selected={reassignTo === undefined}
                label={t('categories:manage.methodDeleteClear')}
                onSelect={() => {
                  setReassignTo(undefined);
                }}
              />
              {others.map((option) => (
                <Option
                  key={option.id}
                  selected={reassignTo === option.id}
                  label={option.label}
                  onSelect={() => {
                    setReassignTo(option.id);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              void remove();
            }}
          >
            {t('action.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Option({
  selected,
  label,
  onSelect,
}: {
  readonly selected: boolean;
  readonly label: string;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-h-11 items-center rounded-xl border px-3 text-start text-sm transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
        selected ? 'border-primary-ink bg-accent' : 'border-border hover:bg-muted'
      }`}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}
