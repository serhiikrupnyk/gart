import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicExercise, PublicProgramDetail } from '@gart/shared';

import { ProgramBuilder } from '@/components/programs/program-builder';
import { ToastProvider } from '@/components/ui';

const replace = jest.fn();
const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => '/dashboard/programs/new',
}));

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

const LIBRARY: PublicExercise[] = [
  {
    id: 'ex-squat',
    name: 'Присідання',
    description: null,
    primaryMuscleGroup: 'LEGS',
    muscleGroups: [],
    categoryId: null,
    textInstructions: null,
    media: [],
    isCustom: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ex-plank',
    name: 'Планка',
    description: null,
    primaryMuscleGroup: 'CORE',
    muscleGroups: [],
    categoryId: null,
    textInstructions: null,
    media: [],
    isCustom: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const SAVED_DETAIL: PublicProgramDetail = {
  id: 'prog-1',
  name: 'Збережена',
  description: null,
  type: 'STRENGTH',
  sectionCount: 0,
  exerciseCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sections: [],
};

function mockDefaultApi(): void {
  apiFetch.mockImplementation((path: unknown) => {
    const url = path as string;

    if (url.startsWith('/categories')) return Promise.resolve([]);
    if (url.startsWith('/exercises?')) {
      return Promise.resolve({ items: LIBRARY, total: LIBRARY.length, page: 1, pageSize: 20 });
    }
    if (url.startsWith('/programs')) return Promise.resolve(SAVED_DETAIL);

    return Promise.reject(new Error(`unmocked ${url}`));
  });
}

function renderBuilder(initial?: PublicProgramDetail) {
  return render(
    <ToastProvider>
      <ProgramBuilder initial={initial} />
    </ToastProvider>,
  );
}

function programCalls(): [string, { method?: string; body?: string }][] {
  return apiFetch.mock.calls.filter(([path]) => (path as string).startsWith('/programs')) as [
    string,
    { method?: string; body?: string },
  ][];
}

function lastSavedBody(): Record<string, unknown> {
  const call = programCalls().at(-1);

  if (call?.[1]?.body === undefined) throw new Error('no save call');

  return JSON.parse(call[1].body) as Record<string, unknown>;
}

async function addSection(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: '+ Додати секцію' }));
}

async function addExerciseToSection(): Promise<void> {
  await userEvent.click(
    screen.getAllByRole('button', { name: '+ Додати вправу' }).at(-1) as HTMLElement,
  );
  // Two library rows render, each with its own «Додати»; take the first.
  await userEvent.click(
    (await screen.findAllByRole('button', { name: 'Додати' }))[0] as HTMLElement,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Готово' }));
}

describe('ProgramBuilder', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    replace.mockReset();
    push.mockReset();
    mockDefaultApi();
  });

  describe('type-specific section config', () => {
    it.each([
      ['AMRAP', ['Ліміт часу, с'], ['Інтервал, с', 'Раунди']],
      ['EMOM', ['Інтервал, с', 'Кількість інтервалів'], ['Ліміт часу, с']],
      ['CIRCUIT', ['Раунди', 'Відпочинок між раундами, с'], ['Ліміт часу, с', 'Інтервал, с']],
      ['STRENGTH', ['Раунди', 'Відпочинок між раундами, с'], ['Ліміт часу, с', 'Інтервал, с']],
      ['RUNNING', ['Раунди'], ['Ліміт часу, с', 'Інтервал, с']],
      ['CUSTOM', ['Раунди'], ['Ліміт часу, с', 'Інтервал, с']],
    ])('%s shows exactly its own fields', async (type, present, absent) => {
      renderBuilder();
      await addSection();

      await userEvent.selectOptions(screen.getByLabelText('Тип секції'), type);

      for (const label of present) {
        expect(screen.getByLabelText(new RegExp(label))).toBeInTheDocument();
      }
      for (const label of absent) {
        expect(screen.queryByLabelText(new RegExp(label))).not.toBeInTheDocument();
      }
    });

    it('drops config that the new type forbids from the saved payload', async () => {
      renderBuilder();
      await userEvent.type(screen.getByLabelText('Назва програми'), 'Ретип');
      await addSection();

      // AMRAP pre-fills its required time cap…
      await userEvent.selectOptions(screen.getByLabelText('Тип секції'), 'AMRAP');
      expect(screen.getByLabelText(/Ліміт часу, с/)).toHaveValue(600);

      // …and switching to STRENGTH must not carry it along.
      await userEvent.selectOptions(screen.getByLabelText('Тип секції'), 'STRENGTH');
      await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

      await waitFor(() => {
        expect(programCalls()).toHaveLength(1);
      });
      const sections = lastSavedBody().sections as { timeCapSeconds: null; type: string }[];
      expect(sections[0]?.type).toBe('STRENGTH');
      expect(sections[0]?.timeCapSeconds).toBeNull();
    });
  });

  describe('load input', () => {
    it('renders value XOR text and clears the other on switch', async () => {
      renderBuilder();
      await userEvent.type(screen.getByLabelText('Назва програми'), 'Навантаження');
      await addSection();
      await addExerciseToSection();

      // Expand the prescription editor.
      await userEvent.click(screen.getByRole('button', { name: /без параметрів/ }));

      const modeSelect = screen.getByLabelText('Навантаження');

      await userEvent.selectOptions(modeSelect, 'TEXT');
      expect(screen.getByLabelText('Текстове навантаження')).toBeInTheDocument();
      expect(screen.queryByLabelText('Значення навантаження')).not.toBeInTheDocument();
      await userEvent.type(screen.getByLabelText('Текстове навантаження'), 'до відмови');

      await userEvent.selectOptions(modeSelect, 'KG');
      expect(screen.getByLabelText('Значення навантаження')).toBeInTheDocument();
      expect(screen.queryByLabelText('Текстове навантаження')).not.toBeInTheDocument();
      await userEvent.type(screen.getByLabelText('Значення навантаження'), '82.5');

      await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

      await waitFor(() => {
        expect(programCalls()).toHaveLength(1);
      });
      const sections = lastSavedBody().sections as {
        exercises: { loadValue: number; loadUnit: string; loadText: null }[];
      }[];
      expect(sections[0]?.exercises[0]).toMatchObject({
        loadValue: 82.5,
        loadUnit: 'KG',
        loadText: null,
      });
    });
  });

  describe('picker', () => {
    it('adds the chosen exercise into the section that opened it', async () => {
      renderBuilder();
      await addSection();
      await addSection();

      const sections = screen.getAllByRole('listitem');
      const second = sections[1] as HTMLElement;

      await userEvent.click(within(second).getByRole('button', { name: '+ Додати вправу' }));
      await userEvent.click(
        (await screen.findAllByRole('button', { name: 'Додати' }))[0] as HTMLElement,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Готово' }));

      const refreshed = screen.getAllByRole('listitem');
      expect(within(refreshed[1] as HTMLElement).getByText('Присідання')).toBeInTheDocument();
      expect(within(refreshed[0] as HTMLElement).queryByText('Присідання')).not.toBeInTheDocument();
    });
  });

  describe('reorder', () => {
    it('moves a section with the keyboard buttons and saves the new order', async () => {
      renderBuilder();
      await userEvent.type(screen.getByLabelText('Назва програми'), 'Порядок');
      await addSection();
      await addSection();

      const names = screen.getAllByLabelText('Назва секції');
      await userEvent.type(names[0] as HTMLElement, 'Перша');
      await userEvent.type(names[1] as HTMLElement, 'Друга');

      await userEvent.click(
        screen.getByRole('button', { name: 'Перемістити секцію «Перша» вниз' }),
      );

      const after = screen.getAllByLabelText('Назва секції');
      expect(after[0]).toHaveValue('Друга');
      expect(after[1]).toHaveValue('Перша');

      await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

      await waitFor(() => {
        expect(programCalls()).toHaveLength(1);
      });
      const sections = lastSavedBody().sections as { name: string }[];
      expect(sections.map((section) => section.name)).toEqual(['Друга', 'Перша']);
    });

    it('moves an exercise within its section and saves the new order', async () => {
      renderBuilder();
      await userEvent.type(screen.getByLabelText('Назва програми'), 'Порядок вправ');
      await addSection();

      // Add both library exercises: the first button flips to «✓ Додано», so the
      // remaining «Додати» is the second row's.
      await userEvent.click(screen.getByRole('button', { name: '+ Додати вправу' }));
      await userEvent.click(
        (await screen.findAllByRole('button', { name: 'Додати' }))[0] as HTMLElement,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Додати' }));
      await userEvent.click(screen.getByRole('button', { name: 'Готово' }));

      await userEvent.click(
        screen.getByRole('button', { name: 'Перемістити вправу «Присідання» вниз' }),
      );

      await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

      await waitFor(() => {
        expect(programCalls()).toHaveLength(1);
      });
      const sections = lastSavedBody().sections as { exercises: { exerciseId: string }[] }[];
      expect(sections[0]?.exercises.map((line) => line.exerciseId)).toEqual([
        'ex-plank',
        'ex-squat',
      ]);
    });
  });

  describe('save', () => {
    it('POSTs a new program with the exact nested shape — no ids, no order keys', async () => {
      renderBuilder();
      await userEvent.type(screen.getByLabelText('Назва програми'), 'Нова програма');
      await addSection();
      await addExerciseToSection();

      await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

      await waitFor(() => {
        expect(programCalls()).toHaveLength(1);
      });

      const [path, init] = programCalls()[0] as [string, { method: string; body: string }];
      expect(path).toBe('/programs');
      expect(init.method).toBe('POST');
      expect(init.body).not.toContain('"order"');
      expect(init.body).not.toContain('"uid"');

      const body = JSON.parse(init.body) as Record<string, unknown>;
      expect(body).toMatchObject({ name: 'Нова програма', type: 'STRENGTH' });
      expect((body.sections as unknown[]).length).toBe(1);

      // A successful create moves the URL onto the saved id.
      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith('/dashboard/programs/prog-1');
      });
    });

    it('PATCHes an existing program with sections', async () => {
      renderBuilder({ ...SAVED_DETAIL, name: 'Стара назва' });

      const nameInput = screen.getByLabelText('Назва програми');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Нова назва');
      await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

      await waitFor(() => {
        expect(programCalls()).toHaveLength(1);
      });
      const [path, init] = programCalls()[0] as [string, { method: string; body: string }];
      expect(path).toBe('/programs/prog-1');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toMatchObject({ name: 'Нова назва', sections: [] });
    });

    it('blocks saving without a name, with no API call', async () => {
      renderBuilder();
      await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

      expect(await screen.findByText('Введіть назву програми')).toBeInTheDocument();
      expect(programCalls()).toHaveLength(0);
    });

    it('blocks an AMRAP section with a cleared time cap', async () => {
      renderBuilder();
      await userEvent.type(screen.getByLabelText('Назва програми'), 'AMRAP без часу');
      await addSection();
      await userEvent.selectOptions(screen.getByLabelText('Тип секції'), 'AMRAP');
      await userEvent.clear(screen.getByLabelText(/Ліміт часу, с/));

      await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

      expect(await screen.findByText('Заповніть поле «Ліміт часу, с»')).toBeInTheDocument();
      expect(programCalls()).toHaveLength(0);
    });

    it('surfaces an API 400 message as the form error', async () => {
      const { ApiError } = jest.requireMock<{ ApiError: new (m: string) => Error }>('@/lib/api');
      apiFetch.mockImplementation((path: unknown) => {
        if ((path as string).startsWith('/programs')) {
          return Promise.reject(new ApiError('Секція AMRAP потребує ліміту часу'));
        }
        return Promise.resolve([]);
      });

      renderBuilder();
      await userEvent.type(screen.getByLabelText('Назва програми'), 'Відхилено сервером');
      await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Секція AMRAP потребує ліміту часу',
      );
    });
  });

  describe('unsaved changes', () => {
    it('confirms before leaving a dirty draft', async () => {
      renderBuilder();
      await userEvent.type(screen.getByLabelText('Назва програми'), 'Чернетка');

      await userEvent.click(screen.getByRole('button', { name: '← До програм' }));

      expect(await screen.findByText('Незбережені зміни')).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Вийти без збереження' }));
      expect(push).toHaveBeenCalledWith('/dashboard/programs');
    });

    it('leaves a clean draft without asking', async () => {
      renderBuilder();

      await userEvent.click(screen.getByRole('button', { name: '← До програм' }));

      expect(screen.queryByText('Незбережені зміни')).not.toBeInTheDocument();
      expect(push).toHaveBeenCalledWith('/dashboard/programs');
    });
  });
});
