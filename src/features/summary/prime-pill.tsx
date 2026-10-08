import { cn } from 'cn';
import { Info } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import { usePrime } from '@/app/prime';
import { panelPill } from '@/components/brand-panel';
import { Percent } from '@/components/percent';
import { buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { formatLocalDate } from '@/lib/dates';

/**
 * Israeli prime, as a pill on the feed's panel: "Prime 4.75% ⓘ". It opens what
 * the strip under the cards used to say: the Bank of Israel rate it is built
 * on, and the date it is as of or the next decision that might move it.
 */
export function PrimePill() {
  const { t, i18n } = useTranslation();
  const prime = usePrime();
  const day = (date: Parameters<typeof formatLocalDate>[0]) =>
    formatLocalDate(date, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  const when =
    prime.source.kind === 'built_in'
      ? t('prime.asOf', { date: day(prime.source.asOf) })
      : prime.nextDecision === undefined
        ? undefined
        : t('prime.next', { date: day(prime.nextDecision) });

  return (
    <Popover>
      <PopoverTrigger
        data-testid="prime-pill"
        className={cn(buttonVariants({ variant: 'ghost' }), panelPill)}
      >
        {t('prime.pill')}
        <Percent rate={prime.primeRate} className="font-semibold tabular-nums" />
        <Info className="size-4 opacity-80" strokeWidth={1.75} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent data-testid="prime-popout" align="start" className="w-64">
        <PopoverTitle className="flex items-baseline justify-between gap-3">
          {t('prime.title')}
          <Percent rate={prime.primeRate} className="text-lg font-semibold tabular-nums" />
        </PopoverTitle>
        <p className="text-muted-foreground">
          <Trans i18nKey="prime.detail" components={{ boi: <Percent rate={prime.boiRate} /> }} />
        </p>
        {when === undefined ? null : <p className="text-xs text-muted-foreground">{when}</p>}
      </PopoverContent>
    </Popover>
  );
}
