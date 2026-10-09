import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AmountInput } from '@/components/amount-input';
import { PersonAvatar } from '@/components/person-avatar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { Profile } from '@/types/domain';
import type { Currency, Minor } from '@/types/money';

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
  readonly onSave: (amountMinor: Minor) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState<Minor | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const inputId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="space-y-3 rounded-2xl border border-border p-4"
      data-testid="cash-setup"
    >
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
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (amount === undefined || saving) return;
          setSaving(true);
          void onSave(amount).finally(() => {
            setSaving(false);
          });
        }}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={inputId}>{t('tx.amount')}</Label>
          <AmountInput id={inputId} currency={currency} value={amount} onChange={setAmount} />
        </div>
        <Button type="submit" className="h-11 px-5" disabled={amount === undefined || saving}>
          {t('action.save')}
        </Button>
      </form>
    </section>
  );
}
