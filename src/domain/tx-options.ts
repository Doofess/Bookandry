import { SHARED_OWNER, type Category, type PaymentMethod } from '@/types/domain';
import type { Kind } from '@/types/money';

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
 * The methods a profile can pay with: its own, plus the household's.
 *
 * Shared methods carry the `SHARED_OWNER` sentinel rather than a null
 * `profileId`, because IndexedDB cannot index null - a null would make every
 * shared method invisible to the very index that exists to find it.
 */
export function methodsFor(
  methods: readonly PaymentMethod[],
  profileId: string,
  keepId = '',
): readonly PaymentMethod[] {
  return methods
    .filter(
      (method) =>
        (method.profileId === profileId || method.profileId === SHARED_OWNER) &&
        (method.isArchived === 0 || method.id === keepId),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}
