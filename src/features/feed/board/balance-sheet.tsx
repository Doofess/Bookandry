import type { ReactNode } from 'react';

import { Sheet } from '@/components/ui/sheet-surface';
import { TitlePair } from '@/components/ui/title-pair';

/**
 * The household's money (§5.1): the ink sheet across the board. Its text
 * column holds the title pair, the lede with its key figures in boxes, and the
 * balance as the huge numeral running off the foot; the account sheets fan
 * down the other side and run off it too. In one column (below @wide) the
 * accounts sit between the lede and the numeral, so the numeral is still the
 * sheet's last thing and bleeds where the rule says (§9.4).
 */
export function BalanceSheet({
  title,
  subtitle,
  lede,
  figure,
  accounts,
  actions,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly lede: ReactNode;
  readonly figure: ReactNode;
  readonly accounts: ReactNode;
  /** The person in view and the prime rate: kept from the old hero, under the lede, so the title keeps its line. */
  readonly actions?: ReactNode;
}) {
  return (
    <Sheet
      kind="night"
      bleed
      data-slot="balance-sheet"
      className={
        "grid gap-x-10 gap-y-3.5 border-0 [grid-template-areas:'head'_'accounts'_'figure'] " +
        '@wide/main:min-h-105 @wide/main:grid-cols-[minmax(0,1fr)_27.5rem] @wide/main:grid-rows-[auto_1fr] ' +
        "@wide/main:[grid-template-areas:'head_accounts'_'figure_accounts'] @vast/main:grid-cols-[minmax(0,1fr)_32.5rem]"
      }
    >
      <div className="flex min-w-0 flex-col gap-3.5 [grid-area:head]">
        {/* The concept's bare h2 keeps the page's 1.55 line height, and its subtitle sits 6px under it. */}
        <TitlePair
          as="h2"
          size="hero"
          title={title}
          subtitle={subtitle}
          className="leading-[1.55] [&>span]:mt-1.5"
        />
        <p className="max-w-[38ch] text-lede leading-[1.75] font-light">{lede}</p>
        {actions === undefined ? null : <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="-ms-1.5 min-w-0 self-end [grid-area:figure]">{figure}</div>
      <div className="min-w-0 self-end [grid-area:accounts] @wide/main:-mbe-3.5">{accounts}</div>
    </Sheet>
  );
}
