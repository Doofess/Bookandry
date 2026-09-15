import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { he, enUS } from 'react-day-picker/locale';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatLocalDate, fromPickerDate, toPickerDate } from '@/lib/dates';
import type { LocalDate } from '@/types/money';

/**
 * A date field, on the shadcn Calendar rather than `<input type="date">`.
 *
 * Two reasons, both from the plan and both invisible until they bite:
 *
 *  - A native date input follows the OPERATING SYSTEM's locale, not
 *    `document.documentElement.lang`. An Israeli on an English Windows box
 *    would get `mm/dd/yyyy` inside a Hebrew form - which no amount of `dir`
 *    fixes, because the control is drawn by the OS.
 *  - It cannot express a month RANGE, which the feed's filters need, so the
 *    app would carry two different date controls with two different
 *    behaviours.
 *
 * The Calendar takes a react-day-picker locale object; ours comes bundled with
 * the library, so this costs no extra dependency and no extra network.
 */
export function DateField({
  value,
  onChange,
  labelledBy,
  id,
  describedBy,
  invalid,
  disabled,
}: {
  readonly value: LocalDate;
  readonly onChange: (date: LocalDate) => void;
  readonly labelledBy: string;
  readonly id?: string;
  readonly describedBy?: string;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const rtl = i18n.dir() === 'rtl';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            // The label names the field; the button's own text is the value.
            aria-labelledby={labelledBy}
            className="h-11 w-full justify-between gap-2 px-3 font-normal"
          >
            <span className="truncate">{formatLocalDate(value, i18n.language, { dateStyle: 'full' })}</span>
            <CalendarIcon className="size-4 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          // Local-midday Dates in, local dates out. Handing react-day-picker a
          // UTC-parsed Date makes every viewer west of Greenwich see the
          // previous day selected, and clicking the right one then appears to
          // do nothing because it already IS the value.
          selected={toPickerDate(value)}
          defaultMonth={toPickerDate(value)}
          onSelect={(next) => {
            if (next === undefined) return;
            onChange(fromPickerDate(next));
            setOpen(false);
          }}
          locale={rtl ? he : enUS}
          dir={rtl ? 'rtl' : 'ltr'}
          // No autoFocus: Base UI's Popover already moves focus into the panel
          // when it opens, and a second claim on it fights the first.
          aria-label={t('tx.dateChoose')}
        />
      </PopoverContent>
    </Popover>
  );
}
