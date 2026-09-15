import type { Category } from '@/types/domain';

/**
 * A category's display name, resolved in ONE place.
 *
 * Built-ins store an i18n KEY (`categories:builtin.groceries`) rather than a
 * name, so their label follows the UI language. Custom categories store a name
 * the user typed, which must not be translated.
 *
 * `nameKey` is typed as `string` because a Category can arrive from an imported
 * file, so a cast to the typed key union is unavoidable somewhere. It happens
 * here, once, guarded by a fallback - a key that no longer exists returns the
 * key itself rather than throwing inside the render of a feed row.
 */
/**
 * One arbitrary member of the categories key union.
 *
 * Every key in the namespace shares the same call signature, so naming one is
 * enough to accept i18next's typed `t` without a cast AT THE CALL SITE - which
 * is the point: the cast belongs here, next to the explanation, not sprinkled
 * through every component that renders a category.
 */
type CategoryKey = 'categories:builtin.groceries';
export type Translate = (key: CategoryKey) => string;

export function categoryDisplayName(category: Category, t: Translate): string {
  if (category.source === 'custom') return category.name;
  const translated = t(category.nameKey as CategoryKey);
  return translated === category.nameKey ? fallbackFromKey(category.nameKey) : translated;
}

/** `categories:builtin.buildingFee` -> `buildingFee`, so a stale key still reads. */
function fallbackFromKey(key: string): string {
  return key.split('.').at(-1) ?? key;
}
