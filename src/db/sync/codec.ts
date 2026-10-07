import { isRev, type Rev } from '@/lib/rev';
import { DecryptError, open, seal } from '@/services/crypto/aead';
import {
  fromBase64Url,
  fromUtf8,
  lengthPrefixed,
  toBase64Url,
  utf8,
  type Bytes,
} from '@/services/crypto/bytes';
import { blindRecordId, type Keyring } from '@/services/crypto/keys';

import type { PushResult, SyncRecord, SyncTransport } from './protocol';
import { isSyncedTable, type SyncedTable } from './tables';

/**
 * What the server stores for a row, and all it ever learns about it:
 *
 *   rid         an HMAC of (table, id) - not the table, not the id
 *   rev         when it was last written (needed to order writes)
 *   keyVersion  which data key sealed it
 *   iv, ct      the sealed { table, id, deleted, row }
 *
 * The deletion flag is INSIDE the ciphertext. A server that could flip a
 * plaintext `deleted` column could delete a household's rows, or bring deleted
 * ones back, and every device would believe it.
 */
export type EncryptedRecord = {
  readonly rid: string;
  readonly rev: Rev;
  readonly keyVersion: number;
  readonly iv: string;
  readonly ct: string;
};

export type EncryptedPushResult = {
  readonly rid: string;
  readonly rev: Rev;
  readonly status: 'stored' | 'stale';
};

export type EncryptedTransport = {
  push(records: readonly EncryptedRecord[], epoch?: number): Promise<readonly EncryptedPushResult[]>;
  pull(
    cursor: number,
    limit: number,
  ): Promise<{ records: readonly EncryptedRecord[]; cursor: number; hasMore: boolean; epoch?: number }>;
};

export type Keys = {
  /** New records are sealed with this one. */
  readonly current: Keyring;
  /** Every version this device can still open, including `current`. */
  readonly byVersion: ReadonlyMap<number, Keyring>;
};

/**
 * A record sealed with a NEWER data key than this device holds - the household
 * rotated its key and this device has not unlocked with the new one yet.
 *
 * THROWN, not skipped: skipping would move the cursor past the record and this
 * device would never see it, even after unlocking. Stopping leaves the cursor
 * where it is, so the same page is pulled again once the key is here.
 *
 * An OLDER version this device does not hold is the opposite case: it was
 * retired by a rotation and no device will ever hold it again. Waiting for it
 * would stop every device on the account at that record for good, so it is
 * rejected like any other record that can never open. (The server refuses
 * pushes under a retired version, so one arriving at all means a server bug
 * or a server lying.)
 */
export class KeyUnavailableError extends Error {
  constructor(readonly keyVersion: number) {
    super(`No data key for version ${String(keyVersion)}`);
    this.name = 'KeyUnavailableError';
  }
}

export type CodecOptions = {
  readonly userId: string;
  readonly keys: () => Keys;
  /**
   * A record that failed authentication or made no sense once opened. It is
   * dropped - it can never become valid - and reported, never guessed at.
   */
  readonly onRejected?: (rid: string, reason: RejectReason) => void;
};

export type RejectReason = 'decrypt' | 'shape' | 'rid' | 'rev' | 'retired-key';

type Sealed = { v: 1; tbl: SyncedTable; id: string; deleted: boolean; row: unknown };

function recordAad(userId: string, rid: string, rev: string, keyVersion: number): Bytes {
  // Length-prefixed, never delimiter-joined: see lengthPrefixed().
  return lengthPrefixed(['bookandry/rec/v1', userId, rid, rev, String(keyVersion)]);
}

/**
 * Wrap a ciphertext-only transport so the sync engine keeps speaking
 * plaintext. The engine's merge rules never see a byte of crypto, and this
 * never sees a merge rule.
 *
 * What the authenticated context buys: the rev and key version are plaintext
 * because the server must order and route by them, but they are bound into
 * every ciphertext. A server that changes a rev, moves a ciphertext to another
 * rid or another user, or relabels its key version, produces a record that
 * fails to open.
 *
 * What it cannot buy, and the README says so: a server can still WITHHOLD
 * records, or replay an older authentic one. Replay is harmless here - a rev
 * no newer than what the device holds is skipped by the engine - but
 * withholding is undetectable without a global log, which this does not have.
 */
export function encryptingTransport(inner: EncryptedTransport, options: CodecOptions): SyncTransport {
  return {
    async push(records, epoch) {
      const { current } = options.keys();
      const byRid = new Map<string, SyncRecord>();
      const sealed: EncryptedRecord[] = [];

      for (const record of records) {
        const rid = await blindRecordId(current, record.tbl, record.id);
        byRid.set(rid, record);
        const payload: Sealed = {
          v: 1,
          tbl: record.tbl,
          id: record.id,
          deleted: record.deleted,
          row: record.row,
        };
        const box = await seal(
          current.enc,
          utf8(JSON.stringify(payload)),
          recordAad(options.userId, rid, record.rev, current.version),
        );
        sealed.push({
          rid,
          rev: record.rev,
          keyVersion: current.version,
          iv: toBase64Url(box.iv),
          ct: toBase64Url(box.ct),
        });
      }

      const results = await inner.push(sealed, epoch);
      return results.flatMap((result): PushResult[] => {
        const record = byRid.get(result.rid);
        // An answer about a record we did not send is ignored, not trusted.
        if (record?.rev !== result.rev) return [];
        return [{ tbl: record.tbl, id: record.id, rev: record.rev, status: result.status }];
      });
    },

    async pull(cursor, limit) {
      const page = await inner.pull(cursor, limit);
      const { current, byVersion } = options.keys();
      const records: SyncRecord[] = [];

      for (const encrypted of page.records) {
        const keyring = byVersion.get(encrypted.keyVersion);
        if (keyring === undefined) {
          if (encrypted.keyVersion > current.version) throw new KeyUnavailableError(encrypted.keyVersion);
          options.onRejected?.(encrypted.rid, 'retired-key');
          continue;
        }

        const opened = await openRecord(encrypted, keyring, options.userId);
        if (typeof opened === 'string') {
          options.onRejected?.(encrypted.rid, opened);
          continue;
        }
        records.push(opened);
      }

      return {
        records,
        cursor: page.cursor,
        hasMore: page.hasMore,
        ...(page.epoch === undefined ? {} : { epoch: page.epoch }),
      };
    },
  };
}

async function openRecord(
  encrypted: EncryptedRecord,
  keyring: Keyring,
  userId: string,
): Promise<SyncRecord | 'decrypt' | 'shape' | 'rid' | 'rev'> {
  if (!isRev(encrypted.rev)) return 'rev';

  let text: string;
  try {
    const plain = await open(
      keyring.enc,
      { iv: fromBase64Url(encrypted.iv), ct: fromBase64Url(encrypted.ct) },
      recordAad(userId, encrypted.rid, encrypted.rev, encrypted.keyVersion),
    );
    text = fromUtf8(plain);
  } catch (error) {
    if (error instanceof DecryptError || error instanceof RangeError || error instanceof TypeError)
      return 'decrypt';
    throw error;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return 'shape';
  }
  if (!isSealed(payload)) return 'shape';

  // The rid must be the one THIS table and id blind to. Authenticated context
  // already stops the server moving ciphertext between rids; this also stops a
  // sealed payload from naming a row other than the one it is filed under.
  if ((await blindRecordId(keyring, payload.tbl, payload.id)) !== encrypted.rid) return 'rid';

  return {
    tbl: payload.tbl,
    id: payload.id,
    rev: encrypted.rev,
    deleted: payload.deleted,
    row: payload.deleted ? null : payload.row,
  };
}

function isSealed(value: unknown): value is Sealed {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v['v'] === 1 &&
    typeof v['tbl'] === 'string' &&
    isSyncedTable(v['tbl']) &&
    typeof v['id'] === 'string' &&
    v['id'].length > 0 &&
    typeof v['deleted'] === 'boolean'
  );
}
