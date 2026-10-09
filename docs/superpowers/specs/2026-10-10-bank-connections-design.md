# Bank and card connections: design

**Status: PARKED 2026-10-10. The user's ceiling for real data is ₪200/month; the licence fees alone exceed it. Revisit only if the licence cost or the law changes.**

**Status:** Design taken from Claude's recommendations on 2026-10-10 (user chose 'mock now, Feezback next'); awaits review. No build is planned while parked.
**Asked for by the user on 2026-10-10:** "to get real data like an actual credit card company app, but one app for everyone together".

**Read with:** `greenback-research/docs/research/2026-10-09-israeli-open-banking-path.md` ("the path doc") and `2026-10-10-feezback-api.md` ("the Feezback doc").

## Decisions

1. **No credential is ever collected.** Bookandry never asks for a password, user code, OTP, card number or ID number. Approval happens on the bank's page (OAuth2) or Feezback's. Reason: §60 of the Financial Information Service Law makes credential access a crime, and Directive 368 §57 forbids asking.
2. **Nothing real is connected until Bookandry holds an ISA licence.** Only the mock is built now, then Feezback's integration environment (Mock Bank). Reason: the law (§29(א)) and Feezback's own error `1010` both rule out unlicensed use.
3. **Production is off by three independent locks.** These are a code constant, a server secret and a build flag (§1). Reason: one mistaken setting must never be enough.
4. **The mock runs as its own Edge Function, `bank-mock`, speaking Berlin Group HTTP.** It is not an in-process fake. Reason: the redirect, the code exchange and the paging links are what Feezback replaces, and an in-process fake would skip exactly those. Unit tests call the same pure module in-process.
5. **The mock's fake bank page is a static page, built only in non-production builds.** Reason: Supabase serves Edge Function HTML as plain text on its default domain.
6. **One adapter interface, `BankFeedProvider`.** It returns normalised shapes, so moving from the mock to Feezback changes the provider and not the data model. Reason: this is the coordinator's requirement, and Feezback's data API is Berlin Group underneath anyway.
7. **The server never writes ledger rows.** The Edge Function returns normalised rows over TLS. The client maps them, then seals and saves them like any other write. Reason: synced rows are sealed client-side (README, "Accounts"). A second writer would need the data key on the server and a new path into the sync protocol.
8. **Transactions carry one new optional field, `feed`, and no new enum value.** Reason: older builds reject unknown enum values but keep unknown fields (cash deposit §1).
9. **A feed business type ranks first, as `mccSource: 'feed'`, and is never auto-replaced.** Reason: it is the issuer's code for this exact purchase, which is better than a file column.
10. **Rows land directly.** Only doubtful duplicates wait for a yes or no, and each batch has Undo. Reason: in a bank app, the data is the account.
11. **Booked transactions only. A pending one is ignored even when offered.** Reason: Discount gives booked only, and pending rows change id when they book.
12. **First connect brings 12 months back.** Reason: that is the Bank of Israel minimum and Feezback's promise.
13. **Freshness is a pull on open, plus the provider's own refreshes, plus Feezback's consent webhooks.** Reason: there is no transaction push (Feezback doc §3.6), and background access is capped at about 4 a day.
14. **Consents last 12 months, with a check every 6 months that the person still wants it.** Reason: the law allows up to 3 years but requires the 6-month check (§26). A year keeps a forgotten connection from running long.
15. **Each person connects only their own institutions.** Any linked member's device may bring them in. Reason: the consent belongs to the card or account holder (path doc §4.2), and "one app for everyone together" means the partner sees the data without opening the app first.
16. **Disconnecting keeps the transactions.** Reason: they are the account's data, and removing a year of rows by one tap is a trap.
17. **Feezback calls leave through a fixed-IP CONNECT proxy.** It authenticates callers and allows only Feezback's hosts. Reason: Feezback whitelists source IPs and Edge Functions have none. A CONNECT tunnel keeps TLS end to end, so the proxy never sees data.

## 1. Legal guardrails and the production guard

- **No credential fields.** The connect sheet's only input is choosing an institution.
  - `gate:pci` gains `password`, `user_?code`, `otp` and `סיסמה` for `src/features/bank-feed/**` and `supabase/functions/**/bank-*`.
  - Its existing `iban` rule gets exactly one exception: `supabase/functions/_shared/bank-feed/wire/*.ts`. These are the provider codecs, which read `iban` and `maskedPan` and reduce them at once to bank, branch, number and last four. A test asserts that no normalised shape has an `iban` or a full PAN.
- **Lock 1: a code constant.** `_shared/bank-feed/guard.ts` holds `PRODUCTION_REF`, the production project ref, and `LICENSED_PROVIDERS = []`. On the production project, a provider not in that list is refused before anything else runs, and `bank-mock` refuses every request. Enabling a provider there takes a reviewed code change, which is the licence step.
- **Lock 2: a server secret plus an allowlist.**
  - `bank-feed` answers 404 `not_enabled` unless `BANK_FEED_PROVIDERS` (for example `mock`) names the provider. The production project never sets it.
  - Even when it is set, `private.bank_feed_allowlist` must list the account. It is empty everywhere except the staging project's test accounts.
- **Lock 3: a build flag.**
  - The UI exists only when `VITE_BANK_FEED=on`. The deployed `pnpm build` never sets it, so the code is dead-code-eliminated.
  - A new `gate:bank-feed` runs after the build in `pnpm verify`. It fails if `dist/` contains `bank-feed` or `mock-bank`. It also fails if `src/` or `supabase/functions/` contains a real data host: `lgs-prod`, `prod-tpp`, `discountbank.co.il`, `mercantile.co.il` and the other banks' API hosts.
- **Where it runs:**
  - a separate Supabase project, "bookandry-staging";
  - local builds;
  - the e2e server (§9).

  The production database never holds a connection row.

## 2. Architecture

```
SPA (feature flag) ──JWT──▶ bank-feed (Edge Fn) ──▶ BankFeedProvider ─┬─ mock     ──HTTP──▶ bank-mock (Edge Fn, Berlin Group)
        ▲   │                    │                                     └─ feezback ──CONNECT proxy (fixed IP)──▶ Feezback LGS/TPP
        │   └─ maps, seals, saves│ private.bank_* tables (RLS, sealed secrets)
        └── normalised rows ◀────┘          ▲ bank-feed-webhook (Feezback), bank-feed-cron (pg_cron)
```

### 2.1 The adapter (`supabase/functions/_shared/bank-feed/provider.ts`)

```ts
interface BankFeedProvider {
  readonly id: 'mock' | 'feezback';
  institutions(): Promise<readonly Institution[]>;
  startConsent(i: {
    connectionId: string;
    subject: string;
    institution: string;
    returnUrl: string;
    validUntil: LocalDate;
  }): Promise<{ redirectUrl: string; secret: Sealed }>;
  completeConsent(i: { secret: Sealed; params: URLSearchParams }): Promise<ConsentState>; // mock: code exchange; feezback: reads status
  status(secret: Sealed): Promise<ConsentState>;
  resources(secret: Sealed, ctx: PullCtx): Promise<readonly FeedResource[]>;
  transactions(
    secret: Sealed,
    resource: FeedResource,
    from: LocalDate,
    to: LocalDate,
    ctx: PullCtx,
  ): AsyncIterable<readonly FeedTransaction[]>;
  revoke(secret: Sealed): Promise<void>;
  forgetSubject?(subject: string): Promise<void>; // feezback: DELETE /users/{id}/consents
  parseWebhook?(req: Request): Promise<WebhookEvent | undefined>; // feezback only
}
```

**Normalised shapes.** These are the only ones the client sees. They are mirrored into `src/domain/bank-feed-wire.ts`, and a test keeps the two identical, as with `import-wire`.

- `FeedResource`:
  - `{ ref, kind: 'account' | 'card', institution, currency }`;
  - for an account, `bank`, `branch` and `number` (from the IBAN);
  - for a card, `lastDigits` (from the masked PAN), and optionally `issuer` and `creditLimitMinor`;
  - `usage: 'personal' | 'business'`.
- `FeedTransaction`:
  - `{ ref, resource, date, bookedOn, amountMinor (signed), currency }`;
  - optionally `original { amountMinor, currency }` and `feeRate`;
  - `text`, with `merchant` optional;
  - `mcc`, only if it is four digits;
  - `cardBill`, only when the provider flags it (`isCCPayment`).
- **`ref`:** HMAC-SHA256 with `BANK_FEED_REF_KEY` over provider, institution and the provider's id, truncated to 128 bits and given as base32. Raw provider ids never reach the client.
- **Errors** are normalised to `consent_invalid` (401/410), `suspended` (451), `rate_limited` (429), `provider_down` (5xx/502) and `not_licensed` (1010).

### 2.2 Edge Functions

| Function            | Auth                                                    | Does                                                                                       |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `bank-feed`         | JWT, `aal2` via RPC                                     | actions `institutions`, `start`, `complete`, `pull`, `ack`, `disconnect`, `keep`, `forget` |
| `bank-feed-webhook` | `--no-verify-jwt`; shared-secret header, Feezback's IPs | records consent status only; answers 200 at once (under 3 s)                               |
| `bank-feed-cron`    | `--no-verify-jwt`; secret header; pg_cron every 6 h     | status checks, expiry, the 6-month check, the revoke queue, stale pending                  |
| `bank-mock`         | `--no-verify-jwt`; refused on production (lock 1)       | the fake bank (§3)                                                                         |

- **Handler shape.** Each handler is `handler(req, deps)`, with `deps = { store, env, fetch, clock }`. The same code then runs in Deno and in the Node e2e server.
- **Feezback egress.** The Feezback adapter takes its `fetch` from `deps`. In Edge Functions that is `Deno.createHttpClient({ proxy })` pointed at `BANK_FEED_EGRESS_URL`. The proxy is a small VM with a fixed IP (AWS il-central-1), with basic auth and a host allowlist of the integration hosts only.
- **To confirm in the Feezback step:** whether Supabase's runtime exposes `createHttpClient`. If it doesn't, run the Feezback adapter itself on that VM, behind the same interface.

### 2.3 Where consents and secrets live

The migration is `supabase/migrations/2026xxxx_bank_feed.sql`. Every table is in `private`, with RLS on and `revoke all`. Access is only through security-definer functions, as everywhere else.

- **`private.bank_connections`:**
  - `id`, `owner` (an `auth.users` id, `on delete cascade`), `provider`, `institution`, `status`;
  - `valid_until`, `kept_at` (the 6-month check);
  - `last_pull_at`, `pull_lease_until`, `newest_booked`;
  - `return_nonce_hash`, `error`, `secret bytea`, and timestamps.
- **`private.bank_resources`:** `(connection_id, ref, kind, secret bytea)`.
- **`private.bank_seen`:** `(owner, ref)`. Refs already delivered and saved. It outlives a disconnect, so reconnecting never brings back rows the person deleted. A wipe or account deletion clears it.
- **`private.bank_feed_allowlist`:** `(user_id)`.
- **`private.bank_revoke_queue`:** `(provider, secret)`. A delete trigger on a live connection fills it, so a deleted account's consents are still ended at the provider.
- **`private.bank_feed_log`:** `(connection, action, http status, row count, ms, request id)`. It holds no content and is the start of the licence's 7-year log.

**What is encrypted.** `secret` holds the provider consent id, the OAuth access and refresh tokens (mock), and the provider resource ids. It is sealed in the Edge Function with AES-256-GCM:

- the key is `BANK_FEED_KEY`, an Edge Function secret, with a key-version byte;
- the AAD is the connection id.

A database dump alone can't use them.

**In clear:** status, dates and the institution code.

**Never stored:** the ID number or PSU-ID (Feezback's webhook `psuId` is dropped on arrival), IBANs, masked PANs, owner names, and any transaction content.

**The SPA** reads connection metadata through `public.bank_connections()`. It returns the caller's connections and those of linked accounts it can reach (`private.can_reach`), and never `secret`.

**Feezback's `sub`** is HMAC(owner id), never an email or ID number (Feezback doc §5.3).

## 3. The mock (`bank-mock`)

It imitates Discount's documents, with made-up data. Nothing is copied from Discount's sandbox document.

- **Endpoints, Berlin Group v1.8 shapes:**
  - `POST /v1/consents`, `GET /v1/consents/{id}`, `…/status`, `DELETE …`;
  - `GET /oauth/authorize` (redirects to the static page) and `POST /oauth/token`;
  - `GET /v1/accounts`, `/{id}/balances`, `/{id}/transactions?bookingStatus=booked&dateFrom&dateTo`;
  - **cards** (Discount has none, so this is for Feezback): `GET /v1/cards` and `/v1/cards/{id}/transactions`, in the BOI cards 1.8 shape with `cardTransactionId`, `transactionDate`, `merchantCategoryCode`, `maskedPAN`, `originalAmount` and `currencyExchange`.
- **Discount's choices it copies:**
  - OAuth2 only;
  - booked only: `pending`, `both` and `deltaList` answer 400;
  - 200 per page via `_links.next`;
  - one currency per account;
  - a consent left unanswered becomes `rejected`.
- **One documented divergence:** `PSU-ID` is optional. Bookandry never holds an ID number, so the persona is picked on the fake bank page.
- **The fake bank page** (`mock-bank/authorize.html`): a plain page marked "Mock Bank · test only". It is an input of the Vite build only when `VITE_BANK_FEED=on`. It lists the personas as buttons, then Approve and Refuse, and posts the decision to `bank-mock`.
- **Stateless.** The consent id is an HMAC-signed token (`BANK_MOCK_KEY`) holding the persona, the creation time and `validUntil`.
- **Data.** Transactions are generated deterministically from the persona and the date, using an injected clock. Each new day brings new rows.
- **Invented identifiers.** IBANs use bank 011, branches in the 9xx range and invented numbers, with valid mod-97 check digits. The mock card is issuer `10023` (cal) with invented last-four digits.

| Persona   | Gives                                                                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `approve` | 2 current accounts and 1 card. The card has a valid MCC on each row, one foreign purchase with a fee, an instalment (תשלום 2 מתוך 6) and a refund. The account has salary, an ATM withdrawal and the monthly card bill. |
| `refuse`  | the bank page's refusal, to `TPP-Nok-Redirect-URI`                                                                                                                                                                      |
| `expired` | approves with `validUntil` yesterday; every data call then answers 401                                                                                                                                                  |
| `empty`   | 1 account, no transactions                                                                                                                                                                                              |
| `paged`   | 1 account with 201 transactions: two pages                                                                                                                                                                              |
| `card`    | 1 card only, with MCCs that include `"SLRD"`, which is not four digits and must be dropped                                                                                                                              |
| `revoked` | approves, then reports `revokedByPsu` from 10 minutes after creation (on the injected clock)                                                                                                                            |

## 4. The consent flow

1. **Settings › Banks and cards › Connect.** The sheet lists institutions. Under the mock that is "Mock Bank" with a "Test data" badge; under Feezback it is Feezback's list, with known outages from `aspsp_issues.json` greyed out.
2. **The connection is always the signed-in person's own.** For a linked partner the sheet says "{name} connects from their own account".
3. **`start`.** The server creates the connection with status `pending`. It stores a hashed nonce, the SPA keeps the nonce in `sessionStorage`, and the server returns `redirectUrl`. The SPA then navigates to it in the same tab, or the same window in the installed app.
   - **Mock:** `POST /v1/consents` asks for CACC and CARD, all three baskets, `recurringIndicator: true`, `validUntil` today + 12 months and `frequencyPerDay: 4`, then goes to the authorize page.
   - **Feezback:** an RS512 JWT with `srv: "ais/user"`, `TWELVE_MONTHS` as the only period, and redirects, posted to `/link` through the proxy. The JWE is decrypted and its link returned. On Feezback's screens Bookandry's logo and colours are allowed, but the bank's own screen names "Feezback Technologies Ltd" as the recipient. The connect sheet says so in one line, so the name is not a surprise.
4. **The return** to `{origin}/settings/banks/return?state=…&code=…`, or `&error=…`. Allowed origins are the staging origin and localhost; bookandry.com is unreachable while lock 1 holds. The SPA checks the nonce and calls `complete`.
   - **Mock:** exchanges the code at `/oauth/token`.
   - **Feezback:** waits for `ConsentStatusChanged` and `UserDataIsAvailable` from the webhook. The return page shows the brand mark while it waits, for up to 60 s, then "We'll finish when {name} confirms".
5. **First data.** The first `pull` matches the accounts and cards (§5.1), then lands the 12-month history (§6).

**Lifetime:**

- **Expiry.** `validUntil` is 12 months away. From 30 days before it (Feezback's `ConsentAboutToExpire`, or the cron for the mock), the connection shows "Ends on {date}" with Renew, which runs this flow again. On Feezback, Renew opens its consent-management page.
- **The 6-month check.** Every 182 days after connecting or the last "Keep on", a banner asks whether to keep the connection. If 30 days pass without an answer, the connection is ended (law §26(ב); Feezback doc open question 17).
- **Revoked elsewhere.** Revoked at the bank, `suspendedByASPSP`, Feezback's `ConsentNotAccessed`, or a data call answering 401/410/451: the status is recorded. One line in Settings and one banner offer to connect again. Nothing is retried in a loop.
- **Stale pending.** Pending for more than 5 days: the connection is marked failed and removed (Discount's timeout).
- **Disconnect** ends the consent at the provider (`DELETE`), wipes `secret` and sets the status to `ended`. Rows stay.
- **Account deletion** calls `forget` (Feezback's delete-user-data) before `delete_my_account`. The revoke queue covers a failure.

### 4.1 Settings copy

The page is `/settings/banks`, "Banks and cards" / "בנקים וכרטיסים", in the account menu after Payment methods, and only when the flag is on. It never says "sync".

| Key                    | en                                                                                | he                                                   |
| ---------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `bankFeed.intro`       | Connect your bank and card company, and their transactions come in by themselves. | חברו את הבנק ואת חברת האשראי, והתנועות ייכנסו מעצמן. |
| `bankFeed.connect`     | Connect a bank or card company                                                    | חיבור בנק או חברת אשראי                              |
| `bankFeed.pick`        | Where are your accounts?                                                          | איפה החשבונות שלך?                                   |
| `bankFeed.approveAt`   | You'll approve this at {{name}}.                                                  | האישור נעשה אצל {{name}}.                            |
| `bankFeed.continue`    | Continue to {{name}}                                                              | המשך אל {{name}}                                     |
| `bankFeed.testData`    | Test data                                                                         | נתוני ניסיון                                         |
| `bankFeed.partner`     | {{name}} connects from their own account.                                         | {{name}} מחבר/ת מהחשבון שלו/ה.                       |
| `bankFeed.active`      | Connected · updated {{time}}                                                      | מחובר · עודכן {{time}}                               |
| `bankFeed.pending`     | Waiting for {{name}} to confirm                                                   | ממתין לאישור של {{name}}                             |
| `bankFeed.refused`     | Not approved at {{name}}                                                          | לא אושר אצל {{name}}                                 |
| `bankFeed.tryAgain`    | Try again                                                                         | לנסות שוב                                            |
| `bankFeed.ends`        | Ends on {{date}}                                                                  | מסתיים ב-{{date}}                                    |
| `bankFeed.renew`       | Renew                                                                             | חידוש                                                |
| `bankFeed.ended`       | Ended on {{date}}. Your transactions stay.                                        | הסתיים ב-{{date}}. התנועות נשארות.                   |
| `bankFeed.reconnect`   | Connect again                                                                     | חיבור מחדש                                           |
| `bankFeed.revoked`     | Turned off at {{name}}                                                            | בוטל אצל {{name}}                                    |
| `bankFeed.suspended`   | {{name}} paused this connection                                                   | {{name}} השהה את החיבור                              |
| `bankFeed.partial`     | Waiting for the other account holder to approve                                   | ממתין לאישור של בעל/ת החשבון השני/ה                  |
| `bankFeed.down`        | {{name}} isn't answering right now                                                | {{name}} לא זמין כרגע                                |
| `bankFeed.disconnect`  | Disconnect                                                                        | ניתוק                                                |
| `bankFeed.disconnectQ` | Disconnect {{name}}? Transactions already here stay.                              | לנתק את {{name}}? התנועות שכבר כאן נשארות.           |
| `bankFeed.keepQ`       | {{name}} is still connected. Keep it on?                                          | {{name}} עדיין מחובר. להמשיך?                        |
| `bankFeed.keep`        | Keep on                                                                           | להמשיך                                               |
| `bankFeed.landed`      | {{count}} new from {{name}}                                                       | {{count}} חדשות מ-{{name}}                           |
| `bankFeed.check`       | {{count}} may already be here                                                     | {{count}} אולי כבר כאן                               |
| `bankFeed.addIt`       | Add                                                                               | להוסיף                                               |
| `bankFeed.already`     | It's already here                                                                 | כבר קיים                                             |
| `bankFeed.removeBatch` | Remove the {{count}} last brought in                                              | להסיר את {{count}} האחרונות שנכנסו                   |

Each connection row shows the institution's mark, the person's avatar (in the "all" view), the status line and its one action. Undo uses the existing `undo` key.

## 5. Data mapping

### 5.1 Accounts and cards to payment methods

- **An account** matches an existing `bank_account` with the same `bank` and `number` (`existingAccount`). Failing that, it matches one with the same bank whose stored number is a suffix of at least 4 digits ("account tail"), if exactly one does. A branch difference is ignored, because an account that moves branch keeps its `resourceId`.
- **A card** matches the one card with the same `lastDigits` and, when both are known, the same issuer.
- **No match:** a new method owned by the consenting person.
  - An account becomes `bank_account`, `holding: 'personal'`, or `'business'` for `usage: ORGA`.
  - A card becomes `credit_card`, with `issuer`, `lastDigits` and `creditLimitMinor`, and `billingDay` from the most common `valueDate` day.
  - Joint or debit is the person's to change in the editor, since the data doesn't say.
- **Ambiguous match** (two candidates): a new method is created, and the connection's page asks "Is this your {label}?" to link it.
- **New optional field:** `PaymentMethod.feed?: { readonly refs: readonly string[] }`, the provider resources this method is. It is synced, so every linked device maps rows the same way.

### 5.2 Transactions

- **New optional field:** `Transaction.feed?: { readonly ref: string; readonly batch: string }`. Its presence is the source marker, so there is no `source` enum.
  - `ref` is the transaction's ref. `batch` is the landing batch's id.
  - **The id is deterministic:** `tx.feed.<ref>`. Two linked devices landing the same row concurrently write the same id, and last-write-wins converges with no duplicate.
- **Through the Smart import pipeline.** Each `FeedTransaction` becomes a `FoundRow` with no flags, `wire` empty and `statementCard` set from the resource. It then runs through the existing steps:
  - `flagExisting` and the plan detection;
  - `knownCategory`, so a row like "תשלום 2 מתוך 6" becomes one whole plan, and later payments are `already_plan`;
  - the §3 category chain of the MCC spec;
  - `draftOf`, with the foreign amount and the billed shekel amount giving the rate.
  - The rows are written with `paymentMethodId` (expense) or `destinationId` (income to an account), and `profileId` set to the connection's owner.
- **Kind and sign:** a negative amount is an expense. A positive one is income, and on a card it is `cat.refund`.
- **`date`:** the purchase date (`transactionDate`) for cards, `bookingDate` for accounts. Card settlement stays Bookandry's own (`settleDate`).
- **Left out, acked and counted in the summary:**
  - a current-account card-bill debit (`cardBill`, or `knownCategory`'s card-company rule) when the household has a card billed from that account or from that issuer, since the purchases are already counted one by one;
  - cash withdrawals (6010/6011 or the ATM rule), as Smart import does.

### 5.3 Business types

- The feed's `mcc` is kept only if `isMcc`, and is stored with `mccSource: 'feed'`.
- The MCC chain becomes **feed → file → sector → history → Claude**. A feed row never has a file or sector, so in practice it is feed, then history, then Claude.
- Feezback's Hebrew `_aggregate.category` goes through `sectorMcc` as a `sector` hint when there is no MCC.
- `'feed'` is **not** added to `REPLACEABLE`, so the form never auto-replaces it. The person can still change it, which makes it `user`.
- **Claude.** Merchants without a code go in the existing batched `mc` call, against the AI quota. Past the cap, rows land without a business type.

### 5.4 Dedupe against typed and imported rows

Each pulled row is one of:

1. **Its ref is already seen** (server side): it is never returned.
2. **A row with id `tx.feed.<ref>` exists**, live or tombstoned: skip and ack.
3. **Exact match:** a live row of the same kind, the same amount (its own, charged or base), within ±2 days, with the same method or none, and no `feed` (`flagExisting`). That row is **adopted**: `feed` is added to it, its fields are untouched, and the ref is acked.
4. **Matches an occurrence of a recurring series or plan:** skip and ack. The occurrence already counts.
5. **Near match:** the same kind and method, an amount within 5%, within ±3 days. The row is **held**. It is not saved and not acked, so it comes back on each pull until the person answers "Add" or "It's already here" (adopt). The card sits at the top of the feed.
6. **Otherwise it lands.**

### 5.5 Window, paging, pending

- **The window.** The first pull covers today − 12 months to today. Later pulls start at `newest_booked` − 14 days, to catch late bookings, and seen refs are filtered on the server.
- **Paging.** The server follows `_links.next` (mock: 200 a page) or v2 `page`/`pageSize=1000` (Feezback) to the end. It returns at most 2,000 rows per response, with a continuation token. A 307 from Feezback is followed with `X-Request-Wait`.
- **Pending.** Booked only (Decision 11). Feezback is asked for `booked`.

### 5.6 Older builds

| Older build sees             | Effect                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| a transaction with `feed`    | It parses and keeps the field: sync stores the raw row and edits spread it. The row is ordinary to it. Editing it there keeps `feed`. |
| `mccSource: 'feed'`          | An unknown source is treated like `user` and never replaced, which is the intended behaviour.                                         |
| a payment method with `feed` | Kept the same way. Nothing it shows changes.                                                                                          |
| ids `tx.feed.*`              | Ids are opaque strings everywhere.                                                                                                    |

There is no Dexie version bump and no new synced table. Tests pin the table, as in MCC §5.

## 6. Landing and review

- **Direct.** Rows land in one `undoableWrite` as a batch. The toast reads "{count} new from {name}", with Undo for the usual 6 s.
- **Removing a batch.** Until the next batch lands, Settings offers "Remove the {count} last brought in". It is undoable, and the refs stay seen, so they don't come back.
- **What is held.** Only §5.4 step 5 rows wait for a yes or no. Everything else is the account's data, as in a bank app.
- **Ack.** The client calls `ack(refs)` after the Dexie write commits. A lost ack is harmless, because of the deterministic ids.
- **Who lands it.** Any device of the owner or of a linked account may land a connection's rows. They go into the owner's space through the existing `p_space` writes. The server's `pull_lease_until` (90 s) stops two pulls of one connection at once.

## 7. Freshness

- **Pull on open:** when the app opens or comes back to the foreground, online and signed in. Each household connection that is active and was last pulled more than 10 minutes ago is pulled. While the app stays visible, this repeats every 30 minutes. The client's IP is passed as `PSU-IP-Address` / `X-Psu-IP-Address`, so these calls don't count against the background quota.
- **Rate limits.** The server refuses a pull of one connection within 10 minutes of the last one, since the law counts all requests within 10 minutes as one. A `rate_limited` answer backs off for an hour.
- **Scheduled:** `bank-feed-cron` every 6 hours, so at most 4 calls a day per consent. It checks status and expiry for the mock and stale-pending connections. It stores no transaction content. Feezback's own refreshes keep its copy fresh, and its webhooks carry status, so for Feezback the cron only handles expiry, the 6-month check and the revoke queue.
- **Webhooks (Feezback):**
  - `ConsentStatusChanged` sets the status;
  - `UserDataIsAvailable` marks the connection ready;
  - `ConsentAboutToExpire` starts "Ends on";
  - `ConsentNotAccessed` ends the connection;
  - `DataRefreshComplete` clears the 10-minute wait so the next open pulls.
- **No push.** There is no transaction push, so nothing lands while no device is open.

## 8. Feezback mapping

From the Feezback doc §3 and §5.

| Adapter method    | Feezback                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `institutions`    | a fixed table of `aspspCode` → bank Masav code or `CardIssuer` (`10023` cal, `10033` max, `12002` isracard, `12011` amex)                                            |
| `startConsent`    | JWT `srv: "ais/user"`, `sub` = HMAC(owner), `accountTypes` CACC+CARD, all baskets, `TWELVE_MONTHS`, `context` = connection id → LGS `/link`                          |
| `completeConsent` | the webhook-recorded status, or `GET /consents/{id}` with an `ais/tpp` bearer token (600 s)                                                                          |
| `resources`       | `/accounts?withBalances`, `/cards`; `iban` and `maskedPan` reduced in `wire/feezback.ts`                                                                             |
| `transactions`    | v2 `…/transactions`, `bookingStatus=booked`; `transactionId` (Feezback's stable id) → `ref`; `_aggregate.type.isCCPayment` → `cardBill`; `standardName` → `merchant` |
| `revoke`          | `DELETE /tpp/v1/users/{userId}/consents/{consentId}`                                                                                                                 |
| `forgetSubject`   | `DELETE /tpp/v1/users/{userId}/consents`                                                                                                                             |
| `parseWebhook`    | shared-secret header plus source IP; statuses parsed as both `partiallyAuthorized` and `partiallyAuthorised`                                                         |

- **Keys.** The integration private key is held as `FEEZBACK_PRIVATE_KEY`, with `FEEZBACK_TPP_ID` and `FEEZBACK_WEBHOOK_SECRET` beside it. Production keys are never added while parked (lock 1).
- **Open items from the Feezback doc §7:**
  - whether Mock Bank returns cards, MCCs and pending rows;
  - which key decrypts the JWE;
  - the v2 schema;
  - the per-IP rate limit;
  - how instalments appear;
  - whether `createHttpClient` works on Supabase.

  Each is checked in build step 6 before code depends on it.

## 9. Testing

- **Unit (domain and `_shared`):**
  - the mock generator per persona;
  - IBAN and masked-PAN reduction, with no `iban` in any output;
  - ref HMAC stability;
  - the Berlin Group and Feezback codecs, against fixture JSON;
  - the guard (production ref plus an unlisted provider is refused);
  - every §5.4 dedupe case;
  - the §5.1 matching, including the account tail and ambiguity;
  - the MCC chain with `feed`, and `"SLRD"` dropped;
  - the 6-month and expiry timers;
  - the paging continuation.
- **DB (PGlite):**
  - RLS and grants: no table readable, `bank_connections()` hides `secret` and shows only reachable linked accounts;
  - the allowlist refusal;
  - the lease;
  - seen surviving a disconnect but not a wipe;
  - the revoke-queue trigger on account deletion;
  - the §5.6 compatibility table: `feed` and `mccSource: 'feed'` round-trip through the schemas, sync apply and an edit.
- **Edge (Deno test):**
  - `bank-feed` against `bank-mock` in-process, for the personas `approve`, `refuse`, `expired`, `empty`, `paged` (two pages, 201 rows) and `card`;
  - `revoked` after the clock moves;
  - the webhook with Feezback fixtures.
- **DOM:**
  - the Settings page in every status, in en and he;
  - the connect sheet;
  - the return page (success, refused, waiting);
  - the "may already be here" card;
  - the batch toast and Remove-batch.
- **E2E:**
  - `pnpm build:e2e` (the local build with `VITE_BANK_FEED=on` and `VITE_BANK_FEED_URL=http://localhost:4175`);
  - a Node server on 4175 running the same handlers with an in-memory store and a test clock;
  - the CSP allows that URL only in this build.
  - Flow, in the en, he and mobile projects:
    1. connect;
    2. pick `approve` on the Mock Bank page;
    3. return;
    4. see the rows, the card's business types and the plan;
    5. Undo;
    6. connect again (nothing is duplicated);
    7. `refuse` shows "Not approved";
    8. `expired` shows "Ended".
  - Also axe on the page and the sheet, and 44 px targets.
- **Gates:** `gate:pci` additions and `gate:bank-feed` (§1), each with a failing fixture.

## 10. Build order

Each step ships behind the flag and passes `pnpm verify`.

1. Guard, flag, gates and the staging project.
2. `bank-mock` and its personas, with Deno tests.
3. The migration, `bank-feed` `start`/`complete`/`disconnect`, and Settings with the connect flow and return page.
4. `pull`/`ack`, the mapping (§5), landing with Undo and the held card.
5. Freshness (pull on open, the cron), expiry and the 6-month check, the revoke queue, and the e2e flow.
6. **Feezback** (after its integration account and the licence question): the proxy VM, the adapter, the webhook, and Mock Bank tests.

## 11. Out of scope

- Payments (PIS), and anything that moves money.
- A real provider or bank in production, and the ISA licence itself.
- Loans, savings and securities.
- Notifications ("you just spent").
- Showing pending transactions.
- Cash withdrawals from the feed as cash-tab moves.
- Bringing back removed batches.
- Direct bank integrations (Option B in the path doc).
