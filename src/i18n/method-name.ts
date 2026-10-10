import {
  CASH_METHOD_ID,
  CHEQUE_METHOD_ID,
  OTHER_METHOD_ID,
  STANDING_ORDER_METHOD_ID,
  TRANSFER_METHOD_ID,
  WALLET_METHOD_ID,
  type PaymentMethod,
} from '@/types/domain';

/**
 * A payment method's display name, resolved in ONE place.
 *
 * Every method a person made carries a label they typed, which must never be
 * translated - "Isracard" is not a word to look up. The six built-ins are the
 * exception: they are seeded rather than created, so a stored label is
 * whatever language the install was seeded in, and a Hebrew user was reading
 * "Cash" in an otherwise Hebrew list. Resolving them here by id means the
 * built-ins follow the UI language while every real card, and a person's own
 * "Bit" row, keeps the name on it.
 *
 * The same shape as `categoryDisplayName`, deliberately: one helper per entity
 * that has both built-in and user-owned members, and no component deciding for
 * itself which it is looking at.
 */
type MethodKey =
  | 'profiles:method.cash'
  | 'profiles:method.cheque'
  | 'profiles:method.bank_transfer'
  | 'profiles:method.standing_order'
  | 'profiles:builtin.wallet'
  | 'profiles:method.other';
export type Translate = (key: MethodKey) => string;

const BUILTIN_NAME: Readonly<Record<string, MethodKey>> = {
  [CASH_METHOD_ID]: 'profiles:method.cash',
  [CHEQUE_METHOD_ID]: 'profiles:method.cheque',
  [TRANSFER_METHOD_ID]: 'profiles:method.bank_transfer',
  [STANDING_ORDER_METHOD_ID]: 'profiles:method.standing_order',
  [WALLET_METHOD_ID]: 'profiles:builtin.wallet',
  [OTHER_METHOD_ID]: 'profiles:method.other',
};

export function methodDisplayName(method: PaymentMethod, t: Translate): string {
  const key = BUILTIN_NAME[method.id];
  return key === undefined ? method.label : t(key);
}
