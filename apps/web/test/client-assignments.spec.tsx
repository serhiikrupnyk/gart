import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicAssignment, PublicProgram } from '@gart/shared';

import { ClientAssignments } from '@/components/clients/client-assignments';
import { ToastProvider } from '@/components/ui';

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  ApiError: class extends Error {
    constructor(
      message: string,
      readonly status = 400,
    ) {
      super(message);
    }
  },
}));

function assignment(overrides: Partial<PublicAssignment> = {}): PublicAssignment {
  return {
    id: 'as-1',
    name: 'Сила: день 1',
    description: null,
    type: 'STRENGTH',
    status: 'ACTIVE',
    startDate: '2026-08-03',
    endDate: null,
    daysOfWeek: [1, 3, 5],
    sourceProgramId: 'prog-1',
    sectionCount: 2,
    exerciseCount: 7,
    assignedAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function template(overrides: Partial<PublicProgram> = {}): PublicProgram {
  return {
    id: 'prog-1',
    name: 'Сила: день 1',
    description: null,
    type: 'STRENGTH',
    sectionCount: 2,
    exerciseCount: 7,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Routes by method+path; assignment lists and program pages by default. */
function mockApi(
  overrides: Record<string, (init?: { body?: string }) => Promise<unknown>> = {},
): void {
  apiFetch.mockImplementation((path: unknown, init?: { method?: string; body?: string }) => {
    const key = `${init?.method ?? 'GET'} ${path as string}`;
    const custom = Object.keys(overrides).find((prefix) => key.startsWith(prefix));

    if (custom !== undefined)
      return (overrides[custom] as (i?: { body?: string }) => Promise<unknown>)(init);
    if (key.startsWith('GET /clients/c1/assignments')) return Promise.resolve([assignment()]);
    if (key.startsWith('GET /programs')) {
      return Promise.resolve({ items: [template()], total: 1, page: 1, pageSize: 100 });
    }

    return Promise.reject(new Error(`unmocked ${key}`));
  });
}

function renderSection() {
  return render(
    <ToastProvider>
      <ClientAssignments clientId="c1" />
    </ToastProvider>,
  );
}

describe('ClientAssignments', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('renders assignments with schedule and status labels', async () => {
    mockApi();
    renderSection();

    expect(await screen.findByText('Сила: день 1')).toBeInTheDocument();
    expect(screen.getByText('Активна')).toBeInTheDocument();
    expect(screen.getByText('Силове')).toBeInTheDocument();
    expect(screen.getByText(/Пн·Ср·Пт · з 03\.08\.2026 · 7 вправ/)).toBeInTheDocument();
  });

  it('shows the empty hint when nothing is assigned', async () => {
    mockApi({ 'GET /clients/c1/assignments': () => Promise.resolve([]) });
    renderSection();

    expect(await screen.findByText('Ще нічого не призначено.')).toBeInTheDocument();
  });

  it('changes status through the row menu', async () => {
    const patch = jest.fn((init?: { body?: string }) => {
      void init;

      return Promise.resolve(assignment({ status: 'COMPLETED' }));
    });
    mockApi({ 'PATCH /assignments/as-1': (init) => patch(init) as Promise<unknown> });
    renderSection();

    await screen.findByText('Сила: день 1');
    await userEvent.click(
      screen.getByRole('button', { name: 'Дії з призначенням «Сила: день 1»' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Завершити' }));

    await waitFor(() => {
      expect(patch).toHaveBeenCalledTimes(1);
    });
    expect(JSON.parse(patch.mock.calls[0]?.[0]?.body ?? '{}')).toEqual({ status: 'COMPLETED' });
  });

  it('deletes only after confirmation', async () => {
    const remove = jest.fn(() => Promise.resolve(null));
    mockApi({ 'DELETE /assignments/as-1': () => remove() as Promise<unknown> });
    renderSection();

    await screen.findByText('Сила: день 1');
    await userEvent.click(
      screen.getByRole('button', { name: 'Дії з призначенням «Сила: день 1»' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Видалити' }));

    expect(await screen.findByText('Видалити призначення?')).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(remove).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Дії з призначенням «Сила: день 1»' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Видалити' }));
    await screen.findByText('Видалити призначення?');
    await userEvent.click(screen.getByRole('button', { name: 'Видалити' }));

    await waitFor(() => {
      expect(remove).toHaveBeenCalledTimes(1);
    });
  });

  describe('assign flow', () => {
    it('submits programId, dates and days, and mentions the snapshot', async () => {
      const post = jest.fn((init?: { body?: string }) => {
        void init;

        return Promise.resolve(assignment());
      });
      mockApi({ 'POST /clients/c1/assignments': (init) => post(init) as Promise<unknown> });
      renderSection();

      await screen.findByText('Сила: день 1');
      await userEvent.click(screen.getByRole('button', { name: 'Призначити програму' }));

      // The snapshot semantics are stated in the dialog.
      expect(
        await screen.findByText(/Клієнт отримає копію програми — подальші зміни шаблону/),
      ).toBeInTheDocument();

      await userEvent.selectOptions(screen.getByLabelText('Програма'), 'prog-1');
      const start = screen.getByLabelText('Початок');
      await userEvent.clear(start);
      await userEvent.type(start, '2026-08-03');
      await userEvent.click(screen.getByRole('checkbox', { name: 'Пн' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Пт' }));

      await userEvent.click(screen.getByRole('button', { name: 'Призначити' }));

      await waitFor(() => {
        expect(post).toHaveBeenCalledTimes(1);
      });
      expect(JSON.parse(post.mock.calls[0]?.[0]?.body ?? '{}')).toEqual({
        programId: 'prog-1',
        startDate: '2026-08-03',
        endDate: null,
        daysOfWeek: [1, 5],
      });
    });

    it('blocks submission without a program or days, with no API call', async () => {
      const post = jest.fn();
      mockApi({ 'POST /clients/c1/assignments': () => post() as Promise<unknown> });
      renderSection();

      await screen.findByText('Сила: день 1');
      await userEvent.click(screen.getByRole('button', { name: 'Призначити програму' }));
      await screen.findByLabelText('Програма');
      await userEvent.click(screen.getByRole('button', { name: 'Призначити' }));

      expect(await screen.findByText('Оберіть програму')).toBeInTheDocument();
      expect(screen.getByText('Оберіть щонайменше один день')).toBeInTheDocument();
      expect(post).not.toHaveBeenCalled();
    });

    it('surfaces an API rejection as the form error', async () => {
      const { ApiError } = jest.requireMock<{ ApiError: new (m: string) => Error }>('@/lib/api');
      mockApi({
        'POST /clients/c1/assignments': () => Promise.reject(new ApiError('Клієнт в архіві')),
      });
      renderSection();

      await screen.findByText('Сила: день 1');
      await userEvent.click(screen.getByRole('button', { name: 'Призначити програму' }));
      await userEvent.selectOptions(await screen.findByLabelText('Програма'), 'prog-1');
      await userEvent.click(screen.getByRole('checkbox', { name: 'Пн' }));
      await userEvent.click(screen.getByRole('button', { name: 'Призначити' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Клієнт в архіві');
    });
  });
});
