import { isBuiltinPaymentMethod, type PaymentMethod } from '@/types/domain';

/**
 * A payment method's display name, resolved in ONE place.
 *
 * Every method but one carries a label the user typed, which must never be
 * translated - "Isracard" is not a word to look up. Cash is the exception: it
 * is seeded rather than created, so its stored label is whatever language the
 * install was seeded in, and a Hebrew user was reading "Cash" in an otherwise
 * Hebrew list. Resolving it here means the one built-in follows the UI language
 * while every real card keeps the name on it.
 *
 * The same shape as `categoryDisplayName`, deliberately: one helper per entity
 * that has both built-in and user-owned members, and no component deciding for
 * itself which it is looking at.
 */
type MethodKey = 'profiles:method.cash';
export type Translate = (key: MethodKey) => string;

export function methodDisplayName(method: PaymentMethod, t: Translate): string {
  return isBuiltinPaymentMethod(method.id) ? t('profiles:method.cash') : method.label;
}
