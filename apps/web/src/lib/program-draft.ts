import type {
  LoadUnit,
  MuscleGroup,
  ProgramSectionInput,
  PublicProgramDetail,
  WorkoutType,
} from '@gart/shared';

import { sectionConfigFor } from './program-rules';

/**
 * The builder's local shape: the wire tree plus `uid`s for React keys and drag
 * identity, and a denormalised exercise name so rows render without lookups.
 * `toSectionInputs` strips all of that — the payload is exactly Step 10's
 * shape: no ids, no order fields, the array is the order.
 */
export interface DraftExercise {
  uid: string;
  exerciseId: string;
  exerciseName: string;
  primaryMuscleGroup: MuscleGroup;
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

export interface DraftSection {
  uid: string;
  name: string;
  type: WorkoutType;
  timeCapSeconds: number | null;
  intervalSeconds: number | null;
  rounds: number | null;
  restBetweenRoundsSeconds: number | null;
  exercises: DraftExercise[];
}

export interface ProgramDraft {
  name: string;
  description: string;
  type: WorkoutType;
  sections: DraftSection[];
}

let uidCounter = 0;

/** Stable within a session; never persisted, so a counter is plenty. */
export function nextUid(): string {
  uidCounter += 1;

  return `draft-${String(uidCounter)}`;
}

/** Sensible starting config per type — the required fields arrive pre-filled. */
export function newSection(type: WorkoutType): DraftSection {
  return {
    uid: nextUid(),
    name: '',
    type,
    timeCapSeconds: type === 'AMRAP' ? 600 : null,
    intervalSeconds: type === 'EMOM' ? 60 : null,
    rounds: type === 'EMOM' ? 10 : type === 'CIRCUIT' ? 3 : null,
    restBetweenRoundsSeconds: null,
    exercises: [],
  };
}

/**
 * Retyping a section keeps only the config its new type allows and pre-fills
 * newly-required fields — a stale AMRAP time cap can never ride along into a
 * STRENGTH payload.
 */
export function retypeSection(section: DraftSection, type: WorkoutType): DraftSection {
  const defaults = newSection(type);
  const allowed = new Set(sectionConfigFor(type).map((spec) => spec.field));

  return {
    ...section,
    type,
    timeCapSeconds: allowed.has('timeCapSeconds')
      ? (section.timeCapSeconds ?? defaults.timeCapSeconds)
      : null,
    intervalSeconds: allowed.has('intervalSeconds')
      ? (section.intervalSeconds ?? defaults.intervalSeconds)
      : null,
    rounds: allowed.has('rounds') ? (section.rounds ?? defaults.rounds) : null,
    restBetweenRoundsSeconds: allowed.has('restBetweenRoundsSeconds')
      ? section.restBetweenRoundsSeconds
      : null,
  };
}

export function emptyDraft(): ProgramDraft {
  return { name: '', description: '', type: 'STRENGTH', sections: [] };
}

export function draftFromDetail(detail: PublicProgramDetail): ProgramDraft {
  return {
    name: detail.name,
    description: detail.description ?? '',
    type: detail.type,
    sections: detail.sections.map((section) => ({
      uid: nextUid(),
      name: section.name ?? '',
      type: section.type,
      timeCapSeconds: section.timeCapSeconds,
      intervalSeconds: section.intervalSeconds,
      rounds: section.rounds,
      restBetweenRoundsSeconds: section.restBetweenRoundsSeconds,
      exercises: section.exercises.map((line) => ({
        uid: nextUid(),
        exerciseId: line.exercise.id,
        exerciseName: line.exercise.name,
        primaryMuscleGroup: line.exercise.primaryMuscleGroup,
        sets: line.sets,
        reps: line.reps,
        loadValue: line.loadValue,
        loadUnit: line.loadUnit,
        loadText: line.loadText,
        restSeconds: line.restSeconds,
        tempo: line.tempo,
        notes: line.notes,
        durationSeconds: line.durationSeconds,
        distanceMeters: line.distanceMeters,
      })),
    })),
  };
}

/** The wire tree: local identity stripped, empty strings normalised to null. */
export function toSectionInputs(sections: DraftSection[]): ProgramSectionInput[] {
  return sections.map((section) => ({
    name: section.name.trim() === '' ? null : section.name.trim(),
    type: section.type,
    timeCapSeconds: section.timeCapSeconds,
    intervalSeconds: section.intervalSeconds,
    rounds: section.rounds,
    restBetweenRoundsSeconds: section.restBetweenRoundsSeconds,
    exercises: section.exercises.map((line) => ({
      exerciseId: line.exerciseId,
      sets: line.sets,
      reps: line.reps,
      loadValue: line.loadValue,
      loadUnit: line.loadUnit,
      loadText: line.loadText === null || line.loadText.trim() === '' ? null : line.loadText,
      restSeconds: line.restSeconds,
      tempo: line.tempo === null || line.tempo.trim() === '' ? null : line.tempo,
      notes: line.notes === null || line.notes.trim() === '' ? null : line.notes,
      durationSeconds: line.durationSeconds,
      distanceMeters: line.distanceMeters,
    })),
  }));
}

/** Move an element one step; returns the same array when the move is impossible. */
export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;

  if (index < 0 || target < 0 || target >= items.length) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(index, 1);

  if (moved === undefined) {
    return items;
  }

  next.splice(target, 0, moved);

  return next;
}

/** Reorder by identity, for drag-and-drop: places `movingUid` before `targetUid`. */
export function reorderByUid<T extends { uid: string }>(
  items: T[],
  movingUid: string,
  targetUid: string,
): T[] {
  if (movingUid === targetUid) {
    return items;
  }

  const moving = items.find((item) => item.uid === movingUid);

  if (moving === undefined) {
    return items;
  }

  const without = items.filter((item) => item.uid !== movingUid);
  const targetIndex = without.findIndex((item) => item.uid === targetUid);

  if (targetIndex === -1) {
    return items;
  }

  return [...without.slice(0, targetIndex), moving, ...without.slice(targetIndex)];
}
