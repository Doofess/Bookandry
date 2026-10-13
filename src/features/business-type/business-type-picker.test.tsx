import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { BusinessTypeField } from './business-type-picker';

/** Each pop-out mounts all 981 types, and the whole suite runs in parallel: more than the default 5s. */
const SLOW = 20_000;

function Harness({ label = 'Business type' }: { readonly label?: string }) {
  const [value, setValue] = useState('');
  return (
    <>
      <span id="label">{label}</span>
      <BusinessTypeField value={value} onChange={setValue} labelledBy="label" />
      <output data-testid="value">{value}</output>
    </>
  );
}

beforeEach(() => {
  // The list (cmdk) measures itself; jsdom has nothing to measure with.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});

describe('the business type field, in English', () => {
  beforeAll(async () => {
    await initTestI18n('en');
  });

  it(
    'says "Not set", finds a type by name or code in a named pop-out, and clears it',
    async () => {
      const user = userEvent.setup();
      renderWithProviders(<Harness />);
      const field = await screen.findByRole('button', { name: 'Business type Not set' });

      await user.click(field);
      const popout = await screen.findByRole('dialog', { name: 'Business type' });
      await user.click(within(popout).getByPlaceholderText('Search by name or code'));
      await user.paste('restaurant');
      await user.click(within(popout).getByRole('option', { name: /^Restaurant/ }));
      expect(screen.getByTestId('value')).toHaveTextContent('5812');
      expect(screen.getByRole('button', { name: 'Business type Restaurant' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Business type Restaurant' }));
      const again = await screen.findByRole('dialog', { name: 'Business type' });
      await user.click(within(again).getByPlaceholderText('Search by name or code'));
      await user.paste('0742');
      expect(within(again).getAllByRole('option')).toHaveLength(1);
      await user.click(within(again).getByRole('button', { name: 'Clear' }));
      expect(screen.getByTestId('value')).toBeEmptyDOMElement();
    },
    SLOW,
  );

  it(
    'says so when nothing matches',
    async () => {
      const user = userEvent.setup();
      renderWithProviders(<Harness />);
      await user.click(await screen.findByRole('button', { name: 'Business type Not set' }));
      const popout = await screen.findByRole('dialog', { name: 'Business type' });
      await user.type(within(popout).getByPlaceholderText('Search by name or code'), 'zzzz');
      expect(within(popout).getByText('No business type matches.')).toBeInTheDocument();
    },
    SLOW,
  );
});

describe('the business type field, in Hebrew', () => {
  beforeAll(async () => {
    await initTestI18n('he');
  });
  afterAll(async () => {
    await initTestI18n('en');
  });

  it(
    'names types in Hebrew and finds them typed with or without final letters',
    async () => {
      const user = userEvent.setup();
      renderWithProviders(<Harness label="סוג עסק" />);
      await user.click(await screen.findByRole('button', { name: 'סוג עסק לא נקבע' }));
      const popout = await screen.findByRole('dialog', { name: 'סוג עסק' });
      await user.type(within(popout).getByPlaceholderText('חיפוש לפי שם או קוד'), 'מרכולימ');
      await user.click(within(popout).getByRole('option', { name: /^מרכולים וסופרמרקטים/ }));
      expect(screen.getByTestId('value')).toHaveTextContent('5411');
    },
    SLOW,
  );
});
