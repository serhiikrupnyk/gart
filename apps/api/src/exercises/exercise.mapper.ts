import type { PublicCategory, PublicExercise } from '@gart/shared';

import type { CategoryModel, ExerciseModel } from '../generated/prisma/models.js';

/**
 * Narrows a row to what the trainer sees. The raw trainerId never crosses the
 * wire — `isCustom` is all the UI needs: custom rows are editable, global ones
 * are not.
 */
export function toPublicExercise(exercise: ExerciseModel): PublicExercise {
  return {
    id: exercise.id,
    name: exercise.name,
    description: exercise.description,
    primaryMuscleGroup: exercise.primaryMuscleGroup,
    muscleGroups: exercise.muscleGroups,
    categoryId: exercise.categoryId,
    videoUrl: exercise.videoUrl,
    audioUrl: exercise.audioUrl,
    textInstructions: exercise.textInstructions,
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
