import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { methodsFor } from '@/domain/tx-options';
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
  methods,
  labelledBy,
  describedBy,
}: {
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly profileId: string;
  readonly methods: readonly PaymentMethod[];
  readonly labelledBy: string;
  readonly describedBy?: string;
}) {
  const { t } = useTranslation(['common', 'profiles']);

  const options = useMemo(
    () => [
      // "Not specified" is a real choice, listed rather than implied by an
      // empty field: a payment method is optional and the UI has to say so.
      { id: '', label: t('tx.paymentMethodNone') },
      ...methodsFor(methods, profileId, value).map((method) => ({
        id: method.id,
        label: method.label,
        hint: t(PAYMENT_TYPE_KEY[method.type] as MethodTypeKey),
      })),
    ],
    [methods, profileId, value, t],
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
  credit_card: 'profiles:method.credit_card',
  debit_card: 'profiles:method.debit_card',
  bank_transfer: 'profiles:method.bank_transfer',
  standing_order: 'profiles:method.standing_order',
  digital_wallet: 'profiles:method.digital_wallet',
  other: 'profiles:method.other',
} as const;
