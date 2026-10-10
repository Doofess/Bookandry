import { expect, test } from '@playwright/test';

import { THEMES } from './config';
import { runScreen } from './run';
import { SCREENS } from './screens';

for (const screen of SCREENS) {
  for (const theme of THEMES) {
    test(`${screen.id} ${theme} @fid-${screen.id} @fid-${screen.size} @fid-${theme}`, async ({
      browser,
    }, info) => {
      test.skip(screen.reserved !== undefined, screen.reserved ?? '');
      test.setTimeout(240_000);
      const report = await runScreen(browser, screen, theme);
      await info.attach('report.json', {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
      });
      expect(report.failures, `${screen.id} in ${theme}: pictures and report in ${report.dir}`).toEqual([]);
    });
  }
}
