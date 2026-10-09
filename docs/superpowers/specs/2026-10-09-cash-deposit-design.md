# Cash deposit (קופת מזומן): design

**Status:** design approved in chat on 2026-10-09; this spec awaits review.
**Asked for by the user on 2026-10-08:** "add another pane in the bottom bar called cash deposit, this one is fully manual cause it cash … assign where the income is going into, and if its cash then it goes to the cash deposit, if two accounts have money in their cash deposit and they link, their cash deposit combines".

## Decisions the user made

1. **Cash is part of the main balance.** The feed's balance stays "all my money". The cash tab shows how much of that is cash right now. Cash income raises both the balance and the cash; paying cash lowers both. Nothing is counted twice.
2. **Money moves through withdraw, deposit and recount.**
   - "Withdrew from the ATM" moves money from the bank into cash.
   - "Deposited to the bank" moves it back.
   - Neither changes the total balance.
   - "Count my cash" corrects the figure when the wallet doesn't match.
3. **Income sent to a bank account is a label only.** It shows on the row and on that account's page. Only cash gets its own running amount. Per-account balances are out of scope.
4. **Linked accounts share one pot.** Their cash combines, and every amount keeps the person it came from. A per-person split is always possible, and unlinking separates the pot back.

## 1. Data model

Older builds will sync with this one during rollout. They reject a row outright when they meet an unknown value in a closed enum: transaction `kind` and payment-method `type`. A rejected row is skipped forever on that device (`src/db/sync/apply.ts`). So nothing here adds an enum value to an existing table.

### 1.1 Income destination: a new optional field on `Transaction`

- `destinationId?: string`. It is set only when `kind === 'income'`, and points at a `bank_account` payment method or at the built-in cash method `CASH_METHOD_ID` (`'pm.cash'`).
- It is a new field, not a reuse of `paymentMethodId`. Older builds' income forms drop `paymentMethodId`, and editing income there would clear it (`tx-edit.ts` `patchPaymentMethodId = null`). File import also rejects `paymentMethodId` on income (`transfer-validate.ts`).
- Older builds keep fields they don't know: sync stores the row as received, and edits spread the existing row. Section 6 covers this.
- **Series:** on a recurring income, the destination belongs to the series. Editing it uses the same scopes as any other field (only this time / from now on / every payment).
- **Validation:**
  - `destinationId` on an expense is invalid. The form never writes it; import rejects it.
  - A `destinationId` naming a method that doesn't exist or is archived is shown as "not assigned" and doesn't count as cash. It is never an error.

### 1.2 Recount tag: a new optional field on `Transaction`

- `cashCount?: true` marks an income or expense that a recount created. On every other row it is absent.
- A recount row is an ordinary cash row:
  - a "found" difference is income with `destinationId: 'pm.cash'`;
  - a "missing" difference is an expense with `paymentMethodId: 'pm.cash'`.
- Older builds see a normal cash income or expense, so their total balance is right.
- **Categories:** two new built-in categories, seeded the way existing built-ins are (`ensureBuiltin…`):
  - income `cat.cash_found`: en "Cash found", he "מזומן שנמצא";
  - expense `cat.cash_missing`: en "Cash missing", he "מזומן חסר".

### 1.3 Cash moves: a new synced table `cashMoves`

```ts
type CashMoveKind = 'start' | 'withdraw' | 'deposit' | 'count';

type CashMove = {
  readonly id: string;
  /** The person whose cash this is. Never SHARED_OWNER. */
  readonly profileId: string;
  /** Stored as a string so a later build can add kinds; unknown kinds are ignored in every sum. */
  readonly kind: string;
  /** Positive, in the household's base currency (one currency per household). */
  readonly amountMinor: number;
  readonly date: LocalDate;
  /** The bank account the money came from or went to. A label only. */
  readonly accountId?: string;
  readonly note?: string;
  readonly isDeleted: 0 | 1;
  readonly deletedAt?: IsoInstant;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
};
```

- **`start`** is the cash the person had when they began using the cash tab. It moves money from the balance into cash.
- **`withdraw`** takes money from the bank into cash. **`deposit`** takes money from cash to the bank.
- **`count`** is a zero-amount marker meaning "counted, and it matched". It contributes 0.
- None of these changes the total balance.
- Older builds don't know the table, so they never pull it. Their balance stays right, because these rows don't affect the total balance.
- **Storage plumbing** (`src/db/sync/route.ts` `homeOf`): the row lives in its owner's space, like a transaction. Like transactions, it has no `EVERYWHERE` replication. Also needed:
  - Dexie version 4 in `src/db/versions.ts` with `cashMoves: 'id, [profileId+isDeleted+date], updatedAt'`, declared on the DB class;
  - an entry in `SYNCED_TABLES` and `rowSchemas`;
  - inclusion in `shareWith`;
  - a `cashMoveSchema` in `transfer-schema.ts`, with `kind: z.string()`, which is deliberately loose.

### 1.4 What is not changed

- `Kind` stays `'income' | 'expense'`, and `PaymentMethodType` gains no value.
- `pm.cash` stays the one shared built-in cash method, `SHARED_OWNER`.
- Who owns an amount comes from the row's `profileId`, as everywhere else.

## 2. The cash amount (domain)

`src/domain/cash.ts` is a pure module.

### 2.1 Per person

```
cash(person, today) =
    Σ start + Σ withdraw − Σ deposit              (moves dated ≤ today, not deleted)
  + Σ income occurrences with destinationId = pm.cash          (dated ≤ today)
  − Σ expense occurrences with paymentMethodId = pm.cash       (dated ≤ today)
```

The sum uses rows dated on or after that person's **first `start` move**. Cash rows from before someone set up the tab never count, so old cash spending can't drive the figure negative.

- **Not set up:** a person with no `start` move has no cash figure. The tab shows the setup prompt for them; see 3.2.
- **Occurrences:** the same materialised occurrences the feed uses, including recurring series, skips and overrides, and nothing projected after today.
- **Upcoming:** future cash income and spending in the viewed month is shown separately as "expected", like the forecast. It is never part of the on-hand figure.
- **Amounts:** recount rows are ordinary cash rows, so they already count. Amounts use each row's base amount (`baseAmountMinor`), as the balance does.

### 2.2 All

The "all" view adds up the people who have set up the cash tab. The breakdown keeps each person's figure.

### 2.3 Negative cash

The figure can go below zero (more cash spending recorded than cash on hand). It is shown as it is, with the hint "More spent in cash than you have. Count your cash?" / "יותר הוצאות במזומן ממה שיש. לספור את המזומן?".

### 2.4 Card settlement

`settleDate` (`src/domain/cards.ts`) applies card billing timing to rows with a card `paymentMethodId`. That must never apply to income. Make `kind === 'expense'` an explicit condition there, with a test. Income never has a `paymentMethodId` today, so this only guards the future.

## 3. The cash tab

### 3.1 Navigation

- `NavKey` and `NAV_ORDER` gain `'cash'` after `'cards'`, giving 4 tabs. The route is `/cash` and the icon is lucide `Wallet`.
- Copy: `nav.cash` en "Cash", he "מזומן". The screen title is en "Cash", he "קופת מזומן".
- The comment in `routes.ts` that argues against more tabs is updated to say why this one earned a slot: it is a place you check, not an action.

### 3.2 Screen

The screen follows the redesign's pattern: `ScreenPanel` with `PanelSheet`.

**Panel:**

- the cash on hand as a serif figure;
- the `ProfileSwitcher` pills (all / a person);
- a line "Counted {date}" / "נספר ב-{date}", using the latest recount, or the `start` date if there's no recount.

**Sheet:**

- **Expected this month:** a line with the coming cash income and spending.
- **Activity:** newest first, grouped by day, the same row style as the feed. It covers:
  - cash income and cash spending, which are the real transactions and open the edit form as in the feed;
  - withdrawals, deposits and the start amount, which open their own form;
  - recount rows, tagged "Recount" / "ספירה".
- **Person avatars:** each row shows its person's avatar when the "all" view is on.

**First visit for a person:** a card asks "How much cash do you have now?" / "כמה מזומן יש לך עכשיו?". It has an amount field and a Save button, and Save writes the `start` move for today. Each person sets up separately, and the "all" view lists who hasn't yet.

### 3.3 Adding

The cash tab has its own "+ הוספה" pill, using the redesign's AddButton. Its menu is:

1. משיכה מכספומט / Withdraw from ATM
2. הפקדה לבנק / Deposit to the bank
3. ספירת מזומן / Count my cash
4. (divider)
5. הוצאה במזומן / Cash expense. This opens the normal add form preset to expense with `paymentMethodId = pm.cash`.
6. הכנסה במזומן / Cash income. This opens the normal add form preset to income with `destinationId = pm.cash`.

**Withdraw and deposit** open a small sheet:

- amount;
- date (default today);
- person (default the active one, or me);
- bank account (optional; it lists that person's accounts and the joint accounts they hold);
- note.

Save, edit and delete each offer Undo, through the same undo and staleness-guard pattern the feed uses (`applyUndoablePlan`-style, atomic, refused if the rows changed since).

**Count my cash** asks "How much is in the wallet now?" and shows the difference live ("12 ₪ more than recorded" / "30 ₪ missing").

- **Save with a difference:** writes one recount row (2.1) dated today, with Undo.
- **Save with no difference:** writes a zero-amount `cashMoves` row with `kind: 'count'` dated today, so "Counted {date}" stays truthful. Being a move, it never touches the balance. It adds nothing to the sum and is ignored by older builds. The figure itself treats `count` like any unknown kind (contributes 0). "Counted" shows the latest recount row or `count` move, otherwise the start date.

### 3.4 Income destination in the transaction form

- Income gets a "Goes to" / "נכנס ל" picker, placed where expenses have "Paid with".
- **Options:** the person's bank accounts and joint accounts they hold, then מזומן / Cash, then "Not assigned".
- **Default for new income:** the account this person's income went to most often in the last 6 months. If there is none, "Not assigned". Destination is optional and saving never requires it.
- **Changing "Whose?"** clears a destination the new person can't use, by the same rule `methodOwnedBy` applies to methods.
- **Cards:** never offered, since income doesn't land on a card.
- **The feed row** for income shows the destination the way an expense shows its card: the bank's mark (from the logos work) or the cash icon.

### 3.5 Bank account page

Each account panel on the bank accounts screen gets an "Incoming" line next to the card bills line. It shows the next expected income assigned to that account, for example "Salary · 10 Nov · 12,400 ₪", and links to the feed filtered to that account.

## 4. Linked accounts

- **One combined pot:** each device sums the cash rows and moves it can see across linked people, which gives the pot. Each amount's person is its row's `profileId`, so the per-person pills split the pot exactly.
- **Unlinking:** `forgetSpace` removes the other person's rows, including their `cashMoves`, from this device. The pot shrinks back to this person's own cash, and nothing has to be split by hand.
- **One currency:** a household has one currency, so the pot is in that currency.

## 5. Delete all data, export and import

- **Delete all data** (the `wipes` feature) must include `cashMoves`. Add it wherever that feature lists tables, and test that a wipe leaves no cash moves.
- **Export and import:** the envelope (`envelopeSchema` data and counts) gains `cashMoves`.
  - `transfer-validate.ts` allows `destinationId` on income and rejects it on expense, and allows `cashCount`.
  - Importing a file from before this feature works unchanged: there are no cash moves and no destinations.

## 6. Older builds during rollout

| Older build sees               | Effect                                                                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| an income with `destinationId` | It parses: plain `z.object` strips unknown keys when parsing, but sync stores the raw row. The balance is unaffected. Editing that income on the old build keeps the field, because edits spread the row. |
| a recount row (`cashCount`)    | It is a normal cash income or expense, and the balance is right.                                                                                                                                          |
| `cashMoves`                    | It doesn't know the table, so it never pulls it. The balance is right, because moves are balance-neutral.                                                                                                 |
| the new built-in categories    | They sync like any category. The old build shows them by name and doesn't need to know what they mean.                                                                                                    |

**Tests that pin this table:**

1. A transaction with `destinationId` and `cashCount` round-trips through `transactionSchema`, the sync apply path and an edit, and keeps both fields.
2. An older-shaped row (no new fields) still works everywhere.

## 7. Edge cases

- A person's cash rows dated before their `start` move are ignored by the cash figure, though they still count in the balance as always.
- Editing the `start` amount or date recomputes everything. Deleting it returns that person to "not set up", and Undo restores it.
- A withdrawal names a bank account that is later deleted: the label falls back to "a bank account", and the money is unaffected.
- A row moves from one person to another by changing "Whose?": its cash goes with it, because the sum follows `profileId`.
- The figure at 320 px in Hebrew may be large, for example 1,234,567.89 ₪. It must fit the panel, using the same figure rules as the balance.
- Archived bank accounts and cards are not offered as a destination or as a withdraw/deposit account. Existing rows that point at one keep the label.

## 8. Tests

- **Domain** (`cash.test.ts`):
  - every term of 2.1;
  - the start cutoff;
  - not set up;
  - negative cash;
  - "all" adding only people who set up;
  - unknown move kinds ignored;
  - future rows excluded from on-hand and included in expected;
  - recurring cash income.
- **DB:**
  - the cash-moves repo: create, edit, delete, Undo, and refusing a stale undo;
  - the recount write;
  - the Dexie v4 upgrade on an existing database;
  - sync routing (`homeOf` puts moves in the owner's space);
  - `forgetSpace` drops the other person's moves;
  - wipe.
- **Schema and compatibility:** section 6's tests; transfer validation for `destinationId` and `cashCount`; export/import round-trip with moves.
- **DOM:**
  - the setup card;
  - the add menu;
  - the withdraw/deposit sheet;
  - Count my cash with its live difference;
  - the income "Goes to" picker (its default, clearing on "Whose?", no cards);
  - the feed income chip;
  - the bank account "Incoming" line.
- **E2E** (en and he):
  1. set up cash at 500;
  2. withdraw 200;
  3. pay 50 cash;
  4. confirm 650 on hand while the feed balance moved only by −50;
  5. recount to 640 → a "missing 10" row, and the balance moves by −10.

  Also: axe with the cash tab and its sheets open; every new control at 44px; the 4-tab bar at 320 px in Hebrew.

## 9. Out of scope

- Per-bank-account balances.
- Cash in a foreign currency kept as foreign notes. Cash is entered in the household's currency, like everything else.
- Counting notes and coins by denomination.
- ATM fees as part of a withdrawal. Add them as a normal expense.
- Transfers between two bank accounts.
