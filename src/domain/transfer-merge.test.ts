import { describe, expect, it } from 'vitest';

import { planMerge } from './transfer-merge';

type Row = { id: string; updatedAt: string; value: string };

const row = (id: string, updatedAt: string, value = 'a'): Row => ({ id, updatedAt, value });

describe('planMerge', () => {
  it('inserts rows that do not exist locally', () => {
    const plan = planMerge([], [row('a', '2026-01-01T00:00:00.000Z')]);
    expect(plan.inserts.map((r) => r.id)).toEqual(['a']);
    expect(plan.updates).toEqual([]);
  });

  it('is a NO-OP for an identical row, so re-importing a file is idempotent', () => {
    const existing = row('a', '2026-01-01T00:00:00.000Z');
    const plan = planMerge([existing], [{ ...existing }]);
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it('takes the NEWER copy when the same record was edited elsewhere', () => {
    // The spec said "skip duplicate IDs". With UUIDv7 a genuine id collision
    // between two databases is not realistic, so a duplicate id means the same
    // record edited twice - and skipping silently discards the newer edit.
    const local = row('a', '2026-01-01T00:00:00.000Z', 'old');
    const incoming = row('a', '2026-06-01T00:00:00.000Z', 'new');
    const plan = planMerge([local], [incoming]);
    expect(plan.updates.map((r) => r.value)).toEqual(['new']);
  });

  it('keeps the local copy when it is newer', () => {
    const local = row('a', '2026-06-01T00:00:00.000Z', 'local');
    const incoming = row('a', '2026-01-01T00:00:00.000Z', 'stale');
    const plan = planMerge([local], [incoming]);
    expect(plan.updates).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it('reports a conflict when timestamps tie but content differs', () => {
    // Nothing in the data can decide this, so keep local and TELL the user
    // rather than picking silently.
    const local = row('a', '2026-01-01T00:00:00.000Z', 'mine');
    const incoming = row('a', '2026-01-01T00:00:00.000Z', 'theirs');
    const plan = planMerge([local], [incoming]);
    expect(plan.updates).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]?.id).toBe('a');
  });

  it('handles a mixed batch', () => {
    const local = [row('keep', '2026-06-01T00:00:00.000Z', 'local'), row('same', '2026-01-01T00:00:00.000Z')];
    const incoming = [
      row('keep', '2026-01-01T00:00:00.000Z', 'stale'),
      row('same', '2026-01-01T00:00:00.000Z'),
      row('new', '2026-01-01T00:00:00.000Z'),
    ];
    const plan = planMerge(local, incoming);
    expect(plan.inserts.map((r) => r.id)).toEqual(['new']);
    expect(plan.updates).toEqual([]);
    expect(plan.unchanged).toBe(2);
  });

  it('never loses a newer edit across several rows', () => {
    const local = [row('a', '2026-01-01T00:00:00.000Z', 'v1'), row('b', '2026-01-01T00:00:00.000Z', 'v1')];
    const incoming = [row('a', '2026-02-01T00:00:00.000Z', 'v2'), row('b', '2026-02-01T00:00:00.000Z', 'v2')];
    const plan = planMerge(local, incoming);
    expect(plan.updates.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });
});
