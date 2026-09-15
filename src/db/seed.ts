import type { Category, PaymentMethod } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

/**
 * Built-in categories.
 *
 * Ids are DETERMINISTIC ("cat.groceries"), never generated. With random ids,
 * every merge-import between two installs produces a duplicate set of built-in
 * categories with identical names and no way to tell them apart.
 *
 * Names are i18n KEYS, resolved at render, so they follow the UI language.
 */
type BuiltinSeed = { id: string; nameKey: string; icon: string };

export const BUILTIN_INCOME: readonly BuiltinSeed[] = [
  { id: 'cat.salary', nameKey: 'categories:builtin.salary', icon: 'Wallet' },
  { id: 'cat.freelance', nameKey: 'categories:builtin.freelance', icon: 'Laptop' },
  { id: 'cat.gift', nameKey: 'categories:builtin.gift', icon: 'Gift' },
  { id: 'cat.investment', nameKey: 'categories:builtin.investment', icon: 'TrendingUp' },
  { id: 'cat.refund', nameKey: 'categories:builtin.refund', icon: 'Undo2' },
  { id: 'cat.otherIncome', nameKey: 'categories:builtin.otherIncome', icon: 'CirclePlus' },
];

export const BUILTIN_EXPENSE: readonly BuiltinSeed[] = [
  { id: 'cat.rent', nameKey: 'categories:builtin.rent', icon: 'House' },
  { id: 'cat.groceries', nameKey: 'categories:builtin.groceries', icon: 'ShoppingBasket' },
  { id: 'cat.utilities', nameKey: 'categories:builtin.utilities', icon: 'Zap' },
  // Israeli municipal property tax. Large, bi-monthly, and nobody files it
  // under "Utilities".
  { id: 'cat.arnona', nameKey: 'categories:builtin.arnona', icon: 'Landmark' },
  // Building committee / va'ad bayit. Monthly and near-universal in apartments.
  { id: 'cat.buildingFee', nameKey: 'categories:builtin.buildingFee', icon: 'Building2' },
  { id: 'cat.transport', nameKey: 'categories:builtin.transport', icon: 'Bus' },
  { id: 'cat.dining', nameKey: 'categories:builtin.dining', icon: 'UtensilsCrossed' },
  { id: 'cat.health', nameKey: 'categories:builtin.health', icon: 'HeartPulse' },
  { id: 'cat.insurance', nameKey: 'categories:builtin.insurance', icon: 'ShieldCheck' },
  { id: 'cat.subscriptions', nameKey: 'categories:builtin.subscriptions', icon: 'Repeat' },
  { id: 'cat.shopping', nameKey: 'categories:builtin.shopping', icon: 'ShoppingBag' },
  { id: 'cat.entertainment', nameKey: 'categories:builtin.entertainment', icon: 'Clapperboard' },
  { id: 'cat.education', nameKey: 'categories:builtin.education', icon: 'GraduationCap' },
  { id: 'cat.otherExpense', nameKey: 'categories:builtin.otherExpense', icon: 'CircleMinus' },
];

/** Fallback categories used by the integrity repair pass. */
export const FALLBACK_CATEGORY = { income: 'cat.otherIncome', expense: 'cat.otherExpense' } as const;

export function buildSeedCategories(now: IsoInstant): Category[] {
  const make = (s: BuiltinSeed, kind: 'income' | 'expense', sortOrder: number): Category => ({
    id: s.id,
    kind,
    icon: s.icon,
    sortOrder,
    isArchived: 0,
    source: 'builtin',
    nameKey: s.nameKey,
    createdAt: now,
    updatedAt: now,
  });

  return [
    ...BUILTIN_INCOME.map((s, i) => make(s, 'income', i)),
    ...BUILTIN_EXPENSE.map((s, i) => make(s, 'expense', i)),
  ];
}

/** A cash method every profile can use from the first transaction. */
export function buildSeedPaymentMethods(now: IsoInstant): PaymentMethod[] {
  return [
    {
      id: 'pm.cash',
      profileId: '*',
      type: 'cash',
      label: 'Cash',
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
