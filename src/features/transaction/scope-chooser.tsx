import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { Segmented } from '@/components/segmented';
import { Label } from '@/components/ui/label';
import type { EditScope } from '@/domain/series-edit';
import { formatLocalDate } from '@/lib/dates';
import type { LocalDate } from '@/types/money';

/**
 * Which occurrences an edit applies to.
 *
 * Asked BEFORE the fields rather than confirmed after them, because the answer
 * changes what the fields mean - and what they are allowed to be. Scope 'one'
 * cannot change the repeat rule (a single occurrence whose rule disagrees with
 * its parent's is not interpretable by anything downstream) and scopes 'future'
 * and 'all' cannot move the date (applied to a rule instead of an occurrence,
 * "move this to the 12th" silently becomes "move every one of them"). Those are
 * the two refusals `planSeriesEdit` makes; the form mirrors them rather than
 * offering something the planner will reject.
 *
 * Shown only for a series. A one-time transaction has exactly one occurrence,
 * and a three-option control over one option is noise.
 *
 * A plan (תשלומים, קרדיט) is never split: its payments count from its own
 * date, so "this and future" would restart the count and move its prime reset.
 * It offers this one or the whole plan, as `planSeriesEdit` allows.
 */
export function ScopeChooser({
  value,
  onChange,
  at,
  plan = false,
}: {
  readonly value: EditScope;
  readonly onChange: (scope: EditScope) => void;
  /** The occurrence being edited, for the hint under each option. */
  readonly at: LocalDate;
  /** An installment or credit plan: no "this and future". */
  readonly plan?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const labelId = useId();
  const date = formatLocalDate(at, i18n.language, { dateStyle: 'medium' });

  const hint =
    value === 'one'
      ? t('tx.scopeOneHint', { date })
      : value === 'future'
        ? t('tx.scopeFutureHint', { date })
        : t('tx.scopeAllHint');

  return (
    <div className="space-y-1.5">
      <Label id={labelId}>{t('tx.scope')}</Label>
      <Segmented<EditScope>
        look="pill"
        value={value}
        labelledBy={labelId}
        onChange={onChange}
        size="sm"
        options={[
          { value: 'one', label: t('tx.scopeOne') },
          ...(plan ? [] : [{ value: 'future' as const, label: t('tx.scopeFuture') }]),
          { value: 'all', label: t('tx.scopeAll') },
        ]}
      />
      {/*
        One hint under the group rather than one per option: three hints at once
        is a wall of text on a 375px screen, and only the chosen one is the
        answer to "what will this do".
      */}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
