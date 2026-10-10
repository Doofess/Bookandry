import { describe, expect, it } from 'vitest';

import { merchantHistory, putTransaction, type MerchantHistory } from '@/db/repos/transactions';
import { readRow, type FoundRow } from '@/domain/import-check';
import type { WireRow } from '@/domain/import-wire';
import { MONEY, wireRow } from '@/domain/test-factories';
import { defaultFormValues } from '@/domain/tx-form';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { Category, PaymentMethod, Profile } from '@/types/domain';
import type { IsoInstant, Kind, LocalDate } from '@/types/money';

import {
  applyBatch,
  buildReview,
  holderOfMethod,
  included,
  linkToCard,
  matchesImportKind,
  withImportKind,
  type ImportKind,
  type ReviewItem,
} from './review-items';

const TODAY = '2026-10-06' as LocalDate;
const NOW = '2026-10-06T00:00:00.000Z' as IsoInstant;
const item = (l4: string, over: Partial<ReviewItem> = {}): ReviewItem => {
  const found = readRow(wireRow({ l4 }), `r${l4}`, {
    file: 0,
    base: 'ILS',
    known: new Set(['ILS']),
    anchor: TODAY,
    today: TODAY,
  });
  return {
    id: found.id,
    found,
    values: { ...defaultFormValues({ profileId: 'p1', currency: 'ILS', today: TODAY }), kind: 'expense' },
    flags: [],
    ticked: true,
    confirmed: false,
    ...over,
  };
};
const card = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: 'visa',
  profileId: 'p2',
  type: 'credit_card',
  label: 'Visa',
  card: { lastDigits: '5555' },
  isArchived: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe('rows and the card they were charged to', () => {
  it('a card just added takes the rows its last four digits are printed beside, and their owner', () => {
    const [mine, other, settled] = linkToCard(
      [item('5555'), item('9999'), item('5555', { confirmed: true })],
      card(),
    );
    expect(mine?.values).toMatchObject({ paymentMethodId: 'visa', profileId: 'p2' });
    expect(other?.values?.paymentMethodId).toBe('');
    expect(settled?.values?.paymentMethodId).toBe('');
    // A household card leaves the row's person as it was.
    expect(linkToCard([item('5555')], card({ profileId: '*' }))[0]?.values?.profileId).toBe('p1');
    // An account, or a card with no digits, takes nothing.
    expect(linkToCard([item('5555')], card({ card: {} }))[0]?.values?.paymentMethodId).toBe('');
  });

  it("a statement's card takes its rows: by the digits in its header, else by its name", () => {
    const byDigits = item('', {});
    const header = {
      ...byDigits,
      found: { ...byDigits.found, statementCard: { label: 'Max', lastDigits: '5555' } },
    };
    expect(linkToCard([header], card())[0]?.values?.paymentMethodId).toBe('visa');
    // A statement that names its card but not its digits: the card of that name, digits or none.
    const byName = { ...byDigits, found: { ...byDigits.found, statementCard: { label: ' visa ' } } };
    expect(linkToCard([byName], card({ card: {} }))[0]?.values?.paymentMethodId).toBe('visa');
    expect(linkToCard([byName], card({ label: 'Cal' }))[0]?.values?.paymentMethodId).toBe('');
  });

  it('the batch "Paid with" leaves a row whose card its digits name', () => {
    const visa = card();
    const [named, plain] = applyBatch(
      [item('5555', { values: { ...item('5555').values!, paymentMethodId: 'visa' } }), item('')],
      { methodId: 'cash', profileId: 'p1' },
      [visa],
    );
    expect(named?.values?.paymentMethodId).toBe('visa');
    expect(plain?.values?.paymentMethodId).toBe('cash');
  });
});

describe('whose a row is', () => {
  it('the batch "For" answers a row nobody was named for, and leaves one the document named', () => {
    const waiting = item('', {
      values: { ...item('').values!, profileId: '' },
      flags: ['whose_unknown'],
      ticked: false,
    });
    const named = item('', { values: { ...item('').values!, profileId: 'p2' }, holder: 'p2' });
    const [answered, kept] = applyBatch([waiting, named], { methodId: '', profileId: 'p1' }, []);
    expect(answered).toMatchObject({ values: { profileId: 'p1' }, flags: [], ticked: true });
    expect(kept?.values?.profileId).toBe('p2');
  });

  it("a found card or account goes to whoever its file's rows were read as being of - when that is one person", () => {
    const of = (l4: string, holder?: string) => item(l4, holder === undefined ? {} : { holder });
    expect(holderOfMethod([of('5555', 'p2'), of('5555', 'p2')], 0, '5555')).toBe('p2');
    // Another card's rows do not count; a file read as two people's gives nobody.
    expect(holderOfMethod([of('5555', 'p2'), of('9999', 'p1')], 0, '5555')).toBe('p2');
    expect(holderOfMethod([of('5555', 'p2'), of('9999', 'p1')], 0, undefined)).toBeUndefined();
    expect(holderOfMethod([of('5555', 'p2'), of('5555')], 0, '5555')).toBeUndefined();
    expect(holderOfMethod([], 0, undefined)).toBeUndefined();
  });
});

describe('the review: business type and category', () => {
  const category = (id: string, kind: Kind = 'expense', over: Partial<Category> = {}): Category =>
    ({
      id,
      kind,
      icon: 'Circle',
      sortOrder: 0,
      isArchived: 0,
      source: 'builtin',
      nameKey: `categories:builtin.${id.slice(4)}`,
      createdAt: NOW,
      updatedAt: NOW,
      ...over,
    }) as Category;
  const CATEGORIES = [
    ...[
      'cat.dining',
      'cat.groceries',
      'cat.subscriptions',
      'cat.shopping',
      'cat.loans',
      'cat.currencyExchange',
      'cat.otherExpense',
    ].map((id) => category(id)),
    category('c.coffee', 'expense', { source: 'custom', name: 'Coffee' }),
    category('cat.refund', 'income'),
    category('cat.otherIncome', 'income'),
  ];
  const PROFILE = { id: 'p1', name: 'Dana' } as Profile;

  let rowId = 0;
  const found = (wire: Partial<WireRow>, extra: Partial<FoundRow> = {}): FoundRow => ({
    ...readRow(wireRow(wire), `r${String((rowId += 1))}`, {
      file: 0,
      base: 'ILS',
      known: new Set(['ILS']),
      anchor: TODAY,
      today: TODAY,
    }),
    ...extra,
  });

  const review = (
    rows: FoundRow[],
    history: (kind: Kind, d: string) => Promise<MerchantHistory> = () => Promise.resolve({}),
  ) =>
    buildReview(rows, {
      aliases: { categories: new Map([['c1', 'cat.groceries']]), methods: new Map() },
      categories: CATEGORIES,
      methods: [],
      profiles: [PROFILE],
      defaultProfileId: 'p1',
      defaultMethodId: '',
      base: 'ILS',
      today: TODAY,
      primeRate: '4.5',
      history,
    });
  /** Category, business type and its source, as the row will be saved ('' for none, as the form holds it). */
  const filed = (item: ReviewItem | undefined) => [
    item?.values?.categoryId,
    item?.values?.mcc,
    item?.values?.mccSource,
  ];

  it('files by the order of spec §3, one case per step', async () => {
    const items = await review(
      [
        // 1. A well-known name beats the business type - and a file's code is still kept.
        found({ m: 'Netflix' }, { fileMcc: '5411' }),
        // 2. The person's own choice for this merchant beats the business type.
        found({ m: 'Cafe Nero' }, { fileMcc: '5812' }),
        // 3. The business type.
        found({ m: 'Cafe Landwer' }, { fileMcc: '5812' }),
        // 4. The row's own words.
        found({ m: 'החזר הלוואה' }),
        // 5. Claude's category.
        found({ m: 'Something', cat: 'c1' }),
        // 6. Other.
        found({ m: 'Nothing known' }),
      ],
      (kind, d) => Promise.resolve(kind === 'expense' && d === 'Cafe Nero' ? { categoryId: 'c.coffee' } : {}),
    );
    expect(items.map(filed)).toEqual([
      ['cat.subscriptions', '5411', 'file'],
      ['c.coffee', '5812', 'file'],
      ['cat.dining', '5812', 'file'],
      ['cat.loans', '', ''],
      ['cat.groceries', '', ''],
      ['cat.otherExpense', '', ''],
    ]);
  });

  it('takes the sector, then history, then Claude, for the business type', async () => {
    const items = await review(
      [
        found({ m: 'A', sec: 'מסעדות' }),
        found({ m: 'B', mcc: '5999' }),
        found({ m: 'C', mcc: '5999', sec: 'שונות' }),
        // Claude's code for a name a rule knows, filing it elsewhere: dropped (Review Focus 2).
        found({ m: 'Netflix', mcc: '5411' }),
      ],
      (kind, d) => Promise.resolve(kind === 'expense' && d === 'B' ? { mcc: '5411' } : {}),
    );
    expect(items.map(filed)).toEqual([
      ['cat.dining', '5812', 'sector'],
      ['cat.groceries', '5411', 'history'],
      ['cat.shopping', '5999', 'ai'],
      ['cat.subscriptions', '', ''],
    ]);
  });

  it('leaves a broad sector to Claude, and a code that only falls through to Other to the later steps (final review C1, C2)', async () => {
    const items = await review([
      // "מזון וצריכה" gives no code: Claude's 5814 files the delivery under Dining, not Groceries.
      found({ m: 'FOODDASH DELIVERY', mcc: '5814', sec: 'מזון וצריכה' }),
      found({ m: 'מסעדת הפינה', sec: 'מסעדות, קפה וברים' }),
      // 9311 (tax payments) names no range: Claude's category wins, and the code is still kept.
      found({ m: 'ארנונה עיריית דוגמה', cat: 'c1' }, { fileMcc: '9311' }),
      // 6012 (financial institutions) does not beat the loan rule.
      found({ m: 'פירעון הלוואה' }, { fileMcc: '6012' }),
      // Nothing else known: Other, as before.
      found({ m: 'Somewhere' }, { fileMcc: '9311' }),
    ]);
    expect(items.map(filed)).toEqual([
      ['cat.dining', '5814', 'ai'],
      ['cat.dining', '5812', 'sector'],
      ['cat.groceries', '9311', 'file'],
      ['cat.loans', '6012', 'file'],
      ['cat.otherExpense', '9311', 'file'],
    ]);
  });

  it('gives income no business type, and keeps a refund a refund', async () => {
    const [refund] = await review([found({ m: 'Supermarket', a: '-50.00' }, { fileMcc: '5411' })]);
    expect(filed(refund)).toEqual(['cat.refund', '', '']);
  });

  it('reads history by the merchant printed another way, from the real walk', async () => {
    const handle: TestDb = freshDb();
    try {
      await putTransaction(handle.db, {
        id: 'w1',
        profileId: 'p1',
        kind: 'expense',
        categoryId: 'cat.dining',
        money: MONEY,
        date: TODAY,
        recurrence: { type: 'one_time' },
        seriesRootId: 'w1',
        note: 'WOLT *ORDER 8812',
        mcc: '5814',
        mccSource: 'ai',
        createdAt: NOW,
        updatedAt: NOW,
      });
      const [item] = await review([found({ m: 'Wolt order 1290' })], (kind, d) =>
        merchantHistory(handle.db, kind, d),
      );
      expect(filed(item)).toEqual(['cat.dining', '5814', 'history']);
    } finally {
      await handle.dispose();
    }
  });

  it('leaves a cash withdrawal out, saying why, whatever gave it 6011 - and never flags income (Review Focus 6)', async () => {
    const items = await review(
      [
        found({ m: 'משיכת מזומן', mcc: '6011' }),
        found({ m: 'כספומט', a: '200.00' }),
        found({ m: 'Bank cash', a: '300.00' }, { fileMcc: '6010' }),
        found({ m: 'משיכת מזומן', a: '-100.00', mcc: '6011' }),
      ],
      (kind, d) => Promise.resolve(kind === 'expense' && d === 'כספומט' ? { mcc: '6011' } : {}),
    );
    expect(items.map((i) => [i.flags.includes('cash_withdrawal'), i.ticked])).toEqual([
      [true, false],
      [true, false],
      [true, false],
      [false, true],
    ]);
    // Kept, it is an ordinary expense under Currency exchange, with its code.
    expect(filed(items[0])).toEqual(['cat.currencyExchange', '6011', 'ai']);
  });

  describe('expenses, income or both', () => {
    const MODES: readonly ImportKind[] = ['expense', 'income', 'both'];
    /** Which modes keep each row, by its name. */
    const keptIn = (items: readonly ReviewItem[]) =>
      Object.fromEntries(
        items.map((i) => [i.found.description, MODES.filter((mode) => matchesImportKind(i, mode))]),
      );

    it('keeps expenses and refunds with Expenses, the rest of income with Income, and all of it with Both', async () => {
      const items = await review([
        found({ m: 'Shufersal', a: '80.00' }),
        found({ m: 'Salary', k: 'i', a: '9000.00' }),
        // Money back on a card: a refund, so on the expense side.
        found({ m: 'Supermarket', a: '-50.00' }),
        // Cash out of an ATM is still an expense: kept, flagged, unticked.
        found({ m: 'משיכת מזומן', a: '200.00', mcc: '6011' }),
      ]);
      expect(items.map((i) => [i.values?.kind, i.values?.categoryId])).toEqual([
        ['expense', 'cat.otherExpense'],
        ['income', 'cat.otherIncome'],
        ['income', 'cat.refund'],
        ['expense', 'cat.currencyExchange'],
      ]);
      expect(keptIn(items)).toEqual({
        Shufersal: ['expense', 'both'],
        Salary: ['income', 'both'],
        Supermarket: ['expense', 'both'],
        'משיכת מזומן': ['expense', 'both'],
      });
      expect(items[3]?.flags).toContain('cash_withdrawal');
    });

    it('goes by the row as it is now: an income moved into Refunds joins the expenses, and one moved out leaves', async () => {
      const [salary, refund] = await review([
        found({ m: 'Salary', k: 'i', a: '9000.00' }),
        found({ m: 'Supermarket', a: '-50.00' }),
      ]);
      if (salary?.values === undefined || refund?.values === undefined) throw new Error('no values');
      const filedAsRefund = { ...salary, values: { ...salary.values, categoryId: 'cat.refund' } };
      const refiled = { ...refund, values: { ...refund.values, categoryId: 'cat.otherIncome' } };
      expect(keptIn([filedAsRefund, refiled])).toEqual({
        Salary: ['expense', 'both'],
        Supermarket: ['income', 'both'],
      });
    });

    it('reads a row with nothing to save yet by the kind it was read as', async () => {
      const [salary] = await review([found({ m: 'Salary', k: 'i', a: '9000.00' })]);
      if (salary === undefined) throw new Error('no row');
      expect(keptIn([{ ...salary, values: undefined }])).toEqual({ Salary: ['income', 'both'] });
    });

    it('switching: a row that leaves is unticked, one that comes in is ticked as first read, one that stays keeps its tick', async () => {
      const read = await review([
        found({ m: 'Shufersal', a: '80.00' }),
        found({ m: 'Paz', a: '120.00' }),
        found({ m: 'Salary', k: 'i', a: '9000.00' }),
        found({ m: 'משיכת מזומן', a: '200.00', mcc: '6011' }),
      ]);
      const ticks = (items: readonly ReviewItem[]) => items.map((i) => i.ticked);
      // As read, Expenses: the salary is left out, unticked.
      const expenses = withImportKind(read, 'both', 'expense');
      expect(ticks(expenses)).toEqual([true, true, false, false]);
      // The person unticks Paz; to Both, Paz stays unticked and the salary comes in ticked.
      const unticked = expenses.map((i) => (i.found.description === 'Paz' ? { ...i, ticked: false } : i));
      expect(ticks(withImportKind(unticked, 'expense', 'both'))).toEqual([true, false, true, false]);
      // To Income: every expense leaves, the cash withdrawal included.
      expect(ticks(withImportKind(unticked, 'expense', 'income'))).toEqual([false, false, true, false]);
      // Back to Expenses: what comes back is ticked as first read - the withdrawal still waits.
      const income = withImportKind(unticked, 'expense', 'income');
      expect(ticks(withImportKind(income, 'income', 'expense'))).toEqual([true, true, false, false]);
      // Staying put unticks what is left out - a row ticked by hand, then hidden again.
      const handPicked = expenses.map((i) => (i.found.description === 'Salary' ? { ...i, ticked: true } : i));
      expect(ticks(withImportKind(handPicked, 'expense', 'expense'))).toEqual([true, true, false, false]);
      // Nothing else about a row changes.
      expect(withImportKind(read, 'both', 'income').map((i) => i.values)).toEqual(read.map((i) => i.values));
    });

    it('adds a left-out row only while it is on show and ticked', async () => {
      const [salary] = await review([found({ m: 'Salary', k: 'i', a: '9000.00' })]);
      if (salary === undefined) throw new Error('no row');
      expect(included(salary, 'expense', false)).toBe(false);
      expect(included(salary, 'expense', true)).toBe(true);
      expect(included({ ...salary, ticked: false }, 'expense', true)).toBe(false);
      expect(included(salary, 'income', false)).toBe(true);
    });
  });
});
