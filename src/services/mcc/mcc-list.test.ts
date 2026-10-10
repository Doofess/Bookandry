import { describe, expect, it } from 'vitest';

import { loadMccList } from './mcc-list';

describe('loadMccList', () => {
  it('loads every business type once, and hands the same list to everyone after', async () => {
    const first = loadMccList();
    expect(loadMccList()).toBe(first);
    const list = await first;
    expect(list).toHaveLength(981);
    expect(list.find((entry) => entry.code === '5812')).toEqual({
      code: '5812',
      en: 'Restaurant',
      he: 'מסעדות',
    });
  });
});
