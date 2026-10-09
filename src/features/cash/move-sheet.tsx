import { Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { AmountInput } from '@/components/amount-input';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { db } from '@/db/db';
import type { UndoableAction } from '@/db/occurrence-actions';
import {
  addCashMove,
  CASH_NOTE_MAX,
  deleteCashMove,
  editCashMove,
  InvalidCashMoveError,
  type CashMoveDraft,
} from '@/db/repos/cash-moves';
import { destinationsFor } from '@/domain/income-destination';
import { methodOwnedBy } from '@/domain/tx-options';
import { DateField } from '@/features/transaction/date-field';
import { PickerField } from '@/features/transaction/picker-field';
import { systemClock } from '@/lib/clock';
import { compareLocal, formatLocalDate } from '@/lib/dates';
import { newId } from '@/lib/id';
import { CASH_METHOD_ID, type CashMove, type PaymentMethod, type Profile } from '@/types/domain';
import type { Currency, LocalDate, Minor } from '@/types/money';

export type MoveTarget =
  | { readonly mode: 'add'; readonly kind: 'withdraw' | 'deposit' }
  | { readonly mode: 'edit'; readonly move: CashMove };

type EditableKind = 'start' | 'withdraw' | 'deposit';

type SheetProps = {
  readonly people: readonly Profile[];
  /** Each person's start date: a withdrawal or deposit before it would count for nothing. */
  readonly since: ReadonlyMap<string, LocalDate>;
  /** Each person's earliest withdrawal or deposit: their start cannot move past it. */
  readonly firstMoves: ReadonlyMap<string, LocalDate>;
  readonly defaultProfileId: string;
  readonly methods: readonly PaymentMethod[];
  readonly currency: Currency;
  readonly today: LocalDate;
  readonly onDone: (message: string, undoable: UndoableAction) => void;
};

/** What a save found wrong, said at the field it is about. */
type Problems = {
  readonly amount?: string;
  readonly date?: string;
  readonly note?: string;
};

function kindOf(target: MoveTarget): EditableKind {
  if (target.mode === 'add') return target.kind;
  return target.move.kind === 'deposit' || target.move.kind === 'start' ? target.move.kind : 'withdraw';
}

/**
 * A withdrawal, a deposit, or the amount someone started with: its amount,
 * day, person and bank account (a label only; neither for the start) and a note.
 * Save, edit and delete each come back with Undo.
 */
export function CashMoveSheet({
  target,
  onOpenChange,
  ...props
}: SheetProps & {
  readonly target: MoveTarget | undefined;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const kind = target === undefined ? 'withdraw' : kindOf(target);
  const title =
    kind === 'start'
      ? t('cash.move.start')
      : kind === 'deposit'
        ? t('cash.menu.deposit')
        : t('cash.menu.withdraw');
  const body =
    kind === 'start'
      ? t('cash.sheet.startBody')
      : kind === 'deposit'
        ? t('cash.sheet.depositBody')
        : t('cash.sheet.withdrawBody');

  return (
    <Sheet open={target !== undefined} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto" aria-labelledby={titleId}>
        <SheetHeader>
          <SheetTitle id={titleId}>{title}</SheetTitle>
          <SheetDescription>{body}</SheetDescription>
        </SheetHeader>
        {target === undefined ? null : (
          <MoveForm
            key={target.mode === 'edit' ? target.move.id : `new-${target.kind}`}
            editing={target.mode === 'edit' ? target.move : undefined}
            kind={kind}
            {...props}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function MoveForm({
  editing,
  kind,
  people,
  since,
  firstMoves,
  defaultProfileId,
  methods,
  currency,
  today,
  onDone,
}: SheetProps & { readonly editing: CashMove | undefined; readonly kind: EditableKind }) {
  const { t, i18n } = useTranslation();
  const [amount, setAmount] = useState<Minor | undefined>(editing?.amountMinor);
  const [date, setDate] = useState<LocalDate>(editing?.date ?? today);
  const [profileId, setProfileId] = useState(editing?.profileId ?? defaultProfileId);
  const [accountId, setAccountId] = useState(editing?.accountId ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Problems>({});
  // Set before the first await: a double tap lands before `busy` re-renders.
  const writing = useRef(false);
  const amountId = useId();
  const amountErrorId = useId();
  const dateId = useId();
  const dateErrorId = useId();
  const personId = useId();
  const accountLabelId = useId();
  const noteId = useId();
  const noteErrorId = useId();

  // The person's accounts and the joint ones they hold; the one already on the move stays.
  const accounts = destinationsFor(methods, profileId, accountId).filter((m) => m.id !== CASH_METHOD_ID);
  // A withdrawal or deposit counts only from the person's start to today:
  // outside that it would be saved and then vanish from the figure and the list.
  // The start itself is on or before today, and on or before the person's
  // first withdrawal or deposit, which would vanish the same way.
  const from = kind === 'start' ? undefined : since.get(profileId);
  const firstMove = kind === 'start' ? firstMoves.get(profileId) : undefined;
  const to = firstMove !== undefined && compareLocal(firstMove, today) < 0 ? firstMove : today;
  const formatted = (day: LocalDate) => formatLocalDate(day, i18n.language, { dateStyle: 'medium' });
  const outOfRange =
    compareLocal(date, today) > 0
      ? t('cash.sheet.dateFuture')
      : firstMove !== undefined && compareLocal(date, firstMove) > 0
        ? t('cash.sheet.dateAfterFirstMove', { date: formatted(firstMove) })
        : from !== undefined && compareLocal(date, from) < 0
          ? t('cash.sheet.dateBeforeStart', { date: formatted(from) })
          : undefined;
  const dateProblem = outOfRange ?? problems.date;
  const valid =
    amount !== undefined &&
    Number.isSafeInteger(amount) &&
    (kind === 'start' ? amount >= 0 : amount > 0) &&
    outOfRange === undefined;

  const draft = (): CashMoveDraft => ({
    profileId,
    kind,
    amountMinor: amount ?? 0,
    date,
    ...(kind === 'start' || accountId === '' ? {} : { accountId }),
    ...(note.trim() === '' ? {} : { note }),
  });

  /** The repo's refusal, said at its field; anything else is the generic toast. */
  const problemOf = (error: unknown): Problems | undefined => {
    if (error instanceof InvalidCashMoveError) {
      switch (error.reason) {
        case 'amount':
          return { amount: t('tx.errAmountInvalid') };
        case 'date':
          return { date: t('tx.errInvalidDate') };
        case 'note':
          return { note: t('tx.errNoteTooLong', { count: CASH_NOTE_MAX }) };
        default:
          return undefined;
      }
    }
    return undefined;
  };

  const run = async (write: () => Promise<UndoableAction>, message: string): Promise<void> => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    try {
      onDone(message, await write());
    } catch (error) {
      // One Dexie transaction: a failure changed nothing.
      const found = problemOf(error);
      if (found === undefined) toast.error(t('tx.toastFailed'));
      else setProblems(found);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  };

  const describedBy = (shown: string | undefined, id: string) =>
    shown === undefined ? {} : { 'aria-describedby': id };

  return (
    <form
      className="space-y-4 px-4 pb-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        const now = systemClock.nowIso();
        void run(
          () =>
            editing === undefined
              ? addCashMove(db, newId(), draft(), now)
              : editCashMove(db, editing.id, draft(), now),
          t('cash.saved'),
        );
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={amountId}>{t('tx.amount')}</Label>
        <AmountInput
          id={amountId}
          currency={currency}
          value={amount}
          onChange={(next) => {
            setAmount(next);
            setProblems(({ amount: _amount, ...rest }) => rest);
          }}
          aria-invalid={problems.amount !== undefined}
          {...describedBy(problems.amount, amountErrorId)}
        />
        <FieldProblem id={amountErrorId} text={problems.amount} />
      </div>

      <div className="space-y-1.5">
        <Label id={dateId}>{t('tx.date')}</Label>
        <DateField
          value={date}
          onChange={(next) => {
            setDate(next);
            setProblems(({ date: _date, ...rest }) => rest);
          }}
          labelledBy={dateId}
          invalid={dateProblem !== undefined}
          {...(dateProblem === undefined ? {} : { describedBy: dateErrorId })}
          {...(from === undefined ? {} : { min: from })}
          max={to}
        />
        <FieldProblem id={dateErrorId} text={dateProblem} />
      </div>

      {/* A start stays with its person: everyone else listed already has one. */}
      {kind !== 'start' && people.length > 1 ? (
        <div className="space-y-1.5">
          <Label id={personId}>{t('tx.profile')}</Label>
          <Segmented
            value={profileId}
            labelledBy={personId}
            options={people.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(next) => {
              setProfileId(next);
              // An account the new person does not hold is let go, as the payment picker does.
              const account = methods.find((m) => m.id === accountId);
              if (account !== undefined && !methodOwnedBy(account, next)) setAccountId('');
            }}
          />
        </div>
      ) : null}

      {kind === 'start' ? null : (
        <div className="space-y-1.5">
          <Label id={accountLabelId}>{t('cash.account')}</Label>
          <PickerField
            value={accountId}
            onChange={setAccountId}
            options={[
              ...accounts.map((m) => ({ id: m.id, label: m.label })),
              { id: '', label: t('tx.paymentMethodNone') },
            ]}
            labelledBy={accountLabelId}
            placeholder={t('tx.paymentMethodNone')}
            searchPlaceholder={t('cash.account')}
            emptyText={t('tx.destinationEmpty')}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={noteId}>{t('cash.note')}</Label>
        <Input
          id={noteId}
          className="h-11"
          value={note}
          autoComplete="off"
          aria-invalid={problems.note !== undefined}
          {...describedBy(problems.note, noteErrorId)}
          onChange={(event) => {
            setNote(event.target.value);
            setProblems(({ note: _note, ...rest }) => rest);
          }}
        />
        <FieldProblem id={noteErrorId} text={problems.note} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="h-11 flex-1" disabled={!valid || busy}>
          {t('action.save')}
        </Button>
        {editing === undefined ? null : (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={busy}
            onClick={() => {
              void run(() => deleteCashMove(db, editing.id, systemClock.nowIso()), t('tx.toastDeleted'));
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {t('action.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}

/** A field's problem, under it, read out as it appears. */
export function FieldProblem({ id, text }: { readonly id: string; readonly text: string | undefined }) {
  return text === undefined ? null : (
    <p id={id} role="alert" className="text-xs text-destructive">
      {text}
    </p>
  );
}
