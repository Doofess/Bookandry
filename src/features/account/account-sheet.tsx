import { useEffect, useId, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { accountController, useAccount } from '@/app/account';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { AuthResult } from '@/services/supabase/auth';

/**
 * Every account flow, in one bottom sheet.
 *
 * There is nothing here about keys or copies: signing in is enough, and the
 * account hands each device its data. What is left is signing in and out,
 * and deleting the account - the one thing that cannot be undone, confirmed.
 */
export type Flow =
  | { readonly kind: 'signin'; readonly mode: 'signin' | 'signup' }
  | { readonly kind: 'signout' }
  | { readonly kind: 'signOutOthers' }
  | { readonly kind: 'delete' }
  | { readonly kind: 'newPassword' };

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
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function useMessages() {
  const { t } = useTranslation();
  return {
    auth: (result: AuthResult): string | undefined =>
      result.ok ? undefined : t(`account.errors.${result.reason}`),
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

/** Also the lock screen's form, where only signing in is offered. */
export function SignIn({
  initial,
  onDone,
  signUp = true,
  email: knownEmail = '',
}: {
  readonly initial: 'signin' | 'signup';
  readonly onDone: () => void;
  readonly signUp?: boolean;
  /** The account this device belongs to, when it is known. */
  readonly email?: string;
}) {
  const { t } = useTranslation();
  const messages = useMessages();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(initial);
  const [email, setEmail] = useState(knownEmail);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
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
        const result = await c.signUp(email, password);
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

  return (
    <div className="space-y-4">
      {mode === 'reset' ? null : (
        <>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => void google()}
          >
            {t('account.google')}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t('account.or')}</p>
        </>
      )}

      <form className="space-y-3" onSubmit={(e) => void submit(e)}>
        <Field
          label={t('account.email')}
          type="email"
          autoComplete="email"
          dir="ltr"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        {mode === 'reset' ? null : (
          <Field
            label={t('account.password')}
            hint={mode === 'signup' ? t('account.passwordHint') : undefined}
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={mode === 'signup' ? MIN_PASSWORD : undefined}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        )}
        <ErrorLine message={error} />
        {info === undefined ? null : <InfoLine>{info}</InfoLine>}
        <Button type="submit" className="w-full" disabled={busy}>
          {mode === 'reset'
            ? t('account.sendReset')
            : mode === 'signup'
              ? t('account.create')
              : t('account.signIn')}
        </Button>
      </form>

      <div className="grid gap-1">
        {mode === 'signin' ? (
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setMode('reset');
            }}
          >
            {t('account.forgot')}
          </Button>
        ) : null}
        {!signUp && mode === 'signin' ? null : (
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setMode(mode === 'signup' || !signUp ? 'signin' : 'signup');
              setError(undefined);
              setInfo(undefined);
            }}
          >
            {mode === 'signup' || !signUp ? t('account.haveAccount') : t('account.noAccount')}
          </Button>
        )}
      </div>
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
