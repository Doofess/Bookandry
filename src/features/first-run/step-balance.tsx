import { useTranslation } from 'react-i18next';

import { AmountInput } from '@/components/amount-input';
import { Avatar } from '@/components/avatars/avatar';
import { Button } from '@/components/ui/button';
import { updatePerson, type FirstRunDraft } from '@/domain/first-run';
import { formatLocalDate, startOfMonth } from '@/lib/dates';
import type { LocalDate, Minor } from '@/types/money';

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
 */
export function StepBalance({
  draft,
  today,
  onChange,
}: {
  draft: FirstRunDraft;
  today: LocalDate;
  onChange: (draft: FirstRunDraft) => void;
}) {
  const { t, i18n } = useTranslation();
  const from = startOfMonth(today);

  const set = (key: string, minor: Minor | undefined): void => {
    onChange(updatePerson(draft, key, { openingBalanceMinor: minor }));
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t('firstRun.balanceBody')}</p>

      <ul className="space-y-4">
        {draft.people.map((p) => (
          <li key={p.key} className="space-y-2">
            <label htmlFor={`${p.key}-balance`} className="flex items-center gap-2 text-sm font-medium">
              <Avatar avatar={p.avatar} color={p.color} size="sm" />
              <span className="truncate">{p.name || t('firstRun.peopleName')}</span>
            </label>
            <AmountInput
              id={`${p.key}-balance`}
              value={p.openingBalanceMinor}
              currency={draft.currency}
              // An Israeli current account in מינוס is an ordinary negative
              // balance; refusing it would make this screen unusable.
              allowNegative
              placeholder="0"
              onChange={(minor) => {
                set(p.key, minor);
              }}
            />
          </li>
        ))}
      </ul>

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
          onChange({
            ...draft,
            people: draft.people.map((p) => ({ ...p, openingBalanceMinor: undefined })),
          });
        }}
      >
        {t('firstRun.balanceSkip')}
      </Button>
    </div>
  );
}
