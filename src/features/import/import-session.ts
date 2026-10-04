import type { Reconciliation } from '@/domain/import-check';

import type { ReviewItem } from './review-items';
import type { FileState } from './run-import';

/**
 * What an "Add with AI" session has so far - the files, how each read went,
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
