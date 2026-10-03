import { Copy, KeyRound } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { accountController, useAccount } from '@/app/account';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { passkeysSupported, type AuthResult, type Enrollment } from '@/services/supabase/auth';

import { GoogleIcon } from './provider-icons';
import { CodeForm } from './second-step';

/**
 * Every account flow, in one bottom sheet.
 *
 * There is nothing here about keys or copies: signing in is enough, and the
 * account hands each device its data. What is left is signing in and out,
 * the second step, and deleting the account - the one thing that cannot be
 * undone, confirmed.
 */
export type Flow =
  | { readonly kind: 'signin'; readonly mode: 'signin' | 'signup' }
  | { readonly kind: 'signout' }
  | { readonly kind: 'signOutOthers' }
  | { readonly kind: 'delete' }
  | { readonly kind: 'newPassword' }
  | { readonly kind: 'twoStepOn' }
  | { readonly kind: 'twoStepOff' };

const MIN_PASSWORD = 8;

export function AccountSheet({
  flow,
  onClose,
}: {
  readonly flow: Flow | undefined;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const title =
    flow === undefined ? '' : t(`account.flow.${flow.kind === 'signin' ? flow.mode : flow.kind}.title`);
  const body =
    flow === undefined ? '' : t(`account.flow.${flow.kind === 'signin' ? flow.mode : flow.kind}.body`);

  return (
    <Sheet
      open={flow !== undefined}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{body}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {flow === undefined ? null : <FlowBody key={flow.kind} flow={flow} onDone={onClose} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FlowBody({ flow, onDone }: { readonly flow: Flow; readonly onDone: () => void }) {
  switch (flow.kind) {
    case 'signin':
      return <SignIn initial={flow.mode} onDone={onDone} />;
    case 'signout':
      return <SignOut onDone={onDone} />;
    case 'signOutOthers':
      return (
        <Confirm
          action={() => accountController().signOutOthers()}
          label="account.signOutOthers"
          done="account.signedOutOthers"
          onDone={onDone}
        />
      );
    case 'delete':
      return <DeleteAccount onDone={onDone} />;
    case 'newPassword':
      return <NewPassword onDone={onDone} />;
    case 'twoStepOn':
      return <TwoStepOn onDone={onDone} />;
    case 'twoStepOff':
      return <TwoStepOff onDone={onDone} />;
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function useMessages() {
  const { t } = useTranslation();
  return {
    // A passkey prompt the person closed is not an error to show them.
    auth: (result: AuthResult): string | undefined =>
      result.ok || result.reason === 'cancelled' ? undefined : t(`account.errors.${result.reason}`),
    thrown: (): string => (navigator.onLine ? t('account.errors.unknown') : t('account.errors.offline')),
  };
}

function ErrorLine({ message }: { readonly message: string | undefined }) {
  return message === undefined ? null : (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

function InfoLine({ children }: { readonly children: ReactNode }) {
  return (
    <p role="status" className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  ...input
}: { readonly label: string; readonly hint?: string } & React.ComponentProps<'input'>) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-describedby={hint === undefined ? undefined : `${id}-hint`} {...input} />
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export type SignInMode = 'signin' | 'signup' | 'reset';

/** Signing in, creating an account, or asking for a password reset. */
export function SignIn({
  initial,
  onDone,
  signUp = true,
  email: knownEmail = '',
  title,
}: {
  readonly initial: 'signin' | 'signup';
  readonly onDone: () => void;
  readonly signUp?: boolean;
  /** The account this device belongs to, when it is known. */
  readonly email?: string;
  /** The heading, for each step: the front door names the step; the sheet has its own title. */
  readonly title?: (mode: SignInMode) => ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const messages = useMessages();
  const passwordId = useId();
  const [mode, setMode] = useState<SignInMode>(initial);
  const [email, setEmail] = useState(knownEmail);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // Back from Google without a session: say so here, where the
  // person is looking.
  const [error, setError] = useState<string | undefined>(() => {
    const failure = accountController().signInFailure();
    return failure === undefined ? undefined : messages.auth({ ok: false, reason: failure });
  });
  const [info, setInfo] = useState<string | undefined>(undefined);

  const submit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    try {
      const c = accountController();
      if (mode === 'reset') {
        const result = await c.sendPasswordReset(email);
        if (result.ok) setInfo(t('account.resetSent'));
        else setError(messages.auth(result));
      } else if (mode === 'signup') {
        const result = await c.signUp(email, password, i18n.resolvedLanguage === 'he' ? 'he' : 'en');
        if (!result.ok) setError(messages.auth(result));
        else if (result.confirm === true) setInfo(t('account.checkEmail'));
        else onDone();
      } else {
        const result = await c.signIn(email, password);
        if (result.ok) onDone();
        else setError(messages.auth(result));
      }
    } catch {
      setError(messages.thrown());
    } finally {
      setBusy(false);
    }
  };

  const passkey = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await accountController().signInWithPasskey();
      if (result.ok) onDone();
      else setError(messages.auth(result));
    } catch {
      setError(messages.thrown());
    } finally {
      setBusy(false);
    }
  };

  const google = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await accountController().signInWithGoogle();
      // On success the page is already leaving for Google.
      if (!result.ok) setError(messages.auth(result));
    } catch {
      setError(messages.thrown());
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (next: SignInMode): void => {
    setMode(next);
    setError(undefined);
    setInfo(undefined);
  };

  return (
    <div className="space-y-6">
      {title === undefined ? null : title(mode)}

      {mode === 'reset' ? (
        <p className="text-sm text-muted-foreground">{t('account.welcome.resetBody')}</p>
      ) : (
        <>
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              disabled={busy}
              onClick={() => void google()}
            >
              <GoogleIcon className="size-[1.125rem]" />
              {t('account.google')}
            </Button>
            {mode === 'signin' && passkeysSupported() ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                disabled={busy}
                onClick={() => void passkey()}
              >
                <KeyRound className="size-[1.125rem]" aria-hidden="true" />
                {t('account.passkeys.signIn')}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            {t('account.or')}
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form className="space-y-4" onSubmit={(e) => void submit(e)}>
        <Field
          label={t('account.email')}
          type="email"
          autoComplete="email"
          dir="ltr"
          className="h-11"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        {mode === 'reset' ? null : (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor={passwordId}>{t('account.password')}</Label>
              {mode === 'signin' ? (
                <button
                  type="button"
                  className="rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => {
                    switchTo('reset');
                  }}
                >
                  {t('account.forgot')}
                </button>
              ) : null}
            </div>
            <Input
              id={passwordId}
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="h-11"
              required
              minLength={mode === 'signup' ? MIN_PASSWORD : undefined}
              aria-describedby={mode === 'signup' ? `${passwordId}-hint` : undefined}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
            {mode === 'signup' ? (
              <p id={`${passwordId}-hint`} className="text-xs text-muted-foreground">
                {t('account.passwordHint')}
              </p>
            ) : null}
          </div>
        )}
        <ErrorLine message={error} />
        {info === undefined ? null : <InfoLine>{info}</InfoLine>}
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {mode === 'reset'
            ? t('account.sendReset')
            : mode === 'signup'
              ? t('account.create')
              : t('account.signIn')}
        </Button>
      </form>

      {mode === 'signin' && !signUp ? null : (
        <p className="text-center text-sm text-muted-foreground">
          {mode === 'reset' ? null : (
            <>{mode === 'signup' ? t('account.welcome.haveAccount') : t('account.welcome.newHere')} </>
          )}
          <button
            type="button"
            className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={() => {
              switchTo(mode === 'signin' ? 'signup' : 'signin');
            }}
          >
            {mode === 'reset'
              ? t('account.welcome.backToSignIn')
              : mode === 'signup'
                ? t('account.signIn')
                : t('account.create')}
          </button>
        </p>
      )}
    </div>
  );
}

/** One button, one irreversible thing. */
function Confirm({
  action,
  label,
  done,
  destructive = false,
  onDone,
}: {
  readonly action: () => Promise<void>;
  readonly label: 'account.signOutOthers';
  readonly done: 'account.signedOutOthers';
  readonly destructive?: boolean;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation();
  const messages = useMessages();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      toast.success(t(done));
      onDone();
    } catch {
      setError(messages.thrown());
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <ErrorLine message={error} />
      <Button
        type="button"
        variant={destructive ? 'destructive' : 'default'}
        className="w-full"
        disabled={busy}
        onClick={() => void run()}
      >
        {t(label)}
      </Button>
    </div>
  );
}

/**
 * Signing out takes the data off this device; the account keeps it. The only
 * thing that can be lost is a change that never reached the account, so the
 * waiting ones are sent first, and only if some still cannot be (offline) is
 * the person asked.
 */
function SignOut({ onDone }: { readonly onDone: () => void }) {
  const { t } = useTranslation();
  const messages = useMessages();
  const [unsaved, setUnsaved] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void accountController()
      .unsavedChanges()
      .then((n) => {
        if (live) setUnsaved(n);
      });
    return () => {
      live = false;
    };
  }, []);

  const confirm = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await accountController().signOut();
      onDone();
    } catch {
      setError(messages.thrown());
      setBusy(false);
    }
  };

  if (unsaved === undefined)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('account.signOutChecking')}
      </p>
    );

  return (
    <div className="space-y-3">
      {unsaved > 0 ? (
        <p role="alert" className="text-sm text-destructive">
          {t('account.signOutUnsaved', { count: unsaved })}
        </p>
      ) : null}
      <ErrorLine message={error} />
      <Button
        type="button"
        className="w-full"
        variant={unsaved > 0 ? 'destructive' : 'default'}
        disabled={busy}
        onClick={() => void confirm()}
      >
        {unsaved > 0 ? t('account.signOutAnyway') : t('account.signOut')}
      </Button>
    </div>
  );
}

function DeleteAccount({ onDone }: { readonly onDone: () => void }) {
  const { t } = useTranslation();
  const messages = useMessages();
  const view = useAccount();
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const signedIn = view.status === 'signed_in' ? view.user : undefined;
  // Proof it is really them, where there is a password to prove it with.
  const needsPassword = signedIn?.provider === 'email';
  const word = t('account.deleteWord');
  const ready = typed.trim() === word && (!needsPassword || password.length > 0);

  const submit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    if (!ready || signedIn === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const c = accountController();
      if (needsPassword) {
        const check = await c.signIn(signedIn.email ?? '', password);
        if (!check.ok) {
          setError(messages.auth(check));
          setBusy(false);
          return;
        }
      }
      await c.deleteAccount();
      toast.success(t('account.deleted'));
      onDone();
    } catch {
      setError(messages.thrown());
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      {needsPassword ? (
        <Field
          label={t('account.password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
      ) : null}
      <Field
        label={t('account.deleteType', { word })}
        autoComplete="off"
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value);
        }}
      />
      <ErrorLine message={error} />
      <Button type="submit" variant="destructive" className="w-full" disabled={busy || !ready}>
        {t('account.deleteConfirm')}
      </Button>
    </form>
  );
}

function NewPassword({ onDone }: { readonly onDone: () => void }) {
  const { t } = useTranslation();
  const messages = useMessages();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await accountController().setNewPassword(password);
      if (result.ok) {
        toast.success(t('account.passwordChanged'));
        onDone();
      } else {
        setError(messages.auth(result));
      }
    } catch {
      setError(messages.thrown());
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <Field
        label={t('account.newPasswordLabel')}
        hint={t('account.passwordHint')}
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        required
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
      />
      <ErrorLine message={error} />
      <Button type="submit" className="w-full" disabled={busy || password.length < MIN_PASSWORD}>
        {t('account.savePassword')}
      </Button>
    </form>
  );
}

/**
 * Turning codes on: scan, then prove the app has it with its first code. The
 * factor is not on until that code checks out, so a sheet closed halfway
 * leaves the account exactly as it was.
 */
function TwoStepOn({ onDone }: { readonly onDone: () => void }) {
  const { t } = useTranslation();
  const messages = useMessages();
  const [enrollment, setEnrollment] = useState<Enrollment | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let live = true;
    accountController()
      .startTwoStep()
      .then((e) => {
        if (live) setEnrollment(e);
      })
      .catch(() => {
        if (live) setError(messages.thrown());
      });
    return () => {
      live = false;
    };
    // Once per opening; a new enrollment replaces any unfinished one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error !== undefined) return <ErrorLine message={error} />;
  if (enrollment === undefined)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('account.status.checking')}
      </p>
    );

  const grouped = enrollment.secret.replace(/(.{4})/g, '$1 ').trim();

  return (
    <div className="space-y-4">
      <img
        src={enrollment.qr}
        alt={t('account.twoStep.qr')}
        width={176}
        height={176}
        className="mx-auto rounded-xl bg-white p-2"
      />
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">{t('account.twoStep.secret')}</p>
        <div className="flex items-center gap-2">
          <code
            dir="ltr"
            className="min-w-0 flex-1 rounded-lg bg-muted px-2 py-1.5 font-mono text-sm break-all"
          >
            {grouped}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('account.twoStep.copy')}
            onClick={() => {
              void navigator.clipboard.writeText(enrollment.secret).then(() => {
                toast.success(t('account.twoStep.copied'));
              });
            }}
          >
            <Copy className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <CodeForm
        submit={async (code) => {
          const result = await accountController().finishTwoStep(enrollment.factorId, code);
          if (result.ok) {
            toast.success(t('account.twoStep.turnedOn'));
            onDone();
          }
          return result;
        }}
      />
    </div>
  );
}

function TwoStepOff({ onDone }: { readonly onDone: () => void }) {
  const { t } = useTranslation();
  const messages = useMessages();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await accountController().turnOffTwoStep();
      if (result.ok) {
        toast.success(t('account.twoStep.turnedOff'));
        onDone();
        return;
      }
      setError(messages.auth(result));
    } catch {
      setError(messages.thrown());
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <ErrorLine message={error} />
      <Button
        type="button"
        variant="destructive"
        className="w-full"
        disabled={busy}
        onClick={() => void run()}
      >
        {t('account.twoStep.turnOff')}
      </Button>
    </div>
  );
}
