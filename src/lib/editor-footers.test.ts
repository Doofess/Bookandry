import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const EDITORS = [
  'features/transaction/transaction-sheet.tsx',
  'features/cards/method-editor.tsx',
  'features/profiles/profile-editor.tsx',
  'features/settings/categories-screen.tsx',
  'features/cash/count-sheet.tsx',
  'features/cash/move-sheet.tsx',
  'features/account/account-sheet.tsx',
  'features/summary/breakdown-sheet.tsx',
  'features/settings/business-types-sheet.tsx',
];

const source = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf8');

describe('every editor panel (§6.1, CAN WAIT 1 and 17)', () => {
  it.each(EDITORS)('%s lays its body on the panel padding', (file) => {
    expect(source(file)).toMatch(/EditorPanelBody|data-slot="editor-panel-body"/);
  });

  it.each(EDITORS.filter((f) => !f.includes('breakdown') && !f.includes('business-types')))(
    '%s ends in pills, never in default buttons',
    (file) => {
      const text = source(file);
      expect(text).not.toMatch(/data-slot="editor-actions"/);
      expect(text).toMatch(/variant="pill-solid"/);
    },
  );

  it('business-types-sheet has no Save, so its one button is a pill', () => {
    const text = source('features/settings/business-types-sheet.tsx');
    expect(text).not.toMatch(/h-11 w-full/);
    expect(text).toMatch(/variant="pill"/);
  });
});
