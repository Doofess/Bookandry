# Cards and ways to pay: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every card the household pays with (credit, debit, prepaid, gift) lives on one "Cards" screen and is added through one step-by-step pop-out that asks each question once, in the order Israeli cards really work (kind, bank card or not, bank, card company, network). Cash, cheques, transfers, standing orders, Bit / PayBox and "Other" become fixed built-in ways to pay.

**Architecture:** Three releases. **A** ships quick wins on today's screens in two deploys: **A1**, a compatibility build that opens `type` parsing, keeps card details on every type and seeds the built-ins; then **A2**, the rename, the Cards screen with every kind, no "Other ways to pay", and a "New Card" dialog. **B** replaces the card editor with the pop-out flow. The flow is driven by pure functions in `src/domain/card-flow.ts` over a dated catalog matrix. **C** makes the transaction form's Type follow the way to pay, and teaches Smart import to suggest cards seen only on rows and to doubt bad reads.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 4, Base UI (dialog, menu), Dexie (IndexedDB), Zod 4, i18next (en and he, full RTL), Vitest with fake-indexeddb, Playwright, Supabase sync.

**Spec:** `docs/superpowers/specs/2026-10-09-add-card-flow-design.md` (sections 1 to 22; section 22 was added with this plan and records where the user's requests overrule the spec). Research: `docs/research/2026-10-09-israeli-debit-cards.md` and `docs/research/2026-10-10-israeli-card-issuers-and-operators.md` (on the `research` branches; worktree `C:/dev/greenback-research`). Visual source: `docs/superpowers/specs/2026-10-09-colour-of-money-design.md` §6.2 to §6.4 and §7.

## Global Constraints

- Node is at `/c/Users/HighL/AppData/Local/node` and is not on PATH. Start every shell command with `export PATH="/c/Users/HighL/AppData/Local/node:$PATH" &&`.
- Work in `C:/dev/greenback-addcard` on branch `add-card-flow`. Never push, never merge to `main`. The user runs deploys.
- `pnpm verify` is the gate at the end of every task group, and must be green before each release: typecheck, lint, format, `gate:rtl`, `gate:money`, `gate:pci`, unit tests with coverage, build. Use `pnpm verify:full` (Playwright, Lighthouse, knip, hostile timezone) before each release.
- One test file: `pnpm test <path>` (vitest, `TZ=Etc/UTC`). One e2e file: `pnpm exec playwright test <path> --project=en`.
- Commit messages are one plain sentence saying what changed for the person, as the repo's history does, and end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Money is integer minor units. Dates are `"YYYY-MM-DD"` strings. No date library. No float maths on money (`gate:money`).
- Logical CSS only: `ms-`, `pe-`, `start-`, `inset-bs-`, never `ml-`, `pr-`, `left-`, `top-` (`gate:rtl`). Colours, radii and shadows are tokens (`--popover`, `--primary`, `--border`, `--money-*`). No colour is written into a component.
- CSS follows the `good-css` skill: `:hover` only inside `(hover: hover) and (pointer: fine)` (Tailwind: `hover-fine:`), `:focus-visible` with an outline, an `:active` state on everything pressable, motion only under `prefers-reduced-motion: no-preference` (`motion-safe:`), named transition properties, never `all`, never `ease-in`, `overflow: clip` unless a script scrolls it. Layout inside the pop-out uses container queries (`@container`), not viewport breakpoints.
- Never store a card number, CVV, PIN, voucher code, gift code or redeem code (`gate:pci`). Only the last 4 digits and the expiry month.
- Every new string exists in `src/i18n/locales/en/*.json` and `src/i18n/locales/he/*.json`. Hebrew uses the plural address ("הזינו", "בחרו") and `_one`, `_two`, `_other` plurals. Never the word "sync" in copy.
- `card.funding` and `PaymentMethod.type` are open strings on read: an unknown value never makes a row fail to parse.
- No release writes a new `PaymentMethodType` value. Debit, prepaid and gift are `type: 'debit_card'` with `card.funding`.
- Existing behaviour stays: card bills and billing days, MCC business types, the Cash tab, Smart import with its Expenses / Income / Both switch, sync, export and import.
- Every touch target is at least 44 by 44 px.

## Review Focus

The five failures most likely to reach a person, each pinned by a test in the task that owns the code:

1. **An older build wipes a debit, prepaid or gift card's details.** Expected: after A1, no build writes `card: null` for a card it doesn't edit, and every key it doesn't know survives an edit, a sync and a file round trip. Pinned in Task A3 (`method-editor-compat.test.tsx`: editing a `debit_card` with `card.funding: 'gift'` keeps the whole `card`) and Task A1 (`transfer-schema.test.ts`: an unknown `type` and `funding` round-trip).
2. **A cascade step offers an empty list.** Expected: every reachable (kind, bank card or not, bank, company, network) path offers at least one choice, and always the escape. Pinned in Task B2 (`card-matrix.test.ts`, "never empty" over every bank code in `banks.ts`) and in `catalog:check`.
3. **Hebrew RTL breaks the flow.** Expected: the step body slides from the inline end, Back and Next arrows mirror, "·1234" and "03/31" read left to right, nothing scrolls sideways at 320 px. Pinned in Task B7 (`card-flow-dialog.test.tsx`, he render: `dir="rtl"`, isolates around digits) and Task B15 (`e2e/19-card-flow.spec.ts`, 320 px Hebrew no-horizontal-scroll check on every step).
4. **The data model change loses or mangles cards on migration or sync.** Expected: an existing card reads through `cardIdentityOf` without a Dexie migration, the legacy `card.bank` text is still written, a second device that hasn't updated keeps working. Pinned in Task B4 (`cards-identity.test.ts`, every row of spec 21.8) and Task B5 (`card-moves` sync and export round trip, a file without `cardMoves` imports).
5. **A built-in method row is confused with a custom row of the same type.** Expected: the six built-ins are always offered, can't be renamed, archived or deleted; a person's own "Bit" or "Transfer to landlord" row keeps its transactions and is offered only on those transactions. Pinned in Task A2 (`payment-methods.test.ts` guards for all six ids, `ensureBuiltinPaymentMethods` upload and re-add) and Task A7 (`tx-options.test.ts`: a custom `digital_wallet` row only as `keepId`; `integrity.test.ts`: a transaction on `pm.transfer` is never cleared).

## Rulings taken for this plan

The user asked Claude to take the recommended answer to every open question. These are recorded in the spec, section 22.

1. **R2 and R9 together.** R9 says the compatibility build ships first, on its own. R2 wants the Cards screen to hold every kind in Release A. Ruling: Release A is two deploys. **A1** (compatibility and the R10 fix) ships first. **A2** (rename, every kind, no "Other ways to pay", "New Card") ships once A1 is open on every device the household uses. A2 may then write `card.funding`.
2. **R4 and the Bank accounts screen.** The same editor component serves bank accounts. Ruling: the editor has **no Type switch at all**. Opened from Cards it is "New Card" ("כרטיס חדש") with a **Kind** choice: Credit, Debit, Prepaid, Gift. Opened from Bank accounts it is "New bank account" with the account fields only. Bank transfer, standing order, digital wallet and other can't be created anywhere.
3. **R4's dialog is interim.** Spec decision 6 says a card is only added through the flow. Ruling: the A2 dialog is replaced by the flow in Release B. In A2 the kind can be chosen only for a **new** card. Changing an existing card's kind waits for B's summary (spec 7.1), because it needs the "payments still to come" block.
4. **R7 and bank accounts.** R7 says the Type control is "only for cards", but the user also asked to keep existing behaviour. Ruling: a **bank account** keeps Regular, Standing order and Loan, as today (a mortgage or rent paid from the account must stay possible). The built-in **Standing order** opens the standing-order form. **Bank transfer, Bit / PayBox and Other** are amount only, one time, as cash is.
5. **R7 and spec 18.1.** Spec 18.1's test list still said a debit card takes no standing order. The user's rule (10.4) wins: debit, prepaid and gift cards take Regular and Standing order. 18.1 is amended.
6. **R7's cheques.** "How many cheques and each due date" is stored as today's cheque set: an `installments` plan on `pm.cheque` with N payments. Each changed due date is an occurrence override with `patch.date`. One cheque is `one_time`. No new storage.
7. **R10.** Not reproducible as a deterministic regression from the redesign. Real pointer, touch, keyboard, scripted `element.click()` and synthetic clicks all open the editor and archive, at 390, 768, 1024, 1100, 1280 and 1920 px, in English and Hebrew. Under load, the Undo toast ("Yossi card archived · Undo", Sonner, bottom inline end, stacked above every pop-out) **intercepts clicks on menu items** of a card menu opened near the bottom of the screen, and the press on the toast closes the menu as an outside press. Playwright's log showed "`[data-sonner-toast]` … intercepts pointer events", then "`[data-slot="popup-backdrop"]` intercepts pointer events". An automated browser clicks at screen coordinates without retrying, so it hits the toast: the item "does nothing". Fix in A1: anchored pop-outs treat the visible toast stack as screen edge, as they already do the phone's tab bar.
8. **R11's "low confidence".** A card read is low confidence when it carries any of `reads_disagree`, `one_read_only`, `not_in_source`, `name_unreadable` (new) or `near_known` (new), or was seen only on rows (R8). Such a card is never ticked, and saving it always goes through the flow or an explicit confirm.
9. **`catalog:check`.** The checks run as the catalog's Vitest file, which `pnpm verify` already runs. A `catalog:check` script runs that file alone. `catalog:sources` is a manual Node script, never in CI.
10. **Direction of step motion.** The flow uses the app's own `morph()` with a direction attribute on `<html>` (`data-flow-dir="forward|back"`), as `data-nav-dir` already does, rather than `startViewTransition({ types })`. Typed transitions became Baseline only in January 2026; the attribute works wherever view transitions do.

## File map

| File                                                                                               | Release   | Responsibility                                                                                                   |
| -------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/types/domain.ts`                                                                              | A1, A2, B | Built-in ids (six), `BUILTIN_METHODS_SINCE`, `CardDetails` new optional fields, `CardMove`, `CardCompany` alias. |
| `src/domain/transfer-schema.ts`                                                                    | A1, B     | Open `type`, new optional card keys, `cardMoves` schema.                                                         |
| `src/domain/tx-options.ts`                                                                         | A1, A2, C | `methodTypeOf`, "Paid with" order and built-ins, `typesFor(method)`.                                             |
| `src/db/seed.ts`, `src/db/repos/payment-methods.ts`                                                | A1        | Six built-ins, guards, `ensureBuiltinPaymentMethods` with upload.                                                |
| `src/i18n/method-name.ts`                                                                          | A1        | Display names of six built-ins.                                                                                  |
| `src/components/ui/popup-parts.tsx`                                                                | A1        | Bottom inset counts the toast stack (R10).                                                                       |
| `src/features/cards/method-editor.tsx`                                                             | A1, A2, B | A1: never drops `card`. A2: no Type switch, "New Card" with Kind, no `OtherMethods`. B: bank accounts only.      |
| `src/domain/cards.ts`                                                                              | A2, B     | `cardKindOf`, `countsInBalance`; B: `cardIdentityOf`, widened fees.                                              |
| `src/features/cards/cards-screen.tsx`, `use-cards-data.ts`                                         | A2, B     | Every kind, grouped; B: kind panels, the flow's callers.                                                         |
| `src/data/card-catalog/*`                                                                          | B         | Matrix cells, programmes, new banks, `CATALOG_VERSION = 2`, checks.                                              |
| `src/domain/card-flow.ts`                                                                          | B         | The flow's pure logic: state, steps, choices, names, saving.                                                     |
| `src/domain/card-pots.ts`, `src/db/repos/card-moves.ts`                                            | B         | Prepaid and gift pots, the `start` move.                                                                         |
| `src/features/cards/card-flow/*`                                                                   | B         | The pop-out, the steps, the review and the summary.                                                              |
| `src/features/transaction/*`                                                                       | B, C      | "Add a card" in "Paid with"; C: Type by way to pay, cheque dates.                                                |
| `src/domain/import-cards.ts`, `import-wire.ts`, `import-sheet-readers.ts`, `src/features/import/*` | C         | Cards from rows, the cardholder, read validation, issuer and operator fields.                                    |
| `scripts/catalog-sources.mjs`                                                                      | B         | Manual source checker.                                                                                           |

## Parallel groups

- **Release A1:** Tasks A1, A2, A3 and A4 are independent (different files). Run them in parallel, then Task A5 (verify and release notes) alone.
- **Release A2:** Task A6 first (A7, A8 and A9 read `cardKindOf`). Then Task A8 (it adds the copy A7's hints use and edits `cards-screen.tsx` first). Then Tasks A7 and A9 in parallel (different files). Then Task A10 (verify) alone.
- **Release B:** Tasks B1, B4 and B5 in parallel (catalog data; identity and fees; pots). Then B2 (needs B1's types and data). Then B3 and B6 in parallel (B3 needs B2, B4 and B5; B6 needs B2's `Choices`). Then B7. Then B8 and B9 in parallel (different step files). Then B10. Then B11 and B12 in parallel (Cards screen; transaction form and import). Then B13, then B14, then B15 alone.
- **Release C:** Tasks C1 and C2 in parallel (transaction form; import). Then C3 (same import files as C2), then C4 (same files again), then C5 alone.

---

# RELEASE A: quick wins on today's screens

Two deploys. Deploy **A1** first. Deploy **A2** once every device in the household has opened A1 (Settings → About shows the A1 version).

## Release A1: compatibility

### Task A1: Open `type`, keep unknown card keys in files, and read every type through `methodTypeOf`

**Files:**

- Modify: `src/types/domain.ts` (the `PaymentMethodType` block, `CardDetails`)
- Modify: `src/domain/transfer-schema.ts:164-262` (`cardSchema`, `paymentMethodSchema`)
- Modify: `src/domain/tx-options.ts` (new `methodTypeOf`; `methodFits`, `standingViaOf` read through it)
- Modify: `src/domain/cards.ts:52` (`billingDayOf`), `src/features/feed/feed-rows.tsx`, `src/domain/income-destination.ts`, `src/features/transaction/use-transaction-sheet.ts`, `src/features/transaction/payment-method-field.tsx:57`, `src/features/cards/method-editor.tsx:209`
- Test: `src/domain/transfer-schema.test.ts`, `src/domain/tx-options.test.ts`, `src/db/sync/apply.test.ts`

**Interfaces:**

- Produces: `PAYMENT_METHOD_TYPES: readonly PaymentMethodType[]` and `methodTypeOf(method: Pick<PaymentMethod, 'type'>): PaymentMethodType` (an unknown string reads as `'other'`), both exported from `src/domain/tx-options.ts`.
- Produces on `CardDetails` (all optional): `funding?: string`, `issuerName?: string`, `loadCardId?: string`, `loadFeeMinor?: number`, `acceptedAt?: string`, `issuerBank?: string`, `productName?: string`, `checked?: true`. A1 only parses and keeps them; nothing writes them yet.

- [ ] **Step 1: Write the failing tests**

In `src/domain/transfer-schema.test.ts`, add:

```ts
import { rowSchemas } from './transfer-schema';

const METHOD = {
  id: 'pm-1',
  profileId: '*',
  label: 'Future card',
  isArchived: 0,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
} as const;

describe('an open payment-method type', () => {
  it('accepts a type a later build writes, and keeps it as written', () => {
    const parsed = rowSchemas.paymentMethods.safeParse({ ...METHOD, type: 'prepaid_card' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.type).toBe('prepaid_card');
  });

  it('still refuses an empty or over-long type', () => {
    expect(rowSchemas.paymentMethods.safeParse({ ...METHOD, type: '' }).success).toBe(false);
    expect(rowSchemas.paymentMethods.safeParse({ ...METHOD, type: 'x'.repeat(31) }).success).toBe(false);
  });
});

describe('card keys of every kind', () => {
  it('parses and keeps funding, gift, prepaid and issuer keys', () => {
    const card = {
      funding: 'gift',
      issuerName: 'BuyMe',
      loadCardId: 'pm-credit',
      loadFeeMinor: 350,
      acceptedAt: '60 chains',
      issuerBank: '11',
      productName: 'Dream Card VIP',
      checked: true,
    };
    const parsed = rowSchemas.paymentMethods.parse({ ...METHOD, type: 'debit_card', card });
    expect(parsed.card).toEqual(card);
  });

  it('accepts a funding value this build does not know', () => {
    const parsed = rowSchemas.paymentMethods.safeParse({
      ...METHOD,
      type: 'debit_card',
      card: { funding: 'crypto' },
    });
    expect(parsed.success).toBe(true);
  });

  it('refuses an issuing bank that is not a bank code', () => {
    const parsed = rowSchemas.paymentMethods.safeParse({
      ...METHOD,
      type: 'credit_card',
      card: { issuerBank: 'Leumi' },
    });
    expect(parsed.success).toBe(false);
  });
});
```

In `src/domain/tx-options.test.ts`, add:

```ts
import { methodFits, methodTypeOf, standingViaOf } from './tx-options';

describe('methodTypeOf', () => {
  it('reads a known type as itself', () => {
    expect(methodTypeOf({ type: 'debit_card' })).toBe('debit_card');
  });
  it('reads a type from a later build as other', () => {
    expect(methodTypeOf({ type: 'prepaid_card' as never })).toBe('other');
  });
  it('makes an unknown type fit a one-time purchase and nothing a card company runs', () => {
    const future = { type: 'prepaid_card' as never };
    expect(methodFits(future, 'one_time')).toBe(true);
    expect(methodFits(future, 'credit')).toBe(false);
    expect(standingViaOf(future)).toBeUndefined();
  });
});
```

In `src/db/sync/apply.test.ts`, add a case next to the existing "stores the row as received" case: apply a `paymentMethods` record with `type: 'prepaid_card'` and `card: { funding: 'gift', futureKey: 1 }`, and expect `await db.paymentMethods.get(id)` to equal the record's row exactly.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/domain/transfer-schema.test.ts src/domain/tx-options.test.ts src/db/sync/apply.test.ts`
Expected: FAIL. The open-type cases fail on the `z.enum`, the card keys are stripped, and `methodTypeOf` is not exported.

- [ ] **Step 3: Implement**

In `src/types/domain.ts`, add to `CardDetails` (after `overrides`), each with a one-line doc comment:

```ts
  /** debit, prepaid or gift on a `debit_card`; absent on a credit card. Open: an unknown value reads as debit. */
  readonly funding?: string;
  /** The company name typed under "Other": BuyMe, a mall. Only when `issuer` is 'other'. */
  readonly issuerName?: string;
  /** A prepaid card's loading credit card: a `credit_card` method's id. */
  readonly loadCardId?: string;
  /** A prepaid card's fee for each load. */
  readonly loadFeeMinor?: number;
  /** Where a gift card is accepted, as a short label. */
  readonly acceptedAt?: string;
  /** The issuing bank of a bank card, as a Masav code. Separate from the paying account. */
  readonly issuerBank?: string;
  /** The card's name as a document prints it: "Dream Card VIP". */
  readonly productName?: string;
  /** The person confirmed an unverified bank, company and network combination. */
  readonly checked?: true;
```

Change `PaymentMethod.card`'s comment from "Credit cards only: …" to "Cards of every kind: billing day, issuer, fees and the rest."

In `src/domain/transfer-schema.ts`, add to `cardSchema`:

```ts
  // Open, never an enum: a kind a later release adds reads as debit here.
  funding: z.string().min(1).max(20).optional(),
  issuerName: shortText.optional(),
  loadCardId: z.string().min(1).optional(),
  loadFeeMinor: minorAmount.optional(),
  acceptedAt: shortText.optional(),
  issuerBank: z.string().regex(/^\d{1,3}$/).optional(),
  productName: shortText.optional(),
  checked: z.literal(true).optional(),
```

and replace `paymentMethodSchema.type`:

```ts
  // Open: a type a later release writes is kept and read as "other"
  // (methodTypeOf), so this build never drops the row on a pull or refuses a file.
  type: z.string().min(1).max(30),
```

In `src/domain/tx-options.ts`, add:

```ts
export const PAYMENT_METHOD_TYPES: readonly PaymentMethodType[] = [
  'cash',
  'cheque',
  'credit_card',
  'debit_card',
  'bank_transfer',
  'standing_order',
  'digital_wallet',
  'bank_account',
  'other',
];
const KNOWN_TYPES: ReadonlySet<string> = new Set(PAYMENT_METHOD_TYPES);

/** The type every reader uses: one a later build added reads as "other". */
export function methodTypeOf(method: Pick<PaymentMethod, 'type'>): PaymentMethodType {
  return KNOWN_TYPES.has(method.type) ? method.type : 'other';
}
```

Then make `methodFits` and `standingViaOf` switch on `methodTypeOf(method)` instead of `method.type`, and do the same in `billingDayOf` (`methodTypeOf(method) !== 'credit_card'`, guarding `undefined` first), `feed-rows.tsx`, `income-destination.ts`, `use-transaction-sheet.ts`, and the two label lookups (`PAYMENT_TYPE_KEY[methodTypeOf(method)]`, `TYPE_KEY[methodTypeOf(method)]`). Find any reader left with:

Run: `grep -rnE "\.type (===|!==) '(cash|cheque|credit_card|debit_card|bank_transfer|standing_order|digital_wallet|bank_account|other)'|TYPE_KEY\[[a-z]+\.type\]" src --include=*.ts --include=*.tsx | grep -v "\.test\."`

Each hit outside `tx-options.ts` goes through `methodTypeOf`. A direct comparison with one literal is equivalent for known types and false for an unknown one, which is the "other" reading, so a hit like `m.type === 'credit_card'` may stay. Only exhaustive switches and record lookups must change.

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm test src/domain/transfer-schema.test.ts src/domain/tx-options.test.ts src/db/sync/apply.test.ts && pnpm typecheck`
Expected: PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/domain.ts src/domain/transfer-schema.ts src/domain/tx-options.ts src/domain/cards.ts src/features src/domain/income-destination.ts src/domain/transfer-schema.test.ts src/domain/tx-options.test.ts src/db/sync/apply.test.ts
git commit -m "A payment method of a type a later version adds, and card details of every kind, are kept and shown as Other instead of being dropped

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task A2: Six built-in ways to pay, seeded, guarded and uploaded

**Files:**

- Modify: `src/types/domain.ts:10-31` (ids, `isBuiltinPaymentMethod`, comment)
- Modify: `src/db/seed.ts:93-115` (`buildSeedPaymentMethods`)
- Modify: `src/db/repos/payment-methods.ts:288-305` (`ensureBuiltinPaymentMethods`)
- Modify: `src/i18n/method-name.ts`
- Modify: `src/i18n/locales/en/profiles.json`, `src/i18n/locales/he/profiles.json` (new `builtin.wallet`)
- Test: `src/db/seed.test.ts`, `src/db/repos/payment-methods.test.ts`, `src/i18n/method-name.test.ts` (new), `src/db/integrity.test.ts`

**Interfaces:**

- Produces: `TRANSFER_METHOD_ID = 'pm.transfer'`, `STANDING_ORDER_METHOD_ID = 'pm.standing_order'`, `WALLET_METHOD_ID = 'pm.wallet'`, `OTHER_METHOD_ID = 'pm.other'`, `BUILTIN_METHOD_IDS` (the six, in "Paid with" order: cash, cheque, transfer, standing order, wallet, other), `BUILTIN_METHODS_SINCE = '2026-10-10T00:00:00.000Z'`, all from `src/types/domain.ts`.
- Consumes: `readOrCreateDeviceId` (`src/db/sync/device.ts`), `revFromIso` (`src/lib/rev.ts`), `SyncStateRow`, `OutboxRow` (`src/db/sync/tables.ts`), `withoutTracking` (`src/db/db.ts`).

- [ ] **Step 1: Write the failing tests**

`src/i18n/method-name.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { initTestI18n } from '@/test/render';
import {
  BUILTIN_METHOD_IDS,
  OTHER_METHOD_ID,
  TRANSFER_METHOD_ID,
  WALLET_METHOD_ID,
  type PaymentMethod,
} from '@/types/domain';

import { methodDisplayName } from './method-name';

const row = (id: string, label: string): PaymentMethod => ({
  id,
  label,
  profileId: '*',
  type: 'other',
  isArchived: 0,
  createdAt: '2026-10-10T00:00:00.000Z' as PaymentMethod['createdAt'],
  updatedAt: '2026-10-10T00:00:00.000Z' as PaymentMethod['updatedAt'],
});

describe('built-in names follow the language, whatever label is stored', () => {
  beforeAll(async () => {
    await initTestI18n('he');
  });

  it('names every built-in in Hebrew', () => {
    const t = i18n.getFixedT('he');
    expect(methodDisplayName(row(TRANSFER_METHOD_ID, 'Bank transfer'), t)).toBe('העברה בנקאית');
    expect(methodDisplayName(row(WALLET_METHOD_ID, 'Bit / PayBox'), t)).toBe('ביט / פייבוקס');
    expect(methodDisplayName(row(OTHER_METHOD_ID, 'Other'), t)).toBe('אחר');
    expect(BUILTIN_METHOD_IDS).toHaveLength(6);
  });

  it('keeps a person’s own label on their own row', () => {
    expect(methodDisplayName(row('pm-x', 'Bit'), i18n.getFixedT('he'))).toBe('Bit');
  });
});
```

In `src/db/repos/payment-methods.test.ts`, add:

```ts
describe('the six built-ins', () => {
  it.each(BUILTIN_METHOD_IDS)('%s cannot be renamed, given an owner, archived or deleted', async (id) => {
    await ensureBuiltinPaymentMethods(db, NOW);
    await expect(updatePaymentMethod(db, id, { label: 'Mine' }, NOW)).rejects.toThrow(/built in/);
    await expect(updatePaymentMethod(db, id, { profileId: 'p1' }, NOW)).rejects.toThrow(/built in/);
    await expect(setPaymentMethodArchived(db, id, true, NOW)).rejects.toThrow(/built in/);
    await expect(deletePaymentMethod(db, id, {}, NOW)).rejects.toThrow(/built in/);
  });

  it('adds the new four to an older database, dated the fixed instant, and queues each for upload', async () => {
    await db.paymentMethods.clear();
    await db.syncState.clear();
    await db.outbox.clear();
    await ensureBuiltinPaymentMethods(db, NOW);
    const transfer = await db.paymentMethods.get(TRANSFER_METHOD_ID);
    expect(transfer).toMatchObject({ type: 'bank_transfer', profileId: SHARED_OWNER });
    expect(transfer?.createdAt).toBe(BUILTIN_METHODS_SINCE);
    const state = await db.syncState.get(['paymentMethods', TRANSFER_METHOD_ID]);
    expect(parseRev(state?.rev ?? '').ms).toBe(Date.parse(BUILTIN_METHODS_SINCE));
    expect(await db.outbox.get(['paymentMethods', TRANSFER_METHOD_ID])).toBeDefined();
    // Cash and cheques stay untracked, as before.
    expect(await db.syncState.get(['paymentMethods', CASH_METHOD_ID])).toBeUndefined();
  });

  it('leaves a row this device already holds alone', async () => {
    await ensureBuiltinPaymentMethods(db, NOW);
    await db.paymentMethods.update(WALLET_METHOD_ID, { isArchived: 1 });
    await ensureBuiltinPaymentMethods(db, LATER);
    expect((await db.paymentMethods.get(WALLET_METHOD_ID))?.isArchived).toBe(1);
  });

  it('adds back, with a newer rev, a built-in an older build deleted', async () => {
    await ensureBuiltinPaymentMethods(db, NOW);
    await db.paymentMethods.delete(OTHER_METHOD_ID); // tracked: the sync state records a deletion
    const deleted = await db.syncState.get(['paymentMethods', OTHER_METHOD_ID]);
    expect(deleted?.deleted).toBe(1);
    await ensureBuiltinPaymentMethods(db, LATER);
    const back = await db.syncState.get(['paymentMethods', OTHER_METHOD_ID]);
    expect(await db.paymentMethods.get(OTHER_METHOD_ID)).toBeDefined();
    expect(back?.deleted).toBe(0);
    expect(back !== undefined && deleted !== undefined && back.rev > deleted.rev).toBe(true);
  });
});
```

(`NOW` and `LATER` are two `IsoInstant`s in the file's existing style; `parseRev` comes from `@/lib/rev`.)

In `src/db/integrity.test.ts`, add: with the built-ins ensured, a transaction whose `paymentMethodId` is `pm.transfer` produces no `missing_payment_method` issue, and `repairIntegrity` leaves it.

In `src/db/seed.test.ts`, change the cash-and-cheque expectation to the six ids in `BUILTIN_METHOD_IDS` order.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/i18n/method-name.test.ts src/db/repos/payment-methods.test.ts src/db/seed.test.ts src/db/integrity.test.ts`
Expected: FAIL: the new ids are not exported, and only two rows are seeded.

- [ ] **Step 3: Implement**

`src/types/domain.ts`:

```ts
export const CASH_METHOD_ID = 'pm.cash';
export const CHEQUE_METHOD_ID = 'pm.cheque';
/** העברה בנקאית, הוראת קבע, ביט / פייבוקס, אחר: built in since 2026-10-10, never created by hand. */
export const TRANSFER_METHOD_ID = 'pm.transfer';
export const STANDING_ORDER_METHOD_ID = 'pm.standing_order';
export const WALLET_METHOD_ID = 'pm.wallet';
export const OTHER_METHOD_ID = 'pm.other';

/** Every built-in, in the order "Paid with" lists them. */
export const BUILTIN_METHOD_IDS = [
  CASH_METHOD_ID,
  CHEQUE_METHOD_ID,
  TRANSFER_METHOD_ID,
  STANDING_ORDER_METHOD_ID,
  WALLET_METHOD_ID,
  OTHER_METHOD_ID,
] as const;

/** The one instant the four newer built-ins are dated at, on every device, so identical rows race harmlessly. */
export const BUILTIN_METHODS_SINCE = '2026-10-10T00:00:00.000Z' as IsoInstant;

const BUILTINS: ReadonlySet<string> = new Set(BUILTIN_METHOD_IDS);

export function isBuiltinPaymentMethod(id: string): boolean {
  return BUILTINS.has(id);
}
```

Rewrite the block comment above them: the built-ins are seeded, their names follow the UI language, they can't be renamed, given an owner, archived or deleted (the repo enforces this), and the four newer ones are synced rows so that a device on an older build receives them before any transaction that names them.

`src/db/seed.ts`, `buildSeedPaymentMethods(now)` returns the two existing rows (dated `now`) followed by:

```ts
    ...(
      [
        [TRANSFER_METHOD_ID, 'bank_transfer', 'Bank transfer'],
        [STANDING_ORDER_METHOD_ID, 'standing_order', 'Standing order'],
        [WALLET_METHOD_ID, 'digital_wallet', 'Bit / PayBox'],
        [OTHER_METHOD_ID, 'other', 'Other'],
      ] as const
    ).map(
      ([id, type, label]): PaymentMethod => ({
        id,
        profileId: SHARED_OWNER,
        type,
        label,
        isArchived: 0,
        createdAt: BUILTIN_METHODS_SINCE,
        updatedAt: BUILTIN_METHODS_SINCE,
      }),
    ),
```

`src/db/repos/payment-methods.ts`, replace `ensureBuiltinPaymentMethods`:

```ts
/** The newer built-ins: synced rows, unlike cash and cheques (spec 10.2). */
const SYNCED_BUILTINS: ReadonlySet<string> = new Set([
  TRANSFER_METHOD_ID,
  STANDING_ORDER_METHOD_ID,
  WALLET_METHOD_ID,
  OTHER_METHOD_ID,
]);

/**
 * The built-ins, on any install that lacks one.
 *
 * Cash and cheques are added untracked, as they always were: every install
 * writes the identical row. The newer four are uploaded, dated the one fixed
 * instant, so a device on an older build receives them before a transaction
 * that names them, and its integrity repair never clears one. A real edit
 * (an archive on an older build) has a later rev and wins. One that an older
 * build deleted is added back as an ordinary edit, so it returns everywhere.
 */
export async function ensureBuiltinPaymentMethods(db: BookandryDB, now: IsoInstant): Promise<void> {
  const seeds = buildSeedPaymentMethods(now);
  const deviceId = await readOrCreateDeviceId(db.meta);
  for (const method of seeds) {
    if ((await db.paymentMethods.get(method.id)) !== undefined) continue;
    const state = await db.syncState.get(['paymentMethods', method.id]);
    if (SYNCED_BUILTINS.has(method.id) && state?.deleted === 1) {
      // Tracked: the middleware gives it a rev newer than the deletion.
      await db.paymentMethods.put({ ...method, updatedAt: now });
      continue;
    }
    await withoutTracking(db, [db.paymentMethods, db.syncState, db.outbox], async () => {
      await db.paymentMethods.add(method);
      if (!SYNCED_BUILTINS.has(method.id) || state !== undefined) return;
      await db.syncState.put({
        tbl: 'paymentMethods',
        id: method.id,
        rev: revFromIso(BUILTIN_METHODS_SINCE, deviceId),
        deleted: 0,
      });
      await db.outbox.put({ tbl: 'paymentMethods', id: method.id });
    });
  }
}
```

(If `db.meta`'s table type does not match `readOrCreateDeviceId`'s `MetaTable`, pass `db.table('meta')` as `versions.ts:139` does.)

`src/i18n/method-name.ts`:

```ts
type MethodKey =
  | 'profiles:method.cash'
  | 'profiles:method.cheque'
  | 'profiles:method.bank_transfer'
  | 'profiles:method.standing_order'
  | 'profiles:builtin.wallet'
  | 'profiles:method.other';

const BUILTIN_NAME: Readonly<Record<string, MethodKey>> = {
  [CASH_METHOD_ID]: 'profiles:method.cash',
  [CHEQUE_METHOD_ID]: 'profiles:method.cheque',
  [TRANSFER_METHOD_ID]: 'profiles:method.bank_transfer',
  [STANDING_ORDER_METHOD_ID]: 'profiles:method.standing_order',
  [WALLET_METHOD_ID]: 'profiles:builtin.wallet',
  [OTHER_METHOD_ID]: 'profiles:method.other',
};

export function methodDisplayName(method: PaymentMethod, t: Translate): string {
  const key = BUILTIN_NAME[method.id];
  return key === undefined ? method.label : t(key);
}
```

`profiles.json`: en `"builtin": { "wallet": "Bit / PayBox" }`, he `"builtin": { "wallet": "ביט / פייבוקס" }`.

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/i18n/method-name.test.ts src/db/repos/payment-methods.test.ts src/db/seed.test.ts src/db/integrity.test.ts src/db/versions.test.ts src/db/sync`
Expected: PASS. `versions.test.ts` and the sync tests must stay green: `seedChangeTracking` now treats all six as built-ins, which only skips pristine ones.

- [ ] **Step 5: Commit**

```bash
git add src/types/domain.ts src/db/seed.ts src/db/repos/payment-methods.ts src/i18n src/db/seed.test.ts src/db/repos/payment-methods.test.ts src/db/integrity.test.ts
git commit -m "Bank transfer, standing order, Bit / PayBox and Other are built-in ways to pay on every device, alongside cash and cheques

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task A3: The editor never drops a card's details

**Files:**

- Modify: `src/features/cards/method-editor.tsx:399-450` (`MethodForm.save`)
- Test: `src/features/cards/method-editor-compat.test.tsx` (new)

**Interfaces:**

- Consumes: `updatePaymentMethod(db, id, patch, now)` where `card: undefined` means "leave alone".
- Produces: `MethodForm` writes `card` only for a credit card it edits; for every other type it leaves `card` as it is.

- [ ] **Step 1: Write the failing test**

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db/db';
import { createPaymentMethod } from '@/db/repos/payment-methods';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { MethodForm } from './method-editor';

const NOW = '2026-10-10T10:00:00.000Z' as Parameters<typeof createPaymentMethod>[3];

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(async () => {
  await db.paymentMethods.clear();
});

describe('saving a card the editor does not fully understand', () => {
  it.each([
    ['debit', { funding: 'debit', accountId: 'acc-1', lastDigits: '1234', monthlyFeeMinor: 700 }],
    ['prepaid', { funding: 'prepaid', loadCardId: 'pm-c', loadFeeMinor: 350, lastDigits: '5678' }],
    ['gift', { funding: 'gift', issuer: 'other', issuerName: 'BuyMe', acceptedAt: 'Spa' }],
    ['future', { funding: 'crypto', someKeyFromLater: 'kept' }],
  ])('keeps every detail of a %s card when only its label changes', async (_, card) => {
    const method = await createPaymentMethod(
      db,
      'pm-d',
      { label: 'Old name', type: 'debit_card', profileId: '*', card: card as never },
      NOW,
    );
    const done = vi.fn();
    renderWithProviders(<MethodForm target={method} profiles={[]} onDone={done} />);
    const label = await screen.findByRole('textbox', { name: 'Label' });
    await userEvent.clear(label);
    await userEvent.type(label, 'New name');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(done).toHaveBeenCalled();
    });
    const saved = await db.paymentMethods.get('pm-d');
    expect(saved?.label).toBe('New name');
    expect(saved?.card).toEqual(card);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test src/features/cards/method-editor-compat.test.tsx`
Expected: FAIL: `saved.card` is `undefined`, because the save sends `card: null` for any type but `credit_card`.

- [ ] **Step 3: Implement**

In `MethodForm.save`, change the update branch's card and rate lines:

```ts
            // Only a credit card's details are edited here. Any other card keeps
            // what it has, including keys a later version wrote: writing null
            // would wipe a debit, prepaid or gift card's details (spec 13.8).
            ...(type === 'credit_card' ? { creditAnnualRate, card: details ?? null } : {}),
            ...(type === 'bank_account' ? { account: accountDetails ?? null } : {}),
```

and remove the unconditional `creditAnnualRate,`, `card: details ?? null,` and `account: accountDetails ?? null,` lines. A type change from credit to anything else still clears `creditAnnualRate` by passing `creditAnnualRate: null` when `existing?.type === 'credit_card' && type !== 'credit_card'`. Add that as its own spread.

- [ ] **Step 4: Run the test, and the editor's existing tests**

Run: `pnpm test src/features/cards`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/cards/method-editor.tsx src/features/cards/method-editor-compat.test.tsx
git commit -m "Editing a debit, prepaid or gift card keeps all its details, including ones a newer version added

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task A4 (R10): A card's menu items are never under the Undo toast

**Investigation, already done for this plan** (ruling 7): with the build of `main` at 50b4e5b merged here, "Edit card" and "Archive" work by mouse, touch, keyboard, scripted `element.click()` and synthetic events at 390 to 1920 px in both languages. Under load, a click on "Edit card" in a card menu opened near the bottom of the screen right after Archive fails: Playwright reports `[data-sonner-toast] … intercepts pointer events`, then `[data-slot="popup-backdrop"] intercepts pointer events`, then the menu detaches. Sonner's toaster is stacked above every pop-out at the bottom inline end (`offset.bottom: 6rem`), and the press lands on the toast, which closes the menu as an outside press. It is not caused by the side-panel editor, and it predates the redesign, but the Cards screen makes it likely: Archive raises a toast for 6 s, and "Archived cards" sits at the foot of the screen.

**Files:**

- Modify: `src/components/ui/popup-parts.tsx:180-235` (`tabBarInset` becomes `bottomInset`; the watcher also observes the toaster)
- Test: `src/components/ui/popup-parts.test.tsx` (pure inset rule), `e2e/14-cards.spec.ts` (new `@cards menu and toast` test)

**Interfaces:**

- Produces: `export function bottomInsetFrom(rects: readonly { top: number; bottom: number }[], innerHeight: number): number` (the inset a bottom-docked stack of boxes takes, 0 when none sits in the lower half), used by `useCollisionPadding`.

- [ ] **Step 1: Write the failing tests**

`e2e/14-cards.spec.ts`, in the `@cards archive` describe:

```ts
test('a card menu opened while the Undo toast shows keeps clear of it, and Edit card opens the editor', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await completeFirstRun(page, 'en');
  await page.getByRole('link', { name: 'Cards' }).click();
  const first = page.getByRole('article').first();
  const name = (await first.getByRole('heading').first().textContent()) ?? '';
  await first.getByRole('button', { name: /^Options for/ }).click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  const toast = page.locator('[data-sonner-toast]').first();
  await expect(toast).toContainText(`${name} archived`);

  // The next card's ⋯, placed low enough that a menu opening down would reach the toast.
  const next = page
    .getByRole('article')
    .first()
    .getByRole('button', { name: /^Options for/ });
  await next.evaluate((el) => {
    const box = el.getBoundingClientRect();
    window.scrollBy({ top: box.bottom - (window.innerHeight - 300), behavior: 'instant' });
  });
  await next.click();
  const menu = page.getByTestId('card-menu');
  await expect(menu).toBeVisible();
  const [m, t] = [await menu.boundingBox(), await toast.boundingBox()];
  expect(m !== null && t !== null).toBe(true);
  if (m === null || t === null) return;
  const overlaps = m.x < t.x + t.width && t.x < m.x + m.width && m.y < t.y + t.height && t.y < m.y + m.height;
  expect(overlaps).toBe(false);

  // What an automated browser does: press at the item's centre, no retry.
  const item = await page.getByRole('menuitem', { name: 'Edit card' }).boundingBox();
  if (item === null) throw new Error('no Edit card');
  await page.mouse.click(item.x + item.width / 2, item.y + item.height / 2);
  await expect(page.locator('[data-slot="editor-panel"]')).toBeVisible();
});
```

Run it once in Hebrew as well (`he` project, `'אפשרויות עבור'`, `'העברה לארכיון'`, `'עריכת הכרטיס'`), as a second test in the same describe with the Hebrew copy.

`src/components/ui/popup-parts.test.tsx`:

```ts
describe('bottomInsetFrom', () => {
  it('is nothing with nothing docked', () => {
    expect(bottomInsetFrom([], 800)).toBe(0);
  });
  it('is the height from the highest box in the lower half to the bottom edge', () => {
    expect(
      bottomInsetFrom(
        [
          { top: 640, bottom: 704 },
          { top: 580, bottom: 630 },
        ],
        800,
      ),
    ).toBe(228);
  });
  it('ignores a box in the upper half: a toast stack at the top is no bottom edge', () => {
    expect(bottomInsetFrom([{ top: 16, bottom: 80 }], 800)).toBe(0);
  });
});
```

(228 = 800 − 580 + 8: the stack's top, plus an 8 px gap.)

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/components/ui/popup-parts.test.tsx && pnpm exec playwright test e2e/14-cards.spec.ts -g "Undo toast" --project=en`
Expected: the unit test fails (`bottomInsetFrom` is not exported). The e2e fails on `overlaps` being `true`.

- [ ] **Step 3: Implement**

In `popup-parts.tsx`:

```ts
const TOAST_GAP = 8;

/** The room a stack of boxes docked at the bottom takes: from its highest box to the bottom edge. */
export function bottomInsetFrom(
  rects: readonly { readonly top: number; readonly bottom: number }[],
  innerHeight: number,
): number {
  const low = rects.filter((r) => r.top > innerHeight / 2 && r.bottom > r.top);
  if (low.length === 0) return 0;
  return Math.ceil(innerHeight - Math.min(...low.map((r) => r.top)) + TOAST_GAP);
}

/** The visible toasts: above every pop-out, so a pop-out keeps clear of them as of a screen edge. */
function toastInset(): number {
  const toasts = [...document.querySelectorAll('[data-sonner-toast][data-visible="true"]')];
  return bottomInsetFrom(
    toasts.map((t) => t.getBoundingClientRect()),
    window.innerHeight,
  );
}
```

`remeasure()` takes `Math.max(tabBarInset(), toastInset())`. `watchTabBar` (rename it `watchBottomEdge`) also starts a `MutationObserver` on `document.body` filtered to `[data-sonner-toaster]` subtrees (`childList`, `subtree`, `attributes: true`, `attributeFilter: ['data-visible', 'data-removed']`) that calls `remeasure`, and disconnects it in `stopWatching`. Update the comments: "the tab bar and any visible toast counted as edge".

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/components/ui && pnpm exec playwright test e2e/14-cards.spec.ts e2e/08-polish.spec.ts --project=en --project=he`
Expected: PASS, and the existing menu and pop-out e2e tests stay green.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/popup-parts.tsx src/components/ui/popup-parts.test.tsx e2e/14-cards.spec.ts
git commit -m "A card's menu opens clear of the Undo toast, so Edit card and Archive always take the press

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task A5: Verify and release A1

**Files:**

- Modify: `README.md` → "Known limitations" (the repo keeps release notes there as "Release note:" bullets)

- [ ] **Step 1: Run the gate**

Run: `pnpm verify && pnpm verify:full`
Expected: both green. `knip` may flag `PAYMENT_METHOD_TYPES` if only tests read it; it is read by `methodTypeOf`, so it should not.

- [ ] **Step 2: Write the release note**

One line each: "Built-in ways to pay: bank transfer, standing order, Bit / PayBox and Other." "Card details of every kind are kept when a card is edited." "Card menus open clear of the Undo message." Plus: "Open the app once on every phone and computer you use before the next update."

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Release notes for the compatibility update

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Hand the user the deploy. Do not start Release A2's deploy until the user says every device shows A1.

## Release A2: the quick wins

### Task A6: Read a card's kind, and keep gift spending out of the balance

**Files:**

- Modify: `src/domain/cards.ts` (new `CardKind4`, `cardKindOf`, `countsInBalance`; `splitBySettlement` skips)
- Modify: `src/features/chart/use-chart-data.ts:115-125` (skips)
- Test: `src/domain/cards.test.ts`

**Interfaces:**

- Produces: `export type CardKindName = 'credit' | 'debit' | 'prepaid' | 'gift'`; `cardKindOf(method: Pick<PaymentMethod, 'type' | 'card'> | undefined): CardKindName | undefined`; `countsInBalance(occurrence: Pick<Occurrence, 'paymentMethodId'> & { transaction: Pick<Transaction, 'kind'> }, methods: ReadonlyMap<string, PaymentMethod>): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('cardKindOf', () => {
  const m = (type: string, card?: object) => ({ type, card }) as never;
  it.each([
    [m('credit_card', { funding: 'gift' }), 'credit'],
    [m('debit_card', { funding: 'prepaid' }), 'prepaid'],
    [m('debit_card', { funding: 'gift' }), 'gift'],
    [m('debit_card', { funding: 'debit' }), 'debit'],
    [m('debit_card'), 'debit'],
    [m('debit_card', {}), 'debit'],
    [m('debit_card', { funding: 'crypto' }), 'debit'],
    [m('bank_account'), undefined],
    [m('prepaid_card'), undefined],
  ])('reads %o as %s', (method, kind) => {
    expect(cardKindOf(method)).toBe(kind);
  });
});

describe('countsInBalance', () => {
  const gift = { id: 'g', type: 'debit_card', card: { funding: 'gift' } } as never;
  const debit = { id: 'd', type: 'debit_card', card: {} } as never;
  const methods = new Map([
    ['g', gift],
    ['d', debit],
  ]);
  const occ = (paymentMethodId: string, kind: 'income' | 'expense') =>
    ({ paymentMethodId, transaction: { kind } }) as never;

  it('leaves out an expense paid with a gift card', () => {
    expect(countsInBalance(occ('g', 'expense'), methods)).toBe(false);
  });
  it('counts income, and every other kind', () => {
    expect(countsInBalance(occ('g', 'income'), methods)).toBe(true);
    expect(countsInBalance(occ('d', 'expense'), methods)).toBe(true);
  });
  it('puts a gift card purchase in neither settled nor pending', () => {
    const today = d('2026-10-10');
    const o = makeOccurrence({ date: today, paymentMethodId: 'g', kind: 'expense' });
    const split = splitBySettlement([o], methods, today, new Map());
    expect(split.settled).toHaveLength(0);
    expect(split.pendingOnCards).toHaveLength(0);
  });
});
```

(`makeOccurrence` is a small helper in the test file: `expandOccurrences(makeTx({...}), [], date, date)[0]`, using `makeTx` from `test-factories.ts`.)

- [ ] **Step 2: Run to fail**

Run: `pnpm test src/domain/cards.test.ts`
Expected: FAIL: `cardKindOf` and `countsInBalance` are not exported.

- [ ] **Step 3: Implement**

```ts
/** Credit, debit, prepaid or gift: the one place a card's kind is decided (spec 13.3). */
export type CardKindName = 'credit' | 'debit' | 'prepaid' | 'gift';

export function cardKindOf(
  method: Pick<PaymentMethod, 'type' | 'card'> | undefined,
): CardKindName | undefined {
  if (method === undefined) return undefined;
  const type = methodTypeOf(method);
  if (type === 'credit_card') return 'credit';
  if (type !== 'debit_card') return undefined;
  const funding = method.card?.funding;
  // An unknown funding reads as debit: a card charged when used, settled on its date.
  return funding === 'prepaid' || funding === 'gift' ? funding : 'debit';
}

/**
 * Whether an occurrence moves the balance. A gift card's value never was the
 * household's to spend freely, so spending with it shows in the categories
 * but leaves the balance as it is (decision 21).
 */
export function countsInBalance(
  occurrence: Pick<Occurrence, 'paymentMethodId'> & { readonly transaction: Pick<Transaction, 'kind'> },
  methods: ReadonlyMap<string, PaymentMethod>,
): boolean {
  if (occurrence.transaction.kind !== 'expense' || occurrence.paymentMethodId === undefined) return true;
  return cardKindOf(methods.get(occurrence.paymentMethodId)) !== 'gift';
}
```

In `splitBySettlement`, after `if (occurrence.isSkipped) continue;` add `if (!countsInBalance(occurrence, methods)) continue;`. In `use-chart-data.ts`, filter `everything` through `countsInBalance(o, methods)` before the `settled` map (the dots keep gift purchases, the line does not).

- [ ] **Step 4: Run**

Run: `pnpm test src/domain/cards.test.ts src/features/chart src/features/summary`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/cards.ts src/domain/cards.test.ts src/features/chart/use-chart-data.ts
git commit -m "Spending with a gift card shows in the categories but leaves the balance as it is

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task A7 (R3): "Paid with" lists your cards and accounts first, then the six built-ins, and nothing else can be made

**Files:**

- Modify: `src/domain/tx-options.ts:105-122` (`methodsFor`)
- Modify: `src/features/transaction/payment-method-field.tsx` (hint per card kind)
- Test: `src/domain/tx-options.test.ts`, `src/features/transaction/transaction-sheet.test.tsx`

**Interfaces:**

- Consumes: `BUILTIN_METHOD_IDS`, `isBuiltinPaymentMethod` (A2), `cardKindOf` (A6).
- Produces: `methodsFor(methods, profileId, keepId?, mode?, via?)` returns, in order: live cards of every kind by label, bank accounts by label, the six built-ins in `BUILTIN_METHOD_IDS` order, then `keepId`'s row if it is none of these. A custom row of type `cash`, `cheque`, `bank_transfer`, `standing_order`, `digital_wallet` or `other` is offered only as `keepId`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('methodsFor: what "Paid with" offers', () => {
  const pm = (id: string, type: string, label: string, extra: object = {}) =>
    ({ id, type, label, profileId: '*', isArchived: 0, ...extra }) as never;
  const all = [
    pm('pm.other', 'other', 'Other'),
    pm('pm.cash', 'cash', 'Cash'),
    pm('pm.wallet', 'digital_wallet', 'Bit / PayBox'),
    pm('pm.cheque', 'cheque', 'Cheque'),
    pm('pm.transfer', 'bank_transfer', 'Bank transfer'),
    pm('pm.standing_order', 'standing_order', 'Standing order'),
    pm('acc', 'bank_account', 'Leumi'),
    pm('debit', 'debit_card', 'Hapoalim Direct', { card: { funding: 'debit' } }),
    pm('credit', 'credit_card', 'Max Gold'),
    pm('mine', 'digital_wallet', 'Bit'),
  ];

  it('puts cards, then accounts, then the six built-ins in their fixed order', () => {
    expect(methodsFor(all, 'p1').map((m) => m.id)).toEqual([
      'debit',
      'credit',
      'acc',
      'pm.cash',
      'pm.cheque',
      'pm.transfer',
      'pm.standing_order',
      'pm.wallet',
      'pm.other',
    ]);
  });

  it('offers a person’s own wallet row only on the transaction that already uses it', () => {
    expect(methodsFor(all, 'p1').some((m) => m.id === 'mine')).toBe(false);
    expect(methodsFor(all, 'p1', 'mine').at(-1)?.id).toBe('mine');
  });
});
```

In `transaction-sheet.test.tsx`, add: the picker's options (open it with the "Paid with" control) read, after "Not specified", the household's cards, the accounts, then "Cash, Cheque, Bank transfer, Standing order, Bit / PayBox, Other" in that order, in English and in Hebrew ("מזומן, צ'ק, העברה בנקאית, הוראת קבע, ביט / פייבוקס, אחר").

- [ ] **Step 2: Run to fail**

Run: `pnpm test src/domain/tx-options.test.ts src/features/transaction/transaction-sheet.test.tsx`
Expected: FAIL: the list is sorted by label and offers `mine`.

- [ ] **Step 3: Implement**

```ts
const BUILTIN_TYPES: ReadonlySet<PaymentMethodType> = new Set([
  'cash',
  'cheque',
  'bank_transfer',
  'standing_order',
  'digital_wallet',
  'other',
]);

/** 0 cards, 1 accounts, 2 built-ins; a person's own row of a built-in type is not offered at all. */
function bucketOf(method: PaymentMethod): 0 | 1 | 2 | undefined {
  if (isBuiltinPaymentMethod(method.id)) return 2;
  if (cardKindOf(method) !== undefined) return 0;
  if (methodTypeOf(method) === 'bank_account') return 1;
  return BUILTIN_TYPES.has(methodTypeOf(method)) ? undefined : 0;
}

export function methodsFor(
  methods: readonly PaymentMethod[],
  profileId: string,
  keepId = '',
  mode?: RecurrenceMode,
  via?: StandingVia,
): readonly PaymentMethod[] {
  const fits = (method: PaymentMethod): boolean =>
    methodOwnedBy(method, profileId) &&
    isActiveMethod(method) &&
    (mode === undefined || methodFits(method, mode)) &&
    (via === undefined || standingViaOf(method) === via);
  const order = (m: PaymentMethod): number =>
    isBuiltinPaymentMethod(m.id) ? BUILTIN_METHOD_IDS.indexOf(m.id as never) : 0;
  const offered = methods
    .filter((m) => bucketOf(m) !== undefined && fits(m))
    .sort(
      (a, b) =>
        (bucketOf(a) ?? 0) - (bucketOf(b) ?? 0) || order(a) - order(b) || a.label.localeCompare(b.label),
    );
  const kept = methods.find((m) => m.id === keepId && keepId !== '');
  return kept === undefined || offered.includes(kept) ? offered : [...offered, kept];
}
```

In `payment-method-field.tsx`, the hint for a card is its kind's name (`cards:kindName.credit` and the rest, added in Task A8's copy) plus "··1234"; for any other row, the type's name as today through `methodTypeOf`.

- [ ] **Step 4: Run**

Run: `pnpm test src/domain/tx-options.test.ts src/features/transaction`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/tx-options.ts src/domain/tx-options.test.ts src/features/transaction
git commit -m "Paid with lists your cards and bank accounts first, then cash, cheque, bank transfer, standing order, Bit / PayBox and Other, always in that order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task A8 (R4): The editor is "New Card" for cards and has no Type switch; "Other ways to pay" is gone

**Files:**

- Modify: `src/features/cards/method-editor.tsx` (delete `TYPES`, `OtherMethods`, `BUILTIN_ORDER`, `DeleteMethodDialog`, `Option`; `MethodEditor` and `MethodForm` take `mode: 'card' | 'account'`)
- Modify: `src/features/cards/cards-screen.tsx:58,189,200-208`, `src/features/bank-accounts/bank-accounts-screen.tsx:115-122`, `src/features/import/found-methods-list.tsx:285`, `src/features/transaction/transaction-sheet.tsx:1453`
- Modify: `src/i18n/locales/{en,he}/cards.json` (new `edit.newCard`, `edit.editCard`, `edit.kind`, `accounts.newTitle`, `accounts.editTitle`, `kindName.*`; remove `other.*`), `src/i18n/locales/{en,he}/categories.json` (remove `manage.methodType`, `methodNew`, `methodEdit` if no other reader: `grep -rn "methodType\|methodNew\|methodEdit" src`)
- Test: `src/features/cards/method-editor.test.tsx`, `src/features/cards/cards-screen.test.tsx`

**Interfaces:**

- Produces: `MethodEditor({ target, profiles, onOpenChange, mode, section? })` and `MethodForm({ target, profiles, mode, prefill?, className?, onDone })` with `mode: 'card' | 'account'`. In `'card'` mode a new method gets a Kind choice (Credit, Debit, Prepaid, Gift). An existing card shows its kind as text.
- Consumes: `cardKindOf` (A6).

- [ ] **Step 1: Write the failing tests**

In `method-editor.test.tsx`:

```tsx
describe('New Card', () => {
  it('is titled New Card and offers only the four kinds of card', async () => {
    renderWithProviders(<MethodEditor target="new" mode="card" profiles={[PERSON]} onOpenChange={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'New Card' })).toBeVisible();
    const kinds = screen.getByRole('radiogroup', { name: 'Kind' });
    expect(
      within(kinds)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Credit', 'Debit', 'Prepaid', 'Gift']);
    for (const gone of ['Bank account', 'Bank transfer', 'Standing order', 'Digital wallet', 'Other']) {
      expect(screen.queryByRole('radio', { name: gone })).toBeNull();
    }
  });

  it('saves a gift card as a debit_card with gift funding', async () => {
    renderWithProviders(<MethodEditor target="new" mode="card" profiles={[PERSON]} onOpenChange={vi.fn()} />);
    await userEvent.type(await screen.findByRole('textbox', { name: 'Label' }), 'BuyMe');
    await userEvent.click(screen.getByRole('radio', { name: 'Gift' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(async () => {
      const [saved] = await db.paymentMethods.filter((m) => m.label === 'BuyMe').toArray();
      expect(saved).toMatchObject({ type: 'debit_card', card: { funding: 'gift' } });
    });
  });

  it('is titled כרטיס חדש in Hebrew', async () => {
    await initTestI18n('he');
    renderWithProviders(<MethodEditor target="new" mode="card" profiles={[PERSON]} onOpenChange={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'כרטיס חדש' })).toBeVisible();
    await initTestI18n('en');
  });

  it('opened from Bank accounts, is New bank account with no type to choose', async () => {
    renderWithProviders(
      <MethodEditor target="new" mode="account" profiles={[PERSON]} onOpenChange={vi.fn()} />,
    );
    expect(await screen.findByRole('heading', { name: 'New bank account' })).toBeVisible();
    expect(screen.queryByRole('radiogroup', { name: /Type|Kind/ })).toBeNull();
  });

  it('shows an existing card’s kind without letting it change', async () => {
    const card = await createPaymentMethod(
      db,
      'pm-k',
      { label: 'Max', type: 'credit_card', profileId: '*' },
      NOW,
    );
    renderWithProviders(
      <MethodEditor target={card} mode="card" profiles={[PERSON]} onOpenChange={vi.fn()} />,
    );
    expect(await screen.findByRole('heading', { name: 'Edit card' })).toBeVisible();
    expect(screen.queryByRole('radiogroup', { name: 'Kind' })).toBeNull();
    expect(screen.getByText('Credit card')).toBeVisible();
  });
});
```

In `cards-screen.test.tsx`: no heading "Other ways to pay", no button "Add a way to pay", in English and Hebrew ("אמצעי תשלום נוספים", "הוספת אמצעי תשלום").

- [ ] **Step 2: Run to fail**

Run: `pnpm test src/features/cards`
Expected: FAIL: the title is "New payment method", the Type switch has seven options, and `OtherMethods` renders.

- [ ] **Step 3: Implement**

`MethodForm` state: replace `type` with `kind: CardKindName` (card mode) and derive:

```ts
const type: PaymentMethodType =
  mode === 'account' ? 'bank_account' : kind === 'credit' ? 'credit_card' : 'debit_card';
```

Seed `kind` from `cardKindOf(source) ?? 'credit'`. Render, in card mode, for a new card only:

```tsx
{
  mode === 'card' && isNew ? (
    <div className="space-y-1.5">
      <Label id={kindId}>{t('cards:edit.kind')}</Label>
      <Segmented<CardKindName>
        value={kind}
        labelledBy={kindId}
        onChange={setKind}
        size="sm"
        options={(['credit', 'debit', 'prepaid', 'gift'] as const).map((value) => ({
          value,
          label: t(`cards:kinds.${value}`),
        }))}
      />
    </div>
  ) : mode === 'card' ? (
    <p className="text-sm text-muted-foreground">{t(`cards:kindName.${kind}`)}</p>
  ) : null;
}
```

The credit fields (`CardColorField`, `CardFields`) render when `kind === 'credit'`, as today. Saving a new non-credit card writes `card: { funding: kind }`. Editing an existing non-credit card keeps its `card` as Task A3 made it. The owner field shows in card mode; `AccountFields` in account mode.

`MethodEditor`'s title:

```ts
const title =
  mode === 'account'
    ? t(target === 'new' ? 'cards:accounts.newTitle' : 'cards:accounts.editTitle')
    : t(target === 'new' ? 'cards:edit.newCard' : 'cards:edit.editCard');
```

Delete `OtherMethods`, `BUILTIN_ORDER`, `DeleteMethodDialog`, `Option`, `TYPES` and `TYPE_KEY` (and the imports they leave unused). Callers: Cards screen `mode="card"` and drops `<OtherMethods />`; Bank accounts `mode="account"`; import `MethodPanel` `mode={item.kind === 'card' ? 'card' : 'account'}`; the transaction sheet's card panel `mode="card"` and its title `t('cards:edit.editCard')`.

Copy (en / he):

| Key                                                    | English                                             | עברית                                                    |
| ------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------- |
| `cards:edit.newCard`                                   | New Card                                            | כרטיס חדש                                                |
| `cards:edit.editCard`                                  | Edit card                                           | עריכת כרטיס                                              |
| `cards:edit.kind`                                      | Kind                                                | סוג                                                      |
| `cards:kinds.credit` / `debit` / `prepaid` / `gift`    | Credit / Debit / Prepaid / Gift                     | אשראי / חיוב מיידי (דביט) / נטען / מתנה                  |
| `cards:kindName.credit` / `debit` / `prepaid` / `gift` | Credit card / Debit card / Prepaid card / Gift card | כרטיס אשראי / כרטיס חיוב מיידי / כרטיס נטען / כרטיס מתנה |
| `cards:accounts.newTitle`                              | New bank account                                    | חשבון בנק חדש                                            |
| `cards:accounts.editTitle`                             | Edit bank account                                   | עריכת חשבון בנק                                          |

Remove `cards:other.*`.

- [ ] **Step 4: Run**

Run: `pnpm test src/features/cards src/features/bank-accounts src/features/import src/features/transaction src/i18n && pnpm knip`
Expected: PASS, and knip reports nothing from the deletions.

- [ ] **Step 5: Commit**

```bash
git add src/features src/i18n
git commit -m "Adding a card opens New Card with only credit, debit, prepaid and gift to choose, and Other ways to pay is gone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task A9 (R2): "Cards" holds every kind of card, grouped

**Files:**

- Modify: `src/features/cards/use-cards-data.ts:47-55` (both card types)
- Modify: `src/features/cards/cards-screen.tsx` (groups by `cardKindOf`; `HouseholdCommitments` credit only; the panel's owner line says the kind; "Interest table" only on credit)
- Modify: `src/features/cards/card-menu.tsx` (`rates` only when `cardKindOf(card) === 'credit'`)
- Modify: `src/i18n/locales/{en,he}/cards.json` (`title`, `subtitle`, `emptyTitle`, `emptyBody`, `menu.label`, `menu.hint`, `group.*`)
- Modify: `e2e/14-cards.spec.ts` (`COPY.title`)
- Test: `src/features/cards/cards-screen.test.tsx`

**Interfaces:**

- Consumes: `cardKindOf`, `CardKindName` (A6).
- Produces: `CardsData.cards` and `.archived` hold `credit_card` and `debit_card` rows. `CardsScreen` renders `<section aria-labelledby>` per kind, in the order credit, debit, prepaid, gift, each with an `h2` only when two or more kinds are present.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('one Cards screen for every kind', () => {
  it('is called Cards, in English and Hebrew', async () => {
    render();
    expect(await screen.findByRole('heading', { level: 1, name: 'Cards' })).toBeVisible();
    await initTestI18n('he');
    render();
    expect(await screen.findByRole('heading', { level: 1, name: 'כרטיסים' })).toBeVisible();
    await initTestI18n('en');
  });

  it('groups credit, debit, prepaid and gift cards under their own headings', async () => {
    await seedCards([
      ['c', 'credit_card', undefined],
      ['d', 'debit_card', undefined],
      ['p', 'debit_card', 'prepaid'],
      ['g', 'debit_card', 'gift'],
    ]);
    render();
    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(
      expect.arrayContaining(['Credit cards', 'Debit cards', 'Prepaid cards', 'Gift cards']),
    );
  });

  it('shows no kind heading when every card is one kind', async () => {
    await seedCards([['c', 'credit_card', undefined]]);
    render();
    await screen.findByText('c');
    expect(screen.queryByRole('heading', { level: 2, name: 'Credit cards' })).toBeNull();
  });

  it('lists a debit card made in Other ways to pay, with no details at all', async () => {
    await db.paymentMethods.add({
      id: 'old',
      label: 'Old debit',
      type: 'debit_card',
      profileId: '*',
      isArchived: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    render();
    expect(await screen.findByText('Old debit')).toBeVisible();
    expect(screen.getByText(/Debit card/)).toBeVisible();
  });

  it('offers Interest table only on a credit card', async () => {
    await seedCards([['d', 'debit_card', undefined]]);
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Options for d' }));
    expect(screen.queryByRole('menuitem', { name: 'Interest table' })).toBeNull();
  });
});
```

(`seedCards` writes one method per tuple, with `card.funding` when given.)

- [ ] **Step 2: Run to fail**

Run: `pnpm test src/features/cards/cards-screen.test.tsx`
Expected: FAIL: the title is "Credit cards", and debit rows are not listed.

- [ ] **Step 3: Implement**

`use-cards-data.ts`: a card is `cardKindOf(m) !== undefined`. `cards-screen.tsx`:

```tsx
const KIND_ORDER: readonly CardKindName[] = ['credit', 'debit', 'prepaid', 'gift'];

const groups = KIND_ORDER.map((kind) => ({
  kind,
  cards: cards.filter((card) => cardKindOf(card) === kind),
})).filter((group) => group.cards.length > 0);
const headed = groups.length > 1;
```

Each group renders `<section aria-labelledby={id}>` with `{headed ? <h2 id={id} …>{t(`group.${kind}`)}</h2> : null}` and the existing `<ul className="grid gap-6 md:grid-cols-2">` of `CardPanel`s. The panel's heading becomes `h3` when `headed`. `HouseholdCommitments` and `commitments` take only credit cards. The `CardPanel` owner line reads `{t(`kindName.${kind}`)} · {owner}`. A non-credit panel shows the face, the last digits and the expiry, and none of: bills, limit bar, commitments, fees. That is the current layout, with what doesn't apply left out; B gives each kind its own panel.

Copy:

| Key                           | English                                                                                                       | עברית                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `title`                       | Cards                                                                                                         | כרטיסים                                                                                |
| `subtitle`                    | Every card you pay with, and when each one takes the money.                                                   | כל הכרטיסים שמשלמים בהם, ומתי כל אחד מהם מוריד את הכסף.                                |
| `emptyTitle`                  | No cards yet                                                                                                  | עוד אין כרטיסים                                                                        |
| `emptyBody`                   | Add your credit, debit, prepaid and gift cards. Each purchase then counts on the day the money really leaves. | הוסיפו כרטיסי אשראי, חיוב מיידי, נטענים ומתנה. כל קנייה תיספר ביום שבו הכסף באמת יוצא. |
| `menu.label`                  | Cards                                                                                                         | כרטיסים                                                                                |
| `menu.hint`                   | Credit, debit, prepaid and gift cards                                                                         | כרטיסי אשראי, חיוב מיידי, נטענים ומתנה                                                 |
| `group.credit` … `group.gift` | Credit cards / Debit cards / Prepaid cards / Gift cards                                                       | כרטיסי אשראי / כרטיסי חיוב מיידי / כרטיסים נטענים / כרטיסי מתנה                        |

`e2e/14-cards.spec.ts`: `COPY.en.title = 'Cards'`, `COPY.he.title = 'כרטיסים'`.

- [ ] **Step 4: Run**

Run: `pnpm test src/features/cards && pnpm exec playwright test e2e/14-cards.spec.ts e2e/screens.spec.ts --project=en --project=he`
Expected: PASS. Update the screenshot baselines for the Cards screen only if the diff is the title and the missing "Other ways to pay" section (`--update-snapshots`, then inspect the new images).

- [ ] **Step 5: Commit**

```bash
git add src/features/cards src/i18n e2e
git commit -m "The Credit cards screen is now Cards, and lists credit, debit, prepaid and gift cards, each kind under its own heading

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task A10: Verify and release A2

- [ ] **Step 1:** Run `pnpm verify && pnpm verify:full`. Expected: green.
- [ ] **Step 2:** Check by hand in the browser, at 390 and 1280 px, in en and he: Cards screen title, groups, New Card's four kinds, "Paid with" order, no "Other ways to pay". Use the `run` skill.
- [ ] **Step 3:** Add "Release note:" bullets to README.md → "Known limitations": "Credit cards is now Cards, with debit, prepaid and gift cards." "New Card: choose credit, debit, prepaid or gift." "Ways to pay that aren't cards are built in." Commit with the trailer.

---

# RELEASE B: the step-by-step pop-out

Release B starts after A2 is deployed. Its data tasks (B1 to B5) can land before its screens. Spec section 19's order holds: data and domain first, then the screens, which use only the redesign's tokens and components (`PopOut`, `CardFace`, `MoneyTile`, `BrandMark`, `BankMark`).

### Task B1 (R6): The who-works-with-whom matrix as dated catalog data, with its checks

**Files:**

- Modify: `src/data/card-catalog/types.ts` (new types below)
- Modify: `src/data/card-catalog/issuers/{isracard,amex,cal,diners,max}.ts` (`group`, `nonBank`, `networks`, tier and club `funding`, tier `networks`)
- Modify: `src/data/card-catalog/banks/{leumi,hapoalim,discount,mizrahi,mercantile,fibi,massad,yahav,one-zero}.ts` (`programmes`)
- Create: `src/data/card-catalog/banks/jerusalem.ts`, `banks/postal.ts`, `banks/esh-israel.ts`; register them in `banks/index.ts`
- Create: `src/data/card-catalog/cell.ts` (the `cell()` helper, `UNRESEARCHED_BANKS`)
- Modify: `src/data/card-catalog/index.ts` (`CATALOG_VERSION = 2`), `src/data/card-catalog/resolve.ts` (link by programme; caveat), `src/data/card-catalog/check.ts` (new problems), `package.json` (`"catalog:check"`)
- Test: `src/data/card-catalog/catalog.test.ts`, `src/data/card-catalog/resolve.test.ts`, `src/data/card-catalog/check.test.ts` (new)

**Interfaces:**

- Produces (types.ts):

```ts
export type CardFunding = 'credit' | 'debit' | 'prepaid';
export type CellStatus = 'confirmed' | 'varies' | 'unverified' | 'absent';
export type MatrixCell = {
  status: CellStatus;
  checked: LocalDate; // when the source was read
  source?: CatalogSource & { quote?: string }; // required unless status is 'unverified'
  note?: string; // what is uncertain, in plain words
};
export type Programme = {
  issuer: IssuerId;
  funding: CardFunding;
  cell: MatrixCell;
  /** Only where the bank narrows the company's networks (One Zero: Mastercard). */
  networks?: Partial<Record<CardNetwork, MatrixCell>>;
};
// CatalogIssuer gains:
//   group?: IssuerId;  (amex → 'isracard', diners → 'cal')
//   nonBank: Partial<Record<CardFunding, MatrixCell>>;
//   networks: Partial<Record<CardFunding, Partial<Record<CardNetwork, MatrixCell>>>>;
// CatalogBank gains:   programmes: Programme[];
// CatalogTier gains:   funding?: 'debit' | 'prepaid'; networks?: CardNetwork[];
// CatalogClub gains:   funding?: 'prepaid';
```

- Produces (cell.ts): `cell(status, checked, source?, note?): MatrixCell`; `UNRESEARCHED_BANKS: readonly string[]` (the Israeli and Arab bank codes in `src/domain/banks.ts` the catalog does not hold: Citibank 22, HSBC 23, State Bank of India 39 and the Arab banks, each by code); `catalogProblems(catalog, today)` and `catalogWarnings(catalog, today)` in check.ts; `CATALOG_CHECKED: LocalDate` (`2026-10-08`, the date of the oldest research the cells come from) in cell.ts, so the domain can import it without loading the catalog's data.

- [ ] **Step 1: Write the failing tests**

`src/data/card-catalog/check.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { d } from '@/domain/test-factories';

import { catalogProblems, catalogWarnings } from './check';
import { UNRESEARCHED_BANKS } from './cell';
import { loadCatalog } from './index';
import type { Catalog, MatrixCell } from './types';

const CATALOG = await loadCatalog();
const TODAY = d('2026-10-10');

/** The catalog with Discount's first programme cell patched, for a failing case. */
const withCell = (patch: Partial<MatrixCell>): Catalog => ({
  ...CATALOG,
  banks: CATALOG.banks.map((bank) =>
    bank.id !== '11'
      ? bank
      : {
          ...bank,
          programmes: bank.programmes.map((p, i) => (i === 0 ? { ...p, cell: { ...p.cell, ...patch } } : p)),
        },
  ),
});

describe('catalog:check', () => {
  it('passes on the shipped catalog', () => {
    expect(catalogProblems(CATALOG, TODAY)).toEqual([]);
  });
  it('fails a confirmed cell with no source', () => {
    expect(catalogProblems(withCell({ status: 'confirmed', source: undefined }), TODAY)).toContainEqual(
      expect.stringMatching(/11.*no source/),
    );
  });
  it('fails a cell dated in the future', () => {
    expect(catalogProblems(withCell({ checked: d('2026-12-01') }), TODAY)).toContainEqual(
      expect.stringMatching(/future/),
    );
  });
  it('warns past 180 days and fails past 365', () => {
    expect(catalogWarnings(CATALOG, d('2027-05-01'))).not.toEqual([]);
    expect(catalogProblems(CATALOG, d('2027-10-11'))).toContainEqual(expect.stringMatching(/older than 365/));
  });
  it('fails when a bank’s issuers disagree with its credit programmes', () => {
    const broken: Catalog = {
      ...CATALOG,
      banks: CATALOG.banks.map((b) => (b.id === '17' ? { ...b, issuers: [...b.issuers, 'max'] } : b)),
    };
    expect(catalogProblems(broken, TODAY)).toContainEqual(expect.stringMatching(/17.*issuers/));
  });
  it('fails when an Israeli bank is neither in the catalog nor listed as unresearched', () => {
    expect(
      catalogProblems({ ...CATALOG, banks: CATALOG.banks.filter((b) => b.id !== '54') }, TODAY),
    ).toContainEqual(expect.stringMatching(/54/));
    expect(UNRESEARCHED_BANKS).toContain('22');
  });
});
```

In `catalog.test.ts`, add: `CATALOG_VERSION` is 2; each section-3.5 entry carries `funding` (Isracard tier `direct` debit; Cal tiers `prepaid` and `paybox_young` prepaid; Max tier `cash` prepaid; clubs `mycal`, `mymax`, `kranot_prepaid` prepaid) and no other entry does; Amex has `group: 'isracard'` and Diners `group: 'cal'`.

In `resolve.test.ts`, add: a Bank of Jerusalem (54) Cal credit card links (programme confirmed), and its rates come from Cal with `caveat: 'bankRatesUnpublished'`; a Discount Isracard card (programme absent) does not link; `resolveCard` gives no deal rates and no late rate for Isracard `direct` (debit) and Cal `prepaid`.

- [ ] **Step 2: Run to fail**

Run: `pnpm test src/data/card-catalog`
Expected: FAIL: `programmes`, `catalogWarnings`, `cell.ts` and the new banks do not exist.

- [ ] **Step 3: Implement the types, the helper and the data**

`cell.ts`:

```ts
import type { LocalDate } from '@/types/money';

import type { CatalogSource, CellStatus, MatrixCell } from './types';

/** One matrix cell. Only a source can make a cell anything but unverified (spec 21.2). */
export function cell(
  status: CellStatus,
  checked: LocalDate,
  source?: CatalogSource & { quote?: string },
  note?: string,
): MatrixCell {
  return {
    status,
    checked,
    ...(source === undefined ? {} : { source }),
    ...(note === undefined ? {} : { note }),
  };
}
```

`UNRESEARCHED_BANKS` is a literal array of codes. Build it from `grep -n "group: '\(israel\|arab\)'" src/domain/banks.ts`: every live code (merged codes resolved through their `now`) with no catalog file.

The data is the issuer research §4.1 and §4.2, cell for cell. Dates: `2026-10-08` for cells from the 10-08 issuer research, `2026-10-10` for the 10-10 cells. Each `source.url` is the URL that research section cites for that bank or company: `issuers/banks-leumi-hapoalim-mizrahi.md` §L.1, §H.1, §M.1; `issuers/banks-others.md` §1.1 to §8; `issuers/isracard.md` §1; `issuers/cal.md` §1.2; `issuers/max.md` §1.2; and Leumi's and Bank of Jerusalem's credit-card pages for the 10-10 cells. `quote` is the Hebrew phrase the research quotes, where it quotes one.

Non-bank cards (`nonBank`, and `networks` per funding):

| Company                    | `nonBank.credit` | `nonBank.debit`                                                      | `nonBank.prepaid`    | `networks.credit`                     | `networks.debit`                         | `networks.prepaid`                      |
| -------------------------- | ---------------- | -------------------------------------------------------------------- | -------------------- | ------------------------------------- | ---------------------------------------- | --------------------------------------- |
| isracard                   | confirmed        | unverified ("ISRACASH in the non-bank tariff")                       | confirmed (נטענצ'יק) | isracard, mastercard, visa: confirmed | isracard: unverified; mastercard: varies | isracard, mastercard: unverified        |
| amex (`group: 'isracard'`) | confirmed        | absent                                                               | absent               | amex: confirmed                       | none                                     | none                                    |
| cal                        | confirmed        | absent ("sold only through banks")                                   | confirmed            | visa, mastercard: confirmed           | visa, mastercard: varies                 | visa: confirmed; mastercard: unverified |
| diners (`group: 'cal'`)    | confirmed        | absent                                                               | absent               | diners: confirmed; mastercard: varies | none                                     | none                                    |
| max                        | confirmed        | unverified ("11% of Max cards are debit; no non-bank product found") | confirmed            | visa, mastercard: confirmed           | visa, mastercard: varies                 | visa, mastercard: unverified            |

Bank programmes (`funding: 'credit'` unless the column says otherwise):

| Bank                                                                             | isracard  | amex      | cal                          | diners     | max       | debit programmes                                                      | prepaid programmes             | network narrowing         |
| -------------------------------------------------------------------------------- | --------- | --------- | ---------------------------- | ---------- | --------- | --------------------------------------------------------------------- | ------------------------------ | ------------------------- |
| Leumi 10                                                                         | varies    | absent    | unverified                   | confirmed  | confirmed | isracard, cal, max: unverified ("operator unverified")                | isracard, cal, max: unverified | cal: diners only          |
| Hapoalim 12                                                                      | confirmed | confirmed | unverified                   | confirmed  | confirmed | isracard: confirmed ("בשיתוף עם חברת ישראכרט בלבד"); cal, max: absent | isracard: confirmed (Up Card)  | cal: diners only          |
| Discount 11                                                                      | absent    | absent    | confirmed                    | confirmed  | confirmed | cal, max: unverified; isracard: absent                                | cal, max: unverified (2go)     | none                      |
| Mizrahi-Tefahot 20                                                               | confirmed | confirmed | confirmed                    | confirmed  | confirmed | cal, isracard: confirmed; max: absent                                 | all absent                     | none                      |
| Mercantile 17                                                                    | absent    | absent    | confirmed                    | confirmed  | absent    | cal: unverified; isracard, max: absent                                | cal: confirmed (2GO)           | none                      |
| FIBI 31 (PAGI 52, Otsar HaHayal 14, U-Bank 26 the same, as `banks.ts` maps them) | confirmed | confirmed | varies                       | confirmed  | confirmed | isracard: confirmed; cal, max: absent                                 | all absent                     | none                      |
| Massad 46                                                                        | confirmed | confirmed | unverified                   | unverified | confirmed | isracard: confirmed                                                   | all absent                     | none                      |
| Yahav 4                                                                          | varies    | confirmed | confirmed                    | confirmed  | absent    | isracard: confirmed                                                   | all absent                     | isracard: mastercard only |
| One Zero 18                                                                      | confirmed | absent    | absent                       | absent     | absent    | isracard: unverified                                                  | all absent                     | isracard: mastercard only |
| Bank of Jerusalem 54 (new)                                                       | absent    | absent    | confirmed ("כרטיס ויזה כאל") | unverified | absent    | isracard, cal, max: unverified                                        | isracard, cal, max: unverified | none                      |
| Postal Bank 9 (new)                                                              | absent    | absent    | absent                       | absent     | absent    | isracard: confirmed (Direct)                                          | all absent                     | none                      |
| Esh Israel 3 (new)                                                               | absent    | absent    | absent                       | absent     | absent    | all absent ("כרטיסי חיוב" not given)                                  | all absent                     | none                      |

"All absent" in a column means one `absent` cell per company, with the research's source. A cell the table leaves out is `unverified`, never `absent`. Example, `banks/discount.ts`:

```ts
const READ = d('2026-10-08');
const TARIFF = { url: 'https://…', seen: READ }; // the Discount tariff part 6 URL from issuers/banks-others.md §1.1

export const DISCOUNT: CatalogBank = {
  // …the existing fields…
  issuers: ['cal', 'diners', 'max'],
  programmes: [
    {
      issuer: 'isracard',
      funding: 'credit',
      cell: cell('absent', READ, TARIFF, 'No Isracard chapter in the tariff'),
    },
    {
      issuer: 'amex',
      funding: 'credit',
      cell: cell('absent', READ, TARIFF, 'No Amex chapter in the tariff'),
    },
    { issuer: 'cal', funding: 'credit', cell: cell('confirmed', READ, TARIFF) },
    { issuer: 'diners', funding: 'credit', cell: cell('confirmed', READ, TARIFF) },
    { issuer: 'max', funding: 'credit', cell: cell('confirmed', READ, TARIFF) },
    {
      issuer: 'isracard',
      funding: 'debit',
      cell: cell('absent', READ, TARIFF, 'No Isracard chapter in the tariff'),
    },
    {
      issuer: 'cal',
      funding: 'debit',
      cell: cell('unverified', READ, undefined, 'Operator of Discount debit not published'),
    },
    {
      issuer: 'max',
      funding: 'debit',
      cell: cell('unverified', READ, undefined, 'Operator of Discount debit not published'),
    },
    {
      issuer: 'cal',
      funding: 'prepaid',
      cell: cell('unverified', READ, undefined, '2go operator not published'),
    },
    {
      issuer: 'max',
      funding: 'prepaid',
      cell: cell('unverified', READ, undefined, '2go operator not published'),
    },
  ],
};
```

(`https://…` stands for the URL copied from the research file. It is data to copy, and the check fails if a non-unverified cell has none.)

Tiers and clubs: add `funding` to the section-3.5 entries only. Add tier `networks` only where the research names them: Diners "Diners Mastercard" and "FlyAll" get `['mastercard']`, every other Diners tier `['diners']`.

- [ ] **Step 4: Implement the checks and the link rule**

`check.ts`, in `catalogProblems(catalog, today)`:

- every bank programme cell, and every issuer `nonBank` and `networks` cell, whose status is not `unverified` has a `source`: problem `"<where>: <status> with no source"`;
- every `checked` after `today`: `"<where>: checked in the future"`;
- every `checked` more than 365 days before `today`: `"<where>: older than 365 days"`. `catalogWarnings` lists the cells over 180 days;
- `bank.issuers` equals, as a set, the issuers of its `credit` programmes whose status is not `absent`: `"<bank>: issuers disagree with programmes"`;
- every catalog bank id is a live code in `banks.ts`, and every live `israel` or `arab` code is in the catalog or in `UNRESEARCHED_BANKS`: `"<code>: neither in the catalog nor unresearched"`.

The existing callers of `catalogProblems(catalog)` pass `systemClock.today()` (tests pass a fixed date).

`resolve.ts`: a bank card links when the bank's programme for the company and the tier's funding exists and is not `absent`. When the bank has no `rates` rows for that company, use the company's rows and set `caveat: 'bankRatesUnpublished'` on the result. The fees step shows "Rates for this bank aren't published. Check your statement." A debit or prepaid tier gets no deals and no `lateRate` (spec 13.7), and a debit tier's monthly fee stays the bank's ("Set by your bank").

`package.json`: `"catalog:check": "cross-env TZ=Etc/UTC vitest run src/data/card-catalog src/domain/card-matrix.test.ts"`. `pnpm verify` already runs both files through `test:cov`.

`index.ts`: `CATALOG_VERSION = 2`. `catalog-refresh.ts` relinks cards on a version change, as it already does. Its tests must stay green.

- [ ] **Step 5: Run**

Run: `pnpm test src/data/card-catalog src/db/catalog-refresh.test.ts src/domain/card-catalog-link.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/card-catalog package.json
git commit -m "The card list knows which banks work with which card companies and networks, each with its source and the date it was checked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B2 (R6): Each question's choices, narrowed by every earlier answer

**Files:**

- Create: `src/domain/card-choices.ts`
- Test: `src/domain/card-matrix.test.ts` (new)

**Interfaces:**

- Consumes: `Catalog`, `CardFunding`, `CellStatus`, `MatrixCell`, `IssuerId` (B1, types only), `CATALOG_CHECKED` (B1, `cell.ts`); `BANKS` (`src/domain/banks.ts`); `CardKindName` (A6).
- Produces:

```ts
export type BankCardAnswer = 'bank' | 'non_bank' | 'not_sure';
export type Choice<T> = { readonly value: T; readonly status: CellStatus; readonly checked?: LocalDate };
export type Escape = 'anotherCompany' | 'anotherNetwork' | 'showAllBanks' | 'notInList';
export type Choices<T> = {
  readonly main: readonly Choice<T>[]; // confirmed and varies
  readonly checkYourCard: readonly Choice<T>[]; // unverified: under a divider, each tagged
  readonly hidden: readonly Choice<T>[]; // absent: shown only after the escape
  readonly escape: Escape;
  readonly only?: T; // exactly one across main and checkYourCard
};
export type Cascade = {
  readonly kind: 'credit' | 'debit' | 'prepaid';
  readonly bankCard?: BankCardAnswer;
  readonly bank?: string; // a Masav code; absent when not a bank card, not chosen, or typed by hand
  readonly company?: IssuerId | 'other';
  readonly network?: CardNetwork;
  /** The bank codes of the household's live accounts: first in the bank list. */
  readonly householdBanks?: readonly string[];
};
export type TypeChoice = `tier:${string}` | `club:${string}`;
export function banksFor(c: Cascade, catalog: Catalog | undefined): Choices<string>;
export function companiesFor(c: Cascade, catalog: Catalog | undefined): Choices<IssuerId>;
export function networksFor(c: Cascade, catalog: Catalog | undefined): Choices<CardNetwork>;
export function typesFor(c: Cascade, catalog: Catalog | undefined): Choices<TypeChoice>;
/** The step is answered for the person: exactly one choice, and it is confirmed (spec 21.4). */
export function answeredAlone<T>(choices: Choices<T>): T | undefined;
```

- [ ] **Step 1: Write the failing tests**

`src/domain/card-matrix.test.ts` pins the real combinations of spec 21.11:

```ts
import { describe, expect, it } from 'vitest';

import { loadCatalog } from '@/data/card-catalog';

import { BANKS } from './banks';
import { answeredAlone, companiesFor, networksFor, typesFor, type Cascade } from './card-choices';

const CATALOG = await loadCatalog();
const values = <T>(list: readonly { value: T }[]) => list.map((c) => c.value);
const offered = <T>(c: { main: readonly { value: T }[]; checkYourCard: readonly { value: T }[] }) => [
  ...values(c.main),
  ...values(c.checkYourCard),
];
const credit = (over: Partial<Cascade> = {}): Cascade => ({ kind: 'credit', bankCard: 'bank', ...over });

describe('companies, narrowed by the kind and the bank', () => {
  it('Discount credit: Cal, Diners and Max, with Isracard and Amex hidden', () => {
    const c = companiesFor(credit({ bank: '11' }), CATALOG);
    expect(values(c.main).sort()).toEqual(['cal', 'diners', 'max']);
    expect(values(c.hidden).sort()).toEqual(['amex', 'isracard']);
  });
  it('Discount’s Max cell is confirmed with a dated source: the reason Max is offered', () => {
    const max = CATALOG.banks
      .find((b) => b.id === '11')
      ?.programmes.find((p) => p.issuer === 'max' && p.funding === 'credit');
    expect(max?.cell.status).toBe('confirmed');
    expect(max?.cell.source?.url).toMatch(/^https:\/\//);
    expect(max?.cell.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('Mercantile credit: Cal and Diners; Max hidden', () => {
    const c = companiesFor(credit({ bank: '17' }), CATALOG);
    expect(values(c.main).sort()).toEqual(['cal', 'diners']);
    expect(values(c.hidden)).toContain('max');
  });
  it('Mizrahi-Tefahot credit: all five', () => {
    expect(values(companiesFor(credit({ bank: '20' }), CATALOG).main).sort()).toEqual([
      'amex',
      'cal',
      'diners',
      'isracard',
      'max',
    ]);
  });
  it('One Zero: Isracard alone, then Mastercard alone, neither a screen', () => {
    expect(answeredAlone(companiesFor(credit({ bank: '18' }), CATALOG))).toBe('isracard');
    expect(answeredAlone(networksFor(credit({ bank: '18', company: 'isracard' }), CATALOG))).toBe(
      'mastercard',
    );
  });
  it('Hapoalim debit: Isracard alone', () => {
    expect(answeredAlone(companiesFor({ kind: 'debit', bankCard: 'bank', bank: '12' }, CATALOG))).toBe(
      'isracard',
    );
  });
  it('unverified is offered, never hidden: Leumi credit has Cal under Check your card', () => {
    const c = companiesFor(credit({ bank: '10' }), CATALOG);
    expect(values(c.main)).toEqual(expect.arrayContaining(['max', 'diners']));
    expect(values(c.checkYourCard)).toContain('cal');
  });
  it('Hapoalim credit has Cal under Check your card; Bank of Jerusalem debit has every debit company there', () => {
    expect(values(companiesFor(credit({ bank: '12' }), CATALOG).checkYourCard)).toContain('cal');
    expect(
      values(companiesFor({ kind: 'debit', bankCard: 'bank', bank: '54' }, CATALOG).checkYourCard).sort(),
    ).toEqual(['cal', 'isracard', 'max']);
  });
  it('an unresearched bank (Citibank 22) offers all five under Check your card', () => {
    expect(values(companiesFor(credit({ bank: '22' }), CATALOG).checkYourCard).sort()).toEqual([
      'amex',
      'cal',
      'diners',
      'isracard',
      'max',
    ]);
  });
  it('a non-bank credit card is offered exactly the five companies', () => {
    expect(values(companiesFor(credit({ bankCard: 'non_bank' }), CATALOG).main).sort()).toEqual([
      'amex',
      'cal',
      'diners',
      'isracard',
      'max',
    ]);
  });
});

describe('debit never offers a credit-only company', () => {
  it.each(BANKS.map((b) => b.code))('at bank %s, Amex and Diners are not offered for debit', (bank) => {
    const c = companiesFor({ kind: 'debit', bankCard: 'bank', bank }, CATALOG);
    expect(offered(c)).not.toContain('amex');
    expect(offered(c)).not.toContain('diners');
  });
});

describe('networks', () => {
  it.each([
    ['amex', ['amex']],
    ['diners', ['diners', 'mastercard']],
    ['cal', ['mastercard', 'visa']],
    ['max', ['mastercard', 'visa']],
    ['isracard', ['isracard', 'mastercard', 'visa']],
  ] as const)('%s credit offers %j', (company, expected) => {
    expect(offered(networksFor(credit({ bankCard: 'non_bank', company }), CATALOG)).sort()).toEqual(
      [...expected].sort(),
    );
  });
});

describe('never empty', () => {
  it('every path offers at least one choice at every step, and always an escape', () => {
    for (const kind of ['credit', 'debit', 'prepaid'] as const)
      for (const bankCard of ['bank', 'non_bank', 'not_sure'] as const)
        for (const bank of bankCard === 'bank' ? [...BANKS.map((b) => b.code), undefined] : [undefined]) {
          const base: Cascade = { kind, bankCard, ...(bank === undefined ? {} : { bank }) };
          const companies = companiesFor(base, CATALOG);
          expect(offered(companies).length, JSON.stringify(base)).toBeGreaterThan(0);
          expect(companies.escape).toBe('anotherCompany');
          for (const company of offered(companies)) {
            const networks = networksFor({ ...base, company }, CATALOG);
            expect(offered(networks).length, `${JSON.stringify(base)} ${company}`).toBeGreaterThan(0);
            expect(networks.escape).toBe('anotherNetwork');
            for (const network of offered(networks)) {
              expect(typesFor({ ...base, company, network }, CATALOG).escape).toBe('notInList');
            }
          }
        }
  });
});

describe('no catalog', () => {
  it('narrows nothing and tags nothing', () => {
    const c = companiesFor(credit({ bank: '11' }), undefined);
    expect(values(c.main).sort()).toEqual(['amex', 'cal', 'diners', 'isracard', 'max']);
    expect(c.checkYourCard).toEqual([]);
    expect(values(networksFor(credit({ company: 'amex' }), undefined).main)).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm test src/domain/card-matrix.test.ts`
Expected: FAIL: the module does not exist.

- [ ] **Step 3: Implement**

```ts
const COMPANIES: readonly IssuerId[] = ['isracard', 'amex', 'cal', 'diners', 'max'];
const NETWORKS: readonly CardNetwork[] = ['visa', 'mastercard', 'isracard', 'amex', 'diners'];
const RANK: Record<CellStatus, number> = { confirmed: 0, varies: 1, unverified: 2, absent: 3 };
/** Where nothing narrows (no catalog, company Other): offered, untagged. */
const OPEN = 'varies' satisfies CellStatus;

/** The most certain of several cells. A missing cell is unverified, never absent. */
function best(cells: readonly (MatrixCell | undefined)[]): MatrixCell | undefined {
  return cells
    .filter((c): c is MatrixCell => c !== undefined)
    .sort((a, b) => RANK[a.status] - RANK[b.status])[0];
}

/** A company no source places anywhere for this funding is absent at an unresearched bank too. */
function fundsAnywhere(catalog: Catalog, company: IssuerId, funding: CardFunding): boolean {
  const issuer = catalog.issuers.find((i) => i.id === company);
  if (issuer?.nonBank[funding]?.status !== 'absent') return true;
  return catalog.banks.some((b) =>
    b.programmes.some((p) => p.issuer === company && p.funding === funding && p.cell.status !== 'absent'),
  );
}

function programmeCell(
  catalog: Catalog,
  bank: string,
  company: IssuerId,
  funding: CardFunding,
): Pick<MatrixCell, 'status' | 'checked'> {
  const found = catalog.banks
    .find((b) => b.id === bank)
    ?.programmes.find((p) => p.issuer === company && p.funding === funding)?.cell;
  if (found !== undefined) return found;
  return {
    status: fundsAnywhere(catalog, company, funding) ? 'unverified' : 'absent',
    checked: CATALOG_CHECKED,
  };
}

/** Sorts into main, checkYourCard and hidden, and never leaves the first two empty (spec 21.4). */
function sortChoices<T>(
  all: readonly Choice<T>[],
  escape: Escape,
  first: (value: T) => boolean = () => false,
): Choices<T> {
  const ordered = all
    .map((choice, index) => ({ choice, index }))
    .sort(
      (a, b) =>
        Number(first(b.choice.value)) - Number(first(a.choice.value)) ||
        RANK[a.choice.status] - RANK[b.choice.status] ||
        a.index - b.index,
    )
    .map(({ choice }) => choice);
  const main = ordered.filter((c) => c.status === 'confirmed' || c.status === 'varies');
  let checkYourCard = ordered.filter((c) => c.status === 'unverified');
  const hidden = ordered.filter((c) => c.status === 'absent');
  if (main.length === 0 && checkYourCard.length === 0) {
    // Only a data gap gets here; card-matrix.test.ts proves today's data has none.
    checkYourCard = ordered.map((c) => ({ ...c, status: 'unverified' as const }));
  }
  const offered = [...main, ...checkYourCard];
  const only = offered.length === 1 ? offered[0]?.value : undefined;
  return {
    main,
    checkYourCard,
    hidden: main.length + hidden.length === 0 ? [] : hidden,
    escape,
    ...(only === undefined ? {} : { only }),
  };
}

export function answeredAlone<T>(choices: Choices<T>): T | undefined {
  const [one, ...more] = [...choices.main, ...choices.checkYourCard];
  return one !== undefined && more.length === 0 && one.status === 'confirmed' ? one.value : undefined;
}
```

- `companiesFor`: no catalog → the five, status `OPEN`. `bankCard === 'bank'` with a `bank` → `programmeCell` per company. `'non_bank'` → `issuer.nonBank[funding]`, or unverified when missing. `'not_sure'`, or a bank card whose bank was typed by hand → per company `best([nonBank, …every bank's programme for this funding])`, and `absent` only when `!fundsAnywhere`. Escape `'anotherCompany'`.
- `networksFor`: no catalog, company `'other'` or none → all five, `OPEN`. Otherwise `issuer.networks[funding]`'s cells (a network with no cell is `absent`: the company's own list is complete). Where the bank's programme has `networks`, those cells replace the company's, and a network missing from them is `absent`. Escape `'anotherNetwork'`.
- `banksFor`: every live code in `BANKS` (israel and arab groups), status `best` of the bank's programmes for the funding, or the `fundsAnywhere` default for an unresearched bank; the household's banks first. Escape `'showAllBanks'`.
- `typesFor`: the company's issued tiers whose `funding ?? 'credit'` is the kind's funding and whose `networks` (when set) include `c.network`, then its issued clubs by the same rule, each `confirmed`, as `tier:<id>` and `club:<id>`. No catalog or company Other → none in the lists. Escape `'notInList'`.

- [ ] **Step 4: Run**

Run: `pnpm test src/domain/card-matrix.test.ts && pnpm catalog:check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/card-choices.ts src/domain/card-matrix.test.ts
git commit -m "Each card question offers only the banks, companies, networks and types that go with the answers before it, and never an empty list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B3 (R1, R5, R6, R13): The flow's state, its steps, and what each kind saves

**Files:**

- Create: `src/domain/card-flow.ts` (it also re-exports `card-choices.ts`, so spec 14's single module name holds)
- Modify: `src/domain/card-draft.ts` (`CardDraft` and `DRAFT_KEYS` gain `issuerName`, `loadFee`, `acceptedAt`, `issuerBank`, `productName`; `cardFromDraft` writes `issuerName`, `loadFeeMinor`, `acceptedAt`, `issuerBank`, `productName`)
- Test: `src/domain/card-flow.test.ts` (new), `src/domain/card-draft.test.ts`

**Interfaces:**

- Consumes: `Choices`, `Cascade`, `answeredAlone`, `companiesFor`, `networksFor`, `typesFor` (B2); `cardFromDraft`, `CardDraft`, `CardDraftField`, `linkedDraft` (`card-draft.ts`); `cardKindOf`, `CardKindName` (A6); `cardIdentityOf`, `legacyBankText` (B4); `CardMove` (B5); `cardCommitments`, `CardCommitments` (`cards.ts`); `toMinor` (`src/lib/money.ts`).
- Produces:

```ts
export type FlowStep =
  | 'kind'
  | 'bankCard'
  | 'bank'
  | 'company'
  | 'network'
  | 'type'
  | 'card'
  | 'billing'
  | 'fees'
  | 'moneyIn'
  | 'value'
  | 'review';

export type CardFlowState = {
  readonly kind?: CardKindName;
  /** Before a catalog type switched it (spec 3.5), for Undo. */
  readonly switchedFrom?: CardKindName;
  readonly bankCard?: BankCardAnswer;
  readonly bank?: { readonly code: string } | { readonly name: string };
  readonly company?: IssuerId | 'other';
  readonly companyName: string;
  readonly network?: CardNetwork | 'none';
  readonly type?: TypeChoice;
  readonly typeText: string;
  readonly clubText: string;
  readonly draft: CardDraft;
  readonly owner: string;
  readonly ownerEdited: boolean;
  readonly color: CardColor | '';
  readonly name: string;
  readonly nameEdited: boolean;
  readonly start?: { readonly amount: string; readonly date: LocalDate };
  readonly loadFrom?: { readonly accountId: string } | { readonly cardId: string } | 'elsewhere';
  /** Field names a document gave: "From your statement" on review. */
  readonly fromStatement: ReadonlySet<string>;
  readonly answered: ReadonlySet<FlowStep>;
};

export type NameLabels = {
  readonly kindName: Record<CardKindName, string>;
  readonly debit: string; // "Debit" / "דביט", where a debit card has no type
  readonly giftUntil: (name: string, month: string) => string;
};

export function emptyFlowState(owner: string): CardFlowState;
export function stepsFor(state: CardFlowState, catalog: Catalog | undefined): readonly FlowStep[];
export function firstOpenStep(state: CardFlowState, catalog: Catalog | undefined): FlowStep;
export function answer(
  state: CardFlowState,
  step: FlowStep,
  patch: Partial<CardFlowState>,
  ctx: FlowContext,
): CardFlowState;
export function kindFromCatalog(catalog: Catalog, company: IssuerId, type: TypeChoice): CardKindName;
export function switchKind(state: CardFlowState, kind: CardKindName): CardFlowState;
export function fieldsFor(kind: CardKindName): ReadonlySet<keyof CardDetails>;
export function suggestedName(
  state: CardFlowState,
  language: string,
  labels: NameLabels,
  catalog: Catalog | undefined,
): string;
export function duplicateOf(state: CardFlowState, cards: readonly PaymentMethod[]): PaymentMethod | undefined;
export function asksToDiscard(state: CardFlowState, step: FlowStep, catalog: Catalog | undefined): boolean;
export function canChangeKind(method: PaymentMethod, commitments: CardCommitments): boolean;
export function stateFromMethod(
  method: PaymentMethod,
  accounts: readonly PaymentMethod[],
  moves: readonly CardMove[],
): CardFlowState;

export type FlowContext = {
  readonly previous?: PaymentMethod;
  readonly accounts: readonly PaymentMethod[];
  readonly cards: readonly PaymentMethod[];
  readonly language: string;
  readonly month: string; // YYYY-MM
  readonly catalog?: Catalog;
};
export type FlowSave = {
  readonly method: {
    readonly label: string;
    readonly type: 'credit_card' | 'debit_card';
    readonly profileId: string;
    readonly color?: string;
    readonly creditAnnualRate?: string | null;
    readonly card: CardDetails;
  };
  readonly start?: { readonly amountMinor: number; readonly date: LocalDate };
};
export function methodFromState(
  state: CardFlowState,
  ctx: FlowContext,
):
  | { readonly ok: true; readonly save: FlowSave }
  | { readonly ok: false; readonly invalid: readonly CardDraftField[] };
```

- [ ] **Step 1: Write the failing tests**

`src/domain/card-flow.test.ts`. Write one `it` per bullet of spec 18.1's `card-flow.test.ts` list, as amended by 21.11 and section 22. The cases with their exact expectations:

```ts
import { describe, expect, it } from 'vitest';

import { loadCatalog } from '@/data/card-catalog';

import { EMPTY_CARD_DRAFT } from './card-draft';
import {
  emptyFlowState,
  firstOpenStep,
  kindFromCatalog,
  methodFromState,
  stepsFor,
  suggestedName,
  type CardFlowState,
  type FlowContext,
} from './card-flow';
import { d } from './test-factories';

const CATALOG = await loadCatalog();
const S = (over: Partial<CardFlowState>): CardFlowState => ({ ...emptyFlowState('p1'), ...over });
const acc = (id: string, bank: string) =>
  ({
    id,
    type: 'bank_account',
    label: id,
    profileId: 'p1',
    isArchived: 0,
    account: { bank, holding: 'personal' },
  }) as never;
const CTX: FlowContext = {
  accounts: [acc('acc-11', '11'), acc('acc-12', '12')],
  cards: [],
  language: 'en',
  month: '2026-10',
  catalog: CATALOG,
};
const LABELS = {
  kindName: { credit: 'Credit card', debit: 'Debit card', prepaid: 'Prepaid card', gift: 'Gift card' },
  debit: 'Debit',
  giftUntil: (name: string, month: string) => `${name} · until ${month}`,
};

describe('stepsFor', () => {
  it('a bank credit card has ten screens', () => {
    expect(stepsFor(S({ kind: 'credit', bankCard: 'bank', bank: { code: '11' } }), CATALOG)).toEqual([
      'kind',
      'bankCard',
      'bank',
      'company',
      'network',
      'type',
      'card',
      'billing',
      'fees',
      'review',
    ]);
  });
  it('a non-bank credit card has nine: no bank question', () => {
    const steps = stepsFor(S({ kind: 'credit', bankCard: 'non_bank' }), CATALOG);
    expect(steps).not.toContain('bank');
    expect(steps).toHaveLength(9);
  });
  it('Not sure skips the bank question too', () => {
    expect(stepsFor(S({ kind: 'credit', bankCard: 'not_sure' }), CATALOG)).not.toContain('bank');
  });
  it('One Zero drops the company and network screens: eight', () => {
    expect(stepsFor(S({ kind: 'credit', bankCard: 'bank', bank: { code: '18' } }), CATALOG)).toHaveLength(8);
  });
  it('a debit card has eight, never billing, with its bank-card question folded into the bank step', () => {
    expect(stepsFor(S({ kind: 'debit' }), CATALOG)).toEqual([
      'kind',
      'bank',
      'company',
      'network',
      'type',
      'card',
      'fees',
      'review',
    ]);
  });
  it('a prepaid card asks for its money in; a gift card has five steps', () => {
    expect(stepsFor(S({ kind: 'prepaid', bankCard: 'non_bank' }), CATALOG)).toContain('moneyIn');
    expect(stepsFor(S({ kind: 'gift' }), CATALOG)).toEqual(['kind', 'company', 'card', 'value', 'review']);
  });
});

describe('the company is asked once (R1)', () => {
  it.each(['credit', 'debit', 'prepaid', 'gift'] as const)('%s has exactly one company step', (kind) => {
    expect(stepsFor(S({ kind, bankCard: 'bank' }), CATALOG).filter((s) => s === 'company')).toHaveLength(1);
  });
});

describe('what each kind saves (R5)', () => {
  it('a debit card writes funding, the issuing bank and the account, and never a billing day, limit or rate', () => {
    const result = methodFromState(
      S({
        kind: 'debit',
        bankCard: 'bank',
        bank: { code: '12' },
        company: 'isracard',
        network: 'mastercard',
        draft: {
          ...EMPTY_CARD_DRAFT,
          accountId: 'acc-12',
          lastDigits: '5678',
          billingDay: '10',
          creditLimit: '5000',
          monthlyFee: '7',
        },
      }),
      CTX,
    );
    if (!result.ok) throw new Error('invalid');
    expect(result.save.method).toMatchObject({
      type: 'debit_card',
      card: {
        funding: 'debit',
        kind: 'bank',
        issuerBank: '12',
        issuer: 'isracard',
        accountId: 'acc-12',
        lastDigits: '5678',
        monthlyFeeMinor: 700,
      },
    });
    expect(result.save.method.card).not.toHaveProperty('billingDay');
    expect(result.save.method.card).not.toHaveProperty('creditLimitMinor');
    expect(result.save.method).not.toHaveProperty('creditAnnualRate');
  });
  it('a prepaid card writes its loading card, load fee, and a start move', () => {
    const result = methodFromState(
      S({
        kind: 'prepaid',
        bankCard: 'non_bank',
        company: 'cal',
        loadFrom: { cardId: 'pm-credit' },
        draft: { ...EMPTY_CARD_DRAFT, loadFee: '3.50' },
        start: { amount: '400', date: d('2026-10-10') },
      }),
      CTX,
    );
    if (!result.ok) throw new Error('invalid');
    expect(result.save.method.card).toMatchObject({
      funding: 'prepaid',
      kind: 'non_bank',
      loadCardId: 'pm-credit',
      loadFeeMinor: 350,
    });
    expect(result.save.start).toEqual({ amountMinor: 40000, date: d('2026-10-10') });
  });
  it('a gift card from BuyMe writes issuer other with its name, where it is accepted, the expiry and the value', () => {
    const result = methodFromState(
      S({
        kind: 'gift',
        company: 'other',
        companyName: 'BuyMe',
        draft: { ...EMPTY_CARD_DRAFT, acceptedAt: 'Spa', expires: '03/31' },
        start: { amount: '300', date: d('2026-10-01') },
      }),
      CTX,
    );
    if (!result.ok) throw new Error('invalid');
    expect(result.save.method.card).toEqual({
      funding: 'gift',
      issuer: 'other',
      issuerName: 'BuyMe',
      acceptedAt: 'Spa',
      expiresMonth: '2031-03',
    });
    expect(result.save.start).toEqual({ amountMinor: 30000, date: d('2026-10-01') });
  });
  it('a credit card writes what MethodForm wrote for the same answers, with issuerName, and no funding', () => {
    const draft = {
      ...EMPTY_CARD_DRAFT,
      issuer: 'max' as const,
      lastDigits: '1234',
      billingDay: '10',
      fxFee: '2.5',
    };
    const result = methodFromState(S({ kind: 'credit', bankCard: 'non_bank', company: 'max', draft }), CTX);
    if (!result.ok) throw new Error('invalid');
    expect(result.save.method.card).toMatchObject({
      issuer: 'max',
      kind: 'non_bank',
      lastDigits: '1234',
      billingDay: 10,
      fxFeeRate: '2.5',
    });
    expect(result.save.method.card).not.toHaveProperty('funding');
  });
  it('keeps the unknown keys of the card being edited', () => {
    const previous = { id: 'pm-1', type: 'credit_card', card: { issuer: 'max', fromLater: 'x' } } as never;
    const result = methodFromState(S({ kind: 'credit', bankCard: 'non_bank', company: 'max' }), {
      ...CTX,
      previous,
    });
    expect(result.ok && result.save.method.card).toMatchObject({ fromLater: 'x' });
  });
});

describe('worked examples (spec 21.5)', () => {
  it('A: a Discount card run by Max saves the issuing bank, the company, the network, the account and the legacy text', () => {
    const result = methodFromState(
      S({
        kind: 'credit',
        bankCard: 'bank',
        bank: { code: '11' },
        company: 'max',
        network: 'visa',
        draft: { ...EMPTY_CARD_DRAFT, accountId: 'acc-11', productName: 'Discount Basic International' },
      }),
      CTX,
    );
    if (!result.ok) throw new Error('invalid');
    expect(result.save.method.card).toMatchObject({
      kind: 'bank',
      issuerBank: '11',
      issuer: 'max',
      network: 'visa',
      accountId: 'acc-11',
      productName: 'Discount Basic International',
      bank: 'Discount Bank',
    });
  });
  it('B: a Discount card run by Cal', () => {
    const result = methodFromState(
      S({ kind: 'credit', bankCard: 'bank', bank: { code: '11' }, company: 'cal', network: 'visa' }),
      CTX,
    );
    expect(result.ok && result.save.method.card).toMatchObject({
      kind: 'bank',
      issuerBank: '11',
      issuer: 'cal',
      network: 'visa',
    });
  });
  it('C: Max’s own card, paid from the Discount account', () => {
    const result = methodFromState(
      S({
        kind: 'credit',
        bankCard: 'non_bank',
        company: 'max',
        network: 'mastercard',
        draft: { ...EMPTY_CARD_DRAFT, accountId: 'acc-11' },
      }),
      CTX,
    );
    expect(result.ok && result.save.method.card).toMatchObject({
      kind: 'non_bank',
      issuer: 'max',
      network: 'mastercard',
      accountId: 'acc-11',
    });
    expect(result.ok && result.save.method.card).not.toHaveProperty('issuerBank');
  });
  it('D: Isracard’s own card on the Isracard network', () => {
    const result = methodFromState(
      S({ kind: 'credit', bankCard: 'non_bank', company: 'isracard', network: 'isracard' }),
      CTX,
    );
    expect(result.ok && result.save.method.card).toMatchObject({
      kind: 'non_bank',
      issuer: 'isracard',
      network: 'isracard',
    });
  });
  it('E: a Mizrahi-Tefahot card run by Isracard on Mastercard', () => {
    const result = methodFromState(
      S({
        kind: 'credit',
        bankCard: 'bank',
        bank: { code: '20' },
        company: 'isracard',
        network: 'mastercard',
      }),
      CTX,
    );
    expect(result.ok && result.save.method.card).toMatchObject({
      kind: 'bank',
      issuerBank: '20',
      issuer: 'isracard',
      network: 'mastercard',
    });
  });
});

describe('suggestedName (spec 21.6)', () => {
  const discountMax = S({
    kind: 'credit',
    bankCard: 'bank',
    bank: { code: '11' },
    company: 'max',
    network: 'visa',
    typeText: 'Visa International',
    draft: { ...EMPTY_CARD_DRAFT, lastDigits: '1234' },
  });
  it('a bank card in English: Discount Visa International · Max ·1234', () => {
    expect(suggestedName(discountMax, 'en', LABELS, CATALOG)).toBe(
      'Discount Visa International · Max ·⁦1234⁩',
    );
  });
  it('a bank card in Hebrew: the bank and company in Hebrew', () => {
    expect(suggestedName(discountMax, 'he', LABELS, CATALOG)).toBe(
      'דיסקונט Visa International · מקס ·⁦1234⁩',
    );
  });
  it('a non-bank card with a product name: Max Dream Card VIP ·1234', () => {
    const state = S({
      kind: 'credit',
      bankCard: 'non_bank',
      company: 'max',
      draft: { ...EMPTY_CARD_DRAFT, productName: 'Dream Card VIP', lastDigits: '1234' },
    });
    expect(suggestedName(state, 'en', LABELS, CATALOG)).toBe('Max Dream Card VIP ·⁦1234⁩');
  });
  it('a debit card with no type: Hapoalim Debit ·1234', () => {
    const state = S({
      kind: 'debit',
      bankCard: 'bank',
      bank: { code: '12' },
      draft: { ...EMPTY_CARD_DRAFT, lastDigits: '1234' },
    });
    expect(suggestedName(state, 'en', LABELS, CATALOG)).toBe('Hapoalim Debit ·⁦1234⁩');
  });
  it('a gift card: BuyMe · until 03/31, and BuyMe alone with no expiry', () => {
    const gift = S({
      kind: 'gift',
      company: 'other',
      companyName: 'BuyMe',
      draft: { ...EMPTY_CARD_DRAFT, expires: '03/31' },
    });
    expect(suggestedName(gift, 'en', LABELS, CATALOG)).toBe('BuyMe · until ⁦03/31⁩');
    expect(suggestedName({ ...gift, draft: EMPTY_CARD_DRAFT }, 'en', LABELS, CATALOG)).toBe('BuyMe');
  });
  it('nothing known: the kind’s name', () => {
    expect(suggestedName(S({ kind: 'prepaid' }), 'en', LABELS, CATALOG)).toBe('Prepaid card');
  });
});

describe('firstOpenStep', () => {
  it('an empty card opens on the kind', () => {
    expect(firstOpenStep(S({}), CATALOG)).toBe('kind');
  });
  it('a Max export alone (company and product given, bank card or not unknown) opens on Is it a bank card?', () => {
    expect(
      firstOpenStep(S({ kind: 'credit', company: 'max', answered: new Set(['kind', 'company']) }), CATALOG),
    ).toBe('bankCard');
  });
  it('a Discount export (bank card, bank, company, network given) opens on the type', () => {
    const state = S({
      kind: 'credit',
      bankCard: 'bank',
      bank: { code: '11' },
      company: 'cal',
      network: 'visa',
      answered: new Set(['kind', 'bankCard', 'bank', 'company', 'network']),
    });
    expect(firstOpenStep(state, CATALOG)).toBe('type');
  });
});

describe('the catalog says it is another kind (spec 3.5)', () => {
  it.each([
    ['isracard', 'tier:direct', 'debit'],
    ['cal', 'tier:prepaid', 'prepaid'],
    ['cal', 'tier:paybox_young', 'prepaid'],
    ['max', 'tier:cash', 'prepaid'],
    ['cal', 'club:mycal', 'prepaid'],
    ['max', 'club:mymax', 'prepaid'],
    ['max', 'club:kranot_prepaid', 'prepaid'],
    ['isracard', 'tier:digital', 'credit'],
  ] as const)('%s %s reads as %s', (company, type, kind) => {
    expect(kindFromCatalog(CATALOG, company, type)).toBe(kind);
  });
});
```

Also write, in the same file and the same style, the cases these spec lines name, with the expectations they state: `switchKind` keeps the company, type and bank and Undo restores credit with the type cleared (3.5); the name follows the answers until edited and again after clearing (4.2); the owner follows the paying account, the debit account and the loading card until touched, and a one-person household (4.3); `duplicateOf` for same kind, company and digits, another kind, another company, no digits, archived, deleted (4.4); `asksToDiscard` false on the first three screens and true from the fourth, for each kind (4.5); `canChangeKind` blocked from credit with an open plan or an unbilled 30+ purchase, allowed otherwise, allowed between debit and prepaid (7.1); `answer` on a bank change clears a now-hidden company and keeps a now-unverified one with `checked` cleared (21.4).

- [ ] **Step 2: Run to fail**

Run: `pnpm test src/domain/card-flow.test.ts`
Expected: FAIL: the module does not exist.

- [ ] **Step 3: Implement the steps**

```ts
const cascadeOf = (s: CardFlowState, kind: Cascade['kind']): Cascade => ({
  kind,
  ...(kind === 'debit'
    ? { bankCard: 'bank' as const }
    : s.bankCard === undefined
      ? {}
      : { bankCard: s.bankCard }),
  ...(s.bank !== undefined && 'code' in s.bank ? { bank: s.bank.code } : {}),
  ...(s.company === undefined ? {} : { company: s.company }),
  ...(s.network === undefined || s.network === 'none' ? {} : { network: s.network }),
});

export function stepsFor(state: CardFlowState, catalog: Catalog | undefined): readonly FlowStep[] {
  const kind = state.kind ?? 'credit';
  if (kind === 'gift') return ['kind', 'company', 'card', 'value', 'review'];
  const c = cascadeOf(state, kind);
  const steps: FlowStep[] = ['kind'];
  if (kind !== 'debit') steps.push('bankCard');
  if (kind === 'debit' || state.bankCard === 'bank') steps.push('bank');
  const company = c.company ?? answeredAlone(companiesFor(c, catalog));
  if (answeredAlone(companiesFor(c, catalog)) === undefined) steps.push('company');
  const withCompany: Cascade = company === undefined ? c : { ...c, company };
  if (answeredAlone(networksFor(withCompany, catalog)) === undefined) steps.push('network');
  const types = typesFor(withCompany, catalog);
  if (company === undefined || company === 'other' || types.main.length !== 1) steps.push('type');
  steps.push('card');
  if (kind === 'credit') steps.push('billing');
  if (kind === 'prepaid') steps.push('moneyIn');
  steps.push('fees', 'review');
  return steps;
}

export function firstOpenStep(state: CardFlowState, catalog: Catalog | undefined): FlowStep {
  return stepsFor(state, catalog).find((step) => !state.answered.has(step)) ?? 'review';
}
```

`answer(state, step, patch, ctx)`:

- merges `patch` and adds `step` to `answered`;
- after a change to `kind`, `bankCard`, `bank`, `company` or `network`, re-runs the later lists (`companiesFor`, `networksFor`, `typesFor`) and clears each later answer that is now in `hidden`. An answer now in `checkYourCard` stays, with `draft.checked` cleared (spec 21.4);
- on the bank step, picking a household account sets `bank: { code: account.account.bank }` and `draft.accountId` together;
- sets the owner from `draft.accountId` or `loadFrom` (the account's or the credit card's `profileId`) unless `ownerEdited`;
- sets `name` to `suggestedName` unless `nameEdited`. Clearing the name to '' sets `nameEdited: false`;
- on the type step, when `kindFromCatalog` differs from the kind, returns `switchKind(next, newKind)`.

- [ ] **Step 4: Implement saving**

```ts
const BASE: readonly (keyof CardDetails)[] = [
  'issuer',
  'issuerName',
  'network',
  'kind',
  'bank',
  'issuerBank',
  'tier',
  'club',
  'productName',
  'lastDigits',
  'expiresMonth',
  'catalog',
  'checked',
];

export function fieldsFor(kind: CardKindName): ReadonlySet<keyof CardDetails> {
  switch (kind) {
    case 'credit':
      return new Set([
        ...BASE,
        'accountId',
        'billingDay',
        'creditLimitMinor',
        'monthlyFeeMinor',
        'feeSince',
        'feeDiscount',
        'fxFeeRate',
        'creditPrimeMargin',
        'lateRate',
        'overrides',
      ]);
    case 'debit':
      return new Set([...BASE, 'funding', 'accountId', 'monthlyFeeMinor', 'feeSince', 'fxFeeRate']);
    case 'prepaid':
      return new Set([
        ...BASE,
        'funding',
        'accountId',
        'monthlyFeeMinor',
        'feeSince',
        'fxFeeRate',
        'loadCardId',
        'loadFeeMinor',
      ]);
    case 'gift':
      return new Set([
        'funding',
        'issuer',
        'issuerName',
        'network',
        'lastDigits',
        'expiresMonth',
        'acceptedAt',
      ]);
  }
}
```

`methodFromState(state, ctx)`:

1. Builds a `CardDraft` from the state: `issuer` from `company` (`'other'` with `issuerName` from `companyName`), `kind` from `bankCard` (`'not_sure'` writes none), `issuerBank` from `bank.code`, `tier` and `club` from `type` or `typeText` and `clubText`, `network` (none when `'none'`), the rest from `state.draft`. A catalog choice runs `linkedDraft` as `IssuerChooser` does today.
2. Runs `cardFromDraft(draft, { previous: ctx.previous?.card, month: ctx.month })`. It returns `invalid` fields on failure.
3. Keeps only `fieldsFor(kind)`, plus the unknown keys `cardFromDraft` carries over (keys in neither `fieldsFor` of any kind nor `DRAFT_KEYS`).
4. Sets `funding` for a non-credit kind, and removes it for credit.
5. Writes the legacy `bank` text with `legacyBankText` (B4): the issuing bank for a bank card, the paying account's bank for a non-bank card.
6. For a credit card, `creditAnnualRate` as `MethodForm.save` computes it today. For any other kind, `creditAnnualRate: null` when `ctx.previous` had one, else nothing.
7. Converts `start.amount` with `toMinor(amount, 'ILS')`, when the kind is prepaid or gift and the amount is filled.
8. `label` is `state.name`, or `suggestedName` when empty. `type` is `'credit_card'` for credit, else `'debit_card'`. `color` is `state.color` unless empty.

- [ ] **Step 5: Implement the rest**

`suggestedName(state, language, labels, catalog)` per spec 21.6 and 4.2:

- the bank's short name is `bankName(bankByCode(code), language)` with a leading `Bank ` or `בנק ` and a trailing ` Bank` removed ("Bank Hapoalim" → "Hapoalim", "Discount Bank" → "Discount", "בנק דיסקונט" → "דיסקונט"); a typed bank name is used as typed;
- the company's name is the catalog issuer's `name[language]`, or `companyName` for Other;
- the middle part is the club, else `productName`, else the type's catalog name in the language, else `typeText`;
- a bank card is `{bank} {middle} · {company} ·{last4}`; a non-bank card or a prepaid card from a company is `{company} {middle} ·{last4}`; a debit card is `{bank} {middle or labels.debit} ·{last4}`; a gift card is `labels.giftUntil(issuer, MM/YY)`, or the issuer alone;
- `·1234` and `03/31` are wrapped in U+2066 … U+2069; missing parts are dropped with their separators; nothing known gives `labels.kindName[kind]`.

`duplicateOf`, `asksToDiscard` (true from the fourth step of `stepsFor` on), `canChangeKind` (`commitments.plans.length === 0` and no unbilled deferral, when the method is credit) and `stateFromMethod` follow spec 4.4, 4.5, 7.1 and 21.8. `stateFromMethod` reads the bank and bank-card answers through `cardIdentityOf` (B4), the start through `earliestCardStart` (B5), and marks every step whose fields are set as `answered`.

- [ ] **Step 6: Run**

Run: `pnpm test src/domain/card-flow.test.ts src/domain/card-draft.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain/card-flow.ts src/domain/card-flow.test.ts src/domain/card-draft.ts src/domain/card-draft.test.ts
git commit -m "The add-card steps are worked out from the answers: each question once, and debit, prepaid and gift cards save only their own details

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B4 (R13, R5): Existing cards read as issuer, company and network without a migration; debit and prepaid fees count

**Files:**

- Modify: `src/domain/cards.ts` (`cardIdentityOf`, `issuerOf`, `legacyBankText`; widen `cardFeeOccurrences`, `chargesFeeIn`, `fxFeeFor`)
- Modify: `src/types/domain.ts` (`export type CardCompany = CardIssuer;`, and `CardIssuer`'s comment becomes "The card company that runs the card; for a non-bank card, also its issuer")
- Test: `src/domain/cards-identity.test.ts` (new), `src/domain/cards.test.ts`

**Interfaces:**

- Consumes: `bankFromName` (`src/domain/import-cards.ts`), `bankByCode`, `bankName` (`src/domain/banks.ts`), `cardKindOf` (A6).
- Produces:

```ts
export type CardIdentity = {
  readonly bankCard?: 'bank' | 'non_bank';
  readonly issuerBank?: string;
  /** The issuing bank was taken from the paying account: "Check your card". */
  readonly inferred?: true;
  /** A bank card paid from an account at another bank: the summary warns. */
  readonly accountElsewhere?: true;
};
export function cardIdentityOf(
  card: CardDetails | undefined,
  accounts: readonly PaymentMethod[],
): CardIdentity;
/** The big name on the card: the issuing bank of a bank card, else the card company. */
export function issuerOf(
  card: CardDetails | undefined,
  accounts: readonly PaymentMethod[],
): { readonly bank: string } | { readonly company: CardIssuer } | undefined;
export function legacyBankText(
  identity: CardIdentity,
  card: Pick<CardDetails, 'accountId'>,
  accounts: readonly PaymentMethod[],
  language: string,
): string | undefined;
```

- [ ] **Step 1: Write the failing tests** (every row of spec 21.8)

```ts
import { describe, expect, it } from 'vitest';

import { cardIdentityOf, legacyBankText } from './cards';

const acc = (id: string, bank: string) =>
  ({ id, type: 'bank_account', account: { bank, holding: 'personal' } }) as never;
const ACCOUNTS = [acc('a11', '11'), acc('a12', '12')];
const link = (bank: string) => ({ catalog: { issuer: 'max', bank, tier: 'x', version: 1 } });

describe('cardIdentityOf', () => {
  it.each([
    ['a catalog bank code', link('11'), { bankCard: 'bank', issuerBank: '11' }],
    ['a catalog "none"', link('none'), { bankCard: 'non_bank' }],
    [
      'bank text that names a bank',
      { kind: 'bank', bank: 'בנק דיסקונט' },
      { bankCard: 'bank', issuerBank: '11' },
    ],
    [
      'unreadable text and an account at a known bank',
      { kind: 'bank', bank: 'zzz', accountId: 'a12' },
      { bankCard: 'bank', issuerBank: '12', inferred: true },
    ],
    ['a bank card with nothing else', { kind: 'bank' }, { bankCard: 'bank' }],
    [
      'a non-bank card: its text named the account’s bank',
      { kind: 'non_bank', bank: 'Leumi', accountId: 'a11' },
      { bankCard: 'non_bank' },
    ],
    ['no kind: the text is not used to guess', { bank: 'Leumi' }, {}],
    [
      'a bank card paid from another bank',
      { kind: 'bank', issuerBank: '11', accountId: 'a12' },
      { bankCard: 'bank', issuerBank: '11', accountElsewhere: true },
    ],
  ] as const)('%s', (_, card, identity) => {
    expect(cardIdentityOf(card as never, ACCOUNTS)).toEqual(identity);
  });
});

describe('the legacy bank text is still written', () => {
  it('names the issuing bank on a bank card', () => {
    expect(legacyBankText({ bankCard: 'bank', issuerBank: '11' }, {}, ACCOUNTS, 'en')).toBe('Discount Bank');
  });
  it('names the paying account’s bank on a non-bank card', () => {
    expect(legacyBankText({ bankCard: 'non_bank' }, { accountId: 'a12' }, ACCOUNTS, 'he')).toBe(
      'בנק הפועלים',
    );
  });
});
```

(These are `banks.ts`'s names for codes 11 and 12.)

In `cards.test.ts`: a debit card's and a prepaid card's monthly fee is an occurrence on the last day of each month, on the card itself; a prepaid card with `loadCardId` naming a live credit card has its fee line paid with that credit card; a gift card has no fee line; `fxFeeFor` gives a debit card's `fxFeeRate` for a non-shekel purchase and a gift card none.

- [ ] **Step 2: Run to fail**

Run: `pnpm test src/domain/cards-identity.test.ts src/domain/cards.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`cardIdentityOf` applies the spec 21.8 table in order: `issuerBank` when set; else `catalog.bank`, a code meaning bank and `'none'` non-bank; else `kind: 'bank'` with `bankFromName(card.bank)`, falling back to the account's bank with `inferred`; else `kind: 'non_bank'` (the text ignored); else `{}`. `accountElsewhere` when a bank card's `accountId` names an account whose `account.bank` differs from `issuerBank`.

The fee functions: replace each `type === 'credit_card'` check with `cardKindOf(card)` being `'credit'`, `'debit'` or `'prepaid'`. A non-credit card's fee is dated `endOfMonth(month)`, its `paymentMethodId` is the card's own id, or its `loadCardId` when that names a live `credit_card`. Credit cards stay exactly as they are; their tests must not change.

- [ ] **Step 4: Run**

Run: `pnpm test src/domain src/features/summary src/features/chart src/features/cards`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/cards.ts src/domain/cards-identity.test.ts src/domain/cards.test.ts src/types/domain.ts
git commit -m "Each card knows which bank issued it apart from the account it is paid from, and debit and prepaid card fees are counted

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B5 (R5): Prepaid and gift balances as pots, synced and exported

**Files:**

- Modify: `src/types/domain.ts` (`CardMove`), `src/db/db.ts` (`cardMoves` table), `src/db/versions.ts` (version 5: `stores: { cardMoves: 'id, [methodId+isDeleted+date], updatedAt' }`, `upgrade: resetPullCursors`), `src/db/sync/tables.ts` (`SYNCED_TABLES`), `src/domain/transfer-schema.ts` (`cardMoveSchema`, `rowSchemas.cardMoves`, envelope `counts.cardMoves` and `data.cardMoves`, each with `.default(...)` so an older file imports), `src/db/transfer.ts` (export, replace and merge import), `src/db/integrity.ts` (`card_move_orphan`), Delete all data (`src/db/sync/erase.ts` and the local wipe), linked spaces (`src/db/sync/spaces.ts`, `linked.ts`: check `homeOfPulled` and `deliveries()` exactly as the cash spec did)
- Create: `src/db/repos/card-moves.ts`, `src/domain/card-pots.ts`
- Test: `src/db/repos/card-moves.test.ts`, `src/domain/card-pots.test.ts`, `src/domain/transfer-schema.test.ts`, `src/db/transfer.test.ts`, `src/db/integrity.test.ts`, `src/db/versions.test.ts`, `src/db/sync/convergence.test.ts`

**Interfaces:**

- Produces: `CardMove = { readonly id: string; readonly methodId: string; readonly kind: string; readonly amountMinor: number; readonly date: LocalDate; readonly fromId?: string; readonly note?: string; readonly isDeleted: 0 | 1; readonly deletedAt?: IsoInstant; readonly createdAt: IsoInstant; readonly updatedAt: IsoInstant }`; `writeCardStart(db, methodId, amountMinor, date, now): Promise<CardMove>` (writes or rewrites the one start move); `listCardMoves(db, methodId): Promise<CardMove[]>`; `cardPot(card: PaymentMethod, moves: readonly CardMove[], occurrences: readonly Occurrence[], today: LocalDate): number | undefined` (undefined with no start); `earliestCardStart(moves): CardMove | undefined`.

The pattern is the cash tab: `src/db/repos/cash-moves.ts`, `src/domain/cash.ts` (`personCash`, `earliestStart`), their tests, and `docs/superpowers/specs/2026-10-09-cash-deposit-design.md` section 5. Follow that section's checklist line by line, replacing `cashMoves` with `cardMoves` and `profileId` with `methodId`.

- [ ] **Step 1: Write the failing tests**

`src/domain/card-pots.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { cardPot } from './card-pots';
import { d, makeTx } from './test-factories';
import { expandOccurrences } from './occurrences';

const GIFT = { id: 'g', type: 'debit_card', card: { funding: 'gift' } } as never;
const move = (
  kind: string,
  amountMinor: number,
  date: string,
  createdAt = '2026-10-01T08:00:00.000Z',
  isDeleted: 0 | 1 = 0,
) =>
  ({
    id: `${kind}${date}${createdAt}`,
    methodId: 'g',
    kind,
    amountMinor,
    date: d(date),
    isDeleted,
    createdAt,
    updatedAt: createdAt,
  }) as never;
const spend = (amountMinor: number, date: string, createdAt = '2026-10-05T08:00:00.000Z') =>
  expandOccurrences(
    makeTx({ kind: 'expense', amountMinor, date: d(date), paymentMethodId: 'g', createdAt }),
    [],
    d(date),
    d(date),
  );

describe('cardPot', () => {
  it('is the start alone', () => {
    expect(cardPot(GIFT, [move('start', 30000, '2026-10-01')], [], d('2026-10-10'))).toBe(30000);
  });
  it('takes spending after the start', () => {
    expect(
      cardPot(GIFT, [move('start', 30000, '2026-10-01')], spend(10000, '2026-10-05'), d('2026-10-10')),
    ).toBe(20000);
  });
  it('on the start day, counts only what was written after the start', () => {
    const before = spend(5000, '2026-10-01', '2026-10-01T07:00:00.000Z');
    const after = spend(5000, '2026-10-01', '2026-10-01T09:00:00.000Z');
    expect(cardPot(GIFT, [move('start', 30000, '2026-10-01')], [...before, ...after], d('2026-10-10'))).toBe(
      25000,
    );
  });
  it('counts a move kind it does not know as nothing', () => {
    expect(
      cardPot(
        GIFT,
        [move('start', 30000, '2026-10-01'), move('load2', 9999, '2026-10-02')],
        [],
        d('2026-10-10'),
      ),
    ).toBe(30000);
  });
  it('takes the earliest of two starts', () => {
    expect(
      cardPot(
        GIFT,
        [move('start', 30000, '2026-10-03'), move('start', 10000, '2026-10-01')],
        [],
        d('2026-10-10'),
      ),
    ).toBe(10000);
  });
  it('ignores deleted moves', () => {
    expect(
      cardPot(GIFT, [move('start', 30000, '2026-10-01', undefined, 1)], [], d('2026-10-10')),
    ).toBeUndefined();
  });
  it('may go below zero', () => {
    expect(
      cardPot(GIFT, [move('start', 30000, '2026-10-01')], spend(40000, '2026-10-05'), d('2026-10-10')),
    ).toBe(-10000);
  });
});
```

(If `makeTx`'s parameter names differ, adapt to its signature in `test-factories.ts`.)

Also: `writeCardStart` writes one start and rewrites it in place on a second call; `cardMoves` rows round-trip through export and a replace import, a merge import, and a sync apply; a file with no `cardMoves` key imports; `checkIntegrity` reports `card_move_orphan` for a move whose card is gone; opening a version-4 database at version 5 keeps every row and resets the pull cursors to 0.

- [ ] **Step 2: Run to fail**

Run: `pnpm test src/domain/card-pots.test.ts src/db/repos/card-moves.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**, mirroring `cashMoves` in every file listed above.

- [ ] **Step 4: Run**

Run: `pnpm test src/db src/domain/card-pots.test.ts src/domain/transfer-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/domain.ts src/db src/domain/card-pots.ts src/domain/card-pots.test.ts src/domain/transfer-schema.ts src/domain/transfer-schema.test.ts
git commit -m "A prepaid or gift card keeps what is on it, counted like the cash tab, on every device and in backups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B6 (R12, R6): The choice list: tiles in their own colours, chosen on activation only

**Files:**

- Create: `src/features/cards/card-flow/choice-list.tsx`
- Test: `src/features/cards/card-flow/choice-list.test.tsx`

**Interfaces:**

- Consumes: `MoneyTile`, `MoneyTileGroup` (`src/components/ui/money-tile.tsx`), `BrandMark`, `BankMark` (`src/components/brand-mark.tsx`), `Choices<T>` (B2), `MoneyKey` (`src/domain/money-key.ts`).
- Produces:

```tsx
export function ChoiceList<T extends string>(props: {
  readonly name: string;
  /** The step's heading: names the radio group. */
  readonly legend: string;
  readonly choices: Choices<T>;
  readonly value: T | undefined;
  readonly labelOf: (value: T) => {
    label: string;
    otherLabel?: string;
    moneyKey?: MoneyKey;
    mark?: ReactNode;
  };
  /** A tap, Space or Enter: the flow moves on 150ms later. Never called for an arrow key. */
  readonly onChoose: (value: T) => void;
  readonly escapeLabel: string;
  /** The "Other" name field, shown on the same step once the escape is pressed. */
  readonly escapeExtra?: ReactNode;
  /** Money tiles (companies, banks with a colour) or list rows. */
  readonly tiles?: boolean;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { Choices } from '@/domain/card-choices';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { ChoiceList } from './choice-list';

const CHOICES: Choices<string> = {
  main: [
    { value: 'max', status: 'confirmed' },
    { value: 'cal', status: 'confirmed' },
  ],
  checkYourCard: [{ value: 'diners', status: 'unverified' }],
  hidden: [{ value: 'amex', status: 'absent' }],
  escape: 'anotherCompany',
};

const renderList = (onChoose = vi.fn(), dir: 'ltr' | 'rtl' = 'ltr') =>
  renderWithProviders(
    <div dir={dir}>
      <ChoiceList
        name="c"
        legend="Which company?"
        choices={CHOICES}
        value={undefined}
        labelOf={(v) => ({ label: v })}
        onChoose={onChoose}
        escapeLabel="Another company"
        tiles
      />
    </div>,
  );

beforeAll(async () => {
  await initTestI18n('en');
});

describe('ChoiceList', () => {
  it('chooses on a tap and on Enter, and never on an arrow key', async () => {
    const choose = vi.fn();
    renderList(choose);
    screen.getByRole('radio', { name: 'max' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(choose).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'cal' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'cal' })).not.toBeChecked();
    await userEvent.keyboard('{Enter}');
    expect(choose).toHaveBeenLastCalledWith('cal');
    await userEvent.click(screen.getByRole('radio', { name: 'max' }));
    expect(choose).toHaveBeenLastCalledWith('max');
  });

  it('chooses on Space', async () => {
    const choose = vi.fn();
    renderList(choose);
    screen.getByRole('radio', { name: 'cal' }).focus();
    await userEvent.keyboard(' ');
    expect(choose).toHaveBeenLastCalledWith('cal');
  });

  it('in Hebrew, ArrowLeft moves to the next choice in reading order', async () => {
    renderList(vi.fn(), 'rtl');
    screen.getByRole('radio', { name: 'max' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'cal' })).toHaveFocus();
  });

  it('lists unverified choices under the divider, each tagged in its name', () => {
    renderList();
    expect(screen.getByText('Less common here. Check your card')).toBeVisible();
    expect(screen.getByRole('radio', { name: /diners.*Check your card/ })).toBeVisible();
  });

  it('shows absent choices only after the escape', async () => {
    renderList();
    expect(screen.queryByRole('radio', { name: 'amex' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Another company' }));
    expect(screen.getByRole('radio', { name: 'amex' })).toBeVisible();
  });

  it('names the group by the step’s question', () => {
    renderList();
    expect(
      within(screen.getByRole('radiogroup', { name: 'Which company?' })).getAllByRole('radio'),
    ).toHaveLength(3);
  });

  it('moves on again when the chosen answer is tapped again', async () => {
    const choose = vi.fn();
    renderWithProviders(
      <ChoiceList
        name="c"
        legend="Which company?"
        choices={CHOICES}
        value="max"
        labelOf={(v) => ({ label: v })}
        onChoose={choose}
        escapeLabel="Another company"
        tiles
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'max' }));
    expect(choose).toHaveBeenCalledWith('max');
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm test src/features/cards/card-flow/choice-list.test.tsx`
Expected: FAIL: the module does not exist.

- [ ] **Step 3: Implement**

The group is a `MoneyTileGroup` (tiles) or a `fieldset` of rows, with `role="radiogroup"` and `aria-label={legend}`. A `keydown` handler on it:

```ts
const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
  const radios = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  const at = radios.findIndex((radio) => radio === document.activeElement);
  if (at === -1) return;
  const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
  const forward = event.key === 'ArrowDown' || event.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
  const backward = event.key === 'ArrowUp' || event.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
  if (forward || backward) {
    // A native radio group checks on an arrow; here an arrow only moves focus (spec 2.4).
    event.preventDefault();
    radios[(at + (forward ? 1 : -1) + radios.length) % radios.length]?.focus();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const radio = radios[at];
    if (radio !== undefined) onChoose(radio.value as T);
  }
};
```

A tap or Space fires the radio's `change`, which calls `onChoose`. A `click` on the radio that is already checked calls `onChoose` too, so tapping the same answer moves on again. While none is checked every radio has `tabIndex={0}`, and once one is, only that one does, as a native group.

The divider is visible text, `t('cards:flow.check.divider')`. Each tag is a visible `<span>` inside the label, `t('cards:flow.check.tag')`, so it is part of the accessible name (spec 16). The escape is a `Button variant="outline"` at `h-11`. It reveals `hidden` and `escapeExtra` below the lists, and moves focus to the first revealed choice.

CSS, by `good-css`: no viewport breakpoints. The tile grid is `MoneyTileGroup`'s own container query (2 across from 440 px of its container), so it lays out the same in the pop-out, in the import sheet and on a phone. A list row is `min-h-11 rounded-lg px-3 hover-fine:bg-accent active:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2`, and its name wraps (`text-pretty`, never `truncate`). Each row's mark (`BankMark`, `BrandMark`) sits before the name with `gap-3`. The tag is `text-xs font-medium` in `--muted-foreground`.

- [ ] **Step 4: Run**

Run: `pnpm test src/features/cards/card-flow/choice-list.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/cards/card-flow/choice-list.tsx src/features/cards/card-flow/choice-list.test.tsx
git commit -m "The card choices are tiles in each company's colour that move on only when tapped or confirmed, never on an arrow key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B7 (R1, R12): The pop-out: steps, progress, live card, motion, focus and closing

**Files:**

- Create: `src/features/cards/card-flow/card-flow-dialog.tsx`, `card-flow.tsx`, `use-card-flow.ts`
- Modify: `src/features/account/morph.ts` (`morph(update, direction?)`), `src/index.css` (the flow's view-transition rules, beside the `data-nav-dir` rules near line 1300)
- Modify: `src/i18n/locales/{en,he}/cards.json` (spec 15's `flow.step`, `flow.back`, `flow.next`, `flow.skip`, `flow.backToReview`, `flow.close`, `flow.discard.*`, `flow.discardChanges.title`, `flow.added`, `flow.add`)
- Test: `src/features/cards/card-flow/card-flow-dialog.test.tsx`

**Interfaces:**

- Consumes: `PopOut`, `PopOutContent`, `PopOutSteps`, `PopOutBody`, `PopOutPreview` (`src/components/ui/pop-out.tsx`), `CardFace` (`src/components/ui/card-face.tsx`), `stepsFor`, `firstOpenStep`, `answer`, `asksToDiscard`, `methodFromState` (B3), `createPaymentMethod`, `updatePaymentMethod`, `writeCardStart` (B5), `loadCatalog` (`src/data/card-catalog`), `issuerKey`, `bankKey` (`money-key.ts`), `issuerOf` (B4).
- Produces:

```tsx
export type CardFlowMode =
  | { readonly kind: 'add'; readonly creditOnly?: boolean; readonly prefill?: CardFlowState }
  | { readonly kind: 'edit'; readonly method: PaymentMethod; readonly open?: 'summary' | FlowStep };

export function CardFlowDialog(props: {
  readonly mode: CardFlowMode | undefined; // undefined: closed
  readonly onClose: () => void;
  readonly onSaved: (method: PaymentMethod) => void;
}): JSX.Element;

/** The same machine without the pop-out, for the Smart import sheet (spec 5). */
export function CardFlow(props: {
  readonly mode: CardFlowMode;
  readonly layout: 'popout' | 'inline';
  readonly onClose: () => void;
  readonly onSaved: (method: PaymentMethod) => void;
}): JSX.Element;

export function useCardFlow(mode: CardFlowMode): {
  readonly state: CardFlowState;
  readonly step: FlowStep;
  readonly steps: readonly FlowStep[];
  readonly catalog: Catalog | undefined;
  next(patch?: Partial<CardFlowState>): void; // answers this step and moves on
  choose(patch: Partial<CardFlowState>): void; // answers, then moves on after 150ms
  back(): void;
  skip(): void;
  goTo(step: FlowStep): void;
  save(): Promise<PaymentMethod | undefined>;
};
```

- [ ] **Step 1: Write the failing tests**

```tsx
describe('the add-card pop-out', () => {
  it('opens on What kind of card?, focused, with Step 1 of 10 read with it', async () => {
    renderWithProviders(<CardFlowDialog mode={{ kind: 'add' }} onClose={vi.fn()} onSaved={vi.fn()} />);
    const heading = await screen.findByRole('heading', { name: 'What kind of card?' });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAccessibleDescription(/Step 1 of 10/);
  });

  it('moves on about 150ms after a kind is tapped, and focus lands on the next question', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithProviders(<CardFlowDialog mode={{ kind: 'add' }} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.click(await screen.findByRole('radio', { name: /^Credit/ }));
    expect(screen.getByRole('heading', { name: 'What kind of card?' })).toBeVisible();
    await vi.advanceTimersByTimeAsync(160);
    expect(await screen.findByRole('heading', { name: 'Is it a bank card?' })).toHaveFocus();
    vi.useRealTimers();
  });

  it('starts past the kind from a credit-only transaction mode, and Back reaches it', async () => {
    renderWithProviders(
      <CardFlowDialog mode={{ kind: 'add', creditOnly: true }} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    expect(await screen.findByRole('heading', { name: 'Is it a bank card?' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'What kind of card?' })).toBeVisible();
  });

  it('closes without asking on the first three screens, and asks Discard this card? from the fourth', async () => {
    const close = vi.fn();
    const { unmount } = renderWithProviders(
      <CardFlowDialog mode={{ kind: 'add' }} onClose={close} onSaved={vi.fn()} />,
    );
    await userEvent.click(await screen.findByRole('radio', { name: /^Credit/ }));
    await userEvent.click(await screen.findByRole('radio', { name: /^Bank card/ }));
    expect(await screen.findByRole('heading', { name: 'Which bank’s name is on the card?' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    unmount();

    close.mockClear();
    renderWithProviders(<CardFlowDialog mode={{ kind: 'add' }} onClose={close} onSaved={vi.fn()} />);
    await userEvent.click(await screen.findByRole('radio', { name: /^Credit/ }));
    await userEvent.click(await screen.findByRole('radio', { name: /^Bank card/ }));
    await userEvent.click(await screen.findByRole('radio', { name: /Discount/ }));
    expect(await screen.findByRole('heading', { name: 'Which card company runs it?' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByRole('alertdialog', { name: 'Discard this card?' })).toBeVisible();
    expect(close).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Keep going' }));
    expect(screen.getByRole('heading', { name: 'Which card company runs it?' })).toBeVisible();
  });

  it('is one popup, right to left in Hebrew', async () => {
    await initTestI18n('he');
    renderWithProviders(<CardFlowDialog mode={{ kind: 'add' }} onClose={vi.fn()} onSaved={vi.fn()} />);
    const dialog = await screen.findByRole('dialog', { name: 'הוספת כרטיס' });
    expect(dialog.closest('[dir]')).toHaveAttribute('dir', 'rtl');
    expect(document.querySelectorAll('[data-slot="popout"]')).toHaveLength(1);
    await initTestI18n('en');
  });

  it('shows Skip until something is answered, then Next; Next with 13/28 as the expiry shows the error at the field and stays', async () => {
    // Opened straight on "Your card" for a credit card whose earlier answers are given.
    const prefill: CardFlowState = {
      ...emptyFlowState('p1'),
      kind: 'credit',
      bankCard: 'non_bank',
      company: 'max',
      network: 'visa',
      answered: new Set(['kind', 'bankCard', 'company', 'network', 'type']),
    };
    renderWithProviders(
      <CardFlowDialog mode={{ kind: 'add', prefill }} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    expect(await screen.findByRole('heading', { name: 'Your card' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeVisible();
    const expiry = screen.getByRole('textbox', { name: 'Valid until' });
    await userEvent.type(expiry, '13/28');
    expect(screen.getByRole('button', { name: 'Next' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(expiry).toHaveAttribute('aria-invalid', 'true');
    expect(expiry).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Your card' })).toBeVisible();
  });

  const READY: CardFlowState = {
    ...emptyFlowState('p1'),
    kind: 'credit',
    bankCard: 'non_bank',
    company: 'max',
    network: 'visa',
    name: 'Max ·1234',
    nameEdited: true,
    answered: new Set(['kind', 'bankCard', 'company', 'network', 'type', 'card', 'billing', 'fees']),
  };

  it('saves a credit card, says "<name> added", and reports it once', async () => {
    const saved = vi.fn();
    renderWithProviders(
      <CardFlowDialog mode={{ kind: 'add', prefill: READY }} onClose={vi.fn()} onSaved={saved} />,
    );
    expect(await screen.findByRole('heading', { name: 'Check and save' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(saved).toHaveBeenCalledTimes(1);
    });
    const [card] = await db.paymentMethods.filter((m) => m.label === 'Max ·1234').toArray();
    expect(card).toMatchObject({
      type: 'credit_card',
      card: { issuer: 'max', kind: 'non_bank', network: 'visa' },
    });
    expect(toasts.toast).toHaveBeenCalledWith('Max ·1234 added');
  });

  it('keeps every answer when Save fails, stays on review, and writes nothing', async () => {
    const spy = vi.spyOn(repo, 'createPaymentMethod').mockRejectedValueOnce(new Error('disk full'));
    const before = await db.paymentMethods.count();
    renderWithProviders(
      <CardFlowDialog mode={{ kind: 'add', prefill: READY }} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(toasts.toast.error).toHaveBeenCalled();
    });
    expect(screen.getByRole('heading', { name: 'Check and save' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Max ·1234');
    expect(await db.paymentMethods.count()).toBe(before);
    spy.mockRestore();
  });
});
```

The file mocks `sonner` as `cards-screen-menu.test.tsx` does (`toasts`), imports `* as repo from '@/db/repos/payment-methods'` for the failing-save spy (`CardFlow` calls the repo through its module, so the spy takes effect), and imports `emptyFlowState` and `CardFlowState` from `@/domain/card-flow`.

- [ ] **Step 2: Run to fail**

Run: `pnpm test src/features/cards/card-flow/card-flow-dialog.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`CardFlowDialog` is `<PopOut open={mode !== undefined} onOpenChange={…the discard rule…}>` with `<PopOutContent size="full">` holding `<CardFlow layout="popout" …/>`. `CardFlow` lays out:

- `PopOutSteps` with the names of `steps` (`cards:flow.stepName.<step>`), `current`, `reached` (the furthest step reached), and `onStep` → `goTo` for reached steps only;
- `PopOutBody` with `heading="question"`, the step's `h2` (`tabIndex={-1}`, focused on every change, `aria-describedby` the "Step N of M" line), `step={{ current, total }}`, and the footer: Back (not on step 1), then Skip, Next or Save, all `h-11`. Back and Next arrows use `rtl:-scale-x-100`;
- `PopOutPreview` with `CardFace variant="preview"` filled from the state: `moneyKey` from the colour, else `issuerKey(company)`, else `bankKey(issuerBank)`; `issuerName` and `runBy` from `issuerOf`; the last 4; the network's name.

In `layout="inline"` it renders the body alone, with the progress line as its header (spec 5).

The progress is the existing `Progress` with `max={steps.length}` and `value={index + 1}`: no percentage (`gate:money`). A step change runs `morph(() => setStep(next), direction)`. `morph` gains a direction:

```ts
export function morph(update: () => void, direction?: 'forward' | 'back'): void {
  if (!('startViewTransition' in document) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  const root = document.documentElement;
  if (direction !== undefined) root.dataset['flowDir'] = direction;
  const transition = document.startViewTransition(() => {
    flushSync(update);
  });
  void transition.finished.finally(() => {
    delete root.dataset['flowDir'];
  });
}
```

`index.css`, beside the `data-nav-dir` rules:

```css
[data-slot='popout-body'] [data-flow-step] {
  view-transition-name: card-flow-step;
}
[data-slot='popout-steps'] {
  view-transition-name: card-flow-steps;
}
[data-slot='popout-preview'] {
  view-transition-name: card-flow-preview;
}
html {
  --flow-sign: 1;
}
html[dir='rtl'] {
  --flow-sign: -1;
}
@media (prefers-reduced-motion: no-preference) {
  html[data-flow-dir='forward']::view-transition-new(card-flow-step) {
    animation: flow-in var(--dur-panel) var(--ease-out) both;
    --flow-from: calc(2rem * var(--flow-sign));
  }
  html[data-flow-dir='back']::view-transition-new(card-flow-step) {
    animation: flow-in var(--dur-panel) var(--ease-out) both;
    --flow-from: calc(-2rem * var(--flow-sign));
  }
}
@keyframes flow-in {
  from {
    opacity: 0;
    translate: var(--flow-from) 0;
  }
}
```

A forward step comes in from the inline end: from the right in English, from the left in Hebrew. Only one element carries each `view-transition-name` at a time. The pop-out is modal, and the import sheet's inline flow is never open with a pop-out. Use the motion tokens `index.css` already defines (`--dur-panel`, `--ease-out`); if `--ease-out` has another name there, use that name.

Opening uses the `PopOut`'s own `data-starting-style` fade, already in `pop-out.tsx`. The catalog starts loading on open (`void loadCatalog()`); steps 1 and 2 never wait for it. Closing follows `asksToDiscard`, with an `AlertDialog`: "Discard this card?" / "Nothing you entered is kept." / "Discard" / "Keep going". Escape inside it closes only the confirm.

`useCardFlow.choose(patch)` applies `answer`, marks the choice selected, and moves on after 150 ms (`setTimeout`, cleared on unmount and on any other action). `save()` calls `methodFromState`, then in one Dexie transaction `createPaymentMethod` (or `updatePaymentMethod` in edit mode) and `writeCardStart` for a pot kind with an amount. On failure it shows `t('tx.toastFailed')` and stays on review.

- [ ] **Step 4: Run**

Run: `pnpm test src/features/cards/card-flow src/features/account`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/cards/card-flow src/features/account/morph.ts src/index.css src/i18n
git commit -m "Adding a card is a pop-out that walks through one question at a time, with its steps beside it and the card taking shape as you answer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B8 (R6, R1): The cascade screens: kind, bank card or not, bank, company, network, type

**Files:**

- Create: `src/features/cards/card-flow/step-kind.tsx`, `step-bank-card.tsx`, `step-bank.tsx`, `step-company.tsx`, `step-network.tsx`, `step-type.tsx`, `kind-notice.tsx`, `answered-line.tsx`
- Modify: `src/i18n/locales/{en,he}/cards.json` (spec 15's still-current `flow.*` keys and all of 21.10; `cards:edit.network` in Hebrew becomes "רשת")
- Test: `src/features/cards/card-flow/cascade.test.tsx`

**Interfaces:**

- Consumes: `ChoiceList` (B6), `banksFor`, `companiesFor`, `networksFor`, `typesFor`, `answeredAlone` (B2), `kindFromCatalog`, `switchKind` (B3), `useCardFlow` (B7).
- Produces: one component per step, each `(props: { readonly flow: ReturnType<typeof useCardFlow> }) => JSX.Element`.

- [ ] **Step 1: Write the failing tests** (spec 18.4 and 21.11 DOM), each a full `it` with `renderWithProviders(<CardFlowDialog …/>)`, `userEvent` and the catalog loaded:
  - a non-bank answer goes from "Is it a bank card?" straight to "Which card company issued it?", with no bank question;
  - Credit → Bank card → Discount offers Cal, Diners and Max; "Another company" reveals Isracard, American Express and a "Company name" field;
  - One Zero answers the company and the network alone. The type step shows "Card company: Isracard · Change" and "Network: Mastercard · Change", and "Change" opens the company step;
  - Leumi credit shows Cal under "Less common here. Check your card", tagged;
  - Isracard Direct under Credit switches to debit with the notice "This is a debit card. …" in a `role="status"` line, the next screen is the debit path, and Undo returns to the type step with the type cleared;
  - a debit card's bank step lists the household's accounts first under "Your accounts"; picking one answers the bank and the account, and the owner follows its holder;
  - "My bank isn't listed" shows a "Bank name" field on the same step;
  - while the catalog loads, the bank step shows "Loading the card list…" with the plain choices, and an answer given then is kept when the list arrives;
  - changing the type on a card with a rate override asks "Keep the rates you entered?" first.

- [ ] **Step 2: Run to fail**

Run: `pnpm test src/features/cards/card-flow/cascade.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Each step renders its question (21.10 copy; the company step takes the bank or non-bank title from `bankCard`), the `ChoiceList` of its choices, an `AnsweredLine` for each earlier step answered alone (`flow.answered` copy and `flow.change`), and its escape field ("Company name", "Bank name", "Card type", "Club"). Any escape leaves the card unlinked.

- The kind step: four `MoneyTile`s (`kinds.*`, hints `kinds.*Hint` linked by `aria-describedby`).
- The bank-card step: "Bank card" / "Non-bank card" / "Not sure" (prepaid: "From a bank" / "From a card company" / "Not sure").
- The bank step: first `flow.bank.yourAccounts`, the household's live accounts grouped by bank with `BankMark` and their account tails; then `banksFor`'s lists; then "Show all banks" and "My bank isn't listed".
- The company step: tiles with `moneyKey={issuerKey(company)}` and the other language's name beside each.
- The network step: rows with the network's logo (`network-logo.tsx`), never mirrored.
- The type step: `typesFor`, catalog types tagged "Debit" or "Prepaid" where the catalog says so (part of the accessible name), the club list with search (the `Command` pattern `BankSelect` uses) when there are more than 8 clubs, and "Not in the list" with "Card type" and "Club" fields. The "Keep the rates you entered?" dialog moves here from `IssuerChooser`.

- [ ] **Step 4: Run**

Run: `pnpm test src/features/cards/card-flow src/i18n`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/cards/card-flow src/i18n
git commit -m "Adding a card asks credit or debit first, then bank card or not, the bank only for a bank card, then the card company and the network, each list narrowed by the answers before it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B9 (R5): The detail screens: your card, billing, fees, money in, value

**Files:**

- Create: `src/features/cards/card-flow/step-card.tsx`, `step-billing.tsx`, `step-fees.tsx`, `step-money-in.tsx`, `step-value.tsx`, `fields.tsx` (`TextField`, `MoneyField`, `RateField` moved from `card-fields.tsx`)
- Modify: `scripts/gate-pci.mjs` (forbid `voucher_?code|gift_?code|redeem_?code`, decision 23)
- Test: `src/features/cards/card-flow/details.test.tsx`, `src/features/cards/card-flow/step-fees.test.tsx` (the cases of `card-fields-rates.test.tsx`, through the fees step, with the `rate-<kind>` test ids kept)

**Interfaces:**

- Consumes: `CardColorField`, `RateTable` (unchanged), `useCardFlow` (B7), `fieldsFor` (B3).

What each kind fills in (R5, from the debit-card research §5 and spec 3.1 to 3.4 as 21.3 amends them):

| Kind    | Your card                                                                                                                                                                                                                      | Then                                                                                                                                                                                                                                                            | Fees                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credit  | last 4, valid until, colour, whose                                                                                                                                                                                             | Billing: paid from (a bank card: accounts at its issuing bank, already answered when the bank step picked an account; "An account at another bank" behind a link, with its warning), billing day (the card's real days first, then "Another day"), credit limit | Linked: the catalog summary with "Change" opening `RateTable`. Unlinked: card fee and its discount, foreign-currency fee, credit and late interest                    |
| Debit   | last 4, valid until, colour, whose (follows the account)                                                                                                                                                                       | (the account was answered on the bank step)                                                                                                                                                                                                                     | card fee a month ("Set by your bank. Banks may charge up to ₪7 a month."), foreign-currency fee ("Usually about 3%."; the catalog's figure with "Change" when linked) |
| Prepaid | last 4, valid until, colour, whose                                                                                                                                                                                             | Money in: loaded from (accounts; then live credit cards marked "Credit card"; then "Somewhere else"), balance on the card now ("We count it like cash…", "Most prepaid cards hold up to ₪1,000.")                                                               | card fee a month (the catalog tier's fee tagged "Published" when linked), fee for each load, foreign-currency fee                                                     |
| Gift    | last 4 ("Only if a number is printed on it. Never the code or PIN you pay with."), valid until (second; "We'll remind you a month before."), network (all five and "None"), where it's accepted (40 characters), colour, whose | Value: amount on the card, date received (today by default)                                                                                                                                                                                                     | none                                                                                                                                                                  |

No step asks for a voucher code, a PIN or a full card number.

- [ ] **Step 1: Write the failing tests**
  - one test per row of the table above: the fields present, and the absent ones (a debit card has no "Billing day", "Credit limit", "Credit interest" or "Late interest" field), found by their labels;
  - the debit card fee's hint text, in English and Hebrew;
  - the gift card's "Your card" step has no input whose label matches `/code|PIN|קוד/i`;
  - Next with "13/28" as the expiry shows the error, sets `aria-invalid`, focuses the field and stays;
  - `node scripts/gate-pci.mjs` exits non-zero on a temporary file under `src/` that declares `giftCode` (write it in the test with `fs`, remove it after).
- [ ] **Step 2: Run to fail.** `pnpm test src/features/cards/card-flow/details.test.tsx src/features/cards/card-flow/step-fees.test.tsx`
- [ ] **Step 3: Implement** the five steps with the fields above. Each field is optional and each step has Skip, as spec 3.1 steps 5 to 7, 3.2 step 5, 3.3 steps 5 and 6, and 3.4 steps 3 and 4 say. The credit fees step reads the bank's caveat from `resolveCard` (B1) and shows "Rates for this bank aren't published. Check your statement." Add `voucher_?code|gift_?code|redeem_?code` to `gate:pci`'s pattern.
- [ ] **Step 4: Run.** `pnpm test src/features/cards && pnpm gate:pci`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/cards/card-flow scripts/gate-pci.mjs
git commit -m "A debit card asks for its fee and foreign-currency fee, a prepaid card for where its money comes from and what is on it, and a gift card for its value and expiry, never its code

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B10 (R13, R1): Review, the edit summary, and where the issuer, the company and the network show

**Files:**

- Create: `src/features/cards/card-flow/step-review.tsx`, `card-summary.tsx`, `summary-rows.tsx`
- Modify: `src/components/ui/card-face.tsx` (optional `runBy?: string`: a small "Run by Max" / "בתפעול מקס" line under the issuer's name)
- Test: `src/features/cards/card-flow/card-summary.test.tsx`, `src/components/ui/card-face.test.tsx`

**Interfaces:**

- Consumes: `cardIdentityOf`, `issuerOf` (B4), `stateFromMethod`, `methodFromState`, `canChangeKind`, `duplicateOf` (B3), `writeCardStart` (B5), `useCardFlow` (B7).
- Produces: `CardSummary(props: { method: PaymentMethod; onOpenStep: (step: FlowStep) => void; onClose: () => void })`; `SummaryRows(props: { state: CardFlowState; onChange: (step: FlowStep) => void })`, shared by review and the summary.

The group "The card" lists, in this order (spec 21.6): **Kind · Bank card or not · Issued by · Run by** (bank cards only) **· Network · Card type and club · Name on the card · Last 4 · Valid until · Colour · Whose**. Then "Billing" (credit), "Money in" (prepaid), "Value" (gift), and "Fees and interest" (credit) or "Fees" (debit, prepaid).

- [ ] **Step 1: Write the failing tests**

```tsx
const row = (name: string) => screen.getByRole('row', { name: new RegExp(`^${name}`) });

it('a Discount card run by Max shows Discount as its issuer, Max as the company that runs it, and Visa as its network', async () => {
  await db.paymentMethods.add(ACCOUNT_AT_DISCOUNT); // id 'acc-11', account.bank '11'
  const method = await createPaymentMethod(
    db,
    'pm-a',
    {
      label: 'Discount Visa International · Max ·1234',
      type: 'credit_card',
      profileId: '*',
      card: {
        kind: 'bank',
        issuerBank: '11',
        issuer: 'max',
        network: 'visa',
        lastDigits: '1234',
        accountId: 'acc-11',
      },
    },
    NOW,
  );
  renderWithProviders(<CardSummary method={method} onOpenStep={vi.fn()} onClose={vi.fn()} />);
  expect(await row('Issued by')).toHaveTextContent('Discount Bank');
  expect(row('Run by')).toHaveTextContent('Max');
  expect(row('Network')).toHaveTextContent('Visa');
  expect(screen.getByRole('img', { name: /1234/ })).toHaveTextContent('Run by Max');
});
```

(The summary is a `table` of `row`s, or a `dl`. Use whichever the implementation picks, and match it in the test.)

Also, each in full:

- in Hebrew the face reads "בתפעול מקס" and the network row is called "רשת";
- an old card with only `kind: 'bank'` shows "Issued by: Not set", and its "Finish setting up" opens the bank step;
- a bank card paid from another bank's account shows "This bank card is paid from an account at another bank. Check your card." and still saves;
- an inferred issuing bank is tagged "Check your card" until its row is tapped and saved, which writes `checked: true`;
- each row's "Change" opens only its step; Save writes and returns to the summary; Cancel with changes asks "Discard your changes?";
- changing the kind asks "Change this card's kind?", and on a credit card with instalments to come shows the blocked text instead;
- review shows "Not set", "From your statement", the duplicate warning with "Open it", and the name following the answers until edited;
- the first save of an old card writes `issuerBank` and still writes the legacy `bank` text;
- "Link to the catalog" is offered on an unlinked card that names a catalog entry, and never on a gift card.

- [ ] **Step 2: Run to fail.** `pnpm test src/features/cards/card-flow/card-summary.test.tsx src/components/ui/card-face.test.tsx`
- [ ] **Step 3: Implement** per spec 3.1 step 8, 7, 7.1, and 21.6 to 21.8.
- [ ] **Step 4: Run.** `pnpm test src/features/cards src/components/ui`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/cards/card-flow src/components/ui/card-face.tsx src/components/ui/card-face.test.tsx
git commit -m "A card's page shows the bank that issued it, the card company that runs it and its network separately, so a Discount card run by Max reads as exactly that

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B11 (R2, R5, R13): The Cards screen opens the flow, and each kind gets its own panel

**Files:**

- Modify: `src/features/cards/cards-screen.tsx` ("Add a card" → `CardFlowDialog` `{ kind: 'add' }`; "Edit card" → `{ kind: 'edit', method }`; "Interest table" → `{ kind: 'edit', method, open: 'fees' }`; the kind panels of spec 9.2; "Finish setting up")
- Modify: `src/features/cards/unfinished-notice.tsx` (no billing day; no account; gift expiring soon with money left; no issuing bank)
- Modify: `src/features/cards/use-cards-data.ts` (the card moves, for the pots)
- Modify: `src/features/bank-accounts/bank-accounts-screen.tsx` (a debit card shows as "Debit card ·1234" with no bill; a prepaid card the account loads as "Loads Cal Prepaid ·5678")
- Test: `src/features/cards/cards-screen.test.tsx`, `cards-screen-menu.test.tsx`, `unfinished-notice.test.tsx`, `src/features/bank-accounts/bank-accounts-screen.test.tsx`

- [ ] **Step 1: Write the failing tests** from spec 18.4 "The nudges" and "The Cards screen", and 18.5's `cards-screen-menu` row:
  - "Finish setting up" on a credit card without a billing day opens the billing step; on a debit card without an account, the bank step; on a prepaid card with no balance, Money in; on a gift card with no value, Value;
  - the notice counts each line, en `_one` / `_other`, he `_one` / `_two` / `_other`, and a line's button opens its card;
  - a gift card panel shows "₪200 left of ₪300", where it's accepted and "Use by 03/31"; in its last two months "Expires March 2031, with ₪200 left."; after it, "Expired with ₪200 left.";
  - a debit panel says "Taken from <account>" and shows no bills, limit bar or commitments;
  - a prepaid panel shows "Left on the card" with the pot, "Loaded from …", and "Update the balance" opens Money in;
  - "Interest table" opens the fees step with the rate table focused, and is not offered on a debit card;
  - "Edit card" opens the summary for every kind, archived cards too.
- [ ] **Step 2: Run to fail.** `pnpm test src/features/cards src/features/bank-accounts`
- [ ] **Step 3: Implement** spec 8 and 9, replacing A9's interim panels.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/cards src/features/bank-accounts
git commit -m "Each kind of card has its own panel on the Cards screen, and a card missing its billing day, account, balance or issuing bank says so with Finish setting up

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B12 (R12, R1): The flow from the transaction form and inside Smart import

**Files:**

- Modify: `src/features/transaction/payment-method-field.tsx` (a last option "Add a card", never a value), `src/features/transaction/transaction-sheet.tsx` (the card `EditorPanel` near line 1442 becomes `CardFlowDialog`, rendered outside the `<form>`; on save, select the card when `methodFits`, run `changeMethod`, then `cardSaved`)
- Modify: `src/features/import/found-methods-list.tsx` (`MethodPanel` renders `<CardFlow layout="inline">` for a card: `{ kind: 'add', prefill }`, or `{ kind: 'edit', method, open: 'summary' }` for an update; accounts keep `MethodForm`), `src/features/import/found-methods.ts` (`flowPrefillOf(item, methods, owner): CardFlowState`, with `fromStatement` holding every field the document gave)
- Test: `src/features/transaction/transaction-sheet.test.tsx`, `src/features/import/import-sheet.test.tsx`

- [ ] **Step 1: Write the failing tests** from spec 18.5's rows for these two files:
  - "Add a card" in "Paid with" opens the flow over the form on the kind step, or past it in a קרדיט mode;
  - Save selects the new card and copies its rate into the credit plan;
  - a debit card added during a תשלומים purchase is not selected, and the toast says it was added;
  - in the import sheet, a found card opens at its first missing step, inside the sheet (`document.querySelectorAll('[data-slot="popout"]')` has length 0), with "From your statement" tags on review, and Save moves to the next unfinished card;
  - an update to a known card shows the summary with the document's values applied and tagged;
  - a found Isracard Direct card opens as debit;
  - in a 390 px wide import sheet the company tiles are one across (the `@container` rule), and in a 900 px one, two across;
  - the Expenses / Income / Both switch cases stay green.
- [ ] **Step 2: Run to fail.** `pnpm test src/features/transaction src/features/import`
- [ ] **Step 3: Implement** spec 5 and 6.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/transaction src/features/import
git commit -m "A card can be added from Paid with in the middle of a purchase, and Smart import finishes a found card with the same steps inside its own sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B13 (R1): The old card editor goes

**Files:**

- Delete: `src/features/cards/card-fields.tsx`, `src/features/cards/issuer-chooser.tsx`, `src/features/cards/issuer-chooser.test.tsx`, `src/features/cards/card-fields-rates.test.tsx` (its cases now live in `step-fees.test.tsx`)
- Modify: `src/features/cards/method-editor.tsx` (bank accounts only: `mode`, the Kind choice and the credit branch go; `MethodEditor`'s `section` prop goes), its tests, `src/features/cards/rate-table.test.tsx` (render through the fees step)
- Modify: i18n: remove `cards:edit.issuer`, `edit.kind`, `edit.bankOfCard`, `edit.bankDebited`, `edit.debitedOther`, `edit.newCard`, `catalog.title`, `catalog.pending`, each only after `grep -rn "<key>" src e2e` finds no other reader

- [ ] **Step 1:** Run `grep -rn "CardFields\|IssuerChooser\|mode=\"card\"\|section=\"rates\"" src e2e` and move each remaining caller to the flow.
- [ ] **Step 2:** Delete the files. Run `pnpm typecheck && pnpm knip`. Expected: no errors, nothing unused.
- [ ] **Step 3:** Run `pnpm test`. Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "The old card form, which asked for the card company twice, is gone; bank accounts keep their own form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B14 (R6): Keeping the matrix true: the sources check and "Tell us"

**Files:**

- Create: `scripts/catalog-sources.mjs` (manual, online, never in CI); `package.json`: `"catalog:sources": "node scripts/catalog-sources.mjs"`
- Create: `src/features/cards/card-flow/correction-link.tsx`; Modify: `card-summary.tsx`; Modify: the Settings screen (a "Card list corrections" list)
- Test: `src/features/cards/card-flow/correction-link.test.tsx`, `scripts/catalog-sources.test.mjs` (the report on a stubbed `fetch`)

- [ ] **Step 1: Write the failing tests**
  - the correction text holds exactly the kind, the bank code, the company, the network and the type, and no digits run of 4 or more, no person's name and no amount (`expect(text).not.toMatch(/\d{4}/)`);
  - a card saved through an escape ("Another company", "Another network", "My bank isn't listed", "Not in the list") or on an unverified cell shows "Not in our card list? Tell us" on its summary; a fully confirmed card does not;
  - the link is `https://github.com/Doofess/Bookandry/issues/new?title=…&body=…`, and nothing is sent by itself;
  - `catalog-sources` reports each cell `unchanged`, `quote gone` or `unreachable` ("check by hand" for a 403 or a bot wall), and writes no file.
- [ ] **Step 2: Run to fail.** `pnpm test src/features/cards/card-flow/correction-link.test.tsx && node --test scripts/catalog-sources.test.mjs`
- [ ] **Step 3: Implement** spec 21.9.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add scripts package.json src/features
git commit -m "A card that isn't in the card list can be reported in one tap with only its bank, company, network and type, and the list's sources can be rechecked by hand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B15: Browser checks, screenshots and release B

**Files:**

- Create: `e2e/19-card-flow.spec.ts`
- Modify: `e2e/14-cards.spec.ts`, `e2e/card-catalog.spec.ts`, `e2e/02-transaction-type.spec.ts` (spec 18.5's rows), `e2e/screens.spec.ts` (the add flow, the summary, the grouped Cards screen)

- [ ] **Step 1: Write the browser tests** (spec 18.6 and 21.11, in en and he):
  - Example A from the Cards screen: Credit → Bank card → the Discount account → Max → Visa → … → Save. The face shows Discount large and "Run by Max" ("בתפעול מקס" in Hebrew);
  - a debit card: Debit → a Hapoalim account → (Isracard answered alone) → … → 5678. It shows under Debit cards, "Taken from" that account, and a purchase on it lowers the balance the same day;
  - a ₪300 BuyMe gift card that expires in two months shows "₪300 left of ₪300", the notice counts it, and a ₪100 purchase with it leaves the balance as it was and shows "₪200 left";
  - Credit · Isracard · Direct shows the debit notice, and Undo works;
  - keyboard only through the credit path, focus on each heading, and an arrow key never moves on;
  - at 1140 × 732 and wider, three panes; at 800 px wide, two; at 390 px, one pane at full height with the footer above the safe area;
  - every step at 320 px in Hebrew: `await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)` is true;
  - every new control is at least 44 × 44 px (`boundingBox()` of every button, radio label and input on each step);
  - with reduced motion, `document.getAnimations().length` is 0 right after Next;
  - axe has no violations with each step open, the summary, the Cards screen with all four groups, and each confirm dialog.
- [ ] **Step 2:** Run `pnpm exec playwright test e2e/19-card-flow.spec.ts e2e/14-cards.spec.ts e2e/card-catalog.spec.ts e2e/02-transaction-type.spec.ts --project=en --project=he --project=mobile`. Fix until green.
- [ ] **Step 3:** Run `pnpm verify && pnpm verify:full`. Expected: green.
- [ ] **Step 4:** Add "Release note:" bullets to `README.md` → "Known limitations": the new flow; "Update every device before editing cards on an older one" (spec 13.8); the card list's version 2. Then commit:

```bash
git add e2e README.md
git commit -m "Browser checks for adding every kind of card, in English and Hebrew, from a phone to a wide screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# RELEASE C: the transaction form and Smart import

### Task C1 (R7): The Type control follows the way to pay

**Files:**

- Modify: `src/domain/tx-options.ts` (new `formFor(method, resolved)`; `methodFits` and `standingViaOf` per spec 10.4)
- Modify: `src/features/transaction/recurrence-fields.tsx` (the Type `Segmented` offers `formFor(...).modes`, hidden when there are none)
- Modify: `src/features/transaction/transaction-sheet.tsx` (the "Charged to" card/bank control near line 1139 goes: the way to pay decides it; a change of way to pay resets an unoffered Type to Regular with a quiet line; the cheque fields)
- Create: `src/features/transaction/cheque-fields.tsx`
- Modify: `src/db/save-transaction.ts` (optional `slotDates` written as `modify` overrides in the same Dexie transaction)
- Modify: `src/i18n/locales/{en,he}/common.json` (`tx.chequeCount`, `tx.chequeDue`, `tx.typeReset`)
- Test: `src/domain/tx-options.test.ts`, `src/features/transaction/transaction-sheet.test.tsx`, `src/features/transaction/cheque-fields.test.tsx`, `src/db/save-transaction.test.ts`, `e2e/02-transaction-type.spec.ts`

**Interfaces:**

- Consumes: `cardKindOf` (A6), `methodTypeOf` (A1), `availableModes` (`deal-rules.ts`), `isBuiltinPaymentMethod`, `STANDING_ORDER_METHOD_ID` (A2).
- Produces:

```ts
export type PaymentForm =
  | { readonly shape: 'amount' } // cash, bank transfer, Bit / PayBox, Other, or no way chosen yet
  | { readonly shape: 'cheques' } // how many cheques, and each due date
  | { readonly shape: 'standing' } // the built-in Standing order: its recurring form
  | { readonly shape: 'types'; readonly modes: readonly RecurrenceMode[] }; // a card or a bank account
export function formFor(method: PaymentMethod | undefined, resolved: ResolvedCard | undefined): PaymentForm;
```

The table it carries (spec 10.4, rulings 4 to 6):

| Way to pay                                                | `formFor`                                      | Type control                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| none chosen                                               | `amount`                                       | hidden                                                                                         |
| Cash (built in or a person's own cash row)                | `amount`                                       | hidden: one payment                                                                            |
| Cheque                                                    | `cheques`                                      | hidden; "How many cheques" and each due date                                                   |
| Debit, prepaid and gift cards                             | `types`: `one_time`, `standing_order`          | Regular, Standing order                                                                        |
| Credit card                                               | `types`: `availableModes(resolved, 'expense')` | Regular, Installment, Credit installment, Standing order, Loan (and a linked card's own deals) |
| Bank account                                              | `types`: `one_time`, `standing_order`, `loan`  | Regular, Standing order, Loan (ruling 4)                                                       |
| Bank transfer, Bit / PayBox, Other (built in or own rows) | `amount`                                       | hidden                                                                                         |
| Standing order (built in)                                 | `standing`                                     | hidden; the standing-order form (frequency)                                                    |
| an unknown type                                           | `amount`                                       | hidden                                                                                         |

Income is unchanged (Once, Monthly, Yearly).

- [ ] **Step 1: Write the failing tests**

`tx-options.test.ts`:

```ts
describe('formFor (spec 10.4)', () => {
  const m = (id: string, type: string, card?: object) =>
    ({ id, type, card, label: id, profileId: '*', isArchived: 0 }) as never;
  it.each([
    [undefined, { shape: 'amount' }],
    [m('pm.cash', 'cash'), { shape: 'amount' }],
    [m('pm.cheque', 'cheque'), { shape: 'cheques' }],
    [m('pm.transfer', 'bank_transfer'), { shape: 'amount' }],
    [m('pm.wallet', 'digital_wallet'), { shape: 'amount' }],
    [m('pm.other', 'other'), { shape: 'amount' }],
    [m('pm.standing_order', 'standing_order'), { shape: 'standing' }],
    [m('d', 'debit_card', { funding: 'debit' }), { shape: 'types', modes: ['one_time', 'standing_order'] }],
    [m('p', 'debit_card', { funding: 'prepaid' }), { shape: 'types', modes: ['one_time', 'standing_order'] }],
    [m('g', 'debit_card', { funding: 'gift' }), { shape: 'types', modes: ['one_time', 'standing_order'] }],
    [
      m('c', 'credit_card'),
      { shape: 'types', modes: ['one_time', 'installments', 'credit', 'standing_order', 'loan'] },
    ],
    [m('a', 'bank_account'), { shape: 'types', modes: ['one_time', 'standing_order', 'loan'] }],
    [m('f', 'prepaid_card'), { shape: 'amount' }],
  ])('%o gives %o', (method, form) => {
    expect(formFor(method, undefined)).toEqual(form);
  });

  it('a debit card takes a standing order on the card (the reversed rule)', () => {
    expect(standingViaOf({ type: 'debit_card' })).toBe('card');
    expect(methodFits({ type: 'debit_card' }, 'standing_order')).toBe(true);
    expect(methodFits({ type: 'debit_card' }, 'installments')).toBe(false);
  });
});
```

`transaction-sheet.test.tsx`, one DOM test per row of the table, in English and in Hebrew for the card rows ("רגילה", "הוראת קבע"), plus:

- with no way to pay chosen, there is no Type control;
- an Installment purchase whose way to pay changes to a debit card becomes Regular, with "This way to pay takes regular purchases and standing orders, so the type is now Regular." shown once;
- a saved instalment transaction on a debit card opens with its type shown as it is, and the control lists that type too (kept, `keepId`-style);
- cheques: choosing Cheque shows "How many cheques" (1 by default) and the first due date (the form's date); 3 cheques shows three dates a month apart; changing the second to the 20th and saving writes an `installments` plan of 3 on `pm.cheque` and one `modify` override with that date.

`save-transaction.test.ts`: `slotDates` become `modify` overrides keyed by the original slot date, in the same Dexie transaction; a failure writes neither.

- [ ] **Step 2: Run to fail**

Run: `pnpm test src/domain/tx-options.test.ts src/features/transaction src/db/save-transaction.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
export function formFor(method: PaymentMethod | undefined, resolved: ResolvedCard | undefined): PaymentForm {
  if (method === undefined) return { shape: 'amount' };
  if (method.id === STANDING_ORDER_METHOD_ID) return { shape: 'standing' };
  const kind = cardKindOf(method);
  if (kind === 'credit') return { shape: 'types', modes: availableModes(resolved, 'expense') };
  if (kind !== undefined) return { shape: 'types', modes: ['one_time', 'standing_order'] };
  switch (methodTypeOf(method)) {
    case 'cheque':
      return { shape: 'cheques' };
    case 'bank_account':
      return { shape: 'types', modes: ['one_time', 'standing_order', 'loan'] };
    default:
      return { shape: 'amount' };
  }
}
```

`standingViaOf`: `debit_card` stays `'card'`; `digital_wallet` becomes `undefined` (Bit / PayBox is amount only). `methodFits(method, mode)` becomes `mode === 'one_time' || modesOf(formFor(method, undefined)).includes(mode)`, where a `cheques` form fits `one_time` and `installments`, and `standing` fits `standing_order`. A credit card's linked deals are still checked by `availableModes` in the form.

In the form: `RecurrenceFields` receives `modes` from `formFor(chosenMethod, resolved)` and renders the Type control only for `shape: 'types'`, offering those modes plus the saved mode when editing an older row. When the way to pay changes and the current mode is not offered, `setValue('mode', 'one_time')` and show `t('tx.typeReset')` as a `role="status"` line under the control until the next change. `shape: 'standing'` sets `mode: 'standing_order'` and shows the frequency control as today. The "Charged to" control and `viaChoice` go; `via` is `standingViaOf(chosenMethod)`. "Paid with" is no longer filtered by the mode for a new transaction (`methodsFor(methods, profileId, value)` with no `mode`): the way to pay comes first and the Type follows.

`ChequeFields`: "How many cheques" (`tx.chequeCount`, 1 to 36, numeric), then one date field per cheque (`tx.chequeDue`, "Cheque {{n}} due"), the first defaulting to the form's date and each next to a month after the one before, each editable. The count maps to `mode: count === 1 ? 'one_time' : 'installments'` and `installmentCount`. Each date that differs from its slot (`addMonthsClamped(first, i, day)`) goes to `saveTransaction` as `slotDates`. Layout: the dates are an intrinsic grid (`grid-template-columns: repeat(auto-fill, minmax(min(100%, 11rem), 1fr))`), no breakpoints.

Copy:

| Key              | English                                                                                  | עברית                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `tx.chequeCount` | How many cheques                                                                         | כמה צ׳קים                                                                   |
| `tx.chequeDue`   | Cheque {{n}} due                                                                         | מועד צ׳ק {{n}}                                                              |
| `tx.typeReset`   | This way to pay takes regular purchases and standing orders, so the type is now Regular. | אמצעי התשלום הזה מקבל עסקאות רגילות והוראות קבע, ולכן הסוג הוא עכשיו רגילה. |

The second sentence of `tx.typeReset` names what the new way to pay takes: use `tx.typeReset_amount` ("This way to pay is one payment, so the type is now Regular." / "אמצעי התשלום הזה הוא תשלום אחד, ולכן הסוג הוא עכשיו רגילה.") when the new form is `amount`.

- [ ] **Step 4: Run**

Run: `pnpm test src/domain/tx-options.test.ts src/features/transaction src/db/save-transaction.test.ts && pnpm exec playwright test e2e/02-transaction-type.spec.ts --project=en --project=he`
Expected: PASS. `e2e/02-transaction-type.spec.ts` gains the R7 rows: Cash shows no Type; Cheque ×3 saves three dated cheques; a debit card shows two types; a credit card shows five.

- [ ] **Step 5: Commit**

```bash
git add src/domain/tx-options.ts src/domain/tx-options.test.ts src/features/transaction src/db/save-transaction.ts src/db/save-transaction.test.ts src/i18n e2e/02-transaction-type.spec.ts
git commit -m "The transaction's type follows how it was paid: cash is one amount, cheques ask how many and when each is due, a debit card takes regular or standing order, a credit card every type

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task C2 (R8): A card seen only on rows is suggested, filled in, and owned by its printed cardholder

**Files:**

- Modify: `src/domain/import-cards.ts` (`cardsFromRows`, `FoundCard.rowsOnly`, `FoundCard.holder`, flag `rows_only` in `CARD_BLOCKING`, `foundOwner`)
- Modify: `src/domain/import-wire.ts` (a card record's `w`, sent only with people, as rows have it: `cardKeys(ctx)`)
- Modify: `src/features/import/run-import.ts` (after `withStatementCards`, add `cardsFromRows(found, cards, methods, statement)`), `src/features/import/found-methods.ts` (`flowPrefillOf` sets the owner through `foundOwner` and marks it answered only when the cardholder matched), `src/features/import/found-methods-list.tsx` ("Card ending 1234 · 12 purchases"), `src/features/import/import-sheet.tsx` (link the rows to the card once it is saved)
- Modify: `src/i18n/locales/{en,he}/import.json` (`method.rowsOnly`, `method.rowsCount`)
- Test: `src/domain/import-cards.test.ts`, `src/domain/import-wire.test.ts`, `src/features/import/import-sheet.test.tsx`

**Interfaces:**

- Produces:

```ts
// FoundCard gains:
//   readonly rowsOnly?: number;  // seen only on rows: how many
//   readonly holder?: string;    // the cardholder alias the document printed
export function cardsFromRows(
  rows: readonly FoundRow[],
  cards: readonly FoundCard[],
  methods: readonly PaymentMethod[],
  statement: { readonly issuer?: CardIssuer; readonly network?: CardNetwork } | undefined,
): FoundCard[];
export function foundOwner(
  card: FoundCard,
  rows: readonly FoundRow[],
  people: ReadonlyMap<string, string>, // alias → profile id
  batchOwner: string,
): { readonly owner: string; readonly fromDocument: boolean };
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('cardsFromRows (spec 5, R8)', () => {
  const row = (l4: string, w?: string) =>
    foundRow({ wire: wireRow({ l4, ...(w === undefined ? {} : { w }) }), kind: 'expense' });
  const known = [{ id: 'pm-1', type: 'credit_card', label: 'Max', card: { lastDigits: '1111' } }] as never;

  it('suggests a card for digits no household card and no found card has', () => {
    const [card] = cardsFromRows([row('4321'), row('4321'), row('1111')], [], known, { issuer: 'max' });
    expect(card).toMatchObject({ lastDigits: '4321', issuer: 'max', rowsOnly: 2 });
    expect(card?.flags).toContain('rows_only');
  });
  it('suggests nothing for digits a found card already has', () => {
    expect(
      cardsFromRows([row('4321')], [readCard(wireCard({ l4: '4321' }), 'c', 0, '')], [], undefined),
    ).toEqual([]);
  });
  it('is never tickable as it is', () => {
    const [item] = buildMethodReview(cardsFromRows([row('4321')], [], [], undefined), [], []);
    expect(item?.ticked).toBe(false);
  });
});

describe('foundOwner', () => {
  const people = new Map([
    ['A', 'p-dana'],
    ['B', 'p-yossi'],
  ]);
  it('is the printed cardholder when exactly one person matches', () => {
    expect(foundOwner(CARD_4321, [row('4321', 'A'), row('4321', 'A')], people, 'p-batch')).toEqual({
      owner: 'p-dana',
      fromDocument: true,
    });
  });
  it('is the batch’s person when the rows name two people, or none', () => {
    expect(foundOwner(CARD_4321, [row('4321', 'A'), row('4321', 'B')], people, 'p-batch')).toEqual({
      owner: 'p-batch',
      fromDocument: false,
    });
    expect(foundOwner(CARD_4321, [row('4321')], people, 'p-batch')).toEqual({
      owner: 'p-batch',
      fromDocument: false,
    });
  });
  it('takes the card record’s own printed holder first', () => {
    expect(foundOwner({ ...CARD_4321, holder: 'B' }, [], people, 'p-batch')).toEqual({
      owner: 'p-yossi',
      fromDocument: true,
    });
  });
});
```

(`foundRow` and `wireCard` are small helpers beside the existing `wireRow` in `test-factories.ts`.)

In `import-sheet.test.tsx`: a statement whose rows carry an unknown `l4` lists "Card ending 4321 · 2 purchases" among the found cards, unticked, with "Fill in"; opening it starts the flow with the last four, the company and the owner filled and tagged "From your statement"; after Save its rows are paid with the new card; declining it leaves the rows on the batch's method.

`import-wire.test.ts`: with people sent, the card schema requires `w` among its keys; without people, it has none.

- [ ] **Step 2: Run to fail.** `pnpm test src/domain/import-cards.test.ts src/domain/import-wire.test.ts src/features/import`
- [ ] **Step 3: Implement**

`cardsFromRows`: group expense rows by their printed `wire.l4` (not `statementCard`'s); drop digits that `existingCard` or a found card already has; each remaining group becomes a `FoundCard` with `id: rows:<l4>`, `file` of its first row, `label: ''` (the UI shows `t('import:method.rowsOnly', { digits })`), `lastDigits`, the statement's `issuer` and `network` when given, `rowsOnly: rows.length`, `holder` when every row with a `w` names the same alias, and `flags: ['rows_only']`. `rows_only` joins `CARD_BLOCKING`. `cardMissing` is not relevant to it: `needsFilling` is true for any `rows_only` card.

`foundOwner`: the card's `holder`, else the single distinct `w` among its rows, mapped through `people`; else `batchOwner` with `fromDocument: false`.

Wire: `cardKeys(ctx)` is `CARD_KEYS` plus `'w'` when `ctx.ppl` has people, with `w: aliasSchema(…)` in the card's JSON schema and `readCard` keeping it as `holder`. The prompt's card line adds: "w: the alias of the person whose name is printed as the cardholder".

Copy: `method.rowsOnly` "Card ending {{digits}}" / "כרטיס שמסתיים ב־{{digits}}"; `method.rowsCount_one` "1 purchase" / "קנייה אחת", `_two` (he) "2 קניות", `_other` "{{count}} purchases" / "{{count}} קניות".

- [ ] **Step 4: Run.** Expected: PASS, with the Expenses / Income / Both cases still green.
- [ ] **Step 5: Commit**

```bash
git add src/domain/import-cards.ts src/domain/import-cards.test.ts src/domain/import-wire.ts src/domain/import-wire.test.ts src/domain/test-factories.ts src/features/import src/i18n
git commit -m "Smart import suggests a card it sees only on transaction rows, by its last four digits, filled in from the file and owned by the cardholder it prints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task C3 (R6, R13 for Smart import): Documents say who issued a card and who runs it

**Files:**

- Modify: `src/domain/import-wire.ts` (`WireCard` gains `op`, `pn`, `bk`; `CARD_KEYS`; the prompt line of spec 21.7)
- Modify: `src/domain/import-cards.ts` (`readCard` maps `is`, `op`, `pn`, `bk`; `planCard` writes `kind`, `issuerBank`, `productName`; `CardChange` gains `'issuerBank' | 'company' | 'productName'`)
- Modify: `src/domain/import-sheet-readers.ts` (Discount: "כל הכרטיסים הבנקאיים" and the "מנפיק" column; Max: `titleCard` product name; a bank's current-account rows "חיוב לכרטיס <network> NNNN")
- Test: `src/domain/import-sheet-readers.test.ts`, `src/domain/import-cards.test.ts`, `src/domain/import-wire.test.ts`

**Interfaces:**

- Produces: `FoundCard` gains `issuerBank?: string`, `bankCard?: 'bank' | 'non_bank'`, `productName?: string`, and `bankCardGuess?: true` (from a Max product name: "From your statement · check").

- [ ] **Step 1: Write the failing tests** (spec 21.11 Import, on synthetic files built from the issuer research §5):
  - the Discount reader gives `issuer: 'cal'` from the "מנפיק" column, `issuerBank: '11'`, `bankCard: 'bank'` and `network: 'visa'`;
  - the Max reader gives `issuer: 'max'` and `productName` from the title row, with `bankCard` unset; with "דיסקונט" in the name, `issuerBank: '11'` with `bankCardGuess: true`;
  - "חיוב לכרטיס ויזה 1234" on a Hapoalim statement gives a rows-only found card (C2) with `bankCard: 'bank'`, `issuerBank: '12'`, `network: 'visa'`; a "מקס איט פי חיוב" lump never creates a card;
  - the wire parses `op`, `pn` and `bk`; `readCard` sends a bank in `is` to `issuerBank` and a company to `issuer`; `op` wins for the company;
  - `planCard` on an existing card leaves what the document doesn't print, and lists `issuerBank`, `company` and `productName` among the changes when they differ;
  - when two documents disagree on bank card or not, the card gets `reads_disagree`.
- [ ] **Step 2: Run to fail.** `pnpm test src/domain/import-sheet-readers.test.ts src/domain/import-cards.test.ts src/domain/import-wire.test.ts`
- [ ] **Step 3: Implement** spec 21.7: the wire keys, `readCard`'s mapping through `bankFromName` and the companies table, the readers, and `planCard`. `flowPrefillOf` (B12) marks `bankCard`, `bank`, `company`, `network` and the product as answered when the document gave them, so a Max export alone opens on "Is it a bank card?" and a Discount export on the type step.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/domain/import-wire.ts src/domain/import-cards.ts src/domain/import-sheet-readers.ts src/domain/*.test.ts src/features/import/found-methods.ts
git commit -m "Smart import reads which bank issued a card and which card company runs it, so a Discount export's Cal cards arrive as Discount bank cards run by Cal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task C4 (R11): A doubtful card read is shown as doubtful, and never added by itself

**Investigation finding:** a card list read from a screenshot is read twice and the reads compared (`combineCardReads`). A card whose two reads differ by one digit ("5678" and "5578") matches nothing in `sameCard`, so it comes out as **two** cards, each `one_read_only`: the second is the phantom. A Hebrew name read in visual order comes out reversed ("סקימ" for "מקס"), and nothing checks it.

**Files:**

- Modify: `src/domain/import-cards.ts` (`combineCardReads` pairs one-digit differences; new flags `name_unreadable` and `near_known` in `CARD_BLOCKING`; `garbledName`; `nearCard`; `buildMethodReview` sets `nearId`)
- Modify: `src/features/import/found-methods-list.tsx` (an "Edit name" field on every found card; the near-card question; the doubtful-read lines)
- Modify: `src/features/import/import-sheet.tsx` (the save path skips any card with a blocking flag, whatever its tick says)
- Modify: `src/i18n/locales/{en,he}/import.json`
- Test: `src/domain/import-cards.test.ts`, `src/features/import/found-methods-list.test.tsx` (new), `src/features/import/import-sheet.test.tsx`

**Interfaces:**

- Produces: `CardFlag` gains `'name_unreadable' | 'near_known'`; `MethodReviewItem` (card) gains `nearId?: string`; `garbledName(name: string): boolean`; `nearCard(card: FoundCard, methods: readonly PaymentMethod[]): PaymentMethod | undefined` (a live card whose last four differ from the found card's in exactly one position).

- [ ] **Step 1: Write the failing tests**

```ts
describe('a screenshot of a card list, read twice (R11)', () => {
  const read = (n: string, l4: string, id: string) => readCard(wireCard({ n, l4 }), id, 0, '');

  it('makes one card, flagged, of two reads one digit apart: no phantom', () => {
    const cards = combineCardReads([read('Cal Gold', '5678', 'a')], [read('Cal Gold', '5578', 'b')]);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.flags).toContain('reads_disagree');
    expect(cards[0]?.otherRead?.lastDigits).toBe('5578');
  });

  it('flags a name whose two reads differ, and a Hebrew name read backwards', () => {
    const [card] = combineCardReads([read('סקימ', '1234', 'a')], [read('מקס', '1234', 'b')]);
    expect(card?.flags).toContain('name_unreadable');
    expect(garbledName('סקימ')).toBe(true); // ends in a non-final מ: read in visual order
    expect(garbledName('ךרוכ')).toBe(true); // starts with a final letter
    expect(garbledName('מקס')).toBe(false);
    expect(garbledName('Max Gold')).toBe(false);
    expect(garbledName('Ma�x')).toBe(true);
    expect(garbledName('מקסGold')).toBe(true); // Hebrew and Latin letters in one word
    expect(garbledName('max ביחד בשבילך')).toBe(false);
  });

  it('flags a card one digit away from a household card, and offers that card', () => {
    const methods = [
      { id: 'pm-1', type: 'credit_card', label: 'Max ·1234', isArchived: 0, card: { lastDigits: '1234' } },
    ] as never;
    const [item] = buildMethodReview([read('Max', '1284', 'a')], [], methods);
    expect(item?.flags).toContain('near_known');
    expect(item?.kind === 'card' && item.nearId).toBe('pm-1');
    expect(item?.ticked).toBe(false);
  });

  it('never ticks a low-confidence read', () => {
    for (const flag of [
      'reads_disagree',
      'one_read_only',
      'not_in_source',
      'name_unreadable',
      'near_known',
      'rows_only',
    ] as const) {
      expect(CARD_BLOCKING.has(flag)).toBe(true);
    }
  });
});
```

`found-methods-list.test.tsx`:

- every found card row has "Edit name"; editing it changes the name the card is saved with, and clears `name_unreadable`;
- a `name_unreadable` card shows "The name may have been misread. Check it, or type it as it is on the card." and its two reads;
- a `near_known` card asks "Is this Max ·1234? Its last digits read 1284." with "It's that card" (the found card becomes an update to `pm-1`, its digits not changed) and "It's a new card" (the flag clears; it opens the flow to finish);
- a `reads_disagree` card shows both reads of the digits, and choosing one clears the flag.

`import-sheet.test.tsx`: a ticked card that still carries a blocking flag (forced in the test) is not created by "Save"; nothing in `db.paymentMethods` changes for it.

- [ ] **Step 2: Run to fail.** `pnpm test src/domain/import-cards.test.ts src/features/import`
- [ ] **Step 3: Implement**

```ts
const FINALS = 'ךםןףץ';
const BEFORE_FINAL = 'כמנפצ';
const HEBREW = /\p{Script=Hebrew}/u;
const LATIN = /\p{Script=Latin}/u;
const UNREADABLE = /[�\p{Cc}‎‏‪-‮]/u;

/** A name that reads as copied wrong: a replacement or control character, a Hebrew word in visual order, or two scripts in one word. */
export function garbledName(name: string): boolean {
  if (UNREADABLE.test(name)) return true;
  return name.split(/\s+/u).some((word) => {
    const letters = [...word].filter((c) => HEBREW.test(c) || LATIN.test(c));
    if (letters.some((c) => HEBREW.test(c)) && letters.some((c) => LATIN.test(c))) return true;
    const hebrew = letters.filter((c) => HEBREW.test(c));
    const [first] = hebrew;
    const last = hebrew.at(-1);
    if (hebrew.length < 2 || first === undefined || last === undefined) return false;
    return FINALS.includes(first) || BEFORE_FINAL.includes(last);
  });
}

/** Two last-four readings one digit apart: the same card, misread once. */
const oneDigitApart = (a: string | undefined, b: string | undefined): boolean =>
  a !== undefined &&
  b !== undefined &&
  a.length === 4 &&
  b.length === 4 &&
  [...a].filter((c, i) => c !== b[i]).length === 1;
```

`combineCardReads`: after the exact `sameCard` pass, pair each still-unmatched first read with an unmatched second read whose digits are `oneDigitApart` (and whose names are the same or either is garbled) as one card with `reads_disagree` and `otherRead`. When a pair's names differ (case and spaces aside), or either is `garbledName`, add `name_unreadable`. `readCard` adds `name_unreadable` for a text-read card whose name is `garbledName`. `buildMethodReview`: when `existingCard` finds none and `nearCard` finds one, add `near_known` and `nearId`. `CARD_BLOCKING` gains both flags. The save path filters `items.filter((i) => i.ticked && !i.flags.some((f) => CARD_BLOCKING.has(f)))`.

Copy:

| Key                  | English                                                                    | עברית                                                                        |
| -------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `method.editName`    | Edit name                                                                  | עריכת השם                                                                    |
| `method.nameDoubt`   | The name may have been misread. Check it, or type it as it is on the card. | ייתכן שהשם נקרא לא נכון. בדקו אותו, או הקלידו אותו כמו שהוא מופיע על הכרטיס. |
| `method.nearKnown`   | Is this {{name}}? Its last digits read {{digits}}.                         | זה {{name}}? הספרות האחרונות נקראו {{digits}}.                               |
| `method.nearSame`    | It's that card                                                             | זה הכרטיס הזה                                                                |
| `method.nearNew`     | It's a new card                                                            | זה כרטיס חדש                                                                 |
| `method.readsDiffer` | The two readings differ: {{first}} or {{second}}. Choose the right one.    | שתי הקריאות שונות: {{first}} או {{second}}. בחרו את הנכונה.                  |

Digits and names in these lines are wrapped in left-to-right isolates where they are digits (`⁦…⁩`), and in `dir="auto"` spans where they are names.

- [ ] **Step 4: Run.** `pnpm test src/domain/import-cards.test.ts src/features/import`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/domain/import-cards.ts src/domain/import-cards.test.ts src/features/import src/i18n
git commit -m "A card misread from a screenshot is shown as doubtful, with its name to correct and a near match to confirm, and is never added by itself

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task C5: Verify and release C

- [ ] **Step 1:** `e2e/09-import.spec.ts` (or the import e2e file the repo has: `ls e2e | grep -i import`) gains: a two-read fixture of a card-list screenshot (stubbed model answers, as the existing import e2e stubs them) yields one doubtful card, not two, unticked, with "Edit name"; a statement with an unknown `l4` suggests "Card ending 4321".
- [ ] **Step 2:** Run `pnpm verify && pnpm verify:full`. Expected: green.
- [ ] **Step 3:** Add "Release note:" bullets to `README.md` → "Known limitations": the Type follows the way to pay; cheques with their own dates; cards from rows; doubtful reads. Commit with the trailer.

---

# Self-review

- **Spec coverage.** Sections 1 to 21 each map to a task: 1, 6 → B12; 2 → B6, B7; 3 → B8, B9; 3.5 → B3, B8; 4 → B3, B10; 5 → B12, C2, C3; 7, 7.1 → B10; 8 → B11; 9 → A9, B11; 10.1 to 10.3 → A2, A7; 10.4 → C1; 11 → A6, B4; 12 → B5; 13.1 to 13.4 → A1, B3; 13.5 → A2; 13.6 → B5; 13.7 → B1; 13.8 → A1, A3, Review Focus 1; 14 → B3, B6 to B13; 15, 21.10 → each UI task's copy; 16 → B6, B7, B15; 17 → B3, B8 to B11 tests; 18 → every task's tests; 19 → the release order; 20 → nothing built; 21.2, 21.9 → B1, B14; 21.4 → B2; 21.5, 21.6 → B3, B10; 21.7 → C3; 21.8 → B4, B10; 22 → the rulings above.
- **Placeholders.** The data cells of B1 are given as tables to copy into code; each cell's source URL is named by the research file and section it comes from, because the URLs live there, and `catalog:check` fails any non-unverified cell left without one.
- **Type consistency.** `CardKindName` (A6) is used by A8, A9, B2, B3, C1. `cardKindOf`, `countsInBalance` (A6). `methodTypeOf` (A1). `Choices`, `Cascade`, `TypeChoice`, `answeredAlone` (B2). `CardFlowState`, `FlowStep`, `methodFromState`, `FlowContext` (B3). `cardIdentityOf`, `issuerOf`, `legacyBankText` (B4). `CardMove`, `cardPot`, `writeCardStart` (B5). `CardFlowDialog`, `CardFlow`, `CardFlowMode`, `useCardFlow` (B7). `formFor`, `PaymentForm` (C1). `cardsFromRows`, `foundOwner` (C2). `garbledName`, `nearCard` (C4). B2's `typesFor` is the card-type list; C1's function is `formFor`, so the two names don't collide.

# Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-10-cards-and-add-card-flow.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven:** a fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native:** one session implements every task, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end.

**Recommended: subagent-driven.** There are 30 tasks across three releases. Their interfaces chain (A6 → A8 → B2 → B3 → B7 → B8 to B12), and a mistake shipped in A1 or B5 can erase card details or a balance on every device, so each task deserves its own reviewer.

# Traceability

| #   | The user's request                                                                                                                                                                                               | Delivered by                                                                                                                     | Proved by                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | A step-by-step pop-out to add a card; the logic and the step order fixed; the company asked once                                                                                                                 | B3 (steps), B7 (pop-out), B8 (cascade), B13 (old form removed)                                                                   | `card-flow.test.ts` "the company is asked once" for every kind and `stepsFor` orders; `card-flow-dialog.test.tsx` opening, moving on, focus; B13's `grep` and `knip` finding no `CardFields` or `IssuerChooser`                                   |
| R2  | "Credit cards" renamed "Cards" in en and he, holding credit, debit, prepaid (כרטיס נטען) and gift cards                                                                                                          | A9 (current layout), A8 (New Card's four kinds), A6 (`cardKindOf`, gift out of balance), B11 (kind panels)                       | `cards-screen.test.tsx` "is called Cards, in English and Hebrew" and "groups credit, debit, prepaid and gift cards"; `e2e/14-cards.spec.ts` titles; `cards.test.ts` `cardKindOf` table                                                            |
| R3  | "Other ways to pay" removed; cash and cheques built in; bank transfer, standing order, Bit / PayBox and Other as built-in "Paid with" choices; custom rows keep working                                          | A2 (six built-ins, guards, upload), A7 ("Paid with" order, own rows only as kept), A8 (`OtherMethods` deleted)                   | `payment-methods.test.ts` "the six built-ins" (guards, upload, re-add); `tx-options.test.ts` "methodsFor: what Paid with offers"; `integrity.test.ts` `pm.transfer` kept; `cards-screen.test.tsx` no "Other ways to pay"                          |
| R4  | The "New payment method" dialog offers only cards and is titled "New Card"; bank account, transfer, standing order, wallet and other can't be added; bank accounts keep their screen                             | A8                                                                                                                               | `method-editor.test.tsx` "is titled New Card and offers only the four kinds of card", "כרטיס חדש", "New bank account with no type to choose"                                                                                                      |
| R5  | Exactly what a debit, prepaid and gift card asks for, from the research, built                                                                                                                                   | B3 (`fieldsFor`, `methodFromState`), B4 (debit and prepaid fees), B5 (pots), B9 (the screens), B11 (panels)                      | `card-flow.test.ts` "what each kind saves" (debit, prepaid, gift); `details.test.tsx` one test per kind's fields; `card-pots.test.ts`; `cards.test.ts` fee lines                                                                                  |
| R6  | Cascading questions, each filtered by every earlier answer: credit/debit, bank card or not, which bank (bank cards only), card company, network; the matrix as sourced, dated data that never blocks a real card | B1 (matrix data and checks), B2 (`choicesFor`), B3 (`stepsFor`), B8 (screens), B14 (sources and corrections), C3 (import reads)  | `card-matrix.test.ts` (Discount, Mercantile, Mizrahi, One Zero, Hapoalim, Leumi, Citibank, "never empty", debit never Amex or Diners); `check.test.ts`; `cascade.test.tsx` "a non-bank answer goes straight to the company"; `pnpm catalog:check` |
| R7  | The Type control depends on the way to pay: cash one amount, cheque count and due dates, debit Regular and Standing order, credit all five                                                                       | C1                                                                                                                               | `tx-options.test.ts` "formFor (spec 10.4)" table; `transaction-sheet.test.tsx` per-row DOM tests, the reset line, the cheque dates; `save-transaction.test.ts` `slotDates`; `e2e/02-transaction-type.spec.ts`                                     |
| R8  | Smart import suggests a card seen only on rows, filled in from the file, owned by the printed cardholder when exactly one person matches                                                                         | C2 (and C3 for bank-statement rows)                                                                                              | `import-cards.test.ts` "cardsFromRows" and "foundOwner"; `import-sheet.test.tsx` "Card ending 4321 · 2 purchases" flow and row linking                                                                                                            |
| R9  | Card kinds Credit / Debit / Prepaid / Gift first; non-credit stored with an open `funding`; a compatibility release first, on its own, so older builds can't wipe a debit card's details                         | A1 (open `type`, card keys), A2 (built-ins seeded), A3 (no card wiped), A5 (A1 deploy alone), then A8 and B3 (`funding` written) | `transfer-schema.test.ts` open type and funding; `method-editor-compat.test.tsx` debit, prepaid, gift and future cards keep every detail; `cards.test.ts` unknown funding reads as debit                                                          |
| R10 | "Edit card" and "Archive" not responding: find out if the redesign broke it; a task with a failing test                                                                                                          | A4                                                                                                                               | `e2e/14-cards.spec.ts` "a card menu opened while the Undo toast shows keeps clear of it" (fails today on the overlap, en and he); `popup-parts.test.tsx` `bottomInsetFrom`                                                                        |
| R11 | A validation step in the card-found review: edit the name, flag last digits one off an existing card, never auto-create from a low-confidence read                                                               | C4                                                                                                                               | `import-cards.test.ts` "a screenshot of a card list, read twice" (no phantom, `garbledName`, `near_known`, `CARD_BLOCKING`); `found-methods-list.test.tsx`; `import-sheet.test.tsx` blocked card never saved                                      |
| R12 | The pop-out takes Bold sheets' look (up to 1140 × 732, three panes from 1040 px, company tiles in their colours) and works inside Smart import and on a phone                                                    | B6 (tiles), B7 (`PopOut` shell, preview), B12 (inline in the import sheet), B15 (sizes)                                          | `choice-list.test.tsx`; `card-flow-dialog.test.tsx` one popup, RTL; `import-sheet.test.tsx` no second pop-out, tiles 1 and 2 across by container; `e2e/19-card-flow.spec.ts` 1140 / 800 / 390 / 320 px                                            |
| R13 | A card's detail view shows issuer, card company and network apart (a Discount card run by Max); existing cards keep working; the old `card.bank` still written                                                   | B4 (`cardIdentityOf`, legacy text), B3 (saving), B10 (summary rows, face "Run by"), C3 (import)                                  | `cards-identity.test.ts` every row of spec 21.8 and the legacy text; `card-summary.test.tsx` "a Discount card run by Max…"; `card-flow.test.ts` worked example A; `e2e/19-card-flow.spec.ts` example A in Hebrew                                  |
