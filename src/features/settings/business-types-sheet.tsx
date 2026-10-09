import { Plus, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { moveBusinessType, movePastExpenses, pastExpensesFor, returnBusinessType } from '@/db/business-types';
import { db } from '@/db/db';
import { mccName } from '@/domain/mcc';
import { businessTypesOf } from '@/domain/mcc-categories';
import { BusinessTypePopout } from '@/features/business-type/business-type-picker';
import { useMccList } from '@/features/business-type/use-mcc-list';
import { categoryDisplayName } from '@/i18n/category-name';
import { systemClock } from '@/lib/clock';
import type { Category } from '@/types/domain';

/** How many business types show before "and N more". */
const SHOWN = 8;

/**
 * A category's business types (spec §4.2): the ones the default table files
 * here, then the ones the person moved in, each of those with "Return to
 * default". Adding one moves it here from wherever it was, then offers once
 * to move the past expenses its old category holds.
 */
export function BusinessTypesSheet({
  category,
  categories,
  onOpenChange,
}: {
  readonly category: Category | undefined;
  readonly categories: readonly Category[];
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation(['categories', 'common']);
  const list = useMccList();
  const [expanded, setExpanded] = useState(false);
  const [asking, setAsking] = useState<{ readonly ids: readonly string[] } | undefined>(undefined);

  const name = category === undefined ? '' : categoryDisplayName(category, t);
  const types = category === undefined ? { defaults: [], moved: [] } : businessTypesOf(category, categories);
  const rows = [
    ...types.defaults.map((code) => ({ code, moved: false })),
    ...types.moved.map((code) => ({ code, moved: true })),
  ];
  const shown = expanded ? rows : rows.slice(0, SHOWN);
  const nameOf = (code: string): string =>
    list === undefined ? code : (mccName(list, code, i18n.language) ?? code);

  const failed = (): void => {
    toast.error(t('common:tx.toastFailed'));
  };

  const add = async (code: string): Promise<void> => {
    if (category === undefined) return;
    try {
      const { from } = await moveBusinessType(db, code, category.id, systemClock.nowIso());
      // An archived category's moves do not apply (spec §4.2), so the code still files
      // where it did, and moving past expenses into it would contradict that.
      if (from === undefined || from === category.id || category.isArchived === 1) return;
      const ids = await pastExpensesFor(db, code, from);
      if (ids.length > 0) setAsking({ ids });
    } catch {
      failed();
    }
  };

  const movePast = async (ids: readonly string[]): Promise<void> => {
    if (category === undefined) return;
    try {
      const undoable = await movePastExpenses(db, ids, category.id, systemClock.nowIso());
      toast(t('categories:businessTypes.movedPast', { count: ids.length }), {
        action: {
          label: t('common:action.undo'),
          onClick: () => {
            void undoable.undo(systemClock.nowIso()).catch(failed);
          },
        },
      });
    } catch {
      failed();
    }
  };

  return (
    <Sheet
      open={category !== undefined}
      onOpenChange={(open) => {
        if (!open) setExpanded(false);
        onOpenChange(open);
      }}
    >
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('categories:businessTypes.title', { name })}</SheetTitle>
          <SheetDescription>{t('categories:businessTypes.body')}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {category?.isArchived === 1 ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm">{t('categories:businessTypes.archived')}</p>
          ) : null}

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('categories:businessTypes.none')}</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {shown.map(({ code, moved }) => (
                <li key={code} className="flex min-h-11 items-center gap-3 px-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{nameOf(code)}</span>
                    {moved ? (
                      <span className="block text-xs text-muted-foreground">
                        {t('categories:businessTypes.moved')}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums" dir="ltr">
                    {code}
                  </span>
                  {moved && category !== undefined ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label={`${t('categories:businessTypes.returnDefault')}: ${nameOf(code)}`}
                      onClick={() => {
                        void returnBusinessType(db, code, category.id, systemClock.nowIso()).catch(failed);
                      }}
                    >
                      <Undo2 className="size-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {!expanded && rows.length > SHOWN ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => {
                setExpanded(true);
              }}
            >
              {t('categories:businessTypes.more', { count: rows.length - SHOWN })}
            </Button>
          ) : null}

          <BusinessTypePopout
            value=""
            onSelect={(code) => {
              void add(code);
            }}
            trigger={
              <Button type="button" variant="outline" className="h-11 w-full">
                <Plus className="size-4" aria-hidden="true" />
                {t('categories:businessTypes.add')}
              </Button>
            }
          />
        </div>

        <AlertDialog
          open={asking !== undefined}
          onOpenChange={(open) => {
            if (!open) setAsking(undefined);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('categories:businessTypes.movePast', { count: asking?.ids.length ?? 0 })}
              </AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('categories:businessTypes.movePastNo')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const ids = asking?.ids ?? [];
                  setAsking(undefined);
                  void movePast(ids);
                }}
              >
                {t('categories:businessTypes.movePastYes')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
