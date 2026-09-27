import type { PullPage, PushResult, SyncRecord, SyncTransport } from '@/db/sync/protocol';

/**
 * The server's rules, in memory, for the two-device scenario suite.
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
 */
type Held = { record: SyncRecord; seq: number; pushId: number };

export class MemorySyncServer {
  private readonly held = new Map<string, Held>();
  private seq = 0;
  private pushes = 0;

  /** Store the next push, then throw instead of answering: a lost ack. */
  loseNextAck = false;
  /** Fail the next push before storing anything: a dropped connection. */
  failNextPush = false;
  /** Serve the next pull page twice in a row: duplicate delivery. */
  duplicateNextPull = false;
  private replay: PullPage | undefined;

  /** Everything the server holds, for assertions. */
  snapshot(): SyncRecord[] {
    return [...this.held.values()].map((h) => h.record);
  }

  transport(): SyncTransport {
    return {
      push: (records) => Promise.resolve(this.push(records)),
      pull: (cursor, limit) => Promise.resolve(this.pull(cursor, limit)),
    };
  }

  private push(records: readonly SyncRecord[]): PushResult[] {
    if (this.failNextPush) {
      this.failNextPush = false;
      throw new Error('network: push dropped');
    }

    this.pushes += 1;
    const results = records.map((record): PushResult => {
      const key = `${record.tbl}/${record.id}`;
      const existing = this.held.get(key);
      if (existing !== undefined && record.rev < existing.record.rev) {
        return { tbl: record.tbl, id: record.id, rev: record.rev, status: 'stale' };
      }
      if (existing === undefined || record.rev > existing.record.rev) {
        this.seq += 1;
        // A deep copy: the server must never share an object with a device.
        this.held.set(key, { record: structuredClone(record), seq: this.seq, pushId: this.pushes });
      }
      return { tbl: record.tbl, id: record.id, rev: record.rev, status: 'stored' };
    });

    if (this.loseNextAck) {
      this.loseNextAck = false;
      throw new Error('network: ack lost after the server stored the push');
    }
    return results;
  }

  private pull(cursor: number, limit: number): PullPage {
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
    const page: PullPage = {
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
