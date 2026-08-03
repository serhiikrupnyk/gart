import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  ClientWorkoutHistory,
  TrainerSessionExercise,
  TrainerWorkoutSession,
} from '@gart/shared';

import { ClientActivity } from '@/components/clients/client-activity';
import { ToastProvider } from '@/components/ui';

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  ApiError: class extends Error {},
}));

function squat(overrides: Partial<TrainerSessionExercise> = {}): TrainerSessionExercise {
  return {
    state: 'DONE',
    planned: {
      id: 'ae-1',
      exercise: { id: 'ex-1', name: 'Присідання', primaryMuscleGroup: 'LEGS' },
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
    actual: {
      completed: true,
      notes: null,
      sets: Array.from({ length: 5 }, () => ({
        reps: 5,
        loadKg: 82.5,
        durationSeconds: null,
        distanceMeters: null,
      })),
      loggedAt: '2026-08-05T18:00:00.000Z',
      updatedAt: '2026-08-05T18:00:00.000Z',
    },
    ...overrides,
  };
}

function plank(overrides: Partial<TrainerSessionExercise> = {}): TrainerSessionExercise {
  return {
    state: 'MISSING',
    planned: {
      id: 'ae-2',
      exercise: { id: 'ex-2', name: 'Планка', primaryMuscleGroup: 'CORE' },
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
    actual: null,
    ...overrides,
  };
}

function session(overrides: Partial<TrainerWorkoutSession> = {}): TrainerWorkoutSession {
  return {
    assignmentId: 'as-1',
    date: '2026-08-05',
    name: 'Сила: день 1',
    type: 'STRENGTH',
    state: 'PARTIAL',
    loggedAt: '2026-08-05T18:00:00.000Z',
    exercises: [squat(), plank()],
    ...overrides,
  };
}

function history(overrides: Partial<ClientWorkoutHistory> = {}): ClientWorkoutHistory {
  return {
    from: '2026-07-08',
    to: '2026-08-06',
    adherence: { scheduled: 10, done: 7, partial: 1, skipped: 1, missed: 1 },
    sessions: [session()],
    ...overrides,
  };
}

function mockApi(result: ClientWorkoutHistory = history()): void {
  apiFetch.mockImplementation((path: unknown) => {
    if ((path as string).includes('/workout-history')) {
      return Promise.resolve(result);
    }

    return Promise.reject(new Error(`Unexpected call: ${path as string}`));
  });
}

function renderActivity() {
  return render(
    <ToastProvider>
      <ClientActivity clientId="c-1" />
    </ToastProvider>,
  );
}

describe('ClientActivity', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 6, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setupUser() {
    return userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
  }

  it('states adherence as counts, not a chart', async () => {
    mockApi();
    renderActivity();

    expect(await screen.findByText('7 з 10 запланованих сесій виконано')).toBeInTheDocument();
    expect(screen.getByText(/1 частково · 1 з причиною · 1 без запису/)).toBeInTheDocument();
  });

  it('asks for the selected range and re-queries when it changes', async () => {
    mockApi();
    const user = setupUser();
    renderActivity();

    await screen.findByText('7 з 10 запланованих сесій виконано');
    // Default is 30 days ending today.
    expect(apiFetch).toHaveBeenCalledWith(
      '/clients/c-1/workout-history?from=2026-07-08&to=2026-08-06',
    );

    await user.click(screen.getByRole('tab', { name: '7 днів' }));

    expect(apiFetch).toHaveBeenCalledWith(
      '/clients/c-1/workout-history?from=2026-07-31&to=2026-08-06',
    );
  });

  it('shows each session with its state, and expands to plan beside fact', async () => {
    mockApi();
    const user = setupUser();
    renderActivity();

    const row = await screen.findByRole('button', { name: /Сила: день 1/ });
    expect(within(row).getByText('Частково')).toBeInTheDocument();
    expect(screen.queryByText('Присідання')).not.toBeInTheDocument();

    await user.click(row);

    // Вправа | План | Факт | Стан — done as prescribed means the middle two agree.
    const squatRow = screen.getByRole('cell', { name: 'Присідання' }).parentElement as HTMLElement;
    const squatCells = within(squatRow).getAllByRole('cell');
    expect(squatCells[1]).toHaveTextContent('5×5 · 82,5 кг');
    expect(squatCells[2]).toHaveTextContent('5×5 · 82,5 кг');
    expect(squatCells[3]).toHaveTextContent('Виконано');

    // Nothing recorded: the prescription still shows, the fact column is empty.
    const plankRow = screen.getByRole('cell', { name: 'Планка' }).parentElement as HTMLElement;
    const plankCells = within(plankRow).getAllByRole('cell');
    expect(plankCells[1]).toHaveTextContent('40 с');
    expect(plankCells[2]).toHaveTextContent('—');
    expect(plankCells[3]).toHaveTextContent('Без запису');
  });

  it('renders all four exercise states distinctly', async () => {
    mockApi(
      history({
        sessions: [
          session({
            exercises: [
              squat(),
              squat({
                state: 'DEVIATED',
                actual: {
                  completed: true,
                  notes: null,
                  sets: [{ reps: 4, loadKg: 80, durationSeconds: null, distanceMeters: null }],
                  loggedAt: '2026-08-05T18:00:00.000Z',
                  updatedAt: '2026-08-05T18:00:00.000Z',
                },
              }),
              plank({
                state: 'SKIPPED',
                actual: {
                  completed: false,
                  notes: 'біль у коліні',
                  sets: [],
                  loggedAt: '2026-08-05T18:00:00.000Z',
                  updatedAt: '2026-08-05T18:00:00.000Z',
                },
              }),
              plank(),
            ],
          }),
        ],
      }),
    );
    const user = setupUser();
    renderActivity();

    await user.click(await screen.findByRole('button', { name: /Сила: день 1/ }));

    for (const label of ['Виконано', 'Із відхиленням', 'Пропущено з причиною', 'Без запису']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('4 · 80 кг')).toBeInTheDocument();
  });

  it('pulls a skip reason up to the session row, before anything is expanded', async () => {
    mockApi(
      history({
        sessions: [
          session({
            state: 'SKIPPED',
            exercises: [
              plank({
                state: 'SKIPPED',
                actual: {
                  completed: false,
                  notes: 'біль у коліні',
                  sets: [],
                  loggedAt: '2026-08-05T18:00:00.000Z',
                  updatedAt: '2026-08-05T18:00:00.000Z',
                },
              }),
            ],
          }),
        ],
      }),
    );
    renderActivity();

    expect(await screen.findByText(/біль у коліні/)).toBeInTheDocument();
    // Visible without expanding — the table has not been rendered yet.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('says so honestly when nothing was scheduled', async () => {
    mockApi(
      history({
        adherence: { scheduled: 0, done: 0, partial: 0, skipped: 0, missed: 0 },
        sessions: [],
      }),
    );
    renderActivity();

    expect(
      await screen.findByText('За цей період запланованих тренувань не було.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/запланованих сесій виконано/)).not.toBeInTheDocument();
  });
});
