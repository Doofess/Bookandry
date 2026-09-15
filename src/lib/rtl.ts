/**
 * The RTL work shadcn's `rtl: true` transform does NOT do.
 *
 * Verified against shadcn 4.21 / base-nova:
 *   - It rewrites physical utilities to logical ones and fixes the Switch
 *     translate-x bug. Both confirmed in the generated source.
 *   - It does NOT flip icons: the rewrite is driven by an explicit
 *     `cn-rtl-flip` marker class, not by icon name.
 *   - It does NOT make `side` logical. `RTL_SIDE_PROP_COMPONENTS` covers only
 *     ContextMenu variants, so Sheet/Popover/DropdownMenu/Tooltip keep a
 *     physical `side` that we must compute ourselves.
 *
 * Centralised here so the computation is written once and tested, rather than
 * re-derived (and got wrong) at each call site.
 */

export type Direction = 'ltr' | 'rtl';
export type PhysicalSide = 'top' | 'right' | 'bottom' | 'left';

/**
 * The inline-end edge. §7 requires the Add/Edit sheet to open from inline-end:
 * physically right in LTR, physically left in RTL.
 */
export function inlineEnd(dir: Direction): PhysicalSide {
  return dir === 'rtl' ? 'left' : 'right';
}

export function inlineStart(dir: Direction): PhysicalSide {
  return dir === 'rtl' ? 'right' : 'left';
}

/** Mirrors a physical side; vertical sides are unaffected by direction. */
export function mirrorSide(side: PhysicalSide, dir: Direction): PhysicalSide {
  if (dir === 'ltr' || side === 'top' || side === 'bottom') return side;
  return side === 'left' ? 'right' : 'left';
}

/**
 * Sonner's corner position is NOT logical - `bottom-right` stays bottom-right
 * regardless of `dir`, so it has to be computed.
 */
export function toastPosition(dir: Direction): 'bottom-left' | 'bottom-right' | 'bottom-center' {
  return dir === 'rtl' ? 'bottom-left' : 'bottom-right';
}

/**
 * Icons that encode READING DIRECTION and must mirror in RTL.
 *
 * The spec proposed `rtl:-scale-x-100` applied broadly; both halves are wrong.
 * Mirroring flips any embedded glyph content, and shadcn's own convention is
 * `rtl:rotate-180`. More importantly it needs an allowlist:
 *   - ChevronDown / Plus / Check / AlertTriangle are NON-directional.
 *   - TrendingUp / TrendingDown encode MEANING by slope. A mirrored trend line
 *     reads as the opposite trend - actively wrong in a finance app.
 */
export const DIRECTIONAL_ICONS = new Set([
  'ChevronLeft',
  'ChevronRight',
  'ChevronsLeft',
  'ChevronsRight',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeftRight',
  'MoveLeft',
  'MoveRight',
  'CornerDownLeft',
  'CornerDownRight',
  'Undo2',
  'Redo2',
  'LogOut',
  'LogIn',
]);

/** Icons that must NEVER be flipped, listed so the intent is explicit and testable. */
export const NON_DIRECTIONAL_ICONS = new Set([
  'ChevronDown',
  'ChevronUp',
  'Plus',
  'Minus',
  'Check',
  'X',
  'AlertTriangle',
  'TrendingUp',
  'TrendingDown',
  'Search',
  'Settings',
]);

/** Class for an icon that should mirror with reading direction. */
export function iconFlipClass(iconName: string): string {
  return DIRECTIONAL_ICONS.has(iconName) ? 'rtl:rotate-180' : '';
}
