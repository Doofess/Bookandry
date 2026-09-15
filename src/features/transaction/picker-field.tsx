import { cn } from 'cn';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * A searchable single-choice field.
 *
 * Popover + Command rather than a Select, for the reason the currency picker
 * already established: these lists are long enough that scanning beats
 * scrolling, and searching matches the DISPLAYED name, so in Hebrew "מצרכים"
 * finds Groceries without the English key ever leaking into the UI.
 *
 * Shared by the category and payment-method fields so the two cannot drift into
 * different keyboard behaviour - which is exactly what happens when a second
 * picker is written by copying the first.
 */

/** Stand-in for an option whose id is the empty string. Never shown. */
const EMPTY_VALUE = 'picker-empty-option';

export type PickerOption = {
  readonly id: string;
  /** The text shown, searched, and used as the accessible name. */
  readonly label: string;
  readonly icon?: ReactNode;
  readonly hint?: string;
};

export function PickerField({
  value,
  onChange,
  options,
  labelledBy,
  placeholder,
  searchPlaceholder,
  emptyText,
  invalid,
  describedBy,
  disabled,
}: {
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly options: readonly PickerOption[];
  /** Id of the visible label. */
  readonly labelledBy: string;
  readonly placeholder: string;
  readonly searchPlaceholder: string;
  readonly emptyText: string;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  readonly disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const valueId = useId();

  const selected = options.find((option) => option.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            disabled={disabled}
            /*
             * BOTH ids, in this order.
             *
             * `aria-labelledby` REPLACES the button's text content for the
             * accessible name, so pointing it at the field label alone gives
             * "Category, button" and never says which one is chosen - the one
             * piece of information the control exists to convey.
             */
            aria-labelledby={`${labelledBy} ${valueId}`}
            className="h-11 w-full justify-between gap-2 px-3 font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              {selected?.icon}
              <span
                id={valueId}
                className={cn('truncate', selected === undefined && 'text-muted-foreground')}
              >
                {selected?.label ?? placeholder}
              </span>
            </span>
            {/* A vertical chevron is non-directional: no rtl flip, by design. */}
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        }
      />
      <PopoverContent className="w-(--anchor-width) min-w-64 p-0" align="start">
        <Command
          /*
           * Items are keyed by ID and searched by KEYWORD.
           *
           * cmdk needs each item's `value` to be unique - two cards both called
           * "Visa" would otherwise share one selection - and it needs the search
           * to match what the user can actually read. Those are different
           * strings, so the id is the value and the label is a keyword, rather
           * than both crammed into one string behind a separator that some
           * label will eventually contain.
           *
           * Substring rather than cmdk's default fuzzy scorer, matching the
           * currency picker: on a list of short nouns, fuzzy ranking surfaces
           * surprising matches ahead of the obvious one.
           */
          filter={(_value, search, keywords) =>
            (keywords ?? []).join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  // cmdk treats an empty value as "no value" and the item stops
                  // being selectable, so the "not specified" choice - whose id
                  // IS the empty string - needs a stand-in here.
                  value={option.id === '' ? EMPTY_VALUE : option.id}
                  keywords={[option.label]}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                  {option.hint === undefined ? null : (
                    <span className="truncate text-xs text-muted-foreground">{option.hint}</span>
                  )}
                  {option.id === value ? (
                    <Check className="ms-auto size-4 shrink-0" aria-hidden="true" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
