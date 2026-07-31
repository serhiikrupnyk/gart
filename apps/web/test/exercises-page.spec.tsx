import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExercisePage, PublicExercise } from '@gart/shared';

import ExercisesPage from '@/app/(app)/dashboard/exercises/page';
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

jest.mock('@/lib/upload', () => ({
  uploadToStorage: jest.fn(),
}));

export function exercise(overrides: Partial<PublicExercise> = {}): PublicExercise {
  return {
    id: 'ex1',
    name: 'Присідання зі штангою',
    description: null,
    primaryMuscleGroup: 'LEGS',
    muscleGroups: ['GLUTES'],
    categoryId: null,
    textInstructions: null,
    media: [],
    isCustom: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function pageOf(items: PublicExercise[], total = items.length): ExercisePage {
  return { items, total, page: 1, pageSize: 20 };
}

/** Routes API calls by path; individual tests override per-path behaviour. */
function mockApi(routes: Record<string, unknown>): void {
  apiFetch.mockImplementation((path: unknown) => {
    const key = Object.keys(routes).find((prefix) => (path as string).startsWith(prefix));

    if (key === undefined) {
      return Promise.reject(new Error(`unmocked path: ${String(path)}`));
    }

    const value = routes[key];

    return typeof value === 'function'
      ? (value as (p: string) => Promise<unknown>)(path as string)
      : Promise.resolve(value);
  });
}

function renderPage() {
  return render(
    <ToastProvider>
      <ExercisesPage />
    </ToastProvider>,
  );
}

function exerciseCalls(): string[] {
  return apiFetch.mock.calls
    .map((call) => call[0] as string)
    .filter((path) => path.startsWith('/exercises?'));
}

describe('ExercisesPage', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    jest.useRealTimers();
  });

  it('lists exercises, badging only the custom ones', async () => {
    mockApi({
      '/exercises?': pageOf([
        exercise(),
        exercise({ id: 'ex2', name: 'Моє присідання', isCustom: true }),
      ]),
      '/categories': [],
    });
    renderPage();

    expect(await screen.findByText('Присідання зі штангою')).toBeInTheDocument();
    expect(screen.getByText('Моє присідання')).toBeInTheDocument();
    expect(screen.getAllByText('Моя')).toHaveLength(1);
    expect(screen.getByText(/Показано 1–2 з 2/)).toBeInTheDocument();
  });

  it('omits empty filter params and includes chosen ones', async () => {
    mockApi({ '/exercises?': pageOf([exercise()]), '/categories': [] });
    renderPage();

    await screen.findByText('Присідання зі штангою');

    const first = exerciseCalls()[0] ?? '';
    expect(first).toContain('page=1');
    expect(first).not.toContain('search=');
    expect(first).not.toContain('muscleGroup=');
    expect(first).not.toContain('categoryId=');

    await userEvent.selectOptions(screen.getByLabelText("Група м'язів"), 'CHEST');

    await waitFor(() => {
      expect(exerciseCalls().at(-1)).toContain('muscleGroup=CHEST');
    });
    // Any filter change starts over from the first page.
    expect(exerciseCalls().at(-1)).toContain('page=1');
  });

  it('debounces the search input before querying', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    mockApi({ '/exercises?': pageOf([exercise()]), '/categories': [] });
    renderPage();

    await screen.findByText('Присідання зі штангою');
    const before = exerciseCalls().length;

    await user.type(screen.getByLabelText('Пошук вправи'), 'жим');
    // Nothing yet — the debounce window is still open.
    expect(exerciseCalls().length).toBe(before);

    jest.advanceTimersByTime(350);

    await waitFor(() => {
      expect(exerciseCalls().at(-1)).toContain(`search=${encodeURIComponent('жим')}`);
    });
    // One query for the settled value, not one per keystroke.
    expect(exerciseCalls().length).toBe(before + 1);
  });

  it('pages forward with Далі', async () => {
    mockApi({
      '/exercises?': (path: string) =>
        Promise.resolve(
          path.includes('page=2')
            ? {
                items: [exercise({ id: 'ex21', name: 'Друга сторінка' })],
                total: 25,
                page: 2,
                pageSize: 20,
              }
            : { items: [exercise()], total: 25, page: 1, pageSize: 20 },
        ),
      '/categories': [],
    });
    renderPage();

    await screen.findByText('Присідання зі штангою');
    await userEvent.click(screen.getByRole('button', { name: 'Далі →' }));

    expect(await screen.findByText('Друга сторінка')).toBeInTheDocument();
    expect(screen.getByText(/Показано 21–25 з 25/)).toBeInTheDocument();
  });

  it('shows the filtered empty state with a reset action', async () => {
    mockApi({
      '/exercises?': (path: string) =>
        Promise.resolve(path.includes('muscleGroup') ? pageOf([]) : pageOf([exercise()])),
      '/categories': [],
    });
    renderPage();

    await screen.findByText('Присідання зі штангою');
    await userEvent.selectOptions(screen.getByLabelText("Група м'язів"), 'CALVES');

    expect(await screen.findByText('Нічого не знайдено')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Скинути фільтри' }));

    expect(await screen.findByText('Присідання зі штангою')).toBeInTheDocument();
  });

  it('shows the library-empty state when there are no exercises at all', async () => {
    mockApi({ '/exercises?': pageOf([]), '/categories': [] });
    renderPage();

    expect(await screen.findByText('Бібліотека порожня')).toBeInTheDocument();
  });

  it('deletes only after confirmation', async () => {
    const custom = exercise({ id: 'mine', name: 'Моє присідання', isCustom: true });
    const remove = jest.fn(() => Promise.resolve(null));
    mockApi({
      '/exercises?': pageOf([custom]),
      '/categories': [],
      '/exercises/mine': () => remove() as Promise<unknown>,
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Моє присідання' }));

    // Detail modal → Видалити → confirm dialog appears, nothing deleted yet.
    await userEvent.click(screen.getByRole('button', { name: 'Видалити' }));
    expect(await screen.findByText('Видалити вправу?')).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    // Скасувати closes the confirm without a call…
    await userEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(remove).not.toHaveBeenCalled();

    // …and confirming actually deletes.
    await userEvent.click(screen.getByRole('button', { name: 'Видалити' }));
    await screen.findByText('Видалити вправу?');
    await userEvent.click(screen.getAllByRole('button', { name: 'Видалити' })[1] as HTMLElement);

    await waitFor(() => {
      expect(remove).toHaveBeenCalledTimes(1);
    });
  });
});
