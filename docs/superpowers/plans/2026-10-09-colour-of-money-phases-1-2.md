# Colour of Money, Phases 1 and 2: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bookandry turns into "Bold sheets": ink on warm paper, banks, card companies, cards and categories as full-strength colour keyed by data, Karantina and IBM Plex Sans Hebrew self-hosted, and a desktop shell with a text-pill rail, `main` as a size container, and every editor as an end-side panel or a centred pop-out.

**Architecture:**

- **Tokens first, keys not colours.** Every colour is an OKLCH custom property in `src/index.css`. Data stores a key (a Masav code, an issuer, a card colour key, a hue key). Components set `data-sheet`, `data-money` and `data-hue`, and `index.css` maps each key to `--fill`, `--on-fill`, `--box` and `--box-text`. The shadcn names (`--background`, `--foreground`, `--primary`…) stay the public API and alias five house colours, so a sheet can retint them without referring to itself.
- **The token file is tested as a browser reads it.** A small resolver (`src/lib/css-tokens.ts`) follows `var()` and `color-mix(in oklch, …)` through the `:root` and `.dark` blocks, and the contrast tests check every pair the design depends on, including inside every sheet kind and money key.
- **Phase 2 is vocabulary, then wiring.** Task 9 lands every phase 2 string, every phase 2 stylesheet rule, the grain, the `Button` pill variants, `Mark`, `TitlePair` and the app mark. After it, the panel, the pop-out, the shell, the numerals and the money components touch disjoint files and run in parallel. Screens stay a single column until phase 3.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4.3 (`@theme inline`, `@custom-variant`, `@utility`, container query variants), Base UI 1.8 (`@base-ui/react/dialog`, `button`, `menu`), React Router 7.18 (`NavLink viewTransition`), Dexie, i18next (en/he, RTL), Vitest 5 (projects `unit`, `db`, `dom`), Playwright 1.63 (projects `en`, `he`, `mobile`), Fontsource 5.3.0, vite-plugin-pwa (Workbox).

**Spec:** `docs/superpowers/specs/2026-10-09-colour-of-money-design.md` (binding). Visual reference: `C:/dev/greenback/.superpowers/concepts-2026-10-09/money-sheets-bold-v2.html` (git-ignored, in the main checkout). Read both before a task; the spec's section numbers are cited as §N.

**Where:** the worktree `C:/dev/greenback-colour`, branch `colour-of-money`. Phase 1 (Tasks 1–8) ships on its own; phase 2 (Tasks 9–16) follows on the same branch.

## Global Constraints

- **Toolchain.** In Git Bash: `export PATH="/c/Users/HighL/AppData/Local/node:$PATH"`. In PowerShell: `$env:PATH = "$env:LOCALAPPDATA\node;$env:PATH"`.
- **Gate.** `pnpm verify` (typecheck, lint, format:check, gate:rtl, gate:money, gate:pci, unit tests with coverage, build) exits 0 at the end of every task. `pnpm verify:full` (adds the hostile-timezone run, knip, Playwright and Lighthouse) runs in Tasks 8 and 16, before each phase ships (§10).
- **Commits.** One per task at least. Subject: one plain-English sentence in the repo's style (see `git log -15`), then a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, never `--no-verify`. Destructive git is blocked by a hook.
- **Do not touch** `C:/dev/greenback` (branch `mcc-categories`) or any other worktree. The `mcc-categories` branch also adds an optional field to `Category`; whichever lands second merges the schema line (§1.4).
- **Colours.** Authored in OKLCH in `src/index.css`, light in `:root` blocks, dark in `.dark` blocks (§10 departure 1: no `light-dark()`). Grays, white and black use hue `none` where they are mixed. Derived lines, tints and transparent versions use `color-mix(in oklch, …)`. Data stores only keys, never a colour value (decision 3).
- **Text on a sheet is a tint of the sheet's own hue** (decision 4): a dark sheet's tint has lightness 0.95–0.97 and chroma ≤ 0.03; a light sheet's has lightness 0.20–0.22 and chroma 0.045–0.06; the tint's hue is within 2° of the fill's; every tint measures ≥ 4.5:1 on its fill. Category hues are marks only, never text, ≥ 3:1 (decision 10).
- **Pins (light, two decimals, §13.1):** Hapoalim 5.44, Max 5.42, Amex 5.00, Mizrahi 6.02, Cal 5.93, cash 11.26. Changing a value means changing its pin on purpose.
- **Fonts (§2).** `@fontsource/karantina` **5.3.0** and `@fontsource/ibm-plex-sans-hebrew` **5.3.0**, pinned exactly (both checked on npm on 2026-10-09: they exist, OFL-1.1, published 2026-07-19). Karantina 700 only; Plex 300, 400, 500, 600 only. `font-synthesis: none`. No `font-bold`, `font-extrabold` or `font-black` anywhere. Karantina never below 28px (1.75rem) and never in an amount column. `font-family` is declared only in `src/index.css`. Only Karantina's latin and hebrew 700 files are preloaded.
- **Layout (§4).** Desktop starts at `lg` (1024px). `main` is `@container/main`; screens use `@board/main:` (760px), `@wide/main:` (1080px) and `@vast/main:` (1440px) variants, never viewport variants. The content box is at most 1680px with 24px padding.
- **Motion (§8).** `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-fill: cubic-bezier(0.4, 0, 0.2, 1)`, `--dur-press: 150ms`, `--dur-pop: 200ms`, `--dur-move: 250ms`, `--dur-panel: 300ms`. Every movement (translate, scale) sits inside `prefers-reduced-motion: no-preference` (Tailwind `motion-safe:`); colour fades run for everyone. The old global reduced-motion rule stays until phase 3j. No CSS anchor positioning, no scroll-driven animation.
- **RTL.** Logical properties only (`ms-`, `pe-`, `start-`, `end-`, `inset-bs-`, `rounded-s-`…); `pnpm gate:rtl` stays green. Directional transforms mirror with `rtl:`.
- **Money.** Shares of a total come only from `sharesBp()` in `src/lib/money.ts` (Task 14). `Numeral`'s glyph-count division carries a `money-allow` comment. `gate:money` stays green.
- **PCI.** Card sheets and faces show the last 4 digits only (`lastDigits`). `gate:pci` stays green.
- **Copy.** Every new string exists in `src/i18n/locales/en/*.json` and `he/*.json` (`locales.test.ts` parity). No "sync" in the copy. Hebrew copy used here: מזומן, חשבונות בנק, קטגוריות, התחייבויות, הגדרות, הוספה, שלב {{current}} מתוך {{total}}, נבחר ✓, אחר.
- **Touch targets.** Every target is ≥ 44px: pills 48, round buttons 48, nav pills 48, tiles ≥ 70, swatches 44, chips and hue pills through a hit-area pseudo-element.
- **Tests.** Every task carries its own tests. Where layout changes, Playwright asserts at 390, 1440 and 1920 in `he` and `en`. No test is deleted to make a task pass; a selector a task changes is updated in that task (§13.3).

## Review Focus

- **The theme is changed while the app is open** (account menu → Appearance). The status bar, the paper and every sheet follow at once, without a reload: `applyTheme()` sets the `theme-color` meta (Task 7), and `useThemeColor()` re-reads the top of the screen when the `dark` class changes (Task 13).
- **Windows High Contrast (forced colours).** Backgrounds disappear, so every sheet and hue mark keeps a visible 2px edge, and the card colour swatches keep their colour because the colour is what is being chosen. Pinned by an emulated `forcedColors: 'active'` Playwright test on Cards (Task 5).
- **Adding from a screen that does not host the editors.** The rail's Add on Cards or Settings opens the add-transaction panel over that screen, a save leaves the person there, and Smart import opens there too. Pinned in Task 12.
- **Data written by an older build or by hand.** A card whose `color` is a legacy hex (`#ff0000`) or an unknown key, a bank code written `"012"`, an issuer of `other`: the face is drawn on the issuer's sheet or the neutral ink sheet, never as tint text on no fill. Pinned on the rendered card face in Task 5.
- **A panel over a panel.** The card editor opened from inside the add-transaction panel ("give this card's deal rate"): Escape closes only the top panel, focus returns into the transaction panel, and the half-typed purchase is still there. Pinned in Task 10.

---

## File Structure

| File                                                                                                                               | Task          | Responsibility                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `src/lib/color.ts`                                                                                                                 | 1             | OKLCH ↔ sRGB, `none` hue, `mixOklch`, `compositeOver`, `contrastRatioRgb`                     |
| `src/lib/css-tokens.ts` (new)                                                                                                      | 1             | Reads `:root` / `.dark` declarations and resolves `var()` and `color-mix()` as a browser does |
| `src/lib/css-tokens.test.ts` (new)                                                                                                 | 1             | The resolver's own tests                                                                      |
| `src/index.css`                                                                                                                    | 1, 2, 3, 4, 9 | All tokens, the sheet/money/hue mapping, the base layer, fonts, phase 2 rules                 |
| `src/lib/contrast.test.ts`                                                                                                         | 1             | House pairs, light and dark                                                                   |
| `src/lib/money-colours.test.ts` (new)                                                                                              | 2             | Money tints, pins, tint rule, hues, sheet contexts                                            |
| `src/lib/base-css.test.ts` (new)                                                                                                   | 3             | Fluid tokens worked out at 390 / 1024 / 1440, the reset rules, motion caps                    |
| `e2e/support/widths.ts` (new)                                                                                                      | 3             | The layout widths, languages and routes every layout spec uses                                |
| `e2e/16-widths.spec.ts` (new)                                                                                                      | 3             | No sideways scroll at 320, 390, 1024, 1440, 1920 in he and en                                 |
| `package.json`, `pnpm-lock.yaml`                                                                                                   | 4             | Fontsource 5.3.0 in, the three variable fonts out                                             |
| `src/main.tsx`                                                                                                                     | 4             | Per-weight font imports                                                                       |
| `src/lib/font-preload.ts` (new) + test                                                                                             | 4             | Picks the two Karantina files to preload                                                      |
| `vite.config.ts`                                                                                                                   | 4, 7          | The preload plugin and `globIgnores` (4); manifest colours (7)                                |
| `src/lib/fonts.test.ts` (new)                                                                                                      | 4             | Imports, fallback faces, `font-family` and `font-bold` bans                                   |
| `public/legal.css`                                                                                                                 | 4             | The new stack                                                                                 |
| `e2e/17-fonts.spec.ts` (new), `e2e/04-rtl-hebrew.spec.ts`                                                                          | 4             | Karantina ≥ 28px, no Plex 700, faces loaded, two preloads                                     |
| `src/domain/money-key.ts` (new) + test                                                                                             | 5             | `bankKey`, `issuerKey`, `cardKey`, `methodKey`, `CARD_COLOR_KEYS`                             |
| `src/features/cards/card-colors.ts` + test                                                                                         | 5             | Card colour keys only; gradients retire                                                       |
| `src/features/cards/card-color-field.tsx`, `cards-screen.tsx`                                                                      | 5             | Swatches and the card face as money sheets                                                    |
| `src/features/bank-accounts/bank-accounts-screen.tsx` + test                                                                       | 5             | The account edge by key                                                                       |
| `src/data/brands.ts` + test                                                                                                        | 5             | `brandColor()` retires                                                                        |
| `e2e/14-cards.spec.ts`                                                                                                             | 5             | Forced colours on Cards                                                                       |
| `src/domain/category-hue.ts` (new) + test                                                                                          | 6             | `HUES`, `BUILTIN_HUES`, `categoryHue`, `hashHue`, `leastUsedHue`                              |
| `src/types/domain.ts`, `src/domain/transfer-schema.ts` + test                                                                      | 6             | `Category.hue` and its loose schema                                                           |
| `src/db/repos/categories.ts` + test                                                                                                | 6             | A new custom category's hue; the rollout test                                                 |
| `index.html`, `src/i18n/boot.ts` + test, `src/lib/brand-colours.test.ts`                                                           | 7             | `color-scheme`, one `theme-color` meta following the theme                                    |
| `e2e/screens.spec.ts`, `README.md`                                                                                                 | 8, 16         | The screenshot matrix at 390/1440/1920; design notes                                          |
| `src/i18n/locales/{en,he}/common.json`                                                                                             | 9             | Every phase 2 string                                                                          |
| `src/components/ui/button.tsx` + test                                                                                              | 9             | `pill`, `pill-solid`, `round`, `text` variants                                                |
| `src/components/ui/mark.tsx`, `title-pair.tsx` (new) + tests                                                                       | 9             | The figure box; the title and subtitle as one heading                                         |
| `src/components/app-mark.tsx` (new) + test                                                                                         | 9             | The outlined circle with a Karantina "B"                                                      |
| `scripts/make-grain.mjs` (new), `src/assets/grain.png` (new)                                                                       | 9             | The paper grain, generated once and committed                                                 |
| `src/lib/stylesheet.test.ts` (new)                                                                                                 | 9             | The phase 2 stylesheet contract                                                               |
| `src/components/ui/sheet.tsx`                                                                                                      | 10            | Logical sides `start` / `end`                                                                 |
| `src/components/ui/editor-panel.tsx` (new) + test                                                                                  | 10            | Bottom sheet below `lg`, inline-end panel from `lg`, one popup                                |
| eight editors (see Task 10)                                                                                                        | 10            | Move to `EditorPanel`, contents unchanged                                                     |
| `e2e/18-editor-panel.spec.ts` (new), `e2e/02`, `e2e/04`, `e2e/14`                                                                  | 10            | Placement, Cancel/Save distance, selectors                                                    |
| `src/components/ui/pop-out.tsx` (new) + test                                                                                       | 11            | `PopOut`, `PopOutContent`, `PopOutSteps`, `PopOutBody`, `PopOutPreview`                       |
| `split-purchase.tsx`, `reconvert-dialog.tsx`, `import-sheet.tsx`                                                                   | 11            | Move to `PopOut`                                                                              |
| `e2e/19-popout.spec.ts` (new)                                                                                                      | 11            | Size and placement at 390 / 1440 / 1920                                                       |
| `src/app/routes.ts` + test                                                                                                         | 12            | `RAIL_PLACES`, `RAIL_SETUP`, `navDirection()`                                                 |
| `src/app/app-shell.tsx` + test                                                                                                     | 12            | Rail, tab bar, `main` as a container, view transitions                                        |
| `src/app/use-desktop.ts`, `src/app/shell-editors.tsx` (new)                                                                        | 12            | `lg` in JS; the editors on screens that host none                                             |
| `src/features/account/user-menu.tsx` + test                                                                                        | 12            | Head and rail placements on paper                                                             |
| `src/features/feed/add-menu.tsx`, `src/components/add-button.tsx`, `src/app/toaster.tsx`, `src/features/summary/collapsed-bar.tsx` | 12            | Add in the rail on desktop; offsets for the new rail and tab bar                              |
| `e2e/20-shell.spec.ts` (new), `e2e/00-shell`, `e2e/08-polish`, `e2e/support/add.ts`                                                | 12            | The rail, the tab bar, Add, the content box                                                   |
| `src/app/screen-head.tsx` (new) + test, `src/app/use-theme-color.ts` (new)                                                         | 13            | `ScreenHead`, `HeroSheet`, `ScreenSheet`, the status bar colour                               |
| eleven screens, `src/components/brand-panel.tsx`                                                                                   | 13            | `ScreenPanel` and `PanelSheet` replaced                                                       |
| `e2e/21-screen-head.spec.ts` (new), `e2e/08-polish`                                                                                | 13            | The head at each width, the hero's pills                                                      |
| `src/lib/money.ts` + test                                                                                                          | 14            | `sharesBp()`                                                                                  |
| `src/components/ui/numeral.tsx`, `hue-bars.tsx` (new) + tests                                                                      | 14            | `Numeral`, `HueBars`, `MoneyStrip`                                                            |
| `e2e/22-numerals.spec.ts` (new)                                                                                                    | 14            | The bleed rule on every numeral drawn                                                         |
| `src/components/ui/card-sheet.tsx`, `card-face.tsx`, `money-tile.tsx` (new) + tests                                                | 15            | `CardSheet`, `CardFace`, `MoneyTile`                                                          |
| `e2e/07-a11y`, `e2e/09-pwa-offline`, `e2e/screens.spec.ts`, `README.md`                                                            | 16            | Panels and pop-outs under axe, offline fonts and grain, the full matrix                       |

## Tasks

1. Colour maths and the house tokens.
2. Money colours, category hues and the sheet contexts.
3. The base layer: radius, gap and motion tokens, `hover-fine`, the reset rule by rule.
4. Karantina and IBM Plex Sans Hebrew, self-hosted.
5. Money keys, and card colours as solid sheets.
6. Category hues in the data.
7. The status bar, the manifest and the boot script.
8. Phase 1 gate: the screenshot matrix at three widths, the README, `verify:full`.
9. Phase 2 vocabulary: strings, stylesheet rules, the grain, `Button` pills, `Mark`, `TitlePair`, the app mark.
10. Logical sheet sides and `EditorPanel`; every editor becomes a panel.
11. `PopOut`; split, reconvert and Smart import move into it.
12. The shell: the rail, the tab bar, `main` as a container, Add on every desktop screen, route transitions.
13. `ScreenHead` replaces `ScreenPanel`, and the status bar follows the screen.
14. `sharesBp`, `Numeral`, `HueBars` and `MoneyStrip`.
15. `CardSheet`, `CardFace` and `MoneyTile`.
16. Phase 2 gate: the matrix with overlays, axe with panels open, offline fonts, the README, `verify:full`.

---

## Phase 1: tokens, fonts, colour system

What changes on screen: today's layout, with the new paper, ink, type and solid card colours (§11).

### Task 1: Colour maths and the house tokens

The house is ink on warm paper (§1.1). The five house colours hold literal values; the shadcn names alias them. That split is what lets Task 2's `[data-sheet]` rule set `--foreground: var(--on-fill)` while a paper sheet sets `--on-fill: var(--ink)`, with no cycle.

**Files:**

- Modify: `src/lib/color.ts` (whole file shown below)
- Create: `src/lib/css-tokens.ts`, `src/lib/css-tokens.test.ts`
- Modify: `src/index.css:26-165` (the token header comment, the `:root` and `.dark` token blocks, the `@theme inline` colour list)
- Modify: `src/lib/contrast.test.ts` (whole file replaced)

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `src/lib/color.ts`: `type Oklch = { readonly l: number; readonly c: number; readonly h: number }` (a `none` hue is `Number.NaN`); `parseOklch(value: string): Oklch | undefined`; `oklchToSrgb(c: Oklch): readonly [number, number, number]`; `relativeLuminance(rgb): number`; `contrastRatio(a: Oklch, b: Oklch): number`; `contrastRatioRgb(a: Rgb, b: Rgb): number`; `mixOklch(a: Oklch, b: Oklch, share: number): Oklch`; `compositeOver(top: Oklch, alpha: number, bottom: Oklch): Rgb`; `type Rgb = readonly [number, number, number]`.
  - `src/lib/css-tokens.ts`: `type Paint = { readonly color: Oklch; readonly alpha: number }`; `declarations(css: string, selector: string): ReadonlyMap<string, string>` (every top-level rule with exactly that selector, merged in order); `resolveTheme(...layers: ReadonlyMap<string, string>[]): (name: string) => Paint`; `paintRatio(text: Paint, on: Paint, under: Paint): number` (composites a translucent `on` over `under` before measuring).
  - CSS custom properties (light in `:root`, dark in `.dark`): `--paper`, `--paper-sheet`, `--ink`, `--ink-quiet`, `--box-fill`, `--on-box`, `--night`, `--on-night`, `--primary-ink`, `--primary-hi`, `--focus-ring`, `--box`, `--box-text`, `--press`, `--on-press`, `--scrim`, `--shadow-pop`, and the existing shadcn names.
  - Tailwind utilities from `@theme inline`: `bg-paper`, `text-ink`, `bg-box`, `text-box-text`, `text-on-box`, `bg-night`, `text-on-night`, `bg-press`, `text-on-press`, `text-primary-ink`, `text-primary-hi`, `bg-scrim`, `shadow-pop`.
  - Removed: `--primary-hover` and `--color-primary-hover` (nothing uses them: `grep -rn primary-hover src` finds only `index.css`).

- [ ] **Step 1: Write the failing resolver tests**

Create `src/lib/css-tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { contrastRatio } from './color';
import { declarations, paintRatio, resolveTheme } from './css-tokens';

const CSS = `
:root {
  --a: oklch(0.5 0.1 200);
  --b: var(--a);
  --grey: oklch(0.9 0 none);
  --half: color-mix(in oklch, var(--a) 50%, var(--grey));
  --line: color-mix(in oklch, var(--a) 14%, transparent);
  --scrim: oklch(0.2 0.018 265 / 0.5);
}

.dark {
  --a: oklch(0.8 0.1 200);
}

@media (forced-colors: active) {
  :root {
    --a: oklch(0 0 none);
  }
}

:root {
  --later: var(--b);
}
`;

describe('declarations', () => {
  it('merges every top-level rule with exactly that selector, and skips nested ones', () => {
    const root = declarations(CSS, ':root');
    expect(root.get('--a')).toBe('oklch(0.5 0.1 200)');
    expect(root.get('--later')).toBe('var(--b)');
    expect(declarations(CSS, '.dark').get('--a')).toBe('oklch(0.8 0.1 200)');
  });

  it('throws for a selector the file never uses', () => {
    expect(() => declarations(CSS, '.nope')).toThrow(/No .nope/);
  });
});

describe('resolveTheme', () => {
  const light = resolveTheme(declarations(CSS, ':root'));
  const dark = resolveTheme(declarations(CSS, ':root'), declarations(CSS, '.dark'));

  it('follows var() through aliases, and a dark layer overrides the light one', () => {
    expect(light('--later').color).toEqual({ l: 0.5, c: 0.1, h: 200 });
    expect(dark('--later').color).toEqual({ l: 0.8, c: 0.1, h: 200 });
  });

  it('reads a none hue as missing, and an alpha', () => {
    expect(Number.isNaN(light('--grey').color.h)).toBe(true);
    expect(light('--scrim').alpha).toBeCloseTo(0.5, 10);
  });

  it('mixes in oklch: a missing hue takes the other colour’s', () => {
    const half = light('--half');
    expect(half.color.l).toBeCloseTo(0.7, 10);
    expect(half.color.c).toBeCloseTo(0.05, 10);
    expect(half.color.h).toBeCloseTo(200, 10);
    expect(half.alpha).toBe(1);
  });

  it('mixes with transparent as a translucent version of the colour', () => {
    const line = light('--line');
    expect(line.color).toEqual({ l: 0.5, c: 0.1, h: 200 });
    expect(line.alpha).toBeCloseTo(0.14, 10);
  });

  it('names the token it cannot find, and a cycle', () => {
    expect(() => light('--missing')).toThrow(/--missing/);
    const loop = resolveTheme(
      new Map([
        ['--x', 'var(--y)'],
        ['--y', 'var(--x)'],
      ]),
    );
    expect(() => loop('--x')).toThrow(/cycle/);
  });

  it('refuses a value it cannot read, rather than guessing', () => {
    const odd = resolveTheme(new Map([['--odd', 'rgb(1 2 3)']]));
    expect(() => odd('--odd')).toThrow(/rgb\(1 2 3\)/);
  });
});

describe('paintRatio', () => {
  it('is contrastRatio for two opaque colours', () => {
    const light = resolveTheme(declarations(CSS, ':root'));
    expect(paintRatio(light('--a'), light('--grey'), light('--grey'))).toBeCloseTo(
      contrastRatio(light('--a').color, light('--grey').color),
      10,
    );
  });

  it('composites a translucent surface over what is under it first', () => {
    const light = resolveTheme(declarations(CSS, ':root'));
    // 14% of a mid blue over near-white is still near-white: text in the blue reads against it.
    const over = paintRatio(light('--a'), light('--line'), light('--grey'));
    const bare = paintRatio(light('--a'), light('--grey'), light('--grey'));
    expect(over).toBeLessThan(bare);
    expect(over).toBeGreaterThan(bare * 0.8);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run --project unit src/lib/css-tokens.test.ts`
Expected: FAIL, "Failed to resolve import './css-tokens'".

- [ ] **Step 3: Extend the colour maths**

Replace `src/lib/color.ts` with:

```ts
/**
 * OKLCH to sRGB, and WCAG contrast.
 *
 * The design tokens are authored in OKLCH - which is what shadcn generates
 * under Tailwind v4, and what makes a perceptually even palette possible - but
 * WCAG 2.2 defines contrast over sRGB relative luminance. Without this
 * conversion "contrast-audited" means somebody pasted a hex value into a web
 * tool once, and every later tweak is unverified.
 *
 * The matrices are Björn Ottosson's published OKLab constants. They are
 * reproduced rather than approximated: a rounded matrix shifts a ratio by a
 * few hundredths, which is exactly the margin a 4.5:1 requirement is decided by.
 *
 * A hue written `none` (a grey, white or black that is mixed with something)
 * is `Number.NaN` here, as CSS treats it: a missing component. It converts as
 * hue 0, which with chroma 0 is the same colour, and a mix takes the other
 * colour's hue instead of pulling toward red.
 */

export type Oklch = { readonly l: number; readonly c: number; readonly h: number };

/** Gamma-encoded sRGB, each channel 0..1. */
export type Rgb = readonly [number, number, number];

/** `oklch(0.523 0.121 156.1)` or `oklch(0.9 0 none / 0.5)` -> its components. Undefined if unparseable. */
export function parseOklch(value: string): Oklch | undefined {
  const match = /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+|none)/i.exec(value);
  if (match === null) return undefined;

  const [, rawL, rawC, rawH] = match;
  if (rawL === undefined || rawC === undefined || rawH === undefined) return undefined;

  // CSS allows either 0..1 or a percentage for lightness.
  const l = rawL.endsWith('%')
    ? Number(rawL.slice(0, -1)) / 100 // money-allow: a CSS percentage, not an amount.
    : Number(rawL);

  return { l, c: Number(rawC), h: rawH.toLowerCase() === 'none' ? Number.NaN : Number(rawH) };
}

/** Gamma-encoded sRGB, each channel 0..1, clipped into gamut as a screen shows it. */
export function oklchToSrgb({ l, c, h }: Oklch): Rgb {
  const radians = Number.isNaN(h) ? 0 : (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const lCone = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3; // money-allow: colour space maths
  const mCone = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3; // money-allow: colour space maths
  const sCone = (l - 0.0894841775 * a - 1.291485548 * b) ** 3; // money-allow: colour space maths

  const linear = [
    4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone,
  ];

  return linear.map(encodeGamma) as unknown as Rgb;
}

function encodeGamma(channel: number): number {
  const clipped = Math.min(Math.max(channel, 0), 1);
  return clipped <= 0.0031308 ? clipped * 12.92 : 1.055 * clipped ** (1 / 2.4) - 0.055; // money-allow: colour space maths
}

function decodeGamma(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; // money-allow: colour space maths
}

/** WCAG 2.2 relative luminance of a gamma-encoded sRGB triple. */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(decodeGamma) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 contrast ratio between two sRGB colours, 1:1 to 21:1. */
export function contrastRatioRgb(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG 2.2 contrast ratio between two colours, 1:1 to 21:1.
 *
 * Symmetric by construction - the lighter colour always ends up on top - so a
 * caller cannot get a different answer by passing the pair the other way round.
 */
export function contrastRatio(a: Oklch, b: Oklch): number {
  return contrastRatioRgb(oklchToSrgb(a), oklchToSrgb(b));
}

/**
 * `color-mix(in oklch, a <share>, b)` for two opaque colours: lightness and
 * chroma linearly, the hue the shorter way round the wheel. A missing hue
 * takes the other colour's, as CSS Color 4 says.
 */
export function mixOklch(a: Oklch, b: Oklch, share: number): Oklch {
  const l = a.l * share + b.l * (1 - share);
  const c = a.c * share + b.c * (1 - share);
  if (Number.isNaN(a.h) && Number.isNaN(b.h)) return { l, c, h: Number.NaN };

  const from = Number.isNaN(a.h) ? b.h : a.h;
  const to = Number.isNaN(b.h) ? a.h : b.h;
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  return { l, c, h: (((from + delta * (1 - share)) % 360) + 360) % 360 };
}

/** A translucent colour painted over an opaque one, the way the browser composites: in gamma-encoded sRGB. */
export function compositeOver(top: Oklch, alpha: number, bottom: Oklch): Rgb {
  const upper = oklchToSrgb(top);
  const lower = oklchToSrgb(bottom);
  return [0, 1, 2].map((i) => (upper[i] ?? 0) * alpha + (lower[i] ?? 0) * (1 - alpha)) as unknown as Rgb;
}
```

- [ ] **Step 4: Write the resolver**

Create `src/lib/css-tokens.ts`:

```ts
import { compositeOver, contrastRatioRgb, mixOklch, oklchToSrgb, parseOklch, type Oklch } from './color';

/**
 * The token file, read the way a browser reads it.
 *
 * The house colours are literals and almost everything else is an alias
 * (`--foreground: var(--ink)`) or a mix (`--border: color-mix(in oklch,
 * var(--foreground) 14%, transparent)`). A contrast test that only read
 * literal `oklch()` values would skip the very tokens components use, so this
 * follows `var()` and `color-mix(in oklch, …)` through every `:root` rule,
 * with a `.dark` layer on top for the dark theme - which is what the cascade
 * does on `<html class="dark">`.
 *
 * It reads only what the token file actually writes. Anything else throws
 * with the value in the message, so a new kind of value gets support here on
 * purpose instead of being measured as something it is not.
 */

/** A colour and its opacity. `alpha` is 1 for every literal without a `/ alpha`. */
export type Paint = { readonly color: Oklch; readonly alpha: number };

const TRANSPARENT: Paint = { color: { l: 0, c: 0, h: Number.NaN }, alpha: 0 };

/**
 * Every custom property declared in a TOP-LEVEL rule whose selector is
 * exactly `selector`, merged in file order. Indented rules (inside `@media`,
 * `@layer`) are not top level and are skipped.
 */
export function declarations(css: string, selector: string): ReadonlyMap<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'gm');
  const out = new Map<string, string>();
  let found = false;

  for (const [, body = ''] of css.matchAll(rule)) {
    found = true;
    const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, name, value] of clean.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (name !== undefined && value !== undefined) out.set(name, value.replace(/\s+/g, ' ').trim());
    }
  }

  if (!found) throw new Error(`No ${selector} rule in the stylesheet`);
  return out;
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts;
}

function alphaOf(value: string): number {
  const match = /\/\s*([\d.]+)(%?)\s*\)\s*$/.exec(value);
  if (match === null) return 1;
  const amount = Number(match[1]);
  return match[2] === '%' ? amount / 100 : amount; // money-allow: a CSS percentage, not an amount.
}

/** Premultiplied interpolation, as CSS Color 5 mixes colours that are not opaque. */
function mixPaint(a: Paint, b: Paint, share: number): Paint {
  const alpha = a.alpha * share + b.alpha * (1 - share);
  if (alpha === 0) return TRANSPARENT;
  const weight = (a.alpha * share) / alpha;
  return {
    color: {
      l: a.color.l * weight + b.color.l * (1 - weight),
      c: a.color.c * weight + b.color.c * (1 - weight),
      h: mixOklch(a.color, b.color, share).h,
    },
    alpha,
  };
}

/** Resolve tokens through the given layers, later layers winning: `(:root)` for light, `(:root, .dark)` for dark. */
export function resolveTheme(...layers: readonly ReadonlyMap<string, string>[]): (name: string) => Paint {
  const decls = new Map<string, string>();
  for (const layer of layers) for (const [name, value] of layer) decls.set(name, value);
  const memo = new Map<string, Paint>();

  const token = (name: string, trail: readonly string[]): Paint => {
    const known = memo.get(name);
    if (known !== undefined) return known;
    if (trail.includes(name)) throw new Error(`Token cycle: ${[...trail, name].join(' -> ')}`);
    const value = decls.get(name);
    if (value === undefined) throw new Error(`Token ${name} is not declared`);
    const paint = read(value, [...trail, name]);
    memo.set(name, paint);
    return paint;
  };

  const read = (value: string, trail: readonly string[]): Paint => {
    const text = value.trim();
    if (text === 'transparent') return TRANSPARENT;

    const variable = /^var\(\s*(--[\w-]+)\s*\)$/.exec(text);
    if (variable?.[1] !== undefined) return token(variable[1], trail);

    if (/^oklch\(/i.test(text)) {
      const color = parseOklch(text);
      if (color !== undefined) return { color, alpha: alphaOf(text) };
    }

    const mix = /^color-mix\(\s*in oklch\s*,([\s\S]*)\)$/i.exec(text);
    if (mix?.[1] !== undefined) {
      const [first = '', second = ''] = splitTopLevel(mix[1]);
      const [aText, aShare] = withShare(first);
      const [bText, bShare] = withShare(second);
      const share = aShare ?? (bShare === undefined ? 0.5 : 1 - bShare);
      return mixPaint(read(aText, trail), read(bText, trail), share);
    }

    throw new Error(`Not a colour this reader understands: ${text}`);
  };

  return (name) => token(name, []);
}

/** `var(--a) 14%` -> ['var(--a)', 0.14]; `transparent` -> ['transparent', undefined]. */
function withShare(argument: string): [string, number | undefined] {
  const match = /^([\s\S]*?)\s+([\d.]+)%$/.exec(argument.trim());
  if (match?.[1] === undefined || match[2] === undefined) return [argument.trim(), undefined];
  return [match[1], Number(match[2]) / 100]; // money-allow: a CSS percentage, not an amount.
}

/**
 * Contrast of `text` on `on`. A translucent `on` (a highlight, a line) is
 * composited over `under` first, as it is on screen.
 */
export function paintRatio(text: Paint, on: Paint, under: Paint): number {
  const surface = on.alpha >= 1 ? oklchToSrgb(on.color) : compositeOver(on.color, on.alpha, under.color);
  const ink = text.alpha >= 1 ? oklchToSrgb(text.color) : compositeOver(text.color, text.alpha, on.color);
  return contrastRatioRgb(ink, surface);
}
```

Run: `pnpm exec vitest run --project unit src/lib/css-tokens.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Write the failing house contrast tests**

Replace `src/lib/contrast.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { contrastRatio, oklchToSrgb, parseOklch, relativeLuminance } from './color';
import { declarations, paintRatio, resolveTheme } from './css-tokens';

/**
 * The contrast audit, mechanised, for the house: ink on warm paper, sapphire
 * for the app's own actions (§1.1). Money colours and category hues are
 * `money-colours.test.ts`.
 *
 * Read out of the token file itself and resolved as a browser resolves it,
 * aliases and mixes included, so a tweak to a token is checked by the suite
 * rather than by whoever next looks at the screen in the wrong theme.
 */

const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const ROOT = declarations(CSS, ':root');
const DARK_LAYER = declarations(CSS, '.dark');
const LIGHT = resolveTheme(ROOT);
const DARK = resolveTheme(ROOT, DARK_LAYER);

/** WCAG 2.2: body text 4.5:1; a component boundary or focus indicator 3:1 (1.4.11). */
const TEXT = 4.5;
const COMPONENT = 3;

const PAIRS = [
  { name: 'ink on the page', text: 'foreground', on: 'background', min: TEXT },
  { name: 'ink on the paper sheet', text: 'foreground', on: 'card', min: TEXT },
  { name: 'quiet text on the page', text: 'muted-foreground', on: 'background', min: TEXT },
  { name: 'quiet text on the sheet', text: 'muted-foreground', on: 'card', min: TEXT },
  { name: 'quiet text on muted', text: 'muted-foreground', on: 'muted', min: TEXT },
  { name: 'secondary text', text: 'secondary-foreground', on: 'secondary', min: TEXT },
  { name: 'text on sapphire', text: 'primary-foreground', on: 'primary', min: TEXT },
  { name: 'sapphire as text on the page', text: 'primary-ink', on: 'background', min: TEXT },
  { name: 'sapphire as text on the sheet', text: 'primary-ink', on: 'card', min: TEXT },
  { name: 'sapphire as text on a popover', text: 'primary-ink', on: 'popover', min: TEXT },
  { name: 'a menu item on its highlight', text: 'popover-foreground', on: 'accent', min: TEXT },
  { name: 'sapphire on the highlight', text: 'primary-ink', on: 'accent', min: TEXT },
  { name: 'the box', text: 'on-box', on: 'box-fill', min: TEXT },
  { name: 'lifted sapphire in the box', text: 'primary-hi', on: 'box-fill', min: TEXT },
  { name: 'paper on the ink sheet', text: 'on-night', on: 'night', min: TEXT },
  { name: 'the flipped box on the ink sheet', text: 'night', on: 'on-night', min: TEXT },
  { name: 'a pressed control', text: 'on-press', on: 'press', min: TEXT },
  { name: 'the front door panel', text: 'brand-deep-foreground', on: 'brand-deep', min: TEXT },
  { name: 'destructive fill', text: 'destructive-foreground', on: 'destructive', min: TEXT },
  { name: 'destructive as text on the page', text: 'destructive', on: 'background', min: TEXT },
  { name: 'destructive as text on the sheet', text: 'destructive', on: 'card', min: TEXT },
  { name: 'destructive on muted', text: 'destructive', on: 'muted', min: TEXT },
  { name: 'income on the page', text: 'income', on: 'background', min: TEXT },
  { name: 'income on the sheet', text: 'income', on: 'card', min: TEXT },
  { name: 'income on muted', text: 'income', on: 'muted', min: TEXT },
  { name: 'expense on the page', text: 'expense', on: 'background', min: TEXT },
  { name: 'expense on the sheet', text: 'expense', on: 'card', min: TEXT },
  { name: 'expense on muted', text: 'expense', on: 'muted', min: TEXT },
  // Component boundaries: 1.4.11, not 1.4.3. --input is a field's only affordance (decision 15).
  { name: 'field edge on the page', text: 'input', on: 'background', min: COMPONENT },
  { name: 'field edge on the sheet', text: 'input', on: 'card', min: COMPONENT },
  { name: 'focus ring on the page', text: 'ring', on: 'background', min: COMPONENT },
  { name: 'focus ring on the sheet', text: 'ring', on: 'card', min: COMPONENT },
  { name: 'chart income dots', text: 'chart-income', on: 'card', min: COMPONENT },
  { name: 'chart expense dots', text: 'chart-expense', on: 'card', min: COMPONENT },
  { name: 'chart balance line', text: 'chart-balance', on: 'card', min: COMPONENT },
] as const;

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s theme', (_theme, palette) => {
  it.each(PAIRS)('$name is at least $min:1', ({ text, on, min }) => {
    const ratio = paintRatio(palette(`--${text}`), palette(`--${on}`), palette('--popover'));

    expect(ratio).toBeGreaterThanOrEqual(min);
  });
});

/** Names whose :root value is a literal oklch(): the colours a theme must restate. */
const literals = (layer: ReadonlyMap<string, string>) =>
  [...layer].filter(([, value]) => value.startsWith('oklch(')).map(([name]) => name);

describe('the two themes', () => {
  it('restate every literal colour in dark mode', () => {
    // A literal missing from .dark inherits the light value into dark mode,
    // which is how a white-on-white label happens.
    const dark = new Set(DARK_LAYER.keys());
    expect(literals(ROOT).filter((name) => !dark.has(name))).toEqual([]);
  });

  it('declare nothing in dark mode that light mode lacks', () => {
    expect([...DARK_LAYER.keys()].filter((name) => !ROOT.has(name))).toEqual([]);
  });
});

describe('the house (§1.1), pinned so a floor-passing drift still fails', () => {
  it('is warm paper and cool ink', () => {
    expect(LIGHT('--background').color).toEqual({ l: 0.962, c: 0.012, h: 85 });
    expect(LIGHT('--card').color).toEqual({ l: 0.992, c: 0.006, h: 85 });
    expect(LIGHT('--foreground').color).toEqual({ l: 0.2, c: 0.018, h: 265 });
    expect(DARK('--background').color).toEqual({ l: 0.2, c: 0.012, h: 70 });
    expect(DARK('--card').color).toEqual({ l: 0.255, c: 0.012, h: 70 });
    expect(DARK('--foreground').color).toEqual({ l: 0.95, c: 0.012, h: 85 });
  });

  it('keeps sapphire for the app, deeper in dark mode, with its own text token', () => {
    expect(LIGHT('--primary').color).toEqual({ l: 0.462, c: 0.175, h: 263 });
    expect(DARK('--primary').color).toEqual({ l: 0.42, c: 0.165, h: 263 });
    expect(LIGHT('--primary-ink').color).toEqual(LIGHT('--primary').color);
    expect(DARK('--primary-ink').color).toEqual({ l: 0.78, c: 0.12, h: 263 });
    // Decision 14: the dark fill as text on the dark paper would be 2.06:1.
    expect(contrastRatio(DARK('--primary').color, DARK('--background').color)).toBeLessThan(TEXT);
  });

  it('focuses in sapphire on the paper: the fill in light, the text token in dark', () => {
    expect(LIGHT('--ring').color).toEqual(LIGHT('--primary').color);
    expect(DARK('--ring').color).toEqual(DARK('--primary-ink').color);
  });

  it('keeps income green and the highlight neutral', () => {
    expect(LIGHT('--income').color.h).toBe(155);
    expect(DARK('--income').color.h).toBe(155);
    expect(LIGHT('--accent').alpha).toBeCloseTo(0.06, 10);
    expect(LIGHT('--accent').color).toEqual(LIGHT('--foreground').color);
  });

  it('keeps the front door’s dark links readable', () => {
    // The front door keeps its sapphire panel (decision 39); its dark-mode links take --brand-vivid.
    expect(contrastRatio(DARK('--background').color, DARK('--brand-vivid').color)).toBeGreaterThanOrEqual(
      TEXT,
    );
  });

  it('has no --primary-hover any more: nothing used it', () => {
    expect(ROOT.has('--primary-hover')).toBe(false);
  });
});

describe('the colour maths', () => {
  it('converts the OKLCH extremes to the sRGB ones', () => {
    expect(oklchToSrgb({ l: 0, c: 0, h: 0 })).toEqual([0, 0, 0]);
    expect(oklchToSrgb({ l: 1, c: 0, h: 0 }).map((c) => Math.round(c))).toEqual([1, 1, 1]);
  });

  it('agrees with the WCAG reference values', () => {
    const white = { l: 1, c: 0, h: 0 };
    const black = { l: 0, c: 0, h: 0 };

    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(relativeLuminance(oklchToSrgb(white))).toBeCloseTo(1, 5);
    expect(relativeLuminance(oklchToSrgb(black))).toBeCloseTo(0, 5);
  });

  it('treats a none hue as the grey it is', () => {
    expect(oklchToSrgb({ l: 0.5, c: 0, h: Number.NaN })).toEqual(oklchToSrgb({ l: 0.5, c: 0, h: 0 }));
  });

  it('is symmetric, so a pair cannot be argued either way', () => {
    const a = LIGHT('--primary').color;
    const b = LIGHT('--background').color;

    expect(contrastRatio(a, b)).toBe(contrastRatio(b, a));
  });

  it('accepts a percentage lightness and a none hue, which CSS allows', () => {
    expect(parseOklch('oklch(52.3% 0.121 156.1)')?.l).toBeCloseTo(0.523, 5);
    expect(Number.isNaN(parseOklch('oklch(0.9 0 none)')?.h)).toBe(true);
  });

  it('returns undefined for something that is not a colour', () => {
    expect(parseOklch('var(--primary)')).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `pnpm exec vitest run --project unit src/lib/contrast.test.ts`
Expected: FAIL. "Token --box-fill is not declared", the pins in "the house" fail on the old white page, and "has no --primary-hover" fails.

- [ ] **Step 7: Replace the token blocks**

In `src/index.css`, replace everything from the line `/* ---------------------------------------------------------------------------` that opens "Design tokens." (line 26) down to and including the closing `}` of the `.dark` block (line 122) with:

```css
/* ---------------------------------------------------------------------------
   Design tokens: Colour of money (docs/superpowers/specs/2026-10-09-colour-of-money-design.md).

   The house is ink on warm paper. Money comes as full-strength coloured
   sheets (the next section), so colour always means a bank, a company, a card
   or a category. Sapphire is the app's own colour - primary buttons, the
   current step, focus, the month sheet - and never a bank's.

   THE FIVE HOUSE COLOURS HOLD THE LITERAL VALUES; THE SHADCN NAMES ALIAS THEM.
   A sheet retints `--foreground` to its own tint, and a paper sheet's tint is
   the ink: `--on-fill: var(--ink)` works, `--on-fill: var(--foreground)` would
   be a cycle and resolve to nothing.

   Every pair the design depends on is re-checked by src/lib/contrast.test.ts
   and src/lib/money-colours.test.ts, which resolve var() and color-mix() the
   way the browser does.

   --border (decorative, 2px) and --input (an affordance needing 3:1) are
   separate tokens on purpose (decision 15).
--------------------------------------------------------------------------- */
:root {
  --radius: 0.75rem;

  /* The house. */
  --paper: oklch(0.962 0.012 85); /* #F6F2EA, the page */
  --paper-sheet: oklch(0.992 0.006 85); /* #FEFCF8, a paper sheet and popovers */
  --ink: oklch(0.2 0.018 265); /* #12161E: 16.22:1 on the page */
  --ink-quiet: oklch(0.43 0.018 265); /* 7.26:1 on the page */
  --box-fill: oklch(0.15 0.01 265); /* the black box behind a figure that matters */
  --on-box: oklch(0.962 0.012 85); /* 17.62:1 */
  --night: oklch(0.2 0.018 265); /* the ink sheet */
  --on-night: oklch(0.962 0.012 85); /* 16.22:1 */

  /* The shadcn names, which every component already uses. */
  --background: var(--paper);
  --foreground: var(--ink);
  --card: var(--paper-sheet);
  --card-foreground: var(--ink);
  --popover: var(--paper-sheet);
  --popover-foreground: var(--ink);
  --muted-foreground: var(--ink-quiet);

  /* A sheet's box and pressed control; [data-sheet] redefines these. */
  --box: var(--box-fill);
  --box-text: var(--on-box);
  --press: var(--ink);
  --on-press: var(--paper);

  /* Sapphire. */
  --primary: oklch(0.462 0.175 263); /* #1F4FB8 */
  --primary-foreground: oklch(0.97 0.02 263); /* 6.71:1 */
  --primary-ink: var(--primary); /* sapphire as text: 6.57:1 on the page */
  --primary-hi: oklch(0.82 0.1 263); /* lifted, in the box: 11.14:1 */
  --focus-ring: var(--primary); /* the paper's focus colour; a sheet's --ring is its own tint */
  --ring: var(--focus-ring);

  --secondary: oklch(0.93 0.012 85);
  --secondary-foreground: var(--ink);
  --muted: oklch(0.93 0.012 85);
  --accent: color-mix(in oklch, var(--foreground) 6%, transparent); /* a neutral highlight */
  --accent-foreground: var(--ink);

  --destructive: oklch(0.531 0.199 27.4); /* 5.21:1 on the page */
  --destructive-foreground: oklch(1 0 none);

  --border: color-mix(in oklch, var(--foreground) 14%, transparent); /* decorative, drawn 2px */
  --input: oklch(0.6 0.018 265); /* 3.54:1 on the page, 3.86:1 on the sheet */

  --income: oklch(0.47 0.12 155); /* 6.26:1 on the sheet */
  --expense: oklch(0.505 0.188 27.3);
  --chart-income: oklch(0.601 0.141 155.8);
  --chart-expense: oklch(0.531 0.199 27.4);
  --chart-balance: var(--ink-quiet);

  --scrim: oklch(0.2 0.018 265 / 0.5); /* behind a modal */
  --shadow-pop: 0 40px 80px -30px oklch(0 0 none / 0.5); /* pop-outs only: sheets draw no shadow */

  /* The front door only (decision 39): its engraved panel and links. */
  --brand-vivid: oklch(0.702 0.158 255.6); /* #56A0FF: lines and the logo, never text on light */
  --brand-deep: oklch(0.374 0.142 261.5); /* #0F3A8A */
  --brand-deep-foreground: oklch(0.985 0.008 262);
}

.dark {
  --paper: oklch(0.2 0.012 70); /* #1A1510 */
  --paper-sheet: oklch(0.255 0.012 70); /* #27221D */
  --ink: oklch(0.95 0.012 85); /* #F2EEE6: 13.65:1 on the sheet */
  --ink-quiet: oklch(0.77 0.012 85); /* 7.62:1 on the sheet */
  --box-fill: oklch(0.11 0.006 70);
  --on-box: oklch(0.95 0.012 85); /* 17.68:1 */
  --night: oklch(0.13 0.006 70);
  --on-night: oklch(0.95 0.012 85);

  --primary: oklch(0.42 0.165 263); /* #1743A5, a deep fill */
  --primary-foreground: oklch(0.96 0.025 263); /* 7.79:1 */
  --primary-ink: oklch(0.78 0.12 263); /* 8.93:1 on the page; the fill as text would be 2.06:1 */
  --primary-hi: oklch(0.82 0.1 263);
  --focus-ring: var(--primary-ink);

  --secondary: oklch(0.27 0.012 70);
  --muted: oklch(0.27 0.012 70);

  /* Dark mode INVERTS the destructive pair: a light red with dark text on it.
     Carrying the light red over left `text-destructive` at 3.03:1 once. */
  --destructive: oklch(0.667 0.167 22.7); /* 5.54:1 as text on the page */
  --destructive-foreground: oklch(0.14 0 none);

  --input: oklch(0.56 0.012 70); /* 3.89:1 on the page, 3.39:1 on the sheet */

  --income: oklch(0.8 0.15 155); /* 8.96:1 on the sheet */
  --expense: oklch(0.667 0.167 22.7); /* 4.82:1 on the sheet */
  --chart-income: oklch(0.788 0.147 159.7);
  --chart-expense: oklch(0.667 0.167 22.7);

  --scrim: oklch(0.08 0 none / 0.6);

  --brand-vivid: oklch(0.702 0.158 255.6); /* 6.80:1 as a link on the dark page */
  --brand-deep: oklch(0.314 0.117 261.7); /* #0B2C6B */
  --brand-deep-foreground: oklch(0.985 0.008 262);
}
```

The `--input` values differ from the spec's "unchanged": the old values measure 2.72:1 on the new light paper and 2.98:1 on the dark sheet, which breaks decision 15 (3:1). The new values are the nearest that pass both surfaces in each theme.

- [ ] **Step 8: Map the new tokens into Tailwind**

In the `@theme inline` block of `src/index.css`, delete the line `--color-primary-hover: var(--primary-hover);` and add after `--color-brand-deep-foreground: var(--brand-deep-foreground);`:

```css
--color-paper: var(--paper);
--color-ink: var(--ink);
--color-box: var(--box);
--color-box-text: var(--box-text);
--color-on-box: var(--on-box);
--color-night: var(--night);
--color-on-night: var(--on-night);
--color-press: var(--press);
--color-on-press: var(--on-press);
--color-primary-ink: var(--primary-ink);
--color-primary-hi: var(--primary-hi);
--color-scrim: var(--scrim);
--shadow-pop: var(--shadow-pop);
```

- [ ] **Step 9: Run the tests**

Run: `pnpm exec vitest run --project unit src/lib/contrast.test.ts src/lib/css-tokens.test.ts src/lib/brand-colours.test.ts`
Expected: PASS. `brand-colours.test.ts` still passes: it reads `index.html`, `vite.config.ts`, the favicon and `legal.css`, none of which this task touches.

- [ ] **Step 10: Look at it, then the gate**

Run `pnpm dev`, open `http://localhost:5173/` in light and dark (account menu → Appearance). Expected: the page is warm paper, text is ink, the sapphire panel and rail are unchanged (they use `--brand-deep`, which is the front door's and stays until Task 13). Then run `pnpm verify`.
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add src/lib/color.ts src/lib/css-tokens.ts src/lib/css-tokens.test.ts src/lib/contrast.test.ts src/index.css
git commit -m "The app is ink on warm paper, with sapphire kept for its own actions, and the contrast test now reads aliases and colour mixes the way the browser does" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Money colours, category hues and the sheet contexts

**Files:**

- Modify: `src/index.css` (a new "Money colours" section after the `.dark` token block; three lines in `@theme inline`)
- Create: `src/lib/money-colours.test.ts`

**Interfaces:**

- Consumes (Task 1): `declarations`, `resolveTheme`, `paintRatio` from `src/lib/css-tokens.ts`; `contrastRatio`, `mixOklch` from `src/lib/color.ts`; the house tokens `--paper-sheet`, `--ink`, `--night`, `--on-night`, `--box-fill`, `--on-box`, `--primary`, `--primary-foreground`, `--primary-hi`, `--ink-quiet`.
- Produces:
  - Tokens `--money-<key>`, `--money-<key>-on`, `--money-<key>-hi` for every key in `MONEY_KEYS` below, and `--hue-<hue>`, `--hue-<hue>-2` for the twelve hues, plus `--hue-neutral`.
  - The attribute contract every later component uses:
    - `data-sheet="paper" | "night" | "sapphire" | "money"` sets `--fill`, `--on-fill`, `--box`, `--box-text`, paints `background-color: var(--fill)` and `color: var(--on-fill)`, and retints `--foreground`, `--muted-foreground`, `--border`, `--input`, `--ring`, `--press`, `--on-press`, `--accent`.
    - `data-money="<key>"` (on its own, or with `data-sheet="money"`) sets the four properties; an unknown key is the neutral ink sheet.
    - `data-hue="<hue>" | "<hue>-2"` sets `--hue`; an unknown key is `--hue-neutral`.
  - Tailwind utilities: `bg-fill`, `text-on-fill`, `bg-hue`.
  - Money keys: `bank-10`, `bank-12`, `bank-11`, `bank-20`, `bank-17`, `bank-31`, `bank-52`, `bank-14`, `bank-26`, `bank-46`, `bank-4`, `bank-18`, `issuer-isracard`, `issuer-cal`, `issuer-max`, `issuer-amex`, `issuer-diners`, `cash`, `card-black`, `card-silver`, `card-blue`, `card-teal`, `card-green`, `card-gold`, `card-orange`, `card-red`, `card-rose`, `card-purple`, and `neutral`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/money-colours.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { contrastRatio, mixOklch, type Oklch } from './color';
import { declarations, resolveTheme } from './css-tokens';

/**
 * Money colours (§1.3), category hues (§1.4) and the sheet contexts (§1.6).
 *
 * The rules a person cannot see break in a screenshot until it is too late:
 * tint text that dropped under 4.5:1, a tint whose hue drifted from its
 * sheet's, a hue too pale to see on the paper, a field edge that vanishes
 * inside a sheet. All of them are here, for every key, in both themes.
 */

const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const ROOT = declarations(CSS, ':root');
const LIGHT = resolveTheme(ROOT);
const DARK = resolveTheme(ROOT, declarations(CSS, '.dark'));
const THEMES = [
  ['light', LIGHT],
  ['dark', DARK],
] as const;

const BANKS = ['10', '12', '11', '20', '17', '31', '52', '14', '26', '46', '4', '18'];
const ISSUERS = ['isracard', 'cal', 'max', 'amex', 'diners'];
const CARDS = ['black', 'silver', 'blue', 'teal', 'green', 'gold', 'orange', 'red', 'rose', 'purple'];
const MONEY_KEYS = [
  ...BANKS.map((code) => `bank-${code}`),
  ...ISSUERS.map((issuer) => `issuer-${issuer}`),
  ...CARDS.map((key) => `card-${key}`),
  'cash',
];
const HUES = [
  'indigo',
  'green',
  'vermilion',
  'amber',
  'orange',
  'cyan',
  'violet',
  'rose',
  'magenta',
  'teal',
  'blue',
  'lime',
];

const color = (theme: (name: string) => { color: Oklch }, name: string) => theme(name).color;
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

describe.each(THEMES)('money colours, %s', (_name, theme) => {
  it.each(MONEY_KEYS)('%s: its tint reads at 4.5:1 on its fill', (key) => {
    expect(
      contrastRatio(color(theme, `--money-${key}-on`), color(theme, `--money-${key}`)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(MONEY_KEYS)('%s: its lifted colour reads at 7:1 in the black box', (key) => {
    expect(
      contrastRatio(color(theme, `--money-${key}-hi`), color(theme, '--box-fill')),
    ).toBeGreaterThanOrEqual(7);
  });

  it.each(MONEY_KEYS)('%s: tint and lifted colour keep the fill’s hue within 2°', (key) => {
    const fill = color(theme, `--money-${key}`);
    if (fill.c < 0.01) return; // a grey fill (One Zero) has no hue to keep
    expect(hueGap(color(theme, `--money-${key}-on`).h, fill.h)).toBeLessThanOrEqual(2);
    expect(hueGap(color(theme, `--money-${key}-hi`).h, fill.h)).toBeLessThanOrEqual(2);
  });

  it.each(MONEY_KEYS)('%s: its tint follows the rule for a dark or a light sheet', (key) => {
    const tint = color(theme, `--money-${key}-on`);
    if (tint.l > 0.5) {
      // a dark sheet speaks in a pale tint
      expect(tint.l).toBeGreaterThanOrEqual(0.95);
      expect(tint.l).toBeLessThanOrEqual(0.97);
      expect(tint.c).toBeLessThanOrEqual(0.03);
    } else {
      // a light sheet speaks in a deep tint
      expect(tint.l).toBeGreaterThanOrEqual(0.2);
      expect(tint.l).toBeLessThanOrEqual(0.22);
      expect(tint.c).toBeGreaterThanOrEqual(0.045);
      expect(tint.c).toBeLessThanOrEqual(0.06);
    }
  });

  it.each([...MONEY_KEYS, 'neutral'])('%s: a field edge and the focus ring inside it reach 3:1', (key) => {
    const fill = color(theme, `--money-${key}`);
    const tint = color(theme, `--money-${key}-on`);
    // [data-sheet] { --input: color-mix(in oklch, var(--on-fill) 70%, var(--fill)); --ring: currentColor }
    expect(contrastRatio(mixOklch(tint, fill, 0.7), fill)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(tint, fill)).toBeGreaterThanOrEqual(3);
  });
});

describe('money colours, the pins (decision 8, §13.1)', () => {
  const light = (key: string) =>
    contrastRatio(color(LIGHT, `--money-${key}-on`), color(LIGHT, `--money-${key}`));

  it('measures the three darkened brands where the spec says', () => {
    expect(light('bank-12')).toBeCloseTo(5.44, 2);
    expect(light('issuer-max')).toBeCloseTo(5.42, 2);
    expect(light('issuer-amex')).toBeCloseTo(5.0, 2);
  });

  it('measures the light sheets where the spec says', () => {
    expect(light('bank-20')).toBeCloseTo(6.02, 2);
    expect(light('issuer-cal')).toBeCloseTo(5.93, 2);
    expect(light('cash')).toBeCloseTo(11.26, 2);
  });

  it('deepens brand fills in dark mode and keeps their tints', () => {
    for (const key of MONEY_KEYS.filter((k) => k !== 'cash' && k !== 'issuer-diners')) {
      expect(color(DARK, `--money-${key}`).l, key).toBeLessThan(color(LIGHT, `--money-${key}`).l);
      expect(color(DARK, `--money-${key}-on`), key).toEqual(color(LIGHT, `--money-${key}-on`));
    }
  });
});

describe.each(THEMES)('category hues, %s', (_name, theme) => {
  it.each(HUES)('%s: both tones show at 3:1 on the paper and on the sheet', (hue) => {
    for (const tone of [`--hue-${hue}`, `--hue-${hue}-2`]) {
      expect(contrastRatio(color(theme, tone), color(theme, '--background')), tone).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(color(theme, tone), color(theme, '--card')), tone).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(HUES)('%s: tone B is at least 0.12 away from tone A in lightness', (hue) => {
    const gap = Math.abs(color(theme, `--hue-${hue}`).l - color(theme, `--hue-${hue}-2`).l);
    expect(gap).toBeGreaterThanOrEqual(0.12 - 1e-9);
  });

  it('draws the neutral mark at 3:1 too', () => {
    expect(contrastRatio(color(theme, '--hue-neutral'), color(theme, '--card'))).toBeGreaterThanOrEqual(3);
  });
});

describe.each(THEMES)('the house sheets, %s', (_name, theme) => {
  const sheets = {
    paper: ['--paper-sheet', '--ink', '--box-fill', '--on-box'],
    night: ['--night', '--on-night', '--on-night', '--night'],
    sapphire: ['--primary', '--primary-foreground', '--box-fill', '--primary-hi'],
  } as const;

  it.each(Object.entries(sheets))(
    '%s: text, field edge, focus and box all read',
    (_kind, [fill, on, box, boxText]) => {
      const f = color(theme, fill);
      const t = color(theme, on);
      expect(contrastRatio(t, f)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(mixOklch(t, f, 0.7), f)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(color(theme, boxText), color(theme, box))).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('the mapping (§1.5)', () => {
  /** The declarations of one top-level `[data-…]` rule, read from the stylesheet itself. */
  const rule = (selector: string) => declarations(CSS, selector);

  it.each(MONEY_KEYS)('%s: has a rule that points at its own three tokens', (key) => {
    const decls = rule(`[data-money='${key}']`);
    expect(decls.get('--fill')).toBe(`var(--money-${key})`);
    expect(decls.get('--on-fill')).toBe(`var(--money-${key}-on)`);
    expect(decls.get('--box')).toBe('var(--box-fill)');
    expect(decls.get('--box-text')).toBe(`var(--money-${key}-hi)`);
  });

  it('falls through to the neutral ink sheet for a key it does not know', () => {
    const decls = rule('[data-money]');
    expect(decls.get('--fill')).toBe('var(--money-neutral)');
    expect(decls.get('--on-fill')).toBe('var(--money-neutral-on)');
    // The ink sheet's box flips to paper with ink text (§1.5).
    expect(decls.get('--box')).toBe('var(--on-night)');
  });

  it.each(HUES)('%s: both tones have a rule', (hue) => {
    expect(rule(`[data-hue='${hue}']`).get('--hue')).toBe(`var(--hue-${hue})`);
    expect(rule(`[data-hue='${hue}-2']`).get('--hue')).toBe(`var(--hue-${hue}-2)`);
  });

  it('retints everything inside a sheet from the sheet', () => {
    const sheet = rule('[data-sheet]');
    expect(sheet.get('--foreground')).toBe('var(--on-fill)');
    expect(sheet.get('--muted-foreground')).toBe('var(--on-fill)');
    expect(sheet.get('--input')).toBe('color-mix(in oklch, var(--on-fill) 70%, var(--fill))');
    expect(sheet.get('--ring')).toBe('currentColor');
    expect(sheet.get('--press')).toBe('var(--box)');
    expect(sheet.get('--on-press')).toBe('var(--box-text)');
  });

  it('paints every sheet and hue mark an edge that forced colours keep (§1.8)', () => {
    expect(CSS).toMatch(/\[data-sheet\],\s*\[data-hue\]\s*\{\s*border:\s*2px solid transparent;/);
  });
});
```

The mapping rules are written at top level, outside any `@layer`, so `declarations()` reads them exactly as it reads the token blocks. Being unlayered they beat Tailwind utilities on the same element, which is safe: they set only custom properties, `background-color`, `color` and `border`, and a component that needs a different fill (the transparent "Not listed" tile, Task 15) leaves `data-sheet` off instead of overriding it.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run --project unit src/lib/money-colours.test.ts`
Expected: FAIL, "Token --money-bank-10-on is not declared".

- [ ] **Step 3: Add the money colours, hues and the mapping**

In `src/index.css`, directly after the closing `}` of the `.dark` token block from Task 1, add:

```css
/* ---------------------------------------------------------------------------
   Money colours (§1.3) and category hues (§1.4).

   Keys, not colours: data stores `bank-10`, `issuer-cal`, `card-teal`, `cash`
   or a hue key, never a value, so a shade changes here without touching
   anybody's data. Each money key has a fill, a tinted text colour (a tint of
   the fill's own hue, decision 4) and a lifted colour for a figure in the
   black box. Dark mode deepens brand fills and keeps their tints.

   Hapoalim, Max and Amex are darkened slightly from the brands' own colours,
   so their tints measure 5.44, 5.42 and 5.00:1 (decision 8). The FIBI group
   (FIBI, PAGI, Otsar HaHayal, Massad, U-Bank) really are all navy, and are
   told apart by name. One Zero's black is raised to ink so the box still reads.

   Category hues are MARKS ONLY, never text (decision 10): bars, pills and
   strips, each with its name beside it. Tone B is the same hue, darker.
--------------------------------------------------------------------------- */
:root {
  --money-bank-10: oklch(0.476 0.145 254); /* Leumi #0C5CAB, tint 6.05:1 */
  --money-bank-10-on: oklch(0.965 0.025 254);
  --money-bank-10-hi: oklch(0.8 0.11 254);
  --money-bank-12: oklch(0.52 0.205 25); /* Hapoalim #C40E22, tint 5.44:1 */
  --money-bank-12-on: oklch(0.965 0.025 25);
  --money-bank-12-hi: oklch(0.8 0.12 25);
  --money-bank-11: oklch(0.5 0.12 155); /* Discount #0B7643, tint 5.17:1 */
  --money-bank-11-on: oklch(0.965 0.03 155);
  --money-bank-11-hi: oklch(0.83 0.14 155);
  --money-bank-20: oklch(0.684 0.184 44); /* Mizrahi-Tefahot #F26B23, tint 6.02:1 */
  --money-bank-20-on: oklch(0.2 0.06 44);
  --money-bank-20-hi: oklch(0.72 0.17 44);
  --money-bank-17: oklch(0.459 0.1 145); /* Mercantile, tint 6.24:1 */
  --money-bank-17-on: oklch(0.965 0.025 145);
  --money-bank-17-hi: oklch(0.82 0.07 145);
  --money-bank-31: oklch(0.44 0.137 253); /* FIBI, tint 7.05:1 */
  --money-bank-31-on: oklch(0.965 0.025 253);
  --money-bank-31-hi: oklch(0.82 0.096 253);
  --money-bank-52: oklch(0.316 0.122 259); /* PAGI, tint 11.80:1 */
  --money-bank-52-on: oklch(0.965 0.025 259);
  --money-bank-52-hi: oklch(0.82 0.085 259);
  --money-bank-14: oklch(0.441 0.138 254); /* Otsar HaHayal, tint 7.04:1 */
  --money-bank-14-on: oklch(0.965 0.025 254);
  --money-bank-14-hi: oklch(0.82 0.097 254);
  --money-bank-26: oklch(0.408 0.119 251); /* U-Bank, tint 8.05:1 */
  --money-bank-26-on: oklch(0.965 0.025 251);
  --money-bank-26-hi: oklch(0.82 0.083 251);
  --money-bank-46: oklch(0.412 0.141 256); /* Massad, tint 8.01:1 */
  --money-bank-46-on: oklch(0.965 0.025 256);
  --money-bank-46-hi: oklch(0.82 0.099 256);
  --money-bank-4: oklch(0.403 0.152 269); /* Yahav, tint 8.51:1 */
  --money-bank-4-on: oklch(0.965 0.025 269);
  --money-bank-4-hi: oklch(0.82 0.1 269);
  --money-bank-18: oklch(0.2 0 none); /* One Zero, raised to ink; tint 16.36:1 */
  --money-bank-18-on: oklch(0.965 0 none);
  --money-bank-18-hi: oklch(0.82 0 none);

  --money-issuer-isracard: oklch(0.367 0.15 270); /* #23328C, tint 9.75:1 */
  --money-issuer-isracard-on: oklch(0.96 0.03 270);
  --money-issuer-isracard-hi: oklch(0.8 0.1 270);
  --money-issuer-cal: oklch(0.657 0.112 195); /* #01A6A6, tint 5.93:1 */
  --money-issuer-cal-on: oklch(0.2 0.045 195);
  --money-issuer-cal-hi: oklch(0.72 0.12 195);
  --money-issuer-max: oklch(0.525 0.215 353); /* #BD0475, tint 5.42:1 */
  --money-issuer-max-on: oklch(0.965 0.025 353);
  --money-issuer-max-hi: oklch(0.8 0.13 353);
  --money-issuer-amex: oklch(0.52 0.165 253); /* #0068C4 (clipped), tint 5.00:1 */
  --money-issuer-amex-on: oklch(0.965 0.025 253);
  --money-issuer-amex-hi: oklch(0.82 0.1 253);
  --money-issuer-diners: oklch(0.312 0.02 261); /* #2B313B, tint 11.29:1 */
  --money-issuer-diners-on: oklch(0.95 0.008 261);
  --money-issuer-diners-hi: oklch(0.86 0.03 261);

  --money-cash: oklch(0.861 0.159 86); /* #FFC93C (clipped), tint 11.26:1 */
  --money-cash-on: oklch(0.22 0.05 86);
  --money-cash-hi: oklch(0.861 0.159 86);

  /* The colours a person can give a card (CARD_COLOR_KEYS in src/domain/money-key.ts). */
  --money-card-black: oklch(0.24 0.01 277);
  --money-card-black-on: oklch(0.965 0.003 277);
  --money-card-black-hi: oklch(0.82 0.01 277);
  --money-card-silver: oklch(0.514 0.023 258);
  --money-card-silver-on: oklch(0.965 0.006 258);
  --money-card-silver-hi: oklch(0.82 0.023 258);
  --money-card-blue: oklch(0.459 0.12 260);
  --money-card-blue-on: oklch(0.965 0.025 260);
  --money-card-blue-hi: oklch(0.82 0.1 260);
  --money-card-teal: oklch(0.525 0.085 185); /* the lowest tint: 4.70:1 */
  --money-card-teal-on: oklch(0.965 0.021 185);
  --money-card-teal-hi: oklch(0.82 0.085 185);
  --money-card-green: oklch(0.434 0.085 153);
  --money-card-green-on: oklch(0.965 0.021 153);
  --money-card-green-hi: oklch(0.82 0.085 153);
  --money-card-gold: oklch(0.494 0.088 82);
  --money-card-gold-on: oklch(0.965 0.022 82);
  --money-card-gold-hi: oklch(0.82 0.088 82);
  --money-card-orange: oklch(0.489 0.114 46);
  --money-card-orange-on: oklch(0.965 0.025 46);
  --money-card-orange-hi: oklch(0.82 0.1 46);
  --money-card-red: oklch(0.428 0.138 19);
  --money-card-red-on: oklch(0.965 0.025 19);
  --money-card-red-hi: oklch(0.82 0.1 19);
  --money-card-rose: oklch(0.513 0.133 0);
  --money-card-rose-on: oklch(0.965 0.025 0);
  --money-card-rose-hi: oklch(0.82 0.1 0);
  --money-card-purple: oklch(0.451 0.143 340);
  --money-card-purple-on: oklch(0.965 0.025 340);
  --money-card-purple-hi: oklch(0.82 0.1 340);

  /* No colour of its own: the ink sheet, with the paper as text, and a flipped box. */
  --money-neutral: var(--night);
  --money-neutral-on: var(--on-night);
  --money-neutral-hi: var(--night);

  --hue-indigo: oklch(0.5 0.16 272);
  --hue-indigo-2: oklch(0.36 0.136 272);
  --hue-green: oklch(0.6 0.17 142);
  --hue-green-2: oklch(0.46 0.145 142);
  --hue-vermilion: oklch(0.6 0.2 33);
  --hue-vermilion-2: oklch(0.46 0.17 33);
  --hue-amber: oklch(0.64 0.15 82); /* the lowest: 3.05:1 on the page */
  --hue-amber-2: oklch(0.5 0.128 82);
  --hue-orange: oklch(0.63 0.17 58);
  --hue-orange-2: oklch(0.49 0.145 58);
  --hue-cyan: oklch(0.58 0.12 222);
  --hue-cyan-2: oklch(0.44 0.102 222);
  --hue-violet: oklch(0.55 0.2 302);
  --hue-violet-2: oklch(0.41 0.17 302);
  --hue-rose: oklch(0.6 0.2 8);
  --hue-rose-2: oklch(0.46 0.17 8);
  --hue-magenta: oklch(0.52 0.22 332);
  --hue-magenta-2: oklch(0.38 0.187 332);
  --hue-teal: oklch(0.58 0.11 182);
  --hue-teal-2: oklch(0.44 0.093 182);
  --hue-blue: oklch(0.55 0.16 246);
  --hue-blue-2: oklch(0.41 0.136 246);
  --hue-lime: oklch(0.62 0.15 118);
  --hue-lime-2: oklch(0.48 0.128 118);
  /* "Other", and a hue key this build does not know. */
  --hue-neutral: var(--ink-quiet);
}

.dark {
  --money-bank-10: oklch(0.44 0.14 254);
  --money-bank-10-on: oklch(0.965 0.025 254);
  --money-bank-10-hi: oklch(0.8 0.11 254);
  --money-bank-12: oklch(0.48 0.19 25);
  --money-bank-12-on: oklch(0.965 0.025 25);
  --money-bank-12-hi: oklch(0.8 0.12 25);
  --money-bank-11: oklch(0.45 0.11 155);
  --money-bank-11-on: oklch(0.965 0.03 155);
  --money-bank-11-hi: oklch(0.83 0.14 155);
  --money-bank-20: oklch(0.65 0.175 44);
  --money-bank-20-on: oklch(0.2 0.06 44);
  --money-bank-20-hi: oklch(0.72 0.17 44);
  --money-bank-17: oklch(0.419 0.1 145);
  --money-bank-17-on: oklch(0.965 0.025 145);
  --money-bank-17-hi: oklch(0.82 0.07 145);
  --money-bank-31: oklch(0.4 0.137 253);
  --money-bank-31-on: oklch(0.965 0.025 253);
  --money-bank-31-hi: oklch(0.82 0.096 253);
  --money-bank-52: oklch(0.276 0.122 259);
  --money-bank-52-on: oklch(0.965 0.025 259);
  --money-bank-52-hi: oklch(0.82 0.085 259);
  --money-bank-14: oklch(0.401 0.138 254);
  --money-bank-14-on: oklch(0.965 0.025 254);
  --money-bank-14-hi: oklch(0.82 0.097 254);
  --money-bank-26: oklch(0.368 0.119 251);
  --money-bank-26-on: oklch(0.965 0.025 251);
  --money-bank-26-hi: oklch(0.82 0.083 251);
  --money-bank-46: oklch(0.372 0.141 256);
  --money-bank-46-on: oklch(0.965 0.025 256);
  --money-bank-46-hi: oklch(0.82 0.099 256);
  --money-bank-4: oklch(0.363 0.152 269);
  --money-bank-4-on: oklch(0.965 0.025 269);
  --money-bank-4-hi: oklch(0.82 0.1 269);
  --money-bank-18: oklch(0.16 0 none);
  --money-bank-18-on: oklch(0.965 0 none);
  --money-bank-18-hi: oklch(0.82 0 none);

  --money-issuer-isracard: oklch(0.34 0.14 270);
  --money-issuer-isracard-on: oklch(0.96 0.03 270);
  --money-issuer-isracard-hi: oklch(0.8 0.1 270);
  --money-issuer-cal: oklch(0.62 0.105 195);
  --money-issuer-cal-on: oklch(0.2 0.045 195);
  --money-issuer-cal-hi: oklch(0.72 0.12 195);
  --money-issuer-max: oklch(0.48 0.2 353);
  --money-issuer-max-on: oklch(0.965 0.025 353);
  --money-issuer-max-hi: oklch(0.8 0.13 353);
  --money-issuer-amex: oklch(0.46 0.15 253);
  --money-issuer-amex-on: oklch(0.965 0.025 253);
  --money-issuer-amex-hi: oklch(0.82 0.1 253);
  /* Diners is the one brand the concept lifts in dark mode, so it shows on the dark paper. */
  --money-issuer-diners: oklch(0.34 0.02 261);
  --money-issuer-diners-on: oklch(0.95 0.008 261);
  --money-issuer-diners-hi: oklch(0.86 0.03 261);

  --money-cash: oklch(0.8 0.15 86);
  --money-cash-on: oklch(0.22 0.05 86);
  --money-cash-hi: oklch(0.8 0.15 86);

  --money-card-black: oklch(0.2 0.01 277);
  --money-card-black-on: oklch(0.965 0.003 277);
  --money-card-black-hi: oklch(0.82 0.01 277);
  --money-card-silver: oklch(0.474 0.023 258);
  --money-card-silver-on: oklch(0.965 0.006 258);
  --money-card-silver-hi: oklch(0.82 0.023 258);
  --money-card-blue: oklch(0.419 0.12 260);
  --money-card-blue-on: oklch(0.965 0.025 260);
  --money-card-blue-hi: oklch(0.82 0.1 260);
  --money-card-teal: oklch(0.485 0.085 185);
  --money-card-teal-on: oklch(0.965 0.021 185);
  --money-card-teal-hi: oklch(0.82 0.085 185);
  --money-card-green: oklch(0.394 0.085 153);
  --money-card-green-on: oklch(0.965 0.021 153);
  --money-card-green-hi: oklch(0.82 0.085 153);
  --money-card-gold: oklch(0.454 0.088 82);
  --money-card-gold-on: oklch(0.965 0.022 82);
  --money-card-gold-hi: oklch(0.82 0.088 82);
  --money-card-orange: oklch(0.449 0.114 46);
  --money-card-orange-on: oklch(0.965 0.025 46);
  --money-card-orange-hi: oklch(0.82 0.1 46);
  --money-card-red: oklch(0.388 0.138 19);
  --money-card-red-on: oklch(0.965 0.025 19);
  --money-card-red-hi: oklch(0.82 0.1 19);
  --money-card-rose: oklch(0.473 0.133 0);
  --money-card-rose-on: oklch(0.965 0.025 0);
  --money-card-rose-hi: oklch(0.82 0.1 0);
  --money-card-purple: oklch(0.411 0.143 340);
  --money-card-purple-on: oklch(0.965 0.025 340);
  --money-card-purple-hi: oklch(0.82 0.1 340);

  --hue-indigo: oklch(0.72 0.13 272);
  --hue-indigo-2: oklch(0.6 0.117 272);
  --hue-green: oklch(0.76 0.17 142);
  --hue-green-2: oklch(0.64 0.153 142);
  --hue-vermilion: oklch(0.72 0.17 33);
  --hue-vermilion-2: oklch(0.6 0.153 33);
  --hue-amber: oklch(0.82 0.15 82);
  --hue-amber-2: oklch(0.7 0.135 82);
  --hue-orange: oklch(0.76 0.16 58);
  --hue-orange-2: oklch(0.64 0.144 58);
  --hue-cyan: oklch(0.76 0.11 222);
  --hue-cyan-2: oklch(0.64 0.099 222);
  --hue-violet: oklch(0.72 0.16 302);
  --hue-violet-2: oklch(0.6 0.144 302);
  --hue-rose: oklch(0.74 0.16 8);
  --hue-rose-2: oklch(0.62 0.144 8);
  --hue-magenta: oklch(0.7 0.18 332);
  --hue-magenta-2: oklch(0.58 0.162 332); /* the lowest in dark: 3.38:1 on the sheet */
  --hue-teal: oklch(0.76 0.11 182);
  --hue-teal-2: oklch(0.64 0.099 182);
  --hue-blue: oklch(0.74 0.12 246);
  --hue-blue-2: oklch(0.62 0.108 246);
  --hue-lime: oklch(0.8 0.15 118);
  --hue-lime-2: oklch(0.68 0.135 118);
}

/* ---------------------------------------------------------------------------
   Every sheet is a colour context (§1.6, decision 12).

   A component never writes a colour. It sets data-sheet, data-money or
   data-hue, and everything inside takes its colours from there: text, quiet
   text (set apart by weight 300, never by a paler colour), lines, field
   edges, the focus ring, pressed pills and the selection, which turns the
   sheet inside out. A key this build does not know falls through to neutral.
--------------------------------------------------------------------------- */
[data-sheet] {
  background-color: var(--fill);
  color: var(--on-fill);
  --foreground: var(--on-fill);
  --muted-foreground: var(--on-fill);
  --border: color-mix(in oklch, var(--on-fill) 30%, transparent);
  --input: color-mix(in oklch, var(--on-fill) 70%, var(--fill));
  --ring: currentColor;
  --press: var(--box);
  --on-press: var(--box-text);
  --accent: color-mix(in oklch, var(--on-fill) 12%, transparent);
}

/* Forced colours replace backgrounds, so sheets and hue marks would vanish:
   a transparent border is what Windows High Contrast paints as their edge. */
[data-sheet],
[data-hue] {
  border: 2px solid transparent;
}

[data-sheet='paper'] {
  --fill: var(--paper-sheet);
  --on-fill: var(--ink);
  --box: var(--box-fill);
  --box-text: var(--on-box);
}

[data-sheet='night'] {
  --fill: var(--night);
  --on-fill: var(--on-night);
  --box: var(--on-night);
  --box-text: var(--night);
}

[data-sheet='sapphire'] {
  --fill: var(--primary);
  --on-fill: var(--primary-foreground);
  --box: var(--box-fill);
  --box-text: var(--primary-hi);
}

[data-money] {
  --fill: var(--money-neutral);
  --on-fill: var(--money-neutral-on);
  --box: var(--on-night);
  --box-text: var(--money-neutral-hi);
}

[data-money='bank-10'] {
  --fill: var(--money-bank-10);
  --on-fill: var(--money-bank-10-on);
  --box: var(--box-fill);
  --box-text: var(--money-bank-10-hi);
}

[data-money='bank-12'] {
  --fill: var(--money-bank-12);
  --on-fill: var(--money-bank-12-on);
  --box: var(--box-fill);
  --box-text: var(--money-bank-12-hi);
}

[data-money='bank-11'] {
  --fill: var(--money-bank-11);
  --on-fill: var(--money-bank-11-on);
  --box: var(--box-fill);
  --box-text: var(--money-bank-11-hi);
}

[data-money='bank-20'] {
  --fill: var(--money-bank-20);
  --on-fill: var(--money-bank-20-on);
  --box: var(--box-fill);
  --box-text: var(--money-bank-20-hi);
}

[data-money='bank-17'] {
  --fill: var(--money-bank-17);
  --on-fill: var(--money-bank-17-on);
  --box: var(--box-fill);
  --box-text: var(--money-bank-17-hi);
}

[data-money='bank-31'] {
  --fill: var(--money-bank-31);
  --on-fill: var(--money-bank-31-on);
  --box: var(--box-fill);
  --box-text: var(--money-bank-31-hi);
}

[data-money='bank-52'] {
  --fill: var(--money-bank-52);
  --on-fill: var(--money-bank-52-on);
  --box: var(--box-fill);
  --box-text: var(--money-bank-52-hi);
}

[data-money='bank-14'] {
  --fill: var(--money-bank-14);
  --on-fill: var(--money-bank-14-on);
  --box: var(--box-fill);
  --box-text: var(--money-bank-14-hi);
}

[data-money='bank-26'] {
  --fill: var(--money-bank-26);
  --on-fill: var(--money-bank-26-on);
  --box: var(--box-fill);
  --box-text: var(--money-bank-26-hi);
}

[data-money='bank-46'] {
  --fill: var(--money-bank-46);
  --on-fill: var(--money-bank-46-on);
  --box: var(--box-fill);
  --box-text: var(--money-bank-46-hi);
}

[data-money='bank-4'] {
  --fill: var(--money-bank-4);
  --on-fill: var(--money-bank-4-on);
  --box: var(--box-fill);
  --box-text: var(--money-bank-4-hi);
}

[data-money='bank-18'] {
  --fill: var(--money-bank-18);
  --on-fill: var(--money-bank-18-on);
  --box: var(--box-fill);
  --box-text: var(--money-bank-18-hi);
}

[data-money='issuer-isracard'] {
  --fill: var(--money-issuer-isracard);
  --on-fill: var(--money-issuer-isracard-on);
  --box: var(--box-fill);
  --box-text: var(--money-issuer-isracard-hi);
}

[data-money='issuer-cal'] {
  --fill: var(--money-issuer-cal);
  --on-fill: var(--money-issuer-cal-on);
  --box: var(--box-fill);
  --box-text: var(--money-issuer-cal-hi);
}

[data-money='issuer-max'] {
  --fill: var(--money-issuer-max);
  --on-fill: var(--money-issuer-max-on);
  --box: var(--box-fill);
  --box-text: var(--money-issuer-max-hi);
}

[data-money='issuer-amex'] {
  --fill: var(--money-issuer-amex);
  --on-fill: var(--money-issuer-amex-on);
  --box: var(--box-fill);
  --box-text: var(--money-issuer-amex-hi);
}

[data-money='issuer-diners'] {
  --fill: var(--money-issuer-diners);
  --on-fill: var(--money-issuer-diners-on);
  --box: var(--box-fill);
  --box-text: var(--money-issuer-diners-hi);
}

[data-money='cash'] {
  --fill: var(--money-cash);
  --on-fill: var(--money-cash-on);
  --box: var(--box-fill);
  --box-text: var(--money-cash-hi);
}

[data-money='card-black'] {
  --fill: var(--money-card-black);
  --on-fill: var(--money-card-black-on);
  --box: var(--box-fill);
  --box-text: var(--money-card-black-hi);
}

[data-money='card-silver'] {
  --fill: var(--money-card-silver);
  --on-fill: var(--money-card-silver-on);
  --box: var(--box-fill);
  --box-text: var(--money-card-silver-hi);
}

[data-money='card-blue'] {
  --fill: var(--money-card-blue);
  --on-fill: var(--money-card-blue-on);
  --box: var(--box-fill);
  --box-text: var(--money-card-blue-hi);
}

[data-money='card-teal'] {
  --fill: var(--money-card-teal);
  --on-fill: var(--money-card-teal-on);
  --box: var(--box-fill);
  --box-text: var(--money-card-teal-hi);
}

[data-money='card-green'] {
  --fill: var(--money-card-green);
  --on-fill: var(--money-card-green-on);
  --box: var(--box-fill);
  --box-text: var(--money-card-green-hi);
}

[data-money='card-gold'] {
  --fill: var(--money-card-gold);
  --on-fill: var(--money-card-gold-on);
  --box: var(--box-fill);
  --box-text: var(--money-card-gold-hi);
}

[data-money='card-orange'] {
  --fill: var(--money-card-orange);
  --on-fill: var(--money-card-orange-on);
  --box: var(--box-fill);
  --box-text: var(--money-card-orange-hi);
}

[data-money='card-red'] {
  --fill: var(--money-card-red);
  --on-fill: var(--money-card-red-on);
  --box: var(--box-fill);
  --box-text: var(--money-card-red-hi);
}

[data-money='card-rose'] {
  --fill: var(--money-card-rose);
  --on-fill: var(--money-card-rose-on);
  --box: var(--box-fill);
  --box-text: var(--money-card-rose-hi);
}

[data-money='card-purple'] {
  --fill: var(--money-card-purple);
  --on-fill: var(--money-card-purple-on);
  --box: var(--box-fill);
  --box-text: var(--money-card-purple-hi);
}

[data-hue] {
  --hue: var(--hue-neutral);
}

[data-hue='indigo'] {
  --hue: var(--hue-indigo);
}

[data-hue='indigo-2'] {
  --hue: var(--hue-indigo-2);
}

[data-hue='green'] {
  --hue: var(--hue-green);
}

[data-hue='green-2'] {
  --hue: var(--hue-green-2);
}

[data-hue='vermilion'] {
  --hue: var(--hue-vermilion);
}

[data-hue='vermilion-2'] {
  --hue: var(--hue-vermilion-2);
}

[data-hue='amber'] {
  --hue: var(--hue-amber);
}

[data-hue='amber-2'] {
  --hue: var(--hue-amber-2);
}

[data-hue='orange'] {
  --hue: var(--hue-orange);
}

[data-hue='orange-2'] {
  --hue: var(--hue-orange-2);
}

[data-hue='cyan'] {
  --hue: var(--hue-cyan);
}

[data-hue='cyan-2'] {
  --hue: var(--hue-cyan-2);
}

[data-hue='violet'] {
  --hue: var(--hue-violet);
}

[data-hue='violet-2'] {
  --hue: var(--hue-violet-2);
}

[data-hue='rose'] {
  --hue: var(--hue-rose);
}

[data-hue='rose-2'] {
  --hue: var(--hue-rose-2);
}

[data-hue='magenta'] {
  --hue: var(--hue-magenta);
}

[data-hue='magenta-2'] {
  --hue: var(--hue-magenta-2);
}

[data-hue='teal'] {
  --hue: var(--hue-teal);
}

[data-hue='teal-2'] {
  --hue: var(--hue-teal-2);
}

[data-hue='blue'] {
  --hue: var(--hue-blue);
}

[data-hue='blue-2'] {
  --hue: var(--hue-blue-2);
}

[data-hue='lime'] {
  --hue: var(--hue-lime);
}

[data-hue='lime-2'] {
  --hue: var(--hue-lime-2);
}

/* The selection: ink with paper text on the paper; inside a sheet, the sheet turned inside out. */
::selection {
  background-color: var(--ink);
  color: var(--paper);
}

[data-sheet]::selection,
[data-sheet] ::selection {
  background-color: var(--on-fill);
  color: var(--fill);
}
```

Then in `@theme inline`, after the lines Task 1 added, add:

```css
--color-fill: var(--fill);
--color-on-fill: var(--on-fill);
--color-hue: var(--hue);
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project unit src/lib/money-colours.test.ts src/lib/contrast.test.ts`
Expected: PASS. If a hue-within-2° test fails, the token was mistyped: every `-on` and `-hi` above uses its fill's hue exactly.

- [ ] **Step 5: The gate**

Run: `pnpm verify`
Expected: exit 0. Nothing renders differently yet: no component sets `data-sheet`, `data-money` or `data-hue` until Task 5.

- [ ] **Step 6: Commit**

```bash
git add src/index.css src/lib/money-colours.test.ts
git commit -m "Banks, card companies, card colours and cash get full-strength colours with tinted text, categories get twelve hues in two tones, and any element can become a sheet by key" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The base layer: radius, gap and motion tokens, `hover-fine`, the reset rule by rule

good-css's reset is adopted one rule at a time in an existing project (§10), because `min-width: 0` changes how flex rows already render. This task adds the rules and the tokens later tasks name, then measures every route at five widths in both languages. `font-synthesis: none` is not here: it belongs with the fonts (Task 4), where every weight it relies on is loaded.

**Files:**

- Modify: `src/index.css` (the variants at the top; a "Shape and motion" `:root` block after Task 2's mapping; `@theme inline`; the first `@layer base` block)
- Create: `src/lib/base-css.test.ts`, `e2e/support/widths.ts`, `e2e/16-widths.spec.ts`

**Interfaces:**

- Consumes (Task 1): `declarations()` from `src/lib/css-tokens.ts`; `--ring`.
- Produces:
  - Tokens: `--r-sheet`, `--r-sheet-s`, `--r-sheet-cash`, `--r-tile`, `--r-row`, `--r-face`, `--r-preview`, `--r-dialog`, `--r-mark`, `--r-pill`, `--gap-sheet`, `--dur-press`, `--dur-pop`, `--dur-move`, `--dur-panel`.
  - Tailwind: `rounded-sheet`, `rounded-sheet-s`, `rounded-sheet-cash`, `rounded-tile`, `rounded-row`, `rounded-face`, `rounded-preview`, `rounded-dialog`, `rounded-mark`, `rounded-pill`; the spacing key `sheet` (`gap-sheet`, `p-sheet`, `inset-y-sheet`, `end-sheet`…); `ease-out` (now good-css's curve) and `ease-fill`; the `hover-fine:` variant.
  - `e2e/support/widths.ts`: `LAYOUT_WIDTHS = [390, 1440, 1920]`, `EDGE_WIDTHS = [320, 1024]`, `LANGUAGES: readonly { lang: SeedLanguage; locale: string }[]`, `APP_ROUTES` (eight routes), `viewportFor(width: number): { width: number; height: number }`.

- [ ] **Step 1: Write the failing stylesheet test**

Create `src/lib/base-css.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { declarations } from './css-tokens';

/**
 * The base layer: shape and motion tokens, and the good-css reset rules the
 * app has adopted (§9.1, §8.1, §10).
 *
 * The fluid tokens are worked out from two points each (good-css "Fluid
 * sizes"), so they are checked at those points: a clamp whose maths is off
 * by a typo still looks plausible in the file.
 */

const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const ROOT = declarations(CSS, ':root');

function token(name: string): string {
  const value = ROOT.get(name);
  if (value === undefined) throw new Error(`${name} is not declared`);
  return value;
}

/** The px a `clamp(<rem>, <rem> + <vw>, <rem>)` token comes to in a window `width` px wide. */
function clampAt(value: string, width: number): number {
  const match = /^clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)rem\s*\+\s*([\d.]+)vw\s*,\s*([\d.]+)rem\s*\)$/.exec(
    value,
  );
  if (match === null) throw new Error(`Not a fluid token: ${value}`);
  const [min, base, slope, max] = match.slice(1).map(Number) as [number, number, number, number];
  return Math.min(max * 16, Math.max(min * 16, base * 16 + (slope * width) / 100));
}

describe('the radius scale (§9.1)', () => {
  it.each([
    ['--r-sheet', 36, 56],
    ['--r-sheet-s', 34, 36],
    ['--r-sheet-cash', 36, 44],
    ['--r-tile', 28, 32],
  ] as const)('%s is %ipx on a 390 phone and %ipx at 1440', (name, phone, desktop) => {
    expect(clampAt(token(name), 390)).toBeCloseTo(phone, 0);
    expect(clampAt(token(name), 1440)).toBeCloseTo(desktop, 0);
  });

  it.each([
    ['--r-row', '1.625rem'],
    ['--r-face', '1.375rem'],
    ['--r-preview', '3.25rem'],
    ['--r-dialog', '4rem'],
    ['--r-mark', '3px'],
    ['--r-pill', '999px'],
  ] as const)('%s is fixed at %s', (name, value) => {
    expect(token(name)).toBe(value);
  });

  it('puts sheets 8px apart on a phone and 16px apart from a 1024 window up', () => {
    expect(clampAt(token('--gap-sheet'), 390)).toBeCloseTo(8, 0);
    expect(clampAt(token('--gap-sheet'), 1024)).toBeCloseTo(16, 0);
    expect(clampAt(token('--gap-sheet'), 1920)).toBe(16);
  });
});

describe('motion (§8.1)', () => {
  it.each([
    ['--dur-press', 150],
    ['--dur-pop', 200],
    ['--dur-move', 250],
    ['--dur-panel', 300],
  ] as const)('%s is %ims, within good-css’s 300ms', (name, ms) => {
    expect(token(name)).toBe(`${String(ms)}ms`);
    expect(ms).toBeLessThanOrEqual(300);
  });

  it('eases out with good-css’s curve, and fills with the concept’s', () => {
    expect(CSS).toContain('--ease-out: cubic-bezier(0.23, 1, 0.32, 1);');
    expect(CSS).toContain('--ease-fill: cubic-bezier(0.4, 0, 0.2, 1);');
  });

  it('hovers only with a fine pointer (§9.6)', () => {
    expect(CSS).toMatch(/@custom-variant hover-fine \{\s*@media \(hover: hover\) and \(pointer: fine\)/);
  });
});

describe('the reset, rule by rule (§10)', () => {
  it.each([
    'min-width: 0;',
    'overflow-wrap: break-word;',
    'text-wrap: pretty;',
    'text-wrap: balance;',
    '-webkit-tap-highlight-color: transparent;',
    '-webkit-text-size-adjust: 100%;',
    'scrollbar-gutter: stable;',
    'font-size: max(16px, 1rem);',
    'touch-action: manipulation;',
    'user-select: none;',
    'outline: 3px solid var(--ring);',
  ])('declares %s', (declaration) => {
    expect(CSS).toContain(declaration);
  });

  it('never removes a focus outline outright', () => {
    expect(CSS).not.toMatch(/outline:\s*none/);
  });
});
```

Run: `pnpm exec vitest run --project unit src/lib/base-css.test.ts`
Expected: FAIL, "--r-sheet is not declared".

- [ ] **Step 2: Add the `hover-fine` variant**

In `src/index.css`, after the `@custom-variant ltr …;` line, add:

```css
/*
 * Hover for a fine pointer only (§9.6, good-css). Tailwind's own `hover:`
 * checks `(hover: hover)` alone, which some touch screens with a stylus
 * report, and a fill that sticks after a tap reads as a pressed button.
 */
@custom-variant hover-fine {
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      @slot;
    }
  }
}
```

- [ ] **Step 3: Add the shape and motion tokens**

In `src/index.css`, after the `[data-sheet] ::selection` rule that ends Task 2's section, add:

```css
/* ---------------------------------------------------------------------------
   Shape and motion (§9.1, §8.1).

   Each fluid radius runs from its phone size at a 390 window to its desktop
   size at 1440, worked out as good-css's "Fluid sizes" says: the slope is
   (max - min) / (1440 - 390), times 100 for the vw part; the rem part is
   min - slope * 390. src/lib/base-css.test.ts checks every one at both ends.
--------------------------------------------------------------------------- */
:root {
  --r-sheet: clamp(2.25rem, 1.786rem + 1.905vw, 3.5rem); /* 36 -> 56px: board and phone sheets, panels */
  --r-sheet-s: clamp(2.125rem, 2.0786rem + 0.1905vw, 2.25rem); /* 34 -> 36px: card sheets */
  --r-sheet-cash: clamp(2.25rem, 2.0643rem + 0.7619vw, 2.75rem); /* 36 -> 44px: the cash sheet */
  --r-tile: clamp(1.75rem, 1.6571rem + 0.381vw, 2rem); /* 28 -> 32px: choice tiles */
  --r-row: 1.625rem; /* account sheets inside the balance sheet */
  --r-face: 1.375rem; /* CardFace */
  --r-preview: 3.25rem; /* the pop-out's preview sheet */
  --r-dialog: 4rem; /* the pop-out */
  --r-mark: 3px; /* the black box */
  --r-pill: 999px;

  /* Sheets sit one gap apart: 8px at 390, 16px from about 1024. */
  --gap-sheet: clamp(0.5rem, 0.193rem + 1.262vw, 1rem);

  --dur-press: 150ms; /* pill and round-button fills, presses */
  --dur-pop: 200ms; /* menus and popovers */
  --dur-move: 250ms; /* view transitions */
  --dur-panel: 300ms; /* panels and pop-outs */
}
```

In `@theme inline`, after the lines Task 2 added, add:

```css
--radius-sheet: var(--r-sheet);
--radius-sheet-s: var(--r-sheet-s);
--radius-sheet-cash: var(--r-sheet-cash);
--radius-tile: var(--r-tile);
--radius-row: var(--r-row);
--radius-face: var(--r-face);
--radius-preview: var(--r-preview);
--radius-dialog: var(--r-dialog);
--radius-mark: var(--r-mark);
--radius-pill: var(--r-pill);
--spacing-sheet: var(--gap-sheet);
```

and after the three easing lines at the end of the block (`--ease-out-soft`, `--ease-in-soft`, `--ease-expo`), add:

```css
/* §8.1: anything that moves, and colour fills. */
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-fill: cubic-bezier(0.4, 0, 0.2, 1);
```

`--ease-out` replaces Tailwind's own `ease-out` curve wherever it is used (the Add pill, the sheets' transitions), which is the point: one curve for movement.

- [ ] **Step 4: Adopt the reset rules**

Replace the first `@layer base { … }` block in `src/index.css` (the one holding `* { border-color: var(--border); }`, `body` and `.tabular`) with:

```css
@layer base {
  /* good-css's reset, adopted one rule at a time (§10). With min-width: 0 a
     sized icon, avatar or logo in a flex row can shrink to make room for the
     text beside it: it needs `shrink-0`. e2e/16-widths.spec.ts fails on any
     squeezed icon. */
  *,
  *::before,
  *::after {
    border-color: var(--border);
    min-width: 0;
  }

  :root {
    interpolate-size: allow-keywords;
    scrollbar-gutter: stable;
    text-wrap: pretty;
    overflow-wrap: break-word;
    -webkit-text-size-adjust: 100%;
    -webkit-tap-highlight-color: transparent;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    background-color: var(--background);
    color: var(--foreground);
    font-family: var(--font-stack-sans);
    -webkit-font-smoothing: antialiased;
  }

  h1,
  h2,
  h3,
  h4 {
    text-wrap: balance;
  }

  /* iOS zooms into a field whose text is under 16px. A component that sets
     its own size (Input's md:text-sm) wins over this on a desktop. */
  input,
  textarea,
  select {
    font-size: max(16px, 1rem);
  }

  button,
  a,
  [role='button'] {
    touch-action: manipulation;
  }

  /* Controls only: people copy text, so never on body or on links. */
  button,
  [role='button'] {
    user-select: none;
    -webkit-user-select: none;
  }

  /* Focus shows as an outline. A component that draws its own ring says so
     with Tailwind's outline-none, which wins over this layer. */
  :focus-visible {
    outline: 3px solid var(--ring);
    outline-offset: 3px;
  }

  /* Amounts are mathematical runs: always lining, always tabular. */
  .tabular {
    font-variant-numeric: tabular-nums lining-nums;
  }
}
```

Run: `pnpm exec vitest run --project unit src/lib/base-css.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the widths helper and the layout spec**

Create `e2e/support/widths.ts`:

```ts
import type { SeedLanguage } from './seed';

/**
 * The widths the Colour of money redesign is measured at (§13.3): a phone, a
 * laptop and a large desktop, plus the narrowest phone still sold and the
 * window where the desktop layout starts.
 */
export const LAYOUT_WIDTHS = [390, 1440, 1920] as const;
export const EDGE_WIDTHS = [320, 1024] as const;

/** Language and browser locale together, so a Hebrew screen is in shekels (see screens.spec.ts). */
export const LANGUAGES: readonly { readonly lang: SeedLanguage; readonly locale: string }[] = [
  { lang: 'en', locale: 'en-US' },
  { lang: 'he', locale: 'he-IL' },
];

/** Every screen the shell reaches. */
export const APP_ROUTES = [
  '/',
  '/chart',
  '/cards',
  '/cash',
  '/bank-accounts',
  '/categories',
  '/commitments',
  '/settings',
] as const;

/** A phone is held upright; a desktop window is 1000px tall. */
export function viewportFor(width: number): { width: number; height: number } {
  return { width, height: width < 1024 ? 844 : 1000 };
}
```

Create `e2e/16-widths.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { completeFirstRun } from './support/seed';
import { APP_ROUTES, EDGE_WIDTHS, LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * Every route at every width the redesign is measured at, in both languages.
 *
 * Two failures that look fine in a screenshot taken at one size: a page that
 * scrolls sideways (it hides the end of every row), and an icon squeezed by
 * the reset's `min-width: 0` into a thin oval.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and language are set explicitly.');
});

for (const width of [...EDGE_WIDTHS, ...LAYOUT_WIDTHS]) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`@widths ${String(width)} ${lang}`, () => {
      test.use({ viewport: viewportFor(width), locale });

      test('no route scrolls sideways, and no icon is squeezed', async ({ page }) => {
        await completeFirstRun(page, lang);

        for (const route of APP_ROUTES) {
          await page.goto(route);
          await expect(page.getByRole('main')).toBeVisible();
          await page.evaluate(() => document.fonts.ready);

          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          expect(overflow, `${route} scrolls sideways at ${String(width)} in ${lang}`).toBeLessThanOrEqual(1);

          // Lucide icons are square; one that is not has been squeezed by a flex row.
          const squeezed = await page.evaluate(() =>
            [...document.querySelectorAll('svg.lucide')]
              .map((icon) => icon.getBoundingClientRect())
              .filter((box) => box.width > 0 && box.height > 0 && Math.abs(box.width - box.height) > 1)
              .map((box) => `${String(Math.round(box.width))}x${String(Math.round(box.height))}`),
          );
          expect(squeezed, `squeezed icons on ${route}`).toEqual([]);
        }
      });
    });
  }
}
```

- [ ] **Step 6: Run the layout spec, and fix what it finds**

Run: `pnpm exec playwright test e2e/16-widths.spec.ts --project en`
Expected: PASS. If a squeezed icon is reported, the message names its size and route; find it with the browser's inspector at that width, and add `shrink-0` to its class list (the reset's own rule for sized media in a flex row). Re-run until it passes.

- [ ] **Step 7: Look, then the gate**

Run `pnpm exec playwright test e2e/screens.spec.ts`, then open every image in `artifacts/screens/` with the Read tool. Check: nothing is cut off, no line breaks a single word off that did not before, headings balance, and in `pnpm dev` the focus outline shows when you tab. Then run `pnpm verify`.
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/index.css src/lib/base-css.test.ts e2e/support/widths.ts e2e/16-widths.spec.ts
git add -u src
git commit -m "Sheets get their radii, gaps and motion timings as tokens, hover waits for a real pointer, and the good-css reset is adopted with every route measured at five widths" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git add -u src` picks up any component that needed `shrink-0` in Step 6.)

---

### Task 4: Karantina and IBM Plex Sans Hebrew, self-hosted

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml` (through `pnpm add` / `pnpm remove`)
- Modify: `src/main.tsx:9-11`
- Modify: `src/index.css` (the "Typography" section; `@theme inline`'s `--font-display` line; the first `@layer base` block)
- Create: `src/lib/font-preload.ts`, `src/lib/font-preload.test.ts`, `src/lib/fonts.test.ts`
- Modify: `vite.config.ts` (a plugin; `workbox.globIgnores`)
- Modify (the weight sweep and the display face below 28px): `src/app/app-shell.tsx:66`, `src/app/screen-panel.tsx:45,56`, `src/features/account/auth-layout.tsx:44,48`, `src/features/cash/cash-figure.tsx:31`, `src/features/summary/collapsed-bar.tsx:69`, `src/features/summary/summary-cards.tsx:76-88,141-142`
- Modify: `public/legal.css:32-39`, `README.md` (two paragraphs)
- Create: `e2e/17-fonts.spec.ts`; Modify: `e2e/04-rtl-hebrew.spec.ts:87-114`

**Interfaces:**

- Consumes (Task 3): `e2e/support/widths.ts` (`APP_ROUTES`, `LANGUAGES`, `LAYOUT_WIDTHS`, `viewportFor`); the first `@layer base` block.
- Produces:
  - Font families `'IBM Plex Sans Hebrew'` (300, 400, 500, 600) and `'Karantina'` (700), with fallback faces `'Plex Fallback'` and `'Karantina Fallback'`.
  - `--font-stack-sans`, `--font-stack-display`; Tailwind `font-sans`, and `font-display` as an `@utility` that sets `font-family` **and** `font-weight: 700`.
  - `src/lib/font-preload.ts`: `fontPreloadTags(emitted: readonly string[]): PreloadTag[]`; `type PreloadTag = { tag: 'link'; attrs: Record<string, string | boolean>; injectTo: 'head' }`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/font-preload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { fontPreloadTags } from './font-preload';

const EMITTED = [
  'assets/index-AbC123.js',
  'assets/karantina-hebrew-700-normal-B9xY_1.woff2',
  'assets/karantina-latin-700-normal-Qq-2zz.woff2',
  'assets/karantina-latin-ext-700-normal-Zz9.woff2',
  'assets/karantina-latin-700-normal-Qq-2zz.woff',
  'assets/ibm-plex-sans-hebrew-latin-400-normal-x1.woff2',
];

const link = (href: string) => ({
  tag: 'link',
  attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href, crossorigin: true },
  injectTo: 'head',
});

describe('fontPreloadTags', () => {
  it('preloads Karantina 700, latin and hebrew, and nothing else (decision 21)', () => {
    expect(fontPreloadTags(EMITTED)).toEqual([
      link('/assets/karantina-hebrew-700-normal-B9xY_1.woff2'),
      link('/assets/karantina-latin-700-normal-Qq-2zz.woff2'),
    ]);
  });

  it('fails the build when the files are not there, rather than shipping no preload', () => {
    expect(() => fontPreloadTags(['assets/index-AbC123.js'])).toThrow(/Karantina/);
  });
});
```

Create `src/lib/fonts.test.ts`:

```ts
import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The fonts (§2): exactly the faces and weights the design uses, loaded from
 * the app itself, and nothing that asks for a weight that is not loaded.
 *
 * With `font-synthesis: none` a weight that is not loaded renders as the
 * nearest one that is, silently. `font-bold` is the one that would bite
 * (Plex 700 is not loaded), so it is banned outright.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8');
const sources = (pattern: string) =>
  globSync(pattern, { cwd: ROOT })
    .map((file) => file.split('\\').join('/'))
    .filter((file) => !/\.test\.(ts|tsx)$/.test(file));

describe('the fonts that load', () => {
  it('imports exactly Karantina 700 and Plex 300, 400, 500 and 600, per weight', () => {
    const imports = [...read('src/main.tsx').matchAll(/^import '(@fontsource[^']*)';$/gm)].map((m) => m[1]);
    expect(imports).toEqual([
      '@fontsource/karantina/700.css',
      '@fontsource/ibm-plex-sans-hebrew/300.css',
      '@fontsource/ibm-plex-sans-hebrew/400.css',
      '@fontsource/ibm-plex-sans-hebrew/500.css',
      '@fontsource/ibm-plex-sans-hebrew/600.css',
    ]);
  });

  it('pins both packages exactly, and the old three are gone', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@fontsource/karantina']).toBe('5.3.0');
    expect(pkg.dependencies['@fontsource/ibm-plex-sans-hebrew']).toBe('5.3.0');
    expect(Object.keys(pkg.dependencies).filter((name) => name.startsWith('@fontsource-variable/'))).toEqual(
      [],
    );
  });

  it('imports none of Inter, Heebo or Frank Ruhl anywhere', () => {
    for (const file of [...sources('src/**/*.ts'), ...sources('src/**/*.tsx'), ...sources('src/**/*.css')]) {
      expect(read(file), file).not.toContain('@fontsource-variable/');
    }
  });

  it('declares both fallback faces, sized for Plex text and Karantina figures', () => {
    const css = read('src/index.css');
    expect(css).toMatch(/font-family: 'Plex Fallback';[\s\S]*?size-adjust: 103%;/);
    expect(css).toMatch(/font-family: 'Karantina Fallback';[\s\S]*?size-adjust: 60%;/);
    expect(css).toContain('font-synthesis: none;');
  });

  it('puts Plex first in the text stack and Karantina first in the display stack', () => {
    const css = read('src/index.css');
    expect(css).toMatch(/--font-stack-sans:\s*'IBM Plex Sans Hebrew',\s*'Plex Fallback',/);
    expect(css).toMatch(
      /--font-stack-display:\s*'Karantina',\s*'Karantina Fallback',\s*'Plex Fallback',\s*sans-serif;/,
    );
  });

  it('keeps the cyrillic-ext files out of the precache', () => {
    expect(read('vite.config.ts')).toContain("'assets/*-cyrillic-ext-*.woff2'");
  });

  it('gives the legal pages the new stack', () => {
    expect(read('public/legal.css')).toMatch(/'IBM Plex Sans Hebrew'/);
  });
});

describe('the rules the code keeps', () => {
  const code = [...sources('src/**/*.ts'), ...sources('src/**/*.tsx')];

  it('declares font-family only in index.css', () => {
    for (const file of [...code, ...sources('src/**/*.css')].filter((f) => f !== 'src/index.css')) {
      expect(read(file), file).not.toMatch(/font-family|fontFamily/);
    }
  });

  it('asks for no weight that is not loaded: no font-bold, font-extrabold, font-black, font-thin or font-extralight', () => {
    for (const file of code) {
      expect(read(file), file).not.toMatch(/\bfont-(bold|extrabold|black|thin|extralight)\b/);
    }
  });
});
```

Run: `pnpm exec vitest run --project unit src/lib/font-preload.test.ts src/lib/fonts.test.ts`
Expected: FAIL: `./font-preload` does not exist, and the fonts tests fail on the old imports.

- [ ] **Step 2: Swap the packages**

```bash
pnpm add --save-exact @fontsource/karantina@5.3.0 @fontsource/ibm-plex-sans-hebrew@5.3.0
pnpm remove @fontsource-variable/inter @fontsource-variable/heebo @fontsource-variable/frank-ruhl-libre
```

Check `package.json`: `"@fontsource/ibm-plex-sans-hebrew": "5.3.0"` and `"@fontsource/karantina": "5.3.0"` under `dependencies`, with no caret.

In `src/main.tsx`, replace lines 9–11:

```ts
import '@fontsource-variable/inter';
import '@fontsource-variable/heebo';
import '@fontsource-variable/frank-ruhl-libre';
```

with:

```ts
// Per-weight CSS: each carries `unicode-range` per subset, so a page
// downloads only the subsets its text uses (§2.4).
import '@fontsource/karantina/700.css';
import '@fontsource/ibm-plex-sans-hebrew/300.css';
import '@fontsource/ibm-plex-sans-hebrew/400.css';
import '@fontsource/ibm-plex-sans-hebrew/500.css';
import '@fontsource/ibm-plex-sans-hebrew/600.css';
```

- [ ] **Step 3: Rewrite the typography section**

In `src/index.css`, replace everything from the comment block that begins `Typography.` (with "THE ORDER OF THIS STACK IS LOAD-BEARING") down to and including the `:root { --font-stack-sans: … }` block (the old display-face comment and its `--font-stack-display: 'Frank Ruhl Libre Variable', …` block sit between them and go too) with:

```css
/* ---------------------------------------------------------------------------
   Typography (§2).

   IBM Plex Sans Hebrew 300 / 400 / 500 / 600 for text, Karantina 700 for
   display and big numerals. Both self-hosted from Fontsource, precached with
   the app, because the app works offline.

   THE ORDER OF THIS STACK IS LOAD-BEARING. Plex covers Latin, Hebrew and ₪ by
   itself, and its digits are fixed-width by default (600 units in every
   weight), which is what lines up an amount column. Putting a face without
   fixed-width digits before Plex, or adding a :lang(he) font rule, breaks
   amount alignment.

   Karantina's digits are proportional (243-383 units) and it has no tnum, so
   it is never used below 28px or for figures that line up or count (decision
   20). The `font-display` utility sets weight 700 itself: Karantina is never
   seen at any other weight.

   `font-synthesis: none`: every weight used is loaded, and a weight that is
   not (Plex 700) must never be faked. `b`, `strong` and `th` default to bold,
   so the base layer sets them to 600.

   Do not declare font-family anywhere outside this file.
--------------------------------------------------------------------------- */
:root {
  --font-stack-sans:
    'IBM Plex Sans Hebrew', 'Plex Fallback', system-ui, -apple-system, 'Segoe UI', 'Noto Sans Hebrew', Arial,
    sans-serif;
  --font-stack-display: 'Karantina', 'Karantina Fallback', 'Plex Fallback', sans-serif;
  font-synthesis: none;
}

/* Fallback faces with the real faces' metrics, measured against Windows Arial
   with fontTools on 2026-10-09 (§2.4). font-size-adjust is not used: it
   normalises by x-height, which Hebrew letters do not follow (decision 22). */
@font-face {
  font-family: 'Plex Fallback';
  src: local('Arial'), local('ArialMT'), local('Roboto');
  size-adjust: 103%; /* Latin text 1.019, Hebrew text 1.044 */
  ascent-override: 99.5%; /* 1.025 / 1.03 */
  descent-override: 26.7%; /* 0.275 / 1.03 */
  line-gap-override: 0%;
}

/* Sized for figure width, so a balance in the fallback takes the same room. */
@font-face {
  font-family: 'Karantina Fallback';
  src: local('Arial Bold'), local('Arial-BoldMT'), local('Roboto Bold');
  size-adjust: 60%; /* digits 0.584, Hebrew 0.672: sized for figures */
  ascent-override: 143%; /* 0.859 / 0.60 */
  descent-override: 25.5%; /* 0.153 / 0.60 */
  line-gap-override: 0%;
}

@utility font-display {
  font-family: var(--font-stack-display);
  font-weight: 700;
}
```

In `@theme inline`, delete the line `--font-display: var(--font-stack-display);`. The `font-display` utility keeps its name through the `@utility` above; two definitions under one name would leave the weight to Tailwind's ordering. Keep `--font-sans: var(--font-stack-sans);`.

In the first `@layer base` block (Task 3), after the `body { … }` rule, add:

```css
/* Bold would ask for Plex 700, which is not loaded (decision 19). */
b,
strong,
th {
  font-weight: 600;
}
```

- [ ] **Step 4: The preload plugin and the precache**

Create `src/lib/font-preload.ts`:

```ts
/**
 * The two font files worth preloading (§2.4, decision 21): Karantina 700,
 * latin and hebrew. It draws the largest thing on the first screen, and a
 * Hebrew screen needs both files (its digits are in latin, its letters in
 * hebrew). Plex is not preloaded: its fallback face is metric-matched, so its
 * swap moves nothing.
 *
 * Two preloads, within the preload guide's limit. After the service worker
 * installs, every font comes from its cache.
 */

const KARANTINA = /^assets\/karantina-(latin|hebrew)-700-normal-[\w-]+\.woff2$/;

export type PreloadTag = {
  readonly tag: 'link';
  readonly attrs: Readonly<Record<string, string | boolean>>;
  readonly injectTo: 'head';
};

/** `<link rel="preload">` tags for the emitted Karantina files, or a build error if they are not there. */
export function fontPreloadTags(emitted: readonly string[]): PreloadTag[] {
  const files = emitted.filter((name) => KARANTINA.test(name)).sort();
  if (files.length !== 2) {
    throw new Error(
      `font-preload: expected Karantina 700's latin and hebrew woff2 in the build, found ${files.join(', ') || 'none'}`,
    );
  }
  return files.map((file) => ({
    tag: 'link',
    attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: true },
    injectTo: 'head',
  }));
}
```

In `vite.config.ts`, add beside the security-headers import:

```ts
import { fontPreloadTags } from './src/lib/font-preload';
```

add after the `securityHeaders` function:

```ts
/** Adds the Karantina preloads to the built index.html (src/lib/font-preload.ts). */
function preloadDisplayFont(): Plugin {
  return {
    name: 'bookandry:preload-display-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (_html, context) => fontPreloadTags(Object.keys(context.bundle ?? {})),
    },
  };
}
```

add `preloadDisplayFont(),` to `plugins` directly after `tailwindcss(),`, and change `globIgnores` and its comment to:

```ts
        // Images for the account's emails (scripts/emails.mjs): read by mail
        // clients from the site, never by the app, so not worth a download.
        // Cyrillic-ext font files: neither face covers basic Cyrillic anyway,
        // and a page that needs the extended block fetches it online (§2.4).
        globIgnores: ['email/**', 'assets/import-*', 'assets/*-cyrillic-ext-*.woff2'],
```

`tsconfig.node.json` includes `vite.config.ts` and follows its imports, as it already does for `src/lib/security-headers.ts`, so `src/lib/font-preload.ts` is type-checked there with nothing to add.

- [ ] **Step 5: The weight sweep, and the display face below 28px**

Each of these either drops `font-bold` (the display face carries 700 itself now) or moves text under 28px off the display face onto Plex:

- `src/app/app-shell.tsx:66`: `className="font-display text-lg font-bold tracking-tight"` → `className="text-lg font-semibold tracking-tight"`.
- `src/app/screen-panel.tsx:45`: `className="font-display text-base font-bold tracking-tight"` → `className="text-base font-semibold tracking-tight"`.
- `src/app/screen-panel.tsx:56`: `className="mt-3 font-display text-[2rem] leading-tight font-bold"` → `className="mt-3 font-display text-[2rem] leading-tight"`.
- `src/features/account/auth-layout.tsx:44`: delete ` font-bold` from the headline's class list.
- `src/features/account/auth-layout.tsx:48`: `font-display text-[1.375rem]` → `font-light text-[1.375rem]` (22px on a phone: Plex 300, the subtitle weight).
- `src/features/cash/cash-figure.tsx:31`: delete ` font-bold`.
- `src/features/summary/collapsed-bar.tsx:69`: `className="truncate font-display text-lg font-bold"` → `className="truncate text-lg font-semibold"`.
- `src/features/summary/summary-cards.tsx:141`: `className="block font-display text-base"` → `className="block text-base font-medium"`.
- `src/features/summary/summary-cards.tsx:142`: `className="font-bold"` → `className="font-semibold"`.

Then the balance, which counts up in a face with proportional digits (§2.3). In `src/features/summary/summary-cards.tsx`, replace lines 76–88 (the comment beginning "The animating figure is hidden from assistive tech" through the closing `</span>` of `balance-amount`) with:

```tsx
{
  /*
        The animating figure is hidden from assistive tech and ONE live region
        carries the settled value. Announcing every frame turns a balance into
        ~39 interruptions; announcing nothing leaves a number that changed
        silently.

        Karantina's digits are proportional, so the box is reserved from the
        settled figure: an invisible copy shares the grid cell, and the line
        never jitters while the count runs (§2.3).
      */
}
<span
  className="mt-1 grid justify-items-start font-display text-[2.75rem] leading-none tracking-tight max-[359px]:text-[2.25rem]"
  data-testid="balance-amount"
>
  <span aria-hidden="true" dir="ltr" className="invisible col-start-1 row-start-1">
    {settled.text}
  </span>
  <span className="col-start-1 row-start-1">
    <Money minor={animated} currency={currency} announce={false} />
  </span>
</span>;
```

`settled` is the `formatMoney(...)` result declared a few lines above it.

- [ ] **Step 6: The legal pages and the README**

In `public/legal.css`, replace the `font:` declaration in `body` with:

```css
font:
  16px/1.6 'IBM Plex Sans Hebrew',
  system-ui,
  -apple-system,
  'Segoe UI',
  'Noto Sans Hebrew',
  Arial,
  sans-serif;
```

In `README.md`, replace the paragraph that begins `**The panel's figures are in the serif, and still tabular.**` with:

```md
**Two faces: Plex for text and amounts, Karantina for display.** IBM Plex Sans
Hebrew (300, 400, 500, 600) covers Latin, Hebrew and ₪, and its digits are
fixed-width, so amount columns line up in both languages. Karantina 700 draws
screen names and the big numerals; its digits are proportional, so it is never
used below 28px, in a column, or for a figure that counts without a box reserved
from its final value. Both are self-hosted from Fontsource and precached; only
Karantina is preloaded.
```

and replace the paragraph that begins `**The font stack order is load-bearing.**` with:

```md
**The font stack order is load-bearing.** `'IBM Plex Sans Hebrew', 'Plex Fallback', …`
— a face without fixed-width digits ahead of Plex, or a `:lang(he)` font rule,
breaks amount alignment. `font-synthesis: none` means a weight that is not
loaded is never faked, which is why `font-bold` (Plex 700) is banned by
`src/lib/fonts.test.ts`.
```

Run: `pnpm exec vitest run --project unit src/lib/font-preload.test.ts src/lib/fonts.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the browser checks**

Create `e2e/17-fonts.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { completeFirstRun } from './support/seed';
import { APP_ROUTES, LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * The faces as rendered (§2, §13.3): Karantina never below 28px, no Plex text
 * asking for the unloaded 700, both faces actually loaded, and the two
 * Karantina preloads in the page.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and language are set explicitly.');
});

for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`@fonts ${String(width)} ${lang}`, () => {
      test.use({ viewport: viewportFor(width), locale });

      test('Karantina is 28px or more, and no Plex text is bold', async ({ page }) => {
        await completeFirstRun(page, lang);

        for (const route of APP_ROUTES) {
          await page.goto(route);
          await expect(page.getByRole('main')).toBeVisible();
          await page.evaluate(() => document.fonts.ready);

          const problems = await page.evaluate(() => {
            const bad: string[] = [];
            for (const el of document.querySelectorAll<HTMLElement>('body *')) {
              const hasText = [...el.childNodes].some(
                (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
              );
              const box = el.getBoundingClientRect();
              if (!hasText || box.width === 0 || box.height === 0) continue;
              const style = getComputedStyle(el);
              const family = style.fontFamily.replace(/["']/g, '');
              const size = parseFloat(style.fontSize);
              const label = `${el.tagName} "${(el.textContent ?? '').trim().slice(0, 20)}"`;
              if (family.startsWith('Karantina') && size < 28)
                bad.push(`${label}: Karantina at ${String(size)}px`);
              if (family.startsWith('IBM Plex Sans Hebrew') && style.fontWeight === '700')
                bad.push(`${label}: Plex at 700`);
            }
            return bad;
          });

          expect(problems, `${route} at ${String(width)} in ${lang}`).toEqual([]);
        }
      });
    });
  }
}

test.describe('@fonts loading', () => {
  test('loads Plex and Karantina from the app, Plex first in the stack, with two preloads', async ({
    page,
  }) => {
    await completeFirstRun(page, 'he');
    await page.goto('/');
    await expect(page.getByTestId('balance-amount')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const result = await page.evaluate(() => ({
      stack: getComputedStyle(document.body).fontFamily.replace(/["']/g, ''),
      plexHebrew: document.fonts.check('400 16px "IBM Plex Sans Hebrew"', 'תנועות'),
      karantinaDigits: document.fonts.check('700 44px Karantina', '0123456789'),
      preloads: [...document.querySelectorAll('link[rel="preload"][as="font"]')].map(
        (link) => link.getAttribute('href') ?? '',
      ),
    }));

    expect(result.stack.startsWith('IBM Plex Sans Hebrew')).toBe(true);
    expect(result.plexHebrew).toBe(true);
    expect(result.karantinaDigits).toBe(true);
    expect(result.preloads).toHaveLength(2);
    for (const href of result.preloads)
      expect(href).toMatch(/karantina-(latin|hebrew)-700-normal-[\w-]+\.woff2$/);
  });
});
```

In `e2e/04-rtl-hebrew.spec.ts`, replace the `test.describe('@rtl fonts', …)` block (lines 87–114) with:

```ts
test.describe('@rtl fonts', () => {
  test('renders Hebrew and digits in Plex, ahead of every fallback', async ({ page }) => {
    await completeFirstRun(page, 'he');
    await page.evaluate(() => document.fonts.ready);

    const result = await page.evaluate(() => ({
      stack: getComputedStyle(document.body).fontFamily.replace(/["']/g, ''),
      // `document.fonts.check` answers "can this family render this text with a
      // LOADED face": a family declared but never downloaded falls through silently.
      hebrew: document.fonts.check('400 16px "IBM Plex Sans Hebrew"', 'שלום'),
      digits: document.fonts.check('400 16px "IBM Plex Sans Hebrew"', '0123456789'),
    }));

    /*
     * ORDER IS LOAD-BEARING. Plex's digits are fixed-width; a face ahead of it
     * without them breaks every amount column, and nothing else in the suite
     * would notice.
     */
    expect(result.stack.indexOf('IBM Plex Sans Hebrew')).toBe(0);
    expect(result.stack.indexOf('IBM Plex Sans Hebrew')).toBeLessThan(result.stack.indexOf('Plex Fallback'));
    expect(result.hebrew).toBe(true);
    expect(result.digits).toBe(true);
  });
});
```

- [ ] **Step 8: Run the browser checks**

Run: `pnpm exec playwright test e2e/17-fonts.spec.ts e2e/04-rtl-hebrew.spec.ts e2e/08-polish.spec.ts`
Expected: PASS. `08-polish`'s balance size check (44px, 36px below 360) still holds: the classes are unchanged.

- [ ] **Step 9: The gate**

Run: `pnpm verify`
Expected: exit 0. Then `grep -c 'rel="preload" as="font"' dist/index.html`
Expected: `2`.

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-lock.yaml src/main.tsx src/index.css src/lib/font-preload.ts src/lib/font-preload.test.ts src/lib/fonts.test.ts vite.config.ts public/legal.css README.md e2e/17-fonts.spec.ts e2e/04-rtl-hebrew.spec.ts src/app/app-shell.tsx src/app/screen-panel.tsx src/features/account/auth-layout.tsx src/features/cash/cash-figure.tsx src/features/summary/collapsed-bar.tsx src/features/summary/summary-cards.tsx
git commit -m "Text is set in IBM Plex Sans Hebrew and big figures in Karantina, both self-hosted and precached, and no text asks for a weight that is not loaded" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Money keys, and card colours as solid sheets

**Files:**

- Create: `src/domain/money-key.ts`, `src/domain/money-key.test.ts`
- Modify: `src/features/cards/card-colors.ts`, `src/features/cards/card-colors.test.ts` (both replaced)
- Modify: `src/features/cards/card-color-field.tsx` (replaced)
- Modify: `src/features/cards/cards-screen.tsx:56,333-410` (the face)
- Modify: `src/features/cards/cards-screen-menu.test.tsx` (a new `describe`)
- Modify: `src/features/bank-accounts/bank-accounts-screen.tsx:1,15,22,137-144,174,181-195` and `bank-accounts-screen.test.tsx:106-155`
- Modify: `src/data/brands.ts:45-79`, `src/data/brands.test.ts:7,68-80`
- Modify: `e2e/14-cards.spec.ts` (a forced-colours test)

**Interfaces:**

- Consumes (Task 2): the `data-sheet="money"` / `data-money` contract and the `--money-card-*` tokens. Existing: `bankByCode` from `src/domain/banks.ts`.
- Produces (`src/domain/money-key.ts`):
  - `CARD_COLOR_KEYS: readonly ['black', 'silver', 'blue', 'teal', 'green', 'gold', 'orange', 'red', 'rose', 'purple']`; `type CardColor = (typeof CARD_COLOR_KEYS)[number]`.
  - ``type MoneyKey = `bank-${string}` | `issuer-${CardIssuer}` | `card-${CardColor}` | 'cash' | 'neutral'``.
  - `bankKey(code: string | undefined): MoneyKey`; `issuerKey(issuer: CardIssuer | undefined): MoneyKey`; `isCardColor(value: string | undefined): value is CardColor`; `cardKey(method: Pick<PaymentMethod, 'color' | 'card'>): MoneyKey`; `methodKey(method: Pick<PaymentMethod, 'type' | 'color' | 'card' | 'account'>): MoneyKey`.
  - `src/features/cards/card-colors.ts`: `CARD_COLORS: readonly { readonly key: CardColor }[]`, and re-exports `type CardColor`.
  - Removed: `cardGradient`, `issuerTint`, `cardColorValue` (card-colors.ts) and `brandColor` (brands.ts).

This task does not use the `hover-fine:` variant (Task 3 declares it, and the two run in parallel).

- [ ] **Step 1: Write the failing key tests**

Create `src/domain/money-key.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { banks } from '@/data/card-catalog/banks';
import type { PaymentMethod } from '@/types/domain';

import { bankKey, CARD_COLOR_KEYS, cardKey, issuerKey, isCardColor, methodKey } from './money-key';

const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

const method = (
  patch: Partial<PaymentMethod>,
): Pick<PaymentMethod, 'type' | 'color' | 'card' | 'account'> => ({
  type: 'credit_card',
  ...patch,
});

describe('bankKey', () => {
  it('normalises the code as BankMark does: "012" is Hapoalim', () => {
    expect(bankKey('012')).toBe('bank-12');
    expect(bankKey('10')).toBe('bank-10');
  });

  it('is neutral for a bank with no colour of its own, an unknown code, or none', () => {
    expect(bankKey('54')).toBe('neutral'); // Bank of Jerusalem: a real bank, with no colour in §1.3
    expect(bankKey('999')).toBe('neutral');
    expect(bankKey(undefined)).toBe('neutral');
    expect(bankKey('')).toBe('neutral');
  });

  it('has a colour for every bank in the card catalog', () => {
    for (const bank of banks) expect(bankKey(bank.id), bank.id).not.toBe('neutral');
  });
});

describe('issuerKey', () => {
  it('keys a card company by its issuer id', () => {
    expect(issuerKey('cal')).toBe('issuer-cal');
    expect(issuerKey('isracard')).toBe('issuer-isracard');
  });

  it('is neutral for "other" and for no issuer', () => {
    expect(issuerKey('other')).toBe('neutral');
    expect(issuerKey(undefined)).toBe('neutral');
  });
});

describe('cardKey', () => {
  it('is the card’s own colour when it has one', () => {
    expect(cardKey({ color: 'gold', card: { issuer: 'max' } })).toBe('card-gold');
  });

  it('is its issuer’s when it has none, or one this build does not know', () => {
    expect(cardKey({ card: { issuer: 'max' } })).toBe('issuer-max');
    expect(cardKey({ color: '#ff0000', card: { issuer: 'cal' } })).toBe('issuer-cal');
    expect(cardKey({ color: 'mauve', card: { issuer: 'amex' } })).toBe('issuer-amex');
  });

  it('is neutral with neither', () => {
    expect(cardKey({})).toBe('neutral');
    expect(cardKey({ card: { issuer: 'other' } })).toBe('neutral');
  });
});

describe('methodKey', () => {
  it('covers cash, cards and bank accounts', () => {
    expect(methodKey(method({ type: 'cash' }))).toBe('cash');
    expect(methodKey(method({ card: { issuer: 'diners' } }))).toBe('issuer-diners');
    expect(methodKey(method({ type: 'debit_card', card: { issuer: 'cal' } }))).toBe('issuer-cal');
    expect(methodKey(method({ type: 'bank_account', account: { bank: '20', holding: 'personal' } }))).toBe(
      'bank-20',
    );
  });

  it('takes the colour the person gave it over the bank’s', () => {
    expect(
      methodKey(method({ type: 'bank_account', color: 'red', account: { bank: '10', holding: 'personal' } })),
    ).toBe('card-red');
  });

  it('is neutral for any other kind of method without a colour, and its own colour with one', () => {
    expect(methodKey(method({ type: 'standing_order' }))).toBe('neutral');
    expect(methodKey(method({ type: 'other', color: 'teal' }))).toBe('card-teal');
  });
});

describe('the keys and the token file agree', () => {
  it('knows the ten card colours, and recognises only them', () => {
    expect(CARD_COLOR_KEYS).toHaveLength(10);
    expect(isCardColor('teal')).toBe(true);
    expect(isCardColor('#ff0000')).toBe(false);
    expect(isCardColor(undefined)).toBe(false);
  });

  it('has a sheet in index.css for every key it can return', () => {
    const keys = [
      ...['10', '12', '11', '20', '17', '31', '52', '14', '26', '46', '4', '18'].map((code) => bankKey(code)),
      ...(['isracard', 'cal', 'max', 'amex', 'diners'] as const).map((issuer) => issuerKey(issuer)),
      ...CARD_COLOR_KEYS.map((color) => cardKey({ color })),
      'cash',
    ];
    for (const key of keys) expect(CSS, key).toContain(`[data-money='${key}']`);
  });
});
```

Run: `pnpm exec vitest run --project unit src/domain/money-key.test.ts`
Expected: FAIL, "Failed to resolve import './money-key'".

- [ ] **Step 2: Write the keys**

Create `src/domain/money-key.ts`:

```ts
import type { CardIssuer, PaymentMethod } from '@/types/domain';

import { bankByCode } from './banks';

/**
 * Data to colour keys (§1.5).
 *
 * A component never writes a colour and never builds a key by hand: it calls
 * one of these and sets the result as `data-money`. src/index.css maps every
 * key to a fill, a tinted text colour and a lifted colour, and anything it
 * does not know to the neutral ink sheet - so an old or hand-edited value (a
 * hex in `color`, an issuer of "other") is drawn, never invisible.
 */

/**
 * The colours a person can give a card, as stored in `PaymentMethod.color`.
 * The keys predate this redesign and must not change: data stores the key.
 */
export const CARD_COLOR_KEYS = [
  'black',
  'silver',
  'blue',
  'teal',
  'green',
  'gold',
  'orange',
  'red',
  'rose',
  'purple',
] as const;

export type CardColor = (typeof CARD_COLOR_KEYS)[number];

export type MoneyKey = `bank-${string}` | `issuer-${CardIssuer}` | `card-${CardColor}` | 'cash' | 'neutral';

/** The banks with a colour of their own (§1.3), by Masav code. */
const BANKS_WITH_COLOUR: ReadonlySet<string> = new Set([
  '10',
  '12',
  '11',
  '20',
  '17',
  '31',
  '52',
  '14',
  '26',
  '46',
  '4',
  '18',
]);

/** The card companies with a colour of their own. "other" has none. */
const ISSUERS_WITH_COLOUR: ReadonlySet<CardIssuer> = new Set(['isracard', 'cal', 'max', 'amex', 'diners']);

/** A bank by its Masav code, normalised as `BankMark` normalises it ("012" is 12). */
export function bankKey(code: string | undefined): MoneyKey {
  const bank = bankByCode(code ?? '');
  return bank !== undefined && BANKS_WITH_COLOUR.has(bank.code) ? `bank-${bank.code}` : 'neutral';
}

/** A card company by its issuer id. */
export function issuerKey(issuer: CardIssuer | undefined): MoneyKey {
  return issuer !== undefined && ISSUERS_WITH_COLOUR.has(issuer) ? `issuer-${issuer}` : 'neutral';
}

/** Whether a stored colour is one this build knows. */
export function isCardColor(value: string | undefined): value is CardColor {
  return CARD_COLOR_KEYS.some((key) => key === value);
}

/** A card: its own colour, else its company's. */
export function cardKey(method: Pick<PaymentMethod, 'color' | 'card'>): MoneyKey {
  return isCardColor(method.color) ? `card-${method.color}` : issuerKey(method.card?.issuer);
}

/** Any payment method: cash, a card, a bank account, or anything else by its own colour. */
export function methodKey(method: Pick<PaymentMethod, 'type' | 'color' | 'card' | 'account'>): MoneyKey {
  if (method.type === 'cash') return 'cash';
  if (isCardColor(method.color)) return `card-${method.color}`;
  if (method.type === 'credit_card' || method.type === 'debit_card') return issuerKey(method.card?.issuer);
  if (method.type === 'bank_account') return bankKey(method.account?.bank);
  return 'neutral';
}
```

Run: `pnpm exec vitest run --project unit src/domain/money-key.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing card and account tests**

Replace `src/features/cards/card-colors.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CARD_COLORS } from './card-colors';

describe('the colours a card can be given', () => {
  it('keeps the stored keys, in the order the picker shows them', () => {
    // Data stores these keys: renaming one would lose every card that has it.
    expect(CARD_COLORS.map((color) => color.key)).toEqual([
      'black',
      'silver',
      'blue',
      'teal',
      'green',
      'gold',
      'orange',
      'red',
      'rose',
      'purple',
    ]);
  });

  it('is a solid money sheet each, not a gradient', () => {
    const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');
    for (const { key } of CARD_COLORS) expect(css).toContain(`--money-card-${key}:`);
  });
});
```

Add to the end of `src/features/cards/cards-screen-menu.test.tsx` (Review Focus: data from an older build):

```ts
describe('a card’s face', () => {
  const face = async () => {
    render();
    await options();
    return screen.getByTestId('card-face');
  };

  it('is a money sheet in its company’s colour when it was given none', async () => {
    const el = await face();
    expect(el).toHaveAttribute('data-sheet', 'money');
    expect(el).toHaveAttribute('data-money', 'issuer-max');
  });

  it('is in its own colour when it has one', async () => {
    await db.paymentMethods.update('card-1', { color: 'gold' });
    expect(await face()).toHaveAttribute('data-money', 'card-gold');
  });

  it('falls back to its company for a colour an older build stored as hex', async () => {
    await db.paymentMethods.update('card-1', { color: '#ff0000' });
    expect(await face()).toHaveAttribute('data-money', 'issuer-max');
  });

  it('is the neutral ink sheet for a card of an "other" company with no colour', async () => {
    await db.paymentMethods.update('card-1', {
      card: { issuer: 'other', billingDay: 10, lastDigits: '4821' },
    });
    expect(await face()).toHaveAttribute('data-money', 'neutral');
  });

  it('writes no colour of its own: no white text, no translucent text that would drop under 4.5:1', async () => {
    const el = await face();
    expect(el.querySelector('[class*="text-white"]')).toBeNull();
    expect(el.querySelector('[class*="opacity-"]')).toBeNull();
  });
});
```

In `src/features/bank-accounts/bank-accounts-screen.test.tsx`:

- line 112: `expect(panel.querySelector('[data-slot="account-accent"]')).toHaveStyle({ backgroundColor: '#0066FF' });` → `expect(panel.querySelector('[data-slot="account-accent"]')).toHaveAttribute('data-money', 'bank-10');`
- line 115: rename the test to `'shows a bank with no logo by a neutral mark, on the neutral edge'`, and replace lines 132–134 with:

```ts
const accent = panel.querySelector('[data-slot="account-accent"]');
expect(accent).toHaveAttribute('data-money', 'neutral');
expect(accent).not.toHaveAttribute('style');
```

- line 154: `…toHaveStyle({ backgroundColor: '#b8323f' });` → `…toHaveAttribute('data-money', 'card-red');`

In `src/data/brands.test.ts`, change line 7 to `import { brandLogo, type BrandKey } from './brands';` and delete the `describe('brand colour', …)` block (lines 68–80); its "every catalog bank has a colour" check now lives in `money-key.test.ts`.

Run: `pnpm exec vitest run --project dom src/features/cards/cards-screen-menu.test.tsx src/features/bank-accounts/bank-accounts-screen.test.tsx`
Expected: FAIL: the face has no `data-sheet`, the edge has no `data-money`.

- [ ] **Step 4: Card colours become keys**

Replace `src/features/cards/card-colors.ts` with:

```ts
import { CARD_COLOR_KEYS, type CardColor } from '@/domain/money-key';

/**
 * The colours a card can be given, in the order the picker shows them.
 *
 * Stored by key in `PaymentMethod.color`, never as a colour value. Each key
 * is a solid money sheet (`--money-card-<key>` in index.css) with text in a
 * tint of its own hue. The gradients these keys used to name retired with the
 * Colour of money redesign; the keys did not change, so no stored card changes.
 */
export const CARD_COLORS: readonly { readonly key: CardColor }[] = CARD_COLOR_KEYS.map((key) => ({ key }));

export type { CardColor };
```

Replace `src/features/cards/card-color-field.tsx` with:

```tsx
import { Check } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { issuerKey, type MoneyKey } from '@/domain/money-key';
import type { CardIssuer } from '@/types/domain';

import { CARD_COLORS, type CardColor } from './card-colors';

/**
 * The card's colour, picked from swatches shaped like the card: its company's
 * colour to begin with, or one of the set. Native radios underneath, so the
 * arrow keys move through them and a screen reader hears "3 of 11".
 *
 * Each swatch is a money sheet, so its check mark is drawn in the sheet's own
 * tint. `forced-color-adjust: none` keeps the colour in Windows High Contrast,
 * because here the colour is what is being chosen (§1.8).
 */
export function CardColorField({
  value,
  issuer,
  onChange,
}: {
  /** '' for the card company's colour. */
  readonly value: CardColor | '';
  /** Whose colour "the company's colour" is. */
  readonly issuer: CardIssuer | undefined;
  readonly onChange: (color: CardColor | '') => void;
}) {
  const { t } = useTranslation('cards');
  const name = useId();
  const options: readonly { readonly key: CardColor | ''; readonly money: MoneyKey }[] = [
    { key: '', money: issuerKey(issuer) },
    ...CARD_COLORS.map(({ key }) => ({ key, money: `card-${key}` as const })),
  ];
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{t('color.label')}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const label = t(option.key === '' ? 'color.issuer' : `color.${option.key}`);
          const checked = value === option.key;
          return (
            <label key={option.key || 'issuer'} className="cursor-pointer" title={label}>
              <input
                type="radio"
                name={name}
                value={option.key}
                checked={checked}
                onChange={() => {
                  onChange(option.key);
                }}
                aria-label={label}
                className="peer sr-only"
              />
              <span
                data-sheet="money"
                data-money={option.money}
                className="flex h-11 w-16 items-center justify-center rounded-md ring-offset-2 ring-offset-background forced-color-adjust-none peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-3 peer-focus-visible:ring-(--focus-ring)"
              >
                {checked ? <Check className="size-4" aria-hidden="true" /> : null}
                {option.key === '' && !checked ? (
                  <span className="text-[10px] leading-none font-medium">{t('color.auto')}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
```

The swatch grows from 36 to 44px tall: the label is its tap target, and 44px is the floor. The check ring is `ink` and the focus ring `--focus-ring`, not `--foreground` and `--ring`: on the swatch those two are the swatch's own tint.

- [ ] **Step 5: The card face**

In `src/features/cards/cards-screen.tsx`:

- line 56: delete `import { cardGradient } from './card-colors';`, and add `import { cardKey } from '@/domain/money-key';` with the other `@/domain` imports.
- replace the face's opening tag (lines 333–339, `<div data-testid="card-face" … cardGradient(card), )}>`) with:

```tsx
      <div
        data-testid="card-face"
        data-color={card.color ?? ''}
        // A money sheet: the card's own colour, else its company's, else the
        // neutral ink sheet. Its text is the sheet's tint, never white (§1.3).
        data-sheet="money"
        data-money={cardKey(card)}
        className="relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-2xl p-5"
      >
```

- line 357: `<span className="text-sm font-medium opacity-90">` → `<span className="text-sm font-medium">`.
- line 372, the ⋯ button's class: `… rounded-full text-white hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none` → `… rounded-full text-current active:bg-accent focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none`.
- line 382: delete ` opacity-90` from `mb-1 font-mono text-base tracking-widest tabular-nums opacity-90 rtl:text-end`.
- line 390: `<p className="text-sm opacity-85">` → `<p className="text-sm font-light">`.
- line 397: `<span className="opacity-90">` → `<span className="font-light">`.
- line 407: `<span className="text-xs opacity-85">` → `<span className="text-xs font-light">`.

Quiet text on a sheet is weight 300, never a paler colour (§1.6): `opacity-85` on Cal's tint would measure under 4.5:1.

- [ ] **Step 6: The bank account edge; `brandColor` retires**

In `src/features/bank-accounts/bank-accounts-screen.tsx`:

- delete line 1 `import { cn } from 'cn';` (its one use is the edge below), line 15 `import { brandColor } from '@/data/brands';` and line 22 `import { cardColorValue } from '@/features/cards/card-colors';`; add `import { methodKey } from '@/domain/money-key';` with the `@/domain` imports.
- delete `accountAccent` and its doc comment (lines 137–144), and line 174 `const accent = accountAccent(account);`.
- replace the comment and the edge `<span>` (lines 181–195) with:

```tsx
{
  /*
        The bank's colour as an edge, the way its own cards and statements carry
        it: the person's colour for it, else its bank's, else neutral (§1.5).
        Phase 3 makes the whole account a sheet (§5.4).
      */
}
<span
  aria-hidden="true"
  data-slot="account-accent"
  data-money={methodKey(account)}
  className="absolute inset-y-0 start-0 w-1.5 bg-fill"
/>;
```

In `src/data/brands.ts`, delete the `COLORS` constant, its comment and `brandColor` (lines 45–79). Its one caller is gone.

Run: `pnpm exec vitest run --project dom src/features/cards src/features/bank-accounts && pnpm exec vitest run --project db src/features/cards/card-colors.test.ts && pnpm exec vitest run --project unit src/data/brands.test.ts src/domain/money-key.test.ts`
Expected: PASS.

- [ ] **Step 7: Forced colours, in a browser (Review Focus)**

Add to the end of `e2e/14-cards.spec.ts`:

```ts
test.describe('@forced-colours the Cards screen', () => {
  test('keeps an edge on every card face and the colour in every swatch', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'en', 'One language is enough for a system colour scheme.');
    await page.emulateMedia({ forcedColors: 'active' });
    await completeFirstRun(page, 'en');
    await page.goto('/cards');

    // Windows High Contrast replaces backgrounds: the transparent 2px border is what it paints instead.
    const faces = page.getByTestId('card-face');
    await expect(faces.first()).toBeVisible();
    for (const face of await faces.all()) {
      const edge = await face.evaluate((el) => {
        const style = getComputedStyle(el);
        return `${style.borderTopWidth} ${style.borderTopStyle}`;
      });
      expect(edge).toBe('2px solid');
    }

    // The swatches keep their colour: here the colour is what is being chosen.
    await page.getByRole('button', { name: COPY.en.add }).click();
    const swatch = page.getByTitle(COPY.en.gold, { exact: true }).locator('[data-money]');
    expect(await swatch.evaluate((el) => getComputedStyle(el).forcedColorAdjust)).toBe('none');
  });
});
```

Run: `pnpm exec playwright test e2e/14-cards.spec.ts`
Expected: PASS, including the existing `data-color` assertion (the attribute is kept).

- [ ] **Step 8: Look, then the gate**

`pnpm dev`, open `/cards` and `/bank-accounts` with the demo household, in light and dark. Expected: Max is magenta with pale-pink text, Cal is teal with dark teal text, Isracard deep indigo; each bank account's edge is its bank's colour. Then `pnpm verify`.
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/domain/money-key.ts src/domain/money-key.test.ts src/features/cards src/features/bank-accounts src/data/brands.ts src/data/brands.test.ts e2e/14-cards.spec.ts
git commit -m "Cards and bank accounts take their colour from a key: a card is a solid sheet in its own or its company's colour with tinted text, and anything unknown is the ink sheet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Category hues in the data

**Files:**

- Create: `src/domain/category-hue.ts`, `src/domain/category-hue.test.ts`
- Modify: `src/types/domain.ts:66-79` (`Category`)
- Modify: `src/domain/transfer-schema.ts:106-121` and `src/domain/transfer-schema.test.ts`
- Modify: `src/db/repos/categories.ts:34-60` (`createCategory`) and `src/db/repos/categories.test.ts`

**Interfaces:**

- Consumes (existing): `Category` from `src/types/domain.ts`; `CASH_FOUND_CATEGORY_ID`, `CASH_MISSING_CATEGORY_ID` from `src/domain/cash.ts`; `BUILTIN_EXPENSE`, `BUILTIN_INCOME` from `src/db/seed.ts` (tests only).
- Produces (`src/domain/category-hue.ts`):
  - `HUES: readonly ['indigo', 'green', 'vermilion', 'amber', 'orange', 'cyan', 'violet', 'rose', 'magenta', 'teal', 'blue', 'lime']`; `type Hue = (typeof HUES)[number]`; ``type HueToken = Hue | `${Hue}-2` | 'neutral'``.
  - `BUILTIN_HUES: Readonly<Record<string, HueToken>>` (every built-in id).
  - `parseHue(value: string | undefined): HueToken | undefined`; `hashHue(id: string): Hue`; `categoryHue(category: Pick<Category, 'id' | 'hue'>): HueToken`; `leastUsedHue(siblings: readonly Pick<Category, 'id' | 'hue' | 'isArchived'>[]): Hue`.
  - `Category.hue?: string`: a hue key with an optional `-2` tone, never a colour. Task 14's `HueBars` and phase 3's screens set `data-hue={categoryHue(category)}`.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/category-hue.test.ts`:

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { BUILTIN_EXPENSE, BUILTIN_INCOME } from '@/db/seed';

import { BUILTIN_HUES, categoryHue, hashHue, HUES, leastUsedHue, parseHue } from './category-hue';

describe('the built-in categories (§1.4)', () => {
  it('each has a hue', () => {
    for (const { id } of [...BUILTIN_EXPENSE, ...BUILTIN_INCOME]) expect(BUILTIN_HUES[id], id).toBeDefined();
  });

  it('no two expense built-ins share a hue and tone, and "Other" is neutral', () => {
    const marks = BUILTIN_EXPENSE.map(({ id }) => BUILTIN_HUES[id]).filter((hue) => hue !== 'neutral');
    expect(new Set(marks).size).toBe(marks.length);
    expect(BUILTIN_HUES['cat.otherExpense']).toBe('neutral');
  });

  it('no two income built-ins share a hue and tone either', () => {
    const marks = BUILTIN_INCOME.map(({ id }) => BUILTIN_HUES[id]).filter((hue) => hue !== 'neutral');
    expect(new Set(marks).size).toBe(marks.length);
    expect(BUILTIN_HUES['cat.otherIncome']).toBe('neutral');
  });

  it('keeps the concept’s twelve on tone A', () => {
    expect(BUILTIN_HUES['cat.rent']).toBe('indigo');
    expect(BUILTIN_HUES['cat.groceries']).toBe('green');
    expect(BUILTIN_HUES['cat.dining']).toBe('vermilion');
    expect(BUILTIN_HUES['cat.arnona']).toBe('lime-2');
  });
});

describe('parseHue', () => {
  it('reads a hue key with or without its tone', () => {
    expect(parseHue('teal')).toBe('teal');
    expect(parseHue('teal-2')).toBe('teal-2');
    expect(parseHue('neutral')).toBe('neutral');
  });

  it('refuses a key from a newer build or a colour value, rather than guessing', () => {
    expect(parseHue('teal-3')).toBeUndefined();
    expect(parseHue('ochre')).toBeUndefined();
    expect(parseHue('#ff0000')).toBeUndefined();
    expect(parseHue(undefined)).toBeUndefined();
  });
});

describe('categoryHue: stored, then the built-in map, then a hash', () => {
  it('takes a stored hue first, so a built-in can be re-coloured', () => {
    expect(categoryHue({ id: 'cat.rent', hue: 'lime' })).toBe('lime');
  });

  it('falls back to the built-in map for a hue it does not know', () => {
    expect(categoryHue({ id: 'cat.rent', hue: 'teal-3' })).toBe('indigo');
    expect(categoryHue({ id: 'cat.rent' })).toBe('indigo');
  });

  it('hashes a custom category with no hue onto the twelve tone-A hues', () => {
    expect(categoryHue({ id: 'c-1234' })).toBe('teal');
  });
});

describe('hashHue', () => {
  it('is stable for an id, and always one of the twelve', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 40 }), (id) => {
        expect(hashHue(id)).toBe(hashHue(id));
        expect(HUES).toContain(hashHue(id));
      }),
    );
  });

  it('is pinned: a change would recolour every custom category without a stored hue', () => {
    expect(hashHue('')).toBe('green');
    expect(hashHue('c-1234')).toBe('teal');
    expect(hashHue('c1')).toBe('cyan');
  });
});

describe('leastUsedHue', () => {
  it('picks the hue used least among active siblings, counting both tones', () => {
    const expense = BUILTIN_EXPENSE.map(({ id }) => ({ id, isArchived: 0 as const }));
    // Every hue has two expense built-ins except lime, whose tone A is free.
    expect(leastUsedHue(expense)).toBe('lime');
  });

  it('ignores archived siblings, and breaks ties in wheel order', () => {
    expect(leastUsedHue([])).toBe('indigo');
    expect(
      leastUsedHue([
        { id: 'a', hue: 'indigo', isArchived: 0 },
        { id: 'b', hue: 'green', isArchived: 1 },
      ]),
    ).toBe('green');
  });
});
```

Add to the end of `src/domain/transfer-schema.test.ts`:

```ts
describe('a category’s hue', () => {
  const category = {
    id: 'c1',
    kind: 'expense',
    icon: 'Dog',
    sortOrder: 30,
    isArchived: 0,
    source: 'custom',
    name: 'Pets',
    createdAt: AT,
    updatedAt: AT,
  };

  it('is accepted as a loose optional string, so a newer build’s key survives an import', () => {
    expect(rowSchemas.categories.safeParse({ ...category, hue: 'teal-2' }).success).toBe(true);
    expect(rowSchemas.categories.safeParse({ ...category, hue: 'some-future-hue' }).success).toBe(true);
  });

  it('is optional: a file from before it is still fine', () => {
    expect(rowSchemas.categories.safeParse(category).success).toBe(true);
  });

  it('is never empty', () => {
    expect(rowSchemas.categories.safeParse({ ...category, hue: '' }).success).toBe(false);
  });
});
```

Add to the end of `src/db/repos/categories.test.ts`:

```ts
describe('a category’s hue (§1.4, the rollout with older builds)', () => {
  it('starts a new custom category on the hue least used among its kind', async () => {
    const created = await createCategory(
      handle.db,
      'c1',
      { name: 'Garden', kind: 'expense', icon: 'Flower' },
      NOW,
    );
    expect(created.hue).toBe('lime');
    expect((await handle.db.categories.get('c1'))?.hue).toBe('lime');
  });

  it('keeps hue through a rename and an archive, even a key this build does not know', async () => {
    await createCategory(handle.db, 'c2', { name: 'Garden', kind: 'expense', icon: 'Flower' }, NOW);
    await handle.db.categories.update('c2', { hue: 'teal-3' });

    await renameCategory(handle.db, 'c2', 'Gardening', NOW);
    await setCategoryArchived(handle.db, 'c2', true, NOW);
    await setCategoryArchived(handle.db, 'c2', false, NOW);

    expect((await handle.db.categories.get('c2'))?.hue).toBe('teal-3');
  });

  it('keeps a re-coloured built-in’s hue when the built-ins are checked again', async () => {
    await handle.db.categories.update('cat.rent', { hue: 'lime' });
    await ensureBuiltinCategories(handle.db, NOW);
    expect((await handle.db.categories.get('cat.rent'))?.hue).toBe('lime');
  });
});
```

Run: `pnpm exec vitest run --project unit src/domain/category-hue.test.ts src/domain/transfer-schema.test.ts`
Expected: FAIL, "Failed to resolve import './category-hue'".

- [ ] **Step 2: The hue map**

Create `src/domain/category-hue.ts`:

```ts
import type { Category } from '@/types/domain';

import { CASH_FOUND_CATEGORY_ID, CASH_MISSING_CATEGORY_ID } from './cash';

/**
 * Category hues (§1.4): twelve bold hues around the wheel, each in two tones
 * (`teal`, `teal-2`), so the 24 built-in expense categories get 24 distinct
 * marks. Hues are marks only - bars, pills, strips - and never carry text.
 *
 * Data stores only the key. The colour a category shows is resolved in this
 * order: its stored `hue`, if this build knows the key; then BUILTIN_HUES by
 * id; then a stable hash of the id onto the twelve tone-A hues. An unknown
 * key from a newer build therefore never breaks anything, and nothing is
 * rewritten to "fix" it.
 */

export const HUES = [
  'indigo',
  'green',
  'vermilion',
  'amber',
  'orange',
  'cyan',
  'violet',
  'rose',
  'magenta',
  'teal',
  'blue',
  'lime',
] as const;

export type Hue = (typeof HUES)[number];

/** A hue's tone A (`teal`), its tone B (`teal-2`), or neutral ("Other"). */
export type HueToken = Hue | `${Hue}-2` | 'neutral';

/**
 * Every built-in's hue. Never written to rows: re-colouring a built-in writes
 * `hue` on its row, which wins over this map. Income and expense are never
 * drawn in the same bar list, so they share hues.
 */
export const BUILTIN_HUES: Readonly<Record<string, HueToken>> = {
  'cat.rent': 'indigo',
  'cat.buildingFee': 'indigo-2',
  'cat.groceries': 'green',
  'cat.fitness': 'green-2',
  'cat.investment': 'green',
  'cat.dining': 'vermilion',
  'cat.cardFees': 'vermilion-2',
  'cat.kids': 'amber',
  'cat.pets': 'amber-2',
  [CASH_FOUND_CATEGORY_ID]: 'amber',
  'cat.transport': 'orange',
  'cat.currencyExchange': 'orange-2',
  'cat.utilities': 'cyan',
  'cat.phoneInternet': 'cyan-2',
  'cat.salary': 'cyan',
  'cat.shopping': 'violet',
  'cat.aiSoftware': 'violet-2',
  'cat.freelance': 'violet',
  'cat.health': 'rose',
  'cat.insurance': 'rose-2',
  'cat.subscriptions': 'magenta',
  [CASH_MISSING_CATEGORY_ID]: 'magenta-2',
  'cat.entertainment': 'teal',
  'cat.travel': 'teal-2',
  'cat.education': 'blue',
  'cat.loans': 'blue-2',
  'cat.refund': 'blue',
  'cat.arnona': 'lime-2',
  'cat.gift': 'lime',
  // "Other" never looks like a category of its own.
  'cat.otherExpense': 'neutral',
  'cat.otherIncome': 'neutral',
};

const KNOWN: ReadonlySet<string> = new Set<string>([...HUES, ...HUES.map((hue) => `${hue}-2`), 'neutral']);

/** A stored hue key this build knows, or undefined. */
export function parseHue(value: string | undefined): HueToken | undefined {
  return value !== undefined && KNOWN.has(value) ? (value as HueToken) : undefined;
}

/** FNV-1a over the id's UTF-16 code units, onto the twelve tone-A hues. Stable across builds. */
export function hashHue(id: string): Hue {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return HUES[hash % HUES.length] ?? 'indigo';
}

/** The hue a category shows. */
export function categoryHue(category: Pick<Category, 'id' | 'hue'>): HueToken {
  return parseHue(category.hue) ?? BUILTIN_HUES[category.id] ?? hashHue(category.id);
}

/** The hue used least among the active categories of one kind, both tones counted; ties go in wheel order. */
export function leastUsedHue(siblings: readonly Pick<Category, 'id' | 'hue' | 'isArchived'>[]): Hue {
  const uses = new Map<Hue, number>(HUES.map((hue) => [hue, 0]));
  for (const sibling of siblings) {
    if (sibling.isArchived === 1) continue;
    const token = categoryHue(sibling);
    if (token === 'neutral') continue;
    const base = token.replace(/-2$/, '') as Hue;
    uses.set(base, (uses.get(base) ?? 0) + 1);
  }
  let best: Hue = HUES[0];
  for (const hue of HUES) if ((uses.get(hue) ?? 0) < (uses.get(best) ?? 0)) best = hue;
  return best;
}
```

- [ ] **Step 3: The field, its schema and the repo**

In `src/types/domain.ts`, in `Category`'s first object, after `readonly icon: string;`, add:

```ts
  /**
   * The hue it shows (§1.4): a hue key with an optional tone, "teal" or
   * "teal-2". Never a colour. Optional: a built-in without one takes
   * BUILTIN_HUES, a custom one without one a hash of its id
   * (src/domain/category-hue.ts). An older build keeps it untouched.
   */
  readonly hue?: string;
```

In `src/domain/transfer-schema.ts`, in `categorySchema`'s first `z.object`, after `icon: z.string().min(1),`, add:

```ts
    // Loose on purpose: a newer build's hue key must survive an import here.
    hue: z.string().min(1).max(40).optional(),
```

In `src/db/repos/categories.ts`, add `import { leastUsedHue } from '@/domain/category-hue';` with the other imports, and in `createCategory` make the row:

```ts
const row: Category = {
  id,
  kind: draft.kind,
  icon: draft.icon,
  // The hue least used among its kind, so a new category stands apart.
  hue: leastUsedHue(siblings),
  sortOrder,
  isArchived: 0,
  source: 'custom',
  name,
  createdAt: now,
  updatedAt: now,
};
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project unit src/domain/category-hue.test.ts src/domain/transfer-schema.test.ts && pnpm exec vitest run --project db src/db/repos/categories.test.ts`
Expected: PASS. `renameCategory` spreads the current row and `setCategoryArchived` uses `update`, so both already keep `hue`; the test pins that for the rollout.

- [ ] **Step 5: The gate, and commit**

Run: `pnpm verify`
Expected: exit 0 (`src/domain/**` coverage stays at 90%: the tests above reach every branch of `category-hue.ts`).

```bash
git add src/domain/category-hue.ts src/domain/category-hue.test.ts src/types/domain.ts src/domain/transfer-schema.ts src/domain/transfer-schema.test.ts src/db/repos/categories.ts src/db/repos/categories.test.ts
git commit -m "Every category has a hue: built-ins from a fixed map with no two alike, new ones on the least used, and a hue from a newer build survives untouched" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The status bar, the manifest and the boot script

**Files:**

- Modify: `index.html:11-13` and the boot script's last lines (74–83)
- Modify: `vite.config.ts` (`manifest.background_color`, `manifest.theme_color`)
- Modify: `src/i18n/boot.ts:122-129` and `src/i18n/boot.test.ts`
- Modify: `src/lib/brand-colours.test.ts` (whole file replaced)

**Interfaces:**

- Consumes (existing): `oklchToSrgb`, `parseOklch` from `src/lib/color.ts`. Task 1 extends these functions; this task works with either version.
- Produces:
  - `src/i18n/boot.ts`: `THEME_PAPER = { light: '#F6F2EA', dark: '#1A1510' } as const`; `setThemeColor(color: string): void`; `applyTheme()` now also sets the `theme-color` meta to the theme's paper.
  - `index.html`: one `<meta name="theme-color" content="#F6F2EA" />` and `<meta name="color-scheme" content="light dark" />`.

- [ ] **Step 1: Write the failing tests**

Replace `src/lib/brand-colours.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { oklchToSrgb, parseOklch } from './color';

/**
 * The colours that live OUTSIDE index.css: the phone's status bar, the
 * installed app's splash, the favicon and the icon backgrounds. A token
 * change cannot reach these, so they are pinned here (§3).
 */
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/** An oklch() token as the #RRGGBB the browser chrome is given. */
const hex = (value: string) => {
  const color = parseOklch(value);
  if (color === undefined) throw new Error(`not oklch: ${value}`);
  const channels = oklchToSrgb(color).map((channel) =>
    Math.round(channel * 255) // money-allow: a colour channel, not money
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${channels.join('')}`.toUpperCase();
};

describe('the status bar and the splash follow the paper (§3)', () => {
  it('index.html has one theme-color meta, the light paper, and supports both schemes', () => {
    const html = read('index.html');
    expect(html.match(/name="theme-color"/g)).toHaveLength(1);
    expect(html).toContain('<meta name="theme-color" content="#F6F2EA" />');
    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
    expect(html).not.toContain('media="(prefers-color-scheme');
  });

  it('the boot script sets it to the resolved theme’s paper before first paint', () => {
    const html = read('index.html');
    expect(html).toContain("'#1A1510'");
    expect(html).toContain("'#F6F2EA'");
    expect(html).toContain("removeAttribute('media')");
  });

  it('the boot values are the paper tokens, as hex', () => {
    expect(hex('oklch(0.962 0.012 85)')).toBe('#F6F2EA');
    expect(hex('oklch(0.2 0.012 70)')).toBe('#1A1510');
  });

  it('the manifest’s theme and background are the light paper', () => {
    const config = read('vite.config.ts');
    expect(config).toContain("theme_color: '#F6F2EA'");
    expect(config).toContain("background_color: '#F6F2EA'");
  });
});

describe('the icons do not change (decision 37)', () => {
  it('keeps the sapphire disc in the favicon and the PWA icon backgrounds', () => {
    expect(read('public/favicon.svg')).toContain('#0F3A8A');
    expect(read('pwa-assets.config.ts').match(/#0F3A8A/g)).toHaveLength(2);
  });

  it('keeps the privacy and terms pages’ link colours', () => {
    const css = read('public/legal.css');
    expect(css).toContain('--primary: oklch(0.462 0.175 262.6)');
    expect(css).toContain('--primary: oklch(0.779 0.113 259.7)');
  });
});
```

Add inside `describe('applyLanguage and applyTheme', …)` in `src/i18n/boot.test.ts`:

```ts
it('sets the status bar to the theme’s paper, and follows a change at once (Review Focus)', () => {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.setAttribute('media', '(prefers-color-scheme: light)');
  meta.content = '#000000';
  document.head.append(meta);

  applyTheme('dark');
  expect(meta.content).toBe('#1A1510');
  expect(meta.hasAttribute('media')).toBe(false);

  applyTheme('light');
  expect(meta.content).toBe('#F6F2EA');
  meta.remove();
});

it('never throws when the page has no theme-color meta', () => {
  expect(() => {
    applyTheme('dark');
  }).not.toThrow();
});
```

Run: `pnpm exec vitest run --project unit src/lib/brand-colours.test.ts src/i18n/boot.test.ts`
Expected: FAIL: two metas, the old manifest colours, and `applyTheme` does not touch the meta.

- [ ] **Step 2: `index.html`**

Replace lines 11–13:

```html
<!-- The status bar runs straight into the sapphire panel at the top of every screen. -->
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#0F3A8A" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0B2C6B" />
```

with:

```html
<!-- Paints the canvas in the right scheme before the CSS loads. -->
<meta name="color-scheme" content="light dark" />
<!-- The status bar is the paper (§3). The boot script below sets it to the
         resolved theme's paper before first paint; useThemeColor() then follows
         the top of the current screen. -->
<meta name="theme-color" content="#F6F2EA" />
```

In the boot script, replace the four lines from `d.lang = lang;` to `d.style.colorScheme = dark ? 'dark' : 'light';` with:

```js
d.lang = lang;
d.dir = lang === 'he' ? 'rtl' : 'ltr';
d.classList.toggle('dark', dark);
d.style.colorScheme = dark ? 'dark' : 'light';
/* The status bar is the paper: #F6F2EA, or #1A1510 in dark (boot.ts THEME_PAPER). */
var bar = document.querySelector('meta[name="theme-color"]');
if (bar) {
  bar.removeAttribute('media');
  bar.setAttribute('content', dark ? '#1A1510' : '#F6F2EA');
}
```

The CSP hash of this inline script is computed at build time by `securityHeaders()` in `vite.config.ts`, so nothing else changes.

- [ ] **Step 3: The manifest**

In `vite.config.ts`, change:

```ts
        background_color: '#ffffff',
        theme_color: '#0F3A8A',
```

to:

```ts
        // The paper (§3): the splash and the title bar of the installed app.
        background_color: '#F6F2EA',
        theme_color: '#F6F2EA',
```

- [ ] **Step 4: `applyTheme` follows the theme**

In `src/i18n/boot.ts`, replace `applyTheme` and its comment with:

```ts
/** The paper, as the status bar shows it (§3). Mirrors the inline boot script. */
export const THEME_PAPER = { light: '#F6F2EA', dark: '#1A1510' } as const;

/** Sets the one theme-color meta, dropping any media query an older index.html put on it. */
export function setThemeColor(color: string): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta === null) return;
  meta.removeAttribute('media');
  meta.setAttribute('content', color);
}

/** Applies the theme to <html>, and the status bar to its paper. Mirrors the inline boot script. */
export function applyTheme(theme: Theme): void {
  const el = document.documentElement;
  const dark = resolveDark(theme);
  el.classList.toggle('dark', dark);
  el.style.colorScheme = dark ? 'dark' : 'light';
  setThemeColor(dark ? THEME_PAPER.dark : THEME_PAPER.light);
}
```

- [ ] **Step 5: Run the tests, the gate, and commit**

Run: `pnpm exec vitest run --project unit src/lib/brand-colours.test.ts src/i18n/boot.test.ts`
Expected: PASS.

Run: `pnpm verify`
Expected: exit 0. `e2e/11-csp.spec.ts` keeps passing because the hash is recomputed from the built `index.html`.

```bash
git add index.html vite.config.ts src/i18n/boot.ts src/i18n/boot.test.ts src/lib/brand-colours.test.ts
git commit -m "The status bar and the installed app's splash are the paper, in the theme the person chose, and follow a theme change without a reload" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Phase 1 gate: the screenshot matrix at three widths, the README, `verify:full`

**Files:**

- Modify: `e2e/screens.spec.ts` (the matrix)
- Modify: `README.md` (`## Design decisions`, `### What the suite cannot check`)

**Interfaces:**

- Consumes: Tasks 1–7; `e2e/support/widths.ts` (Task 3).
- Produces: `artifacts/screens/<route>-<lang>-<theme>-<width>.png` (96 images: 8 routes × 3 widths × 2 languages × 2 themes). Task 16 adds overlays to the same spec.

- [ ] **Step 1: The matrix at three widths**

In `e2e/screens.spec.ts`:

- add `import { APP_ROUTES, LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';` and delete the local `LANGUAGES` constant (keep its comment about the browser locale, above the new loop);
- replace the `ROUTES` constant with:

```ts
/** File-name stems for e2e/support/widths.ts's routes. */
const NAMES: Record<(typeof APP_ROUTES)[number], string> = {
  '/': 'feed',
  '/chart': 'chart',
  '/cards': 'cards',
  '/cash': 'cash',
  '/bank-accounts': 'bank-accounts',
  '/categories': 'categories',
  '/commitments': 'commitments',
  '/settings': 'settings',
};
```

- change the doc comment's first line to `The screenshot matrix: 8 routes x 3 widths x 2 languages x 2 themes (§13.3).`
- replace the `for (const { lang, locale } of LANGUAGES) { … }` loop with:

```ts
for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`${lang} screens at ${String(width)}`, () => {
      test.use({ locale, viewport: viewportFor(width) });

      for (const theme of THEMES) {
        for (const route of APP_ROUTES) {
          const name = `${NAMES[route]}-${lang}-${theme}-${String(width)}`;
          test(`@screens ${name}`, async ({ page }) => {
            const errors: string[] = [];
            page.on('console', (m) => {
              if (m.type() === 'error') errors.push(m.text());
            });
            page.on('pageerror', (e) => errors.push(e.message));

            await page.emulateMedia({ colorScheme: theme });
            await completeFirstRun(page, lang, { theme });

            await page.goto(route);
            await expect(page.getByRole('main')).toBeVisible();
            // Fonts first: a screenshot taken mid-swap shows the fallback metrics.
            await page.evaluate(() => document.fonts.ready);
            // The chart animates its line in; the rest settles faster than this.
            await page.waitForTimeout(400);

            await page.screenshot({ path: `artifacts/screens/${name}.png`, fullPage: true });

            expect(errors).toEqual([]);
            const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
            expect(overflow).toBeLessThanOrEqual(1);
          });
        }
      }
    });
  }
}
```

Run: `pnpm exec playwright test e2e/screens.spec.ts`
Expected: 96 passing tests and 96 images in `artifacts/screens/`.

- [ ] **Step 2: Look at every image**

Open each image with the Read tool, against `money-sheets-bold-v2.html`, and check:

- the page is warm paper (#F6F2EA; #1A1510 in dark), text is ink, quiet text is clearly quieter;
- every word is in Plex; screen titles, the balance and the cash total are in Karantina, and nothing in Karantina is small;
- card faces are solid colour with tinted text (Max magenta, Cal teal with dark text, Isracard indigo), never a gradient, never white text;
- bank accounts carry their bank's colour on their edge;
- the sapphire panel, rail and Add pill are as before (they leave in Phase 2);
- in Hebrew, ₪ is on the correct end of every amount and nothing is clipped;
- no icon is squeezed, nothing scrolls sideways.

Fix what fails in the task that owns it, then retake.

- [ ] **Step 3: The README**

In `README.md`, replace the paragraph that begins `**The brand is sapphire; green means money coming in.**` with:

```md
**Ink on paper; money in colour.** The house is ink on warm paper (`--paper`,
#F6F2EA, #1A1510 in dark). Colour always means money: a bank, a card company,
a card or a category, each as a full-strength sheet keyed by data — a Masav
code, an issuer, a card colour key, a hue key — never by a stored colour
(`src/domain/money-key.ts`, `src/domain/category-hue.ts`). A sheet's text is a
tint of its own hue. Sapphire is the app's own colour, for its actions only.
Every pair is checked by `src/lib/contrast.test.ts` and
`src/lib/money-colours.test.ts`, which resolve the token file's aliases and
`color-mix()` the way a browser does; the colours outside it (the status bar,
the manifest, the icons) by `src/lib/brand-colours.test.ts`.
```

In `### What the suite cannot check`, after the sentence beginning "Both were performed by hand", add:

```md
The Colour of money screenshot matrix (`e2e/screens.spec.ts`: 8 routes at 390,
1440 and 1920, in both languages and themes) was reviewed by eye for phase 1 on
**YYYY-MM-DD**.
```

writing the date of Step 2's review in place of `YYYY-MM-DD`, in the same bold form the paragraph above uses.

- [ ] **Step 4: The full gate**

Run: `pnpm verify:full`
Expected: exit 0: verify, the hostile-timezone run, knip, every Playwright spec in all three projects, and Lighthouse at its existing thresholds. The font preloads must not lower the performance score (§13.3); if it drops, compare the `lhci` reports and look at the font requests first.

- [ ] **Step 5: Commit**

```bash
git add e2e/screens.spec.ts README.md
git commit -m "The screenshot matrix covers every screen at phone, laptop and wide desktop sizes, and the README explains ink on paper with money in colour" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Phase 1 can ship from here. Merging and releasing are the controller's job after the review.

---

## Phase 2: shell, editors, shared components

What changes on screen: every screen is still a single column, but it sits in the new shell, and editors are panels from `lg` (§11). The add-card flow (branch `add-card-flow`) can start once this phase has landed: it uses `PopOut`, `CardFace` and `MoneyTile`.

### Task 9: Phase 2 vocabulary: strings, stylesheet rules, the grain, `Button` pills, `Mark`, `TitlePair`, the app mark

Everything the parallel Phase 2 tasks share lands here first, so that Tasks 10, 11, 12, 14 and 15 touch disjoint files: every new string, every new stylesheet rule (keyed on `data-slot` and `data-numeral`, so it waits harmlessly for its component), the paper grain, and the four small components the others compose.

**Files:**

- Modify: `src/i18n/locales/en/common.json`, `src/i18n/locales/he/common.json`
- Modify: `src/index.css` (`@theme inline`; a new "Phase 2" section at the end of the file)
- Create: `scripts/make-grain.mjs`, `src/assets/grain.png` (generated by the script, committed)
- Modify: `src/components/ui/button.tsx`; Create: `src/components/ui/button.test.tsx`
- Create: `src/components/ui/mark.tsx`, `src/components/ui/title-pair.tsx`, `src/components/app-mark.tsx`, and a `*.test.tsx` beside each
- Create: `src/lib/stylesheet.test.ts`

**Interfaces:**

- Consumes (Phase 1): `--press`, `--on-press`, `--primary`, `--primary-foreground`, `--ink`, `--paper`, `--box`, `--box-text`, `--focus-ring`, `--dur-press`, `ease-fill`, `rounded-mark`, the `hover-fine:` variant, `font-display` (700), `declarations()`.
- Produces:
  - Strings: `nav.bankAccounts`, `nav.categories`, `nav.commitments`, `popout.stepOf` (`{{current}}`, `{{total}}`), `popout.steps`, `sheets.other`, `sheets.selected`, `sheets.cardName` (`{{issuer}}`, `{{last4}}`).
  - Tailwind: container variants `@board/main:`, `@wide/main:`, `@vast/main:`, `@pane2/popout:`, `@pane3/popout:`; type utilities `text-screen-name`, `text-title-screen`, `text-sub-screen`, `text-title-hero`, `text-sub-hero`, `text-title-sheet`, `text-sub-sheet`, `text-title-question`, `text-sub-question`, `text-title-steps`, `text-sub-steps`.
  - CSS contracts: `--tab-bar-h`; `[data-numeral]` sizing and bleed (`--numeral-max`, `--glyphs`, `--b`); the pop-out grid keyed on `data-slot="popout-layout" | "popout-steps" | "popout-body" | "popout-preview" | "popout-close"` inside `@container popout`; `view-transition-name` on `[data-slot='tab-bar']` (`nav`), `#main` (`main`) and `[data-testid='collapsed-summary']` (`collapsed-bar`), slid by `html[data-nav-dir='forward' | 'back']`; the grain on `body` and every `[data-sheet]`.
  - `Button` variants `pill`, `pill-solid`, `round`, `text` (`buttonVariants({ variant })` too).
  - `Mark(props: React.ComponentProps<'span'>)`.
  - `TitlePair({ as?: 'h1' | 'h2' | 'h3'; title: string; subtitle?: string; size?: 'screen' | 'hero' | 'sheet' | 'question' | 'steps'; className?: string } & Omit<React.HTMLAttributes<HTMLHeadingElement>, 'title'>)`.
  - `AppMark({ withName?: boolean; className?: string })`.

- [ ] **Step 1: The strings**

In `src/i18n/locales/en/common.json`, inside `"nav"`, after `"cash": "Cash"`, add:

```json
    "bankAccounts": "Bank accounts",
    "categories": "Categories",
    "commitments": "Commitments"
```

and after the closing `}` of `"nav"`, add two top-level objects:

```json
  "popout": {
    "stepOf": "Step {{current}} of {{total}}",
    "steps": "Steps"
  },
  "sheets": {
    "other": "Other",
    "selected": "Selected ✓",
    "cardName": "{{issuer}} ending {{last4}}"
  },
```

In `src/i18n/locales/he/common.json`, the same places:

```json
    "bankAccounts": "חשבונות בנק",
    "categories": "קטגוריות",
    "commitments": "התחייבויות"
```

```json
  "popout": {
    "stepOf": "שלב {{current}} מתוך {{total}}",
    "steps": "שלבים"
  },
  "sheets": {
    "other": "אחר",
    "selected": "נבחר ✓",
    "cardName": "{{issuer}} המסתיים ב־{{last4}}"
  },
```

(Fix the commas around each insertion so both files stay valid JSON.)

Run: `pnpm exec vitest run --project unit src/i18n/locales.test.ts`
Expected: PASS (parity, interpolations).

- [ ] **Step 2: The grain**

Create `scripts/make-grain.mjs`:

```js
/**
 * Writes src/assets/grain.png: the paper grain (§9.1).
 *
 * Run once with `node scripts/make-grain.mjs`; the PNG is committed and
 * precached like any other image. A 180px greyscale tile of seeded noise:
 * the same file comes out every time, and noise has no edges to match, so it
 * tiles without a seam. Sixteen grey levels keep it small; at 7.5% strength
 * nobody can count them.
 *
 * A file rather than an inline SVG filter, so every browser and the
 * screenshot tests draw the same grain.
 */
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const SIZE = 180;

/** mulberry32: a small seeded generator, 0 <= n < 1. */
let state = 0x20261009;
function next() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// One filter byte (0, none) at the start of each row, then a byte per pixel.
const raw = Buffer.alloc((SIZE + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE + 1)] = 0;
  for (let x = 0; x < SIZE; x += 1) raw[y * (SIZE + 1) + 1 + x] = Math.floor(next() * 16) * 17;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 0; // greyscale
header[10] = 0; // deflate
header[11] = 0; // adaptive filtering
header[12] = 0; // no interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(new URL('../src/assets/grain.png', import.meta.url), png);
console.log(`src/assets/grain.png: ${String(png.length)} bytes`);
```

Run: `node scripts/make-grain.mjs`
Expected: `src/assets/grain.png: <about 17000> bytes`. Open the file with the Read tool: an even grey speckle with no pattern.

- [ ] **Step 3: Write the failing stylesheet contract**

Create `src/lib/stylesheet.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { declarations } from './css-tokens';

/**
 * The Phase 2 stylesheet contract: the rules that Phase 2's components and
 * Phase 3's screens are keyed to (§4.3, §6.2, §8.2, §9.1, §9.4, §9.5).
 *
 * Each rule waits on an attribute (data-slot, data-numeral, data-nav-dir), so
 * it is written once and its component lands separately. This pins the values
 * the spec fixed, so a later edit changes them on purpose.
 */

const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const ROOT = declarations(CSS, ':root');
/** The stylesheet with every run of whitespace as one space: prettier may wrap a long value. */
const FLAT = CSS.replace(/\s+/g, ' ');

const theme = (name: string): string => {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(CSS);
  if (match?.[1] === undefined) throw new Error(`${name} is not in the stylesheet`);
  return match[1].trim();
};

/** The px a `clamp(<rem>, <rem> + <vw>, <rem>)` token comes to in a window `width` px wide. */
function clampAt(value: string, width: number): number {
  const match = /^clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)rem\s*\+\s*([\d.]+)vw\s*,\s*([\d.]+)rem\s*\)$/.exec(
    value,
  );
  if (match === null) throw new Error(`Not a fluid token: ${value}`);
  const [min, base, slope, max] = match.slice(1).map(Number) as [number, number, number, number];
  return Math.min(max * 16, Math.max(min * 16, base * 16 + (slope * width) / 100));
}

describe('main and the pop-out lay out by their own width (§4.3, §6.2)', () => {
  it.each([
    ['--container-board', '47.5rem'],
    ['--container-wide', '67.5rem'],
    ['--container-vast', '90rem'],
    ['--container-pane2', '45rem'],
    ['--container-pane3', '65rem'],
  ])('%s is %s', (name, value) => {
    expect(theme(name)).toBe(value);
  });

  it('gives the pop-out one pane, then steps from 720px, then a preview from 1040px', () => {
    expect(FLAT).toContain('@container popout (width >= 45rem)');
    expect(FLAT).toContain('@container popout (width >= 65rem)');
    expect(FLAT).toContain("'steps body preview' minmax(0, 1fr) / 14.5rem minmax(0, 1fr) 22.5rem");
  });

  it('knows the phone’s tab bar height, for what must clear it', () => {
    expect(ROOT.get('--tab-bar-h')).toBe('3.875rem');
  });
});

describe('title pairs (§9.5)', () => {
  it.each([
    ['--text-title-hero', 20, 40],
    ['--text-sub-hero', 16, 24],
    ['--text-title-sheet', 20, 30],
    ['--text-sub-sheet', 16, 21],
    ['--text-title-question', 32, 48],
    ['--text-sub-question', 19, 24],
    ['--text-title-steps', 24, 26],
    ['--text-sub-steps', 17, 18],
  ] as const)(
    '%s is %ipx on a phone and %ipx at 1440, within the 2.5x zoom limit',
    (name, phone, desktop) => {
      expect(clampAt(theme(name), 390)).toBeCloseTo(phone, 0);
      expect(clampAt(theme(name), 1440)).toBeCloseTo(desktop, 0);
      expect(desktop / phone).toBeLessThanOrEqual(2.5);
    },
  );

  it('sets the phone’s screen name at 76px and the desktop top bar at 38 / 21', () => {
    expect(theme('--text-screen-name')).toBe('4.75rem');
    expect(theme('--text-title-screen')).toBe('2.375rem');
    expect(theme('--text-sub-screen')).toBe('1.3125rem');
  });
});

describe('numerals that run off a sheet (§9.4)', () => {
  it('bleeds 0.06 of the glyph from lg and 0.03 below, with v2’s cap height', () => {
    expect(ROOT.get('--numeral-bleed')).toBe('0.06');
    expect(ROOT.get('--numeral-cap')).toBe('0.61');
    expect(CSS).toMatch(/@media \(width < 64rem\) \{\s*:root \{\s*--numeral-bleed: 0\.03;/);
  });

  it('halves the bleed inside a card sheet, and cuts the foot by the formula', () => {
    expect(CSS).toMatch(
      /\[data-card-sheet\] \[data-numeral\] \{\s*--b: calc\(var\(--numeral-bleed\) \* 0\.5\);/,
    );
    expect(FLAT).toContain('margin-block-end: calc(var(--b) * var(--numeral-cap) * -1em - 0.02em);');
    expect(FLAT).toContain('line-height: 0.74;');
  });

  it('never sets a numeral under 28px', () => {
    expect(FLAT).toContain(
      'font-size: max(1.75rem, min(var(--numeral-max, 7.375rem), calc(100cqi / (var(--glyphs, 6) * 0.34))));',
    );
  });
});

describe('route changes (§8.2)', () => {
  it('keeps the rail, the tab bar and the collapsed bar still while main changes', () => {
    expect(CSS).toMatch(/\[data-slot='tab-bar'\] \{\s*view-transition-name: nav;/);
    expect(CSS).toMatch(/#main \{\s*view-transition-name: main;/);
    expect(CSS).toMatch(/\[data-testid='collapsed-summary'\] \{\s*view-transition-name: collapsed-bar;/);
  });

  it('slides only when motion is welcome, mirrored for right-to-left', () => {
    const motion = /@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/.exec(
      CSS.slice(CSS.indexOf('Route changes')),
    )?.[1];
    expect(motion).toContain("html[data-nav-dir='forward']::view-transition-new(main)");
    expect(motion).toContain("html[data-nav-dir='forward']:dir(rtl)::view-transition-new(main)");
  });

  it('does not bounce the page on a trackpad', () => {
    expect(CSS).toMatch(/@media \(pointer: fine\) \{\s*html \{\s*overscroll-behavior-y: none;/);
  });
});

describe('the grain (§9.1)', () => {
  it('is drawn on the paper and on every sheet, at 7.5% in light and 6% in dark', () => {
    expect(FLAT).toContain("url('./assets/grain.png')");
    expect(ROOT.get('--grain-veil')).toBe('92.5%');
    expect(declarations(CSS, '.dark').get('--grain-veil')).toBe('94%');
    expect(ROOT.get('--grain-blend')).toBe('multiply');
    expect(declarations(CSS, '.dark').get('--grain-blend')).toBe('screen');
  });

  it('is a 180px greyscale PNG', () => {
    const png = readFileSync(new URL('../assets/grain.png', import.meta.url));
    expect([...png.subarray(1, 4)].map((byte) => String.fromCharCode(byte)).join('')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
    expect(png[25]).toBe(0); // colour type 0: greyscale
  });
});
```

Run: `pnpm exec vitest run --project unit src/lib/stylesheet.test.ts`
Expected: FAIL, "--container-board is not in the stylesheet". The PNG test passes already.

- [ ] **Step 4: The theme additions**

In `@theme inline` in `src/index.css`, after the lines Task 3 added, add:

```css
/* §4.3: screens lay out by main's width, not the window's. */
--container-board: 47.5rem; /* 760px: what a 1024 window leaves main */
--container-wide: 67.5rem; /* 1080px: main is 1184px at 1440 */
--container-vast: 90rem; /* 1440px: main is 1664px at 1920 */
/* §6.2: the pop-out lays out by its own width. */
--container-pane2: 45rem; /* 720px: steps and body */
--container-pane3: 65rem; /* 1040px: steps, body and preview */

/* §9.5: title pairs, each fluid from its phone size at 390 to its desktop size at 1440. */
--text-screen-name: 4.75rem; /* the phone's Karantina screen name */
--text-title-screen: 2.375rem; /* the desktop top bar: 38 */
--text-sub-screen: 1.3125rem; /* 21 */
--text-title-hero: clamp(1.25rem, 0.7857rem + 1.9048vw, 2.5rem); /* 20 -> 40 */
--text-sub-hero: clamp(1rem, 0.8143rem + 0.7619vw, 1.5rem); /* 16 -> 24 */
--text-title-sheet: clamp(1.25rem, 1.0179rem + 0.9524vw, 1.875rem); /* 20 -> 30 */
--text-sub-sheet: clamp(1rem, 0.8839rem + 0.4762vw, 1.3125rem); /* 16 -> 21 */
--text-title-question: clamp(2rem, 1.6286rem + 1.5238vw, 3rem); /* 32 -> 48 */
--text-sub-question: clamp(1.1875rem, 1.0714rem + 0.4762vw, 1.5rem); /* 19 -> 24 */
--text-title-steps: clamp(1.5rem, 1.4536rem + 0.1905vw, 1.625rem); /* 24 -> 26 */
--text-sub-steps: clamp(1.0625rem, 1.0393rem + 0.0952vw, 1.125rem); /* 17 -> 18 */
```

- [ ] **Step 5: The Phase 2 stylesheet section**

Append to the end of `src/index.css`:

```css
/* ===========================================================================
   Phase 2: the shell, editors and shared components.

   Every rule here waits on an attribute its component sets (data-slot,
   data-numeral, data-nav-dir), so it is harmless until that lands.
   src/lib/stylesheet.test.ts pins the values the spec fixed.
=========================================================================== */
:root {
  --tab-bar-h: 3.875rem; /* the phone's tab bar: a 2px line, 8px, a 44px pill, 8px */

  /* §9.4: the share of a numeral's glyph height a sheet's foot hides, and that
     height in em (fontTools: Karantina's digits are 600-608 units). Changing
     the depth later changes only --numeral-bleed. */
  --numeral-bleed: 0.06;
  --numeral-cap: 0.61;

  /* §9.1: the grain's strength is the veil of the surface's own colour over it. */
  --grain-veil: 92.5%;
  --grain-blend: multiply;
}

.dark {
  --grain-veil: 94%;
  --grain-blend: screen;
}

@media (width < 64rem) {
  :root {
    --numeral-bleed: 0.03;
  }
}

/* No bounce on desktop: the rail never drags with a trackpad's rubber band (§4.3). */
@media (pointer: fine) {
  html {
    overscroll-behavior-y: none;
  }
}

/* ---------------------------------------------------------------------------
   The paper grain (§9.1): a static 180px tile, drawn as a background layer on
   the paper and on every sheet, under a veil of the surface's own colour, so
   its strength is 7.5% in light (multiply) and 6% in dark (screen). Not a
   full-screen overlay with mix-blend-mode: over a long virtualised feed that
   re-composites the page on every scroll frame. Forced colours drop it.
--------------------------------------------------------------------------- */
body,
[data-sheet] {
  background-image:
    linear-gradient(
      color-mix(in oklch, var(--surface) var(--grain-veil), transparent),
      color-mix(in oklch, var(--surface) var(--grain-veil), transparent)
    ),
    url('./assets/grain.png');
  background-blend-mode: normal, var(--grain-blend);
  background-size:
    auto,
    11.25rem 11.25rem;
}

body {
  --surface: var(--background);
}

[data-sheet] {
  --surface: var(--fill);
}

/* ---------------------------------------------------------------------------
   Route changes (§8.2): same-document view transitions. The rail, the tab bar
   and the collapsed bar have names of their own, so they stay still while
   main changes. Before navigating, the shell sets data-nav-dir on <html> from
   the rail's order; main cross-fades for everyone and slides 24px in the
   reading direction only when motion is welcome (no view transition types:
   Baseline only since January 2026). Without view transitions the route just
   changes.
--------------------------------------------------------------------------- */
[data-slot='tab-bar'] {
  view-transition-name: nav;
}

#main {
  view-transition-name: main;
}

[data-testid='collapsed-summary'] {
  view-transition-name: collapsed-bar;
}

::view-transition-group(main),
::view-transition-old(main),
::view-transition-new(main) {
  animation-duration: var(--dur-move);
  animation-timing-function: var(--ease-out);
}

@keyframes nav-fade-in {
  from {
    opacity: 0;
  }
}

@keyframes nav-from-right {
  from {
    translate: 1.5rem 0;
  }
}

@keyframes nav-from-left {
  from {
    translate: -1.5rem 0;
  }
}

@media (prefers-reduced-motion: no-preference) {
  html[data-nav-dir='forward']::view-transition-new(main),
  html[data-nav-dir='back']:dir(rtl)::view-transition-new(main) {
    animation-name: nav-fade-in, nav-from-right;
  }

  html[data-nav-dir='back']::view-transition-new(main),
  html[data-nav-dir='forward']:dir(rtl)::view-transition-new(main) {
    animation-name: nav-fade-in, nav-from-left;
  }
}

/* ---------------------------------------------------------------------------
   Numerals that run off a sheet (§9.4, v2's rules). Numeral sets --glyphs
   (the formatted figure's length) and --numeral-max (its type-scale cap); it
   fits its container and never goes under 28px. The sheet's foot cuts it:
   padding-block-end 0 under it, overflow: clip on the sheet. A figure with a
   fraction sets --b: 0 inline and never bleeds.
--------------------------------------------------------------------------- */
[data-numeral] {
  --b: var(--numeral-bleed);
  font-size: max(1.75rem, min(var(--numeral-max, 7.375rem), calc(100cqi / (var(--glyphs, 6) * 0.34))));
  line-height: 0.74;
  letter-spacing: -0.005em;
  margin-block-end: calc(var(--b) * var(--numeral-cap) * -1em - 0.02em);
}

[data-card-sheet] [data-numeral] {
  --b: calc(var(--numeral-bleed) * 0.5);
}

/* ---------------------------------------------------------------------------
   The pop-out (§6.2) lays out by its own width: one pane below 720px; steps
   and body from 720px; steps, body and preview from 1040px. Missing areas
   collapse: a flow with no preview has two panes at most. One popup always,
   so a pop-out crossing a threshold keeps its step and its answers.
--------------------------------------------------------------------------- */
[data-slot='popout-layout'] {
  display: grid;
  block-size: 100%;
  min-block-size: 0;
  grid-template:
    'preview' auto
    'body' minmax(0, 1fr)
    / minmax(0, 1fr);
}

[data-slot='popout-steps'] {
  grid-area: steps;
  display: none;
}

[data-slot='popout-body'] {
  grid-area: body;
}

/* Small, above the question, until there is room beside it. */
[data-slot='popout-preview'] {
  grid-area: preview;
  max-block-size: 14rem;
  overflow: clip;
}

[data-slot='popout-preview'] [data-slot='popout-close'] {
  display: none;
}

@container popout (width >= 45rem) {
  [data-slot='popout-layout']:has(> [data-slot='popout-steps']) {
    grid-template:
      'steps preview' auto
      'steps body' minmax(0, 1fr)
      / 14.5rem minmax(0, 1fr);
  }

  [data-slot='popout-steps'] {
    display: flex;
  }
}

@container popout (width >= 65rem) {
  [data-slot='popout-layout']:has(> [data-slot='popout-preview']) {
    grid-template: 'body preview' minmax(0, 1fr) / minmax(0, 1fr) 22.5rem;
  }

  [data-slot='popout-layout']:has(> [data-slot='popout-preview']):has(> [data-slot='popout-steps']) {
    grid-template: 'steps body preview' minmax(0, 1fr) / 14.5rem minmax(0, 1fr) 22.5rem;
  }

  [data-slot='popout-preview'] {
    max-block-size: none;
  }

  /* The round × moves to the preview's corner (§6.2). */
  [data-slot='popout-preview'] [data-slot='popout-close'] {
    display: inline-flex;
  }

  [data-slot='popout-layout']:has(> [data-slot='popout-preview'])
    [data-slot='popout-body']
    [data-slot='popout-close'] {
    display: none;
  }
}
```

Run: `pnpm exec vitest run --project unit src/lib/stylesheet.test.ts src/lib/contrast.test.ts src/lib/money-colours.test.ts`
Expected: PASS. (The contrast tests read `--grain-veil` and `--grain-blend` too; neither is an `oklch()` literal, so the two-theme checks are unaffected.)

- [ ] **Step 6: Write the failing component tests**

Create `src/components/ui/button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

/** The Bold sheets controls (§9.6, §7.8) as variants of the one Button. */
describe('Button', () => {
  it('keeps the default variant as it was', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('h-8', 'bg-primary');
  });

  it('draws a pill: a 2px edge in the text colour, full radius, 48px tall, 22px in', () => {
    render(<Button variant="pill">Cancel</Button>);
    const pill = screen.getByRole('button', { name: 'Cancel' });
    expect(pill).toHaveClass(
      'rounded-full',
      'border-2',
      'border-current',
      'min-h-12',
      'px-5.5',
      'font-medium',
    );
    expect(pill).not.toHaveClass('h-8');
  });

  it('fills a pill with the pressed pair, on a fine pointer’s hover or on press', () => {
    render(<Button variant="pill">Cancel</Button>);
    const pill = screen.getByRole('button', { name: 'Cancel' });
    expect(pill).toHaveClass('hover-fine:bg-press', 'hover-fine:text-on-press', 'active:bg-press');
    expect(pill.className).not.toMatch(/(^|\s)hover:/);
  });

  it('draws the solid pill in sapphire, the one primary action in a view', () => {
    render(<Button variant="pill-solid">Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(
      'bg-primary',
      'text-primary-foreground',
      'border-primary',
      'min-h-12',
    );
  });

  it('draws a 48px round button and a text button', () => {
    render(
      <>
        <Button variant="round" aria-label="Next month" />
        <Button variant="text">Cancel</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Next month' })).toHaveClass(
      'size-12',
      'rounded-full',
      'border-2',
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass(
      'underline',
      'decoration-2',
      'min-h-11',
    );
  });

  it('scales a press only when motion is welcome, and never nudges a pill down a pixel', () => {
    render(<Button variant="pill">Cancel</Button>);
    const pill = screen.getByRole('button', { name: 'Cancel' });
    expect(pill).toHaveClass('motion-safe:active:scale-97', 'active:not-aria-[haspopup]:translate-y-0');
    expect(pill.className).not.toMatch(/(^|\s)active:scale-/);
  });
});
```

Create `src/components/ui/mark.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Mark } from './mark';

describe('Mark, the inverted figure box (§9.3)', () => {
  it('sets its text in the sheet’s box pair, weight 600, with the mark radius', () => {
    render(<Mark>₪2,180</Mark>);
    const mark = screen.getByText('₪2,180');
    expect(mark).toHaveAttribute('data-slot', 'mark');
    expect(mark).toHaveClass(
      'bg-box',
      'text-box-text',
      'font-semibold',
      'rounded-mark',
      'box-decoration-clone',
    );
  });

  it('isolates its run, so a number keeps its order in Hebrew', () => {
    render(<Mark>12</Mark>);
    expect(screen.getByText('12')).toHaveClass('[unicode-bidi:isolate]');
  });
});
```

Create `src/components/ui/title-pair.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TitlePair } from './title-pair';

describe('TitlePair (§7.7)', () => {
  it('is one heading: the title in 600, the subtitle in 300 inside it, read once', () => {
    render(<TitlePair title="October so far" subtitle="day 9 of 31" />);
    const heading = screen.getByRole('heading', { level: 2, name: 'October so far day 9 of 31' });
    expect(heading).toHaveClass('font-semibold', 'text-title-sheet');
    expect(screen.getByText('day 9 of 31')).toHaveClass('block', 'font-light', 'text-sub-sheet');
  });

  it('is the page’s h1 as a screen name: Karantina on a phone, the 38px top bar from lg', () => {
    render(<TitlePair as="h1" size="screen" title="Cards" subtitle="three of them" />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass(
      'font-display',
      'text-screen-name',
      'lg:font-sans',
      'lg:font-semibold',
      'lg:text-title-screen',
    );
    // No subtitle under the phone's big name (§9.5).
    expect(screen.getByText('three of them')).toHaveClass('hidden', 'lg:block');
  });

  it('passes an id through, so a dialog can be named by it', () => {
    render(<TitlePair id="t1" title="Split into payments" />);
    expect(screen.getByRole('heading')).toHaveAttribute('id', 't1');
  });
});
```

Create `src/components/app-mark.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { AppMark } from './app-mark';

describe('AppMark (§3)', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('is an outlined circle with a Karantina B, beside the name in Plex 600', () => {
    renderWithProviders(<AppMark />);
    const circle = screen.getByText('B');
    expect(circle).toHaveAttribute('aria-hidden', 'true');
    expect(circle).toHaveClass(
      'font-display',
      'rounded-full',
      'border-2',
      'border-current',
      'size-11.5',
      'text-[1.75rem]',
    );
    expect(screen.getByText('Bookandry')).toHaveClass('font-semibold');
  });

  it('keeps the name for screen readers when it is not shown', () => {
    renderWithProviders(<AppMark withName={false} />);
    expect(screen.getByText('Bookandry')).toHaveClass('sr-only');
  });
});
```

Run: `pnpm exec vitest run --project dom src/components/ui/button.test.tsx src/components/ui/mark.test.tsx src/components/ui/title-pair.test.tsx src/components/app-mark.test.tsx`
Expected: FAIL: the variants and the three modules do not exist.

- [ ] **Step 7: The `Button` variants**

In `src/components/ui/button.tsx`, add to `variants.variant` after `link`:

```ts
        // §9.6, Bold sheets. Colours come from the context: on the paper the
        // pressed pair is ink and paper; inside a sheet it is the sheet's box.
        pill: 'border-2 border-current bg-transparent text-current hover-fine:border-press hover-fine:bg-press hover-fine:text-on-press active:border-press active:bg-press active:text-on-press',
        'pill-solid':
          'border-2 border-primary bg-primary text-primary-foreground hover-fine:border-ink hover-fine:bg-ink hover-fine:text-paper active:border-ink active:bg-ink active:text-paper',
        round:
          'border-2 border-current bg-transparent text-current hover-fine:border-press hover-fine:bg-press hover-fine:text-on-press active:border-press active:bg-press active:text-on-press',
        text: 'text-current underline decoration-2 underline-offset-4',
```

and add after `variants` (before `defaultVariants`):

```ts
    // Applied after `size`, so a pill's own shape wins over the default h-8.
    compoundVariants: [
      {
        variant: ['pill', 'pill-solid', 'round'],
        className:
          'transition-[background-color,color,border-color,scale] duration-(--dur-press) ease-fill active:not-aria-[haspopup]:translate-y-0 motion-safe:active:scale-97 focus-visible:border-current focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring',
      },
      { variant: ['pill', 'pill-solid'], className: 'h-auto min-h-12 gap-2 rounded-full px-5.5 text-base font-medium' },
      { variant: 'round', className: "size-12 rounded-full p-0 [&_svg:not([class*='size-'])]:size-5" },
      {
        variant: 'text',
        className:
          'h-auto min-h-11 min-w-11 px-2.5 text-base font-medium focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring',
      },
    ],
```

`--ring` inside a sheet is `currentColor`, so the outline follows the sheet's tint there and is sapphire on the paper (§9.2).

- [ ] **Step 8: `Mark`, `TitlePair` and the app mark**

Create `src/components/ui/mark.tsx`:

```tsx
import { cn } from 'cn';
import type * as React from 'react';

/**
 * The inverted figure box (§9.3): the figure that matters in a sentence or a
 * row, in its sheet's `--box` with the sheet's lifted hue (`--box-text`) as
 * text. On the ink sheet the box flips to paper with ink text, by the sheet's
 * own mapping. One or two per sheet: a sheet full of boxes has no figure that
 * matters. A wrapped box keeps its ends; a number inside stays an isolated run.
 */
export function Mark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="mark"
      className={cn(
        'rounded-mark bg-box box-decoration-clone px-[0.28em] pt-[0.04em] pb-[0.1em] font-semibold whitespace-nowrap text-box-text [unicode-bidi:isolate]',
        className,
      )}
      {...props}
    />
  );
}
```

Create `src/components/ui/title-pair.tsx`:

```tsx
import { cn } from 'cn';
import type * as React from 'react';

type Size = 'screen' | 'hero' | 'sheet' | 'question' | 'steps';

/** §9.5. `screen` is Karantina on a phone and the 38/21 top bar from lg. */
const TITLE: Record<Size, string> = {
  screen:
    'font-display text-screen-name leading-[0.85] lg:font-sans lg:text-title-screen lg:leading-[1.02] lg:font-semibold lg:tracking-[-0.01em]',
  hero: 'text-title-hero font-semibold leading-[1.02] tracking-[-0.01em]',
  sheet: 'text-title-sheet font-semibold leading-[1.02] tracking-[-0.01em]',
  question: 'text-title-question font-semibold leading-[1.02] tracking-[-0.01em]',
  steps: 'text-title-steps font-semibold leading-[1.05] tracking-[-0.01em]',
};

const SUBTITLE: Record<Size, string> = {
  screen: 'hidden lg:block lg:text-sub-screen',
  hero: 'text-sub-hero',
  sheet: 'text-sub-sheet',
  question: 'text-sub-question',
  steps: 'text-sub-steps',
};

/**
 * A title in weight 600 and a subtitle in weight 300, a size step below, as
 * ONE heading (§7.7): the subtitle is a block span inside the heading, so a
 * screen reader reads the pair once. The space between them is real text, so
 * the pair's name is "October so far day 9 of 31", not "October so farday 9".
 */
export function TitlePair({
  as: Heading = 'h2',
  title,
  subtitle,
  size = 'sheet',
  className,
  ...props
}: {
  readonly as?: 'h1' | 'h2' | 'h3';
  readonly title: string;
  readonly subtitle?: string;
  readonly size?: Size;
  readonly className?: string;
} & Omit<React.HTMLAttributes<HTMLHeadingElement>, 'title' | 'children'>) {
  return (
    <Heading data-slot="title-pair" className={cn(TITLE[size], className)} {...props}>
      {title}
      {subtitle === undefined ? null : (
        <>
          {' '}
          <span className={cn('block leading-[1.15] font-light tracking-normal', SUBTITLE[size])}>
            {subtitle}
          </span>
        </>
      )}
    </Heading>
  );
}
```

Create `src/components/app-mark.tsx`:

```tsx
import { cn } from 'cn';
import { useTranslation } from 'react-i18next';

/**
 * The in-app mark (§3, decision 37): a 46px circle with a 2px outline in the
 * text colour and a Karantina "B" (28px, the display face's floor), beside
 * "Bookandry" in Plex 600. It replaces the sapphire disc in the rail, the
 * screen head and the front door; the installed icon and the favicon keep the
 * disc (`logo.tsx`).
 */
export function AppMark({
  withName = true,
  className,
}: {
  readonly withName?: boolean;
  readonly className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span data-slot="app-mark" className={cn('inline-flex items-center gap-3', className)}>
      <span
        aria-hidden="true"
        className="grid size-11.5 shrink-0 place-items-center rounded-full border-2 border-current font-display text-[1.75rem] leading-none"
      >
        B
      </span>
      <span className={withName ? 'text-[1.1875rem] font-semibold' : 'sr-only'}>{t('app.name')}</span>
    </span>
  );
}
```

Run: `pnpm exec vitest run --project dom src/components/ui/button.test.tsx src/components/ui/mark.test.tsx src/components/ui/title-pair.test.tsx src/components/app-mark.test.tsx`
Expected: PASS.

- [ ] **Step 9: The gate, and commit**

Run: `pnpm verify`
Expected: exit 0. The grain now shows on the paper (`pnpm dev`: a faint even speckle, light and dark); nothing else moves.

```bash
git add src/i18n/locales/en/common.json src/i18n/locales/he/common.json src/index.css scripts/make-grain.mjs src/assets/grain.png src/components/ui/button.tsx src/components/ui/button.test.tsx src/components/ui/mark.tsx src/components/ui/mark.test.tsx src/components/ui/title-pair.tsx src/components/ui/title-pair.test.tsx src/components/app-mark.tsx src/components/app-mark.test.tsx src/lib/stylesheet.test.ts
git commit -m "The paper gets its grain, buttons gain pill, round and text variants, and the shell's strings, layout rules and figure box land ready for the panels, pop-outs and rail" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Logical sheet sides and `EditorPanel`; every editor becomes a panel

**Files:**

- Modify: `src/components/ui/sheet.tsx:39-74` (`SheetContent`)
- Create: `src/components/ui/editor-panel.tsx`, `src/components/ui/editor-panel.test.tsx`
- Modify (the move, contents unchanged): `src/features/transaction/transaction-sheet.tsx`, `src/features/cards/method-editor.tsx`, `src/features/settings/categories-screen.tsx`, `src/features/cash/count-sheet.tsx`, `src/features/cash/move-sheet.tsx`, `src/features/profiles/profile-editor.tsx`, `src/features/account/account-sheet.tsx`, `src/features/summary/breakdown-sheet.tsx`
- Modify: `e2e/02-transaction-type.spec.ts`, `e2e/14-cards.spec.ts` (selectors), `e2e/04-rtl-hebrew.spec.ts:170-200` (the side test)
- Create: `e2e/18-editor-panel.spec.ts`

**Interfaces:**

- Consumes (Task 9): `Button` variant `round`; `text-title-sheet`, `text-sub-sheet`; `bg-scrim`; `rounded-sheet`, spacing `sheet`, `--dur-panel` (Phase 1). Existing: `openAddSheet` from `e2e/support/add.ts` (Task 12 changes its insides, not its name).
- Produces:
  - `src/components/ui/editor-panel.tsx`: `EditorPanel` (`Dialog.Root` props), `EditorPanelContent` (`Dialog.Popup` props: `aria-labelledby`, `initialFocus`, `className`…), `EditorPanelHeader` (`div` props; renders the round × itself), `EditorPanelTitle`, `EditorPanelDescription`.
  - The popup carries `data-slot="editor-panel"`. An editor's own Cancel/Save row marked `data-slot="editor-actions"` sticks to the panel's foot and sits at the inline end from `lg`.
  - `SheetContent`'s `side` is `'top' | 'bottom' | 'start' | 'end'` (default `'end'`); `'left'` and `'right'` are gone.

- [ ] **Step 1: Write the failing panel tests**

Create `src/components/ui/editor-panel.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import {
  EditorPanel,
  EditorPanelContent,
  EditorPanelDescription,
  EditorPanelHeader,
  EditorPanelTitle,
} from './editor-panel';

/** An add-transaction panel with the card editor that opens over it, as transaction-sheet.tsx nests them. */
function Harness() {
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Add
      </button>
      <EditorPanel open={open} onOpenChange={setOpen}>
        <EditorPanelContent>
          <EditorPanelHeader>
            <EditorPanelTitle>New transaction</EditorPanelTitle>
            <EditorPanelDescription>What it was, and how it was paid</EditorPanelDescription>
          </EditorPanelHeader>
          <label>
            Amount
            <input />
          </label>
          <button
            type="button"
            onClick={() => {
              setCard(true);
            }}
          >
            Edit card
          </button>
          <div data-slot="editor-actions">
            <button type="button">Cancel</button>
            <button type="submit">Save</button>
          </div>
          <EditorPanel open={card} onOpenChange={setCard}>
            <EditorPanelContent>
              <EditorPanelHeader>
                <EditorPanelTitle>Edit card</EditorPanelTitle>
              </EditorPanelHeader>
              <label>
                Label
                <input />
              </label>
            </EditorPanelContent>
          </EditorPanel>
        </EditorPanelContent>
      </EditorPanel>
    </>
  );
}

beforeAll(async () => {
  await initTestI18n('en');
});

async function openPanel() {
  const user = userEvent.setup();
  renderWithProviders(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Add' }));
  return { user, panel: await screen.findByRole('dialog', { name: 'New transaction' }) };
}

describe('EditorPanel (§6.1)', () => {
  it('is a bottom sheet below lg and a floating panel at the inline end from lg, one popup by class', async () => {
    const { panel } = await openPanel();
    expect(panel).toHaveAttribute('data-slot', 'editor-panel');
    // Below lg: today's bottom sheet.
    expect(panel).toHaveClass('inset-be-0', 'start-0', 'end-0', 'max-h-[92dvh]', 'rounded-t-sheet');
    // From lg: 480px at the inline end, inset by the sheet gap, all four corners rounded.
    expect(panel).toHaveClass(
      'lg:end-sheet',
      'lg:start-auto',
      'lg:inset-bs-sheet',
      'lg:inset-be-sheet',
      'lg:w-120',
      'lg:rounded-sheet',
    );
  });

  it('moves only when motion is welcome: every translate is behind motion-safe', async () => {
    const { panel } = await openPanel();
    const moves = panel.className.split(/\s+/).filter((name) => name.includes('translate'));
    expect(moves.length).toBeGreaterThan(0);
    for (const name of moves) expect(name).toMatch(/motion-safe:/);
  });

  it('has a round × in its header, named Close, and Escape closes it', async () => {
    const { user } = await openPanel();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('size-12', 'rounded-full');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'New transaction' })).not.toBeInTheDocument();
    });
  });

  it('traps focus inside, and gives it back to the opener', async () => {
    const { user, panel } = await openPanel();
    expect(panel.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(panel.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
    });
  });

  it('keeps what was typed when the window crosses lg: it is the same popup', async () => {
    const { user } = await openPanel();
    const amount = screen.getByLabelText('Amount');
    await user.type(amount, '120');

    // The layout is CSS; a resize re-renders nothing that could remount the form.
    window.dispatchEvent(new Event('resize'));

    expect(screen.getByLabelText('Amount')).toBe(amount);
    expect(amount).toHaveValue('120');
  });

  it('pins the editor’s own Cancel and Save to its foot, at the inline end from lg', async () => {
    const { panel } = await openPanel();
    expect(panel).toHaveClass(
      '[&_[data-slot=editor-actions]]:sticky',
      '[&_[data-slot=editor-actions]]:inset-be-0',
      'lg:[&_[data-slot=editor-actions]]:justify-end',
    );
  });

  it('closes only the top panel of two, and the one underneath keeps its draft (Review Focus)', async () => {
    const { user } = await openPanel();
    await user.type(screen.getByLabelText('Amount'), '120');
    await user.click(screen.getByRole('button', { name: 'Edit card' }));
    await screen.findByRole('dialog', { name: 'Edit card' });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit card' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('dialog', { name: 'New transaction' })).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveValue('120');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit card' })).toHaveFocus();
    });
  });
});
```

Run: `pnpm exec vitest run --project dom src/components/ui/editor-panel.test.tsx`
Expected: FAIL, "Failed to resolve import './editor-panel'".

- [ ] **Step 2: `EditorPanel`**

Create `src/components/ui/editor-panel.tsx`:

```tsx
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cn } from 'cn';
import { XIcon } from 'lucide-react';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

/**
 * An editor (§6.1): ONE Base UI dialog popup with responsive classes.
 *
 * Below lg it is today's bottom sheet. From lg it is a 480px panel at the
 * inline end - on the right in English, the left in Hebrew - floating on the
 * scrim, inset by the sheet gap from the window's edges. One popup, not two
 * behind breakpoints, so a window resized across lg with a half-filled form
 * keeps everything.
 *
 * It stays modal: focus is trapped, Escape closes the top one only, and focus
 * returns to the opener. Inside: a header with the title pair and a round ×,
 * a body that scrolls without dragging the page, and the editor's own
 * Cancel and Save (marked `data-slot="editor-actions"`) held at its foot.
 */
function EditorPanel(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

const PANEL = [
  // Below lg: the bottom sheet.
  'fixed start-0 end-0 inset-be-0 z-50 flex max-h-[92dvh] flex-col overflow-y-auto overscroll-contain',
  'rounded-t-sheet bg-card text-card-foreground outline-none @container/panel',
  // An opacity fade for everyone; the rise and the slide only when motion is welcome (§8.2).
  'transition-[opacity,translate] duration-(--dur-panel) ease-out data-starting-style:opacity-0 data-ending-style:opacity-0',
  'motion-safe:data-starting-style:translate-y-8 motion-safe:data-ending-style:translate-y-8',
  // From lg: a sheet floating at the inline end.
  'lg:inset-bs-sheet lg:inset-be-sheet lg:start-auto lg:end-sheet lg:max-h-none lg:w-120 lg:rounded-sheet',
  'lg:motion-safe:data-starting-style:translate-y-0 lg:motion-safe:data-ending-style:translate-y-0',
  'lg:motion-safe:data-starting-style:translate-x-8 lg:motion-safe:data-ending-style:translate-x-8',
  'lg:motion-safe:rtl:data-starting-style:-translate-x-8 lg:motion-safe:rtl:data-ending-style:-translate-x-8',
  // The editor's own Cancel and Save stay put at the foot, side by side at the inline end from lg.
  '[&_[data-slot=editor-actions]]:sticky [&_[data-slot=editor-actions]]:inset-be-0 [&_[data-slot=editor-actions]]:z-10',
  '[&_[data-slot=editor-actions]]:bg-card [&_[data-slot=editor-actions]]:py-3',
  'lg:[&_[data-slot=editor-actions]]:justify-end lg:[&_[data-slot=editor-actions]>*]:flex-none lg:[&_[data-slot=editor-actions]>*]:min-w-37.5',
].join(' ');

function EditorPanelContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="editor-panel-scrim"
        className="fixed inset-0 z-50 bg-scrim transition-opacity duration-(--dur-panel) data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <DialogPrimitive.Popup data-slot="editor-panel" className={cn(PANEL, className)} {...props}>
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

/** The title pair and the round ×. Sticky, so the way out is always in reach. */
function EditorPanelHeader({ className, children, ...props }: React.ComponentProps<'div'>) {
  const { t } = useTranslation();
  return (
    <div
      data-slot="editor-panel-header"
      className={cn(
        'inset-bs-0 sticky z-10 flex items-start gap-3 bg-card px-5 pt-5 pb-3 lg:px-7 lg:pt-7',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
      <DialogPrimitive.Close render={<Button variant="round" />}>
        <XIcon aria-hidden="true" />
        <span className="sr-only">{t('action.close')}</span>
      </DialogPrimitive.Close>
    </div>
  );
}

function EditorPanelTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="editor-panel-title"
      className={cn('text-title-sheet leading-[1.02] font-semibold tracking-[-0.01em]', className)}
      {...props}
    />
  );
}

function EditorPanelDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="editor-panel-description"
      className={cn('text-sub-sheet leading-[1.15] font-light', className)}
      {...props}
    />
  );
}

export { EditorPanel, EditorPanelContent, EditorPanelDescription, EditorPanelHeader, EditorPanelTitle };
```

Run: `pnpm exec vitest run --project dom src/components/ui/editor-panel.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 3: `SheetContent` gets logical sides**

In `src/components/ui/sheet.tsx`, change the `side` default and type to `side = 'end'` and `side?: 'top' | 'bottom' | 'start' | 'end';`, and replace the `className={cn('fixed z-50 flex flex-col …', className)}` string with:

```tsx
        className={cn(
          'fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0',
          'data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem]',
          'data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem]',
          // Logical sides (§6.1): start and end follow the reading direction, and so does the slide.
          'data-[side=start]:inset-y-0 data-[side=start]:start-0 data-[side=start]:h-full data-[side=start]:w-3/4 data-[side=start]:border-e data-[side=start]:sm:max-w-sm data-[side=start]:data-ending-style:-translate-x-[2.5rem] data-[side=start]:data-starting-style:-translate-x-[2.5rem] rtl:data-[side=start]:data-ending-style:translate-x-[2.5rem] rtl:data-[side=start]:data-starting-style:translate-x-[2.5rem]',
          'data-[side=end]:inset-y-0 data-[side=end]:end-0 data-[side=end]:h-full data-[side=end]:w-3/4 data-[side=end]:border-s data-[side=end]:sm:max-w-sm data-[side=end]:data-ending-style:translate-x-[2.5rem] data-[side=end]:data-starting-style:translate-x-[2.5rem] rtl:data-[side=end]:data-ending-style:-translate-x-[2.5rem] rtl:data-[side=end]:data-starting-style:-translate-x-[2.5rem]',
          className,
        )}
```

The physical `left-0` and `right-0` sides are gone. `pnpm gate:rtl` passes either way (the `data-[side=…]` chain is exempt), but now nothing physical is left to exempt.

- [ ] **Step 4: Move every editor**

The move renames the shell and leaves each editor's contents alone. Run, from the worktree root:

```bash
for f in \
  src/features/transaction/transaction-sheet.tsx \
  src/features/cards/method-editor.tsx \
  src/features/settings/categories-screen.tsx \
  src/features/cash/count-sheet.tsx \
  src/features/cash/move-sheet.tsx \
  src/features/profiles/profile-editor.tsx \
  src/features/account/account-sheet.tsx \
  src/features/summary/breakdown-sheet.tsx
do
  sed -i \
    -e "s#import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';#import { EditorPanel, EditorPanelContent, EditorPanelDescription, EditorPanelHeader, EditorPanelTitle } from '@/components/ui/editor-panel';#" \
    -e "s#import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';#import { EditorPanel, EditorPanelContent, EditorPanelHeader, EditorPanelTitle } from '@/components/ui/editor-panel';#" \
    -e 's#<SheetContent side="bottom" className="max-h-\[92dvh\] overflow-y-auto"#<EditorPanelContent#' \
    -e 's#<SheetContent side="bottom" className="max-h-\[80dvh\] overflow-y-auto"#<EditorPanelContent#' \
    -e 's#\bSheetContent\b#EditorPanelContent#g' \
    -e 's#\bSheetHeader\b#EditorPanelHeader#g' \
    -e 's#\bSheetTitle\b#EditorPanelTitle#g' \
    -e 's#\bSheetDescription\b#EditorPanelDescription#g' \
    -e 's#<Sheet\b#<EditorPanel#g' \
    -e 's#</Sheet>#</EditorPanel>#g' \
    "$f"
done
```

Then by hand:

- `src/features/cards/method-editor.tsx:297-299`: its `<EditorPanelContent` spans several lines; delete the two prop lines `side="bottom"` and `className="max-h-[92dvh] overflow-y-auto"`, keeping the `initialFocus` prop and its comment.
- Mark the Cancel/Save rows, so they stick to the panel's foot: in `src/features/transaction/transaction-sheet.tsx:1374`, `src/features/cards/method-editor.tsx:572`, `src/features/profiles/profile-editor.tsx:239` and `src/features/settings/categories-screen.tsx:329`, change `<div className="flex gap-2 pt-1">` to `<div data-slot="editor-actions" className="flex gap-2 pt-1">`.

Check: `grep -rn "components/ui/sheet'" src/features` lists only `import-sheet.tsx`, `reconvert-dialog.tsx` and `split-purchase.tsx` (Task 11's), and `grep -rn "<Sheet\|SheetContent" src/features` lists only those three files.

Run: `pnpm exec prettier --write src/features && pnpm typecheck && pnpm exec vitest run --project dom src/features`
Expected: PASS. Every editor's own tests still find their dialog by role and name, their fields by label, and Close by name.

- [ ] **Step 5: Update the browser selectors, and the side test**

The popup's slot is now `editor-panel`:

```bash
sed -i 's#\[data-slot="sheet-content"\]#[data-slot="editor-panel"]#g' e2e/02-transaction-type.spec.ts e2e/14-cards.spec.ts
```

In `e2e/04-rtl-hebrew.spec.ts`, replace the `test.describe('@rtl sheets open on the right edge', …)` block with:

```ts
test.describe('@rtl the add panel', () => {
  test('comes in at the inline end: the left in Hebrew from lg, the whole width on a phone', async ({
    page,
  }) => {
    /*
     * Measured by BOX POSITION, not by class name: a physical side surviving a
     * rewrite looks right in English and opens over the rail in Hebrew.
     */
    await completeFirstRun(page, 'he');
    await openAddSheet(page);

    const panel = page.locator('[data-slot="editor-panel"]');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box === null || viewport === null) return;

    if (viewport.width >= 1024) {
      // 480px, one sheet gap (16px) from the left edge, nowhere near the rail on the right.
      expect(Math.round(box.width)).toBe(480);
      expect(box.x).toBeGreaterThanOrEqual(15);
      expect(box.x).toBeLessThanOrEqual(17);
    } else {
      expect(box.x).toBeLessThanOrEqual(1);
      expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
    }
  });
});
```

- [ ] **Step 6: The panel in a browser, at every width**

Create `e2e/18-editor-panel.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { openAddSheet } from './support/add';
import { completeFirstRun } from './support/seed';
import { LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * The add-transaction editor as a panel (§6.1, §13.3): a bottom sheet on a
 * phone, a 480px sheet at the inline end from lg, with Cancel and Save side by
 * side - not 950px apart, as the full-width sheet had them at 1920.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and language are set explicitly.');
});

const COPY = {
  en: { cancel: 'Cancel', save: 'Save' },
  he: { cancel: 'ביטול', save: 'שמירה' },
} as const;

for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`@panel ${String(width)} ${lang}`, () => {
      test.use({ viewport: viewportFor(width), locale });

      test('sits where it should, with Cancel and Save together', async ({ page }) => {
        await completeFirstRun(page, lang, { demo: false });
        await openAddSheet(page);

        const panel = page.locator('[data-slot="editor-panel"]');
        await expect(panel).toBeVisible();
        const box = await panel.boundingBox();
        expect(box).not.toBeNull();
        if (box === null) return;

        if (width < 1024) {
          // The bottom sheet: the whole width, down to the bottom edge.
          expect(box.x).toBeLessThanOrEqual(1);
          expect(box.width).toBeGreaterThanOrEqual(width - 1);
          expect(box.y + box.height).toBeGreaterThanOrEqual(viewportFor(width).height - 1);
        } else {
          expect(Math.round(box.width)).toBe(480);
          // The inline end, one sheet gap in: right in English, left in Hebrew.
          if (lang === 'en') expect(width - (box.x + box.width)).toBeCloseTo(16, 0);
          else expect(box.x).toBeCloseTo(16, 0);
          // Full height less the gaps.
          expect(box.y).toBeCloseTo(16, 0);
          expect(box.height).toBeCloseTo(viewportFor(width).height - 32, 0);
        }

        const cancel = await panel
          .getByRole('button', { name: COPY[lang].cancel, exact: true })
          .boundingBox();
        const save = await panel.getByRole('button', { name: COPY[lang].save, exact: true }).boundingBox();
        expect(cancel).not.toBeNull();
        expect(save).not.toBeNull();
        if (cancel !== null && save !== null) {
          expect(Math.abs(save.x - cancel.x)).toBeLessThanOrEqual(480);
          expect(Math.abs(save.y - cancel.y)).toBeLessThanOrEqual(1);
        }

        await page.keyboard.press('Escape');
        await expect(panel).toHaveCount(0);
      });
    });
  }
}
```

Run: `pnpm exec playwright test e2e/18-editor-panel.spec.ts e2e/02-transaction-type.spec.ts e2e/04-rtl-hebrew.spec.ts e2e/14-cards.spec.ts e2e/15-cash.spec.ts e2e/08-polish.spec.ts`
Expected: PASS. `08-polish`'s keyboard walkthrough still finds focus inside the dialog, and `15-cash` still finds its count and move dialogs by name.

- [ ] **Step 7: Look, then the gate**

`pnpm dev` at 1440: add an expense, edit a card from inside it (the panel over the panel), count cash, edit a category, open the balance breakdown. Each is a rounded sheet at the right edge (left in Hebrew), the page dimmed behind it, Cancel and Save together at its foot. Narrow the window below 1024 with a half-typed amount: it becomes the bottom sheet and the amount is still there. Then `pnpm verify`.
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/sheet.tsx src/components/ui/editor-panel.tsx src/components/ui/editor-panel.test.tsx src/features/transaction/transaction-sheet.tsx src/features/cards/method-editor.tsx src/features/settings/categories-screen.tsx src/features/cash/count-sheet.tsx src/features/cash/move-sheet.tsx src/features/profiles/profile-editor.tsx src/features/account/account-sheet.tsx src/features/summary/breakdown-sheet.tsx e2e/02-transaction-type.spec.ts e2e/14-cards.spec.ts e2e/04-rtl-hebrew.spec.ts e2e/18-editor-panel.spec.ts
git commit -m "Every editor opens as a panel at the inline end on a desktop and stays a bottom sheet on a phone, with Cancel and Save side by side, and sheets have logical sides" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: `PopOut`; split, reconvert and Smart import move into it

**Files:**

- Create: `src/components/ui/pop-out.tsx`, `src/components/ui/pop-out.test.tsx`
- Modify: `src/features/transaction/split-purchase.tsx:11,50-67`
- Modify: `src/features/settings/reconvert-dialog.tsx:10,145-266`
- Modify: `src/features/import/import-sheet.tsx:25,154,472-494,626-649`
- Create: `e2e/19-popout.spec.ts`

**Interfaces:**

- Consumes (Task 9): `TitlePair` (`size="question" | "steps"`, passes `id` through), `Button` variant `round`, the pop-out grid rules keyed on `data-slot`, `popout.stepOf`, `popout.steps`, `action.close`; `rounded-dialog`, `rounded-preview`, `shadow-pop`, `bg-scrim` (Phase 1).
- Produces (`src/components/ui/pop-out.tsx`), for phase 3h and the add-card flow:
  - `PopOut` (`Dialog.Root` props).
  - `PopOutContent(props: Dialog.Popup.Props & { size?: 'full' | 'compact' })`: up to 1140 × 732 (`full`) or 576px wide (`compact`, a one-pane form); fills the screen below `sm`; `data-slot="popout"`, `@container/popout`.
  - `PopOutSteps({ title: string; subtitle?: string; steps: readonly string[]; current: number; reached: number; onStep: (index: number) => void })`: 0-based `current`; steps up to `reached` (other than the current one) are buttons; the current one has `aria-current="step"`. Its title names the dialog.
  - `PopOutBody({ title: string; subtitle?: string; step?: { current: number; total: number }; heading?: 'dialog' | 'question'; footer?: ReactNode; children: ReactNode })`: `heading="dialog"` (default) makes its title the dialog's name; a flow with `PopOutSteps` passes `heading="question"`.
  - `PopOutPreview({ title: string; subtitle?: string; children: ReactNode })`: an ink sheet.

- [ ] **Step 1: Write the failing pop-out tests**

Create `src/components/ui/pop-out.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { Button } from './button';
import { PopOut, PopOutBody, PopOutContent, PopOutPreview, PopOutSteps } from './pop-out';

const STEPS = ['Company', 'Bank', 'Card', 'Name', 'Colour', 'Billing', 'Done'];

function Flow({ onStep = vi.fn() }: { readonly onStep?: (index: number) => void }) {
  return (
    <PopOut open>
      <PopOutContent>
        <PopOutSteps
          title="Add a card"
          subtitle="Seven questions"
          steps={STEPS}
          current={2}
          reached={2}
          onStep={onStep}
        />
        <PopOutBody
          title="Which card is it?"
          subtitle="As printed on it"
          heading="question"
          step={{ current: 2, total: 7 }}
          footer={
            <>
              <Button variant="pill">Back</Button>
              <Button variant="pill-solid">Next</Button>
            </>
          }
        >
          <label>
            Card name
            <input />
          </label>
        </PopOutBody>
        <PopOutPreview title="Your card" subtitle="As it will look">
          <p>Preview</p>
        </PopOutPreview>
      </PopOutContent>
    </PopOut>
  );
}

beforeAll(async () => {
  await initTestI18n('en');
});

describe('PopOut (§6.2)', () => {
  it('is named by the flow’s title, from its steps', async () => {
    renderWithProviders(<Flow />);
    expect(await screen.findByRole('dialog', { name: /^Add a card/ })).toHaveAttribute('data-slot', 'popout');
  });

  it('puts steps, body and preview straight inside the layout grid, for the container rules to place', async () => {
    renderWithProviders(<Flow />);
    const popout = await screen.findByRole('dialog');
    expect(popout).toHaveClass('@container/popout');
    const layout = popout.querySelector('[data-slot="popout-layout"]');
    expect([...(layout?.children ?? [])].map((child) => child.getAttribute('data-slot'))).toEqual([
      'popout-steps',
      'popout-body',
      'popout-preview',
    ]);
  });

  it('marks the current step, makes the reached ones buttons, and leaves the rest alone', async () => {
    const onStep = vi.fn();
    renderWithProviders(<Flow onStep={onStep} />);
    const current = await screen.findByText('Card');
    expect(current.closest('[aria-current="step"]')).not.toBeNull();

    await userEvent.setup().click(screen.getByRole('button', { name: /Bank/ }));
    expect(onStep).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('button', { name: /Billing/ })).not.toBeInTheDocument();
  });

  it('says where you are in words, with the segments as decoration', async () => {
    renderWithProviders(<Flow />);
    expect(await screen.findByText('Step 3 of 7')).toBeInTheDocument();
  });

  it('asks the question as a title pair, with the actions at the body’s foot', async () => {
    renderWithProviders(<Flow />);
    expect(await screen.findByRole('heading', { name: 'Which card is it? As printed on it' })).toHaveClass(
      'text-title-question',
    );
    const actions = document.querySelector('[data-slot="popout-actions"]');
    expect(actions?.textContent).toBe('BackNext');
  });

  it('has a round × in the body and one in the preview: the layout shows the right one', async () => {
    renderWithProviders(<Flow />);
    await screen.findByRole('dialog');
    expect(document.querySelectorAll('[data-slot="popout-close"]')).toHaveLength(2);
  });

  it('keeps the answers when the number of panes changes: it is one popup', async () => {
    renderWithProviders(<Flow />);
    const user = userEvent.setup();
    const field = await screen.findByLabelText('Card name');
    await user.type(field, 'Max Gold');
    window.dispatchEvent(new Event('resize'));
    expect(screen.getByLabelText('Card name')).toBe(field);
    expect(field).toHaveValue('Max Gold');
  });

  it('moves only when motion is welcome', async () => {
    renderWithProviders(<Flow />);
    const popout = await screen.findByRole('dialog');
    for (const name of popout.className.split(/\s+/).filter((c) => c.includes('translate'))) {
      expect(name).toMatch(/motion-safe:/);
    }
  });

  it('caps a one-pane form at 36rem, and is named by its body', async () => {
    renderWithProviders(
      <PopOut open>
        <PopOutContent size="compact">
          <PopOutBody title="Split into payments">
            <p>form</p>
          </PopOutBody>
        </PopOutContent>
      </PopOut>,
    );
    const popout = await screen.findByRole('dialog', { name: 'Split into payments' });
    expect(popout).toHaveAttribute('data-size', 'compact');
    expect(popout).toHaveClass('sm:w-[min(36rem,100vw_-_4rem)]');
  });
});
```

Run: `pnpm exec vitest run --project dom src/components/ui/pop-out.test.tsx`
Expected: FAIL, "Failed to resolve import './pop-out'".

- [ ] **Step 2: `PopOut`**

Create `src/components/ui/pop-out.tsx`:

```tsx
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cn } from 'cn';
import { XIcon } from 'lucide-react';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { TitlePair } from '@/components/ui/title-pair';

/**
 * The pop-out (§6.2): a flow's centred window, built on the Base UI dialog,
 * one popup always.
 *
 * Below sm it fills the screen. From sm it is centred: up to 1140 by 732, on
 * the paper, with the dialog radius and the pop-out shadow over a blurred
 * scrim. It lays out by its OWN width (a size container named `popout`; the
 * grid rules are in index.css): one pane below 720px, steps and body from
 * 720px, steps, body and preview from 1040px. Missing areas collapse, and a
 * pop-out crossing a threshold keeps its step and its answers, because it is
 * the same popup.
 */
function PopOut(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

const SIZE = {
  full: 'sm:h-[min(45.75rem,100dvh_-_4rem)] sm:w-[min(71.25rem,100vw_-_4rem)]',
  // A one-pane pop-out caps its own width, so a short form never stretches (§6.3).
  compact:
    'sm:h-fit sm:max-h-[min(45.75rem,100dvh_-_4rem)] sm:w-[min(36rem,100vw_-_4rem)] sm:overflow-y-auto sm:overscroll-contain',
} as const;

function PopOutContent({
  size = 'full',
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props & { readonly size?: keyof typeof SIZE }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="popout-scrim"
        className="fixed inset-0 z-50 bg-scrim transition-opacity duration-(--dur-panel) data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-sm"
      />
      <DialogPrimitive.Popup
        data-slot="popout"
        data-size={size}
        className={cn(
          '@container/popout fixed inset-0 z-50 flex flex-col overflow-clip bg-background text-foreground outline-none',
          // An opacity fade for everyone; a short rise only when motion is welcome (§8.2).
          'transition-[opacity,translate] duration-(--dur-panel) ease-out data-ending-style:opacity-0 data-starting-style:opacity-0',
          'motion-safe:data-ending-style:translate-y-2 motion-safe:data-starting-style:translate-y-2',
          // From sm: centred by auto margins, which leaves `translate` free for the rise.
          'sm:rounded-dialog sm:m-auto sm:shadow-pop',
          SIZE[size],
          className,
        )}
        {...props}
      >
        <div data-slot="popout-layout">{children}</div>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function CloseButton() {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Close data-slot="popout-close" render={<Button variant="round" />}>
      <XIcon aria-hidden="true" />
      <span className="sr-only">{t('action.close')}</span>
    </DialogPrimitive.Close>
  );
}

/** The flow's title pair and its steps as an ordered list of pills; the reached ones go back. */
function PopOutSteps({
  title,
  subtitle,
  steps,
  current,
  reached,
  onStep,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly steps: readonly string[];
  /** 0-based. */
  readonly current: number;
  /** The furthest step answered so far, 0-based: every step up to it can be gone back to. */
  readonly reached: number;
  readonly onStep: (index: number) => void;
}) {
  const { t } = useTranslation();
  const row =
    'group flex min-h-11.5 w-full items-center gap-3 rounded-full ps-1.5 pe-3.5 text-start text-base font-light aria-[current=step]:bg-press aria-[current=step]:font-semibold aria-[current=step]:text-on-press';
  return (
    <section data-slot="popout-steps" className="flex-col gap-6 border-e-2 border-border px-6 pt-10 pb-7">
      <DialogPrimitive.Title render={<TitlePair as="h2" size="steps" title={title} subtitle={subtitle} />} />
      <ol aria-label={t('popout.steps')} className="flex flex-col gap-0.5">
        {steps.map((label, index) => {
          const content = (
            <>
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-current text-sm font-medium group-aria-[current=step]:border-primary group-aria-[current=step]:bg-primary group-aria-[current=step]:text-primary-foreground"
              >
                {index + 1}
              </span>
              <span>{label}</span>
            </>
          );
          return (
            <li key={label}>
              {index <= reached && index !== current ? (
                <button
                  type="button"
                  className={cn(row, 'hover-fine:bg-accent')}
                  onClick={() => {
                    onStep(index);
                  }}
                >
                  {content}
                </button>
              ) : (
                <span className={row} aria-current={index === current ? 'step' : undefined}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The progress segments and "Step 3 of 7": the words carry it, the segments are decoration. */
function Progress({ current, total }: { readonly current: number; readonly total: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="text-sm font-semibold">{t('popout.stepOf', { current: current + 1, total })}</p>
      <div
        aria-hidden="true"
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${String(total)}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: total }, (_, index) => (
          <i
            key={index}
            className={cn(
              'h-2 rounded-full',
              index <= current ? 'bg-primary' : 'inset-ring-2 inset-ring-border',
            )}
          />
        ))}
      </div>
    </div>
  );
}

/** The question, the controls, and Back and Next at the body's inline end. */
function PopOutBody({
  title,
  subtitle,
  step,
  heading = 'dialog',
  footer,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly step?: { readonly current: number; readonly total: number };
  /** 'dialog': this title names the pop-out. A flow with PopOutSteps passes 'question'. */
  readonly heading?: 'dialog' | 'question';
  readonly footer?: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  const question = <TitlePair as="h2" size="question" title={title} subtitle={subtitle} />;
  return (
    <section data-slot="popout-body" className="@container/popout-body flex min-h-0 flex-col">
      <header className="flex items-start gap-3 px-6 pt-6 sm:px-8 sm:pt-8">
        {step === undefined ? (
          <span className="flex-1" />
        ) : (
          <Progress current={step.current} total={step.total} />
        )}
        <CloseButton />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-4 pb-6 sm:px-8">
        {heading === 'dialog' ? <DialogPrimitive.Title render={question} /> : question}
        <div className="mt-6">{children}</div>
      </div>
      {footer === undefined ? null : (
        <footer
          data-slot="popout-actions"
          className="flex flex-wrap justify-end gap-2.5 border-t-2 border-border px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] *:min-w-37.5 sm:px-8"
        >
          {footer}
        </footer>
      )}
    </section>
  );
}

/** The live preview: an ink sheet inset 12px, with the round × in its corner when there is room for it. */
function PopOutPreview({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <aside
      data-slot="popout-preview"
      data-sheet="night"
      className="rounded-preview m-3 flex flex-col gap-4 p-7"
    >
      <div className="flex items-start justify-between gap-3">
        <TitlePair as="h3" size="steps" title={title} subtitle={subtitle} />
        <CloseButton />
      </div>
      {children}
    </aside>
  );
}

export { PopOut, PopOutBody, PopOutContent, PopOutPreview, PopOutSteps };
```

Run: `pnpm exec vitest run --project dom src/components/ui/pop-out.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 3: Split a purchase**

In `src/features/transaction/split-purchase.tsx`, replace line 11 with `import { PopOut, PopOutBody, PopOutContent } from '@/components/ui/pop-out';`, and replace the `return (` block of `SplitPurchaseSheet` (lines 50–67) with:

```tsx
return (
  // A one-pane pop-out over the panel (§6.3): a short form, capped at 36rem.
  <PopOut open={offer !== undefined} onOpenChange={onOpenChange}>
    <PopOutContent size="compact">
      <PopOutBody title={t('split.title')}>
        {offer === undefined ? null : (
          <SplitForm
            key={offer.occurrence.key}
            offer={offer}
            today={today}
            onDone={onDone}
            onCancel={() => {
              onOpenChange(false);
            }}
          />
        )}
      </PopOutBody>
    </PopOutContent>
  </PopOut>
);
```

Its Cancel and Split row stays inside the form. Mark it for the foot: line 194 `<div className="flex gap-2 pt-1">` → `<div data-slot="popout-actions" className="flex justify-end gap-2 pt-1">`.

- [ ] **Step 4: Reconvert the currency**

In `src/features/settings/reconvert-dialog.tsx`, replace line 10 with `import { PopOut, PopOutBody, PopOutContent } from '@/components/ui/pop-out';`. In the `return (`:

- `<Sheet` → `<PopOut` and the final `</Sheet>` → `</PopOut>` (the `open` and `onOpenChange` props, with the "never dismissible mid-flight" comment, stay as they are);
- replace the five lines from `<SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">` to `</SheetHeader>` with

```tsx
      <PopOutContent size="compact">
        <PopOutBody title={t('reconvert.title', { currency: target })} subtitle={t('reconvert.body')}>
```

- change the body's wrapper `<div className="space-y-4 px-4 pb-6">` to `<div className="space-y-4">` (the pop-out's body pads it);
- replace `</SheetContent>` with

```tsx
        </PopOutBody>
      </PopOutContent>
```

- [ ] **Step 5: Smart import**

Smart import gets its steps and its preview in phase 3h (§5.9). Here it moves into the full-size pop-out with its body only, its contents unchanged. In `src/features/import/import-sheet.tsx`:

- line 25: `import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';` → `import { PopOut, PopOutBody, PopOutContent } from '@/components/ui/pop-out';`
- line 154: delete `const titleId = useId();` (`useId` stays imported: four other components in the file use it).
- replace the block from `<Sheet` (line 472) to `</SheetHeader>` (line 491) with:

```tsx
    <PopOut
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <PopOutContent>
        <PopOutBody
          title={
            filling !== undefined
              ? t('import:fillTitle', { name: foundName(filling, i18n.language) })
              : editing === undefined
                ? t('import:title')
                : t('import:editTitle')
          }
          subtitle={editing === undefined && filling === undefined ? t('import:body') : undefined}
        >
```

- the body wrapper on the next line, `<div className="px-4 pb-4">`, becomes `<div className="pb-4">`;
- after that wrapper's closing `</div>` (line 626), add `</PopOutBody>`, so the `<AlertDialog>` that follows sits beside the body inside `PopOutContent`;
- replace `</SheetContent>` and `</Sheet>` (lines 648–649) with `</PopOutContent>` and `</PopOut>`.

Run: `pnpm exec prettier --write src/features/transaction/split-purchase.tsx src/features/settings/reconvert-dialog.tsx src/features/import/import-sheet.tsx && pnpm typecheck && pnpm exec vitest run --project dom src/features/transaction/split-purchase.test.tsx src/features/import src/features/settings`
Expected: PASS. Split's own tests still find "Split this purchase" by role heading, and import's tests find their rows by role.

Check: `grep -rn "components/ui/sheet'" src/features` prints nothing (with Task 10 merged).

- [ ] **Step 6: The pop-out in a browser**

Create `e2e/19-popout.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { completeFirstRun } from './support/seed';
import { LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * The pop-out's size and place (§6.2): the whole screen on a phone; from sm,
 * centred at up to 1140 by 732, with 2rem of the page showing round it.
 * Smart import is reachable without an account by its address (?import=1).
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and language are set explicitly.');
});

for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`@popout ${String(width)} ${lang}`, () => {
      test.use({ viewport: viewportFor(width), locale });

      test('Smart import opens as the pop-out, sized and centred', async ({ page }) => {
        await completeFirstRun(page, lang, { demo: false });
        await page.goto('/?import=1');

        const popout = page.locator('[data-slot="popout"]');
        await expect(popout).toBeVisible();
        const box = await popout.boundingBox();
        expect(box).not.toBeNull();
        if (box === null) return;

        const { height } = viewportFor(width);
        if (width < 640) {
          expect(box.x).toBeLessThanOrEqual(1);
          expect(box.y).toBeLessThanOrEqual(1);
          expect(box.width).toBeGreaterThanOrEqual(width - 1);
          expect(box.height).toBeGreaterThanOrEqual(height - 1);
        } else {
          const w = Math.min(1140, width - 64);
          const h = Math.min(732, height - 64);
          expect(box.width).toBeCloseTo(w, 0);
          expect(box.height).toBeCloseTo(h, 0);
          expect(box.x).toBeCloseTo((width - w) / 2, 0);
          expect(box.y).toBeCloseTo((height - h) / 2, 0);
        }

        await page.keyboard.press('Escape');
        await expect(popout).toHaveCount(0);
      });
    });
  }
}
```

Run: `pnpm exec playwright test e2e/19-popout.spec.ts`
Expected: PASS.

- [ ] **Step 7: Look, then the gate, and commit**

`pnpm dev` at 1440: open `/?import=1`, Settings → Preferences → change the currency (the reconvert pop-out), and a card purchase's ⋯ → Split into payments. Each is a centred window on a blurred, dimmed page; Escape closes it; at 390 it fills the screen. Then `pnpm verify`.
Expected: exit 0.

```bash
git add src/components/ui/pop-out.tsx src/components/ui/pop-out.test.tsx src/features/transaction/split-purchase.tsx src/features/settings/reconvert-dialog.tsx src/features/import/import-sheet.tsx e2e/19-popout.spec.ts
git commit -m "Flows open as a centred pop-out that lays itself out by its own width, and splitting a purchase, reconverting the currency and Smart import move into it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The shell: the rail, the tab bar, `main` as a container, Add on every desktop screen, route transitions

**Files:**

- Modify: `src/app/routes.ts` (append) and `src/app/routes.test.tsx`
- Create: `src/app/use-desktop.ts`, `src/app/shell-editors.tsx`
- Modify: `src/app/app-shell.tsx` (replaced) and `src/app/app-shell.test.tsx` (replaced)
- Modify: `src/features/account/user-menu.tsx:38-75` and `user-menu.test.tsx`
- Modify: `src/features/feed/add-menu.tsx` and `add-menu.test.tsx`; `src/components/add-button.tsx` and `add-button.test.tsx`
- Modify: `src/app/toaster.tsx:17-30`, `src/features/summary/collapsed-bar.tsx:116-122`
- Modify: `e2e/support/add.ts`, `e2e/00-shell.spec.ts:115-121,335-410`, `e2e/08-polish.spec.ts:700,722,747,913`
- Create: `e2e/20-shell.spec.ts`

**Interfaces:**

- Consumes (Task 9): `AppMark`, `Button` `pill-solid`, `--tab-bar-h`, the `nav` and `main` view-transition names and the `data-nav-dir` slide rules, `nav.bankAccounts|categories|commitments`. Existing: `useTransactionSheet()` (`openAdd(kind)`, `openImport()`, `target`, `setOpen`, `close`, `openImportRow`, `openImportCard`), `useFeedLookups()`, `useIncomeHistory(today)`, `TransactionSheet`, `ImportSheet`, `useAccount()`.
- Produces:
  - `src/app/routes.ts`: `type RailPlace = { readonly key: 'feed' | 'chart' | 'cards' | 'bankAccounts' | 'cash' | 'categories' | 'commitments' | 'settings'; readonly to: string; readonly phone: boolean }`; `RAIL_PLACES: readonly RailPlace[]` (feed, chart, cards, bankAccounts, cash); `RAIL_SETUP: readonly RailPlace[]` (categories, commitments, settings); `navDirection(from: string, to: string): 'forward' | 'back'`.
  - `src/app/use-desktop.ts`: `useMediaQuery(query: string): boolean`, `useDesktop(): boolean` (`(min-width: 64rem)`).
  - `src/app/shell-editors.tsx`: `ShellEditors()`.
  - `UserMenu({ placement?: 'head' | 'rail' })` (default `'head'`).
  - `AddMenu({ placement?: 'floating' | 'rail', … })`: `'floating'` renders nothing from `lg`; `'rail'` renders a full-width solid pill with `data-testid="rail-add"`.
  - DOM: `<main id="main">` has `@container/main`; its child `[data-slot="content-box"]` is at most 1680px with 24px padding from `lg`.
  - `e2e/support/add.ts`: `addTrigger(page: Page): Locator` (the rail's Add from 1024, the floating pill below).

- [ ] **Step 1: Write the failing route and shell tests**

Add to `src/app/routes.test.tsx` (and add `navDirection, RAIL_PLACES, RAIL_SETUP` to its import from `./routes`):

```ts
describe('the rail (§4.2)', () => {
  it('lists the places in the phone’s order with Bank accounts after Cards, then the set-up places', () => {
    expect(RAIL_PLACES.map((place) => place.key)).toEqual(['feed', 'chart', 'cards', 'bankAccounts', 'cash']);
    expect(RAIL_SETUP.map((place) => place.key)).toEqual(['categories', 'commitments', 'settings']);
  });

  it('keeps the phone’s four tabs exactly (decision 27)', () => {
    expect(RAIL_PLACES.filter((place) => place.phone).map((place) => place.key)).toEqual(NAV_ORDER);
    expect(RAIL_SETUP.some((place) => place.phone)).toBe(false);
  });

  it('tells forward from back by rail order, a settings page by its section', () => {
    expect(navDirection('/', '/chart')).toBe('forward');
    expect(navDirection('/cash', '/cards')).toBe('back');
    expect(navDirection('/settings/account', '/categories')).toBe('back');
    // From a page that is not a place (an invitation link), every place is ahead.
    expect(navDirection('/link', '/chart')).toBe('forward');
  });
});
```

Replace `src/app/app-shell.test.tsx` with:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { AppShell } from './app-shell';
import { SettingsProvider } from './settings-provider';

const INSTANT = instantFromMs(Date.parse('2026-09-15T10:00:00.000Z'));
const SETTINGS = { ...DEFAULT_SETTINGS, updatedAt: INSTANT };

function renderShell() {
  return renderWithProviders(
    <SettingsProvider value={SETTINGS}>
      <AppShell />
    </SettingsProvider>,
  );
}

/** A place's label: its first span, without a count or "(current)". */
const label = (link: HTMLElement) => link.querySelector('span')?.textContent ?? '';
const places = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('link')
    .filter((link) => link.querySelector('[data-slot="app-mark"]') === null);

describe('AppShell (§4)', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('is one primary navigation: the rail’s places, four of them the phone’s tabs', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    // Where anchored pop-outs find the phone's tab bar, to keep clear of it.
    expect(nav).toHaveAttribute('data-slot', 'tab-bar');
    expect(places(nav).map(label)).toEqual([
      'Feed',
      'Chart',
      'Cards',
      'Bank accounts',
      'Cash',
      'Categories',
      'Commitments',
      'Settings',
    ]);
    expect(
      places(nav)
        .filter((link) => !link.classList.contains('hidden'))
        .map(label),
    ).toEqual(['Feed', 'Chart', 'Cards', 'Cash']);
  });

  it('draws text pills with no icons, the current one filled with ink', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav.querySelectorAll('a svg')).toHaveLength(0);
    const feed = screen.getByRole('link', { name: /^Feed/ });
    expect(feed).toHaveAttribute('aria-current', 'page');
    expect(feed).toHaveClass(
      'aria-[current=page]:bg-press',
      'aria-[current=page]:text-on-press',
      'min-h-11',
      'lg:min-h-12',
    );
  });

  it('keeps the account menu at the rail’s foot, and account linking out of the places', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('button', { name: /Account and settings/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Household|Account linking/ })).not.toBeInTheDocument();
  });

  it('makes main a size container, with a content box of at most 1680px and no pad on the far side', () => {
    renderShell();
    const main = screen.getByRole('main');
    expect(main).toHaveClass('@container/main', 'lg:ps-64');
    expect(main.className).not.toMatch(/pe-56/);
    expect(main.querySelector('[data-slot="content-box"]')).toHaveClass(
      'mx-auto',
      'max-w-[105rem]',
      'lg:p-6',
    );
  });

  it('puts Add at the top of the rail on a desktop, and nowhere in the bar on a phone', () => {
    const { unmount } = renderShell();
    expect(screen.queryByTestId('rail-add')).not.toBeInTheDocument();
    unmount();

    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === '(min-width: 64rem)',
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    renderShell();
    expect(screen.getByTestId('rail-add')).toHaveAccessibleName('Add');
  });

  it('marks which way a move goes, for the route transition', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('link', { name: /^Chart/ }));
    expect(document.documentElement).toHaveAttribute('data-nav-dir', 'forward');
    await user.click(screen.getByRole('link', { name: /^Feed/ }));
    expect(document.documentElement).toHaveAttribute('data-nav-dir', 'back');
  });

  it('exposes a main landmark and a skip link', () => {
    renderShell();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
  });

  it('renders Hebrew strings when the language is he', async () => {
    await initTestI18n('he');
    renderShell();
    expect(screen.getByRole('navigation', { name: 'ניווט ראשי' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^חשבונות בנק/ })).toBeInTheDocument();
    await initTestI18n('en');
  });
});
```

Run: `pnpm exec vitest run --project dom src/app/routes.test.tsx src/app/app-shell.test.tsx`
Expected: FAIL: `RAIL_PLACES` does not exist, and the shell has four links and an engraved rail.

- [ ] **Step 2: The rail's places and their order**

Append to `src/app/routes.ts`:

```ts
/** A place in the desktop rail; `phone` marks the four that are the phone's tabs. */
export type RailPlace = {
  readonly key:
    'feed' | 'chart' | 'cards' | 'bankAccounts' | 'cash' | 'categories' | 'commitments' | 'settings';
  readonly to: string;
  readonly phone: boolean;
};

/**
 * The rail's places (§4.2): the phone's tabs in their order, with Bank
 * accounts after Cards. The rail lists places only; Add is a button at its
 * top (decision 28), because a nav that mixes links and actions is harder to
 * use with a screen reader.
 */
export const RAIL_PLACES: readonly RailPlace[] = [
  { key: 'feed', to: ROUTES.feed, phone: true },
  { key: 'chart', to: ROUTES.chart, phone: true },
  { key: 'cards', to: ROUTES.cards, phone: true },
  { key: 'bankAccounts', to: LINKED_ROUTES.bankAccounts, phone: false },
  { key: 'cash', to: ROUTES.cash, phone: true },
];

/** The set-up places, below a line: on the desktop rail only (decision 27). */
export const RAIL_SETUP: readonly RailPlace[] = [
  { key: 'categories', to: LINKED_ROUTES.categories, phone: false },
  { key: 'commitments', to: LINKED_ROUTES.commitments, phone: false },
  { key: 'settings', to: ROUTES.settings, phone: false },
];

/**
 * Which way a move between two places goes, in rail order, for the route
 * transition's slide (§8.2). A settings page counts as Settings; a page that
 * is no place at all counts as before the first.
 */
export function navDirection(from: string, to: string): 'forward' | 'back' {
  const order = [...RAIL_PLACES, ...RAIL_SETUP].map((place) => place.to);
  const index = (path: string) =>
    order.findIndex((place) => place === path || (place !== ROUTES.feed && path.startsWith(`${place}/`)));
  return index(to) < index(from) ? 'back' : 'forward';
}
```

- [ ] **Step 3: `lg` in JS, for what CSS cannot do**

Create `src/app/use-desktop.ts`:

```ts
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a media query matches now, kept current.
 *
 * For what CSS cannot do: rendering one control instead of another. Layout
 * itself stays in CSS (container queries on main), never in this.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/** The desktop layout (§4.1): from lg, 1024px, where the rail starts. */
export function useDesktop(): boolean {
  return useMediaQuery('(min-width: 64rem)');
}
```

- [ ] **Step 4: The editors on screens that host none (Review Focus)**

Create `src/app/shell-editors.tsx`:

```tsx
import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';

import { useFeedLookups } from '@/features/feed/use-feed-data';
import { TransactionSheet } from '@/features/transaction/transaction-sheet';
import { useIncomeHistory } from '@/features/transaction/use-income-history';
import { useTransactionSheet } from '@/features/transaction/use-transaction-sheet';

import { useSettings, useToday } from './app-context';
import { ROUTES } from './routes';

const ImportSheet = lazy(() =>
  import('@/features/import/import-sheet').then((m) => ({ default: m.ImportSheet })),
);

/** Screens that mount the add-and-edit editor themselves, with their own reaction to a save. */
const OWN_TRANSACTION_EDITOR: ReadonlySet<string> = new Set([ROUTES.feed, ROUTES.cash]);
/** Screens that mount Smart import themselves. */
const OWN_IMPORT: ReadonlySet<string> = new Set([ROUTES.feed]);

/**
 * The add and import editors on every other screen (§4.2).
 *
 * From lg, Add is in the rail on every screen, and its panel opens over
 * whatever screen is there: a save from Cards leaves the person on Cards.
 * The editors are driven by the address (?add=, ?edit=, ?import=), as on the
 * feed, so the rail's Add only writes the address and whichever editor the
 * screen has picks it up. Feed and Cash mount their own, so they are skipped.
 */
export function ShellEditors() {
  const { pathname } = useLocation();
  const sheet = useTransactionSheet();
  const lookups = useFeedLookups();
  const settings = useSettings();
  const today = useToday();
  const incomeHistory = useIncomeHistory(today);

  if (lookups === undefined) return null;
  const categories = [...lookups.categories.values()];
  const paymentMethods = [...lookups.paymentMethods.values()];

  return (
    <>
      {OWN_TRANSACTION_EDITOR.has(pathname) ? null : (
        <TransactionSheet
          target={sheet.target}
          onOpenChange={sheet.setOpen}
          profiles={lookups.profiles}
          categories={categories}
          paymentMethods={paymentMethods}
          activeProfileId={settings.activeProfileId}
          baseCurrency={settings.defaultCurrency}
          today={today}
          incomeHistory={incomeHistory}
          onSaved={() => {
            sheet.close();
          }}
        />
      )}
      {OWN_IMPORT.has(pathname) || sheet.target.mode !== 'import' ? null : (
        <Suspense fallback={null}>
          <ImportSheet
            target={sheet.target}
            onOpenChange={sheet.setOpen}
            onOpenRow={sheet.openImportRow}
            onOpenCard={sheet.openImportCard}
            profiles={lookups.profiles}
            categories={categories}
            paymentMethods={paymentMethods}
            activeProfileId={settings.activeProfileId}
            baseCurrency={settings.defaultCurrency}
            today={today}
            onSaved={() => {
              sheet.close();
            }}
          />
        </Suspense>
      )}
    </>
  );
}
```

- [ ] **Step 5: Add in the rail; the phone's pill restyled**

In `src/features/feed/add-menu.tsx`:

- add imports: `import { Plus } from 'lucide-react';` (into the existing lucide import), `import { useDesktop } from '@/app/use-desktop';` and `import { Button } from '@/components/ui/button';`;
- replace `AddMenu`'s signature and body with:

```tsx
export function AddMenu({
  placement = 'floating',
  disabled,
  aiAvailable,
  onAdd,
  onAddWithAi,
}: {
  /** 'floating': the phone's pill, above the tab bar. 'rail': the solid pill at the top of the desktop rail. */
  readonly placement?: 'floating' | 'rail';
  readonly disabled: boolean;
  /** False in a build without accounts: reading a file needs the account's server. */
  readonly aiAvailable: boolean;
  readonly onAdd: (kind: Kind) => void;
  readonly onAddWithAi: () => void;
}) {
  const { t } = useTranslation();
  const desktop = useDesktop();
  // From lg, Add is in the rail on every screen (§4.2): the floating pill is the phone's.
  if (placement === 'floating' && desktop) return null;
  const rail = placement === 'rail';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={rail ? <Button variant="pill-solid" data-testid="rail-add" className="w-full" /> : <AddButton />}
        disabled={disabled}
      >
        {rail ? (
          <>
            {/* Plus is non-directional: it must NOT carry rtl:rotate-180. */}
            <Plus aria-hidden="true" />
            {t('addMenu.add')}
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={rail ? 'bottom' : 'top'}
        align={rail ? 'start' : 'center'}
        sideOffset={10}
        className="w-72 p-1.5"
        data-testid="add-menu"
      >
```

keeping the three `AddItem`s, the separator and the closing tags as they are. `AddMenu`'s doc comment gains one line: "On a desktop the same menu hangs from the rail's Add."

Add to `src/features/feed/add-menu.test.tsx`:

```ts
it('draws the rail’s Add as a full-width solid pill', () => {
  renderMenu({ placement: 'rail' });
  const add = screen.getByTestId('rail-add');
  expect(add).toHaveAccessibleName('Add');
  expect(add).toHaveClass('bg-primary', 'min-h-12', 'w-full');
});
```

In `src/components/add-button.tsx`, replace the class lines from `'h-12 px-5 text-base font-semibold shadow-lg shadow-brand-deep/30',` to `'bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+1rem)]',` with:

```tsx
        'h-12 px-5 text-base font-semibold shadow-lg shadow-ink/20',
        // The solid sapphire pill (§9.6): the app's own action, filled with ink on a fine pointer's hover.
        'border-2 border-primary bg-primary text-primary-foreground',
        'transition-[background-color,border-color,color,scale] duration-(--dur-press) ease-fill',
        'hover-fine:border-ink hover-fine:bg-ink hover-fine:text-paper motion-safe:active:scale-[0.96]',
        'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        // Phone: centred. `start-0 end-0` with `mx-auto` and a max-content
        // width centres a fixed element of any label length.
        'start-0 end-0 mx-auto w-max',
        'bottom-[calc(var(--tab-bar-h)+env(safe-area-inset-bottom,0px)+1rem)]',
```

and change its doc comment's second paragraph to: "Bottom-centre above the tab bar on a phone. From `lg` the feed's Add is in the rail; the Cash screen's own Add sits at the bottom-inline-end corner. Both offsets add the safe-area inset."

In `src/components/add-button.test.tsx`, change the first test's assertions to:

```ts
expect(button).toHaveClass('h-12', 'px-5', 'rounded-full', 'bg-primary', 'text-primary-foreground');
// It fills with ink on a fine pointer's hover, and presses only when motion is welcome.
expect(button).toHaveClass('hover-fine:bg-ink', 'motion-safe:active:scale-[0.96]');
```

and rename it to `'is a labelled solid sapphire pill, 48px high'`.

- [ ] **Step 6: The account menu on paper, in two places**

In `src/features/account/user-menu.tsx`, change the signature to `export function UserMenu({ placement = 'head' }: { readonly placement?: 'head' | 'rail' })`, add `const shown = name ?? email;` after the `useAccountAvatar()` line, and replace the `<DropdownMenuTrigger …>…</DropdownMenuTrigger>` and the `<DropdownMenuContent …>` opening tag with:

```tsx
        <DropdownMenuTrigger
          // The head's is a picture, so it is named; the rail's shows the name, so its visible text is in its name.
          {...(placement === 'head' ? { 'aria-label': t('menu.label') } : {})}
          className={
            placement === 'rail'
              ? 'flex min-h-14 w-full items-center gap-3 rounded-full px-3 text-start text-[0.9375rem] font-light hover-fine:bg-accent focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring'
              : '-me-1.5 flex size-11 items-center justify-center rounded-full focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring'
          }
        >
          <AccountAvatar size={placement === 'rail' ? 36 : 34} className="shrink-0 ring-2 ring-border" />
          {placement === 'rail' ? (
            shown === undefined ? (
              <span>{t('menu.label')}</span>
            ) : (
              <>
                <span className="sr-only">{t('menu.label')}</span>
                <span className="min-w-0 truncate">{shown}</span>
              </>
            )
          ) : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={placement === 'rail' ? 'top' : 'bottom'}
          align={placement === 'rail' ? 'start' : 'end'}
          sideOffset={8}
          className="w-72 p-1.5"
        >
```

The head's white ring and white focus ring were for the sapphire panel; both now sit on the paper. The linked people's avatars at the rail's foot (§4.2) come with Settings in phase 3g; this shows the signed-in account.

Add to `src/features/account/user-menu.test.tsx`:

```ts
describe('the account menu in the rail', () => {
  it('shows who is signed in, with the menu’s name kept for screen readers', async () => {
    vi.spyOn(controller, 'getView').mockReturnValue(signedIn);
    renderWithProviders(
      <SettingsProvider value={{ ...DEFAULT_SETTINGS, updatedAt: INSTANT }}>
        <UserMenu placement="rail" />
      </SettingsProvider>,
    );
    const trigger = await screen.findByRole('button', { name: /Account and settings/ });
    expect(trigger).toHaveTextContent('Dana Levi');
    expect(trigger).toHaveClass('w-full', 'min-h-14');
  });

  it('opens upward from the rail’s foot', async () => {
    vi.spyOn(controller, 'getView').mockReturnValue(signedIn);
    renderWithProviders(
      <SettingsProvider value={{ ...DEFAULT_SETTINGS, updatedAt: INSTANT }}>
        <UserMenu placement="rail" />
      </SettingsProvider>,
    );
    await userEvent.setup().click(await screen.findByRole('button', { name: /Account and settings/ }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: The shell**

Replace `src/app/app-shell.tsx` with:

```tsx
import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { AppMark } from '@/components/app-mark';
import { db } from '@/db/db';
import { UserMenu } from '@/features/account/user-menu';
import { AddMenu } from '@/features/feed/add-menu';
import { useTransactionSheet } from '@/features/transaction/use-transaction-sheet';

import { useAccount } from './account';
import { navDirection, RAIL_PLACES, RAIL_SETUP, ROUTES, type RailPlace } from './routes';
import { ShellEditors } from './shell-editors';
import { Toaster } from './toaster';
import { useDesktop, useMediaQuery } from './use-desktop';
import { useReturnToInvite } from './use-return-to-invite';
import { useWipeNotice } from './use-wipe-notice';

/**
 * A place as a text pill, no icon (§4.2, decision 29): 44px on the phone's
 * tab bar, 48px in the rail. The current one is filled with ink and set in
 * weight 600, and says "(current)" to a screen reader.
 */
const PILL = cn(
  'flex min-h-11 items-center justify-center gap-2 rounded-full px-2 text-[0.84375rem]',
  'ease-fill hover-fine:bg-accent transition-[background-color,color] duration-(--dur-press)',
  'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring',
  'aria-[current=page]:bg-press aria-[current=page]:font-semibold aria-[current=page]:text-on-press',
  'lg:min-h-12 lg:justify-between lg:px-4.5 lg:text-[1.0625rem]',
);

/** How many cards and bank accounts there are, shown beside their places in weight 300. */
function useRailCounts(): Partial<Record<RailPlace['key'], number>> {
  return (
    useLiveQuery(async () => {
      const methods = await db.paymentMethods.filter((method) => method.isArchived === 0).toArray();
      return {
        cards: methods.filter((method) => method.type === 'credit_card').length,
        bankAccounts: methods.filter((method) => method.type === 'bank_account').length,
      };
    }, []) ?? {}
  );
}

function Place({
  place,
  count,
  reduced,
}: {
  readonly place: RailPlace;
  readonly count?: number;
  readonly reduced: boolean;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <NavLink
      to={place.to}
      end={place.to === ROUTES.feed}
      // Same-document view transitions (§8.2), skipped when motion is reduced.
      viewTransition={!reduced}
      onClick={() => {
        document.documentElement.setAttribute('data-nav-dir', navDirection(pathname, place.to));
      }}
      className={cn(PILL, !place.phone && 'hidden lg:flex')}
    >
      {({ isActive }) => (
        <>
          <span className="min-w-0 text-center lg:text-start">{t(`nav.${place.key}` as const)}</span>
          {count === undefined ? null : (
            <span aria-hidden="true" className="hidden shrink-0 text-sm font-light lg:inline">
              {count}
            </span>
          )}
          {isActive ? <span className="sr-only">(current)</span> : null}
        </>
      )}
    </NavLink>
  );
}

/** Add, at the top of the rail on every desktop screen (§4.2). */
function RailAdd() {
  const sheet = useTransactionSheet();
  const account = useAccount();
  const people = useLiveQuery(() => db.profiles.count(), []);
  return (
    <div className="mb-5 hidden lg:block">
      <AddMenu
        placement="rail"
        // A transaction belongs to a profile: with none, the form has nothing to submit.
        disabled={(people ?? 0) === 0}
        aiAvailable={account.status !== 'unavailable'}
        onAdd={(kind) => {
          sheet.openAdd(kind);
        }}
        onAddWithAi={() => {
          sheet.openImport();
        }}
      />
    </div>
  );
}

/**
 * ONE nav element with responsive classes, not two copies behind `lg:hidden`
 * / `hidden lg:flex`: two copies double the aria-current bookkeeping, and
 * screen readers see both.
 *
 * Phone: four text pills across the bottom, on the paper. From lg: the rail
 * at the inline start, 256px, with a 2px line at its inline end - the mark,
 * Add, the places, a line, the set-up places, and the account menu at the foot.
 */
function PrimaryNav() {
  const { t } = useTranslation();
  const desktop = useDesktop();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const counts = useRailCounts();
  return (
    <nav
      aria-label={t('nav.primary')}
      // Anchored pop-outs keep clear of it on a phone (`useCollisionPadding`).
      data-slot="tab-bar"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-0.5 border-t-2 border-border bg-background',
        'pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]',
        'ps-[max(0.625rem,env(safe-area-inset-left,0px))] pe-[max(0.625rem,env(safe-area-inset-right,0px))]',
        'lg:inset-y-0 lg:start-0 lg:end-auto lg:flex lg:w-64 lg:flex-col lg:gap-1 lg:overflow-y-auto lg:overscroll-contain',
        'lg:border-e-2 lg:border-t-0 lg:bg-transparent lg:px-4.5 lg:pt-7 lg:pb-5.5',
      )}
    >
      {/* The mark goes home. A Link, not a NavLink: the Feed place already says where you are. */}
      <Link
        to={ROUTES.feed}
        viewTransition={!reduced}
        className="mb-5.5 hidden min-h-12 items-center rounded-full px-2.5 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring lg:flex"
      >
        <AppMark />
      </Link>

      {desktop ? <RailAdd /> : null}

      {RAIL_PLACES.map((place) => (
        <Place
          key={place.key}
          place={place}
          reduced={reduced}
          count={place.key === 'cards' || place.key === 'bankAccounts' ? counts[place.key] : undefined}
        />
      ))}
      <div aria-hidden="true" className="my-3 hidden h-0.5 shrink-0 bg-border lg:block" />
      {RAIL_SETUP.map((place) => (
        <Place key={place.key} place={place} reduced={reduced} />
      ))}

      <div className="mt-auto hidden pt-3 lg:block">
        <UserMenu placement="rail" />
      </div>
    </nav>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  useReturnToInvite();
  useWipeNotice();

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only rounded-lg bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:ring-2"
      >
        {t('a11y.skipToContent')}
      </a>

      <PrimaryNav />

      {/*
        main is a size container (§4.3): screens lay out by the room they
        really have, with @board/main:, @wide/main: and @vast/main: variants,
        never viewport ones. No pad on the far side: content fills main up to
        1680px, centred, with 24px round it.
      */}
      <main
        id="main"
        tabIndex={-1}
        className="@container/main pb-[calc(var(--tab-bar-h)+env(safe-area-inset-bottom,0px))] lg:ps-64 lg:pb-0"
      >
        <div data-slot="content-box" className="mx-auto max-w-[105rem] lg:p-6">
          <Outlet />
        </div>
      </main>

      {/* The add and import editors for screens that host none: the rail's Add works on every screen. */}
      <ShellEditors />

      {/* At shell level, so a toast raised on the feed survives navigating
          away - the undo is still valid wherever the user has gone. */}
      <Toaster />
    </div>
  );
}
```

- [ ] **Step 8: What clears the new rail and tab bar**

In `src/app/toaster.tsx`, change the comment's last sentence to "`--tab-bar-h` of tab bar, plus the Add pill's 3rem and its gap, plus the home-indicator inset." and the prop to `mobileOffset={{ bottom: 'calc(var(--tab-bar-h) + 4.5rem + env(safe-area-inset-bottom, 0px))' }}`.

In `src/features/summary/collapsed-bar.tsx` (lines 116–122), replace `'fixed inset-x-0 top-0 z-30 bg-brand-deep text-brand-deep-foreground shadow-md',` with `'fixed inset-x-0 top-0 z-30 bg-night text-on-night shadow-md',` and `'lg:ps-56 xl:pe-56',` with `'lg:ps-64',`, and update the comment above it to "…which clears the 256px desktop rail…". The bar's own texts are `text-brand-deep-foreground/80` near-white, which reads on the ink in both themes.

Run: `pnpm exec vitest run --project dom src/app src/features/feed/add-menu.test.tsx src/components/add-button.test.tsx src/features/account/user-menu.test.tsx`
Expected: PASS.

- [ ] **Step 9: The browser specs**

In `e2e/support/add.ts`, add `import type { Locator } from '@playwright/test';` beside the existing import, and:

```ts
/** The Add trigger a person sees: the rail's from 1024 (§4.2), the floating pill below. */
export function addTrigger(page: Page): Locator {
  return page.getByTestId((page.viewportSize()?.width ?? 0) >= 1024 ? 'rail-add' : 'add-button');
}
```

and change `openAddSheet`'s first line to `await addTrigger(page).click();`.

In `e2e/00-shell.spec.ts`:

- import `addTrigger` from `./support/add` beside `openAddSheet`;
- replace the test `'has four tabs: account linking is a page in Settings, not a tab'` with:

```ts
test('has four tabs on a phone and eight places on the desktop rail; account linking is neither', async ({
  page,
}) => {
  const nav = page.getByRole('navigation', { name: /primary|ניווט/i });
  // The rail's mark is a link home too, shown only on a wide screen.
  const places = nav.getByRole('link').filter({ hasNotText: 'Bookandry' });
  await expect(places).toHaveCount((page.viewportSize()?.width ?? 0) >= 1024 ? 8 : 4);
  await expect(nav.getByRole('link', { name: /household|account linking|משק|קישור/i })).toHaveCount(0);
});
```

- in `@fab the Add pill`: in `'renders as a labelled pill, at least 44px high'` change `page.getByTestId('add-button')` to `addTrigger(page)`; in `'offers an expense, income or Smart import…'` change `await page.getByTestId('add-button').click();` to `await addTrigger(page).click();`; and replace `'is centred on mobile, inline-end from lg, and mirrors only where it can'` with:

```ts
test('is centred above the tab bar on a phone, and at the top of the rail from lg', async ({ page }) => {
  /*
   * Two places by design (§4.2): bottom-centre above the tab bar on a phone,
   * the top of the rail from lg - at the inline start, so on the right in
   * Hebrew. The centred case depends on `start-0 end-0 mx-auto`, which has
   * regressed once to a class that emits no CSS at all.
   */
  const viewport = page.viewportSize()!;
  const centre = viewport.width / 2;
  const isDesktop = viewport.width >= 1024;

  const ltr = (await addTrigger(page).boundingBox())!;
  if (isDesktop) expect(ltr.x + ltr.width).toBeLessThanOrEqual(256);
  else expect(ltr.x + ltr.width / 2).toBeCloseTo(centre, 0);

  await page.addInitScript(() => {
    localStorage.setItem('gb.boot', JSON.stringify({ lang: 'he', theme: 'light' }));
  });
  await page.reload();

  const rtl = (await addTrigger(page).boundingBox())!;
  if (isDesktop) expect(rtl.x).toBeGreaterThanOrEqual(viewport.width - 256);
  else expect(rtl.x + rtl.width / 2).toBeCloseTo(centre, 0);
});
```

In `e2e/08-polish.spec.ts`, import `addTrigger` beside `ADD_EXPENSE, openAddSheet`, and:

- line 700: `if (focused.testid === 'add-button') {` → `if (focused.testid === 'add-button' || focused.testid === 'rail-add') {`
- line 722: `const fab = page.getByTestId('add-button');` → `const fab = addTrigger(page);`
- line 747: `await page.getByTestId('add-button').focus();` → `await addTrigger(page).focus();`
- line 913: `() => page.getByTestId('add-button').click()` → `() => addTrigger(page).click()`

Create `e2e/20-shell.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';

import { ADD_EXPENSE, addTrigger } from './support/add';
import { completeFirstRun } from './support/seed';
import { LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * The shell (§4): four text pills on a phone; from lg, the rail with Add, the
 * places and the account menu, and main filling the window less the rail.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and language are set explicitly.');
});

const NAV = /^(Primary|ניווט ראשי)$/;
const PLACES = {
  en: ['Feed', 'Chart', 'Cards', 'Bank accounts', 'Cash', 'Categories', 'Commitments', 'Settings'],
  he: ['תנועות', 'תרשים', 'כרטיסים', 'חשבונות בנק', 'מזומן', 'קטגוריות', 'התחייבויות', 'הגדרות'],
} as const;
const TABS = { en: ['Feed', 'Chart', 'Cards', 'Cash'], he: ['תנועות', 'תרשים', 'כרטיסים', 'מזומן'] } as const;
const ACCOUNT = /^(Account and settings|חשבון והגדרות)/;

/** The visible places' labels, in order: the first span of each link, without the mark. */
async function placeNames(page: Page): Promise<string[]> {
  return page
    .getByRole('navigation', { name: NAV })
    .getByRole('link')
    .evaluateAll((links) =>
      links
        .filter((link) => link.querySelector('[data-slot="app-mark"]') === null)
        .map((link) => (link.querySelector('span')?.textContent ?? '').trim()),
    );
}

for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`@shell ${String(width)} ${lang}`, () => {
      test.use({ viewport: viewportFor(width), locale });

      test('four tabs on a phone; the rail with Add, the places and the account from lg', async ({
        page,
      }) => {
        await completeFirstRun(page, lang);
        const nav = page.getByRole('navigation', { name: NAV });

        if (width < 1024) {
          expect(await placeNames(page)).toEqual(TABS[lang]);
          const bar = (await nav.boundingBox())!;
          expect(bar.y + bar.height).toBeCloseTo(viewportFor(width).height, 0);
          for (const link of await nav.getByRole('link').all()) {
            expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          }
          await expect(page.getByTestId('rail-add')).toHaveCount(0);
          await expect(page.getByTestId('add-button')).toBeVisible();
        } else {
          expect(await placeNames(page)).toEqual(PLACES[lang]);
          const rail = (await nav.boundingBox())!;
          expect(Math.round(rail.width)).toBe(256);
          if (lang === 'en') expect(rail.x).toBeCloseTo(0, 0);
          else expect(rail.x + rail.width).toBeCloseTo(width, 0);
          await expect(nav.getByTestId('rail-add')).toBeVisible();
          await expect(page.getByTestId('add-button')).toHaveCount(0);
          await expect(nav.getByRole('button', { name: ACCOUNT })).toBeVisible();

          // No empty pad on the far side: main is the window less the rail.
          const content = await page.locator('main').evaluate((el) => {
            const style = getComputedStyle(el);
            return el.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd);
          });
          expect(content).toBe(width - 256);
          expect(content).toBeGreaterThanOrEqual(width === 1920 ? 1600 : 0);
        }

        const feed = nav.getByRole('link', { name: lang === 'en' ? /^Feed/ : /^תנועות/ });
        await expect(feed).toHaveAttribute('aria-current', 'page');
        expect(await nav.getByRole('link').locator('svg').count()).toBe(0);
      });
    });
  }
}

test.describe('@shell on a desktop', () => {
  test.use({ viewport: viewportFor(1440) });

  test('the rail’s Add opens the panel over Cards, a save stays there, and import opens on Settings (Review Focus)', async ({
    page,
  }) => {
    await completeFirstRun(page, 'en');
    await page.goto('/cards');

    await addTrigger(page).click();
    await page.getByRole('menuitem', { name: ADD_EXPENSE }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Amount', { exact: true }).fill('42');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/cards');

    await page.goto('/settings?import=1');
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/settings');
  });

  test('says which way a move goes, for the transition', async ({ page }) => {
    await completeFirstRun(page, 'en');
    const nav = page.getByRole('navigation', { name: NAV });
    await nav.getByRole('link', { name: /^Chart/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-nav-dir', 'forward');
    await nav.getByRole('link', { name: /^Feed/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-nav-dir', 'back');
  });
});
```

Run: `pnpm exec playwright test e2e/20-shell.spec.ts e2e/00-shell.spec.ts e2e/04-rtl-hebrew.spec.ts e2e/08-polish.spec.ts e2e/15-cash.spec.ts e2e/16-widths.spec.ts`
Expected: PASS. `04-rtl`'s rail test still finds the rail against the right edge in Hebrew, and its tab-bar test still mirrors (the hidden places are not links to it). `08-polish`'s `@collapse on the desktop rail` test passes: the bar clears the 256px rail and centres on the column, as main does. `16-widths` passes at 1024 in Hebrew: the longest labels wrap inside their pills.

- [ ] **Step 10: Look, then the gate, and commit**

`pnpm dev` at 1440 and 390, both languages: the rail is paper with a 2px line, the mark and "Bookandry" at its top, the sapphire Add pill, the places as pills (Feed filled with ink), counts in light type beside Cards and Bank accounts, a line, the set-up places, and the account at the foot. On a phone: four pills at the bottom, no icons. Move between places in Chrome: main cross-fades and slides a little, the rail stays still. Then `pnpm verify`.
Expected: exit 0.

```bash
git add src/app/routes.ts src/app/routes.test.tsx src/app/use-desktop.ts src/app/shell-editors.tsx src/app/app-shell.tsx src/app/app-shell.test.tsx src/app/toaster.tsx src/features/account/user-menu.tsx src/features/account/user-menu.test.tsx src/features/feed/add-menu.tsx src/features/feed/add-menu.test.tsx src/components/add-button.tsx src/components/add-button.test.tsx src/features/summary/collapsed-bar.tsx e2e/support/add.ts e2e/00-shell.spec.ts e2e/08-polish.spec.ts e2e/20-shell.spec.ts
git commit -m "The desktop gets a text rail with Add at its top, every place and the account, main fills the window as a size container, and moving between places is a short transition" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: `ScreenHead` replaces `ScreenPanel`, and the status bar follows the screen

**Files:**

- Create: `src/app/screen-head.tsx`, `src/app/screen-head.test.tsx`, `src/app/use-theme-color.ts`, `src/app/use-theme-color.test.tsx`
- Delete: `src/app/screen-panel.tsx`, `src/app/screen-panel.test.tsx` (the component is replaced; `screen-head.test.tsx` carries its tests forward)
- Modify: `src/components/brand-panel.tsx` (replaced: `BrandPanel` and `PanelSheet` go, the panel pills stay) and `brand-panel.test.tsx`
- Modify: `src/lib/color.ts` (`cssColorToHex`); Create: `src/lib/color.test.ts`
- Modify: `src/app/app-shell.tsx` (one hook call)
- Modify (the screens): `src/features/feed/feed-screen.tsx`, `src/features/cash/cash-screen.tsx`, `src/features/cards/cards-screen.tsx`, `src/features/chart/chart-screen.tsx`, `src/features/bank-accounts/bank-accounts-screen.tsx`, `src/features/commitments/commitments-screen.tsx`, `src/features/settings/categories-screen.tsx`, `src/features/settings/settings-page.tsx`, `src/features/settings/settings-screen.tsx`, `src/features/household/link-screen.tsx`, `src/features/household/wipe-screen.tsx`
- Modify: `e2e/08-polish.spec.ts:63-68`; Create: `e2e/21-screen-head.spec.ts`

**Interfaces:**

- Consumes (Task 9): `TitlePair` (`size="screen"`), `AppMark`, `text-screen-name`, `text-title-screen`. (Task 12): `UserMenu({ placement })`, the rewritten `app-shell.tsx`. (Task 7): `setThemeColor(color: string)` from `src/i18n/boot.ts`. (Task 10): `categories-screen.tsx` as Task 10 left it.
- Produces:
  - `src/app/screen-head.tsx`: `ScreenHead({ title?: string; subtitle?: string; actions?: ReactNode; children?: ReactNode; className?: string })`, `HeroSheet({ children: ReactNode; className?: string })` (the ink sheet, `data-slot="hero-sheet"`), `ScreenSheet({ children: ReactNode; className?: string })` (a screen's body, `data-slot="screen-sheet"`).
  - `src/app/use-theme-color.ts`: `useThemeColor(): void`, `topColor(): string | undefined`.
  - `src/lib/color.ts`: `cssColorToHex(css: string): string | undefined`.

`ScreenSheet` is a paper-coloured, rounded body but deliberately **not** `data-sheet="paper"` yet: inside a sheet, quiet text takes the sheet's tint at full strength and is set apart by weight 300 (§1.6), and today's screens still mark quiet text with `text-muted-foreground` at weight 400. Phase 3 makes each screen's sheets real sheets as it lays them out.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/color.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { cssColorToHex } from './color';

describe('cssColorToHex: a computed colour as the browser chrome takes it', () => {
  it('reads rgb() and rgba()', () => {
    expect(cssColorToHex('rgb(246, 242, 234)')).toBe('#F6F2EA');
    expect(cssColorToHex('rgba(26, 21, 16, 0.9)')).toBe('#1A1510');
  });

  it('reads oklch(), which Chrome reports as written', () => {
    expect(cssColorToHex('oklch(0.962 0.012 85)')).toBe('#F6F2EA');
    expect(cssColorToHex('oklch(0.2 0.012 70)')).toBe('#1A1510');
  });

  it('reads color(srgb …), which a color-mix() computes to', () => {
    expect(cssColorToHex('color(srgb 1 0 0)')).toBe('#FF0000');
  });

  it('is undefined for a transparent colour, or anything it cannot read', () => {
    expect(cssColorToHex('rgba(0, 0, 0, 0)')).toBeUndefined();
    expect(cssColorToHex('oklch(0.5 0.1 200 / 0)')).toBeUndefined();
    expect(cssColorToHex('transparent')).toBeUndefined();
    expect(cssColorToHex('')).toBeUndefined();
  });
});
```

Create `src/app/screen-head.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

import { Button } from '@/components/ui/button';
import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { HeroSheet, ScreenHead, ScreenSheet } from './screen-head';
import { SettingsProvider } from './settings-provider';

const SETTINGS = { ...DEFAULT_SETTINGS, updatedAt: instantFromMs(Date.parse('2026-09-15T10:00:00.000Z')) };

const render = (ui: ReactElement) =>
  renderWithProviders(<SettingsProvider value={SETTINGS}>{ui}</SettingsProvider>);

describe('ScreenHead (§7.7)', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('names the screen as the page’s h1: Karantina on a phone, the 38px title pair from lg', () => {
    render(<ScreenHead title="Cards" subtitle="three of them" />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Cards three of them' });
    expect(h1).toHaveClass('font-display', 'text-screen-name', 'lg:text-title-screen', 'lg:font-semibold');
  });

  it('carries the mark home and the account menu on a phone; from lg both are in the rail', () => {
    const { container } = render(<ScreenHead title="Cards" />);
    const head = container.querySelector<HTMLElement>('[data-slot="screen-head"]');
    if (head === null) throw new Error('no head');
    const home = within(head).getByRole('link', { name: /Bookandry/ });
    expect(home).toHaveAttribute('href', '/');
    expect(home.parentElement).toHaveClass('lg:hidden');
    // A 44px target around the picture.
    expect(within(head).getByRole('button', { name: 'Account and settings' })).toHaveClass('size-11');
  });

  it('puts the screen’s one action beside its name', () => {
    render(<ScreenHead title="Cards" actions={<Button variant="pill">Add a card</Button>} />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.parentElement).toContainElement(screen.getByRole('button', { name: 'Add a card' }));
  });

  it('can be the mark and the menu alone, for a page that names itself', () => {
    render(<ScreenHead />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account and settings' })).toBeInTheDocument();
  });

  it('draws the hero as the ink sheet, and a screen’s body as a rounded paper body', () => {
    render(
      <>
        <HeroSheet>pills</HeroSheet>
        <ScreenSheet>body</ScreenSheet>
      </>,
    );
    expect(screen.getByText('pills')).toHaveAttribute('data-sheet', 'night');
    expect(screen.getByText('pills')).toHaveClass('rounded-sheet');
    expect(screen.getByText('body')).toHaveClass('rounded-sheet', 'bg-card', 'mbs-sheet');
    expect(screen.getByText('body')).not.toHaveAttribute('data-sheet');
  });
});
```

Create `src/app/use-theme-color.test.tsx`:

```tsx
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { useThemeColor } from './use-theme-color';

function Probe() {
  useThemeColor();
  return null;
}

let meta: HTMLMetaElement;
let top: HTMLDivElement;

beforeEach(() => {
  meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#F6F2EA';
  document.head.append(meta);
  top = document.createElement('div');
  document.body.append(top);
  // jsdom lays nothing out: say what is at the top of the screen.
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => top });
});

afterEach(() => {
  meta.remove();
  top.remove();
  document.documentElement.classList.remove('dark');
  Reflect.deleteProperty(document, 'elementFromPoint');
});

describe('useThemeColor (§3)', () => {
  it('paints the status bar with whatever sheet reaches the top of the screen', async () => {
    top.style.backgroundColor = 'rgb(26, 21, 16)';
    renderWithProviders(<Probe />);
    await waitFor(() => {
      expect(meta.content).toBe('#1A1510');
    });
  });

  it('follows a theme change at once, without a route change (Review Focus)', async () => {
    top.style.backgroundColor = 'rgb(26, 21, 16)';
    renderWithProviders(<Probe />);
    await waitFor(() => {
      expect(meta.content).toBe('#1A1510');
    });

    top.style.backgroundColor = 'rgb(246, 242, 234)';
    document.documentElement.classList.add('dark');
    await waitFor(() => {
      expect(meta.content).toBe('#F6F2EA');
    });
  });

  it('leaves the status bar alone when nothing at the top has a colour', async () => {
    renderWithProviders(<Probe />);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(meta.content).toBe('#F6F2EA');
  });
});
```

Run: `pnpm exec vitest run --project unit src/lib/color.test.ts && pnpm exec vitest run --project dom src/app/screen-head.test.tsx src/app/use-theme-color.test.tsx`
Expected: FAIL: `cssColorToHex`, `./screen-head` and `./use-theme-color` do not exist.

- [ ] **Step 2: `cssColorToHex`**

Add to the end of `src/lib/color.ts`:

```ts
/** Whether an alpha written in a colour (`0`, `0%`) makes it transparent. */
function isClear(amount: string | undefined): boolean {
  return amount !== undefined && Number(amount.replace('%', '')) === 0;
}

/**
 * A colour as getComputedStyle reports it - rgb(), rgba(), oklch() as
 * written, or color(srgb …) for a color-mix() - as the #RRGGBB the browser's
 * chrome takes (`<meta name="theme-color">`). Undefined for a transparent
 * colour, or anything else.
 */
export function cssColorToHex(css: string): string | undefined {
  const value = css.trim();
  let channels: Rgb | undefined;

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(value);
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(value);
  if (rgb !== null) {
    if (isClear(rgb[4])) return undefined;
    channels = [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  } else if (srgb !== null) {
    if (isClear(srgb[4])) return undefined;
    channels = [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])];
  } else if (/^oklch\(/i.test(value)) {
    if (isClear(/\/\s*([\d.]+%?)\s*\)$/.exec(value)?.[1])) return undefined;
    const color = parseOklch(value);
    if (color !== undefined) channels = oklchToSrgb(color);
  }
  if (channels === undefined) return undefined;

  const hex = channels.map((channel) =>
    Math.round(Math.min(Math.max(channel, 0), 1) * 255) // money-allow: a colour channel, not money
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${hex.join('')}`.toUpperCase();
}
```

- [ ] **Step 3: The status bar follows the top of the screen**

Create `src/app/use-theme-color.ts`:

```ts
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { setThemeColor } from '@/i18n/boot';
import { cssColorToHex } from '@/lib/color';

/**
 * The colour at the top of the screen right now: the first element up from
 * the top centre with a background of its own, else the page.
 */
export function topColor(): string | undefined {
  const start =
    typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(window.innerWidth / 2, 1)
      : null;
  for (let el: Element | null = start; el !== null; el = el.parentElement) {
    const color = cssColorToHex(getComputedStyle(el).backgroundColor);
    if (color !== undefined) return color;
  }
  return cssColorToHex(getComputedStyle(document.body).backgroundColor);
}

/**
 * The phone's status bar follows the top of the current screen (§3): the
 * paper, or the sheet at the top if one reaches it. Re-read after every route
 * change and every theme change (the `dark` class on <html>), a frame later,
 * once the new screen has painted. applyTheme() and the boot script set the
 * paper first, so the bar is never wrong for long.
 */
export function useThemeColor(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const apply = () => {
      const color = topColor();
      if (color !== undefined) setThemeColor(color);
    };
    const frame = requestAnimationFrame(apply);
    const observer = new MutationObserver(() => {
      requestAnimationFrame(apply);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);
}
```

In `src/app/app-shell.tsx`, add `import { useThemeColor } from './use-theme-color';` and call `useThemeColor();` in `AppShell` after `useWipeNotice();`.

- [ ] **Step 4: `ScreenHead`, `HeroSheet`, `ScreenSheet`**

Create `src/app/screen-head.tsx`:

```tsx
import { cn } from 'cn';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { AppMark } from '@/components/app-mark';
import { TitlePair } from '@/components/ui/title-pair';
import { UserMenu } from '@/features/account/user-menu';

import { ROUTES } from './routes';

/**
 * The top of every screen (§7.7, §4.3, §4.4), on the paper. The engraved
 * panel stays on the front door only (decision 39).
 *
 * Phone: the mark, which goes home, and the account menu (Settings is
 * reached from it on a phone: routes.ts), then the screen's name in
 * Karantina at 76px with the screen's one action beside it.
 * Desktop: the top bar - the title pair at 38/21 and the screen's controls;
 * the mark and the account menu are in the rail. The search pill and the
 * month picker join the top bar with the screens that own them (phase 3).
 *
 * useThemeColor() paints the status bar from whatever is at the top.
 */
export function ScreenHead({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  readonly title?: string;
  readonly subtitle?: string;
  /** The screen's one action (a pill), or its controls on the desktop top bar. */
  readonly actions?: ReactNode;
  /** Above the title: a settings page's way back. */
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <header
      data-slot="screen-head"
      className={cn(
        'px-4 pt-[max(0.5rem,env(safe-area-inset-top,0px))] pb-2 lg:px-3.5 lg:pt-1 lg:pb-3',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <Link
          to={ROUTES.feed}
          className="-mx-2 flex min-h-12 items-center rounded-full px-2 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring"
        >
          <AppMark />
        </Link>
        <UserMenu />
      </div>
      {children}
      {title === undefined ? null : (
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3 lg:mt-0 lg:items-center">
          <TitlePair as="h1" size="screen" title={title} subtitle={subtitle} className="min-w-0" />
          {actions === undefined ? null : <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
    </header>
  );
}

/**
 * The ink sheet at the top of the feed and of Cash (§5.1, §5.5). Until phase 3
 * lays those screens out, it carries what the engraved panel carried: the
 * month, people and prime pills, the balance and the forecast, the cash total.
 * Their `tone="panel"` styles are near-white, which reads on the ink in both
 * themes.
 */
export function HeroSheet({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      data-slot="hero-sheet"
      data-sheet="night"
      className={cn('mbs-sheet rounded-sheet px-5 pt-4 pb-6 lg:px-8 lg:pt-6 lg:pb-8', className)}
    >
      {children}
    </section>
  );
}

/** A screen's body: a rounded paper body one sheet gap below the head. Still one column until phase 3. */
export function ScreenSheet({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div data-slot="screen-sheet" className={cn('mbs-sheet rounded-sheet bg-card pb-6', className)}>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: The panel pills stay; the engraved panel and `PanelSheet` go**

Replace `src/components/brand-panel.tsx` with:

```ts
/**
 * The front door's outlined pill, for a ghost `Button` on a dark surface: the
 * theme and language switches on the front door's engraved panel, and the
 * month, profile and prime pills on the feed's and Cash's ink hero sheet
 * (`HeroSheet`, src/app/screen-head.tsx). 44px high on a phone, 36px from `sm`.
 *
 * The `white/*` alpha utilities are that dark surface's pill vocabulary; they
 * are not a bypass of the colour tokens. The ghost variant's own hover and
 * expanded fills are for a light page, so they are overridden in both themes,
 * including the `dark:hover:` one, which `cn` does not merge with `hover:`.
 */
export const panelPill =
  'h-auto min-h-11 gap-2 rounded-full border-white/35 px-3.5 text-sm text-brand-deep-foreground hover:bg-white/10 hover:text-brand-deep-foreground dark:hover:bg-white/10 aria-expanded:bg-white/15 aria-expanded:text-brand-deep-foreground focus-visible:border-white/60 focus-visible:ring-white/50 sm:min-h-9';

/**
 * `panelPill`'s round sibling, for a ghost icon `Button` on the same surfaces:
 * the month pill's ‹ and › arrows. 44px on a phone, 36px from `sm`.
 */
export const panelIconButton =
  'size-11 rounded-full text-brand-deep-foreground hover:bg-white/10 hover:text-brand-deep-foreground dark:hover:bg-white/10 focus-visible:border-white/60 focus-visible:ring-white/50 sm:size-9';
```

In `src/components/brand-panel.test.tsx`, change line 4 to `import { panelIconButton, panelPill } from './brand-panel';` and delete the `describe('BrandPanel', …)` and `describe('PanelSheet', …)` blocks (the components they tested are gone). If `render` or `screen` is now unused, drop it from line 1.

Delete `src/app/screen-panel.tsx` and `src/app/screen-panel.test.tsx` (`git rm`). Their tests live on in `screen-head.test.tsx`: the h1 in the display face on a phone, the account menu with a 44px target, and the mark that goes home on a phone only.

- [ ] **Step 6: Every screen**

The imports, the body sheet, and the simple heads, from the worktree root:

```bash
SCREENS="src/features/bank-accounts/bank-accounts-screen.tsx src/features/cards/cards-screen.tsx src/features/cash/cash-screen.tsx src/features/chart/chart-screen.tsx src/features/commitments/commitments-screen.tsx src/features/feed/feed-screen.tsx src/features/household/link-screen.tsx src/features/household/wipe-screen.tsx src/features/settings/categories-screen.tsx src/features/settings/settings-page.tsx src/features/settings/settings-screen.tsx"
sed -i \
  -e "s#import { ScreenPanel, ScreenTitle } from '@/app/screen-panel';#import { ScreenHead, ScreenSheet } from '@/app/screen-head';#" \
  -e "s#import { ScreenPanel } from '@/app/screen-panel';#import { ScreenHead, ScreenSheet } from '@/app/screen-head';#" \
  -e "/import { PanelSheet } from '@\/components\/brand-panel';/d" \
  -e 's#<PanelSheet#<ScreenSheet#g' \
  -e 's#</PanelSheet>#</ScreenSheet>#g' \
  -e 's#<ScreenPanel />#<ScreenHead />#g' \
  $SCREENS
# A head that holds only its title: <ScreenPanel><ScreenTitle>{x}</ScreenTitle></ScreenPanel> -> <ScreenHead title={x} />
perl -0pi -e 's#<ScreenPanel>\s*<ScreenTitle>\{(.*?)\}</ScreenTitle>\s*</ScreenPanel>#<ScreenHead title={$1} />#gs' $SCREENS
```

That leaves three heads that carried more than a title. By hand:

`src/features/feed/feed-screen.tsx` (the `feed-header` block): add `HeroSheet` to the new `@/app/screen-head` import, replace the opening `<ScreenPanel>` with

```tsx
        <ScreenHead title={t('nav.feed')} />
        <HeroSheet>
```

replace the closing `</ScreenPanel>` with `</HeroSheet>`, and change the pills row's `className="mt-3 flex flex-wrap items-center gap-2"` to `className="flex flex-wrap items-center gap-2"` (it now opens the sheet).

`src/features/cash/cash-screen.tsx`: add `HeroSheet` to the import, and replace the whole `<ScreenPanel>` … `</ScreenPanel>` block with:

```tsx
<ScreenHead title={t('cash.title')} />;
{
  lookups === undefined && !setUp ? null : (
    <HeroSheet>
      {lookups === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2" data-testid="cash-pills">
          <ProfileSwitcher
            profiles={profiles}
            active={whose}
            onSelect={(profileId) => {
              void writeSettings(db, { activeProfileId: profileId }, systemClock.nowIso());
            }}
            tone="panel"
          />
        </div>
      )}
      {setUp ? (
        <div className="mt-5">
          <CashFigure summary={data.summary} currency={currency} profiles={byId} />
        </div>
      ) : null}
    </HeroSheet>
  );
}
```

`src/features/settings/settings-page.tsx`: replace the `<ScreenPanel>` … `</ScreenPanel>` block with:

```tsx
<ScreenHead title={title}>
  <Link
    to={ROUTES.settings}
    className="hover-fine:text-foreground -ms-1 mt-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm text-muted-foreground focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring"
  >
    {/* Directional: it points back, so it flips. */}
    <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
    {t('settings.title')}
  </Link>
</ScreenHead>
```

and update its doc comment's "the way back" sentence to say the way back sits above the title in the screen head.

Check: `grep -rn "ScreenPanel\|ScreenTitle\|PanelSheet\|BrandPanel" src` prints nothing.

Run: `pnpm exec prettier --write $SCREENS src/app src/components/brand-panel.tsx && pnpm typecheck && pnpm exec vitest run --project dom src/app src/components src/features && pnpm exec vitest run --project unit src/lib/color.test.ts`
Expected: PASS. Screen tests that found the title by `heading level 1` still do; the feed's and Cash's tests that read `panel-pills`, `cash-pills`, `balance-amount` and `cash-amount` still find them inside the hero sheet.

- [ ] **Step 7: The browser checks**

In `e2e/08-polish.spec.ts` (the `'the panel wraps its pills…'` test, lines 63–68), change the comment to `// Every pill on the hero sheet sits inside the viewport: they wrap rather than overflow.` and the selector `'[data-slot="brand-panel"] button'` to `'[data-slot="hero-sheet"] button'`.

Create `e2e/21-screen-head.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { completeFirstRun } from './support/seed';
import { LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * The screen head (§7.7, §4.4): the name in Karantina at 76px on a phone,
 * the 38px title pair from lg; the feed's hero as the ink sheet; and the
 * status bar following the paper (§3).
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and language are set explicitly.');
});

for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`@head ${String(width)} ${lang}`, () => {
      test.use({ viewport: viewportFor(width), locale });

      test('names every screen in the right face and size, under a paper status bar', async ({ page }) => {
        await completeFirstRun(page, lang);

        for (const route of ['/', '/chart', '/cards', '/cash', '/settings']) {
          await page.goto(route);
          const h1 = page.getByRole('heading', { level: 1 });
          await expect(h1).toBeVisible();
          await page.evaluate(() => document.fonts.ready);

          const style = await h1.evaluate((el) => {
            const computed = getComputedStyle(el);
            return {
              family: computed.fontFamily.replace(/["']/g, ''),
              size: parseFloat(computed.fontSize),
              weight: computed.fontWeight,
            };
          });
          if (width < 1024) {
            expect(style.family.startsWith('Karantina'), route).toBe(true);
            expect(style.size, route).toBe(76);
          } else {
            expect(style.family.startsWith('IBM Plex Sans Hebrew'), route).toBe(true);
            expect(style.size, route).toBe(38);
            expect(style.weight, route).toBe('600');
          }
          await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#F6F2EA');
        }

        await page.goto('/');
        await expect(page.locator('[data-slot="hero-sheet"]')).toHaveAttribute('data-sheet', 'night');
      });
    });
  }
}

test.describe('@head the status bar in dark mode', () => {
  test.use({ viewport: viewportFor(390) });

  test('is the dark paper', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await completeFirstRun(page, 'en', { theme: 'dark' });
    await page.goto('/cards');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1A1510');
  });
});
```

Run: `pnpm exec playwright test e2e/21-screen-head.spec.ts e2e/08-polish.spec.ts e2e/04-rtl-hebrew.spec.ts e2e/15-cash.spec.ts e2e/07-a11y.spec.ts`
Expected: PASS. `07-a11y`'s blocking scans stay clean: the near-white pills on the ink hero measure well over 4.5:1.

- [ ] **Step 8: Look, then the gate, and commit**

`pnpm dev`, every screen at 390 and 1440, both languages and themes: the screen's name in Karantina on a phone, the 38px title on desktop; the feed's and Cash's pills and figures on an ink sheet; every body a rounded paper sheet one gap below; no sapphire panel anywhere but the front door. Then `pnpm verify`.
Expected: exit 0.

```bash
git add -A src/app src/components/brand-panel.tsx src/components/brand-panel.test.tsx src/lib/color.ts src/lib/color.test.ts $SCREENS e2e/08-polish.spec.ts e2e/21-screen-head.spec.ts
git commit -m "Every screen opens with its name on the paper instead of the engraved panel, the feed and Cash keep their figures on an ink sheet, and the status bar follows the top of the screen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`SCREENS` is the variable from Step 6; set it again in a new shell.)

---

### Task 14: `sharesBp`, `Numeral`, `HueBars` and `MoneyStrip`

**Files:**

- Modify: `src/lib/money.ts` (two functions) and `src/lib/money.test.ts`
- Modify: `src/i18n/money-format.ts` (`figureParts`) and `src/i18n/money-format.test.ts`
- Create: `src/components/ui/numeral.tsx`, `src/components/ui/numeral.test.tsx`, `src/components/ui/hue-bars.tsx`, `src/components/ui/hue-bars.test.tsx`
- Create: `e2e/22-numerals.spec.ts`

**Interfaces:**

- Consumes (Task 9): the `[data-numeral]` and `[data-card-sheet] [data-numeral]` rules, `sheets.other`. (Task 6): `type HueToken`. Existing: `formatMoney`, `MINUS_SIGN`, `sum`, `divRound`, `toSafeNumber`, `exponentOf`, `Money`.
- Produces:
  - `src/lib/money.ts`: `sharesBp(minors: readonly Minor[]): number[]` (basis points summing to exactly 10,000, or all 0); `wholeMinor(minor: Minor, currency: Currency): Minor`.
  - `src/i18n/money-format.ts`: `figureParts(minor: Minor, currency: Currency, options: { locale: string; whole?: boolean }): { sign: string; symbol: string; digits: string }`.
  - `src/components/ui/numeral.tsx`: `NUMERAL_MAX: Record<NumeralSize, string>`; `type NumeralSize = 'balance' | 'left' | 'cash' | 'card' | 'account' | 'day'`; `Numeral({ minor: Minor; currency: Currency; size: NumeralSize; rounded?: boolean; className?: string })`.
  - `src/components/ui/hue-bars.tsx`: `type HueBarItem = { id: string; name: string; minor: Minor; hue: HueToken }`; `largestWithOther(items, limit, otherName): HueBarItem[]`; `HueBars({ items, currency, limit?: number })` (default 10); `MoneyStrip({ items, limit?: number })` (default 7).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/money.test.ts` (and `sharesBp, wholeMinor` to its import from `./money`):

```ts
describe('sharesBp (§7.4)', () => {
  it('splits by the largest remainder, so the shares sum to exactly 10,000', () => {
    expect(sharesBp([1, 1, 1])).toEqual([3334, 3333, 3333]);
    // 2/7, 1/7, 1/7, 3/7: floors 2857, 1428, 1428, 4285; the two left go to the largest remainders.
    expect(sharesBp([2, 1, 1, 3])).toEqual([2857, 1429, 1428, 4286]);
  });

  it('is the whole for a single segment, and nothing for a zero total', () => {
    expect(sharesBp([12_345])).toEqual([10_000]);
    expect(sharesBp([0, 0])).toEqual([0, 0]);
    expect(sharesBp([])).toEqual([]);
  });

  it('counts a negative value as nothing: a share is a size', () => {
    expect(sharesBp([-500, 500])).toEqual([0, 10_000]);
  });

  it('always sums to 10,000, never goes negative, and keeps the values’ order', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1e12 }), { minLength: 1, maxLength: 30 }), (minors) => {
        const shares = sharesBp(minors);
        const total = minors.reduce((a, b) => a + b, 0);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total === 0 ? 0 : 10_000);
        for (const share of shares) expect(share).toBeGreaterThanOrEqual(0);
        for (let i = 0; i < minors.length; i += 1) {
          for (let j = 0; j < minors.length; j += 1) {
            if ((minors[i] ?? 0) > (minors[j] ?? 0)) expect(shares[i]).toBeGreaterThanOrEqual(shares[j] ?? 0);
          }
        }
      }),
    );
  });
});

describe('wholeMinor (§9.4: big numerals are whole)', () => {
  it('rounds to whole units, half away from zero', () => {
    expect(wholeMinor(123_456, 'ILS')).toBe(123_500);
    expect(wholeMinor(123_449, 'ILS')).toBe(123_400);
    expect(wholeMinor(-150, 'ILS')).toBe(-200);
  });

  it('leaves a currency with no minor unit alone', () => {
    expect(wholeMinor(1234, 'JPY')).toBe(1234);
  });
});
```

Add to `src/i18n/money-format.test.ts` (and `figureParts` to its import):

```ts
describe('figureParts: a big numeral’s pieces (§9.5)', () => {
  it('splits the sign, the symbol and the digits', () => {
    expect(figureParts(1_436_250, 'ILS', { locale: 'en' })).toEqual({
      sign: '',
      symbol: '₪',
      digits: '14,362.50',
    });
    expect(figureParts(-1_436_200, 'USD', { locale: 'en' })).toEqual({
      sign: '−',
      symbol: '$',
      digits: '14,362.00',
    });
  });

  it('drops the fraction of a whole figure', () => {
    expect(figureParts(1_436_200, 'ILS', { locale: 'en', whole: true }).digits).toBe('14,362');
  });

  it('keeps the symbol free of bidi marks in Hebrew', () => {
    const parts = figureParts(1_436_200, 'ILS', { locale: 'he', whole: true });
    expect(parts.symbol).toBe('₪');
    expect(parts.digits).toBe('14,362');
  });
});
```

Create `src/components/ui/numeral.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n } from '@/test/render';

import { Numeral, NUMERAL_MAX } from './numeral';

beforeAll(async () => {
  await initTestI18n('en');
});

const numeral = (container: HTMLElement) => {
  const el = container.querySelector<HTMLElement>('[data-numeral]');
  if (el === null) throw new Error('no numeral');
  return el;
};

/** The px a fluid NUMERAL_MAX comes to in a window `width` px wide. */
function clampAt(value: string, width: number): number {
  const match = /^clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)rem\s*\+\s*([\d.]+)vw\s*,\s*([\d.]+)rem\s*\)$/.exec(
    value,
  );
  if (match === null) return Number.parseFloat(value) * 16;
  const [min, base, slope, max] = match.slice(1).map(Number) as [number, number, number, number];
  return Math.min(max * 16, Math.max(min * 16, base * 16 + (slope * width) / 100));
}

describe('Numeral (§7.5, §9.4)', () => {
  it('draws a whole figure without a fraction, symbol first, and lets it bleed', () => {
    const { container } = render(<Numeral minor={1_436_200} currency="ILS" size="balance" />);
    const el = numeral(container);
    expect(el.textContent).toBe('₪14,362');
    expect(el.style.getPropertyValue('--b')).toBe('');
    expect(el).toHaveClass('font-display');
  });

  it('never bleeds a figure with a fraction', () => {
    const { container } = render(<Numeral minor={1_436_250} currency="ILS" size="balance" />);
    expect(numeral(container).style.getPropertyValue('--b')).toBe('0');
    expect(numeral(container).textContent).toBe('₪14,362.50');
  });

  it('never bleeds an account figure or a day, whatever the amount', () => {
    const { container } = render(<Numeral minor={500_000} currency="ILS" size="account" />);
    expect(numeral(container).style.getPropertyValue('--b')).toBe('0');
  });

  it('when rounded, hides the visible figure and says the exact amount', () => {
    render(<Numeral minor={1_436_250} currency="ILS" size="balance" rounded />);
    const visible = document.querySelector('[data-numeral]');
    expect(visible).toHaveAttribute('aria-hidden', 'true');
    expect(visible?.textContent).toBe('₪14,363');
    expect(screen.getByText(/14,362\.50/)).toHaveClass('sr-only');
  });

  it('fits by its glyph count, under its size’s cap', () => {
    const { container } = render(<Numeral minor={-1_436_200} currency="ILS" size="card" />);
    const el = numeral(container);
    // '−' + '14,362' at full size, '₪' at half: 1 + 6 + 1.
    expect(el.style.getPropertyValue('--glyphs')).toBe('8');
    expect(el.style.getPropertyValue('--numeral-max')).toBe(NUMERAL_MAX.card);
    expect(el).toHaveAttribute('dir', 'ltr');
  });

  it.each([
    ['balance', 118, 252],
    ['left', 96, 168],
    ['cash', 96, 150],
    ['card', 92, 104],
    ['account', 40, 52],
    ['day', 34, 34],
  ] as const)('caps a %s figure at %ipx on a phone and %ipx at 1440 (§9.5)', (size, phone, desktop) => {
    expect(clampAt(NUMERAL_MAX[size], 390)).toBeCloseTo(phone, 0);
    expect(clampAt(NUMERAL_MAX[size], 1440)).toBeCloseTo(desktop, 0);
  });
});
```

Create `src/components/ui/hue-bars.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n } from '@/test/render';

import { HueBars, largestWithOther, MoneyStrip, type HueBarItem } from './hue-bars';

beforeAll(async () => {
  await initTestI18n('en');
});

const item = (id: string, minor: number, hue: HueBarItem['hue'] = 'teal'): HueBarItem => ({
  id,
  name: id,
  minor,
  hue,
});
const TWELVE = Array.from({ length: 12 }, (_, i) => item(`c${String(i + 1)}`, (i + 1) * 1000));

describe('largestWithOther (§1.4)', () => {
  it('keeps the largest, then folds the rest into one neutral "Other"', () => {
    const shown = largestWithOther(TWELVE, 10, 'Other');
    expect(shown).toHaveLength(11);
    expect(shown[0]?.id).toBe('c12');
    expect(shown.at(-1)).toEqual({ id: 'other', name: 'Other', minor: 3000, hue: 'neutral' });
  });

  it('adds no "Other" when everything fits', () => {
    expect(largestWithOther(TWELVE.slice(0, 3), 10, 'Other').map((i) => i.id)).toEqual(['c3', 'c2', 'c1']);
  });
});

describe('HueBars (§7.4)', () => {
  it('lists every category by name and amount, then "Other"', () => {
    render(<HueBars items={TWELVE} currency="ILS" />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(11);
    expect(rows.at(-1)).toHaveTextContent('Other');
  });

  it('draws each bar as a hue mark sized by its share, hidden from screen readers', () => {
    const { container } = render(<HueBars items={TWELVE.slice(0, 2)} currency="ILS" />);
    const bars = [...container.querySelectorAll<HTMLElement>('[data-hue]')];
    expect(bars.map((bar) => bar.getAttribute('data-hue'))).toEqual(['teal', 'teal']);
    expect(bars.map((bar) => Number(bar.style.getPropertyValue('--bp'))).reduce((a, b) => a + b, 0)).toBe(
      10_000,
    );
    for (const bar of bars) expect(bar.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('MoneyStrip (§7.4)', () => {
  it('is hidden from screen readers: its legend or the bar list carries the data', () => {
    const { container } = render(<MoneyStrip items={TWELVE} />);
    const strip = container.querySelector('[data-slot="money-strip"]');
    expect(strip).toHaveAttribute('aria-hidden', 'true');
    // The largest 7, then "Other": 8 segments, 2px apart.
    expect(strip?.children).toHaveLength(8);
    expect(strip).toHaveClass('gap-0.5');
  });
});
```

Run: `pnpm exec vitest run --project unit src/lib/money.test.ts src/i18n/money-format.test.ts && pnpm exec vitest run --project dom src/components/ui/numeral.test.tsx src/components/ui/hue-bars.test.tsx`
Expected: FAIL: the functions and modules do not exist.

- [ ] **Step 2: The money**

Add to `src/lib/money.ts` (after `prorateMinor`):

```ts
/**
 * Each value's share of their total in basis points (1/10,000 of the whole),
 * by the largest remainder, so the shares always sum to exactly 10,000 (§7.4).
 *
 * Strips and bars turn them into widths in CSS (`calc(var(--bp) * 0.01%)`),
 * so no other code divides money. A negative value counts as nothing - a
 * share is a size - and a zero total gives every value 0. Ties in the
 * remainder go to the earlier value, so the result is stable.
 */
export function sharesBp(minors: readonly Minor[]): number[] {
  const values = minors.map((minor) => BigInt(Math.max(0, minor)));
  const total = values.reduce((acc, value) => acc + value, 0n);
  if (total === 0n) return minors.map(() => 0);

  const scaled = values.map((value) => value * 10_000n);
  const shares = scaled.map((value) => value / total);
  let left = 10_000n - shares.reduce((acc, share) => acc + share, 0n);
  const order = scaled
    .map((value, index) => ({ index, remainder: value % total }))
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  for (const { index } of order) {
    if (left === 0n) break;
    shares[index] = (shares[index] as bigint) + 1n;
    left -= 1n;
  }
  return shares.map(Number);
}

/** The amount in whole major units - shekels, dollars - rounded half away from zero (§9.4). */
export function wholeMinor(minor: Minor, currency: Currency): Minor {
  const unit = 10n ** BigInt(exponentOf(currency));
  return toSafeNumber(divRound(BigInt(minor), unit) * unit);
}
```

(`money.ts` is the one file `gate:money` lets divide and round; its coverage floor is 100%, which the tests above reach: the zero total, every comparator branch, and the early `break`.)

Add to `src/i18n/money-format.ts`, after `formatMoney`:

```ts
/**
 * A figure's parts for the big numerals (§9.5): the sign, the currency symbol
 * and the digits, so the symbol can be set at half size and raised before the
 * digits in either language. `whole` drops the fraction: pass an amount that
 * has none, or one rounded by `wholeMinor` (src/lib/money.ts).
 */
export function figureParts(
  minor: Minor,
  currency: Currency,
  options: { readonly locale: string; readonly whole?: boolean },
): { readonly sign: string; readonly symbol: string; readonly digits: string } {
  const parts = partsOf(
    formatter(options.locale, currency, 'symbol'),
    toDecimalString(Math.abs(minor), currency),
  );
  const keep: ReadonlySet<string> = new Set(
    options.whole === true ? ['integer', 'group'] : ['integer', 'group', 'decimal', 'fraction'],
  );
  return {
    sign: minor < 0 ? MINUS_SIGN : '',
    symbol: stripBidi(
      parts
        .filter((part) => part.type === 'currency')
        .map((part) => part.value)
        .join(''),
    ),
    digits: parts
      .filter((part) => keep.has(part.type))
      .map((part) => part.value)
      .join(''),
  };
}
```

- [ ] **Step 3: `Numeral`**

Create `src/components/ui/numeral.tsx`:

```tsx
import { cn } from 'cn';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { figureParts, formatMoney } from '@/i18n/money-format';
import { wholeMinor } from '@/lib/money';
import type { Currency, Minor } from '@/types/money';

export type NumeralSize = 'balance' | 'left' | 'cash' | 'card' | 'account' | 'day';

/**
 * Each size's cap (§9.5), fluid from its phone size at 390 to its desktop
 * size at 1440, within good-css's 2.5x zoom limit. The figure is smaller when
 * its container is narrower: index.css fits it by glyph count.
 */
export const NUMERAL_MAX: Record<NumeralSize, string> = {
  balance: 'clamp(7.375rem, 4.2643rem + 12.7619vw, 15.75rem)', // 118 -> 252
  left: 'clamp(6rem, 4.3286rem + 6.8571vw, 10.5rem)', // 96 -> 168
  cash: 'clamp(6rem, 4.7464rem + 5.1429vw, 9.375rem)', // 96 -> 150
  card: 'clamp(5.75rem, 5.4714rem + 1.1429vw, 6.5rem)', // 92 -> 104
  account: 'clamp(2.5rem, 2.2214rem + 1.1429vw, 3.25rem)', // 40 -> 52
  day: '2.125rem', // 34
};

/** Figures that never run off their sheet (§9.4: account sheets' figures, the charges list's days). */
const NEVER_BLEEDS: ReadonlySet<NumeralSize> = new Set(['account', 'day']);

/**
 * The huge Karantina figure (§7.5). It fits its container (index.css sizes it
 * from `--glyphs` and `--numeral-max`, never under 28px) and runs off its
 * sheet's foot by `--numeral-bleed` (§9.4) - unless it has a fraction, which
 * never bleeds, or its size never does.
 *
 * Cutting is visual only. The visible figure is aria-hidden and a visually
 * hidden twin says the exact amount, agorot included, as Money does.
 */
export function Numeral({
  minor,
  currency,
  size,
  rounded = false,
  className,
}: {
  readonly minor: Minor;
  readonly currency: Currency;
  readonly size: NumeralSize;
  /** Show whole units only; the twin keeps the exact amount. */
  readonly rounded?: boolean;
  readonly className?: string;
}) {
  const { i18n } = useTranslation();
  const whole = wholeMinor(minor, currency);
  const shown = rounded ? whole : minor;
  const isWhole = shown === whole;
  const parts = figureParts(shown, currency, { locale: i18n.language, whole: isWhole });
  // The sign and digits at full size, the symbol at half (rounded up): a glyph count, not money.
  const glyphs = parts.sign.length + parts.digits.length + Math.ceil(parts.symbol.length / 2); // money-allow: glyph count
  const bleeds = isWhole && !NEVER_BLEEDS.has(size);

  return (
    <span className={cn('relative block min-w-0', className)}>
      <span
        aria-hidden="true"
        data-numeral=""
        dir="ltr"
        className="block font-display whitespace-nowrap [unicode-bidi:isolate]"
        style={
          {
            '--glyphs': String(glyphs),
            '--numeral-max': NUMERAL_MAX[size],
            ...(bleeds ? {} : { '--b': '0' }),
          } as CSSProperties
        }
      >
        {parts.sign}
        {/* Half size, raised 0.62em, so it ends far above the cut (§9.4). */}
        <span className="me-[0.04em] align-[0.62em] text-[0.5em]">{parts.symbol}</span>
        {parts.digits}
      </span>
      <span className="sr-only">{formatMoney(minor, currency, { locale: i18n.language }).aria}</span>
    </span>
  );
}
```

- [ ] **Step 4: `HueBars` and `MoneyStrip`**

Create `src/components/ui/hue-bars.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { Money } from '@/components/money';
import type { HueToken } from '@/domain/category-hue';
import { sharesBp, sum } from '@/lib/money';
import type { Currency, Minor } from '@/types/money';

export type HueBarItem = {
  readonly id: string;
  readonly name: string;
  readonly minor: Minor;
  /** `categoryHue(category)` from src/domain/category-hue.ts. */
  readonly hue: HueToken;
};

/** The largest `limit` items, then the rest as one neutral "Other" (§1.4: 10 in a bar list, 7 in a strip). */
export function largestWithOther(
  items: readonly HueBarItem[],
  limit: number,
  otherName: string,
): HueBarItem[] {
  const sorted = [...items].sort((a, b) => b.minor - a.minor);
  if (sorted.length <= limit) return sorted;
  return [
    ...sorted.slice(0, limit),
    {
      id: 'other',
      name: otherName,
      minor: sum(sorted.slice(limit).map((item) => item.minor)),
      hue: 'neutral',
    },
  ];
}

/**
 * One 30px hue pill bar per category, at least 30px long, with its name and
 * amount beside it (§7.4). The bar is a mark (decision 10): hidden from
 * screen readers, never carrying text; the name and the amount carry the data.
 * Lengths are basis points from sharesBp(), turned into widths in CSS.
 */
export function HueBars({
  items,
  currency,
  limit = 10,
}: {
  readonly items: readonly HueBarItem[];
  readonly currency: Currency;
  readonly limit?: number;
}) {
  const { t } = useTranslation();
  const shown = largestWithOther(items, limit, t('sheets.other'));
  const shares = sharesBp(shown.map((item) => item.minor));
  return (
    <ul data-slot="hue-bars" className="grid gap-1.75">
      {shown.map((item, index) => (
        <li
          key={item.id}
          className="grid min-h-8 grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-3.5 text-base"
        >
          <span className="truncate">{item.name}</span>
          <span aria-hidden="true" className="block h-7.5">
            <i
              data-hue={item.hue}
              className="block h-full w-[calc(var(--bp)*0.01%)] min-w-7.5 rounded-full bg-hue"
              style={{ '--bp': String(shares[index] ?? 0) } as CSSProperties}
            />
          </span>
          <Money minor={item.minor} currency={currency} className="text-end font-medium" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Proportional segments 2px apart, so two that look alike still read as two
 * (§1.4) - the phone summary's thin strip. Hidden from screen readers: its
 * legend, or the bar list beside it, carries the data.
 */
export function MoneyStrip({
  items,
  limit = 7,
}: {
  readonly items: readonly HueBarItem[];
  readonly limit?: number;
}) {
  const shown = largestWithOther(items, limit, '');
  const shares = sharesBp(shown.map((item) => item.minor));
  return (
    <div aria-hidden="true" data-slot="money-strip" className="flex h-3 gap-0.5 overflow-clip rounded-full">
      {shown.map((item, index) => (
        <i
          key={item.id}
          data-hue={item.hue}
          className="block h-full basis-0 bg-hue"
          style={{ flexGrow: shares[index] ?? 0 }}
        />
      ))}
    </div>
  );
}
```

Run: `pnpm exec vitest run --project unit src/lib/money.test.ts src/i18n/money-format.test.ts && pnpm exec vitest run --project dom src/components/ui/numeral.test.tsx src/components/ui/hue-bars.test.tsx`
Expected: PASS.

- [ ] **Step 5: The bleed rule in a browser**

Create `e2e/22-numerals.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { completeFirstRun } from './support/seed';
import { APP_ROUTES, LANGUAGES, LAYOUT_WIDTHS, viewportFor } from './support/widths';

/**
 * @numerals (§9.4, §13.3): every `[data-numeral]` on every screen runs off its
 * sheet's foot by no more than the rule - (0.61 x b + 0.02) x its font size,
 * plus a pixel - with b 0.06 from lg and 0.03 below, halved in a card sheet,
 * and 0 for a figure that never bleeds. The ₪ ends above the cut, and a
 * spoken twin carries the amount.
 *
 * Phase 2 builds Numeral; the screens draw it from phase 3. Until one does,
 * this reports itself skipped rather than passing on nothing.
 */
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'en', 'Viewport and language are set explicitly.');
});

for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`@numerals ${String(width)} ${lang}`, () => {
      test.use({ viewport: viewportFor(width), locale });

      test('no numeral bleeds past the rule, and each says its amount', async ({ page }) => {
        await completeFirstRun(page, lang);
        let seen = 0;

        for (const route of APP_ROUTES) {
          await page.goto(route);
          await expect(page.getByRole('main')).toBeVisible();
          await page.evaluate(() => document.fonts.ready);

          const result = await page.evaluate((desktop) => {
            const bad: string[] = [];
            const numerals = [...document.querySelectorAll<HTMLElement>('[data-numeral]')];
            for (const numeral of numerals) {
              const sheet = numeral.closest('[data-sheet]');
              const label = (numeral.textContent ?? '').trim();
              if (sheet === null) {
                bad.push(`${label}: not on a sheet`);
                continue;
              }
              const size = parseFloat(getComputedStyle(numeral).fontSize);
              const still = numeral.style.getPropertyValue('--b').trim() === '0';
              const half = numeral.closest('[data-card-sheet]') !== null;
              const b = still ? 0 : (desktop ? 0.06 : 0.03) * (half ? 0.5 : 1);
              const foot = sheet.getBoundingClientRect().bottom;
              const overflow = numeral.getBoundingClientRect().bottom - foot;
              if (overflow > (0.61 * b + 0.02) * size + 1)
                bad.push(`${label}: ${String(overflow)}px past the foot`);
              const symbol = numeral.querySelector('span');
              if (symbol !== null && symbol.getBoundingClientRect().bottom > foot)
                bad.push(`${label}: the symbol is cut`);
              const twin = numeral.nextElementSibling;
              if (twin === null || !twin.classList.contains('sr-only') || !/\d/.test(twin.textContent ?? ''))
                bad.push(`${label}: no spoken amount`);
            }
            return { bad, count: numerals.length };
          }, width >= 1024);

          seen += result.count;
          expect(result.bad, `${route} at ${String(width)} in ${lang}`).toEqual([]);
        }

        test.skip(seen === 0, 'No screen draws a Numeral until phase 3 lays the screens out.');
      });
    });
  }
}
```

Run: `pnpm exec playwright test e2e/22-numerals.spec.ts`
Expected: every test reports skipped ("No screen draws a Numeral until phase 3"), none fails.

- [ ] **Step 6: The gate, and commit**

Run: `pnpm verify`
Expected: exit 0, with `src/lib/money.ts` still at 100% coverage and `pnpm gate:money` green.

```bash
git add src/lib/money.ts src/lib/money.test.ts src/i18n/money-format.ts src/i18n/money-format.test.ts src/components/ui/numeral.tsx src/components/ui/numeral.test.tsx src/components/ui/hue-bars.tsx src/components/ui/hue-bars.test.tsx e2e/22-numerals.spec.ts
git commit -m "Big figures, category bars and strips are ready for the screens: shares of a total always sum to the whole, and a figure runs off its sheet only as far as the rule allows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: `CardSheet`, `CardFace` and `MoneyTile`

**Files:**

- Create: `src/components/ui/card-face.tsx`, `src/components/ui/card-sheet.tsx`, `src/components/ui/money-tile.tsx`, and a `*.test.tsx` beside each

**Interfaces:**

- Consumes (Task 5): `type MoneyKey`, `cardKey()`. (Task 9): `Mark`, `sheets.cardName`, `sheets.selected`, `rounded-face`, `rounded-sheet-s`, `rounded-tile`, `--paper`, `--ink`, `--focus-ring`. (Task 14, in tests only): `Numeral`.
- Produces, for phase 3b and the add-card flow:
  - `lastFour(digits: string | undefined): string | undefined` (in `card-face.tsx`): digits only, never more than 4.
  - `CardFace({ moneyKey: MoneyKey; issuerName: string; holder?: string; lastDigits?: string; network?: string; later?: string; variant?: 'preview' | 'details'; className?: string })`: `role="img"`, named "<issuer> ending <last4>".
  - `CardSheet({ moneyKey: MoneyKey; name: string; holder?: string; lastDigits?: string; billing?: string; figure?: ReactNode; className?: string })`: `data-card-sheet`, an `article` named by its heading.
  - `MoneyTileGroup({ legend: ReactNode; children: ReactNode; className?: string })` and `MoneyTile({ name: string; value: string; checked: boolean; onChange: (value: string) => void; label: string; otherLabel?: string; moneyKey?: MoneyKey; notListed?: boolean })`.

The add-card spec's move of the face out of `CardPanel` into `CardFace` (§6.4) happens when phase 3b adopts `CardFace` on the Cards screen; this task builds and tests it.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/card-face.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { cardKey } from '@/domain/money-key';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { CardFace, lastFour } from './card-face';

beforeAll(async () => {
  await initTestI18n('en');
});

describe('lastFour (gate:pci, §7.1)', () => {
  it('keeps the digits only, and never more than four', () => {
    expect(lastFour('4821')).toBe('4821');
    expect(lastFour('1234 5678 9012 3456')).toBe('3456');
    expect(lastFour('')).toBeUndefined();
    expect(lastFour(undefined)).toBeUndefined();
  });
});

describe('CardFace (§7.2)', () => {
  it('is named "<issuer> ending <last4>", with its parts hidden behind that name', () => {
    renderWithProviders(
      <CardFace moneyKey="issuer-isracard" issuerName="Isracard" holder="Dana" lastDigits="4821" />,
    );
    const face = screen.getByRole('img', { name: 'Isracard ending 4821' });
    expect(face).toHaveAttribute('data-sheet', 'money');
    expect(face).toHaveAttribute('data-money', 'issuer-isracard');
  });

  it('shows four digits at most, whatever it is given', () => {
    renderWithProviders(<CardFace moneyKey="issuer-cal" issuerName="Cal" lastDigits="1234567890123456" />);
    const face = screen.getByRole('img', { name: 'Cal ending 3456' });
    expect(face.textContent).not.toContain('1234');
  });

  it('takes its company’s colour when the card’s own is one this build does not know', () => {
    renderWithProviders(
      <CardFace
        moneyKey={cardKey({ color: '#bad', card: { issuer: 'cal' } })}
        issuerName="Cal"
        lastDigits="1"
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('data-money', 'issuer-cal');
  });

  it('tilts −4° as a preview and lies flat in details, and cross-fades its colour for everyone', () => {
    renderWithProviders(
      <>
        <CardFace moneyKey="issuer-max" issuerName="Max" variant="preview" />
        <CardFace moneyKey="issuer-max" issuerName="Diners" variant="details" />
      </>,
    );
    const [preview, details] = screen.getAllByRole('img');
    expect(preview).toHaveClass('-rotate-4', 'aspect-[1.586]', 'rounded-face', 'transition-colors');
    expect(details).not.toHaveClass('-rotate-4');
  });

  it('is named by its issuer alone when there are no digits', () => {
    renderWithProviders(<CardFace moneyKey="neutral" issuerName="A card" />);
    expect(screen.getByRole('img', { name: 'A card' })).toBeInTheDocument();
  });
});
```

Create `src/components/ui/card-sheet.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { CardSheet } from './card-sheet';
import { Numeral } from './numeral';

beforeAll(async () => {
  await initTestI18n('en');
});

describe('CardSheet (§7.1)', () => {
  it('is a sheet in the card’s colour, named by its heading, with the billing day in the box', () => {
    renderWithProviders(
      <CardSheet
        moneyKey="card-teal"
        name="Max Gold"
        holder="Dana"
        lastDigits="4821"
        billing="Bills on the 10th"
      />,
    );
    const sheet = screen.getByRole('article', { name: 'Max Gold' });
    expect(sheet).toHaveAttribute('data-card-sheet');
    expect(sheet).toHaveAttribute('data-money', 'card-teal');
    expect(screen.getByText('Bills on the 10th')).toHaveAttribute('data-slot', 'mark');
    expect(screen.getByText(/4821/).closest('p')).toHaveClass('font-light');
  });

  it('never shows more than the last 4 digits', () => {
    renderWithProviders(<CardSheet moneyKey="neutral" name="Old card" lastDigits="5555666677778888" />);
    expect(screen.getByRole('article').textContent).not.toContain('5555');
  });

  it('swaps sides from sheet to sheet, and is 124px tall on a phone, 108px from lg', () => {
    renderWithProviders(<CardSheet moneyKey="neutral" name="A" />);
    expect(screen.getByRole('article')).toHaveClass(
      '[&:nth-child(even_of_[data-card-sheet])]:flex-row-reverse',
      'min-h-31',
      'lg:min-h-27',
      'rounded-sheet-s',
    );
  });

  it('holds its month’s spend as a numeral, which a card sheet bleeds at half depth', () => {
    const { container } = renderWithProviders(
      <CardSheet
        moneyKey="issuer-max"
        name="Max"
        figure={<Numeral minor={204_000} currency="ILS" size="card" />}
      />,
    );
    expect(container.querySelector('[data-card-sheet] [data-numeral]')).not.toBeNull();
  });
});
```

Create `src/components/ui/money-tile.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { MoneyTile, MoneyTileGroup } from './money-tile';

beforeAll(async () => {
  await initTestI18n('en');
});

function Issuers({ onChange = vi.fn() }: { readonly onChange?: (value: string) => void }) {
  const [value, setValue] = useState('cal');
  const pick = (next: string) => {
    setValue(next);
    onChange(next);
  };
  return (
    <MoneyTileGroup legend="Who issues this card">
      <MoneyTile
        name="issuer"
        value="isracard"
        checked={value === 'isracard'}
        onChange={pick}
        moneyKey="issuer-isracard"
        label="Isracard"
        otherLabel="ישראכרט"
      />
      <MoneyTile
        name="issuer"
        value="cal"
        checked={value === 'cal'}
        onChange={pick}
        moneyKey="issuer-cal"
        label="Cal"
        otherLabel="כאל"
      />
      <MoneyTile
        name="issuer"
        value="other"
        checked={value === 'other'}
        onChange={pick}
        label="Not listed"
        notListed
      />
    </MoneyTileGroup>
  );
}

describe('MoneyTile (§7.3)', () => {
  it('is a radio in a named group, selected on activation', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Issuers onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Who issues this card' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('radio', { name: /^Isracard/ }));
    expect(onChange).toHaveBeenCalledWith('isracard');
    expect(screen.getByRole('radio', { name: /^Isracard/ })).toBeChecked();
  });

  it('says it is selected in words, in the box, not by colour alone', () => {
    renderWithProviders(<Issuers />);
    const tile = screen.getByRole('radio', { name: /^Cal/ }).closest('label');
    const mark = tile?.querySelector('[data-slot="mark"]');
    expect(mark).toHaveTextContent('Selected ✓');
    expect(mark).toHaveClass('hidden', 'group-has-checked:inline-block');
    expect(tile).toHaveClass('has-checked:shadow-[0_0_0_3px_var(--paper),0_0_0_6px_var(--ink)]');
  });

  it('is a money sheet in its colour, and "Not listed" is transparent with an ink edge', () => {
    renderWithProviders(<Issuers />);
    expect(screen.getByRole('radio', { name: /^Cal/ }).closest('label')).toHaveAttribute(
      'data-money',
      'issuer-cal',
    );
    const other = screen.getByRole('radio', { name: /^Not listed/ }).closest('label');
    expect(other).not.toHaveAttribute('data-sheet');
    expect(other).toHaveClass('inset-ring-2', 'inset-ring-ink');
  });

  it('is at least 70px tall on a phone and 96px from lg, presses only when motion is welcome, and focuses outside its rings', () => {
    renderWithProviders(<Issuers />);
    const tile = screen.getByRole('radio', { name: /^Cal/ }).closest('label');
    expect(tile).toHaveClass(
      'min-h-17.5',
      'lg:min-h-24',
      'motion-safe:active:scale-98',
      'has-focus-visible:outline-3',
      'has-focus-visible:outline-offset-9',
    );
  });
});
```

Run: `pnpm exec vitest run --project dom src/components/ui/card-face.test.tsx src/components/ui/card-sheet.test.tsx src/components/ui/money-tile.test.tsx`
Expected: FAIL: the three modules do not exist.

- [ ] **Step 2: `CardFace`**

Create `src/components/ui/card-face.tsx`:

```tsx
import { cn } from 'cn';
import { useTranslation } from 'react-i18next';

import type { MoneyKey } from '@/domain/money-key';

/** The last digits as a card prints them: digits only, never more than four (gate:pci). */
export function lastFour(digits: string | undefined): string | undefined {
  const only = (digits ?? '').replace(/\D/g, '');
  return only === '' ? undefined : only.slice(-4);
}

/**
 * A card as a card (§7.2): the ISO ratio, the face radius, its colour from a
 * key (`cardKey()`), its type sized by its own width (`cqi`). Its parts are
 * one picture to a screen reader, named "<issuer> ending <last4>".
 *
 * `preview` tilts it −4° (the add-card flow's preview, a decorative stack);
 * `details` lies flat. Its fill and text cross-fade in 150ms when the colour
 * changes, for everyone: a colour fade is not movement (§8.2).
 */
export function CardFace({
  moneyKey,
  issuerName,
  holder,
  lastDigits,
  network,
  later,
  variant = 'details',
  className,
}: {
  readonly moneyKey: MoneyKey;
  readonly issuerName: string;
  readonly holder?: string;
  readonly lastDigits?: string;
  /** The network's name, as printed ("Mastercard"). */
  readonly network?: string;
  /** A line about what comes later, where there is no network yet. */
  readonly later?: string;
  readonly variant?: 'preview' | 'details';
  readonly className?: string;
}) {
  const { t } = useTranslation();
  const last4 = lastFour(lastDigits);
  return (
    <div
      role="img"
      aria-label={last4 === undefined ? issuerName : t('sheets.cardName', { issuer: issuerName, last4 })}
      data-slot="card-face"
      data-sheet="money"
      data-money={moneyKey}
      className={cn(
        'rounded-face @container grid aspect-[1.586] w-full grid-rows-[auto_1fr_auto] px-[8%] pt-[7%]',
        'ease-fill transition-colors duration-(--dur-press)',
        variant === 'preview' && '-rotate-4 shadow-[0_2px_0_color-mix(in_oklch,var(--box)_25%,transparent)]',
        className,
      )}
    >
      <span aria-hidden="true" className="text-[9cqi] leading-[1.05] font-semibold">
        {issuerName}
      </span>
      {holder === undefined ? (
        <span aria-hidden="true" />
      ) : (
        <span aria-hidden="true" className="text-[5.6cqi] font-light">
          {holder}
        </span>
      )}
      <span aria-hidden="true" className="flex items-end justify-between gap-3 pb-[3cqi]">
        {last4 === undefined ? (
          <span />
        ) : (
          <span dir="ltr" className="text-[6cqi] tracking-[0.1em] [unicode-bidi:isolate]">
            •••• {last4}
          </span>
        )}
        <span className="text-[4.6cqi] font-light">{network ?? later}</span>
      </span>
    </div>
  );
}
```

- [ ] **Step 3: `CardSheet`**

Create `src/components/ui/card-sheet.tsx`:

```tsx
import { cn } from 'cn';
import { useId, type ReactNode } from 'react';

import type { MoneyKey } from '@/domain/money-key';

import { lastFour } from './card-face';
import { Mark } from './mark';

/**
 * A card as a sheet (§7.1): its company's or its own colour, its name in
 * 600, the holder and last 4 in 300, the billing day in the box, and this
 * month's spend as a numeral that runs off the foot at half depth (§9.4).
 *
 * Sides swap from sheet to sheet (`:nth-child(even of [data-card-sheet])`),
 * so a stack of them reads as a stack. 124px tall on a phone, 108px from lg.
 */
export function CardSheet({
  moneyKey,
  name,
  holder,
  lastDigits,
  billing,
  figure,
  className,
}: {
  readonly moneyKey: MoneyKey;
  readonly name: string;
  readonly holder?: string;
  readonly lastDigits?: string;
  /** The billing day, worded ("Bills on the 10th"). */
  readonly billing?: string;
  /** This month's spend: a `<Numeral size="card" />`. */
  readonly figure?: ReactNode;
  readonly className?: string;
}) {
  const titleId = useId();
  const last4 = lastFour(lastDigits);
  return (
    <article
      aria-labelledby={titleId}
      data-card-sheet=""
      data-sheet="money"
      data-money={moneyKey}
      className={cn(
        'rounded-sheet-s @container flex min-h-31 items-end justify-between gap-4 overflow-clip px-5 pt-4 lg:min-h-27 lg:px-6.5 lg:pt-4.5',
        '[&:nth-child(even_of_[data-card-sheet])]:flex-row-reverse',
        '[&:nth-child(even_of_[data-card-sheet])_[data-slot=card-sheet-text]]:text-end',
        className,
      )}
    >
      <div data-slot="card-sheet-text" className="self-start pb-4">
        <h3 id={titleId} className="text-[1.1875rem] leading-[1.15] font-semibold lg:text-xl">
          {name}
        </h3>
        {holder === undefined && last4 === undefined ? null : (
          <p className="text-[0.9375rem] font-light">
            {holder}
            {holder !== undefined && last4 !== undefined ? ' · ' : null}
            {last4 === undefined ? null : (
              <span dir="ltr" className="[unicode-bidi:isolate]">
                •••• {last4}
              </span>
            )}
          </p>
        )}
        {billing === undefined ? null : <Mark className="mt-2 inline-block text-[0.8125rem]">{billing}</Mark>}
      </div>
      {figure === undefined ? null : <div className="min-w-0 shrink">{figure}</div>}
    </article>
  );
}
```

- [ ] **Step 4: `MoneyTile`**

Create `src/components/ui/money-tile.tsx`:

```tsx
import { cn } from 'cn';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { MoneyKey } from '@/domain/money-key';

import { Mark } from './mark';

/** A radio group of tiles: 2 across from a 440px container, 1 across below (§6.2). */
export function MoneyTileGroup({
  legend,
  children,
  className,
}: {
  readonly legend: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <fieldset
      className={cn('grid gap-2 border-0 p-0 @min-[27.5rem]:grid-cols-2 @min-[27.5rem]:gap-2.5', className)}
    >
      <legend className="sr-only">{legend}</legend>
      {children}
    </fieldset>
  );
}

/**
 * A selectable money sheet (§7.3): a native radio under the whole tile, so it
 * is selected on activation and a screen reader hears "2 of 7". Selected, it
 * gets two rings - paper inside ink - and "Selected ✓" in the box, so it is
 * never shown by colour alone; focus is a 3px outline 9px outside the rings.
 *
 * "Not listed" is transparent with a 2px ink edge, so it is not a sheet. The
 * flow's own choice list adds moving on after a pick, and keeps the arrow
 * keys from choosing (the add-card spec's `choice-list.tsx`).
 */
export function MoneyTile({
  name,
  value,
  checked,
  onChange,
  label,
  otherLabel,
  moneyKey,
  notListed = false,
}: {
  readonly name: string;
  readonly value: string;
  readonly checked: boolean;
  readonly onChange: (value: string) => void;
  /** The name, in 600. */
  readonly label: string;
  /** The other language's name, in 300 beside it. */
  readonly otherLabel?: string;
  readonly moneyKey?: MoneyKey;
  readonly notListed?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <label
      {...(notListed ? {} : { 'data-sheet': 'money', 'data-money': moneyKey ?? 'neutral' })}
      className={cn(
        'group rounded-tile relative grid min-h-17.5 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5.5 py-2.5 lg:min-h-24',
        'ease-fill transition-[box-shadow,scale] duration-(--dur-press) motion-safe:active:scale-98',
        'has-checked:shadow-[0_0_0_3px_var(--paper),0_0_0_6px_var(--ink)]',
        'has-focus-visible:outline-3 has-focus-visible:outline-offset-9 has-focus-visible:outline-(--focus-ring)',
        notListed && 'inset-ring-2 inset-ring-ink',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => {
          onChange(value);
        }}
        className="absolute inset-0 m-0 cursor-pointer opacity-0"
      />
      <span className="text-[1.3125rem] leading-[1.1] font-semibold lg:text-2xl">{label}</span>
      {otherLabel === undefined ? null : (
        <span dir="auto" className="col-start-1 text-[0.9375rem] font-light group-has-checked:hidden">
          {otherLabel}
        </span>
      )}
      <Mark className="col-start-2 row-start-1 hidden text-sm group-has-checked:inline-block">
        {t('sheets.selected')}
      </Mark>
    </label>
  );
}
```

Run: `pnpm exec vitest run --project dom src/components/ui/card-face.test.tsx src/components/ui/card-sheet.test.tsx src/components/ui/money-tile.test.tsx`
Expected: PASS.

- [ ] **Step 5: The gate, and commit**

Run: `pnpm verify`
Expected: exit 0 (`pnpm gate:pci` green: no field names, only `lastDigits`).

```bash
git add src/components/ui/card-face.tsx src/components/ui/card-face.test.tsx src/components/ui/card-sheet.tsx src/components/ui/card-sheet.test.tsx src/components/ui/money-tile.tsx src/components/ui/money-tile.test.tsx
git commit -m "Cards can be drawn as coloured sheets and faces that never show more than the last four digits, and choices as coloured tiles that say when they are selected" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Phase 2 gate: the matrix with overlays, axe with panels open, offline fonts, the README, `verify:full`

**Files:**

- Modify: `e2e/screens.spec.ts` (overlays), `e2e/07-a11y.spec.ts` (routes, panel, pop-out), `e2e/09-pwa-offline.spec.ts` (fonts and grain offline)
- Modify: `README.md` (`## Design decisions`, `### What the suite cannot check`)

**Interfaces:**

- Consumes: Tasks 9–15. `openAddSheet` (Task 12's version), `data-slot="editor-panel"` (Task 10), `data-slot="popout"` (Task 11), `grain.png` (Task 9).
- Produces: `artifacts/screens/overlay-<name>-<lang>-<theme>-<width>.png` (24 images: 2 overlays × 3 widths × 2 languages × 2 themes).

- [ ] **Step 1: The overlays in the matrix**

Add to the end of `e2e/screens.spec.ts`:

```ts
/**
 * The overlays (§13.3): the add-transaction panel and the Smart import
 * pop-out, at every width, in both languages and themes. The card details
 * pane joins with the Cards screen in phase 3b.
 */
const OVERLAYS = [
  { name: 'transaction-panel', open: (page: Page) => openAddSheet(page), slot: 'editor-panel' },
  {
    name: 'import-popout',
    open: async (page: Page) => {
      await page.goto('/?import=1');
    },
    slot: 'popout',
  },
] as const;

for (const width of LAYOUT_WIDTHS) {
  for (const { lang, locale } of LANGUAGES) {
    test.describe(`${lang} overlays at ${String(width)}`, () => {
      test.use({ locale, viewport: viewportFor(width) });

      for (const theme of THEMES) {
        for (const overlay of OVERLAYS) {
          const name = `overlay-${overlay.name}-${lang}-${theme}-${String(width)}`;
          test(`@screens ${name}`, async ({ page }) => {
            await page.emulateMedia({ colorScheme: theme });
            await completeFirstRun(page, lang, { theme });
            await page.goto('/');
            await overlay.open(page);
            await expect(page.locator(`[data-slot="${overlay.slot}"]`)).toBeVisible();
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(400);
            await page.screenshot({ path: `artifacts/screens/${name}.png` });
          });
        }
      }
    });
  }
}
```

and add `type Page` to the `@playwright/test` import and `import { openAddSheet } from './support/add';`.

Run: `pnpm exec playwright test e2e/screens.spec.ts`
Expected: 120 passing tests (96 screens, 24 overlays).

- [ ] **Step 2: axe on every route, with a panel and a pop-out open**

In `e2e/07-a11y.spec.ts`, add to `BLOCKING`:

```ts
  { route: '/bank-accounts', name: 'bank-accounts', lang: 'he', theme: 'light' },
  { route: '/categories', name: 'categories', lang: 'en', theme: 'dark' },
  { route: '/commitments', name: 'commitments', lang: 'he', theme: 'dark' },
```

add `import { openAddSheet } from './support/add';`, and after the `BLOCKING` loop:

```ts
for (const theme of ['light', 'dark'] as const) {
  test(`@a11y BLOCKING the add-transaction panel, open, ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await completeFirstRun(page, 'en', { theme });
    await page.goto('/');
    await openAddSheet(page);
    await expect(page.locator('[data-slot="editor-panel"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const results = await new AxeBuilder({ page })
      .withTags(TAGS)
      .include('[data-slot="editor-panel"]')
      .analyze();
    expect(results.violations, summarise(results)).toEqual([]);
  });

  test(`@a11y BLOCKING the Smart import pop-out, open, ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await completeFirstRun(page, 'he', { theme });
    await page.goto('/?import=1');
    await expect(page.locator('[data-slot="popout"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const results = await new AxeBuilder({ page }).withTags(TAGS).include('[data-slot="popout"]').analyze();
    expect(results.violations, summarise(results)).toEqual([]);
  });
}
```

Run: `pnpm exec playwright test e2e/07-a11y.spec.ts`
Expected: every BLOCKING test passes. A colour-contrast violation means a token pair is missing from `contrast.test.ts` or `money-colours.test.ts`: add the pair there, fix the token, and re-run both.

- [ ] **Step 3: Fonts and grain, offline**

Add to the `@pwa offline` describe in `e2e/09-pwa-offline.spec.ts`:

```ts
test('draws the feed in Karantina and Plex, on the grain, with the network gone', async ({ page }) => {
  await installServiceWorker(page);
  await completeFirstRun(page, 'en', { origin: ORIGIN });
  await goOffline();
  await page.reload();

  await expect(page.getByRole('main')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ({
    karantina: document.fonts.check('700 44px Karantina', '0123456789'),
    plex: document.fonts.check('400 16px "IBM Plex Sans Hebrew"', 'Feed'),
  }));
  expect(fonts).toEqual({ karantina: true, plex: true });

  // The grain is a precached same-origin file, not a request that failed.
  const grain = await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      const keys = await (await caches.open(name)).keys();
      if (keys.some((request) => /\/assets\/grain-[\w-]+\.png/.test(request.url))) return true;
    }
    return false;
  });
  expect(grain).toBe(true);
});
```

Run: `pnpm exec playwright test e2e/09-pwa-offline.spec.ts`
Expected: PASS.

- [ ] **Step 4: Look at every image**

Open each new image in `artifacts/screens/` with the Read tool, against `money-sheets-bold-v2.html`'s desktop and phone frames and its pop-out, and check:

- desktop: the rail is paper with a 2px line at its inline end, the outlined "B" mark, the sapphire Add, text pills with Feed (or the current screen) filled with ink, a line, the set-up places, the account at the foot; on the right in Hebrew;
- `main` fills the window less the rail: no empty pad on the far side at 1920; each screen is still its single column, centred;
- the phone: four text pills at the bottom, no icons; the screen name in Karantina; the feed's pills and balance on an ink sheet; the Add pill centred above the bar;
- the add panel: a rounded sheet at the inline end (left in Hebrew) from 1440, a bottom sheet at 390, Cancel and Save side by side at its foot;
- the import pop-out: centred, 1140 wide at most, dialog radius, a blurred dim page round it; full screen at 390;
- the paper grain is there and faint; nothing is clipped in Hebrew; ₪ is on the correct end.

Fix what fails in the task that owns it, then retake.

- [ ] **Step 5: The README**

In `README.md`, under `## Design decisions`, add after the "Ink on paper; money in colour" paragraph:

```md
**A desktop that uses its width.** From `lg` the shell is a text rail at the
inline start — places only, Add a button at its top — and `main` is a size
container: screens lay out by the room they have (`@board/main:`,
`@wide/main:`, `@vast/main:`), so a screen beside an open panel, or inside a
pop-out, still fits. Editors are one Base UI dialog with responsive classes: a
bottom sheet on a phone, a panel at the inline end from `lg`, so resizing
never loses what was typed. Flows open as a pop-out that lays itself out by
its own width. The rail's Add opens its editor over any screen
(`src/app/shell-editors.tsx`).
```

In `### What the suite cannot check`, extend the Colour of money sentence from Task 8 with: `, and for phase 2 (with the transaction panel and the import pop-out) on **YYYY-MM-DD**.`, writing the date of Step 4's review.

- [ ] **Step 6: The full gate**

Run: `pnpm verify:full`
Expected: exit 0: verify, the hostile-timezone run, knip (the new `src/components/ui/*` modules are in knip's ignore list, and `src/components/app-mark.tsx` is used by the rail and the screen head), every Playwright spec in all three projects (`22-numerals` reports skipped until phase 3), and Lighthouse at its existing thresholds (the grain is a 17 KB precached file and must not lower the performance score).

- [ ] **Step 7: Commit**

```bash
git add e2e/screens.spec.ts e2e/07-a11y.spec.ts e2e/09-pwa-offline.spec.ts README.md
git commit -m "The browser gates cover every screen with the panel and the pop-out open, offline fonts and grain, and the README explains the desktop shell" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Going live is the controller's job after the final review: merge, then `pnpm release`. There is no migration and no change to stored data: `Category.hue` is optional and older builds keep it untouched.

---

## After the last task

Phase 3 lays out the screens one per branch, each in its own feature folder, using the shared components without changing them (a change a screen needs in a shared component goes in a small PR of its own first, §11):

- **3a** Feed (§5.1): balance, month, categories, transactions and wallet sheets on the board; the virtualiser's `scrollMargin` re-measured; the collapsed bar across the content box; the search pill and the month picker in the top bar; body text at 17px/1.55 (§9.5).
- **3b** Cards (§5.3), after or on top of the add-card flow: `CardSheet`s, the summary sheet, the details pane with `?card=`, and `CardFace` taking over `CardPanel`'s face (§6.4). The card details overlay joins the screenshot matrix here.
- **3c** Bank accounts (§5.4): each account a sheet in its bank's colour.
- **3d** Cash (§5.5): the pot as a `cash` sheet, one sheet per person. 3a uses whatever 3d lands.
- **3e** Chart (§5.2): the plot and the stats sheet.
- **3f** Categories (§5.6): hue pills, monochrome icons, `HueBars`, and the hue picker that writes `Category.hue`.
- **3g** Settings (§5.7): two panes from board width, `/settings` replaced by `/settings/account` on desktop, the 44px pass on Account linking, and the linked people's avatars at the rail's foot.
- **3h** Smart import (§5.9): `PopOutSteps` and `PopOutPreview` for its three steps.
- **3i** Commitments (§5.8).
- **3j** Motion clean-up, last: the remaining transitions move into `no-preference`, and the old global reduced-motion rule goes.

The **add-card flow** (branch `add-card-flow`) starts once phase 2 lands, in parallel with phase 3 except 3b. It uses `PopOut` with steps and preview, `CardFace` (`cardKey()`), `MoneyTile` with its `choice-list.tsx` behaviour (moving on after 150ms, arrow keys never choosing), and the card swatches from `--money-card-*`. Its spec's "centred, `max-w-md`" window is amended to point at §6.2 (decision 31).

`e2e/22-numerals.spec.ts` stops skipping as soon as a phase 3 screen draws a `Numeral`; from then on it is a real gate.

## Parallel groups

Tasks in braces touch disjoint files and can run in parallel worktrees; arrows are order.

**Phase 1:** {1, 6, 7} → 2 → 3 → {4, 5} → 8

- 1, 6 and 7 share no file: 1 is `color.ts`, `css-tokens.ts`, the token blocks of `index.css` and `contrast.test.ts`; 6 is domain and repo code; 7 is `index.html`, the manifest lines of `vite.config.ts`, `boot.ts` and `brand-colours.test.ts`.
- 2 and 3 both write `index.css`, after 1.
- 3 runs before 5 because its squeezed-icon fixes land in whatever component the reset squeezes, which could be a Cards file.
- 4 and 5 share no file: 4 is fonts, `vite.config.ts`'s plugins (after 7's manifest edit), the weight sweep and `README.md`; 5 is the money keys, card and bank-account screens, `brands.ts` and `e2e/14`.

**Phase 2:** 9 → {10, 11, 12, 14, 15} → 13 → 16

- 9 lands every string and stylesheet rule the others use, so none of them touches `common.json` or `index.css`.
- 10 (editors), 11 (pop-out and its three flows), 12 (shell, rail, Add, `e2e/00`, `e2e/08`, `e2e/support/add.ts`), 14 (money maths, `Numeral`, `HueBars`) and 15 (card and tile components) share no file.
- 13 waits for 10 (`categories-screen.tsx`) and 12 (`app-shell.tsx`, `e2e/08-polish.spec.ts`).
- 16 runs last, over everything.

## Self-review

**Spec coverage, phase 1 (§11):** house tokens (1.1) → Task 1; money tokens (1.3), hues (1.4), the `[data-sheet]`/`[data-money]`/`[data-hue]` mapping (1.5, 1.6), forced colours (1.8) → Task 2; `color-scheme` meta and dark parity (1.7) → Tasks 1, 2, 7; radius, gap and motion tokens, `hover-fine`, the reset rule by rule (§8.1, §9.1, §10) → Task 3; fonts, imports, fallback faces, the stack comment, the preload plugin, `globIgnores`, the three old packages out, `font-bold` out, `font-synthesis: none`, `legal.css` (§2) → Task 4; `money-key.ts`, card colours as fills, `brandColor()` retiring (§1.3, §1.5) → Task 5; `category-hue.ts`, `BUILTIN_HUES`, `Category.hue`, its schema, the rollout test, a new category's least-used hue (§1.4) → Task 6; theme colour, manifest, boot script (§3) → Task 7; the §13 tests for all of these → Tasks 1–8.

**Spec coverage, phase 2 (§11):** rail and tab-bar pills (4.2), `main` as a container (4.3), Add in the rail on every screen → Task 12; `SheetContent` logical sides, `EditorPanel`, every 6.3 panel editor → Task 10; `PopOut` and the three 6.3 pop-out editors → Task 11; `ScreenHead`, `TitlePair`, `useThemeColor()` → Tasks 9 and 13; `CardSheet`, `CardFace`, `MoneyTile` → Task 15; `HueBars`, `MoneyStrip`, `Numeral`, `sharesBp()` → Task 14; `Mark`, the `Button` variants, the grain → Task 9; view-transition plumbing → Tasks 9 and 12; §13.2 DOM and §13.3 e2e → each task plus Task 16.

**Spec gaps resolved here** (each is said where it is applied):

1. `--input` "unchanged" fails decision 15 on the new paper (2.72:1 light, 2.98:1 on the dark sheet): new values that pass 3:1 on both surfaces (Task 1).
2. A token cannot alias itself inside a sheet (`--foreground` → `--on-fill` → `--foreground`): five literal house colours with the shadcn names as aliases; the black box's literal is `--box-fill`, so `--box` can flip on the ink sheet (Tasks 1, 2).
3. `--muted`, `--secondary`, `--destructive`, `--chart-*` and `--primary-hover` are not in §1.1: values chosen on the new paper and pinned by the contrast test; `--primary-hover` (unused) removed (Task 1).
4. One grain image at two strengths: a veil of the surface's own colour over the tile sets 7.5% (multiply) and 6% (screen) from one file (Task 9).
5. `ScreenSheet` is not yet `data-sheet="paper"`: today's quiet text would turn full-strength inside a sheet (Task 13).
6. The phone keeps the account menu in the screen head (Settings is reached from it on a phone); the top bar's search pill and month picker, the rail foot's linked avatars, and the Settings two panes come with their screens in phase 3 (Tasks 12, 13).
7. The rail's Add on screens that host no editor: `ShellEditors` mounts the address-driven editors there (Task 12).
8. Smart import moves into the pop-out with its body only in phase 2; its steps and preview are 3h (Task 11).
9. Phase 2's new browser checks live in new spec files (`16`–`22`) rather than in `08-polish`, so parallel tasks never edit one file; `@numerals` reports skipped until a screen draws a `Numeral`.
10. The three `@fontsource` packages' file names were read from the 5.3.0 tarballs, so the preload pattern matches what Vite emits.

**Placeholder scan:** no "TBD", "TODO", "similar to Task N" or "add error handling". The two `YYYY-MM-DD` strings in Tasks 8 and 16 are the dates of the human screenshot reviews, filled in at review time by instruction. Every code step shows its code; the two mechanical renames (Tasks 10, 13) are given as exact `sed`/`perl` commands with the hand edits listed after them.

**Type consistency:** `MoneyKey`, `cardKey`, `issuerKey`, `methodKey` (Task 5) are what Tasks 15's components and tests take. `HueToken` and `categoryHue` (Task 6) are what `HueBarItem.hue` takes (Task 14). `TitlePair`'s `size` values (Task 9) are the ones `ScreenHead`, `EditorPanelTitle`'s utilities and `PopOut` use. `useDesktop`/`useMediaQuery` (Task 12) are used by `AddMenu` and the shell only. `setThemeColor` (Task 7) is what `useThemeColor` (Task 13) calls. `NUMERAL_MAX` and `NumeralSize` (Task 14) are what `CardSheet`'s test passes. `data-slot` names are the same in the stylesheet (Task 9) and the components (Tasks 10, 11, 13, 14): `editor-panel`, `editor-actions`, `popout`, `popout-layout`, `popout-steps`, `popout-body`, `popout-preview`, `popout-close`, `popout-actions`, `hero-sheet`, `screen-sheet`, `screen-head`, `content-box`, `tab-bar`.

**Review Focus:** each line has its test in the owning task: runtime theme change (Task 7 `boot.test.ts`, Task 13 `use-theme-color.test.tsx`), forced colours (Task 5, `e2e/14`), Add from a screen without editors (Task 12, `e2e/20`), older-build data on the card face (Task 5, `cards-screen-menu.test.tsx`), a panel over a panel (Task 10, `editor-panel.test.tsx`).
