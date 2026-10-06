import type { MethodReviewItem } from '@/domain/import-cards';
import type { Reconciliation } from '@/domain/import-check';

import type { ReviewItem } from './review-items';
import type { FileState } from './run-import';

/**
 * What an "Smart import" session has so far - the files, how each read went,
 * and what was found - kept outside the sheet, so it outlives the sheet
 * closing for a moment: Back from a row, a slip of the finger on the
 * backdrop, the phone turning. Never written anywhere: it is gone with the
 * page, and cleared when the rows are added or discarded.
 */
export type ImportSession = {
  readonly stage: 'pick' | 'reading' | 'review';
  readonly files: readonly File[];
  readonly states: readonly FileState[];
  readonly items: readonly ReviewItem[];
  /** Cards and bank accounts found whole; what was found only in part is kept apart, in `import-drafts`. */
  readonly methods: readonly MethodReviewItem[];
  /** How many this reading found only in part. */
  readonly drafted: number;
  readonly reconciliations: readonly Reconciliation[];
  readonly batch: { readonly methodId: string; readonly profileId: string };
  /** The share the files came from, so it can be forgotten once read. */
  readonly sharedId?: string;
};

let current: ImportSession | undefined;

export const readSession = (): ImportSession | undefined => current;

export function writeSession(next: ImportSession | undefined): void {
  current = next;
}
