import { describe, expect, it } from 'vitest';

import { SHARED_OWNER, type PaymentMethod } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { accountDraftOf, accountFromDraft, typedAccountNumber, type AccountDraft } from './account-draft';

const NOW = '2026-10-04T00:00:00.000Z' as IsoInstant;
const draft = (over: Partial<AccountDraft> = {}): AccountDraft => ({
  ...accountDraftOf(undefined, 'p1'),
  bank: '12',
  ...over,
});

describe('accountFromDraft', () => {
  it('keeps a personal account as its holder', () => {
    expect(accountFromDraft(draft({ branch: '0689', number: '12-3456', overdraft: '10,000' }))).toEqual({
      ok: true,
      profileId: 'p1',
      account: {
        bank: '12',
        branch: '689',
        number: '123456',
        holding: 'personal',
        overdraftLimitMinor: 1_000_000,
      },
    });
  });

  it('gives a joint account to its one holder, or to the household when several hold it', () => {
    const one = accountFromDraft(draft({ holding: 'joint', holders: ['p2'], otherHolders: ' Dana ' }));
    expect(one).toMatchObject({ profileId: 'p2', account: { holders: ['p2'], otherHolders: 'Dana' } });
    const two = accountFromDraft(draft({ holding: 'business', holders: ['p1', 'p2', 'p1'] }));
    expect(two).toMatchObject({
      profileId: SHARED_OWNER,
      account: { holding: 'business', holders: ['p1', 'p2'] },
    });
  });

  it('drops what only a shared account has from a personal one, and a zero overdraft', () => {
    const result = accountFromDraft(draft({ holders: ['p1', 'p2'], otherHolders: 'Dana', overdraft: '0' }));
    expect(result).toEqual({ ok: true, profileId: 'p1', account: { bank: '12', holding: 'personal' } });
  });

  it('says which fields cannot be read', () => {
    expect(
      accountFromDraft(
        draft({ bank: '7', branch: '12345', number: '1', holding: 'joint', holders: [], overdraft: 'abc' }),
      ),
    ).toEqual({ ok: false, invalid: ['bank', 'branch', 'number', 'holders', 'overdraft'] });
    expect(accountFromDraft(draft({ owner: '' }))).toEqual({ ok: false, invalid: ['holders'] });
    expect(accountFromDraft(draft({ owner: SHARED_OWNER }))).toEqual({ ok: false, invalid: ['holders'] });
  });
});

describe('accountDraftOf', () => {
  const method = (over: Partial<PaymentMethod>): PaymentMethod => ({
    id: 'acc',
    profileId: 'p1',
    type: 'bank_account',
    label: 'Leumi',
    isArchived: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  });

  it('round-trips an account', () => {
    const account = {
      bank: '10',
      branch: '936',
      number: '12345678',
      holding: 'joint' as const,
      holders: ['p1', 'p2'],
      otherHolders: 'Dana',
      overdraftLimitMinor: 1_500_050,
    };
    const opened = accountDraftOf(method({ profileId: SHARED_OWNER, account }), 'p9');
    expect(opened).toMatchObject({ owner: 'p1', overdraft: '15000.50' });
    expect(accountFromDraft(opened)).toEqual({ ok: true, profileId: SHARED_OWNER, account });
  });

  it('starts a new account as the given person’s, personal', () => {
    expect(accountDraftOf(undefined, 'p3')).toEqual({
      bank: '',
      branch: '',
      number: '',
      holding: 'personal',
      owner: 'p3',
      holders: ['p3'],
      otherHolders: '',
      overdraft: '',
    });
  });
});

describe('typedAccountNumber', () => {
  it('fills the bank and branch from an account pasted whole', () => {
    expect(typedAccountNumber('12-689-123456')).toEqual({ bank: '12', branch: '689', number: '123456' });
  });

  it('otherwise keeps digits, spaces and dashes', () => {
    expect(typedAccountNumber('12a3-45')).toEqual({ number: '123-45' });
  });
});
