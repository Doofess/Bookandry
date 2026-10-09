import { renderHook } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n } from '@/test/render';

const account = vi.hoisted((): { view: { status: string } } => ({ view: { status: 'signed_in' } }));
vi.mock('@/app/account', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAccount: () => account.view,
}));

const { useSettingsSections } = await import('./sections');

beforeAll(async () => {
  await initTestI18n('en');
});

const sections = (status: string) => {
  account.view = { status };
  return renderHook(() => useSettingsSections()).result.current;
};

describe('the settings sections', () => {
  it('signed in, lists the account, then account linking, then security', () => {
    const { account: mine } = sections('signed_in');
    expect(mine.map((s) => s.key)).toEqual(['account', 'linking', 'security']);
    const linking = mine[1];
    expect(linking?.to).toBe('/settings/linking');
    expect(linking?.label).toBe('Account linking');
    expect(linking?.hint).toBe('Share your money with the people you live with');
  });

  it.each(['signed_out', 'unavailable'])('%s, has no account linking: it needs an account', (status) => {
    const { account: mine, app } = sections(status);
    expect([...mine, ...app].map((s) => s.key)).not.toContain('linking');
  });

  it('in Hebrew, calls it קישור חשבונות', async () => {
    await initTestI18n('he');
    try {
      const linking = sections('signed_in').account.find((s) => s.key === 'linking');
      expect(linking?.label).toBe('קישור חשבונות');
      expect(linking?.hint).toBe('שיתוף הכספים עם מי שגרים איתך');
    } finally {
      // Back to English whatever happened above, so a failure here cannot fail the next test too.
      await initTestI18n('en');
    }
  });
});
