import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClientProgress, ExerciseLoadHistory, LoggedExerciseSummary } from '@gart/shared';

import { ClientProgressPanel } from '@/components/progress/client-progress';
import { ToastProvider } from '@/components/ui';

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  ApiError: class extends Error {},
}));

function progress(overrides: Partial<ClientProgress> = {}): ClientProgress {
  return {
    from: '2026-02-07',
    to: '2026-08-06',
    variables: [
      {
        id: 'v-1',
        name: 'Вага',
        unit: 'кг',
        selfLog: true,
        points: [
          { date: '2026-07-01', value: 84.35, notes: null },
          { date: '2026-08-01', value: 83, notes: null },
        ],
      },
    ],
    photos: [
      {
        id: 'p-1',
        date: '2026-08-01',
        label: 'Спереду',
        contentType: 'image/jpeg',
        sizeBytes: 2048,
        uploadedAt: '2026-08-01T10:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

const EXERCISES: LoggedExerciseSummary[] = [
  { id: 'ex-1', name: 'Присідання', sessions: 3, lastDate: '2026-08-05' },
];

const HISTORY: ExerciseLoadHistory = {
  exercise: EXERCISES[0]!,
  points: [
    { date: '2026-07-20', topSetKg: 80, volumeKg: 1200, estimatedOneRepMaxKg: 93.33 },
    { date: '2026-08-05', topSetKg: 90, volumeKg: 1350, estimatedOneRepMaxKg: 99 },
  ],
};

interface FetchInit {
  method?: string;
  body?: string;
}

function mockApi(overrides: Record<string, () => Promise<unknown>> = {}): void {
  apiFetch.mockImplementation((path: unknown, init?: FetchInit) => {
    const key = path as string;
    const custom = Object.keys(overrides).find((prefix) => key.startsWith(prefix));

    if (custom !== undefined) {
      return overrides[custom]?.();
    }
    if (init?.method !== undefined) {
      return Promise.resolve({ date: '2026-08-06', value: 82, notes: null });
    }
    if (key.endsWith('/progress/exercises')) {
      return Promise.resolve(EXERCISES);
    }
    if (key.includes('/progress/exercises/')) {
      return Promise.resolve(HISTORY);
    }
    if (key.includes('/progress/photos/') && key.endsWith('/url')) {
      return Promise.resolve({ url: 'https://storage.test/get/photo', expiresAt: '2099-01-01' });
    }
    if (key.endsWith('/progress')) {
      return Promise.resolve(progress());
    }

    return Promise.reject(new Error(`Unexpected call: ${key}`));
  });
}

function renderPanel() {
  return render(
    <ToastProvider>
      <ClientProgressPanel clientId="c-1" />
    </ToastProvider>,
  );
}

describe('ClientProgressPanel', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('charts each tracked dimension with its latest value', async () => {
    mockApi();
    renderPanel();

    expect(await screen.findByRole('heading', { name: 'Показники' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Вага/ })).toBeInTheDocument();
    expect(screen.getByText('Останній: 83 кг')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Вага: 2 замірів з 01.07.2026 до 01.08.2026/ }),
    ).toBeInTheDocument();
  });

  it('records a measurement with a Ukrainian decimal comma', async () => {
    mockApi();
    const user = userEvent.setup();
    renderPanel();

    await screen.findByRole('heading', { name: /Вага/ });

    await user.clear(screen.getByLabelText('Дата заміру: Вага'));
    await user.type(screen.getByLabelText('Дата заміру: Вага'), '2026-08-06');
    await user.type(screen.getByLabelText('Значення: Вага'), '82,4');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    const write = apiFetch.mock.calls.find(
      (call: unknown[]) => (call[1] as FetchInit | undefined)?.method === 'PUT',
    ) as [string, FetchInit] | undefined;

    expect(write?.[0]).toBe('/progress/variables/v-1/entries/2026-08-06');
    expect(JSON.parse(write?.[1].body ?? '{}')).toEqual({ value: 82.4 });
  });

  it('fetches a photo URL only when the photo is opened', async () => {
    mockApi();
    const user = userEvent.setup();
    renderPanel();

    await screen.findByRole('heading', { name: 'Фото прогресу' });
    expect(apiFetch).not.toHaveBeenCalledWith('/progress/photos/p-1/url');

    await user.click(screen.getByRole('button', { name: '01.08.2026' }));

    expect(apiFetch).toHaveBeenCalledWith('/progress/photos/p-1/url');
    expect(await screen.findByAltText('Спереду')).toHaveAttribute(
      'src',
      'https://storage.test/get/photo',
    );
  });

  it('shows the exercise load trend and switches metric', async () => {
    mockApi();
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByRole('heading', { name: 'Динаміка по вправі' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /Присідання/ })).toBeInTheDocument();

    // Top set by default: the last point is 90 kg.
    await user.click(screen.getAllByRole('button', { name: 'Показати таблицю' })[1]!);
    const tables = screen.getAllByRole('table');
    expect(within(tables[tables.length - 1]!).getByText('90 кг')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Обʼєм' }));
    expect(screen.getByRole('img', { name: /від 1200 до 1350 кг/ })).toBeInTheDocument();
  });

  it('is honest when there is nothing tracked yet', async () => {
    mockApi({
      '/clients/c-1/progress/exercises': () => Promise.resolve([]),
      '/clients/c-1/progress': () => Promise.resolve(progress({ variables: [], photos: [] })),
    });
    renderPanel();

    expect(
      await screen.findByText(
        'Ще немає показників. Додайте те, що ви відстежуєте для цього клієнта.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Фото ще немає.')).toBeInTheDocument();
    expect(await screen.findByText(/Клієнт ще не записав жодного тренування/)).toBeInTheDocument();
  });

  it('adds a variable from a suggestion', async () => {
    mockApi();
    const user = userEvent.setup();
    renderPanel();

    await screen.findByRole('heading', { name: 'Показники' });
    await user.click(screen.getByRole('button', { name: 'Додати показник' }));
    await user.click(screen.getByRole('button', { name: 'Обхват талії' }));
    await user.click(screen.getByRole('button', { name: 'Додати' }));

    const write = apiFetch.mock.calls.find(
      (call: unknown[]) => (call[1] as FetchInit | undefined)?.method === 'POST',
    ) as [string, FetchInit] | undefined;

    expect(write?.[0]).toBe('/clients/c-1/progress/variables');
    expect(JSON.parse(write?.[1].body ?? '{}')).toEqual({
      name: 'Обхват талії',
      unit: 'см',
      selfLog: false,
    });
  });
});
