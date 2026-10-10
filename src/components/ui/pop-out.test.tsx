import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initTestI18n, renderWithProviders } from '@/test/render';

import { Button } from './button';
import { PopOut, PopOutBody, PopOutContent, PopOutPreview, PopOutSteps } from './pop-out';

const STEPS = ['Company', 'Bank', 'Card', 'Name', 'Colour', 'Billing', 'Done'];

function Flow({ onStep = vi.fn() }: { readonly onStep?: (index: number) => void }) {
  return (
    <PopOut open>
      <PopOutContent>
        <PopOutSteps
          title="Add a card"
          subtitle="Seven questions"
          steps={STEPS}
          current={2}
          reached={2}
          onStep={onStep}
        />
        <PopOutBody
          title="Which card is it?"
          subtitle="As printed on it"
          heading="question"
          step={{ current: 2, total: 7 }}
          footer={
            <>
              <Button variant="pill">Back</Button>
              <Button variant="pill-solid">Next</Button>
            </>
          }
        >
          <label>
            Card name
            <input />
          </label>
        </PopOutBody>
        <PopOutPreview title="Your card" subtitle="As it will look">
          <p>Preview</p>
        </PopOutPreview>
      </PopOutContent>
    </PopOut>
  );
}

beforeAll(async () => {
  await initTestI18n('en');
});

describe('PopOut (§6.2)', () => {
  it('is named by the flow’s title, from its steps', async () => {
    renderWithProviders(<Flow />);
    expect(await screen.findByRole('dialog', { name: /^Add a card/ })).toHaveAttribute('data-slot', 'popout');
  });

  it('puts steps, body and preview straight inside the layout grid, for the container rules to place', async () => {
    renderWithProviders(<Flow />);
    const popout = await screen.findByRole('dialog');
    expect(popout).toHaveClass('@container/popout');
    const layout = popout.querySelector('[data-slot="popout-layout"]');
    expect([...(layout?.children ?? [])].map((child) => child.getAttribute('data-slot'))).toEqual([
      'popout-steps',
      'popout-body',
      'popout-preview',
    ]);
  });

  it('marks the current step, makes the reached ones buttons, and leaves the rest alone', async () => {
    const onStep = vi.fn();
    renderWithProviders(<Flow onStep={onStep} />);
    const current = await screen.findByText('Card');
    expect(current.closest('[aria-current="step"]')).not.toBeNull();

    await userEvent.setup().click(screen.getByRole('button', { name: /Bank/ }));
    expect(onStep).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('button', { name: /Billing/ })).not.toBeInTheDocument();
  });

  it('says where you are in words, with the segments as decoration', async () => {
    renderWithProviders(<Flow />);
    expect(await screen.findByText('Step 3 of 7')).toBeInTheDocument();
  });

  it('asks the question as a title pair, with the actions at the body’s foot', async () => {
    renderWithProviders(<Flow />);
    expect(await screen.findByRole('heading', { name: 'Which card is it? As printed on it' })).toHaveClass(
      'text-(length:--text-title-question)',
    );
    const actions = document.querySelector('[data-slot="popout-actions"]');
    expect(actions?.textContent).toBe('BackNext');
  });

  it('has a round × in the body and one in the preview: the layout shows the right one', async () => {
    renderWithProviders(<Flow />);
    await screen.findByRole('dialog');
    expect(document.querySelectorAll('[data-slot="popout-close"]')).toHaveLength(2);
  });

  it('keeps the answers when the number of panes changes: it is one popup', async () => {
    renderWithProviders(<Flow />);
    const user = userEvent.setup();
    const field = await screen.findByLabelText('Card name');
    await user.type(field, 'Max Gold');
    window.dispatchEvent(new Event('resize'));
    expect(screen.getByLabelText('Card name')).toBe(field);
    expect(field).toHaveValue('Max Gold');
  });

  it('moves only when motion is welcome', async () => {
    renderWithProviders(<Flow />);
    const popout = await screen.findByRole('dialog');
    // The movement utilities (translate-y-2...), not `transition-[opacity,translate]`, which only names the property.
    const movement = popout.className.split(/\s+/).filter((c) => /(^|:)-?translate-[xy]?-?\d/.test(c));
    expect(movement.length).toBeGreaterThan(0);
    for (const name of movement) {
      expect(name).toMatch(/motion-safe:/);
    }
  });

  it('caps a one-pane form at 36rem, and is named by its body', async () => {
    renderWithProviders(
      <PopOut open>
        <PopOutContent size="compact">
          <PopOutBody title="Split into payments">
            <p>form</p>
          </PopOutBody>
        </PopOutContent>
      </PopOut>,
    );
    const popout = await screen.findByRole('dialog', { name: 'Split into payments' });
    expect(popout).toHaveAttribute('data-size', 'compact');
    expect(popout).toHaveClass('sm:w-[min(36rem,100vw_-_4rem)]');
  });
});
