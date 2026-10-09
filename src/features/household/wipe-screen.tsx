import { ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { accountController, useAccount } from '@/app/account';
import { ROUTES, SETTINGS_ROUTES } from '@/app/routes';
import { ScreenPanel } from '@/app/screen-panel';
import { PanelSheet } from '@/components/brand-panel';
import { Button, buttonVariants } from '@/components/ui/button';
import { ServerError } from '@/services/supabase/transport';
import type { WipePreview } from '@/services/supabase/wipe';

import { forgetPendingWipe, isWipeToken, pendingWipe, rememberPendingWipe } from './pending-wipe';

/**
 * Where an emailed request to delete everyone's data lands: /wipe?t=<token>.
 *
 * Kept for the visit like the invitation (pending-wipe.ts), so signing in
 * comes back here. Answering needs the account the request was sent to,
 * signed in; the screen names who asked, and what goes and what stays,
 * before anything happens.
 */
type State =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly preview: WipePreview }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'wrong_account' }
  | { readonly kind: 'offline' };

export function WipeScreen() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const view = useAccount();
  const token = params.get('t') ?? pendingWipe();
  const present = token !== undefined && token !== '';
  const valid = present && isWipeToken(token);
  const signedIn = view.status === 'signed_in';
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  // State only lands on the next render; this stops a second click before it.
  const inFlight = useRef(false);

  useEffect(() => {
    if (valid) rememberPendingWipe(token);
  }, [valid, token]);

  useEffect(() => {
    if (!signedIn || !valid) return;
    let live = true;
    accountController()
      .peekWipe(token)
      .then(
        (preview) => {
          if (live) setState({ kind: 'ready', preview });
        },
        (error: unknown) => {
          if (!live) return;
          const code = error instanceof ServerError ? error.code : undefined;
          setState(
            code === 'wipe_invalid'
              ? { kind: 'invalid' }
              : code === 'wipe_wrong_account'
                ? { kind: 'wrong_account' }
                : { kind: 'offline' },
          );
        },
      );
    return () => {
      live = false;
    };
  }, [signedIn, valid, token]);

  const leave = (): void => {
    forgetPendingWipe();
    void navigate(ROUTES.feed, { replace: true });
  };

  /** The request closed while the page was open, or the answer did not go through. */
  const failed = (error: unknown): void => {
    const code = error instanceof ServerError ? error.code : undefined;
    if (code === 'wipe_invalid') setState({ kind: 'invalid' });
    else if (code === 'wipe_wrong_account') setState({ kind: 'wrong_account' });
    else toast.error(t('household.err'));
  };

  const confirm = async (): Promise<void> => {
    if (!valid || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const outcome = await accountController().confirmWipe(token);
      // 'done': this device clears itself on its next sync, and says so then.
      if (outcome === 'waiting') toast(t('wipe.waiting'));
      leave();
    } catch (error) {
      failed(error);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const decline = async (): Promise<void> => {
    if (!valid || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await accountController().declineWipe(token);
      toast(t('wipe.declined'));
      leave();
    } catch (error) {
      failed(error);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (!present) {
    body = <p className="text-sm text-muted-foreground">{t('link.missing')}</p>;
  } else if (!valid) {
    body = <p className="text-sm">{t('wipe.invalid')}</p>;
  } else if (!signedIn) {
    body = (
      <>
        <p className="text-sm text-muted-foreground">{t('wipe.signIn')}</p>
        <Link to={SETTINGS_ROUTES.account} className={buttonVariants()}>
          {t('household.signIn')}
        </Link>
      </>
    );
  } else if (state.kind === 'loading') {
    body = <p className="text-sm text-muted-foreground">{t('wipe.loading')}</p>;
  } else if (state.kind === 'invalid') {
    body = <p className="text-sm">{t('wipe.invalid')}</p>;
  } else if (state.kind === 'wrong_account') {
    body = <p className="text-sm">{t('wipe.wrongAccount')}</p>;
  } else if (state.kind === 'offline') {
    body = <p className="text-sm">{t('link.offline')}</p>;
  } else {
    const { preview } = state;
    const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
    body = (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('wipe.title', { name: preview.requesterName })}
        </h1>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>{t('settings.delete.erased')}</li>
          <li>{t('settings.delete.kept')}</li>
        </ul>
        <p className="text-sm">{t('wipe.forEveryone', { count: preview.members })}</p>
        <p className="text-sm text-muted-foreground">
          {t('wipe.when', {
            asked: date.format(new Date(preview.createdAt)),
            until: date.format(new Date(preview.expiresAt)),
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              void confirm();
            }}
          >
            {t('wipe.confirm')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void decline();
            }}
          >
            {t('wipe.decline')}
          </Button>
        </div>
      </>
    );
  }

  // Every end state offers the way out, and forgets the token on the way, so
  // the app stops bringing the person back here. Unreachable too: the link in
  // the email still works once there is a connection.
  const done =
    state.kind === 'invalid' || state.kind === 'wrong_account' || state.kind === 'offline' || !valid;

  return (
    <div className="mx-auto max-w-lg pb-24 lg:px-4 lg:pb-8">
      <ScreenPanel />
      <PanelSheet>
        <section className="space-y-4 px-4 pt-8 pb-10">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <ShieldAlert className="size-6" aria-hidden="true" />
          </span>
          {body}
          {done ? (
            <Button type="button" variant="outline" onClick={leave}>
              {t('link.home')}
            </Button>
          ) : null}
        </section>
      </PanelSheet>
    </div>
  );
}
