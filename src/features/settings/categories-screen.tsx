import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArchiveRestore, Pencil, Plus, Store, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ScreenPanel, ScreenTitle } from '@/app/screen-panel';
import { PanelSheet } from '@/components/brand-panel';
import { CategoryChip, CategoryIcon } from '@/components/category-icon';
import { ICON_NAMES } from '@/components/category-icons';
import { Segmented } from '@/components/segmented';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { db } from '@/db/db';
import { createCategory, deleteCategory, renameCategory, setCategoryArchived } from '@/db/repos/categories';
import { categoryDisplayName } from '@/i18n/category-name';
import { systemClock } from '@/lib/clock';
import { newId } from '@/lib/id';
import type { Category } from '@/types/domain';
import type { Kind } from '@/types/money';

import { BusinessTypesSheet } from './business-types-sheet';

/**
 * The category manager.
 *
 * Built-ins are archivable but not renameable or deletable, and the screen says
 * why rather than presenting controls that refuse: a built-in stores an i18n
 * KEY, not a name, so renaming one would strand that key and deleting it would
 * strand every install that shares the deterministic id. Archiving is the
 * honest equivalent - it hides the category without touching anything already
 * filed under it.
 */
export function CategoriesScreen() {
  const { t } = useTranslation(['common', 'categories']);
  const [kind, setKind] = useState<Kind>('expense');
  const [editing, setEditing] = useState<Category | 'new' | undefined>(undefined);
  const [deleting, setDeleting] = useState<Category | undefined>(undefined);
  /** The category whose business types are open, by id, so the sheet follows live edits. */
  const [typesOf, setTypesOf] = useState<string | undefined>(undefined);
  const kindId = useId();

  const data = useLiveQuery(async () => {
    const categories = await db.categories.toArray();
    const transactions = await db.transactions.toArray();

    const counts = new Map<string, number>();
    for (const tx of transactions) counts.set(tx.categoryId, (counts.get(tx.categoryId) ?? 0) + 1);

    return {
      categories: categories.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
      counts,
    };
  }, []);

  const all = data?.categories ?? [];
  const shown = all.filter((c) => c.kind === kind);
  // Somewhere to move things to. Deleting the only category of a kind would
  // leave its transactions pointing at nothing.
  const targets = (category: Category) => shown.filter((c) => c.id !== category.id && c.isArchived === 0);

  return (
    <section className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8">
      <ScreenPanel>
        <ScreenTitle>{t('categories:manage.title')}</ScreenTitle>
      </ScreenPanel>
      <PanelSheet className="space-y-4 px-4 pt-6">
        <p className="text-sm text-muted-foreground">{t('categories:manage.body')}</p>

        <Label id={kindId} className="sr-only">
          {t('filter.kind')}
        </Label>
        <Segmented<Kind>
          value={kind}
          labelledBy={kindId}
          onChange={setKind}
          options={[
            { value: 'expense', label: t('filter.kindExpense') },
            { value: 'income', label: t('filter.kindIncome') },
          ]}
        />

        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {kind === 'expense' ? t('categories:manage.emptyExpense') : t('categories:manage.emptyIncome')}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {shown.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                onEdit={() => {
                  setEditing(category);
                }}
                onDelete={() => {
                  setDeleting(category);
                }}
                onBusinessTypes={() => {
                  setTypesOf(category.id);
                }}
              />
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            setEditing('new');
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          {kind === 'expense' ? t('categories:manage.addExpense') : t('categories:manage.addIncome')}
        </Button>

        <CategoryEditor
          target={editing}
          kind={kind}
          onOpenChange={(open) => {
            if (!open) setEditing(undefined);
          }}
        />

        <DeleteCategoryDialog
          category={deleting}
          targets={deleting === undefined ? [] : targets(deleting)}
          count={deleting === undefined ? 0 : (data?.counts.get(deleting.id) ?? 0)}
          onOpenChange={(open) => {
            if (!open) setDeleting(undefined);
          }}
        />

        <BusinessTypesSheet
          category={all.find((c) => c.id === typesOf)}
          categories={all}
          onOpenChange={(open) => {
            if (!open) setTypesOf(undefined);
          }}
        />
      </PanelSheet>
    </section>
  );
}

function CategoryRow({
  category,
  onEdit,
  onDelete,
  onBusinessTypes,
}: {
  readonly category: Category;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onBusinessTypes: () => void;
}) {
  const { t } = useTranslation(['common', 'categories']);
  const name = categoryDisplayName(category, t);
  const isBuiltin = category.source === 'builtin';
  const isArchived = category.isArchived === 1;

  const toggleArchive = (): void => {
    void setCategoryArchived(db, category.id, !isArchived, systemClock.nowIso());
  };

  return (
    <li className={`flex items-center gap-3 p-3 ${isArchived ? 'opacity-60' : ''}`}>
      <CategoryChip icon={category.icon} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block text-xs text-muted-foreground">
          {isBuiltin ? t('categories:manage.builtIn') : null}
          {isBuiltin && isArchived ? ' · ' : null}
          {isArchived ? t('categories:manage.archived') : null}
        </span>
      </span>

      {/* Every expense category, built-in or the person's own, has business types (spec point 12). */}
      {category.kind === 'expense' ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label={`${t('categories:businessTypes.open')}: ${name}`}
          onClick={onBusinessTypes}
        >
          <Store className="size-4" aria-hidden="true" />
        </Button>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label={`${isArchived ? t('categories:manage.unarchive') : t('categories:manage.archive')}: ${name}`}
        onClick={toggleArchive}
      >
        {isArchived ? (
          <ArchiveRestore className="size-4" aria-hidden="true" />
        ) : (
          <Archive className="size-4" aria-hidden="true" />
        )}
      </Button>

      {/*
        Rename and delete are absent for a built-in, not disabled.
        A built-in stores an i18n key rather than a name, so renaming would
        strand the key and deleting would strand the deterministic id every
        other install shares. A greyed-out button invites the question; an
        absent one plus the sentence at the top answers it.
      */}
      {isBuiltin ? null : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={`${t('categories:manage.editTitle')}: ${name}`}
            onClick={onEdit}
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 text-destructive"
            aria-label={t('categories:manage.deleteTitle', { name })}
            onClick={onDelete}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </>
      )}
    </li>
  );
}

function CategoryEditor({
  target,
  kind,
  onOpenChange,
}: {
  readonly target: Category | 'new' | undefined;
  readonly kind: Kind;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(['common', 'categories']);
  const isNew = target === 'new';
  const existing = target === 'new' ? undefined : target;

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('Circle');
  const [seeded, setSeeded] = useState<string | undefined>(undefined);

  const nameId = useId();
  const iconId = useId();

  /*
   * Seeded during render against a key, not in an effect.
   *
   * An effect would paint one frame of the previous category's name before
   * correcting itself, and setState in an effect body is what the compiler
   * lint flags. Comparing the target's identity to what was last seeded is the
   * "derive state from props" pattern React documents.
   */
  const identity = target === undefined ? undefined : isNew ? 'new' : existing?.id;
  if (identity !== seeded) {
    setSeeded(identity);
    setName(existing === undefined || existing.source === 'builtin' ? '' : existing.name);
    setIcon(existing?.icon ?? 'Circle');
  }

  const save = async (): Promise<void> => {
    const now = systemClock.nowIso();
    try {
      if (isNew) await createCategory(db, newId(), { name, kind, icon }, now);
      else if (existing !== undefined) await renameCategory(db, existing.id, name, now);
      onOpenChange(false);
    } catch {
      toast.error(t('tx.toastFailed'));
    }
  };

  return (
    <Sheet open={target !== undefined} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isNew ? t('categories:manage.newTitle') : t('categories:manage.editTitle')}
          </SheetTitle>
        </SheetHeader>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() !== '') void save();
          }}
          className="space-y-4 px-4 pb-6"
        >
          <div className="space-y-1.5">
            <Label htmlFor={nameId}>{t('categories:manage.nameLabel')}</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              className="h-11"
            />
          </div>

          {/* The icon is fixed for an existing category: `renameCategory`
              renames, and a second write path for the icon alone would be a
              second place for the two to disagree. */}
          {isNew ? (
            <div className="space-y-1.5">
              <Label id={iconId}>{t('categories:manage.iconLabel')}</Label>
              <div role="radiogroup" aria-labelledby={iconId} className="flex flex-wrap gap-1.5">
                {ICON_NAMES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={option === icon}
                    aria-label={option}
                    onClick={() => {
                      setIcon(option);
                    }}
                    className={`flex size-11 items-center justify-center rounded-xl border transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      option === icon ? 'border-primary-ink bg-accent' : 'border-border hover:bg-muted'
                    }`}
                  >
                    <CategoryIcon name={option} className="size-4" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={name.trim() === ''} className="flex-1">
              {t('action.save')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function DeleteCategoryDialog({
  category,
  targets,
  count,
  onOpenChange,
}: {
  readonly category: Category | undefined;
  readonly targets: readonly Category[];
  readonly count: number;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(['common', 'categories']);
  const [reassignTo, setReassignTo] = useState<string | undefined>(undefined);
  const groupId = useId();

  const name = category === undefined ? '' : categoryDisplayName(category, t);
  const needsTarget = count > 0;
  const target = reassignTo ?? targets[0]?.id;
  const stuck = needsTarget && target === undefined;

  const remove = async (): Promise<void> => {
    if (category === undefined) return;
    try {
      await deleteCategory(
        db,
        category.id,
        target === undefined ? {} : { reassignTo: target },
        systemClock.nowIso(),
      );
      onOpenChange(false);
    } catch {
      toast.error(t('tx.toastFailed'));
    }
  };

  return (
    <AlertDialog
      open={category !== undefined}
      onOpenChange={(open) => {
        if (!open) setReassignTo(undefined);
        onOpenChange(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('categories:manage.deleteTitle', { name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {stuck
              ? t('categories:manage.deleteNoTarget', {
                  kind:
                    category?.kind === 'income'
                      ? t('categories:manage.kindIncome')
                      : t('categories:manage.kindExpense'),
                })
              : needsTarget
                ? t('categories:manage.deleteBody', { count })
                : t('categories:manage.deleteEmptyBody')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {stuck || !needsTarget ? null : (
          <div className="space-y-2 px-1">
            <Label id={groupId}>{t('categories:manage.deleteMoveTo')}</Label>
            <div role="radiogroup" aria-labelledby={groupId} className="grid gap-1.5">
              {targets.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={option.id === target}
                  onClick={() => {
                    setReassignTo(option.id);
                  }}
                  className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-start transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                    option.id === target ? 'border-primary-ink bg-accent' : 'border-border hover:bg-muted'
                  }`}
                >
                  <CategoryIcon name={option.icon} className="size-4 shrink-0" />
                  <span className="truncate text-sm">{categoryDisplayName(option, t)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
          {stuck ? null : (
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                void remove();
              }}
            >
              {t('action.delete')}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
