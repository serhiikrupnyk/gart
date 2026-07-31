import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicExercise } from '@gart/shared';

import { ExerciseFormModal } from '@/components/exercises/exercise-form-modal';
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

const uploadToStorage = jest.fn();
jest.mock('@/lib/upload', () => ({
  uploadToStorage: (...args: unknown[]) => uploadToStorage(...args) as unknown,
}));

const SAVED: PublicExercise = {
  id: 'new-ex',
  name: 'Випади',
  description: null,
  primaryMuscleGroup: 'LEGS',
  muscleGroups: [],
  categoryId: null,
  textInstructions: null,
  media: [],
  isCustom: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderForm(props: Partial<Parameters<typeof ExerciseFormModal>[0]> = {}) {
  return render(
    <ToastProvider>
      <ExerciseFormModal
        open
        categories={[{ id: 'cat1', name: 'Сила', isCustom: false }]}
        onClose={jest.fn()}
        onSaved={jest.fn()}
        onCategoryCreated={jest.fn()}
        {...props}
      />
    </ToastProvider>,
  );
}

function videoFile(sizeBytes: number, type = 'video/mp4'): File {
  const file = new File(['x'], 'clip.mp4', { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });

  return file;
}

function callsTo(prefix: string): unknown[][] {
  return apiFetch.mock.calls.filter((call) => (call[0] as string).startsWith(prefix));
}

describe('ExerciseFormModal', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    uploadToStorage.mockReset();
  });

  it('requires a name before calling the API', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('Введіть назву вправи')).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('creates an exercise without media in one POST', async () => {
    apiFetch.mockResolvedValue(SAVED);
    const onSaved = jest.fn();
    renderForm({ onSaved });

    await userEvent.type(screen.getByLabelText('Назва'), 'Випади');
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });

    const [path, init] = apiFetch.mock.calls[0] as [string, { method: string; body: string }];
    expect(path).toBe('/exercises');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ name: 'Випади', primaryMuscleGroup: 'LEGS' });
  });

  it('refuses an oversized file locally — no presign is ever requested', async () => {
    renderForm();

    await userEvent.upload(
      screen.getByLabelText('Обрати файл', { selector: '#media-file-VIDEO' }),
      videoFile(101 * 1024 * 1024),
    );

    expect(await screen.findByText(/Файл завеликий — до 100 МБ/)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('refuses a disallowed type locally', async () => {
    renderForm();

    // applyAccept off: the accept attribute already filters the picker in real
    // browsers, but a file can arrive regardless — the validation must hold.
    await userEvent.upload(
      screen.getByLabelText('Обрати файл', { selector: '#media-file-VIDEO' }),
      videoFile(1000, 'image/svg+xml'),
      { applyAccept: false },
    );

    expect(await screen.findByText(/Непідтримуваний тип відео/)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('runs save → presign → upload → finalize in order', async () => {
    const order: string[] = [];
    apiFetch.mockImplementation((path: unknown, init?: { method?: string }) => {
      const key = `${init?.method ?? 'GET'} ${path as string}`;
      order.push(key);
      if (key === 'POST /exercises') return Promise.resolve(SAVED);
      if (key.endsWith('/media/presign')) {
        return Promise.resolve({
          uploadUrl: 'https://storage.test/put/k',
          key: 'exercises/new-ex/video/k.mp4',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        });
      }
      if (key === 'POST /exercises/new-ex/media') {
        return Promise.resolve({
          kind: 'VIDEO',
          contentType: 'video/mp4',
          sizeBytes: 1000,
          uploadedAt: '',
        });
      }
      return Promise.reject(new Error(`unmocked ${key}`));
    });
    uploadToStorage.mockImplementation(() => {
      order.push('PUT storage');
      return Promise.resolve();
    });

    renderForm();

    await userEvent.type(screen.getByLabelText('Назва'), 'Випади');
    await userEvent.upload(
      screen.getByLabelText('Обрати файл', { selector: '#media-file-VIDEO' }),
      videoFile(1000),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => {
      expect(order).toEqual([
        'POST /exercises',
        'POST /exercises/new-ex/media/presign',
        'PUT storage',
        'POST /exercises/new-ex/media',
      ]);
    });

    // The file's own type and size pass through to presign unchanged.
    const presignBody = JSON.parse(
      (callsTo('/exercises/new-ex/media/presign')[0]?.[1] as { body: string }).body,
    ) as { contentType: string; sizeBytes: number };
    expect(presignBody).toEqual(
      expect.objectContaining({ contentType: 'video/mp4', sizeBytes: 1000 }),
    );
  });

  it('keeps the saved exercise and surfaces the error when storage rejects', async () => {
    apiFetch.mockImplementation((path: unknown) => {
      if (path === '/exercises') return Promise.resolve(SAVED);
      if ((path as string).endsWith('/media/presign')) {
        return Promise.resolve({
          uploadUrl: 'https://storage.test/put/k',
          key: 'exercises/new-ex/video/k.mp4',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        });
      }
      return Promise.reject(new Error(`unmocked ${String(path)}`));
    });
    uploadToStorage.mockRejectedValue(new Error('storage rejected the upload (403)'));
    const onSaved = jest.fn();

    renderForm({ onSaved });

    await userEvent.type(screen.getByLabelText('Назва'), 'Випади');
    await userEvent.upload(
      screen.getByLabelText('Обрати файл', { selector: '#media-file-VIDEO' }),
      videoFile(1000),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    // The exercise itself is saved and the list refreshes…
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    // …the modal stays open with the media error, and finalize never ran.
    expect(await screen.findByText(/Не вдалося завантажити файл/)).toBeInTheDocument();
    expect(
      callsTo('/exercises/new-ex/media').filter((call) => !(call[0] as string).includes('presign')),
    ).toHaveLength(0);
  });

  it('creates a category inline and selects it', async () => {
    apiFetch.mockImplementation((path: unknown) =>
      path === '/categories'
        ? Promise.resolve({ id: 'cat-new', name: 'Реабілітація', isCustom: true })
        : Promise.reject(new Error('unexpected')),
    );
    const onCategoryCreated = jest.fn();
    renderForm({ onCategoryCreated });

    await userEvent.selectOptions(screen.getByLabelText('Категорія'), '__new__');
    await userEvent.type(screen.getByLabelText('Назва нової категорії'), 'Реабілітація');
    await userEvent.click(screen.getByRole('button', { name: 'Створити' }));

    await waitFor(() => {
      expect(onCategoryCreated).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Реабілітація' }),
      );
    });
  });

  it('removes existing media through the API when editing', async () => {
    const withMedia: PublicExercise = {
      ...SAVED,
      media: [
        {
          kind: 'VIDEO',
          contentType: 'video/mp4',
          sizeBytes: 1000,
          uploadedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    apiFetch.mockResolvedValue(null);
    renderForm({ exercise: withMedia });

    await userEvent.click(screen.getByRole('button', { name: 'Прибрати' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/exercises/new-ex/media?kind=VIDEO', {
        method: 'DELETE',
      });
    });
  });
});
