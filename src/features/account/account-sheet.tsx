import { useId, useState, type ReactNode, type SyntheticEvent } from 'react';
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
 * There is nothing here about keys: signing in is enough, and the account
 * hands each device its data key without asking anything of the person. What
 * is left is signing in and out, and the two things that cannot be undone -
 * deleting the account, and starting the synced copy over - each confirmed.
 */
export type Flow =
  | { readonly kind: 'signin'; readonly mode: 'signin' | 'signup' }
  | { readonly kind: 'signout' }
  | { readonly kind: 'signOutOthers' }
  | { readonly kind: 'startFresh' }
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
    case 'startFresh':
      return (
        <Confirm
          action={() => accountController().startFresh()}
          label="account.startFresh"
          done="account.startedFresh"
          destructive
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

function SignIn({ initial, onDone }: { readonly initial: 'signin' | 'signup'; readonly onDone: () => void }) {
  const { t } = useTranslation();
  const messages = useMessages();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(initial);
  const [email, setEmail] = useState('');
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
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setMode(mode === 'signup' ? 'signin' : 'signup');
            setError(undefined);
            setInfo(undefined);
          }}
        >
          {mode === 'signup' ? t('account.haveAccount') : t('account.noAccount')}
        </Button>
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
  readonly label: 'account.signOutOthers' | 'account.startFresh';
  readonly done: 'account.signedOutOthers' | 'account.startedFresh';
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

function SignOut({ onDone }: { readonly onDone: () => void }) {
  const { t } = useTranslation();
  const messages = useMessages();
  // Nothing preselected, on purpose: this app does not choose for people what
  // happens to their data.
  const [choice, setChoice] = useState<'keep' | 'remove' | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const groupId = useId();

  const confirm = async (): Promise<void> => {
    if (choice === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      await accountController().signOut(choice === 'remove');
      onDone();
    } catch {
      setError(messages.thrown());
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p id={groupId} className="text-sm font-medium">
        {t('account.signOutQuestion')}
      </p>
      <div role="radiogroup" aria-labelledby={groupId} className="grid gap-1.5">
        <Choice
          selected={choice === 'keep'}
          label={t('account.signOutKeep')}
          hint={t('account.signOutKeepHint')}
          onSelect={() => {
            setChoice('keep');
          }}
        />
        <Choice
          selected={choice === 'remove'}
          label={t('account.signOutRemove')}
          hint={t('account.signOutRemoveHint')}
          destructive
          onSelect={() => {
            setChoice('remove');
          }}
        />
      </div>
      <ErrorLine message={error} />
      <Button
        type="button"
        className="w-full"
        variant={choice === 'remove' ? 'destructive' : 'default'}
        disabled={busy || choice === undefined}
        onClick={() => void confirm()}
      >
        {t('account.signOut')}
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

function Choice({
  selected,
  label,
  hint,
  destructive = false,
  onSelect,
}: {
  readonly selected: boolean;
  readonly label: string;
  readonly hint: string;
  readonly destructive?: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={
        'rounded-xl border p-3 text-start transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ' +
        (selected ? 'border-primary bg-accent' : 'border-border hover:bg-muted')
      }
    >
      <span className={`block text-sm font-medium ${destructive ? 'text-destructive' : ''}`}>{label}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}
