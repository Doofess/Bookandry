import { describe, expect, it } from 'vitest';

import snapshot from '@/data/bank-branches.json';

import { branchListFromDatastore, findBranch, type BranchList } from './bank-branches';

const LIST: BranchList = {
  fetched: '2026-10-04',
  banks: {
    '10': [
      [614, 'בנקאות פרטית הרצליה', 'הרצלייה', 'Private Banking Herzliya', 'Herzliyya', '2026-05-14', 10, 688],
      [936, 'רמת אביב', 'תל אביב -יפו', 'Ramat Aviv', 'Tel Aviv - Yafo', null, null, null],
    ],
    '12': [[689, 'ביצוע', 'לוד', '', '', null, null, null]],
  },
};

describe('findBranch', () => {
  it('names the branch in Hebrew or English', () => {
    expect(findBranch(LIST, '10', '936', 'he')).toEqual({
      status: 'found',
      branch: { bank: '10', code: 936, name: 'רמת אביב', city: 'תל אביב -יפו' },
    });
    expect(findBranch(LIST, '10', '0936', 'en')).toMatchObject({
      branch: { name: 'Ramat Aviv', city: 'Tel Aviv - Yafo' },
    });
  });

  it('falls back to Hebrew where the list has no English', () => {
    expect(findBranch(LIST, '12', '689', 'en')).toMatchObject({ branch: { name: 'ביצוע', city: 'לוד' } });
  });

  it('says when a branch closed, and where its accounts went', () => {
    expect(findBranch(LIST, '10', '614', 'he')).toMatchObject({
      branch: { closed: '2026-05-14', mergedInto: { bank: '10', branch: 688 } },
    });
  });

  it('prefers the open branch when a number is listed twice', () => {
    const twice: BranchList = {
      fetched: '2026-10-04',
      banks: {
        '10': [
          [904, 'שער העיר', 'ירושלים', '', '', '2020-01-01', null, null],
          [904, 'שלוחת ביתר עילית', 'ביתר עילית', '', '', null, null, null],
        ],
      },
    };
    expect(findBranch(twice, '10', '904', 'he')).toMatchObject({ branch: { name: 'שלוחת ביתר עילית' } });
  });

  it('tells a number the list lacks from a bank the list does not cover', () => {
    expect(findBranch(LIST, '10', '1', 'he')).toEqual({ status: 'unknown' });
    expect(findBranch(LIST, '89', '1', 'he')).toEqual({ status: 'unlisted' });
  });

  it('reads the shipped copy of the list', () => {
    const list = snapshot as unknown as BranchList;
    expect(findBranch(list, '12', '532', 'en')).toMatchObject({ branch: { city: 'Tel Aviv - Yafo' } });
    expect(Object.values(list.banks).flat().length).toBeGreaterThan(1000);
  });
});

describe('branchListFromDatastore', () => {
  it("reads data.gov.il's answer into the same shape", () => {
    const body = {
      success: true,
      result: {
        records: [
          {
            Bank_Code: 10,
            Branch_Code: 614,
            Branch_Name: ' בנקאות  פרטית ',
            City: 'הרצלייה',
            Close_Date: '14/5/2026',
            Merge_Bank: null,
            Merge_Branch: 688,
          },
          { Bank_Code: 12, Branch_Code: 689, Branch_Name: 'ביצוע', City: 'לוד', Close_Date: '' },
          { Bank_Code: 'x', Branch_Code: 1 },
          null,
        ],
      },
    };
    expect(branchListFromDatastore(body, '2026-10-04')).toEqual({
      fetched: '2026-10-04',
      banks: {
        '10': [[614, 'בנקאות פרטית', 'הרצלייה', '', '', '2026-05-14', 10, 688]],
        '12': [[689, 'ביצוע', 'לוד', '', '', null, null, null]],
      },
    });
  });

  it('refuses an answer that is not the list', () => {
    expect(branchListFromDatastore(null, 'x')).toBeUndefined();
    expect(branchListFromDatastore({ result: {} }, 'x')).toBeUndefined();
    expect(branchListFromDatastore({ result: { records: [] } }, 'x')).toBeUndefined();
  });
});
