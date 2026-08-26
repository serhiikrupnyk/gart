import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClientSubscription, PublicSubscription } from '@gart/shared';

import SubscriptionsPage from '@/app/(app)/dashboard/subscriptions/page';
import ClientPaymentsPage from '@/app/client/payments/page';
import { ToastProvider } from '@/components/ui';

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  ApiError: class extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
}));

function subscription(overrides: Partial<PublicSubscription> = {}): PublicSubscription {
  return {
    id: 'sub1',
    clientId: 'c1',
    clientName: 'Марія Бондаренко',
    productId: 'p1',
    productName: 'Місячний супровід',
    price: { amount: '900.00', currency: 'UAH' },
    period: 'MONTHLY',
    status: 'ACTIVE',
    currentPeriodEnd: '2026-09-25T09:00:00.000Z',
    accessUntil: '2026-09-25T09:00:00.000Z',
    nextChargeAt: '2026-09-25T09:00:00.000Z',
    failedAttempts: 0,
    cancelledBy: null,
    isActive: true,
    ...overrides,
  };
}

function clientSubscription(overrides: Partial<ClientSubscription> = {}): ClientSubscription {
  return {
    id: 'sub1',
    productName: 'Місячний супровід',
    price: { amount: '900.00', currency: 'UAH' },
    period: 'MONTHLY',
    status: 'ACTIVE',
    nextChargeAt: '2026-09-25T09:00:00.000Z',
    accessUntil: '2026-09-25T09:00:00.000Z',
    failedAttempts: 0,
    isActive: true,
    canReactivate: false,
    ...overrides,
  };
}

function renderTrainer() {
  return render(
    <ToastProvider>
      <SubscriptionsPage />
    </ToastProvider>,
  );
}

function renderClient() {
  return render(
    <ToastProvider>
      <ClientPaymentsPage />
    </ToastProvider>,
  );
}

/** The client screen loads purchases and subscriptions together. */
function clientLoads(subscriptions: ClientSubscription[]): void {
  apiFetch.mockResolvedValueOnce({ payments: [], entitlements: [] });
  apiFetch.mockResolvedValueOnce(subscriptions);
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe('the trainer subscriptions table', () => {
  it('shows the price, the cadence and when the next charge lands', async () => {
    apiFetch.mockResolvedValueOnce([subscription()]);

    renderTrainer();

    const row = await screen.findByRole('row', { name: /Марія Бондаренко/ });

    // Non-breaking space before the symbol, as formatMoney emits it.
    expect(row.textContent).toContain('900,00\u00A0\u20B4');
    expect(row.textContent).toContain('Щомісяця');
    expect(within(row).getByText('Активна')).toBeInTheDocument();
  });

  it('shows how far through the retries a failing subscription is', async () => {
    apiFetch.mockResolvedValueOnce([
      subscription({
        status: 'PAST_DUE',
        failedAttempts: 2,
        accessUntil: '2026-09-30T09:00:00.000Z',
      }),
    ]);

    renderTrainer();

    const row = await screen.findByRole('row', { name: /Марія Бондаренко/ });

    // The trainer needs to know it is failing AND that access has not gone yet.
    expect(row.textContent).toContain('Спроба 2 з 4');
    expect(row.textContent).toContain('доступ до');
  });

  it('cancels from the table, after saying what cancelling actually does', async () => {
    apiFetch.mockResolvedValueOnce([subscription()]);
    renderTrainer();

    await screen.findByRole('row', { name: /Марія Бондаренко/ });

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Скасувати підписку: Місячний супровід для Марія Бондаренко',
      }),
    );

    // The confirmation states the date and that no money comes back.
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Наступних списань не буде');
    expect(dialog.textContent).toContain('Кошти не повертаються');

    apiFetch.mockResolvedValueOnce(subscription({ status: 'CANCELLED' }));
    apiFetch.mockResolvedValueOnce([subscription({ status: 'CANCELLED' })]);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Скасувати підписку' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/subscriptions/sub1/cancel',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('offers resume only while the paid period is still running', async () => {
    apiFetch.mockResolvedValueOnce([
      subscription({ id: 'a', status: 'CANCELLED', isActive: true }),
      subscription({
        id: 'b',
        clientName: 'Олена К.',
        // Same status, lapsed period — what a subscription cancelled a month
        // ago actually looks like: cancelling never writes ENDED. Varying only
        // liveness is what lets this test fail for its stated reason.
        status: 'CANCELLED',
        isActive: false,
        nextChargeAt: null,
      }),
    ]);

    renderTrainer();

    await screen.findByRole('row', { name: /Марія Бондаренко/ });

    expect(screen.getByRole('button', { name: /Відновити підписку.*Марія/ })).toBeInTheDocument();

    // An ended subscription is over; resuming it would be a new purchase.
    expect(
      screen.queryByRole('button', { name: /Відновити підписку.*Олена/ }),
    ).not.toBeInTheDocument();
  });

  it('has an honest empty state', async () => {
    apiFetch.mockResolvedValueOnce([]);

    renderTrainer();

    expect(await screen.findByText('Підписок поки немає')).toBeInTheDocument();
  });
});

describe('the client subscription card', () => {
  it('says what it costs and when it renews', async () => {
    clientLoads([clientSubscription()]);

    renderClient();

    expect(await screen.findByText('Підписка')).toBeInTheDocument();
    expect(screen.getByText(/900,00/)).toBeInTheDocument();
    expect(screen.getByText(/Наступне списання/)).toBeInTheDocument();
  });

  it('lets the client stop it themselves, and says exactly what that means', async () => {
    clientLoads([clientSubscription()]);
    renderClient();

    await screen.findByText('Підписка');

    // Reachable from the client's own screen, not hidden behind support.
    await userEvent.click(
      screen.getByRole('button', { name: 'Скасувати підписку Місячний супровід' }),
    );

    const dialog = await screen.findByRole('dialog');

    // Honest: the date, the money, and the way back. No retention offer.
    expect(dialog.textContent).toContain('Наступних списань не буде');
    expect(dialog.textContent).toContain('не повертаються');
    expect(dialog.textContent).toContain('можна відновити');
    expect(within(dialog).getByRole('button', { name: 'Не скасовувати' })).toBeInTheDocument();

    apiFetch.mockResolvedValueOnce(clientSubscription({ status: 'CANCELLED' }));
    apiFetch.mockResolvedValueOnce({ payments: [], entitlements: [] });
    apiFetch.mockResolvedValueOnce([
      clientSubscription({ status: 'CANCELLED', canReactivate: true }),
    ]);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Скасувати підписку' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/me/subscriptions/sub1/cancel',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('tells the client access continues while a charge is being retried', async () => {
    clientLoads([
      clientSubscription({
        status: 'PAST_DUE',
        failedAttempts: 1,
        accessUntil: '2026-09-30T09:00:00.000Z',
      }),
    ]);

    renderClient();

    expect(await screen.findByText(/Оплата не пройшла \(спроба 1 з 4\)/)).toBeInTheDocument();
    expect(screen.getByText(/Доступ триває до/)).toBeInTheDocument();
  });

  it('offers a way back while the period runs, and none once it has not', async () => {
    clientLoads([clientSubscription({ status: 'CANCELLED', canReactivate: true })]);
    const { unmount } = renderClient();

    expect(
      await screen.findByRole('button', { name: 'Відновити підписку Місячний супровід' }),
    ).toBeInTheDocument();

    unmount();
    apiFetch.mockReset();
    clientLoads([
      clientSubscription({
        status: 'CANCELLED',
        isActive: false,
        canReactivate: false,
        nextChargeAt: null,
      }),
    ]);

    renderClient();

    await screen.findByText('Підписка');
    expect(screen.queryByRole('button', { name: /Відновити/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Скасувати підписку/ })).not.toBeInTheDocument();

    // And it says so in the past tense, rather than promising access that ended.
    expect(screen.getByText(/Доступ закінчився/)).toBeInTheDocument();
  });

  it('never colours a failed payment as though it were fine', async () => {
    clientLoads([clientSubscription({ status: 'PAST_DUE', failedAttempts: 1 })]);

    renderClient();

    const badge = await screen.findByText('Оплата не пройшла');

    // Coloured by what it SAYS, not by whether access happens to still run —
    // a green pill reading «payment failed» is worse than no badge at all.
    expect(badge.className).toContain('warning');
    expect(badge.className).not.toContain('success');
  });

  it('keeps a payable invoice reachable when only the subscriptions call fails', async () => {
    apiFetch.mockResolvedValueOnce({
      payments: [
        {
          id: 'pay1',
          productName: 'Місячний супровід',
          amount: { amount: '900.00', currency: 'UAH' },
          status: 'PENDING',
          createdAt: '2026-08-25T09:00:00.000Z',
          paidAt: null,
          checkoutUrl: 'https://pay.invalid/abc',
        },
      ],
      entitlements: [],
    });
    apiFetch.mockRejectedValueOnce(new Error('subscriptions down'));

    renderClient();

    // The client came here to pay. One endpoint being down must not take the
    // other's answer with it.
    expect(await screen.findByRole('link', { name: /Оплатити/ })).toHaveAttribute(
      'href',
      'https://pay.invalid/abc',
    );
  });
});
