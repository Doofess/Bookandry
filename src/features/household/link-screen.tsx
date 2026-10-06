import { Check, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { accountController, useAccount } from '@/app/account';
import { useSettings, useToday } from '@/app/app-context';
import { ROUTES, SETTINGS_ROUTES } from '@/app/routes';
import { Button, buttonVariants } from '@/components/ui/button';
import { ReconvertDialog } from '@/features/settings/reconvert-dialog';
import type { InvitePreview } from '@/services/supabase/household';
import { ServerError } from '@/services/supabase/transport';
import type { Currency } from '@/types/money';

import { forgetPendingInvite, pendingInvite, rememberPendingInvite } from './pending-invite';

/**
 * Where an invitation's emailed link lands: /link?t=<token>.
 *
 * The token is kept for the visit (pending-invite.ts), so signing in or
 * creating the account - Google's round trip included - comes back here.
 * Accepting needs the account the invitation was sent to, signed in; the
 * screen names who is inviting, and says what linking does, before anything
 * happens.
 */
type State =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly preview: InvitePreview }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'wrong_account' }
  | { readonly kind: 'offline' };

export function LinkScreen() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const view = useAccount();
  const settings = useSettings();
  const today = useToday();
  const token = params.get('t') ?? pendingInvite();
  const signedIn = view.status === 'signed_in';
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (token !== undefined && token !== '') rememberPendingInvite(token);
  }, [token]);

  useEffect(() => {
    if (!signedIn || token === undefined || token === '') return;
    let live = true;
    accountController()
      .peekInvite(token)
      .then(
        (preview) => {
          if (live) setState({ kind: 'ready', preview });
        },
        (error: unknown) => {
          if (!live) return;
          const code = error instanceof ServerError ? error.code : undefined;
          setState(
            code === 'invite_invalid'
              ? { kind: 'invalid' }
              : code === 'invite_wrong_account'
                ? { kind: 'wrong_account' }
                : { kind: 'offline' },
          );
        },
      );
    return () => {
      live = false;
    };
  }, [signedIn, token]);

  const leave = (): void => {
    forgetPendingInvite();
    void navigate(ROUTES.feed, { replace: true });
  };

  const join = async (currency: Currency): Promise<void> => {
    if (token === undefined) return;
    setBusy(true);
    try {
      await accountController().acceptInvite(token, currency);
      forgetPendingInvite();
      toast(t('link.joined'));
      void navigate(ROUTES.household, { replace: true });
    } catch (error) {
      const code = error instanceof ServerError ? error.code : undefined;
      toast.error(
        code === 'already_linked'
          ? t('link.linkedElsewhere')
          : code === 'household_full'
            ? t('household.full')
            : code === 'invite_invalid'
              ? t('link.invalid')
              : t('household.err'),
      );
    } finally {
      setBusy(false);
    }
  };

  const accept = (preview: InvitePreview): void => {
    const currency = preview.currency;
    if (currency === settings.defaultCurrency) void join(currency);
    else setConverting(true);
  };

  let body: React.ReactNode;
  if (token === undefined || token === '') {
    body = <p className="text-sm text-muted-foreground">{t('link.missing')}</p>;
  } else if (!signedIn) {
    body = (
      <>
        <p className="text-sm text-muted-foreground">{t('link.signInBody')}</p>
        <Link to={SETTINGS_ROUTES.account} className={buttonVariants()}>
          {t('household.signIn')}
        </Link>
      </>
    );
  } else if (state.kind === 'loading') {
    body = <p className="text-sm text-muted-foreground">{t('link.loading')}</p>;
  } else if (state.kind === 'invalid') {
    body = <p className="text-sm">{t('link.invalid')}</p>;
  } else if (state.kind === 'wrong_account') {
    body = <p className="text-sm">{t('link.wrongAccount', { email: view.user.email ?? '' })}</p>;
  } else if (state.kind === 'offline') {
    body = <p className="text-sm">{t('link.offline')}</p>;
  } else {
    const { preview } = state;
    const differs = preview.currency !== settings.defaultCurrency;
    body = preview.alreadyMember ? (
      <p className="text-sm">{t('link.alreadyMember')}</p>
    ) : (
      <>
        <p className="text-base">
          {preview.members > 1
            ? t('link.inviteMany', { name: preview.inviterName, count: preview.members })
            : t('link.invite', { name: preview.inviterName })}
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {[t('link.pointSee'), t('link.pointEdit'), t('link.pointUnlink')].map((point) => (
            <li key={point} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        {differs ? (
          <p className="rounded-lg bg-muted p-3 text-sm">
            {t('link.currency', { theirs: preview.currency, mine: settings.defaultCurrency })}
          </p>
        ) : null}
        {preview.linkedElsewhere ? (
          <p role="alert" className="text-sm text-destructive">
            {t('link.linkedElsewhere')}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy || preview.linkedElsewhere}
            onClick={() => {
              accept(preview);
            }}
          >
            {busy ? t('link.joining') : t('link.accept')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void accountController()
                .declineInvite(token)
                .catch(() => undefined)
                .finally(leave);
            }}
          >
            {t('link.decline')}
          </Button>
        </div>
      </>
    );
  }

  const done =
    state.kind === 'invalid' || state.kind === 'wrong_account' || token === undefined || token === '';

  return (
    <section className="mx-auto max-w-lg space-y-4 px-4 py-10">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Users className="size-6" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">{t('link.title')}</h1>
      {body}
      {done ? (
        <Button type="button" variant="outline" onClick={leave}>
          {t('link.home')}
        </Button>
      ) : null}
      {state.kind === 'ready' ? (
        <ReconvertDialog
          open={converting}
          onOpenChange={setConverting}
          currentCurrency={settings.defaultCurrency}
          today={today}
          fixedTarget={state.preview.currency}
          onDone={(currency) => {
            setConverting(false);
            void join(currency);
          }}
        />
      ) : null}
    </section>
  );
}
