import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useAccount } from '@/app/account';
import { useAccountAvatar } from '@/app/account-avatar';
import { SETTINGS_ROUTES } from '@/app/routes';
import { ScreenHead } from '@/app/screen-head';
import { Sheet } from '@/components/ui/sheet-surface';
import { AccountAvatar } from '@/features/account/account-avatar';

import { useSettingsSections, type SettingsSection } from './sections';

const ROW =
  'flex min-h-14 items-center gap-3 rounded-full px-3 py-2.5 transition-[background-color] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring hover-fine:bg-accent active:bg-accent';

/**
 * Settings on a phone: the list of every settings page - the same places the
 * account menu lists, for anyone who arrives here by address or comes back
 * from one of them. With an account, it opens on who is signed in. (From the
 * desktop `/settings` opens the first subject instead: settings-layout.tsx.)
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const signedIn = useAccount().status === 'signed_in';
  const sections = useSettingsSections();

  return (
    <section className="px-3 pb-24">
      <ScreenHead title={t('settings.title')} />
      <Sheet kind="paper" as="div" data-slot="settings-subjects" className="mbs-sheet grid gap-1">
        {signedIn ? <Who /> : null}
        {[...sections.account, ...sections.app].map((section) => (
          <Row key={section.key} section={section} />
        ))}
      </Sheet>
    </section>
  );
}

function Who() {
  const { name, email } = useAccountAvatar();
  return (
    <Link to={SETTINGS_ROUTES.account} className={ROW}>
      <AccountAvatar size={52} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{name ?? email}</span>
        {name === undefined ? null : (
          <span dir="ltr" className="block truncate text-sm font-light rtl:text-end">
            {email}
          </span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
    </Link>
  );
}

function Row({ section: { to, label, hint } }: { readonly section: SettingsSection }) {
  return (
    <Link to={to} className={ROW}>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm font-light">{hint}</span>
      </span>
      {/* Directional: it points the way the user is going, so it flips. */}
      <ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
    </Link>
  );
}
