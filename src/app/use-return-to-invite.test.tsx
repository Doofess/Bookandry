import { renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const account = vi.hoisted(() => ({ view: { status: 'signed_in' } }));
vi.mock('./account', () => ({ useAccount: () => account.view }));

const { useReturnToInvite } = await import('./use-return-to-invite');

const TOKEN = 'b'.repeat(64);

const run = (path: string) =>
  renderHook(
    () => {
      useReturnToInvite();
      return useLocation().pathname;
    },
    {
      wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>,
    },
  );

beforeEach(() => {
  sessionStorage.clear();
});

describe('useReturnToInvite', () => {
  it('with both an invitation and a request waiting, lands on the invitation and stays', () => {
    sessionStorage.setItem('greenback.pendingInvite', TOKEN);
    sessionStorage.setItem('greenback.pendingWipe', TOKEN);
    expect(run('/').result.current).toBe('/link');
    expect(run('/wipe').result.current).toBe('/link');
    expect(run('/link').result.current).toBe('/link');
  });

  it('with only a request waiting, goes to it', () => {
    sessionStorage.setItem('greenback.pendingWipe', TOKEN);
    expect(run('/').result.current).toBe('/wipe');
  });

  it('with only a request waiting, stays when already on it', () => {
    sessionStorage.setItem('greenback.pendingWipe', TOKEN);
    expect(run('/wipe').result.current).toBe('/wipe');
  });

  it('with nothing waiting, stays put', () => {
    expect(run('/chart').result.current).toBe('/chart');
  });
});
