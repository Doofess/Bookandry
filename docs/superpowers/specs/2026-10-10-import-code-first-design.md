# Smart import, code first: design

**Status:** design written on 2026-10-10 from the user's request. Every open question was settled with the recommended answer, recorded below as a decision. Nothing is built. This spec awaits review.
**Asked for by the user (2026-10-10):** "move the import to a hardcoded parser first, and then the LLM, for even more accurate reads and to save token API usage."

**Read with:**

- the sanitised study, `C:/dev/greenback-research/docs/research/2026-10-10-import-samples-study.md` (branch `research/open-banking`), cited below as "the study";
- the branch `smart-import-readers` (commits `226f948`, `9713148`), whose `src/domain/import-sheet-readers.ts` is the first deterministic reader. It is mid-fix after review, and this spec does not change it;
- `docs/superpowers/specs/2026-10-09-mcc-categories-design.md`, for the business-type (MCC) chain this spec reuses.

**No real values.** This document has no names, card or account digits, amounts, merchants or dates from the household's files. Counts are counts. Every example value is invented and marked _(invented)_.

## Decisions

1. **The pipeline is: detect by code, parse by code, check by code, then the model only for what is left (the residue), then learn.** Code owns every field it can read from a file. The model fills gaps and reads what code cannot see (images, scans, unknown layouts). It never replaces a value code read. (§1, §5)
2. **"Residue" has four kinds and no others:** an unknown format, an image or a page with no text layer, a merchant that no code lookup can place, and a single row that fails the checks. Each kind has its own small call, sized to its content. (§1.2)
3. **A format registry replaces the one-off readers.** Each format is a module with `detect`, `parse`, sections, printed totals, the cards and accounts it names, and a confidence. The Max and Discount readers from `smart-import-readers` become the first two modules, unchanged in behaviour. (§2)
4. **PDF text stays on pdf.js, already in the app.** `pdfjs-dist` 6 is lazy-loaded today, in an `import-*` chunk that stays out of the precache. The change keeps each text item's position, rebuilds lines and columns in code, and adds one layout module per company. A page with no text layer still goes to the model. The main chunk does not grow by a byte. (§3)
5. **Images still go to the model, through a narrower call:** a transcription prompt with no category list, no payment methods and no business types, and a row with about half today's fields. Code does categories, MCC, cards and dedupe afterwards. (§4)
6. **The model never overrides code.** Its rows are held to the file's own totals and counts, and to any export in the same import that covers the same card and period. When they disagree, the review shows the file's reading, the difference and the suspect rows, unticked. Nothing is swapped automatically. (§5)
7. **Learned layouts.** When the model maps an unknown spreadsheet and both the checks and the person confirm it, the app keeps a header fingerprint and the column roles: header text only, never a value. They are kept in Dexie and in the household sync, so the next file of that shape costs no call. (§6)
8. **Merchant categories become one call per import, not one per sheet,** in a new narrow `classify` mode that returns only `{ i, mcc, cat }`. It replaces the "map" call that today is made once per sheet and repeats the whole column map just to carry categories. (§1.3, §7)
9. **The column-map call sends the shapes of cells, not their values.** It sends the header row and a few rows reduced to shapes such as `DATE(dd/mm/yyyy)` and `NUM(-#,###.##)`. It no longer sends title rows, which on some exports hold the account number and the holder's name. (§1.3, §6.4)
10. **Fixtures are synthetic, always.** No real value may enter the repo. Each agent runs the private-values check before it reports. A scoring harness runs the registry against the real files outside the repo and writes counts only. (§9)
11. **Built in phases, each shippable on its own.** Measurement, the harness and the narrow `classify` call can start now on `main`. The registry, sections and learned layouts wait for `smart-import-readers` to land. (§10)
12. **Rejected: on-device OCR** (Tesseract and the like). The Hebrew models alone are many megabytes, against a 3 MiB precache limit per file, and their accuracy on dense RTL statements is below the model's. Images stay with the model. (§4.4)

## 1. The pipeline

### 1.1 Stages

```
prepare (today's prepare-files)  ->  detect  ->  parse  ->  check  ->  residue calls  ->  re-check  ->  review  ->  learn
```

| Stage        | Where                                                                            | What it does                                                                                                                                                                                                                                                                         | Calls |
| ------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| **Prepare**  | `src/services/ai-import/prepare-files.ts`                                        | It does what it does today: sheets as rows plus number formats (the readers branch keeps `cell.z`), PDFs as text, images sized and sliced. **New:** PDF text items keep their position (§3), and the same file picked twice in one batch is refused by hash before it is read (§11). | 0     |
| **Detect**   | `src/domain/import-formats/registry.ts`                                          | It offers each sheet, CSV, or PDF text page to every module's `detect`, then to the learned layouts (§6). The first exact claim wins. Detection reads only headers, title lines and marker strings, never every row.                                                                 | 0     |
| **Parse**    | the module that claimed it                                                       | It reads every row into `FoundRow`s, grouped into **sections** (§2.2), with the printed totals and counts, the period, the cards and the accounts the file names.                                                                                                                    | 0     |
| **Check**    | `src/domain/import-verify.ts` (new; `import-check.ts` keeps the parsing helpers) | It runs per section: the sum against the printed total, the row count against the printed count, dates inside the period or charge window, a running balance for bank lists, card digits against the file's own card set, and plan N ≤ M. Each row and each section gets a verdict.  | 0     |
| **Residue**  | `src/features/import/run-import.ts`                                              | It sends only what §1.2 lists, each kind in its own narrow mode (§1.3).                                                                                                                                                                                                              | few   |
| **Re-check** | the same checks                                                                  | Model rows pass exactly the checks code rows pass. A model row that fails them stays flagged, never "fixed" by a later guess (§5).                                                                                                                                                   | 0     |
| **Review**   | `review-items.ts`, `import-sheet.tsx`                                            | As today, plus the "doesn't add up" group (§5.3).                                                                                                                                                                                                                                    | 0     |
| **Learn**    | `src/db/import-layouts.ts` (new)                                                 | It saves a confirmed column map for an unknown sheet (§6).                                                                                                                                                                                                                           | 0     |

### 1.2 Residue, defined

Only these four reach the model. Anything else that fails is shown to the person, flagged, and never sent.

1. **An unknown format.** No module claims it and no learned layout matches it.
   - A spreadsheet or CSV sheet: one narrow `map` call (§1.3). The rows are then read by code through `readSheet`, as today.
   - A PDF with a text layer whose layout no module knows: one `transcribe` call with the lines code rebuilt (§3.3).
2. **Images, and PDF pages with no usable text layer** (`usableText` false). One `transcribe` call per job (§4).
3. **Merchants no code lookup places.** After, in order:
   1. `knownCategory` (well-known names);
   2. the file's MCC column;
   3. the card company's sector (`sectorMcc`);
   4. the household's history by text, then by `merchantKey` (`merchantHistory`);
   5. **the bundled merchant map** (new, §1.4).

   What is left is an expense with no business type that the table files somewhere (the same test as `placed()` today), and an income with no category from history. It goes to one `classify` call **per import**, across all files, with the merchants deduplicated by `merchantKey`.

4. **Single rows that fail the checks,** and only where a model can add something:
   - **From a PDF text layer:** a line that holds an amount but that the layout module could not parse. Only that line's text is sent, in a `rows` call.
   - **From a sheet:** a row with a cell code cannot interpret, such as an unknown currency mark, an odd date shape or a promo "--". Only that row's cells and its header are sent.
   - **Not sent:** a row whose cells parse but whose section does not add up. The cells are exact, and a model reading them again cannot read them better. It is flagged `total_mismatch` with the hint `reconcile` gives.
   - A `rows` answer is accepted only if it parses and then either makes its section's sum meet the printed total exactly, or its section has no total. Otherwise the row stays flagged and unticked.
   - At most 40 rows per import (`LIMITS.disputes`). The rest are shown flagged.

### 1.3 Wire modes

`src/domain/import-wire.ts` and its verbatim copy `supabase/functions/_shared/import-wire.ts` gain four modes. The old `extract`, `map` and `verify` modes stay, unchanged, for one release cycle, because an app from before this change still sends them. **The function deploys before the app** (§10).

| Mode           | Sends                                                                                                  | Answers                                             | Model                                                                                                                                                 | Replaces                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `classify`     | Merchant names, deduplicated, each with its sector hint; the expense category list (aliases, as today) | `{ mc: [{ i, mcc, cat }] }`, nothing else           | `EXTRACT_MODEL` (Sonnet 5.5). An optional `CLASSIFY_MODEL` is allow-listed, but stays on Sonnet until the harness shows Haiku matches it on MCC picks | The per-sheet `map` call that carried categories (`askCategories`) |
| `map` (narrow) | The header row plus up to 5 rows **as cell shapes** (§6.4); no merchants                               | The column roles, `dec` and `df`, without `mc`      | `EXTRACT_MODEL`                                                                                                                                       | `askMap`                                                           |
| `transcribe`   | Images or PDF pages; context of `today`, `base`, `lang` and, in a household, its people                | Narrow rows (§4.2), section totals, cards, accounts | Primary on `EXTRACT_MODEL`; the second read on `CHECK_MODEL`                                                                                          | `extract` for images and scans                                     |
| `rows`         | Residue rows, each as raw cells or one text line, with its header and the problem in a sentence        | Narrow rows, each with the residue row's id         | `VERIFY_MODEL` (Opus 5.5), as `verify` today                                                                                                          | `verify` for code-read files                                       |

`verify` keeps its role for model-read files: two reads disagree, or an amount is not in the text. It moves to the narrow row schema.

### 1.4 The bundled merchant map

- `src/data/merchants-il.json` is an array of `{ key, mcc }`, where `key` is a `merchantKey` of a **public** chain or brand name. _(invented example: `{ "key": "רשת דוגמה", "mcc": "5411" }`)_
- It is built by hand from public knowledge of national chains: supermarkets, fuel, pharmacies, telecoms, public transport, the large online shops. It is never generated from the household's files or the private study, and its source is recorded in `src/data/merchants-il-SOURCES.md`.
- It loads lazily with the import chunk, and is capped at 2,000 entries (about 60 KB).
- **Order:** it runs after history, because the person's choice wins, and before Claude. A code from it passes `isMcc`, like every code.
- `mccSource` gets a new value, `'map'`. The schema accepts it, and older builds strip unknown values on parse while keeping the raw row (the same table as the MCC spec §5).

## 2. The format registry

### 2.1 Where it lives

```
src/domain/import-formats/
  types.ts            the module interface below
  registry.ts         the ordered module list; detect() and read()
  sheet-common.ts     findHeader, norm, cellMinor, formatCurrency, lastFour, dateOf (moved from import-sheet-readers.ts)
  max-xlsx.ts         Max "transaction-details" (from the readers branch)
  discount-cards-xlsx.ts   Discount "כרטיסי אשראי" monthly (from the readers branch)
  discount-totals-xlsx.ts  Discount's 12-month summary: skip, no call (from the readers branch)
  pdf/lines.ts        positioned text to lines and columns (§3.2)
  pdf/<company>.ts    one layout module per company (§3.3)
```

Everything here is pure (no Dexie, no DOM, no network), like the rest of `src/domain/`. The modules load with the import sheet's lazy chunk (`feed-screen.tsx` lazy-loads `ImportSheet`), never with the main chunk. PDF layout modules go in an `import-*` chunk (§3.4).

### 2.2 One module

```ts
export type FormatId = string; // 'max-xlsx', 'discount-cards-xlsx', 'cal-xlsx', 'isracard-pdf', ...

export type FormatInput =
  | { readonly kind: 'sheet'; readonly sheets: readonly SheetInput[] } // a CSV is a one-sheet workbook
  | { readonly kind: 'pdf-text'; readonly pages: readonly PdfPage[] };

export type Detection = {
  readonly format: FormatId;
  /** Which version of the layout: '2026-10' for the headers seen in the study, a later one when they change. */
  readonly version: string;
  /** 'exact': every signature header or marker found. 'core': only the core subset (§11.3). */
  readonly match: 'exact' | 'core';
  /** The sheets or pages it claims. Anything else is returned as unclaimed. */
  readonly claims: readonly number[];
};

export type SectionKind = 'posted' | 'pending' | 'immediate' | 'foreign' | 'fx-wallet' | 'account';

export type PrintedTotal = {
  readonly minor: number;
  readonly currency: Currency;
  /** 'check': the sum must meet it. 'ignore': printed but known to be wrong (Discount's cumulative title total). */
  readonly use: 'check' | 'ignore';
  readonly label: string;
};

export type Section = {
  readonly id: string; // 'f2s0', 'f2s0:pending'
  readonly kind: SectionKind;
  readonly label: string; // as printed: a sheet name or a section title
  readonly rows: readonly FoundRow[];
  readonly totals: readonly PrintedTotal[];
  /** A printed row count ("<n> עסקאות"), when there is one. */
  readonly count?: number;
  readonly period?: { readonly from: LocalDate; readonly to: LocalDate };
  readonly chargeDate?: LocalDate;
  /** The card digits this section may hold: from its title or its card column. Empty when it names none. */
  readonly cards: readonly string[];
  /** A bank list's opening and closing balance, for the running-balance check. */
  readonly balances?: { readonly opening: number; readonly closing: number };
};

export type FormatRead = {
  readonly format: FormatId;
  readonly version: string;
  readonly statement: 'card' | 'bank' | 'totals' | 'status';
  readonly institution: Institution; // 'max' | 'cal' | 'isracard' | 'amex' | 'discount' | 'leumi' | 'hapoalim' | 'mizrahi'
  readonly sections: readonly Section[];
  /** Cards and accounts the file names: a statement's header, a card column. Read by code, so never read twice. */
  readonly cards: readonly FoundCard[];
  readonly accounts: readonly FoundAccount[];
  readonly confidence: {
    readonly match: 'exact' | 'core';
    /** Rows read, and rows with a cell code could not read (the residue of §1.2 point 4). */
    readonly rows: number;
    readonly unreadable: number;
  };
  /** Set for a file that holds no transactions: no rows, no call, and a message. */
  readonly skip?: 'totals_only' | 'status_document';
};

export interface FormatModule {
  readonly id: FormatId;
  readonly input: FormatInput['kind'];
  /** Cheap: headers, title lines, marker strings. Never reads every row. */
  detect(input: FormatInput): Detection | undefined;
  parse(input: FormatInput, detection: Detection, ctx: ReaderContext): FormatRead;
}
```

- **Every `FoundRow` a module makes** carries `source: { format, version, section, by: 'code' }`. A model row carries `by: 'model'`. Dedupe and review read that field (§5, §8).
- **`registry.read(input, ctx)`** returns `{ reads: FormatRead[], unclaimed: number[] }`. The unclaimed sheets or pages go to learned layouts (§6), then the dictionary, then the model.
- **Order:** modules run in registry order, and the first exact claim on a sheet wins. Two exact claims on one sheet is a bug, and a registry test asserts it never happens on any fixture.
- **Per sheet, not per workbook.** A workbook with a Max sheet and an unrelated sheet gives one claim and one unclaimed sheet. This fixes review item M2 on the readers branch, where a totals sheet beside a transactions sheet refused the whole workbook.

### 2.3 Max and Discount as modules

Both exist on `smart-import-readers`. Moving them is mechanical. Their behaviour is pinned by the branch's tests, which move with them, rewritten on synthetic values (§9.1).

|               | `max-xlsx`                                                                                                                                                                                                                                     | `discount-cards-xlsx`                                                                                                                      | `discount-totals-xlsx`                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **detect**    | All 11 named headers of the 16 (`MAX` in the reader) on one row within the first 30 rows. `core` match: the 5 money and plan headers (סכום חיוב, מטבע חיוב, סכום עסקה מקורי, מטבע עסקה מקורי, הערות) plus a date and a merchant header (§11.3) | All 9 named headers (`DISCOUNT`) on one row                                                                                                | The 3 totals headers, and no Max or Discount transaction sheet in the workbook |
| **sections**  | One per sheet: local (`posted`), foreign (`foreign`), FX wallet (`fx-wallet`)                                                                                                                                                                  | One (`posted`), with the file's single charge date                                                                                         | none; `skip: 'totals_only'`                                                    |
| **totals**    | **New:** the footer "סך הכל" in column A, read as text with ₪ stripped. `use: 'check'`. It equals the sheet's Σ "סכום חיוב" (study F1). The wallet sheet's total is 0, and it still checks                                                     | The title row-8 total, `use: 'ignore'`: it is cumulative across the browser session (study F2)                                             | none                                                                           |
| **count**     | none                                                                                                                                                                                                                                           | **New:** "<n> עסקאות לחיוב בחודש …" from title row 7                                                                                       | none                                                                           |
| **cards**     | The title line `NNNN-<name>`, plus the card column. Every row's digits must be in that set                                                                                                                                                     | Each row's "<network> NNNN" cell. The set is all of them, and a `FoundCard` per distinct card (network from the word, issuer from "מנפיק") | none                                                                           |
| **accounts**  | none                                                                                                                                                                                                                                           | **None, on purpose.** The title rows hold the full account number and the holder's name; the module never reads them                       | none                                                                           |
| **statement** | `card`                                                                                                                                                                                                                                         | `card`                                                                                                                                     | `totals`                                                                       |

What moves unchanged: `settle` (charged vs original), plans from "הערות", `foldWallet`, `merchantName`, `slashPlan`, `formatCurrency`. Plan grouping (`groupPlans`) moves **out** of the modules into a batch-wide step in `run-import`. Fixing review item C4 needs it there anyway: Discount monthly files each hold one payment of a deal (§8).

### 2.4 The next formats, by value

Value is how many households have the format, times how wrong today's generic path reads it, times how often it is exported. **A module is written only from a real export's headers**, collected privately (§9.3). Header text is a format fact, not personal data. The values in those files never leave the private folder.

| #   | Format                                                                                 | Why this rank                                                                                                                                                                                                                | Check it adds                              |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | **Cal** card export (xlsx, from Cal's own site)                                        | Cal issues most bank-branded cards, Discount's among them (study F2 is the Discount site's view of Cal cards; Cal's own export differs)                                                                                      | footer total per card, card digits         |
| 2   | **Isracard** card export (xlsx)                                                        | The largest issuer. The same platform serves **Amex** Israel, so it is one module with a brand switch, and `institution` is `isracard` or `amex` from the title                                                              | total per card section, card digits        |
| 3   | **Leumi** current account (xlsx)                                                       | Large bank. Bank lists are where card bills double-count (study §3)                                                                                                                                                          | **running balance**, row by row            |
| 4   | **Hapoalim** current account (xlsx)                                                    | The largest bank                                                                                                                                                                                                             | running balance                            |
| 5   | **Mizrahi-Tefahot** current account (xlsx)                                             | Third bank by size                                                                                                                                                                                                           | running balance                            |
| 6   | **Discount** current account (xlsx)                                                    | The household's own bank, but there is no export in the sample yet (study F5 had screenshots only)                                                                                                                           | running balance                            |
| 7   | **CSV variants** of the above                                                          | Some banks offer CSV only. A CSV is a one-sheet workbook after `decodeText` (UTF-8, else Windows-1255), so the same modules read it. The variants are a delimiter (`,` `;` tab), a BOM, quoted numbers, and a trailing minus | as its xlsx twin                           |
| 8   | **Card PDFs with a text layer**: Max, Cal, Isracard monthly statements                 | The bill people already have. Cheapest with a text layer, and today it is one full extract call per 4 pages                                                                                                                  | the statement's total, the page "N מתוך M" |
| 9   | **Bank PDFs with a text layer**                                                        | The same, for banks                                                                                                                                                                                                          | running balance                            |
| —   | **Status documents**: Discount's loan list and loan terms (study F4), Max's loans page | No transactions. `skip: 'status_document'`, with no call. Today they cost one extract call each and invite an invented "next payment" row                                                                                    | —                                          |

Each bank module also marks rows that pay a card company: the card company's name, "חיוב לכרטיס <network> NNNN", "חיוב זמני". It sets `settlement: 'card-lump' | 'card-per-tx' | 'hold'` on the row, from the line text alone. Matching it to card rows is the dedupe's job (§8).

## 3. PDF text layer in the browser

### 3.1 Library and bundle

- **Library: `pdfjs-dist` 6, already a dependency** and already used by `preparePdf`. Nothing new is added. `pdf-lib` stays, for cutting out scanned pages.
- **Today's cost:** the last local build has `import-pdf-*.js` at about 430 KB and `pdf.worker.min-*.mjs` at about 1.27 MB. Both are outside the precache: `import-*` is in `globIgnores`, and `.mjs` is not in `globPatterns`. They are fetched the first time someone reads a PDF and kept by the `import-readers` runtime cache. The main chunk (`index-*.js`) was about 2.1 MB, under the 3 MiB `maximumFileSizeToCacheInBytes`.
- **This change adds to the main chunk:** nothing. The layout code (§3.2, §3.3) is a few KB per company, imported only from the PDF path.
- **A gate:** a build test fails when `index-*.js` passes 2.8 MiB, so the precache limit is never met by surprise. The same test checks that no `import-formats/pdf/` module ends up in the main chunk.

### 3.2 Positions, lines, columns: `pdf/lines.ts`

Today `preparePdf` joins `item.str` into one string, which loses the layout. The study saw pdf.js return RTL text with the column order scrambled (F4).

- **The change:** `PreparedFile` of kind `text` gains `layout: PdfPage[]` beside `pages`. A `PdfPage` is `{ width, height, items: { str, x, y, w, h, rtl }[] }`, taken from `getTextContent()` (`transform[4]`, `transform[5]`, `width`, `height`, `dir`). `pages` stays, for grounding and for the model fallback.
- `lines(page)`:
  - groups items whose baselines sit within half a line height of each other;
  - orders each line's cells by x, right to left when most of the line is Hebrew;
  - merges items closer than a space's width into one cell.
- `columns(lines, headerLine)` turns the header line's cells into x-ranges, and assigns each later cell to the range it overlaps most.
- Text clean-up runs before anything parses: remove U+200E/U+200F and the bidi controls (§11.4), NFC-normalise, fold Hebrew presentation forms.

### 3.3 Per-company layout modules

- A layout module is a `FormatModule` with `input: 'pdf-text'`.
- `detect` looks for the company's name and the statement's title in the first page's lines. _(invented: a page with "דוגמה כרטיסי אשראי" and "פירוט חיובים")_
- `parse` finds each section's header line, reads rows by column ranges, takes the section's printed total from the line labelled `סה"כ`, takes the statement's card digits from its header, and checks the page footer "עמוד N מתוך M" so a missing page is noticed (§11.5).
- **Fallbacks, in order:**
  1. **No usable text layer on a page** (`usableText` false): the page goes to the model as a one-page PDF, as today.
  2. **A text layer, but no module claims it:** one `transcribe` call with the lines `lines()` rebuilt, as text. It costs less than the page image, and its amounts stay checkable by `groundInText`. Rebuilt lines also stop the scrambled order that let `groundInText` pass any number (study §4, F4).
  3. **A module claims it, but the section totals fail and the residue cannot fix them,** or `groundInText` flags more than 20% of the model's rows on an unclaimed text: the page is sent once more as a page (PDF document). The study recommends this (rec. 5). Its rows replace the text rows only if they then add up.
- **A status document** (a loan list, loan terms, a cards-and-rates page) is detected by its title and returns `skip: 'status_document'`. Cards and rates printed in it may still come out as `FoundCard`s when a module reads them by code. Otherwise the file is listed with "no transactions in this file".

### 3.4 Chunking

`IMPORT_READERS` in `vite.config.ts` gains `src/domain/import-formats/pdf/`. The layout modules are then named `import-*`, kept out of the precache, and runtime-cached with pdf.js. They are imported together through one dynamic `import()` from the PDF path, never one by one per company, so there is one extra request at most.

## 4. Screenshots and images

### 4.1 What stays and what changes

The model still reads the image: there is no code alternative (Decision 12). Everything after reading moves to code.

| Today, in the image call                                                   | After                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The category list and payment methods in the system prompt (`contextText`) | Gone. The context is `today`, `base`, `lang`, and the people of a household                                                                                                                                                               |
| `cat`, `pm`, `mcc`, `sec`, `fee` on every row                              | Gone. Category and MCC come from the same code chain as sheets (§1.2 point 3), then the one `classify` call per import. "Card fee" is code: the issuer's card-fee wording in the merchant text, the same words `INSTRUCTIONS` names today |
| Rules about categories and loans in `INSTRUCTIONS`                         | Gone. A shorter `TRANSCRIBE_INSTRUCTIONS` holds only how to copy, what not to copy, and the section rules                                                                                                                                 |
| One total list per document                                                | Totals **per titled section**, each with its section's label and kind (study rec. 5), so the Discount bank-cards page's three sections hold separately                                                                                    |
| Every row a transaction                                                    | Rows under a heading that says pending ("עדיין לא נכללות") are `st: pending`. "חיוב זמני" and "הרשאה" join the pending words. Tiles, "expected charge", loan tiles, "next payment", balances and sidebar lists are never rows             |
| Cards and accounts read twice when found                                   | Unchanged. An image card is still read twice and compared (`combineCardReads`)                                                                                                                                                            |

### 4.2 The narrow row

`{ s, p, sec, k, st, d, a, c, sg, ca, cc, cd, m, pl, l4 }`, plus `w` in a household. `sec` is the index of the section the row sits under. `k` stays, because a notification with no sign ("received from …") still needs a direction.

### 4.3 What is cheaper

- **Input per call:** the system prompt drops from about 1.7k tokens (instructions, category and method lists, the full schema) to about 0.9k. The image itself (about 2.7k patches for a 1920×1080 capture, about 3.8k for a phone screen; `patches()` in `import-images.ts`) does not change. It is the larger part, so input falls by about 15–20% per call.
- **Output per row:** from about 70 tokens (`tokensForRows`) to about 40.
- **The second read** on Haiku carries the same narrow schema, so it is cheaper in the same proportion. It is still made only when the image prints no total, or when it shows cards or accounts.
- **Fewer correction calls:** per-section totals stop the false `total_mismatch` that today sends correct rows to `verify` on Opus (study §4, F5).
- **No per-row category work** in the primary read, the check read or the correction. A merchant is classified once per import, and not at all when history or the merchant map knows it.
- **Not cheaper:** the image tokens themselves. An image costs about what it costs today; §7 shows by how much the calls around it shrink.

### 4.4 Why not on-device OCR

Tesseract.js with Hebrew and English data is several megabytes of WASM and trained data, above the 3 MiB per-file precache limit even when lazy. On dense RTL statements with mixed digits, its reads would need the same checks and still a model fallback. The model reads images; code checks them.

## 5. The model never overrides code

### 5.1 The rule

- **A field code read is final.** The amount, currency, dates, card digits, plan N/M, section and kind of a code-read row are never replaced by a model answer. The model may fill only what code left empty: the business type and category of a merchant, or a residue row's cells that code could not interpret (§1.2 point 4).
- **A model row is a candidate until the checks pass.** It goes through `readRow`, then through the same section checks as a code row. A failure flags it. It never triggers a second guess that is accepted because it makes a sum meet: a correction is accepted only when it is printed (text) or makes the sums meet **exactly**, as `applyCorrections` already demands.
- **Within one import, an export beats a screenshot.** When a code-read export and a model-read image cover the same card (digits) and overlapping dates, each image row is matched to the export by the study's "probable duplicate" key (last-4, exact ₪ amount, date ±1; rec. 4):
  - matched: the image row is folded into the export row and listed under "also in <export file>". The export's values stand, even where the image read differs;
  - unmatched, inside the export's period: flagged `only_in_screenshot`, non-blocking, because a pending row really can be missing from an export;
  - unmatched, after the export's period: kept as is, since it is newer than the export.

### 5.2 How model rows are held to the file

| Model-read source                  | Held to                                                                                                                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image, with section totals printed | Each section's rows to its own printed total, exactly (`reconcile`, per section, not per file). Pending sections are not summed                                                                                                                                        |
| Image, with no total               | A second, independent read (as today), compared row by row (`combineReads`)                                                                                                                                                                                            |
| PDF text, no module                | Every amount must be printed in the text (`groundInText`) on rebuilt lines; the section totals the model transcribed must also be printed in the text, or they are not used                                                                                            |
| Unknown sheet, model-mapped        | The cells are read by code (`readSheet`); only the column roles came from the model. `mapHolds` plus the section checks: a footer total if one is found by code (a row whose only number equals Σ of the amount column), dates in range, at least 90% of rows readable |
| Residue row from a known format    | Its section's printed total, when there is one (§1.2 point 4)                                                                                                                                                                                                          |

### 5.3 What the review shows when they disagree

- **A new group at the top: "Doesn't add up" / "הסכומים לא מתאימים"**, one card per failing section:
  - _(invented)_ "Local transactions, card ••9999: the file's total is ₪1,000.00, the rows add up to ₪990.00, ₪10.00 short."
  - The rows the difference points at are listed under it (`suspects`, with the `missing_or_duplicated`, `decimal_shift` or `digits` hint in words), unticked.
  - When a model alternative exists, it is shown beside the row as "The reader suggested …". It is never applied by itself. Tapping it fills the row's form, which the person then saves as their own (`confirmed: true`).
- **A section that holds shows nothing extra.** Silence means the sums met.
- **A section with no printed total** gets one quiet line in the file's status: "No total in this file to check against."
- **Flags:** the existing `total_mismatch` (blocking) on suspect rows; a new `only_in_screenshot` (non-blocking); and a new section-level verdict carried on `Reconciliation`, which gains `section` and `label`.
- **Strings:** English and Hebrew in `src/i18n/locales/{en,he}/import.json`, amounts in the `dir="ltr"` island as everywhere (`gate:rtl`).

## 6. Learned layouts

### 6.1 When a layout is learned

All of these must hold:

1. A sheet was unclaimed by every module and every learned layout, and the narrow `map` call (§1.3) mapped it.
2. `readSheet` with that map passes `mapHolds`, and the sheet's sections pass the checks of §5.2. Where the sheet has no total, at least 90% of its rows are readable and every date falls inside the file's span.
3. The person adds the import with at least one row from that sheet whose **amount and date they did not change**. Changing either on any row of the sheet means the map was doubted, and nothing is learned.

### 6.2 What is stored, and only that

```ts
export type ImportLayout = {
  readonly id: string; // the fingerprint
  readonly headers: readonly string[]; // the header row, normalised (§6.4), in order
  readonly roles: Readonly<Partial<Record<ColumnRole, string>>>; // role -> header text, never an index
  readonly dec: '.' | ',';
  readonly df: 'dmy' | 'mdy' | 'ymd';
  readonly confirmed: number; // times it was confirmed
  readonly failures: number; // consecutive failed checks
  readonly createdAt: string;
  readonly updatedAt: string;
};
```

- `ColumnRole` is the keys of `ColumnMap`: `date`, `desc`, `amt`, `debit`, `credit`, `cur`, `chg`, `chgCur`, `chgDate`, `plan`, `card`, plus `mcc` and `sector`.
- **The fingerprint** is the SHA-256 (`sha256Hex`, already in `src/services/crypto/digest`) of the JSON of the normalised header row.
- **Privacy: header text and roles only.** No cell value, no title row, no sample row, no file name and no count of rows is stored.
- **A header row that looks like data is not learned at all.** That is any cell with a run of 4 or more digits, any cell `maskLongNumbers` would change, any cell that parses as a date or an amount, and any cell over 40 characters. A real header passes; a title row with an account number does not.

### 6.3 Storage and sync

- **Dexie:** a new table `importLayouts: 'id, updatedAt'` in a new schema version 5 in `src/db/versions.ts`.
- **Sync:** the table goes in `SYNCED_TABLES` and in `REPLICATED_TABLES`. A layout is household structure, like a category, so it lives in every linked account's space (`EVERYWHERE`). Unlinking leaves each account its own copy. It needs a row schema in the sync codec, a case in `route.ts`, and an empty list in `rebase.ts`.
- **Older builds:** a build without the table skips its records while its pull cursor moves past them, as happened with `cashMoves`. Version 5 therefore runs `resetPullCursors` on upgrade, as version 4 does.
- **Backups** carry the table, and an older backup without it imports cleanly.
- **Two devices learning one layout** produce the same id and an equivalent row, so last-write-wins is harmless. `confirmed` takes the larger value.
- **Delete all data** and account deletion remove it with everything else. `src/db/sync/erase.ts` already walks every synced table.

### 6.4 Using a layout, and the shapes sent to the model

**Order for an unclaimed sheet:**

1. a registry module (code, exact);
2. a learned layout, by exact fingerprint;
3. a learned layout, by near match (§6.5);
4. the dictionary (`mapByDictionary`);
5. the narrow `map` call.

A learned layout beats the dictionary: it was confirmed for this very header, while the dictionary maps one field at a time and was wrong on both exports in the study.

- A layout is applied by header text, not by position: each role's header is looked up in the sheet's header row. The resulting `ColumnMap` is then read by `readSheet` and checked like any other.
- **When the checks fail** on a learned layout, the sheet falls through to the next step, and `failures` goes up by one. A layout with 2 consecutive failures is deleted (a synced tombstone), so a bank's quiet change of meaning cannot keep misreading files. A success resets `failures` to 0 and adds one to `confirmed`.

**Shapes for the narrow `map` call (Decision 9).** Each sample cell is sent as a shape, never its value:

- `DATE(dd/mm/yyyy)`
- `NUM(-#,###.##)`
- `CUR(₪)`: the mark itself, which is not personal
- `TEXT(14)`: the length only
- `CODE(4)`: a run of 4 digits, its length only
- `EMPTY`

The header row is sent as text, after the §6.2 filter. A header that fails the filter is sent as shapes too. Title rows are not sent at all. `sampleRows` is replaced by `shapeRows`.

### 6.5 When a bank changes its headers

| Change                                                                      | What happens                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Columns reordered                                                           | Exact fingerprint misses. **Near match:** the same set of normalised headers in another order maps by header text, passes the checks, and is saved as a new layout. The old layout stays until its failures retire it                                                  |
| A column renamed or added                                                   | Near match: at least 80% of the stored layout's role headers are present, and every role the read needs (date, merchant, one of amount, debit/credit) is still found. Then a read and the checks. If they hold, a new layout is saved after the person confirms (§6.1) |
| The meaning of a column changes (it was the charge, now it is the original) | The fingerprint may still match. The checks catch it (totals, running balance), the layout fails, and the sheet goes to the model. After 2 failures the layout is deleted                                                                                              |
| A registry format changes                                                   | Handled by the module (§11.3), never by learned layouts. A learned layout is never saved for a sheet a module claimed with a `core` match                                                                                                                              |

## 7. Token savings

### 7.1 Method and assumptions

The counts come from the study's inventory, counts only:

| Group                                                       | Files | Sheets or images | Rows          | Distinct merchants                     |
| ----------------------------------------------------------- | ----- | ---------------- | ------------- | -------------------------------------- |
| Max transaction-details xlsx                                | 3     | 6 sheets         | 327           | 130 across files; 136 summed per sheet |
| Discount monthly card xlsx                                  | 10    | 10 sheets        | 281           | 132 across files; 207 summed per file  |
| Discount 12-month summary xlsx                              | 1     | 1 sheet          | 0 (12 totals) | 0                                      |
| Discount loan PDFs (text layer, about 1.5k characters each) | 2     | 2 pages          | 0             | 0                                      |
| Screenshots (Discount and Max web)                          | 8     | 8 images         | about 35      | about 20                               |

The token sizes are estimated from the code. They are good to about ±30%, and phase 1 replaces them with measured usage (§10).

- **System prompt today:** `INSTRUCTIONS` about 900 tokens, `contextText` about 450 for a household with about 30 categories, the answer schema about 350. That is **about 1.7k** per extract, map or verify call.
- **Narrow prompts:** `transcribe` about 0.9k, `classify` about 0.8k (short instructions plus the category list), narrow `map` about 0.5k plus about 0.3k of shapes.
- **Output:** about 70 tokens per extracted row today (`tokensForRows`), about 40 narrow; about 15 per merchant entry today, plus about 120 for the column map every categories call repeats; about 12 per merchant entry in `classify`.
- **Images:** about 2.7k patch tokens for a 1920×1080 capture, about 3.8k for a phone screen (`patches()`); 3k is used below.
- **Today's flow,** read from the code:
  - sheets: one categories call per sheet with any unplaced merchant (`readWorkbook`), and a map call for a sheet the dictionary does not know;
  - a text PDF: one extract call per 4 pages;
  - an image: primary (Sonnet) + check (Haiku) when no total is printed or cards are found + verify (Opus) when something fails. The estimate assumes 7 of 8 screenshots get a check read and 2 a verify.
- **Not counted:** thinking tokens at `effort: 'low'`, and prompt caching. Caching never applies to map calls, and applies to extract only when an import has more than one job. Both are measured in phase 1.
- **Prices:** Anthropic first-party, per million tokens, input / output. `claude-sonnet-5-5` $2 / $10 (`EXTRACT_MODEL`), `claude-haiku-4-5` $1 / $5 (`CHECK_MODEL`), `claude-opus-5-5` $4 / $20 (`VERIFY_MODEL`). Prices as listed on 2026-10-06; check them before relying on the dollar figures.

### 7.2 The study's inventory, first import into a household with no history

| Group                 | Calls today                                   | Tokens in / out today | Calls after                                       | Tokens in / out after                         |
| --------------------- | --------------------------------------------- | --------------------- | ------------------------------------------------- | --------------------------------------------- |
| Max xlsx              | 6 (categories, one per sheet)                 | 14k / 2.8k            | 0                                                 | 0 (merchants go to the shared `classify`)     |
| Discount monthly xlsx | 10 (categories, one per file)                 | 22k / 4.4k            | 0                                                 | 0 (the same)                                  |
| Discount summary      | 1 (map; the sheet then fails)                 | 2.5k / 0.15k          | 0                                                 | 0 (refused; already so on the readers branch) |
| Loan PDFs             | 2 (extract)                                   | 5.4k / 0.6k           | 0                                                 | 0 (`status_document`)                         |
| Screenshots           | 17 (8 primary, about 7 check, about 2 verify) | 81k / 7.9k            | 15 (8 primary, about 6 check, about 1 verify)     | 58k / 4.4k                                    |
| Merchants, all files  | (inside the rows above)                       | —                     | 2 (`classify`, about 260 merchants, 200 per call) | 5.6k / 3.1k                                   |
| **Total**             | **36**                                        | **125k / 16k**        | **17**                                            | **64k / 7.5k**                                |
| **Cost**              |                                               | **about $0.38**       |                                                   | **about $0.18**                               |

- Against the daily cap of 80 calls a person (`ai_usage_one_cap`), this inventory takes 45% of a day today and about 21% after.
- The spreadsheets go from 17 calls to 0 calls of their own. That saving is in correctness as well as tokens: on `main` about 12% of the Max rows saved a wrong amount (study §4), and an exact reader cannot do that.

### 7.3 Per file type, per 1,000 files

First import into a household with no history. Steady state, in brackets, means history already knows most merchants.

| File type                                                                          | Calls per file today             | Cost per 1,000 today | Calls per file after                                              | Cost per 1,000 after                           |
| ---------------------------------------------------------------------------------- | -------------------------------- | -------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| Card xlsx, known format (Max, Discount; Cal and Isracard once their modules exist) | about 1.2 (categories per sheet) | about $11 (about $7) | about 0.15 (a share of one `classify` per import)                 | about $3 (about $1)                            |
| Spreadsheet of an unknown but recurring shape                                      | 2 per sheet (map + categories)   | about $16            | the first file of the shape: map + share; later files: share only | about $6 for the first, then about $1          |
| Card PDF with a text layer, 2 pages, about 40 rows                                 | 1 (extract)                      | about $39            | known layout: share only. Unknown layout: 1 narrow `transcribe`   | known: about $3 (about $1). Unknown: about $29 |
| Screenshot                                                                         | about 2.1                        | about $27            | about 1.9, narrower                                               | about $18                                      |
| Scanned PDF page                                                                   | about 2.1                        | about $27            | about 1.9, narrower                                               | about $18                                      |
| Status document (loan list, terms)                                                 | 1                                | about $6             | 0                                                                 | $0                                             |
| Totals-only summary                                                                | 1                                | about $6.5           | 0                                                                 | $0                                             |

**What this says:** spreadsheets and text PDFs become almost free once a module or a learned layout knows them, and cost falls further as history grows. Images remain the cost centre. They fall by about a third, and only through narrower prompts, fewer correction calls and classifying each merchant once.

**Measuring it (phase 1):** `ImportResult.usage` gains a breakdown by mode and file kind (`{ mode, kind, calls, input, output, cacheRead, cacheWrite }[]`), kept in memory for the import and shown nowhere. The scoring harness (§9.3) writes it per run outside the repo, so the estimates above can be replaced by measured numbers.

## 8. Cross-file dedupe and bank-vs-card double counting

The design is the study's (§3 and rec. 2–4) and is built in its own spec. This spec only fixes what the registry hands it:

- **Identity fields on every code row:** last-4 (always from code, never empty when the file names a card), purchase date, charge date, ₪ charged amount and currency, original amount and currency, plan N/M, section kind (`posted`, `pending`, `immediate`, `fx-wallet`), statement kind (`card` or `bank`), institution, and `source` (`format`, `version`, `section`, `by`).
- **Plan grouping across files** (rec. 2, and the fix for review item C4): one batch-wide `groupPlans` over every code row of the import, keyed on card, purchase date, `merchantKey`, mode, count and total. It runs before `collapseOverlaps`, so Discount's monthly files make one plan per deal.
- **Settlement lines:** bank modules set `settlement` on a row (§2.4). The dedupe matches it to card rows in lump mode (Σ one card's rows, charge date ±3 days) or per-transaction mode (1:1, exact amount, bank date in [purchase, purchase + 5]), and a matched or unmatched settlement line is a transfer, never an expense.
- **Pending to posted:** a row in a `pending` section is replaced by a posted row with the same last-4 and amount within [date, date + 3].
- **Blocking vs advisory:** block only on the identity or the probable key; a same-amount match on another card is the non-blocking "similar" note (review item I3 on the readers branch).
- **Code beats model:** when two rows match, the one with `source.by: 'code'` is kept and the model's is folded (§5.1).

## 9. Tests

### 9.1 No real value may enter the repo

**This is a hard rule, not a preference.** The review of `smart-import-readers` (item C1) found real card digits, real date and amount pairs, and a real trip's city in fixtures described as "invented". Those values were already on `origin` in places. So:

- **Every fixture is synthetic.** It is generated from the formats the study documents, with values that are plainly made up:
  - card digits only from the reserved set 9990–9999;
  - years 2031–2033, never a year near the real files;
  - merchant names such as "DEMO CAFE", "חנות לדוגמה";
  - cities "DEMO CITY", country "ZZZ";
  - account numbers that fail the bank check-digit rule (`isAccountNumber` false), so they can never be someone's.
- **Amounts** come from a seeded generator and must end in a pattern the private corpus does not hold. The private check (below) confirms that, rather than trusting it.
- **Header strings are allowed.** "סכום חיוב" is a format fact, not personal data. Title-row content is never copied from a real file; it is written to the documented shape with invented values.
- **Before reporting, every agent greps its diff for real values.** It runs the private check against its added lines, and its report states that it did and that the result was zero hits. An agent that cannot run the check (no private folder) says so and does not claim the diff is clean.
- **The private check** is `scripts/gate-private.mjs`, wired into the pre-commit hook:
  - It runs only when `BOOKANDRY_PRIVATE_TOKENS` points to a token file **outside** the repo. It refuses a path inside it. Without the variable it prints "skipped" and exits 0, so CI and other machines are unaffected.
  - The token file holds **SHA-256 hashes** of the sensitive tokens: card and account digits, amounts in their printed forms (`1234.56`, `1,234.56`), dates, merchant words, place names. Neither the gate nor its token file holds a value in clear.
  - The gate tokenises the staged added lines the same way, hashes each candidate, and fails on any hit, naming file and line but never the value.
- **Phase 0 cleans `main`.** The real card digits already on `main` are replaced with values from the reserved set, in a commit of its own.

### 9.2 Golden fixtures per format, in the repo

- `src/test/fixtures/import/build.ts` generates each fixture with SheetJS: xlsx and CSV with the exact header rows, title rows, footers, number formats (`"$"#,##0.00`, the escaped `"ש""ח"`) and sheet names of each format. PDF text fixtures are `PdfPage` JSON (positioned items), so no binary PDF is committed. Generated files are committed beside the generator, and a test fails if regenerating changes them.
- **One golden per module:** the input, then the expected `FormatRead` as JSON (sections, rows' identity fields, totals, counts, cards).
- **The cases each format module must cover:**
  - every section kind it has;
  - refunds (negative);
  - foreign rows: a named currency, a blank currency (Max), a currency only in the number format (Discount);
  - an instalment deal across rows and across files;
  - a loan's disbursement, repayments and an adjustment row;
  - the FX wallet chain, with both a matched and an unmatched load (review item C3);
  - a promo "--" cell;
  - a row with an Excel serial date, with `date1904` both ways (review item I1);
  - a footer total that holds, and one that is off by one row;
  - a printed count that holds, and one that does not;
  - card digits outside the file's card set.
- **Registry tests:**
  - no two modules claim one fixture sheet;
  - a workbook with two formats splits per sheet;
  - a `core` match reads correctly and is marked as such;
  - an unknown sheet is unclaimed.
- **Check tests** (`import-verify.ts`): per-section sums, counts, running balance (with one wrong row it names that row), the date window, card set, plan N ≤ M. Every money comparison is in integer minor units.
- **Wire tests:**
  - each new mode's request parse rejects over-limit bodies;
  - each answer cleaner drops a bad row;
  - the shared copy of `import-wire.ts` in the function stays identical (the existing test);
  - an old `map` or `extract` body still parses.
- **Learned layout tests:**
  - learning needs all three conditions of §6.1;
  - a header row with a 4-digit run, a date or an amount is never stored;
  - exact match, near match and reorder;
  - two failures delete the layout;
  - sync round-trip and replication to every space;
  - an older build's cursor reset on upgrade;
  - delete-all removes them.
- **run-import tests** with a fake `Caller`, asserting the number and mode of calls:
  - a known xlsx makes 0 reading calls;
  - one `classify` per import, whatever the number of files;
  - an image makes `transcribe` with no category list in the request;
  - a residue row is sent alone and rejected when it does not make its section meet.
- **Review (dom):** the "doesn't add up" group in en and he, a model suggestion shown and not applied, `only_in_screenshot` not blocking.
- **E2E:** import a synthetic Max export and a synthetic Discount export together (0 model calls, through a stubbed function); import a synthetic unknown bank CSV twice (one map call, then none).

### 9.3 The scoring harness, outside the repo

- **The code** is in the repo, in `scripts/import-score/`. It holds no data and no values. It bundles the registry, the checks, `readSheet` and `draftOf` from `src/`, as the study's offline run did.
- **The corpus, answer keys and reports** stay in a private folder outside the repo: `BOOKANDRY_IMPORT_CORPUS`, today `C:/Users/HighL/.bookandry-private/import-study/`. The harness refuses to run if that path, or its output path, is inside the repo.
- **Answer keys** are built per the study §6: each export parsed into canonical rows. For a screenshot, the key is the subset of export rows inside its window.
- **Metrics** (study §6):
  - row recall and precision on the identity key;
  - the exact-amount rate;
  - currency accuracy;
  - pending accuracy;
  - plan grouping;
  - duplicate-flag precision and recall;
  - section reconciliation;
  - **calls and tokens per file type** (§7).
- **Output:** a JSON report of **counts only** to the private folder, plus a console summary of counts.
- **Modes:** deterministic by default, with no network. `--with-model` runs the image and unknown-format cases through the real function. It needs an explicit flag, prints the estimated cost first, and is run only by the files' owner.
- **Every phase's PR** quotes the harness's deterministic summary (counts) next to `pnpm verify`.

## 10. Build order

Each phase ships on its own, with `pnpm verify` green and the private check clean.

| Phase  | What                                                                                                                                                                                                                                                                           | Depends on                                           | Can start                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------- |
| **0**  | `smart-import-readers` lands with its review fixes (C1–C4, I1–I7), its fixtures rewritten on synthetic values and its history rewritten before any push. Separately, the real card digits already on `main` are scrubbed, and `scripts/gate-private.mjs` is added (§9.1)       | the readers branch's own fix work                    | now (the gate and the scrub); the landing is the branch's |
| **1**  | **Measure.** The per-mode usage breakdown in `ImportResult` (§7.3); the scoring harness running today's pipeline offline on the private corpus; baseline numbers recorded privately                                                                                            | nothing                                              | **now, on `main`**                                        |
| **2**  | **Narrow `classify`.** The new wire mode, the function first, then the app: one call per import across files, merchants deduplicated by `merchantKey`; the bundled merchant map (§1.4) and `mccSource: 'map'`                                                                  | the function deploys before the app                  | **now, on `main`**                                        |
| **3**  | **Registry and checks.** `import-formats/` with the module interface; Max and Discount moved into modules; sections, footer totals, the Discount count, card sets; `import-verify.ts`; per-section `reconcile`; batch-wide plan grouping; the "doesn't add up" group in review | phase 0 (the readers)                                | after phase 0                                             |
| **4**  | **Residue rows and the narrow map.** The `rows` mode for unreadable cells and lines; the `map` call with cell shapes instead of values (§6.4)                                                                                                                                  | phase 3 (sections to check a residue answer against) | the shapes part now; `rows` after phase 3                 |
| **5**  | **Learned layouts.** Dexie v5, the synced, replicated `importLayouts` table, cursor reset, learning, exact and near match, retirement                                                                                                                                          | phase 3 (the registry order) and phase 4 (shapes)    | the table and sync plumbing now; wiring after phase 3     |
| **6**  | **PDF text layer.** Positioned items in `prepare-files`, `lines()` and `columns()`, the `status_document` skip for the Discount loan PDFs, the chunk rule and the main-chunk size gate; rebuilt lines for an unknown text PDF                                                  | phase 3                                              | after phase 3                                             |
| **7**  | **Images.** `transcribe` with the narrow prompt and row, per-section totals and pending sections, the export-beats-screenshot match (§5.1)                                                                                                                                     | phases 2 and 3                                       | after phase 3                                             |
| **8+** | **More formats,** in the §2.4 order, one module per PR, each only once a real export's headers are collected privately: Cal, Isracard/Amex, the bank accounts with the running-balance check, CSV variants, card and bank PDF layouts                                          | phase 3; phase 6 for PDFs                            | as samples arrive                                         |

**Depends on the readers branch:** phases 3, 4 (`rows`), 5 (wiring), 6, 7 and 8. **Independent of it:** phases 1 and 2, the gate and scrub of phase 0, the shapes of phase 4, and the storage of phase 5.

## 11. Edge cases

### 11.1 The same file twice

- **In one batch:** `prepare-files` already hashes every file (`sha256Hex`). The second copy is refused before it is read, with a new reason `duplicate_file` ("This file is already in this import"), and it costs nothing.
- **In a later import:** files are still read afresh (`forgetImportReads` stays), so a fix to a reader reaches them. Its rows meet the household's on the identity key and are grouped as "looks already added". A learned layout is unaffected (`confirmed` goes up, nothing else).
- **The same rows in two different files** (a re-export with a wider range): the identity key, not the file hash, catches them (§8).

### 11.2 One workbook, several formats

Detection is per sheet (§2.2). Each sheet gets its own module, learned layout, dictionary map or model map. A totals sheet inside a transactions workbook is skipped alone (review item M2). Sections keep their sheet, so each total is held to its own sheet's rows.

### 11.3 A changed format version

- **A module keys on a core subset as well as the full signature.** A full match is `exact`. A core match (the money, plan, date and merchant headers) is `core`: it reads with the module, sets `version: 'unknown'`, and shows one line in the file's status ("This export looks a little different from what the app knows; check the totals"). The section checks then decide: if they hold, the read stands; if they fail, the rows are flagged, never sent to the model to be re-read.
- **Below the core subset** the sheet is unclaimed, and goes to learned layouts, then the dictionary, then the model. The file's status says so.
- A new version seen in the harness is added to the module as a new `version`, with a new golden, keeping the old one.

### 11.4 Hebrew RTL marks and odd number formats

**One normaliser** (`sheet-common.ts`) runs on every header and every text cell before parsing:

- it removes U+200E, U+200F, U+202A–U+202E and U+2066–U+2069;
- it turns NBSP (U+00A0) and narrow NBSP (U+202F) into spaces;
- it folds the Hebrew geresh and gershayim to ASCII quotes;
- it collapses whitespace.

**Amounts** that must read correctly, each with a test:

- `1,234.56`, `-1,234.56`, `1,234.56-` (trailing minus), `(1,234.56)`;
- `₪ 1,234.56`, `1,234.56 ש"ח`, `ILS 1,234.56`;
- a number stored as text with a leading apostrophe, and a number with NBSP as the thousands mark;
- `--` (no amount: fall back to the charged column, study F2);
- a currency only in the number format, including Excel's escaped `"ש""ח"` (review item M4).

`parseStatementAmount` keeps refusing an ambiguous `1.234`.

**Dates:**

- text `dd/mm/yyyy`, `dd-mm-yyyy`, `dd.mm.yy`;
- an Excel serial with `date1904`;
- the summary's `mmyyyy`, read only to recognise the format and skip it;
- Max's range title `yyyy-mm-dd-yyyy-mm-dd`, split at the middle hyphen, by position, never by a naive split.

### 11.5 Partial files

| Partial how                                                   | What happens                                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A sheet has rows but no footer total                          | No sum check. The other checks still run; the file's status says "No total in this file to check against"                                                     |
| An export stops mid-month, or covers part of a charge cycle   | Read as is. The period is the rows' span. Dedupe handles the overlap with the next export (§8)                                                                |
| A PDF with pages missing                                      | The layout module reads "עמוד N מתוך M": a missing page flags the statement total as not checkable, not as a mismatch, and the status names the missing pages |
| A sheet cut off by an Excel row limit or a browser export cap | The footer is missing and the printed count, if any, does not match. Flagged as partial, rows kept                                                            |
| A file whose rows all fail to parse                           | Nothing is sent to the model to re-read exact cells (§1.2 point 4). The file is "read, but no row could be understood", with the reasons                      |
| A transcription cut off (`partial` from the function)         | As today: retried with more room, then continued up to 5 times. Anything still missing marks the file partial                                                 |

### 11.6 Others

- **Values in title rows** (Discount's account number and holder): never read by the module, never sent, never learned (§2.3, §6.2).
- **A screenshot of a period an export in the same import covers:** export wins (§5.1).
- **A card in screenshots with no export** (study §3): its rows are model rows with no export to hold them to. A later export of that card matches them on the identity or probable key and folds them.
- **Offline:** detect, parse, check, the merchant map and learned layouts all work offline. A file needing the model waits, as today.
- **An app older than the function:** it keeps sending the old modes, which still work. **An app newer than the function:** it is avoided by deploying the function first, which is part of each phase's checklist.

## 12. Out of scope

- The dedupe and settlement rules themselves (§8), which get their own spec from the study's design.
- Open banking and direct bank connections (`research/open-banking`).
- On-device OCR (Decision 12).
- Backfilling rows saved wrongly by `main` before the exact readers (review item M3). That is a release note and, later, a cleanup hint.
- Telemetry. No usage or format statistics leave the device. The harness runs only on the owner's machine.
