import { useTranslation } from 'react-i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

beforeAll(async () => {
  await initTestI18n();
});

/**
 * Proof that the missing-key guard is ARMED.
 *
 * Every other test in this suite depends on it: they assert on English strings,
 * and a typo'd key renders as the key itself, which passes any test that does
 * not happen to assert that exact text. The guard is what turns "no hardcoded
 * strings" from a review item into a failing test - so it needs a test of its
 * own, or the day someone quietly drops `saveMissing` nothing says so.
 */

function Broken() {
  const { t } = useTranslation();

  /*
   * A key that does not exist, reached deliberately around the type system.
   *
   * `tsc` rejects this spelling outright - the key union is generated from `en`
   * - which is the first line of defence and is already tested by the build.
   * The runtime guard is the SECOND line, for the keys tsc cannot see: a
   * category's `nameKey` read out of an imported file, a key assembled from a
   * variable. Those reach `t` as a plain string, and without this handler they
   * render as themselves.
   */
  const untyped = t as unknown as (key: string) => string;

  return <p>{untyped('nav.feeed')}</p>;
}

function Fine() {
  const { t } = useTranslation();
  return <p>{t('nav.feed')}</p>;
}

describe('the missing-key handler', () => {
  it('throws rather than rendering the key as text', () => {
    // React logs the error boundary-less throw; silenced so the failure output
    // stays about the assertion rather than a page of component stack.
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => {
      renderWithProviders(<Broken />);
    }).toThrow(/missing key "common:nav.feeed"/);

    error.mockRestore();
  });

  it('leaves a real key alone', () => {
    // The other half: a guard that threw on everything would be no guard.
    const { getByText } = renderWithProviders(<Fine />);

    expect(getByText('Feed')).toBeInTheDocument();
  });
});
