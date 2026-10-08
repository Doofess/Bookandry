import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadCatalog } from '@/data/card-catalog';
import { resolveCard, type ResolvedCard } from '@/data/card-catalog/resolve';
import type { PrimeView } from '@/domain/prime';
import { defaultFormValues, type TxFormValues } from '@/domain/tx-form';
import { initTestI18n, renderWithProviders } from '@/test/render';
import type { LocalDate } from '@/types/money';

import { RecurrenceFields, type CardDeals } from './recurrence-fields';

const PRIME: PrimeView = {
  primeRate: '4.75',
  boiRate: '3.25',
  source: { kind: 'built_in', asOf: '2026-10-04' as LocalDate },
};

/** A Max International card issued through Mizrahi-Tefahot (bank 20). */
let maxMizrahi: ResolvedCard;

beforeAll(async () => {
  await initTestI18n('en');
  maxMizrahi = resolveCard(await loadCatalog(), { issuer: 'max', bank: '20', tier: 'international' })!;
});

function values(over: Partial<TxFormValues> = {}): TxFormValues {
  return {
    ...defaultFormValues({ profileId: 'p1', currency: 'ILS', today: '2026-10-08' as LocalDate }),
    categoryId: 'cat.groceries',
    amount: '3000',
    ...over,
  };
}

function render(v: TxFormValues, card?: Partial<CardDeals>) {
  const onChange = vi.fn();
  const onOpenCard = vi.fn();
  const amountMinor = v.amount === '' ? undefined : Math.round(Number(v.amount)) * 100;
  renderWithProviders(
    <RecurrenceFields
      values={v}
      onChange={onChange}
      isExpense
      submitted={false}
      currency="ILS"
      amountMinor={amountMinor}
      errors={{}}
      prime={PRIME}
      {...(card === undefined
        ? {}
        : {
            card: {
              resolved: maxMizrahi,
              needRate: false,
              onOpenCard,
              abroad: false,
              shekelsMinor: amountMinor,
              offerDeferred: true,
              ...card,
            },
          })}
    />,
  );
  return { onChange, onOpenCard, user: userEvent.setup() };
}

const ils = (amount: string) => `⁦₪${amount}⁩`;

const choices = () => screen.getAllByRole('radio').map((r) => r.textContent);

describe('the purchase types on a card', () => {
  it('offers today’s types for a card not linked to the catalog', () => {
    render(values());
    expect(choices()).toEqual([
      'Regular transaction',
      'Installment transaction',
      'Credit installment',
      'Standing order',
      'Loan',
    ]);
  });

  it('offers a Max card through Mizrahi its own deals, קרדיט פלוס among them, under Max’s names', () => {
    render(values(), {});
    expect(choices()).toEqual([
      'Regular',
      'Installments',
      'Credit',
      'Credit Plus',
      '30 Plus',
      'Standing order',
      'Loan',
    ]);
  });

  it('gives no 30+ where a purchase cannot become one (an edit)', () => {
    render(values(), { offerDeferred: false });
    expect(choices()).not.toContain('30 Plus');
  });

  it('starts a קרדיט פלוס at 19 payments', async () => {
    const { onChange, user } = render(values(), {});
    await user.click(screen.getByRole('radio', { name: 'Credit Plus' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'long_credit', installmentCount: '19' }),
    );
  });

  it('keeps a type the card does not offer on screen while it is the one chosen', () => {
    render(values({ mode: 'long_credit', installmentCount: '24' }));
    expect(screen.getByRole('radio', { name: 'Long credit' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('a deal with no rate known', () => {
  it('asks for the card’s rate, and opens the card to give it', async () => {
    const { onOpenCard, user } = render(values({ mode: 'long_credit', installmentCount: '24' }), {
      needRate: true,
    });
    expect(screen.getByRole('alert')).toHaveTextContent("Enter this card's Credit Plus rate first.");
    await user.click(screen.getByRole('button', { name: 'Open the card' }));
    expect(onOpenCard).toHaveBeenCalledOnce();
  });

  it('says nothing while the rate is known', () => {
    render(values({ mode: 'long_credit', installmentCount: '24', annualRate: '15.5' }), {});
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open the card' })).toBeNull();
  });
});

describe('the deal’s rules', () => {
  it('warns about 19 payments under ₪950, and never blocks', () => {
    render(values({ mode: 'long_credit', amount: '900', installmentCount: '19', annualRate: '15.5' }), {});
    expect(screen.getByText(/Credit Plus on this card needs at least .*950\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Each payment must be at least .*50\.00/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns under 19 payments, and about a purchase abroad', () => {
    render(values({ mode: 'long_credit', amount: '3000', installmentCount: '18', annualRate: '15.5' }), {
      abroad: true,
    });
    expect(screen.getByText('Credit Plus on this card is 19 to 36 payments.')).toBeInTheDocument();
    expect(
      screen.getByText("Credit Plus isn't offered for purchases abroad on this card."),
    ).toBeInTheDocument();
  });

  it('checks no minimums while the amount is not known in shekels', () => {
    render(values({ mode: 'long_credit', amount: '900', installmentCount: '19', annualRate: '15.5' }), {
      shekelsMinor: undefined,
    });
    expect(screen.queryByText(/needs at least/)).toBeNull();
    expect(screen.queryByText(/Each payment/)).toBeNull();
  });

  it('says nothing for a deal inside its rules', () => {
    render(values({ mode: 'long_credit', amount: '3000', installmentCount: '24', annualRate: '15.5' }), {});
    expect(screen.queryByText(/on this card/)).toBeNull();
  });
});

describe('the schedule', () => {
  it('shows each payment, the interest and the מתואמת rate for a קרדיט', () => {
    render(values({ mode: 'credit', amount: '3000', installmentCount: '12', annualRate: '15.5' }), {});
    // Amounts are left-to-right islands (U+2066 … U+2069) inside the sentence.
    expect(screen.getByTestId('deal-schedule')).toHaveTextContent(
      `12 payments of ${ils('271.48')} · interest ${ils('257.76')} · 16.65% effective`,
    );
  });

  it('shows Max’s reset at payment 19, at today’s prime', () => {
    render(values({ mode: 'long_credit', amount: '3000', installmentCount: '24', annualRate: '15.5' }), {});
    const schedule = screen.getByTestId('deal-schedule');
    expect(schedule).toHaveTextContent(
      `24 payments of ${ils('146.17')} · interest ${ils('508.08')} · 16.65% effective`,
    );
    // At today's prime nothing has moved yet: the same payment, re-amortized.
    expect(schedule).toHaveTextContent(
      `Payments 1–18: ${ils('146.17')}. From payment 19: about ${ils('146.17')} at today's prime. It moves with any change in prime.`,
    );
  });

  it('says the reset only where the plan reaches payment 19', () => {
    render(values({ mode: 'long_credit', amount: '3000', installmentCount: '18', annualRate: '15.5' }), {});
    expect(screen.getByTestId('deal-schedule')).not.toHaveTextContent(/From payment 19/);
  });

  it('shows no schedule for an interest-free plan, nor on a card not linked', () => {
    render(values({ mode: 'long_credit', amount: '3000', installmentCount: '24', annualRate: '' }), {});
    expect(screen.queryByTestId('deal-schedule')).toBeNull();
  });

  it('keeps today’s preview on a card not linked', () => {
    render(values({ mode: 'credit', amount: '1200', installmentCount: '6', annualRate: '12' }));
    expect(screen.queryByTestId('deal-schedule')).toBeNull();
    expect(document.body).toHaveTextContent(/of which .* is interest/);
  });

  it('asks a 30+ purchase for its rate', () => {
    render(values({ mode: 'deferred', annualRate: '' }), {});
    expect(screen.getByLabelText('Annual interest')).toBeInTheDocument();
  });
});

describe('the type picker', () => {
  it('is a full 44px target for every choice', () => {
    render(values(), {});
    for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveClass('min-h-11');
  });
});

describe('in Hebrew', () => {
  afterAll(async () => {
    await initTestI18n('en');
  });

  it('names the deals as Max does, and says the rules in Hebrew', async () => {
    await initTestI18n('he');
    render(values({ mode: 'long_credit', amount: '900', installmentCount: '19', annualRate: '15.5' }), {});
    expect(choices().slice(0, 5)).toEqual(['רגילה', 'תשלומים', 'קרדיט', 'קרדיט פלוס', '30 פלוס']);
    expect(screen.getByText(/^בקרדיט פלוס בכרטיס הזה צריך לפחות .*950/)).toBeInTheDocument();
    expect(screen.getByTestId('deal-schedule')).toHaveTextContent(
      /^19 תשלומים של .* · ריבית .* · 16.65% מתואמת/,
    );
  });
});
