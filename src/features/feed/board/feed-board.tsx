import type { ReactNode } from 'react';

/**
 * The feed as the concept's board (§5.1, decision 26). From @board: twelve
 * columns of `main`, 16px apart - balance 12; month 5 + categories 7 (4 + 8
 * from @wide), stretched so they end together; transactions 7 + wallet 5,
 * the wallet sticky below the collapsed bar. Below @board: one column, 8px
 * apart, in the same order. Cells, not the sheets, take the spans, so each
 * sheet stays one component.
 *
 * The month's note ("expected this month") has a row of its own under the
 * month sheet, so the sheet keeps the concept's height and nothing overlaps
 * the gap below it. Rows are placed by number from @board: month and
 * categories on row 2, the note on row 3, transactions and wallet on row 4.
 */
export function FeedBoard({
  balance,
  month,
  monthNote,
  categories,
  transactions,
  wallet,
}: {
  readonly balance: ReactNode;
  readonly month: ReactNode;
  /** The line under the month sheet, in the month's column. */
  readonly monthNote?: ReactNode;
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
      <div className="grid min-w-0 @board/main:col-span-5 @board/main:col-start-1 @board/main:row-start-2 @board/main:self-stretch @wide/main:col-span-4">
        {month}
      </div>
      {monthNote === undefined || monthNote === null ? null : (
        <div
          data-slot="month-note"
          className="min-w-0 px-1 @board/main:col-span-5 @board/main:col-start-1 @board/main:row-start-3 @wide/main:col-span-4"
        >
          {monthNote}
        </div>
      )}
      <div className="grid min-w-0 @board/main:col-span-7 @board/main:col-start-6 @board/main:row-start-2 @board/main:self-stretch @wide/main:col-span-8 @wide/main:col-start-5">
        {categories}
      </div>
      <div className="min-w-0 @board/main:col-span-7 @board/main:col-start-1 @board/main:row-start-4">
        {transactions}
      </div>
      <div className="min-w-0 @board/main:sticky @board/main:inset-bs-[calc(var(--feed-sticky-top,0px)+var(--gap-sheet))] @board/main:col-span-5 @board/main:col-start-8 @board/main:row-start-4">
        {wallet}
      </div>
    </div>
  );
}
