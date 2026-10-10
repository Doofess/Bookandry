import { Check } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { issuerKey, type MoneyKey } from '@/domain/money-key';
import type { CardIssuer } from '@/types/domain';

import { CARD_COLORS, type CardColor } from './card-colors';

/**
 * The card's colour, picked from swatches shaped like the card: its company's
 * colour to begin with, or one of the set. Native radios underneath, so the
 * arrow keys move through them and a screen reader hears "3 of 11".
 *
 * Each swatch is a money sheet, so its check mark is drawn in the sheet's own
 * tint. `forced-color-adjust: none` keeps the colour in Windows High Contrast,
 * because here the colour is what is being chosen (§1.8).
 */
export function CardColorField({
  value,
  issuer,
  onChange,
}: {
  /** '' for the card company's colour. */
  readonly value: CardColor | '';
  /** Whose colour "the company's colour" is. */
  readonly issuer: CardIssuer | undefined;
  readonly onChange: (color: CardColor | '') => void;
}) {
  const { t } = useTranslation('cards');
  const name = useId();
  const options: readonly { readonly key: CardColor | ''; readonly money: MoneyKey }[] = [
    { key: '', money: issuerKey(issuer) },
    ...CARD_COLORS.map(({ key }) => ({ key, money: `card-${key}` as const })),
  ];
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{t('color.label')}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const label = t(option.key === '' ? 'color.issuer' : `color.${option.key}`);
          const checked = value === option.key;
          return (
            <label key={option.key || 'issuer'} className="cursor-pointer" title={label}>
              <input
                type="radio"
                name={name}
                value={option.key}
                checked={checked}
                onChange={() => {
                  onChange(option.key);
                }}
                aria-label={label}
                className="peer sr-only"
              />
              <span
                data-sheet="money"
                data-money={option.money}
                className="flex h-11 w-16 items-center justify-center rounded-md ring-offset-2 ring-offset-background forced-color-adjust-none peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-3 peer-focus-visible:ring-(--focus-ring)"
              >
                {checked ? <Check className="size-4" aria-hidden="true" /> : null}
                {option.key === '' && !checked ? (
                  <span className="text-[10px] leading-none font-medium">{t('color.auto')}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
