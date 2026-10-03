import { Globe } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { db } from '@/db/db';
import { writeSettings } from '@/db/repos/settings';
import { changeLanguage } from '@/i18n';
import type { Language } from '@/i18n/boot';
import { systemClock } from '@/lib/clock';

import { Engraving } from './engraving';

/**
 * The front door's frame: the brand, then the task.
 *
 * Wide screens split in two - the engraved brand panel on the reading-start
 * side, the form beside it. Phones stack them: the panel as a band across the
 * top, the form rising over its foot as a sheet. Every screen before the app
 * (signing in, creating an account, the second step) sits in this frame, so
 * the way in looks the same whoever arrives and whatever they have done
 * before.
 */
export function AuthLayout({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col bg-brand-deep lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]">
      <section className="relative isolate overflow-hidden text-brand-deep-foreground lg:sticky lg:top-0 lg:h-dvh">
        {/* On a phone the form sheet overlaps the panel's foot by 1.5rem: the engraving stops there, so its bands sit just above the sheet. */}
        <Engraving className="absolute inset-x-0 top-0 -z-10 h-[calc(100%-1.5rem)] w-full text-brand-vivid/45 lg:h-full rtl:-scale-x-100" />
        <div className="flex h-full flex-col px-6 pt-5 pb-16 sm:px-10 lg:px-14 lg:py-10">
          <header className="flex items-center justify-between gap-4">
            <Logo size={36} tone="inverse" decorative />
            <LanguageSwitch />
          </header>
          {/* The name is the hero: set large in the brand's face, the line under
              it saying what it is. */}
          <div className="mt-8 sm:mt-14 lg:mt-auto lg:mb-8">
            <p
              lang="en"
              dir="ltr"
              className="font-display text-[3.75rem] leading-none font-bold tracking-[-0.01em] sm:text-[5rem] lg:text-[7rem] rtl:text-end"
            >
              {t('app.name')}
            </p>
            <p className="mt-4 max-w-[24ch] font-display text-[1.375rem] leading-snug text-balance text-brand-deep-foreground/85 sm:text-[1.75rem] lg:mt-6 lg:text-[2.125rem]">
              {t('account.welcome.headline')}
            </p>
          </div>
        </div>
      </section>

      <main className="relative -mt-6 flex flex-1 flex-col rounded-t-3xl bg-background px-6 pt-9 pb-8 sm:px-10 lg:mt-0 lg:min-h-dvh lg:rounded-none lg:px-14 lg:py-10">
        <div className="mx-auto w-full max-w-sm lg:my-auto">{children}</div>
        <footer className="mx-auto mt-auto flex w-full max-w-sm justify-center gap-6 pt-12 text-xs text-muted-foreground lg:mt-0 lg:pt-0">
          {/* Plain links, not the router: pages of their own (public/), readable
              without signing in. */}
          <a
            className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            href="/privacy"
          >
            {t('account.welcome.privacy')}
          </a>
          <a
            className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            href="/terms"
          >
            {t('account.welcome.terms')}
          </a>
        </footer>
      </main>
    </div>
  );
}

/**
 * Before anyone signs in, the language is this device's choice, kept in its
 * settings. A globe and an outline, so it reads as a control at a glance -
 * as plain text in the corner it passed for decoration. It names the language
 * it switches TO, in that language's own script, as language pickers do.
 */
function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const other: Language = i18n.resolvedLanguage === 'he' ? 'en' : 'he';
  return (
    <Button
      type="button"
      variant="ghost"
      lang={other}
      className="h-9 gap-2 rounded-full border-white/35 px-3.5 text-sm text-brand-deep-foreground hover:bg-white/10 hover:text-brand-deep-foreground focus-visible:ring-white/50"
      onClick={() => {
        void writeSettings(db, { language: other }, systemClock.nowIso());
        void changeLanguage(other);
      }}
    >
      <Globe className="size-4" aria-hidden="true" />
      {t(`language.${other}`)}
    </Button>
  );
}
