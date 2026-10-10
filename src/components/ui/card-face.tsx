import { cn } from 'cn';
import { useTranslation } from 'react-i18next';

import type { MoneyKey } from '@/domain/money-key';

/** The last digits as a card prints them: digits only, never more than four (gate:pci). */
export function lastFour(digits: string | undefined): string | undefined {
  const only = (digits ?? '').replace(/\D/g, '');
  return only === '' ? undefined : only.slice(-4);
}

/**
 * A card as a card (§7.2): the ISO ratio, the face radius, its colour from a
 * key (`cardKey()`), its type sized by its own width (`cqi`). Its parts are
 * one picture to a screen reader, named "<issuer> ending <last4>".
 *
 * `preview` tilts it −4° (the add-card flow's preview, a decorative stack);
 * `details` lies flat. Its fill and text cross-fade in 150ms when the colour
 * changes, for everyone: a colour fade is not movement (§8.2).
 */
export function CardFace({
  moneyKey,
  issuerName,
  holder,
  lastDigits,
  network,
  later,
  variant = 'details',
  className,
}: {
  readonly moneyKey: MoneyKey;
  readonly issuerName: string;
  readonly holder?: string;
  readonly lastDigits?: string;
  /** The network's name, as printed ("Mastercard"). */
  readonly network?: string;
  /** A line about what comes later, where there is no network yet. */
  readonly later?: string;
  readonly variant?: 'preview' | 'details';
  readonly className?: string;
}) {
  const { t } = useTranslation();
  const last4 = lastFour(lastDigits);
  return (
    <div
      role="img"
      aria-label={last4 === undefined ? issuerName : t('sheets.cardName', { issuer: issuerName, last4 })}
      data-slot="card-face"
      data-sheet="money"
      data-money={moneyKey}
      className={cn(
        '@container grid aspect-[1.586] w-full grid-rows-[auto_1fr_auto] rounded-face px-[8%] pt-[7%]',
        'transition-colors duration-(--dur-press) ease-fill',
        variant === 'preview' && '-rotate-4 shadow-[0_2px_0_color-mix(in_oklch,var(--box)_25%,transparent)]',
        className,
      )}
    >
      <span aria-hidden="true" className="text-[9cqi] leading-[1.05] font-semibold">
        {issuerName}
      </span>
      {holder === undefined ? (
        <span aria-hidden="true" />
      ) : (
        <span aria-hidden="true" className="text-[5.6cqi] font-light">
          {holder}
        </span>
      )}
      <span aria-hidden="true" className="flex items-end justify-between gap-3 pb-[3cqi]">
        {last4 === undefined ? (
          <span />
        ) : (
          <span dir="ltr" className="text-[6cqi] tracking-[0.1em] [unicode-bidi:isolate]">
            •••• {last4}
          </span>
        )}
        <span className="text-[4.6cqi] font-light">{network ?? later}</span>
      </span>
    </div>
  );
}
