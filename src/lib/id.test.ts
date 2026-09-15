import { describe, expect, it } from 'vitest';

import { counterIdFactory, newId, setIdFactory } from './id';

describe('newId', () => {
  it('produces a v7 UUID with the RFC 4122 variant', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('does not use crypto.randomUUID, which is secure-context only', () => {
    // `pnpm dev --host` on a phone over plain http would make randomUUID
    // undefined and every save throw. getRandomValues works there.
    const original = Reflect.get(crypto, 'randomUUID') as unknown;
    Reflect.set(crypto, 'randomUUID', undefined);
    try {
      expect(() => newId()).not.toThrow();
      expect(newId()).toMatch(/^[0-9a-f]{8}-/);
    } finally {
      Reflect.set(crypto, 'randomUUID', original);
    }
  });

  it('is unique across many calls', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newId()));
    expect(ids.size).toBe(2000);
  });

  it('sorts in creation order, which gives the feed a stable tiebreak', () => {
    const first = newId();
    const later = newId();
    // Same millisecond is possible, so assert the timestamp prefix is
    // non-decreasing rather than strictly increasing.
    expect(first.slice(0, 8) <= later.slice(0, 8)).toBe(true);
  });
});

describe('id factory injection', () => {
  it('can be replaced and restored', () => {
    const restore = setIdFactory(counterIdFactory('tx'));
    try {
      expect(newId()).toBe('tx-000001');
      expect(newId()).toBe('tx-000002');
    } finally {
      restore();
    }
    expect(newId()).toMatch(/^[0-9a-f]{8}-/);
  });

  it('counter factories are independent', () => {
    const a = counterIdFactory('a');
    const b = counterIdFactory('b');
    expect(a()).toBe('a-000001');
    expect(b()).toBe('b-000001');
    expect(a()).toBe('a-000002');
  });
});
