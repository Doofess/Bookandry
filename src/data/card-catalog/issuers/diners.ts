// Diners Club Israel (דיינרס קלוב ישראל בע"מ, a Cal brand; lender דיינרס (מימון) בע"מ).
// Transcribed from docs/research/issuers/cal.md (which covers Diners) and the
// general research file docs/research/2026-10-08-israeli-credit-card-interest.md.
// Nothing here comes from anywhere else. Its rates are unpublished: null.
import type { LocalDate } from '@/types/money';

import type { CatalogIssuer, CatalogSource } from '../types';
import {
  CAL_AGREEMENT,
  CAL_BILLING_DAYS_NOTE,
  CAL_CREDIT_NOTE,
  CAL_FEES,
  CAL_LONG_NOTE,
  DINERS_CLASSIC,
  DISCOUNT_CARDS,
  DISCOUNT_CREDIT,
  FLYALL,
} from './cal';

const SEEN = '2026-10-08' as LocalDate;
const at = (url: string, note?: string): CatalogSource =>
  note ? { url, seen: SEEN, note } : { url, seen: SEEN };

const PAYMENT_DATE = 'https://www.diners.co.il/live-wisley/payment-date/';

export const diners: CatalogIssuer = {
  id: 'diners',
  name: { he: 'דיינרס', en: 'Diners Club' },
  tiers: [
    { id: 'classic', name: { he: 'דיינרס קלאסיק', en: 'Diners Classic' }, issued: true },
    { id: 'platinum', name: { he: 'דיינרס פלטינום', en: 'Diners Platinum' }, issued: true },
    { id: 'mastercard', name: { he: 'דיינרס מסטרקארד', en: 'Diners Mastercard' }, issued: true },
  ],
  clubs: [
    {
      id: 'flycard',
      name: 'FlyCard',
      issued: false,
      movedTo: 'flyall',
      source: at(
        DISCOUNT_CARDS,
        'El Al FlyCard moved to Isracard (June 2026), relaunched on Mastercard and Amex, not Diners; holders may switch to FlyAll and keep their card.',
      ),
    },
    {
      id: 'flycard_premium',
      name: 'FlyCard Premium',
      issued: false,
      movedTo: 'flyall',
      source: at(CAL_FEES, 'Legacy aviation-club card; FlyCard moved to Isracard (June 2026).'),
    },
    { id: 'flyall', name: 'FlyAll', issued: true, source: at(FLYALL, 'On Diners or Mastercard.') },
    { id: 'extra', name: 'Diners Extra', issued: true },
  ],
  billingDays: [2, 10, 15],
  foreignPosting: 'billing_date',
  fxFee: '3',
  sources: {
    tiers: at(DINERS_CLASSIC, 'Diners Platinum and Diners Mastercard are named in Mizrahi’s Cal table.'),
    clubs: at(FLYALL),
    billingDays: at(DINERS_CLASSIC, `${CAL_BILLING_DAYS_NOTE} Diners lets the date change once a quarter.`),
    foreignPosting: at(
      PAYMENT_DATE,
      'Foreign purchases are charged on the regular billing date with no interest for the deferral; Diners Platinum gets up to 30 days’ free credit.',
    ),
    fxFee: at(CAL_FEES, 'Cal’s schedule covers Visa, Mastercard and Diners: 3.0% from 1.6.2026.'),
  },
  deals: [
    { kind: 'regular', label: { he: 'רגילה', en: 'Regular' }, abroad: true, source: at(CAL_AGREEMENT) },
    {
      kind: 'installments',
      label: { he: 'תשלומים', en: 'Installments' },
      abroad: true,
      source: at(CAL_AGREEMENT),
    },
    {
      kind: 'credit',
      label: { he: 'קרדיט', en: 'Credit' },
      payments: { min: 3, max: 18 },
      minDealMinor: 7_500,
      minPaymentMinor: 2_500,
      abroad: true,
      rate: {
        basis: null,
        quality: 'typical',
        compounding: 12,
        dayCount: '30/360',
        accrues: 'merchant_paid',
        fixedAtPurchase: true,
        source: at(CAL_AGREEMENT, CAL_CREDIT_NOTE),
      },
      source: at(DISCOUNT_CREDIT),
    },
    {
      kind: 'long_credit',
      label: { he: 'קרדיט', en: 'Long credit' },
      abroad: true,
      rate: {
        basis: null,
        quality: 'typical',
        compounding: 12,
        dayCount: '30/360',
        accrues: 'merchant_paid',
        fixedAtPurchase: true,
        source: at(CAL_AGREEMENT, CAL_LONG_NOTE),
      },
      source: at(CAL_AGREEMENT),
    },
    {
      kind: 'deferred',
      label: { he: 'חודש פלוס חו"ל', en: 'Month Plus abroad' },
      abroad: true,
      rate: {
        basis: null,
        quality: 'typical',
        compounding: 12,
        dayCount: 'actual/365',
        accrues: 'billing_date',
        fixedAtPurchase: false,
        source: at(
          PAYMENT_DATE,
          'One more month of deferral of the foreign charges, with interest. Cal’s 2015 notice priced "דיינרס לארג׳ / חודש פלוס" with monthly compounding. Day count, accrual start and whether it follows prime are not stated (UNCONFIRMED).',
        ),
      },
      source: at(PAYMENT_DATE),
    },
  ],
  extraRates: {
    late: {
      basis: null,
      quality: 'max',
      compounding: 12,
      dayCount: 'actual/365',
      accrues: 'billing_date',
      fixedAtPurchase: false,
      source: at(
        CAL_AGREEMENT,
        'The legal maximum (§21.3): the Fair Credit Law late cap, 1.2 × (Bank of Israel rate + 15), 21.9% today. Actual days over 365 or 366. Compounding not stated (UNCONFIRMED).',
      ),
    },
  },
};
