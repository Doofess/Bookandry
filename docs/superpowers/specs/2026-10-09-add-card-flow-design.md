# Add a card, step by step: design

**Status:** Design approved in chat on 2026-10-09; amended 2026-10-10 for card kinds and the Cards restructure; awaits review.

**Asked for by the user on 2026-10-09:**

> "the add card menu is awful ux/ui, i want a strong redesign, instead of a big amount of options thrown at the user at once make it so its a popout window that walks the user step by step towrads adding a credit card. also fix the logic behind it e.g order of the steps and etc. also right now it asks for the company step twice, look into that"

Later, on a step-by-step flow like other fintech apps: "yes like many other fintech companies out there i like that".

**The amendment, asked for by the user on 2026-10-09 at 23:44–23:45:**

> "it shouldn't be classified as other way to pay, remove that part of Credit card entirely, cash and cheques are hardcoded parts of the app. debit cards are a type of card so lets call the main menu 'Cards' and credit cards and also debit cards or other gift cards, or manual loading cards 'כרטיס נטען' are going to be under 'Cards'"

Then, from the payment-method picker, the user chose:

- Bank transfer, standing order, digital wallet (Bit / PayBox) and "Other" become **built-in** "Paid with" choices, like cash and cheques.
- There is nothing to create or manage for them.
- Existing rows of those types that the person made keep working, and stay selectable on the transactions that already use them.

**Facts** for debit, prepaid and gift cards come from the research note `docs/research/2026-10-09-israeli-debit-cards.md` (branch `research`, commit d266bc0). This spec follows it, and cites its sections as "research §n".

## Why the form asks for the company twice

The editor shows two separate ways to say which card it is, at the same time.

- **`IssuerChooser`** ("Who issues this card") asks from the catalog: bank, then card company, then card type, then club.
- **`CardFields`** asks the same things by hand: "Card company (manual)", "Issued by: bank / non-bank", "Bank (manual)" or "Charged to the account at", and "Card type (manual)".
- The manual fields hide only once a card type links the card. Until then both are on screen.

So the company, the bank and the type are each asked twice, and the bank up to four ways: the catalog bank, "Issued by", the manual bank, and "Paid from". On the Cards screen the editor also opens with a 7-way payment-method Type switch above all of it.

The fix is not to hide one of the two. Each question is asked once, in one place, in an order where each answer narrows the next.

## Why debit cards were empty

A debit card was saved as a label and an owner, and nothing more (research §4.1).

- `MethodForm` writes `card` only when the type is `credit_card`.
- Debit cards lived under "Other ways to pay" (`OtherMethods`), next to wallets and transfers.
- Prepaid and gift cards had no type at all.

So the amendment makes every card a card: one flow, one screen, and details for each kind.

## Decisions the user made

1. **Scope.** The step-by-step flow is used for **adding** a card of any kind everywhere: the Cards screen, Smart import, and a new card from the transaction form. **Editing** an existing card becomes a summary page with a section for each group of its details. Tapping a section opens only that step. The "Interest table" deep link opens the fees step of a credit card. Bank accounts keep their current form for now.
2. **Container.** A centred pop-out window on desktop, a full-height sheet on a phone. It has a progress bar and Back / Next. A step answered by one tap moves on by itself.
3. **Company first.** For a credit card, Isracard / Cal / Max / Amex / Diners / Other, as logos. Then "Through which bank?", narrowed to that company's banks, plus "Not through a bank".
4. **The steps.** Step 1 is always "What kind of card?" (decision 16). A credit card then has:
   1. What kind of card?
   2. Card company
   3. Bank (or not through a bank)
   4. Card type and club. Skipped when the company has only one type. The club part shows only if the company has clubs.
   5. Your card: last 4 digits, valid until, network, colour, and whose card it is
   6. Billing: the paying account, the billing day (the company's real billing days first), the credit limit
   7. Fees and interest: from the catalog, shown as a summary with "Change". An unlinked card gets editable fee, foreign-currency and rate fields.
   8. Review, then Save

   The old "Issued by" question goes away, because step 3 answers it. "Bank (manual)" appears only behind "My bank isn't listed". Debit, prepaid and gift cards have their own, shorter paths (section 3).

5. **What is required.** Only the kind, a name, and for a credit card the company (or Other). Every later step has Skip. A skipped answer shows "Not set" on review. The billing-day step says it is what makes the monthly balance right. A card without a billing day gets a "Finish setting up" nudge, reusing and extending the unfinished notice.
6. **Every kind, no type switch.** "Add a card" offers all four kinds: credit, debit, prepaid (כרטיס נטען) and gift. The 7-way payment-method Type switch stays gone. A card is only ever added through the flow, and a bank account through its own form. Nothing else is created by hand any more (decision 18).
7. **Smart import.** Steps the document already answered are skipped, and the flow opens at the first one it didn't. Review marks those values "From your statement". Back still reaches the skipped steps.
8. **From the transaction form.** The pop-out opens over the transaction. On Save it closes, the transaction comes back with the new card selected, and a credit card's rate is copied into a credit plan as today.
9. **"Not in the list" escapes.**
   - Company "Other" → a company name field.
   - Bank "My bank isn't listed" → a bank name field.
   - Type "Not in the list" → a free-text type.

   Any escape makes the card unlinked, so the fees step shows editable fields. Each escape is a text field on the same step, never a new step.

10. **Network.** Amex is set and not asked. Diners is set, except for the Diners Mastercard type. Isracard, Cal and Max ask it, as one row of logos in the "Your card" step.
11. **Owner.** "Whose card?" in the "Your card" step defaults to the first person. Picking an account (a credit card's paying account, a debit card's account, or a prepaid card's loading account or card) makes the owner that account's holder, unless the owner was changed by hand. It is hidden in a one-person household.
12. **Name.** Suggested from the answers: "Max Platinum ·1234", and for a bank card "Max · Leumi Platinum ·1234". It is shown and editable on review. It follows the answers until the person edits it. Section 4.2 gives each kind's pattern.
13. **Duplicates.** The same kind, company and last 4 digits as a live card: review warns "You already have Max ·1234" with "Open it". It does not block saving.
14. **Closing.** On the first three screens, closing just closes. From the fourth screen on it asks "Discard this card?". Nothing is saved until Save. There are no drafts.
15. **Build order.** The design is settled now. The screens are built **after** the app-wide colourful redesign, which is in progress separately, sets the new colours and fonts. All styling here uses tokens, and the visual layer follows that redesign.

### Decisions from the amendment (2026-10-09 and 2026-10-10)

The user made decisions 16 to 18. The user asked Claude to take its recommended answers to the research's open questions, which are decisions 19 to 24.

16. **Kind first.** The flow's first step is "What kind of card?": Credit / Debit / Prepaid (נטען) / Gift. Each kind then has its own path (section 3). Picking a catalog type that is really debit or prepaid switches the kind, with a short notice (section 3.5).
17. **One Cards screen.** The screen and the menu are called "Cards". It lists every kind, grouped by kind. The "Other ways to pay" section (`OtherMethods`) is removed (section 9).
18. **Six built-in ways to pay.** Cash, Cheque, Bank transfer, Standing order, Bit / PayBox and Other are part of the app, like cash and cheques today. Nobody creates, renames or deletes them. The new four are seeded rows with fixed ids (section 10).
19. **How the kinds are stored.** Debit, prepaid and gift cards are `type: 'debit_card'` with a new open-string `card.funding`: `'debit'`, `'prepaid'` or `'gift'`. No new `PaymentMethodType` (research §5.7).
20. **Open `type`.** In the same release, `paymentMethodSchema.type` accepts unknown strings, read as "Other", so a future type can't make this build drop rows (section 13.4).
21. **A gift card is not counted in the balance.** Its value came from outside the household. Spending with it is recorded and shows in the categories, but does not lower the balance (section 11).
22. **Debit spending limits are not stored.** They are set by the bank, change "מעת לעת", and no figure uses them (research §2.2).
23. **Never a voucher code or PIN.** A gift card's code, barcode or PIN spends it, so it is never asked for or kept. `gate:pci` gains the names `voucher_code`, `gift_code` and `redeem_code` (section 13.2). Every rule `gate:pci` enforces applies to every kind.
24. **Prepaid and gift balances are pots.** Like the cash pot, a card's balance is not a field. It is a start amount, plus moves, minus spending with the card. This spec ships the table, the start amount from the flow, and the figure. Loading, unloading and recounting are a follow-up, "Card pots", with its boundary in section 12.

## 1. Where the flow is used

| Caller                                                 | Today                                             | After                                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Cards screen, "Add a card"                             | `MethodEditor` with `newType="credit_card"`       | The add flow in the pop-out, opening on "What kind of card?".                                                               |
| Cards screen, card menu "Edit card"                    | `MethodEditor` on the card                        | The edit summary in the pop-out, for every kind.                                                                            |
| Cards screen, card menu "Interest table"               | `MethodEditor` with `section="rates"`             | Credit cards only. The edit pop-out opened straight on the fees step, with the rate table focused.                          |
| Cards screen, a card's "No billing day yet" line       | Text only                                         | Gains "Finish setting up", which opens the edit pop-out on the billing step (section 8).                                    |
| Cards screen, a debit card with no account             | Not possible: a debit card had no details         | "Finish setting up" opens the edit pop-out on the account step (section 8).                                                 |
| Smart import, a found card to finish                   | `MethodPanel` → `MethodForm` with a prefill       | The add flow inside the import sheet, opened at the first unanswered step (section 5).                                      |
| Smart import, a found card that updates one we have    | `MethodPanel` → `MethodForm` on the existing card | The edit summary inside the import sheet, with the document's values marked (section 5).                                    |
| Transaction form, payment method picker                | No way to add a card                              | A new last option, "Add a card", opens the add flow over the transaction (section 6). The list itself changes (section 10). |
| Transaction form, a credit plan's "open the card" link | A sheet with `MethodForm` on the card             | The edit pop-out on the fees step, as "Interest table" does.                                                                |
| "Other ways to pay" (`OtherMethods`)                   | `MethodEditor` with `newType="debit_card"`        | **Removed** (section 9.3). Debit cards move to the Cards list. The other types become built-ins (section 10).               |
| Bank accounts screen                                   | `MethodEditor` with `newType="bank_account"`      | Unchanged, except the Type switch is gone: the form edits bank accounts only.                                               |

`MethodForm` stays for bank accounts only. It loses its Type switch, the `TYPES` list, the `credit_card` branch, `CardFields` and `CardColorField`. Nothing can be turned into a card from that form, and a card is only ever added through the flow.

## 2. The pop-out

### 2.1 One component, two shapes

- `CardFlowDialog` uses the existing Base UI dialog (`src/components/ui/dialog.tsx`). That gives a modal with a focus trap, an inert page behind it, Escape to close, and focus returned to the button that opened it.
- **Desktop (from `sm`):** centred, up to 1140 by 732 px, using the `PopOut` shell from the Colour of money spec (section 6.2, branch `colour-of-money`).
  - Below 720 px wide it is one pane, laid out as 2.2.
  - From 720 px the steps sit beside the body.
  - From 1040 px a live card preview sits on the far side.
  - The step body scrolls inside; the header and footer stay put.
- **Phone (below `sm`):** the same popup fills the screen (`inset-0`, `h-dvh`), with the footer above the safe area (`env(safe-area-inset-bottom)`).
- It is one popup with responsive classes, not a dialog on desktop and a sheet on phones. Rotating a tablet or resizing a window never loses the answers.

### 2.2 Layout of every step

From top to bottom:

1. **Header:** a close button (×), the progress bar, and "Step 4 of 8".
2. **Card preview:** from step 2 on, a small card face shows the answers so far: the kind, the company mark, the bank, the type, "·1234" and the colour. It is the face the Cards screen draws, moved out of `CardPanel` into a `CardFace` component that both use.
3. **The step's heading,** a question (for example "Which company issued the card?"), with one line of help under it.
4. **The step's controls.**
5. **Footer:** Back (not on step 1), and the step's main button: Next, Skip or Save.

### 2.3 Progress

- It reuses `Progress` from `src/components/ui/progress.tsx`, as first run does.
- It sets `max` to the number of steps and `value` to the current step, so no percentage is computed. That keeps `gate:money` clean without first run's percent table.
- The total is the steps that apply to this card:

  | Kind    | Steps | Fewer when                                                       |
  | ------- | ----- | ---------------------------------------------------------------- |
  | Credit  | 8     | 7, when the company has only one type and no clubs.              |
  | Debit   | 6     | Never.                                                           |
  | Prepaid | 7     | 6, when the company has only one prepaid type and no such clubs. |
  | Gift    | 5     | Never.                                                           |

- Until a kind is picked, the line reads "Step 1 of 8", the longest path. When the kind changes, the bar uses the new total.
- Steps skipped because Smart import answered them still count, because Back can reach them.

### 2.4 Moving between steps

- **One-tap steps move on by themselves:**
  - "What kind of card?", every kind;
  - a credit card's company (any but Other), bank (any but "My bank isn't listed"), and type, when the company has no clubs, or on picking the club;
  - a debit card's account (any but "An account not in the app"), and its type, or the company when it has exactly one debit type;
  - a prepaid card's company (any but Other) and type;
  - a gift card's issuer (any but Other).
  - The flow moves on about 150 ms after the choice shows as selected, so the person sees what they picked.
  - Coming back to a one-tap step and tapping the same answer moves on again.
- **Arrow keys never move on.** In these choice lists, the arrow keys move focus, and only Enter, Space or a tap chooses. Otherwise a keyboard user would be carried off the step by the first arrow press. Today's `Segmented` selects on arrow keys, so the flow's choice lists use a radio group where selection follows activation, not focus.
- **Next, Skip and Save:**
  - Step 1 (the kind) and a credit card's step 2 (the company) have no Skip, because they are required.
  - Every other step before review shows **Skip** while nothing on the step is answered, and **Next** once something is.
  - Skip leaves the step's answers empty. It never clears answers that are already there, so a value from a statement is never lost by pressing it.
  - Pressing Next with a field that can't be read (say "13/28" as the expiry) shows the error at that field and focuses it. The flow stays on that step.
  - Review shows **Save**.
- **Back** goes to the previous step that applies, including steps skipped because Smart import answered them.

### 2.5 Motion

- **Between steps:** the existing `morph()` helper (`src/features/account/morph.ts`) runs each step change as a view transition. The step body slides in the reading direction: forward comes in from the inline end, so in Hebrew it comes from the left. The header, progress bar and card preview carry `view-transition-name`s so they stay in place while the body changes.
- **Opening:** the popup's opening uses `@starting-style` (Tailwind's `starting:` variant), the same way Base UI's `data-starting-style` works today: a short fade and rise, with no JavaScript timing.
- **Less motion:** with `prefers-reduced-motion: reduce`, `morph()` already changes instantly, and the global rule in `index.css` already shortens transitions.
- **No support:** where the browser has no view transitions, the step just changes.

### 2.6 Layout inside the pop-out

- The step body is a size container (`@container`). Its grids follow the pop-out's width, not the screen's. For example, the company tiles are 1 across in a narrow pop-out and 2 across from 440 px. The same step then lays out right inside the import sheet and on a phone.
- Only logical properties are used (`ms-`, `pe-`, `start-`), as `gate:rtl` requires.
- Every colour, radius and shadow is a token: `--popover`, `--primary`, `--accent`, `--border`, `--muted-foreground` and so on. No colour is written into the flow. The colourful redesign changes the tokens, and the flow follows. Section 19 has the build order.

## 3. The steps

The flow keeps its answers in one `CardFlowState` (section 14). Everything a step shows is worked out from that state by pure functions in `src/domain/card-flow.ts`.

The catalog starts loading (`loadCatalog()`, a dynamic import) the moment the pop-out opens, so it is usually ready by step 3. Steps 1 and 2 never wait for it, because the kinds and the companies are app constants, not catalog data.

### Step 1 · What kind of card?

- **Heading:** "What kind of card?". Help: "It's printed on the card. A debit or prepaid card says so on its face." Directive 470 §18 makes that mark compulsory (research §1.1).
- **Choices:** four large tiles, each with one line under it:
  - **Credit** · "Billed once a month";
  - **Debit** · "Taken from your bank account right away";
  - **Prepaid** · "You load money onto it";
  - **Gift** · "A gift card or voucher with money on it".
- One tap moves on, to step 2 of that kind's path.
- **Changing the kind later** keeps every answer the new kind also asks (the company, the last 4, the expiry, the colour, the owner, the name while it follows). Answers the new kind doesn't ask are kept in the state but not saved, so going back to the first kind brings them back.
- **From the transaction form in a credit-only mode** (קרדיט, קרדיט פלוס, 30+), this step is answered as Credit and skipped. Back still reaches it.

### 3.1 Credit card: steps 2 to 8

#### Step 2 · Card company

- **Heading:** "Which company issued the card?". Help: "It's printed on the card and at the top of your statement."
- **Choices:** Isracard, Cal, Max, American Express, Diners and Other. Each is a large tile in the company's colour with its name (Colour of money spec, 6.4), and Other is an outlined tile.
- **Other:** shows a "Company name" field on the same step, with Next. The name is optional. The card is unlinked.
- Changing the company after later steps were answered clears the answers that no longer fit: a bank that doesn't issue that company, the type, the club, and a network that company doesn't use. Answers that still fit stay.

#### Step 3 · Bank

- **Heading:** "Through which bank?". Help: "A card through a bank comes with your bank account. If you got it straight from {{company}}, choose Not through a bank."
- **Choices:** "Not through a bank" first, then the banks that issue this company (`catalog.banks.filter(b => b.issuers.includes(company))`), each with its `BankMark`, then "My bank isn't listed".
- **Company Other:** every catalog bank is offered. Choosing one only records the bank's name and that it is a bank card. The card stays unlinked.
- **"My bank isn't listed":** shows a "Bank name" field on the same step. The card is unlinked.
- **What it sets:** "Not through a bank" sets `kind: 'non_bank'`. Any bank sets `kind: 'bank'` and `bank` to the bank's name in the current language. This answers the old "Issued by" question, which is gone.
- **Catalog still loading:** "Loading the card list…" with the two plain choices, "Not through a bank" and "My bank isn't listed". **Catalog failed to load:** the existing "Couldn't load the card list" message and the same two choices. Either way, the person is never stuck.

#### Step 4 · Card type and club

- **Heading:** "Which card is it?".
- **Type:** the company's issued types (`tiersOf`), plus "Not in the list".
  - A type the catalog marks as debit or prepaid carries a small tag, "Debit" or "Prepaid". Picking it switches the kind (section 3.5).
  - "Not in the list" shows a "Card type" text field and an optional "Club" text field. The card is unlinked.
- **Club:** only when the company has issued clubs (`clubsOf`). It appears under the type once a type is picked.
  - "No club" comes first.
  - With more than 8 clubs (Isracard 19, Cal 16, Max 33), the list can be searched, using the same `Command` pattern as `BankSelect`.
  - A club the catalog marks as prepaid (MyCal, MyMAX, קרנות PRE-PAID) carries the "Prepaid" tag, and picking it switches the kind.
  - Picking a club, or "No club", moves on.
- **Skipped:** when the company has exactly one issued type and no clubs. The type is then set without asking.
- **Company Other, or the catalog failed:** this step shows only the free-text type and club fields, with Skip.
- **Linking:** once the company, the bank and a catalog type are known, the card is linked (`linkedDraft`). The catalog fills the foreign-currency fee, the card fee (not through a bank only), the credit margin and the late rate. Steps 6 and 7 then show the real billing days and rates.
  - If the person comes back and changes the company, the bank or the type after changing a rate on step 7, the existing "Keep the rates you entered?" question is asked first.

#### Step 5 · Your card

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
     - Nothing else is guessed. Section 20 covers network inference.
  4. **Card colour:** the existing swatches (`CardColorField`). "The card company's colour" is first and is the default.
  5. **Whose card?:** each person, then "Shared". It defaults to the first person, is hidden in a one-person household, and follows the paying account (step 6) until changed by hand.
- Every field is optional, and the step has Skip.

#### Step 6 · Billing

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

#### Step 7 · Fees and interest

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

#### Step 8 · Review

- **Heading:** "Check and save".
- **Name** comes first: a text field holding the suggested name (section 4.2). Help: "How the card is shown across the app."
- **Then three groups, with the same sections as the edit summary:**
  - **The card:** kind, company, bank, type and club, last 4, valid until, network, colour, and whose card it is.
  - **Billing:** paid from, billing day, credit limit.
  - **Fees and interest:** card fee, foreign-currency fee, credit and late interest.
- Each row shows its value, or "Not set". A value from a statement carries the "From your statement" tag (decision 7).
- Each group has "Change". It opens that group's first step, and that step's main button becomes "Back to review". The kind row's "Change" opens step 1.
- A duplicate warning shows above Save when there is one (section 4.4).
- **Save** writes the card (section 4.6).

### 3.2 Debit card: steps 2 to 6

A debit card (כרטיס חיוב מיידי, "דביט", "דיירקט") is a bank card, run by a card company, and charged to one account within about a business day (research §1.2, §2.2). It has **no billing day, no credit limit, no interest, no instalments and no קרדיט** (research §0, fact 1). So the flow asks for the account first, and never asks the credit questions.

#### Step 2 · Account

- **Heading:** "Which account does it take money from?". Help: "The money leaves this account on the day of each purchase."
- **Choices:** the household's bank accounts that are not archived, each with its bank mark and account tail, then "An account not in the app".
- **Picking an account** sets `accountId`, `bank` to that account's bank name, and `kind: 'bank'`. The owner follows the account's holder (decision 11). It moves on.
- **"An account not in the app":** shows "Which bank is it at?" on the same step: the catalog banks (`BankSelect`), and "My bank isn't listed" with a bank name field. It sets `bank` and `kind: 'bank'`, and no `accountId`. Next.
- **No accounts at all:** the bank list is shown straight away, with one line above it: "Add your bank accounts on the Bank accounts screen to link this card to one."
- An archived account is offered only when the card already uses it, marked "Archived".

#### Step 3 · Company and type

- **Heading:** "Which company runs the card?". Help: "It's printed on the card, next to your bank's name."
- **Company:** the card companies the bank works with (the catalog bank's `issuers`), as tiles. Only Isracard, Cal and Max run debit cards, so Amex and Diners are never offered. With no catalog bank, all three. Then "I don't know".
- **Type:** under the company, its debit types (`tiersOf(catalog, issuer, { funding: 'debit' })`), plus "Not in the list" with a "Card type" text field.
  - Picking a type moves on.
  - With exactly one debit type (Isracard's "Direct / ISRACASH" today), it is set without asking and the company tap moves on.
  - With none in the catalog (Cal and Max today: research §4.2 lists them as missing), only the text field shows, with Next or Skip.
- **"I don't know"** moves on. The card is unlinked, which changes nothing in its sums.
- **Linking:** the company, the account's bank and a debit type link the card (`linkedDraft`). The catalog fills only the foreign-currency fee: a debit card is a bank card, and the catalog holds no bank card fees. It has no deal or late rates (section 13.7).

#### Step 4 · Your card

- The same fields as credit step 5: last 4 digits, valid until, network, colour, and whose card it is.
- **Network:** Isracard offers Isracard / Mastercard. Cal and Max offer Visa / Mastercard. An unknown company offers all five.
- **Whose card?** follows the account chosen on step 2.

#### Step 5 · Fees

- **Heading:** "What does the card cost?".
- **Card fee a month:** a shekel field. Help: "Set by your bank. Banks may charge up to ₪7 a month." The cap is the Bank of Israel's from 1.10.2026 (research §2.2). A higher figure is not refused: an older statement may show one.
- **Foreign-currency fee:** linked, the catalog's figure with its tag and "Change". Unlinked, a field. Help: "Usually about 3%."
- No fee discount, no credit interest, no late interest, no rate table.

#### Step 6 · Review

- As credit step 8, with two groups: **The card** (kind, account, bank, company, type, last 4, valid until, network, colour, whose) and **Fees** (card fee, foreign-currency fee).

### 3.3 Prepaid card: steps 2 to 7

A prepaid card (כרטיס נטען) holds money loaded onto it in advance, and is charged against that money at once (research §1.3, §2.3). Its balance is a pot, like the cash pot (decision 24).

#### Step 2 · Company

- **Heading:** "Who issued the card?". Help: "If your bank gave it to you, choose the company printed on it."
- **Choices:** Isracard, Cal, Max and Other, as the credit company tiles. Amex and Diners issue none.
- **Other:** a "Company name" field on the same step, with Next. The card is unlinked.

#### Step 3 · Type

- **Heading:** "Which card is it?".
- **Choices:** the company's prepaid types and prepaid clubs (`tiersOf` and `clubsOf` with `{ funding: 'prepaid' }`), plus "Not in the list".
  - Cal: Prepaid, PayBox Young and MyCal. Max: max cash / pre-paid, MyMAX and קרנות PRE-PAID. Isracard: none yet (נטענצ'יק is missing from the catalog, research §4.2).
  - A catalog type sets `kind: 'non_bank'` and links the card with the bank `'none'`.
  - "Not in the list" shows a "Card type" text field, and "The bank, if a bank gave it to you" (`BankSelect`, optional), for cards like Up Card or 2GO. A bank sets `kind: 'bank'`.
- **Skipped** when the company has exactly one prepaid type and no prepaid clubs.
- **Company Other, a company with no prepaid types, or the catalog failed:** only the free-text fields, with Skip.

#### Step 4 · Your card

- As the debit step 4. A prepaid card may be unnamed and handed to a child (research §2.3), so "Whose card?" offers each person as usual.

#### Step 5 · Money in

- **Heading:** "How does money get onto it?".
- **Loaded from:**
  - the household's bank accounts that are not archived;
  - then its live credit cards, each marked "Credit card": Natanchik, MyCal and PayBox Young are loaded from a credit card (research §2.3);
  - then "Somewhere else".
  - An account sets `accountId`. A credit card sets `loadCardId`. The owner follows the account's holder or the credit card's owner, unless changed by hand.
- **Balance on the card now:** a shekel amount, optional. Help: "We count it like cash: loading moves your money, spending lowers your balance." Under it: "Most prepaid cards hold up to ₪1,000."
  - On Save, an amount here writes the pot's `start` move, dated today (section 12).

#### Step 6 · Fees

- **Heading:** "What does the card cost?".
- **Card fee a month:** linked, the catalog's tier fee, tagged "Published" (Cal Prepaid ₪9.90, max cash ₪19.90). Unlinked, a field.
- **Fee for each load:** a shekel field, `loadFeeMinor`. Help: "As your statement shows it." The catalog does not hold load fees.
- **Foreign-currency fee:** as the debit step 5.

#### Step 7 · Review

- Three groups: **The card**, **Money in** (loaded from, balance now) and **Fees** (card fee, load fee, foreign-currency fee).

### 3.4 Gift card: steps 2 to 5

A gift card or voucher (גיפט קארד, שובר מתנה, תו קנייה) has a fixed value, an expiry date, and usually a closed list of shops (research §1.4, §2.4). It is never reloaded, has no fees, and has no account.

**Its code or PIN is never asked for or kept** (decision 23). Whoever holds the code can spend the card.

#### Step 2 · Issuer

- **Heading:** "Who issued the gift card?". Help: "It's on the card or in the message it came in."
- **Choices:** Isracard, Cal, Max, BuyMe and Other.
  - Isracard, Cal and Max set `issuer`.
  - BuyMe sets `issuer: 'other'` and `issuerName: 'BuyMe'`. `CardIssuer` stays a closed list (section 13.2).
  - Other shows a "Name" field, for a mall or a chain ("קניוני עופר"). It sets `issuer: 'other'` and `issuerName`.
- A gift card is never linked: the catalog has no gift cards.

#### Step 3 · Your card

- **Heading:** "Your card".
- **Fields, in order:**
  1. **Last 4 digits:** optional. Help: "Only if a number is printed on it. Never the code or PIN you pay with."
  2. **Valid until:** MM/YY. Help: "We'll remind you a month before." It is not required, but it is the gift card's most important fact, so it comes second, before anything optional.
  3. **Network:** optional, all five networks and "None", because most gift cards show none.
  4. **Where it's accepted:** a short text, at most 40 characters, `acceptedAt`. Help: "For example '60 chains' or 'BuyMe spa'."
  5. **Card colour** and **Whose card?**, as for every kind.

#### Step 4 · Value

- **Heading:** "How much is on it?". Help: "A gift card isn't counted in your balance. Spending with it shows in your categories."
- **Amount on the card:** a shekel amount.
- **Date received:** a date, today by default.
- On Save, an amount writes the pot's `start` move on that date (section 12).

#### Step 5 · Review

- Two groups: **The card** (kind, issuer, last 4, valid until, network, where it's accepted, colour, whose) and **Value** (amount, date received).

### 3.5 When the catalog says it's another kind

Research §4.2 lists the catalog types and clubs that are really debit or prepaid:

| Catalog entry                                         | Kind    |
| ----------------------------------------------------- | ------- |
| Isracard type `direct` ("Direct / ISRACASH")          | Debit   |
| Cal types `prepaid` and `paybox_young`                | Prepaid |
| Max type `cash` ("max cash / pre-paid")               | Prepaid |
| Cal club `mycal`; Max clubs `mymax`, `kranot_prepaid` | Prepaid |

Isracard's `digital` type and Cal's `cashcal` clubs stay credit cards. That `digital` is credit is unconfirmed (research, open question 6).

- **Under Credit,** picking one of these on step 4 switches the kind:
  - A line shows at the top of the next step: "This is a debit card. It's taken from your account right away, not billed monthly." or "This is a prepaid card. You load money onto it, and it isn't billed monthly." It has "Undo".
  - The company and the type carry over. A debit card keeps the bank from step 3, and its account step lists that bank's accounts first.
  - The flow goes on to the new kind's first open step: the account step for debit, "Your card" for prepaid. The billing and interest steps drop out, and the progress total changes.
  - "Undo" returns to Credit, on step 4, with the type cleared.
- **Under Debit or Prepaid,** only that kind's types are listed, so the reverse can't happen.
- **In Smart import,** a found card whose type is one of these opens as that kind, without the notice. Review shows the kind tagged "From your statement".
- **On edit,** picking one of these types for a credit card is a change of kind, and section 7.1 applies.

## 4. Rules across the steps

### 4.1 What is required

- The kind, a non-empty name, and for a credit card a company choice (a catalog company, or Other).
- The name is suggested, so in practice only step 1, and for a credit card step 2, need an answer.
- An empty draft after that is valid: `cardFromDraft` requires nothing.

### 4.2 The suggested name

`suggestedName(state, language)` in `src/domain/card-flow.ts`:

- **Credit, not through a bank:** `{company} {type} ·{last4}`, for example "Max Platinum ·1234".
- **Credit, bank card:** `{company} · {bank} {type} ·{last4}`, for example "Max · Leumi Platinum ·1234".
- **Debit:** `{bank} {type} ·{last4}`, for example "Hapoalim Direct ·1234" ("הפועלים Direct ·1234"). A debit card is known by its bank. With no type, the word "Debit" ("דביט") stands in its place.
- **Prepaid:** as credit. For example "Cal Prepaid ·5678", or with a club "Cal MyCal ·5678".
- **Gift:** `{issuer} · until {MM/YY}`, for example "BuyMe · until 03/31" ("BuyMe · עד 03/31"). With no expiry, the issuer alone.
- **The bank's short name:** the catalog names banks in full ("Bank Leumi", "בנק לאומי"). The name drops a leading "Bank " or "בנק ", so it reads "Leumi" or "לאומי". Other bank names are used as they are.
- **A club in place of the type:** when there is a club, its name stands where the type would. Cards with a club are known by it, as in "Isracard FLY CARD ·1234".
- **Missing parts are dropped** with their separators.
- **Nothing known:** the kind's name: "Credit card" (`cards:unknownIssuer`), "Debit card", "Prepaid card" or "Gift card".
- **Company Other:** its typed name is used.
- **Last 4 digits and the month:** "·1234" and "03/31" are wrapped in a left-to-right isolate (`⁦…⁩`), as the payment-method picker does, so they read right in Hebrew.
- **Following the answers:** the name follows the answers until the person edits the field. After that it is theirs. Clearing the field by hand turns following back on.

### 4.3 Owner

- **Starts as:** the first person, or the only one.
- **Follows:** picking a paying account, a debit card's account, or a prepaid card's loading account or card sets the owner to that method's `profileId`, as `MethodForm.changeCard` does today, unless the person changed "Whose card?" by hand.
- **One-person household:** the field is hidden and the owner is that person.

### 4.4 Duplicates

- **When:** on review, a card is a duplicate when a live (not deleted, not archived) card of the **same kind** has the same `lastDigits`, and the same `issuer` when both cards have one.
- A card with no last 4 digits is never a duplicate. Most gift cards have none.
- **Warning:** "You already have {{name}}.", with "Open it".
- "Open it" closes the flow, asking "Discard this card?" first, and opens that card's edit summary.
- Saving is never blocked: two cards can share their last 4 digits.

### 4.5 Closing

- **On the first three screens** (the kind, and the next two steps of its path), closing with ×, Escape or a tap outside just closes.
- **From the fourth screen on** it asks "Discard this card?" ("Nothing you entered is kept."), with "Discard" and "Keep going". That is the type step for a credit card, "Your card" for debit and prepaid, and "Value" for a gift card.
- In the import sheet, the same rule applies to leaving the card for the list.
- Nothing is written before Save. There are no drafts.

### 4.6 Saving

- **Credit card:** one `createPaymentMethod` call with `type: 'credit_card'`, the name as `label`, the owner as `profileId`, the colour (when not the company's), `creditAnnualRate` and the `card` details from `cardFromDraft`. These are the same fields `MethodForm.save` writes today. No `funding` is written.
- **Debit, prepaid or gift card:** one `createPaymentMethod` call with `type: 'debit_card'`, the name, the owner, the colour, and `card` with `funding` set to `'debit'`, `'prepaid'` or `'gift'`.
  - Only the fields the kind asks are written (`fieldsFor(kind)`, section 13.2). A debit card never gets a billing day, a limit or a rate, even when the state still holds one from an earlier choice of kind.
  - No `creditAnnualRate`.
- **Prepaid or gift with an amount:** the same Dexie transaction also writes the pot's `start` move (section 12). If either write fails, neither is kept.
- **On success:** a toast "{{name}} added" (not from Smart import, which already shows its own), and the pop-out closes. Focus returns to "Add a card", or to the transaction's payment method field.
- **On failure:** the existing "Couldn't save" toast. The pop-out stays open on review with every answer.

## 5. Smart import

- **Fill view:** the import sheet's fill view (`MethodPanel`) hosts the flow's steps in place, instead of `MethodForm`.
  - The import sheet is already a sheet, so the flow doesn't open a second pop-out on top of it.
  - Its header becomes the flow's progress line and step heading.
  - The URL-driven move to the next unfinished card (`nextUnfinished`) works as today.
- **Prefill:** `editorSource` still builds the starting card from the document. The flow is seeded from it, and every value that came from the document is remembered as "from your statement".
- **The kind:** a card statement is a credit card's, unless the catalog type found says otherwise (section 3.5). So the kind starts as Credit, or as the catalog's kind, and counts as answered. How each bank marks a debit purchase on its own statement is not known yet (research, open question 3), so a bank statement never creates a debit card here.
- **Where it opens:** `firstOpenStep(state)` returns the first step, from step 1, whose question has no answer. The flow opens there. Next then jumps over steps the document answered, to the next open one, and ends on review. Back reaches every step.
- **Review:** values from the document carry "From your statement". Changing one removes its tag.
- **A document that updates one of the household's cards:** the fill view shows the **edit summary** (section 7) for that card, with the document's values applied and tagged. Save writes it as an update.
- **After Save:** the found row is linked to the saved card, the "saved" toast shows, and the next unfinished card opens, all as `import-sheet.tsx` does today.

## 6. From the transaction form

- **The new option:** `PaymentMethodField` gains a last option, "Add a card".
  - It is shown for expenses, in every mode.
  - It is never selected as a value. Choosing it opens the add flow over the transaction sheet, on step 1.
  - In a credit-only mode (קרדיט, קרדיט פלוס, 30+), step 1 is answered as Credit and skipped (section 3).
  - The sheet stays open and keeps everything typed.
  - The pop-out is rendered outside the transaction `<form>`, as today's card sheet is, so its Save never submits the purchase.
- **On Save:**
  1. The pop-out closes.
  2. The transaction's `paymentMethodId` is set to the new card, if the card fits the transaction's mode (`methodFits`, section 10.4). A debit card added during a תשלומים purchase doesn't fit, so the field keeps its value, and the toast "{{name}} added" says the card exists.
  3. `changeMethod` runs, so the deal falls back to one the card allows.
  4. For a credit card, `cardSaved` copies the card's rate into a credit plan as it does today.
  5. Focus returns to the payment method field.
- **Closing without saving** leaves the payment method as it was.
- **The credit plan's "open the card" link** (`onOpenCard`) opens the edit pop-out on the fees step. Saving there runs `cardSaved` as today.
- **The rest of the list** ("Paid with") is in section 10.

## 7. Editing a card: the summary

- **Opened by:** "Edit card" opens the same pop-out on a **summary**. The card preview is at the top, with the name under it.
- **Rows:** the kind's groups and rows, as review shows them, each with "Change".
  - **Name:** opens a one-field step.
  - **Kind:** opens step 1. Choosing another kind follows section 7.1.
  - **Which card** (credit: company · bank · type · club): opens steps 2 to 4 in order, with the current answers selected, so unchanged steps take one tap each. Changing the company clears what no longer fits (step 2), and relinking asks "Keep the rates you entered?" when the card has overrides, as today. Choosing an escape unlinks the card. Its rates stay as its own fields.
  - **Account** (debit): opens step 2. **Company and type** (debit): opens step 3.
  - **Company and type** (prepaid): opens steps 2 and 3. **Issuer** (gift): opens step 2.
  - **Your card:** opens that kind's "Your card" step.
  - **Billing** (credit), **Money in** (prepaid), **Value** (gift): open that step.
  - **Fees and interest** (credit), **Fees** (debit, prepaid): open that step.
- **Inside an opened step:**
  - There is no progress bar.
  - The buttons are Cancel and Save. Steps that chain to the next one (the credit company and bank, the prepaid company) show Next.
  - Save writes the change at once with `updatePaymentMethod`, keeping unknown card keys as `cardFromDraft` does, and returns to the summary.
  - Cancel, ×, or Escape with unsaved changes asks "Discard your changes?".
- **"Link to the catalog":** an unlinked card whose own fields name a catalog entry shows today's offer on the summary: "This looks like a {{issuer}} card through {{bank}}. Link it to fill in its real rates?".
  - "Link" links it, and opens the type step when the type can't be told.
  - "Not now" hides the offer.
  - A gift card never shows it.
- **"Interest table" and the transaction form's "open the card"** open the pop-out straight on credit step 7, focused on the rate table, as `section="rates"` does today. Save or Cancel returns to the summary, and × closes the pop-out.
- **Archived cards:** "Edit card" on an archived card opens the same summary. A card already paid from, or taken from, an archived account keeps it, shown as "Archived". Other archived accounts are not offered.
- **What stays in the card menu:** archive, restore, transactions and import. The summary doesn't repeat them.

### 7.1 Changing a card's kind

- **The question:** choosing another kind on the summary first asks "Change this card's kind?", with "Its past purchases will be counted again the way the new kind counts them. Details that don't fit are removed." and "Change" / "Cancel".
  - Credit to anything else: past purchases count on their own dates, not on a billing day, and the card's bills disappear.
  - Anything to gift: past spending with it leaves the balance (section 11).
  - Gift to anything else: past spending with it comes into the balance.
- **Blocked from Credit** while the card has payments still to come on instalments, קרדיט, a loan or a 30+ purchase (`cardCommitments(...).plans` is not empty, or a deferral is unbilled). The step says: "This card still has payments to come on instalments or credit. It can change kind once they are paid." A debit, prepaid or gift card can't carry those plans (research §2.2).
- **On "Change":**
  - The flow walks the new kind's steps that have no answer yet, then returns to the summary. Save there writes the change.
  - `type` becomes `credit_card` or `debit_card`. `funding` is set, or removed for credit.
  - The fields the new kind doesn't ask are removed (`fieldsFor`): for example billing day, limit, rates, overrides and fee discount when leaving Credit; `loadCardId` and `loadFeeMinor` when leaving Prepaid.
  - The card's pot moves are kept, unread, while the card is not a pot kind. Changing it back to prepaid or gift reads them again.
- **Not a conversion:** changing between debit and prepaid keeps `type: 'debit_card'` and changes only `funding`, with the same question.

## 8. "Finish setting up"

- **On the card:**
  - A credit card's "No billing day yet" line (`cards:noBillingDay`) gains a "Finish setting up" button. It opens that card's edit pop-out on the billing step.
  - A debit card with no account (`accountId` absent, or an account that no longer exists) shows "No account yet", with "Finish setting up". It opens the account step. The account is what places its purchases (research §5.4).
  - A prepaid card with no `start` move shows "No balance yet", and a gift card with none shows "No value yet", each with "Finish setting up", opening the Money in or Value step.
- **The notice:** `UnfinishedNotice kind="card"` adds three counts under the Smart import line, each with "Finish setting up":
  - live credit cards with no billing day: "1 card has no billing day yet." / "{{count}} cards have no billing day yet.";
  - live debit cards with no account: "1 debit card isn't linked to an account yet." / "{{count}} debit cards aren't linked to an account yet.";
  - live gift cards that expire this month or next with money left (`expiryStatus` is `'soon'` and the pot is above zero): "1 gift card expires soon with money left." / "{{count}} gift cards expire soon with money left.". This is the gift card's reminder, a month before as research §5.3 suggests. Its button opens the Cards screen at that card.
  - With one card in a line, its button opens it. With several, it opens the first by name. The count updates as each is finished.
- **Smart import drafts** (`listUnfinished`) keep their own line and link, unchanged.

## 9. The Cards screen

### 9.1 What it shows

- **Title:** "Cards" ("כרטיסים"), as the menu already says. Subtitle: "Every card you pay with, and when each one takes the money."
- **"Add a card"** opens the flow on step 1.
- **The list:** every live card, credit and debit (`type` is `credit_card` or `debit_card`), grouped by kind in this order: Credit cards, Debit cards, Prepaid cards, Gift cards (`cardKindOf`, section 13.3).
  - Each group has a heading, `h2`, shown only when the screen has cards of two kinds or more. Each card panel's heading becomes `h3` under it.
  - Every panel says its kind on its owner line ("Debit card · Dana"), so a single group still says what it is.
  - `useCardsData` (`src/features/cards/use-cards-data.ts`) takes both types, today only `credit_card`.
- **Empty:** "No cards yet" / "Add your credit, debit, prepaid and gift cards. Each purchase then counts on the day the money really leaves."
- **Whose cards:** the profile switcher filters every group, as today.
- **Total commitments** (`HouseholdCommitments`) counts credit cards only. Nothing else has commitments.
- **Archived cards** lists archived cards of every kind, each with its kind.

### 9.2 Each kind's panel

| Kind    | The panel shows                                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Credit  | Unchanged: bills, limit, commitments, fees, expiry.                                                                                                                                                                |
| Debit   | "Taken from {{account}}", or "No account yet" with "Finish setting up". The card fee and its status, the foreign-currency fee, the expiry. No bills, limit bar or commitments.                                     |
| Prepaid | "Left on the card" with the pot figure (section 12), "Loaded from {{source}}", the card fee and load fee, the expiry. "Update the balance" opens the Money in step.                                                |
| Gift    | "{{left}} left of {{value}}", where it's accepted, "Use by {{month}}". In the last two months: "Expires {{month}}, with {{left}} left." After it: "Expired with {{left}} left." Never a fee, an account or a rate. |

- The card menu has "Interest table" for credit cards only. Every other action is offered for every kind.

### 9.3 "Other ways to pay" is removed

- `OtherMethods`, its "Add a way to pay" button, its list of cash, cheques and custom methods, and its `DeleteMethodDialog` and `Option` go away.
- **Cash** has its own tab. **Cheques** and the other built-ins are always in "Paid with" (section 10). None of them is listed on the Cards screen.
- **Debit cards** the person added there are now in the Debit group (section 17 has the empty ones).
- **Custom rows of the built-in types** (a "Bit" wallet, a "Transfer to landlord" transfer, a custom cash row) are not listed on any screen. They keep working (section 10.3).

### 9.4 The Bank accounts screen

- An account already lists the cards whose `card.accountId` is that account (`bank-accounts-screen.tsx`). A debit card shows there as "Debit card ·1234", with no upcoming bill. A prepaid card loaded from the account shows as "Loads Cal Prepaid ·5678".

## 10. "Paid with" and the built-in ways to pay

### 10.1 The list

`PaymentMethodField` offers, in this order:

1. "Not specified", as today.
2. The cards the person can pay with (`methodsFor`): every live card of every kind, by name. Each hint is its kind ("Credit card", "Debit card", "Prepaid card", "Gift card") and "··1234".
3. The bank accounts, by name.
4. The built-ins, always in this order: **Cash, Cheque, Bank transfer, Standing order, Bit / PayBox, Other**.
5. "Add a card" (section 6).

Today's list is every method sorted by label. The new order puts what the person owns first and the fixed choices after it, so a card is never lost between "Bank transfer" and "Bit".

### 10.2 How the new built-ins exist: seeded rows with fixed ids

| Built-in       | id                  | `type`           | Stored label     |
| -------------- | ------------------- | ---------------- | ---------------- |
| Cash           | `pm.cash`           | `cash`           | "Cash"           |
| Cheque         | `pm.cheque`         | `cheque`         | "Cheque"         |
| Bank transfer  | `pm.transfer`       | `bank_transfer`  | "Bank transfer"  |
| Standing order | `pm.standing_order` | `standing_order` | "Standing order" |
| Bit / PayBox   | `pm.wallet`         | `digital_wallet` | "Bit / PayBox"   |
| Other          | `pm.other`          | `other`          | "Other"          |

The first two exist today (`CASH_METHOD_ID`, `CHEQUE_METHOD_ID` in `src/types/domain.ts`). The new four follow them: `TRANSFER_METHOD_ID`, `STANDING_ORDER_METHOD_ID`, `WALLET_METHOD_ID` and `OTHER_METHOD_ID`, in `buildSeedPaymentMethods` (`src/db/seed.ts`).

**Why rows, not virtual options.** A transaction's `paymentMethodId` must name a row, on every build:

- `checkIntegrity` reports a `paymentMethodId` with no row as `missing_payment_method`, and `repairIntegrity` clears it. The sync engine runs that repair after every pull, and the clear is an ordinary edit that syncs. So an id that is not a row anywhere would erase "Paid with" from every such transaction, on every device.
- A file import checks the same thing (`crossEntityIssues` in `transfer-validate.ts`: "No payment method") and refuses the **whole file**.
- A seeded row has a type every build already knows, so an older build parses it, stores it and shows it by its label.

**Why these rows must sync, unlike cash and cheques.** Cash and cheques are seeded untracked: every install writes the identical row, and an untracked seed never overwrites an archive made on another device. Every build that syncs has them. The new four are new, so an older build doesn't have them. If they stayed untracked, an older device would get transactions paid with `pm.transfer` but never the row, and its repair would clear them. So:

- `ensureBuiltinPaymentMethods` adds any of the four that is missing, as today for cheques. Their `createdAt` and `updatedAt` are one fixed instant, `BUILTIN_METHODS_SINCE = '2026-10-10T00:00:00.000Z'`.
- When this device has no sync state for one, it queues it for upload with the rev of that fixed instant (`revFromIso(BUILTIN_METHODS_SINCE, deviceId)`), the way `seedChangeTracking` dates old rows by their own `updatedAt`.
  - Several devices upload identical rows. Whichever wins, the row is the same.
  - Any real edit, such as an archive, has a later rev and always wins over the seed.
- When this device's sync state says one was **deleted** (only an older build can do that, section 13.8), it adds it back as an ordinary tracked write, with a new rev, so it comes back on every device.

**What they are in this build:**

- `isBuiltinPaymentMethod` covers all six ids. They can't be renamed, given an owner, deleted or archived (the repo's guards in `payment-methods.ts`), and `isActiveMethod` always offers them.
- `methodDisplayName` resolves all six from the UI language: `profiles:method.bank_transfer`, `method.standing_order` and `method.other`, and a new `profiles:builtin.wallet`, "Bit / PayBox" ("ביט / פייבוקס").
- They belong to the household (`SHARED_OWNER`), so every person has them.

### 10.3 Rows the person made of those types

- **They keep working.** Their transactions keep them. The feed shows them by their label, and filters and reports count them as today.
- **They stay selectable on their rows.** The picker offers a custom row of type `cash`, `cheque`, `bank_transfer`, `standing_order`, `digital_wallet` or `other` only on a transaction that already uses it (`methodsFor`'s `keepId`), the same way an archived method is kept. For a new transaction the person picks the built-in.
- **No migration.** Nothing moves their transactions to a built-in, and nothing renames or deletes them. Merging them into the built-ins is out of scope (section 20).

### 10.4 Which ways to pay fit which purchase

`methodFits` and `standingViaOf` in `src/domain/tx-options.ts`:

- **Debit, prepaid and gift cards** take a one-time, monthly or yearly purchase. They don't take תשלומים, קרדיט, קרדיט פלוס, 30+, a loan or a standing order. Banks allow none of these on a debit card (research §2.2), and a prepaid card neither (§2.3).
- So `standingViaOf` returns `undefined` for `debit_card`, where it now returns `'card'`. A standing order already on a debit card stays on its row (`keepId`).
- **The built-ins** keep their types' rules: a transfer and a standing order are `'bank'`; Bit / PayBox is `'card'`; cash, cheque and Other carry no standing order.
- **Every reader of `type`** goes through `methodTypeOf(method)`, which reads an unknown type as `'other'` (section 13.4).

## 11. Balance maths per kind

**Where the balance is computed today:**

- `useBalance` (`src/features/summary/use-balance.ts`) expands the occurrences, adds `cardFeeOccurrences`, and splits them with `splitBySettlement`. That calls `settleDate`, which moves an expense to its card's bill when `billingDayOf` gives a day. Then `availableBalance` and `balanceParts` (`src/domain/calculators.ts`) sum what has settled.
- `useChartData` (`src/features/chart/use-chart-data.ts`) does the same for the balance line, calling `settleDate` in its own loop.
- `cardBills`, `limitUsedMinor`, `cardCommitments`, `cardFeeOccurrences`, `chargesFeeIn`, `fxFeeFor` and `billingDayOf` are in `src/domain/cards.ts`.
- The cash pot, the pattern for card pots, is `personCash` and `cashSummary` in `src/domain/cash.ts`.

The app keeps one balance for the household, not one per account. A card's `accountId` says where its money comes from, for the Bank accounts screen and for matching imports. It does not split the balance.

| Kind    | A purchase                                                                                    | Its card fee                                                                                                                           | What changes in the code                                                                                                                                                                                                                            |
| ------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credit  | Lowers the balance on the card's next billing day (the one after for 30+).                    | A line on each month's bill.                                                                                                           | Nothing.                                                                                                                                                                                                                                            |
| Debit   | Lowers the balance **on its own date**. No bill, no "pending on cards".                       | A monthly expense at the end of the month, on its own date (no billing day to move it to). Charged "מידי חודש בחודשו" (research §1.2). | `settleDate`: nothing, because `billingDayOf` gives a day only for `credit_card`. `cardFeeOccurrences`, `chargesFeeIn` and `fxFeeFor` widen from `credit_card` to any card but a gift card.                                                         |
| Prepaid | Lowers the balance on its own date, and the pot by the same amount.                           | As debit. With a `loadCardId`, the fee line is paid with that credit card, so it rides its bill.                                       | As debit. The pot figure is new (section 12). Loading from an account moves money into the pot and leaves the balance as it is, so it needs no code here.                                                                                           |
| Gift    | **Does not change the balance.** It lowers the gift card's pot, and counts in the categories. | None.                                                                                                                                  | A new `countsInBalance(occurrence, methods)` in `cards.ts`: false for an expense paid with a gift card. `splitBySettlement` and `useChartData`'s loop skip such occurrences, so `availableBalance`, `balanceParts` and the line all leave them out. |

**What changes against a credit card, in one place:**

- A credit purchase waits for the bill. A debit or prepaid purchase doesn't. This already holds, because `billingDayOf` is credit-only. What is new is that a debit card has details at all.
- A debit or prepaid card's fee and foreign-currency fee are now counted. Today a debit card never had either.
- A gift card is the one kind whose spending is outside the balance (decision 21). Category totals, the feed and the transaction list still show it, because the purchase was real.
- An income is never paid into a card in this release, so income maths doesn't change.

## 12. Prepaid and gift pots

### 12.1 What this spec ships

- **A new synced table, `cardMoves`,** like `cashMoves`:

  | Field                                              | Notes                                                                                                                   |
  | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
  | `id`                                               | A new id.                                                                                                               |
  | `methodId`                                         | The prepaid or gift card's id.                                                                                          |
  | `kind`                                             | **An open string**, as `CashMove.kind` is: `'start'` in this spec, `'load'`, `'unload'` and `'count'` in the follow-up. |
  | `amountMinor`                                      | Positive, in the household's base currency; 0 only for `count`.                                                         |
  | `date`                                             | `LocalDate`.                                                                                                            |
  | `fromId`                                           | Optional: the account or credit card a load came from. A label, as `CashMove.accountId` is.                             |
  | `note`                                             | Optional.                                                                                                               |
  | `isDeleted`, `deletedAt`, `createdAt`, `updatedAt` | As every synced row.                                                                                                    |
  - The next Dexie version in `src/db/versions.ts` adds `cardMoves: 'id, [methodId+isDeleted+date], updatedAt'`.
  - Everything the cash spec (section 5) did for `cashMoves` is done for it: `SYNCED_TABLES`, the row schema, linked-account spaces (the plan checks `homeOfPulled` and `deliveries()`), Delete all data, export and import, and an integrity check for a move whose card is gone.

- **The `start` move:** written on Save from "Balance on the card now" (prepaid, dated today) or "Amount on the card" (gift, dated when received). Editing that row on the summary (Money in, Value, or "Update the balance") rewrites the one start move, as the cash tab rewrites its start. There is only ever one: if a sync brings a second, the earliest counts, as `earliestStart` decides for cash.
- **The figure:** `cardPot(card, moves, occurrences, today)` in a new `src/domain/card-pots.ts`:

  ```
  pot(card, today) =
        start + Σ load − Σ unload                (live moves, start..today)
      − Σ expense occurrences paid with the card (start..today)
  ```

  - On the start day itself, only rows written after the start count, as for cash.
  - A kind it doesn't know counts 0, so the follow-up can add kinds safely.
  - It may go below zero, and the panel shows that honestly, as the cash tab does.

- **Where it shows:** the card's panel (section 9.2), and the gift reminder in the notice (section 8).

### 12.2 The follow-up, "Card pots"

A spec of its own, written before it is built. Its boundary:

- **In it:** the actions "Load", "Unload" and "Count" on a prepaid card, and "Count" on a gift card. The pot's history, like the cash tab's activity list. Load fees as expenses, offered with `loadFeeMinor` filled in. A load from a credit card on that card's bill (section 12.3). Smart import matching a load on a bank or card statement as a move, not an expense (research §3.3, rule 4).
- **Not in it, and not in this spec:** money from a refund or an income paid into a card.
- **Until it ships:** the only way to top a card up is "Update the balance", which rewrites the start move with today's figure. Section 17 says what that means for a card loaded from a credit card.

### 12.3 A load from a credit card: the rule the follow-up builds

A load paid by a credit card (Natanchik, MyCal, PayBox Young) **is a purchase on that credit card**:

- It is a line on the credit card's bill, it uses the card's limit, and it counts in "Purchases not yet charged".
- The money leaves the account on the credit card's billing day, like any purchase on it.
- It is **not spending**: it has no category and is not in any category total. The spending is what the prepaid card buys.
- In the balance, the pot holds the money from the load day, and the bill takes it on the billing day. Until then it shows as owed on the card, like any purchase not yet charged.
- So money loaded and spent is counted once, as the prepaid card's spending, and the credit card's bill still matches its statement.

## 13. Data

### 13.1 `CardDetails.issuerName`

- **What it is:** the company name typed under "Other", at most 40 characters. It is set only when `issuer === 'other'`. A gift card from BuyMe or a mall uses it too.
- **Where it is added:**
  - `CardDetails`;
  - `cardSchema` (`shortText.optional()`);
  - `DRAFT_KEYS` and `CardDraft` in `card-draft.ts`, as `issuerName: ''`.
- **Older builds:**
  - Their card edits keep keys they don't know (the `unknown` spread in `cardFromDraft`).
  - Sync stores the row as received.
  - An older build's file import strips the key, so the card arrives named by its label alone. Nothing breaks.

### 13.2 New card fields

All are optional, on `CardDetails`, `cardSchema`, `CardDraft` and `DRAFT_KEYS`:

| Field          | Schema                      | Kinds                | Notes                                                                                        |
| -------------- | --------------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `funding`      | `z.string().min(1).max(20)` | debit, prepaid, gift | **Open, never a `z.enum`**, like `mccSource`. Written as `'debit'`, `'prepaid'` or `'gift'`. |
| `loadCardId`   | `z.string().min(1)`         | prepaid              | The credit card that loads it. Only a `credit_card` method's id.                             |
| `loadFeeMinor` | `minorAmount`               | prepaid              | The fee for each load.                                                                       |
| `acceptedAt`   | `shortText`                 | gift                 | Where it is accepted. A label, at most 40 characters.                                        |

- **What each kind writes** (`fieldsFor(kind)` in `card-flow.ts`), from research §5.1 to §5.3:
  - **Credit:** every field it writes today, and `issuerName`.
  - **Debit:** `funding`, `kind: 'bank'`, `bank`, `accountId`, `issuer`, `issuerName`, `tier`, `catalog`, `network`, `lastDigits`, `expiresMonth`, `monthlyFeeMinor`, `feeSince`, `fxFeeRate`.
  - **Prepaid:** the debit set, with `kind` `'bank'` or `'non_bank'`, plus `club`, `loadCardId` and `loadFeeMinor`.
  - **Gift:** `funding`, `issuer`, `issuerName`, `network`, `lastDigits`, `expiresMonth`, `acceptedAt`.
  - **Never for a non-credit kind:** `billingDay`, `creditLimitMinor`, `feeDiscount`, `creditPrimeMargin`, `lateRate`, `overrides`, and `creditAnnualRate` on the method.
- `PaymentMethod.card`'s comment, "Credit cards only", becomes "Cards of every kind".
- **`gate:pci`** (`scripts/gate-pci.mjs`) adds `voucher_?code|gift_?code|redeem_?code` to its forbidden names, so no field for a gift card's code can be added (decision 23).

### 13.3 Reading the kind

`cardKindOf(method)` in `src/domain/cards.ts` is the only place that decides it:

| `type`        | `card.funding`                                  | Kind       |
| ------------- | ----------------------------------------------- | ---------- |
| `credit_card` | anything                                        | Credit     |
| `debit_card`  | `'prepaid'`                                     | Prepaid    |
| `debit_card`  | `'gift'`                                        | Gift       |
| `debit_card`  | `'debit'`, absent, no `card` at all, or unknown | Debit      |
| anything else | —                                               | Not a card |

- An unknown `funding` reads as Debit: a card charged when it is used, which settles purchases on their date. A later build can add a kind, and this one shows it as a debit card.
- `funding` is read only on `debit_card` rows.

### 13.4 `PaymentMethod.type` opens

- `paymentMethodSchema.type` changes from `z.enum([...])` to a known value, or any other string of 1 to 30 characters, in the shape of `overrideTerm`'s union in `transfer-schema.ts`.
- `methodTypeOf(method)` reads an unknown type as `'other'`. Every reader goes through it: the type labels (`TYPE_KEY`, `PAYMENT_TYPE_KEY`), `methodFits`, `standingViaOf`, `billingDayOf`, `cardKindOf`, `feed-rows.tsx`, `income-destination.ts` and `use-transaction-sheet.ts`.
- **This release never writes a new type.** The change only lets this build and later ones keep a row a future build writes. A future `'prepaid_card'` or `'gift_card'` type is written only once a release with this change has reached every device (research §5.7, step 2).
- The repo keeps an unknown type on edit, because `updatePaymentMethod` spreads the row.

### 13.5 The new built-ins

- `buildSeedPaymentMethods` gains the four rows of section 10.2. A new database gets all six from `populate`, untracked.
- `ensureBuiltinPaymentMethods` adds and uploads them on an older database, as section 10.2 says.

### 13.6 `cardMoves`

- As section 12.1. A Dexie version, a synced table, and an `envelopeSchema` key that is optional, so an older file still imports.

### 13.7 The catalog

- `CatalogTier.funding?: 'debit' | 'prepaid'` and `CatalogClub.funding?: 'prepaid'`. Absent means credit. These are build-time data, so a closed union is fine.
- The entries of section 3.5 get it.
- `resolveCard` skips the deal rates and the late rate for a debit or prepaid type, and a debit type's fee stays the bank's ("Set by your bank"). FIBI's file already leaves the prepaid, digital and debit types out of its rate rows (`banks/fibi.ts`).
- `tiersOf` and `clubsOf` take an optional `{ funding }` filter.

### 13.8 Sync, export and older builds

| Older build sees                                         | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a debit card with `card` details                         | It parses: `debit_card` is a known type, and sync stores the raw row. The card is in its "Other ways to pay" list. Its purchases settle on their dates, which is right. It doesn't count the card fee or the foreign-currency fee, so its balance can differ by those.                                                                                                                                                                                |
| an older build **editing** a debit, prepaid or gift card | Its `MethodForm` writes `card: null` for any type but `credit_card`, so the save **removes every card detail**, `funding` included. A prepaid or gift card becomes a plain debit card with no details. This build then shows it under Debit with "Finish setting up". Its pot moves stay, unread, until its kind is set back. This can't be prevented in an older build. Release notes say to update every device before editing cards on an old one. |
| a prepaid card (`funding: 'prepaid'`)                    | A debit card to it. Purchases settle on their dates, which is right for the card's own money. It has no pot.                                                                                                                                                                                                                                                                                                                                          |
| a gift card (`funding: 'gift'`)                          | A debit card to it, so its spending **lowers that build's balance**. This build leaves it out (decision 21). The two builds' balances differ by the gift spending until the older one updates.                                                                                                                                                                                                                                                        |
| `loadCardId`, `loadFeeMinor`, `acceptedAt`, `issuerName` | Unknown keys on `card`. Sync stores them, and its credit card edits keep them. Its debit card edit removes them, as above.                                                                                                                                                                                                                                                                                                                            |
| the new built-in rows (`pm.transfer` and the others)     | Ordinary rows of known types, synced from a newer device (section 10.2). It lists them in "Other ways to pay" by their stored English label and offers them in its picker. Its integrity repair finds them, so it never clears a transaction paid with one. It can rename, archive or delete them, because it doesn't know they are built in.                                                                                                         |
| an older build **deleting** a new built-in               | Its delete moves or clears that method's transactions, as the person chose there, and syncs a deletion. This build adds the row back with a new rev (section 10.2), so it returns everywhere. Transactions the delete moved stay moved.                                                                                                                                                                                                               |
| `cardMoves`                                              | It doesn't know the table, so it never pulls it. Its balance is unaffected, because a start move doesn't change the balance.                                                                                                                                                                                                                                                                                                                          |
| the open `type`                                          | Nothing, because this release never writes a new type. A future type would still be rejected by a build older than this one, and kept by this one and later.                                                                                                                                                                                                                                                                                          |
| a file exported by this build                            | It parses: every type is known, and the six built-ins are ordinary rows. Its file import strips `funding` and the other new keys, so prepaid and gift cards arrive as plain debit cards. It ignores `cardMoves`.                                                                                                                                                                                                                                      |
| an older file imported into this build                   | No `funding`: debit cards stay debit cards. No `cardMoves`. Transactions on custom transfer or wallet rows keep them (section 10.3).                                                                                                                                                                                                                                                                                                                  |

- **What an older build does with an unknown `type`**, the research's open question 12: a synced row is rejected (`applyOne`'s `safeParse`), and a file import refuses the **whole file**, because `envelopeSchema` fails before any row is read (`validateEnvelope`). That is why this release opens `type` and writes no new one.

**Tests that pin this table** are in section 18.2.

## 14. Code shape

- **`src/domain/card-flow.ts`** (pure, fully unit-tested):
  - `CardFlowState`: the kind, the `CardDraft`, the owner, colour, name, `nameEdited`, `ownerEdited`, the catalog selection (bank, issuer, tier, club, or an escape), the start amount and date for a pot kind, the previous kind for "Undo", and the set of fields from a statement.
  - `stepsFor(state, catalog?)`: the steps that apply, per kind.
  - `firstOpenStep(state, catalog?)`.
  - `banksFor(catalog, issuer)` and `issuersForBank(catalog, bank, funding)`.
  - `networksFor(kind, issuer, tier)`: the fixed network, or the choices.
  - `billingDaysFor(state, resolved?, catalog?)`.
  - `kindFromCatalog(catalog, issuer, tier, club)` and `switchKind(state, kind)`.
  - `fieldsFor(kind)`.
  - `suggestedName(state, language)`.
  - `duplicateOf(state, cards)`.
  - `asksToDiscard(state, step)`.
  - `canChangeKind(method, commitments)`.
  - `stateFromMethod(method, moves, prefill?)`, and `methodFromState(state, ctx)` (through `cardFromDraft`), which returns the method and, for a pot kind, the start move.
- **`src/domain/cards.ts`:** `cardKindOf`, `countsInBalance`, and the widened `cardFeeOccurrences`, `chargesFeeIn` and `fxFeeFor`.
- **`src/domain/card-pots.ts`:** `cardPot`, `earliestCardStart`.
- **`src/domain/tx-options.ts`:** `methodTypeOf`, and the new rules in `methodFits`, `standingViaOf` and `methodsFor` (section 10).
- **`src/types/domain.ts`:** the four new ids, `isBuiltinPaymentMethod` over six, `CardDetails`' new fields, `CardMove`.
- **`src/db/`:** `seed.ts`, `ensureBuiltinPaymentMethods` (section 10.2), a `card-moves.ts` repo, the Dexie version, and the sync table lists.
- **`src/features/cards/card-flow/`:**
  - `card-flow-dialog.tsx`: the pop-out, the progress bar, the motion and focus.
  - `card-flow.tsx`: the step machine, in add and edit modes, usable inline for Smart import.
  - `step-kind.tsx`, `step-company.tsx`, `step-bank.tsx`, `step-type.tsx`, `step-account.tsx`, `step-card.tsx`, `step-billing.tsx`, `step-money-in.tsx`, `step-value.tsx`, `step-fees.tsx` and `step-review.tsx`. One `step-company.tsx` serves credit, prepaid and gift with each kind's companies, and one `step-type.tsx` serves every kind with the funding filter.
  - `kind-notice.tsx`: the switch notice and its Undo (section 3.5).
  - `card-summary.tsx`: the edit summary, sharing its rows with review.
  - `choice-list.tsx`: the logo and choice tiles, with selection on activation (2.4).
  - `card-face.tsx`: moved out of `CardPanel`.
- **What goes away:**
  - `CardFields` (the component). Its `TextField`, `MoneyField` and `RateField` move to `card-flow/fields.tsx` for the card, billing, money-in, value and fees steps.
  - `IssuerChooser`. Its narrowing moves to the domain, its keep-rates dialog to `step-type.tsx`, and its catalog suggestion to `card-summary.tsx`.
  - `MethodEditor`'s `section` and `newType` props.
  - `MethodForm`'s Type switch, `TYPES` and its `credit_card` branch.
  - `OtherMethods`, `DeleteMethodDialog` and `Option` (section 9.3).
- **What stays:** `RateTable`, `CardColorField`, `cardFromDraft`, `linkedDraft`, `cardFieldsForOverride`, `resolveCard`, `BankMark` and `BrandMark`.

## 15. Copy

All new strings live under `cards:flow.*`, except where noted. The Hebrew uses the plural address the app already uses ("הזינו", "בחרו"). Plurals have `_one`, `_two` and `_other`. The word "sync" is not used.

| Key                             | English                                                                                                                               | עברית                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `flow.step`                     | Step {{current}} of {{total}}                                                                                                         | שלב {{current}} מתוך {{total}}                                                                            |
| `flow.back`                     | Back                                                                                                                                  | חזרה                                                                                                      |
| `flow.next`                     | Next                                                                                                                                  | המשך                                                                                                      |
| `flow.skip`                     | Skip                                                                                                                                  | דילוג                                                                                                     |
| `flow.backToReview`             | Back to review                                                                                                                        | חזרה לסיכום                                                                                               |
| `flow.close`                    | Close                                                                                                                                 | סגירה                                                                                                     |
| `flow.kind.title`               | What kind of card?                                                                                                                    | איזה סוג כרטיס?                                                                                           |
| `flow.kind.hint`                | It's printed on the card. A debit or prepaid card says so on its face.                                                                | זה מודפס על הכרטיס. על כרטיס חיוב מיידי או נטען כתוב את זה.                                               |
| `kinds.credit`                  | Credit                                                                                                                                | אשראי                                                                                                     |
| `kinds.creditHint`              | Billed once a month                                                                                                                   | מחויב פעם בחודש                                                                                           |
| `kinds.debit`                   | Debit                                                                                                                                 | חיוב מיידי (דביט)                                                                                         |
| `kinds.debitHint`               | Taken from your bank account right away                                                                                               | יורד מחשבון הבנק מיד                                                                                      |
| `kinds.prepaid`                 | Prepaid                                                                                                                               | נטען                                                                                                      |
| `kinds.prepaidHint`             | You load money onto it                                                                                                                | טוענים עליו כסף מראש                                                                                      |
| `kinds.gift`                    | Gift                                                                                                                                  | מתנה                                                                                                      |
| `kinds.giftHint`                | A gift card or voucher with money on it                                                                                               | כרטיס מתנה או שובר עם סכום עליו                                                                           |
| `kindName.credit`               | Credit card                                                                                                                           | כרטיס אשראי                                                                                               |
| `kindName.debit`                | Debit card                                                                                                                            | כרטיס חיוב מיידי                                                                                          |
| `kindName.prepaid`              | Prepaid card                                                                                                                          | כרטיס נטען                                                                                                |
| `kindName.gift`                 | Gift card                                                                                                                             | כרטיס מתנה                                                                                                |
| `kindTag.debit`                 | Debit                                                                                                                                 | דביט                                                                                                      |
| `kindTag.prepaid`               | Prepaid                                                                                                                               | נטען                                                                                                      |
| `flow.switched.debit`           | This is a debit card. It's taken from your account right away, not billed monthly.                                                    | זה כרטיס חיוב מיידי. הכסף יורד מהחשבון מיד, לא בחיוב חודשי.                                               |
| `flow.switched.prepaid`         | This is a prepaid card. You load money onto it, and it isn't billed monthly.                                                          | זה כרטיס נטען. טוענים עליו כסף מראש, והוא לא מחויב פעם בחודש.                                             |
| `flow.switched.undo`            | Undo                                                                                                                                  | ביטול                                                                                                     |
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
| `flow.type.prepaidBank`         | The bank, if a bank gave it to you                                                                                                    | הבנק, אם קיבלתם אותו מבנק                                                                                 |
| `flow.account.title`            | Which account does it take money from?                                                                                                | מאיזה חשבון יורד הכסף?                                                                                    |
| `flow.account.hint`             | The money leaves this account on the day of each purchase.                                                                            | הכסף יורד מהחשבון הזה ביום של כל קנייה.                                                                   |
| `flow.account.whichBank`        | Which bank is it at?                                                                                                                  | באיזה בנק הוא?                                                                                            |
| `flow.account.noAccounts`       | Add your bank accounts on the Bank accounts screen to link this card to one.                                                          | הוסיפו את חשבונות הבנק במסך ״חשבונות בנק״ כדי לקשר את הכרטיס לאחד מהם.                                    |
| `flow.runBy.title`              | Which company runs the card?                                                                                                          | איזו חברה מתפעלת את הכרטיס?                                                                               |
| `flow.runBy.hint`               | It's printed on the card, next to your bank's name.                                                                                   | זה מודפס על הכרטיס, ליד שם הבנק.                                                                          |
| `flow.runBy.dontKnow`           | I don't know                                                                                                                          | לא ידוע לי                                                                                                |
| `flow.issuedBy.title`           | Who issued the card?                                                                                                                  | מי הנפיק את הכרטיס?                                                                                       |
| `flow.issuedBy.hint`            | If your bank gave it to you, choose the company printed on it.                                                                        | אם קיבלתם אותו מהבנק, בחרו את החברה שמודפסת עליו.                                                         |
| `flow.card.title`               | Your card                                                                                                                             | פרטי הכרטיס                                                                                               |
| `flow.card.hint`                | Only the last 4 digits are kept, never the rest of the number.                                                                        | נשמרות רק 4 הספרות האחרונות, אף פעם לא שאר המספר.                                                         |
| `flow.card.networkFixed`        | Network: {{network}}                                                                                                                  | מותג: {{network}}                                                                                         |
| `flow.card.networkNone`         | None                                                                                                                                  | אין                                                                                                       |
| `flow.card.owner`               | Whose card?                                                                                                                           | של מי הכרטיס?                                                                                             |
| `flow.billing.title`            | When is the card billed?                                                                                                              | מתי הכרטיס מחויב?                                                                                         |
| `flow.billing.dayHint`          | The day the bank pays the card each month. With it, your balance counts each purchase on the day the money really leaves the account. | היום שבו הבנק משלם את הכרטיס בכל חודש. כשהוא מוגדר, היתרה סופרת כל קנייה ביום שבו הכסף באמת יורד מהחשבון. |
| `flow.billing.usual`            | Usual for {{company}}                                                                                                                 | המועדים של {{company}}                                                                                    |
| `flow.billing.notInApp`         | An account not in the app                                                                                                             | חשבון שלא באפליקציה                                                                                       |
| `flow.billing.noAccounts`       | Add your bank accounts on the Bank accounts screen to say which one pays this card.                                                   | הוסיפו את חשבונות הבנק במסך ״חשבונות בנק״ כדי לציין מאיזה חשבון משולם הכרטיס.                             |
| `flow.moneyIn.title`            | How does money get onto it?                                                                                                           | איך נטען עליו כסף?                                                                                        |
| `flow.moneyIn.from`             | Loaded from                                                                                                                           | מקור הטעינה                                                                                               |
| `flow.moneyIn.elsewhere`        | Somewhere else                                                                                                                        | ממקום אחר                                                                                                 |
| `flow.moneyIn.balance`          | Balance on the card now                                                                                                               | היתרה בכרטיס עכשיו                                                                                        |
| `flow.moneyIn.balanceHint`      | We count it like cash: loading moves your money, spending lowers your balance.                                                        | נספור אותה כמו מזומן: טעינה מעבירה את הכסף, וקנייה מורידה את היתרה.                                       |
| `flow.moneyIn.capHint`          | Most prepaid cards hold up to ₪1,000.                                                                                                 | ברוב הכרטיסים הנטענים אפשר להחזיק עד 1,000 ₪.                                                             |
| `flow.giftIssuer.title`         | Who issued the gift card?                                                                                                             | מי הנפיק את כרטיס המתנה?                                                                                  |
| `flow.giftIssuer.hint`          | It's on the card or in the message it came in.                                                                                        | זה מופיע על הכרטיס או בהודעה שבה הגיע.                                                                    |
| `flow.giftIssuer.name`          | Name                                                                                                                                  | שם                                                                                                        |
| `flow.gift.lastHint`            | Only if a number is printed on it. Never the code or PIN you pay with.                                                                | רק אם מודפס עליו מספר. אף פעם לא הקוד או ה־PIN שמשלמים בהם.                                               |
| `flow.gift.expiresHint`         | We'll remind you a month before.                                                                                                      | נזכיר לכם חודש לפני.                                                                                      |
| `flow.gift.acceptedAt`          | Where it's accepted                                                                                                                   | איפה מכבדים אותו                                                                                          |
| `flow.gift.acceptedHint`        | For example "60 chains" or "BuyMe spa".                                                                                               | למשל ״60 רשתות״ או ״BuyMe ספא״.                                                                           |
| `flow.value.title`              | How much is on it?                                                                                                                    | כמה כסף יש עליו?                                                                                          |
| `flow.value.hint`               | A gift card isn't counted in your balance. Spending with it shows in your categories.                                                 | כרטיס מתנה לא נספר ביתרה. קניות בו מופיעות בקטגוריות.                                                     |
| `flow.value.amount`             | Amount on the card                                                                                                                    | הסכום בכרטיס                                                                                              |
| `flow.value.received`           | Date received                                                                                                                         | תאריך הקבלה                                                                                               |
| `flow.fees.title`               | What does the card charge?                                                                                                            | כמה הכרטיס גובה?                                                                                          |
| `flow.fees.linkedHint`          | Filled in from the published rates for this card. Change anything your statement says differently.                                    | מולא לפי התעריפים שפורסמו לכרטיס הזה. אפשר לשנות כל מה שבדף הפירוט כתוב אחרת.                             |
| `flow.fees.manualHint`          | Copy these from your statement or welcome letter. Leave out what you don't know.                                                      | העתיקו אותם מדף הפירוט או ממכתב הצירוף. מה שלא ידוע אפשר להשאיר ריק.                                      |
| `flow.fees.bankFee`             | Set by your bank                                                                                                                      | נקבע על ידי הבנק                                                                                          |
| `flow.fees.seeAll`              | See all rates and change them                                                                                                         | כל הריביות, ואפשרות לשנות                                                                                 |
| `flow.cost.title`               | What does the card cost?                                                                                                              | כמה עולה הכרטיס?                                                                                          |
| `flow.cost.debitFeeHint`        | Set by your bank. Banks may charge up to ₪7 a month.                                                                                  | נקבע על ידי הבנק. בנקים רשאים לגבות עד 7 ₪ בחודש.                                                         |
| `flow.cost.fxHint`              | Usually about 3%.                                                                                                                     | בדרך כלל כ־3%.                                                                                            |
| `flow.cost.loadFee`             | Fee for each load                                                                                                                     | עמלה על כל טעינה                                                                                          |
| `flow.cost.loadFeeHint`         | As your statement shows it.                                                                                                           | כמו שמופיע בדף הפירוט.                                                                                    |
| `flow.review.title`             | Check and save                                                                                                                        | בדיקה ושמירה                                                                                              |
| `flow.review.name`              | Name                                                                                                                                  | שם                                                                                                        |
| `flow.review.nameHint`          | How the card is shown across the app.                                                                                                 | כך הכרטיס יוצג בכל האפליקציה.                                                                             |
| `flow.review.kind`              | Kind                                                                                                                                  | סוג                                                                                                       |
| `flow.review.notSet`            | Not set                                                                                                                               | לא הוגדר                                                                                                  |
| `flow.review.change`            | Change                                                                                                                                | שינוי                                                                                                     |
| `flow.review.duplicate`         | You already have {{name}}.                                                                                                            | {{name}} כבר קיים אצלכם.                                                                                  |
| `flow.review.openIt`            | Open it                                                                                                                               | לפתוח אותו                                                                                                |
| `flow.name.debit`               | Debit                                                                                                                                 | דביט                                                                                                      |
| `flow.name.giftUntil`           | {{name}} · until {{month}}                                                                                                            | {{name}} · עד {{month}}                                                                                   |
| `flow.discard.title`            | Discard this card?                                                                                                                    | לוותר על הכרטיס?                                                                                          |
| `flow.discard.body`             | Nothing you entered is kept.                                                                                                          | שום דבר ממה שהזנתם לא יישמר.                                                                              |
| `flow.discard.confirm`          | Discard                                                                                                                               | לוותר                                                                                                     |
| `flow.discard.keep`             | Keep going                                                                                                                            | להמשיך                                                                                                    |
| `flow.discardChanges.title`     | Discard your changes?                                                                                                                 | לבטל את השינויים?                                                                                         |
| `flow.convert.title`            | Change this card's kind?                                                                                                              | לשנות את סוג הכרטיס?                                                                                      |
| `flow.convert.body`             | Its past purchases will be counted again the way the new kind counts them. Details that don't fit are removed.                        | הקניות הקודמות בכרטיס ייספרו מחדש לפי הסוג החדש. פרטים שלא מתאימים לו יימחקו.                             |
| `flow.convert.confirm`          | Change                                                                                                                                | לשנות                                                                                                     |
| `flow.convert.blocked`          | This card still has payments to come on instalments or credit. It can change kind once they are paid.                                 | בכרטיס הזה עוד יש תשלומים עתידיים בתשלומים או בקרדיט. אפשר לשנות את הסוג אחרי שישולמו.                    |
| `flow.added`                    | {{name}} added                                                                                                                        | {{name}} נוסף                                                                                             |
| `flow.finishSetup`              | Finish setting up                                                                                                                     | להשלמת ההגדרה                                                                                             |
| `title`                         | Cards                                                                                                                                 | כרטיסים                                                                                                   |
| `subtitle`                      | Every card you pay with, and when each one takes the money.                                                                           | כל הכרטיסים שמשלמים בהם, ומתי כל אחד מהם מוריד את הכסף.                                                   |
| `emptyTitle`                    | No cards yet                                                                                                                          | עוד אין כרטיסים                                                                                           |
| `emptyBody`                     | Add your credit, debit, prepaid and gift cards. Each purchase then counts on the day the money really leaves.                         | הוסיפו כרטיסי אשראי, חיוב מיידי, נטענים ומתנה. כל קנייה תיספר ביום שבו הכסף באמת יוצא.                    |
| `group.credit`                  | Credit cards                                                                                                                          | כרטיסי אשראי                                                                                              |
| `group.debit`                   | Debit cards                                                                                                                           | כרטיסי חיוב מיידי                                                                                         |
| `group.prepaid`                 | Prepaid cards                                                                                                                         | כרטיסים נטענים                                                                                            |
| `group.gift`                    | Gift cards                                                                                                                            | כרטיסי מתנה                                                                                               |
| `panel.takenFrom`               | Taken from {{account}}                                                                                                                | יורד מ{{account}}                                                                                         |
| `panel.noAccount`               | No account yet                                                                                                                        | עוד אין חשבון                                                                                             |
| `panel.left`                    | Left on the card                                                                                                                      | נשאר בכרטיס                                                                                               |
| `panel.leftOf`                  | {{left}} left of {{value}}                                                                                                            | נשארו {{left}} מתוך {{value}}                                                                             |
| `panel.loadedFrom`              | Loaded from {{source}}                                                                                                                | נטען מ{{source}}                                                                                          |
| `panel.loads`                   | Loads {{card}}                                                                                                                        | טוען את {{card}}                                                                                          |
| `panel.noBalance`               | No balance yet                                                                                                                        | עוד אין יתרה                                                                                              |
| `panel.noValue`                 | No value yet                                                                                                                          | עוד אין סכום                                                                                              |
| `panel.updateBalance`           | Update the balance                                                                                                                    | עדכון היתרה                                                                                               |
| `panel.useBy`                   | Use by {{month}}                                                                                                                      | בתוקף עד {{month}}                                                                                        |
| `panel.giftSoon`                | Expires {{month}}, with {{left}} left.                                                                                                | התוקף נגמר ב־{{month}}, ונשארו עליו {{left}}.                                                             |
| `panel.giftExpired`             | Expired with {{left}} left.                                                                                                           | פג התוקף, ונשארו עליו {{left}}.                                                                           |
| `unfinished.noBillingDay_one`   | 1 card has no billing day yet.                                                                                                        | לכרטיס אחד עוד אין מועד חיוב.                                                                             |
| `unfinished.noBillingDay_two`   | (Hebrew only)                                                                                                                         | לשני כרטיסים עוד אין מועד חיוב.                                                                           |
| `unfinished.noBillingDay_other` | {{count}} cards have no billing day yet.                                                                                              | ל־{{count}} כרטיסים עוד אין מועד חיוב.                                                                    |
| `unfinished.noAccount_one`      | 1 debit card isn't linked to an account yet.                                                                                          | כרטיס חיוב מיידי אחד עוד לא מקושר לחשבון.                                                                 |
| `unfinished.noAccount_two`      | (Hebrew only)                                                                                                                         | שני כרטיסי חיוב מיידי עוד לא מקושרים לחשבון.                                                              |
| `unfinished.noAccount_other`    | {{count}} debit cards aren't linked to an account yet.                                                                                | {{count}} כרטיסי חיוב מיידי עוד לא מקושרים לחשבון.                                                        |
| `unfinished.giftSoon_one`       | 1 gift card expires soon with money left.                                                                                             | לכרטיס מתנה אחד נגמר התוקף בקרוב, ויש עליו כסף.                                                           |
| `unfinished.giftSoon_two`       | (Hebrew only)                                                                                                                         | לשני כרטיסי מתנה נגמר התוקף בקרוב, ויש עליהם כסף.                                                         |
| `unfinished.giftSoon_other`     | {{count}} gift cards expire soon with money left.                                                                                     | ל־{{count}} כרטיסי מתנה נגמר התוקף בקרוב, ויש עליהם כסף.                                                  |
| `profiles:builtin.wallet`       | Bit / PayBox                                                                                                                          | ביט / פייבוקס                                                                                             |

**Reused as they are:**

- `cards:add`, `cards:issuer.*`, `cards:network.*`, `cards:catalog.noBank`, `catalog.notListed`, `catalog.tier`, `catalog.club`, `catalog.noClub`, `catalog.loading`, `catalog.loadFailed`, `catalog.suggest`, `catalog.link`, `catalog.notNow` and `catalog.keep*`;
- `cards:edit.*` field labels and hints, `cards:color.*`, `cards:rates.*`, `cards:cardMenu.edit`;
- `cards:edit.theCard`, `edit.billing` and `edit.charges` as the summary's section names, with two new ones in the same place: `edit.moneyIn` ("Money in", "טעינה") and `edit.value` ("Value", "סכום");
- `profiles:method.bank_transfer`, `method.standing_order` and `method.other` as the built-ins' names;
- `categories:manage.methodShared`, `common:action.save` and `common:action.cancel`.

**Changed:** `cards:title`, `subtitle`, `emptyTitle` and `emptyBody`, to the rows above. Today they say "Credit cards".

**Removed** with the old form: `cards:edit.issuer` ("Card company (manual)"), `edit.kind` ("Issued by"), `edit.bankOfCard`, `edit.bankDebited`, `edit.debitedOther`, `catalog.title` ("Who issues this card") and `catalog.pending`. With "Other ways to pay": `cards:other.title`, `other.body`, `other.add` and `other.builtin`, and `categories:manage.methodType` if nothing else reads it. Before removing a key, the plan checks for other readers.

`gate:pci` scans the i18n JSON too. None of these strings names a card number, a code field or a full expiry. "Valid until" is the existing month-and-year field. The gift card's hint names "the code or PIN" only to say it is never kept, and contains none of the forbidden names.

## 16. Accessibility, keyboard and RTL

- **Focus on each step:** each step's heading is an `h2` with `tabIndex={-1}`. On every step change, focus moves to it.
- **Announcing the step:** "Step 4 of 8" is a visible line linked to the heading by `aria-describedby`, so a screen reader reads "Which card is it? Step 4 of 8" as focus lands. The progress bar is `aria-hidden`, because the line says the same.
- **The pop-out's name and description:** the dialog is named by the flow title ("Add a card" or "Edit card"). Its description is the current step's line.
- **Choice lists:**
  - Each is a `radiogroup` named by the step heading. The kind tiles are one too, each tile's hint linked by `aria-describedby`.
  - Arrow keys move focus, and Enter, Space or a tap choose (2.4).
  - In Hebrew, the arrow keys follow the reading direction.
  - A choice that moves on announces nothing extra, because the next heading takes focus.
  - The "Debit" and "Prepaid" tags on a type are part of its accessible name ("Direct / ISRACASH, Debit").
- **The switch notice** (section 3.5) is a `role="status"` line, so it is read after the new heading. Its Undo is a real button, reachable by Tab.
- **Errors:** an error is shown at its field, linked with `aria-describedby`, and the field is focused (`aria-invalid`).
- **Touch targets:** every tile, chip, swatch and button is at least 44 by 44 px. The colour swatches grow from today's 36 px height to 44.
- **Footer and close button:** the footer buttons are `h-11`, and the close button is `size-11`.
- **Escape:** closes the pop-out under the discard rule (4.5). Inside a confirm dialog, Escape only closes that dialog.
- **The Cards screen:** the kind groups are `section`s named by their `h2`, and each card's heading is an `h3` under it (section 9.1).
- **RTL:**
  - Logical properties only (`gate:rtl`).
  - Back and Next arrows are mirrored in Hebrew.
  - Numbers, "·1234" and "03/31" are left-to-right isolates.
  - Logos are never mirrored.
- **Phone fit:** every step fits a 320 px phone in Hebrew without sideways scrolling. Long bank and club names wrap.

## 17. Edge cases

| Situation                                                                | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The catalog fails to load                                                | Steps 1 and 2 work, since the kinds and companies are constants. A credit card's step 3 offers "Not through a bank" and a bank name field. The type step is free text. The fees step is editable fields. The card saves unlinked. It can be linked later from the summary's offer.                                                                                                                                           |
| The catalog is still loading at the bank or type step                    | "Loading the card list…" with the plain choices. The list appears when it loads, and nothing chosen is lost.                                                                                                                                                                                                                                                                                                                 |
| A company with no clubs (Amex has 2 and Diners 2, so today none)         | The club part never shows, and picking a type moves on.                                                                                                                                                                                                                                                                                                                                                                      |
| A company with exactly one type                                          | The type step is skipped, the type is set, and the total drops by one.                                                                                                                                                                                                                                                                                                                                                       |
| Company Other                                                            | The card is unlinked. Every bank is offered, the type is free text, all five networks are offered, and the billing days are 2 / 10 / 15. The name uses the typed company name.                                                                                                                                                                                                                                               |
| Changing the company after later steps                                   | Answers that no longer fit are cleared. Answers that still fit stay. The name keeps following unless edited.                                                                                                                                                                                                                                                                                                                 |
| Archived bank accounts                                                   | Not offered as "Paid from", a debit card's account, or "Loaded from". A card already using one shows it, marked "Archived".                                                                                                                                                                                                                                                                                                  |
| An account deleted on another device while the flow is open              | It drops out of the list. If it was picked, the choice clears to none and the owner stays.                                                                                                                                                                                                                                                                                                                                   |
| Editing a linked card that has overrides                                 | Changing the company, the bank or the type asks "Keep the rates you entered?" before anything changes, as today.                                                                                                                                                                                                                                                                                                             |
| Editing a linked card into an escape                                     | It unlinks. The rates the catalog filled stay as the card's own fields.                                                                                                                                                                                                                                                                                                                                                      |
| A one-person household                                                   | "Whose card?" is hidden, and the owner is that person.                                                                                                                                                                                                                                                                                                                                                                       |
| Same kind, company and last 4 as an archived card                        | No warning, because only live cards count.                                                                                                                                                                                                                                                                                                                                                                                   |
| Smart import found everything                                            | The flow opens on review with every value tagged "From your statement".                                                                                                                                                                                                                                                                                                                                                      |
| Smart import found a bank or type the catalog doesn't know               | It goes into the escape fields ("My bank isn't listed" with the name, or "Not in the list" with the type), tagged as from the statement.                                                                                                                                                                                                                                                                                     |
| The pop-out is open when the language changes in another tab             | Copy follows the language. A name that is still following is re-suggested in the new language. An edited name stays.                                                                                                                                                                                                                                                                                                         |
| Save fails                                                               | A toast. The pop-out stays on review with everything. For a pot kind, neither the card nor its start move is kept.                                                                                                                                                                                                                                                                                                           |
| A transaction sheet opened for an edit (not a new purchase)              | "Add a card" is offered all the same. Saving selects the new card on the transaction being edited, if it fits the mode.                                                                                                                                                                                                                                                                                                      |
| **A debit card with no account yet**                                     | The household has no accounts, or the person chose "An account not in the app", or skipped. The card saves with `bank` only, or nothing. Its purchases still settle on their dates, so the balance is right. The panel and the notice show "Finish setting up" (section 8).                                                                                                                                                  |
| **An existing `debit_card` row with no `card`**                          | Made in "Other ways to pay" before this change. `cardKindOf` reads it as Debit. It shows in the Debit group with its label, "No account yet" and "Finish setting up". Opening it shows the summary with every row "Not set". Nothing is written until the person saves a step.                                                                                                                                               |
| **Converting a card's kind on edit**                                     | Section 7.1: a question first, blocked from Credit while plans are open, fields that don't fit removed on save, pot moves kept but unread. Past purchases are counted again the new kind's way.                                                                                                                                                                                                                              |
| **A gift card's expiry**                                                 | In its last two months (`expiryStatus` `'soon'`) with money left, the panel says "Expires {{month}}, with {{left}} left." and the notice counts it. After the month, "Expired with {{left}} left." The pot is outside the balance, so expiring changes no figure. Spending recorded after it still counts against the pot.                                                                                                   |
| A gift card with no expiry                                               | It never reminds. The panel shows no "Use by" line.                                                                                                                                                                                                                                                                                                                                                                          |
| A gift card spent past its value                                         | The pot goes below zero, and the panel shows it honestly. The balance is unaffected.                                                                                                                                                                                                                                                                                                                                         |
| **A prepaid card loaded from a credit card**                             | `loadCardId` names the credit card. A load is a purchase on that card (section 12.3), built in the follow-up. Until then there is no load action, and the person tops the card up with "Update the balance". A load typed by hand as an expense on the credit card would count twice, once there and once as the prepaid card's spending. Until the follow-up, the spec accepts that risk rather than add a half-built load. |
| A prepaid card's loading credit card is archived or deleted              | `loadCardId` keeps the id. The panel shows "Loaded from a credit card". The fee line falls back to the prepaid card itself.                                                                                                                                                                                                                                                                                                  |
| Picking a debit or prepaid type under Credit, then Back to the kind step | The kind step shows the switched kind as chosen. Choosing Credit again keeps the type cleared.                                                                                                                                                                                                                                                                                                                               |
| A custom transfer, wallet or "Other" row the person made                 | Its transactions keep it. The picker shows it only on those transactions. It is not listed on any screen (sections 9.3, 10.3).                                                                                                                                                                                                                                                                                               |
| A `type` this build doesn't know arrives from a later build              | The row is kept and shown as "Other". It is not on the Cards screen. Its transactions keep it.                                                                                                                                                                                                                                                                                                                               |
| A `funding` this build doesn't know                                      | The card shows as a debit card, and its purchases settle on their dates.                                                                                                                                                                                                                                                                                                                                                     |

## 18. Tests

### 18.1 Domain

**`card-flow.test.ts`:**

- `stepsFor`:
  - credit: all eight steps; the type step dropped with one type and no clubs; the club part only with clubs; Other;
  - debit: six steps, never a billing, limit or rates step;
  - prepaid: seven steps, and six with one prepaid type and no prepaid clubs;
  - gift: five steps.
- `firstOpenStep`:
  - an empty card → step 1;
  - a credit card with company and last 4 known → step 3;
  - a credit card with everything but the billing day → step 6;
  - a debit card with no account → step 2;
  - everything → review.
- `banksFor`: each company, from the catalog's own data. Every bank returned issues that company. `issuersForBank` with `funding: 'debit'` never returns Amex or Diners.
- `networksFor`:
  - Amex is fixed;
  - Diners is fixed, and the Diners Mastercard type gives Mastercard;
  - Isracard, Cal, Max and Other offer their sets;
  - a debit Isracard card offers Isracard / Mastercard; a gift card offers all five and none.
- `billingDaysFor`: a linked bank card at Discount gives the bank's days; a linked non-bank card gives the company's; an unlinked card with a company; nothing known gives 2 / 10 / 15.
- `kindFromCatalog` and `switchKind`: every entry of section 3.5 gives its kind; `digital` and `cashcal` give credit; the switch keeps the company, type and bank, and Undo restores Credit with the type cleared.
- `fieldsFor` and `methodFromState`:
  - a credit card writes exactly what `MethodForm` wrote for the same answers, including the `issuerName` round trip and unknown keys kept on an edit, and no `funding`;
  - a debit card writes `type: 'debit_card'`, `funding: 'debit'`, `kind: 'bank'`, the account and bank, and no billing day, limit, rate, discount or overrides, even when the state holds them;
  - a prepaid card writes `loadCardId` or `accountId`, `loadFeeMinor`, and a `start` move when the balance is filled;
  - a gift card writes `issuer: 'other'` and `issuerName: 'BuyMe'` for BuyMe, `acceptedAt`, and a `start` move on the date received.
- `suggestedName`:
  - a non-bank card, a bank card, a club in place of the type;
  - a debit card with and without a type; a prepaid card; a gift card with and without an expiry;
  - no last 4, Other with and without a typed name, nothing known for each kind;
  - Hebrew;
  - the isolates around "·1234" and "03/31";
  - following until edited, and following again after clearing.
- **Owner:** follows the paying account, the debit account and the loading card until touched; one-person household.
- `duplicateOf`: same kind, company and digits; another kind; another company; a card with no digits; archived; deleted.
- **Discarding:** the first three screens close without asking, the fourth and later ask, for each kind.
- `canChangeKind`: blocked from Credit with an open plan or an unbilled 30+ purchase; allowed otherwise; allowed between debit and prepaid.

**`cards.test.ts`:**

- `cardKindOf`: every row of section 13.3, including no `card` and an unknown `funding`.
- `countsInBalance`: false only for an expense paid with a gift card; true for income and for every other kind.
- `splitBySettlement`: a debit purchase settles on its date; a gift purchase is in neither list.
- `cardFeeOccurrences` and `chargesFeeIn`: a debit and a prepaid card's fee at month end on its own date; a prepaid card's fee paid with its `loadCardId`; never a gift card.
- `fxFeeFor`: a debit card's fee is applied off the shekel; a gift card has none.

**`card-pots.test.ts`:** `cardPot` with a start only; spending after it; a same-day row written before and after the start; an unknown move kind counts 0; two starts, the earliest counts; deleted moves ignored; going below zero.

**`tx-options.test.ts`:**

- `methodTypeOf`: an unknown type reads as `'other'`.
- `methodFits`: a debit, prepaid or gift card takes one-time, monthly and yearly, and not תשלומים, the credit modes, a loan or a standing order.
- `standingViaOf`: `debit_card` gives `undefined`.
- `methodsFor`: the six built-ins always; a custom row of a built-in type only as `keepId`; cards and accounts as today.

**Built-ins:** `isBuiltinPaymentMethod` and `methodDisplayName` for all six, in both languages. The repo refuses to rename, reassign, delete or archive each new one.

### 18.2 Schema, sync and older builds

- `funding`, `loadCardId`, `loadFeeMinor`, `acceptedAt` and `issuerName` pass `cardSchema`, round-trip through export and import, the sync apply path and an edit, and keep their values.
- An unknown `funding` string passes `cardSchema`.
- An unknown `type` passes `paymentMethodSchema`, a sync apply stores it as received, a file import accepts it, and an edit keeps it.
- `cardMoves` rows pass their schema and round-trip. A file without `cardMoves` imports.
- `ensureBuiltinPaymentMethods`:
  - on an older database, adds the four with the fixed `createdAt` and queues each at the rev of `BUILTIN_METHODS_SINCE`;
  - does nothing for a row this device already holds;
  - re-adds a row whose sync state is a deletion, as a tracked write with a newer rev.
- `repairIntegrity` keeps a transaction paid with `pm.transfer` once the row has arrived, and a sync from a device with the rows to one without them delivers them.
- A row without any new field still works everywhere.
- An older-shaped `debit_card` row with no `card` reads as a debit card and opens the summary.

### 18.3 Catalog

- The entries of section 3.5 carry `funding`, and no other entry does.
- `resolveCard` gives no deal or late rate for a debit or prepaid type.
- `tiersOf` and `clubsOf` with a funding filter.

### 18.4 DOM (new: `card-flow.test.tsx`, `card-summary.test.tsx`, `choice-list.test.tsx`)

- **Moving between steps:**
  - one tap on a kind moves on;
  - one tap moves on in each kind's one-tap steps;
  - arrow keys move focus without choosing or moving on;
  - Enter chooses and moves on.
- **Skip and Next:** Skip becomes Next once something is answered. Next with an unreadable field focuses it and stays.
- **Focus:** lands on each step's heading, and the "Step N of M" description is read with it.
- **Each kind to Save:** a debit card through its account, company and type; a prepaid card with a balance; a gift card from BuyMe with a value and an expiry.
- **The switch:** Isracard Direct under Credit shows the debit notice, goes to the account step, and Undo returns to Credit on the type step.
- **Escapes:** Other, "My bank isn't listed" and "Not in the list" each show their field on the same step, and the fees step shows editable fields.
- **Linking:** linking at the type step shows the real billing days and the published rates.
- **The keep-rates question** when the type changes after an override.
- **Review:** "Not set", "From your statement", the duplicate warning and "Open it", and the name following and then edited.
- **Closing:** on the first three screens it doesn't ask, and from the fourth it does.
- **The catalog fails:** the manual path all the way to Save.
- **The summary:**
  - each row opens only its step;
  - Save writes and returns;
  - Cancel with changes asks;
  - the "Link to the catalog" offer, never on a gift card;
  - opening on the fees step from "Interest table";
  - changing the kind asks, and is blocked on a credit card with a plan.
- **The nudges:** "Finish setting up" on a credit card without a billing day opens the billing step, and on a debit card without an account the account step. The notice counts both, and gift cards expiring soon with money left.
- **The Cards screen:** groups by kind with headings only for two kinds or more; no "Other ways to pay"; an empty `debit_card` row in the Debit group; a gift card's "left of" line.
- **"Paid with":** the order of section 10.1; the six built-ins in their order; a custom transfer row only on its own transaction; no debit card in a תשלומים purchase.

### 18.5 Existing tests that change

| File                                                              | Change                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/cards/method-editor.test.tsx`                       | Credit-card cases (the "Label" field, the "Bank" and "Card company" radiogroups, "Network", "Save") move to `card-flow.test.tsx`. `OtherMethods` cases go. The rest asserts the form has no Type switch and edits a bank account.                 |
| `src/features/cards/cards-screen-menu.test.tsx`                   | "Edit card" opens the summary. "Interest table" opens the fees step with the rate table focused, not the sheet's `[data-section="rates"]`, and is not offered on a debit card.                                                                    |
| `src/features/cards/card-menu.test.tsx`                           | Only where it follows an action into the editor's heading.                                                                                                                                                                                        |
| `src/features/cards/card-fields-rates.test.tsx`                   | Becomes `step-fees.test.tsx`: the same rate and override cases through credit step 7 (`rate-<kind>` test ids kept).                                                                                                                               |
| `src/features/cards/issuer-chooser.test.tsx`                      | Replaced. Narrowing goes to the domain tests and `step-bank` / `step-type` tests, the keep-rates question to `step-type`, and "Who issues this card" and the suggestion to `card-summary.test.tsx`.                                               |
| `src/features/cards/rate-table.test.tsx`                          | Only the cases that render it through `CardFields`. They render it through the fees step instead.                                                                                                                                                 |
| `src/features/cards/unfinished-notice.test.tsx`                   | Adds the no-billing-day, no-account and gift-expiring counts and their links.                                                                                                                                                                     |
| `src/features/import/import-sheet.test.tsx`                       | Finishing a found card opens at the first missing step, the tags show on review, and Save moves to the next unfinished card. An update to a known card shows the summary. A found Direct card opens as debit.                                     |
| `src/features/transaction/transaction-sheet.test.tsx`             | "Add a card" in the picker opens the flow over the form, on the kind step, or past it in a credit-only mode. Save selects the card and copies its rate into a credit plan. "Open the card" opens the fees step. The picker's order and built-ins. |
| `src/domain/tx-options.test.ts`                                   | `standingViaOf` for `debit_card`, and the new `methodFits` and `methodsFor` rules.                                                                                                                                                                |
| `src/domain/cards.test.ts`                                        | The widened fee and FX functions, `cardKindOf` and `countsInBalance`.                                                                                                                                                                             |
| `src/db/seed.test.ts`, `src/db/repos/payment-methods.test.ts`     | Six built-ins, their guards, and `ensureBuiltinPaymentMethods`' upload.                                                                                                                                                                           |
| `src/domain/transfer-schema.test.ts`, `transfer-validate.test.ts` | The new card fields, the open `type`, and `cardMoves`.                                                                                                                                                                                            |
| `src/db/integrity.test.ts`                                        | A transaction on a new built-in is never cleared once the row exists. A `cardMoves` row whose card is gone is reported.                                                                                                                           |
| `e2e/14-cards.spec.ts`                                            | The add path goes through the steps, from the kind. The account offered to a new card moves to the billing step. The 320 px logos test covers the kind, company and bank steps. A debit card is added.                                            |
| `e2e/card-catalog.spec.ts`                                        | "Max through Mizrahi, International" goes in steps 1 to 4. The rates are checked on the fees step and again after saving.                                                                                                                         |
| `e2e/02-transaction-type.spec.ts`                                 | Wherever it creates a card through the old form.                                                                                                                                                                                                  |

### 18.6 Browser (en and he)

- **Add a credit card:** Credit · Max · Leumi · Platinum · 1234, Visa, billing day 10, paid from a household account. The name suggestion should read "Max · Leumi Platinum ·1234" ("מקס · לאומי פלטינום ·1234" in Hebrew). Save, and the card appears with its next bill on the 10th.
- **Add a debit card:** Debit · a Hapoalim account · Isracard · Direct · 5678. It appears under Debit cards, "Taken from" that account, and a purchase on it lowers the balance the same day.
- **Add a gift card:** Gift · BuyMe · valid until two months from now · ₪300. It appears under Gift cards with "₪300 left of ₪300", the notice counts it as expiring soon, and a ₪100 purchase with it leaves the balance unchanged and shows "₪200 left".
- **The switch:** Credit · Isracard · Direct shows the notice, and Undo works.
- **Keyboard only:** the credit path, checking focus on each heading.
- **Discard:** at the fourth screen.
- **Add a card from the transaction form,** then a קרדיט plan picks up its rate.
- **"Paid with":** the built-ins are there in both languages, with no way to add or edit them.
- **Smart import:** a statement with no billing day opens on the billing step.
- **Axe:** with each step open, the summary open, the Cards screen with all four groups, and every confirm dialog open.
- **Every new control at 44 px.**
- **Each step at 320 px in Hebrew,** with no sideways scroll.
- **Reduced motion:** steps change instantly.

## 19. Build order

1. **Data and domain, before any screen.** These can land at any time, in one release:
   - the open `type` (`methodTypeOf`) and every reader through it;
   - the four built-ins, their seeding and upload, `methodDisplayName`, and the "Paid with" order;
   - `funding` and the other card fields, `cardKindOf`, `countsInBalance`, and the widened fee functions;
   - the `cardMoves` table, `cardPot`, and the catalog's `funding`;
   - `issuerName`, the domain module, `gate:pci`'s new names, and their tests.
2. The app-wide colourful redesign sets the new tokens and fonts.
3. Then the screens: the pop-out, the steps, the summary, the Cards screen's groups and panels, the callers, and then removing `CardFields`, `IssuerChooser` and `OtherMethods`.
   - The screens use only tokens. Anything the redesign gives cards (a card-face style, a tile style) is used as it lands, not copied ahead of it.
   - The screenshot matrix (`e2e/screens.spec.ts`) gains the add flow, the summary and the grouped Cards screen once they are built.
4. **Card pots**, the follow-up spec (section 12.2).

## 20. Out of scope

- The bank account flow. It keeps `MethodForm` for now, without a Type switch.
- **Card pots** beyond the start move: loading, unloading and counting, the pot's history, load fees as expenses, a credit card's bill showing a load, and import matching for loads (section 12.2).
- A new `PaymentMethodType` such as `'prepaid_card'` or `'gift_card'`. This release only makes it safe to add one later (section 13.4).
- Moving custom transfer, wallet, "Other", cash or cheque rows into the built-ins, or a screen to manage them (section 10.3).
- Debit spending limits (decision 22).
- Income paid onto a prepaid or gift card, such as a refund.
- Matching a debit purchase on a bank statement to the debit card. How each bank marks it needs sample statements (research, open question 3).
- Adding the missing catalog entries: נטענצ'יק, Mastercard Direct, Isracard GiftCard, and the banks' own debit and prepaid cards (research §4.2).
- Drafts or resuming a half-added card. Closing discards it (decision 14).
- Inferring the network beyond decision 10, for example from the type's name or from the last 4 digits.
- Bank card fees in the catalog. A bank card's fee, and every debit card's, stays "Set by your bank", with a field.
- Asking which bank a card not through a bank is paid from, when the account isn't in the app.
- Archive or delete from the summary. The card menu has them.
