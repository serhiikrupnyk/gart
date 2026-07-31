import type {
  ClientAssignment,
  ClientWorkout,
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
} from '../generated/prisma/models.js';

/**
 * The client tree joins the frozen snapshot rows with the LIVE exercise —
 * name, instructions and media come from the library so a fixed typo or a
 * fresh video reaches the client at once; every number stays snapshot-frozen.
 */
export type ClientAssignmentTree = AssignmentModel & {
  sections: (AssignmentSectionModel & {
    exercises: (AssignmentExerciseModel & {
      exercise: Pick<ExerciseModel, 'id' | 'name' | 'primaryMuscleGroup' | 'textInstructions'> & {
        media: ExerciseMediaModel[];
      };
    })[];
  })[];
};

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
      // The durable snapshot id — what Step 14's logs will reference.
      id: row.id,
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
