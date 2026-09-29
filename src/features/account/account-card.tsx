import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
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
 *
 * Signed in means syncing. There is no key to set up or type: the account
 * hands each device its key. The only questions this card ever asks are the
 * ones only a person can answer - whose data this device holds, and whether
 * to start a synced copy over.
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
  const { keys } = view;
  const [busy, setBusy] = useState(false);

  return (
    <>
      {keys.kind === 'checking' ? (
        <p className="text-sm text-muted-foreground">{t('account.status.checking')}</p>
      ) : keys.kind === 'foreign' ? (
        /*
         * The one question sync asks: this device holds data that last synced
         * with a DIFFERENT account - on a shared device, the previous person's.
         * Nothing is uploaded until the person answers, and neither answer is
         * preselected.
         */
        <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
          <p role="alert" className="text-sm">
            {t('account.foreignBody')}
          </p>
          <p className="text-sm font-medium">
            {t('account.foreignCounts', { profiles: keys.profiles, transactions: keys.transactions })}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void accountController().eraseDevice();
              }}
            >
              {t('account.foreignErase')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void accountController()
                  .addExistingData()
                  .finally(() => {
                    setBusy(false);
                  });
              }}
            >
              {t('account.foreignAdd')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('account.foreignEraseHint')}</p>
        </div>
      ) : keys.kind === 'legacy_locked' ? (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-sm">{t('account.legacyBody')}</p>
          <Button type="button" variant="outline" className="w-full" onClick={open({ kind: 'startFresh' })}>
            {t('account.startFresh')}
          </Button>
        </div>
      ) : keys.kind === 'rolled_back' ? (
        <p role="alert" className="text-sm text-destructive">
          {t('account.downgrade')}
        </p>
      ) : keys.kind === 'unknown' ? (
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

function SyncStatus({ sync }: { readonly sync: SyncState | undefined }) {
  const { t, i18n } = useTranslation();
  const kind = sync?.kind ?? 'syncing';
  const when =
    sync !== undefined && 'lastSyncedAt' in sync && sync.lastSyncedAt !== undefined
      ? relativeTime(sync.lastSyncedAt, i18n.language)
      : undefined;

  const text =
    kind === 'syncing' || kind === 'locked'
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
