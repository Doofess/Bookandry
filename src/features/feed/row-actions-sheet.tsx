import { cn } from 'cn';
import { Pencil, SkipForward, Trash2, Undo2 } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatLocalDate } from '@/lib/dates';
import type { Occurrence } from '@/types/domain';

export type RowAction = 'edit' | 'skip' | 'restore' | 'delete';

/**
 * The row menu, as ONE sheet at screen level rather than a dropdown per row.
 *
 * In a virtualised list a per-row menu unmounts the moment its row scrolls out
 * of the rendered range, which closes an open menu mid-gesture. One instance
 * driven by the selected occurrence has no such coupling - and on a phone a
 * bottom action sheet is the right shape anyway, with targets that clear 44px
 * without effort.
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
 */
export function RowActionsSheet({
  occurrence,
  onOpenChange,
  onAction,
}: {
  /** The row whose menu is open, or undefined when closed. */
  readonly occurrence: Occurrence | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAction: (action: RowAction, occurrence: Occurrence) => void;
}) {
  const { t, i18n } = useTranslation();

  const isSeries = occurrence !== undefined && occurrence.transaction.recurrence.type !== 'one_time';
  const date =
    occurrence === undefined ? '' : formatLocalDate(occurrence.date, i18n.language, { dateStyle: 'medium' });

  return (
    <Sheet open={occurrence !== undefined} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom,0px)]">
        <SheetHeader>
          <SheetTitle>{t('tx.actionsTitle')}</SheetTitle>
        </SheetHeader>

        {occurrence === undefined ? null : (
          <div className="flex flex-col gap-1 px-2 pb-4">
            <ActionRow
              icon={Pencil}
              label={t('tx.actionEdit')}
              onSelect={() => {
                onAction('edit', occurrence);
              }}
            />

            {isSeries ? (
              occurrence.isSkipped ? (
                <ActionRow
                  icon={Undo2}
                  flip
                  label={t('tx.actionRestore')}
                  hint={t('tx.actionRestoreHint')}
                  onSelect={() => {
                    onAction('restore', occurrence);
                  }}
                />
              ) : (
                <ActionRow
                  icon={SkipForward}
                  flip
                  label={t('tx.actionSkip')}
                  hint={t('tx.actionSkipHint')}
                  onSelect={() => {
                    onAction('skip', occurrence);
                  }}
                />
              )
            ) : null}

            <ActionRow
              icon={Trash2}
              destructive
              label={isSeries ? t('tx.actionDeleteSeries') : t('tx.actionDelete')}
              hint={isSeries ? t('tx.actionDeleteSeriesHint') : t('tx.actionDeleteHint')}
              onSelect={() => {
                onAction('delete', occurrence);
              }}
            />

            <p className="px-3 pt-2 text-xs text-muted-foreground">{date}</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ActionRow({
  icon: Icon,
  label,
  hint,
  destructive = false,
  flip = false,
  onSelect,
}: {
  readonly icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  readonly label: string;
  readonly hint?: string;
  readonly destructive?: boolean;
  /** True only for icons on §7's directional allowlist. */
  readonly flip?: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex min-h-14 items-center gap-3 rounded-xl px-3 text-start transition hover:bg-muted',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        destructive && 'text-destructive',
      )}
    >
      {/*
        The flip is per icon, from the directional allowlist.
        SkipForward and Undo2 point along the reading direction and must mirror;
        Pencil and Trash2 encode no direction at all, and flipping them is the
        blanket `-scale-x` mistake §7 proposed and this project rejected.
      */}
      <Icon className={cn('size-4 shrink-0', flip && 'cn-rtl-flip rtl:rotate-180')} aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint === undefined ? null : <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}
