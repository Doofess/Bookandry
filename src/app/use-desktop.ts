import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a media query matches now, kept current.
 *
 * For what CSS cannot do: rendering one control instead of another. Layout
 * itself stays in CSS (container queries on main), never in this.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/** The desktop layout (§4.1): from lg, 1024px, where the rail starts. */
export function useDesktop(): boolean {
  return useMediaQuery('(min-width: 64rem)');
}
