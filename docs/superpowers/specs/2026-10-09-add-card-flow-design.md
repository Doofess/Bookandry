# Add a card, step by step: design

**Status:** Design approved in chat on 2026-10-09; this spec awaits review.

**Asked for by the user on 2026-10-09:**

> "the add card menu is awful ux/ui, i want a strong redesign, instead of a big amount of options thrown at the user at once make it so its a popout window that walks the user step by step towrads adding a credit card. also fix the logic behind it e.g order of the steps and etc. also right now it asks for the company step twice, look into that"

Later, on a step-by-step flow like other fintech apps: "yes like many other fintech companies out there i like that".

## Why the form asks for the company twice

The editor shows two separate ways to say which card it is, at the same time.

- **`IssuerChooser`** ("Who issues this card") asks from the catalog: bank, then card company, then card type, then club.
- **`CardFields`** asks the same things by hand: "Card company (manual)", "Issued by: bank / non-bank", "Bank (manual)" or "Charged to the account at", and "Card type (manual)".
- The manual fields hide only once a card type links the card. Until then both are on screen.

So the company, the bank and the type are each asked twice, and the bank up to four ways: the catalog bank, "Issued by", the manual bank, and "Paid from". On the Cards screen the editor also opens with a 7-way payment-method Type switch above all of it.

The fix is not to hide one of the two. Each question is asked once, in one place, in an order where each answer narrows the next.

## Decisions the user made

1. **Scope.** The step-by-step flow is used for **adding** a credit card everywhere: the Cards screen, Smart import, and a new payment method from the transaction form. **Editing** an existing card becomes a summary page with three sections: The card · Billing · Fees and interest. Tapping a section opens only that step. The "Interest table" deep link opens the fees step. Bank accounts and the other method types keep their current form for now; "Other ways to pay" still adds debit cards, wallets and the rest.
2. **Container.** A centred pop-out window on desktop, a full-height sheet on a phone. It has a progress bar and Back / Next. A step answered by one tap moves on by itself.
3. **Company first.** Isracard / Cal / Max / Amex / Diners / Other, as logos. Then "Through which bank?", narrowed to that company's banks, plus "Not through a bank".
4. **The steps.**
   1. Card company
   2. Bank (or not through a bank)
   3. Card type and club. Skipped when the company has only one type. The club part shows only if the company has clubs.
   4. Your card: last 4 digits, valid until, network, colour, and whose card it is
   5. Billing: the paying account, the billing day (the company's real billing days first), the credit limit
   6. Fees and interest: from the catalog, shown as a summary with "Change". An unlinked card gets editable fee, foreign-currency and rate fields.
   7. Review, then Save

   The old "Issued by" question goes away, because step 2 answers it. "Bank (manual)" appears only behind "My bank isn't listed".

5. **What is required.** Only the company (or Other) and a name. Every later step has Skip. A skipped answer shows "Not set" on review. The billing-day step says it is what makes the monthly balance right. A card without a billing day gets a "Finish setting up" nudge, reusing and extending the unfinished notice.
6. **No type switch.** The 7-way Type switch is gone from the card flow. "Add a card" always means a credit card.
7. **Smart import.** Steps the document already answered are skipped, and the flow opens at the first one it didn't. Review marks those values "From your statement". Back still reaches the skipped steps.
8. **From the transaction form.** The pop-out opens over the transaction. On Save it closes, the transaction comes back with the new card selected, and the card's rate is copied into a credit plan as today.
9. **"Not in the list" escapes.**
   - Company "Other" → a company name field.
   - Bank "My bank isn't listed" → a bank name field.
   - Type "Not in the list" → a free-text type.

   Any escape makes the card unlinked, so the fees step shows editable fields. Each escape is a text field on the same step, never a new step.

10. **Network.** Amex is set and not asked. Diners is set, except for the Diners Mastercard type. Isracard, Cal and Max ask it, as one row of logos in step 4.
11. **Owner.** "Whose card?" in step 4 defaults to the first person. Picking a paying account in step 5 makes the owner that account's holder, unless the owner was changed by hand. It is hidden in a one-person household.
12. **Name.** Suggested from the answers: "Max Platinum ·1234", and for a bank card "Max · Leumi Platinum ·1234". It is shown and editable on review. It follows the answers until the person edits it.
13. **Duplicates.** The same company and last 4 digits as a live card: review warns "You already have Max ·1234" with "Open it". It does not block saving.
14. **Closing.** Before step 3, closing just closes. From step 3 on it asks "Discard this card?". Nothing is saved until Save. There are no drafts.
15. **Build order.** The design is settled now. The screens are built **after** the app-wide colourful redesign, which is in progress separately, sets the new colours and fonts. All styling here uses tokens, and the visual layer follows that redesign.

## 1. Where the flow is used

| Caller                                                 | Today                                             | After                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Cards screen, "Add a card"                             | `MethodEditor` with `newType="credit_card"`       | The add flow in the pop-out.                                                             |
| Cards screen, card menu "Edit card"                    | `MethodEditor` on the card                        | The edit summary in the pop-out.                                                         |
| Cards screen, card menu "Interest table"               | `MethodEditor` with `section="rates"`             | The edit pop-out opened straight on the fees step, with the rate table focused.          |
| Cards screen, a card's "No billing day yet" line       | Text only                                         | Gains "Finish setting up", which opens the edit pop-out on the billing step (section 8). |
| Smart import, a found card to finish                   | `MethodPanel` → `MethodForm` with a prefill       | The add flow inside the import sheet, opened at the first unanswered step (section 5).   |
| Smart import, a found card that updates one we have    | `MethodPanel` → `MethodForm` on the existing card | The edit summary inside the import sheet, with the document's values marked (section 5). |
| Transaction form, payment method picker                | No way to add a card                              | A new last option, "Add a card", opens the add flow over the transaction (section 6).    |
| Transaction form, a credit plan's "open the card" link | A sheet with `MethodForm` on the card             | The edit pop-out on the fees step, as "Interest table" does.                             |
| "Other ways to pay" (`OtherMethods`)                   | `MethodEditor` with `newType="debit_card"`        | Unchanged, except its Type switch no longer offers "Credit card".                        |
| Bank accounts screen                                   | `MethodEditor` with `newType="bank_account"`      | Unchanged, except its Type switch no longer offers "Credit card".                        |

`MethodForm` stays for bank accounts and the other method types. It loses `credit_card` from its type list and loses `CardFields` and `CardColorField`. An existing method of another type can no longer be turned into a credit card from that form. A credit card is only ever added through the flow.

## 2. The pop-out

### 2.1 One component, two shapes

- `CardFlowDialog` uses the existing Base UI dialog (`src/components/ui/dialog.tsx`). That gives a modal with a focus trap, an inert page behind it, Escape to close, and focus returned to the button that opened it.
- **Desktop (from `sm`):** centred, `max-w-md`, at most `85dvh` tall. The step body scrolls inside; the header and footer stay put.
- **Phone (below `sm`):** the same popup fills the screen (`inset-0`, `h-dvh`), with the footer above the safe area (`env(safe-area-inset-bottom)`).
- It is one popup with responsive classes, not a dialog on desktop and a sheet on phones. Rotating a tablet or resizing a window never loses the answers.

### 2.2 Layout of every step

From top to bottom:

1. **Header:** a close button (×), the progress bar, and "Step 3 of 7".
2. **Card preview:** from step 2 on, a small card face shows the answers so far: the company mark, the bank, the type, "·1234" and the colour. It is the face the Cards screen draws, moved out of `CardPanel` into a `CardFace` component that both use.
3. **The step's heading,** a question (for example "Which company issued the card?"), with one line of help under it.
4. **The step's controls.**
5. **Footer:** Back (not on step 1), and the step's main button: Next, Skip or Save.

### 2.3 Progress

- It reuses `Progress` from `src/components/ui/progress.tsx`, as first run does.
- It sets `max` to the number of steps and `value` to the current step, so no percentage is computed. That keeps `gate:money` clean without first run's percent table.
- The total is the steps that apply to this card. That is 7, or 6 when step 3 is skipped because the company has only one type. Steps skipped because Smart import answered them still count, because Back can reach them.

### 2.4 Moving between steps

- **One-tap steps move on by themselves:** step 1 (any company but Other), step 2 (any bank but "My bank isn't listed"), and step 3 when the company has no clubs, or on picking the club.
  - The flow moves on about 150 ms after the choice shows as selected, so the person sees what they picked.
  - Coming back to a one-tap step and tapping the same answer moves on again.
- **Arrow keys never move on.** In these choice lists, the arrow keys move focus, and only Enter, Space or a tap chooses. Otherwise a keyboard user would be carried off the step by the first arrow press. Today's `Segmented` selects on arrow keys, so the flow's choice lists use a radio group where selection follows activation, not focus.
- **Next, Skip and Save:**
  - Steps 2 to 6 show **Skip** while nothing on the step is answered, and **Next** once something is.
  - Skip leaves the step's answers empty. It never clears answers that are already there, so a value from a statement is never lost by pressing it.
  - Pressing Next with a field that can't be read (say "13/28" as the expiry) shows the error at that field and focuses it. The flow stays on that step.
  - Step 7 shows **Save**.
- **Back** goes to the previous step that applies, including steps skipped because Smart import answered them.

### 2.5 Motion

- **Between steps:** the existing `morph()` helper (`src/features/account/morph.ts`) runs each step change as a view transition. The step body slides in the reading direction: forward comes in from the inline end, so in Hebrew it comes from the left. The header, progress bar and card preview carry `view-transition-name`s so they stay in place while the body changes.
- **Opening:** the popup's opening uses `@starting-style` (Tailwind's `starting:` variant), the same way Base UI's `data-starting-style` works today: a short fade and rise, with no JavaScript timing.
- **Less motion:** with `prefers-reduced-motion: reduce`, `morph()` already changes instantly, and the global rule in `index.css` already shortens transitions.
- **No support:** where the browser has no view transitions, the step just changes.

### 2.6 Layout inside the pop-out

- The step body is a size container (`@container`). Its grids follow the pop-out's width, not the screen's. For example, the company logos are 2 across in a narrow pop-out and 3 across in a wide one. The same step then lays out right inside the import sheet and on a phone.
- Only logical properties are used (`ms-`, `pe-`, `start-`), as `gate:rtl` requires.
- Every colour, radius and shadow is a token: `--popover`, `--primary`, `--accent`, `--border`, `--muted-foreground` and so on. No colour is written into the flow. The colourful redesign changes the tokens, and the flow follows. Section 15 has the build order.

## 3. The steps

The flow keeps its answers in one `CardFlowState` (section 10). Everything a step shows is worked out from that state by pure functions in `src/domain/card-flow.ts`.

The catalog starts loading (`loadCatalog()`, a dynamic import) the moment the pop-out opens, so it is usually ready by step 2. Step 1 never waits for it, because the six companies are app constants, not catalog data.

### Step 1 · Card company

- **Heading:** "Which company issued the card?". Help: "It's printed on the card and at the top of your statement."
- **Choices:** Isracard, Cal, Max, American Express, Diners and Other. Each is a large tile with the company's logo (`BrandMark`), and Other has the neutral mark.
- **Other:** shows a "Company name" field on the same step, with Next. The name is optional. The card is unlinked.
- Changing the company after later steps were answered clears the answers that no longer fit: a bank that doesn't issue that company, the type, the club, and a network that company doesn't use. Answers that still fit stay.

### Step 2 · Bank

- **Heading:** "Through which bank?". Help: "A card through a bank comes with your bank account. If you got it straight from {{company}}, choose Not through a bank."
- **Choices:** "Not through a bank" first, then the banks that issue this company (`catalog.banks.filter(b => b.issuers.includes(company))`), each with its `BankMark`, then "My bank isn't listed".
- **Company Other:** every catalog bank is offered. Choosing one only records the bank's name and that it is a bank card. The card stays unlinked.
- **"My bank isn't listed":** shows a "Bank name" field on the same step. The card is unlinked.
- **What it sets:** "Not through a bank" sets `kind: 'non_bank'`. Any bank sets `kind: 'bank'` and `bank` to the bank's name in the current language. This answers the old "Issued by" question, which is gone.
- **Catalog still loading:** "Loading the card list…" with the two plain choices, "Not through a bank" and "My bank isn't listed". **Catalog failed to load:** the existing "Couldn't load the card list" message and the same two choices. Either way, the person is never stuck.

### Step 3 · Card type and club

- **Heading:** "Which card is it?".
- **Type:** the company's issued types (`tiersOf`), plus "Not in the list".
  - "Not in the list" shows a "Card type" text field and an optional "Club" text field. The card is unlinked.
- **Club:** only when the company has issued clubs (`clubsOf`). It appears under the type once a type is picked.
  - "No club" comes first.
  - With more than 8 clubs (Isracard 19, Cal 16, Max 33), the list can be searched, using the same `Command` pattern as `BankSelect`.
  - Picking a club, or "No club", moves on.
- **Skipped:** when the company has exactly one issued type and no clubs. The type is then set without asking.
- **Company Other, or the catalog failed:** this step shows only the free-text type and club fields, with Skip.
- **Linking:** once the company, the bank and a catalog type are known, the card is linked (`linkedDraft`). The catalog fills the foreign-currency fee, the card fee (not through a bank only), the credit margin and the late rate. Steps 5 and 6 then show the real billing days and rates.
  - If the person comes back and changes the company, the bank or the type after changing a rate on step 6, the existing "Keep the rates you entered?" question is asked first.

### Step 4 · Your card

- **Heading:** "Your card". Help: "Only the last 4 digits are kept, never the rest of the number."
- **Fields, in order:**
  1. **Last 4 digits:** numeric, `dir="ltr"`, as today.
  2. **Valid until:** MM/YY, as today.
  3. **Network:**
     - Amex: set to Amex, shown as a line ("Network: Amex"), not asked.
     - Diners: set to Diners, shown as a line. On the Diners Mastercard type it is set to Mastercard instead.
     - Isracard: one row of logos, Isracard / Mastercard / Visa.
     - Cal and Max: Visa / Mastercard.
     - Other: all five networks.
     - Nothing else is guessed. Section 16 covers network inference.
  4. **Card colour:** the existing swatches (`CardColorField`). "The card company's colour" is first and is the default.
  5. **Whose card?:** each person, then "Shared". It defaults to the first person, is hidden in a one-person household, and follows the paying account (step 5) until changed by hand.
- Every field is optional, and the step has Skip.

### Step 5 · Billing

- **Heading:** "When is the card billed?".
- **Paid from:**
  - The household's bank accounts that are not archived. Accounts at the card's own bank come first. Each shows its bank mark and account tail, as today. "An account not in the app" is last.
  - With no accounts at all, the field is replaced by one line: "Add your bank accounts on the Bank accounts screen to say which one pays this card."
  - There is no bank name field here any more. A card not through a bank that is paid from a household account keeps today's rule: `bank` takes that account's bank name, so older readers still read it right.
  - Picking an account sets the owner to its holder, unless the owner was changed by hand (decision 11).
- **Billing day:**
  - **Linked card:** the card's real days (`resolveCard(...).billingDays`, the bank's own when it has them, such as Discount's), headed "Usual for {{company}}". Then "Another day", which opens a 1–31 field.
  - **Unlinked card with a known company:** that company's catalog days, and the bank's if the bank is in the catalog.
  - **Otherwise:** today's `COMMON_BILLING_DAYS` (2, 10, 15).
  - No card has a single billing day, so the day is always a choice and never filled in for the person.
  - **Help:** "The day the bank pays the card each month. With it, your balance counts each purchase on the day the money really leaves the account."
- **Credit limit:** a shekel amount, optional.

### Step 6 · Fees and interest

- **Heading:** "What does the card charge?".
- **Linked card:**
  - Help: "Filled in from the published rates for this card. Change anything your statement says differently."
  - A short summary: card fee a month, foreign-currency fee, credit interest and late interest, each with its tag ("Published", "Up to", "Enter it from your statement").
  - A bank card's fee reads "Set by your bank", with a field, because the catalog holds no bank card fees.
  - "Change" opens the full existing `RateTable` in place, with its overrides, "Back to the catalog's rate", and the info buttons.
  - The fee discount fields show under the card fee, only when there is a fee, as today.
- **Unlinked card:**
  - Help: "Copy these from your statement or welcome letter. Leave out what you don't know."
  - Editable fields, as `CardFields` has them today: card fee a month (and its discount), foreign-currency fee, credit interest and late interest (prime + margin or fixed).
- **Catalog failed to load:** treated as unlinked.

### Step 7 · Review

- **Heading:** "Check and save".
- **Name** comes first: a text field holding the suggested name (section 4.2). Help: "How the card is shown across the app."
- **Then three groups, with the same sections as the edit summary:**
  - **The card:** company, bank, type and club, last 4, valid until, network, colour, and whose card it is.
  - **Billing:** paid from, billing day, credit limit.
  - **Fees and interest:** card fee, foreign-currency fee, credit and late interest.
- Each row shows its value, or "Not set". A value from a statement carries the "From your statement" tag (decision 7).
- Each group has "Change". It opens that group's first step, and that step's main button becomes "Back to review".
- A duplicate warning shows above Save when there is one (section 4.4).
- **Save** writes the card (section 4.6).

## 4. Rules across the steps

### 4.1 What is required

- Only a company choice (a catalog company, or Other) and a non-empty name are required.
- The name is suggested, so in practice only step 1 needs an answer. Save is enabled from the moment a company is picked and the name isn't empty.
- An empty draft after the company is valid: `cardFromDraft` requires nothing.

### 4.2 The suggested name

`suggestedName(state, language)` in `src/domain/card-flow.ts`:

- **Not through a bank:** `{company} {type} ·{last4}`, for example "Max Platinum ·1234".
- **Bank card:** `{company} · {bank} {type} ·{last4}`, for example "Max · Leumi Platinum ·1234".
- **The bank's short name:** the catalog names banks in full ("Bank Leumi", "בנק לאומי"). The name drops a leading "Bank " or "בנק ", so it reads "Leumi" or "לאומי". Other bank names are used as they are.
- **A club in place of the type:** when there is a club, its name stands where the type would. Cards with a club are known by it, as in "Isracard FLY CARD ·1234".
- **Missing parts are dropped** with their separators.
- **Company Other:** its typed name is used. With no name typed, "Credit card" (`cards:unknownIssuer`).
- **Last 4 digits:** "·1234" is wrapped in a left-to-right isolate (`⁦…⁩`), as the payment-method picker does, so it reads right in Hebrew.
- **Following the answers:** the name follows the answers until the person edits the field. After that it is theirs. Clearing the field by hand turns following back on.

### 4.3 Owner

- **Starts as:** the first person, or the only one.
- **Follows:** picking a paying account sets the owner to `account.profileId`, as `MethodForm.changeCard` does today, unless the person changed "Whose card?" by hand.
- **One-person household:** the field is hidden and the owner is that person.

### 4.4 Duplicates

- **When:** on review, a card is a duplicate when a live (not deleted, not archived) credit card has the same `issuer` and the same `lastDigits`.
- **Warning:** "You already have {{name}}.", with "Open it".
- "Open it" closes the flow, asking "Discard this card?" first, and opens that card's edit summary.
- Saving is never blocked: two cards can share their last 4 digits.

### 4.5 Closing

- **Before step 3** (on step 1 or 2), closing with ×, Escape or a tap outside just closes.
- **From step 3 on** it asks "Discard this card?" ("Nothing you entered is kept."), with "Discard" and "Keep going".
- In the import sheet, the same rule applies to leaving the card for the list.
- Nothing is written before Save. There are no drafts.

### 4.6 Saving

- **What is written:** one `createPaymentMethod` call with `type: 'credit_card'`, the name as `label`, the owner as `profileId`, the colour (when not the company's), `creditAnnualRate` and the `card` details from `cardFromDraft`. These are the same fields `MethodForm.save` writes today.
- **On success:** a toast "{{name}} added" (not from Smart import, which already shows its own), and the pop-out closes. Focus returns to "Add a card", or to the transaction's payment method field.
- **On failure:** the existing "Couldn't save" toast. The pop-out stays open on review with every answer.

## 5. Smart import

- **Fill view:** the import sheet's fill view (`MethodPanel`) hosts the flow's steps in place, instead of `MethodForm`.
  - The import sheet is already a sheet, so the flow doesn't open a second pop-out on top of it.
  - Its header becomes the flow's progress line and step heading.
  - The URL-driven move to the next unfinished card (`nextUnfinished`) works as today.
- **Prefill:** `editorSource` still builds the starting card from the document. The flow is seeded from it, and every value that came from the document is remembered as "from your statement".
- **Where it opens:** `firstOpenStep(state)` returns the first step, from step 1, whose question has no answer. The flow opens there. Next then jumps over steps the document answered, to the next open one, and ends on review. Back reaches every step.
- **Review:** values from the document carry "From your statement". Changing one removes its tag.
- **A document that updates one of the household's cards:** the fill view shows the **edit summary** (section 7) for that card, with the document's values applied and tagged. Save writes it as an update.
- **After Save:** the found row is linked to the saved card, the "saved" toast shows, and the next unfinished card opens, all as `import-sheet.tsx` does today.

## 6. From the transaction form

- **The new option:** `PaymentMethodField` gains a last option, "Add a card".
  - It is shown for expenses, in every mode where a credit card can be chosen.
  - It is never selected as a value. Choosing it opens the add flow over the transaction sheet.
  - The sheet stays open and keeps everything typed.
  - The pop-out is rendered outside the transaction `<form>`, as today's card sheet is, so its Save never submits the purchase.
- **On Save:**
  1. The pop-out closes.
  2. The transaction's `paymentMethodId` is set to the new card.
  3. `changeMethod` runs, so the deal falls back to one the card allows.
  4. `cardSaved` copies the card's rate into a credit plan as it does today.
  5. Focus returns to the payment method field.
- **Closing without saving** leaves the payment method as it was.
- **The credit plan's "open the card" link** (`onOpenCard`) opens the edit pop-out on the fees step. Saving there runs `cardSaved` as today.

## 7. Editing a card: the summary

- **Opened by:** "Edit card" opens the same pop-out on a **summary**. The card preview is at the top, with the name under it.
- **Rows:** the three groups and their rows, as review shows them (step 7), each with "Change".
  - **Name:** opens a one-field step.
  - **Which card** (company · bank · type · club): opens steps 1 to 3 in order, with the current answers selected, so unchanged steps take one tap each. Changing the company clears what no longer fits (step 1), and relinking asks "Keep the rates you entered?" when the card has overrides, as today. Choosing an escape unlinks the card. Its rates stay as its own fields.
  - **Your card:** opens step 4.
  - **Billing:** opens step 5.
  - **Fees and interest:** opens step 6.
- **Inside an opened step:**
  - There is no progress bar.
  - The buttons are Cancel and Save. Steps 1 and 2 of the "which card" chain show Next.
  - Save writes the change at once with `updatePaymentMethod`, keeping unknown card keys as `cardFromDraft` does, and returns to the summary.
  - Cancel, ×, or Escape with unsaved changes asks "Discard your changes?".
- **"Link to the catalog":** an unlinked card whose own fields name a catalog entry shows today's offer on the summary: "This looks like a {{issuer}} card through {{bank}}. Link it to fill in its real rates?".
  - "Link" links it, and opens step 3 when the type can't be told.
  - "Not now" hides the offer.
- **"Interest table" and the transaction form's "open the card"** open the pop-out straight on step 6, focused on the rate table, as `section="rates"` does today. Save or Cancel returns to the summary, and × closes the pop-out.
- **Archived cards:** "Edit card" on an archived card opens the same summary. A card already paid from an archived account keeps it, shown as "Archived". Other archived accounts are not offered.
- **What stays in the card menu:** archive, restore, transactions and import. The summary doesn't repeat them.

## 8. "Finish setting up"

- **On the card:** the card panel's "No billing day yet" line (`cards:noBillingDay`) gains a "Finish setting up" button. It opens that card's edit pop-out on step 5.
- **The notice:** `UnfinishedNotice kind="card"` also counts the household's live credit cards with no billing day.
  - It shows "1 card has no billing day yet." / "{{count}} cards have no billing day yet." under the Smart import line, with "Finish setting up".
  - With one such card, the button opens it on step 5. With several, it opens the first by name. The count updates as each is finished.
- **Smart import drafts** (`listUnfinished`) keep their own line and link, unchanged.

## 9. Data

### 9.1 One new optional field: `CardDetails.issuerName`

- **What it is:** the company name typed under "Other", at most 40 characters. It is set only when `issuer === 'other'`.
- **Where it is added:**
  - `CardDetails`;
  - `cardSchema` (`shortText.optional()`);
  - `DRAFT_KEYS` and `CardDraft` in `card-draft.ts`, as `issuerName: ''`.
- **Older builds:**
  - Their card edits keep keys they don't know (the `unknown` spread in `cardFromDraft`).
  - Sync stores the row as received.
  - An older build's file import strips the key, so the card arrives named by its label alone. Nothing breaks.

### 9.2 Nothing else changes

- `kind`, `bank`, `tier`, `club`, `network`, `catalog` and `overrides` keep their meaning.
- `bank` still holds a bank card's bank, or the paying account's bank for a card not through a bank.
- The flow writes exactly the fields `MethodForm` writes today.
- No enum gains a value, and there is no database version.

## 10. Code shape

- **`src/domain/card-flow.ts`** (pure, fully unit-tested):
  - `CardFlowState`: the `CardDraft`, plus the owner, colour, name, `nameEdited`, `ownerEdited`, the catalog selection (bank, issuer, tier, club, or an escape), and the set of fields from a statement.
  - `stepsFor(state, catalog?)`: the steps that apply.
  - `firstOpenStep(state, catalog?)`.
  - `banksFor(catalog, issuer)`.
  - `networksFor(issuer, tier)`: the fixed network, or the choices.
  - `billingDaysFor(state, resolved?, catalog?)`.
  - `suggestedName(state, language)`.
  - `duplicateOf(state, cards)`.
  - `asksToDiscard(step)`.
  - `stateFromMethod(method, prefill?)`, and `methodFromState(state, ctx)` (through `cardFromDraft`).
- **`src/features/cards/card-flow/`:**
  - `card-flow-dialog.tsx`: the pop-out, the progress bar, the motion and focus.
  - `card-flow.tsx`: the step machine, in add and edit modes, usable inline for Smart import.
  - `step-company.tsx`, `step-bank.tsx`, `step-type.tsx`, `step-card.tsx`, `step-billing.tsx`, `step-fees.tsx` and `step-review.tsx`.
  - `card-summary.tsx`: the edit summary, sharing its rows with review.
  - `choice-list.tsx`: the logo and choice tiles, with selection on activation (2.4).
  - `card-face.tsx`: moved out of `CardPanel`.
- **What goes away:**
  - `CardFields` (the component). Its `TextField`, `MoneyField` and `RateField` move to `card-flow/fields.tsx` for steps 4 to 6.
  - `IssuerChooser`. Its narrowing moves to the domain, its keep-rates dialog to `step-type.tsx`, and its catalog suggestion to `card-summary.tsx`.
  - `MethodEditor`'s `section` prop.
  - The `credit_card` branch in `MethodForm`.
- **What stays:** `RateTable`, `CardColorField`, `cardFromDraft`, `linkedDraft`, `cardFieldsForOverride`, `resolveCard`, `BankMark` and `BrandMark`.

## 11. Copy

All new strings live under `cards:flow.*`, except where noted. The Hebrew uses the plural address the app already uses ("הזינו", "בחרו"). Plurals have `_one`, `_two` and `_other`. The word "sync" is not used.

| Key                             | English                                                                                                                               | עברית                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `flow.step`                     | Step {{current}} of {{total}}                                                                                                         | שלב {{current}} מתוך {{total}}                                                                            |
| `flow.back`                     | Back                                                                                                                                  | חזרה                                                                                                      |
| `flow.next`                     | Next                                                                                                                                  | המשך                                                                                                      |
| `flow.skip`                     | Skip                                                                                                                                  | דילוג                                                                                                     |
| `flow.backToReview`             | Back to review                                                                                                                        | חזרה לסיכום                                                                                               |
| `flow.close`                    | Close                                                                                                                                 | סגירה                                                                                                     |
| `flow.company.title`            | Which company issued the card?                                                                                                        | איזו חברת אשראי הנפיקה את הכרטיס?                                                                         |
| `flow.company.hint`             | It's printed on the card and at the top of your statement.                                                                            | זה מודפס על הכרטיס ובראש דף הפירוט.                                                                       |
| `flow.company.otherName`        | Company name                                                                                                                          | שם החברה                                                                                                  |
| `flow.company.otherHint`        | As it appears on your statement.                                                                                                      | כמו שמופיע בדף הפירוט.                                                                                    |
| `flow.bank.title`               | Through which bank?                                                                                                                   | דרך איזה בנק?                                                                                             |
| `flow.bank.hint`                | A card through a bank comes with your bank account. If you got it straight from {{company}}, choose Not through a bank.               | כרטיס דרך בנק מגיע יחד עם חשבון הבנק. אם קיבלתם אותו ישירות מ{{company}}, בחרו ״לא דרך בנק״.              |
| `flow.bank.notListed`           | My bank isn't listed                                                                                                                  | הבנק שלי לא ברשימה                                                                                        |
| `flow.bank.name`                | Bank name                                                                                                                             | שם הבנק                                                                                                   |
| `flow.type.title`               | Which card is it?                                                                                                                     | איזה כרטיס זה?                                                                                            |
| `flow.type.clubHint`            | If the card belongs to a club, like FLY CARD, choose it. Its fees can differ.                                                         | אם הכרטיס שייך למועדון, כמו FLY CARD, בחרו אותו. העמלות שלו יכולות להיות שונות.                           |
| `flow.type.clubSearch`          | Search clubs                                                                                                                          | חיפוש מועדון                                                                                              |
| `flow.type.clubEmpty`           | No club by that name.                                                                                                                 | אין מועדון בשם הזה.                                                                                       |
| `flow.card.title`               | Your card                                                                                                                             | פרטי הכרטיס                                                                                               |
| `flow.card.hint`                | Only the last 4 digits are kept, never the rest of the number.                                                                        | נשמרות רק 4 הספרות האחרונות, אף פעם לא שאר המספר.                                                         |
| `flow.card.networkFixed`        | Network: {{network}}                                                                                                                  | מותג: {{network}}                                                                                         |
| `flow.card.owner`               | Whose card?                                                                                                                           | של מי הכרטיס?                                                                                             |
| `flow.billing.title`            | When is the card billed?                                                                                                              | מתי הכרטיס מחויב?                                                                                         |
| `flow.billing.dayHint`          | The day the bank pays the card each month. With it, your balance counts each purchase on the day the money really leaves the account. | היום שבו הבנק משלם את הכרטיס בכל חודש. כשהוא מוגדר, היתרה סופרת כל קנייה ביום שבו הכסף באמת יורד מהחשבון. |
| `flow.billing.usual`            | Usual for {{company}}                                                                                                                 | המועדים של {{company}}                                                                                    |
| `flow.billing.notInApp`         | An account not in the app                                                                                                             | חשבון שלא באפליקציה                                                                                       |
| `flow.billing.noAccounts`       | Add your bank accounts on the Bank accounts screen to say which one pays this card.                                                   | הוסיפו את חשבונות הבנק במסך ״חשבונות בנק״ כדי לציין מאיזה חשבון משולם הכרטיס.                             |
| `flow.fees.title`               | What does the card charge?                                                                                                            | כמה הכרטיס גובה?                                                                                          |
| `flow.fees.linkedHint`          | Filled in from the published rates for this card. Change anything your statement says differently.                                    | מולא לפי התעריפים שפורסמו לכרטיס הזה. אפשר לשנות כל מה שבדף הפירוט כתוב אחרת.                             |
| `flow.fees.manualHint`          | Copy these from your statement or welcome letter. Leave out what you don't know.                                                      | העתיקו אותם מדף הפירוט או ממכתב הצירוף. מה שלא ידוע אפשר להשאיר ריק.                                      |
| `flow.fees.bankFee`             | Set by your bank                                                                                                                      | נקבע על ידי הבנק                                                                                          |
| `flow.fees.seeAll`              | See all rates and change them                                                                                                         | כל הריביות, ואפשרות לשנות                                                                                 |
| `flow.review.title`             | Check and save                                                                                                                        | בדיקה ושמירה                                                                                              |
| `flow.review.name`              | Name                                                                                                                                  | שם                                                                                                        |
| `flow.review.nameHint`          | How the card is shown across the app.                                                                                                 | כך הכרטיס יוצג בכל האפליקציה.                                                                             |
| `flow.review.notSet`            | Not set                                                                                                                               | לא הוגדר                                                                                                  |
| `flow.review.change`            | Change                                                                                                                                | שינוי                                                                                                     |
| `flow.review.duplicate`         | You already have {{name}}.                                                                                                            | {{name}} כבר קיים אצלכם.                                                                                  |
| `flow.review.openIt`            | Open it                                                                                                                               | לפתוח אותו                                                                                                |
| `flow.discard.title`            | Discard this card?                                                                                                                    | לוותר על הכרטיס?                                                                                          |
| `flow.discard.body`             | Nothing you entered is kept.                                                                                                          | שום דבר ממה שהזנתם לא יישמר.                                                                              |
| `flow.discard.confirm`          | Discard                                                                                                                               | לוותר                                                                                                     |
| `flow.discard.keep`             | Keep going                                                                                                                            | להמשיך                                                                                                    |
| `flow.discardChanges.title`     | Discard your changes?                                                                                                                 | לבטל את השינויים?                                                                                         |
| `flow.added`                    | {{name}} added                                                                                                                        | {{name}} נוסף                                                                                             |
| `flow.finishSetup`              | Finish setting up                                                                                                                     | להשלמת ההגדרה                                                                                             |
| `unfinished.noBillingDay_one`   | 1 card has no billing day yet.                                                                                                        | לכרטיס אחד עוד אין מועד חיוב.                                                                             |
| `unfinished.noBillingDay_two`   | (Hebrew only)                                                                                                                         | לשני כרטיסים עוד אין מועד חיוב.                                                                           |
| `unfinished.noBillingDay_other` | {{count}} cards have no billing day yet.                                                                                              | ל־{{count}} כרטיסים עוד אין מועד חיוב.                                                                    |

**Reused as they are:**

- `cards:add`, `cards:issuer.*`, `cards:network.*`, `cards:catalog.noBank`, `catalog.notListed`, `catalog.tier`, `catalog.club`, `catalog.noClub`, `catalog.loading`, `catalog.loadFailed`, `catalog.suggest`, `catalog.link`, `catalog.notNow` and `catalog.keep*`;
- `cards:edit.*` field labels and hints, `cards:color.*`, `cards:rates.*`, `cards:cardMenu.edit`;
- `cards:edit.theCard`, `edit.billing` and `edit.charges` as the summary's section names;
- `categories:manage.methodShared`, `common:action.save` and `common:action.cancel`.

**Removed** with the old form: `cards:edit.issuer` ("Card company (manual)"), `edit.kind` ("Issued by"), `edit.bankOfCard`, `edit.bankDebited`, `edit.debitedOther`, `catalog.title` ("Who issues this card") and `catalog.pending`. Before removing a key, the plan checks for other readers.

`gate:pci` scans the i18n JSON too. None of these strings names a card number, a code or a full expiry. "Valid until" is the existing month-and-year field.

## 12. Accessibility, keyboard and RTL

- **Focus on each step:** each step's heading is an `h2` with `tabIndex={-1}`. On every step change, focus moves to it.
- **Announcing the step:** "Step 3 of 7" is a visible line linked to the heading by `aria-describedby`, so a screen reader reads "Which card is it? Step 3 of 7" as focus lands. The progress bar is `aria-hidden`, because the line says the same.
- **The pop-out's name and description:** the dialog is named by the flow title ("Add a card" or "Edit card"). Its description is the current step's line.
- **Choice lists:**
  - Each is a `radiogroup` named by the step heading.
  - Arrow keys move focus, and Enter, Space or a tap choose (2.4).
  - In Hebrew, the arrow keys follow the reading direction.
  - A choice that moves on announces nothing extra, because the next heading takes focus.
- **Errors:** an error is shown at its field, linked with `aria-describedby`, and the field is focused (`aria-invalid`).
- **Touch targets:** every tile, chip, swatch and button is at least 44 by 44 px. The colour swatches grow from today's 36 px height to 44.
- **Footer and close button:** the footer buttons are `h-11`, and the close button is `size-11`.
- **Escape:** closes the pop-out under the discard rule (4.5). Inside a confirm dialog, Escape only closes that dialog.
- **RTL:**
  - Logical properties only (`gate:rtl`).
  - Back and Next arrows are mirrored in Hebrew.
  - Numbers and "·1234" are left-to-right isolates.
  - Logos are never mirrored.
- **Phone fit:** every step fits a 320 px phone in Hebrew without sideways scrolling. Long bank and club names wrap.

## 13. Edge cases

| Situation                                                        | Behaviour                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The catalog fails to load                                        | Step 1 works, since the companies are constants. Step 2 offers "Not through a bank" and a bank name field. Step 3 is free text. Step 6 is editable fields. The card saves unlinked. It can be linked later from the summary's offer. |
| The catalog is still loading at step 2                           | "Loading the card list…" with the two plain choices. The banks appear when it loads, and nothing chosen is lost.                                                                                                                     |
| A company with no clubs (Amex has 2 and Diners 2, so today none) | The club part never shows, and picking a type moves on.                                                                                                                                                                              |
| A company with exactly one type                                  | Step 3 is skipped, the type is set, and the total drops to 6.                                                                                                                                                                        |
| Company Other                                                    | The card is unlinked. Every bank is offered, the type is free text, all five networks are offered, and the billing days are 2 / 10 / 15. The name uses the typed company name.                                                       |
| Changing the company after later steps                           | Answers that no longer fit are cleared. Answers that still fit stay. The name keeps following unless edited.                                                                                                                         |
| Archived bank accounts                                           | Not offered as "Paid from". A card already paid from one shows it, marked "Archived".                                                                                                                                                |
| An account deleted on another device while the flow is open      | It drops out of the list. If it was picked, the choice clears to none and the owner stays.                                                                                                                                           |
| Editing a linked card that has overrides                         | Changing the company, the bank or the type asks "Keep the rates you entered?" before anything changes, as today.                                                                                                                     |
| Editing a linked card into an escape                             | It unlinks. The rates the catalog filled stay as the card's own fields.                                                                                                                                                              |
| A one-person household                                           | "Whose card?" is hidden, and the owner is that person.                                                                                                                                                                               |
| Same company and last 4 as an archived card                      | No warning, because only live cards count.                                                                                                                                                                                           |
| Smart import found everything                                    | The flow opens on review with every value tagged "From your statement".                                                                                                                                                              |
| Smart import found a bank or type the catalog doesn't know       | It goes into the escape fields ("My bank isn't listed" with the name, or "Not in the list" with the type), tagged as from the statement.                                                                                             |
| The pop-out is open when the language changes in another tab     | Copy follows the language. A name that is still following is re-suggested in the new language. An edited name stays.                                                                                                                 |
| Save fails                                                       | A toast. The pop-out stays on review with everything.                                                                                                                                                                                |
| A transaction sheet opened for an edit (not a new purchase)      | "Add a card" is offered all the same. Saving selects the new card on the transaction being edited.                                                                                                                                   |

## 14. Tests

### 14.1 Domain (`card-flow.test.ts`)

- `stepsFor`:
  - all seven steps;
  - step 3 dropped with one type and no clubs;
  - the club part only with clubs;
  - Other.
- `firstOpenStep`:
  - an empty card → step 1;
  - company and last 4 known → step 2;
  - everything but the billing day → step 5;
  - everything → review.
- `banksFor`: each company, from the catalog's own data. Every bank returned issues that company.
- `networksFor`:
  - Amex is fixed;
  - Diners is fixed, and the Diners Mastercard type gives Mastercard;
  - Isracard, Cal, Max and Other offer their sets.
- `billingDaysFor`: a linked bank card at Discount gives the bank's days; a linked non-bank card gives the company's; an unlinked card with a company; nothing known gives 2 / 10 / 15.
- `suggestedName`:
  - a non-bank card, a bank card, a club in place of the type;
  - no last 4, Other with and without a typed name;
  - Hebrew;
  - the isolate around "·1234";
  - following until edited, and following again after clearing.
- **Owner:** follows the account until touched; one-person household.
- `duplicateOf`: same company and digits; another company; archived; deleted.
- **Discarding:** steps 1–2 close without asking, steps 3–7 ask.
- `methodFromState`: writes exactly what `MethodForm` wrote for the same answers, including the `issuerName` round trip and unknown keys kept on an edit.

### 14.2 Schema

- `issuerName` passes `cardSchema` and the export/import round trip.
- A card without it still passes.

### 14.3 DOM (new: `card-flow.test.tsx`, `card-summary.test.tsx`, `choice-list.test.tsx`)

- **Moving between steps:**
  - one tap moves on;
  - arrow keys move focus without choosing or moving on;
  - Enter chooses and moves on.
- **Skip and Next:** Skip becomes Next once something is answered. Next with an unreadable field focuses it and stays.
- **Focus:** lands on each step's heading, and the "Step N of 7" description is read with it.
- **Escapes:** Other, "My bank isn't listed" and "Not in the list" each show their field on the same step, and step 6 shows editable fields.
- **Linking:** linking at step 3 shows the real billing days on step 5 and the published rates on step 6.
- **The keep-rates question** when the type changes after an override.
- **Review:** "Not set", "From your statement", the duplicate warning and "Open it", and the name following and then edited.
- **Closing:** before step 3 it doesn't ask, and from step 3 it does.
- **The catalog fails:** the manual path all the way to Save.
- **The summary:**
  - each row opens only its step;
  - Save writes and returns;
  - Cancel with changes asks;
  - the "Link to the catalog" offer;
  - opening on the fees step from "Interest table".
- **The nudge:** "Finish setting up" on a card without a billing day opens step 5. The notice counts such cards.

### 14.4 Existing tests that change

| File                                                  | Change                                                                                                                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/cards/method-editor.test.tsx`           | Credit-card cases (the "Label" field, the "Bank" and "Card company" radiogroups, "Network", "Save") move to `card-flow.test.tsx`. The rest asserts that the Type switch has no "Credit card".       |
| `src/features/cards/cards-screen-menu.test.tsx`       | "Edit card" opens the summary. "Interest table" opens the fees step with the rate table focused, not the sheet's `[data-section="rates"]`.                                                          |
| `src/features/cards/card-menu.test.tsx`               | Only where it follows an action into the editor's heading.                                                                                                                                          |
| `src/features/cards/card-fields-rates.test.tsx`       | Becomes `step-fees.test.tsx`: the same rate and override cases through step 6 (`rate-<kind>` test ids kept).                                                                                        |
| `src/features/cards/issuer-chooser.test.tsx`          | Replaced. Narrowing goes to the domain tests and `step-bank` / `step-type` tests, the keep-rates question to `step-type`, and "Who issues this card" and the suggestion to `card-summary.test.tsx`. |
| `src/features/cards/rate-table.test.tsx`              | Only the cases that render it through `CardFields`. They render it through step 6 instead.                                                                                                          |
| `src/features/cards/unfinished-notice.test.tsx`       | Adds the no-billing-day count and its link.                                                                                                                                                         |
| `src/features/import/import-sheet.test.tsx`           | Finishing a found card opens at the first missing step, the tags show on review, and Save moves to the next unfinished card. An update to a known card shows the summary.                           |
| `src/features/transaction/transaction-sheet.test.tsx` | "Add a card" in the picker opens the flow over the form. Save selects the card and copies its rate into a credit plan. "Open the card" opens the fees step.                                         |
| `e2e/14-cards.spec.ts`                                | The add path goes through the steps. The account offered to a new card moves to step 5. The 320 px logos test covers the company and bank steps.                                                    |
| `e2e/card-catalog.spec.ts`                            | "Max through Mizrahi, International" goes in steps 1 to 3. The rates are checked on step 6 and again after saving.                                                                                  |
| `e2e/02-transaction-type.spec.ts`                     | Wherever it creates a card through the old form.                                                                                                                                                    |

### 14.5 Browser (en and he)

- **Add a card:** Max · Leumi · Platinum · 1234, Visa, billing day 10, paid from a household account. The name suggestion should read "Max · Leumi Platinum ·1234" ("מקס · לאומי פלטינום ·1234" in Hebrew). Save, and the card appears with its next bill on the 10th.
- **Keyboard only:** the same path, checking focus on each heading.
- **Discard:** at step 4.
- **Add a card from the transaction form,** then a קרדיט plan picks up its rate.
- **Smart import:** a statement with no billing day opens on step 5.
- **Axe:** with each step open, the summary open, and both confirm dialogs open.
- **Every new control at 44 px.**
- **Each step at 320 px in Hebrew,** with no sideways scroll.
- **Reduced motion:** steps change instantly.

## 15. Build order

1. The domain module, `issuerName`, and their tests. These can land at any time.
2. The app-wide colourful redesign sets the new tokens and fonts.
3. Then the screens: the pop-out, the steps, the summary, the callers, and then removing `CardFields` and `IssuerChooser`.
   - The screens use only tokens. Anything the redesign gives cards (a card-face style, a tile style) is used as it lands, not copied ahead of it.
   - The screenshot matrix (`e2e/screens.spec.ts`) gains the add flow and the summary once they are built.

## 16. Out of scope

- The bank account flow and the other method types' form. They keep `MethodForm` for now, minus "Credit card" in its Type switch.
- Turning an existing method of another type into a credit card, or a credit card into another type.
- Drafts or resuming a half-added card. Closing discards it (decision 14).
- Inferring the network beyond decision 10, for example from the type's name or from the last 4 digits.
- Bank card fees in the catalog. A bank card's fee stays "Set by your bank", with a field.
- Asking which bank a card not through a bank is paid from, when the account isn't in the app.
- Archive or delete from the summary. The card menu has them.
