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

/**
 * The bands are a strip of their own along the panel's foot, drawn at a fixed
 * height and wide enough for any screen, so they always reach both edges and
 * never climb into the text above them however the panel is proportioned. The
 * last one is centred on the strip's bottom edge and runs off the page, like a
 * note's border.
 */
const BANDS: readonly Band[] = [
  { y: 14, amplitude: 14, wavelength: 140, copies: 6 },
  { y: 42, amplitude: 7, wavelength: 70, copies: 4 },
  { y: 72, amplitude: 14, wavelength: 140, copies: 6 },
];

const WIDTH = 800;
const HEIGHT = 1000;
const STRIP_WIDTH = 2400;
const STRIP_HEIGHT = 72;

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
  const steps = Math.ceil((STRIP_WIDTH / wavelength) * 16);
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * STRIP_WIDTH;
    const yy = y + amplitude * Math.sin((x / wavelength) * Math.PI * 2 + phase);
    d += `${i === 0 ? 'M' : 'L'}${fixed(x)} ${fixed(yy)}`;
  }
  return d;
}

let cache: { readonly rings: readonly string[]; readonly bands: readonly string[] } | undefined;

function paths() {
  cache ??= {
    rings: RINGS.flatMap((ring) =>
      Array.from({ length: ring.copies }, (_, k) => ringPath(ring, (k / ring.copies) * Math.PI * 2)),
    ),
    bands: BANDS.flatMap((band) =>
      Array.from({ length: band.copies }, (_, k) => bandPath(band, (k / band.copies) * Math.PI * 2)),
    ),
  };
  return cache;
}

/**
 * Each line draws itself in once, staggered. The stroke scales with the
 * drawing rather than using `vector-effect: non-scaling-stroke`: with that set,
 * Chrome measures the dash in unscaled units, so on a panel drawn larger than
 * its viewBox every line stopped short of its end.
 */
function Lines({ paths: ds, from }: { readonly paths: readonly string[]; readonly from: number }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1}>
      {ds.map((d, i) => (
        <path key={i} d={d} pathLength={1} style={{ animationDelay: `${String((from + i) * 45)}ms` }} />
      ))}
    </g>
  );
}

/** The rings fill the panel from its top corner; the bands sit along its foot. */
export function Engraving({ className }: { readonly className?: string }) {
  const { rings, bands } = paths();
  return (
    <div aria-hidden="true" className={cn('engraving pointer-events-none', className)}>
      <svg
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        preserveAspectRatio="xMaxYMax slice"
        focusable="false"
        className="absolute inset-0 size-full"
      >
        <Lines paths={rings} from={0} />
      </svg>
      <svg
        viewBox={`0 0 ${String(STRIP_WIDTH)} ${String(STRIP_HEIGHT)}`}
        preserveAspectRatio="xMinYMax slice"
        focusable="false"
        className="absolute inset-x-0 bottom-0 h-9 w-full lg:h-18"
      >
        <Lines paths={bands} from={rings.length} />
      </svg>
    </div>
  );
}
