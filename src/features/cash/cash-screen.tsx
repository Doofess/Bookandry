import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useAccount } from '@/app/account';
import { useSettings, useToday } from '@/app/app-context';
import { ScreenPanel, ScreenTitle } from '@/app/screen-panel';
import { PanelSheet } from '@/components/brand-panel';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { db } from '@/db/db';
import type { UndoableAction } from '@/db/occurrence-actions';
import { addCashMove, deleteCashMove, InvalidCashMoveError } from '@/db/repos/cash-moves';
import { writeSettings } from '@/db/repos/settings';
import type { CashSummary } from '@/domain/cash';
import { ProfileSwitcher } from '@/features/feed/profile-switcher';
import { useFeedLookups } from '@/features/feed/use-feed-data';
import { offerUndo } from '@/features/feed/use-row-actions';
import { TransactionSheet } from '@/features/transaction/transaction-sheet';
import { useIncomeHistory } from '@/features/transaction/use-income-history';
import { useTransactionSheet } from '@/features/transaction/use-transaction-sheet';
import { systemClock } from '@/lib/clock';
import { formatLocalDate } from '@/lib/dates';
import { newId } from '@/lib/id';
import { ALL_PROFILES, type CashMove, type Profile } from '@/types/domain';
import type { Currency, IsoInstant, LocalDate, Minor } from '@/types/money';

import { CashActivityList } from './activity-list';
import { CashAddMenu } from './cash-add-menu';
import { CashFigure } from './cash-figure';
import { CountSheet } from './count-sheet';
import { CashMoveSheet, type MoveTarget } from './move-sheet';
import { CashSetupCard, type SetupProblem } from './setup-card';
import { useCashData, type TwoStarts } from './use-cash-data';

const NO_MOVES: ReadonlyMap<string, LocalDate> = new Map();

/**
 * The cash tab: how much of the balance is cash right now.
 *
 * The balance on the feed stays "all my money"; this is the part of it in the
 * wallet. Whose cash follows the same choice as the feed's.
 */
export function CashScreen() {
  const { t } = useTranslation();
  const today = useToday();
  const settings = useSettings();
  const whose = settings.activeProfileId;
  const currency = settings.defaultCurrency;
  const lookups = useFeedLookups();
  const data = useCashData(whose, today);
  const sheet = useTransactionSheet();
  const incomeHistory = useIncomeHistory(today);

  const profiles = useMemo(() => lookups?.profiles ?? [], [lookups]);
  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const pending = (data?.summary.notSetUp ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is Profile => p !== undefined);
  const setUp = data !== undefined && data.summary.people.length > 0;
  const everyone = whose === ALL_PROFILES;
  const account = useAccount();
  const me = account.status === 'signed_in' ? account.user.id : undefined;
  const [moveTarget, setMoveTarget] = useState<MoveTarget | undefined>(undefined);
  const [counting, setCounting] = useState(false);

  // Whose cash a sheet starts on: the person in view, else this account's own, else the first who set up.
  const figures = (data?.summary.people ?? []).flatMap((p) => {
    const profile = byId.get(p.profileId);
    return profile === undefined ? [] : [{ profile, onHandMinor: p.onHandMinor }];
  });
  const ids = figures.map((p) => p.profile.id);
  const since = new Map((data?.summary.people ?? []).map((p) => [p.profileId, p.since]));
  const defaultPerson = ids.includes(whose)
    ? whose
    : me !== undefined && ids.includes(me)
      ? me
      : (ids[0] ?? '');
  const done = (message: string, undoable: UndoableAction): void => {
    offerUndo(message, undoable, t);
  };

  const start = async (profileId: string, amountMinor: Minor): Promise<SetupProblem | undefined> => {
    try {
      // A start for someone who already has one (a deleted one, say) rewrites
      // that row rather than adding a second: the repo's rule, not this one's.
      const undoable = await addCashMove(
        db,
        newId(),
        { profileId, kind: 'start', amountMinor, date: today },
        systemClock.nowIso(),
      );
      offerUndo(t('cash.setupSaved'), undoable, t);
      return undefined;
    } catch (error) {
      // An amount the repo refuses is the field's to say, where it was typed.
      if (error instanceof InvalidCashMoveError && error.reason === 'amount') return 'amount';
      toast.error(t('tx.toastFailed'));
      return undefined;
    }
  };

  const keepFirst = async (found: TwoStarts): Promise<void> => {
    try {
      offerUndo(t('cash.keptFirst'), await deleteLaterStarts(found, systemClock.nowIso()), t);
    } catch {
      // One transaction: a failure (a start already gone elsewhere) changed nothing.
      toast.error(t('tx.toastFailed'));
    }
  };

  return (
    <section className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8">
      <CashAddMenu
        disabled={profiles.length === 0}
        canMove={figures.length > 0}
        onMove={(kind) => {
          setMoveTarget({ mode: 'add', kind });
        }}
        onCount={() => {
          setCounting(true);
        }}
        onCashExpense={() => {
          sheet.openAdd('expense', { cash: true });
        }}
        onCashIncome={() => {
          sheet.openAdd('income', { cash: true });
        }}
      />
      <ScreenPanel>
        <ScreenTitle>{t('cash.title')}</ScreenTitle>
        {lookups === undefined ? null : (
          <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="cash-pills">
            <ProfileSwitcher
              profiles={profiles}
              active={whose}
              onSelect={(profileId) => {
                void writeSettings(db, { activeProfileId: profileId }, systemClock.nowIso());
              }}
              tone="panel"
            />
          </div>
        )}
        {setUp ? (
          <div className="mt-5">
            <CashFigure summary={data.summary} currency={currency} profiles={byId} />
          </div>
        ) : null}
      </ScreenPanel>

      <PanelSheet className="space-y-5 px-4 pt-6">
        {(data?.twoStarts ?? []).map((found) => {
          const owner = byId.get(found.profileId);
          return owner === undefined ? null : (
            <TwoStartsNotice
              key={found.profileId}
              name={owner.name}
              found={found}
              currency={currency}
              onKeepFirst={() => keepFirst(found)}
            />
          );
        })}
        {pending.map((person) => (
          <CashSetupCard
            key={person.id}
            person={person}
            named={everyone}
            currency={currency}
            onSave={(amountMinor) => start(person.id, amountMinor)}
          />
        ))}
        {setUp && lookups !== undefined ? (
          <>
            <ExpectedLine expected={data.summary.expected} currency={currency} />
            <CashActivityList
              activity={data.activity}
              lookups={lookups}
              showPerson={everyone && profiles.length > 1}
              currency={currency}
              today={today}
              onOpenOccurrence={(occurrence) => {
                sheet.openEdit(occurrence);
              }}
              onOpenMove={(move) => {
                setMoveTarget({ mode: 'edit', move });
              }}
            />
          </>
        ) : null}
      </PanelSheet>

      {lookups === undefined ? null : (
        <TransactionSheet
          target={sheet.target}
          onOpenChange={sheet.setOpen}
          profiles={profiles}
          categories={[...lookups.categories.values()]}
          paymentMethods={[...lookups.paymentMethods.values()]}
          activeProfileId={whose}
          baseCurrency={currency}
          today={today}
          incomeHistory={incomeHistory}
          onSaved={() => {
            sheet.close();
          }}
        />
      )}
      {lookups === undefined ? null : (
        <CashMoveSheet
          target={moveTarget}
          onOpenChange={(open) => {
            if (!open) setMoveTarget(undefined);
          }}
          people={figures.map((p) => p.profile)}
          since={since}
          firstMoves={data?.firstMoves ?? NO_MOVES}
          defaultProfileId={defaultPerson}
          methods={[...lookups.paymentMethods.values()]}
          currency={currency}
          today={today}
          onDone={(message, undoable) => {
            // Closed first, so the toast's Undo is not under the sheet.
            setMoveTarget(undefined);
            done(message, undoable);
          }}
        />
      )}
      <CountSheet
        open={counting}
        onOpenChange={setCounting}
        people={figures}
        defaultProfileId={defaultPerson}
        currency={currency}
        today={today}
        onDone={(message, undoable) => {
          setCounting(false);
          done(message, undoable);
        }}
      />
    </section>
  );
}

/**
 * Delete every start but the earliest, as one undoable step: each delete is
 * the repo's own (and offers its own undo), wrapped so they all happen, and
 * all come back, together - or none do.
 */
async function deleteLaterStarts(found: TwoStarts, now: IsoInstant): Promise<UndoableAction> {
  const undos = await db.transaction('rw', db.cashMoves, async () => {
    const done: UndoableAction[] = [];
    for (const extra of found.extra) done.push(await deleteCashMove(db, extra.id, now));
    return done;
  });
  return {
    undo: (at) =>
      db.transaction('rw', db.cashMoves, async () => {
        for (const step of [...undos].reverse()) await step.undo(at);
      }),
  };
}

/**
 * Two devices set up offline and both synced: one person, more than one
 * starting amount. The figure counts only the first (`compareStarts`), so
 * keeping it does not move the number; this deletes the others, with Undo.
 * Each amount and its date is shown, so it is plain what stays and what goes.
 */
function TwoStartsNotice({
  name,
  found,
  currency,
  onKeepFirst,
}: {
  readonly name: string;
  readonly found: TwoStarts;
  readonly currency: Currency;
  readonly onKeepFirst: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const starts: readonly [CashMove, boolean][] = [
    [found.keep, true],
    ...found.extra.map((m): [CashMove, boolean] => [m, false]),
  ];

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-muted/50 p-4" data-testid="cash-two-starts">
      <p className="text-sm">{t('cash.manyStarts', { name })}</p>
      <ul className="space-y-1 text-sm">
        {starts.map(([m, stays]) => (
          <li key={m.id} className="flex items-center gap-2" data-testid="cash-start-option">
            <Money minor={m.amountMinor} currency={currency} className="font-medium" />
            <span className="text-muted-foreground">
              {formatLocalDate(m.date, i18n.language, { dateStyle: 'medium' })}
            </span>
            <span className="ms-auto rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
              {stays ? t('cash.startStays') : t('cash.startGoes')}
            </span>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onKeepFirst().finally(() => {
            setBusy(false);
          });
        }}
      >
        {t('cash.keepFirst')}
      </Button>
    </div>
  );
}

/** Cash still to come this month: never part of what is on hand. */
function ExpectedLine({
  expected,
  currency,
}: {
  readonly expected: CashSummary['expected'];
  readonly currency: Currency;
}) {
  return (
    <p className="text-sm text-muted-foreground" data-testid="cash-expected">
      <Trans
        i18nKey="cash.expected"
        components={{
          in: <Money minor={expected.inMinor} currency={currency} className="font-medium text-income" />,
          out: (
            <Money minor={expected.outMinor} currency={currency} className="font-medium text-foreground" />
          ),
        }}
      />
    </p>
  );
}
