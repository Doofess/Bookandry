import type { ReactNode } from 'react';

/**
 * The feed as the concept's board (§5.1, decision 26). From @board: twelve
 * columns of `main`, 16px apart - balance 12; month 5 + categories 7 (4 + 8
 * from @wide), stretched so they end together; transactions 7 + wallet 5,
 * the wallet sticky below the collapsed bar. Below @board: one column, 8px
 * apart, in the same order. Cells, not the sheets, take the spans, so each
 * sheet stays one component.
 */
export function FeedBoard({
  balance,
  month,
  categories,
  transactions,
  wallet,
}: {
  readonly balance: ReactNode;
  readonly month: ReactNode;
  readonly categories: ReactNode;
  readonly transactions: ReactNode;
  readonly wallet: ReactNode;
}) {
  return (
    <div
      data-slot="board"
      className="grid grid-cols-1 gap-sheet @board/main:grid-cols-12 @board/main:items-start"
    >
      <div className="min-w-0 @board/main:col-span-12">{balance}</div>
      <div className="grid min-w-0 @board/main:col-span-5 @board/main:self-stretch @wide/main:col-span-4">
        {month}
      </div>
      <div className="grid min-w-0 @board/main:col-span-7 @board/main:self-stretch @wide/main:col-span-8">
        {categories}
      </div>
      <div className="min-w-0 @board/main:col-span-7">{transactions}</div>
      <div className="min-w-0 @board/main:sticky @board/main:inset-bs-[calc(var(--feed-sticky-top,0px)+var(--gap-sheet))] @board/main:col-span-5">
        {wallet}
      </div>
    </div>
  );
}
