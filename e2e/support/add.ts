import { expect, type Page } from '@playwright/test';

/** The + button's menu item that opens the form, in either language. */
export const ADD_MANUALLY = /^(Add manually|הוספה ידנית)$/;

/** Open the add-transaction form the way a person does: the + button, then "Add manually". */
export async function openAddSheet(page: Page): Promise<void> {
  await page.getByTestId('fab').click();
  const item = page.getByRole('menuitem', { name: ADD_MANUALLY });
  await expect(item).toBeVisible();
  await item.click();
}
