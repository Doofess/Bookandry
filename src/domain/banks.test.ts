import { describe, expect, it } from 'vitest';

import snapshot from '@/data/bank-branches.json';

import {
  accountTail,
  BANKS,
  bankByCode,
  bankName,
  digitsOf,
  isAccountNumber,
  isBranchNumber,
  parseAccountText,
} from './banks';

describe('the banks', () => {
  it('has each code once', () => {
    expect(new Set(BANKS.map((b) => b.code)).size).toBe(BANKS.length);
  });

  it('finds a bank by its code, with or without the leading zero', () => {
    expect(bankByCode('12')?.en).toBe('Bank Hapoalim');
    expect(bankByCode('012')?.code).toBe('12');
    expect(bankByCode('04')?.he).toBe('בנק יהב');
    expect(bankByCode('7')).toBeUndefined();
    expect(bankByCode('')).toBeUndefined();
  });

  it('names a bank in the UI language', () => {
    const leumi = bankByCode('10');
    expect(leumi && bankName(leumi, 'he')).toBe('בנק לאומי');
    expect(leumi && bankName(leumi, 'en')).toBe('Bank Leumi');
  });

  it('keeps the Arab banks, with their Arabic names', () => {
    const arab = BANKS.filter((b) => b.group === 'arab');
    expect(arab.map((b) => b.code)).toEqual(expect.arrayContaining(['49', '89', '82', '66', '84']));
    for (const bank of arab) expect(bank.ar).toMatch(/[؀-ۿ]/);
  });

  it('says where a merged bank went, and that bank is listed', () => {
    for (const bank of BANKS.filter((b) => b.group === 'merged')) {
      expect(bankByCode(bank.now ?? '')?.group).toBe('israel');
    }
  });

  it("covers every bank in the Bank of Israel's branch list that holds accounts", () => {
    // Card companies, clearing houses and the Bank of Israel itself hold no current accounts.
    const notBanks = new Set(['1', '6', '50', '59', '99']);
    const listed = Object.keys(snapshot.banks).filter((code) => !notBanks.has(code));
    for (const code of listed) expect(bankByCode(code), code).toBeDefined();
  });
});

describe('account numbers', () => {
  it('keeps digits only', () => {
    expect(digitsOf(' 12-345 678‎')).toBe('12345678');
    expect(digitsOf('12.345/6')).toBe('123456');
  });

  it('checks a branch and an account number', () => {
    expect(isBranchNumber('689')).toBe(true);
    expect(isBranchNumber('12345')).toBe(false);
    expect(isBranchNumber('')).toBe(false);
    expect(isAccountNumber('123456')).toBe(true);
    expect(isAccountNumber('1')).toBe(false);
    expect(isAccountNumber('12345678901234')).toBe(false);
    expect(isAccountNumber('12a')).toBe(false);
  });

  it('splits an account written whole', () => {
    expect(parseAccountText('12-689-123456')).toEqual({ bank: '12', branch: '689', number: '123456' });
    expect(parseAccountText('012/0689/123456')).toEqual({ bank: '12', branch: '689', number: '123456' });
    expect(parseAccountText('בנק 10 סניף 936 חשבון 12345678')).toEqual({
      bank: '10',
      branch: '936',
      number: '12345678',
    });
  });

  it('does not mistake a lone number, or an unknown bank, for an account written whole', () => {
    expect(parseAccountText('123456')).toBeUndefined();
    expect(parseAccountText('12-689')).toBeUndefined();
    expect(parseAccountText('07-689-123456')).toBeUndefined();
    expect(parseAccountText('12-68900-123456')).toBeUndefined();
    expect(parseAccountText('12-689-1')).toBeUndefined();
    expect(parseAccountText('12 345 678')).toBeUndefined();
  });

  it('tells an account apart by its last four digits', () => {
    expect(accountTail('123456')).toBe('\u2066··3456\u2069');
  });
});
