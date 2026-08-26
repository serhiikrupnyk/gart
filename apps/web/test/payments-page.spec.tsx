import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClientPurchases, PublicPayment } from '@gart/shared';

import PaymentsPage from '@/app/(app)/dashboard/payments/page';
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

function payment(overrides: Partial<PublicPayment> = {}): PublicPayment {
  return {
    id: 'pay1',
    clientId: 'c1',
    clientName: 'Марія Бондаренко',
    productId: 'p1',
    productName: 'Місячний супровід',
    amount: { amount: '1500.00', currency: 'UAH' },
    platformFee: { amount: '75.00', currency: 'UAH' },
    payout: { amount: '1425.00', currency: 'UAH' },
    status: 'SUCCEEDED',
    createdAt: '2026-08-25T09:00:00.000Z',
    paidAt: '2026-08-25T09:00:05.000Z',
    checkoutUrl: null,
    ...overrides,
  };
}

function renderTrainer() {
  return render(
    <ToastProvider>
      <PaymentsPage />
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

beforeEach(() => {
  apiFetch.mockReset();
});

describe('the trainer payments table', () => {
  it('shows the amount, the commission and what is left, all summing back', async () => {
    apiFetch.mockResolvedValueOnce([payment()]);

    renderTrainer();

    const row = await screen.findByRole('row', { name: /Марія Бондаренко/ });

    expect(row.textContent).toContain('1 500,00 ₴');
    expect(row.textContent).toContain('75,00 ₴');
    expect(row.textContent).toContain('1 425,00 ₴');
    expect(within(row).getByText('Оплачено')).toBeInTheDocument();
  });

  it('renders the case a float would get wrong', async () => {
    apiFetch.mockResolvedValueOnce([
      payment({
        amount: { amount: '23.00', currency: 'UAH' },
        platformFee: { amount: '1.15', currency: 'UAH' },
        payout: { amount: '21.85', currency: 'UAH' },
      }),
    ]);

    renderTrainer();

    const row = await screen.findByRole('row', { name: /Марія Бондаренко/ });

    // Not 1,14 ₴ — the kopiyka a float loses on twenty-three hryvnia.
    expect(row.textContent).toContain('1,15 ₴');
    expect(row.textContent).toContain('21,85 ₴');
  });

  it('asks the API for the status the trainer picked', async () => {
    apiFetch.mockResolvedValueOnce([payment()]);
    renderTrainer();
    await screen.findByRole('row', { name: /Марія Бондаренко/ });

    apiFetch.mockResolvedValueOnce([]);
    await userEvent.selectOptions(screen.getByLabelText('Фільтр за статусом'), 'PENDING');

    await waitFor(() => {
      expect(apiFetch).toHaveBeenLastCalledWith('/payments?status=PENDING');
    });

    expect(await screen.findByText('Немає оплат із цим статусом')).toBeInTheDocument();
  });

  it('offers the checkout link only while a payment is still open', async () => {
    apiFetch.mockResolvedValueOnce([
      payment({ status: 'PENDING', checkoutUrl: 'https://pay.invalid/abc' }),
      // A settled row that still carries a URL: the guard's status half must
      // refuse it on its own, not lean on the server having cleared it.
      payment({
        id: 'pay2',
        clientName: 'Олена К.',
        status: 'SUCCEEDED',
        checkoutUrl: 'https://pay.invalid/spent',
      }),
    ]);

    renderTrainer();

    await screen.findByRole('row', { name: /Марія Бондаренко/ });

    expect(
      screen.getByRole('button', {
        name: 'Скопіювати посилання на оплату: Місячний супровід для Марія Бондаренко',
      }),
    ).toBeInTheDocument();

    // A settled payment has nothing left to pay, so nothing to copy.
    expect(
      screen.queryByRole('button', { name: /Скопіювати посилання.*Олена/ }),
    ).not.toBeInTheDocument();
  });

  it('tells two open invoices for the same client apart', async () => {
    apiFetch.mockResolvedValueOnce([
      payment({ status: 'PENDING', checkoutUrl: 'https://pay.invalid/a' }),
      payment({
        id: 'pay2',
        productName: 'Разова консультація',
        status: 'PENDING',
        checkoutUrl: 'https://pay.invalid/b',
      }),
    ]);

    renderTrainer();
    await screen.findAllByRole('row', { name: /Марія Бондаренко/ });

    // Same client, two products. Names keyed only on the client would be
    // identical here, and copying the wrong one bills the wrong product.
    const buttons = screen.getAllByRole('button', { name: /Скопіювати посилання/ });
    const names = buttons.map((button) => button.getAttribute('aria-label'));

    expect(new Set(names).size).toBe(2);
    expect(names[0]).toContain('Місячний супровід');
    expect(names[1]).toContain('Разова консультація');
  });

  it('says so when the clipboard refuses, rather than looking broken', async () => {
    apiFetch.mockResolvedValueOnce([
      payment({ status: 'PENDING', checkoutUrl: 'https://pay.invalid/abc' }),
    ]);
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) },
    });

    renderTrainer();
    await screen.findByRole('row', { name: /Марія Бондаренко/ });

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Скопіювати посилання на оплату: Місячний супровід для Марія Бондаренко',
      }),
    );

    expect(await screen.findByText('Не вдалося скопіювати посилання')).toBeInTheDocument();
  });

  it('has an honest empty state before anything has been sold', async () => {
    apiFetch.mockResolvedValueOnce([]);

    renderTrainer();

    expect(await screen.findByText('Оплат поки немає')).toBeInTheDocument();
  });
});

describe('opening a checkout', () => {
  it('is reachable from the payments screen, and sends only a product id', async () => {
    apiFetch.mockResolvedValueOnce([]);
    renderTrainer();

    await screen.findByText('Оплат поки немає');

    // Клієнти, then products, when the modal opens.
    apiFetch.mockResolvedValueOnce([
      { id: 'c1', fullName: 'Марія Бондаренко', email: 'm@example.com', status: 'ACTIVE' },
    ]);
    apiFetch.mockResolvedValueOnce([
      {
        id: 'p1',
        name: 'Місячний супровід',
        description: null,
        kind: 'ONE_TIME',
        period: null,
        price: { amount: '1500.00', currency: 'UAH' },
        accessDays: 30,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    await userEvent.click(screen.getAllByRole('button', { name: /Виставити рахунок/ })[0]!);

    expect(await screen.findByLabelText('Клієнт')).toBeInTheDocument();
    // The product option carries its price, so the trainer sees what they bill.
    expect(screen.getByLabelText('Продукт')).toHaveTextContent('1 500,00 ₴');

    apiFetch.mockResolvedValueOnce({ payment: payment(), redirectUrl: 'https://pay.invalid/x' });
    apiFetch.mockResolvedValueOnce([payment()]);

    await userEvent.click(screen.getByRole('button', { name: 'Виставити' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/clients/c1/payments',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    // The amount and the fee are the server's to decide; this form has no
    // field that could carry either, and sends none.
    const call = apiFetch.mock.calls.find(([path]) => path === '/clients/c1/payments') as [
      string,
      { body: string },
    ];
    const sent = JSON.parse(call[1].body) as Record<string, unknown>;

    expect(sent).toEqual({ productId: 'p1' });
  });

  it('says what is missing rather than offering an empty form', async () => {
    apiFetch.mockResolvedValueOnce([]);
    renderTrainer();
    await screen.findByText('Оплат поки немає');

    apiFetch.mockResolvedValueOnce([]);
    apiFetch.mockResolvedValueOnce([]);

    await userEvent.click(screen.getAllByRole('button', { name: /Виставити рахунок/ })[0]!);

    expect(await screen.findByText('Спочатку додайте активного клієнта.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Виставити' })).toBeDisabled();
  });
});

describe('the client purchases screen', () => {
  function purchases(overrides: Partial<ClientPurchases> = {}): ClientPurchases {
    return {
      payments: [
        {
          id: 'pay1',
          productName: 'Місячний супровід',
          amount: { amount: '1500.00', currency: 'UAH' },
          status: 'PENDING',
          createdAt: '2026-08-25T09:00:00.000Z',
          paidAt: null,
          checkoutUrl: 'https://pay.invalid/abc',
        },
      ],
      entitlements: [],
      ...overrides,
    };
  }

  it('puts what is owed first, with a way to pay it', async () => {
    apiFetch.mockResolvedValueOnce(purchases());
    apiFetch.mockResolvedValueOnce([]);

    renderClient();

    expect(await screen.findByText('До оплати')).toBeInTheDocument();

    const pay = screen.getByRole('link', {
      name: 'Оплатити Місячний супровід, 1 500,00 ₴',
    });
    expect(pay).toHaveAttribute('href', 'https://pay.invalid/abc');

    // Same tab: the acquirer returns the payer to /client through the returnUrl
    // the checkout was opened with, and a new tab would strand that return.
    expect(pay).not.toHaveAttribute('target');
  });

  it('NEVER shows the client the commission or the payout', async () => {
    apiFetch.mockResolvedValueOnce(
      purchases({
        payments: [
          {
            id: 'pay1',
            productName: 'Місячний супровід',
            amount: { amount: '1500.00', currency: 'UAH' },
            status: 'SUCCEEDED',
            createdAt: '2026-08-25T09:00:00.000Z',
            paidAt: '2026-08-25T09:00:05.000Z',
            checkoutUrl: 'https://pay.invalid/spent',
          },
        ],
      }),
    );

    apiFetch.mockResolvedValueOnce([]);

    renderClient();

    await screen.findByText('Історія');

    // A paid purchase belongs in the history, never back under «До оплати»
    // with a live-looking button — even if the row still carries a spent URL.
    expect(screen.queryByText('До оплати')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Оплатити/ })).not.toBeInTheDocument();

    const body = document.body.textContent ?? '';
    expect(body).toContain('1 500,00 ₴');
    // The fee and payout on ₴1500 at 5%. Neither is the client's business.
    expect(body).not.toContain('75,00');
    expect(body).not.toContain('1 425,00');
    expect(body).not.toContain('Комісія');
    expect(body).not.toContain('До виплати');
  });

  it('shows active access and when it runs out', async () => {
    apiFetch.mockResolvedValueOnce(
      purchases({
        payments: [],
        entitlements: [
          {
            id: 'e1',
            productId: 'p1',
            productName: 'Місячний супровід',
            startsAt: '2026-08-25T09:00:00.000Z',
            endsAt: '2026-09-24T09:00:00.000Z',
            isActive: true,
          },
        ],
      }),
    );

    apiFetch.mockResolvedValueOnce([]);

    renderClient();

    expect(await screen.findByText('Ваш доступ')).toBeInTheDocument();
    expect(screen.getByText(/Діє до/)).toBeInTheDocument();
    expect(screen.getByText('Активний')).toBeInTheDocument();
  });

  it('says nothing is owed rather than showing an empty frame', async () => {
    apiFetch.mockResolvedValueOnce({ payments: [], entitlements: [] });
    apiFetch.mockResolvedValueOnce([]);

    renderClient();

    expect(await screen.findByText('Оплат поки немає')).toBeInTheDocument();
  });
});
