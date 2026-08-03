import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  ClientAssignment,
  ClientWorkout,
  ClientWorkoutDay,
  ClientWorkoutLog,
  LogWorkoutExerciseRequest,
} from '@gart/shared';

import ClientHomePage from '@/app/client/page';
import { ToastProvider } from '@/components/ui';

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  ApiError: class extends Error {},
}));

const THURSDAY = '2026-08-06';
const SATURDAY = '2026-08-08';
const TRAINING_DAYS = new Set([THURSDAY, SATURDAY, '2026-08-03']);

function plan(): ClientAssignment {
  return {
    id: 'as-1',
    name: 'Сила: день 1',
    description: null,
    type: 'STRENGTH',
    status: 'ACTIVE',
    startDate: '2026-08-03',
    endDate: null,
    daysOfWeek: [1, 4, 6],
    sectionCount: 1,
    exerciseCount: 2,
  };
}

/** Squat prescribes 5×5 @ 82,5 кг; the plank prescribes seconds only. */
function workout(logs: Record<string, ClientWorkoutLog | null> = {}): ClientWorkout {
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
              textInstructions: null,
              media: [],
            },
            log: logs['ae-1'] ?? null,
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
          {
            id: 'ae-2',
            exercise: {
              id: 'ex-2',
              name: 'Планка',
              primaryMuscleGroup: 'CORE',
              textInstructions: null,
              media: [],
            },
            log: logs['ae-2'] ?? null,
            sets: null,
            reps: null,
            loadValue: null,
            loadUnit: null,
            loadText: null,
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

function savedLog(overrides: Partial<ClientWorkoutLog> = {}): ClientWorkoutLog {
  return {
    completed: true,
    notes: null,
    sets: Array.from({ length: 5 }, () => ({
      reps: 5,
      loadKg: 82.5,
      durationSeconds: null,
      distanceMeters: null,
    })),
    loggedAt: '2026-08-06T10:00:00.000Z',
    updatedAt: '2026-08-06T10:00:00.000Z',
    ...overrides,
  };
}

interface FetchInit {
  method?: string;
  body?: string;
}

/** Routes by method + path. `seed` decides what the day already carries. */
function mockApi(
  seed: Record<string, ClientWorkoutLog | null> = {},
  onWrite: () => ClientWorkoutLog = () => savedLog(),
): void {
  apiFetch.mockImplementation((path: unknown, init?: FetchInit) => {
    const key = path as string;
    const method = init?.method ?? 'GET';

    if (method === 'PUT') {
      return Promise.resolve(onWrite());
    }
    if (method === 'DELETE') {
      return Promise.resolve(null);
    }
    if (key.startsWith('/me/workouts')) {
      const date = key.split('date=')[1] ?? '';
      const day: ClientWorkoutDay = {
        date,
        workouts: TRAINING_DAYS.has(date) ? [workout(seed)] : [],
      };

      return Promise.resolve(day);
    }
    if (key === '/me/assignments') {
      return Promise.resolve([plan()]);
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

/** The call arguments of the single write the test performed. */
function lastWrite(): { path: string; method: string; body: LogWorkoutExerciseRequest | null } {
  const writes = (apiFetch.mock.calls as [string, FetchInit | undefined][]).filter(
    ([, init]) => init?.method !== undefined,
  );
  const call = writes[writes.length - 1] as [string, FetchInit] | undefined;

  if (call === undefined) {
    throw new Error('No write was performed');
  }

  return {
    path: call[0],
    method: call[1].method ?? 'GET',
    body:
      call[1].body === undefined ? null : (JSON.parse(call[1].body) as LogWorkoutExerciseRequest),
  };
}

function squatCard(): HTMLElement {
  return screen.getByRole('heading', { name: 'Присідання' }).parentElement as HTMLElement;
}

describe('workout logging', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    // Thursday 2026-08-06 — a scheduled training day, mid-day local time.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 6, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setupUser() {
    return userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
  }

  it('offers a one-tap record on an unlogged exercise', async () => {
    mockApi();
    renderHome();

    await screen.findByRole('heading', { name: 'Присідання' });

    expect(within(squatCard()).getByRole('button', { name: 'Виконано' })).toBeInTheDocument();
    expect(
      within(squatCard()).getByRole('button', { name: 'Записати інакше' }),
    ).toBeInTheDocument();
    expect(screen.getByText('0 з 2 виконано')).toBeInTheDocument();
  });

  it('writes the prescribed numbers as the actuals in one tap', async () => {
    mockApi();
    const user = setupUser();
    renderHome();

    await screen.findByRole('heading', { name: 'Присідання' });
    await user.click(within(squatCard()).getByRole('button', { name: 'Виконано' }));

    const write = lastWrite();
    expect(write.method).toBe('PUT');
    expect(write.path).toBe(`/me/assignment-exercises/ae-1/logs/${THURSDAY}`);
    expect(write.body).toEqual({
      completed: true,
      notes: null,
      sets: Array.from({ length: 5 }, () => ({
        reps: 5,
        loadKg: 82.5,
        durationSeconds: null,
        distanceMeters: null,
      })),
    });

    // The response replaces the card's state — the API is the source of truth.
    expect(await within(squatCard()).findByText('Факт: 5×5 · 82,5 кг')).toBeInTheDocument();
    // Once recorded, «Виконано» is the badge; the button is gone.
    expect(within(squatCard()).queryByRole('button', { name: 'Виконано' })).not.toBeInTheDocument();
    expect(within(squatCard()).getByText('Виконано')).toBeInTheDocument();
    expect(screen.getByText('1 з 2 виконано')).toBeInTheDocument();
  });

  it('prefills the editor from the prescription and sends what was edited', async () => {
    mockApi();
    const user = setupUser();
    renderHome();

    await screen.findByRole('heading', { name: 'Присідання' });
    await user.click(within(squatCard()).getByRole('button', { name: 'Записати інакше' }));

    const lastReps = within(squatCard()).getByRole('textbox', {
      name: 'Підхід 5, повторення',
    });
    expect(lastReps).toHaveValue('5');

    await user.clear(lastReps);
    await user.type(lastReps, '3');
    await user.click(within(squatCard()).getByRole('button', { name: 'Зберегти' }));

    expect(lastWrite().body?.sets).toHaveLength(5);
    expect(lastWrite().body?.sets[4]).toEqual({
      reps: 3,
      loadKg: 82.5,
      durationSeconds: null,
      distanceMeters: null,
    });
  });

  it('mirrors the prescription: a plank asks for seconds, not reps and kilograms', async () => {
    mockApi();
    const user = setupUser();
    renderHome();

    await screen.findByRole('heading', { name: 'Планка' });

    const plankCard = screen.getByRole('heading', { name: 'Планка' }).parentElement as HTMLElement;
    await user.click(within(plankCard).getByRole('button', { name: 'Записати інакше' }));

    expect(within(plankCard).getByRole('textbox', { name: 'Підхід 1, секунди' })).toHaveValue('40');
    expect(
      within(plankCard).queryByRole('textbox', { name: /повторення/ }),
    ).not.toBeInTheDocument();
    expect(within(plankCard).queryByRole('textbox', { name: /кілограм/ })).not.toBeInTheDocument();
  });

  it('records a deliberate skip with a reason', async () => {
    mockApi({}, () => savedLog({ completed: false, notes: 'біль у коліні', sets: [] }));
    const user = setupUser();
    renderHome();

    await screen.findByRole('heading', { name: 'Присідання' });
    await user.click(within(squatCard()).getByRole('button', { name: 'Записати інакше' }));
    await user.type(
      within(squatCard()).getByRole('textbox', { name: 'Нотатки до вправи' }),
      'біль у коліні',
    );
    await user.click(within(squatCard()).getByRole('button', { name: 'Пропустив' }));

    expect(lastWrite().body).toEqual({ completed: false, notes: 'біль у коліні', sets: [] });
    expect(await within(squatCard()).findByText('Пропущено')).toBeInTheDocument();
    expect(within(squatCard()).getByText('біль у коліні')).toBeInTheDocument();
    // A skip is recorded, but it is not a completion.
    expect(screen.getByText('0 з 2 виконано')).toBeInTheDocument();
  });

  it('reopens an existing record with the logged values, not the prescription', async () => {
    mockApi({
      'ae-1': savedLog({
        sets: [{ reps: 8, loadKg: 60, durationSeconds: null, distanceMeters: null }],
      }),
    });
    const user = setupUser();
    renderHome();

    await screen.findByRole('heading', { name: 'Присідання' });
    expect(within(squatCard()).getByText('Факт: 8 · 60 кг')).toBeInTheDocument();

    await user.click(within(squatCard()).getByRole('button', { name: 'Змінити' }));

    expect(within(squatCard()).getByRole('textbox', { name: 'Підхід 1, повторення' })).toHaveValue(
      '8',
    );
    expect(
      within(squatCard()).queryByRole('textbox', { name: 'Підхід 2, повторення' }),
    ).not.toBeInTheDocument();
  });

  it('undoes a record through DELETE and returns the card to pending', async () => {
    mockApi({ 'ae-1': savedLog() });
    const user = setupUser();
    renderHome();

    await screen.findByRole('heading', { name: 'Присідання' });
    await user.click(within(squatCard()).getByRole('button', { name: 'Скасувати запис' }));

    const write = lastWrite();
    expect(write.method).toBe('DELETE');
    expect(write.path).toBe(`/me/assignment-exercises/ae-1/logs/${THURSDAY}`);

    expect(
      await within(squatCard()).findByRole('button', { name: 'Виконано' }),
    ).toBeInTheDocument();
    expect(screen.getByText('0 з 2 виконано')).toBeInTheDocument();
  });

  it('adds and removes set rows', async () => {
    mockApi();
    const user = setupUser();
    renderHome();

    await screen.findByRole('heading', { name: 'Присідання' });
    await user.click(within(squatCard()).getByRole('button', { name: 'Записати інакше' }));
    await user.click(within(squatCard()).getByRole('button', { name: 'Прибрати підхід 5' }));
    await user.click(within(squatCard()).getByRole('button', { name: 'Зберегти' }));

    expect(lastWrite().body?.sets).toHaveLength(4);
  });

  it('offers no logging on a day that has not happened yet', async () => {
    mockApi();
    const user = setupUser();
    renderHome();

    await screen.findByRole('heading', { name: 'Присідання' });
    await user.click(screen.getByRole('button', { name: /Субота, 8 серпня/ }));

    expect(await screen.findByText(/Записати тренування можна в день заняття/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Виконано' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Записати інакше' })).not.toBeInTheDocument();
  });

  it('shows a past day of this week as still loggable', async () => {
    mockApi();
    const user = setupUser();
    renderHome();

    await screen.findByRole('heading', { name: 'Присідання' });
    await user.click(screen.getByRole('button', { name: /Понеділок, 3 серпня/ }));

    expect(
      await within(squatCard()).findByRole('button', { name: 'Виконано' }),
    ).toBeInTheDocument();

    await user.click(within(squatCard()).getByRole('button', { name: 'Виконано' }));
    expect(lastWrite().path).toBe('/me/assignment-exercises/ae-1/logs/2026-08-03');
  });
});
