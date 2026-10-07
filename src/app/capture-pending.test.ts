import { beforeEach, describe, expect, it } from 'vitest';

import { capturePendingLinks } from './capture-pending';

const TOKEN = 'a'.repeat(64);
const INVITE = 'greenback.pendingInvite';
const WIPE = 'greenback.pendingWipe';

beforeEach(() => {
  sessionStorage.clear();
});

describe('capturePendingLinks', () => {
  it("keeps an invitation's token from /link", () => {
    capturePendingLinks({ pathname: '/link', search: `?t=${TOKEN}` });
    expect(sessionStorage.getItem(INVITE)).toBe(TOKEN);
    expect(sessionStorage.getItem(WIPE)).toBeNull();
  });

  it("keeps a delete request's token from /wipe, with or without a trailing slash", () => {
    capturePendingLinks({ pathname: '/wipe/', search: `?t=${TOKEN}` });
    expect(sessionStorage.getItem(WIPE)).toBe(TOKEN);
    expect(sessionStorage.getItem(INVITE)).toBeNull();
  });

  it('keeps no malformed token', () => {
    capturePendingLinks({ pathname: '/link', search: '?t=not-a-token' });
    capturePendingLinks({ pathname: '/wipe', search: `?t=${TOKEN.toUpperCase()}` });
    expect(sessionStorage.getItem(INVITE)).toBeNull();
    expect(sessionStorage.getItem(WIPE)).toBeNull();
  });

  it('keeps nothing from any other page, or without a token', () => {
    capturePendingLinks({ pathname: '/', search: `?t=${TOKEN}` });
    capturePendingLinks({ pathname: '/settings', search: `?t=${TOKEN}` });
    capturePendingLinks({ pathname: '/link', search: '' });
    expect(sessionStorage.length).toBe(0);
  });
});
