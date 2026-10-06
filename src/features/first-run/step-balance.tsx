import { useTranslation } from 'react-i18next';

import { AmountInput } from '@/components/amount-input';
import { PersonAvatar, type PersonLike } from '@/components/person-avatar';
import { Button } from '@/components/ui/button';
import type { FirstRunDraft } from '@/domain/first-run';
import { formatLocalDate, startOfMonth } from '@/lib/dates';
import type { LocalDate } from '@/types/money';

/**
 * The opening balance.
 *
 * Two things the spec left unexplained, both of which make the headline number
 * meaningless if the user guesses wrong:
 *
 *  - WHAT it is. Nobody knows what an "opening balance date" is, or that every
 *    occurrence before it is discarded. One sentence fixes that.
 *  - WHEN counting starts. The date is the start of THIS MONTH, not today -
 *    anchoring on the 15th would drop the salary that arrived on the 1st and
 *    the rent that left on the 2nd, so the first month the user ever sees would
 *    be missing most of itself.
 *
 * Skipping is a first-class option, not a hidden one. Someone who does not know
 * their balance to the shekel should not be blocked at the last step of setup,
 * and zero is an honest starting point.
 *
 * One person, one balance: the account's own. Linked accounts each answer
 * this for themselves on their own first run.
 */
export function StepBalance({
  draft,
  person,
  today,
  onChange,
}: {
  draft: FirstRunDraft;
  person: PersonLike;
  today: LocalDate;
  onChange: (draft: FirstRunDraft) => void;
}) {
  const { t, i18n } = useTranslation();
  const from = startOfMonth(today);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t('firstRun.balanceBody')}</p>

      <div className="space-y-2">
        {/* The picture beside the label, not inside it, so the field is
            named by the person's name alone - not by their initials too. */}
        <div className="flex items-center gap-2">
          <PersonAvatar person={person} size="sm" />
          <label htmlFor="first-run-balance" className="truncate text-sm font-medium">
            {person.name}
          </label>
        </div>
        <AmountInput
          id="first-run-balance"
          value={draft.openingBalanceMinor}
          currency={draft.currency}
          // An Israeli current account in מינוס is an ordinary negative
          // balance; refusing it would make this screen unusable.
          allowNegative
          placeholder="0"
          onChange={(minor) => {
            onChange({ ...draft, openingBalanceMinor: minor });
          }}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {t('firstRun.balanceFrom', {
          date: formatLocalDate(from, i18n.language, { dateStyle: 'long' }),
        })}
      </p>

      <Button
        type="button"
        variant="ghost"
        className="h-11 w-full"
        onClick={() => {
          onChange({ ...draft, openingBalanceMinor: undefined });
        }}
      >
        {t('firstRun.balanceSkip')}
      </Button>
    </div>
  );
}
