import { addRates, normalizeAnnualRate, normalizeRateMargin, parseStatementAmount } from '@/lib/money';
import type {
  BankAccountDetails,
  CardDetails,
  CardIssuer,
  CardNetwork,
  PaymentMethod,
  RateTerm,
} from '@/types/domain';

import { BANKS, bankByCode, isAccountNumber } from './banks';
import { CARD_CURRENCY } from './cards';
import type { FoundRow } from './import-check';
import type { WireAccount, WireCard } from './import-wire';

/**
 * Cards "Smart import" found in a document - a card company's list of cards, a
 * card's rates page, a statement's header - read by the app from what the
 * model copied, checked, and matched to the household's own cards.
 *
 * The same rules as transactions: the model copies text, the app reads it; a
 * card read from an image is read twice and the reads compared; one read from
 * a text has its digits and rate found in that text; anything in doubt is
 * shown, unticked, never saved by itself.
 */

/** Why a found card needs a look before it is added. */
export type CardFlag =
  | 'reads_disagree'
  | 'one_read_only'
  | 'not_in_source'
  /** It is one of the household's cards already, and nothing about it is new. */
  | 'card_known';

export const CARD_BLOCKING: ReadonlySet<CardFlag> = new Set<CardFlag>([
  'reads_disagree',
  'one_read_only',
  'not_in_source',
  'card_known',
]);

export type FoundCard = {
  readonly id: string;
  readonly file: number;
  readonly label: string;
  readonly lastDigits?: string;
  readonly network?: CardNetwork;
  readonly issuer?: CardIssuer;
  /** Its קרדיט rate: prime plus a margin when the document says its rates are prime-based, else as printed. */
  readonly credit?: RateTerm;
  /** The rate as a plain decimal, for showing beside the margin. */
  readonly creditRate?: string;
  readonly creditLimitMinor?: number;
  readonly billingDay?: number;
  readonly flags: readonly CardFlag[];
  readonly wire: WireCard;
  /** What the other read said, when the two disagree. */
  readonly otherRead?: FoundCard;
};

const NETWORKS: readonly (readonly [RegExp, CardNetwork])[] = [
  [/visa|ויזה/i, 'visa'],
  [/master|מאסטר/i, 'mastercard'],
  [/amex|american express|אמריקן אקספרס/i, 'amex'],
  [/diners|דיינרס/i, 'diners'],
  [/isracard|ישראכרט/i, 'isracard'],
];

const ISSUERS: readonly (readonly [RegExp, CardIssuer])[] = [
  [/\bmax\b|מקס|leumi ?card|לאומי קארד/i, 'max'],
  [/\bcal\b|כאל|visa cal/i, 'cal'],
  [/isracard|ישראכרט/i, 'isracard'],
  [/amex|american express|אמריקן אקספרס/i, 'amex'],
  [/diners|דיינרס/i, 'diners'],
];

const match = <T>(table: readonly (readonly [RegExp, T])[], text: string): T | undefined =>
  table.find(([pattern]) => pattern.test(text))?.[1];

/** "5.9%", "5.90 %" to "5.9"; anything that is not a rate to undefined. */
export function rateFromText(text: string): string | undefined {
  const body = text.replace(/[\s%‎‏]/g, '');
  if (body === '') return undefined;
  const rate = normalizeAnnualRate(body);
  return rate === undefined ? undefined : addRates(rate, '0');
}

/** "10", "ב-10 לחודש", "10th" to 10; anything else to undefined. */
function dayOf(text: string): number | undefined {
  const digits = /\d{1,2}/.exec(text)?.[0];
  const day = digits === undefined ? undefined : Number(digits);
  return day !== undefined && day >= 1 && day <= 31 ? day : undefined;
}

/**
 * One card as transcribed, read. `prime` is the prime rate the document says
 * its rates are worked out from: with it, a card's rate is kept as prime plus
 * its margin, so it follows the next change in prime as the card company's does.
 */
export function readCard(wire: WireCard, id: string, file: number, primeText: string): FoundCard {
  const network = match(NETWORKS, wire.nw) ?? match(NETWORKS, wire.n);
  const issuer = match(ISSUERS, wire.is) ?? match(ISSUERS, wire.n);
  const rate = rateFromText(wire.cr);
  const prime = rateFromText(primeText);
  const margin =
    rate === undefined || prime === undefined ? undefined : normalizeRateMargin(addRates(rate, `-${prime}`));
  const credit: RateTerm | undefined =
    rate === undefined
      ? undefined
      : margin === undefined
        ? { basis: 'fixed', rate }
        : { basis: 'prime', margin };
  const limit = wire.lim === '' ? undefined : parseStatementAmount(wire.lim, CARD_CURRENCY);
  const billingDay = wire.bd === '' ? undefined : dayOf(wire.bd);
  return {
    id,
    file,
    label: wire.n.slice(0, 40),
    ...(wire.l4 === '' ? {} : { lastDigits: wire.l4 }),
    ...(network === undefined ? {} : { network }),
    ...(issuer === undefined ? {} : { issuer }),
    ...(credit === undefined ? {} : { credit, creditRate: rate }),
    ...(limit === undefined || limit <= 0 ? {} : { creditLimitMinor: limit }),
    ...(billingDay === undefined ? {} : { billingDay }),
    flags: [],
    wire,
  };
}

const sameName = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** The same card: by its last four digits when both have them, else by name. */
function sameCard(a: FoundCard, b: { readonly label: string; readonly lastDigits?: string }): boolean {
  if (a.lastDigits !== undefined && b.lastDigits !== undefined) return a.lastDigits === b.lastDigits;
  return sameName(a.label, b.label);
}

const withFlag = (card: FoundCard, flag: CardFlag): FoundCard =>
  card.flags.includes(flag) ? card : { ...card, flags: [...card.flags, flag] };

/** What two reads of a card say differently: its digits, rate, limit or billing day. */
function differ(a: FoundCard, b: FoundCard): boolean {
  return (
    a.lastDigits !== b.lastDigits ||
    a.creditRate !== b.creditRate ||
    a.creditLimitMinor !== b.creditLimitMinor ||
    a.billingDay !== b.billingDay
  );
}

/** Two independent reads of an image's cards, compared card by card. */
export function combineCardReads(first: readonly FoundCard[], second: readonly FoundCard[]): FoundCard[] {
  const unmatched = [...second];
  const out: FoundCard[] = [];
  for (const card of first) {
    const at = unmatched.findIndex((other) => sameCard(card, other));
    const other = at === -1 ? undefined : unmatched.splice(at, 1)[0];
    if (other === undefined) out.push(withFlag(card, 'one_read_only'));
    else out.push(differ(card, other) ? { ...withFlag(card, 'reads_disagree'), otherRead: other } : card);
  }
  for (const card of unmatched) out.push(withFlag({ ...card, id: `${card.id}b` }, 'one_read_only'));
  return out;
}

/** A card read from a text: its last digits and its rate must be printed in it. */
export function groundCards(cards: readonly FoundCard[], text: string): FoundCard[] {
  const numbers = new Set((text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')));
  return cards.map((card) => {
    const digits = card.lastDigits === undefined || numbers.has(card.lastDigits);
    const rate =
      card.creditRate === undefined ||
      [...numbers].some((n) => rateFromText(n) !== undefined && rateFromText(n) === card.creditRate);
    return digits && rate ? card : withFlag(card, 'not_in_source');
  });
}

/** One entry per card across files and screenshots: the first as found, filled in from the rest. */
export function mergeCards(cards: readonly FoundCard[]): FoundCard[] {
  const out: FoundCard[] = [];
  for (const card of cards) {
    const at = out.findIndex((kept) => sameCard(kept, card));
    const kept = at === -1 ? undefined : out[at];
    if (kept === undefined) {
      out.push(card);
      continue;
    }
    out[at] = {
      ...card,
      ...kept,
      flags: [...new Set([...kept.flags, ...card.flags])],
    };
  }
  return out;
}

/**
 * A statement of one card says so once, in its header, and not beside each
 * row: every expense in a file that shows exactly one card - and that does
 * not name a card of its own - was charged to it.
 */
export function withStatementCards(rows: readonly FoundRow[], cards: readonly FoundCard[]): FoundRow[] {
  const byFile = new Map<number, FoundCard[]>();
  for (const card of cards) byFile.set(card.file, [...(byFile.get(card.file) ?? []), card]);
  return rows.map((row) => {
    const [only, ...more] = mergeCards(byFile.get(row.file) ?? []);
    if (only === undefined || more.length > 0) return row;
    if (row.kind !== 'expense' || row.wire.l4 !== '' || row.methodAlias !== null) return row;
    return {
      ...row,
      statementCard: {
        label: only.label,
        ...(only.lastDigits === undefined ? {} : { lastDigits: only.lastDigits }),
      },
    };
  });
}

/** The household's card a found one is: same last digits, or - when either has none - the same name. */
export function existingCard(card: FoundCard, methods: readonly PaymentMethod[]): PaymentMethod | undefined {
  const cards = methods.filter((m) => m.type === 'credit_card');
  if (card.lastDigits !== undefined) {
    const byDigits = cards.find((m) => m.card?.lastDigits === card.lastDigits);
    if (byDigits !== undefined) return byDigits;
  }
  return cards.find(
    (m) =>
      sameName(m.label, card.label) && (card.lastDigits === undefined || m.card?.lastDigits === undefined),
  );
}

export type CardChange = 'new' | 'lastDigits' | 'network' | 'issuer' | 'credit' | 'limit' | 'billingDay';

export type CardPlan = {
  readonly card: CardDetails;
  /** The card's fixed קרדיט rate, or null for none (prime-based, or none known). */
  readonly creditAnnualRate: string | null;
  readonly changes: readonly CardChange[];
};

/**
 * What saving a found card writes: a new card's details, or an existing
 * card's with what the document adds or changes - and which those are.
 * What the document does not print is left as it was.
 */
export function planCard(found: FoundCard, existing: PaymentMethod | undefined): CardPlan {
  const before = existing?.card ?? {};
  const next: { -readonly [K in keyof CardDetails]: CardDetails[K] } = {
    ...before,
    ...(found.lastDigits === undefined ? {} : { lastDigits: found.lastDigits }),
    ...(found.network === undefined ? {} : { network: found.network }),
    ...(found.issuer === undefined ? {} : { issuer: found.issuer }),
    ...(found.creditLimitMinor === undefined ? {} : { creditLimitMinor: found.creditLimitMinor }),
    ...(found.billingDay === undefined ? {} : { billingDay: found.billingDay }),
  };
  let creditAnnualRate = existing?.creditAnnualRate ?? null;
  if (found.credit?.basis === 'prime') {
    next.creditPrimeMargin = found.credit.margin;
    creditAnnualRate = null;
  } else if (found.credit?.basis === 'fixed') {
    delete next.creditPrimeMargin;
    creditAnnualRate = found.credit.rate;
  }

  if (existing === undefined) return { card: next, creditAnnualRate, changes: ['new'] };
  const changes: CardChange[] = [];
  if (next.lastDigits !== before.lastDigits) changes.push('lastDigits');
  if (next.network !== before.network) changes.push('network');
  if (next.issuer !== before.issuer) changes.push('issuer');
  if (
    next.creditPrimeMargin !== before.creditPrimeMargin ||
    creditAnnualRate !== (existing.creditAnnualRate ?? null)
  ) {
    changes.push('credit');
  }
  if (next.creditLimitMinor !== before.creditLimitMinor) changes.push('limit');
  if (next.billingDay !== before.billingDay) changes.push('billingDay');
  return { card: next, creditAnnualRate, changes };
}

// ---------------------------------------------------------------------------
// Completeness: what the app needs to keep a card or an account properly. A
// document that shows less opens the editor on what it did show.
// ---------------------------------------------------------------------------

/** What a card still lacks: its last four digits tell it apart, its billing day dates its charges. */
export type CardMissing = 'lastDigits' | 'billingDay';

export function cardMissing(card: CardDetails): CardMissing[] {
  const missing: CardMissing[] = [];
  if (card.lastDigits === undefined) missing.push('lastDigits');
  if (card.billingDay === undefined) missing.push('billingDay');
  return missing;
}

// ---------------------------------------------------------------------------
// Bank accounts
// ---------------------------------------------------------------------------

export type FoundAccount = {
  readonly id: string;
  readonly file: number;
  /** Masav code, when the document names a bank the app knows. */
  readonly bank?: string;
  readonly branch?: string;
  readonly number?: string;
  /** The holders' names as printed. */
  readonly holders?: string;
  readonly flags: readonly CardFlag[];
  readonly wire: WireAccount;
  readonly otherRead?: FoundAccount;
};

/** A bank's name without the word "bank", for finding it in what a document prints. */
const CORES = BANKS.flatMap((bank) =>
  [bank.he, bank.en, bank.ar ?? '']
    .map((name) =>
      name
        .replace(/^בנק |^הבנק |^bank of |^bank | bank$/i, '')
        .trim()
        .toLocaleLowerCase(),
    )
    .filter((core) => core.length >= 3)
    .map((core) => ({ core, code: bank.code })),
);

/** The bank a printed name means: the one whose name appears first in it, the longer name on a tie. */
export function bankFromName(text: string): string | undefined {
  const lower = text.toLocaleLowerCase();
  let best: { at: number; length: number; code: string } | undefined;
  for (const { core, code } of CORES) {
    const at = lower.indexOf(core);
    if (at === -1) continue;
    if (best === undefined || at < best.at || (at === best.at && core.length > best.length)) {
      best = { at, length: core.length, code };
    }
  }
  return best?.code;
}

export function readAccount(wire: WireAccount, id: string, file: number): FoundAccount {
  const bank = bankByCode(wire.bk)?.code ?? bankFromName(wire.n);
  return {
    id,
    file,
    ...(bank === undefined ? {} : { bank }),
    ...(wire.br === '' ? {} : { branch: String(Number(wire.br)) }),
    ...(wire.no === '' || !isAccountNumber(wire.no) ? {} : { number: wire.no }),
    ...(wire.h === '' ? {} : { holders: wire.h }),
    flags: [],
    wire,
  };
}

const sameAccount = (a: FoundAccount, b: FoundAccount): boolean =>
  a.number !== undefined && b.number !== undefined
    ? a.number === b.number && a.bank === b.bank
    : a.bank === b.bank && a.branch === b.branch;

const withAccountFlag = (account: FoundAccount, flag: CardFlag): FoundAccount =>
  account.flags.includes(flag) ? account : { ...account, flags: [...account.flags, flag] };

/** Two independent reads of an image's accounts, compared. */
export function combineAccountReads(
  first: readonly FoundAccount[],
  second: readonly FoundAccount[],
): FoundAccount[] {
  const unmatched = [...second];
  const out: FoundAccount[] = [];
  for (const account of first) {
    const at = unmatched.findIndex((other) => sameAccount(account, other));
    const other = at === -1 ? undefined : unmatched.splice(at, 1)[0];
    if (other === undefined) out.push(withAccountFlag(account, 'one_read_only'));
    else if (
      other.branch !== account.branch ||
      other.number !== account.number ||
      other.bank !== account.bank
    ) {
      out.push({ ...withAccountFlag(account, 'reads_disagree'), otherRead: other });
    } else out.push(account);
  }
  for (const account of unmatched) {
    out.push(withAccountFlag({ ...account, id: `${account.id}b` }, 'one_read_only'));
  }
  return out;
}

/** An account read from a text: its number and branch must be printed in it. */
export function groundAccounts(accounts: readonly FoundAccount[], text: string): FoundAccount[] {
  const numbers = new Set((text.match(/\d+/g) ?? []).map((n) => String(Number(n))));
  const runs = text.replace(/[\s-]/g, '');
  return accounts.map((account) => {
    const number = account.number === undefined || runs.includes(account.number);
    const branch = account.branch === undefined || numbers.has(account.branch);
    return number && branch ? account : withAccountFlag(account, 'not_in_source');
  });
}

export function mergeAccounts(accounts: readonly FoundAccount[]): FoundAccount[] {
  const out: FoundAccount[] = [];
  for (const account of accounts) {
    const at = out.findIndex((kept) => sameAccount(kept, account));
    const kept = at === -1 ? undefined : out[at];
    if (kept === undefined) out.push(account);
    else out[at] = { ...account, ...kept, flags: [...new Set([...kept.flags, ...account.flags])] };
  }
  return out;
}

/** The household's account a found one is: the same bank and number. */
export function existingAccount(
  account: FoundAccount,
  methods: readonly PaymentMethod[],
): PaymentMethod | undefined {
  if (account.number === undefined) return undefined;
  return methods.find(
    (m) =>
      m.type === 'bank_account' &&
      m.account?.number === account.number &&
      (account.bank === undefined || m.account?.bank === account.bank),
  );
}

/** What an account still lacks: its bank, branch and number; and who of the household holds a shared one. */
export type AccountMissing = 'bank' | 'branch' | 'number' | 'holders';

/** Several names on it: who of the household they are is the person's to say. */
const SEVERAL = /,| ו|&| and /i;

export function accountMissing(account: FoundAccount): AccountMissing[] {
  const missing: AccountMissing[] = [];
  if (account.bank === undefined) missing.push('bank');
  if (account.branch === undefined) missing.push('branch');
  if (account.number === undefined) missing.push('number');
  if (account.holders !== undefined && SEVERAL.test(account.holders)) missing.push('holders');
  return missing;
}

/** The account's details as the editor starts them: a personal account, or a joint one when several hold it. */
export function accountDraftDetails(account: FoundAccount, owner: string): BankAccountDetails {
  const several =
    account.holders !== undefined && SEVERAL.test(account.holders) ? account.holders : undefined;
  return {
    bank: account.bank ?? '',
    ...(account.branch === undefined ? {} : { branch: account.branch }),
    ...(account.number === undefined ? {} : { number: account.number }),
    holding: several === undefined ? 'personal' : 'joint',
    ...(several === undefined ? {} : { holders: [owner], otherHolders: several.slice(0, 80) }),
  };
}

// ---------------------------------------------------------------------------
// The review list's cards and accounts
// ---------------------------------------------------------------------------

/** One found card or account in the review list. */
export type MethodReviewItem =
  | {
      readonly kind: 'card';
      readonly id: string;
      readonly found: FoundCard;
      /** The household's card it updates; absent for a new one. */
      readonly existingId?: string;
      readonly plan: CardPlan;
      readonly missing: readonly CardMissing[];
      readonly flags: readonly CardFlag[];
      readonly ticked: boolean;
      /** Saved from the editor: the method it became. */
      readonly savedId?: string;
    }
  | {
      readonly kind: 'account';
      readonly id: string;
      readonly found: FoundAccount;
      readonly existingId?: string;
      readonly missing: readonly AccountMissing[];
      readonly flags: readonly CardFlag[];
      readonly ticked: boolean;
      readonly savedId?: string;
    };

/**
 * The cards and accounts a read found, as the review shows them: a card the
 * household already has, with what the document adds; a new one; one that
 * needs filling in. Ticked only when complete, certain and something new.
 */
export function buildMethodReview(
  cards: readonly FoundCard[],
  accounts: readonly FoundAccount[],
  methods: readonly PaymentMethod[],
): MethodReviewItem[] {
  const out: MethodReviewItem[] = [];
  for (const found of mergeCards(cards)) {
    const existing = existingCard(found, methods);
    const plan = planCard(found, existing);
    const flags: CardFlag[] =
      existing !== undefined && plan.changes.length === 0 ? [...found.flags, 'card_known'] : [...found.flags];
    const missing = cardMissing(plan.card);
    out.push({
      kind: 'card',
      id: found.id,
      found,
      ...(existing === undefined ? {} : { existingId: existing.id }),
      plan,
      missing,
      flags,
      ticked: missing.length === 0 && !flags.some((f) => CARD_BLOCKING.has(f)),
    });
  }
  for (const found of mergeAccounts(accounts)) {
    const existing = existingAccount(found, methods);
    const flags: CardFlag[] = existing === undefined ? [...found.flags] : [...found.flags, 'card_known'];
    const missing = existing === undefined ? accountMissing(found) : [];
    out.push({
      kind: 'account',
      id: found.id,
      found,
      ...(existing === undefined ? {} : { existingId: existing.id }),
      missing,
      flags,
      ticked: missing.length === 0 && !flags.some((f) => CARD_BLOCKING.has(f)),
    });
  }
  return out;
}
