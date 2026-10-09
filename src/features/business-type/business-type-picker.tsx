import { cn } from 'cn';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useId, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { mccName, searchMcc } from '@/domain/mcc';

import { useMccList } from './use-mcc-list';

/**
 * Every business type, by name, in a searchable pop-out: the shared pop-out
 * plumbing (Popover, named by its title) around the pickers' cmdk list. The
 * list is filtered here (`searchMcc`), not by cmdk: a type is found by its
 * code, its English or its Hebrew, ignoring case, niqqud and final letters.
 *
 * Its trigger is the caller's: the form's field, or a category's "Add a
 * business type" button.
 */
export function BusinessTypePopout({
  trigger,
  value,
  onSelect,
  onClear,
}: {
  readonly trigger: ReactElement;
  readonly value: string;
  readonly onSelect: (code: string) => void;
  /** Offered when given and a type is chosen. */
  readonly onClear?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const list = useMccList();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const found = useMemo(
    () => (list === undefined ? [] : searchMcc(list, query, i18n.language)),
    [list, query, i18n.language],
  );
  const hebrew = i18n.language.startsWith('he');

  const close = (): void => {
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else close();
      }}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent className="w-(--anchor-width) min-w-72 gap-0 p-0" align="start">
        <PopoverTitle className="px-3 pt-3 pb-1">{t('businessType.label')}</PopoverTitle>
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={t('businessType.search')} />
          {/*
           * Keyed by the query: cmdk looks the selected row up in the DOM as each row
           * unmounts, so narrowing 981 rows one by one costs seconds, while a list
           * that unmounts as a whole (its ref already let go) costs nothing.
           */}
          <CommandList key={query}>
            {list === undefined ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('a11y.loading')}</p>
            ) : (
              <CommandEmpty>{t('businessType.empty')}</CommandEmpty>
            )}
            <CommandGroup>
              {found.map((entry) => (
                <CommandItem
                  key={entry.code}
                  value={entry.code}
                  onSelect={() => {
                    onSelect(entry.code);
                    close();
                  }}
                  className="min-h-11 gap-2"
                >
                  <span className="truncate">{hebrew ? entry.he : entry.en}</span>
                  <span className="ms-auto shrink-0 text-xs text-muted-foreground tabular-nums" dir="ltr">
                    {entry.code}
                  </span>
                  {entry.code === value ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {onClear === undefined || value === '' ? null : (
          <div className="border-t border-border p-1">
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full"
              onClick={() => {
                onClear();
                close();
              }}
            >
              {t('businessType.clear')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The form's "Business type" row: the type's name, or "Not set". Shows the
 * code itself until the names have loaded. `onChange('')` clears it.
 */
export function BusinessTypeField({
  value,
  onChange,
  labelledBy,
}: {
  readonly value: string;
  readonly onChange: (code: string) => void;
  readonly labelledBy: string;
}) {
  const { t, i18n } = useTranslation();
  const list = useMccList();
  const valueId = useId();
  const name =
    value === ''
      ? t('businessType.notSet')
      : ((list === undefined ? undefined : mccName(list, value, i18n.language)) ?? value);

  return (
    <BusinessTypePopout
      value={value}
      onSelect={onChange}
      onClear={() => {
        onChange('');
      }}
      trigger={
        <Button
          type="button"
          variant="outline"
          // Both ids, as PickerField does: the label alone would never say which type is chosen.
          aria-labelledby={`${labelledBy} ${valueId}`}
          className="h-11 w-full justify-between gap-2 px-3 font-normal"
        >
          <span id={valueId} className={cn('truncate', value === '' && 'text-muted-foreground')}>
            {name}
          </span>
          {/* A vertical chevron is non-directional: no rtl flip, by design. */}
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      }
    />
  );
}
