import type { AssignmentStatus, DayOfWeek } from './assignment';
import type { ExerciseMediaInfo, MuscleGroup } from './exercise';
import type { LoadUnit, WorkoutType } from './program';

/**
 * The client-facing view of an assigned workout pairs two currencies:
 * FROZEN prescription numbers from the assignment snapshot (what the trainer
 * prescribed at assign time — never drifts), and LIVE display fields from the
 * exercise library (name, instructions, media — a typo fix or a better video
 * should reach the client immediately).
 */

/** Live library fields. `media` is metadata only — play URLs are minted per tap. */
export interface ClientExerciseInfo {
  id: string;
  name: string;
  primaryMuscleGroup: MuscleGroup;
  textInstructions: string | null;
  media: ExerciseMediaInfo[];
}

/** One frozen prescription line. `id` is the durable snapshot id Step 14's logs anchor to. */
export interface ClientWorkoutExercise {
  id: string;
  exercise: ClientExerciseInfo;
  sets: number | null;
  reps: number | null;
  loadValue: number | null;
  loadUnit: LoadUnit | null;
  loadText: string | null;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
}

export interface ClientWorkoutSection {
  id: string;
  name: string | null;
  type: WorkoutType;
  timeCapSeconds: number | null;
  intervalSeconds: number | null;
  rounds: number | null;
  restBetweenRoundsSeconds: number | null;
  exercises: ClientWorkoutExercise[];
}

/** Plan-view summary. Deliberately narrower than the trainer's shape — no provenance. */
export interface ClientAssignment {
  id: string;
  name: string;
  description: string | null;
  type: WorkoutType;
  status: AssignmentStatus;
  startDate: string;
  endDate: string | null;
  daysOfWeek: DayOfWeek[];
  sectionCount: number;
  exerciseCount: number;
}

export interface ClientWorkout extends ClientAssignment {
  sections: ClientWorkoutSection[];
}

/** The answer to «що я треную (дата)?» — the date the device asked about, echoed. */
export interface ClientWorkoutDay {
  date: string;
  workouts: ClientWorkout[];
}
