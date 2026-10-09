import { useTranslation } from 'react-i18next';

import { Money } from '@/components/money';
import { PersonAvatar } from '@/components/person-avatar';
import type { CashSummary } from '@/domain/cash';
import { formatLocalDate } from '@/lib/dates';
import type { Profile } from '@/types/domain';
import type { Currency } from '@/types/money';

/**
 * The cash on hand, on the panel, in the balance's own figure: the serif,
 * the same size and the same step down below 360px, so a seven-figure amount
 * still fits a 320px phone in Hebrew. With more than one person, each one's
 * own figure under it: the pot always splits back into its people.
 */
export function CashFigure({
  summary,
  currency,
  profiles,
}: {
  readonly summary: CashSummary;
  readonly currency: Currency;
  readonly profiles: ReadonlyMap<string, Profile>;
}) {
  const { t, i18n } = useTranslation();

  return (
    <div>
      <p className="text-sm text-brand-deep-foreground/80">{t('cash.onHand')}</p>
      <p
        className="mt-1 font-display text-[2.75rem] leading-none font-bold tracking-tight max-[359px]:text-[2.25rem]"
        data-testid="cash-amount"
      >
        <Money minor={summary.onHandMinor} currency={currency} />
      </p>
      {summary.countedOn === undefined ? null : (
        <p className="mt-2 text-sm text-brand-deep-foreground/80" data-testid="cash-counted">
          {t('cash.counted', {
            date: formatLocalDate(summary.countedOn, i18n.language, { dateStyle: 'medium' }),
          })}
        </p>
      )}
      {summary.onHandMinor < 0 ? (
        // Red on the deep blue fails contrast; the words carry it.
        <p className="mt-2 text-sm font-medium text-brand-deep-foreground">{t('cash.negative')}</p>
      ) : null}
      {summary.people.length < 2 ? null : (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="cash-people">
          {summary.people.map((p) => {
            const profile = profiles.get(p.profileId);
            return profile === undefined ? null : (
              <li key={p.profileId} className="flex items-center gap-1.5">
                <PersonAvatar person={profile} size="sm" className="size-6 text-[10px]" />
                <span className="sr-only">{profile.name}</span>
                <Money minor={p.onHandMinor} currency={currency} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
