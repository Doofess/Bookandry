import { cn } from 'cn';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BankMark } from '@/components/brand-mark';
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
import { BANKS, bankByCode, bankName, type Bank, type BankGroup } from '@/domain/banks';

const GROUPS: readonly BankGroup[] = ['israel', 'merged', 'arab'];
const GROUP_KEY = {
  israel: 'accounts.edit.groupIsrael',
  merged: 'accounts.edit.groupMerged',
  arab: 'accounts.edit.groupArab',
} as const;

/** One width for every bank's mark, logo or not, so the names line up in a column. */
const MARK = 'w-16';

/** The code as it is printed before the branch: "12", "04". */
function printedCode(code: string): string {
  return code.padStart(2, '0');
}

/**
 * The bank picker: searchable by its Hebrew, English or Arabic name and by its
 * code, the way the currency picker is - 34 banks is too many for a row of
 * buttons and a native list cannot be searched.
 */
export function BankSelect({
  value,
  onChange,
  labelledBy,
  invalid,
  describedBy,
}: {
  readonly value: string;
  readonly onChange: (code: string) => void;
  readonly labelledBy: string;
  readonly invalid?: boolean;
  readonly describedBy?: string;
}) {
  const { t, i18n } = useTranslation('cards');
  const [open, setOpen] = useState(false);
  const valueId = useId();
  const selected = bankByCode(value);

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
            aria-labelledby={`${labelledBy} ${valueId}`}
            aria-invalid={invalid === true ? true : undefined}
            aria-describedby={describedBy}
            className="h-11 w-full justify-between gap-2 px-3 font-normal"
          >
            <span id={valueId} className="flex min-w-0 items-center gap-2">
              {selected === undefined ? (
                <span className="text-muted-foreground">{t('accounts.edit.bankChoose')}</span>
              ) : (
                <>
                  <BankMark code={selected.code} className={MARK} />
                  <CodeBadge code={selected.code} />
                  <span className="truncate">{bankName(selected, i18n.language)}</span>
                </>
              )}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        }
      />
      <PopoverContent className="w-(--anchor-width) min-w-72 p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLocaleLowerCase().includes(search.trim().replace(/^0+/, '').toLocaleLowerCase())
              ? 1
              : 0
          }
        >
          <CommandInput placeholder={t('accounts.edit.bankSearch')} />
          <CommandList>
            <CommandEmpty>{t('accounts.edit.bankEmpty')}</CommandEmpty>
            {GROUPS.map((group) => (
              <CommandGroup key={group} heading={t(GROUP_KEY[group])}>
                {BANKS.filter((bank) => bank.group === group).map((bank) => (
                  <BankOption
                    key={bank.code}
                    bank={bank}
                    selected={bank.code === selected?.code}
                    onSelect={() => {
                      onChange(bank.code);
                      setOpen(false);
                    }}
                  />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CodeBadge({ code }: { readonly code: string }) {
  return (
    <span
      dir="ltr"
      className="tabular inline-flex h-6 min-w-9 items-center justify-center rounded-md bg-muted px-1.5 text-xs font-semibold text-muted-foreground"
    >
      {printedCode(code)}
    </span>
  );
}

function BankOption({
  bank,
  selected,
  onSelect,
}: {
  readonly bank: Bank;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const { t, i18n } = useTranslation('cards');
  const now = bank.now === undefined ? undefined : bankByCode(bank.now);
  return (
    <CommandItem
      // Every name it goes by and its code, so "12", "Hapoalim", "הפועלים" and "بنك فلسطين" all find it.
      value={`${bank.code} ${printedCode(bank.code)} ${bank.he} ${bank.en} ${bank.ar ?? ''}`}
      onSelect={onSelect}
      className="items-start gap-2"
    >
      <BankMark code={bank.code} className={MARK} />
      <CodeBadge code={bank.code} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{bankName(bank, i18n.language)}</span>
        {bank.ar === undefined ? null : (
          <span lang="ar" dir="rtl" className="block truncate text-xs text-muted-foreground">
            {bank.ar}
          </span>
        )}
        {now === undefined ? null : (
          <span className="block truncate text-xs text-muted-foreground">
            {t('accounts.edit.mergedInto', { bank: bankName(now, i18n.language) })}
          </span>
        )}
      </span>
      <Check
        className={cn('ms-auto size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
        aria-hidden="true"
      />
    </CommandItem>
  );
}
