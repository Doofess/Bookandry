import { z } from 'zod';

import { isLocalDate } from '@/lib/dates';
import { normalizeAnnualRate, normalizeRateMargin } from '@/lib/money';
import { DEAL_KINDS, EXTRA_RATE_KINDS, SHARED_OWNER } from '@/types/domain';

import { isExpiresMonth } from './cards';
import { MCC_SHAPE } from './mcc';

/**
 * The export document format.
 *
 * `schemaVersion` versions THIS JSON shape and is a different counter from
 * `db.version(n)`, which versions the IndexedDB store layout. A pure index
 * addition bumps the DB version without changing the document at all, so
 * conflating them would force meaningless document migrations. They diverge,
 * and that is expected.
 */
export const CURRENT_DOC_VERSION = 1;

const localDate = z.string().refine(isLocalDate, {
  message: 'Expected a calendar date as YYYY-MM-DD',
});

const isoInstant = z.string().min(20);
const currency = z.string().regex(/^[A-Z]{3}$/, 'Expected a 3-letter ISO 4217 code');

/**
 * Money is validated as integers, never coerced.
 *
 * `z.coerce.number()` would happily accept "12.5" and yield a non-integer,
 * which is exactly the float-in-the-ledger defect the whole money layer exists
 * to prevent.
 */
const moneySchema = z.object({
  // The > 0 invariant: `kind` carries the sign, never the number.
  amountMinor: z.number().int().positive().max(1e15),
  currency,
  baseCurrency: currency,
  // May legitimately be 0: a single yen converts to less than a cent.
  baseAmountMinor: z.number().int().nonnegative().max(1e15),
  rateUsed: z.string().min(1),
  rateDate: localDate,
  rateSource: z.enum(['frankfurter', 'erapi', 'manual', 'demo']),
  feeRate: z
    .string()
    .refine((value) => normalizeAnnualRate(value) === value, 'not a fee rate')
    .optional(),
});

/**
 * An annual interest rate, held to the same rule the form and the repository
 * use. A file is just another caller: "1e1" arriving by import would be priced
 * by nothing and displayed as nonsense.
 */
const annualRate = z.string().refine((value) => normalizeAnnualRate(value) === value, 'not an annual rate');

const recurrenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('one_time') }),
  z.object({
    type: z.literal('monthly'),
    dayOfMonth: z.number().int().min(1).max(31),
    endDate: localDate.optional(),
    installments: z.number().int().min(1).max(360).optional(),
    // Absent on files written before the distinction existed; those rows are
    // תשלומים by construction, because it was the only plan the form could make.
    plan: z.enum(['installments', 'credit', 'loan']).optional(),
    creditAnnualRate: annualRate.optional(),
    rateBasis: z.literal('prime').optional(),
    primeMargin: z
      .string()
      .refine((value) => normalizeRateMargin(value) === value, 'not a margin over prime')
      .optional(),
    // A long קרדיט that follows prime from one payment on; absent on rows from before it.
    reset: z
      .object({
        atPayment: z.number().int().min(1).max(360),
        primeAtPurchase: annualRate,
        principalMinor: z.number().int().positive().max(1e15).optional(),
        rate: annualRate.optional(),
        paymentMinor: z.number().int().nonnegative().max(1e15).optional(),
        frozen: z.literal(true).optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('yearly'),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    endDate: localDate.optional(),
  }),
]);

const profileSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(40),
  // Legacy: no longer written, but a file from before still carries it.
  avatar: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  openingBalanceMinor: z.number().int().max(1e15),
  openingBalanceCurrency: currency,
  openingBalanceDate: localDate,
  createdAt: isoInstant,
  updatedAt: isoInstant,
});

/**
 * A business type's SHAPE only. A synced row from a build with a newer list
 * may carry a code this one has never heard of; refusing the row for it would
 * drop the whole row on this device. Whether the list has the code is checked
 * where a code comes in (`isMcc`), and by `validateEnvelope` for a file.
 */
const mccCode = z.string().regex(MCC_SHAPE, 'Expected a four-digit business type');

const categorySchema = z.intersection(
  z.object({
    id: z.string().min(1),
    kind: z.enum(['income', 'expense']),
    icon: z.string().min(1),
    // Loose on purpose: a newer build's hue key must survive an import here.
    hue: z.string().min(1).max(40).optional(),
    sortOrder: z.number().int(),
    isArchived: z.union([z.literal(0), z.literal(1)]),
    archivedAt: isoInstant.optional(),
    // The business types moved into this category; absent on rows from before them.
    mccs: z
      .array(mccCode)
      .max(200)
      .refine((codes) => new Set(codes).size === codes.length, 'A business type is listed twice')
      .readonly()
      .optional(),
    createdAt: isoInstant,
    updatedAt: isoInstant,
  }),
  z.discriminatedUnion('source', [
    z.object({ source: z.literal('builtin'), nameKey: z.string().min(1) }),
    z.object({ source: z.literal('custom'), name: z.string().trim().min(1).max(40) }),
  ]),
);

const margin = z.string().refine((value) => normalizeRateMargin(value) === value, 'not a margin over prime');

const rateTerm = z.discriminatedUnion('basis', [
  z.object({ basis: z.literal('prime'), margin }),
  z.object({ basis: z.literal('fixed'), rate: annualRate }),
]);

const KNOWN_BASES: readonly string[] = ['prime', 'fixed', 'boi'];

/**
 * A rate the person set over the catalog's: a basis this release knows, in
 * full, or one a later release added, kept as it came (`cardDealRate` reads
 * it as a rate this release cannot price).
 */
const overrideTerm = z.union([
  z.discriminatedUnion('basis', [...rateTerm.options, z.object({ basis: z.literal('boi'), margin })]),
  z.looseObject({ basis: z.string().refine((basis) => !KNOWN_BASES.includes(basis), 'a known basis') }),
]);

const shortText = z.string().trim().min(1).max(40);
const minorAmount = z.number().int().nonnegative().max(1e12);

/** What a card company shows about a card, never what identifies it (§12). */
export const cardSchema = z.object({
  issuer: z.enum(['isracard', 'cal', 'max', 'amex', 'diners', 'other']).optional(),
  network: z.enum(['visa', 'mastercard', 'amex', 'diners', 'isracard']).optional(),
  kind: z.enum(['bank', 'non_bank']).optional(),
  bank: shortText.optional(),
  tier: shortText.optional(),
  club: shortText.optional(),
  lastDigits: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  expiresMonth: z.string().refine(isExpiresMonth, 'not a YYYY-MM month').optional(),
  billingDay: z.number().int().min(1).max(31).optional(),
  creditLimitMinor: minorAmount.optional(),
  monthlyFeeMinor: minorAmount.optional(),
  feeSince: z.string().refine(isExpiresMonth, 'not a YYYY-MM month').optional(),
  feeDiscount: z
    .object({
      minSpendMinor: minorAmount,
      percent: annualRate,
      until: z.string().refine(isExpiresMonth, 'not a YYYY-MM month').optional(),
    })
    .optional(),
  fxFeeRate: annualRate.optional(),
  creditPrimeMargin: margin.optional(),
  lateRate: rateTerm.optional(),
  accountId: z.string().min(1).optional(),
  // Loose, like the card itself (payment-methods.ts checkedCard): a key a later
  // release adds inside the link survives an edit made by this one.
  catalog: z
    .looseObject({
      issuer: shortText,
      bank: shortText,
      tier: shortText,
      club: shortText.optional(),
      version: z.number().int().min(1),
      updatedOn: localDate.optional(),
      filled: z
        .looseObject({
          fxFeeRate: annualRate.optional(),
          monthlyFeeMinor: minorAmount.optional(),
          creditPrimeMargin: margin.optional(),
          lateRate: rateTerm.optional(),
        })
        .optional(),
    })
    .optional(),
  // Open on both axes, like `catalog`: a kind or a rate basis a later release
  // adds must not make this one reject the whole card on a pull, or refuse to
  // edit it. A kind and a basis this one knows are still checked in full.
  overrides: z
    .looseObject(
      Object.fromEntries([...DEAL_KINDS, ...EXTRA_RATE_KINDS].map((kind) => [kind, overrideTerm.optional()])),
    )
    .optional(),
  // Open, never an enum: a kind a later release adds reads as debit here.
  funding: z.string().min(1).max(20).optional(),
  issuerName: shortText.optional(),
  loadCardId: z.string().min(1).optional(),
  loadFeeMinor: minorAmount.optional(),
  acceptedAt: shortText.optional(),
  issuerBank: z
    .string()
    .regex(/^\d{1,3}$/)
    .optional(),
  productName: shortText.optional(),
  checked: z.literal(true).optional(),
});

/** A bank account as the bank writes it; never anything that moves money (§12). */
export const accountSchema = z.object({
  bank: z.string().regex(/^\d{1,3}$/),
  branch: z
    .string()
    .regex(/^\d{1,4}$/)
    .optional(),
  number: z
    .string()
    .regex(/^\d{2,13}$/)
    .optional(),
  holding: z.enum(['personal', 'joint', 'business']),
  holders: z.array(z.string().min(1)).min(1).max(20).readonly().optional(),
  otherHolders: z.string().trim().min(1).max(80).optional(),
  overdraftLimitMinor: minorAmount.optional(),
});

const paymentMethodSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
  // Open: a type a later release writes is kept and read as "other"
  // (methodTypeOf), so this build never drops the row on a pull or refuses a file.
  type: z.string().min(1).max(30),
  // A LABEL only. §12 forbids storing any credential, and gate:pci enforces
  // that no field name here ever drifts toward one.
  label: z.string().trim().min(1).max(40),
  // The annual nominal interest the card charges on עסקת קרדיט. A rate, not a
  // credential: it identifies nothing about the card.
  creditAnnualRate: annualRate.optional(),
  card: cardSchema.optional(),
  account: accountSchema.optional(),
  color: z.string().optional(),
  isArchived: z.union([z.literal(0), z.literal(1)]),
  archivedAt: isoInstant.optional(),
  createdAt: isoInstant,
  updatedAt: isoInstant,
});

const transactionSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
  kind: z.enum(['income', 'expense']),
  categoryId: z.string().min(1),
  paymentMethodId: z.string().optional(),
  money: moneySchema,
  recurrence: recurrenceSchema,
  date: localDate,
  note: z.string().max(2000).optional(),
  // A 30+ purchase's rate; absent on every other row, and on rows from before it.
  deferral: z.object({ rate: annualRate }).optional(),
  // Expenses only (transfer-validate refuses them on income). The source is any short
  // string, like a cash move's kind: a source a later build adds must not refuse the row.
  mcc: mccCode.optional(),
  mccSource: z.string().min(1).max(20).optional(),
  // Income only: the account or the cash it went to. transfer-validate refuses
  // it on an expense; a destination naming nothing is "not assigned", never an error.
  destinationId: z.string().min(1).optional(),
  // A recount's row; absent on every other.
  cashCount: z.literal(true).optional(),
  seriesStart: localDate,
  seriesEnd: localDate,
  isDeleted: z.union([z.literal(0), z.literal(1)]),
  seriesRootId: z.string().min(1),
  splitFromId: z.string().optional(),
  splitAtDate: localDate.optional(),
  deletedAt: isoInstant.optional(),
  createdAt: isoInstant,
  updatedAt: isoInstant,
});

const patchSchema = z.object({
  money: moneySchema.optional(),
  categoryId: z.string().optional(),
  // `null` means "clear this field" - a distinction Partial<> cannot express,
  // which is why clearing a note was unrepresentable before.
  paymentMethodId: z.string().nullable().optional(),
  // One payment's own destination; `null` clears it.
  destinationId: z.string().min(1).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  date: localDate.optional(),
});

const overrideSchema = z.intersection(
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    occurrenceDate: localDate,
    createdAt: isoInstant,
    updatedAt: isoInstant,
  }),
  z.discriminatedUnion('action', [
    // A skip may carry the edit it superseded, so that un-skipping restores the
    // occurrence as the user had it. Zod strips unknown keys, so omitting this
    // would quietly drop that edit on every export/import round trip.
    z.object({ action: z.literal('skip'), patch: patchSchema.optional() }),
    z.object({ action: z.literal('modify'), patch: patchSchema }),
  ]),
);

const settingsSchema = z.object({
  defaultCurrency: currency,
  language: z.enum(['en', 'he']),
  theme: z.enum(['light', 'dark', 'system']),
  activeProfileId: z.string().min(1),
});

/**
 * One validator per synced table, shared with sync.
 *
 * A row that arrives from the server - decrypted, so authentic to the key but
 * still written by some other device's code, possibly an older or newer
 * version of it - is exactly as untrusted as a row in an imported file, and
 * gets exactly the same check before it touches the database.
 */
const redirectSchema = z.object({
  id: z.string().min(1),
  tbl: z.enum(['categories', 'paymentMethods', 'profiles']),
  from: z.string().min(1),
  to: z.string().min(1).nullable(),
  createdAt: isoInstant,
  updatedAt: isoInstant,
});

/**
 * A cash move. `kind` is any non-empty string on purpose: a later build may
 * add a kind, and this one must keep the row rather than refuse it forever -
 * every sum here ignores a kind it does not know (src/domain/cash.ts).
 */
export const cashMoveSchema = z.object({
  id: z.string().min(1),
  profileId: z
    .string()
    .min(1)
    .refine((id) => id !== SHARED_OWNER, 'a cash move belongs to one person'),
  kind: z.string().min(1).max(40),
  // 0 only for a count that matched; the repository holds every other kind above it.
  amountMinor: minorAmount,
  date: localDate,
  accountId: z.string().min(1).optional(),
  note: z.string().max(2000).optional(),
  isDeleted: z.union([z.literal(0), z.literal(1)]),
  deletedAt: isoInstant.optional(),
  createdAt: isoInstant,
  updatedAt: isoInstant,
});

export const rowSchemas = {
  redirects: redirectSchema,
  profiles: profileSchema,
  categories: categorySchema,
  paymentMethods: paymentMethodSchema,
  transactions: transactionSchema,
  overrides: overrideSchema,
  cashMoves: cashMoveSchema,
} as const;

/** The settings row syncs one field; this is all a device ever sends of it. */
export const syncedSettingsSchema = z.object({ defaultCurrency: currency });

export const envelopeSchema = z.object({
  /**
   * 'greenback' is the app's name before it became Bookandry. Every backup made
   * before the rename says so, and a backup that stops restoring because the
   * app changed its name is not a backup - so both are read, and only the new
   * one is written.
   */
  app: z.enum(['bookandry', 'greenback']),
  schemaVersion: z.number().int().positive(),
  appVersion: z.string().min(1),
  exportedAt: isoInstant,
  /**
   * NOT decoration. Every baseAmountMinor in this file is denominated in THIS
   * currency. Merging a file exported under a different base without noticing
   * would sum two different units into one headline figure, silently.
   */
  defaultCurrency: currency,
  counts: z.object({
    profiles: z.number().int().nonnegative(),
    categories: z.number().int().nonnegative(),
    paymentMethods: z.number().int().nonnegative(),
    transactions: z.number().int().nonnegative(),
    overrides: z.number().int().nonnegative(),
    // Absent from every file made before the cash tab: read as none.
    cashMoves: z.number().int().nonnegative().default(0),
  }),
  settings: settingsSchema,
  data: z.object({
    profiles: z.array(profileSchema),
    categories: z.array(categorySchema),
    paymentMethods: z.array(paymentMethodSchema),
    transactions: z.array(transactionSchema),
    overrides: z.array(overrideSchema),
    cashMoves: z.array(cashMoveSchema).default([]),
  }),
});

export type ExportEnvelope = z.infer<typeof envelopeSchema>;
