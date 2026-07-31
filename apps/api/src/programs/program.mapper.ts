import type {
  PublicProgram,
  PublicProgramDetail,
  PublicProgramExercise,
  PublicProgramSection,
} from '@gart/shared';

import type {
  ExerciseModel,
  ProgramExerciseModel,
  ProgramModel,
  ProgramSectionModel,
} from '../generated/prisma/models.js';

/** List rows carry per-section exercise counts, not trees. */
export type ProgramWithCounts = ProgramModel & {
  sections: { _count: { exercises: number } }[];
};

export type ProgramTree = ProgramModel & {
  sections: (ProgramSectionModel & {
    exercises: (ProgramExerciseModel & {
      exercise: Pick<ExerciseModel, 'id' | 'name' | 'primaryMuscleGroup'>;
    })[];
  })[];
};

export function toPublicProgram(program: ProgramWithCounts): PublicProgram {
  return {
    id: program.id,
    name: program.name,
    description: program.description,
    type: program.type,
    sectionCount: program.sections.length,
    exerciseCount: program.sections.reduce((sum, section) => sum + section._count.exercises, 0),
    createdAt: program.createdAt.toISOString(),
    updatedAt: program.updatedAt.toISOString(),
  };
}

function toPublicProgramExercise(
  row: ProgramTree['sections'][number]['exercises'][number],
): PublicProgramExercise {
  return {
    id: row.id,
    exercise: {
      id: row.exercise.id,
      name: row.exercise.name,
      primaryMuscleGroup: row.exercise.primaryMuscleGroup,
    },
    sets: row.sets,
    reps: row.reps,
    // Prisma Decimal → plain number for the wire; two decimal places by schema.
    loadValue: row.loadValue === null ? null : Number(row.loadValue),
    loadUnit: row.loadUnit,
    loadText: row.loadText,
    restSeconds: row.restSeconds,
    tempo: row.tempo,
    notes: row.notes,
    durationSeconds: row.durationSeconds,
    distanceMeters: row.distanceMeters,
  };
}

function toPublicProgramSection(section: ProgramTree['sections'][number]): PublicProgramSection {
  return {
    id: section.id,
    name: section.name,
    type: section.type,
    timeCapSeconds: section.timeCapSeconds,
    intervalSeconds: section.intervalSeconds,
    rounds: section.rounds,
    restBetweenRoundsSeconds: section.restBetweenRoundsSeconds,
    exercises: section.exercises.map(toPublicProgramExercise),
  };
}

export function toPublicProgramDetail(program: ProgramTree): PublicProgramDetail {
  return {
    id: program.id,
    name: program.name,
    description: program.description,
    type: program.type,
    sectionCount: program.sections.length,
    exerciseCount: program.sections.reduce((sum, section) => sum + section.exercises.length, 0),
    createdAt: program.createdAt.toISOString(),
    updatedAt: program.updatedAt.toISOString(),
    sections: program.sections.map(toPublicProgramSection),
  };
}
