import { Camera } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';

import { accountController, useAccount } from '@/app/account';
import { useAccountAvatar } from '@/app/account-avatar';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SettingsPage } from '@/features/settings/settings-page';

import { AccountAvatar } from './account-avatar';
import { AccountStatus } from './account-card';
import { AccountSheet, type Flow } from './account-sheet';
import { squareAvatar } from './avatar-image';

/** Settings > Account: who you are here - picture, name, email - and the ways out. */
export function AccountScreen() {
  const { t } = useTranslation();
  const view = useAccount();
  const [flow, setFlow] = useState<Flow | undefined>(undefined);

  if (view.status !== 'signed_in') return <Navigate to={ROUTES.settings} replace />;

  return (
    <SettingsPage title={t('settings.sections.account')}>
      <Card>
        <CardContent className="space-y-5">
          <Picture />
          <AccountStatus view={view} />
        </CardContent>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setFlow({ kind: 'signout' });
          }}
        >
          {t('account.signOut')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive"
          onClick={() => {
            setFlow({ kind: 'delete' });
          }}
        >
          {t('account.delete')}
        </Button>
      </div>

      <AccountSheet
        flow={flow}
        onClose={() => {
          setFlow(undefined);
        }}
      />
    </SettingsPage>
  );
}

/** The picture, large, with the ways to change it; the name and email beside it. */
function Picture() {
  const { t } = useTranslation();
  const { name, email, uploaded } = useAccountAvatar();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const choose = (): void => {
    input.current?.click();
  };

  const use = async (file: File): Promise<void> => {
    setBusy(true);
    try {
      let image: Blob;
      try {
        image = await squareAvatar(file);
      } catch {
        toast.error(t('account.picture.unreadable'));
        return;
      }
      await accountController().setAvatar(image);
      toast.success(t('account.picture.saved'));
    } catch {
      toast.error(navigator.onLine ? t('account.picture.failed') : t('account.errors.offline'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    try {
      await accountController().removeAvatar();
      toast.success(t('account.picture.removed'));
    } catch {
      toast.error(navigator.onLine ? t('account.picture.failed') : t('account.errors.offline'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-start">
      <button
        type="button"
        className="group relative shrink-0 rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
        disabled={busy}
        aria-label={uploaded ? t('account.picture.change') : t('account.picture.add')}
        onClick={choose}
      >
        <AccountAvatar size={88} />
        <span className="absolute end-0 bottom-0 grid size-8 place-items-center rounded-full border-2 border-card bg-foreground text-background shadow-sm">
          <Camera className="size-4" aria-hidden="true" />
        </span>
      </button>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="min-w-0">
          {name === undefined ? null : <p className="truncate text-lg font-semibold">{name}</p>}
          <p dir="ltr" className="truncate text-sm text-muted-foreground sm:rtl:text-end">
            {email}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={choose}>
            {uploaded ? t('account.picture.change') : t('account.picture.add')}
          </Button>
          {uploaded ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove()}>
              {t('account.picture.remove')}
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file !== undefined) void use(file);
        }}
      />
    </div>
  );
}
