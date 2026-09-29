import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { accountController } from '@/app/account';
import { Logo } from '@/components/logo';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

import { SignIn } from './account-sheet';

/**
 * What a device holding an account's data shows while that account is not
 * signed in here - after inactivity, or after "sign out all other devices"
 * on another one. The data stays on the device and stays out of sight: the
 * way back is signing in, the way out is removing it.
 */
export function LockScreen({ email, idle }: { readonly email: string | undefined; readonly idle: boolean }) {
  const { t } = useTranslation();
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);

  const body = idle
    ? email === undefined
      ? t('account.lock.idleBodyNoEmail')
      : t('account.lock.idleBody', { email })
    : email === undefined
      ? t('account.lock.bodyNoEmail')
      : t('account.lock.body', { email });

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <Logo size={32} title={t('app.name')} />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {idle ? t('account.lock.idleTitle') : t('account.lock.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>

      {/* The session arrives through the controller; nothing to do on success. */}
      <SignIn initial="signin" signUp={false} email={email} onDone={() => undefined} />

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">{t('account.lock.other')}</p>
        <Button
          type="button"
          variant="ghost"
          className="w-full text-destructive"
          onClick={() => {
            setRemoving(true);
          }}
        >
          {t('account.lock.remove')}
        </Button>
      </div>

      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('account.lock.removeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('account.lock.removeBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void accountController().removeFromDevice();
              }}
            >
              {t('account.lock.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
