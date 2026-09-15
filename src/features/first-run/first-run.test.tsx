import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db/db';
import { getSettings } from '@/db/repos/settings';
import { initTestI18n, renderWithProviders } from '@/test/render';

import { FirstRun } from './first-run';

/**
 * The wizard, driven against the real database.
 *
 * `fake-indexeddb` makes the whole path real from the first keystroke to the
 * committed rows, which matters here more than anywhere else: this screen is
 * the one the plan added because the app as specified could not save its first
 * transaction. A mocked write would prove nothing about that.
 */
async function clearDb(): Promise<void> {
  await db.open();
  await db.transaction('rw', [db.profiles, db.settings, db.transactions, db.overrides], async () => {
    await db.profiles.clear();
    await db.transactions.clear();
    await db.overrides.clear();
    await db.settings.clear();
  });
}

beforeEach(async () => {
  await initTestI18n('en');
  await clearDb();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await clearDb();
});

const next = () => screen.getByRole('button', { name: 'Continue' });

async function fillPeopleAndFinish(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(next());
  await user.type(screen.getByLabelText('Name'), name);
  await user.click(next());
  await user.click(screen.getByRole('button', { name: 'Start tracking' }));
}

describe('FirstRun', () => {
  it('starts on language and currency, pre-selected from the browser', () => {
    renderWithProviders(<FirstRun languages={['en-US']} />);
    expect(screen.getByRole('heading', { name: 'Language and currency' })).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    // en-US, so USD. The name is "Currency US Dollar": the trigger announces
    // the field AND the value, not just the field.
    expect(screen.getByRole('combobox', { name: /Currency.*US Dollar/i })).toBeInTheDocument();
  });

  it('pre-selects Hebrew and shekels for an Israeli browser', async () => {
    await initTestI18n('he');
    renderWithProviders(<FirstRun languages={['he-IL']} />);
    // The only moment choosing the base currency is free rather than a rewrite.
    expect(screen.getByRole('combobox', { name: /שקל/ })).toBeInTheDocument();
    await initTestI18n('en');
  });

  it('refuses to continue past an unnamed person, and says why', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirstRun languages={['en-US']} />);

    await user.click(next());
    await user.click(next());

    expect(screen.getByText('Give this person a name.')).toBeInTheDocument();
    // Still on the people step, not silently advanced.
    expect(screen.getByRole('heading', { name: 'Who is tracking money here?' })).toBeInTheDocument();
  });

  it('creates a profile, which is the thing the spec never did', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirstRun languages={['en-US']} />);

    await fillPeopleAndFinish(user, 'Dana');

    await waitFor(async () => {
      expect(await db.profiles.count()).toBe(1);
    });
    const [profile] = await db.profiles.toArray();
    expect(profile?.name).toBe('Dana');
    // Anchored to the month, not to today: otherwise the first month shown is
    // missing the salary that arrived on the 1st.
    expect(profile?.openingBalanceDate).toBe('2026-09-01');
    expect((await getSettings(db))?.activeProfileId).toBe(profile?.id);
  });

  it('builds two people plus a household when asked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirstRun languages={['en-US']} />);

    await user.click(next());
    await user.click(screen.getByRole('radio', { name: /Two of us/ }));

    const names = screen.getAllByLabelText('Name');
    await user.type(names[0]!, 'Dana');
    await user.type(names[1]!, 'Yossi');

    await user.click(next());
    await user.click(screen.getByRole('button', { name: 'Start tracking' }));

    await waitFor(async () => {
      expect(await db.profiles.count()).toBe(3);
    });
    const profiles = await db.profiles.toArray();
    expect(profiles.map((p) => p.name).sort()).toEqual(['Dana', 'Household', 'Yossi']);
    // Every profile a distinct colour: uniqueness is what caps the app at 12.
    expect(new Set(profiles.map((p) => p.color)).size).toBe(3);
    expect((await getSettings(db))?.activeProfileId).toBe('all');
  });
});

describe('FirstRun — the details that only show up live', () => {
  it('flips the document to RTL the moment Hebrew is chosen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirstRun languages={['en-US']} />);

    await user.click(screen.getByRole('button', { name: 'עברית' }));

    // A preview that waits until the end previews nothing, and for Hebrew the
    // entire layout flips - the user should see that before committing.
    await waitFor(() => {
      expect(document.documentElement.dir).toBe('rtl');
      expect(document.documentElement.lang).toBe('he');
    });

    await initTestI18n('en');
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
  });

  it('stores the opening balance as integer minor units', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirstRun languages={['en-US']} />);

    await user.click(next());
    await user.type(screen.getByLabelText('Name'), 'Dana');
    await user.click(next());
    await user.type(screen.getByLabelText('Dana'), '1234.56');
    await user.click(screen.getByRole('button', { name: 'Start tracking' }));

    await waitFor(async () => {
      expect(await db.profiles.count()).toBe(1);
    });
    const [profile] = await db.profiles.toArray();
    expect(profile?.openingBalanceMinor).toBe(123_456);
    expect(profile?.openingBalanceCurrency).toBe('USD');
  });

  it('accepts an overdraft', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirstRun languages={['en-US']} />);

    await user.click(next());
    await user.type(screen.getByLabelText('Name'), 'Dana');
    await user.click(next());
    // מינוס. An ordinary state for an Israeli current account.
    await user.type(screen.getByLabelText('Dana'), '-2500');
    await user.click(screen.getByRole('button', { name: 'Start tracking' }));

    await waitFor(async () => {
      expect(await db.profiles.count()).toBe(1);
    });
    expect((await db.profiles.toArray())[0]?.openingBalanceMinor).toBe(-250_000);
  });

  it('starts from zero when the balance step is skipped', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirstRun languages={['en-US']} />);

    await user.click(next());
    await user.type(screen.getByLabelText('Name'), 'Dana');
    await user.click(next());
    await user.type(screen.getByLabelText('Dana'), '999');
    await user.click(screen.getByRole('button', { name: 'Skip, start from zero' }));
    await user.click(screen.getByRole('button', { name: 'Start tracking' }));

    await waitFor(async () => {
      expect(await db.profiles.count()).toBe(1);
    });
    expect((await db.profiles.toArray())[0]?.openingBalanceMinor).toBe(0);
  });

  it('loads demo data only when asked, and tags every row it writes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirstRun languages={['en-US']} />);

    await user.click(next());
    await user.type(screen.getByLabelText('Name'), 'Dana');
    await user.click(next());
    await user.click(screen.getByRole('switch', { name: 'Load demo data' }));
    await user.click(screen.getByRole('button', { name: 'Start tracking' }));

    await waitFor(async () => {
      expect(await db.transactions.count()).toBeGreaterThan(50);
    });
    // Every row removable in one tap, rather than "Clear all data".
    const rows = await db.transactions.toArray();
    expect(rows.every((t) => t.id.startsWith('demo.'))).toBe(true);
  });

  it('writes no transactions when the demo is left off', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirstRun languages={['en-US']} />);

    await fillPeopleAndFinish(user, 'Dana');

    await waitFor(async () => {
      expect(await db.profiles.count()).toBe(1);
    });
    expect(await db.transactions.count()).toBe(0);
  });
});

describe('FirstRun — ARIA structure', () => {
  it('puts every radio inside a radiogroup', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<FirstRun languages={['en-US']} />);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // getByRole finds an ORPHAN role="radio" perfectly well, so querying by
    // role proves nothing about the grouping. Assert the relationship.
    const radios = [...container.querySelectorAll('[role="radio"]')];
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) {
      expect(radio.closest('[role="radiogroup"]')).not.toBeNull();
    }
  });

  it('names each radiogroup', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<FirstRun languages={['en-US']} />);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const groups = [...container.querySelectorAll('[role="radiogroup"]')];
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      const labelledBy = group.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(container.ownerDocument.getElementById(labelledBy ?? '')).not.toBeNull();
    }
  });

  it('keeps a taken colour focusable, with aria-disabled rather than disabled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirstRun languages={['en-US']} />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('radio', { name: /Two of us/ }));

    const taken = screen.getAllByRole('radio').filter((el) => el.getAttribute('aria-disabled') === 'true');

    expect(taken.length).toBeGreaterThan(0);
    // `disabled` would remove it from the tab order, so a keyboard user would
    // never learn why the colour they wanted is missing.
    for (const swatch of taken) expect(swatch).not.toBeDisabled();
  });
});
