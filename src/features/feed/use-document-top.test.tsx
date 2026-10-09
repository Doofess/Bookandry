import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDocumentTop } from './use-document-top';

/** A ResizeObserver whose callbacks the test fires by hand. */
class ManualObserver {
  static instances: ManualObserver[] = [];
  readonly observed: Element[] = [];
  constructor(private readonly callback: () => void) {
    ManualObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.observed.push(target);
  }
  unobserve(): void {
    return undefined;
  }
  disconnect(): void {
    return undefined;
  }
  fire(): void {
    this.callback();
  }
}

let top = 400;

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  const value = useDocumentTop(ref);
  return (
    <div
      ref={(el) => {
        ref.current = el;
        if (el === null) return;
        // The two answers disagree on purpose: the list sits inside the
        // panel's sheet, which is `relative`, so `offsetTop` is measured from
        // the sheet (60px) while the list is 400px down the document.
        Object.defineProperty(el, 'offsetTop', { configurable: true, get: () => 60 });
        el.getBoundingClientRect = () => ({ top }) as DOMRect;
      }}
      data-testid="probe"
      data-top={value}
    />
  );
}

afterEach(() => {
  ManualObserver.instances = [];
  top = 400;
  vi.unstubAllGlobals();
});

describe('useDocumentTop', () => {
  it('measures from the document, not from the nearest positioned parent', () => {
    vi.stubGlobal('ResizeObserver', ManualObserver);
    vi.stubGlobal('scrollY', 50);

    const { getByTestId } = render(<Probe />);

    expect(getByTestId('probe')).toHaveAttribute('data-top', '450');
  });

  it('measures again whenever the page above it changes size', () => {
    vi.stubGlobal('ResizeObserver', ManualObserver);
    vi.stubGlobal('scrollY', 0);

    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe')).toHaveAttribute('data-top', '400');

    // The balance's skeleton resolves and the panel grows 8px.
    top = 408;
    const observer = ManualObserver.instances.at(-1);
    expect(observer?.observed).toContain(document.body);
    act(() => {
      observer?.fire();
    });

    expect(getByTestId('probe')).toHaveAttribute('data-top', '408');
  });
});
