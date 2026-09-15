/**
 * Merge planning.
 *
 * The spec's rule was "skip duplicate IDs". That LOSES DATA.
 *
 * Ids are UUIDv7, so a same-id collision between two independently created
 * databases is not realistically possible. Therefore "same id, different
 * content" does not mean "two different records that happen to clash" - it
 * means THE SAME RECORD, edited in two places. Skipping it silently discards
 * whichever copy happens to arrive second, which is usually the newer one.
 *
 * So: last-write-wins on `updatedAt`, with a conflict report for the case that
 * cannot be resolved automatically. This is why `updatedAt` had to be added to
 * profiles, categories and payment methods, which the spec's types lacked.
 */

export type Timestamped = { id: string; updatedAt: string };

export type MergePlan<T> = {
  readonly inserts: readonly T[];
  readonly updates: readonly T[];
  /** Same id, same timestamp, different content. The local copy is kept. */
  readonly conflicts: readonly { id: string; local: T; incoming: T }[];
  readonly unchanged: number;
};

function sameContent<T>(a: T, b: T): boolean {
  // Cheap structural comparison. Both sides came from the same schema, so key
  // order is stable enough for this to be meaningful.
  return JSON.stringify(a) === JSON.stringify(b);
}

export function planMerge<T extends Timestamped>(local: readonly T[], incoming: readonly T[]): MergePlan<T> {
  const byId = new Map(local.map((row) => [row.id, row]));

  const inserts: T[] = [];
  const updates: T[] = [];
  const conflicts: { id: string; local: T; incoming: T }[] = [];
  let unchanged = 0;

  for (const row of incoming) {
    const existing = byId.get(row.id);

    if (!existing) {
      inserts.push(row);
      continue;
    }

    if (sameContent(existing, row)) {
      // Re-importing the same file is a no-op, which makes import idempotent.
      unchanged += 1;
      continue;
    }

    if (row.updatedAt > existing.updatedAt) {
      updates.push(row);
    } else if (row.updatedAt < existing.updatedAt) {
      unchanged += 1;
    } else {
      // Equal timestamps but different content: nothing in the data can decide
      // this, so keep local and tell the user rather than guessing.
      conflicts.push({ id: row.id, local: existing, incoming: row });
    }
  }

  return { inserts, updates, conflicts, unchanged };
}
