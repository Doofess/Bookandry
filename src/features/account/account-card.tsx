import { Cloud, CloudOff, KeyRound, Lock, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { accountController, useAccount, type AccountView } from '@/app/account';
import type { SyncState } from '@/app/sync-runner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { systemClock } from '@/lib/clock';

import { AccountSheet, type Flow } from './account-sheet';

/**
 * Account and sync, in one card - the only place sync status is shown.
 *
 * No header badge, no spinner in the chrome: a local-first app works the same
 * whether or not it just synced, and a status that is always on screen trains
 * people to worry about it. The card says what is true, in words, and is
 * announced politely when it changes.
 */
export function AccountCard() {
  const { t } = useTranslation();
  const view = useAccount();
  const [flow, setFlow] = useState<Flow | undefined>(undefined);

  if (view.status === 'unavailable') return null;

  const open = (next: Flow) => () => {
    setFlow(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.title')}</CardTitle>
        {view.status === 'signed_in' ? (
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

  return (
    <>
      {view.keys === 'checking' ? (
        <p className="text-sm text-muted-foreground">{t('account.status.checking')}</p>
      ) : view.keys === 'not_set_up' ? (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-sm">{t('account.setUpBody')}</p>
          <Button type="button" className="w-full" onClick={open({ kind: 'setup' })}>
            <KeyRound className="size-4" aria-hidden="true" />
            {t('account.setUpStart')}
          </Button>
        </div>
      ) : view.keys === 'locked' ? (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-sm">{t('account.status.locked')}</p>
          <Button type="button" className="w-full" onClick={open({ kind: 'unlock' })}>
            <Lock className="size-4" aria-hidden="true" />
            {t('account.unlock')}
          </Button>
        </div>
      ) : view.keys === 'unknown' ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t('account.status.unknown')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void accountController().refreshKeys()}
          >
            {t('action.retry')}
          </Button>
        </div>
      ) : (
        <SyncStatus sync={view.sync} />
      )}

      {view.keys === 'unlocked' ? (
        <div className="grid gap-1.5 border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            className="justify-start"
            onClick={open({ kind: 'recovery' })}
          >
            {t('account.newRecovery')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="justify-start"
            onClick={open({ kind: 'passphrase' })}
          >
            {t('account.changePassphrase')}
          </Button>
          <Button type="button" variant="ghost" className="justify-start" onClick={open({ kind: 'lost' })}>
            {t('account.lost')}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={open({ kind: 'signout' })}>
          {t('account.signOut')}
        </Button>
        <Button type="button" variant="ghost" className="text-destructive" onClick={open({ kind: 'delete' })}>
          {t('account.delete')}
        </Button>
      </div>
    </>
  );
}

function SyncStatus({ sync }: { readonly sync: SyncState | undefined }) {
  const { t, i18n } = useTranslation();
  const kind = sync?.kind ?? 'syncing';
  const when =
    sync !== undefined && 'lastSyncedAt' in sync && sync.lastSyncedAt !== undefined
      ? relativeTime(sync.lastSyncedAt, i18n.language)
      : undefined;

  const text =
    kind === 'syncing'
      ? t('account.status.syncing')
      : kind === 'offline'
        ? t('account.status.offline')
        : kind === 'error'
          ? t('account.status.error')
          : kind === 'rebasing'
            ? t('account.status.rebasing')
            : when === undefined
              ? t('account.status.idleNever')
              : t('account.status.idle', { when });

  const Icon = kind === 'offline' || kind === 'error' ? CloudOff : Cloud;

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Polite: a sync finishing is news, never an interruption. */}
      <p aria-live="polite" className="flex min-w-0 items-center gap-2 text-sm">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{text}</span>
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={kind === 'syncing'}
        onClick={() => {
          accountController().syncNow();
        }}
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        {kind === 'error' ? t('action.retry') : t('account.syncNow')}
      </Button>
    </div>
  );
}

function relativeTime(at: number, locale: string): string {
  const seconds = Math.round((systemClock.nowMs() - at) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (seconds < 60) return format.format(0, 'second');
  if (seconds < 3600) return format.format(-Math.round(seconds / 60), 'minute');
  return format.format(-Math.round(seconds / 3600), 'hour');
}
