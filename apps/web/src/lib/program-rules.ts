import type { WorkoutType } from '@gart/shared';

import type { DraftSection, ProgramDraft } from './program-draft';

/**
 * The client mirror of the API's program-rules table. It decides which fields
 * *exist* in the builder, so invalid combinations are unrepresentable rather
 * than validated after the fact. The API remains the authority — this table
 * only ever shows a subset of what it allows.
 */
export type SectionConfigField =
  'timeCapSeconds' | 'intervalSeconds' | 'rounds' | 'restBetweenRoundsSeconds';

export interface SectionConfigSpec {
  field: SectionConfigField;
  label: string;
  required: boolean;
}

const ROUNDS_OPTIONAL: SectionConfigSpec[] = [
  { field: 'rounds', label: 'Раунди', required: false },
  { field: 'restBetweenRoundsSeconds', label: 'Відпочинок між раундами, с', required: false },
];

const SECTION_CONFIG: Record<WorkoutType, SectionConfigSpec[]> = {
  STRENGTH: ROUNDS_OPTIONAL,
  RUNNING: ROUNDS_OPTIONAL,
  CUSTOM: ROUNDS_OPTIONAL,
  AMRAP: [{ field: 'timeCapSeconds', label: 'Ліміт часу, с', required: true }],
  EMOM: [
    { field: 'intervalSeconds', label: 'Інтервал, с', required: true },
    { field: 'rounds', label: 'Кількість інтервалів', required: true },
  ],
  CIRCUIT: [
    { field: 'rounds', label: 'Раунди', required: true },
    { field: 'restBetweenRoundsSeconds', label: 'Відпочинок між раундами, с', required: false },
  ],
};

export function sectionConfigFor(type: WorkoutType): SectionConfigSpec[] {
  return SECTION_CONFIG[type];
}

/** Which prescription inputs a line shows, per its section's type. */
export type PrescriptionField =
  | 'sets'
  | 'reps'
  | 'load'
  | 'restSeconds'
  | 'tempo'
  | 'durationSeconds'
  | 'distanceMeters'
  | 'notes';

const PRESCRIPTION_FIELDS: Record<WorkoutType, PrescriptionField[]> = {
  STRENGTH: ['sets', 'reps', 'load', 'restSeconds', 'tempo', 'durationSeconds', 'notes'],
  RUNNING: ['distanceMeters', 'durationSeconds', 'restSeconds', 'notes'],
  AMRAP: ['reps', 'load', 'durationSeconds', 'notes'],
  EMOM: ['reps', 'load', 'durationSeconds', 'notes'],
  CIRCUIT: ['reps', 'durationSeconds', 'load', 'restSeconds', 'notes'],
  CUSTOM: [
    'sets',
    'reps',
    'load',
    'restSeconds',
    'tempo',
    'durationSeconds',
    'distanceMeters',
    'notes',
  ],
};

export function prescriptionFieldsFor(type: WorkoutType): PrescriptionField[] {
  return PRESCRIPTION_FIELDS[type];
}

/** Per-round / per-interval phrasing where the section supplies the rounds. */
export const REPS_LABELS: Partial<Record<WorkoutType, string>> = {
  AMRAP: 'Повтори за раунд',
  EMOM: 'Повтори за інтервал',
};

export interface DraftValidation {
  nameError?: string;
  /** Keyed by section uid. */
  sectionErrors: Map<string, string>;
}

/** Mirrors only what the API requires; everything else the API rules on. */
export function validateProgramDraft(draft: ProgramDraft): DraftValidation {
  const sectionErrors = new Map<string, string>();

  draft.sections.forEach((section) => {
    const missing = missingRequiredConfig(section);

    if (missing !== undefined) {
      sectionErrors.set(section.uid, missing);
    }
  });

  return {
    nameError: draft.name.trim() === '' ? 'Введіть назву програми' : undefined,
    sectionErrors,
  };
}

function missingRequiredConfig(section: DraftSection): string | undefined {
  for (const spec of sectionConfigFor(section.type)) {
    if (spec.required && section[spec.field] === null) {
      return `Заповніть поле «${spec.label}»`;
    }
  }

  return undefined;
}
