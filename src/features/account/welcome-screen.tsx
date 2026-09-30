import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';

import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { db } from '@/db/db';
import { writeSettings } from '@/db/repos/settings';
import { DEMO_PREFIX } from '@/domain/demo';
import { changeLanguage } from '@/i18n';
import type { Language } from '@/i18n/boot';
import { systemClock } from '@/lib/clock';

import { SignIn } from './account-sheet';

/**
 * The front door. Everyone starts here: signing in brings an existing
 * account's data to this device and opens the app; creating an account leads
 * to setting it up. Nothing of the app is shown before one or the other.
 */
export function WelcomeScreen() {
  const { t, i18n } = useTranslation();
  // Data from before accounts (or from using the app signed out): it is not
  // lost - the account it signs in to receives it. Sample data never counts.
  const localData = useLiveQuery(async () => {
    const ids = await db.profiles.toCollection().primaryKeys();
    return ids.some((id) => !id.startsWith(DEMO_PREFIX));
  }, []);

  const setLanguage = (language: Language): void => {
    void writeSettings(db, { language }, systemClock.nowIso());
    void changeLanguage(language);
  };
  const other: Language = i18n.resolvedLanguage === 'he' ? 'en' : 'he';

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <Logo size={32} title={t('app.name')} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          lang={other}
          onClick={() => {
            setLanguage(other);
          }}
        >
          {t(`language.${other}`)}
        </Button>
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('app.name')}</h1>
        <p className="text-sm text-muted-foreground">{t('account.welcome.tagline')}</p>
      </div>
      {localData === true ? (
        <p role="note" className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
          {t('account.welcome.localData')}
        </p>
      ) : null}
      <SignIn initial="signin" onDone={() => undefined} />
      {/* Plain links, not the router: these are pages of their own (public/),
          readable without signing in. */}
      <footer className="flex justify-center gap-4 text-xs text-muted-foreground">
        <a className="underline-offset-4 hover:underline" href="/privacy">
          {t('account.welcome.privacy')}
        </a>
        <a className="underline-offset-4 hover:underline" href="/terms">
          {t('account.welcome.terms')}
        </a>
      </footer>
    </main>
  );
}
