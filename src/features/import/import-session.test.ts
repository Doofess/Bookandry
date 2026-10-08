import { describe, expect, it } from 'vitest';

import { startSession, type ImportSession } from './import-session';

const empty = {
  stage: 'pick',
  files: [],
  states: [],
  items: [],
  methods: [],
  drafted: 0,
  reconciliations: [],
  batch: { methodId: '', profileId: 'p1' },
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
