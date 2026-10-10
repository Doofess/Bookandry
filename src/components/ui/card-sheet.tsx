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
 * so a stack of them reads as a stack. 124px tall on a phone, 108px from lg.
 */
export function CardSheet({
  moneyKey,
  name,
  holder,
  lastDigits,
  billing,
  figure,
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
        '@container flex min-h-31 items-end justify-between gap-4 overflow-clip rounded-sheet-s px-5 pt-4 lg:min-h-27 lg:px-6.5 lg:pt-4.5',
        '[&:nth-child(even_of_[data-card-sheet])]:flex-row-reverse',
        '[&:nth-child(even_of_[data-card-sheet])_[data-slot=card-sheet-text]]:text-end',
        className,
      )}
    >
      <div data-slot="card-sheet-text" className="self-start pb-4">
        <h3 id={titleId} className="text-[1.1875rem] leading-[1.15] font-semibold lg:text-xl">
          {name}
        </h3>
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
      {figure === undefined ? null : <div className="min-w-0 shrink">{figure}</div>}
    </article>
  );
}
