# Sapphire redesign: the front door's look, carried into the app

Status: draft, for review. Date: 2026-10-08.

## What the user asked for

- Build on the current design and give it some care. No new identity.
- The app's main colour becomes **deep blue** instead of green. The chosen shade is **Sapphire**:
  - `#0F3A8A` deep;
  - `#56A0FF` vivid.
- **Mimic the login screen's style inside the app.**
  - The login screen has a deep banknote panel with engraved guilloche lines, and the name set in the Frank Ruhl Libre serif.
  - The white form rises over the panel's foot as a sheet with rounded top corners.
  - The buttons on the panel are outlined pills.
- **No colourful icons.** Every icon is a thin line icon in sapphire.
- **Redesign the + button.** It becomes a labelled pill, "+ הוספה" ("+ Add"), that opens a small pop-out menu.
- **Better UX with more small pop-out menus.** All seven places shown in the mockup:
  1. a row's ⋯;
  2. the month;
  3. the balance and the forecast;
  4. a row's category;
  5. the "not counted yet" chip;
  6. a card's ⋯;
  7. prime.

The mockups are in `.superpowers/brainstorm/60424-1791415115/content/` (`deep-blue.html`, `plus-button.html`, `popouts.html`).

## Order of work

This runs **after the card catalog plan lands**. Both touch the Cards screen and the feed rows, and the card's ⋯ menu links to the catalog's rate table (catalog Task 7).

## 1. Colour

Green leaves the brand. It stays only as the colour of **money coming in** (`--income`, `--chart-income`). Red stays as money going out. Everything that was the brand is sapphire.

| Token                     | Light                                 | Dark                               | Checked contrast                                                                  |
| ------------------------- | ------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| `--brand-deep`            | `#0F3A8A` oklch(0.374 0.142 261.5)    | `#0B2C6B` oklch(0.314 0.117 261.7) | white text 10.5:1 / 13.2:1                                                        |
| `--brand-deep-foreground` | near-white, blue-tinted               | same                               |                                                                                   |
| `--brand-vivid`           | `#56A0FF` oklch(0.702 0.158 255.6)    | same                               | lines and the logo only, never text on light                                      |
| `--primary`               | `#1D4FB8` oklch(0.462 0.175 262.6)    | `#8CB8FF` oklch(0.779 0.113 259.7) | 7.34:1 on white; 9.11:1 on the dark page; the dark-mode foreground is a deep navy |
| `--primary-hover`         | `#0F3A8A`                             | a lighter step of `#8CB8FF`        |                                                                                   |
| `--ring`                  | `#2563EB` (5.17:1)                    | `#8CB8FF`                          | ≥ 3:1                                                                             |
| `--accent`                | `#EAF2FF` (icon tint, menu highlight) | a deep sapphire tint               | the accent foreground is `--brand-deep` / `#8CB8FF`                               |
| `--income`                | unchanged green                       | unchanged                          |                                                                                   |

Other colour changes:

- **Removed:** the FAB tokens `--fab`, `--fab-foreground` and `--fab-rim`. The pill below uses the brand tokens.
- **Logo, favicon and PWA icons:**
  - The logo disc becomes sapphire (`fill-primary`, and `fill-brand-vivid` in dark mode).
  - `public/favicon.svg` and the `pwa-assets.config.ts` background `#16794a` become `#0F3A8A`.
  - The PWA icons are regenerated.
- **`theme-color`:**
  - Light: `#0F3A8A`, so the phone's status bar runs straight into the panel.
  - Dark: `#0B2C6B`.
  - Use `<meta name="theme-color" media=...>` twice in `index.html`, and set the manifest's `theme_color` to `#0F3A8A`.
- **Contrast tests:** `src/lib/contrast.test.ts` gets the new pairs, and every one must pass.
- **Not in scope:** the existing hard-coded `amber-*` warnings and the card gradients (`card-colors.ts`) stay as they are.

## 2. The front door's style, inside the app

**The panel.** A new `BrandPanel` component (`src/components/brand-panel.tsx`):

- a `--brand-deep` block in white text with the guilloche drawn in `--brand-vivid` at 45%;
- it reuses `engraving.tsx` with a new compact ring set placed in the inline-start top corner (mirrored for RTL as on the front door);
- buttons on it are the front door's outlined pills: `border-white/35`, `hover:bg-white/10`.

Pulling the button styling of `auth-layout.tsx`'s `ThemeSwitch` and `LanguageSwitch` out into a shared `panelPill` class is part of this work.

**The sheet.** On a phone, the content below the panel rises over its foot exactly as the sign-in form does: `-mt-6 rounded-t-3xl bg-background`.

**The draw-in.** The guilloche is drawn in once per app start, on the first panel that shows. After that it is drawn already, so navigating between screens never replays it. Reduced motion means it is never animated, as today.

| Screen                            | Panel holds                                                                                                                                                                                                                                                                                              | Below it, on the sheet                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Feed                              | <ul><li>Phone: the logo (inverse) and the user menu, which move into the panel from the phone header.</li><li>The month pill (‹ month ›).</li><li>The profile switcher and prime as pills.</li><li>The balance in Frank Ruhl Libre at 2.75rem.</li><li>The forecast line in the serif at 1rem.</li></ul> | the filter bar, then the feed                                                     |
| Chart, Cards, Household, Settings | The page title in Frank Ruhl Libre at 2rem. On a phone, the logo and the user menu.                                                                                                                                                                                                                      | the screen as it is today, with its `h1` now in the panel (still the page's `h1`) |

- **Desktop (`lg`).**
  - The side rail becomes the panel: `--brand-deep`, with the engraving's bands along its foot.
  - The logo and the app name sit at the top in white.
  - The active tab is a `bg-white/15` pill.
  - The content column's panel is a rounded-3xl block at the top of the column. The sheet overlaps it by 1.5rem, as on a phone.
- **Collapsed header.**
  - `collapsed-bar.tsx` becomes a slim `--brand-deep` bar holding the balance in the serif.
  - It keeps its height of 48px plus the top inset, so `use-collapsing-header` and `--feed-sticky-top` are unchanged.
- **Phone tab bar.**
  - It stays white.
  - The active tab is sapphire, with a soft `--accent` pill behind its icon.
  - The labels stay, as today.
- **Figures in the serif.**
  - Check whether Frank Ruhl Libre Variable has `tnum`.
  - If it has: the counting-up balance uses `tabular-nums`.
  - If it hasn't: the figure's box is sized from its final value before the count starts, so the line never jitters.
  - Amount columns in lists stay in the sans stack, exactly as `index.css` requires.

## 3. Icons

- Every category icon chip, on income rows too, is a line icon in `--brand-deep` (dark mode: `#8CB8FF`) on `--accent`.
- Direction is carried by the amount's colour and sign, not by the chip.
- The icons stay lucide, at stroke width 1.75.

## 4. The + button

**`Fab` is replaced by `AddButton`.** It is a sapphire pill with a plus and the word "הוספה" / "Add":

- `h-12`, `px-5`;
- `--brand-deep`, with white text;
- a `brand-vivid` 1px ring in dark mode, so its boundary shows on the near-black page.

**Placement.**

- On a phone it is centred above the tab bar, where the FAB is today.
- On desktop it sits at the bottom-end corner.
- It stays on the feed only, as today.

**The menu.** It opens a small menu above it, made with `DropdownMenu`, `side="top"`. Each item has a sapphire icon tile and a one-line hint:

1. **הוצאה / Expense:** "Purchase, bill, payment". It opens the transaction sheet preset to an expense.
2. **הכנסה / Income:** "Salary, refund, gift". It opens the transaction sheet preset to income.
3. A divider.
4. **ייבוא חכם / Smart import:** "From a file or a photo of a statement". It is the existing "Add with AI", disabled when `aiAvailable` is false, as today.

**Presetting the kind.**

- `openAdd` takes an optional kind. The URL becomes `add=expense` or `add=income`, and `add=1` keeps meaning an expense.
- The form's `Segmented` kind control starts there and can still be switched.

**Not in scope.** The mockup showed "Transfer", but the app has no transfer kind, so it is left out. Adding transfers is its own feature.

**Keyboard.** The menu opens with Enter, and Expense is first, so Enter, Enter is still the quickest way to the form.

## 5. The seven pop-out menus

**How they behave.** All seven pop-outs follow the same rules:

- **Components.** They use base-ui `Popover` or `Menu` through `src/components/ui/`, anchored to the control that opened them.
- **Arrow.** Each has a small arrow wherever the anchor is not the pop-out's own edge.
- **Closing.** Each closes on outside tap, on Escape, and on scroll.
- **Focus.** Focus moves into the pop-out and back to its trigger on close.
- **Touch targets.** Every item is at least 44px high on a phone.

**Wrapper changes.** The wrappers gain:

- an optional `anchor`, passed through to the base-ui positioner;
- a sapphire highlight (`focus:bg-accent`, which already holds and is now blue);
- `rounded-2xl` with a soft blue-tinted shadow.

**The virtualised feed.** The feed keeps ONE menu instance at screen level, as the sheet does today (see `row-actions-sheet.tsx`'s comment), anchored to the ⋯ button of the selected row through `anchor`. If that row scrolls out of the rendered range and unmounts, the menu closes.

### 5.1 A row's ⋯

**What changes.** `row-actions-sheet.tsx` becomes `row-actions-menu.tsx`, an anchored menu instead of a bottom sheet, on every screen size.

**The items:**

- Edit
- Duplicate
- Skip or Restore (series only)
- a divider
- Delete

**Duplicate** is new. It opens the add form prefilled from the row:

- the kind, category, amount, currency, payment method and note;
- the date set to today;
- one-time, whatever the source row's recurrence was.

**Unchanged:**

- The wording rules and the undo toast.
- Card-fee rows still go to the Cards screen.

### 5.2 The month

**What changes.** The month label between ‹ and › becomes a button that opens a pop-out:

- a year stepper;
- a 4×3 month grid, with the current month filled sapphire;
- "Back to this month".

**Which months are offered:**

- Months past the projection horizon are disabled. This is the same limit that disables › today (`isAtHorizon`).
- Future months within the horizon are shown in muted text, because they are a forecast.

**Unchanged:** the ‹ › arrows stay, and the `aria-live` month heading stays.

### 5.3 The balance and the forecast

**What changes.** Tapping a figure in the panel opens a pop-out under it, instead of the full sheet.

**The balance pop-out lists:**

- opening;
- income;
- expenses;
- bought by card, not yet charged;
- the total.

These are the same parts `BalanceBreakdownSheet` lists.

**The forecast pop-out lists:**

- expenses grouped by kind, the largest four, then "and N more";
- the total.

**The full breakdown.** Each pop-out ends with "Full breakdown", which opens today's sheet. On the collapsed bar, the balance opens the same pop-out.

**Shared logic.** The pop-out and the sheet share one data hook. Nothing is computed twice.

### 5.4 A row's category

**What changes.** The row's icon chip becomes a button that opens a 4×2 grid.

**The grid:**

- the 7 categories of that kind used most often in the last 90 days, with the current one filled sapphire;
- "More", which opens the existing category picker.

**Applying the change:**

- **One-time transaction:** the category is changed at once, with an undo toast.
- **Series:** the pop-out asks a second question in place, "Only this time" or "From now on". These map to the edit scopes `one` and `future` (`src/domain/series-edit.ts`).
- **Write path:** both go through the existing series-edit path, so overrides and splits behave exactly as the edit form's do.

**Rows with no chip button:** card-fee rows and skipped rows.

### 5.5 "Not counted yet"

**What changes.** The chip appears on occurrences dated after today (`isProjected`). It becomes a button with three choices:

- **Charged today:** a `modify` override that moves this occurrence to today. This is the same path as editing one occurrence's date.
- **A different amount…:** opens the edit form for this occurrence, with focus on the amount.
- **A different date…:** opens the existing date picker in place, and moves the occurrence there.

**Undo.** All three produce an undo toast.

**Rows without the chip:** income is the same, and a past occurrence has no chip.

### 5.6 A card's ⋯

**What changes.**

- Each card face on the Cards screen gets a ⋯ button in its top inline-end corner.
- The face itself also becomes a button that opens the same menu.

**The items:**

- Edit card
- Interest table: opens the catalog's rate table (catalog Task 7). Hidden for a card not linked to the catalog.
- Transactions on this card: the feed filtered to this payment method.
- Import a statement: the import sheet, preset to this card.
- a divider
- Archive

**Removed:** the existing outline Edit button. Edit is in the menu, and the face is the larger target.

### 5.7 Prime

**What changes.** `PrimeStrip` leaves the page. Prime becomes a pill in the feed's panel, "Prime 4.75% ⓘ". Its pop-out carries what the strip carried:

- prime;
- the Bank of Israel rate plus 1.5;
- "as of", or the next decision date.

## 6. Edge cases

- **RTL.**
  - Pop-outs follow `side` and `align` logically.
  - The engraving is mirrored as on the front door.
  - The month grid runs in reading order.
  - `gate:rtl` stays green.
- **Narrow screens (320px).**
  - The panel's pills wrap onto two lines rather than overflow.
  - The balance steps down a size below 360px.
  - The `@narrow` e2e test asserts there is no sideways scroll.
- **Locked or offline devices.** Pop-outs that write (5.4, 5.5) are disabled in the same states in which the row's ⋯ actions are today.
- **Read-only month (past or skipped occurrences).** No "not counted yet" chip, so there is no pop-out.
- **A row the virtualiser unmounts while its menu is open.** The menu closes (see the behaviour rules in section 5).
- **Dark mode.**
  - The panels stay sapphire (`#0B2C6B`).
  - The sheet is the dark background.
  - Pop-outs use `--popover`.
  - Every pair is in the contrast test.

## 7. Tests

- **Unit (`contrast.test.ts`):** the new token pairs.
- **DOM:**
  - `AddButton`: its menu items and the preset kind in the URL.
  - Each pop-out: it opens and closes, focus returns, and its items act. This uses fake data, following `row-actions-sheet.test.tsx`.
  - The category pop-out's two-step series question.
  - "Charged today" writes a `modify` override with today's date.
  - The month grid disables past-horizon months.
- **DB:** "Charged today" and the category change, through series-edit, with undo restoring exactly.
- **E2E:**
  - The screenshot matrix (`screens.spec.ts`) is retaken and looked at.
  - The axe matrix (`07-a11y`) stays blocking-clean.
  - `08-polish`: there is no sideways scroll at 320px; every pop-out item is at least 44px; `@collapse` still works.

## 8. Not in scope

- A transfer kind.
- New warning tokens for the `amber-*` notices.
- The card face gradients.
- The bank colour family from the earlier mockup.
- A redesign of the forms inside the transaction sheet.
- The chart's own colours, beyond `--primary` flowing through.
