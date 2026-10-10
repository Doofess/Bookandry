import { CASH_FOUND_CATEGORY_ID, CASH_MISSING_CATEGORY_ID } from '@/domain/cash';
import {
  BUILTIN_METHODS_SINCE,
  CASH_METHOD_ID,
  CHEQUE_METHOD_ID,
  OTHER_METHOD_ID,
  SHARED_OWNER,
  STANDING_ORDER_METHOD_ID,
  TRANSFER_METHOD_ID,
  WALLET_METHOD_ID,
  type Category,
  type PaymentMethod,
} from '@/types/domain';
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
  // Cash a recount found (the cash tab): an income, so the balance rises with the cash.
  { id: CASH_FOUND_CATEGORY_ID, nameKey: 'categories:builtin.cashFound', icon: 'Banknote' },
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
  // Added later (installs from before get them on boot: ensureBuiltinCategories),
  // so the automatic category has somewhere specific to put "Claude Max Plan",
  // a phone bill, a flight, nappies or dog food.
  { id: 'cat.aiSoftware', nameKey: 'categories:builtin.aiSoftware', icon: 'Bot' },
  { id: 'cat.phoneInternet', nameKey: 'categories:builtin.phoneInternet', icon: 'Smartphone' },
  { id: 'cat.travel', nameKey: 'categories:builtin.travel', icon: 'Plane' },
  { id: 'cat.kids', nameKey: 'categories:builtin.kids', icon: 'Baby' },
  { id: 'cat.pets', nameKey: 'categories:builtin.pets', icon: 'PawPrint' },
  // A gym or a sports club, and buying foreign currency (רכישת מט"ח) - neither
  // of which is shopping, and an import has to put them somewhere.
  { id: 'cat.fitness', nameKey: 'categories:builtin.fitness', icon: 'Dumbbell' },
  { id: 'cat.currencyExchange', nameKey: 'categories:builtin.currencyExchange', icon: 'ArrowLeftRight' },
  // Where a loan's repayments go by default (the form's Loan type picks it).
  { id: 'cat.loans', nameKey: 'categories:builtin.loans', icon: 'HandCoins' },
  // Where a credit card's monthly fee lands (worked out from the card, not typed).
  { id: 'cat.cardFees', nameKey: 'categories:builtin.cardFees', icon: 'CreditCard' },
  // Cash a recount found missing: an expense, so the balance falls with the cash.
  { id: CASH_MISSING_CATEGORY_ID, nameKey: 'categories:builtin.cashMissing', icon: 'BanknoteX' },
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

/**
 * The six built-in ways to pay, in "Paid with" order: methods every profile
 * can use from the first transaction. Cash and cheques are dated `now`, as
 * they always were; the four newer ones the one fixed instant every device
 * shares, so identical rows from two devices race harmlessly.
 */
export function buildSeedPaymentMethods(now: IsoInstant): PaymentMethod[] {
  return [
    {
      id: CASH_METHOD_ID,
      profileId: SHARED_OWNER,
      type: 'cash',
      label: 'Cash',
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: CHEQUE_METHOD_ID,
      profileId: SHARED_OWNER,
      type: 'cheque',
      label: 'Cheque',
      isArchived: 0,
      createdAt: now,
      updatedAt: now,
    },
    ...(
      [
        [TRANSFER_METHOD_ID, 'bank_transfer', 'Bank transfer'],
        [STANDING_ORDER_METHOD_ID, 'standing_order', 'Standing order'],
        [WALLET_METHOD_ID, 'digital_wallet', 'Bit / PayBox'],
        [OTHER_METHOD_ID, 'other', 'Other'],
      ] as const
    ).map(([id, type, label]): PaymentMethod => ({
      id,
      profileId: SHARED_OWNER,
      type,
      label,
      isArchived: 0,
      createdAt: BUILTIN_METHODS_SINCE,
      updatedAt: BUILTIN_METHODS_SINCE,
    })),
  ];
}
