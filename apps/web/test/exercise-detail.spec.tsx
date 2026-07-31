import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicExercise } from '@gart/shared';

import { ExerciseDetailModal } from '@/components/exercises/exercise-detail-modal';
import { ToastProvider } from '@/components/ui';

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  ApiError: class extends Error {},
}));

function fixture(overrides: Partial<PublicExercise> = {}): PublicExercise {
  return {
    id: 'ex1',
    name: 'Станова тяга',
    description: 'Базова тяга з підлоги',
    primaryMuscleGroup: 'BACK',
    muscleGroups: ['LEGS', 'GLUTES'],
    categoryId: null,
    textInstructions: 'Спина пряма.',
    media: [
      {
        kind: 'VIDEO',
        contentType: 'video/mp4',
        sizeBytes: 5 * 1024 * 1024,
        uploadedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    isCustom: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderDetail(
  exercise: PublicExercise,
  handlers: Partial<{ onEdit: jest.Mock; onDelete: jest.Mock }> = {},
) {
  return render(
    <ToastProvider>
      <ExerciseDetailModal
        exercise={exercise}
        categories={[]}
        onClose={jest.fn()}
        onEdit={handlers.onEdit ?? jest.fn()}
        onDelete={handlers.onDelete ?? jest.fn()}
      />
    </ToastProvider>,
  );
}

describe('ExerciseDetailModal', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('shows the exercise with Ukrainian muscle labels', () => {
    renderDetail(fixture());

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Станова тяга');
    expect(screen.getByText('Спина')).toBeInTheDocument();
    expect(screen.getByText('Ноги')).toBeInTheDocument();
    expect(screen.getByText('Сідниці')).toBeInTheDocument();
    expect(screen.getByText('Спина пряма.')).toBeInTheDocument();
  });

  it('offers no edit or delete for a global exercise', () => {
    renderDetail(fixture({ isCustom: false }));

    expect(screen.queryByRole('button', { name: 'Редагувати' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Видалити' })).not.toBeInTheDocument();
  });

  it('offers both for a custom exercise', async () => {
    const onEdit = jest.fn();
    renderDetail(fixture({ isCustom: true }), { onEdit });

    expect(screen.getByRole('button', { name: 'Видалити' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Редагувати' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('fetches the presigned URL only when the trainer asks to play', async () => {
    apiFetch.mockResolvedValue({
      url: 'https://storage.test/get/signed-video',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
    const { container } = renderDetail(fixture());

    // Nothing media-related was requested just by opening the detail.
    expect(apiFetch).not.toHaveBeenCalled();
    expect(screen.getByText('Відео')).toBeInTheDocument();
    expect(screen.getByText('5.0 МБ')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Відтворити' }));

    expect(apiFetch).toHaveBeenCalledWith('/exercises/ex1/media-url?kind=VIDEO');
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('src', 'https://storage.test/get/signed-video');
  });
});
