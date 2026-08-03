import type { ClientWorkoutExercise, ClientWorkoutSetLog } from '@gart/shared';

/** Mirrors MAX_SETS_PER_LOG on the API — a prescription may ask for more. */
const MAX_SETS = 50;

export interface LogDimensions {
  reps: boolean;
  load: boolean;
  duration: boolean;
  distance: boolean;
}

/**
 * Which fields a set row offers, mirroring what the trainer prescribed — the
 * same rules-as-existence idiom the program builder uses. A plank asks for
 * seconds, not reps and kilograms.
 */
export function logDimensions(line: ClientWorkoutExercise): LogDimensions {
  return {
    reps: line.sets !== null || line.reps !== null,
    // %1ПМ and RPE prescribe how to choose a weight; the log records kilograms.
    load: line.loadValue !== null || line.loadText !== null,
    duration: line.durationSeconds !== null,
    distance: line.distanceMeters !== null,
  };
}

export function hasDimensions(dimensions: LogDimensions): boolean {
  return dimensions.reps || dimensions.load || dimensions.duration || dimensions.distance;
}

const EMPTY_SET: ClientWorkoutSetLog = {
  reps: null,
  loadKg: null,
  durationSeconds: null,
  distanceMeters: null,
};

/**
 * The one-tap case: what «виконано як заплановано» means in numbers. Load
 * prefills only when the prescription was already in kilograms — a %1ПМ or RPE
 * target is not a weight, so that field starts empty rather than wrong.
 */
export function prefillSets(line: ClientWorkoutExercise): ClientWorkoutSetLog[] {
  const dimensions = logDimensions(line);

  if (!hasDimensions(dimensions)) {
    return [];
  }

  const template: ClientWorkoutSetLog = {
    reps: line.reps,
    loadKg: line.loadUnit === 'KG' ? line.loadValue : null,
    durationSeconds: line.durationSeconds,
    distanceMeters: line.distanceMeters,
  };

  const count = Math.min(line.sets ?? 1, MAX_SETS);

  return Array.from({ length: count }, () => ({ ...template }));
}

export function emptySet(): ClientWorkoutSetLog {
  return { ...EMPTY_SET };
}
