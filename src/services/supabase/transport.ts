import type { EncryptedPushResult, EncryptedRecord, EncryptedTransport } from '@/db/sync/codec';
import { isRev } from '@/lib/rev';
import type { WrappedKey } from '@/services/crypto/wrap';

/**
 * The encrypted sync transport over the database's functions
 * (supabase/migrations/*_sync.sql).
 *
 * Written against a bare `rpc(fn, args)` rather than the Supabase client, so
 * the SAME code runs against real Postgres in the tests (src/test/pg-harness)
 * and against Supabase in the app. Everything the server sends back is
 * checked for shape here - the server is not trusted to be well-formed, any
 * more than it is trusted with plaintext.
 */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

/** What the database's functions raise, by message. */
export type ServerErrorCode =
  | 'not_signed_in'
  | 'second_step_required'
  | 'keys_not_set_up'
  | 'already_set_up'
  | 'key_version_changed'
  | 'stale_key_version'
  | 'recovery_wrap_required'
  | 'malformed_wrap'
  | 'malformed_record'
  | 'malformed_pull'
  | 'push_too_large'
  | 'too_many_wraps'
  | 'quota_exceeded'
  | 'not_linked'
  | 'malformed_invite'
  | 'malformed_member'
  | 'invite_self'
  | 'invite_invalid'
  | 'invite_wrong_account'
  | 'already_member'
  | 'already_linked'
  | 'household_full'
  | 'too_many_invites'
  | 'currency_mismatch'
  | 'not_owner';

const KNOWN: ReadonlySet<string> = new Set<ServerErrorCode>([
  'not_signed_in',
  'second_step_required',
  'keys_not_set_up',
  'already_set_up',
  'key_version_changed',
  'stale_key_version',
  'recovery_wrap_required',
  'malformed_wrap',
  'malformed_record',
  'malformed_pull',
  'push_too_large',
  'too_many_wraps',
  'quota_exceeded',
  'not_linked',
  'malformed_invite',
  'malformed_member',
  'invite_self',
  'invite_invalid',
  'invite_wrong_account',
  'already_member',
  'already_linked',
  'household_full',
  'too_many_invites',
  'currency_mismatch',
  'not_owner',
]);

export class ServerError extends Error {
  readonly code: ServerErrorCode | 'unknown';
  constructor(message: string) {
    super(message);
    this.name = 'ServerError';
    this.code = KNOWN.has(message) ? (message as ServerErrorCode) : 'unknown';
  }
}

/** The shape every page of a pull must have; anything else is refused whole. */
export class MalformedResponseError extends Error {
  constructor(what: string) {
    super(`The server sent a malformed ${what}`);
    this.name = 'MalformedResponseError';
  }
}

const B64URL = /^[A-Za-z0-9_-]+$/;

function isRecord(value: unknown): value is EncryptedRecord {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['rid'] === 'string' &&
    B64URL.test(v['rid']) &&
    typeof v['rev'] === 'string' &&
    isRev(v['rev']) &&
    typeof v['keyVersion'] === 'number' &&
    Number.isSafeInteger(v['keyVersion']) &&
    typeof v['iv'] === 'string' &&
    B64URL.test(v['iv']) &&
    typeof v['ct'] === 'string' &&
    B64URL.test(v['ct'])
  );
}

function isPushResult(value: unknown): value is EncryptedPushResult {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['rid'] === 'string' &&
    typeof v['rev'] === 'string' &&
    isRev(v['rev']) &&
    (v['status'] === 'stored' || v['status'] === 'stale')
  );
}

/**
 * Per-call limits, kept under the server's (private.limits) so a batch of
 * unusually large rows is split rather than refused - a refused push would be
 * retried, and refused, forever.
 */
export const PUSH_MAX_RECORDS = 500;
export const PUSH_MAX_CHARS = 1_048_576;

function chunks(records: readonly EncryptedRecord[]): EncryptedRecord[][] {
  const out: EncryptedRecord[][] = [];
  let current: EncryptedRecord[] = [];
  let chars = 0;
  for (const record of records) {
    const size = record.ct.length;
    if (current.length > 0 && (current.length >= PUSH_MAX_RECORDS || chars + size > PUSH_MAX_CHARS)) {
      out.push(current);
      current = [];
      chars = 0;
    }
    current.push(record);
    chars += size;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * `space`: a linked account's space to read and write, instead of this
 * account's own (supabase/migrations/*_households.sql).
 */
export function rpcTransport(rpc: Rpc, space?: string): EncryptedTransport {
  const where = space === undefined ? {} : { p_space: space };
  return {
    async push(records) {
      const results: EncryptedPushResult[] = [];
      for (const chunk of chunks(records)) {
        const answer = await rpc('push_records', {
          ...where,
          p_records: chunk.map((r) => ({
            rid: r.rid,
            rev: r.rev,
            keyVersion: r.keyVersion,
            iv: r.iv,
            ct: r.ct,
          })),
        });
        if (!Array.isArray(answer) || !answer.every(isPushResult)) {
          throw new MalformedResponseError('push result');
        }
        results.push(...answer);
      }
      return results;
    },

    async pull(cursor, limit) {
      const answer = (await rpc('pull_records', { ...where, p_cursor: cursor, p_limit: limit })) as {
        records?: unknown;
        cursor?: unknown;
        hasMore?: unknown;
      } | null;
      const records = answer?.records;
      const next = answer?.cursor;
      if (
        !Array.isArray(records) ||
        !records.every(isRecord) ||
        typeof next !== 'number' ||
        !Number.isSafeInteger(next) ||
        next < cursor ||
        typeof answer?.hasMore !== 'boolean'
      ) {
        throw new MalformedResponseError('pull page');
      }
      return { records, cursor: next, hasMore: answer.hasMore };
    },
  };
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** The account's key state as the server holds it. */
export type KeyState = { readonly keyVersion: number; readonly wraps: readonly WrappedKey[] };

function wrapForServer(w: WrappedKey): Record<string, unknown> {
  return {
    kind: w.kind,
    id: w.id,
    keyVersion: w.keyVersion,
    salt: w.salt,
    iv: w.iv,
    ct: w.ct,
    ...(w.kdf === undefined ? {} : { kdf: w.kdf }),
  };
}

function parseWrap(value: unknown): WrappedKey | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (
    v['kind'] !== 'passkey' &&
    v['kind'] !== 'recovery' &&
    v['kind'] !== 'passphrase' &&
    v['kind'] !== 'account'
  ) {
    return undefined;
  }
  const kind: WrappedKey['kind'] = v['kind'];
  const { id, keyVersion, salt, iv, ct } = v;
  if (
    typeof id !== 'string' ||
    typeof keyVersion !== 'number' ||
    !Number.isSafeInteger(keyVersion) ||
    typeof salt !== 'string' ||
    typeof iv !== 'string' ||
    // The account's own entry has no salt and no IV; every real wrap has both.
    (kind === 'account' ? salt !== '' || iv !== '' : !B64URL.test(salt) || !B64URL.test(iv)) ||
    typeof ct !== 'string' ||
    !B64URL.test(ct)
  ) {
    return undefined;
  }
  const base = { kind, id, keyVersion, salt, iv, ct };
  const kdf = v['kdf'];
  if (kdf === null || kdf === undefined) return base;
  if (typeof kdf !== 'object') return undefined;
  const k = kdf as Record<string, unknown>;
  const { m, t, p } = k;
  // Ranges are the unwrapper's to judge (isAcceptableArgon); here, only types.
  if (k['alg'] !== 'argon2id' || typeof m !== 'number' || typeof t !== 'number' || typeof p !== 'number') {
    return undefined;
  }
  return { ...base, kdf: { alg: 'argon2id', m, t, p } };
}

/** `space`: a linked account's, whose own key entry is all the server hands over. */
export async function getKeyState(rpc: Rpc, space?: string): Promise<KeyState> {
  const answer = (await rpc('get_key_state', space === undefined ? {} : { p_space: space })) as {
    keyVersion?: unknown;
    wraps?: unknown;
  } | null;
  const keyVersion = answer?.keyVersion;
  const raw = answer?.wraps;
  if (typeof keyVersion !== 'number' || !Number.isSafeInteger(keyVersion) || !Array.isArray(raw)) {
    throw new MalformedResponseError('key state');
  }
  const wraps = raw.map(parseWrap);
  if (wraps.some((w) => w === undefined)) throw new MalformedResponseError('wrapped key');
  return { keyVersion, wraps: wraps as WrappedKey[] };
}

export async function setupKeys(rpc: Rpc, wraps: readonly WrappedKey[]): Promise<number> {
  return Number(await rpc('setup_keys', { p_wraps: wraps.map(wrapForServer) }));
}

export async function rotateKeys(rpc: Rpc, from: number, wraps: readonly WrappedKey[]): Promise<number> {
  return Number(await rpc('rotate_keys', { p_from: from, p_wraps: wraps.map(wrapForServer) }));
}

export async function putWrap(rpc: Rpc, wrap: WrappedKey): Promise<void> {
  await rpc('put_wrap', { p_wrap: wrapForServer(wrap) });
}

export async function deleteWrap(rpc: Rpc, kind: WrappedKey['kind'], id: string): Promise<void> {
  await rpc('delete_wrap', { p_kind: kind, p_id: id });
}

export async function deleteMyAccount(rpc: Rpc): Promise<void> {
  await rpc('delete_my_account', {});
}
