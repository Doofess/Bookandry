import { cn } from 'cn';
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CategoryIcon } from '@/components/category-icon';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTitle } from '@/components/ui/popover';
import { useAnchoredPopup } from '@/components/ui/popup-parts';
import { isInstallmentPlan } from '@/domain/tx-edit';
import { categoriesFor } from '@/domain/tx-options';
import { categoryDisplayName } from '@/i18n/category-name';
import type { Category, Occurrence } from '@/types/domain';
import type { LocalDate } from '@/types/money';

import { useFrequentCategories } from './use-frequent-categories';
import { PickerList } from '../transaction/picker-field';

export type CategoryTarget = { readonly occurrence: Occurrence; readonly anchor: HTMLElement };

/** Which occurrences a category change applies to: the edit form's scopes, as the pop-out offers them. */
export type CategoryScope = 'one' | 'future' | 'all';

/**
 * A row's category, changed from the row: ONE pop-out at screen level,
 * anchored to the chip that opened it, for the same reason as the row menu.
 *
 * A series asks first which occurrences the change is for, offering what the
 * edit form's scope offers for the same row: "only this time" or "from now
 * on", and for a plan (תשלומים, קרדיט) "only this time" or "every payment".
 * A plan is one agreement and never splits, so "from now on" would recolour
 * the payments already made too.
 */
export function CategoryPopout({
  target,
  categories,
  today,
  onClose,
  onChange,
}: {
  /** The row whose chip was tapped, with that chip; undefined when closed. */
  readonly target: CategoryTarget | undefined;
  readonly categories: ReadonlyMap<string, Category>;
  readonly today: LocalDate;
  readonly onClose: () => void;
  readonly onChange: (occurrence: Occurrence, categoryId: string, scope: CategoryScope) => void;
}) {
  const { t } = useTranslation();
  const { shown, anchor, popupRef, finalFocus } = useAnchoredPopup(target, onClose);

  return (
    <Popover
      open={target !== undefined}
      // Not modal: a modal pop-out locks the page's scroll, and this one closes
      // on scroll (it has an arrow). Its backdrop still catches a tap outside.
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverContent
        anchor={anchor}
        arrow
        closeOnScroll
        side="bottom"
        align="start"
        className="w-80"
        data-testid="category-popout"
        ref={popupRef}
        finalFocus={finalFocus}
      >
        <PopoverTitle>{t('categoryPop.title')}</PopoverTitle>
        {shown === undefined ? null : (
          <Chooser
            // A fresh chooser for each row: the series question never carries over.
            key={shown.occurrence.key}
            occurrence={shown.occurrence}
            categories={categories}
            today={today}
            onChange={(categoryId, scope) => {
              onChange(shown.occurrence, categoryId, scope);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The grid's categories before "More": `frequentCategories`' own count. */
const GRID_SIZE = 7;

type Step =
  | { readonly kind: 'grid' }
  | { readonly kind: 'all' }
  | { readonly kind: 'scope'; readonly categoryId: string };

function Chooser({
  occurrence,
  categories,
  today,
  onChange,
}: {
  readonly occurrence: Occurrence;
  readonly categories: ReadonlyMap<string, Category>;
  readonly today: LocalDate;
  readonly onChange: (categoryId: string, scope: CategoryScope) => void;
}) {
  const { t } = useTranslation(['common', 'categories']);
  const [step, setStep] = useState<Step>({ kind: 'grid' });
  const all = useMemo(() => [...categories.values()], [categories]);
  const { kind, recurrence } = occurrence.transaction;
  const frequent = useFrequentCategories(kind, occurrence.categoryId, all, today);
  const isSeries = recurrence.type !== 'one_time';
  // The edit form's ScopeChooser offers a plan this one or the whole plan, never a split.
  const wider: CategoryScope = isInstallmentPlan(recurrence) ? 'all' : 'future';
  const name = (id: string): string => {
    const category = categories.get(id);
    return category === undefined ? id : categoryDisplayName(category, t);
  };

  // Each step takes focus, so a keyboard user lands on it rather than on nothing.
  const firstScope = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step.kind === 'scope') firstScope.current?.focus();
    if (step.kind === 'all') list.current?.querySelector('input')?.focus();
  }, [step]);

  const choose = (categoryId: string): void => {
    if (categoryId === occurrence.categoryId) return;
    if (isSeries) setStep({ kind: 'scope', categoryId });
    else onChange(categoryId, 'one');
  };

  if (step.kind === 'scope') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{t('categoryPop.scopeQuestion', { name: name(step.categoryId) })}</p>
        <Button
          ref={firstScope}
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          onClick={() => {
            onChange(step.categoryId, 'one');
          }}
        >
          {t('categoryPop.scopeOne')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          onClick={() => {
            onChange(step.categoryId, wider);
          }}
        >
          {wider === 'all' ? t('categoryPop.scopeAll') : t('categoryPop.scopeFuture')}
        </Button>
      </div>
    );
  }

  if (step.kind === 'all') {
    return (
      <div ref={list}>
        <PickerList
          options={categoriesFor(all, kind, occurrence.categoryId).map((c) => ({
            id: c.id,
            label: categoryDisplayName(c, t),
            icon: <CategoryIcon name={c.icon} className="size-4 shrink-0" />,
          }))}
          value={occurrence.categoryId}
          onSelect={choose}
          searchPlaceholder={t('tx.categorySearch')}
          emptyText={t('tx.categoryEmpty')}
        />
      </div>
    );
  }

  return (
    <div role="group" aria-label={t('categoryPop.title')} className="grid grid-cols-4 gap-1.5">
      {/*
        Seven places of the cells' own size while the frequent ones load: with
        "More" alone, the arrowed pop-out grew when they came, and could flip.
      */}
      {frequent === undefined
        ? Array.from({ length: GRID_SIZE }, (_, i) => (
            <span
              key={i}
              data-slot="category-placeholder"
              aria-hidden="true"
              className="min-h-16 rounded-xl bg-muted/60 motion-safe:animate-pulse"
            />
          ))
        : null}
      {(frequent ?? []).map((category) => {
        const current = category.id === occurrence.categoryId;
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={current}
            onClick={() => {
              choose(category.id);
            }}
            className={cn(
              'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] leading-tight transition',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              current ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
            )}
          >
            <CategoryIcon name={category.icon} className="size-5" />
            <span className="line-clamp-2 text-center">{categoryDisplayName(category, t)}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => {
          setStep({ kind: 'all' });
        }}
        className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-[11px] text-foreground transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <MoreHorizontal className="size-5" strokeWidth={1.75} aria-hidden="true" />
        {t('categoryPop.more')}
      </button>
    </div>
  );
}
