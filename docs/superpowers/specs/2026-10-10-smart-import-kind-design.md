# Smart import: expenses, income or both: design

**Status:** decisions taken in chat on 2026-10-10; built on branch `smart-import-kind`.
**Asked for by the user:** "split smart import into expenses and incomes; when a user picks incomes, only incomes are imported and expenses are not included."

## Decisions

1. **A three-way choice on the Smart import sheet: Expenses | Income | Both.**
   - en "Expenses", "Income", "Both"; he "הוצאות", "הכנסות", "הכל". Its label: en "What to import", he "מה לייבא?".
   - It sits with the "whose" picker, before the files are read, and stays on the review so the choice can change there.
   - The default is Expenses. Nothing is remembered between imports: a new session starts on Expenses.
   - It is the app's existing `Segmented` control (`src/components/segmented.tsx`), the same one the "whose" picker uses. No new component.
2. **The app filters after reading; the model is not told.** The extraction prompt, the wire format and the Edge Functions are unchanged.
   - The verify mode checks the rows against the statement's printed totals, and that needs every row.
   - Spreadsheets are parsed by the app from a column map, so the model never sees their rows to filter them.
   - A row the model labels wrongly stays recoverable: it is left out, not dropped.
3. **What each mode keeps** (`matchesImportKind` in `src/features/import/review-items.ts`):
   - Expenses: rows whose kind is `expense`, plus refunds. A refund is an income row whose category is `cat.refund` (`REFUND_CATEGORY`). Money back on a purchase belongs with the spending it undoes.
   - Income: income rows that are not refunds.
   - Both: every row, which is exactly what the sheet did before.
   - A row's kind and category are read from its current values, falling back to the kind it was read as when it has no values yet. A row the person edits into the other kind follows the edit.
4. **Rows left out are kept, quietly.** The review shows one line, e.g. "4 expenses left out · Show" (he "4 הוצאות לא נכללו · הצג"), with i18next plurals.
   - Show lists them below that line, unticked: they are added only if the person ticks them. Hide puts them away again and unticks them.
   - While hidden they count toward nothing: not "Add N", not the group counts, not Select all, not the discard prompt.
   - Select all ticks only the rows of the chosen kind; a left-out row is ticked only by hand.
5. **Unchanged:** cards and bank accounts found in the files, the "whose" picker, the note, cash-withdrawal flagging, dedupe ("Looks already added"), and the total checks.
6. **Switching the mode on the review re-filters at once**, without reading the files again (`withImportKind`):
   - a row that leaves the import is unticked;
   - a row that comes in is ticked as it was when first read (unticked if something about it needs a look);
   - a row that stays keeps whatever tick the person gave it.
   - The left-out rows are hidden again after a switch.

## Edge cases

- **No rows of the chosen kind.** A payslip read in Expenses mode: the review says "No expenses in these files." and still offers "1 income left out · Show". Cards or accounts found are listed as usual. The "nothing found" message stays for files with no rows at all.
- **A refund in Income mode.** It is on the expense side, so it is left out and counted in "N expenses left out". Shown and ticked, it saves as the refund (income) it is.
- **A cash withdrawal (ATM).** Still an expense: kept in Expenses and Both, flagged "Cash withdrawal" and unticked as before. In Income mode it is left out like any expense.
- **Editing a row into the other kind.** Done in the row editor, the row is confirmed and ticked. If it no longer matches the mode, the left-out rows are shown so the row the person just settled does not vanish.
- **Hebrew plurals.** Hebrew has `one`, `two` and `other` (CLDR 42 dropped `many`): "הוצאה אחת לא נכללה", "שתי הוצאות לא נכללו", "{{count}} הוצאות לא נכללו"; the same for "הכנסה/הכנסות". Zero never shows the line.
- **Choose other files.** Back to picking keeps the choice on screen; closing the sheet or adding the rows ends the session, and the next import starts on Expenses.

## Tests

- Unit (`review-items.test.ts`): `matchesImportKind` for an expense, an income, a refund both ways, a cash withdrawal, Both; `withImportKind` for leaving, coming in and staying.
- DOM (`import-sheet.test.tsx`): the default, the switch before reading, the left-out line and Show, re-filtering on the review, the empty state, Hebrew.
