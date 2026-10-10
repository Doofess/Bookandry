import type { FeedRow } from '@/domain/feed';

/**
 * The feed is the board (§5.1) and its transactions sheet shows the newest
 * rows; the whole month is one tap away (?list=1, a history entry so Back
 * returns to the board) and is what a filter shows, as it always has (a
 * card's "Transactions" lands on /?pm=…). Same on desktop and on a phone: the
 * round arrow on the sheet opens it, and list mode has the way back.
 */
export function listMode({ filtered, asked }: { filtered: boolean; asked: boolean }): boolean {
  return filtered || asked;
}

/** How many rows the board's transactions sheet shows, as the concept draws them. */
export const BOARD_ROWS = 8;

/** The first `count` rows with their day headings: no horizon marker, no heading left without a row. */
export function recentRows(rows: readonly FeedRow[], count: number): FeedRow[] {
  const out: FeedRow[] = [];
  let seen = 0;
  for (const row of rows) {
    if (row.kind === 'horizon') continue;
    if (row.kind === 'row') {
      if (seen === count) break;
      seen += 1;
    }
    out.push(row);
  }
  while (out.at(-1)?.kind === 'day') out.pop();
  return out;
}
