import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildDemoData } from '@/domain/demo';
import { applyShape, initialDraft, updatePerson, type FirstRunDraft } from '@/domain/first-run';
import { validateEnvelope } from '@/domain/transfer-validate';
import { BOOT_KEY } from '@/i18n/boot';
import { assertLocalDate } from '@/lib/dates';
import { freshDb, type TestDb } from '@/test/db-harness';
import type { IsoInstant } from '@/types/money';

import { completeFirstRun } from './first-run';
import { getSettings } from './repos/settings';
import { buildExport } from './transfer';

const NOW = '2026-09-15T10:00:00.000Z' as IsoInstant;
const TODAY = assertLocalDate('2026-09-15');

/**
 * The db project runs in Node, which has no localStorage - `writeBootMirror`
 * catches that and no-ops, so asserting the mirror without a stub would assert
 * nothing at all. A three-method in-memory stand-in is enough, and keeps the
 * "settings and mirror are written by the same call" guarantee tested at the
 * layer that makes it.
 */
function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

let handle: TestDb;
beforeEach(() => {
  handle = freshDb();
  vi.stubGlobal('localStorage', memoryStorage());
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await handle.dispose();
});

const named = (draft: FirstRunDraft, ...names: string[]): FirstRunDraft =>
  names.reduce((acc, name, i) => {
    const key = acc.people[i]?.key;
    return key === undefined ? acc : updatePerson(acc, key, { name });
  }, draft);

const solo = () => named(initialDraft('he', 'ILS'), 'Dana');
const household = () => named(applyShape(initialDraft('en', 'ILS'), 'couple', 'Household'), 'Dana', 'Yossi');

describe('completeFirstRun', () => {
  it('writes the profiles and the settings together', async () => {
    const result = await completeFirstRun(handle.db, { draft: solo(), ids: ['p1'], today: TODAY, now: NOW });

    expect(result.profileIds).toEqual(['p1']);
    expect(await handle.db.profiles.count()).toBe(1);

    const settings = await getSettings(handle.db);
    expect(settings).toMatchObject({
      defaultCurrency: 'ILS',
      language: 'he',
      onboardingCompletedAt: NOW,
    });
  });

  it('points a single-profile install at that profile, not at the merged view', async () => {
    // With one profile the switcher and the "All" chip are hidden entirely, so
    // pointing the app at "all" would select a control that is not rendered.
    const result = await completeFirstRun(handle.db, { draft: solo(), ids: ['p1'], today: TODAY, now: NOW });
    expect(result.activeProfileId).toBe('p1');
    expect((await getSettings(handle.db))?.activeProfileId).toBe('p1');
  });

  it('opens a household on the merged view', async () => {
    const result = await completeFirstRun(handle.db, {
      draft: household(),
      ids: ['a', 'b', 'c'],
      today: TODAY,
      now: NOW,
    });
    expect(result.activeProfileId).toBe('all');
    expect(await handle.db.profiles.count()).toBe(3);
  });

  it('writes the boot mirror so the next paint is already in Hebrew', async () => {
    await completeFirstRun(handle.db, { draft: solo(), ids: ['p1'], today: TODAY, now: NOW });
    // The pre-paint script reads this flat key; without it the first frame
    // after a reload renders LTR and then flips.
    expect(JSON.parse(localStorage.getItem(BOOT_KEY) ?? '{}')).toMatchObject({ lang: 'he' });
  });

  it('keeps a theme the user chose before finishing setup', async () => {
    await handle.db.settings.put({
      id: 'singleton',
      defaultCurrency: 'USD',
      language: 'en',
      theme: 'dark',
      activeProfileId: 'all',
      updatedAt: NOW,
    });

    await completeFirstRun(handle.db, { draft: solo(), ids: ['p1'], today: TODAY, now: NOW });

    expect((await getSettings(handle.db))?.theme).toBe('dark');
    expect(JSON.parse(localStorage.getItem(BOOT_KEY) ?? '{}')).toMatchObject({ theme: 'dark' });
  });

  it('writes nothing at all when the profile write fails', async () => {
    // Settings without profiles sends the boot gate straight back to the wizard
    // with the user's answers gone; profiles without settings leaves every
    // amount in a currency they never chose.
    const original = handle.db.profiles.bulkAdd.bind(handle.db.profiles);
    handle.db.profiles.bulkAdd = (() =>
      Promise.reject(new Error('quota exceeded'))) as unknown as typeof original;

    try {
      await expect(
        completeFirstRun(handle.db, { draft: solo(), ids: ['p1'], today: TODAY, now: NOW }),
      ).rejects.toThrow('quota exceeded');
    } finally {
      handle.db.profiles.bulkAdd = original;
    }

    expect(await handle.db.profiles.count()).toBe(0);
    expect((await getSettings(handle.db))?.onboardingCompletedAt).toBeUndefined();
  });
});

describe('the wizard plus the demo', () => {
  /*
   * The bug this exists for: the app could write a backup it then REFUSED to
   * restore.
   *
   * The wizard hands the first profile the first colour in the palette. The
   * demo generator hard-coded the same colour for its own first profile. Load
   * the demo on the last step - which is where the switch is - and two profiles
   * shared one, which `validateEnvelope` rejects as a duplicate. Export is this
   * app's ONLY durability story, and a backup that cannot be restored is not a
   * backup, so this is the worst outcome short of losing the rows outright.
   *
   * Nothing caught it: the round-trip tests seed their own profiles, the wizard
   * tests never load the demo, and `repairIntegrity` - which knows how to fix a
   * duplicate colour - has no caller.
   */
  it('gives every profile its own colour', async () => {
    await completeFirstRun(handle.db, {
      draft: solo(),
      ids: ['p1'],
      today: TODAY,
      now: NOW,
      loadDemo: true,
    });

    const profiles = await handle.db.profiles.toArray();
    const colors = profiles.map((p) => p.color);

    expect(profiles.length).toBeGreaterThan(3); // the user's, plus three demo
    expect(new Set(colors).size, `duplicate colour among ${colors.join(', ')}`).toBe(colors.length);
  });

  it('exports a backup that the app will actually import', async () => {
    // The round trip, end to end, on the state the wizard really produces.
    await completeFirstRun(handle.db, {
      draft: solo(),
      ids: ['p1'],
      today: TODAY,
      now: NOW,
      loadDemo: true,
    });

    const envelope = await buildExport(handle.db, NOW);
    const validated = validateEnvelope(JSON.parse(JSON.stringify(envelope)));

    expect(validated.ok ? [] : validated.issues.map((issue) => `${issue.path}: ${issue.message}`)).toEqual(
      [],
    );
  });

  it('leaves the demo palette alone when nothing is taken', () => {
    /*
     * The other half. Shifting the demo's colours unconditionally would move
     * every screenshot in the matrix and make the fixture non-deterministic
     * against its own history; it may only shift for the user who already owns
     * the colour.
     */
    const data = buildDemoData({ today: TODAY, baseCurrency: 'ILS', now: NOW });
    expect(data.profiles.map((p) => p.color)).toEqual(['#16794a', '#0369a1', '#7e22ce']);
  });
});
