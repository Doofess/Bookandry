# Business types (MCC) for categories: design

**Status:** design approved in chat on 2026-10-09. This spec awaits review.
**Asked for by the user:**

- On 2026-10-08: "MCC database … pick the best source to improve categorisation".
- On 2026-10-09: "the idea with the mcc database is to use it to match transactions to categorizes".

## Decisions

1. **The MCC list is the backbone.** Every expense gets a business type, which is a Merchant Category Code (MCC). A table turns the business type into a category. Today, Claude picks a category directly. After this change it picks a business type, and the table decides the category.
2. **Israeli exports carry no MCC, so each row gets one from the first source that has it:**
   1. an MCC column in the file;
   2. the card company's business-sector text (ענף), through a table;
   3. the same merchant seen before;
   4. Claude, choosing only from real codes.
3. **The person's own choices always win.**
   - A category they set for a merchant beats the table.
   - A business type they moved into another category applies everywhere: past rows (when they ask) and future ones.
4. **Source data:**
   - The list is [greggles/mcc-codes](https://github.com/greggles/mcc-codes). It is in the public domain (Unlicense), has 981 codes in English, and is bundled with the app.
   - ISO 18245 is paid, and the Visa and Mastercard lists are all-rights-reserved. So greggles is the only list we may ship.
   - The Hebrew names are ours. They are written once and committed.
   - Research notes: `docs/research/2026-10-09-mcc-sources.md`, saved from this session.
5. **No new table.** The business type is an optional field on the transaction. A person's re-mappings are an optional field on the category. There is no Dexie version bump and no cursor reset.

## 1. Data

### 1.1 The bundled list: `src/data/mcc.json`

- The file is an array of `{ code: "5411", en: "Grocery stores, supermarkets", he: "מרכולים וסופרמרקטים" }`.
  - It holds every code in greggles at the commit we take.
  - `en` is greggles' `edited_description`, shortened where it is shouty or legal-sounding.
  - `he` is our translation.
- `src/data/mcc-SOURCES.md` records the upstream commit, the licence and how the file was built.
- The file loads lazily, like the bank branches data. It is about 80 KB, and the main chunk must not grow by it.
- `src/domain/mcc.ts` provides the following. Codes are always 4-digit strings, so `"0742"` keeps its zero.
  - `isMcc(code)`
  - `mccName(code, lang)`
  - `searchMcc(query, lang)`: matches the code, `en` or `he`, ignoring case and Hebrew niqqud.

### 1.2 Business type to category: `src/domain/mcc-categories.ts`

- `DEFAULT_MCC_CATEGORY` maps code ranges and single codes to built-in **expense** category ids. Every code in `mcc.json` falls in exactly one entry, and a test checks this. Examples:
  - 3000–3299 and 4511 (airlines), 3501–3999 and 7011 (lodging), 4722 (travel agencies): `cat.travel`
  - 5411, 5422, 5441, 5451, 5462, 5499: `cat.groceries`
  - 5811–5814: `cat.dining`
  - 4111, 4121, 4131, 4784, 5541, 5542, 7523: `cat.transport`
  - 4812, 4814, 4816, 4899: `cat.phoneInternet`
  - 4900: `cat.utilities`
  - 5912, 8011–8099: `cat.health`
  - 5815–5818, 7841: `cat.subscriptions`
  - 7832, 7922, 7991–7999: `cat.entertainment`
  - 8211–8299: `cat.education`
  - 0742, 5995: `cat.pets`
  - 7997, 7941: `cat.fitness`
  - 6300, 5960: `cat.insurance`
  - 6010, 6011, 6051: `cat.currencyExchange`
  - 5641, 5945: `cat.kids`
  - the retail ranges 5200–5999 that are not listed above: `cat.shopping`
  - everything else: `cat.otherExpense`

  The full table is written in the plan, and every line is checked against the code's meaning.

- `categoryForMcc(code, categories)` returns a category id or `undefined`:
  1. A live category whose `mccs` includes the code wins. If two do, the one updated most recently wins.
  2. Otherwise, the default entry. It is skipped if that built-in is archived.
  3. `undefined` lets the rest of the chain decide.
- Income rows never use this table. A refund from a supermarket is still a refund.

### 1.3 New optional fields

- `Transaction.mcc?: string`. It holds the business type of an expense: a valid code, never set on income. It is saved with the row, synced and exported.
  - A series carries one MCC.
  - Overrides don't change it.
- `Transaction.mccSource?: 'file' | 'sector' | 'history' | 'ai' | 'user'`. It records where the code came from.
  - A `user` code is never replaced automatically.
  - The other sources may be improved later, for example when the person edits the row.
- `Category.mccs?: readonly string[]`. These are the business types the person moved **into** this category. The default table never writes here.
  - Moving a code into a category removes it from any other category's `mccs`, in the same write.
- All three fields are added to `transactionSchema`, `categorySchema`, the row schemas and transfer validation:
  - `mcc` must pass `isMcc`;
  - `mcc` is refused on income;
  - `mccs` must be unique valid codes, at most 200.

## 2. Getting the business type

`src/domain/merchant-key.ts` exports `merchantKey(text)`. It lower-cases the text and removes:

- digits;
- punctuation and quotes (`"`, `'`, `׳`, `״`);
- the legal suffixes `בע"מ`, `בעמ`, `ltd`, `inc`, `llc`;
- the word `סניף` and the token after it.

It then collapses whitespace. For example, "שופרסל דיל 123 ת"א" and "שופרסל דיל 45" both become "שופרסל דיל ת א". City names are **not** stripped, because merging two different businesses is worse than missing a match. An empty key means "no key".

The order, first hit wins:

1. **File.** A column named `MCC`, `mcc`, `קוד ענף`, `Merchant category code` or `SIC`, holding a valid code. This adds an `mcc` entry to `HEADERS` in `import-sheet-map.ts`, and `mcc` to the wire row for PDF and image extraction.
2. **Sector.**
   - A column named `ענף`, `ענף עסקי`, `תחום`, `קטגוריה`, `Category` or `Sector`. This adds a `sector` entry to `HEADERS`, and `sec` to the wire row.
   - `src/domain/sector-mcc.ts` maps known Hebrew and English sector strings to one representative code (e.g. "מסעדות" → 5812, "סופרמרקטים" → 5411, "דלק" → 5541).
   - The table starts with the sector names the Cal, Max and Isracard sites are known to use. If none can be confirmed, it starts with common sector words, and it grows when real exports are seen.
   - An unknown sector string is not dropped. It goes to Claude as a hint, in step 4.
3. **History.** The person's most recent live expense with the same text has an `mcc`. If there's none, the most recent with the same `merchantKey` is used. The query joins the existing `categoryFromHistory` walk, so there is no second scan.
4. **Claude.** The existing calls are changed. No new calls are added.
   - **Sheets:** the per-merchant `mc` call (`import-wire.ts`) returns `{ m, mcc, cat }` instead of `{ m, cat }`, with the sector hint in the prompt when there is one.
   - **PDF and image extraction:** the `INSTRUCTIONS` prompt asks for `mcc` next to `cat` on each expense row.
   - **A typed new expense:** the `categorize` Edge Function returns `{ id, mcc }`. `id` is still checked against the person's category ids. The function validates `mcc` against a code list it bundles, a copy of the codes from `mcc.json`, and checks the copy matches. An invalid or missing code becomes `null`. The prompt asks for the single most likely 4-digit MCC. The list is not sent in the prompt.
   - Every code is validated with `isMcc` in the app as well. An invalid code is dropped, never stored.
5. **Nothing.** The row has no `mcc`, and categories work exactly as today.

## 3. Choosing the category (expenses)

The order in `review-items.ts` for imports, and in `use-auto-category.ts` for a typed expense:

1. `knownCategory()`. These are the specific name rules for currency exchange, subscriptions and card companies. They are narrower than an MCC.
2. **The person's own choice for this merchant.** A past row with the same text, then the same `merchantKey` (`categoryFromHistory`, extended).
3. **The business type.** `categoryForMcc(mcc, categories)`.
4. `categoryFromText()`.
5. Claude's `cat`.
6. Refund for an income marked as a refund (unchanged), then Other.

Income keeps today's order without step 3. When a person picks a category by hand in the form, nothing above overrides it. That stays as today.

## 4. Screens

### 4.1 Transaction form: "Business type" / "סוג עסק"

- The row sits under Category, for expenses only. It shows the business name, such as "Restaurants" or "מסעדות", or "Not set" / "לא נקבע".
- Tapping it opens a searchable pop-out listing every code by name, matching on Hebrew or English text and on the code. It uses the shared pop-out plumbing and is named.
- Picking a code sets `mcc`, with `mccSource: 'user'`.
  - If the category has not been picked by hand in this form, it follows the new business type's category.
  - "Clear" removes the code.
- The form's auto step (typing pause, then history, then Claude) also fills the business type when it's empty. It never replaces a `user` one.

### 4.2 Categories settings: business types per category

- Each expense category's page lists its business types: the default codes from the table, then the ones the person moved in, by name.
  - A long list shows the first 8 names and "and N more", with a button to expand it.
- **"Add a business type"** opens the same searchable pop-out. Picking a code writes it to this category's `mccs` and removes it from any other category's.
  - Then it asks once: "Move the N past expenses with this business type here too?" / "להעביר לכאן גם את N ההוצאות הקודמות מסוג זה?"
  - The question appears only when N > 0.
  - "Yes" re-categorises those rows: live expenses with this `mcc` whose category is the one the code used to map to. It uses one undoable write (`undoableWrite`) with an Undo toast.
- A moved code can be removed. "Return to default" takes it out of `mccs`. Past rows are left alone.
- Archived categories: their `mccs` stop applying, as in §1.2. The page says so.

### 4.3 Feed

- No new chip, because the row is busy enough.
- The search box also matches business type names in the current language, so "מסעדות" finds every restaurant.

## 5. Sync, export, older builds

- All three fields are optional and sync on their rows. No table changes, no Dexie version bump, no cursor reset.
- Export and import carry them. A file from an older build has none, and that is fine.

| Older build sees                     | Effect                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| an expense with `mcc`/`mccSource`    | It parses: unknown keys are stripped when parsing, but sync stores the raw row, and edits spread the row, so the fields survive an edit there. Nothing it shows changes. |
| a category with `mccs`               | The same: the field survives an edit or a rename, because the repo spreads the row. Nothing it shows changes.                                                            |
| a `categorize` reply with `mcc`      | It reads only `id`, so the extra key is ignored.                                                                                                                         |
| an extraction reply with `mcc`/`sec` | Unknown wire keys are ignored by the cleaners.                                                                                                                           |

**Tests that pin this table:**

- `mcc`, `mccSource` and `mccs` round-trip through the schemas, the sync apply path and an edit.
- A row without them still works everywhere.

The plan checks the repo's category update path. If any path rebuilds the row instead of spreading it, that path is fixed in this work.

## 6. Edge cases

- **A code that isn't in the list:** from a file, history or Claude, it is dropped, never stored. A bad file cell never fails the import.
- **One merchant, two business types over time:** the most recent row wins in history. The person's `user` pick always wins for that row.
- **Split households:** the history steps look across all people in view, as `categoryFromHistory` does today.
- **Offline, or signed out:** steps 1–3 work offline. Step 4 needs the Edge Functions, as category suggestions do today. Without them the row has no `mcc`, and the category chain works as before.
- **Currency exchange and card fees:** `knownCategory` still runs first, so an exchange office's 6051 can't override the exchange rule. They agree anyway.
- **Refunds:** income never gets an `mcc`. A refund keeps `cat.refund`.
- **Deleted and archived rows:** they are ignored by the history steps and by "move past expenses".
- **Hebrew search:** search folds final letters (ך/כ, ם/מ, ן/נ, ף/פ, ץ/צ) and strips niqqud.

## 7. Tests

- **Data.**
  - Every code in `mcc.json` is a 4-digit string, unique, with non-empty `en` and `he`.
  - Every code maps through `DEFAULT_MCC_CATEGORY` to exactly one existing built-in expense id.
  - The upstream code set matches the commit recorded in `mcc-SOURCES.md`.
- **Domain.**
  - `merchantKey` on a table of real-looking pairs: what must merge, and what must not (two different chains).
  - `categoryForMcc`: a person's move beats the default; an archived category is skipped; two moves resolve to the most recently updated category; income is never mapped.
  - `searchMcc` matches in both languages and folds final letters.
  - The sector table maps the listed sector strings to the listed codes.
- **Import.**
  - A sheet with an MCC column; a sheet with a sector column, both a known and an unknown sector (the unknown one goes to Claude as a hint); history by `merchantKey`.
  - The full precedence chain, one case per step, including "the person's merchant choice beats the MCC" and "`knownCategory` beats the MCC".
- **Wire.** `cleanMerchantCats` and the extraction cleaners keep a valid `mcc`, drop an invalid one, and ignore a stray `mcc` on income.
- **Edge Function.** The `categorize` handler returns a valid `mcc` or `null`. Its code list matches `mcc.json`, through a repo test that reads both files.
- **Form (dom).**
  - The business type row is shown only for expenses.
  - Picking a type changes the category when the category was not picked by hand, and leaves it when it was.
  - "Clear" works.
  - Both languages.
- **Categories (dom).**
  - Adding a business type to a category moves it out of the old one.
  - "Move N past expenses" re-categorises exactly the matching rows, and Undo restores them.
  - "Return to default" works.
- **Feed.** Searching a business type name finds the rows.
- **Compatibility.** The table in §5.
- **E2E.**
  - Import a small sheet with a sector column and see the categories.
  - Change a business type in the form.
  - Move a business type between categories in en and he, and on mobile.

## 8. Out of scope

- **Backfilling** business types for rows saved before this ships. They get one when edited, or when the same merchant is imported or typed again.
- **Issuer-specific export parsers.** Generic header matching stays.
- **Bank exports:** they have no sector, so they rely on history and Claude.
- **MCC-based reports or charts.**
- **Business types on income.**
- **Fetching** a live MCC list. The bundled list is updated by hand when upstream changes.
