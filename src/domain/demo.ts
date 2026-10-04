import { exponentOf } from '@/lib/currency-meta';
import {
  addDays,
  addMonthsClamped,
  clampDay,
  compareLocal,
  daysBetween,
  makeLocalDate,
  parseLocalDate,
  startOfMonth,
} from '@/lib/dates';
import { convertMinor, crossRate } from '@/lib/money';
import type { AvatarKey, Override, PaymentMethod, Profile, Transaction } from '@/types/domain';
import { SHARED_OWNER } from '@/types/domain';
import type { Currency, IsoInstant, LocalDate, Minor, MoneySnapshot, RateString } from '@/types/money';

import { splitInstallments } from './calculators';
import { nextFreeColor, PROFILE_PALETTE } from './palette';

/**
 * Seeded demo data.
 *
 * Three properties make this more than a convenience fixture:
 *
 *  1. It is BYTE-STABLE. Every id is deterministic and every random choice comes
 *     from a seeded PRNG, so the same (seed, today, base) always produces the
 *     same rows. That is what lets the same generator serve as the Playwright
 *     fixture - an e2e suite seeded from `crypto.randomUUID()` output cannot
 *     assert on a specific row.
 *  2. It NEVER touches the network. Rates come from a committed table stamped
 *     `rateSource: 'demo'`. Fetching would break determinism and would trip the
 *     hermetic e2e guard (09-hermetic-guard asserts zero off-origin requests).
 *  3. Every row is IDENTIFIABLE. The spec silently mixed 60 untagged demo rows
 *     into the same database as real data, leaving "Clear all" as the only
 *     remedy. Here every id carries the `demo.` prefix, so removal is one
 *     prefix range-scan per table and the "Demo data" banner is one existence
 *     check.
 *
 * Pure by construction: no clock, no ids from outside, no DB. `src/db/demo.ts`
 * owns the writing.
 */

/** Every demo row's primary key starts with this. Removal scans the prefix. */
export const DEMO_PREFIX = 'demo.';

export const DEMO_SEED = 0x67_62_01;

export function isDemoRow(id: string): boolean {
  return id.startsWith(DEMO_PREFIX);
}

/**
 * mulberry32 - 32 bits of state, uniform output, no dependencies.
 *
 * Chosen over `Math.random()` for the obvious reason and over a crypto PRNG
 * because reproducibility is the entire point.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d_2b_79_f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const intBetween = (rng: () => number, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));

const pick = <T>(rng: () => number, items: readonly T[]): T => {
  const item = items[Math.floor(rng() * items.length)];
  // items is never empty at any call site, but the index type says it might be.
  if (item === undefined) throw new RangeError('pick() from an empty list');
  return item;
};

/**
 * Committed rates, quoted as 1 ILS = X.
 *
 * ILS is the authoring currency: the whole dataset is an Israeli household, and
 * the figures are only plausible if they start out as shekels. A user whose
 * base is USD gets the same household with the rent showing in dollars.
 *
 * Deliberately NOT fetched, and deliberately not real-time accurate - these are
 * stamped `rateSource: 'demo'` so nothing downstream mistakes them for a quote.
 */
export const DEMO_RATES: Readonly<Record<Currency, RateString>> = Object.freeze({
  ILS: '1',
  USD: '0.3275',
  EUR: '0.2794',
  GBP: '0.2404',
  JPY: '47.815',
  CHF: '0.2604',
  CAD: '0.4493',
  AUD: '0.4919',
  NZD: '0.542',
  SEK: '3.0851',
  NOK: '3.3012',
  DKK: '2.0862',
  PLN: '1.1823',
  CZK: '6.8611',
  HUF: '110.04',
  RON: '1.3902',
  BGN: '0.5463',
  ISK: '40.1188',
  TRY: '13.5913',
  RUB: '26.855',
  INR: '28.6563',
  CNY: '2.3318',
  KRW: '446.055',
  SGD: '0.4195',
  HKD: '2.5512',
  THB: '10.5783',
  PHP: '18.602',
  IDR: '5354.63',
  MYR: '1.3821',
  BRL: '1.7751',
  MXN: '6.0096',
  ZAR: '5.7804',
  AED: '1.2028',
  SAR: '1.2281',
  EGP: '15.8838',
  KWD: '0.10028',
});

/**
 * Demo data is offered only for currencies in the frozen table.
 *
 * Better to hide the button for XPF than to invent a rate, which is the same
 * `rateUsed = 1` failure the rest of the app exists to avoid.
 */
export function isDemoSupported(currency: Currency): boolean {
  return Object.hasOwn(DEMO_RATES, currency);
}

function demoRate(currency: Currency): RateString {
  const rate = DEMO_RATES[currency];
  if (rate === undefined) throw new RangeError(`No demo rate for ${currency}. Guard with isDemoSupported().`);
  return rate;
}

/**
 * Round a converted amount up to a whole major unit.
 *
 * Purely an AUTHORING nicety: rent that reads "$2,359.08" advertises that the
 * number came out of a converter. Integer modulo rather than a divide, so no
 * float ever touches a money value and `gate:money` stays honest.
 *
 * Amounts below ten major units keep their fraction - rounding a 4.90 coffee to
 * 5 would flatten the small end of the scatter chart into a single row.
 */
function roundToWholeMajor(minor: Minor, currency: Currency): Minor {
  const unit = 10 ** exponentOf(currency);
  if (unit === 1 || minor < unit * 10) return minor;
  const remainder = minor % unit;
  return remainder * 2 >= unit ? minor - remainder + unit : minor - remainder;
}

/** An ILS-authored figure, expressed natively in the user's base currency. */
function authored(ilsMinor: Minor, base: Currency): Minor {
  if (base === 'ILS') return ilsMinor;
  return roundToWholeMajor(convertMinor(ilsMinor, 'ILS', base, demoRate(base)), base);
}

/**
 * A domestic row: spent in the base currency, so the snapshot is an identity.
 *
 * `rateUsed: '1'` here is not the fabricated rate the spec fell back to - the
 * currencies genuinely match, which is exactly the case `convertMinor`
 * short-circuits.
 */
function baseMoney(amountMinor: Minor, base: Currency, on: LocalDate): MoneySnapshot {
  return {
    amountMinor,
    currency: base,
    baseCurrency: base,
    baseAmountMinor: amountMinor,
    rateUsed: '1',
    rateDate: on,
    rateSource: 'demo',
  };
}

/** The same, from a figure authored in shekels. */
function domesticMoney(ilsMinor: Minor, base: Currency, on: LocalDate): MoneySnapshot {
  return baseMoney(authored(ilsMinor, base), base, on);
}

/** A genuinely foreign purchase, so the feed has something to convert. */
function foreignMoney(amountMinor: Minor, from: Currency, base: Currency, on: LocalDate): MoneySnapshot {
  const rateUsed = crossRate(demoRate(from), demoRate(base));
  return {
    amountMinor,
    currency: from,
    baseCurrency: base,
    baseAmountMinor: convertMinor(amountMinor, from, base, rateUsed),
    rateUsed,
    rateDate: on,
    rateSource: 'demo',
  };
}

/** The first slot on or after `from` for a monthly series on `dayOfMonth`. */
function firstMonthlySlot(from: LocalDate, dayOfMonth: number): LocalDate {
  const { year, month } = parseLocalDate(from);
  const candidate = makeLocalDate(year, month, clampDay(year, month, dayOfMonth));
  return compareLocal(candidate, from) >= 0 ? candidate : addMonthsClamped(candidate, 1, dayOfMonth);
}

/** The first slot on or after `from` for a yearly series. */
function firstYearlySlot(from: LocalDate, month: number, day: number): LocalDate {
  const { year } = parseLocalDate(from);
  const candidate = makeLocalDate(year, month, clampDay(year, month, day));
  return compareLocal(candidate, from) >= 0
    ? candidate
    : makeLocalDate(year + 1, month, clampDay(year + 1, month, day));
}

/**
 * A transaction before `materialize()` has stamped the denormalised fields.
 *
 * Structurally identical to `db/materialize.ts`'s `TransactionDraft`, restated
 * here because `domain/` may not import `@/db/*` - the layering rule that keeps
 * this module testable without IndexedDB.
 */
export type DemoTransactionDraft = Omit<Transaction, 'seriesStart' | 'seriesEnd' | 'isDeleted'>;

export type DemoData = {
  readonly profiles: readonly Profile[];
  readonly paymentMethods: readonly PaymentMethod[];
  readonly transactions: readonly DemoTransactionDraft[];
  readonly overrides: readonly Override[];
};

export type DemoInput = {
  /** Required, never read from a clock - the whole dataset is relative to it. */
  readonly today: LocalDate;
  readonly baseCurrency: Currency;
  readonly now: IsoInstant;
  /** Names and notes are written into the rows; see STRINGS. */
  readonly language?: 'en' | 'he';
  readonly seed?: number;
  /**
   * Colours already spoken for, so the demo cannot take one twice.
   *
   * The demo arrives on the LAST step of the wizard, after the user has already
   * named themselves - and the first colour the wizard hands out is the first
   * colour in the palette, which is also the first colour the demo wanted.
   * Two profiles then share one, which is not cosmetic: colour uniqueness is
   * what the profile switcher, the avatars and the chart identify a profile by,
   * it is what caps the app at twelve profiles, and `validateEnvelope` rejects
   * a file that breaks it - so the app could write a backup it then refused to
   * restore.
   */
  readonly takenColors?: readonly string[];
};

/**
 * Demo copy.
 *
 * Names and notes are USER data, not UI chrome, so they are written into the
 * rows rather than resolved through i18n at render - a Hebrew speaker who
 * switches to English should still see the household they were shown.
 */
const STRINGS = {
  en: {
    people: ['Dana', 'Yossi', 'Household'],
    danaCard: 'Dana card',
    yossiCard: 'Yossi card',
    jointCard: 'Joint card',
    jointAccount: 'Joint account',
    accountBank: 'Bank Hapoalim',
    standingOrder: 'Bank standing order',
    noteRent: 'Rent',
    noteFridge: 'Fridge, 12 payments',
    noteOnline: 'Online order',
    noteLoan: 'Loan, final payment moved',
    noteFreelance: 'Freelance project',
  },
  he: {
    people: ['דנה', 'יוסי', 'משק בית'],
    danaCard: 'כרטיס דנה',
    yossiCard: 'כרטיס יוסי',
    jointCard: 'כרטיס משותף',
    jointAccount: 'החשבון המשותף',
    accountBank: 'בנק הפועלים',
    standingOrder: 'הוראת קבע',
    noteRent: 'שכר דירה',
    noteFridge: 'מקרר, 12 תשלומים',
    noteOnline: 'הזמנה מהאינטרנט',
    noteLoan: 'הלוואה, תשלום אחרון נדחה',
    noteFreelance: 'פרויקט פרילנס',
  },
} as const;

const P_DANA = `${DEMO_PREFIX}profile.dana`;
const P_YOSSI = `${DEMO_PREFIX}profile.yossi`;
const P_HOUSE = `${DEMO_PREFIX}profile.household`;

const PM_DANA = `${DEMO_PREFIX}pm.danaCard`;
const PM_YOSSI = `${DEMO_PREFIX}pm.yossiCard`;
const PM_JOINT = `${DEMO_PREFIX}pm.jointCard`;
const PM_STANDING = `${DEMO_PREFIX}pm.standingOrder`;
const PM_ACCOUNT = `${DEMO_PREFIX}pm.jointAccount`;
/** Seeded by `buildSeedPaymentMethods`, shared by every profile. */
const PM_CASH = 'pm.cash';

/**
 * Recurring commitments.
 *
 * Six standing orders, two salaries, two subscriptions and a yearly bill - the
 * shape of an actual Israeli household, and enough for "Expected monthly
 * expense" and the recurring-commitments list to have something to say.
 */
type DemoNoteKey = 'noteRent' | 'noteFridge' | 'noteOnline' | 'noteLoan' | 'noteFreelance';

type RecurringSeed = {
  readonly key: string;
  readonly profileId: string;
  readonly kind: 'income' | 'expense';
  readonly categoryId: string;
  readonly paymentMethodId?: string;
  readonly ils: Minor;
  readonly day: number;
  /** Set for yearly rows. */
  readonly month?: number;
  readonly note?: DemoNoteKey;
};

const RECURRING: readonly RecurringSeed[] = [
  { key: 'salary.dana', profileId: P_DANA, kind: 'income', categoryId: 'cat.salary', ils: 1_840_000, day: 9 },
  {
    key: 'salary.yossi',
    profileId: P_YOSSI,
    kind: 'income',
    categoryId: 'cat.salary',
    ils: 1_420_000,
    day: 1,
  },

  // prettier-ignore
  { key: 'rent', profileId: P_HOUSE, kind: 'expense', categoryId: 'cat.rent', paymentMethodId: PM_STANDING, ils: 720_000, day: 1, note: 'noteRent' },
  {
    key: 'daycare',
    profileId: P_HOUSE,
    kind: 'expense',
    categoryId: 'cat.education',
    paymentMethodId: PM_STANDING,
    ils: 195_000,
    day: 2,
  },
  {
    key: 'gym',
    profileId: P_YOSSI,
    kind: 'expense',
    categoryId: 'cat.health',
    paymentMethodId: PM_STANDING,
    ils: 24_900,
    day: 3,
  },
  {
    key: 'insurance',
    profileId: P_HOUSE,
    kind: 'expense',
    categoryId: 'cat.insurance',
    paymentMethodId: PM_STANDING,
    ils: 31_000,
    day: 5,
  },
  {
    key: 'internet',
    profileId: P_HOUSE,
    kind: 'expense',
    categoryId: 'cat.utilities',
    paymentMethodId: PM_STANDING,
    ils: 12_900,
    day: 11,
  },
  {
    key: 'stream',
    profileId: P_DANA,
    kind: 'expense',
    categoryId: 'cat.subscriptions',
    paymentMethodId: PM_DANA,
    ils: 4_490,
    day: 12,
  },
  {
    key: 'arnona',
    profileId: P_HOUSE,
    kind: 'expense',
    categoryId: 'cat.arnona',
    paymentMethodId: PM_STANDING,
    ils: 64_000,
    day: 15,
  },
  {
    key: 'electricity',
    profileId: P_HOUSE,
    kind: 'expense',
    categoryId: 'cat.utilities',
    paymentMethodId: PM_STANDING,
    ils: 41_000,
    day: 20,
  },
  {
    key: 'music',
    profileId: P_YOSSI,
    kind: 'expense',
    categoryId: 'cat.subscriptions',
    paymentMethodId: PM_YOSSI,
    ils: 1_990,
    day: 22,
  },
  // Day 31 is the "Last day of month" default. Non-sticky clamping makes it
  // land on 31/30/28 and RETURN to 31 - the behaviour nobody believes until
  // they see February in the feed.
  {
    key: 'buildingFee',
    profileId: P_HOUSE,
    kind: 'expense',
    categoryId: 'cat.buildingFee',
    paymentMethodId: PM_STANDING,
    ils: 18_000,
    day: 31,
  },
];

/** One yearly commitment, so the chart and the month cursor meet a spike. */
const YEARLY: readonly RecurringSeed[] = [
  {
    key: 'vehicleTest',
    profileId: P_HOUSE,
    kind: 'expense',
    categoryId: 'cat.transport',
    paymentMethodId: PM_JOINT,
    ils: 145_000,
    day: 15,
    month: 3,
  },
];

/** Everyday one-off spending, sampled from the seeded PRNG. */
const ONE_OFF_KINDS: readonly { categoryId: string; lo: Minor; hi: Minor; weight: number }[] = [
  { categoryId: 'cat.groceries', lo: 4_000, hi: 38_000, weight: 5 },
  { categoryId: 'cat.dining', lo: 3_500, hi: 22_000, weight: 4 },
  { categoryId: 'cat.transport', lo: 1_200, hi: 9_000, weight: 3 },
  { categoryId: 'cat.entertainment', lo: 4_000, hi: 18_000, weight: 2 },
  { categoryId: 'cat.shopping', lo: 6_000, hi: 45_000, weight: 2 },
  { categoryId: 'cat.health', lo: 3_000, hi: 25_000, weight: 1 },
  { categoryId: 'cat.otherExpense', lo: 2_000, hi: 12_000, weight: 1 },
];

const ONE_OFF_POOL: readonly (typeof ONE_OFF_KINDS)[number][] = ONE_OFF_KINDS.flatMap((k) =>
  Array.from({ length: k.weight }, () => k),
);

const ONE_OFF_COUNT = 52;

const SPENDERS: readonly { profileId: string; methods: readonly string[] }[] = [
  { profileId: P_DANA, methods: [PM_DANA, PM_CASH, PM_JOINT] },
  { profileId: P_YOSSI, methods: [PM_YOSSI, PM_CASH, PM_JOINT] },
  { profileId: P_HOUSE, methods: [PM_JOINT, PM_CASH] },
];

const AVATARS: readonly AvatarKey[] = ['fox', 'owl', 'bear'];
const COLORS = ['#16794a', '#0369a1', '#7e22ce'] as const;
/** ILS opening balances, converted to the user's base like everything else. */
const OPENING_ILS: readonly Minor[] = [1_240_000, 915_000, 300_000];

/**
 * Build the whole dataset.
 *
 * Pure: same inputs, byte-identical output. Nothing here reads a clock, calls
 * `newId()`, or touches IndexedDB.
 */
export function buildDemoData(input: DemoInput): DemoData {
  const { today, baseCurrency: base, now, seed = DEMO_SEED, language = 'en' } = input;
  if (!isDemoSupported(base)) {
    throw new RangeError(`Demo data is not available for ${base}. Guard with isDemoSupported().`);
  }

  const s = STRINGS[language];
  const rng = mulberry32(seed);
  const openingDate = startOfMonth(addMonthsClamped(today, -6));

  /*
   * The authored colour where it is free, the next palette colour where it is
   * not.
   *
   * Keeping the authored one whenever possible matters: on an empty database
   * the demo is byte-identical to what it has always been, so the screenshot
   * matrix does not move and the fixtures stay stable. It only shifts for the
   * user who already owns that colour - who is exactly the user it would have
   * collided with.
   */
  const taken = new Set(input.takenColors ?? []);
  const pickColor = (index: number): string => {
    const authoredColor = COLORS[index] ?? PROFILE_PALETTE[0].hex;
    // The palette can only run dry past twelve profiles, which the wizard caps
    // and the demo is never offered beyond; `repairIntegrity` is the net.
    const color = taken.has(authoredColor) ? (nextFreeColor([...taken]) ?? authoredColor) : authoredColor;
    taken.add(color);
    return color;
  };

  const profiles: Profile[] = [P_DANA, P_YOSSI, P_HOUSE].map((id, i) => ({
    id,
    name: s.people[i] ?? 'Demo',
    avatar: AVATARS[i] ?? 'fox',
    color: pickColor(i),
    openingBalanceMinor: authored(OPENING_ILS[i] ?? 0, base),
    openingBalanceCurrency: base,
    openingBalanceDate: openingDate,
    createdAt: now,
    updatedAt: now,
  }));

  /*
   * The three Israeli card companies, each billing on one of the usual days,
   * with the fees and prime-linked interest their statements quote - so the
   * Cards screen and the billing-day balance have something real to show.
   */
  const methodSeeds: readonly Pick<
    PaymentMethod,
    'id' | 'profileId' | 'type' | 'label' | 'card' | 'account'
  >[] = [
    {
      id: PM_DANA,
      profileId: P_DANA,
      type: 'credit_card',
      label: s.danaCard,
      card: {
        issuer: 'max',
        network: 'mastercard',
        kind: 'non_bank',
        bank: s.accountBank,
        accountId: PM_ACCOUNT,
        billingDay: 10,
        expiresMonth: '2029-04',
        creditLimitMinor: 1_500_000,
        monthlyFeeMinor: 1_490,
        feeSince: openingDate.slice(0, 7),
        // Free in any month the card is used for ₪3,000, for a year.
        feeDiscount: {
          minSpendMinor: 300_000,
          percent: '100',
          until: addMonthsClamped(today, 12).slice(0, 7),
        },
        fxFeeRate: '2.5',
        creditPrimeMargin: '3.5',
        lateRate: { basis: 'prime', margin: '8' },
      },
    },
    {
      id: PM_YOSSI,
      profileId: P_YOSSI,
      type: 'credit_card',
      label: s.yossiCard,
      card: {
        issuer: 'cal',
        network: 'visa',
        kind: 'bank',
        billingDay: 2,
        expiresMonth: '2028-11',
        creditLimitMinor: 1_200_000,
        fxFeeRate: '3',
        creditPrimeMargin: '4',
      },
    },
    {
      id: PM_JOINT,
      profileId: SHARED_OWNER,
      type: 'credit_card',
      label: s.jointCard,
      card: {
        issuer: 'isracard',
        network: 'isracard',
        kind: 'non_bank',
        bank: s.accountBank,
        accountId: PM_ACCOUNT,
        billingDay: 15,
        expiresMonth: '2030-01',
        creditLimitMinor: 2_500_000,
        monthlyFeeMinor: 990,
        feeSince: openingDate.slice(0, 7),
        fxFeeRate: '2.5',
        creditPrimeMargin: '3',
      },
    },
    // The couple's joint account, which both their cards' bills come out of. The number is made up.
    {
      id: PM_ACCOUNT,
      profileId: SHARED_OWNER,
      type: 'bank_account',
      label: s.jointAccount,
      account: {
        bank: '12',
        branch: '532',
        number: '345678',
        holding: 'joint',
        holders: [P_DANA, P_YOSSI],
        overdraftLimitMinor: 1_500_000,
      },
    },
    // הוראת קבע: how rent, arnona, insurance and the va'ad are actually paid.
    { id: PM_STANDING, profileId: SHARED_OWNER, type: 'standing_order', label: s.standingOrder },
  ];
  const paymentMethods: PaymentMethod[] = methodSeeds.map((m) => ({
    ...m,
    isArchived: 0,
    createdAt: now,
    updatedAt: now,
  }));

  const mkTx = (
    key: string,
    row: Omit<DemoTransactionDraft, 'id' | 'seriesRootId' | 'createdAt' | 'updatedAt'>,
  ): DemoTransactionDraft => {
    const id = `${DEMO_PREFIX}tx.${key}`;
    return { ...row, id, seriesRootId: id, createdAt: now, updatedAt: now };
  };

  const transactions: DemoTransactionDraft[] = [];
  const overrides: Override[] = [];

  const mkOverride = (key: string, o: Omit<Override, 'id' | 'createdAt' | 'updatedAt'>): void => {
    overrides.push({ ...o, id: `${DEMO_PREFIX}ov.${key}`, createdAt: now, updatedAt: now } as Override);
  };

  // --- recurring commitments ---------------------------------------------
  for (const r of RECURRING) {
    const date = firstMonthlySlot(openingDate, r.day);
    transactions.push(
      mkTx(r.key, {
        profileId: r.profileId,
        kind: r.kind,
        categoryId: r.categoryId,
        paymentMethodId: r.paymentMethodId,
        money: domesticMoney(r.ils, base, date),
        recurrence: { type: 'monthly', dayOfMonth: r.day },
        date,
        note: r.note ? s[r.note] : undefined,
      }),
    );
  }

  for (const y of YEARLY) {
    const month = y.month ?? 1;
    const date = firstYearlySlot(openingDate, month, y.day);
    transactions.push(
      mkTx(y.key, {
        profileId: y.profileId,
        kind: y.kind,
        categoryId: y.categoryId,
        paymentMethodId: y.paymentMethodId,
        money: domesticMoney(y.ils, base, date),
        recurrence: { type: 'yearly', month, day: y.day },
        date,
      }),
    );
  }

  // --- תשלומים: an interest-free instalment plan --------------------------
  // The FIRST occurrence absorbs the rounding remainder (the Israeli card
  // convention), expressed as an override on that one slot. This is the shape
  // the Phase 4 form will reuse: `expandOccurrences` emits a uniform amount, so
  // the odd agorot have to live somewhere addressable.
  const fridgeDate = firstMonthlySlot(addMonthsClamped(startOfMonth(today), -4), 8);
  const fridgeTotal = authored(359_000, base);
  const parts = splitInstallments(fridgeTotal, 12);
  const firstPart = parts[0] ?? fridgeTotal;
  const regularPart = parts[1] ?? fridgeTotal;

  transactions.push(
    mkTx('fridge', {
      profileId: P_HOUSE,
      kind: 'expense',
      categoryId: 'cat.shopping',
      paymentMethodId: PM_JOINT,
      money: baseMoney(regularPart, base, fridgeDate),
      recurrence: { type: 'monthly', dayOfMonth: 8, installments: 12 },
      date: fridgeDate,
      note: s.noteFridge,
    }),
  );
  if (firstPart !== regularPart) {
    mkOverride('fridge.first', {
      transactionId: `${DEMO_PREFIX}tx.fridge`,
      occurrenceDate: fridgeDate,
      action: 'modify',
      patch: { money: baseMoney(firstPart, base, fridgeDate) },
    });
  }

  // --- a finished loan whose last payment was taken late ------------------
  // Deliberate fixture for the pair of defects fixed in Phase 1: the series
  // ENDED two months ago, and an override moves its final occurrence past that
  // end. It only appears in the feed if `computeSeriesEnd` widens seriesEnd AND
  // `expandOccurrences` enumerates moved-in overrides. Miss either half and
  // this payment silently vanishes from the balance.
  const loanStart = firstMonthlySlot(openingDate, 25);
  const loanEnd = slotInMonth(addMonthsClamped(startOfMonth(today), -2), 25);
  const loanMoved = addDays(loanEnd, 20);

  transactions.push(
    mkTx('loan', {
      profileId: P_HOUSE,
      kind: 'expense',
      categoryId: 'cat.otherExpense',
      paymentMethodId: PM_STANDING,
      money: domesticMoney(110_000, base, loanStart),
      recurrence: { type: 'monthly', dayOfMonth: 25, endDate: loanEnd },
      date: loanStart,
      note: s.noteLoan,
    }),
  );
  mkOverride('loan.moved', {
    transactionId: `${DEMO_PREFIX}tx.loan`,
    occurrenceDate: loanEnd,
    action: 'modify',
    patch: { date: loanMoved },
  });

  // --- one-time rows ------------------------------------------------------
  const freelanceDate = addDays(today, -40);
  transactions.push(
    mkTx('freelance', {
      profileId: P_DANA,
      kind: 'income',
      categoryId: 'cat.freelance',
      money: domesticMoney(275_000, base, freelanceDate),
      recurrence: { type: 'one_time' },
      date: freelanceDate,
      note: s.noteFreelance,
    }),
  );

  const giftDate = addDays(today, -73);
  transactions.push(
    mkTx('gift', {
      profileId: P_YOSSI,
      kind: 'income',
      categoryId: 'cat.gift',
      money: domesticMoney(50_000, base, giftDate),
      recurrence: { type: 'one_time' },
      date: giftDate,
    }),
  );

  // One genuinely foreign purchase, so the feed has a rate to show and the
  // reconvert flow has something to re-derive.
  const foreignCurrency = base === 'USD' ? 'EUR' : 'USD';
  const onlineDate = addDays(today, -18);
  transactions.push(
    mkTx('online', {
      profileId: P_DANA,
      kind: 'expense',
      categoryId: 'cat.shopping',
      paymentMethodId: PM_DANA,
      money: foreignMoney(4_999, foreignCurrency, base, onlineDate),
      recurrence: { type: 'one_time' },
      date: onlineDate,
      note: s.noteOnline,
    }),
  );

  // --- everyday spending, seeded ------------------------------------------
  const span = daysBetween(openingDate, today);
  for (let i = 0; i < ONE_OFF_COUNT; i += 1) {
    const flavour = pick(rng, ONE_OFF_POOL);
    const spender = pick(rng, SPENDERS);
    const date = addDays(openingDate, intBetween(rng, 0, span));
    const ils = intBetween(rng, flavour.lo, flavour.hi);
    transactions.push(
      mkTx(`oneoff.${String(i).padStart(2, '0')}`, {
        profileId: spender.profileId,
        kind: 'expense',
        categoryId: flavour.categoryId,
        paymentMethodId: pick(rng, spender.methods),
        money: domesticMoney(ils, base, date),
        recurrence: { type: 'one_time' },
        date,
      }),
    );
  }

  // --- per-occurrence edits -----------------------------------------------
  const lastMonth = addMonthsClamped(startOfMonth(today), -1);

  // Away for the month, so the va'ad was not collected. Renders ghosted with a
  // one-tap Restore - without `includeSkipped` reaching a consumer, a skipped
  // occurrence is unreachable forever.
  mkOverride('buildingFee.skip', {
    transactionId: `${DEMO_PREFIX}tx.buildingFee`,
    occurrenceDate: slotInMonth(lastMonth, 31),
    action: 'skip',
  });

  // A hot month: the electricity bill came in well over the standing figure.
  const acDate = slotInMonth(lastMonth, 20);
  mkOverride('electricity.summer', {
    transactionId: `${DEMO_PREFIX}tx.electricity`,
    occurrenceDate: acDate,
    action: 'modify',
    patch: { money: domesticMoney(68_000, base, acDate) },
  });

  // Payday landed on a weekend, so the salary arrived a day early.
  const paydaySlot = slotInMonth(today, 9);
  mkOverride('salary.dana.moved', {
    transactionId: `${DEMO_PREFIX}tx.salary.dana`,
    occurrenceDate: paydaySlot,
    action: 'modify',
    patch: { date: slotInMonth(today, 8) },
  });

  transactions.sort((a, b) => compareLocal(a.date, b.date) || a.id.localeCompare(b.id));

  return { profiles, paymentMethods, transactions, overrides };
}

/** The slot for `day` inside the month `date` falls in, clamped to month length. */
function slotInMonth(date: LocalDate, day: number): LocalDate {
  const { year, month } = parseLocalDate(date);
  return makeLocalDate(year, month, clampDay(year, month, day));
}

/** Every built-in category id the generator references, for the integrity test. */
export const DEMO_CATEGORY_IDS: readonly string[] = [
  ...new Set([
    ...RECURRING.map((r) => r.categoryId),
    ...YEARLY.map((y) => y.categoryId),
    ...ONE_OFF_KINDS.map((k) => k.categoryId),
    'cat.shopping',
    'cat.freelance',
    'cat.gift',
    'cat.otherExpense',
  ]),
];
