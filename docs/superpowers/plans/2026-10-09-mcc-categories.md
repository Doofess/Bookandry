# Business Types (MCC) for Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every expense gets a business type, a Merchant Category Code (MCC) from a bundled public-domain list. It is found from the file's MCC column, then the card company's sector text, then the person's history, then Claude. A table turns the business type into a category. The person can move a business type into another category from the categories screen, and can move past expenses with it, with Undo.

**Architecture:** There are three optional fields: `Transaction.mcc`, `Transaction.mccSource` and `Category.mccs`. There is no new table, no Dexie version bump and no cursor reset. The list ships as two files:

- `src/domain/mcc-codes.ts` holds the codes alone (about 5 KB). It is synchronous, has no imports, and the Edge Functions use a verbatim copy of it.
- `src/data/mcc.json` holds the English and Hebrew names (about 96 KB). It is its own lazy chunk.

Pure modules decide everything:

- `mcc.ts`: names and search.
- `mcc-categories.ts`: the default table, the person's moves, and the two precedence chains.
- `merchant-key.ts`.
- `sector-mcc.ts`.

The history walk, the import, the form's auto step, the categories screen and the feed search all call these modules.

**Tech Stack:** React 19, TypeScript, Dexie 4 (IndexedDB), zod 4, react-hook-form, Base UI (shadcn-style wrappers in `src/components/ui`), cmdk, i18next (en + he, RTL), Tailwind v4, Vitest (projects `unit`, `db`, `dom`), Playwright (projects `en`, `he`, `mobile`) with `@axe-core/playwright`, Supabase Edge Functions (Deno).

**Spec:** `docs/superpowers/specs/2026-10-09-mcc-categories-design.md` (approved and binding). Each executor reads the spec sections their task names. The section "Spec points this plan settles" below says where the plan had to choose.

## Global Constraints

- **Toolchain:** Node and pnpm are NOT on a fresh shell's PATH. Every shell command in this plan that runs `pnpm`, `node` or `git commit` must start with a prefix, because the commit hook runs pnpm:
  - Bash: `export PATH="/c/Users/HighL/AppData/Local/node:$PATH" && cd /c/dev/greenback && `
  - PowerShell: `$env:PATH = "C:\Users\HighL\AppData\Local\node;" + $env:PATH; Set-Location C:\dev\greenback; `

  The commands below leave the prefix out for brevity. Always add it.

- **Running tests:** `pnpm test --project <unit|db|dom> <file> [-t "<name>"]`. `pnpm test` is `cross-env TZ=Etc/UTC vitest run`. The projects cover these files:
  - `unit`: `src/{lib,domain,i18n,data}/**/*.test.ts`
  - `db`: `src/{db,services,features}/**/*.test.ts`
  - `dom`: `src/**/*.test.tsx` and `src/app/**/*.test.ts`
- **A business type is a 4-digit string** (`"0742"` keeps its zero), never a number. `isMcc(code)` (`src/domain/mcc-codes.ts`, re-exported by `src/domain/mcc.ts`) is the one check that a code is in the list.
- **Two levels of checking (spec §1.3, §6):**
  - A synced or imported row is checked for its SHAPE only:
    - `mcc`: `/^\d{4}$/`;
    - `mccSource`: any string of 1 to 20 characters;
    - `mccs`: at most 200 unique 4-digit strings.

    A code or a source that a later build adds must not make this build refuse the whole row.

  - Every way a code comes IN checks `isMcc`, and drops a code that fails it, never storing it: the form, a sheet cell, the reader, Claude, history and the file validator (`transfer-validate`).
- **`mcc` and `mccSource` belong to expenses only.** The form strips them from income. `transfer-validate` refuses them on income. History and Claude never give income one.
- **`mccSource`:** `'file' | 'sector' | 'history' | 'ai' | 'user'`. Only the first four may be replaced automatically. `'user'`, any string this build does not know, and a code with no source are never replaced (`replaceableMcc`).
- **A series carries one `mcc`.** It lives on the `Transaction`, and `OverridePatch` never gains it. An edit at scope "one" writes the new business type to the series' transaction as well as writing the override.
- **`Category.mccs`** holds the business types moved INTO that category, and `DEFAULT_MCC_CATEGORY` never writes there. Moving a code removes it from every other category in the same Dexie transaction. Every category write spreads the stored row.
- **Category order for an expense (spec §3), verbatim:**
  1. `knownCategory`;
  2. the person's own choice for this merchant;
  3. `categoryForMcc`;
  4. `categoryFromText`;
  5. Claude's `cat`;
  6. refund, then Other.

  Income keeps today's order, without step 3.

- **Business-type order (spec §2):** the file's MCC column, then the sector, then history, then Claude.
- **Upstream data (pinned):**
  - Source: greggles/mcc-codes, commit `df792275c567946119a8903d36dbd33e44a248bf` (2024-08-16, the newest on 2026-10-09).
  - File: `https://raw.githubusercontent.com/greggles/mcc-codes/df792275c567946119a8903d36dbd33e44a248bf/mcc_codes.json`.
  - File SHA-256: `60fff0a4457e18dd03731a8971f219f2d1e4b22a13c1d930aaac07badbfe8e68`.
  - 981 codes. Licence: the Unlicense.
  - The Hebrew names are ours.
- **`src/data/mcc.json` is loaded only through `import()`** (`loadMccList`). No app module imports it statically, so the main chunk does not grow by it.
- **Claude:** no new calls are added, and the code list is never sent in a prompt.
- **Copy (verbatim from the spec):**

  | en                                                                                                  | he                                                           |
  | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
  | Business type                                                                                       | סוג עסק                                                      |
  | Not set                                                                                             | לא נקבע                                                      |
  | Add a business type                                                                                 | הוספת סוג עסק                                                |
  | Move the N past expenses with this business type here too?                                          | להעביר לכאן גם את N ההוצאות הקודמות מסוג זה?                 |
  | Return to default                                                                                   | החזרה לברירת המחדל                                           |
  | and N more                                                                                          | ועוד N                                                       |
  | Cash withdrawal: not counted as an expense. You can record it in the Cash tab. (added by this plan) | משיכת מזומן: לא נספרת כהוצאה. אפשר לרשום אותה בלשונית מזומן. |

  The English is verbatim from the spec, except the last row, which the plan adds for the user's ruling of 2026-10-09 (spec point 14). "Cash" and "מזומן" are the Cash tab's own names (`common:nav.cash`). Where the spec gives no Hebrew, this plan gives it. Any other copy is listed in the task that adds it.

- **UI copy never says "sync"** (user rule). Say "account" and "saved".
- **Money:** integer minor units only. `gate:money` bans `parseFloat`, `.toFixed(`, `* 100` and `/ 100` outside `src/lib/money.ts`.
- **Dates:** `LocalDate` strings only. There is no `new Date()` or `Date.now()` outside `src/lib/clock.ts`. Use `systemClock.nowIso()`.
- **RTL:** `gate:rtl` bans physical-direction utilities. Use `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start` and `text-end`.
- **Layering (lint-enforced):**
  - The order is `types → lib → i18n → domain → {db, services} → features → app`.
  - `domain/` never imports `db/`, React or Dexie, and that includes its test files.
  - `useLiveQuery` is called only in hooks and route containers.
- **`gate:pci`** scans `src/**/*.json` and `supabase/functions/**/*.ts`. The upstream text contains none of its forbidden words (this was checked), and none may be added.
- **i18n:**
  - Every visible string goes through `t()`.
  - The `he` JSON mirrors `en` key for key.
  - Hebrew plurals need `_one`, `_two` and `_other`. English plurals need `_one` and `_other`.
- **Targets:** every new tappable control is at least 44px tall on a phone (`min-h-11` / `size-11`).
- **Commits:** one per task, made only when that task's tests pass.
  - The message is one plain English sentence saying what the person gains, in the repo's style (see `git log -15`). An optional second `-m` paragraph may follow, and the body ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - The pre-commit hook runs eslint --fix and prettier on staged files.
  - Never pass `--no-verify`. If the hook rewrites files, stage them again and commit again.
- **Per-task gate:** `pnpm typecheck`, `pnpm lint` and `pnpm format:check` pass, plus that task's tests. Task 13 runs the full `pnpm verify`.
- **Edge Function deploys are not a task.** The controller deploys `categorize` and `extract-transactions` after Task 13 (see "After the last task").

## Review Focus

These are the five inputs most likely to bite a person that the spec's own test list does not pin down, plus a sixth for the user's later ruling on cash withdrawals. Each one has a test in the task named.

1. **Two different payees behind one payment service, such as `PAYPAL *4029357733` and `PAYPAL *4029357744`, or `העברה בביט 0501234567` and `ביט 0527654321`.** Stripping digits leaves only `paypal` or `ביט`, so `merchantKey` would merge every PayPal or Bit payment into one merchant. Each payment's history would then decide the next one's category and business type. Expected: a key that is only a payment service or a transfer word is no key, so nothing merges. Tests are in Task 3 (`merchantKey`) and Task 6 (the history walk).
2. **Claude returns a valid-looking but wrong code for a merchant a name rule already knows, such as 5411 (supermarkets) for "Netflix".** `knownCategory` still files Netflix under Subscriptions. But a stored 5411 would become history, and history would then spread "supermarket" to the next Netflix row, and to its `merchantKey` siblings. Expected: a code from Claude whose category disagrees with `knownCategory`'s is dropped, not stored. A code from the file or the sector is kept. Tests are in Task 8 (`pickMcc`, review) and Task 9 (the form's auto step).
3. **"Move N past expenses" must touch only the rows the old mapping put there.** These rows must not move:
   - a row with the same business type that the person filed elsewhere by hand;
   - a deleted row;
   - income;
   - an override that set one occurrence's category.

   Undo must restore exactly the moved rows. Expected: only live expenses with this `mcc` whose series category is the code's old category move. The test is in Task 11 (repository and screen).

4. **A typed expense whose business type was filled in, switched to income before saving.** The kind toggle is how someone files "Refund from Amazon". If `mcc` survives the switch, the income is saved with a business type, and every later backup is refused by `transfer-validate`. Expected: the saved income has no `mcc` and no `mccSource`. Tests are in Task 5 (`txFormSchema`) and Task 10 (the sheet).
5. **An Excel MCC column read as a number.** Excel stores `0742` as `742`, `5411` as the number `5411`, and sometimes `5411.0`. A text cell may carry spaces. Expected: these read as `"0742"`, `"5411"` and `"5411"`. A cell that is not a listed code (`"9999"`, `"abc"`, empty) gives no business type and never flags or fails the row. The test is in Task 7.
6. **A bank export's cash withdrawal (added with the ruling of 2026-10-09).** A bank's sheet has no MCC and no sector, so a `משיכת מזומן` or `כספומט` row gets its business type from history or from Claude, usually 6011. Expected: it arrives unticked, in "Check these", with the cash-withdrawal note, whichever source gave the 6011. An income row is never flagged. Ticking it back in saves an ordinary expense under Currency exchange with its 6011. The test is in Task 8.

## Spec points this plan settles

1. **`isMcc` must be synchronous**, because schemas and cleaners call it, while the names load lazily. So the codes live apart from the names, in a generated import-free `src/domain/mcc-codes.ts` with a verbatim copy at `supabase/functions/_shared/mcc-codes.ts`. `mccName` and `searchMcc` take the loaded list as their first argument, like `findBranch(list, …)` in `bank-branches.ts`: `mccName(list, code, language)` and `searchMcc(list, query, language)`.
2. **Row schemas check shape, not membership.** See Global Constraints. Rejecting a synced row over a code that a newer list added would silently drop that row on this device. Membership is checked on every way in, and by `transfer-validate` for files, as the spec asks.
3. **`mccSource` is stored as any string.** This follows the precedent of `CashMove.kind`. A source this build does not know is treated like `user`, so it is never replaced.
4. **The spec's example `merchantKey` is inconsistent.** "שופרסל דיל 123 ת"א" gives `שופרסל דיל ת א` and "שופרסל דיל 45" gives `שופרסל דיל`, so these two do NOT merge, because cities are kept, as the spec requires. Pairs with the same city suffix do merge. One rule is added: a key that is only a payment service or a transfer word is empty (Review Focus 1).
5. **"The person's own choice for this merchant" (§3 step 2):**
   - The newest past row with the same text decides. Without one, the newest row with the same `merchantKey` decides.
   - If that row's category is exactly what the DEFAULT table gives its own `mcc`, then the table chose it, not the person, so step 2 gives nothing and step 3 decides.

   Without this rule, a business type moved to another category (§4.2) would never apply to "future ones" of a merchant already seen, which the spec requires. Rows without an `mcc`, meaning every row today, behave exactly as before.

6. **The `categorize` reply keeps its existing key `categoryId`** and gains `mcc`. The spec writes `{ id, mcc }`, but the deployed app reads `categoryId`.
7. **A PDF or image row's `mcc` is labelled `ai`.** The reader transcribes a printed code or guesses one, in the one `mcc` field. The two cannot be told apart, so the row's sector and history come before it.
8. **The sector hint (§2 step 2)** travels as an optional `sectors` array on the map request, parallel to `merchants`. An older function ignores it.
9. **`knownMerchant` becomes `history`** in the import context. Before, a merchant the household had filed was never sent to Claude. Now an expense is asked about when it has no business type from its file, its sector or its history, and an income is asked about when history does not place it. At first, after release, known merchants are asked about once more, to get their business types. That is the "get one when … imported again" of §8.
10. **The form's auto step on an edit (§4.1, §8 "they get one when edited"):** the category of an edit stays the person's.
    - When an edit of an expense with no business type opens, the hook looks the business type up from history only, which is free and local.
    - Claude is asked only when the name is typed or changed.

    Opening a row only to look at it never calls Claude.

11. **"Move N past expenses" moves series rows** (each `Transaction` once) and never overrides. A per-occurrence category is a hand edit (Review Focus 3).
12. **There is no per-category page.** `categories-screen.tsx` has only a rename sheet for custom categories, and built-ins have no edit control at all. So each expense category row gains a "Business types" button. It opens a new sheet, `src/features/settings/business-types-sheet.tsx`, which is the page §4.2 describes, for built-in and custom categories alike.
13. **E2E "import a small sheet with a sector column":** the E2E build has no account server, so Smart import is disabled there (`e2e/00-shell.spec.ts`, "says why import is unavailable here"). That path is instead a dom test that uploads a CSV through the real `ImportSheet`, with the reader faked (Task 8). The E2E covers the form, the categories screen and the feed search in en, he and mobile (Task 13).
14. **The default table follows each code's meaning**, beyond the spec's examples:
    - 5511–5599 (car, boat and motorcycle dealers, parts and tyres) goes to `cat.transport`, consistent with the spec's 5541 and 5542.
    - 5734 (software stores) and 7372 (programming and data processing, where most software-as-a-service bills) go to `cat.aiSoftware`.
    - 5962 (travel arrangements) goes to `cat.travel`.
    - 5968 (subscription merchants) and 7375 (information services) go to `cat.subscriptions`.
    - 5975 and 5976 (hearing aids, orthopaedic goods), 5047 and 5122 (medical supplies, drugs), 4119 (ambulance), 7277, 7297 and 7298 (counselling, massage, spas) go to `cat.health`.
    - 5983 (heating fuel, bottled gas) goes to `cat.utilities`.
    - 6513 (property rentals) goes to `cat.rent`.
    - 8351 (child care) goes to `cat.kids`.
    - 5013 and 5172 (vehicle supplies, petroleum) go to `cat.transport`.
    - The car-rental and hotel brand ranges go to `cat.travel`.
    - The rest of Task 4's table reads each code the same way: 4011 and 4112 (railways), 4789, 7511, 7513 and 7523–7549 (car services) go to `cat.transport`; 4411, 4457, 4582, 4723, 7012, 7033, 7512 and 7519 go to `cat.travel`; 4815 and 4821 go to `cat.phoneInternet`; 6381 and 6399 go to `cat.insurance`; 7032 (camps) goes to `cat.kids`; 7278 and 7296 go to `cat.shopping`; 7800–7802, 7922–7933 go to `cat.entertainment`; 7911 (dance studios) goes to `cat.fitness`. Everything the table does not name is `cat.otherExpense`.
    - 6010 and 6011 (cash withdrawal) go to `cat.currencyExchange`, as the spec writes, so a row the person keeps, or a typed expense with that code, still has a category. But by the user's ruling of 2026-10-09, which overrides the spec here, **cash taken out is not an expense in import**. Review labels an expense row whose business type is 6010 or 6011 "Cash withdrawal", says it is not counted as an expense and can be recorded in the Cash tab, and leaves it unticked. This uses a blocking `cash_withdrawal` flag, the mechanism review already has (Task 8). The person can tick it back in. Turning such rows into Cash-tab withdrawals is parked (see "After the last task").

## File Structure

| File                                                                                                                                                                                             | Responsibility                                                                                                                                                      | Task      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `scripts/build-mcc.mjs` (new), `package.json`, `.prettierignore`                                                                                                                                 | `pnpm data:mcc`: checks `mcc.json` against the pinned upstream file, and writes the code lists and `mcc-SOURCES.md`                                                 | 1         |
| `src/data/mcc.json` (new), `src/data/mcc-SOURCES.md` (new, generated)                                                                                                                            | every code with `en` and `he`, one per line; where it came from                                                                                                     | 1         |
| `src/domain/mcc-codes.ts` (new, generated), `supabase/functions/_shared/mcc-codes.ts` (new, generated copy)                                                                                      | `MCC_CODES`, `isMcc`                                                                                                                                                | 1         |
| `src/domain/mcc.ts` (new)                                                                                                                                                                        | `MccEntry`, `MccList`, `MCC_SHAPE`, `mccName`, `searchMcc`, `foldSearch`, `replaceableMcc`                                                                          | 1         |
| `src/services/mcc/mcc-list.ts` (new), `src/features/business-type/use-mcc-list.ts` (new)                                                                                                         | `loadMccList()`, the lazy chunk; `useMccList()` for screens                                                                                                         | 1         |
| `src/types/domain.ts`                                                                                                                                                                            | `MccSource`, `Transaction.mcc`, `Transaction.mccSource`, `Category.mccs`                                                                                            | 2         |
| `src/domain/transfer-schema.ts`, `src/domain/transfer-validate.ts`                                                                                                                               | shapes on rows; list membership and income refusal in files                                                                                                         | 2         |
| `src/domain/merchant-key.ts` (new), `src/domain/sector-mcc.ts` (new)                                                                                                                             | `merchantKey`; `SECTORS`, `sectorMcc`                                                                                                                               | 3         |
| `src/domain/mcc-categories.ts` (new)                                                                                                                                                             | `DEFAULT_MCC_CATEGORY`, `DEFAULT_OTHER`, `defaultCategoryForMcc`, `categoryForMcc`, `businessTypesOf`; later `pickMcc`, `chooseExpenseCategory`, `isCashWithdrawal` | 4, 8      |
| `src/domain/tx-form.ts`, `src/domain/tx-edit.ts`, `src/domain/series-edit.ts`, `src/db/save-transaction.ts`                                                                                      | the business type through the form, a save and an edit at every scope                                                                                               | 5         |
| `src/db/repos/transactions.ts` (+ its three callers)                                                                                                                                             | `merchantHistory` (one walk: text, then key; category and business type)                                                                                            | 6         |
| `src/domain/import-wire.ts` (+ `_shared` copy), `src/domain/import-sheet-map.ts`, `src/domain/import-check.ts`                                                                                   | `mcc` and `sector` columns, `mcc` and `sec` on the wire row, `{ m, mcc, cat }`, `sectors` hints, `fileMcc`, `sector` and `aiMcc` on a found row                     | 7         |
| `src/features/import/run-import.ts`, `src/features/import/review-items.ts`, `src/features/import/import-sheet.tsx`, `src/domain/import-check.ts`                                                 | who is asked; the chain in review; the cash-withdrawal flag; the business type saved with each row                                                                  | 8         |
| `supabase/functions/categorize/index.ts`, `src/services/supabase/categorize.ts`, `src/app/account.ts`, `src/features/transaction/use-auto-category.ts` (+ its wiring in `transaction-sheet.tsx`) | `{ categoryId, mcc }`; the form's auto step fills the business type                                                                                                 | 9         |
| `src/features/business-type/business-type-picker.tsx` (new), `src/features/transaction/transaction-sheet.tsx`                                                                                    | the searchable pop-out; the "Business type" row                                                                                                                     | 10        |
| `src/db/business-types.ts` (new), `src/features/settings/business-types-sheet.tsx` (new), `src/features/settings/categories-screen.tsx`                                                          | move, return and past expenses with Undo; the sheet. (`src/db/repos/categories.ts` needs no change: Task 2 pins that its writes spread the row.)                    | 11        |
| `src/domain/feed.ts`, `src/features/feed/use-feed-data.ts`, `src/features/feed/feed-screen.tsx`                                                                                                  | search matches business type names                                                                                                                                  | 12        |
| `e2e/16-business-types.spec.ts` (new), `README.md`                                                                                                                                               | end to end; the design decision                                                                                                                                     | 13        |
| i18n `common.json`, `categories.json`, `import.json` (en, he)                                                                                                                                    | the copy                                                                                                                                                            | 8, 10, 11 |

Tasks 2 and 4 are in this order (types before the table) because `categoryForMcc` reads `Category.mccs`. `useMccList` is in Task 1 so Tasks 10, 11 and 12 do not wait on each other for it.

---

### Task 1: The bundled list of business types

Spec §1.1, §6 ("A code that isn't in the list", "Hebrew search"), §7 "Data". Spec points 1 and 3.

**Files:**

- Create: `src/data/mcc.json` (copied from the main checkout, then rewritten by the script)
- Create: `scripts/build-mcc.mjs`
- Modify: `package.json` (`scripts`)
- Modify: `.prettierignore`
- Create (generated): `src/data/mcc-SOURCES.md`, `src/domain/mcc-codes.ts`, `supabase/functions/_shared/mcc-codes.ts`
- Create: `src/domain/mcc.ts`
- Create: `src/services/mcc/mcc-list.ts`
- Create: `src/features/business-type/use-mcc-list.ts`
- Test: `src/data/mcc.test.ts` (unit), `src/domain/mcc.test.ts` (unit), `src/services/mcc/mcc-list.test.ts` (db), `src/features/business-type/use-mcc-list.test.tsx` (dom)

**How the names enter the build.** `src/data/mcc.json` is committed, and its names are edited by hand there. `pnpm data:mcc` never invents a Hebrew name. It checks the pinned upstream file's SHA-256, then checks `mcc.json` against the upstream code set:

- a code upstream adds arrives with upstream's English and an empty Hebrew name, which the data test refuses until someone writes one;
- a code upstream drops is dropped.

It writes `mcc.json` back one entry per line, sorted by code, and writes the two code lists and `mcc-SOURCES.md`. The first time, `mcc.json` is a copy of the reviewed `mcc-merged.json`, which already holds all 981 codes with clean English and Hebrew. The upstream file and `mcc-merged.json` live in the main checkout's git-ignored `.superpowers/mcc-data/`, so a worktree reads them from `/c/dev/greenback/.superpowers/mcc-data/`.

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `src/domain/mcc-codes.ts` (generated, no imports): `MCC_CODES: readonly string[]`, `isMcc(code: unknown): code is string`.
  - `src/domain/mcc.ts`:
    - `type MccEntry = { readonly code: string; readonly en: string; readonly he: string }`
    - `type MccList = readonly MccEntry[]`
    - `MCC_SHAPE: RegExp` (`/^\d{4}$/`, the shape a synced row is held to)
    - `isMcc`, re-exported
    - `mccName(list: MccList, code: string, language: string): string | undefined`
    - `searchMcc(list: MccList, query: string, language: string): MccEntry[]`
    - `foldSearch(text: string): string`
    - `replaceableMcc(source: string | undefined): boolean`
  - `src/services/mcc/mcc-list.ts`: `loadMccList(): Promise<MccList>`.
  - `src/features/business-type/use-mcc-list.ts`: `useMccList(): MccList | undefined`.

- [ ] **Step 1: Put the reviewed names in place**

```bash
cp /c/dev/greenback/.superpowers/mcc-data/mcc-merged.json src/data/mcc.json
```

Expected: `src/data/mcc.json` exists, an array of 981 `{ "code", "en", "he" }` objects.

- [ ] **Step 2: Write the failing data test**

Create `src/data/mcc.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import list from '@/data/mcc.json';
import { MCC_CODES } from '@/domain/mcc-codes';

const ROOT = resolve(__dirname, '../..');
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf8');
const SOURCES = read('src/data/mcc-SOURCES.md');
const SCRIPT = read('scripts/build-mcc.mjs');

/** A "- Name: `value`" line of mcc-SOURCES.md. */
const recorded = (name: string): string | undefined =>
  new RegExp(`^- ${name}: \`([^\`]+)\`$`, 'm').exec(SOURCES)?.[1];

describe('the business types the app ships', () => {
  it('lists each code once, as four digits, with an English and a Hebrew name', () => {
    const codes = list.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const entry of list) {
      expect(entry.code, JSON.stringify(entry)).toMatch(/^\d{4}$/);
      expect(entry.en.trim(), entry.code).not.toBe('');
      expect(entry.he.trim(), entry.code).not.toBe('');
      expect(Object.keys(entry).sort(), entry.code).toEqual(['code', 'en', 'he']);
    }
    // In code order, so a diff after an upstream update reads line by line.
    expect([...codes].sort()).toEqual(codes);
  });

  it('is exactly the code set of the upstream commit recorded in mcc-SOURCES.md', () => {
    // The script pins the commit and the file's hash; SOURCES records what was built from them.
    expect(recorded('Commit')).toBe(/const COMMIT = '([0-9a-f]{40})'/.exec(SCRIPT)?.[1]);
    expect(recorded('File SHA-256')).toBe(/const SHA256 = '([0-9a-f]{64})'/.exec(SCRIPT)?.[1]);
    const codes = list.map((entry) => entry.code);
    expect(String(codes.length)).toBe(recorded('Codes'));
    expect(createHash('sha256').update(codes.join('\n')).digest('hex')).toBe(recorded('Codes SHA-256'));
  });

  it('gives the app and the Edge Functions the same codes', () => {
    expect(MCC_CODES).toEqual(list.map((entry) => entry.code));
    expect(read('supabase/functions/_shared/mcc-codes.ts'), 'run: pnpm data:mcc').toBe(
      read('src/domain/mcc-codes.ts'),
    );
  });

  it('is loaded only through import(), so the main chunk does not carry it', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : [path];
      });
    const statically = files(resolve(ROOT, 'src'))
      .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
      .filter((path) => /from\s+'[^']*mcc\.json'/.test(readFileSync(path, 'utf8')));
    expect(statically).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm test --project unit src/data/mcc.test.ts`
Expected: FAIL, because `@/domain/mcc-codes` and `src/data/mcc-SOURCES.md` do not exist yet.

- [ ] **Step 4: Write the build script**

Create `scripts/build-mcc.mjs`:

```js
/**
 * pnpm data:mcc [path/to/mcc_codes.json] - check src/data/mcc.json against
 * greggles/mcc-codes at the pinned commit, and write what is built from it:
 *
 *  - src/data/mcc.json, one business type per line, sorted by code. Its
 *    English and Hebrew names are ours and are edited by hand. A code
 *    upstream adds arrives with upstream's English and an empty Hebrew name,
 *    which the data test refuses until someone writes one. A code upstream
 *    drops is dropped.
 *  - src/domain/mcc-codes.ts, the codes alone, and its verbatim copy for the
 *    Edge Functions, supabase/functions/_shared/mcc-codes.ts.
 *  - src/data/mcc-SOURCES.md: the commit, the file's SHA-256 and the code
 *    set's, so a test can hold mcc.json to them without the network.
 *
 * The upstream file is fetched from the pinned commit, or read from `path`
 * when one is given. Either way its SHA-256 must match: a different file is
 * refused, never merged. To move to a newer upstream commit, change COMMIT
 * and SHA256 below and run this again.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const COMMIT = 'df792275c567946119a8903d36dbd33e44a248bf';
const SHA256 = '60fff0a4457e18dd03731a8971f219f2d1e4b22a13c1d930aaac07badbfe8e68';
const SOURCE = `https://raw.githubusercontent.com/greggles/mcc-codes/${COMMIT}/mcc_codes.json`;

const at = (path) => new URL(`../${path}`, import.meta.url);
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

async function upstreamBytes(path) {
  if (path !== undefined) return readFile(path);
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`${SOURCE}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const bytes = await upstreamBytes(process.argv[2]);
if (sha256(bytes) !== SHA256) {
  throw new Error(`The upstream file's SHA-256 is ${sha256(bytes)}, not the pinned ${SHA256}.`);
}

/** code -> upstream's English, for a code mcc.json does not have yet. */
const upstream = new Map(
  JSON.parse(bytes.toString('utf8')).map((row) => [
    String(row.mcc).padStart(4, '0'),
    String(row.edited_description).trim(),
  ]),
);
const codes = [...upstream.keys()].sort();

const ours = new Map(JSON.parse(await readFile(at('src/data/mcc.json'), 'utf8')).map((e) => [e.code, e]));
const added = codes.filter((code) => !ours.has(code));
const dropped = [...ours.keys()].filter((code) => !upstream.has(code));
const entries = codes.map((code) => {
  const entry = ours.get(code);
  return entry === undefined
    ? { code, en: upstream.get(code), he: '' }
    : { code, en: entry.en, he: entry.he };
});
await writeFile(
  at('src/data/mcc.json'),
  `[\n${entries.map((e) => `  ${JSON.stringify(e)}`).join(',\n')}\n]\n`,
);

const rows = [];
for (let i = 0; i < codes.length; i += 12) {
  rows.push(
    `  ${codes
      .slice(i, i + 12)
      .map((code) => `'${code}'`)
      .join(', ')},`,
  );
}
const module = `/**
 * Every business type (Merchant Category Code) the app knows, and nothing
 * else. GENERATED by \`pnpm data:mcc\` (scripts/build-mcc.mjs): do not edit.
 *
 * Kept apart from the names (src/data/mcc.json) so that checking a code is
 * synchronous and small, while the names load only when they are shown. The
 * Edge Functions deploy a byte-for-byte copy,
 * supabase/functions/_shared/mcc-codes.ts: no imports, no runtime APIs.
 */
export const MCC_CODES: readonly string[] = [
${rows.join('\n')}
];

const KNOWN: ReadonlySet<string> = new Set(MCC_CODES);

/** Whether \`code\` is a business type in the list: a string of four digits the list has. */
export function isMcc(code: unknown): code is string {
  return typeof code === 'string' && KNOWN.has(code);
}
`;
await writeFile(at('src/domain/mcc-codes.ts'), module);
await writeFile(at('supabase/functions/_shared/mcc-codes.ts'), module);

await writeFile(
  at('src/data/mcc-SOURCES.md'),
  `# Business types (MCC): where the list comes from

Generated by \`pnpm data:mcc\` (scripts/build-mcc.mjs). Do not edit by hand.

- Upstream: https://github.com/greggles/mcc-codes
- Commit: \`${COMMIT}\`
- File: \`mcc_codes.json\`
- File SHA-256: \`${SHA256}\`
- Codes: \`${String(codes.length)}\`
- Codes SHA-256: \`${sha256(codes.join('\n'))}\`
- Licence: the Unlicense (public domain)

\`mcc.json\` holds every code at that commit. Its \`en\` is upstream's \`edited_description\`, shortened where it
was shouty or legal-sounding. Its \`he\` is ours. ISO 18245 is paid, and the Visa and Mastercard lists are all
rights reserved, so this is the only list the app may ship. Research notes:
\`docs/research/2026-10-09-mcc-sources.md\`.
`,
);

console.log(
  `mcc.json: ${codes.length} codes. Added: ${added.join(', ') || 'none'}. Dropped: ${dropped.join(', ') || 'none'}.`,
);
if (added.length > 0) console.log('Write a Hebrew name for each added code: the data test fails until then.');
```

In `package.json`, add the script after `"data:banks"`:

```json
    "data:mcc": "node scripts/build-mcc.mjs",
```

In `.prettierignore`, after the bank-branches lines, add:

```
# Generated by `pnpm data:mcc` from greggles/mcc-codes and our names; one entry per line.
src/data/mcc.json
src/data/mcc-SOURCES.md
src/domain/mcc-codes.ts
supabase/functions/_shared/mcc-codes.ts
```

- [ ] **Step 5: Run the script on the pinned upstream file**

Run: `pnpm data:mcc C:/dev/greenback/.superpowers/mcc-data/mcc_codes.json`
Expected: `mcc.json: 981 codes. Added: none. Dropped: none.` Four files are written: `src/data/mcc.json` (now one entry per line), `src/data/mcc-SOURCES.md`, `src/domain/mcc-codes.ts` and `supabase/functions/_shared/mcc-codes.ts`.

Check that only the layout of `mcc.json` changed:

```bash
node -e "const a=require('C:/dev/greenback/.superpowers/mcc-data/mcc-merged.json'),b=require('./src/data/mcc.json');console.log(JSON.stringify(a)===JSON.stringify(b))"
```

Expected: `true`.

- [ ] **Step 6: Run the data test to see it pass**

Run: `pnpm test --project unit src/data/mcc.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Write the failing test for names and search**

Create `src/domain/mcc.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import shipped from '@/data/mcc.json';

import { foldSearch, isMcc, MCC_SHAPE, mccName, replaceableMcc, searchMcc, type MccList } from './mcc';

const LIST: MccList = [
  { code: '0742', en: 'Veterinary services', he: 'שירותי וטרינריה' },
  { code: '5411', en: 'Grocery stores and supermarkets', he: 'מרכולים וסופרמרקטים' },
  { code: '5812', en: 'Restaurant', he: 'מסעדות' },
  { code: '5814', en: 'Fast food', he: 'מזון מהיר' },
];

describe('a code', () => {
  it('is a business type only as a four-digit string the list has', () => {
    expect(isMcc('5812')).toBe(true);
    expect(isMcc('0742')).toBe(true);
    for (const bad of ['742', '9999', '58120', ' 5812', 5812, undefined, null]) {
      expect(isMcc(bad), String(bad)).toBe(false);
    }
  });

  it('has the shape a synced row is held to, which a later list may fill', () => {
    expect(MCC_SHAPE.test('9999')).toBe(true);
    expect(MCC_SHAPE.test('742')).toBe(false);
    expect(MCC_SHAPE.test('5812 ')).toBe(false);
  });
});

describe('mccName', () => {
  it('names a code in the language shown, and nothing for a code the list lacks', () => {
    expect(mccName(LIST, '5812', 'en')).toBe('Restaurant');
    expect(mccName(LIST, '5812', 'he')).toBe('מסעדות');
    expect(mccName(LIST, '5812', 'he-IL')).toBe('מסעדות');
    expect(mccName(LIST, '9999', 'en')).toBeUndefined();
  });

  it('names every code the app ships', () => {
    const list = shipped as MccList;
    expect(mccName(list, '0742', 'en')).toBe('Veterinary services');
    expect(list.every((entry) => mccName(list, entry.code, 'he') === entry.he)).toBe(true);
  });
});

describe('searchMcc', () => {
  const codes = (query: string, language = 'en') => searchMcc(LIST, query, language).map((e) => e.code);

  it('matches the code, the English and the Hebrew, whichever language is shown', () => {
    expect(codes('5812')).toEqual(['5812']);
    expect(codes('restaurant', 'he')).toEqual(['5812']);
    expect(codes('מסעדות')).toEqual(['5812']);
    expect(codes('nothing like it')).toEqual([]);
  });

  it('ignores case, niqqud and final letters', () => {
    expect(codes('RESTAURANT')).toEqual(['5812']);
    expect(codes('מִסְעָדוֹת', 'he')).toEqual(['5812']);
    // Typed with a plain mem where the name ends in a final one.
    expect(codes('מרכולימ', 'he')).toEqual(['5411']);
  });

  it('lists everything by name when nothing is typed, and codes before names', () => {
    expect(codes('')).toEqual(['5814', '5411', '5812', '0742']);
    expect(codes('  ', 'he')).toEqual(['5814', '5812', '5411', '0742']);
    expect(codes('581')).toEqual(['5814', '5812']);
  });
});

describe('foldSearch', () => {
  it('lower-cases, strips niqqud and accents, unfolds final letters and squeezes spaces', () => {
    expect(foldSearch('  שָׁלוֹם   World ')).toBe('שלומ world');
    expect(foldSearch('Café')).toBe('cafe');
    expect(foldSearch('ךםןףץ')).toBe('כמנפצ');
  });
});

describe('replaceableMcc', () => {
  it('lets the automatic sources be improved, and never the person or a source this build does not know', () => {
    for (const source of ['file', 'sector', 'history', 'ai'])
      expect(replaceableMcc(source), source).toBe(true);
    for (const source of ['user', 'a-later-source', '', undefined]) {
      expect(replaceableMcc(source), String(source)).toBe(false);
    }
  });
});
```

- [ ] **Step 8: Run it to see it fail**

Run: `pnpm test --project unit src/domain/mcc.test.ts`
Expected: FAIL with "Failed to resolve import './mcc'".

- [ ] **Step 9: Write `src/domain/mcc.ts`**

```ts
export { isMcc } from './mcc-codes';

/**
 * Business types - Merchant Category Codes - by name, and found by search.
 *
 * Pure: the list is handed in. Its names are their own chunk
 * (src/data/mcc.json, loaded by src/services/mcc/mcc-list.ts), while the
 * codes alone are synchronous (`isMcc`, ./mcc-codes.ts), because schemas and
 * cleaners check a code without waiting for names. A code is always a
 * four-digit string: "0742" keeps its zero.
 */

/** One business type: its code, and its name in each language. */
export type MccEntry = { readonly code: string; readonly en: string; readonly he: string };

export type MccList = readonly MccEntry[];

/**
 * The shape a synced or imported row's code is held to. Whether the list has
 * it is `isMcc`: a later build's list may have codes this one does not, and
 * a row carrying one must not be refused for it.
 */
export const MCC_SHAPE = /^\d{4}$/;

const english = (language: string): boolean => !language.startsWith('he');
const nameOf = (entry: MccEntry, language: string): string => (english(language) ? entry.en : entry.he);

/** Each list's codes, indexed once: the feed looks a name up per row, per keystroke. */
const indexes = new WeakMap<MccList, ReadonlyMap<string, MccEntry>>();

function indexOf(list: MccList): ReadonlyMap<string, MccEntry> {
  let index = indexes.get(list);
  if (index === undefined) {
    index = new Map(list.map((entry) => [entry.code, entry]));
    indexes.set(list, index);
  }
  return index;
}

/** A code's name in the UI language, or undefined when the list does not have it. */
export function mccName(list: MccList, code: string, language: string): string | undefined {
  const entry = indexOf(list).get(code);
  return entry === undefined ? undefined : nameOf(entry, language);
}

/** Hebrew final letters, as their ordinary forms: "מרכולים" is found by "מרכולימ". */
const FINALS: Readonly<Record<string, string>> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

/**
 * Text as search compares it: lower case, without niqqud or accents, with
 * final letters in their ordinary form, and single spaces. The niqqud ranges
 * leave out the maqaf (U+05BE) and the sof pasuq (U+05C3), which separate
 * words.
 */
export function foldSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-֑ͯ-ׇֽֿׁׂׅׄ]/g, '')
    .replace(/[ךםןףץ]/g, (letter) => FINALS[letter] ?? letter)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Business types matching what was typed: its code, or its English or Hebrew
 * name, whichever language is shown. A code typed exactly comes first, then
 * codes that start with it, then names that start with it, then names that
 * hold it - each group by name. Nothing typed lists everything by name.
 */
export function searchMcc(list: MccList, query: string, language: string): MccEntry[] {
  const needle = foldSearch(query);
  const byName = (a: MccEntry, b: MccEntry): number =>
    nameOf(a, language).localeCompare(nameOf(b, language), language);
  if (needle === '') return [...list].sort(byName);
  const ranked: { readonly entry: MccEntry; readonly rank: number }[] = [];
  for (const entry of list) {
    const names = [foldSearch(entry.en), foldSearch(entry.he)];
    const rank =
      entry.code === needle
        ? 0
        : entry.code.startsWith(needle)
          ? 1
          : names.some((name) => name.startsWith(needle))
            ? 2
            : names.some((name) => name.includes(needle))
              ? 3
              : undefined;
    if (rank !== undefined) ranked.push({ entry, rank });
  }
  return ranked.sort((a, b) => a.rank - b.rank || byName(a.entry, b.entry)).map((r) => r.entry);
}

/** The sources a business type may be replaced from automatically. */
const REPLACEABLE: ReadonlySet<string> = new Set(['file', 'sector', 'history', 'ai']);

/**
 * Whether a business type from `source` may be replaced automatically. Never
 * the person's own ('user'), never one with no source, and never one from a
 * source a later build added and this one does not know.
 */
export function replaceableMcc(source: string | undefined): boolean {
  return source !== undefined && REPLACEABLE.has(source);
}
```

- [ ] **Step 10: Run it to see it pass**

Run: `pnpm test --project unit src/domain/mcc.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 11: Write the failing tests for the lazy list**

Create `src/services/mcc/mcc-list.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { loadMccList } from './mcc-list';

describe('loadMccList', () => {
  it('loads every business type once, and hands the same list to everyone after', async () => {
    const first = loadMccList();
    expect(loadMccList()).toBe(first);
    const list = await first;
    expect(list).toHaveLength(981);
    expect(list.find((entry) => entry.code === '5812')).toEqual({
      code: '5812',
      en: 'Restaurant',
      he: 'מסעדות',
    });
  });
});
```

Create `src/features/business-type/use-mcc-list.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useMccList } from './use-mcc-list';

describe('useMccList', () => {
  it('has nothing until the names have loaded, then the whole list', async () => {
    const { result } = renderHook(() => useMccList());
    expect(result.current).toBeUndefined();
    await waitFor(() => {
      expect(result.current).toHaveLength(981);
    });
  });
});
```

- [ ] **Step 12: Run them to see them fail**

Run: `pnpm test --project db src/services/mcc/mcc-list.test.ts` and `pnpm test --project dom src/features/business-type/use-mcc-list.test.tsx`
Expected: both FAIL, because the modules do not exist.

- [ ] **Step 13: Write the loader and the hook**

Create `src/services/mcc/mcc-list.ts`:

```ts
import type { MccList } from '@/domain/mcc';

/**
 * The business types' names: their own chunk (about 96 KB), loaded the first
 * time one is shown, as the bank branches are (services/banks/branches.ts).
 * Nobody needs them to open the feed. A failed load is not remembered, so
 * the next caller tries again.
 */
let list: Promise<MccList> | undefined;

export function loadMccList(): Promise<MccList> {
  list ??= import('@/data/mcc.json').then(
    (module) => module.default,
    (error: unknown) => {
      list = undefined;
      throw error;
    },
  );
  return list;
}
```

Create `src/features/business-type/use-mcc-list.ts`:

```ts
import { useEffect, useState } from 'react';

import type { MccList } from '@/domain/mcc';
import { loadMccList } from '@/services/mcc/mcc-list';

/**
 * The business types' names, for a screen that shows them: undefined until
 * their chunk has loaded, and while it cannot be (offline on a first visit).
 * A screen shows the code itself until then.
 */
export function useMccList(): MccList | undefined {
  const [list, setList] = useState<MccList | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void loadMccList().then(
      (loaded) => {
        if (live) setList(loaded);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return list;
}
```

- [ ] **Step 14: Run them to see them pass**

Run: `pnpm test --project db src/services/mcc/mcc-list.test.ts` and `pnpm test --project dom src/features/business-type/use-mcc-list.test.tsx`
Expected: both PASS.

- [ ] **Step 15: Run the task gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm gate:pci`
Expected: all pass. `gate:pci` scans the new JSON and the Edge Function copy and finds nothing.

- [ ] **Step 16: Commit**

```bash
git add scripts/build-mcc.mjs package.json .prettierignore src/data/mcc.json src/data/mcc-SOURCES.md src/data/mcc.test.ts src/domain/mcc-codes.ts supabase/functions/_shared/mcc-codes.ts src/domain/mcc.ts src/domain/mcc.test.ts src/services/mcc src/features/business-type
git commit -m "The app now ships every business type (MCC) with an English and a Hebrew name, checked against the public list it came from" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The three new fields, on rows, in files and through sync

Spec §1.3, §5 (the compatibility table and "Tests that pin this table"). Spec points 2 and 3. Global Constraints "Two levels of checking".

**Files:**

- Modify: `src/types/domain.ts` (`Category`, `Transaction`; a new `MccSource` type)
- Modify: `src/domain/transfer-schema.ts` (`categorySchema`, `transactionSchema`)
- Modify: `src/domain/transfer-validate.ts` (`crossEntityIssues`, `validateEnvelope`)
- Test: `src/domain/transfer-validate.test.ts` (unit), `src/db/sync/apply.test.ts` (db), `src/db/transfer.test.ts` (db), `src/db/repos/categories.test.ts` (db)

**What the category update paths do today (checked, spec §5).** `renameCategory` spreads the stored row (`{ ...current, name, updatedAt }`). `setCategoryArchived` uses Dexie `update`, which patches. `deleteCategory` deletes. `ensureBuiltinCategories` only adds missing rows and patches `sortOrder`. Sync stores a pulled row as received (`apply.ts`). None rebuilds a row, so no path needs fixing. The tests below pin that.

**Interfaces:**

- Consumes: `isMcc`, `MCC_SHAPE` from `src/domain/mcc.ts` (Task 1).
- Produces:
  - `type MccSource = 'file' | 'sector' | 'history' | 'ai' | 'user'` in `src/types/domain.ts`.
  - `Transaction.mcc?: string`, `Transaction.mccSource?: string`, `Category.mccs?: readonly string[]`.
  - `validateEnvelope` drops a code the list does not have (the row stays), and refuses `mcc`, `mccSource` or `mccs` on income.

- [ ] **Step 1: Write the failing file-validation tests**

Append to `src/domain/transfer-validate.test.ts`:

```ts
describe('business types in a file', () => {
  const doc = envelope() as ExportEnvelope;
  /** The fixture with its one transaction and its one category changed. */
  const withRows = (row: Record<string, unknown>, category: Record<string, unknown> = {}): unknown => ({
    ...doc,
    data: {
      ...doc.data,
      categories: [{ ...doc.data.categories[0]!, ...category }],
      transactions: [{ ...doc.data.transactions[0]!, ...row }],
    },
  });
  const paths = (result: ReturnType<typeof validateEnvelope>): string[] =>
    !result.ok && result.reason === 'invalid' ? result.issues.map((i) => i.path) : [];

  it('keeps an expense’s business type, where it came from, and a category’s moved-in types', () => {
    const result = validateEnvelope(withRows({ mcc: '5411', mccSource: 'user' }, { mccs: ['5411', '5499'] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.data.transactions[0]).toMatchObject({ mcc: '5411', mccSource: 'user' });
      expect(result.doc.data.categories[0]?.mccs).toEqual(['5411', '5499']);
    }
  });

  it('keeps a source a later build added', () => {
    const result = validateEnvelope(withRows({ mcc: '5411', mccSource: 'bank-feed' }));
    expect(result.ok && result.doc.data.transactions[0]?.mccSource).toBe('bank-feed');
  });

  it('drops a code the list does not have, and keeps the row it was on', () => {
    const result = validateEnvelope(withRows({ mcc: '9999', mccSource: 'ai' }, { mccs: ['5411', '9999'] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.data.transactions[0]).not.toHaveProperty('mcc');
      expect(result.doc.data.transactions[0]).not.toHaveProperty('mccSource');
      expect(result.doc.data.categories[0]?.mccs).toEqual(['5411']);
    }
  });

  it('refuses a business type on income, or on an income category', () => {
    const income = validateEnvelope(withRows({ kind: 'income', paymentMethodId: undefined, mcc: '5411' }));
    expect(paths(income)).toContain('transactions.tx1.mcc');
    const source = validateEnvelope(
      withRows({ kind: 'income', paymentMethodId: undefined, mccSource: 'ai' }),
    );
    expect(paths(source)).toContain('transactions.tx1.mccSource');
    const category = validateEnvelope(withRows({}, { kind: 'income', mccs: ['5411'] }));
    expect(paths(category)).toContain('categories.cat.groceries.mccs');
  });

  it('refuses what is not a code at all: not four digits, repeated, or too many', () => {
    for (const bad of ['742', '5411.0', 5411, '']) {
      expect(validateEnvelope(withRows({ mcc: bad })).ok, String(bad)).toBe(false);
    }
    expect(validateEnvelope(withRows({ mcc: '5411', mccSource: '' })).ok).toBe(false);
    expect(validateEnvelope(withRows({}, { mccs: ['5411', '5411'] })).ok).toBe(false);
    const many = Array.from({ length: 201 }, (_, i) => String(3000 + i));
    expect(validateEnvelope(withRows({}, { mccs: many })).ok).toBe(false);
  });

  it('reads a file from before business types exactly as before', () => {
    const result = validateEnvelope(envelope());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.data.transactions[0]).not.toHaveProperty('mcc');
      expect(result.doc.data.categories[0]).not.toHaveProperty('mccs');
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test --project unit src/domain/transfer-validate.test.ts -t "business types in a file"`
Expected: FAIL. The first test fails because zod strips the unknown `mcc` and `mccs` keys.

- [ ] **Step 3: Add the fields to the types**

In `src/types/domain.ts`, add `mccs` to the first half of `Category`, after `archivedAt`:

```ts
  readonly archivedAt?: IsoInstant;
  /**
   * Expense categories only: the business types (Merchant Category Codes) the
   * person moved INTO this category. The default table never writes here.
   * Moving a code here takes it out of every other category's list in the
   * same write (src/db/business-types.ts).
   */
  readonly mccs?: readonly string[];
```

Add the source type just above `export type Transaction`:

```ts
/**
 * Where a transaction's business type came from: a column of the file, the
 * card company's sector text, the household's history, Claude, or the person.
 * Stored as a plain string (`Transaction.mccSource`): a later build may add a
 * source, and a source this build does not know is treated like 'user' -
 * never replaced (`replaceableMcc`).
 */
export type MccSource = 'file' | 'sector' | 'history' | 'ai' | 'user';
```

Add to `Transaction`, after `deferral`:

```ts
  /**
   * Expenses only: the business type, a Merchant Category Code as a
   * four-digit string ("5812", "0742"). A series carries one; an override
   * never changes it. Absent on income, and on rows from before it existed.
   */
  readonly mcc?: string;
  /** Where `mcc` came from: an `MccSource`, or a source a later build added. */
  readonly mccSource?: string;
```

- [ ] **Step 4: Add the shapes to the row schemas**

In `src/domain/transfer-schema.ts`, import the shape:

```ts
import { isExpiresMonth } from './cards';
import { MCC_SHAPE } from './mcc';
```

Add above `const categorySchema`:

```ts
/**
 * A business type's SHAPE only. A synced row from a build with a newer list
 * may carry a code this one has never heard of; refusing the row for it would
 * drop the whole row on this device. Whether the list has the code is checked
 * where a code comes in (`isMcc`), and by `validateEnvelope` for a file.
 */
const mccCode = z.string().regex(MCC_SHAPE, 'Expected a four-digit business type');
```

In `categorySchema`'s first object, after `archivedAt`:

```ts
    archivedAt: isoInstant.optional(),
    // The business types moved into this category; absent on rows from before them.
    mccs: z
      .array(mccCode)
      .max(200)
      .refine((codes) => new Set(codes).size === codes.length, 'A business type is listed twice')
      .readonly()
      .optional(),
```

In `transactionSchema`, after `deferral`:

```ts
  // Expenses only (transfer-validate refuses them on income). The source is any short
  // string, like a cash move's kind: a source a later build adds must not refuse the row.
  mcc: mccCode.optional(),
  mccSource: z.string().min(1).max(20).optional(),
```

- [ ] **Step 5: Check them across the file, and drop unknown codes**

In `src/domain/transfer-validate.ts`, add the import:

```ts
import { isMcc } from './mcc';
import { CURRENT_DOC_VERSION, envelopeSchema, type ExportEnvelope } from './transfer-schema';
```

In `crossEntityIssues`, inside the `for (const t of transactions)` loop, after the `destinationId` check:

```ts
if (t.kind === 'income' && t.mcc !== undefined) {
  // A refund from a supermarket is still a refund: income has no business type.
  issues.push({ path: `transactions.${t.id}.mcc`, message: 'Only expenses have a business type' });
}
if (t.kind === 'income' && t.mccSource !== undefined) {
  issues.push({ path: `transactions.${t.id}.mccSource`, message: 'Only expenses have a business type' });
}
```

After that loop, before the overrides loop:

```ts
for (const c of categories) {
  if (c.kind === 'income' && c.mccs !== undefined && c.mccs.length > 0) {
    issues.push({ path: `categories.${c.id}.mccs`, message: 'Only expense categories have business types' });
  }
}
```

Replace the last line of `validateEnvelope`, `return { ok: true, doc: parsed.data };`, with:

```ts
  return { ok: true, doc: knownBusinessTypes(parsed.data) };
}

/**
 * A business type this build's list does not have is dropped, never stored:
 * the row it was on is kept. (A synced row keeps it - see transfer-schema -
 * but a file is a way in, and every way in checks the list.)
 */
function knownBusinessTypes(doc: ExportEnvelope): ExportEnvelope {
  return {
    ...doc,
    data: {
      ...doc.data,
      categories: doc.data.categories.map((c) =>
        c.mccs === undefined || c.mccs.every(isMcc) ? c : { ...c, mccs: c.mccs.filter(isMcc) },
      ),
      transactions: doc.data.transactions.map((t) => {
        if (t.mcc === undefined || isMcc(t.mcc)) return t;
        const { mcc: _code, mccSource: _source, ...rest } = t;
        return rest;
      }),
    },
  };
```

(The closing brace of `knownBusinessTypes` replaces the one that closed `validateEnvelope`.)

- [ ] **Step 6: Run the file tests to see them pass**

Run: `pnpm test --project unit src/domain/transfer-validate.test.ts`
Expected: PASS, the six new tests and every earlier one.

- [ ] **Step 7: Write the failing sync, backup and category tests**

In `src/db/sync/apply.test.ts`, add two imports beside the existing `@/db/repos/payment-methods` one, keeping the alphabetical order the lint rule wants:

```ts
import { setCategoryArchived } from '@/db/repos/categories';
import { updatePaymentMethod } from '@/db/repos/payment-methods';
import { buildSeedCategories } from '@/db/seed';
```

and append:

```ts
describe('business types, met by the sync apply path', () => {
  const rev = makeRev({ ms: 1_000, counter: 0, deviceId: 'abcdefgh' });
  const shop = materialize({
    id: 'b1',
    profileId: 'p1',
    kind: 'expense',
    categoryId: 'cat.groceries',
    money: MONEY,
    recurrence: { type: 'one_time' },
    date: d('2026-10-01'),
    mcc: '5411',
    mccSource: 'user',
    seriesRootId: 'b1',
    createdAt: NOW,
    updatedAt: NOW,
  });
  const groceries = { ...buildSeedCategories(NOW).find((c) => c.id === 'cat.groceries')!, mccs: ['5499'] };
  const pulled = (tbl: 'transactions' | 'categories', row: { id: string }) => ({
    tbl,
    id: row.id,
    rev,
    deleted: false,
    row,
  });

  async function editNote(id: string): Promise<void> {
    const transaction = (await handle.db.transactions.get(id))!;
    const planned = planSeriesEdit({
      transaction,
      overrides: [],
      scope: 'all',
      at: transaction.date,
      patch: { note: 'edited' },
      today: d('2026-10-08'),
      now: NOW,
      newId: counterIdFactory('e'),
    });
    if (!planned.ok) throw new Error(planned.error.kind);
    await applySeriesEdit(handle.db, planned.plan);
  }

  it('stores an expense’s business type and a category’s moved-in types, and edits here keep them', async () => {
    const report = await applyPage(
      handle.db,
      [pulled('transactions', shop), pulled('categories', groceries)],
      1,
    );
    expect(report).toEqual({ applied: 2, skipped: 0, rejected: 0 });

    await editNote('b1');
    await setCategoryArchived(handle.db, 'cat.groceries', true, NOW);
    expect(await handle.db.transactions.get('b1')).toMatchObject({
      mcc: '5411',
      mccSource: 'user',
      note: 'edited',
    });
    expect(await handle.db.categories.get('cat.groceries')).toMatchObject({ mccs: ['5499'], isArchived: 1 });
  });

  it('keeps a code a later list added and a source a later build added: shape only, here', async () => {
    const later = { ...shop, mcc: '9999', mccSource: 'bank-feed' };
    expect((await applyPage(handle.db, [pulled('transactions', later)], 1)).rejected).toBe(0);
    expect(await handle.db.transactions.get('b1')).toMatchObject({ mcc: '9999', mccSource: 'bank-feed' });
  });

  it('refuses a row whose business type is not a code at all', async () => {
    const report = await applyPage(handle.db, [pulled('transactions', { ...shop, mcc: '742' })], 1);
    expect(report.rejected).toBe(1);
  });

  it('applies rows from before business types, which gain none', async () => {
    const { mcc: _code, mccSource: _source, ...older } = shop;
    const { mccs: _types, ...olderCategory } = groceries;
    const report = await applyPage(
      handle.db,
      [pulled('transactions', older), pulled('categories', olderCategory)],
      1,
    );
    expect(report.rejected).toBe(0);
    await editNote('b1');
    expect(await handle.db.transactions.get('b1')).not.toHaveProperty('mcc');
    expect(await handle.db.categories.get('cat.groceries')).not.toHaveProperty('mccs');
  });
});
```

In `src/db/transfer.test.ts`, append:

```ts
describe('business types in a backup', () => {
  it('are exported and restored with their rows', async () => {
    await seed();
    await handle.db.transactions.update('tx1', { mcc: '5411', mccSource: 'history' });
    await handle.db.categories.update('cat.groceries', { mccs: ['5499'] });
    const doc = await buildExport(handle.db, NOW);

    await handle.db.transactions.clear();
    await handle.db.categories.clear();
    const result = await importDocument(handle.db, JSON.parse(JSON.stringify(doc)), {
      mode: 'replace',
      now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(await handle.db.transactions.get('tx1')).toMatchObject({ mcc: '5411', mccSource: 'history' });
    expect((await handle.db.categories.get('cat.groceries'))?.mccs).toEqual(['5499']);
  });
});
```

In `src/db/repos/categories.test.ts`, append:

```ts
describe('business types moved into a category', () => {
  it('survive a rename and an archive: every write spreads the stored row', async () => {
    const custom = await createCategory(
      handle.db,
      'cat.custom',
      { name: 'Coffee', kind: 'expense', icon: 'Circle' },
      NOW,
    );
    await handle.db.categories.update(custom.id, { mccs: ['5814'] });

    await renameCategory(handle.db, custom.id, 'Coffee out', NOW);
    await setCategoryArchived(handle.db, custom.id, true, NOW);
    expect(await handle.db.categories.get(custom.id)).toMatchObject({
      name: 'Coffee out',
      isArchived: 1,
      mccs: ['5814'],
    });
  });
});
```

- [ ] **Step 8: Run them**

Run: `pnpm test --project db src/db/sync/apply.test.ts src/db/transfer.test.ts src/db/repos/categories.test.ts`
Expected: PASS. The sync tests already pass at Step 4's schema change (they would have failed before it: a category row's `mccs` and a transaction's `mcc` were stripped from a backup, and the "not a code at all" row was applied). If a test fails here, the schema change is wrong; do not loosen the test.

- [ ] **Step 9: Run the task gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test --project unit src/domain/transfer-schema.test.ts src/domain/transfer-validate.test.ts`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/types/domain.ts src/domain/transfer-schema.ts src/domain/transfer-validate.ts src/domain/transfer-validate.test.ts src/db/sync/apply.test.ts src/db/transfer.test.ts src/db/repos/categories.test.ts
git commit -m "An expense can carry its business type, and a category the business types moved into it, through sync, backups and older builds" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: One key per merchant, and a card company's sector as a business type

Spec §2 (the `merchantKey` rules, step 2 "Sector"), §7 "Domain" (`merchantKey` pairs, the sector table). Spec point 4. Review Focus 1.

**Files:**

- Create: `src/domain/merchant-key.ts`
- Create: `src/domain/sector-mcc.ts`
- Test: `src/domain/merchant-key.test.ts` (unit), `src/domain/sector-mcc.test.ts` (unit)

**The sector table's sources.** No Cal, Max or Isracard export was at hand when this plan was written, so no sector name below is confirmed against a real one (spec §2 step 2: "If none can be confirmed, it starts with common sector words"). The table holds common Hebrew sector words, the two-and-three-word groupings the card sites use for their categories ("מסעדות, קפה וברים"), and their English equivalents. A sector the table does not know is never dropped: it goes to Claude as a hint (Task 8). The table grows when real exports are seen.

**Interfaces:**

- Consumes: `foldSearch` from `src/domain/mcc.ts` (Task 1).
- Produces:
  - `merchantKey(text: string): string` in `src/domain/merchant-key.ts`. `''` means "no key".
  - `SECTORS: readonly (readonly [sector: string, mcc: string])[]` and `sectorMcc(text: string): string | undefined` in `src/domain/sector-mcc.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/merchant-key.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { merchantKey } from './merchant-key';

describe('merchantKey', () => {
  it.each([
    // Branch numbers, card-terminal numbers and punctuation go; the city stays.
    ['שופרסל דיל 123 ת"א', 'שופרסל דיל 45 ת״א', 'שופרסל דיל ת א'],
    ['WOLT *ORDER 8812', 'Wolt order 1290', 'wolt order'],
    ['רמי לוי סניף 12 מודיעין', 'רמי לוי סניף 7 מודיעין', 'רמי לוי מודיעין'],
    ['אלקטרה בע"מ', 'אלקטרה בעמ', 'אלקטרה'],
    ['Acme Ltd.', 'ACME LTD', 'acme'],
    ['Globex Inc', 'GLOBEX, INC.', 'globex'],
  ])('merges "%s" and "%s" as "%s"', (a, b, key) => {
    expect(merchantKey(a)).toBe(key);
    expect(merchantKey(b)).toBe(key);
  });

  it.each([
    // Two different chains.
    ['סופר פארם', 'סופר יודה'],
    // The same chain in two cities: merging two businesses is worse than missing a match.
    ['שופרסל דיל 123 ת"א', 'שופרסל דיל 45'],
    ['PAYPAL *SPOTIFY', 'PAYPAL *NETFLIX'],
  ])('keeps "%s" and "%s" apart', (a, b) => {
    expect(merchantKey(a)).not.toBe(merchantKey(b));
  });

  it.each([
    // Review Focus 1: only a payment service or a transfer word is left, so there is no merchant to key.
    'PAYPAL *4029357733',
    'PAYPAL *4029357744',
    'העברה בביט 0501234567',
    'ביט 0527654321',
    'העברה ל-0541234567',
    'PayBox 3321',
    'פייבוקס',
    '',
    '   ',
    '12345',
    'סניף 12',
  ])('gives "%s" no key at all', (text) => {
    expect(merchantKey(text)).toBe('');
  });
});
```

Create `src/domain/sector-mcc.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { isMcc } from './mcc';
import { SECTORS, sectorMcc } from './sector-mcc';

describe('sectorMcc', () => {
  it.each(SECTORS.map(([sector, code]) => [sector, code]))('maps "%s" to %s', (sector, code) => {
    expect(isMcc(code)).toBe(true);
    expect(sectorMcc(sector)).toBe(code);
  });

  it('lists each sector once', () => {
    const keys = SECTORS.map(([sector]) => sector.trim().toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('reads the sector as printed: case, spacing, commas and niqqud do not matter', () => {
    expect(sectorMcc('מסעדות')).toBe('5812');
    expect(sectorMcc('  מסעדות,  קפה   וברים ')).toBe('5812');
    expect(sectorMcc('סופרמרקטים')).toBe('5411');
    expect(sectorMcc('דלק')).toBe('5541');
    expect(sectorMcc('RESTAURANTS')).toBe('5812');
  });

  it('knows nothing of a sector it does not list, which then goes to Claude as a hint', () => {
    expect(sectorMcc('שונות')).toBeUndefined();
    expect(sectorMcc('')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test --project unit src/domain/merchant-key.test.ts src/domain/sector-mcc.test.ts`
Expected: FAIL, the modules do not exist.

- [ ] **Step 3: Write `src/domain/merchant-key.ts`**

```ts
/**
 * One key for the ways one merchant is printed: "שופרסל דיל 123 ת"א" and
 * "שופרסל דיל 45 ת״א" are the same shop, at another till.
 *
 * Lower case, with digits, punctuation and quotes taken out, the legal
 * suffixes (בע"מ, Ltd, Inc, LLC) dropped, and the word סניף dropped with the
 * token after it (its number or its name). City names are KEPT: merging two
 * businesses is worse than missing a match.
 *
 * A key of nothing but a payment service or a transfer word is no key:
 * "PAYPAL *4029357733" and "ביט 0527654321" are payments to someone, and
 * which someone is the digits this throws away. Keyed as "paypal" or "ביט",
 * every such payment would file the next one.
 */

const LEGAL: ReadonlySet<string> = new Set(['בעמ', 'ltd', 'inc', 'llc']);

/** Words that, alone, say how money moved and not to whom. */
const PAYMENT_ONLY: ReadonlySet<string> = new Set([
  'paypal',
  'pp',
  'bit',
  'ביט',
  'בביט',
  'paybox',
  'פייבוקס',
  'בפייבוקס',
  'העברה',
  'העברת',
  'transfer',
  'to',
  'from',
  'ל',
  'ב',
  'מ',
]);

export function merchantKey(text: string): string {
  const tokens = text
    .toLowerCase()
    // בע"מ in any of its spellings, before the quotes go.
    .replace(/בע["״'׳]?מ/g, 'בעמ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token !== '');
  const kept: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';
    if (token === 'סניף') {
      i += 1; // the branch's number or name
      continue;
    }
    const letters = token.replace(/\p{N}/gu, '');
    if (letters !== '' && !LEGAL.has(letters)) kept.push(letters);
  }
  return kept.every((token) => PAYMENT_ONLY.has(token)) ? '' : kept.join(' ');
}
```

- [ ] **Step 4: Write `src/domain/sector-mcc.ts`**

```ts
import { foldSearch } from './mcc';

/**
 * A card company's business sector (ענף), as its export prints it, to one
 * representative business type: "מסעדות" is 5812. Matched whole, after
 * folding case, niqqud, punctuation and spacing - never by a part of the
 * text, so "מזון לחיות" is not taken for groceries.
 *
 * Common sector words and the groupings the card sites use, none yet
 * confirmed against a real export: the table grows as exports are seen. A
 * sector it does not know is not dropped - it goes to Claude as a hint.
 */
export const SECTORS: readonly (readonly [sector: string, mcc: string])[] = [
  ['מסעדות', '5812'],
  ['מסעדות, קפה וברים', '5812'],
  ['מסעדות ובתי קפה', '5812'],
  ['בתי קפה', '5812'],
  ['מזון מהיר', '5814'],
  ['סופרמרקטים', '5411'],
  ['סופרמרקט', '5411'],
  ['מרכולים', '5411'],
  ['מזון', '5411'],
  ['מזון וצריכה', '5411'],
  ['מזון ומשקאות', '5411'],
  ['דלק', '5541'],
  ['תחנות דלק', '5541'],
  ['דלק, חשמל וגז', '5541'],
  ['תחבורה', '4111'],
  ['תחבורה ציבורית', '4111'],
  ['תחבורה ורכבים', '4111'],
  ['מוניות', '4121'],
  ['חניה', '7523'],
  ['חניונים', '7523'],
  ['רפואה', '8011'],
  ['רופאים', '8011'],
  ['בתי מרקחת', '5912'],
  ['פארם', '5912'],
  ['רפואה ובתי מרקחת', '5912'],
  ['תקשורת', '4814'],
  ['שירותי תקשורת', '4814'],
  ['סלולר', '4814'],
  ['מוצרי חשמל', '5732'],
  ['חשמל ומחשבים', '5732'],
  ['אלקטרוניקה', '5732'],
  ['ביגוד', '5651'],
  ['הלבשה', '5651'],
  ['אופנה', '5651'],
  ['ביגוד והנעלה', '5651'],
  ['הנעלה', '5661'],
  ['ריהוט', '5712'],
  ['עיצוב הבית', '5712'],
  ['ריהוט ובית', '5712'],
  ['תיירות', '4722'],
  ['טיסות ותיירות', '4722'],
  ['סוכנויות נסיעות', '4722'],
  ['תעופה', '4511'],
  ['טיסות', '4511'],
  ['בתי מלון', '7011'],
  ['מלונות', '7011'],
  ['ביטוח', '6300'],
  ['ביטוח ופיננסים', '6300'],
  ['בידור', '7999'],
  ['פנאי ובידור', '7999'],
  ['פנאי, בידור וספורט', '7999'],
  ['קולנוע', '7832'],
  ['ספורט', '7997'],
  ['חדרי כושר', '7997'],
  ['חינוך', '8299'],
  ['בתי ספר', '8299'],
  ['לימודים', '8299'],
  ['ספרים', '5942'],
  ['ספרים ודפוס', '5942'],
  ['קוסמטיקה', '5977'],
  ['קוסמטיקה וטיפוח', '5977'],
  ['צעצועים', '5945'],
  ['ילדים', '5641'],
  ['חיות מחמד', '5995'],
  ['עירייה וממשלה', '9399'],
  ['ממשלה', '9399'],
  ['restaurants', '5812'],
  ['fast food', '5814'],
  ['supermarkets', '5411'],
  ['groceries', '5411'],
  ['fuel', '5541'],
  ['gas stations', '5541'],
  ['transportation', '4111'],
  ['pharmacy', '5912'],
  ['medical', '8011'],
  ['communications', '4814'],
  ['electronics', '5732'],
  ['clothing', '5651'],
  ['fashion', '5651'],
  ['travel', '4722'],
  ['airlines', '4511'],
  ['hotels', '7011'],
  ['insurance', '6300'],
  ['entertainment', '7999'],
  ['education', '8299'],
];

/** As compared: folded like search, with punctuation as spaces. */
const normal = (text: string): string => foldSearch(text.replace(/[^\p{L}\p{N}\s]/gu, ' '));

const BY_SECTOR: ReadonlyMap<string, string> = new Map(SECTORS.map(([sector, mcc]) => [normal(sector), mcc]));

/** The business type a sector stands for, or undefined when the table does not know it. */
export function sectorMcc(text: string): string | undefined {
  const key = normal(text);
  return key === '' ? undefined : BY_SECTOR.get(key);
}
```

- [ ] **Step 5: Run them to see them pass**

Run: `pnpm test --project unit src/domain/merchant-key.test.ts src/domain/sector-mcc.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the task gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/domain/merchant-key.ts src/domain/merchant-key.test.ts src/domain/sector-mcc.ts src/domain/sector-mcc.test.ts
git commit -m "The same shop printed two ways is now recognised as one merchant, and a card company's sector names a business type" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Business type to category

Spec §1.2, §7 "Data" (every code maps to exactly one built-in expense id) and "Domain" (`categoryForMcc`). Spec point 14.

**Files:**

- Create: `src/domain/mcc-categories.ts`
- Test: `src/domain/mcc-categories.test.ts` (unit), `src/data/mcc-defaults.test.ts` (unit; it reads `@/db/seed`, which a `src/domain` test may not import)

**How the table is held.** `DEFAULT_MCC_CATEGORY` is a sorted list of non-overlapping ranges `[from, to, categoryId]`, both ends included, compared as four-digit strings. A code in no range is filed under `DEFAULT_OTHER` (`cat.otherExpense`), the spec's "everything else". So every code falls in exactly one entry: one range, or the fallback. The data test checks that against the shipped list and the built-in expense categories.

**Interfaces:**

- Consumes: `MCC_CODES` from `src/domain/mcc-codes.ts` (Task 1); `Category.mccs` (Task 2).
- Produces, in `src/domain/mcc-categories.ts`:
  - `type MccRange = readonly [from: string, to: string, categoryId: string]`
  - `DEFAULT_MCC_CATEGORY: readonly MccRange[]`, `DEFAULT_OTHER: 'cat.otherExpense'`
  - `defaultCategoryForMcc(code: string): string`
  - `categoryForMcc(code: string, categories: readonly Category[]): string | undefined`
  - `businessTypesOf(category: Category, categories: readonly Category[]): { readonly defaults: readonly string[]; readonly moved: readonly string[] }`

- [ ] **Step 1: Write the failing tests**

Create `src/data/mcc-defaults.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import list from '@/data/mcc.json';
import { BUILTIN_EXPENSE } from '@/db/seed';
import { DEFAULT_MCC_CATEGORY, DEFAULT_OTHER, defaultCategoryForMcc } from '@/domain/mcc-categories';

const BUILTINS: ReadonlySet<string> = new Set(BUILTIN_EXPENSE.map((seed) => seed.id));

describe('the default table', () => {
  it('runs in code order, each range inside itself and none overlapping the next', () => {
    DEFAULT_MCC_CATEGORY.forEach(([from, to], i) => {
      expect(from <= to, `${from}-${to}`).toBe(true);
      const next = DEFAULT_MCC_CATEGORY[i + 1];
      if (next !== undefined) expect(to < next[0], `${to} / ${next[0]}`).toBe(true);
    });
  });

  it('files every shipped code under exactly one built-in expense category', () => {
    expect(BUILTINS.has(DEFAULT_OTHER)).toBe(true);
    for (const [from, to, id] of DEFAULT_MCC_CATEGORY)
      expect(BUILTINS.has(id), `${from}-${to} ${id}`).toBe(true);
    for (const { code } of list) {
      const ranges = DEFAULT_MCC_CATEGORY.filter(([from, to]) => from <= code && code <= to);
      expect(ranges.length, code).toBeLessThanOrEqual(1);
      expect(BUILTINS.has(defaultCategoryForMcc(code)), code).toBe(true);
    }
  });

  it('has no range that holds no shipped code', () => {
    for (const [from, to] of DEFAULT_MCC_CATEGORY) {
      expect(
        list.some(({ code }) => from <= code && code <= to),
        `${from}-${to}`,
      ).toBe(true);
    }
  });
});
```

Create `src/domain/mcc-categories.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Category } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { businessTypesOf, categoryForMcc, defaultCategoryForMcc } from './mcc-categories';

const NOW = '2026-10-01T00:00:00.000Z' as IsoInstant;
const LATER = '2026-10-05T00:00:00.000Z' as IsoInstant;

const builtin = (id: string, over: Partial<Category> = {}): Category =>
  ({
    id,
    kind: 'expense',
    icon: 'Circle',
    sortOrder: 0,
    isArchived: 0,
    source: 'builtin',
    nameKey: `categories:builtin.${id.slice(4)}`,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  }) as Category;
const custom = (id: string, over: Partial<Category> = {}): Category =>
  ({ ...builtin(id), source: 'custom', name: id, ...over }) as Category;

const CATEGORIES = ['cat.dining', 'cat.groceries', 'cat.travel', 'cat.otherExpense'].map((id) => builtin(id));

describe('defaultCategoryForMcc', () => {
  it.each([
    // The spec's examples (§1.2).
    ['3000', 'cat.travel'],
    ['3299', 'cat.travel'],
    ['4511', 'cat.travel'],
    ['3501', 'cat.travel'],
    ['7011', 'cat.travel'],
    ['4722', 'cat.travel'],
    ['5411', 'cat.groceries'],
    ['5422', 'cat.groceries'],
    ['5462', 'cat.groceries'],
    ['5499', 'cat.groceries'],
    ['5811', 'cat.dining'],
    ['5814', 'cat.dining'],
    ['4111', 'cat.transport'],
    ['4121', 'cat.transport'],
    ['4131', 'cat.transport'],
    ['4784', 'cat.transport'],
    ['5541', 'cat.transport'],
    ['5542', 'cat.transport'],
    ['7523', 'cat.transport'],
    ['4812', 'cat.phoneInternet'],
    ['4814', 'cat.phoneInternet'],
    ['4816', 'cat.phoneInternet'],
    ['4899', 'cat.phoneInternet'],
    ['4900', 'cat.utilities'],
    ['5912', 'cat.health'],
    ['8011', 'cat.health'],
    ['8099', 'cat.health'],
    ['5815', 'cat.subscriptions'],
    ['5818', 'cat.subscriptions'],
    ['7841', 'cat.subscriptions'],
    ['7832', 'cat.entertainment'],
    ['7922', 'cat.entertainment'],
    ['7991', 'cat.entertainment'],
    ['7999', 'cat.entertainment'],
    ['8211', 'cat.education'],
    ['8299', 'cat.education'],
    ['0742', 'cat.pets'],
    ['5995', 'cat.pets'],
    ['7997', 'cat.fitness'],
    ['7941', 'cat.fitness'],
    ['6300', 'cat.insurance'],
    ['5960', 'cat.insurance'],
    ['6010', 'cat.currencyExchange'],
    ['6011', 'cat.currencyExchange'],
    ['6051', 'cat.currencyExchange'],
    ['5641', 'cat.kids'],
    ['5945', 'cat.kids'],
    ['5311', 'cat.shopping'],
    ['5999', 'cat.shopping'],
    // The plan's readings (spec point 14).
    ['5511', 'cat.transport'],
    ['5013', 'cat.transport'],
    ['5172', 'cat.transport'],
    ['5734', 'cat.aiSoftware'],
    ['7372', 'cat.aiSoftware'],
    ['5962', 'cat.travel'],
    ['3351', 'cat.travel'],
    ['7512', 'cat.travel'],
    ['5968', 'cat.subscriptions'],
    ['7375', 'cat.subscriptions'],
    ['5975', 'cat.health'],
    ['5976', 'cat.health'],
    ['5047', 'cat.health'],
    ['5122', 'cat.health'],
    ['4119', 'cat.health'],
    ['7277', 'cat.health'],
    ['7297', 'cat.health'],
    ['7298', 'cat.health'],
    ['5983', 'cat.utilities'],
    ['6513', 'cat.rent'],
    ['8351', 'cat.kids'],
    // Everything else.
    ['1520', 'cat.otherExpense'],
    ['4829', 'cat.otherExpense'],
    ['9311', 'cat.otherExpense'],
  ])('files %s under %s', (code, id) => {
    expect(defaultCategoryForMcc(code)).toBe(id);
  });
});

describe('categoryForMcc', () => {
  it('follows the default table when nobody moved the business type', () => {
    expect(categoryForMcc('5812', CATEGORIES)).toBe('cat.dining');
    expect(categoryForMcc('9311', CATEGORIES)).toBe('cat.otherExpense');
  });

  it('puts the person’s move before the default', () => {
    const coffee = custom('c.coffee', { mccs: ['5812'] });
    expect(categoryForMcc('5812', [...CATEGORIES, coffee])).toBe('c.coffee');
  });

  it('skips an archived category: its moves stop applying, and an archived default gives nothing', () => {
    const coffee = custom('c.coffee', { mccs: ['5812'], isArchived: 1 });
    expect(categoryForMcc('5812', [...CATEGORIES, coffee])).toBe('cat.dining');
    const archived = CATEGORIES.map((c) => (c.id === 'cat.dining' ? { ...c, isArchived: 1 as const } : c));
    expect(categoryForMcc('5812', archived)).toBeUndefined();
    expect(categoryForMcc('5812', [])).toBeUndefined();
  });

  it('settles two categories claiming one business type by the one updated last', () => {
    const coffee = custom('c.coffee', { mccs: ['5812'], updatedAt: NOW });
    const lunch = custom('c.lunch', { mccs: ['5812'], updatedAt: LATER });
    expect(categoryForMcc('5812', [...CATEGORIES, coffee, lunch])).toBe('c.lunch');
    expect(categoryForMcc('5812', [...CATEGORIES, lunch, coffee])).toBe('c.lunch');
  });
});

describe('businessTypesOf', () => {
  it('lists the table’s codes, then the ones moved in, and not the ones moved out', () => {
    expect(businessTypesOf(builtin('cat.dining'), CATEGORIES)).toEqual({
      defaults: ['5811', '5812', '5813', '5814'],
      moved: [],
    });
    const coffee = custom('c.coffee', { mccs: ['5812'] });
    const all = [...CATEGORIES, coffee];
    expect(businessTypesOf(builtin('cat.dining'), all).defaults).toEqual(['5811', '5813', '5814']);
    expect(businessTypesOf(coffee, all)).toEqual({ defaults: [], moved: ['5812'] });
  });

  it('gives a code back to its default while the category it was moved to is archived', () => {
    const coffee = custom('c.coffee', { mccs: ['5812'], isArchived: 1 });
    expect(businessTypesOf(builtin('cat.dining'), [...CATEGORIES, coffee]).defaults).toContain('5812');
  });

  it('lists nothing for an income category', () => {
    expect(businessTypesOf(builtin('cat.salary', { kind: 'income' }), CATEGORIES)).toEqual({
      defaults: [],
      moved: [],
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test --project unit src/domain/mcc-categories.test.ts src/data/mcc-defaults.test.ts`
Expected: FAIL, `./mcc-categories` does not exist.

- [ ] **Step 3: Write `src/domain/mcc-categories.ts`**

```ts
import type { Category } from '@/types/domain';

import { MCC_CODES } from './mcc-codes';

/**
 * Business type to category.
 *
 * The default table files each business type under a built-in EXPENSE
 * category; the person's own moves (`Category.mccs`) come before it. Income
 * never goes through here: a refund from a supermarket is still a refund.
 */

/** A run of business types, both ends included, compared as four-digit strings. */
export type MccRange = readonly [from: string, to: string, categoryId: string];

/** Where a business type no range names is filed. */
export const DEFAULT_OTHER = 'cat.otherExpense';

/**
 * Sorted and non-overlapping, so every code falls in one range or in none
 * (then `DEFAULT_OTHER`). Each line follows the code's meaning: the spec's
 * examples, and the plan's readings of the rest (spec point 14). Retail
 * (5200-5999) not named otherwise is shopping.
 */
export const DEFAULT_MCC_CATEGORY: readonly MccRange[] = [
  ['0742', '0742', 'cat.pets'],
  // Airlines, car rental (3351-3441) and lodging (3501-3999) brands.
  ['3000', '3999', 'cat.travel'],
  // Railways.
  ['4011', '4011', 'cat.transport'],
  // Local transport, passenger railways.
  ['4111', '4112', 'cat.transport'],
  // Ambulance.
  ['4119', '4119', 'cat.health'],
  // Taxis, buses.
  ['4121', '4131', 'cat.transport'],
  // Cruises, boat rentals.
  ['4411', '4457', 'cat.travel'],
  ['4511', '4511', 'cat.travel'],
  ['4582', '4582', 'cat.travel'],
  // Travel agencies, package tours.
  ['4722', '4723', 'cat.travel'],
  // Tolls, other transport.
  ['4784', '4789', 'cat.transport'],
  // Telecom, network services.
  ['4812', '4821', 'cat.phoneInternet'],
  // Cable and pay TV.
  ['4899', '4899', 'cat.phoneInternet'],
  ['4900', '4900', 'cat.utilities'],
  // Vehicle supplies.
  ['5013', '5013', 'cat.transport'],
  // Medical equipment.
  ['5047', '5047', 'cat.health'],
  // Drugs.
  ['5122', '5122', 'cat.health'],
  // Petroleum.
  ['5172', '5172', 'cat.transport'],
  // Home supply, hardware, garden, department and discount stores.
  ['5200', '5399', 'cat.shopping'],
  // Food stores.
  ['5411', '5499', 'cat.groceries'],
  // Car, boat and motorcycle dealers, parts, tyres, fuel.
  ['5511', '5599', 'cat.transport'],
  ['5611', '5640', 'cat.shopping'],
  ['5641', '5641', 'cat.kids'],
  ['5642', '5733', 'cat.shopping'],
  // Software stores.
  ['5734', '5734', 'cat.aiSoftware'],
  ['5735', '5735', 'cat.shopping'],
  // Caterers, restaurants, bars, fast food.
  ['5811', '5814', 'cat.dining'],
  // Digital goods.
  ['5815', '5818', 'cat.subscriptions'],
  ['5832', '5832', 'cat.shopping'],
  // Pharmacies.
  ['5912', '5912', 'cat.health'],
  ['5921', '5944', 'cat.shopping'],
  ['5945', '5945', 'cat.kids'],
  ['5946', '5950', 'cat.shopping'],
  // Insurance (direct marketing).
  ['5960', '5960', 'cat.insurance'],
  ['5961', '5961', 'cat.shopping'],
  // Travel (direct marketing).
  ['5962', '5962', 'cat.travel'],
  ['5963', '5967', 'cat.shopping'],
  // Subscription merchants.
  ['5968', '5968', 'cat.subscriptions'],
  ['5969', '5973', 'cat.shopping'],
  // Hearing aids, orthopaedic goods.
  ['5975', '5976', 'cat.health'],
  ['5977', '5978', 'cat.shopping'],
  // Heating fuel, bottled gas.
  ['5983', '5983', 'cat.utilities'],
  ['5992', '5994', 'cat.shopping'],
  ['5995', '5995', 'cat.pets'],
  ['5996', '5999', 'cat.shopping'],
  // Cash withdrawal (see spec point 14: not an expense in import).
  ['6010', '6011', 'cat.currencyExchange'],
  // Currency exchange.
  ['6051', '6051', 'cat.currencyExchange'],
  // Insurance.
  ['6300', '6399', 'cat.insurance'],
  // Property rentals.
  ['6513', '6513', 'cat.rent'],
  // Hotels, timeshares.
  ['7011', '7012', 'cat.travel'],
  // Camps.
  ['7032', '7032', 'cat.kids'],
  ['7033', '7033', 'cat.travel'],
  // Counselling.
  ['7277', '7277', 'cat.health'],
  ['7278', '7278', 'cat.shopping'],
  ['7296', '7296', 'cat.shopping'],
  // Massage, health and beauty.
  ['7297', '7298', 'cat.health'],
  // Programming and data processing (software as a service).
  ['7372', '7372', 'cat.aiSoftware'],
  // Information services.
  ['7375', '7375', 'cat.subscriptions'],
  ['7511', '7511', 'cat.transport'],
  ['7512', '7512', 'cat.travel'],
  ['7513', '7513', 'cat.transport'],
  ['7519', '7519', 'cat.travel'],
  // Parking, car repair, car wash, towing.
  ['7523', '7549', 'cat.transport'],
  // Lotteries, casinos, racing.
  ['7800', '7802', 'cat.entertainment'],
  ['7832', '7832', 'cat.entertainment'],
  // Video rental.
  ['7841', '7841', 'cat.subscriptions'],
  // Dance studios.
  ['7911', '7911', 'cat.fitness'],
  // Theatre, bands, billiards, bowling.
  ['7922', '7933', 'cat.entertainment'],
  // Sports clubs.
  ['7941', '7941', 'cat.fitness'],
  // Attractions, golf, games, betting, amusement parks.
  ['7991', '7996', 'cat.entertainment'],
  // Sports and country clubs.
  ['7997', '7997', 'cat.fitness'],
  ['7998', '7999', 'cat.entertainment'],
  // Doctors, dentists, hospitals, labs.
  ['8011', '8099', 'cat.health'],
  // Schools, colleges.
  ['8211', '8299', 'cat.education'],
  // Child care.
  ['8351', '8351', 'cat.kids'],
];

/** The built-in category the table files a business type under. */
export function defaultCategoryForMcc(code: string): string {
  return DEFAULT_MCC_CATEGORY.find(([from, to]) => from <= code && code <= to)?.[2] ?? DEFAULT_OTHER;
}

const liveExpense = (category: Category): boolean => category.kind === 'expense' && category.isArchived === 0;

/**
 * The category a business type files under, or undefined to let the rest of
 * the chain decide:
 *  1. a live category the person moved it into - the one updated last, if
 *     two claim it (two devices moving it apart, before they met);
 *  2. the default table's built-in, unless that is archived or missing.
 */
export function categoryForMcc(code: string, categories: readonly Category[]): string | undefined {
  const moved = categories
    .filter((category) => liveExpense(category) && category.mccs?.includes(code) === true)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  if (moved[0] !== undefined) return moved[0].id;
  const fallback = defaultCategoryForMcc(code);
  return categories.some((category) => category.id === fallback && liveExpense(category))
    ? fallback
    : undefined;
}

/**
 * What a category's business-types page lists: the table's codes for it,
 * less any the person moved into another live category, then the ones moved
 * into it. An income category has none.
 */
export function businessTypesOf(
  category: Category,
  categories: readonly Category[],
): { readonly defaults: readonly string[]; readonly moved: readonly string[] } {
  if (category.kind !== 'expense') return { defaults: [], moved: [] };
  const moved = category.mccs ?? [];
  const elsewhere = new Set(
    categories.filter((c) => c.id !== category.id && liveExpense(c)).flatMap((c) => c.mccs ?? []),
  );
  const defaults = MCC_CODES.filter(
    (code) => defaultCategoryForMcc(code) === category.id && !elsewhere.has(code) && !moved.includes(code),
  );
  return { defaults, moved };
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test --project unit src/domain/mcc-categories.test.ts src/data/mcc-defaults.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the task gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/mcc-categories.ts src/domain/mcc-categories.test.ts src/data/mcc-defaults.test.ts
git commit -m "Each business type now files under a category by default, unless the person has moved it into another" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: The business type through the form, a save, and an edit at every scope

Spec §1.3 ("A series carries one MCC", "Overrides don't change it", "`mcc` is refused on income"), §4.1 ("Clear"). Global Constraints "A series carries one `mcc`". Review Focus 4.

**Files:**

- Modify: `src/domain/tx-form.ts` (`txFormSchema`, `defaultFormValues`)
- Modify: `src/domain/tx-edit.ts` (`occurrenceToFormValues`, `duplicateFormValues`, `buildPatch`)
- Modify: `src/domain/series-edit.ts` (`TransactionPatch`, `applyToTransaction`, `planSeriesEdit`, `planSplit`)
- Modify: `src/db/save-transaction.ts` (`saveNewTransaction`)
- Test: `src/domain/tx-form.test.ts`, `src/domain/tx-edit.test.ts`, `src/domain/series-edit.test.ts` (unit), `src/db/save-transaction.test.ts` (db)

**Two rules this task settles.**

- The form keeps a code by its SHAPE (`MCC_SHAPE`), not by the list. Every way a code comes into the form already checks the list: the picker offers only listed codes (Task 10), and the auto step uses `isMcc` (Task 9). What the shape check adds is that opening and saving a row whose code a later list added does not erase it.
- An edit compares the business type with the SERIES (`transaction.mcc`), never the occurrence, and writes it to the series' transaction at every scope. At scope "one" the plan writes the transaction as well as the override; an edit that changed only the business type writes no override at all.

**Interfaces:**

- Consumes: `MCC_SHAPE` (Task 1); `Transaction.mcc`, `Transaction.mccSource` (Task 2).
- Produces:
  - `TxFormValues` gains `mcc?: string` and `mccSource?: string` (input; both default to `''`).
  - `TxFormParsed` gains `mcc: string | undefined` and `mccSource: string | undefined` (absent on income).
  - `TransactionPatch` gains `mcc?: string | null` and `mccSource?: string | null` (`null` clears).
  - `saveNewTransaction` writes `mcc` and `mccSource` when the form has them.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/tx-form.test.ts`:

```ts
describe('the business type', () => {
  it('is kept on an expense, with where it came from', () => {
    expect(parse(values({ mcc: '5411', mccSource: 'user' }))).toMatchObject({
      mcc: '5411',
      mccSource: 'user',
    });
  });

  it('is stripped from income: what switching an expense to income leaves behind (Review Focus 4)', () => {
    const parsed = parse(values({ kind: 'income', categoryId: 'cat.salary', mcc: '5411', mccSource: 'ai' }));
    expect(parsed.mcc).toBeUndefined();
    expect(parsed.mccSource).toBeUndefined();
  });

  it('is none when empty or not a code, and parses when a caller never set it', () => {
    expect(parse(values({ mcc: '', mccSource: 'ai' }))).toMatchObject({
      mcc: undefined,
      mccSource: undefined,
    });
    expect(parse(values({ mcc: '58', mccSource: 'ai' })).mcc).toBeUndefined();
    const { mcc: _code, mccSource: _source, ...older } = values();
    expect(parse(older).mcc).toBeUndefined();
  });

  it('keeps a code a later list added, so opening and saving a row does not erase it', () => {
    expect(parse(values({ mcc: '9999', mccSource: 'history' })).mcc).toBe('9999');
  });
});
```

Append to `src/domain/tx-edit.test.ts`:

```ts
describe('the business type, in the edit form', () => {
  const tx = rent({ mcc: '6513', mccSource: 'ai' });
  const occurrence = occurrenceOf(tx, [], '2026-09-10');
  const base = occurrenceToFormValues(occurrence, tx);
  const patchFor = (over: Partial<TxFormValues>) =>
    buildPatch({
      parsed: parse({ ...base, ...over }),
      occurrence,
      transaction: tx,
      scope: 'one',
      money: occurrence.money,
    });

  it('opens with the series’ business type, and an unchanged one is no change', () => {
    expect(base).toMatchObject({ mcc: '6513', mccSource: 'ai' });
    expect(isEmptyPatch(patchFor({}))).toBe(true);
  });

  it('names a new business type, a new source, or a cleared one', () => {
    expect(patchFor({ mcc: '7011', mccSource: 'user' })).toEqual({ mcc: '7011', mccSource: 'user' });
    expect(patchFor({ mccSource: 'user' })).toEqual({ mcc: '6513', mccSource: 'user' });
    expect(patchFor({ mcc: '', mccSource: '' })).toEqual({ mcc: null, mccSource: null });
  });

  it('opens a row from before business types with none', () => {
    expect(occurrenceToFormValues(occurrenceOf(rent(), [], '2026-09-10'), rent())).toMatchObject({
      mcc: '',
      mccSource: '',
    });
  });

  it('is carried into a duplicate, which is another purchase from the same business', () => {
    const copy = duplicateFormValues(
      occurrence,
      tx,
      defaultFormValues({ profileId: 'p1', currency: 'ILS', today: TODAY }),
      TODAY,
      { profiles: [{ id: 'p1' }], methods: [] },
    );
    expect(copy).toMatchObject({ mcc: '6513', mccSource: 'ai' });
  });
});
```

Append to `src/domain/series-edit.test.ts`:

```ts
describe('the business type: one per series', () => {
  const tx = monthly({ mcc: '5411', mccSource: 'ai' });

  it('at scope "one", is written to the series, and the occurrence’s override never carries it', () => {
    const result = plan({
      transaction: tx,
      scope: 'one',
      at: d('2026-06-10'),
      patch: { note: 'One-off', mcc: '5499', mccSource: 'user' },
    });
    expect(result.transactions).toEqual([{ ...tx, mcc: '5499', mccSource: 'user', updatedAt: NOW }]);
    expect(result.overrides).toHaveLength(1);
    const patch = result.overrides[0]?.action === 'modify' ? result.overrides[0].patch : undefined;
    expect(patch).toEqual({ note: 'One-off' });
  });

  it('at scope "one", writes no override when the business type was all that changed', () => {
    const result = plan({
      transaction: tx,
      scope: 'one',
      at: d('2026-06-10'),
      patch: { mcc: '5499', mccSource: 'user' },
    });
    expect(result.overrides).toEqual([]);
    expect(result.transactions.map((t) => t.mcc)).toEqual(['5499']);
  });

  it('across the whole series, and on both halves of a split', () => {
    const all = plan({
      transaction: tx,
      scope: 'all',
      at: d('2026-06-10'),
      patch: { mcc: '5499', mccSource: 'user' },
    });
    expect(all.transactions.map((t) => [t.mcc, t.mccSource])).toEqual([['5499', 'user']]);

    const split = plan({
      transaction: tx,
      scope: 'future',
      at: d('2026-06-10'),
      patch: { note: 'From June', mcc: '5499', mccSource: 'user' },
    });
    expect(split.transactions.map((t) => [t.id, t.mcc, t.mccSource])).toEqual([
      ['rent', '5499', 'user'],
      ['new-000001', '5499', 'user'],
    ]);
  });

  it('is cleared with null, which leaves no key behind', () => {
    const result = plan({
      transaction: tx,
      scope: 'all',
      at: d('2026-06-10'),
      patch: { mcc: null, mccSource: null },
    });
    expect(result.transactions[0]).not.toHaveProperty('mcc');
    expect(result.transactions[0]).not.toHaveProperty('mccSource');
  });

  it('is left alone by an edit that does not name it', () => {
    const result = plan({ transaction: tx, scope: 'all', at: d('2026-06-10'), patch: { note: 'x' } });
    expect(result.transactions[0]).toMatchObject({ mcc: '5411', mccSource: 'ai' });
  });
});
```

Append to `src/db/save-transaction.test.ts`:

```ts
describe('the business type', () => {
  it('is saved with an expense, and never with income', async () => {
    await saveNewTransaction(
      handle.db,
      input({ parsed: form({ currency: 'ILS', mcc: '5812', mccSource: 'user' }), newId: () => 'e1' }),
    );
    expect(await handle.db.transactions.get('e1')).toMatchObject({ mcc: '5812', mccSource: 'user' });

    const income = form({
      kind: 'income',
      categoryId: 'cat.salary',
      currency: 'ILS',
      mcc: '5812',
      mccSource: 'ai',
    });
    await saveNewTransaction(handle.db, input({ parsed: income, newId: () => 'i1' }));
    const saved = await handle.db.transactions.get('i1');
    expect(saved).not.toHaveProperty('mcc');
    expect(saved).not.toHaveProperty('mccSource');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test --project unit src/domain/tx-form.test.ts src/domain/tx-edit.test.ts src/domain/series-edit.test.ts -t "business type"` and `pnpm test --project db src/db/save-transaction.test.ts -t "business type"`
Expected: FAIL. The schema strips `mcc`, `TransactionPatch` has no `mcc`, and the save writes none. (`pnpm typecheck` also fails on the new keys until Step 3.)

- [ ] **Step 3: The form's schema**

In `src/domain/tx-form.ts`, import the shape:

```ts
import { MCC_SHAPE } from './mcc';
import { graphemeLength } from './validation';
```

In the `z.object({...})` of `txFormSchema`, after `resetAt`:

```ts
    /**
     * Expenses only: the business type ('' for none) and where it came from
     * ('' for none). Defaults rather than required keys, so every caller that
     * builds form values without them (import review, older tests) still parses.
     */
    mcc: z.string().default(''),
    mccSource: z.string().default(''),
```

In the `.transform`, after `deferral`:

```ts
      /*
       * The business type belongs to expenses. Stripped from income rather
       * than refused: switching an expense to income leaves it behind, which
       * is the form's own doing (Review Focus 4). Held to its shape only - a
       * code a later list added rides through an edit; every way a code comes
       * IN has already checked it against the list.
       */
      mcc: businessType(values)?.mcc,
      mccSource: businessType(values)?.mccSource,
```

Add below `export type TxFormParsed`:

```ts
/** The form's business type, when it has one an expense may keep. */
function businessType(values: {
  readonly kind: Kind;
  readonly mcc: string;
  readonly mccSource: string;
}): { readonly mcc: string; readonly mccSource: string | undefined } | undefined {
  if (values.kind !== 'expense' || !MCC_SHAPE.test(values.mcc)) return undefined;
  return { mcc: values.mcc, mccSource: values.mccSource === '' ? undefined : values.mccSource };
}
```

In `defaultFormValues`, after `partialFirst: false,`:

```ts
    mcc: '',
    mccSource: '',
```

- [ ] **Step 4: The edit form and its patch**

In `src/domain/tx-edit.ts`, `occurrenceToFormValues`, after `partialFirst: false,`:

```ts
    /*
     * The SERIES' business type: a series carries one, and an occurrence
     * never has its own (`OverridePatch` has no field for it).
     */
    mcc: transaction.mcc ?? '',
    mccSource: transaction.mccSource ?? '',
```

In `duplicateFormValues`, after `note: from.note,`:

```ts
    // Another purchase from the same business: the same business type.
    mcc: from.mcc,
    mccSource: from.mccSource,
```

In `buildPatch`, add the two keys to the local `patch` type:

```ts
    recurrence?: Recurrence;
    mcc?: string | null;
    mccSource?: string | null;
  } = {};
```

and, after the `note` comparison:

```ts
if (
  (parsed.mcc ?? '') !== (transaction.mcc ?? '') ||
  (parsed.mccSource ?? '') !== (transaction.mccSource ?? '')
) {
  // Compared with the SERIES, not the occurrence; `null` clears it.
  patch.mcc = parsed.mcc ?? null;
  patch.mccSource = parsed.mccSource ?? null;
}
```

- [ ] **Step 5: The planner writes it to the series**

In `src/domain/series-edit.ts`, add to `TransactionPatch`, after `recurrence`:

```ts
  /**
   * The series' business type, at every scope - a series carries one, so even
   * an edit of one occurrence writes it to the transaction. `null` clears it.
   */
  readonly mcc?: string | null;
  /** Where the business type came from; `null` clears it. */
  readonly mccSource?: string | null;
```

Add above `applyToTransaction`:

```ts
/** The patch's business type on `tx`, or `tx` as it is when the patch does not name one. */
function withBusinessType(tx: Transaction, patch: TransactionPatch): Transaction {
  if (patch.mcc === undefined) return tx;
  // Destructured away, so a cleared code leaves no key behind for sync to carry.
  const { mcc: _code, mccSource: _source, ...rest } = tx;
  if (patch.mcc === null) return rest;
  const source = patch.mccSource;
  return {
    ...rest,
    mcc: patch.mcc,
    ...(source === null || source === undefined ? {} : { mccSource: source }),
  };
}

/** Whether a patch changes anything an occurrence's override can hold. */
function touchesOccurrence(patch: TransactionPatch): boolean {
  return (
    patch.money !== undefined ||
    patch.categoryId !== undefined ||
    patch.paymentMethodId !== undefined ||
    patch.destinationId !== undefined ||
    patch.note !== undefined ||
    patch.date !== undefined
  );
}
```

In `applyToTransaction`, wrap the returned object:

```ts
return withBusinessType(
  {
    ...base,
    ...(patch.money === undefined ? {} : { money: patch.money }),
    ...(patch.categoryId === undefined ? {} : { categoryId: patch.categoryId }),
    ...(patch.paymentMethodId === undefined ? {} : { paymentMethodId: patch.paymentMethodId ?? undefined }),
    ...(patch.destinationId === undefined ? {} : { destinationId: patch.destinationId ?? undefined }),
    ...(patch.note === undefined ? {} : { note: patch.note ?? undefined }),
    ...(patch.recurrence === undefined ? {} : { recurrence: patch.recurrence }),
    updatedAt: now,
  },
  patch,
);
```

In `planSeriesEdit`, replace the `scope === 'one'` branch:

```ts
if (scope === 'one') {
  const existing = overrides.find((o) => o.transactionId === tx.id && o.occurrenceDate === at);
  return {
    ok: true,
    plan: {
      // The business type is the series': written to it even from one occurrence.
      transactions: patch.mcc === undefined ? [] : [withBusinessType({ ...tx, updatedAt: now }, patch)],
      overrides: touchesOccurrence(patch) ? [overrideFor(tx.id, at, patch, existing, now, newId)] : [],
      deleteOverrideIds: [],
      warnings,
      effectiveScope: 'one',
    },
  };
}
```

In `planSplit`, give the closed original the business type too:

```ts
const original: Transaction = withBusinessType(
  {
    ...tx,
    recurrence: withEndDate(tx.recurrence, closeAt),
    updatedAt: now,
  },
  patch,
);
```

(The continuation already gets it through `applyToTransaction`.)

- [ ] **Step 6: The save**

In `src/db/save-transaction.ts`, `saveNewTransaction`'s draft, after `deferral`:

```ts
      // An expense's business type, and where it came from; the form strips both from income.
      ...(parsed.mcc === undefined ? {} : { mcc: parsed.mcc }),
      ...(parsed.mccSource === undefined ? {} : { mccSource: parsed.mccSource }),
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `pnpm test --project unit src/domain/tx-form.test.ts src/domain/tx-edit.test.ts src/domain/series-edit.test.ts` and `pnpm test --project db src/db/save-transaction.test.ts src/db/series-edit.test.ts src/db/occurrence-actions.test.ts`
Expected: PASS, the new tests and every earlier one. (`occurrence-actions` applies plans; a scope-"one" plan with no override must still apply and undo cleanly.)

- [ ] **Step 8: Run the task gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test --project dom src/features/transaction`
Expected: all pass. The transaction sheet compiles unchanged: its form values come from `defaultFormValues` and `occurrenceToFormValues`.

- [ ] **Step 9: Commit**

```bash
git add src/domain/tx-form.ts src/domain/tx-form.test.ts src/domain/tx-edit.ts src/domain/tx-edit.test.ts src/domain/series-edit.ts src/domain/series-edit.test.ts src/db/save-transaction.ts src/db/save-transaction.test.ts
git commit -m "A business type is saved with an expense, kept by every edit, and never saved on income" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: What history says about a merchant, in one walk

Spec §2 step 3 ("History"), §3 step 2 ("The person's own choice for this merchant"), §6 ("One merchant, two business types over time", "Split households", "Deleted and archived rows"). Spec point 5. Review Focus 1.

**Files:**

- Modify: `src/db/repos/transactions.ts` (replace `categoryFromHistory` with `merchantHistory`)
- Modify (one line each, so the build stays green): `src/features/import/review-items.ts`, `src/features/import/import-sheet.tsx`, `src/features/transaction/use-auto-category.ts`
- Test: `src/db/repos/transactions.test.ts` (db), `src/features/transaction/use-auto-category.test.tsx` (dom, its mock only)

**The walk.** One scan of `transactions`, newest `updatedAt` first, over live rows of the kind asked (every person's, as today). It remembers:

- the newest row with the same text (`sameName`), and the newest such row with a business type;
- the newest row with the same `merchantKey`, and the newest such row with a business type.

It stops as soon as the text row is found and, for an expense, the text row's business type too; otherwise it reads to the end, as `categoryFromHistory` already does for a name it has never seen. Then:

- `mcc`: the text rows' code, else the key rows' code. Only a code `isMcc` knows, and never for income.
- `categoryId`: the text row's category, else the key row's - unless that row's category is exactly what the DEFAULT table gives that row's own `mcc`. Then the table chose it, not the person, so step 2 gives nothing and the business type decides (spec point 5).

A name with no `merchantKey` (`''`, Review Focus 1) is matched on its text alone.

**Interfaces:**

- Consumes: `merchantKey` (Task 3), `defaultCategoryForMcc` (Task 4), `isMcc` (Task 1).
- Produces, in `src/db/repos/transactions.ts`:
  - `type MerchantHistory = { readonly categoryId?: string; readonly mcc?: string }`
  - `merchantHistory(db: BookandryDB, kind: Kind, name: string): Promise<MerchantHistory>`
  - `categoryFromHistory` is removed; its three callers read `.categoryId`.

- [ ] **Step 1: Write the failing tests**

In `src/db/repos/transactions.test.ts`, change the import of `categoryFromHistory` to `merchantHistory`, and replace the whole `describe('categoryFromHistory', ...)` block with:

```ts
describe('merchantHistory', () => {
  const save = (
    id: string,
    note: string,
    categoryId: string,
    updatedAt: string,
    over: { kind?: 'expense' | 'income'; mcc?: string; profileId?: string } = {},
  ) =>
    putTransaction(
      handle.db,
      {
        id,
        profileId: over.profileId ?? 'p1',
        kind: over.kind ?? 'expense',
        categoryId,
        money: MONEY,
        date: d('2026-09-01'),
        recurrence: { type: 'one_time' },
        seriesRootId: id,
        note,
        ...(over.mcc === undefined ? {} : { mcc: over.mcc, mccSource: 'ai' }),
        createdAt: ts(updatedAt),
        updatedAt: ts(updatedAt),
      },
      [],
    );
  const AUG = '2026-08-01T10:00:00.000Z';
  const SEP = '2026-09-01T10:00:00.000Z';
  const OCT = '2026-10-01T10:00:00.000Z';

  it('files a name where it was filed before, ignoring case and spacing', async () => {
    await save('a', 'Claude Max Plan', 'cat.aiSoftware', SEP);
    expect(await merchantHistory(handle.db, 'expense', '  claude   max plan ')).toEqual({
      categoryId: 'cat.aiSoftware',
    });
  });

  it('follows the latest choice, so a correction sticks, across every person in view', async () => {
    await save('old', 'Netflix', 'cat.subscriptions', AUG);
    await save('new', 'Netflix', 'cat.entertainment', SEP, { profileId: 'p2' });
    expect((await merchantHistory(handle.db, 'expense', 'Netflix')).categoryId).toBe('cat.entertainment');
  });

  it('ignores deleted rows, the other kind, and names it has never seen', async () => {
    await save('gone', 'Wolt', 'cat.dining', SEP, { mcc: '5812' });
    await softDelete(handle.db, 'gone', NOW);
    await save('in', 'Amazon', 'cat.refund', SEP, { kind: 'income' });
    expect(await merchantHistory(handle.db, 'expense', 'Wolt')).toEqual({});
    expect(await merchantHistory(handle.db, 'expense', 'Amazon')).toEqual({});
    expect(await merchantHistory(handle.db, 'expense', 'Something new')).toEqual({});
    expect(await merchantHistory(handle.db, 'expense', '   ')).toEqual({});
  });

  it('falls back to the same merchant printed another way, but the same text wins', async () => {
    await save('a', 'שופרסל דיל 123 ת"א', 'c.food', AUG);
    expect((await merchantHistory(handle.db, 'expense', 'שופרסל דיל 999 ת״א')).categoryId).toBe('c.food');

    await save('b', 'שופרסל דיל 45 ת"א', 'cat.shopping', SEP);
    await save('c', 'שופרסל דיל 999 ת״א', 'cat.groceries', AUG);
    // The newer row is only the same merchant; the older one is the same text.
    expect((await merchantHistory(handle.db, 'expense', 'שופרסל דיל 999 ת״א')).categoryId).toBe(
      'cat.groceries',
    );
  });

  it('takes the business type from the same text first, then from the same merchant', async () => {
    await save('key', 'Wolt order 1290', 'cat.dining', AUG, { mcc: '5814' });
    await save('text', 'WOLT *ORDER 8812', 'c.food', SEP);
    // The text row has no business type: the merchant's is used, and the text row's category.
    expect(await merchantHistory(handle.db, 'expense', 'wolt *order 8812')).toEqual({
      categoryId: 'c.food',
      mcc: '5814',
    });
    await save('older', 'WOLT *ORDER 8812', 'c.food', '2026-07-01T10:00:00.000Z', { mcc: '5812' });
    expect((await merchantHistory(handle.db, 'expense', 'wolt *order 8812')).mcc).toBe('5812');
  });

  it('gives no choice of the person’s when the table filed the row, so the business type decides (spec point 5)', async () => {
    await save('a', 'Cafe Nero', 'cat.dining', SEP, { mcc: '5812' });
    expect(await merchantHistory(handle.db, 'expense', 'Cafe Nero')).toEqual({ mcc: '5812' });
    await save('b', 'Cafe Nero', 'c.coffee', OCT, { mcc: '5812' });
    expect(await merchantHistory(handle.db, 'expense', 'Cafe Nero')).toEqual({
      categoryId: 'c.coffee',
      mcc: '5812',
    });
  });

  it('never merges two payments to different people through one payment service (Review Focus 1)', async () => {
    await save('a', 'PAYPAL *4029357733', 'cat.shopping', SEP, { mcc: '5999' });
    await save('b', 'ביט 0527654321', 'c.gifts', SEP, { mcc: '4829' });
    expect(await merchantHistory(handle.db, 'expense', 'PAYPAL *4029357744')).toEqual({});
    expect(await merchantHistory(handle.db, 'expense', 'העברה בביט 0501234567')).toEqual({});
  });

  it('drops a stored code the list does not have, and never gives income a business type', async () => {
    await save('a', 'Shop', 'cat.shopping', SEP, { mcc: '9999' });
    expect(await merchantHistory(handle.db, 'expense', 'Shop')).toEqual({ categoryId: 'cat.shopping' });
    await save('b', 'Refund desk', 'cat.refund', SEP, { kind: 'income', mcc: '5411' });
    expect(await merchantHistory(handle.db, 'income', 'Refund desk')).toEqual({ categoryId: 'cat.refund' });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test --project db src/db/repos/transactions.test.ts -t merchantHistory`
Expected: FAIL, `merchantHistory` is not exported.

- [ ] **Step 3: Write `merchantHistory`**

In `src/db/repos/transactions.ts`, add imports:

```ts
import { isMcc } from '@/domain/mcc';
import { defaultCategoryForMcc } from '@/domain/mcc-categories';
import { merchantKey } from '@/domain/merchant-key';
import { expandOccurrences } from '@/domain/occurrences';
```

and the `Transaction` type is already imported. Replace `categoryFromHistory` (and its doc comment) with:

```ts
/** What the household's history says about a merchant. */
export type MerchantHistory = {
  /** The person's own choice for this merchant (spec §3 step 2), when there is one. */
  readonly categoryId?: string;
  /** The business type of the newest such expense that has one (spec §2 step 3). */
  readonly mcc?: string;
};

/**
 * Where this name was filed before, and its business type: "Claude Max Plan"
 * goes where the person put it, without asking anyone. What they corrected
 * stays corrected.
 *
 * The same text first - ignoring case and spacing, so "netflix " is Netflix -
 * then the same merchant printed another way (`merchantKey`): "שופרסל דיל 45
 * ת"א" for "שופרסל דיל 123 ת"א". Newest first, every person's, live rows of
 * this kind only.
 *
 * A row filed exactly where the default table files its own business type
 * was filed by the table, not by the person: then there is no choice of
 * theirs to follow, and the business type decides (spec point 5). Without
 * that, a business type moved to another category would never reach a
 * merchant already seen.
 *
 * ONE walk, newest first, that stops as soon as the same text - and, for an
 * expense, the same text with a business type - is found. A name it has never
 * seen reads to the end, as it always did. Callers memoise per import.
 */
export async function merchantHistory(db: BookandryDB, kind: Kind, name: string): Promise<MerchantHistory> {
  const text = sameName(name);
  if (text === '') return {};
  const key = merchantKey(name);
  const seen: {
    byText?: Transaction;
    byKey?: Transaction;
    mccByText?: string;
    mccByKey?: string;
  } = {};
  const done = (): boolean =>
    seen.byText !== undefined && (kind === 'income' || seen.mccByText !== undefined);

  await db.transactions
    .orderBy('updatedAt')
    .reverse()
    .until(done)
    .each((tx) => {
      if (tx.isDeleted !== 0 || tx.kind !== kind) return;
      const note = tx.note ?? '';
      const code = kind === 'expense' && isMcc(tx.mcc) ? tx.mcc : undefined;
      if (sameName(note) === text) {
        seen.byText ??= tx;
        seen.mccByText ??= code;
      } else if (key !== '' && merchantKey(note) === key) {
        seen.byKey ??= tx;
        seen.mccByKey ??= code;
      }
    });

  const decider = seen.byText ?? seen.byKey;
  const mcc = seen.mccByText ?? seen.mccByKey;
  const tableChose = decider?.mcc !== undefined && decider.categoryId === defaultCategoryForMcc(decider.mcc);
  return {
    ...(decider === undefined || tableChose ? {} : { categoryId: decider.categoryId }),
    ...(mcc === undefined ? {} : { mcc }),
  };
}
```

(`until(done)` is checked before each row and reads what the rows before it found, so the walk stops at the first row after the answer is complete.)

- [ ] **Step 4: Point the three callers at it**

In `src/features/import/review-items.ts`, change the import and the one call:

```ts
import { merchantHistory } from '@/db/repos/transactions';
```

```ts
const fromHistory = (await merchantHistory(db, row.kind, row.description)).categoryId;
```

In `src/features/import/import-sheet.tsx`, change `categoryFromHistory` in the `@/db/repos/transactions` import to `merchantHistory`, and the `knownMerchant` context entry to:

```ts
          knownMerchant: async (description) =>
            (await merchantHistory(db, 'expense', description)).categoryId !== undefined ||
            (await merchantHistory(db, 'income', description)).categoryId !== undefined,
```

In `src/features/transaction/use-auto-category.ts`, change the import and the one call:

```ts
import { merchantHistory } from '@/db/repos/transactions';
```

```ts
let id = await merchantHistory(db, kind, name)
  .then((history) => history.categoryId)
  .catch(() => undefined);
```

In `src/features/transaction/use-auto-category.test.tsx`, change the mock:

```ts
vi.mock('@/db/repos/transactions', () => ({
  merchantHistory: () => Promise.resolve({ categoryId: history.answer }),
}));
```

(Tasks 8 and 9 rework these callers; this step only keeps them compiling and behaving as before.)

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm test --project db src/db/repos/transactions.test.ts src/features/import` and `pnpm test --project dom src/features/transaction/use-auto-category.test.tsx src/features/import/import-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the task gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all pass, and `grep -rn categoryFromHistory src` finds nothing.

- [ ] **Step 7: Commit**

```bash
git add src/db/repos/transactions.ts src/db/repos/transactions.test.ts src/features/import/review-items.ts src/features/import/import-sheet.tsx src/features/transaction/use-auto-category.ts src/features/transaction/use-auto-category.test.tsx
git commit -m "A merchant printed another way is now recognised from history, and history also says its business type" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Business types in files: the MCC and sector columns, and the reader's answers

Spec §2 steps 1, 2 and 4 (the `HEADERS` entries, `mcc` and `sec` on the wire row, `{ m, mcc, cat }`, the sector hint), §6 ("A bad file cell never fails the import"), §7 "Wire". Spec points 7 and 8. Review Focus 5.

**Files:**

- Modify: `src/domain/import-wire.ts`, then copy it to `supabase/functions/_shared/import-wire.ts`
- Modify: `src/domain/import-sheet-map.ts` (`ColumnMap`, `HEADERS`, `mapByDictionary`, `fromWireMap`, `readSheet`)
- Modify: `src/domain/import-check.ts` (`FoundRow`, `readRow`)
- Test: `src/domain/import-wire.test.ts`, `src/domain/import-sheet-map.test.ts`, `src/domain/import-check.test.ts` (unit)

**Who checks what.** `import-wire.ts` is one file in two runtimes and may import nothing, so its cleaners check a code's SHAPE: four digits, on an expense row only. The app's own readers (`readRow`, `readSheet`, and `readWorkbook` in Task 8) then keep only a code `isMcc` knows. So a `"9999"` from the model passes the wire and is dropped by the app; `"58120"`, `"abc"` and a number never pass the wire. The new wire fields are plain strings (`""` for none), not unions: the answer schemas stay inside the 16-union limit `import-wire.test.ts` checks.

**Interfaces:**

- Consumes: `isMcc` (Task 1).
- Produces:
  - `WireRow` gains `readonly mcc?: string` and `readonly sec?: string` (present only when non-empty, expense rows only).
  - `MapRequest` gains `readonly sectors?: readonly string[]`, parallel to `merchants` (`''` where a merchant has none).
  - `WireMap['mc']` entries become `{ readonly m: string; readonly mcc: string | null; readonly cat: string | null }`; `cleanMerchantCats` returns that shape.
  - `ColumnMap` gains `readonly mcc: number | null` and `readonly sector: number | null`; `fromWireMap(map: WireMap, rows: readonly (readonly Cell[])[] = []): ColumnMap` fills both from the header row by the dictionary.
  - `FoundRow` gains `readonly fileMcc?: string`, `readonly sector?: string`, `readonly aiMcc?: string`. `readSheet` sets `fileMcc` and `sector`; `readRow` sets `aiMcc` and `sector`.

- [ ] **Step 1: Write the failing wire tests**

In `src/domain/import-wire.test.ts`, in the test "takes merchants by their number in the list, never a name retyped", the merchant answers now carry a business type. Change its expectation to:

```ts
expect(clean?.mc).toEqual([
  { m: 'SPOTIFY P2B3', mcc: null, cat: 'c1' },
  { m: 'Wolt', mcc: null, cat: null },
]);
```

Then append:

```ts
describe('business types on the wire', () => {
  it('keeps a row’s four-digit code and its printed sector, on an expense only', () => {
    expect(cleanRow(row({ mcc: ' 5812 ', sec: 'מסעדות' }), 1, ctx)).toMatchObject({
      mcc: '5812',
      sec: 'מסעדות',
    });
    // Shape only: whether the list has it is the app's to say (import-check).
    expect(cleanRow(row({ mcc: '9999' }), 1, ctx)?.mcc).toBe('9999');
    for (const bad of ['58120', 'abc', '', 5812, null]) {
      expect(cleanRow(row({ mcc: bad }), 1, ctx), String(bad)).not.toHaveProperty('mcc');
    }
    expect(cleanRow(row({ sec: '' }), 1, ctx)).not.toHaveProperty('sec');
    // A stray code on income is no answer: income has no business type.
    const income = cleanRow(row({ k: 'i', cat: null, mcc: '5812', sec: 'מסעדות' }), 1, ctx);
    expect(income).not.toHaveProperty('mcc');
    expect(income).not.toHaveProperty('sec');
  });

  it('reads a merchant answer as { m, mcc, cat }, dropping a code that is not one', () => {
    const answer = {
      mc: [
        { i: 0, mcc: '5812', cat: 'c1' },
        { i: 1, mcc: 'x', cat: null },
        { i: 2, cat: null },
      ],
    };
    expect(cleanMerchantCats(answer, ctx, ['Cafe', 'Shop', 'Old function'])).toEqual([
      { m: 'Cafe', mcc: '5812', cat: 'c1' },
      { m: 'Shop', mcc: null, cat: null },
      { m: 'Old function', mcc: null, cat: null },
    ]);
  });

  it('sends each merchant’s sector beside it, and refuses sectors that do not line up', () => {
    const asked = (sectors: unknown) =>
      parseWireRequest({
        mode: 'map',
        ctx,
        rows: [['a']],
        merchants: ['Cafe', 'Shop'],
        sectors,
        maxTokens: 500,
      });
    const ok = asked(['שונות', '']);
    expect(ok).toMatchObject({ mode: 'map', sectors: ['שונות', ''] });
    expect(ok?.mode === 'map' && mapTask(ok)).toContain('0: "Cafe" (sector "שונות")');
    expect(ok?.mode === 'map' && mapTask(ok)).toContain('1: "Shop"');
    expect(ok?.mode === 'map' && mapTask(ok)).not.toContain('"Shop" (sector');
    expect(asked(['שונות'])).toBeUndefined();
    expect(asked(['שונות', 7])).toBeUndefined();
    // An app from before sends none.
    expect(asked(undefined)).toMatchObject({ mode: 'map' });
    expect(asked(undefined)).not.toHaveProperty('sectors');
  });

  it('asks the model for a business type on every row and every merchant', () => {
    const schema = extractSchema(ctx) as {
      properties: { r: { items: { properties: Record<string, unknown>; required: string[] } } };
    };
    expect(schema.properties.r.items.required).toEqual(expect.arrayContaining(['mcc', 'sec']));
    const map = mapSchema(ctx) as { properties: { mc: { items: { required: string[] } } } };
    expect(map.properties.mc.items.required).toEqual(['i', 'mcc', 'cat']);
  });
});
```

- [ ] **Step 2: Write the failing sheet and row tests**

Append to `src/domain/import-sheet-map.test.ts`:

```ts
describe('business types in a sheet', () => {
  it('reads an MCC column however Excel stored it, and never fails a row over it (Review Focus 5)', () => {
    const sheet: Cell[][] = [
      ['תאריך עסקה', 'שם בית העסק', 'סכום עסקה', 'MCC', 'ענף'],
      ['01/10/2026', 'Vet', '100.00', 742, 'חיות מחמד'],
      ['02/10/2026', 'Shop', '10.00', 5411, null],
      ['03/10/2026', 'Shop', '10.00', '5411.0', ''],
      ['04/10/2026', 'Cafe', '10.00', ' 5812 ', 'מסעדות'],
      ['05/10/2026', 'Odd', '10.00', '9999', null],
      ['06/10/2026', 'Odd', '10.00', 'abc', null],
      ['07/10/2026', 'Odd', '10.00', '', null],
      ['08/10/2026', 'Odd', '10.00', 5411.5, null],
    ];
    const map = mapByDictionary(sheet)!;
    expect(map).toMatchObject({ mcc: 3, sector: 4 });
    const read = readSheet(sheet, map, ctx);
    expect(read.unreadable).toBe(0);
    expect(read.rows.map((r) => r.fileMcc)).toEqual([
      '0742',
      '5411',
      '5411',
      '5812',
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(read.rows.map((r) => r.sector)).toEqual([
      'חיות מחמד',
      undefined,
      undefined,
      'מסעדות',
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(read.rows.every((r) => r.flags.length === 0)).toBe(true);
  });

  it('knows the MCC and sector headers Israeli and English exports use, and keeps them apart', () => {
    const header = (cells: string[]): Cell[][] => [['תאריך', 'תיאור', 'סכום', ...cells]];
    expect(mapByDictionary(header(['קוד ענף', 'ענף עסקי']))).toMatchObject({ mcc: 3, sector: 4 });
    expect(mapByDictionary(header(['Merchant category code', 'Category']))).toMatchObject({
      mcc: 3,
      sector: 4,
    });
    expect(mapByDictionary(header(['SIC', 'Sector']))).toMatchObject({ mcc: 3, sector: 4 });
    expect(mapByDictionary(header(['קטגוריה']))).toMatchObject({ mcc: null, sector: 3 });
    expect(mapByDictionary(header(['תחום']))).toMatchObject({ mcc: null, sector: 3 });
    expect(mapByDictionary(header([]))).toMatchObject({ mcc: null, sector: null });
  });

  it('finds them on a header row the model mapped, too', () => {
    const rows: Cell[][] = [
      ['when', 'what', 'how much', 'MCC', 'ענף'],
      ['10/03/2026', 'Cafe', 12.5, '5812', 'מסעדות'],
    ];
    const wire = {
      hr: 0,
      date: 0,
      desc: 1,
      amt: 2,
      debit: null,
      credit: null,
      cur: null,
      chg: null,
      chgCur: null,
      chgDate: null,
      plan: null,
      card: null,
      dec: '.' as const,
      df: 'dmy' as const,
      mc: [],
    };
    expect(fromWireMap(wire, rows)).toMatchObject({ mcc: 3, sector: 4 });
    expect(fromWireMap(wire)).toMatchObject({ mcc: null, sector: null });
    expect(readSheet(rows, fromWireMap(wire, rows), ctx).rows[0]).toMatchObject({
      fileMcc: '5812',
      sector: 'מסעדות',
    });
  });
});
```

Append to `src/domain/import-check.test.ts`:

```ts
describe('a transcribed row’s business type', () => {
  it('is the reader’s, on an expense, when the list has it - and its sector as printed', () => {
    expect(readRow(wire({ mcc: '5812', sec: 'מסעדות' }), 'r1', ctx)).toMatchObject({
      aiMcc: '5812',
      sector: 'מסעדות',
    });
    expect(readRow(wire({ mcc: '9999' }), 'r2', ctx)).not.toHaveProperty('aiMcc');
    expect(readRow(wire({}), 'r3', ctx)).not.toHaveProperty('aiMcc');
  });

  it('is none when the row turns out to be money coming back', () => {
    const credit = readRow(wire({ a: '-50.00', mcc: '5812' }), 'r4', ctx);
    expect(credit.kind).toBe('income');
    expect(credit).not.toHaveProperty('aiMcc');
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm test --project unit src/domain/import-wire.test.ts src/domain/import-sheet-map.test.ts src/domain/import-check.test.ts`
Expected: FAIL. The cleaners drop `mcc` and `sec`, `mc` entries have no `mcc`, `ColumnMap` has no `mcc` or `sector`, and found rows have no business type.

- [ ] **Step 4: The wire**

In `src/domain/import-wire.ts`:

Add to `MapRequest`, after `merchants`:

```ts
  /**
   * Each merchant's business sector as its file printed it, '' for none -
   * parallel to `merchants`. A hint for its business type. Absent from an
   * app from before business types.
   */
  readonly sectors?: readonly string[];
```

Add to `WireRow`, after `w`:

```ts
  /**
   * An expense's business type: the 4-digit Merchant Category Code printed
   * beside it, or the model's single most likely one. Four digits; whether
   * the list has it is the app's to check. Absent on income, and when none.
   */
  readonly mcc?: string;
  /** The business sector (ענף) printed beside an expense, as printed. Absent when none. */
  readonly sec?: string;
```

Change `WireMap`'s `mc`:

```ts
  readonly mc: readonly { readonly m: string; readonly mcc: string | null; readonly cat: string | null }[];
```

In `parseWireRequest`'s `map` branch, replace from `const { rows, merchants } = body;` to its `return`:

```ts
const { rows, merchants, sectors } = body;
if (!Array.isArray(rows) || rows.length === 0 || rows.length > LIMITS.sheetRows) return undefined;
const cleanRows: string[][] = [];
for (const row of rows) {
  if (!Array.isArray(row) || row.length > LIMITS.sheetCols) return undefined;
  if (!row.every((cell) => isText(cell, LIMITS.cell))) return undefined;
  cleanRows.push(row);
}
if (!Array.isArray(merchants) || merchants.length > LIMITS.merchants) return undefined;
if (!merchants.every((m) => isText(m, LIMITS.description))) return undefined;
if (sectors === undefined) return { mode: 'map', ctx, rows: cleanRows, merchants, maxTokens };
// A hint per merchant, or none at all: a list that does not line up is no hint.
if (!Array.isArray(sectors) || sectors.length !== merchants.length) return undefined;
if (!sectors.every((s) => isText(s, LIMITS.field))) return undefined;
return { mode: 'map', ctx, rows: cleanRows, merchants, sectors, maxTokens };
```

Add below `lastFour`:

```ts
/** Four digits, as printed or trimmed of spaces; anything else is none. */
function wireMcc(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const code = v.trim();
  return /^\d{4}$/.test(code) ? code : undefined;
}
```

In `cleanRow`, before its `return`:

```ts
// An expense's business type and sector; a stray one on income is no answer.
const mcc = k === 'e' ? wireMcc(v.mcc) : undefined;
const sec = k === 'e' ? cleanText(v.sec, LIMITS.field) : undefined;
```

and at the end of the returned object, after the `w` spread:

```ts
    ...(mcc === undefined ? {} : { mcc }),
    ...(sec === undefined || sec === '' ? {} : { sec }),
```

In `cleanMerchantCats`, change the return type and the pushed entry:

```ts
): { m: string; mcc: string | null; cat: string | null }[] {
  const mc: { m: string; mcc: string | null; cat: string | null }[] = [];
```

```ts
mc.push({ m, mcc: wireMcc(entry.mcc) ?? null, cat: alias(entry.cat, ctx.cats) });
```

In `INSTRUCTIONS`, after the `m:` line, add one line:

```
mcc: for an expense, the 4-digit merchant category code (MCC) of the business - printed beside the row if it is, else the single most likely one; "" for income or when unsure. sec: the business sector (ענף) printed beside the row, as printed, else "".
```

In `rowProperties`, after `l4: text,`:

```ts
    mcc: text,
    sec: text,
```

and add `'mcc'` and `'sec'` to the end of `ROW_KEYS`.

In `mapSchema`'s `mc` items:

```ts
          properties: {
            i: { type: 'integer' },
            mcc: { type: 'string' },
            cat: aliasSchema(ctx.cats.map((c) => c.a)),
          },
          required: ['i', 'mcc', 'cat'],
```

In `mapTask`, build the merchant lines with their sectors, and ask for the code:

```ts
const merchants =
  request.merchants.length === 0
    ? 'none'
    : request.merchants
        .map((m, i) => {
          const sector = request.sectors?.[i] ?? '';
          return `${String(i)}: ${JSON.stringify(m)}${sector === '' ? '' : ` (sector ${JSON.stringify(sector)})`}`;
        })
        .join('\n');
return `These are the first rows of a spreadsheet block (row index: cells by column index):\n${table}\n\nGive the header row's index and the column index of each field (null when absent): date = transaction date, desc = merchant, amt = amount (one signed column), or debit/credit columns, cur = currency, chg = charged amount, chgCur, chgDate = debit date, plan = instalment text, card = the card's number or last digits. dec: the decimal mark the amounts use. df: date order.\nmc: for each merchant below, by its number i: mcc, the single most likely 4-digit merchant category code (MCC) of the business, using its sector when one is given, or "" when unsure; and cat, the best category alias for what the business or payment is, or null when unsure. A streaming, music or software service (Spotify, Netflix, Apple, Google) is a subscription; a card company or a bank (מקס איט פיננסים, ישראכרט, כאל) is never a restaurant, a shop or rent.\n${merchants}`;
```

Then copy the file for the Edge Function:

```bash
cp src/domain/import-wire.ts supabase/functions/_shared/import-wire.ts
```

- [ ] **Step 5: The sheet**

In `src/domain/import-sheet-map.ts`, import the check:

```ts
import { currencyFromText, type Flag, type FoundPlan, type FoundRow } from './import-check';
import type { WireMap, WireRow } from './import-wire';
import { isMcc } from './mcc';
```

Widen `ColumnMap`:

```ts
/**
 * A sheet's columns. `mcc` and `sector` come from the dictionary only - the
 * model's map never names them - including on a header row the model found.
 */
export type ColumnMap = Omit<WireMap, 'mc' | 'hr'> & {
  readonly headerRow: number;
  readonly mcc: number | null;
  readonly sector: number | null;
};
```

Add to `HEADERS`, after `card`:

```ts
  mcc: ['mcc', 'קוד ענף', 'merchant category code', 'sic'],
  sector: ['ענף', 'ענף עסקי', 'תחום', 'קטגוריה', 'category', 'sector'],
```

In `mapByDictionary`'s returned object, after `card`:

```ts
      mcc: found.mcc ?? null,
      sector: found.sector ?? null,
```

Replace `fromWireMap`:

```ts
/** A model's map, as a column map: with the MCC and sector columns its header row names, by the dictionary. */
export function fromWireMap(map: WireMap, rows: readonly (readonly Cell[])[] = []): ColumnMap {
  const { hr, mc: _merchants, ...rest } = map;
  const header = rows[hr] ?? [];
  const column = (field: 'mcc' | 'sector'): number | null => {
    const at = header.findIndex((cell) => fieldOf(cell) === field);
    return at === -1 ? null : at;
  };
  return { ...rest, headerRow: hr, mcc: column('mcc'), sector: column('sector') };
}
```

Add above `readSheet`:

```ts
/**
 * A business type from an MCC cell. Excel keeps a code as a number, so 742
 * is "0742" and 5411.0 is "5411"; a text cell may carry spaces or ".0".
 * Anything the list does not have is none - never a flag on the row.
 */
function mccFromCell(cell: Cell | undefined): string | undefined {
  let code: string | undefined;
  if (typeof cell === 'number') {
    code = Number.isInteger(cell) && cell >= 0 && cell < 10_000 ? String(cell).padStart(4, '0') : undefined;
  } else if (typeof cell === 'string') {
    code = /^\s*(\d{1,4})(?:\.0+)?\s*$/.exec(cell)?.[1]?.padStart(4, '0');
  }
  return isMcc(code) ? code : undefined;
}
```

In `readSheet`, before `out.push({`:

```ts
const fileMcc = map.mcc === null ? undefined : mccFromCell(row[map.mcc]);
const sector = map.sector === null ? '' : text(row[map.sector]);
```

and in the pushed row, after `wire,`:

```ts
      ...(fileMcc === undefined ? {} : { fileMcc }),
      ...(sector === '' ? {} : { sector }),
```

- [ ] **Step 6: A transcribed row**

In `src/domain/import-check.ts`, import the check:

```ts
import type { WireRow, WireTotal } from './import-wire';
import { isMcc } from './mcc';
```

Add to `FoundRow`, after `wire`:

```ts
  /** The business type the file's MCC column gave, when the list has it. */
  readonly fileMcc?: string;
  /** The card company's business sector (ענף), as printed. */
  readonly sector?: string;
  /**
   * The business type the reader gave - for a PDF or image row, transcribed
   * or guessed (spec point 7); for a sheet row, Claude's answer for its
   * merchant (Task 8). Only a code the list has.
   */
  readonly aiMcc?: string;
```

In `readRow`'s returned object, after `wire,`:

```ts
    // An expense's only: money coming back has no business type, whatever the reader said.
    ...(kind === 'expense' && isMcc(wire.mcc) ? { aiMcc: wire.mcc } : {}),
    ...(wire.sec === undefined || wire.sec === '' ? {} : { sector: wire.sec }),
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `pnpm test --project unit src/domain/import-wire.test.ts src/domain/import-sheet-map.test.ts src/domain/import-check.test.ts`
Expected: PASS, including "the copy the function deploys" (the `cp` above) and "has answer schemas inside the API's limits".

- [ ] **Step 8: Run the task gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm gate:pci && pnpm test --project db src/features/import`
Expected: all pass. `run-import.ts` compiles unchanged: `fromWireMap`'s new argument is optional, and its merchant answers simply carry the extra `mcc`.

- [ ] **Step 9: Commit**

```bash
git add src/domain/import-wire.ts supabase/functions/_shared/import-wire.ts src/domain/import-wire.test.ts src/domain/import-sheet-map.ts src/domain/import-sheet-map.test.ts src/domain/import-check.ts src/domain/import-check.test.ts
git commit -m "Smart import now reads a file's MCC and sector columns, and asks the reader for each expense's business type" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: The import: who is asked, the order in review, and cash withdrawals

Spec §2 (the order, first hit wins), §3 (the order for imports), §6, §7 "Import". Spec points 5, 9, 13 and 14 (the ruling on cash withdrawals). Review Focus 2 and 6.

**Files:**

- Modify: `src/domain/mcc-categories.ts` (add `MccPick`, `pickMcc`, `chooseExpenseCategory`, `isCashWithdrawal`)
- Modify: `src/domain/import-check.ts` (`Flag`, `BLOCKING`: `cash_withdrawal`)
- Modify: `src/features/import/run-import.ts` (`ImportContext.history` replaces `knownMerchant`; `readWorkbook`, `askCategories`)
- Modify: `src/features/import/review-items.ts` (`buildReview`)
- Modify: `src/features/import/import-sheet.tsx` (`read`: one memoised history for the reader and the review)
- Modify: `src/i18n/locales/en/import.json`, `src/i18n/locales/he/import.json` (`flag.cash_withdrawal`)
- Test: `src/domain/mcc-categories.test.ts` (unit), `src/features/import/run-import.test.ts`, `src/features/import/review-items.test.ts` (db), `src/features/import/import-sheet.test.tsx` (dom)

**Cash withdrawals (spec point 14).** An expense whose business type ends up 6010 or 6011, from any source, gets the flag `cash_withdrawal`. It is in `BLOCKING`, so the row starts unticked and sits in "Check these", with the note as its reason. Review already offers the way back: tick its box, or open it and press Done. Kept, it saves as an ordinary expense, filed by the table under Currency exchange, with its 6011. Income never has a business type, so it is never flagged.

**Copy (added by this task):**

| Key                           | en                                                                             | he                                                           |
| ----------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `import:flag.cash_withdrawal` | Cash withdrawal: not counted as an expense. You can record it in the Cash tab. | משיכת מזומן: לא נספרת כהוצאה. אפשר לרשום אותה בלשונית מזומן. |

**Interfaces:**

- Consumes: `merchantHistory`, `MerchantHistory` (Task 6); `sectorMcc` (Task 3); `categoryForMcc` (Task 4); `FoundRow.fileMcc`, `.sector`, `.aiMcc`, `MapRequest.sectors`, `{ m, mcc, cat }` (Task 7); `TxFormValues.mcc`, `.mccSource` (Task 5); `MccSource` (Task 2).
- Produces, in `src/domain/mcc-categories.ts`:
  - `type MccPick = { readonly mcc: string; readonly source: Exclude<MccSource, 'user'> }`
  - `pickMcc(row: { readonly kind: Kind; readonly description: string }, found: { readonly file?: string; readonly sector?: string; readonly history?: string; readonly ai?: string }, categories: readonly Category[]): MccPick | undefined`. `sector` is a code (from `sectorMcc`), not the text.
  - `chooseExpenseCategory(row: { readonly kind: Kind; readonly description: string; readonly plan?: { readonly mode: string } | null }, found: { readonly history?: string; readonly mcc?: string; readonly claude?: string }, categories: readonly Category[]): string | undefined` - spec §3 steps 1 to 5; income skips step 3; `undefined` leaves refund and Other to the caller.
  - `isCashWithdrawal(mcc: string | undefined): boolean`
- Produces elsewhere:
  - `ImportContext.history: (kind: Kind, description: string) => Promise<MerchantHistory>` (`knownMerchant` is gone).
  - `buildReview`'s context gains the same `history` and no longer reads the database itself.

- [ ] **Step 1: Write the failing domain tests**

In `src/domain/mcc-categories.test.ts`, extend the import:

```ts
import {
  businessTypesOf,
  categoryForMcc,
  chooseExpenseCategory,
  defaultCategoryForMcc,
  isCashWithdrawal,
  pickMcc,
} from './mcc-categories';
```

and append:

```ts
describe('pickMcc', () => {
  const ALL = [...CATEGORIES, builtin('cat.subscriptions'), builtin('cat.shopping')];
  const expense = (description: string) => ({ kind: 'expense' as const, description });

  it('takes the first source that has a listed code: file, sector, history, then Claude', () => {
    const all = { file: '5812', sector: '5411', history: '5499', ai: '5999' };
    expect(pickMcc(expense('Cafe'), all, ALL)).toEqual({ mcc: '5812', source: 'file' });
    expect(pickMcc(expense('Cafe'), { ...all, file: undefined }, ALL)).toEqual({
      mcc: '5411',
      source: 'sector',
    });
    expect(pickMcc(expense('Cafe'), { history: '5499', ai: '5999' }, ALL)).toEqual({
      mcc: '5499',
      source: 'history',
    });
    expect(pickMcc(expense('Cafe'), { ai: '5999' }, ALL)).toEqual({ mcc: '5999', source: 'ai' });
    expect(pickMcc(expense('Cafe'), { file: '9999', ai: '5999' }, ALL)).toEqual({
      mcc: '5999',
      source: 'ai',
    });
    expect(pickMcc(expense('Cafe'), {}, ALL)).toBeUndefined();
  });

  it('drops Claude’s code when it files the row somewhere a name rule says it is not (Review Focus 2)', () => {
    // Netflix is a subscription by name; 5411 would file it as groceries, and then spread through history.
    expect(pickMcc(expense('Netflix'), { ai: '5411' }, ALL)).toBeUndefined();
    expect(pickMcc(expense('Netflix'), { ai: '5968' }, ALL)).toEqual({ mcc: '5968', source: 'ai' });
    // A code from the file or the card company's sector is the document's word, and is kept.
    expect(pickMcc(expense('Netflix'), { sector: '5411' }, ALL)).toEqual({ mcc: '5411', source: 'sector' });
  });

  it('gives income none, whatever any source says', () => {
    expect(
      pickMcc({ kind: 'income', description: 'Cafe' }, { file: '5812', ai: '5812' }, ALL),
    ).toBeUndefined();
  });
});

describe('chooseExpenseCategory: the order of spec §3, one case per step', () => {
  const ALL = [
    ...CATEGORIES,
    builtin('cat.subscriptions'),
    builtin('cat.loans'),
    custom('c.coffee'),
    builtin('cat.salary', { kind: 'income' }),
  ];
  const expense = (description: string) => ({ kind: 'expense' as const, description });

  it('1. a well-known name beats the business type', () => {
    expect(chooseExpenseCategory(expense('Netflix'), { mcc: '5812' }, ALL)).toBe('cat.subscriptions');
  });

  it('2. the person’s own choice for this merchant beats the business type', () => {
    expect(chooseExpenseCategory(expense('Cafe'), { history: 'c.coffee', mcc: '5812' }, ALL)).toBe(
      'c.coffee',
    );
  });

  it('3. the business type beats the row’s own words and Claude', () => {
    expect(chooseExpenseCategory(expense('הלוואה מהבנק'), { mcc: '5812', claude: 'cat.travel' }, ALL)).toBe(
      'cat.dining',
    );
  });

  it('4. the row’s own words, then 5. Claude’s category, then nothing', () => {
    expect(chooseExpenseCategory(expense('הלוואה מהבנק'), { claude: 'cat.travel' }, ALL)).toBe('cat.loans');
    expect(chooseExpenseCategory(expense('Cafe'), { claude: 'cat.travel' }, ALL)).toBe('cat.travel');
    expect(chooseExpenseCategory(expense('Cafe'), {}, ALL)).toBeUndefined();
  });

  it('never takes a choice that is archived, missing, or of the other kind', () => {
    const archived = ALL.map((c) => (c.id === 'c.coffee' ? { ...c, isArchived: 1 as const } : c));
    expect(chooseExpenseCategory(expense('Cafe'), { history: 'c.coffee', mcc: '5812' }, archived)).toBe(
      'cat.dining',
    );
    expect(
      chooseExpenseCategory(expense('Cafe'), { history: 'c.gone', claude: 'cat.salary' }, ALL),
    ).toBeUndefined();
  });

  it('never maps income through the business type', () => {
    expect(
      chooseExpenseCategory({ kind: 'income', description: 'Cafe' }, { mcc: '5812' }, ALL),
    ).toBeUndefined();
    expect(
      chooseExpenseCategory({ kind: 'income', description: 'Pay' }, { history: 'cat.salary' }, ALL),
    ).toBe('cat.salary');
  });
});

describe('isCashWithdrawal', () => {
  it('is 6010 and 6011 only', () => {
    expect(isCashWithdrawal('6010')).toBe(true);
    expect(isCashWithdrawal('6011')).toBe(true);
    expect(isCashWithdrawal('6051')).toBe(false);
    expect(isCashWithdrawal(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test --project unit src/domain/mcc-categories.test.ts`
Expected: FAIL, `pickMcc`, `chooseExpenseCategory` and `isCashWithdrawal` are not exported.

- [ ] **Step 3: Write the three functions**

In `src/domain/mcc-categories.ts`, extend the imports:

```ts
import type { Category, MccSource } from '@/types/domain';
import type { Kind } from '@/types/money';

import { categoryFromText, knownCategory } from './import-categories';
import { isMcc } from './mcc';
import { MCC_CODES } from './mcc-codes';
```

and append:

```ts
/** A row's business type, and where it came from. The person's own ('user') is never picked here. */
export type MccPick = { readonly mcc: string; readonly source: Exclude<MccSource, 'user'> };

/**
 * An expense's business type: the first source with a code the list has -
 * the file's MCC column, the card company's sector (already a code, from
 * `sectorMcc`), the household's history, then Claude (spec §2).
 *
 * Claude's code is dropped when it would file the row somewhere a name rule
 * (`knownCategory`) says it is not: 5411 for "Netflix" would make history
 * spread "supermarket" to the next Netflix and its merchant-key siblings
 * (Review Focus 2). A code from the file or the sector is the document's
 * own word, and is kept. Income has none.
 */
export function pickMcc(
  row: { readonly kind: Kind; readonly description: string },
  found: {
    readonly file?: string;
    readonly sector?: string;
    readonly history?: string;
    readonly ai?: string;
  },
  categories: readonly Category[],
): MccPick | undefined {
  if (row.kind !== 'expense') return undefined;
  if (isMcc(found.file)) return { mcc: found.file, source: 'file' };
  if (isMcc(found.sector)) return { mcc: found.sector, source: 'sector' };
  if (isMcc(found.history)) return { mcc: found.history, source: 'history' };
  if (!isMcc(found.ai)) return undefined;
  const known = knownCategory(row, categories);
  if (known !== undefined && categoryForMcc(found.ai, categories) !== known) return undefined;
  return { mcc: found.ai, source: 'ai' };
}

/**
 * A row's category, in the order of spec §3:
 *  1. a well-known name (`knownCategory`) - narrower than a business type;
 *  2. the person's own choice for this merchant (`merchantHistory`);
 *  3. the business type (`categoryForMcc`) - an expense's only;
 *  4. the row's own words (`categoryFromText`);
 *  5. Claude's category.
 * Undefined leaves the refund and Other to the caller. Income runs the same
 * order without step 3. Only a live category of the row's kind is taken.
 */
export function chooseExpenseCategory(
  row: {
    readonly kind: Kind;
    readonly description: string;
    readonly plan?: { readonly mode: string } | null;
  },
  found: { readonly history?: string; readonly mcc?: string; readonly claude?: string },
  categories: readonly Category[],
): string | undefined {
  const usable = (id: string | undefined): string | undefined =>
    id !== undefined && categories.some((c) => c.id === id && c.kind === row.kind && c.isArchived === 0)
      ? id
      : undefined;
  return (
    knownCategory(row, categories) ??
    usable(found.history) ??
    (row.kind === 'expense' && found.mcc !== undefined ? categoryForMcc(found.mcc, categories) : undefined) ??
    categoryFromText(row, categories) ??
    usable(found.claude)
  );
}

/**
 * Cash taken out at a bank or an ATM. Not an expense in an import (the
 * user's ruling of 2026-10-09): the money is still the household's, now in
 * the wallet. The default table still files it, under Currency exchange,
 * for a row the person keeps.
 */
export function isCashWithdrawal(mcc: string | undefined): boolean {
  return mcc === '6010' || mcc === '6011';
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test --project unit src/domain/mcc-categories.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing import tests**

In `src/features/import/run-import.test.ts`, replace `knownMerchant` in `ctx` with a history (Shufersal is known, with its business type):

```ts
const ctx: ImportContext = {
  wire,
  base: 'ILS',
  known: new Set(['ILS', 'USD']),
  today: '2026-10-04' as LocalDate,
  anchorOf: () => '2026-10-04' as LocalDate,
  history: (kind, m) =>
    Promise.resolve(m === 'שופרסל' && kind === 'expense' ? { categoryId: 'c.mine', mcc: '5411' } : {}),
};
```

and append:

```ts
describe('a spreadsheet’s business types', () => {
  const sheet = (rows: (string | number | null)[][]): PreparedFile => ({
    kind: 'sheet',
    file: 0,
    name: 'max.xlsx',
    hash: 's',
    sheets: [{ name: 'Sheet1', rows, date1904: false }],
  });
  const header = ['תאריך עסקה', 'שם בית העסק', 'סכום עסקה', 'MCC', 'ענף'];

  it('asks only about expenses with no business type from the file, the sector or history - sending the sector as a hint', async () => {
    const { result, calls } = await run(
      [
        sheet([
          header,
          ['01/10/2026', 'Vet clinic', '100.00', '0742', null],
          ['02/10/2026', 'Cafe Landwer', '58.00', null, 'מסעדות'],
          ['03/10/2026', 'שופרסל', '120.50', null, null],
          ['04/10/2026', 'Mystery Shop', '20.00', null, 'שונות'],
          ['05/10/2026', 'Plain Shop', '30.00', null, null],
        ]),
      ],
      {
        map: [
          ok({
            mc: [
              { m: 'Mystery Shop', mcc: '5999', cat: null },
              { m: 'Plain Shop', mcc: '9999', cat: 'c1' },
            ],
          }),
        ],
      },
    );
    const asked = calls[0];
    expect(asked?.mode === 'map' && asked.merchants).toEqual(['Mystery Shop', 'Plain Shop']);
    expect(asked?.mode === 'map' && asked.sectors).toEqual(['שונות', '']);
    expect(result.rows.map((r) => [r.description, r.fileMcc, r.sector, r.aiMcc, r.categoryAlias])).toEqual([
      ['Vet clinic', '0742', undefined, undefined, null],
      ['Cafe Landwer', undefined, 'מסעדות', undefined, null],
      ['שופרסל', undefined, undefined, undefined, null],
      ['Mystery Shop', undefined, 'שונות', '5999', null],
      // A code the list does not have is dropped; its category answer is kept.
      ['Plain Shop', undefined, undefined, undefined, 'c1'],
    ]);
  });

  it('asks about income only when history does not place it, and never gives it a business type', async () => {
    const { result, calls } = await run(
      [
        sheet([
          ['תאריך', 'תיאור', 'חובה', 'זכות'],
          ['01/10/2026', 'Employer Ltd', null, '9000.00'],
        ]),
      ],
      { map: [ok({ mc: [{ m: 'Employer Ltd', mcc: '5812', cat: null }] })] },
    );
    expect(calls.map((c) => c.mode)).toEqual(['map']);
    expect(result.rows[0]).toMatchObject({ kind: 'income' });
    expect(result.rows[0]).not.toHaveProperty('aiMcc');
    // Sent no sectors at all: none was printed.
    expect(calls[0]?.mode === 'map' && calls[0]).not.toHaveProperty('sectors');
  });
});
```

In `src/features/import/review-items.test.ts`, extend the imports:

```ts
import { describe, expect, it } from 'vitest';

import { merchantHistory, putTransaction, type MerchantHistory } from '@/db/repos/transactions';
import { readRow, type FoundRow } from '@/domain/import-check';
import type { WireRow } from '@/domain/import-wire';
import { MONEY, wireRow } from '@/domain/test-factories';
import { defaultFormValues } from '@/domain/tx-form';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { Category, PaymentMethod, Profile } from '@/types/domain';
import type { IsoInstant, Kind, LocalDate } from '@/types/money';

import { applyBatch, buildReview, holderOfMethod, linkToCard, type ReviewItem } from './review-items';
```

and append:

```ts
describe('the review: business type and category', () => {
  const category = (id: string, kind: Kind = 'expense', over: Partial<Category> = {}): Category =>
    ({
      id,
      kind,
      icon: 'Circle',
      sortOrder: 0,
      isArchived: 0,
      source: 'builtin',
      nameKey: `categories:builtin.${id.slice(4)}`,
      createdAt: NOW,
      updatedAt: NOW,
      ...over,
    }) as Category;
  const CATEGORIES = [
    ...[
      'cat.dining',
      'cat.groceries',
      'cat.subscriptions',
      'cat.shopping',
      'cat.loans',
      'cat.currencyExchange',
      'cat.otherExpense',
    ].map((id) => category(id)),
    category('c.coffee', 'expense', { source: 'custom', name: 'Coffee' } as Partial<Category>),
    category('cat.refund', 'income'),
    category('cat.otherIncome', 'income'),
  ];
  const PROFILE = { id: 'p1', name: 'Dana' } as Profile;

  let rowId = 0;
  const found = (wire: Partial<WireRow>, extra: Partial<FoundRow> = {}): FoundRow => ({
    ...readRow(wireRow(wire), `r${String((rowId += 1))}`, {
      file: 0,
      base: 'ILS',
      known: new Set(['ILS']),
      anchor: TODAY,
      today: TODAY,
    }),
    ...extra,
  });

  const review = (
    rows: FoundRow[],
    history: (kind: Kind, d: string) => Promise<MerchantHistory> = () => Promise.resolve({}),
  ) =>
    buildReview(rows, {
      aliases: { categories: new Map([['c1', 'cat.groceries']]), methods: new Map() },
      categories: CATEGORIES,
      methods: [],
      profiles: [PROFILE],
      defaultProfileId: 'p1',
      defaultMethodId: '',
      base: 'ILS',
      today: TODAY,
      primeRate: '4.5',
      history,
    });
  /** Category, business type and its source, as the row will be saved ('' for none, as the form holds it). */
  const filed = (item: ReviewItem | undefined) => [
    item?.values?.categoryId,
    item?.values?.mcc,
    item?.values?.mccSource,
  ];

  it('files by the order of spec §3, one case per step', async () => {
    const items = await review(
      [
        // 1. A well-known name beats the business type - and a file's code is still kept.
        found({ m: 'Netflix' }, { fileMcc: '5411' }),
        // 2. The person's own choice for this merchant beats the business type.
        found({ m: 'Cafe Nero' }, { fileMcc: '5812' }),
        // 3. The business type.
        found({ m: 'Cafe Landwer' }, { fileMcc: '5812' }),
        // 4. The row's own words.
        found({ m: 'החזר הלוואה' }),
        // 5. Claude's category.
        found({ m: 'Something', cat: 'c1' }),
        // 6. Other.
        found({ m: 'Nothing known' }),
      ],
      (kind, d) => Promise.resolve(kind === 'expense' && d === 'Cafe Nero' ? { categoryId: 'c.coffee' } : {}),
    );
    expect(items.map(filed)).toEqual([
      ['cat.subscriptions', '5411', 'file'],
      ['c.coffee', '5812', 'file'],
      ['cat.dining', '5812', 'file'],
      ['cat.loans', '', ''],
      ['cat.groceries', '', ''],
      ['cat.otherExpense', '', ''],
    ]);
  });

  it('takes the sector, then history, then Claude, for the business type', async () => {
    const items = await review(
      [
        found({ m: 'A', sec: 'מסעדות' }),
        found({ m: 'B', mcc: '5999' }),
        found({ m: 'C', mcc: '5999', sec: 'שונות' }),
        // Claude's code for a name a rule knows, filing it elsewhere: dropped (Review Focus 2).
        found({ m: 'Netflix', mcc: '5411' }),
      ],
      (kind, d) => Promise.resolve(kind === 'expense' && d === 'B' ? { mcc: '5411' } : {}),
    );
    expect(items.map(filed)).toEqual([
      ['cat.dining', '5812', 'sector'],
      ['cat.groceries', '5411', 'history'],
      ['cat.shopping', '5999', 'ai'],
      ['cat.subscriptions', '', ''],
    ]);
  });

  it('gives income no business type, and keeps a refund a refund', async () => {
    const [refund] = await review([found({ m: 'Supermarket', a: '-50.00' }, { fileMcc: '5411' })]);
    expect(filed(refund)).toEqual(['cat.refund', '', '']);
  });

  it('reads history by the merchant printed another way, from the real walk', async () => {
    const handle: TestDb = freshDb();
    try {
      await putTransaction(handle.db, {
        id: 'w1',
        profileId: 'p1',
        kind: 'expense',
        categoryId: 'cat.dining',
        money: MONEY,
        date: TODAY,
        recurrence: { type: 'one_time' },
        seriesRootId: 'w1',
        note: 'WOLT *ORDER 8812',
        mcc: '5814',
        mccSource: 'ai',
        createdAt: NOW,
        updatedAt: NOW,
      });
      const [item] = await review([found({ m: 'Wolt order 1290' })], (kind, d) =>
        merchantHistory(handle.db, kind, d),
      );
      expect(filed(item)).toEqual(['cat.dining', '5814', 'history']);
    } finally {
      await handle.dispose();
    }
  });

  it('leaves a cash withdrawal out, saying why, whatever gave it 6011 - and never flags income (Review Focus 6)', async () => {
    const items = await review(
      [
        found({ m: 'משיכת מזומן', mcc: '6011' }),
        found({ m: 'כספומט', a: '200.00' }),
        found({ m: 'Bank cash', a: '300.00' }, { fileMcc: '6010' }),
        found({ m: 'משיכת מזומן', a: '-100.00', mcc: '6011' }),
      ],
      (kind, d) => Promise.resolve(kind === 'expense' && d === 'כספומט' ? { mcc: '6011' } : {}),
    );
    expect(items.map((i) => [i.flags.includes('cash_withdrawal'), i.ticked])).toEqual([
      [true, false],
      [true, false],
      [true, false],
      [false, true],
    ]);
    // Kept, it is an ordinary expense under Currency exchange, with its code.
    expect(filed(items[0])).toEqual(['cat.currencyExchange', '6011', 'ai']);
  });
});
```

Append to `src/features/import/import-sheet.test.tsx`, inside `describe('Smart import', ...)`:

```tsx
it('files a sheet by its sector, asks about the rest with the sector as a hint, and leaves a cash withdrawal out', async () => {
  writeSession(undefined);
  reader.calls = [];
  reader.answers = [
    {
      ok: true,
      usage,
      result: {
        mc: [
          { m: 'Mystery Shop', mcc: '5999', cat: null },
          { m: 'משיכת מזומן', mcc: '6011', cat: null },
        ],
      },
    },
  ];
  const onSaved = vi.fn<(date: LocalDate) => void>();
  const user = userEvent.setup();
  renderWithProviders(
    <ImportSheet
      target={{ mode: 'import' }}
      onOpenChange={() => undefined}
      onOpenRow={() => undefined}
      onOpenCard={() => undefined}
      profiles={[profile]}
      categories={[
        category('cat.dining', 'expense'),
        category('cat.shopping', 'expense'),
        category('cat.currencyExchange', 'expense'),
        category('cat.otherExpense', 'expense'),
        category('cat.salary', 'income'),
      ]}
      paymentMethods={[]}
      activeProfileId="p1"
      baseCurrency="ILS"
      today={'2026-09-15' as LocalDate}
      onSaved={onSaved}
    />,
  );

  const csv = [
    'תאריך עסקה,שם בית העסק,סכום עסקה,ענף',
    '03/09/2026,Cafe Landwer,58.00,מסעדות',
    '04/09/2026,Mystery Shop,20.00,שונות',
    '05/09/2026,משיכת מזומן,500.00,',
  ].join('\n');
  await user.upload(screen.getByTestId('import-input'), new File([csv], 'max.csv', { type: 'text/csv' }));
  await user.click(screen.getByRole('button', { name: 'Read 1 file' }));

  await screen.findByRole('button', { name: 'Ready (2)' });
  // One call, for the two merchants nothing placed, each with its sector.
  expect(reader.calls).toHaveLength(1);
  const asked = reader.calls[0];
  expect(asked?.mode === 'map' && [asked.merchants, asked.sectors]).toEqual([
    ['Mystery Shop', 'משיכת מזומן'],
    ['שונות', ''],
  ]);
  expect(screen.getByRole('button', { name: 'Check this (1)' })).toBeInTheDocument();
  expect(
    screen.getByText('Cash withdrawal: not counted as an expense. You can record it in the Cash tab.'),
  ).toBeInTheDocument();
  const withdrawal = screen.getByRole('checkbox', { name: 'Add משיכת מזומן' });
  expect(withdrawal).not.toBeChecked();

  // The person can still keep it.
  await user.click(withdrawal);
  await user.click(screen.getByTestId('import-add'));
  await waitFor(() => {
    expect(onSaved).toHaveBeenCalled();
  });
  const names = ['Cafe Landwer', 'Mystery Shop', 'משיכת מזומן'];
  const saved = (await db.transactions.toArray()).filter((t) => names.includes(t.note ?? ''));
  expect(
    saved
      .map((t) => [t.note, t.categoryId, t.mcc, t.mccSource])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ).toEqual([
    ['Cafe Landwer', 'cat.dining', '5812', 'sector'],
    ['Mystery Shop', 'cat.shopping', '5999', 'ai'],
    ['משיכת מזומן', 'cat.currencyExchange', '6011', 'ai'],
  ]);
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `pnpm test --project db src/features/import/run-import.test.ts src/features/import/review-items.test.ts` and `pnpm test --project dom src/features/import/import-sheet.test.tsx`
Expected: FAIL. `ImportContext` has no `history`, `buildReview` takes no `history`, no row gets a business type, and there is no `cash_withdrawal` flag.

- [ ] **Step 7: The flag and its copy**

In `src/domain/import-check.ts`, end the `Flag` union with the new flag:

```ts
  | 'whose_unknown'
  /** Cash taken out (6010, 6011): not an expense in an import. Left out until the person keeps it. */
  | 'cash_withdrawal';
```

and add `'cash_withdrawal',` at the end of the `BLOCKING` set.

In `src/i18n/locales/en/import.json`, `flag`, after `whose_unknown`:

```json
    "whose_unknown": "Choose whose this is.",
    "cash_withdrawal": "Cash withdrawal: not counted as an expense. You can record it in the Cash tab."
```

In `src/i18n/locales/he/import.json`, `flag`, after `whose_unknown`:

```json
    "whose_unknown": "צריך לבחור של מי זה.",
    "cash_withdrawal": "משיכת מזומן: לא נספרת כהוצאה. אפשר לרשום אותה בלשונית מזומן."
```

- [ ] **Step 8: Who is asked (`run-import.ts`)**

Add imports:

```ts
import type { MerchantHistory } from '@/db/repos/transactions';
```

(beside the other `@/` imports, in order), and:

```ts
import { isMcc } from '@/domain/mcc';
import { sectorMcc } from '@/domain/sector-mcc';
```

and change the money types import to `import type { Currency, Kind, LocalDate } from '@/types/money';`.

In `ImportContext`, replace `knownMerchant` with:

```ts
  /**
   * What the household's history says about a merchant (`merchantHistory`):
   * its category, and its business type. The caller memoises it per import.
   */
  readonly history: (kind: Kind, description: string) => Promise<MerchantHistory>;
```

In `readWorkbook`, pass the rows to `fromWireMap`:

```ts
map = fromWireMap(await askMap(sheet.rows, [], ctx, ask), sheet.rows);
```

and replace everything from `let merchantCats = new Map<string, string | null>();` to the end of `readWorkbook` (through its `return out;` and closing brace) with:

```ts
    /*
     * Merchants worth one cheap call, not one per row (spec point 9): an
     * expense with no business type from its file, its sector or its history,
     * and an income its history does not place. A sector the table does not
     * know goes along as a hint.
     */
    const unknown: string[] = [];
    const sectors: string[] = [];
    for (const description of new Set(read.rows.map((r) => r.description))) {
      if (description === '') continue;
      const rows = read.rows.filter((r) => r.description === description);
      if (await placed(rows, description, ctx)) continue;
      unknown.push(description);
      sectors.push((rows.find((r) => r.sector !== undefined)?.sector ?? '').slice(0, LIMITS.field));
    }
    let answers = new Map<string, { readonly mcc: string | null; readonly cat: string | null }>();
    if (unknown.length > 0) {
      const header = sheet.rows.slice(map.headerRow, map.headerRow + 3);
      const cats = await askCategories(
        header,
        unknown.slice(0, LIMITS.merchants),
        sectors.slice(0, LIMITS.merchants),
        ctx,
        ask,
      );
      answers = new Map(cats.map((m) => [m.m, m]));
    }
    out.push(
      ...read.rows.map((row) => {
        const answer = answers.get(row.description);
        const code = answer?.mcc;
        return {
          ...row,
          categoryAlias: answer?.cat ?? null,
          // Claude's business type, for an expense, when the list has it.
          ...(row.kind === 'expense' && isMcc(code) ? { aiMcc: code } : {}),
        };
      }),
    );
  }
  return out;
}

/** Whether history, the file or the sector already says what every row of this merchant needs. */
async function placed(rows: readonly FoundRow[], description: string, ctx: ImportContext): Promise<boolean> {
  for (const row of rows) {
    if (row.kind === 'income') {
      if ((await ctx.history('income', description)).categoryId === undefined) return false;
    } else if (
      row.fileMcc === undefined &&
      sectorMcc(row.sector ?? '') === undefined &&
      (await ctx.history('expense', description)).mcc === undefined
    ) {
      return false;
    }
  }
  return true;
}
```

(The block ends `readWorkbook` itself, then adds `placed` below it.)

Replace `askCategories`'s signature, request and return type:

```ts
async function askCategories(
  header: readonly (readonly Cell[])[],
  merchants: readonly string[],
  sectors: readonly string[],
  ctx: ImportContext,
  ask: (r: WireRequest) => Promise<unknown>,
): Promise<{ m: string; mcc: string | null; cat: string | null }[]> {
  const request: WireRequest = {
    mode: 'map',
    ctx: ctx.wire,
    rows: sampleRows(header),
    merchants,
    // Only when one was printed: an older function ignores the key either way.
    ...(sectors.some((sector) => sector !== '') ? { sectors } : {}),
    maxTokens: tokensForRows(10 + merchants.length / 2),
  };
```

(the rest of `askCategories` is unchanged).

- [ ] **Step 9: The order in review (`review-items.ts`)**

Replace the imports at the top:

```ts
import type { MerchantHistory } from '@/db/repos/transactions';
import { BLOCKING, withFlags, type Flag, type FoundRow } from '@/domain/import-check';
import { draftOf } from '@/domain/import-review';
import { chooseExpenseCategory, isCashWithdrawal, pickMcc } from '@/domain/mcc-categories';
import { sectorMcc } from '@/domain/sector-mcc';
import { txFormSchema, type TxFormValues } from '@/domain/tx-form';
import { categoriesFor } from '@/domain/tx-options';
import { SHARED_OWNER, type Category, type PaymentMethod, type Profile } from '@/types/domain';
import type { Currency, Kind, LocalDate, RateString } from '@/types/money';
```

(sorted as the lint rule wants; `db`, `categoryFromText` and `knownCategory` are no longer imported here).

Update the doc comment above `buildReview`: its first bullet becomes:

```ts
 *  - its business type: the file's MCC column, the card company's sector,
 *    the household's history, then the reader's (`pickMcc`); and its
 *    category, in the order of spec §3 (`chooseExpenseCategory`), then money
 *    back on a card is a refund, then Other;
 *  - a cash withdrawal (6010, 6011) waits unticked: not an expense here;
```

Add `history` to its context type:

```ts
    readonly primeRate: string;
    /** What history says about a merchant; memoised by the caller, shared with the reader. */
    readonly history: (kind: Kind, description: string) => Promise<MerchantHistory>;
```

Replace the start of the loop body, from `const fromHistory = ...` to the end of the `categoryId` expression:

```ts
const history = await ctx.history(row.kind, row.description);
const pick = pickMcc(
  row,
  {
    file: row.fileMcc,
    sector: row.sector === undefined ? undefined : sectorMcc(row.sector),
    history: history.mcc,
    ai: row.aiMcc,
  },
  ctx.categories,
);
const suggested = row.categoryAlias === null ? undefined : ctx.aliases.categories.get(row.categoryAlias);
const refund =
  row.kind === 'income' && row.wire.k === 'e' && ctx.categories.some((c) => c.id === REFUND_CATEGORY)
    ? REFUND_CATEGORY
    : undefined;
const categoryId =
  chooseExpenseCategory(
    row,
    { history: history.categoryId, mcc: pick?.mcc, claude: suggested },
    ctx.categories,
  ) ??
  refund ??
  otherOf(ctx.categories, row.kind) ??
  categoriesFor(ctx.categories, row.kind)[0]?.id ??
  '';
```

Then, right after `let values = draft?.values;`:

```ts
if (values !== undefined && pick !== undefined) {
  values = { ...values, mcc: pick.mcc, mccSource: pick.source };
}
// Cash taken out is not an expense here (spec point 14): kept only if the person ticks it.
if (row.kind === 'expense' && isCashWithdrawal(pick?.mcc)) found = withFlags(found, 'cash_withdrawal');
```

(`suggestedFits` is gone: `chooseExpenseCategory` only takes a live category of the row's kind.)

- [ ] **Step 10: One history per import (`import-sheet.tsx`)**

Change the transactions import to:

```ts
import {
  findCandidates,
  findOverrides,
  merchantHistory,
  type MerchantHistory,
} from '@/db/repos/transactions';
```

and the money types import to `import type { Currency, Kind, LocalDate } from '@/types/money';`.

In `read`, after the `wire` context is built, add:

```ts
// What history says about each merchant: looked up once per import, for the reader and the review.
const looked = new Map<string, Promise<MerchantHistory>>();
const history = (kind: Kind, description: string): Promise<MerchantHistory> => {
  const key = `${kind}\u0000${description}`;
  let answer = looked.get(key);
  if (answer === undefined) {
    answer = merchantHistory(db, kind, description).catch((): MerchantHistory => ({}));
    looked.set(key, answer);
  }
  return answer;
};
```

In the `runImport` context, replace the `knownMerchant` entry with `history,`. In the `buildReview` context, add `history,` after `primeRate: prime.primeRate,`.

- [ ] **Step 11: Run the tests to see them pass**

Run: `pnpm test --project db src/features/import` and `pnpm test --project dom src/features/import/import-sheet.test.tsx` and `pnpm test --project unit src/i18n`
Expected: PASS, every new test and every earlier one. The i18n test checks the Hebrew key mirrors the English one.

- [ ] **Step 12: Run the task gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all pass.

- [ ] **Step 13: Commit**

```bash
git add src/domain/mcc-categories.ts src/domain/mcc-categories.test.ts src/domain/import-check.ts src/features/import/run-import.ts src/features/import/run-import.test.ts src/features/import/review-items.ts src/features/import/review-items.test.ts src/features/import/import-sheet.tsx src/features/import/import-sheet.test.tsx src/i18n/locales/en/import.json src/i18n/locales/he/import.json
git commit -m "Smart import now files expenses by their business type, asks only about merchants it cannot place, and leaves cash withdrawals out unless kept" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: A typed expense: Claude names its business type, and the form's auto step fills it

Spec §2 step 4 ("A typed new expense"), §3 (the order for a typed expense), §4.1 ("The form's auto step ... also fills the business type when it's empty. It never replaces a `user` one."), §6 ("Offline, or signed out"), §7 "Edge Function". Spec points 6 and 10. Review Focus 2.

**Files:**

- Modify: `supabase/functions/categorize/index.ts`
- Modify: `src/services/supabase/categorize.ts`
- Modify: `src/app/account.ts` (`AccountController.suggestCategory`)
- Modify: `src/features/transaction/use-auto-category.ts` (rewritten)
- Modify: `src/features/transaction/transaction-sheet.tsx` (the hook's new arguments only; the visible row is Task 10)
- Test: `src/services/supabase/categorize.fn.test.ts` (new, db), `src/services/supabase/categorize.test.ts` (new, db), `src/features/transaction/use-auto-category.test.tsx` (rewritten, dom)

**The function's code list.** `categorize` imports `isMcc` from `../_shared/mcc-codes.ts`, the generated byte-for-byte copy of `src/domain/mcc-codes.ts`. Task 1's data test already holds that copy to `mcc.json` ("gives the app and the Edge Functions the same codes"), which is the spec's "repo test that reads both files". The list is never sent to the model: the tool asks for a 4-digit string, and the function keeps it only if `isMcc` knows it.

**What the auto step does now.** On a typing pause (and, for an edit, once when it opens):

1. It reads history (`merchantHistory`): the person's category for this merchant, and its business type.
2. The business type is filled only when the form's is empty or came from an automatic source (`replaceableMcc`); never over the person's own. On a typed name, a business type found nowhere asks Claude, through the one `categorize` call that also answers the category. A Claude code a name rule disagrees with is dropped (`pickMcc`, Review Focus 2).
3. The category follows spec §3 (`chooseExpenseCategory`): a well-known name, the person's choice, the business type, the name's own words, then Claude. It is set only while the person has not picked one by hand - an edit starts out theirs (spec point 10).
4. Opening an edit with no business type looks it up from history only. Claude is asked only when the name is typed or changed. A type that holds the category (a loan) still stops the name being looked at, as today.

**Interfaces:**

- Consumes: `merchantHistory`, `MerchantHistory` (Task 6); `pickMcc`, `chooseExpenseCategory`, `MccPick` (Task 8); `replaceableMcc`, `isMcc` (Task 1); `TxFormValues.mcc`, `.mccSource` (Task 5).
- Produces:
  - The `categorize` reply: `{ categoryId: string | null, mcc: string | null }` (`mcc` is `null` for income, for a code the list lacks, and for none).
  - `src/services/supabase/categorize.ts`: `type Suggestion = { readonly categoryId?: string; readonly mcc?: string }`; `suggestCategory(...)` returns `Promise<Suggestion>` (`{}` for no answer).
  - `AccountController.suggestCategory(name, kind, choices): Promise<Suggestion>`.
  - `useAutoCategory({ categories, translate, choose, chosenByPerson, currentMcc, chooseMcc, opening? })`, where:
    - `type FormMcc = { readonly code: string; readonly source: string }`, and `currentMcc: () => FormMcc`;
    - `chooseMcc: (pick: MccPick | undefined) => void` (`undefined` clears one the step put there);
    - `opening?: { readonly name: string; readonly kind: Kind }`;
    - it returns `{ status, nameChanged, choseManually, typeChosen, categoryByPerson }`, where `categoryByPerson(): boolean` says whether the category is the person's own (Task 10 reads it when a business type is picked).

- [ ] **Step 1: Write the failing function test**

Create `src/services/supabase/categorize.fn.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The categorize Edge Function (supabase/functions/categorize), run here with
 * its Deno import and environment stood in for. What matters: the category id
 * is one it was offered, and the business type is a code the list has, on an
 * expense, or null.
 */

vi.mock('npm:@supabase/server', () => ({
  createSupabaseContext: () => Promise.resolve({ data: { userClaims: { sub: 'u-alice' } }, error: null }),
}));

const PATH = '../../../supabase/functions/categorize/index.ts';
const load = async (): Promise<{ fetch: (req: Request) => Promise<Response> }> =>
  ((await import(/* @vite-ignore */ PATH)) as { default: { fetch: (req: Request) => Promise<Response> } })
    .default;

const request = (body: Record<string, unknown>): Request =>
  new Request('https://fn.example/categorize', {
    method: 'POST',
    headers: { origin: 'https://bookandry.com', authorization: 'Bearer user-jwt' },
    body: JSON.stringify({
      name: 'Cafe Nero',
      kind: 'expense',
      categories: [
        { id: 'c1', name: 'Eating out' },
        { id: 'c2', name: 'Shopping' },
      ],
      ...body,
    }),
  });

/** Claude answers with this tool input; the body it was sent is kept. */
let sent: string[];
const claude = (input: Record<string, unknown>): void => {
  sent = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: { body: string }) => {
      sent.push(init.body);
      return Promise.resolve(Response.json({ content: [{ type: 'tool_use', input }] }));
    }),
  );
};

beforeEach(() => {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => (name === 'ANTHROPIC_API_KEY' ? 'key' : undefined) },
  });
});

describe('categorize', () => {
  it('answers the category it was offered and a business type the list has', async () => {
    claude({ category_id: 'c1', mcc: '5812' });
    const response = await (await load()).fetch(request({}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ categoryId: 'c1', mcc: '5812' });
    // Asked for both, through one tool, without the code list.
    const body = JSON.parse(sent[0] ?? '{}') as { tools: { input_schema: { required: string[] } }[] };
    expect(body.tools[0]?.input_schema.required).toEqual(['category_id', 'mcc']);
    expect(sent[0]).not.toContain('0742');
  });

  it.each([
    ['a code the list lacks', { category_id: 'c1', mcc: '9999' }, {}],
    ['no code', { category_id: 'c1', mcc: '' }, {}],
    ['a code that is not four digits', { category_id: 'c1', mcc: 5812 }, {}],
    ['income', { category_id: 'c1', mcc: '5812' }, { kind: 'income' }],
  ])('answers null for the business type on %s', async (_what, input, body) => {
    claude(input);
    const response = await (await load()).fetch(request(body));
    expect(await response.json()).toEqual({ categoryId: 'c1', mcc: null });
  });

  it('still refuses a category it did not offer', async () => {
    claude({ category_id: 'c9', mcc: '5812' });
    expect(await (await (await load()).fetch(request({}))).json()).toEqual({ categoryId: null, mcc: '5812' });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test --project db src/services/supabase/categorize.fn.test.ts`
Expected: FAIL: the reply is `{ categoryId: 'c1' }` with no `mcc`, and the tool requires only `category_id`.

- [ ] **Step 3: The function**

In `supabase/functions/categorize/index.ts`:

Extend the header comment's "Answered:" sentence to: `Answered: one of the ids it was given, or null - Claude is made to choose through a tool whose input is an enum of exactly those ids, and the answer is checked against them anyway - and, for an expense, the business type (a 4-digit Merchant Category Code) checked against the code list this function bundles (../_shared/mcc-codes.ts, a copy of the app's), or null.`

Add the import below the first one:

```ts
import { createSupabaseContext } from 'npm:@supabase/server';

import { isMcc } from '../_shared/mcc-codes.ts';
```

Replace `choose` with:

```ts
type Answer = { categoryId: string | null; mcc: string | null };

async function choose(
  name: string,
  kind: 'income' | 'expense',
  choices: Choice[],
  key: string,
): Promise<Answer> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      system:
        "You sort entries in a household budgeting app used in Israel into the household's own categories. " +
        'Entries are short and may be in Hebrew or English: a product, a service, a shop, a brand, a bill. ' +
        'Pick the single category that fits best. Prefer a specific category over a general one ' +
        '(an AI tool subscription belongs in an AI or software category rather than a general subscriptions one, if there is one). ' +
        'Choose the "other" category only when nothing else reasonably fits. ' +
        'For an expense, also give the single most likely 4-digit merchant category code (MCC) of the business, ' +
        'or "" when unsure; for income, always "".',
      tools: [
        {
          name: 'choose_category',
          description: 'Record the category this entry belongs in, and its business type.',
          input_schema: {
            type: 'object',
            properties: {
              category_id: { type: 'string', enum: choices.map((c) => c.id) },
              mcc: {
                type: 'string',
                description: 'The 4-digit merchant category code (MCC) of the business, or "" when unsure.',
              },
            },
            required: ['category_id', 'mcc'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'choose_category' },
      messages: [
        {
          role: 'user',
          content:
            `This ${kind === 'expense' ? 'expense' : 'income'} was entered as: ${JSON.stringify(name)}\n\n` +
            `Categories (id: name):\n${choices.map((c) => `${c.id}: ${c.name}`).join('\n')}`,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`anthropic ${response.status}`);
  const message = (await response.json()) as {
    content?: { type: string; input?: { category_id?: unknown; mcc?: unknown } }[];
  };
  const input = message.content?.find((block) => block.type === 'tool_use')?.input;
  const picked = input?.category_id;
  const code = input?.mcc;
  return {
    categoryId: typeof picked === 'string' && choices.some((c) => c.id === picked) ? picked : null,
    // Checked, not trusted: a code the list has, on an expense; anything else is no answer.
    mcc: kind === 'expense' && isMcc(code) ? code : null,
  };
}
```

and in the handler:

```ts
    try {
      return Response.json(await choose(input.name, input.kind, input.choices, key), { headers });
    } catch {
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm test --project db src/services/supabase/categorize.fn.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing client test**

Create `src/services/supabase/categorize.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { suggestCategory } from './categorize';

const client = (answer: { data: unknown; error: unknown }) =>
  ({ functions: { invoke: vi.fn(() => Promise.resolve(answer)) } }) as unknown as SupabaseClient;
const CHOICES = [{ id: 'cat.dining', name: 'Dining' }];

describe('suggestCategory', () => {
  it('takes an offered category and a listed business type', async () => {
    const supabase = client({ data: { categoryId: 'cat.dining', mcc: '5812' }, error: null });
    expect(await suggestCategory(supabase, 'Cafe', 'expense', CHOICES)).toEqual({
      categoryId: 'cat.dining',
      mcc: '5812',
    });
  });

  it('drops what it did not offer, a code the list lacks, and any code on income', async () => {
    expect(
      await suggestCategory(
        client({ data: { categoryId: 'cat.gone', mcc: '9999' }, error: null }),
        'Cafe',
        'expense',
        CHOICES,
      ),
    ).toEqual({});
    expect(
      await suggestCategory(
        client({ data: { categoryId: 'cat.dining', mcc: '5812' }, error: null }),
        'Cafe',
        'income',
        CHOICES,
      ),
    ).toEqual({ categoryId: 'cat.dining' });
  });

  it('is no answer at all on an error, and reads a reply from before business types', async () => {
    expect(
      await suggestCategory(client({ data: null, error: new Error('x') }), 'Cafe', 'expense', CHOICES),
    ).toEqual({});
    expect(
      await suggestCategory(
        client({ data: { categoryId: 'cat.dining' }, error: null }),
        'Cafe',
        'expense',
        CHOICES,
      ),
    ).toEqual({ categoryId: 'cat.dining' });
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `pnpm test --project db src/services/supabase/categorize.test.ts`
Expected: FAIL: `suggestCategory` returns a string or undefined.

- [ ] **Step 7: The client and the account**

Replace the body of `src/services/supabase/categorize.ts` below the `CategoryChoice` type with:

```ts
/** What the guess came back with: a category it was offered, and an expense's business type. Either may be absent. */
export type Suggestion = { readonly categoryId?: string; readonly mcc?: string };

/**
 * Asks the `categorize` Edge Function (supabase/functions/categorize) which of
 * `choices` the typed `name` belongs in, and - for an expense - its business
 * type. Sent: that name and those category names, nothing else.
 *
 * `{}` for no answer, whatever the reason - offline, not set up, a name it
 * could not place: the person chooses, as they always could.
 */
export async function suggestCategory(
  supabase: SupabaseClient,
  name: string,
  kind: 'income' | 'expense',
  choices: readonly CategoryChoice[],
): Promise<Suggestion> {
  const result = await supabase.functions.invoke('categorize', {
    body: { name, kind, categories: choices },
  });
  if (result.error !== null) return {};
  // Checked, not trusted: only an id that was offered, and a code the list has, come back out.
  const data: unknown = result.data;
  const reply =
    typeof data === 'object' && data !== null ? (data as { categoryId?: unknown; mcc?: unknown }) : {};
  const id = reply.categoryId;
  const mcc = reply.mcc;
  return {
    ...(typeof id === 'string' && choices.some((c) => c.id === id) ? { categoryId: id } : {}),
    ...(kind === 'expense' && isMcc(mcc) ? { mcc } : {}),
  };
}
```

with the import at the top:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

import { isMcc } from '@/domain/mcc';
```

In `src/app/account.ts`, import the type beside `CategoryChoice`:

```ts
import type { CategoryChoice, Suggestion } from '@/services/supabase/categorize';
```

and change `suggestCategory`:

```ts
  /**
   * Which of `choices` the typed name belongs in, and an expense's business
   * type, by asking Claude through the account's server
   * (services/supabase/categorize.ts). Only while signed in - the server
   * answers nobody else - and `{}` whenever there is no answer: the person
   * chooses, as they always could.
   */
  async suggestCategory(name: string, kind: Kind, choices: readonly CategoryChoice[]): Promise<Suggestion> {
    if (this.view.status !== 'signed_in') return {};
    try {
      const { suggestCategory } = await import('@/services/supabase/categorize');
      return await suggestCategory(await getSupabase(), name, kind, choices);
    } catch {
      return {};
    }
  }
```

- [ ] **Step 8: Run it to see it pass**

Run: `pnpm test --project db src/services/supabase/categorize.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing hook tests**

Replace `src/features/transaction/use-auto-category.test.tsx` with:

```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MccPick } from '@/domain/mcc-categories';
import type { Suggestion } from '@/services/supabase/categorize';
import type { Category } from '@/types/domain';
import type { IsoInstant, Kind } from '@/types/money';

const history = vi.hoisted(() => ({ answer: {} as { categoryId?: string; mcc?: string } }));
const claude = vi.hoisted(() => ({
  suggestCategory:
    vi.fn<
      (name: string, kind: string, choices: readonly { id: string; name: string }[]) => Promise<Suggestion>
    >(),
}));

vi.mock('@/db/repos/transactions', () => ({
  merchantHistory: () => Promise.resolve(history.answer),
}));
vi.mock('@/app/account', () => ({ accountController: () => claude }));

const { useAutoCategory } = await import('./use-auto-category');
type FormMcc = { readonly code: string; readonly source: string };

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
const category = (id: string, kind: 'income' | 'expense' = 'expense', sortOrder = 0): Category => ({
  id,
  kind,
  icon: 'Circle',
  sortOrder,
  isArchived: 0,
  source: 'builtin',
  nameKey: id,
  createdAt: NOW,
  updatedAt: NOW,
});
const CATEGORIES = [
  category('cat.subscriptions', 'expense', 1),
  category('cat.aiSoftware', 'expense', 2),
  category('cat.loans', 'expense', 3),
  category('cat.dining', 'expense', 4),
  category('cat.salary', 'income'),
];

function setup(
  options: {
    chosenByPerson?: boolean;
    mcc?: FormMcc;
    opening?: { readonly name: string; readonly kind: Kind };
  } = {},
) {
  const choose = vi.fn<(id: string) => void>();
  let current: FormMcc = options.mcc ?? { code: '', source: '' };
  const chooseMcc = vi.fn((pick: MccPick | undefined) => {
    current = { code: pick?.mcc ?? '', source: pick?.source ?? '' };
  });
  const hook = renderHook(() =>
    useAutoCategory({
      categories: CATEGORIES,
      translate: (c) => c.id,
      choose,
      chosenByPerson: options.chosenByPerson ?? false,
      currentMcc: () => current,
      chooseMcc,
      ...(options.opening === undefined ? {} : { opening: options.opening }),
    }),
  );
  return { choose, chooseMcc, hook, mcc: () => current };
}

async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  history.answer = {};
  claude.suggestCategory.mockReset().mockResolvedValue({ categoryId: 'cat.aiSoftware', mcc: '7372' });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('choosing the category and the business type from the name', () => {
  it('asks once typing pauses, offering only that kind of category, and fills both in', async () => {
    const { choose, chooseMcc, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Claude', 'expense');
      hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();

    expect(claude.suggestCategory).toHaveBeenCalledTimes(1);
    expect(claude.suggestCategory).toHaveBeenCalledWith('Claude Max Plan', 'expense', [
      { id: 'cat.subscriptions', name: 'cat.subscriptions' },
      { id: 'cat.aiSoftware', name: 'cat.aiSoftware' },
      { id: 'cat.loans', name: 'cat.loans' },
      { id: 'cat.dining', name: 'cat.dining' },
    ]);
    expect(choose).toHaveBeenCalledWith('cat.aiSoftware');
    expect(chooseMcc).toHaveBeenCalledWith({ mcc: '7372', source: 'ai' });
    expect(hook.result.current.status).toBe('chosen');
  });

  it('goes by history without asking, when it has both the category and the business type', async () => {
    history.answer = { categoryId: 'cat.subscriptions', mcc: '5968' };
    const { choose, chooseMcc, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();

    expect(claude.suggestCategory).not.toHaveBeenCalled();
    expect(choose).toHaveBeenCalledWith('cat.subscriptions');
    expect(chooseMcc).toHaveBeenCalledWith({ mcc: '5968', source: 'history' });
  });

  it('asks Claude for the business type alone when history has only the category, which still wins', async () => {
    history.answer = { categoryId: 'cat.subscriptions' };
    const { choose, chooseMcc, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();

    expect(claude.suggestCategory).toHaveBeenCalledTimes(1);
    expect(choose).toHaveBeenCalledWith('cat.subscriptions');
    expect(chooseMcc).toHaveBeenCalledWith({ mcc: '7372', source: 'ai' });
  });

  it('files by the business type before Claude’s category', async () => {
    claude.suggestCategory.mockResolvedValue({ categoryId: 'cat.subscriptions', mcc: '5812' });
    const { choose, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Cafe Nero', 'expense');
    });
    await settle();
    expect(choose).toHaveBeenCalledWith('cat.dining');
  });

  it('drops a business type that a name rule says is wrong (Review Focus 2)', async () => {
    claude.suggestCategory.mockResolvedValue({ categoryId: 'cat.dining', mcc: '5411' });
    const { choose, chooseMcc, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Netflix', 'expense');
    });
    await settle();
    expect(choose).toHaveBeenCalledWith('cat.subscriptions');
    expect(chooseMcc).not.toHaveBeenCalledWith(expect.objectContaining({ mcc: '5411' }));
  });

  it('never replaces the person’s own business type, and files by it', async () => {
    const { choose, chooseMcc, hook } = setup({ mcc: { code: '5812', source: 'user' } });
    act(() => {
      hook.result.current.nameChanged('Somewhere new', 'expense');
    });
    await settle();
    expect(chooseMcc).not.toHaveBeenCalled();
    expect(claude.suggestCategory).not.toHaveBeenCalled();
    expect(choose).toHaveBeenCalledWith('cat.dining');
  });

  it('never overrides a category the person chose, even with an answer on its way, but still fills the business type', async () => {
    let answer: (s: Suggestion) => void = () => undefined;
    claude.suggestCategory.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const { choose, chooseMcc, hook } = setup();
    act(() => {
      hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();
    act(() => {
      hook.result.current.choseManually();
    });
    expect(hook.result.current.categoryByPerson()).toBe(true);
    await act(async () => {
      answer({ categoryId: 'cat.aiSoftware', mcc: '7372' });
      await Promise.resolve();
    });
    expect(choose).not.toHaveBeenCalled();

    act(() => {
      hook.result.current.nameChanged('Something else', 'expense');
    });
    await settle();
    expect(claude.suggestCategory).toHaveBeenCalledTimes(2);
    expect(choose).not.toHaveBeenCalled();
    expect(chooseMcc).toHaveBeenLastCalledWith({ mcc: '7372', source: 'ai' });
  });

  it('files a loan under Loans, and holds it there while it stays a loan', async () => {
    claude.suggestCategory.mockResolvedValue({ categoryId: 'cat.subscriptions' });
    const { choose, hook } = setup();
    act(() => {
      hook.result.current.typeChosen('cat.loans', 'Car loan', 'expense');
    });
    expect(choose).toHaveBeenLastCalledWith('cat.loans');
    expect(hook.result.current.status).toBe('chosen');

    // "Car loan" is still a loan: the name does not get a say.
    act(() => {
      hook.result.current.nameChanged('Car loan from the bank', 'expense');
    });
    await settle();
    expect(claude.suggestCategory).not.toHaveBeenCalled();

    // No longer a loan: the name is looked at again.
    act(() => {
      hook.result.current.typeChosen(undefined, 'Netflix', 'expense');
    });
    await settle();
    expect(choose).toHaveBeenLastCalledWith('cat.subscriptions');
  });

  it('never moves a category the person picked, for the type either', () => {
    const { choose, hook } = setup();
    act(() => {
      hook.result.current.choseManually();
      hook.result.current.typeChosen('cat.loans', '', 'expense');
    });
    expect(choose).not.toHaveBeenCalled();

    // Nor to a category that is not there to choose.
    const fresh = setup();
    act(() => {
      fresh.hook.result.current.typeChosen('cat.gone', '', 'expense');
    });
    expect(fresh.choose).not.toHaveBeenCalled();
  });

  it('takes nothing it was not offered, and looks for no business type on income', async () => {
    claude.suggestCategory.mockResolvedValue({ categoryId: 'cat.salary', mcc: '9999' });
    const adding = setup();
    act(() => {
      adding.hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();
    expect(adding.choose).not.toHaveBeenCalled();
    expect(adding.mcc()).toEqual({ code: '', source: '' });
    expect(adding.hook.result.current.status).toBe('idle');

    const income = setup();
    act(() => {
      income.hook.result.current.nameChanged('Refund from Amazon', 'income');
    });
    await settle();
    expect(income.chooseMcc).not.toHaveBeenCalled();
  });
});

describe('an edit', () => {
  it('opening one with no business type looks it up from history only, and leaves the category alone', async () => {
    history.answer = { categoryId: 'cat.subscriptions', mcc: '5812' };
    const { choose, chooseMcc } = setup({
      chosenByPerson: true,
      opening: { name: 'Cafe Nero', kind: 'expense' },
    });
    await settle();
    expect(chooseMcc).toHaveBeenCalledWith({ mcc: '5812', source: 'history' });
    expect(claude.suggestCategory).not.toHaveBeenCalled();
    expect(choose).not.toHaveBeenCalled();
  });

  it('opening one that has a business type, or is income, looks nothing up', async () => {
    history.answer = { mcc: '5812' };
    const kept = setup({
      chosenByPerson: true,
      mcc: { code: '5411', source: 'ai' },
      opening: { name: 'Cafe', kind: 'expense' },
    });
    const income = setup({ chosenByPerson: true, opening: { name: 'Cafe', kind: 'income' } });
    await settle();
    expect(kept.chooseMcc).not.toHaveBeenCalled();
    expect(income.chooseMcc).not.toHaveBeenCalled();
  });

  it('typing a new name asks Claude for the business type only', async () => {
    const { choose, chooseMcc, hook } = setup({ chosenByPerson: true });
    act(() => {
      hook.result.current.nameChanged('Claude Max Plan', 'expense');
    });
    await settle();
    expect(claude.suggestCategory).toHaveBeenCalledTimes(1);
    expect(choose).not.toHaveBeenCalled();
    expect(chooseMcc).toHaveBeenCalledWith({ mcc: '7372', source: 'ai' });
    expect(hook.result.current.status).toBe('idle');
  });
});
```

- [ ] **Step 10: Run them to see them fail**

Run: `pnpm test --project dom src/features/transaction/use-auto-category.test.tsx`
Expected: FAIL. The hook takes no `currentMcc`, `chooseMcc` or `opening`, and never fills a business type.

- [ ] **Step 11: Rewrite the hook**

Replace `src/features/transaction/use-auto-category.ts` with:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { accountController } from '@/app/account';
import { db } from '@/db/db';
import { merchantHistory, type MerchantHistory } from '@/db/repos/transactions';
import { replaceableMcc } from '@/domain/mcc';
import { chooseExpenseCategory, pickMcc, type MccPick } from '@/domain/mcc-categories';
import { categoriesFor } from '@/domain/tx-options';
import type { Suggestion } from '@/services/supabase/categorize';
import type { Category } from '@/types/domain';
import type { Kind } from '@/types/money';

/** How long typing has to pause before the name is looked at. */
const SETTLE_MS = 600;

export type AutoCategoryStatus = 'idle' | 'thinking' | 'chosen';

/** The form's business type as it stands: its code ('' for none) and where it came from ('' for none). */
export type FormMcc = { readonly code: string; readonly source: string };

/** Whether the auto step may fill the business type: there is none, or the step put it there itself. */
const fillable = (current: FormMcc): boolean => current.code === '' || replaceableMcc(current.source);

/**
 * The category and the business type, chosen from what the person typed
 * ("Claude Max Plan").
 *
 * First what history says about that name - where they filed it, and its
 * business type - which costs nothing; then, for what history leaves open,
 * Claude, through the account (account.ts `suggestCategory`): one call
 * answers both. The category follows spec §3 (`chooseExpenseCategory`), only
 * among their categories of that kind, and only until they choose one
 * themselves: from then on the field is theirs, and a guess arriving late
 * never overrides it. An edit starts out theirs, so opening a saved row never
 * moves it.
 *
 * The business type is filled while it is empty or was put there by this
 * step, an import or history - never over the person's own. Opening an edit
 * that has none looks it up from history only: Claude is asked when the name
 * is typed, never just because a row was opened.
 *
 * Driven from the change handlers, not an effect on the name: the guess is an
 * answer to typing, and an effect would also put a setState in its body.
 */
export function useAutoCategory({
  categories,
  translate,
  choose,
  chosenByPerson,
  currentMcc,
  chooseMcc,
  opening,
}: {
  readonly categories: readonly Category[];
  readonly translate: (category: Category) => string;
  readonly choose: (categoryId: string) => void;
  readonly chosenByPerson: boolean;
  /** The form's business type, read when an answer arrives: the person may have picked one meanwhile. */
  readonly currentMcc: () => FormMcc;
  /** Sets the business type found, or clears one this step put there that the new name no longer has. */
  readonly chooseMcc: (pick: MccPick | undefined) => void;
  /** An edit being opened: its name and kind, to look its business type up from history once. */
  readonly opening?: { readonly name: string; readonly kind: Kind };
}) {
  const [status, setStatus] = useState<AutoCategoryStatus>('idle');
  const manual = useRef(chosenByPerson);
  /** Held by the transaction's type (`typeChosen`) rather than guessed from the name. */
  const byType = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Each look-up's number: only the latest one may set the fields. */
  const latest = useRef(0);
  const opened = useRef(false);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  // An edit with no business type: history may know it. Free and local; Claude is not asked.
  useEffect(() => {
    if (opening === undefined || opened.current) return;
    opened.current = true;
    if (opening.kind !== 'expense' || currentMcc().code !== '') return;
    const ask = ++latest.current;
    void merchantHistory(db, opening.kind, opening.name).then(
      (history) => {
        if (ask !== latest.current || currentMcc().code !== '') return;
        const pick = pickMcc(
          { kind: opening.kind, description: opening.name },
          { history: history.mcc },
          categories,
        );
        if (pick !== undefined) chooseMcc(pick);
      },
      () => undefined,
    );
  }, [opening, currentMcc, chooseMcc, categories]);

  const run = useCallback(
    async (name: string, kind: Kind): Promise<void> => {
      const ask = ++latest.current;
      const wantsCategory = !manual.current;
      const wantsMcc = kind === 'expense' && fillable(currentMcc());
      if (!wantsCategory && !wantsMcc) return;
      if (wantsCategory) setStatus('thinking');
      const choices = categoriesFor(categories, kind);
      const fits = (id: string | undefined): id is string =>
        id !== undefined && choices.some((category) => category.id === id);
      const row = { kind, description: name };

      const history = await merchantHistory(db, kind, name).catch((): MerchantHistory => ({}));
      let pick = wantsMcc ? pickMcc(row, { history: history.mcc }, categories) : undefined;
      // The business type the category goes by: the one found, or the person's own.
      const typeOf = (): string | undefined => (wantsMcc ? pick?.mcc : currentMcc().code || undefined);
      let id = chooseExpenseCategory(row, { history: history.categoryId, mcc: typeOf() }, categories);
      if ((wantsCategory && !fits(id)) || (wantsMcc && pick === undefined)) {
        const answer = await suggest(
          name,
          kind,
          choices.map((category) => ({ id: category.id, name: translate(category) })),
        );
        if (wantsMcc && pick === undefined) pick = pickMcc(row, { ai: answer.mcc }, categories);
        id = chooseExpenseCategory(
          row,
          { history: history.categoryId, mcc: typeOf(), claude: answer.categoryId },
          categories,
        );
      }
      if (ask !== latest.current) return;
      // Never over a business type the person picked while this was on its way.
      if (wantsMcc && fillable(currentMcc())) chooseMcc(pick);
      if (!wantsCategory || manual.current) return;
      if (fits(id)) {
        choose(id);
        setStatus('chosen');
      } else {
        setStatus('idle');
      }
    },
    [categories, translate, choose, chooseMcc, currentMcc],
  );

  /** The name changed: look at it once typing pauses. */
  const nameChanged = useCallback(
    (name: string, kind: Kind): void => {
      clearTimeout(timer.current);
      // A type that says what it is (a loan) holds the category, and the name is not looked at.
      if (byType.current) return;
      if (manual.current && !(kind === 'expense' && fillable(currentMcc()))) return;
      latest.current++;
      if (name.trim().length < 2) {
        if (!manual.current) setStatus('idle');
        return;
      }
      timer.current = setTimeout(() => {
        void run(name.trim(), kind);
      }, SETTLE_MS);
    },
    [run, currentMcc],
  );

  /** The person picked a category themselves: it is theirs from here on. */
  const choseManually = useCallback((): void => {
    manual.current = true;
    clearTimeout(timer.current);
    latest.current++;
    setStatus('idle');
  }, []);

  /** Whether the category is the person's own: picked by hand, or an edit's. Read in event handlers. */
  const categoryByPerson = useCallback((): boolean => manual.current, []);

  /**
   * The type says what it is (a loan is Loans): taken over any guess from the
   * name, and held while that type stays chosen - "Car loan" is still a loan -
   * but never over the person's own pick, and only if they still have it.
   * Undefined lets go, and the name is looked at again.
   */
  const typeChosen = useCallback(
    (categoryId: string | undefined, name: string, kind: Kind): void => {
      if (manual.current) return;
      if (categoryId === undefined) {
        if (!byType.current) return;
        byType.current = false;
        nameChanged(name, kind);
        return;
      }
      if (!categories.some((category) => category.id === categoryId && category.isArchived === 0)) return;
      byType.current = true;
      clearTimeout(timer.current);
      latest.current++;
      choose(categoryId);
      setStatus('chosen');
    },
    [categories, choose, nameChanged],
  );

  return { status, nameChanged, choseManually, typeChosen, categoryByPerson };
}

/** Claude's answer through the account, or none: offline, signed out, a build without accounts. */
async function suggest(
  name: string,
  kind: Kind,
  choices: readonly { id: string; name: string }[],
): Promise<Suggestion> {
  try {
    return await accountController().suggestCategory(name, kind, choices);
  } catch {
    return {};
  }
}
```

- [ ] **Step 12: Wire the hook into the form**

In `src/features/transaction/transaction-sheet.tsx`, import the pick type beside the other domain imports:

```ts
import type { MccPick } from '@/domain/mcc-categories';
```

and replace the `useAutoCategory({...})` call with:

```ts
// An edit's name and kind, to look its business type up from history once it opens.
const opening = useMemo(
  () => (editing === undefined ? undefined : { name: initial.note, kind: initial.kind }),
  [editing, initial.note, initial.kind],
);

const auto = useAutoCategory({
  categories,
  translate: translateCategory,
  choose: useCallback(
    (id: string) => {
      setValue('categoryId', id, { shouldValidate: true });
    },
    [setValue],
  ),
  chosenByPerson: editing !== undefined,
  currentMcc: useCallback(
    () => ({ code: form.getValues('mcc') ?? '', source: form.getValues('mccSource') ?? '' }),
    [form],
  ),
  chooseMcc: useCallback(
    (pick: MccPick | undefined) => {
      setValue('mcc', pick?.mcc ?? '');
      setValue('mccSource', pick?.source ?? '');
    },
    [setValue],
  ),
  ...(opening === undefined ? {} : { opening }),
});
```

(`useMemo` and `useCallback` are already imported in this file.)

- [ ] **Step 13: Run the tests to see them pass**

Run: `pnpm test --project dom src/features/transaction` and `pnpm test --project db src/services/supabase/categorize.test.ts src/services/supabase/categorize.fn.test.ts`
Expected: PASS, including the existing transaction-sheet tests (signed out, `suggestCategory` answers `{}`).

- [ ] **Step 14: Run the task gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm gate:pci`
Expected: all pass.

- [ ] **Step 15: Commit**

```bash
git add supabase/functions/categorize/index.ts src/services/supabase/categorize.ts src/services/supabase/categorize.test.ts src/services/supabase/categorize.fn.test.ts src/app/account.ts src/features/transaction/use-auto-category.ts src/features/transaction/use-auto-category.test.tsx src/features/transaction/transaction-sheet.tsx
git commit -m "A typed expense now gets its business type too, from history or from Claude, and its category follows it unless the person chose one" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: The "Business type" row and its searchable pop-out

Spec §4.1, §6 ("Hebrew search"), §7 "Form (dom)". Review Focus 4.

**Files:**

- Create: `src/features/business-type/business-type-picker.tsx` (`BusinessTypePopout`, `BusinessTypeField`)
- Modify: `src/features/transaction/transaction-sheet.tsx` (the row, under Category; `pickBusinessType`)
- Modify: `src/i18n/locales/en/common.json`, `src/i18n/locales/he/common.json` (a new `businessType` section)
- Test: `src/features/business-type/business-type-picker.test.tsx` (dom), `src/features/transaction/transaction-sheet.test.tsx` (dom)

**The pop-out.** The shared pop-out plumbing: Base UI `Popover` with a `PopoverTitle` (so the pop-out is a dialog named "Business type"), and the cmdk `Command` list the pickers use (`PickerField`), with `shouldFilter={false}`: the list is filtered by `searchMcc`, which matches the code, English or Hebrew, and folds case, niqqud and final letters. It lists every code by name in the UI language, with its code beside it. `BusinessTypePopout` takes its trigger, so Task 11's "Add a business type" button opens the same pop-out.

**Copy (added by this task):**

| Key                   | en                        | he                  |
| --------------------- | ------------------------- | ------------------- |
| `businessType.label`  | Business type             | סוג עסק             |
| `businessType.notSet` | Not set                   | לא נקבע             |
| `businessType.search` | Search by name or code    | חיפוש לפי שם או קוד |
| `businessType.empty`  | No business type matches. | אין סוג עסק מתאים.  |
| `businessType.clear`  | Clear                     | ניקוי               |

**Interfaces:**

- Consumes: `useMccList` (Task 1), `searchMcc`, `mccName` (Task 1), `categoryForMcc` (Task 4), `auto.categoryByPerson()` and the hook wiring (Task 9), `TxFormValues.mcc`, `.mccSource` (Task 5).
- Produces, in `src/features/business-type/business-type-picker.tsx`:
  - `BusinessTypePopout(props: { readonly trigger: ReactElement; readonly value: string; readonly onSelect: (code: string) => void; readonly onClear?: () => void })`
  - `BusinessTypeField(props: { readonly value: string; readonly onChange: (code: string) => void; readonly labelledBy: string })` - `onChange('')` is "Clear".

- [ ] **Step 1: Add the copy**

In `src/i18n/locales/en/common.json`, add a top-level section after `categoryPop`:

```json
  "businessType": {
    "label": "Business type",
    "notSet": "Not set",
    "search": "Search by name or code",
    "empty": "No business type matches.",
    "clear": "Clear"
  },
```

In `src/i18n/locales/he/common.json`, in the same place:

```json
  "businessType": {
    "label": "סוג עסק",
    "notSet": "לא נקבע",
    "search": "חיפוש לפי שם או קוד",
    "empty": "אין סוג עסק מתאים.",
    "clear": "ניקוי"
  },
```

- [ ] **Step 2: Write the failing picker test**

Create `src/features/business-type/business-type-picker.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { BusinessTypeField } from './business-type-picker';

function Harness({ label = 'Business type' }: { readonly label?: string }) {
  const [value, setValue] = useState('');
  return (
    <>
      <span id="label">{label}</span>
      <BusinessTypeField value={value} onChange={setValue} labelledBy="label" />
      <output data-testid="value">{value}</output>
    </>
  );
}

beforeEach(() => {
  // The list (cmdk) measures itself; jsdom has nothing to measure with.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});

describe('the business type field, in English', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('says "Not set", finds a type by name or code in a named pop-out, and clears it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const field = await screen.findByRole('button', { name: 'Business type Not set' });

    await user.click(field);
    const popout = await screen.findByRole('dialog', { name: 'Business type' });
    await user.type(within(popout).getByPlaceholderText('Search by name or code'), 'restaurant');
    await user.click(within(popout).getByRole('option', { name: /^Restaurant/ }));
    expect(screen.getByTestId('value')).toHaveTextContent('5812');
    expect(screen.getByRole('button', { name: 'Business type Restaurant' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Business type Restaurant' }));
    const again = await screen.findByRole('dialog', { name: 'Business type' });
    await user.type(within(again).getByPlaceholderText('Search by name or code'), '0742');
    expect(within(again).getAllByRole('option')).toHaveLength(1);
    await user.click(within(again).getByRole('button', { name: 'Clear' }));
    expect(screen.getByTestId('value')).toBeEmptyDOMElement();
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(await screen.findByRole('button', { name: 'Business type Not set' }));
    const popout = await screen.findByRole('dialog', { name: 'Business type' });
    await user.type(within(popout).getByPlaceholderText('Search by name or code'), 'zzzz');
    expect(within(popout).getByText('No business type matches.')).toBeInTheDocument();
  });
});

describe('the business type field, in Hebrew', () => {
  beforeAll(async () => {
    await initTestI18n('he');
  });
  afterAll(async () => {
    await initTestI18n('en');
  });

  it('names types in Hebrew and finds them typed with or without final letters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness label="סוג עסק" />);
    await user.click(await screen.findByRole('button', { name: 'סוג עסק לא נקבע' }));
    const popout = await screen.findByRole('dialog', { name: 'סוג עסק' });
    await user.type(within(popout).getByPlaceholderText('חיפוש לפי שם או קוד'), 'מרכולימ');
    await user.click(within(popout).getByRole('option', { name: /^מרכולים וסופרמרקטים/ }));
    expect(screen.getByTestId('value')).toHaveTextContent('5411');
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm test --project dom src/features/business-type/business-type-picker.test.tsx`
Expected: FAIL, `./business-type-picker` does not exist.

- [ ] **Step 4: Write the picker**

Create `src/features/business-type/business-type-picker.tsx`:

```tsx
import { cn } from 'cn';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useId, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { mccName, searchMcc } from '@/domain/mcc';

import { useMccList } from './use-mcc-list';

/**
 * Every business type, by name, in a searchable pop-out: the shared pop-out
 * plumbing (Popover, named by its title) around the pickers' cmdk list. The
 * list is filtered here (`searchMcc`), not by cmdk: a type is found by its
 * code, its English or its Hebrew, ignoring case, niqqud and final letters.
 *
 * Its trigger is the caller's: the form's field, or a category's "Add a
 * business type" button.
 */
export function BusinessTypePopout({
  trigger,
  value,
  onSelect,
  onClear,
}: {
  readonly trigger: ReactElement;
  readonly value: string;
  readonly onSelect: (code: string) => void;
  /** Offered when given and a type is chosen. */
  readonly onClear?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const list = useMccList();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const found = useMemo(
    () => (list === undefined ? [] : searchMcc(list, query, i18n.language)),
    [list, query, i18n.language],
  );
  const hebrew = i18n.language.startsWith('he');

  const close = (): void => {
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else close();
      }}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent className="w-(--anchor-width) min-w-72 gap-0 p-0" align="start">
        <PopoverTitle className="px-3 pt-3 pb-1">{t('businessType.label')}</PopoverTitle>
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={t('businessType.search')} />
          <CommandList>
            {list === undefined ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('a11y.loading')}</p>
            ) : (
              <CommandEmpty>{t('businessType.empty')}</CommandEmpty>
            )}
            <CommandGroup>
              {found.map((entry) => (
                <CommandItem
                  key={entry.code}
                  value={entry.code}
                  onSelect={() => {
                    onSelect(entry.code);
                    close();
                  }}
                  className="min-h-11 gap-2"
                >
                  <span className="truncate">{hebrew ? entry.he : entry.en}</span>
                  <span className="ms-auto shrink-0 text-xs text-muted-foreground tabular-nums" dir="ltr">
                    {entry.code}
                  </span>
                  {entry.code === value ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {onClear === undefined || value === '' ? null : (
          <div className="border-t border-border p-1">
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full"
              onClick={() => {
                onClear();
                close();
              }}
            >
              {t('businessType.clear')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The form's "Business type" row: the type's name, or "Not set". Shows the
 * code itself until the names have loaded. `onChange('')` clears it.
 */
export function BusinessTypeField({
  value,
  onChange,
  labelledBy,
}: {
  readonly value: string;
  readonly onChange: (code: string) => void;
  readonly labelledBy: string;
}) {
  const { t, i18n } = useTranslation();
  const list = useMccList();
  const valueId = useId();
  const name =
    value === ''
      ? t('businessType.notSet')
      : ((list === undefined ? undefined : mccName(list, value, i18n.language)) ?? value);

  return (
    <BusinessTypePopout
      value={value}
      onSelect={onChange}
      onClear={() => {
        onChange('');
      }}
      trigger={
        <Button
          type="button"
          variant="outline"
          // Both ids, as PickerField does: the label alone would never say which type is chosen.
          aria-labelledby={`${labelledBy} ${valueId}`}
          className="h-11 w-full justify-between gap-2 px-3 font-normal"
        >
          <span id={valueId} className={cn('truncate', value === '' && 'text-muted-foreground')}>
            {name}
          </span>
          {/* A vertical chevron is non-directional: no rtl flip, by design. */}
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      }
    />
  );
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `pnpm test --project dom src/features/business-type/business-type-picker.test.tsx`
Expected: PASS.

- [ ] **Step 6: Write the failing form tests**

Append to `src/features/transaction/transaction-sheet.test.tsx`:

```tsx
describe('the business type row', () => {
  const dining: Category = {
    ...groceries,
    id: 'cat.dining',
    nameKey: 'categories:builtin.dining',
    sortOrder: 1,
  };
  const salary: Category = {
    ...groceries,
    id: 'cat.salary',
    kind: 'income',
    nameKey: 'categories:builtin.salary',
  };

  function openForm() {
    const onSaved = vi.fn();
    renderWithProviders(
      <TransactionSheet
        target={{ mode: 'add', kind: 'expense' }}
        onOpenChange={() => undefined}
        profiles={[profile]}
        categories={[groceries, dining, salary]}
        paymentMethods={[]}
        activeProfileId="p1"
        baseCurrency="ILS"
        today={TODAY}
        onSaved={onSaved}
      />,
    );
    return { onSaved, user: userEvent.setup() };
  }

  async function pickType(
    user: ReturnType<typeof userEvent.setup>,
    current: string,
    query: string,
    name: RegExp,
  ) {
    await user.click(screen.getByRole('button', { name: `Business type ${current}` }));
    const popout = await screen.findByRole('dialog', { name: 'Business type' });
    await user.type(within(popout).getByPlaceholderText('Search by name or code'), query);
    await user.click(within(popout).getByRole('option', { name }));
  }

  async function amount(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByLabelText('Amount'));
    await user.paste('58');
  }

  it('is shown for an expense only', async () => {
    const { user } = openForm();
    expect(await screen.findByRole('button', { name: 'Business type Not set' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Income' }));
    expect(screen.queryByRole('button', { name: /^Business type/ })).toBeNull();
  });

  it('moves the category to the type’s when the category was not picked by hand, and saves it as the person’s', async () => {
    const { user, onSaved } = openForm();
    await amount(user);
    await pickType(user, 'Not set', 'restaurant', /^Restaurant/);
    expect(screen.getByRole('combobox', { name: /Category/ })).toHaveTextContent('Eating out');
    await user.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const [saved] = await db.transactions.toArray();
    expect(saved).toMatchObject({ categoryId: 'cat.dining', mcc: '5812', mccSource: 'user' });
  });

  it('leaves a category the person picked by hand', async () => {
    const { user } = openForm();
    await user.click(screen.getByRole('combobox', { name: /Category/ }));
    await user.click(await screen.findByRole('option', { name: /Groceries/ }));
    await pickType(user, 'Not set', 'restaurant', /^Restaurant/);
    expect(screen.getByRole('combobox', { name: /Category/ })).toHaveTextContent('Groceries');
  });

  it('clears', async () => {
    const { user, onSaved } = openForm();
    await amount(user);
    await pickType(user, 'Not set', '5812', /^Restaurant/);
    await user.click(screen.getByRole('button', { name: 'Business type Restaurant' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Business type' })).getByRole('button', {
        name: 'Clear',
      }),
    );
    expect(screen.getByRole('button', { name: 'Business type Not set' })).toBeInTheDocument();
    await user.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect((await db.transactions.toArray())[0]).not.toHaveProperty('mcc');
  });

  it('is not saved on an expense switched to income before saving (Review Focus 4)', async () => {
    const { user, onSaved } = openForm();
    await amount(user);
    await pickType(user, 'Not set', 'restaurant', /^Restaurant/);
    await user.click(screen.getByRole('radio', { name: 'Income' }));
    await user.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const [saved] = await db.transactions.toArray();
    expect(saved?.kind).toBe('income');
    expect(saved).not.toHaveProperty('mcc');
    expect(saved).not.toHaveProperty('mccSource');
  });

  it('reads in Hebrew', async () => {
    await initTestI18n('he');
    try {
      const { user } = openForm();
      await user.click(await screen.findByRole('button', { name: 'סוג עסק לא נקבע' }));
      const popout = await screen.findByRole('dialog', { name: 'סוג עסק' });
      await user.type(within(popout).getByPlaceholderText('חיפוש לפי שם או קוד'), 'מסעדות');
      await user.click(within(popout).getByRole('option', { name: /^מסעדות/ }));
      expect(screen.getByRole('button', { name: 'סוג עסק מסעדות' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /קטגוריה/ })).toHaveTextContent('אוכל בחוץ');
    } finally {
      await initTestI18n('en');
    }
  });
});
```

(`Category` is already imported in this file; `within` and `waitFor` too.)

- [ ] **Step 7: Run them to see them fail**

Run: `pnpm test --project dom src/features/transaction/transaction-sheet.test.tsx -t "business type row"`
Expected: FAIL, there is no "Business type" row.

- [ ] **Step 8: Put the row in the form**

In `src/features/transaction/transaction-sheet.tsx`, change the Task 9 import to:

```ts
import { categoryForMcc, type MccPick } from '@/domain/mcc-categories';
```

and add, before `import { MethodForm } from '@/features/cards/method-editor';`:

```ts
import { BusinessTypeField } from '@/features/business-type/business-type-picker';
```

Beside the other ids (`const categoryId = useId();`), add:

```ts
const businessTypeId = useId();
```

After the `auto` hook, add:

```ts
/**
 * The person picked a business type, or cleared it. A pick is theirs
 * ('user': the auto step never replaces it), and the category follows it -
 * unless the person picked the category too, or this is an edit, whose
 * category is theirs (spec point 10).
 */
const pickBusinessType = (code: string): void => {
  setValue('mcc', code);
  setValue('mccSource', code === '' ? '' : 'user');
  if (code === '' || auto.categoryByPerson()) return;
  const id = categoryForMcc(code, categories);
  if (id !== undefined) setValue('categoryId', id, { shouldValidate: true });
};
```

Right after the Category block (the `<div className="space-y-1.5">` that holds the `categoryId` `Controller` and its error), add:

```tsx
{
  values.kind === 'expense' ? (
    <div className="space-y-1.5">
      <Label id={businessTypeId}>{t('businessType.label')}</Label>
      <BusinessTypeField value={values.mcc ?? ''} onChange={pickBusinessType} labelledBy={businessTypeId} />
    </div>
  ) : null;
}
```

- [ ] **Step 9: Run them to see them pass**

Run: `pnpm test --project dom src/features/transaction src/features/business-type` and `pnpm test --project unit src/i18n`
Expected: PASS, the new tests and every earlier one; the i18n test checks the Hebrew section mirrors the English one.

- [ ] **Step 10: Run the task gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm gate:rtl`
Expected: all pass (`ms-auto`, not `ml-auto`).

- [ ] **Step 11: Commit**

```bash
git add src/features/business-type/business-type-picker.tsx src/features/business-type/business-type-picker.test.tsx src/features/transaction/transaction-sheet.tsx src/features/transaction/transaction-sheet.test.tsx src/i18n/locales/en/common.json src/i18n/locales/he/common.json
git commit -m "An expense's business type can now be seen, searched for and changed in the form, in English and Hebrew" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Business types per category, in Settings

Spec §4.2, §6 ("Deleted and archived rows"), §7 "Categories (dom)". Spec points 11 and 12. Review Focus 3.

**Files:**

- Create: `src/db/business-types.ts` (`moveBusinessType`, `returnBusinessType`, `pastExpensesFor`, `movePastExpenses`)
- Create: `src/features/settings/business-types-sheet.tsx` (`BusinessTypesSheet`)
- Modify: `src/features/settings/categories-screen.tsx` (a "Business types" button on each expense category's row; the sheet)
- Modify: `src/i18n/locales/en/categories.json`, `src/i18n/locales/he/categories.json` (a new `businessTypes` section)
- Test: `src/db/business-types.test.ts` (db), `src/features/settings/business-types-sheet.test.tsx` (dom)

**The flow.** A category's sheet lists its business types: the table's (`businessTypesOf(...).defaults`), then the ones moved in, each of those with "Return to default". "Add a business type" opens Task 10's pop-out. Picking a code:

1. writes it to this category's `mccs` and takes it out of every other category's, in one Dexie transaction (`moveBusinessType`), and says which category the code filed under before (`categoryForMcc` before the move);
2. counts the live expenses with that code still filed under that old category (`pastExpensesFor`). Only when there are some, it asks once: "Move the N past expenses with this business type here too?";
3. "Move them" re-files exactly those series rows - never an override (spec point 11) - in one `undoableWrite`, with an Undo toast.

"Return to default" takes the code out of `mccs`; past rows are left alone. An archived category's moves stop applying (Task 4), and its sheet says so.

**Copy (added by this task; the spec's lines are verbatim):**

| Key                                          | en                                                                                                   | he                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `businessTypes.open`                         | Business types                                                                                       | סוגי עסק                                                                        |
| `businessTypes.title`                        | Business types: {{name}}                                                                             | סוגי עסק: {{name}}                                                              |
| `businessTypes.body`                         | Expenses with these business types are filed here, unless you filed the business somewhere yourself. | הוצאות מסוגי העסק האלה מתויקות כאן, אלא אם תייקתם את בית העסק במקום אחר בעצמכם. |
| `businessTypes.archived`                     | This category is archived, so meanwhile these business types are filed by default.                   | הקטגוריה בארכיון, ולכן בינתיים סוגי העסק האלה מתויקים לפי ברירת המחדל.          |
| `businessTypes.none`                         | No business types yet.                                                                               | אין עדיין סוגי עסק.                                                             |
| `businessTypes.add`                          | Add a business type                                                                                  | הוספת סוג עסק                                                                   |
| `businessTypes.more_one` / `_two` / `_other` | and {{count}} more                                                                                   | ועוד {{count}}                                                                  |
| `businessTypes.moved`                        | Moved here                                                                                           | הועבר לכאן                                                                      |
| `businessTypes.returnDefault`                | Return to default                                                                                    | החזרה לברירת המחדל                                                              |
| `businessTypes.movePast_one`                 | Move the 1 past expense with this business type here too?                                            | להעביר לכאן גם את ההוצאה הקודמת מסוג זה?                                        |
| `businessTypes.movePast_two`                 | (en has no `_two`)                                                                                   | להעביר לכאן גם את שתי ההוצאות הקודמות מסוג זה?                                  |
| `businessTypes.movePast_other`               | Move the {{count}} past expenses with this business type here too?                                   | להעביר לכאן גם את {{count}} ההוצאות הקודמות מסוג זה?                            |
| `businessTypes.movePastYes`                  | Move them                                                                                            | להעביר                                                                          |
| `businessTypes.movePastNo`                   | Not now                                                                                              | לא עכשיו                                                                        |
| `businessTypes.movedPast_one`                | Moved 1 expense                                                                                      | הוצאה אחת הועברה                                                                |
| `businessTypes.movedPast_two`                | (en has no `_two`)                                                                                   | שתי הוצאות הועברו                                                               |
| `businessTypes.movedPast_other`              | Moved {{count}} expenses                                                                             | {{count}} הוצאות הועברו                                                         |

**Interfaces:**

- Consumes: `Category.mccs` (Task 2); `categoryForMcc`, `businessTypesOf` (Task 4); `isMcc`, `mccName` (Task 1); `useMccList` (Task 1); `BusinessTypePopout` (Task 10); `undoableWrite`, `UndoableAction` (`src/db/occurrence-actions.ts`).
- Produces, in `src/db/business-types.ts`:
  - `moveBusinessType(db: BookandryDB, code: string, toId: string, now: IsoInstant): Promise<{ readonly from: string | undefined }>`
  - `returnBusinessType(db: BookandryDB, code: string, categoryId: string, now: IsoInstant): Promise<void>`
  - `pastExpensesFor(db: BookandryDB, code: string, fromId: string): Promise<string[]>`
  - `movePastExpenses(db: BookandryDB, ids: readonly string[], toId: string, now: IsoInstant): Promise<UndoableAction>`
- Produces `BusinessTypesSheet(props: { readonly category: Category | undefined; readonly categories: readonly Category[]; readonly onOpenChange: (open: boolean) => void })`.

- [ ] **Step 1: Write the failing repository tests**

Create `src/db/business-types.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildSeedCategories } from '@/db/seed';
import { d, modify, MONEY } from '@/domain/test-factories';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { Category, Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { moveBusinessType, movePastExpenses, pastExpensesFor, returnBusinessType } from './business-types';
import { materialize } from './materialize';

const NOW = '2026-10-09T10:00:00.000Z' as IsoInstant;
const LATER = '2026-10-09T11:00:00.000Z' as IsoInstant;
const UNDONE = '2026-10-09T12:00:00.000Z' as IsoInstant;

let handle: TestDb;
beforeEach(async () => {
  handle = freshDb();
  await handle.db.categories.bulkPut([
    ...buildSeedCategories(NOW),
    { ...custom('c.coffee'), mccs: [] },
    { ...custom('c.lunch'), mccs: ['5812', '5814'] },
  ]);
});
afterEach(async () => {
  await handle.dispose();
});

function custom(id: string): Category {
  return {
    id,
    kind: 'expense',
    icon: 'Circle',
    sortOrder: 50,
    isArchived: 0,
    source: 'custom',
    name: id,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const expense = (id: string, over: Partial<Transaction> = {}) =>
  materialize({
    id,
    profileId: 'p1',
    kind: 'expense',
    categoryId: 'c.lunch',
    money: MONEY,
    recurrence: { type: 'one_time' },
    date: d('2026-10-01'),
    mcc: '5812',
    mccSource: 'ai',
    seriesRootId: id,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  });

describe('moving a business type into a category', () => {
  it('writes it there and takes it out of every other category, and says where it filed before', async () => {
    expect(await moveBusinessType(handle.db, '5812', 'c.coffee', LATER)).toEqual({ from: 'c.lunch' });
    expect((await handle.db.categories.get('c.coffee'))?.mccs).toEqual(['5812']);
    expect((await handle.db.categories.get('c.lunch'))?.mccs).toEqual(['5814']);
    // Untouched categories keep their stamp.
    expect((await handle.db.categories.get('cat.groceries'))?.updatedAt).toBe(NOW);
  });

  it('files a code nobody moved under its default before, and refuses what is not a listed code or an expense category', async () => {
    expect(await moveBusinessType(handle.db, '5411', 'c.coffee', LATER)).toEqual({ from: 'cat.groceries' });
    await expect(moveBusinessType(handle.db, '9999', 'c.coffee', LATER)).rejects.toThrow();
    await expect(moveBusinessType(handle.db, '5411', 'cat.salary', LATER)).rejects.toThrow();
  });

  it('returns one to the default, leaving past rows alone', async () => {
    await handle.db.transactions.put(expense('t1'));
    await returnBusinessType(handle.db, '5812', 'c.lunch', LATER);
    expect((await handle.db.categories.get('c.lunch'))?.mccs).toEqual(['5814']);
    expect((await handle.db.transactions.get('t1'))?.categoryId).toBe('c.lunch');
  });
});

describe('moving past expenses (Review Focus 3)', () => {
  it('takes only live expenses with this business type still filed where the old mapping put them', async () => {
    await handle.db.transactions.bulkPut([
      expense('moves'),
      // Filed elsewhere by hand: the person's choice stays.
      expense('by-hand', { categoryId: 'cat.dining' }),
      // Deleted.
      expense('deleted', { deletedAt: NOW }),
      // Another business type.
      expense('other-type', { mcc: '5814' }),
    ]);
    expect(await pastExpensesFor(handle.db, '5812', 'c.lunch')).toEqual(['moves']);
  });

  it('moves the series row, never an occurrence’s own category, and Undo puts back exactly what it moved', async () => {
    const series = expense('rent', { recurrence: { type: 'monthly', dayOfMonth: 1 }, date: d('2026-08-01') });
    const own = { ...modify('rent', d('2026-09-01'), { categoryId: 'cat.groceries' }), id: 'o1' };
    await handle.db.transactions.bulkPut([series, expense('one')]);
    await handle.db.overrides.put(own);
    const before = await handle.db.transactions.get('rent');

    const ids = await pastExpensesFor(handle.db, '5812', 'c.lunch');
    expect(ids.sort()).toEqual(['one', 'rent']);
    const undoable = await movePastExpenses(handle.db, ids, 'c.coffee', LATER);
    expect((await handle.db.transactions.get('rent'))?.categoryId).toBe('c.coffee');
    expect(await handle.db.overrides.get('o1')).toEqual(own);

    await undoable.undo(UNDONE);
    expect(await handle.db.transactions.get('rent')).toEqual({ ...before, updatedAt: UNDONE });
    expect((await handle.db.transactions.get('one'))?.categoryId).toBe('c.lunch');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test --project db src/db/business-types.test.ts`
Expected: FAIL, `./business-types` does not exist.

- [ ] **Step 3: Write `src/db/business-types.ts`**

```ts
import { isMcc } from '@/domain/mcc';
import { categoryForMcc } from '@/domain/mcc-categories';
import type { IsoInstant } from '@/types/money';

import type { BookandryDB } from './db';
import { undoableWrite, type UndoableAction } from './occurrence-actions';

/**
 * The person's moves of business types between categories (spec §4.2).
 *
 * A move lives on the category it went INTO (`Category.mccs`); the default
 * table is never written. Every write spreads the stored row, so a field a
 * later build added survives it.
 */

/**
 * Move `code` into the expense category `toId`: added to its `mccs`, and
 * taken out of every other category's, in one transaction - so no moment, on
 * this device or a synced one, has two categories claiming it. Returns the
 * category it filed under just before, for the past-expenses question.
 */
export async function moveBusinessType(
  db: BookandryDB,
  code: string,
  toId: string,
  now: IsoInstant,
): Promise<{ readonly from: string | undefined }> {
  if (!isMcc(code)) throw new Error(`Not a business type: ${code}`);
  return db.transaction('rw', db.categories, async () => {
    const all = await db.categories.toArray();
    const target = all.find((c) => c.id === toId);
    if (target?.kind !== 'expense') throw new Error(`No expense category ${toId}`);
    const from = categoryForMcc(code, all);
    for (const category of all) {
      if (category.id === toId || category.mccs?.includes(code) !== true) continue;
      await db.categories.put({
        ...category,
        mccs: category.mccs.filter((c) => c !== code),
        updatedAt: now,
      });
    }
    if (target.mccs?.includes(code) !== true) {
      await db.categories.put({ ...target, mccs: [...(target.mccs ?? []), code], updatedAt: now });
    }
    return { from };
  });
}

/** "Return to default": `code` out of this category's moves. Past rows are left where they are. */
export async function returnBusinessType(
  db: BookandryDB,
  code: string,
  categoryId: string,
  now: IsoInstant,
): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const category = await db.categories.get(categoryId);
    if (category?.mccs?.includes(code) !== true) return;
    await db.categories.put({ ...category, mccs: category.mccs.filter((c) => c !== code), updatedAt: now });
  });
}

/**
 * What "move past expenses" would move: live expenses with this business
 * type still filed where its old mapping put them. A row the person filed
 * somewhere else, a deleted row and income are not (Review Focus 3).
 */
export async function pastExpensesFor(db: BookandryDB, code: string, fromId: string): Promise<string[]> {
  const rows = await db.transactions.where('categoryId').equals(fromId).toArray();
  return rows.filter((t) => t.isDeleted === 0 && t.kind === 'expense' && t.mcc === code).map((t) => t.id);
}

/**
 * Re-file those rows, in one undoable write. The series rows only: an
 * override that gave one occurrence its own category is the person's edit,
 * and stays (spec point 11).
 */
export async function movePastExpenses(
  db: BookandryDB,
  ids: readonly string[],
  toId: string,
  now: IsoInstant,
): Promise<UndoableAction> {
  return undoableWrite(db, [{ table: 'transactions', ids }], async () => {
    for (const id of ids) {
      const row = await db.transactions.get(id);
      if (row !== undefined) await db.transactions.put({ ...row, categoryId: toId, updatedAt: now });
    }
  });
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test --project db src/db/business-types.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the copy**

In `src/i18n/locales/en/categories.json`, add a top-level section after `manage`:

```json
  "businessTypes": {
    "open": "Business types",
    "title": "Business types: {{name}}",
    "body": "Expenses with these business types are filed here, unless you filed the business somewhere yourself.",
    "archived": "This category is archived, so meanwhile these business types are filed by default.",
    "none": "No business types yet.",
    "add": "Add a business type",
    "more_one": "and {{count}} more",
    "more_other": "and {{count}} more",
    "moved": "Moved here",
    "returnDefault": "Return to default",
    "movePast_one": "Move the 1 past expense with this business type here too?",
    "movePast_other": "Move the {{count}} past expenses with this business type here too?",
    "movePastYes": "Move them",
    "movePastNo": "Not now",
    "movedPast_one": "Moved 1 expense",
    "movedPast_other": "Moved {{count}} expenses"
  },
```

In `src/i18n/locales/he/categories.json`, in the same place:

```json
  "businessTypes": {
    "open": "סוגי עסק",
    "title": "סוגי עסק: {{name}}",
    "body": "הוצאות מסוגי העסק האלה מתויקות כאן, אלא אם תייקתם את בית העסק במקום אחר בעצמכם.",
    "archived": "הקטגוריה בארכיון, ולכן בינתיים סוגי העסק האלה מתויקים לפי ברירת המחדל.",
    "none": "אין עדיין סוגי עסק.",
    "add": "הוספת סוג עסק",
    "more_one": "ועוד {{count}}",
    "more_two": "ועוד {{count}}",
    "more_other": "ועוד {{count}}",
    "moved": "הועבר לכאן",
    "returnDefault": "החזרה לברירת המחדל",
    "movePast_one": "להעביר לכאן גם את ההוצאה הקודמת מסוג זה?",
    "movePast_two": "להעביר לכאן גם את שתי ההוצאות הקודמות מסוג זה?",
    "movePast_other": "להעביר לכאן גם את {{count}} ההוצאות הקודמות מסוג זה?",
    "movePastYes": "להעביר",
    "movePastNo": "לא עכשיו",
    "movedPast_one": "הוצאה אחת הועברה",
    "movedPast_two": "שתי הוצאות הועברו",
    "movedPast_other": "{{count}} הוצאות הועברו"
  },
```

- [ ] **Step 6: Write the failing screen tests**

Create `src/features/settings/business-types-sheet.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db/db';
import { materialize } from '@/db/materialize';
import { buildSeedCategories } from '@/db/seed';
import { d, MONEY } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Category, Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

const toasts = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) as Mock & { error: Mock },
}));
vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal<object>()), ...toasts }));

const { CategoriesScreen } = await import('./categories-screen');

const NOW = '2026-10-01T10:00:00.000Z' as IsoInstant;
const custom = (id: string, name: string, over: Partial<Category> = {}): Category =>
  ({
    id,
    kind: 'expense',
    icon: 'Circle',
    sortOrder: 50,
    isArchived: 0,
    source: 'custom',
    name,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  }) as Category;
const expense = (id: string, over: Partial<Transaction> = {}) =>
  materialize({
    id,
    profileId: 'p1',
    kind: 'expense',
    categoryId: 'cat.dining',
    money: MONEY,
    recurrence: { type: 'one_time' },
    date: d('2026-09-01'),
    mcc: '5812',
    mccSource: 'ai',
    seriesRootId: id,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  });

beforeEach(async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
  toasts.toast.mockClear();
  await db.categories.clear();
  await db.transactions.clear();
  await db.categories.bulkPut([...buildSeedCategories(NOW), custom('c.coffee', 'Coffee')]);
});

async function openTypes(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: `Business types: ${name}` }));
  return screen.findByRole('dialog', { name: `Business types: ${name}` });
}

async function add(
  user: ReturnType<typeof userEvent.setup>,
  sheet: HTMLElement,
  query: string,
  option: RegExp,
) {
  await user.click(within(sheet).getByRole('button', { name: 'Add a business type' }));
  const popout = await screen.findByRole('dialog', { name: 'Business type' });
  await user.type(within(popout).getByPlaceholderText('Search by name or code'), query);
  await user.click(within(popout).getByRole('option', { name: option }));
}

describe('business types per category', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('lists a category’s business types, the first 8 and the rest on request', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategoriesScreen />);
    const dining = await openTypes(user, 'Eating out');
    expect(within(dining).getByText('Restaurant')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    const other = await openTypes(user, 'Other');
    const more = within(other).getByRole('button', { name: /^and \d+ more$/ });
    const shown = within(other).getAllByRole('listitem').length;
    expect(shown).toBe(8);
    await user.click(more);
    expect(within(other).getAllByRole('listitem').length).toBeGreaterThan(8);
  });

  it('adding a business type moves it out of the category it was in', async () => {
    await db.categories.put(custom('c.lunch', 'Lunch', { mccs: ['5812'] }));
    const user = userEvent.setup();
    renderWithProviders(<CategoriesScreen />);
    const sheet = await openTypes(user, 'Coffee');
    await add(user, sheet, 'restaurant', /^Restaurant/);

    await waitFor(async () => {
      expect((await db.categories.get('c.coffee'))?.mccs).toEqual(['5812']);
    });
    expect((await db.categories.get('c.lunch'))?.mccs).toEqual([]);
    // Nothing was filed under it before, so nothing is asked.
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('moves exactly the past expenses the old mapping filed, after asking, and Undo restores them', async () => {
    await db.transactions.bulkPut([
      expense('moves'),
      expense('by-hand', { categoryId: 'cat.groceries' }),
      expense('deleted', { deletedAt: NOW }),
      expense('other-type', { mcc: '5814' }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<CategoriesScreen />);
    const sheet = await openTypes(user, 'Coffee');
    await add(user, sheet, '5812', /^Restaurant/);

    const question = await screen.findByRole('alertdialog', {
      name: 'Move the 1 past expense with this business type here too?',
    });
    await user.click(within(question).getByRole('button', { name: 'Move them' }));
    await waitFor(async () => {
      expect((await db.transactions.get('moves'))?.categoryId).toBe('c.coffee');
    });
    expect((await db.transactions.get('by-hand'))?.categoryId).toBe('cat.groceries');
    expect((await db.transactions.get('deleted'))?.categoryId).toBe('cat.dining');
    expect((await db.transactions.get('other-type'))?.categoryId).toBe('cat.dining');

    const [message, options] = toasts.toast.mock.lastCall as [string, { action: { onClick: () => void } }];
    expect(message).toBe('Moved 1 expense');
    options.action.onClick();
    await waitFor(async () => {
      expect((await db.transactions.get('moves'))?.categoryId).toBe('cat.dining');
    });
  });

  it('"Return to default" gives a moved type back to its default category', async () => {
    await db.categories.put(custom('c.coffee', 'Coffee', { mccs: ['5812'] }));
    const user = userEvent.setup();
    renderWithProviders(<CategoriesScreen />);
    const sheet = await openTypes(user, 'Coffee');
    await user.click(within(sheet).getByRole('button', { name: 'Return to default: Restaurant' }));
    await waitFor(async () => {
      expect((await db.categories.get('c.coffee'))?.mccs).toEqual([]);
    });
    expect(within(sheet).getByText('No business types yet.')).toBeInTheDocument();
  });

  it('says when a category is archived, and offers business types on expense categories only', async () => {
    await db.categories.put(custom('c.coffee', 'Coffee', { mccs: ['5812'], isArchived: 1 }));
    const user = userEvent.setup();
    renderWithProviders(<CategoriesScreen />);
    const sheet = await openTypes(user, 'Coffee');
    expect(
      within(sheet).getByText(
        'This category is archived, so meanwhile these business types are filed by default.',
      ),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('radio', { name: 'Income' }));
    expect(screen.queryByRole('button', { name: /^Business types:/ })).toBeNull();
  });
});

describe('business types per category, in Hebrew', () => {
  beforeAll(async () => {
    await initTestI18n('he');
  });
  afterAll(async () => {
    await initTestI18n('en');
  });

  it('adds one in Hebrew', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategoriesScreen />);
    await user.click(await screen.findByRole('button', { name: 'סוגי עסק: Coffee' }));
    const sheet = await screen.findByRole('dialog', { name: 'סוגי עסק: Coffee' });
    await user.click(within(sheet).getByRole('button', { name: 'הוספת סוג עסק' }));
    const popout = await screen.findByRole('dialog', { name: 'סוג עסק' });
    await user.type(within(popout).getByPlaceholderText('חיפוש לפי שם או קוד'), 'מאפיות');
    await user.click(within(popout).getByRole('option', { name: /^מאפיות/ }));
    await waitFor(async () => {
      expect((await db.categories.get('c.coffee'))?.mccs).toEqual(['5462']);
    });
    expect(within(sheet).getByText('מאפיות')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run them to see them fail**

Run: `pnpm test --project dom src/features/settings/business-types-sheet.test.tsx`
Expected: FAIL: there is no "Business types" button.

- [ ] **Step 8: Write the sheet**

Create `src/features/settings/business-types-sheet.tsx`:

```tsx
import { Plus, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { db } from '@/db/db';
import { moveBusinessType, movePastExpenses, pastExpensesFor, returnBusinessType } from '@/db/business-types';
import { mccName } from '@/domain/mcc';
import { businessTypesOf } from '@/domain/mcc-categories';
import { BusinessTypePopout } from '@/features/business-type/business-type-picker';
import { useMccList } from '@/features/business-type/use-mcc-list';
import { categoryDisplayName } from '@/i18n/category-name';
import { systemClock } from '@/lib/clock';
import type { Category } from '@/types/domain';

/** How many business types show before "and N more". */
const SHOWN = 8;

/**
 * A category's business types (spec §4.2): the ones the default table files
 * here, then the ones the person moved in, each of those with "Return to
 * default". Adding one moves it here from wherever it was, then offers once
 * to move the past expenses its old category holds.
 */
export function BusinessTypesSheet({
  category,
  categories,
  onOpenChange,
}: {
  readonly category: Category | undefined;
  readonly categories: readonly Category[];
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation(['categories', 'common']);
  const list = useMccList();
  const [expanded, setExpanded] = useState(false);
  const [asking, setAsking] = useState<{ readonly ids: readonly string[] } | undefined>(undefined);

  const name = category === undefined ? '' : categoryDisplayName(category, t);
  const types = category === undefined ? { defaults: [], moved: [] } : businessTypesOf(category, categories);
  const rows = [
    ...types.defaults.map((code) => ({ code, moved: false })),
    ...types.moved.map((code) => ({ code, moved: true })),
  ];
  const shown = expanded ? rows : rows.slice(0, SHOWN);
  const nameOf = (code: string): string =>
    list === undefined ? code : (mccName(list, code, i18n.language) ?? code);

  const failed = (): void => {
    toast.error(t('common:tx.toastFailed'));
  };

  const add = async (code: string): Promise<void> => {
    if (category === undefined) return;
    try {
      const { from } = await moveBusinessType(db, code, category.id, systemClock.nowIso());
      if (from === undefined || from === category.id) return;
      const ids = await pastExpensesFor(db, code, from);
      if (ids.length > 0) setAsking({ ids });
    } catch {
      failed();
    }
  };

  const movePast = async (ids: readonly string[]): Promise<void> => {
    if (category === undefined) return;
    try {
      const undoable = await movePastExpenses(db, ids, category.id, systemClock.nowIso());
      toast(t('categories:businessTypes.movedPast', { count: ids.length }), {
        action: {
          label: t('common:action.undo'),
          onClick: () => {
            void undoable.undo(systemClock.nowIso()).catch(failed);
          },
        },
      });
    } catch {
      failed();
    }
  };

  return (
    <Sheet
      open={category !== undefined}
      onOpenChange={(open) => {
        if (!open) setExpanded(false);
        onOpenChange(open);
      }}
    >
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('categories:businessTypes.title', { name })}</SheetTitle>
          <SheetDescription>{t('categories:businessTypes.body')}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {category?.isArchived === 1 ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm">{t('categories:businessTypes.archived')}</p>
          ) : null}

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('categories:businessTypes.none')}</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {shown.map(({ code, moved }) => (
                <li key={code} className="flex min-h-11 items-center gap-3 px-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{nameOf(code)}</span>
                    {moved ? (
                      <span className="block text-xs text-muted-foreground">
                        {t('categories:businessTypes.moved')}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums" dir="ltr">
                    {code}
                  </span>
                  {moved && category !== undefined ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label={`${t('categories:businessTypes.returnDefault')}: ${nameOf(code)}`}
                      onClick={() => {
                        void returnBusinessType(db, code, category.id, systemClock.nowIso()).catch(failed);
                      }}
                    >
                      <Undo2 className="size-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {!expanded && rows.length > SHOWN ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => {
                setExpanded(true);
              }}
            >
              {t('categories:businessTypes.more', { count: rows.length - SHOWN })}
            </Button>
          ) : null}

          <BusinessTypePopout
            value=""
            onSelect={(code) => {
              void add(code);
            }}
            trigger={
              <Button type="button" variant="outline" className="h-11 w-full">
                <Plus className="size-4" aria-hidden="true" />
                {t('categories:businessTypes.add')}
              </Button>
            }
          />
        </div>

        <AlertDialog
          open={asking !== undefined}
          onOpenChange={(open) => {
            if (!open) setAsking(undefined);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('categories:businessTypes.movePast', { count: asking?.ids.length ?? 0 })}
              </AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('categories:businessTypes.movePastNo')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const ids = asking?.ids ?? [];
                  setAsking(undefined);
                  void movePast(ids);
                }}
              >
                {t('categories:businessTypes.movePastYes')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 9: Open it from the categories screen**

In `src/features/settings/categories-screen.tsx`:

Add `Store` to the `lucide-react` import, and:

```ts
import { BusinessTypesSheet } from './business-types-sheet';
```

In `CategoriesScreen`, beside the other state:

```ts
/** The category whose business types are open, by id, so the sheet follows live edits. */
const [typesOf, setTypesOf] = useState<string | undefined>(undefined);
```

Pass a handler to each row:

```tsx
<CategoryRow
  key={category.id}
  category={category}
  onEdit={() => {
    setEditing(category);
  }}
  onDelete={() => {
    setDeleting(category);
  }}
  onBusinessTypes={() => {
    setTypesOf(category.id);
  }}
/>
```

and after `<DeleteCategoryDialog ... />`:

```tsx
<BusinessTypesSheet
  category={all.find((c) => c.id === typesOf)}
  categories={all}
  onOpenChange={(open) => {
    if (!open) setTypesOf(undefined);
  }}
/>
```

In `CategoryRow`, add the prop:

```ts
  readonly onBusinessTypes: () => void;
```

(and destructure it), and before the archive button:

```tsx
{
  /* Every expense category, built-in or the person's own, has business types (spec point 12). */
}
{
  category.kind === 'expense' ? (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-11"
      aria-label={`${t('categories:businessTypes.open')}: ${name}`}
      onClick={onBusinessTypes}
    >
      <Store className="size-4" aria-hidden="true" />
    </Button>
  ) : null;
}
```

- [ ] **Step 10: Run them to see them pass**

Run: `pnpm test --project dom src/features/settings` and `pnpm test --project db src/db/business-types.test.ts` and `pnpm test --project unit src/i18n`
Expected: PASS.

- [ ] **Step 11: Run the task gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm gate:rtl`
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add src/db/business-types.ts src/db/business-types.test.ts src/features/settings/business-types-sheet.tsx src/features/settings/business-types-sheet.test.tsx src/features/settings/categories-screen.tsx src/i18n/locales/en/categories.json src/i18n/locales/he/categories.json
git commit -m "Each expense category now lists its business types, and one can be moved in from another category, with its past expenses and an Undo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: The feed's search finds business types

Spec §4.3, §6 ("Hebrew search"), §7 "Feed".

**Files:**

- Modify: `src/domain/feed.ts` (`FeedLookup`, `applyFeedFilters`)
- Modify: `src/features/feed/use-feed-data.ts` (`useFeedRows`)
- Modify: `src/features/feed/feed-screen.tsx` (the names, from `useMccList`)
- Test: `src/domain/feed.test.ts` (unit)

**How it matches.** The search box already matches the note, the category, the payment method and where income went, lower-cased. It now also matches the row's business type name in the UI language, folded like the picker's search (`foldSearch`: niqqud and final letters do not matter), so "מסעדות" finds every restaurant. Until the names have loaded (`useMccList`), the business type matches nothing; nothing else changes. Layer C's memo (the only one that depends on the filters) gains the name lookup as a dependency, and layers A and B are untouched.

**Interfaces:**

- Consumes: `Transaction.mcc` (Task 2); `foldSearch`, `mccName` (Task 1); `useMccList` (Task 1).
- Produces: `FeedLookup` gains `readonly businessTypeName?: (code: string) => string | undefined`; `useFeedRows` gains a 7th argument, `businessTypeName: (code: string) => string | undefined`.

- [ ] **Step 1: Write the failing test**

In `src/domain/feed.test.ts`, add `mcc?: string;` to `OccurrenceSeed`, and in `occ` pass it to the transaction:

```ts
const transaction = makeTx({
  id: seed.id,
  kind: seed.kind ?? 'expense',
  date: originalDate,
  recurrence: { type: 'one_time' },
  ...(seed.mcc === undefined ? {} : { mcc: seed.mcc }),
});
```

Then append:

```ts
describe('searching by business type', () => {
  const base = defaultFilters({ profileId: 'all', today: TODAY });
  const items = [
    occ({ id: 'cafe', date: '2026-09-05', note: 'Cafe Nero', mcc: '5812' }),
    occ({ id: 'bistro', date: '2026-09-06', note: 'Bistro', mcc: '5812' }),
    occ({ id: 'bakery', date: '2026-09-07', note: 'Bakery', mcc: '5462' }),
    occ({ id: 'plain', date: '2026-09-08', note: 'Something' }),
  ];
  const names: Record<string, string> = { '5812': 'מסעדות', '5462': 'מאפיות' };
  const withNames: FeedLookup = { ...lookup, businessTypeName: (code) => names[code] };
  const search = (query: string, using: FeedLookup = withNames) =>
    applyFeedFilters(items, { ...base, query }, using).map((o) => o.seriesId);

  it('finds every row of a business type by its name', () => {
    expect(search('מסעדות')).toEqual(['cafe', 'bistro']);
    expect(search('מאפיות')).toEqual(['bakery']);
  });

  it('ignores niqqud and final letters, as the picker does', () => {
    expect(search('מִסְעָדוֹת')).toEqual(['cafe', 'bistro']);
  });

  it('matches nothing by business type until the names are there', () => {
    expect(search('מסעדות', lookup)).toEqual([]);
    // The rest of the row still matches.
    expect(search('cafe', lookup)).toEqual(['cafe']);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test --project unit src/domain/feed.test.ts -t "business type"`
Expected: FAIL: `businessTypeName` is not a `FeedLookup` key, and nothing is found by "מסעדות".

- [ ] **Step 3: Match the business type**

In `src/domain/feed.ts`, import the fold:

```ts
import { matchesKind, type FeedFilters } from './feed-filters';
import { foldSearch } from './mcc';
```

Add to `FeedLookup`:

```ts
  /**
   * A business type's name in the UI language; absent, or undefined for a
   * code, until the names have loaded.
   */
  readonly businessTypeName?: (code: string) => string | undefined;
```

In `applyFeedFilters`, replace the end of the filter, from the comment above `const haystack`, with:

```ts
// Note, category, payment method and where income went - what is visible on the row.
// Searching a field the user cannot see returns results they cannot explain.
const haystack = [
  o.note,
  lookup.categoryName(o.categoryId),
  o.paymentMethodId === undefined ? undefined : lookup.paymentMethodLabel(o.paymentMethodId),
  o.destinationId === undefined ? undefined : lookup.paymentMethodLabel(o.destinationId),
];
if (haystack.some((value) => value?.toLocaleLowerCase().includes(needle) === true)) return true;
// And the business type, which the row's edit form shows (spec §4.3): "מסעדות" finds every
// restaurant. Folded like the picker's search, so niqqud and final letters do not matter.
const mcc = o.transaction.mcc;
const business = mcc === undefined ? undefined : lookup.businessTypeName?.(mcc);
return business !== undefined && foldSearch(business).includes(foldSearch(needle));
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm test --project unit src/domain/feed.test.ts`
Expected: PASS, the new tests and every earlier one.

- [ ] **Step 5: Give the feed the names**

In `src/features/feed/use-feed-data.ts`, add the argument to `useFeedRows`, after `methodName`:

```ts
  /**
   * A business type's name in the UI language, so the search box finds
   * "מסעדות"; undefined until the names have loaded.
   */
  businessTypeName: (code: string) => string | undefined,
```

add `businessTypeName,` to the lookup object passed to `applyFeedFilters` (after `paymentMethodLabel`), and `businessTypeName` to the `useMemo` dependency list.

In `src/features/feed/feed-screen.tsx`, import:

```ts
import { mccName } from '@/domain/mcc';
```

(after `import { hasActiveFilters } from '@/domain/feed-filters';`) and:

```ts
import { useMccList } from '../business-type/use-mcc-list';
```

(before `import { BalanceBreakdownSheet, ExpenseBreakdownSheet } from '../summary/breakdown-sheet';`). After `translateMethod`, add:

```ts
// Business type names for the search box: their own chunk, loaded once the feed is up.
const mccList = useMccList();
const businessTypeName = useMemo(
  () => (code: string) => (mccList === undefined ? undefined : mccName(mccList, code, i18n.language)),
  [mccList, i18n.language],
);
```

and pass it as the last argument of `useFeedRows(...)`:

```ts
const { rows, windowCount, isLoading } = useFeedRows(
  occurrences,
  filters,
  lookups,
  today,
  translateCategory,
  translateMethod,
  businessTypeName,
);
```

- [ ] **Step 6: Run the feed tests**

Run: `pnpm test --project dom src/features/feed` and `pnpm test --project unit src/domain/feed.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the task gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all pass. (`grep -rn "useFeedRows(" src` shows the screen is its only caller.)

- [ ] **Step 8: Commit**

```bash
git add src/domain/feed.ts src/domain/feed.test.ts src/features/feed/use-feed-data.ts src/features/feed/feed-screen.tsx
git commit -m "Searching the feed for a business type, such as מסעדות, now finds every expense of that type" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: End to end, and the README

Spec §7 "E2E" (the form; moving a business type between categories in en and he, and on mobile; the feed search). Spec point 13: the E2E build has no account server, so "import a small sheet with a sector column" is Task 8's dom test through the real `ImportSheet`, not a Playwright test.

**Files:**

- Create: `e2e/16-business-types.spec.ts`
- Modify: `README.md` ("Design decisions")

**Interfaces:**

- Consumes: everything above, through the built app (`pnpm build:local`, port 4173), as a person uses it.
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the end-to-end spec**

Create `e2e/16-business-types.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { openAddSheet } from './support/add';
import { completeFirstRun } from './support/seed';

/**
 * Business types (MCC), end to end: picked in the form, the category follows
 * it; moved from one category to another, the past expense goes with it,
 * after asking; and the feed's search finds rows by the type's name.
 */

const COPY = {
  en: {
    newTransaction: 'New transaction',
    name: 'What was it?',
    amount: 'Amount',
    save: 'Save',
    typeNotSet: 'Business type Not set',
    typeBakeries: 'Business type Bakeries',
    popout: 'Business type',
    search: 'Search by name or code',
    query: 'bakeries',
    option: /^Bakeries/,
    category: /^Category/,
    groceries: 'Groceries',
    dining: 'Eating out',
    typesOf: (name: string) => `Business types: ${name}`,
    add: 'Add a business type',
    question: 'Move the 1 past expense with this business type here too?',
    yes: 'Move them',
    moved: 'Moved 1 expense',
    movedHere: 'Moved here',
    feedSearch: 'Search',
    feedQuery: 'Bakeries',
  },
  he: {
    newTransaction: 'תנועה חדשה',
    name: 'מה זה היה?',
    amount: 'סכום',
    save: 'שמירה',
    typeNotSet: 'סוג עסק לא נקבע',
    typeBakeries: 'סוג עסק מאפיות',
    popout: 'סוג עסק',
    search: 'חיפוש לפי שם או קוד',
    query: 'מאפיות',
    option: /^מאפיות/,
    category: /^קטגוריה/,
    groceries: 'מצרכים',
    dining: 'אוכל בחוץ',
    typesOf: (name: string) => `סוגי עסק: ${name}`,
    add: 'הוספת סוג עסק',
    question: 'להעביר לכאן גם את ההוצאה הקודמת מסוג זה?',
    yes: 'להעביר',
    moved: 'הוצאה אחת הועברה',
    movedHere: 'הועבר לכאן',
    feedSearch: 'חיפוש',
    feedQuery: 'מאפיות',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

/** WCAG 2.2 A and AA, as in 07-a11y. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** A bakery bought today, its business type picked in the form: the category follows it to Groceries. */
async function addBakery(page: Page, copy: Copy): Promise<void> {
  await openAddSheet(page);
  const form = page.getByRole('dialog', { name: copy.newTransaction });
  await form.getByLabel(copy.name, { exact: true }).fill('Lehamim');
  await form.getByLabel(copy.amount, { exact: true }).fill('32');
  await form.getByRole('button', { name: copy.typeNotSet }).click();
  const popout = page.getByRole('dialog', { name: copy.popout });
  await popout.getByPlaceholder(copy.search).fill(copy.query);
  await popout.getByRole('option', { name: copy.option }).click();
  await expect(form.getByRole('button', { name: copy.typeBakeries })).toBeVisible();
  await expect(form.getByRole('combobox', { name: copy.category })).toContainText(copy.groceries);
  await form.getByRole('button', { name: copy.save }).click();
  await expect(form).toBeHidden();
}

/** Move Bakeries into Eating out from the categories screen, moving the past expense too. */
async function moveBakeries(page: Page, copy: Copy): Promise<void> {
  await page.goto('/categories');
  await page.getByRole('button', { name: copy.typesOf(copy.dining) }).click();
  const sheet = page.getByRole('dialog', { name: copy.typesOf(copy.dining) });
  await sheet.getByRole('button', { name: copy.add }).click();
  const popout = page.getByRole('dialog', { name: copy.popout });
  await popout.getByPlaceholder(copy.search).fill(copy.query);
  await popout.getByRole('option', { name: copy.option }).click();

  const question = page.getByRole('alertdialog', { name: copy.question });
  await question.getByRole('button', { name: copy.yes }).click();
  await expect(page.getByText(copy.moved)).toBeVisible();
  await expect(sheet.getByText(copy.movedHere)).toBeVisible();
}

for (const lang of ['en', 'he'] as const) {
  test.describe(`@business-types in ${lang}`, () => {
    // eslint-disable-next-line no-empty-pattern
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name !== lang, 'Language is set by the project.');
    });

    test('a business type picked in the form files the expense, moves with its category, and is found by search', async ({
      page,
    }) => {
      const copy = COPY[lang];
      await completeFirstRun(page, lang, { demo: false });
      await addBakery(page, copy);

      // The feed's search finds the row by its business type's name.
      await page.getByLabel(copy.feedSearch, { exact: true }).fill(copy.feedQuery);
      await expect(page.getByTestId('row-text').filter({ hasText: 'Lehamim' })).toContainText(copy.groceries);

      await moveBakeries(page, copy);
      await page.goto('/');
      await page.getByLabel(copy.feedSearch, { exact: true }).fill(copy.feedQuery);
      await expect(page.getByTestId('row-text').filter({ hasText: 'Lehamim' })).toContainText(copy.dining);
    });

    test('passes axe with the form’s pop-out and the business types sheet open', async ({ page }) => {
      const copy = COPY[lang];
      const theme = lang === 'he' ? 'dark' : 'light';
      await page.emulateMedia({ colorScheme: theme });
      await completeFirstRun(page, lang, { demo: false, theme });

      const scan = async (what: string, include: string): Promise<void> => {
        const results = await new AxeBuilder({ page }).withTags(TAGS).include(include).analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ') ?? ''}`),
          what,
        ).toEqual([]);
      };

      await openAddSheet(page);
      await page.getByRole('button', { name: copy.typeNotSet }).click();
      await expect(page.getByRole('dialog', { name: copy.popout })).toBeVisible();
      await scan('business type pop-out', '[data-slot="popover-content"]');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');

      await page.goto('/categories');
      await page.getByRole('button', { name: copy.typesOf(copy.groceries) }).click();
      await expect(page.getByRole('dialog', { name: copy.typesOf(copy.groceries) })).toBeVisible();
      await scan('business types sheet', '[role="dialog"]');
    });
  });
}

test.describe('@business-types on a phone', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'The phone project.');
  });

  /** Controls inside `scope` shorter than 44px; the shared sheet's close button is existing chrome. */
  const short = (page: Page, scope: string) =>
    page.evaluate((selector) => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll(
        `${selector} :is(button, a[href], input:not([type="hidden"]), [role="option"], [role="combobox"])`,
      )) {
        if (el.closest('[data-slot="sheet-close"], .sr-only') !== null) continue;
        const height = (el as HTMLElement).offsetHeight;
        if (height === 0) continue;
        if (height < 44)
          bad.push(`${el.tagName} "${el.textContent.trim().slice(0, 30)}" ${String(height)}px`);
      }
      return bad;
    }, scope);

  test('moves a business type, and keeps every new control at 44px', async ({ page }) => {
    const copy = COPY.en;
    await completeFirstRun(page, 'en', { demo: false });
    await addBakery(page, copy);

    await page.goto('/categories');
    await page.getByRole('button', { name: copy.typesOf(copy.dining) }).click();
    const sheet = page.getByRole('dialog', { name: copy.typesOf(copy.dining) });
    await expect(sheet).toBeVisible();
    expect(await short(page, '[role="dialog"]'), 'sheet').toEqual([]);
    await sheet.getByRole('button', { name: copy.add }).click();
    const popout = page.getByRole('dialog', { name: copy.popout });
    await popout.getByPlaceholder(copy.search).fill(copy.query);
    expect(await short(page, '[data-slot="popover-content"] [cmdk-list]'), 'pop-out').toEqual([]);
    await popout.getByRole('option', { name: copy.option }).click();
    await page
      .getByRole('alertdialog', { name: copy.question })
      .getByRole('button', { name: copy.yes })
      .click();
    await expect(sheet.getByText(copy.movedHere)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e e2e/16-business-types.spec.ts`
Expected: PASS in the `en`, `he` and `mobile` projects (the other tests in each project skip). The first run builds both preview servers, which takes a few minutes.

- [ ] **Step 3: Write the design decision**

In `README.md`, under "## Design decisions", after the cash paragraph (the one ending "`docs/superpowers/specs/2026-10-09-cash-deposit-design.md`."), add:

```markdown
**An expense's category follows its business type.** Every expense can carry a
business type, a Merchant Category Code (`mcc`, "5812" for restaurants), and a
table files each type under a built-in category; the person can move a type into
any category of theirs (`Category.mccs`), and its past expenses with it, with
Undo. Israeli exports carry no MCC, so each row takes the first it can get: an
MCC column, the card company's sector text, the same merchant seen before, then
Claude, choosing only codes the list has. The person's own choices always win:
a category they gave a merchant beats the table, and a business type they picked
is never replaced. The list is greggles/mcc-codes (public domain), the only one
the app may ship; the Hebrew names are ours (`src/data/mcc-SOURCES.md`,
`pnpm data:mcc`). The codes alone are a small synchronous module, so a schema can
check one, while the names are their own lazy chunk. A synced row is checked
for a code's shape only, because a later build's list may have codes this one
does not; every way a code comes in - the form, a file, history, Claude -
checks the list. All three fields are optional and older builds keep them on an
edit. A cash withdrawal (6010, 6011) is not an expense in an import: it is left
unticked with a note pointing to the Cash tab. The design is in
`docs/superpowers/specs/2026-10-09-mcc-categories-design.md`.
```

- [ ] **Step 4: Run the full gate**

Run: `pnpm verify`
Expected: typecheck, lint, format, the three gates, unit tests with coverage (including the `src/domain/**` 90% floor for the new domain modules) and the build all pass. In the build output, `mcc` appears as its own chunk, and the main chunk does not hold `mcc.json`.

- [ ] **Step 5: Commit**

```bash
git add e2e/16-business-types.spec.ts README.md
git commit -m "Business types are now tested end to end in English, Hebrew and on a phone, and the README says why categories follow them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Parallel groups

The user runs independent tasks in parallel git worktrees. A task may start once every task it consumes from is merged into `mcc-categories`. What each task needs:

| Task | Needs (the interfaces it consumes)                                                                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1    | -                                                                                                                                 |
| 2    | 1 (`isMcc`, `MCC_SHAPE`)                                                                                                          |
| 3    | 1 (`foldSearch`)                                                                                                                  |
| 4    | 1 (`MCC_CODES`), 2 (`Category.mccs`)                                                                                              |
| 5    | 1 (`MCC_SHAPE`), 2 (`Transaction.mcc`, `mccSource`)                                                                               |
| 6    | 1 (`isMcc`), 3 (`merchantKey`), 4 (`defaultCategoryForMcc`)                                                                       |
| 7    | 1 (`isMcc`)                                                                                                                       |
| 8    | 3 (`sectorMcc`), 4 (`categoryForMcc`), 5 (form fields), 6 (`merchantHistory`), 7 (found-row fields, `sectors`, `{ m, mcc, cat }`) |
| 9    | 5, 6, 8 (`pickMcc`, `chooseExpenseCategory`, `MccPick`)                                                                           |
| 10   | 1 (`useMccList`, `searchMcc`), 4 (`categoryForMcc`), 9 (`categoryByPerson`, the hook's wiring)                                    |
| 11   | 1, 2, 4 (`businessTypesOf`, `categoryForMcc`), 10 (`BusinessTypePopout`)                                                          |
| 12   | 1 (`useMccList`, `mccName`, `foldSearch`), 2 (`Transaction.mcc`)                                                                  |
| 13   | all                                                                                                                               |

So the waves are:

1. Task 1.
2. Tasks 2, 3 and 7, in parallel.
3. Tasks 4, 5 and 12, in parallel.
4. Task 6.
5. Task 8.
6. Task 9.
7. Task 10.
8. Task 11.
9. Task 13.

No two tasks in one wave touch the same file. Files touched by more than one task are always in different waves: `mcc-categories.ts` (4, 8), `import-check.ts` (7, 8), `transaction-sheet.tsx` (9, 10), and the three callers Task 6 changes by one line (`review-items.ts`, `import-sheet.tsx`, `use-auto-category.ts`), which Tasks 8 and 9 then rework.

## After the last task

- **Deploy the Edge Functions (controller, not a task).** Both changed: `categorize` now bundles `_shared/mcc-codes.ts` and answers `{ categoryId, mcc }`, and `extract-transactions` deploys the new `_shared/import-wire.ts` (rows carry `mcc` and `sec`, merchant answers `{ m, mcc, cat }`, map requests may carry `sectors`). Deploy with the Supabase MCP `deploy_edge_function` or `supabase functions deploy categorize` and `supabase functions deploy extract-transactions`, including the `_shared` files each imports. The app copes with the order: an older function ignores the new keys, and the app reads an answer without them as "no business type".
- **Run `pnpm verify:full`** before the release: it adds the hostile-timezone run, knip (every new export is used), the whole Playwright suite and Lighthouse.
- **Parked, for the next queue item:**
  - Turning a cash withdrawal found by an import into a Cash-tab `withdraw` move, rather than leaving it out (the user's ruling of 2026-10-09 put this out of scope).
  - Backfilling business types for rows saved before this ships (spec §8): they get one when edited, or when the same merchant is imported or typed again.
  - Growing the sector table (`src/domain/sector-mcc.ts`) from real Cal, Max and Isracard exports: none was confirmed when this plan was written.
