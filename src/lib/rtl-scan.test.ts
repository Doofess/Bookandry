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
