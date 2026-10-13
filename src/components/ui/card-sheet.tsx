import { cn } from 'cn';
import { useId, type ReactNode } from 'react';

import type { MoneyKey } from '@/domain/money-key';

import { lastFour } from './card-face';
import { Mark } from './mark';

/**
 * A card as a sheet (§7.1): its company's or its own colour, its name in
 * 600, the holder and last 4 in 300, the billing day in the box, and this
 * month's spend as a numeral that runs off the foot at half depth (§9.4).
 *
 * Sides swap from sheet to sheet (`:nth-child(even of [data-card-sheet])`),
 * so a stack of them reads as a stack. 124px tall on a phone, 108px when its board's main is wide (a container query, not the viewport).
 *
 * With `onOpen` the whole sheet is one button that chooses the card (§5.3);
 * `menu` (the card's ⋯) sits above it, on the figure's side.
 */
export function CardSheet({
  moneyKey,
  name,
  holder,
  lastDigits,
  billing,
  figure,
  as: Title = 'h3',
  onOpen,
  openLabel,
  selected,
  menu,
  className,
}: {
  readonly moneyKey: MoneyKey;
  readonly name: string;
  readonly holder?: string;
  readonly lastDigits?: string;
  /** The billing day, worded ("Bills on the 10th"). */
  readonly billing?: string;
  /** This month's spend: a `<Numeral size="card" />`. */
  readonly figure?: ReactNode;
  /** The heading level the name is drawn at. */
  readonly as?: 'h2' | 'h3';
  /** Choose this card. */
  readonly onOpen?: () => void;
  /** The open button's name ("Details of Max"). */
  readonly openLabel?: string;
  /** This is the card whose details are open. */
  readonly selected?: boolean;
  /** The card's own menu: a ⋯ button. */
  readonly menu?: ReactNode;
  readonly className?: string;
}) {
  const titleId = useId();
  const last4 = lastFour(lastDigits);
  const opens = onOpen !== undefined;
  return (
    <article
      aria-labelledby={titleId}
      data-card-sheet=""
      data-sheet="money"
      data-money={moneyKey}
      className={cn(
        '@container relative flex min-h-31 items-end justify-between gap-4 overflow-clip rounded-sheet-s border-0 px-5 pt-4 @board/main:min-h-27 @board/main:px-6.5 @board/main:pt-4.5 forced-colors:border-2',
        '[&:nth-child(even_of_[data-card-sheet])]:flex-row-reverse',
        '[&:nth-child(even_of_[data-card-sheet])_[data-slot=card-sheet-text]]:text-end',
        '[&:nth-child(even_of_[data-card-sheet])_[data-slot=card-sheet-figure]>span]:justify-items-start',
        selected === true && 'shadow-[0_0_0_3px_var(--background),0_0_0_6px_var(--foreground)]',
        className,
      )}
    >
      {opens ? (
        // The whole sheet opens its card: a real button its own size, under the text and the menu.
        <button
          type="button"
          data-slot="card-open"
          onClick={onOpen}
          aria-label={openLabel}
          aria-current={selected === true ? 'true' : undefined}
          className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-3 focus-visible:-outline-offset-6 focus-visible:outline-current active:bg-current/10"
        />
      ) : null}
      {menu === undefined ? null : (
        <div
          data-slot="card-sheet-menu"
          className="inset-ie-1 [[data-card-sheet]:nth-child(even_of_[data-card-sheet])>&]:inset-ie-auto [[data-card-sheet]:nth-child(even_of_[data-card-sheet])>&]:inset-is-1 absolute -inset-bs-1 z-2"
        >
          {menu}
        </div>
      )}
      <div
        data-slot="card-sheet-text"
        className={cn('self-start pb-4', opens && 'pointer-events-none relative z-1')}
      >
        <Title id={titleId} className="text-[1.1875rem] leading-[1.15] font-semibold @board/main:text-xl">
          {name}
        </Title>
        {holder === undefined && last4 === undefined ? null : (
          <p className="text-[0.9375rem] font-light">
            {holder}
            {holder !== undefined && last4 !== undefined ? ' · ' : null}
            {last4 === undefined ? null : (
              <span dir="ltr" className="[unicode-bidi:isolate]">
                •••• {last4}
              </span>
            )}
          </p>
        )}
        {billing === undefined ? null : <Mark className="mt-2 inline-block text-[0.8125rem]">{billing}</Mark>}
      </div>
      {figure === undefined ? null : (
        // The free width, so the numeral fits what is left beside the name; it hugs the far side.
        <div
          data-slot="card-sheet-figure"
          className={cn(
            'min-w-0 flex-1 [&_[data-numeral]]:w-fit [&>span]:grid [&>span]:justify-items-end',
            opens && 'pointer-events-none relative z-1',
          )}
        >
          {figure}
        </div>
      )}
    </article>
  );
}
