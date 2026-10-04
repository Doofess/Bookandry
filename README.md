# Bookandry

A local-first personal money manager. Multi-profile income and expense tracking,
multi-currency with the rate snapshotted at save time, a virtualised transaction
feed, a scatter chart, English and Hebrew with full RTL.

Account first, local underneath: you sign in (or create an account) before
anything else, and your data is your account - on every device you sign in on,
safe when one is lost. Each device keeps a full copy in the browser, so the app
is fast and works offline once signed in. See [Accounts](#accounts).

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
| `pnpm test:e2e`          | Playwright, against real builds: local-only (4173) and production (4174)   |
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
- **End-to-end encryption.** It was built (a passphrase and a recovery
  key, 2026-09-27) and taken out again two days later: a key to type on every
  new device asked too much of people for a household ledger. Signing in, with
  a second factor on the account, is the protection. The machinery for secret-
  held keys is still in `src/services/crypto` if it is ever wanted back.
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

**An expense has a TYPE, not a repeat frequency.** The five are the ones an
Israeli already uses: עסקה רגילה, עסקת תשלומים, עסקת קרדיט, הוראת קבע, הלוואה. Four of
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

**A הלוואה is the same לוח שפיצר for money borrowed.** Stored as a plan
(`plan: 'loan'`) with its own rate, typed from the loan agreement rather than
taken from a card, up to 360 payments so a mortgage fits, and paid with any
method — the bank's debit, cheques, cash. Its repayments are filed under the
built-in Loans category unless one is picked by hand, and have their own group
in the month's breakdown. The money received is not recorded: the feed tracks
what leaves the account. CPI-linked (צמוד מדד) loans are not modelled.

**A credit card bills monthly, so its purchases leave the account later.** A
credit card can carry what its company shows about it: the card company
(Isracard, Cal, Max, Amex, Diners), network, bank or non-bank card (כרטיס
בנקאי / חוץ בנקאי), level, club, the month it expires, its billing day (מועד
חיוב, usually the 2nd, 10th or 15th), credit limit, monthly card fee,
foreign-currency fee, and its קרדיט and late-payment interest (prime + margin,
or fixed). Never its number or the code on its back (`gate:pci`). With a
billing day set, a month's purchases are charged together on that day of the
next month: the Balance counts them then - the day the money actually leaves
the bank - and its breakdown shows what is bought and not yet charged. An
instalment is a purchase of its own month. The foreign-currency fee is added to
the converted amount when a purchase in another currency is saved, and kept on
the money snapshot (`feeRate`) so a reconversion applies it again. The Cards
screen shows each card's next bill, the month building up, past bills with
their purchases, and how much of the limit is used - including every
instalment still to come, as the card company counts it. The monthly card fee
(דמי כרטיס) is a line on the card at each month's end, from the month it was
set - worked out, not saved, so it is changed on the card - with an optional
discount for a month the card is used for at least a set amount (100% waives
it), usually for a year (`until`). It is in the feed, the balance (on the bill)
and the chart, in a shekel base only; a shared card's fee is in the
household's view. Not modelled: cycles that close on a day other than the end
of the month.

**Prime is fetched, never typed.** Israeli prime is the Bank of Israel's rate
plus 1.5. The app keeps the Bank's rate on the device (`meta`, not synced),
asks the `prime-rate` relay for it at start, when the app comes back into view
or online, and hourly, and asks again on the day a decision is due; the relay
caches for fifteen minutes. A build ships its own last-known figure for a device
that has never been online, shown with its date. A loan is priced at prime plus
its margin (signed: P−0.5 is ordinary) or at a fixed rate, and keeps the rate it
was priced at, like an exchange rate. A prime-linked loan does **not** re-price
itself when prime moves: its stored repayments stay as entered, and the margin
is kept on the plan so a future version can.

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

## Accounts

Required. The app works the way a bank's app does: **your data is your
account**. The first screen is the sign-in; nothing of the app is shown before
it. Signing in to an account that has data opens the app with it; creating an
account (or signing in to an empty one) leads to the setup wizard. There is no
"sync" to turn on, watch or press. Each device still keeps a full local copy —
the app stays fast and works offline — and keeps it in step with the account in
the background.

- **A new device** fetches the account's data before deciding anything, so a
  returning person is never offered the setup wizard while their data is on
  its way.
- **Data from before accounts** (a device used signed out) is added to the
  account it signs in to.
- **A build without Supabase configured** (a fork; the e2e suite's local build,
  `pnpm build:local`) has no accounts at all and is the local-only app. The
  e2e suite drives the app screens through it, since a test cannot sign in to
  a real account, and the account screens through the production build.

- **Signing out takes the data off the device.** The account keeps it. If some
  changes have not reached the account yet (offline), signing out says so
  first.
- **A device whose session ends any other way** — locked after inactivity, or
  signed out from another device — keeps the data but shows only the front
  door until the same account signs in again. Signing in with a different
  account removes it first.
- **One front door for everyone** (`src/features/account/welcome-screen.tsx`,
  `auth-layout.tsx`): a first visit, a returning person and a locked device
  all see the same sign-in page, and it says nothing about what the device
  holds or how it is protected. The security is done, not explained.
- **The account menu** (`src/features/account/user-menu.tsx`): the person's
  picture at the top end of every screen holds every settings page (account,
  sign-in and security, preferences, commitments, categories, payment
  methods, backup), appearance and language switches, and signing out, last.
  Settings is no longer a tab; `/settings` lists the same pages.
- **Profile pictures**: squared and shrunk to 256 px WebP in the browser
  (location and camera details never leave), kept in the private `avatars`
  Storage bucket, one folder per account, readable and writable only by that
  account and only after the second step
  (`supabase/migrations/20261003000000_avatars.sql`). Each device keeps a copy
  for offline. Without one, Google's picture (Google sign-ins) or initials.
- **Lock after inactivity**, per device: 5 minutes, 15 (the default), an hour,
  a day, or never. The session ends on the server too, not just on screen.
- **Deleting the account** deletes everything it holds, and this device's copy.
- **Two-step sign-in**, optional: a code from an authenticator app after the
  password (or Google). Enforced by the database, not just the screens: every
  function refuses an account with codes turned on unless the session has
  given one (Supabase's `aal2`), and no table can be read directly.
  (`supabase/migrations/20260930000000_second_step.sql`)
- **Passkeys**: sign in with the device's fingerprint, face or screen lock, no
  password. Added and removed in Settings. A passkey is a first factor here; an
  account with codes on still asks for the code after one.
- **Google** hands its answer straight back to bookandry.com, never by way
  of Supabase's own address, so Google's page says "to continue to
  bookandry.com". The answer is a signed ID token, which Supabase checks and
  exchanges for a session; a nonce only the browser that started the sign-in
  holds makes a token lifted from elsewhere useless.
  (`src/services/supabase/id-token.ts`)

What the server holds, per row: a blinded id (an HMAC of table and id), a
revision, a key version, and AES-256-GCM ciphertext of the table, the id, the
row and whether it was deleted. The first device makes the data key and the
account keeps it; every other device fetches it on sign-in.

### Threat model

- **The account is the lock.** Whoever can sign in as the person gets
  everything. Use a passkey, or a strong password with two-step sign-in on.
  Google accounts also have Google's own protections. Losing the
  authenticator app with no passkey means asking the project's operator to
  remove the factor (Authentication → Users in the Supabase dashboard).
- **The server operator, or a breach of the database, can read and change the
  data.** The data key sits in the same database as the ciphertext. The
  encryption keeps rows unreadable to anything that sees only the records
  table (a leaked export of it, a log), and it catches a server replaying a
  row older than one a device has already seen; it is not end-to-end, and it
  does not protect against whoever holds the database.
- **A lost device.** "Sign out all other devices" ends every other session;
  the lost one shows its sign-in screen from then on, and getting past it
  needs the password (and the second factor). Supabase access tokens already
  issued stay valid until they expire, up to an hour. The data on it is not
  encrypted at rest, so someone who takes the storage apart can read it.
- **A shared device.** Signing out removes the data; a different account
  signing in removes the previous one's first. One person's data never reaches
  another's account.
- **Script running in this page** (XSS) can read the local data and use the
  keys while it runs. The Content-Security-Policy (`dist/_headers`, built by
  `src/lib/security-headers.ts`, run under in `e2e/11-csp.spec.ts`) exists to
  stop such a script from running at all. The Supabase session lives in
  `localStorage`, readable by such a script — accepted, for the same reason.

Accounts set up in the two days of passphrase-held keys move over by
themselves, on whichever device signs in first: it makes a new key the account
holds, and every device re-sends what it has.

### Code map

| Where                                            | What                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| `src/db/sync/middleware.ts`                      | every write records itself for sync, in the same transaction      |
| `src/db/sync/engine.ts`, `apply.ts`, `outbox.ts` | push, pull, last-write-wins merge, repair                         |
| `src/services/crypto/`                           | AES-GCM, HKDF, Argon2id, key wrapping, recovery keys, passkey PRF |
| `src/db/sync/codec.ts`                           | seals and opens records between the engine and the server         |
| `src/db/sync/account.ts`                         | getting a device the account's key; moving it to a new one        |
| `src/app/idle-lock.ts`, `account-gate.tsx`       | locking after inactivity; the sign-in screen in front of the data |
| `supabase/migrations/`                           | tables, row-level security, and the only write path               |
| `src/app/account.ts`, `sync-runner.ts`           | session, key state, when to keep in step                          |
| `src/features/account/`                          | the screens                                                       |

The SQL is tested on real Postgres in-process (PGlite, `src/test/pg-harness.ts`)
— rules, grants and row-level security, and the full two-device path from
Dexie through the codec to the SQL. No Docker needed.

### Supabase project checklist

Configuration that lives in the dashboard, not in this repo:

- Run `supabase/migrations/*.sql` (SQL editor, or `supabase db push`).
- **Authentication → Providers → Email**: confirm email ON; secure password
  change ON; leaked-password protection ON (Pro plan).
- **Authentication → Providers → Google**: client id and secret — the secret
  lives only here, never in this repo or `.env.local`. Skip nonce check OFF.
- **Google Cloud → the OAuth web client → Authorized redirect URIs**: add
  `https://bookandry.com/auth/callback` (keep the supabase.co callback, for
  builds without `VITE_GOOGLE_CLIENT_ID`). **Branding**: app name
  Bookandry; home page `https://bookandry.com`; privacy policy
  `https://bookandry.com/privacy`; terms `https://bookandry.com/terms`
  (`public/privacy.html`, `public/terms.html`: plain pages, open without
  signing in); authorized domain `bookandry.com`, verified in Search Console.
  Verifying the brand shows the name and logo too.
- **Authentication → Multi-Factor**: App Authenticator (TOTP) enabled (the
  default).
- **Authentication → Passkeys**: enabled; relying party ID `bookandry.com`,
  display name `Bookandry`, origin `https://bookandry.com`. The ID is
  permanent in practice: changing it strands every passkey already made.
- **Authentication → Emails → SMTP Settings**: custom SMTP on (Resend:
  `smtp.resend.com`, port 465, user `resend`, the API key as the password —
  entered here only), sender `no-reply@bookandry.com`, name `Bookandry`.
  Without it Supabase sends as "Supabase Auth", and **only to members of the
  project's team**: nobody else gets a confirmation or reset email.
- **Authentication → Emails → Templates**: "Confirm sign up" and "Reset
  password" take the subject and body from `supabase/templates/`
  (`pnpm emails` rebuilds them and `public/email/`; deploy before pasting, as
  the emails load their images from the site). Each email comes in the
  account's language, kept in `user_metadata.language`.
- **Edge Functions → Secrets**: `ANTHROPIC_API_KEY`, for `categorize`
  (`supabase/functions/categorize/`), which picks a category from what was
  typed ("Claude Max Plan" → AI & software). Entered here only. Without it
  the function answers 503 and the person picks the category, as before.
  Optional `CATEGORIZE_MODEL` overrides the model (Claude Haiku 4.5).
- **Edge Function `prime-rate`** (`supabase/functions/prime-rate/`), deployed
  with `--no-verify-jwt`: public data, no secrets. It relays the Bank of
  Israel's rate (its public API, with the SDMX statistics series as a
  fallback), because the Bank's API sends no CORS headers.
- **Authentication → URL Configuration**: Site URL `https://bookandry.com`;
  redirect URLs `https://bookandry.com/settings` (plus a localhost one for
  development only).
- `.env.local` holds only public values: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_GOOGLE_CLIENT_ID`. Never the service-role key, and never the `client_secret_*.json` Google
  lets you download.

### Known limitations

- Instalment plans are read-only in the editor. Re-splitting an existing plan
  would break the sum-to-total invariant.
- Built-in categories can be archived but not renamed or deleted: they store an
  i18n key, so a rename would have to fork them into custom rows.
- Turning reduced-motion **off** mid-session leaves the last animated figure on
  screen until the value next changes.
- Flags are rendered as code badges, not emoji. Windows ships no flag glyphs.
