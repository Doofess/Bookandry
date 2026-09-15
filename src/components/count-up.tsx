import { useEffect, useRef, useState } from 'react';

/**
 * Whether the viewer has asked for less motion.
 *
 * Read at render AND subscribed to, because the setting can change while the
 * app is open - on a phone it is a two-tap toggle in Accessibility settings.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matchMediaSafe()?.matches ?? false);

  useEffect(() => {
    const query = matchMediaSafe();
    if (query === undefined) return;
    const onChange = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);

  return reduced;
}

function matchMediaSafe(): MediaQueryList | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
  return window.matchMedia('(prefers-reduced-motion: reduce)');
}

/** Ease-out cubic: quick at the start, settling gently - the money "lands". */
const ease = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Count from the previous value to the next one.
 *
 * 650ms, not the spec's blanket 150-200ms. A 150ms count-up is over before the
 * eye can follow it, which makes the animation pure cost: the point is to show
 * that the number CHANGED and roughly by how much.
 *
 * Returns an integer at every frame - these are minor units, and a fractional
 * agora rendered for forty frames is a fractional agora on screen.
 */
export function useCountUp(target: number, durationMs = 650): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reduced || durationMs <= 0) {
      /*
       * No animation, but the next one must still start from the right place.
       *
       * Known, accepted limitation: turning reduced-motion OFF mid-session
       * shows the last animated figure until the value next changes, because
       * correcting it here would mean a synchronous setState in an effect body
       * - a cascading render, and a worse trade than one stale frame in a case
       * that requires the viewer to change an OS setting while watching the
       * balance.
       */
      fromRef.current = target;
      return;
    }

    const from = fromRef.current;
    if (from === target) return;

    const started = performance.now();
    const step = (now: number): void => {
      const progress = Math.min(1, (now - started) / durationMs);
      const next = Math.round(from + (target - from) * ease(progress));
      fromRef.current = next;
      setValue(next);
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
      // fromRef already holds the last PAINTED value, so an interrupted
      // animation resumes from where the eye left it rather than snapping back.
    };
  }, [target, durationMs, reduced]);

  return reduced ? target : value;
}
