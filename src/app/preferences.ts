import { rememberAccountLanguage } from '@/app/account';
import { db } from '@/db/db';
import { writeSettings } from '@/db/repos/settings';
import { changeLanguage } from '@/i18n';
import { applyTheme, type Language, type Theme } from '@/i18n/boot';
import { systemClock } from '@/lib/clock';

/*
 * Language and theme, chosen from any of the places that offer them - the
 * account menu, Preferences, the front door - always the same way.
 *
 * Both writes go through `writeSettings`, never straight to Dexie: that one
 * gateway writes the row AND the `gb.boot` localStorage mirror the pre-paint
 * script reads. Splitting them puts the mirror one render behind, and the next
 * cold start flashes the old language or theme before correcting itself.
 */

export function chooseLanguage(language: Language): void {
  void writeSettings(db, { language }, systemClock.nowIso());
  void changeLanguage(language);
  rememberAccountLanguage(language);
}

/**
 * `writeSettings` keeps the choice for the NEXT cold start; `applyTheme` is
 * this one. Without it the choice waits for a reload, and a theme switch that
 * appears to do nothing is one people press twice.
 */
export function chooseTheme(theme: Theme): void {
  void writeSettings(db, { theme }, systemClock.nowIso());
  applyTheme(theme);
}
