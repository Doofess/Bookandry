import type { DealKind, ExtraRateKind } from '@/types/domain';
import type { LocalDate } from '@/types/money';

export type { DealKind, ExtraRateKind };

export type RateBasis =
  | { kind: 'prime'; margin: string } // prime + margin (signed decimal string)
  | { kind: 'boi'; margin: string } // Bank of Israel rate + margin (fair-credit late interest)
  | { kind: 'fixed'; rate: string }; // annual nominal, decimal string

export type CatalogSource = { url: string; seen: LocalDate; note?: string };

export type CatalogRate = {
  basis: RateBasis | null; // null: not published - "enter it from your statement"
  quality: 'exact' | 'max' | 'typical' | 'derived'; // 'derived': margin worked out from a table on an old prime
  compounding: 12 | 4; // m, for the מתואמת figure
  dayCount: '30/360' | 'actual/365';
  accrues: 'purchase' | 'merchant_paid' | 'billing_date';
  fixedAtPurchase: boolean; // false: floats with prime
  reset?: { atPayment: number; rule: 'prime_delta' }; // Max long credit: payment 19
  source: CatalogSource;
};

export type DealRule = {
  kind: DealKind;
  label: { he: string; en: string }; // the card company's own name
  payments?: { min: number; max: number };
  minDealMinor?: number;
  minPaymentMinor?: number;
  // A higher minimum payment from this many payments up (Max חלוקת עסקה: ₪50 above 18).
  minPaymentFrom?: { payments: number; minPaymentMinor: number };
  abroad: boolean; // allowed on a foreign purchase
  rate?: CatalogRate; // for deal kinds that carry interest
  source: { url: string; seen: LocalDate };
};

export type IssuerId = 'isracard' | 'amex' | 'cal' | 'diners' | 'max';

export type ForeignPosting = 'immediate' | 'billing_date';

/** A spend waiver: a percent off the fee, or the reduced fee itself where that is what is published. */
export type FeeWaiver = { spendMinor: number; percent: string } | { spendMinor: number; feeMinor: number };

export type CatalogTier = {
  id: string;
  name: { he: string; en: string };
  issued: boolean;
  fxFee?: string; // this tier's own FX fee, where it differs from the card company's
  foreignPosting?: ForeignPosting; // where it differs from the card company's
  source?: CatalogSource; // for the tier's own figures
};

export type CatalogClub = {
  id: string;
  name: string;
  issued: boolean;
  movedTo?: string;
  monthlyMinor?: number; // the club card's own fee, replacing the tier's
  fxFee?: string;
  foreignPosting?: ForeignPosting;
  source?: CatalogSource; // for the club's own figures and its status
};

export type CatalogIssuer = {
  id: IssuerId;
  name: { he: string; en: string };
  tiers: CatalogTier[];
  clubs: CatalogClub[];
  billingDays: number[];
  foreignPosting: ForeignPosting;
  fxFee?: string;
  cardFees?: {
    tier: string;
    monthlyMinor: number;
    waivers: FeeWaiver[];
    source?: CatalogSource;
  }[];
  // Where the card company's own figures come from.
  sources?: Partial<Record<'tiers' | 'clubs' | 'billingDays' | 'foreignPosting' | 'fxFee', CatalogSource>>;
  deals: DealRule[]; // non-bank card rules and rates (rates mostly null: unpublished)
  lateRate?: CatalogRate;
  extraRates?: Partial<Record<ExtraRateKind, CatalogRate>>;
};

export type CatalogBank = {
  id: string; // Masav code where one exists
  name: { he: string; en: string };
  issuers: IssuerId[];
  fxFee?: Partial<Record<IssuerId, string>>;
  lateRate?: CatalogRate;
  extraRates?: Partial<Record<ExtraRateKind, CatalogRate>>;
  // The bank's own rates, per issuer and tier; a missing entry means the bank publishes none.
  rates?: { issuer: IssuerId; tier: string; deal: DealKind; rate: CatalogRate }[];
  // e.g. Discount's long-credit rules; `kind` names the deal being overridden.
  dealOverrides?: { issuer: IssuerId; deal: Partial<DealRule> & { kind: DealKind } }[];
  billingDays?: number[];
};

export type Catalog = {
  version: number;
  issuers: readonly CatalogIssuer[];
  banks: readonly CatalogBank[];
};
