import { z } from 'zod';

import { isLocalDate } from '@/lib/dates';
import { normalizeAnnualRate } from '@/lib/money';

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
    installments: z.number().int().min(1).max(120).optional(),
    // Absent on files written before the distinction existed; those rows are
    // תשלומים by construction, because it was the only plan the form could make.
    plan: z.enum(['installments', 'credit']).optional(),
    creditAnnualRate: annualRate.optional(),
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
  avatar: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  openingBalanceMinor: z.number().int().max(1e15),
  openingBalanceCurrency: currency,
  openingBalanceDate: localDate,
  createdAt: isoInstant,
  updatedAt: isoInstant,
});

const categorySchema = z.intersection(
  z.object({
    id: z.string().min(1),
    kind: z.enum(['income', 'expense']),
    icon: z.string().min(1),
    sortOrder: z.number().int(),
    isArchived: z.union([z.literal(0), z.literal(1)]),
    archivedAt: isoInstant.optional(),
    createdAt: isoInstant,
    updatedAt: isoInstant,
  }),
  z.discriminatedUnion('source', [
    z.object({ source: z.literal('builtin'), nameKey: z.string().min(1) }),
    z.object({ source: z.literal('custom'), name: z.string().trim().min(1).max(40) }),
  ]),
);

const paymentMethodSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
  type: z.enum([
    'cash',
    'cheque',
    'credit_card',
    'debit_card',
    'bank_transfer',
    'standing_order',
    'digital_wallet',
    'other',
  ]),
  // A LABEL only. §12 forbids storing any credential, and gate:pci enforces
  // that no field name here ever drifts toward one.
  label: z.string().trim().min(1).max(40),
  // The annual nominal interest the card charges on עסקת קרדיט. A rate, not a
  // credential: it identifies nothing about the card.
  creditAnnualRate: annualRate.optional(),
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

export const rowSchemas = {
  redirects: redirectSchema,
  profiles: profileSchema,
  categories: categorySchema,
  paymentMethods: paymentMethodSchema,
  transactions: transactionSchema,
  overrides: overrideSchema,
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
  }),
  settings: settingsSchema,
  data: z.object({
    profiles: z.array(profileSchema),
    categories: z.array(categorySchema),
    paymentMethods: z.array(paymentMethodSchema),
    transactions: z.array(transactionSchema),
    overrides: z.array(overrideSchema),
  }),
});

export type ExportEnvelope = z.infer<typeof envelopeSchema>;
