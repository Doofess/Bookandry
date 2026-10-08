// Isracard (ישראכרט בע"מ: Isracard, Mastercard and Visa cards).
// Transcribed from docs/research/issuers/isracard.md and the general research
// file docs/research/2026-10-08-israeli-credit-card-interest.md. Nothing here
// comes from anywhere else. Non-bank rates are personal and unpublished: null.
import type { LocalDate } from '@/types/money';

import type { CatalogIssuer, CatalogRate, CatalogSource } from '../types';

const SEEN = '2026-10-08' as LocalDate;
const at = (url: string, note?: string): CatalogSource =>
  note ? { url, seen: SEEN, note } : { url, seen: SEEN };

// The research's short names.
const AG25 = 'https://digital.isracard.co.il/link/c144296f498b49ffbe3fbcbeb72fc0eb.aspx';
const T_ISR = 'https://digital.isracard.co.il/globalassets/taarifon_2026.pdf';
const ISCH = 'https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html';
const FAIR = 'https://digital.isracard.co.il/pages/Credit/';
const LOBBY = 'https://www.isracard.co.il/lobby-credit-cards/private';
const FLYCARD = 'https://www.isracard.co.il/flycard/private';
const SUPERFLY = 'https://www.isracard.co.il/credit-cards/superfly';
const HEVER = 'https://www.isracard.co.il/credit-cards/chever';
const HOT = 'https://www.isracard.co.il/credit-cards/moadonhot';

/** The fixed קרדיט בתשלומים track: prime + margin fixed at capture, 30/360 Spitzer from the regular billing date. */
const fixedCredit = (note?: string): CatalogRate => ({
  basis: null, // personal; shown only in the card application and the statement (AG25 §19.2.3.1)
  quality: 'exact',
  compounding: 12,
  dayCount: '30/360',
  accrues: 'billing_date',
  fixedAtPurchase: true,
  source: at(AG25, note),
});

/**
 * A request after the fact to turn past charges into הסדר קרדיט בתשלומים (AG25
 * §19.2.1.2.2). The agreement binds Premium Express (Amex) too, so Amex shares it.
 */
export const retroCredit = (): CatalogRate => ({
  basis: null,
  quality: 'typical',
  compounding: 12,
  dayCount: '30/360',
  accrues: 'request',
  fixedAtPurchase: true,
  source: at(
    AG25,
    'A request after the fact (§19.2.1.2.2): interest from the day the account is credited, within 2 business days; from the regular billing date if the deal is not yet charged. Uses from the last 5 months (Isracard iSchool). The 30/360 day count and monthly compounding are assumed from the קרדיט בתשלומים track it becomes; payment range and minimums are not stated.',
  ),
});

/** Over the limit: "בריבית בשיעור המירבי" from the excess until it is charged (AG25 §18.17); no figure. */
export const overLimit = (): CatalogRate => ({
  basis: null,
  quality: 'max',
  compounding: 12,
  dayCount: 'actual/365',
  accrues: 'purchase',
  fixedAtPurchase: false,
  source: at(
    AG25,
    'The excess is due at once (§18.12) and bears "ריבית בשיעור המירבי" from when it arises until it is charged (§18.17). The rate is not defined further (UNCONFIRMED); compounding and day count are not stated.',
  ),
});

export const isracard: CatalogIssuer = {
  id: 'isracard',
  name: { he: 'ישראכרט', en: 'Isracard' },
  tiers: [
    { id: 'local', name: { he: 'מקומי', en: 'Local' }, issued: true },
    { id: 'international', name: { he: 'בינלאומי', en: 'International' }, issued: true },
    { id: 'gold', name: { he: 'זהב', en: 'Gold' }, issued: true },
    { id: 'business', name: { he: 'עסקי', en: 'Business' }, issued: true },
    { id: 'gold_business', name: { he: 'זהב עסקי', en: 'Gold Business' }, issued: true },
    {
      id: 'platinum',
      name: { he: 'פלטינום', en: 'Platinum' },
      issued: true,
      foreignPosting: 'billing_date',
      source: at(
        ISCH,
        'Undated staff training page: Mastercard Platinum is charged for foreign purchases monthly.',
      ),
    },
    {
      id: 'world_elite',
      name: { he: 'וורלד עילית', en: 'World Elite' },
      issued: true,
      foreignPosting: 'billing_date',
      source: at(ISCH, 'Undated staff training page: World Elite is charged for foreign purchases monthly.'),
    },
    { id: 'digital', name: { he: 'דיגיטלי', en: 'Digital' }, issued: true },
    { id: 'direct', name: { he: 'Direct / ISRACASH', en: 'Direct / ISRACASH' }, issued: true },
    { id: 'more', name: { he: 'MORE', en: 'MORE' }, issued: true },
    { id: 'cashback_plus', name: { he: 'cashback+', en: 'cashback+' }, issued: true },
  ],
  clubs: [
    {
      id: 'flycard',
      name: 'FLY CARD',
      issued: true,
      monthlyMinor: 1990,
      fxFee: '2.5',
      source: at(FLYCARD, 'El Al FlyCard moved to Isracard from Cal in June 2026. Fee from T-ISR 06/2026.'),
    },
    {
      id: 'flycard_premium',
      name: 'FLY CARD Premium',
      issued: true,
      monthlyMinor: 3890,
      fxFee: '1.8',
      source: at(FLYCARD),
    },
    {
      id: 'flycard_premium_select',
      name: 'FLY CARD Premium Select',
      issued: true,
      monthlyMinor: 2790,
      fxFee: '2.2',
      source: at(FLYCARD),
    },
    {
      id: 'superfly',
      name: 'SuperFly',
      issued: true,
      monthlyMinor: 1790,
      fxFee: '2.2',
      source: at(SUPERFLY),
    },
    {
      id: 'superfly_premium',
      name: 'SuperFly Premium',
      issued: true,
      monthlyMinor: 2490,
      fxFee: '1.5',
      foreignPosting: 'billing_date',
      source: at(SUPERFLY),
    },
    {
      id: 'hever',
      name: 'חבר',
      issued: true,
      monthlyMinor: 0,
      fxFee: '1',
      foreignPosting: 'billing_date',
      source: at(HEVER, 'The security forces club, now Isracard’s; permanent card-fee waiver.'),
    },
    {
      id: 'hot',
      name: 'מועדון הוט',
      issued: true,
      monthlyMinor: 0,
      fxFee: '1',
      foreignPosting: 'billing_date',
      source: at(HOT, 'Monthly foreign billing per the undated iSchool page.'),
    },
    {
      id: 'ashmoret',
      name: 'אשמורת',
      issued: true,
      foreignPosting: 'billing_date',
      source: at(ISCH, 'Undated staff training page: charged for foreign purchases monthly.'),
    },
    { id: 'lifestyle', name: 'LifeStyle', issued: true },
    { id: 'isracard_top', name: 'ISRACARD TOP', issued: true },
    { id: 'mehadrin', name: 'Mehadrin', issued: true },
    { id: 'basic_mehadrin', name: 'BASIC Mehadrin', issued: true },
    { id: 'golanchik', name: 'Golanchik', issued: true },
    { id: 'volunteers', name: 'Volunteers’ club', issued: true },
    { id: 'corporate', name: 'Corporate', issued: true },
    { id: 'lawyers', name: 'עו"ד', issued: true },
    { id: 'olami', name: 'עולמי עובדי הרשויות', issued: true },
    { id: 'chayal_yoter', name: 'מועדון חייל יותר', issued: true },
    { id: 'supercard', name: 'סופרקארד', issued: true },
  ],
  billingDays: [2, 10, 15, 20],
  foreignPosting: 'immediate',
  fxFee: '2.9',
  cardFees: [
    { tier: 'digital', monthlyMinor: 990, waivers: [], source: at(T_ISR) },
    ...(['local', 'international', 'gold'] as const).map((tier) => ({
      tier,
      monthlyMinor: 1790,
      waivers: [
        { spendMinor: 500_000, feeMinor: 1530 },
        { spendMinor: 750_000, feeMinor: 0 },
      ],
      source: at(T_ISR, 'Spend is monthly purchases. Rami Levy club cards are excluded from the reductions.'),
    })),
    ...(['business', 'gold_business', 'platinum'] as const).map((tier) => ({
      tier,
      monthlyMinor: 1790,
      waivers: [
        { spendMinor: 750_000, feeMinor: 1530 },
        { spendMinor: 1_200_000, feeMinor: 0 },
      ],
      source: at(T_ISR, 'Spend is monthly purchases. Rami Levy club cards are excluded from the reductions.'),
    })),
    { tier: 'direct', monthlyMinor: 850, waivers: [], source: at(T_ISR) },
    { tier: 'more', monthlyMinor: 1090, waivers: [], source: at(T_ISR) },
    { tier: 'cashback_plus', monthlyMinor: 1790, waivers: [], source: at(T_ISR) },
  ],
  sources: {
    tiers: at(T_ISR, 'Card types from the non-bank fee schedule of June 2026.'),
    clubs: at(
      LOBBY,
      'The card lobby lists 41 cards, 21 of them club cards; clubs also named in Mizrahi’s table.',
    ),
    billingDays: at(
      ISCH,
      'Undated staff training page (iSchool). The agreement says only "from the dates the issuer offers"; that the list is still exactly these four is UNCONFIRMED.',
    ),
    foreignPosting: at(
      T_ISR,
      'Charged the business day after capture (part 2(ו); AG25 §8.5), unless a card has another arrangement.',
    ),
    fxFee: at(T_ISR, 'Non-bank Isracard cards; unchanged since 1.1.2025.'),
  },
  deals: [
    { kind: 'regular', label: { he: 'רגילה', en: 'Regular' }, abroad: true, source: at(ISCH) },
    { kind: 'installments', label: { he: 'תשלומים', en: 'Installments' }, abroad: true, source: at(ISCH) },
    {
      kind: 'credit',
      label: { he: 'קרדיט בתשלומים קבועים', en: 'Credit in fixed installments' },
      payments: { min: 3, max: 18 },
      minDealMinor: 7_500,
      minPaymentMinor: 2_500,
      abroad: true,
      rate: fixedCredit(),
      source: at(AG25),
    },
    {
      kind: 'long_credit',
      label: { he: 'קרדיט בתשלומים', en: 'Credit in installments, more than 19 payments' },
      // "more than 19" payments at ₪50 principal each (AG25 §19.2.2.3.2). The maximum for
      // Isracard-brand cards is UNCONFIRMED (36 is Amex's), so no range is given.
      minPaymentMinor: 5_000,
      abroad: true,
      rate: fixedCredit(
        'Fixed for the deal’s life; there is no reset (AG25 §19.2.3.1). The maximum number of payments is UNCONFIRMED.',
      ),
      source: at(AG25),
    },
    {
      kind: 'split_purchase',
      label: { he: 'העברה לקרדיט', en: 'Move to credit' },
      abroad: true,
      rate: retroCredit(),
      source: at(ISCH),
    },
  ],
  extraRates: {
    // Quality 'typical': AG25 §1 defines late interest differently (Hapoalim's maximum
    // overdraft rate); which definition binds a card bill is UNCONFIRMED. The note must
    // hold only the page's own pair, worked on a Bank of Israel rate of 4.50%.
    late: {
      basis: { kind: 'boi', margin: '16.40' },
      quality: 'typical',
      compounding: 4,
      dayCount: 'actual/365',
      accrues: 'billing_date',
      fixedAtPurchase: false,
      source: at(FAIR, 'published nominal: 20.90; published effective: 22.60'),
    },
    over_limit: overLimit(),
  },
};
