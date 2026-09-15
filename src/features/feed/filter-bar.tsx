import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { hasActiveFilters, KINDS, type FeedFilters, type KindFilter } from '@/domain/feed-filters';

/**
 * Search and kind, written straight to the URL.
 *
 * The input is UNCONTROLLED by any store - its value comes from the URL and
 * goes back to the URL, with `replace: true` so twenty keystrokes do not become
 * twenty history entries the Android back button has to walk through.
 *
 * Nothing here debounces. `useDeferredValue` inside the feed already keeps
 * typing at input priority while the list re-renders behind it, which is the
 * better tool: a debounce delays the result even when there is time to spare.
 */
export function FilterBar({
  filters,
  onChange,
  onClear,
}: {
  filters: FeedFilters;
  onChange: (patch: Partial<FeedFilters>) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const active = hasActiveFilters(filters);

  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={filters.query}
          aria-label={t('filter.search')}
          placeholder={t('filter.searchPlaceholder')}
          onChange={(event) => {
            onChange({ query: event.target.value });
          }}
          className="h-10 ps-8"
        />
      </div>

      <ToggleGroup
        value={[filters.kind]}
        onValueChange={(next) => {
          const picked = next[0];
          if (isKind(picked)) onChange({ kind: picked });
        }}
        aria-label={t('filter.kind')}
        className="shrink-0"
      >
        <ToggleGroupItem value="all" className="h-10 px-2.5 text-xs">
          {t('filter.kindAll')}
        </ToggleGroupItem>
        <ToggleGroupItem value="income" className="h-10 px-2.5 text-xs">
          {t('filter.kindIncome')}
        </ToggleGroupItem>
        <ToggleGroupItem value="expense" className="h-10 px-2.5 text-xs">
          {t('filter.kindExpense')}
        </ToggleGroupItem>
      </ToggleGroup>

      {active ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0"
          aria-label={t('feed.clearFilters')}
          onClick={onClear}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

function isKind(value: string | undefined): value is KindFilter {
  return value !== undefined && (KINDS as readonly string[]).includes(value);
}
