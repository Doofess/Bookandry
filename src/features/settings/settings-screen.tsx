import { ChevronRight, CreditCard, Repeat, Tags } from 'lucide-react';
import { useEffect, useId, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useAccount } from '@/app/account';
import { useSettings, useToday } from '@/app/app-context';
import { LINKED_ROUTES } from '@/app/routes';
import { CurrencyBadge } from '@/components/currency-select';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { db } from '@/db/db';
import { writeSettings } from '@/db/repos/settings';
import { AccountCard } from '@/features/account/account-card';
import { changeLanguage } from '@/i18n';
import { applyTheme, type Language, type Theme } from '@/i18n/boot';
import { systemClock } from '@/lib/clock';

import { DataCard } from './data-card';
import { RecentlyDeleted } from './recently-deleted';
import { ReconvertDialog } from './reconvert-dialog';

export function SettingsScreen() {
  const { t } = useTranslation(['common', 'categories']);
  const settings = useSettings();
  const today = useToday();
  const languageId = useId();
  const themeId = useId();

  const persisted = usePersisted();
  const signedIn = useAccount().status === 'signed_in';
  const [reconverting, setReconverting] = useState(false);

  /*
   * Both writes go through `writeSettings`, never straight to Dexie.
   *
   * That one gateway writes the row AND the `gb.boot` localStorage mirror the
   * pre-paint script reads. Splitting them - a store subscription, an effect -
   * puts the mirror one render behind, and the next cold start flashes the old
   * language or the light theme before correcting itself.
   */
  const setLanguage = (language: Language): void => {
    void writeSettings(db, { language }, systemClock.nowIso());
    void changeLanguage(language);
  };

  /*
   * `writeSettings` updates the boot mirror for the NEXT cold start; `applyTheme`
   * is the current one. Without it the choice does not take effect until a
   * reload, and a theme toggle that appears to do nothing is one people press twice.
   */
  const setTheme = (theme: Theme): void => {
    void writeSettings(db, { theme }, systemClock.nowIso());
    applyTheme(theme);
  };

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6 pb-24 lg:pb-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>

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
              onChange={setLanguage}
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
              onChange={setTheme}
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

      <div className="grid gap-2">
        <LinkCard
          icon={Repeat}
          to={LINKED_ROUTES.commitments}
          label={t('commitments.title')}
          hint={t('commitments.open')}
        />
        <LinkCard
          icon={Tags}
          to={LINKED_ROUTES.categories}
          label={t('categories:manage.title')}
          hint={t('categories:manage.open')}
        />
        <LinkCard
          icon={CreditCard}
          to={LINKED_ROUTES.paymentMethods}
          label={t('categories:manage.methodsTitle')}
          hint={t('categories:manage.methodsOpen')}
        />
      </div>

      <AccountCard />

      <DataCard
        lastExportedAt={settings.lastExportedAt}
        today={today}
        persisted={persisted}
        signedIn={signedIn}
      />

      <RecentlyDeleted />

      <ReconvertDialog
        open={reconverting}
        onOpenChange={setReconverting}
        currentCurrency={settings.defaultCurrency}
        today={today}
      />
    </section>
  );
}

function LinkCard({
  icon: Icon,
  to,
  label,
  hint,
}: {
  readonly icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  readonly to: string;
  readonly label: string;
  readonly hint: string;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      {/* Directional: it points the way the user is going, so it flips. */}
      <ChevronRight
        className="cn-rtl-flip size-4 shrink-0 text-muted-foreground rtl:rotate-180"
        aria-hidden="true"
      />
    </Link>
  );
}

/**
 * Whether the browser has promised to keep the database.
 *
 * `navigator.storage.persist()` is requested at boot and can be DENIED - a
 * best-effort store may be evicted when the device runs low on space, which is
 * exactly when the backup nudge stops being optional. Asked once, here, rather
 * than assumed anywhere.
 */
function usePersisted(): boolean | undefined {
  const [persisted, setPersisted] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (typeof navigator.storage.persisted !== 'function') return;

    void navigator.storage.persisted().then((value) => {
      if (!cancelled) setPersisted(value);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return persisted;
}
