import type { BookandryDB } from '@/db/db';
import { FALLBACK_CATEGORY } from '@/db/seed';
import { normalizeName } from '@/domain/validation';
import type { Category } from '@/types/domain';
import type { IsoInstant, Kind } from '@/types/money';

/**
 * Built-ins carry an i18n KEY, not a name, so they follow the UI language.
 * Renaming or deleting one would strand that key; archiving hides it instead.
 */
export class BuiltinCategoryError extends Error {
  constructor(
    readonly id: string,
    readonly operation: 'rename' | 'delete',
  ) {
    super(`Built-in category ${id} cannot be ${operation === 'rename' ? 'renamed' : 'deleted'}`);
    this.name = 'BuiltinCategoryError';
  }
}

export type CategoryQuery = { readonly kind?: Kind; readonly includeArchived?: boolean };

export async function listCategories(db: BookandryDB, query: CategoryQuery = {}): Promise<Category[]> {
  const rows = await db.categories.toArray();
  return rows
    .filter(
      (c) =>
        (query.kind === undefined || c.kind === query.kind) &&
        (query.includeArchived === true || c.isArchived === 0),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export async function createCategory(
  db: BookandryDB,
  id: string,
  draft: { name: string; kind: Kind; icon: string },
  now: IsoInstant,
): Promise<Category> {
  const name = normalizeName(draft.name);

  return db.transaction('rw', db.categories, async () => {
    const siblings = await db.categories.filter((c) => c.kind === draft.kind).toArray();
    const sortOrder = siblings.reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1;

    const row: Category = {
      id,
      kind: draft.kind,
      icon: draft.icon,
      sortOrder,
      isArchived: 0,
      source: 'custom',
      name,
      createdAt: now,
      updatedAt: now,
    };
    await db.categories.add(row);
    return row;
  });
}

export async function renameCategory(
  db: BookandryDB,
  id: string,
  rawName: string,
  now: IsoInstant,
): Promise<Category> {
  const name = normalizeName(rawName);

  return db.transaction('rw', db.categories, async () => {
    const current = await db.categories.get(id);
    if (!current) throw new Error(`No such category: ${id}`);
    if (current.source === 'builtin') throw new BuiltinCategoryError(id, 'rename');

    const next: Category = { ...current, name, updatedAt: now };
    await db.categories.put(next);
    return next;
  });
}

export async function setCategoryArchived(
  db: BookandryDB,
  id: string,
  archived: boolean,
  now: IsoInstant,
): Promise<void> {
  await db.categories.update(id, {
    isArchived: archived ? 1 : 0,
    archivedAt: archived ? now : undefined,
    updatedAt: now,
  });
}

/**
 * Delete a custom category, moving everything that referenced it.
 *
 * `Override.patch.categoryId` is reassigned too. Missing it leaves a
 * per-occurrence edit pointing at a category that no longer exists, so one row
 * in the feed renders with no icon and no name and nothing explains why.
 */
export async function deleteCategory(
  db: BookandryDB,
  id: string,
  options: { reassignTo?: string },
  now: IsoInstant,
): Promise<{ transactionsMoved: number; overridesMoved: number }> {
  return db.transaction('rw', [db.categories, db.transactions, db.overrides], async () => {
    const current = await db.categories.get(id);
    if (!current) throw new Error(`No such category: ${id}`);
    if (current.source === 'builtin') throw new BuiltinCategoryError(id, 'delete');

    const target = options.reassignTo ?? FALLBACK_CATEGORY[current.kind];
    const fallback = await db.categories.get(target);
    if (!fallback) throw new Error(`No such category: ${target}`);
    if (fallback.kind !== current.kind) {
      throw new Error(`Cannot move ${current.kind} transactions into a ${fallback.kind} category`);
    }

    const affected = await db.transactions.where('categoryId').equals(id).toArray();
    if (affected.length > 0) {
      await db.transactions.bulkPut(affected.map((t) => ({ ...t, categoryId: target, updatedAt: now })));
    }

    const overrides = (await db.overrides.toArray()).filter(
      (o) => o.action === 'modify' && o.patch.categoryId === id,
    );
    if (overrides.length > 0) {
      await db.overrides.bulkPut(
        overrides.map((o) =>
          o.action === 'modify' ? { ...o, patch: { ...o.patch, categoryId: target }, updatedAt: now } : o,
        ),
      );
    }

    await db.categories.delete(id);
    return { transactionsMoved: affected.length, overridesMoved: overrides.length };
  });
}
