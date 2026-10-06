import { normalizeAnnualRate, normalizeRateMargin, toDecimalString, toMinor } from '@/lib/money';
import type { CardDetails, CardIssuer, CardKind, CardNetwork, PaymentMethod, RateTerm } from '@/types/domain';

import { CARD_CURRENCY, isExpiresMonth } from './cards';

/** A rate as the editor holds it: which kind, and the text typed for it. */
export type RateDraft = { readonly basis: 'prime' | 'fixed'; readonly value: string };

/** The card editor's fields, as typed. Everything optional but the shape. */
export type CardDraft = {
  readonly issuer: CardIssuer | '';
  readonly network: CardNetwork | '';
  readonly kind: CardKind | '';
  /** The household account the bill is paid from, or '' for none of them. */
  readonly accountId: string;
  readonly bank: string;
  readonly tier: string;
  readonly club: string;
  /** The last four digits, as typed. */
  readonly lastDigits: string;
  /** MM/YY, as printed on the card. */
  readonly expires: string;
  readonly billingDay: string;
  readonly creditLimit: string;
  readonly monthlyFee: string;
  /** Spend that earns the fee discount, in shekels; '' for no discount. */
  readonly discountSpend: string;
  /** Percent off the fee once earned; "100" waives it. */
  readonly discountPercent: string;
  /** MM/YY: the last month the discount applies; '' for no end. */
  readonly discountUntil: string;
  readonly fxFee: string;
  readonly credit: RateDraft;
  readonly late: RateDraft;
};

export type CardDraftField =
  | 'lastDigits'
  | 'expires'
  | 'billingDay'
  | 'creditLimit'
  | 'monthlyFee'
  | 'discountSpend'
  | 'discountPercent'
  | 'discountUntil'
  | 'fxFee'
  | 'credit'
  | 'late';

export const EMPTY_CARD_DRAFT: CardDraft = {
  issuer: '',
  network: '',
  kind: '',
  accountId: '',
  bank: '',
  tier: '',
  club: '',
  lastDigits: '',
  expires: '',
  billingDay: '',
  creditLimit: '',
  monthlyFee: '',
  discountSpend: '',
  discountPercent: '100',
  discountUntil: '',
  fxFee: '',
  credit: { basis: 'prime', value: '' },
  late: { basis: 'prime', value: '' },
};

function money(minor: number | undefined): string {
  return minor === undefined ? '' : toDecimalString(minor, CARD_CURRENCY);
}

/** The editor's starting fields for a method that may already have card details. */
export function cardDraftOf(method: PaymentMethod | undefined): CardDraft {
  const card = method?.card;
  if (method === undefined) return EMPTY_CARD_DRAFT;
  const expires =
    card?.expiresMonth === undefined
      ? ''
      : `${card.expiresMonth.slice(5, 7)}/${card.expiresMonth.slice(2, 4)}`;
  return {
    issuer: card?.issuer ?? '',
    network: card?.network ?? '',
    kind: card?.kind ?? '',
    accountId: card?.accountId ?? '',
    bank: card?.bank ?? '',
    tier: card?.tier ?? '',
    club: card?.club ?? '',
    lastDigits: card?.lastDigits ?? '',
    expires,
    billingDay: card?.billingDay === undefined ? '' : String(card.billingDay),
    creditLimit: money(card?.creditLimitMinor),
    monthlyFee: money(card?.monthlyFeeMinor),
    discountSpend: money(card?.feeDiscount?.minSpendMinor),
    discountPercent: card?.feeDiscount?.percent ?? '100',
    discountUntil: card?.feeDiscount?.until === undefined ? '' : printed(card.feeDiscount.until),
    fxFee: card?.fxFeeRate ?? '',
    credit:
      card?.creditPrimeMargin !== undefined
        ? { basis: 'prime', value: card.creditPrimeMargin }
        : method.creditAnnualRate !== undefined
          ? { basis: 'fixed', value: method.creditAnnualRate }
          : { basis: 'prime', value: '' },
    late:
      card?.lateRate === undefined
        ? { basis: 'prime', value: '' }
        : card.lateRate.basis === 'prime'
          ? { basis: 'prime', value: card.lateRate.margin }
          : { basis: 'fixed', value: card.lateRate.rate },
  };
}

/** "2028-09" as a card prints it: "09/28". */
function printed(month: string): string {
  return `${month.slice(5, 7)}/${month.slice(2, 4)}`;
}

/** "09/28" or "9/2028" to "2028-09"; '' stays ''; anything else is undefined. */
export function parseExpires(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  const match = /^(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})$/.exec(trimmed);
  if (match === null) return undefined;
  const month = Number(match[1]);
  const yearText = match[2] ?? '';
  const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
  const value = `${String(year)}-${String(month).padStart(2, '0')}`;
  return isExpiresMonth(value) ? value : undefined;
}

function amount(text: string): number | undefined | null {
  if (text.trim() === '') return undefined;
  try {
    // Commas are thousands, as on every statement: "15,000" is fifteen thousand.
    const minor = toMinor(text.replace(/,/g, ''), CARD_CURRENCY);
    return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
  } catch {
    return null;
  }
}

function rate(draft: RateDraft): RateTerm | undefined | null {
  if (draft.value.trim() === '') return undefined;
  if (draft.basis === 'prime') {
    const margin = normalizeRateMargin(draft.value);
    return margin === undefined ? null : { basis: 'prime', margin };
  }
  const fixed = normalizeAnnualRate(draft.value);
  return fixed === undefined ? null : { basis: 'fixed', rate: fixed };
}

const text = (value: string): string | undefined => {
  const trimmed = value.trim().slice(0, 40);
  return trimmed === '' ? undefined : trimmed;
};

export type CardDraftResult =
  | {
      readonly ok: true;
      /** Undefined when nothing was filled in at all. */
      readonly card: CardDetails | undefined;
      /** The card's fixed קרדיט rate, or null for none (prime-linked, or empty). */
      readonly creditAnnualRate: string | null;
    }
  | { readonly ok: false; readonly invalid: readonly CardDraftField[] };

/**
 * The card details to store, or which fields cannot be read.
 *
 * `previous` and `month` place the fee in time: it is charged from the month
 * it was first set, kept across later edits, and gone with the fee.
 */
export function cardFromDraft(
  draft: CardDraft,
  context: { readonly previous?: CardDetails; readonly month: string },
): CardDraftResult {
  const invalid: CardDraftField[] = [];

  const lastDigits = draft.lastDigits.replace(/\s/g, '');
  if (lastDigits !== '' && !/^\d{4}$/.test(lastDigits)) invalid.push('lastDigits');

  const expiresMonth = parseExpires(draft.expires);
  if (expiresMonth === undefined) invalid.push('expires');

  const day = draft.billingDay.trim() === '' ? undefined : Number(draft.billingDay);
  if (day !== undefined && !(Number.isInteger(day) && day >= 1 && day <= 31)) invalid.push('billingDay');

  const creditLimitMinor = amount(draft.creditLimit);
  if (creditLimitMinor === null) invalid.push('creditLimit');
  const monthlyFeeMinor = amount(draft.monthlyFee);
  if (monthlyFeeMinor === null) invalid.push('monthlyFee');

  const discountSpend = amount(draft.discountSpend);
  if (discountSpend === null) invalid.push('discountSpend');
  const discountPercent = normalizeAnnualRate(
    draft.discountPercent.trim() === '' ? '100' : draft.discountPercent,
  );
  if (discountPercent === undefined) invalid.push('discountPercent');
  const discountUntil = parseExpires(draft.discountUntil);
  if (discountUntil === undefined) invalid.push('discountUntil');

  const fxFeeRate = draft.fxFee.trim() === '' ? undefined : normalizeAnnualRate(draft.fxFee);
  if (draft.fxFee.trim() !== '' && fxFeeRate === undefined) invalid.push('fxFee');

  const credit = rate(draft.credit);
  if (credit === null) invalid.push('credit');
  const late = rate(draft.late);
  if (late === null) invalid.push('late');

  if (invalid.length > 0) return { ok: false, invalid };

  const card: CardDetails = {
    ...(draft.issuer === '' ? {} : { issuer: draft.issuer }),
    ...(draft.network === '' ? {} : { network: draft.network }),
    ...(draft.kind === '' ? {} : { kind: draft.kind }),
    ...(text(draft.bank) === undefined ? {} : { bank: text(draft.bank) }),
    ...(draft.accountId === '' ? {} : { accountId: draft.accountId }),
    ...(text(draft.tier) === undefined ? {} : { tier: text(draft.tier) }),
    ...(text(draft.club) === undefined ? {} : { club: text(draft.club) }),
    ...(lastDigits === '' ? {} : { lastDigits }),
    ...(expiresMonth === '' || expiresMonth === undefined ? {} : { expiresMonth }),
    ...(day === undefined ? {} : { billingDay: day }),
    ...(creditLimitMinor === undefined || creditLimitMinor === null ? {} : { creditLimitMinor }),
    ...(monthlyFeeMinor === undefined || monthlyFeeMinor === null || monthlyFeeMinor === 0
      ? {}
      : {
          monthlyFeeMinor,
          feeSince: context.previous?.feeSince ?? context.month,
          ...(discountSpend === undefined || discountSpend === null || discountPercent === undefined
            ? {}
            : {
                feeDiscount: {
                  minSpendMinor: discountSpend,
                  percent: discountPercent,
                  ...(discountUntil === undefined || discountUntil === '' ? {} : { until: discountUntil }),
                },
              }),
        }),
    ...(fxFeeRate === undefined ? {} : { fxFeeRate }),
    ...(credit?.basis === 'prime' ? { creditPrimeMargin: credit.margin } : {}),
    ...(late === undefined || late === null ? {} : { lateRate: late }),
  };

  return {
    ok: true,
    card: Object.keys(card).length === 0 ? undefined : card,
    creditAnnualRate: credit?.basis === 'fixed' ? credit.rate : null,
  };
}
