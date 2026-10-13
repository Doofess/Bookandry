import {
  isActiveMethod,
  SHARED_OWNER,
  type Category,
  type PaymentMethod,
  type PaymentMethodType,
} from '@/types/domain';
import type { Kind } from '@/types/money';

import type { RecurrenceMode } from './tx-form';

/**
 * What the transaction form is allowed to offer.
 *
 * Pure, and in `domain/` rather than beside the pickers, for two reasons: the
 * component files then export nothing but components (which is what lets Vite
 * hot-swap them instead of reloading the page and losing a half-filled form),
 * and the "keep what is already selected" rule below is a data rule that
 * deserves a test rather than a render.
 */

/**
 * Usable categories for a kind, in the order the pickers show them.
 *
 * An archived category that is ALREADY on the row being edited is kept.
 * Dropping it would blank the field the moment the sheet opens, and saving
 * would then move an old transaction into a category the user never chose -
 * silently, by doing nothing at all.
 */
export function categoriesFor(categories: readonly Category[], kind: Kind, keepId = ''): readonly Category[] {
  return categories
    .filter((category) => category.kind === kind && (category.isArchived === 0 || category.id === keepId))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Every way to pay this build knows, in the order the type pickers list them. */
export const PAYMENT_METHOD_TYPES: readonly PaymentMethodType[] = [
  'cash',
  'cheque',
  'credit_card',
  'debit_card',
  'bank_transfer',
  'standing_order',
  'digital_wallet',
  'bank_account',
  'other',
];
const KNOWN_TYPES: ReadonlySet<string> = new Set(PAYMENT_METHOD_TYPES);

/** The type every reader uses: one a later build added reads as "other". */
export function methodTypeOf(method: Pick<PaymentMethod, 'type'>): PaymentMethodType {
  return KNOWN_TYPES.has(method.type) ? method.type : 'other';
}

/**
 * Whether a kind of transaction can be paid this way.
 *
 * עסקת קרדיט is a credit card's own arrangement - the interest is the card's -
 * so it takes nothing else. A cheque is written once, or as a set of
 * post-dated cheques for a plan in תשלומים or a loan from family; a standing
 * order is the bank paying by itself, which is precisely what a cheque is not.
 * A loan takes anything: the bank's own debit, cheques, cash, a card's loan.
 * A bank account takes everything but תשלומים, which is a card's.
 */
export function methodFits(method: Pick<PaymentMethod, 'type'>, mode: RecurrenceMode): boolean {
  // A card's own credit deals: קרדיט, קרדיט פלוס and 30+.
  const type = methodTypeOf(method);
  if (mode === 'credit' || mode === 'long_credit' || mode === 'deferred') return type === 'credit_card';
  // A standing order is charged to a card or taken from an account - never cash.
  if (mode === 'standing_order') return standingViaOf(method) !== undefined;
  if (type === 'cheque') return mode === 'one_time' || mode === 'installments' || mode === 'loan';
  // A bank account pays at once, by order or by debit - not in a card's תשלומים.
  if (type === 'bank_account') return mode !== 'installments';
  return true;
}

/**
 * Where a standing order is charged.
 *
 * הוראת קבע בכרטיס: on a card, collected with the card's monthly bill like
 * any purchase on it. הוראת קבע בבנק: taken from the bank account itself, on
 * its own date.
 */
export type StandingVia = 'card' | 'bank';

/** Which kind of standing order a method makes; undefined for one that cannot carry one. */
export function standingViaOf(method: Pick<PaymentMethod, 'type'>): StandingVia | undefined {
  switch (methodTypeOf(method)) {
    case 'credit_card':
    case 'debit_card':
    case 'digital_wallet':
      return 'card';
    case 'bank_account':
    case 'bank_transfer':
    case 'standing_order':
      return 'bank';
    case 'cash':
    case 'cheque':
    case 'other':
      return undefined;
  }
}

/**
 * Whether `profileId` can pay with a method: it is theirs, or the
 * household's - and a joint account the household shares is its holders'.
 */
export function methodOwnedBy(
  method: Pick<PaymentMethod, 'profileId' | 'account'>,
  profileId: string,
): boolean {
  if (method.profileId === profileId) return true;
  if (method.profileId !== SHARED_OWNER) return false;
  const holders = method.account?.holders;
  return holders === undefined || holders.includes(profileId);
}

/**
 * The methods a profile can pay with: its own, plus the household's, and of
 * those the ones this kind of transaction takes (`methodFits`).
 *
 * Shared methods carry the `SHARED_OWNER` sentinel rather than a null
 * `profileId`, because IndexedDB cannot index null - a null would make every
 * shared method invisible to the very index that exists to find it.
 *
 * The method already on the row is kept even when it no longer fits, for the
 * same reason an archived one is: an old row opened for editing must not
 * lose a choice nobody changed.
 */
export function methodsFor(
  methods: readonly PaymentMethod[],
  profileId: string,
  keepId = '',
  mode?: RecurrenceMode,
  /** A standing order's card or bank: only methods of that kind. */
  via?: StandingVia,
): readonly PaymentMethod[] {
  return methods
    .filter(
      (method) =>
        methodOwnedBy(method, profileId) &&
        (method.id === keepId ||
          (isActiveMethod(method) &&
            (mode === undefined || methodFits(method, mode)) &&
            (via === undefined || standingViaOf(method) === via))),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}
