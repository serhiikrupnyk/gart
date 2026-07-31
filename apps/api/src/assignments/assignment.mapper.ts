import type {
  DayOfWeek,
  PublicAssignment,
  PublicAssignmentDetail,
  PublicProgramSection,
} from '@gart/shared';

import type {
  AssignmentExerciseModel,
  AssignmentModel,
  AssignmentSectionModel,
  ExerciseModel,
} from '../generated/prisma/models.js';

export type AssignmentTree = AssignmentModel & {
  sections: (AssignmentSectionModel & {
    exercises: (AssignmentExerciseModel & {
      exercise: Pick<ExerciseModel, 'id' | 'name' | 'primaryMuscleGroup'>;
    })[];
  })[];
};

export type AssignmentWithCounts = AssignmentModel & {
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
): PublicAssignment {
  return {
    id: assignment.id,
    name: assignment.name,
    description: assignment.description,
    type: assignment.type,
    status: assignment.status,
    startDate: toDateString(assignment.startDate),
    endDate: assignment.endDate === null ? null : toDateString(assignment.endDate),
    daysOfWeek: [...assignment.daysOfWeek].sort((a, b) => a - b) as DayOfWeek[],
    sourceProgramId: assignment.sourceProgramId,
    sectionCount,
    exerciseCount,
    assignedAt: assignment.assignedAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}

export function toPublicAssignment(assignment: AssignmentWithCounts): PublicAssignment {
  return summaryOf(
    assignment,
    assignment.sections.length,
    assignment.sections.reduce((sum, section) => sum + section._count.exercises, 0),
  );
}

/** The snapshot reuses the program wire shape — identical structure, durable ids. */
function toPublicSection(section: AssignmentTree['sections'][number]): PublicProgramSection {
  return {
    id: section.id,
    name: section.name,
    type: section.type,
    timeCapSeconds: section.timeCapSeconds,
    intervalSeconds: section.intervalSeconds,
    rounds: section.rounds,
    restBetweenRoundsSeconds: section.restBetweenRoundsSeconds,
    exercises: section.exercises.map((row) => ({
      id: row.id,
      exercise: {
        id: row.exercise.id,
        name: row.exercise.name,
        primaryMuscleGroup: row.exercise.primaryMuscleGroup,
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

export function toPublicAssignmentDetail(assignment: AssignmentTree): PublicAssignmentDetail {
  return {
    ...summaryOf(
      assignment,
      assignment.sections.length,
      assignment.sections.reduce((sum, section) => sum + section.exercises.length, 0),
    ),
    sections: assignment.sections.map(toPublicSection),
  };
}
