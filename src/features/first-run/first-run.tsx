import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAccount } from '@/app/account';
import { useToday } from '@/app/app-context';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { db } from '@/db/db';
import { completeFirstRun } from '@/db/first-run';
import { isDemoSupported } from '@/domain/demo';
import { initialDraft, isDraftValid, type FirstRunDraft } from '@/domain/first-run';
import { detectLocaleDefaults, type Language } from '@/domain/locale-defaults';
import { AccountCard } from '@/features/account/account-card';
import i18n from '@/i18n';
import { applyDocumentChrome, readStoredBootMirror } from '@/i18n/boot';
import { systemClock } from '@/lib/clock';
import { newId } from '@/lib/id';

import { StepBalance } from './step-balance';
import { StepLocale } from './step-locale';
import { StepPeople } from './step-people';

const STEPS = ['locale', 'people', 'balance'] as const;

/**
 * Progress as a committed table, not as arithmetic.
 *
 * `(index + 1) / STEPS.length * 100` is a percentage rather than money, but
 * `gate:money` cannot tell the difference and is right not to try - the rule
 * that catches a stray `* 100` on an amount is worth more than the convenience
 * of computing three constants.
 */
const STEP_PERCENT = [33, 66, 100] as const;
type Step = (typeof STEPS)[number];

/**
 * First run.
 *
 * Nothing in the original spec ever created a profile, so on a fresh install
 * the feed filtered by an `activeProfileId` that pointed at nothing, the hero
 * animated a meaningless $0.00, and the Add form could not be submitted because
 * the profile field had no options. This screen is what makes the app usable at
 * all, which is why it is gated ahead of every route rather than offered.
 */
export function FirstRun({ languages }: { languages?: readonly string[] } = {}) {
  const { t } = useTranslation();
  const today = useToday();

  const [draft, setDraft] = useState<FirstRunDraft>(() => {
    // Injected rather than read from the global, so a test can say "this is an
    // Israeli browser" without replacing `navigator` - a replacement breaks
    // every prototype getter on it (`storage`, `userAgent`), which Dexie reads
    // while opening the database.
    const detected = detectLocaleDefaults(languages ?? navigator.languages);

    /*
     * A stored mirror OUTRANKS the browser for language.
     *
     * The app has already booted, painted and rendered this wizard in whatever
     * the mirror said; seeding the draft from `navigator` instead would put a
     * different language in the control than the one on screen around it - and
     * then write that one to settings on finish, so the wizard would end by
     * silently changing the language the user was just reading.
     *
     * A mirror with no database behind it is reachable: site data cleared for
     * IndexedDB but not localStorage, or a reset. The currency still comes from
     * the REGION, which the mirror does not carry.
     */
    const language = readStoredBootMirror()?.lang ?? detected.language;

    return initialDraft(language, detected.currency);
  });
  const [step, setStep] = useState<Step>('locale');
  const [showErrors, setShowErrors] = useState(false);
  const [loadDemo, setLoadDemo] = useState(false);
  const [saving, setSaving] = useState(false);
  const accounts = useAccount();
  const [joining, setJoining] = useState(false);

  const index = STEPS.indexOf(step);
  const peopleValid = isDraftValid(draft);

  /**
   * Language applies immediately, not on finish.
   *
   * A preview that waits until the end previews nothing - and for Hebrew the
   * entire layout flips, which the user should see before committing to it.
   * `applyDocumentChrome` keeps `<html lang>` and `dir` in step so Base UI's
   * direction-aware primitives flip with it.
   */
  const setLanguage = (language: Language): void => {
    setDraft((current) => ({ ...current, language }));
    void i18n.changeLanguage(language);
    applyDocumentChrome({ lang: language, theme: 'system' });
  };

  const next = (): void => {
    if (step === 'people' && !peopleValid) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    const following = STEPS[index + 1];
    if (following !== undefined) setStep(following);
  };

  const back = (): void => {
    const previous = STEPS[index - 1];
    if (previous !== undefined) setStep(previous);
  };

  const finish = (): void => {
    if (!peopleValid) {
      setStep('people');
      setShowErrors(true);
      return;
    }
    setSaving(true);
    void completeFirstRun(db, {
      draft,
      ids: draft.people.map(() => newId()),
      today,
      now: systemClock.nowIso(),
      loadDemo,
    }).catch(() => {
      // The boot gate is driven by a live query, so a successful write swaps
      // this screen out on its own. A failure has to hand control back.
      setSaving(false);
    });
  };

  /*
   * A second device joins an account instead of starting over. The account
   * card does the rest; once the first sync brings a profile down, the boot
   * gate swaps this screen for the app on its own. Coming back from "start
   * fresh" (still signed in) lands here too.
   */
  if (
    joining ||
    (accounts.status === 'signed_in' && accounts.keys !== 'not_set_up' && accounts.keys !== 'checking')
  ) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-6">
        <Logo size={32} title={t('app.name')} />
        <p className="text-sm text-muted-foreground">{t('account.firstRunJoinBody')}</p>
        <AccountCard />
        {accounts.status === 'signed_in' ? null : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setJoining(false);
            }}
          >
            {t('account.firstRunBack')}
          </Button>
        )}
      </main>
    );
  }

  const title =
    step === 'locale'
      ? t('firstRun.localeTitle')
      : step === 'people'
        ? t('firstRun.peopleTitle')
        : t('firstRun.balanceTitle');

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-6">
      <header className="space-y-4">
        <Logo size={32} title={t('app.name')} />
        <div className="space-y-2">
          <Progress value={STEP_PERCENT[index] ?? 0} aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {t('firstRun.step', { current: index + 1, total: STEPS.length })}
          </p>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {step === 'locale' ? (
          <p className="text-sm text-muted-foreground">{t('firstRun.welcomeBody')}</p>
        ) : null}
        {step === 'locale' && accounts.status !== 'unavailable' ? (
          <Button
            type="button"
            variant="link"
            className="h-auto px-0"
            onClick={() => {
              setJoining(true);
            }}
          >
            {t('account.firstRunHave')}
          </Button>
        ) : null}
      </header>

      <div className="mt-6 flex-1">
        {step === 'locale' ? (
          <StepLocale
            language={draft.language}
            currency={draft.currency}
            onLanguage={setLanguage}
            onCurrency={(currency) => {
              setDraft((current) => ({ ...current, currency }));
            }}
          />
        ) : null}

        {step === 'people' ? <StepPeople draft={draft} onChange={setDraft} showErrors={showErrors} /> : null}

        {step === 'balance' ? (
          <>
            <StepBalance draft={draft} today={today} onChange={setDraft} />
            <DemoOffer currency={draft.currency} checked={loadDemo} onChange={setLoadDemo} />
          </>
        ) : null}
      </div>

      <footer className="sticky bottom-0 mt-8 flex gap-2 bg-background py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
        {index > 0 ? (
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={back} disabled={saving}>
            {t('firstRun.back')}
          </Button>
        ) : null}
        <Button
          type="button"
          className="h-11 flex-1"
          disabled={saving}
          onClick={step === 'balance' ? finish : next}
        >
          {saving ? t('firstRun.creating') : step === 'balance' ? t('firstRun.finish') : t('firstRun.next')}
        </Button>
      </footer>
    </main>
  );
}

/**
 * Demo data, offered only here.
 *
 * As specced it silently added two profiles and sixty untagged rows to the same
 * database as real data, with "Clear all" as the only way back. Every row it
 * writes now carries the `demo.` prefix and comes out again in one tap - and
 * the offer is hidden outright for a currency the frozen demo rate table cannot
 * price, rather than inventing a rate for it.
 */
function DemoOffer({
  currency,
  checked,
  onChange,
}: {
  currency: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  if (!isDemoSupported(currency)) return null;

  return (
    <div className="mt-8 flex items-start gap-3 rounded-xl border border-border p-4">
      <Switch id="first-run-demo" checked={checked} onCheckedChange={onChange} />
      <div className="min-w-0 flex-1">
        <label htmlFor="first-run-demo" className="text-sm font-medium">
          {t('firstRun.demoLoad')}
        </label>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('firstRun.demoHint')}</p>
      </div>
    </div>
  );
}
