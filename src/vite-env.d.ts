/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/*
 * Build-time configuration. Public values only - see
 * src/services/supabase/client.ts for why no secret may ever appear here.
 *
 * `interface`, not `type`: these MERGE with Vite's own declarations of the
 * same names, which a type alias cannot do.
 */
/* eslint-disable @typescript-eslint/consistent-type-definitions */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
