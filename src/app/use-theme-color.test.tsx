import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { useThemeColor } from './use-theme-color';

function Probe() {
  useThemeColor();
  return null;
}

let meta: HTMLMetaElement;
let top: HTMLDivElement;

beforeEach(() => {
  meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#F6F2EA';
  document.head.append(meta);
  top = document.createElement('div');
  document.body.append(top);
  // jsdom lays nothing out: say what is at the top of the screen.
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => top });
});

afterEach(() => {
  meta.remove();
  top.remove();
  document.documentElement.classList.remove('dark');
  Reflect.deleteProperty(document, 'elementFromPoint');
});

describe('useThemeColor (§3)', () => {
  it('paints the status bar with whatever sheet reaches the top of the screen', async () => {
    top.style.backgroundColor = 'rgb(26, 21, 16)';
    renderWithProviders(<Probe />);
    await waitFor(() => {
      expect(meta.content).toBe('#1A1510');
    });
  });

  it('follows a theme change at once, without a route change (Review Focus)', async () => {
    top.style.backgroundColor = 'rgb(26, 21, 16)';
    renderWithProviders(<Probe />);
    await waitFor(() => {
      expect(meta.content).toBe('#1A1510');
    });

    top.style.backgroundColor = 'rgb(246, 242, 234)';
    document.documentElement.classList.add('dark');
    await waitFor(() => {
      expect(meta.content).toBe('#F6F2EA');
    });
  });

  it('leaves the status bar alone when nothing at the top has a colour', async () => {
    renderWithProviders(<Probe />);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(meta.content).toBe('#F6F2EA');
  });
});
