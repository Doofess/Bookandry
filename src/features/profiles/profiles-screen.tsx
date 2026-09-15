import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useBaseCurrency } from '@/app/app-context';
import { Avatar } from '@/components/avatars/avatar';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { db } from '@/db/db';
import {
  ColorTakenError,
  createProfile,
  deleteProfile,
  listProfiles,
  updateProfile,
} from '@/db/repos/profiles';
import { MAX_PROFILES } from '@/domain/palette';
import { systemClock } from '@/lib/clock';
import { formatLocalDate } from '@/lib/dates';
import { newId } from '@/lib/id';
import { SHARED_OWNER, type Profile } from '@/types/domain';

import { DeleteProfileDialog } from './delete-profile-dialog';
import { ProfileEditor, type ProfileFormValues } from './profile-editor';

type Editing = { readonly mode: 'add' } | { readonly mode: 'edit'; readonly profile: Profile };

export function ProfilesScreen() {
  const { t, i18n } = useTranslation(['common', 'profiles']);
  const baseCurrency = useBaseCurrency();

  const [editing, setEditing] = useState<Editing | undefined>(undefined);
  const [deleting, setDeleting] = useState<Profile | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  /*
   * Counts come from the same live query as the list.
   *
   * The delete dialog has to say how many transactions and payment methods are
   * at stake BEFORE the user confirms - a confirmation that cannot name the
   * consequence is a speed bump, not a decision.
   */
  const data = useLiveQuery(async () => {
    const profiles = await listProfiles(db);
    const transactions = await db.transactions.toArray();
    const methods = await db.paymentMethods.toArray();

    const byProfile = new Map<string, { transactions: number; methods: number }>();
    for (const profile of profiles) byProfile.set(profile.id, { transactions: 0, methods: 0 });
    for (const tx of transactions) {
      const entry = byProfile.get(tx.profileId);
      if (entry !== undefined) entry.transactions += 1;
    }
    for (const method of methods) {
      // Shared household methods belong to nobody and survive any deletion.
      if (method.profileId === SHARED_OWNER) continue;
      const entry = byProfile.get(method.profileId);
      if (entry !== undefined) entry.methods += 1;
    }
    return { profiles, counts: byProfile };
  }, []);

  const profiles = data?.profiles ?? [];
  const atLimit = profiles.length >= MAX_PROFILES;

  const save = async (values: ProfileFormValues): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const now = systemClock.nowIso();
      const draft = {
        name: values.name,
        avatar: values.avatar,
        color: values.color,
        openingBalanceMinor: values.openingBalanceMinor ?? 0,
        openingBalanceCurrency: values.openingBalanceCurrency,
        openingBalanceDate: values.openingBalanceDate,
      };

      if (editing?.mode === 'edit') await updateProfile(db, editing.profile.id, draft, now);
      else await createProfile(db, newId(), draft, now);

      setEditing(undefined);
    } catch (thrown) {
      // Named, because the two failures a user can act on are different: a
      // taken colour is a choice to change, and anything else is a retry.
      setError(
        thrown instanceof ColorTakenError ? t('profiles:screen.errColorTaken') : t('profiles:screen.errSave'),
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (profile: Profile, reassignTo: string | undefined): Promise<void> => {
    setBusy(true);
    try {
      const result = await deleteProfile(
        db,
        profile.id,
        reassignTo === undefined ? {} : { reassignTo },
        systemClock.nowIso(),
      );
      setDeleting(undefined);

      const target = profiles.find((p) => p.id === reassignTo);
      toast(t('profiles:screen.toastDeleted', { name: profile.name }), {
        description:
          result.transactionsMoved > 0 && target !== undefined
            ? t('profiles:screen.toastMoved', {
                count: result.transactionsMoved,
                name: target.name,
              })
            : undefined,
      });
    } catch {
      toast.error(t('profiles:screen.errSave'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6 pb-24 lg:pb-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('profiles:screen.title')}</h1>
        {/* Stated once, where profiles are managed: they are organisation, not
            privacy, and nothing else in the app says so. */}
        <p className="mt-2 text-sm text-muted-foreground">{t('profiles:screen.body')}</p>
      </header>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {profiles.map((profile) => (
          <li key={profile.id} className="flex items-center gap-3 p-3">
            <Avatar avatar={profile.avatar} color={profile.color} size="md" />

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{profile.name}</span>
              <span className="block text-xs text-muted-foreground">
                <Money
                  minor={profile.openingBalanceMinor}
                  currency={profile.openingBalanceCurrency}
                  announce={false}
                />
                {' · '}
                {formatLocalDate(profile.openingBalanceDate, i18n.language, { dateStyle: 'medium' })}
              </span>
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={`${t('profiles:screen.editTitle')}: ${profile.name}`}
              onClick={() => {
                setError(undefined);
                setEditing({ mode: 'edit', profile });
              }}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 text-destructive"
              aria-label={t('profiles:screen.deleteTitle', { name: profile.name })}
              onClick={() => {
                setDeleting(profile);
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>

      <div className="space-y-1.5">
        <Button
          type="button"
          variant="outline"
          disabled={atLimit}
          onClick={() => {
            setError(undefined);
            setEditing({ mode: 'add' });
          }}
          className="w-full"
        >
          <Plus className="size-4" aria-hidden="true" />
          {t('profiles:screen.add')}
        </Button>
        {/*
          The REASON, not just a disabled button.
          The cap is the palette size, and a button that simply stops working
          teaches nothing - the plan is explicit that this must be explained
          rather than discovered by a form that fails on submit.
        */}
        {atLimit ? (
          <p className="text-xs text-muted-foreground">
            {t('profiles:screen.addDisabled', { count: MAX_PROFILES })}
          </p>
        ) : null}
      </div>

      <ProfileEditor
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        {...(editing?.mode === 'edit' ? { profile: editing.profile } : {})}
        existing={profiles}
        baseCurrency={baseCurrency}
        onSave={(values) => {
          void save(values);
        }}
        {...(error === undefined ? {} : { error })}
        saving={busy}
      />

      <DeleteProfileDialog
        profile={deleting}
        others={profiles.filter((p) => p.id !== deleting?.id)}
        transactionCount={deleting === undefined ? 0 : (data?.counts.get(deleting.id)?.transactions ?? 0)}
        paymentMethodCount={deleting === undefined ? 0 : (data?.counts.get(deleting.id)?.methods ?? 0)}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
        onConfirm={(reassignTo) => {
          if (deleting !== undefined) void remove(deleting, reassignTo);
        }}
        busy={busy}
      />
    </section>
  );
}
