# Bookandry

A local-first personal money manager. Multi-profile income and expense tracking,
multi-currency with the rate snapshotted at save time, a virtualised transaction
feed, a scatter chart, English and Hebrew with full RTL.

Everything stays in the browser. There is no server, no account and no sync.

---

## Setup

Requires **Node 26** and **pnpm 12**. Node 25 is EOL and Node 24 entered
maintenance in October 2026; corepack was unbundled from Node 25, so pnpm is
installed directly rather than enabled.

```bash
pnpm install
pnpm dev             # http://localhost:5173
```

| Command                  | What it does                                                               |
| ------------------------ | -------------------------------------------------------------------------- |
| `pnpm verify`            | typecheck, lint, format, the three gates, tests + coverage, build          |
| `pnpm verify:full`       | the above plus a hostile-timezone run, knip, and the full Playwright suite |
| `pnpm test`              | unit, db and dom projects                                                  |
| `pnpm test:e2e`          | Playwright, against a real `build` + `preview`                             |
| `pnpm exec lhci autorun` | Lighthouse, four routes, median of three runs                              |

`pnpm verify` is the gate at every phase boundary. `verify:full` is slower and
runs at the checkpoints.

### What the suite cannot check

`e2e/09-pwa-offline.spec.ts` takes the PWA as far as a machine can: it starts its
own preview server, installs the service worker, **kills the server**, and then
asserts the app still renders, still resolves a deep route through
`navigateFallback`, and still has its data. DevTools' Offline checkbox only lies
to the page about the network; a dead port cannot be fooled.

Two things stay manual, and neither is a gap in coverage — they are outside what
any driver can reach:

- **The install click.** The omnibox install icon, its confirmation and the
  standalone window are browser chrome, not page content. `beforeinstallprompt`
  is the signal behind that icon, and headless Chromium never fires it — so the
  spec omits it rather than ship an assertion that can only ever skip.
- **The keyboard journey.** The specs check tab order, focus rings and the focus
  trap; whether the journey makes sense without a pointer is a judgement.

Both were performed by hand against this build on **2026-09-17**, along with a
native-speaker review of the Hebrew copy. They are recorded here rather than
implied, because a reader cannot otherwise tell a check that was done from one
that was only described — and they need redoing whenever the shell, the focus
order or the copy changes.

### The three bespoke gates

Lint cannot express these, so they are scripts.

- **`gate:rtl`** — bans physical-direction utilities (`ml-`, `left-`,
  `text-left`, …) across `className`, template literals, `cn`/`cva`/`clsx` and
  plain CSS, **including `components/ui/**`**. Tailwind v4 has no `corePlugins`
  to disable them with, and covering the generated primitives is the whole
  point: they are where physical classes arrive.
- **`gate:money`** — bans `parseFloat`, `.toFixed(`, `* 100` and `/ 100` outside
  `src/lib/money.ts`. Block-comment aware, with a `money-allow` escape hatch for
  the handful of lines that are arithmetic on pixels or counts rather than on
  money.
- **`gate:pci`** — bans card numbers, expiry dates, CVV, IBAN, SWIFT and routing
  numbers from `src/**` and `e2e/**`, scanning i18n JSON as well as source.
  Payment methods store a user-chosen **label** only. There is no escape hatch,
  deliberately.

---

## Architecture

One-way layering, enforced by lint:

```
types → lib → i18n → domain → {db, services} → features → app
                              store/, components/  ← leaves
```

- **`lib/`** — money, dates, ids, colour. Pure. No clock: `new Date()` and
  `Date.now()` are banned outside `lib/clock.ts`, so nothing can silently depend
  on when the tests happen to run.
- **`domain/`** — occurrence expansion, the calculators, the chart generator,
  form parsing. Pure, and unaware that IndexedDB exists.
- **`db/`** — Dexie, repositories, the transfer format, cross-tab locks.
- **`services/rates/`** — HTTP only, zero Dexie. Split from `db/repos/rates.ts`
  to break a cycle the original design guaranteed.
- **`features/`** — screens and their hooks. `useLiveQuery` lives here and in
  route containers only, never in a leaf: one IndexedDB subscription per feed
  row would be thousands of observers on a list being flung past.

### Three memo layers, deliberately different dependencies

5,000 transactions across ten years of monthly series is ~600,000 occurrence
objects. The answer is not to compute it faster, it is to refuse to compute it:

| Layer | Work                   | Depends on                                    |
| ----- | ---------------------- | --------------------------------------------- |
| A     | Dexie interval query   | profile + window — **not filters**            |
| B     | occurrence expansion   | candidates + window + today — **not filters** |
| C     | filter, group, flatten | everything, over ≤ 2k items                   |

Typing in the search box must not touch IndexedDB and must not re-expand a
single series. Collapse the layers and every keystroke re-queries the database.

No worker: structured-cloning 600k objects costs more than computing them, so it
would only help in the case where it also cannot help.

`src/domain/scale.test.ts` runs this at the size it is claimed about — 5,000
series that have been recurring for ten years — because every other test in the
suite runs at a few dozen rows, where the distinction cannot fail. It asserts the
invariant rather than a frame rate: a month costs one occurrence per series, not
one per month lived. The regression it exists for is an expander that walks
forward from the series start, which returns the **right answer** ~120× too
slowly and leaves every correctness test in the repository green.

### Money

Integer minor units everywhere. Exponents come from a **frozen, committed ISO
4217 table**, never from `Intl` — `resolvedOptions().maximumFractionDigits`
returns CLDR minor units, which vary by ICU build. `amountMinor` is storage: two
browsers disagreeing about the exponent means the same integer denotes two
different amounts.

Rounding is **half away from zero**, matching `Intl`'s default `halfExpand`, so
stored and displayed values never disagree, and `convert(−x) === −convert(x)`
holds. One rounding per conversion, never an intermediate.

### Dates

Hand-rolled string maths on `"YYYY-MM-DD"`, no dependency. `date-fns` is
actively wrong here: `new Date("2026-01-31")` parses as **UTC**, so west of UTC
the local getters read January 30 before any arithmetic happens. Temporal is not
viable yet.

Two clocks, and conflating them is a real bug: `todayLocal()` reads the
**device-local** calendar date, while every `Intl.DateTimeFormat` call on a
stored date passes `timeZone: "UTC"` so the rendered day does not shift per
viewer.

---

## Non-goals

- **Budgets.** The two headline numbers are a balance and an expectation, not an
  allowance. "Remaining" was renamed to "still due" for exactly this reason.
- **Split expenses and transfers.** The product answer is a Household profile
  plus a shared payment method, offered during onboarding. "I paid you back" is
  an expense on A and an income on B, which nets correctly in "All" — at the
  cost of inflating both stat cards.
- **Sync, accounts, multi-device.** Export is the only durability story, which
  is why the Data card nags after a month without one.
- **CSV.** JSON export only; it round-trips, and a CSV of a recurring series is
  a lie about the data model.
- **Rate backfill.** A transaction's rate is snapshotted when it is saved and
  never revisited.
- **Cross-session undo.** The undo toast and the 24-hour tombstone window are
  the whole recovery story.
- **Privacy between profiles.** Profiles are _organisation, not privacy_. There
  is no sign-in; everyone using the device sees everything. The onboarding says
  so in as many words.
- **A localised install name.** The PWA name is "Bookandry" in both languages, and
  the brand stays Latin inside Hebrew copy too.

---

## Design decisions

The ones that would look like bugs without an explanation.

**The database is still called `greenback`.** The app was Greenback before it
became Bookandry (bookandry.com). Every user-visible name changed; the storage
identifiers did not. IndexedDB finds a database by name, so renaming it would
open an empty one on every existing install - the app would restart at the
first-run wizard with the user's data orphaned under the old name. The
`gb.boot` mirror and the `greenback.*` Web Lock names stay for the same
reason. New backups say `"app": "bookandry"`; import still reads
`"greenback"`, because a backup that stops restoring when the app changes its
name is not a backup.

**Occurrences reuse the parent's rate snapshot.** A recurring transaction stores
one rate, and every occurrence it emits uses it. Deriving a per-occurrence rate
would make the headline balance a function of IndexedDB cache warmth — the same
data, on the same device, showing a different number after a cache purge.

**The balance line on the chart stops at today.** Projected bills are still
drawn as dots, because they exist and hiding them makes the month look emptier
than it is. But the balance card excludes projections by construction, and a
line running past today would report a different balance from the card directly
above it.

**Monthly recurrence clamps non-stickily.** A series on the 31st yields
`01-31, 02-28, 03-31, 04-30` and **returns to the 31st** after February.
Iterative `addMonths` gives `Jan31 → Feb28 → Mar28` and loses the 31st forever.

**An expense has a TYPE, not a repeat frequency.** The four are the ones an
Israeli already uses: עסקה רגילה, עסקת תשלומים, עסקת קרדיט, הוראת קבע. Three of
them collapse onto recurrence the data model already had — a הוראת קבע _is_
monthly or yearly recurrence — so the mode carries the user's word for the thing
and the storage stays one shape. Income keeps the plain repeat vocabulary: a
salary arrives every month and is nobody's standing order.

**קרדיט is priced as a לוח שפיצר; תשלומים is not priced at all.** They are the
same arrangement — a purchase split over N monthly payments — differing only in
the interest the issuer adds. The rate belongs to the **card**: it is set once
in the payment method, and the form fills it in when קרדיט is chosen (and
re-fills it when the card changes), editable per purchase for a promotional
rate. The payment is the level Spitzer payment, `PV·r(1+r)^n / ((1+r)^n − 1)`
with `r` the annual rate over twelve, computed in exact integer arithmetic with
one rounding. What is stored is what the card will charge: ₪1,200 over 6 at 12%
is six payments of ₪207.06, and the form shows the total and the interest in
shekels before saving. The rate is **snapshotted** onto the plan, like an
exchange rate, so changing the card's rate next year never re-prices a plan
already running. An empty rate, or zero, makes a קרדיט plan exactly תשלומים.

What is not modelled: issuer fees, and rates that differ from the nominal
annual rate divided by twelve. The payment shown is the textbook one; a
statement that differs by an agora or two is the issuer's rounding, not a bug
here.

**The standing-order frequency has no default.** Monthly is the likelier answer
and preselecting it would still be wrong: arnona and most insurance policies are
yearly, and a default that is right most of the time is exactly how the wrong one
gets saved without ever being read. The error waits for a save attempt rather
than firing the instant the type is chosen, which would be scolding someone for
not yet having done the thing they were just asked to do.

**Instalments (תשלומים) sum to the total exactly.** ₪1,000 over 3 payments is
₪333.34 + ₪333.33 + ₪333.33, the first absorbing the remainder, which is the
Israeli card convention. Interest-free means the parts must equal the whole.

**Changing the base currency recomputes from the original amount**, never from
the stored base amount. Round-tripping is lossy: `1.000 KWD → ¥501 → 1.001 KWD`.
It forces an export first, and refuses while another tab holds the lock.

**The chart's aggregation is a mode flag on one generator**, not a second
implementation. The two modes differ in one expression — the bucket key — so
`sum(aggregated) === sum(expanded)` holds by construction rather than by being
tested into agreement.

**The plot is an LTR island inside an RTL page.** A chart is a coordinate
system, not prose: time runs left to right in Hebrew too. The legend, captions
and stat cards are prose and stay in page direction.

**Kind is encoded by shape as well as colour** — a circle for income, a diamond
for expense. Red against green is 1.6–1.8:1 dot to dot, which fails WCAG 1.4.1
outright.

**The FAB is first in the DOM.** It is `position: fixed`, so markup order does
not move it on screen — but it decides tab order, and rendered last it sat after
every transaction row. The keyboard walkthrough found it; nothing looked wrong.

**Amounts render in a `dir="ltr"` island with `data-value` carrying the
integer.** CLDR's Hebrew currency pattern injects two right-to-left marks and
puts the symbol after the number; left to inherit page direction, a leading
minus jumps to the far end. Every test asserts the integer, never the formatted
string — pinning `"$1,234.50"` breaks the next time ICU moves a separator.

**The font stack order is load-bearing.** `'Inter Variable', 'Heebo Variable', …`
— fallback is per-glyph, so digits resolve to Inter (which ships tabular
figures) while Hebrew falls through to Heebo (which does not). Putting Heebo
first silently breaks every amount column in Hebrew.

### Known limitations

- Instalment plans are read-only in the editor. Re-splitting an existing plan
  would break the sum-to-total invariant.
- Built-in categories can be archived but not renamed or deleted: they store an
  i18n key, so a rename would have to fork them into custom rows.
- Turning reduced-motion **off** mid-session leaves the last animated figure on
  screen until the value next changes.
- Flags are rendered as code badges, not emoji. Windows ships no flag glyphs.
