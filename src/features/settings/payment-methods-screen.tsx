import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Avatar } from '@/components/avatars/avatar';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { db } from '@/db/db';
import {
  createPaymentMethod,
  deletePaymentMethod,
  setPaymentMethodArchived,
  updatePaymentMethod,
} from '@/db/repos/payment-methods';
import { cardDraftOf, cardFromDraft, EMPTY_CARD_DRAFT, type CardDraft } from '@/domain/card-draft';
import { CardFields } from '@/features/cards/card-fields';
import { methodDisplayName } from '@/i18n/method-name';
import { systemClock } from '@/lib/clock';
import { newId } from '@/lib/id';
import {
  isBuiltinPaymentMethod,
  SHARED_OWNER,
  type PaymentMethod,
  type PaymentMethodType,
  type Profile,
} from '@/types/domain';

/**
 * The payment-method manager.
 *
 * What it stores is a LABEL the user chose and, for a credit card, what the
 * card company shows about it - billing day, fees, interest, the month it
 * expires. Never anything that identifies or charges the card: no number, no
 * code from the back, and that is not a convention anyone has to remember - `gate:pci` fails
 * the build on those field names anywhere in src or e2e, with no escape hatch.
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
  other: 'profiles:method.other',
};

export function PaymentMethodsScreen() {
  const { t } = useTranslation(['common', 'categories', 'profiles']);
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

  const methods = data?.methods ?? [];
  const profiles = data?.profiles ?? [];

  const ownerName = (profileId: string): string =>
    profileId === SHARED_OWNER
      ? t('categories:manage.methodShared')
      : (profiles.find((p) => p.id === profileId)?.name ?? profileId);

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6 pb-24 lg:pb-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('categories:manage.methodsTitle')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('categories:manage.methodsBody')}</p>
      </header>

      {methods.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('categories:manage.methodEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {methods.map((method) => {
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
                  <Avatar avatar={profile.avatar} color={profile.color} size="sm" />
                )}

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{displayName(method)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(TYPE_KEY[method.type] as MethodTypeKey)} · {ownerName(method.profileId)}
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

                {/*
                  Archive stays; rename and delete do not.
                  
                  The same rule the built-in categories follow: someone who
                  never carries cash can put it away, but nobody can leave the
                  install without the one method every profile shares and no
                  screen can recreate.
                */}
                {isBuiltinPaymentMethod(method.id) ? null : (
                  <>
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
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={profiles.length === 0}
        onClick={() => {
          setEditing('new');
        }}
      >
        <Plus className="size-4" aria-hidden="true" />
        {t('categories:manage.methodAdd')}
      </Button>

      <MethodEditor
        target={editing}
        profiles={profiles}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
      />

      <DeleteMethodDialog
        method={deleting}
        others={methods.filter((m) => m.id !== deleting?.id && m.isArchived === 0)}
        count={deleting === undefined ? 0 : (data?.counts.get(deleting.id) ?? 0)}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
      />
    </section>
  );
}

export function MethodEditor({
  target,
  profiles,
  onOpenChange,
  newType = 'credit_card',
}: {
  readonly target: PaymentMethod | 'new' | undefined;
  readonly profiles: readonly Profile[];
  readonly onOpenChange: (open: boolean) => void;
  /** What a new method starts as. */
  readonly newType?: PaymentMethodType;
}) {
  const { t } = useTranslation(['common', 'categories', 'profiles']);
  const isNew = target === 'new';
  const existing = target === 'new' ? undefined : target;

  const [label, setLabel] = useState('');
  const [type, setType] = useState<PaymentMethodType>('credit_card');
  const [owner, setOwner] = useState<string>(SHARED_OWNER);
  const [card, setCard] = useState<CardDraft>(EMPTY_CARD_DRAFT);
  /** Set by a save attempt: the rate error waits until somebody tries. */
  const [attempted, setAttempted] = useState(false);
  const [seeded, setSeeded] = useState<string | undefined>(undefined);

  const labelId = useId();
  const typeId = useId();
  const ownerId = useId();

  // Derived from the target during render, not synchronised in an effect: an
  // effect would paint one frame of the previous method's label.
  const identity = target === undefined ? undefined : isNew ? 'new' : existing?.id;
  if (identity !== seeded) {
    setSeeded(identity);
    setLabel(existing?.label ?? '');
    setType(existing?.type ?? newType);
    setOwner(existing?.profileId ?? profiles[0]?.id ?? SHARED_OWNER);
    setCard(cardDraftOf(existing));
    setAttempted(false);
  }

  const parsedCard = cardFromDraft(card);
  const cardInvalid = type === 'credit_card' && !parsedCard.ok;

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

    try {
      if (isNew) {
        await createPaymentMethod(
          db,
          newId(),
          {
            label,
            type,
            profileId: owner,
            ...(creditAnnualRate === null ? {} : { creditAnnualRate }),
            ...(details === undefined ? {} : { card: details }),
          },
          now,
        );
      } else if (existing !== undefined) {
        await updatePaymentMethod(
          db,
          existing.id,
          { label, type, profileId: owner, creditAnnualRate, card: details ?? null },
          now,
        );
      }
      onOpenChange(false);
    } catch {
      toast.error(t('tx.toastFailed'));
    }
  };

  return (
    <Sheet open={target !== undefined} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isNew ? t('categories:manage.methodNew') : t('categories:manage.methodEdit')}
          </SheetTitle>
        </SheetHeader>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
            if (label.trim() !== '' && !cardInvalid) void save();
          }}
          className="space-y-4 px-4 pb-6"
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
            <CardFields
              key={seeded}
              draft={card}
              onChange={(patch) => {
                setCard((current) => ({ ...current, ...patch }));
              }}
              invalid={attempted && !parsedCard.ok ? parsedCard.invalid : []}
            />
          ) : null}

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

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={label.trim() === ''} className="flex-1">
              {t('action.save')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
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
        selected ? 'border-primary bg-accent' : 'border-border hover:bg-muted'
      }`}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}
