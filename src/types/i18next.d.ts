import 'i18next';

import type { defaultNS, resources } from '@/i18n';

declare module 'i18next' {
  /**
   * MUST be an `interface`, not a `type` alias.
   *
   * Module augmentation merges INTERFACES. A `type CustomTypeOptions = {...}`
   * here declares something i18next never reads, so every key silently falls
   * back to `string` and `t('totally.bogus.key')` compiles clean - which is
   * exactly what happened until this comment was written. The `he.json` parity
   * assertion in `@/i18n` kept working (it is a plain assignment), so the half
   * that failed was the half with no other signal.
   *
   * eslint's consistent-type-definitions rule prefers `type` and will "fix"
   * this back if the disable below is removed.
   */
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    /**
     * Typed off `en` ONLY, deliberately. That makes `he.json` structurally
     * required to match, so a missing Hebrew key is a compile error.
     */
    resources: (typeof resources)['en'];
    keySeparator: '.';
    nsSeparator: ':';
    pluralSeparator: '_';
    contextSeparator: '_';
    returnNull: false;
    returnObjects: false;
  }
}
