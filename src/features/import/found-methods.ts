import { db } from '@/db/db';
import type { FoundMethod, UnfinishedMethod } from '@/db/import-drafts';
import { createPaymentMethod, updatePaymentMethod } from '@/db/repos/payment-methods';
import { bankByCode, bankName } from '@/domain/banks';
import { accountDraftDetails, buildMethodReview, type MethodReviewItem } from '@/domain/import-cards';
import { systemClock } from '@/lib/clock';
import { newId } from '@/lib/id';
import type { PaymentMethod } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

/**
 * The cards and bank accounts "Add with AI" found: listed above the
 * transactions, each new, an update to one the household has, or - when the
 * file did not show all of it - opened in the card or account editor with
 * what it did show already filled in, for the person to finish.
 */

/** The name a found card or account goes by: the card's as printed, the account's bank. */
export function foundName(item: MethodReviewItem, language: string): string {
  if (item.kind === 'card') return item.found.label;
  const bank = bankByCode(item.found.bank ?? '');
  return bank === undefined ? item.found.wire.n : bankName(bank, language);
}

/** Still to be finished by hand: something missing, nothing saved yet, not already the household's. */
export function needsFilling(item: MethodReviewItem): boolean {
  return item.savedId === undefined && !item.flags.includes('card_known') && item.missing.length > 0;
}

/** Can be ticked and added as it is. */
export function tickable(item: MethodReviewItem): boolean {
  return item.savedId === undefined && !item.flags.includes('card_known') && item.missing.length === 0;
}

/** What a found card or account was read as, to be kept until it is finished. */
export function foundMethodOf(item: MethodReviewItem): FoundMethod {
  return item.kind === 'card' ? { kind: 'card', found: item.found } : { kind: 'account', found: item.found };
}

/**
 * One kept to finish, as the household stands now: the card it turns out to
 * update, what is still missing. Undefined once the household already has all
 * it showed - finished some other way.
 */
export function unfinishedItem(
  entry: UnfinishedMethod,
  methods: readonly PaymentMethod[],
): MethodReviewItem | undefined {
  const [item] =
    entry.kind === 'card'
      ? buildMethodReview([entry.found], [], methods)
      : buildMethodReview([], [entry.found], methods);
  return item === undefined || item.flags.includes('card_known') ? undefined : item;
}

/** The one to fill in after `from` - wrapping round - or undefined when none is left. */
export function nextUnfinished(keys: readonly string[], from: string): string | undefined {
  const at = keys.indexOf(from);
  for (let step = 1; step < keys.length; step += 1) {
    const key = keys[(at + step + keys.length) % keys.length];
    if (key !== undefined && key !== from) return key;
  }
  return undefined;
}

/**
 * What the editor opens on: the household's card with what the document adds,
 * or a new card or account made of what the document showed.
 */
export function editorSource(
  item: MethodReviewItem,
  methods: readonly PaymentMethod[],
  owner: string,
  language: string,
): { readonly target: PaymentMethod | 'new'; readonly prefill?: PaymentMethod } {
  const now = systemClock.nowIso();
  const existing = methods.find((m) => m.id === item.existingId);
  if (item.kind === 'card') {
    const rate = item.plan.creditAnnualRate;
    if (existing !== undefined) {
      const { creditAnnualRate: _old, ...rest } = existing;
      return {
        target: { ...rest, card: item.plan.card, ...(rate === null ? {} : { creditAnnualRate: rate }) },
      };
    }
    return {
      target: 'new',
      prefill: shell(item.id, owner, 'credit_card', item.found.label, now, {
        card: item.plan.card,
        ...(rate === null ? {} : { creditAnnualRate: rate }),
      }),
    };
  }
  return {
    target: 'new',
    prefill: shell(item.id, owner, 'bank_account', foundName(item, language), now, {
      account: accountDraftDetails(item.found, owner),
    }),
  };
}

function shell(
  id: string,
  profileId: string,
  type: 'credit_card' | 'bank_account',
  label: string,
  now: IsoInstant,
  details: Partial<PaymentMethod>,
): PaymentMethod {
  return { id, profileId, type, label, isArchived: 0, createdAt: now, updatedAt: now, ...details };
}

/** Save one that is complete as it is: a new card or account, or an update to the household's card. */
export async function saveFound(
  item: MethodReviewItem,
  owner: string,
  language: string,
): Promise<PaymentMethod> {
  const now = systemClock.nowIso();
  if (item.kind === 'card') {
    const rate = item.plan.creditAnnualRate;
    if (item.existingId !== undefined) {
      return updatePaymentMethod(db, item.existingId, { card: item.plan.card, creditAnnualRate: rate }, now);
    }
    return createPaymentMethod(
      db,
      newId(),
      {
        label: item.found.label,
        type: 'credit_card',
        profileId: owner,
        card: item.plan.card,
        ...(rate === null ? {} : { creditAnnualRate: rate }),
      },
      now,
    );
  }
  return createPaymentMethod(
    db,
    newId(),
    {
      label: foundName(item, language),
      type: 'bank_account',
      profileId: owner,
      account: accountDraftDetails(item.found, owner),
    },
    now,
  );
}
