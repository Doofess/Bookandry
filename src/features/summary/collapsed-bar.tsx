import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Money } from '@/components/money';
import type { Currency } from '@/types/money';

import type { BalanceState } from './use-balance';
import { COLLAPSED_HEIGHT } from './use-collapsing-header';

/**
 * The summary, collapsed to one line.
 *
 * What survives and what does not is the whole design decision. BALANCE stays,
 * at a size still worth reading - it is the number people open the app for, and
 * a collapsed header that drops it has only saved space. "Expected this month"
 * drops out: it is a planning figure, and someone scrolling their transactions
 * is not planning.
 *
 * It stays TAPPABLE to the same breakdown sheet as the full card. A control
 * that quietly stops working once it shrinks is worse than one that was never
 * offered, because the user has already learnt it.
 */
export function CollapsedSummaryBar({
  state,
  currency,
  onOpenBreakdown,
}: {
  readonly state: BalanceState;
  readonly currency: Currency;
  readonly onOpenBreakdown?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      /*
       * FIXED, not sticky, and that is the load-bearing choice.
       *
       * A sticky element occupies space where it is declared, so mounting one
       * on scroll adds 48px to the document at the exact moment the reader is
       * moving through it - the content jumps, the jump changes scrollY, and
       * the changed scrollY can cross the threshold back the other way. That
       * loop is the classic collapsing-header flicker. Fixed takes no space, so
       * appearing and disappearing shifts nothing.
       *
       * The expanded header stays mounted and simply scrolls out of view, which
       * keeps the document height constant for the same reason.
       */
      data-testid="collapsed-summary"
      style={{ height: COLLAPSED_HEIGHT }}
      className="fixed inset-x-0 top-0 z-30 border-b border-border bg-background/95 backdrop-blur"
    >
      <button
        type="button"
        onClick={onOpenBreakdown}
        disabled={state.status !== 'ready' || onOpenBreakdown === undefined}
        className="mx-auto flex h-full w-full max-w-2xl items-center justify-between gap-3 px-4 text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default"
      >
        <span className="text-xs text-muted-foreground">{t('summary.balance')}</span>

        <span className="flex min-w-0 items-center gap-1">
          {state.status === 'ready' ? (
            // Not animated here: a count-up that replays every time the header
            // collapses is motion with nothing to say.
            <Money minor={state.minor} currency={currency} className="truncate text-base font-semibold" />
          ) : (
            <span className="text-sm text-muted-foreground">{t('a11y.loading')}</span>
          )}
          {onOpenBreakdown === undefined ? null : (
            /* Directional: it points into the sheet, so it flips in Hebrew. */
            <ChevronRight
              className="cn-rtl-flip size-4 shrink-0 text-muted-foreground rtl:rotate-180"
              aria-hidden="true"
            />
          )}
        </span>
      </button>
    </div>
  );
}
