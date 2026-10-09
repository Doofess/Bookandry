import type { MccList } from '@/domain/mcc';

/**
 * The business types' names: their own chunk (about 96 KB), loaded the first
 * time one is shown, as the bank branches are (services/banks/branches.ts).
 * Nobody needs them to open the feed. A failed load is not remembered, so
 * the next caller tries again.
 */
let list: Promise<MccList> | undefined;

export function loadMccList(): Promise<MccList> {
  list ??= import('@/data/mcc.json').then(
    (module) => module.default,
    (error: unknown) => {
      list = undefined;
      throw error;
    },
  );
  return list;
}
