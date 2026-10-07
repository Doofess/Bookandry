# Delete all data

Approved in conversation on 2026-10-07.

## What the person asked for

> "In data and backup, a function to delete the data related to the account.
> Linked accounts can delete data as well but need each other's confirmation
> using email. Linked account data is shared between them, so deleting means it
> deletes for all the accounts in that link chain."

Decided with them:

- **What stays.** Every login, profile picture, and the link between the
  accounts. Settings (language, currency, theme) stay too. Built-in categories
  come back fresh.
- **What goes.** Transactions, credit cards, bank accounts, categories the
  household added, commitments and import drafts, for every account in the
  household.
- **Linked.** Every *other* member confirms by a link in an email. The person
  who asks does not confirm by email: asking is their confirmation.

## Where

Settings › Data & backup gets a last section, "Delete all data", visually
apart from export and import.

## Flows

### Alone (not linked)

1. "Delete all data" opens a dialog. It lists what will be erased and what
   stays, and offers "Download a backup first", which runs the existing export.
2. The delete button stays disabled until the person types the confirmation
   word: DELETE in English, מחיקה in Hebrew. Matching ignores case and
   surrounding spaces.
3. **Signed in:** the server erases the account's data (see
   [The server](#the-server)). This device clears itself at once; other
   devices clear on their next sync.
4. **Not signed in:** only this device is cleared.
5. Afterwards the feed is empty and a toast says "All data was deleted".

### Linked

1. The button reads "Ask to delete everyone's data". The dialog says who will
   be asked ("Dana and Noa will each get an email to confirm") and that nothing
   is deleted until they all do. It needs the same typed word.
2. The server opens a request. The `send-wipe-requests` edge function then
   emails every other member, in their language (the requester's app language,
   as invitations do today). The subject is "[Name] asked to delete all of the
   household's data". There is one button, "Review the request", which links to
   `https://bookandry.com/wipe?t=<token>`.
3. Opening the link (signed in, or signing in first, as `/link` does today)
   shows who asked, when, what will be erased, and that it will be erased for
   everyone. The buttons are **Confirm** and **Decline**.
   - A token works for exactly one account: the member it was sent to. Any
     other signed-in account sees "This request isn't for this account."
   - A token works once.
4. When the last member confirms, the erase runs at once for every member's
   space.
5. **Cancelled by:** any Decline; the requester cancelling; 7 days passing;
   anyone joining or leaving the household before it completes. On cancel,
   nothing is deleted.
6. **While pending:**
   - Data & backup shows "Waiting for Dana to confirm · expires in 6 days" to
     every member. The requester also gets a Cancel button.
   - The Delete section is disabled for everyone: there is only one request per
     household at a time.
7. **After the erase:** every member's devices clear on their next sync and
   show "All data was deleted at Dana's request".

## The server

New migration, `wipes`:

- **`public.space_epochs (user_id uuid primary key, epoch integer not null default 0)`**
  holds one erase counter per account's space. There is no row until the first
  erase, and a missing row means 0. RLS is on, with no policies; it is reached
  only through functions.
- **`public.wipe_requests`**:
  - `id`, `household_id`, `requested_by`, `created_at`
  - `expires_at` (created + 7 days)
  - `status` (`pending` | `done` | `cancelled`)
  - `member_ids uuid[]`, the members at request time, so a membership change
    can be detected
- **`public.wipe_confirmations`**:
  - `request_id`, `user_id`
  - `token_hash` (sha256, as with invites)
  - `confirmed_at`, `declined_at`

  Both tables have RLS on and no policies.
- **`private.erase_space(uid)`**: deletes every row of `public.records` for
  that `user_id`, and raises its epoch by 1.
- **RPCs**, each `security definer` and requiring the user:
  - **`wipe_my_data()`**: alone only. A household member gets
    `linked_needs_confirmation`. Erases the caller's space.
  - **`request_wipe()`**:
    - Refusals: the caller has no household (`not_linked`), or a request is
      already pending (`wipe_pending`).
    - Creates the request and a confirmation row per other member.
    - Returns the per-member tokens to the edge function only, the way
      `create_invite` returns its token once.
  - **`wipe_status()`**: the household's pending request, if any. Returns who
    asked, the expiry, and who has and hasn't confirmed, as display names only.
  - **`peek_wipe(token)`**: what the confirm page shows. Refuses a token that
    is not the caller's (`not_yours`), used, expired or cancelled.
  - **`confirm_wipe(token)`**: records the confirmation. When all members have
    confirmed and the membership still equals `member_ids`, it erases every
    member's space and marks the request `done`.
  - **`decline_wipe(token)`**: cancels.
  - **`cancel_wipe()`**: the requester only.
- **Expiry and membership changes.**
  - `wipe_status`, `peek_wipe` and `confirm_wipe` treat a request past
    `expires_at` as cancelled.
  - `accept_invite`, `leave_household`, `remove_member` and
    `delete_my_account` cancel any pending request for the household.
- **Sync guard.**
  - `pull_records` returns the space's epoch alongside the records.
  - `push_records` takes `p_epoch`. A push whose epoch is below the space's
    current one is refused with `wiped`.
  - A push with no `p_epoch` (an app from before) is refused once the epoch is
    above 0. That way an old, offline device cannot restore erased data.
- **Limits.** One request per household per hour, so an angry member cannot
  flood the others' inboxes.

## The edge function: `send-wipe-requests`

- Runs like `send-invite`: as the caller, `request_wipe()`, then one Resend
  email per member, from `no-reply@bookandry.com`, in English or Hebrew.
- If any email fails, the request is cancelled, so no request exists that
  someone never received. This mirrors `send-invite`.
- **Depends on** `RESEND_API_KEY` being set in Edge Function secrets, the same
  requirement as invitations.

## The app

**Sync engine**
- Each space keeps its epoch in meta (`syncEpoch:<space>`), and pulls bring the
  current one.
- **When a pull shows a higher epoch than this device holds**, in one Dexie
  transaction:
  - Delete every replicated row whose home is that space, and drop its outbox
    entries and cursor. For your own space, that also covers rows homed
    "everywhere": categories, settings, redirects and shared payment methods.
  - Keep settings and any local-only meta (theme, language, device keys).
  - Store the new epoch.
- **Then:**
  - Re-seed built-in categories (`ensureBuiltinCategories`).
  - Mark the settings row dirty, so it is pushed again under the new epoch.
- A push refused with `wiped` triggers a pull first, which runs the clearing
  above. The refused rows are dropped: they belonged to the erased data.
- The toast names the requester when known ("at Dana's request"), from the
  last `wipe_status`, and otherwise says "All data was deleted".

**Screens**
- Data & backup: the Delete section, the confirmation dialog, and the pending
  status (with Cancel for the requester).
- A `/wipe` route, beside `/link`: the review page with Confirm and Decline,
  remembering a pending token through sign-in as `pending-invite.ts` does.
- All copy in English and Hebrew.

**The local-only path** (not signed in) clears the device's Dexie data the same
way and re-seeds.

**Privacy page and README** get a sentence each: what deleting erases and that
linked deletion needs everyone's confirmation.

## Errors the person can see

| Situation | What they see |
|---|---|
| Email could not be sent | "Couldn't send the confirmation emails. Nothing was deleted. Try again." |
| A request is already pending | The pending status, not the button |
| A link for another account | "This request isn't for this account. Sign in as [email-masked] to answer it." |
| A link that's used, expired or cancelled | "This request is no longer open." |
| Offline when deleting | The button is disabled while offline (signed in), with "Connect to delete" |

## Testing

- **Database (PGlite, `wipes.sql.test.ts`):**
  - Erasing alone.
  - Erasing a household refused without confirmations.
  - The request → confirm → erase path for 2 and 3 members.
  - Decline, expiry, and requester cancelling.
  - A member joining or leaving mid-request cancels it.
  - A token used by the wrong account, or a second time, is refused.
  - A stale-epoch push and an epoch-less push after an erase are both refused.
  - The rate limit.
  - Nobody can read the tables directly.
- **Sync engine:**
  - A device pulling a higher epoch clears exactly that space's rows and keeps
    settings.
  - A refused push recovers.
  - Two linked devices converge on empty.
- **Screens (DOM tests):**
  - The typed-word gate, the alone flow, the linked request dialog, the
    pending status with Cancel, and the review page's states.
  - Each in English and Hebrew where the copy differs.
- **Browser (Playwright):** the alone flow end to end on the local build.

## Out of scope

Deleting the account itself (that exists, in Account), partial deletes (one
month, one card), and undo after the erase. The dialog's backup offer is the
undo.
