import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/* jsdom ships none of these, and Base UI portals and focus traps need them. */
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
}));

class NoopObserver {
  observe(): void {
    return undefined;
  }
  unobserve(): void {
    return undefined;
  }
  disconnect(): void {
    return undefined;
  }
  takeRecords(): [] {
    return [];
  }
}
vi.stubGlobal('ResizeObserver', NoopObserver);
vi.stubGlobal('IntersectionObserver', NoopObserver);

/*
 * Base UI Select/Popover/Menu call these during pointer interactions. The DOM
 * lib types declare them as always present, but jsdom does not implement them
 * at runtime - hence the runtime guard the type system insists is unnecessary.
 */
const proto = Element.prototype as unknown as Record<string, unknown>;
proto['hasPointerCapture'] ??= () => false;
proto['setPointerCapture'] ??= () => undefined;
proto['releasePointerCapture'] ??= () => undefined;
proto['scrollIntoView'] ??= () => undefined;

/* An un-stubbed network call must fail loudly, not silently return undefined. */
vi.stubGlobal(
  'fetch',
  vi.fn(() => {
    throw new Error('Un-stubbed network call in a unit test. Stub it explicitly.');
  }),
);

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
