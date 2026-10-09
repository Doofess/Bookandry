import { describe, expect, it } from 'vitest';

import { ALL_PROFILES, SHARED_OWNER, type PaymentMethod } from '@/types/domain';

import { startSession, usableVia, type ImportSession } from './import-session';

const empty = {
  stage: 'pick',
  files: [],
  states: [],
  items: [],
  methods: [],
  drafted: 0,
  reconciliations: [],
  batch: { methodId: '', profileId: 'p1' },
  note: '',
} as ImportSession;

describe('startSession', () => {
  it('starts a new session on the card it was opened for', () => {
    expect(startSession(undefined, empty, 'card-1').batch.methodId).toBe('card-1');
  });

  it('switches a session still picking files', () => {
    const picking = { ...empty, batch: { methodId: 'other', profileId: 'p1' } };
    expect(startSession(picking, empty, 'card-1').batch).toEqual({ methodId: 'card-1', profileId: 'p1' });
  });

  it('leaves a session already reading or in review alone', () => {
    const reviewing = {
      ...empty,
      stage: 'review',
      batch: { methodId: 'other', profileId: 'p1' },
    } as ImportSession;
    expect(startSession(reviewing, empty, 'card-1')).toBe(reviewing);
  });

  it('without a card, resumes or starts empty as before', () => {
    expect(startSession(undefined, empty, undefined)).toBe(empty);
  });
});

describe('usableVia', () => {
  const method = (id: string, over: Partial<PaymentMethod> = {}): PaymentMethod =>
    ({
      id,
      type: 'credit_card',
      label: id,
      profileId: 'p1',
      isArchived: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...over,
    }) as PaymentMethod;
  const methods = [
    method('live'),
    method('shared', { profileId: SHARED_OWNER }),
    method('put-away', { isArchived: 1 }),
    method('theirs', { profileId: 'p2' }),
  ];

  it('presets a live card the person looked at can pay with', () => {
    expect(usableVia('live', methods, 'p1')).toBe('live');
    expect(usableVia('shared', methods, 'p1')).toBe('shared');
    expect(usableVia('theirs', methods, ALL_PROFILES)).toBe('theirs');
  });

  it('starts without one for an archived card, a deleted one, or someone else’s', () => {
    expect(usableVia('put-away', methods, 'p1')).toBeUndefined();
    expect(usableVia('put-away', methods, ALL_PROFILES)).toBeUndefined();
    expect(usableVia('gone', methods, 'p1')).toBeUndefined();
    expect(usableVia('theirs', methods, 'p1')).toBeUndefined();
    expect(usableVia(undefined, methods, 'p1')).toBeUndefined();
  });
});
