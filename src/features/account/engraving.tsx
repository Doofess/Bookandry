import { cn } from 'cn';

/**
 * Guilloche: the fine interlaced line-work engraved on banknotes, here on the
 * front door's brand panel - the app's mark is a banknote, and this is the
 * one place it gets room to be one.
 *
 * Generated, not drawn: each ring is a circle whose radius ripples `waves`
 * times around, repeated a few times a fraction of a ripple apart so the
 * copies cross and weave; the bands along the foot are sine ribbons doing the
 * same. Computed once, on first use, from fixed numbers - the same pattern
 * every time, in every language (mirrored for right-to-left by the caller).
 *
 * Decorative only: hidden from assistive technology.
 */

type Ring = { cx: number; cy: number; radius: number; ripple: number; waves: number; copies: number };

const RINGS: readonly Ring[] = [
  { cx: 640, cy: 230, radius: 300, ripple: 16, waves: 54, copies: 5 },
  { cx: 640, cy: 230, radius: 230, ripple: 22, waves: 40, copies: 5 },
  { cx: 640, cy: 230, radius: 160, ripple: 14, waves: 30, copies: 4 },
  { cx: 640, cy: 230, radius: 96, ripple: 10, waves: 18, copies: 3 },
];

type Band = { y: number; amplitude: number; wavelength: number; copies: number };

// Low on the foot: on wide panels the drawing is scaled up from its bottom
// edge, and the bands must stay clear of the headline above them.
const BANDS: readonly Band[] = [
  { y: 964, amplitude: 14, wavelength: 140, copies: 6 },
  { y: 990, amplitude: 7, wavelength: 70, copies: 4 },
];

const WIDTH = 800;
const HEIGHT = 1000;

/** Drawing coordinates to a tenth: plenty for a line, a third of the path data. */
const fixed = (n: number): string => String(Math.round(n * 10) / 10);

function ringPath({ cx, cy, radius, ripple, waves }: Ring, phase: number): string {
  // Enough points that every ripple stays a curve, not a zigzag.
  const steps = waves * 10;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = radius + ripple * Math.cos(waves * t + phase);
    d += `${i === 0 ? 'M' : 'L'}${fixed(cx + r * Math.cos(t))} ${fixed(cy + r * Math.sin(t))}`;
  }
  return `${d}Z`;
}

function bandPath({ y, amplitude, wavelength }: Band, phase: number): string {
  const steps = Math.ceil((WIDTH / wavelength) * 16);
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * WIDTH;
    const yy = y + amplitude * Math.sin((x / wavelength) * Math.PI * 2 + phase);
    d += `${i === 0 ? 'M' : 'L'}${fixed(x)} ${fixed(yy)}`;
  }
  return d;
}

let cache: readonly string[] | undefined;

function paths(): readonly string[] {
  cache ??= [
    ...RINGS.flatMap((ring) =>
      Array.from({ length: ring.copies }, (_, k) => ringPath(ring, (k / ring.copies) * Math.PI * 2)),
    ),
    ...BANDS.flatMap((band) =>
      Array.from({ length: band.copies }, (_, k) => bandPath(band, (k / band.copies) * Math.PI * 2)),
    ),
  ];
  return cache;
}

/**
 * How much larger than its drawing the panel shows it, kept on the element as
 * `--engrave-scale` for the stylesheet, which divides the line width by it and
 * multiplies the draw-in time by it: hairlines of one screen pixel drawn at
 * one pace on any panel. That is what `vector-effect: non-scaling-stroke` was
 * for, but with it Chrome measures the draw-in dash in unscaled units, so on a
 * panel larger than the drawing every line stopped short of its end.
 */
function followScale(svg: SVGSVGElement | null): (() => void) | undefined {
  if (svg === null || !('ResizeObserver' in window)) return undefined;
  const observer = new ResizeObserver(([entry]) => {
    if (entry === undefined) return;
    const { width, height } = entry.contentRect;
    // `slice`: the drawing is scaled until it covers the panel both ways.
    const scale = Math.max(width / WIDTH, height / HEIGHT);
    if (scale > 0) svg.style.setProperty('--engrave-scale', String(scale));
  });
  observer.observe(svg);
  return () => {
    observer.disconnect();
  };
}

export function Engraving({ className }: { readonly className?: string }) {
  return (
    <svg
      ref={followScale}
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      preserveAspectRatio="xMaxYMax slice"
      aria-hidden="true"
      focusable="false"
      className={cn('engraving pointer-events-none', className)}
    >
      <g fill="none" stroke="currentColor">
        {paths().map((d, i) => (
          <path key={i} d={d} pathLength={1} style={{ animationDelay: `${String(i * 45)}ms` }} />
        ))}
      </g>
    </svg>
  );
}
