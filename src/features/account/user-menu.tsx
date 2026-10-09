import { Languages, LogOut, SunMoon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useAccount } from '@/app/account';
import { useAccountAvatar } from '@/app/account-avatar';
import { useSettings } from '@/app/app-context';
import { chooseLanguage, chooseTheme } from '@/app/preferences';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSettingsSections, type SettingsSection } from '@/features/settings/sections';
import type { Language, Theme } from '@/i18n/boot';

import { AccountAvatar } from './account-avatar';
import { AccountSheet, type Flow } from './account-sheet';

/**
 * The account menu: the person's picture at the top end of every screen,
 * where an account and its settings are looked for in every app people use.
 *
 * Who is signed in; every settings page, account first; the two settings
 * people change most - appearance and language - right in the menu; and
 * signing out, last. In a build without accounts it is the same menu less
 * the account.
 */
export function UserMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const view = useAccount();
  const settings = useSettings();
  const { name, email } = useAccountAvatar();
  const sections = useSettingsSections();
  const [flow, setFlow] = useState<Flow | undefined>(undefined);
  const signedIn = view.status === 'signed_in';

  const item = (section: SettingsSection) => {
    const Icon = section.icon;
    return (
      <DropdownMenuItem
        key={section.key}
        className="gap-3 py-2"
        onClick={() => {
          void navigate(section.to);
        }}
      >
        <Icon className="text-muted-foreground" aria-hidden="true" />
        {section.label}
      </DropdownMenuItem>
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('menu.label')}
          // On the deep panel: a 44px target around the 34px picture, and a
          // light ring so the picture's edge shows on the sapphire.
          className="-me-1.5 flex size-11 items-center justify-center rounded-full focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:outline-none"
        >
          <AccountAvatar size={34} className="ring-2 ring-white/35" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-1.5">
          {signedIn ? (
            <>
              {/* Who is signed in: read, not chosen, so not an item. */}
              <div className="flex items-center gap-3 px-2 py-2.5">
                <AccountAvatar size={40} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{name ?? email}</p>
                  {name === undefined ? null : (
                    <p dir="ltr" className="truncate text-xs text-muted-foreground rtl:text-end">
                      {email}
                    </p>
                  )}
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>{sections.account.map(item)}</DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuGroup>{sections.app.map(item)}</DropdownMenuGroup>
          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-3 py-2">
              <SunMoon className="text-muted-foreground" aria-hidden="true" />
              <span className="flex-1">{t('settings.appearance')}</span>
              <span className="text-xs text-muted-foreground">{t(`theme.${settings.theme}`)}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={settings.theme}
                onValueChange={(value: Theme) => {
                  chooseTheme(value);
                }}
              >
                <DropdownMenuRadioItem value="light">{t('theme.light')}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">{t('theme.dark')}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">{t('theme.system')}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-3 py-2">
              <Languages className="text-muted-foreground" aria-hidden="true" />
              <span className="flex-1">{t('language.label')}</span>
              <span className="text-xs text-muted-foreground">{t(`language.${settings.language}`)}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={settings.language}
                onValueChange={(value: Language) => {
                  chooseLanguage(value);
                }}
              >
                <DropdownMenuRadioItem value="en" lang="en">
                  {t('language.en')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="he" lang="he">
                  {t('language.he')}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {signedIn ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-3 py-2"
                onClick={() => {
                  setFlow({ kind: 'signout' });
                }}
              >
                <LogOut className="text-muted-foreground" aria-hidden="true" />
                {t('account.signOut')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Here, mounted on every screen: back from a password-reset email, the
          new password is asked for wherever the link landed. */}
      <AccountSheet
        flow={signedIn && view.passwordRecovery && flow === undefined ? { kind: 'newPassword' } : flow}
        onClose={() => {
          setFlow(undefined);
        }}
      />
    </>
  );
}
