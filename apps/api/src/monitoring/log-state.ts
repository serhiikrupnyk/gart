import type { LogState } from '@gart/shared';

import type { AssignmentExerciseModel, WorkoutSetLogModel } from '../generated/prisma/models.js';
import type { WorkoutLogWithSets } from '../me/client-workout.mapper';

/**
 * Planned versus actual, compared conservatively: only quantities that can
 * disagree are compared, so a trainer is never shown a deviation that is really
 * an apples-to-oranges artefact.
 *
 *  - Load counts only when the prescription was in KILOGRAMS. `%1ПМ`, `RPE` and
 *    free text prescribe how to *choose* a weight; the log records the weight
 *    itself, so they are different quantities and cannot contradict.
 *  - Reps, duration and distance count only where the prescription named them.
 *  - A blank actual field is silence, not disagreement.
 *  - A prescription with nothing numeric cannot be deviated from.
 */
export function exerciseState(
  planned: AssignmentExerciseModel,
  actual: WorkoutLogWithSets | undefined,
): LogState {
  if (actual === undefined) {
    return 'MISSING';
  }
  if (!actual.completed) {
    return 'SKIPPED';
  }

  return matchesPrescription(planned, actual.sets) ? 'DONE' : 'DEVIATED';
}

function matchesPrescription(
  planned: AssignmentExerciseModel,
  sets: WorkoutSetLogModel[],
): boolean {
  const expectedSets = plannedSetCount(planned);

  if (expectedSets === 0) {
    return true;
  }
  if (sets.length !== expectedSets) {
    return false;
  }

  const plannedLoadKg = planned.loadUnit === 'KG' ? toNumber(planned.loadValue) : null;

  return sets.every(
    (set) =>
      agrees(planned.reps, set.reps) &&
      agrees(planned.durationSeconds, set.durationSeconds) &&
      agrees(planned.distanceMeters, set.distanceMeters) &&
      agrees(plannedLoadKg, toNumber(set.loadKg)),
  );
}

/** How many sets the prescription implies: a bare `reps` line means one. */
function plannedSetCount(planned: AssignmentExerciseModel): number {
  if (planned.sets !== null) {
    return planned.sets;
  }

  const hasDimension =
    planned.reps !== null ||
    planned.durationSeconds !== null ||
    planned.distanceMeters !== null ||
    planned.loadValue !== null;

  return hasDimension ? 1 : 0;
}

/** Either side being absent means there is nothing to disagree about. */
function agrees(planned: number | null, actual: number | null): boolean {
  return planned === null || actual === null || planned === actual;
}

function toNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}
