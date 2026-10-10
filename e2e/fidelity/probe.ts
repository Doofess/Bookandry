export type Origin = { readonly x: number; readonly y: number };

export type ProbeProp =
  | 'width'
  | 'height'
  | 'x'
  | 'y'
  | 'fontSize'
  | 'radius'
  | 'columns'
  | 'columnGap'
  | 'paddingBlockStart'
  | 'paddingInlineStart'
  | 'overflowBottom'
  | 'rotate'
  | 'gapBelow';

export type Probe = { readonly selector: string; readonly prop: ProbeProp; readonly index?: number };

/** One measurement of the `index`-th visible match, or null when there is none. */
export function readProbe({ probe, origin }: { probe: Probe; origin: Origin }): number | null {
  const visible = (el: Element) =>
    el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const el = [...document.querySelectorAll(probe.selector)].filter(visible)[probe.index ?? 0];
  if (el === undefined) return null;
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  const px = (value: string) => Number.parseFloat(value);
  switch (probe.prop) {
    case 'width':
      return r.width;
    case 'height':
      return r.height;
    case 'x':
      return r.left + window.scrollX - origin.x;
    case 'y':
      return r.top + window.scrollY - origin.y;
    case 'fontSize':
      return px(s.fontSize);
    case 'radius':
      return px(s.borderStartStartRadius);
    case 'columns':
      return s.gridTemplateColumns === 'none'
        ? 1
        : s.gridTemplateColumns.split(' ').filter((t) => t !== '').length;
    case 'columnGap':
      return px(s.columnGap);
    case 'paddingBlockStart':
      return px(s.paddingBlockStart);
    case 'paddingInlineStart':
      return px(s.paddingInlineStart);
    case 'rotate':
      return s.rotate === 'none' ? 0 : px(s.rotate);
    case 'overflowBottom': {
      const sheet = el.closest('[data-sheet], .sheet');
      return sheet === null ? null : r.bottom - sheet.getBoundingClientRect().bottom;
    }
    case 'gapBelow': {
      // The nearest sheet below this one that overlaps it sideways (not inside it).
      const gaps = [...document.querySelectorAll('[data-sheet], .sheet')]
        .filter((other) => other !== el && !el.contains(other) && !other.contains(el) && visible(other))
        .map((other) => other.getBoundingClientRect())
        .filter((o) => o.top >= r.bottom - 1 && o.left < r.right && o.right > r.left)
        .map((o) => o.top - r.bottom);
      return gaps.length === 0 ? null : Math.min(...gaps);
    }
  }
}

/** How many of each kind are visible inside `scope`, with their top within `height` of the origin. */
export function countKinds({
  kinds,
  scope,
  scopeIndex,
  origin,
  height,
}: {
  kinds: Record<string, string>;
  scope: string;
  scopeIndex: number;
  origin: Origin;
  height: number;
}): Record<string, number> {
  const root = document.querySelectorAll(scope)[scopeIndex] ?? document.body;
  const counts: Record<string, number> = {};
  for (const [kind, selector] of Object.entries(kinds)) {
    const found = [...root.querySelectorAll(selector)];
    if (root.matches(selector)) found.push(root);
    counts[kind] = found.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') return false;
      const top = r.top + window.scrollY - origin.y;
      return top > -1 && top < height;
    }).length;
  }
  return counts;
}
