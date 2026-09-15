import { useTranslation } from 'react-i18next';

import { CurrencySelect } from '@/components/currency-select';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Language } from '@/domain/locale-defaults';
import type { Currency } from '@/types/money';

/**
 * Language and currency.
 *
 * The two fields are deliberately NOT symmetrical, and the help text says so.
 * Language is a preference and switching it is free. The base currency is the
 * unit every stored `baseAmountMinor` is denominated in: changing it later
 * re-derives every amount in the database against historical rates. This screen
 * is the only moment that choice is free rather than an irreversible rewrite.
 *
 * Changing the language applies IMMEDIATELY, mid-wizard. A preview that waits
 * until the end is a preview of nothing - and for Hebrew the whole layout
 * flips, which the user should see before committing to it.
 */
export function StepLocale({
  language,
  currency,
  onLanguage,
  onCurrency,
}: {
  language: Language;
  currency: Currency;
  onLanguage: (language: Language) => void;
  onCurrency: (currency: Currency) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label id="first-run-language">{t('language.label')}</Label>
        <ToggleGroup
          value={[language]}
          onValueChange={(next) => {
            const picked = next[0];
            if (picked === 'en' || picked === 'he') onLanguage(picked);
          }}
          aria-labelledby="first-run-language"
          className="w-full"
        >
          <ToggleGroupItem value="en" className="h-11 flex-1">
            {t('language.en')}
          </ToggleGroupItem>
          <ToggleGroupItem value="he" className="h-11 flex-1">
            {t('language.he')}
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-sm text-muted-foreground">{t('firstRun.localeLanguageHelp')}</p>
      </div>

      <div className="space-y-2">
        <Label id="first-run-currency" htmlFor="first-run-currency-trigger">
          {t('currency.label')}
        </Label>
        <CurrencySelect
          id="first-run-currency-trigger"
          value={currency}
          onChange={onCurrency}
          aria-labelledby="first-run-currency"
        />
        <p className="text-sm text-muted-foreground">{t('firstRun.localeCurrencyHelp')}</p>
      </div>
    </div>
  );
}
