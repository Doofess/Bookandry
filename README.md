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

The sapphire redesign's screenshot matrix (`e2e/screens.spec.ts`, now with
Cards) was reviewed by eye on **2026-10-09**.

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
  deliberately. Two exceptions the user asked for: a card keeps its **last four
  digits** (`card.lastDigits`) - what every card company and statement prints,
  shown in the feed beside each purchase and used to match a statement's rows
  to their card - and a bank account keeps its bank, branch and account number -
  what is printed on every cheque and given to anyone who sends money to it.
  Never the rest of a card's number, a password, a code, or anything else that
  moves money.

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
instalment still to come, as the card company counts it. That same money is
the card's **total commitments** (סך הכל התחייבויות בכרטיס): purchases waiting
for their bill plus every remaining payment of its תשלומים, קרדיט and loan
plans, as charged, with the interest inside them shown apart - the present
value of each plan's remaining payments at its own rate is the principal still
owed, and the rest is interest. The total across everyone's cards, and each
card's share of it, heads the screen. Plans are followed to their
last payment, however far off. The monthly card fee
(דמי כרטיס) is a line on the card at each month's end, from the month it was
set - worked out, not saved, so it is changed on the card - with an optional
discount for a month the card is used for at least a set amount (100% waives
it), usually for a year (`until`). It is in the feed, the balance (on the bill)
and the chart, in a shekel base only; a shared card's fee is in everyone's
view. Not modelled: cycles that close on a day other than the end
of the month.

**A bank account is written the way the bank writes it.** A payment method of
its own type (`bank_account`): the bank by its Masav code (`src/domain/banks.ts`:
the banks in Israel, the codes of banks that have merged, and the Arab and
Palestinian banks that clear through Masav, with their Arabic names), the
branch, the account number - pasting "12-689-123456" fills all three - whose
it is (personal; joint, as a couple's; or business, with partners outside the
app by name), and its overdraft limit (מסגרת עו״ש). A joint account held by
several people is shared, and is offered only to its holders.
The branch is named as it is typed, from the Bank of Israel's list of branches
on data.gov.il: the app ships a copy (`src/data/bank-branches.json`, its own
chunk, refreshed with `pnpm data:banks`) and fetches the live list - whole,
never by the number typed - only when the copy lacks a branch. A card can say
which account pays its bill (`card.accountId`); the card editor offers the
bank accounts already set up first, and each account shows the card bills it is about
to pay. Paying straight from an account is any method but תשלומים and קרדיט,
which are a card's. Not modelled: an account's balance.

**One place for how everyone pays.** The account menu lists _Bank
accounts_ (`/bank-accounts`) and _Cards and payment methods_ - the Cards
screen, which holds the credit cards and, under them, every other way to pay:
debit cards, wallets, transfers, standing orders. `/payment-methods` sends
there. Cash and cheques are built in: every install has them, for everyone,
and they can be neither deleted, renamed nor put away (`isActiveMethod` offers
them even where an older install archived one).

**"Smart import" reads files into transactions, and code checks the reading.**
It also reads the **cards and bank accounts** a file shows - a card company's
list of cards and their rates, a statement's header (`import-cards.ts`): a
card's name, last four digits, network, issuer, קרדיט rate (kept as prime plus
its margin when the page says its rates are prime-based), limit and billing
day; an account's bank, branch, number and holders. An image's are read twice
and compared, a text's are found in the text. Each is matched to the
ones already in the app - by the card's last four digits - and listed as new, as an
update, or as already there. One the file shows only part of (a card without
its billing day, an account without its branch) opens in the card or account
editor with what it did show filled in, for the person to finish; when that is
all the files held, the editor opens straight away. A statement row's card is
the one whose last four digits are printed beside it.
The sheet also takes an optional note (300 characters) about the files - "these are all my Max card transactions for September" - sent in the text of each call of that import, context only: what the files show always wins. It is kept nowhere.
The + button opens a menu: _Add manually_, or _Smart import_, which takes
screenshots (a Bit or bank notification), photos, PDFs, Excel/CSV and Word
files - picked, pasted, dropped, or shared from the phone (the installed
app is an Android share target; `public/share-target-sw.js` keeps the files
until the person says "Read"). Nothing is added before a review list: each
row ticked or not, with its reason in words, and editable. Accuracy and
cost come from doing as little as possible with the model:

- **Code first.** Spreadsheets are read by code from a dictionary of the
  headers Israeli exports use (`import-sheet-map.ts`); the model only names
  the columns of one it does not know, from its first rows. A PDF with a
  text layer goes as text. Only scans and screenshots go as images, sized to
  the largest the model reads without enlarging, long captures sliced.
- **Transcribe, never compute.** The model copies amounts, dates and
  currency marks exactly as printed (short keys, structured output); the
  app's own parsers turn them into money (`parseStatementAmount`, which
  refuses an ambiguous "1.234" rather than guess) and dates (day first).
- **Checks after the first read** (`import-check.ts`): a text source's
  amounts must be printed in it; a document's rows must add up to the total
  it prints - and a difference is traced to the row it points at (a missing
  or doubled row, a moved decimal point, swapped digits); an image with no
  total is read a second time by a cheaper model and the reads compared. One
  correction call re-reads only the rows that failed; a correction is taken
  only when it is printed (text) or makes the sums meet exactly. What is
  still in doubt stays unticked.
- **What is already in the app**: rows already there (any occurrence of the
  same kind and amount within two days, a plan already running, a card's fee
  the app already charges) are grouped as "looks already added"; a category
  comes from the app's own history for that name first.
- **One call per request, a daily cap per person** (`ai_take_quota`), every
  request and answer checked by `import-wire.ts` - shared verbatim with the
  function - with card and account numbers masked. Every file is read
  afresh - a file picked again too - so a fix to the reading reaches it;
  readings older versions kept are cleared on boot (`forgetImportReads`).

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

**The Add pill is first in the DOM.** It is `position: fixed`, so markup order
does not move it on screen — but it decides tab order, and rendered last it sat
after every transaction row. The keyboard walkthrough found it; nothing looked
wrong. It says "Add" rather than showing a bare plus, and its menu presets the
form to an expense or income (`?add=expense|income`; `add=1` from older links
still means an expense).

**The brand is sapphire; green means money coming in.** `--brand-deep`
(#0F3A8A, #0B2C6B in dark mode) is the engraved panel at the top of every
screen, carried in from the front door; `--income` stays green and `--expense`
red, and no other brand colour is either. Every token pair is checked by
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

**The balance breakdown does not list the opening balance.** The total is still
the real balance; the starting-balance line was noise in the pop-out.

**Archiving a card hides it; it never changes money owed.** Fees stop only after
the archive month, and a card still owed on stays in the household's total on Cards.

**Duplicate keeps the source row's person.** It keeps the card only if that
person can use it, and the person only while they are still in the household
(linked accounts).

**Account linking is a page in Settings, not a tab.** It is set up once, so
it sits with the account (Settings › Account linking, `/settings/linking`,
between Account and Security) and takes no tab. It was called
Household; only the words changed - the code, the `household` i18n keys, the
tables and the Supabase functions keep the old name, as the database keeps
`greenback`. `/household` and `/profiles` still land on it.

**Cash is part of the balance, not beside it.** The Cash tab (קופת מזומן) shows how
much of the balance is in the wallet: the feed's balance stays "all my money".
Cash income raises both, paying cash lowers both, and moving money between the
bank and the wallet - a withdrawal, a deposit, the amount someone started with -
moves only the cash. Those moves are a table of their own (`cashMoves`), not a
new transaction kind or payment-method type: an older build syncing alongside
this one rejects, forever, a row carrying an enum value it does not know, while
a table it does not know it pulls and drops. Its pull cursor still moves past
those rows, so a device that later updates would never fetch them: the v4
upgrade therefore resets every pull cursor once, which costs each device one
full re-download on its first launch. For the same reason a move's
`kind` is a free string and every sum ignores a kind it does not know. Income
says where it went in its own field, `destinationId` (a bank account, as a
label, or cash), not in `paymentMethodId`, which older income forms drop on
edit. A recount writes an ordinary cash income ("Cash found") or expense ("Cash
missing") tagged `cashCount`, so an older build's balance is right too, or a
zero `count` move when it matched; during the rollout an older build names
those two categories by their keys, "cashFound" and "cashMissing". Each person
has one `start` and their cash counts from it, so old cash spending cannot
drive it negative; it can still go below zero, and says so. On the start day
itself only rows written after it count, since the amount typed already holds
the rest. If two devices set up offline and both starts sync in, the earliest
counts and the screen offers to keep it and remove the others. A withdrawal or
deposit is dated from its person's start up to today, and the start stays on or
before the first of them; outside that range a move would count for nothing.
Deleting a person and moving their rows to someone else moves their cash into
that person's pot: when both have a start, the incoming start becomes a
withdrawal of the same amount, which adds to the pot just as the start did,
and their rows dated before the pot's own start stop counting. Linked accounts
share one pot - every row keeps its person, so the pot always splits back, and
unlinking takes the other person's moves off the device with their space. Not
modelled: per-account balances, cash in a foreign currency, notes and coins by
denomination, a cash move recorded on a device that was offline while the
default currency changed. The design is in
`docs/superpowers/specs/2026-10-09-cash-deposit-design.md`.

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

**Banks, card companies and networks show their real logos, on white tiles.**
White in both themes, as the logos are drawn for it; rendered as `<img>`,
never inlined, so artwork from outside cannot run anything. Sources and terms
are in `src/assets/brands/SOURCES.md`.

**Amounts render in a `dir="ltr"` island with `data-value` carrying the
integer.** CLDR's Hebrew currency pattern injects two right-to-left marks and
puts the symbol after the number; left to inherit page direction, a leading
minus jumps to the far end. Every test asserts the integer, never the formatted
string — pinning `"$1,234.50"` breaks the next time ICU moves a separator.

**The font stack order is load-bearing.** `'Inter Variable', 'Heebo Variable', …`
— fallback is per-glyph, so digits resolve to Inter (which ships tabular
figures) while Hebrew falls through to Heebo (which does not). Putting Heebo
first silently breaks every amount column in Hebrew.

## The card catalog

Linking a card (Cards, Add a card, "Who issues this card") fills in its real
rules and rates from a catalog: you pick the bank, the card company and the card
type, and the card takes that combination’s rates, its deal types and their
limits. The catalog is a separate chunk, loaded only when a card form or the
purchase form needs it, so it costs nothing at startup. It lives in
`src/data/card-catalog/`.

**What it covers.** Five card companies: Isracard, Amex, Cal, Diners and Max.
Twelve banks that issue them: Hapoalim, Leumi, Mizrahi-Tefahot, Discount,
Mercantile, Massad, Yahav, One Zero, and the FIBI group (First International
(FIBI), PAGI, Otsar HaHayal and U-Bank). Each bank offers the companies whose
cards it issues, so the same company can carry different rates through
different banks.

- **The figures are the published ones, and often maximums.** Banks print the
  most a customer can be charged, not what they will be. A rate is tagged
  "Up to" when it is a maximum, and every rate keeps its source link and the
  date it was read; the info button on a row shows both.
- **An unpublished rate is typed from the statement.** Where nobody publishes a
  figure (Mizrahi’s Credit Plus, for one), the row asks for it, and a purchase
  under that deal will not save until it is there. A published rate can also be
  changed on the card, marked "Changed by you", and put back with one tap.
- **מתואמת is computed, not copied.** The app stores the nominal rate and how
  often it compounds, and works the effective annual rate from those, so it
  follows prime when prime moves. 15.50% compounded monthly shows as 16.65%.
- **Max’s long credit re-prices at payment 19.** Payments 1–18 stay at the rate
  the deal was priced at; from payment 19 the rate moves by any change in prime
  since the purchase. The purchase form shows both halves of the schedule.
- **Split into payments.** A purchase already saved on a linked card can be
  turned into a payment plan in place, but only where the card’s company offers
  it, and on its own terms: each card’s rule says whether it is available, the
  payments allowed, and when interest starts. On Max, interest runs from the day
  you ask; on Isracard (and Amex, which shares its agreement), from the day the
  account is credited, within two business days, or from the regular billing
  date if the purchase has not been charged yet.

- **Plans are edited one payment at a time, or whole.** A payment plan
  (installments, קרדיט, long credit, a loan or a mortgage) no longer offers
  "this and future payments". Splitting a plan there restarted its payment
  count, which also moved the payment-19 re-price. To change every payment
  from now on, edit the whole plan.

**Not covered yet.**

- Revolving credit, ישראקרדיט-style pooled credit, and minimum payments.
  They come later.
- Bank card fees. The catalog does not know them, so the app does not fill them in.
- A scheduled re-check of the published tables. They are read by hand, and each
  rate shows the date it was last read.

The privacy page needs no change: the catalog ships inside the app, and nothing
about a card is sent anywhere to look it up.

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
- **Linked accounts** (Settings › Account linking, `/settings/linking`;
  `src/features/household/`, `src/db/sync/route.ts`,
  `supabase/migrations/20261007000000_households.sql`): up to ten linked
  accounts that see and edit each other's data. Every account keeps its
  own rows in its own space, sealed with its own key; linking lets the others
  read and write it there (the record functions' `p_space`), and the server
  hands a member the account's own key entry and nothing else of it. A
  transaction, card or account lives in its owner's space (a person's
  `profileId` is their account id); the shared structure (categories,
  the currency, merges) and its joint cards live in every space. Unlinking
  ends the access at once and leaves each account exactly its own - nothing
  is moved or deleted to get there. Invitations go by email (the
  `send-invite` function, through Resend): a single-use link, kept on the
  server only as a hash, good for seven days, accepted only by the signed-in
  account with that confirmed address. Joining asks the invitee to convert
  to the linked accounts' currency first. People made inside an account before
  accounts could link stay listed "from before linking" until their entries
  are given to someone's account; the first of them becomes the account's
  own person. The animal avatars are gone: a person is their account's
  picture, or their initials.
- **Lock after inactivity**, per device: 5 minutes, 15 (the default), an hour,
  a day, or never. The session ends on the server too, not just on screen.
- **Deleting the account** deletes everything it holds, and this device's copy.
- **Delete all data** (Settings › Data & backup): immediate when alone; with linked accounts, every other one confirms by an emailed link first.
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
- **Edge Function `extract-transactions`** (`supabase/functions/extract-transactions/`,
  with `_shared/import-wire.ts`, a copy of `src/domain/import-wire.ts` that a
  test keeps identical): "Smart import". Same `ANTHROPIC_API_KEY`. Optional
  `EXTRACT_MODEL` (Claude Sonnet 5.5), `CHECK_MODEL` (Claude Haiku 4.5, the
  second read) and `VERIFY_MODEL` (Claude Opus 5.5, the correction), each
  only from an allow-list. Its daily cap is the migration
  `20261004000100_ai_usage_one_cap.sql` (80 calls a person a day).
- **Edge Function `send-invite`** (`supabase/functions/send-invite/`): emails
  an invitation to link accounts. Needs **Edge Functions → Secrets →
  `RESEND_API_KEY`** (the same Resend key as the SMTP password; entered there
  only). Without it, inviting answers "the email couldn't be sent" and no
  invitation is left behind.
- **SheetJS** is pinned to its own CDN's tarball
  (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`); the npm `xlsx`
  package is years behind and unmaintained. `pnpm outdated` does not track it.
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

- "Smart import" from the Share menu is Android's, for the installed app, and
  needs the service worker installed (open the app once); iPhone has no
  share target, so there it is the file picker. Its accuracy has been checked
  on the checks' own test cases, not yet measured on a set of real
  statements and notifications.
- Instalment plans are read-only in the editor. Re-splitting an existing plan
  would break the sum-to-total invariant.
- Built-in categories can be archived but not renamed or deleted: they store an
  i18n key, so a rename would have to fork them into custom rows.
- Turning reduced-motion **off** mid-session leaves the last animated figure on
  screen until the value next changes.
- Flags are rendered as code badges, not emoji. Windows ships no flag glyphs.
