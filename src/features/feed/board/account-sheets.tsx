import { Numeral } from '@/components/ui/numeral';
import { Sheet } from '@/components/ui/sheet-surface';
import type { MoneyKey } from '@/domain/money-key';
import type { Currency, Minor } from '@/types/money';

export type AccountItem = {
  readonly id: string;
  readonly moneyKey: MoneyKey;
  /** The bank's name, 600. */
  readonly name: string;
  /** The account's own name and what is next, 300. */
  readonly label: string;
  /** Its 52px figure (no bleed): the next money in, or the cash on hand. */
  readonly figure?: Minor;
};

/**
 * The accounts as small sheets in their banks' colours, tilted like a
 * stack of cards (§9.1: odd −1.2°, even +1° and 18px toward the inline end),
 * with a 2px foot shadow. Decorative tilt only: each is a list item a screen
 * reader reads straight.
 */
export function AccountSheets({
  items,
  currency,
}: {
  readonly items: readonly AccountItem[];
  readonly currency: Currency;
}) {
  return (
    <ul data-slot="account-sheets" className="grid content-end gap-2.5 pbs-1">
      {items.map((item) => (
        <Sheet
          key={item.id}
          as="li"
          kind="money"
          moneyKey={item.moneyKey}
          radius="row"
          data-slot="account-sheet"
          className={
            'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-0 px-5.5! py-3! ' +
            'shadow-[0_2px_0_color-mix(in_oklch,var(--box)_25%,transparent)] ' +
            'last:pb-6.5! odd:-rotate-[1.2deg] even:ms-4.5 even:rotate-1'
          }
        >
          <div className="min-w-0">
            <span className="block h-[1.2em] text-lg leading-[1.2]! font-semibold">{item.name}</span>
            <span className="block h-[1.55em] text-[0.9375rem] font-light">{item.label}</span>
          </div>
          {item.figure === undefined ? null : (
            <Numeral minor={item.figure} currency={currency} size="account" rounded className="-my-3" />
          )}
        </Sheet>
      ))}
    </ul>
  );
}
