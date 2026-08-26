import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FoodPage, NutritionStatus, PublicFood } from '@gart/shared';
import { fromCenti, scaleNutrients, sumNutrients } from '@gart/shared';

import NutritionPage from '@/app/(app)/dashboard/nutrition/page';
import { AppNav } from '@/components/layout/app-nav';
import { PlanCards } from '@/components/billing/plan-cards';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ToastProvider } from '@/components/ui';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dashboard/nutrition',
}));

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  API_URL: 'http://api.test',
  ApiError: class extends Error {},
}));

const NUTRIENTS = {
  kcal: '155.00',
  protein: '13.00',
  fat: '11.00',
  carbs: '1.10',
  fibre: '0.00',
  sugars: '1.10',
  saturatedFat: '3.30',
  salt: '0.14',
};

function food(overrides: Partial<PublicFood> = {}): PublicFood {
  return {
    id: 'f1',
    name: 'Яйце куряче',
    brand: null,
    group: 'EGGS',
    nutrients: NUTRIENTS,
    source: 'USDA FoodData Central (CC0)',
    portions: [{ id: 'p1', label: 'яйце середнє', grams: '55.00' }],
    editable: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function serve(status: NutritionStatus, page?: Partial<FoodPage>): void {
  apiFetch.mockImplementation((path: string) => {
    if (path === '/nutrition/status') return Promise.resolve(status);
    if (path.startsWith('/nutrition/foods?')) {
      return Promise.resolve({
        items: [food()],
        total: 1,
        page: 1,
        pageSize: 20,
        ...page,
      } satisfies FoodPage);
    }

    return Promise.resolve(null);
  });
}

function renderPage() {
  return render(
    <ThemeProvider initial="system">
      <ToastProvider>
        <NutritionPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

const ON_GROW: NutritionStatus = { available: true, customFoodCount: 0, requiredPlan: 'GROW' };

beforeEach(() => {
  apiFetch.mockReset();
});

describe('the nutrition entry point', () => {
  it('is a real nav link, not a disabled chip', () => {
    render(
      <ThemeProvider initial="system">
        <AppNav />
      </ThemeProvider>,
    );

    // Nutrition is not «скоро» — it exists, and a PRO trainer simply does not
    // have it. A dead item would tell them nothing.
    expect(screen.getByRole('link', { name: /Харчування/ })).toHaveAttribute(
      'href',
      '/dashboard/nutrition',
    );
  });
});

describe('a trainer without GROW', () => {
  it('sees an upsell that names the plan and the price, not an error', async () => {
    serve({ available: false, customFoodCount: 0, requiredPlan: 'GROW' });
    renderPage();

    expect(await screen.findByText(/Харчування — на тарифі GROW/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Перейти на GROW/ })).toHaveAttribute(
      'href',
      '/dashboard/billing',
    );
    // No table, no «Додати продукт» that would fail.
    expect(screen.queryByRole('button', { name: /Додати продукт/ })).not.toBeInTheDocument();
  });

  it('separates what ships today from what is coming', async () => {
    serve({ available: false, customFoodCount: 0, requiredPlan: 'GROW' });
    renderPage();

    await screen.findByText(/Харчування — на тарифі GROW/);

    expect(screen.getByText('База продуктів із калорійністю та БЖВ')).toBeInTheDocument();
    // Named, and visibly not part of what is being paid for now.
    expect(screen.getByText(/Незабаром на GROW/)).toBeInTheDocument();
    expect(screen.getByText('Страви та плани харчування')).toBeInTheDocument();
  });

  it('lets a downgraded trainer VERIFY their library survived', async () => {
    serve({ available: false, customFoodCount: 34, requiredPlan: 'GROW' });
    renderPage();

    // A promise somebody can check is worth more than the same promise stated.
    expect(await screen.findByText(/У вас 34 власних продуктів/)).toBeInTheDocument();
    expect(screen.getByText(/повернуться одразу після оформлення GROW/)).toBeInTheDocument();
  });

  it('says nothing about a library that is empty', async () => {
    serve({ available: false, customFoodCount: 0, requiredPlan: 'GROW' });
    renderPage();

    await screen.findByText(/Харчування — на тарифі GROW/);
    expect(screen.queryByText(/власних продуктів/)).not.toBeInTheDocument();
  });
});

describe('the food library', () => {
  it('lists foods with their per-100 g figures', async () => {
    serve(ON_GROW);
    renderPage();

    expect(await screen.findByText('Яйце куряче')).toBeInTheDocument();
    expect(screen.getByText('155.00')).toBeInTheDocument();
    expect(screen.getByText('13.00 / 11.00 / 1.10')).toBeInTheDocument();
  });

  it('works the portion figures out from the per-100 g values', async () => {
    serve(ON_GROW);
    renderPage();

    await screen.findByText('Яйце куряче');

    // 155.00 × 55 ÷ 100 = 85.25, and the row shows it rather than making a
    // trainer do the arithmetic.
    expect(screen.getByText(/яйце середнє · 55.00 г/)).toBeInTheDocument();
    expect(screen.getByText(/85.25/)).toBeInTheDocument();
  });

  it('marks a shared-library row and offers no way to edit it', async () => {
    serve(ON_GROW);
    renderPage();

    await screen.findByText('Яйце куряче');

    expect(screen.getByText('Спільна база')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Редагувати/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Видалити Яйце/ })).not.toBeInTheDocument();
  });

  it("offers edit and delete on a trainer's own row", async () => {
    serve(ON_GROW, { items: [food({ name: 'Мій сир', editable: true })] });
    renderPage();

    await screen.findByText('Мій сир');

    expect(screen.getByRole('button', { name: 'Редагувати Мій сир' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Видалити Мій сир' })).toBeInTheDocument();
  });

  it('searches by what the trainer types', async () => {
    const user = userEvent.setup();
    serve(ON_GROW);
    renderPage();

    await screen.findByText('Яйце куряче');
    await user.type(screen.getByLabelText('Пошук продукту'), 'греч');

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining('search=%D0%B3%D1%80%D0%B5%D1%87'),
      );
    });
  });

  it('offers an empty state with a way out', async () => {
    serve(ON_GROW, { items: [], total: 0 });
    renderPage();

    expect(await screen.findByText('Нічого не знайдено')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Додати продукт/ }).length).toBeGreaterThan(0);
  });
});

describe('the food form', () => {
  it('translates a decimal comma rather than stripping it', async () => {
    const user = userEvent.setup();
    serve(ON_GROW);
    renderPage();

    await screen.findByText('Яйце куряче');
    await user.click(screen.getAllByRole('button', { name: /Додати продукт/ })[0] as HTMLElement);

    const dialog = await screen.findByRole('dialog');
    const protein = within(dialog).getByLabelText(/Білки/);

    // A Ukrainian keyboard gives «12,5». Stripping the separator would store
    // 125 — a hundredfold error that passes every bound.
    await user.type(protein, '12,5');
    expect((protein as HTMLInputElement).value).toBe('12.5');
  });

  it('sends nutrients as strings, and an empty optional as null', async () => {
    const user = userEvent.setup();
    serve(ON_GROW);
    renderPage();

    await screen.findByText('Яйце куряче');
    await user.click(screen.getAllByRole('button', { name: /Додати продукт/ })[0] as HTMLElement);

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Назва'), 'Мій продукт');
    await user.type(within(dialog).getByLabelText(/Калорії/), '155');
    await user.type(within(dialog).getByLabelText(/Білки/), '13');
    await user.type(within(dialog).getByLabelText(/^Жири/), '11');
    await user.type(within(dialog).getByLabelText(/Вуглеводи/), '1.1');

    await user.click(within(dialog).getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/nutrition/foods',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const call = apiFetch.mock.calls.find((args) => args[0] === '/nutrition/foods');
    const body = JSON.parse((call?.[1] as { body: string }).body) as {
      nutrients: Record<string, unknown>;
    };

    expect(body.nutrients.kcal).toBe('155');
    expect(body.nutrients.protein).toBe('13');
    // Blank means NOT MEASURED, which is not zero.
    expect(body.nutrients.fibre).toBeNull();
  });
});

describe('the plan chooser', () => {
  it('sells GROW and keeps SCALE «скоро»', () => {
    render(
      <ThemeProvider initial="system">
        <PlanCards currentPlan={null} busy={false} onSubscribe={jest.fn()} />
      </ThemeProvider>,
    );

    // GROW earned its place when nutrition shipped; SCALE has no
    // differentiator built yet.
    expect(screen.getAllByRole('button', { name: /Оформити підписку/ })).toHaveLength(2);
    expect(screen.getAllByText('Скоро')).toHaveLength(1);
    expect(screen.getByText('База продуктів із калорійністю та БЖВ')).toBeInTheDocument();

    // ONE cadence control for the page. Two sellable cards each rendering
    // their own, bound to a single value, meant changing one silently moved
    // the price shown on the other.
    expect(screen.getAllByLabelText(/Періодичність/)).toHaveLength(1);
  });

  it('names what is coming without listing it as a feature', () => {
    render(
      <ThemeProvider initial="system">
        <PlanCards currentPlan={null} busy={false} onSubscribe={jest.fn()} />
      </ThemeProvider>,
    );

    expect(screen.getAllByText('Незабаром').length).toBeGreaterThan(0);
    expect(screen.getByText('Журнал їжі')).toBeInTheDocument();
  });
});

describe('when the status call fails', () => {
  it('falls back to the upsell rather than a skeleton that never goes away', async () => {
    apiFetch.mockRejectedValue(new Error('offline'));

    render(
      <ThemeProvider initial="system">
        <ToastProvider>
          <NutritionPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    // The toast disappears; a skeleton with no fallback does not. Failing
    // closed to the upsell at least offers a way forward.
    expect(await screen.findByText(/Харчування — на тарифі GROW/)).toBeInTheDocument();
  });
});

describe('nutrient arithmetic', () => {
  it('scales exactly, in integers', () => {
    expect(scaleNutrients(NUTRIENTS, '55.00')?.kcal).toBe('85.25');
    expect(scaleNutrients(NUTRIENTS, '100.00')?.kcal).toBe('155.00');
    expect(scaleNutrients(NUTRIENTS, '0.00')?.kcal).toBe('0.00');
  });

  it('keeps an unmeasured nutrient unmeasured', () => {
    const unknown = { ...NUTRIENTS, fibre: null };

    expect(scaleNutrients(unknown, '55.00')?.fibre).toBeNull();
    expect(sumNutrients([unknown, NUTRIENTS])?.fibre).toBeNull();
  });

  it('sums without drifting, where a float would', () => {
    const tenth = { ...NUTRIENTS, kcal: '0.10', protein: '0.20' };
    const total = sumNutrients(Array.from({ length: 10 }, () => tenth));

    // 0.1 added ten times is 1.00 here, and 0.9999999999999999 in a float.
    expect(total?.kcal).toBe('1.00');
    expect(total?.protein).toBe('2.00');
  });

  it('refuses a malformed amount rather than guessing', () => {
    expect(scaleNutrients({ ...NUTRIENTS, kcal: 'багато' }, '55.00')).toBeNull();
    expect(scaleNutrients(NUTRIENTS, 'кілька')).toBeNull();
    // Including an OPTIONAL one: a malformed value used to come back as null,
    // indistinguishable from an honest «not measured», which would then have
    // turned a whole day's total unknown for no visible reason.
    expect(scaleNutrients({ ...NUTRIENTS, fibre: 'трохи' }, '55.00')).toBeNull();
  });

  it('refuses to render a negative or fractional centi value', () => {
    // Unreachable today, and the first thing Step 30 will reach for is
    // «target minus consumed» — where an unguarded fromCenti(-1) returns
    // "-1.99".
    expect(() => fromCenti(-1)).toThrow(RangeError);
    expect(() => fromCenti(0.5)).toThrow(RangeError);
    expect(fromCenti(0)).toBe('0.00');
  });
});
