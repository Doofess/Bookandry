import { useLiveQuery } from 'dexie-react-hooks';
import { Mail, Pencil, UserMinus, X } from 'lucide-react';
import { useId, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { accountController, useAccount } from '@/app/account';
import { useBaseCurrency } from '@/app/app-context';
import { SETTINGS_ROUTES } from '@/app/routes';
import { ScreenPanel, ScreenTitle } from '@/app/screen-panel';
import { PanelSheet } from '@/components/brand-panel';
import { Money } from '@/components/money';
import { PersonAvatar } from '@/components/person-avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/db/db';
import { ColorTakenError, deleteProfile, listProfiles, updateProfile } from '@/db/repos/profiles';
import { knownSpaces } from '@/db/sync/spaces';
import { ProfileEditor, type ProfileFormValues } from '@/features/profiles/profile-editor';
import { systemClock } from '@/lib/clock';
import { formatLocalDate } from '@/lib/dates';
import type { HouseholdMember, SendInviteOutcome } from '@/services/supabase/household';
import type { Profile } from '@/types/domain';

/**
 * The household: the accounts linked with this one, and how to link more.
 *
 * Every linked account is a person here, shown by their account's picture,
 * and everyone sees and edits everything. Inviting is by email - the link in
 * it is the confirmation - and unlinking leaves each account its own.
 *
 * People made inside this account before accounts could link stay listed
 * apart, until their entries are given to the account of the person they
 * were.
 */
const MAX_MEMBERS = 10;

export function HouseholdScreen() {
  const { t, i18n } = useTranslation(['common', 'profiles']);
  const view = useAccount();
  const baseCurrency = useBaseCurrency();
  const signedIn = view.status === 'signed_in';
  const me = signedIn ? view.user.id : undefined;
  const household = signedIn ? view.household : undefined;

  const data = useLiveQuery(async () => {
    const profiles = await listProfiles(db);
    const linked = await knownSpaces(db);
    const transactions = await db.transactions.toArray();
    const counts = new Map<string, number>();
    for (const tx of transactions) counts.set(tx.profileId, (counts.get(tx.profileId) ?? 0) + 1);
    return { profiles, linked, counts };
  }, []);

  const [editing, setEditing] = useState<Profile | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [giving, setGiving] = useState<Profile | undefined>(undefined);
  const [confirm, setConfirm] = useState<{ kind: 'leave' } | { kind: 'remove'; member: Profile } | undefined>(
    undefined,
  );

  const profiles = data?.profiles ?? [];
  const memberIds = new Set<string>([
    ...(me === undefined ? [] : [me]),
    ...(household?.members.map((m) => m.userId) ?? data?.linked ?? []),
  ]);
  // Signed out, nobody is linked: everyone here is simply a person.
  const members = signedIn ? profiles.filter((p) => memberIds.has(p.id)) : profiles;
  const before = signedIn ? profiles.filter((p) => !memberIds.has(p.id)) : [];
  const roleOf = (id: string): HouseholdMember['role'] | undefined =>
    household?.members.find((m) => m.userId === id)?.role;
  const iOwn = me !== undefined && roleOf(me) === 'owner';
  const linkedCount = household?.members.length ?? 0;

  const save = async (values: ProfileFormValues): Promise<void> => {
    if (editing === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      await updateProfile(
        db,
        editing.id,
        {
          name: values.name,
          color: values.color,
          openingBalanceMinor: values.openingBalanceMinor ?? 0,
          openingBalanceCurrency: values.openingBalanceCurrency,
          openingBalanceDate: values.openingBalanceDate,
        },
        systemClock.nowIso(),
      );
      setEditing(undefined);
    } catch (thrown) {
      setError(
        thrown instanceof ColorTakenError ? t('profiles:screen.errColorTaken') : t('profiles:screen.errSave'),
      );
    } finally {
      setBusy(false);
    }
  };

  const give = async (from: Profile, to: Profile): Promise<void> => {
    setBusy(true);
    try {
      await deleteProfile(db, from.id, { reassignTo: to.id }, systemClock.nowIso());
      setGiving(undefined);
      toast(t('household.given', { name: from.name, to: to.name }));
    } catch {
      toast.error(t('household.err'));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (): Promise<void> => {
    if (confirm === undefined) return;
    setBusy(true);
    try {
      if (confirm.kind === 'leave') {
        await accountController().leaveHousehold();
        toast(t('household.unlinked'));
      } else {
        await accountController().removeMember(confirm.member.id);
        toast(t('household.removed', { name: confirm.member.name }));
      }
      setConfirm(undefined);
    } catch {
      toast.error(t('household.err'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8">
      <ScreenPanel>
        <ScreenTitle>{t('household.title')}</ScreenTitle>
      </ScreenPanel>
      <PanelSheet className="space-y-6 px-4 pt-6">
        <p className="text-sm text-muted-foreground">{t('household.body')}</p>

        <ul
          className="divide-y divide-border rounded-xl border border-border bg-card"
          aria-label={t('household.people')}
        >
          {members.map((person) => (
            <li key={person.id} className="flex items-center gap-3 p-3">
              <PersonAvatar person={person} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {person.name}
                  {person.id === me ? (
                    <span className="ms-1.5 text-xs font-normal text-muted-foreground">
                      {t('household.you')}
                    </span>
                  ) : null}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t('household.opening')}{' '}
                  <Money
                    minor={person.openingBalanceMinor}
                    currency={person.openingBalanceCurrency}
                    announce={false}
                  />
                  {' · '}
                  {formatLocalDate(person.openingBalanceDate, i18n.language, { dateStyle: 'medium' })}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={t('household.edit', { name: person.name })}
                onClick={() => {
                  setError(undefined);
                  setEditing(person);
                }}
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
              {iOwn && person.id !== me && linkedCount > 2 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 text-destructive"
                  aria-label={t('household.remove', { name: person.name })}
                  onClick={() => {
                    setConfirm({ kind: 'remove', member: person });
                  }}
                >
                  <UserMinus className="size-4" aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>

        {signedIn ? (
          <Invite full={linkedCount >= MAX_MEMBERS} currency={baseCurrency} />
        ) : (
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">{t('household.signInTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('household.signInBody')}</p>
            <Link to={SETTINGS_ROUTES.account} className={buttonVariants({ className: 'mt-3' })}>
              {t('household.signIn')}
            </Link>
          </div>
        )}

        {(household?.invites.length ?? 0) > 0 ? (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{t('household.pending')}</h2>
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {household?.invites.map((invite) => (
                <li key={invite.id} className="flex items-center gap-3 p-3">
                  <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span dir="ltr" className="block truncate text-sm rtl:text-end">
                      {invite.email}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t('household.expires', {
                        date: new Date(invite.expiresAt).toLocaleDateString(i18n.language, {
                          dateStyle: 'medium',
                        }),
                      })}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={t('household.revoke', { email: invite.email })}
                    onClick={() => {
                      void accountController()
                        .revokeInvite(invite.id)
                        .then(
                          () => toast(t('household.revoked')),
                          () => toast.error(t('household.err')),
                        );
                    }}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {before.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{t('household.beforeTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('household.beforeBody')}</p>
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {before.map((person) => (
                <li key={person.id} className="flex items-center gap-3 p-3">
                  <PersonAvatar person={person} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{person.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t('household.entries', { count: data?.counts.get(person.id) ?? 0 })}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setGiving(person);
                    }}
                  >
                    {t('household.giveTo')}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {linkedCount >= 2 ? (
          <section className="space-y-2 rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">{t('household.unlinkTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('household.unlinkBody')}</p>
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              onClick={() => {
                setConfirm({ kind: 'leave' });
              }}
            >
              {t('household.unlink')}
            </Button>
          </section>
        ) : null}

        <ProfileEditor
          open={editing !== undefined}
          onOpenChange={(open) => {
            if (!open) setEditing(undefined);
          }}
          {...(editing === undefined ? {} : { profile: editing })}
          existing={profiles}
          baseCurrency={baseCurrency}
          onSave={(values) => {
            void save(values);
          }}
          {...(error === undefined ? {} : { error })}
          saving={busy}
        />

        <GiveDialog
          person={giving}
          to={members}
          busy={busy}
          onOpenChange={(open) => {
            if (!open) setGiving(undefined);
          }}
          onGive={(to) => {
            if (giving !== undefined) void give(giving, to);
          }}
        />

        <AlertDialog
          open={confirm !== undefined}
          onOpenChange={(open) => {
            if (!open) setConfirm(undefined);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm?.kind === 'remove'
                  ? t('household.removeTitle', { name: confirm.member.name })
                  : t('household.leaveTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm?.kind === 'remove'
                  ? t('household.removeBody', { name: confirm.member.name })
                  : t('household.unlinkBody')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>{t('household.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  void unlink();
                }}
              >
                {confirm?.kind === 'remove' ? t('household.removeConfirm') : t('household.unlink')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PanelSheet>
    </section>
  );
}

function Invite({ full, currency }: { readonly full: boolean; readonly currency: string }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<Exclude<SendInviteOutcome, { ok: true }>['error'] | undefined>(
    undefined,
  );

  const send = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    if (email.trim() === '' || sending) return;
    setSending(true);
    setProblem(undefined);
    const outcome = await accountController().invite(
      email.trim(),
      currency,
      i18n.language === 'he' ? 'he' : 'en',
    );
    setSending(false);
    if (outcome.ok) {
      toast(t('household.inviteSent', { email: email.trim() }));
      setEmail('');
    } else {
      setProblem(outcome.error);
    }
  };

  return (
    <form className="space-y-3 rounded-xl border border-border bg-card p-4" onSubmit={(e) => void send(e)}>
      <div>
        <h2 className="font-semibold">{t('household.inviteTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('household.inviteBody')}</p>
      </div>
      {full ? (
        <p className="text-sm text-muted-foreground">{t('household.full')}</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={id}>{t('household.inviteEmail')}</Label>
            <Input
              id={id}
              type="email"
              dir="ltr"
              autoComplete="off"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setProblem(undefined);
              }}
              aria-invalid={problem !== undefined}
              aria-describedby={problem === undefined ? undefined : `${id}-err`}
            />
            {problem === undefined ? null : (
              <p id={`${id}-err`} role="alert" className="text-sm text-destructive">
                {t(`household.inviteErr.${problem}`)}
              </p>
            )}
          </div>
          <Button type="submit" disabled={sending || email.trim() === ''}>
            {sending ? t('household.inviteSending') : t('household.inviteSend')}
          </Button>
        </>
      )}
    </form>
  );
}

function GiveDialog({
  person,
  to,
  busy,
  onOpenChange,
  onGive,
}: {
  readonly person: Profile | undefined;
  readonly to: readonly Profile[];
  readonly busy: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onGive: (to: Profile) => void;
}) {
  const { t } = useTranslation();
  const groupId = useId();
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const target = to.find((p) => p.id === chosen) ?? to[0];

  return (
    <AlertDialog open={person !== undefined} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('household.giveTitle', { name: person?.name ?? '' })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('household.giveBody', { name: person?.name ?? '' })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div role="radiogroup" aria-labelledby={groupId} className="space-y-1">
          <span id={groupId} className="sr-only">
            {t('household.giveTo')}
          </span>
          {to.map((p) => (
            <label
              key={p.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted"
            >
              <input
                type="radio"
                name={groupId}
                checked={target?.id === p.id}
                onChange={() => {
                  setChosen(p.id);
                }}
              />
              <PersonAvatar person={p} size="sm" />
              <span className="text-sm">{p.name}</span>
            </label>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t('household.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || target === undefined}
            onClick={() => {
              if (target !== undefined) onGive(target);
            }}
          >
            {t('household.give')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
