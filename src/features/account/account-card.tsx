import { CloudCheck, CloudOff, KeyRound, Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { accountController, useAccount, type AccountView } from '@/app/account';
import { LOCK_AFTER_CHOICES, lockAfter, setLockAfter, type LockAfter } from '@/app/idle-lock';
import type { SyncState } from '@/app/sync-runner';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { Passkey } from '@/services/supabase/auth';

import { AccountSheet, type Flow } from './account-sheet';
import { SecondStep } from './second-step';

/**
 * The account, the way a bank shows one: who is signed in, one quiet line
 * saying the data is safe, and the ways out. No sync status to watch, no
 * button to push: keeping this device and the account in step is the app's
 * job, and the only time it says anything is when a change is not yet safe -
 * offline, or the account out of reach.
 */
export function AccountCard() {
  const { t } = useTranslation();
  const view = useAccount();
  const [flow, setFlow] = useState<Flow | undefined>(undefined);

  if (view.status === 'unavailable' || view.status === 'locked') return null;

  const open = (next: Flow) => () => {
    setFlow(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.title')}</CardTitle>
        {view.status === 'signed_in' || view.status === 'second_step' ? (
          <CardDescription>{t('account.signedInAs', { email: view.user.email ?? '' })}</CardDescription>
        ) : (
          <CardDescription>{t('account.signedOutBody')}</CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {view.status === 'loading' ? (
          <p className="text-sm text-muted-foreground">{t('account.status.checking')}</p>
        ) : view.status === 'signed_out' ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" onClick={open({ kind: 'signin', mode: 'signup' })}>
              {t('account.create')}
            </Button>
            <Button type="button" variant="outline" onClick={open({ kind: 'signin', mode: 'signin' })}>
              {t('account.signIn')}
            </Button>
          </div>
        ) : view.status === 'second_step' ? (
          <SecondStep />
        ) : (
          <SignedIn view={view} open={open} />
        )}
      </CardContent>

      <AccountSheet
        flow={
          view.status === 'signed_in' && view.passwordRecovery && flow === undefined
            ? { kind: 'newPassword' }
            : flow
        }
        onClose={() => {
          setFlow(undefined);
        }}
      />
    </Card>
  );
}

function SignedIn({
  view,
  open,
}: {
  readonly view: Extract<AccountView, { status: 'signed_in' }>;
  readonly open: (flow: Flow) => () => void;
}) {
  const { t } = useTranslation();
  const { keys } = view;

  return (
    <>
      {keys.kind === 'checking' ? (
        <p className="text-sm text-muted-foreground">{t('account.status.checking')}</p>
      ) : keys.kind === 'rolled_back' ? (
        <p role="alert" className="text-sm text-destructive">
          {t('account.downgrade')}
        </p>
      ) : keys.kind === 'unknown' ? (
        <Status
          icon="off"
          text={t('account.status.unknown')}
          retry={() => void accountController().refreshKeys()}
        />
      ) : (
        <Saved sync={view.sync} />
      )}

      <section className="space-y-4 border-t border-border pt-3" aria-labelledby="account-security">
        <h3 id="account-security" className="text-sm font-semibold">
          {t('account.security')}
        </h3>
        <TwoStep on={view.twoStep} open={open} />
        <Passkeys />
        <LockAfterChoice />
      </section>

      <div className="grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={open({ kind: 'signout' })}>
          {t('account.signOut')}
        </Button>
        <Button type="button" variant="ghost" onClick={open({ kind: 'signOutOthers' })}>
          {t('account.signOutOthers')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive sm:col-span-2"
          onClick={open({ kind: 'delete' })}
        >
          {t('account.delete')}
        </Button>
      </div>
    </>
  );
}

/** One line. Quiet when all is well; a retry only when there is something to retry. */
function Saved({ sync }: { readonly sync: SyncState | undefined }) {
  const { t } = useTranslation();
  const kind = sync?.kind ?? 'syncing';
  if (kind === 'offline') return <Status icon="off" text={t('account.status.offline')} />;
  if (kind === 'error')
    return (
      <Status
        icon="off"
        text={t('account.status.error')}
        retry={() => {
          accountController().retry();
        }}
      />
    );
  if (kind === 'rebasing') return <Status icon="ok" text={t('account.status.rebasing')} />;
  return <Status icon="ok" text={t('account.status.saved')} />;
}

function Status({
  icon,
  text,
  retry,
}: {
  readonly icon: 'ok' | 'off';
  readonly text: string;
  readonly retry?: () => void;
}) {
  const { t } = useTranslation();
  const Icon = icon === 'ok' ? CloudCheck : CloudOff;
  return (
    <div className="flex items-center justify-between gap-3">
      {/* Polite: news, never an interruption. */}
      <p aria-live="polite" className="flex min-w-0 items-center gap-2 text-sm">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{text}</span>
      </p>
      {retry === undefined ? null : (
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          {t('action.retry')}
        </Button>
      )}
    </div>
  );
}

/** An authenticator-app code at every sign-in, on or off. */
function TwoStep({ on, open }: { readonly on: boolean; readonly open: (flow: Flow) => () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{t('account.twoStep.label')}</p>
        <p className="text-xs text-muted-foreground">
          {on ? t('account.twoStep.on') : t('account.twoStep.off')}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant={on ? 'ghost' : 'outline'}
        onClick={open({ kind: on ? 'twoStepOff' : 'twoStepOn' })}
      >
        {on ? t('account.twoStep.turnOff') : t('account.twoStep.turnOn')}
      </Button>
    </div>
  );
}

/** Signing in with the device's own lock. Listed, added, removed. */
function Passkeys() {
  const { t, i18n } = useTranslation();
  const [keys, setKeys] = useState<readonly Passkey[] | undefined>(undefined);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const supported = typeof window.PublicKeyCredential === 'function';

  const load = async (): Promise<void> => {
    try {
      setKeys(await accountController().listPasskeys());
    } catch {
      setUnavailable(true);
    }
  };

  useEffect(() => {
    if (!supported) return;
    let live = true;
    accountController()
      .listPasskeys()
      .then(
        (list) => {
          if (live) setKeys(list);
        },
        () => {
          if (live) setUnavailable(true);
        },
      );
    return () => {
      live = false;
    };
  }, [supported]);

  if (!supported) return null;

  const add = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await accountController().addPasskey();
      if (result.ok) {
        toast.success(t('account.passkeys.added'));
        await load();
      } else if (result.reason !== 'cancelled') {
        setError(t(`account.errors.${result.reason}`));
      }
    } catch {
      setError(t('account.errors.unknown'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const result = await accountController()
      .removePasskey(id)
      .catch(() => ({ ok: false as const, reason: 'unknown' as const }));
    if (result.ok) {
      toast.success(t('account.passkeys.removed'));
      await load();
    } else {
      setError(t(`account.errors.${result.reason}`));
    }
    setBusy(false);
  };

  const date = (iso: string): string =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso));

  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{t('account.passkeys.label')}</p>
        <p className="text-xs text-muted-foreground">{t('account.passkeys.body')}</p>
      </div>
      {unavailable ? (
        <p className="text-xs text-muted-foreground">{t('account.passkeys.unavailable')}</p>
      ) : (
        <>
          {keys !== undefined && keys.length > 0 ? (
            <ul className="space-y-1.5">
              {keys.map((k) => {
                const name = k.name ?? t('account.passkeys.unnamed');
                return (
                  <li
                    key={k.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate">{name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t('account.passkeys.addedOn', { date: date(k.createdAt) })}
                        </span>
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label={t('account.passkeys.remove', { name })}
                      onClick={() => void remove(k.id)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : keys === undefined ? null : (
            <p className="text-xs text-muted-foreground">{t('account.passkeys.none')}</p>
          )}
          {error === undefined ? null : (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void add()}>
            {t('account.passkeys.add')}
          </Button>
        </>
      )}
    </div>
  );
}

/** How long this device may sit unused before it asks for a sign-in again. */
function LockAfterChoice() {
  const { t } = useTranslation();
  const id = useId();
  const [value, setValue] = useState<LockAfter>(lockAfter);

  return (
    <div className="space-y-2">
      <Label id={id}>{t('account.lockAfter.label')}</Label>
      <Segmented<`${LockAfter}`>
        value={String(value) as `${LockAfter}`}
        labelledBy={id}
        size="sm"
        onChange={(next) => {
          const minutes = Number(next) as LockAfter;
          setLockAfter(minutes);
          setValue(minutes);
        }}
        options={LOCK_AFTER_CHOICES.map((m) => ({
          value: String(m) as `${LockAfter}`,
          label: t(`account.lockAfter.${String(m) as `${LockAfter}`}`),
        }))}
      />
      <p className="text-xs text-muted-foreground">{t('account.lockAfter.body')}</p>
    </div>
  );
}
