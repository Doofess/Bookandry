import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AmountInput } from '@/components/amount-input';
import { PersonAvatar } from '@/components/person-avatar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet } from '@/components/ui/sheet-surface';
import type { Profile } from '@/types/domain';
import type { Currency, Minor } from '@/types/money';

/** What the screen found wrong with a save, to show on the field: the amount. */
export type SetupProblem = 'amount';

/**
 * A person's first visit: how much cash they have now. Saving writes their
 * `start` move for today; cash rows from before it never count. Each person
 * sets up on their own, so in the "all" view there is one card per person
 * who has not, with their name.
 */
export function CashSetupCard({
  person,
  named,
  currency,
  onSave,
}: {
  readonly person: Profile;
  /** In the "all" view: say whose cash this asks about. */
  readonly named: boolean;
  readonly currency: Currency;
  /** Resolves to a problem to show at the amount, or undefined when saved (or already reported). */
  readonly onSave: (amountMinor: Minor) => Promise<SetupProblem | undefined>;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState<Minor | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  /** What the amount field says is wrong, after a Save: shown under it, until it changes. */
  const [error, setError] = useState<'required' | 'invalid' | undefined>(undefined);
  /** Whether anything is typed: text the field cannot read leaves `amount` empty. */
  const [typed, setTyped] = useState(false);
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();

  return (
    <Sheet kind="paper" aria-labelledby={titleId} className="space-y-3" data-testid="cash-setup">
      {named ? (
        <p className="flex items-center gap-2 text-sm font-medium">
          <PersonAvatar person={person} size="sm" />
          {person.name}
        </p>
      ) : null}
      <h2 id={titleId} className="text-base font-semibold">
        {t('cash.setupTitle')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('cash.setupBody')}</p>
      <form
        noValidate
        onInput={(event) => {
          // Bubbles up from the amount field. Too long a number is not an
          // amount at all, so `amount` stays empty while the field is not.
          if (event.target instanceof HTMLInputElement) setTyped(event.target.value.trim() !== '');
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (saving) return;
          if (amount === undefined) {
            setError(typed ? 'invalid' : 'required');
            return;
          }
          setSaving(true);
          void onSave(amount)
            .then((problem) => {
              if (problem === 'amount') setError('invalid');
            })
            .finally(() => {
              setSaving(false);
            });
        }}
      >
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor={inputId}>{t('tx.amount')}</Label>
            <AmountInput
              id={inputId}
              currency={currency}
              value={amount}
              onChange={(next) => {
                setAmount(next);
                setError(undefined);
              }}
              aria-invalid={error !== undefined}
              {...(error === undefined ? {} : { 'aria-describedby': errorId })}
            />
          </div>
          <Button type="submit" className="h-11 px-5" disabled={saving}>
            {t('action.save')}
          </Button>
        </div>
        {error === undefined ? null : (
          <p id={errorId} role="alert" className="mt-1.5 text-xs text-destructive">
            {error === 'required' ? t('tx.errAmountRequired') : t('tx.errAmountInvalid')}
          </p>
        )}
      </form>
    </Sheet>
  );
}
