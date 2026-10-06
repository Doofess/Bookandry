import { MalformedResponseError, type Rpc } from './transport';

/**
 * Linked accounts, over the database's functions
 * (supabase/migrations/*_households.sql). Like the sync transport, written
 * against a bare `rpc`, so the same code runs against real Postgres in the
 * tests; and like it, everything the server sends back is checked for shape.
 */

export type HouseholdMember = {
  readonly userId: string;
  readonly role: 'owner' | 'member';
  readonly displayName: string;
  readonly avatarVersion: number;
};

export type HouseholdInvite = { readonly id: string; readonly email: string; readonly expiresAt: string };

export type Household = {
  readonly id: string;
  readonly members: readonly HouseholdMember[];
  readonly invites: readonly HouseholdInvite[];
};

export type InvitePreview = {
  readonly inviterName: string;
  readonly members: number;
  readonly currency: string;
  readonly alreadyMember: boolean;
  /** The invitee is linked with others already, and must unlink first. */
  readonly linkedElsewhere: boolean;
};

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseMember(v: unknown): HouseholdMember | undefined {
  if (!isObject(v)) return undefined;
  const { userId, role, displayName, avatarVersion } = v;
  if (
    typeof userId !== 'string' ||
    !UUID.test(userId) ||
    (role !== 'owner' && role !== 'member') ||
    typeof displayName !== 'string' ||
    typeof avatarVersion !== 'number' ||
    !Number.isSafeInteger(avatarVersion)
  ) {
    return undefined;
  }
  return { userId, role, displayName, avatarVersion };
}

function parseInvite(v: unknown): HouseholdInvite | undefined {
  if (!isObject(v)) return undefined;
  const { id, email, expiresAt } = v;
  if (typeof id !== 'string' || typeof email !== 'string' || typeof expiresAt !== 'string') return undefined;
  return { id, email, expiresAt };
}

export function parseHousehold(answer: unknown): Household | null {
  if (answer === null) return null;
  if (!isObject(answer) || typeof answer['id'] !== 'string') throw new MalformedResponseError('household');
  const members = Array.isArray(answer['members']) ? answer['members'].map(parseMember) : [undefined];
  const invites = Array.isArray(answer['invites']) ? answer['invites'].map(parseInvite) : [undefined];
  if (members.some((m) => m === undefined) || invites.some((i) => i === undefined)) {
    throw new MalformedResponseError('household');
  }
  return {
    id: answer['id'],
    members: members as HouseholdMember[],
    invites: invites as HouseholdInvite[],
  };
}

export async function getHousehold(rpc: Rpc): Promise<Household | null> {
  return parseHousehold(await rpc('household', {}));
}

/** What this account calls itself to the others, and its picture's version (0 for none). */
export async function setMyMember(rpc: Rpc, displayName: string, avatarVersion: number): Promise<void> {
  await rpc('set_my_member', { p_display_name: displayName.slice(0, 80), p_avatar_version: avatarVersion });
}

export async function peekInvite(rpc: Rpc, token: string): Promise<InvitePreview> {
  const v = await rpc('peek_invite', { p_token: token });
  if (
    !isObject(v) ||
    typeof v['inviterName'] !== 'string' ||
    typeof v['members'] !== 'number' ||
    typeof v['currency'] !== 'string' ||
    typeof v['alreadyMember'] !== 'boolean' ||
    typeof v['linkedElsewhere'] !== 'boolean'
  ) {
    throw new MalformedResponseError('invitation');
  }
  return {
    inviterName: v['inviterName'],
    members: v['members'],
    currency: v['currency'],
    alreadyMember: v['alreadyMember'],
    linkedElsewhere: v['linkedElsewhere'],
  };
}

export async function acceptInvite(
  rpc: Rpc,
  token: string,
  currency: string,
  displayName: string,
): Promise<Household | null> {
  return parseHousehold(
    await rpc('accept_invite', {
      p_token: token,
      p_currency: currency,
      p_display_name: displayName.slice(0, 80),
    }),
  );
}

export async function declineInvite(rpc: Rpc, token: string): Promise<void> {
  await rpc('decline_invite', { p_token: token });
}

export async function revokeInvite(rpc: Rpc, id: string): Promise<void> {
  await rpc('revoke_invite', { p_id: id });
}

export async function leaveHousehold(rpc: Rpc): Promise<void> {
  await rpc('leave_household', {});
}

export async function removeMember(rpc: Rpc, userId: string): Promise<void> {
  await rpc('remove_member', { p_user: userId });
}

export type SendInviteOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error:
        | 'invite_self'
        | 'already_member'
        | 'household_full'
        | 'too_many_invites'
        | 'malformed_invite'
        | 'email_failed'
        | 'offline';
    };
