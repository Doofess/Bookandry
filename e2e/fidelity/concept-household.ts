/**
 * The concept's household, as a backup the app restores.
 *
 * money-sheets-bold-v2.html draws Daniel and Noa on Friday 9 October 2026: four
 * bank accounts and cash, five cards, ten categories this month. The fidelity
 * harness compares the app with that page, so the app gets the same household,
 * restored through its own export and import (no test hook), as
 * e2e/10-feed-scale.spec.ts does.
 *
 * Plain JSON on purpose: e2e has no '@' alias, and the app's own schema checks
 * every row when it is restored (and in src/db/concept-household.test.ts).
 *
 * The figures the concept shows and this household reproduces exactly: the
 * balance ₪58,555; October so far ₪23,900 in and ₪14,362 out, left ₪9,538; the
 * ten categories; bills of ₪4,237 on the 2nd (Isracard, Diners, charged),
 * ₪2,829 on the 10th (Max, Amex) and ₪1,876 on the 15th (Cal), ₪8,942 in all;
 * ₪1,830 cash counted on the 6th; 128 rows this month. Every recurring income
 * lands on or before the 9th, so October has no projected row and the
 * transactions sheet opens on today, as the concept's does: 2 rows today,
 * 3 yesterday, 3 on Wednesday the 7th.
 */

type Row = Record<string, unknown>;

export type Envelope = {
  readonly defaultCurrency: string;
  readonly counts: Record<string, number>;
  readonly settings: Record<string, unknown>;
  readonly data: {
    readonly profiles: readonly Row[];
    readonly categories: readonly Row[];
    readonly paymentMethods: readonly Row[];
    readonly transactions: readonly Row[];
    readonly overrides: readonly Row[];
    readonly cashMoves?: readonly Row[];
  };
  readonly [key: string]: unknown;
};

export const CONCEPT_TODAY = '2026-10-09';
/** ₪58,555: opening ₪26,604 plus everything settled since 1 September (₪31,951). */
export const CONCEPT_BALANCE_MINOR = 5_855_500;

export const PEOPLE = { daniel: 'concept.daniel', noa: 'concept.noa' } as const;
export const ACCOUNTS = {
  leumi: 'concept.acct.leumi',
  discount: 'concept.acct.discount',
  mizrahi: 'concept.acct.mizrahi',
  hapoalim: 'concept.acct.hapoalim',
} as const;
export const CARDS = {
  isracard: 'concept.card.isracard',
  max: 'concept.card.max',
  cal: 'concept.card.cal',
  diners: 'concept.card.diners',
  amex: 'concept.card.amex',
} as const;
const STANDING = 'concept.pm.standing';
const SHARED = '*';
const AT = '2026-09-01T06:00:00.000Z';
const OPENED = '2026-09-01';
const SERIES_MAX = '9999-12-31';

/** `total` agorot in `count` whole parts, the first taking the remainder. */
function parts(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => (i === 0 ? total - base * (count - 1) : base));
}

function profile(id: string, name: string, color: string, openingMinor: number): Row {
  return {
    id,
    name,
    color,
    openingBalanceMinor: openingMinor,
    openingBalanceCurrency: 'ILS',
    openingBalanceDate: OPENED,
    createdAt: AT,
    updatedAt: AT,
  };
}

function account(
  id: string,
  profileId: string,
  bank: string,
  label: string,
  holders?: readonly string[],
): Row {
  return {
    id,
    profileId,
    type: 'bank_account',
    label,
    account: {
      bank,
      branch: '800',
      number: '1234567',
      holding: holders === undefined ? 'personal' : 'joint',
      ...(holders === undefined ? {} : { holders }),
    },
    isArchived: 0,
    createdAt: AT,
    updatedAt: AT,
  };
}

function card(
  id: string,
  profileId: string,
  issuer: string,
  network: string,
  lastDigits: string,
  billingDay: number,
  label: string,
  accountId: string,
): Row {
  return {
    id,
    profileId,
    type: 'credit_card',
    label,
    card: { issuer, network, kind: 'non_bank', lastDigits, billingDay, accountId },
    isArchived: 0,
    createdAt: AT,
    updatedAt: AT,
  };
}

type TxInput = {
  readonly profile: string;
  readonly kind: 'income' | 'expense';
  readonly category: string;
  readonly minor: number;
  readonly date: string;
  readonly method?: string;
  readonly destination?: string;
  readonly note: string;
  /** Monthly on this day, from `date` on. */
  readonly monthly?: number;
};

const OWNER: Record<string, string> = {
  [CARDS.isracard]: PEOPLE.daniel,
  [CARDS.max]: PEOPLE.daniel,
  [CARDS.cal]: PEOPLE.noa,
  [CARDS.diners]: PEOPLE.noa,
  [CARDS.amex]: PEOPLE.daniel,
};
const CARD_ORDER = [CARDS.isracard, CARDS.max, CARDS.cal, CARDS.diners, CARDS.amex] as const;

/** October's ten categories, less the rows drawn one by one below, spread over the 1st to the 6th. */
const OCTOBER_FILL: readonly {
  readonly category: string;
  readonly minor: number;
  readonly count: number;
  readonly notes: readonly string[];
}[] = [
  {
    category: 'cat.groceries',
    minor: 284_000 - 41_260 - 63_815,
    count: 46,
    notes: ['שופרסל אקספרס', 'יוחננוף', 'ויקטורי', 'טיב טעם'],
  },
  {
    category: 'cat.dining',
    minor: 121_500 - 5_800 - 3_200,
    count: 23,
    notes: ['קפה גרג', 'מסעדת הדסון', 'וולט', 'בורגרים'],
  },
  { category: 'cat.kids', minor: 112_000, count: 8, notes: ['צהרון', 'חוג שחייה', 'טויס אר אס'] },
  { category: 'cat.transport', minor: 96_000 - 28_640, count: 12, notes: ['רב-קו', 'סונול', 'גט טקסי'] },
  { category: 'cat.utilities', minor: 84_000 - 41_200, count: 2, notes: ['תאגיד המים', 'סופרגז'] },
  { category: 'cat.shopping', minor: 72_800, count: 10, notes: ['זארה', 'איקאה', 'KSP'] },
  { category: 'cat.health', minor: 46_000, count: 5, notes: ['סופר-פארם', 'מכבי'] },
  { category: 'cat.subscriptions', minor: 38_900 - 5_490, count: 6, notes: ['ספוטיפיי', 'דיסני+', 'iCloud'] },
  { category: 'cat.entertainment', minor: 21_000, count: 4, notes: ['סינמה סיטי', 'הבימה'] },
];

export function conceptHousehold(base: Envelope): Envelope {
  if (base.defaultCurrency !== 'ILS') {
    throw new Error(`The concept household is in ILS; the app's base is ${base.defaultCurrency}.`);
  }

  let serial = 0;
  const tx = (input: TxInput): Row => {
    serial += 1;
    // A series sorts after the one-off rows of its day (`m` after the digits), as the concept lists them.
    const id = `concept.tx.${input.monthly === undefined ? '' : 'm'}${String(serial).padStart(3, '0')}`;
    return {
      id,
      profileId: input.profile,
      kind: input.kind,
      categoryId: input.category,
      ...(input.method === undefined ? {} : { paymentMethodId: input.method }),
      ...(input.destination === undefined ? {} : { destinationId: input.destination }),
      money: {
        amountMinor: input.minor,
        currency: 'ILS',
        baseCurrency: 'ILS',
        baseAmountMinor: input.minor,
        rateUsed: '1',
        rateDate: input.date,
        rateSource: 'manual',
      },
      recurrence:
        input.monthly === undefined ? { type: 'one_time' } : { type: 'monthly', dayOfMonth: input.monthly },
      date: input.date,
      note: input.note,
      seriesStart: input.date,
      seriesEnd: input.monthly === undefined ? input.date : SERIES_MAX,
      isDeleted: 0,
      seriesRootId: id,
      createdAt: AT,
      updatedAt: AT,
    };
  };

  const profiles = [
    // Opening ₪26,604 in all on 1 September; the rest of the ₪58,555 is the flows below.
    profile(PEOPLE.daniel, 'דניאל', '#16794a', 1_460_400),
    profile(PEOPLE.noa, 'נועה', '#0f766e', 1_200_000),
  ];

  const builtinMethods = base.data.paymentMethods.filter(
    (m) => m['id'] === 'pm.cash' || m['id'] === 'pm.cheque',
  );
  const paymentMethods = [
    ...builtinMethods,
    account(ACCOUNTS.leumi, SHARED, '10', 'עו״ש משותף', [PEOPLE.daniel, PEOPLE.noa]),
    account(ACCOUNTS.discount, PEOPLE.noa, '11', 'החשבון של נועה'),
    account(ACCOUNTS.mizrahi, SHARED, '20', 'חיסכון לילדים', [PEOPLE.daniel, PEOPLE.noa]),
    account(ACCOUNTS.hapoalim, PEOPLE.daniel, '12', 'החשבון של דניאל'),
    card(
      CARDS.isracard,
      PEOPLE.daniel,
      'isracard',
      'isracard',
      '4821',
      2,
      'ישראכרט פלטינום',
      ACCOUNTS.hapoalim,
    ),
    card(CARDS.max, SHARED, 'max', 'mastercard', '0937', 10, 'מקס משותף', ACCOUNTS.leumi),
    card(CARDS.cal, PEOPLE.noa, 'cal', 'visa', '3306', 15, 'כאל', ACCOUNTS.discount),
    card(CARDS.diners, PEOPLE.noa, 'diners', 'diners', '7712', 2, 'דיינרס', ACCOUNTS.discount),
    card(CARDS.amex, PEOPLE.daniel, 'amex', 'amex', '1009', 10, 'אמריקן אקספרס זהב', ACCOUNTS.leumi),
    {
      id: STANDING,
      profileId: SHARED,
      type: 'standing_order',
      label: 'הוראת קבע, לאומי',
      isArchived: 0,
      createdAt: AT,
      updatedAt: AT,
    },
  ];

  const transactions: Row[] = [
    // Every month from September, all on or before the 9th: ₪23,900 in each month.
    tx({
      profile: PEOPLE.daniel,
      kind: 'income',
      category: 'cat.salary',
      minor: 1_375_000,
      date: '2026-09-01',
      destination: ACCOUNTS.hapoalim,
      note: 'משכורת, דניאל',
      monthly: 1,
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'income',
      category: 'cat.otherIncome',
      minor: 45_000,
      date: '2026-09-03',
      destination: ACCOUNTS.leumi,
      note: 'שכירות חניה',
      monthly: 3,
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'income',
      category: 'cat.otherIncome',
      minor: 34_000,
      date: '2026-09-05',
      destination: ACCOUNTS.mizrahi,
      note: 'קצבת ילדים',
      monthly: 5,
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'income',
      category: 'cat.salary',
      minor: 936_000,
      date: '2026-09-07',
      destination: ACCOUNTS.discount,
      note: 'משכורת, נועה',
      monthly: 7,
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.rent',
      minor: 560_000,
      date: '2026-09-01',
      method: STANDING,
      note: 'שכר דירה',
      monthly: 1,
    }),

    // September on the cards: October's bills.
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.health',
      minor: 121_400,
      date: '2026-09-12',
      method: CARDS.isracard,
      note: 'סופר-פארם',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.groceries',
      minor: 200_000,
      date: '2026-09-20',
      method: CARDS.isracard,
      note: 'שופרסל דיל',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.dining',
      minor: 14_000,
      date: '2026-09-14',
      method: CARDS.max,
      note: 'קפה גרג',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.shopping',
      minor: 200_000,
      date: '2026-09-22',
      method: CARDS.max,
      note: 'איקאה',
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'expense',
      category: 'cat.transport',
      minor: 37_600,
      date: '2026-09-11',
      method: CARDS.cal,
      note: 'פז',
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'expense',
      category: 'cat.groceries',
      minor: 150_000,
      date: '2026-09-25',
      method: CARDS.cal,
      note: 'רמי לוי',
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'expense',
      category: 'cat.shopping',
      minor: 22_300,
      date: '2026-09-16',
      method: CARDS.diners,
      note: 'סטימצקי',
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'expense',
      category: 'cat.health',
      minor: 80_000,
      date: '2026-09-26',
      method: CARDS.diners,
      note: 'מכבי',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.subscriptions',
      minor: 5_490,
      date: '2026-09-08',
      method: CARDS.amex,
      note: 'נטפליקס',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.entertainment',
      minor: 63_410,
      date: '2026-09-18',
      method: CARDS.amex,
      note: 'אל על',
    }),

    // October's rows the concept draws by name.
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.groceries',
      minor: 41_260,
      date: '2026-10-09',
      method: CARDS.isracard,
      note: 'שופרסל דיל',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.dining',
      minor: 5_800,
      date: '2026-10-09',
      method: CARDS.max,
      note: 'ארומה',
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'expense',
      category: 'cat.transport',
      minor: 28_640,
      date: '2026-10-08',
      method: CARDS.cal,
      note: 'פז',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.subscriptions',
      minor: 5_490,
      date: '2026-10-08',
      method: CARDS.amex,
      note: 'נטפליקס',
    }),
    // Where the concept draws its ATM withdrawal (a cash move here, which the feed does not list): a row, so the days line up.
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.dining',
      minor: 3_200,
      date: '2026-10-08',
      method: CARDS.max,
      note: 'קפה ג׳ו',
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'expense',
      category: 'cat.groceries',
      minor: 63_815,
      date: '2026-10-07',
      method: CARDS.diners,
      note: 'רמי לוי',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.utilities',
      minor: 41_200,
      date: '2026-10-07',
      method: STANDING,
      note: 'חברת החשמל',
    }),
  ];

  // The rest of October, on the cards, 1st to 6th: 116 rows. With the 7 above and the 5 monthly, October has 128.
  let n = 0;
  for (const fill of OCTOBER_FILL) {
    parts(fill.minor, fill.count).forEach((minor, i) => {
      const method = CARD_ORDER[n % CARD_ORDER.length] ?? CARDS.isracard;
      transactions.push(
        tx({
          profile: OWNER[method] ?? PEOPLE.daniel,
          kind: 'expense',
          category: fill.category,
          minor,
          date: `2026-10-0${String((n % 6) + 1)}`,
          method,
          note: fill.notes[i % fill.notes.length] ?? fill.category,
        }),
      );
      n += 1;
    });
  }

  const cashMoves: Row[] = [
    {
      id: 'concept.cash.start.daniel',
      profileId: PEOPLE.daniel,
      kind: 'start',
      amountMinor: 83_000,
      date: '2026-10-01',
    },
    {
      id: 'concept.cash.start.noa',
      profileId: PEOPLE.noa,
      kind: 'start',
      amountMinor: 50_000,
      date: '2026-10-01',
    },
    {
      id: 'concept.cash.count.daniel',
      profileId: PEOPLE.daniel,
      kind: 'count',
      amountMinor: 0,
      date: '2026-10-06',
    },
    {
      id: 'concept.cash.count.noa',
      profileId: PEOPLE.noa,
      kind: 'count',
      amountMinor: 0,
      date: '2026-10-06',
    },
    {
      id: 'concept.cash.withdraw',
      profileId: PEOPLE.daniel,
      kind: 'withdraw',
      amountMinor: 50_000,
      date: '2026-10-08',
      accountId: ACCOUNTS.leumi,
    },
  ].map((move) => ({ ...move, isDeleted: 0, createdAt: AT, updatedAt: AT }));

  const data = {
    profiles,
    categories: base.data.categories,
    paymentMethods,
    transactions,
    overrides: [],
    cashMoves,
  };
  return {
    ...base,
    settings: {
      ...base.settings,
      defaultCurrency: 'ILS',
      language: 'he',
      theme: 'system',
      activeProfileId: 'all',
    },
    counts: {
      profiles: data.profiles.length,
      categories: data.categories.length,
      paymentMethods: data.paymentMethods.length,
      transactions: data.transactions.length,
      overrides: 0,
      cashMoves: data.cashMoves.length,
    },
    data,
  };
}
