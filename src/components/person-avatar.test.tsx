import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

const ME = '00000000-0000-4000-8000-00000000000a';
const PARTNER = '00000000-0000-4000-8000-00000000000b';
const GOOGLE = 'https://lh3.googleusercontent.com/a/partner=s96-c';

vi.mock('@/app/account', () => ({
  useAccount: () => ({
    status: 'signed_in',
    user: { id: ME },
    household: {
      id: 'h',
      invites: [],
      members: [
        { userId: ME, role: 'owner', displayName: 'Dana', avatarVersion: 0 },
        { userId: PARTNER, role: 'member', displayName: 'Yossi', avatarVersion: 0, pictureUrl: GOOGLE },
      ],
    },
  }),
}));
vi.mock('@/app/account-avatar', () => ({
  useAccountAvatar: () => ({ src: undefined, own: false }),
  initialsOf: (name: string) => name.slice(0, 1),
}));

const { PersonAvatar } = await import('./person-avatar');

describe('PersonAvatar', () => {
  it("shows a linked member's Google picture when they uploaded none, and initials for someone without", () => {
    renderWithProviders(
      <>
        <PersonAvatar person={{ id: PARTNER, name: 'Yossi', color: '#0369a1' }} label="Yossi" />
        <PersonAvatar person={{ id: 'before', name: 'Noa', color: '#16794a' }} label="Noa" />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Yossi' }).querySelector('img')?.getAttribute('src')).toBe(GOOGLE);
    expect(screen.getByRole('img', { name: 'Noa' }).querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Noa' })).toHaveTextContent('N');
  });
});
