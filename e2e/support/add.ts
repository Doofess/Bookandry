import { expect, type Locator, type Page } from '@playwright/test';

/** The Add menu's first item, which opens the form as an expense, in either language. Its hint follows the name. */
export const ADD_EXPENSE = /^(Expense|הוצאה)/;

/** The Add trigger a person sees: the rail's from 1024 (§4.2), the floating pill below. */
export function addTrigger(page: Page): Locator {
  return page.getByTestId((page.viewportSize()?.width ?? 0) >= 1024 ? 'rail-add' : 'add-button');
}

/** Open the add-transaction form the way a person does: the Add pill, then "Expense". */
export async function openAddSheet(page: Page): Promise<void> {
  await addTrigger(page).click();
  const item = page.getByRole('menuitem', { name: ADD_EXPENSE });
  await expect(item).toBeVisible();
  await item.click();
}
