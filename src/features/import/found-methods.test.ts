import { describe, expect, it } from 'vitest';

import type { UnfinishedMethod } from '@/db/import-drafts';
import { readCard } from '@/domain/import-cards';
import type { PaymentMethod } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { foundMethodOf, nextUnfinished, unfinishedItem } from './found-methods';

const NOW = '2026-10-06T00:00:00.000Z' as IsoInstant;
const entry: UnfinishedMethod = {
  key: 'card:5555',
  at: 0,
  owner: 'p1',
  kind: 'card',
  found: readCard(
    { s: 0, n: 'max executive', l4: '5555', nw: 'Mastercard', is: 'MAX', cr: '', lim: '', bd: '' },
    'k0',
    0,
    '',
  ),
};
const card = (billingDay?: number): PaymentMethod => ({
  id: 'visa',
  profileId: 'p1',
  type: 'credit_card',
  label: 'max executive',
  isArchived: 0,
  createdAt: NOW,
  updatedAt: NOW,
  card: {
    lastDigits: '5555',
    network: 'mastercard',
    issuer: 'max',
    ...(billingDay === undefined ? {} : { billingDay }),
  },
});

describe('cards and accounts kept to finish', () => {
  it('stand as the household does now', () => {
    // Nobody has it yet: a new card, its billing day missing.
    expect(unfinishedItem(entry, [])).toMatchObject({ kind: 'card', missing: ['billingDay'] });
    // Added since by hand, with all the file showed: finished some other way.
    expect(unfinishedItem(entry, [card(10)])).toBeUndefined();
    expect(unfinishedItem(entry, [card()])).toBeUndefined();
    // Another card of the household's changes nothing.
    expect(
      unfinishedItem(entry, [{ ...card(10), card: { lastDigits: '0088', billingDay: 10 } }]),
    ).toMatchObject({ missing: ['billingDay'] });
  });

  it('are kept as read', () => {
    const item = unfinishedItem(entry, []);
    if (item === undefined) throw new Error('not found');
    expect(foundMethodOf(item)).toEqual({ kind: 'card', found: entry.found });
  });

  it('are gone through one after another, round to the start', () => {
    expect(nextUnfinished(['a', 'b', 'c'], 'b')).toBe('c');
    expect(nextUnfinished(['a', 'b', 'c'], 'c')).toBe('a');
    expect(nextUnfinished(['a'], 'a')).toBeUndefined();
    expect(nextUnfinished([], 'a')).toBeUndefined();
    // One no longer listed: from the start.
    expect(nextUnfinished(['a', 'b'], 'z')).toBe('a');
  });
});
