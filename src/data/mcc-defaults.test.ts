import { describe, expect, it } from 'vitest';

import list from '@/data/mcc.json';
import { BUILTIN_EXPENSE } from '@/db/seed';
import { DEFAULT_MCC_CATEGORY, DEFAULT_OTHER, defaultCategoryForMcc } from '@/domain/mcc-categories';

const BUILTINS: ReadonlySet<string> = new Set(BUILTIN_EXPENSE.map((seed) => seed.id));

describe('the default table', () => {
  it('runs in code order, each range inside itself and none overlapping the next', () => {
    DEFAULT_MCC_CATEGORY.forEach(([from, to], i) => {
      expect(from <= to, `${from}-${to}`).toBe(true);
      const next = DEFAULT_MCC_CATEGORY[i + 1];
      if (next !== undefined) expect(to < next[0], `${to} / ${next[0]}`).toBe(true);
    });
  });

  it('files every shipped code under exactly one built-in expense category', () => {
    expect(BUILTINS.has(DEFAULT_OTHER)).toBe(true);
    for (const [from, to, id] of DEFAULT_MCC_CATEGORY)
      expect(BUILTINS.has(id), `${from}-${to} ${id}`).toBe(true);
    for (const { code } of list) {
      const ranges = DEFAULT_MCC_CATEGORY.filter(([from, to]) => from <= code && code <= to);
      expect(ranges.length, code).toBeLessThanOrEqual(1);
      expect(BUILTINS.has(defaultCategoryForMcc(code)), code).toBe(true);
    }
  });

  it('has no range that holds no shipped code', () => {
    for (const [from, to] of DEFAULT_MCC_CATEGORY) {
      expect(
        list.some(({ code }) => from <= code && code <= to),
        `${from}-${to}`,
      ).toBe(true);
    }
  });
});
