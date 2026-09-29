import { useId, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { accountController } from '@/app/account';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const CODE = /^\d{6}$/;

/**
 * The authenticator-app code, after the password or Google. Six digits, the
 * phone's own one-time-code autofill offered, nothing else to decide - and a
 * way back out, since a person without their phone should not be stuck here.
 */
export function CodeForm({
  submit,
  cancel,
}: {
  readonly submit: (code: string) => Promise<{ readonly ok: boolean; readonly reason?: string }>;
  readonly cancel?: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const onSubmit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    if (!CODE.test(code)) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await submit(code);
      if (!result.ok) {
        setError(result.reason === 'offline' ? t('account.errors.offline') : t('account.errors.wrong_code'));
        setCode('');
      }
    } catch {
      setError(navigator.onLine ? t('account.errors.unknown') : t('account.errors.offline'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
      <div className="space-y-1.5">
        <Label htmlFor={id}>{t('account.code.label')}</Label>
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          dir="ltr"
          className="text-center font-mono text-lg tracking-[0.4em]"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
          }}
        />
      </div>
      {error === undefined ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy || !CODE.test(code)}>
        {t('account.code.submit')}
      </Button>
      {cancel === undefined ? null : (
        <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={cancel}>
          {t('account.code.cancel')}
        </Button>
      )}
    </form>
  );
}

/** The code step for signing in. */
export function SecondStep() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('account.code.body')}</p>
      <CodeForm
        submit={(code) => accountController().verifyCode(code)}
        cancel={() => void accountController().cancelSecondStep()}
      />
    </div>
  );
}

/** In front of the whole app, on a device that already holds the account's data. */
export function SecondStepScreen() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <Logo size={32} title={t('app.name')} />
      <h1 className="text-2xl font-semibold tracking-tight">{t('account.code.title')}</h1>
      <SecondStep />
    </main>
  );
}
