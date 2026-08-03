import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClientAssignment, ClientWorkout, ClientWorkoutDay } from '@gart/shared';

import ClientHomePage from '@/app/client/page';
import { ToastProvider } from '@/components/ui';

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  ApiError: class extends Error {},
}));

function plan(overrides: Partial<ClientAssignment> = {}): ClientAssignment {
  return {
    id: 'as-1',
    name: 'Сила: день 1',
    description: null,
    type: 'STRENGTH',
    status: 'ACTIVE',
    startDate: '2026-08-03',
    endDate: null,
    daysOfWeek: [1, 4],
    sectionCount: 2,
    exerciseCount: 2,
    ...overrides,
  };
}

function workout(): ClientWorkout {
  return {
    ...plan(),
    sections: [
      {
        id: 's-1',
        name: 'Основна частина',
        type: 'STRENGTH',
        timeCapSeconds: null,
        intervalSeconds: null,
        rounds: null,
        restBetweenRoundsSeconds: null,
        exercises: [
          {
            id: 'ae-1',
            exercise: {
              id: 'ex-1',
              name: 'Присідання',
              primaryMuscleGroup: 'LEGS',
              textInstructions: 'Спина рівна, коліна за носками.',
              media: [
                {
                  kind: 'VIDEO',
                  contentType: 'video/mp4',
                  sizeBytes: 2048,
                  uploadedAt: '2026-08-01T00:00:00.000Z',
                },
              ],
            },
            log: null,
            sets: 5,
            reps: 5,
            loadValue: 82.5,
            loadUnit: 'KG',
            loadText: null,
            restSeconds: null,
            tempo: null,
            notes: null,
            durationSeconds: null,
            distanceMeters: null,
          },
        ],
      },
      {
        id: 's-2',
        name: 'Фінішер',
        type: 'AMRAP',
        timeCapSeconds: 720,
        intervalSeconds: null,
        rounds: null,
        restBetweenRoundsSeconds: null,
        exercises: [
          {
            id: 'ae-2',
            exercise: {
              id: 'ex-2',
              name: 'Планка',
              primaryMuscleGroup: 'CORE',
              textInstructions: null,
              media: [],
            },
            log: null,
            sets: null,
            reps: null,
            loadValue: null,
            loadUnit: null,
            loadText: 'до відмови',
            restSeconds: null,
            tempo: null,
            notes: null,
            durationSeconds: 40,
            distanceMeters: null,
          },
        ],
      },
    ],
  };
}

/** Routes GETs by path; today has a workout, the plan list has one plan. */
function mockApi(overrides: Record<string, () => Promise<unknown>> = {}): void {
  apiFetch.mockImplementation((path: unknown) => {
    const key = path as string;
    const custom = Object.keys(overrides).find((prefix) => key.startsWith(prefix));

    if (custom !== undefined) {
      return overrides[custom]?.();
    }
    if (key.startsWith('/me/workouts')) {
      const date = key.split('date=')[1] ?? '';
      const day: ClientWorkoutDay = {
        date,
        workouts: date === '2026-08-06' ? [workout()] : [],
      };

      return Promise.resolve(day);
    }
    if (key === '/me/assignments') {
      return Promise.resolve([plan()]);
    }
    if (key.includes('/media-url')) {
      return Promise.resolve({ url: 'https://storage.test/get/clip', expiresAt: '2099-01-01' });
    }

    return Promise.reject(new Error(`Unexpected call: ${key}`));
  });
}

function renderHome() {
  return render(
    <ToastProvider>
      <ClientHomePage />
    </ToastProvider>,
  );
}

describe('ClientHomePage («Сьогодні»)', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    // Thursday 2026-08-06, mid-day local time — a scheduled training day.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 6, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setupUser() {
    return userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
  }

  it("asks the API for the device's local today and renders the workout", async () => {
    mockApi();
    renderHome();

    expect(await screen.findByRole('heading', { name: 'Сьогодні' })).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/me/workouts?date=2026-08-06');

    expect(screen.getByRole('heading', { name: 'Сила: день 1' })).toBeInTheDocument();
    expect(screen.getByText('Основна частина')).toBeInTheDocument();
    expect(screen.getByText('5×5 · 82,5 кг')).toBeInTheDocument();
    expect(screen.getByText('ліміт 12 хв')).toBeInTheDocument();
    expect(screen.getByText('40 с · до відмови')).toBeInTheDocument();
  });

  it('loads media only on tap, through the standard media-url endpoint', async () => {
    mockApi();
    const user = setupUser();
    const { container } = renderHome();

    await screen.findByText('Присідання');
    expect(container.querySelector('video')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Відтворити' }));

    expect(apiFetch).toHaveBeenCalledWith('/exercises/ex-1/media-url?kind=VIDEO');
    await waitFor(() => {
      expect(container.querySelector('video')).toBeInTheDocument();
    });
  });

  it('opens the technique notes on demand', async () => {
    mockApi();
    const user = setupUser();
    renderHome();

    await screen.findByText('Присідання');
    expect(screen.queryByText('Спина рівна, коліна за носками.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Як виконувати' }));

    expect(screen.getByText('Спина рівна, коліна за носками.')).toBeInTheDocument();
  });

  it('shows a calm rest day with the next session', async () => {
    mockApi({
      '/me/workouts': () => Promise.resolve({ date: '2026-08-06', workouts: [] }),
      '/me/assignments': () => Promise.resolve([plan({ daysOfWeek: [1] })]),
    });
    renderHome();

    expect(await screen.findByText('Сьогодні відпочинок')).toBeInTheDocument();
    expect(screen.getByText('Наступне тренування — понеділок, 10 серпня.')).toBeInTheDocument();
  });

  it('re-queries the tapped day on the week strip', async () => {
    mockApi();
    const user = setupUser();
    renderHome();

    await screen.findByRole('heading', { name: 'Сила: день 1' });

    await user.click(screen.getByRole('button', { name: /Понеділок, 3 серпня/ }));

    expect(apiFetch).toHaveBeenCalledWith('/me/workouts?date=2026-08-03');
    expect(await screen.findByRole('heading', { name: 'Понеділок, 3 серпня' })).toBeInTheDocument();
    expect(await screen.findByText('На цей день тренувань немає')).toBeInTheDocument();
  });

  it('marks scheduled days on the strip', async () => {
    mockApi();
    renderHome();

    await screen.findByRole('heading', { name: 'Сила: день 1' });

    // Mon + Thu carry the plan's dot; Tuesday does not.
    expect(
      screen.getByRole('button', { name: 'Понеділок, 3 серпня, заплановано тренування' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Четвер, 6 серпня, заплановано тренування' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вівторок, 4 серпня' })).toBeInTheDocument();
  });

  it('lists the plan under «Мій план»', async () => {
    mockApi();
    renderHome();

    expect(await screen.findByRole('heading', { name: 'Мій план' })).toBeInTheDocument();
    expect(screen.getByText(/Пн·Чт · з 03\.08\.2026/)).toBeInTheDocument();
  });

  it('shows the honest empty frame for a client with no programs', async () => {
    mockApi({
      '/me/workouts': () => Promise.resolve({ date: '2026-08-06', workouts: [] }),
      '/me/assignments': () => Promise.resolve([]),
    });
    renderHome();

    expect(await screen.findByText('Тренувань ще немає')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Дні тижня' })).not.toBeInTheDocument();
  });
});
