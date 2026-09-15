import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CategoryIcon } from '@/components/category-icon';
import { categoriesFor } from '@/domain/tx-options';
import type { Category } from '@/types/domain';
import type { Kind } from '@/types/money';

import { PickerField } from './picker-field';

/**
 * The category picker.
 *
 * Archived categories are absent - but one that is ALREADY on the transaction
 * being edited stays visible. Dropping it would blank the field on open, and
 * saving would then move an old row into a category the user never chose,
 * silently, by doing nothing at all.
 */
export function CategoryField({
  value,
  onChange,
  kind,
  categories,
  labelledBy,
  invalid,
  describedBy,
  translate,
}: {
  readonly value: string;
  readonly onChange: (categoryId: string) => void;
  readonly kind: Kind;
  readonly categories: readonly Category[];
  readonly labelledBy: string;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  readonly translate: (category: Category) => string;
}) {
  const { t } = useTranslation();

  const options = useMemo(
    () =>
      categoriesFor(categories, kind, value).map((category) => ({
        id: category.id,
        label: translate(category),
        icon: <CategoryIcon name={category.icon} className="size-4 shrink-0" />,
      })),
    [categories, kind, value, translate],
  );

  return (
    <PickerField
      value={value}
      onChange={onChange}
      options={options}
      labelledBy={labelledBy}
      placeholder={t('tx.categoryChoose')}
      searchPlaceholder={t('tx.categorySearch')}
      emptyText={t('tx.categoryEmpty')}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
