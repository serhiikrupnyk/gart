import type { MuscleGroup } from './exercise';

/**
 * One vocabulary for programs and their sections: the program's type is the
 * headline and the UI default; each section's type governs its execution, so a
 * session can mix a strength warm-up with an AMRAP finisher.
 */
export const WORKOUT_TYPES = ['STRENGTH', 'RUNNING', 'AMRAP', 'EMOM', 'CIRCUIT', 'CUSTOM'] as const;

export type WorkoutType = (typeof WORKOUT_TYPES)[number];

export const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  STRENGTH: 'Силове',
  RUNNING: 'Біг',
  AMRAP: 'AMRAP',
  EMOM: 'EMOM',
  CIRCUIT: 'Кругове',
  CUSTOM: 'Довільне',
};

/**
 * Prescribed load is either a number with a unit or free text, never both.
 * Numbers stay numbers so Phase 2 progression charts and %1RM math never parse
 * prose; «до відмови»-style intent stays honest text.
 */
export const LOAD_UNITS = ['KG', 'PERCENT_1RM', 'RPE'] as const;

export type LoadUnit = (typeof LOAD_UNITS)[number];

export const LOAD_UNIT_LABELS: Record<LoadUnit, string> = {
  KG: 'кг',
  PERCENT_1RM: '%1ПМ',
  RPE: 'RPE',
};

/** One prescribed line of a section. All prescription fields are optional —
 * structure is validated, methodology is not legislated. */
export interface PublicProgramExercise {
  id: string;
  /** Slim embed so the builder renders names without fanning out N fetches. */
  exercise: { id: string; name: string; primaryMuscleGroup: MuscleGroup };
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

export interface PublicProgramSection {
  id: string;
  name: string | null;
  type: WorkoutType;
  timeCapSeconds: number | null;
  intervalSeconds: number | null;
  rounds: number | null;
  restBetweenRoundsSeconds: number | null;
  exercises: PublicProgramExercise[];
}

/** List-row shape: enough for a programs table, no tree. */
export interface PublicProgram {
  id: string;
  name: string;
  description: string | null;
  type: WorkoutType;
  sectionCount: number;
  exerciseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProgramDetail extends PublicProgram {
  sections: PublicProgramSection[];
}

export interface ProgramPage {
  items: PublicProgram[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Requests carry no `order` fields anywhere: the array position IS the order,
 * and the server writes indexes — there is no way to submit an inconsistent
 * ordering. Section and line ids are server-owned and absent here too; saving
 * a tree replaces it wholesale.
 */
export interface ProgramExerciseInput {
  exerciseId: string;
  sets?: number | null;
  reps?: number | null;
  loadValue?: number | null;
  loadUnit?: LoadUnit | null;
  loadText?: string | null;
  restSeconds?: number | null;
  tempo?: string | null;
  notes?: string | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
}

export interface ProgramSectionInput {
  name?: string | null;
  type: WorkoutType;
  timeCapSeconds?: number | null;
  intervalSeconds?: number | null;
  rounds?: number | null;
  restBetweenRoundsSeconds?: number | null;
  exercises: ProgramExerciseInput[];
}

export interface CreateProgramRequest {
  name: string;
  description?: string | null;
  type: WorkoutType;
  sections: ProgramSectionInput[];
}

/** PATCH: meta fields update in place; a present `sections` replaces the tree. */
export interface UpdateProgramRequest {
  name?: string;
  description?: string | null;
  type?: WorkoutType;
  sections?: ProgramSectionInput[];
}
