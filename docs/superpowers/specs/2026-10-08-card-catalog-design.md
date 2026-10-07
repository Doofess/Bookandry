# Card catalog: every Israeli card's real rules and rates

Approved in conversation on 2026-10-08. This is part 1 of 3. Part 2 is revolving balances. Part 3 is a scheduled check of the published rate tables.

## What the person asked for

> "The app also needs to show the different kinds of interest on credit cards:
> מתואמת, שנתית, קרדיט פלוס."
>
> "Ultimately I want it to have the exact settings for each credit card
> company / bank in Israel … don't miss out on any details."

What was decided with them:

- **Every deal type is supported.** Revolving balances come in part 2, typed by hand or attached to a card through smart import.
- **The catalog is built into the app** as reviewed data (option A). A scheduled check comes later (option C, part 3).
- **Research is the source of truth:**
  - `docs/research/2026-10-08-israeli-credit-card-interest.md`
  - `docs/research/issuers/*.md`: Isracard, Max, Cal, Leumi/Hapoalim/Mizrahi, and the other banks.

  Every figure in the catalog comes from them, with its source and date.

## What the research established

- **ריבית שנתית and ריבית שנתית מתואמת are one rate written two ways.** מתואמת = (1 + nominal/m)^m − 1, where m is how often the interest is added: 12 (monthly) for most card credit, and 4 (quarterly) for Isracard's ישראקרדיט, Cal עדיף, Cal 30+, Cal's deferral of foreign charges, late interest at Isracard, and bank overdraft rates. Fees are not included.
- **On a bank-issued card, the bank lends and sets the rates.** This covers קרדיט, long credit, 30+, card loans, splitting a purchase, and late interest. The one known exception is revolving credit on Cal cards at Yahav, whose rate Cal sets. On a non-bank card, the card company sets them.
- **Published tables:**
  - The FIBI group (FIBI, PAGI, Otsar HaHayal, U-Bank) and Mizrahi publish full tables: card company × tier × deal type, with the margin, the nominal rate and the מתואמת rate.
  - Massad publishes one, but on an old prime (5.00%).
  - Leumi, Hapoalim, Discount, Mercantile and Yahav publish none. Their rates appear only in the welcome letter and on the statement. Neither do the card companies for their non-bank cards.
- **קרדיט פלוס is long קרדיט: 19–36 payments**, with a ₪950 minimum deal and a ₪50 minimum payment.
  - On Max cards the rate is fixed for payments 1–18. At payment 19 it becomes the old rate + (prime now − prime at purchase), for the rest of the deal. It is not available abroad.
  - On Cal cards it is fixed for the whole deal.
  - Isracard allows more than 19 payments (Amex up to 36), fixed for the whole deal.
- **Prime is 4.75%** (Bank of Israel rate 3.25%, from 3.9.2026). The next decision is on 21.10.2026.

## Scope of part 1

1. A catalog of card companies, banks, tiers and club cards, with their deal types, rates and fees.
2. The card editor: choose the card company, the bank and the tier, and everything the catalog knows fills in. A rate table shows each rate as שנתית and מתואמת, with its source.
3. The purchase form offers exactly the deal types the card allows, checks their rules, and previews the schedule. That includes קרדיט פלוס with Max's reset at payment 19.
4. Splitting an existing purchase into payments, under that card's rules.

Out of scope here:

- revolving balances, ישראקרדיט-style pooled credit, and minimum payments (part 2);
- the scheduled check (part 3);
- card loans as their own flow: אשראי מהיר stays a הלוואה typed by hand, with the card's loan rate offered;
- CPI- and dollar-linked תשלומים;
- interest on cash withdrawals as a computed charge. The rate is shown, not applied.

## The catalog

One typed data module, `src/data/card-catalog/`, with a file per card company and per bank. It is **loaded on demand** (dynamic import) from the card editor and the purchase form, never in the main chunk, because the precache budget is tight.

### Shapes

```ts
type RateBasis =
  | { kind: 'prime'; margin: string } // prime + margin (signed decimal string)
  | { kind: 'boi'; margin: string } // Bank of Israel rate + margin (fair-credit late interest)
  | { kind: 'fixed'; rate: string }; // annual nominal, decimal string

type CatalogRate = {
  basis: RateBasis | null; // null: not published - "enter it from your statement"
  quality: 'exact' | 'max' | 'typical' | 'derived'; // 'derived': margin worked out from a table on an old prime
  compounding: 12 | 4; // m, for the מתואמת figure
  dayCount: '30/360' | 'actual/365';
  accrues: 'purchase' | 'merchant_paid' | 'billing_date';
  fixedAtPurchase: boolean; // false: floats with prime
  reset?: { atPayment: number; rule: 'prime_delta' }; // Max long credit: payment 19
  source: { url: string; seen: LocalDate; note?: string };
};

type DealRule = {
  kind: 'regular' | 'installments' | 'credit' | 'long_credit' | 'deferred' | 'split_purchase';
  label: { he: string; en: string }; // the card company's own name: "קרדיט פלוס", "30+", "חלוקת עסקה"
  payments?: { min: number; max: number };
  minDealMinor?: number;
  minPaymentMinor?: number;
  abroad: boolean; // allowed on a foreign purchase
  rate?: CatalogRate; // for deal kinds that carry interest
  source: { url: string; seen: LocalDate };
};

type CatalogIssuer = {
  id: 'isracard' | 'amex' | 'cal' | 'diners' | 'max';
  tiers: { id: string; name: { he: string; en: string }; issued: boolean }[];
  clubs: { id: string; name: string; issued: boolean; movedTo?: string }[];
  billingDays: number[];
  foreignPosting: 'immediate' | 'billing_date';
  fxFee?: string;
  cardFees?: { tier: string; monthlyMinor: number; waivers: { spendMinor: number; percent: string }[] }[];
  deals: DealRule[]; // non-bank card rules and rates (rates mostly null: unpublished)
  lateRate?: CatalogRate;
};

type CatalogBank = {
  id: string; // Masav code where one exists
  issuers: CatalogIssuer['id'][];
  fxFee?: Partial<Record<CatalogIssuer['id'], string>>;
  lateRate?: CatalogRate;
  // The bank's own rates, per issuer and tier; a missing entry means the bank publishes none.
  rates?: { issuer: CatalogIssuer['id']; tier: string; deal: DealRule['kind']; rate: CatalogRate }[];
  dealOverrides?: { issuer: CatalogIssuer['id']; deal: Partial<DealRule> }[]; // e.g. Discount's long-credit rules
  billingDays?: number[];
};
```

The research files hold the full detail. These shapes are the minimum that every figure in them maps onto. When a figure doesn't fit, the implementation plan extends the shape. It never drops the figure.

### Resolving a card's settings

`resolveCard(issuer, bank | 'none', tier, club?) → ResolvedCard` merges the layers in this order: card company defaults, then the bank's distribution rules, then the bank's published rates for that company and tier. Each value carries the layer it came from, so the screen can show its source.

### On the card

`CardDetails` gets two fields:

- `catalog?: { issuer; bank: string | 'none'; tier; club? }`: the link.
- `overrides?: Partial<Record<DealKind | 'late', RateBasis>>`: only the rates the person changed.

The existing fields (`creditPrimeMargin`, `lateRate`, `fxFeeRate`, `billingDay`, `monthlyFeeMinor`) stay the stored truth for what the card uses. Linking a card fills them in. When the catalog changes later, fields the person never touched follow it, and fields they changed stay as they are.

**Older app versions.** A device on an older version that edits a card must not drop `catalog` or `overrides`. The implementation must check whether card edits preserve unknown fields. If they don't, it fixes that first, in a release that ships before any device writes the new fields.

### מתואמת

`effectiveRate(nominal, m) = (1 + nominal/m)^m − 1`, in exact decimal arithmetic, shown to two decimals. Every published nominal/מתואמת pair in the catalog is checked against it by a test, within 0.01.

## Screens

### Card editor

1. **"Who issues this card"** comes first. You choose the card company, then the bank (or "Not through a bank"), then the tier and the club.
   - The lists narrow: a bank offers only the card companies it distributes, and a card company offers only its tiers and the clubs it still issues.
   - "Not in the list" keeps today's fully manual editing.
2. **Choosing fills in** the billing-day options, the foreign-purchase fee, the card fee and every rate. This happens only on a card that was never linked, or after the person confirms.
3. **"Fees and interest" becomes a rate table**, with one row per deal type the card has, plus late payment, going over the limit, and cash withdrawal (shown, not applied). Each row shows:
   - the rate as "פריים + 10.50 · 15.25% שנתית · 16.36% מתואמת";
   - a tag: "Up to" (a maximum), "Published", "From your statement" (typed by the person) or "Changed by you";
   - an info button with the rules in plain words, the source and the date seen;
   - "Enter it from your statement or welcome letter" when the rate isn't published, with an input;
   - "Back to the catalog's rate" on a changed row.
4. **A line under the table:** "Rates follow prime: 4.75% today", using the existing prime view and its as-of date.
5. **Existing cards:** when the card's stored company and bank match a catalog entry, the editor offers "Link to the catalog". Nothing changes until the person accepts.

### Purchase form

1. The plan choices are the card's deal types, under the card company's own names. A card without long credit doesn't show it.
2. The rules are checked as the person types: payments, minimum deal, minimum payment, and abroad. Each broken rule is a **warning**, not a block, because the store or the card company may know better. The one exception: a קרדיט with no rate asks for the rate before saving.
3. The rate fills in from the card, and can be changed per purchase, as today.
4. **A schedule preview** shows each payment, the total interest, and the מתואמת rate.
   - **Max long credit:** payments 1–18 at the rate. From payment 19 on, "re-priced with prime: about ₪X at today's prime", marked as an estimate.
5. The plan records `primeAtPurchase` when the deal resets with prime.

### Splitting a purchase

On a saved רגילה purchase charged to a linked card, the action **"Split into payments"** uses that card's `split_purchase` rule and rate.

- Interest runs from the day of the split.
- If the purchase was already billed, the first payment falls on the next billing date but one, as Max's rules say.
- The original purchase becomes the plan; it is not duplicated.

### Cards screen

The total commitments still separate out the interest. A plan that will re-price shows "follows prime from payment 19".

## Edge cases

| Situation                                    | Behaviour                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prime changes                                | Rates of the kind prime + margin show at today's prime. Plans fixed at purchase keep their snapshot. A Max long deal estimates payments 19+ at today's prime. Once payment 19's date has passed, its rate is saved on the plan and never moves again. Every device computes the same value, so it converges. |
| Offline / no prime yet                       | The last stored prime is used, with its date. Failing that, the built-in Bank of Israel rate is used.                                                                                                                                                                                                        |
| A newer app release changes a catalog figure | Cards that follow the catalog update, with a note naming the source and date. Overrides stay. Purchases already made never change.                                                                                                                                                                           |
| A card changes card company, bank or tier    | The new entry fills in after "Keep the rates you entered?". Existing plans keep their snapshots.                                                                                                                                                                                                             |
| The rate isn't published                     | Shown empty, with "Enter it from your statement". A קרדיט on that card asks for the rate before saving.                                                                                                                                                                                                      |
| Sources disagree                             | The catalog holds the newer primary source, and the other goes in `source.note`. A table on an old prime stores the margin (`quality: 'derived'`).                                                                                                                                                           |
| "Up to" rates                                | Shown as "Up to". The person may enter their own.                                                                                                                                                                                                                                                            |
| A card that isn't in the catalog             | "Not in the list" gives fully manual editing, as today.                                                                                                                                                                                                                                                      |
| A linked household / an older app            | The link and the overrides sync with the card. The catalog is static app data, so it isn't synced. Older apps preserve the fields (see the catalog section above).                                                                                                                                           |
| A quarterly product                          | The מתואמת figure uses m = 4. Payment schedules stay monthly Spitzer.                                                                                                                                                                                                                                        |
| A long deal abroad on a Max card             | A warning, not a block.                                                                                                                                                                                                                                                                                      |

## Errors the person can see

- "This card's bank doesn't publish this rate. Enter it from your statement or welcome letter."
- "קרדיט פלוס on this card needs at least ₪950, and payments of at least ₪50."
- "Long credit isn't offered for purchases abroad on this card."
- "From payment 19 the rate moves with any change in prime since you bought. This is an estimate at today's prime."

All copy is in English and Hebrew, using the card companies' own Hebrew terms.

## Testing

- **Catalog data tests:**
  - every rate and rule has a URL and a date;
  - every bank-to-company link refers to an entry that exists;
  - every published nominal/מתואמת pair is within 0.01 of `effectiveRate` with its m;
  - no club that is no longer issued is offered;
  - no figure lacks a source.
- **Domain tests:**
  - `effectiveRate` with m = 12 and m = 4;
  - the layer order and provenance of `resolveCard`;
  - the deal rules for each card company: minimums, payments and abroad;
  - the Max payment-19 reset before, on and after its date, and across a prime change;
  - the split-purchase timing and interest;
  - overrides surviving a catalog change.
- **Older-version safety:** a card written with the new fields keeps them through an edit that older code paths make.
- **Screen tests:**
  - the three-step chooser narrowing;
  - the rate-table tags and "Back to the catalog's rate";
  - the purchase form offering only the card's deal types;
  - warnings and the קרדיט-without-rate prompt;
  - the schedule preview, including the estimate wording;
  - all in English and Hebrew.
- **Browser test:** link a card as Max through Mizrahi, International. Add a ₪3,000 קרדיט פלוס in 24 payments. Check the schedule, the מתואמת rate and the payment-19 note.

## Keeping it right

- Every catalog figure carries its source URL and the date it was seen.
- The README says what the catalog covers and that its rates are the published ones (often maximums).
- The privacy page needs no change, because the catalog sends nothing anywhere.
- Part 3 will re-read the published tables (FIBI, Mizrahi, Massad) and flag differences for review.
