# Cash Deposit (קופת מזומן) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth tab, Cash (קופת מזומן), that shows how much of the balance is cash on hand. Cash moves in through cash income, withdrawals and a start amount. It moves out through cash spending and deposits. A recount corrects it. Income can say which account or cash it goes to, and linked accounts share one pot.

**Architecture:** Two optional fields on `Transaction` (`destinationId`, `cashCount`) and one new synced Dexie table (`cashMoves`). None of them adds an enum value, so older builds keep working during the rollout. A pure module, `src/domain/cash.ts`, computes each person's cash from the materialised occurrences and the moves, and the Cash screen renders what it returns. Writes to moves go through a small repository whose Undo uses the feed's staleness guard: it refuses if the rows changed since.

**Tech Stack:** React 19, TypeScript, Dexie 4 (IndexedDB), zod 4, react-hook-form, Base UI (shadcn-style wrappers in `src/components/ui`), i18next (en + he, RTL), Tailwind v4, Vitest (projects `unit`, `db`, `dom`), Playwright (projects `en`, `he`, `mobile`) with `@axe-core/playwright`.

**Spec:** `docs/superpowers/specs/2026-10-09-cash-deposit-design.md` (approved; binding). Every executor reads the spec section their task names.

## Global Constraints

- **Toolchain:** Node and pnpm are NOT on a fresh shell's PATH. Every shell command in this plan that runs `pnpm`, `node` or `git commit` (the hook runs pnpm) must start with `export PATH="/c/Users/HighL/AppData/Local/node:$PATH" && cd /c/dev/greenback && ` in Bash, or `$env:PATH = "C:\Users\HighL\AppData\Local\node;" + $env:PATH; Set-Location C:\dev\greenback; ` in PowerShell. The commands below omit this prefix for brevity. Always add it.
- **Running tests:** `pnpm test --project <unit|db|dom> <file> [-t "<name>"]` (`pnpm test` is `cross-env TZ=Etc/UTC vitest run`). Project mapping: `unit` = `src/{lib,domain,i18n,data}/**/*.test.ts`; `db` = `src/{db,services,features}/**/*.test.ts`; `dom` = `src/**/*.test.tsx` and `src/app/**/*.test.ts`.
- **No new enum values on existing tables (spec §1):** `Kind` stays `'income' | 'expense'`, and `PaymentMethodType` gains no value. `pm.cash` (`CASH_METHOD_ID`) stays the one shared built-in cash method, owned by `SHARED_OWNER`.
- **`destinationId`** is set only when `kind === 'income'`. It points at a `bank_account` payment method or at `'pm.cash'`. The form never writes it on an expense, and import rejects it on an expense. If it names a method that is missing, it is shown as "not assigned" and never raises an error.
- **`cashCount?: true`** appears only on an income or expense that a recount wrote.
- **`CashMove.kind` is stored as a string** and validated with `z.string()`, deliberately loose. Kinds this build knows: `'start' | 'withdraw' | 'deposit' | 'count'`. An unknown kind contributes 0 to every sum, and so does `count`.
- **Dexie version 4** adds exactly `cashMoves: 'id, [profileId+isDeleted+date], updatedAt'`.
- **Built-in categories (verbatim):** income `cat.cash_found`, en "Cash found", he "מזומן שנמצא"; expense `cat.cash_missing`, en "Cash missing", he "מזומן חסר".
- **Copy (verbatim from the spec):** `nav.cash` en "Cash", he "מזומן". Screen title en "Cash", he "קופת מזומן". "Counted {date}" / "נספר ב-{date}". "How much cash do you have now?" / "כמה מזומן יש לך עכשיו?". Negative hint: "More spent in cash than you have. Count your cash?" / "יותר הוצאות במזומן ממה שיש. לספור את המזומן?". "Recount" / "ספירה". Menu: "Withdraw from ATM" / "משיכה מכספומט", "Deposit to the bank" / "הפקדה לבנק", "Count my cash" / "ספירת מזומן", "Cash expense" / "הוצאה במזומן", "Cash income" / "הכנסה במזומן". "Goes to" / "נכנס ל". Cash option "Cash" / "מזומן". "How much is in the wallet now?". The add pill label stays the existing "Add" / "הוספה".
- **UI copy never says "sync"** (user rule): say "account" and "saved".
- **Money:** integer minor units only. `gate:money` bans `parseFloat`, `.toFixed(`, `* 100` and `/ 100` outside `src/lib/money.ts`. Parse typed amounts with `AmountInput` / `toMinor`, and render with `<Money>`, which carries `data-value` = the integer.
- **Dates:** `LocalDate` strings only. No `new Date()` or `Date.now()` outside `src/lib/clock.ts`. Use `useToday()`, `systemClock.nowIso()` and the `@/lib/dates` helpers.
- **RTL:** `gate:rtl` bans physical-direction utilities (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, …). Use `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start` and `text-end`.
- **Layering (lint-enforced):** `types → lib → i18n → domain → {db, services} → features → app`. `domain/` never imports `db/`. `useLiveQuery` is called only in hooks and route containers, never in a leaf component.
- **i18n:** every visible string goes through `t()`. The `he` JSON must mirror `en` key for key (`tsc` enforces it). A missing key throws in tests. Hebrew plurals need `_one`, `_two` and `_other`; English plurals need `_one` and `_other`.
- **Targets:** every new tappable control is at least 44px tall on a phone (`min-h-11` / `size-11`).
- **Commits:** one per task, made only when that task's tests pass. The message is a plain English sentence in the repo's style (see `git log -15`), and its body ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The pre-commit hook runs eslint --fix and prettier on staged files. Never pass `--no-verify`. If the hook rewrites files, stage them again and commit again.
- **Per-task gate:** `pnpm typecheck` and `pnpm lint` pass, plus that task's tests. The full `pnpm verify` runs in Task 11.

## Review Focus

These are the inputs most likely to bite a person that the spec's own test list does not pin down. Each one has a test in the task named.

1. **One payment of a recurring salary sent elsewhere ("Only this one").** A per-occurrence override of `destinationId` must decide whether that single occurrence is cash, both in the figure and in the form. Tests are in Task 1 (expansion and series edit) and Task 3 (`personCash`).
2. **Switching the form between Expense and Income.** An expense paid in cash, switched to income, must not save `paymentMethodId`. An income sent to cash, switched to expense, must not save `destinationId`, or the cash would count twice or the row would fail import. Tests are in Task 6 (`txFormSchema` transform) and Task 7 (the sheet).
3. **Deleting a person, or merging them into an account (`deleteProfile` with `reassignTo`, `ensureMember`).** Their cash moves must follow to the new person, or be removed when there is no new person. Otherwise orphan moves keep counting in "all" for someone who no longer exists. The test is in Task 4.
4. **A withdrawal or deposit of 0, any negative or non-integer amount, an unknown kind, or `SHARED_OWNER` as the person.** The repository refuses it and writes nothing. Only two moves may be 0: a `count`, which must be exactly 0, and a `start`, for someone who has no cash. Tests are in Task 5 (repository) and Task 10 (the sheet keeps Save disabled).
5. **Counting cash in the "all" view of a two-person pot.** The difference is that person's counted amount minus that person's own figure, never the whole pot's. Tests are in Task 5 (`recordCount`) and Task 10 (the count sheet's live difference).

## File Structure

| File                                                                                                                                       | Responsibility                                                                                                                                 | Task  |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `src/types/domain.ts`                                                                                                                      | `Transaction.destinationId`, `Transaction.cashCount`, `OverridePatch.destinationId`, `Occurrence.destinationId`, `CashMove`, `CASH_MOVE_KINDS` | 1     |
| `src/domain/occurrences.ts`                                                                                                                | the effective `destinationId` per occurrence                                                                                                   | 1     |
| `src/domain/series-edit.ts`                                                                                                                | `TransactionPatch.destinationId` through every scope                                                                                           | 1     |
| `src/domain/cards.ts`                                                                                                                      | `settleDate` never moves income                                                                                                                | 1     |
| `src/domain/transfer-schema.ts`                                                                                                            | zod for the new fields, `cashMoveSchema`, `rowSchemas.cashMoves`, envelope `cashMoves`                                                         | 2     |
| `src/domain/transfer-validate.ts`                                                                                                          | `destinationId` allowed on income and refused on expense; counts for `cashMoves`                                                               | 2     |
| `src/domain/cash.ts` (new)                                                                                                                 | the cash figure, "counted", expected, activity, category ids                                                                                   | 3     |
| `src/db/versions.ts`, `src/db/db.ts`                                                                                                       | Dexie v4 `cashMoves`                                                                                                                           | 4     |
| `src/db/sync/tables.ts`, `route.ts`, `spaces.ts`                                                                                           | syncing `cashMoves` in the owner's space                                                                                                       | 4     |
| `src/db/transfer.ts`                                                                                                                       | export/import of `cashMoves`                                                                                                                   | 4     |
| `src/db/seed.ts`, i18n `categories.json`                                                                                                   | two built-in categories                                                                                                                        | 4     |
| `src/db/repos/profiles.ts`, `src/db/members.ts`                                                                                            | moves follow a deleted or merged person                                                                                                        | 4     |
| `src/db/repos/cash-moves.ts` (new)                                                                                                         | add/edit/delete moves and record a count, each with a guarded Undo                                                                             | 5     |
| `src/domain/tx-form.ts`, `tx-edit.ts`, `src/db/save-transaction.ts`                                                                        | `destinationId` in the form schema, the edit patch and save                                                                                    | 6     |
| `src/domain/income-destination.ts` (new)                                                                                                   | destination options, the 6-month default, the next income per account                                                                          | 6, 8  |
| `src/features/transaction/destination-field.tsx` (new), `use-income-history.ts` (new), `transaction-sheet.tsx`, `use-transaction-sheet.ts` | the "Goes to" picker and the cash presets                                                                                                      | 7     |
| `src/features/feed/feed-rows.tsx`, `src/domain/feed.ts`, `src/features/feed/feed-screen.tsx`                                               | the income destination chip, and the `pm` filter matching destinations                                                                         | 8     |
| `src/features/bank-accounts/bank-accounts-screen.tsx`, `use-incoming.ts` (new)                                                             | the "Incoming" line                                                                                                                            | 8     |
| `src/app/routes.ts`, `app-routes.tsx`, `app-shell.tsx`                                                                                     | the fourth tab                                                                                                                                 | 9     |
| `src/features/cash/*` (new)                                                                                                                | the screen, its data hook, the setup card, the activity list, the menu and the sheets                                                          | 9, 10 |
| `e2e/15-cash.spec.ts` (new), `e2e/00-shell.spec.ts`, `e2e/07-a11y.spec.ts`                                                                 | end-to-end gates                                                                                                                               | 11    |
| `README.md`                                                                                                                                | the Design decisions entry                                                                                                                     | 11    |

**Decomposition note:** the suggested decomposition had 8 tasks. Three of them are split here. "DB and sync plumbing" becomes Task 4 (storage and sync) and Task 5 (the undoable repository), because a reviewer can reject the Undo design while approving the table. "Income destination" becomes Task 6 (pure schema, patch and save) and Task 7 (the sheet UI), because together they would touch more than 1,300 lines of `transaction-sheet.tsx`. The bank account "Incoming" line moves into Task 8 with the feed chip, since both read the same `income-destination.ts`. The sync-apply compatibility test sits in Task 2: it needs only the existing `transactions` table, so section 6 is pinned before any storage changes.

---

### Task 1: The income destination and the recount tag in the domain types, expansion and series edits

Spec sections: §1.1, §1.2, §1.3 (the type only), §2.4.

**Files:**

- Modify: `src/types/domain.ts:388-407` (`Transaction`), `:442-449` (`OverridePatch`), `:484-497` (`Occurrence`), and add `CashMove` before `export type Settings` (`:545`)
- Modify: `src/domain/occurrences.ts:174-192` (`effectiveOccurrence`)
- Modify: `src/domain/series-edit.ts:29-40` (`TransactionPatch`), `:120-136` (`applyToTransaction`), `:138-165` (`overrideFor`)
- Modify: `src/domain/cards.ts:69-92` (`Billed`, `settleDate`)
- Test: `src/domain/occurrences.test.ts`, `src/domain/series-edit.test.ts`, `src/domain/cards.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces (later tasks rely on these exact names):
  - `Transaction.destinationId?: string`, `Transaction.cashCount?: true`
  - `OverridePatch.destinationId?: string | null`
  - `Occurrence.destinationId?: string`, which is the effective destination after any override
  - `TransactionPatch.destinationId?: string | null` in `src/domain/series-edit.ts`
  - `export const CASH_MOVE_KINDS = ['start', 'withdraw', 'deposit', 'count'] as const;`
  - `export type CashMoveKind = (typeof CASH_MOVE_KINDS)[number];`
  - `export type CashMove = { id; profileId; kind: string; amountMinor; date: LocalDate; accountId?; note?; isDeleted: 0 | 1; deletedAt?: IsoInstant; createdAt; updatedAt }` (all `readonly`), from `@/types/domain`
  - `settleDate(occurrence, methods)` now returns `occurrence.date` for any occurrence whose `transaction.kind` is not `'expense'`

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/occurrences.test.ts`:

```ts
describe('the income destination', () => {
  const salary = {
    date: d('2026-01-10'),
    recurrence: { type: 'monthly' as const, dayOfMonth: 10 },
    kind: 'income' as const,
    categoryId: 'cat.salary',
  };

  it('inherits the series’ destination', () => {
    const tx = makeTx({ ...salary, destinationId: 'pm.leumi' });
    const o = expandOccurrences(tx, [], d('2026-02-10'), d('2026-02-10'), opts)[0]!;
    expect(o.destinationId).toBe('pm.leumi');
  });

  it('carries no destination when the series has none', () => {
    const o = expandOccurrences(makeTx(salary), [], d('2026-02-10'), d('2026-02-10'), opts)[0]!;
    expect(o).not.toHaveProperty('destinationId');
  });

  it('takes one payment’s own destination from its override, and clears it with null', () => {
    const ov = [
      modify('tx1', d('2026-02-10'), { destinationId: 'pm.cash' }),
      modify('tx1', d('2026-03-10'), { destinationId: null }),
    ];
    const tx = makeTx({ ...salary, destinationId: 'pm.leumi' }, ov);
    const [feb, mar, apr] = expandOccurrences(tx, ov, d('2026-02-01'), d('2026-04-30'), opts);
    expect(feb?.destinationId).toBe('pm.cash');
    expect(mar?.destinationId).toBeUndefined();
    expect(apr?.destinationId).toBe('pm.leumi');
  });
});
```

Append to `src/domain/series-edit.test.ts`:

```ts
describe('the income destination', () => {
  const salary = (over: Partial<Transaction> = {}): Transaction =>
    monthly({ kind: 'income', categoryId: 'cat.salary', destinationId: 'pm.leumi', ...over });

  it('sends one payment to cash as an override, leaving the series where it was', () => {
    const result = plan({
      transaction: salary(),
      scope: 'one',
      at: d('2026-06-10'),
      patch: { destinationId: 'pm.cash' },
    });
    expect(result.transactions).toEqual([]);
    expect(result.overrides[0]).toMatchObject({
      action: 'modify',
      occurrenceDate: '2026-06-10',
      patch: { destinationId: 'pm.cash' },
    });
  });

  it('moves the whole series, and clears it with null', () => {
    const moved = plan({
      transaction: salary(),
      scope: 'all',
      at: d('2026-06-10'),
      patch: { destinationId: 'pm.cash' },
    });
    expect(moved.transactions[0]?.destinationId).toBe('pm.cash');

    const cleared = plan({
      transaction: salary(),
      scope: 'all',
      at: d('2026-06-10'),
      patch: { destinationId: null },
    });
    expect(cleared.transactions[0]?.destinationId).toBeUndefined();
  });

  it('sends this and later payments to cash through the split, and keeps the earlier ones', () => {
    const result = plan({
      transaction: salary(),
      scope: 'future',
      at: d('2026-06-10'),
      patch: { destinationId: 'pm.cash' },
    });
    const [original, continuation] = result.transactions;
    expect(original?.destinationId).toBe('pm.leumi');
    expect(continuation?.destinationId).toBe('pm.cash');
  });

  it('keeps a recount’s tag through an edit of its note', () => {
    const recount = makeTx({
      id: 'rc',
      date: d('2026-06-10'),
      recurrence: { type: 'one_time' },
      paymentMethodId: 'pm.cash',
      cashCount: true,
    });
    const result = plan({
      transaction: recount,
      scope: 'all',
      at: d('2026-06-10'),
      patch: { note: 'wallet' },
    });
    expect(result.transactions[0]).toMatchObject({
      cashCount: true,
      paymentMethodId: 'pm.cash',
      note: 'wallet',
    });
  });
});
```

In `src/domain/cards.test.ts`, add this test inside `describe('the billing day', …)`, after `'moves only what a billing card paid for'`:

```ts
it('never moves income, even one that names a billing card', () => {
  const all = methods(card());
  const salary = makeTx({
    id: 's',
    kind: 'income',
    categoryId: 'cat.salary',
    date: d('2026-10-05'),
    recurrence: { type: 'one_time' },
    paymentMethodId: 'visa',
  });
  const [o] = expandOccurrences(salary, [], d('2026-10-01'), d('2026-10-31'), { today: TODAY });
  expect(settleDate(o!, all)).toBe('2026-10-05');
  // An expense on the same card still waits for its bill.
  expect(
    settleDate({ date: d('2026-10-05'), paymentMethodId: 'visa', transaction: { kind: 'expense' } }, all),
  ).toBe('2026-11-10');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --project unit src/domain/occurrences.test.ts src/domain/series-edit.test.ts src/domain/cards.test.ts`
Expected: FAIL. `feb?.destinationId` is `undefined` where `'pm.cash'` is expected, `moved.transactions[0]?.destinationId` is `undefined`, and `settleDate` returns `'2026-11-10'` for the salary. Vitest does not type-check, so type errors show up only in `pnpm typecheck`.

- [ ] **Step 3: Add the types**

In `src/types/domain.ts`, in `Transaction`, directly after `readonly paymentMethodId?: string;`:

```ts
  /**
   * Income only: where the money went - a `bank_account` payment method, or
   * CASH_METHOD_ID. For an account it is a label; for cash it is what the
   * cash tab counts.
   *
   * Its own field rather than `paymentMethodId`: an older build's income form
   * drops a method from income when the row is edited there, while it keeps a
   * field it does not know (edits spread the row; sync stores it as received).
   */
  readonly destinationId?: string;
  /**
   * Set on the income ("found") or expense ("missing") a cash recount wrote.
   * Absent on every other row. To an older build it is an ordinary cash row.
   */
  readonly cashCount?: true;
```

In `OverridePatch`, after `readonly paymentMethodId?: string | null;`:

```ts
  /** Income only: one payment's own destination. `null` clears it. */
  readonly destinationId?: string | null;
```

In `Occurrence`, after `readonly paymentMethodId?: string;`:

```ts
  /** Income only: the effective destination, after any override. */
  readonly destinationId?: string;
```

Directly before `export type Settings = {`:

```ts
/** The moves this build understands. Stored as a plain string, so a later build can add more. */
export const CASH_MOVE_KINDS = ['start', 'withdraw', 'deposit', 'count'] as const;
export type CashMoveKind = (typeof CASH_MOVE_KINDS)[number];

/**
 * Cash moving without the balance moving: the cash someone had when they
 * started (`start`), money taken from the bank (`withdraw`) or put back
 * (`deposit`), and a count that matched (`count`, always 0).
 *
 * `kind` is a string, not `CashMoveKind`: an older build rejects a row that
 * carries an enum value it does not know, so this table is open from the
 * start, and every sum ignores a kind it does not know.
 */
export type CashMove = {
  readonly id: string;
  /** The person whose cash this is. Never SHARED_OWNER. */
  readonly profileId: string;
  readonly kind: string;
  /** Positive, in the household's base currency; 0 only for `count`. */
  readonly amountMinor: Minor;
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

- [ ] **Step 4: Carry the destination through expansion**

In `src/domain/occurrences.ts` `effectiveOccurrence`, after the `const paymentMethodId = …;` statement:

```ts
const destinationId =
  patch && 'destinationId' in patch ? (patch.destinationId ?? undefined) : tx.destinationId;
```

In the returned object, after `...(paymentMethodId === undefined ? {} : { paymentMethodId }),`:

```ts
    ...(destinationId === undefined ? {} : { destinationId }),
```

- [ ] **Step 5: Carry it through series edits**

In `src/domain/series-edit.ts` `TransactionPatch`, after `readonly paymentMethodId?: string | null;`:

```ts
  /** Income only. `null` clears it; `undefined` leaves it alone. */
  readonly destinationId?: string | null;
```

In `applyToTransaction`, after the `paymentMethodId` spread line:

```ts
    ...(patch.destinationId === undefined ? {} : { destinationId: patch.destinationId ?? undefined }),
```

In `overrideFor`'s `patch: { … }`, after the `paymentMethodId` spread line:

```ts
      ...(patch.destinationId === undefined ? {} : { destinationId: patch.destinationId }),
```

- [ ] **Step 6: Never move income by a card's billing day**

In `src/domain/cards.ts`, change the `Billed` type to:

```ts
type Billed = Pick<Occurrence, 'date'> & { readonly transaction?: Pick<Transaction, 'deferral' | 'kind'> };
```

and make `settleDate`:

```ts
export function settleDate(
  occurrence: Pick<Occurrence, 'date' | 'paymentMethodId'> & Billed,
  methods: ReadonlyMap<string, PaymentMethod>,
): LocalDate {
  // A billing day is about money leaving. Income lands on its own date, whatever
  // method a row names - only an expense waits for a card's bill.
  if (occurrence.transaction !== undefined && occurrence.transaction.kind !== 'expense') {
    return occurrence.date;
  }
  const id = occurrence.paymentMethodId;
  const day = id === undefined ? undefined : billingDayOf(methods.get(id));
  return day === undefined ? occurrence.date : billedOn(occurrence, day);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test --project unit src/domain/occurrences.test.ts src/domain/series-edit.test.ts src/domain/cards.test.ts`
Expected: PASS.

Run: `pnpm typecheck`
Expected: no errors. If `typecheck` reports a call to `settleDate` with a hand-built `transaction` that lacks `kind`, add `kind` to that literal. Do not loosen the type.

- [ ] **Step 8: Commit**

```bash
git add src/types/domain.ts src/domain/occurrences.ts src/domain/occurrences.test.ts src/domain/series-edit.ts src/domain/series-edit.test.ts src/domain/cards.ts src/domain/cards.test.ts
git commit -m "Income can say where it went, a recount marks its rows, and a card's billing day never moves income" -m "Transaction gains destinationId and cashCount, an override can send one payment elsewhere, and the series edit carries the destination through every scope. The CashMove type is added for the cash tab. settleDate now returns income's own date whatever method a row names." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Schemas, file validation, and the older-build compatibility tests

Spec sections: §1.1 (validation), §1.3 (`cashMoveSchema`), §5 (`transfer-validate`), §6 (both tests).

The envelope's `cashMoves` (the export/import format) is **not** in this task. It needs the Dexie table, so Task 4 adds it.

**Files:**

- Modify: `src/domain/transfer-schema.ts:1-7` (imports), `:249-269` (`transactionSchema`), `:272-280` (`patchSchema`), `:323-330` (`rowSchemas`)
- Modify: `src/domain/transfer-validate.ts:23-28` and `:44-98` (`crossEntityIssues`)
- Create: `src/domain/transfer-schema.test.ts`
- Test: `src/domain/transfer-validate.test.ts`, `src/db/sync/apply.test.ts`

**Interfaces:**

- Consumes (Task 1): `Transaction.destinationId`, `Transaction.cashCount`, `OverridePatch.destinationId`, `CashMove`.
- Produces:
  - `rowSchemas.cashMoves`, a zod object for `CashMove` (`kind: z.string()`). `applyPage` uses it as soon as Task 4 adds `'cashMoves'` to `SYNCED_TABLES`.
  - `export const cashMoveSchema` in `src/domain/transfer-schema.ts`. Task 4 uses it in the envelope.
  - `rowSchemas.transactions` accepts `destinationId?: string` and `cashCount?: true`. `rowSchemas.overrides` accepts `patch.destinationId?: string | null`.
  - `validateEnvelope` refuses `destinationId` on an expense (path `transactions.<id>.destinationId`) and on an override of an expense (path `overrides.<id>.patch.destinationId`).

- [ ] **Step 1: Write the failing schema tests**

Create `src/domain/transfer-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { rowSchemas } from './transfer-schema';

const AT = '2026-10-01T00:00:00.000Z';

const transaction = {
  id: 'tx1',
  profileId: 'p1',
  kind: 'income',
  categoryId: 'cat.salary',
  money: {
    amountMinor: 1_240_000,
    currency: 'ILS',
    baseCurrency: 'ILS',
    baseAmountMinor: 1_240_000,
    rateUsed: '1',
    rateDate: '2026-10-01',
    rateSource: 'manual',
  },
  recurrence: { type: 'one_time' },
  date: '2026-10-01',
  seriesStart: '2026-10-01',
  seriesEnd: '2026-10-01',
  isDeleted: 0,
  seriesRootId: 'tx1',
  createdAt: AT,
  updatedAt: AT,
};

/*
 * Section 6 of the cash design: what this build writes must read back
 * whole, and what an older build wrote must still read.
 */
describe('a transaction row, read by the schema sync and import share', () => {
  it('keeps where income went and the recount tag', () => {
    const parsed = rowSchemas.transactions.parse({
      ...transaction,
      destinationId: 'pm.cash',
      cashCount: true,
    });
    expect(parsed).toMatchObject({ destinationId: 'pm.cash', cashCount: true });
  });

  it('still reads a row from before either existed, and adds neither', () => {
    const parsed = rowSchemas.transactions.parse(transaction);
    expect(parsed).not.toHaveProperty('destinationId');
    expect(parsed).not.toHaveProperty('cashCount');
  });

  it('refuses a recount tag that is not exactly true', () => {
    expect(rowSchemas.transactions.safeParse({ ...transaction, cashCount: false }).success).toBe(false);
    expect(rowSchemas.transactions.safeParse({ ...transaction, destinationId: '' }).success).toBe(false);
  });

  it('reads an override that sends one payment elsewhere, or clears where it went', () => {
    for (const destinationId of ['pm.cash', null]) {
      const override = {
        id: 'o1',
        transactionId: 'tx1',
        occurrenceDate: '2026-10-01',
        action: 'modify',
        patch: { destinationId },
        createdAt: AT,
        updatedAt: AT,
      };
      expect(rowSchemas.overrides.safeParse(override).success).toBe(true);
    }
  });
});

describe('a cash move', () => {
  const move = {
    id: 'm1',
    profileId: 'p1',
    kind: 'withdraw',
    amountMinor: 20_000,
    date: '2026-10-01',
    isDeleted: 0,
    createdAt: AT,
    updatedAt: AT,
  };

  it('is read with its account and note', () => {
    expect(rowSchemas.cashMoves.parse({ ...move, accountId: 'pm.leumi', note: 'ATM' })).toMatchObject({
      accountId: 'pm.leumi',
      note: 'ATM',
    });
  });

  it('keeps a kind a later build added, rather than refusing the row', () => {
    expect(rowSchemas.cashMoves.parse({ ...move, kind: 'exchange' }).kind).toBe('exchange');
  });

  it('takes a count of zero', () => {
    expect(rowSchemas.cashMoves.safeParse({ ...move, kind: 'count', amountMinor: 0 }).success).toBe(true);
  });

  it('refuses the shared owner, a negative or fractional amount, a bad date and an empty kind', () => {
    for (const bad of [
      { profileId: '*' },
      { amountMinor: -1 },
      { amountMinor: 1.5 },
      { date: '2026-02-30' },
      { kind: '' },
    ]) {
      expect(rowSchemas.cashMoves.safeParse({ ...move, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Write the failing validation tests**

Append to `src/domain/transfer-validate.test.ts`:

```ts
describe('where income went, and what a recount wrote', () => {
  const salary = {
    id: 'cat.salary',
    kind: 'income',
    icon: 'Wallet',
    sortOrder: 0,
    isArchived: 0,
    source: 'builtin',
    nameKey: 'categories:builtin.salary',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  function withRow(row: Record<string, unknown>, overrides: unknown[] = []): unknown {
    const doc = envelope() as ExportEnvelope;
    return {
      ...doc,
      counts: { ...doc.counts, categories: 2, overrides: overrides.length },
      data: {
        ...doc.data,
        categories: [...doc.data.categories, salary],
        transactions: [{ ...doc.data.transactions[0]!, ...row }],
        overrides,
      },
    };
  }

  const income = { kind: 'income', categoryId: 'cat.salary', paymentMethodId: undefined };

  it('accepts income that went to cash, or to an account the file does not have', () => {
    // A destination that names nothing is shown as "not assigned": never an error.
    for (const destinationId of ['pm.cash', 'pm.gone']) {
      expect(validateEnvelope(withRow({ ...income, destinationId })).ok, destinationId).toBe(true);
    }
  });

  it('refuses a destination on an expense', () => {
    const result = validateEnvelope(withRow({ destinationId: 'pm.cash' }));
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
    if (!result.ok && result.reason === 'invalid') {
      expect(result.issues.map((i) => i.path)).toContain('transactions.tx1.destinationId');
    }
  });

  it('refuses a destination an override gives one payment of an expense', () => {
    const override = {
      id: 'o1',
      transactionId: 'tx1',
      occurrenceDate: '2026-03-12',
      action: 'modify',
      patch: { destinationId: 'pm.cash' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const result = validateEnvelope(withRow({}, [override]));
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
    if (!result.ok && result.reason === 'invalid') {
      expect(result.issues.map((i) => i.path)).toContain('overrides.o1.patch.destinationId');
    }
    // The same override on income is fine.
    expect(validateEnvelope(withRow(income, [override])).ok).toBe(true);
  });

  it('keeps a recount’s tag', () => {
    const result = validateEnvelope(withRow({ cashCount: true }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.data.transactions[0]?.cashCount).toBe(true);
  });

  it('reads a file from before either existed exactly as before', () => {
    const result = validateEnvelope(envelope());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.data.transactions[0]).not.toHaveProperty('destinationId');
      expect(result.doc.data.transactions[0]).not.toHaveProperty('cashCount');
    }
  });
});
```

- [ ] **Step 3: Write the failing sync-apply compatibility test**

In `src/db/sync/apply.test.ts`, add these imports, keeping the existing ones and the alphabetical import order:

```ts
import { materialize } from '@/db/materialize';
import { applySeriesEdit } from '@/db/series-edit';
import { planSeriesEdit } from '@/domain/series-edit';
import { d, MONEY } from '@/domain/test-factories';
import { counterIdFactory } from '@/lib/id';
import type { Transaction } from '@/types/domain';
```

Append:

```ts
describe('a transaction from this build, met by the sync apply path', () => {
  const salary = materialize({
    id: 's1',
    profileId: 'p1',
    kind: 'income',
    categoryId: 'cat.salary',
    money: MONEY,
    recurrence: { type: 'monthly', dayOfMonth: 1 },
    date: d('2026-09-01'),
    destinationId: 'pm.cash',
    seriesRootId: 's1',
    createdAt: NOW,
    updatedAt: NOW,
  });
  const recount = materialize({
    id: 'r1',
    profileId: 'p1',
    kind: 'expense',
    categoryId: 'cat.cash_missing',
    paymentMethodId: 'pm.cash',
    cashCount: true,
    money: MONEY,
    recurrence: { type: 'one_time' },
    date: d('2026-10-01'),
    seriesRootId: 'r1',
    createdAt: NOW,
    updatedAt: NOW,
  });
  const pulled = (row: unknown) => ({
    tbl: 'transactions' as const,
    id: (row as { id: string }).id,
    rev: makeRev({ ms: 1_000, counter: 0, deviceId: 'abcdefgh' }),
    deleted: false,
    row,
  });

  /** An edit of the note alone, through the path the edit form takes. */
  async function editNote(id: string): Promise<void> {
    const transaction = (await handle.db.transactions.get(id)) as Transaction;
    const planned = planSeriesEdit({
      transaction,
      overrides: [],
      scope: 'all',
      at: transaction.date,
      patch: { note: 'edited' },
      today: d('2026-10-08'),
      now: NOW,
      newId: counterIdFactory('e'),
    });
    if (!planned.ok) throw new Error(planned.error.kind);
    await applySeriesEdit(handle.db, planned.plan);
  }

  it('stores where income went and the recount tag, and an edit of the note keeps both', async () => {
    const report = await applyPage(handle.db, [pulled(salary), pulled(recount)], 1);
    expect(report).toEqual({ applied: 2, skipped: 0, rejected: 0 });

    await editNote('s1');
    await editNote('r1');
    expect(await handle.db.transactions.get('s1')).toMatchObject({
      destinationId: 'pm.cash',
      note: 'edited',
    });
    expect(await handle.db.transactions.get('r1')).toMatchObject({
      cashCount: true,
      paymentMethodId: 'pm.cash',
      note: 'edited',
    });
  });

  it('applies a row from before either existed, which gains neither', async () => {
    const { destinationId: _gone, ...older } = salary;
    expect((await applyPage(handle.db, [pulled(older)], 1)).rejected).toBe(0);
    await editNote('s1');
    const stored = await handle.db.transactions.get('s1');
    expect(stored).toMatchObject({ note: 'edited' });
    expect(stored).not.toHaveProperty('destinationId');
    expect(stored).not.toHaveProperty('cashCount');
  });

  it('keeps a field a later build added, through an edit here: how an older build keeps ours', async () => {
    await applyPage(handle.db, [pulled({ ...salary, laterField: 'kept' })], 1);
    await editNote('s1');
    expect(await handle.db.transactions.get('s1')).toMatchObject({
      laterField: 'kept',
      destinationId: 'pm.cash',
    });
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test --project unit src/domain/transfer-schema.test.ts src/domain/transfer-validate.test.ts`
Expected: FAIL. `rowSchemas.cashMoves` is undefined, so the cash-move cases throw. `parsed` lacks `destinationId` because zod strips the unknown key. The expense-with-destination case returns `ok: true`.

Run: `pnpm test --project db src/db/sync/apply.test.ts`
Expected: the first test FAILS. `applyPage` stores the raw row, but the edit goes through `planSeriesEdit` with no change to it, so it should already keep both fields. If this test passes before Step 6, that is correct: section 6 already holds for transactions, and the test now pins it. Record the result in your notes and continue.

- [ ] **Step 5: Implement the schemas**

In `src/domain/transfer-schema.ts`, change the `@/types/domain` import to:

```ts
import { DEAL_KINDS, EXTRA_RATE_KINDS, SHARED_OWNER } from '@/types/domain';
```

In `transactionSchema`, after the `deferral` line:

```ts
  // Income only: the account or the cash it went to. transfer-validate refuses
  // it on an expense; a destination naming nothing is "not assigned", never an error.
  destinationId: z.string().min(1).optional(),
  // A recount's row; absent on every other.
  cashCount: z.literal(true).optional(),
```

In `patchSchema`, after the `paymentMethodId` line:

```ts
  // One payment's own destination; `null` clears it.
  destinationId: z.string().min(1).nullable().optional(),
```

Directly before `export const rowSchemas = {`:

```ts
/**
 * A cash move. `kind` is any non-empty string on purpose: a later build may
 * add a kind, and this one must keep the row rather than refuse it forever -
 * every sum here ignores a kind it does not know (src/domain/cash.ts).
 */
export const cashMoveSchema = z.object({
  id: z.string().min(1),
  profileId: z
    .string()
    .min(1)
    .refine((id) => id !== SHARED_OWNER, 'a cash move belongs to one person'),
  kind: z.string().min(1).max(40),
  // 0 only for a count that matched; the repository holds every other kind above it.
  amountMinor: z.number().int().nonnegative().max(1e15),
  date: localDate,
  accountId: z.string().min(1).optional(),
  note: z.string().max(2000).optional(),
  isDeleted: z.union([z.literal(0), z.literal(1)]),
  deletedAt: isoInstant.optional(),
  createdAt: isoInstant,
  updatedAt: isoInstant,
});
```

In `rowSchemas`, after `overrides: overrideSchema,`:

```ts
  cashMoves: cashMoveSchema,
```

- [ ] **Step 6: Implement the validation rules**

In `src/domain/transfer-validate.ts` `crossEntityIssues`, after `const transactionIds = new Set(transactions.map((t) => t.id));` add:

```ts
const kindOf = new Map(transactions.map((t) => [t.id, t.kind]));
```

Inside `for (const t of transactions)`, after the `'Income rows do not carry a payment method'` block:

```ts
if (t.kind !== 'income' && t.destinationId !== undefined) {
  // Only income lands somewhere; a destination on an expense would count it as cash coming in.
  issues.push({
    path: `transactions.${t.id}.destinationId`,
    message: 'Only income rows say where the money went',
  });
}
```

Inside `for (const o of overrides)`, after the `No transaction` check:

```ts
const destination = o.patch?.destinationId;
if (destination !== undefined && destination !== null && kindOf.get(o.transactionId) === 'expense') {
  issues.push({
    path: `overrides.${o.id}.patch.destinationId`,
    message: 'Only income rows say where the money went',
  });
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test --project unit src/domain/transfer-schema.test.ts src/domain/transfer-validate.test.ts`
Expected: PASS.

Run: `pnpm test --project db src/db/sync/apply.test.ts`
Expected: PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/domain/transfer-schema.ts src/domain/transfer-schema.test.ts src/domain/transfer-validate.ts src/domain/transfer-validate.test.ts src/db/sync/apply.test.ts
git commit -m "The shared row schemas read where income went, a recount's tag and a cash move, and a file refuses a destination on an expense" -m "A cash move's kind is any string, so a kind a later build adds is kept rather than refused. Tests pin the older-build table in the cash design: both new fields survive the sync apply path and an edit, and a row from before them reads as it always did." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The cash figure, `src/domain/cash.ts`

Spec sections: §2.1, §2.2, §2.3, §3.2 ("Counted", expected, activity), §7 (start cutoff, a row moving between people).

A pure module: no Dexie, no React, no clock. Every term of the spec's formula is a separate, tested function.

**Files:**

- Create: `src/domain/cash.ts`
- Create: `src/domain/cash.test.ts`

**Interfaces:**

- Consumes (Task 1): `Occurrence.destinationId`, `Transaction.cashCount`, `CashMove`, `CASH_METHOD_ID` (all from `@/types/domain`). `expandOccurrences` from `./occurrences` is used in the tests only.
- Produces (exact exports of `src/domain/cash.ts`):
  - `CASH_FOUND_CATEGORY_ID = 'cat.cash_found'`, `CASH_MISSING_CATEGORY_ID = 'cat.cash_missing'`
  - `isCashIn(o): boolean`, `isCashOut(o): boolean`, where `o: Pick<Occurrence, 'destinationId' | 'paymentMethodId'> & { transaction: Pick<Transaction, 'kind'> }`
  - `cashSigned(o: Occurrence): Minor` (+ cash in, − cash out, 0 otherwise)
  - `moveSigned(move: Pick<CashMove, 'kind' | 'amountMinor'>): Minor` (+start, +withdraw, −deposit, 0 for `count` and any unknown kind)
  - `cashSince(moves: readonly CashMove[], profileId: string): LocalDate | undefined` (the date of the earliest live `start`)
  - `type PersonCash = { profileId: string; since: LocalDate; onHandMinor: Minor; countedOn: LocalDate }`
  - `personCash(profileId: string, moves: readonly CashMove[], occurrences: readonly Occurrence[], today: LocalDate): PersonCash | undefined`
  - `type CashInput = { profileIds: readonly string[]; moves: readonly CashMove[]; occurrences: readonly Occurrence[]; today: LocalDate; month?: LocalDate }`
  - `type CashSummary = { people: readonly PersonCash[]; notSetUp: readonly string[]; onHandMinor: Minor; countedOn?: LocalDate; expected: { inMinor: Minor; outMinor: Minor } }`
  - `cashSummary(input: CashInput): CashSummary`
  - `type CashActivity = { type: 'occurrence'; key; date; profileId; signedMinor; recount: boolean; occurrence: Occurrence } | { type: 'move'; key; date; profileId; signedMinor; move: CashMove }`
  - `cashActivity(input: CashInput): CashActivity[]` (newest first; never lists `count` moves or unknown kinds)

**Rulings this task encodes:** these are spec ambiguities, decided here.

- A person whose only `start` is dated after today is "not set up" until that day comes.
- In the "all" view, "Counted {date}" is the **oldest** of the people's counted dates, because the pot is only verified as of then.
- `count` moves are not listed in the activity. They carry no money, and §3.2's list does not include them. They only move "Counted".
- A row dated on the start day counts ("on or after", §2.1).

- [ ] **Step 1: Write the failing tests**

Create `src/domain/cash.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { CASH_METHOD_ID, type CashMove, type Override, type Transaction } from '@/types/domain';
import type { IsoInstant, Minor } from '@/types/money';

import {
  cashActivity,
  cashSigned,
  cashSince,
  cashSummary,
  isCashIn,
  isCashOut,
  moveSigned,
  personCash,
} from './cash';
import { expandOccurrences } from './occurrences';
import { d, makeTx, modify, MONEY } from './test-factories';

const TODAY = d('2026-10-09');
const AT = '2026-10-01T00:00:00.000Z' as IsoInstant;

const move = (over: Partial<CashMove> & Pick<CashMove, 'kind' | 'amountMinor' | 'date'>): CashMove => ({
  id: `${over.profileId ?? 'p1'}-${over.kind}-${over.date}-${String(over.amountMinor)}`,
  profileId: 'p1',
  isDeleted: 0,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});
const start = (date: string, amountMinor: Minor, profileId = 'p1') =>
  move({ kind: 'start', date: d(date), amountMinor, profileId });

const money = (minor: Minor) => ({ ...MONEY, amountMinor: minor, baseAmountMinor: minor });
/** Paid in cash. */
const spend = (id: string, date: string, minor: Minor, over: Partial<Transaction> = {}) =>
  makeTx({
    id,
    date: d(date),
    recurrence: { type: 'one_time' },
    paymentMethodId: CASH_METHOD_ID,
    money: money(minor),
    ...over,
  });
/** Received in cash. */
const earn = (id: string, date: string, minor: Minor, over: Partial<Transaction> = {}) =>
  makeTx({
    id,
    kind: 'income',
    categoryId: 'cat.salary',
    date: d(date),
    recurrence: { type: 'one_time' },
    destinationId: CASH_METHOD_ID,
    money: money(minor),
    ...over,
  });

function occurrencesOf(txs: readonly Transaction[], overrides: readonly Override[] = []) {
  return txs.flatMap((tx) =>
    expandOccurrences(
      tx,
      overrides.filter((o) => o.transactionId === tx.id),
      d('2026-01-01'),
      d('2026-12-31'),
      { today: TODAY },
    ),
  );
}

function summary(
  moves: readonly CashMove[],
  txs: readonly Transaction[] = [],
  profileIds: readonly string[] = ['p1'],
  overrides: readonly Override[] = [],
) {
  return cashSummary({ profileIds, moves, occurrences: occurrencesOf(txs, overrides), today: TODAY });
}

describe('what is cash', () => {
  it('is income that went to cash, and spending paid in cash, and nothing else', () => {
    const [cashIn] = occurrencesOf([earn('a', '2026-10-02', 100)]);
    const [cashOut] = occurrencesOf([spend('b', '2026-10-02', 100)]);
    const [toBank] = occurrencesOf([earn('c', '2026-10-02', 100, { destinationId: 'pm.leumi' })]);
    const [onCard] = occurrencesOf([spend('e', '2026-10-02', 100, { paymentMethodId: 'visa' })]);
    expect(isCashIn(cashIn!)).toBe(true);
    expect(isCashOut(cashOut!)).toBe(true);
    expect([cashSigned(cashIn!), cashSigned(cashOut!), cashSigned(toBank!), cashSigned(onCard!)]).toEqual([
      100, -100, 0, 0,
    ]);
  });

  it('moves cash in on a start or a withdrawal, out on a deposit, and not at all on a count or a kind it does not know', () => {
    expect(moveSigned({ kind: 'start', amountMinor: 500 })).toBe(500);
    expect(moveSigned({ kind: 'withdraw', amountMinor: 200 })).toBe(200);
    expect(moveSigned({ kind: 'deposit', amountMinor: 100 })).toBe(-100);
    expect(moveSigned({ kind: 'count', amountMinor: 0 })).toBe(0);
    expect(moveSigned({ kind: 'exchange', amountMinor: 999 })).toBe(0);
  });
});

describe('a person’s cash', () => {
  it('adds the start, withdrawals and cash income, and takes off deposits and cash spending', () => {
    const result = summary(
      [
        start('2026-10-01', 50_000),
        move({ kind: 'withdraw', date: d('2026-10-02'), amountMinor: 20_000 }),
        move({ kind: 'deposit', date: d('2026-10-03'), amountMinor: 10_000 }),
      ],
      [earn('in', '2026-10-04', 3_000), spend('out', '2026-10-05', 5_000)],
    );
    expect(result.onHandMinor).toBe(58_000);
    expect(result.people).toEqual([
      { profileId: 'p1', since: '2026-10-01', onHandMinor: 58_000, countedOn: '2026-10-01' },
    ]);
  });

  it('leaves out income sent to an account, card spending, and rows with no method', () => {
    const result = summary(
      [start('2026-10-01', 50_000)],
      [
        earn('bank', '2026-10-02', 9_000, { destinationId: 'pm.leumi' }),
        earn('none', '2026-10-02', 9_000, { destinationId: undefined }),
        spend('card', '2026-10-03', 4_000, { paymentMethodId: 'visa' }),
        spend('blank', '2026-10-03', 4_000, { paymentMethodId: undefined }),
      ],
    );
    expect(result.onHandMinor).toBe(50_000);
  });

  it('counts nothing from before the first start, but does count the start day itself', () => {
    const result = summary(
      [start('2026-10-01', 50_000), move({ kind: 'withdraw', date: d('2026-09-25'), amountMinor: 20_000 })],
      [spend('old', '2026-09-20', 5_000), spend('same-day', '2026-10-01', 1_000)],
    );
    expect(result.onHandMinor).toBe(49_000);
  });

  it('has no figure for someone who has not set up, and says who', () => {
    const result = summary(
      [start('2026-10-01', 50_000)],
      [spend('p2s', '2026-10-02', 700, { profileId: 'p2' })],
      ['p1', 'p2'],
    );
    expect(result.people.map((p) => p.profileId)).toEqual(['p1']);
    expect(result.notSetUp).toEqual(['p2']);
    expect(result.onHandMinor).toBe(50_000);
    expect(personCash('p2', [], [], TODAY)).toBeUndefined();
  });

  it('is not set up by a start dated after today, until that day', () => {
    const moves = [start('2026-10-20', 50_000)];
    expect(summary(moves).notSetUp).toEqual(['p1']);
    expect(cashSince(moves, 'p1')).toBe('2026-10-20');
  });

  it('goes below zero when more was spent in cash than it had', () => {
    expect(summary([start('2026-10-01', 1_000)], [spend('big', '2026-10-02', 3_000)]).onHandMinor).toBe(
      -2_000,
    );
  });

  it('ignores a kind a later build added, a count, and a deleted move', () => {
    const result = summary([
      start('2026-10-01', 50_000),
      move({ kind: 'exchange', date: d('2026-10-02'), amountMinor: 999 }),
      move({ kind: 'count', date: d('2026-10-03'), amountMinor: 0 }),
      move({ kind: 'withdraw', date: d('2026-10-04'), amountMinor: 20_000, isDeleted: 1 }),
    ]);
    expect(result.onHandMinor).toBe(50_000);
  });

  it('starts again from the first live start once that start is deleted', () => {
    const moves = [{ ...start('2026-09-01', 10_000), isDeleted: 1 as const }, start('2026-10-01', 50_000)];
    expect(cashSince(moves, 'p1')).toBe('2026-10-01');
  });

  it('follows the row’s person: a row given to someone else takes its cash with it', () => {
    const moves = [start('2026-10-01', 50_000), start('2026-10-01', 30_000, 'p2')];
    const result = summary(moves, [spend('moved', '2026-10-02', 5_000, { profileId: 'p2' })], ['p1', 'p2']);
    expect(result.people.map((p) => p.onHandMinor)).toEqual([50_000, 25_000]);
  });
});

describe('a recurring cash income', () => {
  const salary = (over: Partial<Transaction> = {}) =>
    earn('salary', '2026-06-01', 1_000, { recurrence: { type: 'monthly', dayOfMonth: 1 }, ...over });

  it('counts each payment from the start up to today', () => {
    // June to September are before the start; November is after today.
    expect(summary([start('2026-09-15', 10_000)], [salary()]).onHandMinor).toBe(11_000);
  });

  it('counts one payment sent to cash by an override, and only that one', () => {
    const toCash = [modify('salary', d('2026-09-01'), { destinationId: CASH_METHOD_ID })];
    const result = summary(
      [start('2026-08-01', 10_000)],
      [salary({ destinationId: 'pm.leumi' })],
      ['p1'],
      toCash,
    );
    expect(result.onHandMinor).toBe(11_000);
  });

  it('leaves out one payment an override sends elsewhere', () => {
    const away = [modify('salary', d('2026-09-01'), { destinationId: null })];
    const result = summary([start('2026-08-01', 10_000)], [salary()], ['p1'], away);
    // August and October, not September.
    expect(result.onHandMinor).toBe(12_000);
  });
});

describe('everyone’s cash', () => {
  it('adds up only the people who set up, and keeps each one’s figure', () => {
    const result = summary(
      [start('2026-10-01', 50_000), start('2026-10-01', 30_000, 'p2')],
      [spend('p2s', '2026-10-02', 5_000, { profileId: 'p2' })],
      ['p1', 'p2', 'p3'],
    );
    expect(result.onHandMinor).toBe(75_000);
    expect(result.people.map((p) => [p.profileId, p.onHandMinor])).toEqual([
      ['p1', 50_000],
      ['p2', 25_000],
    ]);
    expect(result.notSetUp).toEqual(['p3']);
  });
});

describe('what is still to come this month', () => {
  it('leaves rows after today out of what is on hand, and shows this month’s as expected', () => {
    const result = summary(
      [start('2026-10-01', 50_000)],
      [
        earn('later', '2026-10-20', 1_000),
        spend('soon', '2026-10-25', 400),
        spend('next', '2026-11-05', 900),
      ],
    );
    expect(result.onHandMinor).toBe(50_000);
    expect(result.expected).toEqual({ inMinor: 1_000, outMinor: 400 });
  });

  it('expects nothing for someone who has not set up', () => {
    expect(summary([], [earn('later', '2026-10-20', 1_000)]).expected).toEqual({ inMinor: 0, outMinor: 0 });
  });
});

describe('when it was counted', () => {
  it('is the start day until a count, then the latest count or recount', () => {
    expect(summary([start('2026-10-01', 50_000)]).countedOn).toBe('2026-10-01');

    const counted = [
      start('2026-10-01', 50_000),
      move({ kind: 'count', date: d('2026-10-03'), amountMinor: 0 }),
    ];
    expect(summary(counted).countedOn).toBe('2026-10-03');

    const recount = spend('rc', '2026-10-05', 1_000, { cashCount: true });
    expect(summary(counted, [recount]).countedOn).toBe('2026-10-05');
  });

  it('is, for everyone, the person counted longest ago', () => {
    const result = summary(
      [
        start('2026-10-01', 50_000),
        move({ kind: 'count', date: d('2026-10-08'), amountMinor: 0 }),
        start('2026-10-02', 30_000, 'p2'),
      ],
      [],
      ['p1', 'p2'],
    );
    expect(result.people.map((p) => p.countedOn)).toEqual(['2026-10-08', '2026-10-02']);
    expect(result.countedOn).toBe('2026-10-02');
  });

  it('is unknown when nobody has set up', () => {
    expect(summary([]).countedOn).toBeUndefined();
  });
});

describe('the activity', () => {
  it('lists cash rows and moves newest first, marks a recount, and leaves counts out', () => {
    const moves = [
      start('2026-10-01', 50_000),
      move({ kind: 'withdraw', date: d('2026-10-02'), amountMinor: 20_000 }),
      move({ kind: 'count', date: d('2026-10-05'), amountMinor: 0 }),
    ];
    const txs = [spend('rc', '2026-10-03', 1_000, { cashCount: true }), earn('in', '2026-10-04', 3_000)];
    const activity = cashActivity({
      profileIds: ['p1'],
      moves,
      occurrences: occurrencesOf(txs),
      today: TODAY,
    });

    expect(activity.map((a) => [a.date, a.type, a.signedMinor])).toEqual([
      ['2026-10-04', 'occurrence', 3_000],
      ['2026-10-03', 'occurrence', -1_000],
      ['2026-10-02', 'move', 20_000],
      ['2026-10-01', 'move', 50_000],
    ]);
    expect(activity.filter((a) => a.type === 'occurrence').map((a) => a.recount)).toEqual([false, true]);
  });

  it('shows only the people in view, from their own start, and nothing after today', () => {
    const moves = [start('2026-10-01', 50_000), start('2026-10-01', 30_000, 'p2')];
    const txs = [
      spend('old', '2026-09-30', 100),
      spend('theirs', '2026-10-02', 100, { profileId: 'p2' }),
      spend('later', '2026-10-20', 100),
    ];
    const activity = cashActivity({
      profileIds: ['p1'],
      moves,
      occurrences: occurrencesOf(txs),
      today: TODAY,
    });
    expect(activity.map((a) => a.key)).toEqual(['move:p1-start-2026-10-01-50000']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --project unit src/domain/cash.test.ts`
Expected: FAIL with "Failed to resolve import './cash'" (or "Cannot find module").

- [ ] **Step 3: Implement `src/domain/cash.ts`**

```ts
import { compareLocal, endOfMonth, startOfMonth } from '@/lib/dates';
import { add, sum } from '@/lib/money';
import { CASH_METHOD_ID, type CashMove, type Occurrence, type Transaction } from '@/types/domain';
import type { LocalDate, Minor } from '@/types/money';

/**
 * How much of the balance is cash on hand (docs/superpowers/specs/2026-10-09-cash-deposit-design.md, section 2).
 *
 * Cash is PART of the balance, never added to it: cash income raises both,
 * paying cash lowers both, and moving money between the bank and the wallet
 * (a withdrawal, a deposit, the amount someone started with) moves only this
 * figure. So nothing here is ever summed into the balance, and nothing in the
 * balance is summed in here twice.
 *
 *   cash(person, today) =
 *       Σ start + Σ withdraw − Σ deposit            (live moves, start..today)
 *     + Σ income occurrences that went to cash      (start..today)
 *     − Σ expense occurrences paid in cash          (start..today)
 *
 * "start" is the person's FIRST start move: cash rows from before they set up
 * the tab never count, so years of old cash spending cannot drive the figure
 * negative. Amounts are each occurrence's base amount, as the balance uses.
 */

/** Where a recount files cash it found, and cash that was missing. */
export const CASH_FOUND_CATEGORY_ID = 'cat.cash_found';
export const CASH_MISSING_CATEGORY_ID = 'cat.cash_missing';

type CashLike = Pick<Occurrence, 'destinationId' | 'paymentMethodId'> & {
  readonly transaction: Pick<Transaction, 'kind'>;
};

/** Income that went to cash. */
export function isCashIn(o: CashLike): boolean {
  return o.transaction.kind === 'income' && o.destinationId === CASH_METHOD_ID;
}

/** Spending paid in cash. */
export function isCashOut(o: CashLike): boolean {
  return o.transaction.kind === 'expense' && o.paymentMethodId === CASH_METHOD_ID;
}

/** What one occurrence does to the cash: + in, − out, 0 for anything not cash. */
export function cashSigned(o: Occurrence): Minor {
  if (isCashIn(o)) return o.money.baseAmountMinor;
  if (isCashOut(o)) return -o.money.baseAmountMinor;
  return 0;
}

/** What one move does to the cash. */
export function moveSigned(move: Pick<CashMove, 'kind' | 'amountMinor'>): Minor {
  switch (move.kind) {
    case 'start':
    case 'withdraw':
      return move.amountMinor;
    case 'deposit':
      return -move.amountMinor;
    default:
      // 'count' is 0 by definition. A kind a later build added is not this
      // build's to sum: ignoring it is what lets that build add it safely.
      return 0;
  }
}

/** The day a person set up the cash tab: their earliest live start move. */
export function cashSince(moves: readonly CashMove[], profileId: string): LocalDate | undefined {
  let since: LocalDate | undefined;
  for (const m of moves) {
    if (m.isDeleted !== 0 || m.profileId !== profileId || m.kind !== 'start') continue;
    if (since === undefined || compareLocal(m.date, since) < 0) since = m.date;
  }
  return since;
}

const within = (date: LocalDate, from: LocalDate, to: LocalDate): boolean =>
  compareLocal(date, from) >= 0 && compareLocal(date, to) <= 0;

export type PersonCash = {
  readonly profileId: string;
  readonly since: LocalDate;
  readonly onHandMinor: Minor;
  /** The latest recount (a recount row, or a count that matched), else `since`. */
  readonly countedOn: LocalDate;
};

/**
 * One person's cash on `today`, or undefined when they have not set up -
 * including when their only start is dated after today.
 *
 * Whose an amount is comes from its row's `profileId`, so a row given to
 * someone else takes its cash with it.
 */
export function personCash(
  profileId: string,
  moves: readonly CashMove[],
  occurrences: readonly Occurrence[],
  today: LocalDate,
): PersonCash | undefined {
  const since = cashSince(moves, profileId);
  if (since === undefined || compareLocal(since, today) > 0) return undefined;

  let onHand: Minor = 0;
  let countedOn = since;

  for (const m of moves) {
    if (m.isDeleted !== 0 || m.profileId !== profileId || !within(m.date, since, today)) continue;
    onHand = add(onHand, moveSigned(m));
    if (m.kind === 'count' && compareLocal(m.date, countedOn) > 0) countedOn = m.date;
  }

  for (const o of occurrences) {
    if (o.isSkipped || o.transaction.profileId !== profileId || !within(o.date, since, today)) continue;
    if (!isCashIn(o) && !isCashOut(o)) continue;
    onHand = add(onHand, cashSigned(o));
    if (o.transaction.cashCount === true && compareLocal(o.date, countedOn) > 0) countedOn = o.date;
  }

  return { profileId, since, onHandMinor: onHand, countedOn };
}

export type CashInput = {
  /** The people in view: one, or everyone. Order is kept. */
  readonly profileIds: readonly string[];
  /** Every cash move this device holds; deleted ones are skipped here. */
  readonly moves: readonly CashMove[];
  /** Expanded over [the earliest start, the end of the month shown]. */
  readonly occurrences: readonly Occurrence[];
  readonly today: LocalDate;
  /** Any day of the month "expected" is for; today's month when absent. */
  readonly month?: LocalDate;
};

export type CashSummary = {
  /** The people in view who have set up, in `profileIds` order. */
  readonly people: readonly PersonCash[];
  /** The people in view who have not. */
  readonly notSetUp: readonly string[];
  readonly onHandMinor: Minor;
  /**
   * When the pot was last counted: the person counted longest ago, since the
   * pot is only verified as of then. Undefined while nobody has set up.
   */
  readonly countedOn?: LocalDate;
  /** Cash still to come in and go out this month, after today: never on hand. */
  readonly expected: { readonly inMinor: Minor; readonly outMinor: Minor };
};

export function cashSummary(input: CashInput): CashSummary {
  const people: PersonCash[] = [];
  const notSetUp: string[] = [];
  for (const id of input.profileIds) {
    const figure = personCash(id, input.moves, input.occurrences, input.today);
    if (figure === undefined) notSetUp.push(id);
    else people.push(figure);
  }

  const ready = new Set(people.map((p) => p.profileId));
  const month = input.month ?? input.today;
  const from = startOfMonth(month);
  const to = endOfMonth(month);
  let inMinor: Minor = 0;
  let outMinor: Minor = 0;
  for (const o of input.occurrences) {
    if (o.isSkipped || !ready.has(o.transaction.profileId)) continue;
    if (compareLocal(o.date, input.today) <= 0 || !within(o.date, from, to)) continue;
    if (isCashIn(o)) inMinor = add(inMinor, o.money.baseAmountMinor);
    else if (isCashOut(o)) outMinor = add(outMinor, o.money.baseAmountMinor);
  }

  const countedOn = people.reduce<LocalDate | undefined>(
    (oldest, p) => (oldest === undefined || compareLocal(p.countedOn, oldest) < 0 ? p.countedOn : oldest),
    undefined,
  );

  return {
    people,
    notSetUp,
    onHandMinor: sum(people.map((p) => p.onHandMinor)),
    ...(countedOn === undefined ? {} : { countedOn }),
    expected: { inMinor, outMinor },
  };
}

export type CashActivity =
  | {
      readonly type: 'occurrence';
      readonly key: string;
      readonly date: LocalDate;
      readonly profileId: string;
      readonly signedMinor: Minor;
      /** Written by a recount: tagged "Recount" in the list. */
      readonly recount: boolean;
      readonly occurrence: Occurrence;
    }
  | {
      readonly type: 'move';
      readonly key: string;
      readonly date: LocalDate;
      readonly profileId: string;
      readonly signedMinor: Minor;
      readonly move: CashMove;
    };

/** Moves shown in the list. A count carries no money; a kind from a later build is not ours to name. */
const LISTED_MOVES: ReadonlySet<string> = new Set(['start', 'withdraw', 'deposit']);

/**
 * What moved the cash, newest first: each person's cash rows and moves from
 * their own start to today. Ties on a day go newest-written first.
 */
export function cashActivity(input: CashInput): CashActivity[] {
  const since = new Map<string, LocalDate>();
  for (const id of input.profileIds) {
    const from = cashSince(input.moves, id);
    if (from !== undefined && compareLocal(from, input.today) <= 0) since.set(id, from);
  }
  const shown = (profileId: string, date: LocalDate): boolean => {
    const from = since.get(profileId);
    return from !== undefined && within(date, from, input.today);
  };

  const rows: { readonly entry: CashActivity; readonly written: string }[] = [];
  for (const o of input.occurrences) {
    if (o.isSkipped || !shown(o.transaction.profileId, o.date)) continue;
    if (!isCashIn(o) && !isCashOut(o)) continue;
    rows.push({
      written: o.transaction.createdAt,
      entry: {
        type: 'occurrence',
        key: o.key,
        date: o.date,
        profileId: o.transaction.profileId,
        signedMinor: cashSigned(o),
        recount: o.transaction.cashCount === true,
        occurrence: o,
      },
    });
  }
  for (const m of input.moves) {
    if (m.isDeleted !== 0 || !LISTED_MOVES.has(m.kind) || !shown(m.profileId, m.date)) continue;
    rows.push({
      written: m.createdAt,
      entry: {
        type: 'move',
        key: `move:${m.id}`,
        date: m.date,
        profileId: m.profileId,
        signedMinor: moveSigned(m),
        move: m,
      },
    });
  }

  rows.sort(
    (a, b) =>
      compareLocal(b.entry.date, a.entry.date) ||
      b.written.localeCompare(a.written) ||
      a.entry.key.localeCompare(b.entry.key),
  );
  return rows.map((row) => row.entry);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test --project unit src/domain/cash.test.ts`
Expected: PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/domain/cash.ts src/domain/cash.test.ts
git commit -m "The cash figure: each person's start, withdrawals, deposits and cash rows from the day they set up, and what is still to come this month" -m "A pure module the cash tab will render. A move kind it does not know adds nothing, a count adds nothing, and the pot in the all view is counted as of the person counted longest ago." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The `cashMoves` table: storage, sync routing, export and import, delete all data, a person leaving, and the two built-in categories

Spec sections: §1.2 (categories), §1.3 (storage plumbing), §4 (linked accounts), §5 (delete all data, export and import).

**Files:**

- Modify: `src/db/versions.ts:47-102` (index notes, and a version 4 entry after version 3)
- Modify: `src/db/db.ts:1-36` (import `CashMove`, `declare cashMoves`)
- Modify: `src/db/sync/tables.ts:11-19` (`SYNCED_TABLES`)
- Modify: `src/db/sync/route.ts:36-55` (`homeOf`)
- Modify: `src/db/sync/spaces.ts:30-46` (`shareWith`)
- Modify: `src/domain/transfer-schema.ts` (`envelopeSchema` counts and data)
- Modify: `src/domain/transfer-validate.ts` (`crossEntityIssues`: counts, and each move's person)
- Modify: `src/db/transfer.ts` (`buildExport`, `redenominate`, `runImport`, `AppliedCounts`, `ImportResult`)
- Modify: `src/db/repos/profiles.ts:148-215` (`deleteProfile`)
- Modify: `src/db/members.ts:48-58` (`ensureMember`'s transaction table list)
- Modify: `src/db/seed.ts:21-66` (`BUILTIN_INCOME`, `BUILTIN_EXPENSE`)
- Modify: `src/components/category-icons.ts` (add `Banknote`, `BanknoteX`)
- Modify: `src/i18n/locales/en/categories.json`, `src/i18n/locales/he/categories.json` (`builtin.cashFound`, `builtin.cashMissing`)
- Create: `src/db/versions.test.ts`
- Test: `src/db/sync/linked.test.ts`, `src/db/sync/erase.test.ts`, `src/db/transfer.test.ts`, `src/db/repos/profiles.test.ts`, `src/db/members.test.ts`, `src/db/repos/categories.test.ts`, `src/domain/transfer-validate.test.ts`

**Interfaces:**

- Consumes: `CashMove` (Task 1), `cashMoveSchema` and `rowSchemas.cashMoves` (Task 2), `CASH_FOUND_CATEGORY_ID` and `CASH_MISSING_CATEGORY_ID` (Task 3).
- Produces:
  - `db.cashMoves: Table<CashMove, string>` on `BookandryDB`, indexed `'id, [profileId+isDeleted+date], updatedAt'`
  - `'cashMoves'` in `SYNCED_TABLES`, so it is in the `SyncedTable` type. Every write to it is tracked for the account, it is filed in its `profileId`'s space, and `eraseLocalData` and `forgetSpace` cover it.
  - `ExportEnvelope['data']['cashMoves']` and `ExportEnvelope['counts']['cashMoves']`, both defaulting to empty when a file has none
  - `ImportResult` `applied.cashMoves: number`
  - built-in categories `cat.cash_found` (income, icon `Banknote`) and `cat.cash_missing` (expense, icon `BanknoteX`), with name keys `categories:builtin.cashFound` and `categories:builtin.cashMissing`

**Rulings:**

- **`shareWith` also queues `cashMoves`, as the spec asks.** The push files each move only in its owner's space. A rev the space already holds is taken as stored, so re-queuing is harmless. It is there so a move that lived in an account's own space before linking reaches that space again after the link.
- **A merge-import of a file in another base currency converts each move's amount** at the file-base→local-base rate on the move's date, through the same `rateLookup` the transactions use. A missing rate refuses the merge, as it does for transactions.
- **Deleting a person moves their cash moves to the person their transactions go to.** With no such person, the moves are deleted: they are balance-neutral, so no money leaves the balance.

- [ ] **Step 1: Write the failing upgrade test**

Create `src/db/versions.test.ts`:

```ts
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { d, MONEY } from '@/domain/test-factories';
import type { IsoInstant } from '@/types/money';

import { BookandryDB } from './db';
import { materialize } from './materialize';

const NOW = '2026-10-09T10:00:00.000Z' as IsoInstant;

describe('upgrading an install from before the cash tab', () => {
  it('adds an empty cash-moves table, leaves every row where it was, and records new moves for the account', async () => {
    const factory = new IDBFactory();
    const before = new BookandryDB('before-cash', { indexedDB: factory, IDBKeyRange }, 3, NOW);
    await before.open();
    await before.transactions.put(
      materialize({
        id: 't.old',
        profileId: 'p1',
        kind: 'expense',
        categoryId: 'cat.groceries',
        paymentMethodId: 'pm.cash',
        money: MONEY,
        recurrence: { type: 'one_time' },
        date: d('2026-09-01'),
        seriesRootId: 't.old',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );
    expect(before.verno).toBe(3);
    before.close();

    const after = new BookandryDB('before-cash', { indexedDB: factory, IDBKeyRange }, Infinity, NOW);
    await after.open();
    expect(after.verno).toBe(4);
    expect(await after.cashMoves.count()).toBe(0);
    expect((await after.transactions.get('t.old'))?.paymentMethodId).toBe('pm.cash');

    await after.cashMoves.put({
      id: 'm1',
      profileId: 'p1',
      kind: 'start',
      amountMinor: 50_000,
      date: d('2026-10-01'),
      isDeleted: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const mine = await after.cashMoves
      .where('[profileId+isDeleted+date]')
      .between(['p1', 0, ''], ['p1', 0, '￿'])
      .toArray();
    expect(mine.map((m) => m.id)).toEqual(['m1']);
    expect(await after.outbox.get(['cashMoves', 'm1'])).toBeDefined();
    after.close();
  });
});
```

- [ ] **Step 2: Write the failing sync tests**

In `src/db/sync/linked.test.ts`, change the `@/types/domain` import to `import { SHARED_OWNER, type CashMove, type PaymentMethod, type Transaction } from '@/types/domain';` and the `./spaces` import to `import { forgetSpace, shareWith } from './spaces';`. Then append:

```ts
describe('cash moves', () => {
  const cashMove = (id: string, profileId: string): CashMove => ({
    id,
    profileId,
    kind: 'withdraw',
    amountMinor: 20_000,
    date: d('2026-10-01'),
    isDeleted: 0,
    createdAt: now(),
    updatedAt: now(),
  });
  const moveIds = async (db: BookandryDB) => (await db.cashMoves.toArray()).map((m) => m.id).sort();

  it("live in their person's space, show to both, and leave with the other's space on unlinking", async () => {
    await alice.db.cashMoves.put(cashMove('ma', ALICE));
    await bob.db.cashMoves.put(cashMove('mb', BOB));
    await everyoneSyncs();

    expect(held(ALICE, 'cashMoves')).toEqual(['ma']);
    expect(held(BOB, 'cashMoves')).toEqual(['mb']);
    expect(await moveIds(alice.db)).toEqual(['ma', 'mb']);
    expect(await moveIds(bob.db)).toEqual(['ma', 'mb']);

    alice.linked = false;
    bob.linked = false;
    await forgetSpace(alice.db, BOB);
    await forgetSpace(bob.db, ALICE);

    // The pot shrinks back to each person's own cash; nothing was deleted from anyone's space.
    expect(await moveIds(alice.db)).toEqual(['ma']);
    expect(await moveIds(bob.db)).toEqual(['mb']);
    expect(held(BOB, 'cashMoves')).toEqual(['mb']);
  });

  it('follow a move given to the other person into their space', async () => {
    await alice.db.cashMoves.put(cashMove('ma', ALICE));
    await everyoneSyncs();
    tick();
    await alice.db.cashMoves.update('ma', { profileId: BOB, updatedAt: now() });
    await everyoneSyncs();

    expect(held(ALICE, 'cashMoves')).toEqual([]);
    expect(held(BOB, 'cashMoves')).toEqual(['ma']);
  });

  it('are queued again for a space this device has never pulled from', async () => {
    await alice.db.cashMoves.put(cashMove('ma', ALICE));
    await alice.db.outbox.clear();
    expect(await shareWith(alice.db, 'carol-uid')).toBe(true);
    expect(await alice.db.outbox.get(['cashMoves', 'ma'])).toBeDefined();
  });
});
```

In `src/db/sync/erase.test.ts`, append:

```ts
describe('deleting everything, and the cash tab', () => {
  it('leaves no cash moves, and nothing of them to send', async () => {
    await a.db.cashMoves.put({
      id: 'm1',
      profileId: 'p1',
      kind: 'start',
      amountMinor: 50_000,
      date: d('2026-10-01'),
      isDeleted: 0,
      createdAt: now(),
      updatedAt: now(),
    });
    await eraseLocalData(a.db);

    expect(await a.db.cashMoves.count()).toBe(0);
    expect((await a.db.syncState.toArray()).filter((s) => s.tbl === 'cashMoves')).toEqual([]);
    expect((await a.db.outbox.toArray()).filter((o) => o.tbl === 'cashMoves')).toEqual([]);
  });
});
```

- [ ] **Step 3: Write the failing export, import and validation tests**

In `src/db/transfer.test.ts`, change the `@/types/domain` import to `import type { CashMove, Category, PaymentMethod, Profile } from '@/types/domain';`. Add this helper after `seed`:

```ts
const cashMove = (over: Partial<CashMove> = {}): CashMove => ({
  id: 'm1',
  profileId: 'p1',
  kind: 'start',
  amountMinor: 50_000,
  date: d('2026-10-01'),
  isDeleted: 0,
  createdAt: EARLIER,
  updatedAt: EARLIER,
  ...over,
});
```

In `'EXCLUDES the rates cache, which is regenerable'`, change the expected key list to:

```ts
expect(Object.keys(doc.data)).toEqual([
  'profiles',
  'categories',
  'paymentMethods',
  'transactions',
  'overrides',
  'cashMoves',
]);
```

Append:

```ts
describe('cash moves in a backup', () => {
  it('are exported, counted, and restored by a replace', async () => {
    await seed();
    await handle.db.cashMoves.put(cashMove());
    const doc = await buildExport(handle.db, NOW);
    expect(doc.counts.cashMoves).toBe(1);
    expect(doc.data.cashMoves).toEqual([cashMove()]);

    await handle.db.cashMoves.clear();
    const result = await importDocument(handle.db, JSON.parse(JSON.stringify(doc)), {
      mode: 'replace',
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, applied: { cashMoves: 1 } });
    expect(await handle.db.cashMoves.get('m1')).toEqual(cashMove());
  });

  it('merge by the newer edit, like every other row', async () => {
    await seed();
    await handle.db.cashMoves.put(cashMove());
    const doc = await buildExport(handle.db, NOW);
    await handle.db.cashMoves.put(cashMove({ amountMinor: 40_000, updatedAt: NOW }));

    await importDocument(handle.db, doc, { mode: 'merge', now: NOW });
    expect((await handle.db.cashMoves.get('m1'))?.amountMinor).toBe(40_000);
  });

  it('are left alone by a file from before the cash tab, which still imports', async () => {
    await seed();
    const doc = await buildExport(handle.db, NOW);
    const { cashMoves: _moves, ...data } = doc.data;
    const { cashMoves: _count, ...counts } = doc.counts;
    await handle.db.cashMoves.put(cashMove());

    const merged = await importDocument(handle.db, { ...doc, counts, data }, { mode: 'merge', now: NOW });
    expect(merged).toMatchObject({ ok: true, applied: { cashMoves: 0 } });
    expect(await handle.db.cashMoves.count()).toBe(1);
  });

  it('are converted into this device’s currency when a merge converts the rest', async () => {
    await seed();
    const doc = await buildExport(handle.db, NOW);
    // As if this file came from a household that keeps its money in shekels.
    const shekels = {
      ...doc,
      defaultCurrency: 'ILS',
      settings: { ...doc.settings, defaultCurrency: 'ILS' },
      counts: { ...doc.counts, transactions: 0, cashMoves: 1 },
      data: { ...doc.data, transactions: [], cashMoves: [cashMove({ id: 'm.ils', amountMinor: 100_000 })] },
    };
    const lookup: RateLookup = (from, to, on) =>
      from === 'ILS' && to === 'USD' ? { rate: '0.327965', rateDate: on, source: 'frankfurter' } : undefined;

    const result = await importDocument(handle.db, shekels, { mode: 'merge', now: NOW, rateLookup: lookup });
    expect(result).toMatchObject({ ok: true });
    // ₪1,000.00 at 0.327965, rounded half away from zero, once.
    expect((await handle.db.cashMoves.get('m.ils'))?.amountMinor).toBe(32_797);

    const refused = await importDocument(handle.db, shekels, {
      mode: 'merge',
      now: NOW,
      rateLookup: () => undefined,
    });
    expect(refused).toMatchObject({ ok: false, reason: 'base_mismatch' });
  });
});
```

Append to `src/domain/transfer-validate.test.ts`:

```ts
describe('cash moves in a file', () => {
  const move = {
    id: 'm1',
    profileId: 'p1',
    kind: 'withdraw',
    amountMinor: 20_000,
    date: '2026-10-01',
    isDeleted: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  const withMoves = (moves: unknown[], count = moves.length): unknown => {
    const doc = envelope() as ExportEnvelope;
    return { ...doc, counts: { ...doc.counts, cashMoves: count }, data: { ...doc.data, cashMoves: moves } };
  };

  it('are read, and a file without any reads as having none', () => {
    const result = validateEnvelope(withMoves([move]));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.data.cashMoves).toHaveLength(1);
    const older = validateEnvelope(envelope());
    expect(older.ok).toBe(true);
    if (older.ok) expect(older.doc.data.cashMoves).toEqual([]);
  });

  it('refuses a move whose person is not in the file, and a header that miscounts them', () => {
    expect(validateEnvelope(withMoves([{ ...move, profileId: 'ghost' }])).ok).toBe(false);
    expect(validateEnvelope(withMoves([move], 2)).ok).toBe(false);
  });
});
```

- [ ] **Step 4: Write the failing tests for a person leaving, and for the categories**

In `src/db/repos/profiles.test.ts`, change the `@/types/domain` type import to `import type { CashMove, PaymentMethod } from '@/types/domain';`. Inside `describe('deleteProfile', …)` append:

```ts
it('moves the person’s cash moves with their transactions, or deletes them with no one to go to', async () => {
  const move = (id: string, profileId: string): CashMove => ({
    id,
    profileId,
    kind: 'withdraw',
    amountMinor: 20_000,
    date: d('2026-10-01'),
    isDeleted: 0,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await handle.db.cashMoves.bulkPut([move('m1', 'p1'), move('m2', 'p2')]);

  await deleteProfile(handle.db, 'p1', { reassignTo: 'p2' }, NOW);
  expect((await handle.db.cashMoves.get('m1'))?.profileId).toBe('p2');

  await createProfile(handle.db, 'p3', draft('Noa'), NOW);
  await handle.db.cashMoves.put(move('m3', 'p3'));
  await deleteProfile(handle.db, 'p3', {}, NOW);
  expect(await handle.db.cashMoves.get('m3')).toBeUndefined();
});
```

In `src/db/members.test.ts`, in `'becomes the first person made before linking, taking their rows and the active view'`, after `await db.transactions.bulkPut([tx('t1', 'dana'), tx('t2', 'kid')]);` add:

```ts
await db.cashMoves.put({
  id: 'm1',
  profileId: 'dana',
  kind: 'start',
  amountMinor: 50_000,
  date: d('2026-10-01'),
  isDeleted: 0,
  createdAt: NOW,
  updatedAt: NOW,
});
```

and after `expect((await db.transactions.get('t1'))?.profileId).toBe(ME);` add:

```ts
expect((await db.cashMoves.get('m1'))?.profileId).toBe(ME);
```

In `src/db/repos/categories.test.ts`, in `'adds the ones it lacks in their places, and moves an untouched "Other" back to last'`, replace the `expect(names.slice(-10)).toEqual([...])` assertion with:

```ts
expect(names.slice(-11)).toEqual([
  'cat.aiSoftware',
  'cat.phoneInternet',
  'cat.travel',
  'cat.kids',
  'cat.pets',
  'cat.fitness',
  'cat.currencyExchange',
  'cat.loans',
  'cat.cardFees',
  'cat.cash_missing',
  'cat.otherExpense',
]);
```

Then append, inside `describe('the built-in categories on an older install', …)`:

```ts
it('adds the two cash categories to an install from before the cash tab, before "Other"', async () => {
  await handle.db.categories.bulkDelete(['cat.cash_found', 'cat.cash_missing']);
  await handle.db.outbox.clear();

  await ensureBuiltinCategories(handle.db, NOW);

  expect(await handle.db.categories.get('cat.cash_found')).toMatchObject({
    kind: 'income',
    source: 'builtin',
    nameKey: 'categories:builtin.cashFound',
  });
  expect(await handle.db.categories.get('cat.cash_missing')).toMatchObject({
    kind: 'expense',
    nameKey: 'categories:builtin.cashMissing',
  });
  const income = (await listCategories(handle.db, { kind: 'income' })).map((c) => c.id);
  expect(income.slice(-2)).toEqual(['cat.cash_found', 'cat.otherIncome']);
  expect(await handle.db.outbox.toArray()).toEqual([]);
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `pnpm test --project db src/db/versions.test.ts src/db/sync/linked.test.ts src/db/sync/erase.test.ts src/db/transfer.test.ts src/db/repos/profiles.test.ts src/db/members.test.ts src/db/repos/categories.test.ts`
Expected: FAIL. `after.cashMoves` is undefined (`Cannot read properties of undefined`), `doc.counts.cashMoves` is undefined, and `cat.cash_found` is not found.

Run: `pnpm test --project unit src/domain/transfer-validate.test.ts`
Expected: FAIL. `result.doc.data.cashMoves` is undefined.

- [ ] **Step 6: Add the table**

In `src/db/versions.ts`, add to the index-notes block comment, before the line `kind, note, date and currency are deliberately NOT indexed`:

```ts
 * [profileId+isDeleted+date]   (cashMoves)
 *   One person's live cash moves in date order: the cash tab's figure and
 *   activity read exactly this.
 *
```

and append to `SCHEMA_VERSIONS`, after the version 3 entry:

```ts
  {
    /*
     * The cash tab: withdrawals, deposits, the cash someone started with, and
     * counts that matched. A new table rather than a new transaction kind, so
     * an older build syncing alongside this one has nothing to reject.
     */
    version: 4,
    stores: { cashMoves: 'id, [profileId+isDeleted+date], updatedAt' },
  },
```

In `src/db/db.ts`, add `CashMove,` to the `@/types/domain` type import (alphabetical: before `Category`), and after `declare redirects: Table<Redirect, string>;`:

```ts
declare;
cashMoves: Table<CashMove, string>;
```

- [ ] **Step 7: Sync it in its person's space**

In `src/db/sync/tables.ts`, add `'cashMoves',` to `SYNCED_TABLES` after `'overrides',`.

In `src/db/sync/route.ts` `homeOf`, after the `case 'transactions':` line and its `return`:

```ts
    case 'cashMoves':
      // Like a transaction: the person's own space, never everywhere.
      return personHome(db, r['profileId'], spaces);
```

and add `cash moves,` to the doc comment's first bullet so it reads `- a transaction, a cash move, a card or an account: its \`profileId\`'s space - a member's`.

In `src/db/sync/spaces.ts` `shareWith`, change the filter to:

```ts
      .filter(
        (s) =>
          REPLICATED_TABLES.has(s.tbl) ||
          s.tbl === 'paymentMethods' ||
          // A person's cash moves too: the push files each in its owner's space only.
          s.tbl === 'cashMoves' ||
          s.home === EVERYWHERE,
      )
```

- [ ] **Step 8: Add cash moves to the export format**

In `src/domain/transfer-schema.ts` `envelopeSchema`, in `counts`, after `overrides: …,`:

```ts
    // Absent from every file made before the cash tab: read as none.
    cashMoves: z.number().int().nonnegative().default(0),
```

and in `data`, after `overrides: z.array(overrideSchema),`:

```ts
    cashMoves: z.array(cashMoveSchema).default([]),
```

`cashMoveSchema` is declared above `rowSchemas` (Task 2), which is above `envelopeSchema`, so no reordering is needed.

In `src/domain/transfer-validate.ts` `crossEntityIssues`, change the destructuring to:

```ts
const { profiles, categories, paymentMethods, transactions, overrides, cashMoves } = doc.data;
```

before `const actual = {`:

```ts
for (const m of cashMoves) {
  if (!profileIds.has(m.profileId)) {
    issues.push({ path: `cashMoves.${m.id}.profileId`, message: `No profile ${m.profileId}` });
  }
}
```

and add `cashMoves: cashMoves.length,` to `actual`.

- [ ] **Step 9: Export and import them**

In `src/db/transfer.ts`:

1. Change the imports to:

```ts
import { convertMinor } from '@/lib/money';
import type { CashMove, Override, Transaction } from '@/types/domain';
```

(keep every other import; `convertMinor` goes after the `@/domain/...` imports, in alphabetical order).

2. Add `cashMoves: number;` to `AppliedCounts`, and to `ImportResult`'s `applied` object type.

3. In `buildExport`, add `db.cashMoves.toArray()` to the `Promise.all` (destructured as `cashMoves`, placed after `overrides`), `cashMoves: cashMoves.length,` to `counts`, and `cashMoves,` to `data` (after `overrides`).

4. Replace `redenominate` with:

```ts
function redenominate(
  doc: ExportEnvelope,
  localCurrency: Currency,
  lookup: RateLookup,
):
  | { transactions: Transaction[]; overrides: Override[]; cashMoves: CashMove[]; converted: number }
  | undefined {
  const transactions = doc.data.transactions as unknown as Transaction[];
  const overrides = doc.data.overrides as unknown as Override[];

  const plan = planReconversion(
    {
      oldBase: doc.defaultCurrency,
      newBase: localCurrency,
      transactions,
      overrides,
      profiles: doc.data.profiles as unknown as never,
    },
    lookup,
  );

  if (plan.unresolved.length > 0) return undefined;

  /*
   * A cash move is in the file's base currency, which is exactly what is
   * changing - converted at its own date's rate, like a transaction, and the
   * whole merge refused rather than half-converted when a rate is missing.
   */
  const cashMoves: CashMove[] = [];
  for (const move of doc.data.cashMoves as unknown as CashMove[]) {
    const quote = lookup(doc.defaultCurrency, localCurrency, move.date);
    if (quote === undefined) return undefined;
    cashMoves.push({
      ...move,
      amountMinor: convertMinor(move.amountMinor, doc.defaultCurrency, localCurrency, quote.rate),
    });
  }

  const txById = new Map(plan.transactions.map((t) => [t.id, t.money]));
  const ovById = new Map(plan.overrides.map((o) => [o.id, o.money]));

  return {
    transactions: transactions.map((t) => {
      const money = txById.get(t.id);
      return money ? { ...t, money } : t;
    }),
    overrides: overrides.map((o) => {
      const money = ovById.get(o.id);
      return money && o.action === 'modify' ? { ...o, patch: { ...o.patch, money } } : o;
    }),
    cashMoves,
    converted: plan.transactions.length + plan.overrides.length + cashMoves.length,
  };
}
```

5. In `runImport`:
   - after `let overrides = …;`, add `let cashMoves = doc.data.cashMoves as unknown as CashMove[];`
   - after `overrides = redone.overrides;`, add `cashMoves = redone.cashMoves;`
   - add `db.cashMoves` to the `db.transaction('rw', [...])` table list, after `db.overrides`
   - in the replace branch, add `db.cashMoves.clear(),` to the `Promise.all`, add `await db.cashMoves.bulkAdd(cashMoves);` after `await db.overrides.bulkAdd(overrides);`, and add `cashMoves: cashMoves.length,` to the returned counts
   - in the merge branch, add `['cashMoves', db.cashMoves, cashMoves],` as the last entry of `pairs`, and `cashMoves: 0,` to `counts`

- [ ] **Step 10: A person who leaves takes their cash moves along**

In `src/db/repos/profiles.ts` `deleteProfile`, change the transaction table list to `[db.profiles, db.transactions, db.paymentMethods, db.cashMoves, db.settings, db.redirects]`. After the payment-methods block (after the `else { … moved = methods.length; }`), add:

```ts
// A person's cash goes where their transactions go. With nowhere to go it
// is deleted: a move never changed the balance, so no money leaves it.
const moves = await db.cashMoves
  .where('[profileId+isDeleted+date]')
  .between([id, 0, ''], [id, 1, '￿'])
  .toArray();
if (reassignTo === undefined) {
  await db.cashMoves.bulkDelete(moves.map((m) => m.id));
} else {
  await db.cashMoves.bulkPut(moves.map((m) => ({ ...m, profileId: reassignTo, updatedAt: now })));
}
```

Update the doc comment above `deleteProfile`: "One transaction covering profiles, transactions, payment methods, cash moves and settings."

In `src/db/members.ts` `ensureMember`, change the transaction table list to `[db.profiles, db.transactions, db.paymentMethods, db.cashMoves, db.settings, db.redirects]`. A nested Dexie transaction must use a subset of its parent's tables.

- [ ] **Step 11: Seed the two categories**

In `src/db/seed.ts`, add `import { CASH_FOUND_CATEGORY_ID, CASH_MISSING_CATEGORY_ID } from '@/domain/cash';` (above the `@/types/domain` import). In `BUILTIN_INCOME`, before the `cat.otherIncome` entry:

```ts
  // Cash a recount found (the cash tab): an income, so the balance rises with the cash.
  { id: CASH_FOUND_CATEGORY_ID, nameKey: 'categories:builtin.cashFound', icon: 'Banknote' },
```

In `BUILTIN_EXPENSE`, before the `cat.otherExpense` entry:

```ts
  // Cash a recount found missing: an expense, so the balance falls with the cash.
  { id: CASH_MISSING_CATEGORY_ID, nameKey: 'categories:builtin.cashMissing', icon: 'BanknoteX' },
```

In `src/components/category-icons.ts`, add `Banknote,` and `BanknoteX,` to the `lucide-react` import (alphabetical, after `Baby`), and to `ICONS` after `Wallet,`:

```ts
  Banknote,
  BanknoteX,
```

In `src/i18n/locales/en/categories.json` `builtin`, after `"otherIncome": "Other income",` add `"cashFound": "Cash found",`, and after `"cardFees": "Card fees",` add `"cashMissing": "Cash missing",`. In `src/i18n/locales/he/categories.json` `builtin`, in the same places, add `"cashFound": "מזומן שנמצא",` and `"cashMissing": "מזומן חסר",`.

- [ ] **Step 12: Run the tests to verify they pass**

Run: `pnpm test --project db src/db/versions.test.ts src/db/sync/linked.test.ts src/db/sync/erase.test.ts src/db/transfer.test.ts src/db/repos/profiles.test.ts src/db/members.test.ts src/db/repos/categories.test.ts src/db/seed.test.ts src/db/sync/middleware.test.ts src/db/sync/apply.test.ts`
Expected: PASS. `middleware.test.ts`'s "puts every table on exactly one list" passes because `cashMoves` is now in `SYNCED_TABLES`.

Run: `pnpm test --project unit src/domain/transfer-validate.test.ts src/i18n`
Expected: PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. `src/features/settings/data-card.tsx` reads only `applied.transactions`, so it needs no change.

- [ ] **Step 13: Commit**

```bash
git add src/db/versions.ts src/db/versions.test.ts src/db/db.ts src/db/sync/tables.ts src/db/sync/route.ts src/db/sync/spaces.ts src/db/sync/linked.test.ts src/db/sync/erase.test.ts src/domain/transfer-schema.ts src/domain/transfer-validate.ts src/domain/transfer-validate.test.ts src/db/transfer.ts src/db/transfer.test.ts src/db/repos/profiles.ts src/db/repos/profiles.test.ts src/db/members.ts src/db/members.test.ts src/db/seed.ts src/db/repos/categories.test.ts src/components/category-icons.ts src/i18n/locales/en/categories.json src/i18n/locales/he/categories.json
git commit -m "Cash moves are kept in their own table, in their person's space, in backups, and with the person when they leave" -m "Dexie version 4 adds cashMoves. It syncs like a transaction, in its owner's space, so unlinking takes the other person's moves off the device. Delete all data clears it, a backup carries it (a file from before reads as having none), and a merge in another currency converts it. Deleting or merging a person moves their cash with their transactions. Cash found and Cash missing are new built-in categories." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The cash-moves repository: add, edit, delete and count, each with a guarded Undo

Spec sections: §3.2 (first visit writes `start`), §3.3 (save, edit and delete with Undo; Count my cash), §7 (deleting the start returns a person to "not set up").

**Files:**

- Create: `src/db/repos/cash-moves.ts`
- Create: `src/db/repos/cash-moves.test.ts`

**Interfaces:**

- Consumes:
  - From Task 1: `CashMove`, `CashMoveKind`, `CASH_MOVE_KINDS`, and `Transaction.cashCount` / `destinationId`.
  - From Task 3: `personCash`, `cashSince`, `CashInput`, `CASH_FOUND_CATEGORY_ID`, `CASH_MISSING_CATEGORY_ID`.
  - From Task 4: `db.cashMoves`.
  - Existing: `UndoableAction` (`src/db/occurrence-actions.ts`), `findCandidates` and `findOverrides` (`src/db/repos/transactions.ts`), `materialize`, and `expandOccurrences`.
- Produces (exact exports of `src/db/repos/cash-moves.ts`):
  - `type CashMoveDraft = { profileId: string; kind: CashMoveKind; amountMinor: Minor; date: LocalDate; accountId?: string; note?: string }`
  - `class InvalidCashMoveError extends Error { readonly reason: 'kind' | 'person' | 'amount' | 'date' | 'note' }`
  - `addCashMove(db, id: string, draft: CashMoveDraft, now: IsoInstant): Promise<UndoableAction>`
  - `editCashMove(db, id: string, draft: CashMoveDraft, now: IsoInstant): Promise<UndoableAction>`. Throws `Error('gone')` for a missing or deleted move.
  - `deleteCashMove(db, id: string, now: IsoInstant): Promise<UndoableAction>` (a soft delete)
  - `listCashMoves(db): Promise<CashMove[]>` (live moves only)
  - `loadCashInput(db, query: { profileId: string; today: LocalDate }): Promise<CashInput>`. `profileId` may be `ALL_PROFILES`. It loads the moves and the expanded occurrences the cash figure needs, from the earliest start in view to the end of today's month.
  - `type CountOutcome = 'found' | 'missing' | 'matched'`
  - `recordCount(db, input: { profileId: string; countedMinor: Minor; currency: Currency; today: LocalDate; now: IsoInstant; newId: () => string }): Promise<{ readonly undoable: UndoableAction; readonly outcome: CountOutcome; readonly differenceMinor: Minor }>`. It throws `Error('not_set_up')` when the person has no figure.
- Every `UndoableAction.undo(now)` here throws `Error('changed_since')` and writes nothing if any row it would restore changed after the action. This is the same guard as `applyUndoablePlan`.

**Amount rule** (Review Focus 4): `withdraw` and `deposit` need an amount of at least 1. `start` may be 0, for someone who has no cash. `count` must be exactly 0. Every amount must be a safe integer. `profileId` must be non-empty and not `SHARED_OWNER`. `kind` must be one of `CASH_MOVE_KINDS`. `date` must be a valid `LocalDate`. A trimmed note must be at most 2000 characters. An empty note is stored as no note.

- [ ] **Step 1: Write the failing tests**

Create `src/db/repos/cash-moves.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { materialize } from '@/db/materialize';
import { cashSummary, personCash } from '@/domain/cash';
import { d, MONEY } from '@/domain/test-factories';
import { counterIdFactory } from '@/lib/id';
import { freshDb, type TestDb } from '@/test/db-harness';
import { ALL_PROFILES, CASH_METHOD_ID, SHARED_OWNER } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import {
  addCashMove,
  deleteCashMove,
  editCashMove,
  InvalidCashMoveError,
  listCashMoves,
  loadCashInput,
  recordCount,
  type CashMoveDraft,
} from './cash-moves';

const NOW = '2026-10-09T10:00:00.000Z' as IsoInstant;
const LATER = '2026-10-09T10:05:00.000Z' as IsoInstant;
const UNDONE = '2026-10-09T10:10:00.000Z' as IsoInstant;
const TODAY = d('2026-10-09');

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
});
afterEach(async () => {
  await handle.dispose();
});

const draft = (over: Partial<CashMoveDraft> = {}): CashMoveDraft => ({
  profileId: 'p1',
  kind: 'withdraw',
  amountMinor: 20_000,
  date: d('2026-10-02'),
  ...over,
});

/** One person's figure, through the same loading the cash tab uses. */
async function onHand(profileId = 'p1'): Promise<number | undefined> {
  const input = await loadCashInput(handle.db, { profileId: ALL_PROFILES, today: TODAY });
  return personCash(profileId, input.moves, input.occurrences, TODAY)?.onHandMinor;
}

async function person(id: string): Promise<void> {
  await handle.db.profiles.put({
    id,
    name: id,
    color: id === 'p1' ? '#16794a' : '#0369a1',
    openingBalanceMinor: 0,
    openingBalanceCurrency: 'USD',
    openingBalanceDate: d('2026-01-01'),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

beforeEach(async () => {
  await person('p1');
  await person('p2');
});

describe('adding a move', () => {
  it('writes it, and Undo takes it away', async () => {
    const undoable = await addCashMove(
      handle.db,
      'm1',
      draft({ accountId: 'pm.leumi', note: '  ATM  ' }),
      NOW,
    );
    expect(await handle.db.cashMoves.get('m1')).toMatchObject({
      kind: 'withdraw',
      amountMinor: 20_000,
      accountId: 'pm.leumi',
      note: 'ATM',
      isDeleted: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await undoable.undo(UNDONE);
    expect(await handle.db.cashMoves.get('m1')).toBeUndefined();
  });

  it('takes a start of nothing, for someone with no cash', async () => {
    await addCashMove(handle.db, 's1', draft({ kind: 'start', amountMinor: 0 }), NOW);
    expect(await onHand()).toBe(0);
  });

  it('refuses what is not a move, and writes nothing', async () => {
    const bad: [Partial<CashMoveDraft>, InvalidCashMoveError['reason']][] = [
      [{ amountMinor: 0 }, 'amount'],
      [{ amountMinor: -500 }, 'amount'],
      [{ amountMinor: 12.5 }, 'amount'],
      [{ kind: 'deposit', amountMinor: 0 }, 'amount'],
      [{ kind: 'count', amountMinor: 100 }, 'amount'],
      [{ kind: 'start', amountMinor: -1 }, 'amount'],
      [{ kind: 'exchange' as never }, 'kind'],
      [{ profileId: SHARED_OWNER }, 'person'],
      [{ profileId: '' }, 'person'],
      [{ date: '2026-02-30' as LocalDate }, 'date'],
      [{ note: 'x'.repeat(2001) }, 'note'],
    ];
    for (const [over, reason] of bad) {
      await expect(
        addCashMove(handle.db, 'bad', draft(over), NOW),
        JSON.stringify(over),
      ).rejects.toMatchObject({
        name: 'InvalidCashMoveError',
        reason,
      });
    }
    expect(await handle.db.cashMoves.count()).toBe(0);
  });
});

describe('editing a move', () => {
  it('changes it, clears what the form left empty, and Undo puts it back as it was', async () => {
    await addCashMove(handle.db, 'm1', draft({ accountId: 'pm.leumi', note: 'ATM' }), NOW);
    const undoable = await editCashMove(handle.db, 'm1', draft({ amountMinor: 25_000 }), LATER);

    const edited = await handle.db.cashMoves.get('m1');
    expect(edited).toMatchObject({ amountMinor: 25_000, updatedAt: LATER, createdAt: NOW });
    expect(edited).not.toHaveProperty('accountId');
    expect(edited).not.toHaveProperty('note');

    await undoable.undo(UNDONE);
    expect(await handle.db.cashMoves.get('m1')).toMatchObject({
      amountMinor: 20_000,
      accountId: 'pm.leumi',
      note: 'ATM',
      updatedAt: UNDONE,
    });
  });

  it('keeps a field a later build added', async () => {
    await handle.db.cashMoves.put({ ...(await addAndGet()), laterField: 'kept' } as never);
    await editCashMove(handle.db, 'm1', draft({ amountMinor: 1_000 }), LATER);
    expect(await handle.db.cashMoves.get('m1')).toMatchObject({ laterField: 'kept', amountMinor: 1_000 });
  });

  it('says the move is gone when it was deleted meanwhile', async () => {
    await addCashMove(handle.db, 'm1', draft(), NOW);
    await deleteCashMove(handle.db, 'm1', NOW);
    await expect(editCashMove(handle.db, 'm1', draft(), LATER)).rejects.toThrow('gone');
  });

  async function addAndGet() {
    await addCashMove(handle.db, 'm1', draft(), NOW);
    return (await handle.db.cashMoves.get('m1'))!;
  }
});

describe('deleting a move', () => {
  it('hides it, and Undo brings it back', async () => {
    await addCashMove(handle.db, 'm1', draft(), NOW);
    const undoable = await deleteCashMove(handle.db, 'm1', LATER);
    expect(await handle.db.cashMoves.get('m1')).toMatchObject({ isDeleted: 1, deletedAt: LATER });
    expect(await listCashMoves(handle.db)).toEqual([]);

    await undoable.undo(UNDONE);
    expect(await listCashMoves(handle.db)).toHaveLength(1);
    expect(await handle.db.cashMoves.get('m1')).not.toHaveProperty('deletedAt');
  });

  it('returns a person to "not set up" when it is their start, until Undo', async () => {
    await addCashMove(
      handle.db,
      's1',
      draft({ kind: 'start', amountMinor: 50_000, date: d('2026-10-01') }),
      NOW,
    );
    expect(await onHand()).toBe(50_000);

    const undoable = await deleteCashMove(handle.db, 's1', LATER);
    expect(await onHand()).toBeUndefined();

    await undoable.undo(UNDONE);
    expect(await onHand()).toBe(50_000);
  });
});

describe('an Undo offered before a later change', () => {
  it('is refused, whole, and leaves the later change in place', async () => {
    const added = await addCashMove(handle.db, 'm1', draft(), NOW);
    await editCashMove(handle.db, 'm1', draft({ amountMinor: 30_000 }), LATER);

    await expect(added.undo(UNDONE)).rejects.toThrow('changed_since');
    expect((await handle.db.cashMoves.get('m1'))?.amountMinor).toBe(30_000);
  });
});

describe('counting the cash', () => {
  beforeEach(async () => {
    await addCashMove(
      handle.db,
      's1',
      draft({ kind: 'start', amountMinor: 50_000, date: d('2026-10-01') }),
      NOW,
    );
  });

  const count = (countedMinor: number, profileId = 'p1') =>
    recordCount(handle.db, {
      profileId,
      countedMinor,
      currency: 'USD',
      today: TODAY,
      now: LATER,
      newId: counterIdFactory('rc'),
    });

  it('writes what is missing as a cash expense marked as a recount, which moves the balance', async () => {
    const result = await count(49_000);
    expect(result).toMatchObject({ outcome: 'missing', differenceMinor: -1_000 });

    const [row] = await handle.db.transactions.toArray();
    expect(row).toMatchObject({
      profileId: 'p1',
      kind: 'expense',
      categoryId: 'cat.cash_missing',
      paymentMethodId: CASH_METHOD_ID,
      cashCount: true,
      date: TODAY,
      recurrence: { type: 'one_time' },
      money: { amountMinor: 1_000, baseAmountMinor: 1_000, currency: 'USD', baseCurrency: 'USD' },
    });
    expect(row).not.toHaveProperty('destinationId');
    expect(await onHand()).toBe(49_000);
  });

  it('writes what was found as cash income marked as a recount', async () => {
    const result = await count(51_200);
    expect(result).toMatchObject({ outcome: 'found', differenceMinor: 1_200 });
    const [row] = await handle.db.transactions.toArray();
    expect(row).toMatchObject({
      kind: 'income',
      categoryId: 'cat.cash_found',
      destinationId: CASH_METHOD_ID,
      cashCount: true,
    });
    expect(row).not.toHaveProperty('paymentMethodId');
    expect(await onHand()).toBe(51_200);
  });

  it('writes a count of nothing when it matched, which only moves "Counted"', async () => {
    const result = await count(50_000);
    expect(result).toMatchObject({ outcome: 'matched', differenceMinor: 0 });
    expect(await handle.db.transactions.count()).toBe(0);
    const input = await loadCashInput(handle.db, { profileId: 'p1', today: TODAY });
    expect(cashSummary(input).countedOn).toBe(TODAY);
    expect(await handle.db.cashMoves.filter((m) => m.kind === 'count').first()).toMatchObject({
      amountMinor: 0,
      date: TODAY,
    });
  });

  it('takes the recount away again on Undo', async () => {
    const { undoable } = await count(49_000);
    await undoable.undo(UNDONE);
    expect(await handle.db.transactions.count()).toBe(0);
    expect(await onHand()).toBe(50_000);
  });

  it('measures one person’s count against that person’s cash, never the pot', async () => {
    await addCashMove(
      handle.db,
      's2',
      draft({ profileId: 'p2', kind: 'start', amountMinor: 30_000, date: d('2026-10-01') }),
      NOW,
    );

    const result = await count(28_000, 'p2');
    expect(result).toMatchObject({ outcome: 'missing', differenceMinor: -2_000 });
    expect((await handle.db.transactions.toArray())[0]).toMatchObject({ profileId: 'p2' });
    expect(await onHand('p1')).toBe(50_000);
    expect(await onHand('p2')).toBe(28_000);
  });

  it('refuses for someone who has not set up', async () => {
    await handle.db.cashMoves.clear();
    await expect(count(1_000)).rejects.toThrow('not_set_up');
  });
});

describe('loading what the cash figure needs', () => {
  it('finds a payment sent to cash by an override on a series that is not cash', async () => {
    await addCashMove(
      handle.db,
      's1',
      draft({ kind: 'start', amountMinor: 10_000, date: d('2026-08-01') }),
      NOW,
    );
    await handle.db.transactions.put(
      materialize({
        id: 'salary',
        profileId: 'p1',
        kind: 'income',
        categoryId: 'cat.salary',
        destinationId: 'pm.leumi',
        money: { ...MONEY, amountMinor: 1_000, baseAmountMinor: 1_000 },
        recurrence: { type: 'monthly', dayOfMonth: 1 },
        date: d('2026-06-01'),
        seriesRootId: 'salary',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );
    await handle.db.overrides.put({
      id: 'o1',
      transactionId: 'salary',
      occurrenceDate: d('2026-09-01'),
      action: 'modify',
      patch: { destinationId: CASH_METHOD_ID },
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(await onHand()).toBe(11_000);
  });

  it('loads nothing to expand while nobody in view has set up', async () => {
    await handle.db.transactions.put(
      materialize({
        id: 'cash',
        profileId: 'p1',
        kind: 'expense',
        categoryId: 'cat.groceries',
        paymentMethodId: CASH_METHOD_ID,
        money: MONEY,
        recurrence: { type: 'one_time' },
        date: d('2026-10-02'),
        seriesRootId: 'cash',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );
    const input = await loadCashInput(handle.db, { profileId: 'p1', today: TODAY });
    expect(input.occurrences).toEqual([]);
    expect(input.profileIds).toEqual(['p1']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --project db src/db/repos/cash-moves.test.ts`
Expected: FAIL with "Failed to resolve import './cash-moves'".

- [ ] **Step 3: Implement `src/db/repos/cash-moves.ts`**

```ts
import type { BookandryDB } from '@/db/db';
import { materialize } from '@/db/materialize';
import type { UndoableAction } from '@/db/occurrence-actions';
import {
  CASH_FOUND_CATEGORY_ID,
  CASH_MISSING_CATEGORY_ID,
  cashSince,
  personCash,
  type CashInput,
} from '@/domain/cash';
import { expandOccurrences } from '@/domain/occurrences';
import { compareLocal, endOfMonth, isLocalDate } from '@/lib/dates';
import {
  ALL_PROFILES,
  CASH_METHOD_ID,
  CASH_MOVE_KINDS,
  SHARED_OWNER,
  type CashMove,
  type CashMoveKind,
  type Override,
  type Transaction,
} from '@/types/domain';
import type { Currency, IsoInstant, LocalDate, Minor } from '@/types/money';

import { findCandidates, findOverrides } from './transactions';

/**
 * The cash tab's writes: the amount someone started with, money taken from
 * the bank or put back, and a count.
 *
 * Every write offers Undo the way the feed does (`applyUndoablePlan`): what it
 * replaced is kept, and Undo puts exactly that back, in one transaction - or
 * refuses, whole, once any of those rows has changed since, so it never
 * silently overwrites a later edit.
 */

export type CashMoveDraft = {
  readonly profileId: string;
  readonly kind: CashMoveKind;
  readonly amountMinor: Minor;
  readonly date: LocalDate;
  readonly accountId?: string;
  readonly note?: string;
};

export class InvalidCashMoveError extends Error {
  constructor(readonly reason: 'kind' | 'person' | 'amount' | 'date' | 'note') {
    super(`Not a cash move: ${reason}`);
    this.name = 'InvalidCashMoveError';
  }
}

const KINDS: ReadonlySet<string> = new Set(CASH_MOVE_KINDS);
const NOTE_MAX = 2000;

/** The draft, held to what a move can be. Throws rather than writing half of one. */
function checked(draft: CashMoveDraft): {
  readonly fields: Pick<CashMove, 'profileId' | 'kind' | 'amountMinor' | 'date'>;
  readonly accountId: string | undefined;
  readonly note: string | undefined;
} {
  if (!KINDS.has(draft.kind)) throw new InvalidCashMoveError('kind');
  if (draft.profileId === '' || draft.profileId === SHARED_OWNER) throw new InvalidCashMoveError('person');
  const amount = draft.amountMinor;
  const fits =
    Number.isSafeInteger(amount) &&
    (draft.kind === 'count' ? amount === 0 : draft.kind === 'start' ? amount >= 0 : amount > 0);
  if (!fits) throw new InvalidCashMoveError('amount');
  if (!isLocalDate(draft.date)) throw new InvalidCashMoveError('date');
  const note = draft.note?.trim();
  if (note !== undefined && note.length > NOTE_MAX) throw new InvalidCashMoveError('note');
  return {
    fields: { profileId: draft.profileId, kind: draft.kind, amountMinor: amount, date: draft.date },
    accountId: draft.accountId === undefined || draft.accountId === '' ? undefined : draft.accountId,
    note: note === undefined || note === '' ? undefined : note,
  };
}

/**
 * Run `write` and keep what it overwrote; Undo restores exactly that.
 *
 * A row that did not exist before is deleted on Undo; every other is written
 * back whole, stamped with the Undo's instant so it wins a later merge. Each
 * row's `updatedAt` as the write left it is the witness that nothing changed
 * since.
 */
async function undoable(
  db: BookandryDB,
  ids: { readonly moves: readonly string[]; readonly transactions: readonly string[] },
  write: () => Promise<void>,
): Promise<UndoableAction> {
  let movesBefore: readonly (CashMove | undefined)[] = [];
  let transactionsBefore: readonly (Transaction | undefined)[] = [];
  let written: readonly (IsoInstant | undefined)[] = [];

  const stamps = async (): Promise<readonly (IsoInstant | undefined)[]> => [
    ...(await db.cashMoves.bulkGet([...ids.moves])).map((row) => row?.updatedAt),
    ...(await db.transactions.bulkGet([...ids.transactions])).map((row) => row?.updatedAt),
  ];

  await db.transaction('rw', [db.cashMoves, db.transactions], async () => {
    movesBefore = await db.cashMoves.bulkGet([...ids.moves]);
    transactionsBefore = await db.transactions.bulkGet([...ids.transactions]);
    await write();
    written = await stamps();
  });

  return {
    undo: async (undoneAt: IsoInstant) => {
      await db.transaction('rw', [db.cashMoves, db.transactions], async () => {
        const now = await stamps();
        // Thrown inside the transaction, so nothing below is written.
        if (now.some((stamp, i) => stamp !== written[i])) throw new Error('changed_since');
        for (const [i, id] of ids.moves.entries()) {
          const before = movesBefore[i];
          if (before === undefined) await db.cashMoves.delete(id);
          else await db.cashMoves.put({ ...before, updatedAt: undoneAt });
        }
        for (const [i, id] of ids.transactions.entries()) {
          const before = transactionsBefore[i];
          if (before === undefined) await db.transactions.delete(id);
          else await db.transactions.put({ ...before, updatedAt: undoneAt });
        }
      });
    },
  };
}

export async function addCashMove(
  db: BookandryDB,
  id: string,
  draft: CashMoveDraft,
  now: IsoInstant,
): Promise<UndoableAction> {
  const { fields, accountId, note } = checked(draft);
  const row: CashMove = {
    id,
    ...fields,
    ...(accountId === undefined ? {} : { accountId }),
    ...(note === undefined ? {} : { note }),
    isDeleted: 0,
    createdAt: now,
    updatedAt: now,
  };
  return undoable(db, { moves: [id], transactions: [] }, async () => {
    await db.cashMoves.add(row);
  });
}

export async function editCashMove(
  db: BookandryDB,
  id: string,
  draft: CashMoveDraft,
  now: IsoInstant,
): Promise<UndoableAction> {
  const { fields, accountId, note } = checked(draft);
  const existing = await db.cashMoves.get(id);
  if (existing === undefined || existing.isDeleted === 1) throw new Error('gone');
  // Spread first: a field a later build added rides along untouched.
  const { accountId: _account, note: _note, ...kept } = existing;
  const row: CashMove = {
    ...kept,
    ...fields,
    ...(accountId === undefined ? {} : { accountId }),
    ...(note === undefined ? {} : { note }),
    updatedAt: now,
  };
  return undoable(db, { moves: [id], transactions: [] }, async () => {
    await db.cashMoves.put(row);
  });
}

export async function deleteCashMove(db: BookandryDB, id: string, now: IsoInstant): Promise<UndoableAction> {
  const existing = await db.cashMoves.get(id);
  if (existing === undefined || existing.isDeleted === 1) throw new Error('gone');
  return undoable(db, { moves: [id], transactions: [] }, async () => {
    await db.cashMoves.put({ ...existing, isDeleted: 1, deletedAt: now, updatedAt: now });
  });
}

/** Every live move, everyone's. A household writes a handful a week, so a scan is fine. */
export async function listCashMoves(db: BookandryDB): Promise<CashMove[]> {
  return db.cashMoves.filter((m) => m.isDeleted === 0).toArray();
}

/**
 * Whether a transaction can produce a cash occurrence: it names cash itself,
 * or one of its overrides does. An occurrence's method or destination is the
 * override's when it sets one and the series' otherwise, so a series where
 * neither names cash has no cash occurrence at all.
 */
function canBeCash(tx: Transaction, overrides: readonly Override[]): boolean {
  if (tx.paymentMethodId === CASH_METHOD_ID || tx.destinationId === CASH_METHOD_ID) return true;
  return overrides.some(
    (o) =>
      o.transactionId === tx.id &&
      (o.patch?.paymentMethodId === CASH_METHOD_ID || o.patch?.destinationId === CASH_METHOD_ID),
  );
}

/**
 * What the cash figure needs for the people in view: every live move, and
 * the cash rows' occurrences from the earliest start among them to the end of
 * today's month (the month's rows still to come are its "expected" line).
 */
export async function loadCashInput(
  db: BookandryDB,
  query: { readonly profileId: string; readonly today: LocalDate },
): Promise<CashInput> {
  const { today } = query;
  const profileIds =
    query.profileId === ALL_PROFILES ? (await db.profiles.toArray()).map((p) => p.id) : [query.profileId];
  const moves = await listCashMoves(db);

  let from: LocalDate | undefined;
  for (const id of profileIds) {
    const since = cashSince(moves, id);
    if (since === undefined || compareLocal(since, today) > 0) continue;
    if (from === undefined || compareLocal(since, from) < 0) from = since;
  }
  if (from === undefined) return { profileIds, moves, occurrences: [], today };

  const to = endOfMonth(today);
  const candidates = await findCandidates(db, { profileId: query.profileId, from, to });
  const overrides = await findOverrides(
    db,
    candidates.map((t) => t.id),
  );
  const occurrences = candidates
    .filter((tx) => canBeCash(tx, overrides))
    .flatMap((tx) =>
      expandOccurrences(
        tx,
        overrides.filter((o) => o.transactionId === tx.id),
        from,
        to,
        { today },
      ),
    );
  return { profileIds, moves, occurrences, today };
}

export type CountOutcome = 'found' | 'missing' | 'matched';

/**
 * "Count my cash": the difference between what is in the wallet and this
 * person's own figure, written so the figure agrees.
 *
 * - more than recorded: cash income ("Cash found"), so the balance rises with it;
 * - less: a cash expense ("Cash missing"), so the balance falls with it;
 * - the same: a `count` move of nothing, which only moves "Counted".
 *
 * A recount row is an ordinary cash row tagged `cashCount`, so an older build
 * sees a normal income or expense and its balance is right.
 */
export async function recordCount(
  db: BookandryDB,
  input: {
    readonly profileId: string;
    readonly countedMinor: Minor;
    readonly currency: Currency;
    readonly today: LocalDate;
    readonly now: IsoInstant;
    readonly newId: () => string;
  },
): Promise<{
  readonly undoable: UndoableAction;
  readonly outcome: CountOutcome;
  readonly differenceMinor: Minor;
}> {
  const { profileId, countedMinor, currency, today, now, newId } = input;
  if (!Number.isSafeInteger(countedMinor) || countedMinor < 0) throw new InvalidCashMoveError('amount');

  const loaded = await loadCashInput(db, { profileId, today });
  const figure = personCash(profileId, loaded.moves, loaded.occurrences, today);
  if (figure === undefined) throw new Error('not_set_up');

  const differenceMinor = countedMinor - figure.onHandMinor;
  const id = newId();

  if (differenceMinor === 0) {
    const undo = await addCashMove(db, id, { profileId, kind: 'count', amountMinor: 0, date: today }, now);
    return { undoable: undo, outcome: 'matched', differenceMinor };
  }

  const found = differenceMinor > 0;
  const amountMinor = Math.abs(differenceMinor);
  const row = materialize({
    id,
    profileId,
    kind: found ? 'income' : 'expense',
    categoryId: found ? CASH_FOUND_CATEGORY_ID : CASH_MISSING_CATEGORY_ID,
    ...(found ? { destinationId: CASH_METHOD_ID } : { paymentMethodId: CASH_METHOD_ID }),
    cashCount: true,
    // In the household's own currency: the identity snapshot a same-currency save writes.
    money: {
      amountMinor,
      currency,
      baseCurrency: currency,
      baseAmountMinor: amountMinor,
      rateUsed: '1',
      rateDate: today,
      rateSource: 'manual',
    },
    recurrence: { type: 'one_time' },
    date: today,
    seriesRootId: id,
    createdAt: now,
    updatedAt: now,
  });
  const undo = await undoable(db, { moves: [], transactions: [id] }, async () => {
    await db.transactions.add(row);
  });
  return { undoable: undo, outcome: found ? 'found' : 'missing', differenceMinor };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test --project db src/db/repos/cash-moves.test.ts`
Expected: PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. If `import-x/no-cycle` reports a cycle through `@/db/occurrence-actions`, keep it as `import type`. It is type-only and never cycles at runtime.

- [ ] **Step 5: Commit**

```bash
git add src/db/repos/cash-moves.ts src/db/repos/cash-moves.test.ts
git commit -m "Cash moves can be added, changed, deleted and counted, and each one can be undone until something changes it" -m "A count writes the difference against that person's own cash: a Cash found income or a Cash missing expense marked as a recount, or a count of nothing when it matched. Undo restores exactly what was there, and refuses once a row has changed since, the same guard the feed uses." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The income destination through the form schema, the edit patch and save, and the pure options and default

Spec sections: §1.1 (series scopes, validation), §3.4 (options, default from the last 6 months, the "Whose?" rule, no cards).

**Files:**

- Create: `src/domain/income-destination.ts`
- Create: `src/domain/income-destination.test.ts`
- Modify: `src/domain/tx-form.ts:179-186` (schema field), `:346-354` (transform), `:580-610` (`defaultFormValues`)
- Modify: `src/domain/tx-edit.ts:97-135` (`occurrenceToFormValues`), `:150-178` (`duplicateFormValues`), `:198-239` (`buildPatch`)
- Modify: `src/db/save-transaction.ts:96-122` (`saveNewTransaction`)
- Test: `src/domain/tx-form.test.ts`, `src/domain/tx-edit.test.ts`, `src/db/save-transaction.test.ts`

**Interfaces:**

- Consumes: `Transaction.destinationId`, `Occurrence.destinationId`, `TransactionPatch.destinationId` (Task 1). `methodOwnedBy` (`src/domain/tx-options.ts`). `isActiveMethod` and `CASH_METHOD_ID` (`@/types/domain`).
- Produces:
  - In `src/domain/income-destination.ts`:
    - `isDestinationType(method: Pick<PaymentMethod, 'id' | 'type'>): boolean`: a `bank_account`, or `pm.cash`. Never a card.
    - `destinationsFor(methods: readonly PaymentMethod[], profileId: string, keepId?: string): readonly PaymentMethod[]`: the person's active bank accounts and the joint ones they hold, sorted by label, then cash. The row's own `keepId` is kept even when archived.
    - `DESTINATION_HISTORY_MONTHS = 6`
    - `defaultDestination(history: readonly Occurrence[], profileId: string, methods: readonly PaymentMethod[], today: LocalDate): string`: the destination id this person's income reached most often in the last 6 months, counted by payment, with a tie going to the most recent. `''` means "Not assigned".
  - `TxFormValues.destinationId` (an input field, optional, defaulting to `''`). `TxFormParsed.destinationId: string | undefined`, which is set only for income.
  - `buildPatch` emits `destinationId` (a string, or `null` to clear) only when it changed.
  - `duplicateFormValues` keeps the source row's destination when the form's person can use it, and drops it otherwise.
  - `saveNewTransaction` writes `destinationId` when present.

- [ ] **Step 1: Write the failing tests for the options and the default**

Create `src/domain/income-destination.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  CASH_METHOD_ID,
  SHARED_OWNER,
  type Occurrence,
  type PaymentMethod,
  type Transaction,
} from '@/types/domain';
import type { IsoInstant } from '@/types/money';

import { defaultDestination, destinationsFor, isDestinationType } from './income-destination';
import { expandOccurrences } from './occurrences';
import { d, makeTx, MONEY } from './test-factories';

const AT = '2026-01-01T00:00:00.000Z' as IsoInstant;
const TODAY = d('2026-10-09');

const method = (id: string, over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id,
  profileId: 'p1',
  type: 'bank_account',
  label: id,
  account: { bank: '10', holding: 'personal' },
  isArchived: 0,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});
const cash = method(CASH_METHOD_ID, {
  profileId: SHARED_OWNER,
  type: 'cash',
  label: 'Cash',
  account: undefined,
});
const card = method('visa', { type: 'credit_card', account: undefined });
const leumi = method('Leumi');
const hapoalim = method('Hapoalim');
const joint = method('Joint', {
  profileId: SHARED_OWNER,
  account: { bank: '12', holding: 'joint', holders: ['p1', 'p2'] },
});
const parents = method('Parents', {
  profileId: SHARED_OWNER,
  account: { bank: '12', holding: 'joint', holders: ['p2', 'p3'] },
});
const yossis = method('Yossi', { profileId: 'p2' });
const closed = method('Closed', { isArchived: 1 });
const ALL = [cash, card, leumi, hapoalim, joint, parents, yossis, closed];

describe('where income can go', () => {
  it('is a bank account or cash, never a card', () => {
    expect(isDestinationType(leumi)).toBe(true);
    expect(isDestinationType(cash)).toBe(true);
    expect(isDestinationType(card)).toBe(false);
    expect(isDestinationType(method('wallet', { type: 'digital_wallet' }))).toBe(false);
  });

  it('is the person’s own accounts and the joint ones they hold, by name, then cash', () => {
    expect(destinationsFor(ALL, 'p1').map((m) => m.id)).toEqual([
      'Hapoalim',
      'Joint',
      'Leumi',
      CASH_METHOD_ID,
    ]);
    expect(destinationsFor(ALL, 'p2').map((m) => m.id)).toEqual([
      'Joint',
      'Parents',
      'Yossi',
      CASH_METHOD_ID,
    ]);
  });

  it('keeps an archived account already on the row, and offers it to no one else', () => {
    expect(destinationsFor(ALL, 'p1', 'Closed').map((m) => m.id)).toContain('Closed');
    expect(destinationsFor(ALL, 'p1').map((m) => m.id)).not.toContain('Closed');
  });
});

describe('where new income goes by default', () => {
  const income = (
    id: string,
    date: string,
    destinationId: string | undefined,
    over: Partial<Transaction> = {},
  ) =>
    makeTx({
      id,
      kind: 'income',
      categoryId: 'cat.salary',
      date: d(date),
      recurrence: { type: 'one_time' },
      money: MONEY,
      ...(destinationId === undefined ? {} : { destinationId }),
      ...over,
    });
  const history = (...txs: Transaction[]): Occurrence[] =>
    txs.flatMap((tx) => expandOccurrences(tx, [], d('2025-01-01'), TODAY, { today: TODAY }));

  it('is where this person’s income went most often in the last six months, counted by payment', () => {
    const salary = income('salary', '2026-05-01', 'Leumi', {
      recurrence: { type: 'monthly', dayOfMonth: 1 },
    });
    const gifts = [income('g1', '2026-09-01', CASH_METHOD_ID), income('g2', '2026-09-02', CASH_METHOD_ID)];
    expect(defaultDestination(history(salary, ...gifts), 'p1', ALL, TODAY)).toBe('Leumi');
  });

  it('goes to the more recent of two equally frequent', () => {
    const txs = [income('a', '2026-06-01', 'Leumi'), income('b', '2026-08-01', 'Hapoalim')];
    expect(defaultDestination(history(...txs), 'p1', ALL, TODAY)).toBe('Hapoalim');
  });

  it('is not assigned when nothing in six months said where it went', () => {
    const txs = [income('old', '2026-03-01', 'Leumi'), income('blank', '2026-09-01', undefined)];
    expect(defaultDestination(history(...txs), 'p1', ALL, TODAY)).toBe('');
  });

  it('counts only this person’s income, and only somewhere they can still use', () => {
    const txs = [
      income('theirs', '2026-09-01', 'Yossi', { profileId: 'p2' }),
      income('archived', '2026-09-02', 'Closed'),
      income('gone', '2026-09-03', 'pm.deleted'),
    ];
    expect(defaultDestination(history(...txs), 'p1', ALL, TODAY)).toBe('');
  });
});
```

- [ ] **Step 2: Write the failing form, patch and save tests**

Append to `src/domain/tx-form.test.ts`:

```ts
describe('where income went', () => {
  it('is kept for income', () => {
    expect(parse(values({ kind: 'income', destinationId: 'pm.cash' })).destinationId).toBe('pm.cash');
  });

  it('is stripped from an expense, which only says what paid for it', () => {
    // Switching income -> expense leaves the old destination behind; saving it
    // would count the expense as cash coming in, and a file would refuse it.
    expect(parse(values({ kind: 'expense', destinationId: 'pm.cash' })).destinationId).toBeUndefined();
  });

  it('is undefined when not assigned, and starts that way', () => {
    expect(defaultFormValues({ profileId: 'p1', currency: 'ILS', today: TODAY }).destinationId).toBe('');
    expect(parse(values({ kind: 'income', destinationId: '' })).destinationId).toBeUndefined();
  });

  it('is never confused with a payment method switching the other way', () => {
    const parsed = parse(values({ kind: 'income', paymentMethodId: 'pm.cash', destinationId: '' }));
    expect(parsed.paymentMethodId).toBeUndefined();
    expect(parsed.destinationId).toBeUndefined();
  });
});
```

Append to `src/domain/tx-edit.test.ts`:

```ts
describe('where income went, in the edit form', () => {
  const salary = (over: Partial<Transaction> = {}, overrides: readonly Override[] = []) =>
    rent({ kind: 'income', categoryId: 'cat.salary', destinationId: 'Leumi', ...over }, overrides);

  it('opens on the occurrence’s own destination', () => {
    const toCash = modify('rent', d('2026-09-10'), { destinationId: 'pm.cash' });
    const tx = salary({}, [toCash]);
    expect(occurrenceToFormValues(occurrenceOf(tx, [toCash], '2026-09-10'), tx).destinationId).toBe(
      'pm.cash',
    );
    expect(occurrenceToFormValues(occurrenceOf(tx, [toCash], '2026-08-10'), tx).destinationId).toBe('Leumi');
    const none = rent();
    expect(occurrenceToFormValues(occurrenceOf(none, [], '2026-09-10'), none).destinationId).toBe('');
  });

  it('patches it only when it changed, and clears it with null', () => {
    const tx = salary();
    const occurrence = occurrenceOf(tx, [], '2026-09-10');
    const base = occurrenceToFormValues(occurrence, tx);
    const patchFor = (destinationId: string) =>
      buildPatch({
        parsed: parse({ ...base, destinationId }),
        occurrence,
        transaction: tx,
        scope: 'one',
        money: occurrence.money,
      });

    expect(isEmptyPatch(patchFor('Leumi'))).toBe(true);
    expect(patchFor('pm.cash')).toEqual({ destinationId: 'pm.cash' });
    expect(patchFor('')).toEqual({ destinationId: null });
  });

  it('keeps it on a duplicate the person can use, and drops it otherwise', () => {
    const NOW = '2026-01-01T00:00:00.000Z' as IsoInstant;
    const account = (id: string, profileId: string): PaymentMethod => ({
      id,
      profileId,
      type: 'bank_account',
      label: id,
      account: { bank: '10', holding: 'personal' },
      isArchived: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const tx = salary({ profileId: 'p2', destinationId: 'yossi-bank' });
    const occurrence = occurrenceOf(tx, [], '2026-09-10');
    const base = defaultFormValues({ profileId: 'p1', currency: 'ILS', today: d('2026-10-08') });
    const methods = [account('yossi-bank', 'p2')];

    expect(
      duplicateFormValues(occurrence, tx, base, d('2026-10-08'), {
        profiles: [{ id: 'p1' }, { id: 'p2' }],
        methods,
      }).destinationId,
    ).toBe('yossi-bank');
    expect(
      duplicateFormValues(occurrence, tx, base, d('2026-10-08'), { profiles: [{ id: 'p1' }], methods })
        .destinationId,
    ).toBe('');
  });
});
```

Append to `src/db/save-transaction.test.ts`. It uses the file's own `form()` and `input()` helpers:

```ts
describe('where income went', () => {
  it('is written for income, and never for an expense', async () => {
    const income = form({
      kind: 'income',
      categoryId: 'cat.salary',
      currency: 'ILS',
      destinationId: 'pm.cash',
    });
    const saved = await saveNewTransaction(handle.db, input({ parsed: income, newId: () => 'in1' }));
    expect(saved.transaction.destinationId).toBe('pm.cash');
    expect((await handle.db.transactions.get('in1'))?.destinationId).toBe('pm.cash');

    const expense = form({ currency: 'ILS', destinationId: 'pm.cash' });
    await saveNewTransaction(handle.db, input({ parsed: expense, newId: () => 'out1' }));
    expect(await handle.db.transactions.get('out1')).not.toHaveProperty('destinationId');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test --project unit src/domain/income-destination.test.ts src/domain/tx-form.test.ts src/domain/tx-edit.test.ts`
Expected: FAIL. `./income-destination` does not resolve. `parse(...).destinationId` is `undefined` where `'pm.cash'` is expected, because zod strips the unknown key. `occurrenceToFormValues(...).destinationId` is `undefined`, not `''`.

Run: `pnpm test --project db src/db/save-transaction.test.ts`
Expected: FAIL. `transaction.destinationId` is `undefined`.

- [ ] **Step 4: Implement `src/domain/income-destination.ts`**

```ts
import { addMonthsClamped, compareLocal } from '@/lib/dates';
import { CASH_METHOD_ID, isActiveMethod, type Occurrence, type PaymentMethod } from '@/types/domain';
import type { LocalDate } from '@/types/money';

import { methodOwnedBy } from './tx-options';

/**
 * Where income lands: "Goes to" on the income form, the feed row's mark, and
 * an account's "Incoming" line.
 *
 * A bank account it lands in is a label (per-account balances are not
 * modelled); cash is what the cash tab counts. A card is never offered:
 * income does not land on a card.
 */

/** A bank account, or the built-in cash. */
export function isDestinationType(method: Pick<PaymentMethod, 'id' | 'type'>): boolean {
  return method.id === CASH_METHOD_ID || method.type === 'bank_account';
}

/**
 * The "Goes to" options for one person: their own bank accounts and the joint
 * ones they hold (`methodOwnedBy`, the rule the payment picker uses), by name,
 * then cash. Archived accounts are left out, except the one already on the
 * row, which an edit must not silently lose.
 */
export function destinationsFor(
  methods: readonly PaymentMethod[],
  profileId: string,
  keepId = '',
): readonly PaymentMethod[] {
  const usable = methods.filter(
    (m) => isDestinationType(m) && methodOwnedBy(m, profileId) && (m.id === keepId || isActiveMethod(m)),
  );
  return [
    ...usable.filter((m) => m.id !== CASH_METHOD_ID).sort((a, b) => a.label.localeCompare(b.label)),
    ...usable.filter((m) => m.id === CASH_METHOD_ID),
  ];
}

/** How far back "where it usually goes" looks. */
export const DESTINATION_HISTORY_MONTHS = 6;

/**
 * Where new income goes unless the person says otherwise: where this person's
 * income went most often in the last six months, counted by PAYMENT - a
 * monthly salary is six arrivals, a gift is one - with a tie going to the
 * more recent. '' ("Not assigned") when none of it said, or when it went
 * somewhere this person can no longer use.
 */
export function defaultDestination(
  history: readonly Occurrence[],
  profileId: string,
  methods: readonly PaymentMethod[],
  today: LocalDate,
): string {
  const from = addMonthsClamped(today, -DESTINATION_HISTORY_MONTHS);
  const usable = new Set(destinationsFor(methods, profileId).map((m) => m.id));
  const tally = new Map<string, { count: number; last: LocalDate }>();

  for (const o of history) {
    if (o.transaction.kind !== 'income' || o.transaction.profileId !== profileId || o.isSkipped) continue;
    if (compareLocal(o.date, from) < 0 || compareLocal(o.date, today) > 0) continue;
    const id = o.destinationId;
    if (id === undefined || !usable.has(id)) continue;
    const seen = tally.get(id);
    tally.set(id, {
      count: (seen?.count ?? 0) + 1,
      last: seen === undefined || compareLocal(o.date, seen.last) > 0 ? o.date : seen.last,
    });
  }

  let best: { id: string; count: number; last: LocalDate } | undefined;
  for (const [id, { count, last }] of tally) {
    if (
      best === undefined ||
      count > best.count ||
      (count === best.count && compareLocal(last, best.last) > 0)
    ) {
      best = { id, count, last };
    }
  }
  return best?.id ?? '';
}
```

- [ ] **Step 5: Add the field to the form schema**

In `src/domain/tx-form.ts` `txFormSchema`, after `paymentMethodId: z.string(),`:

```ts
    /**
     * Income only: where it went ("Goes to") - a bank account or cash. '' is
     * "Not assigned". A default rather than a required key, so every caller
     * that builds form values without it (import review, older tests) still
     * parses.
     */
    destinationId: z.string().default(''),
```

In the `.transform`, after the `paymentMethodId:` entry:

```ts
      /*
       * And the mirror image: an expense never says where money went.
       * Stripped for the same reason - it is what toggling income -> expense
       * leaves behind - and because an expense carrying it would be counted
       * as cash coming in.
       */
      destinationId:
        values.kind === 'income' && values.destinationId !== '' ? values.destinationId : undefined,
```

In `defaultFormValues`, after `paymentMethodId: '',`:

```ts
    destinationId: '',
```

- [ ] **Step 6: Carry it through the edit form**

In `src/domain/tx-edit.ts`, add `import { destinationsFor } from './income-destination';` after the `./tx-form` type import. In `occurrenceToFormValues`, after `paymentMethodId: occurrence.paymentMethodId ?? '',`:

```ts
    destinationId: occurrence.destinationId ?? '',
```

In `duplicateFormValues`, after the `paymentMethodId:` line in the returned object:

```ts
    // Where the income went, when the form's person can say it went there too.
    destinationId: destinationsFor(owners.methods, profileId).some((m) => m.id === from.destinationId)
      ? from.destinationId
      : '',
```

and add to its doc comment: "Where income went is kept by the same rule."

In `buildPatch`, add `destinationId?: string | null;` to the local `patch` type, and after the `paymentMethodId` block:

```ts
if ((parsed.destinationId ?? '') !== (occurrence.destinationId ?? '')) {
  // `null` clears it, exactly as for a payment method.
  patch.destinationId = parsed.destinationId ?? null;
}
```

- [ ] **Step 7: Save it**

In `src/db/save-transaction.ts` `saveNewTransaction`, in the `draft`, after the `paymentMethodId` spread line:

```ts
      ...(parsed.destinationId === undefined ? {} : { destinationId: parsed.destinationId }),
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test --project unit src/domain/income-destination.test.ts src/domain/tx-form.test.ts src/domain/tx-edit.test.ts`
Expected: PASS.

Run: `pnpm test --project db src/db/save-transaction.test.ts`
Expected: PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. `import-x/no-cycle` must stay clean: `income-destination.ts` imports only `tx-options`, never `tx-edit`.

- [ ] **Step 9: Commit**

```bash
git add src/domain/income-destination.ts src/domain/income-destination.test.ts src/domain/tx-form.ts src/domain/tx-form.test.ts src/domain/tx-edit.ts src/domain/tx-edit.test.ts src/db/save-transaction.ts src/db/save-transaction.test.ts
git commit -m "The transaction form can carry where income went, saves it, and edits it at any scope" -m "Destinations are a person's bank accounts, the joint ones they hold, and cash, never a card. The default for new income is where that person's income went most often in the last six months, counted by payment. Switching to an expense strips the destination, as switching to income strips a payment method." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The "Goes to" picker in the transaction sheet, its default, and the cash presets

Spec sections: §3.3 (items 5–6: cash expense and cash income open the normal form, preset), §3.4.

**Files:**

- Create: `src/features/transaction/destination-field.tsx`
- Create: `src/features/transaction/use-income-history.ts`
- Modify: `src/features/transaction/use-transaction-sheet.ts:13-48` (the `CASH` param and `SheetTarget`), `:58-75` (`TransactionSheetApi.openAdd`), `:96-196` (parse and write `cash`), `:198-212` (`openAdd`)
- Modify: `src/features/transaction/transaction-sheet.tsx`, at the anchors named in the steps
- Modify: `src/features/feed/feed-screen.tsx:313-323` (pass `incomeHistory`)
- Modify: `src/i18n/locales/en/common.json`, `src/i18n/locales/he/common.json` (`tx.destination*`)
- Test: `src/features/transaction/transaction-sheet.test.tsx`, `src/features/transaction/use-transaction-sheet.test.tsx`

**Interfaces:**

- Consumes: `destinationsFor`, `defaultDestination` and `DESTINATION_HISTORY_MONTHS` (Task 6). `TxFormValues.destinationId` (Task 6). `methodOwnedBy`. `methodDisplayName`. `PickerField`.
- Produces:
  - `SheetTarget` add mode gains `cash?: true`, written as `?add=expense&cash=1` or `?add=income&cash=1`
  - `TransactionSheetApi.openAdd: (kind?: Kind, preset?: { readonly cash?: boolean }) => void`. `openAdd('expense', { cash: true })` opens the expense form with Paid with = Cash. `openAdd('income', { cash: true })` opens the income form with Goes to = Cash.
  - `useIncomeHistory(today: LocalDate): readonly Occurrence[] | undefined` in `src/features/transaction/use-income-history.ts`
  - `TransactionSheet` gains an optional prop `incomeHistory?: readonly Occurrence[]`. Every screen that mounts the sheet (the feed now, Cash in Task 9) passes `useIncomeHistory(today)`.
  - `DestinationField({ value, onChange, profileId, methods, labelledBy })` in `src/features/transaction/destination-field.tsx`

**Ruling:** the default comes from history the screen has already loaded. The sheet is mounted with its screen, long before anyone taps Add, so the history is there. A cold deep link straight to `/?add=income` may open before it loads and start on "Not assigned". That is safe, because the destination is optional. This avoids an effect that rewrites the form after it opens.

**Copy (en / he):** `tx.destination` "Goes to" / "נכנס ל". `tx.destinationNone` "Not assigned" / "לא שויך". `tx.destinationEmpty` "No bank accounts yet. Add one under Bank accounts." / "אין עדיין חשבונות בנק. אפשר להוסיף בחשבונות בנק."

- [ ] **Step 1: Write the failing URL test**

In `src/features/transaction/use-transaction-sheet.test.tsx`, add two buttons to `Probe`, after the `income` button:

```tsx
      <button
        type="button"
        onClick={() => {
          sheet.openAdd('expense', { cash: true });
        }}
      >
        cash expense
      </button>
      <button
        type="button"
        onClick={() => {
          sheet.openAdd('income', { cash: true });
        }}
      >
        cash income
      </button>
```

and append, inside `describe('useTransactionSheet add', …)`:

```ts
  it('writes a cash preset into the URL, and reads it back', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Probe />);

    await user.click(screen.getByRole('button', { name: 'cash expense' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?add=expense&cash=1');
    expect(target()).toEqual({ mode: 'add', kind: 'expense', cash: true });

    await user.click(screen.getByRole('button', { name: 'cash income' }));
    expect(target()).toEqual({ mode: 'add', kind: 'income', cash: true });

    await user.click(screen.getByRole('button', { name: 'plain' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?add=expense');
    expect(screen.getByTestId('search')).not.toHaveTextContent('cash');
  });
```

- [ ] **Step 2: Write the failing sheet tests**

In `src/features/transaction/transaction-sheet.test.tsx`, change the `@/types/domain` import to `import { CASH_METHOD_ID, SHARED_OWNER, type Category, type Occurrence, type PaymentMethod, type Profile } from '@/types/domain';`, add `import { expandOccurrences } from '@/domain/occurrences';` (alphabetical among the `@/domain` imports), and append:

```ts
describe('where income goes', () => {
  const salary: Category = {
    ...groceries,
    id: 'cat.salary',
    kind: 'income',
    nameKey: 'categories:builtin.salary',
  };
  const yossi = { ...profile, id: 'p2', name: 'Yossi' } as Profile;
  const account = (id: string, label: string, over: Partial<PaymentMethod> = {}): PaymentMethod => ({
    id,
    profileId: 'p1',
    type: 'bank_account',
    label,
    account: { bank: '10', holding: 'personal' },
    isArchived: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  });
  const cash: PaymentMethod = {
    id: CASH_METHOD_ID,
    profileId: SHARED_OWNER,
    type: 'cash',
    label: 'Cash',
    isArchived: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const leumi = account('pm.leumi', 'Leumi current');
  const discount = account('pm.discount', 'Discount savings');

  function add(
    target: Parameters<typeof TransactionSheet>[0]['target'],
    {
      profiles = [profile],
      methods = [maxCard, leumi, discount, cash],
      incomeHistory,
    }: { profiles?: Profile[]; methods?: PaymentMethod[]; incomeHistory?: readonly Occurrence[] } = {},
  ) {
    const onSaved = vi.fn();
    renderWithProviders(
      <TransactionSheet
        target={target}
        onOpenChange={() => undefined}
        profiles={profiles}
        categories={[groceries, salary]}
        paymentMethods={methods}
        activeProfileId="p1"
        baseCurrency="ILS"
        today={TODAY}
        onSaved={onSaved}
        {...(incomeHistory === undefined ? {} : { incomeHistory })}
      />,
    );
    return { onSaved, user: userEvent.setup() };
  }
  const goesTo = () => screen.getByRole('combobox', { name: /Goes to/ });

  it('offers the person’s accounts, then cash, then not assigned, and never a card', async () => {
    const { user } = add({ mode: 'add', kind: 'income' });
    expect(screen.queryByRole('combobox', { name: /Paid with/ })).toBeNull();

    await user.click(goesTo());
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options[0]).toMatch(/^Discount savings/);
    expect(options[1]).toMatch(/^Leumi current/);
    expect(options[2]).toMatch(/^Cash/);
    expect(options[3]).toMatch(/^Not assigned/);
    expect(options.some((text) => text.includes('Max'))).toBe(false);
  });

  it('starts new income where this person’s income usually goes, or on not assigned', () => {
    const history = expandOccurrences(
      makeTx({
        id: 'pay',
        kind: 'income',
        categoryId: 'cat.salary',
        date: '2026-07-01' as LocalDate,
        recurrence: { type: 'monthly', dayOfMonth: 1 },
        destinationId: 'pm.leumi',
      }),
      [],
      '2026-04-08' as LocalDate,
      TODAY,
      { today: TODAY },
    );
    add({ mode: 'add', kind: 'income' }, { incomeHistory: history });
    expect(goesTo()).toHaveAccessibleName(/Leumi current/);
  });

  it('starts on not assigned with nothing to go by', () => {
    add({ mode: 'add', kind: 'income' });
    expect(goesTo()).toHaveAccessibleName(/Not assigned/);
  });

  it('saves where it went', async () => {
    const { onSaved, user } = add({ mode: 'add', kind: 'income' });
    await user.type(screen.getByLabelText('Amount'), '500');
    await user.click(goesTo());
    await user.click(await screen.findByRole('option', { name: /^Cash/ }));
    await user.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const [saved] = await db.transactions.toArray();
    expect(saved).toMatchObject({ kind: 'income', destinationId: CASH_METHOD_ID });
    expect(saved?.paymentMethodId).toBeUndefined();
  });

  it('lets go of an account the new person cannot use when Whose? moves, and keeps cash', async () => {
    const { user } = add({ mode: 'add', kind: 'income' }, { profiles: [profile, yossi] });
    await user.click(goesTo());
    await user.click(await screen.findByRole('option', { name: /^Leumi current/ }));
    await user.click(screen.getByRole('radio', { name: 'Yossi' }));
    expect(goesTo()).toHaveAccessibleName(/Not assigned/);

    await user.click(goesTo());
    await user.click(await screen.findByRole('option', { name: /^Cash/ }));
    await user.click(screen.getByRole('radio', { name: 'Dana' }));
    expect(goesTo()).toHaveAccessibleName(/Cash/);
  });

  it('opens a cash expense paid in cash, and cash income going to cash', () => {
    add({ mode: 'add', kind: 'expense', cash: true });
    expect(screen.getByRole('combobox', { name: /Paid with/ })).toHaveAccessibleName(/Cash/);
  });

  it('opens cash income going to cash', () => {
    add({ mode: 'add', kind: 'income', cash: true });
    expect(screen.getByRole('radio', { name: 'Income' })).toBeChecked();
    expect(goesTo()).toHaveAccessibleName(/Cash/);
  });

  it('saves neither a destination nor a method when cash income is switched to an expense', async () => {
    const { onSaved, user } = add({ mode: 'add', kind: 'income', cash: true });
    await user.click(screen.getByRole('radio', { name: 'Expense' }));
    await user.type(screen.getByLabelText('Amount'), '80');
    await user.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const [saved] = await db.transactions.toArray();
    expect(saved).toMatchObject({ kind: 'expense' });
    expect(saved).not.toHaveProperty('destinationId');
    expect(saved?.paymentMethodId).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test --project dom src/features/transaction/use-transaction-sheet.test.tsx src/features/transaction/transaction-sheet.test.tsx`
Expected: FAIL. The URL is `?add=expense` with no `cash=1`, and `Unable to find role="combobox" and name /Goes to/`.

- [ ] **Step 4: Add the copy**

In `src/i18n/locales/en/common.json`, in `tx`, after `"paymentMethodEmpty": …,`:

```json
    "destination": "Goes to",
    "destinationNone": "Not assigned",
    "destinationEmpty": "No bank accounts yet. Add one under Bank accounts.",
```

In `src/i18n/locales/he/common.json`, in `tx`, in the same place:

```json
    "destination": "נכנס ל",
    "destinationNone": "לא שויך",
    "destinationEmpty": "אין עדיין חשבונות בנק. אפשר להוסיף בחשבונות בנק.",
```

- [ ] **Step 5: The cash preset in the URL**

In `src/features/transaction/use-transaction-sheet.ts`:

1. After `const FOCUS = 'focus';` add:

```ts
/** The add form preset to cash: Paid with = Cash for an expense, Goes to = Cash for income. `1`. */
const CASH = 'cash';
```

2. In `SheetTarget`'s `'add'` member, after `readonly kind: Kind;` add:

```ts
      /** From the cash tab: preset to cash, either way round. */
      readonly cash?: true;
```

3. In `TransactionSheetApi`, change `openAdd` to `readonly openAdd: (kind?: Kind, preset?: { readonly cash?: boolean }) => void;`.

4. In the `target` memo's `adding !== null` branch, replace the `return` with:

```ts
const cash = params.get(CASH) === '1' ? ({ cash: true } as const) : {};
return fromId !== null && fromId !== '' && fromAt !== null && isLocalDate(fromAt)
  ? { mode: 'add', kind, from: { transactionId: fromId, at: fromAt } }
  : { mode: 'add', kind, ...cash };
```

5. In `write`, add `updated.delete(CASH);` after `updated.delete(FOCUS);`. In the `next.mode === 'add'` block, after `updated.set(ADD, next.kind);` add `if (next.cash === true) updated.set(CASH, '1');`.

6. Change `openAdd` in the returned object to:

```ts
      openAdd: (kind: Kind = 'expense', preset: { readonly cash?: boolean } = {}) => {
        write({ mode: 'add', kind, ...(preset.cash === true ? { cash: true as const } : {}) });
      },
```

- [ ] **Step 6: The history hook and the field**

Create `src/features/transaction/use-income-history.ts`:

```ts
import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { findCandidates, findOverrides } from '@/db/repos/transactions';
import { DESTINATION_HISTORY_MONTHS } from '@/domain/income-destination';
import { expandOccurrences } from '@/domain/occurrences';
import { addMonthsClamped } from '@/lib/dates';
import { ALL_PROFILES, type Occurrence } from '@/types/domain';
import type { LocalDate } from '@/types/money';

/**
 * Everyone's income over the last six months, as payments: what "Goes to"
 * defaults from (`defaultDestination`). Live, and started with the screen
 * rather than the sheet, so it has long arrived by the time Add is tapped.
 */
export function useIncomeHistory(today: LocalDate): readonly Occurrence[] | undefined {
  return useLiveQuery(async () => {
    const from = addMonthsClamped(today, -DESTINATION_HISTORY_MONTHS);
    const income = (await findCandidates(db, { profileId: ALL_PROFILES, from, to: today })).filter(
      (tx) => tx.kind === 'income',
    );
    const overrides = await findOverrides(
      db,
      income.map((tx) => tx.id),
    );
    return income.flatMap((tx) =>
      expandOccurrences(
        tx,
        overrides.filter((o) => o.transactionId === tx.id),
        from,
        today,
        { today },
      ),
    );
  }, [today]);
}
```

Create `src/features/transaction/destination-field.tsx`:

```tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { destinationsFor } from '@/domain/income-destination';
import { methodDisplayName } from '@/i18n/method-name';
import { CASH_METHOD_ID, type PaymentMethod } from '@/types/domain';

import { PickerField } from './picker-field';

/**
 * "Goes to": where income lands - the person's bank accounts and the joint
 * ones they hold, then cash, then "Not assigned". Never a card. Optional, and
 * listed rather than implied by an empty field, as "Not specified" is for a
 * payment method.
 *
 * A destination that names nothing any more (a deleted account) matches no
 * option, so the field reads "Not assigned" - never an error.
 */
export function DestinationField({
  value,
  onChange,
  profileId,
  methods,
  labelledBy,
}: {
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly profileId: string;
  readonly methods: readonly PaymentMethod[];
  readonly labelledBy: string;
}) {
  const { t } = useTranslation(['common', 'profiles']);

  const options = useMemo(
    () => [
      ...destinationsFor(methods, profileId, value).map((method) => ({
        id: method.id,
        label: methodDisplayName(method, t),
        ...(method.id === CASH_METHOD_ID ? {} : { hint: t('profiles:method.bank_account') }),
      })),
      { id: '', label: t('tx.destinationNone') },
    ],
    [methods, profileId, value, t],
  );

  return (
    <PickerField
      value={value}
      onChange={onChange}
      options={options}
      labelledBy={labelledBy}
      placeholder={t('tx.destinationNone')}
      searchPlaceholder={t('tx.destination')}
      emptyText={t('tx.destinationEmpty')}
    />
  );
}
```

- [ ] **Step 7: Wire the sheet**

In `src/features/transaction/transaction-sheet.tsx`:

1. Imports. Add `import { defaultDestination } from '@/domain/income-destination';` among the `@/domain` imports. Change `import type { Category, PaymentMethod, Profile } from '@/types/domain';` to `import { CASH_METHOD_ID, type Category, type Occurrence, type PaymentMethod, type Profile } from '@/types/domain';`. Add `import { DestinationField } from './destination-field';` after `import { DateField } from './date-field';`.

2. `TransactionSheet` props. Add `incomeHistory,` to the destructured props, and to the props type after `readonly today: LocalDate;`:

```ts
  /** Everyone's recent income (`useIncomeHistory`): where new income goes by default. */
  readonly incomeHistory?: readonly Occurrence[];
```

3. Replace the `adding` memo with:

```ts
const addKind = target.mode === 'add' ? target.kind : 'expense';
const addCash = target.mode === 'add' && target.cash === true;
const adding = useMemo<TxFormValues>(() => {
  const base: TxFormValues = {
    ...defaultFormValues({
      profileId: defaultProfileId,
      currency: baseCurrency,
      today,
      primeRate: prime.primeRate,
    }),
    // Preset by the Add menu's choice; the kind control can still switch it.
    kind: addKind,
    categoryId: categoriesFor(categories, addKind)[0]?.id ?? '',
  };
  // From the cash tab: paid in cash, or going to cash.
  if (addCash) {
    return addKind === 'expense'
      ? { ...base, paymentMethodId: CASH_METHOD_ID }
      : { ...base, destinationId: CASH_METHOD_ID };
  }
  if (addKind !== 'income') return base;
  return {
    ...base,
    destinationId: defaultDestination(incomeHistory ?? [], defaultProfileId, paymentMethods, today),
  };
}, [
  defaultProfileId,
  baseCurrency,
  today,
  categories,
  prime.primeRate,
  addKind,
  addCash,
  incomeHistory,
  paymentMethods,
]);
```

(Delete the old `const addKind = …;` line above it, since this block declares it.)

4. In the `TransactionForm` key, change ``key={`add-${addKind}-${from === undefined ? 'new' : …}`}`` to:

```tsx
              key={`add-${addKind}-${addCash ? 'cash' : 'any'}-${from === undefined ? 'new' : `${from.transactionId}@${from.at}`}`}
```

and pass `incomeHistory={incomeHistory}` to that `<TransactionForm …>` (the add one only; an edit never defaults).

5. `TransactionForm`. Add `incomeHistory,` to its destructured props, and to its props type:

```ts
  /** Adding only: where income goes when the kind is switched to income. */
  readonly incomeHistory?: readonly Occurrence[];
```

After `const profileLabelId = useId();` add `const destinationLabelId = useId();`.

6. In `changeKind`, as the first line after `setValue('kind', next);`:

```ts
// Switched to income on a new row with nowhere chosen yet: where this person's income usually goes.
if (next === 'income' && editing === undefined && (form.getValues('destinationId') ?? '') === '') {
  setValue(
    'destinationId',
    defaultDestination(incomeHistory ?? [], form.getValues('profileId'), paymentMethods, today),
  );
}
```

and add `editing, incomeHistory, paymentMethods, today` to `changeKind`'s `useCallback` dependency array.

7. Directly after the closing `) : null}` of the `{values.kind === 'expense' ? ( … PaymentMethodField … ) : null}` block, add:

```tsx
{
  values.kind === 'income' ? (
    <div className="space-y-1.5">
      <Label id={destinationLabelId}>{t('tx.destination')}</Label>
      <Controller
        control={form.control}
        name="destinationId"
        render={({ field }) => (
          <DestinationField
            value={field.value ?? ''}
            onChange={field.onChange}
            profileId={values.profileId}
            methods={paymentMethods}
            labelledBy={destinationLabelId}
          />
        )}
      />
    </div>
  ) : null;
}
```

8. In the "Whose?" `Segmented`'s `onChange`, after the payment-method block, add:

```ts
// Likewise an account the new person does not hold; cash is everyone's.
const destination = paymentMethods.find((m) => m.id === form.getValues('destinationId'));
if (destination !== undefined && !methodOwnedBy(destination, next)) {
  setValue('destinationId', '');
}
```

- [ ] **Step 8: Pass the history from the feed**

In `src/features/feed/feed-screen.tsx`, add `import { useIncomeHistory } from '../transaction/use-income-history';` after the `use-transaction-sheet` import. After `const balance = useBalance(…);` add `const incomeHistory = useIncomeHistory(today);`, and pass `incomeHistory={incomeHistory}` to `<TransactionSheet …>`.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm test --project dom src/features/transaction src/features/feed`
Expected: PASS, including every existing sheet test.

Run: `pnpm typecheck && pnpm lint && pnpm gates`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/features/transaction/destination-field.tsx src/features/transaction/use-income-history.ts src/features/transaction/use-transaction-sheet.ts src/features/transaction/use-transaction-sheet.test.tsx src/features/transaction/transaction-sheet.tsx src/features/transaction/transaction-sheet.test.tsx src/features/feed/feed-screen.tsx src/i18n/locales/en/common.json src/i18n/locales/he/common.json
git commit -m "Income says where it goes: a Goes to picker where an expense has Paid with, starting where that person's income usually lands" -m "It offers the person's bank accounts and the joint ones they hold, then Cash, then Not assigned, and never a card. Moving Whose? lets go of an account the new person does not hold. The add form can also open preset to cash, paid in cash or going to cash, for the cash tab." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Where income went, shown on the feed row and on its bank account

Spec sections: §3.4 (the feed row), §3.5 (the bank account "Incoming" line), §7 (a deleted account).

**Files:**

- Modify: `src/components/brand-mark.tsx` (a small `xs` size for all three marks)
- Modify: `src/features/feed/feed-rows.tsx:1-17` (imports), `:110-127` (the new `destinationOf`), `:160-196` (the label), `:338-362` (the chip)
- Modify: `src/domain/feed.ts:164-190` (`applyFeedFilters`: the `pm` filter and the search also match the destination)
- Modify: `src/domain/income-destination.ts` (add `nextIncoming`)
- Create: `src/features/bank-accounts/use-incoming.ts`
- Modify: `src/features/bank-accounts/bank-accounts-screen.tsx:88-102` (pass `incoming`), `:136-268` (`AccountPanel`), and add the `IncomingLine` component
- Modify: `src/i18n/locales/{en,he}/common.json` (`feed.into`), `src/i18n/locales/{en,he}/cards.json` (`accounts.incoming`)
- Test: `src/components/brand-mark.test.tsx`, `src/features/feed/feed-rows.test.tsx`, `src/domain/feed.test.ts`, `src/domain/income-destination.test.ts`, `src/features/bank-accounts/bank-accounts-screen.test.tsx`

**Interfaces:**

- Consumes: `Occurrence.destinationId` (Task 1), `CASH_METHOD_ID`, `methodDisplayName`, `BankMark`, `PARAM` and `monthParam` (`src/domain/feed-filters.ts`), `PROJECTION_HORIZON_MONTHS`, `ROUTES`.
- Produces:
  - `BrandMark`, `NeutralMark` and `BankMark` take `size?: 'default' | 'xs'`
  - `nextIncoming(occurrences: readonly Occurrence[], today: LocalDate): ReadonlyMap<string, Occurrence>` in `src/domain/income-destination.ts`. For each destination id, it is the earliest income occurrence strictly after today.
  - `useIncoming(today: LocalDate): { next: ReadonlyMap<string, Occurrence>; categories: ReadonlyMap<string, Category> } | undefined` in `src/features/bank-accounts/use-incoming.ts`
  - `applyFeedFilters`: `paymentMethodIds` now also match `o.destinationId`, and the search also matches the destination's label

**Copy (en / he):** `feed.into` "Into {{name}}" / "נכנס ל־{{name}}". `cards:accounts.incoming` "Incoming" / "הכנסה צפויה".

**Ruling:** an account with no income expected shows no "Incoming" line. This matches how an account with no cards shows no card-bills block. A destination that names a deleted method shows no chip, which is "not assigned" (§1.1). An archived account still shows on its rows (§7).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/brand-mark.test.tsx`:

```tsx
describe('the small mark', () => {
  it('fits a line of small print: a bank under an amount', () => {
    const { container } = render(<BankMark code="10" size="xs" />);
    expect(container.querySelector('[data-slot="brand-mark"]')).toHaveClass('h-4');
    expect(container.querySelector('img')).toHaveClass('h-3');

    const neutral = render(<BankMark code="54" size="xs" />).container.querySelector(
      '[data-slot="neutral-mark"]',
    );
    expect(neutral).toHaveClass('h-4');
    expect(neutral?.querySelector('svg')).toHaveClass('size-3');
  });
});
```

In `src/features/feed/feed-rows.test.tsx`, add `import { CASH_METHOD_ID } from '@/types/domain';`. The `@/types/domain` type import is already there, so turn it into `import { CASH_METHOD_ID, type Category, type Occurrence, type PaymentMethod, type Profile } from '@/types/domain';`. Then append:

```tsx
describe('where income went', () => {
  const at = '2026-01-01T00:00:00.000Z' as PaymentMethod['createdAt'];
  const leumi: PaymentMethod = {
    id: 'leumi',
    profileId: 'p1',
    type: 'bank_account',
    label: 'Leumi current',
    account: { bank: '10', holding: 'personal' },
    isArchived: 0,
    createdAt: at,
    updatedAt: at,
  };
  const cash: PaymentMethod = {
    ...leumi,
    id: CASH_METHOD_ID,
    profileId: '*',
    type: 'cash',
    label: 'Cash',
    account: undefined,
  };
  const income = (destinationId: string | undefined, kind: 'income' | 'expense' = 'income') =>
    occurrence({
      transaction: makeTx({ id: 't1', kind, date: d('2026-09-10'), recurrence: { type: 'one_time' } }),
      ...(destinationId === undefined ? {} : { destinationId }),
    });
  const show = (o: Occurrence) =>
    render(
      <TransactionRow
        occurrence={o}
        context={context({ methods: new Map([leumi, cash].map((m) => [m.id, m])) })}
        position={1}
        setSize={1}
      />,
    );

  it('shows the bank’s mark and the account, and says so', () => {
    show(income('leumi'));
    const chip = screen.getByTestId('row-destination');
    expect(chip).toHaveTextContent('Leumi current');
    expect(chip.querySelector('img[data-brand="bank-10"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /, Into Leumi current$/ })).toBeInTheDocument();
  });

  it('shows the cash icon for cash', () => {
    show(income(CASH_METHOD_ID));
    const chip = screen.getByTestId('row-destination');
    expect(chip).toHaveTextContent('Cash');
    expect(chip.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: /, Into Cash$/ })).toBeInTheDocument();
  });

  it('shows nothing when it is not assigned, names an account that is gone, or is on an expense', () => {
    for (const o of [income(undefined), income('gone'), income('leumi', 'expense')]) {
      const { unmount } = show(o);
      expect(screen.queryByTestId('row-destination')).toBeNull();
      unmount();
    }
  });
});
```

In `src/domain/feed.test.ts`, add `destinationId?: string;` to `OccurrenceSeed`, and in `occ` add `...(seed.destinationId === undefined ? {} : { destinationId: seed.destinationId }),` after the `paymentMethodId` line. Change `lookup.paymentMethodLabel` to `(id) => ({ m1: 'Blue card', leumi: 'Leumi current' })[id]`. Then append inside `describe('applyFeedFilters', …)`:

```ts
it('finds income by the account it went to, with the same filter and search as a card', () => {
  const withIncome = [
    ...items,
    occ({ id: 'pay', date: '2026-09-10', kind: 'income', categoryId: 'cat.salary', destinationId: 'leumi' }),
  ];
  const run = (over: Partial<FeedFilters>) => applyFeedFilters(withIncome, { ...base, ...over }, lookup);
  expect(run({ paymentMethodIds: ['leumi'] }).map((o) => o.seriesId)).toEqual(['pay']);
  expect(run({ query: 'leumi' }).map((o) => o.seriesId)).toEqual(['pay']);
});
```

Append to `src/domain/income-destination.test.ts`:

```ts
describe('the next income into each account', () => {
  it('is the earliest payment after today for each destination', () => {
    const salary = makeTx({
      id: 'salary',
      kind: 'income',
      categoryId: 'cat.salary',
      date: d('2026-08-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10 },
      destinationId: 'Leumi',
    });
    const gift = makeTx({
      id: 'gift',
      kind: 'income',
      categoryId: 'cat.gift',
      date: d('2026-10-20'),
      recurrence: { type: 'one_time' },
      destinationId: CASH_METHOD_ID,
    });
    const today = makeTx({
      id: 'today',
      kind: 'income',
      categoryId: 'cat.gift',
      date: TODAY,
      recurrence: { type: 'one_time' },
      destinationId: 'Hapoalim',
    });
    const all = [salary, gift, today].flatMap((tx) =>
      expandOccurrences(tx, [], TODAY, d('2027-10-31'), { today: TODAY }),
    );

    const next = nextIncoming(all, TODAY);
    expect(next.get('Leumi')?.date).toBe('2026-10-10');
    expect(next.get(CASH_METHOD_ID)?.date).toBe('2026-10-20');
    // Arriving today is not "expected": it is already here.
    expect(next.has('Hapoalim')).toBe(false);
  });
});
```

and add `nextIncoming` to that file's `./income-destination` import.

In `src/features/bank-accounts/bank-accounts-screen.test.tsx`, append:

```tsx
describe('an account’s incoming money', () => {
  afterEach(async () => {
    await db.transactions.bulkDelete(['pay', 'elsewhere']);
  });

  const income = (id: string, destinationId: string) =>
    makeTx({
      id,
      profileId: 'p1',
      kind: 'income',
      categoryId: 'cat.salary',
      date: d('2026-08-10'),
      recurrence: { type: 'monthly', dayOfMonth: 10 },
      destinationId,
      money: { ...MONEY, amountMinor: 1_240_000, baseAmountMinor: 1_240_000 },
    });

  it('shows the next income going into it, and links to the feed of that account’s income that month', async () => {
    await db.transactions.put(income('pay', 'leumi'));
    render();

    const panel = await account();
    const link = await within(panel).findByRole('link', { name: /^Salary · Oct 10/ });
    expect(link.querySelector('[data-value="1240000"]')).not.toBeNull();
    const href = new URL(link.getAttribute('href') ?? '', 'http://x');
    expect(href.pathname).toBe('/');
    expect(href.searchParams.get('pm')).toBe('leumi');
    expect(href.searchParams.get('k')).toBe('income');
    expect(href.searchParams.get('m')).toBe('2026-10');
  });

  it('shows nothing for an account no income is expected into', async () => {
    await db.transactions.put(income('elsewhere', 'pm.cash'));
    render();

    const panel = await account();
    expect(within(panel).queryByText('Incoming')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --project dom src/components/brand-mark.test.tsx src/features/feed/feed-rows.test.tsx src/features/bank-accounts/bank-accounts-screen.test.tsx`
Expected: FAIL. The small mark is still `h-7`, `row-destination` is not found, and the link `Salary · Oct 10` is not found.

Run: `pnpm test --project unit src/domain/feed.test.ts src/domain/income-destination.test.ts`
Expected: FAIL. `paymentMethodIds: ['leumi']` returns `[]`, and `nextIncoming` is not exported.

- [ ] **Step 3: The small mark**

In `src/components/brand-mark.tsx`, replace `const TILE = …;` with:

```ts
/** The tile both marks share, so a row of brands and neutral options lines up. */
const TILE = 'inline-flex max-w-full shrink-0 items-center justify-center';

/** 'xs': in a line of 11px print - the bank under an amount on a feed row. */
const SIZES = {
  default: { tile: 'h-7 rounded-md px-1.5', img: 'h-5 max-w-20', icon: 'size-4', neutral: 'min-w-9' },
  xs: { tile: 'h-4 rounded-sm px-0.5', img: 'h-3 max-w-12', icon: 'size-3', neutral: 'min-w-4' },
} as const;

export type MarkSize = keyof typeof SIZES;
```

Give each of the three components a `size = 'default'` prop (`readonly size?: MarkSize`), and use it:

- `BrandMark` tile: `cn(TILE, SIZES[size].tile, 'bg-white ring-1 ring-black/5 dark:ring-white/10', className)`. Its `<img>` class: `cn(SIZES[size].img, 'w-auto min-w-0 object-contain')`.
- `NeutralMark` tile: `cn(TILE, SIZES[size].tile, SIZES[size].neutral, 'bg-accent text-accent-foreground', className)`. Its icon: `className={SIZES[size].icon}`.
- `BankMark` passes `size={size}` through to whichever it renders.

- [ ] **Step 4: The chip on the feed row**

In `src/features/feed/feed-rows.tsx`:

1. Imports. Add `Banknote` to the `lucide-react` import. Add `import { BankMark } from '@/components/brand-mark';` (alphabetical, before `CategoryChip`). Add `import { methodDisplayName } from '@/i18n/method-name';` after the `category-name` import. Change the domain type import to `import { CASH_METHOD_ID, type Category, type Occurrence, type PaymentMethod, type Profile } from '@/types/domain';`.

2. After `cardOf`, add:

```tsx
/**
 * Where an income went, shown the way an expense shows its card: the bank's
 * mark and the account's name, or the cash icon. Nothing when it is not
 * assigned, or names an account that no longer exists - which is "not
 * assigned", never an error. An archived account still shows: the row keeps
 * its label.
 */
function destinationOf(
  occurrence: Occurrence,
  methods: ReadonlyMap<string, PaymentMethod> | undefined,
  t: TFunction<['common', 'profiles']>,
):
  | { readonly kind: 'cash'; readonly text: string; readonly label: string }
  | { readonly kind: 'bank'; readonly bank: string; readonly text: string; readonly label: string }
  | undefined {
  if (occurrence.transaction.kind !== 'income' || occurrence.destinationId === undefined) return undefined;
  const method = methods?.get(occurrence.destinationId);
  if (method === undefined) return undefined;
  const text = methodDisplayName(method, t);
  if (method.id === CASH_METHOD_ID) return { kind: 'cash', text, label: t('feed.into', { name: text }) };
  if (method.type !== 'bank_account') return undefined;
  return { kind: 'bank', bank: method.account?.bank ?? '', text, label: t('feed.into', { name: text }) };
}
```

3. In `TransactionRow`, after `const { t, i18n } = useTranslation(['common', 'categories']);` add:

```tsx
// The method's own namespace too, for cash's name in the UI language.
const { t: tMethod } = useTranslation(['common', 'profiles']);
```

After `const card = cardOf(occurrence, context.methods, t);` add:

```tsx
const destination = destinationOf(occurrence, context.methods, tMethod);
```

In the `label` array, after `card?.label,` add `destination?.label,`.

4. In the amount column (`data-testid="row-amount"`), after the `{card === undefined ? null : ( … )}` block, add:

```tsx
{
  destination === undefined ? null : (
    <span
      className="inline-flex max-w-24 items-center gap-1 text-[11px] text-muted-foreground max-sm:max-w-14"
      data-testid="row-destination"
      title={destination.text}
    >
      {destination.kind === 'cash' ? (
        <Banknote className="size-3 shrink-0" aria-hidden="true" />
      ) : (
        <BankMark code={destination.bank} size="xs" />
      )}
      <span className="truncate">{destination.text}</span>
    </span>
  );
}
```

- [ ] **Step 5: The feed's filter and search follow the destination**

In `src/domain/feed.ts` `applyFeedFilters`, replace the `if (methods.size > 0) { … }` block with:

```ts
if (methods.size > 0) {
  // Income is found by the account it went to, as an expense is by its card:
  // the bank account's "Incoming" line links here with that account.
  const matches =
    (o.paymentMethodId !== undefined && methods.has(o.paymentMethodId)) ||
    (o.destinationId !== undefined && methods.has(o.destinationId));
  if (!matches) return false;
}
```

and add to the `haystack` array, after the payment-method entry:

```ts
      o.destinationId === undefined ? undefined : lookup.paymentMethodLabel(o.destinationId),
```

Update the comment above it to "Note, category, payment method and where income went - what is visible on the row."

- [ ] **Step 6: The next income into each account**

Append to `src/domain/income-destination.ts`:

```ts
/**
 * The income still to come into each destination: for every account (and
 * cash), its earliest payment strictly after today. Today's has already
 * arrived; it is not "expected".
 */
export function nextIncoming(
  occurrences: readonly Occurrence[],
  today: LocalDate,
): ReadonlyMap<string, Occurrence> {
  const next = new Map<string, Occurrence>();
  for (const o of occurrences) {
    if (o.transaction.kind !== 'income' || o.isSkipped || o.destinationId === undefined) continue;
    if (compareLocal(o.date, today) <= 0) continue;
    const seen = next.get(o.destinationId);
    if (seen === undefined || compareLocal(o.date, seen.date) < 0) next.set(o.destinationId, o);
  }
  return next;
}
```

Create `src/features/bank-accounts/use-incoming.ts`:

```ts
import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { findCandidates, findOverrides } from '@/db/repos/transactions';
import { nextIncoming } from '@/domain/income-destination';
import { expandOccurrences, PROJECTION_HORIZON_MONTHS } from '@/domain/occurrences';
import { addDays, addMonthsClamped, endOfMonth } from '@/lib/dates';
import { ALL_PROFILES, type Category, type Occurrence } from '@/types/domain';
import type { LocalDate } from '@/types/money';

/**
 * The next income expected into each account, as far ahead as the feed
 * projects, and the categories to name it by.
 */
export function useIncoming(
  today: LocalDate,
):
  | { readonly next: ReadonlyMap<string, Occurrence>; readonly categories: ReadonlyMap<string, Category> }
  | undefined {
  return useLiveQuery(async () => {
    const from = addDays(today, 1);
    const to = endOfMonth(addMonthsClamped(today, PROJECTION_HORIZON_MONTHS));
    const income = (await findCandidates(db, { profileId: ALL_PROFILES, from, to })).filter(
      (tx) => tx.kind === 'income',
    );
    const overrides = await findOverrides(
      db,
      income.map((tx) => tx.id),
    );
    const occurrences = income.flatMap((tx) =>
      expandOccurrences(
        tx,
        overrides.filter((o) => o.transactionId === tx.id),
        from,
        to,
        { today },
      ),
    );
    const categories = new Map((await db.categories.toArray()).map((c) => [c.id, c]));
    return { next: nextIncoming(occurrences, today), categories };
  }, [today]);
}
```

- [ ] **Step 7: The "Incoming" line**

In `src/features/bank-accounts/bank-accounts-screen.tsx`:

1. Imports. Add `import { Link } from 'react-router-dom';` and `import { ROUTES } from '@/app/routes';`. `useBaseCurrency` is already imported from `@/app/app-context`. Add `import { monthParam, PARAM } from '@/domain/feed-filters';` and `import { categoryDisplayName } from '@/i18n/category-name';`. Add `import { useIncoming } from './use-incoming';` at the end of the imports. Add `type Category` to the `@/types/domain` import.

2. In `BankAccountsScreen`, after `const data = useCardsData(today, baseCurrency);` add `const incoming = useIncoming(today);`, and pass these to `<AccountPanel …>`:

```tsx
                  incoming={incoming?.next.get(account.id)}
                  categories={incoming?.categories}
```

3. In `AccountPanel`'s props, add:

```ts
  /** The next income expected into this account, if any. */
  readonly incoming: Occurrence | undefined;
  readonly categories: ReadonlyMap<string, Category> | undefined;
```

and destructure them. Directly after the `{cards.length === 0 ? null : ( … )}` card-bills block, add:

```tsx
{
  incoming === undefined ? null : (
    <IncomingLine accountId={account.id} incoming={incoming} categories={categories} />
  );
}
```

4. Add this component after `CardCharge`:

```tsx
/**
 * The next income into the account: "Salary · 10 Nov · 12,400 ₪", linking to
 * the feed of that account's income in that month.
 */
function IncomingLine({
  accountId,
  incoming,
  categories,
}: {
  readonly accountId: string;
  readonly incoming: Occurrence;
  readonly categories: ReadonlyMap<string, Category> | undefined;
}) {
  const { t, i18n } = useTranslation(['cards', 'categories']);
  const baseCurrency = useBaseCurrency();
  const category = categories?.get(incoming.categoryId);
  const name = incoming.note ?? (category === undefined ? '' : categoryDisplayName(category, t));
  const date = formatLocalDate(incoming.date, i18n.language, { day: 'numeric', month: 'short' });
  const params = new URLSearchParams({
    [PARAM.kind]: 'income',
    [PARAM.methods]: accountId,
    [PARAM.month]: monthParam(incoming.date),
  });

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{t('accounts.incoming')}</p>
      <Link
        to={`${ROUTES.feed}?${params.toString()}`}
        className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="min-w-0 truncate">{[name, date].filter((part) => part !== '').join(' · ')}</span>
        <Money
          minor={incoming.money.baseAmountMinor}
          currency={baseCurrency}
          className="shrink-0 font-medium text-income"
        />
      </Link>
    </div>
  );
}
```

- [ ] **Step 8: Add the copy**

`src/i18n/locales/en/common.json`, in `feed`, after `"paidWith": …`: `"into": "Into {{name}}"`. `src/i18n/locales/he/common.json`, same place: `"into": "נכנס ל־{{name}}"`.

`src/i18n/locales/en/cards.json`, in `accounts`, after `"noCharge": …,`: `"incoming": "Incoming",`. `src/i18n/locales/he/cards.json`, same place: `"incoming": "הכנסה צפויה",`.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm test --project dom src/components/brand-mark.test.tsx src/features/feed src/features/bank-accounts`
Expected: PASS.

Run: `pnpm test --project unit src/domain/feed.test.ts src/domain/income-destination.test.ts src/i18n`
Expected: PASS.

Run: `pnpm typecheck && pnpm lint && pnpm gates`
Expected: no errors. If `categoryDisplayName(category, t)` fails to type with the `['cards', 'categories']` translator, take the translator from `useTranslation('categories')` for that one call, as `feed-rows.tsx` does.

- [ ] **Step 10: Commit**

```bash
git add src/components/brand-mark.tsx src/components/brand-mark.test.tsx src/features/feed/feed-rows.tsx src/features/feed/feed-rows.test.tsx src/domain/feed.ts src/domain/feed.test.ts src/domain/income-destination.ts src/domain/income-destination.test.ts src/features/bank-accounts/use-incoming.ts src/features/bank-accounts/bank-accounts-screen.tsx src/features/bank-accounts/bank-accounts-screen.test.tsx src/i18n/locales/en/common.json src/i18n/locales/he/common.json src/i18n/locales/en/cards.json src/i18n/locales/he/cards.json
git commit -m "Income shows where it went: the bank's mark or the cash icon on its row, and the next income on its account" -m "Each bank account gains an Incoming line, the next expected income into it, which opens the feed filtered to that account and month. The feed's payment-method filter and search now find income by the account it went to." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Cash tab: the fourth tab, the screen, the setup card, the figure and the activity

Spec sections: §2.2, §2.3, §3.1, §3.2, §7 (a deleted account's label, the large figure).

This task makes the tab work for viewing and for setting up. A cash payment in the activity list opens the normal edit form. The Add pill, the withdraw/deposit/start sheet and Count my cash come in Task 10, which passes `onOpenMove` to the activity list. Until then, move rows are plain rows and not buttons.

**Files:**

- Modify: `src/app/routes.ts:1-25` (`ROUTES.cash`, `NavKey`, `NAV_ORDER`, the comment)
- Modify: `src/app/app-routes.tsx` (the `/cash` route)
- Modify: `src/app/app-shell.tsx:1-25` (the `Wallet` icon, the comment)
- Create: `src/features/cash/use-cash-data.ts`
- Create: `src/features/cash/cash-figure.tsx`
- Create: `src/features/cash/setup-card.tsx`
- Create: `src/features/cash/activity-list.tsx`
- Create: `src/features/cash/cash-screen.tsx`
- Create: `src/features/cash/cash-screen.test.tsx`
- Modify: `src/i18n/locales/en/common.json`, `src/i18n/locales/he/common.json` (`nav.cash` and the `cash` block)
- Test: `src/app/routes.test.tsx`, `src/app/app-shell.test.tsx`

**Interfaces:**

- Consumes:
  - From Task 3: `cashSummary`, `cashActivity`, `CashSummary` and `CashActivity`.
  - From Task 5: `loadCashInput` and `addCashMove`.
  - From Task 7: `useIncomeHistory`, and `TransactionSheet`'s `incomeHistory` prop.
  - Existing: `useFeedLookups` and `FeedLookups` (`src/features/feed/use-feed-data.ts`), `offerUndo` (`src/features/feed/use-row-actions.ts`), `ProfileSwitcher`, `ScreenPanel`, `ScreenTitle`, `PanelSheet`, `Money`, `CategoryChip`, `PersonAvatar`, `AmountInput`.
- Produces:
  - `ROUTES.cash = '/cash'`, `NavKey` includes `'cash'`, `NAV_ORDER = ['feed', 'chart', 'cards', 'cash']`
  - `useCashData(profileId: string, today: LocalDate): { summary: CashSummary; activity: readonly CashActivity[] } | undefined`
  - `CashScreen` (route component). The test ids `cash-amount`, `cash-counted`, `cash-expected` and `cash-setup` are used by Task 11's e2e.
  - `CashActivityList` props: `{ activity; lookups: FeedLookups; showPerson: boolean; currency: Currency; today: LocalDate; onOpenOccurrence: (o: Occurrence) => void; onOpenMove?: (m: CashMove) => void }`
  - `CashSetupCard` props: `{ person: Profile; named: boolean; currency: Currency; onSave: (amountMinor: Minor) => Promise<void> }`

**Copy (en / he)**, under a new top-level `cash` key in `common.json`. Spec strings are verbatim; the rest is new copy in the app's voice.

- `nav.cash`: "Cash" / "מזומן"
- `cash.title`: "Cash" / "קופת מזומן"
- `cash.onHand`: "Cash on hand" / "מזומן ביד"
- `cash.counted`: "Counted {{date}}" / "נספר ב-{{date}}"
- `cash.negative`: "More spent in cash than you have. Count your cash?" / "יותר הוצאות במזומן ממה שיש. לספור את המזומן?"
- `cash.expected`: "Expected this month: <in/> in, <out/> out" / "צפוי החודש: <in/> נכנס, <out/> יוצא"
- `cash.setupTitle`: "How much cash do you have now?" / "כמה מזומן יש לך עכשיו?"
- `cash.setupBody`: "Count what is in the wallet. Cash that comes in or goes out from today is counted from here." / "כדאי לספור מה יש בארנק. מזומן שנכנס או יוצא מהיום והלאה נספר מכאן."
- `cash.setupSaved`: "Cash on hand saved" / "המזומן נשמר"
- `cash.activity`: "Activity" / "תנועות במזומן"
- `cash.activityEmpty`: "Nothing yet. Withdrawals, deposits and cash payments show up here." / "עדיין אין כלום. משיכות, הפקדות ותשלומים במזומן יופיעו כאן."
- `cash.recount`: "Recount" / "ספירה"
- `cash.move.start`: "Cash when you started" / "מזומן בהתחלה"
- `cash.move.withdraw`: "Withdrawn from the ATM" / "משיכה מכספומט"
- `cash.move.deposit`: "Deposited to the bank" / "הפקדה לבנק"
- `cash.someAccount`: "A bank account" / "חשבון בנק"

- [ ] **Step 1: Write the failing tests**

In `src/app/routes.test.tsx`, replace the `'are the feed, the chart and the cards, and nothing else'` test with:

```tsx
it('are the feed, the chart, the cards and cash, and nothing else', () => {
  expect(NAV_ORDER).toEqual(['feed', 'chart', 'cards', 'cash']);
  expect(NAV_ORDER).not.toContain('household');
});

it('mounts Cash at its own address', () => {
  expect(ROUTES.cash).toBe('/cash');
  expect(appRoutes.find((r) => r.path === ROUTES.cash)?.element).toBeDefined();
});
```

In `src/app/app-shell.test.tsx`, change the first test's name to `'renders one primary navigation landmark with its four tabs'` and its last expectation to `.toEqual(['Feed', 'Chart', 'Cards', 'Cash'])`.

Create `src/features/cash/cash-screen.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsProvider } from '@/app/settings-provider';
import { db } from '@/db/db';
import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { d, makeTx, MONEY } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';
import { ALL_PROFILES, CASH_METHOD_ID, type CashMove, type Profile, type Transaction } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

vi.mock('@/app/account', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAccount: () => ({ status: 'signed_out' }),
}));

const { CashScreen } = await import('./cash-screen');

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;

const render = (activeProfileId = 'p1') =>
  renderWithProviders(
    <SettingsProvider
      value={{
        ...DEFAULT_SETTINGS,
        activeProfileId,
        defaultCurrency: 'USD',
        updatedAt: instantFromMs(Date.parse(NOW)),
      }}
    >
      <CashScreen />
    </SettingsProvider>,
    { route: '/cash' },
  );

const person = (id: string, name: string, color: string): Profile => ({
  id,
  name,
  color,
  openingBalanceMinor: 0,
  openingBalanceCurrency: 'USD',
  openingBalanceDate: d('2026-01-01'),
  createdAt: NOW,
  updatedAt: NOW,
});

const move = (
  over: Partial<CashMove> & Pick<CashMove, 'id' | 'kind' | 'amountMinor' | 'date'>,
): CashMove => ({
  profileId: 'p1',
  isDeleted: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const cashRow = (id: string, date: string, minor: number, over: Partial<Transaction> = {}) =>
  makeTx({
    id,
    date: d(date),
    recurrence: { type: 'one_time' },
    paymentMethodId: CASH_METHOD_ID,
    money: { ...MONEY, amountMinor: minor, baseAmountMinor: minor },
    ...over,
  });

const amount = () => screen.findByTestId('cash-amount');

beforeAll(async () => {
  await initTestI18n('en');
});

beforeEach(async () => {
  await Promise.all([
    db.cashMoves.clear(),
    db.transactions.clear(),
    db.overrides.clear(),
    db.profiles.clear(),
  ]);
  await db.profiles.bulkPut([person('p1', 'Dana', '#16794a'), person('p2', 'Yossi', '#0369a1')]);
});

describe('setting up', () => {
  it('asks someone who has not set up how much cash they have, and starts from it', async () => {
    const user = userEvent.setup();
    render();

    const card = await screen.findByTestId('cash-setup');
    expect(within(card).getByRole('heading', { name: 'How much cash do you have now?' })).toBeInTheDocument();
    expect(screen.queryByTestId('cash-amount')).toBeNull();

    await user.type(within(card).getByLabelText('Amount'), '500');
    await user.click(within(card).getByRole('button', { name: 'Save' }));

    expect((await amount()).querySelector('[data-value]')).toHaveAttribute('data-value', '50000');
    expect(await db.cashMoves.toArray()).toMatchObject([
      { profileId: 'p1', kind: 'start', amountMinor: 50_000, date: '2026-09-15' },
    ]);
    expect(screen.queryByTestId('cash-setup')).toBeNull();
  });

  it('shows, for everyone, the pot of those who set up and asks those who have not', async () => {
    await db.cashMoves.put(move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }));
    render(ALL_PROFILES);

    expect((await amount()).querySelector('[data-value]')).toHaveAttribute('data-value', '50000');
    const cards = await screen.findAllByTestId('cash-setup');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('Yossi');
  });
});

describe('the figure', () => {
  it('shows the cash on hand, when it was counted, and says so when it is below zero', async () => {
    await db.cashMoves.put(move({ id: 's1', kind: 'start', amountMinor: 10_000, date: d('2026-09-01') }));
    await db.transactions.put(cashRow('big', '2026-09-10', 30_000));
    render();

    expect((await amount()).querySelector('[data-value]')).toHaveAttribute('data-value', '-20000');
    expect(screen.getByTestId('cash-counted')).toHaveTextContent('Counted Sep 1, 2026');
    expect(screen.getByText('More spent in cash than you have. Count your cash?')).toBeInTheDocument();
  });

  it('shows what is still to come this month, apart from what is on hand', async () => {
    await db.cashMoves.put(move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }));
    await db.transactions.bulkPut([
      cashRow('gift', '2026-09-20', 10_000, {
        kind: 'income',
        categoryId: 'cat.gift',
        paymentMethodId: undefined,
        destinationId: CASH_METHOD_ID,
      }),
      cashRow('market', '2026-09-25', 4_000),
    ]);
    render();

    expect((await amount()).querySelector('[data-value]')).toHaveAttribute('data-value', '50000');
    const expected = await screen.findByTestId('cash-expected');
    expect(expected.querySelector('[data-value="10000"]')).not.toBeNull();
    expect(expected.querySelector('[data-value="4000"]')).not.toBeNull();
  });
});

describe('the activity', () => {
  beforeEach(async () => {
    await db.cashMoves.bulkPut([
      move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }),
      move({ id: 'w1', kind: 'withdraw', amountMinor: 20_000, date: d('2026-09-05'), accountId: 'pm.gone' }),
    ]);
    await db.transactions.put(
      cashRow('rc', '2026-09-10', 1_000, { categoryId: 'cat.cash_missing', cashCount: true }),
    );
  });

  it('lists what moved the cash, newest first, and tags a recount', async () => {
    render();
    const list = await screen.findByRole('region', { name: 'Activity' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Recount'),
      expect.stringContaining('Withdrawn from the ATM'),
      expect.stringContaining('Cash when you started'),
    ]);
    // The account it came from is gone: the label falls back, the money stays.
    expect(rows[1]).toHaveTextContent('A bank account');
  });

  it('opens a cash payment in the edit form, as the feed does', async () => {
    const user = userEvent.setup();
    render();
    const list = await screen.findByRole('region', { name: 'Activity' });
    await user.click(within(list).getByRole('button', { name: /Recount/ }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit transaction' })).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --project dom src/app/routes.test.tsx src/app/app-shell.test.tsx src/features/cash/cash-screen.test.tsx`
Expected: FAIL. `NAV_ORDER` is `['feed','chart','cards']`, the shell renders three tabs, and `./cash-screen` does not resolve.

- [ ] **Step 3: The fourth tab**

In `src/app/routes.ts`, add `cash: '/cash',` to `ROUTES` after `cards: '/cards',`, make `NavKey` `Extract<RouteKey, 'feed' | 'chart' | 'cards' | 'cash'>`, and replace the `NAV_ORDER` doc comment and value with:

```ts
/**
 * Order is the tab-bar / rail order, and the primary tab order.
 *
 * Four: the places the money is - the feed, the chart, the cards it moves
 * through, which decide WHEN it leaves the account, and the cash in the
 * wallet, which is the one part of the balance no bank shows. Cash earned its
 * slot the way the others did: it is a place you check, not an action you
 * take. Settings left the tabs for the account menu at the top of every
 * screen; account linking followed it, as a page in Settings - set up once,
 * not visited daily. Every screen the app grows does not earn a tab: a bar
 * that scrolls is a bar nobody reads.
 */
export const NAV_ORDER: readonly NavKey[] = ['feed', 'chart', 'cards', 'cash'];
```

In `src/app/app-routes.tsx`, add `import { CashScreen } from '@/features/cash/cash-screen';` (alphabetical, after `CardsScreen`), and after the `ROUTES.cards` route:

```tsx
  { path: ROUTES.cash, element: <CashScreen /> },
```

In `src/app/app-shell.tsx`, change the lucide import to `import { BarChart3, CreditCard, Receipt, Wallet } from 'lucide-react';`, add `cash: Wallet,` to `ICONS`, and in the `PrimaryNav` doc comment change "and three items are not crowded" to "and four items are not crowded, down to a 320px phone in Hebrew".

- [ ] **Step 4: Add the copy**

In `src/i18n/locales/en/common.json`, add `"cash": "Cash"` to `nav`, and a top-level block after `"addMenu"`:

```json
  "cash": {
    "title": "Cash",
    "onHand": "Cash on hand",
    "counted": "Counted {{date}}",
    "negative": "More spent in cash than you have. Count your cash?",
    "expected": "Expected this month: <in/> in, <out/> out",
    "setupTitle": "How much cash do you have now?",
    "setupBody": "Count what is in the wallet. Cash that comes in or goes out from today is counted from here.",
    "setupSaved": "Cash on hand saved",
    "activity": "Activity",
    "activityEmpty": "Nothing yet. Withdrawals, deposits and cash payments show up here.",
    "recount": "Recount",
    "move": {
      "start": "Cash when you started",
      "withdraw": "Withdrawn from the ATM",
      "deposit": "Deposited to the bank"
    },
    "someAccount": "A bank account"
  },
```

In `src/i18n/locales/he/common.json`, add `"cash": "מזומן"` to `nav`, and in the same place:

```json
  "cash": {
    "title": "קופת מזומן",
    "onHand": "מזומן ביד",
    "counted": "נספר ב-{{date}}",
    "negative": "יותר הוצאות במזומן ממה שיש. לספור את המזומן?",
    "expected": "צפוי החודש: <in/> נכנס, <out/> יוצא",
    "setupTitle": "כמה מזומן יש לך עכשיו?",
    "setupBody": "כדאי לספור מה יש בארנק. מזומן שנכנס או יוצא מהיום והלאה נספר מכאן.",
    "setupSaved": "המזומן נשמר",
    "activity": "תנועות במזומן",
    "activityEmpty": "עדיין אין כלום. משיכות, הפקדות ותשלומים במזומן יופיעו כאן.",
    "recount": "ספירה",
    "move": {
      "start": "מזומן בהתחלה",
      "withdraw": "משיכה מכספומט",
      "deposit": "הפקדה לבנק"
    },
    "someAccount": "חשבון בנק"
  },
```

- [ ] **Step 5: The data hook**

Create `src/features/cash/use-cash-data.ts`:

```ts
import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/db';
import { loadCashInput } from '@/db/repos/cash-moves';
import { cashActivity, cashSummary, type CashActivity, type CashSummary } from '@/domain/cash';
import type { LocalDate } from '@/types/money';

export type CashData = {
  readonly summary: CashSummary;
  readonly activity: readonly CashActivity[];
};

/** The cash figure and its activity for one person, or everyone - live. */
export function useCashData(profileId: string, today: LocalDate): CashData | undefined {
  return useLiveQuery(async () => {
    const input = await loadCashInput(db, { profileId, today });
    return { summary: cashSummary(input), activity: cashActivity(input) };
  }, [profileId, today]);
}
```

- [ ] **Step 6: The figure**

Create `src/features/cash/cash-figure.tsx`:

```tsx
import { useTranslation } from 'react-i18next';

import { Money } from '@/components/money';
import { PersonAvatar } from '@/components/person-avatar';
import type { CashSummary } from '@/domain/cash';
import { formatLocalDate } from '@/lib/dates';
import type { Profile } from '@/types/domain';
import type { Currency } from '@/types/money';

/**
 * The cash on hand, on the panel, in the balance's own figure: the serif,
 * the same size and the same step down below 360px, so a seven-figure amount
 * still fits a 320px phone in Hebrew. With more than one person, each one's
 * own figure under it: the pot always splits back into its people.
 */
export function CashFigure({
  summary,
  currency,
  profiles,
}: {
  readonly summary: CashSummary;
  readonly currency: Currency;
  readonly profiles: ReadonlyMap<string, Profile>;
}) {
  const { t, i18n } = useTranslation();

  return (
    <div>
      <p className="text-sm text-brand-deep-foreground/80">{t('cash.onHand')}</p>
      <p
        className="mt-1 font-display text-[2.75rem] leading-none font-bold tracking-tight max-[359px]:text-[2.25rem]"
        data-testid="cash-amount"
      >
        <Money minor={summary.onHandMinor} currency={currency} />
      </p>
      {summary.countedOn === undefined ? null : (
        <p className="mt-2 text-sm text-brand-deep-foreground/80" data-testid="cash-counted">
          {t('cash.counted', {
            date: formatLocalDate(summary.countedOn, i18n.language, { dateStyle: 'medium' }),
          })}
        </p>
      )}
      {summary.onHandMinor < 0 ? (
        // Red on the deep blue fails contrast; the words carry it.
        <p className="mt-2 text-sm font-medium text-brand-deep-foreground">{t('cash.negative')}</p>
      ) : null}
      {summary.people.length < 2 ? null : (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="cash-people">
          {summary.people.map((p) => {
            const profile = profiles.get(p.profileId);
            return profile === undefined ? null : (
              <li key={p.profileId} className="flex items-center gap-1.5">
                <PersonAvatar person={profile} size="sm" className="size-6 text-[10px]" />
                <span className="sr-only">{profile.name}</span>
                <Money minor={p.onHandMinor} currency={currency} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 7: The setup card**

Create `src/features/cash/setup-card.tsx`:

```tsx
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AmountInput } from '@/components/amount-input';
import { PersonAvatar } from '@/components/person-avatar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { Profile } from '@/types/domain';
import type { Currency, Minor } from '@/types/money';

/**
 * A person's first visit: how much cash they have now. Saving writes their
 * `start` move for today; cash rows from before it never count. Each person
 * sets up on their own, so in the "all" view there is one card per person
 * who has not, with their name.
 */
export function CashSetupCard({
  person,
  named,
  currency,
  onSave,
}: {
  readonly person: Profile;
  /** In the "all" view: say whose cash this asks about. */
  readonly named: boolean;
  readonly currency: Currency;
  readonly onSave: (amountMinor: Minor) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState<Minor | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const inputId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="space-y-3 rounded-2xl border border-border p-4"
      data-testid="cash-setup"
    >
      {named ? (
        <p className="flex items-center gap-2 text-sm font-medium">
          <PersonAvatar person={person} size="sm" />
          {person.name}
        </p>
      ) : null}
      <h2 id={titleId} className="text-base font-semibold">
        {t('cash.setupTitle')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('cash.setupBody')}</p>
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (amount === undefined || saving) return;
          setSaving(true);
          void onSave(amount).finally(() => {
            setSaving(false);
          });
        }}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={inputId}>{t('tx.amount')}</Label>
          <AmountInput id={inputId} currency={currency} value={amount} onChange={setAmount} />
        </div>
        <Button type="submit" className="h-11 px-5" disabled={amount === undefined || saving}>
          {t('action.save')}
        </Button>
      </form>
    </section>
  );
}
```

- [ ] **Step 8: The activity list**

Create `src/features/cash/activity-list.tsx`:

```tsx
import { cn } from 'cn';
import { BanknoteArrowDown, BanknoteArrowUp, Wallet, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { CategoryChip } from '@/components/category-icon';
import { Money } from '@/components/money';
import { PersonAvatar } from '@/components/person-avatar';
import type { CashActivity } from '@/domain/cash';
import type { FeedLookups } from '@/features/feed/use-feed-data';
import { categoryDisplayName } from '@/i18n/category-name';
import { formatLocalDate } from '@/lib/dates';
import type { CashMove, Occurrence } from '@/types/domain';
import type { Currency, LocalDate } from '@/types/money';

const MOVE_ICON: Readonly<Record<string, LucideIcon>> = {
  start: Wallet,
  withdraw: BanknoteArrowDown,
  deposit: BanknoteArrowUp,
};

/** Consecutive entries of one day together, keeping their order (newest first). */
function byDay(activity: readonly CashActivity[]): [LocalDate, CashActivity[]][] {
  const days: [LocalDate, CashActivity[]][] = [];
  for (const entry of activity) {
    const last = days.at(-1);
    if (last !== undefined && last[0] === entry.date) last[1].push(entry);
    else days.push([entry.date, [entry]]);
  }
  return days;
}

/**
 * What moved the cash, newest first and grouped by day, in the feed's row
 * style: cash income and spending (real transactions, opened in the edit
 * form), and withdrawals, deposits and the starting amount (opened in their
 * own form, when `onOpenMove` is given). A recount's row says so.
 */
export function CashActivityList({
  activity,
  lookups,
  showPerson,
  currency,
  today,
  onOpenOccurrence,
  onOpenMove,
}: {
  readonly activity: readonly CashActivity[];
  readonly lookups: FeedLookups;
  /** The "all" view: each row shows whose it is. */
  readonly showPerson: boolean;
  readonly currency: Currency;
  readonly today: LocalDate;
  readonly onOpenOccurrence: (occurrence: Occurrence) => void;
  readonly onOpenMove?: (move: CashMove) => void;
}) {
  const { t, i18n } = useTranslation();
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h2 id={headingId} className="text-base font-semibold">
        {t('cash.activity')}
      </h2>
      {activity.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('cash.activityEmpty')}
        </p>
      ) : (
        byDay(activity).map(([date, entries]) => (
          <div key={date}>
            <p className="px-1 py-2 text-sm font-medium text-muted-foreground">
              {date === today
                ? t('feed.today')
                : formatLocalDate(date, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {entries.map((entry) => (
                <li key={entry.key}>
                  <ActivityRow
                    entry={entry}
                    lookups={lookups}
                    showPerson={showPerson}
                    currency={currency}
                    onOpenOccurrence={onOpenOccurrence}
                    {...(onOpenMove === undefined ? {} : { onOpenMove })}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function ActivityRow({
  entry,
  lookups,
  showPerson,
  currency,
  onOpenOccurrence,
  onOpenMove,
}: {
  readonly entry: CashActivity;
  readonly lookups: FeedLookups;
  readonly showPerson: boolean;
  readonly currency: Currency;
  readonly onOpenOccurrence: (occurrence: Occurrence) => void;
  readonly onOpenMove?: (move: CashMove) => void;
}) {
  const { t } = useTranslation(['common', 'categories']);
  const profile = lookups.profiles.find((p) => p.id === entry.profileId);

  let icon: ReactNode;
  let title: string;
  const details: string[] = [];
  if (entry.type === 'occurrence') {
    const category = lookups.categories.get(entry.occurrence.categoryId);
    const categoryName =
      category === undefined ? entry.occurrence.categoryId : categoryDisplayName(category, t);
    icon = <CategoryChip icon={category?.icon ?? 'Circle'} />;
    title = entry.occurrence.note ?? categoryName;
    if (entry.occurrence.note !== undefined) details.push(categoryName);
  } else {
    const Icon = MOVE_ICON[entry.move.kind] ?? Wallet;
    icon = (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </span>
    );
    title =
      entry.move.kind === 'withdraw'
        ? t('cash.move.withdraw')
        : entry.move.kind === 'deposit'
          ? t('cash.move.deposit')
          : t('cash.move.start');
    const accountId = entry.move.accountId;
    if (accountId !== undefined) {
      // An account deleted since keeps the move's money; only its name is gone.
      details.push(lookups.paymentMethods.get(accountId)?.label ?? t('cash.someAccount'));
    }
    if (entry.move.note !== undefined) details.push(entry.move.note);
  }

  const content = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {details.length === 0 ? null : <span className="min-w-0 truncate">{details.join(' · ')}</span>}
          {entry.type === 'occurrence' && entry.recount ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px]">
              {t('cash.recount')}
            </span>
          ) : null}
        </span>
      </span>
      {showPerson && profile !== undefined ? <PersonAvatar person={profile} size="sm" /> : null}
      <Money
        minor={entry.signedMinor}
        currency={currency}
        signMode="always"
        className={cn(
          'shrink-0 text-sm font-semibold',
          entry.signedMinor > 0 ? 'text-income' : 'text-foreground',
        )}
      />
    </>
  );

  const open =
    entry.type === 'occurrence'
      ? () => {
          onOpenOccurrence(entry.occurrence);
        }
      : onOpenMove === undefined
        ? undefined
        : () => {
            onOpenMove(entry.move);
          };
  const row = 'flex min-h-14 w-full items-center gap-3 px-3 py-2 text-start';

  return open === undefined ? (
    <div className={row}>{content}</div>
  ) : (
    <button
      type="button"
      onClick={open}
      className={cn(
        row,
        'rounded-2xl transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
      )}
    >
      {content}
    </button>
  );
}
```

- [ ] **Step 9: The screen**

Create `src/features/cash/cash-screen.tsx`:

```tsx
import { useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useSettings, useToday } from '@/app/app-context';
import { ScreenPanel, ScreenTitle } from '@/app/screen-panel';
import { PanelSheet } from '@/components/brand-panel';
import { Money } from '@/components/money';
import { db } from '@/db/db';
import { addCashMove } from '@/db/repos/cash-moves';
import { writeSettings } from '@/db/repos/settings';
import type { CashSummary } from '@/domain/cash';
import { ProfileSwitcher } from '@/features/feed/profile-switcher';
import { useFeedLookups } from '@/features/feed/use-feed-data';
import { offerUndo } from '@/features/feed/use-row-actions';
import { TransactionSheet } from '@/features/transaction/transaction-sheet';
import { useIncomeHistory } from '@/features/transaction/use-income-history';
import { useTransactionSheet } from '@/features/transaction/use-transaction-sheet';
import { systemClock } from '@/lib/clock';
import { newId } from '@/lib/id';
import { ALL_PROFILES, type Profile } from '@/types/domain';
import type { Currency, Minor } from '@/types/money';

import { CashActivityList } from './activity-list';
import { CashFigure } from './cash-figure';
import { CashSetupCard } from './setup-card';
import { useCashData } from './use-cash-data';

/**
 * The cash tab: how much of the balance is cash right now.
 *
 * The balance on the feed stays "all my money"; this is the part of it in the
 * wallet. Whose cash follows the same choice as the feed's.
 */
export function CashScreen() {
  const { t } = useTranslation();
  const today = useToday();
  const settings = useSettings();
  const whose = settings.activeProfileId;
  const currency = settings.defaultCurrency;
  const lookups = useFeedLookups();
  const data = useCashData(whose, today);
  const sheet = useTransactionSheet();
  const incomeHistory = useIncomeHistory(today);

  const profiles = useMemo(() => lookups?.profiles ?? [], [lookups]);
  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const pending = (data?.summary.notSetUp ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is Profile => p !== undefined);
  const setUp = data !== undefined && data.summary.people.length > 0;
  const everyone = whose === ALL_PROFILES;

  const start = async (profileId: string, amountMinor: Minor): Promise<void> => {
    try {
      const undoable = await addCashMove(
        db,
        newId(),
        { profileId, kind: 'start', amountMinor, date: today },
        systemClock.nowIso(),
      );
      offerUndo(t('cash.setupSaved'), undoable, t);
    } catch {
      toast.error(t('tx.toastFailed'));
    }
  };

  return (
    <section className="mx-auto max-w-2xl pb-24 lg:px-4 lg:pb-8">
      <ScreenPanel>
        <ScreenTitle>{t('cash.title')}</ScreenTitle>
        {lookups === undefined ? null : (
          <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="cash-pills">
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
      </ScreenPanel>

      <PanelSheet className="space-y-5 px-4 pt-6">
        {pending.map((person) => (
          <CashSetupCard
            key={person.id}
            person={person}
            named={everyone}
            currency={currency}
            onSave={(amountMinor) => start(person.id, amountMinor)}
          />
        ))}
        {setUp && lookups !== undefined ? (
          <>
            <ExpectedLine expected={data.summary.expected} currency={currency} />
            <CashActivityList
              activity={data.activity}
              lookups={lookups}
              showPerson={everyone && profiles.length > 1}
              currency={currency}
              today={today}
              onOpenOccurrence={(occurrence) => {
                sheet.openEdit(occurrence);
              }}
            />
          </>
        ) : null}
      </PanelSheet>

      {lookups === undefined ? null : (
        <TransactionSheet
          target={sheet.target}
          onOpenChange={sheet.setOpen}
          profiles={profiles}
          categories={[...lookups.categories.values()]}
          paymentMethods={[...lookups.paymentMethods.values()]}
          activeProfileId={whose}
          baseCurrency={currency}
          today={today}
          incomeHistory={incomeHistory}
          onSaved={() => {
            sheet.close();
          }}
        />
      )}
    </section>
  );
}

/** Cash still to come this month: never part of what is on hand. */
function ExpectedLine({
  expected,
  currency,
}: {
  readonly expected: CashSummary['expected'];
  readonly currency: Currency;
}) {
  return (
    <p className="text-sm text-muted-foreground" data-testid="cash-expected">
      <Trans
        i18nKey="cash.expected"
        components={{
          in: <Money minor={expected.inMinor} currency={currency} className="font-medium text-income" />,
          out: (
            <Money minor={expected.outMinor} currency={currency} className="font-medium text-foreground" />
          ),
        }}
      />
    </p>
  );
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `pnpm test --project dom src/app src/features/cash`
Expected: PASS.

Run: `pnpm test --project unit src/i18n`
Expected: PASS. The locale parity test covers the new `cash` block, including the `<in/>` and `<out/>` tags.

Run: `pnpm typecheck && pnpm lint && pnpm gates`
Expected: no errors. If `react-refresh/only-export-components` warns on `activity-list.tsx` because of `MOVE_ICON`, keep the constant unexported, as written.

- [ ] **Step 11: Commit**

```bash
git add src/app/routes.ts src/app/routes.test.tsx src/app/app-routes.tsx src/app/app-shell.tsx src/app/app-shell.test.tsx src/features/cash src/i18n/locales/en/common.json src/i18n/locales/he/common.json
git commit -m "A fourth tab, Cash: how much of the balance is in the wallet, who has counted it, and what moved it" -m "Each person sets up once with the cash they have now, and the all view asks whoever has not. The panel shows the figure in the balance's serif, when it was last counted, and a hint when more was spent in cash than was there. The sheet shows what is still to come this month and the activity, newest first, where a cash payment opens the edit form as in the feed." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The Cash tab's Add menu: withdraw, deposit, Count my cash, and cash expense and income

Spec sections: §3.3 (the menu, the withdraw/deposit sheet, Count my cash, Undo), §7 (editing or deleting the start).

**Files:**

- Modify: `src/features/feed/add-menu.tsx:80-99` (export `AddItem`)
- Create: `src/features/cash/cash-add-menu.tsx`
- Create: `src/features/cash/move-sheet.tsx`
- Create: `src/features/cash/count-sheet.tsx`
- Modify: `src/features/cash/cash-screen.tsx` (Task 9's file: the menu first in the DOM, the two sheets, and `onOpenMove`)
- Modify: `src/i18n/locales/en/common.json`, `src/i18n/locales/he/common.json` (the `cash` block: `menu`, `sheet`, and the count strings)
- Create: `src/features/cash/cash-sheets.test.tsx`

**Interfaces:**

- Consumes:
  - From Task 5: `addCashMove`, `editCashMove`, `deleteCashMove`, `recordCount` and `CashMoveDraft`.
  - From Task 6: `destinationsFor`.
  - From Task 7: `TransactionSheetApi.openAdd(kind, { cash: true })`.
  - From Task 9: `CashActivityList`'s `onOpenMove`, `CashScreen`, and `useCashData`.
  - Existing: `AddButton`, `DropdownMenu*`, `Sheet*`, `DateField`, `PickerField`, `Segmented`, `AmountInput`, `offerUndo`, and `methodOwnedBy`.
- Produces:
  - `AddItem` exported from `src/features/feed/add-menu.tsx` (unchanged behaviour)
  - `CashAddMenu({ disabled, canMove, onMove(kind: 'withdraw' | 'deposit'), onCount(), onCashExpense(), onCashIncome() })`
  - `type MoveTarget = { mode: 'add'; kind: 'withdraw' | 'deposit' } | { mode: 'edit'; move: CashMove }`
  - `CashMoveSheet({ target: MoveTarget | undefined; onOpenChange; people: readonly Profile[]; defaultProfileId; methods: readonly PaymentMethod[]; currency; today; onDone(message: string, undoable: UndoableAction) })`
  - `CountSheet({ open; onOpenChange; people: readonly { profile: Profile; onHandMinor: Minor }[]; defaultProfileId; currency; today; onDone(message, undoable) })`

**Rulings:**

- **Withdraw, Deposit and Count my cash are disabled until someone in view has set up.** Their hint says so. Before a start move, a move would count for nothing.
- **The person in the sheets is chosen from the people who have set up.** It defaults to the person in view, or else the signed-in person, or else the first.
- **Count my cash always measures against the chosen person's own figure.** The live difference uses the figure on screen, and `recordCount` recomputes it from the database at save (Review Focus 5).

**Copy (en / he)**, added inside the `cash` block from Task 9:

- `cash.menu.withdraw` "Withdraw from ATM" / "משיכה מכספומט". `withdrawHint` "From the bank into cash" / "מהבנק למזומן"
- `cash.menu.deposit` "Deposit to the bank" / "הפקדה לבנק". `depositHint` "From cash into the bank" / "מהמזומן לבנק"
- `cash.menu.count` "Count my cash" / "ספירת מזומן". `countHint` "Make the figure match the wallet" / "שהסכום יתאים לארנק"
- `cash.menu.expense` "Cash expense" / "הוצאה במזומן". `expenseHint` "Paid in cash" / "שולם במזומן"
- `cash.menu.income` "Cash income" / "הכנסה במזומן". `incomeHint` "Received in cash" / "התקבל במזומן"
- `cash.menu.setUpFirst` "Say how much cash you have first" / "קודם לרשום כמה מזומן יש"
- `cash.sheet.withdrawBody` "Money from the bank into the wallet. The balance does not change." / "כסף מהבנק לארנק. היתרה לא משתנה."
- `cash.sheet.depositBody` "Money from the wallet into the bank. The balance does not change." / "כסף מהארנק לבנק. היתרה לא משתנה."
- `cash.sheet.startBody` "The cash you had when you started. Correct it if it was not right." / "המזומן שהיה כשהתחלת. אפשר לתקן אם הסכום לא היה נכון."
- `cash.account` "Bank account" / "חשבון בנק". `cash.note` "Note" / "הערה". `cash.saved` "Saved" / "נשמר"
- `cash.countBody` "Count what is in the wallet. Any difference is recorded as cash found or missing." / "כדאי לספור מה יש בארנק. הפרש יירשם כמזומן שנמצא או חסר."
- `cash.countQuestion` "How much is in the wallet now?" / "כמה כסף יש בארנק עכשיו?"
- `cash.countRecorded` "Recorded: <amount/>" / "רשום: <amount/>"
- `cash.countMore` "<amount/> more than recorded" / "<amount/> יותר ממה שנרשם"
- `cash.countMissing` "<amount/> missing" / "חסרים <amount/>"
- `cash.countMatches` "Matches what is recorded" / "תואם למה שנרשם"
- `cash.countFound` "Recorded as cash found" / "נרשם כמזומן שנמצא"
- `cash.countLost` "Recorded as cash missing" / "נרשם כמזומן חסר"
- `cash.countMatched` "Counted. It matches." / "נספר. הסכום תואם."

- [ ] **Step 1: Write the failing tests**

Create `src/features/cash/cash-sheets.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsProvider } from '@/app/settings-provider';
import { db } from '@/db/db';
import { DEFAULT_SETTINGS } from '@/db/repos/settings';
import { d } from '@/domain/test-factories';
import { instantFromMs } from '@/lib/dates';
import { initTestI18n, renderWithProviders } from '@/test/render';
import { ALL_PROFILES, type CashMove, type PaymentMethod, type Profile } from '@/types/domain';
import type { IsoInstant } from '@/types/money';

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal<object>()), toast: toastMock }));
vi.mock('@/app/account', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAccount: () => ({ status: 'signed_out' }),
}));

const { CashScreen } = await import('./cash-screen');

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;

const render = (activeProfileId = 'p1') =>
  renderWithProviders(
    <SettingsProvider
      value={{
        ...DEFAULT_SETTINGS,
        activeProfileId,
        defaultCurrency: 'USD',
        updatedAt: instantFromMs(Date.parse(NOW)),
      }}
    >
      <CashScreen />
    </SettingsProvider>,
    { route: '/cash' },
  );

const person = (id: string, name: string, color: string): Profile => ({
  id,
  name,
  color,
  openingBalanceMinor: 0,
  openingBalanceCurrency: 'USD',
  openingBalanceDate: d('2026-01-01'),
  createdAt: NOW,
  updatedAt: NOW,
});
const move = (
  over: Partial<CashMove> & Pick<CashMove, 'id' | 'kind' | 'amountMinor' | 'date'>,
): CashMove => ({
  profileId: 'p1',
  isDeleted: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const leumi: PaymentMethod = {
  id: 'pm.leumi',
  profileId: 'p1',
  type: 'bank_account',
  label: 'Leumi current',
  account: { bank: '10', holding: 'personal' },
  isArchived: 0,
  createdAt: NOW,
  updatedAt: NOW,
};
const amount = () => screen.findByTestId('cash-amount');
const withdrawals = async () =>
  (await db.cashMoves.toArray()).filter((m) => m.kind === 'withdraw' && m.isDeleted === 0);

async function openMenuItem(user: ReturnType<typeof userEvent.setup>, name: RegExp): Promise<void> {
  await user.click(await screen.findByTestId('add-button'));
  await user.click(await screen.findByRole('menuitem', { name }));
}

beforeAll(async () => {
  await initTestI18n('en');
  // The pickers' list (cmdk) measures itself; jsdom has nothing to measure with.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});

beforeEach(async () => {
  toastMock.mockClear();
  await Promise.all([
    db.cashMoves.clear(),
    db.transactions.clear(),
    db.overrides.clear(),
    db.profiles.clear(),
  ]);
  await db.paymentMethods.delete('pm.leumi');
  await db.profiles.bulkPut([person('p1', 'Dana', '#16794a'), person('p2', 'Yossi', '#0369a1')]);
});

describe('the cash Add menu', () => {
  it('offers withdraw, deposit and count, a divider, then cash expense and income', async () => {
    const user = userEvent.setup();
    await db.cashMoves.put(move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }));
    render();
    await user.click(await screen.findByTestId('add-button'));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'Withdraw from ATMFrom the bank into cash',
      'Deposit to the bankFrom cash into the bank',
      'Count my cashMake the figure match the wallet',
      'Cash expensePaid in cash',
      'Cash incomeReceived in cash',
    ]);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('holds the cash moves back until someone has said how much they have', async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByTestId('add-button'));
    const items = await screen.findAllByRole('menuitem');
    for (const item of items.slice(0, 3)) {
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveTextContent('Say how much cash you have first');
    }
    expect(items[3]).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('opens the normal form, paid in cash, for a cash expense', async () => {
    const user = userEvent.setup();
    render();
    await openMenuItem(user, /^Cash expense/);
    const dialog = await screen.findByRole('dialog', { name: 'New transaction' });
    expect(within(dialog).getByRole('combobox', { name: /Paid with/ })).toHaveAccessibleName(/Cash/);
  });
});

describe('a withdrawal', () => {
  beforeEach(async () => {
    await db.cashMoves.put(move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }));
    await db.paymentMethods.put(leumi);
  });

  it('is saved with its account, moves the cash and not the balance, and can be undone', async () => {
    const user = userEvent.setup();
    render();
    await openMenuItem(user, /^Withdraw from ATM/);
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw from ATM' });
    const save = within(dialog).getByRole('button', { name: 'Save' });
    const field = within(dialog).getByLabelText('Amount');

    expect(save).toBeDisabled();
    await user.type(field, '0');
    expect(save).toBeDisabled();
    await user.clear(field);
    await user.type(field, '200');
    await user.click(within(dialog).getByRole('combobox', { name: /Bank account/ }));
    await user.click(await screen.findByRole('option', { name: /Leumi current/ }));
    await user.click(save);

    await waitFor(async () => {
      expect(await withdrawals()).toMatchObject([
        { profileId: 'p1', amountMinor: 20_000, accountId: 'pm.leumi', date: '2026-09-15' },
      ]);
    });
    await waitFor(async () => {
      expect((await amount()).querySelector('[data-value]')).toHaveAttribute('data-value', '70000');
    });
    expect(await db.transactions.count()).toBe(0);

    const [message, options] = toastMock.mock.calls.at(-1) as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe('Saved');
    expect(options.action.label).toBe('Undo');
    options.action.onClick();
    await waitFor(async () => {
      expect(await withdrawals()).toEqual([]);
    });
  });

  it('is changed and deleted from its row in the activity', async () => {
    const user = userEvent.setup();
    await db.cashMoves.put(move({ id: 'w1', kind: 'withdraw', amountMinor: 20_000, date: d('2026-09-05') }));
    render();
    const list = await screen.findByRole('region', { name: 'Activity' });
    await user.click(within(list).getByRole('button', { name: /Withdrawn from the ATM/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw from ATM' });
    const field = within(dialog).getByLabelText('Amount');
    expect(field).toHaveValue('200.00');
    await user.clear(field);
    await user.type(field, '250');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      expect((await db.cashMoves.get('w1'))?.amountMinor).toBe(25_000);
    });

    await user.click(
      within(await screen.findByRole('region', { name: 'Activity' })).getByRole('button', {
        name: /Withdrawn from the ATM/,
      }),
    );
    const again = await screen.findByRole('dialog', { name: 'Withdraw from ATM' });
    await user.click(within(again).getByRole('button', { name: 'Delete' }));
    await waitFor(async () => {
      expect((await db.cashMoves.get('w1'))?.isDeleted).toBe(1);
    });
  });

  it('returns a person to setting up when their starting amount is deleted', async () => {
    const user = userEvent.setup();
    render();
    const list = await screen.findByRole('region', { name: 'Activity' });
    await user.click(within(list).getByRole('button', { name: /Cash when you started/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Cash when you started' });
    expect(within(dialog).queryByRole('combobox', { name: /Bank account/ })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByTestId('cash-setup')).toBeInTheDocument();
  });
});

describe('Count my cash', () => {
  it('shows the difference against the chosen person’s own cash, and records it for them', async () => {
    const user = userEvent.setup();
    await db.cashMoves.bulkPut([
      move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }),
      move({ id: 's2', profileId: 'p2', kind: 'start', amountMinor: 30_000, date: d('2026-09-01') }),
    ]);
    render(ALL_PROFILES);
    await openMenuItem(user, /^Count my cash/);
    const dialog = await screen.findByRole('dialog', { name: 'Count my cash' });

    await user.click(within(dialog).getByRole('radio', { name: 'Yossi' }));
    expect(
      within(dialog)
        .getByText(/^Recorded:/)
        .querySelector('[data-value="30000"]'),
    ).not.toBeNull();
    await user.type(within(dialog).getByLabelText('How much is in the wallet now?'), '280');
    const difference = within(dialog).getByTestId('count-difference');
    expect(difference).toHaveTextContent(/missing$/);
    expect(difference.querySelector('[data-value="2000"]')).not.toBeNull();

    await user.clear(within(dialog).getByLabelText('How much is in the wallet now?'));
    await user.type(within(dialog).getByLabelText('How much is in the wallet now?'), '312');
    expect(difference).toHaveTextContent(/more than recorded$/);

    await user.clear(within(dialog).getByLabelText('How much is in the wallet now?'));
    await user.type(within(dialog).getByLabelText('How much is in the wallet now?'), '280');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      expect(await db.transactions.toArray()).toMatchObject([
        { profileId: 'p2', kind: 'expense', categoryId: 'cat.cash_missing', cashCount: true },
      ]);
    });
    expect(toastMock).toHaveBeenLastCalledWith('Recorded as cash missing', expect.anything());
  });

  it('records a count that matched, which moves only "Counted"', async () => {
    const user = userEvent.setup();
    await db.cashMoves.put(move({ id: 's1', kind: 'start', amountMinor: 50_000, date: d('2026-09-01') }));
    render();
    await openMenuItem(user, /^Count my cash/);
    const dialog = await screen.findByRole('dialog', { name: 'Count my cash' });
    await user.type(within(dialog).getByLabelText('How much is in the wallet now?'), '500');
    expect(within(dialog).getByTestId('count-difference')).toHaveTextContent('Matches what is recorded');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect(await screen.findByTestId('cash-counted')).toHaveTextContent('Counted Sep 15, 2026');
    });
    expect(await db.transactions.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --project dom src/features/cash/cash-sheets.test.tsx`
Expected: FAIL with `Unable to find an element by: [data-testid="add-button"]`.

- [ ] **Step 3: Add the copy**

In `src/i18n/locales/en/common.json`, inside the `cash` block, after `"someAccount": …`:

```json
    "menu": {
      "withdraw": "Withdraw from ATM",
      "withdrawHint": "From the bank into cash",
      "deposit": "Deposit to the bank",
      "depositHint": "From cash into the bank",
      "count": "Count my cash",
      "countHint": "Make the figure match the wallet",
      "expense": "Cash expense",
      "expenseHint": "Paid in cash",
      "income": "Cash income",
      "incomeHint": "Received in cash",
      "setUpFirst": "Say how much cash you have first"
    },
    "sheet": {
      "withdrawBody": "Money from the bank into the wallet. The balance does not change.",
      "depositBody": "Money from the wallet into the bank. The balance does not change.",
      "startBody": "The cash you had when you started. Correct it if it was not right."
    },
    "account": "Bank account",
    "note": "Note",
    "saved": "Saved",
    "countBody": "Count what is in the wallet. Any difference is recorded as cash found or missing.",
    "countQuestion": "How much is in the wallet now?",
    "countRecorded": "Recorded: <amount/>",
    "countMore": "<amount/> more than recorded",
    "countMissing": "<amount/> missing",
    "countMatches": "Matches what is recorded",
    "countFound": "Recorded as cash found",
    "countLost": "Recorded as cash missing",
    "countMatched": "Counted. It matches."
```

In `src/i18n/locales/he/common.json`, in the same place:

```json
    "menu": {
      "withdraw": "משיכה מכספומט",
      "withdrawHint": "מהבנק למזומן",
      "deposit": "הפקדה לבנק",
      "depositHint": "מהמזומן לבנק",
      "count": "ספירת מזומן",
      "countHint": "שהסכום יתאים לארנק",
      "expense": "הוצאה במזומן",
      "expenseHint": "שולם במזומן",
      "income": "הכנסה במזומן",
      "incomeHint": "התקבל במזומן",
      "setUpFirst": "קודם לרשום כמה מזומן יש"
    },
    "sheet": {
      "withdrawBody": "כסף מהבנק לארנק. היתרה לא משתנה.",
      "depositBody": "כסף מהארנק לבנק. היתרה לא משתנה.",
      "startBody": "המזומן שהיה כשהתחלת. אפשר לתקן אם הסכום לא היה נכון."
    },
    "account": "חשבון בנק",
    "note": "הערה",
    "saved": "נשמר",
    "countBody": "כדאי לספור מה יש בארנק. הפרש יירשם כמזומן שנמצא או חסר.",
    "countQuestion": "כמה כסף יש בארנק עכשיו?",
    "countRecorded": "רשום: <amount/>",
    "countMore": "<amount/> יותר ממה שנרשם",
    "countMissing": "חסרים <amount/>",
    "countMatches": "תואם למה שנרשם",
    "countFound": "נרשם כמזומן שנמצא",
    "countLost": "נרשם כמזומן חסר",
    "countMatched": "נספר. הסכום תואם."
```

- [ ] **Step 4: Share the menu item**

In `src/features/feed/add-menu.tsx`, change `function AddItem(` to `export function AddItem(`, and add a doc comment above it: `/** One item of an Add menu: an icon on the sapphire tint, a title and a hint. Also the cash tab's. */`.

- [ ] **Step 5: The cash Add menu**

Create `src/features/cash/cash-add-menu.tsx`:

```tsx
import { BanknoteArrowDown, BanknoteArrowUp, HandCoins, ShoppingBag, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AddButton } from '@/components/add-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddItem } from '@/features/feed/add-menu';

/**
 * The cash tab's own Add pill. The moves that never touch the balance come
 * first - out of the ATM, into the bank, and a count - then, past a divider,
 * the ordinary form preset to cash. The moves wait until someone in view has
 * said how much cash they have: before that there is nothing for them to move.
 */
export function CashAddMenu({
  disabled,
  canMove,
  onMove,
  onCount,
  onCashExpense,
  onCashIncome,
}: {
  readonly disabled: boolean;
  readonly canMove: boolean;
  readonly onMove: (kind: 'withdraw' | 'deposit') => void;
  readonly onCount: () => void;
  readonly onCashExpense: () => void;
  readonly onCashIncome: () => void;
}) {
  const { t } = useTranslation();
  const blocked = t('cash.menu.setUpFirst');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<AddButton />} disabled={disabled} />
      <DropdownMenuContent
        side="top"
        align="center"
        sideOffset={10}
        className="w-72 p-1.5"
        data-testid="cash-add-menu"
      >
        <AddItem
          icon={BanknoteArrowDown}
          title={t('cash.menu.withdraw')}
          hint={canMove ? t('cash.menu.withdrawHint') : blocked}
          disabled={!canMove}
          onClick={() => {
            onMove('withdraw');
          }}
        />
        <AddItem
          icon={BanknoteArrowUp}
          title={t('cash.menu.deposit')}
          hint={canMove ? t('cash.menu.depositHint') : blocked}
          disabled={!canMove}
          onClick={() => {
            onMove('deposit');
          }}
        />
        <AddItem
          icon={Wallet}
          title={t('cash.menu.count')}
          hint={canMove ? t('cash.menu.countHint') : blocked}
          disabled={!canMove}
          onClick={onCount}
        />
        <DropdownMenuSeparator />
        <AddItem
          icon={ShoppingBag}
          title={t('cash.menu.expense')}
          hint={t('cash.menu.expenseHint')}
          onClick={onCashExpense}
        />
        <AddItem
          icon={HandCoins}
          title={t('cash.menu.income')}
          hint={t('cash.menu.incomeHint')}
          onClick={onCashIncome}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 6: The withdraw, deposit and start sheet**

Create `src/features/cash/move-sheet.tsx`:

```tsx
import { Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { AmountInput } from '@/components/amount-input';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { db } from '@/db/db';
import type { UndoableAction } from '@/db/occurrence-actions';
import { addCashMove, deleteCashMove, editCashMove, type CashMoveDraft } from '@/db/repos/cash-moves';
import { destinationsFor } from '@/domain/income-destination';
import { methodOwnedBy } from '@/domain/tx-options';
import { DateField } from '@/features/transaction/date-field';
import { PickerField } from '@/features/transaction/picker-field';
import { systemClock } from '@/lib/clock';
import { newId } from '@/lib/id';
import { CASH_METHOD_ID, type CashMove, type PaymentMethod, type Profile } from '@/types/domain';
import type { Currency, LocalDate, Minor } from '@/types/money';

export type MoveTarget =
  | { readonly mode: 'add'; readonly kind: 'withdraw' | 'deposit' }
  | { readonly mode: 'edit'; readonly move: CashMove };

type EditableKind = 'start' | 'withdraw' | 'deposit';

type SheetProps = {
  readonly people: readonly Profile[];
  readonly defaultProfileId: string;
  readonly methods: readonly PaymentMethod[];
  readonly currency: Currency;
  readonly today: LocalDate;
  readonly onDone: (message: string, undoable: UndoableAction) => void;
};

function kindOf(target: MoveTarget): EditableKind {
  if (target.mode === 'add') return target.kind;
  return target.move.kind === 'deposit' || target.move.kind === 'start' ? target.move.kind : 'withdraw';
}

/**
 * A withdrawal, a deposit, or the amount someone started with: its amount,
 * day, person, the bank account (a label only; not for the start) and a note.
 * Save, edit and delete each come back with Undo.
 */
export function CashMoveSheet({
  target,
  onOpenChange,
  ...props
}: SheetProps & {
  readonly target: MoveTarget | undefined;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const kind = target === undefined ? 'withdraw' : kindOf(target);
  const title =
    kind === 'start'
      ? t('cash.move.start')
      : kind === 'deposit'
        ? t('cash.menu.deposit')
        : t('cash.menu.withdraw');
  const body =
    kind === 'start'
      ? t('cash.sheet.startBody')
      : kind === 'deposit'
        ? t('cash.sheet.depositBody')
        : t('cash.sheet.withdrawBody');

  return (
    <Sheet open={target !== undefined} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto" aria-labelledby={titleId}>
        <SheetHeader>
          <SheetTitle id={titleId}>{title}</SheetTitle>
          <SheetDescription>{body}</SheetDescription>
        </SheetHeader>
        {target === undefined ? null : (
          <MoveForm
            key={target.mode === 'edit' ? target.move.id : `new-${target.kind}`}
            editing={target.mode === 'edit' ? target.move : undefined}
            kind={kind}
            {...props}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function MoveForm({
  editing,
  kind,
  people,
  defaultProfileId,
  methods,
  currency,
  today,
  onDone,
}: SheetProps & { readonly editing: CashMove | undefined; readonly kind: EditableKind }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState<Minor | undefined>(editing?.amountMinor);
  const [date, setDate] = useState<LocalDate>(editing?.date ?? today);
  const [profileId, setProfileId] = useState(editing?.profileId ?? defaultProfileId);
  const [accountId, setAccountId] = useState(editing?.accountId ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const amountId = useId();
  const dateId = useId();
  const personId = useId();
  const accountLabelId = useId();
  const noteId = useId();

  // The person's accounts and the joint ones they hold; the one already on the move stays.
  const accounts = destinationsFor(methods, profileId, accountId).filter((m) => m.id !== CASH_METHOD_ID);
  const valid =
    amount !== undefined && Number.isSafeInteger(amount) && (kind === 'start' ? amount >= 0 : amount > 0);

  const draft = (): CashMoveDraft => ({
    profileId,
    kind,
    amountMinor: amount ?? 0,
    date,
    ...(kind === 'start' || accountId === '' ? {} : { accountId }),
    ...(note.trim() === '' ? {} : { note }),
  });

  const run = async (write: () => Promise<UndoableAction>, message: string): Promise<void> => {
    setBusy(true);
    try {
      onDone(message, await write());
    } catch {
      // One Dexie transaction: a failure changed nothing.
      toast.error(t('tx.toastFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4 px-4 pb-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || busy) return;
        const now = systemClock.nowIso();
        void run(
          () =>
            editing === undefined
              ? addCashMove(db, newId(), draft(), now)
              : editCashMove(db, editing.id, draft(), now),
          t('cash.saved'),
        );
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={amountId}>{t('tx.amount')}</Label>
        <AmountInput id={amountId} currency={currency} value={amount} onChange={setAmount} />
      </div>

      <div className="space-y-1.5">
        <Label id={dateId}>{t('tx.date')}</Label>
        <DateField value={date} onChange={setDate} labelledBy={dateId} />
      </div>

      {people.length > 1 ? (
        <div className="space-y-1.5">
          <Label id={personId}>{t('tx.profile')}</Label>
          <Segmented
            value={profileId}
            labelledBy={personId}
            options={people.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(next) => {
              setProfileId(next);
              // An account the new person does not hold is let go, as the payment picker does.
              const account = methods.find((m) => m.id === accountId);
              if (account !== undefined && !methodOwnedBy(account, next)) setAccountId('');
            }}
          />
        </div>
      ) : null}

      {kind === 'start' ? null : (
        <div className="space-y-1.5">
          <Label id={accountLabelId}>{t('cash.account')}</Label>
          <PickerField
            value={accountId}
            onChange={setAccountId}
            options={[
              ...accounts.map((m) => ({ id: m.id, label: m.label })),
              { id: '', label: t('tx.paymentMethodNone') },
            ]}
            labelledBy={accountLabelId}
            placeholder={t('tx.paymentMethodNone')}
            searchPlaceholder={t('cash.account')}
            emptyText={t('tx.destinationEmpty')}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={noteId}>{t('cash.note')}</Label>
        <Input
          id={noteId}
          className="h-11"
          value={note}
          autoComplete="off"
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="h-11 flex-1" disabled={!valid || busy}>
          {t('action.save')}
        </Button>
        {editing === undefined ? null : (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={busy}
            onClick={() => {
              void run(() => deleteCashMove(db, editing.id, systemClock.nowIso()), t('tx.toastDeleted'));
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {t('action.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 7: Count my cash**

Create `src/features/cash/count-sheet.tsx`:

```tsx
import { useId, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { AmountInput } from '@/components/amount-input';
import { Money } from '@/components/money';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { db } from '@/db/db';
import type { UndoableAction } from '@/db/occurrence-actions';
import { recordCount } from '@/db/repos/cash-moves';
import { systemClock } from '@/lib/clock';
import { newId } from '@/lib/id';
import type { Profile } from '@/types/domain';
import type { Currency, LocalDate, Minor } from '@/types/money';

type CountProps = {
  readonly people: readonly { readonly profile: Profile; readonly onHandMinor: Minor }[];
  readonly defaultProfileId: string;
  readonly currency: Currency;
  readonly today: LocalDate;
  readonly onDone: (message: string, undoable: UndoableAction) => void;
};

/**
 * "Count my cash": what is in the wallet now, against what is recorded for
 * that person - the difference said as it is typed, and saved as cash found,
 * cash missing, or a count that matched.
 */
export function CountSheet({
  open,
  onOpenChange,
  ...props
}: CountProps & { readonly open: boolean; readonly onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto" aria-labelledby={titleId}>
        <SheetHeader>
          <SheetTitle id={titleId}>{t('cash.menu.count')}</SheetTitle>
          <SheetDescription>{t('cash.countBody')}</SheetDescription>
        </SheetHeader>
        {open ? <CountForm {...props} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function CountForm({ people, defaultProfileId, currency, today, onDone }: CountProps) {
  const { t } = useTranslation();
  const [profileId, setProfileId] = useState(defaultProfileId);
  const [counted, setCounted] = useState<Minor | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const personId = useId();
  const amountId = useId();

  // This person's own figure, never the pot's.
  const recorded = people.find((p) => p.profile.id === profileId)?.onHandMinor ?? 0;
  const difference = counted === undefined ? undefined : counted - recorded;

  return (
    <form
      className="space-y-4 px-4 pb-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (counted === undefined || busy) return;
        setBusy(true);
        void recordCount(db, {
          profileId,
          countedMinor: counted,
          currency,
          today,
          now: systemClock.nowIso(),
          newId,
        })
          .then(({ undoable, outcome }) => {
            onDone(
              t(
                outcome === 'found'
                  ? 'cash.countFound'
                  : outcome === 'missing'
                    ? 'cash.countLost'
                    : 'cash.countMatched',
              ),
              undoable,
            );
          })
          .catch(() => {
            toast.error(t('tx.toastFailed'));
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      {people.length > 1 ? (
        <div className="space-y-1.5">
          <Label id={personId}>{t('tx.profile')}</Label>
          <Segmented
            value={profileId}
            labelledBy={personId}
            options={people.map((p) => ({ value: p.profile.id, label: p.profile.name }))}
            onChange={setProfileId}
          />
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">
        <Trans
          i18nKey="cash.countRecorded"
          components={{ amount: <Money minor={recorded} currency={currency} /> }}
        />
      </p>

      <div className="space-y-1.5">
        <Label htmlFor={amountId}>{t('cash.countQuestion')}</Label>
        <AmountInput id={amountId} currency={currency} value={counted} onChange={setCounted} />
      </div>

      <p className="min-h-5 text-sm font-medium" aria-live="polite" data-testid="count-difference">
        {difference === undefined ? null : difference === 0 ? (
          t('cash.countMatches')
        ) : (
          <Trans
            i18nKey={difference > 0 ? 'cash.countMore' : 'cash.countMissing'}
            components={{ amount: <Money minor={Math.abs(difference)} currency={currency} /> }}
          />
        )}
      </p>

      <Button type="submit" className="h-11 w-full" disabled={counted === undefined || busy}>
        {t('action.save')}
      </Button>
    </form>
  );
}
```

- [ ] **Step 8: Wire it into the screen**

In `src/features/cash/cash-screen.tsx`:

1. Imports: change `import { useMemo } from 'react';` to `import { useMemo, useState } from 'react';`. Add `import { useAccount } from '@/app/account';`. Add `import type { CashMove } from '@/types/domain';` by merging it into the existing `@/types/domain` import (`ALL_PROFILES, type CashMove, type Profile`). Add, among the local imports: `import { CashAddMenu } from './cash-add-menu';`, `import { CountSheet } from './count-sheet';`, and `import { CashMoveSheet, type MoveTarget } from './move-sheet';`.

2. In `CashScreen`, after `const everyone = whose === ALL_PROFILES;`, add:

```tsx
const account = useAccount();
const me = account.status === 'signed_in' ? account.user.id : undefined;
const [moveTarget, setMoveTarget] = useState<MoveTarget | undefined>(undefined);
const [counting, setCounting] = useState(false);

// Whose cash a sheet starts on: the person in view, else this account's own, else the first who set up.
const figures = (data?.summary.people ?? []).flatMap((p) => {
  const profile = byId.get(p.profileId);
  return profile === undefined ? [] : [{ profile, onHandMinor: p.onHandMinor }];
});
const ids = figures.map((p) => p.profile.id);
const defaultPerson = ids.includes(whose)
  ? whose
  : me !== undefined && ids.includes(me)
    ? me
    : (ids[0] ?? '');
const done = (message: string, undoable: Parameters<typeof offerUndo>[1]): void => {
  offerUndo(message, undoable, t);
};
```

3. Make `CashAddMenu` the first child of the outer `<section>`, before `<ScreenPanel>`. It is first in the DOM for the tab order, as the feed's Add pill is (README, "The Add pill is first in the DOM"):

```tsx
<CashAddMenu
  disabled={profiles.length === 0}
  canMove={figures.length > 0}
  onMove={(kind) => {
    setMoveTarget({ mode: 'add', kind });
  }}
  onCount={() => {
    setCounting(true);
  }}
  onCashExpense={() => {
    sheet.openAdd('expense', { cash: true });
  }}
  onCashIncome={() => {
    sheet.openAdd('income', { cash: true });
  }}
/>
```

4. Pass `onOpenMove` to `CashActivityList`:

```tsx
              onOpenMove={(move: CashMove) => {
                setMoveTarget({ mode: 'edit', move });
              }}
```

5. After the `TransactionSheet` block, before `</section>`, add:

```tsx
{
  lookups === undefined ? null : (
    <CashMoveSheet
      target={moveTarget}
      onOpenChange={(open) => {
        if (!open) setMoveTarget(undefined);
      }}
      people={figures.map((p) => p.profile)}
      defaultProfileId={defaultPerson}
      methods={[...lookups.paymentMethods.values()]}
      currency={currency}
      today={today}
      onDone={(message, undoable) => {
        // Closed first, so the toast's Undo is not under the sheet.
        setMoveTarget(undefined);
        done(message, undoable);
      }}
    />
  );
}

<CountSheet
  open={counting}
  onOpenChange={setCounting}
  people={figures}
  defaultProfileId={defaultPerson}
  currency={currency}
  today={today}
  onDone={(message, undoable) => {
    setCounting(false);
    done(message, undoable);
  }}
/>;
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm test --project dom src/features/cash src/features/feed/add-menu.test.tsx`
Expected: PASS.

Run: `pnpm test --project unit src/i18n`
Expected: PASS. The tag parity check covers `<amount/>` in both languages.

Run: `pnpm typecheck && pnpm lint && pnpm gates`
Expected: no errors. `gate:money` accepts `Math.abs` and the subtraction of two integers. If lint flags the nested ternary in `CountForm`'s `onDone` call, move the outcome→message mapping into a small `const MESSAGE = { found: 'cash.countFound', missing: 'cash.countLost', matched: 'cash.countMatched' } as const;` and call `t(MESSAGE[outcome])`.

- [ ] **Step 10: Commit**

```bash
git add src/features/feed/add-menu.tsx src/features/cash src/i18n/locales/en/common.json src/i18n/locales/he/common.json
git commit -m "The cash tab's Add pill: withdraw, deposit and count, then a cash expense or income in the usual form" -m "A withdrawal or deposit has an amount, day, person, the bank account as a label, and a note; saving, changing and deleting one each offer Undo, and deleting the starting amount sends that person back to setting up. Count my cash says the difference against that person's own cash as it is typed, and records it as cash found or missing, or as a count that matched." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: End-to-end gates in English and Hebrew, accessibility, and the README

Spec sections: §8 (E2E), §7 (the large figure at 320px in Hebrew), §3.1 (four tabs).

**Files:**

- Create: `e2e/15-cash.spec.ts`
- Modify: `e2e/00-shell.spec.ts:11` (`ROUTES` gains `/cash`), `:117-123` (four tabs)
- Modify: `e2e/07-a11y.spec.ts:36-46` (`BLOCKING` gains the cash screen in both languages)
- Modify: `README.md` ("Design decisions": a new entry after **"Account linking is a page in Settings, not a tab."**, and that entry's "keeps three tabs")

**Interfaces:**

- Consumes everything above through the UI only.
  - The test ids `cash-amount`, `cash-setup`, `count-difference`, `add-button` and `balance-amount`.
  - The dialog names "Withdraw from ATM" / "משיכה מכספומט", "Count my cash" / "ספירת מזומן", and "New transaction" / "תנועה חדשה".
  - The region "Activity" / "תנועות במזומן".
  - The nav labels "Cash" / "מזומן" and "Feed" / "תנועות".
- Produces: no code interfaces.

**Notes for the executor:**

- The e2e build has no account (`build:local`, port 4173), so there is no sync and the first run makes one person. Under `en-US` the base currency is USD; under `he-IL` it is ILS. Both have two decimals, so "500" is `data-value="50000"` in both.
- `reducedMotion: 'reduce'` is on, so the balance's count-up lands at once.
- The shared sheet's close button (`[data-slot="sheet-close"]`, `size-7`) is existing chrome on every sheet, not a control this feature adds. The 44px check leaves it out on purpose.

- [ ] **Step 1: Update the shell spec to four tabs**

In `e2e/00-shell.spec.ts`, change line 11 to:

```ts
const ROUTES = ['/', '/chart', '/cards', '/cash', '/settings'] as const;
```

and replace the `'has three tabs: account linking is a page in Settings, not a tab'` test with:

```ts
test('has four tabs: account linking is a page in Settings, not a tab', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: /primary|ניווט/i });
  // The rail's mark is a link home too, shown only on a wide screen.
  const tabs = nav.getByRole('link').filter({ hasNotText: 'Bookandry' });
  await expect(tabs).toHaveCount(4);
  await expect(nav.getByRole('link', { name: /household|account linking|משק|קישור/i })).toHaveCount(0);
});
```

- [ ] **Step 2: Add the cash screen to the blocking accessibility scan**

In `e2e/07-a11y.spec.ts`, add to `BLOCKING`:

```ts
  { route: '/cash', name: 'cash', lang: 'he', theme: 'dark' },
  { route: '/cash', name: 'cash', lang: 'en', theme: 'light' },
```

- [ ] **Step 3: Write the cash spec**

Create `e2e/15-cash.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { completeFirstRun } from './support/seed';

/**
 * The cash tab, end to end: cash is PART of the balance. Setting up and
 * withdrawing move only the cash; paying in cash moves both; a recount that
 * finds money missing moves both by the difference.
 */

const COPY = {
  en: {
    cash: 'Cash',
    feed: 'Feed',
    setup: 'How much cash do you have now?',
    amount: 'Amount',
    save: 'Save',
    withdraw: /^Withdraw from ATM/,
    withdrawTitle: 'Withdraw from ATM',
    expense: /^Cash expense/,
    newTransaction: 'New transaction',
    count: /^Count my cash/,
    countTitle: 'Count my cash',
    wallet: 'How much is in the wallet now?',
    missing: /missing$/,
    activity: 'Activity',
    recount: 'Recount',
  },
  he: {
    cash: 'מזומן',
    feed: 'תנועות',
    setup: 'כמה מזומן יש לך עכשיו?',
    amount: 'סכום',
    save: 'שמירה',
    withdraw: /^משיכה מכספומט/,
    withdrawTitle: 'משיכה מכספומט',
    expense: /^הוצאה במזומן/,
    newTransaction: 'תנועה חדשה',
    count: /^ספירת מזומן/,
    countTitle: 'ספירת מזומן',
    wallet: 'כמה כסף יש בארנק עכשיו?',
    missing: /^חסרים/,
    activity: 'תנועות במזומן',
    recount: 'ספירה',
  },
} as const;

/** WCAG 2.2 A and AA, as in 07-a11y. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: /^(Primary|ניווט ראשי)$/ }).getByRole('link', { name, exact: true });
const cashFigure = (page: Page) => page.getByTestId('cash-amount').locator('[data-value]');
const balance = async (page: Page): Promise<number> =>
  Number(await page.getByTestId('balance-amount').locator('[data-value]').getAttribute('data-value'));

async function fromMenu(page: Page, item: RegExp): Promise<void> {
  await page.getByTestId('add-button').click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function setUp(page: Page, lang: 'en' | 'he', amount: string): Promise<void> {
  const copy = COPY[lang];
  const card = page.getByTestId('cash-setup');
  await expect(card.getByRole('heading', { name: copy.setup })).toBeVisible();
  await card.getByLabel(copy.amount, { exact: true }).fill(amount);
  await card.getByRole('button', { name: copy.save }).click();
  await expect(card).toBeHidden();
}

for (const lang of ['en', 'he'] as const) {
  test.describe(`@cash in ${lang}`, () => {
    // eslint-disable-next-line no-empty-pattern
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name !== lang, 'Language is set by the project.');
    });

    test('set up, withdraw, pay and recount: the cash moves, and the balance only where money left', async ({
      page,
    }) => {
      const copy = COPY[lang];
      await completeFirstRun(page, lang, { demo: false });
      const before = await balance(page);

      // 1. Set up cash at 500.
      await tab(page, copy.cash).click();
      await setUp(page, lang, '500');
      await expect(cashFigure(page)).toHaveAttribute('data-value', '50000');

      // 2. Withdraw 200.
      await fromMenu(page, copy.withdraw);
      const withdraw = page.getByRole('dialog', { name: copy.withdrawTitle });
      await withdraw.getByLabel(copy.amount, { exact: true }).fill('200');
      await withdraw.getByRole('button', { name: copy.save }).click();
      await expect(withdraw).toBeHidden();
      await expect(cashFigure(page)).toHaveAttribute('data-value', '70000');

      // 3. Pay 50 in cash.
      await fromMenu(page, copy.expense);
      const form = page.getByRole('dialog', { name: copy.newTransaction });
      await form.getByLabel(copy.amount, { exact: true }).fill('50');
      await form.getByRole('button', { name: copy.save }).click();
      await expect(form).toBeHidden();

      // 4. 650 on hand, while the balance moved only by the 50 paid.
      await expect(cashFigure(page)).toHaveAttribute('data-value', '65000');
      await tab(page, copy.feed).click();
      await expect.poll(() => balance(page)).toBe(before - 5_000);

      // 5. Recount to 640: a "missing 10" row, and the balance moves by 10.
      await tab(page, copy.cash).click();
      await fromMenu(page, copy.count);
      const count = page.getByRole('dialog', { name: copy.countTitle });
      await count.getByLabel(copy.wallet, { exact: true }).fill('640');
      const difference = count.getByTestId('count-difference');
      await expect(difference).toHaveText(copy.missing);
      await expect(difference.locator('[data-value]')).toHaveAttribute('data-value', '1000');
      await count.getByRole('button', { name: copy.save }).click();
      await expect(count).toBeHidden();
      await expect(cashFigure(page)).toHaveAttribute('data-value', '64000');
      await expect(
        page.getByRole('region', { name: copy.activity }).getByText(copy.recount, { exact: true }),
      ).toBeVisible();

      await tab(page, copy.feed).click();
      await expect.poll(() => balance(page)).toBe(before - 6_000);
    });

    test('passes axe with the tab, its menu and its sheets open', async ({ page }) => {
      const copy = COPY[lang];
      const theme = lang === 'he' ? 'dark' : 'light';
      await page.emulateMedia({ colorScheme: theme });
      await completeFirstRun(page, lang, { demo: false, theme });
      await tab(page, copy.cash).click();
      await page.evaluate(() => document.fonts.ready);

      /** The whole screen, or - with a pop-out or sheet open - just that, as 07-a11y scans pop-outs. */
      const scan = async (what: string, include?: string): Promise<void> => {
        const builder = new AxeBuilder({ page }).withTags(TAGS);
        const results = await (include === undefined ? builder : builder.include(include)).analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ') ?? ''}`),
          what,
        ).toEqual([]);
      };

      await scan('setup');
      await setUp(page, lang, '500');
      await scan('figure and activity');

      await page.getByTestId('add-button').click();
      await expect(page.getByRole('menuitem', { name: copy.withdraw })).toBeVisible();
      await scan('add menu', '[data-slot="dropdown-menu-content"]');
      await page.getByRole('menuitem', { name: copy.withdraw }).click();
      await expect(page.getByRole('dialog', { name: copy.withdrawTitle })).toBeVisible();
      await scan('withdraw sheet', '[role="dialog"]');
      await page.keyboard.press('Escape');

      await fromMenu(page, copy.count);
      await expect(page.getByRole('dialog', { name: copy.countTitle })).toBeVisible();
      await scan('count sheet', '[role="dialog"]');
    });
  });
}

test.describe('@cash on a phone', () => {
  test.use({ viewport: { width: 375, height: 740 } });
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'en', 'Measured once, in English.');
  });

  /** Controls inside `scope` shorter than 44px; the shared sheet's close button is existing chrome. */
  const short = (page: Page, scope: string) =>
    page.evaluate((selector) => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll(
        `${selector} :is(button, a[href], input:not([type="hidden"]), [role="radio"], [role="combobox"], [role="menuitem"])`,
      )) {
        if (el.closest('[data-slot="sheet-close"], .sr-only') !== null) continue;
        const height = (el as HTMLElement).offsetHeight;
        if (height === 0) continue;
        if (height < 44)
          bad.push(`${el.tagName} "${(el.textContent ?? '').trim().slice(0, 30)}" ${String(height)}px`);
      }
      return bad;
    }, scope);

  test('keeps every new control at 44px', async ({ page }) => {
    await completeFirstRun(page, 'en', { demo: false });
    await page.goto('/cash');
    expect(await short(page, '[data-testid="cash-setup"]'), 'setup').toEqual([]);
    await setUp(page, 'en', '500');

    await page.getByTestId('add-button').click();
    await expect(page.getByRole('menuitem', { name: /^Withdraw from ATM/ })).toBeVisible();
    expect(await short(page, '[data-testid="cash-add-menu"]'), 'menu').toEqual([]);
    await page.getByRole('menuitem', { name: /^Withdraw from ATM/ }).click();
    const withdraw = page.getByRole('dialog', { name: 'Withdraw from ATM' });
    await withdraw.getByLabel('Amount', { exact: true }).fill('200');
    expect(await short(page, '[role="dialog"]'), 'withdraw sheet').toEqual([]);
    await withdraw.getByRole('button', { name: 'Save' }).click();
    await expect(withdraw).toBeHidden();

    expect(await short(page, 'main section[aria-labelledby]'), 'activity').toEqual([]);

    await fromMenu(page, /^Count my cash/);
    await expect(page.getByRole('dialog', { name: 'Count my cash' })).toBeVisible();
    expect(await short(page, '[role="dialog"]'), 'count sheet').toEqual([]);
  });
});

test.describe('@cash on a 320px phone in Hebrew', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'he', 'The tightest case: Hebrew at 320px.');
  });

  test('fits four tabs, each 44px tall, with no label cut short', async ({ page }) => {
    await completeFirstRun(page, 'he');
    const tabs = page
      .getByRole('navigation', { name: 'ניווט ראשי' })
      .getByRole('link')
      .filter({ hasNotText: 'Bookandry' });
    await expect(tabs).toHaveCount(4);
    for (const link of await tabs.all()) {
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      if (box === null) continue;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320.5);
      const clipped = await link.evaluate((el) =>
        [...el.querySelectorAll('span:not(.sr-only)')].some(
          (span) => span.scrollWidth > span.clientWidth + 0.5,
        ),
      );
      expect(clipped).toBe(false);
    }
    expect(await page.evaluate(() => document.body.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });

  test('fits a seven-figure cash figure on the panel', async ({ page }) => {
    await completeFirstRun(page, 'he', { demo: false });
    await page.goto('/cash');
    await setUp(page, 'he', '1234567.89');
    await expect(cashFigure(page)).toHaveAttribute('data-value', '123456789');
    const box = await cashFigure(page).boundingBox();
    expect(box).not.toBeNull();
    if (box !== null) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
    expect(await page.evaluate(() => document.body.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 4: Run the e2e specs**

Run: `pnpm test:e2e e2e/15-cash.spec.ts e2e/00-shell.spec.ts e2e/07-a11y.spec.ts e2e/04-rtl-hebrew.spec.ts`
Expected: PASS in the `en` and `he` projects. The skipped combinations are reported as skipped.

If the seven-figure test fails on width, step the cash figure down one more size below 360px in `src/features/cash/cash-figure.tsx`. For example, change `max-[359px]:text-[2.25rem]` to `max-[359px]:text-[2rem]` on the cash figure only, leaving the balance's own size alone. Then run the spec again.

If axe reports a contrast problem on the panel, fix the class in the cash component it names. Never relax the scan.

- [ ] **Step 5: The README entry**

In `README.md` "Design decisions", in **"Account linking is a page in Settings, not a tab."** (around line 431), replace the words "and the tab bar keeps three tabs." with "and takes no tab." The tab bar now has four tabs.

Then insert this new entry directly after that paragraph:

```markdown
**Cash is part of the balance, not beside it.** The Cash tab (קופת מזומן) shows how
much of the balance is in the wallet: the feed's balance stays "all my money".
Cash income raises both, paying cash lowers both, and moving money between the
bank and the wallet - a withdrawal, a deposit, the amount someone started with -
moves only the cash. Those moves are a table of their own (`cashMoves`), not a
new transaction kind or payment-method type: an older build syncing alongside
this one rejects, forever, a row carrying an enum value it does not know, while
a table it does not know it simply never reads. For the same reason a move's
`kind` is a free string and every sum ignores a kind it does not know. Income
says where it went in its own field, `destinationId` (a bank account, as a
label, or cash), not in `paymentMethodId`, which older income forms drop on
edit. A recount writes an ordinary cash income ("Cash found") or expense ("Cash
missing") tagged `cashCount`, so an older build's balance is right too, or a
zero `count` move when it matched. Each person's cash counts from their first
`start`, so old cash spending cannot drive it negative; it can still go below
zero, and says so. Linked accounts share one pot - every row keeps its person,
so the pot always splits back, and unlinking takes the other person's moves off
the device with their space. Not modelled: per-account balances, cash in a
foreign currency, notes and coins by denomination.
```

- [ ] **Step 6: Run the full gate**

Run: `pnpm verify`
Expected: typecheck, lint, format:check, the three gates, every unit/db/dom test with coverage, and the build all pass. If `format:check` fails on the README or the new spec, run `pnpm exec prettier --write README.md e2e/15-cash.spec.ts` and check again.

Run: `pnpm knip`
Expected: no unused exports among the files this plan added. If knip reports one, such as a type exported only for its own file (`CashData`, `MarkSize`, `CountOutcome`), remove the `export` keyword rather than adding an ignore rule.

- [ ] **Step 7: Commit**

```bash
git add e2e/15-cash.spec.ts e2e/00-shell.spec.ts e2e/07-a11y.spec.ts README.md
git commit -m "The cash tab end to end in English and Hebrew, with axe, 44px targets and four tabs at 320px, and why cash is part of the balance" -m "The spec sets up 500, withdraws 200, pays 50 in cash and checks 650 on hand while the feed balance moved by 50 only, then recounts to 640 and sees a missing-10 row move the balance by 10. axe scans the tab with its menu and sheets open; every new control clears 44px; four tabs and a seven-figure figure fit a 320px phone in Hebrew. The README records the design." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Changing the default currency converts cash moves too

The controller added this task after the plan was written. The planner flagged a gap: a `CashMove` stores no currency, because its `amountMinor` is in the household's base currency. When the user changes the default currency, `reconvertDefaultCurrency` (`src/db/reconvert.ts`) converts transactions, overrides and opening balances, but leaves cash moves alone, so afterwards the cash figure is wrong. **Ruling:** cash moves are converted the way a profile's opening balance is, from the old base to the new one at the rate on the move's own `date`. A missing rate aborts the whole flow before any write, exactly as it does for other rows.

**Files:**

- Modify: `src/domain/reconvert.ts`:
  - `ReconvertInput` gains `cashMoves: readonly CashMove[]`;
  - `ReconvertPlan` gains `cashMoves: readonly { id: string; amountMinor: number }[]`;
  - `UnresolvedRow['kind']` gains `'cashMove'`;
  - `collectRateRequests` and `planReconversion` handle moves.
- Modify: `src/db/reconvert.ts`:
  - `loadReconvertInput` reads `db.cashMoves.toArray()`;
  - `applyReconvertPlan` includes `db.cashMoves` in its single `rw` transaction and writes `{ amountMinor, updatedAt: now }` for each planned move;
  - the returned counts gain `cashMoves`.
- Modify: any caller or type that spreads the `changed` counts, such as the settings UI showing "converted N rows". Grep `changed.transactions`.
- Test: `src/domain/reconvert.test.ts`, `src/db/reconvert.test.ts`.

**Interfaces:**

- Consumes: `CashMove` (Task 1), the `cashMoves` table (Task 4), and the existing `convertMinor(amountMinor, from, to, rate)` and `RateLookup` in `src/domain/reconvert.ts`.
- Produces: `ReconvertPlan.cashMoves`, and `applyReconvertPlan(...)` returning `{ transactions, overrides, profiles, cashMoves }`.

- [ ] **Step 1: Write the failing domain tests.** In `src/domain/reconvert.test.ts`, add one test per rule. Build the moves with a small `move(over)` factory beside the existing ones (`id`, `profileId: 'p1'`, `kind: 'withdraw'`, `amountMinor: 20000`, `date: d('2026-03-12')`, `isDeleted: 0`, timestamps):
  1. **Rate requests:** `collectRateRequests` includes `(oldBase, move.date)` for every move whose `amountMinor !== 0`. Zero-amount moves (`count`, a zero `start`) need no rate.
  2. **Conversion:** `planReconversion` converts a 20000-minor USD move to EUR with the rate the lookup returns for that date. Expect `convertMinor(20000, 'USD', 'EUR', rate)`.
  3. **Unchanged rows:** a zero-amount move and a deleted move (`isDeleted: 1`) are carried over unchanged, with no rate needed.
  4. **Missing rate:** a missing rate puts `{ kind: 'cashMove', id, currency: oldBase, date, reason: 'no_rate' }` into `unresolved`.
  5. **Unknown kind:** an unknown `kind` string is converted like any other move. The money is real even if this build doesn't know the kind.
- [ ] **Step 2: Run them and watch them fail.** Run `pnpm test --project unit src/domain/reconvert.test.ts`. Expected: FAIL, because `cashMoves` is missing from the input and plan types.
- [ ] **Step 3: Implement the domain change.** It mirrors the `profiles` loop in `planReconversion`: if `amountMinor === 0` push it unchanged; otherwise `lookup(input.oldBase, input.newBase, move.date)`, and on a miss push the unresolved row, else push the converted amount. `collectRateRequests` adds `(input.oldBase, move.date)` for non-zero moves.
- [ ] **Step 4: Run the domain tests and see them pass.**
- [ ] **Step 5: Write the failing DB test.** In `src/db/reconvert.test.ts`, following the existing end-to-end reconvert test's setup (fake rates dependency, a seeded db), add a withdraw move of 20000 USD. Run `reconvertDefaultCurrency(db, 'USD', 'EUR', deps)` and expect:
  - the stored move's `amountMinor` is converted and its `updatedAt` equals `deps.now`;
  - `result.changed.cashMoves === 1`.

  Add a second test where the rate for the move's date is missing. Expect `{ ok: false, reason: 'unresolved' }`, and **every** row unchanged, the move and the transactions both, which proves the write stays atomic.

- [ ] **Step 6: Run it and watch it fail.** Run `pnpm test --project db src/db/reconvert.test.ts`.
- [ ] **Step 7: Implement the DB change.** Read `db.cashMoves` in `loadReconvertInput`. Add `db.cashMoves` to the `db.transaction('rw', …)` table list in `applyReconvertPlan`, and update each planned move. Keep the move inside the SAME transaction as the settings write, so the stored amounts and the default currency can never disagree.
- [ ] **Step 8: Run both test files, then the gate.** Run `pnpm test --project unit src/domain/reconvert.test.ts`, then `pnpm test --project db src/db/reconvert.test.ts`, then `pnpm typecheck`, then `pnpm lint`. All must pass.
- [ ] **Step 9: Commit.**

```bash
git add src/domain/reconvert.ts src/domain/reconvert.test.ts src/db/reconvert.ts src/db/reconvert.test.ts
git commit -m "Changing the default currency converts cash moves too, at each move's own date" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Spec Coverage

| Spec section                                                                                             | Task(s)                |
| -------------------------------------------------------------------------------------------------------- | ---------------------- |
| §1.1 `destinationId`: series scopes, validation, "not assigned"                                          | 1, 2, 6, 7, 8          |
| §1.2 `cashCount`, `cat.cash_found` / `cat.cash_missing`                                                  | 1, 2, 4, 5             |
| §1.3 `cashMoves`: type, Dexie v4, `SYNCED_TABLES`, `rowSchemas`, `homeOf`, `shareWith`, `cashMoveSchema` | 1, 2, 4                |
| §2.1–2.3 the figure: cutoff, not set up, expected, all, negative                                         | 3, 5, 9                |
| §2.4 `settleDate` never moves income                                                                     | 1                      |
| §3.1 the fourth tab                                                                                      | 9, 11                  |
| §3.2 the screen: panel, pills, "Counted", expected, activity, avatars, setup card                        | 9                      |
| §3.3 the Add menu, the withdraw/deposit sheet, Undo, Count my cash, cash presets                         | 5, 7, 10               |
| §3.4 "Goes to": options, default, "Whose?", no cards, the feed row                                       | 6, 7, 8                |
| §3.5 the bank account "Incoming" line                                                                    | 8                      |
| §4 linked accounts: one pot, unlinking                                                                   | 3, 4                   |
| §5 delete all data, export and import                                                                    | 2, 4                   |
| §6 older builds (both tests)                                                                             | 2                      |
| §7 edge cases                                                                                            | 3, 4, 5, 8, 9, 10, 11  |
| §8 tests: domain, DB, schema, DOM, E2E, axe, 44px, 320px                                                 | every task; 11 for E2E |
| (gap found while planning) changing the default currency converts cash moves                             | 12                     |
