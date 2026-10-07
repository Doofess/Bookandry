import type { EncryptedPushResult, EncryptedRecord, EncryptedTransport } from '@/db/sync/codec';
import {
  SpaceWipedError,
  type PullPage,
  type PushResult,
  type SyncRecord,
  type SyncTransport,
} from '@/db/sync/protocol';

/**
 * The server's rules, in memory, for the two-device scenario suites.
 *
 * It implements exactly what the Postgres `push_records` function will, so the
 * merge engine is tested against the contract rather than against luck:
 *
 * - a record is stored only if its rev is NEWER than the one held; an EQUAL rev
 *   counts as stored, so a push whose acknowledgement was lost can be resent;
 * - every stored record gets the next per-user sequence number, in commit
 *   order (the reason the real one uses a counter row, not a bigserial);
 * - a pull page is never cut inside one push, so a row and the rows written
 *   with it arrive together.
 *
 * Plus fault switches, because the interesting bugs live in the failures.
 * Generic over the record shape: plaintext for the merge suites, ciphertext
 * for the encryption suite - the rules do not change.
 */
type Held<R> = { record: R; seq: number; pushId: number };

class MemoryServer<R extends { readonly rev: string }> {
  private readonly held = new Map<string, Held<R>>();
  private seq = 0;
  private pushes = 0;

  /** Store the next push, then throw instead of answering: a lost ack. */
  loseNextAck = false;
  /** Fail the next push before storing anything: a dropped connection. */
  failNextPush = false;
  /** Serve the next pull page twice in a row: duplicate delivery. */
  duplicateNextPull = false;
  private replay: { records: R[]; cursor: number; hasMore: boolean } | undefined;

  constructor(private readonly keyOf: (record: R) => string) {}

  /** Everything the server holds, for assertions. */
  snapshot(): R[] {
    return [...this.held.values()].map((h) => h.record);
  }

  /** Overwrite what the server holds for one key, as a malicious server would. */
  tamper(key: string, change: (record: R) => R): void {
    const held = this.held.get(key);
    if (held === undefined) throw new Error(`nothing held for ${key}`);
    this.seq += 1;
    this.held.set(key, { ...held, record: change(held.record), seq: this.seq });
  }

  /** Forget everything: what a key rotation asks the real server to do. */
  reset(): void {
    this.held.clear();
  }

  protected pushRecords(records: readonly R[]): { record: R; status: 'stored' | 'stale' }[] {
    if (this.failNextPush) {
      this.failNextPush = false;
      throw new Error('network: push dropped');
    }

    this.pushes += 1;
    const results = records.map((record) => {
      const key = this.keyOf(record);
      const existing = this.held.get(key);
      if (existing !== undefined && record.rev < existing.record.rev) {
        return { record, status: 'stale' as const };
      }
      if (existing === undefined || record.rev > existing.record.rev) {
        this.seq += 1;
        // A deep copy: the server must never share an object with a device.
        this.held.set(key, { record: structuredClone(record), seq: this.seq, pushId: this.pushes });
      }
      return { record, status: 'stored' as const };
    });

    if (this.loseNextAck) {
      this.loseNextAck = false;
      throw new Error('network: ack lost after the server stored the push');
    }
    return results;
  }

  protected pullRecords(cursor: number, limit: number): { records: R[]; cursor: number; hasMore: boolean } {
    if (this.replay !== undefined) {
      const page = this.replay;
      this.replay = undefined;
      return page;
    }

    const newer = [...this.held.values()].filter((h) => h.seq > cursor).sort((a, b) => a.seq - b.seq);
    let take = Math.min(limit, newer.length);
    // Never end a page in the middle of one push.
    while (take > 0 && take < newer.length && newer[take]!.pushId === newer[take - 1]!.pushId) take += 1;

    const chosen = newer.slice(0, take);
    const page = {
      records: chosen.map((h) => structuredClone(h.record)),
      cursor: chosen.at(-1)?.seq ?? cursor,
      hasMore: take < newer.length,
    };

    if (this.duplicateNextPull) {
      this.duplicateNextPull = false;
      // Deliver it, then deliver it again as though the cursor never moved.
      this.replay = { ...page, cursor, hasMore: true };
      return { ...page, cursor, hasMore: true };
    }
    return page;
  }
}

/** Plaintext records, keyed by table and id: the merge engine's view. */
export class MemorySyncServer extends MemoryServer<SyncRecord> {
  /** The erase counter: a push carrying an older one is refused. */
  epoch = 0;

  constructor() {
    super((r) => `${r.tbl}/${r.id}`);
  }

  /** Forget everything and move the epoch on: what deleting all data does. */
  erase(): void {
    this.reset();
    this.epoch += 1;
  }

  transport(): SyncTransport {
    return {
      push: (records, epoch) =>
        (epoch ?? 0) < this.epoch
          ? Promise.reject(new SpaceWipedError())
          : Promise.resolve(
              this.pushRecords(records).map(({ record, status }): PushResult => ({
                tbl: record.tbl,
                id: record.id,
                rev: record.rev,
                status,
              })),
            ),
      pull: (cursor, limit): Promise<PullPage> =>
        Promise.resolve({ ...this.pullRecords(cursor, limit), epoch: this.epoch }),
    };
  }
}

/** Ciphertext keyed by blinded id: all the real server will ever see. */
export class MemoryCipherServer extends MemoryServer<EncryptedRecord> {
  /**
   * The rotation barrier: after a rotation the server refuses any push sealed
   * under an older key version, so a device that has not yet unlocked with the
   * new key keeps its changes queued instead of filing them where nobody can
   * ever read them. `push_records` enforces the same.
   */
  private minKeyVersion = 0;

  constructor() {
    super((r) => r.rid);
  }

  /** Forget everything and refuse anything sealed below `version`: a rotation. */
  rotateTo(version: number): void {
    this.reset();
    this.minKeyVersion = version;
  }

  transport(): EncryptedTransport {
    return {
      push: (records) => {
        if (records.some((r) => r.keyVersion < this.minKeyVersion)) {
          return Promise.reject(new Error('push refused: sealed under a retired key version'));
        }
        return Promise.resolve(
          this.pushRecords(records).map(({ record, status }): EncryptedPushResult => ({
            rid: record.rid,
            rev: record.rev,
            status,
          })),
        );
      },
      pull: (cursor, limit) => Promise.resolve(this.pullRecords(cursor, limit)),
    };
  }
}
