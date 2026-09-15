import 'i18next';

import type { defaultNS, resources } from '@/i18n';

declare module 'i18next' {
  type CustomTypeOptions = {
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
  };
}
