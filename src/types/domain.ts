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

/** The merged view. A literal union with string collapses, so name the sentinel. */
export const ALL_PROFILES = 'all';

export type AvatarKey =
  | 'fox'
  | 'cat'
  | 'panda'
  | 'owl'
  | 'frog'
  | 'koala'
  | 'penguin'
  | 'bear'
  | 'bunny'
  | 'sloth'
  | 'whale'
  | 'hedgehog'
  | 'otter'
  | 'duck'
  | 'monkey'
  | 'robot';

export type Profile = {
  readonly id: string;
  readonly name: string;
  readonly avatar: AvatarKey;
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
  | 'other';

export type PaymentMethod = {
  readonly id: string;
  /** SHARED_OWNER for household-wide methods. Never null: IndexedDB cannot index it. */
  readonly profileId: string;
  readonly type: PaymentMethodType;
  /** A user-chosen LABEL only. Never a number, expiry or any credential (§12). */
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
