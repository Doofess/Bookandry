import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { db } from '@/db/db';
import { ALL_PROFILES } from '@/types/domain';

import { useSettings } from './app-context';

/** Good morning before noon, good afternoon until six, good evening after (and before dawn). */
// eslint-disable-next-line react-refresh/only-export-components -- the top bar's parts live together (plan, Task 6)
export function greetingKey(hour: number): 'topbar.morning' | 'topbar.afternoon' | 'topbar.evening' {
  if (hour >= 5 && hour < 12) return 'topbar.morning';
  if (hour >= 12 && hour < 18) return 'topbar.afternoon';
  return 'topbar.evening';
}

/** Who the greeting is for: the person in view, else the household's first person. */
// eslint-disable-next-line react-refresh/only-export-components -- the top bar's parts live together (plan, Task 6)
export function useGreetingName(): string | undefined {
  const active = useSettings().activeProfileId;
  return useLiveQuery(async () => {
    const people = (await db.profiles.toArray()).sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
    return (active === ALL_PROFILES ? people[0] : people.find((p) => p.id === active))?.name;
  }, [active]);
}

/** The feed's search as the concept's 48px pill: a 2px line, a 20px icon, the hint in 300. */
export function SearchPill({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <label
      data-slot="search-pill"
      className={cn(
        'flex min-h-12 min-w-70 items-center gap-2.5 rounded-full border-2 border-border px-4.5 text-muted-foreground',
        'has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-3 has-[input:focus-visible]:outline-ring',
      )}
    >
      <Search className="size-5 shrink-0" aria-hidden="true" />
      <input
        type="search"
        value={value}
        aria-label={t('filter.search')}
        placeholder={t('topbar.search')}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="min-w-0 flex-1 bg-transparent text-base font-light text-foreground outline-transparent placeholder:text-muted-foreground"
      />
    </label>
  );
}
