'use client';

import { MUSCLE_GROUP_LABELS, type PublicCategory, type PublicExercise } from '@gart/shared';

import { Badge, Button, Modal } from '@/components/ui';
import { MediaPlayer } from './media-player';

export interface ExerciseDetailModalProps {
  exercise: PublicExercise | undefined;
  categories: PublicCategory[];
  onClose: () => void;
  onEdit: (exercise: PublicExercise) => void;
  onDelete: (exercise: PublicExercise) => void;
}

/**
 * Read view for both kinds of exercise. Edit and delete exist only for the
 * trainer's own rows — for globals the affordances are absent, not disabled,
 * matching the API's 404 stance.
 */
export function ExerciseDetailModal({
  exercise,
  categories,
  onClose,
  onEdit,
  onDelete,
}: ExerciseDetailModalProps) {
  if (exercise === undefined) {
    return null;
  }

  const category = categories.find((entry) => entry.id === exercise.categoryId);

  return (
    <Modal
      open
      onClose={onClose}
      title={exercise.name}
      size="lg"
      footer={
        exercise.isCustom ? (
          <>
            <Button
              variant="danger"
              onClick={() => {
                onDelete(exercise);
              }}
            >
              Видалити
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onEdit(exercise);
              }}
            >
              Редагувати
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {exercise.isCustom && <Badge tone="accent">Моя вправа</Badge>}
          <Badge tone="neutral">{MUSCLE_GROUP_LABELS[exercise.primaryMuscleGroup]}</Badge>
          {exercise.muscleGroups.map((group) => (
            <Badge key={group} tone="neutral">
              {MUSCLE_GROUP_LABELS[group]}
            </Badge>
          ))}
          {category !== undefined && <Badge tone="neutral">{category.name}</Badge>}
        </div>

        {exercise.description !== null && (
          <p className="text-sm leading-relaxed text-text-secondary">{exercise.description}</p>
        )}

        {exercise.media.length > 0 && (
          <div className="space-y-2">
            {exercise.media.map((media) => (
              <MediaPlayer key={media.kind} exerciseId={exercise.id} media={media} />
            ))}
          </div>
        )}

        {exercise.textInstructions !== null && (
          <div>
            <h3 className="text-sm font-medium text-text">Інструкції</h3>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
              {exercise.textInstructions}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
