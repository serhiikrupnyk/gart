import type { ExerciseMediaInfo, PublicCategory, PublicExercise } from '@gart/shared';

import type { CategoryModel, ExerciseMediaModel } from '../generated/prisma/models.js';
import type { ExerciseWithMedia } from './exercises.service';

/**
 * A media row as the UI sees it: metadata only. The storage key stays behind —
 * play URLs are minted per request by the media-url endpoint.
 */
export function toMediaInfo(media: ExerciseMediaModel): ExerciseMediaInfo {
  return {
    kind: media.kind,
    contentType: media.contentType,
    sizeBytes: media.sizeBytes,
    uploadedAt: media.uploadedAt.toISOString(),
  };
}

/**
 * Narrows a row to what the trainer sees. The raw trainerId never crosses the
 * wire — `isCustom` is all the UI needs: custom rows are editable, global ones
 * are not.
 */
export function toPublicExercise(exercise: ExerciseWithMedia): PublicExercise {
  return {
    id: exercise.id,
    name: exercise.name,
    description: exercise.description,
    primaryMuscleGroup: exercise.primaryMuscleGroup,
    muscleGroups: exercise.muscleGroups,
    categoryId: exercise.categoryId,
    textInstructions: exercise.textInstructions,
    media: [...exercise.media].sort((a, b) => a.kind.localeCompare(b.kind)).map(toMediaInfo),
    isCustom: exercise.trainerId !== null,
    createdAt: exercise.createdAt.toISOString(),
    updatedAt: exercise.updatedAt.toISOString(),
  };
}

export function toPublicCategory(category: CategoryModel): PublicCategory {
  return {
    id: category.id,
    name: category.name,
    isCustom: category.trainerId !== null,
  };
}
