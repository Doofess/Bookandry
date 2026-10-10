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
 */
export function CardSheet({
  moneyKey,
  name,
  holder,
  lastDigits,
  billing,
  figure,
  as: Title = 'h3',
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
  readonly className?: string;
}) {
  const titleId = useId();
  const last4 = lastFour(lastDigits);
  return (
    <article
      aria-labelledby={titleId}
      data-card-sheet=""
      data-sheet="money"
      data-money={moneyKey}
      className={cn(
        '@container flex min-h-31 items-end justify-between gap-4 overflow-clip rounded-sheet-s px-5 pt-4 @board/main:min-h-27 @board/main:px-6.5 @board/main:pt-4.5',
        '[&:nth-child(even_of_[data-card-sheet])]:flex-row-reverse',
        '[&:nth-child(even_of_[data-card-sheet])_[data-slot=card-sheet-text]]:text-end',
        '[&:nth-child(even_of_[data-card-sheet])_[data-numeral]]:ms-0 [&:nth-child(even_of_[data-card-sheet])_[data-numeral]]:me-auto',
        className,
      )}
    >
      <div data-slot="card-sheet-text" className="self-start pb-4">
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
          className="min-w-0 flex-1 [&_[data-numeral]]:ms-auto [&_[data-numeral]]:w-fit"
        >
          {figure}
        </div>
      )}
    </article>
  );
}
