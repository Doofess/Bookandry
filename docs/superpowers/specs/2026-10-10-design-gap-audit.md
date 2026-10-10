# Design gap audit: the approved Bold sheets concept against what shipped

**Date:** 2026-10-10. **Scope:** `main` at 50b4e5b (phases 1 and 2 of Colour of money, released). Nothing in the app was changed.

**Compared:** the approved concept `.superpowers/concepts-2026-10-09/money-sheets-bold-v2.html` against the app, built with `pnpm build:local` and served by `pnpm preview:local`, the same server the e2e suite uses.

## 1. What happened, plainly

- **The concept the user approved is mostly phase 3's work.** It shows the board of sheets, the huge numerals, the black figure boxes, the hue bars, the card sheets and the three-pane pop-out.
- **Spec §11 split the redesign into three phases.**
  - Phase 1 was tokens and fonts.
  - Phase 2 was the shell, the editor shells and the shared components, with "every screen still a single column".
  - Phase 3 was the screens.
- **Only phases 1 and 2 were built, and they were released to bookandry.com.**
- **The final review says so outright:** "No screen renders `Numeral`, `CardSheet`, `CardFace`, `MoneyTile` or `HueBars` in phases 1-2."
- **The release went out without a clear warning.** Nobody told the user that it would look like the old app in new paint, nothing like the page they approved. The merge commit's message ("The app is ink on warm grained paper with banks, cards and categories in their own colours…") reads as if the redesign were done.
- **The user's reaction is the correct reading of what shipped.** It is not a misunderstanding on their side.

**Measured in the running app** (Hebrew, demo household, 1440×900):

| What the concept is built from                | Concept, desktop home                    | Shipped feed                                     | Shipped Cards      |
| --------------------------------------------- | ---------------------------------------- | ------------------------------------------------ | ------------------ |
| Sheets (`[data-sheet]`)                       | 15                                       | **1** (the ink hero)                             | 3 (the card faces) |
| Huge bleeding numerals (`[data-numeral]`)     | 8                                        | **0**                                            | **0**              |
| Inverted figure boxes (`[data-mark]`)         | 8                                        | **0**                                            | **0**              |
| Category hue marks (`[data-hue]`)             | 16 (plus 14 company chips)               | **0**                                            | **0**              |
| Width the content uses inside `main` (1169px) | all of it                                | **640px**, centred; the rest is paper            | 640px              |
| The balance figure                            | Karantina 252px, whole shekels, bleeding | Karantina **44px with agorot**, glyphs colliding | n/a                |

The tokens themselves are not the problem. Phase 1 copied the concept's light and dark values exactly: paper, sheet, ink, box, sapphire, all 29 money keys and the 24 hue tones. What is missing is the layer that uses them.

## 2. Method

- **The app.**
  - Built with `build:local` (no Supabase) and served on 4173.
  - Seeded by driving the first-run wizard with "Load demo data", exactly as `e2e/support/seed.ts` does.
  - Hebrew UI, `he-IL`, `Asia/Jerusalem`.
  - Each theme was set in the app's own boot mirror (`gb.boot`, which the Preferences theme control writes) and emulated as `prefers-color-scheme` at the same time.
  - Sizes: 1440×900 and 390×844.
- **The views.** Feed, Cards, a card's page (its bill opened, then Edit card), Cash, Categories, Settings, Bank accounts, Chart, the Add menu and the Add expense editor.
  - Each was taken as the first screen (`*-fold-*`) and the full page.
  - Full-page phone shots catch the fixed tab bar mid-page. That is how the shot is stitched, not a bug.
- **The concept.** Opened at 1504px wide, so its 1440 frames render at scale 1, in light and dark (it has a real dark mode, see §5).
- **The data.** The demo household is smaller than the concept's: three cards (Max, Cal, Isracard) and one Hapoalim account. So the shipped wallet has fewer colours than the concept's five cards and four banks. That difference is data, not design.
- **Contrast ratios** come from a small script. It converts OKLCH to sRGB, clipping to gamut, and computes WCAG relative luminance.

**Images** (in the private audit folder, beside the full copy of this report; none are in the repo):

- `side-by-side/`: the concept on the left and shipped on the right, the fastest way to see the gap;
- `concept/`: the concept's frames and single sheets, light and dark;
- `app/`: every view, as `<view>[-fold]-he-<desktop|phone>-<light|dark>.png`;
- `app/zoom-*`: 2x crops of the balance figure, the grain, rows and card faces.

## 3. The top gaps, in the order the user meets them

1. **The feed is the old list, not the board of sheets.**
   - The concept's desktop home is a full-width ink balance sheet, with bank sheets fanned and tilted down its side and a 252px balance running off its foot. Below it come a sapphire month sheet and a categories sheet of fat hue bars. Below those come a transactions sheet and a wallet column of card sheets.
   - Shipped: a 640px column in the middle of a 1169px `main`, holding a small ink hero and the old virtualised list.
   - Cause: **phase 3a not built.**
   - Images: `side-by-side/feed-desktop-light.png`, `side-by-side/feed-desktop-dark.png`.
2. **No huge numerals with the bottom-edge bleed anywhere, and the one big figure is broken.**
   - The balance is Karantina 700 at 44px, letter-spacing −1.1px, with agorot (`165,574.08`). It asks for `tabular-nums`, a feature Karantina doesn't have.
   - The digits collide ("574" runs together, and the 4 touches the point). See `app/zoom-balance-light.png`.
   - This breaks decision 20 (Karantina never for figures that count, and the balance counts up) and §9.4 (a figure with agorot never takes the big numeral).
   - Cause: **a phase 1 defect.** Fonts swapped the face without honouring its rules. The `Numeral` component that does it right exists but is not mounted (phase 3).
3. **Cards are a stack of old bordered boxes, not one colour sheet per card.**
   - The concept: an ink summary sheet ("leaves the bank this month", a 118px numeral, the next charge in a black box). Then one full-width sheet per card in the company colour, with sides alternating and a 92–104px figure cut by the sheet's corner.
   - Shipped: the old screen. Card faces in a 2-across grid, then a dozen or more thin-bordered boxes per card (bills, fees, commitments) at 12–13px.
   - Cause: **phase 3b not built** (and it waits for the add-card flow).
   - Images: `side-by-side/cards-phone-light.png`, `side-by-side/cards-phone-dark.png`, `side-by-side/wallet-vs-cards-desktop-light.png`.
4. **No inverted black figure boxes, hue pills, hue bars or company chips.**
   - Rows still lead with a grey disc and a line icon. The card is a grey caption (the card's name with a card glyph), not a Max-magenta chip. The person is a saturated purple, teal or green disc in colours outside the palette.
   - Cause: **phase 3a and 3f not built.** The avatar colours are a **phase 1 miss**: they were never mapped to the house palette.
   - Image: `app/zoom-rows-dark.png`.
5. **Dark mode reads as grey-on-grey** (§5).
   - The shipped dark is the concept's palette with almost no colour on it, and the concept's dark only works because colour carries it.
   - Two causes:
     - **phase 3 not built:** there are no money sheets to carry it;
     - **phases 1-2 defects:** the separation between surfaces, the ink hero, the sapphire, the near-black fills and the grain blend.
6. **The editors and the pop-out aren't the concept's.**
   - The Add expense panel ends in 32px default buttons. The concept and §6.1/§9.6 have 48px 2px-outline and solid pills.
   - The header's padding doesn't line up with the body's. The first label ("income or expense") sits right under the subtitle with no gap.
   - The concept's three-pane add-card pop-out (steps, colour tiles, live card preview on a black sheet) does not exist yet.
   - Causes:
     - the footer pills and alignment are **phase 2 defects**, known as CAN WAIT 1 and 17 in the final review;
     - the three-pane flow is the **add-card branch, not merged**.
   - Images: `side-by-side/popout-desktop-light.png`, `side-by-side/popout-desktop-dark.png`, `side-by-side/addcard-phone-dark.png`.

## 4. Screen by screen

"P3" means the gap exists because phase 3 isn't built. "Defect" means phases 1-2 built it, and built it wrong or short of the spec.

### Feed (`app/feed[-fold]-he-*`, `side-by-side/feed-*`)

| Concept                                                                                                    | Shipped                                                                     | Why                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Top bar: a greeting title pair, a search pill and the month picker with 48px round arrows                  | The screen name only; search and month live inside the hero and the list    | Defect: §11 put the top bar in phase 2; it was deferred to phase 3 in a code comment and not reported to the user |
| Balance: a full-width ink sheet, lede with 2 black boxes, 252px numeral bleeding 6% off the foot           | A 640px ink hero; 44px Karantina with agorot, glyphs colliding              | P3 (layout); **Defect** (the figure)                                                                              |
| Bank and cash sheets fanned at −1.2° and +1°, the last running off the foot                                | Absent                                                                      | P3                                                                                                                |
| Sapphire month sheet: in and out, a track, the charges by day with issuer chips, a 168px "left this month" | Absent; "expected this month" is a line of 15px text in the hero            | P3                                                                                                                |
| Categories sheet: 30px hue bars, one per category                                                          | Absent on the feed                                                          | P3                                                                                                                |
| Transactions sheet: 14×40 hue pill, merchant 600, meta line with a company-colour chip                     | Old rows: a grey icon disc, a grey card caption, an avatar disc, a ⋯ menu   | P3                                                                                                                |
| Wallet column: card sheets with 104px figures, the cash sheet with a 150px figure                          | Absent                                                                      | P3                                                                                                                |
| Sheets 16px apart, filling `main` up to 1680px                                                             | One column of 640px, centred: 529px of bare paper (265px each side) at 1440 | P3                                                                                                                |
| Phone: a 76px Karantina head, then the same sheets 8px apart                                               | The 76px head is there; then the hero and the list                          | P3                                                                                                                |
| Rail: 256px, the mark, the solid Add pill, text pills, the current one in ink                              | Matches                                                                     | Done                                                                                                              |

### Cards (`app/cards[-fold]-he-*`, `side-by-side/cards-*`)

| Concept                                                                                                                           | Shipped                                                                                                     | Why                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Ink summary sheet: a 118px numeral (desktop 252), the next charge in a box                                                        | A bordered paper box: "total commitments", 2,890.09 in 24px Plex, a table                                   | P3                                                   |
| One sheet per card in the company colour, sides swapping, a 92/104px figure cut by the corner, "billed on the 2nd" in a black box | Card-shaped faces (1.586 ratio) in the company colour, no figure on them, network logo, 2 across on desktop | P3 (the colour is there, so phase 1 did its part)    |
| Details in a panel (`?card=`) beside the sheets from 1440                                                                         | Every detail stacked under every card: 3 small boxes, a limit meter, commitments, fees, about 8 bills each  | P3                                                   |
| Inner structure: sheets and 2px tint lines                                                                                        | 1px `border-border` rounded-xl boxes inside the paper sheet: boxes in boxes                                 | P3; it looks worst in dark, where the line is 1.41:1 |

### A card's page (`app/card-detail-*`, `app/card-editor-*`)

- **Bill opened.** The old accordion, bordered, in small type. P3.
- **Edit card** opens as the 480px end-side panel. That is right (phase 2). Inside:
  - the colour swatches are the money colours (phase 1, done);
  - the bank picker is a grid of logos on white plates. In dark, that is 12 bright white tiles on the dark panel (`app/card-editor-he-desktop-dark.png`). §36 allows logos in rows that are not sheets, but a dark plate variant or a 2px plate edge is needed;
  - Cancel and Save are 32px (Defect, §6.1).
- **The concept's 7-step add-card pop-out with live preview** belongs to the add-card branch.

### Cash (`app/cash[-fold]-he-*`)

- **Concept:** a yellow cash sheet with a 150px total bleeding off the foot, Count and Withdraw pills, one sheet per person side by side, and the moves list on a paper sheet.
- **Shipped:** a near-empty ink hero with a person filter, then one bordered box per person holding a "how much cash do you have" form. P3 (3d).
- **On desktop** the screen shows two Add pills: the rail's and Cash's own floating pill at the bottom corner. That is intentional in `add-button.tsx`, but it reads as a duplicate. Defect: minor.
- **In dark** the ink hero has no visible edge (§5, D2).

### Categories (`app/categories[-fold]-he-*`)

- **Concept:** each row leads with its hue pill and has this month's total as a hue bar.
- **Shipped:** the old list, with a grey icon disc, the name, "built-in", and two icon buttons. No hue anywhere: phase 1 added the `hue` field and tokens, but nothing renders them yet. P3 (3f, with the hue picker).

### Settings (`app/settings[-fold]-he-*`)

- **Spec §5.7:** two panes from desktop, the subjects as nav pills beside the open subject.
- **Shipped:** the phone list, a 640px column with an empty right half. P3 (3g).

### Add (`app/add-menu-*`, `app/add-expense-*`, `side-by-side/popout-*`)

- **The Add menu** opens from the rail pill on desktop and the floating pill on a phone (phase 2, done).
- **The expense editor** is the 480px end-side panel on desktop and a bottom sheet on a phone. That is correct per §6.3. But the panel is the old form with its old controls:
  - segmented toggles in grey bands;
  - 32px footer buttons;
  - a cramped header (Defect, §6.1).
- **The concept's pop-out language** has not reached any flow yet: 48px question titles, colour tiles with an ink selection ring, pills at 48px, a black preview sheet.

### Bank accounts and Chart (`app/bank-accounts-*`, `app/chart-*`)

- **Bank accounts:** one bordered box with a 4px red Hapoalim edge, where the concept has one Hapoalim-red sheet with the figure in a box. P3 (3c).
- **Chart:** unchanged apart from the paint. P3 (3e).

## 5. Dark mode

### Does the concept have one?

Yes. `money-sheets-bold-v2.html` defines a full dark set, and the theme buttons at the top of the page switch it (`concept/concept-*-dark.png`):

- warm near-black paper (`oklch(0.2 0.012 70)`) and sheets one step up (`0.255`);
- the ink sheet goes darker (`0.13`);
- brand fills deepen slightly;
- category hues are lifted;
- the grain switches to `screen`.

Phase 1 copied these values exactly. **So the shipped dark palette is the concept's palette.** The concept's dark mode looks good because:

- the screen is mostly colour: five bank sheets, a sapphire sheet, five card sheets and a yellow cash sheet;
- the near-black ink sheet carries cream 252px numerals and coloured account sheets, so its edge doesn't matter.

Take the colour away and the same palette is grey on grey, which is what shipped.

### What is wrong in the shipped dark mode

Measured on the shipped tokens.

| No. | Defect                                                                                                                                                                                                                                                 | Measured                                       | Cause                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| D1  | **Almost no colour.** The concept's dark is carried by the money sheets, and the screens don't have them yet.                                                                                                                                          | 1 sheet on the feed                            | P3                                                                                                                   |
| D2  | **The ink hero is a hole.** `--night` 0.13 on paper 0.2 has no visible edge. The hero, the Cash hero and the collapsed bar sink into the page (`app/feed-fold-he-desktop-dark.png`, `app/cash-fold-he-desktop-dark.png`).                              | night vs paper **1.11:1**; box vs night 1.02:1 | Defect (a token choice inherited from the concept without its colourful contents)                                    |
| D3  | **Sheets lose their separation.** The paper sheet (0.255) against the paper (0.2) is barely there, so the 640px column and the panels read as one brown field.                                                                                         | **1.15:1**                                     | Defect                                                                                                               |
| D4  | **Muddy inner structure.** Old `rounded-xl border` boxes inside the sheet draw a 1px line at 14% ink. Day headings in the feed are `muted` bands that sit _darker_ than the rows, so the layering reads inverted, as holes (`app/zoom-rows-dark.png`). | border **1.41:1**; muted vs sheet **1.05:1**   | P3 for the boxes; Defect for the band colour                                                                         |
| D5  | **Sapphire sinks.** The dark sapphire fill (0.42) is a deep fill. As the Add pill, the current pop-out step and the toggle tracks, it barely stands off the page.                                                                                      | sapphire vs paper **2.06:1**                   | Defect (concept value; it needs a lift in an app that has little else)                                               |
| D6  | **Near-black brand fills vanish.** One Zero (bank-18), the card colour "black", FIBI's navy (bank-52), Isracard and Diners have no edge against the dark page. The final review flagged this (CAN WAIT 6).                                             | 1.00, 1.07, 1.21, 1.48, 1.54:1                 | Defect                                                                                                               |
| D7  | **Chalky fills under the grain.** The `screen` blend lifts the dark speckle in the grain, so the Max, Isracard and Cal faces read hazy (`app/zoom-cardface-*-dark.png`). On the paper the grain shows as coarse noise (`app/zoom-grain-dark.png`).     | 6% (94% veil), screen                          | Defect (the concept drew grain as one overlay over everything; the app draws it on every sheet, so fills get it too) |
| D8  | **White logo plates glare.** The bank picker in the card editor is a grid of 12 white plates on the dark panel.                                                                                                                                        | n/a                                            | Defect                                                                                                               |
| D9  | **Avatar discs** are fully saturated purple, teal, green and blue, outside the palette. In dark they are the loudest things on screen after the cream nav pill.                                                                                        | n/a                                            | Phase 1 miss                                                                                                         |
| D10 | **The numeral treatment is absent.** Dark mode never gets the concept's big cream Karantina figure on an ink sheet: the strongest thing in the concept's dark. The 44px figure with agorot collides in both themes.                                    | 0 numerals                                     | P3, plus the phase 1 defect                                                                                          |

What is right: text contrast is fine everywhere measured. Ink on the sheet is 13.65:1, quiet text 7.62:1, every money tint at least 5.1:1 on its fill, and every lifted figure colour at least 7.46:1 on the box. This is not an accessibility failure. It is a composition failure.

### Proposed dark palette

The logic stays the concept's: ink and paper invert, and each sheet speaks in one tint of its own hue at a lightness right for dark. Three changes make it work even before phase 3 brings the colour back.

1. **The page goes deeper** and the sheet steps further up, so a sheet always has an edge.
2. **The ink sheet becomes the ink colour itself.**
   - In light mode the ink sheet is the ink colour (the darkest thing). Inverted, it should be dark mode's ink: cream.
   - That is also vojta.io's dark mode (`vojta-shots/dark-forced-00.png`): light sheets on a near-black page.
   - Keeping a dark hero can't work: even at L 0.10 it measures 1.06:1 against the page.
   - **Recommended, but show the user a mockup first** (option B: keep a dark hero, with a 2px edge in `--ink` at 12 percent).
3. **Every fill that can't reach about 1.8:1 against the page is lifted.**
   - That is the near-blacks, the navies, Isracard and Diners.
   - Brand fills elsewhere move up about 0.03 L, so they glow rather than sink.
   - Tints are re-checked against each lifted fill.

**The house** (dark values):

| Token                       | Shipped (dark)                      | Proposed                                                                         | Text on it                                               | Against the page                                |
| --------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| `--paper` (the page)        | `oklch(0.2 0.012 70)`               | `oklch(0.16 0.01 70)` (`#100D09`)                                                | ink **16.78:1**                                          | n/a                                             |
| `--paper-sheet`             | `oklch(0.255 0.012 70)`             | `oklch(0.27 0.012 70)` (`#2A2520`)                                               | ink **13.04:1**, quiet `oklch(0.78 0.012 85)` **7.54:1** | **1.29:1** (was 1.15)                           |
| `--night` (ink sheet)       | `oklch(0.13 0.006 70)`              | `oklch(0.93 0.014 85)` (`#ECE7DE`, cream)                                        | on-night `oklch(0.2 0.018 265)` **14.74:1**              | **15.80:1** (was 1.11)                          |
| `--box-fill`                | `oklch(0.11 0.006 70)`              | `oklch(0.12 0.006 70)` (`#070504`)                                               | ink **17.54:1**                                          | n/a                                             |
| Box on the ink sheet        | paper on near-black                 | ink box `0.2 0.018 265` with cream text                                          | **14.74:1**                                              | n/a                                             |
| `--primary` (sapphire fill) | `oklch(0.42 0.165 263)`             | `oklch(0.52 0.19 263)` (`#295FD4`)                                               | on-sapphire `oklch(0.985 0.012 263)` **5.47:1**          | **3.39:1** (was 2.06)                           |
| `--primary-ink`             | `oklch(0.78 0.12 263)`              | `oklch(0.8 0.12 263)`                                                            | **10.18:1** page, **7.91:1** sheet                       | n/a                                             |
| `--muted` (bands, toggles)  | `oklch(0.27 0.012 70)`              | `oklch(0.31 0.012 70)` (`#342F2A`), _above_ the sheet, not below                 | quiet **6.58:1**                                         | n/a                                             |
| `--input`                   | `oklch(0.56 0.012 70)`              | `oklch(0.6 0.012 70)`                                                            | n/a                                                      | **3.82:1** on the sheet (field edge, needs 3:1) |
| `--income` / `--expense`    | 0.8 0.15 155 / 0.667 0.167 22.7     | 0.8 0.15 155 / `oklch(0.69 0.16 23)`                                             | **8.57 / 5.06:1** on the sheet                           | n/a                                             |
| Grain                       | 6 percent, screen, on every surface | 4 percent, `soft-light`, on the paper and paper sheets only; none on money fills | n/a                                                      | n/a                                             |

**One tint per sheet** (dark fills; light mode unchanged):

| Key              | Fill (proposed)                     | Tint                       | Tint on fill | Fill vs page    | Lifted figure on box               |
| ---------------- | ----------------------------------- | -------------------------- | ------------ | --------------- | ---------------------------------- |
| bank-10 Leumi    | `oklch(0.47 0.145 254)` (`#085AA9`) | `oklch(0.97 0.02 254)`     | 6.31         | 2.82            | `0.82 0.1 254`: 11.60              |
| bank-12 Hapoalim | `oklch(0.5 0.19 25)` (`#B71824`)    | `oklch(0.97 0.02 25)`      | 6.00         | 2.93            | `0.82 0.11 25`: 10.97              |
| bank-11 Discount | `oklch(0.48 0.115 155)` (`#0B703F`) | `oklch(0.97 0.025 155)`    | 5.71         | 3.14            | `0.84 0.13 155`: 13.06             |
| bank-20 Mizrahi  | `oklch(0.66 0.175 44)` (`#E66624`)  | `oklch(0.2 0.06 44)`       | 5.50         | 5.83            | `0.74 0.16 44`: 8.32               |
| bank-52 (navy)   | `oklch(0.38 0.12 259)` (`#143F81`)  | `oklch(0.97 0.02 259)`     | 9.29         | 1.91 (was 1.21) | `0.84 0.08 259`: 12.43             |
| bank-18 One Zero | `oklch(0.36 0 none)` (`#3D3D3D`)    | `oklch(0.97 0 none)`       | 9.96         | 1.79 (was 1.07) | `0.85 0 none`: 12.84               |
| issuer-isracard  | `oklch(0.42 0.15 270)` (`#2F429D`)  | `oklch(0.97 0.025 270)`    | 8.02         | 2.21 (was 1.48) | `0.82 0.1 270`: 11.43              |
| issuer-cal       | `oklch(0.64 0.11 195)` (`#00A0A1`)  | `oklch(0.19 0.045 195)`    | 5.67         | 6.08            | `0.74 0.12 195`: 9.25              |
| issuer-max       | `oklch(0.5 0.205 353)` (`#B1036D`)  | `oklch(0.97 0.02 353)`     | 6.12         | 2.88            | `0.82 0.12 353`: 10.98             |
| issuer-amex      | `oklch(0.49 0.155 253)` (`#0060B5`) | `oklch(0.97 0.02 253)`     | 5.77         | 3.08            | `0.83 0.1 253`: 11.96              |
| issuer-diners    | `oklch(0.42 0.025 261)` (`#454D5B`) | `oklch(0.96 0.008 261)`    | 7.53         | 2.30 (was 1.54) | `0.87 0.03 261`: 13.70             |
| cash             | `oklch(0.82 0.15 86)` (`#EFBC3A`)   | `oklch(0.22 0.05 86)`      | 9.85         | 11.03           | `0.82 0.15 86`: 11.54              |
| card-black       | `oklch(0.36 0.01 277)` (`#3C3D42`)  | `oklch(0.97 0.003 277)`    | 9.97         | 1.79 (was 1.00) | `0.85 0.01 277`: 12.83             |
| paper sheet      | `oklch(0.27 0.012 70)`              | ink `oklch(0.95 0.012 85)` | 13.04        | 1.29            | box text ink: 17.54                |
| night (cream)    | `oklch(0.93 0.014 85)`              | `oklch(0.2 0.018 265)`     | 14.74        | 15.80           | cream on ink box: 14.74            |
| sapphire         | `oklch(0.52 0.19 263)`              | `oklch(0.985 0.012 263)`   | 5.47         | 3.39            | `0.82 0.1 263` on box: more than 7 |

**Notes on the proposal:**

- Every tint keeps the hue of its fill, so decision 4's 2° rule holds. Every tint is above 4.5:1, and every lifted figure is above 7:1.
- The other card colours (`card-silver` to `card-purple`) and the remaining FIBI-group navies follow the same +0.03 L rule. The near-black ones get the lift to 0.36–0.38 shown here.
- Fills still under 2:1 against the page also get a 2px edge in their own `-hi` colour at 35 percent, so they never rely on lightness alone.
- **Category hues** keep the concept's dark values. On the new sheet the lowest, magenta-2, measures 3.23:1, above the 3:1 needed for marks.
- **Before any of this is built:** render the feed and Cards in both options (cream ink sheet or dark ink sheet with an edge) and let the user pick from the pictures.

## 6. The plan to close the gap

Effort: S is up to half a day, M is 1–2 days, L is 3–5 days, each with tests and `pnpm verify`. Ranked by what the user sees first.

| Rank | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Effort                                                                          | Phase     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | --------- |
| 0    | **Tell the user plainly** what shipped (phases 1-2 of 3), what didn't, and that the screens they approved are phase 3. Show this report's side-by-side images. Agree the order below before building.                                                                                                                                                                                                                                                              | n/a                                                                             | n/a       |
| 1    | **Hotfix the balance figure.** Mount `Numeral` in the hero (whole shekels in Karantina, exact amount `sr-only`), or set the agorot figure in Plex 600 until 3a. Remove the negative tracking on Karantina. Do CAN WAIT 2 first: make bleeding sheets size containers.                                                                                                                                                                                              | S                                                                               | defect    |
| 2    | **Dark palette v2** (§5): mock both ink-sheet options, the user picks, then change the tokens, `contrast.test.ts` and `money-colours.test.ts`. Move the grain off money fills. `--muted` goes above the sheet. Plate variant for logos in dark. Palette avatars.                                                                                                                                                                                                   | M                                                                               | defect    |
| 3    | **Phase 3a, the feed board.** Top bar (search pill, month picker with round arrows). Balance sheet with fanned account sheets and the 252px numeral. Sapphire month sheet with charges by day. Categories `HueBars` sheet. Transactions sheet with hue pills, company chips, 600/300 rows and 2px day lines. Wallet column with `CardSheet`s and the cash sheet. 12-column board on `@board/@wide/@vast`. Phone order: balance, month, categories, recent, wallet. | L+ (5–7 days; split into balance, month and categories, then rows, then wallet) | P3        |
| 4    | **Phase 3b, Cards.** Ink summary sheet with numeral and box. One `CardSheet` per card, sides swapping, half-depth bleed. Details pane via `?card=` (panel at board width, beside from wide). Retire the bordered boxes. Land or rebase the add-card flow first (spec §11).                                                                                                                                                                                         | L                                                                               | P3        |
| 5    | **Editor polish across all 9 panels.** 48px outline Cancel and solid Save pills. Header and body on one inline padding. Spacing under the title pair. `PopOutBody` footer used by split, import and reconvert.                                                                                                                                                                                                                                                     | S–M                                                                             | defect    |
| 6    | **The add-card flow** (its own branch): the 7-step pop-out, colour tiles with an ink ring and "Selected ✓" box, the black preview sheet with the live `CardFace`.                                                                                                                                                                                                                                                                                                  | L                                                                               | add-card  |
| 7    | **3d Cash.** Yellow cash sheet with a 150px total; person sheets side by side with Count, Withdraw and Deposit pills; moves sheet. Drop the duplicate floating Add on desktop, or fold it into the rail's menu.                                                                                                                                                                                                                                                    | M                                                                               | P3        |
| 8    | **3f Categories.** Hue pill and month hue bar per row, the hue picker in the editor.                                                                                                                                                                                                                                                                                                                                                                               | M                                                                               | P3        |
| 9    | **3c Bank accounts.** One bank-colour sheet per account, figure in the box, 2–4 across.                                                                                                                                                                                                                                                                                                                                                                            | M                                                                               | P3        |
| 10   | **3g Settings.** Two panes, `/settings` redirects to `/settings/account` on desktop, the 44px pass.                                                                                                                                                                                                                                                                                                                                                                | M                                                                               | P3        |
| 11   | **3e Chart, 3h Import, 3i Commitments.**                                                                                                                                                                                                                                                                                                                                                                                                                           | M each                                                                          | P3        |
| 12   | **3j motion clean-up.** Then the CAN WAIT items from the final review: the unlayered sheet border, container-sized shared components, the forced-colours edges.                                                                                                                                                                                                                                                                                                    | S–M                                                                             | P3/defect |

**What phase 3 must contain to look like the concept** (a checklist for each screen PR):

- **Sheets, not boxes.** No `border border-border rounded-xl` container left on a screen. Every block is a `[data-sheet]` with `--r-sheet` and the 8/16px sheet gap.
- **One tint per sheet.** Nothing on a money sheet in plain white or black.
- **At least one huge Karantina figure** per hero sheet, whole shekels, bleeding off the foot only. Never with agorot and never under 28px.
- **One or two black figure boxes per sheet**, never more.
- **Hue marks.** Rows lead with the hue pill. Category totals are hue bars. Card and bank references are company-colour chips.
- **Pills.** 2px outline pills and 48px round arrow buttons. The one primary action is the solid sapphire pill.
- **The desktop board fills `main`** on the 12-column grid. No 640px column at 1440.
- **Both themes in the screenshot matrix**, placed beside the matching concept frame and shown to the user **before** the screen is released.

**Process change:** a phase that changes how the app looks should not be released until the user has seen side-by-side screenshots against the approved concept and said yes. Phases 1-2 should have stayed off production, or gone out with an explicit "the new screens come next" note. The release gate (`verify:full`) checks correctness. Nothing checked resemblance, and the screenshot matrix was not run in the final review.
