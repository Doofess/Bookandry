import { expect, type Page } from '@playwright/test';

/** The Add menu's first item, which opens the form as an expense, in either language. Its hint follows the name. */
export const ADD_EXPENSE = /^(Expense|הוצאה)/;

/** Open the add-transaction form the way a person does: the Add pill, then "Expense". */
export async function openAddSheet(page: Page): Promise<void> {
  await page.getByTestId('add-button').click();
  const item = page.getByRole('menuitem', { name: ADD_EXPENSE });
  await expect(item).toBeVisible();
  await item.click();
}
