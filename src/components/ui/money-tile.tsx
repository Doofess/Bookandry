import { cn } from 'cn';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { MoneyKey } from '@/domain/money-key';

import { Mark } from './mark';

/** A radio group of tiles: 2 across from a 440px container, 1 across below (§6.2). */
export function MoneyTileGroup({
  legend,
  children,
  className,
}: {
  readonly legend: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <fieldset
      className={cn('grid gap-2 border-0 p-0 @min-[27.5rem]:grid-cols-2 @min-[27.5rem]:gap-2.5', className)}
    >
      <legend className="sr-only">{legend}</legend>
      {children}
    </fieldset>
  );
}

/**
 * A selectable money sheet (§7.3): a native radio under the whole tile, so it
 * is selected on activation and a screen reader hears "2 of 7". Selected, it
 * gets two rings - paper inside ink - and "Selected ✓" in the box, so it is
 * never shown by colour alone; focus is a 3px outline 9px outside the rings.
 *
 * "Not listed" is transparent with a 2px ink edge, so it is not a sheet. The
 * flow's own choice list adds moving on after a pick, and keeps the arrow
 * keys from choosing (the add-card spec's `choice-list.tsx`).
 */
export function MoneyTile({
  name,
  value,
  checked,
  onChange,
  label,
  otherLabel,
  moneyKey,
  notListed = false,
}: {
  readonly name: string;
  readonly value: string;
  readonly checked: boolean;
  readonly onChange: (value: string) => void;
  /** The name, in 600. */
  readonly label: string;
  /** The other language's name, in 300 beside it. */
  readonly otherLabel?: string;
  readonly moneyKey?: MoneyKey;
  readonly notListed?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <label
      {...(notListed ? {} : { 'data-sheet': 'money', 'data-money': moneyKey ?? 'neutral' })}
      className={cn(
        'group relative grid min-h-17.5 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-tile px-5.5 py-2.5 lg:min-h-24',
        'transition-[box-shadow,scale] duration-(--dur-press) ease-fill motion-safe:active:scale-98',
        'has-checked:shadow-[0_0_0_3px_var(--paper),0_0_0_6px_var(--ink)]',
        'has-focus-visible:outline-3 has-focus-visible:outline-offset-9 has-focus-visible:outline-(--focus-ring)',
        notListed && 'border-2 border-transparent inset-ring-2 inset-ring-ink',
        'forced-colors:has-checked:border-[Highlight]',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => {
          onChange(value);
        }}
        className="absolute inset-0 m-0 cursor-pointer opacity-0"
      />
      <span className="text-[1.3125rem] leading-[1.1] font-semibold lg:text-2xl">{label}</span>
      {otherLabel === undefined ? null : (
        <span
          dir="auto"
          className="col-start-1 justify-self-start text-[0.9375rem] font-light group-has-checked:hidden"
        >
          {otherLabel}
        </span>
      )}
      <Mark className="col-start-2 row-start-1 hidden text-sm group-has-checked:inline-block">
        {t('sheets.selected')}
      </Mark>
    </label>
  );
}
