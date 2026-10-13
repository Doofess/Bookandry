import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { RecurrenceMode } from '@/domain/tx-form';
import { methodsFor, methodTypeOf, type StandingVia } from '@/domain/tx-options';
import { methodDisplayName } from '@/i18n/method-name';
import type { PaymentMethod } from '@/types/domain';

import { PickerField } from './picker-field';

/**
 * The payment-method picker.
 *
 * Expenses only - income has no "paid with" - and what it stores is a LABEL the
 * user chose and nothing else. No part of a payment instrument is ever
 * requested or kept. That is not a convention anyone has to remember:
 * `gate:pci` fails the build on the field names themselves, anywhere in src or
 * e2e, with no escape hatch - so the data model cannot acquire one by accident,
 * and this comment cannot name them either.
 *
 * Shared household methods carry the `SHARED_OWNER` sentinel rather than a null
 * profileId, because IndexedDB cannot index null and a null would make every
 * shared method invisible to its own index.
 */
export function PaymentMethodField({
  value,
  onChange,
  profileId,
  mode,
  methods,
  via,
  labelledBy,
  describedBy,
}: {
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly profileId: string;
  /** The kind of transaction: credit takes only cards, a cheque no standing order. */
  readonly mode: RecurrenceMode;
  readonly methods: readonly PaymentMethod[];
  /** A standing order's card or bank account: only those are offered. */
  readonly via?: StandingVia;
  readonly labelledBy: string;
  readonly describedBy?: string;
}) {
  const { t } = useTranslation(['common', 'profiles']);

  const options = useMemo(
    () => [
      // "Not specified" is a real choice, listed rather than implied by an
      // empty field: a payment method is optional and the UI has to say so.
      { id: '', label: t('tx.paymentMethodNone') },
      ...methodsFor(methods, profileId, value, mode, via).map((method) => ({
        id: method.id,
        label: methodDisplayName(method, t),
        hint: [
          t(PAYMENT_TYPE_KEY[methodTypeOf(method)] as MethodTypeKey),
          method.card?.lastDigits === undefined ? undefined : `\u2066··${method.card.lastDigits}\u2069`,
        ]
          .filter(Boolean)
          .join(' '),
      })),
    ],
    [methods, profileId, value, mode, via, t],
  );

  return (
    <PickerField
      value={value}
      onChange={onChange}
      options={options}
      labelledBy={labelledBy}
      placeholder={t('tx.paymentMethodNone')}
      searchPlaceholder={t('tx.paymentMethod')}
      emptyText={t('tx.paymentMethodEmpty')}
      describedBy={describedBy}
    />
  );
}

/**
 * One arbitrary member of the profiles key union.
 *
 * Every key in the namespace shares the same call signature, so naming one is
 * enough for i18next's typed `t` - the same trick `categoryDisplayName` uses,
 * and for the same reason: the cast belongs in one place next to its
 * explanation rather than at each call site.
 */
type MethodTypeKey = 'profiles:method.cash';

/** Type labels live in the `profiles` namespace beside the settings screens. */
const PAYMENT_TYPE_KEY = {
  cash: 'profiles:method.cash',
  cheque: 'profiles:method.cheque',
  credit_card: 'profiles:method.credit_card',
  debit_card: 'profiles:method.debit_card',
  bank_transfer: 'profiles:method.bank_transfer',
  standing_order: 'profiles:method.standing_order',
  digital_wallet: 'profiles:method.digital_wallet',
  bank_account: 'profiles:method.bank_account',
  other: 'profiles:method.other',
} as const;
