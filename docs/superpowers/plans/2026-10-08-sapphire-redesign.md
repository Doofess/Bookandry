# Sapphire Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The brand turns from green to Sapphire, every screen opens on the front door's engraved deep-blue panel with the content rising over it as a sheet, icons go monochrome, the + button becomes a labelled "Add" pill with a menu, and seven small anchored pop-out menus replace sheets and dead chips.

**Architecture:**

- **Tokens first.** Every colour change lives in `src/index.css` tokens and is proven by `src/lib/contrast.test.ts`. Components only ever name tokens (`bg-brand-deep`, `text-primary`, `bg-accent`), never hex.
- **One panel component.** `BrandPanel` (`src/components/brand-panel.tsx`) wraps the existing `Engraving` with a new compact ring set. Each screen root puts its title (or the feed's balance block) inside it and its body on a `PanelSheet` that overlaps the panel's foot.
- **One pop-out vocabulary.** The `popover.tsx` and `dropdown-menu.tsx` wrappers gain `anchor`, an arrow, and the rounded blue-shadowed surface. Every pop-out is one of those two wrappers. Screen-level single instances are anchored to the row's control through base-ui's `anchor` prop on `Popover.Positioner` / `Menu.Positioner`.
- **Writes reuse existing paths.** The category change and "Charged today" go through `src/db/series-edit.ts` and `src/db/occurrence-actions.ts` exactly as the edit form does. Nothing new is written to the database schema.

**Tech Stack:** React 19, TypeScript, Tailwind v4, base-ui (`@base-ui/react` 1.8.0) through `src/components/ui/`, Dexie, i18next (en/he, RTL), Vitest (projects unit/db/dom), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-sapphire-redesign-design.md`
**Mockups:** `.superpowers/brainstorm/60424-1791415115/content/{deep-blue,plus-button,popouts}.html`

**Runs after:** `docs/superpowers/plans/2026-10-08-card-catalog.md` has landed. Task 12 consumes its Task 7 `RateTable` (inside `card-fields.tsx`) and its Task 5 `CardDetails.catalog`, and Tasks 3 and 12 edit the Cards screen its Task 9 changes. Plan against that landed code: where a line number here has drifted, find the quoted code instead.

## Global Constraints

- **Colours are the spec's, exactly.** Light / dark:
  - `--brand-deep` `#0F3A8A` oklch(0.374 0.142 261.5) / `#0B2C6B` oklch(0.314 0.117 261.7);
  - `--brand-vivid` `#56A0FF` oklch(0.702 0.158 255.6), both modes, lines and the logo only, never text on light;
  - `--primary` `#1D4FB8` oklch(0.462 0.175 262.6) / `#8CB8FF` oklch(0.779 0.113 259.7);
  - `--primary-hover` `#0F3A8A` / a lighter step of `#8CB8FF`;
  - `--ring` `#2563EB` / `#8CB8FF`;
  - `--accent` `#EAF2FF` / a deep sapphire tint, with `--accent-foreground` `--brand-deep` / `#8CB8FF`;
  - `--income` and `--chart-income` stay green.
- **Gate.** `pnpm verify` exits 0 at the end of every task. Node and pnpm are in `%LOCALAPPDATA%\node`: in Git Bash `export PATH="$LOCALAPPDATA/node:$PATH"`, in PowerShell `$env:PATH = "$env:LOCALAPPDATA\node;$env:PATH"`.
- **RTL.** Logical utilities only (`ms-`, `pe-`, `start-`, `end-`, `text-start`, `rounded-s-`); `pnpm gate:rtl` stays green.
- **Copy.** Every new string goes in both `src/i18n/locales/en/*.json` and `he/*.json`. Hebrew copy from the spec, verbatim: הוספה, הוצאה, הכנסה, ייבוא חכם, שכפול, רק הפעם, מעכשיו והלאה, נגבה היום.
- **Fonts.** `font-family` appears only in `src/index.css`. Components use the `font-display` utility for Frank Ruhl Libre.
- **Amounts.** Amount columns in lists stay in the sans stack. Only the panel's balance and forecast are in the serif.
- **Touch targets.** Every interactive target, including every pop-out item, is at least 44px high on phones (`min-h-11`).
- **Commits** use a plain-English sentence as the subject and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **The feed scrolls while a row's pop-out is open** (row ⋯, category, not-counted-yet). The virtualiser unmounts the anchor row; the pop-out must close, never float at the page's top-left or act on the wrong row. Pinned in Task 7, reused by Tasks 10 and 11.
- **A series category change "From now on" on the series' first occurrence, or on an occurrence that already has an override.** It must give exactly what the edit form gives for the same choice, and undo must restore the series and its overrides byte for byte. Pinned in Task 10.
- **"Charged today" on an occurrence that already has a `modify` override** (its amount was changed). The amount and note survive; only the date moves; undo restores the earlier override, not a bare occurrence. Pinned in Task 11.
- **Hebrew at 320px.** The longest Hebrew month name in the month pill, the profile pill and the prime pill wrap onto two lines and nothing scrolls sideways; the balance steps down below 360px. Pinned in Tasks 4 and 13.
- **A stale or hand-typed `?add=` value** (`add=1`, `add=transfer`, `add=` after a reload). `add=1` and anything unknown open an expense; nothing throws. Pinned in Task 6.

## Tasks

Tasks 3 and 4 are swapped from the first outline. Moving the logo and account menu out of the shell's phone header into the panels changes every screen at once, so the shared `ScreenPanel` and the shell come first. Otherwise the screens other than the feed would lose their account menu for one commit.

1. Sapphire tokens, logo, favicon, PWA and theme colours, and the contrast tests.
2. `BrandPanel`, the compact engraving, `panelPill`, and drawing the guilloche in once.
3. The shell: every screen's panel with the logo and account menu, the desktop rail, and the tab bar.
4. The feed's panel and collapsed bar, and the prime pill with its pop-out (5.7).
5. Monochrome category icons.
6. `AddButton`, its menu, and presetting the kind.
7. Wrapper `anchor` support and the row ⋯ menu with Duplicate (5.1).
8. The month pop-out (5.2).
9. The balance and forecast pop-outs with a shared data hook (5.3).
10. The category pop-out and its series question (5.4).
11. The "not counted yet" pop-out (5.5).
12. The card ⋯ menu (5.6).
13. E2E polish, accessibility and screenshots, and the README.

---

### Task 1: Sapphire tokens, logo, favicon, PWA and theme colours

**Files:**

- Modify: `src/index.css:26-137` (the token blocks and their comments), and the `.front-door` comments in `src/index.css`
- Modify: `src/components/logo.tsx` (doc comment only; the disc already reads `fill-primary dark:fill-brand-vivid`)
- Modify: `public/favicon.svg`, `pwa-assets.config.ts`, `vite.config.ts:131-132`, `index.html:11`
- Regenerate: `public/pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico` (`pnpm icons`)
- Test: `src/lib/contrast.test.ts`; Create: `src/lib/brand-colours.test.ts`

**Interfaces:**

- Produces (Tailwind utilities every later task uses): `bg-brand-deep`, `text-brand-deep-foreground`, `stroke-brand-vivid`, `ring-brand-vivid`, `bg-primary`, `text-primary`, `bg-accent`, `text-accent-foreground`, `ring-ring`.
- Note: the FAB tokens `--fab`, `--fab-foreground` and `--fab-rim` are **not** removed here. `Fab` still uses them until Task 6 replaces it, and removing them now would leave the feed with an invisible button for five commits. Task 6 deletes them together with `fab.tsx` and their two contrast pairs.

Computed values (sRGB hex to OKLCH with Björn Ottosson's matrices, the same ones `src/lib/color.ts` uses):

| Token                     | Light                              | Dark                                     |
| ------------------------- | ---------------------------------- | ---------------------------------------- |
| `--brand-deep`            | `#0F3A8A` oklch(0.374 0.142 261.5) | `#0B2C6B` oklch(0.314 0.117 261.7)       |
| `--brand-deep-foreground` | oklch(0.985 0.008 262)             | oklch(0.985 0.008 262)                   |
| `--brand-vivid`           | `#56A0FF` oklch(0.702 0.158 255.6) | same                                     |
| `--primary`               | `#1D4FB8` oklch(0.462 0.175 262.6) | `#8CB8FF` oklch(0.779 0.113 259.7)       |
| `--primary-foreground`    | oklch(1 0 0)                       | `#0B1F4A` oklch(0.253 0.084 263), 7.96:1 |
| `--primary-hover`         | `#0F3A8A` oklch(0.374 0.142 261.5) | `#A9CBFF` oklch(0.836 0.082 258.8)       |
| `--ring`                  | `#2563EB` oklch(0.546 0.215 262.9) | `#8CB8FF` oklch(0.779 0.113 259.7)       |
| `--accent`                | `#EAF2FF` oklch(0.959 0.019 260.2) | `#1A2F5C` oklch(0.314 0.085 263.5)       |
| `--accent-foreground`     | `#0F3A8A` oklch(0.374 0.142 261.5) | `#8CB8FF` oklch(0.779 0.113 259.7)       |

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/contrast.test.ts`, inside `PAIRS` after the `secondary-foreground` line:

```ts
  // Sapphire. The brand is a TEXT colour now (links, the active tab), not only a fill.
  { name: 'primary as text on background', on: 'background', text: 'primary', min: TEXT },
  { name: 'primary as text on card', on: 'card', text: 'primary', min: TEXT },
  { name: 'primary as text on popover', on: 'popover', text: 'primary', min: TEXT },
  // The active phone tab: a sapphire icon and label on the soft accent pill.
  { name: 'primary on accent', on: 'accent', text: 'primary', min: TEXT },
  // A focused menu item: the popover's own text on the accent highlight.
  { name: 'popover-foreground on accent', on: 'accent', text: 'popover-foreground', min: TEXT },
  // The panel: every title, figure and pill label on it.
  {
    name: 'brand-deep-foreground on brand-deep',
    on: 'brand-deep',
    text: 'brand-deep-foreground',
    min: TEXT,
  },
  { name: 'ring against card', on: 'card', text: 'ring', min: COMPONENT },
```

Add after the `describe.each` block:

```ts
/*
 * Dark-only pairs. The Add pill's 1px brand-vivid ring exists only in dark
 * mode, where the deep pill alone would not show its boundary on the
 * near-black page. In light mode the pill itself is 10.5:1 against white.
 */
describe('dark theme only', () => {
  it('the Add pill ring is at least 3:1 against the page', () => {
    expect(contrastRatio(get(DARK, '--background'), get(DARK, '--brand-vivid'))).toBeGreaterThanOrEqual(
      COMPONENT,
    );
  });
});

describe('the brand', () => {
  it('is sapphire, not green', () => {
    // Hue 261.5 is the spec's #0F3A8A. Green sat at 156-158.
    expect(get(LIGHT, '--brand-deep')).toEqual({ l: 0.374, c: 0.142, h: 261.5 });
    expect(get(DARK, '--brand-deep')).toEqual({ l: 0.314, c: 0.117, h: 261.7 });
    expect(get(LIGHT, '--primary')).toEqual({ l: 0.462, c: 0.175, h: 262.6 });
    expect(get(DARK, '--primary')).toEqual({ l: 0.779, c: 0.113, h: 259.7 });
  });

  it('keeps income green', () => {
    expect(get(LIGHT, '--income').h).toBeCloseTo(156.1, 1);
    expect(get(DARK, '--chart-income').h).toBeCloseTo(159.7, 1);
  });
});
```

Create `src/lib/brand-colours.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The colours that live OUTSIDE index.css: the phone's status bar, the
 * favicon and the installed icon's background. A token change cannot reach
 * these, so they are pinned here.
 */
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('brand colours outside the token file', () => {
  it('index.html sets the status bar to the panel colour in each theme', () => {
    const html = read('index.html');

    expect(html).toContain(
      '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#0F3A8A" />',
    );
    expect(html).toContain(
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0B2C6B" />',
    );
    expect(html).not.toContain('content="#ffffff"');
  });

  it('the manifest theme colour is sapphire', () => {
    expect(read('vite.config.ts')).toContain("theme_color: '#0F3A8A'");
  });

  it('the favicon and the PWA icon backgrounds are sapphire', () => {
    expect(read('public/favicon.svg')).toContain('#0F3A8A');
    expect(read('public/favicon.svg')).not.toContain('#16794a');
    expect(read('pwa-assets.config.ts').match(/#0F3A8A/g)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm exec vitest run --project unit src/lib/contrast.test.ts src/lib/brand-colours.test.ts`
Expected: FAIL. "is sapphire, not green" fails on hue 158, and all three `brand-colours` tests fail.

- [ ] **Step 3: Replace the token blocks**

In `src/index.css`, replace the header comment above `:root` (lines 26-37) with:

```css
/* ---------------------------------------------------------------------------
   Design tokens.

   Contrast-audited against WCAG 2.2 AA, and every pair the design depends on
   is re-checked by src/lib/contrast.test.ts.

   The brand is SAPPHIRE (#0F3A8A deep, #56A0FF vivid). Green survives only as
   money coming in (--income, --chart-income); red is money going out.
   --brand-vivid is for lines and the logo, never text on a light background
   (it is 2.67:1 on white).

   --border (decorative) and --input (an affordance needing 3:1) are separate
   tokens on purpose; shadcn ships them at the same value, which fails 1.4.11.
--------------------------------------------------------------------------- */
```

In `:root`, replace the `--primary`, `--primary-foreground` and `--primary-hover` lines and their comment with:

```css
/* #1D4FB8 — white text 7.34:1; as text on white 7.34:1 */
--primary: oklch(0.462 0.175 262.6);
--primary-foreground: oklch(1 0 0);
--primary-hover: oklch(0.374 0.142 261.5); /* #0F3A8A */
```

the `--accent` and `--accent-foreground` lines with:

```css
--accent: oklch(0.959 0.019 260.2); /* #EAF2FF: icon tint, menu highlight */
--accent-foreground: oklch(0.374 0.142 261.5); /* #0F3A8A, 9.36:1 */
```

the `--ring` line with:

```css
--ring: oklch(0.546 0.215 262.9); /* #2563EB, 5.17:1 focus ring */
```

and the `--brand-vivid`, `--brand-deep` and `--brand-deep-foreground` lines and their comments with:

```css
/* Lines and the logo ONLY. Never text on a light background. */
--brand-vivid: oklch(0.702 0.158 255.6); /* #56A0FF */
/* The engraved panel, the front door's and every screen's. White text on it
     measures 10.5:1. */
--brand-deep: oklch(0.374 0.142 261.5); /* #0F3A8A */
--brand-deep-foreground: oklch(0.985 0.008 262);
```

In `.dark`, replace the same lines with:

```css
--primary: oklch(0.779 0.113 259.7); /* #8CB8FF, 9.87:1 on the page */
--primary-foreground: oklch(0.253 0.084 263); /* #0B1F4A deep navy, 7.96:1 */
--primary-hover: oklch(0.836 0.082 258.8); /* #A9CBFF */
```

```css
--accent: oklch(0.314 0.085 263.5); /* #1A2F5C, a deep sapphire tint */
--accent-foreground: oklch(0.779 0.113 259.7); /* #8CB8FF, 6.49:1 */
```

```css
--ring: oklch(0.779 0.113 259.7);
```

```css
--brand-vivid: oklch(0.702 0.158 255.6);
--brand-deep: oklch(0.314 0.117 261.7); /* #0B2C6B, white text 13.2:1 */
--brand-deep-foreground: oklch(0.985 0.008 262);
```

Leave `--income`, `--expense`, all `--chart-*`, and the `--fab*` lines unchanged.

Replace the comment above `.front-door {` with:

```css
/* The front door shows one blue. Its filled buttons and links take the
   engraved panel's deep sapphire, not the app's brighter primary beside it:
   on white, the deep sapphire measures 10.5:1. */
```

and the comment above `.dark .front-door .text-primary` with:

```css
/* On a near-black page deep sapphire text would vanish; links there take the
   logo's vivid blue, the same family, at 7.45:1. Fills keep the panel's. */
```

- [ ] **Step 4: Logo, favicon, PWA and theme colour**

`src/components/logo.tsx`, the `tone` doc comment becomes:

```tsx
/** 'inverse': a light disc, for the deep sapphire panel. */
```

`public/favicon.svg`, the `<style>` block becomes:

```svg
  <style>
    .bg { fill: #0F3A8A; }
    .paper { fill: #ffffff; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: #56A0FF; }
      .paper { fill: #0b0b0d; }
    }
  </style>
```

`pwa-assets.config.ts`: both `resizeOptions: { background: '#16794a' }` become `resizeOptions: { background: '#0F3A8A' }`.

`vite.config.ts`: `theme_color: '#ffffff'` becomes `theme_color: '#0F3A8A'`. Leave `background_color: '#ffffff'`, the splash behind the white sheet.

`index.html`: replace `<meta name="theme-color" content="#ffffff" />` with:

```html
<!-- The status bar runs straight into the sapphire panel at the top of every screen. -->
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#0F3A8A" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0B2C6B" />
```

Regenerate the PWA icons by running `pnpm icons`. Expected: it rewrites the six files listed under **Files** and prints their names. Open `public/maskable-icon-512x512.png` and `public/apple-touch-icon-180x180.png` with the Read tool and confirm a blue disc on a blue ground.

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm exec vitest run --project unit src/lib/contrast.test.ts src/lib/brand-colours.test.ts`
Expected: PASS, every pair in both themes. If a pair fails, fix the token, never the threshold.

- [ ] **Step 6: Gate.** Run `pnpm verify`. Expected: exit 0. The screenshots in `e2e/screens.spec.ts` are retaken in Task 13, not here.

- [ ] **Step 7: Commit**

```bash
git add src/index.css src/lib/contrast.test.ts src/lib/brand-colours.test.ts src/components/logo.tsx public/favicon.svg public/*.png public/favicon.ico pwa-assets.config.ts vite.config.ts index.html
git commit -m "The brand turns sapphire, and green is left to mean money coming in" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The brand panel, the compact engraving, and drawing it in once

**Files:**

- Move: `src/features/account/engraving.tsx` → `src/components/engraving.tsx` (`git mv`; it is now shared by the front door and every screen)
- Modify: `src/components/engraving.tsx` (variants, the draw-in-once rule)
- Create: `src/components/brand-panel.tsx` (`BrandPanel`, `PanelSheet`, `panelPill`)
- Modify: `src/features/account/auth-layout.tsx` (import path; `ThemeSwitch` and `LanguageSwitch` use `panelPill`)
- Modify: `src/index.css` (the `.engraving-drawn` rule)
- Test: Create `src/components/engraving.test.tsx`, `src/components/brand-panel.test.tsx`

**Interfaces:**

- Consumes: the Task 1 tokens `bg-brand-deep`, `text-brand-deep-foreground`, `text-brand-vivid`.
- Produces:
  - `Engraving({ className?: string; variant?: 'full' | 'compact' | 'bands' })`. `'full'` is the front door's drawing, unchanged. `'compact'` is a small ring set in the drawing's top-left corner (the caller mirrors it with `rtl:-scale-x-100`, so it sits in the inline-start top corner). `'bands'` is the foot's sine bands only, for the desktop rail.
  - `BrandPanel({ children: ReactNode; className?: string; engraving?: 'compact' | 'bands' })`: a `div[data-slot=brand-panel]`, `bg-brand-deep text-brand-deep-foreground`, the engraving behind its children in `text-brand-vivid/45`. Padding and radius come from `className`.
  - `PanelSheet({ children: ReactNode; className?: string })`: a `div[data-slot=panel-sheet]` with `relative -mt-6 rounded-t-3xl bg-background`, the content rising over the panel's foot.
  - `panelPill: string`: the outlined pill class for a `Button variant="ghost"` on the panel. At least 44px high on phones (`min-h-11`), 36px from `sm`. It includes `aria-expanded:` styles, because Tasks 3 and 8 put pop-out triggers on the panel.

Background:

- Today `.engraving path` animates every path on every mount (`src/index.css`, the `engrave` keyframes). With a panel on every screen that would replay on each tab change. The rule becomes: the first commit that mounts any `Engraving` draws in; every later mount gets `engraving-drawn`, which turns the animation off and leaves the lines fully drawn (`stroke-dasharray: 1` with the default `stroke-dashoffset: 0` is a solid line).
- The flag is set in an effect, not in the `useState` initializer, because React's StrictMode calls initializers twice in development and the second call would see the flag already set. Every panel mounted in the first commit (the desktop rail and the content panel) reads `false` and draws in together.
- Reduced motion already turns the animation off in CSS and still does.

- [ ] **Step 1: Move the file**

Run: `git mv src/features/account/engraving.tsx src/components/engraving.tsx`. In `src/features/account/auth-layout.tsx` change `import { Engraving } from './engraving';` to `import { Engraving } from '@/components/engraving';`.

- [ ] **Step 2: Write the failing tests**

Create `src/components/engraving.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Engraving } from './engraving';

/*
 * One test, in order: the "drawn already" flag is module state, and Vitest
 * gives each test FILE a fresh module, so the first render below is the app's
 * first panel.
 */
describe('Engraving', () => {
  it('draws in on the first screen only, every panel of it together', () => {
    const first = render(
      <>
        <Engraving variant="bands" />
        <Engraving variant="compact" />
      </>,
    );
    const firstSvgs = first.container.querySelectorAll('svg');
    expect(firstSvgs).toHaveLength(2);
    for (const svg of firstSvgs) expect(svg).not.toHaveClass('engraving-drawn');
    first.unmount();

    // Navigating to another screen mounts a new panel: drawn already.
    const second = render(<Engraving variant="compact" />);
    expect(second.container.querySelector('svg')).toHaveClass('engraving-drawn');
  });

  it('gives the compact set a short drawing anchored to the top corner', () => {
    const { container } = render(<Engraving variant="compact" />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('viewBox', '0 0 800 300');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'xMinYMin slice');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the front door drawing as it was', () => {
    const { container } = render(<Engraving />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('viewBox', '0 0 800 1000');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'xMaxYMax slice');
    // 4 ring sets (5+5+4+3 copies) and 2 bands (6+4 copies).
    expect(container.querySelectorAll('path')).toHaveLength(27);
  });

  it('draws only the bands for the rail', () => {
    const { container } = render(<Engraving variant="bands" />);

    expect(container.querySelectorAll('path')).toHaveLength(10);
  });
});
```

Create `src/components/brand-panel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandPanel, PanelSheet, panelPill } from './brand-panel';
import { Button } from './ui/button';

describe('BrandPanel', () => {
  it('is the deep panel with its engraving behind the content', () => {
    const { container } = render(
      <BrandPanel className="px-4">
        <h1>Cards</h1>
      </BrandPanel>,
    );
    const panel = container.querySelector('[data-slot="brand-panel"]');

    expect(panel).toHaveClass('bg-brand-deep', 'text-brand-deep-foreground', 'px-4');
    expect(panel?.querySelector('svg.engraving')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('heading', { name: 'Cards' })).toBeInTheDocument();
  });

  it('draws the rail with bands only', () => {
    const { container } = render(<BrandPanel engraving="bands">x</BrandPanel>);

    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 800 1000');
  });
});

describe('PanelSheet', () => {
  it('rises over the panel foot exactly as the sign-in form does', () => {
    const { container } = render(<PanelSheet>body</PanelSheet>);

    expect(container.firstElementChild).toHaveClass('-mt-6', 'rounded-t-3xl', 'bg-background');
  });
});

describe('panelPill', () => {
  it('is an outlined pill at least 44px high on a phone', () => {
    render(
      <Button variant="ghost" className={panelPill}>
        Prime
      </Button>,
    );
    const pill = screen.getByRole('button', { name: 'Prime' });

    expect(pill).toHaveClass('rounded-full', 'border-white/35', 'hover:bg-white/10', 'min-h-11');
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm exec vitest run --project dom src/components/engraving.test.tsx src/components/brand-panel.test.tsx`
Expected: FAIL. `brand-panel` does not exist, the `variant` prop is ignored, and the second render has no `engraving-drawn`.

- [ ] **Step 4: Implement the engraving variants and the once-only draw-in**

In `src/components/engraving.tsx`:

Add `import { useEffect, useState } from 'react';` under the `cn` import.

After `BANDS`, replace `const WIDTH = 800;` and `const HEIGHT = 1000;` with:

```tsx
/*
 * The in-app panels are short and wide, so they get their own drawing: three
 * small ring sets centred near the top-left corner, clear of the title and the
 * figures. The caller mirrors it for right-to-left, which puts it in the
 * inline-start corner in both languages, as on the front door.
 */
const COMPACT_RINGS: readonly Ring[] = [
  { cx: 70, cy: 40, radius: 170, ripple: 10, waves: 40, copies: 4 },
  { cx: 70, cy: 40, radius: 120, ripple: 12, waves: 30, copies: 4 },
  { cx: 70, cy: 40, radius: 72, ripple: 8, waves: 18, copies: 3 },
];

type Variant = 'full' | 'compact' | 'bands';

type Drawing = {
  readonly width: number;
  readonly height: number;
  readonly align: string;
  readonly rings: readonly Ring[];
  readonly bands: readonly Band[];
};

const DRAWINGS: Record<Variant, Drawing> = {
  // The front door: the large rings and the bands along the foot.
  full: { width: 800, height: 1000, align: 'xMaxYMax slice', rings: RINGS, bands: BANDS },
  // A screen's panel.
  compact: { width: 800, height: 300, align: 'xMinYMin slice', rings: COMPACT_RINGS, bands: [] },
  // The desktop rail: the bands along its foot only.
  bands: { width: 800, height: 1000, align: 'xMaxYMax slice', rings: [], bands: BANDS },
};
```

Change `bandPath` to take the drawing's width:

```tsx
function bandPath({ y, amplitude, wavelength }: Band, phase: number, width: number): string {
  const steps = Math.ceil((width / wavelength) * 16);
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const yy = y + amplitude * Math.sin((x / wavelength) * Math.PI * 2 + phase);
    d += `${i === 0 ? 'M' : 'L'}${fixed(x)} ${fixed(yy)}`;
  }
  return d;
}
```

Replace `let cache` and `paths()` with:

```tsx
const cache = new Map<Variant, readonly string[]>();

function paths(variant: Variant): readonly string[] {
  const hit = cache.get(variant);
  if (hit !== undefined) return hit;
  const { rings, bands, width } = DRAWINGS[variant];
  const made = [
    ...rings.flatMap((ring) =>
      Array.from({ length: ring.copies }, (_, k) => ringPath(ring, (k / ring.copies) * Math.PI * 2)),
    ),
    ...bands.flatMap((band) =>
      Array.from({ length: band.copies }, (_, k) => bandPath(band, (k / band.copies) * Math.PI * 2, width)),
    ),
  ];
  cache.set(variant, made);
  return made;
}
```

Replace `followScale` with a factory, built once per variant so the ref callback is stable across renders:

```tsx
function scaleFollower(width: number, height: number) {
  return (svg: SVGSVGElement | null): (() => void) | undefined => {
    if (svg === null || !('ResizeObserver' in window)) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const box = entry.contentRect;
      // `slice`: the drawing is scaled until it covers the panel both ways.
      const scale = Math.max(box.width / width, box.height / height);
      if (scale > 0) svg.style.setProperty('--engrave-scale', String(scale));
    });
    observer.observe(svg);
    return () => {
      observer.disconnect();
    };
  };
}

const FOLLOWERS: Record<Variant, ReturnType<typeof scaleFollower>> = {
  full: scaleFollower(DRAWINGS.full.width, DRAWINGS.full.height),
  compact: scaleFollower(DRAWINGS.compact.width, DRAWINGS.compact.height),
  bands: scaleFollower(DRAWINGS.bands.width, DRAWINGS.bands.height),
};
```

Keep the doc comment that sat above `followScale` and put it above `scaleFollower`. Replace the `Engraving` component with:

```tsx
/**
 * Whether the guilloche has been drawn in since the app started. It is drawn
 * once, on the first screen that shows a panel; navigating afterwards mounts
 * panels that are drawn already, so the motion never replays.
 */
let drawnSinceStart = false;

export function Engraving({
  className,
  variant = 'full',
}: {
  readonly className?: string;
  readonly variant?: Variant;
}) {
  // Read once, on the first render. Set in an effect, not here: StrictMode
  // calls this initializer twice, and every panel of the first commit (the
  // rail and the screen's panel) must draw in together.
  const [drawIn] = useState(() => !drawnSinceStart);
  useEffect(() => {
    drawnSinceStart = true;
  }, []);

  const drawing = DRAWINGS[variant];
  return (
    <svg
      ref={FOLLOWERS[variant]}
      viewBox={`0 0 ${String(drawing.width)} ${String(drawing.height)}`}
      preserveAspectRatio={drawing.align}
      aria-hidden="true"
      focusable="false"
      className={cn('engraving pointer-events-none', !drawIn && 'engraving-drawn', className)}
    >
      <g fill="none" stroke="currentColor">
        {paths(variant).map((d, i) => (
          <path
            key={i}
            d={d}
            pathLength={1}
            style={drawIn ? { animationDelay: `${String(i * 45)}ms` } : undefined}
          />
        ))}
      </g>
    </svg>
  );
}
```

In `src/index.css`, directly after the `.engraving path { ... }` rule, add:

```css
/* Drawn already: every panel after the first screen's (see engraving.tsx). */
.engraving.engraving-drawn path {
  animation: none;
}
```

- [ ] **Step 5: Create the panel**

Create `src/components/brand-panel.tsx`:

```tsx
import { cn } from 'cn';
import type { ReactNode } from 'react';

import { Engraving } from './engraving';

/**
 * The front door's outlined pill, for a ghost `Button` on the deep panel:
 * the theme and language switches there, and the month, profile and prime
 * pills on the feed's panel. 44px high on a phone, 36px from `sm`.
 *
 * The ghost variant's own hover and expanded fills are muted greys meant for
 * a white page; on the panel they are overridden in both themes, including
 * the `dark:hover:` one, which `cn` does not merge with a plain `hover:`.
 */
export const panelPill =
  'h-auto min-h-11 gap-2 rounded-full border-white/35 px-3.5 text-sm text-brand-deep-foreground hover:bg-white/10 hover:text-brand-deep-foreground dark:hover:bg-white/10 aria-expanded:bg-white/15 aria-expanded:text-brand-deep-foreground focus-visible:border-white/60 focus-visible:ring-white/50 sm:min-h-9';

type BrandPanelProps = {
  readonly children: ReactNode;
  readonly className?: string;
  /** 'compact': a screen's panel. 'bands': the desktop rail. */
  readonly engraving?: 'compact' | 'bands';
};

/**
 * The front door's engraved banknote panel, carried into the app: the deep
 * sapphire block with the guilloche behind white text. The engraving is
 * mirrored for right-to-left, as on the front door.
 */
export function BrandPanel({ children, className, engraving = 'compact' }: BrandPanelProps) {
  return (
    <div
      data-slot="brand-panel"
      className={cn('relative isolate overflow-hidden bg-brand-deep text-brand-deep-foreground', className)}
    >
      <Engraving
        variant={engraving}
        className="absolute inset-0 -z-10 size-full text-brand-vivid/45 rtl:-scale-x-100"
      />
      {children}
    </div>
  );
}

/** The screen below a panel, rising over its foot as the sign-in form does. */
export function PanelSheet({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div data-slot="panel-sheet" className={cn('relative -mt-6 rounded-t-3xl bg-background', className)}>
      {children}
    </div>
  );
}
```

- [ ] **Step 6: The front door uses the shared pill**

In `src/features/account/auth-layout.tsx`, add `import { panelPill } from '@/components/brand-panel';` and `import { cn } from 'cn';`.

`LanguageSwitch`'s `className` becomes `className={panelPill}`.

`ThemeSwitch`'s `className` becomes `className={cn(panelPill, 'w-11 px-0 sm:w-9')}`. The switch stays a circle: 44px on a phone, 36px from `sm`.

- [ ] **Step 7: Run the tests to see them pass**

Run: `pnpm exec vitest run --project dom src/components/engraving.test.tsx src/components/brand-panel.test.tsx src/features/account`
Expected: PASS, and the existing account tests still pass.

- [ ] **Step 8: Gate.** Run `pnpm verify`. Expected: exit 0. If `gate:rtl` flags `rtl:-scale-x-100`, it is the same class the front door already uses and passes today.

- [ ] **Step 9: Commit**

```bash
git add src/components/engraving.tsx src/components/engraving.test.tsx src/components/brand-panel.tsx src/components/brand-panel.test.tsx src/features/account/auth-layout.tsx src/index.css
git commit -m "The front door's engraved panel becomes a shared component that draws in once" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The shell, every screen's panel, the desktop rail and the tab bar

**Files:**

- Create: `src/app/screen-panel.tsx` (`ScreenPanel`, `ScreenTitle`)
- Modify: `src/app/app-shell.tsx` (the phone header goes; the rail becomes the panel; the tab bar's active pill)
- Modify: `src/features/account/user-menu.tsx` (a 44px trigger with a light ring, for the panel)
- Modify the screen roots so the `h1` is in the panel and the rest is on the sheet:
  - `src/features/chart/chart-screen.tsx:50-53`
  - `src/features/cards/cards-screen.tsx:77-82`
  - `src/features/household/household-screen.tsx:146-150`
  - `src/features/settings/settings-screen.tsx:23-24`
  - `src/features/settings/settings-page.tsx:20-32` (covers Account, Security, Preferences and Data)
  - `src/features/commitments/commitments-screen.tsx:58-62`
  - `src/features/settings/categories-screen.tsx:69-73`
  - `src/features/bank-accounts/bank-accounts-screen.tsx:45-50`
  - `src/features/household/link-screen.tsx:206` and `src/features/household/wipe-screen.tsx` (a panel with no title; see below)
- Modify: `src/i18n/locales/{en,he}/common.json` (none needed: every title key exists)
- Test: Create `src/app/screen-panel.test.tsx`; modify `src/app/app-shell.test.tsx`

**Interfaces:**

- Consumes: `BrandPanel`, `PanelSheet` (Task 2), `Engraving variant="bands"` (Task 2), `Logo tone="inverse"`.
- Produces:
  - `ScreenPanel({ children?: ReactNode; className?: string })`: a `BrandPanel` whose first row is the account menu at the inline end, preceded on phones (`lg:hidden`) by the inverse logo and app name linking to the feed. It is full-bleed on a phone and a `rounded-3xl` block from `lg`, and it reaches under the status bar (`pt-[env(safe-area-inset-top,0px)]`).
  - `ScreenTitle({ children: ReactNode })`: the page's `h1` in `font-display` at `text-[2rem]`.
  - The screen frame every root uses: `<section className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8">` (or `max-w-4xl`), then `<ScreenPanel>`, then `<PanelSheet className="px-4 pt-6 …">`.
  - The shell no longer renders a `header`. The account menu lives in each screen's panel.

Decisions the spec leaves open, made here:

- **The desktop account menu** sits in the panel's top row at the inline end, the same place as on a phone. The spec puts it in the panel on phones and says nothing for desktop; the old desktop header held only that menu, so it moves with it.
- **Screens beyond the four named ones** (Commitments, Categories, Bank accounts, the Settings sub-pages) get the same panel and title. Otherwise removing the phone header would leave them without the account menu. **Link and Wipe** are landing pages whose `h1` changes with their state, so they get a `ScreenPanel` with no title and keep their `h1` on the sheet.
- **Subtitles and screen buttons** (Cards' "Add card", Household's body text) stay on the sheet. The spec moves only the `h1`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/screen-panel.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { ScreenPanel, ScreenTitle } from './screen-panel';
import { SettingsProvider } from './settings-provider';

const SETTINGS = { ...DEFAULT_SETTINGS, updatedAt: instantFromMs(Date.parse('2026-09-15T10:00:00.000Z')) };

function renderPanel(title?: string) {
  return renderWithProviders(
    <SettingsProvider value={SETTINGS}>
      <ScreenPanel>{title === undefined ? null : <ScreenTitle>{title}</ScreenTitle>}</ScreenPanel>
    </SettingsProvider>,
  );
}

describe('ScreenPanel', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('holds the page title as the page h1, in the display face', () => {
    renderPanel('Cards');
    const h1 = screen.getByRole('heading', { level: 1, name: 'Cards' });

    expect(h1).toHaveClass('font-display', 'text-[2rem]');
    expect(h1.closest('[data-slot="brand-panel"]')).not.toBeNull();
  });

  it('carries the account menu and, on a phone, the mark that goes home', () => {
    const { container } = renderPanel('Cards');
    const panel = container.querySelector<HTMLElement>('[data-slot="brand-panel"]');
    if (panel === null) throw new Error('no panel');

    expect(within(panel).getByRole('button', { name: 'Account and settings' })).toBeInTheDocument();
    const home = within(panel).getByRole('link', { name: /Bookandry/ });
    expect(home).toHaveAttribute('href', '/');
    expect(home).toHaveClass('lg:hidden');
  });

  it('gives the account menu a 44px target', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: 'Account and settings' })).toHaveClass('size-11');
  });
});
```

In `src/app/app-shell.test.tsx`, replace the test `'keeps settings in the account menu at the top, not in the tabs'` with:

```tsx
it('keeps settings out of the tabs, and leaves the account menu to each screen panel', () => {
  renderShell();
  expect(screen.queryByRole('link', { name: /Settings/ })).not.toBeInTheDocument();
  // The phone header is gone: the panel at the top of every screen carries the menu.
  expect(screen.queryByRole('banner')).not.toBeInTheDocument();
});

it('makes the desktop rail the deep panel, with the active tab a light pill', () => {
  renderShell();
  const nav = screen.getByRole('navigation', { name: 'Primary' });
  const active = screen.getByRole('link', { name: /Feed/ });

  expect(nav).toHaveClass('lg:bg-brand-deep', 'lg:text-brand-deep-foreground');
  expect(nav.querySelector('svg.engraving')).not.toBeNull();
  expect(active).toHaveClass('text-primary', 'lg:bg-white/15');
  // On a phone the active icon sits on the soft accent pill.
  expect(active.querySelector('[data-slot="tab-pill"]')).toHaveClass('bg-accent');
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm exec vitest run --project dom src/app/screen-panel.test.tsx src/app/app-shell.test.tsx`
Expected: FAIL. `screen-panel` does not exist, the shell still renders a banner, and the rail has no `lg:bg-brand-deep`.

- [ ] **Step 3: Create the screen panel**

Create `src/app/screen-panel.tsx`:

```tsx
import { cn } from 'cn';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';

import { BrandPanel } from '@/components/brand-panel';
import { Logo } from '@/components/logo';
import { UserMenu } from '@/features/account/user-menu';

import { ROUTES } from './routes';

/**
 * The top of every screen: the front door's engraved panel, carried in.
 *
 * Its first row is what the phone header used to hold: the mark, which goes
 * home, at the start, and the account menu at the end, top right in English
 * and top left in Hebrew. On a desktop the rail carries the mark, so only the
 * menu stays. It reaches under the status bar, whose colour is the panel's
 * (index.html's theme-color), so the two run together.
 */
export function ScreenPanel({
  children,
  className,
}: {
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  const { t } = useTranslation();
  return (
    <BrandPanel
      className={cn(
        'px-4 pt-[env(safe-area-inset-top,0px)] pb-10 lg:mt-4 lg:rounded-3xl lg:px-8 lg:pt-5 lg:pb-12',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 lg:justify-end">
        <NavLink
          to={ROUTES.feed}
          end
          className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none lg:hidden"
        >
          <Logo size={24} tone="inverse" decorative />
          <span className="font-display text-base font-bold tracking-tight">{t('app.name')}</span>
        </NavLink>
        <UserMenu />
      </div>
      {children}
    </BrandPanel>
  );
}

/** The page's own h1, set in the brand's face on the panel. */
export function ScreenTitle({ children }: { readonly children: ReactNode }) {
  return <h1 className="mt-3 font-display text-[2rem] leading-tight font-bold">{children}</h1>;
}
```

In `src/features/account/user-menu.tsx`, the `DropdownMenuTrigger` becomes:

```tsx
<DropdownMenuTrigger
  aria-label={t('menu.label')}
  // On the deep panel: a 44px target around the 34px picture, and a
  // light ring so the picture's edge shows on the sapphire.
  className="-me-1.5 flex size-11 items-center justify-center rounded-full focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:outline-none"
>
  <AccountAvatar size={34} className="ring-2 ring-white/35" />
</DropdownMenuTrigger>
```

- [ ] **Step 4: The shell**

In `src/app/app-shell.tsx`:

Delete the whole `<header>…</header>` block and its comment (lines 110-130). Remove the now-unused `UserMenu` import. Add `import { Engraving } from '@/components/engraving';`.

Replace `PrimaryNav`'s `<nav>` opening tag and its className with:

```tsx
    <nav
      aria-label={t('nav.primary')}
      className={cn(
        // Mobile: fixed bottom bar, white, respecting the home-indicator inset.
        'fixed inset-x-0 bottom-0 z-40 isolate flex border-t bg-background/95 backdrop-blur',
        'pb-[env(safe-area-inset-bottom,0px)]',
        'ps-[max(0.5rem,env(safe-area-inset-left,0px))] pe-[max(0.5rem,env(safe-area-inset-right,0px))]',
        // Desktop: the rail is the brand panel, the engraving's bands along its foot.
        'lg:inset-y-0 lg:start-0 lg:end-auto lg:w-56 lg:flex-col lg:items-stretch lg:gap-1 lg:overflow-hidden',
        'lg:border-t-0 lg:bg-brand-deep lg:p-3 lg:pt-6 lg:text-brand-deep-foreground lg:backdrop-blur-none',
      )}
    >
      <Engraving
        variant="bands"
        className="absolute inset-0 -z-10 hidden size-full text-brand-vivid/45 lg:block rtl:-scale-x-100"
      />
```

Replace the rail's home `NavLink` with:

```tsx
<NavLink
  to={ROUTES.feed}
  end
  className="mb-6 hidden items-center gap-2 rounded-lg px-3 py-2 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none lg:flex"
>
  <Logo size={28} tone="inverse" decorative />
  <span className="font-display text-lg font-bold tracking-tight">{t('app.name')}</span>
</NavLink>
```

Replace the tab `NavLink`'s `className` and children with:

```tsx
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium',
                'rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                'lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:rounded-full lg:px-3 lg:py-2 lg:text-sm lg:focus-visible:ring-white/60',
                isActive
                  ? 'text-primary lg:bg-white/15 lg:text-brand-deep-foreground'
                  : 'text-muted-foreground hover:text-foreground lg:text-brand-deep-foreground/75 lg:hover:bg-white/10 lg:hover:text-brand-deep-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Phone: the active tab's icon sits on a soft sapphire pill. */}
                <span
                  data-slot="tab-pill"
                  className={cn(
                    'flex h-8 w-14 items-center justify-center rounded-full lg:h-auto lg:w-auto',
                    isActive ? 'bg-accent lg:bg-transparent' : null,
                  )}
                >
                  <Icon className="size-5 lg:size-4" strokeWidth={1.75} />
                </span>
                <span>{t(`nav.${key}` as const)}</span>
                {isActive ? <span className="sr-only">(current)</span> : null}
              </>
            )}
```

Change `ICONS`' type to `Record<RouteKey, ComponentType<{ className?: string; strokeWidth?: number }>>`.

Update the comment above `<main>` only if it mentions the header; the `main` element itself is unchanged.

- [ ] **Step 5: Move each screen's h1 into a panel**

Each root follows one pattern. Add `import { PanelSheet } from '@/components/brand-panel';` and `import { ScreenPanel, ScreenTitle } from '@/app/screen-panel';`.

`src/features/chart/chart-screen.tsx`: the `<section>` opening and its `h1` become:

```tsx
    <section className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8">
      <ScreenPanel>
        <ScreenTitle>{t('chart.title')}</ScreenTitle>
      </ScreenPanel>
      <PanelSheet className="px-4 pt-6">
        <MonthCursor month={filters.month} today={today} onStep={stepMonth} />
```

Close `</PanelSheet>` just before `</section>`. Everything in between is unchanged.

`src/features/cards/cards-screen.tsx`: the `<section>` and `<header>` become:

```tsx
    <section className="mx-auto max-w-4xl pb-24 lg:px-4 lg:pb-8">
      <ScreenPanel>
        <ScreenTitle>{t('title')}</ScreenTitle>
      </ScreenPanel>
      <PanelSheet className="space-y-5 px-4 pt-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          <Button
```

The rest of the header, with its "Add card" button, is unchanged. Close `</PanelSheet>` before `</section>`.

`src/features/household/household-screen.tsx`:

```tsx
    <section className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8">
      <ScreenPanel>
        <ScreenTitle>{t('household.title')}</ScreenTitle>
      </ScreenPanel>
      <PanelSheet className="space-y-6 px-4 pt-6">
        <p className="text-sm text-muted-foreground">{t('household.body')}</p>
```

The `<header>` wrapper is removed. Close `</PanelSheet>` before `</section>`.

`src/features/settings/settings-screen.tsx`:

```tsx
<section className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8">
  <ScreenPanel>
    <ScreenTitle>{t('settings.title')}</ScreenTitle>
  </ScreenPanel>
  <PanelSheet className="space-y-6 px-4 pt-6">
    {signedIn ? <Who /> : null}
    {sections.account.length > 0 ? <Group sections={sections.account} /> : null}
    <Group sections={sections.app} />
  </PanelSheet>
</section>
```

`src/features/settings/settings-page.tsx`: the back link moves into the panel, above the title, in the panel's light text:

```tsx
<section className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8">
  <ScreenPanel>
    <Link
      to={ROUTES.settings}
      className="-ms-1 mt-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm text-brand-deep-foreground/80 hover:text-brand-deep-foreground focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none sm:min-h-0 sm:py-0.5"
    >
      {/* Directional: it points back, so it flips. */}
      <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
      {t('settings.title')}
    </Link>
    <ScreenTitle>{title}</ScreenTitle>
  </ScreenPanel>
  <PanelSheet className="space-y-4 px-4 pt-6">
    {description === undefined ? null : <p className="text-sm text-muted-foreground">{description}</p>}
    {children}
  </PanelSheet>
</section>
```

`src/features/commitments/commitments-screen.tsx`:

```tsx
    <section className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8">
      <ScreenPanel>
        <ScreenTitle>{t('commitments.title')}</ScreenTitle>
      </ScreenPanel>
      <PanelSheet className="space-y-4 px-4 pt-6">
        <p className="text-sm text-muted-foreground">{t('commitments.body')}</p>
```

`src/features/settings/categories-screen.tsx`:

```tsx
    <section className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8">
      <ScreenPanel>
        <ScreenTitle>{t('categories:manage.title')}</ScreenTitle>
      </ScreenPanel>
      <PanelSheet className="space-y-4 px-4 pt-6">
        <p className="text-sm text-muted-foreground">{t('categories:manage.body')}</p>
```

`src/features/bank-accounts/bank-accounts-screen.tsx`:

```tsx
    <section className="mx-auto max-w-4xl pb-24 lg:px-4 lg:pb-8">
      <ScreenPanel>
        <ScreenTitle>{t('accounts.title')}</ScreenTitle>
      </ScreenPanel>
      <PanelSheet className="space-y-5 px-4 pt-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t('accounts.body')}</p>
          <Button
```

For each of these, close `</PanelSheet>` before `</section>`.

`src/features/household/link-screen.tsx` and `src/features/household/wipe-screen.tsx`: wrap the existing returned `<section …>` as follows, leaving its content and its `h1` unchanged:

```tsx
<div className="mx-auto max-w-lg pb-24 lg:px-4 lg:pb-8">
  <ScreenPanel />
  <PanelSheet>
    <section className="space-y-4 px-4 pt-8 pb-10">{/* the existing content, unchanged */}</section>
  </PanelSheet>
</div>
```

Here "the existing content" is the children the `<section>` already has. Move them; do not retype them.

- [ ] **Step 6: Update the tests that looked for the old header or h1 styles**

Run: `pnpm exec vitest run --project dom src/features/chart src/features/cards src/features/household src/features/settings src/features/commitments src/features/bank-accounts`
Expected: any failure is a query that found the account menu in `banner` or relied on the `h1` being a direct child of `section`. Change it to find the menu by `getByRole('button', { name: 'Account and settings' })` and the title by `getByRole('heading', { level: 1 })`. Never relax an assertion about what the screen shows.

- [ ] **Step 7: Run the tests to see them pass**

Run: `pnpm exec vitest run --project dom src/app src/features`
Expected: PASS.

- [ ] **Step 8: Look at it.** Run `pnpm dev`, then open `/cards` and `/household` at 390×844 and 1280×800 in Playwright's Chromium (see the memory note: the browser tool cannot reach localhost). Check that:
  - the panel runs under the status bar;
  - the sheet's rounded top overlaps the panel by 1.5rem;
  - the rail is sapphire with bands at its foot;
  - in Hebrew, the engraving sits at the top right and the account menu at the top left.

- [ ] **Step 9: Gate.** Run `pnpm verify`. Expected: exit 0, with `gate:rtl` green.

- [ ] **Step 10: Commit**

```bash
git add src/app/screen-panel.tsx src/app/screen-panel.test.tsx src/app/app-shell.tsx src/app/app-shell.test.tsx src/features/account/user-menu.tsx src/features/chart/chart-screen.tsx src/features/cards/cards-screen.tsx src/features/household src/features/settings src/features/commitments/commitments-screen.tsx src/features/bank-accounts/bank-accounts-screen.tsx
git commit -m "Every screen opens on the engraved sapphire panel, and the rail becomes one too" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The feed's panel, the collapsed bar, and the prime pill (5.7)

**Files:**

- Modify: `src/features/feed/feed-screen.tsx:150-269` (the panel and the sheet)
- Modify: `src/features/summary/summary-cards.tsx`: `BalanceCard` becomes `BalanceFigure` and `ExpectedCard` becomes `ForecastLine`, both drawn for the panel. `CardShell` is deleted.
- Modify: `src/features/summary/month-cursor.tsx` (a `tone` prop; `'panel'` draws ‹ month › as one pill)
- Modify: `src/features/feed/profile-switcher.tsx` (a `tone` prop; `'panel'` draws an outlined pill)
- Modify: `src/features/summary/collapsed-bar.tsx` (a slim sapphire bar with the balance in the serif)
- Create: `src/features/summary/prime-pill.tsx`; Delete: `src/features/summary/prime-strip.tsx`
- Modify: `src/i18n/locales/{en,he}/common.json` (`prime.pill`)
- Modify: `e2e/02-transaction-type.spec.ts:279-283` (the strip is now a pill with a pop-out)
- Test: `src/features/summary/summary.test.tsx`; Create: `src/features/summary/prime-pill.test.tsx`

**Interfaces:**

- Consumes: `ScreenPanel` (Task 3), `PanelSheet` and `panelPill` (Task 2), `usePrime(): PrimeView` (`src/app/prime.ts`), and `Popover`, `PopoverTrigger`, `PopoverContent` (`src/components/ui/popover.tsx`; Task 7 adds the arrow and the new surface to every popover).
- Produces:
  - `BalanceFigure({ state: BalanceState; currency: Currency; onOpenBreakdown?: () => void })`. Task 9 replaces `onOpenBreakdown` with a pop-out.
  - `ForecastLine({ expense: MonthlyExpenseResult | undefined; currency: Currency; month: LocalDate; today: LocalDate; onOpenBreakdown?: () => void })`.
  - `MonthCursor({ month, today, onStep, tone?: 'plain' | 'panel' })`. Task 8 turns its label into a button.
  - `ProfileSwitcher({ …today's props, tone?: 'card' | 'panel' })`.
  - `PrimePill()`: the trigger has `data-testid="prime-pill"`, and the pop-out has `data-testid="prime-popout"`.
  - `CollapsedSummaryBar`: the same props and the same 48px-plus-inset height.

**The serif figures.** Frank Ruhl Libre Variable's Latin subset, which carries the digits (`node_modules/@fontsource-variable/frank-ruhl-libre/files/frank-ruhl-libre-latin-wght-normal.woff2`), lists `tnum` and `pnum` in its feature table. This was checked by decompressing the WOFF2 and finding the `tnum` feature tag. So the counting-up balance uses tabular figures, through `Money`'s existing `tabular` class. The fallback of sizing the box from the final value is not needed. Amount columns in the feed keep the sans stack and are not touched here.

Copy:

| key          | en    | he    |
| ------------ | ----- | ----- |
| `prime.pill` | Prime | פריים |

- [ ] **Step 1: Write the failing tests**

In `src/features/summary/summary.test.tsx`:

- Change the import to `import { BalanceFigure, ForecastLine } from './summary-cards';`.
- Rename `describe('BalanceCard'` to `describe('BalanceFigure'`, `describe('ExpectedCard'` to `describe('ForecastLine'`, and every `<BalanceCard` / `<ExpectedCard` to `<BalanceFigure` / `<ForecastLine`. The existing assertions (the since-line, the single live announcement, blocked, the loading skeleton, the split) stay as they are.

Then add:

```tsx
describe('the panel figures', () => {
  it('sets the balance in the display face, tabular, and a size smaller below 360px', () => {
    renderWithProviders(<BalanceFigure state={ready(5_325_874)} currency="ILS" onOpenBreakdown={vi.fn()} />);
    const figure = screen.getByTestId('balance-amount');

    expect(figure).toHaveClass('font-display', 'text-[2.75rem]', 'max-[359px]:text-[2.25rem]');
    expect(figure.querySelector('.tabular')).not.toBeNull();
  });

  it('says why the balance is missing in the panel colour, not in red on blue', () => {
    renderWithProviders(<BalanceFigure state={{ status: 'blocked', currencies: ['EUR'] }} currency="ILS" />);

    expect(screen.getByText(/Needs a rate for EUR/)).not.toHaveClass('text-destructive');
  });

  it('sets the forecast in the serif at 1rem, and opens its breakdown', async () => {
    const onOpen = vi.fn();
    renderWithProviders(
      <ForecastLine
        expense={{ total: 381_652, spentSoFar: 361_700, remaining: 19_952 }}
        currency="ILS"
        month={d('2026-09-01')}
        today={TODAY}
        onOpenBreakdown={onOpen}
      />,
    );
    const button = screen.getByRole('button', { name: /Expected this month/ });

    expect(button.querySelector('.font-display')).toHaveClass('text-base');
    await userEvent.setup().click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('MonthCursor on the panel', () => {
  it('is one outlined pill, ‹ month ›, whose month never breaks mid-name', () => {
    const { container } = renderWithProviders(
      <MonthCursor month={d('2026-09-01')} today={TODAY} onStep={vi.fn()} tone="panel" />,
    );

    expect(container.firstElementChild).toHaveClass('rounded-full', 'border-white/35');
    expect(screen.getByRole('heading', { level: 2 })).toHaveClass('whitespace-nowrap');
    for (const name of ['Previous month', 'Next month']) {
      expect(screen.getByRole('button', { name })).toHaveClass('size-11');
    }
  });
});

describe('CollapsedSummaryBar on sapphire', () => {
  it('is a slim deep bar with the balance in the serif, at the same height', () => {
    const { container } = renderWithProviders(
      <CollapsedSummaryBar state={ready(5_325_874)} currency="ILS" />,
    );
    const bar = screen.getByTestId('collapsed-summary');

    expect(bar).toHaveClass('bg-brand-deep', 'text-brand-deep-foreground');
    expect(bar.style.height).toBe('calc(48px + env(safe-area-inset-top, 0px))');
    expect(container.querySelector('[data-value]')).toHaveClass('font-display');
  });
});
```

Create `src/features/summary/prime-pill.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { d } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { PrimePill } from './prime-pill';

vi.mock('@/app/prime', () => ({
  usePrime: () => ({
    primeRate: '4.75',
    boiRate: '3.25',
    source: { kind: 'built_in', asOf: d('2026-10-08') },
  }),
}));

describe('PrimePill', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('shows prime on the panel as a pill', () => {
    renderWithProviders(<PrimePill />);
    const pill = screen.getByTestId('prime-pill');

    expect(pill).toHaveTextContent('Prime');
    expect(pill).toHaveTextContent('4.75%');
    expect(pill).toHaveClass('rounded-full', 'min-h-11');
  });

  it('opens what the strip carried, and gives focus back on Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrimePill />);
    const pill = screen.getByTestId('prime-pill');

    await user.click(pill);
    const popout = await screen.findByTestId('prime-popout');
    expect(popout).toHaveTextContent('Prime rate');
    expect(popout).toHaveTextContent('3.25%');
    expect(popout).toHaveTextContent('As of');

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('prime-popout')).not.toBeInTheDocument();
    expect(pill).toHaveFocus();
  });

  it('reads in Hebrew', async () => {
    await initTestI18n('he');
    renderWithProviders(<PrimePill />);
    expect(screen.getByTestId('prime-pill')).toHaveTextContent('פריים');
    await initTestI18n('en');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm exec vitest run --project dom src/features/summary`
Expected: FAIL. `BalanceFigure`, `ForecastLine` and `prime-pill` do not exist, and `tone` is ignored.

- [ ] **Step 3: The panel figures**

In `src/features/summary/summary-cards.tsx`, keep the file's doc comment and replace `BalanceCard`, `ExpectedCard` and `CardShell` with:

```tsx
export function BalanceFigure({
  state,
  currency,
  onOpenBreakdown,
}: {
  readonly state: BalanceState;
  readonly currency: Currency;
  readonly onOpenBreakdown?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const target = state.status === 'ready' ? state.minor : 0;
  const animated = useCountUp(target);
  const title = t('summary.balance');

  if (state.status === 'loading') {
    return (
      <div>
        <p className="text-sm text-brand-deep-foreground/80">{title}</p>
        <Skeleton className="mt-1 h-11 w-48 bg-white/15" />
      </div>
    );
  }

  if (state.status === 'blocked') {
    return (
      <div>
        <p className="text-sm text-brand-deep-foreground/80">{title}</p>
        {/* Red on the deep blue fails contrast; the words carry the problem. */}
        <p className="mt-1 text-sm text-brand-deep-foreground">
          {t('summary.balanceBlocked', { currencies: state.currencies.join(', ') })}
        </p>
      </div>
    );
  }

  const settled = formatMoney(state.minor, currency, { locale: i18n.language });
  const since = t('summary.balanceSince', {
    date: formatLocalDate(state.since, i18n.language, { dateStyle: 'medium' }),
  });

  return (
    <>
      <PanelFigureButton label={t('summary.breakdownOf', { title })} onClick={onOpenBreakdown}>
        <span className="block text-sm text-brand-deep-foreground/80">
          {title} · {since}
        </span>
        {/*
          The animating figure is hidden from assistive tech and ONE live region
          carries the settled value. Frank Ruhl Libre has tabular figures, so
          the count-up never makes the line jitter.
        */}
        <span
          className="mt-1 block font-display text-[2.75rem] leading-none font-bold tracking-tight max-[359px]:text-[2.25rem]"
          data-testid="balance-amount"
        >
          <Money minor={animated} currency={currency} announce={false} />
        </span>
      </PanelFigureButton>
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="balance-announced">
        {title}: {settled.aria}
      </p>
    </>
  );
}

export function ForecastLine({
  expense,
  currency,
  month,
  today,
  onOpenBreakdown,
}: {
  readonly expense: MonthlyExpenseResult | undefined;
  readonly currency: Currency;
  readonly month: LocalDate;
  readonly today: LocalDate;
  readonly onOpenBreakdown?: () => void;
}) {
  const { t } = useTranslation();

  if (expense === undefined) return <Skeleton className="h-5 w-56 bg-white/15" />;

  // A month already over has nothing "still due"; the label changes too.
  const isPast = compareLocal(month, startOfMonth(today)) < 0;
  const title = isPast ? t('summary.spent') : t('summary.expected');

  return (
    <PanelFigureButton label={t('summary.breakdownOf', { title })} onClick={onOpenBreakdown}>
      <span className="block font-display text-base">
        {title} <Money minor={expense.total} currency={currency} className="font-bold" />
      </span>
      {isPast ? null : (
        <span className="mt-0.5 block text-xs text-brand-deep-foreground/80">
          {/* ONE key, not fragments joined in JSX: Hebrew reverses the clause order. */}
          <Trans
            i18nKey="summary.splitLine"
            components={{
              spent: <Money minor={expense.spentSoFar} currency={currency} className="font-medium" />,
              due: <Money minor={expense.remaining} currency={currency} className="font-medium" />,
            }}
          />
        </span>
      )}
    </PanelFigureButton>
  );
}

/** A figure on the panel that opens what it is made of. Plain text when nothing does. */
function PanelFigureButton({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick?: () => void;
  readonly children: React.ReactNode;
}) {
  if (onClick === undefined) return <div>{children}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="-mx-2 block min-h-11 rounded-xl px-2 py-1 text-start transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}
```

The `aria-label` hides the visible text from the accessible name, so the forecast test's `getByRole('button', { name: /Expected this month/ })` matches `breakdownOf`'s "Show what makes up Expected this month". Remove the `cn` import if it is now unused.

- [ ] **Step 4: The month and profile pills**

In `src/features/summary/month-cursor.tsx`, add `import { cn } from 'cn';` and the prop `tone = 'plain'` with the type `tone?: 'plain' | 'panel'`. Replace the returned JSX with:

```tsx
const onPanel = tone === 'panel';
const arrow = onPanel
  ? 'size-11 rounded-full text-brand-deep-foreground hover:bg-white/10 hover:text-brand-deep-foreground dark:hover:bg-white/10 focus-visible:ring-white/50 sm:size-9'
  : undefined;

return (
  <div
    className={cn(
      onPanel
        ? 'inline-flex items-center rounded-full border border-white/35 text-brand-deep-foreground'
        : 'flex items-center justify-between gap-2',
    )}
  >
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={arrow}
      aria-label={t('month.previous')}
      onClick={() => {
        onStep(-1);
      }}
    >
      <ChevronLeft className="cn-rtl-flip size-5 rtl:rotate-180" aria-hidden="true" />
    </Button>

    {/* aria-live so stepping months announces the new one: the heading text
          changes in place, which a screen reader would otherwise not mention. */}
    <h2
      className={cn('font-semibold whitespace-nowrap', onPanel ? 'px-1 text-sm' : 'text-base')}
      aria-live="polite"
    >
      {label}
    </h2>

    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={arrow}
      aria-label={t('month.next')}
      // Past the projection horizon there is nothing to show, so the control
      // is disabled with the reason rather than stepping into an empty month.
      disabled={atHorizon}
      title={atHorizon ? t('month.horizon') : undefined}
      onClick={() => {
        onStep(1);
      }}
    >
      <ChevronRight className="cn-rtl-flip size-5 rtl:rotate-180" aria-hidden="true" />
    </Button>
  </div>
);
```

In `src/features/feed/profile-switcher.tsx`, add the prop `tone = 'card'` with the type `tone?: 'card' | 'panel'`. The `DropdownMenuTrigger` `className` becomes:

```tsx
          className={cn(
            'flex items-center gap-2 rounded-full border ps-1.5 pe-3 text-sm font-medium transition focus-visible:outline-none',
            tone === 'panel'
              ? 'min-h-11 border-white/35 text-brand-deep-foreground hover:bg-white/10 aria-expanded:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/60 sm:min-h-9'
              : 'h-9 border-border bg-card shadow-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
          )}
```

The `ChevronDown` className becomes `cn('size-4', tone === 'panel' ? 'text-brand-deep-foreground/80' : 'text-muted-foreground')`. Pass `tone` to `Stack`, whose avatar ring becomes `tone === 'panel' ? 'ring-brand-deep' : 'ring-card'`.

- [ ] **Step 5: The prime pill**

Delete `src/features/summary/prime-strip.tsx`. Create `src/features/summary/prime-pill.tsx`:

```tsx
import { Info } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import { usePrime } from '@/app/prime';
import { panelPill } from '@/components/brand-panel';
import { Percent } from '@/components/percent';
import { buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { formatLocalDate } from '@/lib/dates';
import { cn } from 'cn';

/**
 * Israeli prime, as a pill on the feed's panel: "Prime 4.75% ⓘ". It opens what
 * the strip under the cards used to say: the Bank of Israel rate it is built
 * on, and the date it is as of or the next decision that might move it.
 */
export function PrimePill() {
  const { t, i18n } = useTranslation();
  const prime = usePrime();
  const day = (date: Parameters<typeof formatLocalDate>[0]) =>
    formatLocalDate(date, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  const when =
    prime.source.kind === 'built_in'
      ? t('prime.asOf', { date: day(prime.source.asOf) })
      : prime.nextDecision === undefined
        ? undefined
        : t('prime.next', { date: day(prime.nextDecision) });

  return (
    <Popover>
      <PopoverTrigger
        data-testid="prime-pill"
        className={cn(buttonVariants({ variant: 'ghost' }), panelPill)}
      >
        {t('prime.pill')}
        <Percent rate={prime.primeRate} className="font-semibold tabular-nums" />
        <Info className="size-4 opacity-80" strokeWidth={1.75} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent data-testid="prime-popout" align="start" className="w-64">
        <PopoverTitle className="flex items-baseline justify-between gap-3">
          {t('prime.title')}
          <Percent rate={prime.primeRate} className="text-lg font-semibold tabular-nums" />
        </PopoverTitle>
        <p className="text-muted-foreground">
          <Trans i18nKey="prime.detail" components={{ boi: <Percent rate={prime.boiRate} /> }} />
        </p>
        {when === undefined ? null : <p className="text-xs text-muted-foreground">{when}</p>}
      </PopoverContent>
    </Popover>
  );
}
```

Add `"pill": "Prime"` to `prime` in `src/i18n/locales/en/common.json` and `"pill": "פריים"` to `prime` in `src/i18n/locales/he/common.json`. Fix the import order so lint passes: `cn` goes first, as in the other files.

- [ ] **Step 6: The collapsed bar**

In `src/features/summary/collapsed-bar.tsx`:

- The outer `div`'s className list becomes:

```tsx
      className={cn(
        'fixed inset-x-0 top-0 z-30 bg-brand-deep text-brand-deep-foreground shadow-md',
        'pt-[env(safe-area-inset-top,0px)]',
        // The figure it stands in for lives inside `main`, which clears the
        // desktop nav rail.
        'lg:ps-56 xl:pe-56',
      )}
```

- In the button, `focus-visible:ring-ring` becomes `focus-visible:ring-white/60`.
- The label `span` becomes `<span className="text-xs text-brand-deep-foreground/80">`.
- The ready `Money` becomes `<Money minor={state.minor} currency={currency} className="truncate font-display text-lg font-bold" />`.
- The blocked `span` changes `text-destructive` to `text-brand-deep-foreground`.
- The loading `span` and the chevron change `text-muted-foreground` to `text-brand-deep-foreground/80`.

The height style is unchanged, so `use-collapsing-header` and `--feed-sticky-top` are unchanged.

- [ ] **Step 7: Put the feed on the panel and the sheet**

In `src/features/feed/feed-screen.tsx`:

- Imports: remove `PrimeStrip`, `BalanceCard` and `ExpectedCard`. Add:
  - `import { PrimePill } from '../summary/prime-pill';`
  - `import { BalanceFigure, ForecastLine } from '../summary/summary-cards';`
  - `import { ScreenPanel } from '@/app/screen-panel';`
  - `import { PanelSheet } from '@/components/brand-panel';`
- The `<section>` className becomes `"mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8"`. The `style` is unchanged.
- Replace the `<div ref={measureHeader} data-testid="feed-header">…</div>` block and the two `div`s after it (the filter bar and the list) with:

```tsx
      <div ref={measureHeader} data-testid="feed-header">
        <ScreenPanel>
          {/* Wraps onto two lines on a 320px phone rather than overflowing. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <MonthCursor month={filters.month} today={today} onStep={stepMonth} tone="panel" />
            {lookups === undefined ? null : (
              <ProfileSwitcher
                profiles={lookups.profiles}
                active={filters.profileId}
                onSelect={setProfile}
                tone="panel"
              />
            )}
            <PrimePill />
          </div>
          <div className="mt-5">
            <BalanceFigure
              state={balance}
              currency={settings.defaultCurrency}
              onOpenBreakdown={() => {
                setBreakdown('balance');
              }}
            />
          </div>
          <div className="mt-2">
            <ForecastLine
              expense={expense}
              currency={settings.defaultCurrency}
              month={filters.month}
              today={today}
              onOpenBreakdown={() => {
                setBreakdown('expense');
              }}
            />
          </div>
        </ScreenPanel>
      </div>

      <PanelSheet className="px-4 pt-4">
        <FilterBar filters={filters} onChange={set} onClear={clear} />

        <div className="mt-3">
          {/* the existing EmptyState / VirtualFeed conditional, unchanged */}
        </div>
      </PanelSheet>
```

Move the existing `{reason !== undefined ? (<EmptyState … />) : context === undefined ? null : (<VirtualFeed … />)}` expression into that `div` exactly as it is; do not retype it. The sheets after it (`TransactionSheet`, `ImportSheet`, `RowActionsSheet`, the two breakdown sheets) stay where they are, as children of `section`.

- [ ] **Step 8: The browser test that read the strip**

In `e2e/02-transaction-type.spec.ts`, replace lines 279-283 (the `strip` block) with:

```ts
// On the main screen: prime is a pill on the panel; its pop-out says what it is built on.
const pill = page.getByTestId('prime-pill');
await expect(pill).toContainText('4.75%');
await pill.click();
const popout = page.getByTestId('prime-popout');
await expect(popout).toContainText(copy.primeTitle);
await expect(popout).toContainText('3.25%');
await page.keyboard.press('Escape');
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `pnpm exec vitest run --project dom src/features/summary src/features/feed`
Expected: PASS.

Run: `pnpm exec playwright test e2e/02-transaction-type.spec.ts e2e/08-polish.spec.ts`
Expected: PASS. `08-polish`'s `@collapse` tests measure `feed-header` and `collapsed-summary`, and both test IDs are kept.

- [ ] **Step 10: Gate.** Run `pnpm verify`. Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add src/features/feed src/features/summary src/i18n/locales e2e/02-transaction-type.spec.ts
git commit -m "The feed opens on its balance in the serif, with the month, people and prime as pills" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Monochrome category icons

**Files:**

- Modify: `src/components/category-icon.tsx` (stroke width 1.75; a new `CategoryChip`)
- Modify: `src/features/feed/feed-rows.tsx:202-210` (one chip for both kinds)
- Modify: `src/features/commitments/commitments-screen.tsx:150-152`, `src/features/settings/categories-screen.tsx:161-163` (the same chip)
- Modify: `src/features/summary/breakdown-sheet.tsx:169` (the bare icon in sapphire)
- Test: Create `src/components/category-icon.test.tsx`; modify `src/features/feed/feed-rows.test.tsx`

**Interfaces:**

- Consumes: `bg-accent` and `text-accent-foreground` from Task 1. These are `#EAF2FF` with `#0F3A8A` in light mode, and the deep tint with `#8CB8FF` in dark mode, which is exactly the spec's "`--brand-deep` (dark mode: `#8CB8FF`) on `--accent`".
- Produces:
  - `CategoryIcon({ name: string; className?: string })`, now drawn at `strokeWidth={1.75}`.
  - `CategoryChip({ icon: string; className?: string })`: a `span[data-slot=category-chip]`, `size-9 rounded-full bg-accent text-accent-foreground`, with the icon at `size-4`. Task 10 makes it the content of a button on feed rows.

- [ ] **Step 1: Write the failing tests**

Create `src/components/category-icon.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CategoryChip, CategoryIcon } from './category-icon';

describe('category icons', () => {
  it('are thin line icons', () => {
    const { container } = render(<CategoryIcon name="ShoppingBasket" />);

    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '1.75');
  });

  it('sit on the sapphire tint, the same for every kind', () => {
    const { container } = render(<CategoryChip icon="ShoppingBasket" />);
    const chip = container.querySelector('[data-slot="category-chip"]');

    expect(chip).toHaveClass('bg-accent', 'text-accent-foreground', 'size-9', 'rounded-full');
    expect(chip?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('falls back to a circle for an icon this build does not ship', () => {
    const { container } = render(<CategoryChip icon="NoSuchIcon" />);

    expect(container.querySelector('svg')).not.toBeNull();
  });
});
```

Add to `src/features/feed/feed-rows.test.tsx`, inside its top-level `describe` for `TransactionRow` (or a new `describe` if the file has none):

```tsx
it('draws the same sapphire chip for income and expense; the amount carries direction', async () => {
  await initTestI18n('en');
  const income = occurrence({
    transaction: makeTx({
      id: 't2',
      kind: 'income',
      date: d('2026-09-10'),
      recurrence: { type: 'one_time' },
    }),
  });
  const { container } = renderWithProviders(
    <>
      <TransactionRow occurrence={occurrence()} context={context()} position={1} setSize={2} />
      <TransactionRow occurrence={income} context={context()} position={2} setSize={2} />
    </>,
  );
  const chips = container.querySelectorAll('[data-slot="category-chip"]');

  expect(chips).toHaveLength(2);
  for (const chip of chips) expect(chip).toHaveClass('bg-accent', 'text-accent-foreground');
  expect(container.querySelectorAll('.bg-muted.text-muted-foreground.size-9')).toHaveLength(0);
});
```

If `makeTx` does not accept `kind`, build the income occurrence the way the file's existing income test does.

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm exec vitest run --project dom src/components/category-icon.test.tsx src/features/feed/feed-rows.test.tsx`
Expected: FAIL. `CategoryChip` does not exist, and the stroke width is 2.

- [ ] **Step 3: Implement**

Replace `src/components/category-icon.tsx` with:

```tsx
import { cn } from 'cn';
import { Circle } from 'lucide-react';

import { ICONS } from './category-icons';

/** A category's line icon. Thin and single-colour: the colour comes from the caller's text. */
export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  // A custom category can name an icon this build does not ship, and an import
  // that resolves to undefined would throw inside the render of a feed row.
  const Icon = ICONS[name] ?? Circle;
  return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />;
}

/**
 * A category's round chip: a sapphire line icon on the soft sapphire tint,
 * for every kind. Direction is the amount's job (its colour and sign); a green
 * chip on income said it twice and made the feed colourful for no reason.
 */
export function CategoryChip({ icon, className }: { icon: string; className?: string }) {
  return (
    <span
      data-slot="category-chip"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground',
        className,
      )}
    >
      <CategoryIcon name={icon} className="size-4" />
    </span>
  );
}
```

In `src/features/feed/feed-rows.tsx`, replace the chip `span` (the one with `isIncome ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'`) and its `CategoryIcon` with:

```tsx
<CategoryChip icon={category?.icon ?? 'Circle'} />
```

Change the import to `import { CategoryChip } from '@/components/category-icon';`. `isIncome` is still used by the amount's colour, so it stays.

In `src/features/commitments/commitments-screen.tsx` and `src/features/settings/categories-screen.tsx`, replace each `<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><CategoryIcon … className="size-4" /></span>` with `<CategoryChip icon={…the same name expression…} />`, and import `CategoryChip`. Keep the `CategoryIcon` import only where the icon picker (categories-screen lines 320 and 425) still uses it.

In `src/features/summary/breakdown-sheet.tsx:169`, change the icon's `text-muted-foreground` to `text-accent-foreground`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm exec vitest run --project dom src/components src/features/feed src/features/commitments src/features/settings src/features/summary`
Expected: PASS.

- [ ] **Step 5: Gate.** Run `pnpm verify`. Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/category-icon.tsx src/components/category-icon.test.tsx src/features/feed/feed-rows.tsx src/features/feed/feed-rows.test.tsx src/features/commitments/commitments-screen.tsx src/features/settings/categories-screen.tsx src/features/summary/breakdown-sheet.tsx
git commit -m "Category icons are thin sapphire lines on one tint, and the amount alone says which way money went" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The Add pill, its menu, and presetting the kind

**Files:**

- Create: `src/components/add-button.tsx`, `src/components/add-button.test.tsx`
- Delete: `src/components/fab.tsx`, `src/components/fab.test.tsx`
- Modify: `src/features/feed/add-menu.tsx` (Expense, Income, a divider, Smart import)
- Create: `src/features/feed/add-menu.test.tsx`
- Modify: `src/features/transaction/use-transaction-sheet.ts` (`add=expense|income`; `openAdd(kind?)`)
- Create: `src/features/transaction/use-transaction-sheet.test.tsx`
- Modify: `src/features/transaction/transaction-sheet.tsx:149-160,180-184` (the add form starts on the target's kind)
- Modify: `src/features/feed/feed-screen.tsx` (`onAdd`, and the comments that say FAB)
- Modify: `src/index.css` (remove `--fab`, `--fab-foreground`, `--fab-rim` from `:root`, `.dark` and `@theme inline`), `src/lib/contrast.test.ts` (remove the two FAB pairs and their comment)
- Modify: `src/i18n/locales/{en,he}/common.json` (`addMenu`)
- Modify: `e2e/support/add.ts`, `e2e/00-shell.spec.ts:315-388`, `e2e/08-polish.spec.ts:3,252-301` (the new test id and item names)

**Interfaces:**

- Consumes: `bg-brand-deep`, `text-brand-deep-foreground`, `border-brand-vivid`, `bg-accent` (Task 1).
- Produces:
  - `AddButton(props: React.ComponentProps<'button'>)`, with `data-testid="add-button"` and the accessible name "Add" / "הוספה".
  - `AddMenu({ disabled: boolean; aiAvailable: boolean; onAdd: (kind: Kind) => void; onAddWithAi: () => void })`, where `Kind` is `'expense' | 'income'` from `@/types/money`.
  - `SheetTarget`'s add member becomes `{ readonly mode: 'add'; readonly kind: Kind }`. Task 7 extends it with `from`.
  - `TransactionSheetApi.openAdd: (kind?: Kind) => void`. The default is `'expense'`.
  - **URL.** `add=expense` or `add=income`. `add=1`, an empty `add=`, and any other value read as an expense.

Copy (`common.json`, under `addMenu`; `manual` is removed):

| key           | en                                    | he                          |
| ------------- | ------------------------------------- | --------------------------- |
| `add`         | Add                                   | הוספה                       |
| `expense`     | Expense                               | הוצאה                       |
| `expenseHint` | Purchase, bill, payment               | רכישה, חשבון, תשלום         |
| `income`      | Income                                | הכנסה                       |
| `incomeHint`  | Salary, refund, gift                  | משכורת, החזר, מתנה          |
| `ai`          | Smart import (unchanged)              | ייבוא חכם (unchanged)       |
| `aiHint`      | From a file or a photo of a statement | מקובץ או מצילום של דף פירוט |

`aiUnavailable` is unchanged. After deleting `fab.tsx`, run `grep -rn "addTransaction" src`. If nothing else uses `action.addTransaction`, delete it from both locale files.

- [ ] **Step 1: Write the failing tests**

Create `src/components/add-button.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { AddButton } from './add-button';

describe('AddButton', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('is a labelled sapphire pill, 48px high', () => {
    renderWithProviders(<AddButton />);
    const button = screen.getByRole('button', { name: 'Add' });

    expect(button).toHaveClass('h-12', 'px-5', 'rounded-full', 'bg-brand-deep', 'text-brand-deep-foreground');
    // Its edge on the near-black page.
    expect(button).toHaveClass('dark:border', 'dark:border-brand-vivid');
  });

  it('is centred above the tab bar on a phone and at the bottom-end corner on a desktop', () => {
    renderWithProviders(<AddButton />);
    const button = screen.getByTestId('add-button');

    expect(button).toHaveClass('start-0', 'end-0', 'mx-auto', 'w-max', 'lg:end-6', 'lg:start-auto');
  });

  it('reads הוספה in Hebrew', async () => {
    await initTestI18n('he');
    renderWithProviders(<AddButton />);
    expect(screen.getByRole('button', { name: 'הוספה' })).toBeInTheDocument();
    await initTestI18n('en');
  });

  it('is disabled when asked, and fires when it is not', async () => {
    const onClick = vi.fn();
    const { rerender } = renderWithProviders(<AddButton disabled onClick={onClick} />);
    expect(screen.getByTestId('add-button')).toBeDisabled();

    rerender(<AddButton onClick={onClick} />);
    await userEvent.setup().click(screen.getByTestId('add-button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

Create `src/features/transaction/use-transaction-sheet.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { useTransactionSheet } from './use-transaction-sheet';

function Probe() {
  const sheet = useTransactionSheet();
  const location = useLocation();
  return (
    <>
      <output data-testid="target">{JSON.stringify(sheet.target)}</output>
      <output data-testid="search">{location.search}</output>
      <button type="button" onClick={() => sheet.openAdd()}>
        plain
      </button>
      <button type="button" onClick={() => sheet.openAdd('income')}>
        income
      </button>
    </>
  );
}

const target = () => JSON.parse(screen.getByTestId('target').textContent ?? '{}') as unknown;

describe('useTransactionSheet add', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('writes the kind into the URL', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Probe />);

    await user.click(screen.getByRole('button', { name: 'income' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?add=income');
    expect(target()).toEqual({ mode: 'add', kind: 'income' });
  });

  it('defaults to an expense', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Probe />);

    await user.click(screen.getByRole('button', { name: 'plain' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?add=expense');
  });

  it.each(['/?add=1', '/?add=expense', '/?add=', '/?add=transfer'])(
    'reads %s as an expense, never throwing on a stale or hand-typed link',
    (route) => {
      renderWithProviders(<Probe />, { route });
      expect(target()).toEqual({ mode: 'add', kind: 'expense' });
    },
  );

  it('reads add=income as income', () => {
    renderWithProviders(<Probe />, { route: '/?add=income' });
    expect(target()).toEqual({ mode: 'add', kind: 'income' });
  });
});
```

Create `src/features/feed/add-menu.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { AddMenu } from './add-menu';

function renderMenu(over: Partial<Parameters<typeof AddMenu>[0]> = {}) {
  const props = { disabled: false, aiAvailable: true, onAdd: vi.fn(), onAddWithAi: vi.fn(), ...over };
  renderWithProviders(<AddMenu {...props} />);
  return props;
}

describe('AddMenu', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it('offers Expense, Income, a divider, then Smart import, each with its hint', async () => {
    renderMenu();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add' }));
    const items = await screen.findAllByRole('menuitem');

    expect(items.map((i) => i.textContent)).toEqual([
      'ExpensePurchase, bill, payment',
      'IncomeSalary, refund, gift',
      'Smart importFrom a file or a photo of a statement',
    ]);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    for (const item of items) expect(item).toHaveClass('min-h-12');
  });

  it('opens the form preset to the kind chosen', async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('menuitem', { name: /^Income/ }));
    expect(props.onAdd).toHaveBeenCalledWith('income');
  });

  it('keeps Enter, Enter as the quickest way to an expense', async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    screen.getByRole('button', { name: 'Add' }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: /^Expense/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(props.onAdd).toHaveBeenCalledWith('expense');
  });

  it('disables Smart import, with the reason, when there is no account server', async () => {
    renderMenu({ aiAvailable: false });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add' }));
    const ai = await screen.findByRole('menuitem', { name: /Smart import/ });

    expect(ai).toHaveAttribute('aria-disabled', 'true');
    expect(ai).toHaveTextContent('Needs a Bookandry account');
  });

  it('gives focus back to the pill on Escape', async () => {
    const user = userEvent.setup();
    renderMenu();
    const pill = screen.getByRole('button', { name: 'Add' });

    await user.click(pill);
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(pill).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm exec vitest run --project dom src/components/add-button.test.tsx src/features/feed/add-menu.test.tsx src/features/transaction/use-transaction-sheet.test.tsx`
Expected: FAIL. `add-button` does not exist, `AddMenu` has no `onAdd`, and the URL says `add=1`.

- [ ] **Step 3: The pill**

Create `src/components/add-button.tsx`:

```tsx
import { cn } from 'cn';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** A plain button's props: the pill is also the Add menu's trigger, which passes its handlers, ARIA state and ref straight through. */
export type AddButtonProps = React.ComponentProps<'button'>;

/**
 * The Add pill: a sapphire pill with a plus and the word, which says what the
 * button does where a bare plus only hinted. White on the deep sapphire is
 * 10.5:1. In dark mode a 1px vivid border draws its edge on the near-black
 * page, where the deep pill alone would sink in.
 *
 * Bottom-centre above the tab bar on a phone, bottom-inline-end from `lg`
 * where there is no tab bar. Both offsets add the safe-area inset.
 */
export function AddButton({ className, disabled = false, ...props }: AddButtonProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      disabled={disabled}
      data-testid="add-button"
      {...props}
      className={cn(
        'fixed z-50 inline-flex items-center gap-2 rounded-full',
        'h-12 px-5 text-base font-semibold shadow-lg shadow-brand-deep/30',
        'bg-brand-deep text-brand-deep-foreground dark:border dark:border-brand-vivid',
        'transition-transform duration-[90ms] ease-out hover:bg-brand-deep/90 active:scale-[0.96]',
        'focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        'motion-reduce:transition-none motion-reduce:active:scale-100',
        // Phone: centred. `start-0 end-0` with `mx-auto` and a max-content
        // width centres a fixed element of any label length.
        'start-0 end-0 mx-auto w-max',
        'bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+1rem)]',
        // Desktop: inline-end, no tab bar to clear.
        'lg:start-auto lg:end-6 lg:bottom-6 lg:mx-0',
        className,
      )}
    >
      {/* Plus is non-directional: it must NOT carry rtl:rotate-180. */}
      <Plus className="size-5" strokeWidth={2.25} aria-hidden="true" />
      {t('addMenu.add')}
    </button>
  );
}
```

Delete `src/components/fab.tsx` and `src/components/fab.test.tsx`.

- [ ] **Step 4: The menu**

Replace `src/features/feed/add-menu.tsx` with:

```tsx
import { HandCoins, type LucideIcon, ShoppingBag, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AddButton } from '@/components/add-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Kind } from '@/types/money';

/**
 * The Add pill, and the ways to add: an expense, income, or a file for the
 * AI to read.
 *
 * The pill is the menu's trigger, rendered through it so it keeps its fixed
 * place and its test id while the menu adds the popup's ARIA state. The menu
 * opens above it, and Expense comes first, so Enter, Enter is still the
 * quickest way to the form.
 */
export function AddMenu({
  disabled,
  aiAvailable,
  onAdd,
  onAddWithAi,
}: {
  readonly disabled: boolean;
  /** False in a build without accounts: reading a file needs the account's server. */
  readonly aiAvailable: boolean;
  readonly onAdd: (kind: Kind) => void;
  readonly onAddWithAi: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<AddButton />} disabled={disabled} />
      <DropdownMenuContent
        side="top"
        align="center"
        sideOffset={10}
        className="w-72 p-1.5"
        data-testid="add-menu"
      >
        <AddItem
          icon={ShoppingBag}
          title={t('addMenu.expense')}
          hint={t('addMenu.expenseHint')}
          onClick={() => {
            onAdd('expense');
          }}
        />
        <AddItem
          icon={HandCoins}
          title={t('addMenu.income')}
          hint={t('addMenu.incomeHint')}
          onClick={() => {
            onAdd('income');
          }}
        />
        <DropdownMenuSeparator />
        <AddItem
          icon={Sparkles}
          title={t('addMenu.ai')}
          hint={aiAvailable ? t('addMenu.aiHint') : t('addMenu.aiUnavailable')}
          disabled={!aiAvailable}
          onClick={onAddWithAi}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AddItem({
  icon: Icon,
  title,
  hint,
  disabled,
  onClick,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly hint: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <DropdownMenuItem className="min-h-12 gap-3 px-2.5 py-2" disabled={disabled} onClick={onClick}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="flex flex-col">
        <span className="text-base font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </DropdownMenuItem>
  );
}
```

- [ ] **Step 5: The kind in the URL and the form**

In `src/features/transaction/use-transaction-sheet.ts`:

- Import `Kind` from `@/types/money`, beside `LocalDate`.
- The add member of `SheetTarget` becomes `| { readonly mode: 'add'; readonly kind: Kind }`.
- In `TransactionSheetApi`, `openAdd` becomes `readonly openAdd: (kind?: Kind) => void;`.
- Replace the comment above `const ADD = 'add';` with `/** The add form: \`expense\` or \`income\`. \`1\` (older links) and anything unknown mean an expense. */`.
- In the `target` memo, replace `if (params.get(ADD) === '1') return { mode: 'add' };` with:

```ts
const adding = params.get(ADD);
if (adding !== null) return { mode: 'add', kind: adding === 'income' ? 'income' : 'expense' };
```

- In `write`, replace `if (next.mode === 'add') updated.set(ADD, '1');` with `if (next.mode === 'add') updated.set(ADD, next.kind);`.
- `openAdd` becomes:

```ts
      openAdd: (kind: Kind = 'expense') => {
        write({ mode: 'add', kind });
      },
```

In `src/features/transaction/transaction-sheet.tsx`, the `adding` memo becomes:

```tsx
const addKind = target.mode === 'add' ? target.kind : 'expense';
const adding = useMemo<TxFormValues>(
  () => ({
    ...defaultFormValues({
      profileId: defaultProfileId,
      currency: baseCurrency,
      today,
      primeRate: prime.primeRate,
    }),
    // Preset by the Add menu's choice; the kind control can still switch it.
    kind: addKind,
    categoryId: categoriesFor(categories, addKind)[0]?.id ?? '',
  }),
  [defaultProfileId, baseCurrency, today, categories, prime.primeRate, addKind],
);
```

The add form's `key="add"` becomes ``key={`add-${addKind}`}``, so choosing the other kind from the menu starts a fresh form.

In `src/features/feed/feed-screen.tsx`, the `AddMenu` call becomes:

```tsx
<AddMenu
  disabled={(lookups?.profiles.length ?? 0) === 0}
  aiAvailable={account.status !== 'unavailable'}
  onAdd={sheet.openAdd}
  onAddWithAi={() => {
    sheet.openImport();
  }}
/>
```

In the two comments above it and above `<section>`, replace "FAB" with "Add pill".

- [ ] **Step 6: Remove the FAB tokens**

In `src/index.css`, delete the `/* Floating action button. … */` comment and the `--fab`, `--fab-foreground` and `--fab-rim` lines from `:root`. Delete the `/* On a near-black page the disc … */` comment and the same three lines from `.dark`. Delete `--color-fab`, `--color-fab-foreground` and `--color-fab-rim` from `@theme inline`.

In `src/lib/contrast.test.ts`, delete the `/* The FAB, … */` comment and the `fab-foreground on fab` and `fab-rim against background` pairs. The Add pill's own pairs (`brand-deep-foreground on brand-deep`, and the dark-only `brand-vivid` ring) were added in Task 1.

- [ ] **Step 7: The browser tests**

`e2e/support/add.ts` becomes:

```ts
import { expect, type Page } from '@playwright/test';

/** The Add menu's first item, which opens the form as an expense, in either language. Its hint follows the name. */
export const ADD_EXPENSE = /^(Expense|הוצאה)(\s|$)/;

/** Open the add-transaction form the way a person does: the Add pill, then "Expense". */
export async function openAddSheet(page: Page): Promise<void> {
  await page.getByTestId('add-button').click();
  const item = page.getByRole('menuitem', { name: ADD_EXPENSE });
  await expect(item).toBeVisible();
  await item.click();
}
```

In `e2e/08-polish.spec.ts`:

- Change the import to `ADD_EXPENSE`, and every `ADD_MANUALLY` to `ADD_EXPENSE`.
- Change every `getByTestId('fab')` to `getByTestId('add-button')`, and `focused.testid === 'fab'` to `focused.testid === 'add-button'`.
- Change the comment `"Add manually"` to `"Expense"`.

In `e2e/00-shell.spec.ts`, inside `test.describe('@fab add button'`:

- Rename the describe to `'@fab the Add pill'`.
- Change every `getByTestId('fab')` to `getByTestId('add-button')`.
- Replace the test `'renders as a circle with the plus centred'` with:

```ts
test('renders as a labelled pill, at least 44px high', async ({ page }) => {
  const pill = page.getByTestId('add-button');
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText(/Add|הוספה/);

  const box = await pill.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44); // WCAG 2.2 target size
  expect(box!.width).toBeGreaterThan(box!.height); // a pill, not a disc
});
```

- In `'opens the transaction sheet'`, `{ name: /add transaction/i }` becomes `{ name: /^(Add|הוספה)$/ }`.
- In `'offers adding by hand or by Smart import…'`, rename the test to `'offers an expense, income or Smart import, and says why import is unavailable here'`, and change `toHaveCount(2)` to `toHaveCount(3)`.

- [ ] **Step 8: Run the tests to see them pass**

Run: `pnpm exec vitest run --project dom src/components src/features/feed src/features/transaction` and `pnpm exec vitest run --project unit src/lib/contrast.test.ts`
Expected: PASS.

Run: `pnpm exec playwright test e2e/00-shell.spec.ts e2e/08-polish.spec.ts`
Expected: PASS.

- [ ] **Step 9: Gate.** Run `pnpm verify`. Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add -A src/components src/features/feed src/features/transaction src/index.css src/lib/contrast.test.ts src/i18n/locales e2e/support/add.ts e2e/00-shell.spec.ts e2e/08-polish.spec.ts
git commit -m "The plus becomes an Add pill whose menu opens the form already set to an expense or income" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Anchored pop-outs, and the row's ⋯ menu with Duplicate (5.1)

**Files:**

- Create: `src/components/ui/popup-parts.tsx` (the arrow, close-on-scroll, close-when-detached, the shared surface class)
- Create: `src/components/ui/popup-parts.test.tsx`
- Modify: `src/components/ui/popover.tsx`, `src/components/ui/dropdown-menu.tsx` (`anchor`, `arrow`, the surface, 44px items, closing on scroll)
- Modify: `src/features/summary/prime-pill.tsx` (pass `arrow`)
- Rename: `src/features/feed/row-actions-sheet.tsx` → `row-actions-menu.tsx`, and `row-actions-sheet.test.tsx` → `row-actions-menu.test.tsx` (`git mv`)
- Modify: `src/features/feed/use-row-actions.ts` (the `RowAction` import path; `'duplicate'` is the caller's, like `'edit'`)
- Modify: `src/features/feed/feed-rows.tsx` (the ⋯ button passes itself as the anchor), `src/features/feed/virtual-feed.tsx` (the `onMenu` signature)
- Modify: `src/features/feed/feed-screen.tsx` (one menu instance at screen level, anchored)
- Modify: `src/features/transaction/use-transaction-sheet.ts` (`openDuplicate`; the add target's `from`)
- Modify: `src/features/transaction/transaction-sheet.tsx` (the add form prefilled from the source row)
- Modify: `src/domain/tx-edit.ts` (`duplicateFormValues`)
- Modify: `src/i18n/locales/{en,he}/common.json` (`tx.actionDuplicate`)
- Test: `src/domain/tx-edit.test.ts`, `src/features/feed/row-actions-menu.test.tsx`, `src/features/transaction/use-transaction-sheet.test.tsx`

**Interfaces:**

- Consumes: `SheetTarget` with `{ mode: 'add'; kind: Kind }` and `openAdd(kind?)` (Task 6); `occurrenceToFormValues` (`src/domain/tx-edit.ts`); `useEditTarget` (`use-transaction-sheet.ts`).
- Produces (every later pop-out task uses these):
  - `PopoverContent` and `DropdownMenuContent` accept `anchor?: Element | null | React.RefObject<Element | null>` and `arrow?: boolean` (default `false`). `anchor` is passed straight through to base-ui's real Positioner prop, `anchor`, declared in `node_modules/@base-ui/react/internals/useAnchorPositioning.d.ts` as `UseAnchorPositioningSharedParameters.anchor` and extended by both `PopoverPositionerProps` and `MenuPositionerProps`. They also accept base-ui's own Popup props, including `finalFocus`.
  - Every `Popover` and `DropdownMenu` closes on a page scroll of more than 4px.
  - `useCloseWhenDetached(anchor: Element | null | undefined, close: () => void): void` (`popup-parts.tsx`): it closes a pop-out whose anchor element has left the document. This is the virtualiser case.
  - `RowAction = 'edit' | 'duplicate' | 'skip' | 'restore' | 'delete'`.
  - `RowMenuTarget = { readonly occurrence: Occurrence; readonly anchor: HTMLElement }`.
  - `RowActionsMenu({ target: RowMenuTarget | undefined; onClose: () => void; onAction: (action: RowAction, occurrence: Occurrence) => void })`.
  - `VirtualFeed` and `TransactionRow`: `onMenu?: (occurrence: Occurrence, anchor: HTMLElement) => void`.
  - `SheetTarget`'s add member becomes `{ mode: 'add'; kind: Kind; from?: { transactionId: string; at: LocalDate } }`, and the URL is `add=<kind>&from=<id>&at=<originalDate>`.
  - `TransactionSheetApi.openDuplicate: (occurrence: Occurrence) => void`.
  - `duplicateFormValues(occurrence: Occurrence, transaction: Transaction, base: TxFormValues, today: LocalDate): TxFormValues`.

Decisions:

- **`arrow` defaults to off.** The seven pop-outs pass `arrow`. The other menus (the account menu, the profile switcher, the Add menu) keep their plain surface, because the spec's arrow rule is stated for the seven.
- **The arrow is drawn for `side="top"` and `side="bottom"` only.** All seven open above or below their anchor, and physical left/right arrow offsets would fail `gate:rtl`.
- **44px items are set in the wrapper** (`min-h-11 sm:min-h-8` on `DropdownMenuItem` and `DropdownMenuRadioItem`), so every menu in the app meets the phone target, not only the seven.
- **The old sheet's date footer is dropped.** The menu now sits on the row itself, whose date is beside it.
- **Duplicate's amount is the row's amount**, which for a plan is one payment, exactly as the edit form shows it (`occurrenceToFormValues`). Its profile is the add form's default, because the spec does not list the profile among the copied fields.

Copy: `tx.actionDuplicate`: en "Duplicate", he "שכפול".

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/popup-parts.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

describe('pop-outs', () => {
  it('draw an arrow when asked, on the rounded blue-shadowed surface', async () => {
    render(
      <Popover>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent arrow data-testid="pop">
          body
        </PopoverContent>
      </Popover>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'open' }));
    const pop = await screen.findByTestId('pop');

    expect(pop).toHaveClass('rounded-2xl', 'shadow-brand-deep/15');
    expect(pop.querySelector('[data-slot="popup-arrow"]')).not.toBeNull();
  });

  it('close on scroll', async () => {
    render(
      <Popover>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent data-testid="pop">body</PopoverContent>
      </Popover>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'open' }));
    await screen.findByTestId('pop');

    act(() => {
      window.scrollY = 200;
      window.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(() => screen.queryByTestId('pop')).toBeNull();
    window.scrollY = 0;
  });

  it('give menu items a 44px target on a phone', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>one</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'menu' }));

    expect(await screen.findByRole('menuitem', { name: 'one' })).toHaveClass('min-h-11', 'sm:min-h-8');
  });
});
```

`window.scrollY` is writable in jsdom. If the type checker objects, use `Object.defineProperty(window, 'scrollY', { value: 200, configurable: true })` and restore it the same way.

`git mv src/features/feed/row-actions-sheet.test.tsx src/features/feed/row-actions-menu.test.tsx`. In it:

- Change the import to `import { RowActionsMenu, type RowMenuTarget } from './row-actions-menu';`.
- Replace the `render` helper with:

```tsx
function anchorButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = 'more';
  document.body.append(button);
  return button;
}

const render = (occurrence: Occurrence | undefined, onAction = vi.fn(), onClose = vi.fn()) => {
  const target: RowMenuTarget | undefined =
    occurrence === undefined ? undefined : { occurrence, anchor: anchorButton() };
  const result = renderWithProviders(
    <RowActionsMenu target={target} onClose={onClose} onAction={onAction} />,
  );
  return { ...result, onAction, onClose, target };
};
```

- Add `afterEach(() => { document.body.innerHTML = ''; });` (import `afterEach`).
- Replace every `getByRole('button', …)` and `queryByRole('button', …)` with `findByRole('menuitem', …)` / `queryByRole('menuitem', …)`, adding `await` (the menu opens asynchronously). Make those tests `async`.
- In `'choosing an action'`, the click target becomes `await screen.findByRole('menuitem', { name: /skip this one/i })`.

Then add:

```tsx
describe('the menu itself', () => {
  it('offers Edit, Duplicate, Skip, a divider, then Delete, in that order, for a series', async () => {
    render(occurrence({ type: 'monthly', dayOfMonth: 10 }));
    const items = await screen.findAllByRole('menuitem');

    expect(items.map((i) => i.textContent?.split(/(?=[A-Z])/)[0])).toEqual([
      'Edit',
      'Duplicate',
      'Skip this one',
      'Delete the whole series',
    ]);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('offers Duplicate for a one-time row too, and reports it', async () => {
    const user = userEvent.setup();
    const target = occurrence({ type: 'one_time' });
    const { onAction } = render(target);

    await user.click(await screen.findByRole('menuitem', { name: /^duplicate$/i }));
    expect(onAction).toHaveBeenCalledWith('duplicate', target);
  });

  it('is anchored to the row with an arrow, and every item clears 44px on a phone', async () => {
    render(occurrence({ type: 'one_time' }));
    const menu = await screen.findByRole('menu');

    expect(menu.querySelector('[data-slot="popup-arrow"]')).not.toBeNull();
    for (const item of screen.getAllByRole('menuitem')) expect(item).toHaveClass('min-h-11');
  });

  it('gives focus back to the row button on Escape', async () => {
    const user = userEvent.setup();
    const { target, onClose } = render(occurrence({ type: 'one_time' }));
    await screen.findByRole('menu');

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    expect(target?.anchor).toHaveFocus();
  });

  it('closes when the virtualiser unmounts the row it is anchored to', async () => {
    const { target, onClose } = render(occurrence({ type: 'one_time' }));
    await screen.findByRole('menu');

    act(() => {
      target?.anchor.remove();
    });
    await expect.poll(() => onClose.mock.calls.length).toBeGreaterThan(0);
  });
});
```

Import `act` from `@testing-library/react`. The `split(/(?=[A-Z])/)` takes each item's label without its hint, because label and hint are adjacent text. If an item has no hint, the label is the whole text.

Add to `src/domain/tx-edit.test.ts`:

```ts
describe('duplicateFormValues', () => {
  it('copies what the row says, dated today and one-time, whatever the source was', () => {
    const plan = makeTx({
      id: 'sofa',
      date: d('2026-03-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10, installments: 12 },
      note: 'Sofa',
      paymentMethodId: 'card-1',
    });
    const occurrence = occurrenceOf(plan, [], '2026-09-10');
    const base = defaultFormValues({ profileId: 'p-active', currency: 'ILS', today: d('2026-10-08') });

    expect(duplicateFormValues(occurrence, plan, base, d('2026-10-08'))).toMatchObject({
      profileId: 'p-active',
      kind: plan.kind,
      categoryId: occurrence.categoryId,
      amount: occurrenceToFormValues(occurrence, plan).amount,
      currency: occurrence.money.currency,
      paymentMethodId: 'card-1',
      note: 'Sofa',
      date: '2026-10-08',
      mode: 'one_time',
      installmentCount: '',
    });
  });
});
```

Import `duplicateFormValues` from `./tx-edit` and `defaultFormValues` from `./tx-form`. Use the file's existing `occurrenceOf` and `makeTx` helpers. If `makeTx` takes `note` and `paymentMethodId` under other names, use the names the file's other tests use.

Add to `src/features/transaction/use-transaction-sheet.test.tsx`, adding a third probe button that calls `sheet.openDuplicate(fakeOccurrence)`:

```tsx
it('writes a duplicate as an add of the row kind, naming its source slot', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Probe />);

  await user.click(screen.getByRole('button', { name: 'duplicate' }));
  expect(screen.getByTestId('search')).toHaveTextContent('?add=income&from=salary&at=2026-09-10');
  expect(target()).toEqual({
    mode: 'add',
    kind: 'income',
    from: { transactionId: 'salary', at: '2026-09-10' },
  });
});
```

Here `fakeOccurrence = { transaction: { id: 'salary', kind: 'income' }, originalDate: '2026-09-10' } as unknown as Occurrence`, defined at the top of the file.

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm exec vitest run --project dom src/components/ui/popup-parts.test.tsx src/features/feed/row-actions-menu.test.tsx src/features/transaction/use-transaction-sheet.test.tsx` and `pnpm exec vitest run --project unit src/domain/tx-edit.test.ts`
Expected: FAIL. There is no arrow, no scroll close, no `row-actions-menu`, no `openDuplicate` and no `duplicateFormValues`.

- [ ] **Step 3: The shared popup parts**

Create `src/components/ui/popup-parts.tsx`:

```tsx
import * as React from 'react';

/**
 * What every pop-out shares: the rounded surface with its soft blue shadow,
 * the small arrow, and the two ways it closes on its own.
 */

/** The surface: rounded-2xl, a soft sapphire-tinted shadow, and the hairline ring. */
export const POPUP_SURFACE = 'rounded-2xl shadow-lg shadow-brand-deep/15 ring-1 ring-foreground/10';

export type PopupActions = { readonly close: () => void; readonly unmount: () => void };

/** The root's imperative handle, handed to the content so it can close itself on scroll. */
export const PopupActionsContext = React.createContext<React.RefObject<PopupActions | null> | null>(null);

/**
 * Close the open pop-out once the page scrolls. A pop-out pinned to a row
 * that has moved away points at nothing. 4px of slack ignores the sub-pixel
 * jitter of a focus change.
 */
export function useCloseOnScroll(actions: React.RefObject<PopupActions | null> | null): void {
  React.useEffect(() => {
    if (actions === null) return;
    const startY = window.scrollY;
    const onScroll = (): void => {
      if (Math.abs(window.scrollY - startY) > 4) actions.current?.close();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [actions]);
}

/** Mounted inside the popup, so it listens only while the pop-out is open. */
export function CloseOnScroll() {
  useCloseOnScroll(React.use(PopupActionsContext));
  return null;
}

/**
 * Close a pop-out whose anchor has left the document.
 *
 * The feed is virtualised: a row scrolled out of the rendered range is
 * unmounted, and a menu still anchored to its ⋯ would float at the page's
 * top-left pointing at nothing, and act on a row nobody can see.
 */
export function useCloseWhenDetached(anchor: Element | null | undefined, close: () => void): void {
  const closeRef = React.useRef(close);
  React.useEffect(() => {
    closeRef.current = close;
  }, [close]);

  React.useEffect(() => {
    if (anchor === null || anchor === undefined) return;
    const observer = new MutationObserver(() => {
      if (!anchor.isConnected) closeRef.current();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, [anchor]);
}

/**
 * The arrow's classes. Drawn above or below only: every pop-out in the app
 * opens on one of those two sides, and left/right offsets are physical.
 */
export const ARROW_CLASS = 'data-[side=bottom]:-top-2 data-[side=top]:-bottom-2 data-[side=top]:rotate-180';

/** base-ui's own arrow shape: the popover's fill, with its hairline edge. */
export function ArrowSvg() {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" fill="none" aria-hidden="true">
      <path
        d="M9.66437 2.60207L4.80758 6.97318C4.07308 7.63423 3.11989 8 2.13172 8H0V10H20V8H18.5349C17.5468 8 16.5936 7.63423 15.8591 6.97318L11.0023 2.60207C10.622 2.2598 10.0447 2.25979 9.66437 2.60207Z"
        className="fill-popover"
      />
      <path
        d="M8.99542 1.85876C9.75604 1.17425 10.9106 1.17422 11.6713 1.85878L16.5281 6.22989C17.0789 6.72568 17.7938 7.00001 18.5349 7.00001L15.89 7L11.0023 2.60207C10.622 2.2598 10.0447 2.2598 9.66436 2.60207L4.77734 7L2.13171 7.00001C2.87284 7.00001 3.58774 6.72568 4.13861 6.22989L8.99542 1.85876Z"
        className="fill-foreground/10"
      />
    </svg>
  );
}
```

- [ ] **Step 4: The wrappers**

In `src/components/ui/popover.tsx`, import `{ ARROW_CLASS, ArrowSvg, CloseOnScroll, POPUP_SURFACE, PopupActionsContext, type PopupActions } from './popup-parts';`. Replace `Popover` and `PopoverContent` with:

```tsx
function Popover({ actionsRef, ...props }: PopoverPrimitive.Root.Props) {
  const own = React.useRef<PopupActions | null>(null);
  const actions = actionsRef ?? own;
  return (
    <PopupActionsContext value={actions}>
      <PopoverPrimitive.Root data-slot="popover" actionsRef={actions} {...props} />
    </PopupActionsContext>
  );
}

function PopoverContent({
  className,
  align = 'center',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  anchor,
  arrow = false,
  children,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset' | 'anchor'> & {
    /** A small arrow pointing at the anchor, for a pop-out whose anchor is not its own edge. */
    readonly arrow?: boolean;
  }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        anchor={anchor}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={arrow ? sideOffset + 6 : sideOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 bg-popover p-3 text-sm text-popover-foreground outline-hidden duration-100 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-start-2 data-[side=inline-start]:slide-in-from-end-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            POPUP_SURFACE,
            className,
          )}
          {...props}
        >
          <CloseOnScroll />
          {arrow ? (
            <PopoverPrimitive.Arrow data-slot="popup-arrow" className={ARROW_CLASS}>
              <ArrowSvg />
            </PopoverPrimitive.Arrow>
          ) : null}
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}
```

In `src/components/ui/dropdown-menu.tsx`, import the same names plus `Menu as MenuPrimitive` (already imported). Replace `DropdownMenu` and `DropdownMenuContent` with:

```tsx
function DropdownMenu({ actionsRef, ...props }: MenuPrimitive.Root.Props) {
  const own = React.useRef<PopupActions | null>(null);
  const actions = actionsRef ?? own;
  return (
    <PopupActionsContext value={actions}>
      <MenuPrimitive.Root data-slot="dropdown-menu" actionsRef={actions} {...props} />
    </PopupActionsContext>
  );
}

function DropdownMenuContent({
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  anchor,
  arrow = false,
  className,
  children,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset' | 'anchor'> & {
    /** A small arrow pointing at the anchor, for a pop-out whose anchor is not its own edge. */
    readonly arrow?: boolean;
  }) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        anchor={anchor}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={arrow ? sideOffset + 6 : sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            'z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto bg-popover p-1 text-popover-foreground duration-100 outline-none data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-start-2 data-[side=inline-start]:slide-in-from-end-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            POPUP_SURFACE,
            arrow ? 'overflow-visible' : null,
            className,
          )}
          {...props}
        >
          <CloseOnScroll />
          {arrow ? (
            <MenuPrimitive.Arrow data-slot="popup-arrow" className={ARROW_CLASS}>
              <ArrowSvg />
            </MenuPrimitive.Arrow>
          ) : null}
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}
```

`overflow-visible` with an arrow, because `overflow-y-auto` would clip the arrow, which sits outside the popup's box. The seven menus are short, so they never need to scroll.

In `DropdownMenuItem`'s class string, change `rounded-md px-1.5 py-1` to `min-h-11 rounded-lg px-1.5 py-1 sm:min-h-8`. In `DropdownMenuRadioItem`'s, change `rounded-md py-1` to `min-h-11 rounded-lg py-1 sm:min-h-8`. `focus:bg-accent` already holds and is now sapphire.

In `src/features/summary/prime-pill.tsx`, add `arrow` to `<PopoverContent … >`.

- [ ] **Step 5: The row menu**

`git mv src/features/feed/row-actions-sheet.tsx src/features/feed/row-actions-menu.tsx`, then replace its contents with:

```tsx
import { cn } from 'cn';
import { Copy, Pencil, SkipForward, Trash2, Undo2 } from 'lucide-react';
import { type ComponentType, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useCloseWhenDetached } from '@/components/ui/popup-parts';
import type { Occurrence } from '@/types/domain';

export type RowAction = 'edit' | 'duplicate' | 'skip' | 'restore' | 'delete';

export type RowMenuTarget = { readonly occurrence: Occurrence; readonly anchor: HTMLElement };

/**
 * The row menu: ONE menu at screen level, anchored to the ⋯ of the row it
 * was opened from, rather than a menu per row.
 *
 * In a virtualised list a per-row menu unmounts the moment its row scrolls
 * out of the rendered range. One instance, driven by the selected occurrence
 * and pointed at that row's button through base-ui's `anchor`, has no such
 * coupling, and when that row does unmount, the menu closes rather than
 * floating over nothing.
 *
 * What is offered depends on the row, because the same word means different
 * things:
 *
 *  - SKIP applies to a series only. For a one-time transaction "skip" and
 *    "delete" are the same act, and offering both invites the user to pick the
 *    one that is not recoverable from Settings.
 *  - DELETE on a series takes the WHOLE series, and says so. Silently deleting
 *    one occurrence under a label that says "delete" is how a year of rent
 *    disappears.
 *  - DUPLICATE opens the add form prefilled from the row, dated today and
 *    one-time, whatever the row was.
 */
export function RowActionsMenu({
  target,
  onClose,
  onAction,
}: {
  /** The row whose menu is open, with its ⋯ button; undefined when closed. */
  readonly target: RowMenuTarget | undefined;
  readonly onClose: () => void;
  readonly onAction: (action: RowAction, occurrence: Occurrence) => void;
}) {
  const { t } = useTranslation();
  useCloseWhenDetached(target?.anchor, onClose);

  // Focus goes back to the ⋯ it came from, read at close time: by then the
  // target is already cleared.
  const lastAnchor = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (target !== undefined) lastAnchor.current = target.anchor;
  }, [target]);

  const occurrence = target?.occurrence;
  const isSeries = occurrence !== undefined && occurrence.transaction.recurrence.type !== 'one_time';

  return (
    <DropdownMenu
      open={target !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuContent
        anchor={target?.anchor}
        arrow
        side="bottom"
        align="end"
        className="w-64 p-1.5"
        data-testid="row-menu"
        finalFocus={() => (lastAnchor.current?.isConnected === true ? lastAnchor.current : false)}
      >
        {occurrence === undefined ? null : (
          <>
            <MenuRow
              icon={Pencil}
              label={t('tx.actionEdit')}
              onSelect={() => {
                onAction('edit', occurrence);
              }}
            />
            <MenuRow
              icon={Copy}
              label={t('tx.actionDuplicate')}
              onSelect={() => {
                onAction('duplicate', occurrence);
              }}
            />
            {isSeries ? (
              occurrence.isSkipped ? (
                <MenuRow
                  icon={Undo2}
                  flip
                  label={t('tx.actionRestore')}
                  hint={t('tx.actionRestoreHint')}
                  onSelect={() => {
                    onAction('restore', occurrence);
                  }}
                />
              ) : (
                <MenuRow
                  icon={SkipForward}
                  flip
                  label={t('tx.actionSkip')}
                  hint={t('tx.actionSkipHint')}
                  onSelect={() => {
                    onAction('skip', occurrence);
                  }}
                />
              )
            ) : null}
            <DropdownMenuSeparator />
            <MenuRow
              icon={Trash2}
              destructive
              label={isSeries ? t('tx.actionDeleteSeries') : t('tx.actionDelete')}
              hint={isSeries ? t('tx.actionDeleteSeriesHint') : t('tx.actionDeleteHint')}
              onSelect={() => {
                onAction('delete', occurrence);
              }}
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuRow({
  icon: Icon,
  label,
  hint,
  destructive = false,
  flip = false,
  onSelect,
}: {
  readonly icon: ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>;
  readonly label: string;
  readonly hint?: string;
  readonly destructive?: boolean;
  /** True only for icons on §7's directional allowlist. */
  readonly flip?: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      variant={destructive ? 'destructive' : 'default'}
      className="gap-3 px-2.5 py-2"
      onClick={onSelect}
    >
      {/*
        The flip is per icon, from the directional allowlist.
        SkipForward and Undo2 point along the reading direction and must mirror;
        Pencil, Copy and Trash2 encode no direction at all.
      */}
      <Icon className={cn('size-4', flip && 'cn-rtl-flip rtl:rotate-180')} strokeWidth={1.75} aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint === undefined ? null : <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </DropdownMenuItem>
  );
}
```

In `src/features/feed/use-row-actions.ts`, change the import to `import type { RowAction } from './row-actions-menu';`, and replace `case 'edit':` with:

```ts
          case 'edit':
          case 'duplicate':
            // Handled by the caller, which owns the sheet's URL state.
            return;
```

Add `"actionDuplicate": "Duplicate"` under `tx` in `src/i18n/locales/en/common.json` and `"actionDuplicate": "שכפול"` in `he/common.json`. Remove `tx.actionsTitle` only if `grep -rn "actionsTitle" src` finds no other user.

- [ ] **Step 6: Rows report their ⋯ button**

In `src/features/feed/feed-rows.tsx`, the prop type becomes `onMenu?: (occurrence: Occurrence, anchor: HTMLElement) => void;`. The ⋯ `Button`'s `onClick` becomes:

```tsx
        onClick={(event) => onMenu?.(occurrence, event.currentTarget)}
```

In `src/features/feed/virtual-feed.tsx`, change both `onMenu?: (occurrence: Occurrence) => void` (the `VirtualFeed` props and `RenderOptions`) to `onMenu?: (occurrence: Occurrence, anchor: HTMLElement) => void`.

- [ ] **Step 7: Duplicate opens a prefilled add form**

In `src/domain/tx-edit.ts`, after `occurrenceToFormValues`, add:

```ts
/**
 * The add form, prefilled from a row: what it was, how much, in what currency,
 * on which card, under what name. It is dated today and one-time, whatever the
 * source's recurrence was, because a duplicate is a new purchase, not a second
 * copy of a plan. The amount is the row's own (one payment, for a plan), as
 * the row shows it.
 */
export function duplicateFormValues(
  occurrence: Occurrence,
  transaction: Transaction,
  base: TxFormValues,
  today: LocalDate,
): TxFormValues {
  const from = occurrenceToFormValues(occurrence, transaction);
  return {
    ...base,
    kind: from.kind,
    categoryId: from.categoryId,
    amount: from.amount,
    currency: from.currency,
    paymentMethodId: from.paymentMethodId,
    note: from.note,
    date: today,
    mode: 'one_time',
  };
}
```

In `src/features/transaction/use-transaction-sheet.ts`:

- Add `const FROM = 'from';` under `AT`, with the comment `/** Duplicate: the transaction the add form is prefilled from; its slot is AT. */`.
- The add member of `SheetTarget` becomes:

```ts
  | {
      readonly mode: 'add';
      readonly kind: Kind;
      /** Duplicate: the row the form is prefilled from. */
      readonly from?: { readonly transactionId: string; readonly at: LocalDate };
    }
```

- In the `target` memo, the add branch becomes:

```ts
const adding = params.get(ADD);
if (adding !== null) {
  const kind = adding === 'income' ? 'income' : 'expense';
  const fromId = params.get(FROM);
  const fromAt = params.get(AT);
  return fromId !== null && fromId !== '' && fromAt !== null && isLocalDate(fromAt)
    ? { mode: 'add', kind, from: { transactionId: fromId, at: fromAt } }
    : { mode: 'add', kind };
}
```

- In `write`, add `updated.delete(FROM);` with the other deletes, and replace the add line with:

```ts
if (next.mode === 'add') {
  updated.set(ADD, next.kind);
  if (next.from !== undefined) {
    updated.set(FROM, next.from.transactionId);
    updated.set(AT, next.from.at);
  }
}
```

- Add `readonly openDuplicate: (occurrence: Occurrence) => void;` to `TransactionSheetApi`, and to the returned object:

```ts
      openDuplicate: (occurrence: Occurrence) => {
        write({
          mode: 'add',
          kind: occurrence.transaction.kind,
          from: { transactionId: occurrence.transaction.id, at: occurrence.originalDate },
        });
      },
```

In `src/features/transaction/transaction-sheet.tsx`:

- Import `duplicateFormValues` from `@/domain/tx-edit`.
- After `adding`, load the source row through the same live query the edit form uses:

```tsx
// Duplicate: the row named by the URL, loaded exactly as the edit form loads one.
const source = useEditTarget(
  target.mode === 'add' && target.from !== undefined
    ? { mode: 'edit', transactionId: target.from.transactionId, at: target.from.at }
    : { mode: 'closed' },
  today,
);
const duplicating = target.mode === 'add' && target.from !== undefined;
const addInitial =
  duplicating && source.status === 'ready'
    ? duplicateFormValues(source.target.occurrence, source.target.transaction, adding, today)
    : adding;
```

- Replace the add branch `{isAdd ? (<TransactionForm key="add-…" initial={adding} … />)` with:

```tsx
        {isAdd ? (
          duplicating && (source.status === 'loading' || source.status === 'idle') ? (
            <div className="space-y-3 px-4 pb-6" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <TransactionForm
              // A fresh form for each kind and each source row.
              key={`add-${addKind}-${target.mode === 'add' && target.from !== undefined ? `${target.from.transactionId}@${target.from.at}` : 'new'}`}
              initial={addInitial}
              profiles={profiles}
              categories={categories}
              paymentMethods={paymentMethods}
              baseCurrency={baseCurrency}
              today={today}
              onSaved={onSaved}
              onCancel={() => {
                onOpenChange(false);
              }}
            />
          )
        ) : target.mode === 'edit' ? (
```

A source row deleted meanwhile (`gone`) falls back to a plain add form of the same kind.

- [ ] **Step 8: One menu on the feed, anchored**

In `src/features/feed/feed-screen.tsx`:

- Replace the `RowActionsSheet` import with `import { RowActionsMenu, type RowMenuTarget } from './row-actions-menu';`.
- `menuFor`'s state becomes `useState<RowMenuTarget | undefined>(undefined)`. Keep its comment, adding: "It carries the row's ⋯ button, which the menu is anchored to."
- `VirtualFeed`'s `onMenu` becomes:

```tsx
            onMenu={(occurrence, anchor) => {
              if (isCardFee(occurrence)) void navigate(ROUTES.cards);
              else setMenuFor({ occurrence, anchor });
            }}
```

- Replace the `<RowActionsSheet … />` element with:

```tsx
<RowActionsMenu
  target={menuFor}
  onClose={() => {
    setMenuFor(undefined);
  }}
  onAction={(action, occurrence) => {
    // Closed first, unconditionally: leaving it open over a toast covers
    // the Undo the toast just offered.
    setMenuFor(undefined);
    if (action === 'edit') {
      sheet.openEdit(occurrence);
      return;
    }
    if (action === 'duplicate') {
      sheet.openDuplicate(occurrence);
      return;
    }
    void runAction(action, occurrence);
  }}
/>
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `pnpm exec vitest run --project dom src/components/ui src/features/feed src/features/transaction src/features/summary` and `pnpm exec vitest run --project unit src/domain/tx-edit.test.ts`
Expected: PASS.

- [ ] **Step 10: Look at it.** Run `pnpm dev`. In Playwright's Chromium at 390×844, in English and in Hebrew:
  - open a row's ⋯ and check the menu sits under the button with its arrow pointing at it;
  - scroll, and check that the menu closes;
  - choose Duplicate, and check that the form opens dated today, one-time, with the row's amount and card.

- [ ] **Step 11: Gate.** Run `pnpm verify`. Expected: exit 0.

- [ ] **Step 12: Commit**

```bash
git add -A src/components/ui src/features/feed src/features/transaction src/features/summary/prime-pill.tsx src/domain/tx-edit.ts src/domain/tx-edit.test.ts src/i18n/locales
git commit -m "Pop-outs anchor to what opened them, and a row's menu opens on the row with a new Duplicate" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The month pop-out (5.2)

**Files:**

- Modify: `src/domain/feed-filters.ts` (`monthGrid`, `yearBounds`)
- Modify: `src/features/summary/month-cursor.tsx` (the label becomes a pop-out trigger; the pop-out)
- Modify: `src/features/feed/feed-screen.tsx`, `src/features/chart/chart-screen.tsx` (pass `onPick={setMonth}`; the chart already destructures `stepMonth` from `useFeedFilters`, so add `setMonth`)
- Modify: `src/i18n/locales/{en,he}/common.json` (`month.*`)
- Test: `src/domain/feed-filters.test.ts`, `src/features/summary/summary.test.tsx`

**Interfaces:**

- Consumes: `Popover`, `PopoverTrigger`, `PopoverContent` with `arrow` (Task 7); `MonthCursor`'s `tone` (Task 4); `MONTHS_FORWARD`, `MONTHS_BACK`, `isAtHorizon`.
- Produces:
  - `type MonthCellState = 'actual' | 'forecast' | 'beyond'`.
  - `type MonthCell = { readonly month: LocalDate; readonly state: MonthCellState; readonly isThisMonth: boolean }`.
  - `monthGrid(year: number, today: LocalDate): readonly MonthCell[]`: twelve cells, January first. A month is `'beyond'` when it is later than the last month `›` can reach, `'forecast'` when it is after this month, and `'actual'` otherwise.
  - `yearBounds(today: LocalDate): { readonly first: number; readonly last: number }`.
  - `MonthCursor({ month, today, onStep, onPick?: (month: LocalDate) => void, tone? })`. Without `onPick` the label stays plain text.

Decisions:

- **"The current month filled sapphire"** is read as **the month being viewed**: the picker shows where you are. Today's month gets a sapphire outline, so "this month" can still be found after stepping away, and "Back to this month" jumps there.
- **The disabled months** are exactly those `›` cannot reach. `monthGrid` uses the same bound as `isAtHorizon`: the month `MONTHS_FORWARD` after this one is the last month offered, and every later one is `'beyond'`. The backward guard `MONTHS_BACK` bounds the year stepper.
- **The chart's cursor** gets the pop-out too. It is the same component, and the chart already moves by month.

Copy (`common.json`, under `month`):

| key         | en                 | he                |
| ----------- | ------------------ | ----------------- |
| `choose`    | Choose a month     | בחירת חודש        |
| `prevYear`  | Previous year      | השנה הקודמת       |
| `nextYear`  | Next year          | השנה הבאה         |
| `thisMonth` | Back to this month | חזרה לחודש הנוכחי |
| `beyond`    | Past the forecast  | מעבר לתחזית       |

- [ ] **Step 1: Write the failing tests**

Add to `src/domain/feed-filters.test.ts` (import `monthGrid` and `yearBounds`; use the file's existing `d` helper or `'…' as LocalDate`):

```ts
describe('monthGrid', () => {
  const today = d('2026-09-15');

  it('marks this year: the months so far as actual, the rest as forecast', () => {
    const cells = monthGrid(2026, today);

    expect(cells).toHaveLength(12);
    expect(cells[0]).toEqual({ month: '2026-01-01', state: 'actual', isThisMonth: false });
    expect(cells[8]).toEqual({ month: '2026-09-01', state: 'actual', isThisMonth: true });
    expect(cells[9]?.state).toBe('forecast');
    expect(cells[11]?.state).toBe('forecast');
  });

  it('stops offering months exactly where › stops', () => {
    const cells = monthGrid(2027, today);
    const lastOffered = cells.filter((c) => c.state !== 'beyond').at(-1);

    // isAtHorizon is true on the last month › can reach, and false on the one before.
    expect(lastOffered?.month).toBe('2027-09-01');
    expect(isAtHorizon(d('2027-09-01'), today)).toBe(true);
    expect(isAtHorizon(d('2027-08-01'), today)).toBe(false);
    expect(cells.slice(9).every((c) => c.state === 'beyond')).toBe(true);
  });

  it('bounds the year stepper by the same limits', () => {
    expect(yearBounds(today)).toEqual({ first: 1926, last: 2027 });
  });
});
```

Add to `src/features/summary/summary.test.tsx`, inside `describe('MonthCursor'`:

```tsx
it('opens a year and its twelve months from the month label', async () => {
  const user = userEvent.setup();
  const onPick = vi.fn();
  renderWithProviders(<MonthCursor month={d('2026-09-01')} today={TODAY} onStep={vi.fn()} onPick={onPick} />);

  await user.click(screen.getByRole('button', { name: 'September 2026' }));
  const grid = await screen.findByRole('group', { name: '2026' });
  const months = within(grid).getAllByRole('button');

  expect(months).toHaveLength(12);
  // Reading order: January first, in either language.
  expect(months[0]).toHaveTextContent('Jan');
  expect(within(grid).getByRole('button', { name: 'Sep' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(grid).getByRole('button', { name: 'Sep' })).toHaveClass('bg-primary');
  // A forecast month is offered, in muted text.
  expect(within(grid).getByRole('button', { name: 'Dec' })).toHaveClass('text-muted-foreground');

  await user.click(within(grid).getByRole('button', { name: 'Mar' }));
  expect(onPick).toHaveBeenCalledWith('2026-03-01');
  expect(screen.queryByRole('group', { name: '2026' })).not.toBeInTheDocument();
});

it('disables the months past the horizon, and the year after the last', async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <MonthCursor month={d('2027-09-01')} today={TODAY} onStep={vi.fn()} onPick={vi.fn()} />,
  );

  await user.click(screen.getByRole('button', { name: 'September 2027' }));
  const grid = await screen.findByRole('group', { name: '2027' });

  expect(within(grid).getByRole('button', { name: 'Sep' })).toBeEnabled();
  expect(within(grid).getByRole('button', { name: 'Oct' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled();
});

it('steps the year, and goes back to this month', async () => {
  const user = userEvent.setup();
  const onPick = vi.fn();
  renderWithProviders(<MonthCursor month={d('2026-03-01')} today={TODAY} onStep={vi.fn()} onPick={onPick} />);

  await user.click(screen.getByRole('button', { name: 'March 2026' }));
  await user.click(await screen.findByRole('button', { name: 'Previous year' }));
  expect(await screen.findByRole('group', { name: '2025' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Back to this month' }));
  expect(onPick).toHaveBeenCalledWith('2026-09-01');
});

it('gives focus back to the label on Escape', async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <MonthCursor month={d('2026-09-01')} today={TODAY} onStep={vi.fn()} onPick={vi.fn()} />,
  );
  const label = screen.getByRole('button', { name: 'September 2026' });

  await user.click(label);
  await screen.findByRole('group', { name: '2026' });
  await user.keyboard('{Escape}');
  expect(label).toHaveFocus();
});

it('keeps the arrows and the live heading', () => {
  renderWithProviders(
    <MonthCursor month={d('2026-09-01')} today={TODAY} onStep={vi.fn()} onPick={vi.fn()} />,
  );

  expect(screen.getByRole('heading', { name: 'September 2026' })).toHaveAttribute('aria-live', 'polite');
  expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
});
```

Import `within` from `@testing-library/react`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm exec vitest run --project unit src/domain/feed-filters.test.ts` and `pnpm exec vitest run --project dom src/features/summary/summary.test.tsx`
Expected: FAIL. `monthGrid` does not exist, and the label is not a button.

- [ ] **Step 3: The grid's logic**

In `src/domain/feed-filters.ts`, add `parseLocalDate` to the `@/lib/dates` import, and after `isAtHorizon` add:

```ts
export type MonthCellState = 'actual' | 'forecast' | 'beyond';
export type MonthCell = {
  readonly month: LocalDate;
  readonly state: MonthCellState;
  readonly isThisMonth: boolean;
};

/**
 * A year's twelve months, as the month pop-out offers them, January first.
 *
 * `beyond` is everything › cannot reach: the same bound as `isAtHorizon`,
 * so the grid never offers a month the arrows refuse. `forecast` is a month
 * still to come, shown but muted, because what it holds is projected.
 */
export function monthGrid(year: number, today: LocalDate): readonly MonthCell[] {
  const thisMonth = startOfMonth(today);
  const latest = startOfMonth(addMonthsClamped(thisMonth, MONTHS_FORWARD, 1));
  return Array.from({ length: 12 }, (_, index) => {
    const month = makeLocalDate(year, index + 1, 1);
    const state: MonthCellState =
      compareLocal(month, latest) > 0 ? 'beyond' : compareLocal(month, thisMonth) > 0 ? 'forecast' : 'actual';
    return { month, state, isThisMonth: month === thisMonth };
  });
}

/** The first and last year the month pop-out can show, from the cursor's own bounds. */
export function yearBounds(today: LocalDate): { readonly first: number; readonly last: number } {
  const thisMonth = startOfMonth(today);
  return {
    first: parseLocalDate(addMonthsClamped(thisMonth, -MONTHS_BACK, 1)).year,
    last: parseLocalDate(addMonthsClamped(thisMonth, MONTHS_FORWARD, 1)).year,
  };
}
```

- [ ] **Step 4: The pop-out**

In `src/features/summary/month-cursor.tsx`:

- Add imports:

```tsx
import { useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isAtHorizon, monthGrid, yearBounds } from '@/domain/feed-filters';
import { formatLocalDate, parseLocalDate, startOfMonth } from '@/lib/dates';
```

Merge these with the existing imports.

- Add `onPick` to the props, with the type `onPick?: (month: LocalDate) => void`.
- Replace the `<h2 …>{label}</h2>` element with:

```tsx
<h2 className={cn('font-semibold whitespace-nowrap', onPanel ? 'text-sm' : 'text-base')} aria-live="polite">
  {onPick === undefined ? (
    <span className={onPanel ? 'px-1' : undefined}>{label}</span>
  ) : (
    <MonthPicker month={month} today={today} label={label} onPick={onPick} onPanel={onPanel} />
  )}
</h2>
```

- Add below `MonthCursor`:

```tsx
/**
 * The month label as a button: a year stepper, the year's months in a 4×3
 * grid in reading order, and the way back to this month. The month being
 * viewed is filled sapphire; this month has a sapphire outline; months still
 * to come are muted, and months past the forecast are disabled.
 */
function MonthPicker({
  month,
  today,
  label,
  onPick,
  onPanel,
}: {
  readonly month: LocalDate;
  readonly today: LocalDate;
  readonly label: string;
  readonly onPick: (month: LocalDate) => void;
  readonly onPanel: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => parseLocalDate(month).year);
  const bounds = yearBounds(today);
  const thisMonth = startOfMonth(today);

  const pick = (next: LocalDate): void => {
    setOpen(false);
    onPick(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Every opening starts on the year being viewed.
        if (next) setYear(parseLocalDate(month).year);
        setOpen(next);
      }}
    >
      <PopoverTrigger
        className={cn(
          'min-h-11 rounded-full px-2 focus-visible:outline-none sm:min-h-9',
          onPanel
            ? 'hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60'
            : 'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {label}
      </PopoverTrigger>
      <PopoverContent arrow align="center" className="w-72 gap-3">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 sm:size-9"
            aria-label={t('month.prevYear')}
            disabled={year <= bounds.first}
            onClick={() => {
              setYear(year - 1);
            }}
          >
            <ChevronLeft className="cn-rtl-flip size-5 rtl:rotate-180" aria-hidden="true" />
          </Button>
          <span className="text-base font-semibold tabular-nums">{year}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 sm:size-9"
            aria-label={t('month.nextYear')}
            disabled={year >= bounds.last}
            onClick={() => {
              setYear(year + 1);
            }}
          >
            <ChevronRight className="cn-rtl-flip size-5 rtl:rotate-180" aria-hidden="true" />
          </Button>
        </div>

        {/* A grid follows the page's direction, so Hebrew reads January at the right. */}
        <div role="group" aria-label={String(year)} className="grid grid-cols-4 gap-1.5">
          {monthGrid(year, today).map((cell) => {
            const selected = cell.month === month;
            return (
              <button
                key={cell.month}
                type="button"
                aria-pressed={selected}
                disabled={cell.state === 'beyond'}
                title={cell.state === 'beyond' ? t('month.beyond') : undefined}
                onClick={() => {
                  pick(cell.month);
                }}
                className={cn(
                  'min-h-11 rounded-xl text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  'disabled:pointer-events-none disabled:opacity-40',
                  selected
                    ? 'bg-primary text-primary-foreground'
                    : cn(
                        'hover:bg-accent',
                        cell.state === 'forecast' ? 'text-muted-foreground' : 'text-foreground',
                        cell.isThisMonth ? 'ring-1 ring-primary' : null,
                      ),
                )}
              >
                {formatLocalDate(cell.month, i18n.language, { month: 'short' })}
              </button>
            );
          })}
        </div>

        <Button
          type="button"
          variant="ghost"
          className="min-h-11 w-full text-primary sm:min-h-9"
          disabled={month === thisMonth}
          onClick={() => {
            pick(thisMonth);
          }}
        >
          {t('month.thisMonth')}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
```

Add the five `month.*` keys from the copy table to both locale files.

In `src/features/feed/feed-screen.tsx`, the `MonthCursor` becomes `<MonthCursor month={filters.month} today={today} onStep={stepMonth} onPick={setMonth} tone="panel" />`. In `src/features/chart/chart-screen.tsx`, destructure `setMonth` from `useFeedFilters()` and pass `onPick={setMonth}`.

If the English short month for May renders as "May" with no abbreviation, the tests above are unaffected; they name Jan, Mar, Sep, Oct and Dec only.

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm exec vitest run --project unit src/domain/feed-filters.test.ts` and `pnpm exec vitest run --project dom src/features/summary src/features/feed src/features/chart`
Expected: PASS.

- [ ] **Step 6: Look at it in Hebrew.** Run `pnpm dev` and open the month pop-out at 390×844 in Playwright's Chromium with Hebrew. Check that ינו׳ is at the top right, the arrow points at the label, and the year chevrons point outward.

- [ ] **Step 7: Gate.** Run `pnpm verify`. Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/domain/feed-filters.ts src/domain/feed-filters.test.ts src/features/summary/month-cursor.tsx src/features/summary/summary.test.tsx src/features/feed/feed-screen.tsx src/features/chart/chart-screen.tsx src/i18n/locales
git commit -m "The month opens a year of months to jump to, stopping where the forecast stops" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The balance and forecast pop-outs, on one shared data hook (5.3)

**Files:**

- Create: `src/domain/breakdown.ts`, `src/domain/breakdown.test.ts` (the pure shapes both views read)
- Create: `src/features/summary/use-breakdowns.ts` (the one hook)
- Create: `src/features/summary/breakdown-popouts.tsx`, `src/features/summary/breakdown-popouts.test.tsx`
- Modify: `src/features/summary/breakdown-sheet.tsx` (reads the shared shapes; the balance lines are one component shared with the pop-out)
- Modify: `src/features/summary/summary-cards.tsx` (`BalanceFigure` and `ForecastLine` open pop-outs), `src/features/summary/collapsed-bar.tsx` (the balance opens the same pop-out)
- Modify: `src/features/feed/feed-screen.tsx`
- Modify: `src/i18n/locales/{en,he}/common.json` (`breakdown.full`, `breakdown.more_*`)
- Test: `src/features/summary/summary.test.tsx` (the Task 4 tests that clicked `onOpenBreakdown`)

**Interfaces:**

- Consumes: `BalanceParts`, `ExpenseGroup` (`src/domain/calculators.ts`); `sum` (`src/lib/money.ts`); `Popover…` with `arrow` (Task 7); `BalanceFigure`, `ForecastLine`, `CollapsedSummaryBar` (Task 4).
- Produces:
  - `type BalanceLine = { readonly key: 'opening' | 'income' | 'expense' | 'cardPending'; readonly minor: Minor }`.
  - `type BalanceBreakdown = { readonly lines: readonly BalanceLine[]; readonly totalMinor: Minor }`.
  - `balanceBreakdown(parts: BalanceParts): BalanceBreakdown`.
  - `type ForecastBreakdown = { readonly groups: readonly ExpenseGroup[]; readonly top: readonly ExpenseGroup[]; readonly moreCount: number; readonly totalMinor: Minor }`.
  - `forecastBreakdown(groups: readonly ExpenseGroup[], topCount?: number): ForecastBreakdown`.
  - `useBreakdowns(balance: BalanceState, groups: readonly ExpenseGroup[]): { readonly balance: BalanceBreakdown | undefined; readonly forecast: ForecastBreakdown }`.
  - `BalancePopover({ breakdown, since, currency, onFullBreakdown, triggerClassName, triggerLabel, children })` and `ForecastPopover({ breakdown, month, currency, onFullBreakdown, triggerClassName, triggerLabel, children })`.
  - `BalanceFigure`'s and `ForecastLine`'s `onOpenBreakdown` is replaced by `breakdown?: BalanceBreakdown | ForecastBreakdown` (their own kind) and `onFullBreakdown?: () => void`. `CollapsedSummaryBar` likewise: `breakdown?: BalanceBreakdown; onFullBreakdown?: () => void`.
  - `BalanceBreakdownSheet({ open, onOpenChange, breakdown: BalanceBreakdown, since, currency })` and `ExpenseBreakdownSheet({ open, onOpenChange, breakdown: ForecastBreakdown, month, currency, categories })`.

Decisions:

- **"The largest four"** means the four expense groups (Every month, Loans, Instalments, Once a year, One-off) with the largest totals. There are at most five, so "and N more" is "and 1 more" at most. The sheet keeps every group in its own order.
- **The pending card line sits above the total** in both views, in the spec's order, and keeps its existing wording ("Bought by card, not yet charged"). The total stays `opening + income − expenses`, as today.

Copy (`common.json`, under `breakdown`):

| key          | en                 | he             |
| ------------ | ------------------ | -------------- |
| `full`       | Full breakdown     | פירוט מלא      |
| `more_one`   | and {{count}} more | ועוד {{count}} |
| `more_two`   | (none)             | ועוד {{count}} |
| `more_other` | and {{count}} more | ועוד {{count}} |

- [ ] **Step 1: Write the failing tests**

Create `src/domain/breakdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { ExpenseGroup } from './calculators';
import { balanceBreakdown, forecastBreakdown } from './breakdown';

const group = (kind: ExpenseGroup['kind'], totalMinor: number): ExpenseGroup => ({
  kind,
  totalMinor,
  occurrences: [],
});

describe('balanceBreakdown', () => {
  it('lists opening, income, expenses, then the pending card line, with the total', () => {
    const view = balanceBreakdown({
      openingMinor: 100_000,
      incomeMinor: 50_000,
      expenseMinor: 30_000,
      cardPendingMinor: 4_500,
    });

    expect(view.lines).toEqual([
      { key: 'opening', minor: 100_000 },
      { key: 'income', minor: 50_000 },
      { key: 'expense', minor: -30_000 },
      { key: 'cardPending', minor: -4_500 },
    ]);
    // Pending card spending is not in the balance yet.
    expect(view.totalMinor).toBe(120_000);
  });

  it('leaves the pending line out when nothing is pending', () => {
    expect(balanceBreakdown({ openingMinor: 0, incomeMinor: 0, expenseMinor: 0 }).lines).toHaveLength(3);
    expect(
      balanceBreakdown({ openingMinor: 0, incomeMinor: 0, expenseMinor: 0, cardPendingMinor: 0 }).lines,
    ).toHaveLength(3);
  });
});

describe('forecastBreakdown', () => {
  it('keeps the four largest groups, counts the rest, and totals them all', () => {
    const groups = [
      group('recurring', 500),
      group('loans', 900),
      group('installments', 100),
      group('yearly', 700),
      group('one_time', 300),
    ];
    const view = forecastBreakdown(groups);

    expect(view.top.map((g) => g.kind)).toEqual(['loans', 'yearly', 'recurring', 'one_time']);
    expect(view.moreCount).toBe(1);
    expect(view.totalMinor).toBe(2_500);
    // The sheet still sees every group, in their own order.
    expect(view.groups).toBe(groups);
  });

  it('has nothing more when there are four or fewer', () => {
    expect(forecastBreakdown([group('recurring', 1)]).moreCount).toBe(0);
    expect(forecastBreakdown([]).totalMinor).toBe(0);
  });
});
```

Create `src/features/summary/breakdown-popouts.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { balanceBreakdown, forecastBreakdown } from '@/domain/breakdown';
import { d } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { BalancePopover, ForecastPopover } from './breakdown-popouts';

beforeAll(async () => {
  await initTestI18n('en');
});

const balance = balanceBreakdown({
  openingMinor: 100_000,
  incomeMinor: 50_000,
  expenseMinor: 30_000,
  cardPendingMinor: 4_500,
});

describe('BalancePopover', () => {
  it('lists the parts in order, ends with the full breakdown, and hands focus back', async () => {
    const user = userEvent.setup();
    const onFull = vi.fn();
    renderWithProviders(
      <BalancePopover
        breakdown={balance}
        since={d('2026-03-01')}
        currency="ILS"
        onFullBreakdown={onFull}
        triggerClassName=""
        triggerLabel="Show what makes up Balance"
      >
        ₪1,200
      </BalancePopover>,
    );
    const trigger = screen.getByRole('button', { name: 'Show what makes up Balance' });

    await user.click(trigger);
    const pop = await screen.findByTestId('balance-popout');
    const terms = within(pop)
      .getAllByRole('term')
      .map((t) => t.textContent);
    expect(terms).toEqual([
      'Starting balance',
      'Income',
      'Expenses',
      'Bought by card, not yet charged',
      'Balance',
    ]);
    expect(pop.querySelector('[data-slot="popup-arrow"]')).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: /Full breakdown/ }));
    expect(onFull).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('balance-popout')).not.toBeInTheDocument();
  });
});

describe('ForecastPopover', () => {
  it('shows the four largest groups, "and 1 more", and the total', async () => {
    const user = userEvent.setup();
    const forecast = forecastBreakdown([
      { kind: 'recurring', totalMinor: 500, occurrences: [] },
      { kind: 'loans', totalMinor: 900, occurrences: [] },
      { kind: 'installments', totalMinor: 100, occurrences: [] },
      { kind: 'yearly', totalMinor: 700, occurrences: [] },
      { kind: 'one_time', totalMinor: 300, occurrences: [] },
    ]);
    renderWithProviders(
      <ForecastPopover
        breakdown={forecast}
        month={d('2026-09-01')}
        currency="ILS"
        onFullBreakdown={vi.fn()}
        triggerClassName=""
        triggerLabel="Show what makes up Expected this month"
      >
        ₪25
      </ForecastPopover>,
    );

    await user.click(screen.getByRole('button', { name: /Expected this month/ }));
    const pop = await screen.findByTestId('forecast-popout');
    const terms = within(pop)
      .getAllByRole('term')
      .map((t) => t.textContent);

    expect(terms).toEqual(['Loans', 'Once a year', 'Every month', 'One-off', 'Expected this month']);
    expect(pop).toHaveTextContent('and 1 more');
  });
});
```

In `src/features/summary/summary.test.tsx`, replace the Task 4 test `'sets the forecast in the serif at 1rem, and opens its breakdown'` with:

```tsx
it('sets the forecast in the serif at 1rem, and opens its pop-out', async () => {
  renderWithProviders(
    <ForecastLine
      expense={{ total: 381_652, spentSoFar: 361_700, remaining: 19_952 }}
      currency="ILS"
      month={d('2026-09-01')}
      today={TODAY}
      breakdown={forecastBreakdown([])}
      onFullBreakdown={vi.fn()}
    />,
  );
  const button = screen.getByRole('button', { name: /Expected this month/ });

  expect(button.querySelector('.font-display')).toHaveClass('text-base');
  await userEvent.setup().click(button);
  expect(await screen.findByTestId('forecast-popout')).toBeInTheDocument();
});
```

In the `CollapsedSummaryBar` test `'offers the chevron only when there is a breakdown to open'`, replace `onOpenBreakdown={vi.fn()}` with `breakdown={balanceBreakdown({ openingMinor: 0, incomeMinor: 0, expenseMinor: 0 })} onFullBreakdown={vi.fn()}`. Then add:

```tsx
it('opens the balance pop-out from the collapsed bar too', async () => {
  renderWithProviders(
    <CollapsedSummaryBar
      state={ready(5_325_874)}
      currency="ILS"
      breakdown={balanceBreakdown({ openingMinor: 0, incomeMinor: 5_325_874, expenseMinor: 0 })}
      onFullBreakdown={vi.fn()}
    />,
  );
  await userEvent.setup().click(screen.getByRole('button'));
  expect(await screen.findByTestId('balance-popout')).toBeInTheDocument();
});
```

Import `balanceBreakdown` and `forecastBreakdown` from `@/domain/breakdown`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm exec vitest run --project unit src/domain/breakdown.test.ts` and `pnpm exec vitest run --project dom src/features/summary`
Expected: FAIL. The modules and the props do not exist.

- [ ] **Step 3: The shared shapes and the hook**

Create `src/domain/breakdown.ts`:

```ts
import { sum } from '@/lib/money';
import type { Minor } from '@/types/money';

import type { BalanceParts, ExpenseGroup } from './calculators';

/**
 * What the balance and the forecast are made of, worked out ONCE for both the
 * small pop-out under each figure and the full sheet behind it.
 */

export type BalanceLine = {
  readonly key: 'opening' | 'income' | 'expense' | 'cardPending';
  readonly minor: Minor;
};
export type BalanceBreakdown = { readonly lines: readonly BalanceLine[]; readonly totalMinor: Minor };

export function balanceBreakdown(parts: BalanceParts): BalanceBreakdown {
  const lines: BalanceLine[] = [
    { key: 'opening', minor: parts.openingMinor },
    { key: 'income', minor: parts.incomeMinor },
    { key: 'expense', minor: -parts.expenseMinor },
  ];
  // Bought, and not yet taken: said, so the balance is not read as having missed it.
  if (parts.cardPendingMinor !== undefined && parts.cardPendingMinor !== 0) {
    lines.push({ key: 'cardPending', minor: -parts.cardPendingMinor });
  }
  return { lines, totalMinor: parts.openingMinor + parts.incomeMinor - parts.expenseMinor };
}

export type ForecastBreakdown = {
  /** Every group, in the order the sheet lists them. */
  readonly groups: readonly ExpenseGroup[];
  /** The largest few, for the pop-out. */
  readonly top: readonly ExpenseGroup[];
  readonly moreCount: number;
  readonly totalMinor: Minor;
};

export function forecastBreakdown(groups: readonly ExpenseGroup[], topCount = 4): ForecastBreakdown {
  const largest = [...groups].sort((a, b) => b.totalMinor - a.totalMinor);
  return {
    groups,
    top: largest.slice(0, topCount),
    moreCount: Math.max(0, largest.length - topCount),
    totalMinor: sum(groups.map((g) => g.totalMinor)),
  };
}
```

Create `src/features/summary/use-breakdowns.ts`:

```ts
import { useMemo } from 'react';

import {
  balanceBreakdown,
  forecastBreakdown,
  type BalanceBreakdown,
  type ForecastBreakdown,
} from '@/domain/breakdown';
import type { ExpenseGroup } from '@/domain/calculators';

import type { BalanceState } from './use-balance';

/**
 * The one place the breakdowns are worked out. The feed passes the result to
 * the pop-outs under the figures AND to the full sheets, so nothing is
 * computed twice and the two views can never disagree.
 */
export function useBreakdowns(
  balance: BalanceState,
  groups: readonly ExpenseGroup[],
): { readonly balance: BalanceBreakdown | undefined; readonly forecast: ForecastBreakdown } {
  const parts = balance.status === 'ready' ? balance.parts : undefined;
  const balanceView = useMemo(() => (parts === undefined ? undefined : balanceBreakdown(parts)), [parts]);
  const forecast = useMemo(() => forecastBreakdown(groups), [groups]);
  return { balance: balanceView, forecast };
}
```

- [ ] **Step 4: The pop-outs, and the sheets reading the same shapes**

Create `src/features/summary/breakdown-popouts.tsx`:

```tsx
import { ChevronRight } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import type { BalanceBreakdown, ForecastBreakdown } from '@/domain/breakdown';
import { formatLocalDate } from '@/lib/dates';
import type { Currency, LocalDate } from '@/types/money';

import { BalanceLines, GROUP_LABELS } from './breakdown-sheet';

type TriggerProps = {
  readonly onFullBreakdown: () => void;
  readonly triggerClassName: string;
  readonly triggerLabel: string;
  readonly children: ReactNode;
};

/** The balance's parts, in a pop-out under the figure. "Full breakdown" opens the sheet. */
export function BalancePopover({
  breakdown,
  since,
  currency,
  onFullBreakdown,
  triggerClassName,
  triggerLabel,
  children,
}: TriggerProps & {
  readonly breakdown: BalanceBreakdown;
  readonly since: LocalDate;
  readonly currency: Currency;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClassName} aria-label={triggerLabel}>
        {children}
      </PopoverTrigger>
      <PopoverContent arrow align="start" className="w-72" data-testid="balance-popout">
        <PopoverTitle>{t('summary.balance')}</PopoverTitle>
        <p className="text-xs text-muted-foreground">
          {t('breakdown.balanceBody', { date: formatLocalDate(since, i18n.language, { dateStyle: 'long' }) })}
        </p>
        <BalanceLines breakdown={breakdown} currency={currency} />
        <FullBreakdown
          onClick={() => {
            setOpen(false);
            onFullBreakdown();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** The forecast by kind: the largest four, how many more, and the total. */
export function ForecastPopover({
  breakdown,
  month,
  currency,
  onFullBreakdown,
  triggerClassName,
  triggerLabel,
  children,
}: TriggerProps & {
  readonly breakdown: ForecastBreakdown;
  readonly month: LocalDate;
  readonly currency: Currency;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClassName} aria-label={triggerLabel}>
        {children}
      </PopoverTrigger>
      <PopoverContent arrow align="start" className="w-72" data-testid="forecast-popout">
        <PopoverTitle>{t('summary.expected')}</PopoverTitle>
        <p className="text-xs text-muted-foreground">
          {t('breakdown.expenseBody', {
            month: formatLocalDate(month, i18n.language, { month: 'long', year: 'numeric' }),
          })}
        </p>
        <dl>
          {breakdown.top.map((group) => (
            <div key={group.kind} className="flex items-baseline justify-between gap-4 py-1.5">
              <dt className="text-sm text-muted-foreground">{t(GROUP_LABELS[group.kind])}</dt>
              <dd className="text-sm font-medium">
                <Money minor={group.totalMinor} currency={currency} />
              </dd>
            </div>
          ))}
        </dl>
        {/* Outside the list: a <dl> may hold only its groups. */}
        {breakdown.moreCount === 0 ? null : (
          <p className="text-xs text-muted-foreground">
            {t('breakdown.more', { count: breakdown.moreCount })}
          </p>
        )}
        <dl>
          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
            <dt className="text-sm font-medium">{t('summary.expected')}</dt>
            <dd className="text-base font-semibold">
              <Money minor={breakdown.totalMinor} currency={currency} />
            </dd>
          </div>
        </dl>
        <FullBreakdown
          onClick={() => {
            setOpen(false);
            onFullBreakdown();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function FullBreakdown({ onClick }: { readonly onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="ghost"
      className="min-h-11 w-full justify-between text-primary sm:min-h-9"
      onClick={onClick}
    >
      {t('breakdown.full')}
      {/* Directional: it points into the sheet, so it flips in Hebrew. */}
      <ChevronRight className="cn-rtl-flip size-4 rtl:rotate-180" aria-hidden="true" />
    </Button>
  );
}
```

In `src/features/summary/breakdown-sheet.tsx`:

- Export `GROUP_LABELS` (add `export` to its declaration).
- Add and export the balance lines, used by both views:

```tsx
const BALANCE_LABELS = {
  opening: 'breakdown.opening',
  income: 'breakdown.income',
  expense: 'breakdown.expense',
  cardPending: 'breakdown.cardPending',
} as const;

/** The balance's parts and its total: the same list in the pop-out and the sheet. */
export function BalanceLines({
  breakdown,
  currency,
}: {
  readonly breakdown: BalanceBreakdown;
  readonly currency: Currency;
}) {
  const { t } = useTranslation();
  return (
    <dl>
      {breakdown.lines.map((line) => (
        <div
          key={line.key}
          className={
            line.key === 'cardPending'
              ? 'my-1 flex items-baseline justify-between gap-4 rounded-lg bg-muted px-3 py-2'
              : 'flex items-baseline justify-between gap-4 py-1.5'
          }
        >
          <dt
            className={
              line.key === 'cardPending' ? 'text-xs text-muted-foreground' : 'text-sm text-muted-foreground'
            }
          >
            {t(BALANCE_LABELS[line.key])}
          </dt>
          <dd className="text-sm font-medium">
            {/* The opening balance is the usual answer to "that is not how much
                money I have": typed once, months ago, and forgotten. */}
            <Money minor={line.minor} currency={currency} signMode="always" />
          </dd>
        </div>
      ))}
      <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-2">
        <dt className="text-sm font-medium">{t('breakdown.total')}</dt>
        <dd className="text-base font-semibold">
          <Money minor={breakdown.totalMinor} currency={currency} />
        </dd>
      </div>
    </dl>
  );
}
```

- `BalanceBreakdownSheet`'s `parts: BalanceParts` prop becomes `breakdown: BalanceBreakdown`. Delete its `rows` and `total` constants, and replace its `<dl …>…</dl>` with `<div className="px-4 pb-4"><BalanceLines breakdown={breakdown} currency={currency} /></div>`.
- `ExpenseBreakdownSheet`'s `groups` prop becomes `breakdown: ForecastBreakdown`, and its body maps `breakdown.groups` where it mapped `groups`.
- Imports: `BalanceBreakdown` and `ForecastBreakdown` from `@/domain/breakdown`. Drop `BalanceParts` and `ExpenseGroup` if they are unused.

- [ ] **Step 5: The figures open the pop-outs**

In `src/features/summary/summary-cards.tsx`:

- Export the figure button's classes, so both figures and their pop-out triggers share them:

```tsx
export const PANEL_FIGURE =
  '-mx-2 block min-h-11 rounded-xl px-2 py-1 text-start transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none';
```

`PanelFigureButton` is deleted.

- `BalanceFigure`'s props become `{ state; currency; breakdown?: BalanceBreakdown; onFullBreakdown?: () => void }`. Its ready branch wraps the same two spans:

```tsx
const figure = (
  <>
    <span className="block text-sm text-brand-deep-foreground/80">
      {title} · {since}
    </span>
    <span
      className="mt-1 block font-display text-[2.75rem] leading-none font-bold tracking-tight max-[359px]:text-[2.25rem]"
      data-testid="balance-amount"
    >
      <Money minor={animated} currency={currency} announce={false} />
    </span>
  </>
);

return (
  <>
    {breakdown === undefined || onFullBreakdown === undefined ? (
      <div>{figure}</div>
    ) : (
      <BalancePopover
        breakdown={breakdown}
        since={state.since}
        currency={currency}
        onFullBreakdown={onFullBreakdown}
        triggerClassName={PANEL_FIGURE}
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
```

- `ForecastLine`'s props become `{ expense; currency; month; today; breakdown?: ForecastBreakdown; onFullBreakdown?: () => void }`, with the same pattern: its two spans as `line`, wrapped in `ForecastPopover` with `month={month}` when both props are given, and in a `div` otherwise.

In `src/features/summary/collapsed-bar.tsx`:

- The props become `{ state; currency; breakdown?: BalanceBreakdown; onFullBreakdown?: () => void }`.
- Compute `const opens = state.status === 'ready' && breakdown !== undefined && onFullBreakdown !== undefined;`.
- Keep the outer `div` unchanged. Put the existing `<button>`'s content in `const row = (<>…label span… …figure span…</>)`. Render it as:

```tsx
{
  opens && state.status === 'ready' ? (
    <BalancePopover
      breakdown={breakdown}
      since={state.since}
      currency={currency}
      onFullBreakdown={onFullBreakdown}
      triggerClassName={ROW}
      triggerLabel={t('summary.breakdownOf', { title: t('summary.balance') })}
    >
      {row}
    </BalancePopover>
  ) : (
    <button type="button" disabled className={ROW}>
      {row}
    </button>
  );
}
```

Here `ROW` is the existing button's `cn(…)` class list, moved into a constant. The chevron condition becomes `opens ? <ChevronRight … /> : null`. TypeScript needs `breakdown` and `onFullBreakdown` non-undefined inside the branch; write the condition as `opens && state.status === 'ready' && breakdown !== undefined && onFullBreakdown !== undefined`.

In `src/features/feed/feed-screen.tsx`:

- Add `import { useBreakdowns } from '../summary/use-breakdowns';`, and after `expenseGroups`: `const breakdowns = useBreakdowns(balance, expenseGroups);`.
- `CollapsedSummaryBar` gets `breakdown={breakdowns.balance} onFullBreakdown={() => { setBreakdown('balance'); }}` in place of `onOpenBreakdown`.
- `BalanceFigure` gets `breakdown={breakdowns.balance} onFullBreakdown={() => { setBreakdown('balance'); }}`.
- `ForecastLine` gets `breakdown={breakdowns.forecast} onFullBreakdown={() => { setBreakdown('expense'); }}`.
- The balance sheet renders when `breakdowns.balance !== undefined && balance.status === 'ready'`, with `breakdown={breakdowns.balance}` in place of `parts={balance.parts}`.
- The expense sheet gets `breakdown={breakdowns.forecast}` in place of `groups={expenseGroups}`.

Add the `breakdown.full` and `breakdown.more_*` keys from the copy table to both locale files.

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm exec vitest run --project unit src/domain/breakdown.test.ts` and `pnpm exec vitest run --project dom src/features/summary src/features/feed`
Expected: PASS.

Run: `pnpm exec playwright test e2e/08-polish.spec.ts e2e/14-cards.spec.ts`
Expected: PASS. If a test opened the balance sheet by clicking the figure, it now needs the pop-out's "Full breakdown" first. Add that click; do not remove the assertion.

- [ ] **Step 7: Gate.** Run `pnpm verify`. Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/domain/breakdown.ts src/domain/breakdown.test.ts src/features/summary src/features/feed/feed-screen.tsx src/i18n/locales
git commit -m "Tapping the balance or the forecast shows what it is made of right under it, from the same numbers as the full sheet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The category pop-out and its series question (5.4)

**Files:**

- Modify: `src/db/occurrence-actions.ts` (`applyUndoablePlan`, `editOccurrence`, `changeCategory`)
- Test: `src/db/occurrence-actions.test.ts`
- Create: `src/domain/category-usage.ts`, `src/domain/category-usage.test.ts` (`frequentCategories`)
- Create: `src/features/feed/use-frequent-categories.ts` (the last 90 days, from the database)
- Modify: `src/features/transaction/picker-field.tsx` (export the searchable list as `PickerList`, so "More" opens the same picker)
- Create: `src/features/feed/category-popout.tsx`, `src/features/feed/category-popout.test.tsx`
- Modify: `src/features/feed/feed-rows.tsx` (the chip becomes a button beside the row's main button), `src/features/feed/virtual-feed.tsx` (`onCategory`)
- Modify: `src/features/feed/use-row-actions.ts` (`offerUndo` moves to module level; `useUndoableWrite`)
- Modify: `src/features/feed/feed-screen.tsx` (one category pop-out at screen level)
- Modify: `src/i18n/locales/{en,he}/common.json` (`categoryPop.*`)

**Interfaces:**

- Consumes:
  - `planSeriesEdit`, `EditScope` and `TransactionPatch` (`src/domain/series-edit.ts`);
  - `applySeriesEdit` (`src/db/series-edit.ts`);
  - `UndoableAction` (`src/db/occurrence-actions.ts`);
  - `CategoryChip` (Task 5);
  - `PopoverContent` with `anchor`, `arrow` and `finalFocus`, and `useCloseWhenDetached` (Task 7);
  - `categoriesFor` (`src/domain/tx-options.ts`);
  - `isCardFee` (`src/domain/cards.ts`);
  - `findCandidates` and `findOverrides` (`src/db/repos/transactions.ts`);
  - `expandOccurrences`.
- Produces (Task 11 uses the first three):
  - `applyUndoablePlan(db: BookandryDB, plan: SeriesEditPlan): Promise<UndoableAction>`: it applies a plan in one transaction, and its undo puts back every transaction and override the plan touched, exactly as they were, with `updatedAt` set to the undo instant.
  - `editOccurrence(db: BookandryDB, input: { occurrence: Occurrence; scope: EditScope; patch: TransactionPatch; today: LocalDate; now: IsoInstant; newId: () => string }): Promise<UndoableAction>`: the edit form's path (`planSeriesEdit`, then apply), made undoable. It throws when the plan is refused or the transaction is gone.
  - `useUndoableWrite(): (write: () => Promise<UndoableAction>, message: string) => Promise<void>` (`use-row-actions.ts`): it runs the write, then shows the undo toast, or `tx.toastFailed` if the write throws.
  - `changeCategory(db, input: { occurrence; categoryId: string; scope: 'one' | 'future'; today; now; newId }): Promise<UndoableAction>`.
  - `frequentCategories(occurrences: readonly Occurrence[], categories: readonly Category[], kind: Kind, currentId: string, count?: number): readonly Category[]`.
  - `useFrequentCategories(kind: Kind, currentId: string, categories: readonly Category[], today: LocalDate): readonly Category[] | undefined`.
  - `PickerList({ options, value, onSelect, searchPlaceholder, emptyText })`.
  - `CategoryTarget = { readonly occurrence: Occurrence; readonly anchor: HTMLElement }`.
  - `CategoryPopout({ target, categories, today, onClose, onChange })`, where `onChange: (occurrence: Occurrence, categoryId: string, scope: 'one' | 'future') => void`.
  - `TransactionRow` and `VirtualFeed` gain `onCategory?: (occurrence: Occurrence, anchor: HTMLElement) => void`.

Decisions:

- **The current category is always in the grid.** When it is not among the seven used most, it takes the seventh place. Ties and unused categories fall back to the category list's own order (`categoriesFor`), so a new household still sees seven sensible choices.
- **Usage counts the whole household** (every profile), over occurrences dated in the last 90 days up to today, of the row's kind.
- **Choosing the category the row already has** does nothing and leaves the pop-out open.
- **Locked or offline.** A locked device shows the front door, not the feed (`src/app/account-gate.tsx`). The app is local-first, so the ⋯ actions are never disabled offline. The pop-outs follow exactly the same rule, so they need no extra disabled state: they are enabled whenever the row's ⋯ is.
- **"More" is the same picker**: the searchable list from `PickerField`, shown in place inside the pop-out.

Copy (`common.json`, new `categoryPop` section):

| key             | en                            | he                        |
| --------------- | ----------------------------- | ------------------------- |
| `title`         | Category                      | קטגוריה                   |
| `chip`          | Category: {{name}}. Change it | קטגוריה: {{name}}. לשינוי |
| `more`          | More                          | עוד                       |
| `scopeQuestion` | Change it to {{name}} for…    | לשנות ל{{name}}…          |
| `scopeOne`      | Only this time                | רק הפעם                   |
| `scopeFuture`   | From now on                   | מעכשיו והלאה              |
| `changed`       | Category changed to {{name}}  | הקטגוריה שונתה ל{{name}}  |

- [ ] **Step 1: Write the failing DB tests**

Add to `src/db/occurrence-actions.test.ts` (import `changeCategory`, `editOccurrence` from `./occurrence-actions`; `applySeriesEdit` from `./series-edit`; `planSeriesEdit` from `@/domain/series-edit`; `modify` from `@/domain/test-factories`):

```ts
describe('changing a category', () => {
  const snapshot = async (db: TestDb['db']) => ({
    transactions: (await db.transactions.toArray()).map(({ updatedAt: _u, ...rest }) => rest),
    overrides: (await db.overrides.toArray()).map(({ updatedAt: _u, ...rest }) => rest),
  });

  it('only this time: writes a modify override, and undo removes it', async () => {
    const target = await seed();
    const before = await snapshot(handle.db);

    const undoable = await changeCategory(handle.db, {
      occurrence: target,
      categoryId: 'cat.food',
      scope: 'one',
      today: TODAY,
      now: NOW,
      newId: ids(),
    });
    const [override] = await handle.db.overrides.toArray();
    expect(override).toMatchObject({
      action: 'modify',
      occurrenceDate: '2026-09-10',
      patch: { categoryId: 'cat.food' },
    });

    await undoable.undo(LATER);
    expect(await snapshot(handle.db)).toEqual(before);
  });

  it('keeps an earlier per-occurrence edit, and undo restores THAT override, not a bare slot', async () => {
    const tx = rent();
    await handle.db.transactions.add(tx);
    const earlier = modify('rent', d('2026-09-10'), { money: { ...MONEY, amountMinor: 999 } });
    await handle.db.overrides.add(earlier);
    const target = occurrence(tx, '2026-09-10', [earlier]);
    const before = await snapshot(handle.db);

    const undoable = await changeCategory(handle.db, {
      occurrence: target,
      categoryId: 'cat.food',
      scope: 'one',
      today: TODAY,
      now: NOW,
      newId: ids(),
    });
    expect(await handle.db.overrides.get(earlier.id)).toMatchObject({
      patch: { categoryId: 'cat.food', money: { amountMinor: 999 } },
    });

    await undoable.undo(LATER);
    expect(await snapshot(handle.db)).toEqual(before);
    expect((await handle.db.overrides.get(earlier.id))?.updatedAt).toBe(LATER);
  });

  it('from now on: splits the series exactly as the edit form does, and undo puts it back whole', async () => {
    const target = await seed();
    const before = await snapshot(handle.db);

    // The edit form's own path, on a second database, with the same ids.
    const other = freshDb();
    await other.db.transactions.add(rent());
    const planned = planSeriesEdit({
      transaction: rent(),
      overrides: [],
      scope: 'future',
      at: target.originalDate,
      patch: { categoryId: 'cat.food' },
      today: TODAY,
      now: NOW,
      newId: ids(),
    });
    if (!planned.ok) throw new Error('refused');
    await applySeriesEdit(other.db, planned.plan);

    const undoable = await changeCategory(handle.db, {
      occurrence: target,
      categoryId: 'cat.food',
      scope: 'future',
      today: TODAY,
      now: NOW,
      newId: ids(),
    });
    expect(await snapshot(handle.db)).toEqual(await snapshot(other.db));
    expect(await handle.db.transactions.count()).toBe(2);
    await other.dispose();

    await undoable.undo(LATER);
    expect(await snapshot(handle.db)).toEqual(before);
  });

  it('from now on, at the first occurrence, is the whole series, and undo restores it', async () => {
    const tx = rent();
    await handle.db.transactions.add(tx);
    const first = occurrence(tx, '2026-03-10');
    const before = await snapshot(handle.db);

    const undoable = await changeCategory(handle.db, {
      occurrence: first,
      categoryId: 'cat.food',
      scope: 'future',
      today: TODAY,
      now: NOW,
      newId: ids(),
    });
    // No zero-occurrence original: the series itself changed.
    expect(await handle.db.transactions.count()).toBe(1);
    expect((await handle.db.transactions.get('rent'))?.categoryId).toBe('cat.food');

    await undoable.undo(LATER);
    expect(await snapshot(handle.db)).toEqual(before);
  });

  it('refuses a transaction deleted meanwhile, changing nothing', async () => {
    const target = await seed();
    await handle.db.transactions.update('rent', { isDeleted: 1 });

    await expect(
      editOccurrence(handle.db, {
        occurrence: target,
        scope: 'one',
        patch: { categoryId: 'x' },
        today: TODAY,
        now: NOW,
        newId: ids(),
      }),
    ).rejects.toThrow();
    expect(await handle.db.overrides.count()).toBe(0);
  });
});
```

`ids`, `seed`, `rent`, `occurrence`, `TODAY`, `NOW` and `LATER` are the file's existing helpers. Import `freshDb` from `@/test/db-harness`; the file already imports `TestDb`.

- [ ] **Step 2: Write the failing unit and DOM tests**

Create `src/domain/category-usage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Category, Occurrence } from '@/types/domain';

import { frequentCategories } from './category-usage';

const cat = (id: string, sortOrder: number, kind: 'expense' | 'income' = 'expense'): Category =>
  ({ id, kind, icon: 'Circle', sortOrder, isArchived: 0 }) as Category;
const used = (categoryId: string, kind: 'expense' | 'income' = 'expense'): Occurrence =>
  ({ categoryId, transaction: { kind } }) as unknown as Occurrence;

const CATS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id, i) => cat(id, i));

describe('frequentCategories', () => {
  it('orders by use, then by the list order, seven of them', () => {
    const occ = [used('h'), used('h'), used('h'), used('c'), used('c'), used('x', 'income')];

    expect(frequentCategories(occ, CATS, 'expense', 'h').map((c) => c.id)).toEqual([
      'h',
      'c',
      'a',
      'b',
      'd',
      'e',
      'f',
    ]);
  });

  it('always shows the current one, in the seventh place when it is not among them', () => {
    expect(frequentCategories([], CATS, 'expense', 'i').map((c) => c.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'i',
    ]);
  });

  it('counts only the row kind', () => {
    expect(
      frequentCategories([used('z', 'income')], [...CATS, cat('z', 99, 'income')], 'expense', 'a'),
    ).not.toContainEqual(expect.objectContaining({ id: 'z' }));
  });
});
```

Create `src/features/feed/category-popout.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { expandOccurrences } from '@/domain/occurrences';
import { d, makeTx, MONEY } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Category, Occurrence, Recurrence } from '@/types/domain';

import { CategoryPopout } from './category-popout';

vi.mock('./use-frequent-categories', () => ({
  useFrequentCategories: (_kind: string, _current: string, categories: readonly Category[]) =>
    categories.filter((c) => c.kind === 'expense').slice(0, 7),
}));

const TODAY = d('2026-09-15');
const cat = (id: string, sortOrder: number): Category =>
  ({
    id,
    kind: 'expense',
    icon: 'Circle',
    sortOrder,
    isArchived: 0,
    source: 'custom',
    name: id,
  }) as unknown as Category;
const CATEGORIES = new Map(
  ['rent', 'food', 'fuel', 'gym', 'kids', 'pets', 'fun', 'misc'].map((id, i) => [id, cat(id, i)]),
);

function occurrence(recurrence: Recurrence): Occurrence {
  const tx = makeTx({ id: 'rent', date: d('2026-09-10'), recurrence, money: MONEY });
  const found = expandOccurrences({ ...tx, categoryId: 'rent' }, [], d('2026-09-01'), d('2026-09-30'), {
    today: TODAY,
  })[0];
  if (found === undefined) throw new Error('no occurrence');
  return found;
}

function renderPopout(target: Occurrence) {
  const anchor = document.createElement('button');
  anchor.textContent = 'chip';
  document.body.append(anchor);
  const onChange = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <CategoryPopout
      target={{ occurrence: target, anchor }}
      categories={CATEGORIES}
      today={TODAY}
      onClose={onClose}
      onChange={onChange}
    />,
  );
  return { onChange, onClose, anchor };
}

beforeAll(async () => {
  await initTestI18n('en');
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('CategoryPopout', () => {
  it('shows seven categories and More in a 4×2 grid, the current one filled sapphire', async () => {
    renderPopout(occurrence({ type: 'one_time' }));
    const grid = await screen.findByRole('group', { name: 'Category' });
    const cells = within(grid).getAllByRole('button');

    expect(cells).toHaveLength(8);
    expect(grid).toHaveClass('grid-cols-4');
    expect(cells.at(-1)).toHaveTextContent('More');
    expect(within(grid).getByRole('button', { name: /rent/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(grid).getByRole('button', { name: /rent/ })).toHaveClass('bg-primary');
    for (const cell of cells) expect(cell).toHaveClass('min-h-16');
  });

  it('changes a one-time row at once', async () => {
    const user = userEvent.setup();
    const target = occurrence({ type: 'one_time' });
    const { onChange } = renderPopout(target);

    await user.click(await screen.findByRole('button', { name: /food/ }));
    expect(onChange).toHaveBeenCalledWith(target, 'food', 'one');
  });

  it('asks a series "only this time" or "from now on", in place', async () => {
    const user = userEvent.setup();
    const target = occurrence({ type: 'monthly', dayOfMonth: 10 });
    const { onChange } = renderPopout(target);

    await user.click(await screen.findByRole('button', { name: /food/ }));
    expect(onChange).not.toHaveBeenCalled();
    const once = screen.getByRole('button', { name: 'Only this time' });
    expect(once).toHaveFocus();
    expect(screen.getByRole('button', { name: 'From now on' })).toHaveClass('min-h-11');

    await user.click(screen.getByRole('button', { name: 'From now on' }));
    expect(onChange).toHaveBeenCalledWith(target, 'food', 'future');
  });

  it('opens the full picker from More', async () => {
    const user = userEvent.setup();
    renderPopout(occurrence({ type: 'one_time' }));

    await user.click(await screen.findByRole('button', { name: 'More' }));
    expect(await screen.findByRole('option', { name: /misc/ })).toBeInTheDocument();
  });

  it('gives focus back to the chip on Escape', async () => {
    const user = userEvent.setup();
    const { anchor, onClose } = renderPopout(occurrence({ type: 'one_time' }));
    await screen.findByRole('group', { name: 'Category' });

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    expect(anchor).toHaveFocus();
  });
});
```

If `categoryDisplayName` renders a custom category from a field other than `name`, set that field in `cat()` so the names read `rent`, `food` and so on. Copy the shape of the `category()` factory in `feed-rows.test.tsx`, with `source: 'custom'`.

Add to `src/features/feed/feed-rows.test.tsx`:

```tsx
it('makes the chip a button that reports itself, except on card-fee and skipped rows', async () => {
  await initTestI18n('en');
  const onCategory = vi.fn();
  const { rerender } = renderWithProviders(
    <TransactionRow
      occurrence={occurrence()}
      context={context()}
      position={1}
      setSize={1}
      onCategory={onCategory}
    />,
  );
  const chip = screen.getByRole('button', { name: /Category: .*Change it/ });

  expect(chip).toHaveClass('size-11');
  await userEvent.setup().click(chip);
  expect(onCategory).toHaveBeenCalledWith(expect.objectContaining({ key: 't1@2026-09-10' }), chip);

  rerender(
    <TransactionRow
      occurrence={occurrence({ isSkipped: true })}
      context={context()}
      position={1}
      setSize={1}
      onCategory={onCategory}
    />,
  );
  expect(screen.queryByRole('button', { name: /Category: / })).not.toBeInTheDocument();
});
```

Import `userEvent` and `vi` there.

- [ ] **Step 3: Run the tests to see them fail**

Run:

- `pnpm exec vitest run --project db src/db/occurrence-actions.test.ts`
- `pnpm exec vitest run --project unit src/domain/category-usage.test.ts`
- `pnpm exec vitest run --project dom src/features/feed`

Expected: FAIL, because none of the new functions or components exist.

- [ ] **Step 4: The undoable edit**

Add to `src/db/occurrence-actions.ts` (imports: `applySeriesEdit` from `./series-edit`; `planSeriesEdit`, `type EditScope`, `type SeriesEditPlan`, `type TransactionPatch` from `@/domain/series-edit`; `Transaction` from `@/types/domain`; `LocalDate` from `@/types/money`):

```ts
/**
 * Apply a series-edit plan and keep what it overwrote, so Undo puts back
 * every row it touched exactly as it was.
 *
 * A row that did not exist before (a split's continuation, a new override)
 * is deleted on undo; every other row is written back whole, stamped with
 * the undo instant so it wins a later merge. Both halves are one transaction.
 */
export async function applyUndoablePlan(db: BookandryDB, plan: SeriesEditPlan): Promise<UndoableAction> {
  const transactionIds = plan.transactions.map((t) => t.id);
  const overrideIds = [...new Set([...plan.overrides.map((o) => o.id), ...plan.deleteOverrideIds])];
  let transactionsBefore: readonly (Transaction | undefined)[] = [];
  let overridesBefore: readonly (Override | undefined)[] = [];

  await db.transaction('rw', [db.transactions, db.overrides], async () => {
    transactionsBefore = await db.transactions.bulkGet(transactionIds);
    overridesBefore = await db.overrides.bulkGet(overrideIds);
    await applySeriesEdit(db, plan);
  });

  return {
    undo: async (undoneAt: IsoInstant) => {
      await db.transaction('rw', [db.transactions, db.overrides], async () => {
        for (const [i, id] of overrideIds.entries()) {
          const before = overridesBefore[i];
          if (before === undefined) await db.overrides.delete(id);
          else await db.overrides.put({ ...before, updatedAt: undoneAt });
        }
        for (const [i, id] of transactionIds.entries()) {
          const before = transactionsBefore[i];
          if (before === undefined) await db.transactions.delete(id);
          else await db.transactions.put({ ...before, updatedAt: undoneAt });
        }
      });
    },
  };
}

/**
 * One edit of one occurrence, through exactly the path the edit form takes
 * (`planSeriesEdit`, then `applySeriesEdit`), so overrides and splits behave
 * as they do there. Throws when the plan is refused or the row is gone.
 */
export async function editOccurrence(
  db: BookandryDB,
  input: {
    readonly occurrence: Occurrence;
    readonly scope: EditScope;
    readonly patch: TransactionPatch;
    readonly today: LocalDate;
    readonly now: IsoInstant;
    readonly newId: () => string;
  },
): Promise<UndoableAction> {
  const transaction = await db.transactions.get(input.occurrence.transaction.id);
  if (transaction === undefined || transaction.isDeleted === 1) throw new Error('gone');
  const overrides = await db.overrides.where('transactionId').equals(transaction.id).toArray();

  const planned = planSeriesEdit({
    transaction,
    overrides,
    scope: input.scope,
    // The ORIGINAL slot, never the moved date: it is the override's key.
    at: input.occurrence.originalDate,
    patch: input.patch,
    today: input.today,
    now: input.now,
    newId: input.newId,
  });
  if (!planned.ok) throw new Error(planned.error.kind);
  return applyUndoablePlan(db, planned.plan);
}

/** The category pop-out's write: "only this time" is scope `one`, "from now on" is `future`. */
export async function changeCategory(
  db: BookandryDB,
  input: {
    readonly occurrence: Occurrence;
    readonly categoryId: string;
    readonly scope: 'one' | 'future';
    readonly today: LocalDate;
    readonly now: IsoInstant;
    readonly newId: () => string;
  },
): Promise<UndoableAction> {
  const { categoryId, ...rest } = input;
  return editOccurrence(db, { ...rest, patch: { categoryId } });
}
```

- [ ] **Step 5: Which categories to offer**

Create `src/domain/category-usage.ts`:

```ts
import type { Category, Occurrence } from '@/types/domain';
import type { Kind } from '@/types/money';

import { categoriesFor } from './tx-options';

/**
 * The categories a row's category pop-out offers: the ones of its kind used
 * most often in the occurrences given, then the rest in the list's own order,
 * `count` of them. The row's current category is always among them; when it
 * is not used often enough, it takes the last place.
 */
export function frequentCategories(
  occurrences: readonly Occurrence[],
  categories: readonly Category[],
  kind: Kind,
  currentId: string,
  count = 7,
): readonly Category[] {
  const uses = new Map<string, number>();
  for (const o of occurrences) {
    if (o.transaction.kind === kind) uses.set(o.categoryId, (uses.get(o.categoryId) ?? 0) + 1);
  }
  const listed = categoriesFor(categories, kind, currentId);
  const order = new Map(listed.map((c, i) => [c.id, i]));
  const ranked = [...listed].sort(
    (a, b) =>
      (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
  const top = ranked.slice(0, count);
  const current = listed.find((c) => c.id === currentId);
  if (current === undefined || top.some((c) => c.id === currentId)) return top;
  return [...top.slice(0, count - 1), current];
}
```

Create `src/features/feed/use-frequent-categories.ts`:

```ts
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';

import { db } from '@/db/db';
import { findCandidates, findOverrides } from '@/db/repos/transactions';
import { frequentCategories } from '@/domain/category-usage';
import { expandOccurrences } from '@/domain/occurrences';
import { addDays } from '@/lib/dates';
import { ALL_PROFILES, type Category, type Occurrence } from '@/types/domain';
import type { Kind, LocalDate } from '@/types/money';

/** How far back "used most often" looks. */
const LOOKBACK_DAYS = 90;

/** The household's occurrences of the last 90 days, read only while a category pop-out is open. */
export function useFrequentCategories(
  kind: Kind,
  currentId: string,
  categories: readonly Category[],
  today: LocalDate,
): readonly Category[] | undefined {
  const recent = useLiveQuery(async (): Promise<readonly Occurrence[]> => {
    const from = addDays(today, -LOOKBACK_DAYS);
    const transactions = await findCandidates(db, { profileId: ALL_PROFILES, from, to: today });
    const overrides = await findOverrides(
      db,
      transactions.map((t) => t.id),
    );
    return transactions.flatMap((tx) =>
      expandOccurrences(
        tx,
        overrides.filter((o) => o.transactionId === tx.id),
        from,
        today,
        { today },
      ),
    );
  }, [today]);

  return useMemo(
    () => (recent === undefined ? undefined : frequentCategories(recent, categories, kind, currentId)),
    [recent, categories, kind, currentId],
  );
}
```

If `findCandidates`' query type needs more fields than `profileId`, `from` and `to`, pass them the way `use-balance.ts` does.

- [ ] **Step 6: The shared picker list**

In `src/features/transaction/picker-field.tsx`, move the `<Command …>…</Command>` element out of `PickerField` into an exported component, without changing its JSX:

```tsx
/** The searchable list itself: inside the picker field's popover, and inside the category pop-out's "More". */
export function PickerList({
  options,
  value,
  onSelect,
  searchPlaceholder,
  emptyText,
}: {
  readonly options: readonly PickerOption[];
  readonly value: string;
  readonly onSelect: (id: string) => void;
  readonly searchPlaceholder: string;
  readonly emptyText: string;
}) {
  return (
    <Command /* the existing props and filter, unchanged */>
      {/* the existing CommandInput / CommandList / CommandEmpty / CommandGroup, with
          each CommandItem's onSelect calling onSelect(option.id) where it called
          onChange(option.id) and closed the popover */}
    </Command>
  );
}
```

Move the block; do not retype it. The only change inside it is that each item calls `onSelect(option.id)`. `PickerField` then renders `<PickerList options={options} value={value} searchPlaceholder={searchPlaceholder} emptyText={emptyText} onSelect={(id) => { onChange(id); setOpen(false); }} />` inside its `PopoverContent`. Any other statements the old `onSelect` ran (for example, returning focus) stay in `PickerField`'s callback.

- [ ] **Step 7: The pop-out**

Create `src/features/feed/category-popout.tsx`:

```tsx
import { cn } from 'cn';
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CategoryIcon } from '@/components/category-icon';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTitle } from '@/components/ui/popover';
import { useCloseWhenDetached } from '@/components/ui/popup-parts';
import { categoriesFor } from '@/domain/tx-options';
import { categoryDisplayName } from '@/i18n/category-name';
import type { Category, Occurrence } from '@/types/domain';
import type { LocalDate } from '@/types/money';

import { PickerList } from '../transaction/picker-field';
import { useFrequentCategories } from './use-frequent-categories';

export type CategoryTarget = { readonly occurrence: Occurrence; readonly anchor: HTMLElement };

/**
 * A row's category, changed from the row: ONE pop-out at screen level,
 * anchored to the chip that opened it, for the same reason as the row menu.
 * A series asks first whether the change is for this time only or from now on.
 */
export function CategoryPopout({
  target,
  categories,
  today,
  onClose,
  onChange,
}: {
  readonly target: CategoryTarget | undefined;
  readonly categories: ReadonlyMap<string, Category>;
  readonly today: LocalDate;
  readonly onClose: () => void;
  readonly onChange: (occurrence: Occurrence, categoryId: string, scope: 'one' | 'future') => void;
}) {
  useCloseWhenDetached(target?.anchor, onClose);
  const lastAnchor = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (target !== undefined) lastAnchor.current = target.anchor;
  }, [target]);

  return (
    <Popover
      open={target !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverContent
        anchor={target?.anchor}
        arrow
        side="bottom"
        align="start"
        className="w-80"
        data-testid="category-popout"
        finalFocus={() => (lastAnchor.current?.isConnected === true ? lastAnchor.current : false)}
      >
        {target === undefined ? null : (
          <Chooser
            // A fresh chooser for each row: the series question never carries over.
            key={target.occurrence.key}
            occurrence={target.occurrence}
            categories={categories}
            today={today}
            onChange={(categoryId, scope) => {
              onChange(target.occurrence, categoryId, scope);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

type Step =
  | { readonly kind: 'grid' }
  | { readonly kind: 'all' }
  | { readonly kind: 'scope'; readonly categoryId: string };

function Chooser({
  occurrence,
  categories,
  today,
  onChange,
}: {
  readonly occurrence: Occurrence;
  readonly categories: ReadonlyMap<string, Category>;
  readonly today: LocalDate;
  readonly onChange: (categoryId: string, scope: 'one' | 'future') => void;
}) {
  const { t } = useTranslation(['common', 'categories']);
  const [step, setStep] = useState<Step>({ kind: 'grid' });
  const all = useMemo(() => [...categories.values()], [categories]);
  const kind = occurrence.transaction.kind;
  const frequent = useFrequentCategories(kind, occurrence.categoryId, all, today);
  const isSeries = occurrence.transaction.recurrence.type !== 'one_time';
  const name = (id: string): string => {
    const category = categories.get(id);
    return category === undefined ? id : categoryDisplayName(category, t);
  };

  // The second question takes focus, so a keyboard user lands on it.
  const firstScope = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (step.kind === 'scope') firstScope.current?.focus();
  }, [step]);

  const choose = (categoryId: string): void => {
    if (categoryId === occurrence.categoryId) return;
    if (isSeries) setStep({ kind: 'scope', categoryId });
    else onChange(categoryId, 'one');
  };

  if (step.kind === 'scope') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">
          {t('categoryPop.scopeQuestion', { name: name(step.categoryId) })}
        </p>
        <Button
          ref={firstScope}
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          onClick={() => {
            onChange(step.categoryId, 'one');
          }}
        >
          {t('categoryPop.scopeOne')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          onClick={() => {
            onChange(step.categoryId, 'future');
          }}
        >
          {t('categoryPop.scopeFuture')}
        </Button>
      </div>
    );
  }

  if (step.kind === 'all') {
    return (
      <PickerList
        options={categoriesFor(all, kind, occurrence.categoryId).map((c) => ({
          id: c.id,
          label: categoryDisplayName(c, t),
          icon: <CategoryIcon name={c.icon} className="size-4 shrink-0" />,
        }))}
        value={occurrence.categoryId}
        onSelect={choose}
        searchPlaceholder={t('tx.categorySearch')}
        emptyText={t('tx.categoryEmpty')}
      />
    );
  }

  return (
    <>
      <PopoverTitle>{t('categoryPop.title')}</PopoverTitle>
      <div role="group" aria-label={t('categoryPop.title')} className="grid grid-cols-4 gap-1.5">
        {(frequent ?? []).map((category) => {
          const current = category.id === occurrence.categoryId;
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={current}
              onClick={() => {
                choose(category.id);
              }}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] leading-tight transition',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                current ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
              )}
            >
              <CategoryIcon name={category.icon} className="size-5" />
              <span className="line-clamp-2 text-center">{categoryDisplayName(category, t)}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setStep({ kind: 'all' });
          }}
          className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-[11px] text-foreground transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MoreHorizontal className="size-5" strokeWidth={1.75} aria-hidden="true" />
          {t('categoryPop.more')}
        </button>
      </div>
    </>
  );
}
```

`Button` must forward `ref`. In React 19 `ref` is an ordinary prop, and `Button` spreads its props onto base-ui's `Button`, so this works without `forwardRef`.

- [ ] **Step 8: The chip as a button, and the feed wiring**

In `src/features/feed/feed-rows.tsx`:

- Add the prop `onCategory?: (occurrence: Occurrence, anchor: HTMLElement) => void;`, and import `isCardFee` from `@/domain/cards`.
- Remove `<CategoryChip … />` from inside the main `<button>`. Insert before that button:

```tsx
{
  /* Its own button, beside the row's: a button inside a button is not one. */
}
{
  onCategory === undefined || occurrence.isSkipped || isCardFee(occurrence) ? (
    <span className="flex size-11 shrink-0 items-center justify-center" aria-hidden="true">
      <CategoryChip icon={category?.icon ?? 'Circle'} />
    </span>
  ) : (
    <button
      type="button"
      aria-label={t('categoryPop.chip', { name: categoryName })}
      onClick={(event) => {
        onCategory(occurrence, event.currentTarget);
      }}
      className="flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <CategoryChip icon={category?.icon ?? 'Circle'} />
    </button>
  );
}
```

- The row's outer `div` changes `gap-3 … px-3` to `gap-1.5 … ps-1.5 pe-3`, so the 44px chip target keeps the row's width.

In `src/features/feed/virtual-feed.tsx`, add `onCategory?: (occurrence: Occurrence, anchor: HTMLElement) => void` to the `VirtualFeed` props and to `RenderOptions`, and pass it through to `TransactionRow`.

In `src/features/feed/use-row-actions.ts`:

- Move `offerUndo` out of the callback to module level, with the signature `function offerUndo(message: string, undoable: UndoableAction, t: TFunction): void` and the same body. Import `TFunction` from `i18next`.
- Update its three calls to pass `t`.
- Add:

```ts
/**
 * Run one undoable write, then offer to take it back - the row menu's toast,
 * for the pop-outs that write (the category, and "not counted yet").
 */
export function useUndoableWrite(): (write: () => Promise<UndoableAction>, message: string) => Promise<void> {
  const { t } = useTranslation();
  return useCallback(
    async (write: () => Promise<UndoableAction>, message: string) => {
      try {
        offerUndo(message, await write(), t);
      } catch {
        // One Dexie transaction: a failure changed nothing.
        toast.error(t('tx.toastFailed'));
      }
    },
    [t],
  );
}
```

In `src/features/feed/feed-screen.tsx`:

- Imports:

```tsx
import { changeCategory } from '@/db/occurrence-actions';
import { newId } from '@/lib/id';
import { CategoryPopout, type CategoryTarget } from './category-popout';
import { useUndoableWrite } from './use-row-actions';
```

- State: `const [categoryFor, setCategoryFor] = useState<CategoryTarget | undefined>(undefined);` and `const undoable = useUndoableWrite();`.
- `VirtualFeed` gets:

```tsx
            onCategory={(occurrence, anchor) => {
              setCategoryFor({ occurrence, anchor });
            }}
```

- After `RowActionsMenu`, add:

```tsx
{
  context === undefined ? null : (
    <CategoryPopout
      target={categoryFor}
      categories={context.categories}
      today={today}
      onClose={() => {
        setCategoryFor(undefined);
      }}
      onChange={(occurrence, categoryId, scope) => {
        // Closed first, so the toast's Undo is not under it.
        setCategoryFor(undefined);
        const category = context.categories.get(categoryId);
        void undoable(
          () =>
            changeCategory(db, {
              occurrence,
              categoryId,
              scope,
              today,
              now: systemClock.nowIso(),
              newId,
            }),
          t('categoryPop.changed', {
            name: category === undefined ? categoryId : categoryDisplayName(category, t),
          }),
        );
      }}
    />
  );
}
```

Add the `categoryPop` keys from the copy table to both locale files.

- [ ] **Step 9: Run the tests to see them pass**

Run:

- `pnpm exec vitest run --project db src/db/occurrence-actions.test.ts src/db/series-edit.test.ts`
- `pnpm exec vitest run --project unit src/domain/category-usage.test.ts`
- `pnpm exec vitest run --project dom src/features/feed src/features/transaction`

Expected: PASS.

- [ ] **Step 10: Look at it.** In `pnpm dev`, in Playwright's Chromium at 390×844:
  - tap a monthly row's chip, choose another category, and answer "From now on";
  - check that the toast offers Undo, and that undoing restores the row and the months after it;
  - repeat in Hebrew, and check that the grid reads from the right.

- [ ] **Step 11: Gate.** Run `pnpm verify`. Expected: exit 0.

- [ ] **Step 12: Commit**

```bash
git add src/db/occurrence-actions.ts src/db/occurrence-actions.test.ts src/domain/category-usage.ts src/domain/category-usage.test.ts src/features/feed src/features/transaction/picker-field.tsx src/i18n/locales
git commit -m "A row's category changes from its icon, asking a series whether it is just this time or from now on" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The "not counted yet" pop-out (5.5)

**Files:**

- Modify: `src/db/occurrence-actions.ts` (`moveOccurrence`)
- Test: `src/db/occurrence-actions.test.ts`
- Create: `src/features/feed/projected-popout.tsx`, `src/features/feed/projected-popout.test.tsx`
- Modify: `src/features/feed/feed-rows.tsx`. The row's main button becomes a stretched button, so the row can hold other buttons (the chip, "not counted yet", ⋯) without nesting a button inside a button.
- Modify: `src/features/feed/virtual-feed.tsx` (`onProjected`)
- Modify: `src/features/feed/use-row-actions.ts` (export `offerUndo`)
- Modify: `src/features/transaction/use-transaction-sheet.ts` (`openEdit(occurrence, { focus: 'amount' })`, the URL `focus=amount`)
- Modify: `src/features/transaction/transaction-sheet.tsx` (focus the amount on request; the edit path returns its undo to `onSaved`)
- Modify: `src/features/feed/feed-screen.tsx`
- Modify: `src/i18n/locales/{en,he}/common.json` (`projected.*`)
- Test: `src/features/feed/feed-rows.test.tsx`, `src/features/transaction/use-transaction-sheet.test.tsx`

**Interfaces:**

- Consumes:
  - from Task 10: `applyUndoablePlan`, `editOccurrence` and `useUndoableWrite`;
  - from Task 7: `useCloseWhenDetached`, `PopoverContent` with `anchor`, `arrow` and `finalFocus`;
  - `Calendar` (`src/components/ui/calendar.tsx`), configured exactly as `DateField` configures it;
  - `toPickerDate` and `fromPickerDate` (`src/lib/dates.ts`).
- Produces:
  - `moveOccurrence(db: BookandryDB, input: { occurrence: Occurrence; to: LocalDate; today: LocalDate; now: IsoInstant; newId: () => string }): Promise<UndoableAction>`.
  - `ProjectedTarget = { readonly occurrence: Occurrence; readonly anchor: HTMLElement }`.
  - `ProjectedPopout({ target, today, onClose, onMove: (occurrence: Occurrence, to: LocalDate) => void, onAmount: (occurrence: Occurrence) => void })`.
  - `TransactionRow` and `VirtualFeed` gain `onProjected?: (occurrence: Occurrence, anchor: HTMLElement) => void`.
  - `SheetTarget`'s edit member gains `focus?: 'amount'`. `openEdit: (occurrence: Occurrence, options?: { focus?: 'amount' }) => void`.
  - `TransactionSheet`'s `onSaved: (date: LocalDate, undoable?: UndoableAction) => void`. An edit returns its undo; an add returns none.
  - `offerUndo(message: string, undoable: UndoableAction, t: TFunction): void` is exported.

Decisions:

- **A one-time row** is its own only occurrence, and the planner always treats it as scope `all`, where a date cannot move (`planSeriesEdit`; the edit form disables its date for the same reason). "Charged today" and "A different date…" therefore move the transaction's own `date`, through `applyUndoablePlan`. Any override keyed on its old date moves with it. This keeps `seriesStart`, which is the transaction's date, in step, so the feed still finds the row in its new month.
- **A series occurrence** moves through the edit form's own path: a `modify` override at scope `one`. That path cannot move an occurrence to before the series' own `date`, because `seriesStart` would no longer cover it and the row would vanish from the feed. So in that one case, a series that has not started yet, "Charged today" is disabled with the reason, and the calendar disables dates before the start.
- **"A different amount…" also gets its undo toast.** The edit form now hands its undo to `onSaved`. The feed shows "Amount changed" with Undo only when the form was opened from this pop-out (`focus=amount`); every other save behaves as it does today.
- **The chip shows** on a projected occurrence that is not skipped and not a card fee, for income and expense alike. Locked and offline behave as in Task 10.

Copy (`common.json`, new `projected` section):

| key           | en                            | he                      |
| ------------- | ----------------------------- | ----------------------- |
| `chip`        | Not counted yet. Change it    | טרם נכלל. לשינוי        |
| `today`       | Charged today                 | נגבה היום               |
| `todayHint`   | Count it in the balance now   | לכלול ביתרה כבר עכשיו   |
| `amount`      | A different amount…           | סכום אחר…               |
| `date`        | A different date…             | תאריך אחר…              |
| `notStarted`  | The series starts on {{date}} | הסדרה מתחילה ב־{{date}} |
| `moved`       | Moved to {{date}}             | הועבר ל־{{date}}        |
| `amountSaved` | Amount changed                | הסכום שונה              |

- [ ] **Step 1: Write the failing DB tests**

Add to `src/db/occurrence-actions.test.ts` (import `moveOccurrence`):

```ts
describe('moving a projected occurrence', () => {
  const snapshot = async (db: TestDb['db']) => ({
    transactions: (await db.transactions.toArray()).map(({ updatedAt: _u, ...rest }) => rest),
    overrides: (await db.overrides.toArray()).map(({ updatedAt: _u, ...rest }) => rest),
  });

  it('charged today: a modify override moving this one occurrence to today', async () => {
    const tx = rent();
    await handle.db.transactions.add(tx);
    const next = occurrence(tx, '2026-10-10');
    const before = await snapshot(handle.db);

    const undoable = await moveOccurrence(handle.db, {
      occurrence: next,
      to: TODAY,
      today: TODAY,
      now: NOW,
      newId: ids(),
    });
    const [override] = await handle.db.overrides.toArray();
    expect(override).toMatchObject({
      action: 'modify',
      occurrenceDate: '2026-10-10',
      patch: { date: '2026-09-15' },
    });

    await undoable.undo(LATER);
    expect(await snapshot(handle.db)).toEqual(before);
  });

  it('keeps an earlier amount change, and undo restores that override exactly', async () => {
    const tx = rent();
    await handle.db.transactions.add(tx);
    const earlier = modify('rent', d('2026-10-10'), {
      money: { ...MONEY, amountMinor: 999 },
      note: 'Raised',
    });
    await handle.db.overrides.add(earlier);
    const next = occurrence(tx, '2026-10-10', [earlier]);
    const before = await snapshot(handle.db);

    const undoable = await moveOccurrence(handle.db, {
      occurrence: next,
      to: TODAY,
      today: TODAY,
      now: NOW,
      newId: ids(),
    });
    expect(await handle.db.overrides.get(earlier.id)).toMatchObject({
      patch: { date: '2026-09-15', note: 'Raised', money: { amountMinor: 999 } },
    });

    await undoable.undo(LATER);
    expect(await snapshot(handle.db)).toEqual(before);
  });

  it('moves a one-time row by its own date, so the feed still finds it in its new month', async () => {
    const once = materialize({
      ...rent(),
      id: 'sofa',
      seriesRootId: 'sofa',
      recurrence: { type: 'one_time' },
      date: d('2026-11-02'),
    });
    await handle.db.transactions.add(once);
    const target = occurrence(once, '2026-11-02');
    const before = await snapshot(handle.db);

    const undoable = await moveOccurrence(handle.db, {
      occurrence: target,
      to: TODAY,
      today: TODAY,
      now: NOW,
      newId: ids(),
    });
    expect(await handle.db.transactions.get('sofa')).toMatchObject({
      date: '2026-09-15',
      seriesStart: '2026-09-15',
      seriesEnd: '2026-09-15',
    });
    expect(await handle.db.overrides.count()).toBe(0);

    await undoable.undo(LATER);
    expect(await snapshot(handle.db)).toEqual(before);
  });

  it('refuses to move a series occurrence before the series starts', async () => {
    const later = materialize({ ...rent(), date: d('2026-10-10') });
    await handle.db.transactions.add(later);
    const first = occurrence(later, '2026-10-10');

    await expect(
      moveOccurrence(handle.db, { occurrence: first, to: TODAY, today: TODAY, now: NOW, newId: ids() }),
    ).rejects.toThrow('before_series_start');
    expect(await handle.db.overrides.count()).toBe(0);
  });
});
```

`materialize` and `MONEY` are already imported in this file; add `modify` to the `@/domain/test-factories` import.

- [ ] **Step 2: Write the failing DOM tests**

Create `src/features/feed/projected-popout.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { expandOccurrences } from '@/domain/occurrences';
import { d, makeTx, MONEY } from '@/domain/test-factories';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { Occurrence, Recurrence } from '@/types/domain';

import { materialize } from '@/db/materialize';
import { moveOccurrence } from '@/db/occurrence-actions';
import { counterIdFactory } from '@/lib/id';
import { freshDb } from '@/test/db-harness';
import type { IsoInstant } from '@/types/money';

import { ProjectedPopout } from './projected-popout';

const TODAY = d('2026-09-15');

function projected(recurrence: Recurrence, date = '2026-09-10', on = '2026-10-10'): Occurrence {
  const tx = makeTx({ id: 'rent', date: d(date), recurrence, money: MONEY });
  const found = expandOccurrences(tx, [], d(on), d(on), { today: TODAY })[0];
  if (found === undefined) throw new Error('no occurrence');
  return found;
}

function renderPopout(target: Occurrence) {
  const anchor = document.createElement('button');
  anchor.textContent = 'chip';
  document.body.append(anchor);
  const props = { onMove: vi.fn(), onAmount: vi.fn(), onClose: vi.fn() };
  renderWithProviders(<ProjectedPopout target={{ occurrence: target, anchor }} today={TODAY} {...props} />);
  return { ...props, anchor };
}

beforeAll(async () => {
  await initTestI18n('en');
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('ProjectedPopout', () => {
  it('offers the three choices, each at least 44px', async () => {
    renderPopout(projected({ type: 'monthly', dayOfMonth: 10 }));

    for (const name of [/Charged today/, /A different amount/, /A different date/]) {
      expect(await screen.findByRole('button', { name })).toHaveClass('min-h-11');
    }
  });

  it('"Charged today" moves this occurrence to today', async () => {
    const user = userEvent.setup();
    const target = projected({ type: 'monthly', dayOfMonth: 10 });
    const { onMove } = renderPopout(target);

    await user.click(await screen.findByRole('button', { name: /Charged today/ }));
    expect(onMove).toHaveBeenCalledWith(target, '2026-09-15');
  });

  it('"Charged today", wired as the feed wires it, writes a modify override dated today', async () => {
    // The dom project loads fake-indexeddb (src/test/setup.db.ts), so the real write runs here.
    const handle = freshDb();
    const tx = materialize({
      id: 'rent',
      profileId: 'p1',
      kind: 'expense',
      categoryId: 'cat.rent',
      money: MONEY,
      recurrence: { type: 'monthly', dayOfMonth: 10 },
      date: d('2026-03-10'),
      seriesRootId: 'rent',
      createdAt: '2026-01-01T00:00:00.000Z' as IsoInstant,
      updatedAt: '2026-01-01T00:00:00.000Z' as IsoInstant,
    });
    await handle.db.transactions.add(tx);
    const target = expandOccurrences(tx, [], d('2026-10-10'), d('2026-10-10'), { today: TODAY })[0];
    if (target === undefined) throw new Error('no occurrence');

    const anchor = document.createElement('button');
    document.body.append(anchor);
    const moved = new Promise<void>((resolve) => {
      renderWithProviders(
        <ProjectedPopout
          target={{ occurrence: target, anchor }}
          today={TODAY}
          onClose={vi.fn()}
          onAmount={vi.fn()}
          onMove={(occurrence, to) => {
            void moveOccurrence(handle.db, {
              occurrence,
              to,
              today: TODAY,
              now: '2026-09-15T10:00:00.000Z' as IsoInstant,
              newId: counterIdFactory('ov'),
            }).then(() => {
              resolve();
            });
          }}
        />,
      );
    });

    await userEvent.setup().click(await screen.findByRole('button', { name: /Charged today/ }));
    await moved;
    expect(await handle.db.overrides.toArray()).toEqual([
      expect.objectContaining({
        action: 'modify',
        occurrenceDate: '2026-10-10',
        patch: { date: '2026-09-15' },
      }),
    ]);
    await handle.dispose();
  });

  it('"A different amount…" opens the edit form', async () => {
    const user = userEvent.setup();
    const target = projected({ type: 'monthly', dayOfMonth: 10 });
    const { onAmount } = renderPopout(target);

    await user.click(await screen.findByRole('button', { name: /A different amount/ }));
    expect(onAmount).toHaveBeenCalledWith(target);
  });

  it('"A different date…" opens the calendar in place, and moves there', async () => {
    const user = userEvent.setup();
    const target = projected({ type: 'monthly', dayOfMonth: 10 });
    const { onMove } = renderPopout(target);

    await user.click(await screen.findByRole('button', { name: /A different date/ }));
    await user.click(await screen.findByRole('button', { name: /October 3/ }));
    expect(onMove).toHaveBeenCalledWith(target, '2026-10-03');
  });

  it('disables "Charged today" for a series that has not started, and says why', async () => {
    renderPopout(projected({ type: 'monthly', dayOfMonth: 10 }, '2026-10-10', '2026-10-10'));
    const today = await screen.findByRole('button', { name: /Charged today/ });

    expect(today).toBeDisabled();
    expect(today).toHaveTextContent(/The series starts on/);
  });

  it('gives focus back to the chip on Escape', async () => {
    const user = userEvent.setup();
    const { anchor } = renderPopout(projected({ type: 'monthly', dayOfMonth: 10 }));
    await screen.findByRole('button', { name: /Charged today/ });

    await user.keyboard('{Escape}');
    expect(anchor).toHaveFocus();
  });
});
```

The calendar's day buttons are named by react-day-picker in the form "Saturday, October 3rd, 2026". If the regex `/October 3/` does not match the installed version's wording, match on the day's `data-day="2026-10-03"` attribute: `document.querySelector('[data-day="2026-10-03"] button')`.

Add to `src/features/feed/feed-rows.test.tsx`:

```tsx
it('makes "not counted yet" a button on a projected row, and still opens the row from anywhere else', async () => {
  await initTestI18n('en');
  const user = userEvent.setup();
  const onProjected = vi.fn();
  const onOpen = vi.fn();
  renderWithProviders(
    <TransactionRow
      occurrence={occurrence({ isProjected: true })}
      context={context()}
      position={1}
      setSize={1}
      onOpen={onOpen}
      onProjected={onProjected}
    />,
  );
  const chip = screen.getByRole('button', { name: 'Not counted yet. Change it' });

  await user.click(chip);
  expect(onProjected).toHaveBeenCalledWith(expect.objectContaining({ isProjected: true }), chip);
  expect(onOpen).not.toHaveBeenCalled();
  // No button inside a button anywhere in the row.
  expect(document.querySelector('button button')).toBeNull();
});

it('shows no chip on a past occurrence', async () => {
  await initTestI18n('en');
  renderWithProviders(
    <TransactionRow
      occurrence={occurrence()}
      context={context()}
      position={1}
      setSize={1}
      onProjected={vi.fn()}
    />,
  );
  expect(screen.queryByRole('button', { name: /Not counted yet/ })).not.toBeInTheDocument();
});
```

Add to `src/features/transaction/use-transaction-sheet.test.tsx` a probe button that calls `sheet.openEdit(fakeOccurrence, { focus: 'amount' })`, and:

```tsx
it('asks the edit form to focus the amount', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Probe />);

  await user.click(screen.getByRole('button', { name: 'amount' }));
  expect(screen.getByTestId('search')).toHaveTextContent('focus=amount');
  expect(target()).toMatchObject({ mode: 'edit', transactionId: 'salary', focus: 'amount' });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm exec vitest run --project db src/db/occurrence-actions.test.ts` and `pnpm exec vitest run --project dom src/features/feed src/features/transaction`
Expected: FAIL. `moveOccurrence`, `ProjectedPopout` and `onProjected` do not exist.

- [ ] **Step 4: Moving an occurrence**

Add to `src/db/occurrence-actions.ts` (import `compareLocal` from `@/lib/dates`):

```ts
/**
 * Move a projected occurrence to another day: "Charged today", or a date
 * picked in the "not counted yet" pop-out.
 *
 * A series occurrence moves the way the edit form moves one: a `modify`
 * override at scope `one`, which keeps any amount or note already changed on
 * it. A one-time row is its own only occurrence and the planner never moves a
 * date outside scope `one`, so its own date moves instead, and an override on
 * that day moves with it; that also keeps `seriesStart` in step, so the feed
 * still finds it. A series occurrence cannot move to before the series' own
 * start: nothing would find it there.
 */
export async function moveOccurrence(
  db: BookandryDB,
  input: {
    readonly occurrence: Occurrence;
    readonly to: LocalDate;
    readonly today: LocalDate;
    readonly now: IsoInstant;
    readonly newId: () => string;
  },
): Promise<UndoableAction> {
  const transaction = await db.transactions.get(input.occurrence.transaction.id);
  if (transaction === undefined || transaction.isDeleted === 1) throw new Error('gone');

  if (transaction.recurrence.type === 'one_time') {
    const owned = await db.overrides.where('transactionId').equals(transaction.id).toArray();
    return applyUndoablePlan(db, {
      transactions: [{ ...transaction, date: input.to, updatedAt: input.now }],
      overrides: owned
        .filter((o) => o.occurrenceDate === transaction.date)
        .map((o) => ({ ...o, occurrenceDate: input.to, updatedAt: input.now })),
      deleteOverrideIds: [],
      warnings: [],
      effectiveScope: 'all',
    });
  }

  if (compareLocal(input.to, transaction.date) < 0) throw new Error('before_series_start');
  return editOccurrence(db, {
    occurrence: input.occurrence,
    scope: 'one',
    patch: { date: input.to },
    today: input.today,
    now: input.now,
    newId: input.newId,
  });
}
```

`applySeriesEdit` re-materializes every transaction in the plan with its overrides, so the one-time row's `seriesStart` and `seriesEnd` follow its new date.

- [ ] **Step 5: The pop-out**

Create `src/features/feed/projected-popout.tsx`:

```tsx
import { CalendarDays, Clock, PencilLine } from 'lucide-react';
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from 'react';
import { he, enUS } from 'react-day-picker/locale';
import { useTranslation } from 'react-i18next';

import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTitle } from '@/components/ui/popover';
import { useCloseWhenDetached } from '@/components/ui/popup-parts';
import { compareLocal, formatLocalDate, fromPickerDate, toPickerDate } from '@/lib/dates';
import type { Occurrence } from '@/types/domain';
import type { LocalDate } from '@/types/money';

export type ProjectedTarget = { readonly occurrence: Occurrence; readonly anchor: HTMLElement };

/**
 * "Not counted yet", answered from the chip: it was charged today, it is a
 * different amount, or it is on a different day. ONE pop-out at screen level,
 * anchored to the chip, like the row menu.
 */
export function ProjectedPopout({
  target,
  today,
  onClose,
  onMove,
  onAmount,
}: {
  readonly target: ProjectedTarget | undefined;
  readonly today: LocalDate;
  readonly onClose: () => void;
  readonly onMove: (occurrence: Occurrence, to: LocalDate) => void;
  readonly onAmount: (occurrence: Occurrence) => void;
}) {
  useCloseWhenDetached(target?.anchor, onClose);
  const lastAnchor = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (target !== undefined) lastAnchor.current = target.anchor;
  }, [target]);

  return (
    <Popover
      open={target !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverContent
        anchor={target?.anchor}
        arrow
        side="bottom"
        align="start"
        className="w-auto min-w-64"
        data-testid="projected-popout"
        finalFocus={() => (lastAnchor.current?.isConnected === true ? lastAnchor.current : false)}
      >
        {target === undefined ? null : (
          <Choices
            key={target.occurrence.key}
            occurrence={target.occurrence}
            today={today}
            onMove={onMove}
            onAmount={onAmount}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function Choices({
  occurrence,
  today,
  onMove,
  onAmount,
}: {
  readonly occurrence: Occurrence;
  readonly today: LocalDate;
  readonly onMove: (occurrence: Occurrence, to: LocalDate) => void;
  readonly onAmount: (occurrence: Occurrence) => void;
}) {
  const { t, i18n } = useTranslation();
  const [picking, setPicking] = useState(false);
  const tx = occurrence.transaction;
  // A series occurrence cannot move to before the series starts (see moveOccurrence).
  const earliest = tx.recurrence.type === 'one_time' ? undefined : tx.date;
  const notStarted = earliest !== undefined && compareLocal(today, earliest) < 0;
  const rtl = i18n.dir() === 'rtl';

  if (picking) {
    return (
      <Calendar
        mode="single"
        selected={toPickerDate(occurrence.date)}
        defaultMonth={toPickerDate(occurrence.date)}
        disabled={earliest === undefined ? undefined : { before: toPickerDate(earliest) }}
        onSelect={(next) => {
          if (next !== undefined) onMove(occurrence, fromPickerDate(next));
        }}
        locale={rtl ? he : enUS}
        dir={rtl ? 'rtl' : 'ltr'}
        aria-label={t('projected.date')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <PopoverTitle className="px-1">{t('summary.notCountedYet')}</PopoverTitle>
      <Choice
        icon={Clock}
        disabled={notStarted}
        hint={
          notStarted
            ? t('projected.notStarted', {
                date: formatLocalDate(earliest, i18n.language, { dateStyle: 'medium' }),
              })
            : t('projected.todayHint')
        }
        onClick={() => {
          onMove(occurrence, today);
        }}
      >
        {t('projected.today')}
      </Choice>
      <Choice
        icon={PencilLine}
        onClick={() => {
          onAmount(occurrence);
        }}
      >
        {t('projected.amount')}
      </Choice>
      <Choice
        icon={CalendarDays}
        onClick={() => {
          setPicking(true);
        }}
      >
        {t('projected.date')}
      </Choice>
    </div>
  );
}

function Choice({
  icon: Icon,
  hint,
  disabled = false,
  onClick,
  children,
}: {
  readonly icon: ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>;
  readonly hint?: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 text-start transition hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{children}</span>
        {hint === undefined ? null : <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}
```

The `Calendar` here takes the props `DateField` uses (`mode`, `selected`, `defaultMonth`, `onSelect`, `locale`, `dir`), plus `disabled`. If `DateField` decides `rtl` differently (for example, from `i18n.resolvedLanguage === 'he'`), use its expression.

- [ ] **Step 6: The row holds buttons beside its own**

In `src/features/feed/feed-rows.tsx`, the row's main `<button>` stops wrapping the whole row. It becomes a stretched button: its `::after` covers the row, and the row's other controls sit above it at `z-10`.

- Add the prop `onProjected?: (occurrence: Occurrence, anchor: HTMLElement) => void;` and import `isCardFee` (already imported in Task 10).
- Replace everything from the outer `<div role="listitem" …>` to its closing `</div>` with:

```tsx
<div
  role="listitem"
  aria-posinset={position}
  aria-setsize={setSize}
  className={cn(
    'relative flex items-center gap-1.5 rounded-xl py-2.5 ps-1.5 pe-3',
    occurrence.isSkipped && 'opacity-50',
  )}
  data-projected={occurrence.isProjected ? 'true' : undefined}
  data-key={occurrence.key}
>
  {/* Its own button, beside the row's: a button inside a button is not one. */}
  {onCategory === undefined || occurrence.isSkipped || isCardFee(occurrence) ? (
    <span className="flex size-11 shrink-0 items-center justify-center" aria-hidden="true">
      <CategoryChip icon={category?.icon ?? 'Circle'} />
    </span>
  ) : (
    <button
      type="button"
      aria-label={t('categoryPop.chip', { name: categoryName })}
      onClick={(event) => {
        onCategory(occurrence, event.currentTarget);
      }}
      className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <CategoryChip icon={category?.icon ?? 'Circle'} />
    </button>
  )}

  <span className="flex min-w-0 flex-1 items-center gap-3">
    <span className="min-w-0 flex-1">
      {/*
            The row's own button, stretched: its ::after covers the whole row,
            so a tap anywhere opens the row, while the chips and ⋯ sit above it
            as buttons of their own.
          */}
      <button
        type="button"
        onClick={() => onOpen?.(occurrence)}
        aria-label={label}
        className="block w-full truncate text-start text-sm font-medium after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
      >
        {occurrence.note ?? categoryName}
      </button>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {occurrence.note === undefined ? null : (
          <span className="truncate" aria-hidden="true">
            {categoryName}
          </span>
        )}
        {type === undefined ? null : (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[11px]"
            aria-hidden="true"
          >
            <type.icon className="size-3" aria-hidden="true" />
            {type.label}
          </span>
        )}
        {occurrence.isProjected ? (
          onProjected === undefined || occurrence.isSkipped || isCardFee(occurrence) ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px]" aria-hidden="true">
              {t('summary.notCountedYet')}
            </span>
          ) : (
            <button
              type="button"
              aria-label={t('projected.chip')}
              onClick={(event) => {
                onProjected(occurrence, event.currentTarget);
              }}
              // A small chip with a 44px-tall hit area, drawn by its ::before.
              className="relative z-10 shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground before:absolute before:-inset-x-1 before:-inset-y-3.5 before:content-[''] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t('summary.notCountedYet')}
            </button>
          )
        ) : null}
        {occurrence.isSkipped ? (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px]" aria-hidden="true">
            {t('feed.skipped')}
          </span>
        ) : null}
      </span>
    </span>

    {context.showProfile && profile !== undefined ? (
      <span aria-hidden="true">
        <PersonAvatar person={profile} size="sm" />
      </span>
    ) : null}

    {/* The card under the amount, as a bank's app shows it. */}
    <span className="flex shrink-0 flex-col items-end" aria-hidden="true">
      <Money
        minor={signed}
        currency={context.currency}
        announce={false}
        className={cn('text-sm font-semibold', isIncome ? 'text-income' : 'text-foreground')}
      />
      {card === undefined ? null : (
        <span
          className="inline-flex max-w-24 items-center gap-1 text-[11px] text-muted-foreground"
          data-testid="row-card"
        >
          <CreditCard className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate tabular-nums">{card.text}</span>
        </span>
      )}
    </span>
  </span>

  {/*
        Always present, never hover-revealed, and 44x44.
        Swipe is invisible to assistive tech and hover is invisible to a
        keyboard, so a row whose only actions live behind either has no actions
        at all for a large share of users.
      */}
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className="relative z-10 size-11 shrink-0"
    aria-label={t('a11y.rowActions', { name: label })}
    onClick={(event) => onMenu?.(occurrence, event.currentTarget)}
  >
    <MoreHorizontal className="size-4" aria-hidden="true" />
  </Button>
</div>
```

Everything that sat inside the old main button was hidden from assistive technology by its `aria-label`. It now carries `aria-hidden="true"` explicitly, so a screen reader still hears the row exactly as before: its label, then its buttons.

In `src/features/feed/virtual-feed.tsx`, add `onProjected?: (occurrence: Occurrence, anchor: HTMLElement) => void` to the props and `RenderOptions`, and pass it to `TransactionRow`.

- [ ] **Step 7: The amount, focused; and its undo**

In `src/features/transaction/use-transaction-sheet.ts`:

- Add `const FOCUS = 'focus';`.
- The edit member of `SheetTarget` gains `readonly focus?: 'amount'`. The parse adds `...(params.get(FOCUS) === 'amount' ? { focus: 'amount' as const } : {})` to the edit target, and `write` adds `updated.delete(FOCUS)` and, for edit, `if (next.focus !== undefined) updated.set(FOCUS, next.focus);`.
- `openEdit` becomes `(occurrence: Occurrence, options: { readonly focus?: 'amount' } = {}) => { write({ mode: 'edit', transactionId: occurrence.transaction.id, at: occurrence.originalDate, ...options }); }`, and its type in `TransactionSheetApi` matches.

In `src/features/transaction/transaction-sheet.tsx`:

- `onSaved`'s type, in the sheet's props and in `TransactionForm`'s and `EditBody`'s, becomes `(date: LocalDate, undoable?: UndoableAction) => void`. Import `UndoableAction` and `applyUndoablePlan` from `@/db/occurrence-actions`.
- In the edit path's `run`, replace `await applySeriesEdit(db, plan); onSaved(patch.date ?? editing.occurrence.date);` with:

```tsx
// The same write, with what it overwrote kept, so the caller can offer Undo.
const undoable = await applyUndoablePlan(db, plan);
onSaved(patch.date ?? editing.occurrence.date, undoable);
```

Remove the `applySeriesEdit` import if it is now unused.

- `TransactionForm` gains `readonly focusAmount?: boolean`. After `amountId` is declared, add:

```tsx
// Opened from "A different amount…": the amount is what the person came to change.
useEffect(() => {
  if (focusAmount !== true) return;
  // After the sheet's own initial focus, which would otherwise win.
  const frame = requestAnimationFrame(() => {
    document.getElementById(amountId)?.focus();
  });
  return () => {
    cancelAnimationFrame(frame);
  };
}, [focusAmount, amountId]);
```

- `EditBody` passes `focusAmount={focus === 'amount'}`, where the sheet passes `focus={target.mode === 'edit' ? target.focus : undefined}` down to `EditBody`.

The URL half is pinned by Step 2's hook test. The caret landing in the amount is checked in the browser in Step 10, because jsdom does not run the sheet's own focus handling.

- [ ] **Step 8: The feed wiring**

In `src/features/feed/use-row-actions.ts`, export `offerUndo`.

In `src/features/feed/feed-screen.tsx`:

- Imports: `moveOccurrence` (with `changeCategory`), `offerUndo` and `useUndoableWrite` from `./use-row-actions`, `ProjectedPopout` and `type ProjectedTarget` from `./projected-popout`, and `formatLocalDate` from `@/lib/dates`.
- Add `const { t, i18n } = …` if `i18n` is not already destructured.
- State: `const [projectedFor, setProjectedFor] = useState<ProjectedTarget | undefined>(undefined);`.
- `VirtualFeed` gets:

```tsx
            onProjected={(occurrence, anchor) => {
              setProjectedFor({ occurrence, anchor });
            }}
```

- After `CategoryPopout`, add:

```tsx
<ProjectedPopout
  target={projectedFor}
  today={today}
  onClose={() => {
    setProjectedFor(undefined);
  }}
  onMove={(occurrence, to) => {
    setProjectedFor(undefined);
    void undoable(
      () => moveOccurrence(db, { occurrence, to, today, now: systemClock.nowIso(), newId }),
      t('projected.moved', { date: formatLocalDate(to, i18n.language, { dateStyle: 'medium' }) }),
    );
  }}
  onAmount={(occurrence) => {
    setProjectedFor(undefined);
    sheet.openEdit(occurrence, { focus: 'amount' });
  }}
/>
```

- `TransactionSheet`'s `onSaved` becomes:

```tsx
          onSaved={(date, undone) => {
            // An amount changed from "not counted yet" is offered back, like the pop-out's other two choices.
            const fromChip = sheet.target.mode === 'edit' && sheet.target.focus === 'amount';
            sheet.close();
            setMonth(startOfMonth(date));
            if (fromChip && undone !== undefined) offerUndo(t('projected.amountSaved'), undone, t);
          }}
```

Add the `projected` keys from the copy table to both locale files.

- [ ] **Step 9: Run the tests to see them pass**

Run:

- `pnpm exec vitest run --project db src/db`
- `pnpm exec vitest run --project dom src/features/feed src/features/transaction`

Expected: PASS.

- [ ] **Step 10: Look at it.** In `pnpm dev`, in Playwright's Chromium at 390×844, step to next month and work through all three choices, checking for each that the toast offers Undo:
  - **Charged today**: the row moves to today's day, and Undo returns it.
  - **A different amount…**: the sheet opens with the caret in the amount; save, and Undo restores the amount.
  - **A different date…**: the calendar opens inside the pop-out.

  In Hebrew, check that the calendar runs right to left.

- [ ] **Step 11: Gate.** Run `pnpm verify`. Expected: exit 0.

- [ ] **Step 12: Commit**

```bash
git add src/db/occurrence-actions.ts src/db/occurrence-actions.test.ts src/features/feed src/features/transaction src/i18n/locales
git commit -m "A payment not counted yet can be marked charged today, given another amount or moved, each with Undo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The card's ⋯ menu (5.6)

**Files:**

- Create: `src/features/cards/card-menu.tsx`, `src/features/cards/card-menu.test.tsx`
- Modify: `src/features/cards/cards-screen.tsx`:
  - the face gets a ⋯ in its top inline-end corner and becomes a button itself;
  - the outline Edit button goes;
  - there is one menu at screen level.
- Modify: `src/features/cards/method-editor.tsx` (`section?: 'rates'`), `src/features/cards/card-fields.tsx` (mark the rate table catalog Task 7 put there)
- Modify: `src/features/transaction/use-transaction-sheet.ts` (the import target's `via`), `src/features/import/import-session.ts` (`startSession`), `src/features/import/import-sheet.tsx` (start on the preset card)
- Modify: `src/i18n/locales/{en,he}/cards.json` (`menu.*`; remove `edit.open` if nothing else uses it)
- Test: Create `src/features/import/import-session.test.ts`; modify `src/features/transaction/use-transaction-sheet.test.tsx`

**Interfaces:**

- Consumes:
  - `DropdownMenu`, `DropdownMenuContent` with `anchor` and `arrow`, `DropdownMenuItem`, `DropdownMenuSeparator`, and `useCloseWhenDetached` (Task 7);
  - `useUndoableWrite` (Task 10);
  - `setPaymentMethodArchived(db, id, archived: boolean, now)` (`src/db/repos/payment-methods.ts`);
  - `PARAM.methods` (`src/domain/feed-filters.ts`, the feed's payment-method filter, `pm`);
  - `CardDetails.catalog` (catalog Task 5);
  - `<RateTable card resolved onOverride />`, which catalog Task 7 renders inside `card-fields.tsx` for a linked card;
  - `useAccount()`, for whether Smart import can run.
- Produces:
  - `CardMenuAction = 'edit' | 'rates' | 'transactions' | 'import' | 'archive'`.
  - `CardMenuTarget = { readonly card: PaymentMethod; readonly anchor: HTMLElement }`.
  - `CardMenu({ target: CardMenuTarget | undefined; aiAvailable: boolean; onClose: () => void; onAction: (action: CardMenuAction, card: PaymentMethod) => void })`.
  - `SheetTarget`'s import member gains `via?: string`, the payment method a statement is for. The URL is `import=1&via=<id>`.
  - `startSession(existing: ImportSession | undefined, empty: ImportSession, via: string | undefined): ImportSession`.
  - `MethodEditor` gains `section?: 'rates'`.

Decisions:

- **"Interest table"** opens the card editor scrolled to, and focused on, the rate table that catalog Task 7 placed in `card-fields.tsx`. Overrides are therefore edited and saved exactly where the catalog plan saves them, rather than through a second save path. It is hidden when `card.card?.catalog` is absent.
- **"Transactions on this card"** opens the feed with `?pm=<id>`: the feed's own payment-method filter, for the current month.
- **"Import a statement"** opens the feed's Smart import with `via=<id>`. A new session starts with this card as its batch method, and a session already at the "pick" stage switches to it. A session already reading or in review is left alone, because it belongs to files already chosen. Like the Add menu's item, it is disabled with the reason when there is no account server.
- **"Archive"** archives the card with an undo toast, the same toast the row actions use.
- **The face and the ⋯ open one menu.** It is a single controlled `DropdownMenu`, anchored to whichever was pressed, as the row menu is. The face's button is stretched under the face's text, so the text stays a heading and the ⋯ stays separately focusable.

Copy (`cards.json`, under `menu`):

| key            | en                        | he                     |
| -------------- | ------------------------- | ---------------------- |
| `label`        | Options for {{name}}      | אפשרויות עבור {{name}} |
| `edit`         | Edit card                 | עריכת הכרטיס           |
| `rates`        | Interest table            | טבלת הריביות           |
| `transactions` | Transactions on this card | העסקאות בכרטיס         |
| `import`       | Import a statement        | ייבוא דף פירוט         |
| `archive`      | Archive                   | העברה לארכיון          |
| `archived`     | {{name}} archived         | {{name}} הועבר לארכיון |

- [ ] **Step 1: Write the failing tests**

Create `src/features/cards/card-menu.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';
import type { PaymentMethod } from '@/types/domain';

import { CardMenu } from './card-menu';

const card = (linked: boolean): PaymentMethod =>
  ({
    id: 'card-1',
    type: 'credit_card',
    label: 'Max Gold',
    profileId: 'p1',
    card: linked
      ? { issuer: 'max', catalog: { issuer: 'max', bank: '20', tier: 'gold', version: 1 } }
      : { issuer: 'max' },
  }) as unknown as PaymentMethod;

function renderMenu(linked: boolean, aiAvailable = true) {
  const anchor = document.createElement('button');
  anchor.textContent = '⋯';
  document.body.append(anchor);
  const props = { onAction: vi.fn(), onClose: vi.fn() };
  renderWithProviders(
    <CardMenu target={{ card: card(linked), anchor }} aiAvailable={aiAvailable} {...props} />,
  );
  return { ...props, anchor };
}

beforeAll(async () => {
  await initTestI18n('en', ['cards']);
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('CardMenu', () => {
  it('offers edit, the interest table, transactions, import, then archive, for a linked card', async () => {
    renderMenu(true);
    const items = await screen.findAllByRole('menuitem');

    expect(items.map((i) => i.textContent)).toEqual([
      'Edit card',
      'Interest table',
      'Transactions on this card',
      'Import a statement',
      'Archive',
    ]);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    for (const item of items) expect(item).toHaveClass('min-h-11');
  });

  it('hides the interest table for a card not linked to the catalog', async () => {
    renderMenu(false);
    await screen.findAllByRole('menuitem');

    expect(screen.queryByRole('menuitem', { name: 'Interest table' })).not.toBeInTheDocument();
  });

  it.each([
    ['Edit card', 'edit'],
    ['Interest table', 'rates'],
    ['Transactions on this card', 'transactions'],
    ['Import a statement', 'import'],
    ['Archive', 'archive'],
  ] as const)('%s reports %s', async (name, action) => {
    const user = userEvent.setup();
    const { onAction } = renderMenu(true);

    await user.click(await screen.findByRole('menuitem', { name }));
    expect(onAction).toHaveBeenCalledWith(action, expect.objectContaining({ id: 'card-1' }));
  });

  it('disables import when there is no account server', async () => {
    renderMenu(true, false);

    expect(await screen.findByRole('menuitem', { name: /Import a statement/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('gives focus back to the ⋯ on Escape', async () => {
    const user = userEvent.setup();
    const { anchor } = renderMenu(true);
    await screen.findByRole('menu');

    await user.keyboard('{Escape}');
    expect(anchor).toHaveFocus();
  });
});
```

If `initTestI18n` takes no namespaces argument, call it with `'en'` alone. The `cards` namespace is then loaded the way the other `src/features/cards` tests load it.

Create `src/features/import/import-session.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { startSession, type ImportSession } from './import-session';

const empty = {
  stage: 'pick',
  files: [],
  states: [],
  items: [],
  methods: [],
  drafted: 0,
  reconciliations: [],
  batch: { methodId: '', profileId: 'p1' },
} as ImportSession;

describe('startSession', () => {
  it('starts a new session on the card it was opened for', () => {
    expect(startSession(undefined, empty, 'card-1').batch.methodId).toBe('card-1');
  });

  it('switches a session still picking files', () => {
    const picking = { ...empty, batch: { methodId: 'other', profileId: 'p1' } };
    expect(startSession(picking, empty, 'card-1').batch).toEqual({ methodId: 'card-1', profileId: 'p1' });
  });

  it('leaves a session already reading or in review alone', () => {
    const reviewing = {
      ...empty,
      stage: 'review',
      batch: { methodId: 'other', profileId: 'p1' },
    } as ImportSession;
    expect(startSession(reviewing, empty, 'card-1')).toBe(reviewing);
  });

  it('without a card, resumes or starts empty as before', () => {
    expect(startSession(undefined, empty, undefined)).toBe(empty);
  });
});
```

Add to `src/features/transaction/use-transaction-sheet.test.tsx`:

```tsx
it('carries the card a statement import is for', () => {
  renderWithProviders(<Probe />, { route: '/?import=1&via=card-1' });
  expect(target()).toEqual({ mode: 'import', via: 'card-1' });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm exec vitest run --project dom src/features/cards/card-menu.test.tsx src/features/transaction/use-transaction-sheet.test.tsx` and `pnpm exec vitest run --project db src/features/import/import-session.test.ts`
Expected: FAIL. None of these exist yet.

- [ ] **Step 3: The menu**

Create `src/features/cards/card-menu.tsx`:

```tsx
import { Archive, Pencil, Percent, ReceiptText, Sparkles } from 'lucide-react';
import { type ComponentType, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useCloseWhenDetached } from '@/components/ui/popup-parts';
import type { PaymentMethod } from '@/types/domain';

export type CardMenuAction = 'edit' | 'rates' | 'transactions' | 'import' | 'archive';
export type CardMenuTarget = { readonly card: PaymentMethod; readonly anchor: HTMLElement };

/**
 * Everything to do with one card, from its face or its ⋯: one menu for the
 * screen, anchored to whichever was pressed. The interest table is offered
 * only for a card linked to the card catalog, which is where its rates come from.
 */
export function CardMenu({
  target,
  aiAvailable,
  onClose,
  onAction,
}: {
  readonly target: CardMenuTarget | undefined;
  readonly aiAvailable: boolean;
  readonly onClose: () => void;
  readonly onAction: (action: CardMenuAction, card: PaymentMethod) => void;
}) {
  const { t } = useTranslation(['cards', 'common']);
  useCloseWhenDetached(target?.anchor, onClose);
  const lastAnchor = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (target !== undefined) lastAnchor.current = target.anchor;
  }, [target]);

  const card = target?.card;
  const act = (action: CardMenuAction) => () => {
    if (card !== undefined) onAction(action, card);
  };

  return (
    <DropdownMenu
      open={target !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuContent
        anchor={target?.anchor}
        arrow
        side="bottom"
        align="end"
        className="w-64 p-1.5"
        data-testid="card-menu"
        finalFocus={() => (lastAnchor.current?.isConnected === true ? lastAnchor.current : false)}
      >
        {card === undefined ? null : (
          <>
            <Item icon={Pencil} label={t('menu.edit')} onSelect={act('edit')} />
            {card.card?.catalog === undefined ? null : (
              <Item icon={Percent} label={t('menu.rates')} onSelect={act('rates')} />
            )}
            <Item icon={ReceiptText} label={t('menu.transactions')} onSelect={act('transactions')} />
            <Item
              icon={Sparkles}
              label={t('menu.import')}
              hint={aiAvailable ? undefined : t('common:addMenu.aiUnavailable')}
              disabled={!aiAvailable}
              onSelect={act('import')}
            />
            <DropdownMenuSeparator />
            <Item icon={Archive} label={t('menu.archive')} onSelect={act('archive')} />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Item({
  icon: Icon,
  label,
  hint,
  disabled,
  onSelect,
}: {
  readonly icon: ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>;
  readonly label: string;
  readonly hint?: string;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <DropdownMenuItem className="gap-3 px-2.5 py-2" disabled={disabled} onClick={onSelect}>
      <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint === undefined ? null : <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </DropdownMenuItem>
  );
}
```

The first test expects each item's `textContent` to be its label alone. With no account server the import item also carries its hint, but that case is a separate test that matches by regex.

- [ ] **Step 4: The face and the ⋯**

In `src/features/cards/cards-screen.tsx`:

- `CardPanel`'s `onEdit: () => void` prop becomes `onMenu: (anchor: HTMLElement) => void`.
- Delete the outline `<Button … onClick={onEdit}>…{t('edit.open')}</Button>` at the end of `CardPanel`. Drop the `Pencil` import if it is now unused.
- Inside the face `div` (`data-testid="card-face"`), as its first child, add the face's own button, stretched under the text:

```tsx
{
  /* The face is a button too: the larger target for the same menu as ⋯. */
}
<button
  type="button"
  aria-label={t('menu.label', { name: card.label })}
  onClick={(event) => {
    onMenu(event.currentTarget);
  }}
  className="absolute inset-0 rounded-2xl focus-visible:ring-3 focus-visible:ring-white/70 focus-visible:outline-none"
/>;
```

- Give the face's three content rows `pointer-events-none relative` so a tap anywhere on the face reaches that button, and keep the text a heading. The first row becomes:

```tsx
<div className="pointer-events-none relative flex items-start justify-between gap-3">
  <span className="text-sm font-medium opacity-90">
    {details?.issuer === undefined ? t('unknownIssuer') : t(`issuer.${details.issuer}`)}
  </span>
  <span className="flex items-start gap-1">
    {details?.network === undefined ? null : <NetworkLogo network={details.network} className="shrink-0" />}
    <button
      type="button"
      aria-label={t('menu.label', { name: card.label })}
      onClick={(event) => {
        onMenu(event.currentTarget);
      }}
      className="pointer-events-auto -me-3 -mt-3 flex size-11 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
    >
      <MoreHorizontal className="size-5" aria-hidden="true" />
    </button>
  </span>
</div>
```

The other two content rows get `pointer-events-none relative` added to their existing classes. Import `MoreHorizontal`.

- In `CardsScreen`:

```tsx
const navigate = useNavigate();
const account = useAccount();
const undoable = useUndoableWrite();
const [menuFor, setMenuFor] = useState<CardMenuTarget | undefined>(undefined);
const [section, setSection] = useState<'rates' | undefined>(undefined);
```

The `CardPanel` call passes `onMenu={(anchor) => { setMenuFor({ card, anchor }); }}` in place of `onEdit`. `setEditing(undefined)` in `MethodEditor`'s `onOpenChange` also calls `setSection(undefined)`, and `MethodEditor` gets `section={section}`. After `MethodEditor`, add:

```tsx
<CardMenu
  target={menuFor}
  aiAvailable={account.status !== 'unavailable'}
  onClose={() => {
    setMenuFor(undefined);
  }}
  onAction={(action, card) => {
    setMenuFor(undefined);
    switch (action) {
      case 'edit':
        setEditing(card);
        return;
      case 'rates':
        setSection('rates');
        setEditing(card);
        return;
      case 'transactions':
        void navigate({ pathname: ROUTES.feed, search: `?${PARAM.methods}=${encodeURIComponent(card.id)}` });
        return;
      case 'import':
        void navigate({ pathname: ROUTES.feed, search: `?import=1&via=${encodeURIComponent(card.id)}` });
        return;
      case 'archive':
        void undoable(
          async () => {
            await setPaymentMethodArchived(db, card.id, true, systemClock.nowIso());
            return {
              undo: async (at) => {
                await setPaymentMethodArchived(db, card.id, false, at);
              },
            };
          },
          t('menu.archived', { name: card.label }),
        );
        return;
    }
  }}
/>
```

Imports: `useNavigate` (`react-router-dom`), `useAccount` (`@/app/account`), `ROUTES` (`@/app/routes`), `PARAM` (`@/domain/feed-filters`), `setPaymentMethodArchived` (`@/db/repos/payment-methods`), `useUndoableWrite` (`@/features/feed/use-row-actions`), `CardMenu` and `type CardMenuTarget` (`./card-menu`).

- [ ] **Step 5: The interest table, opened directly**

In `src/features/cards/card-fields.tsx`, wrap the `<RateTable … />` element that catalog Task 7 added in:

```tsx
<div data-section="rates" tabIndex={-1} className="scroll-mt-4 rounded-xl focus-visible:outline-none">
  {/* the RateTable element, unchanged */}
</div>
```

In `src/features/cards/method-editor.tsx`, `MethodEditor` gains the prop `readonly section?: 'rates'`. Inside it:

```tsx
// Opened from a card's "Interest table": straight to the rates.
useEffect(() => {
  if (section !== 'rates' || target === undefined) return;
  const frame = requestAnimationFrame(() => {
    const rates = document.querySelector<HTMLElement>('[data-section="rates"]');
    rates?.scrollIntoView({ block: 'start' });
    rates?.focus();
  });
  return () => {
    cancelAnimationFrame(frame);
  };
}, [section, target]);
```

Here `target` is `MethodEditor`'s existing prop for the method being edited.

- [ ] **Step 6: The import, preset to the card**

In `src/features/transaction/use-transaction-sheet.ts`:

- Add `const VIA = 'via';` with the comment `/** Smart import for one card or account: its payment method id. */`.
- The import member of `SheetTarget` gains `readonly via?: string;`.
- In the parse, add `...(params.get(VIA) === null || params.get(VIA) === '' ? {} : { via: params.get(VIA) ?? '' })` to the import target.
- `write` adds `updated.delete(VIA)` and, for import, `if (next.via !== undefined) updated.set(VIA, next.via);`.

In `src/features/import/import-session.ts`, add:

```ts
/**
 * The session the import sheet opens on. Opened for one card ("Import a
 * statement" on the Cards screen), a new session, or one still at picking
 * files, takes that card as its batch method. A session already reading or
 * in review keeps its own: it belongs to files already chosen.
 */
export function startSession(
  existing: ImportSession | undefined,
  empty: ImportSession,
  via: string | undefined,
): ImportSession {
  if (via === undefined) return existing ?? empty;
  const base = existing ?? empty;
  if (base.stage !== 'pick') return base;
  return { ...base, batch: { ...base.batch, methodId: via } };
}
```

In `src/features/import/import-sheet.tsx`, import `startSession`, and change the session state's initializer to:

```tsx
const [session, setSession] = useState<ImportSession>(() =>
  startSession(readSession(), EMPTY_SESSION(presetProfileId), props.target.via),
);
```

Add the `menu` keys from the copy table to `src/i18n/locales/en/cards.json` and `he/cards.json`. Remove `edit.open` from both if `grep -rn "'edit.open'" src` finds nothing. `accounts.edit.open` in `common.json` is a different key and stays.

- [ ] **Step 7: Run the tests to see them pass**

Run:

- `pnpm exec vitest run --project dom src/features/cards src/features/transaction src/features/import`
- `pnpm exec vitest run --project db src/features/import/import-session.test.ts`

Expected: PASS.

Run: `pnpm exec playwright test e2e/14-cards.spec.ts e2e/card-catalog.spec.ts`
Expected: PASS. A step that pressed the old "Edit card" button now opens the card's ⋯ (`getByRole('button', { name: /Options for/ })`) and chooses "Edit card". Change only that step.

- [ ] **Step 8: Look at it.** In `pnpm dev`, in Playwright's Chromium at 390×844 and 1280×800, in English and in Hebrew:
  - tap a card face, then its ⋯;
  - check the menu sits under what was pressed, with the arrow pointing at it;
  - check the ⋯ sits in the top inline-end corner (top left in Hebrew);
  - check that "Interest table" lands on the rates in the editor.

- [ ] **Step 9: Gate.** Run `pnpm verify`. Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add src/features/cards src/features/transaction/use-transaction-sheet.ts src/features/transaction/use-transaction-sheet.test.tsx src/features/import src/i18n/locales
git commit -m "Each card opens a menu from its face or its corner: edit, rates, its transactions, a statement, archive" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The browser gates, the README, and the screenshot review

**Files:**

- Modify: `e2e/08-polish.spec.ts` (Hebrew at 320px; every pop-out item at 44px)
- Modify: `e2e/07-a11y.spec.ts` (an axe scan with pop-outs open, blocking)
- Modify: `e2e/screens.spec.ts` (Cards joins the matrix)
- Modify: `README.md` (`## Design decisions`)

**Interfaces:**

- Consumes the accessible names and test ids the earlier tasks produced:
  - `add-button`, `prime-pill`, `balance-amount` and `feed-header`;
  - "Show what makes up Balance" and "Show what makes up Expected this month";
  - `Actions for …`, `Category: … Change it`, `Not counted yet. Change it`;
  - `Options for …`, and "Next month".

- [ ] **Step 1: Hebrew at 320px**

In `e2e/08-polish.spec.ts`, inside the `@narrow` loop's `describe`, add:

```ts
test('the panel wraps its pills and steps the balance down, in Hebrew too', async ({ page }) => {
  await completeFirstRun(page, 'he');
  await page.goto('/');
  await expect(page.getByTestId('feed-header')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  // Nothing sideways, with the longest copy the panel carries.
  const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // Every pill on the panel sits inside the viewport: they wrap rather than overflow.
  const outside = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-slot="brand-panel"] button')]
        .map((el) => el.getBoundingClientRect())
        .filter((box) => box.width > 0 && (box.left < 0 || box.right > window.innerWidth + 0.5)).length,
  );
  expect(outside).toBe(0);

  // 2.75rem (44px) on a phone, a step down (2.25rem, 36px) below 360px.
  const size = await page
    .getByTestId('balance-amount')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBe(page.viewportSize()!.width < 360 ? 36 : 44);
});
```

In the `WIDTHS` loop's `'never scrolls sideways on any route'` test, keep the route list. `/cards` is already in it.

- [ ] **Step 2: Every pop-out item at 44px**

Add to `e2e/08-polish.spec.ts`:

```ts
test.describe('@popouts every item clears 44px on a phone', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  /** Items of whatever pop-out is open now that are shorter than 44px. */
  async function shortItems(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const bad: string[] = [];
      const items = document.querySelectorAll(
        '[data-slot="dropdown-menu-content"] [role="menuitem"], [data-slot="popover-content"] button',
      );
      for (const el of items) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        if (box.height < 44)
          bad.push(`${(el.textContent ?? '').trim().slice(0, 30)} ${String(Math.round(box.height))}px`);
      }
      return bad;
    });
  }

  async function check(page: Page, open: () => Promise<void>, what: string): Promise<void> {
    await open();
    await expect(
      page.locator('[data-slot="dropdown-menu-content"], [data-slot="popover-content"]').first(),
    ).toBeVisible();
    expect(await shortItems(page), what).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(
      page.locator('[data-slot="dropdown-menu-content"], [data-slot="popover-content"]'),
    ).toHaveCount(0);
  }

  test('on the feed and on Cards', async ({ page }) => {
    await completeFirstRun(page, 'en');
    await page.goto('/');
    await expect(page.getByTestId('feed-header')).toBeVisible();

    await check(page, () => page.getByTestId('prime-pill').click(), 'prime');
    await check(
      page,
      () => page.getByRole('heading', { level: 2 }).getByRole('button').first().click(),
      'month',
    );
    await check(
      page,
      () => page.getByRole('button', { name: /Show what makes up Balance/ }).click(),
      'balance',
    );
    await check(
      page,
      () => page.getByRole('button', { name: /Show what makes up Expected/ }).click(),
      'forecast',
    );
    await check(
      page,
      () =>
        page
          .getByRole('button', { name: /^Actions for/ })
          .first()
          .click(),
      'row ⋯',
    );
    await check(
      page,
      () =>
        page
          .getByRole('button', { name: /^Category: / })
          .first()
          .click(),
      'category',
    );

    // Next month is all forecast, so its rows are "not counted yet".
    await page.getByRole('button', { name: 'Next month' }).click();
    await check(
      page,
      () => page.getByRole('button', { name: 'Not counted yet. Change it' }).first().click(),
      'not counted yet',
    );

    await page.goto('/cards');
    await check(
      page,
      () =>
        page
          .getByRole('button', { name: /^Options for/ })
          .first()
          .click(),
      'card ⋯',
    );
  });

  test('a scroll closes an open pop-out', async ({ page }) => {
    await completeFirstRun(page, 'en');
    await page.goto('/');
    // A popover, not a menu: base-ui menus are modal and lock page scroll while
    // open, so only a popover can be scrolled away from.
    await page
      .getByRole('button', { name: /^Category: / })
      .first()
      .click();
    await expect(page.locator('[data-slot="popover-content"]')).toBeVisible();

    await page.mouse.wheel(0, 600);
    await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
  });
});
```

Run: `pnpm exec playwright test e2e/08-polish.spec.ts`
Expected: PASS, including every existing `@collapse` and `@keyboard` test. `@collapse` relies on `feed-header`, `collapsed-summary` and its 48px-plus-inset height, all unchanged by Task 4.

- [ ] **Step 3: Axe with the pop-outs open**

Add to `e2e/07-a11y.spec.ts`, after the `BLOCKING` loop:

```ts
test('@a11y BLOCKING the feed pop-outs, open', async ({ page }) => {
  await completeFirstRun(page, 'he', { theme: 'dark' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const openers = [
    () => page.getByTestId('prime-pill').click(),
    () => page.getByRole('heading', { level: 2 }).getByRole('button').first().click(),
    () =>
      page
        .getByRole('button', { name: /^פעולות עבור/ })
        .first()
        .click(),
    () =>
      page
        .getByRole('button', { name: /^קטגוריה: / })
        .first()
        .click(),
  ];
  for (const open of openers) {
    await open();
    const results = await new AxeBuilder({ page })
      .withTags(TAGS)
      .include('[data-slot="popover-content"], [data-slot="dropdown-menu-content"]')
      .analyze();
    expect(results.violations, summarise(results)).toEqual([]);
    await page.keyboard.press('Escape');
  }
});
```

The Hebrew names are `a11y.rowActions` ("פעולות עבור {{name}}") and `categoryPop.chip` ("קטגוריה: {{name}}. לשינוי", Task 10) in `he/common.json`.

Run: `pnpm exec playwright test e2e/07-a11y.spec.ts`
Expected: every BLOCKING test passes. Read the REPORTING output for anything new on the panels (white text on sapphire) and fix any token-level cause in `src/index.css`, adding its pair to `contrast.test.ts`.

- [ ] **Step 4: Cards joins the screenshot matrix**

In `e2e/screens.spec.ts`, add `{ name: 'cards', path: '/cards' },` to `ROUTES` after `chart`. Change the doc comment's "The 16-image screenshot matrix: 4 routes" to "The 20-image screenshot matrix: 5 routes".

- [ ] **Step 5: The README**

In `README.md`, under `## Design decisions`, replace the paragraph `**The FAB is first in the DOM.** …` with:

```md
**The Add pill is first in the DOM.** It is `position: fixed`, so markup order
does not move it on screen — but it decides tab order, and rendered last it sat
after every transaction row. The keyboard walkthrough found it; nothing looked
wrong. It says "Add" rather than showing a bare plus, and its menu presets the
form to an expense or income (`?add=expense|income`; `add=1` from older links
still means an expense).
```

and add after it:

```md
**The brand is sapphire; green means money coming in.** `--brand-deep`
(#0F3A8A, #0B2C6B in dark mode) is the engraved panel at the top of every
screen, carried in from the front door; `--income` stays green and `--expense`
red, and nothing else in the app is either. Every token pair is checked by
`src/lib/contrast.test.ts`, and the colours that live outside the token file
(the status bar's `theme-color`, the favicon, the PWA icon background) by
`src/lib/brand-colours.test.ts`.

**The panel's figures are in the serif, and still tabular.** Frank Ruhl Libre's
Latin subset ships `tnum`, so the counting-up balance never jitters. Amount
columns stay in the sans stack, whose order is load-bearing (below).

**A pop-out in the feed is one instance at screen level, anchored to its row.**
The feed is virtualised: a menu per row would unmount mid-gesture when its row
left the rendered range. One instance points at the row's control through
base-ui's `anchor` and closes on scroll or when that control leaves the page.
The category change and "Charged today" go through the edit form's own
series-edit path, and their Undo restores every row they touched.
```

In `### What the suite cannot check`, after the sentence beginning "Both were performed by hand", add:

```md
The sapphire redesign's screenshot matrix (`e2e/screens.spec.ts`, now with
Cards) was reviewed by eye on <the date you do Step 6>.
```

Replace `<the date you do Step 6>` with the actual date, in the same `**YYYY-MM-DD**` form the paragraph above uses, when you do the review in Step 6.

- [ ] **Step 6: Take the screenshots, and look at them**

Run: `pnpm exec playwright test e2e/screens.spec.ts`
Expected: 20 passing tests, and 20 images in `artifacts/screens/`.

Open every image with the Read tool, one at a time, and check each of the following. Fix what fails in the task that owns it, then retake.

- The panel is sapphire, with the engraving at the inline-start top corner: top left in English, top right in Hebrew.
- The sheet's rounded top overlaps the panel with no gap.
- In dark mode the panel is `#0B2C6B` and the sheet is the dark page.
- The balance is in the serif and does not clip. In Hebrew the ₪ is on the correct end.
- No icon chip is green. Income amounts are green and expense amounts are not.
- The Add pill reads "Add" / "הוספה", centred above the tab bar.
- The active tab has its soft sapphire pill.
- On Cards, the ⋯ sits in each face's top inline-end corner, and there is no outline "Edit card" button.
- Nothing is cut off in Hebrew.

- [ ] **Step 7: The full gate**

Run `pnpm verify`, then `pnpm test:e2e`.
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add e2e/07-a11y.spec.ts e2e/08-polish.spec.ts e2e/screens.spec.ts README.md
git commit -m "The browser gates cover the pop-outs and Hebrew at 320px, and the README explains the sapphire design" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Going live is the controller's job after the final review: merge, push, `pnpm release`. There is no migration, no edge function, and no change to stored data.
