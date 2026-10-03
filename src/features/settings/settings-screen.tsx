import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useAccount } from '@/app/account';
import { useAccountAvatar } from '@/app/account-avatar';
import { SETTINGS_ROUTES } from '@/app/routes';
import { AccountAvatar } from '@/features/account/account-avatar';

import { useSettingsSections, type SettingsSection } from './sections';

/**
 * Settings: the list of every settings page - the same places the account
 * menu lists, for anyone who arrives here by address or comes back from one
 * of them. With an account, it opens on who is signed in.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const signedIn = useAccount().status === 'signed_in';
  const sections = useSettingsSections();

  return (
    <section className="mx-auto max-w-2xl space-y-6 px-4 py-6 pb-24 lg:pb-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>

      {signedIn ? <Who /> : null}
      {sections.account.length > 0 ? <Group sections={sections.account} /> : null}
      <Group sections={sections.app} />
    </section>
  );
}

function Who() {
  const { name, email } = useAccountAvatar();
  return (
    <Link
      to={SETTINGS_ROUTES.account}
      className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <AccountAvatar size={52} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{name ?? email}</span>
        {name === undefined ? null : (
          <span dir="ltr" className="block truncate text-sm text-muted-foreground rtl:text-end">
            {email}
          </span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
    </Link>
  );
}

/** A run of links, one card, divided - a list, not a pile of cards. */
function Group({ sections }: { readonly sections: readonly SettingsSection[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {sections.map(({ key, to, icon: Icon, label, hint }) => (
        <li key={key}>
          <Link
            to={to}
            className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
            {/* Directional: it points the way the user is going, so it flips. */}
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
