import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { Money } from '@/components/money';
import type { HueToken } from '@/domain/category-hue';
import { sharesBp, sum } from '@/lib/money';
import type { Currency, Minor } from '@/types/money';

export type HueBarItem = {
  readonly id: string;
  readonly name: string;
  readonly minor: Minor;
  /** `categoryHue(category)` from src/domain/category-hue.ts. */
  readonly hue: HueToken;
};

/** The largest `limit` items, then the rest as one neutral "Other" (§1.4: 10 in a bar list, 7 in a strip). */
export function largestWithOther(
  items: readonly HueBarItem[],
  limit: number,
  otherName: string,
): HueBarItem[] {
  const sorted = [...items].sort((a, b) => b.minor - a.minor);
  if (sorted.length <= limit) return sorted;
  return [
    ...sorted.slice(0, limit),
    {
      id: 'other',
      name: otherName,
      minor: sum(sorted.slice(limit).map((item) => item.minor)),
      hue: 'neutral',
    },
  ];
}

/**
 * One 30px hue pill bar per category, at least 30px long, with its name and
 * amount beside it (§7.4). The bar is a mark (decision 10): hidden from
 * screen readers, never carrying text; the name and the amount carry the data.
 * Lengths are basis points from sharesBp(), turned into widths in CSS.
 */
export function HueBars({
  items,
  currency,
  limit = 10,
}: {
  readonly items: readonly HueBarItem[];
  readonly currency: Currency;
  readonly limit?: number;
}) {
  const { t } = useTranslation();
  const shown = largestWithOther(items, limit, t('sheets.other'));
  const shares = sharesBp(shown.map((item) => item.minor));
  return (
    <ul data-slot="hue-bars" className="grid gap-1.75">
      {shown.map((item, index) => (
        <li
          key={item.id}
          className="grid min-h-8 grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-3.5 text-base"
        >
          <span className="truncate">{item.name}</span>
          <span aria-hidden="true" className="block h-7.5">
            <i
              data-hue={item.hue}
              className="block h-full w-[calc(var(--bp)*0.01%)] min-w-7.5 rounded-full bg-hue"
              style={{ '--bp': String(shares[index] ?? 0) } as CSSProperties}
            />
          </span>
          <Money minor={item.minor} currency={currency} className="text-end font-medium" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Proportional segments 2px apart, so two that look alike still read as two
 * (§1.4) - the phone summary's thin strip. Hidden from screen readers: its
 * legend, or the bar list beside it, carries the data.
 */
export function MoneyStrip({
  items,
  limit = 7,
}: {
  readonly items: readonly HueBarItem[];
  readonly limit?: number;
}) {
  const shown = largestWithOther(items, limit, '');
  const shares = sharesBp(shown.map((item) => item.minor));
  return (
    <div aria-hidden="true" data-slot="money-strip" className="flex h-3 gap-0.5 overflow-clip rounded-full">
      {shown.map((item, index) => (
        <i
          key={item.id}
          data-hue={item.hue}
          className="block h-full basis-0 bg-hue"
          style={{ flexGrow: shares[index] ?? 0 }}
        />
      ))}
    </div>
  );
}
