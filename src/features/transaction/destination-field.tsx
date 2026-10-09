import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { destinationsFor } from '@/domain/income-destination';
import { methodDisplayName } from '@/i18n/method-name';
import { CASH_METHOD_ID, type PaymentMethod } from '@/types/domain';

import { PickerField } from './picker-field';

/**
 * "Goes to": where income lands - the person's bank accounts and the joint
 * ones they hold, then cash, then "Not assigned". Never a card. Optional, and
 * listed rather than implied by an empty field, as "Not specified" is for a
 * payment method.
 *
 * A destination that names nothing any more (a deleted account) matches no
 * option, so the field reads "Not assigned" - never an error.
 */
export function DestinationField({
  value,
  onChange,
  profileId,
  methods,
  labelledBy,
}: {
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly profileId: string;
  readonly methods: readonly PaymentMethod[];
  readonly labelledBy: string;
}) {
  const { t } = useTranslation(['common', 'profiles']);

  const options = useMemo(
    () => [
      ...destinationsFor(methods, profileId, value).map((method) => ({
        id: method.id,
        label: methodDisplayName(method, t),
        ...(method.id === CASH_METHOD_ID ? {} : { hint: t('profiles:method.bank_account') }),
      })),
      { id: '', label: t('tx.destinationNone') },
    ],
    [methods, profileId, value, t],
  );

  return (
    <PickerField
      value={value}
      onChange={onChange}
      options={options}
      labelledBy={labelledBy}
      placeholder={t('tx.destinationNone')}
      searchPlaceholder={t('tx.destination')}
      emptyText={t('tx.destinationEmpty')}
    />
  );
}
