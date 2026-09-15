import type { ReactNode } from 'react';

import type { AvatarKey } from '@/types/domain';

/* A table of drawing functions, not components Fast Refresh can hot-swap:
   adding a face edits this map, which is a full reload either way. */
/* eslint-disable react-refresh/only-export-components */

/**
 * Avatar faces.
 *
 * Contrast here is STRUCTURAL, not a per-swatch calculation: the face mass is
 * always paper and the features are always ink, so every face measures ~16:1
 * whatever profile colour it is wearing. The colour lives in the ring, and the
 * ring sits inside a paper outer ring so it never has to contrast with an
 * unknown page background either.
 *
 * Without that split, each of the twelve palette colours would have to be
 * contrast-checked against the features drawn on it, and the palette would end
 * up constrained by the darkest swatch rather than by what looks good.
 *
 * Every feature is drawn INSIDE the face circle (r=20 at 24,24 in a 48 box):
 * ears poking outside would be clipped by the rings at some sizes and not
 * others.
 */

type FaceProps = { readonly stroke: number };

const INK = 'var(--avatar-ink)';
const PAPER = 'var(--avatar-paper)';

function Eyes({ cx = 6.5, cy = 22, r = 2.1 }: { cx?: number; cy?: number; r?: number }) {
  return (
    <>
      <circle cx={24 - cx} cy={cy} r={r} fill={INK} />
      <circle cx={24 + cx} cy={cy} r={r} fill={INK} />
    </>
  );
}

function fox({ stroke }: FaceProps): ReactNode {
  return (
    <>
      <path d="M13 17 L11.5 8.5 L19.5 13 Z" fill={INK} />
      <path d="M35 17 L36.5 8.5 L28.5 13 Z" fill={INK} />
      <Eyes cy={23} />
      <path d="M24 28 L21 31 L27 31 Z" fill={INK} />
      <path d={`M24 31 L24 33`} stroke={INK} strokeWidth={stroke} strokeLinecap="round" fill="none" />
      <path d="M18 35 Q24 38 30 35" stroke={INK} strokeWidth={stroke} strokeLinecap="round" fill="none" />
    </>
  );
}

function cat({ stroke }: FaceProps): ReactNode {
  return (
    <>
      <path d="M13.5 16 L12 8 L20 12.5 Z" fill={INK} />
      <path d="M34.5 16 L36 8 L28 12.5 Z" fill={INK} />
      <Eyes cy={24} />
      <path d="M24 29 L21.8 31.4 L26.2 31.4 Z" fill={INK} />
      <path
        d="M8 26 L15 27 M40 26 L33 27 M8 31 L15 30 M40 31 L33 30"
        stroke={INK}
        strokeWidth={stroke * 0.7}
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

function owl({ stroke }: FaceProps): ReactNode {
  return (
    <>
      <path d="M12 14 L14 8 L19 12 Z" fill={INK} />
      <path d="M36 14 L34 8 L29 12 Z" fill={INK} />
      <circle cx={17} cy={24} r={6.4} fill="none" stroke={INK} strokeWidth={stroke} />
      <circle cx={31} cy={24} r={6.4} fill="none" stroke={INK} strokeWidth={stroke} />
      <circle cx={17} cy={24} r={2.4} fill={INK} />
      <circle cx={31} cy={24} r={2.4} fill={INK} />
      <path d="M24 28.5 L21.4 32.5 L26.6 32.5 Z" fill={INK} />
    </>
  );
}

function bear({ stroke }: FaceProps): ReactNode {
  return (
    <>
      <circle cx={13} cy={14} r={5} fill={INK} />
      <circle cx={35} cy={14} r={5} fill={INK} />
      <circle cx={13} cy={14} r={2.1} fill={PAPER} />
      <circle cx={35} cy={14} r={2.1} fill={PAPER} />
      <Eyes cx={6} cy={23} r={1.9} />
      <ellipse cx={24} cy={31} rx={7} ry={5.2} fill="none" stroke={INK} strokeWidth={stroke} />
      <ellipse cx={24} cy={28.8} rx={2.6} ry={1.9} fill={INK} />
    </>
  );
}

/** Used for every key that has no drawing yet; the remaining 13 land in Phase 5. */
function person({ stroke }: FaceProps): ReactNode {
  return (
    <>
      <circle cx={24} cy={19} r={6.2} fill="none" stroke={INK} strokeWidth={stroke} />
      <path
        d="M13 37 Q13 27 24 27 Q35 27 35 37"
        fill="none"
        stroke={INK}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </>
  );
}

/**
 * A lookup table of drawing functions, which is not something Fast Refresh can
 * hot-swap - and does not need to be: adding a face changes this map, which is
 * a full reload either way.
 */

export const FACES: Partial<Record<AvatarKey, (props: FaceProps) => ReactNode>> = {
  fox,
  cat,
  owl,
  bear,
};

export const FALLBACK_FACE = person;
