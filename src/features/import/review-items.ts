import { db } from '@/db/db';
import { categoryFromHistory } from '@/db/repos/transactions';
import { categoryFromText } from '@/domain/import-categories';
import { BLOCKING, withFlags, type Flag, type FoundRow } from '@/domain/import-check';
import { draftOf } from '@/domain/import-review';
import { txFormSchema, type TxFormValues } from '@/domain/tx-form';
import { categoriesFor } from '@/domain/tx-options';
import { SHARED_OWNER, type Category, type PaymentMethod, type Profile } from '@/types/domain';
import type { Currency, LocalDate, RateString } from '@/types/money';

/** One found transaction in the review list: what it will be saved as, and whether it will be. */
export type ReviewItem = {
  readonly id: string;
  readonly found: FoundRow;
  readonly values: TxFormValues | undefined;
  /** A rate the document itself gave; otherwise looked up when saving. */
  readonly rate?: { readonly rate: RateString; readonly rateDate: LocalDate; readonly rateSource: 'manual' };
  readonly flags: readonly Flag[];
  readonly ticked: boolean;
  /** The person changed it, or confirmed it: their word now, not the reader's. */
  readonly confirmed: boolean;
  /** Whose the document says it is, when it prints their name. */
  readonly holder?: string;
};

/** Which alias stood for which id, in the call the rows came from. */
export type Aliases = {
  readonly categories: ReadonlyMap<string, string>;
  readonly methods: ReadonlyMap<string, string>;
  /** A household's people; absent alone. */
  readonly people?: ReadonlyMap<string, string>;
};

const REFUND_CATEGORY = 'cat.refund';

/** Whether a set of form values would save, as the form itself judges it. */
export function saveable(values: TxFormValues): boolean {
  return txFormSchema.safeParse(values).success;
}

/**
 * The review list, from what was found. Each row gets:
 *  - its category: the household's own history for that name first - what it
 *    filed it under last time - then the reader's suggestion if it is of the
 *    right kind, then the kind's first category; money back on a card is a
 *    refund;
 *  - its payment method: the card whose last four digits the document shows
 *    beside it, else the one the document named, else the batch choice;
 *  - its profile: whoever owns that card, else whoever the document names as
 *    its holder, else the batch choice - and when there is none of those, it
 *    waits for the person to say;
 *  - ticked unless something about it needs a look.
 */
export async function buildReview(
  rows: readonly FoundRow[],
  ctx: {
    readonly aliases: Aliases;
    readonly categories: readonly Category[];
    readonly methods: readonly PaymentMethod[];
    readonly profiles: readonly Profile[];
    readonly defaultProfileId: string;
    readonly defaultMethodId: string;
    readonly base: Currency;
    readonly today: LocalDate;
    readonly primeRate: string;
  },
): Promise<ReviewItem[]> {
  const items: ReviewItem[] = [];
  for (const row of rows) {
    const fromHistory = await categoryFromHistory(db, row.kind, row.description);
    const suggested = row.categoryAlias === null ? undefined : ctx.aliases.categories.get(row.categoryAlias);
    const suggestedFits = ctx.categories.some(
      (c) => c.id === suggested && c.kind === row.kind && c.isArchived === 0,
    );
    const refund =
      row.kind === 'income' && row.wire.k === 'e' && ctx.categories.some((c) => c.id === REFUND_CATEGORY)
        ? REFUND_CATEGORY
        : undefined;
    const categoryId =
      fromHistory ??
      categoryFromText(row, ctx.categories) ??
      (suggestedFits ? suggested : undefined) ??
      refund ??
      categoriesFor(ctx.categories, row.kind)[0]?.id ??
      '';

    const named =
      cardOf(row, ctx.methods)?.id ??
      (row.methodAlias === null ? undefined : ctx.aliases.methods.get(row.methodAlias));
    const method = ctx.methods.find((m) => m.id === (named ?? ctx.defaultMethodId));
    const owner = method !== undefined && method.profileId !== SHARED_OWNER ? method.profileId : undefined;
    const holder = row.wire.w === undefined ? undefined : ctx.aliases.people?.get(row.wire.w);
    const known = (id: string | undefined): id is string => ctx.profiles.some((p) => p.id === id);
    const profileId = [owner, holder, ctx.defaultProfileId].find(known) ?? '';

    const draft = draftOf(row, {
      profileId,
      base: ctx.base,
      today: ctx.today,
      primeRate: ctx.primeRate,
      categoryId,
      paymentMethodId: method?.id ?? '',
    });
    let found = draft === undefined ? row : withFlags(row, ...draft.flags);
    let values = draft?.values;
    if (profileId === '') found = withFlags(found, 'whose_unknown');
    // A credit plan needs a credit card; without one it is saved as plain instalments.
    if (values !== undefined && !saveable(values) && values.mode === 'credit') {
      const plain: TxFormValues = { ...values, mode: 'installments' };
      if (saveable(plain)) values = plain;
    }
    // Whose it is is asked apart; whether it would save is judged as if answered.
    const judged =
      values !== undefined && profileId === '' ? { ...values, profileId: ctx.profiles[0]?.id ?? '' } : values;
    if (judged === undefined || !saveable(judged)) found = withFlags(found, 'not_saveable');
    items.push({
      id: row.id,
      found,
      values,
      ...(draft?.rate === undefined ? {} : { rate: draft.rate }),
      flags: found.flags,
      ticked: !found.flags.some((f) => BLOCKING.has(f)),
      confirmed: false,
      ...(known(holder) ? { holder } : {}),
    });
  }
  return items;
}

const sameName = (name: string): string => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** The last four digits a row was charged to: printed beside it, or in its statement's header. */
const rowDigits = (row: FoundRow): string => row.wire.l4 || (row.statementCard?.lastDigits ?? '');

/**
 * The household's card a row was charged to: the one with the last four
 * digits printed beside it or in its statement's header, else - a statement
 * that names its card but not its digits - the one of that name.
 */
function cardOf(row: FoundRow, methods: readonly PaymentMethod[]): PaymentMethod | undefined {
  const cards = methods.filter((m) => m.type === 'credit_card' && m.isArchived === 0);
  const digits = rowDigits(row);
  const byDigits = digits === '' ? undefined : cards.find((m) => m.card?.lastDigits === digits);
  if (byDigits !== undefined) return byDigits;
  const label = row.statementCard?.label;
  return label === undefined ? undefined : cards.find((m) => sameName(m.label) === sameName(label));
}

/**
 * A card just added or completed: the rows charged to it - by the last four
 * digits printed beside them - are now paid with it, and belong to its owner,
 * unless the person settled them otherwise.
 */
export function linkToCard(items: readonly ReviewItem[], card: PaymentMethod): ReviewItem[] {
  if (card.type !== 'credit_card') return [...items];
  return items.map((item) => {
    if (item.confirmed || item.values?.kind !== 'expense' || cardOf(item.found, [card]) === undefined) {
      return item;
    }
    const profileId = card.profileId === SHARED_OWNER ? item.values.profileId : card.profileId;
    return { ...item, values: { ...item.values, paymentMethodId: card.id, profileId } };
  });
}

/** Apply the batch "Paid with" and "For" to every row the person has not settled themselves. */
export function applyBatch(
  items: readonly ReviewItem[],
  batch: { readonly methodId: string; readonly profileId: string },
  methods: readonly PaymentMethod[],
): ReviewItem[] {
  const method = methods.find((m) => m.id === batch.methodId);
  return items.map((item) => {
    if (item.confirmed || item.values === undefined) return item;
    const named = item.found.methodAlias !== null || cardOf(item.found, methods) !== undefined;
    const paymentMethodId =
      item.values.kind === 'expense' && !named ? batch.methodId : item.values.paymentMethodId;
    // A card the document named keeps its owner; otherwise the batch card's owner, whoever the
    // document names, or the batch "For".
    const owner = method !== undefined && method.profileId !== SHARED_OWNER ? method.profileId : undefined;
    const profileId = named ? item.values.profileId : (owner ?? item.holder ?? batch.profileId);
    const values: TxFormValues = { ...item.values, paymentMethodId, profileId };
    if (profileId === '' || !item.flags.includes('whose_unknown')) return { ...item, values };
    // Answered: no longer waiting for it.
    const flags = item.flags.filter((f) => f !== 'whose_unknown');
    const found = { ...item.found, flags };
    return { ...item, values, found, flags, ticked: !flags.some((f) => BLOCKING.has(f)) };
  });
}

/**
 * Whose a found card or account is: the one person the rows from its file -
 * those charged to it, for a card - were read as belonging to; undefined
 * when they name nobody, or more than one.
 */
export function holderOfMethod(
  items: readonly ReviewItem[],
  file: number,
  digits: string | undefined,
): string | undefined {
  const holders = new Set(
    items
      .filter((i) => i.found.file === file && (digits === undefined || rowDigits(i.found) === digits))
      .map((i) => i.holder),
  );
  const [only, ...more] = [...holders];
  return more.length === 0 ? only : undefined;
}
