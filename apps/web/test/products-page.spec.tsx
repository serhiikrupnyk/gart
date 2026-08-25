import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatMoney, type PublicProduct } from '@gart/shared';

import ProductsPage from '@/app/(app)/dashboard/products/page';
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

function product(overrides: Partial<PublicProduct> = {}): PublicProduct {
  return {
    id: 'p1',
    name: 'Разовий блок',
    description: null,
    kind: 'ONE_TIME',
    period: null,
    price: { amount: '1500.00', currency: 'UAH' },
    accessDays: 30,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <ProductsPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe('the money formatter', () => {
  it('renders hryvnia the way Ukrainian typography does, from the string', () => {
    expect(formatMoney({ amount: '1500.00', currency: 'UAH' })).toBe('1 500,00 ₴');
    expect(formatMoney({ amount: '1234.56', currency: 'UAH' })).toBe('1 234,56 ₴');
    expect(formatMoney({ amount: '999999.00', currency: 'UAH' })).toBe('999 999,00 ₴');
    expect(formatMoney({ amount: '50.00', currency: 'UAH' })).toBe('50,00 ₴');
  });

  it('never lets a price wrap away from its symbol or split its thousands', () => {
    const rendered = formatMoney({ amount: '1000000.00', currency: 'UAH' });

    expect(rendered).toBe('1 000 000,00 ₴');
    expect(rendered).not.toContain(' ');
  });

  it('agrees exactly with what Intl would produce, without using a float', () => {
    const intl = new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency: 'UAH',
      minimumFractionDigits: 2,
    }).format(1234.56);

    expect(formatMoney({ amount: '1234.56', currency: 'UAH' })).toBe(intl);
  });
});

describe('the catalogue', () => {
  it('shows both kinds with what each one grants', async () => {
    apiFetch.mockResolvedValueOnce([
      product(),
      product({
        id: 'p2',
        name: 'Супровід',
        kind: 'SUBSCRIPTION',
        period: 'QUARTERLY',
        accessDays: null,
        price: { amount: '900.00', currency: 'UAH' },
      }),
      product({ id: 'p3', name: 'Назавжди', accessDays: null }),
    ]);

    renderPage();

    const oneTime = await screen.findByRole('row', { name: /Разовий блок/ });
    expect(within(oneTime).getByText('Разовий')).toBeInTheDocument();
    expect(within(oneTime).getByText('30 днів')).toBeInTheDocument();
    // Testing Library's normalizer collapses U+00A0 to a plain space, so a
    // getByText could never tell the two apart. textContent can — and a price
    // keeping its non-breaking spaces is the whole point of the formatter.
    expect(oneTime.textContent).toContain(formatMoney(product().price));
    expect(oneTime.textContent).toContain('1\u00A0500,00\u00A0\u20B4');

    const subscription = screen.getByRole('row', { name: /Супровід/ });
    expect(within(subscription).getByText('Підписка')).toBeInTheDocument();
    expect(within(subscription).getByText('Раз на квартал')).toBeInTheDocument();

    // A one-time product with no window is perpetual, not blank.
    const perpetual = screen.getByRole('row', { name: /Назавжди/ });
    expect(within(perpetual).getByText('Без обмеження')).toBeInTheDocument();
  });

  it('counts days the way Ukrainian counts them', async () => {
    apiFetch.mockResolvedValueOnce([
      product({ id: 'a', accessDays: 1 }),
      product({ id: 'b', accessDays: 3 }),
      product({ id: 'c', accessDays: 5 }),
      product({ id: 'd', accessDays: 11 }),
      product({ id: 'e', accessDays: 21 }),
    ]);

    renderPage();

    // 1 день / 2-4 дні / 5-20 днів, and 11-14 take the genitive plural despite
    // ending in 1. «1 днів» is not Ukrainian, and one day is a real product.
    expect(await screen.findByText('1 день')).toBeInTheDocument();
    expect(screen.getByText('3 дні')).toBeInTheDocument();
    expect(screen.getByText('5 днів')).toBeInTheDocument();
    expect(screen.getByText('11 днів')).toBeInTheDocument();
    expect(screen.getByText('21 день')).toBeInTheDocument();
  });

  it('says an inactive product is inactive, not merely dims it', async () => {
    apiFetch.mockResolvedValueOnce([product({ isActive: false })]);

    renderPage();

    const row = await screen.findByRole('row', { name: /Разовий блок/ });
    expect(within(row).getByText('Неактивний')).toBeInTheDocument();
    // The name carries the product, so a rotor listing buttons is not twelve
    // identical «Деактивувати» entries.
    expect(
      within(row).getByRole('button', { name: 'Активувати Разовий блок' }),
    ).toBeInTheDocument();
  });

  it('offers a way in when there is nothing yet', async () => {
    apiFetch.mockResolvedValueOnce([]);

    renderPage();

    expect(await screen.findByText('Ще немає жодного продукту')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Створити продукт/ }).length).toBeGreaterThan(0);
  });

  it('offers a retry when the list cannot be loaded', async () => {
    apiFetch.mockRejectedValueOnce(new Error('offline'));

    renderPage();

    expect(await screen.findByText('Не вдалося завантажити продукти')).toBeInTheDocument();

    apiFetch.mockResolvedValueOnce([product()]);
    await userEvent.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));

    expect(await screen.findByRole('row', { name: /Разовий блок/ })).toBeInTheDocument();
  });
});

describe('the form', () => {
  it('asks for a period XOR an access window, following the kind', async () => {
    apiFetch.mockResolvedValueOnce([]);
    renderPage();

    await screen.findByText('Ще немає жодного продукту');
    await userEvent.click(screen.getAllByRole('button', { name: /Створити продукт/ })[0]!);

    // A one-time product has a window and no period.
    expect(screen.getByLabelText('Тривалість доступу, днів')).toBeInTheDocument();
    expect(screen.queryByLabelText('Періодичність')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Тип'), 'SUBSCRIPTION');

    // A subscription has a period and no window — absent, not disabled.
    expect(screen.getByLabelText('Періодичність')).toBeInTheDocument();
    expect(screen.queryByLabelText('Тривалість доступу, днів')).not.toBeInTheDocument();
  });

  it('sends the price as a decimal string and clears the other kind’s field', async () => {
    apiFetch.mockResolvedValueOnce([]);
    renderPage();

    await screen.findByText('Ще немає жодного продукту');
    await userEvent.click(screen.getAllByRole('button', { name: /Створити продукт/ })[0]!);

    await userEvent.type(screen.getByLabelText('Назва'), 'Супровід');
    await userEvent.selectOptions(screen.getByLabelText('Тип'), 'SUBSCRIPTION');
    await userEvent.selectOptions(screen.getByLabelText('Періодичність'), 'ANNUAL');
    await userEvent.type(screen.getByLabelText('Ціна, ₴'), '9000.00');

    apiFetch.mockResolvedValueOnce(product({ kind: 'SUBSCRIPTION', period: 'ANNUAL' }));
    apiFetch.mockResolvedValueOnce([]);

    await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/products',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const [, init] = apiFetch.mock.calls.find(([path]) => path === '/products') as [
      string,
      { body: string },
    ];
    const sent = JSON.parse(init.body) as Record<string, unknown>;

    expect(sent.price).toBe('9000.00');
    expect(typeof sent.price).toBe('string');
    expect(sent.period).toBe('ANNUAL');
    expect(sent.accessDays).toBeNull();
  });

  it('refuses to let a price carry anything that is not a price', async () => {
    apiFetch.mockResolvedValueOnce([]);
    renderPage();

    await screen.findByText('Ще немає жодного продукту');
    await userEvent.click(screen.getAllByRole('button', { name: /Створити продукт/ })[0]!);

    const price = screen.getByLabelText('Ціна, ₴');
    await userEvent.type(price, '1a5b0₴0.-00');

    expect(price).toHaveValue('1500.00');
  });

  it('TRANSLATES a decimal comma instead of deleting it', async () => {
    apiFetch.mockResolvedValueOnce([]);
    renderPage();

    await screen.findByText('Ще немає жодного продукту');
    await userEvent.click(screen.getAllByRole('button', { name: /Створити продукт/ })[0]!);

    const price = screen.getByLabelText('Ціна, ₴');

    // The separator this very screen renders in «1 500,00 ₴» is the one a
    // Ukrainian trainer will type. Stripping it turned 1 500,00 into 150000 —
    // a product priced a hundred times over, in bounds, with no error.
    await userEvent.type(price, '1 500,00');
    expect(price).toHaveValue('1500.00');

    await userEvent.clear(price);
    await userEvent.type(price, '1500,50');
    expect(price).toHaveValue('1500.50');

    await userEvent.clear(price);
    await userEvent.type(price, '1,5');
    expect(price).toHaveValue('1.5');
  });

  it('surfaces what the server said when a save is rejected', async () => {
    apiFetch.mockResolvedValueOnce([]);
    renderPage();

    await screen.findByText('Ще немає жодного продукту');
    await userEvent.click(screen.getAllByRole('button', { name: /Створити продукт/ })[0]!);

    await userEvent.type(screen.getByLabelText('Назва'), 'Задорого');
    await userEvent.type(screen.getByLabelText('Ціна, ₴'), '9999999.00');

    const { ApiError } = jest.requireMock('@/lib/api') as {
      ApiError: new (message: string, status: number) => Error;
    };
    apiFetch.mockRejectedValueOnce(new ApiError('Ціна має бути від 1 до 1000000 ₴', 400));

    await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ціна має бути від 1 до 1000000 ₴');
  });

  it('opens an existing product with its own values, price included', async () => {
    apiFetch.mockResolvedValueOnce([product({ name: 'Разовий блок', accessDays: 45 })]);
    renderPage();

    await screen.findByRole('row', { name: /Разовий блок/ });
    await userEvent.click(screen.getByRole('button', { name: 'Редагувати Разовий блок' }));

    expect(screen.getByLabelText('Назва')).toHaveValue('Разовий блок');
    expect(screen.getByLabelText('Ціна, ₴')).toHaveValue('1500.00');
    expect(screen.getByLabelText('Тривалість доступу, днів')).toHaveValue('45');
  });
});

describe('retiring a product', () => {
  it('deactivates without deleting', async () => {
    apiFetch.mockResolvedValueOnce([product()]);
    renderPage();

    await screen.findByRole('row', { name: /Разовий блок/ });

    apiFetch.mockResolvedValueOnce(product({ isActive: false }));
    apiFetch.mockResolvedValueOnce([product({ isActive: false })]);

    await userEvent.click(screen.getByRole('button', { name: 'Деактивувати Разовий блок' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/products/p1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isActive: false }) }),
      );
    });
  });

  it('explains, in the server’s own words, why a sold product cannot be deleted', async () => {
    apiFetch.mockResolvedValueOnce([product()]);
    renderPage();

    await screen.findByRole('row', { name: /Разовий блок/ });
    await userEvent.click(screen.getByRole('button', { name: 'Видалити Разовий блок' }));

    const { ApiError } = jest.requireMock('@/lib/api') as {
      ApiError: new (message: string, status: number) => Error;
    };
    apiFetch.mockRejectedValueOnce(
      new ApiError('Продукт уже продавався — його можна лише деактивувати', 409),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Видалити' }));

    // The 409 is the delete contract speaking; it must reach the trainer intact
    // rather than being flattened into «щось пішло не так».
    expect(
      await screen.findByText('Продукт уже продавався — його можна лише деактивувати'),
    ).toBeInTheDocument();
  });
});
