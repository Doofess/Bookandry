# Colour of money (צבע הכסף): design

**Status:** Design chosen in chat on 2026-10-09 (Bold sheets); this spec awaits review.

## What the user asked for

- 2026-10-06: "more alive, colorful, nice fonts".
- On the pastel mockups: "i need colors that match the different banks and companies … it feels generic … unique font and elements, colors".
- During the sapphire round: "don't like the colorful icons".
- 2026-10-09: "the app needs to be colorful and crazy and also make better use of space in the desktop versions", "like many other fintech companies".
- 2026-10-09, after Colour of money was chosen:
  - "make it more crazy less generic";
  - then, rejecting the two loud versions: "i like colour of money way more but colour of money feels a little bit too generic it can be a bit more interesting. https://vojta.io/ … i love this design";
  - then, choosing Bold sheets;
  - then, on its numerals: "in some elements the numbers kinda sink into the ui and i kinda prefer if it still did it but less", and "less deep";
  - then approved v2's depth.
- On every open point: "pick the most recommended answers for me".

## Sources

- **The chosen look:** `.superpowers/concepts-2026-10-09/money-sheets-bold.html` ("Bold sheets").
  - It is vojta.io's structure carrying full-strength bank and card company colours.
  - Where it differs from the first Colour of money page (`brand-colours.html`), Bold sheets wins.
  - The final file is `money-sheets-bold-v2.html`, which the user approved. It is the same page with a shallower numeral bleed (section 9.4).
- **The rejected ones:** `money-loud.html`, `money-street.html`, `fintech-maximal.html` and `tel-aviv-bauhaus.html`, in the same folder.
- **The reference:** vojta.io. Screenshots are in `.superpowers/concepts-2026-10-09/vojta-shots/`. A summary is in memory `design-references`.
- **The desktop audit, 2026-10-09, at 1440 and 1920:**
  - Feed, Chart, Cash, Categories, Commitments and Settings are a 672px column, 35% of a 1920 screen. Cards and Bank accounts are 896px.
  - From `xl` a 224px empty pad sits on the far side.
  - Every editor is a full-width bottom sheet. So the add-transaction fields stretch to about 1,900px, and Cancel and Save sit about 950px apart.
  - Settings is reachable only through the account icon.
- **The CSS rulebooks for whoever builds this:**
  - the **good-css** skill (`good-css:good-css`), by vojta.io's designer;
  - the **modern-web-guidance** skill, for browser support and fallbacks.

  Section 10 lists the two places this spec departs from good-css, and why.

- **Specs this builds on:** `2026-10-08-sapphire-redesign-design.md` (pop-outs, the + button, the rules in memory `redesign-followups`) and `2026-10-09-cash-deposit-design.md`.
- **A spec built on this one:** `2026-10-09-add-card-flow-design.md`, on branch `add-card-flow`. Its decision 15 waits for this redesign's colours and fonts. Section 6.4 lists what it gets.

## Decisions

"Concept" means Bold sheets settles it. "Taken here" means this spec settles it, on the user's instruction to pick the recommended answer.

### Colour

1. **The house is ink on warm, grained paper. Money comes as full-strength coloured sheets** (concept). Colour then always means a bank, a company, a card or a category.
2. **Sapphire is the app's own colour and never a bank's** (concept). It is used for primary buttons, the current step, focus and the month sheet.
3. **Money colours are data-driven tokens** (taken here).
   - Keys: a bank by its Masav code, a card company by its issuer id, a card by its stored colour key, a category by its hue key.
   - Data stores only the key, never a colour value. A shade can then change without touching anybody's data.
   - Each money key has three tokens, each with a light and a dark value: a fill, a tinted text colour, and a lifted colour for figures in the black box.
4. **Text on a sheet is a tint of the sheet's own hue** (concept).
   - A dark sheet speaks in a pale tint (lightness 0.95–0.97, chroma 0.03 or less, same hue).
   - A light sheet speaks in a deep tint (lightness 0.20–0.22, chroma 0.045–0.06, same hue).
   - The tints are authored in `index.css` by that rule, and a test re-checks each against its fill (taken here): same hue within 2°, and at least 4.5:1.
   - They are not computed at runtime. Every key is known in advance, and relative colour syntax has been Baseline only since September 2024 (Safari 18).
5. **Lines, tints and transparent versions use `color-mix()` in OKLCH** (taken here). good-css requires it, and it is Baseline widely available.
6. **Colour is never the only carrier of information** (taken here). Every bar has a name and an amount beside it, and every chip carries its name. So a sheet needs no ratio against the page.
7. **Brand fills deepen slightly in dark mode; category hues are lifted** (concept). The tinted text keeps its contrast on the deeper fill. The category marks stand out on the dark paper.
8. **Hapoalim, Max and Amex are darkened slightly** (concept). With the first page's values, their tinted text measured 4.60, 4.84 and 4.49:1. Now it measures 5.44, 5.42 and 5.00:1. Section 13 pins them.
9. **Twelve bold category hues, each in two tones** (concept for the twelve hues, taken here for the second tone). The app has 24 built-in expense categories. Two tones give 24 distinct marks, so no two built-in expense categories share one.
10. **Category hues are marks only: they never carry text** (taken here). Four of the twelve can't reach 4.5:1 with either ink or paper text. As bars and pills they need only 3:1, and every one measures 3.05:1 or more.
11. **No coloured icons** (the user's words). A row leads with its category's hue pill instead of an icon (concept). Icons stay monochrome, in the category picker and on the Categories screen.
12. **Every sheet is a colour context** (taken here). Inside a sheet, text, focus ring, lines, selection and pressed pills all take their colours from the sheet. A component needs no per-sheet styling.
13. **The shadcn token names stay the public API** (taken here). `--background` is paper, `--card` is the paper sheet, `--primary` is sapphire. Components already use these names, so phase 1 changes values, not call sites.
14. **Sapphire as text gets its own token, `--primary-ink`** (taken here). Bold's dark sapphire is a deep fill. As text on the dark paper it would measure 2.06:1.
15. **Field edges keep `--input` at 3:1** (taken here). Bold's 2px `--line` (ink at 14%) is decorative. A field's edge is its only affordance, as WCAG 1.4.11 says.

### Type

16. **Karantina 700 for display and big numerals; IBM Plex Sans Hebrew 300, 400, 500 and 600 for text** (concept). 600 is for titles and names, 300 for subtitles and reading, 500 for pills and amounts in rows.
17. **Both are self-hosted from Fontsource** (taken here).
    - `@fontsource/karantina` 5.3.0 and `@fontsource/ibm-plex-sans-hebrew` 5.3.0, both OFL-1.1, checked on npm on 2026-10-09.
    - Plex Sans Hebrew has no variable build.
    - The PWA works offline, so the files are precached with the rest of the app.
18. **Inter, Heebo and Frank Ruhl Libre are removed** (taken here). Plex Sans Hebrew covers Latin, Hebrew and ₹ by itself, and its digits are fixed-width by default.
19. **`font-synthesis: none`, so every weight used is loaded and `font-bold` leaves the codebase** (taken here, from good-css). Plex 700 isn't loaded. A test bans `font-bold` outside the display face.
20. **Karantina is never used below 28px, or for figures that line up or count** (taken here). Its digits are proportional (243 to 383 units wide), and it has no `tnum` feature. Amount columns stay in Plex.
21. **Only Karantina is preloaded** (taken here). It draws the largest thing on the first screen.
22. **Fallback metrics use `@font-face` overrides, not `font-size-adjust`** (taken here). `font-size-adjust` normalises by x-height, which Hebrew letters don't follow.

### Layout

23. **Desktop starts at `lg` (1024px)** (taken here). That is where the rail already starts. Below it the app is the phone layout.
24. **Screens lay out by the width of `main`, not the window** (taken here). `main` is a size container. Three container sizes, board, wide and vast, match roughly 1024, 1440 and 1920 windows.
25. **The empty pad on the far side goes** (taken here, from the audit). Content fills `main` up to 1680px.
26. **The feed is the overview on desktop** (taken here). Bold's desktop home is the feed at desktop widths: the balance sheet, then month and categories, then the transactions and the wallet. Its transactions sheet is the full feed. There is no separate Overview route, so home is the same place on every screen size and the list is never drawn twice.
27. **The phone keeps four tabs** (taken here). Bold's phone mockup shows Settings as a fifth tab. `routes.ts` records why Settings left the tabs, and nothing here changes that reasoning. The desktop rail lists Settings.
28. **The rail lists places only; Add is a button at its top** (taken here). Smart import stays in the Add menu. A nav that mixes links and actions is harder to use with a screen reader.
29. **The rail and the tab bar are text pills with no icons** (concept). The current one is filled with ink.
30. **Editors open as an end-side panel from `lg`; flows open as a centred pop-out** (taken here, from the audit). Each editor is one popup with responsive classes, so resizing never loses what was typed.
31. **The pop-out is up to 1140 by 732px and lays out by its own width** (concept, ruled here). One pane below 720px wide. Steps and body from 720px. Steps, body and a live preview from 1040px. This replaces the add-card spec's 448px (`max-w-md`) window, and that spec is amended to match.
32. **Settings opens as two panes on desktop** (taken here, from the audit). The list of subjects stays beside the open subject.

### Motion

33. **Calm motion** (concept).
    - Pills and round buttons fill in 150ms.
    - Presses scale to 0.97, or 0.98 for tiles.
    - Panels and pop-outs enter through `@starting-style`.
    - Routes change through same-document view transitions. Steps change through `morph()`.
    - Nothing else moves by itself: no reveals, no scroll-driven effects.
34. **Movement is opt-in under `prefers-reduced-motion: no-preference`** (taken here, from good-css). Colour fades are not movement and run for everyone. The old global rule that shortens every duration stays until every component has moved to opt-in, then goes (phase 3j).
35. **No CSS anchor positioning** (taken here). Base UI's positioner already anchors the seven pop-outs. CSS anchor positioning reached Safari only in version 26.

### Brand and chrome

36. **Sheets and tiles carry names, not logos** (concept). Bank and company logos (`BrandMark`) stay on a white plate, only in list rows that aren't sheets, such as the long bank list. A logo is never recoloured.
37. **The in-app mark is Bold's outlined circle with a Karantina "B"** (concept). The app icon and favicon keep the sapphire disc (taken here). Redrawing the installed icon isn't part of this work.
38. **The status bar follows the top of the current screen** (taken here). That is the paper, `#F6F2EA` in light and `#1A1510` in dark, or the sheet at the top if one reaches it.
39. **The engraved panel leaves the in-app screens; the front door keeps it** (taken here). The front door's layout is out of scope.

### Delivery

40. **Three phases, each shippable** (taken here). Tokens and fonts; then shell, editors and shared components; then the screens one by one. The add-card flow slots in after phase 2. Section 11 has the details.

## 1. Tokens

All tokens live in `src/index.css`, authored in OKLCH, as today. Hex values are given for reading. They were computed on 2026-10-09; an asterisk marks a value outside sRGB, which screens show clipped. `src/lib/contrast.test.ts` reads the file, as today.

### 1.1 The house

| Role                        | Token (existing name where one exists) | Light                                                     | Dark                                        |
| --------------------------- | -------------------------------------- | --------------------------------------------------------- | ------------------------------------------- |
| Page (paper)                | `--background`                         | `oklch(0.962 0.012 85)` `#F6F2EA`                         | `oklch(0.2 0.012 70)` `#1A1510`             |
| Paper sheet, popovers       | `--card`, `--popover`                  | `oklch(0.992 0.006 85)` `#FEFCF8`                         | `oklch(0.255 0.012 70)` `#27221D`           |
| Text (ink)                  | `--foreground`                         | `oklch(0.2 0.018 265)` `#12161E`                          | `oklch(0.95 0.012 85)` `#F2EEE6`            |
| Quiet text                  | `--muted-foreground`                   | `oklch(0.43 0.018 265)`: 7.26:1 on paper                  | `oklch(0.77 0.012 85)`: 7.62:1 on the sheet |
| Decorative line, 2px        | `--border`                             | `color-mix(in oklch, var(--foreground) 14%, transparent)` | the same mix                                |
| Field edge (3:1)            | `--input`                              | unchanged                                                 | unchanged                                   |
| The black box               | `--box`, `--on-box`                    | `oklch(0.15 0.01 265)` / paper                            | `oklch(0.11 0.006 70)` / ink                |
| Ink sheet                   | `--night`, `--on-night`                | `oklch(0.2 0.018 265)` / paper                            | `oklch(0.13 0.006 70)` / ink                |
| App accent (fill)           | `--primary`                            | `oklch(0.462 0.175 263)` `#1F4FB8`                        | `oklch(0.42 0.165 263)` `#1743A5`           |
| On the accent               | `--primary-foreground`                 | `oklch(0.97 0.02 263)`: 6.71:1                            | `oklch(0.96 0.025 263)`: 7.79:1             |
| Sapphire as text            | `--primary-ink` (new)                  | `= --primary`: 6.57:1 on paper                            | `oklch(0.78 0.12 263)`: 8.93:1 on paper     |
| Lifted sapphire, in the box | `--primary-hi` (new)                   | `oklch(0.82 0.1 263)`: 11.14:1 on the box                 | the same                                    |
| Focus                       | `--ring`                               | `= --primary`                                             | `= --primary-ink`                           |
| Money in                    | `--income`                             | `oklch(0.47 0.12 155)`: 6.26:1 on the sheet               | `oklch(0.8 0.15 155)`: 8.96:1               |
| Money out                   | `--expense`                            | unchanged                                                 | unchanged                                   |
| Pressed control             | `--press`, `--on-press`                | ink / paper                                               | ink / paper (flipped by theme)              |
| Behind a modal              | `--scrim`                              | ink at 50%                                                | `oklch(0.08 0 none / 0.6)`                  |

- `--brand-deep`, `--brand-deep-foreground` and `--brand-vivid` stay while the front door uses them. The app no longer does.
- `--accent` becomes `color-mix(in oklch, var(--foreground) 6%, transparent)`, a neutral highlight. Sapphire marks only the app's own actions now.
- Bold draws no shadows on sheets. `--shadow-pop` stays for pop-outs only: `0 40px 80px -30px oklch(0 0 none / 0.5)`.
- Grays, white and black are written with hue `none` where they are mixed (good-css). The house inks keep Bold's slight warm and cool hues, because they are never mixed toward another colour.

### 1.2 Sapphire's role

Sapphire is used for:

- primary buttons (the solid pill) and the Add button;
- the current step's number;
- focus rings on the paper;
- the month sheet on the feed.

It is never a bank's, a card's or a category's colour.

Leumi and Amex are blue too. Placement keeps them apart: sapphire is always on a control or on the month sheet, while money colours are on sheets, chips and marks that carry their name.

### 1.3 Money colours

**Naming.**

- Each key has three tokens:
  - `--money-<key>`, the fill;
  - `--money-<key>-on`, the tinted text;
  - `--money-<key>-hi`, the lifted colour for a figure in the black box.
- Dark values are declared in the `.dark` block, as for every other token.
- Keys:
  - `bank-<masav>`, for example `bank-10`;
  - `issuer-<CardIssuer>`, for example `issuer-cal`;
  - `card-<CardColor key>`, for example `card-teal`;
  - `cash`;
  - `neutral`.

**Banks and card companies (concept).**

| Key               | Name            | Fill, light                 | Fill, dark       | Text tint         | Lifted           | Text on fill, light / dark |
| ----------------- | --------------- | --------------------------- | ---------------- | ----------------- | ---------------- | -------------------------- |
| `bank-10`         | Leumi           | `0.476 0.145 254` `#0C5CAB` | `0.44 0.14 254`  | `0.965 0.025 254` | `0.8 0.11 254`   | 6.05 / 7.07                |
| `bank-12`         | Hapoalim        | `0.52 0.205 25` `#C40E22`   | `0.48 0.19 25`   | `0.965 0.025 25`  | `0.8 0.12 25`    | 5.44 / 6.41                |
| `bank-11`         | Discount        | `0.5 0.12 155` `#0B7643`    | `0.45 0.11 155`  | `0.965 0.03 155`  | `0.83 0.14 155`  | 5.17 / 6.43                |
| `bank-20`         | Mizrahi-Tefahot | `0.684 0.184 44` `#F26B23`  | `0.65 0.175 44`  | `0.2 0.06 44`     | `0.72 0.17 44`   | 6.02 / 5.29                |
| `issuer-isracard` | Isracard        | `0.367 0.15 270` `#23328C`  | `0.34 0.14 270`  | `0.96 0.03 270`   | `0.8 0.1 270`    | 9.75 / 10.80               |
| `issuer-cal`      | Cal             | `0.657 0.112 195` `#01A6A6` | `0.62 0.105 195` | `0.2 0.045 195`   | `0.72 0.12 195`  | 5.93 / 5.12                |
| `issuer-max`      | Max             | `0.525 0.215 353` `#BD0475` | `0.48 0.2 353`   | `0.965 0.025 353` | `0.8 0.13 353`   | 5.42 / 6.49                |
| `issuer-amex`     | Amex            | `0.52 0.165 253` `#0068C4*` | `0.46 0.15 253`  | `0.965 0.025 253` | `0.82 0.1 253`   | 5.00 / 6.45                |
| `issuer-diners`   | Diners          | `0.312 0.02 261` `#2B313B`  | `0.34 0.02 261`  | `0.95 0.008 261`  | `0.86 0.03 261`  | 11.29 / 10.16              |
| `cash`            | Cash            | `0.861 0.159 86` `#FFC93C*` | `0.8 0.15 86`    | `0.22 0.05 86`    | `0.861 0.159 86` | 11.26 / 9.20               |

- **The lifted colours** measure at least 7.46:1 on the black box in both themes.
- **The other eight banks** take their logo colours from `brandColor()` (`src/data/brands.ts`), converted to OKLCH.
  - Each gets its tint and lifted colour by rule 4.
  - Its dark fill is 0.04 deeper, as the concept deepens the others.
  - One Zero's black is raised to ink (`0.2 0 none`) so the black box still reads on it.

  | Key       | Bank          | Fill, light       | Fill, dark        | Text tint         | Lifted           | Text on fill, light / dark |
  | --------- | ------------- | ----------------- | ----------------- | ----------------- | ---------------- | -------------------------- |
  | `bank-17` | Mercantile    | `0.459 0.1 145`   | `0.419 0.1 145`   | `0.965 0.025 145` | `0.82 0.07 145`  | 6.24 / 7.41                |
  | `bank-31` | FIBI          | `0.44 0.137 253`  | `0.4 0.137 253`   | `0.965 0.025 253` | `0.82 0.096 253` | 7.05 / 8.31                |
  | `bank-52` | PAGI          | `0.316 0.122 259` | `0.276 0.122 259` | `0.965 0.025 259` | `0.82 0.085 259` | 11.80 / 13.50              |
  | `bank-14` | Otsar HaHayal | `0.441 0.138 254` | `0.401 0.138 254` | `0.965 0.025 254` | `0.82 0.097 254` | 7.04 / 8.31                |
  | `bank-26` | U-Bank        | `0.408 0.119 251` | `0.368 0.119 251` | `0.965 0.025 251` | `0.82 0.083 251` | 8.05 / 9.45                |
  | `bank-46` | Massad        | `0.412 0.141 256` | `0.372 0.141 256` | `0.965 0.025 256` | `0.82 0.099 256` | 8.01 / 9.41                |
  | `bank-4`  | Yahav         | `0.403 0.152 269` | `0.363 0.152 269` | `0.965 0.025 269` | `0.82 0.1 269`   | 8.51 / 10.07               |
  | `bank-18` | One Zero      | `0.2 0 none`      | `0.16 0 none`     | `0.965 0 none`    | `0.82 0 none`    | 16.36 / 17.54              |
  - Every lifted colour here measures 11:1 or more on the black box.
  - `brandColor()` then retires. Its one caller, `bank-accounts-screen.tsx`, moves to the tokens.

- **The FIBI group** (FIBI, PAGI, Otsar HaHayal, Massad, U-Bank) really are all navy. They are told apart by name, as their logos are (`WORDMARK` in `brands.ts`).
- **No colour of its own.** A bank not in this list, an issuer of `other`, or an unknown card colour key uses `neutral`. That is the ink sheet, with the paper tint as text.

**Card colours.** These are the colours a person can give a card (`CARD_COLORS` in `card-colors.ts`).

- The stored keys don't change, so no data changes.
- Each becomes a solid fill (today's hex, converted) instead of today's Tailwind gradient classes.
- Text is a pale tint of the fill's own hue, by rule 4.
- The dark fill is 0.04 deeper, as for banks.
- Every lifted colour (`0.82`, the fill's hue, chroma at most 0.1) measures 10.8:1 or more on the box.

| Key           | Fill, light       | Text tint         | Text on fill, light |
| ------------- | ----------------- | ----------------- | ------------------- |
| `card-black`  | `0.24 0.01 277`   | `0.965 0.003 277` | 14.87               |
| `card-silver` | `0.514 0.023 258` | `0.965 0.006 258` | 5.10                |
| `card-blue`   | `0.459 0.12 260`  | `0.965 0.025 260` | 6.52                |
| `card-teal`   | `0.525 0.085 185` | `0.965 0.021 185` | 4.70                |
| `card-green`  | `0.434 0.085 153` | `0.965 0.021 153` | 6.96                |
| `card-gold`   | `0.494 0.088 82`  | `0.965 0.022 82`  | 5.61                |
| `card-orange` | `0.489 0.114 46`  | `0.965 0.025 46`  | 5.87                |
| `card-red`    | `0.428 0.138 19`  | `0.965 0.025 19`  | 7.80                |
| `card-rose`   | `0.513 0.133 0`   | `0.965 0.025 0`   | 5.43                |
| `card-purple` | `0.451 0.143 340` | `0.965 0.025 340` | 7.18                |

### 1.4 Category hues

**The twelve hues (concept).** Tone A is the concept's value. Tone B is the same hue:

- in light, lightness lowered by 0.14 and chroma ×0.85;
- in dark, lightness lowered by 0.12 and chroma ×0.9.

So the two tones always look like two colours.

| Hue key     | Tone A light    | Tone A dark     | Tone B light     | Tone B dark      |
| ----------- | --------------- | --------------- | ---------------- | ---------------- |
| `indigo`    | `0.5 0.16 272`  | `0.72 0.13 272` | `0.36 0.136 272` | `0.6 0.117 272`  |
| `green`     | `0.6 0.17 142`  | `0.76 0.17 142` | `0.46 0.145 142` | `0.64 0.153 142` |
| `vermilion` | `0.6 0.2 33`    | `0.72 0.17 33`  | `0.46 0.17 33`   | `0.6 0.153 33`   |
| `amber`     | `0.64 0.15 82`  | `0.82 0.15 82`  | `0.5 0.128 82`   | `0.7 0.135 82`   |
| `orange`    | `0.63 0.17 58`  | `0.76 0.16 58`  | `0.49 0.145 58`  | `0.64 0.144 58`  |
| `cyan`      | `0.58 0.12 222` | `0.76 0.11 222` | `0.44 0.102 222` | `0.64 0.099 222` |
| `violet`    | `0.55 0.2 302`  | `0.72 0.16 302` | `0.41 0.17 302`  | `0.6 0.144 302`  |
| `rose`      | `0.6 0.2 8`     | `0.74 0.16 8`   | `0.46 0.17 8`    | `0.62 0.144 8`   |
| `magenta`   | `0.52 0.22 332` | `0.7 0.18 332`  | `0.38 0.187 332` | `0.58 0.162 332` |
| `teal`      | `0.58 0.11 182` | `0.76 0.11 182` | `0.44 0.093 182` | `0.64 0.099 182` |
| `blue`      | `0.55 0.16 246` | `0.74 0.12 246` | `0.41 0.136 246` | `0.62 0.108 246` |
| `lime`      | `0.62 0.15 118` | `0.8 0.15 118`  | `0.48 0.128 118` | `0.68 0.135 118` |

How they measure:

- **Light theme, against the paper sheet:** tone A 3.33:1 or more (amber is the lowest); tone B 5.92:1 or more.
- **Dark theme, against the dark sheet:** tone A 5.42:1 or more; tone B 3.38:1 or more (magenta is the lowest).
- **Against the paper itself:** 3.05:1 or more in both themes.

They carry no text (decision 10).

**Built-in categories.** Each built-in has its hue in a code map, `BUILTIN_HUES`, in a new `src/domain/category-hue.ts`. The map is never written to rows. The concept's twelve keep their hues.

| Hue         | Tone A (expense)    | Tone B (expense)       | Tone A (income)  |
| ----------- | ------------------- | ---------------------- | ---------------- |
| `indigo`    | `cat.rent`          | `cat.buildingFee`      |                  |
| `green`     | `cat.groceries`     | `cat.fitness`          | `cat.investment` |
| `vermilion` | `cat.dining`        | `cat.cardFees`         |                  |
| `amber`     | `cat.kids`          | `cat.pets`             | `cat.cash_found` |
| `orange`    | `cat.transport`     | `cat.currencyExchange` |                  |
| `cyan`      | `cat.utilities`     | `cat.phoneInternet`    | `cat.salary`     |
| `violet`    | `cat.shopping`      | `cat.aiSoftware`       | `cat.freelance`  |
| `rose`      | `cat.health`        | `cat.insurance`        |                  |
| `magenta`   | `cat.subscriptions` | `cat.cash_missing`     |                  |
| `teal`      | `cat.entertainment` | `cat.travel`           |                  |
| `blue`      | `cat.education`     | `cat.loans`            | `cat.refund`     |
| `lime`      | (free)              | `cat.arnona`           | `cat.gift`       |

- `cat.otherExpense` and `cat.otherIncome` use `neutral`, so "Other" never looks like a category of its own.
- **Rules a test checks:**
  - every built-in has an entry;
  - no two expense built-ins share a hue and tone;
  - no two income built-ins share a hue and tone.
- Income and expense are never drawn in the same bar list or strip. The chart's in-versus-out view uses `--income` and `--expense`.

**Custom categories, and re-colouring a built-in.**

- `Category` gains an optional field, `hue?: string`. It holds a hue key with an optional tone suffix, for example `teal` or `teal-2`.
- The colour a category shows is resolved in this order:
  1. `hue`, if this build knows the key;
  2. then `BUILTIN_HUES[id]`;
  3. then a stable hash of the id onto the twelve tone A hues.

  An unknown key from a newer build therefore never breaks anything.

- **A new custom category** starts on the hue least used among active categories of its kind.
- **The category editor** shows two rows of 44px pills, tone A above tone B.
- **Re-colouring a built-in** writes `hue` on its row. Built-in rows already sync.

**Rollout with older builds.**

- An older build keeps fields it doesn't know. Sync stores the row as received, and edits spread the existing row (the cash spec, 1.1).
- Phase 1 adds a test that a category edit keeps `hue`.
- `transfer-schema.ts` accepts `hue` as a loose optional string.
- The `mcc-categories` branch also adds an optional field to `Category`. The two are independent, and whichever lands second merges the schema line.

**Many categories at once.**

- A bar list shows the largest 10 categories, then one `neutral` bar, "Other".
- A thin strip (the phone summary) shows the largest 7, then "Other".
- Strip segments sit 2px apart, so two that look alike still read as two.

### 1.5 How a component gets its colour

**Keys, not colours.** A component never writes a colour. It sets one of:

- `data-sheet="paper" | "night" | "sapphire" | "money"`;
- with `money`, a `data-money` key, for example `data-money="bank-10"`;
- on a category mark, `data-hue="teal"` or `"teal-2"`.

**The mapping, in `index.css`.** Each key resolves to four custom properties. A key this build doesn't know falls through to `neutral`.

| Property     | Meaning                                 |
| ------------ | --------------------------------------- |
| `--fill`     | the sheet's colour                      |
| `--on-fill`  | its tinted text                         |
| `--box`      | the black box's background              |
| `--box-text` | the box's text: the key's lifted colour |

On the ink sheet the box flips: it is paper-coloured, with ink text (concept).

**The helpers.** `src/domain/money-key.ts` turns data into keys:

- `bankKey(code)` normalises through `bankByCode`, as `BankMark` does;
- `issuerKey(issuer)`;
- `cardKey(method)` returns the card's own colour key, or its issuer's;
- `methodKey(method)` covers bank accounts, cards and cash.

Components call these and never build a key by hand.

### 1.6 A sheet is a context

Everything inside a sheet takes its colours from the sheet:

```css
[data-sheet] {
  background-color: var(--fill);
  color: var(--on-fill);
  --foreground: var(--on-fill);
  --muted-foreground: var(--on-fill); /* quiet text is weight 300, not a paler colour */
  --border: color-mix(in oklch, var(--on-fill) 30%, transparent);
  --input: color-mix(in oklch, var(--on-fill) 70%, var(--fill));
  --ring: currentColor;
  --press: var(--box);
  --on-press: var(--box-text);
  --accent: color-mix(in oklch, var(--on-fill) 12%, transparent);
}
[data-sheet] ::selection,
[data-sheet]::selection {
  background-color: var(--on-fill);
  color: var(--fill);
}
```

- **Buttons, fields, dividers, chart axes and focus rings** therefore need no per-sheet styling.
- **The selection** turns the sheet inside out, as on vojta.io.
- **On the paper itself,** the selection is ink with paper text.
- **Quiet text inside a sheet** is set apart by weight 300, as in the concept, never by a paler colour. Every piece of text on a sheet therefore passes at the tint's own ratio.

### 1.7 Dark mode parity

- **The switch.** The `.dark` class on `<html>` stays. The boot script in `index.html` sets it before first paint, as today. Section 10 says why this departs from good-css's `light-dark()`.
- **Every token has a dark value:**
  - the house gets Bold's warm dark paper;
  - brand fills deepen slightly, and their tints stay;
  - category hues are lifted;
  - the black box gets darker still;
  - the grain changes blend.
- **`<meta name="color-scheme" content="light dark">`** is added to `index.html`, so the canvas isn't white before the CSS loads.
- **Checks.** The screenshot matrix and the contrast test both run in both themes.

### 1.8 Forced colours

- In Windows High Contrast, backgrounds and background images are replaced by system colours. Sheets, the grain and the hue pills all disappear.
- So every sheet, tile and pill also gets a `2px solid transparent` border, which forced colours paint as an outline.
- Hue pills are `aria-hidden`, and their names are text beside them.
- `forced-color-adjust: none` is used only on the hue picker's swatches, where the colour is what is being chosen.

## 2. Fonts

### 2.1 What was checked (2026-10-09, from the 5.3.0 packages, with fontTools)

|                            | Karantina 700                                           | IBM Plex Sans Hebrew 300 / 400 / 500 / 600           |
| -------------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| Licence                    | OFL-1.1                                                 | OFL-1.1                                              |
| Subsets shipped            | hebrew, latin, latin-ext                                | hebrew, latin, latin-ext, cyrillic-ext               |
| Hebrew letters, ׳ ״ ־      | yes                                                     | yes                                                  |
| Digits 0–9, $ € £ ¥ % −    | yes, in latin                                           | yes, in latin                                        |
| ₪                          | yes, in hebrew and latin-ext                            | yes, in hebrew and latin-ext                         |
| ₹                          | **no**: drawn by the fallback face                      | yes, in latin-ext                                    |
| Basic Cyrillic (А–я)       | **no**                                                  | **no** (cyrillic-ext covers only the extended block) |
| Digit widths               | proportional, 243–383 units                             | 600 units in every weight checked                    |
| Digit height               | 600 units; comma −63 to 93; period 0 to 103; ₪ 0 to 500 |                                                      |
| `tnum` feature             | no                                                      | no, and none is needed                               |
| Size, latin + hebrew woff2 | 14.6 KB + 5.7 KB                                        | about 25 KB per weight                               |

- **What falls back.** A ₹ in a Karantina figure is drawn by the Karantina fallback face. A Russian name is drawn by the system font.
- **Karantina's two subsets.** Its digits are in the latin file and its letters in the hebrew file, so a Hebrew screen needs both.

### 2.2 The stack

The comment in `index.css` that begins "THE ORDER OF THIS STACK IS LOAD-BEARING" is rewritten:

```css
:root {
  --font-stack-sans:
    'IBM Plex Sans Hebrew', 'Plex Fallback', system-ui, -apple-system, 'Segoe UI', 'Noto Sans Hebrew', Arial,
    sans-serif;
  --font-stack-display: 'Karantina', 'Karantina Fallback', 'Plex Fallback', sans-serif;
}
```

- **The new warning:** "Putting a face without fixed-width digits before Plex, or adding a `:lang(he)` font rule, breaks amount alignment."
- **"Do not declare font-family anywhere outside this file" stays.** The fallback `@font-face` rules live there too.
- **Tailwind.** `--font-sans` and `--font-display` keep their names.
- **The `font-display` utility** sets `font-weight: 700` itself. Karantina is never seen at any other weight.

### 2.3 Rules for the display face

- It is used only at 28px (1.75rem) and up.
- It is never used in an amount column, a table, or any figure compared down a list.
- **A figure that counts up** (`count-up.tsx`) reserves its box from the final value, so proportional digits never make the line jitter.
- **Figures in either face** are LTR-isolated runs (`dir="ltr"`, `unicode-bidi: isolate`), as today.
- **Numerals that run off a sheet** follow 9.4.

### 2.4 Loading

- **Imports in `main.tsx`** use Fontsource's per-weight CSS, which carries `unicode-range` for each subset:
  - `@fontsource/karantina/700.css`;
  - `@fontsource/ibm-plex-sans-hebrew/{300,400,500,600}.css`.

  The per-subset files have no `unicode-range`, so they aren't used.

- **Swap.** Fontsource sets `font-display: swap`.
- **Precache.** The workbox `globIgnores` in `vite.config.ts` excludes `*-cyrillic-ext-*` woff2 files.
  - The hebrew, latin and latin-ext files are precached, about 165 KB in all.
  - The cyrillic-ext file is fetched online if a page ever needs it.
- **Preload.** A small Vite plugin (`transformIndexHtml`, build only) finds the emitted Karantina latin and hebrew 700 files. It adds a `<link rel="preload" as="font" type="font/woff2" crossorigin>` for each.
  - That is two preloads, within the preload guide's limit.
  - After the service worker installs, fonts come from its cache.
- **Fallback faces,** measured on 2026-10-09 against Windows Arial with fontTools:

  ```css
  @font-face {
    font-family: 'Plex Fallback';
    src: local('Arial'), local('ArialMT'), local('Roboto');
    size-adjust: 103%; /* Latin text 1.019, Hebrew text 1.044 */
    ascent-override: 99.5%; /* 1.025 / 1.03 */
    descent-override: 26.7%; /* 0.275 / 1.03 */
    line-gap-override: 0%;
  }
  @font-face {
    font-family: 'Karantina Fallback';
    src: local('Arial Bold'), local('Arial-BoldMT'), local('Roboto Bold');
    size-adjust: 60%; /* digits 0.584, Hebrew 0.672: sized for figures */
    ascent-override: 143%; /* 0.859 / 0.60 */
    descent-override: 25.5%; /* 0.153 / 0.60 */
    line-gap-override: 0%;
  }
  ```

  The Karantina fallback is sized for figure width. A balance in it takes the same room and never overflows.

### 2.5 What goes

- **Packages removed:**
  - `@fontsource-variable/inter`;
  - `@fontsource-variable/heebo`;
  - `@fontsource-variable/frank-ruhl-libre`.

  The lockfile changes in phase 1.

- **`font-bold` (700)** is replaced by `font-semibold` (600) across the code. With `font-synthesis: none`, a weight that isn't loaded would render as regular.
- **The front door** takes the new fonts with the token change. Its layout and engraving stay.
- **`public/legal.css`** takes the new stack.

## 3. The mark, brand marks and the browser's chrome

- **The in-app mark** is Bold's: a 46–48px circle with a 2px ink outline and a Karantina "B", beside "Bookandry" in Plex 600.
  - It replaces the sapphire disc in the rail, the screen head and the front door.
  - `logo.tsx` keeps the disc for the installed icon only (decision 37).
- **Brand marks.** `BrandMark` keeps its white plate.
  - It appears only in list rows that aren't sheets: the long bank list in pickers, import rows, and the bank accounts list's add flow.
  - Sheets and tiles carry the name instead.
  - The safety scan of every SVG and the `<img>`-only rule stay.
- **The status bar.** `index.html` keeps one `theme-color` meta.
  - The boot script removes its `media` attributes and sets it to the resolved theme's paper before first paint: `#F6F2EA`, or `#1A1510` in dark.
  - A hook, `useThemeColor()`, then sets it to the computed background of whatever sits at the top of the current screen. It does this on every route change and theme change.
- **The manifest.** `theme_color` and `background_color` become `#F6F2EA`.
- **Icons.** `pwa-assets.config.ts`, `favicon.svg` and the PWA icons don't change.
- **Pinned by test.** `brand-colours.test.ts` is updated to the new values.

## 4. The shell

### 4.1 Breakpoints

| Window             | Shell                         | Editors                                                    | Content                                        |
| ------------------ | ----------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| below 640 (`sm`)   | four text pills at the bottom | bottom sheet; pop-out fills the screen                     | one column of sheets, 8px apart                |
| 640–1023           | the same                      | bottom sheet; pop-out centred, laid out by its width (6.2) | one column, at most 672px                      |
| 1024 and up (`lg`) | rail at the inline start      | panel at the inline end; pop-out centred                   | `main` is a container (4.3); sheets 16px apart |

### 4.2 The rail (from `lg`)

- **Size and surface.** 256px wide (concept), on the paper, with a 2px `--border` at its inline end. The engraving leaves the rail.
- **From top to bottom:**
  1. The mark (section 3), which goes home.
  2. **Add:** the solid sapphire pill, full width, opening the Add menu (Expense, Income, Smart import).
     - On desktop it moves here from the bottom-end corner, and is on every screen, because the editor opens as a panel over any of them.
     - On a phone, Add stays on the feed only.
  3. **Places:** Feed, Chart, Cards, Bank accounts, Cash. The phone's tab order is kept, with Bank accounts after Cards. Cards and Bank accounts show their count in weight 300.
  4. A 2px line.
  5. **Set-up places:** Categories, Commitments, Settings.
  6. **At the foot:** the account menu trigger, with the linked people's avatars and names in weight 300.
- **Nav items.** Each is a 48px pill. The current one is filled with `--press` (ink) and set in weight 600.
- **Unchanged.** One `<nav>` with responsive classes, `aria-current="page"`, and the sr-only "(current)".
- **The phone tab bar** uses the same pills, four across, with no icons.

### 4.3 `main` (from `lg`)

- **Padding.** `main` loses `xl:pe-56`, so there is no empty pad on the far side.
- **Container.** `main` is `@container/main`. Three container sizes are declared in `@theme`:
  - `--container-board: 760px`, which a 1024 window reaches;
  - `--container-wide: 1080px` (`main` is 1184px at 1440);
  - `--container-vast: 1440px` (`main` is 1664px at 1920).
- **The content box.** At most 1680px, centred in `main`, with 24px padding (concept).
- **The top bar.** It sits above the board:
  - the screen's title pair (section 9.5);
  - a search pill;
  - the month picker, with round arrow buttons on both sides of the month name.
- **The board.** Screens lay out on a 12-column grid with the sheet gap (9.1). They use `@board/main:`, `@wide/main:` and `@vast/main:` variants, never viewport variants. So a screen beside an open panel, or inside a pop-out, lays itself out by the room it really has.
- **No bounce on desktop.** `html` gets `overscroll-behavior-y: none` for a fine pointer only, so the rail never drags with a trackpad bounce. Panels and lists get `overscroll-behavior: contain` (good-css).

### 4.4 The phone

- **The screen head.** The screen's name in Karantina at 76px, with the screen's one action as a pill beside it.
- **Below it,** the sheets, 8px apart, on the grained paper.
- **Unchanged:** the collapsing header, the safe-area insets and the four tabs.

## 5. Desktop layout, screen by screen

Column spans are out of 12, by container size.

| Screen            | board (≈1024)                                                 | wide (≈1440)                                                  | vast (≈1920)                                        |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| **Feed**          | balance 12; month 5 + categories 7; transactions 7 + wallet 5 | balance 12; month 4 + categories 8; transactions 7 + wallet 5 | the same as wide, with the accounts column at 520px |
| **Chart**         | the chart 12; stats below in 3 columns                        | the chart 8 + stats 4                                         | the chart 9 + stats 3                               |
| **Cards**         | summary 12; card sheets 12; details open as a panel           | summary 12; card sheets 7 + details 5                         | summary 12; card sheets 8 (2 across) + details 4    |
| **Bank accounts** | account sheets 2 across                                       | 3 across                                                      | 4 across                                            |
| **Cash**          | the pot 12; one sheet per person, 2 across; moves 12          | the pot 12; people 3 across; moves 8 + the month 4            | people 4 across                                     |
| **Categories**    | expense 12, then income 12                                    | expense 6 + income 6                                          | the same, each list 2 across                        |
| **Commitments**   | list 8 + totals 4                                             | the same                                                      | list 8 (2 across) + totals 4                        |
| **Settings**      | subjects 4 + subject 8                                        | the same                                                      | the same                                            |

### 5.1 Feed

**The balance sheet** (ink, full width; concept):

- On the text side:
  - the title pair ("All the household's money" / "today, in four banks and the wallet");
  - a lede in weight 300, with its key figures in the black box;
  - the balance as a huge numeral running off the sheet's foot (9.4).
- On the other side, one sheet per bank account, then cash, each in its bank's colour.
  - Each shows its name, account and amount.
  - They are tilted and offset (9.1), and the last runs off the sheet's foot.
  - At board width they sit under the text instead of beside it.

**The month sheet** (sapphire):

- the title pair ("October so far" / "day 9 of 31");
- came in and went out, as rows;
- a track bar for the share spent;
- a note with its figure in the box;
- the card charges by day, each with:
  - the day in Karantina;
  - the issuer chips;
  - the amount;
  - a 2px line through the amount once charged;
- "Left this month" as a huge numeral.

**The categories sheet** (paper):

- the title pair ("October by category" / "₪14,362 in ten categories") and a pill linking to Categories;
- one 30px hue pill bar per category, at least 30px long;
- each with its name and amount.

**The transactions sheet** (paper):

- the title pair, and a round arrow button to "All transactions" on a phone;
- day headings, each over a 2px line;
- the rows, each with:
  - the hue pill (14 by 40px) at the start, which is also the category pop-out button, with a 44px hit area;
  - the merchant in weight 600;
  - a meta line in weight 300 with the category name and the card chip in its company's colour;
  - the amount in weight 500.
- On desktop this sheet is the full virtualised feed, with the filter bar at its top.

**The wallet column:**

- a heading pair and a "+ Card" pill;
- one card sheet per card (top 5 by spend, then "All cards"), sides swapping from sheet to sheet;
- the cash sheet (yellow), with Count and Withdraw pills and its total as a huge numeral.

**Sticky columns.**

- The wallet is `position: sticky` below the collapsed bar.
- The list scrolls the window, so `useWindowVirtualizer` stays.
- Its `scrollMargin` is the list's offset from the top of the document. It is re-measured when the rows above change height (a `ResizeObserver` on them).

**The collapsed bar** spans the content box, and `--feed-sticky-top` keeps its meaning.

**Rows** are a size container. From 560px a row puts category, card and person on one line.

**The phone.** The same sheets in one column:

- balance;
- month;
- categories, as the largest 7 with "All";
- recent transactions;
- the wallet.

### 5.2 Chart

- The plot stays an LTR island, on a paper sheet.
- **Its stats** are a sheet beside it:
  - in, out and net, as figures in the box;
  - the five largest categories as hue pill bars;
  - the largest and the average month.
- At board width the stats sit below in three columns.

### 5.3 Cards

- **The summary** is an ink sheet: "Leaves the bank this month", with a huge numeral, and the next charge's figure in the box (concept's phone).
- **The cards.** One `CardSheet` per card (7.1), in the company's or the card's own colour.
  - Sides swap from sheet to sheet.
  - The ⋯ menu stays.
- **Details.** Selecting a card sets `?card=<id>` (pushed, so Back closes it) and fills the details pane:
  - the card as a `CardFace`;
  - its bills by month;
  - its transactions;
  - its rate and fees;
  - "Edit card".
- **Where details show:** in a panel at board width, and as today's card panel on a phone.

### 5.4 Bank accounts

- Each account is a sheet in its bank's colour. It shows:
  - the name in weight 600;
  - the branch and account mask in weight 300;
  - the income that goes to it;
  - its figure in the box.
- Editing opens the panel.

### 5.5 Cash

- **The pot** heads the screen: a `cash` sheet with the total as a huge numeral.
- **One sheet per person** below it, side by side, each with:
  - their amount;
  - when they last counted;
  - Count, Withdraw and Deposit pills.
- **The moves list** is a paper sheet. At wide, the month's in and out sit beside it.

### 5.6 Categories

- **Each row:**
  - the hue pill;
  - the monochrome line icon;
  - the name;
  - this month's total as a hue bar;
  - the ⋯ menu.
- The editor opens as a panel, with the hue picker (1.4).

### 5.7 Settings

- **In the rail.** Settings is listed in the rail, and the account menu at the rail's foot also links to it.
- **Two panes from board width:** the subjects (Account, Account linking, Security, Preferences, Data) as a paper sheet of nav pills, and the open subject as a paper sheet beside it.
- **Opening `/settings` on desktop** replaces the URL with `/settings/account`, so the second pane is never empty. On a phone, `/settings` stays the list.
- **Resizing.** A window widened to desktop on `/settings` makes the same replacement. One narrowed to a phone shows the open subject alone, with its back link.

### 5.8 Commitments

- The list, beside the totals by kind and the next charges.
- At vast, the list runs 2 across.

### 5.9 Import

Smart import opens as the pop-out (6.2):

- **steps:** choose the file, review, finish cards;
- **body:** the found rows;
- **preview:** the fill view for the selected found card.

## 6. Editors: panels and pop-outs

### 6.1 The panel

- **Logical sides.** `SheetContent` gains logical sides, `side="start"` and `side="end"`, using `inset-inline-*`. The physical `left` and `right` sides are removed. Their slide-in transforms get `rtl:` mirrors, as `gate:rtl` requires.
  - The rail is at the inline start. The panel opens at the inline end: on the right in English and on the left in Hebrew.
- **`EditorPanel`.** A new wrapper, `src/components/ui/editor-panel.tsx`, renders one Base UI dialog popup with responsive classes:
  - **Below `lg`:** today's bottom sheet, `max-h-[92dvh]`, with the sheet radius on its top corners.
  - **From `lg`:** a panel at the inline end, `inline-size: 30rem` (480px).
    - It is inset by the sheet gap from the window's edges, so it is a sheet floating on the scrim, with the sheet radius on all four corners.
    - It is full height less those gaps.
  - **Inside, at any size:**
    - a header with the title pair and a round × button;
    - a body that scrolls (`overscroll-behavior: contain`);
    - a footer that stays put, with Cancel (outline pill) and Save (solid pill) side by side at the inline end.
- **Modality.** It stays modal: focus is trapped, Escape closes it, and focus returns to the opener.
- **Resizing.** One popup, so crossing `lg` with a half-filled form keeps everything.
- **Inside the panel,** forms are a size container. Pairs of short fields sit side by side from 400px.

### 6.2 The pop-out

`PopOut`, in `src/components/ui/pop-out.tsx`, is built on the Base UI dialog, as the add-card spec requires. It is one popup, always.

**Size and shape (concept):**

- **Below `sm`:** it fills the screen. Its footer sits above the safe area.
- **From `sm`:** it is centred:
  - `inline-size: min(71.25rem, 100vw - 4rem)`, which is 1140px at most;
  - `block-size: min(45.75rem, 100dvh - 4rem)`, which is 732px at most;
  - on the paper colour, with the dialog radius (9.1) and `--shadow-pop`, over a blurred scrim.

**Layout, by its own width** (it is a size container, `@container popout`):

| Width         | Layout                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| below 720px   | **One pane:** a header with the progress segments and "Step 1 of 7"; the preview, small, above the question; the body; the footer. This is the add-card spec's 2.2 layout. |
| 720px and up  | **Two panes:** `PopOutSteps` (232px) and `PopOutBody`, with a 2px line between them. The preview moves above the question.                                                 |
| 1040px and up | **Three panes:** `PopOutSteps` (232px), `PopOutBody`, and `PopOutPreview` (360px).                                                                                         |

**The three areas:**

- **`PopOutSteps`:**
  - the flow's title pair;
  - the steps as an ordered list of pills;
  - each step's number in a 32px outlined circle;
  - the current step filled with ink, carrying `aria-current="step"`, with its number on sapphire;
  - steps already reached are buttons.
- **`PopOutBody`:**
  - the progress segments;
  - the question as a title pair (48px and 24px on desktop, 32px and 19px on a phone);
  - the controls;
  - the footer, with Back (outline pill) and Next (solid pill) at the body's inline end, each at least 150px wide.
  - It is a size container. Choice tiles are 2 across from 440px and 1 across below.
- **`PopOutPreview`:**
  - an ink sheet inset 12px from the pop-out's edges, with the preview radius;
  - the round × button in its corner;
  - the live content: for add-card, the tilted `CardFace` and a sample purchase row.

Missing areas collapse. A flow with no preview has two panes at most.

**Below 720px,** a flow with steps shows them as the segments in its header.

### 6.3 Which editor uses which

| Editor                                              | Today                   | From this redesign               |
| --------------------------------------------------- | ----------------------- | -------------------------------- |
| Add or edit a transaction (`transaction-sheet.tsx`) | bottom sheet            | panel                            |
| Split a purchase (nested in the transaction sheet)  | bottom sheet            | pop-out over the panel, one pane |
| Category editor (`categories-screen.tsx`)           | bottom sheet            | panel                            |
| Cash count and cash move                            | bottom sheet            | panel                            |
| Profile editor, account sheet                       | bottom sheet            | panel                            |
| Method editor (bank accounts and other methods)     | right sheet             | panel                            |
| Full breakdown (`breakdown-sheet.tsx`)              | bottom sheet            | panel                            |
| Reconvert currency                                  | bottom sheet            | pop-out, one pane                |
| Smart import (`import-sheet.tsx`)                   | bottom sheet            | pop-out with steps and preview   |
| Add a card, edit a card                             | (add-card spec)         | pop-out with steps and preview   |
| Delete and other alerts                             | alert dialog            | unchanged, restyled by tokens    |
| The seven anchored pop-outs                         | Base UI popover or menu | unchanged, restyled by tokens    |

A one-pane pop-out caps its own width at 36rem (576px) so a short form never stretches.

### 6.4 What the add-card flow gets

The add-card spec says its screens use only tokens, and use what this redesign gives cards as it lands. Phase 2 gives it:

- **The shell.** `PopOut` with `PopOutSteps`, `PopOutBody` and `PopOutPreview`, sized and laid out as 6.2 says.
  - Its spec's "centred, `max-w-md`" is amended to point here (decision 31).
  - The phone layout and the 2.2 order are unchanged.
- **`CardFace`** (7.2), filled by `cardKey()`:
  - the card's colour key, or its company's colour while "The card company's colour" is chosen;
  - tilted −4° in the preview;
  - its fill and text cross-fade in 150ms when the company changes.
  - The add-card spec planned to move the face out of `CardPanel` into `CardFace`. This redesign does that move.
- **`MoneyTile`** (7.3) for the company and bank choices.
  - A radio in a radio group, selected on activation.
  - The name in weight 600, with the other language's name in weight 300 beside it.
  - At least 70px tall on a phone and 96px in the desktop body.
  - Selected: an ink ring outside a paper ring, plus "Selected ✓" in the black box.
  - The flow's `choice-list.tsx` supplies the behaviour (moving on after 150ms; arrow keys never choosing).
- **Banks without a colour** (the long list behind "My bank isn't listed" and the less common banks) appear as list rows with `BrandMark` on its white plate.
- **Card colour swatches** from the `--money-card-*` tokens, 44px round, with "The card company's colour" first.
- **Motion.** `morph()` between steps, already used by the flow.

## 7. Shared components

Each takes its colour from a key (1.5), its size from its container, and its look from section 9.

### 7.1 `CardSheet`

- **A card as a sheet:**
  - the company or card colour;
  - the name in weight 600;
  - the holder and last 4 in weight 300;
  - the billing day in the black box;
  - this month's spend as a huge numeral.
- **Shape.** Sheet radius S (9.1), at least 108px tall (124px on a phone).
- **Sides swap from sheet to sheet:** `:nth-child(even of [data-card-sheet])` reverses the row.
- **PCI.** It never shows more than the last 4. `gate:pci` still applies.

### 7.2 `CardFace`

- **Shape.** The ISO card ratio (`aspect-ratio: 1.586`) with the face radius (9.1). A size container, with type in `cqi`.
- **Contents:**
  - the issuer's name in weight 600;
  - the holder in weight 300;
  - the last 4, LTR-isolated, spaced 0.1em;
  - the network's name, or a line about what comes later.
- **Variants:** `preview` (tilted −4°) and `details` (flat).
- **Accessibility.** Its accessible name is "<issuer> ending <last4>".

### 7.3 `MoneyTile`

- A selectable sheet in a money colour, with the sheet tile radius.
- **Selected:** the two rings (`0 0 0 3px var(--background), 0 0 0 6px var(--foreground)`) and a "Selected ✓" mark in the box. It is never shown by colour alone.
- **Focus:** a 3px `--ring` outline, offset 9px outside the rings (concept).
- **The "Not listed" variant:** transparent, with a 2px ink inset edge.
- **Press:** scales to 0.98.

### 7.4 `MoneyStrip` and `HueBars`

- **`HueBars`:** one 30px pill bar per category, at least 30px long, with the name and the amount.
- **`MoneyStrip`:** proportional segments 2px apart, used for the thin strips.
- **Widths** come from integer basis points worked out in `src/lib/money.ts`: `sharesBp(minors)`, with the largest remainder, so they always sum to 10,000.
  - CSS turns them into widths: `inline-size: calc(var(--bp) * 0.01%)`.
  - No other code divides money, so `gate:money` stays green.
- **Accessibility.** Strips are `aria-hidden`. Their legend, or the bar list's text, carries the data.

### 7.5 `Numeral`

- The huge Karantina figure. It does two jobs.
- **It fits.** `font-size: min(var(--numeral-max), calc(100cqi / (var(--glyphs) * 0.34)))`.
  - `--glyphs` is the length of the formatted string.
  - 0.34em is Karantina's widest digit plus spacing (2.1).
  - Its `--numeral-max` comes from the type scale (9.5).
  - It never goes below 28px.
- **It bleeds,** within the rules of 9.4, through the `--numeral-bleed` token.

### 7.6 `Mark`

The inverted figure box (9.3). An inline element with the `--box` and `--box-text` pair of its sheet.

### 7.7 `ScreenHead` and `TitlePair`

- **`ScreenHead`** replaces `ScreenPanel`'s engraved `BrandPanel`.
  - On a phone: the Karantina screen name and the screen's action pill.
  - On desktop: the top bar (4.3).
  - `useThemeColor()` reads its background.
- **`TitlePair`:** a title in weight 600 and a subtitle in weight 300, as one heading. The subtitle is inside the heading element as a block `span`, so the pair is read once.

### 7.8 `Pill` and `RoundButton`

These are variants of the existing `Button`: `pill`, `pill-solid`, `round` and `text`. Section 9.6 describes them.

## 8. Motion

### 8.1 Tokens

These go in `@theme`, beside the existing easings:

| Token         | Value                                       | Used for                             |
| ------------- | ------------------------------------------- | ------------------------------------ |
| `--ease-out`  | `cubic-bezier(0.23, 1, 0.32, 1)` (good-css) | anything that moves                  |
| `--ease-fill` | `cubic-bezier(0.4, 0, 0.2, 1)` (concept)    | colour fills                         |
| `--dur-press` | 150ms                                       | pill and round button fills, presses |
| `--dur-pop`   | 200ms                                       | menus and popovers                   |
| `--dur-move`  | 250ms                                       | view transitions                     |
| `--dur-panel` | 300ms                                       | panels and pop-outs                  |

All are within good-css's limit: 300ms or less, except a modal or drawer, which may take up to 500ms.

### 8.2 What moves

- **Pills and round buttons** fill on hover (fine pointers only) and on press, in `--dur-press`.
- **Presses.** Pills and round buttons scale to 0.97 and tiles to 0.98, inside `no-preference`.
- **Route changes.**
  - `NavLink` and `Link` in the rail and the tab bar pass `viewTransition` (React Router 7).
  - The rail, the tab bar and the collapsed bar carry `view-transition-name`, so they stay still while `main` changes.
  - **Direction.** Before navigating, the shell sets `data-nav-dir="forward"` or `"back"` on `<html>`, from the tab order. A rule inside `no-preference` slides `main` 24px in the reading direction (mirrored under `:dir(rtl)`) while it cross-fades. This avoids view transition types, which are Baseline only since January 2026.
  - **Support.** View transitions are Baseline since October 2025 (Chrome 111, Firefox 144, Safari 18). Without them the route just changes.
- **Steps in a flow:** `morph()`, as today and as the add-card spec says.
- **Panels, pop-outs and menus.**
  - They enter through `@starting-style` (Tailwind's `starting:`) and Base UI's `data-starting-style`: an opacity fade for everyone, and a 0.5rem rise or slide inside `no-preference`. Never from `scale(0)`.
  - `@starting-style` is Baseline since August 2024 (Safari 17.5).
  - Base UI keeps a popup mounted until its exit ends, so exits also work where `overlay` and discrete `display` transitions don't (Firefox, Safari).
- **Card colour** on the add-card preview cross-fades in 150ms. That is a colour fade, so it runs for everyone.
- **Balance count-up** stays as `count-up.tsx` does it.
- **Nothing else moves by itself.** There are no reveals, no scroll-driven animations and no parallax.

### 8.3 Less motion

- Every movement is written inside `@media (prefers-reduced-motion: no-preference)` (good-css "Opt-in motion"). Colour fades are not movement and stay outside it.
- The shell skips `viewTransition` when motion is reduced, the same check `morph()` makes.
- Count-up shows the final figure.
- **The old global rule,** which sets every duration to 0.01ms under `reduce`, stays while older components still rely on it. Phase 3j moves the last of them to opt-in and removes it.

## 9. Visual language: Bold sheets

### 9.1 Sheets

- **What a sheet is.** Every block is a sheet: a rounded panel of one colour on the paper, with `overflow: clip`.
- **Gaps.** Sheets sit one gap apart, so the paper shows between them:
  - `--gap-sheet: clamp(0.5rem, 0.193rem + 1.262vw, 1rem)`;
  - that is 8px at 390 and 16px from about 1024.
- **The radius scale.** Each fluid value runs from its phone size at 390 to its desktop size at 1440, worked out as good-css's "Fluid sizes" entry says.

  | Token            | Phone | Desktop | Used for                                                                         |
  | ---------------- | ----- | ------- | -------------------------------------------------------------------------------- |
  | `--r-sheet`      | 36px  | 56px    | board sheets, phone sheets, panels: `clamp(2.25rem, 1.786rem + 1.905vw, 3.5rem)` |
  | `--r-sheet-s`    | 34px  | 36px    | card sheets, the phone summary                                                   |
  | `--r-sheet-cash` | 36px  | 44px    | the cash sheet                                                                   |
  | `--r-tile`       | 28px  | 32px    | choice tiles                                                                     |
  | `--r-row`        | 26px  | 26px    | account sheets inside the balance sheet                                          |
  | `--r-face`       | 22px  | 22px    | `CardFace`                                                                       |
  | `--r-preview`    | 52px  | 52px    | the pop-out's preview sheet                                                      |
  | `--r-dialog`     | 64px  | 64px    | the pop-out                                                                      |
  | `--r-mark`       | 3px   | 3px     | the black box                                                                    |
  | `--r-pill`       | 999px | 999px   | pills, nav items, chips, hue bars                                                |

- **Nested radii.** A sheet inside a padded sheet takes the parent's radius less the padding (good-css "Concentric nested radius"). The account sheets are the exception: they are tilted, which reads as stacked rather than nested.
- **Swapping sides.** Repeated sheets alternate which side their text and their figure sit on. Card sheets and person sheets in Cash do this, through `:nth-child(even of …)`, which is Baseline widely available.
- **Tilt.** Only decorative stacks tilt, never a list the user scans or a control they aim at:
  - account sheets in the balance sheet: odd ones −1.2°, even ones +1° and offset 18px toward the inline end;
  - the add-card preview's `CardFace`: −4°.

  They have a 2px foot shadow, `0 2px 0 color-mix(in oklch, var(--box) 25%, transparent)`.

- **Grain.**
  - A static paper grain: a 180px tileable greyscale noise image, pre-rendered as a PNG in `src/assets/` and precached.
  - It is drawn as a background layer on the paper and on every sheet (`background-image`, with `background-blend-mode: multiply` in light and `screen` in dark), at 7.5% strength in light and 6% in dark.
  - It is not a full-screen overlay with `mix-blend-mode`. A layer like that over a long virtualised feed makes every scroll frame re-composite the page.
  - A file, rather than an inline SVG filter, gives the same grain in every browser and in the screenshot tests.
  - Forced colours drop it.

### 9.2 Colour on sheets

- **Five kinds of sheet:**
  - **paper:** the paper sheet colour, in ink;
  - **night:** ink, in paper;
  - **sapphire:** the month sheet only;
  - **money:** a bank, company, card or cash colour, in its tint;
  - **the black preview sheet** in the pop-out.
- **Text** is the sheet's tint (decision 4).
- **Lines on a sheet** are 2px, the tint at 30%.
- **Selection** turns the sheet inside out (1.6).
- **Focus** inside a sheet is `currentColor`, 3px, offset 3px. On the paper it is `--ring`.
- **Chips** (a card or bank in a row's meta line):
  - at least 24px tall, as a pill in the money colour with its tint;
  - weight 500, at 13px;
  - a 44px hit area through a pseudo-element when the chip is a button.

### 9.3 The inverted figure box

- **The figure that matters** in a sentence or a row sits in a box: `--box` background, `--box-text` (the sheet's lifted hue) text, weight 600.
- **Box shape:**
  - padding `0.04em 0.28em 0.1em`;
  - the mark radius;
  - `box-decoration-break: clone`, so a wrapped box keeps its ends;
  - an LTR-isolated run when it holds a number.
- **On the ink sheet** the box flips to paper with ink text.
- **Contrast:** every lifted colour measures at least 7.46:1 on the box, in both themes. On the paper sheet the box text is the paper colour, at 17.68:1 or more.
- **One or two boxes per sheet.** A sheet full of boxes has no figure that matters.

### 9.4 Numerals that run off a sheet

The values here are the ones the user approved in `money-sheets-bold-v2.html`, after asking for the numbers to sink "less" and "less deep".

**What bleeds.** The huge Karantina figure (`Numeral`) runs off the sheet's outer foot, and nowhere else, on:

- the balance sheet;
- the month sheet;
- the cash sheet;
- the Cards screen's summary sheet;
- the card-bill rows (the card sheets), at half depth, as v2 draws them.

**What never bleeds:** rows, chips, tiles, wizard steps, marks, card faces, the account sheets' figures, and anything denser.

**One edge only:** the sheet's outer bottom edge. Never a side, never the top, never an edge another sheet touches.

**One token, `--numeral-bleed`:** the share of the glyph height that the sheet hides. The glyph height is `--numeral-cap: 0.61` em, from v2. fontTools measures Karantina's digits at 600–608 of 1000 units.

| Where                                               | `--numeral-bleed` | Hidden at that size                                       |
| --------------------------------------------------- | ----------------- | --------------------------------------------------------- |
| From `lg`: balance, month, cash, the Cards summary  | `0.06`            | about 10px of a 252px balance, 7px of 168px, 6px of 150px |
| From `lg`: card-bill rows                           | `0.03` (half)     | about 2px of a 104px figure                               |
| Below `lg`: balance, month, cash, the Cards summary | `0.03`            | about 2.5px of a 118px figure                             |
| Below `lg`: card-bill rows                          | `0.015` (half)    | about 1px of a 92px figure                                |
| Rows, chips, tiles, wizard steps and the rest       | `0`               | nothing                                                   |

**The CSS.** These are v2's rules; v2's `.phone` frame becomes a media query:

```css
:root {
  --numeral-bleed: 0.06;
  --numeral-cap: 0.61;
}
@media (width < 64rem) {
  :root {
    --numeral-bleed: 0.03;
  }
}
[data-numeral] {
  --b: var(--numeral-bleed);
  line-height: 0.74;
  margin-block-end: calc(var(--b) * var(--numeral-cap) * -1em - 0.02em);
}
[data-card-sheet] [data-numeral] {
  --b: calc(var(--numeral-bleed) * 0.5);
}
```

- The `0.02em` takes up the line box's foot. With `line-height: 0.74` it sits 0.017em below the baseline.
- The sheet's `padding-block-end` is 0 under a bleeding numeral, and `overflow: clip` does the cutting.
- Changing the depth later changes only `--numeral-bleed`.

**Never cut:**

- **A digit's identity.** At 0.06 the cut line is about 0.04em above the baseline: 6.5% of a digit, only the bottom of its bowl or foot. At 0.03 it is under 4%.
- **The ₪ sign.** It is set at half size and raised 0.62em, so it ends far above the cut.
- **A decimal part.** A figure with agorot never bleeds: `Numeral` sets `--b: 0` for it. Bleeding figures are whole shekels.
- **The thousands comma.** Its head reaches 0.093em above the baseline, more than twice the deepest cut.
  **The whole value stays available.**

- Cutting is visual only. The element's text is the full formatted figure, so screen readers and copy and paste get all of it.
- Where the huge figure is rounded to whole shekels, it is `aria-hidden`, and a visually hidden span beside it carries the exact amount.

### 9.5 Type scale and weights

- **Plex weights:**
  - 300 for subtitles, leads, meta lines and quiet labels;
  - 400 for body text;
  - 500 for pills, chips and amounts in rows;
  - 600 for titles, names, the current nav item and box figures.
- **Plex text settings.** Body text is 17px with `line-height: 1.55`. Titles use `line-height: 1.02` and `letter-spacing: -0.01em`. Subtitles use `line-height: 1.15`.
- **Title pairs:** a title in 600 and a subtitle in 300, a size step below.

  | Pair                   | Phone                            | Desktop |
  | ---------------------- | -------------------------------- | ------- |
  | Screen (top bar)       | Karantina 76px name, no subtitle | 38 / 21 |
  | Hero sheet             | 20 / 16                          | 40 / 24 |
  | Sheet                  | 20 / 16                          | 30 / 21 |
  | Pop-out question       | 32 / 19                          | 48 / 24 |
  | Pop-out steps, preview | 24 / 17                          | 26 / 18 |

- **Other Plex sizes:**
  - rows: the merchant at 17px (600), the meta line at 14px (300);
  - day headings at 14px (600);
  - chips at 13px (500).
- **Fluid sizes.** Each pair's sizes are fluid tokens between the two columns (`clamp()` with `rem + vw`, as good-css requires). Every font size stays within its 2.5× zoom limit.
- **Karantina 700:** `line-height: 0.74` for numerals and 0.85 for names.

  | Use                            | Phone `--numeral-max` | Desktop `--numeral-max` |
  | ------------------------------ | --------------------- | ----------------------- |
  | Balance                        | 118px                 | 252px                   |
  | Left this month                | 96px                  | 168px                   |
  | Cash pot                       | 96px                  | 150px                   |
  | Card sheet                     | 92px                  | 104px                   |
  | Account sheet figure           | 40px                  | 52px (no bleed)         |
  | Day number in the charges list | 34px                  | 34px (no bleed)         |

  The currency sign is set at 0.5em and raised 0.62em, with 0.04em before the digits.

### 9.6 Pills, round buttons and links

- **Pill.**
  - 2px `currentColor` border and a full radius.
  - At least 48px tall (44px in the phone screen head), with 22px inline padding.
  - Weight 500, 16px.
- **Solid pill.** Sapphire with its foreground: the one primary action in a view.
- **Round button.** A 48px circle with a 2px `currentColor` border, holding a 20px arrow or ×.
  - Arrows are drawn for LTR and mirrored with `scale: -1 1` under `:dir(rtl)`.
  - The back and forward months and "All transactions" use them.
- **Fill on hover and press.** A pill or round button fills with `--press` and takes `--on-press`.
  - Inside a sheet that is the black box and the sheet's lifted hue.
  - A solid pill fills with ink.
  - Hover applies only to fine pointers: a `hover-fine` custom variant, `@media (hover: hover) and (pointer: fine)`, because Tailwind's `hover:` checks only `(hover: hover)`.
  - The fill takes `--dur-press` with `--ease-fill`.
- **Text button.** Weight 500, underlined 2px with a 4px offset: Cancel in a phone wizard's top bar.
- **Fields.**
  - A 2px `--input` border and the tile radius, on the paper sheet.
  - Text at `max(16px, 1rem)`, so iOS doesn't zoom.
  - Focus as 9.2.

### 9.7 What stays rejected

- Pastel.
- Coloured icons.
- Logos on sheets.
- Plain black or white text on a money colour (it is always the tint).
- Motion that plays by itself.

## 10. Gates and rules kept

- **`gate:rtl`.**
  - Every new component uses logical properties only.
  - `SheetContent` loses its physical sides.
  - Directional transforms and the arrow mirrors use `:dir(rtl)` or the declared `rtl:` variant.
- **`gate:money`.**
  - Strip and bar shares come from `sharesBp()` in `money.ts`.
  - `Numeral`'s division is of glyph counts, and carries a `money-allow` comment.
  - Bar lengths are `calc()` in CSS.
- **`gate:pci`.** Card sheets and faces show the last 4 only. No field is added.
- **Contrast.** Every new pair is in `contrast.test.ts` (section 13).
- **Touch targets.**
  - Every target is 44px or more: pills (48), round buttons (48), nav pills (48), tiles (70 and up), swatches (44), and chips and hue pills through their hit-area pseudo-element.
  - The parked 44px pass on Account linking's buttons (`redesign-followups`) is done in phase 3g.
- **i18n.** Every new string (rail labels, title pairs' subtitles, "Other", "Selected ✓", the stats labels) exists in both `en` and `he`. `locales.test.ts` parity stays.
- **No "sync" in the copy.** The README's rule holds. The rail's account block says who is linked, never whether anything synced.
- **Kept from earlier work.** The rules in `redesign-followups` hold: `modal={false}` plus a swallowing backdrop for anchored pop-outs, a name for every popover dialog, and logos only through `<img>`.
- **good-css applies, with two departures:**
  1. **Theme tokens stay in a `:root` block and a `.dark` block**, not `light-dark()`.
     - Tailwind's `dark:` variant and `contrast.test.ts` both read the `.dark` class.
     - `light-dark()` has been Baseline since May 2024 but isn't yet widely available, while the build's target is.
     - Moving to it is its own change.
  2. **The old global reduced-motion rule** stays until phase 3j (8.3).

  The good-css reset is adopted one rule at a time in phase 1, as its own advice says for an existing project. `min-width: 0` and `font-synthesis: none` change how things already render.

- **`pnpm verify`** is the gate for every phase. `verify:full` (Playwright, Lighthouse, knip) runs before each phase ships.

## 11. Build order

Each phase ships on its own and leaves the app whole.

**Phase 1: tokens, fonts, colour system.** One branch.

- `index.css`:
  - the house (1.1), money tokens (1.3) and hues (1.4);
  - the `[data-sheet]`, `[data-money]` and `[data-hue]` mapping (1.5, 1.6);
  - `color-scheme` and forced colours;
  - the radius, gap and motion tokens;
  - the `hover-fine` variant;
  - the good-css reset, rule by rule.
- Fonts: the packages, imports, fallback faces, the stack comment, the preload plugin and `globIgnores`. The three old packages are removed, and `font-bold` becomes `font-semibold`.
- `money-key.ts`, `category-hue.ts` with `BUILTIN_HUES`, the `hue` field and its schema, and the rollout test.
- Card colours become `--money-card-*` fills.
- The theme colour, the manifest and the boot script (section 3).
- The tests in section 13 for all of the above.
- **What changes on screen.** Today's layout, with the new paper, ink, type and solid card colours.

**Phase 2: shell, editors, shared components.** One branch, after phase 1.

- The rail and tab bar pills (4.2), `main` as a container, and the top bar (4.3).
- `SheetContent` logical sides, `EditorPanel`, and `PopOut`. Every editor in 6.3 moves to its new shell; their contents are unchanged.
- `ScreenHead` and `TitlePair` replace `ScreenPanel`, with `useThemeColor()`.
- The shared components:
  - `CardSheet`, `CardFace`, `MoneyTile`, `HueBars`, `MoneyStrip`, `Numeral` and `Mark`;
  - the `Button` variants;
  - `sharesBp()`;
  - the grain asset.
- The view-transition route plumbing.
- **What changes on screen.** Every screen is still a single column, but it sits in the new shell, and editors are panels from `lg`.

**The add-card flow** (branch `add-card-flow`) can start once phase 2 has landed. It uses `PopOut`, `CardFace` and `MoneyTile`.

**Phase 3: the screens, one per branch.**

|     | Screen                                                                                           | Main files                                |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 3a  | Feed (5.1)                                                                                       | `features/feed`, `features/summary`       |
| 3b  | Cards (5.3)                                                                                      | `features/cards`                          |
| 3c  | Bank accounts (5.4)                                                                              | `features/bank-accounts`                  |
| 3d  | Cash (5.5)                                                                                       | `features/cash`                           |
| 3e  | Chart (5.2)                                                                                      | `features/chart`                          |
| 3f  | Categories (5.6), with the hue picker                                                            | `features/settings/categories-screen.tsx` |
| 3g  | Settings (5.7), with the 44px pass                                                               | `features/settings`, `app/routes.ts`      |
| 3h  | Import (5.9)                                                                                     | `features/import`                         |
| 3i  | Commitments (5.8)                                                                                | `features/commitments`                    |
| 3j  | Motion opt-in cleanup: move the last transitions into `no-preference` and remove the global rule | `src/components/ui`, `index.css`          |

**What can run in parallel worktrees.**

- Phases 1 and 2 run one after the other. Phase 1 touches `index.css`, `main.tsx` and every token test. Phase 2 touches the shell and every editor's wrapper.
- After phase 2, 3a–3i can run in parallel worktrees. Each lives in its own feature folder and uses the shared components without changing them. A change a screen needs in a shared component goes in a small PR of its own first.
- **3j runs last,** after every other screen has landed.
- The add-card flow runs in parallel with phase 3, except that **3b waits for the add-card flow**, or is built on top of it. Both change `cards-screen.tsx` and the card menu's callers.
- **The cash sheet.** 3a and 3d both show it. 3d owns it, and 3a uses whatever 3d has landed.
- **The bleed depth** is one token (9.4). A later adjustment changes only that token, in any phase.

## 12. Edge cases

- **No colour of its own** (a bank outside 1.3, an issuer of `other`, an unknown card colour): the `neutral` ink sheet, with the name in type.
- **A category's `hue` from a newer build:** this build falls back to the built-in map, then the hash. Nothing is rewritten.
- **An archived category with spending this month:** it keeps its hue in bars, as its rows still show it.
- **Many categories in a month:** the largest 10 bars (7 in a strip), then "Other" (1.4).
- **Long names** ("מזרחי-טפחות", "American Express") on sheets and tiles wrap to two lines at most. The `@narrow` e2e test at 320px covers it.
- **A huge balance:** `Numeral` shrinks it, never below 28px. A figure that would need less than 28px wraps after the currency sign instead.
- **A negative balance:** the minus sign is drawn in Karantina (−244 to 357 units, well above the cut), and the figure bleeds like any other.
- **A figure with agorot:** it never bleeds (9.4).
- **Foreign currencies:** $, €, £, ¥ and ₪ are in Karantina. ₹ is drawn by the fallback face in a numeral, and by Plex in text.
- **Russian names:** basic Cyrillic is in neither face, so they render in the system font.
- **The first visit on a slow network:** numerals show in the width-matched fallback, then swap. Every later start reads fonts from the cache.
- **Resizing with a panel or pop-out open:**
  - The same popup restyles, and nothing is lost (6.1, 6.2).
  - A pop-out crossing 1040px or 720px changes its number of panes in place, and keeps the current step and its answers.
- **A panel open while the rail is clicked:** the panel is modal, so the rail is inert until it closes.
- **The feed's rows above the list change height:** the virtualiser's `scrollMargin` is re-measured (5.1).
- **`/settings` on resize:** see 5.7.
- **`?card=` naming an archived or deleted card:** the details pane closes, and the parameter is removed (replace, not push).
- **A 1024 window in Hebrew** with the rail's longest label: labels wrap to two lines, and counts stay on the first line. The e2e test checks there is no sideways scroll at 1024.
- **Tilted sheets near the edge of a narrow balance sheet:** the tilt is applied inside the sheet's clip, so nothing pokes past the sheet. At board width the account sheets stack under the text, where there's room for their offset.
- **Windows High Contrast:** see 1.8.
- **Older browsers.** Vite 8's default build target is "Baseline widely available", and the repo sets no other.
  - `:has()`, `:nth-child(of)`, container queries, `color-mix()`, OKLCH, `background-blend-mode` and `linear()` need no fallback.
  - `@starting-style` (Safari 17.5) and view transitions (Safari 18) degrade to no animation.
  - Nothing here uses scroll-driven animation.

## 13. Tests

### 13.1 Unit

**`contrast.test.ts`** reads the new blocks out of `index.css`. It gains an OKLCH mix helper in `color.ts` to compute `color-mix()` results exactly, and clips out-of-gamut values to sRGB as screens do today. It checks, in light and dark:

- **Text on every money fill.** Banks, issuers, card colours, cash and neutral, each with its `-on` tint, at 4.5:1 or more.
  - Pinned exactly, to two decimals, in light:
    - Hapoalim 5.44, Max 5.42 and Amex 5.00 (decision 8);
    - Mizrahi 6.02, Cal 5.93 and cash 11.26.
  - A change to a value must update its pin on purpose.
- **Every lifted colour against `--box`**, at 4.5:1 or more.
- **The tint rule (decision 4).**
  - Each `-on` token's lightness and chroma are in the rule's ranges.
  - Each `-on` and `-hi` token has its fill's hue within 2°. A grey fill (chroma under 0.01) is exempt.
- **Category hues.**
  - Tones A and B of every hue against `--background` and `--card`, at 3:1 or more.
  - Tone B at least 0.12 from tone A in OKLCH lightness.
- **The house:**
  - `--foreground` and `--muted-foreground` on the paper and the paper sheet;
  - `--income` on both;
  - `--primary-foreground` on `--primary`;
  - `--primary-ink` and `--ring` on the paper and the sheet;
  - `--on-box` on `--box`;
  - the flipped box on the ink sheet.
- **Inside every sheet kind and every money key:**
  - the derived `--input` against the fill, at 3:1 or more;
  - `--ring` (`currentColor`, which is the tint) at 3:1 or more.

**Other unit tests:**

- **`category-hue.test.ts`:**
  - every built-in has a hue;
  - no two expense built-ins, and no two income built-ins, share hue and tone;
  - resolution order (stored, then built-in map, then hash);
  - an unknown key falls back;
  - the hash is stable.
- **`money-key.test.ts`:**
  - a bank code written as "012" finds `bank-12`;
  - an unknown bank, an issuer of `other` and an unknown card colour all give `neutral`;
  - a card with no colour of its own gives its issuer's key.
- **`money.test.ts`, `sharesBp`:** the shares sum to 10,000; zero totals; a single segment; property tests with fast-check.
- **A category round trip:** an edit through the repo keeps `hue`; import accepts it, and an import without it is fine.
- **`brand-colours.test.ts`:** the theme-color boot values (`#F6F2EA`, `#1A1510`), the manifest colours, and the unchanged icons.
- **A fonts test:**
  - `main.tsx` imports exactly Karantina 700 and Plex 300, 400, 500 and 600;
  - none of Inter, Heebo or Frank Ruhl is imported anywhere;
  - `index.css` declares both fallback faces;
  - `font-family` appears in no other CSS or TSX file;
  - no source file uses `font-bold`, `font-extrabold` or `font-black`.
- **A `Numeral` test:**
  - a figure with a decimal part renders with `--b: 0`;
  - inside a card sheet, `--b` is half of `--numeral-bleed`;
  - a rounded figure carries the exact amount in a visually hidden span, and the visible one is `aria-hidden`;
  - the text content of a whole-shekel figure is the full formatted amount.

### 13.2 DOM

- **`EditorPanel`:**
  - it renders as a bottom sheet below `lg` and at the inline end from `lg` (by class);
  - focus is trapped and returns to the opener;
  - typed values survive a resize across `lg`.
- **`PopOut`:**
  - one, two and three panes at 600, 900 and 1140px container widths;
  - `aria-current="step"`;
  - it is named by its title;
  - the answers survive a change in the number of panes.
- **`MoneyTile`:** a radio group with selection on activation, and the selected state exposed and visible without colour.
- **`CardSheet` and `CardFace`:**
  - the name is "<issuer> ending <last4>";
  - never more than 4 digits;
  - the fallback to the issuer key;
  - card sheets alternate sides.
- **`HueBars` and `MoneyStrip`:** the text lists every category, including "Other"; strips are `aria-hidden`.
- **The rail:** its order, counts, `aria-current`, and the account menu at its foot.
- **Settings:** `/settings` is replaced by `/settings/account` at desktop width and not on a phone.

### 13.3 E2E (Playwright)

- **The screenshot matrix (`screens.spec.ts`).**
  - Widths: 390, 1440 and 1920. Languages: `he` and `en`. Themes: light and dark.
  - Routes: feed, chart, cards, cash, bank accounts, categories, commitments, settings.
  - Overlays: the transaction panel, the import pop-out, and the card details pane.
  - All with the seeded demo household.
  - A person looks at the images before each phase ships, against `money-sheets-bold-v2.html`.
- **Numerals (new, `@numerals`).** At 390, 1440 and 1920, in `he` and `en`, for every element with `data-numeral`:
  - the overflow past its sheet's foot (`numeral.bottom − sheet.bottom`) is at most `(0.61 × b + 0.02) × font-size + 1px`;
  - `b` is 0.06 from `lg` and 0.03 below, halved inside a card sheet;
  - a numeral in a row, chip, tile or wizard step has no overflow at all;
  - a numeral containing a decimal separator has no overflow at all;
  - the ₪ sign's box ends above the sheet's foot;
  - the accessible name of the numeral, or of its hidden twin, equals the formatted amount.

  So no meaningful digit is clipped beyond the rule.

- **`08-polish`:**
  - no sideways scroll at 320, 1024, 1440 and 1920;
  - every target at least 44px;
  - every element whose computed font family starts with Karantina has a computed size of 28px or more;
  - no computed `font-weight` of 700 on a Plex element;
  - at 1920, `main`'s content box is at least 1600px wide;
  - at 1440, the add-transaction panel's Cancel and Save are within 480px of each other.
- **`07-a11y`:** axe stays blocking-clean on every route above, with a panel open and a pop-out open, in both themes.
- **`09-pwa-offline`:**
  - after install, offline, the feed renders in Karantina and Plex (checked with `document.fonts.check()` for Karantina 700 and Plex 400);
  - the grain image comes from the cache.
- **These keep passing as they are:**
  - `00-shell`, `02-transaction-type`, `04-rtl-hebrew`, `10-feed-scale`, `11-csp` (the grain is a same-origin file), `12-account`, `13-https`, `14-cards`, `15-cash`, `card-catalog`, `delete-data`;
  - the `@popouts`, `@narrow` and `@collapse` tags.

  Any selector a phase changes is updated in that phase's branch. No test is deleted to make a phase pass.

- **Lighthouse (`lighthouserc.cjs`).** Its thresholds stay. The font preloads and the grain must not lower the performance score.

## 14. Not in scope

- The front door's layout and engraving. It takes the new fonts and nothing else.
- The first-run wizard's layout. It takes tokens and fonts only.
- Redrawing the installed app icon and favicon.
- Moving the theme tokens to `light-dark()` (section 10).
- Per-account balances (the cash spec rules them out).
- Person (profile) colours. Avatars keep their curated palette. They are people, not money.
- The emails and the legal pages beyond the font stack.
- A transfer kind.
