# Colour of Money, Phase 3: the screens, built to the concept — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**The whole point.** The shipped app must look like the approved concept, `money-sheets-bold-v2.html`: the same sheets, the same colours on the main screen, the same number of elements, the same sizes, in light and in dark, on a 1440 desktop and a 390 phone. The user's words: "i want the bold money, but look in the example how many colors and elements display in the main screen, i want the live build to be exactly like that example." Phases 1 and 2 shipped the tokens and the shell; the screens still look like the old app (see the audit). This plan builds the screens. **No task is done because its tests pass. A task is done only when the fidelity harness (Task 1) passes for the screens that task touches, in both themes, at both sizes, and its report is in the private audit folder.**

**Goal:** Every screen of Bookandry (and, at the user's request of 2026-10-10, every empty-account state, the first run, the front door and the account emails) is rebuilt from the concept's vocabulary (ink, sapphire and money-coloured sheets 16px apart, huge Karantina numerals bleeding off the foot, inverted figure boxes, hue pills and hue bars, company-colour chips, 48px outline pills and round arrows), measured against the concept by an automated harness, without changing any behaviour or any data.

**Architecture:**

- **The harness comes first and is the gate.** `e2e/fidelity/` renders the concept file and the live app with the same household (a fixture restored through the app's own backup import, the clock frozen at Friday 9 October 2026, 09:00 Asia/Jerusalem), and for each screen checks three things: an element inventory, a set of layout metrics, and a perceptual score (structure, palette, and the set of colours on screen). It writes side-by-side images and a report outside the repo. Every screen task ends by running it.
- **Vocabulary, then primitives, then screens.** Task 2 lands every new string, every new stylesheet rule and the `Button` marker, so the parallel tasks after it touch disjoint files. Tasks 3–6 build the missing primitives (`Sheet`, `Chip`, `HuePill`, a `Numeral` that fits its own column, relative `HueBars`, the 48px editor footers, house-palette avatars, the top bar and the rail). The screens are then laid out one per task, each in its own feature folder, each composed of small sheet components.
- **Behaviour is untouched.** Screens change their markup and styles. Hooks, repos, domain code and the data model are reused as they are; where a sheet needs a figure the app already computes (a bill, a month's in and out, the cash pot), it calls the existing domain function.

**Tech Stack:** React 19.3, TypeScript 6, Tailwind CSS 4.3 (`@theme inline`, `@custom-variant`, container query variants `@board/main:` `@wide/main:` `@vast/main:`), Base UI 1.8, React Router 7.18, Dexie, i18next (en/he, RTL), Vitest 5 (projects `unit`, `db`, `dom`), Playwright 1.63 (new projects `fidelity-seed` and `fidelity`), Fontsource 5.3.0, vite-plugin-pwa.

**Spec:** `docs/superpowers/specs/2026-10-09-colour-of-money-design.md` (binding where this plan does not say otherwise; §N cites it). **Ground truth for looks:** `C:/dev/greenback/.superpowers/concepts-2026-10-09/money-sheets-bold-v2.html` (git-ignored, in the main checkout; Task 1 copies it to `~/.bookandry-private/design-audit/concept-source/`). Where the spec and the concept disagree about how something looks, the concept wins; each case is listed under "Decisions this plan takes". **Also read for this plan:** the design gap audit (`~/.bookandry-private/design-audit/report.md`, text copy `C:/dev/greenback-audit/docs/superpowers/specs/2026-10-10-design-gap-audit.md`), the phases 1–2 plan (`docs/superpowers/plans/2026-10-09-colour-of-money-phases-1-2.md`) and its final review (`C:/dev/greenback-colour/.superpowers/sdd/2026-10-09-colour-of-money-phases-1-2/final-review.md`, CAN WAIT 1–32).

**Where:** the worktree `C:/dev/greenback-phase3`, branch `colour-phase-3`, from `main` at 50b4e5b. Parallel groups run in sibling worktrees `C:/dev/gbp3-t<N>` and are cherry-picked onto `colour-phase-3` in task order, as phases 1–2 did. The add-card flow lives on branch `add-card-flow` (worktree `C:/dev/greenback-addcard`); this plan only reserves its slot (Task 21).

## Global Constraints

- **Toolchain.** In Git Bash: `export PATH="/c/Users/HighL/AppData/Local/node:$PATH"`. In PowerShell: `$env:PATH = "$env:LOCALAPPDATA\node;$env:PATH"`. A new worktree needs `pnpm install` and a copy of the git-ignored `.env.local` from `C:/dev/greenback` (never committed).
- **Two gates per task, both required.** `pnpm verify` exits 0 (typecheck, lint, format:check, gate:rtl, gate:money, gate:pci, unit tests with coverage, build). **And** `pnpm fidelity --grep "<the task's tags>"` exits 0. A task whose unit tests pass and whose harness run fails is not done: report it BLOCKED with the harness report's path. Never loosen a threshold in `e2e/fidelity/config.ts` to make a task pass; a threshold changes only with the user's yes, recorded in the ledger.
- **Harness outputs never enter the repo.** Images and reports go to `~/.bookandry-private/design-audit/fidelity/<run>/` (`FIDELITY_OUT` overrides it). Only the scripts live in `e2e/fidelity/`. `artifacts/` stays git-ignored.
- **Playwright runs one at a time.** Port 4173 is shared by every worktree (`reuseExistingServer`), and two runs at once give mass false failures. Before a harness run, stop any preview server another worktree started (`npx kill-port 4173`), so the run serves this worktree's build. The `fidelity` project rebuilds with `pnpm build:local` when it starts the server.
- **Commits.** One per task at least. Subject: one plain-English sentence in the repo's style (`git log -15`), a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, never merge, never `--no-verify`. Destructive git is blocked by a hook; if one is needed, stop and give the user the exact command.
- **No data model changes.** No new field, table, index or schema version. `Category.hue` (phase 1) is the only colour data and is already in the schema. Everything a sheet shows comes from existing hooks and domain functions.
- **Keep every behaviour and every test.** MCC business types (form field, picker, business-types sheet, Smart import's filing), the Cash tab (count, withdraw, deposit, start, two starts), Smart import (including the Expenses / Income / Both switch: `KindChoice`, `IMPORT_KINDS`, `DEFAULT_IMPORT_KIND`), card bills, commitments, the ⋯ menus, the category pop-out, "not counted yet", split purchase, undo toasts, the feed's filters in the URL, `?add=` / `?edit=` / `?import=`. No test is deleted to make a task pass. A selector a task changes is updated in the same task (§13.3).
- **Colours.** Components set keys only (`data-sheet`, `data-money`, `data-hue`); colours live in `src/index.css`, in OKLCH, in `:root` and `.dark` blocks (§10, departure 1). Lines and tints use `color-mix(in oklch, …)`. Text on a sheet is the sheet's tint. Category hues are marks, never text.
- **CSS rules (good-css, modern-web-guidance).** Logical properties only (`ms-`, `pe-`, `inset-bs-`, `start-`, `end-`; `gate:rtl`). Screens lay out with container query variants on `main` (`@board/main:`, `@wide/main:`, `@vast/main:`), never viewport variants. `hover-fine:` for hover; `:focus-visible` outlines, never `outline: none`; every pressable thing has an `:active` state; movement only inside `motion-safe:` with named properties and never `ease-in`; `overflow-clip` to cut (`hidden` only for a script-scrolled box); sizes that grow with the screen in one `clamp()` token; `:nth-child(even of …)` for swapping sides; nested radii concentric (parent radius minus padding) except the tilted account sheets.
- **Type.** Karantina 700 only for numerals and the phone screen name, never under 28px, never with agorot, never in an amount column. Plex 300/400/500/600 only; no `font-bold` anywhere.
- **Accessibility.** WCAG 2.2 AA in both themes (4.5:1 text, 3:1 marks and field edges). Every target ≥ 44px (pills 48, round 48, nav 48, chips and hue pills through a 44px hit-area pseudo-element). `aria-current` on the current place. Numerals `aria-hidden` with an `sr-only` exact twin. Hue marks `aria-hidden` with their name in text. Forced colours keep a 2px edge on every sheet and mark.
- **Hebrew first, RTL.** Every new string exists in `src/i18n/locales/en/*.json` and `he/*.json` (`resources.he satisfies resources.en` fails `tsc` otherwise; `locales.test.ts` parity). Amounts are LTR-isolated runs. Arrows mirror with `rtl:`. No "sync" in the copy.
- **CSP and size.** `font-src 'self'`: fonts stay files, never `data:`. No new runtime dependency and no new dev dependency (the harness's image maths runs in the browser). The precache keeps every file under `maximumFileSizeToCacheInBytes` (3 MiB); the main chunk was 2,128,908 bytes at 50b4e5b and Task 28 measures it again.
- **Money.** Shares and ratios only through `src/lib/money.ts` (`sharesBp`, and `ratioPercent` from Task 2). `gate:money` stays green. `Numeral`'s glyph sums carry `money-allow`.

## Review Focus

The five ways this most likely goes wrong for a person using the app, none of which a screen's own unit tests catch. Each has its test in the task named.

1. **Right in light, muddy in dark.** The concept's dark mode works only because colour carries it; a screen that passes in light can be grey on grey in dark. The harness runs every screen in both themes with the same thresholds, and its colour-set check fails a dark screen that lost its money colours (Task 1; every screen task runs both themes; Task 26 runs them all together).
2. **Numerals clipped, colliding or spilling sideways.** A figure sized to the wrong box runs past its column and the sheet's `overflow: clip` cuts digits; agorot in Karantina collide. `Numeral` fits its own column from Karantina's real advance widths, `e2e/22-numerals.spec.ts` gains a sideways check, and the harness pins each numeral's size and bleed (Task 4; long and negative figures in Task 7).
3. **RTL mirrored wrong.** Card sheets that do not alternate, account sheets tilted or offset the wrong way, arrows pointing backwards, the month sheet on the wrong side of the categories. The harness compares every sheet's inline position with the concept's in Hebrew, and Task 28 runs the English mirror (Tasks 7, 11, 13, 28).
4. **Empty and loading states.** A new household with nothing in it, one card, no bank accounts, cash not set up, the board while IndexedDB is still loading: sheets keep their shape (no layout jump) and say something useful. A DOM test per sheet, a harness run on an empty household, and an approved empty version of the concept every empty screen is measured against (Tasks 7, 12, 22, 23).
5. **Huge and narrow screens.** 1920 (`@vast`), 1024 (`@board`), 320: no sideways scroll, numerals capped, long Hebrew names on two lines at most, the wallet sticky below the collapsed bar. Structural harness checks at 1920 and 1024, and `e2e/16-widths` at 320 (Tasks 12 and 28).

---

## The fidelity gate

`pnpm fidelity` (Task 1) runs Playwright project `fidelity` against `pnpm build:local` on port 4173, after project `fidelity-seed` has restored the concept household once and saved the browser state (IndexedDB included). Each test is one screen, at one size, in one theme, tagged `@fid-<screen>`, `@fid-<size>`, `@fid-<theme>` so a task runs only its own (`pnpm fidelity --grep "@fid-feed-desktop"`).

**What is compared.**

- **The concept.** The file is opened at a 1504×900 viewport, so its 1440 frames render at scale 1 (the same way the audit shot it). Google Fonts requests are answered from the local `@fontsource` files, so concept and app draw with the identical font files and the run works offline. The theme is set with `emulateMedia({ colorScheme })`, which the concept follows (`prefers-color-scheme` under `:root:not([data-theme="light"])`).
  - Desktop frame: `.desk` (1440 wide, 2097 tall). Its first 900px is "the fold".
  - Phone frame: the first `.phone` (the Cards screen), its 390×792 inner box from the top of the status bar (inside the 8px bezel, above the tab bar's foot).
  - Sheet crops: `.desk .bal`, `.month`, `.cats`, `.tx-sheet`, `.wallet`, `.cashsheet`, and `.desk .cardsheet` (first).
  - Pop-out frame: `.deskmodal .dialog` (1140×732), compared by metrics only until the add-card flow lands.
- **The app.** The same household (`e2e/fidelity/concept-household.ts`), Hebrew, `he-IL`, `Asia/Jerusalem`, clock fixed at `2026-10-09T09:00:00+03:00` with `page.clock.setFixedTime`, reduced motion, theme set in `gb.boot` and emulated. Desktop 1440×900, phone 390×844. For the inventory and the metrics the desktop viewport is made as tall as the concept's frame (1440×2097), so the virtualised list renders everything the concept draws; the perceptual shot is taken at 1440×900.

**The three checks, and their thresholds** (all in `e2e/fidelity/config.ts`; the same numbers in light and dark):

| Check              | How it is measured                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Pass when                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inventory**      | In the page, count visible elements of each kind whose top is inside the concept's drawn extent (desktop 2097px, phone 844px). Kinds, concept selector → app selector: sheet `.sheet` → `[data-sheet]`; numeral `.mega` → `[data-numeral]`; mark `.mark` → `[data-slot="mark"]`; hue bar `.bars .bar i` → `[data-slot="hue-bars"] i[data-hue]`; hue pill `.tx .sq` → `[data-slot="hue-pill"]`; chip `.chip` → `[data-slot="chip"]`; pill `.pill` → `[data-variant="pill"],[data-variant="pill-solid"]`; round `.round` → `[data-variant="round"]`; day heading `.day` → `[data-slot="day-heading"]`; account sheet `.acct` → `[data-slot="account-sheet"]`; card sheet `.cardsheet` → `[data-card-sheet]`; nav item `.nav-item` → `[data-slot="nav-place"]`. | For a screen the concept draws: `abs(app − concept) ≤ tolerance`, tolerance 0 for numerals, hue bars, account sheets and card sheets; 1 for sheets, marks, pills, round buttons, day headings, nav items and hue pills; 2 for chips. For a screen it does not draw: the expected counts in `screens.ts`, same tolerances.                                                                                                           |
| **Layout metrics** | In the page, read boxes and computed styles through one `probe()` (width, height, x and y in the frame's coordinates, font size, corner radius, grid column count, column gap, the vertical gap to the next sheet, rotation, padding, a numeral's overflow past its sheet's foot). For a framed screen each metric is read from the concept and from the app with paired selectors.                                                                                                                                                                                                                                                                                                                                                                          | Every metric within its tolerance: radii, gaps, paddings, rail and pill heights ±1px; sheet widths and inline positions ±2px (±4px for tilted account sheets); sheet heights ±12px (content-driven); text font sizes ±0.5px; numeral font sizes ±2%; numeral overflow ±1.5px; rotation ±0.05°; board column count exact.                                                                                                            |
| **Perceptual**     | In a blank browser page, both PNGs are drawn to a canvas at 1/8 scale for desktop (180×112 for the fold) and 1/4 for the phone (98×198), converted to OKLab. **Structure**: mean SSIM of OKLab L over 8×8 windows at stride 4 (C1 = 0.01², C2 = 0.03²). **Palette**: each pixel is assigned to the nearest concept token of the current theme (house, 10 money colours, 12 hues; read live from the concept's `:root`) within ΔE_OK 0.06, else "other"; the score is the histogram intersection of the two share vectors, "other" included. **Colours on screen**: the money, hue, sapphire and night bins that cover ≥ 0.25% of the frame.                                                                                                                  | Structure ≥ **0.70**; palette ≥ **0.90**; the app misses **at most 1** of the concept's colours and adds **at most 2** the concept does not show. For a screen with no concept frame: "other" ≤ **0.16** of the page (no off-palette colour), every colour in the screen's `mustShow` list present, and, once the user has approved its picture (`FIDELITY_APPROVE=1` writes the golden), structure ≥ **0.90** against that golden. |

**How the thresholds were set** (measured on 2026-10-10 with the scorer above, at 1/8 scale; the self-test in Task 1 re-runs these and fails if the scorer drifts):

| Pair                                                                                                                        | Structure             | Palette               | Colours, concept → other |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------- | ------------------------ |
| Concept against itself                                                                                                      | 1.000                 | 1.000                 | 12 → 12                  |
| Concept against a near-faithful build (board 6px lower, one rail item fewer, one merchant renamed), light / dark            | 0.759 / 0.762         | 0.987 / 0.988         | 12 → 11, 11 → 11         |
| Concept against a loose build (24px gaps, a 200px balance, one account sheet missing, month 5 + categories 7), light / dark | 0.654 / 0.641         | 0.944 / 0.938         | 12 → 9, 11 → 10          |
| Concept against the shipped feed at 50b4e5b, light / dark                                                                   | 0.241 / 0.264         | 0.667 / 0.639         | 12 → 2, 11 → 3           |
| Phone Cards: near-faithful / loose / shipped (light)                                                                        | 0.807 / 0.458 / 0.169 | 0.996 / 0.875 / 0.434 | 7 → 7 / 6 / 4            |

| Single sheets at 1/8, near-faithful (other copy, a 3px shift) / loose (sizes and gaps changed), light: balance, month, categories, wallet | 0.924, 0.946, 0.951, 0.995 / 0.519, 0.214, 0.716, 0.172 | ≥ 0.983 / ≥ 0.881 | n/a |
| Transactions sheet with one row removed (every row below moves up) / with no hue pills and 48px rows | 0.478 / 0.818 | 0.991 / 0.984 | n/a |

So 0.70 passes a build that is the concept with honest differences of data and copy, and fails one whose sizes and gaps drifted; the shipped app fails by a wide margin. The palette threshold 0.90 sits between the loose build (0.94 still passes, so palette alone never decides) and the shipped app (≤ 0.67). Structure is blind to some changes (the transactions sheet without hue pills still scores 0.82) and over-sensitive to others (one row more or less moves every row below it); that is why it never decides alone either: the counts catch the missing hue pills, the metrics catch the 48px rows, and the household is built so the concept's rows fall on the same days (2 today, 3 yesterday, 3 on the 7th).

**Outputs** (per test, in `~/.bookandry-private/design-audit/fidelity/<run>/<screen>-<size>-<theme>/`): `concept.png`, `app.png`, `side-by-side.png` (concept left, app right, the structure map third: red where the windows disagree), `report.json` (every count, metric and score with pass or fail), and one line appended to `<run>/summary.tsv`. `<run>` is the ISO time of the run plus the short commit hash. The test fails with a readable list of every failing count, metric and score.

## Dark mode: the concept's own, with every deviation listed

The user wants the build identical to the concept, and the concept has its own dark mode (`@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]`). Phase 1 already copied its values exactly into `src/index.css` (`.dark`). **This plan keeps them.** It does **not** adopt the audit's proposed "dark palette v2" (deeper page, cream ink sheet, lifted near-black fills, `soft-light` grain): those are composition changes the concept does not make, and the concept's dark only reads grey-on-grey in the shipped app because the colourful sheets are missing, which phase 3 fixes.

**Text contrast in the concept's dark palette** (WCAG relative luminance from OKLCH clipped to sRGB, measured for this plan):

| Text on its surface (dark)                                                                             | Ratio                                                                     |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| ink on paper / on the paper sheet                                                                      | 15.66 / 13.65                                                             |
| quiet ink (`--ink-2`, 300 weight) on paper / sheet                                                     | 8.74 / 7.62                                                               |
| on the ink sheet; the flipped box on the ink sheet                                                     | 17.39; 17.39                                                              |
| on-sapphire on sapphire (the month sheet)                                                              | 7.79                                                                      |
| lifted sapphire in the box                                                                             | 11.59                                                                     |
| income on the sheet / paper                                                                            | 8.96 / 10.29                                                              |
| money tints on their fills: Leumi, Hapoalim, Discount, Mizrahi, Isracard, Cal, Max, Amex, Diners, cash | 7.07, 6.41, 6.43, 5.29, 10.80, **5.12** (lowest), 6.49, 6.45, 10.16, 9.20 |
| lifted figure colours in the box (same order)                                                          | 10.92, 10.34, 12.78, 7.76, 10.84, 8.68, 10.33, 11.70, 13.37, 10.86        |
| a charged row in the month sheet (on-sapphire at 72% opacity over sapphire)                            | 4.85                                                                      |

The audit measured the same: no text pair in the concept's dark palette fails AA. **So dark mode has no text deviation.** The one text pair in the whole concept that fails is in **light** mode, and it is fixed narrowly:

| Deviation                                                                                                       | Concept                          | Measured               | Change                                               | After      |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------- | ---------------------------------------------------- | ---------- |
| D-1. A charged row in the month sheet's "charges by day" list, light theme (`.sched li.done { opacity: 0.72 }`) | on-sapphire at 72% over sapphire | **4.29:1** (fails 4.5) | opacity 0.78 in light only; dark keeps 0.72 (4.85:1) | **4.75:1** |

**Composition defects the audit lists for the shipped dark mode, and what this plan does with each:**

| Audit item                                                                                                                                        | What this plan does                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 almost no colour; D10 no numerals                                                                                                              | Fixed by building the screens (Tasks 7–20).                                                                                                                                                        |
| D2 the ink hero has no edge (night 0.13 on paper 0.2, 1.11:1); D3 sheet vs paper 1.15:1; D5 sapphire 2.06:1 against the page; D6 near-black fills | **Kept**: these are the concept's own values and the concept looks right with them. Non-text contrast does not apply (decision 6: colour is never the only carrier; every sheet carries its name). |
| D4 muddy inner structure (bordered boxes inside sheets, muted day bands darker than rows)                                                         | Fixed: phase 3 removes every `border … rounded-xl` box inside a sheet and the muted day bands; day headings become the concept's 2px lines (Tasks 10, 13, 15–20).                                  |
| D7 chalky fills under the grain                                                                                                                   | Kept: the concept lays its grain over everything, fills included, at 6% `screen` in dark; the app's per-surface grain is the same strength.                                                        |
| D8 white logo plates in the card editor's bank picker                                                                                             | Not drawn by the concept (it shows no logos). Left as is; the add-card branch owns that picker.                                                                                                    |
| D9 avatar discs in saturated colours outside the palette                                                                                          | Fixed in Task 6: avatars take the house palette, as the concept draws them (ink box, sapphire).                                                                                                    |

## Decisions this plan takes

The concept wins on looks; behaviour and data stay. Each of these departs from the spec or fills a gap in it, and is recorded in the spec by Task 28.

1. **The rail follows the concept's order and labels** where no behaviour decision forbids it: Overview (`סקירה`, the feed), Cards, Bank accounts, Cash (`קופת מזומן`), Chart, a line, Categories, Commitments, Settings, the household at the foot. The phone's four tabs are unchanged (תנועות, תרשים, כרטיסים, מזומן: the concept's phone shows the same four first). Not adopted from the concept: a separate "Transactions" place (decision 26: the feed is the overview, there is no second list) and "Smart import" in the rail (decision 28: it stays in the Add menu). So the rail has 8 places to the concept's 9, inside the inventory's tolerance of 1. Departs from §4.2 ("the phone's tab order is kept").
2. **The feed's top bar is the concept's:** the greeting and the date as the title pair ("בוקר טוב, דניאל" / "יום שישי, 9 באוקטובר": good morning before 12:00, good afternoon to 18:00, good evening after, with the active person's name, or the household's when "everyone"), the search pill, and the month picker with 48px round arrows. Other screens' top bars carry their own title pair. Fills §4.3.
3. **Account sheets show the next money in.** The app has no per-account balances, and the spec rules them out (§14). Each account sheet in the balance sheet shows its bank's name (600), the account's label (300) and, as its 52px figure, the next income expected into it (`useIncoming`), with its day in the label line. An account with nothing coming shows its masked number instead of a figure. The cash sheet shows the cash pot. Fills §5.1.
4. **A card sheet's figure is the bill charged this calendar month** (`cardBills()`, the bill whose `chargeDate` is in this month), with "billed on the N" in the box, and the wallet's subtitle is the sum of those bills. This is what the concept's sheets show (`₪3,214`, "חיוב ב־2"). Where no bill falls this month, the figure is this month's purchases so far. Fills §7.1.
5. **Hue bars are relative to the largest category,** as the concept draws them (rent is 100% of the track, groceries 50.7%), not shares of the total. Widths stay basis points from `sharesBp()`; CSS divides by the largest. Departs from §7.4's "shares".
6. **Numerals fit their own column, from Karantina's real advance widths.** The 0.34em-per-glyph rule sizes the 252px balance to 244px and cannot both fit and match the concept. `Numeral` becomes its own size container and sums each glyph's measured advance (Karantina 700, units per 1000: 0→350, 1→243, 2→307, 3→307, 4→383, 5→307, 6→340, 7→319, 8→350, 9→350, `,`→152, `.`→143, `₪`→652 at half size plus 0.04em, `$`→346, `€`→427, `£`→431, `¥`→409, `−`→280; unknown → 383, the widest digit). `₪58,555` is 2.096em, so it is 252px in the concept's 580px column, exactly as drawn. A figure that would need less than 28px wraps after the currency sign (§12). Replaces §7.5's formula (CAN WAIT 2).
7. **Avatars use the house palette,** as the concept draws them: the first person in household order on the ink box (`--box` / `--on-box`), the second on sapphire, the third as a 2px ink ring on paper, repeating. The stored `Profile.color` is not read for display any more and is not changed. Departs from §14 ("avatars keep their curated palette"), at the user's request (audit D9).
8. **Card details live in a pane beside the card sheets from `@wide`, and in the end-side panel below it.** `?card=<id>` (pushed) opens them; Back closes them. With no card chosen, the pane holds the household's commitments. Fills §5.3.
9. **The add-card pop-out is not built here.** The harness reserves its two screens (`popout-add-card` against the concept's `.deskmodal`, `add-card-phone` against the second `.phone`) and skips them until the add-card branch lands (Task 21).

## The concept, inventoried

Measured from `money-sheets-bold-v2.html` in Chromium at scale 1 (light and dark give the same geometry; colours differ by theme as listed). "x" is the inline offset in the 1440 frame, which is RTL, so the rail is on the right. Every number below is a target the harness checks or a value the tasks copy.

### Shared atoms (every screen)

- [ ] **Paper** `oklch(0.962 0.012 85)` light / `oklch(0.2 0.012 70)` dark; body 17px Plex 400, line-height 1.55; grain 7.5% multiply / 6% screen.
- [ ] **Sheet:** one colour, `overflow: clip`, radius by kind; paper sheet `oklch(0.992 0.006 85)` / `0.255 0.012 70`; ink sheet `0.2 0.018 265` / `0.13 0.006 70`; sapphire `0.462 0.175 263` / `0.42 0.165 263`. Text is the sheet's tint; quiet text is weight 300, never paler.
- [ ] **Mark (inverted box):** `--box` with the sheet's lifted hue, 600, padding `0.04em 0.28em 0.1em`, radius 3px, `box-decoration-break: clone`, an isolated run. On the ink sheet it flips to paper with ink text. One or two per sheet.
- [ ] **Numeral:** Karantina 700, line-height 0.74, letter-spacing −0.005em, `₪` at 0.5em raised 0.62em with 0.04em after it, bleeding `(b × 0.61 + 0.02)em` past the sheet's foot: b = 0.06 desktop, 0.03 phone, half inside a card sheet.
- [ ] **Pill:** 48px tall (44 in the phone head), 22px inline padding, 2px `currentColor` border, full radius, 16px weight 500. **Solid pill:** sapphire with its foreground. Fills with `--press`/`--on-press` (in a sheet: the box and the lifted hue) on hover (fine pointers) and press, 150ms; press scales to 0.97.
- [ ] **Round button:** 48px circle, 2px `currentColor` border, a 20px arrow mirrored in RTL.
- [ ] **Hue pill:** 14×40px full-radius pill in the category's hue (`inset 0 0 0 2px` ring when there is none), at the row's start.
- [ ] **Chip:** ≥ 24px tall, 10px inline padding, full radius, 13px weight 500, the money colour with its tint; in the month sheet with a `0 0 0 1.5px` ring of the sheet's tint at 55%.
- [ ] **Lines:** 2px; on paper `--line` (ink at 14%); on a coloured sheet the tint at 30%.
- [ ] **Focus:** 3px outline offset 3px, sapphire on the paper, `currentColor` inside a sheet.

### Desktop home = the feed at 1440 (`.desk`, frame 1440×2097)

- [ ] **Rail** (x 1184, 256 wide, full height): padding 28 18 22; 2px line at its inline end. Logo row (46px outlined circle with Karantina "B" at 28px, "Bookandry" 600 19px, 22px below). Solid **+ הוספה** pill (48px, 20px below). Nav items: 48px pills, 17px, current one ink-filled in 600 with paper text; counts in 300 14px quiet ink (`5` cards, `4` bank accounts). A 2px line (12px above and below), then the set-up places. Foot: two 36px avatars overlapping by 10px with a 2px paper ring (first on the box, second sapphire), "דניאל ונועה" in 300 15px.
- [ ] **Main:** padding 24; one column of 1136px.
- [ ] **Top bar** (82px tall, padding 4 14 12, gap 12): title "בוקר טוב, דניאל" 600 38px line-height 1, subtitle "יום שישי, 9 באוקטובר" 300 21px 4px below; the search pill (48px tall, ≥ 280px wide, 2px `--line` border, 20px icon, "חיפוש תנועות" in 300 quiet ink); the month picker: round ‹, "אוקטובר 2026" 600 in a ≥ 120px centred box, round ›.
- [ ] **Board:** 12 columns of 80px, 16px gaps both ways, `align-items: start`; board sheets radius 56, padding 34 38.
- [ ] **Balance sheet** (ink; full width 1136; ≥ 420 tall, measured 422; padding-block-end 0): grid `1fr 440px` with a 40px gap. Text column: title "כל הכסף של משק הבית" 600 40px; subtitle "היום, בארבעה בנקים ובארנק" 300 24px (−8px above); lede 300 20px line-height 1.75, max 38ch, with **2 marks** (paper box, ink text); the **balance numeral** `₪58,555` at **252px**, overflow 14.25px past the foot, pushed to the bottom (`margin-block-start: auto`, `margin-inline-start: −6px`).
- [ ] **Account sheets** (column 440 wide, 10px apart, `margin-block-end: −14px` so the last runs off the foot): **5 sheets** — Leumi, Discount, Mizrahi-Tefahot, Hapoalim, cash — radius 26, padding 12 22 (the last 26 at its foot), grid `1fr auto` with gaps 4/16; name 600 18px, account label 300 15px, figure Karantina 52px line-height 0.8 (no bleed). Odd ones rotate **−1.2°**, even ones **+1°** and sit **18px** toward the inline end. Foot shadow `0 2px 0` box at 25%.
- [ ] **Month sheet** (sapphire; span 4 = 368 wide, x 792, top 560 = balance foot + 16; stretches to its row; padding-block-end 0): title "אוקטובר עד היום" 600 30px; subtitle "יום 9 מתוך 31" 300 21px (−10px above); **2 rows** (נכנס ₪23,900, יצא ₪14,362) 17px with 2px tint-30% lines, amounts 600; a **track** 14px tall, 2px tint border, 2px padding, filled to 60%; the note 300 16px line-height 1.75 with **1 mark** ("60%", box with lifted sapphire); the **charges by day**: 3 rows, 36px min, grid `40px 1fr auto`, the day in Karantina 34px (no bleed), the issuer **chips** (5 in all: Isracard + Diners on the 2nd, Max + Amex on the 10th, Cal on the 15th), the amount 600; a charged row at opacity 0.72 (0.78 in light, D-1) with a 2px line through its amount; "נשאר החודש" 600 17px pushed to the bottom; the **left-this-month numeral** `₪9,538` at **168px**, overflow 9.5px.
- [ ] **Categories sheet** (paper; span 8 = 752 wide, x 24, same row; padding 34 38; gap 18): the sheet head (title "אוקטובר לפי קטגוריה" 600 30px, subtitle "₪14,362 בעשר קטגוריות" 300 21px) with a **pill** "קטגוריות" at the inline end; **10 hue bars**: rows 32px min, grid `128px 1fr 84px`, gap 14, 7px apart; 16px name; the bar 30px tall, full radius, at least 30px long, its length relative to the largest (rent 100%); amounts 500 at the inline end.
- [ ] **Transactions sheet** (paper; span 7 = 656 wide, x 504, top 1187; gap 4): the sheet head (title "תנועות אחרונות", subtitle "128 החודש, 3 מחכות לקטגוריה") with a **round** arrow button; **3 day headings** (14px 600, padding 16 0 6, 2px line); **8 rows**: 64px min, grid `auto 1fr auto`, gap 14, padding-block 8, 2px line (none on the last); the **hue pill**; the merchant 600 17px line-height 1.3; the meta line 300 14px quiet ink, 3px below, with the category name and a **chip** (9 chips in the rows); the amount 500 17px; income in `--income` with a "+".
- [ ] **Wallet column** (no sheet; span 5 = 464 wide, x 24, top 1187; 8px gaps): head (padding 14 8 8; title "כרטיסים" 600 30px, subtitle "₪8,942 יורדים מהבנק החודש" 300 21px; a **pill** "+ כרטיס"); **5 card sheets** in company colours (Isracard, Max, Cal, Diners, Amex), each radius 36, ≥ 108 tall (measured 110), padding 18 26 0, flex with the figure at the foot; text column (padding-block-end 16): name 600 20px, holder and last 4 in 300 15px, **1 mark** "חיוב ב־2" 13px 8px below; the **card numeral** at **104px**, overflow 3.97px (half depth); every second sheet `row-reverse` with its text at the end. Then the **cash sheet** (yellow; radius 44; padding 22 28 0; grid `1fr auto`, gaps 10/16): title "קופת מזומן" 600 22px, subtitle "נספר ב־6 באוק׳" 300 17px, **2 pills** (ספירה, משיכה), the **cash numeral** `₪1,830` at **150px** spanning both columns, overflow 8.48px.
- [ ] **Counts over the frame:** 15 sheets, 8 numerals, 8 marks, 10 hue bars, 8 hue pills (6 filled), 14 chips, 5 pills, 3 round buttons, 3 day headings, 5 account sheets, 5 card sheets, 9 nav items, 2 avatars. **In the 900px fold:** 8 sheets, 1 numeral, 3 marks.
- [ ] **Colours in the fold (≥ 0.25% each):** light — sapphire, Leumi, Hapoalim, Discount, Mizrahi, cash, Diners, Amex, the indigo and green hues and two more at 1/8 scale (12 in all; the harness reads the exact set live from the concept); dark — 11, including the ink sheet (night).

### Phone Cards (first `.phone`, 390×844 inside an 8px bezel)

- [ ] **Status band** 46px (the app's mark-and-account row takes this place).
- [ ] **Body:** padding-inline 12, sheets **8px** apart.
- [ ] **Head** (padding 4 8 6): "כרטיסים" Karantina 700 **76px** line-height 0.8; a **solid pill** "+ כרטיס" 44px tall, 16px padding, 15px.
- [ ] **Summary sheet** (ink; 366 wide; radius **36**; padding 20 22 0; grid `1fr auto`, gaps 4/12): title "יורד מהבנק החודש" 600 20px, subtitle "חמישה כרטיסים, שלושה מועדים" 300 16px; a line 300 14.5px line-height 1.7 with **1 mark** (the next charge: "₪2,829 ב־10 באוקטובר, מלאומי"); the **numeral** `₪8,942` at **118px**, overflow 4.52px.
- [ ] **Card sheets:** **4 drawn in the frame** (Isracard, Max, Cal, Diners), radius **34**, **124** tall, padding 16 20 0, name 600 19px, the numeral at **92px**, overflow 2.67px, sides alternating; 1 mark each.
- [ ] **Tab bar** (the app keeps its own four tabs; decision 27): text pills 44px, the current one ink-filled.
- [ ] **Counts:** 5 sheets, 5 numerals, 5 marks, 1 pill.
- [ ] **Colours:** light — sapphire (the pill), Isracard, Max, Cal, Diners; dark — the same plus night.

### Phone add card (second `.phone`) and desktop pop-out (`.deskmodal`) — reserved for the add-card branch

- [ ] Phone: a text-button top bar (ביטול, "כרטיס חדש"), progress "שלב 1 מתוך 7" with 7 segments (8px, the first sapphire), the question 600 32px with a 300 19px subtitle, **6 tiles** (Isracard, Cal, Max, Amex, Diners, "לא ברשימה" with a 2px ink inset edge), 70px min, radius 28, the selected one with a paper ring and an ink ring and a "נבחרה ✓" mark; footer pills 52px in a `1fr 2fr` grid (חזרה, solid המשך).
- [ ] Desktop: dialog **1140×732**, radius **64**, columns **232 / 1fr / 360**, on the paper over a blurred scrim with `0 40px 80px -30px` shadow; steps column (title 600 24px, subtitle 300 17px, 7 steps as 46px pills with 32px outlined numbers, the current ink-filled with its number on sapphire); body (2px lines both sides; question 48px / 24px; tiles 2 across, 96px, radius 32; footer pills ≥ 150px wide at the inline end); preview: the ink box sheet, inset 12, radius 52, padding 30, a round ×, a `CardFace` tilted −4° (aspect 1.586, radius 22), a sample row with a hue pill and a chip.

### Screens the concept does not draw — built from its vocabulary

The spec (§5) gives their structure; the concept gives every atom. For each, the harness checks counts from the household, metrics from the atoms above, no off-palette colour, the colours it must show, and, once the user approves its picture, structure against that golden.

- [ ] **Feed, phone:** the same sheets as the desktop in one column, 8px apart, in the order balance (account sheets under the text), month, categories (7 bars and "Other", a pill to Categories), recent transactions (a round arrow to the full list), wallet (5 card sheets, the cash sheet). Phone sizes: balance 118, left 96, card 92, cash 96; sheet radius 36; the 76px Karantina head with the Add pill.
- [ ] **Cards, desktop:** the summary as a full-width ink sheet (balance-size numeral, 252px cap) with the next charge in a mark; then card sheets in a span-7 column beside a span-5 details pane (`@wide`), 8px apart, radius 36, 104px numerals; details below `@wide` in the end-side panel.
- [ ] **A card's page** (`?card=`): a paper sheet with the `CardFace` (aspect 1.586, radius 22, flat), the bills by month as rows with 2px lines, the rate and fees, "Edit card" as a pill.
- [ ] **Cash:** the cash pot as a yellow sheet (radius 44, 150px numeral, Count and Withdraw pills); one sheet per person (paper, sides alternating) with their amount (Karantina 52, no bleed), "counted on", Count, Withdraw and Deposit pills; the moves on a paper sheet; at `@wide` the month's in and out beside it.
- [ ] **Categories:** two paper sheets (expense, income; 6 + 6 at `@wide`), each row a hue pill, the monochrome icon, the name 600, this month's total as a hue bar, the ⋯ menu; the editor's hue picker as two rows of 44px pills.
- [ ] **Chart:** the plot on a paper sheet (span 8 at `@wide`), the stats on a paper sheet beside it (span 4): in, out and net as figures in marks, the five largest categories as hue bars, the largest and the average month.
- [ ] **Commitments:** the list on a paper sheet (span 8), the totals by kind and the next charges on a sapphire-free paper sheet (span 4); the list's rows like feed rows.
- [ ] **Bank accounts:** one sheet per account in its bank's colour, 3 across at `@wide` (2 at `@board`, 4 at `@vast`): name 600, branch and mask 300, the income that goes to it, its figure in a mark.
- [ ] **Settings:** two panes from `@board`: the subjects as a paper sheet of 48px nav pills (span 4), the open subject as a paper sheet (span 8); `/settings` becomes `/settings/account` on desktop.
- [ ] **Add transaction panel:** 480px end-side sheet (radius 56 at 1440), header and body on one inline padding (28px), a 16px gap under the title pair, Cancel as a 48px outline pill and Save as a 48px solid pill side by side at the inline end, each ≥ 150px.
- [ ] **Smart import pop-out:** the dialog geometry of the concept's `.dialog` (1140×732, radius 64, 232 / 1fr / 360 at ≥ 1040px), its three steps in `PopOutSteps`, the found card in `PopOutPreview` on the ink box sheet.

## File Structure

| File                                                                                                                                                                                                               | Task   | Responsibility                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/fidelity/config.ts`                                                                                                                                                                                           | 1      | Paths (outside the repo), the concept's hash, viewports, frame heights, thresholds, element kinds and tolerances, token bins                               |
| `e2e/fidelity/concept-household.ts`                                                                                                                                                                                | 1      | The concept's household as a backup envelope built on the app's own export                                                                                 |
| `src/db/concept-household.test.ts`                                                                                                                                                                                 | 1      | Validates the household with the app's schema and import, and pins the figures the concept shows (balance, in and out, categories, bills, cash, row count) |
| `e2e/fidelity/seed.setup.ts`                                                                                                                                                                                       | 1      | Restores the household once (and saves an empty household) as Playwright storage state, IndexedDB included                                                 |
| `e2e/fidelity/concept.ts`                                                                                                                                                                                          | 1      | Opens the concept with local fonts, reads its tokens, shoots its frames                                                                                    |
| `e2e/fidelity/probe.ts`                                                                                                                                                                                            | 1      | In-page measuring: element counts and layout probes                                                                                                        |
| `e2e/fidelity/score.ts`                                                                                                                                                                                            | 1      | In-browser image maths: structure (SSIM), palette, colours on screen, the side-by-side image                                                               |
| `e2e/fidelity/screens.ts`                                                                                                                                                                                          | 1      | Every screen's expectations: route, size, concept frame, counts, metrics, colours                                                                          |
| `e2e/fidelity/run.ts`                                                                                                                                                                                              | 1      | Runs one screen in one theme, writes the outputs, returns the failures                                                                                     |
| `e2e/fidelity/fidelity.spec.ts`, `selftest.spec.ts`                                                                                                                                                                | 1      | The gate's tests; the scorer's calibration                                                                                                                 |
| `playwright.config.ts`, `package.json`, `knip.json`                                                                                                                                                                | 1      | The `fidelity-seed` and `fidelity` projects, the run id, `pnpm fidelity`, knip entries                                                                     |
| `src/i18n/locales/{en,he}/*.json`                                                                                                                                                                                  | 2      | Every phase 3 string                                                                                                                                       |
| `src/index.css`, `src/lib/stylesheet.test.ts`                                                                                                                                                                      | 2      | Sheet padding tokens, the numeral rule by advance widths, the sheet border in `@layer base`                                                                |
| `src/lib/money.ts`                                                                                                                                                                                                 | 2      | `ratioPercent()`                                                                                                                                           |
| `src/components/ui/button.tsx`                                                                                                                                                                                     | 2      | `data-variant` on every button                                                                                                                             |
| `src/components/ui/sheet-surface.tsx`, `chip.tsx`, `hue-pill.tsx`                                                                                                                                                  | 3      | `Sheet`, `SheetHead`, `Chip`, `HuePill`                                                                                                                    |
| `src/components/ui/numeral.tsx`, `numeral-units.ts`, `hue-bars.tsx`, `mark.tsx`, `e2e/22-numerals.spec.ts`                                                                                                         | 4      | Numerals that fit their own column; relative hue bars; marks that may wrap; the sideways check                                                             |
| `src/components/ui/editor-panel.tsx`, `pop-out.tsx` and the 9 editors, split, reconvert, import footers                                                                                                            | 5      | 48px pill footers; header and body on one padding                                                                                                          |
| `src/app/routes.ts`, `app-shell.tsx`, `screen-head.tsx`, `top-bar.tsx`, `src/components/person-avatar.tsx`, `src/domain/palette.ts`, `src/features/account/user-menu.tsx`, `src/features/summary/month-cursor.tsx` | 6      | The rail's order and labels, the household at its foot, house-palette avatars, the greeting, the search pill, the bold month picker                        |
| `src/domain/month-bills.ts`, `src/features/cards/use-month-bills.ts`                                                                                                                                               | 7      | This month's card bills by day: one source for the lede, the month sheet, the wallet and Cards                                                             |
| `src/features/feed/board/feed-board.tsx`, `balance-sheet.tsx`, `account-sheets.tsx`, `src/features/summary/summary-cards.tsx`, `src/features/feed/feed-screen.tsx`                                                 | 7      | The 12-column board and the balance sheet                                                                                                                  |
| `src/features/feed/board/month-sheet.tsx`                                                                                                                                                                          | 8      | The sapphire month sheet                                                                                                                                   |
| `src/features/feed/board/categories-sheet.tsx`                                                                                                                                                                     | 9      | The categories sheet                                                                                                                                       |
| `src/features/feed/board/transactions-sheet.tsx`, `feed-rows.tsx`, `virtual-feed.tsx`, `filter-bar.tsx`                                                                                                            | 10     | The transactions sheet and the concept's rows                                                                                                              |
| `src/features/feed/board/wallet-column.tsx`, `src/features/cash/cash-sheet.tsx`                                                                                                                                    | 11     | Card sheets and the cash sheet                                                                                                                             |
| `src/features/feed/board/recent-rows.tsx`, `feed-screen.tsx`, `src/features/summary/collapsed-bar.tsx`                                                                                                             | 12     | The phone board, list mode, the whole feed                                                                                                                 |
| `src/features/cards/cards-screen.tsx`, `cards-summary.tsx`, `card-sheets.tsx`, `card-details.tsx`                                                                                                                  | 13, 14 | Cards and a card's page                                                                                                                                    |
| `src/features/cash/*`                                                                                                                                                                                              | 15     | Cash                                                                                                                                                       |
| `src/features/settings/categories-screen.tsx`, `hue-picker.tsx`                                                                                                                                                    | 16     | Categories and the hue picker                                                                                                                              |
| `src/features/chart/*`                                                                                                                                                                                             | 17     | Chart                                                                                                                                                      |
| `src/features/commitments/*`                                                                                                                                                                                       | 18     | Commitments                                                                                                                                                |
| `src/features/bank-accounts/*`                                                                                                                                                                                     | 19     | Bank accounts                                                                                                                                              |
| `src/features/settings/settings-screen.tsx`, `settings-page.tsx`, `settings-layout.tsx`, `src/app/app-routes.tsx`                                                                                                  | 20     | Settings in two panes                                                                                                                                      |
| `src/features/transaction/transaction-sheet.tsx`, `src/features/import/import-sheet.tsx`, `import-steps.tsx`                                                                                                       | 21     | The add-transaction panel, Smart import's steps and preview, the add-card slot                                                                             |
| `.superpowers/concepts-2026-10-09/money-sheets-bold-empty.html` (git-ignored), `e2e/fidelity/*` (appended)                                                                                                         | 22     | The approved empty concept and the harness's empty screens                                                                                                 |
| `src/components/ui/ghost.tsx`, every screen's empty branch, `src/features/first-run/*`                                                                                                                             | 23     | Empty states and the first run                                                                                                                             |
| `src/features/account/*`, `src/features/household/link-screen.tsx`, `wipe-screen.tsx`                                                                                                                              | 24     | The front door and the account screens                                                                                                                     |
| `scripts/emails.mjs`, `scripts/email-preview.mjs`, `supabase/templates/*`, `public/email/*`                                                                                                                        | 25     | The emails                                                                                                                                                 |
| (any, per findings)                                                                                                                                                                                                | 26     | The dark-mode pass                                                                                                                                         |
| `src/index.css`, `src/components/ui/*`                                                                                                                                                                             | 27     | Motion opt-in clean-up                                                                                                                                     |
| `README.md`, the spec, `package.json`, `e2e/screens.spec.ts`                                                                                                                                                       | 28     | The final whole-app run and the record                                                                                                                     |

## Tasks

1. The fidelity harness: the concept household, the three checks, the side-by-side images, and a baseline that proves the shipped app fails.
2. Phase 3 vocabulary: every new string, the stylesheet rules, `ratioPercent`, and the `Button` variant marker.
3. `Sheet`, `SheetHead`, `Chip` and `HuePill`.
4. `Numeral` that fits its own column, relative `HueBars`, `Mark` that may wrap, and the sideways numeral check.
5. Editors: 48px outline and solid pills in every footer, the panel header on the body's padding, pop-out footers.
6. The rail, the top bar and the household: the concept's order and labels, house-palette avatars, the greeting, the search pill and the bold month picker.
7. The feed board and the balance sheet (with this month's card bills).
8. The month sheet.
9. The categories sheet.
10. The transactions sheet and the concept's rows.
11. The wallet column and the cash sheet.
12. The feed on a phone, list mode, and the whole feed at both sizes.
13. Cards: the summary, a sheet per card, the details pane.
14. A card's page: the details pane's content.
15. Cash.
16. Categories, with the hue picker.
17. Chart.
18. Commitments.
19. Bank accounts.
20. Settings in two panes.
21. The add-transaction panel, Smart import's steps and preview, and the add-card slot.
22. The empty concept, and the harness's empty screens (added scope).
23. Empty states on every screen, and the first run (added scope).
24. The front door and the account screens (added scope).
25. The emails (added scope).
26. The dark-mode pass.
27. Motion opt-in clean-up (3j).
28. The whole app against the concept: the final run, 1920 and 1024, the English mirror, `verify:full`, README and spec.

## Parallel groups

Tasks in braces touch disjoint files and can run in sibling worktrees (`C:/dev/gbp3-t<N>`, cherry-picked onto `colour-phase-3` in task order); arrows are order. Harness runs inside a group are still one at a time (port 4173).

**1 → 2 → {3, 4, 5, 6} → 7 → {8, 9, 10, 11} → 12 → {13 → 14, 15, 16, 17, 18, 19, 20, 21} → 22 → {23, 24, 25} → 26 → 27 → 28**

- 1 owns `e2e/fidelity/**`, the Playwright config, `package.json` scripts and `knip.json`, and defines every screen's expectations up front, so no later task edits the harness. A later task that believes an expectation is wrong stops and asks; it does not edit `screens.ts`.
- 2 lands every string (`src/i18n/locales/**`) and every `src/index.css` rule the later tasks use, so none of them touches either.
- 3 (`sheet-surface.tsx`, `chip.tsx`, `hue-pill.tsx`), 4 (`numeral*.ts(x)`, `hue-bars.tsx`, `mark.tsx`, `card-sheet.tsx`, `e2e/22-numerals.spec.ts`), 5 (`editor-panel.tsx`, `pop-out.tsx`, the editors' action rows, split and reconvert) and 6 (`src/app/*`, `person-avatar.tsx`, `palette.ts`, `user-menu.tsx`, `month-cursor.tsx`, the feed's `ScreenHead` call and `filter-bar.tsx`'s search wrapper) share no file. 5 touches `categories-screen.tsx` only in its editor's action row; 16 comes much later.
- 7 restructures `feed-screen.tsx` and creates the board with one small component file per sheet (month, categories, transactions, wallet as minimal sheets). 8, 9, 10 and 11 each replace exactly one of those files (10 also owns `feed-rows.tsx`, `virtual-feed.tsx`, `filter-bar.tsx` and the pass-through in `chip.tsx`; 11 also creates `src/features/cash/cash-sheet.tsx`).
- 12 waits for all four. After it, 13–21 live in separate feature folders. 14 waits for 13 (both in `features/cards`). 15 uses 11's `cash-sheet.tsx` without changing it. 21 touches `transaction-sheet.tsx` and `import-sheet.tsx`, which 5 touched first.
- 22 needs the user's yes on the empty concept before 23 starts. 23 (every screen's empty branch, the first run), 24 (the account and household screens of the front door) and 25 (the email builder, nothing in `src/`) share no file; 23 and 24 each append their own harness entries (append only).
- 26, 27 and 28 run last, over everything.

---

## Task 1: The fidelity harness

The gate every later task must pass. It is built and proven before any screen changes: its own self-test calibrates the scorer against the concept, and its first full run must fail on today's app (which is what the audit found by eye).

**Files:**

- Create: `e2e/fidelity/config.ts`, `e2e/fidelity/concept-household.ts`, `e2e/fidelity/seed.setup.ts`, `e2e/fidelity/concept.ts`, `e2e/fidelity/probe.ts`, `e2e/fidelity/score.ts`, `e2e/fidelity/screens.ts`, `e2e/fidelity/run.ts`, `e2e/fidelity/fidelity.spec.ts`, `e2e/fidelity/selftest.spec.ts`
- Create: `src/db/concept-household.test.ts`
- Modify: `playwright.config.ts` (two projects, the run id, `testIgnore` on the old projects), `package.json` (`fidelity` script), `knip.json` (entry `e2e/**/*.setup.ts`)
- Outside the repo: `~/.bookandry-private/design-audit/concept-source/money-sheets-bold-v2.html` (a copy of the approved concept)

**Interfaces:**

- Consumes: the app's backup export and import (`/settings/data`: "ייצוא גיבוי", "החלפה מלאה", "בחירת קובץ גיבוי לשחזור"), `completeFirstRun()` from `e2e/support/seed.ts`, `envelopeSchema` and `importDocument()` (in the unit test only).
- Produces (later tasks rely on these names):
  - `pnpm fidelity [--grep "<tags>"]`; tags `@fid-<screen-id>`, `@fid-<size>`, `@fid-<theme>`, `@fid-selftest`.
  - The **app selector contract** the screens must emit (in `KINDS` and `screens.ts`): `[data-sheet]`, `[data-numeral]` with `data-numeral-size`, `[data-slot="mark"]`, `[data-slot="hue-bars"] i[data-hue]`, `[data-slot="hue-pill"]`, `[data-slot="chip"]`, `[data-variant="pill" | "pill-solid" | "round"]`, `[data-slot="day-heading"]`, `[data-slot="account-sheet"]`, `[data-card-sheet]`, `[data-slot="nav-place"]`, `[data-slot="board"]`, `[data-slot="balance-sheet"]`, `[data-slot="month-sheet"]`, `[data-slot="month-left"]`, `[data-slot="categories-sheet"]`, `[data-slot="transactions-sheet"]`, `[data-slot="wallet"]`, `[data-slot="cash-sheet"]`, `[data-slot="search-pill"]`, `[data-slot="month-picker"]`, `[data-slot="cards-summary"]`, `[data-slot="card-details"]`, `[data-slot="card-face"]`, `[data-slot="cash-person"]`, `[data-slot="cash-moves"]`, `[data-slot="category-row"]`, `[data-slot="chart-sheet"]`, `[data-slot="chart-stats"]`, `[data-slot="commitments-list"]`, `[data-slot="commitments-totals"]`, `[data-slot="bank-account-sheet"]`, `[data-slot="settings-subjects"]`, `[data-slot="settings-subject"]`, `[data-slot="editor-panel"]`, `[data-slot="editor-panel-header"]`, `[data-slot="editor-panel-body"]`, `[data-slot="editor-actions"]`, `[data-slot="popout"]`, `[data-slot="popout-layout"]`, `[data-slot="popout-steps"]`, `[data-slot="popout-preview"]`.
  - The household's ids: people `concept.daniel`, `concept.noa`; accounts `concept.acct.leumi|discount|mizrahi|hapoalim`; cards `concept.card.isracard|max|cal|diners|amex`; the standing order `concept.pm.standing`.

- [ ] **Step 1: Copy the concept out of the main checkout and pin it**

```bash
mkdir -p ~/.bookandry-private/design-audit/concept-source
cp /c/dev/greenback/.superpowers/concepts-2026-10-09/money-sheets-bold-v2.html ~/.bookandry-private/design-audit/concept-source/
sha256sum ~/.bookandry-private/design-audit/concept-source/money-sheets-bold-v2.html
```

Expected: `bac24384aa015c1c2e02e82542166bece5c59aeb74ec022b7ce970c436687ac5`. Any other hash: stop, the approved file has changed; ask the user.

- [ ] **Step 2: Write the failing unit test for the household**

The household is plain JSON built on top of a real export, and the app is the judge of it. This test says what the concept shows and fails until the builder exists.

Create `src/db/concept-household.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { availableBalance, summariseRange, totalsByCategory } from '@/domain/calculators';
import { cardBills, splitBySettlement } from '@/domain/cards';
import { cashSummary } from '@/domain/cash';
import { expandOccurrences } from '@/domain/occurrences';
import { envelopeSchema } from '@/domain/transfer-schema';
import { d } from '@/domain/test-factories';
import { freshDb, type TestDb } from '@/test/db-harness';
import { ALL_PROFILES } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import {
  CARDS,
  CONCEPT_BALANCE_MINOR,
  conceptHousehold,
  type Envelope,
} from '../../e2e/fidelity/concept-household';
import { loadCashInput } from './repos/cash-moves';
import { ensureSettings, writeSettings } from './repos/settings';
import { findCandidates, findOverrides } from './repos/transactions';
import { buildSeedCategories, buildSeedPaymentMethods } from './seed';
import { buildExport, importDocument } from './transfer';

const NOW = '2026-10-09T06:00:00.000Z' as IsoInstant;
const TODAY = d('2026-10-09');

let handle: TestDb;

beforeEach(async () => {
  handle = freshDb();
  await ensureSettings(handle.db, NOW);
  await writeSettings(handle.db, { defaultCurrency: 'ILS' }, NOW);
  await handle.db.categories.bulkPut(buildSeedCategories(NOW));
  await handle.db.paymentMethods.bulkPut(buildSeedPaymentMethods(NOW));
});
afterEach(async () => {
  await handle.dispose();
});

async function restore(): Promise<Envelope> {
  const base = (await buildExport(handle.db, NOW)) as unknown as Envelope;
  const household = conceptHousehold(base);
  const result = await importDocument(handle.db, household, { mode: 'replace', now: NOW });
  expect(result).toMatchObject({ ok: true });
  return household;
}

async function occurrences(from: string, to: string) {
  const transactions = await findCandidates(handle.db, { profileId: ALL_PROFILES, from: d(from), to: d(to) });
  const overrides = await findOverrides(
    handle.db,
    transactions.map((t) => t.id),
  );
  return transactions.flatMap((tx) =>
    expandOccurrences(
      tx,
      overrides.filter((o) => o.transactionId === tx.id),
      d(from),
      d(to),
      { today: TODAY },
    ),
  );
}

describe("the concept's household", () => {
  it('is a valid backup the app restores', async () => {
    const base = (await buildExport(handle.db, NOW)) as unknown as Envelope;
    expect(envelopeSchema.safeParse(conceptHousehold(base)).success).toBe(true);
    await restore();
  });

  it('refuses a base in another currency, rather than restoring the wrong money', async () => {
    const base = (await buildExport(handle.db, NOW)) as unknown as Envelope;
    expect(() => conceptHousehold({ ...base, defaultCurrency: 'USD' })).toThrow(/ILS/);
  });

  it('has the balance the concept shows: ₪58,555', async () => {
    await restore();
    const profiles = await handle.db.profiles.toArray();
    const methods = new Map((await handle.db.paymentMethods.toArray()).map((m) => [m.id, m]));
    // As useBalance does: from a month before the earliest opening, to today, settled by billing day.
    // The household's cards carry no monthly fee, so cardFeeOccurrences adds nothing here.
    const expanded = await occurrences('2026-08-01', '2026-10-09');
    const cutoffs = new Map(profiles.map((p) => [p.id, p.openingBalanceDate]));
    const { settled } = splitBySettlement(expanded, methods, TODAY, cutoffs);
    expect(availableBalance({ profiles, occurrences: settled, baseCurrency: 'ILS' })).toBe(
      CONCEPT_BALANCE_MINOR,
    );
  });

  it('has October so far as the concept: ₪23,900 in, ₪14,362 out, 128 rows, nothing projected', async () => {
    await restore();
    const october = await occurrences('2026-10-01', '2026-10-31');
    expect(october).toHaveLength(128);
    expect(october.every((o) => !o.isProjected)).toBe(true);
    expect(summariseRange(october)).toMatchObject({ incomeMinor: 2_390_000, expenseMinor: 1_436_200 });
  });

  it("has the concept's ten categories this month", async () => {
    await restore();
    const totals = totalsByCategory(await occurrences('2026-10-01', '2026-10-09'), 'expense');
    expect(totals.map((t) => [t.categoryId, t.totalMinor])).toEqual([
      ['cat.rent', 560_000],
      ['cat.groceries', 284_000],
      ['cat.dining', 121_500],
      ['cat.kids', 112_000],
      ['cat.transport', 96_000],
      ['cat.utilities', 84_000],
      ['cat.shopping', 72_800],
      ['cat.health', 46_000],
      ['cat.subscriptions', 38_900],
      ['cat.entertainment', 21_000],
    ]);
  });

  it("bills the concept's cards in October: ₪8,942 on the 2nd, 10th and 15th", async () => {
    await restore();
    const methods = await handle.db.paymentMethods.toArray();
    const all = await occurrences('2026-09-01', '2026-10-31');
    const october = (id: string) => {
      const card = methods.find((m) => m.id === id);
      if (card === undefined) throw new Error(id);
      return cardBills(all, card).find((bill) => bill.chargeDate.startsWith('2026-10'));
    };
    expect(october(CARDS.isracard)).toMatchObject({ chargeDate: '2026-10-02', totalMinor: 321_400 });
    expect(october(CARDS.diners)).toMatchObject({ chargeDate: '2026-10-02', totalMinor: 102_300 });
    expect(october(CARDS.max)).toMatchObject({ chargeDate: '2026-10-10', totalMinor: 214_000 });
    expect(october(CARDS.amex)).toMatchObject({ chargeDate: '2026-10-10', totalMinor: 68_900 });
    expect(october(CARDS.cal)).toMatchObject({ chargeDate: '2026-10-15', totalMinor: 187_600 });
  });

  it('has ₪1,830 in cash, counted on 6 October', async () => {
    await restore();
    const summary = cashSummary(await loadCashInput(handle.db, { profileId: ALL_PROFILES, today: TODAY }));
    expect(summary.onHandMinor).toBe(183_000);
    expect(summary.countedOn).toBe('2026-10-06');
  });
});
```

Run: `pnpm exec vitest run --project db src/db/concept-household.test.ts`
Expected: FAIL — `Cannot find module '../../e2e/fidelity/concept-household'`.

(If `loadCashInput`'s second argument has another shape, read `src/db/repos/cash-moves.ts` and pass what `useCashData` passes; if `freshDb()` already seeds the built-ins, the two `bulkPut` lines are harmless.)

- [ ] **Step 3: Build the household**

Create `e2e/fidelity/concept-household.ts`:

```ts
/**
 * The concept's household, as a backup the app restores.
 *
 * money-sheets-bold-v2.html draws Daniel and Noa on Friday 9 October 2026: four
 * bank accounts and cash, five cards, ten categories this month. The fidelity
 * harness compares the app with that page, so the app gets the same household,
 * restored through its own export and import (no test hook), as
 * e2e/10-feed-scale.spec.ts does.
 *
 * Plain JSON on purpose: e2e has no '@' alias, and the app's own schema checks
 * every row when it is restored (and in src/db/concept-household.test.ts).
 *
 * The figures the concept shows and this household reproduces exactly: the
 * balance ₪58,555; October so far ₪23,900 in and ₪14,362 out, left ₪9,538; the
 * ten categories; bills of ₪4,237 on the 2nd (Isracard, Diners, charged),
 * ₪2,829 on the 10th (Max, Amex) and ₪1,876 on the 15th (Cal), ₪8,942 in all;
 * ₪1,830 cash counted on the 6th; 128 rows this month. Every recurring income
 * lands on or before the 9th, so October has no projected row and the
 * transactions sheet opens on today, as the concept's does: 2 rows today,
 * 3 yesterday, 3 on Wednesday the 7th.
 */

type Row = Record<string, unknown>;

export type Envelope = {
  readonly defaultCurrency: string;
  readonly counts: Record<string, number>;
  readonly settings: Record<string, unknown>;
  readonly data: {
    readonly profiles: readonly Row[];
    readonly categories: readonly Row[];
    readonly paymentMethods: readonly Row[];
    readonly transactions: readonly Row[];
    readonly overrides: readonly Row[];
    readonly cashMoves?: readonly Row[];
  };
  readonly [key: string]: unknown;
};

export const CONCEPT_TODAY = '2026-10-09';
/** ₪58,555: opening ₪26,604 plus everything settled since 1 September (₪31,951). */
export const CONCEPT_BALANCE_MINOR = 5_855_500;

export const PEOPLE = { daniel: 'concept.daniel', noa: 'concept.noa' } as const;
export const ACCOUNTS = {
  leumi: 'concept.acct.leumi',
  discount: 'concept.acct.discount',
  mizrahi: 'concept.acct.mizrahi',
  hapoalim: 'concept.acct.hapoalim',
} as const;
export const CARDS = {
  isracard: 'concept.card.isracard',
  max: 'concept.card.max',
  cal: 'concept.card.cal',
  diners: 'concept.card.diners',
  amex: 'concept.card.amex',
} as const;
const STANDING = 'concept.pm.standing';
const SHARED = '*';
const AT = '2026-09-01T06:00:00.000Z';
const OPENED = '2026-09-01';
const SERIES_MAX = '9999-12-31';

/** `total` agorot in `count` whole parts, the first taking the remainder. */
function parts(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => (i === 0 ? total - base * (count - 1) : base));
}

function profile(id: string, name: string, color: string, openingMinor: number): Row {
  return {
    id,
    name,
    color,
    openingBalanceMinor: openingMinor,
    openingBalanceCurrency: 'ILS',
    openingBalanceDate: OPENED,
    createdAt: AT,
    updatedAt: AT,
  };
}

function account(
  id: string,
  profileId: string,
  bank: string,
  label: string,
  holders?: readonly string[],
): Row {
  return {
    id,
    profileId,
    type: 'bank_account',
    label,
    account: {
      bank,
      branch: '800',
      number: '1234567',
      holding: holders === undefined ? 'personal' : 'joint',
      ...(holders === undefined ? {} : { holders }),
    },
    isArchived: 0,
    createdAt: AT,
    updatedAt: AT,
  };
}

function card(
  id: string,
  profileId: string,
  issuer: string,
  network: string,
  lastDigits: string,
  billingDay: number,
  label: string,
  accountId: string,
): Row {
  return {
    id,
    profileId,
    type: 'credit_card',
    label,
    card: { issuer, network, kind: 'non_bank', lastDigits, billingDay, accountId },
    isArchived: 0,
    createdAt: AT,
    updatedAt: AT,
  };
}

type TxInput = {
  readonly profile: string;
  readonly kind: 'income' | 'expense';
  readonly category: string;
  readonly minor: number;
  readonly date: string;
  readonly method?: string;
  readonly destination?: string;
  readonly note: string;
  /** Monthly on this day, from `date` on. */
  readonly monthly?: number;
};

const OWNER: Record<string, string> = {
  [CARDS.isracard]: PEOPLE.daniel,
  [CARDS.max]: PEOPLE.daniel,
  [CARDS.cal]: PEOPLE.noa,
  [CARDS.diners]: PEOPLE.noa,
  [CARDS.amex]: PEOPLE.daniel,
};
const CARD_ORDER = [CARDS.isracard, CARDS.max, CARDS.cal, CARDS.diners, CARDS.amex] as const;

/** October's ten categories, less the rows drawn one by one below, spread over the 1st to the 6th. */
const OCTOBER_FILL: readonly {
  readonly category: string;
  readonly minor: number;
  readonly count: number;
  readonly notes: readonly string[];
}[] = [
  {
    category: 'cat.groceries',
    minor: 284_000 - 41_260 - 63_815,
    count: 46,
    notes: ['שופרסל אקספרס', 'יוחננוף', 'ויקטורי', 'טיב טעם'],
  },
  {
    category: 'cat.dining',
    minor: 121_500 - 5_800 - 3_200,
    count: 23,
    notes: ['קפה גרג', 'מסעדת הדסון', 'וולט', 'בורגרים'],
  },
  { category: 'cat.kids', minor: 112_000, count: 8, notes: ['צהרון', 'חוג שחייה', 'טויס אר אס'] },
  { category: 'cat.transport', minor: 96_000 - 28_640, count: 12, notes: ['רב-קו', 'סונול', 'גט טקסי'] },
  { category: 'cat.utilities', minor: 84_000 - 41_200, count: 2, notes: ['תאגיד המים', 'סופרגז'] },
  { category: 'cat.shopping', minor: 72_800, count: 10, notes: ['זארה', 'איקאה', 'KSP'] },
  { category: 'cat.health', minor: 46_000, count: 5, notes: ['סופר-פארם', 'מכבי'] },
  { category: 'cat.subscriptions', minor: 38_900 - 5_490, count: 6, notes: ['ספוטיפיי', 'דיסני+', 'iCloud'] },
  { category: 'cat.entertainment', minor: 21_000, count: 4, notes: ['סינמה סיטי', 'הבימה'] },
];

export function conceptHousehold(base: Envelope): Envelope {
  if (base.defaultCurrency !== 'ILS') {
    throw new Error(`The concept household is in ILS; the app's base is ${base.defaultCurrency}.`);
  }

  let serial = 0;
  const tx = (input: TxInput): Row => {
    serial += 1;
    // A series sorts after the one-off rows of its day (`m` after the digits), as the concept lists them.
    const id = `concept.tx.${input.monthly === undefined ? '' : 'm'}${String(serial).padStart(3, '0')}`;
    return {
      id,
      profileId: input.profile,
      kind: input.kind,
      categoryId: input.category,
      ...(input.method === undefined ? {} : { paymentMethodId: input.method }),
      ...(input.destination === undefined ? {} : { destinationId: input.destination }),
      money: {
        amountMinor: input.minor,
        currency: 'ILS',
        baseCurrency: 'ILS',
        baseAmountMinor: input.minor,
        rateUsed: '1',
        rateDate: input.date,
        rateSource: 'manual',
      },
      recurrence:
        input.monthly === undefined ? { type: 'one_time' } : { type: 'monthly', dayOfMonth: input.monthly },
      date: input.date,
      note: input.note,
      seriesStart: input.date,
      seriesEnd: input.monthly === undefined ? input.date : SERIES_MAX,
      isDeleted: 0,
      seriesRootId: id,
      createdAt: AT,
      updatedAt: AT,
    };
  };

  const profiles = [
    // Opening ₪26,604 in all on 1 September; the rest of the ₪58,555 is the flows below.
    profile(PEOPLE.daniel, 'דניאל', '#16794a', 1_460_400),
    profile(PEOPLE.noa, 'נועה', '#0f766e', 1_200_000),
  ];

  const builtinMethods = base.data.paymentMethods.filter(
    (m) => m['id'] === 'pm.cash' || m['id'] === 'pm.cheque',
  );
  const paymentMethods = [
    ...builtinMethods,
    account(ACCOUNTS.leumi, SHARED, '10', 'עו״ש משותף', [PEOPLE.daniel, PEOPLE.noa]),
    account(ACCOUNTS.discount, PEOPLE.noa, '11', 'החשבון של נועה'),
    account(ACCOUNTS.mizrahi, SHARED, '20', 'חיסכון לילדים', [PEOPLE.daniel, PEOPLE.noa]),
    account(ACCOUNTS.hapoalim, PEOPLE.daniel, '12', 'החשבון של דניאל'),
    card(
      CARDS.isracard,
      PEOPLE.daniel,
      'isracard',
      'isracard',
      '4821',
      2,
      'ישראכרט פלטינום',
      ACCOUNTS.hapoalim,
    ),
    card(CARDS.max, SHARED, 'max', 'mastercard', '0937', 10, 'מקס משותף', ACCOUNTS.leumi),
    card(CARDS.cal, PEOPLE.noa, 'cal', 'visa', '3306', 15, 'כאל', ACCOUNTS.discount),
    card(CARDS.diners, PEOPLE.noa, 'diners', 'diners', '7712', 2, 'דיינרס', ACCOUNTS.discount),
    card(CARDS.amex, PEOPLE.daniel, 'amex', 'amex', '1009', 10, 'אמריקן אקספרס זהב', ACCOUNTS.leumi),
    {
      id: STANDING,
      profileId: SHARED,
      type: 'standing_order',
      label: 'הוראת קבע, לאומי',
      isArchived: 0,
      createdAt: AT,
      updatedAt: AT,
    },
  ];

  const transactions: Row[] = [
    // Every month from September, all on or before the 9th: ₪23,900 in each month.
    tx({
      profile: PEOPLE.daniel,
      kind: 'income',
      category: 'cat.salary',
      minor: 1_375_000,
      date: '2026-09-01',
      destination: ACCOUNTS.hapoalim,
      note: 'משכורת, דניאל',
      monthly: 1,
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'income',
      category: 'cat.otherIncome',
      minor: 45_000,
      date: '2026-09-03',
      destination: ACCOUNTS.leumi,
      note: 'שכירות חניה',
      monthly: 3,
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'income',
      category: 'cat.otherIncome',
      minor: 34_000,
      date: '2026-09-05',
      destination: ACCOUNTS.mizrahi,
      note: 'קצבת ילדים',
      monthly: 5,
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'income',
      category: 'cat.salary',
      minor: 936_000,
      date: '2026-09-07',
      destination: ACCOUNTS.discount,
      note: 'משכורת, נועה',
      monthly: 7,
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.rent',
      minor: 560_000,
      date: '2026-09-01',
      method: STANDING,
      note: 'שכר דירה',
      monthly: 1,
    }),

    // September on the cards: October's bills.
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.health',
      minor: 121_400,
      date: '2026-09-12',
      method: CARDS.isracard,
      note: 'סופר-פארם',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.groceries',
      minor: 200_000,
      date: '2026-09-20',
      method: CARDS.isracard,
      note: 'שופרסל דיל',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.dining',
      minor: 14_000,
      date: '2026-09-14',
      method: CARDS.max,
      note: 'קפה גרג',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.shopping',
      minor: 200_000,
      date: '2026-09-22',
      method: CARDS.max,
      note: 'איקאה',
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'expense',
      category: 'cat.transport',
      minor: 37_600,
      date: '2026-09-11',
      method: CARDS.cal,
      note: 'פז',
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'expense',
      category: 'cat.groceries',
      minor: 150_000,
      date: '2026-09-25',
      method: CARDS.cal,
      note: 'רמי לוי',
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'expense',
      category: 'cat.shopping',
      minor: 22_300,
      date: '2026-09-16',
      method: CARDS.diners,
      note: 'סטימצקי',
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'expense',
      category: 'cat.health',
      minor: 80_000,
      date: '2026-09-26',
      method: CARDS.diners,
      note: 'מכבי',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.subscriptions',
      minor: 5_490,
      date: '2026-09-08',
      method: CARDS.amex,
      note: 'נטפליקס',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.entertainment',
      minor: 63_410,
      date: '2026-09-18',
      method: CARDS.amex,
      note: 'אל על',
    }),

    // October's rows the concept draws by name.
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.groceries',
      minor: 41_260,
      date: '2026-10-09',
      method: CARDS.isracard,
      note: 'שופרסל דיל',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.dining',
      minor: 5_800,
      date: '2026-10-09',
      method: CARDS.max,
      note: 'ארומה',
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'expense',
      category: 'cat.transport',
      minor: 28_640,
      date: '2026-10-08',
      method: CARDS.cal,
      note: 'פז',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.subscriptions',
      minor: 5_490,
      date: '2026-10-08',
      method: CARDS.amex,
      note: 'נטפליקס',
    }),
    // Where the concept draws its ATM withdrawal (a cash move here, which the feed does not list): a row, so the days line up.
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.dining',
      minor: 3_200,
      date: '2026-10-08',
      method: CARDS.max,
      note: 'קפה ג׳ו',
    }),
    tx({
      profile: PEOPLE.noa,
      kind: 'expense',
      category: 'cat.groceries',
      minor: 63_815,
      date: '2026-10-07',
      method: CARDS.diners,
      note: 'רמי לוי',
    }),
    tx({
      profile: PEOPLE.daniel,
      kind: 'expense',
      category: 'cat.utilities',
      minor: 41_200,
      date: '2026-10-07',
      method: STANDING,
      note: 'חברת החשמל',
    }),
  ];

  // The rest of October, on the cards, 1st to 6th: 116 rows. With the 7 above and the 5 monthly, October has 128.
  let n = 0;
  for (const fill of OCTOBER_FILL) {
    parts(fill.minor, fill.count).forEach((minor, i) => {
      const method = CARD_ORDER[n % CARD_ORDER.length] ?? CARDS.isracard;
      transactions.push(
        tx({
          profile: OWNER[method] ?? PEOPLE.daniel,
          kind: 'expense',
          category: fill.category,
          minor,
          date: `2026-10-0${String((n % 6) + 1)}`,
          method,
          note: fill.notes[i % fill.notes.length] ?? fill.category,
        }),
      );
      n += 1;
    });
  }

  const cashMoves: Row[] = [
    {
      id: 'concept.cash.start.daniel',
      profileId: PEOPLE.daniel,
      kind: 'start',
      amountMinor: 83_000,
      date: '2026-10-01',
    },
    {
      id: 'concept.cash.start.noa',
      profileId: PEOPLE.noa,
      kind: 'start',
      amountMinor: 50_000,
      date: '2026-10-01',
    },
    {
      id: 'concept.cash.count.daniel',
      profileId: PEOPLE.daniel,
      kind: 'count',
      amountMinor: 0,
      date: '2026-10-06',
    },
    {
      id: 'concept.cash.count.noa',
      profileId: PEOPLE.noa,
      kind: 'count',
      amountMinor: 0,
      date: '2026-10-06',
    },
    {
      id: 'concept.cash.withdraw',
      profileId: PEOPLE.daniel,
      kind: 'withdraw',
      amountMinor: 50_000,
      date: '2026-10-08',
      accountId: ACCOUNTS.leumi,
    },
  ].map((move) => ({ ...move, isDeleted: 0, createdAt: AT, updatedAt: AT }));

  const data = {
    profiles,
    categories: base.data.categories,
    paymentMethods,
    transactions,
    overrides: [],
    cashMoves,
  };
  return {
    ...base,
    settings: {
      ...base.settings,
      defaultCurrency: 'ILS',
      language: 'he',
      theme: 'system',
      activeProfileId: 'all',
    },
    counts: {
      profiles: data.profiles.length,
      categories: data.categories.length,
      paymentMethods: data.paymentMethods.length,
      transactions: data.transactions.length,
      overrides: 0,
      cashMoves: data.cashMoves.length,
    },
    data,
  };
}
```

Settled since 1 September, for the record (the balance test checks it through the app's own pipeline): income 2 × ₪23,900 = ₪47,800; rent 2 × ₪5,600 and electricity ₪412; the bills charged on 2 October, ₪4,237. That is ₪31,951, and ₪26,604 + ₪31,951 = ₪58,555. The cash moves do not touch the balance (they move cash, not money). A September purchase on Max, Amex or Cal is charged on 10 or 15 October, after today, so it is pending and not counted.

- [ ] **Step 4: Run the household test**

Run: `pnpm exec vitest run --project db src/db/concept-household.test.ts`
Expected: PASS, 7 tests. If the balance differs, the test prints the app's figure: the household is wrong, not the app. Re-check the settled sum above against `splitBySettlement` and `chargeDate` in `src/domain/cards.ts`, correct the two opening balances so their sum is ₪58,555 minus the settled sum, and keep the comment on `CONCEPT_BALANCE_MINOR` true.

- [ ] **Step 5: The harness's configuration**

Create `e2e/fidelity/config.ts`:

```ts
import os from 'node:os';
import path from 'node:path';

/** Where every image and report goes: outside the repo, beside the audit. */
export const OUT_ROOT =
  process.env['FIDELITY_OUT'] ?? path.join(os.homedir(), '.bookandry-private', 'design-audit', 'fidelity');

/** Pictures the user approved, for screens the concept does not draw. */
export const GOLDEN_DIR = path.join(path.dirname(OUT_ROOT), 'fidelity-goldens');

/** The approved concept, copied out of the main checkout (git-ignored there). */
export const CONCEPT_FILE =
  process.env['FIDELITY_CONCEPT'] ??
  path.join(
    os.homedir(),
    '.bookandry-private',
    'design-audit',
    'concept-source',
    'money-sheets-bold-v2.html',
  );

/** money-sheets-bold-v2.html as the user approved it on 2026-10-09. */
export const CONCEPT_SHA256 = 'bac24384aa015c1c2e02e82542166bece5c59aeb74ec022b7ce970c436687ac5';

/** Set once per `playwright test` in playwright.config.ts, so every worker writes to one folder. */
export const RUN_ID = process.env['FIDELITY_RUN'] ?? 'adhoc';

/** The concept's own morning: Friday 9 October 2026 in Israel. */
export const TODAY_INSTANT = '2026-10-09T09:00:00+03:00';

export const STATE = {
  household: path.join('artifacts', 'fidelity', 'concept-household.json'),
  /** The same household with English as its language, for the mirrored run. */
  householdEn: path.join('artifacts', 'fidelity', 'concept-household-en.json'),
  empty: path.join('artifacts', 'fidelity', 'empty-household.json'),
} as const;

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** desktop and phone are the concept's frames; board and vast are the spec's other container sizes. */
export type Size = 'desktop' | 'phone' | 'board' | 'vast';

export const VIEWPORT: Record<Size, { readonly width: number; readonly height: number }> = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
  board: { width: 1024, height: 768 },
  vast: { width: 1920, height: 1080 },
};

/** How tall the concept's frame is: counts and metrics are read inside it. */
export const FRAME_HEIGHT: Record<Size, number> = { desktop: 2097, phone: 844, board: 2400, vast: 2400 };

/** Downscale before the perceptual score: 1/8 on desktop, 1/4 on a phone. Calibrated (see the plan). */
export const SCALE: Record<'desktop' | 'phone', number> = { desktop: 8, phone: 4 };

export const THRESHOLDS = {
  /** Mean SSIM of OKLab lightness. */
  structure: 0.7,
  /** Histogram intersection of the token shares, "other" included. */
  palette: 0.9,
  /** How close a pixel must be to a token to count as it (OKLab distance). */
  deltaE: 0.06,
  /** A colour "is on screen" from this share of the frame. */
  colourShare: 0.0025,
  missingColours: 1,
  extraColours: 2,
  /** A screen the concept does not draw: at most this share off the concept's palette. */
  otherShare: 0.16,
  /** A screen the concept does not draw, against the picture the user approved. */
  golden: 0.9,
} as const;

/** What the concept is built from, and how each thing is found in the concept and in the app. */
export const KINDS = {
  sheet: { concept: '.sheet', app: '[data-sheet]' },
  numeral: {
    concept: '.mega',
    app: '[data-numeral]:not([data-numeral-size="account"]):not([data-numeral-size="day"])',
  },
  mark: { concept: '.mark', app: '[data-slot="mark"]' },
  hueBar: { concept: '.bars .bar i', app: '[data-slot="hue-bars"] i[data-hue]' },
  huePill: { concept: '.tx .sq', app: '[data-slot="hue-pill"]' },
  chip: { concept: '.chip', app: '[data-slot="chip"]' },
  pill: { concept: '.pill', app: '[data-variant="pill"], [data-variant="pill-solid"]' },
  round: { concept: '.round', app: '[data-variant="round"]' },
  dayHeading: { concept: '.day', app: '[data-slot="day-heading"]' },
  accountSheet: { concept: '.acct', app: '[data-slot="account-sheet"]' },
  cardSheet: { concept: '.cardsheet', app: '[data-card-sheet]' },
  navItem: { concept: '.nav-item', app: '[data-slot="nav-place"]' },
} as const;
export type Kind = keyof typeof KINDS;

export const TOLERANCE: Record<Kind, number> = {
  sheet: 1,
  numeral: 0,
  mark: 1,
  hueBar: 0,
  huePill: 1,
  chip: 2,
  pill: 1,
  round: 1,
  dayHeading: 1,
  accountSheet: 0,
  cardSheet: 0,
  navItem: 1,
};

/** The concept's tokens, by the bin name the harness reports them under. */
export const BINS: Record<string, string> = {
  paper: '--paper',
  sheet: '--sheet',
  ink: '--ink',
  box: '--box',
  night: '--night',
  sapphire: '--sapphire',
  'money-leumi': '--leumi',
  'money-hapoalim': '--hapoalim',
  'money-discount': '--discount',
  'money-mizrahi': '--mizrahi',
  'money-isracard': '--isracard',
  'money-cal': '--cal',
  'money-max': '--max',
  'money-amex': '--amex',
  'money-diners': '--diners',
  'money-cash': '--cash',
  'hue-indigo': '--k-rent',
  'hue-green': '--k-groceries',
  'hue-vermilion': '--k-dining',
  'hue-amber': '--k-kids',
  'hue-orange': '--k-transport',
  'hue-cyan': '--k-bills',
  'hue-violet': '--k-shopping',
  'hue-rose': '--k-health',
  'hue-magenta': '--k-subs',
  'hue-teal': '--k-fun',
  'hue-blue': '--k-edu',
  'hue-lime': '--k-gifts',
};
```

- [ ] **Step 6: Seed once, save the browser's state**

Create `e2e/fidelity/seed.setup.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test as setup, type Page } from '@playwright/test';

import { completeFirstRun } from '../support/seed';
import { STATE, TODAY_INSTANT } from './config';
import { conceptHousehold, type Envelope } from './concept-household';

setup.use({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1440, height: 900 } });

async function exportEnvelope(page: Page): Promise<Envelope> {
  await page.goto('/settings/data');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ייצוא גיבוי' }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Envelope;
}

async function storedTransactions(page: Page): Promise<number> {
  return page.evaluate(
    async () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('greenback');
        open.onsuccess = () => {
          const request = open.result
            .transaction('transactions', 'readonly')
            .objectStore('transactions')
            .count();
          request.onsuccess = () => {
            resolve(request.result);
          };
          request.onerror = () => {
            resolve(-1);
          };
        };
        open.onerror = () => {
          resolve(-1);
        };
      }),
  );
}

setup('restore the concept household', async ({ page }) => {
  setup.setTimeout(180_000);
  await page.clock.setFixedTime(new Date(TODAY_INSTANT));
  await completeFirstRun(page, 'he', { demo: false, theme: 'light' });

  // The empty household first: a person, no money. The board's empty states are checked on it.
  await fs.mkdir(path.dirname(STATE.empty), { recursive: true });
  await page.context().storageState({ path: STATE.empty, indexedDB: true });

  const base = await exportEnvelope(page);
  expect(base.defaultCurrency, 'the wizard in he-IL picks shekels').toBe('ILS');
  const household = conceptHousehold(base);

  await restore(page, household);
  await page.goto('/');
  await expect(page.getByTestId('balance-announced')).toContainText('58,555');
  await page.context().storageState({ path: STATE.household, indexedDB: true });

  // Then the English copy, restored from the screen while it is still in Hebrew (the labels above).
  await restore(page, { ...household, settings: { ...household.settings, language: 'en' } });
  await page.evaluate(() => {
    localStorage.setItem('gb.boot', JSON.stringify({ lang: 'en', theme: 'light' }));
  });
  await page.context().storageState({ path: STATE.householdEn, indexedDB: true });
});

/** Replace everything with `envelope`, from the Hebrew data screen, and wait for every row. */
async function restore(page: Page, envelope: Envelope): Promise<void> {
  await page.goto('/settings/data');
  await page.getByRole('radio', { name: 'החלפה מלאה' }).click();
  await page.getByLabel('בחירת קובץ גיבוי לשחזור').setInputFiles({
    name: 'concept-household.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(envelope), 'utf8'),
  });
  await expect
    .poll(async () => storedTransactions(page), {
      timeout: 60_000,
      message: 'the import never wrote every row',
    })
    .toBe(envelope.data.transactions.length);
}
```

- [ ] **Step 7: Open the concept, with the app's own fonts**

Create `e2e/fidelity/concept.ts`:

```ts
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Browser, BrowserContext, Page } from '@playwright/test';

import { BINS, CONCEPT_FILE, CONCEPT_SHA256, FRAME_HEIGHT, type Theme } from './config';
import type { Origin } from './probe';

const FONTSOURCE = path.resolve('node_modules', '@fontsource');
const FONT_ORIGIN = 'https://fidelity-fonts.invalid';
const HEBREW = 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F';
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const SUBSETS = [
  ['latin', LATIN],
  ['hebrew', HEBREW],
] as const;

const FACES = [
  ...SUBSETS.map(([subset, range]) => ({
    family: 'Karantina',
    weight: 700,
    file: `karantina/files/karantina-${subset}-700-normal.woff2`,
    range,
  })),
  ...[300, 400, 500, 600].flatMap((weight) =>
    SUBSETS.map(([subset, range]) => ({
      family: 'IBM Plex Sans Hebrew',
      weight,
      file: `ibm-plex-sans-hebrew/files/ibm-plex-sans-hebrew-${subset}-${String(weight)}-normal.woff2`,
      range,
    })),
  ),
];

/** The concept asks Google Fonts; the harness answers with the app's own files, so both draw alike, offline. */
async function routeFonts(context: BrowserContext): Promise<void> {
  const css = FACES.map(
    (f) =>
      `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${String(f.weight)};font-display:block;` +
      `src:url(${FONT_ORIGIN}/${f.file}) format('woff2');unicode-range:${f.range}}`,
  ).join('\n');
  const cors = { 'access-control-allow-origin': '*' };
  await context.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', headers: cors, body: css }),
  );
  await context.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await context.route(`${FONT_ORIGIN}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'font/woff2',
      headers: cors,
      path: path.join(FONTSOURCE, new URL(route.request().url()).pathname),
    }),
  );
}

export function assertConcept(): void {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(CONCEPT_FILE)).digest('hex');
  if (hash !== CONCEPT_SHA256) {
    throw new Error(`${CONCEPT_FILE} is not the approved concept (sha256 ${hash}). Ask the user.`);
  }
}

export type ConceptPage = { readonly context: BrowserContext; readonly page: Page };

/** 1504px wide, so the page's 1440 frames draw at scale 1 (its own fit script). */
export async function openConcept(browser: Browser, theme: Theme): Promise<ConceptPage> {
  assertConcept();
  const context = await browser.newContext({
    viewport: { width: 1504, height: 900 },
    colorScheme: theme,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  await routeFonts(context);
  const page = await context.newPage();
  await page.goto(pathToFileURL(CONCEPT_FILE).href);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(300);
  return { context, page };
}

export type ConceptFrame =
  | { readonly kind: 'desk' }
  | { readonly kind: 'phone'; readonly index: 0 | 1 }
  | { readonly kind: 'element'; readonly selector: string }
  | { readonly kind: 'dialog' };

export type FrameBox = {
  /** Coordinates are measured from here (page coordinates). */
  readonly origin: Origin;
  /** What the counts are read inside. */
  readonly scope: string;
  readonly scopeIndex: number;
  /** How far down the counts reach, from the origin. */
  readonly height: number;
  /** The picture: page coordinates, for `screenshot({ fullPage: true, clip })`. */
  readonly clip: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
};

export async function frameBox(page: Page, frame: ConceptFrame): Promise<FrameBox> {
  const rect = async (selector: string, index = 0) =>
    page.evaluate(
      ([s, i]) => {
        const el = document.querySelectorAll(s)[i];
        if (el === undefined) throw new Error(`concept: no ${s}`);
        const r = el.getBoundingClientRect();
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
      },
      [selector, index] as const,
    );
  const desk = await rect('.desk');
  switch (frame.kind) {
    case 'desk':
      return {
        origin: desk,
        scope: '.desk',
        scopeIndex: 0,
        height: Math.min(desk.height, FRAME_HEIGHT.desktop),
        clip: { x: desk.x, y: desk.y, width: 1440, height: 900 },
      };
    case 'phone': {
      const phone = await rect('.phone', frame.index);
      // Inside the 8px bezel; the picture stops above the tab bar's foot (390×792).
      const inner = { x: phone.x + 8, y: phone.y + 8 };
      return {
        origin: inner,
        scope: '.phone',
        scopeIndex: frame.index,
        height: FRAME_HEIGHT.phone,
        clip: { ...inner, width: 390, height: 792 },
      };
    }
    case 'element': {
      const el = await rect(frame.selector);
      return { origin: desk, scope: frame.selector, scopeIndex: 0, height: FRAME_HEIGHT.desktop, clip: el };
    }
    case 'dialog': {
      const modal = await rect('.deskmodal');
      return {
        origin: modal,
        scope: '.deskmodal .dialog',
        scopeIndex: 0,
        height: 900,
        clip: { x: modal.x, y: modal.y, width: 1440, height: 900 },
      };
    }
  }
}

/** The concept's token values in the current theme, by bin name. */
export async function readTokens(page: Page): Promise<Record<string, string>> {
  return page.evaluate((bins) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      Object.entries(bins).map(([bin, name]) => [bin, style.getPropertyValue(name).trim()]),
    );
  }, BINS);
}
```

- [ ] **Step 8: Counting and measuring, in the page**

Create `e2e/fidelity/probe.ts` (both functions run inside a page through `page.evaluate`, so they reference nothing outside themselves):

```ts
export type Origin = { readonly x: number; readonly y: number };

export type ProbeProp =
  | 'width'
  | 'height'
  | 'x'
  | 'y'
  | 'fontSize'
  | 'radius'
  | 'columns'
  | 'columnGap'
  | 'paddingBlockStart'
  | 'paddingInlineStart'
  | 'overflowBottom'
  | 'rotate'
  | 'gapBelow';

export type Probe = { readonly selector: string; readonly prop: ProbeProp; readonly index?: number };

/** One measurement of the `index`-th visible match, or null when there is none. */
export function readProbe({ probe, origin }: { probe: Probe; origin: Origin }): number | null {
  const visible = (el: Element) =>
    el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const el = [...document.querySelectorAll(probe.selector)].filter(visible)[probe.index ?? 0];
  if (el === undefined) return null;
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  const px = (value: string) => Number.parseFloat(value);
  switch (probe.prop) {
    case 'width':
      return r.width;
    case 'height':
      return r.height;
    case 'x':
      return r.left + window.scrollX - origin.x;
    case 'y':
      return r.top + window.scrollY - origin.y;
    case 'fontSize':
      return px(s.fontSize);
    case 'radius':
      return px(s.borderStartStartRadius);
    case 'columns':
      return s.gridTemplateColumns === 'none'
        ? 1
        : s.gridTemplateColumns.split(' ').filter((t) => t !== '').length;
    case 'columnGap':
      return px(s.columnGap);
    case 'paddingBlockStart':
      return px(s.paddingBlockStart);
    case 'paddingInlineStart':
      return px(s.paddingInlineStart);
    case 'rotate':
      return s.rotate === 'none' ? 0 : px(s.rotate);
    case 'overflowBottom': {
      const sheet = el.closest('[data-sheet], .sheet');
      return sheet === null ? null : r.bottom - sheet.getBoundingClientRect().bottom;
    }
    case 'gapBelow': {
      // The nearest sheet below this one that overlaps it sideways (not inside it).
      const gaps = [...document.querySelectorAll('[data-sheet], .sheet')]
        .filter((other) => other !== el && !el.contains(other) && !other.contains(el) && visible(other))
        .map((other) => other.getBoundingClientRect())
        .filter((o) => o.top >= r.bottom - 1 && o.left < r.right && o.right > r.left)
        .map((o) => o.top - r.bottom);
      return gaps.length === 0 ? null : Math.min(...gaps);
    }
  }
}

/** How many of each kind are visible inside `scope`, with their top within `height` of the origin. */
export function countKinds({
  kinds,
  scope,
  scopeIndex,
  origin,
  height,
}: {
  kinds: Record<string, string>;
  scope: string;
  scopeIndex: number;
  origin: Origin;
  height: number;
}): Record<string, number> {
  const root = document.querySelectorAll(scope)[scopeIndex] ?? document.body;
  const counts: Record<string, number> = {};
  for (const [kind, selector] of Object.entries(kinds)) {
    const found = [...root.querySelectorAll(selector)];
    if (root.matches(selector)) found.push(root);
    counts[kind] = found.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') return false;
      const top = r.top + window.scrollY - origin.y;
      return top > -1 && top < height;
    }).length;
  }
  return counts;
}
```

- [ ] **Step 9: The image maths, in the browser**

No image library is added: the page's own canvas decodes, scales and reads pixels. Create `e2e/fidelity/score.ts`:

```ts
/** A token in OKLab: [bin, L, a, b]. */
export type Tok = readonly [string, number, number, number];

export function parseOklch(value: string): readonly [number, number, number] | undefined {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+|none)/.exec(value);
  if (m === null) return undefined;
  return [Number(m[1]), Number(m[2]), m[3] === 'none' ? 0 : Number(m[3])];
}

/** The concept's tokens as OKLab bins, first name winning where two share a value (light night = ink). */
export function toBins(tokens: Record<string, string>): Tok[] {
  const seen = new Set<string>();
  const bins: Tok[] = [];
  for (const [bin, value] of Object.entries(tokens)) {
    const lch = parseOklch(value);
    if (lch === undefined || seen.has(value)) continue;
    seen.add(value);
    const [l, c, h] = lch;
    bins.push([bin, l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)]);
  }
  return bins;
}

export type ScoreInput = {
  readonly a: string;
  readonly b: string;
  readonly w: number;
  readonly h: number;
  readonly tokens: readonly Tok[];
  readonly deltaE: number;
  readonly minShare: number;
};
export type ScoreOutput = {
  readonly structure: number;
  readonly palette: number;
  readonly sharesA: Record<string, number>;
  readonly sharesB: Record<string, number>;
  readonly coloursA: string[];
  readonly coloursB: string[];
  readonly map: number[];
  readonly mapW: number;
  readonly mapH: number;
};

/** Runs in the browser. Both images are drawn at w×h (B scaled to A's frame), then compared. */
export async function scoreInBrowser(input: ScoreInput): Promise<ScoreOutput> {
  const { w, h } = input;
  const load = async (src: string) => createImageBitmap(await (await fetch(src)).blob());
  const [ia, ib] = await Promise.all([load(input.a), load(input.b)]);
  const pixels = (img: ImageBitmap) => {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  };
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const oklab = (r8: number, g8: number, b8: number): [number, number, number] => {
    const r = lin(r8);
    const g = lin(g8);
    const b = lin(b8);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const da = pixels(ia);
  const db = pixels(ib);
  const labA = Array.from({ length: w * h }, (_, i) =>
    oklab(da[4 * i] ?? 0, da[4 * i + 1] ?? 0, da[4 * i + 2] ?? 0),
  );
  const labB = Array.from({ length: w * h }, (_, i) =>
    oklab(db[4 * i] ?? 0, db[4 * i + 1] ?? 0, db[4 * i + 2] ?? 0),
  );

  // Structure: SSIM of OKLab L over 8×8 windows, stride 4.
  const win = 8;
  const step = 4;
  const c1 = 0.01 ** 2;
  const c2 = 0.03 ** 2;
  const map: number[] = [];
  let mapW = 0;
  let mapH = 0;
  for (let y = 0; y + win <= h; y += step) {
    mapH += 1;
    mapW = 0;
    for (let x = 0; x + win <= w; x += step) {
      mapW += 1;
      let ma = 0;
      let mb = 0;
      for (let j = 0; j < win; j++)
        for (let i = 0; i < win; i++) {
          ma += labA[(y + j) * w + x + i]?.[0] ?? 0;
          mb += labB[(y + j) * w + x + i]?.[0] ?? 0;
        }
      ma /= win * win;
      mb /= win * win;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let j = 0; j < win; j++)
        for (let i = 0; i < win; i++) {
          const p = (labA[(y + j) * w + x + i]?.[0] ?? 0) - ma;
          const q = (labB[(y + j) * w + x + i]?.[0] ?? 0) - mb;
          va += p * p;
          vb += q * q;
          cov += p * q;
        }
      const n = win * win - 1;
      map.push(
        ((2 * ma * mb + c1) * ((2 * cov) / n + c2)) / ((ma * ma + mb * mb + c1) * (va / n + vb / n + c2)),
      );
    }
  }
  const structure = map.length === 0 ? 0 : map.reduce((s, v) => s + v, 0) / map.length;

  // Palette: the share of pixels nearest each token (within deltaE), else "other".
  const shares = (lab: readonly [number, number, number][]) => {
    const counts: Record<string, number> = {};
    for (const [l, a, b] of lab) {
      let best = 'other';
      let distance = input.deltaE;
      for (const [bin, tl, ta, tb] of input.tokens) {
        const e = Math.hypot(l - tl, a - ta, b - tb);
        if (e < distance) {
          distance = e;
          best = bin;
        }
      }
      counts[best] = (counts[best] ?? 0) + 1;
    }
    for (const key of Object.keys(counts)) counts[key] = (counts[key] ?? 0) / lab.length;
    return counts;
  };
  const sharesA = shares(labA);
  const sharesB = shares(labB);
  let palette = 0;
  for (const key of new Set([...Object.keys(sharesA), ...Object.keys(sharesB)])) {
    palette += Math.min(sharesA[key] ?? 0, sharesB[key] ?? 0);
  }
  const colourful = (s: Record<string, number>) =>
    Object.entries(s)
      .filter(([bin, share]) => /^(money|hue|sapphire|night)/.test(bin) && share >= input.minShare)
      .map(([bin]) => bin)
      .sort();
  return {
    structure,
    palette,
    sharesA,
    sharesB,
    coloursA: colourful(sharesA),
    coloursB: colourful(sharesB),
    map,
    mapW,
    mapH,
  };
}

export type ComposeInput = {
  readonly a: string;
  readonly b: string;
  readonly map: readonly number[];
  readonly mapW: number;
  readonly mapH: number;
  readonly labelA: string;
  readonly labelB: string;
};

/** Runs in the browser: concept, app, and the structure map (red where the windows disagree), as a PNG in base64. */
export async function composeInBrowser(input: ComposeInput): Promise<string> {
  const load = async (src: string) => createImageBitmap(await (await fetch(src)).blob());
  const [ia, ib] = await Promise.all([load(input.a), load(input.b)]);
  const panel = 720;
  const ha = Math.round((ia.height * panel) / ia.width);
  const hb = Math.round((ib.height * panel) / ib.width);
  const canvas = new OffscreenCanvas(panel * 3 + 32, Math.max(ha, hb) + 40);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2d context');
  ctx.fillStyle = '#888';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.font = '600 18px system-ui';
  ctx.fillText(input.labelA, 8, 24);
  ctx.fillText(input.labelB, panel + 24, 24);
  ctx.fillText('structure', panel * 2 + 40, 24);
  ctx.drawImage(ia, 0, 32, panel, ha);
  ctx.drawImage(ib, panel + 16, 32, panel, hb);
  ctx.globalAlpha = 0.35;
  ctx.drawImage(ia, panel * 2 + 32, 32, panel, ha);
  ctx.globalAlpha = 1;
  const cw = panel / Math.max(1, input.mapW);
  const ch = ha / Math.max(1, input.mapH);
  input.map.forEach((value, i) => {
    const col = i % input.mapW;
    const row = Math.floor(i / input.mapW);
    ctx.fillStyle = `rgba(220, 0, 0, ${String(Math.min(1, Math.max(0, 1 - value)))})`;
    ctx.fillRect(panel * 2 + 32 + col * cw, 32 + row * ch, cw, ch);
  });
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
```

- [ ] **Step 10: Every screen's expectations, written once**

Every later task is judged by this file, so it is written now, from the concept's measurements and the spec, and later tasks do not edit it. The app-side selectors are the contract listed under Interfaces.

Create `e2e/fidelity/screens.ts`:

```ts
import type { Page } from '@playwright/test';

import type { ConceptFrame } from './concept';
import type { Kind, Size } from './config';
import type { Probe, ProbeProp } from './probe';

export type Metric =
  | {
      readonly name: string;
      readonly concept: Probe;
      readonly app: Probe;
      readonly tol: number;
      readonly relative?: boolean;
    }
  | {
      readonly name: string;
      readonly app: Probe;
      readonly expect: number;
      readonly tol: number;
      readonly relative?: boolean;
    }
  | { readonly name: string; readonly app: Probe; readonly atLeast: number };

export type Expectation = number | { readonly atLeast: number };

export type ScreenSpec = {
  readonly id: string;
  readonly size: Size;
  readonly route: string;
  readonly lang?: 'he' | 'en';
  readonly state?: 'household' | 'empty';
  /** Puts the screen in the state compared, after `main` is up. */
  readonly setup?: (page: Page) => Promise<void>;
  /** What it is compared with; absent for a screen the concept does not draw. */
  readonly concept?: ConceptFrame;
  /** The app's element compared with an element frame; for a screen with no frame, the element whose
   *  colours are judged (a panel, over its scrim). It is also the counts' scope. */
  readonly appScope?: string;
  /** 'all' (default) or 'metrics': a frame used for its measurements only. */
  readonly compare?: 'all' | 'metrics';
  /** Counts for a screen the concept does not draw. */
  readonly expect?: Partial<Record<Kind, Expectation>>;
  readonly metrics: readonly Metric[];
  /** Bins a screen the concept does not draw must show (see BINS). */
  readonly mustShow?: readonly string[];
  /** English: the concept's x becomes 1440 − x − width. */
  readonly mirror?: boolean;
  /** Not on this branch yet: why the test is skipped. */
  readonly reserved?: string;
};

const probe = (selector: string, prop: ProbeProp, index?: number): Probe =>
  index === undefined ? { selector, prop } : { selector, prop, index };

const pair = (
  name: string,
  concept: string,
  app: string,
  prop: ProbeProp,
  tol: number,
  extra: { readonly index?: number; readonly relative?: boolean } = {},
): Metric => ({
  name,
  concept: probe(concept, prop, extra.index),
  app: probe(app, prop, extra.index),
  tol,
  ...(extra.relative === true ? { relative: true } : {}),
});

const want = (
  name: string,
  app: string,
  prop: ProbeProp,
  expect: number,
  tol: number,
  extra: { readonly index?: number; readonly relative?: boolean } = {},
): Metric => ({
  name,
  app: probe(app, prop, extra.index),
  expect,
  tol,
  ...(extra.relative === true ? { relative: true } : {}),
});

const atLeast = (name: string, app: string, prop: ProbeProp, n: number): Metric => ({
  name,
  app: probe(app, prop),
  atLeast: n,
});

const REL = { relative: true } as const;

/** The app's side of the contract. */
const S = {
  board: '[data-slot="board"]',
  balance: '[data-slot="balance-sheet"]',
  account: '[data-slot="account-sheet"]',
  accounts: '[data-slot="account-sheets"]',
  month: '[data-slot="month-sheet"]',
  left: '[data-slot="month-left"] [data-numeral]',
  categories: '[data-slot="categories-sheet"]',
  bar: '[data-slot="hue-bars"] i[data-hue]',
  transactions: '[data-slot="transactions-sheet"]',
  wallet: '[data-slot="wallet"]',
  card: '[data-card-sheet]',
  cash: '[data-slot="cash-sheet"]',
  head: '[data-slot="screen-head"] h1',
} as const;

const SHELL: readonly Metric[] = [
  pair('rail width', '.desk .rail', 'nav[data-slot="tab-bar"]', 'width', 1),
  pair('nav item height', '.desk .nav-item', '[data-slot="nav-place"]', 'height', 1, { index: 1 }),
  pair('title size', '.desk .topbar h1', S.head, 'fontSize', 0.5),
  pair('search pill height', '.desk .search', '[data-slot="search-pill"]', 'height', 1),
  atLeast('search pill width', '[data-slot="search-pill"]', 'width', 280),
  pair(
    'month arrows',
    '.desk .month-pick .round',
    '[data-slot="month-picker"] [data-variant="round"]',
    'width',
    1,
  ),
];

const BOARD: readonly Metric[] = [
  pair('board x', '.desk .board', S.board, 'x', 2),
  pair('board width', '.desk .board', S.board, 'width', 2),
  pair('board columns', '.desk .board', S.board, 'columns', 0),
  pair('board gap', '.desk .board', S.board, 'columnGap', 1),
];

const BALANCE: readonly Metric[] = [
  pair('balance width', '.desk .bal', S.balance, 'width', 2),
  pair('balance y', '.desk .bal', S.balance, 'y', 6),
  pair('balance height', '.desk .bal', S.balance, 'height', 12),
  pair('balance radius', '.desk .bal', S.balance, 'radius', 1),
  pair('balance padding block', '.desk .bal', S.balance, 'paddingBlockStart', 1),
  pair('balance padding inline', '.desk .bal', S.balance, 'paddingInlineStart', 1),
  pair('balance gap below', '.desk .bal', S.balance, 'gapBelow', 1),
  pair('balance title size', '.desk .bal h2', `${S.balance} h2`, 'fontSize', 0.5),
  pair('balance numeral size', '.desk .bal .mega', `${S.balance} > * [data-numeral]`, 'fontSize', 0.02, REL),
  pair('balance numeral bleed', '.desk .bal .mega', `${S.balance} > * [data-numeral]`, 'overflowBottom', 1.5),
  pair('balance numeral x', '.desk .bal .mega', `${S.balance} > * [data-numeral]`, 'x', 8),
  pair('first account tilt', '.desk .acct', S.account, 'rotate', 0.05, { index: 0 }),
  pair('second account tilt', '.desk .acct', S.account, 'rotate', 0.05, { index: 1 }),
  pair('first account x', '.desk .acct', S.account, 'x', 4, { index: 0 }),
  pair('second account x', '.desk .acct', S.account, 'x', 4, { index: 1 }),
  pair('account width', '.desk .acct', S.account, 'width', 4),
  pair('account radius', '.desk .acct', S.account, 'radius', 1),
];

const MONTH: readonly Metric[] = [
  pair('month x', '.desk .month', S.month, 'x', 2),
  pair('month width', '.desk .month', S.month, 'width', 2),
  pair('month radius', '.desk .month', S.month, 'radius', 1),
  pair('month title size', '.desk .month h2', `${S.month} h2`, 'fontSize', 0.5),
  pair('left numeral size', '.desk .month .mega', S.left, 'fontSize', 0.02, REL),
  pair('left numeral bleed', '.desk .month .mega', S.left, 'overflowBottom', 1.5),
];

const CATEGORIES: readonly Metric[] = [
  pair('categories x', '.desk .cats', S.categories, 'x', 2),
  pair('categories width', '.desk .cats', S.categories, 'width', 2),
  pair('categories radius', '.desk .cats', S.categories, 'radius', 1),
  pair('categories title size', '.desk .cats h2', `${S.categories} h2`, 'fontSize', 0.5),
  pair('hue bar height', '.desk .bars .bar i', S.bar, 'height', 1),
  pair('largest bar width', '.desk .bars .bar i', S.bar, 'width', 4, { index: 0 }),
  pair('second bar width', '.desk .bars .bar i', S.bar, 'width', 4, { index: 1 }),
];

const TRANSACTIONS: readonly Metric[] = [
  pair('transactions x', '.desk .tx-sheet', S.transactions, 'x', 2),
  pair('transactions width', '.desk .tx-sheet', S.transactions, 'width', 2),
  pair('transactions radius', '.desk .tx-sheet', S.transactions, 'radius', 1),
  pair('hue pill width', '.desk .tx .sq', '[data-slot="hue-pill"]', 'width', 1),
  pair('hue pill height', '.desk .tx .sq', '[data-slot="hue-pill"]', 'height', 1),
  pair('row height', '.desk .tx', `${S.transactions} [role="listitem"]`, 'height', 4),
  pair('merchant size', '.desk .tx .merchant', `${S.transactions} [data-slot="row-title"]`, 'fontSize', 0.5),
  pair('chip height', '.desk .tx .chip', `${S.transactions} [data-slot="chip"]`, 'height', 1),
  pair('chip text', '.desk .tx .chip', `${S.transactions} [data-slot="chip"]`, 'fontSize', 0.5),
  pair('day heading size', '.desk .day', '[data-slot="day-heading"]', 'fontSize', 0.5),
];

const WALLET: readonly Metric[] = [
  pair('wallet x', '.desk .wallet', S.wallet, 'x', 2),
  pair('wallet width', '.desk .wallet', S.wallet, 'width', 2),
  pair('wallet title size', '.desk .wallet h2', `${S.wallet} h2`, 'fontSize', 0.5),
  pair('card sheet radius', '.desk .cardsheet', S.card, 'radius', 1),
  pair('card sheet height', '.desk .cardsheet', S.card, 'height', 4),
  pair('card gap', '.desk .cardsheet', S.card, 'gapBelow', 1),
  pair('card numeral size', '.desk .cardsheet .mega', `${S.card} [data-numeral]`, 'fontSize', 0.02, REL),
  pair('card numeral bleed', '.desk .cardsheet .mega', `${S.card} [data-numeral]`, 'overflowBottom', 1.5),
  pair('first card figure x', '.desk .cardsheet .mega', `${S.card} [data-numeral]`, 'x', 8, { index: 0 }),
  pair('second card figure x', '.desk .cardsheet .mega', `${S.card} [data-numeral]`, 'x', 8, { index: 1 }),
  pair('cash radius', '.desk .cashsheet', S.cash, 'radius', 1),
  pair('cash numeral size', '.desk .cashsheet .mega', `${S.cash} [data-numeral]`, 'fontSize', 0.02, REL),
  pair('cash numeral bleed', '.desk .cashsheet .mega', `${S.cash} [data-numeral]`, 'overflowBottom', 1.5),
];

const MIRRORED = [...BOARD, ...BALANCE, ...MONTH, ...CATEGORIES, ...TRANSACTIONS, ...WALLET].filter(
  (m) => 'concept' in m && (m.app.prop === 'x' || m.app.prop === 'width'),
);

const waitFor = (selector: string) => async (page: Page) => {
  await page.locator(selector).first().waitFor();
};

const ISSUERS = ['money-isracard', 'money-max', 'money-cal', 'money-diners', 'money-amex'];
const BANKS = ['money-leumi', 'money-discount', 'money-mizrahi', 'money-hapoalim'];
const TEN_HUES = [
  'hue-indigo',
  'hue-green',
  'hue-vermilion',
  'hue-amber',
  'hue-orange',
  'hue-cyan',
  'hue-violet',
  'hue-rose',
  'hue-magenta',
  'hue-teal',
];

export const SCREENS: readonly ScreenSpec[] = [
  // ---- The feed, against the concept's desktop home ----
  {
    id: 'shell-desktop',
    size: 'desktop',
    route: '/',
    concept: { kind: 'desk' },
    compare: 'metrics',
    metrics: SHELL,
  },
  {
    id: 'feed-desktop',
    size: 'desktop',
    route: '/',
    concept: { kind: 'desk' },
    metrics: [...SHELL, ...BOARD, ...BALANCE, ...MONTH, ...CATEGORIES, ...TRANSACTIONS, ...WALLET],
  },
  {
    id: 'feed-balance',
    size: 'desktop',
    route: '/',
    concept: { kind: 'element', selector: '.desk .bal' },
    appScope: S.balance,
    metrics: BALANCE,
  },
  {
    id: 'feed-month',
    size: 'desktop',
    route: '/',
    concept: { kind: 'element', selector: '.desk .month' },
    appScope: S.month,
    metrics: MONTH,
  },
  {
    id: 'feed-categories',
    size: 'desktop',
    route: '/',
    concept: { kind: 'element', selector: '.desk .cats' },
    appScope: S.categories,
    metrics: CATEGORIES,
  },
  {
    id: 'feed-transactions',
    size: 'desktop',
    route: '/',
    concept: { kind: 'element', selector: '.desk .tx-sheet' },
    appScope: S.transactions,
    metrics: TRANSACTIONS,
  },
  {
    id: 'feed-wallet',
    size: 'desktop',
    route: '/',
    concept: { kind: 'element', selector: '.desk .wallet' },
    appScope: S.wallet,
    metrics: WALLET,
  },
  {
    id: 'feed-desktop-en',
    size: 'desktop',
    route: '/',
    lang: 'en',
    concept: { kind: 'desk' },
    compare: 'metrics',
    mirror: true,
    metrics: MIRRORED,
  },
  {
    id: 'feed-phone',
    size: 'phone',
    route: '/',
    expect: {
      sheet: 15,
      numeral: 8,
      mark: 8,
      hueBar: 8,
      cardSheet: 5,
      accountSheet: 5,
      huePill: 8,
      dayHeading: 3,
      round: 3,
    },
    metrics: [
      want('screen name', S.head, 'fontSize', 76, 0.5),
      want('gutter', S.balance, 'x', 12, 1),
      want('sheet radius', S.balance, 'radius', 36, 1),
      want('sheet gap', S.balance, 'gapBelow', 8, 1),
      want('balance numeral', `${S.balance} > * [data-numeral]`, 'fontSize', 118, 0.02, REL),
      want('balance bleed', `${S.balance} > * [data-numeral]`, 'overflowBottom', 4.52, 1.5),
      want('left numeral', S.left, 'fontSize', 96, 0.02, REL),
      want('card sheet height', S.card, 'height', 124, 2),
      want('card sheet radius', S.card, 'radius', 34, 1),
      want('card numeral', `${S.card} [data-numeral]`, 'fontSize', 92, 0.02, REL),
      want('cash numeral', `${S.cash} [data-numeral]`, 'fontSize', 96, 0.02, REL),
    ],
    mustShow: ['sapphire', 'money-cash', ...ISSUERS, ...BANKS, 'hue-indigo', 'hue-green'],
  },
  {
    id: 'feed-empty-desktop',
    size: 'desktop',
    route: '/',
    state: 'empty',
    expect: { cardSheet: 0, accountSheet: 0, numeral: { atLeast: 1 } },
    metrics: [
      want('board columns', S.board, 'columns', 12, 0),
      want('balance radius', S.balance, 'radius', 56, 1),
    ],
  },
  {
    id: 'feed-empty-phone',
    size: 'phone',
    route: '/',
    state: 'empty',
    expect: { cardSheet: 0, accountSheet: 0, numeral: { atLeast: 1 } },
    metrics: [
      want('screen name', S.head, 'fontSize', 76, 0.5),
      want('sheet radius', S.balance, 'radius', 36, 1),
    ],
  },
  {
    id: 'feed-board',
    size: 'board',
    route: '/',
    metrics: [
      want('board columns', S.board, 'columns', 12, 0),
      want('balance in one column', S.balance, 'columns', 1, 0),
      want('month span 5', S.month, 'width', 290.7, 2),
      want('categories span 7', S.categories, 'width', 413.3, 2),
    ],
  },
  {
    id: 'feed-vast',
    size: 'vast',
    route: '/',
    metrics: [
      atLeast('content box', '[data-slot="content-box"]', 'width', 1600),
      want('board columns', S.board, 'columns', 12, 0),
      want('accounts column', S.accounts, 'width', 520, 4),
      want('balance numeral', `${S.balance} > * [data-numeral]`, 'fontSize', 252, 0.02, REL),
    ],
  },

  // ---- Cards ----
  {
    id: 'cards-phone',
    size: 'phone',
    route: '/cards',
    concept: { kind: 'phone', index: 0 },
    metrics: [
      pair('screen name', '.ph-head h1', S.head, 'fontSize', 0.5),
      pair(
        'add pill height',
        '.ph-head .pill',
        '[data-slot="screen-head"] [data-variant="pill-solid"]',
        'height',
        1,
      ),
      pair('summary x', '.ph-sum', '[data-slot="cards-summary"]', 'x', 2),
      pair('summary width', '.ph-sum', '[data-slot="cards-summary"]', 'width', 2),
      pair('summary radius', '.ph-sum', '[data-slot="cards-summary"]', 'radius', 1),
      pair('summary gap below', '.ph-sum', '[data-slot="cards-summary"]', 'gapBelow', 1),
      pair(
        'summary numeral',
        '.ph-sum .mega',
        '[data-slot="cards-summary"] [data-numeral]',
        'fontSize',
        0.02,
        REL,
      ),
      pair(
        'summary bleed',
        '.ph-sum .mega',
        '[data-slot="cards-summary"] [data-numeral]',
        'overflowBottom',
        1.5,
      ),
      pair('card sheet radius', '.ph-cards .cardsheet', S.card, 'radius', 1),
      pair('card sheet height', '.ph-cards .cardsheet', S.card, 'height', 2),
      pair('card numeral', '.ph-cards .cardsheet .mega', `${S.card} [data-numeral]`, 'fontSize', 0.02, REL),
      pair('card bleed', '.ph-cards .cardsheet .mega', `${S.card} [data-numeral]`, 'overflowBottom', 1.5),
    ],
  },
  {
    id: 'cards-desktop',
    size: 'desktop',
    route: '/cards',
    expect: { cardSheet: 5, numeral: 6, mark: { atLeast: 6 }, sheet: { atLeast: 7 } },
    metrics: [
      want('summary width', '[data-slot="cards-summary"]', 'width', 1136, 2),
      want('summary radius', '[data-slot="cards-summary"]', 'radius', 56, 1),
      want('summary numeral', '[data-slot="cards-summary"] [data-numeral]', 'fontSize', 252, 0.02, REL),
      want('card sheets column', '[data-slot="card-sheets"]', 'width', 656, 2),
      want('details column', '[data-slot="card-details"]', 'width', 464, 2),
      want('card sheet radius', S.card, 'radius', 36, 1),
      want('card gap', S.card, 'gapBelow', 8, 1),
      want('card numeral', `${S.card} [data-numeral]`, 'fontSize', 104, 0.02, REL),
    ],
    mustShow: ISSUERS,
  },
  {
    id: 'card-page-desktop',
    size: 'desktop',
    route: '/cards?card=concept.card.max',
    setup: waitFor('[data-slot="card-details"] [data-slot="card-face"]'),
    appScope: '[data-slot="card-details"]',
    metrics: [
      want('face radius', '[data-slot="card-details"] [data-slot="card-face"]', 'radius', 22, 1),
      atLeast('face width', '[data-slot="card-details"] [data-slot="card-face"]', 'width', 300),
    ],
    mustShow: ['money-max'],
  },
  {
    id: 'card-page-phone',
    size: 'phone',
    route: '/cards?card=concept.card.max',
    setup: waitFor('[data-slot="editor-panel"] [data-slot="card-face"]'),
    appScope: '[data-slot="editor-panel"]',
    metrics: [want('face radius', '[data-slot="editor-panel"] [data-slot="card-face"]', 'radius', 22, 1)],
    mustShow: ['money-max'],
  },

  // ---- Cash ----
  {
    id: 'cash-desktop',
    size: 'desktop',
    route: '/cash',
    expect: { numeral: 1, sheet: { atLeast: 4 } },
    metrics: [
      want('pot width', S.cash, 'width', 1136, 2),
      want('pot radius', S.cash, 'radius', 44, 1),
      want('pot numeral', `${S.cash} [data-numeral]`, 'fontSize', 150, 0.02, REL),
      want('person sheet width', '[data-slot="cash-person"]', 'width', 368, 2),
      want('person pill', '[data-slot="cash-person"] [data-variant="pill"]', 'height', 48, 1),
    ],
    mustShow: ['money-cash'],
  },
  {
    id: 'cash-phone',
    size: 'phone',
    route: '/cash',
    expect: { numeral: 1 },
    metrics: [
      want('pot radius', S.cash, 'radius', 36, 1),
      want('pot numeral', `${S.cash} [data-numeral]`, 'fontSize', 96, 0.02, REL),
    ],
    mustShow: ['money-cash'],
  },

  // ---- Categories, Chart, Commitments, Bank accounts, Settings ----
  {
    id: 'categories-desktop',
    size: 'desktop',
    route: '/categories',
    expect: { hueBar: 12, huePill: { atLeast: 24 } },
    metrics: [
      want('expense column', '[data-slot="categories-expense"]', 'width', 560, 2),
      want('row hue pill', '[data-slot="category-row"] [data-slot="hue-pill"]', 'height', 40, 1),
    ],
    mustShow: TEN_HUES,
  },
  {
    id: 'categories-phone',
    size: 'phone',
    route: '/categories',
    expect: { huePill: { atLeast: 24 } },
    metrics: [want('row hue pill', '[data-slot="category-row"] [data-slot="hue-pill"]', 'height', 40, 1)],
    mustShow: TEN_HUES,
  },
  {
    id: 'chart-desktop',
    size: 'desktop',
    route: '/chart',
    expect: { hueBar: 5, mark: 3 },
    metrics: [
      want('plot width', '[data-slot="chart-sheet"]', 'width', 752, 2),
      want('stats width', '[data-slot="chart-stats"]', 'width', 368, 2),
    ],
    mustShow: ['hue-indigo', 'hue-green'],
  },
  {
    id: 'chart-phone',
    size: 'phone',
    route: '/chart',
    expect: { hueBar: 5, mark: 3 },
    metrics: [want('sheet radius', '[data-slot="chart-sheet"]', 'radius', 36, 1)],
    mustShow: ['hue-indigo', 'hue-green'],
  },
  {
    id: 'commitments-desktop',
    size: 'desktop',
    route: '/commitments',
    expect: { sheet: { atLeast: 2 } },
    metrics: [
      want('list width', '[data-slot="commitments-list"]', 'width', 752, 2),
      want('totals width', '[data-slot="commitments-totals"]', 'width', 368, 2),
    ],
  },
  {
    id: 'commitments-phone',
    size: 'phone',
    route: '/commitments',
    expect: { sheet: { atLeast: 2 } },
    metrics: [want('list radius', '[data-slot="commitments-list"]', 'radius', 36, 1)],
  },
  {
    id: 'bank-accounts-desktop',
    size: 'desktop',
    route: '/bank-accounts',
    expect: { sheet: { atLeast: 4 }, mark: { atLeast: 4 } },
    metrics: [
      want('account sheet width', '[data-slot="bank-account-sheet"]', 'width', 368, 2),
      want('account sheet radius', '[data-slot="bank-account-sheet"]', 'radius', 56, 1),
    ],
    mustShow: BANKS,
  },
  {
    id: 'bank-accounts-phone',
    size: 'phone',
    route: '/bank-accounts',
    expect: { sheet: { atLeast: 4 } },
    metrics: [want('account sheet radius', '[data-slot="bank-account-sheet"]', 'radius', 36, 1)],
    mustShow: BANKS,
  },
  {
    id: 'settings-desktop',
    size: 'desktop',
    route: '/settings',
    setup: waitFor('[data-slot="settings-subject"]'),
    metrics: [
      want('subjects width', '[data-slot="settings-subjects"]', 'width', 368, 2),
      want('subject width', '[data-slot="settings-subject"]', 'width', 752, 2),
      want('subject pill', '[data-slot="settings-subjects"] a', 'height', 48, 1),
    ],
  },
  {
    id: 'settings-phone',
    size: 'phone',
    route: '/settings',
    // On a phone the subjects keep their one-line hints, so a row is at least a pill's height.
    metrics: [atLeast('subject row', '[data-slot="settings-subjects"] a', 'height', 48)],
  },

  // ---- Panels and pop-outs ----
  {
    id: 'panel-add-desktop',
    size: 'desktop',
    route: '/?add=expense',
    setup: waitFor('[data-slot="editor-panel"]'),
    appScope: '[data-slot="editor-panel"]',
    metrics: [
      want('panel width', '[data-slot="editor-panel"]', 'width', 480, 1),
      want('panel radius', '[data-slot="editor-panel"]', 'radius', 56, 1),
      want('header padding', '[data-slot="editor-panel-header"]', 'paddingInlineStart', 28, 0),
      want('body padding', '[data-slot="editor-panel-body"]', 'paddingInlineStart', 28, 0),
      want('cancel height', '[data-slot="editor-actions"] [data-variant="pill"]', 'height', 48, 1),
      want('save height', '[data-slot="editor-actions"] [data-variant="pill-solid"]', 'height', 48, 1),
      atLeast('save width', '[data-slot="editor-actions"] [data-variant="pill-solid"]', 'width', 150),
    ],
    mustShow: ['sapphire'],
  },
  {
    id: 'panel-add-phone',
    size: 'phone',
    route: '/?add=expense',
    setup: waitFor('[data-slot="editor-panel"]'),
    appScope: '[data-slot="editor-panel"]',
    metrics: [
      want('header padding', '[data-slot="editor-panel-header"]', 'paddingInlineStart', 20, 0),
      want('body padding', '[data-slot="editor-panel-body"]', 'paddingInlineStart', 20, 0),
      want('save height', '[data-slot="editor-actions"] [data-variant="pill-solid"]', 'height', 48, 1),
    ],
    mustShow: ['sapphire'],
  },
  {
    id: 'popout-import-desktop',
    size: 'desktop',
    route: '/?import=1',
    setup: waitFor('[data-slot="popout"]'),
    concept: { kind: 'dialog' },
    compare: 'metrics',
    metrics: [
      pair('dialog width', '.deskmodal .dialog', '[data-slot="popout"]', 'width', 2),
      pair('dialog height', '.deskmodal .dialog', '[data-slot="popout"]', 'height', 2),
      pair('dialog radius', '.deskmodal .dialog', '[data-slot="popout"]', 'radius', 1),
      pair('panes', '.deskmodal .dialog', '[data-slot="popout-layout"]', 'columns', 0),
      pair('steps width', '.deskmodal .steps', '[data-slot="popout-steps"]', 'width', 2),
      pair('preview width', '.deskmodal .preview', '[data-slot="popout-preview"]', 'width', 2),
      pair('preview radius', '.deskmodal .preview', '[data-slot="popout-preview"]', 'radius', 1),
      pair('question size', '.deskmodal .wz-q h2', '[data-slot="popout-body"] h2', 'fontSize', 0.5),
      pair(
        'footer pill height',
        '.deskmodal .wz-foot .pill',
        '[data-slot="popout-actions"] [data-variant]',
        'height',
        1,
      ),
    ],
  },
  {
    id: 'popout-add-card-desktop',
    size: 'desktop',
    route: '/cards?add=card',
    concept: { kind: 'dialog' },
    metrics: [],
    reserved: 'The add-card flow lands from branch add-card-flow (plan Task 21).',
  },
  {
    id: 'add-card-phone',
    size: 'phone',
    route: '/cards?add=card',
    concept: { kind: 'phone', index: 1 },
    metrics: [],
    reserved: 'The add-card flow lands from branch add-card-flow (plan Task 21).',
  },
];
```

(The phone feed draws 8 recent rows over 3 days, so 3 day headings, as the concept's transactions sheet does. `feed-board` and `feed-vast` are structural: they have no perceptual score, by size.)

- [ ] **Step 11: Run one screen**

Create `e2e/fidelity/run.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Browser, Page } from '@playwright/test';

import { frameBox, openConcept, readTokens, type FrameBox } from './concept';
import {
  FRAME_HEIGHT,
  GOLDEN_DIR,
  KINDS,
  OUT_ROOT,
  RUN_ID,
  SCALE,
  STATE,
  THRESHOLDS,
  TODAY_INSTANT,
  TOLERANCE,
  VIEWPORT,
  type Kind,
  type Theme,
} from './config';
import { countKinds, readProbe, type Origin } from './probe';
import { composeInBrowser, scoreInBrowser, toBins, type ScoreOutput } from './score';
import type { ScreenSpec } from './screens';

export type Check = {
  readonly name: string;
  readonly app: number | null;
  readonly want: string;
  readonly pass: boolean;
};

export type Report = {
  readonly screen: string;
  readonly theme: Theme;
  readonly dir: string;
  readonly inventory: Check[];
  readonly metrics: Check[];
  perceptual?: {
    structure?: number;
    palette?: number;
    other?: number;
    golden?: number;
    coloursConcept?: string[];
    coloursApp: string[];
  };
  readonly failures: string[];
};

const ZERO: Origin = { x: 0, y: 0 };
const kindsFor = (side: 'concept' | 'app') =>
  Object.fromEntries(Object.entries(KINDS).map(([kind, s]) => [kind, s[side]]));
const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;

async function openApp(browser: Browser, screen: ScreenSpec, theme: Theme) {
  const lang = screen.lang ?? 'he';
  const phone = screen.size === 'phone';
  const view = VIEWPORT[screen.size];
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState:
      screen.state === 'empty' ? STATE.empty : lang === 'en' ? STATE.householdEn : STATE.household,
    locale: lang === 'he' ? 'he-IL' : 'en-US',
    timezoneId: 'Asia/Jerusalem',
    colorScheme: theme,
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
    isMobile: phone,
    hasTouch: phone,
    // As tall as the concept's frame for the counts, so the list renders what the concept draws.
    viewport: { width: view.width, height: Math.max(view.height, FRAME_HEIGHT[screen.size]) },
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(TODAY_INSTANT));
  await page.addInitScript(
    ([l, t]) => {
      localStorage.setItem('gb.boot', JSON.stringify({ lang: l, theme: t }));
    },
    [lang, theme] as const,
  );
  await page.goto(screen.route);
  await page.getByRole('main').waitFor();
  await screen.setup?.(page);
  await settle(page);
  return { context, page };
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(400);
}

function check(name: string, app: number | null, want: number | null, tol: number, relative = false): Check {
  if (app === null || want === null)
    return { name, app, want: want === null ? 'missing in concept' : String(want), pass: false };
  const allowed = relative ? tol * want : tol;
  return {
    name,
    app,
    want: `${want.toFixed(2)} ±${allowed.toFixed(2)}`,
    pass: Math.abs(app - want) <= allowed + 1e-6,
  };
}

export async function runScreen(browser: Browser, screen: ScreenSpec, theme: Theme): Promise<Report> {
  const dir = path.join(OUT_ROOT, RUN_ID, `${screen.id}-${theme}`);
  await fs.mkdir(dir, { recursive: true });
  const report: Report = { screen: screen.id, theme, dir, inventory: [], metrics: [], failures: [] };
  const fail = (line: string) => {
    report.failures.push(line);
  };

  const concept = await openConcept(browser, theme);
  const app = await openApp(browser, screen, theme);
  try {
    const bins = toBins(await readTokens(concept.page));
    const frame: FrameBox | undefined =
      screen.concept === undefined ? undefined : await frameBox(concept.page, screen.concept);
    const appScope = screen.appScope ?? 'body';

    // 1. Counts.
    const appCounts = await app.page.evaluate(countKinds, {
      kinds: kindsFor('app'),
      scope: appScope,
      scopeIndex: 0,
      origin: ZERO,
      height: frame === undefined ? 10_000_000 : frame.height,
    });
    if (frame !== undefined && screen.compare !== 'metrics') {
      const conceptCounts = await concept.page.evaluate(countKinds, {
        kinds: kindsFor('concept'),
        scope: frame.scope,
        scopeIndex: frame.scopeIndex,
        origin: frame.origin,
        height: frame.height,
      });
      for (const kind of Object.keys(KINDS) as Kind[]) {
        const c = conceptCounts[kind] ?? 0;
        const a = appCounts[kind] ?? 0;
        const result = check(kind, a, c, TOLERANCE[kind]);
        report.inventory.push(result);
        if (!result.pass)
          fail(`count ${kind}: app ${String(a)}, concept ${String(c)} ±${String(TOLERANCE[kind])}`);
      }
    }
    for (const [kind, expectation] of Object.entries(screen.expect ?? {})) {
      const a = appCounts[kind] ?? 0;
      const pass = typeof expectation === 'number' ? a === expectation : a >= expectation.atLeast;
      const want = typeof expectation === 'number' ? String(expectation) : `≥ ${String(expectation.atLeast)}`;
      report.inventory.push({ name: kind, app: a, want, pass });
      if (!pass) fail(`count ${kind}: app ${String(a)}, want ${want}`);
    }

    // 2. Metrics.
    for (const metric of screen.metrics) {
      const a = await app.page.evaluate(readProbe, { probe: metric.app, origin: ZERO });
      let result: Check;
      if ('concept' in metric) {
        let c =
          frame === undefined
            ? null
            : await concept.page.evaluate(readProbe, { probe: metric.concept, origin: frame.origin });
        if (c !== null && frame !== undefined && screen.mirror === true && metric.concept.prop === 'x') {
          const width = await concept.page.evaluate(readProbe, {
            probe: { ...metric.concept, prop: 'width' },
            origin: frame.origin,
          });
          c = width === null ? null : VIEWPORT.desktop.width - c - width;
        }
        result = check(metric.name, a, c, metric.tol, metric.relative);
      } else if ('expect' in metric) {
        result = check(metric.name, a, metric.expect, metric.tol, metric.relative);
      } else {
        result = {
          name: metric.name,
          app: a,
          want: `≥ ${String(metric.atLeast)}`,
          pass: a !== null && a >= metric.atLeast,
        };
      }
      report.metrics.push(result);
      if (!result.pass) fail(`metric ${result.name}: app ${String(result.app)}, want ${result.want}`);
    }

    const overflow = await app.page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) fail(`sideways scroll: ${String(overflow)}px`);

    // 3. Perceptual.
    const perceptual = screen.compare !== 'metrics' && (screen.size === 'desktop' || screen.size === 'phone');
    if (perceptual) {
      const view = VIEWPORT[screen.size];
      await app.page.setViewportSize(view);
      await app.page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await settle(app.page);
      const scorer = await concept.context.newPage();
      const scale = SCALE[screen.size === 'phone' ? 'phone' : 'desktop'];

      if (frame !== undefined) {
        let conceptClip = frame.clip;
        let appClip = { x: 0, y: 0, width: view.width, height: screen.size === 'phone' ? 792 : view.height };
        if (screen.concept?.kind === 'element') {
          const box = await app.page.locator(appScope).first().boundingBox();
          if (box === null) throw new Error(`app: no ${appScope}`);
          const scrollY = await app.page.evaluate(() => window.scrollY);
          const height = Math.min(box.height, frame.clip.height);
          appClip = { x: box.x, y: box.y + scrollY, width: box.width, height };
          conceptClip = { ...frame.clip, height };
        }
        const conceptPng = await concept.page.screenshot({ fullPage: true, clip: conceptClip });
        const appPng = await app.page.screenshot({ fullPage: true, clip: appClip });
        await fs.writeFile(path.join(dir, 'concept.png'), conceptPng);
        await fs.writeFile(path.join(dir, 'app.png'), appPng);
        const score: ScoreOutput = await scorer.evaluate(scoreInBrowser, {
          a: dataUrl(conceptPng),
          b: dataUrl(appPng),
          w: Math.max(8, Math.round(conceptClip.width / scale)),
          h: Math.max(8, Math.round(conceptClip.height / scale)),
          tokens: bins,
          deltaE: THRESHOLDS.deltaE,
          minShare: THRESHOLDS.colourShare,
        });
        const missing = score.coloursA.filter((c) => !score.coloursB.includes(c));
        const extra = score.coloursB.filter((c) => !score.coloursA.includes(c));
        report.perceptual = {
          structure: score.structure,
          palette: score.palette,
          coloursConcept: score.coloursA,
          coloursApp: score.coloursB,
        };
        if (score.structure < THRESHOLDS.structure)
          fail(`structure ${score.structure.toFixed(3)} < ${String(THRESHOLDS.structure)}`);
        if (score.palette < THRESHOLDS.palette)
          fail(`palette ${score.palette.toFixed(3)} < ${String(THRESHOLDS.palette)}`);
        if (missing.length > THRESHOLDS.missingColours) fail(`colours missing: ${missing.join(', ')}`);
        if (extra.length > THRESHOLDS.extraColours)
          fail(`colours the concept does not show: ${extra.join(', ')}`);
        const composed = await scorer.evaluate(composeInBrowser, {
          a: dataUrl(conceptPng),
          b: dataUrl(appPng),
          map: score.map,
          mapW: score.mapW,
          mapH: score.mapH,
          labelA: 'CONCEPT (approved v2)',
          labelB: `APP ${screen.id} ${theme}`,
        });
        await fs.writeFile(path.join(dir, 'side-by-side.png'), Buffer.from(composed, 'base64'));
      } else {
        // A screen the concept does not draw: the whole page (or the panel it scopes to) against the
        // palette, and the fold (or that panel) against the picture the user approved.
        const target = screen.appScope === undefined ? undefined : app.page.locator(screen.appScope).first();
        const fold = target === undefined ? await app.page.screenshot() : await target.screenshot();
        const page = target === undefined ? await app.page.screenshot({ fullPage: true }) : fold;
        await fs.writeFile(path.join(dir, 'app.png'), fold);
        await fs.writeFile(path.join(dir, 'app-full.png'), page);
        const box = target === undefined ? undefined : await target.boundingBox();
        const fullWidth = box?.width ?? view.width;
        const fullHeight =
          box?.height ?? (await app.page.evaluate(() => document.documentElement.scrollHeight));
        const own: ScoreOutput = await scorer.evaluate(scoreInBrowser, {
          a: dataUrl(page),
          b: dataUrl(page),
          w: Math.max(8, Math.round(fullWidth / scale)),
          h: Math.max(8, Math.round(fullHeight / scale)),
          tokens: bins,
          deltaE: THRESHOLDS.deltaE,
          minShare: THRESHOLDS.colourShare,
        });
        const other = own.sharesA['other'] ?? 0;
        report.perceptual = { other, coloursApp: own.coloursA };
        if (other > THRESHOLDS.otherShare)
          fail(`off the palette: ${other.toFixed(3)} > ${String(THRESHOLDS.otherShare)}`);
        const absent = (screen.mustShow ?? []).filter((bin) => !own.coloursA.includes(bin));
        if (absent.length > 0) fail(`colours missing: ${absent.join(', ')}`);
        const golden = path.join(GOLDEN_DIR, `${screen.id}-${theme}.png`);
        if (process.env['FIDELITY_APPROVE'] === '1') {
          await fs.mkdir(GOLDEN_DIR, { recursive: true });
          await fs.writeFile(golden, fold);
        } else {
          const approved = await fs.readFile(golden).catch(() => undefined);
          if (approved !== undefined) {
            const score: ScoreOutput = await scorer.evaluate(scoreInBrowser, {
              a: dataUrl(approved),
              b: dataUrl(fold),
              w: Math.max(8, Math.round(fullWidth / scale)),
              h: Math.max(8, Math.round((box?.height ?? view.height) / scale)),
              tokens: bins,
              deltaE: THRESHOLDS.deltaE,
              minShare: THRESHOLDS.colourShare,
            });
            report.perceptual.golden = score.structure;
            if (score.structure < THRESHOLDS.golden)
              fail(
                `against the approved picture ${score.structure.toFixed(3)} < ${String(THRESHOLDS.golden)}`,
              );
            const composed = await scorer.evaluate(composeInBrowser, {
              a: dataUrl(approved),
              b: dataUrl(fold),
              map: score.map,
              mapW: score.mapW,
              mapH: score.mapH,
              labelA: 'APPROVED',
              labelB: `APP ${screen.id} ${theme}`,
            });
            await fs.writeFile(path.join(dir, 'side-by-side.png'), Buffer.from(composed, 'base64'));
          }
        }
      }
      await scorer.close();
    }
  } finally {
    await app.context.close();
    await concept.context.close();
  }

  await fs.writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  const p = report.perceptual;
  await fs.appendFile(
    path.join(OUT_ROOT, RUN_ID, 'summary.tsv'),
    [
      screen.id,
      theme,
      report.failures.length === 0 ? 'PASS' : 'FAIL',
      String(report.failures.length),
      p?.structure?.toFixed(3) ?? '',
      p?.palette?.toFixed(3) ?? '',
      p?.golden?.toFixed(3) ?? '',
    ].join('\t') + '\n',
  );
  return report;
}
```

- [ ] **Step 12: The tests: the gate, and the scorer's own calibration**

Create `e2e/fidelity/fidelity.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { THEMES } from './config';
import { runScreen } from './run';
import { SCREENS } from './screens';

for (const screen of SCREENS) {
  for (const theme of THEMES) {
    test(`${screen.id} ${theme} @fid-${screen.id} @fid-${screen.size} @fid-${theme}`, async ({
      browser,
    }, info) => {
      test.skip(screen.reserved !== undefined, screen.reserved ?? '');
      test.setTimeout(240_000);
      const report = await runScreen(browser, screen, theme);
      await info.attach('report.json', {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
      });
      expect(report.failures, `${screen.id} in ${theme}: pictures and report in ${report.dir}`).toEqual([]);
    });
  }
}
```

Create `e2e/fidelity/selftest.spec.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';

import { frameBox, openConcept, readTokens } from './concept';
import { KINDS, THEMES, THRESHOLDS, type Theme } from './config';
import { countKinds } from './probe';
import { scoreInBrowser, toBins, type ScoreOutput } from './score';

const conceptKinds = Object.fromEntries(Object.entries(KINDS).map(([kind, s]) => [kind, s.concept]));

/** A plausible faithful build: other copy, one rail place fewer, the board 6px lower. */
async function near(page: Page) {
  await page.evaluate(() => {
    const desk = document.querySelector<HTMLElement>('.desk');
    desk?.querySelectorAll('.nav-item')[1]?.remove();
    const title = desk?.querySelector('.topbar h1');
    if (title) title.textContent = 'ערב טוב, דניאל';
    const board = desk?.querySelector<HTMLElement>('.board');
    if (board) board.style.translate = '0 6px';
  });
}

/** A build that drifted: 24px gaps, a 200px balance, an account sheet missing, month 5 + categories 7. */
async function loose(page: Page) {
  await page.evaluate(() => {
    const desk = document.querySelector<HTMLElement>('.desk');
    const board = desk?.querySelector<HTMLElement>('.board');
    if (board) board.style.gap = '24px';
    const mega = desk?.querySelector<HTMLElement>('.bal .mega');
    if (mega) mega.style.fontSize = '200px';
    desk?.querySelectorAll('.acct')[3]?.remove();
    const month = desk?.querySelector<HTMLElement>('.month');
    if (month) month.style.gridColumn = 'span 5';
    const cats = desk?.querySelector<HTMLElement>('.cats');
    if (cats) cats.style.gridColumn = 'span 7';
  });
}

async function fold(browser: Browser, theme: Theme, change?: (page: Page) => Promise<void>) {
  const concept = await openConcept(browser, theme);
  await change?.(concept.page);
  const frame = await frameBox(concept.page, { kind: 'desk' });
  const png = await concept.page.screenshot({ fullPage: true, clip: frame.clip });
  const bins = toBins(await readTokens(concept.page));
  await concept.context.close();
  return { url: `data:image/png;base64,${png.toString('base64')}`, bins };
}

async function score(
  browser: Browser,
  a: string,
  b: string,
  bins: ReturnType<typeof toBins>,
): Promise<ScoreOutput> {
  const page = await browser.newPage();
  const result = await page.evaluate(scoreInBrowser, {
    a,
    b,
    w: 180,
    h: 112,
    tokens: bins,
    deltaE: THRESHOLDS.deltaE,
    minShare: THRESHOLDS.colourShare,
  });
  await page.close();
  return result;
}

test.describe('@fid-selftest the harness measures what the plan says', () => {
  test('the concept is the approved file, and counts as the plan inventories it', async ({ browser }) => {
    const concept = await openConcept(browser, 'light');
    const frame = await frameBox(concept.page, { kind: 'desk' });
    const counts = await concept.page.evaluate(countKinds, {
      kinds: conceptKinds,
      scope: frame.scope,
      scopeIndex: 0,
      origin: frame.origin,
      height: frame.height,
    });
    await concept.context.close();
    expect(counts).toEqual({
      sheet: 15,
      numeral: 8,
      mark: 8,
      hueBar: 10,
      huePill: 8,
      chip: 14,
      pill: 5,
      round: 3,
      dayHeading: 3,
      accountSheet: 5,
      cardSheet: 5,
      navItem: 9,
    });
  });

  for (const theme of THEMES) {
    test(`${theme}: itself scores 1, a near-faithful build passes, a loose one fails`, async ({
      browser,
    }) => {
      test.setTimeout(120_000);
      const truth = await fold(browser, theme);
      const self = await score(browser, truth.url, truth.url, truth.bins);
      expect(self.structure).toBeCloseTo(1, 3);
      expect(self.palette).toBeCloseTo(1, 3);

      const good = await score(browser, truth.url, (await fold(browser, theme, near)).url, truth.bins);
      expect(good.structure).toBeGreaterThanOrEqual(THRESHOLDS.structure);
      expect(good.palette).toBeGreaterThanOrEqual(THRESHOLDS.palette);

      const bad = await score(browser, truth.url, (await fold(browser, theme, loose)).url, truth.bins);
      expect(bad.structure).toBeLessThan(THRESHOLDS.structure);
    });
  }

  test('the shipped feed of 50b4e5b fails, as the audit found', async ({ browser }) => {
    const shipped = path.join(
      os.homedir(),
      '.bookandry-private',
      'design-audit',
      'app',
      'feed-fold-he-desktop-light.png',
    );
    test.skip(!fs.existsSync(shipped), 'the audit image is not on this machine');
    const truth = await fold(browser, 'light');
    const result = await score(
      browser,
      truth.url,
      `data:image/png;base64,${fs.readFileSync(shipped).toString('base64')}`,
      truth.bins,
    );
    expect(result.structure).toBeLessThan(THRESHOLDS.structure);
    expect(result.palette).toBeLessThan(THRESHOLDS.palette);
  });
});
```

- [ ] **Step 13: Wire the projects and the script**

In `playwright.config.ts`, add at the top (after the imports):

```ts
import { execSync } from 'node:child_process';

// One folder per run for the fidelity harness's pictures and reports (e2e/fidelity/config.ts).
process.env['FIDELITY_RUN'] ??=
  `${new Date().toISOString().replace(/[:.]/g, '-')}-${execSync('git rev-parse --short HEAD').toString().trim()}`;
```

and replace the `projects` array with:

```ts
  projects: [
    { name: 'en', testIgnore: /fidelity\//, use: { ...devices['Desktop Chrome'], locale: 'en-US' } },
    { name: 'he', testIgnore: /fidelity\//, use: { ...devices['Desktop Chrome'], locale: 'he-IL' } },
    { name: 'mobile', testIgnore: /fidelity\//, use: { ...devices['Pixel 7'], locale: 'en-US' } },
    // The fidelity harness (docs/superpowers/plans/2026-10-10-colour-of-money-phase-3.md): seeded once, then every screen.
    { name: 'fidelity-seed', testMatch: /fidelity\/seed\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'fidelity',
      testMatch: /fidelity\/.*\.spec\.ts/,
      dependencies: ['fidelity-seed'],
      // One at a time: every test opens two browsers' worth of pages and big screenshots.
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
```

In `package.json` `scripts`, add after `"test:e2e"`:

```json
    "fidelity": "playwright test --project=fidelity --workers=1",
```

In `knip.json`, make `entry` `["e2e/**/*.spec.ts", "e2e/**/*.setup.ts", "scripts/*.mjs"]`.

- [ ] **Step 14: Run the self-test**

Run: `npx kill-port 4173; pnpm fidelity --grep "@fid-selftest"`
Expected: 4 passed (the inventory, light, dark, the shipped feed), or 3 passed and 1 skipped on a machine without the audit images. A failure here means the scorer or the concept changed: stop and report; do not adjust a threshold.

- [ ] **Step 15: Run the baseline, which must fail**

Run: `pnpm fidelity`
Expected: exit 1. Every screen that is not `reserved` fails, in both themes (the selftest passes, the two add-card screens are skipped). Check the run's `summary.tsv`: `feed-desktop` light shows structure near 0.24 and palette near 0.67 (the audit's numbers), and its `side-by-side.png` shows the concept beside today's 640px column. Record the run folder in the ledger as the baseline. If any screen passes today, its expectations are too weak: stop and report.

- [ ] **Step 16: The gate, and commit**

Run: `pnpm verify`
Expected: exit 0 (the new unit test passes; typecheck covers `e2e/fidelity/**` through `tsconfig.e2e.json`; `gate:pci` has nothing to say: the household carries last four digits only).

```bash
git add e2e/fidelity src/db/concept-household.test.ts playwright.config.ts package.json knip.json
git commit -m "A fidelity harness measures each screen against the approved Bold sheets concept, by its elements, its layout and its colours, in both themes, and today's app fails it as the audit found" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Phase 3 vocabulary

Everything the parallel tasks share lands here first: every new string, every stylesheet rule, the one money helper and the `Button` marker. After it, Tasks 3–21 never touch `src/i18n/locales/**` or `src/index.css`.

**Files:**

- Modify: `src/i18n/locales/en/common.json`, `he/common.json`, `en/cards.json`, `he/cards.json`, `en/categories.json`, `he/categories.json`, `en/import.json`, `he/import.json`
- Modify: `src/index.css`, `src/lib/stylesheet.test.ts`
- Modify: `src/lib/money.ts`, `src/lib/money.test.ts`
- Modify: `src/components/ui/button.tsx`, `src/components/ui/button.test.tsx` (create it if absent)

**Interfaces:**

- Consumes: nothing new.
- Produces:
  - Strings (common): `nav.overview`, `nav.cashBox`; `topbar.morning|afternoon|evening` (`{{name}}`), `topbar.search`, `topbar.prevMonth`, `topbar.nextMonth`; `rail.pair` (`{{first}}`, `{{second}}`), `rail.many` (`{{first}}`, `{{count}}`); `board.*` (below); `chart.stats.*`; `commitments.byKind`, `commitments.nextCharges`. Strings (cards): `summary.title`, `summary.sub`, `summary.next`, `summary.nextFrom`, `details.title`, `details.empty`, `details.close`, `details.open`, `allCards`, `billedOn`. Strings (categories): `hue.label`, `hue.tone2`, `hue.names.<hue>`, `screen.thisMonth`, `screen.expense`, `screen.income`. Strings (import): `steps.choose|review|cards`, `steps.title`, `preview.title`, `preview.subtitle`, `preview.empty`.
  - CSS: `--pad-sheet-inline`, `--pad-sheet-block`, `--lede-size` (and utilities `px-sheet-x`, `pt-sheet-y`, `pb-sheet-y`, `text-lede`); `[data-numeral]` sized by `--numeral-units`; the sheet/hue border in `@layer base`.
  - `src/lib/money.ts`: `ratioPercent(part: Minor, whole: Minor): number` — whole percent, rounded half away from zero, 0 when `whole` is 0.
  - `Button` renders `data-variant={variant}`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/money.test.ts` (and `ratioPercent` to its import from `./money`):

```ts
describe('ratioPercent', () => {
  it('is the whole percent of the part, rounded half away from zero', () => {
    expect(ratioPercent(1_436_200, 2_390_000)).toBe(60); // 60.09…
    expect(ratioPercent(1, 8)).toBe(13); // 12.5
    expect(ratioPercent(-1, 8)).toBe(-13);
    expect(ratioPercent(3, 3)).toBe(100);
  });
  it('is 0 of nothing, rather than dividing by zero', () => {
    expect(ratioPercent(500, 0)).toBe(0);
  });
});
```

In `src/lib/stylesheet.test.ts`, replace the expectation in `it('never sets a numeral under 28px', …)` with:

```ts
expect(FLAT).toContain(
  'font-size: max(1.75rem, min(var(--numeral-max, 7.375rem), calc(100cqi / (var(--numeral-units, 2100) * 0.001))));',
);
```

and add to the same file:

```ts
describe('phase 3 sheet tokens', () => {
  it('pads a sheet 20/22 on a phone and 34/38 at 1440, fluidly', () => {
    expect(ROOT.get('--pad-sheet-inline')).toBe('clamp(1.375rem, 1.0036rem + 1.5238vw, 2.375rem)');
    expect(ROOT.get('--pad-sheet-block')).toBe('clamp(1.25rem, 0.925rem + 1.3333vw, 2.125rem)');
    expect(ROOT.get('--lede-size')).toBe('clamp(0.90625rem, 0.7786rem + 0.5238vw, 1.25rem)');
  });
  it('keeps the forced-colours edge in the base layer, so a utility can still set a border', () => {
    expect(CSS).toMatch(
      /@layer base \{[^}]*?\[data-sheet\],\s*\[data-hue\]\s*\{\s*border:\s*2px solid transparent;/s,
    );
  });
});
```

Create (or extend) `src/components/ui/button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('names its variant, so the harness and the sheets can find pills and round buttons', () => {
    render(
      <>
        <Button variant="pill">Cancel</Button>
        <Button variant="pill-solid">Save</Button>
        <Button>Plain</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('data-variant', 'pill');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('data-variant', 'pill-solid');
    expect(screen.getByRole('button', { name: 'Plain' })).toHaveAttribute('data-variant', 'default');
  });
});
```

Run: `pnpm exec vitest run --project unit src/lib/money.test.ts src/lib/stylesheet.test.ts && pnpm exec vitest run --project dom src/components/ui/button.test.tsx`
Expected: FAIL (`ratioPercent` is not exported; the CSS strings are absent; no `data-variant`).

- [ ] **Step 2: `ratioPercent`**

Add to `src/lib/money.ts`, after `sharesBp`:

```ts
/**
 * `part` as a whole percent of `whole`, rounded half away from zero: "60%" of
 * what came in has gone out. 0 when there is no whole. The one place a share
 * becomes a percent, so gate:money stays green everywhere else.
 */
export function ratioPercent(part: Minor, whole: Minor): number {
  if (whole === 0) return 0;
  return Number(divRound(BigInt(part) * 100n, BigInt(whole)));
}
```

- [ ] **Step 3: The stylesheet**

In `src/index.css`:

1. Delete the unlayered block

```css
[data-sheet],
[data-hue] {
  border: 2px solid transparent;
}
```

and add the same block inside the first `@layer base { … }` (line ≈973), with this comment above it: `/* Forced colours replace backgrounds: a transparent border is the edge they paint. In the base layer, so a border utility still wins (CAN WAIT 4). */`

2. In the phase 2 `:root` block (the one holding `--numeral-bleed`), add:

```css
/* Phase 3 (the concept's sheets): padding 20/22 on a phone, 34/38 at 1440. */
--pad-sheet-block: clamp(1.25rem, 0.925rem + 1.3333vw, 2.125rem);
--pad-sheet-inline: clamp(1.375rem, 1.0036rem + 1.5238vw, 2.375rem);
/* A hero sheet's lede: 14.5px on a phone, 20px at 1440. */
--lede-size: clamp(0.90625rem, 0.7786rem + 0.5238vw, 1.25rem);
```

3. In `@theme inline`, add beside `--spacing-sheet`:

```css
--spacing-sheet-x: var(--pad-sheet-inline);
--spacing-sheet-y: var(--pad-sheet-block);
--text-lede: var(--lede-size);
```

4. Replace the `[data-numeral]` rule's `font-size` line with:

```css
/* Fits its own column (Numeral is a size container) from Karantina's real
     advance widths, summed by Numeral into --numeral-units (units per 1000 em).
     Never over its cap, never under 28px. */
font-size: max(
  1.75rem,
  min(var(--numeral-max, 7.375rem), calc(100cqi / (var(--numeral-units, 2100) * 0.001)))
);
```

- [ ] **Step 4: `Button` names its variant**

In `src/components/ui/button.tsx`, in `function Button`, add `data-variant={variant ?? 'default'}` beside `data-slot="button"`.

- [ ] **Step 5: The strings**

Add to `src/i18n/locales/en/common.json` — inside `"nav"`: `"overview": "Overview", "cashBox": "Cash box"`; inside `"chart"`: `"stats": { … }`; inside `"commitments"`: two keys; and three new top-level objects:

```json
  "topbar": {
    "morning": "Good morning, {{name}}",
    "afternoon": "Good afternoon, {{name}}",
    "evening": "Good evening, {{name}}",
    "search": "Search transactions",
    "prevMonth": "Previous month",
    "nextMonth": "Next month"
  },
  "rail": {
    "pair": "{{first}} and {{second}}",
    "many": "{{first}} and {{count}} more"
  },
  "board": {
    "balanceTitle": "All the household's money",
    "balanceSub_one": "Today, in one bank and the wallet",
    "balanceSub_other": "Today, in {{count}} banks and the wallet",
    "ledeUp": "Since the start of the month <box>{{amount}}</box> came in, net.",
    "ledeDown": "Since the start of the month <box>{{amount}}</box> went out, net.",
    "ledeCards": "The cards take another <box>{{amount}}</box> by {{date}}.",
    "accountNext": "Next in {{date}}",
    "accountMask": "Account {{mask}}",
    "cashName": "Cash",
    "cashLabel": "In the wallet, counted {{date}}",
    "monthTitle": "{{month}} so far",
    "monthTitlePast": "{{month}}",
    "monthDay": "Day {{day}} of {{days}}",
    "in": "In",
    "out": "Out",
    "track": "{{percent}} of what came in went out",
    "note": "<box>{{percent}}</box> of what came in has gone out.",
    "noteNext": "Next in: {{name}}, {{date}}.",
    "charges": "Card charges by day",
    "charged": "charged",
    "left": "Left this month",
    "categoriesTitle": "{{month}} by category",
    "categoriesSub_one": "{{amount}} in one category",
    "categoriesSub_other": "{{amount}} in {{count}} categories",
    "categoriesEmpty": "Nothing spent this month yet.",
    "transactionsTitle": "Recent transactions",
    "transactionsSub_one": "One this month",
    "transactionsSub_other": "{{count}} this month",
    "allTransactions": "All transactions",
    "walletSub": "{{amount}} leaves the bank this month",
    "walletEmpty": "No cards yet.",
    "addCard": "+ Card",
    "count": "Count",
    "withdraw": "Withdraw",
    "deposit": "Deposit"
  },
```

with, inside `"chart"`:

```json
    "stats": {
      "title": "The months in numbers",
      "in": "In",
      "out": "Out",
      "net": "Net",
      "largest": "Largest month",
      "average": "Average month",
      "top": "Largest categories"
    },
```

and inside `"commitments"`: `"byKind": "By kind", "nextCharges": "Next charges"`.

Add to `src/i18n/locales/he/common.json` — inside `"nav"`: `"overview": "סקירה", "cashBox": "קופת מזומן"`; and:

```json
  "topbar": {
    "morning": "בוקר טוב, {{name}}",
    "afternoon": "צהריים טובים, {{name}}",
    "evening": "ערב טוב, {{name}}",
    "search": "חיפוש תנועות",
    "prevMonth": "החודש הקודם",
    "nextMonth": "החודש הבא"
  },
  "rail": {
    "pair": "{{first}} ו{{second}}",
    "many": "{{first}} ועוד {{count}}"
  },
  "board": {
    "balanceTitle": "כל הכסף של משק הבית",
    "balanceSub_one": "היום, בבנק אחד ובארנק",
    "balanceSub_two": "היום, בשני בנקים ובארנק",
    "balanceSub_other": "היום, ב־{{count}} בנקים ובארנק",
    "ledeUp": "מתחילת החודש נוספו <box>{{amount}}</box>.",
    "ledeDown": "מתחילת החודש ירדו <box>{{amount}}</box>.",
    "ledeCards": "הכרטיסים יורידו עוד <box>{{amount}}</box> עד {{date}}.",
    "accountNext": "נכנס ב־{{date}}",
    "accountMask": "חשבון {{mask}}",
    "cashName": "מזומן",
    "cashLabel": "בארנק, נספר ב־{{date}}",
    "monthTitle": "{{month}} עד היום",
    "monthTitlePast": "{{month}}",
    "monthDay": "יום {{day}} מתוך {{days}}",
    "in": "נכנס",
    "out": "יצא",
    "track": "יצא {{percent}} ממה שנכנס",
    "note": "יצא <box>{{percent}}</box> ממה שנכנס.",
    "noteNext": "הבא בתור: {{name}}, ב־{{date}}.",
    "charges": "חיובי הכרטיסים לפי יום",
    "charged": "חויב",
    "left": "נשאר החודש",
    "categoriesTitle": "{{month}} לפי קטגוריה",
    "categoriesSub_one": "{{amount}} בקטגוריה אחת",
    "categoriesSub_two": "{{amount}} בשתי קטגוריות",
    "categoriesSub_other": "{{amount}} ב־{{count}} קטגוריות",
    "categoriesEmpty": "עוד לא יצא כסף החודש.",
    "transactionsTitle": "תנועות אחרונות",
    "transactionsSub_one": "אחת החודש",
    "transactionsSub_two": "שתיים החודש",
    "transactionsSub_other": "{{count}} החודש",
    "allTransactions": "כל התנועות",
    "walletSub": "{{amount}} יורדים מהבנק החודש",
    "walletEmpty": "עוד אין כרטיסים.",
    "addCard": "+ כרטיס",
    "count": "ספירה",
    "withdraw": "משיכה",
    "deposit": "הפקדה"
  },
```

with, inside `"chart"`:

```json
    "stats": {
      "title": "החודשים במספרים",
      "in": "נכנס",
      "out": "יצא",
      "net": "נטו",
      "largest": "החודש הגדול",
      "average": "חודש ממוצע",
      "top": "הקטגוריות הגדולות"
    },
```

and inside `"commitments"`: `"byKind": "לפי סוג", "nextCharges": "החיובים הבאים"`.

Add to `src/i18n/locales/en/cards.json`:

```json
  "summary": {
    "title": "Leaves the bank this month",
    "sub": "{{cards}} cards, {{days}} charge days",
    "next": "Next: <box>{{amount}}</box> on {{date}}.",
    "nextFrom": "Next: <box>{{amount}}</box> on {{date}}, from {{account}}."
  },
  "details": {
    "title": "Card details",
    "empty": "Choose a card to see its bills, its transactions and its rates.",
    "close": "Close the details",
    "open": "Details of {{name}}"
  },
  "allCards": "All cards",
  "billedOn": "Charged on day {{day}}",
```

and to `he/cards.json`:

```json
  "summary": {
    "title": "יורד מהבנק החודש",
    "sub": "{{cards}} כרטיסים, {{days}} מועדי חיוב",
    "next": "הבא בתור: <box>{{amount}}</box> ב־{{date}}.",
    "nextFrom": "הבא בתור: <box>{{amount}}</box> ב־{{date}}, מ{{account}}."
  },
  "details": {
    "title": "פרטי הכרטיס",
    "empty": "בחרו כרטיס כדי לראות את החיובים, התנועות והריביות שלו.",
    "close": "סגירת הפרטים",
    "open": "הפרטים של {{name}}"
  },
  "allCards": "כל הכרטיסים",
  "billedOn": "חיוב ב־{{day}}",
```

Add to `src/i18n/locales/en/categories.json`:

```json
  "hue": {
    "label": "Colour",
    "tone2": "{{name}}, deeper",
    "names": {
      "indigo": "Indigo",
      "green": "Green",
      "vermilion": "Vermilion",
      "amber": "Amber",
      "orange": "Orange",
      "cyan": "Cyan",
      "violet": "Violet",
      "rose": "Rose",
      "magenta": "Magenta",
      "teal": "Teal",
      "blue": "Blue",
      "lime": "Lime"
    }
  },
  "screen": { "thisMonth": "This month", "expense": "Expenses", "income": "Income" },
```

and to `he/categories.json`:

```json
  "hue": {
    "label": "צבע",
    "tone2": "{{name}}, כהה",
    "names": {
      "indigo": "אינדיגו",
      "green": "ירוק",
      "vermilion": "אדום־כתום",
      "amber": "ענבר",
      "orange": "כתום",
      "cyan": "תכלת",
      "violet": "סגול",
      "rose": "ורוד",
      "magenta": "מג׳נטה",
      "teal": "טורקיז",
      "blue": "כחול",
      "lime": "ליים"
    }
  },
  "screen": { "thisMonth": "החודש", "expense": "הוצאות", "income": "הכנסות" },
```

Add to `src/i18n/locales/en/import.json`:

```json
  "steps": { "title": "Smart import", "choose": "Choose the files", "review": "Review", "cards": "Finish the cards" },
  "preview": { "title": "The card found", "subtitle": "As it will look", "empty": "A card found in the files shows here." },
```

and to `he/import.json`:

```json
  "steps": { "title": "ייבוא חכם", "choose": "בחירת הקבצים", "review": "בדיקה", "cards": "השלמת הכרטיסים" },
  "preview": { "title": "הכרטיס שנמצא", "subtitle": "כך הוא ייראה", "empty": "כרטיס שיימצא בקבצים יופיע כאן." },
```

(The `_two` forms exist in Hebrew only, as `locales.test.ts` requires. If `import.json` already has a `steps` or `preview` key, merge into it.)

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run --project unit src/lib/money.test.ts src/lib/stylesheet.test.ts src/i18n/locales.test.ts src/lib/money-colours.test.ts && pnpm exec vitest run --project dom src/components/ui/button.test.tsx`
Expected: PASS. `money.ts` keeps 100% coverage.

- [ ] **Step 7: The gate, the harness, and commit**

Run: `pnpm verify`
Expected: exit 0.

Run: `pnpm fidelity --grep "@fid-selftest"`
Expected: pass (this task changes no screen; the self-test proves the harness still stands).

```bash
git add src/i18n/locales src/index.css src/lib/stylesheet.test.ts src/lib/money.ts src/lib/money.test.ts src/components/ui/button.tsx src/components/ui/button.test.tsx
git commit -m "The screens' words are in both languages, sheets get the concept's padding, numerals are sized by their real width, and buttons say which kind they are" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: `Sheet`, `SheetHead`, `Chip` and `HuePill`

The concept's three missing atoms. Every screen task composes from these, so no screen writes `data-sheet` or a radius by hand.

**Files:**

- Create: `src/components/ui/sheet-surface.tsx`, `src/components/ui/sheet-surface.test.tsx`
- Create: `src/components/ui/chip.tsx`, `src/components/ui/hue-pill.tsx`, `src/components/ui/chip.test.tsx`

**Interfaces:**

- Consumes (Task 2): `px-sheet-x`, `pt-sheet-y`, `pb-sheet-y`; existing `TitlePair` (`size: 'hero' | 'sheet'`), `MoneyKey`, `HueToken`, the `[data-money]` and `[data-hue]` mappings, `bg-fill`, `text-on-fill`, `bg-hue`.
- Produces:
  - `type SheetKind = 'paper' | 'night' | 'sapphire' | 'money'`; `type SheetRadius = 'board' | 'card' | 'cash' | 'row'`.
  - `Sheet(props: { kind: SheetKind; moneyKey?: MoneyKey; radius?: SheetRadius; bleed?: boolean; as?: 'section' | 'div' | 'article' | 'li' } & React.HTMLAttributes<HTMLElement>)` — emits `data-sheet`, `data-money` (money only, `neutral` when absent), the radius, the fluid padding (block-end 0 when `bleed`), `overflow-clip`.
  - `SheetHead({ title: string; subtitle?: string; size?: 'hero' | 'sheet'; as?: 'h2' | 'h3'; action?: ReactNode; className?: string })` — `data-slot="sheet-head"`.
  - `Chip({ moneyKey: MoneyKey; children: ReactNode; className?: string })` — `data-slot="chip"`, ≥ 24px, 13px weight 500, the key's fill and tint; a ring when its parent sets `--chip-ring`.
  - `HuePill({ hue: HueToken | undefined; className?: string })` — `data-slot="hue-pill"`, 14×40, `aria-hidden`, a 2px inset ring when there is no hue.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/sheet-surface.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n } from '@/test/render';

import { Sheet, SheetHead } from './sheet-surface';

beforeAll(async () => {
  await initTestI18n();
});

describe('Sheet', () => {
  it('is a sheet of its kind, keyed, clipped and padded', () => {
    render(
      <Sheet kind="money" moneyKey="bank-10" aria-label="Leumi">
        x
      </Sheet>,
    );
    const sheet = screen.getByRole('region', { name: 'Leumi' });
    expect(sheet).toHaveAttribute('data-sheet', 'money');
    expect(sheet).toHaveAttribute('data-money', 'bank-10');
    expect(sheet.className).toMatch(/overflow-clip/);
    expect(sheet.className).toMatch(/rounded-sheet\b/);
    expect(sheet.className).toMatch(/pb-sheet-y/);
  });

  it('falls back to neutral money, never to a colour of its own', () => {
    const { container } = render(<Sheet kind="money">x</Sheet>);
    expect(container.firstElementChild).toHaveAttribute('data-money', 'neutral');
  });

  it('gives no money key to a house sheet', () => {
    const { container } = render(<Sheet kind="night">x</Sheet>);
    expect(container.firstElementChild).not.toHaveAttribute('data-money');
  });

  it('has no padding at its foot when a numeral bleeds off it', () => {
    const { container } = render(
      <Sheet kind="sapphire" bleed radius="cash">
        x
      </Sheet>,
    );
    expect(container.firstElementChild?.className).toMatch(/\bpb-0\b/);
    expect(container.firstElementChild?.className).toMatch(/rounded-sheet-cash/);
  });
});

describe('SheetHead', () => {
  it('reads as one heading, with its action beside it', () => {
    render(
      <SheetHead
        title="October by category"
        subtitle="₪14,362 in ten"
        action={<button type="button">All</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('October by category₪14,362 in ten');
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
  });
});
```

Create `src/components/ui/chip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Chip } from './chip';
import { HuePill } from './hue-pill';

describe('Chip', () => {
  it('is the company colour with its name, never colour alone', () => {
    render(<Chip moneyKey="issuer-max">Max 0937</Chip>);
    const chip = screen.getByText('Max 0937');
    expect(chip).toHaveAttribute('data-slot', 'chip');
    expect(chip).toHaveAttribute('data-money', 'issuer-max');
    expect(chip.className).toMatch(/min-h-6/);
  });
});

describe('HuePill', () => {
  it('is a mark: hidden from screen readers, keyed by hue', () => {
    const { container } = render(<HuePill hue="green" />);
    const pill = container.querySelector('[data-slot="hue-pill"]');
    expect(pill).toHaveAttribute('aria-hidden', 'true');
    expect(pill).toHaveAttribute('data-hue', 'green');
    expect(pill?.className).toMatch(/h-10/);
    expect(pill?.className).toMatch(/w-3\.5/);
  });

  it('is an outline when the row has no category hue', () => {
    const { container } = render(<HuePill hue={undefined} />);
    const pill = container.querySelector('[data-slot="hue-pill"]');
    expect(pill).toHaveAttribute('data-hue', 'neutral');
    expect(pill?.className).toMatch(/inset_0_0_0_2px/);
  });
});
```

Run: `pnpm exec vitest run --project dom src/components/ui/sheet-surface.test.tsx src/components/ui/chip.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 2: `Sheet` and `SheetHead`**

Create `src/components/ui/sheet-surface.tsx`:

```tsx
import { cn } from 'cn';
import type * as React from 'react';

import type { MoneyKey } from '@/domain/money-key';

import { TitlePair } from './title-pair';

export type SheetKind = 'paper' | 'night' | 'sapphire' | 'money';

const RADIUS = {
  board: 'rounded-sheet', // 36 → 56: board sheets, phone sheets
  card: 'rounded-sheet-s', // 34 → 36: card sheets, the phone summary
  cash: 'rounded-sheet-cash', // 36 → 44: the cash sheet
  row: 'rounded-row', // 26: account sheets inside the balance sheet
} as const;
export type SheetRadius = keyof typeof RADIUS;

/**
 * A sheet of the concept (§9.1): one colour, a big radius, clipped, its text
 * in its own tint (index.css maps the kind and the key; §1.5, §1.6). Sheets
 * sit one `gap-sheet` apart so the paper shows between them. A screen never
 * paints a sheet itself: it says which kind, and which money.
 */
export function Sheet({
  kind,
  moneyKey,
  radius = 'board',
  bleed = false,
  as: Tag = 'section',
  className,
  ...props
}: {
  readonly kind: SheetKind;
  /** With kind "money": a key from src/domain/money-key.ts. */
  readonly moneyKey?: MoneyKey;
  readonly radius?: SheetRadius;
  /** A huge numeral runs off this sheet's foot, so there is no padding under it (§9.4). */
  readonly bleed?: boolean;
  readonly as?: 'section' | 'div' | 'article' | 'li';
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      data-sheet={kind}
      data-money={kind === 'money' ? (moneyKey ?? 'neutral') : undefined}
      className={cn(
        'px-sheet-x pt-sheet-y relative overflow-clip',
        bleed ? 'pb-0' : 'pb-sheet-y',
        RADIUS[radius],
        className,
      )}
      {...props}
    />
  );
}

/** A sheet's title pair (600 over 300, read once), with its one action at the inline end. */
export function SheetHead({
  title,
  subtitle,
  size = 'sheet',
  as = 'h2',
  action,
  className,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly size?: 'hero' | 'sheet';
  readonly as?: 'h2' | 'h3';
  readonly action?: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <div data-slot="sheet-head" className={cn('flex items-start justify-between gap-4', className)}>
      <TitlePair as={as} size={size} title={title} subtitle={subtitle} className="min-w-0" />
      {action === undefined ? null : <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 3: `Chip` and `HuePill`**

Create `src/components/ui/chip.tsx`:

```tsx
import { cn } from 'cn';
import type { ReactNode } from 'react';

import type { MoneyKey } from '@/domain/money-key';

/**
 * A card, bank or cash in a row's meta line (§9.2): a pill in the money colour
 * with its tint, at least 24px, 13px in 500, its name always written on it.
 * Not a sheet (no grain, no 2px border): its forced-colours edge is a
 * transparent outline. Inside the month sheet its parent sets `--chip-ring`
 * (the sheet's tint at 55%) and it draws that ring.
 */
export function Chip({
  moneyKey,
  children,
  className,
}: {
  readonly moneyKey: MoneyKey;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      data-slot="chip"
      data-money={moneyKey}
      className={cn(
        'inline-flex min-h-6 items-center rounded-full bg-fill px-2.5 text-[0.8125rem] leading-none font-medium whitespace-nowrap text-on-fill',
        'shadow-[0_0_0_1.5px_var(--chip-ring,transparent)] outline-2 -outline-offset-2 outline-transparent',
        className,
      )}
    >
      {children}
    </span>
  );
}
```

Create `src/components/ui/hue-pill.tsx`:

```tsx
import { cn } from 'cn';

import type { HueToken } from '@/domain/category-hue';

/**
 * A row's category as a 14×40 pill of its hue (§5.1), where the old rows had
 * an icon disc. A mark, never text (decision 10): hidden from screen readers,
 * the category's name is in the row. A row with no category hue gets the
 * concept's outline instead of a fill.
 */
export function HuePill({
  hue,
  className,
}: {
  readonly hue: HueToken | undefined;
  readonly className?: string;
}) {
  return (
    <i
      aria-hidden="true"
      data-slot="hue-pill"
      data-hue={hue ?? 'neutral'}
      className={cn(
        'block h-10 w-3.5 shrink-0 rounded-full bg-hue',
        hue === undefined && 'bg-transparent shadow-[inset_0_0_0_2px_var(--border)]',
        className,
      )}
    />
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project dom src/components/ui/sheet-surface.test.tsx src/components/ui/chip.test.tsx`
Expected: PASS.

- [ ] **Step 5: The gate, the harness, and commit**

Run: `pnpm verify` → exit 0. Run: `pnpm fidelity --grep "@fid-selftest"` → pass.

```bash
git add src/components/ui/sheet-surface.tsx src/components/ui/sheet-surface.test.tsx src/components/ui/chip.tsx src/components/ui/hue-pill.tsx src/components/ui/chip.test.tsx
git commit -m "Screens can draw the concept's sheets, company-colour chips and category hue pills from one place each" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: `Numeral` that fits its own column, relative `HueBars`, `Mark` that may wrap

The audit's numeral defect and three CAN WAIT items that block fidelity: the numeral is sized against the nearest container, which is not its column (CAN WAIT 2); the 0.34em rule cannot reach the concept's 252px; hue bars are shares of the total, where the concept draws them against the largest; `Mark`'s `nowrap` defeats `box-decoration-break` (CAN WAIT 24); `CardSheet` sizes by the viewport (CAN WAIT 8) and its figure can collide with the name (CAN WAIT 23).

**Files:**

- Create: `src/components/ui/numeral-units.ts`, `src/components/ui/numeral-units.test.tsx`
- Modify: `src/components/ui/numeral.tsx`, `src/components/ui/numeral.test.tsx`
- Modify: `src/components/ui/hue-bars.tsx`, `src/components/ui/hue-bars.test.tsx`
- Modify: `src/components/ui/mark.tsx`, `src/components/ui/card-sheet.tsx`, `src/components/ui/card-sheet.test.tsx`
- Modify: `e2e/22-numerals.spec.ts`

**Interfaces:**

- Consumes (Task 2): the `[data-numeral]` rule reading `--numeral-units`.
- Produces:
  - `KARANTINA_ADVANCE: Readonly<Record<string, number>>`; `numeralUnits(parts: { sign: string; symbol: string; digits: string }): number` (units per 1000 em).
  - `Numeral({ minor, currency, size, rounded?, fit?: Minor, className? })` — the outer span is a size container (`@container`); the visible span carries `data-numeral`, `data-numeral-size={size}` and `--numeral-units`; it may wrap only after the currency sign. `fit` sizes it for another figure (a count-up passes the settled amount).
  - `HueBars({ items, currency, limit? })` — bars relative to the largest; no bar for a zero; `role="list"`; names on up to two lines with a `title`.
  - `Mark({ wrap?: boolean, ...span props })` — `wrap` lets a long box break and keep its ends.
  - `CardSheet({ …, as?: 'h2' | 'h3' })` — sized by `@board/main:`; the figure takes the free width and hugs the far side, swapping with the sheet.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/numeral-units.test.tsx`:

```ts
import { describe, expect, it } from 'vitest';

import { KARANTINA_ADVANCE, numeralUnits } from './numeral-units';

describe('numeralUnits', () => {
  it("measures the concept's balance exactly: ₪58,555 is 2.096em", () => {
    expect(numeralUnits({ sign: '', symbol: '₪', digits: '58,555' })).toBe(2096);
  });

  it('counts the minus, and the symbol at half size with its 0.04em', () => {
    expect(numeralUnits({ sign: '−', symbol: '₪', digits: '244' })).toBe(280 + 326 + 40 + 307 + 383 + 383);
  });

  it('adds nothing for a figure without a symbol', () => {
    expect(numeralUnits({ sign: '', symbol: '', digits: '10' })).toBe(243 + 350);
  });

  it('takes the widest digit for a glyph it does not know, so it never overflows', () => {
    expect(numeralUnits({ sign: '', symbol: '', digits: '?' })).toBe(KARANTINA_ADVANCE['4']);
  });

  it('ignores the direction marks a Hebrew format adds', () => {
    expect(numeralUnits({ sign: '', symbol: '', digits: '‏1‎' })).toBe(243);
  });
});
```

Add to `src/components/ui/numeral.test.tsx`:

```tsx
it('carries its real width and its size, and is its own container', () => {
  const { container } = render(<Numeral minor={5_855_500} currency="ILS" size="balance" rounded />);
  const numeral = container.querySelector<HTMLElement>('[data-numeral]');
  expect(numeral?.style.getPropertyValue('--numeral-units')).toBe('2096');
  expect(numeral).toHaveAttribute('data-numeral-size', 'balance');
  expect(container.firstElementChild?.className).toMatch(/@container/);
});

it('is not a container when it is a small figure that never bleeds, so an auto-sized cell can hold it', () => {
  const { container } = render(<Numeral minor={1_375_000} currency="ILS" size="account" rounded />);
  expect(container.firstElementChild?.className).not.toMatch(/@container/);
  expect(container.querySelector('[data-numeral]')).toHaveAttribute('data-numeral-size', 'account');
});

it('may break only after the currency sign', () => {
  const { container } = render(<Numeral minor={5_855_500} currency="ILS" size="balance" rounded />);
  expect(container.querySelector('[data-numeral] wbr')).not.toBeNull();
});

it('is sized for the figure it settles on while it counts up', () => {
  const { container } = render(<Numeral minor={100} currency="ILS" size="balance" fit={5_855_500} />);
  expect(
    container.querySelector<HTMLElement>('[data-numeral]')?.style.getPropertyValue('--numeral-units'),
  ).toBe('2096');
});
```

(In the `he` run the formatted figure may carry direction marks; the units ignore them, so the expected number is the same.)

Add to `src/components/ui/hue-bars.test.tsx`:

```tsx
it('draws each bar against the largest, as the concept does', () => {
  const { container } = render(
    <HueBars
      currency="ILS"
      items={[
        { id: 'rent', name: 'Rent', minor: 560_000, hue: 'indigo' },
        { id: 'food', name: 'Groceries', minor: 284_000, hue: 'green' },
      ]}
    />,
  );
  const bars = [...container.querySelectorAll<HTMLElement>('i[data-hue]')];
  expect(bars[0]?.style.getPropertyValue('--bp')).toBe(bars[0]?.style.getPropertyValue('--bp-max'));
  expect(bars[0]?.className).toMatch(/var\(--bp\)\/var\(--bp-max\)/);
});

it('draws no bar for a category with nothing in it', () => {
  const { container } = render(
    <HueBars
      currency="ILS"
      items={[
        { id: 'a', name: 'A', minor: 0, hue: 'teal' },
        { id: 'b', name: 'B', minor: 5, hue: 'lime' },
      ]}
    />,
  );
  expect(container.querySelectorAll('i[data-hue]')).toHaveLength(1);
});

it('stays a list in Safari, and keeps a long name whole', () => {
  render(
    <HueBars
      currency="ILS"
      items={[{ id: 'a', name: 'חשבונות בית ועוד דברים ארוכים', minor: 5, hue: 'cyan' }]}
    />,
  );
  expect(screen.getByRole('list')).toBeInTheDocument();
  expect(screen.getByText('חשבונות בית ועוד דברים ארוכים')).toHaveAttribute(
    'title',
    'חשבונות בית ועוד דברים ארוכים',
  );
});
```

Add to `src/components/ui/card-sheet.test.tsx`:

```tsx
it('gives its figure the free width, at the far side, and takes a heading level', () => {
  const { container } = renderWithProviders(
    <CardSheet moneyKey="issuer-max" name="Max" as="h2" figure={<span>fig</span>} />,
  );
  expect(screen.getByRole('heading', { level: 2, name: 'Max' })).toBeInTheDocument();
  const figure = container.querySelector('[data-slot="card-sheet-figure"]');
  expect(figure?.className).toMatch(/flex-1/);
  expect(container.firstElementChild?.className).toMatch(/@board\/main:min-h-27/);
});
```

Run: `pnpm exec vitest run --project dom src/components/ui/numeral.test.tsx src/components/ui/hue-bars.test.tsx src/components/ui/card-sheet.test.tsx src/components/ui/numeral-units.test.tsx`
Expected: FAIL.

(`.test.tsx`, though it renders nothing: the `dom` project is the one that globs `src/components/**`.)

- [ ] **Step 2: The advance widths**

Create `src/components/ui/numeral-units.ts`:

```ts
/**
 * Karantina 700's advance widths, in units per 1000 em, measured in Chromium
 * from @fontsource/karantina 5.3.0 (canvas measureText at 1000px, 2026-10-10).
 * The digits are proportional (243 to 383), so a figure's width is the sum of
 * its glyphs, not their count: "₪58,555" is 2.096em, which is what lets the
 * concept's 252px balance fit its 580px column exactly (phase 3 plan,
 * decision 6). Zero-width direction marks a Hebrew format adds count nothing.
 */
export const KARANTINA_ADVANCE: Readonly<Record<string, number>> = {
  '0': 350,
  '1': 243,
  '2': 307,
  '3': 307,
  '4': 383,
  '5': 307,
  '6': 340,
  '7': 319,
  '8': 350,
  '9': 350,
  ',': 152,
  '.': 143,
  '₪': 652,
  $: 346,
  '€': 427,
  '£': 431,
  '¥': 409,
  '−': 280,
  '-': 274,
  ' ': 200,
  ' ': 200,
  '‎': 0,
  '‏': 0,
  '⁦': 0,
  '⁧': 0,
  '⁨': 0,
  '⁩': 0,
};

/** The widest digit: an unknown glyph is assumed this wide, so a figure never overflows. */
const WIDEST = 383;

/** The symbol is drawn at half size with 0.04em after it (§9.5). */
const SYMBOL_GAP = 40;

export function numeralUnits(parts: {
  readonly sign: string;
  readonly symbol: string;
  readonly digits: string;
}): number {
  const width = (text: string) =>
    [...text].reduce((total, glyph) => total + (KARANTINA_ADVANCE[glyph] ?? WIDEST), 0);
  const symbol = parts.symbol === '' ? 0 : Math.ceil(width(parts.symbol) / 2) + SYMBOL_GAP;
  return width(parts.sign) + symbol + width(parts.digits);
}
```

- [ ] **Step 3: `Numeral`**

In `src/components/ui/numeral.tsx`:

1. Import `numeralUnits` from `./numeral-units`. Add the prop `/** Size the figure for this amount instead (a count-up passes the settled one), so it never jitters. */ readonly fit?: Minor;`.
2. Replace the `glyphs` line with:

```tsx
const fitted =
  fit === undefined
    ? parts
    : figureParts(rounded ? wholeMinor(fit, currency) : fit, currency, {
        locale: i18n.language,
        whole: isWhole,
      });
const units = numeralUnits(fitted); // money-allow: glyph widths, not money
```

3. Replace the returned JSX with:

```tsx
// Its own size container: 100cqi is this column, never a wider ancestor's (CAN WAIT 2). The small
// figures that never bleed (an account's, a charge day's) sit in auto-sized cells and take their cap.
<span
  className={cn(
    NEVER_BLEEDS.has(size) ? 'relative inline-block' : '@container relative block min-w-0',
    className,
  )}
>
  <span
    aria-hidden="true"
    data-numeral=""
    data-numeral-size={size}
    dir="ltr"
    className="block font-display [unicode-bidi:isolate]"
    style={
      {
        '--numeral-units': String(units),
        '--numeral-max': NUMERAL_MAX[size],
        ...(bleeds ? {} : { '--b': '0' }),
      } as CSSProperties
    }
  >
    {parts.sign}
    {/* Half size, raised 0.62em, so it ends far above the cut (§9.4). */}
    <span className="me-[0.04em] align-[0.62em] text-[0.5em]">{parts.symbol}</span>
    {/* A figure that would need less than 28px breaks here, never inside the digits (§12). */}
    <wbr />
    <span className="whitespace-nowrap">{parts.digits}</span>
  </span>
  <span className="sr-only">{formatMoney(minor, currency, { locale: i18n.language }).aria}</span>
</span>
```

Update the doc comment: the figure fits its own column by Karantina's advance widths; a parent must give that column its width (a block, a grid cell or a `flex-1` item), never size it to its content.

- [ ] **Step 4: `HueBars`, `Mark`, `CardSheet`**

In `src/components/ui/hue-bars.tsx`, replace `HueBars`' returned list with:

```tsx
const largest = Math.max(1, ...shares);
return (
  // role="list": Safari drops list semantics from a list with list-style none.
  <ul role="list" data-slot="hue-bars" className="grid gap-1.75">
    {shown.map((item, index) => (
      <li
        key={item.id}
        className="grid min-h-8 grid-cols-[minmax(0,8rem)_minmax(0,1fr)_minmax(5.25rem,auto)] items-center gap-3.5 text-base"
      >
        <span title={item.name} className="line-clamp-2">
          {item.name}
        </span>
        <span aria-hidden="true" className="block h-7.5">
          {item.minor <= 0 ? null : (
            <i
              data-hue={item.hue}
              // Against the largest, as the concept draws them (rent is the whole track); at least 30px.
              className="block h-full w-[calc(var(--bp)/var(--bp-max)*100%)] min-w-7.5 rounded-full bg-hue"
              style={{ '--bp': String(shares[index] ?? 0), '--bp-max': String(largest) } as CSSProperties}
            />
          )}
        </span>
        <Money minor={item.minor} currency={currency} className="text-end font-medium" />
      </li>
    ))}
  </ul>
);
```

and in `MoneyStrip`, filter out zero shares before drawing (`shown.filter((_, i) => (shares[i] ?? 0) > 0)`, keeping each item's own share).

In `src/components/ui/mark.tsx`, add the prop `wrap?: boolean` and apply `whitespace-nowrap` only when `wrap !== true`:

```tsx
export function Mark({
  className,
  wrap = false,
  ...props
}: React.ComponentProps<'span'> & { readonly wrap?: boolean }) {
  return (
    <span
      data-slot="mark"
      className={cn(
        'rounded-mark bg-box box-decoration-clone px-[0.28em] pt-[0.04em] pb-[0.1em] font-semibold text-box-text [unicode-bidi:isolate]',
        !wrap && 'whitespace-nowrap',
        className,
      )}
      {...props}
    />
  );
}
```

In `src/components/ui/card-sheet.tsx`:

- add `readonly as?: 'h2' | 'h3';` (default `'h3'`) and render the title with it;
- replace the viewport sizes with container ones: `min-h-31 @board/main:min-h-27`, `px-5 @board/main:px-6.5`, `pt-4 @board/main:pt-4.5`, and the name `text-[1.1875rem] @board/main:text-xl`;
- replace the figure wrapper with

```tsx
{
  figure === undefined ? null : (
    // The free width, so the numeral fits what is left beside the name; it hugs the far side.
    <div
      data-slot="card-sheet-figure"
      className="min-w-0 flex-1 [&_[data-numeral]]:ms-auto [&_[data-numeral]]:w-fit"
    >
      {figure}
    </div>
  );
}
```

- and add to the article's classes, for the swapped sheets:
  `'[&:nth-child(even_of_[data-card-sheet])_[data-numeral]]:ms-0 [&:nth-child(even_of_[data-card-sheet])_[data-numeral]]:me-auto'`.

- [ ] **Step 5: The sideways check in the browser**

In `e2e/22-numerals.spec.ts`, inside the loop over `numerals`, after the "past the foot" check, add:

```ts
// Never cut at a side: the run of digits stays inside its sheet (CAN WAIT 2).
const side = sheet.getBoundingClientRect();
const digits = numeral.lastElementChild?.getBoundingClientRect() ?? numeral.getBoundingClientRect();
if (digits.left < side.left - 1 || digits.right > side.right + 1)
  bad.push(`${label}: runs past the sheet's side`);
```

and update the file's doc comment: "…and no numeral runs past its sheet's side."

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run --project dom src/components/ui/numeral.test.tsx src/components/ui/hue-bars.test.tsx src/components/ui/card-sheet.test.tsx src/components/ui/mark.test.tsx src/components/ui/numeral-units.test.tsx`
Expected: PASS, including every test that was there before.

- [ ] **Step 7: The gate, the harness, and commit**

Run: `pnpm verify` → exit 0. Run: `pnpm fidelity --grep "@fid-selftest"` → pass. Run: `pnpm exec playwright test e2e/22-numerals.spec.ts --project=en` → every case still skipped (no screen draws a numeral until Task 7), none failing.

```bash
git add src/components/ui/numeral-units.ts src/components/ui/numeral-units.test.tsx src/components/ui/numeral.tsx src/components/ui/numeral.test.tsx src/components/ui/hue-bars.tsx src/components/ui/hue-bars.test.tsx src/components/ui/mark.tsx src/components/ui/card-sheet.tsx src/components/ui/card-sheet.test.tsx e2e/22-numerals.spec.ts
git commit -m "Big figures fit their own column by Karantina's real widths and can reach the concept's 252px, category bars run against the largest, and boxes may wrap" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Editors with the concept's footers and headers

CAN WAIT 1, 7, 10 and 17: every editor ends in two 32px default buttons where §6.1 and the concept have 48px pills; the header's padding does not line up with the body's; the first field sits under the subtitle with no gap; pop-out actions scroll inside the body. The audit saw this in the first panel the user opens.

**Files:**

- Modify: `src/components/ui/editor-panel.tsx`, `src/components/ui/editor-panel.test.tsx`
- Modify (action rows and body wrappers only): `src/features/transaction/transaction-sheet.tsx`, `src/features/cards/method-editor.tsx`, `src/features/profiles/profile-editor.tsx`, `src/features/settings/categories-screen.tsx` (its `CategoryEditor` only), `src/features/cash/count-sheet.tsx`, `src/features/cash/move-sheet.tsx`, `src/features/account/account-sheet.tsx`, `src/features/summary/breakdown-sheet.tsx`, `src/features/settings/business-types-sheet.tsx`
- Modify: `src/components/ui/pop-out.tsx`, `src/features/transaction/split-purchase.tsx`, `src/features/transaction/reconvert-dialog.tsx` (find it with `grep -rl "ReconvertDialog" src/features`)
- Create: `src/lib/editor-footers.test.ts`

**Interfaces:**

- Consumes: `Button` variants `pill`, `pill-solid` (Task 2 marks them `data-variant`).
- Produces:
  - `EditorPanelBody(props: React.ComponentProps<'div'>)` — `data-slot="editor-panel-body"`, padding `px-5 lg:px-7` (20 / 28px), `pb-6`, `gap-4`.
  - `EditorPanelActions(props: React.ComponentProps<'div'>)` — `data-slot="editor-actions"`, the sticky foot, children side by side (each `flex-1` below lg, ≥ 150px at the inline end from lg).
  - `EditorPanelClose` — Base UI's `Dialog.Close`, for a Cancel pill.
  - `EditorPanelHeader` keeps its API; its padding is `px-5 pt-5 pb-4 lg:px-7 lg:pt-7`, the same inline padding as the body, and 16px under the title pair.
  - `PopOutBody`'s existing `footer` slot (`data-slot="popout-actions"`) holds Back (pill) and Next (solid pill), each ≥ 150px, at the inline end.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/ui/editor-panel.test.tsx`:

```tsx
it('lines the header and the body up on one padding, with room under the title', () => {
  renderWithProviders(
    <EditorPanel open>
      <EditorPanelContent aria-label="Edit">
        <EditorPanelHeader>
          <EditorPanelTitle>Edit</EditorPanelTitle>
        </EditorPanelHeader>
        <EditorPanelBody>
          <input aria-label="Name" />
          <EditorPanelActions>
            <Button variant="pill">Cancel</Button>
            <Button variant="pill-solid">Save</Button>
          </EditorPanelActions>
        </EditorPanelBody>
      </EditorPanelContent>
    </EditorPanel>,
  );
  const header = document.querySelector('[data-slot="editor-panel-header"]');
  const body = document.querySelector('[data-slot="editor-panel-body"]');
  expect(header?.className).toMatch(/\bpx-5\b.*\blg:px-7\b/);
  expect(body?.className).toMatch(/\bpx-5\b.*\blg:px-7\b/);
  expect(header?.className).toMatch(/\bpb-4\b/);
  expect(screen.getByRole('button', { name: 'Save' }).closest('[data-slot="editor-actions"]')).not.toBeNull();
});
```

Create `src/lib/editor-footers.test.ts` (a source check, as `fonts.test.ts` does):

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const EDITORS = [
  'features/transaction/transaction-sheet.tsx',
  'features/cards/method-editor.tsx',
  'features/profiles/profile-editor.tsx',
  'features/settings/categories-screen.tsx',
  'features/cash/count-sheet.tsx',
  'features/cash/move-sheet.tsx',
  'features/account/account-sheet.tsx',
  'features/summary/breakdown-sheet.tsx',
  'features/settings/business-types-sheet.tsx',
];

const source = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf8');

describe('every editor panel (§6.1, CAN WAIT 1 and 17)', () => {
  it.each(EDITORS)('%s lays its body on the panel padding', (file) => {
    expect(source(file)).toMatch(/EditorPanelBody|data-slot="editor-panel-body"/);
  });

  it.each(EDITORS.filter((f) => !f.includes('breakdown')))(
    '%s ends in pills, never in default buttons',
    (file) => {
      const text = source(file);
      expect(text).not.toMatch(/data-slot="editor-actions"/); // EditorPanelActions owns the slot
      expect(text).toMatch(/variant="pill-solid"/);
    },
  );
});
```

Run: `pnpm exec vitest run --project dom src/components/ui/editor-panel.test.tsx && pnpm exec vitest run --project unit src/lib/editor-footers.test.ts`
Expected: FAIL.

- [ ] **Step 2: The panel's parts**

In `src/components/ui/editor-panel.tsx`:

- `EditorPanelHeader`: change its class to `'sticky inset-bs-0 z-10 flex items-start gap-3 bg-card px-5 pt-5 pb-4 lg:px-7 lg:pt-7'`.
- `EditorPanelTitle`: `text-title-sheet` becomes `text-(length:--text-title-sheet)`; `EditorPanelDescription`: `text-sub-sheet` becomes `text-(length:--text-sub-sheet)` (CAN WAIT 10: `cn` drops a size utility it reads as a colour).
- Add, and export:

```tsx
/** The editor's fields, on the header's inline padding (20 / 28px), 16px apart. */
function EditorPanelBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="editor-panel-body"
      className={cn('flex flex-col gap-4 px-5 pb-6 lg:px-7', className)}
      {...props}
    />
  );
}

/** Cancel (a pill) and Save (the solid pill), held at the panel's foot; side by side at the inline end from lg. */
function EditorPanelActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="editor-actions" className={cn('flex gap-2 pt-1 [&>*]:flex-1', className)} {...props} />
  );
}

const EditorPanelClose = DialogPrimitive.Close;
```

- [ ] **Step 3: Every editor**

In each file below, the body wrapper becomes `EditorPanelBody` (or the `<form>` that is the body gets `data-slot="editor-panel-body"` and `className` with `px-5 lg:px-7` in place of `px-4`), and the action row becomes `EditorPanelActions` with a `pill` Cancel and a `pill-solid` Save. Remove `h-11`, `flex-1` and `className` sizes on those two buttons: the pills are 48px.

| File                                       | Body today                                                                              | Actions today                                                             | Becomes                                                                                                                                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transaction-sheet.tsx`                    | `<form className="space-y-4 px-4 pb-6">` (≈L984); the loading `div`s at ≈L324 and ≈L368 | `<div data-slot="editor-actions">` (≈L1426): outline Cancel, default Save | form gets `data-slot="editor-panel-body"`, `space-y-4 px-5 pb-6 lg:px-7`; `<EditorPanelActions><Button type="button" variant="pill" onClick={onCancel}>…</Button><Button type="submit" variant="pill-solid" disabled={…}>…</Button></EditorPanelActions>` |
| `method-editor.tsx`                        | its form wrapper                                                                        | `editor-actions` div (≈L575)                                              | the same pattern                                                                                                                                                                                                                                          |
| `profile-editor.tsx`                       | its form wrapper                                                                        | `editor-actions` div (≈L245)                                              | the same pattern                                                                                                                                                                                                                                          |
| `categories-screen.tsx` (`CategoryEditor`) | its form wrapper                                                                        | `editor-actions` div (≈L362)                                              | the same pattern                                                                                                                                                                                                                                          |
| `count-sheet.tsx`                          | `<form className="space-y-4 px-4 pb-6">` (≈L84)                                         | one full-width Save (≈L162)                                               | `EditorPanelActions` with `<EditorPanelClose render={<Button type="button" variant="pill" />}>{t('action.cancel')}</EditorPanelClose>` and the Save as `pill-solid`                                                                                       |
| `move-sheet.tsx`                           | `<form className="space-y-4 px-4 pb-6">` (≈L222)                                        | Save (≈L324) and its second button                                        | `EditorPanelActions`: the second button keeps its role as a `pill`, Save becomes `pill-solid`                                                                                                                                                             |
| `account-sheet.tsx`                        | `<div className="space-y-4 px-4 pb-6">` (≈L68)                                          | full-width submits (≈L386, L596, L644)                                    | `EditorPanelBody`; each submit `variant="pill-solid"` (`destructive` keeps its variant), in an `EditorPanelActions`                                                                                                                                       |
| `breakdown-sheet.tsx`                      | `<div className="px-4 pb-4">` (≈L55, L137)                                              | none                                                                      | `EditorPanelBody`                                                                                                                                                                                                                                         |
| `business-types-sheet.tsx`                 | `<div className="space-y-4 px-4 pb-6">` (≈L115)                                         | its outline full-width button (≈L175)                                     | `EditorPanelBody`; that button `variant="pill"`                                                                                                                                                                                                           |

Keep every label, handler, `disabled` rule and test id exactly as it is.

- [ ] **Step 4: Pop-out footers**

In `src/components/ui/pop-out.tsx`, `PopOutBody`'s footer wrapper (`data-slot="popout-actions"`) gets `'flex justify-end gap-2.5 [&>*]:min-w-37.5'` and the safe-area padding it already has.

In `split-purchase.tsx` (≈L153, L194) and the reconvert dialog: move their action buttons into `<PopOutBody footer={…}>` as `variant="pill"` (back or cancel) and `variant="pill-solid"` (the action), and drop the inner `px-4 pb-4` wrapper that doubled the body's padding (CAN WAIT 7). Smart import's footer moves in Task 21.

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run --project dom src/components/ui/editor-panel.test.tsx src/features/transaction src/features/cards src/features/cash src/features/profiles src/features/account src/features/settings src/features/summary && pnpm exec vitest run --project unit src/lib/editor-footers.test.ts`
Expected: PASS, every existing editor test included (they find buttons by name, which did not change).

- [ ] **Step 6: The gate, the harness, and commit**

Run: `pnpm verify` → exit 0. Run: `pnpm exec playwright test e2e/18-editor-panel.spec.ts e2e/19-popout.spec.ts --project=en` → pass.

Run: `pnpm fidelity --grep "@fid-panel-add"`
Expected: `panel-add-desktop` and `panel-add-phone` pass in both themes (480px, 56px radius, 28 / 20px on header and body alike, 48px pills, Save ≥ 150px, sapphire on the panel, nothing off the palette). The concept draws no panel, so show the user the run's `panel-add-*-light/app.png` and `-dark/app.png`; on their yes, run `FIDELITY_APPROVE=1 pnpm fidelity --grep "@fid-panel-add"` to keep those pictures as the goldens later runs are held to. Record the yes in the ledger.

```bash
git add src/components/ui/editor-panel.tsx src/components/ui/editor-panel.test.tsx src/components/ui/pop-out.tsx src/lib/editor-footers.test.ts src/features
git commit -m "Every editor ends in the concept's 48px Cancel and Save pills, with its header and its fields on one edge and room under the title" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: The rail, the top bar and the household

What the user sees around every screen: the concept's rail order and labels, the household's avatars at its foot, avatars in the house palette (audit D9), the greeting as the feed's title pair, the search pill and the month picker with 48px round arrows (spec §4.3's top bar, deferred in phase 2).

**Files:**

- Modify: `src/app/routes.ts`, `src/app/routes.test.tsx`, `src/app/app-shell.tsx`, `src/app/app-shell.test.tsx`, `src/app/screen-head.tsx`, `src/app/screen-head.test.tsx`
- Create: `src/app/top-bar.tsx`, `src/app/top-bar.test.tsx`
- Modify: `src/domain/palette.ts`, `src/domain/palette.test.ts` (create if absent)
- Modify: `src/components/person-avatar.tsx`, `src/components/person-avatar.test.tsx`
- Modify: `src/features/account/user-menu.tsx`, `src/features/account/user-menu.test.tsx`
- Modify: `src/features/summary/month-cursor.tsx` (a `tone="bold"`)
- Modify: `src/features/feed/feed-screen.tsx` (its `ScreenHead` call only), `src/features/feed/filter-bar.tsx` (its search field hidden from lg)
- Modify: `e2e/20-shell.spec.ts` (the rail's new order and labels)

**Interfaces:**

- Consumes (Task 2): `nav.overview`, `nav.cashBox`, `topbar.*`, `rail.pair`, `rail.many`.
- Produces:
  - `RAIL_PLACES` in the concept's order `feed, cards, bankAccounts, cash, chart`; `RailPlace` gains `readonly railLabel?: 'overview' | 'cashBox'`; new `PHONE_PLACES: readonly RailPlace[]` in `NAV_ORDER`; `navDirection(from, to, order?: readonly string[])`.
  - Each place link carries `data-slot="nav-place"`.
  - `type AvatarTone = 'ink' | 'sapphire' | 'ring'`; `avatarTone(color: string): AvatarTone`.
  - `PersonAvatar` gains the size `rail` (36px) and paints by tone (`data-avatar-tone`), never `person.color`.
  - `src/app/top-bar.tsx`: `greetingKey(hour: number): 'topbar.morning' | 'topbar.afternoon' | 'topbar.evening'`; `useGreetingName(): string | undefined`; `SearchPill({ value: string; onChange: (value: string) => void })` (`data-slot="search-pill"`).
  - `MonthCursor({ …, tone: 'bold' })` renders `data-slot="month-picker"` with two `Button variant="round"` arrows and the month in 600 in a ≥ 120px box.

- [ ] **Step 1: Write the failing tests**

`src/app/routes.test.tsx` — replace the order test with:

```tsx
it("lists the rail's places in the concept's order, and keeps the phone's four tabs as they are", () => {
  expect(RAIL_PLACES.map((place) => place.key)).toEqual(['feed', 'cards', 'bankAccounts', 'cash', 'chart']);
  expect(PHONE_PLACES.map((place) => place.key)).toEqual(NAV_ORDER);
  expect(RAIL_PLACES.find((p) => p.key === 'feed')?.railLabel).toBe('overview');
  expect(RAIL_PLACES.find((p) => p.key === 'cash')?.railLabel).toBe('cashBox');
});
```

and update the `navDirection` test's expectations to the rail's new order (Cards is now before Chart), adding one case for the phone order: `expect(navDirection('/chart', '/cards', PHONE_PLACES.map((p) => p.to))).toBe('forward')`.

`src/domain/palette.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { avatarTone, PROFILE_PALETTE } from './palette';

describe('avatarTone', () => {
  it('draws the first person on the ink box and the second on sapphire, as the concept does', () => {
    expect(avatarTone(PROFILE_PALETTE[0].hex)).toBe('ink');
    expect(avatarTone(PROFILE_PALETTE[1].hex)).toBe('sapphire');
    expect(avatarTone(PROFILE_PALETTE[2].hex)).toBe('ring');
    expect(avatarTone(PROFILE_PALETTE[3].hex)).toBe('ink');
  });
  it('gives a colour from outside the palette a stable tone', () => {
    expect(avatarTone('#123456')).toBe(avatarTone('#123456'));
    expect(['ink', 'sapphire', 'ring']).toContain(avatarTone('#123456'));
  });
});
```

`src/components/person-avatar.test.tsx` — add (and remove any assertion on `backgroundColor`):

```tsx
it('takes the house palette, never the stored colour', () => {
  renderWithProviders(<PersonAvatar person={{ id: 'p', name: 'Noa', color: '#0f766e' }} label="Noa" />);
  const avatar = screen.getByRole('img', { name: 'Noa' });
  expect(avatar).toHaveAttribute('data-avatar-tone', 'sapphire');
  expect(avatar.style.backgroundColor).toBe('');
});
```

`src/app/top-bar.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n } from '@/test/render';

import { greetingKey, SearchPill } from './top-bar';

beforeAll(async () => {
  await initTestI18n('he');
});

describe('the top bar', () => {
  it('greets by the time of day', () => {
    expect(greetingKey(9)).toBe('topbar.morning');
    expect(greetingKey(12)).toBe('topbar.afternoon');
    expect(greetingKey(18)).toBe('topbar.evening');
    expect(greetingKey(4)).toBe('topbar.evening');
  });

  it('searches from a 48px pill', () => {
    const onChange = vi.fn();
    render(<SearchPill value="" onChange={onChange} />);
    const field = screen.getByRole('searchbox', { name: 'חיפוש' });
    fireEvent.change(field, { target: { value: 'ארומה' } });
    expect(onChange).toHaveBeenCalledWith('ארומה');
    expect(field.closest('[data-slot="search-pill"]')?.className).toMatch(/min-h-12/);
  });
});
```

(`'חיפוש'` is `filter.search` in Hebrew; if it differs, use the value in `he/common.json`.)

`src/features/account/user-menu.test.tsx` — add:

```tsx
it("shows the household at the rail's foot: up to two faces and their names", async () => {
  // Seed two profiles in the test db as the file's other tests do, then:
  renderWithProviders(<UserMenu placement="rail" />);
  expect(await screen.findByText('Dana and Yossi')).toBeInTheDocument();
  expect(document.querySelectorAll('[data-avatar-tone]')).toHaveLength(2);
});
```

`src/app/app-shell.test.tsx` — add: every place link has `data-slot="nav-place"`; the rail's first place reads "Overview" and the fourth "Cash box"; the phone tab list (the one `lg:hidden`) reads Feed, Chart, Cards, Cash.

Run: `pnpm exec vitest run --project dom src/app src/components/person-avatar.test.tsx src/features/account && pnpm exec vitest run --project unit src/domain/palette.test.ts`
Expected: FAIL.

- [ ] **Step 2: The places**

In `src/app/routes.ts`:

```ts
export type RailPlace = {
  readonly key:
    'feed' | 'chart' | 'cards' | 'bankAccounts' | 'cash' | 'categories' | 'commitments' | 'settings';
  readonly to: string;
  readonly phone: boolean;
  /** The rail's own word where the concept's differs from the tab's: Overview (the feed), Cash box. */
  readonly railLabel?: 'overview' | 'cashBox';
};

/**
 * The rail's places in the concept's order (phase 3 plan, decision 1): the
 * feed as the overview, the money places, then the chart. The phone keeps its
 * four tabs in NAV_ORDER (PHONE_PLACES); the rail lists places only, Add is a
 * button at its top (decision 28).
 */
export const RAIL_PLACES: readonly RailPlace[] = [
  { key: 'feed', to: ROUTES.feed, phone: true, railLabel: 'overview' },
  { key: 'cards', to: ROUTES.cards, phone: true },
  { key: 'bankAccounts', to: LINKED_ROUTES.bankAccounts, phone: false },
  { key: 'cash', to: ROUTES.cash, phone: true, railLabel: 'cashBox' },
  { key: 'chart', to: ROUTES.chart, phone: true },
];

/** The phone's four tabs, in their own order (decision 27). */
export const PHONE_PLACES: readonly RailPlace[] = NAV_ORDER.map((key) => {
  const place = RAIL_PLACES.find((p) => p.key === key);
  if (place === undefined) throw new Error(`no place ${key}`);
  return place;
});
```

and give `navDirection` a third parameter `order: readonly string[] = [...RAIL_PLACES, ...RAIL_SETUP].map((place) => place.to)`, using it in place of the local `order`.

- [ ] **Step 3: The shell**

In `src/app/app-shell.tsx`:

- `Place` takes `label: string` and renders `data-slot="nav-place"` on the `NavLink`; the rail uses `t(\`nav.${place.railLabel ?? place.key}\`)`, the tabs `t(\`nav.${place.key}\`)`; its `onClick`passes the order it belongs to into`navDirection`.
- `PrimaryNav` renders the phone tabs and the rail's places as two lists inside the one `<nav>`, so each is in the order a person reads it and only one is ever displayed:

```tsx
{
  /* The phone's four tabs, in their order. Hidden from lg, so a screen reader meets one list at a time. */
}
<div className="contents lg:hidden">
  {PHONE_PLACES.map((place) => (
    <Place
      key={place.key}
      place={place}
      label={t(`nav.${place.key}`)}
      order={PHONE_ORDER}
      reduced={reduced}
    />
  ))}
</div>;
{
  /* The rail's places, in the concept's order. */
}
<div className="hidden lg:contents">
  {RAIL_PLACES.map((place) => (
    <Place
      key={place.key}
      place={place}
      label={t(`nav.${place.railLabel ?? place.key}`)}
      order={RAIL_ORDER}
      reduced={reduced}
      count={place.key === 'cards' || place.key === 'bankAccounts' ? counts[place.key] : undefined}
    />
  ))}
</div>;
```

with `const PHONE_ORDER = PHONE_PLACES.map((p) => p.to); const RAIL_ORDER = [...RAIL_PLACES, ...RAIL_SETUP].map((p) => p.to);` at module level, and the `RAIL_SETUP` places after the line as today. `Place` drops its own `!place.phone && 'hidden lg:flex'` rule (the wrappers decide).

- [ ] **Step 4: Avatars in the house palette, and the household at the rail's foot**

In `src/domain/palette.ts` add:

```ts
export type AvatarTone = 'ink' | 'sapphire' | 'ring';
const TONES: readonly AvatarTone[] = ['ink', 'sapphire', 'ring'];

/**
 * How a person is drawn (phase 3 plan, decision 7): the house palette, as the
 * concept draws its avatars - the first person on the ink box, the second on
 * sapphire, the third as an ink ring on paper, repeating. Read from the stored
 * colour's place in the palette, which follows the order people were added;
 * the stored colour itself is no longer painted and is never changed.
 */
export function avatarTone(color: string): AvatarTone {
  const index = PROFILE_PALETTE.findIndex((c) => c.hex.toLowerCase() === color.toLowerCase());
  const at = index >= 0 ? index : [...color].reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) % 9973, 7);
  return TONES[at % TONES.length] ?? 'ink';
}
```

In `src/components/person-avatar.tsx`: add `rail: 36` to `PERSON_SIZES`; drop `backgroundColor: person.color` and `text-white`; add `data-avatar-tone={tone}` and the tone's classes:

```tsx
const TONE_CLASS: Record<AvatarTone, string> = {
  ink: 'bg-box text-box-text',
  sapphire: 'bg-primary text-primary-foreground',
  ring: 'bg-background text-foreground shadow-[inset_0_0_0_2px_currentColor]',
};
```

In `src/features/account/user-menu.tsx`, for `placement === 'rail'`, the trigger shows the household instead of the account's own picture and name:

```tsx
function Household() {
  const { t } = useTranslation();
  const people = useLiveQuery(
    async () =>
      (await db.profiles.toArray()).sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      ),
    [],
  );
  if (people === undefined || people.length === 0) return null;
  const [first, second] = people;
  const names =
    people.length === 1
      ? first?.name
      : people.length === 2
        ? t('rail.pair', { first: first?.name, second: second?.name })
        : t('rail.many', { first: first?.name, count: people.length - 1 });
  return (
    <>
      <span className="flex shrink-0">
        {people.slice(0, 2).map((person, i) => (
          <PersonAvatar
            key={person.id}
            person={person}
            size="rail"
            className={cn('ring-2 ring-background', i > 0 && '-ms-2.5')}
          />
        ))}
      </span>
      <span className="min-w-0 truncate">{names}</span>
    </>
  );
}
```

and in the trigger: `placement === 'rail' ? <><span className="sr-only">{t('menu.label')}</span><Household /></> : <AccountAvatar … />`. The menu's content is unchanged.

- [ ] **Step 5: The top bar's parts**

Create `src/app/top-bar.tsx`:

```tsx
import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { db } from '@/db/db';
import { ALL_PROFILES } from '@/types/domain';

import { useSettings } from './app-context';

/** Good morning before noon, good afternoon until six, good evening after (and before dawn). */
export function greetingKey(hour: number): 'topbar.morning' | 'topbar.afternoon' | 'topbar.evening' {
  if (hour >= 5 && hour < 12) return 'topbar.morning';
  if (hour >= 12 && hour < 18) return 'topbar.afternoon';
  return 'topbar.evening';
}

/** Who the greeting is for: the person in view, else the household's first person. */
export function useGreetingName(): string | undefined {
  const active = useSettings().activeProfileId;
  return useLiveQuery(async () => {
    const people = (await db.profiles.toArray()).sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
    return (active === ALL_PROFILES ? people[0] : people.find((p) => p.id === active))?.name;
  }, [active]);
}

/** The feed's search as the concept's 48px pill: a 2px line, a 20px icon, the hint in 300. */
export function SearchPill({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <label
      data-slot="search-pill"
      className={cn(
        'flex min-h-12 min-w-70 items-center gap-2.5 rounded-full border-2 border-border px-4.5 text-muted-foreground',
        'has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-3 has-[input:focus-visible]:outline-ring',
      )}
    >
      <Search className="size-5 shrink-0" aria-hidden="true" />
      <input
        type="search"
        value={value}
        aria-label={t('filter.search')}
        placeholder={t('topbar.search')}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="min-w-0 flex-1 bg-transparent text-base font-light text-foreground outline-transparent placeholder:text-muted-foreground"
      />
    </label>
  );
}
```

In `src/features/summary/month-cursor.tsx`, add `'bold'` to `tone`: two `Button variant="round"` arrows (an arrow icon drawn for LTR, `rtl:-scale-x-100`; labels `t('topbar.prevMonth')` / `t('topbar.nextMonth')`), and between them the month in weight 600 in a `min-w-30 text-center` box that keeps the existing picker (`onPick`) behaviour; the wrapper is `data-slot="month-picker" className="flex items-center gap-2"`. The horizon rule (`atHorizon` disables "next") is unchanged.

- [ ] **Step 5b: The phone head's pill is 44px**

In `src/app/screen-head.tsx`, the actions wrapper becomes `className="flex flex-wrap items-center gap-2 max-lg:[&_[data-variant^=pill]]:min-h-11 max-lg:[&_[data-variant^=pill]]:px-4 max-lg:[&_[data-variant^=pill]]:text-[0.9375rem]"` (§9.6: 48px pills, 44px in the phone's screen head, as the concept's "+ כרטיס"). Add to `src/app/screen-head.test.tsx`: a `pill-solid` passed as `actions` sits in a wrapper whose class contains `max-lg:[&_[data-variant^=pill]]:min-h-11`.

- [ ] **Step 6: The feed wears the top bar**

In `src/features/feed/feed-screen.tsx`, replace `<ScreenHead title={t('nav.feed')} />` with:

```tsx
<ScreenHead
  // The phone's head is the screen's name in Karantina; the desktop's top bar greets (decision 2).
  title={desktop ? t(greetingKey(new Date().getHours()), { name: greetingName ?? '' }) : t('nav.feed')}
  subtitle={
    desktop
      ? formatLocalDate(today, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
      : undefined
  }
  actions={
    desktop ? (
      <>
        <SearchPill
          value={filters.query}
          onChange={(query) => {
            set({ query });
          }}
        />
        <MonthCursor month={filters.month} today={today} onStep={stepMonth} onPick={setMonth} tone="bold" />
      </>
    ) : undefined
  }
/>
```

with `const desktop = useDesktop();` and `const greetingName = useGreetingName();` among the hooks (imports from `@/app/use-desktop` and `@/app/top-bar`). `new Date()` is the frozen clock under test; the greeting changes at most three times a day, which is why it is not a hook.

In `src/features/feed/filter-bar.tsx`, the search field's wrapper (`<div className="relative min-w-0 flex-1">`) gains `lg:hidden`: from lg the top bar's pill is the search, bound to the same `q` in the URL, and only one search box is ever shown.

- [ ] **Step 6b: The shell's browser test**

In `e2e/20-shell.spec.ts`, the desktop places become, in order: English `Overview, Cards, Bank accounts, Cash box, Chart, Categories, Commitments, Settings`; Hebrew `סקירה, כרטיסים, חשבונות בנק, קופת מזומן, תרשים, קטגוריות, התחייבויות, הגדרות`. The phone tabs and every other assertion stay.

- [ ] **Step 7: Run the tests**

Run: `pnpm exec vitest run --project dom src/app src/components src/features/account src/features/summary && pnpm exec vitest run --project unit src/domain/palette.test.ts`
Expected: PASS.

Run: `pnpm exec playwright test e2e/20-shell.spec.ts e2e/00-shell.spec.ts --project=en`
Expected: PASS.

- [ ] **Step 8: The gate, the harness, and commit**

Run: `pnpm verify` → exit 0.

Run: `pnpm fidelity --grep "@fid-shell-desktop"`
Expected: pass in both themes: the rail 256px, nav items 48px, the title 38px, the search pill 48px tall and at least 280px wide, the round arrows 48px.

```bash
git add src/app src/domain/palette.ts src/domain/palette.test.ts src/components/person-avatar.tsx src/components/person-avatar.test.tsx src/features/account src/features/summary/month-cursor.tsx src/features/feed/feed-screen.tsx src/features/feed/filter-bar.tsx e2e/20-shell.spec.ts
git commit -m "The rail follows the concept's order and words with the household at its foot, people are drawn in the house colours, and the top bar's greeting, search pill and round month arrows are ready" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 3a: the feed, desktop board first

## Task 7: The feed board and the balance sheet

The first thing the user sees: the 12-column board filling `main`, and the full-width ink balance sheet with its 252px balance bleeding off the foot and the five account sheets fanned down its side. This task also lays the board's other four cells as minimal sheets (one file each), so Tasks 8–11 each replace one file in parallel.

**Files:**

- Create: `src/domain/month-bills.ts`, `src/domain/month-bills.test.ts`
- Create: `src/features/cards/use-month-bills.ts`, `src/features/cards/issuer-label.ts`
- Create: `src/features/feed/board/feed-board.tsx`, `balance-sheet.tsx`, `account-sheets.tsx`, `month-sheet.tsx`, `categories-sheet.tsx`, `transactions-sheet.tsx`, `wallet-column.tsx`, `board.test.tsx`
- Modify: `src/features/summary/summary-cards.tsx` (a `BalanceNumeral`), `src/features/summary/summary.test.tsx`
- Modify: `src/features/feed/feed-screen.tsx`

**Interfaces:**

- Consumes: Task 3 `Sheet`, `SheetHead`; Task 4 `Numeral` (`fit`), `Mark`; Task 6 the feed's top bar; existing `useBalance`, `useIncoming` (`src/features/bank-accounts/use-incoming.ts`), `useCashData`, `useCardsData`, `cardBills`, `billingDayOf`, `methodKey`, `bankByCode`, `bankName`, `methodOwnedBy` (`src/domain/tx-options.ts`), `BalancePopover`, `useCountUp`.
- Produces (the props Tasks 8–12 rely on; their files keep these signatures):
  - `src/domain/month-bills.ts`: `type MonthBill = { card: PaymentMethod; chargeDate: LocalDate; totalMinor: Minor }`; `type ChargeDay = { date: LocalDate; bills: readonly MonthBill[]; totalMinor: Minor; charged: boolean }`; `type MonthBills = { days: readonly ChargeDay[]; totalMinor: Minor; upcomingMinor: Minor; lastDate: LocalDate | undefined; byCard: ReadonlyMap<string, MonthBill> }`; `monthBills(cards, occurrences, today): MonthBills`; `settledThisMonth(occurrences, methods, today, bills): Minor`.
  - `useMonthBills(today: LocalDate, currency: Currency, profileId: string): MonthBills | undefined`.
  - `issuerLabel(card: PaymentMethod, t: TFunction<'cards'>): string` — the company's name as the concept writes it on a chip or a card sheet ("ישראכרט", "מקס"), the card's own label for an `other` issuer or none.
  - `FeedBoard({ balance, month, categories, transactions, wallet }: Record<…, ReactNode>)` — `data-slot="board"`.
  - `BalanceSheet({ title, subtitle, lede, figure, accounts, actions? })` — `data-slot="balance-sheet"`.
  - `AccountSheets({ items: readonly AccountItem[] })` with `type AccountItem = { id: string; moneyKey: MoneyKey; name: string; label: string; figure?: Minor }` and a `currency` prop — `data-slot="account-sheets"`, each `data-slot="account-sheet"`.
  - `BalanceNumeral({ state, currency, breakdown?, onFullBreakdown? })` (keeps `data-testid="balance-amount"` and the `balance-announced` live region).
  - `MonthSheet(props: MonthSheetProps)`, `CategoriesSheet(props: CategoriesSheetProps)`, `TransactionsSheet(props: TransactionsSheetProps)`, `WalletColumn(props: WalletColumnProps)` — types exported from their files, as written in Step 5.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/month-bills.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { d, MONEY } from './test-factories';
import { monthBills, settledThisMonth } from './month-bills';
import type { Occurrence, PaymentMethod } from '@/types/domain';

const card = (id: string, billingDay: number): PaymentMethod =>
  ({
    id,
    profileId: 'p',
    type: 'credit_card',
    label: id,
    card: { issuer: 'max', billingDay },
    isArchived: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }) as PaymentMethod;

const spend = (
  methodId: string | undefined,
  date: string,
  minor: number,
  kind: 'expense' | 'income' = 'expense',
) =>
  ({
    key: `${methodId ?? 'bank'}:${date}:${String(minor)}`,
    date: d(date),
    originalDate: d(date),
    paymentMethodId: methodId,
    isSkipped: false,
    isProjected: false,
    categoryId: 'cat.groceries',
    money: { ...MONEY, amountMinor: minor, baseAmountMinor: minor },
    transaction: { kind, recurrence: { type: 'one_time' } },
  }) as unknown as Occurrence;

const TODAY = d('2026-10-09');
const isracard = card('isracard', 2);
const max = card('max', 10);
const cal = card('cal', 15);

describe('monthBills', () => {
  const bills = monthBills(
    [isracard, max, cal],
    [
      spend('isracard', '2026-09-12', 321_400),
      spend('max', '2026-09-14', 214_000),
      spend('cal', '2026-09-25', 187_600),
      spend('max', '2026-10-03', 9_999),
    ],
    TODAY,
  );

  it("groups this month's bills by their day, in order, and says which are charged", () => {
    expect(bills.days.map((day) => [day.date, day.totalMinor, day.charged])).toEqual([
      ['2026-10-02', 321_400, true],
      ['2026-10-10', 214_000, false],
      ['2026-10-15', 187_600, false],
    ]);
  });

  it('sums the month, what is still to come, and when the last one falls', () => {
    expect(bills.totalMinor).toBe(723_000);
    expect(bills.upcomingMinor).toBe(401_600);
    expect(bills.lastDate).toBe('2026-10-15');
    expect(bills.byCard.get('max')?.totalMinor).toBe(214_000);
  });

  it('has nothing for a month with no bills', () => {
    expect(monthBills([], [], TODAY)).toMatchObject({
      days: [],
      totalMinor: 0,
      upcomingMinor: 0,
      lastDate: undefined,
    });
  });
});

describe('settledThisMonth', () => {
  it('counts income and bank-paid spending to today, and the bills already charged, never a card purchase', () => {
    const methods = new Map([[isracard.id, isracard]]);
    const occurrences = [
      spend(undefined, '2026-10-01', 2_390_000, 'income'),
      spend(undefined, '2026-10-07', 41_200),
      spend('isracard', '2026-10-09', 41_260),
      spend(undefined, '2026-10-20', 99_999, 'income'),
    ];
    const bills = monthBills([isracard], [spend('isracard', '2026-09-12', 423_700)], TODAY);
    expect(settledThisMonth(occurrences, methods, TODAY, bills)).toBe(2_390_000 - 41_200 - 423_700);
  });
});
```

(Use the factories `src/domain/test-factories.ts` already exports; if `MONEY` is named differently there, use that name.)

Create `src/features/feed/board/board.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { AccountSheets } from './account-sheets';
import { BalanceSheet } from './balance-sheet';
import { FeedBoard } from './feed-board';

describe('the feed board', () => {
  it('is twelve columns from @board, in the order a phone reads it', () => {
    renderWithProviders(
      <FeedBoard
        balance={<p>b</p>}
        month={<p>m</p>}
        categories={<p>c</p>}
        transactions={<p>t</p>}
        wallet={<p>w</p>}
      />,
    );
    const board = document.querySelector('[data-slot="board"]');
    expect(board?.className).toMatch(/@board\/main:grid-cols-12/);
    expect([...(board?.children ?? [])].map((cell) => cell.textContent)).toEqual(['b', 'm', 'c', 't', 'w']);
  });

  it('keeps the numeral at the foot of the balance sheet in one column, and beside the accounts from @wide', () => {
    renderWithProviders(
      <BalanceSheet title="All" subtitle="today" lede="l" figure={<span>fig</span>} accounts={<ul>a</ul>} />,
    );
    const sheet = document.querySelector('[data-slot="balance-sheet"]');
    expect(sheet).toHaveAttribute('data-sheet', 'night');
    expect(sheet?.className).toMatch(/grid-template-areas:'head'_'accounts'_'figure'/);
    expect(sheet?.className).toMatch(/@wide\/main:\[grid-template-areas:'head_accounts'_'figure_accounts'\]/);
  });

  it('fans the account sheets, each in its bank colour, and shows an account with nothing coming without a figure', () => {
    renderWithProviders(
      <AccountSheets
        currency="ILS"
        items={[
          { id: 'a', moneyKey: 'bank-12', name: 'הפועלים', label: 'החשבון של דניאל', figure: 1_375_000 },
          { id: 'b', moneyKey: 'bank-10', name: 'לאומי', label: 'עו״ש משותף' },
        ]}
      />,
    );
    const sheets = document.querySelectorAll('[data-slot="account-sheet"]');
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toHaveAttribute('data-money', 'bank-12');
    expect(sheets[0]?.className).toMatch(/odd:-rotate-\[1\.2deg\]/);
    expect(sheets[0]?.querySelector('[data-numeral-size="account"]')).not.toBeNull();
    expect(sheets[1]?.querySelector('[data-numeral]')).toBeNull();
    expect(screen.getByText('לאומי')).toBeInTheDocument();
  });
});
```

Add to `src/features/summary/summary.test.tsx` (beside the `BalanceFigure` tests):

```tsx
it('draws the balance as the huge numeral, whole shekels, and says the exact amount', () => {
  renderWithProviders(
    <BalanceNumeral
      state={{
        status: 'ready',
        minor: 16_557_408,
        since: d('2026-01-01'),
        profiles: [],
        parts: { openingMinor: 0, incomeMinor: 0, expenseMinor: 0 },
      }}
      currency="ILS"
    />,
  );
  const numeral = document.querySelector('[data-testid="balance-amount"] [data-numeral]');
  expect(numeral).toHaveAttribute('data-numeral-size', 'balance');
  expect(numeral?.textContent).not.toMatch(/\.\d\d/); // never agorot in Karantina (decision 20)
  expect(screen.getByTestId('balance-announced')).toHaveTextContent(/165,574\.08/);
});

it('draws a negative balance with its minus, and sizes a huge one by its real width (Review Focus 2)', () => {
  const ready = (minor: number) =>
    ({
      status: 'ready',
      minor,
      since: d('2026-01-01'),
      profiles: [],
      parts: { openingMinor: 0, incomeMinor: 0, expenseMinor: 0 },
    }) as const;
  const { unmount } = renderWithProviders(<BalanceNumeral state={ready(-2_440_000)} currency="ILS" />);
  expect(document.querySelector('[data-numeral]')?.textContent?.startsWith('−')).toBe(true);
  unmount();
  renderWithProviders(<BalanceNumeral state={ready(1_234_567_800)} currency="ILS" />);
  const units = Number(
    document.querySelector<HTMLElement>('[data-numeral]')?.style.getPropertyValue('--numeral-units'),
  );
  expect(units).toBeGreaterThan(2096); // ₪12,345,678 is wider than ₪58,555, so it is drawn smaller, never cut
});

it("keeps the numeral's box while the balance loads, so nothing jumps", () => {
  renderWithProviders(<BalanceNumeral state={{ status: 'loading' }} currency="ILS" />);
  expect(document.querySelector('[data-testid="balance-amount"]')).toHaveAttribute('aria-busy', 'true');
  expect(document.querySelector('[data-testid="balance-amount"] [data-numeral]')).not.toBeNull();
});
```

Run: `pnpm exec vitest run --project unit src/domain/month-bills.test.ts && pnpm exec vitest run --project dom src/features/feed/board src/features/summary/summary.test.tsx`
Expected: FAIL.

- [ ] **Step 2: This month's bills**

Create `src/domain/month-bills.ts`:

```ts
import { compareLocal, startOfMonth } from '@/lib/dates';
import { sum } from '@/lib/money';
import type { Occurrence, PaymentMethod } from '@/types/domain';
import type { LocalDate, Minor } from '@/types/money';

import { billingDayOf, cardBills } from './cards';

export type MonthBill = {
  readonly card: PaymentMethod;
  readonly chargeDate: LocalDate;
  readonly totalMinor: Minor;
};
export type ChargeDay = {
  readonly date: LocalDate;
  readonly bills: readonly MonthBill[];
  readonly totalMinor: Minor;
  /** On or before today: the money has left the bank. */
  readonly charged: boolean;
};
export type MonthBills = {
  readonly days: readonly ChargeDay[];
  readonly totalMinor: Minor;
  readonly upcomingMinor: Minor;
  readonly lastDate: LocalDate | undefined;
  readonly byCard: ReadonlyMap<string, MonthBill>;
};

/**
 * The card bills charged in today's calendar month, by day (§5.1's month
 * sheet, the wallet, Cards' summary): one source, so the lede, the month
 * sheet, the wallet and Cards never disagree. A card's bill this month is the
 * one `cardBills` dates in this month (last month's purchases).
 */
export function monthBills(
  cards: readonly PaymentMethod[],
  occurrences: readonly Occurrence[],
  today: LocalDate,
): MonthBills {
  const month = startOfMonth(today);
  const bills: MonthBill[] = [];
  for (const card of cards) {
    if (billingDayOf(card) === undefined) continue;
    const bill = cardBills(occurrences, card).find((b) => startOfMonth(b.chargeDate) === month);
    if (bill !== undefined && bill.totalMinor > 0) {
      bills.push({ card, chargeDate: bill.chargeDate, totalMinor: bill.totalMinor });
    }
  }
  const byDate = new Map<LocalDate, MonthBill[]>();
  for (const bill of bills) byDate.set(bill.chargeDate, [...(byDate.get(bill.chargeDate) ?? []), bill]);
  const days = [...byDate.entries()]
    .sort(([a], [b]) => compareLocal(a, b))
    .map(([date, list]) => ({
      date,
      bills: list,
      totalMinor: sum(list.map((b) => b.totalMinor)),
      charged: compareLocal(date, today) <= 0,
    }));
  return {
    days,
    totalMinor: sum(days.map((day) => day.totalMinor)),
    upcomingMinor: sum(days.filter((day) => !day.charged).map((day) => day.totalMinor)),
    lastDate: days.at(-1)?.date,
    byCard: new Map(bills.map((bill) => [bill.card.id, bill])),
  };
}

/**
 * How much the household's money moved since the month began (the balance
 * sheet's lede): income and bank-paid spending up to today, less the card
 * bills already charged. A card purchase counts on its bill, never twice.
 */
export function settledThisMonth(
  occurrences: readonly Occurrence[],
  methods: ReadonlyMap<string, PaymentMethod>,
  today: LocalDate,
  bills: MonthBills,
): Minor {
  let net = 0;
  for (const o of occurrences) {
    if (o.isProjected || o.isSkipped || compareLocal(o.date, today) > 0) continue;
    if (o.transaction.kind === 'income') net += o.money.baseAmountMinor;
    else if (billingDayOf(methods.get(o.paymentMethodId ?? '')) === undefined) net -= o.money.baseAmountMinor;
  }
  return net - sum(bills.days.filter((day) => day.charged).map((day) => day.totalMinor));
}
```

Create `src/features/cards/use-month-bills.ts`:

```ts
import { useMemo } from 'react';

import { monthBills, type MonthBills } from '@/domain/month-bills';
import { methodOwnedBy } from '@/domain/tx-options';
import { ALL_PROFILES } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

import { useCardsData } from './use-cards-data';

/** This month's card bills for the person in view (or everyone), live. */
export function useMonthBills(
  today: LocalDate,
  currency: Currency,
  profileId: string,
): MonthBills | undefined {
  const data = useCardsData(today, currency);
  return useMemo(() => {
    if (data === undefined) return undefined;
    const mine = [...data.cards, ...data.owing].filter(
      (card) => profileId === ALL_PROFILES || methodOwnedBy(card, profileId),
    );
    return monthBills(mine, data.occurrences, today);
  }, [data, today, profileId]);
}
```

(Check `methodOwnedBy`'s signature in `src/domain/tx-options.ts`; pass what `cards-screen.tsx` passes.)

Create `src/features/cards/issuer-label.ts`:

```ts
import type { TFunction } from 'i18next';

import type { PaymentMethod } from '@/types/domain';

/** A card's company as the concept writes it on a chip or a sheet; the card's own label when there is none. */
export function issuerLabel(card: PaymentMethod, t: TFunction<'cards'>): string {
  const issuer = card.card?.issuer;
  return issuer === undefined || issuer === 'other' ? card.label : t(`issuer.${issuer}`);
}
```

- [ ] **Step 3: The board and the balance sheet**

Create `src/features/feed/board/feed-board.tsx`:

```tsx
import type { ReactNode } from 'react';

/**
 * The feed as the concept's board (§5.1, decision 26). From @board: twelve
 * columns of `main`, 16px apart - balance 12; month 5 + categories 7 (4 + 8
 * from @wide), stretched so they end together; transactions 7 + wallet 5,
 * the wallet sticky below the collapsed bar. Below @board: one column, 8px
 * apart, in the same order. Cells, not the sheets, take the spans, so each
 * sheet stays one component.
 */
export function FeedBoard({
  balance,
  month,
  categories,
  transactions,
  wallet,
}: {
  readonly balance: ReactNode;
  readonly month: ReactNode;
  readonly categories: ReactNode;
  readonly transactions: ReactNode;
  readonly wallet: ReactNode;
}) {
  return (
    <div
      data-slot="board"
      className="grid grid-cols-1 gap-sheet @board/main:grid-cols-12 @board/main:items-start"
    >
      <div className="min-w-0 @board/main:col-span-12">{balance}</div>
      <div className="grid min-w-0 @board/main:col-span-5 @board/main:self-stretch @wide/main:col-span-4">
        {month}
      </div>
      <div className="grid min-w-0 @board/main:col-span-7 @board/main:self-stretch @wide/main:col-span-8">
        {categories}
      </div>
      <div className="min-w-0 @board/main:col-span-7">{transactions}</div>
      <div className="@board/main:inset-bs-[calc(var(--feed-sticky-top,0px)+var(--gap-sheet))] min-w-0 @board/main:sticky @board/main:col-span-5">
        {wallet}
      </div>
    </div>
  );
}
```

Create `src/features/feed/board/balance-sheet.tsx`:

```tsx
import type { ReactNode } from 'react';

import { Sheet, SheetHead } from '@/components/ui/sheet-surface';

/**
 * The household's money (§5.1): the ink sheet across the board. Its text
 * column holds the title pair, the lede with its key figures in boxes, and the
 * balance as the huge numeral running off the foot; the account sheets fan
 * down the other side and run off it too. In one column (below @wide) the
 * accounts sit between the lede and the numeral, so the numeral is still the
 * sheet's last thing and bleeds where the rule says (§9.4).
 */
export function BalanceSheet({
  title,
  subtitle,
  lede,
  figure,
  accounts,
  actions,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly lede: ReactNode;
  readonly figure: ReactNode;
  readonly accounts: ReactNode;
  /** The person in view and the prime rate: kept from the old hero, at the head's inline end. */
  readonly actions?: ReactNode;
}) {
  return (
    <Sheet
      kind="night"
      bleed
      data-slot="balance-sheet"
      className={
        "grid gap-x-10 gap-y-3.5 [grid-template-areas:'head'_'accounts'_'figure'] " +
        '@wide/main:min-h-105 @wide/main:grid-cols-[minmax(0,1fr)_27.5rem] @wide/main:grid-rows-[auto_1fr] ' +
        "@wide/main:[grid-template-areas:'head_accounts'_'figure_accounts'] @vast/main:grid-cols-[minmax(0,1fr)_32.5rem]"
      }
    >
      <div className="flex min-w-0 flex-col gap-3.5 [grid-area:head]">
        <SheetHead size="hero" title={title} subtitle={subtitle} action={actions} />
        <p className="text-lede max-w-[38ch] leading-[1.75] font-light">{lede}</p>
      </div>
      <div className="-ms-1.5 min-w-0 self-end [grid-area:figure]">{figure}</div>
      <div className="@wide/main:-mbe-3.5 min-w-0 self-end [grid-area:accounts]">{accounts}</div>
    </Sheet>
  );
}
```

Create `src/features/feed/board/account-sheets.tsx`:

```tsx
import { Numeral } from '@/components/ui/numeral';
import { Sheet } from '@/components/ui/sheet-surface';
import type { MoneyKey } from '@/domain/money-key';
import type { Currency, Minor } from '@/types/money';

export type AccountItem = {
  readonly id: string;
  readonly moneyKey: MoneyKey;
  /** The bank's name, 600. */
  readonly name: string;
  /** The account's own name and what is next, 300. */
  readonly label: string;
  /** Its 52px figure (no bleed): the next money in, or the cash on hand. */
  readonly figure?: Minor;
};

/**
 * The accounts as small sheets in their banks' colours, tilted like a
 * stack of cards (§9.1: odd −1.2°, even +1° and 18px toward the inline end),
 * with a 2px foot shadow. Decorative tilt only: each is a list item a screen
 * reader reads straight.
 */
export function AccountSheets({
  items,
  currency,
}: {
  readonly items: readonly AccountItem[];
  readonly currency: Currency;
}) {
  return (
    <ul data-slot="account-sheets" role="list" className="pbs-1 grid content-end gap-2.5">
      {items.map((item) => (
        <Sheet
          key={item.id}
          as="li"
          kind="money"
          moneyKey={item.moneyKey}
          radius="row"
          data-slot="account-sheet"
          className={
            'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5.5 py-3 ' +
            'shadow-[0_2px_0_color-mix(in_oklch,var(--box)_25%,transparent)] ' +
            'last:pb-6.5 odd:-rotate-[1.2deg] even:ms-4.5 even:rotate-1'
          }
        >
          <div className="min-w-0">
            <span className="block text-lg leading-[1.2] font-semibold">{item.name}</span>
            <span className="block text-[0.9375rem] font-light">{item.label}</span>
          </div>
          {item.figure === undefined ? null : (
            <Numeral minor={item.figure} currency={currency} size="account" rounded />
          )}
        </Sheet>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: The balance as the numeral**

In `src/features/summary/summary-cards.tsx`, add (and export) `BalanceNumeral`, leaving `BalanceFigure` for any other caller until nothing uses it (delete it then; `knip` will say):

```tsx
/**
 * The balance as the huge numeral (§5.1, §9.4): whole shekels in Karantina,
 * running off the balance sheet's foot; the exact amount, agorot and all, in
 * the numeral's spoken twin and in the one live region. Sized for the settled
 * figure while it counts up, so it never jitters. Its breakdown opens from it.
 */
export function BalanceNumeral({
  state,
  currency,
  breakdown,
  onFullBreakdown,
}: {
  readonly state: BalanceState;
  readonly currency: Currency;
  readonly breakdown?: BalanceBreakdown;
  readonly onFullBreakdown?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const target = state.status === 'ready' ? state.minor : 0;
  const animated = useCountUp(target);
  const title = t('summary.balance');

  if (state.status === 'loading') {
    // The numeral's own box, invisible: the sheet keeps its height while IndexedDB answers.
    return (
      <span data-testid="balance-amount" aria-busy="true" className="invisible block">
        <Numeral minor={0} currency={currency} size="balance" rounded />
      </span>
    );
  }
  if (state.status === 'blocked') {
    return (
      <p className="text-lede font-light">
        {t('summary.balanceBlocked', { currencies: state.currencies.join(', ') })}
      </p>
    );
  }

  const settled = formatMoney(state.minor, currency, { locale: i18n.language });
  const figure = (
    <span data-testid="balance-amount" className="block">
      <Numeral minor={animated} fit={state.minor} currency={currency} size="balance" rounded />
    </span>
  );
  return (
    <>
      {breakdown === undefined || onFullBreakdown === undefined ? (
        figure
      ) : (
        <BalancePopover
          breakdown={breakdown}
          since={state.since}
          currency={currency}
          onFullBreakdown={onFullBreakdown}
          triggerClassName="block w-full rounded-[0.5rem] text-start focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-current"
          triggerLabel={t('summary.breakdownOf', { title })}
        >
          {figure}
        </BalancePopover>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="balance-announced">
        {title}: {settled.aria}
      </p>
    </>
  );
}
```

(Import `Numeral` from `@/components/ui/numeral`. The "since" date the old figure printed is in the breakdown pop-out, which already receives `since`.)

- [ ] **Step 5: The other four cells, as minimal sheets with their final props**

Create `src/features/feed/board/month-sheet.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Sheet, SheetHead } from '@/components/ui/sheet-surface';
import type { MonthBills } from '@/domain/month-bills';
import { formatLocalDate } from '@/lib/dates';
import type { Occurrence } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

export type MonthSheetProps = {
  readonly month: LocalDate;
  readonly today: LocalDate;
  /** The feed's own occurrences for the month (layer B), unfiltered. */
  readonly occurrences: readonly Occurrence[] | undefined;
  readonly bills: MonthBills | undefined;
  readonly currency: Currency;
  /** The next income into any account, for the note. */
  readonly nextIncome: { readonly name: string; readonly date: LocalDate } | undefined;
  /** "Expected this month" with its breakdown, kept from the old hero. */
  readonly forecast: ReactNode;
  /** The month picker, shown in this sheet on a phone (the desktop's is in the top bar). */
  readonly monthPicker: ReactNode;
};

/** Task 8 draws the month sheet; until then it is the sapphire sheet with its title, the picker and the forecast. */
export function MonthSheet({ month, forecast, monthPicker }: MonthSheetProps) {
  const { t, i18n } = useTranslation();
  return (
    <Sheet kind="sapphire" data-slot="month-sheet">
      <SheetHead
        title={t('board.monthTitle', { month: formatLocalDate(month, i18n.language, { month: 'long' }) })}
      />
      {monthPicker}
      <div className="mt-3">{forecast}</div>
    </Sheet>
  );
}
```

Create `src/features/feed/board/categories-sheet.tsx`:

```tsx
import { useTranslation } from 'react-i18next';

import { Sheet, SheetHead } from '@/components/ui/sheet-surface';
import { formatLocalDate } from '@/lib/dates';
import type { Category, Occurrence } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

export type CategoriesSheetProps = {
  readonly month: LocalDate;
  readonly today: LocalDate;
  readonly occurrences: readonly Occurrence[] | undefined;
  readonly categories: ReadonlyMap<string, Category> | undefined;
  readonly currency: Currency;
  /** 10 bars on the board, 7 on a phone (§1.4). */
  readonly limit: number;
};

/** Task 9 draws the bars; until then it is the paper sheet with its title. */
export function CategoriesSheet({ month }: CategoriesSheetProps) {
  const { t, i18n } = useTranslation();
  return (
    <Sheet kind="paper" data-slot="categories-sheet">
      <SheetHead
        title={t('board.categoriesTitle', {
          month: formatLocalDate(month, i18n.language, { month: 'long' }),
        })}
      />
    </Sheet>
  );
}
```

Create `src/features/feed/board/transactions-sheet.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Sheet, SheetHead } from '@/components/ui/sheet-surface';

export type TransactionsSheetProps = {
  /** Rows in the month, for the subtitle. */
  readonly count: number;
  readonly filterBar: ReactNode;
  /** The full virtualised feed on desktop; the recent rows on a phone (Task 12). */
  readonly list: ReactNode;
  /** The round arrow to the full list, on a phone. */
  readonly onAll?: () => void;
};

/** Task 10 draws the concept's rows; until then the old list sits on a paper sheet. */
export function TransactionsSheet({ count, filterBar, list }: TransactionsSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet kind="paper" data-slot="transactions-sheet">
      <SheetHead title={t('board.transactionsTitle')} subtitle={t('board.transactionsSub', { count })} />
      <div className="mt-3">{filterBar}</div>
      <div className="mt-3">{list}</div>
    </Sheet>
  );
}
```

Create `src/features/feed/board/wallet-column.tsx`:

```tsx
import { useTranslation } from 'react-i18next';

import { TitlePair } from '@/components/ui/title-pair';
import type { CashSummary } from '@/domain/cash';
import type { MonthBills } from '@/domain/month-bills';
import type { PaymentMethod, Profile } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

export type WalletColumnProps = {
  /** Active credit cards for the person in view. */
  readonly cards: readonly PaymentMethod[];
  readonly bills: MonthBills | undefined;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly cash: CashSummary | undefined;
  readonly currency: Currency;
  readonly today: LocalDate;
};

/** Task 11 draws the card sheets and the cash sheet; until then, the column's heading. */
export function WalletColumn(_props: WalletColumnProps) {
  const { t } = useTranslation();
  return (
    <div data-slot="wallet" className="grid gap-2">
      <TitlePair as="h2" size="sheet" title={t('nav.cards')} />
    </div>
  );
}
```

- [ ] **Step 6: The feed on the board**

In `src/features/feed/feed-screen.tsx`:

1. The outer `<section>` becomes `className="px-3 pb-24 lg:px-0 lg:pb-8"` (full width of the content box; a 12px gutter on a phone, as the concept's).
2. New hooks beside the existing ones:

```tsx
const desktop = useDesktop(); // already there from Task 6
const bills = useMonthBills(today, settings.defaultCurrency, filters.profileId);
const incoming = useIncoming(today);
const cashData = useCashData(filters.profileId, today);
```

3. Derived values:

```tsx
const methods = lookups?.paymentMethods;
const accounts = useMemo<AccountItem[]>(() => {
  if (methods === undefined) return [];
  const items = [...methods.values()]
    .filter((m) => m.type === 'bank_account' && m.isArchived === 0)
    .filter((m) => filters.profileId === ALL_PROFILES || methodOwnedBy(m, filters.profileId))
    .map((m) => {
      const bank = bankByCode(m.account?.bank ?? '');
      const next = incoming?.next.get(m.id);
      return {
        id: m.id,
        moneyKey: methodKey(m),
        name: bank === undefined ? m.label : bankName(bank, i18n.language),
        label:
          next === undefined
            ? m.label
            : `${m.label} · ${t('board.accountNext', { date: formatLocalDate(next.date, i18n.language, { day: 'numeric', month: 'short' }) })}`,
        figure: next?.money.baseAmountMinor,
      };
    })
    .sort((a, b) => (b.figure ?? -1) - (a.figure ?? -1));
  const cash = cashData?.summary;
  if (cash !== undefined && cash.people.length > 0) {
    items.push({
      id: 'cash',
      moneyKey: 'cash',
      name: t('board.cashName'),
      label: t('board.cashLabel', {
        date:
          cash.countedOn === undefined
            ? ''
            : formatLocalDate(cash.countedOn, i18n.language, { day: 'numeric', month: 'short' }),
      }),
      figure: cash.onHandMinor,
    });
  }
  return items;
}, [methods, incoming, cashData, filters.profileId, i18n.language, t]);
const banks = new Set(accounts.filter((a) => a.id !== 'cash').map((a) => a.moneyKey)).size;
const net =
  occurrences === undefined || bills === undefined || methods === undefined
    ? undefined
    : settledThisMonth(occurrences, methods, today, bills);
const nextIncome = useMemo(() => {
  const soonest = [...(incoming?.next.values() ?? [])].sort((a, b) => compareLocal(a.date, b.date))[0];
  if (soonest === undefined) return undefined;
  const category = incoming?.categories.get(soonest.categoryId);
  // Its own words first (a salary's note), then its category's name; never an id.
  const name =
    soonest.transaction.note ?? (category === undefined ? t('board.in') : categoryDisplayName(category, t));
  return { name, date: soonest.date };
}, [incoming, t]);
```

4. The JSX between `CollapsedSummaryBar` and the overlays becomes:

```tsx
      <ScreenHead … />  {/* Task 6's top bar, unchanged */}
      <FeedBoard
        balance={
          <div ref={measureHeader} data-testid="feed-header">
            <BalanceSheet
              title={t('board.balanceTitle')}
              subtitle={t('board.balanceSub', { count: banks })}
              actions={
                <div className="flex flex-wrap items-center gap-2" data-testid="panel-pills">
                  {lookups === undefined ? null : (
                    <ProfileSwitcher profiles={lookups.profiles} active={filters.profileId} onSelect={setProfile} tone="panel" />
                  )}
                  <PrimePill />
                </div>
              }
              lede={
                <>
                  {net === undefined ? null : (
                    <Trans
                      i18nKey={net >= 0 ? 'board.ledeUp' : 'board.ledeDown'}
                      values={{ amount: formatMoney(Math.abs(net), settings.defaultCurrency, { locale: i18n.language, signMode: net > 0 ? 'always' : 'never' }).text }}
                      components={{ box: <Mark /> }}
                    />
                  )}{' '}
                  {bills === undefined || bills.upcomingMinor === 0 || bills.lastDate === undefined ? null : (
                    <Trans
                      i18nKey="board.ledeCards"
                      values={{
                        amount: formatMoney(bills.upcomingMinor, settings.defaultCurrency, { locale: i18n.language }).text,
                        date: formatLocalDate(bills.lastDate, i18n.language, { day: 'numeric', month: 'short' }),
                      }}
                      components={{ box: <Mark /> }}
                    />
                  )}
                </>
              }
              figure={
                <BalanceNumeral
                  state={balance}
                  currency={settings.defaultCurrency}
                  breakdown={breakdowns.balance}
                  onFullBreakdown={() => {
                    setBreakdown('balance');
                  }}
                />
              }
              accounts={<AccountSheets items={accounts} currency={settings.defaultCurrency} />}
            />
          </div>
        }
        month={
          <MonthSheet
            month={filters.month}
            today={today}
            occurrences={occurrences}
            bills={bills}
            currency={settings.defaultCurrency}
            nextIncome={nextIncome}
            forecast={
              <ForecastLine expense={expense} currency={settings.defaultCurrency} month={filters.month} today={today} breakdown={breakdowns.forecast} onFullBreakdown={() => { setBreakdown('expense'); }} />
            }
            monthPicker={desktop ? null : <MonthCursor month={filters.month} today={today} onStep={stepMonth} onPick={setMonth} tone="bold" />}
          />
        }
        categories={
          <CategoriesSheet month={filters.month} today={today} occurrences={occurrences} categories={lookups?.categories} currency={settings.defaultCurrency} limit={desktop ? 10 : 7} />
        }
        transactions={
          <TransactionsSheet
            count={windowCount}
            filterBar={<FilterBar filters={filters} onChange={set} onClear={clear} />}
            list={/* the existing EmptyState / VirtualFeed block, unchanged */}
          />
        }
        wallet={
          <WalletColumn
            cards={[...(methods?.values() ?? [])].filter((m) => m.type === 'credit_card' && m.isArchived === 0 && (filters.profileId === ALL_PROFILES || methodOwnedBy(m, filters.profileId)))}
            bills={bills}
            profiles={new Map((lookups?.profiles ?? []).map((p) => [p.id, p]))}
            cash={cashData?.summary}
            currency={settings.defaultCurrency}
            today={today}
          />
        }
      />
```

and the `HeroSheet` import goes. Every overlay (`TransactionSheet`, `ImportSheet`, the menus and pop-outs, the breakdown panels) stays as it is.

- [ ] **Step 7: Run the tests**

Run: `pnpm exec vitest run --project unit src/domain/month-bills.test.ts && pnpm exec vitest run --project dom src/features/feed src/features/summary`
Expected: PASS. Tests that read the balance's exact text from `balance-amount` now read `balance-announced` (the live region says the exact amount; the visible numeral is whole shekels): update those assertions, not the component.

Run: `pnpm test:e2e`
Expected: PASS after updating any selector that looked for the month cursor inside `panel-pills` (it is now `[data-slot="month-picker"]`, in the top bar from 1024 and in the month sheet below) or for `balance-amount`'s exact text. No test is deleted.

- [ ] **Step 8: The gate, the harness, and commit**

Run: `pnpm verify` → exit 0.

Run: `pnpm fidelity --grep "@fid-feed-balance|@fid-shell-desktop|@fid-feed-board"`
Expected: pass in both themes: the balance sheet 1136 wide at y 122 ±6, radius 56, padding 34/38, the numeral 252px ±2% bleeding 14.25 ±1.5px, five account sheets at −1.2° / +1°, 440 wide, the second 18px in; structure ≥ 0.70 and palette ≥ 0.90 against `.desk .bal`; at 1024 one column with the month at 5 spans. Look at `feed-balance-light/side-by-side.png` and `-dark/` yourself before committing: the figures differ (the app's household), the shapes must not.

Run: `pnpm exec playwright test e2e/22-numerals.spec.ts --project=en`
Expected: no longer skipped; passes (the balance is the first numeral a screen draws).

```bash
git add src/domain/month-bills.ts src/domain/month-bills.test.ts src/features/cards/use-month-bills.ts src/features/cards/issuer-label.ts src/features/feed src/features/summary e2e
git commit -m "The feed is the concept's board: the household's money on a full-width ink sheet with a 252px balance and the accounts fanned beside it, on twelve columns that fill the screen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8: The month sheet

The sapphire sheet: the month so far, in and out, the track, the note with its figure in the box, the card charges by day with their company chips, and "left this month" as the 168px numeral.

**Files:**

- Modify: `src/features/feed/board/month-sheet.tsx` (replace the minimal sheet; keep `MonthSheetProps` exactly)
- Create: `src/features/feed/board/month-sheet.test.tsx`

**Interfaces:**

- Consumes: Task 2 `ratioPercent`, `board.*`; Task 3 `Sheet`, `SheetHead`, `Chip`; Task 4 `Numeral`, `Mark`; Task 7 `MonthSheetProps`, `MonthBills`, `issuerLabel`; existing `summariseRange`, `cardKey`, `Money`, `parseLocalDate`, `daysInMonth`, `startOfMonth`, `endOfMonth`, `compareLocal`.
- Produces: `MonthSheet(props: MonthSheetProps)` — `data-slot="month-sheet"`, the left-this-month figure inside `data-slot="month-left"`.

- [ ] **Step 1: Write the failing test**

Create `src/features/feed/board/month-sheet.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MONEY, d } from '@/domain/test-factories';
import { monthBills } from '@/domain/month-bills';
import { renderWithProviders } from '@/test/render';
import type { Occurrence, PaymentMethod } from '@/types/domain';

import { MonthSheet } from './month-sheet';

const TODAY = d('2026-10-09');
const occ = (kind: 'income' | 'expense', date: string, minor: number) =>
  ({
    key: `${kind}:${date}:${String(minor)}`,
    date: d(date),
    originalDate: d(date),
    isSkipped: false,
    isProjected: false,
    categoryId: kind === 'income' ? 'cat.salary' : 'cat.rent',
    money: { ...MONEY, amountMinor: minor, baseAmountMinor: minor },
    transaction: { kind, recurrence: { type: 'one_time' } },
  }) as unknown as Occurrence;
const card = (id: string, issuer: 'isracard' | 'max' | 'cal', billingDay: number) =>
  ({
    id,
    profileId: 'p',
    type: 'credit_card',
    label: id,
    card: { issuer, billingDay },
    isArchived: 0,
  }) as unknown as PaymentMethod;
const spend = (methodId: string, date: string, minor: number) =>
  ({ ...occ('expense', date, minor), paymentMethodId: methodId }) as Occurrence;

const cards = [card('isracard', 'isracard', 2), card('max', 'max', 10), card('cal', 'cal', 15)];
const bills = monthBills(
  cards,
  [
    spend('isracard', '2026-09-12', 423_700),
    spend('max', '2026-09-14', 282_900),
    spend('cal', '2026-09-25', 187_600),
  ],
  TODAY,
);

function draw() {
  return renderWithProviders(
    <MonthSheet
      month={d('2026-10-01')}
      today={TODAY}
      occurrences={[
        occ('income', '2026-10-01', 2_390_000),
        occ('expense', '2026-10-03', 1_436_200),
        occ('income', '2026-10-20', 99_900),
      ]}
      bills={bills}
      currency="ILS"
      nextIncome={{ name: 'Salary', date: d('2026-11-01') }}
      forecast={<p>forecast</p>}
      monthPicker={null}
    />,
  );
}

describe('the month sheet', () => {
  it('says how the month is going: in, out, the share, and what is left, as the concept does', () => {
    draw();
    const sheet = document.querySelector<HTMLElement>('[data-slot="month-sheet"]');
    expect(sheet).toHaveAttribute('data-sheet', 'sapphire');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/October so far/);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Day 9 of 31/);
    expect(screen.getByRole('img', { name: /60% of what came in went out/ })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="mark"]')).toHaveTextContent('60%');
    const left = document.querySelector('[data-slot="month-left"] [data-numeral]');
    expect(left).toHaveAttribute('data-numeral-size', 'left');
    expect(screen.getByText('forecast')).toBeInTheDocument(); // "expected this month" stays (behaviour kept)
  });

  it('lists the charges by day with each company as a chip, and strikes through the ones charged', () => {
    draw();
    const list = screen.getByRole('list', { name: 'Card charges by day' });
    const days = within(list).getAllByRole('listitem');
    expect(days).toHaveLength(3);
    expect(days[0]).toHaveTextContent('2');
    expect(days[0]).toHaveTextContent('charged');
    expect(days[0]?.querySelector('[data-slot="chip"]')).toHaveAttribute('data-money', 'issuer-isracard');
    expect(days[0]?.className).toMatch(/opacity-78/);
    expect(days[1]?.className).not.toMatch(/opacity-78/);
  });

  it('draws only what it has while the month loads', () => {
    renderWithProviders(
      <MonthSheet
        month={d('2026-10-01')}
        today={TODAY}
        occurrences={undefined}
        bills={undefined}
        currency="ILS"
        nextIncome={undefined}
        forecast={null}
        monthPicker={null}
      />,
    );
    expect(document.querySelector('[data-slot="month-sheet"]')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Card charges by day' })).toBeNull();
  });
});
```

Run: `pnpm exec vitest run --project dom src/features/feed/board/month-sheet.test.tsx`
Expected: FAIL.

- [ ] **Step 2: The sheet**

Replace the body of `src/features/feed/board/month-sheet.tsx` below `MonthSheetProps` with:

```tsx
/**
 * The month (§5.1): the sapphire sheet, the app's own colour (§1.2). In and
 * out as rows with 2px tint lines, a track for the share spent, a note with
 * that share in the box, the card charges by day (the day in Karantina, the
 * companies as chips, a charged day struck through and dimmed), then "left
 * this month" as the huge numeral running off the foot.
 */
export function MonthSheet({
  month,
  today,
  occurrences,
  bills,
  currency,
  nextIncome,
  forecast,
  monthPicker,
}: MonthSheetProps) {
  const { t, i18n } = useTranslation(['common', 'cards']);
  const current = startOfMonth(month) === startOfMonth(today);
  const upTo = current ? today : endOfMonth(month);
  const so =
    occurrences === undefined
      ? undefined
      : summariseRange(
          occurrences.filter((o) => !o.isProjected && !o.isSkipped && compareLocal(o.date, upTo) <= 0),
        );
  const percent = so === undefined ? 0 : ratioPercent(so.expenseMinor, so.incomeMinor);
  const shown = `${String(percent)}%`;
  const { year, month: m, day } = parseLocalDate(today);
  const name = formatLocalDate(month, i18n.language, { month: 'long' });
  const short = (date: LocalDate) => formatLocalDate(date, i18n.language, { day: 'numeric', month: 'short' });

  return (
    <Sheet kind="sapphire" bleed data-slot="month-sheet" className="flex flex-col gap-3.5">
      <SheetHead
        title={t(current ? 'board.monthTitle' : 'board.monthTitlePast', { month: name })}
        subtitle={current ? t('board.monthDay', { day, days: daysInMonth(year, m) }) : undefined}
      />
      {monthPicker}
      {so === undefined ? null : (
        <>
          <dl className="grid gap-1.5 text-[1.0625rem]">
            {(
              [
                ['in', so.incomeMinor],
                ['out', so.expenseMinor],
              ] as const
            ).map(([key, minor]) => (
              <div key={key} className="border-be-2 flex justify-between gap-3 border-border py-1.5">
                <dt>{t(`board.${key}`)}</dt>
                <dd className="font-semibold">
                  <Money minor={minor} currency={currency} />
                </dd>
              </div>
            ))}
          </dl>
          <div
            role="img"
            aria-label={t('board.track', { percent: shown })}
            className="h-3.5 rounded-full border-2 border-current p-0.5"
          >
            <i
              className="block h-full rounded-full bg-current"
              style={{ inlineSize: `${String(Math.min(100, percent))}%` }}
            />
          </div>
          <p className="text-base leading-[1.75] font-light">
            <Trans i18nKey="board.note" values={{ percent: shown }} components={{ box: <Mark /> }} />
            {nextIncome === undefined
              ? null
              : ` ${t('board.noteNext', { name: nextIncome.name, date: short(nextIncome.date) })}`}
          </p>
        </>
      )}
      {forecast}
      {/* The charges are this calendar month's: shown only on it. */}
      {!current || bills === undefined || bills.days.length === 0 ? null : (
        <ul
          role="list"
          aria-label={t('board.charges')}
          // The chips here ring in the sheet's tint at 55% (§9.2).
          className="grid gap-1.5 [--chip-ring:color-mix(in_oklch,var(--on-fill)_55%,transparent)]"
        >
          {bills.days.map((charge) => (
            <li
              key={charge.date}
              // A charged day is dimmed: 78% in light (4.75:1, deviation D-1), the concept's 72% in dark (4.85:1).
              className={cn(
                'grid min-h-9 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2.5 text-[0.9375rem]',
                charge.charged && 'opacity-78 dark:opacity-72',
              )}
            >
              <span className="text-center font-display text-[2.125rem] leading-[0.8]">
                {parseLocalDate(charge.date).day}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {charge.bills.map((bill) => (
                  <Chip key={bill.card.id} moneyKey={cardKey(bill.card)}>
                    {issuerLabel(bill.card, t)}
                  </Chip>
                ))}
              </span>
              <span className="font-semibold">
                <Money
                  minor={charge.totalMinor}
                  currency={currency}
                  className={cn(charge.charged && 'line-through decoration-2')}
                />
                {charge.charged ? <span className="sr-only"> ({t('board.charged')})</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {so === undefined ? null : (
        <div data-slot="month-left" className="mt-auto">
          <p className="text-[1.0625rem] font-semibold">{t('board.left')}</p>
          <Numeral minor={so.incomeMinor - so.expenseMinor} currency={currency} size="left" rounded />
        </div>
      )}
    </Sheet>
  );
}
```

with the imports `cn`, `Trans`, `Money`, `Chip`, `Mark`, `Numeral`, `cardKey`, `issuerLabel`, `summariseRange`, `ratioPercent`, `compareLocal`, `daysInMonth`, `endOfMonth`, `parseLocalDate`, `startOfMonth`. (`issuerLabel` takes the `cards` namespace's `t`: pass `useTranslation('cards').t` if the combined `t` does not type-check.)

- [ ] **Step 3: Run the test**

Run: `pnpm exec vitest run --project dom src/features/feed/board/month-sheet.test.tsx src/features/feed src/features/summary`
Expected: PASS.

- [ ] **Step 4: The gate, the harness, and commit**

Run: `pnpm verify` → exit 0.

Run: `pnpm fidelity --grep "@fid-feed-month"`
Expected: pass in both themes: 368 wide at x 792 (the inline start in Hebrew), radius 56, title 30px, the left numeral 168px ±2% bleeding 9.5 ±1.5px; 5 chips and 1 mark among the counts; structure ≥ 0.70 and palette ≥ 0.90 against `.desk .month`. Look at both `side-by-side.png` files.

```bash
git add src/features/feed/board/month-sheet.tsx src/features/feed/board/month-sheet.test.tsx
git commit -m "The month sits on the sapphire sheet: in and out, the share spent, the card charges by day with their companies' colours, and what is left as a 168px figure" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 9: The categories sheet

Ten fat hue bars on the paper sheet, each against the largest, with a pill to Categories.

**Files:**

- Modify: `src/features/feed/board/categories-sheet.tsx` (replace the minimal sheet; keep `CategoriesSheetProps`)
- Create: `src/features/feed/board/categories-sheet.test.tsx`

**Interfaces:**

- Consumes: Task 3 `Sheet`, `SheetHead`; Task 4 `HueBars` (relative); existing `totalsByCategory`, `categoryHue`, `categoryDisplayName`, `formatMoney`, `sum`, `Button` (`pill`, `render`), `LINKED_ROUTES.categories`.
- Produces: `CategoriesSheet(props: CategoriesSheetProps)` — `data-slot="categories-sheet"`.

- [ ] **Step 1: Write the failing test**

Create `src/features/feed/board/categories-sheet.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MONEY, d } from '@/domain/test-factories';
import { renderWithProviders } from '@/test/render';
import type { Category, Occurrence } from '@/types/domain';

import { CategoriesSheet } from './categories-sheet';

const cat = (id: string, hue?: string) =>
  ({
    id,
    kind: 'expense',
    icon: 'Circle',
    source: 'custom',
    name: id,
    sortOrder: 0,
    isArchived: 0,
    ...(hue ? { hue } : {}),
  }) as unknown as Category;
const spent = (categoryId: string, minor: number, date = '2026-10-03') =>
  ({
    key: `${categoryId}:${date}`,
    date: d(date),
    originalDate: d(date),
    isSkipped: false,
    isProjected: false,
    categoryId,
    money: { ...MONEY, amountMinor: minor, baseAmountMinor: minor },
    transaction: { kind: 'expense', recurrence: { type: 'one_time' } },
  }) as unknown as Occurrence;

describe('the categories sheet', () => {
  it("draws this month's categories as hue bars, the largest first, with the total and a way to Categories", () => {
    renderWithProviders(
      <CategoriesSheet
        month={d('2026-10-01')}
        today={d('2026-10-09')}
        currency="ILS"
        limit={10}
        categories={
          new Map([
            ['rent', cat('rent', 'indigo')],
            ['food', cat('food', 'green')],
          ])
        }
        occurrences={[spent('food', 284_000), spent('rent', 560_000), spent('food', 1, '2026-10-20')]}
      />,
    );
    expect(document.querySelector('[data-slot="categories-sheet"]')).toHaveAttribute('data-sheet', 'paper');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/October by category/);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/in 2 categories/);
    const bars = document.querySelectorAll('[data-slot="hue-bars"] i[data-hue]');
    expect([...bars].map((bar) => bar.getAttribute('data-hue'))).toEqual(['indigo', 'green']);
    expect(screen.getByRole('link', { name: 'Categories' })).toHaveAttribute('href', '/categories');
  });

  it('says so when nothing was spent yet', () => {
    renderWithProviders(
      <CategoriesSheet
        month={d('2026-10-01')}
        today={d('2026-10-09')}
        currency="ILS"
        limit={10}
        categories={new Map()}
        occurrences={[]}
      />,
    );
    expect(screen.getByText('Nothing spent this month yet.')).toBeInTheDocument();
  });
});
```

Run: `pnpm exec vitest run --project dom src/features/feed/board/categories-sheet.test.tsx`
Expected: FAIL.

- [ ] **Step 2: The sheet**

Replace the body of `src/features/feed/board/categories-sheet.tsx` below `CategoriesSheetProps` with:

```tsx
/**
 * The month by category (§5.1): the paper sheet with one 30px hue bar per
 * category (the largest 10 on the board, 7 on a phone, then "Other"), each
 * against the largest, its name and its amount beside it; a pill to the
 * Categories screen. Up to today in the current month, the whole month before.
 */
export function CategoriesSheet({
  month,
  today,
  occurrences,
  categories,
  currency,
  limit,
}: CategoriesSheetProps) {
  const { t, i18n } = useTranslation(['common', 'categories']);
  const current = startOfMonth(month) === startOfMonth(today);
  const upTo = current ? today : endOfMonth(month);
  const items = useMemo<HueBarItem[]>(
    () =>
      totalsByCategory(
        (occurrences ?? []).filter((o) => !o.isProjected && !o.isSkipped && compareLocal(o.date, upTo) <= 0),
        'expense',
      ).map(({ categoryId, totalMinor }) => {
        const category = categories?.get(categoryId);
        return {
          id: categoryId,
          name: category === undefined ? t('sheets.other') : categoryDisplayName(category, t),
          minor: totalMinor,
          hue: category === undefined ? 'neutral' : categoryHue(category),
        };
      }),
    [occurrences, categories, upTo, t],
  );
  const total = sum(items.map((item) => item.minor));
  const name = formatLocalDate(month, i18n.language, { month: 'long' });

  return (
    <Sheet kind="paper" data-slot="categories-sheet" className="grid content-start gap-4.5">
      <SheetHead
        title={t('board.categoriesTitle', { month: name })}
        subtitle={
          items.length === 0
            ? undefined
            : t('board.categoriesSub', {
                count: items.length,
                amount: formatMoney(total, currency, { locale: i18n.language }).text,
              })
        }
        action={
          <Button variant="pill" nativeButton={false} render={<Link to={LINKED_ROUTES.categories} />}>
            {t('nav.categories')}
          </Button>
        }
      />
      {items.length === 0 ? (
        <p className="font-light">{t('board.categoriesEmpty')}</p>
      ) : (
        <HueBars items={items} currency={currency} limit={limit} />
      )}
    </Sheet>
  );
}
```

with the imports `useMemo`, `Link`, `Button`, `HueBars` and `HueBarItem`, `categoryHue`, `categoryDisplayName`, `totalsByCategory`, `formatMoney`, `sum`, `compareLocal`, `endOfMonth`, `startOfMonth`, `LINKED_ROUTES`.

- [ ] **Step 3: Run the test**

Run: `pnpm exec vitest run --project dom src/features/feed/board/categories-sheet.test.tsx src/features/feed`
Expected: PASS.

- [ ] **Step 4: The gate, the harness, and commit**

Run: `pnpm verify` → exit 0.

Run: `pnpm fidelity --grep "@fid-feed-categories"`
Expected: pass in both themes: 752 wide at x 24, radius 56, title 30px, 10 hue bars 30px tall, the first (rent) as long as the track and the second at about half; structure and palette against `.desk .cats`. Look at both `side-by-side.png` files.

```bash
git add src/features/feed/board/categories-sheet.tsx src/features/feed/board/categories-sheet.test.tsx
git commit -m "The month's categories are the concept's fat hue bars on a paper sheet, each against the largest, with the way to Categories beside them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 10: The transactions sheet and the concept's rows

The audit's gap 4: rows still lead with a grey disc and a line icon, the card is a grey caption, the day headings are muted bands that read as holes in dark. The concept's row: a 14×40 hue pill, the merchant in 600 at 17px, a 300 meta line with the category and the company chip, the amount in 500, 64px tall over a 2px line; day headings in 600 at 14px over a 2px line.

**Files:**

- Modify: `src/features/feed/board/transactions-sheet.tsx` (keep `TransactionsSheetProps`)
- Modify: `src/features/feed/feed-rows.tsx` (`DayHeader`, `TransactionRow` presentation only), `src/features/feed/feed-rows.test.tsx`
- Modify: `src/features/feed/virtual-feed.tsx` (`DAY_HEADER_HEIGHT` only)
- Modify: `src/features/feed/filter-bar.tsx` (sizes for the sheet), `src/components/ui/chip.tsx` (passes through `data-testid` and `title`)

**Interfaces:**

- Consumes: Task 3 `Sheet`, `SheetHead`, `Chip`, `HuePill`; Task 7 `TransactionsSheetProps`, `issuerLabel`; existing `categoryHue`, `cardKey`, `methodKey`, `bankByCode`, `bankName`, `Button` (`round`).
- Produces:
  - `TransactionsSheet(props: TransactionsSheetProps)` — `data-slot="transactions-sheet"`; a round arrow when `onAll` is given.
  - `DayHeader` with `data-slot="day-heading"`; `TransactionRow` with `data-slot="row-title"` on the merchant, `data-slot="hue-pill"` in its category button, the card or destination as a `Chip` (keeping `data-testid="row-card"` / `"row-destination"`), and every other test id (`row-text`, `row-amount`, `row-more`, `row-not-counted`) where it was.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/feed/feed-rows.test.tsx`, using its own `occurrence`, `context` and `render`:

```tsx
describe("the concept's rows", () => {
  const at = '2026-01-01T00:00:00.000Z' as PaymentMethod['createdAt'];
  const isracard: PaymentMethod = {
    id: 'isra',
    profileId: 'p1',
    type: 'credit_card',
    label: 'Isracard Platinum',
    card: { issuer: 'isracard', lastDigits: '4821' },
    isArchived: 0,
    createdAt: at,
    updatedAt: at,
  };
  const row = () =>
    render(
      <TransactionRow
        occurrence={occurrence({ paymentMethodId: 'isra' })}
        context={context({ methods: new Map([['isra', isracard]]) })}
        position={1}
        setSize={1}
        onCategory={() => undefined}
      />,
    );

  it("leads with the category's hue pill, inside the category button", () => {
    row();
    const button = screen.getByRole('button', { name: /^Category:/ });
    expect(button.querySelector('[data-slot="hue-pill"]')).toHaveAttribute('data-hue', 'green');
    expect(document.querySelector('[data-slot="category-chip"]')).toBeNull();
  });

  it('writes the merchant in 600 at 17px and the card as its company-colour chip with its last four', () => {
    row();
    expect(document.querySelector('[data-slot="row-title"]')?.className).toMatch(/text-\[1\.0625rem\]/);
    const chip = screen.getByTestId('row-card');
    expect(chip).toHaveAttribute('data-slot', 'chip');
    expect(chip).toHaveAttribute('data-money', 'issuer-isracard');
    expect(chip.textContent).toBe('Isracard 4821');
  });
});
```

and inside `describe('DayHeader', …)`:

```tsx
it('heads a day with a 2px line in 600, on the sheet, never a muted band', () => {
  render(<DayHeader date={d('2026-09-15')} netMinor={-4500} isToday currency="USD" />);
  const heading = document.querySelector('[data-slot="day-heading"]');
  expect(heading?.className).toMatch(/border-be-2/);
  expect(heading?.className).toMatch(/font-semibold/);
  expect(heading?.className).not.toMatch(/bg-background|bg-muted/);
});
```

Two existing tests describe the old look and change with it (their behaviour does not): "shows a card icon and its last four digits" now expects `'Max Gold 5555'` (a card with no issuer is named by its label, then its last four, as the concept's chips are); "draws the same sapphire chip for income and expense" now expects two `[data-slot="hue-pill"]` with `data-hue="green"` and no `category-chip`. The accessible names they assert do not change.

Run: `pnpm exec vitest run --project dom src/features/feed/feed-rows.test.tsx`
Expected: FAIL.

- [ ] **Step 2: The row**

In `src/features/feed/feed-rows.tsx`:

1. `DayHeader`'s class becomes:

```tsx
        // On the sheet's own colour (opaque, as before: a pinned heading sits over a half-scrolled row),
        // 600 at 14px over the concept's 2px line.
        'flex items-baseline justify-between gap-2 border-be-2 border-border bg-card px-0 pt-4 pb-1.5',
        'text-sm font-semibold',
```

and it gains `data-slot="day-heading"`; its `Money` becomes `className="text-xs font-light"`.

2. `TransactionRow`'s outer `div` class becomes:

```tsx
        'relative flex min-h-16 items-center gap-3.5 border-be-2 border-border py-2',
        occurrence.isSkipped && 'opacity-50',
```

3. Both category leads (the inert `span` and the `button`) hold `<HuePill hue={category === undefined ? undefined : categoryHue(category)} />` instead of `<CategoryChip … />`; each stays 44×44 (`size-11`) and moves back by the pill's inset so the pill sits on the sheet's edge: add `-ms-3.75` to both.

4. The text block:

```tsx
<span className="min-w-0 flex-1" data-testid="row-text">
  <span
    data-slot="row-title"
    className="block truncate text-[1.0625rem] leading-[1.3] font-semibold"
    aria-hidden="true"
  >
    {occurrence.note ?? categoryName}
  </span>
  <span className="mt-0.75 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-light text-muted-foreground">
    {occurrence.note === undefined ? null : (
      <span className="min-w-0 truncate" aria-hidden="true">
        {categoryName}
      </span>
    )}
    {card === undefined ? null : (
      <Chip moneyKey={card.key} data-testid="row-card">
        {card.text}
      </Chip>
    )}
    {destination === undefined ? null : (
      <Chip moneyKey={destination.key} data-testid="row-destination">
        {destination.text}
      </Chip>
    )}
    {/* the type chip, "not counted yet" and "skipped" stay exactly as they are */}
  </span>
</span>
```

and the old card and destination captions under the amount go. `Chip` must pass `data-testid` and `title` through: give it `...rest` of `React.HTMLAttributes<HTMLSpanElement>` (this task owns that one change to `chip.tsx`; Task 3's test still passes). Keep `title={card.name}` on the card chip, as the row had.

5. `cardOf` returns `{ text: \`${issuerLabel(method, tCards)} ${digits}\`, label, name, key: cardKey(method) }`(the concept's "ישראכרט 4821"; without digits, the label as now), and`destinationOf`returns`key: methodKey(method)`(an account's bank colour;`'cash'`for cash) and, for a bank account,`text` = the bank's name (`bankName(bankByCode(code))`, falling back to the account's label).

6. The amount: `className={cn('text-[1.0625rem] font-medium', isIncome ? 'text-income' : 'text-foreground')}`. The sign stays as it is today (expenses with their minus): it is information, and the row's colour alone must not carry it (decision 6).

7. The ⋯ button stays exactly as it is (always present, 44px).

In `src/features/feed/virtual-feed.tsx`: `DAY_HEADER_HEIGHT = 45` (16 + 21 + 6 + 2); `ROW_HEIGHT` stays 64.

In `src/features/feed/filter-bar.tsx`: controls inside the sheet use the sheet's colours (they do through the context); give the bar `className="flex flex-wrap items-center gap-2"` and the kind filter its 44px height (`min-h-11`).

- [ ] **Step 3: The sheet**

Replace the body of `src/features/feed/board/transactions-sheet.tsx` below `TransactionsSheetProps` with:

```tsx
/**
 * The transactions (§5.1): the paper sheet with its title pair, the filter
 * bar, and the list - on desktop the whole virtualised feed, on a phone the
 * recent rows with a round arrow to all of them (Task 12).
 */
export function TransactionsSheet({ count, filterBar, list, onAll }: TransactionsSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet kind="paper" data-slot="transactions-sheet" className="grid gap-1">
      <SheetHead
        title={t('board.transactionsTitle')}
        subtitle={t('board.transactionsSub', { count })}
        action={
          onAll === undefined ? undefined : (
            <Button variant="round" onClick={onAll} aria-label={t('board.allTransactions')}>
              <ArrowRight className="rtl:-scale-x-100" aria-hidden="true" />
            </Button>
          )
        }
      />
      <div className="mt-2">{filterBar}</div>
      {list}
    </Sheet>
  );
}
```

(Imports: `ArrowRight` from `lucide-react`, `Button`.)

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project dom src/features/feed`
Expected: PASS, every existing feed test included (test ids kept; any test that asserted the grey `CategoryChip` in a row now asserts the hue pill).

Run: `pnpm exec playwright test e2e/10-feed-scale.spec.ts e2e/02-transaction-type.spec.ts e2e/16-business-types.spec.ts e2e/04-rtl-hebrew.spec.ts --project=en`
Expected: PASS (the virtualiser still renders a screenful of 4,000 rows; categories, business types and RTL unchanged).

- [ ] **Step 5: The gate, the harness, and commit**

Run: `pnpm verify` → exit 0.

Run: `pnpm fidelity --grep "@fid-feed-transactions"`
Expected: pass in both themes: 656 wide at x 504, radius 56; hue pills 14×40; rows 64 ±4px; merchants 17px; chips 24px at 13px; day headings 14px; 8 hue pills and 3 day headings within the frame; structure and palette against `.desk .tx-sheet` (the household puts 2 rows on today, 3 on yesterday and 3 on the 7th, as the concept does). Look at both `side-by-side.png` files.

```bash
git add src/features/feed src/components/ui/chip.tsx
git commit -m "Every transaction leads with its category's hue pill, names its merchant in bold and carries its card as a company-colour chip, on a paper sheet with 2px day lines" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 11: The wallet column and the cash sheet

The concept's right-hand column: the "Cards" heading with "+ Card", one sheet per card in its company's colour with its bill as a 104px figure cut by the corner and its billing day in the box, sides swapping; then the yellow cash sheet with Count and Withdraw and a 150px total. The cash sheet is Cash's (spec §11: 3d owns it), so it is built in the cash feature and the wallet uses it.

**Files:**

- Create: `src/features/cash/cash-sheet.tsx`, `src/features/cash/cash-sheet.test.tsx`
- Modify: `src/features/feed/board/wallet-column.tsx` (keep `WalletColumnProps`)
- Create: `src/features/feed/board/wallet-column.test.tsx`

**Interfaces:**

- Consumes: Task 3 `Sheet`; Task 4 `CardSheet` (figure flex-1, `as`), `Numeral`; Task 7 `WalletColumnProps`, `MonthBills`, `issuerLabel`; existing `cardKey`, `TitlePair`, `Button` (`pill`, `render`), `ROUTES`.
- Produces:
  - `CashSheet({ summary: CashSummary; currency: Currency; actions?: ReactNode; size?: 'cash' })` — `data-slot="cash-sheet"`, `data-money="cash"`, radius 44 → 36, the pot as the `cash` numeral bleeding off the foot.
  - `WalletColumn(props: WalletColumnProps)` — `data-slot="wallet"`; the top 5 cards by this month's bill, then "All cards"; links `ROUTES.cards + '?add=card'` ("+ Card"), `ROUTES.cash + '?do=count'` and `'?do=withdraw'` (Task 15 opens the matching panel from those).

- [ ] **Step 1: Write the failing tests**

Create `src/features/cash/cash-sheet.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { d } from '@/domain/test-factories';
import { renderWithProviders } from '@/test/render';

import { CashSheet } from './cash-sheet';

describe('the cash sheet', () => {
  it('is the yellow cash sheet, with when it was counted and the pot as the huge figure', () => {
    renderWithProviders(
      <CashSheet
        currency="ILS"
        summary={{
          people: [],
          notSetUp: [],
          onHandMinor: 183_000,
          countedOn: d('2026-10-06'),
          expected: { inMinor: 0, outMinor: 0 },
        }}
        actions={<button type="button">Count</button>}
      />,
    );
    const sheet = document.querySelector('[data-slot="cash-sheet"]');
    expect(sheet).toHaveAttribute('data-money', 'cash');
    expect(sheet?.className).toMatch(/rounded-sheet-cash/);
    expect(sheet?.querySelector('[data-numeral]')).toHaveAttribute('data-numeral-size', 'cash');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/Cash box/);
    expect(screen.getByRole('button', { name: 'Count' })).toBeInTheDocument();
  });
});
```

Create `src/features/feed/board/wallet-column.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MONEY, d } from '@/domain/test-factories';
import { monthBills } from '@/domain/month-bills';
import { renderWithProviders } from '@/test/render';
import type { Occurrence, PaymentMethod } from '@/types/domain';

import { WalletColumn } from './wallet-column';

const card = (id: string, issuer: string, billingDay: number, lastDigits: string) =>
  ({
    id,
    profileId: 'p',
    type: 'credit_card',
    label: id,
    card: { issuer, billingDay, lastDigits },
    isArchived: 0,
  }) as unknown as PaymentMethod;
const spend = (methodId: string, minor: number) =>
  ({
    key: methodId,
    date: d('2026-09-12'),
    originalDate: d('2026-09-12'),
    paymentMethodId: methodId,
    isSkipped: false,
    isProjected: false,
    categoryId: 'cat.groceries',
    money: { ...MONEY, amountMinor: minor, baseAmountMinor: minor },
    transaction: { kind: 'expense', recurrence: { type: 'one_time' } },
  }) as unknown as Occurrence;

const cards = [
  card('cal', 'cal', 15, '3306'),
  card('isracard', 'isracard', 2, '4821'),
  card('max', 'max', 10, '0937'),
  card('diners', 'diners', 2, '7712'),
  card('amex', 'amex', 10, '1009'),
  card('sixth', 'max', 10, '1111'),
];
const bills = monthBills(
  cards,
  [
    spend('isracard', 321_400),
    spend('max', 214_000),
    spend('cal', 187_600),
    spend('diners', 102_300),
    spend('amex', 68_900),
  ],
  d('2026-10-09'),
);

describe('the wallet', () => {
  it('shows the five largest bills as card sheets, largest first, each with its billing day in the box', () => {
    renderWithProviders(
      <WalletColumn
        cards={cards}
        bills={bills}
        profiles={new Map()}
        cash={undefined}
        currency="ILS"
        today={d('2026-10-09')}
      />,
    );
    const sheets = document.querySelectorAll('[data-card-sheet]');
    expect(sheets).toHaveLength(5);
    expect([...sheets].map((s) => s.getAttribute('data-money'))).toEqual([
      'issuer-isracard',
      'issuer-max',
      'issuer-cal',
      'issuer-diners',
      'issuer-amex',
    ]);
    expect(sheets[0]?.querySelector('[data-slot="mark"]')).toHaveTextContent('Charged on day 2');
    expect(sheets[0]?.querySelector('[data-numeral]')).toHaveAttribute('data-numeral-size', 'card');
    expect(screen.getByRole('link', { name: 'All cards' })).toHaveAttribute('href', '/cards');
    expect(screen.getByRole('link', { name: '+ Card' })).toHaveAttribute('href', '/cards?add=card');
  });

  it('says so when there are no cards, and shows no cash sheet before cash is set up', () => {
    renderWithProviders(
      <WalletColumn
        cards={[]}
        bills={undefined}
        profiles={new Map()}
        cash={undefined}
        currency="ILS"
        today={d('2026-10-09')}
      />,
    );
    expect(screen.getByText('No cards yet.')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="cash-sheet"]')).toBeNull();
  });
});
```

Run: `pnpm exec vitest run --project dom src/features/cash/cash-sheet.test.tsx src/features/feed/board/wallet-column.test.tsx`
Expected: FAIL.

- [ ] **Step 2: The cash sheet**

Create `src/features/cash/cash-sheet.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Numeral } from '@/components/ui/numeral';
import { Sheet } from '@/components/ui/sheet-surface';
import type { CashSummary } from '@/domain/cash';
import { formatLocalDate } from '@/lib/dates';
import type { Currency } from '@/types/money';

/**
 * The cash box (§5.5): the yellow cash sheet, its title and when it was last
 * counted, its pills at the inline end, and the pot as the huge numeral
 * running off the foot. Cash owns it; the feed's wallet shows it too.
 */
export function CashSheet({
  summary,
  currency,
  actions,
}: {
  readonly summary: CashSummary;
  readonly currency: Currency;
  readonly actions?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Sheet
      kind="money"
      moneyKey="cash"
      radius="cash"
      bleed
      data-slot="cash-sheet"
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 px-7 pt-5.5"
    >
      <h3 className="text-[1.375rem] leading-[1.02] font-semibold tracking-[-0.01em]">
        {t('nav.cashBox')}
        {summary.countedOn === undefined ? null : (
          <span className="mt-0.5 block text-[1.0625rem] leading-[1.15] font-light tracking-normal">
            {t('cash.counted', {
              date: formatLocalDate(summary.countedOn, i18n.language, { day: 'numeric', month: 'short' }),
            })}
          </span>
        )}
      </h3>
      {actions === undefined ? null : <div className="flex flex-wrap gap-2 self-start">{actions}</div>}
      <div className="col-span-full min-w-0">
        <Numeral minor={summary.onHandMinor} currency={currency} size="cash" rounded />
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 3: The wallet**

Replace the body of `src/features/feed/board/wallet-column.tsx` below `WalletColumnProps` with:

```tsx
/**
 * The wallet (§5.1): the cards heading with "+ Card", one card sheet per
 * card for the five largest bills this month (sides swapping, the bill as a
 * 104px figure cut at half depth, its billing day in the box), "All cards"
 * when there are more, then the cash box. Not a sheet itself: the paper shows
 * through between its sheets.
 */
export function WalletColumn({ cards, bills, profiles, cash, currency }: WalletColumnProps) {
  const { t, i18n } = useTranslation(['common', 'cards']);
  const titleId = useId();
  const top = [...cards]
    .sort((a, b) => (bills?.byCard.get(b.id)?.totalMinor ?? 0) - (bills?.byCard.get(a.id)?.totalMinor ?? 0))
    .slice(0, 5);
  return (
    <section data-slot="wallet" aria-labelledby={titleId} className="grid gap-2">
      <div className="flex items-center justify-between gap-4 px-2 pt-3.5 pb-2">
        <TitlePair
          id={titleId}
          as="h2"
          size="sheet"
          title={t('nav.cards')}
          subtitle={
            bills === undefined || bills.totalMinor === 0
              ? undefined
              : t('board.walletSub', {
                  amount: formatMoney(bills.totalMinor, currency, { locale: i18n.language }).text,
                })
          }
        />
        <Button variant="pill" nativeButton={false} render={<Link to={`${ROUTES.cards}?add=card`} />}>
          {t('board.addCard')}
        </Button>
      </div>
      {top.length === 0 ? (
        <p className="px-2 font-light">{t('board.walletEmpty')}</p>
      ) : (
        top.map((card) => {
          const bill = bills?.byCard.get(card.id);
          const owner = profiles.get(card.profileId)?.name ?? t('cards:shared');
          return (
            <CardSheet
              key={card.id}
              moneyKey={cardKey(card)}
              name={issuerLabel(card, t)}
              holder={owner}
              lastDigits={card.card?.lastDigits}
              billing={
                card.card?.billingDay === undefined
                  ? undefined
                  : t('cards:billedOn', { day: card.card.billingDay })
              }
              figure={<Numeral minor={bill?.totalMinor ?? 0} currency={currency} size="card" rounded />}
            />
          );
        })
      )}
      {cards.length > top.length ? (
        <Link to={ROUTES.cards} className="px-2 font-medium underline decoration-2 underline-offset-4">
          {t('cards:allCards')}
        </Link>
      ) : null}
      {cash === undefined || cash.people.length === 0 ? null : (
        <CashSheet
          summary={cash}
          currency={currency}
          actions={
            <>
              <Button variant="pill" nativeButton={false} render={<Link to={`${ROUTES.cash}?do=count`} />}>
                {t('board.count')}
              </Button>
              <Button variant="pill" nativeButton={false} render={<Link to={`${ROUTES.cash}?do=withdraw`} />}>
                {t('board.withdraw')}
              </Button>
            </>
          }
        />
      )}
    </section>
  );
}
```

(Imports: `useId`, `Link`, `Button`, `CardSheet`, `Numeral`, `TitlePair`, `CashSheet`, `cardKey`, `issuerLabel`, `formatMoney`, `ROUTES`. `TitlePair` passes `id` through to its heading; if it does not, wrap the heading id on a `div`.)

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project dom src/features/cash src/features/feed`
Expected: PASS.

- [ ] **Step 5: The gate, the harness, and commit**

Run: `pnpm verify` → exit 0.

Run: `pnpm fidelity --grep "@fid-feed-wallet"`
Expected: pass in both themes: the column 464 wide at x 24; card sheets radius 36, 110 ±4 tall, 8px apart, 104px numerals bleeding 3.97 ±1.5px, the first figure at the inline end and the second at the start; the cash sheet radius 44 with a 150px figure; 5 card sheets and 2 cash pills; structure and palette against `.desk .wallet`. Look at both `side-by-side.png` files.

```bash
git add src/features/cash/cash-sheet.tsx src/features/cash/cash-sheet.test.tsx src/features/feed/board/wallet-column.tsx src/features/feed/board/wallet-column.test.tsx
git commit -m "The wallet is a column of card sheets in their companies' colours with this month's bills as big figures, and the yellow cash box beneath" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 12: The feed on a phone, list mode, and the whole feed at both sizes

The same sheets in one column on a phone, 8px apart and 12px from the edges, with the recent rows instead of the whole list; the whole list one tap away (and wherever a filter is on, as today). Then the whole feed is judged against the concept's fold, and the empty household is checked.

**Files:**

- Create: `src/features/feed/board/recent-rows.tsx`, `src/features/feed/board/list-mode.ts`, `src/features/feed/board/recent-rows.test.tsx`
- Modify: `src/features/feed/feed-screen.tsx`, `src/features/summary/collapsed-bar.tsx`
- Modify (only where they relied on the phone feed being the whole list): `e2e/10-feed-scale.spec.ts`, and any other spec the full run shows

**Interfaces:**

- Consumes: Tasks 7–11's sheets; `FeedRow`, `DayHeader`, `TransactionRow`, `RowContext`, `hasActiveFilters`.
- Produces:
  - `recentRows(rows: readonly FeedRow[], count: number): FeedRow[]` — the first `count` rows with their day headings, no horizon, no heading without a row.
  - `RecentRows({ rows, context, total, onOpen, onMenu, onCategory, onProjected })` — the 8 newest rows, not virtualised, positions out of `total`.
  - `listMode({ desktop, filtered, asked }: { desktop: boolean; filtered: boolean; asked: boolean }): boolean` — a phone shows the whole list (only) when a filter is on or `?list=1`.

- [ ] **Step 1: Write the failing test**

Create `src/features/feed/board/recent-rows.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';

import type { FeedRow } from '@/domain/feed';
import { d } from '@/domain/test-factories';

import { listMode } from './list-mode';
import { recentRows } from './recent-rows';

const day = (date: string): FeedRow => ({
  kind: 'day',
  key: `day:${date}`,
  date: d(date),
  netMinor: 0,
  count: 1,
  isToday: false,
  isFuture: false,
});
const row = (key: string, date: string) =>
  ({ kind: 'row', key, date: d(date), occurrence: {} }) as unknown as FeedRow;

describe('recentRows', () => {
  it('takes the newest rows with their day headings, and drops a heading left with no row', () => {
    const rows = [
      day('2026-10-09'),
      row('a', '2026-10-09'),
      row('b', '2026-10-09'),
      day('2026-10-08'),
      row('c', '2026-10-08'),
      day('2026-10-07'),
      row('d', '2026-10-07'),
    ];
    expect(recentRows(rows, 3).map((r) => r.key)).toEqual([
      'day:2026-10-09',
      'a',
      'b',
      'day:2026-10-08',
      'c',
    ]);
  });

  it('never carries the horizon marker', () => {
    const rows = [
      day('2026-10-09'),
      row('a', '2026-10-09'),
      { kind: 'horizon', key: 'h', through: d('2027-04-30') } as FeedRow,
    ];
    expect(recentRows(rows, 8).map((r) => r.kind)).toEqual(['day', 'row']);
  });
});

describe('listMode', () => {
  it('is the board on a phone unless a filter is on or the whole list was asked for; always the board on desktop', () => {
    expect(listMode({ desktop: false, filtered: false, asked: false })).toBe(false);
    expect(listMode({ desktop: false, filtered: true, asked: false })).toBe(true);
    expect(listMode({ desktop: false, filtered: false, asked: true })).toBe(true);
    expect(listMode({ desktop: true, filtered: true, asked: true })).toBe(false);
  });
});
```

Run: `pnpm exec vitest run --project dom src/features/feed/board/recent-rows.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Recent rows and list mode**

Create `src/features/feed/board/list-mode.ts`:

```ts
/**
 * On a phone the feed is the board (§5.1's phone order) and its transactions
 * sheet shows the recent rows; the whole list is one tap away (?list=1, a
 * history entry so Back returns) and is what a filter shows, as it always has
 * (a card's "Transactions" lands on /?pm=…). On desktop the board's
 * transactions sheet is the whole list already.
 */
export function listMode({
  desktop,
  filtered,
  asked,
}: {
  desktop: boolean;
  filtered: boolean;
  asked: boolean;
}): boolean {
  return !desktop && (filtered || asked);
}
```

Create `src/features/feed/board/recent-rows.tsx`:

```tsx
import { useMemo } from 'react';

import type { FeedRow } from '@/domain/feed';
import type { Occurrence } from '@/types/domain';

import { DayHeader, TransactionRow, type RowContext } from '../feed-rows';

export function recentRows(rows: readonly FeedRow[], count: number): FeedRow[] {
  const out: FeedRow[] = [];
  let seen = 0;
  for (const row of rows) {
    if (row.kind === 'horizon') continue;
    if (row.kind === 'row') {
      if (seen === count) break;
      seen += 1;
    }
    out.push(row);
  }
  while (out.at(-1)?.kind === 'day') out.pop();
  return out;
}

/** The newest rows on a phone's board: the same rows and headings as the list, not virtualised (eight of them). */
export function RecentRows({
  rows,
  context,
  total,
  onOpen,
  onMenu,
  onCategory,
  onProjected,
}: {
  readonly rows: readonly FeedRow[];
  readonly context: RowContext;
  /** Every row in the month, for each row's position (aria-setsize). */
  readonly total: number;
  readonly onOpen?: (occurrence: Occurrence) => void;
  readonly onMenu?: (occurrence: Occurrence, anchor: HTMLElement) => void;
  readonly onCategory?: (occurrence: Occurrence, anchor: HTMLElement) => void;
  readonly onProjected?: (occurrence: Occurrence, anchor: HTMLElement) => void;
}) {
  const shown = useMemo(() => recentRows(rows, 8), [rows]);
  let position = 0;
  return (
    <div role="list">
      {shown.map((row) => {
        if (row.kind === 'day') {
          return (
            <DayHeader
              key={row.key}
              date={row.date}
              netMinor={row.netMinor}
              isToday={row.isToday}
              currency={context.currency}
            />
          );
        }
        if (row.kind !== 'row') return null;
        position += 1;
        return (
          <TransactionRow
            key={row.key}
            occurrence={row.occurrence}
            context={context}
            position={position}
            setSize={total}
            onOpen={onOpen}
            onMenu={onMenu}
            onCategory={onCategory}
            onProjected={onProjected}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: The phone feed**

In `src/features/feed/feed-screen.tsx`:

```tsx
const [searchParams, setSearchParams] = useSearchParams();
const showList = listMode({
  desktop,
  filtered: hasActiveFilters(filters),
  asked: searchParams.get('list') === '1',
});
const openAll = () => {
  setSearchParams((params) => {
    params.set('list', '1');
    return params;
  });
};
```

- The `TransactionsSheet`'s `list` is the existing `EmptyState` / `VirtualFeed` block when `desktop || showList`, and otherwise `<RecentRows rows={rows} context={context} total={windowCount} onOpen={…} onMenu={…} onCategory={…} onProjected={…} />` with the same four handlers `VirtualFeed` gets; its `onAll` is `desktop || showList ? undefined : openAll`.
- When `showList` is true, render only the `ScreenHead` and the `TransactionsSheet` (inside the `px-3` section), not the `FeedBoard`: the phone's list is today's feed on the concept's sheet.
- The month picker on a phone is in the month sheet (Task 7 passes it); in list mode it goes into the `TransactionsSheet`'s `filterBar` line, before the `FilterBar`, so the month can still be changed there.

In `src/features/summary/collapsed-bar.tsx`, the inner box's `max-w-2xl` becomes `max-w-[105rem]` and the bar's own inline padding follows the content box (`px-3 lg:px-6`), so it spans the board (§5.1, "The collapsed bar spans the content box"). `--feed-sticky-top` keeps its meaning.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project dom src/features/feed src/features/summary`
Expected: PASS.

Run: `pnpm test:e2e`
Expected: PASS after these updates, and only these kinds: a spec that loads the feed at a phone width and then needs rows beyond the newest eight (as `10-feed-scale.spec.ts` does: four thousand rows at 390) opens the list with `&list=1` in its URL (`/?m=${month}-01&list=1`); a spec that counted rows in the phone feed's single list counts them in `[data-slot="transactions-sheet"] [role="list"]`. No assertion is weakened and no test is deleted. List every spec changed in the commit message's body.

- [ ] **Step 5: The gate, the whole feed, and commit**

Run: `pnpm verify` → exit 0.

Run: `pnpm fidelity --grep "@fid-feed-|@fid-shell-desktop"`
Expected: every feed screen passes in both themes:

- `feed-desktop`: the counts within the concept's frame (15 sheets ±1, 8 numerals, 8 marks ±1, 10 hue bars, 8 hue pills ±1, 14 chips ±2, 5 pills ±1, 3 round ±1, 3 day headings ±1, 5 account sheets, 5 card sheets, 9 nav items ±1), every metric in `SHELL`, `BOARD`, `BALANCE`, `MONTH`, `CATEGORIES`, `TRANSACTIONS`, `WALLET`, structure ≥ 0.70, palette ≥ 0.90, at most one of the concept's colours missing from the fold;
- `feed-balance`, `feed-month`, `feed-categories`, `feed-transactions`, `feed-wallet` (still green);
- `feed-phone`: 15 sheets, 8 numerals, 8 marks, 8 hue bars, 5 card and 5 account sheets, 8 hue pills, 3 day headings, 3 round buttons; the 76px head, 12px gutter, 36px radius, 8px gap, numerals 118 / 96 / 92 / 96; all of sapphire, cash, five issuers, four banks, indigo and green on the page; nothing off the palette;
- `feed-empty-desktop` and `feed-empty-phone`: the board's twelve columns and the balance sheet with a ₪0 numeral, no card or account sheets, the empty lines in the categories sheet and the wallet, no sideways scroll (Review Focus 4);
- `feed-board` (1024: the balance in one column, month 5 + categories 7) and `feed-vast` (1920: content box ≥ 1600, the accounts column 520px, the balance 252px) (Review Focus 5);
- `feed-desktop-en` is Task 28's.

Send the user `feed-desktop-light/side-by-side.png`, `feed-desktop-dark/side-by-side.png`, and the phone's `feed-phone-light/app-full.png` and `-dark/app-full.png`. The concept draws no phone feed: on their yes, run `FIDELITY_APPROVE=1 pnpm fidelity --grep "@fid-feed-phone|@fid-feed-empty"` to keep those pictures as goldens, and record the yes in the ledger. Until the yes, the task is BLOCKED, not done.

```bash
git add src/features/feed src/features/summary/collapsed-bar.tsx e2e
git commit -m "The feed is the concept's board on desktop and its sheets in one column on a phone, with the newest rows on the board and the whole list a tap away" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 3b–3i: the other screens

## Task 13: Cards: the summary, a sheet per card, the details pane

The concept's phone Cards screen and its desktop wallet: an ink summary sheet ("leaves the bank this month", the next charge in the box, the month's bills as the huge numeral), then one sheet per card in its company's colour with its bill cut by the corner, sides swapping. The dozen bordered boxes under every card go into a details pane opened by choosing a card (`?card=`), beside the sheets from `@wide` and in the end-side panel below it.

**Files:**

- Create: `src/features/cards/cards-summary.tsx`, `src/features/cards/cards-summary.test.tsx`
- Modify: `src/components/ui/card-sheet.tsx`, `src/components/ui/card-sheet.test.tsx` (open, menu, selected)
- Modify: `src/features/cards/cards-screen.tsx`, `src/features/cards/cards-screen.test.tsx`, `src/features/cards/cards-screen-menu.test.tsx`
- Modify: `e2e/14-cards.spec.ts`, `e2e/card-catalog.spec.ts` (where they read a card's details)

**Interfaces:**

- Consumes: Task 3 `Sheet`, `SheetHead`; Task 4 `CardSheet`, `Numeral`, `Mark`; Task 5 `EditorPanel*`; Task 7 `useMonthBills`, `issuerLabel`; existing `CardMenu`, `MethodEditor`, `HouseholdCommitments`, `OtherMethods`, `ArchivedCards`, `UnfinishedNotice`, `ProfileSwitcher`, `useMediaQuery`.
- Produces:
  - `CardsSummary({ bills: MonthBills | undefined; cardCount: number; accountName: (cardId: string) => string | undefined; currency: Currency })` — `data-slot="cards-summary"`.
  - `CardSheet` gains `onOpen?: () => void`, `openLabel?: string`, `menu?: ReactNode`, `selected?: boolean`.
  - On `/cards`: `?card=<id>` (pushed) chooses a card; `?add=card` opens "Add a card" (the add-card branch takes this over); `[data-slot="card-sheets"]` holds the sheets; `[data-slot="card-details"]` is the pane (from `@wide`). Task 14 fills the pane through `CardDetails`; until then the pane shows the chosen card's existing `CardPanel`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/cards/cards-summary.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MONEY, d } from '@/domain/test-factories';
import { monthBills } from '@/domain/month-bills';
import { renderWithProviders } from '@/test/render';
import type { Occurrence, PaymentMethod } from '@/types/domain';

import { CardsSummary } from './cards-summary';

const card = (id: string, issuer: string, billingDay: number) =>
  ({
    id,
    profileId: 'p',
    type: 'credit_card',
    label: id,
    card: { issuer, billingDay },
    isArchived: 0,
  }) as unknown as PaymentMethod;
const spend = (methodId: string, minor: number) =>
  ({
    key: methodId,
    date: d('2026-09-12'),
    originalDate: d('2026-09-12'),
    paymentMethodId: methodId,
    isSkipped: false,
    isProjected: false,
    categoryId: 'cat.groceries',
    money: { ...MONEY, amountMinor: minor, baseAmountMinor: minor },
    transaction: { kind: 'expense', recurrence: { type: 'one_time' } },
  }) as unknown as Occurrence;

describe('the cards summary', () => {
  it('says what leaves the bank this month as the huge figure, and the next charge in the box with its account', () => {
    const cards = [card('isracard', 'isracard', 2), card('max', 'max', 10)];
    const bills = monthBills(cards, [spend('isracard', 423_700), spend('max', 282_900)], d('2026-10-09'));
    renderWithProviders(
      <CardsSummary
        bills={bills}
        cardCount={2}
        accountName={(id) => (id === 'max' ? 'Leumi' : undefined)}
        currency="ILS"
      />,
    );
    const sheet = document.querySelector('[data-slot="cards-summary"]');
    expect(sheet).toHaveAttribute('data-sheet', 'night');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Leaves the bank this month/);
    expect(sheet?.querySelector('[data-numeral]')).toHaveAttribute('data-numeral-size', 'balance');
    expect(sheet?.querySelector('[data-slot="mark"]')).toHaveTextContent('2,829');
    expect(sheet).toHaveTextContent(/from Leumi/);
  });
});
```

Add to `src/components/ui/card-sheet.test.tsx`:

```tsx
it('opens its card from anywhere on it, keeps its menu reachable, and shows when it is the one chosen', async () => {
  const onOpen = vi.fn();
  renderWithProviders(
    <CardSheet
      moneyKey="issuer-max"
      name="Max"
      onOpen={onOpen}
      openLabel="Details of Max"
      selected
      menu={<button type="button">Options</button>}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Details of Max' }));
  expect(onOpen).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Details of Max' })).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('button', { name: 'Options' })).toBeInTheDocument();
});
```

In `src/features/cards/cards-screen.test.tsx`, add:

```tsx
it('draws a card sheet per card and opens its details by ?card=, from the sheet', async () => {
  // seed two cards as the file's other tests do, render CardsScreen at /cards
  expect(await screen.findAllByRole('article')).toHaveLength(2);
  await userEvent.click(screen.getByRole('button', { name: /^Details of / }));
  expect(await screen.findByRole('img', { name: /ending/ })).toBeInTheDocument(); // the details' card face
});
```

(Seed with the file's own helpers; the `img` is the details' `CardFace`, named "<issuer> ending <last4>".)

Run: `pnpm exec vitest run --project dom src/features/cards src/components/ui/card-sheet.test.tsx`
Expected: FAIL.

- [ ] **Step 2: `CardSheet` opens**

In `src/components/ui/card-sheet.tsx`, add the props and, inside the `article`:

```tsx
{
  onOpen === undefined ? null : (
    // The whole sheet opens its card: a real button its own size, under the menu (§5.3).
    <button
      type="button"
      onClick={onOpen}
      aria-label={openLabel}
      aria-current={selected === true ? 'true' : undefined}
      className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-3 focus-visible:-outline-offset-6 focus-visible:outline-current"
    />
  );
}
```

The text column and the figure get `relative z-[1] pointer-events-none` (the menu inside them `pointer-events-auto`); `menu` renders after the name in a `flex items-start gap-2` row; `selected` adds the concept's selected rings to the article: `shadow-[0_0_0_3px_var(--background),0_0_0_6px_var(--foreground)]`.

- [ ] **Step 3: The summary**

Create `src/features/cards/cards-summary.tsx`:

```tsx
import { Trans, useTranslation } from 'react-i18next';

import { Mark } from '@/components/ui/mark';
import { Numeral } from '@/components/ui/numeral';
import { Sheet, SheetHead } from '@/components/ui/sheet-surface';
import type { MonthBills } from '@/domain/month-bills';
import { formatMoney } from '@/i18n/money-format';
import { formatLocalDate } from '@/lib/dates';
import type { Currency } from '@/types/money';

/**
 * What the cards take from the bank this month (§5.3, the concept's phone):
 * the ink sheet, the next charge in the box with the account it comes from,
 * and the month's bills as the huge numeral (118px on a phone, 252 at 1440).
 */
export function CardsSummary({
  bills,
  cardCount,
  accountName,
  currency,
}: {
  readonly bills: MonthBills | undefined;
  readonly cardCount: number;
  readonly accountName: (cardId: string) => string | undefined;
  readonly currency: Currency;
}) {
  const { t, i18n } = useTranslation('cards');
  const next = bills?.days.find((day) => !day.charged);
  const from =
    next === undefined
      ? undefined
      : next.bills.map((b) => accountName(b.card.id)).find((name) => name !== undefined);
  return (
    <Sheet kind="night" bleed data-slot="cards-summary" className="grid gap-y-1">
      <SheetHead
        size="hero"
        title={t('summary.title')}
        subtitle={t('summary.sub', { cards: cardCount, days: bills?.days.length ?? 0 })}
      />
      {next === undefined ? null : (
        <p className="@board/main:text-lede text-[0.90625rem] leading-[1.7] font-light">
          <Trans
            t={t}
            i18nKey={from === undefined ? 'summary.next' : 'summary.nextFrom'}
            values={{
              amount: formatMoney(next.totalMinor, currency, { locale: i18n.language }).text,
              date: formatLocalDate(next.date, i18n.language, { day: 'numeric', month: 'long' }),
              account: from,
            }}
            components={{ box: <Mark /> }}
          />
        </p>
      )}
      <Numeral minor={bills?.totalMinor ?? 0} currency={currency} size="balance" rounded />
    </Sheet>
  );
}
```

- [ ] **Step 4: The screen**

In `src/features/cards/cards-screen.tsx`, `CardsScreen` returns (keeping every hook, state, `MethodEditor`, `CardMenu` and their handlers as they are):

```tsx
    <section className="px-3 pb-24 lg:px-0 lg:pb-8">
      <ScreenHead
        title={t('title')}
        actions={
          <Button variant="pill-solid" onClick={() => { setEditing('new'); }}>
            {t('common:board.addCard')}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-sheet @board/main:grid-cols-12 @board/main:items-start">
        <div className="@board/main:col-span-12">
          <CardsSummary bills={bills} cardCount={cards.length} accountName={accountName} currency={baseCurrency} />
        </div>
        <div data-slot="card-sheets" className="grid gap-2 @board/main:col-span-12 @wide/main:col-span-7 @vast/main:col-span-8 @vast/main:grid-cols-2">
          {cards.map((card) => (
            <CardSheet
              key={card.id}
              moneyKey={cardKey(card)}
              name={issuerLabel(card, t)}
              holder={data?.profiles.get(card.profileId)?.name ?? t('shared')}
              lastDigits={card.card?.lastDigits}
              billing={card.card?.billingDay === undefined ? undefined : t('billedOn', { day: card.card.billingDay })}
              figure={<Numeral minor={bills?.byCard.get(card.id)?.totalMinor ?? 0} currency={baseCurrency} size="card" rounded />}
              onOpen={() => { openCard(card.id); }}
              openLabel={t('details.open', { name: card.label })}
              selected={chosen?.id === card.id}
              menu={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  data-card-menu={card.id}
                  aria-label={t('cardMenu.label', { name: card.label })}
                  onClick={(event) => { setMenuFor({ card, anchor: event.currentTarget }); }}
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              }
            />
          ))}
        </div>
        <aside data-slot="card-details" className="hidden @wide/main:col-span-5 @wide/main:block @vast/main:col-span-4">
          {chosen === undefined ? (
            <Sheet kind="paper" className="grid gap-4">
              <SheetHead title={t('details.title')} />
              <p className="font-light">{t('details.empty')}</p>
              {counted.length === 0 ? null : <HouseholdCommitments cards={counted} commitments={commitments} />}
            </Sheet>
          ) : (
            details(chosen)
          )}
        </aside>
        <Sheet kind="paper" className="grid gap-5 @board/main:col-span-12 @wide/main:col-span-7">
          <UnfinishedNotice kind="card" />
          {data === undefined ? null : (
            <ProfileSwitcher profiles={[...data.profiles.values()]} active={whose} onSelect={…as today…} />
          )}
          {data === undefined || cards.length > 0 ? null : (/* the empty state, as today, without its dashed box: a heading and a line */)}
          <OtherMethods />
          {archived.length === 0 ? null : <ArchivedCards cards={archived} onMenu={…as today…} />}
        </Sheet>
      </div>
      {wide || chosen === undefined ? null : (
        <EditorPanel open onOpenChange={(open) => { if (!open) closeCard(); }}>
          <EditorPanelContent aria-label={t('details.title')}>
            <EditorPanelHeader>
              <EditorPanelTitle>{chosen.label}</EditorPanelTitle>
            </EditorPanelHeader>
            <EditorPanelBody>{details(chosen)}</EditorPanelBody>
          </EditorPanelContent>
        </EditorPanel>
      )}
      <MethodEditor … as today … />
      <CardMenu … as today … />
    </section>
```

with, above the return:

```tsx
const [params, setParams] = useSearchParams();
const wide = useMediaQuery('(min-width: 83.5rem)'); // main ≥ 1080px beside the 256px rail: @wide
const bills = useMonthBills(today, baseCurrency, whose);
// ?card= chooses a card (Smart import's own ?card= is read only while ?import= is open).
const chosenId = params.get('import') === null ? params.get('card') : null;
const chosen = chosenId === null ? undefined : cards.find((card) => card.id === chosenId);
const openCard = (id: string) => {
  setParams((p) => {
    p.set('card', id);
    return p;
  });
};
const closeCard = () => {
  setParams(
    (p) => {
      p.delete('card');
      return p;
    },
    { replace: true },
  );
};
// A ?card= naming a card that is archived or gone closes, and is removed (§12).
useEffect(() => {
  if (chosenId !== null && data !== undefined && chosen === undefined) closeCard();
}, [chosenId, chosen, data]);
// ?add=card opens "Add a card" (the add-card flow takes this over when it lands).
useEffect(() => {
  if (params.get('add') !== 'card') return;
  setEditing('new');
  setParams(
    (p) => {
      p.delete('add');
      return p;
    },
    { replace: true },
  );
}, [params, setParams]);
const accountName = (cardId: string) => {
  const accountId = cards.find((c) => c.id === cardId)?.card?.accountId;
  const account = accountId === undefined ? undefined : data?.accounts.find((a) => a.id === accountId);
  const bank = account === undefined ? undefined : bankByCode(account.account?.bank ?? '');
  return bank === undefined ? account?.label : bankName(bank, i18n.language);
};
// Task 14 replaces this with <CardDetails/>; until then the chosen card's existing panel.
const details = (card: PaymentMethod) => (
  <CardPanel
    card={card}
    resolved={resolvedCards.get(card.id)}
    owner={data?.profiles.get(card.profileId)}
    occurrences={data?.occurrences ?? []}
    commitments={commitments.get(card.id)}
    today={today}
    baseCurrency={baseCurrency}
    onMenu={(anchor, returnFocus) => {
      setMenuFor({ card, anchor, returnFocus });
    }}
  />
);
```

(Check `useCardsData`'s `accounts` shape — it is listed in its return — and adapt the lookup; the `ul.grid md:grid-cols-2` of `CardPanel`s goes, since each card's panel is now its details.)

- [ ] **Step 5: The browser tests**

In `e2e/14-cards.spec.ts` and `e2e/card-catalog.spec.ts`, every step that read a card's details from the list (its next bill, its limit, its bills, its rates) first opens the card: add at the top of each file

```ts
async function openCard(page: Page, name: RegExp | string): Promise<void> {
  await page.getByRole('button', { name: typeof name === 'string' ? `Details of ${name}` : name }).click();
  await page
    .locator(
      '[data-slot="card-details"] [data-slot="card-face"], [data-slot="editor-panel"] [data-slot="card-face"]',
    )
    .first()
    .waitFor();
}
```

and call it before those reads; the ⋯ menus are found by `data-card-menu` as before. No assertion is removed.

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run --project dom src/features/cards src/components/ui`
Expected: PASS.

Run: `pnpm exec playwright test e2e/14-cards.spec.ts e2e/card-catalog.spec.ts --project=en --project=mobile`
Expected: PASS.

- [ ] **Step 7: The gate, the harness, and commit**

Run: `pnpm verify` → exit 0.

Run: `pnpm fidelity --grep "@fid-cards-"`
Expected: pass in both themes.

- `cards-phone` against the concept's phone: the 76px head with a 44px "+ כרטיס" pill; the summary 366 wide at x 12, radius 36, its numeral 118px ±2% bleeding 4.52 ±1.5px, 8px to the first card; card sheets radius 34, 124 ±2 tall, numerals 92px; 5 sheets, 5 numerals, 5 marks, 1 pill within the frame; structure ≥ 0.70, palette ≥ 0.90; Isracard, Max, Cal and Diners on screen.
- `cards-desktop`: summary 1136 wide, radius 56, numeral 252px; card sheets in a 656px column beside a 464px pane, radius 36, 8px apart, numerals 104px; 5 card sheets, 6 numerals; the five issuers on the page.

Send the user both `cards-phone-*/side-by-side.png` and both `cards-desktop-*/app-full.png`; on their yes for the desktop pictures run `FIDELITY_APPROVE=1 pnpm fidelity --grep "@fid-cards-desktop"`.

```bash
git add src/features/cards src/components/ui/card-sheet.tsx src/components/ui/card-sheet.test.tsx e2e/14-cards.spec.ts e2e/card-catalog.spec.ts
git commit -m "Cards are the concept's sheets: what leaves the bank this month on the ink sheet, one sheet per card in its company's colour with its bill cut by the corner, and a card's details beside them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 14: A card's page: the details pane's content

What used to sit as a dozen bordered boxes under every card becomes one paper sheet for the chosen card: its `CardFace` (the add-card spec's move of the face out of `CardPanel`, §6.4), the next bill and this month so far, the limit, its commitments, its rates and fees, its bills by month, and "Edit card" and "Transactions" as pills. Inner boxes become rows on 2px lines (the audit's "boxes in boxes", worst in dark at 1.41:1).

**Files:**

- Create: `src/features/cards/card-details.tsx`, `src/features/cards/card-details.test.tsx`
- Modify: `src/features/cards/cards-screen.tsx` (moves `CardPanel`'s parts out; `details()` renders `CardDetails`)

**Interfaces:**

- Consumes: Task 13's pane and panel; `CardFace` (`variant="details"`); the existing `LimitBar`, `CardCommitmentsBox`, `ChargesList`, `RateValue`, `FeeStatus`, `BillList`, `NetworkLogo`, `tierName`, `cardBills`, `chargeDate`, `expiryStatus`.
- Produces: `CardDetails({ card, resolved, owner, occurrences, commitments, today, baseCurrency, onEdit, onRates, onClose? })` — a paper sheet `data-slot="card-details-sheet"` holding `[data-slot="card-face"]`.

- [ ] **Step 1: Write the failing test**

Create `src/features/cards/card-details.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { d } from '@/domain/test-factories';
import { renderWithProviders } from '@/test/render';
import type { PaymentMethod } from '@/types/domain';

import { CardDetails } from './card-details';

const max = {
  id: 'max',
  profileId: 'p',
  type: 'credit_card',
  label: 'Max shared',
  card: {
    issuer: 'max',
    network: 'mastercard',
    lastDigits: '0937',
    billingDay: 10,
    creditLimitMinor: 1_500_000,
  },
  isArchived: 0,
} as unknown as PaymentMethod;

describe("a card's details", () => {
  it('shows the card face flat, and edits the card from a solid pill', async () => {
    const onEdit = vi.fn();
    renderWithProviders(
      <CardDetails
        card={max}
        resolved={undefined}
        owner={undefined}
        occurrences={[]}
        commitments={undefined}
        today={d('2026-10-09')}
        baseCurrency="ILS"
        onEdit={onEdit}
        onRates={vi.fn()}
      />,
    );
    const face = screen.getByRole('img', { name: /ending 0937/ });
    expect(face).toHaveAttribute('data-slot', 'card-face');
    expect(face.className).not.toMatch(/-rotate-4/);
    await userEvent.click(screen.getByRole('button', { name: 'Edit card' }));
    expect(onEdit).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Transactions on this card' })).toHaveAttribute(
      'href',
      '/?pm=max',
    );
  });

  it('draws no box inside the sheet: its parts sit on 2px lines', () => {
    const { container } = renderWithProviders(
      <CardDetails
        card={max}
        resolved={undefined}
        owner={undefined}
        occurrences={[]}
        commitments={undefined}
        today={d('2026-10-09')}
        baseCurrency="ILS"
        onEdit={vi.fn()}
        onRates={vi.fn()}
      />,
    );
    expect(container.querySelectorAll('.rounded-xl.border')).toHaveLength(0);
  });
});
```

Run: `pnpm exec vitest run --project dom src/features/cards/card-details.test.tsx`
Expected: FAIL.

- [ ] **Step 2: The details**

Create `src/features/cards/card-details.tsx`: move `CardPanel`'s body out of `cards-screen.tsx` into

```tsx
export function CardDetails({
  card,
  resolved,
  owner,
  occurrences,
  commitments,
  today,
  baseCurrency,
  onEdit,
  onRates,
  onClose,
}: {
  readonly card: PaymentMethod;
  readonly resolved: ResolvedCard | undefined;
  readonly owner: Profile | undefined;
  readonly occurrences: readonly Occurrence[];
  readonly commitments: CardCommitments | undefined;
  readonly today: LocalDate;
  readonly baseCurrency: Currency;
  readonly onEdit: () => void;
  readonly onRates: () => void;
  /** In the pane: a round × back to the list. In the panel the panel's own × does it. */
  readonly onClose?: () => void;
}) {
  // CardPanel's own derivations, moved as they are: tier, day, bills, upcoming, past, next, building, used, limit, expiry.
  return (
    <Sheet kind="paper" data-slot="card-details-sheet" className="grid gap-5">
      <SheetHead
        title={card.label}
        subtitle={[tier, owner?.name].filter(Boolean).join(' · ') || undefined}
        action={
          onClose === undefined ? undefined : (
            <Button variant="round" onClick={onClose} aria-label={t('details.close')}>
              <XIcon aria-hidden="true" />
            </Button>
          )
        }
      />
      <CardFace
        moneyKey={cardKey(card)}
        issuerName={issuerLabel(card, t)}
        holder={owner?.name}
        lastDigits={card.card?.lastDigits}
        network={networkName(card.card?.network)}
        variant="details"
      />
      {/* the expiry warning, as CardPanel had it */}
      {/* next bill / so far: a <dl> of rows on 2px lines, the next bill's figure in a Mark */}
      {/* <LimitBar>, <CardCommitmentsBox>, <ChargesList> with its RateTable rows, <FeeStatus>, <BillList>: moved here unchanged in behaviour */}
      <div className="flex flex-wrap gap-2">
        <Button variant="pill-solid" onClick={onEdit}>
          {t('cardMenu.edit')}
        </Button>
        <Button variant="pill" onClick={onRates}>
          {t('cardMenu.rates')}
        </Button>
        <Button
          variant="pill"
          nativeButton={false}
          render={<Link to={`${ROUTES.feed}?${PARAM.methods}=${encodeURIComponent(card.id)}`} />}
        >
          {t('cardMenu.transactions')}
        </Button>
      </div>
    </Sheet>
  );
}
```

Move `LimitBar`, `CardCommitmentsBox`, `FollowsPrime`, `CommitmentRows`, `ChargesList`, `RateValue`, `FeeStatus`, `BillList` into `card-details.tsx` (exported where another file imports them today: `CardCommitmentsBox` and `ChargesList` are). Their content and test ids stay; their containers change from `rounded-xl border border-border p-3` (and `rounded-2xl border`) to rows: `border-be-2 border-border pb-3` (and the `dl`s' `divide-y` to `[&>*]:border-be-2 [&>*]:border-border`); the limit meter becomes the month sheet's track (`h-3.5 rounded-full border-2 border-current p-0.5`, its fill `bg-current`), keeping its `role="meter"` and name; the bill accordion keeps its buttons and `aria-expanded`. `NetworkLogo` stays in the details as the network row's mark (a row, not the face: decision 36). `networkName(network)` is the network's printed name (Visa, Mastercard, American Express, Diners, Isracard), as `NetworkLogo` names its image.

In `cards-screen.tsx`, `details(card)` renders `<CardDetails … onEdit={() => { setEditing(card); }} onRates={() => { setSection('rates'); setEditing(card); }} onClose={wide ? closeCard : undefined} />`, and `CardPanel` is deleted (its parts now live in `card-details.tsx`).

- [ ] **Step 3: Run the tests**

Run: `pnpm exec vitest run --project dom src/features/cards`
Expected: PASS, the moved components' own tests included (`rate-table`, `cards-screen-menu`, …; update their imports to `./card-details`).

Run: `pnpm exec playwright test e2e/14-cards.spec.ts e2e/card-catalog.spec.ts --project=en --project=mobile`
Expected: PASS.

- [ ] **Step 4: The gate, the harness, and commit**

Run: `pnpm verify` → exit 0 (`knip` later: no export left unused).

Run: `pnpm fidelity --grep "@fid-card-page|@fid-cards-"`
Expected: pass in both themes: the face's radius 22 and at least 300px wide in the pane; Max's colour in the details; on a phone the face in the panel; `cards-*` still green. Send the user both `card-page-desktop-*/app.png` and `card-page-phone-*/app.png`; on their yes run `FIDELITY_APPROVE=1 pnpm fidelity --grep "@fid-card-page"`.

```bash
git add src/features/cards
git commit -m "A card's details are one sheet beside its card: its face, its bills, its limit, its rates and fees, without boxes inside boxes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 15: Cash

The pot as the yellow cash sheet with a 150px total (Count and Withdraw beside it), one paper sheet per person side by side with their amount, when they counted, and Count, Withdraw and Deposit; the moves on a paper sheet with the month's in and out beside it from `@wide`. Every cash behaviour stays: set-up, two starts, count, withdraw, deposit, the cash add menu.

**Files:**

- Create: `src/features/cash/cash-person.tsx`, `src/features/cash/cash-board.test.tsx`
- Modify: `src/features/cash/cash-screen.tsx`, `src/features/cash/activity-list.tsx` (rows on 2px lines), `src/features/cash/setup-card.tsx` (a paper sheet), `src/features/cash/cash-screen.test.tsx`
- Modify: `src/components/add-button.tsx` (no floating Add on desktop on Cash: the rail's Add is there)

**Interfaces:**

- Consumes: Task 11 `CashSheet` (unchanged); Task 3 `Sheet`, `SheetHead`; Task 4 `Numeral` (`account` size for a person's figure); existing `useCashData`, `CashActivityList`, `CashSetupCard`, `TwoStartsNotice`, `ExpectedLine`, `CountSheet`, `CashMoveSheet`, `CashAddMenu`.
- Produces: `CashPerson({ person: Profile; cash: PersonCash; currency; onCount; onWithdraw; onDeposit })` — `data-slot="cash-person"`, a paper sheet; the screen reads `?do=count|withdraw|deposit` (Task 11's links) once, opens that panel for the person in view, and removes the parameter (replace).

- [ ] **Step 1: Write the failing test**

Create `src/features/cash/cash-board.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { d } from '@/domain/test-factories';
import { renderWithProviders } from '@/test/render';
import type { Profile } from '@/types/domain';

import { CashPerson } from './cash-person';

const noa = { id: 'noa', name: 'Noa', color: '#0f766e' } as Profile;

describe("a person's cash", () => {
  it('is a sheet with their amount, when they counted, and the three things they can do', async () => {
    const onDeposit = vi.fn();
    renderWithProviders(
      <CashPerson
        person={noa}
        cash={{ profileId: 'noa', since: d('2026-10-01'), onHandMinor: 50_000, countedOn: d('2026-10-06') }}
        currency="ILS"
        onCount={vi.fn()}
        onWithdraw={vi.fn()}
        onDeposit={onDeposit}
      />,
    );
    const sheet = document.querySelector('[data-slot="cash-person"]');
    expect(sheet).toHaveAttribute('data-sheet', 'paper');
    expect(sheet?.querySelector('[data-numeral-size="account"]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: /Noa/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    expect(onDeposit).toHaveBeenCalled();
    expect(document.querySelectorAll('[data-variant="pill"]')).toHaveLength(3);
  });
});
```

Add to `src/features/cash/cash-screen.test.tsx`: rendering `CashScreen` at `/cash?do=withdraw` (with a person set up, as its other tests do) opens the withdraw panel (`getByRole('dialog', { name: /Withdraw/ })`) and the address loses `do`.

Run: `pnpm exec vitest run --project dom src/features/cash`
Expected: FAIL.

- [ ] **Step 2: A person's sheet**

Create `src/features/cash/cash-person.tsx`:

```tsx
import { useTranslation } from 'react-i18next';

import { PersonAvatar } from '@/components/person-avatar';
import { Button } from '@/components/ui/button';
import { Numeral } from '@/components/ui/numeral';
import { Sheet } from '@/components/ui/sheet-surface';
import type { PersonCash } from '@/domain/cash';
import { formatLocalDate } from '@/lib/dates';
import type { Profile } from '@/types/domain';
import type { Currency } from '@/types/money';

/** One person's cash (§5.5): a paper sheet, sides swapping with the next, their figure and their three actions. */
export function CashPerson({
  person,
  cash,
  currency,
  onCount,
  onWithdraw,
  onDeposit,
}: {
  readonly person: Profile;
  readonly cash: PersonCash;
  readonly currency: Currency;
  readonly onCount: () => void;
  readonly onWithdraw: () => void;
  readonly onDeposit: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Sheet
      kind="paper"
      as="article"
      data-slot="cash-person"
      className="grid content-start gap-4 [&:nth-child(even_of_[data-slot=cash-person])_[data-slot=cash-person-head]]:flex-row-reverse"
    >
      <div data-slot="cash-person-head" className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-3 text-xl leading-[1.1] font-semibold">
          <PersonAvatar person={person} size="rail" />
          <span>
            {person.name}
            <span className="block text-[0.9375rem] font-light">
              {t('cash.counted', {
                date: formatLocalDate(cash.countedOn, i18n.language, { day: 'numeric', month: 'short' }),
              })}
            </span>
          </span>
        </h3>
        <Numeral minor={cash.onHandMinor} currency={currency} size="account" rounded />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="pill" onClick={onCount}>
          {t('board.count')}
        </Button>
        <Button variant="pill" onClick={onWithdraw}>
          {t('board.withdraw')}
        </Button>
        <Button variant="pill" onClick={onDeposit}>
          {t('board.deposit')}
        </Button>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 3: The screen**

In `src/features/cash/cash-screen.tsx` (every hook, handler and overlay stays):

- The section becomes `className="px-3 pb-24 lg:px-0 lg:pb-8"`; `HeroSheet` and `ScreenSheet` go.
- `ScreenHead title={t('cash.title')}` gains `actions` with the `ProfileSwitcher` (it was in the hero; `data-testid="cash-pills"` moves to the wrapper of these actions).
- Below it, a board `div className="grid grid-cols-1 gap-sheet @board/main:grid-cols-12 @board/main:items-start"` with, in order:
  1. `@board/main:col-span-12`: when set up, `<CashSheet summary={data.summary} currency={currency} actions={<><Button variant="pill" onClick={() => setCounting(true)}>{t('board.count')}</Button><Button variant="pill" onClick={() => setMoveTarget({ mode: 'add', kind: 'withdraw' })}>{t('board.withdraw')}</Button></>} />`; the two-starts notices and the set-up cards (each a paper sheet) above it, as before.
  2. One `CashPerson` per set-up person, each in a cell `@board/main:col-span-6 @wide/main:col-span-4 @vast/main:col-span-3`; its actions open the same panels as today for that person (`setCounting(true)` with the person, `setMoveTarget({ mode: 'add', kind: 'withdraw' | 'deposit' })` with the person: if `MoveTarget` and the count sheet take no person yet, keep a `personFor` state that overrides `defaultPerson` for the panel being opened).
  3. `@board/main:col-span-12 @wide/main:col-span-8`: a paper sheet `data-slot="cash-moves"` with `SheetHead title={t('cash.activity')}` and `CashActivityList` (its rows on 2px lines, no bordered boxes).
  4. `@wide/main:col-span-4`: a paper sheet with `SheetHead title={t('categories:screen.thisMonth')}` and `ExpectedLine`.
- On mount, read `?do=` once: `count` → `setCounting(true)`; `withdraw` / `deposit` → `setMoveTarget({ mode: 'add', kind })`; then remove it with `setSearchParams(…, { replace: true })`. Only when someone is set up; otherwise just remove it.

In `src/components/add-button.tsx`, the Cash screen's floating Add is `lg:hidden` (the audit's duplicate: the rail's Add is on every desktop screen; Cash's own menu stays reachable on a phone). Keep its test ids.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project dom src/features/cash src/components` → PASS.
Run: `pnpm exec playwright test e2e/15-cash.spec.ts --project=en --project=mobile` → PASS (update a selector that found the figure inside the hero to `[data-slot="cash-sheet"]`; the test ids `cash-amount`, `cash-counted`, `cash-people` go on the new sheet's figure, its counted line and the people's cells).

- [ ] **Step 5: The gate, the harness, and commit**

Run: `pnpm verify` → exit 0.
Run: `pnpm fidelity --grep "@fid-cash-"`
Expected: pass in both themes: the pot 1136 wide, radius 44 (36 on a phone), its numeral 150px (96 on a phone); people 368 wide 3 across at 1440 with 48px pills; the cash yellow on screen; nothing off the palette. Send the user the four `app-full.png`; on their yes run `FIDELITY_APPROVE=1 pnpm fidelity --grep "@fid-cash-"`.

```bash
git add src/features/cash src/components/add-button.tsx e2e/15-cash.spec.ts
git commit -m "Cash is the yellow cash box with its total as a big figure, a sheet for each person with Count, Withdraw and Deposit, and the moves beside the month" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 16: Categories, with the hue picker

Each row leads with its hue pill, then its monochrome icon, its name in 600 and this month's total as a hue bar; expenses and incomes as two paper sheets side by side from `@wide`; the editor gains the hue picker (two rows of 44px pills, tone A over tone B) that writes `Category.hue`. Business types, archive, edit and delete keep their buttons and names.

**Files:**

- Create: `src/features/settings/hue-picker.tsx`, `src/features/settings/hue-picker.test.tsx`, `src/features/settings/categories-screen.test.tsx`
- Modify: `src/features/settings/categories-screen.tsx`

**Interfaces:**

- Consumes: Task 3 `Sheet`, `SheetHead`, `HuePill`; Task 4 `HueBars`; existing `HUES`, `parseHue`, `categoryHue`, `useCandidates`, `useOccurrences`, `monthWindow`, `totalsByCategory`, `CategoryChip` (the monochrome icon), `BusinessTypesSheet`.
- Produces: `HuePicker({ value: HueToken | undefined; onChange: (hue: HueToken) => void; legend: string })` — a radiogroup of 24 swatches (`forced-color-adjust: none`, the one place colour is what is chosen, §1.8); `[data-slot="categories-expense"]`, `[data-slot="categories-income"]`, `[data-slot="category-row"]`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/settings/hue-picker.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { HuePicker } from './hue-picker';

describe('the hue picker', () => {
  it('offers the twelve hues in two tones as 44px radios, named, and says which is chosen', async () => {
    const onChange = vi.fn();
    renderWithProviders(<HuePicker legend="Colour" value="teal" onChange={onChange} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(24);
    expect(screen.getByRole('radio', { name: 'Teal' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Indigo, deeper' }));
    expect(onChange).toHaveBeenCalledWith('indigo-2');
    expect(radios[0]?.closest('label')?.className).toMatch(/size-11/);
  });
});
```

Create `src/features/settings/categories-screen.test.tsx`: render `CategoriesScreen` with the built-ins seeded and two expenses this month (groceries and rent, via the db helpers the feed's tests use); expect two sheets `[data-slot="categories-expense"]` and `[data-slot="categories-income"]`, every row `[data-slot="category-row"]` with a `[data-slot="hue-pill"]`, two hue bars (`[data-slot="hue-bars"] i[data-hue]`), and the business-types button named `Business types: Groceries` still there; then open the editor of a custom category, choose "Indigo, deeper" and save: the row's hue pill becomes `data-hue="indigo-2"` and the stored row has `hue: 'indigo-2'`.

Run: `pnpm exec vitest run --project dom src/features/settings` → FAIL.

- [ ] **Step 2: The picker**

Create `src/features/settings/hue-picker.tsx`:

```tsx
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { HUES, type HueToken } from '@/domain/category-hue';

/** Two rows of 44px pills, tone A above tone B (§1.4); colour is what is chosen, so forced colours keep it. */
export function HuePicker({
  value,
  onChange,
  legend,
}: {
  readonly value: HueToken | undefined;
  readonly onChange: (hue: HueToken) => void;
  readonly legend: string;
}) {
  const { t } = useTranslation('categories');
  const name = useId();
  const tones: readonly (readonly HueToken[])[] = [HUES, HUES.map((hue) => `${hue}-2` as const)];
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-base font-semibold">{legend}</legend>
      {tones.map((row, r) => (
        <div key={r} className="flex flex-wrap gap-1.5">
          {row.map((hue) => {
            const base = hue.replace(/-2$/, '') as (typeof HUES)[number];
            const label = r === 0 ? t(`hue.names.${base}`) : t('hue.tone2', { name: t(`hue.names.${base}`) });
            return (
              <label
                key={hue}
                title={label}
                className="relative grid size-11 cursor-pointer place-items-center rounded-full has-checked:shadow-[0_0_0_3px_var(--background),0_0_0_6px_var(--foreground)] has-focus-visible:outline-3 has-focus-visible:outline-offset-9 has-focus-visible:outline-ring"
              >
                <input
                  type="radio"
                  name={name}
                  value={hue}
                  checked={value === hue}
                  onChange={() => {
                    onChange(hue);
                  }}
                  aria-label={label}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                <i
                  aria-hidden="true"
                  data-hue={hue}
                  className="block size-8 rounded-full bg-hue [forced-color-adjust:none]"
                />
              </label>
            );
          })}
        </div>
      ))}
    </fieldset>
  );
}
```

- [ ] **Step 3: The screen**

In `src/features/settings/categories-screen.tsx`:

- This month's totals: `const window = monthWindow(today)`, `useCandidates(ALL_PROFILES, window)`, `useOccurrences(…)`, then `totalsByCategory(…, 'expense')` and `(…, 'income')` into a `Map<categoryId, Minor>` per kind.
- The section is `px-3 pb-24 lg:px-0 lg:pb-8`; under `ScreenHead` (actions: the "add" button as `variant="pill-solid"`), a grid `grid gap-sheet @wide/main:grid-cols-2` with two paper sheets, `data-slot="categories-expense"` and `data-slot="categories-income"`, each with `SheetHead title={t('categories:screen.expense' | 'categories:screen.income')}` and its rows. Below `@wide` the `Segmented` kind switch stays and shows one sheet at a time (as today); from `@wide` it is hidden (`@wide/main:hidden`) and both sheets show.
- `CategoryRow` becomes `data-slot="category-row"`: `grid grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,40%)_auto] items-center gap-3 border-be-2 border-border py-2 min-h-16`: `HuePill hue={categoryHue(category)}`, the `CategoryChip` icon as today (monochrome), the name in 600 with "built-in" in 300 under it, `HueBars items={[one item]} currency limit={1}` sized against the largest in that sheet (pass the sheet's largest as a second, hidden-zero item is not allowed: instead render the bar directly with `--bp` and `--bp-max` from the sheet's totals, as `HueBars` does, inside `data-slot="hue-bars"`), and its buttons exactly as today. A category with nothing this month draws no bar (CAN WAIT 20).
- `CategoryEditor` gains `<HuePicker legend={t('categories:hue.label')} value={hue} onChange={setHue} />` under the icon choice; it starts at `categoryHue(category)` (a new one at `leastUsedHue(siblings)`, as the repo already chooses) and saves `hue` in the same patch as the name and the icon.

- [ ] **Step 4: Run, gate, harness, commit**

Run: `pnpm exec vitest run --project dom src/features/settings src/features/business-type` → PASS. Run: `pnpm exec playwright test e2e/16-business-types.spec.ts --project=en` → PASS. Run: `pnpm verify` → exit 0.
Run: `pnpm fidelity --grep "@fid-categories-"`
Expected: pass in both themes: two 560px sheets at 1440; every row's hue pill 40px; 12 hue bars (10 expense, 2 income); the ten spent hues on the page. Send the user the four `app-full.png`; on their yes, `FIDELITY_APPROVE=1 pnpm fidelity --grep "@fid-categories-"`.

```bash
git add src/features/settings
git commit -m "Categories lead with their hue pills and show this month's spending as hue bars, expenses beside income, and a category's colour can be chosen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 17: Chart

The plot on a paper sheet (span 8 from `@wide`, 12 at `@board`), its stats on a paper sheet beside it: in, out and net as figures in marks, the five largest categories as hue bars, the largest and the average month.

**Files:**

- Modify: `src/features/chart/chart-screen.tsx`, `src/features/chart/chart-stats.tsx`, `src/features/chart/chart-stats.test.tsx`

**Interfaces:**

- Consumes: Task 3 `Sheet`, `SheetHead`; Task 4 `HueBars`, `Mark`; Task 6 `MonthCursor tone="bold"`; existing `useChartData`, `SpendChart`, `ChartTable`, `totalsByCategory`, `categoryHue`, `divideMinor`.
- Produces: `[data-slot="chart-sheet"]`, `[data-slot="chart-stats"]`; `ChartStats` keeps its props.

- [ ] **Step 1: The failing test** — add to `src/features/chart/chart-stats.test.tsx`: with the file's chart data fixture, the stats render exactly 3 `[data-slot="mark"]` (in, out, net), a `[data-slot="hue-bars"]` with at most 5 bars (plus "Other" when there are more categories: `limit={5}`), and the largest and average month as rows with their months' names; no `rounded-xl border` box. Run `pnpm exec vitest run --project dom src/features/chart` → FAIL.

- [ ] **Step 2: The stats** — `ChartStats` returns `<Sheet kind="paper" data-slot="chart-stats" className="grid content-start gap-4">` with `SheetHead title={t('chart.stats.title')}`; a `dl` of three rows on 2px lines, each figure in a `Mark` (`signMode="always"` on net); `HueBars items={top} currency limit={5}` built from `totalsByCategory(data.rows, 'expense')` with `categoryHue`; then the largest month (the `data.expense` point with the highest amount; read `ChartPoint` in `src/domain/chart-data.ts` for its amount and month fields) and the average month (`divideMinor(sum of the points' amounts, number of points)` from `src/lib/money.ts`) as two rows. At `@board` below `@wide` the stats lay out in three columns (`@board/main:grid-cols-3 @wide/main:grid-cols-1`).

- [ ] **Step 3: The screen** — section `px-3 pb-24 lg:px-0 lg:pb-8`; `ScreenHead` with actions: the bold `MonthCursor`, the `ProfileSwitcher`, the range `Segmented` (moved from the sheet, unchanged in behaviour); a grid `grid gap-sheet @board/main:grid-cols-12`: `<Sheet kind="paper" data-slot="chart-sheet" className="@board/main:col-span-12 @wide/main:col-span-8 @vast/main:col-span-9">` holding the plot (its LTR island and its bordered box become the sheet itself), the prose legend and notes, and `ChartTable`; `ChartStats` in `@board/main:col-span-12 @wide/main:col-span-4 @vast/main:col-span-3`. The loading skeleton is a sheet-shaped block of the plot's height (no jump); the empty state is a line in the sheet, not a dashed box.

- [ ] **Step 4: Run, gate, harness, commit** — `pnpm exec vitest run --project dom src/features/chart` → PASS; `pnpm verify` → exit 0; `pnpm fidelity --grep "@fid-chart-"` → pass in both themes (plot 752 / stats 368 at 1440; 5 hue bars, 3 marks; indigo and green on the page). Send the four `app-full.png`; on yes approve as above.

```bash
git add src/features/chart
git commit -m "The chart sits on a paper sheet with its numbers beside it: in, out and net in boxes, the largest categories as hue bars" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 18: Commitments

The list beside the totals and the next charges (8 + 4 from `@board`, the list 2 across at `@vast`); rows like the feed's (hue pill, name 600, the next date in 300, amount 500, 2px lines).

**Files:** Modify `src/features/commitments/commitments-screen.tsx`; Create `src/features/commitments/commitments-screen.test.tsx`.

**Interfaces:** Consumes `Sheet`, `SheetHead`, `HuePill`, `Mark`, `categoryHue`, `listCommitments`. Produces `[data-slot="commitments-list"]`, `[data-slot="commitments-totals"]`; `CommitmentRow` keeps its click target and its navigation (`/?m=…&edit=…&at=…`).

- [ ] **Step 1: The failing test** — create `commitments-screen.test.tsx`: seed a monthly rent and a monthly salary (db helpers), render at `/commitments`; expect `[data-slot="commitments-list"]` and `[data-slot="commitments-totals"]` paper sheets, each row with a `[data-slot="hue-pill"]` of its category's hue, the monthly out and in figures each in a `Mark`, a "Next charges" list of at most 5 rows ordered by date, no `Card` component left; clicking the rent row navigates to `/?m=…&edit=<id>&at=…` (as today). Run → FAIL.
- [ ] **Step 2: The screen** — section `px-3 pb-24 lg:px-0 lg:pb-8`; a grid `grid gap-sheet @board/main:grid-cols-12`: the list sheet `@board/main:col-span-8` (its `ul` `@vast/main:grid-cols-2 @vast/main:gap-x-8`, each `CommitmentRow` led by `HuePill hue={category === undefined ? undefined : categoryHue(category)}` with its existing content on the feed rows' sizes); the totals sheet `@board/main:col-span-4` with `SheetHead title={t('commitments.byKind')}`, the monthly out and in rows (figures in `Mark`), then `t('commitments.nextCharges')` and the 5 soonest commitments by `next.date`. The `Card`, `CardHeader`, `CardContent` imports go.
- [ ] **Step 3: Run, gate, harness, commit** — `pnpm exec vitest run --project dom src/features/commitments` → PASS; `pnpm verify` → exit 0; `pnpm fidelity --grep "@fid-commitments-"` → pass both themes (list 752, totals 368 at 1440; radius 36 on a phone). Send the pictures; approve on yes.

```bash
git add src/features/commitments
git commit -m "Commitments are a list of hue-led rows beside their monthly totals and the next charges" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 19: Bank accounts

One sheet per account in its bank's colour (the audit: today a bordered box with a 4px red edge): name 600, branch and mask 300, its holders, the income that goes to it with its figure in the box, the card charges it carries, and Edit as a pill; 2 across at `@board`, 3 at `@wide`, 4 at `@vast`. No logo on a sheet (decision 36).

**Files:** Modify `src/features/bank-accounts/bank-accounts-screen.tsx`, `src/features/bank-accounts/bank-accounts-screen.test.tsx`.

**Interfaces:** Consumes `Sheet`, `SheetHead`, `Mark`, `methodKey`, `bankByCode`, `bankName`, `useIncoming`, `useBranch`. Produces `[data-slot="bank-account-sheet"]` (an `article` named by its `h2#account-<id>`, as today).

- [ ] **Step 1: The failing test** — add to `bank-accounts-screen.test.tsx`: each account renders as `[data-slot="bank-account-sheet"]` with `data-sheet="money"` and `data-money="bank-<code>"` (Hapoalim → `bank-12`); its next income's amount is inside a `[data-slot="mark"]`; it contains no `img` (no logo) and no `[data-slot="account-accent"]`; "Edit" is a `pill` button with the same name as today. Run → FAIL.
- [ ] **Step 2: The screen** — section `px-3 pb-24 lg:px-0 lg:pb-8`; `ScreenHead` with the "add" button as `pill-solid` and the `ProfileSwitcher` in its actions; `UnfinishedNotice` on a paper sheet when present; a grid `grid gap-sheet @board/main:grid-cols-2 @wide/main:grid-cols-3 @vast/main:grid-cols-4` of `AccountPanel`s, each now `<Sheet as="article" kind="money" moneyKey={methodKey(account)} data-slot="bank-account-sheet" aria-labelledby={titleId} className="grid content-start gap-3">`: the title pair (bank name 600 / the account's label and `BranchName` in 300), holders (house-palette avatars), overdraft as a row, `CardCharge` rows and the `IncomingLine` on 2px tint lines with the next income's figure wrapped in `Mark`, and the edit button `variant="pill"`. The accent span, `BankMark` and the bordered `article` classes go.
- [ ] **Step 3: Run, gate, harness, commit** — `pnpm exec vitest run --project dom src/features/bank-accounts` → PASS; `pnpm verify` → exit 0; `pnpm fidelity --grep "@fid-bank-accounts-"` → pass both themes (368 wide 3 across at 1440, radius 56 / 36; Leumi, Discount, Mizrahi and Hapoalim colours on the page; ≥ 4 marks). Send the four pictures; approve on yes.

```bash
git add src/features/bank-accounts
git commit -m "Each bank account is a sheet in its bank's colour with the money coming into it in the box, three across on a wide screen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 20: Settings in two panes

From `@board` the subjects are a paper sheet of 48px nav pills (span 4) beside the open subject on a paper sheet (span 8); `/settings` on desktop becomes the first subject (replace), and resizing follows; on a phone `/settings` stays the list and a subject keeps its back link (§5.7). The parked 44px pass on Account linking's buttons is done here (§10).

**Files:**

- Create: `src/features/settings/settings-layout.tsx`, `src/features/settings/settings-layout.test.tsx`
- Modify: `src/app/app-routes.tsx` (nested `/settings` routes), `src/features/settings/settings-screen.tsx`, `src/features/settings/settings-page.tsx`, `src/features/household/household-screen.tsx`, `src/features/household/link-screen.tsx` (44px buttons)

**Interfaces:** Consumes `useSettingsSections`, `useDesktop`, `Sheet`, `SheetHead`, `ScreenHead`. Produces `SettingsLayout` (an `Outlet` host: `[data-slot="settings-subjects"]` + `[data-slot="settings-subject"]` from `@board`), `SettingsIndex` (desktop: `<Navigate replace to={first subject} />`; phone: `SettingsScreen`).

- [ ] **Step 1: The failing test** — `settings-layout.test.tsx` (the spec's §13.2 DOM test): with `matchMedia` stubbed to match `(min-width: 64rem)`, rendering the routes at `/settings` lands on the first subject's path (account when signed in, else preferences) with the subjects sheet showing the current one as `aria-current="page"`; with it not matching, `/settings` shows the list (`[data-slot="settings-subjects"]`) and no subject pane; a subject page at phone width shows its back link, at desktop width not. Run → FAIL.
- [ ] **Step 2: The layout** — `SettingsLayout`: on desktop, `ScreenHead title={t('settings.title')}` then `grid gap-sheet @board/main:grid-cols-12` with `<Sheet kind="paper" as="div" data-slot="settings-subjects" className="@board/main:col-span-4">` holding a `nav` of `NavLink`s (the rail's pill classes: 48px, the current one ink-filled in 600) for `[...sections.account, ...sections.app]`, and `<div data-slot="settings-subject" className="@board/main:col-span-8"><Outlet /></div>`; on a phone, just `<Outlet />`. `SettingsPage` renders its title pair and body on `<Sheet kind="paper" className="grid gap-4">` (`SheetHead` with the description as its subtitle); its `ScreenHead` with the back link renders only below `lg` (`lg:hidden` wrapper), since the layout's head and subjects stand in for it. `SettingsScreen` (the phone list) becomes the same subjects sheet with each link a 48px-or-taller row (label 600, hint 300), `data-slot="settings-subjects"`.
- [ ] **Step 3: The routes** — in `app-routes.tsx`, `/settings` becomes `{ path: 'settings', element: <SettingsLayout />, children: [{ index: true, element: <SettingsIndex /> }, { path: 'account', … }, { path: 'linking', … }, { path: 'security', … }, { path: 'preferences', … }, { path: 'data', … }] }`, each child the element it has today. `/household` and `/profiles` keep redirecting to `/settings/linking`.
- [ ] **Step 4: 44px** — in `household-screen.tsx` and `link-screen.tsx`, every `Button` with `size="sm"` or the default `h-8` becomes `variant="pill"` (or `pill-solid` for the screen's one primary action); icon-only buttons become `size="icon"` with `className="size-11"`.
- [ ] **Step 5: Run, gate, harness, commit** — `pnpm exec vitest run --project dom src/features/settings src/features/household src/app` → PASS; `pnpm exec playwright test e2e/12-account.spec.ts e2e/delete-data.spec.ts --project=en` → PASS (update a step that expected `/settings` to stay the list at desktop width); `pnpm verify` → exit 0; `pnpm fidelity --grep "@fid-settings-"` → pass both themes (subjects 368 and subject 752 at 1440, pills 48px; the phone list rows ≥ 48px). Send the pictures; approve on yes.

```bash
git add src/features/settings src/features/household src/app/app-routes.tsx
git commit -m "Settings open as two panes on desktop, the subjects beside the one that is open, and every button in Account linking is a full-size target" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 21: The add-transaction panel, Smart import's steps and preview, and the add-card slot

The panel's body in the concept's language (48px fields with the 2px `--input` edge on the tile radius, segmented choices as 44px pills, the title pair 30/21), Smart import as the concept's three-pane pop-out (§5.9: steps "Choose the files", "Review", "Finish the cards"; the found card in the ink preview sheet), and the add-card flow's place reserved.

**Files:**

- Modify: `src/features/transaction/transaction-sheet.tsx` (fields and segmented controls only), `src/components/segmented.tsx` (a `pill` look), `src/components/segmented.test.tsx`
- Create: `src/features/import/import-steps.tsx`, `src/features/import/import-steps.test.tsx`
- Modify: `src/features/import/import-sheet.tsx` (its wrapper: `PopOutSteps`, `PopOutBody` with `heading="question"` and `footer`, `PopOutPreview`)
- Modify: `src/components/ui/pop-out.tsx` (the footer's pills 52px, as the concept's wizard footer)

**Interfaces:**

- Consumes: Task 5 `PopOutBody` footer; existing `PopOut`, `PopOutSteps`, `PopOutPreview`, `CardFace`, `Segmented`, the import stages (`Picker`, `Reading`, `Review`, `found-methods-list`), `KindChoice`.
- Produces: `importStep(stage): 0 | 1 | 2` mapping the import's stages onto the three steps; `ImportPreview({ found })` drawing the selected found card as a `CardFace` (`variant="preview"`) and a sample row (hue pill and company chip), or `t('import:preview.empty')`. The reserved harness screens `popout-add-card-desktop` and `add-card-phone` (Task 1) stay skipped; the add-card branch, when it lands, removes their `reserved` and must pass them against the concept's `.deskmodal` and second `.phone`.

- [ ] **Step 1: The failing tests** — `import-steps.test.tsx`: `importStep('picker') === 0`, `'reading' === 0`, `'review' === 1`, `'methods' === 2` (use the stage names `import-sheet.tsx` uses); rendering the import pop-out at 1140px container width shows `PopOutSteps` with 3 steps, the current one `aria-current="step"`, the Expenses / Income / Both switch (`import:kindLabel`) still in the body with its three options, and `[data-slot="popout-preview"]`. `segmented.test.tsx`: `Segmented` with `look="pill"` renders 44px options, the chosen one ink-filled (`bg-press text-on-press`), still a radiogroup. Run → FAIL.
- [ ] **Step 2: Segmented as pills** — `Segmented` gains `look?: 'band' | 'pill'` (default `band`, today's look, so no other screen changes): `pill` draws each option as a 44px 2px-outline pill, the chosen one `bg-press text-on-press border-press`, the group `flex flex-wrap gap-1.5`. The transaction form's segmented choices (kind, standing-via, the scope chooser) use `look="pill"`; its inputs get `min-h-12 rounded-tile border-2 border-input` (their `max(16px,1rem)` text stays).
- [ ] **Step 3: Smart import's panes** — in `import-sheet.tsx`, the `PopOutContent` holds `PopOutSteps title={t('import:steps.title')} steps={[t('import:steps.choose'), t('import:steps.review'), t('import:steps.cards')]} current={importStep(stage)} reached={…the furthest stage reached…} onStep={…go back to a reached stage, as the stage's own Back does…}`, then `PopOutBody heading="question" title={…the stage's title…} footer={…the stage's actions as pill / pill-solid…}` with the stage's body unchanged (the kind switch, the drop zone, the rows, the found methods), then `PopOutPreview title={t('import:preview.title')} subtitle={t('import:preview.subtitle')}` with `ImportPreview`. Do not re-indent the stage bodies (CAN WAIT 3: keep the diff to the wrapper, so other import branches merge). In `pop-out.tsx`, the footer's children get `min-h-13` (`[&>*]:min-h-13`): the concept's wizard footer pills are 52px.
- [ ] **Step 4: Run, gate, harness, commit** — `pnpm exec vitest run --project dom src/features/import src/features/transaction src/components` → PASS (every import test, the kind switch's included); `pnpm exec playwright test e2e/19-popout.spec.ts e2e/02-transaction-type.spec.ts --project=en` → PASS; `pnpm verify` → exit 0; `pnpm fidelity --grep "@fid-panel-add|@fid-popout-"` → `panel-add-*` still pass; `popout-import-desktop` passes against the concept's dialog (1140×732, radius 64, 3 panes, steps 232, preview 360 with radius 52, the question 48px, footer pills 52 ±1); the two add-card screens report skipped.

```bash
git add src/features/transaction src/features/import src/components
git commit -m "The add-transaction panel speaks the concept's language and Smart import opens as its three-pane pop-out, with its steps and the card it found" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Empty accounts, the front door, and the emails

The concept is drawn full of a household's money, but a new person lands on an empty account. These four tasks (added at the user's request, 2026-10-10) give every screen an empty state in the same bold style, bring the first run and the front door (sign-in, second step, security, linking, wipe, the account sheet) into the Bold sheets look, and rebuild the auth emails to match. They follow the same discipline: an approved picture first, the harness as the gate.

**A rule for these four tasks only:** they may append new entries to `e2e/fidelity/screens.ts` and add the small switches in `run.ts`, `config.ts` and `concept.ts` named below. They never change an existing entry or threshold.

## Task 22: The empty concept, and the harness's empty screens

There is no approved picture of an empty account, so one is drawn first, in the concept's own file format and vocabulary, and the user approves it before any screen is built to it.

**Files:**

- Create (git-ignored, in the main checkout, beside the approved concept): `C:/dev/greenback/.superpowers/concepts-2026-10-09/money-sheets-bold-empty.html`; copy to `~/.bookandry-private/design-audit/concept-source/money-sheets-bold-empty.html`
- Modify: `e2e/fidelity/config.ts` (`CONCEPT_EMPTY_FILE`, `CONCEPT_EMPTY_SHA256`), `e2e/fidelity/concept.ts` (`openConcept(browser, theme, which: 'full' | 'empty' = 'full')`), `e2e/fidelity/screens.ts` (`concept?: … & { readonly source?: 'empty' }` and the new entries), `e2e/fidelity/run.ts` (passes `source` to `openConcept`)

**Interfaces:**

- Produces: the empty concept, with frames `.desk` (the empty desktop home), `.phone` #0 (the empty phone feed), `.phone` #1 (the empty Cards), and one `.sheet[data-empty="<screen>"]` per other screen (Cash, Categories, Chart, Commitments, Bank accounts, Settings' data subject); harness screens `feed-empty-desktop`, `feed-empty-phone` (now against the empty concept), `cards-empty-phone`, `cash-empty`, `categories-empty`, `chart-empty`, `commitments-empty`, `bank-accounts-empty`, `first-run-phone`, `first-run-desktop`.

- [ ] **Step 1: Draw the empty concept**

Start from a copy of `money-sheets-bold-v2.html` (its `<style>` unchanged, so every atom is the concept's), and replace the page body with these frames, in Hebrew, light and dark through the same theme buttons:

- **Desktop home, empty** (`.desk`, the same rail with counts 0 and the solid Add pill): the top bar "בוקר טוב, אני" with the date, search and month picker; the ink balance sheet with the title pair, a warm lede ("כאן יופיע כל הכסף של משק הבית. מתחילים ממה שיש היום.") with one mark, and the **numeral ₪0** at 252px with the same bleed; its account column as **three ghost account sheets** (`.acct` with `--c` at `color-mix(in oklch, var(--leumi) 18%, var(--night))`, `var(--hapoalim)`, `var(--cash)` the same way, a 2px dashed tint edge, the names "הבנק שלך", "כרטיס האשראי", "מזומן" and no figure) and one **solid primary pill** "+ הוספת חשבון בנק"; the sapphire month sheet with in ₪0 / out ₪0, an empty track, the note "החודש עוד לא התחיל לספר" and **₪0** at 168px; the categories sheet with **five ghost hue bars** (the first five hues at 35% strength, decreasing lengths 100/70/50/35/20%, names in 300 "שכר דירה", "מצרכים", "אוכל בחוץ", "תחבורה", "חשבונות בית", amounts "—") and its pill; the transactions sheet with **three ghost rows** (hue pills at 35%, merchant lines as 2px-tall rounded bars, chips as empty company-colour outlines) and two pills: solid "+ הוצאה ראשונה" and outline "ייבוא חכם"; the wallet with **two ghost card sheets** (Isracard and Max at 22% over the paper, the 104px figure "₪0") and the cash sheet with "₪0" and its pills.
- **Phone feed, empty** (`.phone` #0): the same sheets in one column, 8px apart, with the 76px "תנועות" head.
- **Phone Cards, empty** (`.phone` #1): the ink summary with "₪0" at 118px and the line "כשתוסיפו כרטיס, נראה כאן כמה יורד מהבנק בכל חודש", then three ghost card sheets in Isracard, Max and Cal at 22% with "+ כרטיס" as the head's solid pill.
- **One sheet per other screen** (`data-empty="cash" | "categories" | "chart" | "commitments" | "bank-accounts" | "settings-data"`), each 1136 wide: its kind (cash yellow; paper; paper; paper; a ghost bank sheet; paper), its title pair, a warm headline in 600, a 300 line saying what will appear, its numeral at 0 where the full screen has one (cash 150px), its ghost marks (hue bars, hue pills, chips) at 35%, and **one** solid pill with the screen's first action ("ספירת המזומן", "קטגוריה חדשה", "הוספת הוצאה", "הוספת הוראת קבע", "הוספת חשבון בנק", "ייבוא גיבוי").

Ghosts use only the concept's tokens mixed in OKLCH (never a new colour), so they read as the household's future colours, not as grey. Text on every ghost meets AA (the ghost is a background tint; the text stays the sheet's tint).

- [ ] **Step 2: The user approves it**

Shoot it with the harness's concept opener (both themes, 1504 wide) into `~/.bookandry-private/design-audit/concept/empty-*.png` and send the user the desktop home, both phones and the six sheets, in light and dark. Stop until they say yes or ask for changes; record the yes and the file's sha256 in the ledger.

- [ ] **Step 3: The harness learns the empty concept**

`config.ts`: `CONCEPT_EMPTY_FILE` (beside `CONCEPT_FILE`) and `CONCEPT_EMPTY_SHA256` (the approved hash). `concept.ts`: `openConcept(browser, theme, which = 'full')` picks the file and the hash. `screens.ts`: `ConceptFrame` objects may carry `source: 'empty'`; `run.ts` opens the concept named by the screen's frame. Then replace the two existing empty entries' frames and append the new ones (all with `state: 'empty'`):

```ts
  { id: 'feed-empty-desktop', size: 'desktop', route: '/', state: 'empty', concept: { kind: 'desk', source: 'empty' }, metrics: [...SHELL, ...BOARD] },
  { id: 'feed-empty-phone', size: 'phone', route: '/', state: 'empty', concept: { kind: 'phone', index: 0, source: 'empty' }, metrics: [want('screen name', S.head, 'fontSize', 76, 0.5), want('sheet radius', S.balance, 'radius', 36, 1)] },
  { id: 'cards-empty-phone', size: 'phone', route: '/cards', state: 'empty', concept: { kind: 'phone', index: 1, source: 'empty' }, metrics: [pair('summary numeral', '.ph-sum .mega', '[data-slot="cards-summary"] [data-numeral]', 'fontSize', 0.02, REL)] },
  ...(['cash', 'categories', 'chart', 'commitments', 'bank-accounts'] as const).map((name) => ({
    id: `${name}-empty`,
    size: 'desktop' as const,
    route: `/${name}`,
    state: 'empty' as const,
    concept: { kind: 'element' as const, selector: `[data-empty="${name}"]`, source: 'empty' as const },
    appScope: `[data-empty="${name}"]`,
    metrics: [],
  })),
```

(Ghost marks count: the empty concept's ghost bars, pills and chips carry the same classes as the full ones, so the inventory counts them, and the app's ghosts carry the same `data-slot`s plus `data-ghost=""`.)

- [ ] **Step 4: The baseline, and commit**

Run: `pnpm fidelity --grep "@fid-[a-z-]*-empty"` → every empty screen fails today (the app has no empty states in this style). Record the run.

```bash
git add e2e/fidelity
git commit -m "The fidelity harness also measures every screen of an empty account, against an approved empty version of the concept" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 23: Empty states on every screen, and the first run

Every screen of a new account looks like the empty concept: numerals at ₪0 with the same bleed, the household's future colours as ghosts (bars, pills, chips, card and account sheets), a warm headline, and one clear primary action. The first-run wizard comes into the same look.

**Files:**

- Create: `src/components/ui/ghost.tsx` (`GhostBars`, `GhostRows`, `GhostSheet`), `src/components/ui/ghost.test.tsx`
- Modify: the feed's sheets (`balance-sheet.tsx`'s caller, `month-sheet.tsx`, `categories-sheet.tsx`, `transactions-sheet.tsx`, `wallet-column.tsx`), `src/features/feed/empty-state.tsx`, `cards-screen.tsx`, `cash-screen.tsx`, `setup-card.tsx`, `categories-screen.tsx`, `chart-screen.tsx`, `commitments-screen.tsx`, `bank-accounts-screen.tsx`, `data-screen.tsx`
- Modify: `src/features/first-run/first-run.tsx`, `step-locale.tsx`, `step-balance.tsx`; strings in `src/i18n/locales/{en,he}/common.json` (`empty.*`)

**Interfaces:**

- Produces: `GhostSheet({ moneyKey?: MoneyKey; kind: SheetKind; strength?: 18 | 22 | 35; children })` (a `Sheet` whose fill is the key's colour mixed into its surround, `data-ghost=""`, a 2px dashed tint edge); `GhostBars({ count: number })` (hue bars at 35%, lengths 100/70/50/35/20%, names "—"); `GhostRows({ count: number })` (rows with 35% hue pills, 2px bars for text, outline chips). Each ghost is `aria-hidden`; the real words beside it say what will appear.
- Strings (en and he, one headline, one line and one action per screen): `empty.feed.*`, `empty.cards.*`, `empty.cash.*`, `empty.categories.*`, `empty.chart.*`, `empty.commitments.*`, `empty.accounts.*`, `empty.data.*`, `empty.firstRun.*`, using the Hebrew copy of the approved empty concept and its plain English.

- [ ] **Step 1: Write the failing tests** — `ghost.test.tsx`: `GhostSheet moneyKey="issuer-max"` renders `data-ghost`, `data-sheet="money"`, `aria-hidden="true"`; `GhostBars count={5}` draws five `i[data-hue]` with `--bp` 10000, 7000, 5000, 3500, 2000; `GhostRows count={3}` draws three rows each with a `[data-slot="hue-pill"]`. For each screen, add one DOM test to its existing test file (or the board's): with no data, it shows its headline, its `[data-numeral]` reading ₪0 where the full screen has a numeral, its ghosts, and exactly one `pill-solid` whose name is its first action, and that action does what it says (opens Add expense, Add a card, Count my cash, New category, the import, Add a bank account). Run → FAIL.
- [ ] **Step 2: The ghosts** — `ghost.tsx` builds on `Sheet`: its fill is `color-mix(in oklch, var(--money-<key>) <strength>%, var(--paper-sheet))` on paper (or `var(--night)` on the ink sheet), set through `data-money` plus a `[data-ghost]` rule in `src/index.css` (`--fill: color-mix(in oklch, var(--fill-full) var(--ghost, 22%), var(--surround))`; add it beside the `[data-money]` mapping; this is the one `index.css` change outside Task 2, allowed here). Text on a ghost keeps the surround's ink: contrast stays the sheet's.
- [ ] **Step 3: Every screen** — when a screen has nothing to show, it renders its sheets with zeros and ghosts instead of hiding them: the feed's balance numeral at ₪0, three ghost account sheets and "+ Add a bank account"; the month at ₪0; `GhostBars` in categories; `GhostRows` with "+ First expense" (solid) and "Smart import" (outline) in transactions; two ghost card sheets and the cash sheet at ₪0 in the wallet. Cards, Cash (the set-up card becomes the yellow cash sheet with ₪0 and the count form as its body), Categories, Chart, Commitments, Bank accounts and Settings → Data follow their sheet in the empty concept, each with its one solid action. Existing empty texts (`feed.emptyNoData*`, `cards:emptyTitle`, …) stay where tests read them, inside the new layout.
- [ ] **Step 4: The first run** — `first-run.tsx` and its steps sit on the paper with the concept's atoms: the mark and the 76px Karantina "Bookandry" head on a phone (38/21 title pair on desktop, centred column of `@board` width), each step a paper sheet with its question as the pop-out's question pair (32/19, 48/24), choices as 70px tiles (`MoneyTile` for the currency, plain tiles for the language), the progress segments, and Back / Continue as 52px pills; "Load demo data" a switch in the sheet. Every label and test id stays (`completeFirstRun` in `e2e/support/seed.ts` must still work untouched). Add harness entries `first-run-phone` and `first-run-desktop` (frameless, `state` none: a fresh context) with metrics: tiles ≥ 70px, pills 52px, head 76px on a phone.
- [ ] **Step 5: Run, gate, harness, commit** — `pnpm exec vitest run --project dom` → PASS; `pnpm test:e2e` → PASS; `pnpm verify` → exit 0; `pnpm fidelity --grep "@fid-[a-z-]*-empty|@fid-first-run"` → every empty screen passes against the empty concept (counts, numerals at the concept's sizes, structure ≥ 0.70, palette ≥ 0.90, colours) and the first run's metrics pass; send the user the empty side-by-sides and the first run's pictures, approve the first run's goldens on their yes.

```bash
git add src e2e/fidelity
git commit -m "A new account looks as bold as a full one: every screen shows its zeros as big figures, its future colours as ghosts, a warm line and one clear first step, and the first run speaks the same language" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 24: The front door and the account screens

The sign-in front door still wears the old engraved navy panel (the spec left its layout out of scope; the user has now asked for it). Welcome, the auth frame, the second step, security, account linking (link), wipe, and the account sheet and card are rebuilt in the Bold sheets look, light and dark, Hebrew and English.

**Files:**

- Modify: `src/features/account/auth-layout.tsx`, `welcome-screen.tsx`, `second-step.tsx`, `security-screen.tsx`, `account-sheet.tsx`, `account-card.tsx`, `src/features/household/link-screen.tsx`, `wipe-screen.tsx`, their tests; `src/index.css` only to retire the `.front-door` and engraving rules once nothing uses them (with `Engraving` and `BrandPanel` deleted if `knip` reports them unused)
- Modify: `e2e/fidelity/screens.ts` (append), `e2e/fidelity/run.ts` (a screen may name `server: 'account'`: base URL `http://localhost:4174`, no storage state)

**Interfaces:**

- Produces: `AuthLayout` as the concept's page: the paper with its grain; on desktop two columns: an ink sheet (radius 56) on the reading-start side with the mark, the 17rem Karantina "Bookandry" (the concept's `.variant-name`), the one-line promise in 300, and three small money sheets fanned at −1.2° / +1° (Leumi, Max, cash, decorative, `aria-hidden`); the form on a paper sheet beside it; on a phone the ink sheet as a band with the 76px name and the form sheet 8px under it. Theme and language switches as 44px outline pills. Forms: fields 48px on the tile radius with the 2px `--input` edge, the primary action a solid pill, providers as outline pills.
- Harness entries (frameless, both sizes and themes, Hebrew and English): `welcome-*` and `second-step-*` on the account build (`server: 'account'`, signed out); `security-*`, `link-*` and `wipe-*` on the local build at `/settings/security`, `/link` and `/wipe` with the household state (a test cannot sign in); each with metrics: the name ≥ 120px Karantina on desktop and 76px on a phone, fields 48px, pills ≥ 44 / 48px, the ink sheet radius 56 / 36; `mustShow`: `night` (dark) and `sapphire`, and Leumi, Max and cash from the fanned sheets.

- [ ] **Step 1: The failing tests** — in each screen's test file: the layout renders an ink sheet (`[data-sheet="night"]`) with the Karantina name and an `aria-hidden` fan of three `[data-sheet="money"]`; the primary action is `data-variant="pill-solid"`; every input is `min-h-12`; no `bg-brand-deep` or `Engraving` remains. Run → FAIL.
- [ ] **Step 2: Build** — as Interfaces says, keeping every form, handler, validation, provider button and test id. `second-step.tsx`'s choice of second factor becomes tiles; `wipe-screen.tsx`'s destructive confirm keeps its `destructive` variant as a solid pill on an ink-edged paper sheet; `link-screen.tsx`'s invite flow keeps its steps as `PopOutSteps`-style pills inside the sheet.
- [ ] **Step 3: Run, gate, harness, commit** — `pnpm exec vitest run --project dom src/features/account src/features/household` → PASS; `pnpm exec playwright test e2e/12-account.spec.ts e2e/13-https.spec.ts --project=en` → PASS; `pnpm verify` → exit 0; `pnpm fidelity --grep "@fid-(welcome|second-step|security|link|wipe)"` → pass; send the user every picture (light, dark, he, en, phone, desktop) and approve goldens on their yes.

```bash
git add src/features/account src/features/household src/index.css src/components e2e/fidelity
git commit -m "The way in is the app's own Bold sheets page: the ink sheet with the big name and a fan of money colours beside the form, in both themes and both languages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 25: The emails

The account emails (confirm sign-up, reset password, and the household invite sent by the `send-invite` Edge Function) match the new look: paper, ink, sapphire, a heavy display wordmark, Hebrew RTL and English, safe in dark-mode mail clients.

**Files:**

- Modify: `scripts/emails.mjs` (the builder; it already reads the app's tokens and writes `public/email/*.png` and `supabase/templates/*.html`)
- Modify: `supabase/functions/send-invite/` (its email body, if it carries its own HTML; reuse the builder's output)
- Create: `scripts/email-preview.mjs` (render check)
- Outputs: `supabase/templates/confirm-signup.html`, `reset-password.html` (+ `.subject.txt`), `public/email/header.png` (rebuilt), `public/email/numerals.png` if used

**Interfaces:**

- The builder writes table-based HTML with inline styles only: a 600px table on the paper colour; the header image is the mark and "Bookandry" set in Karantina 700 by Playwright into a PNG (2x, with `alt="Bookandry"` and `width`/`height` set), because mail clients strip web fonts; headlines in a heavy system stack (`font-family: 'Arial Black', 'Helvetica Neue', Arial, sans-serif; font-weight: 900`), body text `Arial, Helvetica, sans-serif`; the action as a sapphire "pill" (a bulletproof table-cell button, 48px, radius 999px, white text at ≥ 4.5:1); an ink "sheet" block (radius 32) for the code or the link; Hebrew in `dir="rtl"` with `text-align: right`, English LTR, chosen per account as today (`printf "%v"` on `user_metadata.language`).
- Dark-mode safety: `<meta name="color-scheme" content="light dark">` and `supported-color-schemes`; colours chosen so an auto-inverting client still reads (ink on paper and paper on ink both ≥ 7:1); a `@media (prefers-color-scheme: dark)` block for clients that honour it, swapping to the concept's dark paper and ink; the header PNG has a transparent background and is drawn in two versions (light and dark), the dark one swapped in by the same media query where supported.

- [ ] **Step 1: Rebuild the builder** — in `scripts/emails.mjs`, replace the engraved band and the navy header with the layout above; keep its token reading (`--paper`, `--ink`, `--primary`, `--primary-foreground`, `--night`, `--on-night` from `src/index.css`, converted by Chromium as today) and its per-language templates and subjects. Remove `band.png` from the output if nothing references it.
- [ ] **Step 2: The render check** — create `scripts/email-preview.mjs`: open each generated template in Playwright at 600px wide, with Go template actions replaced by sample values (a confirmation URL, `user_metadata.language` set to `he`, then `en`), in light and in dark (`emulateMedia({ colorScheme })`), and write PNGs to `~/.bookandry-private/design-audit/emails/<template>-<lang>-<theme>.png`; fail if any text node's contrast against its background is under 4.5:1 (computed in the page) or if the page is wider than 600px.
- [ ] **Step 3: Run** — `pnpm emails && node scripts/email-preview.mjs` → 12 pictures (2 templates × 2 languages × 2 themes, plus the invite's 4), no failure. Send the user the pictures.
- [ ] **Step 4: The gate and commit** — `pnpm verify` → exit 0.

```bash
git add scripts/emails.mjs scripts/email-preview.mjs supabase/templates public/email supabase/functions/send-invite
git commit -m "The account emails wear the new look: paper and ink, the big wordmark, a sapphire button and an ink sheet for the link, in Hebrew and English, readable in dark mail apps" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**For the user, after the release that serves the new `public/email/` images:** paste `supabase/templates/confirm-signup.html` and `reset-password.html` into Supabase → Authentication → Emails → Templates (and their subjects from the `.subject.txt` files), and deploy the `send-invite` function (`npx supabase functions deploy send-invite`). The agent cannot do this.

---

## The last three: dark mode, motion, the whole app

## Task 26: The dark-mode pass

Every screen was built and measured in both themes as it landed. This pass looks at dark mode as a whole, as the user will: the whole harness in dark only, every side-by-side opened, and the concept's dark values kept exactly, with the one listed deviation (D-1, light only) and nothing else.

**Files:** whatever the run shows (each fix in the file that owns it); `src/lib/contrast.test.ts`, `src/lib/money-colours.test.ts` (new pairs).

- [ ] **Step 1: Pin the concept's dark palette and the new pairs** — add to `src/lib/money-colours.test.ts` a test that the `.dark` values of `--paper`, `--paper-sheet`, `--ink`, `--ink-quiet`, `--night`, `--box-fill`, `--primary` and the ten concept money fills equal the concept's dark values listed in this plan's "Dark mode" section (so no later change drifts from the concept), and to `src/lib/contrast.test.ts` the pairs phase 3 introduced: a charged charge-day row (on-sapphire at 78% over sapphire in light ≥ 4.5, at 72% in dark ≥ 4.5: 4.75 and 4.85); chip text on every money fill ≥ 4.5 (the tints, already pinned, at 13px 500); the ghost fills of Task 23 against their text (≥ 4.5) in both themes; an avatar's text on `--box` and on `--primary` (≥ 4.5). Run `pnpm exec vitest run --project unit src/lib` → PASS (or a real failure to fix in the owning file, never by changing the concept's values).
- [ ] **Step 2: Run everything in dark** — `pnpm fidelity --grep "@fid-dark"` → every screen passes. Open every `*-dark/side-by-side.png` and `app-full.png` (all of them, not a sample; the phase 1–2 review caught a sampled image review) and check by eye, against the concept's dark frames: the money sheets carry the screen (no screen that is mostly brown paper where the concept is colour); no white logo plate on a dark sheet; numerals in cream on the ink sheet; the selection, focus rings (`--primary-ink` on the paper, `currentColor` in a sheet) and pressed pills visible. Write one line per screen in the ledger: what you saw.
- [ ] **Step 3: Forced colours** — `pnpm exec playwright test e2e/14-cards.spec.ts --project=en -g "forced"` and the same emulation (`forcedColors: 'active'`) over the feed, Cash and Categories in a small new test in `e2e/22-numerals.spec.ts`'s style: every `[data-sheet]` and `[data-hue]` keeps a visible 2px edge (computed `border-top-style: solid`, `border-top-width: 2px`), the hue picker's swatches keep their colour.
- [ ] **Step 4: The gate and commit** — `pnpm verify` → exit 0.

```bash
git add -A src e2e
git commit -m "Dark mode is the concept's own on every screen, pinned by test, with every new text pair at AA" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 27: Motion opt-in clean-up (3j)

Every remaining transition that moves or scales goes inside `prefers-reduced-motion: no-preference` (`motion-safe:`), colour fades stay for everyone, and the old global rule that shortens every duration under `reduce` goes (§8.3, CAN WAIT on `ui/sheet.tsx` and the shadcn dialogs).

**Files:** `src/index.css` (the global reduced-motion rule), `src/components/ui/*.tsx` (dialog, alert-dialog, dropdown-menu, popover, sheet, select: their `translate`/`zoom`/`slide` classes behind `motion-safe:`), `src/lib/base-css.test.ts`.

- [ ] **Step 1: The failing test** — add to `src/lib/base-css.test.ts`: `index.css` has no rule setting `transition-duration` or `animation-duration` to `0.01ms` under `prefers-reduced-motion: reduce`; and a source scan of `src/**/*.tsx` finds no `animate-in`, `zoom-in`, `slide-in-from-`, `translate-` or `scale-` class outside a `motion-safe:` variant (allow `active:scale-` only inside `motion-safe:`, as the pills have it). Run → FAIL with the list.
- [ ] **Step 2: Move them** — prefix each listed class with `motion-safe:`; keep `fade-in`/`fade-out` and colour transitions unprefixed; delete the global rule.
- [ ] **Step 3: Run, gate, commit** — `pnpm exec vitest run --project unit src/lib/base-css.test.ts` → PASS; `pnpm exec playwright test --project=en -g "reduced|motion|count-up"` → PASS (the count-up spec opts out of reduced motion and still ends on the right figure); `pnpm verify` → exit 0; `pnpm fidelity --grep "@fid-selftest|@fid-feed-desktop"` → pass.

```bash
git add src/index.css src/components/ui src/lib/base-css.test.ts
git commit -m "Nothing moves for someone who asked for less motion, and the old rule that rushed every transition is gone" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 28: The whole app against the concept

The release gate for phase 3. The whole harness, the mirror in English, 1920 and 1024, the full suite, the size limits, and the record.

**Files:** `package.json` (`verify:full` runs the harness), `README.md` (the design section), `docs/superpowers/specs/2026-10-09-colour-of-money-design.md` (amended), `e2e/screens.spec.ts` (overlays: the card details, the empty feed).

- [ ] **Step 1: The harness becomes part of the release gate** — in `package.json`, `verify:full` becomes `pnpm verify && pnpm test:tz && pnpm knip && pnpm test:e2e && pnpm fidelity && pnpm lighthouse`. `pnpm release` already runs `verify` only; add to the README's release notes that a release of a phase that changes how the app looks runs `verify:full` and shows the user the run's side-by-sides first (the audit's process change).
- [ ] **Step 2: The whole run** — `npx kill-port 4173; pnpm fidelity` → every non-reserved test passes, in both themes: the feed (desktop, its five sheets, phone, empty, 1024, 1920, the English mirror `feed-desktop-en`), Cards and a card's page, Cash, Categories, Chart, Commitments, Bank accounts, Settings, the panel, the import pop-out, every empty screen, the first run, the front door; the two add-card screens skipped. Paste the run's `summary.tsv` into the ledger.
- [ ] **Step 3: The full suite and the limits** — `pnpm verify:full` → exit 0. Then `pnpm build` and check: every precached file under 3,145,728 bytes (`ls -l dist/assets/index-*.js`; the main chunk was 2,128,908 at 50b4e5b; report the new size and the growth), the CSP still `font-src 'self'` with no `data:` fonts in `dist/assets/*.css`, exactly two Karantina preloads in `dist/index.html`, and Lighthouse's thresholds held.
- [ ] **Step 4: The screenshot matrix** — `e2e/screens.spec.ts` gains the overlays `card-details` (`/cards?card=…` at 1440 and 390) and `feed-empty`; run `pnpm exec playwright test e2e/screens.spec.ts --project=en` and open every image (all of them; write the count opened in the ledger).
- [ ] **Step 5: The record** — the README's design section says what phase 3 built, that the harness is the gate and where its outputs go, the dark-mode decision (the concept's own palette, deviation D-1), and the add-card slot (the two reserved harness screens the add-card branch must make pass). The spec gets a dated "Phase 3 amendments" section listing this plan's decisions 1–9 and the scope added on 2026-10-10 (empty states, front door, emails), each with its reason, and §11's phase 3 table marked built.
- [ ] **Step 6: Show the user, then commit** — send the user the run folder's path and the side-by-sides of the feed (desktop light and dark, phone), Cards (phone), the empty feed, and the front door. Phase 3 is done when they say it looks like the concept; until then it is not.

```bash
git add package.json README.md docs/superpowers/specs/2026-10-09-colour-of-money-design.md e2e/screens.spec.ts
git commit -m "Phase 3 is measured as a whole against the concept, the harness joins the release gate, and the README and spec say what was built and why" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Never push or merge. The user merges `colour-phase-3` when they have seen it.

---

## Self-review

**Spec and brief coverage.** The user's requirement (the concept's colours and element counts on the main screen) → the harness (Task 1) and its counts and colour sets, the feed tasks (7–12). Every element the brief names: sheets (3), inverted number boxes (4, `Mark`), hue bars (4, 9), hue pills (3, 10), company chips (3, 8, 10), bank sheets (7), the wallet column (11), the month sheet (8), numerals with bleed 0.06 / 0.03 (2, 4; pinned by the harness and `22-numerals`), the nav and rail (6), spacing, radii, type scale, colours (the inventory section, the metrics). The deferred items that block fidelity: the 48px outline pills (5, CAN WAIT 1), the avatar palette (6, D9), numeral sizing in its container (4, CAN WAIT 2), the panel header (5, CAN WAIT 10 and 17); also CAN WAIT 3, 4, 7, 8, 12 (kept), 20, 23, 24 and 30's neighbours where they touch a screen. Dark mode: the concept's, with D-1 the only deviation and the measured ratios listed (Task 26 pins them). Order by what the user notices first: harness; primitives; the feed desktop board; the phone feed; Cards and a card's page; Cash; Categories; Chart; Commitments; Bank accounts; Settings; panels and pop-out with the add-card slot; then the added scope (empty states, front door, emails); dark pass; final run. Behaviour kept: business types (10, 16 keep their buttons and pickers; `16-business-types` runs in 10 and 16), the cash tab (15), Smart import with its kind switch (21 keeps the stage bodies), card bills (7's `monthBills` reads `cardBills`; 13, 14 keep `BillList`). No data model change anywhere (the household fixture is test data restored through the app's own import). Hebrew RTL, AA, 44px, reduced motion, CSP, the 3 MiB limit: Global Constraints, Tasks 26–28.

**Placeholder scan.** Where a step names existing code to move rather than repeating it (the old `CardPanel` parts in Task 14, the feed's list block in Task 7, the stage bodies in Task 21), it names the functions and lines and says "unchanged"; every new component, test and harness file is written out. Two lookups are left to the implementer on purpose, each with its rule: `methodOwnedBy`'s exact signature (Task 7) and `ChartPoint`'s field names (Task 17).

**Type consistency.** `MonthBills`/`ChargeDay`/`MonthBill` (Task 7) are what Tasks 8, 11 and 13 read; `MonthSheetProps`, `CategoriesSheetProps`, `TransactionsSheetProps` and `WalletColumnProps` are written once in Task 7 and kept; `Numeral`'s `fit` and `data-numeral-size` (Task 4) are what Tasks 7–17 and the harness use; `Sheet`/`SheetHead`/`Chip`/`HuePill` (Task 3) and `EditorPanelBody`/`EditorPanelActions`/`EditorPanelClose` (Task 5) keep their names throughout; every `data-slot` a screen emits is in Task 1's contract.

**Review Focus.** Each of the five has its test in the task named in the Review Focus section: dark (1, 26), numerals (4, 7), RTL (1's x metrics in 7–13, 24's mirror), empty and loading (7's loading box, 12's empty feed, 22–23), huge and narrow (12's 1024 and 1920, 28).
