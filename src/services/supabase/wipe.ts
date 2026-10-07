import { MalformedResponseError, ServerError, type Rpc } from './transport';

/**
 * Deleting all data, over the database's functions (20261008000000_wipes.sql).
 * Like household.ts: written against a bare `rpc`, every answer checked.
 */

export type WipeStatus = {
  readonly id: string;
  readonly status: 'pending' | 'done';
  /** This account asked. */
  readonly mine: boolean;
  readonly requesterName: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  /** The members still to confirm, by name. */
  readonly waitingFor: readonly string[];
};

export type WipePreview = {
  readonly requesterName: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly members: number;
};

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
const isText = (v: unknown): v is string => typeof v === 'string';

export async function wipeMyData(rpc: Rpc): Promise<number> {
  const epoch = await rpc('wipe_my_data', {});
  if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch)) throw new MalformedResponseError('wipe');
  return epoch;
}

export async function wipeStatus(rpc: Rpc): Promise<WipeStatus | null> {
  const v = await rpc('wipe_status', {});
  if (v === null) return null;
  if (
    !isObject(v) ||
    !isText(v['id']) ||
    (v['status'] !== 'pending' && v['status'] !== 'done') ||
    typeof v['mine'] !== 'boolean' ||
    !isText(v['requesterName']) ||
    !isText(v['createdAt']) ||
    !isText(v['expiresAt']) ||
    !Array.isArray(v['waitingFor']) ||
    !v['waitingFor'].every(isText)
  ) {
    throw new MalformedResponseError('wipe status');
  }
  return {
    id: v['id'],
    status: v['status'],
    mine: v['mine'],
    requesterName: v['requesterName'],
    createdAt: v['createdAt'],
    expiresAt: v['expiresAt'],
    waitingFor: v['waitingFor'],
  };
}

export async function peekWipe(rpc: Rpc, token: string): Promise<WipePreview> {
  const v = await rpc('peek_wipe', { p_token: token });
  if (
    !isObject(v) ||
    !isText(v['requesterName']) ||
    !isText(v['createdAt']) ||
    !isText(v['expiresAt']) ||
    typeof v['members'] !== 'number'
  ) {
    throw new MalformedResponseError('wipe preview');
  }
  return {
    requesterName: v['requesterName'],
    createdAt: v['createdAt'],
    expiresAt: v['expiresAt'],
    members: v['members'],
  };
}

export async function confirmWipe(rpc: Rpc, token: string): Promise<'waiting' | 'done'> {
  const v = await rpc('confirm_wipe', { p_token: token });
  // The household changed after the request was made, so it was called off:
  // to the person confirming, the same as a request that is no longer open.
  if (v === 'cancelled') throw new ServerError('wipe_invalid');
  if (v !== 'waiting' && v !== 'done') throw new MalformedResponseError('wipe confirm');
  return v;
}

export async function declineWipe(rpc: Rpc, token: string): Promise<void> {
  await rpc('decline_wipe', { p_token: token });
}

export async function cancelWipe(rpc: Rpc): Promise<void> {
  await rpc('cancel_wipe', {});
}

/** What sending the confirmation emails came to (send-wipe.ts, the send-wipe-requests function). */
export type SendWipeOutcome =
  | { readonly ok: true; readonly asked: number }
  | {
      readonly ok: false;
      readonly error: 'not_linked' | 'wipe_pending' | 'too_many_wipe_requests' | 'email_failed' | 'offline';
    };
