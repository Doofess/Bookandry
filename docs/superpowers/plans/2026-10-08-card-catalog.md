# Card Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a card is linked to its card company, bank and tier, it gets that card's real rules and rates from a reviewed catalog. Each rate is shown as both שנתית and מתואמת. Purchases offer exactly the card's deal types, including קרדיט פלוס with Max's prime reset at payment 19.

**Architecture:**

- **The catalog.** A typed data module (`src/data/card-catalog/`), loaded on demand, merges card-company defaults, bank rules and bank rate tables into a `ResolvedCard`.
- **What the card stores.** The card keeps a catalog link and only the rates the person changed. The existing card fields stay the stored truth for the credit rate, late rate, foreign-purchase fee, billing day and card fee. Linking fills those fields, and a catalog version bump refreshes the ones the person hasn't changed.
- **Rates for the other deal types** (long credit, splitting a purchase, deferred, cash, over the limit) are resolved at runtime from the catalog and the overrides.
- **Long-credit plans.** A plan carries a `reset` record, which a sweep keeps estimated at today's prime and freezes once payment 19's date has passed. Expanding occurrences stays pure: it reads the frozen or estimated payment.

**Tech Stack:** TypeScript, React 19, Dexie, zod, Vitest (projects unit/db/dom), Playwright, i18next (en/he).

**Spec:** `docs/superpowers/specs/2026-10-08-card-catalog-design.md`
**Research (the data source; every figure comes from here):**

- `docs/research/2026-10-08-israeli-credit-card-interest.md`
- `docs/research/issuers/{isracard,max,cal,banks-leumi-hapoalim-mizrahi,banks-others}.md`

## Global Constraints

- **Toolchain.** Node and pnpm live in `%LOCALAPPDATA%\node`. In PowerShell: `$env:PATH = "$env:LOCALAPPDATA\node;$env:PATH"`.
- **Gate.** `pnpm verify` (typecheck, lint, format:check, gates incl. `gate:rtl`/`gate:money`/`gate:pci`, tests with coverage, build) must exit 0 at the end of every task.
- **No made-up numbers.** Every catalog figure comes from the research files, with its `source.url` and `source.seen` date. A figure the research marks UNCONFIRMED is either left out or carries `quality` and `source.note` saying so. An unpublished rate is `basis: null`.
- **מתואמת formula.** (1 + nominal/m)^m − 1. m = 12 for most card credit. m = 4 for Isracard ישראקרדיט, Cal עדיף, Cal 30+, Cal's foreign-charge deferral, Isracard late interest, and bank overdraft/late rates where the research says so.
- **Prime.** Prime = Bank of Israel rate + 1.5 (`src/domain/prime.ts`). It is 4.75% as of 2026-10-08.
- **Money.** Exact integer/rational arithmetic only (`src/lib/money.ts`); no floats for money or rates. Rates are decimal strings.
- **Bundle.** The catalog is imported only through `import()`, never from the main chunk.
- **RTL.** Logical CSS utilities only (`ms-`, `pe-`, `start-`, `text-start`).
- **Copy.** Every new string goes in `src/i18n/locales/en/*.json` and `he/*.json`. Use the card companies' own Hebrew terms (קרדיט, קרדיט פלוס, 30+, חלוקת עסקה, סל מצטבר).
- **No card identifiers** beyond the last four digits (`gate:pci`).
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Prime changes between purchase and payment 19 of a Max long deal.**
  - Payments 1–18 never change, and payments 19+ re-price by the delta.
  - Once payment 19's date passes, a later prime change no longer moves them.
  - Pinned in Tasks 2 and 9.
- **An older app version edits a linked card.**
  - This version preserves the unknown fields.
  - An older version may drop them, and the card then degrades to "not linked" with its stored values intact. It must never fail to load or lose its rates.
  - Pinned in Task 1.
- **קרדיט on a card whose bank publishes no rate.** The form asks for the rate before saving and never saves the plan as interest-free. Pinned in Task 8.
- **A catalog version bump.** Followed fields update, overrides stay, and existing plans are untouched. Pinned in Task 5.
- **Re-linking a card with overrides to a different bank or tier.** The person chooses to keep or drop their rates, and nothing is lost silently. Pinned in Task 6.

---

### Task 1: Edits keep fields this version doesn't own

**Files:**

- Modify: `src/domain/card-draft.ts` (`cardFromDraft` keeps unknown keys of `context.previous`)
- Modify: `src/db/repos/payment-methods.ts` (`checkedCard` validates but returns the input with its unknown keys)
- Modify: `src/domain/tx-edit.ts` (`buildPatch` keeps the unknown keys of the previous `recurrence` when the plan kind is unchanged)
- Test: `src/domain/card-draft.test.ts`, `src/db/repos/payment-methods.test.ts`, `src/domain/tx-edit.test.ts`

**Interfaces:**

- Produces: the guarantee that a `CardDetails` or monthly `Recurrence` key unknown to this code survives an edit made through the card editor or the transaction form.

Background:

- Sync already stores rows exactly as received (`src/db/sync/apply.ts:145`).
- The loss happens on edit:
  - `cardFromDraft` rebuilds the card from draft fields only;
  - `updatePaymentMethod` replaces `card` with `cardSchema.parse(card)`, and zod strips unknown keys;
  - the transaction form rebuilds `recurrence` the same way.

- [ ] **Step 1: Write the failing tests**

```ts
// card-draft.test.ts
it('keeps fields a newer version added when the card is edited', () => {
  const previous = {
    issuer: 'max',
    billingDay: 10,
    catalog: { issuer: 'max', bank: '20', tier: 'international', version: 1 },
  } as never;
  const result = cardFromDraft(
    { ...cardDraftOf({ card: previous } as never), billingDay: '15' },
    { previous, month: '2026-10' },
  );
  expect(result.ok && result.card).toMatchObject({ billingDay: 15, catalog: { bank: '20' } });
});

// payment-methods.test.ts (db project)
it('validates a card but stores the keys it does not know', async () => {
  const m = await createPaymentMethod(db, {/* copy an existing credit-card fixture */}, NOW);
  const next = await updatePaymentMethod(
    db,
    m.id,
    { card: { billingDay: 2, future: { x: 1 } } as never },
    NOW,
  );
  expect(next.card).toMatchObject({ billingDay: 2, future: { x: 1 } });
  await expect(updatePaymentMethod(db, m.id, { card: { billingDay: 99 } as never }, NOW)).rejects.toThrow();
});

// tx-edit.test.ts
it('keeps unknown plan fields when an edit keeps the plan kind', () => {
  // Build a credit plan transaction whose recurrence carries `reset: {...}`;
  // edit its note through buildPatch; the patch's recurrence (if present) still has `reset`.
});
```

- [ ] **Step 2: Run the tests and see them fail**
  - Run `pnpm exec vitest run src/domain/card-draft.test.ts src/domain/tx-edit.test.ts`, then `pnpm exec vitest run --project db src/db/repos/payment-methods.test.ts`.
  - Expected: FAIL, because the keys are stripped.

- [ ] **Step 3: Implement**
  - **`cardFromDraft`:**
    - Compute `const unknown = omitKeys(context.previous ?? {}, DRAFT_KEYS)`, where `DRAFT_KEYS` lists every `CardDetails` key the draft manages:
      - `issuer`, `network`, `kind`, `bank`, `accountId`, `tier`, `club`;
      - `lastDigits`, `expiresMonth`, `billingDay`, `creditLimitMinor`;
      - `monthlyFeeMinor`, `feeSince`, `feeDiscount`;
      - `fxFeeRate`, `creditPrimeMargin`, `lateRate`.
    - Build `card` as `{ ...unknown, ...managed }`.
  - **`checkedCard`:** `cardSchema.parse(card)` for validation, then `return { ...card, ...parsed }`, so unknown keys pass through and known keys are normalized.
  - **`buildPatch`:** when the previous recurrence is `monthly` and the new one is `monthly` with the same `plan`, spread the previous recurrence's keys that the form doesn't manage under the new one.
  - Add a short comment at each site: "A newer version may store keys this one doesn't know; an edit here must not erase them."

- [ ] **Step 4: Run the tests and `pnpm verify`.** Expected: PASS.

- [ ] **Step 5: Commit** with the message "Edits keep the card and plan fields a newer version added".

---

### Task 2: The math — מתואמת, and long credit that resets with prime

**Files:**

- Modify: `src/lib/money.ts`
- Test: `src/lib/money.test.ts`

**Interfaces:**

- Produces:
  - `annualEffectiveRate(nominalPercent: string, periodsPerYear: 12 | 4): string` gives the מתואמת rate as a percent string rounded half-up to 2 decimals. (`tx-form.ts` already has an unrelated `effectiveRate`; do not reuse that name.)
  - `resetRate(rateAtPurchase: string, primeAtPurchase: string, primeNow: string): string` gives `rateAtPurchase + (primeNow − primeAtPurchase)`, floored at 0, normalized.
  - `longCreditPayments(principalMinor: Minor, ratePercent: string, months: number, reset: { atPayment: number; rate: string } | undefined): { first: Minor; afterReset?: Minor }`:
    - Payments `1..atPayment-1` are the level Spitzer payment over all `months`.
    - At `atPayment`, the balance still owed after `atPayment-1` payments (computed exactly) is re-amortized at `reset.rate` over the `months - atPayment + 1` payments left.

- [ ] **Step 1: Write the failing tests**

```ts
describe('annualEffectiveRate', () => {
  it('matches the published pairs', () => {
    expect(annualEffectiveRate('15.25', 12)).toBe('16.36');
    expect(annualEffectiveRate('14.15', 12)).toBe('15.10');
    expect(annualEffectiveRate('8.75', 12)).toBe('9.11');
    expect(annualEffectiveRate('20.90', 4)).toBe('22.60'); // Isracard late interest, quarterly
    expect(annualEffectiveRate('0', 12)).toBe('0.00');
  });
});
describe('resetRate', () => {
  it('moves by the change in prime', () => {
    expect(resetRate('15.5', '4.75', '5.25')).toBe('16');
    expect(resetRate('15.5', '4.75', '4.25')).toBe('15');
  });
});
describe('longCreditPayments', () => {
  it('is plain Spitzer with no reset, and re-amortizes the balance at payment 19', () => {
    const plain = longCreditPayments(300_000, '15.5', 24, undefined);
    expect(plain.first).toBe(spitzerPayment(300_000, '15.5', 24));
    const same = longCreditPayments(300_000, '15.5', 24, { atPayment: 19, rate: '15.5' });
    expect(Math.abs(same.afterReset! - same.first)).toBeLessThanOrEqual(1); // unchanged rate, same payment within an agora
    const up = longCreditPayments(300_000, '15.5', 24, { atPayment: 19, rate: '16.5' });
    expect(up.afterReset!).toBeGreaterThan(up.first);
  });
});
```

- [ ] **Step 2: Run them and see them fail.** Run `pnpm exec vitest run src/lib/money.test.ts`. Expected: FAIL, because the functions are not defined.

- [ ] **Step 3: Implement** in the file's existing exact style (BigInt rationals, one rounding per figure).
  - `annualEffectiveRate`: with r = nominal/(100·m), compute (1+r)^m − 1 exactly as a rational, ×100, rounded half-up to 2 dp.
  - The balance after k payments: B_k = P(1+i)^k − p·((1+i)^k − 1)/i, with i = rate/1200, computed rationally and rounded once to minor units.
  - Then `afterReset = spitzerPayment(B_k, reset.rate, months − k)` with k = atPayment − 1.

- [ ] **Step 4: Run the tests and `pnpm verify`.** Expected: PASS.

- [ ] **Step 5: Commit** with the message "Money: the מתואמת rate, and long credit that re-prices with prime".

---

### Task 3: Catalog types, resolution, and the data checks

**Files:**

- Create: `src/data/card-catalog/types.ts`, `src/data/card-catalog/resolve.ts`, `src/data/card-catalog/index.ts`
- Create: `src/data/card-catalog/issuers/` and `src/data/card-catalog/banks/` (empty barrel files for Tasks 4–5)
- Test: `src/data/card-catalog/resolve.test.ts`, `src/data/card-catalog/catalog.test.ts`

**Interfaces:**

- Produces, in `types.ts`: exactly the shapes in the spec's "Shapes" section, plus:
  - `type DealKind = 'regular' | 'installments' | 'credit' | 'long_credit' | 'deferred' | 'split_purchase'`
  - `type ExtraRateKind = 'late' | 'over_limit' | 'cash'`
  - `type CatalogSource = { url: string; seen: LocalDate; note?: string }`
  - `type Catalog = { version: number; issuers: readonly CatalogIssuer[]; banks: readonly CatalogBank[] }`
  - `CatalogIssuer` and `CatalogBank` gain `name: { he: string; en: string }`.
  - `CatalogIssuer` gains `extraRates?: Partial<Record<ExtraRateKind, CatalogRate>>`.
  - `CatalogBank` gains `extraRates?: Partial<Record<ExtraRateKind, CatalogRate>>`.
- Produces, in `resolve.ts`:

```ts
export type Provenance = 'issuer' | 'bank' | 'bank_table';
export type ResolvedRate = { rate: CatalogRate; from: Provenance };
export type ResolvedCard = {
  issuer: CatalogIssuer;
  bank: CatalogBank | undefined; // undefined: not through a bank
  tier: string;
  billingDays: readonly number[];
  fxFee?: string;
  foreignPosting: 'immediate' | 'billing_date';
  monthlyFeeMinor?: number;
  deals: readonly (DealRule & { rate?: CatalogRate; from: Provenance })[];
  extra: Partial<Record<ExtraRateKind, ResolvedRate>>;
};
export function resolveCard(
  catalog: Catalog,
  link: { issuer: string; bank: string | 'none'; tier: string; club?: string },
): ResolvedCard | undefined;
export function rateToday(rate: CatalogRate, primePercent: string, boiPercent: string): string | undefined; // nominal today; undefined when basis is null
export function issuersAt(catalog: Catalog, bank: string | 'none'): readonly CatalogIssuer[];
export function tiersOf(issuer: CatalogIssuer): readonly CatalogIssuer['tiers'][number][]; // issued only
```

- Produces, in `index.ts`: `loadCatalog(): Promise<Catalog>`, which imports `./issuers` and `./banks` and memoizes. Also `export const CATALOG_VERSION = 1`.
- Resolution order:
  1. The card company's deal rules and rates.
  2. The bank's `dealOverrides` for that card company, field by field.
  3. The bank's `rates` row for (card company, tier, deal), which replaces the rate.

  `extra` and `fxFee` work the same way: the bank's value, if it has one, replaces the card company's. A non-bank card uses the card company's values only.

- [ ] **Step 1: Write the failing tests**
  - **`resolve.test.ts`.** Use a small in-test fixture catalog (one card company, two banks) and assert:
    - the layer order;
    - the provenance (`from`) on each rate;
    - `issuersAt` filtering;
    - `tiersOf` hiding tiers no longer issued;
    - `rateToday` for `prime`, `boi` and `fixed`, and `null` → undefined;
    - an unknown link → undefined.
  - **`catalog.test.ts`.** It runs over the REAL catalog (`await loadCatalog()`) and asserts:
    - every `source.url` is https and every `source.seen` is a valid date;
    - every `bank.issuers` id exists among the card companies;
    - every `rates` row names an existing card company, tier and deal kind;
    - for every rate whose `source.note` records a published מתואמת figure in the form `published effective: NN.NN`, `annualEffectiveRate(nominal at the source's prime, m)` is within 0.01 of it;
    - no club with `issued: false` is reachable through `tiersOf` or the club lists the UI uses.

    With empty data the data checks pass trivially. Tasks 4–5 fill the data in.

- [ ] **Step 2: Run them and see them fail.** Run `pnpm exec vitest run src/data/card-catalog`. Expected: FAIL, because the modules are missing.

- [ ] **Step 3: Implement** `types.ts`, `resolve.ts` and `index.ts`, with empty `issuers/index.ts` and `banks/index.ts` exporting `[]`.

- [ ] **Step 4: Run the tests and `pnpm verify`.** Expected: PASS. Also run `pnpm build` and confirm that no catalog module is in the main chunk; grep the build manifest for `card-catalog`.

- [ ] **Step 5: Commit** with the message "Card catalog: types, resolution, and checks every figure must pass".

---

### Task 4: Catalog data — the card companies

**Files:**

- Create: `src/data/card-catalog/issuers/{isracard,amex,cal,diners,max}.ts`, and fill in `issuers/index.ts`
- Test: `src/data/card-catalog/catalog.test.ts` (add per-issuer spot checks)

**Interfaces:**

- Consumes: the Task 3 types.
- Produces: `CatalogIssuer` entries with the ids `isracard`, `amex`, `cal`, `diners`, `max`.

**Source rule:** transcribe from `docs/research/issuers/isracard.md` (Isracard and Amex), `cal.md` (Cal and Diners) and `max.md` (Max), and from the general research file. Don't use any other source, and invent nothing. Where the research says UNCONFIRMED, leave the figure out or record it with a `source.note` that says so. Rates the card company does not publish for non-bank cards get `basis: null`.

Required content, each figure with its `source`:

- **Tiers and clubs.** For each, record `issued`. The moves from the research (El Al FlyCard moved from Cal to Isracard in June 2026; Hever is now Isracard) are recorded as `issued: false`, with `movedTo` on the old card company.
- **Billing days:**
  - Isracard: 2, 10, 15, 20 (mark `source.note` as an undated training page);
  - Max: 2, 10, 15 for non-bank cards;
  - Cal: the dates in `cal.md`.
- **`foreignPosting` and `fxFee`:**
  - Isracard non-bank 2.9%;
  - Amex 2.5%;
  - Max 3%, with the per-tier exceptions in `cardFees` or `note` as the research gives them;
  - Cal 3.0%.
- **Card fees** for non-bank cards, with their spend waivers as published (Max from 1.10.2026; Isracard June 2026; Cal).
- **Deals:**
  - `regular`.
  - `installments`.
  - `credit`: payments 3–18, `minDealMinor` 7_500, `minPaymentMinor` 2_500, Spitzer, `compounding` 12, `dayCount` '30/360'. `accrues` is:
    - Isracard: `billing_date`;
    - Cal-direct: `merchant_paid` (about day 4);
    - Max: per the research.
  - `long_credit`:
    - Max: 19–36, ₪950 / ₪50, `abroad: false`, `reset: { atPayment: 19, rule: 'prime_delta' }`.
    - Isracard and Amex: more than 19, up to 36 on Amex, ₪50 per payment, fixed.
    - Cal: as `cal.md` confirms; Discount's figures belong to the bank layer in Task 5.
  - `deferred` (30+): `compounding` 4 for Cal.
  - `split_purchase`:
    - Max חלוקת עסקה: 3–36, ₪75 deal, ₪25 per payment up to 18 and ₪50 above, interest from the request date;
    - the others where the research gives terms.
- **`extraRates.late`:**
  - Isracard: `basis: { kind: 'boi', margin: '16.40' }`, `compounding` 4, `dayCount` 'actual/365';
  - Max and Cal: as researched, or null.
- **`extraRates.cash`:** where the research gives figures.
- The labels use each card company's own names (e.g. Max `long_credit` → "קרדיט פלוס"; Isracard `credit` → "קרדיט בתשלומים קבועים").

- [ ] **Step 1: Write the failing spot checks** in `catalog.test.ts`:

```ts
it('has Max קרדיט פלוס as the research gives it', async () => {
  const max = (await loadCatalog()).issuers.find((i) => i.id === 'max')!;
  const long = max.deals.find((d) => d.kind === 'long_credit')!;
  expect(long).toMatchObject({
    payments: { min: 19, max: 36 },
    minDealMinor: 95_000,
    minPaymentMinor: 5_000,
    abroad: false,
  });
  expect(long.rate?.reset).toEqual({ atPayment: 19, rule: 'prime_delta' });
});
it('has Isracard late interest compounding quarterly on the Bank of Israel rate', async () => {
  const isr = (await loadCatalog()).issuers.find((i) => i.id === 'isracard')!;
  expect(isr.extraRates?.late).toMatchObject({ basis: { kind: 'boi', margin: '16.40' }, compounding: 4 });
});
it('no longer offers FlyCard under Cal', async () => {
  const cal = (await loadCatalog()).issuers.find((i) => i.id === 'cal')!;
  expect(cal.clubs.find((c) => /fly ?card/i.test(c.name))?.issued ?? false).toBe(false);
});
```

- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Transcribe the data**, one file per card company, each with a header comment naming its research file.
- [ ] **Step 4: Run `pnpm exec vitest run src/data/card-catalog`, then `pnpm verify`.** Expected: PASS, including every Task 3 data check.
- [ ] **Step 5: Commit** with the message "Card catalog: Isracard, Amex, Cal, Diners and Max, from the research".

---

### Task 5: Catalog data — the banks, and refreshing linked cards

**Files:**

- Create: `src/data/card-catalog/banks/{leumi,hapoalim,mizrahi,discount,mercantile,fibi,massad,yahav,one-zero}.ts`, and fill in `banks/index.ts`
- Create: `src/domain/card-catalog-link.ts`
- Modify: `src/types/domain.ts` (`CardDetails.catalog`, `CardDetails.overrides`), `src/domain/transfer-schema.ts` (`cardSchema`)
- Test: `src/data/card-catalog/catalog.test.ts` (bank spot checks), `src/domain/card-catalog-link.test.ts`

**Interfaces:**

- Consumes: Tasks 3–4.
- Produces, on `CardDetails`:

```ts
readonly catalog?: { readonly issuer: string; readonly bank: string; /* Masav code or 'none' */ readonly tier: string; readonly club?: string; readonly version: number; /* LocalDate: when a catalog update last changed this card */ readonly updatedOn?: string };
readonly overrides?: Partial<Record<DealKind | ExtraRateKind, RateTerm | { basis: 'boi'; margin: string }>>;
```

- Produces, in `card-catalog-link.ts`:
  - `linkCard(card: CardDetails, resolved: ResolvedCard, link, opts: { keepOverrides: boolean }): CardDetails`
    - It fills `billingDay` (only if absent or not one of `resolved.billingDays`), `fxFeeRate`, `monthlyFeeMinor` (only if absent), `creditPrimeMargin` from the resolved `credit` rate when that rate is prime-based, and `lateRate` from `extra.late`.
    - It never overwrites a field whose kind is in `overrides`.
    - It sets `catalog: { ...link, version: CATALOG_VERSION }`.
    - Unless `keepOverrides`, it drops `overrides`.
  - `refreshLinkedCard(card, resolved, today: LocalDate): CardDetails | undefined`: the same fill, for a card whose `catalog.version < CATALOG_VERSION`. It touches only fields not in `overrides`. It bumps `catalog.version` and sets `catalog.updatedOn = today` when a value changed. It returns `undefined` when nothing changes.
  - `cardDealRate(card: CardDetails, resolved: ResolvedCard | undefined, kind: DealKind | ExtraRateKind): { term: RateTerm | { basis: 'boi'; margin: string } | null; source: 'override' | 'catalog' | 'card'; quality?: CatalogRate['quality'] } | undefined`
    - Lookup order: the override, then the catalog rate, then for `credit` and `late` the card's own fields.

**Source rule.** Transcribe only from `banks-leumi-hapoalim-mizrahi.md` and `banks-others.md`.

- Every bank lists the card companies it distributes, as the research gives them.
- **Rates.**
  - Mizrahi and the FIBI group (FIBI, PAGI, Otsar HaHayal and U-Bank share one table) get full `rates` rows for each card company, tier and deal. Each row carries its margin, and its `source.note` records the published nominal and מתואמת figures as `published nominal: X; published effective: Y`.
  - Massad gets margins with `quality: 'derived'`, and `source.note` says "table on prime 5.00%".
  - Leumi, Hapoalim, Discount, Mercantile, Yahav and One Zero get no `rates` (unpublished). Discount's `dealOverrides`, however, carry its קרדיט and קרדיט פלוס rules: ₪75 / ₪25 and ₪950 / ₪50; fixed for life on Cal, reset at 19 on Max.
- **FX fees** for each card company, as researched:
  - Leumi: 3%.
  - Hapoalim: 2.90%, Amex 2.5%, Diners 3%.
  - Mizrahi: Isracard 2.7%, Amex 2.5%, Cal 3%, Max 3%.
  - FIBI, Massad and Yahav: Isracard 2.7%.
  - One Zero: 0%.
- **Late interest**, where published:
  - Hapoalim: prime + 11.60, m = 4.
  - FIBI: 18.15 nominal.
  - Mizrahi: the account rate.

Bank ids are Masav codes: Leumi 10, Hapoalim 12, Mizrahi 20, Discount 11, Mercantile 17, FIBI 31, PAGI 52, Otsar HaHayal 14, U-Bank 26, Massad 46, Yahav 4, One Zero 18. The FIBI-group banks share one table object.

- [ ] **Step 1: Write the failing tests**

```ts
// catalog.test.ts
it('resolves Max through Mizrahi, International, to Mizrahi’s published rates', async () => {
  const r = resolveCard(await loadCatalog(), { issuer: 'max', bank: '20', tier: 'international' })!;
  const credit = r.deals.find((d) => d.kind === 'credit')!;
  expect(credit.from).toBe('bank_table');
  expect(rateToday(credit.rate!, '4.75', '3.25')).toBe('15.5');
});
it('leaves Leumi’s rates unpublished, never invented', async () => {
  const r = resolveCard(await loadCatalog(), { issuer: 'max', bank: '10', tier: 'classic' })!;
  expect(r.deals.find((d) => d.kind === 'credit')!.rate?.basis).toBeNull();
});

// card-catalog-link.test.ts
it('links, keeps the person’s own rates, and refreshes only what follows the catalog', () => {
  // fixture ResolvedCard; card with overrides.credit = { basis: 'prime', margin: '9' }
  // linkCard keeps creditPrimeMargin '9'; refreshLinkedCard with a changed catalog late rate updates lateRate only.
});
it('an old card with no catalog link is untouched by refresh', () => {
  /* returns undefined */
});
```

- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Transcribe the bank data.** Add the two `CardDetails` fields to the type and to `cardSchema` (catalog: issuer/bank/tier/club strings, version int ≥ 1; overrides: a record of the existing `rateTerm` or a `boi` margin). Then implement `card-catalog-link.ts`.
- [ ] **Step 4: Add the refresh sweep.** In `src/app/account.ts`, or wherever the app runs its after-start tasks (find where `ensureBuiltinPaymentMethods` runs at startup), add `refreshCatalogCards(db)`:
  - It loads the catalog lazily, only if any card has `catalog.version < CATALOG_VERSION`.
  - It writes each changed card with `updatePaymentMethod` (a tracked write, so it syncs).
  - Every device computes the same output, so the result converges.
  - Test it in `card-catalog-link.test.ts` with a fake db, or in the db project.
- [ ] **Step 5: Run `pnpm verify`.** Expected: PASS.
- [ ] **Step 6: Commit** with the message "Card catalog: every bank's rules and published rates; linked cards follow it".

---

### Task 6: Card editor — who issues this card

**Files:**

- Create: `src/features/cards/issuer-chooser.tsx`
- Modify: `src/features/cards/card-fields.tsx` and/or `method-editor.tsx` (put the chooser first), `src/domain/card-draft.ts` (the draft carries `catalog` and `overrides` through)
- Modify: `src/i18n/locales/{en,he}/cards.json`
- Test: `src/features/cards/issuer-chooser.test.tsx`

**Interfaces:**

- Consumes: `loadCatalog`, `issuersAt`, `tiersOf`, `resolveCard`, `linkCard`.
- Produces: `<IssuerChooser value={link | undefined} onLink={(link, resolved) => void} onUnlink={() => void} />`.

**Behaviour:**

- **The three steps.** The person picks the bank first, then the card company, then the tier and club.
  - The bank list includes "Not through a bank".
  - The card-company list is `issuersAt(bank)`.
  - The tier list is `tiersOf`.
  - The clubs list shows only issued clubs.
  - "Not in the list" leaves the card unlinked and keeps today's manual fields.
  - Show a loading state while `loadCatalog()` resolves. If the import fails (offline on first use), show "Couldn't load the card list. You can still fill the card in yourself."
- **Choosing.**
  - A card that was never linked gets `linkCard(card, resolved, link, { keepOverrides: true })` applied to the draft right away.
  - A card that is already linked and has overrides first gets an AlertDialog: "Keep the rates you entered?". The buttons are **Keep mine** (`keepOverrides: true`) and **Use the new card's rates** (`false`).
- **Existing unlinked cards.** If the card's stored `issuer` and bank match a catalog entry, show a banner: "This looks like a {{issuer}} card through {{bank}}. Link it to fill in its real rates?" The buttons are **Link** and **Not now**. Nothing changes until the person taps Link.
- **Copy (en / he):**

| key                  | en                                                                                     | he                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `catalog.title`      | Who issues this card                                                                   | מי מנפיק את הכרטיס                                                                  |
| `catalog.bank`       | Bank                                                                                   | בנק                                                                                 |
| `catalog.noBank`     | Not through a bank                                                                     | לא דרך בנק                                                                          |
| `catalog.issuer`     | Card company                                                                           | חברת כרטיסי אשראי                                                                   |
| `catalog.tier`       | Card type                                                                              | סוג הכרטיס                                                                          |
| `catalog.club`       | Club                                                                                   | מועדון                                                                              |
| `catalog.notListed`  | Not in the list                                                                        | לא ברשימה                                                                           |
| `catalog.loading`    | Loading the card list…                                                                 | טוענים את רשימת הכרטיסים…                                                           |
| `catalog.loadFailed` | Couldn't load the card list. You can still fill the card in yourself.                  | לא הצלחנו לטעון את רשימת הכרטיסים. אפשר עדיין למלא את פרטי הכרטיס ידנית.            |
| `catalog.suggest`    | This looks like a {{issuer}} card through {{bank}}. Link it to fill in its real rates? | נראה שזה כרטיס {{issuer}} דרך {{bank}}. לקשר אותו כדי למלא את הריביות האמיתיות שלו? |
| `catalog.link`       | Link                                                                                   | לקשר                                                                                |
| `catalog.notNow`     | Not now                                                                                | לא עכשיו                                                                            |
| `catalog.keepTitle`  | Keep the rates you entered?                                                            | להשאיר את הריביות שהזנת?                                                            |
| `catalog.keepMine`   | Keep mine                                                                              | להשאיר את שלי                                                                       |
| `catalog.useNew`     | Use the new card's rates                                                               | להשתמש בריביות של הכרטיס החדש                                                       |

- [ ] **Step 1: Write the failing DOM tests.**
  - Choosing Mizrahi narrows the card companies to Mizrahi's.
  - Choosing Max narrows the tiers to Max's issued tiers.
  - Linking fills the billing-day options and the FX fee into the draft.
  - The keep-or-replace dialog appears only when overrides exist, and both answers do what they say.
  - The suggestion banner appears for a matching unlinked card, and Link applies the catalog.
  - "Not in the list" leaves the card unlinked.
  - In Hebrew, the labels render.

  Mock `loadCatalog` with the fixture catalog from Task 3.

- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement** with the existing kit (`Select`/`Segmented`, `AlertDialog`), using logical spacing.
- [ ] **Step 4: Run `pnpm exec vitest run src/features/cards`, then `pnpm verify`.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "Cards: choose the bank, card company and type, and the card fills in".

---

### Task 7: Card editor — the rate table

**Files:**

- Create: `src/features/cards/rate-table.tsx`
- Modify: `src/features/cards/card-fields.tsx` (replace the credit and late rate inputs with the table when the card is linked; keep today's inputs when it is not)
- Modify: `src/i18n/locales/{en,he}/cards.json`
- Test: `src/features/cards/rate-table.test.tsx`

**Interfaces:**

- Consumes:
  - `cardDealRate`, `rateToday`, `annualEffectiveRate`;
  - `usePrime()` (`src/app/prime.ts`), which provides prime and its as-of date;
  - the resolved card.
- Produces: `<RateTable card={draftCard} resolved={ResolvedCard} onOverride={(kind, term | null) => void} />`.

**Behaviour:**

- **One row per kind.** The table has a row for each deal kind with a rate, plus late, over_limit and cash.
- **Each row shows:**
  - the deal's own label;
  - the rate as `פריים + 10.50 · 15.25% שנתית · 16.36% מתואמת` (en: `Prime + 10.50 · 15.25% annual · 16.36% effective (מתואמת)`). The מתואמת figure uses `annualEffectiveRate(today, rate.compounding)`.
  - a tag:
    - `Up to` when the quality is `max`;
    - `Published`;
    - `Worked out from the published margin` when the quality is `derived`;
    - `From your statement` or `Changed by you` when the source is `override`;
  - an info button that opens the rules in plain words (payments, minimums, abroad, when interest starts, fixed or floating, the reset rule) and the source link and date.
- **`basis: null`.** The row reads "Enter it from your statement or welcome letter" and has an input with a Prime +/Fixed segmented control, the same control the card editor uses today.
- **Editing.** Editing a row writes an override. "Back to the catalog's rate" removes it.
- **Footer.** "Rates follow prime: {{prime}}% today ({{date}})." When `card.catalog.updatedOn` is set, add "The card list updated these rates on {{date}}." (`rates.updated` / `הרשימה עדכנה את הריביות האלה ב־{{date}}.`).
- **Cash and over-limit rows.** Mark them "Shown for reference; the app doesn't charge them."
- **Copy (en / he):**

| key                   | en                                                                                                   | he                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `rates.upTo`          | Up to                                                                                                | עד                                                                               |
| `rates.published`     | Published                                                                                            | מפורסם                                                                           |
| `rates.derived`       | Worked out from the published margin                                                                 | חושב מהמרווח שפורסם                                                              |
| `rates.fromStatement` | From your statement                                                                                  | מהדף שלך                                                                         |
| `rates.changed`       | Changed by you                                                                                       | שונה על ידך                                                                      |
| `rates.unpublished`   | Enter it from your statement or welcome letter                                                       | יש להזין מדף הפירוט או ממכתב הצירוף                                              |
| `rates.back`          | Back to the catalog's rate                                                                           | חזרה לריבית מהרשימה                                                              |
| `rates.followPrime`   | Rates follow prime: {{prime}}% today ({{date}}).                                                     | הריביות צמודות לפריים: {{prime}}% היום ({{date}}).                               |
| `rates.reference`     | Shown for reference; the app doesn't charge it.                                                      | מוצג לידיעה בלבד; האפליקציה לא מחייבת אותה.                                      |
| `rates.nominal`       | annual                                                                                               | שנתית                                                                            |
| `rates.effective`     | effective (מתואמת)                                                                                   | מתואמת                                                                           |
| `rates.resetRule`     | Fixed for payments 1–{{last}}. From payment {{at}} it moves by any change in prime since you bought. | קבועה בתשלומים 1–{{last}}. מתשלום {{at}} היא משתנה לפי השינוי בפריים מאז הרכישה. |

- [ ] **Step 1: Write the failing DOM tests.**
  - Each of the tags renders.
  - The מתואמת figure for a quarterly rate uses m = 4.
  - The `null` row shows the input and saves an override.
  - "Back to the catalog's rate" clears it.
  - The info panel shows the reset rule on Max long credit.
  - The prime footer uses `usePrime` (mocked).
  - The table renders in Hebrew.
- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, then `pnpm verify`.**
- [ ] **Step 5: Commit** with the message "Cards: every rate as שנתית and מתואמת, with where it comes from".

---

### Task 8: Purchase form — the card's deal types, rules and schedule

**Files:**

- Modify: `src/domain/tx-form.ts`:
  - add the `'long_credit'` and `'deferred'` modes to `RecurrenceMode`;
  - `chargesInterest` covers them;
  - `maxPaymentsFor('long_credit')` is 36;
  - validation messages come from the rules.
- Create: `src/domain/deal-rules.ts` (pure rule checks)
- Modify: `src/features/transaction/recurrence-fields.tsx`, `src/features/transaction/use-transaction-sheet.ts` (load the resolved card for the chosen payment method)
- Modify: `src/types/domain.ts`: `Recurrence['monthly']` gains `reset?: { readonly atPayment: number; readonly primeAtPurchase: string; readonly rate?: string; readonly paymentMinor?: number; readonly frozen?: true }`. Add it to `recurrenceSchema` too.
- Modify: the locale files
- Test: `src/domain/deal-rules.test.ts`, `src/domain/tx-form.test.ts`, `src/features/transaction/recurrence-fields.test.tsx` (or the existing sheet tests)

**Interfaces:**

- Consumes:
  - `ResolvedCard`;
  - `cardDealRate`, `rateToday`, `annualEffectiveRate`, `longCreditPayments`, `resetRate`;
  - `usePrime`.
- Produces:
  - `dealWarnings(rule: DealRule, input: { amountMinor: number; payments: number; abroad: boolean }): readonly DealWarning[]`, where `DealWarning = { code: 'min_deal' | 'min_payment' | 'payments' | 'abroad'; values: Record<string, string | number> }`.
  - `availableModes(resolved: ResolvedCard | undefined, kind: 'expense' | 'income'): readonly RecurrenceMode[]`. An unlinked card or no card gives today's modes.
  - **Storage.** A `long_credit` plan is stored as `plan: 'credit'` with `installments` 19–36 and, when the card's rule has a reset, `reset: { atPayment, primeAtPurchase }`. An older app reads it as an ordinary fixed קרדיט, which degrades safely.
  - A `deferred` (30+) purchase is stored as `one_time`, charged on the billing date after the next one, with its interest. Its amount is `principal × (1 + r/12)` rounded once, and its rate is snapshotted in a new `deferral?: { rate: string }` on the transaction.

**Behaviour:**

- **The plan choices** for a linked card are its deal kinds, under the card company's own labels. They appear in the order רגילה, תשלומים, קרדיט, קרדיט פלוס, 30+.
- **The rate fills in** from `cardDealRate`, the way קרדיט does today.
- **No rate known** (`term: null`, no override): saving is blocked with "Enter this card's {{deal}} rate first", and a link opens the card's rate table. This is the only blocking rule.
- **Warnings** come from `dealWarnings` and are shown inline. They never block.
- **The schedule preview** (credit and long credit): "{{n}} payments of ₪X · interest ₪Y · {{eff}}% effective".
  - When the deal has a reset: "Payments 1–18: ₪X. From payment 19: about ₪Z at today's prime. It moves with any change in prime." Z comes from `longCreditPayments(…, { atPayment, rate: resetRate(rate, prime, prime) })`.
  - On save, record `reset.primeAtPurchase = prime today`.
- **Copy (en / he):**

| key                  | en                                                                                                                        | he                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `deal.minDeal`       | {{deal}} on this card needs at least {{min}}.                                                                             | {{deal}} בכרטיס הזה דורש לפחות {{min}}.                                                                       |
| `deal.minPayment`    | Each payment must be at least {{min}}.                                                                                    | כל תשלום צריך להיות לפחות {{min}}.                                                                            |
| `deal.payments`      | {{deal}} on this card is {{min}} to {{max}} payments.                                                                     | {{deal}} בכרטיס הזה הוא {{min}} עד {{max}} תשלומים.                                                           |
| `deal.abroad`        | {{deal}} isn't offered for purchases abroad on this card.                                                                 | {{deal}} לא ניתן לרכישות בחו״ל בכרטיס הזה.                                                                    |
| `deal.needRate`      | Enter this card's {{deal}} rate first.                                                                                    | צריך להזין קודם את הריבית של {{deal}} בכרטיס.                                                                 |
| `deal.openCard`      | Open the card                                                                                                             | לפתיחת הכרטיס                                                                                                 |
| `deal.schedule`      | {{n}} payments of {{payment}} · interest {{interest}} · {{eff}}% effective                                                | {{n}} תשלומים של {{payment}} · ריבית {{interest}} · {{eff}}% מתואמת                                           |
| `deal.resetSchedule` | Payments 1–{{last}}: {{first}}. From payment {{at}}: about {{after}} at today's prime. It moves with any change in prime. | תשלומים 1–{{last}}: {{first}}. מתשלום {{at}}: בערך {{after}} לפי הפריים היום. הסכום ישתנה עם כל שינוי בפריים. |

- [ ] **Step 1: Write the failing tests.**
  - Unit tests for `dealWarnings`: each code, and the boundary values (₪949.99 versus ₪950; 18 versus 19 payments).
  - Unit tests for `availableModes`.
  - In `tx-form`, a long credit with reset saves `reset.primeAtPurchase`.
  - DOM tests:
    - a Max-through-Mizrahi card offers קרדיט פלוס;
    - an unlinked card offers today's modes;
    - the no-rate block, and its link;
    - the reset schedule wording;
    - a warning on 19 payments under ₪950.
- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, then `pnpm verify`.**
- [ ] **Step 5: Commit** with the message "Purchases: the card's own deal types, their rules, and a schedule that shows the prime reset".

---

### Task 9: Long credit over time, splitting a purchase, and the Cards screen

**Files:**

- Modify: `src/domain/occurrences.ts`: `effectiveOccurrence` uses `recurrence.reset.paymentMinor` for slot index ≥ `atPayment` when it is present. The slot index is the payment number in the series, 1-based.
- Create: `src/db/long-credit-sweep.ts`: `sweepLongCredit(db, primePercent: string, today: LocalDate)`
- Create: `src/features/transaction/split-purchase.tsx` (the "Split into payments" action and its sheet)
- Modify: `src/domain/cards.ts` (commitments and the next bill read the reset payment), `src/features/cards/cards-screen.tsx` (the "follows prime from payment 19" mark)
- Modify: the locale files
- Test: `src/domain/occurrences.test.ts`, `src/db/long-credit-sweep.test.ts`, `src/features/transaction/split-purchase.test.tsx`, `src/domain/cards.test.ts`

**Interfaces:**

- Consumes: `longCreditPayments`, `resetRate`, the `reset` field from Task 8, `cardDealRate` and the `split_purchase` rule.
- Produces:
  - **The sweep**, run where the prime watcher refreshes (`src/app/prime.ts` `refreshPrime`, after a stored prime changes) and once at start. For every credit plan with `reset` and no `frozen`:
    - Compute `rate = resetRate(planRate, reset.primeAtPurchase, prime)` and `paymentMinor = longCreditPayments(…).afterReset`.
    - Write them with a tracked update only if they changed.
    - Once the date of payment `atPayment` is on or before `today`, set `frozen: true` with the values computed then, and never touch them again.
    - Every device computes identical values, so the writes converge.
  - **`SplitPurchase`.** On a saved one-time expense charged to a linked card with a `split_purchase` rule, the action opens a sheet. It has a payment count, the rule's warnings, and the schedule preview at the card's split rate, with interest from today.
    - Saving converts the transaction into a credit plan: `plan: 'credit'`, `installments` n, the split rate snapshotted. Its first payment falls on the next billing date, or, when the purchase was already billed, the billing date after that. It is not a second transaction.

**Behaviour copy (en / he):**

| key                  | en                                | he                        |
| -------------------- | --------------------------------- | ------------------------- |
| `split.action`       | Split into payments               | פריסה לתשלומים            |
| `split.title`        | Split this purchase               | פריסת העסקה               |
| `split.save`         | Split it                          | לפרוס                     |
| `cards.followsPrime` | Follows prime from payment {{at}} | צמוד לפריים מתשלום {{at}} |

- [ ] **Step 1: Write the failing tests.**
  - **Occurrences.**
    - With `reset.paymentMinor`, payments before `atPayment` use `amountMinor` and payments from `atPayment` use the reset payment.
    - Without it, every payment is the same.
  - **The sweep:**
    - before the date, a prime change updates `paymentMinor`;
    - on and after the date, it freezes;
    - a later prime change leaves a frozen plan unchanged;
    - running it twice writes nothing the second time.
  - **Split:**
    - converting keeps the same id and charges the right first date in both cases (not yet billed, already billed);
    - the warnings show.
  - **Cards.** Commitments sum the reset payments, and the mark renders.
- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, then `pnpm verify`.**
- [ ] **Step 5: Commit** with the message "Long credit follows prime until payment 19, purchases can be split, and Cards shows both".

---

### Task 10: README, privacy check, and the browser test

**Files:**

- Modify: `README.md` (a section on the card catalog)
- Create: `e2e/card-catalog.spec.ts`

- [ ] **Step 1: Write the browser test.** Follow the existing `e2e/*.spec.ts` setup, with demo data and the English project only:
  1. Open Cards and add a credit card. Choose Bank Mizrahi → Max → International.
  2. Expect the rate table to show the קרדיט row with "15.50%" and "16.65%" (the effective rate at prime 4.75). If the e2e build pins a different stored prime, compute the expected figures from the app's built-in Bank of Israel rate instead.
  3. Add an expense of ₪3,000 on that card. Choose קרדיט פלוס with 24 payments.
  4. Expect the schedule text to contain "From payment 19". Save, and expect the feed row.
- [ ] **Step 2: Run it.** Run `pnpm exec playwright test e2e/card-catalog.spec.ts`. Expected: PASS.
- [ ] **Step 3: Update the README.** The section covers:
  - what the catalog covers (the card companies and banks);
  - that its figures are the published ones, often maximums, each with a source and date;
  - that unpublished rates are typed from the statement;
  - that מתואמת is computed from the nominal rate and its compounding;
  - that Max's long credit re-prices at payment 19.

  The privacy page needs no change, because nothing is sent anywhere. Say so in the commit message.

- [ ] **Step 4: Run the full checks.** Run `pnpm verify`, then `pnpm exec playwright test`. Expected: everything passes.
- [ ] **Step 5: Commit** with the message "Card catalog: README and the end-to-end test (no privacy change: nothing leaves the device)".

Going live is the controller's job after the final review: merge, push, `pnpm release`. There is no migration and no edge function.
