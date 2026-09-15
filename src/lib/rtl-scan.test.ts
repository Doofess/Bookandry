import { describe, expect, it } from 'vitest';

import { scanSource, splitVariants } from './rtl-scan';

/**
 * Proves gate:rtl actually FIRES. A gate that has never failed is
 * indistinguishable from a gate that cannot fail.
 */
describe('rtl scanner', () => {
  const VIOLATIONS = '<div className="ml-4 text-left rounded-l-md border-r pr-2 left-0" />';

  it('flags every physical-direction utility', () => {
    const tokens = scanSource('x.tsx', VIOLATIONS).map((h) => h.token);
    expect(tokens).toEqual(
      expect.arrayContaining(['ml-4', 'text-left', 'rounded-l-md', 'border-r', 'pr-2', 'left-0']),
    );
  });

  it('does not flag logical utilities', () => {
    const src = 'className="ms-4 pe-2 text-start start-0 end-0 border-s rounded-s-md"';
    expect(scanSource('x.tsx', src)).toHaveLength(0);
  });

  it('does not flag utilities that merely share a prefix', () => {
    // The regression that makes a gate useless: rounded-lg reading as rounded-l,
    // border-ring as border-r.
    const src = 'className="rounded-lg border-ring rounded-2xl origin-top text-nowrap"';
    expect(scanSource('x.tsx', src)).toHaveLength(0);
  });

  it('treats rtl:/ltr: and data-[side=] scoped utilities as intentional', () => {
    const src = 'className="rtl:-translate-x-2 ltr:ml-4 data-[side=left]:left-0"';
    expect(scanSource('x.tsx', src)).toHaveLength(0);
  });

  it('honours the rtl-allow escape hatch', () => {
    expect(scanSource('x.tsx', '<div className="ml-4" /> // rtl-allow: LTR-only chart axis')).toHaveLength(0);
  });

  it('flags physical properties in CSS', () => {
    expect(scanSource('a.css', '  margin-left: 4px;')).toHaveLength(1);
    expect(scanSource('a.css', '  margin-inline-start: 4px;')).toHaveLength(0);
  });

  it('splits variants at bracket depth zero', () => {
    expect(splitVariants("[&_svg:not([class*='size-'])]:size-4")).toEqual({
      variants: ["[&_svg:not([class*='size-'])]"],
      utility: 'size-4',
    });
    expect(splitVariants('hover:focus:ml-2')).toEqual({ variants: ['hover', 'focus'], utility: 'ml-2' });
  });

  it('reports the line number of each hit', () => {
    const hits = scanSource('x.tsx', ['ok', 'className="ml-2"', 'ok'].join('\n'));
    expect(hits).toHaveLength(1);
    expect(hits[0]?.line).toBe(2);
  });
});

describe('precision: the gate must not cry wolf', () => {
  it('ignores the words "left-to-right" and "right-to-left" in prose', () => {
    // It fired on exactly this, in the file documenting bidi handling. A gate
    // that reports false positives is a gate everyone learns to skip.
    const src = [
      '// Render the amount in a left-to-right island.',
      '/* CLDR injects a right-to-left mark before the symbol. */',
    ].join('\n');
    expect(scanSource('src/x.tsx', src)).toEqual([]);
  });

  it('still catches a real positional utility', () => {
    expect(scanSource('src/x.tsx', 'className="left-4"').map((h) => h.token)).toEqual(['left-4']);
    expect(scanSource('src/x.tsx', 'className="-right-2"').map((h) => h.token)).toEqual(['-right-2']);
    expect(scanSource('src/x.tsx', 'className="left-auto"').map((h) => h.token)).toEqual(['left-auto']);
    expect(scanSource('src/x.tsx', 'className="right-full"').map((h) => h.token)).toEqual(['right-full']);
    expect(scanSource('src/x.tsx', 'className="left-px"').map((h) => h.token)).toEqual(['left-px']);
    expect(scanSource('src/x.tsx', 'className="left-[3px]"').map((h) => h.token)).toEqual(['left-[3px]']);
    expect(scanSource('src/x.tsx', 'className="left-(--x)"').map((h) => h.token)).toEqual(['left-(--x)']);
  });

  it('still honours the rtl:/ltr: escape', () => {
    expect(scanSource('src/x.tsx', 'className="rtl:left-4"')).toEqual([]);
  });
});
