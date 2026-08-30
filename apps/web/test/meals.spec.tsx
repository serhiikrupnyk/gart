import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClientNutrition, PublicMeal, PublicMealPlan } from '@gart/shared';
import { compareToTarget, multiplyNutrients, scaleNutrients, sumNutrients } from '@gart/shared';

import ClientNutritionPage from '@/app/client/nutrition/page';
import MealsPage from '@/app/(app)/dashboard/nutrition/meals/page';
import PlansPage from '@/app/(app)/dashboard/nutrition/plans/page';
import { NutritionTabs } from '@/components/nutrition/nutrition-tabs';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ToastProvider } from '@/components/ui';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dashboard/nutrition/meals',
}));

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  API_URL: 'http://api.test',
  ApiError: class extends Error {},
}));

const NUTRIENTS = {
  kcal: '190.00',
  protein: '19.00',
  fat: '9.50',
  carbs: '9.50',
  fibre: '2.00',
  sugars: '1.00',
  saturatedFat: '1.00',
  salt: '0.10',
};

function meal(overrides: Partial<PublicMeal> = {}): PublicMeal {
  return {
    id: 'm1',
    name: 'Вівсянка з бананом',
    notes: null,
    items: [
      {
        id: 'i1',
        foodId: 'f1',
        foodName: 'Вівсяні пластівці',
        grams: '80.00',
        portionLabel: null,
        portionCount: null,
        nutrients: { ...NUTRIENTS, kcal: '80.00' },
      },
    ],
    nutrients: NUTRIENTS,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function plan(overrides: Partial<PublicMealPlan> = {}): PublicMealPlan {
  return {
    id: 'p1',
    name: 'День на дефіциті',
    targets: { kcal: '2000.00', protein: '150.00', fat: '60.00', carbs: '210.00' },
    slots: [
      {
        id: 's1',
        slot: 'BREAKFAST',
        name: 'Ранок',
        servings: '2.00',
        meal: meal(),
        nutrients: { ...NUTRIENTS, kcal: '380.00' },
      },
    ],
    nutrients: { ...NUTRIENTS, kcal: '380.00' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const ON_GROW = { available: true, customFoodCount: 0, requiredPlan: 'GROW' as const };

function renderWith(node: React.ReactElement) {
  return render(
    <ThemeProvider initial="system">
      <ToastProvider>{node}</ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe('the nutrition sub-navigation', () => {
  it('links all three sections', () => {
    renderWith(<NutritionTabs active="/dashboard/nutrition/meals" />);

    expect(screen.getByRole('link', { name: 'Продукти' })).toHaveAttribute(
      'href',
      '/dashboard/nutrition',
    );
    expect(screen.getByRole('link', { name: 'Страви' })).toHaveAttribute(
      'href',
      '/dashboard/nutrition/meals',
    );
    expect(screen.getByRole('link', { name: 'Плани' })).toHaveAttribute(
      'href',
      '/dashboard/nutrition/plans',
    );
    expect(screen.getByRole('link', { name: 'Страви' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('the meals page', () => {
  it('shows each meal with its derived totals and its lines', async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === '/nutrition/status') return Promise.resolve(ON_GROW);
      if (path.startsWith('/nutrition/meals?')) {
        return Promise.resolve({ items: [meal()], total: 1, page: 1, pageSize: 20 });
      }

      return Promise.resolve(null);
    });

    renderWith(<MealsPage />);

    expect(await screen.findByText('Вівсянка з бананом')).toBeInTheDocument();
    expect(screen.getByText(/190.00/)).toBeInTheDocument();
    expect(screen.getByText(/Вівсяні пластівці — 80.00 г/)).toBeInTheDocument();
  });

  it('offers the upsell to a trainer without GROW, not an error', async () => {
    apiFetch.mockImplementation((path: string) =>
      path === '/nutrition/status'
        ? Promise.resolve({ available: false, customFoodCount: 3, requiredPlan: 'GROW' })
        : Promise.resolve(null),
    );

    renderWith(<MealsPage />);

    expect(await screen.findByText(/Харчування — на тарифі GROW/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Нова страва/ })).not.toBeInTheDocument();
  });

  it('says plainly that a deleted meal leaves given-out copies alone', async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation((path: string) => {
      if (path === '/nutrition/status') return Promise.resolve(ON_GROW);
      if (path.startsWith('/nutrition/meals?')) {
        return Promise.resolve({ items: [meal()], total: 1, page: 1, pageSize: 20 });
      }

      return Promise.resolve(null);
    });

    renderWith(<MealsPage />);

    await user.click(await screen.findByRole('button', { name: 'Видалити Вівсянка з бананом' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/збережуть|не зміняться/)).toBeInTheDocument();
  });
});

describe('the meal composer', () => {
  /** Ninety foods, so page one of the list default cannot be the whole library. */
  const LIBRARY = Array.from({ length: 90 }, (_, index) => ({
    id: `f${String(index)}`,
    name: `Продукт ${String(index).padStart(2, '0')}`,
    brand: null,
    group: 'OTHER' as const,
    nutrients: { ...NUTRIENTS, kcal: '100.00' },
    source: null,
    portions: [{ id: `p${String(index)}`, label: 'склянка', grams: '250.00' }],
    editable: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));

  function serveLibrary() {
    apiFetch.mockImplementation((path: string) => {
      if (path === '/nutrition/status') return Promise.resolve(ON_GROW);
      if (path.startsWith('/nutrition/meals?')) {
        return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20 });
      }
      if (path.startsWith('/nutrition/foods?')) {
        const params = new URLSearchParams(path.split('?')[1] ?? '');
        const size = Number(params.get('pageSize') ?? '20');
        const search = params.get('search') ?? '';
        const matching = LIBRARY.filter((food) => food.name.includes(search));

        return Promise.resolve({
          items: matching.slice(0, size),
          total: matching.length,
          page: 1,
          pageSize: size,
        });
      }

      return Promise.resolve(null);
    });
  }

  it('asks for the whole library, not page one of it', async () => {
    const user = userEvent.setup();
    serveLibrary();
    renderWith(<MealsPage />);

    await user.click(await screen.findByRole('button', { name: /Нова страва/ }));
    await screen.findByRole('dialog');

    // Twenty of ninety meant a trainer could not compose a meal containing
    // anything past «Продукт 19».
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('pageSize=100'));
    });

    await user.click(screen.getByRole('button', { name: /Додати продукт/ }));
    const picker = screen.getByLabelText('Продукт') as HTMLSelectElement;
    expect(picker.options.length).toBeGreaterThan(20);
  });

  it('searches the library rather than scrolling it', async () => {
    const user = userEvent.setup();
    serveLibrary();
    renderWith(<MealsPage />);

    await user.click(await screen.findByRole('button', { name: /Нова страва/ }));
    await user.type(await screen.findByLabelText('Пошук у базі продуктів'), '88');

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('search=88'));
    });
  });

  it('shows no total at all rather than the total of a subset', async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation((path: string) => {
      if (path === '/nutrition/status') return Promise.resolve(ON_GROW);
      if (path.startsWith('/nutrition/meals?')) {
        return Promise.resolve({ items: [meal()], total: 1, page: 1, pageSize: 20 });
      }
      // The library never resolves the meal's food, as an off-page food would.
      if (path.startsWith('/nutrition/foods?')) {
        return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 100 });
      }

      return Promise.resolve(null);
    });

    renderWith(<MealsPage />);
    await user.click(await screen.findByRole('button', { name: 'Редагувати Вівсянка з бананом' }));

    const dialog = await screen.findByRole('dialog');

    // A box labelled «Разом» holding the sum of whatever happened to resolve is
    // worse than no box at all.
    expect(within(dialog).queryByText('Разом')).not.toBeInTheDocument();
    // ...and the row still names its own food rather than rendering blank.
    expect(within(dialog).getByRole('option', { name: 'Вівсяні пластівці' })).toBeInTheDocument();
  });

  it('says what to do when the library is empty, rather than nothing', async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation((path: string) => {
      if (path === '/nutrition/status') return Promise.resolve(ON_GROW);
      if (path.startsWith('/nutrition/meals?')) {
        return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20 });
      }
      if (path.startsWith('/nutrition/foods?')) {
        return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 100 });
      }

      return Promise.resolve(null);
    });

    renderWith(<MealsPage />);
    await user.click(await screen.findByRole('button', { name: /Нова страва/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/додайте перший на вкладці/)).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: /Додати продукт/ }),
    ).not.toBeInTheDocument();
  });

  it('computes grams from a chosen portion, and keeps grams canonical', async () => {
    const user = userEvent.setup();
    serveLibrary();
    renderWith(<MealsPage />);

    await user.click(await screen.findByRole('button', { name: /Нова страва/ }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /Додати продукт/ }));

    await user.selectOptions(screen.getByLabelText('Порція'), 'склянка');

    // One склянка is 250 g, and the grams field — which is what every total is
    // derived from — says so.
    const grams = screen.getByLabelText('Грами') as HTMLInputElement;
    await waitFor(() => {
      expect(grams.value).toBe('250.00');
    });
    expect(grams).toHaveAttribute('readonly');

    await user.clear(screen.getByLabelText('Кількість порцій'));
    await user.type(screen.getByLabelText('Кількість порцій'), '2');
    await waitFor(() => {
      expect((screen.getByLabelText('Грами') as HTMLInputElement).value).toBe('500.00');
    });
  });
});

describe('the plans page', () => {
  function servePlans() {
    apiFetch.mockImplementation((path: string) => {
      if (path === '/nutrition/status') return Promise.resolve(ON_GROW);
      if (path === '/nutrition/plans') return Promise.resolve([plan()]);
      if (path.startsWith('/nutrition/meals?')) {
        return Promise.resolve({ items: [meal()], total: 1, page: 1, pageSize: 20 });
      }
      if (path.startsWith('/clients')) return Promise.resolve([]);

      return Promise.resolve(null);
    });
  }

  it('shows the day, its slots and plan-versus-target', async () => {
    servePlans();
    renderWith(<PlansPage />);

    expect(await screen.findByText('День на дефіциті')).toBeInTheDocument();
    expect(screen.getByText(/Ранок/)).toBeInTheDocument();
    // Subtraction on the trainer's own numbers: 380 planned against 2000.
    expect(screen.getByText(/ціль 2000.00/)).toBeInTheDocument();
    expect(screen.getByText('-1620.00')).toBeInTheDocument();
  });

  it('offers assigning from the plan itself — a reachable entry point', async () => {
    const user = userEvent.setup();
    servePlans();
    renderWith(<PlansPage />);

    await user.click(await screen.findByRole('button', { name: /Надати клієнту/ }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Надати «День на дефіциті»');
  });

  it('says a deleted plan leaves the client copies alone', async () => {
    const user = userEvent.setup();
    servePlans();
    renderWith(<PlansPage />);

    await user.click(await screen.findByRole('button', { name: 'Видалити День на дефіциті' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/збережуть свою\s+копію/)).toBeInTheDocument();
  });
});

describe("the client's plan", () => {
  it('shows what they were given, read-only', async () => {
    apiFetch.mockResolvedValue({
      available: true,
      plans: [
        {
          id: 'a1',
          name: 'День на дефіциті',
          targets: { kcal: '2000.00', protein: null, fat: null, carbs: null },
          meals: [
            {
              id: 'am1',
              slot: 'BREAKFAST',
              name: 'Ранок',
              notes: null,
              servings: '2.00',
              items: meal().items,
              nutrients: { ...NUTRIENTS, kcal: '380.00' },
            },
          ],
          nutrients: { ...NUTRIENTS, kcal: '380.00' },
          startDate: '2026-09-01',
          endDate: null,
          daysOfWeek: [1, 3, 5],
          assignedAt: '2026-08-30T00:00:00.000Z',
        },
      ],
    } satisfies ClientNutrition);

    renderWith(<ClientNutritionPage />);

    expect(await screen.findByText('День на дефіциті')).toBeInTheDocument();
    expect(screen.getByText('Ранок')).toBeInTheDocument();
    expect(screen.getByText(/Пн, Ср, Пт/)).toBeInTheDocument();
    // Read-only this step — logging is Step 31.
    expect(screen.queryByRole('button', { name: /Записати|Зберегти/ })).not.toBeInTheDocument();
  });

  it('names the closed section without blaming anyone or exposing billing', async () => {
    apiFetch.mockResolvedValue({ available: false, plans: [] } satisfies ClientNutrition);

    renderWith(<ClientNutritionPage />);

    expect(await screen.findByText('Розділ харчування зараз недоступний')).toBeInTheDocument();
    expect(screen.getByText(/Ваші плани збережені/)).toBeInTheDocument();

    // Nothing about the trainer's payment, and no fault laid at the client.
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/оплат|тариф|підписк|GROW/i);
  });

  it('distinguishes «nothing assigned» from «section closed»', async () => {
    apiFetch.mockResolvedValue({ available: true, plans: [] } satisfies ClientNutrition);

    renderWith(<ClientNutritionPage />);

    expect(await screen.findByText('Плану харчування ще немає')).toBeInTheDocument();
    expect(screen.queryByText('Розділ харчування зараз недоступний')).not.toBeInTheDocument();
  });
});

describe('the shared arithmetic the screens rely on', () => {
  it('multiplies a serving exactly', () => {
    expect(multiplyNutrients(NUTRIENTS, '2.00')?.kcal).toBe('380.00');
    expect(multiplyNutrients(NUTRIENTS, '1.50')?.kcal).toBe('285.00');
    expect(multiplyNutrients(NUTRIENTS, '0.50')?.kcal).toBe('95.00');
  });

  it('keeps an unmeasured nutrient unmeasured through a multiplication', () => {
    expect(multiplyNutrients({ ...NUTRIENTS, fibre: null }, '2.00')?.fibre).toBeNull();
  });

  it('composes a meal the way the server does', () => {
    const per100 = { ...NUTRIENTS, kcal: '100.00', protein: '10.00' };
    const lines = [scaleNutrients(per100, '80.00'), scaleNutrients(per100, '55.00')];

    expect(sumNutrients(lines.filter((line) => line !== null))?.kcal).toBe('135.00');
  });

  it('renders a difference with its sign, over and under', () => {
    expect(compareToTarget('380.00', '2000.00').difference).toBe('-1620.00');
    expect(compareToTarget('2400.00', '2000.00').difference).toBe('400.00');
    expect(compareToTarget('380.00', null).difference).toBeNull();
  });
});
