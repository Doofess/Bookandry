import { CalendarIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { he, enUS } from 'react-day-picker/locale';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  dateOrderFor,
  formatLocalDate,
  formatTypedDate,
  fromPickerDate,
  parseTypedDate,
  toPickerDate,
} from '@/lib/dates';
import type { LocalDate } from '@/types/money';

/** The calendar's year menu: back far enough for a standing order from years ago, forward for an end date. */
const FIRST_MONTH = new Date(1990, 0);
const LAST_MONTH = new Date(2100, 11);

/**
 * A date field you can type into, with a calendar beside it.
 *
 * Typed in the order the language writes dates: 11/01/2025 in English, as in
 * the US; 01/11/2025 in Hebrew, as in Israel - both the 1st of November. The
 * date in words is always spelled out underneath, so a date read the other
 * way round is caught before it is saved, not a month later in the feed.
 * Taken when the field is left or Enter is pressed, never mid-typing: "01/11/20"
 * is a valid date on the way to "01/11/2025".
 *
 * The calendar has month and year menus, so a standing order that began a year
 * ago is two choices away rather than twelve clicks back.
 *
 * Not `<input type="date">`: that follows the OPERATING SYSTEM's locale, not
 * the app's, and an Israeli on an English Windows box would get mm/dd/yyyy in
 * a Hebrew form.
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
  const readoutId = useId();
  const rtl = i18n.dir() === 'rtl';
  const order = dateOrderFor(i18n.language);
  const pattern = order === 'mdy' ? 'MM/DD/YYYY' : 'DD/MM/YYYY';

  // What is in the box. Re-written from the value whenever the value (or the
  // language) changes from outside - adjusted during render, React's own
  // pattern for state that follows a prop, rather than an effect.
  const shown = `${value}|${order}`;
  const [text, setText] = useState(() => formatTypedDate(value, order));
  const [shownFor, setShownFor] = useState(shown);
  const [unreadable, setUnreadable] = useState(false);
  if (shownFor !== shown) {
    setShownFor(shown);
    setText(formatTypedDate(value, order));
    setUnreadable(false);
  }

  const commit = (): void => {
    const parsed = parseTypedDate(text, order);
    if (parsed === undefined) {
      setUnreadable(true);
      return;
    }
    setUnreadable(false);
    if (parsed === value) setText(formatTypedDate(value, order));
    else onChange(parsed);
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          id={id}
          // Digits and slashes read left to right in Hebrew too; aligned to
          // the form's side all the same.
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          placeholder={pattern}
          className={rtl ? 'h-11 flex-1 text-end' : 'h-11 flex-1'}
          value={text}
          disabled={disabled}
          aria-labelledby={labelledBy}
          aria-describedby={[describedBy, readoutId].filter(Boolean).join(' ')}
          aria-invalid={invalid === true || unreadable}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              // Taken here, and kept from submitting the whole form with a
              // date it has not read yet.
              event.preventDefault();
              commit();
            }
          }}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                className="size-11 shrink-0"
                disabled={disabled}
                aria-label={t('tx.dateChoose')}
              >
                <CalendarIcon className="size-4" aria-hidden="true" />
              </Button>
            }
          />
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              captionLayout="dropdown"
              startMonth={FIRST_MONTH}
              endMonth={LAST_MONTH}
              // Local-midday Dates in, local dates out. Handing react-day-picker a
              // UTC-parsed Date makes every viewer west of Greenwich see the
              // previous day selected.
              selected={toPickerDate(value)}
              defaultMonth={toPickerDate(value)}
              onSelect={(next) => {
                if (next === undefined) return;
                onChange(fromPickerDate(next));
                setOpen(false);
              }}
              locale={rtl ? he : enUS}
              dir={rtl ? 'rtl' : 'ltr'}
              aria-label={t('tx.dateChoose')}
            />
          </PopoverContent>
        </Popover>
      </div>
      <p id={readoutId} className={unreadable ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
        {unreadable
          ? t('tx.dateUnreadable', { pattern })
          : formatLocalDate(value, i18n.language, { dateStyle: 'full' })}
      </p>
    </div>
  );
}
