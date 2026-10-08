import type { Currency, IsoInstant, Kind, LocalDate, Minor, MoneySnapshot } from './money';

/** Shared payment methods use a sentinel: IndexedDB cannot index null. */
export const SHARED_OWNER = '*';

/**
 * Cash and cheques, which every install has and nobody should have to create.
 *
 * Deterministic ids for the same reason the built-in categories have them: it
 * is how a merge-import recognises the row it already has instead of adding a
 * second one. These are the payment methods that are not a thing the user
 * owns - there is no card to name, no account to distinguish - so they are
 * seeded, their labels follow the UI language, and they cannot be renamed or
 * deleted. They CAN be archived, exactly like a built-in category, for someone
 * who never carries cash or writes a cheque.
 */
export const CASH_METHOD_ID = 'pm.cash';
/** צ'ק: still how rent and a good deal of Israeli household spending are paid. */
export const CHEQUE_METHOD_ID = 'pm.cheque';

export function isBuiltinPaymentMethod(id: string): boolean {
  return id === CASH_METHOD_ID || id === CHEQUE_METHOD_ID;
}

/**
 * Whether a method is offered: not archived - and cash and cheques always,
 * whatever an older install or another device recorded about them.
 */
export function isActiveMethod(method: { readonly id: string; readonly isArchived: 0 | 1 }): boolean {
  return method.isArchived === 0 || isBuiltinPaymentMethod(method.id);
}

/** The merged view. A literal union with string collapses, so name the sentinel. */
export const ALL_PROFILES = 'all';

export type Profile = {
  readonly id: string;
  readonly name: string;
  /**
   * Legacy: the animal a profile was once drawn as. No longer written or shown
   * - a person is their account's picture or their initials - but old exports
   * and synced rows may still carry it.
   */
  readonly avatar?: string;
  /** Hex from the curated palette; unique across profiles. */
  readonly color: string;
  readonly openingBalanceMinor: Minor;
  /**
   * The spec had no currency here, so a reconvert would have to round-trip
   * base->base and lose a minor unit on every switch. Recording the origin
   * currency makes the opening balance recomputable like any transaction.
   */
  readonly openingBalanceCurrency: Currency;
  readonly openingBalanceDate: LocalDate;
  readonly createdAt: IsoInstant;
  /** Required for last-write-wins import merge. */
  readonly updatedAt: IsoInstant;
};

/**
 * Exactly one of nameKey/name, enforced by the type rather than by a comment.
 *
 * Built-in ids MUST be deterministic ("cat.groceries"), or every merge-import
 * between two installs produces a duplicate set of built-in categories.
 */
export type Category = {
  readonly id: string;
  readonly kind: Kind;
  readonly icon: string;
  readonly sortOrder: number;
  /** Numeric because IndexedDB cannot index booleans. */
  readonly isArchived: 0 | 1;
  readonly archivedAt?: IsoInstant;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
} & (
  | { readonly source: 'builtin'; readonly nameKey: string }
  | { readonly source: 'custom'; readonly name: string }
);

export type PaymentMethodType =
  | 'cash'
  /** צ'ק. Paid in one go or as a set of post-dated cheques, never as a standing order. */
  | 'cheque'
  | 'credit_card'
  | 'debit_card'
  | 'bank_transfer'
  /** הוראת קבע. Rent, arnona, insurance and the va'ad are all paid this way, and
   *  Israelis treat it as categorically different from a transfer they made. */
  | 'standing_order'
  | 'digital_wallet'
  /** חשבון בנק: where salaries arrive and cards, standing orders and loans are paid from. */
  | 'bank_account'
  | 'other';

/** An interest rate as a card company quotes it: prime plus a margin, or fixed. */
export type RateTerm =
  | { readonly basis: 'prime'; /** Signed decimal string: "1.5", "-0.5". */ readonly margin: string }
  | { readonly basis: 'fixed'; /** Annual, as a decimal string. */ readonly rate: string };

/** Who issued the card: חברת כרטיסי האשראי, which is who bills it. */
export type CardIssuer = 'isracard' | 'cal' | 'max' | 'amex' | 'diners' | 'other';

/** The network printed on it. Isracard is a local network of its own. */
export type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'diners' | 'isracard';

/**
 * A bank card (כרטיס בנקאי: issued through the bank, the bank is a party to
 * the credit) or a non-bank one (חוץ בנקאי: issued by the card company
 * directly, with its own credit terms and its own limit).
 */
export type CardKind = 'bank' | 'non_bank';

/**
 * What a card company shows about a credit card - everything but what would
 * identify or charge it.
 *
 * Never the card's number, the code from its back or a PIN: `gate:pci` fails the build on those names.
 * Its last four digits are kept - every card company and statement prints
 * them, and they identify and authorise nothing on their own.
 * The expiry is kept as a month only, the way it is printed, as a reminder of
 * when a new card is due - on its own it identifies and authorises nothing.
 *
 * Money in ILS minor units: an Israeli card bills in shekels.
 */
export type CardDetails = {
  readonly issuer?: CardIssuer;
  readonly network?: CardNetwork;
  readonly kind?: CardKind;
  /** The bank behind a bank card, or the account a non-bank card is debited from. */
  readonly bank?: string;
  /** Gold, Platinum, World Elite... as the card says it. */
  readonly tier?: string;
  /** The club or programme it belongs to: FLY CARD, Max Back, a supermarket club. */
  readonly club?: string;
  /**
   * Its last four digits, as the card company shows them: how a card is told
   * apart in the feed, and how a statement's rows find their card.
   */
  readonly lastDigits?: string;
  /** YYYY-MM. */
  readonly expiresMonth?: string;
  /**
   * The day of the month the bill is debited from the bank (מועד חיוב):
   * usually the 2nd, 10th or 15th. A month's purchases are charged together
   * on this day of the next month.
   */
  readonly billingDay?: number;
  /** מסגרת אשראי. */
  readonly creditLimitMinor?: number;
  /**
   * דמי כרטיס, a month. Charged on the card itself - a line on each month's
   * bill, worked out rather than typed (`cardFeeOccurrences`) - from
   * `feeSince`. Absent: the card has no fee, as many do not.
   */
  readonly monthlyFeeMinor?: number;
  /** YYYY-MM: the first month the fee is charged - when it was set, so entering it never bills the past. */
  readonly feeSince?: string;
  /**
   * A discount on the fee in any month the card is used for at least
   * `minSpendMinor`: often the whole fee (100%), usually for a year, sometimes
   * longer, sometimes for good.
   */
  readonly feeDiscount?: {
    readonly minSpendMinor: number;
    /** Percent off the fee: "100" waives it. */
    readonly percent: string;
    /** YYYY-MM: the last month it applies. Absent: no end. */
    readonly until?: string;
  };
  /**
   * עמלת עסקה במטבע חוץ: the percentage added to every purchase in a
   * currency other than the shekel. Snapshotted onto each purchase when it is
   * saved (`MoneySnapshot.feeRate`), like the exchange rate it rides on.
   */
  readonly fxFeeRate?: string;
  /**
   * The household's bank account the bill is debited from: a `bank_account`
   * payment method's id. `bank` keeps that bank's name, so the card still
   * reads right if the account is deleted.
   */
  readonly accountId?: string;
  /**
   * The card's קרדיט interest as prime plus this margin. When set, it is the
   * card's credit rate and `PaymentMethod.creditAnnualRate` is not read.
   */
  readonly creditPrimeMargin?: string;
  /** ריבית פיגורים: charged on a bill not paid in time. */
  readonly lateRate?: RateTerm;
  /**
   * The card's place in the built-in card catalog: card company, bank (Masav
   * code, or 'none' for a card not through a bank), tier and club, and the
   * catalog version it was last filled from. Linked cards follow the catalog
   * in every field the person has not changed (`overrides`).
   */
  readonly catalog?: CardCatalogLink;
  /** Only the rates the person changed from the catalog's. */
  readonly overrides?: Partial<Record<DealKind | ExtraRateKind, CardRateTerm>>;
};

export type CardCatalogLink = {
  readonly issuer: string;
  /** Masav code, or 'none': not through a bank. */
  readonly bank: string;
  readonly tier: string;
  readonly club?: string;
  readonly version: number;
  /** When a catalog update last changed this card. */
  readonly updatedOn?: LocalDate;
  /**
   * The values the catalog last wrote onto the card. A field still holding
   * its filled value is the catalog's: a relink or a later release replaces
   * it, or clears it when the catalog no longer gives one. A field the person
   * typed, or changed after it was filled, no longer matches, and is theirs.
   */
  readonly filled?: CatalogFilled;
};

/** The card fields the catalog fills, as it last filled them. */
export type CatalogFilled = {
  readonly fxFeeRate?: string;
  readonly monthlyFeeMinor?: number;
  readonly creditPrimeMargin?: string;
  readonly lateRate?: RateTerm;
};

/** A card's rate: a `RateTerm`, or the Bank of Israel rate plus a margin (fair-credit late interest). */
export type CardRateTerm = RateTerm | { readonly basis: 'boi'; readonly margin: string };

/**
 * Whose an account is: one person's, a joint account (a couple's, a family's),
 * or a business account held with partners.
 */
export type AccountHolding = 'personal' | 'joint' | 'business';

/**
 * A bank account as the bank writes it: bank, branch and account number
 * (12-689-123456), whose it is, and its overdraft limit.
 *
 * The account number is kept because it is how an account is told apart and
 * recognised on a statement - it is printed on every cheque and given to
 * anyone who sends money to it. It authorises nothing: no password, no code,
 * nothing that moves money is ever kept (§12).
 */
export type BankAccountDetails = {
  /** Masav bank code, digits: "12". */
  readonly bank: string;
  /** Branch number, digits: "689". */
  readonly branch?: string;
  /** Account number, digits only. */
  readonly number?: string;
  readonly holding: AccountHolding;
  /**
   * The household's people on a joint or business account: the method's
   * `profileId` is the one of them, or SHARED_OWNER when there are several -
   * and then it is offered to them and no one else. A personal account's
   * holder is its `profileId`, and this is absent.
   */
  readonly holders?: readonly string[];
  /** Holders outside the household, as typed: a business partner, a parent. */
  readonly otherHolders?: string;
  /** מסגרת עו״ש: how far below zero the bank lets it go, in ILS minor units. */
  readonly overdraftLimitMinor?: number;
};

export type PaymentMethod = {
  readonly id: string;
  /** SHARED_OWNER for household-wide methods. Never null: IndexedDB cannot index it. */
  readonly profileId: string;
  readonly type: PaymentMethodType;
  /** A user-chosen LABEL only. Never a number or any credential (§12). */
  readonly label: string;
  /**
   * The annual nominal interest this card charges on עסקת קרדיט, as a decimal
   * string ("12.5" is 12.5% a year).
   *
   * Stored on the CARD rather than typed per purchase, because that is what it
   * is a property of: it is printed on the statement, it is the same for every
   * קרדיט charged to that card, and re-entering it per transaction is how a
   * wrong one gets in. A string, like every other rate in this app, so what the
   * user typed round-trips without a float rewriting it.
   *
   * Not a credential and not a card detail - §12 is about numbers that identify
   * the card, and a rate identifies nothing.
   */
  readonly creditAnnualRate?: string;
  /** Credit cards only: billing day, issuer, fees and the rest. */
  readonly card?: CardDetails;
  /** Bank accounts only. */
  readonly account?: BankAccountDetails;
  readonly color?: string;
  readonly isArchived: 0 | 1;
  readonly archivedAt?: IsoInstant;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
};

/**
 * תשלומים versus קרדיט versus הלוואה.
 *
 * The first two are a purchase split over N monthly payments on a card.
 * תשלומים is interest-free and is what "3 תשלומים" on a shop sign means;
 * קרדיט is the same arrangement with interest, which the issuer adds and this
 * app does not model.
 *
 * A הלוואה is money borrowed and paid back the same way - N equal monthly
 * payments on a לוח שפיצר - from whatever pays it: a bank debit, post-dated
 * cheques to a relative, a card's own loan. Same shape, its own word, and
 * longer: a mortgage is 360 payments.
 */
export type InstallmentPlan = 'installments' | 'credit' | 'loan';

export type Recurrence =
  | { readonly type: 'one_time' }
  | {
      readonly type: 'monthly';
      /** 1-31, clamped per month. 31 means "last day of month". */
      readonly dayOfMonth: number;
      readonly endDate?: LocalDate;
      /**
       * How many payments the plan has. When set, the series has exactly this
       * many occurrences and they sum to the original total EXACTLY, with the
       * first absorbing the rounding remainder (Israeli card convention).
       */
      readonly installments?: number;
      /**
       * Which KIND of plan, which is a distinction Israeli cards make and no
       * amount of arithmetic can recover.
       *
       * תשלומים and קרדיט split a purchase the same way; the difference is that
       * קרדיט carries interest and תשלומים does not - a regular instalment plan
       * is a credit plan at zero interest. The app does not model the interest
       * itself (see README), so the stored split is identical either way, but
       * which one the user chose is theirs to see on the row rather than
       * something the app quietly forgets.
       *
       * Absent on rows written before the distinction existed, which are
       * תשלומים by construction: it was the only plan the form could make.
       */
      readonly plan?: InstallmentPlan;
      /**
       * The annual nominal rate this plan was priced with, as a decimal string.
       *
       * A SNAPSHOT, exactly like a transaction's exchange rate: the card's rate
       * can change next year, and a plan that silently re-priced itself would
       * make the feed disagree with the statement the user is holding. Only
       * meaningful alongside `plan: 'credit'` or `'loan'`; absent means
       * interest-free.
       */
      readonly creditAnnualRate?: string;
      /**
       * A loan priced at prime plus a margin, rather than at a fixed rate.
       * `creditAnnualRate` is still the rate it was priced at - prime on the
       * day, plus `primeMargin` - so nothing that reads a plan needs to know
       * what prime was.
       */
      readonly rateBasis?: 'prime';
      /** What the loan adds to prime, as a signed decimal string ("1.5", "-0.4"). */
      readonly primeMargin?: string;
      /**
       * A long קרדיט (קרדיט פלוס) whose rate follows prime from one payment
       * on: from `atPayment` the rate is the plan's rate plus however far
       * prime has moved since `primeAtPurchase` (Max: payment 19). Absent on
       * every plan that is fixed for its whole life, and on rows written before
       * it existed - an older app reads the plan as an ordinary fixed קרדיט.
       *
       * `rate`, `paymentMinor` and `frozen` are for once the reset payment's
       * date has passed: its rate and payment are then saved and never move.
       * `principalMinor` is what the plan borrowed, in its own currency, as the
       * schedule shown at saving priced it; absent on rows saved before it was
       * kept, which re-price from what their payments are worth.
       */
      readonly reset?: {
        readonly atPayment: number;
        readonly primeAtPurchase: string;
        readonly principalMinor?: number;
        readonly rate?: string;
        readonly paymentMinor?: number;
        readonly frozen?: true;
      };
    }
  | {
      readonly type: 'yearly';
      readonly month: number;
      readonly day: number;
      readonly endDate?: LocalDate;
    };

export type Transaction = {
  readonly id: string;
  readonly profileId: string;
  readonly kind: Kind;
  readonly categoryId: string;
  /** Expenses only. */
  readonly paymentMethodId?: string;
  readonly money: MoneySnapshot;
  readonly recurrence: Recurrence;
  /** First occurrence of the series. */
  readonly date: LocalDate;
  readonly note?: string;
  /**
   * A 30+ purchase (אשראי 30 פלוס): charged on the card's billing date after
   * next, a month late, with that month's interest already in its amount.
   * `rate` is the annual nominal rate it was priced at, snapshotted. Absent on
   * every ordinary purchase, and on every row written before it existed.
   */
  readonly deferral?: { readonly rate: string };

  // --- denormalised by materialize(); never written by hand ---
  /** === date */
  readonly seriesStart: LocalDate;
  /**
   * endDate ?? SERIES_MAX, WIDENED to cover any override that moves an
   * occurrence later. Without the widening, a series that ended in 2021 with an
   * occurrence moved into 2026 is never returned by the interval query, and the
   * moved-in fix below becomes dead code.
   */
  readonly seriesEnd: LocalDate;
  readonly isDeleted: 0 | 1;

  // --- split lineage ---
  readonly seriesRootId: string;
  readonly splitFromId?: string;
  readonly splitAtDate?: LocalDate;

  readonly deletedAt?: IsoInstant;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
};

/**
 * A per-occurrence edit.
 *
 * `patch.money` is an all-or-nothing MoneySnapshot: the spec's
 * `Partial<Pick<Transaction, 'amountMinor' | 'baseAmountMinor' | ...>>` allowed
 * patching the amount without the converted amount, after which every
 * calculator silently uses a stale base figure.
 *
 * `null` means "clear this field" - something Partial cannot express, which
 * made clearing a note or a payment method unrepresentable.
 */
export type OverridePatch = {
  readonly money?: MoneySnapshot;
  readonly categoryId?: string;
  readonly paymentMethodId?: string | null;
  readonly note?: string | null;
  /** Moves the occurrence off its slot. */
  readonly date?: LocalDate;
};

export type Override = {
  readonly id: string;
  readonly transactionId: string;
  /** The ORIGINAL slot date. The key, even when the occurrence has been moved. */
  readonly occurrenceDate: LocalDate;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
} & (
  | {
      readonly action: 'skip';
      /**
       * The edit this skip SUPERSEDED, kept so un-skipping is lossless.
       *
       * The unique `[transactionId+occurrenceDate]` index allows exactly one
       * override per slot, so skipping an occurrence the user had already
       * edited has to overwrite that row. Without somewhere to put the patch,
       * the edit is silently discarded and restoring gives back the series'
       * values instead of theirs - a data loss they neither asked for nor saw.
       *
       * Optional, because most skips supersede nothing.
       */
      readonly patch?: OverridePatch;
    }
  | { readonly action: 'modify'; readonly patch: OverridePatch }
);

/**
 * One emitted occurrence of a transaction.
 *
 * `originalDate` and `key` are additions to the spec's shape. Without
 * `originalDate` there is no way to find the Override row behind a moved
 * occurrence, so clicking it in the feed could not open the right editor.
 */
export type Occurrence = {
  /** The DB row identity when not overridden - preserved by reference for React.memo. */
  readonly transaction: Transaction;
  readonly seriesId: string;
  /** Effective date, after any move. */
  readonly date: LocalDate;
  /** The slot this occurrence came from; the Override lookup key. */
  readonly originalDate: LocalDate;
  /** Stable React key, unchanged across a move. */
  readonly key: string;
  readonly money: MoneySnapshot;
  readonly categoryId: string;
  readonly paymentMethodId?: string;
  readonly note?: string;
  readonly isOverridden: boolean;
  readonly isMoved: boolean;
  readonly isSkipped: boolean;
  /** Strictly date > today. Today's occurrences are NOT projected. */
  readonly isProjected: boolean;
};

/**
 * "This row was deleted, and whatever pointed at it now points at `to`."
 *
 * Written by the deletes that move dependent rows somewhere, and synced. A
 * device that went on USING the row while it was apart - a new expense filed
 * under a category someone else deleted - would otherwise be repaired to the
 * fallback, not to the replacement the person who deleted it chose.
 */
export type RedirectTable = 'categories' | 'paymentMethods' | 'profiles';

export type Redirect = {
  /** `${tbl}:${from}`: one redirect per deleted row. */
  readonly id: string;
  readonly tbl: RedirectTable;
  readonly from: string;
  /** null: references were cleared rather than moved. */
  readonly to: string | null;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
};

export function redirectId(tbl: RedirectTable, from: string): string {
  return `${tbl}:${from}`;
}

/** The kinds of purchase terms a card company offers; the card catalog's deal rules are keyed by these. */
export const DEAL_KINDS = [
  'regular',
  'installments',
  'credit',
  'long_credit',
  'deferred',
  'split_purchase',
] as const;
export type DealKind = (typeof DEAL_KINDS)[number];

/** Rates a card carries beyond its deals. */
export const EXTRA_RATE_KINDS = ['late', 'over_limit', 'cash'] as const;
export type ExtraRateKind = (typeof EXTRA_RATE_KINDS)[number];

export type Settings = {
  readonly id: 'singleton';
  readonly defaultCurrency: Currency;
  readonly language: 'en' | 'he';
  readonly theme: 'light' | 'dark' | 'system';
  /** A profile id, or ALL_PROFILES for the merged view. */
  readonly activeProfileId: string;
  readonly onboardingCompletedAt?: IsoInstant;
  readonly lastExportedAt?: IsoInstant;
  readonly updatedAt: IsoInstant;
};
