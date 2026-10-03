import {
  CreditCard,
  DatabaseBackup,
  Repeat,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  UserRound,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

import { useAccount } from '@/app/account';
import { LINKED_ROUTES, SETTINGS_ROUTES } from '@/app/routes';

/**
 * Every place a setting lives, once: the account menu and the Settings page
 * list the same entries, so the two can never disagree about what exists or
 * what it is called.
 */
export type SettingsSection = {
  readonly key: string;
  readonly to: string;
  readonly icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  readonly label: string;
  readonly hint: string;
};

export function useSettingsSections(): {
  /** About the account: only with one signed in. */
  readonly account: readonly SettingsSection[];
  /** About the app and what is in it. */
  readonly app: readonly SettingsSection[];
} {
  const { t } = useTranslation(['common', 'categories']);
  const signedIn = useAccount().status === 'signed_in';

  const account: SettingsSection[] = signedIn
    ? [
        {
          key: 'account',
          to: SETTINGS_ROUTES.account,
          icon: UserRound,
          label: t('settings.sections.account'),
          hint: t('settings.sections.accountHint'),
        },
        {
          key: 'security',
          to: SETTINGS_ROUTES.security,
          icon: ShieldCheck,
          label: t('account.security'),
          hint: t('settings.sections.securityHint'),
        },
      ]
    : [];

  const app: SettingsSection[] = [
    {
      key: 'preferences',
      to: SETTINGS_ROUTES.preferences,
      icon: SlidersHorizontal,
      label: t('settings.sections.preferences'),
      hint: t('settings.sections.preferencesHint'),
    },
    {
      key: 'commitments',
      to: LINKED_ROUTES.commitments,
      icon: Repeat,
      label: t('commitments.title'),
      hint: t('commitments.open'),
    },
    {
      key: 'categories',
      to: LINKED_ROUTES.categories,
      icon: Tags,
      label: t('categories:manage.title'),
      hint: t('categories:manage.open'),
    },
    {
      key: 'paymentMethods',
      to: LINKED_ROUTES.paymentMethods,
      icon: CreditCard,
      label: t('categories:manage.methodsTitle'),
      hint: t('categories:manage.methodsOpen'),
    },
    {
      key: 'data',
      to: SETTINGS_ROUTES.data,
      icon: DatabaseBackup,
      label: t('settings.sections.data'),
      hint: t('settings.sections.dataHint'),
    },
  ];

  return { account, app };
}
