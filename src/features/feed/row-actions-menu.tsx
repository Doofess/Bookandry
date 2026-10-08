import { Copy, Pencil, SkipForward, Split, Trash2, Undo2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { PopupItemContent, useAnchoredPopup } from '@/components/ui/popup-parts';
import type { Occurrence } from '@/types/domain';

export type RowAction = 'edit' | 'duplicate' | 'split' | 'skip' | 'restore' | 'delete';

export type RowMenuTarget = { readonly occurrence: Occurrence; readonly anchor: HTMLElement };

/**
 * The row menu: ONE menu at screen level, anchored to the ⋯ of the row it
 * was opened from, rather than a menu per row.
 *
 * In a virtualised list a per-row menu unmounts the moment its row scrolls
 * out of the rendered range. One instance, driven by the selected occurrence
 * and pointed at that row's button through base-ui's `anchor`, has no such
 * coupling, and when that row does unmount, the menu closes rather than
 * floating over nothing.
 *
 * What is offered depends on the row, because the same word means different
 * things:
 *
 *  - SKIP applies to a series only. For a one-time transaction "skip" and
 *    "delete" are the same act, and offering both invites the user to pick the
 *    one that is not recoverable from Settings.
 *  - DELETE on a series takes the WHOLE series, and says so. Silently deleting
 *    one occurrence under a label that says "delete" is how a year of rent
 *    disappears.
 *  - DUPLICATE opens the add form prefilled from the row, dated today and
 *    one-time, whatever the row was.
 *  - SPLIT is offered for a purchase its card can split into payments. On a
 *    card with no billing day yet it is shown disabled, with the reason: a
 *    line of plain text inside a menu is skipped by arrow keys and screen
 *    readers alike.
 */
export function RowActionsMenu({
  target,
  split,
  onClose,
  onAction,
}: {
  /** The row whose menu is open, with its ⋯ button; undefined when closed. */
  readonly target: RowMenuTarget | undefined;
  /**
   * A purchase its card can split into payments (`useSplitOffer`), or one
   * that could be once the card has a billing day: then the menu says so.
   */
  readonly split?: 'offer' | 'needs_billing_day' | undefined;
  readonly onClose: () => void;
  readonly onAction: (action: RowAction, occurrence: Occurrence) => void;
}) {
  const { t } = useTranslation();
  const { shown, anchor, finalFocus } = useAnchoredPopup(target, onClose);

  const occurrence = shown?.occurrence;
  const isSeries = occurrence !== undefined && occurrence.transaction.recurrence.type !== 'one_time';

  return (
    <DropdownMenu
      open={target !== undefined}
      // Not modal: the page still scrolls under it, and a scroll closes it
      // (it has an arrow), as it does the other pop-outs. A modal menu locks
      // the page instead, and stays pinned to a row the user wanted to move past.
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuContent
        anchor={anchor}
        arrow
        side="bottom"
        align="end"
        className="w-64 p-1.5"
        data-testid="row-menu"
        finalFocus={finalFocus}
      >
        {occurrence === undefined ? null : (
          <>
            <MenuRow
              icon={Pencil}
              label={t('tx.actionEdit')}
              onClick={() => {
                onAction('edit', occurrence);
              }}
            />
            <MenuRow
              icon={Copy}
              label={t('tx.actionDuplicate')}
              onClick={() => {
                onAction('duplicate', occurrence);
              }}
            />
            {split === undefined ? null : (
              <MenuRow
                icon={Split}
                label={t('split.action')}
                hint={split === 'needs_billing_day' ? t('split.needsBillingDay') : undefined}
                disabled={split === 'needs_billing_day'}
                onClick={() => {
                  onAction('split', occurrence);
                }}
              />
            )}
            {isSeries ? (
              occurrence.isSkipped ? (
                <MenuRow
                  icon={Undo2}
                  flip
                  label={t('tx.actionRestore')}
                  hint={t('tx.actionRestoreHint')}
                  onClick={() => {
                    onAction('restore', occurrence);
                  }}
                />
              ) : (
                <MenuRow
                  icon={SkipForward}
                  flip
                  label={t('tx.actionSkip')}
                  hint={t('tx.actionSkipHint')}
                  onClick={() => {
                    onAction('skip', occurrence);
                  }}
                />
              )
            ) : null}
            <DropdownMenuSeparator />
            <MenuRow
              icon={Trash2}
              destructive
              label={isSeries ? t('tx.actionDeleteSeries') : t('tx.actionDelete')}
              hint={isSeries ? t('tx.actionDeleteSeriesHint') : t('tx.actionDeleteHint')}
              onClick={() => {
                onAction('delete', occurrence);
              }}
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/*
 * The flip is per icon, from the directional allowlist.
 * SkipForward and Undo2 point along the reading direction and must mirror;
 * Pencil, Copy, Split and Trash2 encode no direction at all, and flipping them
 * is the blanket `-scale-x` mistake §7 proposed and this project rejected.
 */
function MenuRow({
  destructive = false,
  disabled = false,
  onClick,
  ...content
}: ComponentProps<typeof PopupItemContent> & {
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <DropdownMenuItem
      variant={destructive ? 'destructive' : 'default'}
      className="gap-3 px-2.5 py-2"
      disabled={disabled}
      onClick={onClick}
    >
      <PopupItemContent {...content} />
    </DropdownMenuItem>
  );
}
