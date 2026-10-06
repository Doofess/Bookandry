import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initAccount, type AccountView } from '@/app/account';
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
  vi.restoreAllMocks();
  await clearDb();
});

const next = () => screen.getByRole('button', { name: 'Continue' });

async function finish(user: ReturnType<typeof userEvent.setup>) {
  await user.click(next());
  await user.click(screen.getByRole('button', { name: 'Start tracking' }));
}

const signedIn: AccountView = {
  status: 'signed_in',
  user: {
    id: 'acc-dana',
    email: 'dana@example.com',
    provider: 'google',
    name: 'Dana Levi',
    picture: undefined,
    avatarVersion: undefined,
    language: undefined,
  },
  keys: { kind: 'ready' },
  sync: undefined,
  passwordRecovery: false,
  twoStep: false,
};

describe('FirstRun', () => {
  it('starts on language and currency, pre-selected from the browser', () => {
    renderWithProviders(<FirstRun languages={['en-US']} />);
    expect(screen.getByRole('heading', { name: 'Language and currency' })).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
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

  it('lets a STORED language outrank the browser, so the control matches the screen', () => {
    /*
     * A mirror with no database behind it is reachable: IndexedDB cleared but
     * localStorage kept, or a reset. The app has already booted and painted the
     * wizard in the mirror's language - seeding the control from `navigator`
     * instead would show "English" selected on a Hebrew screen, and then write
     * English to settings on finish, silently changing the language the user
     * was reading.
     */
    localStorage.setItem('gb.boot', JSON.stringify({ lang: 'he', theme: 'light' }));

    renderWithProviders(<FirstRun languages={['en-US']} />);

    expect(screen.getByRole('radio', { name: 'עברית' })).toHaveAttribute('aria-checked', 'true');
    // The currency still comes from the REGION, which the mirror does not carry.
    expect(screen.getByRole('combobox', { name: /US Dollar/i })).toBeInTheDocument();

    localStorage.removeItem('gb.boot');
  });

  it('falls back to the browser when nothing is stored, which is the true first launch', () => {
    localStorage.removeItem('gb.boot');

    renderWithProviders(<FirstRun languages={['he-IL']} />);

    expect(screen.getByRole('radio', { name: 'עברית' })).toHaveAttribute('aria-checked', 'true');
  });

  it('goes straight from language to the balance: nobody is asked for a name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirstRun languages={['en-US']} />);

    await user.click(next());

    expect(screen.getByRole('heading', { name: 'How much do you have right now?' })).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
  });

  it('creates one person, which is the thing the spec never did', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirstRun languages={['en-US']} />);

    await finish(user);

    await waitFor(async () => {
      expect(await db.profiles.count()).toBe(1);
    });
    const [profile] = await db.profiles.toArray();
    // No account on this device, so no account name: the fallback.
    expect(profile?.name).toBe('Me');
    expect(profile?.avatar).toBeUndefined();
    // Anchored to the month, not to today: otherwise the first month shown is
    // missing the salary that arrived on the 1st.
    expect(profile?.openingBalanceDate).toBe('2026-09-01');
    expect((await getSettings(db))?.activeProfileId).toBe(profile?.id);
  });

  it("makes the signed-in account's own person: its id and its name", async () => {
    // Linked accounts are the household's people, so this person must BE the
    // account - the same id the household knows it by.
    vi.spyOn(initAccount(db), 'getView').mockReturnValue(signedIn);
    const user = userEvent.setup();
    renderWithProviders(<FirstRun languages={['en-US']} />);

    await user.click(next());
    expect(screen.getByLabelText('Dana Levi')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start tracking' }));

    await waitFor(async () => {
      expect(await db.profiles.count()).toBe(1);
    });
    const [profile] = await db.profiles.toArray();
    expect(profile).toMatchObject({ id: 'acc-dana', name: 'Dana Levi' });
    expect((await getSettings(db))?.activeProfileId).toBe('acc-dana');
  });
});

describe('FirstRun — the details that only show up live', () => {
  it('flips the document to RTL the moment Hebrew is chosen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirstRun languages={['en-US']} />);

    // `radio`, not `button`: the language control is a real radiogroup, so it
    // announces "2 of 2" rather than "pressed".
    await user.click(screen.getByRole('radio', { name: 'עברית' }));

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
    await user.type(screen.getByLabelText('Me'), '1234.56');
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
    // מינוס. An ordinary state for an Israeli current account.
    await user.type(screen.getByLabelText('Me'), '-2500');
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
    await user.type(screen.getByLabelText('Me'), '999');
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

    await finish(user);

    await waitFor(async () => {
      expect(await db.profiles.count()).toBe(1);
    });
    expect(await db.transactions.count()).toBe(0);
  });
});

describe('FirstRun — ARIA structure', () => {
  // On the first step, where the radios are: the language is the first control
  // anyone meets, and the balance step has none.
  it('puts every radio inside a radiogroup', () => {
    const { container } = renderWithProviders(<FirstRun languages={['en-US']} />);

    // getByRole finds an ORPHAN role="radio" perfectly well, so querying by
    // role proves nothing about the grouping. Assert the relationship.
    const radios = [...container.querySelectorAll('[role="radio"]')];
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) {
      expect(radio.closest('[role="radiogroup"]')).not.toBeNull();
    }
  });

  it('names each radiogroup', () => {
    const { container } = renderWithProviders(<FirstRun languages={['en-US']} />);

    const groups = [...container.querySelectorAll('[role="radiogroup"]')];
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      const labelledBy = group.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(container.ownerDocument.getElementById(labelledBy ?? '')).not.toBeNull();
    }
  });
});
