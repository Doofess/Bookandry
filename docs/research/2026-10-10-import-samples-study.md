# Import samples study: real Israeli bank and card exports vs Smart import

Date: 2026-10-10. Branch: `research/open-banking`.

## What this is

I studied a set of real exports and screenshots from one household: 14 spreadsheets, 2 PDFs and 8 screenshots, from Max, Discount Bank and a Cal-issued Discount card. The goal is to make Smart import read them exactly and stop it creating duplicates. **This document contains no personal data.** There are no names, no card or account digits, no real amounts, no real merchants and no purchase dates. Every example value below is **invented** and marked _(invented)_. The evidence with real values is kept outside the repo.

Labels:

- **[V]**: verified by script on the real files.
- **[V-app]**: verified by running the app's own deterministic code offline: `mapByDictionary`, `readSheet`, `collapseOverlaps` and `draftOf`, bundled from `src/` with no network.
- **[I]**: inferred from reading code or looking at screenshots. Nothing was sent to a model.

## 1. Inventory

| Group | Institution                        | What                                                                                                   | Files | Rows          | Language                       |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ | ----- | ------------- | ------------------------------ |
| F1    | Max                                | "transaction-details_export_*.xlsx": one card per file, ~16 months, 1-3 sheets                         | 3     | 327           | Hebrew, English merchant names |
| F2    | Discount Bank (card issued by Cal) | "כרטיסי אשראי_*.xlsx": one _charge month_ of all the account's bank cards per file                     | 10    | 281           | Hebrew                         |
| F3    | Discount Bank                      | the same file name, but a 12-month summary of charge totals                                            | 1     | 0 (12 totals) | Hebrew                         |
| F4    | Discount Bank                      | loan PDFs: "פירוט הלוואות" (loan list) and "תנאי הלוואות" (loan terms), 1 page each, with a text layer | 2     | 0             | Hebrew                         |
| F5    | Discount web                       | home page; current-account list; bank-cards page; loans page                                           | 4     | ~35           | Hebrew                         |
| F5    | Max web                            | cards with expected charge; two loans (two overlapping captures); rates per card                       | 4     | 0             | Hebrew                         |

One person holds everything: 4 Max-serviced cards, 1 Cal-issued bank card, 1 current account, 1 bank loan and 2 card-company loans. One Discount-branded card is serviced by Max and appears on both banks' sites but in **no export**.

## 2. Formats

### F1: Max transaction-details export [V]

- **Sheets:**
  - "עסקאות במועד החיוב" (local, by charge date);
  - "עסקאות בארנק מט"ח" (FX wallet, present only if used);
  - "עסקאות חו"ל ומט"ח" (foreign and FX, present only if used).
- **Title rows 1-3:** "כל המשתמשים (1)", then `<last4>-<card name>`, then `<yyyy-mm-dd>-<yyyy-mm-dd>`. The range is joined with a hyphen, so it is ambiguous to split. The header is on **row 4**. There are no merged cells and no hidden rows or columns.
- **Headers (16):** תאריך עסקה | שם בית העסק | קטגוריה | 4 ספרות אחרונות של כרטיס האשראי | סוג עסקה | סכום חיוב | מטבע חיוב | סכום עסקה מקורי | מטבע עסקה מקורי | תאריך חיוב | הערות | תיוגים | מועדון הנחות | מפתח דיסקונט | אופן ביצוע ההעסקה | שער המרה ממטבע מקור/התחשבנות לש"ח
- **Footer:** a blank row, "סך הכל", then the total as **text** with ₪ appended (_invented:_ `"1234.56₪"`), all in column A. It equals Σ "סכום חיוב" for that sheet.
- **Dates:** text "dd-mm-yyyy" for both the transaction date and the charge date. **Amounts:** numbers. **Sign:** negative is a credit (cancellation, refund, fee waiver, loan disbursement, FX sale, wallet credit). **Last-4:** a text cell, so leading zeros survive.
- **"סוג עסקה" values:** רגילה, תשלומים, הלוואה ברגע למולטי (the card company's own loan), חיוב עסקות מיידי (debited from the bank at once, with its own charge date), תנועות בחשבון, חיוב חודשי, חיוב ארנק מטח.
- **Instalments.** The text "תשלום N מתוך M" is in **"הערות"**, not in "סוג עסקה".
  - Every payment is its own row: same purchase date, same merchant, "סכום עסקה מקורי" = the whole deal, "סכום חיוב" = this payment.
  - The export **includes payments up to the next charge date**, even when that date is in the future.
- **Loans on the card.** There is a disbursement row (negative, the full principal), a bridge-interest row, monthly repayment rows ("תשלום N מתוך 36/72") whose "original amount" is the **principal**, and odd adjustment rows labelled as the _last_ instalment ("36 מתוך 36") that are really interest or early-payment corrections.
- **"סכום עסקה מקורי" ≠ "סכום חיוב" even when both are ₪.** The card fee shows pre-VAT vs charged; an early credit repayment differs the same way.
- **Foreign rows.**
  - Usually the original is in $ or € with a numeric rate in the last column (text with a leading space).
  - Some foreign rows charged in ₪ say "חיוב עסקת חו"ל בש"ח " (with a trailing space).
  - **Some rows (a whole trip in one non-$/€ currency) have a blank original currency**; the last column then holds text such as "שער המרה מאירו לש"ח <rate>" (converted via EUR).
- **FX wallet.** Buying currency ("רכישת מט"ח", ₪, on the local sheet) funds the wallet. A foreign purchase from the wallet appears in $ on the wallet sheet, with a matching negative "זיכוי מיתרת ארנק מט"ח". The wallet sheet's total is 0.
- **Merchant names on the foreign sheet are fixed-width:** `NAME(22) CITY(13) CCC` (country code), padded with spaces. Some Hebrew names have "?" where a character was lost.
- "קטגוריה" is Max's own sector. "תיוגים", "מועדון הנחות" and "מפתח דיסקונט" were always empty.

### F2: Discount "כרטיסי אשראי" monthly [V]

- One sheet. **Title rows 1-8:** the title, "N/A", **the full account number and holder name**, the previous account number, "N/A", "פירוט עסקאות - כל הכרטיסים הבנקאיים ", "<n> עסקאות לחיוב בחודש <month> בכל הכרטיסים", and "עסקאות באשראי - סה"כ חיוב: + ₪x + ₪y …".
- **The row-8 "total" is cumulative across every month viewed in the browser session before export.** Only its last term belongs to this file. Do not trust it.
- **Header row 9 (18 headers):** כרטיס | בית עסק | תאריך עסקה | סכום העסקה | מנפיק | סוג העסקה | פירוט | תאריך החיוב | סכום החיוב | כרטיס הוצג במעמד העסקה? | מטבע העסקה | שער ההמרה | תאריך שער המרה | עמלת ההמרה | מדד בסיס | שם המועדון | אחוז הנחה | סכום הנחה.
  - Data rows have **19 cells**: the discount percentage sits one column right of its header.
- **Footer:** one disclaimer row ("הודעה,המידע באחריות חברת כרטיסי האשראי.,…").
- **Card cell:** "<network> NNNN" _(invented: "ויזה 1234")_. **Dates:** text "dd/mm/yyyy". There is one charge date per file.
- **The currency of "סכום העסקה" exists only in the cell's number format** ("₪"#,##0.00, "$"#,##0.00, "£"#,##0.00, once "ILS"#,##0.00). "מטבע העסקה", "שער ההמרה" and the rest are always blank. The rate is only in the "פירוט" text ("… הומר לש"ח בשער יציג <rate>").
- **"סוג העסקה" values:** ישראל, חו"ל, עמלה-ישראל, זיכוי-חו"ל, and blank. Refunds are negative.
- **A foreign refund converts at a different rate from the purchase**, so the two ₪ amounts differ and only the original amounts match.
- **"פירוט"** always has a leading space. It holds wallet tokens ("מזהה כרטיס NNNN Apple Pay": a _device token_, **not** the card's last-4), an internet-card token, country, standing-order notes, and Bit recipients ("העברה ל<name>").
- **A promo-discount row has the text "--" in the amount cell** and only a charged (negative) amount.
- Discount's instalment notation (seen on the web page, not in these files) is "N/M" in "פירוט", **without** "תשלום".

### F3: Discount summary [V]

- The same title rows. Header: חודש חיוב | מספר עסקאות | סכום החיוב בש"ח | סכום החיוב בדולר | סכום החיוב באירו.
- The month is text "mmyyyy"; the count is text ("<n> עסקאות").
- Each line equals the sum and count of one F2 file. It is pure duplication.

### F4: Discount loan PDFs [V]

- A text layer exists, but pdf.js returns RTL text with column order scrambled: stacked header fragments, then one data line holding the loan account, balance, value date, end date, linkage, Spitzer, monthly, rate and prime margin.
- The header block contains the holder's name, address, account numbers and branch phones.
- **The same loan has three different "balance" figures** across the PDF list, the PDF terms and the web loans page (principal vs with accrued interest). None of them is a transaction.

### F5: Screenshots [V by viewing]

- **Discount account list:** תאריך | יום ערך | תיאור התנועה | זכות/חובה ₪ | יתרה ₪. Negatives are debits. A sidebar repeats "highest transactions this month" and shows "frequent transfers".
- **Discount bank-cards page:** three separately titled sections, each with its own total or none:
  - "עסקאות אחרונות - עדיין לא נכללות בסך החיוב הקרוב" (pending);
  - "עסקאות לחיוב הקרוב" (next bill, with a total);
  - "עסקאות לחיוב מיידי - אינן נכללות בחיוב הקרוב" (immediate, with a total).
- **Max web:** card tiles with "סה"כ ב <date>"; loan tiles with "monthly repayment" and "תשלום N מתוך M"; a per-card rates table.

## 3. Overlaps and duplicates (the main finding)

### Counts in this data

| Pattern                                                              | Cases                                    | How to recognise it                                                                                                                                                                                                                     | Status       |
| -------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Same transaction in two monthly card files                           | **0**                                    | F2 files are disjoint charge months                                                                                                                                                                                                     | [V]          |
| Same transaction across F1 sheets                                    | **0**                                    | local, wallet and foreign sheets are disjoint                                                                                                                                                                                           | [V]          |
| Summary file vs monthly files                                        | 10 of 12 months, fully                   | sum and count equal                                                                                                                                                                                                                     | [V]          |
| Card company's **monthly lump** on the bank list ("מקס איט פי חיוב") | 1                                        | equals Σ of **one card's** rows with that charge date, same day                                                                                                                                                                         | [V]          |
| Card company's **immediate debit** on the bank list                  | 1                                        | equals one "חיוב עסקות מיידי" row; bank date = its charge date                                                                                                                                                                          | [V]          |
| Bank card's **per-transaction debits** ("חיוב לכרטיס ויזה NNNN")     | 2 confirmed + 5 likely                   | one bank row per card row, exact ₪ amount, bank date 0-4 days after the purchase. The month's total never appears as one lump, so this card is debited per transaction even though its export groups rows under a monthly "תאריך החיוב" | 2 [V], 5 [I] |
| **Pending card holds** on the bank list ("חיוב זמני …")              | 2                                        | same day and exact amount as the card page's pending rows                                                                                                                                                                               | [V]          |
| Bank home page vs bank list                                          | 6                                        | the home page shows one date; the list shows the date plus the value date                                                                                                                                                               | [V]          |
| Sidebar repeating a main-table row (same screenshot)                 | 1                                        | same amount, date and text                                                                                                                                                                                                              | [V]          |
| Card-company site's per-card "expected charge" vs export             | 3 cards                                  | the tile equals Σ export rows with that charge date, exactly                                                                                                                                                                            | [V]          |
| Card-company loan tile vs loan rows in the export                    | 2 loans                                  | same monthly amount, but **the instalment number is off by one** (the site shows payments made; the amount is the next payment's)                                                                                                       | [V]          |
| Two captures of one page                                             | 1                                        | same panel, scrolled                                                                                                                                                                                                                    | [V]          |
| One bank loan in four views (2 PDFs, 2 screenshots)                  | 1 loan                                   | not transactions; its real repayment is a bank-list row whose first payment differs from the regular one                                                                                                                                | [V]          |
| Instalment series (several rows = one deal)                          | 4 series in exports (+2 on a screenshot) | same last-4 + purchase date + merchant + deal total + M                                                                                                                                                                                 | [V]          |
| FX wallet chains (FX purchase + wallet merchant + wallet credit)     | 2                                        | wallet credit = −merchant amount (same currency); FX purchase in ₪ on/near the same date                                                                                                                                                | [V]          |
| FX round trip (buy then sell the same foreign amount)                | 1                                        | same foreign amount in "הערות", opposite signs                                                                                                                                                                                          | [V]          |
| Cancellation / refund pairs                                          | 7                                        | same merchant, opposite sign; for a foreign refund match the **original** amount, not ₪                                                                                                                                                 | [V]          |
| A card with no export, seen on both banks' sites                     | 1 card                                   | only screenshots carry it; a later export will duplicate anything imported from them                                                                                                                                                    | [V]          |

### Near-misses that are NOT duplicates [V]

- **Exact repeat** (same card, date, merchant, amount) that is real: 1 pair, two identical coffees on one day.
- **Same card, date and merchant, different amount:** 18 groups (two kiosk buys, two delivery orders, two bar tabs, two Bit transfers to different people…).
- **Same card, merchant and amount within 2 days:** 10 pairs (a daily grocery spend, a daily coffee).
- **Same merchant within 3 days on two different cards:** 19 pairs. The household uses two cards at the same shops.
- **Same ₪ amount within 2 days on two different cards:** 5, all of which today's `flagExisting` would block (below).
- **Same merchant spelled differently by two issuers**, e.g. _(invented)_ "קפה רוזה" vs "ק.רוזה בע"מ". Also local-sheet "NAME" vs foreign-sheet "NAME␣␣␣NAME␣␣␣ISR" for the same merchant inside one Max file.
- **Same merchant and amount months apart** on two cards (a software store), and two orders of the same price two weeks apart on two sheets of one Max file.

## 4. Today's pipeline against each format

| Format              | Verdict                                                         | What goes wrong                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 Max              | Read by the dictionary, `mapHolds` passes, 0 unreadable [V-app] | **`plan` maps to "סוג עסקה"** ("סוג עסקה" is in the plan aliases and the first header hit wins), so **no instalment or loan is ever detected** [V-app]. **`amt` maps to "סכום עסקה מקורי"**, so loan repayments save the **whole loan principal**, instalments save the **whole deal** on every row, the card fee saves pre-VAT, and blank-currency foreign rows save the foreign figure **as ₪** (`charged` is dropped because both currencies resolve to the base). **About 12% of all rows saved a wrong amount, adding up to many times the household's real monthly spending** [V-app, `draftOf` vs "סכום חיוב"]. Loan disbursement → income. Wallet rows → separate $ expenses and incomes on top of the ₪ FX purchase. Merchant padding kept. |
| F2 Discount monthly | Read by the dictionary, holds [V-app]                           | `cur` maps to the always-blank "מטבע העסקה"; the real currency is only in the number format, which `raw: true` discards, so **every foreign row is saved in its foreign figure as ₪** [V-app]. "תאריך החיוב" is not mapped (it is not in `chgDate`); "סוג העסקה"/"פירוט" are not mapped as plan; "--" → `amount_unreadable` [V-app]. The cumulative row-8 total is harmless today only because sheets are not reconciled.                                                                                                                                                                                                                                                                                                                            |
| F3 summary          | **No dictionary map** → one model `map` call [V-app]            | Most likely the sheet then fails as unreadable (the "mmyyyy" month does not parse) [I]; with an unlucky map it would turn monthly totals into transactions [I]. It should be recognised and skipped with no call.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| F4 loan PDFs        | Text path [V]                                                   | Status documents. The model may emit the "next payment" as a row, and the loan hint in `pl` invites it [I]. Scrambled column order lets `groundInText` find "the amount in the text" for any number [I].                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| F5 screenshots      | Image path, two reads when no total is printed                  | **Bank card-settlement lines become expenses: a double count with the card rows.** No rule exists anywhere in `src/` [I, code search]. The bank-cards page's three sections and two totals: `reconcile` holds all non-pending rows to one total, so correct rows get `total_mismatch` [I]. Pending is a section heading, not a per-row word, and "חיוב זמני" is not among the prompt's pending words [I]. Sidebars and tiles can be read as rows [I].                                                                                                                                                                                                                                                                                                |

**Duplicate checks as coded:**

- `collapseOverlaps` (amount|date|description) folds screenshot seams and flags exact cross-file repeats. Different spellings, padding, or a value date vs a posting date defeat it [I].
- `flagExisting` (same kind, amount ±2 days) catches straight re-imports. It **ignores card and merchant**, so it blocks real rows on another card or in the neighbouring month (5 in this data) [V by simulation].
- `already_plan` can never fire for F1, because plans are never detected [V-app].
- Missing: within-batch plan grouping, card-settlement matching, FX-wallet folding, pending→posted replacement, and refund pairing on the original currency.

## 5. Recommendations, ranked by impact

1. **Exact readers for F1 and F2**, keyed on their header signatures. This is the largest error in the sample.
   - **F1:**
     - Take `plan` from the column whose _cells_ match "תשלום N מתוך M".
     - Save "סכום חיוב" when the original currency is ₪ or blank.
     - Keep the original only for a named foreign currency.
     - Read "הלוואה ברגע…" rows as loan disbursement and repayments.
     - Split the padded foreign merchant into name, city and country.
   - **F2:**
     - Keep the cell number format (pass `cell.z`, or `raw: false` for amount columns) and read the currency from it.
     - Map "תאריך החיוב", "סוג העסקה" (זיכוי = credit) and "פירוט" ("N/M" as a plan).
     - Treat "--" as empty and fall back to "סכום החיוב".
     - Ignore the title-block total.
   - **F3:** detect it and skip it with a message, with no model call.
   - Small dictionary fixes if the exact readers wait:
     - add "תאריך החיוב" to `chgDate`;
     - add "סוג העסקה" and "פירוט" to the plan candidates, and pick the plan column by content;
     - prefer "סכום חיוב" over "סכום עסקה מקורי" whenever `chgCur` resolves to the base currency.
2. **Within-batch plan grouping.** Rows sharing last-4, purchase date, normalised merchant, deal total and M become one plan, with the paid count and next payment taken from the rows. Never one plan per row.
3. **Card-settlement rule for bank rows.** Recognise card-company and "חיוב לכרטיס <network> NNNN" lines as transfers to a card, not spending.
   - _Lump_ mode (a card-company bill): match the amount to Σ rows of one card whose charge date is within ±3 days.
   - _Per-transaction_ mode (a bank debit card): match 1:1 by exact amount, with the bank date in [purchase, purchase + 5 days].
   - "חיוב זמני" = a hold, which disappears when the card row posts.
   - With no card rows imported yet, still mark the line as a transfer, never as an expense.
4. **Dedupe design, cross-file and against the household:**
   - **Identity key** (re-export): last-4 + purchase date + ₪ charged amount + original amount/currency + plan (N, M). Exact → same transaction.
   - **Probable duplicate** (screenshot vs export, different issuers' spellings): last-4 + ₪ amount exact + date ±1 (posting vs value date). Ignore plan N (off-by-one between site and export). Merchant similarity is a tie-breaker only.
   - **Pending → posted:** pending row ↔ posted row with the same last-4 and amount within [date, date + 3 days] → replace, don't add.
   - **Instalments:** a plan exists if the household has a plan on the same card with the same purchase date, total and M.
   - **Refund pairing:** same card and merchant, opposite sign, same _original_ amount (for foreign currency) → link; it is not a duplicate.
   - **FX wallet:** a wallet credit equal and opposite to a wallet merchant row, plus an FX purchase in ₪, folds to one expense at the ₪ cost.
   - **Blocking vs advisory:** block (`already_added`) only on the identity or probable key. A same-amount match on another card or merchant becomes a non-blocking "similar" note.
5. **Prompt changes for screenshots and PDFs:**
   - Read totals per titled section, each with its section label. Mark every row under a "not yet included / עדיין לא נכללות" heading as pending. Add "חיוב זמני" and "הרשאה" to the pending words.
   - Never emit card tiles, "expected charge", loan tiles, "next payment", balances or sidebar lists ("התנועות הגבוהות", "העברות נפוצות") as rows. Loan and status pages yield cards or loans only.
   - Bank lists: copy the date into `d` and the value date into `cd`.
   - Copy "N/M" in a details column as a plan even without the word "תשלום".
   - For a text-layer PDF whose rows come out scrambled, fall back to the page image.
6. **Evaluation harness** (below).

## 6. Evaluation harness design

The exports are the answer key; screenshots of the same period are the test.

- **Fixtures.**
  - _Private:_ real files stay in a folder outside the repo (as here), listed in a manifest of file → expected-rows file. The harness reads that folder only when the env var for it is set.
  - _Public:_ synthetic look-alikes are generated **from the formats documented above** with invented values: xlsx files built with SheetJS, and screenshots rendered from HTML that mimics each site's table. These live in `src/test/fixtures/import/`.
- **Answer key.** Each export is parsed by the exact reader into canonical rows: last-4, purchase date, charge date, ₪ charged, original amount and currency, plan N/M, kind, and pending flag. For a screenshot, the key is the subset of export rows inside the screenshot's visible window, keyed by card and charge date (e.g. the cards page "next bill" section = export rows with the next charge date).
- **Cases:**
  1. each export alone (exact match required);
  2. screenshot vs the same period's export (recall and precision of rows);
  3. the bank list against card exports (every settlement line classified as a transfer and linked);
  4. the export imported twice (0 new rows);
  5. pending screenshot then the later export (pending replaced, 0 duplicates);
  6. instalment and loan files (one plan per deal, correct paid count);
  7. near-miss sets (coffee pairs, cross-card same amount: 0 false blocks).
- **Metrics:**
  - row recall and precision on the identity key;
  - exact-amount rate;
  - currency accuracy;
  - pending accuracy;
  - plan grouping accuracy;
  - duplicate-flag precision and recall (expected vs actual `already_added`, `in_another_file` and the new settlement and pending flags);
  - total reconciliation per section.
- **Running.** Deterministic cases (1, 3, 4, 6, 7) run in CI with no network. Model cases (2, 5) run only on demand, with synthetic screenshots in CI and real screenshots only locally by their owner. Results are stored as JSON per run to track regressions.
