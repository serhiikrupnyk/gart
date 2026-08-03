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

/**
 * One actual set. Load is always kilograms — %1ПМ and RPE are prescription
 * languages for choosing a weight; this is the weight that moved.
 */
export interface ClientWorkoutSetLog {
  reps: number | null;
  loadKg: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
}

/**
 * What the client recorded for one exercise on one date. Its absence and
 * `completed: false` mean different things: nothing recorded yet, versus a
 * deliberate «I skipped this» with the reason in `notes`.
 */
export interface ClientWorkoutLog {
  completed: boolean;
  notes: string | null;
  sets: ClientWorkoutSetLog[];
  loggedAt: string;
  updatedAt: string;
}

/** One frozen prescription line, plus whatever the client actually did. */
export interface ClientWorkoutExercise {
  id: string;
  exercise: ClientExerciseInfo;
  log: ClientWorkoutLog | null;
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

/**
 * How far back a missed workout may still be recorded. Past two weeks recall
 * stops being data, and Phase 2's charts would plot it as fact.
 */
export const LOG_WINDOW_DAYS = 14;

/** Sets carry no id: array position is the order, and writes replace the list. */
export type ClientWorkoutSetInput = ClientWorkoutSetLog;

export interface LogWorkoutExerciseRequest {
  completed: boolean;
  notes?: string | null;
  sets: ClientWorkoutSetInput[];
}
