import { Navigate, type RouteObject } from 'react-router-dom';

import { AccountScreen } from '@/features/account/account-screen';
import { SecurityScreen } from '@/features/account/security-screen';
import { BankAccountsScreen } from '@/features/bank-accounts/bank-accounts-screen';
import { CardsScreen } from '@/features/cards/cards-screen';
import { CashScreen } from '@/features/cash/cash-screen';
import { ChartScreen } from '@/features/chart/chart-screen';
import { CommitmentsScreen } from '@/features/commitments/commitments-screen';
import { FeedScreen } from '@/features/feed/feed-screen';
import { HouseholdScreen } from '@/features/household/household-screen';
import { LinkScreen } from '@/features/household/link-screen';
import { WipeScreen } from '@/features/household/wipe-screen';
import { CategoriesScreen } from '@/features/settings/categories-screen';
import { DataScreen } from '@/features/settings/data-screen';
import { PreferencesScreen } from '@/features/settings/preferences-screen';
import { SettingsScreen } from '@/features/settings/settings-screen';

import { LINKED_ROUTES, ROUTES, SETTINGS_ROUTES } from './routes';

/**
 * Every screen, inside the app shell. Apart from main.tsx so a test can mount
 * the very routes the app does - the old addresses' redirects above all.
 */
export const appRoutes: RouteObject[] = [
  { index: true, element: <FeedScreen /> },
  { path: ROUTES.chart, element: <ChartScreen /> },
  { path: ROUTES.cards, element: <CardsScreen /> },
  { path: ROUTES.cash, element: <CashScreen /> },
  // The Household tab became Settings > Account linking; its addresses still land there.
  { path: ROUTES.household, element: <Navigate to={SETTINGS_ROUTES.linking} replace /> },
  { path: LINKED_ROUTES.profiles, element: <Navigate to={SETTINGS_ROUTES.linking} replace /> },
  { path: LINKED_ROUTES.link, element: <LinkScreen /> },
  { path: LINKED_ROUTES.wipe, element: <WipeScreen /> },
  { path: ROUTES.settings, element: <SettingsScreen /> },
  { path: SETTINGS_ROUTES.account, element: <AccountScreen /> },
  { path: SETTINGS_ROUTES.linking, element: <HouseholdScreen /> },
  { path: SETTINGS_ROUTES.security, element: <SecurityScreen /> },
  { path: SETTINGS_ROUTES.preferences, element: <PreferencesScreen /> },
  { path: SETTINGS_ROUTES.data, element: <DataScreen /> },
  { path: LINKED_ROUTES.commitments, element: <CommitmentsScreen /> },
  { path: LINKED_ROUTES.categories, element: <CategoriesScreen /> },
  { path: LINKED_ROUTES.paymentMethods, element: <Navigate to={ROUTES.cards} replace /> },
  { path: LINKED_ROUTES.bankAccounts, element: <BankAccountsScreen /> },
];
