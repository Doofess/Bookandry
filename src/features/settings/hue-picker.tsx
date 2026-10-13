import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { HUES, type HueToken } from '@/domain/category-hue';

/** Two rows of 44px pills, tone A above tone B (§1.4); colour is what is chosen, so forced colours keep it. */
export function HuePicker({
  value,
  onChange,
  legend,
}: {
  readonly value: HueToken | undefined;
  readonly onChange: (hue: HueToken) => void;
  readonly legend: string;
}) {
  const { t } = useTranslation('categories');
  const name = useId();
  const tones: readonly (readonly HueToken[])[] = [HUES, HUES.map((hue) => `${hue}-2` as const)];
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-base font-semibold">{legend}</legend>
      {tones.map((row, r) => (
        <div key={r} className="flex flex-wrap gap-1.5">
          {row.map((hue) => {
            const base = hue.replace(/-2$/, '') as (typeof HUES)[number];
            const label = r === 0 ? t(`hue.names.${base}`) : t('hue.tone2', { name: t(`hue.names.${base}`) });
            return (
              <label
                key={hue}
                title={label}
                className="relative grid size-11 cursor-pointer place-items-center rounded-full has-checked:shadow-[0_0_0_3px_var(--background),0_0_0_6px_var(--foreground)] has-focus-visible:outline-3 has-focus-visible:outline-offset-9 has-focus-visible:outline-ring"
              >
                <input
                  type="radio"
                  name={name}
                  value={hue}
                  checked={value === hue}
                  onChange={() => {
                    onChange(hue);
                  }}
                  aria-label={label}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                <i
                  aria-hidden="true"
                  data-hue={hue}
                  className="block size-8 rounded-full bg-hue [forced-color-adjust:none]"
                />
              </label>
            );
          })}
        </div>
      ))}
    </fieldset>
  );
}
