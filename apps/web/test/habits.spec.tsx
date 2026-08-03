import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HabitsView, HabitStatus } from '@gart/shared';

import { ClientHabits } from '@/components/habits/client-habits';
import { MyHabits } from '@/components/habits/my-habits';
import { ToastProvider } from '@/components/ui';

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  ApiError: class extends Error {},
}));

const TODAY = '2026-08-06';

function days(met: (boolean | null)[]): HabitStatus['recentDays'] {
  return met.map((state, index) => ({
    date: `2026-07-3${String(index + 1)}`.slice(0, 10),
    value: state === null ? null : state ? 1 : 0.5,
    met: state === true,
  }));
}

function walk(overrides: Partial<HabitStatus> = {}): HabitStatus {
  return {
    id: 'h-1',
    name: 'Прогулянка',
    kind: 'CHECK',
    targetValue: 1,
    unit: null,
    today: null,
    currentStreak: 3,
    longestStreak: 5,
    recentDays: days([true, true, true, null, null, null, null]),
    ...overrides,
  };
}

function water(overrides: Partial<HabitStatus> = {}): HabitStatus {
  return {
    id: 'h-2',
    name: 'Вода',
    kind: 'AMOUNT',
    targetValue: 8,
    unit: 'склянок',
    today: { date: TODAY, value: 5, met: false },
    currentStreak: 0,
    longestStreak: 4,
    recentDays: days([null, null, null, null, null, null, false]),
    ...overrides,
  };
}

function view(habits: HabitStatus[]): HabitsView {
  return { date: TODAY, habits };
}

interface FetchInit {
  method?: string;
  body?: string;
}

function mockApi(result: HabitsView): void {
  apiFetch.mockImplementation((path: unknown, init?: FetchInit) => {
    if (init?.method === 'PUT') {
      return Promise.resolve({ date: TODAY, value: 1, met: true });
    }
    if (init?.method !== undefined) {
      return Promise.resolve(null);
    }
    if ((path as string).includes('/habits')) {
      return Promise.resolve(result);
    }

    return Promise.reject(new Error(`Unexpected call: ${path as string}`));
  });
}

function lastWrite(): { path: string; method: string; body: unknown } {
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
    body: call[1].body === undefined ? null : JSON.parse(call[1].body),
  };
}

describe('MyHabits (client)', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  function renderMine() {
    return render(
      <ToastProvider>
        <MyHabits date={TODAY} />
      </ToastProvider>,
    );
  }

  it('records a checkbox habit with one tap at its target', async () => {
    mockApi(view([walk()]));
    const user = userEvent.setup();
    renderMine();

    await screen.findByText('Прогулянка');
    await user.click(screen.getByRole('button', { name: 'Відмітити' }));

    expect(lastWrite()).toMatchObject({
      method: 'PUT',
      path: `/me/habits/h-1/logs/${TODAY}`,
      body: { value: 1 },
    });
  });

  it('untaps by deleting the day, not by writing a zero', async () => {
    mockApi(view([walk({ today: { date: TODAY, value: 1, met: true } })]));
    const user = userEvent.setup();
    renderMine();

    await screen.findByText('Прогулянка');
    await user.click(screen.getByRole('button', { name: '✓ Виконано' }));

    expect(lastWrite()).toMatchObject({
      method: 'DELETE',
      path: `/me/habits/h-1/logs/${TODAY}`,
    });
  });

  it('prefills a measured habit and saves a decimal-comma value', async () => {
    mockApi(view([water()]));
    const user = userEvent.setup();
    renderMine();

    const input = await screen.findByLabelText('Значення: Вода');
    expect(input).toHaveValue('5');
    expect(screen.getByText('5 з 8 склянок')).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, '7,5');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(lastWrite().body).toEqual({ value: 7.5 });
  });

  it('shows a streak, and encouragement instead of failure at zero', async () => {
    mockApi(view([walk(), water()]));
    renderMine();

    expect(await screen.findByText(/3 дні поспіль/)).toBeInTheDocument();
    // Water has no current streak: the record is shown, not a reprimand.
    expect(screen.getByText('Найдовша серія: 4')).toBeInTheDocument();
    expect(screen.getByText('0 з 2')).toBeInTheDocument();
  });

  it('celebrates once every habit is done for the day', async () => {
    mockApi(
      view([
        walk({ today: { date: TODAY, value: 1, met: true } }),
        water({ today: { date: TODAY, value: 8, met: true } }),
      ]),
    );
    renderMine();

    expect(await screen.findByText('Усі звички на сьогодні виконано')).toBeInTheDocument();
  });

  it('marks each of the last seven days as met, partial or untouched', async () => {
    mockApi(view([walk()]));
    renderMine();

    const strip = await screen.findByRole('list', { name: 'Останній тиждень' });
    expect(within(strip).getAllByRole('listitem')).toHaveLength(7);
    expect(within(strip).getAllByText(/виконано$/)).toHaveLength(3);
    expect(within(strip).getAllByText(/без відмітки$/)).toHaveLength(4);
  });

  it('renders nothing at all when the client has no habits', async () => {
    mockApi(view([]));
    const { container } = renderMine();

    // The card is not an empty state — an absent feature should be absent.
    expect(apiFetch).toHaveBeenCalled();
    expect(container.querySelector('section')).not.toBeInTheDocument();
  });
});

describe('ClientHabits (trainer)', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  function renderTrainer() {
    return render(
      <ToastProvider>
        <ClientHabits clientId="c-1" />
      </ToastProvider>,
    );
  }

  it('lists habits with their target, streak and week strip', async () => {
    mockApi(view([water()]));
    renderTrainer();

    expect(await screen.findByText(/ціль: 8 склянок/)).toBeInTheDocument();
    expect(screen.getByText('Найдовша серія: 4')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Останній тиждень' })).toBeInTheDocument();
  });

  it('offers no way to record a day — that is the client’s act', async () => {
    mockApi(view([walk(), water()]));
    renderTrainer();

    await screen.findByText('Прогулянка');

    expect(screen.queryByRole('button', { name: 'Відмітити' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Зберегти' })).not.toBeInTheDocument();
  });

  it('adds a measured habit from a suggestion', async () => {
    mockApi(view([]));
    const user = userEvent.setup();
    renderTrainer();

    await screen.findByText('Ще немає звичок. Додайте те, що клієнт має робити щодня.');
    await user.click(screen.getByRole('button', { name: 'Додати звичку' }));
    await user.click(screen.getByRole('button', { name: 'Вода' }));
    await user.click(screen.getByRole('button', { name: 'Додати' }));

    expect(lastWrite()).toMatchObject({
      method: 'POST',
      path: '/clients/c-1/habits',
      body: { name: 'Вода', kind: 'AMOUNT', targetValue: 8, unit: 'склянок' },
    });
  });

  it('sends no target or unit for a checkbox habit', async () => {
    mockApi(view([]));
    const user = userEvent.setup();
    renderTrainer();

    await screen.findByRole('button', { name: 'Додати звичку' });
    await user.click(screen.getByRole('button', { name: 'Додати звичку' }));
    await user.click(screen.getByRole('button', { name: 'Прогулянка' }));

    // The target and unit fields are not even rendered for a checkbox habit.
    expect(screen.queryByLabelText('Ціль')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Одиниця')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Додати' }));

    expect(lastWrite().body).toEqual({ name: 'Прогулянка', kind: 'CHECK' });
  });
});
