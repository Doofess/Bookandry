import { SHARED_OWNER, type Category, type PaymentMethod } from '@/types/domain';
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
  if (mode === 'credit') return method.type === 'credit_card';
  if (method.type === 'cheque') return mode === 'one_time' || mode === 'installments' || mode === 'loan';
  // A bank account pays at once, by order or by debit - not in a card's תשלומים.
  if (method.type === 'bank_account') return mode !== 'installments';
  return true;
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
): readonly PaymentMethod[] {
  return methods
    .filter(
      (method) =>
        methodOwnedBy(method, profileId) &&
        (method.id === keepId ||
          (method.isArchived === 0 && (mode === undefined || methodFits(method, mode)))),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}
