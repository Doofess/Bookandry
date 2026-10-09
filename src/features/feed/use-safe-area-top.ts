import { useLayoutEffect, useState } from 'react';

/**
 * The top safe-area inset, in pixels, as the browser resolves it.
 *
 * `env()` cannot be read from script directly, so a hidden probe carries it as
 * padding and its computed style is read back. Zero on anything without a
 * notch, and wherever `env()` is not supported. Read again on resize, which is
 * what an orientation change fires.
 */
export function useSafeAreaTop(): number {
  const [inset, setInset] = useState(0);

  useLayoutEffect(() => {
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;top:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px)';
    document.body.append(probe);

    const measure = (): void => {
      const value = Number.parseFloat(window.getComputedStyle(probe).paddingTop); // money-allow: a CSS length in px
      setInset(Number.isNaN(value) ? 0 : value);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      probe.remove();
    };
  }, []);

  return inset;
}
