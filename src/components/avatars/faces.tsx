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

function panda({ stroke }: FaceProps): ReactNode {
  return (
    <>
      <circle cx={12.5} cy={13.5} r={5.4} fill={INK} />
      <circle cx={35.5} cy={13.5} r={5.4} fill={INK} />
      {/* Patches as ellipses tilted toward the nose - the one feature that
          makes a panda read as a panda rather than as a bear. */}
      <ellipse cx={17} cy={24} rx={4.6} ry={5.6} fill={INK} transform="rotate(-14 17 24)" />
      <ellipse cx={31} cy={24} rx={4.6} ry={5.6} fill={INK} transform="rotate(14 31 24)" />
      <circle cx={17.4} cy={23.6} r={1.9} fill={PAPER} />
      <circle cx={30.6} cy={23.6} r={1.9} fill={PAPER} />
      <ellipse cx={24} cy={31} rx={3} ry={2.2} fill={INK} />
      <path d="M24 33.2 L24 35" stroke={INK} strokeWidth={stroke} strokeLinecap="round" fill="none" />
    </>
  );
}

function frog({ stroke }: FaceProps): ReactNode {
  return (
    <>
      {/* Eyes ON the crown, half out of the face circle but still inside it -
          anything poking past r=19.2 is clipped by the rings at some sizes. */}
      <circle cx={16} cy={13.5} r={5.6} fill={PAPER} stroke={INK} strokeWidth={stroke} />
      <circle cx={32} cy={13.5} r={5.6} fill={PAPER} stroke={INK} strokeWidth={stroke} />
      <circle cx={16} cy={13.5} r={2.2} fill={INK} />
      <circle cx={32} cy={13.5} r={2.2} fill={INK} />
      <circle cx={19} cy={26} r={1.2} fill={INK} />
      <circle cx={29} cy={26} r={1.2} fill={INK} />
      <path d="M13 28 Q24 38 35 28" stroke={INK} strokeWidth={stroke} strokeLinecap="round" fill="none" />
    </>
  );
}

function koala({ stroke }: FaceProps): ReactNode {
  return (
    <>
      {/* Oversized round ears, the koala's whole silhouette. */}
      <circle cx={11} cy={19} r={7.4} fill={PAPER} stroke={INK} strokeWidth={stroke} />
      <circle cx={37} cy={19} r={7.4} fill={PAPER} stroke={INK} strokeWidth={stroke} />
      <Eyes cx={6} cy={24} r={1.9} />
      <ellipse cx={24} cy={31} rx={4.4} ry={5.4} fill={INK} />
      <path
        d="M18 37 Q24 39.5 30 37"
        stroke={INK}
        strokeWidth={stroke * 0.8}
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

function penguin({ stroke }: FaceProps): ReactNode {
  return (
    <>
      {/* The white face panel inside a dark head: inverted from every other
          face here, so the eyes sit on paper and keep their 16:1 either way. */}
      <path d="M24 5 A19.2 19.2 0 0 0 24 43.2 A19.2 19.2 0 0 0 24 5 Z" fill={INK} />
      <ellipse cx={24} cy={26} rx={10.5} ry={12} fill={PAPER} />
      <Eyes cx={4.6} cy={23} r={1.9} />
      <path d="M24 28 L19.5 31.5 L28.5 31.5 Z" fill={INK} />
      <path
        d="M20 34.5 Q24 36.5 28 34.5"
        stroke={INK}
        strokeWidth={stroke * 0.8}
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

function bunny({ stroke }: FaceProps): ReactNode {
  return (
    <>
      {/* Ears drawn as tall rounded slots rather than outlines: at 24px an
          outlined ear collapses into a smudge. */}
      <ellipse cx={18} cy={12} rx={3.1} ry={7.4} fill={INK} transform="rotate(-8 18 12)" />
      <ellipse cx={30} cy={12} rx={3.1} ry={7.4} fill={INK} transform="rotate(8 30 12)" />
      <ellipse cx={18} cy={12.5} rx={1.2} ry={4.4} fill={PAPER} transform="rotate(-8 18 12.5)" />
      <ellipse cx={30} cy={12.5} rx={1.2} ry={4.4} fill={PAPER} transform="rotate(8 30 12.5)" />
      <Eyes cx={6} cy={26} r={1.9} />
      <path d="M24 30 L21.6 32.2 L26.4 32.2 Z" fill={INK} />
      <path
        d="M24 32.2 L24 34 M24 34 Q21 35.6 19.5 34 M24 34 Q27 35.6 28.5 34"
        stroke={INK}
        strokeWidth={stroke * 0.8}
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

function sloth({ stroke }: FaceProps): ReactNode {
  return (
    <>
      {/*
        ONE continuous mask across both eyes, not two separate patches.
        The band IS the sloth - two patches read as a generic face with big
        eyes, which is what the first attempt drew and what a side-by-side
        render showed it to be.
      */}
      <path
        d="M9.5 21 Q24 15.5 38.5 21 Q39.5 29.5 33 31.5 Q27.5 32.5 24 28 Q20.5 32.5 15 31.5 Q8.5 29.5 9.5 21 Z"
        fill={INK}
      />
      <circle cx={16.5} cy={23.5} r={2.3} fill={PAPER} />
      <circle cx={31.5} cy={23.5} r={2.3} fill={PAPER} />
      <ellipse cx={24} cy={32} rx={2.5} ry={1.9} fill={INK} />
      <path d="M18 36.5 Q24 39 30 36.5" stroke={INK} strokeWidth={stroke} strokeLinecap="round" fill="none" />
    </>
  );
}

function whale({ stroke }: FaceProps): ReactNode {
  return (
    <>
      {/*
        SIDE-ON, not face-on. A whale seen head-on is a blob with two eyes,
        indistinguishable from half the other faces at 32px - and that is
        exactly how the first attempt rendered: as a smiley with a hair curl.
        Inverted like the penguin, so the eye is paper on ink and keeps its
        contrast without the palette having to care.
      */}
      <path
        d="M22 19 Q17.5 13 19.5 8.5"
        stroke={INK}
        strokeWidth={stroke * 0.85}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M22 19 Q26.5 13 24.5 8.5"
        stroke={INK}
        strokeWidth={stroke * 0.85}
        strokeLinecap="round"
        fill="none"
      />
      <ellipse cx={21.5} cy={28} rx={13} ry={8.2} fill={INK} />
      <path d="M33.5 28 L41.5 21.5 L41.5 34.5 Z" fill={INK} />
      <circle cx={14.5} cy={25.5} r={1.9} fill={PAPER} />
      <path
        d="M10 31 Q14.5 33.5 19 31.5"
        stroke={PAPER}
        strokeWidth={stroke * 0.8}
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

function hedgehog({ stroke }: FaceProps): ReactNode {
  return (
    <>
      {/* Spines as a fan of strokes along the crown, all inside r=19.2. */}
      <path
        d="M10 21 L6.5 16 M14 15.5 L12 9.5 M19 12 L18.5 5.8 M24 10.5 L25.5 4.6 M29 12 L31.5 6.5 M34 15.5 L37.5 10.5 M38 21 L42 17"
        stroke={INK}
        strokeWidth={stroke * 0.85}
        strokeLinecap="round"
        fill="none"
      />
      <Eyes cx={5.6} cy={26} r={1.8} />
      <circle cx={24} cy={33} r={2.4} fill={INK} />
    </>
  );
}

function otter({ stroke }: FaceProps): ReactNode {
  return (
    <>
      <circle cx={12.5} cy={15} r={4.2} fill={INK} />
      <circle cx={35.5} cy={15} r={4.2} fill={INK} />
      <Eyes cx={6.4} cy={23} r={2} />
      {/* A wide muzzle with whiskers: the otter's tell against the bear. */}
      <ellipse cx={24} cy={31} rx={7.6} ry={5} fill={PAPER} stroke={INK} strokeWidth={stroke * 0.8} />
      <ellipse cx={24} cy={28.6} rx={2.4} ry={1.7} fill={INK} />
      <path
        d="M8.5 29 L16.8 30 M8.5 33 L16.8 32 M39.5 29 L31.2 30 M39.5 33 L31.2 32"
        stroke={INK}
        strokeWidth={stroke * 0.6}
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

function duck({ stroke }: FaceProps): ReactNode {
  return (
    <>
      {/*
        The tuft is what settles it at 32px.
        A solid bill alone still reads as a wide smiling mouth once the
        nostrils stop resolving - checked side by side at both sizes - and one
        curl of head feather makes the whole face unambiguous.
      */}
      <path
        d="M24 13 Q22 8 25.5 6.5 Q28 6 27.5 9"
        stroke={INK}
        strokeWidth={stroke * 0.85}
        strokeLinecap="round"
        fill="none"
      />
      <Eyes cx={6.4} cy={20} r={2.1} />
      {/*
        A SOLID bill, not an outline, and flat-bottomed rather than crescent:
        outlined it collapses into a mouth, and a deep bottom curve is a smile.
      */}
      <path d="M11.5 26.5 Q24 21.5 36.5 26.5 Q36 31.5 24 33 Q12 31.5 11.5 26.5 Z" fill={INK} />
      <circle cx={18.5} cy={26.2} r={1} fill={PAPER} />
      <circle cx={29.5} cy={26.2} r={1} fill={PAPER} />
    </>
  );
}

function monkey({ stroke }: FaceProps): ReactNode {
  return (
    <>
      <circle cx={10.5} cy={22} r={5.6} fill={PAPER} stroke={INK} strokeWidth={stroke} />
      <circle cx={37.5} cy={22} r={5.6} fill={PAPER} stroke={INK} strokeWidth={stroke} />
      {/* The pale muzzle the eyes sit above: a monkey's face is two zones. */}
      <ellipse cx={24} cy={30} rx={9} ry={7} fill={PAPER} stroke={INK} strokeWidth={stroke * 0.8} />
      <Eyes cx={5.4} cy={21} r={1.9} />
      <path
        d="M21.6 28.5 L21.6 29.6 M26.4 28.5 L26.4 29.6"
        stroke={INK}
        strokeWidth={stroke * 0.8}
        strokeLinecap="round"
      />
      <path
        d="M20 32.5 Q24 35 28 32.5"
        stroke={INK}
        strokeWidth={stroke * 0.8}
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

function robot({ stroke }: FaceProps): ReactNode {
  return (
    <>
      {/* An antenna and a square head inside the round frame: the one
          non-animal, so it has to read as deliberate rather than as a
          malformed face. */}
      <path d="M24 12 L24 7" stroke={INK} strokeWidth={stroke} strokeLinecap="round" />
      <circle cx={24} cy={6} r={2.2} fill={INK} />
      <rect x={11} y={13} width={26} height={22} rx={5} fill={PAPER} stroke={INK} strokeWidth={stroke} />
      <rect x={16.5} y={20} width={5} height={5} rx={1.4} fill={INK} />
      <rect x={26.5} y={20} width={5} height={5} rx={1.4} fill={INK} />
      <path d="M18 29.5 L30 29.5" stroke={INK} strokeWidth={stroke} strokeLinecap="round" />
    </>
  );
}

/**
 * The fallback, kept although every key now has a drawing.
 *
 * An `AvatarKey` can arrive from an imported file written by a newer version,
 * and a missing face must render a person rather than nothing at all.
 */
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

export const FACES: Record<AvatarKey, (props: FaceProps) => ReactNode> = {
  fox,
  cat,
  panda,
  owl,
  frog,
  koala,
  penguin,
  bear,
  bunny,
  sloth,
  whale,
  hedgehog,
  otter,
  duck,
  monkey,
  robot,
};

export const FALLBACK_FACE = person;
