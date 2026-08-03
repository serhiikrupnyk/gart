import type {
  ClientAssignment,
  ClientWorkout,
  ClientWorkoutLog,
  ClientWorkoutSection,
  DayOfWeek,
} from '@gart/shared';

import { toMediaInfo } from '../exercises/exercise.mapper';
import type {
  AssignmentExerciseModel,
  AssignmentModel,
  AssignmentSectionModel,
  ExerciseMediaModel,
  ExerciseModel,
  WorkoutLogModel,
  WorkoutSetLogModel,
} from '../generated/prisma/models.js';

export type WorkoutLogWithSets = WorkoutLogModel & { sets: WorkoutSetLogModel[] };

/**
 * The client tree joins three things: the frozen snapshot prescription, the
 * LIVE exercise (name, instructions and media come from the library so a fixed
 * typo or a fresh video reaches the client at once), and — when a date is being
 * read — that day's record of what actually happened.
 *
 * `logs` is absent when reading a plan rather than a day: a log without a date
 * has no meaning, and its absence maps to the same `null` as «not yet logged».
 */
export type ClientAssignmentTree = AssignmentModel & {
  sections: (AssignmentSectionModel & {
    exercises: (AssignmentExerciseModel & {
      exercise: Pick<ExerciseModel, 'id' | 'name' | 'primaryMuscleGroup' | 'textInstructions'> & {
        media: ExerciseMediaModel[];
      };
      logs?: WorkoutLogWithSets[];
    })[];
  })[];
};

export function toClientWorkoutLog(log: WorkoutLogWithSets): ClientWorkoutLog {
  return {
    completed: log.completed,
    notes: log.notes,
    sets: log.sets.map((set) => ({
      reps: set.reps,
      loadKg: set.loadKg === null ? null : Number(set.loadKg),
      durationSeconds: set.durationSeconds,
      distanceMeters: set.distanceMeters,
    })),
    loggedAt: log.loggedAt.toISOString(),
    updatedAt: log.updatedAt.toISOString(),
  };
}

export type ClientAssignmentWithCounts = AssignmentModel & {
  sections: { _count: { exercises: number } }[];
};

/** @db.Date columns come back as UTC midnight; the wire carries plain dates. */
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function summaryOf(
  assignment: AssignmentModel,
  sectionCount: number,
  exerciseCount: number,
): ClientAssignment {
  return {
    id: assignment.id,
    name: assignment.name,
    description: assignment.description,
    type: assignment.type,
    status: assignment.status,
    startDate: toDateString(assignment.startDate),
    endDate: assignment.endDate === null ? null : toDateString(assignment.endDate),
    daysOfWeek: [...assignment.daysOfWeek].sort((a, b) => a - b) as DayOfWeek[],
    sectionCount,
    exerciseCount,
  };
}

export function toClientAssignment(assignment: ClientAssignmentWithCounts): ClientAssignment {
  return summaryOf(
    assignment,
    assignment.sections.length,
    assignment.sections.reduce((sum, section) => sum + section._count.exercises, 0),
  );
}

function toClientSection(section: ClientAssignmentTree['sections'][number]): ClientWorkoutSection {
  return {
    id: section.id,
    name: section.name,
    type: section.type,
    timeCapSeconds: section.timeCapSeconds,
    intervalSeconds: section.intervalSeconds,
    rounds: section.rounds,
    restBetweenRoundsSeconds: section.restBetweenRoundsSeconds,
    exercises: section.exercises.map((row) => ({
      // The durable snapshot id — what the log rows reference.
      id: row.id,
      // At most one log exists per (exercise, date); the DB unique guarantees it.
      log: row.logs?.[0] === undefined ? null : toClientWorkoutLog(row.logs[0]),
      exercise: {
        id: row.exercise.id,
        name: row.exercise.name,
        primaryMuscleGroup: row.exercise.primaryMuscleGroup,
        textInstructions: row.exercise.textInstructions,
        media: [...row.exercise.media]
          .sort((a, b) => a.kind.localeCompare(b.kind))
          .map(toMediaInfo),
      },
      sets: row.sets,
      reps: row.reps,
      loadValue: row.loadValue === null ? null : Number(row.loadValue),
      loadUnit: row.loadUnit,
      loadText: row.loadText,
      restSeconds: row.restSeconds,
      tempo: row.tempo,
      notes: row.notes,
      durationSeconds: row.durationSeconds,
      distanceMeters: row.distanceMeters,
    })),
  };
}

export function toClientWorkout(assignment: ClientAssignmentTree): ClientWorkout {
  return {
    ...summaryOf(
      assignment,
      assignment.sections.length,
      assignment.sections.reduce((sum, section) => sum + section.exercises.length, 0),
    ),
    sections: assignment.sections.map(toClientSection),
  };
}
