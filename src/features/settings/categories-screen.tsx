import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArchiveRestore, Pencil, Plus, Store, Trash2 } from 'lucide-react';
import { useId, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useSettings, useToday } from '@/app/app-context';
import { ScreenHead } from '@/app/screen-head';
import { CategoryChip, CategoryIcon } from '@/components/category-icon';
import { ICON_NAMES } from '@/components/category-icons';
import { Money } from '@/components/money';
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
import {
  EditorPanel,
  EditorPanelActions,
  EditorPanelContent,
  EditorPanelHeader,
  EditorPanelTitle,
} from '@/components/ui/editor-panel';
import { HuePill } from '@/components/ui/hue-pill';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetHead } from '@/components/ui/sheet-surface';
import { db } from '@/db/db';
import { createCategory, deleteCategory, renameCategory, setCategoryArchived } from '@/db/repos/categories';
import { totalsByCategory } from '@/domain/calculators';
import { categoryHue, leastUsedHue, type HueToken } from '@/domain/category-hue';
import { categoryDisplayName } from '@/i18n/category-name';
import { systemClock } from '@/lib/clock';
import { compareLocal } from '@/lib/dates';
import { newId } from '@/lib/id';
import { sharesBp } from '@/lib/money';
import { ALL_PROFILES, type Category } from '@/types/domain';
import type { Currency, Kind, Minor } from '@/types/money';

import { BusinessTypesSheet } from './business-types-sheet';
import { HuePicker } from './hue-picker';
import { monthWindow, useCandidates, useOccurrences } from '../feed/use-feed-data';

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
  const today = useToday();
  const { defaultCurrency } = useSettings();
  const window = useMemo(() => monthWindow(today), [today]);
  const candidates = useCandidates(ALL_PROFILES, window);
  const occurrences = useOccurrences(candidates, window, today);
  /** This month so far, per kind: what each category spent or took in. */
  const totals = useMemo(() => {
    const settled = (occurrences ?? []).filter(
      (o) => !o.isProjected && !o.isSkipped && compareLocal(o.date, today) <= 0,
    );
    const byKind = (k: Kind): ReadonlyMap<string, Minor> =>
      new Map(totalsByCategory(settled, k).map((row) => [row.categoryId, row.totalMinor]));
    return { expense: byKind('expense'), income: byKind('income') };
  }, [occurrences, today]);
  // Somewhere to move things to. Deleting the only category of a kind would
  // leave its transactions pointing at nothing.
  const targets = (category: Category) =>
    all.filter((c) => c.kind === category.kind && c.id !== category.id && c.isArchived === 0);

  return (
    <section className="px-3 pb-24 lg:px-0 lg:pb-8">
      <ScreenHead
        title={t('categories:manage.title')}
        actions={
          <Button
            type="button"
            variant="pill-solid"
            onClick={() => {
              setEditing('new');
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            {kind === 'expense' ? t('categories:manage.addExpense') : t('categories:manage.addIncome')}
          </Button>
        }
      />
      <div className="grid gap-sheet px-1 lg:px-0">
        <p className="text-sm text-muted-foreground">{t('categories:manage.body')}</p>

        <Label id={kindId} className="sr-only">
          {t('filter.kind')}
        </Label>
        <div>
          <Segmented<Kind>
            value={kind}
            labelledBy={kindId}
            onChange={setKind}
            options={[
              { value: 'expense', label: t('filter.kindExpense') },
              { value: 'income', label: t('filter.kindIncome') },
            ]}
          />
        </div>

        <div className="grid gap-sheet @wide/main:grid-cols-2 @wide/main:items-start">
          {(['expense', 'income'] as const).map((k) => {
            const rows = all.filter((c) => c.kind === k);
            const shares = sharesBp(rows.map((r) => totals[k].get(r.id) ?? 0));
            const largestBp = Math.max(1, ...shares);
            return (
              <Sheet
                key={k}
                kind="paper"
                data-slot={`categories-${k}`}
                className={k === kind ? 'min-w-0' : 'hidden min-w-0 @wide/main:block'}
              >
                <SheetHead
                  className="mt-1.5"
                  title={t(`categories:screen.${k}`)}
                  subtitle={t('categories:screen.thisMonth')}
                />
                {rows.length === 0 ? (
                  <p className="mt-3.5 font-light">
                    {k === 'expense'
                      ? t('categories:manage.emptyExpense')
                      : t('categories:manage.emptyIncome')}
                  </p>
                ) : (
                  <ul className="mt-3.5 grid">
                    {rows.map((category, index) => (
                      <CategoryRow
                        key={category.id}
                        category={category}
                        total={totals[k].get(category.id) ?? 0}
                        bp={shares[index] ?? 0}
                        bpMax={largestBp}
                        currency={defaultCurrency}
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
              </Sheet>
            );
          })}
        </div>

        <CategoryEditor
          target={editing}
          kind={kind}
          siblings={shown}
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
      </div>
    </section>
  );
}

function CategoryRow({
  category,
  total,
  bp,
  bpMax,
  currency,
  onEdit,
  onDelete,
  onBusinessTypes,
}: {
  readonly category: Category;
  /** This month's total, in the base currency. */
  readonly total: Minor;
  /** Its bar against the largest in the sheet, in basis points. */
  readonly bp: number;
  readonly bpMax: number;
  readonly currency: Currency;
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
    <li
      data-slot="category-row"
      className={`grid min-h-16 grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,40%)_auto] items-center gap-3 border-be-2 border-border py-2 last:border-be-0 ${isArchived ? 'opacity-60' : ''}`}
    >
      <HuePill hue={categoryHue(category)} />
      <CategoryChip icon={category.icon} />

      <span className="min-w-0">
        <span className="block truncate text-[1.0625rem] font-semibold">{name}</span>
        <span className="block text-sm font-light">
          {isBuiltin ? t('categories:manage.builtIn') : null}
          {isBuiltin && isArchived ? ' · ' : null}
          {isArchived ? t('categories:manage.archived') : null}
        </span>
      </span>

      {/* This month's total as a hue bar against the sheet's largest; a category with nothing draws none. */}
      <span data-slot="hue-bars" className="flex min-w-0 flex-col items-end gap-1">
        {total <= 0 ? null : (
          <>
            <span aria-hidden="true" className="block h-7.5 w-full">
              <i
                data-hue={categoryHue(category)}
                className="block h-full w-[calc(var(--bp)/var(--bp-max)*100%)] min-w-7.5 rounded-full bg-hue"
                style={{ '--bp': String(bp), '--bp-max': String(bpMax) } as CSSProperties}
              />
            </span>
            <Money minor={total} currency={currency} className="text-sm font-medium" />
          </>
        )}
      </span>

      <span className="flex items-center">
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
      </span>
    </li>
  );
}

function CategoryEditor({
  target,
  kind,
  siblings,
  onOpenChange,
}: {
  readonly target: Category | 'new' | undefined;
  readonly kind: Kind;
  /** The categories of this kind, for choosing a new one's hue. */
  readonly siblings: readonly Category[];
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(['common', 'categories']);
  const isNew = target === 'new';
  const existing = target === 'new' ? undefined : target;

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('Circle');
  const [hue, setHue] = useState<HueToken | undefined>(undefined);
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
    setHue(existing === undefined ? leastUsedHue(siblings) : categoryHue(existing));
  }

  const save = async (): Promise<void> => {
    const now = systemClock.nowIso();
    try {
      if (isNew)
        await createCategory(db, newId(), { name, kind, icon, ...(hue === undefined ? {} : { hue }) }, now);
      else if (existing !== undefined)
        await renameCategory(db, existing.id, name, now, hue === undefined ? {} : { hue });
      onOpenChange(false);
    } catch {
      toast.error(t('tx.toastFailed'));
    }
  };

  return (
    <EditorPanel open={target !== undefined} onOpenChange={onOpenChange}>
      <EditorPanelContent>
        <EditorPanelHeader>
          <EditorPanelTitle>
            {isNew ? t('categories:manage.newTitle') : t('categories:manage.editTitle')}
          </EditorPanelTitle>
        </EditorPanelHeader>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() !== '') void save();
          }}
          data-slot="editor-panel-body"
          className="space-y-4 px-5 pb-6 lg:px-7"
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

          <HuePicker legend={t('categories:hue.label')} value={hue} onChange={setHue} />

          <EditorPanelActions>
            <Button
              type="button"
              variant="pill"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t('action.cancel')}
            </Button>
            <Button type="submit" variant="pill-solid" disabled={name.trim() === ''}>
              {t('action.save')}
            </Button>
          </EditorPanelActions>
        </form>
      </EditorPanelContent>
    </EditorPanel>
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
