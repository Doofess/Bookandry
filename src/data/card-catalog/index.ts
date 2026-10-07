import type { Catalog } from './types';

export const CATALOG_VERSION = 1;

let loading: Promise<Catalog> | undefined;

/**
 * The card catalog, fetched on first use. The only way in: a static import
 * would put every card company's and bank's table in the main chunk.
 */
export function loadCatalog(): Promise<Catalog> {
  if (!loading) {
    const attempt = Promise.all([import('./issuers'), import('./banks')]).then(([i, b]): Catalog => ({
      version: CATALOG_VERSION,
      issuers: i.issuers,
      banks: b.banks,
    }));
    loading = attempt;
    attempt.catch(() => {
      if (loading === attempt) loading = undefined; // a failed fetch must not stick
    });
  }
  return loading;
}
