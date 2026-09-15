import { cn } from 'cn';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { currencyName } from '@/i18n/money-format';
import { PINNED_CURRENCIES, SUPPORTED_CURRENCIES } from '@/lib/currency-list';
import type { Currency } from '@/types/money';

/**
 * The currency picker.
 *
 * A native `<select>` with 160 options is unusable on a phone, and shadcn's
 * Select is the same list without the search - so Popover + Command, which is
 * what the plan substituted for §2's `select`.
 *
 * NO FLAG EMOJI. Windows Chrome and Edge render no flag glyphs at all: Segoe UI
 * Emoji has no regional-indicator ligatures, so "IL" displays as the literal
 * letters I and L. Since that IS the target platform, the code badge is
 * unconditional rather than feature-detected at boot - a glyph measurement to
 * rediscover something already known is code that can only be wrong.
 */
export type CurrencySelectProps = {
  readonly value: Currency;
  readonly onChange: (currency: Currency) => void;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  /** Labels the trigger when there is no visible <label> pointing at it. */
  readonly 'aria-labelledby'?: string;
};

export function CurrencyBadge({ code, className }: { code: Currency; className?: string }) {
  return (
    <span
      dir="ltr"
      className={cn(
        'tabular inline-flex h-6 min-w-11 items-center justify-center rounded-md bg-muted px-1.5',
        'text-xs font-semibold tracking-wide text-muted-foreground',
        className,
      )}
    >
      {code}
    </span>
  );
}

export function CurrencySelect({
  value,
  onChange,
  id,
  disabled,
  className,
  'aria-labelledby': labelledBy,
}: CurrencySelectProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const valueId = useId();

  const locale = i18n.language;
  const named = useMemo(
    () =>
      SUPPORTED_CURRENCIES.map((code) => ({
        code,
        name: currencyName(code, locale),
      })),
    [locale],
  );

  // Mapped over PINNED_CURRENCIES, not filtered out of the alphabetical list:
  // filtering keeps A-Z order, which puts EUR first and buries ILS - the exact
  // "alphabetical from AED" problem the pinned group exists to solve.
  const pinned = useMemo(
    () => PINNED_CURRENCIES.map((code) => ({ code, name: currencyName(code, locale) })),
    [locale],
  );

  const select = (code: Currency): void => {
    onChange(code);
    setOpen(false);
  };

  const selectedName = currencyName(value, locale);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            /*
             * BOTH ids, in this order.
             *
             * `aria-labelledby` replaces the button's text content for the
             * accessible name, so pointing it at the field label alone gives
             * "Currency, button" and never says WHICH currency - the one piece
             * of information the control exists to convey. Referencing the
             * label and the value together restores "Currency US Dollar".
             */
            aria-labelledby={labelledBy === undefined ? valueId : `${labelledBy} ${valueId}`}
            className={cn('h-11 w-full justify-between gap-2 px-3 font-normal', className)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <CurrencyBadge code={value} />
              <span id={valueId} className="truncate">
                {selectedName}
              </span>
            </span>
            {/* Non-directional: a vertical chevron reads the same in both scripts. */}
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        }
      />
      <PopoverContent className="w-(--anchor-width) min-w-72 p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={t('currency.search')} />
          <CommandList>
            <CommandEmpty>{t('currency.empty')}</CommandEmpty>
            <CommandGroup heading={t('currency.suggested')}>
              {pinned.map((entry) => (
                <CurrencyOption
                  key={entry.code}
                  {...entry}
                  selected={entry.code === value}
                  onSelect={select}
                />
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading={t('currency.all')}>
              {named.map((entry) => (
                <CurrencyOption
                  key={entry.code}
                  {...entry}
                  selected={entry.code === value}
                  onSelect={select}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CurrencyOption({
  code,
  name,
  selected,
  onSelect,
}: {
  code: Currency;
  name: string;
  selected: boolean;
  onSelect: (code: Currency) => void;
}) {
  return (
    <CommandItem
      // Both the code and the localised name, so "ILS" and "shekel" both find
      // it - and in Hebrew, so does "שקל".
      value={`${code} ${name}`}
      onSelect={() => {
        onSelect(code);
      }}
      className="gap-2"
    >
      <CurrencyBadge code={code} />
      <span className="truncate">{name}</span>
      {/* A check mark, not colour alone: the selected row must be identifiable
          without perceiving hue. */}
      <Check className={cn('ms-auto size-4', selected ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
    </CommandItem>
  );
}
