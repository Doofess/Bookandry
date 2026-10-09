import { cn } from 'cn';
import { useEffect, useState } from 'react';

/**
 * Guilloche: the fine interlaced line-work engraved on banknotes, on the
 * front door's brand panel and, in a smaller set, on the brand panel of every
 * screen in the app - the app's mark is a banknote, and this is where it gets
 * to be one.
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

/*
 * The in-app panels are short and wide, so they get their own drawing: three
 * small ring sets centred near the top-left corner, clear of the title and the
 * figures. The caller mirrors it for right-to-left, which puts it in the
 * inline-start corner in both languages, as on the front door.
 */
const COMPACT_RINGS: readonly Ring[] = [
  { cx: 70, cy: 40, radius: 170, ripple: 10, waves: 40, copies: 4 },
  { cx: 70, cy: 40, radius: 120, ripple: 12, waves: 30, copies: 4 },
  { cx: 70, cy: 40, radius: 72, ripple: 8, waves: 18, copies: 3 },
];

type Variant = 'full' | 'compact' | 'bands';

type Drawing = {
  readonly width: number;
  readonly height: number;
  readonly align: string;
  readonly rings: readonly Ring[];
  readonly bands: readonly Band[];
};

const DRAWINGS: Record<Variant, Drawing> = {
  // The front door: the large rings and the bands along the foot.
  full: { width: 800, height: 1000, align: 'xMaxYMax slice', rings: RINGS, bands: BANDS },
  // A screen's panel.
  compact: { width: 800, height: 300, align: 'xMinYMin slice', rings: COMPACT_RINGS, bands: [] },
  // The desktop rail: the bands along its foot only.
  bands: { width: 800, height: 1000, align: 'xMaxYMax slice', rings: [], bands: BANDS },
};

/** Drawing coordinates to a tenth: plenty for a line, a third of the path data. */
const fixed = (n: number): string => String(Math.round(n * 10) / 10); // money-allow: drawing coordinates

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

function bandPath({ y, amplitude, wavelength }: Band, phase: number, width: number): string {
  const steps = Math.ceil((width / wavelength) * 16);
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const yy = y + amplitude * Math.sin((x / wavelength) * Math.PI * 2 + phase);
    d += `${i === 0 ? 'M' : 'L'}${fixed(x)} ${fixed(yy)}`;
  }
  return d;
}

const cache = new Map<Variant, readonly string[]>();

function paths(variant: Variant): readonly string[] {
  const hit = cache.get(variant);
  if (hit !== undefined) return hit;
  const { rings, bands, width } = DRAWINGS[variant];
  const made = [
    ...rings.flatMap((ring) =>
      Array.from({ length: ring.copies }, (_, k) => ringPath(ring, (k / ring.copies) * Math.PI * 2)),
    ),
    ...bands.flatMap((band) =>
      Array.from({ length: band.copies }, (_, k) => bandPath(band, (k / band.copies) * Math.PI * 2, width)),
    ),
  ];
  cache.set(variant, made);
  return made;
}

/**
 * How much larger than its drawing the panel shows it, kept on the element as
 * `--engrave-scale` for the stylesheet, which divides the line width by it and
 * multiplies the draw-in time by it: hairlines of one screen pixel drawn at
 * one pace on any panel. That is what `vector-effect: non-scaling-stroke` was
 * for, but with it Chrome measures the draw-in dash in unscaled units, so on a
 * panel larger than the drawing every line stopped short of its end.
 */
function scaleFollower(width: number, height: number) {
  return (svg: SVGSVGElement | null): (() => void) | undefined => {
    if (svg === null || !('ResizeObserver' in window)) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const box = entry.contentRect;
      // `slice`: the drawing is scaled until it covers the panel both ways.
      const scale = Math.max(box.width / width, box.height / height);
      if (scale > 0) svg.style.setProperty('--engrave-scale', String(scale));
    });
    observer.observe(svg);
    return () => {
      observer.disconnect();
    };
  };
}

const FOLLOWERS: Record<Variant, ReturnType<typeof scaleFollower>> = {
  full: scaleFollower(DRAWINGS.full.width, DRAWINGS.full.height),
  compact: scaleFollower(DRAWINGS.compact.width, DRAWINGS.compact.height),
  bands: scaleFollower(DRAWINGS.bands.width, DRAWINGS.bands.height),
};

/**
 * Whether the guilloche has been drawn in since the app started. It is drawn
 * once, on the first screen that shows a panel; navigating afterwards mounts
 * panels that are drawn already, so the motion never replays.
 */
let drawnSinceStart = false;

export function Engraving({
  className,
  variant = 'full',
}: {
  readonly className?: string;
  readonly variant?: Variant;
}) {
  // Read once, on the first render. Set in an effect, not here: StrictMode
  // calls this initializer twice, and every panel of the first commit (the
  // rail and the screen's panel) must draw in together.
  const [drawIn] = useState(() => !drawnSinceStart);
  useEffect(() => {
    drawnSinceStart = true;
  }, []);

  const drawing = DRAWINGS[variant];
  return (
    <svg
      ref={FOLLOWERS[variant]}
      viewBox={`0 0 ${String(drawing.width)} ${String(drawing.height)}`}
      preserveAspectRatio={drawing.align}
      aria-hidden="true"
      focusable="false"
      className={cn('engraving pointer-events-none', !drawIn && 'engraving-drawn', className)}
    >
      <g fill="none" stroke="currentColor">
        {paths(variant).map((d, i) => (
          <path
            key={i}
            d={d}
            pathLength={1}
            style={drawIn ? { animationDelay: `${String(i * 45)}ms` } : undefined}
          />
        ))}
      </g>
    </svg>
  );
}
