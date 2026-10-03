import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSettings, useToday } from '@/app/app-context';
import { chooseLanguage, chooseTheme } from '@/app/preferences';
import { CurrencyBadge } from '@/components/currency-select';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { Language, Theme } from '@/i18n/boot';

import { ReconvertDialog } from './reconvert-dialog';
import { SettingsPage } from './settings-page';

/** Settings > Preferences: how the app looks and speaks, and the currency it counts in. */
export function PreferencesScreen() {
  const { t } = useTranslation();
  const settings = useSettings();
  const today = useToday();
  const languageId = useId();
  const themeId = useId();
  const [reconverting, setReconverting] = useState(false);

  return (
    <SettingsPage title={t('settings.sections.preferences')}>
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.appearance')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label id={languageId}>{t('language.label')}</Label>
            <Segmented<Language>
              value={settings.language}
              labelledBy={languageId}
              onChange={chooseLanguage}
              options={[
                { value: 'en', label: t('language.en') },
                { value: 'he', label: t('language.he') },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label id={themeId}>{t('theme.label')}</Label>
            <Segmented<Theme>
              value={settings.theme}
              labelledBy={themeId}
              onChange={chooseTheme}
              size="sm"
              options={[
                { value: 'light', label: t('theme.light') },
                { value: 'dark', label: t('theme.dark') },
                { value: 'system', label: t('theme.system') },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.baseCurrency')}</CardTitle>
          <CardDescription>{t('settings.baseCurrencyBody')}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          {/*
            A badge and a button, not a picker.
            Changing this rewrites every stored amount, so it goes through a
            flow with a forced backup and a progress bar rather than a control
            that re-denominates a decade of history on a mis-tap.
          */}
          <CurrencyBadge code={settings.defaultCurrency} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setReconverting(true);
            }}
          >
            {t('reconvert.change')}
          </Button>
        </CardContent>
      </Card>

      <ReconvertDialog
        open={reconverting}
        onOpenChange={setReconverting}
        currentCurrency={settings.defaultCurrency}
        today={today}
      />
    </SettingsPage>
  );
}
