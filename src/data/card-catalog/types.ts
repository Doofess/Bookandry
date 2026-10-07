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
  abroad: boolean; // allowed on a foreign purchase
  rate?: CatalogRate; // for deal kinds that carry interest
  source: { url: string; seen: LocalDate };
};

export type IssuerId = 'isracard' | 'amex' | 'cal' | 'diners' | 'max';

export type CatalogIssuer = {
  id: IssuerId;
  name: { he: string; en: string };
  tiers: { id: string; name: { he: string; en: string }; issued: boolean }[];
  clubs: { id: string; name: string; issued: boolean; movedTo?: string }[];
  billingDays: number[];
  foreignPosting: 'immediate' | 'billing_date';
  fxFee?: string;
  cardFees?: {
    tier: string;
    monthlyMinor: number;
    waivers: { spendMinor: number; percent: string }[];
  }[];
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
