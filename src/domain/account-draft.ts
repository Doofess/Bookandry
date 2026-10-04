import { toDecimalString, toMinor } from '@/lib/money';
import {
  SHARED_OWNER,
  type AccountHolding,
  type BankAccountDetails,
  type PaymentMethod,
} from '@/types/domain';

import { bankByCode, digitsOf, isAccountNumber, isBranchNumber, parseAccountText } from './banks';
import { CARD_CURRENCY } from './cards';

/** The bank-account editor's fields, as typed. */
export type AccountDraft = {
  /** Masav code, or '' before one is picked. */
  readonly bank: string;
  readonly branch: string;
  readonly number: string;
  readonly holding: AccountHolding;
  /** A personal account's holder. */
  readonly owner: string;
  /** A joint or business account's people in the household. */
  readonly holders: readonly string[];
  readonly otherHolders: string;
  /** מסגרת עו״ש, in shekels. */
  readonly overdraft: string;
};

export type AccountDraftField = 'bank' | 'branch' | 'number' | 'holders' | 'overdraft';

/** The editor's starting fields: an existing account's, or a new one held by `owner`. */
export function accountDraftOf(method: PaymentMethod | undefined, owner: string): AccountDraft {
  const account = method?.account;
  const holders = account?.holders ?? [];
  return {
    bank: account?.bank ?? '',
    branch: account?.branch ?? '',
    number: account?.number ?? '',
    holding: account?.holding ?? 'personal',
    owner:
      method !== undefined && method.profileId !== SHARED_OWNER ? method.profileId : (holders[0] ?? owner),
    holders: holders.length > 0 ? holders : [owner],
    otherHolders: account?.otherHolders ?? '',
    overdraft:
      account?.overdraftLimitMinor === undefined
        ? ''
        : toDecimalString(account.overdraftLimitMinor, CARD_CURRENCY),
  };
}

/**
 * What typing or pasting into the account-number field means.
 *
 * "12-689-123456" pasted whole fills all three fields; anything else is the
 * account number alone, digits kept.
 */
export function typedAccountNumber(text: string): Partial<AccountDraft> {
  const whole = parseAccountText(text);
  if (whole !== undefined) return { bank: whole.bank, branch: whole.branch, number: whole.number };
  return { number: text.replace(/[^\d\s-]/g, '') };
}

function amount(text: string): number | undefined | null {
  if (text.trim() === '') return undefined;
  try {
    // Commas are thousands, as on every statement: "15,000" is fifteen thousand.
    const minor = toMinor(text.replace(/,/g, ''), CARD_CURRENCY);
    return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
  } catch {
    return null;
  }
}

export type AccountDraftResult =
  | {
      readonly ok: true;
      readonly account: BankAccountDetails;
      /** Who the method belongs to: the one holder, or the household when several share it. */
      readonly profileId: string;
    }
  | { readonly ok: false; readonly invalid: readonly AccountDraftField[] };

export function accountFromDraft(draft: AccountDraft): AccountDraftResult {
  const invalid: AccountDraftField[] = [];

  const bank = bankByCode(draft.bank);
  if (bank === undefined) invalid.push('bank');

  const branch = digitsOf(draft.branch);
  if (branch !== '' && !isBranchNumber(branch)) invalid.push('branch');

  const number = digitsOf(draft.number);
  if (number !== '' && !isAccountNumber(number)) invalid.push('number');

  const personal = draft.holding === 'personal';
  const holders = personal ? [] : [...new Set(draft.holders)];
  if (personal ? draft.owner === '' || draft.owner === SHARED_OWNER : holders.length === 0) {
    invalid.push('holders');
  }

  const overdraftLimitMinor = amount(draft.overdraft);
  if (overdraftLimitMinor === null) invalid.push('overdraft');

  if (invalid.length > 0 || bank === undefined) return { ok: false, invalid };

  const otherHolders = personal ? '' : draft.otherHolders.trim().slice(0, 80);
  const account: BankAccountDetails = {
    bank: bank.code,
    ...(branch === '' ? {} : { branch: String(Number(branch)) }),
    ...(number === '' ? {} : { number }),
    holding: draft.holding,
    ...(personal ? {} : { holders }),
    ...(otherHolders === '' ? {} : { otherHolders }),
    ...(overdraftLimitMinor === undefined || overdraftLimitMinor === null || overdraftLimitMinor === 0
      ? {}
      : { overdraftLimitMinor }),
  };
  return {
    ok: true,
    account,
    profileId: personal ? draft.owner : holders.length === 1 ? (holders[0] ?? SHARED_OWNER) : SHARED_OWNER,
  };
}
