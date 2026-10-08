import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { accountController, useAccount } from '@/app/account';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { systemClock } from '@/lib/clock';
import { ServerError } from '@/services/supabase/transport';
import type { WipeStatus } from '@/services/supabase/wipe';

import { matchesWord } from './delete-word';

/**
 * Delete all data, from Data & backup.
 *
 * Alone (or with no account on the device) it erases here and now. Linked, it
 * only ASKS: the server emails every other member, and nothing is deleted
 * until they all agree. While a request waits, the button gives way to its
 * status.
 */

const subscribeOnline = (notify: () => void): (() => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
};
const isOnline = (): boolean => navigator.onLine;

export function DeleteData({ onBackup }: { readonly onBackup: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const view = useAccount();
  const online = useSyncExternalStore(subscribeOnline, isOnline);
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [wipe, setWipe] = useState<WipeStatus | null>(null);

  const signedIn = view.status === 'signed_in';
  const members = signedIn ? (view.household?.members ?? []) : [];
  const linked = members.length > 1;
  const others = members
    .filter((m) => m.userId !== (signedIn ? view.user.id : undefined))
    .map((m) => m.displayName);
  const names = new Intl.ListFormat(i18n.language, { type: 'conjunction' });
  // A done erase is kept by the server for a month, as history: not a wait.
  const pending = signedIn && wipe?.status === 'pending' ? wipe : null;

  // Locked, at the code step, still loading: this device holds an account's
  // data, and erasing it alone would only sync it back. Signed in, it waits for
  // the household too: until the server says who is in it, alone or linked is
  // not known, and the wrong one must not be offered.
  const offline = signedIn && !online;
  const householdUnknown = signedIn && view.household === undefined;
  const disabled =
    !(signedIn || view.status === 'signed_out' || view.status === 'unavailable') ||
    offline ||
    householdUnknown;

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setWipe(await accountController().wipeStatus());
    } catch {
      // Unknown is shown as no request: the server refuses a second one anyway.
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    accountController()
      .wipeStatus()
      .then((found) => {
        if (current) setWipe(found);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [signedIn]);

  const close = (): void => {
    setOpen(false);
    setWord('');
  };

  const eraseHere = async (): Promise<void> => {
    setBusy(true);
    try {
      await accountController().wipeMyData();
      close();
      toast.success(t('settings.delete.done'));
    } catch (error) {
      if (error instanceof ServerError && error.code === 'linked_needs_confirmation') {
        // Linked since this was opened: the server refused, nothing was
        // deleted. Look again, and the section offers to ask the others.
        close();
        toast.error(t('settings.delete.nowLinked'));
        await accountController()
          .refreshHousehold()
          .catch(() => undefined);
        return;
      }
      // Whether the server's erase went through is not known: this device
      // follows on its next sync if it did.
      toast.error(t('settings.delete.failed'));
    } finally {
      setBusy(false);
    }
  };

  const ask = async (): Promise<void> => {
    setBusy(true);
    try {
      const outcome = await accountController().requestWipe(i18n.language === 'he' ? 'he' : 'en');
      if (outcome.ok) {
        close();
        toast.success(t('settings.delete.sent'));
        await refresh();
        return;
      }
      switch (outcome.error) {
        case 'email_failed':
          toast.error(t('settings.delete.emailFailed'));
          return;
        case 'wipe_pending':
          close();
          toast.error(t('settings.delete.pending'));
          await refresh();
          return;
        case 'too_many_wipe_requests':
          toast.error(t('settings.delete.tooSoon'));
          return;
        case 'offline':
          toast.error(t('settings.delete.offline'));
          return;
        case 'not_linked':
          // The household changed under us: look again, and the section follows.
          close();
          toast.error(t('tx.toastFailed'));
          await accountController()
            .refreshHousehold()
            .catch(() => undefined);
          return;
      }
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (): Promise<void> => {
    setBusy(true);
    try {
      await accountController().cancelWipe();
      toast.success(t('settings.delete.cancelled'));
    } catch {
      toast.error(t('tx.toastFailed'));
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const backup = async (): Promise<void> => {
    setBusy(true);
    try {
      await onBackup();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-border pt-4">
      {pending === null ? (
        <>
          <p className="text-sm font-medium">{t('settings.delete.title')}</p>
          <p className="text-xs text-muted-foreground">{t('settings.delete.body')}</p>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              setOpen(true);
            }}
            className="w-full text-destructive"
          >
            {linked ? t('settings.delete.openLinked') : t('settings.delete.open')}
          </Button>
          {offline ? <p className="text-xs text-muted-foreground">{t('settings.delete.offline')}</p> : null}
        </>
      ) : (
        <>
          <p className="text-sm">
            {t('settings.delete.waiting', {
              names: names.format(pending.waitingFor),
              when: relativeTo(pending.expiresAt, i18n.language),
            })}
          </p>
          {pending.mine ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                void cancel();
              }}
              className="w-full"
            >
              {t('settings.delete.cancel')}
            </Button>
          ) : null}
        </>
      )}

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          if (next) setOpen(true);
          else close();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {linked ? t('settings.delete.openLinked') : t('settings.delete.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {linked
                ? t('settings.delete.linkedAsk', { names: names.format(others), count: others.length })
                : t('settings.delete.body')}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>{t('settings.delete.erased')}</li>
            <li>{t('settings.delete.kept')}</li>
          </ul>

          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void backup();
            }}
          >
            {t('settings.delete.backupFirst')}
          </Button>

          <div className="space-y-1.5">
            <Label htmlFor="delete-word">{t('settings.delete.typeLabel')}</Label>
            <Input
              id="delete-word"
              value={word}
              autoComplete="off"
              onChange={(event) => {
                setWord(event.target.value);
              }}
            />
          </div>

          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              {t('action.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !matchesWord(word)}
              onClick={() => {
                void (linked ? ask() : eraseHere());
              }}
            >
              {linked ? t('settings.delete.send') : t('settings.delete.confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** "in 6 days", from Intl: days while there are some, hours in the last one. */
function relativeTo(iso: string, locale: string): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const hours = Math.max(0, Math.ceil((Date.parse(iso) - systemClock.nowMs()) / 3_600_000));
  return hours >= 24 ? format.format(Math.round(hours / 24), 'day') : format.format(hours, 'hour'); // money-allow: days for a relative time
}
