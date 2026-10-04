import { Landmark } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import { usePrime } from '@/app/prime';
import { Percent } from '@/components/percent';
import { formatLocalDate } from '@/lib/dates';

/**
 * Israeli prime, under the headline figures.
 *
 * A reference figure rather than one of the household's own, so it is quiet:
 * one line, below the cards, never competing with the balance. It is here
 * because a prime-linked loan's repayments move when it does, and the next
 * Bank of Israel decision is the date that might happen.
 */
export function PrimeStrip() {
  const { t, i18n } = useTranslation();
  const prime = usePrime();
  const day = (date: Parameters<typeof formatLocalDate>[0]) =>
    formatLocalDate(date, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground"
      data-testid="prime-strip"
    >
      <span className="flex items-center gap-1.5 text-sm text-foreground">
        <Landmark className="size-4 text-muted-foreground" aria-hidden="true" />
        {t('prime.title')}
        <Percent rate={prime.primeRate} className="font-semibold tabular-nums" />
      </span>
      <span>
        <Trans i18nKey="prime.detail" components={{ boi: <Percent rate={prime.boiRate} /> }} />
      </span>
      <span>
        {prime.source.kind === 'built_in'
          ? t('prime.asOf', { date: day(prime.source.asOf) })
          : prime.nextDecision === undefined
            ? null
            : t('prime.next', { date: day(prime.nextDecision) })}
      </span>
    </div>
  );
}
