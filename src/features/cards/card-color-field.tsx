import { cn } from 'cn';
import { Check } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import type { CardIssuer } from '@/types/domain';

import { CARD_COLORS, issuerTint, type CardColor } from './card-colors';

/**
 * The card's colour, picked from swatches shaped like the card: its company's
 * colour to begin with, or one of the set. Native radios underneath, so the
 * arrow keys move through them and a screen reader hears "3 of 11".
 */
export function CardColorField({
  value,
  issuer,
  onChange,
}: {
  /** '' for the card company's colour. */
  readonly value: CardColor | '';
  /** Whose tint "the company's colour" is. */
  readonly issuer: CardIssuer | undefined;
  readonly onChange: (color: CardColor | '') => void;
}) {
  const { t } = useTranslation('cards');
  const name = useId();
  const options: readonly { readonly key: CardColor | ''; readonly gradient: string }[] = [
    { key: '', gradient: issuerTint(issuer) },
    ...CARD_COLORS,
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
                className={cn(
                  'flex h-9 w-14 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-sm ring-offset-2 ring-offset-background',
                  'peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
                  option.gradient,
                )}
              >
                {checked ? <Check className="size-4" aria-hidden="true" /> : null}
                {option.key === '' && !checked ? (
                  <span className="text-[10px] leading-none font-medium opacity-90">{t('color.auto')}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
