import type { TFunction } from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { db } from '@/db/db';
import {
  deleteTransaction,
  restoreOccurrence,
  skipOccurrence,
  type UndoableAction,
} from '@/db/occurrence-actions';
import { systemClock } from '@/lib/clock';
import { formatLocalDate } from '@/lib/dates';
import { newId } from '@/lib/id';
import type { Occurrence } from '@/types/domain';

import type { RowAction } from './row-actions-menu';

/**
 * Perform a row action, then offer to take it back.
 *
 * NO `setTimeout` anywhere, which the plan calls out specifically. The window
 * is Sonner's own `duration`, driven by the library's timer rather than by one
 * a component starts and has to remember to clear - a stray timer in a
 * component body fires after unmount, after a route change, and twice under
 * React 19's StrictMode double-invoke.
 *
 * Just as deliberately, dismissing the toast does NOTHING. The plan is explicit
 * that hard-deleting on toast expiry is unsafe: `onDismiss` also fires when
 * someone swipes a toast away to clear the screen, which would make tidying up
 * destroy data. The tombstone's 24-hour window and the sweeper own that, and
 * they run whether or not a toast was ever shown.
 */
export function useRowActions(): (action: RowAction, occurrence: Occurrence) => Promise<void> {
  const { t, i18n } = useTranslation();

  return useCallback(
    async (action: RowAction, occurrence: Occurrence) => {
      const now = systemClock.nowIso();

      try {
        switch (action) {
          case 'skip': {
            const undoable = await skipOccurrence(db, occurrence, now, newId);
            offerUndo(
              t('tx.toastSkipped', {
                date: formatLocalDate(occurrence.date, i18n.language, { dateStyle: 'medium' }),
              }),
              undoable,
              t,
            );
            return;
          }

          case 'restore': {
            const undoable = await restoreOccurrence(db, occurrence, now, newId);
            offerUndo(t('tx.toastRestored'), undoable, t);
            return;
          }

          case 'delete': {
            const undoable = await deleteTransaction(db, occurrence.transaction.id, now);
            offerUndo(t('tx.toastDeleted'), undoable, t);
            return;
          }

          case 'edit':
          case 'duplicate':
          case 'split':
            // Handled by the caller, which owns the sheets and their URL state.
            return;
        }
      } catch {
        // Each of these is a single Dexie transaction, so a failure changed
        // nothing - and saying so is the difference between trying again and
        // hunting for a half-applied state that does not exist.
        toast.error(t('tx.toastFailed'));
      }
    },
    [t, i18n.language],
  );
}

/** The toast after an undoable write, with its Undo. */
export function offerUndo(message: string, undoable: UndoableAction, t: TFunction): void {
  toast(message, {
    action: {
      label: t('action.undo'),
      onClick: () => {
        // The instant the UNDO happened, not the instant of the action it
        // reverses: `updatedAt` decides the winner of an import merge, and
        // reusing the original timestamp would make the undo lose to it.
        void undoable.undo(systemClock.nowIso()).catch(() => {
          toast.error(t('tx.toastFailed'));
        });
      },
    },
  });
}

/**
 * Run one undoable write, then offer to take it back - the row menu's toast,
 * for the pop-outs that write (the category, and "not counted yet").
 */
export function useUndoableWrite(): (write: () => Promise<UndoableAction>, message: string) => Promise<void> {
  const { t } = useTranslation();
  return useCallback(
    async (write: () => Promise<UndoableAction>, message: string) => {
      try {
        offerUndo(message, await write(), t);
      } catch {
        // One Dexie transaction: a failure changed nothing.
        toast.error(t('tx.toastFailed'));
      }
    },
    [t],
  );
}
