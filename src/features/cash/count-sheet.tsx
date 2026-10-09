import { useId, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { AmountInput } from '@/components/amount-input';
import { Money } from '@/components/money';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import {
  EditorPanel,
  EditorPanelContent,
  EditorPanelDescription,
  EditorPanelHeader,
  EditorPanelTitle,
} from '@/components/ui/editor-panel';
import { Label } from '@/components/ui/label';
import { db } from '@/db/db';
import type { UndoableAction } from '@/db/occurrence-actions';
import { InvalidCashMoveError, recordCount, type CountOutcome } from '@/db/repos/cash-moves';
import { systemClock } from '@/lib/clock';
import { newId } from '@/lib/id';
import type { Profile } from '@/types/domain';
import type { Currency, LocalDate, Minor } from '@/types/money';

import { FieldProblem } from './move-sheet';

type CountProps = {
  readonly people: readonly { readonly profile: Profile; readonly onHandMinor: Minor }[];
  readonly defaultProfileId: string;
  readonly currency: Currency;
  readonly today: LocalDate;
  readonly onDone: (message: string, undoable: UndoableAction) => void;
};

const MESSAGE = {
  found: 'cash.countFound',
  missing: 'cash.countLost',
  matched: 'cash.countMatched',
} as const satisfies Record<CountOutcome, string>;

/**
 * "Count my cash": what is in the wallet now, against what is recorded for
 * that person - the difference said as it is typed, and saved as cash found,
 * cash missing, or a count that matched.
 */
export function CountSheet({
  open,
  onOpenChange,
  ...props
}: CountProps & { readonly open: boolean; readonly onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <EditorPanel open={open} onOpenChange={onOpenChange}>
      <EditorPanelContent aria-labelledby={titleId}>
        <EditorPanelHeader>
          <EditorPanelTitle id={titleId}>{t('cash.menu.count')}</EditorPanelTitle>
          <EditorPanelDescription>{t('cash.countBody')}</EditorPanelDescription>
        </EditorPanelHeader>
        {open ? <CountForm {...props} /> : null}
      </EditorPanelContent>
    </EditorPanel>
  );
}

function CountForm({ people, defaultProfileId, currency, today, onDone }: CountProps) {
  const { t } = useTranslation();
  const [profileId, setProfileId] = useState(defaultProfileId);
  const [counted, setCounted] = useState<Minor | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  // Set before the first await: two submits in one tick would otherwise write two counts.
  const writing = useRef(false);
  const personId = useId();
  const amountId = useId();
  const amountErrorId = useId();

  // This person's own figure, never the pot's.
  const recorded = people.find((p) => p.profile.id === profileId)?.onHandMinor ?? 0;
  const difference = counted === undefined ? undefined : counted - recorded;

  return (
    <form
      className="space-y-4 px-4 pb-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (counted === undefined || writing.current) return;
        writing.current = true;
        setBusy(true);
        void recordCount(db, {
          profileId,
          countedMinor: counted,
          currency,
          today,
          now: systemClock.nowIso(),
          newId,
        })
          .then(({ undoable, outcome }) => {
            onDone(t(MESSAGE[outcome]), undoable);
          })
          .catch((error: unknown) => {
            // One write each way: a failure changed nothing.
            if (error instanceof InvalidCashMoveError && error.reason === 'amount') {
              setProblem(t('tx.errAmountInvalid'));
            } else {
              toast.error(t('tx.toastFailed'));
            }
          })
          .finally(() => {
            writing.current = false;
            setBusy(false);
          });
      }}
    >
      {people.length > 1 ? (
        <div className="space-y-1.5">
          <Label id={personId}>{t('tx.profile')}</Label>
          <Segmented
            value={profileId}
            labelledBy={personId}
            options={people.map((p) => ({ value: p.profile.id, label: p.profile.name }))}
            onChange={setProfileId}
          />
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">
        <Trans
          i18nKey="cash.countRecorded"
          components={{ amount: <Money minor={recorded} currency={currency} /> }}
        />
      </p>

      <div className="space-y-1.5">
        <Label htmlFor={amountId}>{t('cash.countQuestion')}</Label>
        <AmountInput
          id={amountId}
          currency={currency}
          value={counted}
          onChange={(next) => {
            setCounted(next);
            setProblem(undefined);
          }}
          aria-invalid={problem !== undefined}
          {...(problem === undefined ? {} : { 'aria-describedby': amountErrorId })}
        />
        <FieldProblem id={amountErrorId} text={problem} />
      </div>

      <p className="min-h-5 text-sm font-medium" aria-live="polite" data-testid="count-difference">
        {difference === undefined ? null : difference === 0 ? (
          t('cash.countMatches')
        ) : (
          <Trans
            i18nKey={difference > 0 ? 'cash.countMore' : 'cash.countMissing'}
            components={{ amount: <Money minor={Math.abs(difference)} currency={currency} /> }}
          />
        )}
      </p>

      <Button type="submit" className="h-11 w-full" disabled={counted === undefined || busy}>
        {t('action.save')}
      </Button>
    </form>
  );
}
