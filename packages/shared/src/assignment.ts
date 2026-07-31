import type { PublicProgramSection, WorkoutType } from './program';

export const ASSIGNMENT_STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  ACTIVE: 'Активна',
  COMPLETED: 'Завершена',
  ARCHIVED: 'В архіві',
};

/** ISO weekday numbers, Monday first — the Ukrainian week. */
export const DAYS_OF_WEEK = [1, 2, 3, 4, 5, 6, 7] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  7: 'Нд',
};

/**
 * An assigned program as the trainer's client list shows it. The tree is an
 * independent snapshot: `sourceProgramId` is provenance only and goes null if
 * the template is later deleted — the assignment lives on unchanged.
 *
 * Dates travel as 'YYYY-MM-DD'.
 */
export interface PublicAssignment {
  id: string;
  name: string;
  description: string | null;
  type: WorkoutType;
  status: AssignmentStatus;
  startDate: string;
  endDate: string | null;
  daysOfWeek: DayOfWeek[];
  sourceProgramId: string | null;
  sectionCount: number;
  exerciseCount: number;
  assignedAt: string;
  updatedAt: string;
}

/**
 * The full snapshot. Sections reuse the program wire shape — the structures are
 * intentionally identical; only the ids' stability differs (snapshot ids are
 * durable, template ids churn on save).
 */
export interface PublicAssignmentDetail extends PublicAssignment {
  sections: PublicProgramSection[];
}

export interface CreateAssignmentRequest {
  programId: string;
  startDate: string;
  endDate?: string | null;
  daysOfWeek: DayOfWeek[];
}

/** Schedule and status only — the snapshot tree has no update path at all. */
export interface UpdateAssignmentRequest {
  status?: AssignmentStatus;
  startDate?: string;
  endDate?: string | null;
  daysOfWeek?: DayOfWeek[];
}
