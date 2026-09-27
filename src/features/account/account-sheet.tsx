import { Check, Copy, Download } from 'lucide-react';
import { useId, useState, type SyntheticEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { accountController, useAccount } from '@/app/account';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Secret, UnlockResult } from '@/db/sync/account';
import { systemClock } from '@/lib/clock';
import type { AuthResult } from '@/services/supabase/auth';
import { ServerError } from '@/services/supabase/transport';

/**
 * Every account flow, in one bottom sheet.
 *
 * Words matter more than usual here. "Sign in" proves who you are to the
 * server; "unlock" gives this device the key to your data, which the server
 * never has. The UI never says "encryption key" - it says passphrase,
 * recovery key, lock and unlock - and it says plainly, once, what cannot be
 * undone: forget both secrets and the server's copy cannot be read.
 */
export type Flow =
  | { readonly kind: 'signin'; readonly mode: 'signin' | 'signup' }
  | { readonly kind: 'setup' }
  | { readonly kind: 'unlock' }
  | { readonly kind: 'recovery' }
  | { readonly kind: 'passphrase' }
  | { readonly kind: 'lost' }
  | { readonly kind: 'signout' }
  | { readonly kind: 'delete' }
  | { readonly kind: 'newPassword' };

/** Long enough that Argon2id is protecting something worth the effort. */
const MIN_PASSPHRASE = 10;
const MIN_PASSWORD = 8;

export function AccountSheet({
  flow,
  onClose,
}: {
  readonly flow: Flow | undefined;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  // A flow that has made a recovery key must not be dismissed by a stray tap
  // before the key is saved: it is shown once, and only once.
  const [pinned, setPinned] = useState(false);

  const title =
    flow === undefined ? '' : t(`account.flow.${flow.kind === 'signin' ? flow.mode : flow.kind}.title`);
  const body =
    flow === undefined ? '' : t(`account.flow.${flow.kind === 'signin' ? flow.mode : flow.kind}.body`);

  const close = (): void => {
    setPinned(false);
    onClose();
  };

  return (
    <Sheet
      open={flow !== undefined}
      onOpenChange={(next) => {
        if (!next && !pinned) close();
      }}
    >
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{body}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {flow === undefined ? null : (
            <FlowBody key={flow.kind} flow={flow} onDone={close} onPin={setPinned} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FlowBody({
  flow,
  onDone,
  onPin,
}: {
  readonly flow: Flow;
  readonly onDone: () => void;
  readonly onPin: (pinned: boolean) => void;
}) {
  switch (flow.kind) {
    case 'signin':
      return <SignIn initial={flow.mode} onDone={onDone} />;
    case 'setup':
      return <SetUp onDone={onDone} onPin={onPin} />;
    case 'unlock':
      return <Unlock onDone={onDone} />;
    case 'recovery':
      return <NewRecoveryKey onDone={onDone} onPin={onPin} />;
    case 'passphrase':
      return <ChangePassphrase onDone={onDone} />;
    case 'lost':
      return <LostDevice onDone={onDone} onPin={onPin} />;
    case 'signout':
      return <SignOut onDone={onDone} />;
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
    unlock: (result: UnlockResult): string | undefined => {
      if (result.ok) return undefined;
      switch (result.reason) {
        case 'wrong':
          return t('account.wrongSecret');
        case 'no_passphrase':
          return t('account.noPassphrase');
        case 'not_set_up':
          return t('account.notSetUp');
        case 'malformed':
          return t(`account.malformed.${result.detail}`);
      }
    },
    thrown: (error: unknown): string =>
      error instanceof ServerError && error.code === 'already_set_up'
        ? t('account.alreadySetUp')
        : error instanceof ServerError && error.code === 'key_version_changed'
          ? t('account.keyChanged')
          : navigator.onLine
            ? t('account.errors.unknown')
            : t('account.errors.offline'),
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

/** Proving you hold a secret: the passphrase, or the recovery key. */
function SecretField({
  value,
  onChange,
  label,
}: {
  readonly value: Secret;
  readonly onChange: (secret: Secret) => void;
  readonly label?: string;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label id={labelId}>{label ?? t('account.unlockWith')}</Label>
        <Segmented<Secret['kind']>
          value={value.kind}
          labelledBy={labelId}
          size="sm"
          onChange={(kind) => {
            onChange(kind === 'passphrase' ? { kind, passphrase: '' } : { kind, text: '' });
          }}
          options={[
            { value: 'passphrase', label: t('account.passphrase') },
            { value: 'recovery', label: t('account.recoveryKey') },
          ]}
        />
      </div>
      {value.kind === 'passphrase' ? (
        <Field
          label={t('account.passphrase')}
          type="password"
          autoComplete="off"
          value={value.passphrase}
          onChange={(e) => {
            onChange({ kind: 'passphrase', passphrase: e.target.value });
          }}
        />
      ) : (
        <Field
          label={t('account.recoveryKey')}
          hint={t('account.recoveryKeyHint')}
          // A code, not prose: always left to right, even in Hebrew.
          dir="ltr"
          className="font-mono"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={value.text}
          onChange={(e) => {
            onChange({ kind: 'recovery', text: e.target.value });
          }}
        />
      )}
    </div>
  );
}

function secretEntered(secret: Secret): boolean {
  return secret.kind === 'passphrase' ? secret.passphrase.length > 0 : secret.text.trim().length > 0;
}

/** A new passphrase, typed twice. Returns it once valid, else undefined. */
function useNewPassphrase() {
  const { t } = useTranslation();
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const tooShort = first.length > 0 && first.length < MIN_PASSPHRASE;
  const mismatch = second.length > 0 && second !== first;
  const valid = first.length >= MIN_PASSPHRASE && first === second;

  const fields = (
    <>
      <Field
        label={t('account.newPassphrase')}
        hint={tooShort ? t('account.passphraseShort') : t('account.passphraseHint')}
        type="password"
        autoComplete="off"
        value={first}
        aria-invalid={tooShort}
        onChange={(e) => {
          setFirst(e.target.value);
        }}
      />
      <Field
        label={t('account.passphraseConfirm')}
        hint={mismatch ? t('account.passphraseMismatch') : undefined}
        type="password"
        autoComplete="off"
        value={second}
        aria-invalid={mismatch}
        onChange={(e) => {
          setSecond(e.target.value);
        }}
      />
    </>
  );
  return { fields, value: valid ? first : undefined };
}

// ---------------------------------------------------------------------------
// The recovery key, shown once
// ---------------------------------------------------------------------------

function RecoveryKeyStep({
  recoveryKey,
  onDone,
}: {
  readonly recoveryKey: string;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation();
  const view = useAccount();
  const [kept, setKept] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setKept(true);
    } catch {
      toast.error(t('account.copyFailed'));
    }
  };

  const download = (): void => {
    const email = view.status === 'signed_in' ? (view.user.email ?? '') : '';
    const text = [
      t('account.recoveryFile.title'),
      '',
      recoveryKey,
      '',
      t('account.recoveryFile.for', { email }),
      t('account.recoveryFile.made', { date: systemClock.today() }),
      '',
      t('account.recoveryFile.keep'),
      '',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookandry-recovery-key.txt';
    a.click();
    URL.revokeObjectURL(url);
    setKept(true);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm">{t('account.recoveryBody')}</p>
      {/*
        LTR-isolated and monospace in both languages. Read out as ONE label by
        screen readers, not character by character: whoever needs it spelled
        out can move through it at their own pace.
      */}
      <p
        dir="ltr"
        aria-label={t('account.recoveryKey')}
        className="rounded-xl border border-border bg-muted/40 p-4 text-center font-mono text-lg tracking-wider break-all select-all"
      >
        {recoveryKey}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => void copy()}>
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {copied ? t('account.copied') : t('account.copy')}
        </Button>
        <Button type="button" variant="outline" onClick={download}>
          <Download className="size-4" aria-hidden="true" />
          {t('account.download')}
        </Button>
      </div>
      <Button type="button" className="w-full" disabled={!kept} onClick={onDone}>
        {t('account.recoverySaved')}
      </Button>
      {kept ? null : <p className="text-xs text-muted-foreground">{t('account.recoveryMustSave')}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

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
    } catch (e) {
      setError(messages.thrown(e));
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
    } catch (e) {
      setError(messages.thrown(e));
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

function SetUp({
  onDone,
  onPin,
}: {
  readonly onDone: () => void;
  readonly onPin: (pinned: boolean) => void;
}) {
  const { t } = useTranslation();
  const messages = useMessages();
  const passphrase = useNewPassphrase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [recoveryKey, setRecoveryKey] = useState<string | undefined>(undefined);

  if (recoveryKey !== undefined) {
    return (
      <RecoveryKeyStep
        recoveryKey={recoveryKey}
        onDone={() => {
          void accountController().finishSetUp();
          onDone();
        }}
      />
    );
  }

  const submit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    if (passphrase.value === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await accountController().setUp(passphrase.value);
      onPin(true);
      setRecoveryKey(result.recoveryKey);
    } catch (e) {
      setError(messages.thrown(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-sm text-muted-foreground">{t('account.setUpNote')}</p>
      {passphrase.fields}
      <p className="text-xs text-muted-foreground">{t('account.joinNote')}</p>
      <ErrorLine message={error} />
      <Button type="submit" className="w-full" disabled={busy || passphrase.value === undefined}>
        {busy ? t('account.locking') : t('account.setUpStart')}
      </Button>
    </form>
  );
}

function Unlock({ onDone }: { readonly onDone: () => void }) {
  const { t } = useTranslation();
  const messages = useMessages();
  const [secret, setSecret] = useState<Secret>({ kind: 'passphrase', passphrase: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await accountController().unlock(secret);
      if (result.ok) onDone();
      else setError(messages.unlock(result));
    } catch (e) {
      setError(messages.thrown(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <SecretField value={secret} onChange={setSecret} />
      <p className="text-xs text-muted-foreground">{t('account.joinNote')}</p>
      <ErrorLine message={error} />
      <Button type="submit" className="w-full" disabled={busy || !secretEntered(secret)}>
        {busy ? t('account.unlocking') : t('account.unlock')}
      </Button>
    </form>
  );
}

function NewRecoveryKey({
  onDone,
  onPin,
}: {
  readonly onDone: () => void;
  readonly onPin: (p: boolean) => void;
}) {
  const { t } = useTranslation();
  const messages = useMessages();
  const [secret, setSecret] = useState<Secret>({ kind: 'passphrase', passphrase: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [recoveryKey, setRecoveryKey] = useState<string | undefined>(undefined);

  if (recoveryKey !== undefined) return <RecoveryKeyStep recoveryKey={recoveryKey} onDone={onDone} />;

  const submit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await accountController().replaceRecoveryKey(secret);
      if (result.ok && 'recoveryKey' in result) {
        onPin(true);
        setRecoveryKey(result.recoveryKey);
      } else {
        setError(messages.unlock(result));
      }
    } catch (e) {
      setError(messages.thrown(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <SecretField value={secret} onChange={setSecret} label={t('account.prove')} />
      <ErrorLine message={error} />
      <Button type="submit" className="w-full" disabled={busy || !secretEntered(secret)}>
        {busy ? t('account.locking') : t('account.newRecovery')}
      </Button>
    </form>
  );
}

function ChangePassphrase({ onDone }: { readonly onDone: () => void }) {
  const { t } = useTranslation();
  const messages = useMessages();
  const [secret, setSecret] = useState<Secret>({ kind: 'passphrase', passphrase: '' });
  const next = useNewPassphrase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    if (next.value === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await accountController().changePassphrase(secret, next.value);
      if (result.ok) {
        toast.success(t('account.passphraseChanged'));
        onDone();
      } else {
        setError(messages.unlock(result));
      }
    } catch (e) {
      setError(messages.thrown(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <SecretField value={secret} onChange={setSecret} label={t('account.prove')} />
      <div className="space-y-3 border-t border-border pt-3">{next.fields}</div>
      <ErrorLine message={error} />
      <Button
        type="submit"
        className="w-full"
        disabled={busy || !secretEntered(secret) || next.value === undefined}
      >
        {busy ? t('account.locking') : t('account.changePassphrase')}
      </Button>
    </form>
  );
}

function LostDevice({
  onDone,
  onPin,
}: {
  readonly onDone: () => void;
  readonly onPin: (p: boolean) => void;
}) {
  const { t } = useTranslation();
  const messages = useMessages();
  const [secret, setSecret] = useState<Secret>({ kind: 'passphrase', passphrase: '' });
  const next = useNewPassphrase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [recoveryKey, setRecoveryKey] = useState<string | undefined>(undefined);

  if (recoveryKey !== undefined) return <RecoveryKeyStep recoveryKey={recoveryKey} onDone={onDone} />;

  const submit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    if (next.value === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await accountController().lostDevice(secret, next.value);
      if (result.ok && 'recoveryKey' in result) {
        onPin(true);
        setRecoveryKey(result.recoveryKey);
      } else {
        setError(messages.unlock(result));
      }
    } catch (e) {
      setError(messages.thrown(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-sm text-muted-foreground">{t('account.lostLimits')}</p>
      <SecretField value={secret} onChange={setSecret} label={t('account.prove')} />
      <div className="space-y-3 border-t border-border pt-3">
        <p className="text-sm">{t('account.lostNewPassphrase')}</p>
        {next.fields}
      </div>
      <ErrorLine message={error} />
      <Button
        type="submit"
        variant="destructive"
        className="w-full"
        disabled={busy || !secretEntered(secret) || next.value === undefined}
      >
        {busy ? t('account.locking') : t('account.lostConfirm')}
      </Button>
    </form>
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
    } catch (e) {
      setError(messages.thrown(e));
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
    } catch (e) {
      setError(messages.thrown(e));
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
    } catch (e) {
      setError(messages.thrown(e));
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
