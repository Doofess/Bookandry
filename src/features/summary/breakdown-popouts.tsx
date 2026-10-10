import { ChevronRight } from 'lucide-react';
import { type ReactNode, type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import type { BalanceBreakdown, ForecastBreakdown } from '@/domain/breakdown';
import { formatLocalDate } from '@/lib/dates';
import type { Currency, LocalDate } from '@/types/money';

import { GROUP_LABELS } from './breakdown-labels';
import { BalanceLines } from './breakdown-sheet';

type TriggerProps = {
  readonly onFullBreakdown: () => void;
  readonly triggerClassName: string;
  readonly triggerLabel: string;
  readonly children: ReactNode;
};

/** The balance's parts, in a pop-out under the figure. "Full breakdown" opens the sheet. */
export function BalancePopover({
  breakdown,
  since,
  currency,
  onFullBreakdown,
  triggerClassName,
  triggerLabel,
  children,
  figure,
}: TriggerProps & {
  readonly breakdown: BalanceBreakdown;
  readonly since: LocalDate;
  readonly currency: Currency;
  /**
   * The figure inside a wide trigger, for the arrow to point at: the collapsed
   * bar is one full-width button, with the word Balance at one end and the
   * amount at the other. The pop-out lines up with it at the end.
   */
  readonly figure?: RefObject<HTMLElement | null>;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger className={triggerClassName} aria-label={triggerLabel}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        arrow
        {...(figure === undefined ? { align: 'start' as const } : { anchor: figure, align: 'end' as const })}
        className="w-72"
        data-testid="balance-popout"
      >
        <PopoverTitle>{t('summary.balance')}</PopoverTitle>
        <p className="text-xs text-muted-foreground">
          {t('breakdown.balanceBody', { date: formatLocalDate(since, i18n.language, { dateStyle: 'long' }) })}
        </p>
        <BalanceLines breakdown={breakdown} currency={currency} />
        <FullBreakdown
          onClick={() => {
            setOpen(false);
            onFullBreakdown();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** The forecast by kind: the largest four, how many more, and the total. */
export function ForecastPopover({
  breakdown,
  month,
  currency,
  onFullBreakdown,
  triggerClassName,
  triggerLabel,
  children,
}: TriggerProps & {
  readonly breakdown: ForecastBreakdown;
  readonly month: LocalDate;
  readonly currency: Currency;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger className={triggerClassName} aria-label={triggerLabel}>
        {children}
      </PopoverTrigger>
      <PopoverContent arrow align="start" className="w-72" data-testid="forecast-popout">
        <PopoverTitle>{t('summary.expected')}</PopoverTitle>
        <p className="text-xs text-muted-foreground">
          {t('breakdown.expenseBody', {
            month: formatLocalDate(month, i18n.language, { month: 'long', year: 'numeric' }),
          })}
        </p>
        <dl>
          {breakdown.top.map((group) => (
            <div key={group.kind} className="flex items-baseline justify-between gap-4 py-1.5">
              <dt className="text-sm text-muted-foreground">{t(GROUP_LABELS[group.kind])}</dt>
              <dd className="text-sm font-medium">
                <Money minor={group.totalMinor} currency={currency} />
              </dd>
            </div>
          ))}
        </dl>
        {/* Outside the list: a <dl> may hold only its groups. */}
        {breakdown.moreCount === 0 ? null : (
          <p className="text-xs text-muted-foreground">
            {t('breakdown.more', { count: breakdown.moreCount })}
          </p>
        )}
        <dl>
          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
            <dt className="text-sm font-medium">{t('summary.expected')}</dt>
            <dd className="text-base font-semibold">
              <Money minor={breakdown.totalMinor} currency={currency} />
            </dd>
          </div>
        </dl>
        <FullBreakdown
          onClick={() => {
            setOpen(false);
            onFullBreakdown();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function FullBreakdown({ onClick }: { readonly onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="ghost"
      className="min-h-11 w-full justify-between text-primary-ink sm:min-h-9"
      onClick={onClick}
    >
      {t('breakdown.full')}
      {/* Directional: it points into the sheet, so it flips in Hebrew. */}
      <ChevronRight className="cn-rtl-flip size-4 rtl:rotate-180" aria-hidden="true" />
    </Button>
  );
}
