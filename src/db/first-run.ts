import { isDemoSupported } from '@/domain/demo';
import { buildProfile, type FirstRunDraft } from '@/domain/first-run';
import { writeBootMirror } from '@/i18n/boot';
import { ALL_PROFILES } from '@/types/domain';
import type { IsoInstant, LocalDate } from '@/types/money';

import type { BookandryDB } from './db';
import { loadDemoData } from './demo';
import { SETTINGS_ID } from './repos/settings';

export type CompleteFirstRunInput = {
  readonly draft: FirstRunDraft;
  /**
   * The person's id: the account's when signed in, else a fresh one. Chosen
   * by the caller so the write stays deterministic.
   */
  readonly id: string;
  /** The account's name, or the translated fallback - never empty. */
  readonly name: string;
  readonly today: LocalDate;
  readonly now: IsoInstant;
  readonly loadDemo?: boolean;
};

export type FirstRunResult = {
  readonly profileId: string;
  readonly activeProfileId: string;
  readonly demoLoaded: boolean;
};

/**
 * Commit the wizard.
 *
 * The person and settings land in ONE transaction. Half-committing is the
 * worst possible state here: settings written without a person sends the boot
 * gate straight back to this wizard with the user's answers gone, and a person
 * written without settings leaves every amount denominated in a currency the
 * user never chose.
 *
 * The demo data is a SEPARATE transaction, deliberately. It is optional extra
 * content, and a failure loading it must not undo the setup the user just
 * completed - they would have to do the whole thing again to find out.
 */
export async function completeFirstRun(
  db: BookandryDB,
  input: CompleteFirstRunInput,
): Promise<FirstRunResult> {
  const { draft, id, name, today, now } = input;
  const profile = buildProfile({ draft, id, name, today, now });

  /*
   * One profile means no switcher and no "All" chip, so pointing the app at the
   * merged view would select a control that is not rendered.
   *
   * ...unless the demo is coming, which adds three more profiles of its own.
   * Without this the app opened on the user's empty profile with sixty demo
   * transactions sitting invisibly in someone else's, and the feed said
   * "Nothing here yet" immediately after they asked to be shown something.
   */
  const willHaveDemoProfiles = input.loadDemo === true && isDemoSupported(draft.currency);
  const activeProfileId = willHaveDemoProfiles ? ALL_PROFILES : profile.id;

  const theme = await db.transaction('rw', [db.profiles, db.settings], async () => {
    await db.profiles.add(profile);

    const current = await db.settings.get(SETTINGS_ID);
    // The theme is whatever it already was: the wizard does not ask, and a
    // user who set dark mode before finishing setup should not be reset.
    const resolved = current?.theme ?? 'system';
    await db.settings.put({
      id: SETTINGS_ID,
      theme: resolved,
      defaultCurrency: draft.currency,
      language: draft.language,
      activeProfileId,
      onboardingCompletedAt: now,
      updatedAt: now,
    });
    return resolved;
  });

  // After the commit, not inside it: the mirror is a pre-paint cache of what
  // the database says, and it must never describe a transaction that rolled
  // back.
  writeBootMirror({ lang: draft.language, theme });

  let demoLoaded = false;
  if (willHaveDemoProfiles) {
    await loadDemoData(db, {
      today,
      baseCurrency: draft.currency,
      now,
      language: draft.language,
    });
    demoLoaded = true;
  }

  return { profileId: profile.id, activeProfileId, demoLoaded };
}
