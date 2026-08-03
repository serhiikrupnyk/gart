/**
 * How the client is asked, not how the habit is stored. Storage is uniform —
 * a numeric target and a numeric value — so `value >= targetValue` decides
 * whether a day counts for every habit alike.
 */
export const HABIT_KINDS = ['CHECK', 'AMOUNT'] as const;
export type HabitKind = (typeof HABIT_KINDS)[number];

export const HABIT_KIND_LABELS: Record<HabitKind, string> = {
  CHECK: 'Так або ні',
  AMOUNT: 'Із ціллю',
};

/** Offered as a starting point in the add dialog — not rows in a table. */
export const HABIT_SUGGESTIONS: {
  name: string;
  kind: HabitKind;
  targetValue: number;
  unit: string | null;
}[] = [
  { name: 'Вода', kind: 'AMOUNT', targetValue: 8, unit: 'склянок' },
  { name: 'Кроки', kind: 'AMOUNT', targetValue: 10000, unit: 'кроків' },
  { name: 'Сон', kind: 'AMOUNT', targetValue: 8, unit: 'год' },
  { name: 'Прогулянка', kind: 'CHECK', targetValue: 1, unit: null },
  { name: 'Без солодкого', kind: 'CHECK', targetValue: 1, unit: null },
];

/**
 * Half the workout window, deliberately: «скільки води я випив 12 днів тому»
 * is invention, and here invention would rewrite a streak. A week still covers
 * forgetting yesterday or being away for a few days.
 */
export const HABIT_LOG_WINDOW_DAYS = 7;

/** How many days the at-a-glance strip shows, ending at the reference date. */
export const HABIT_STRIP_DAYS = 7;

export const HABIT_TARGET_MIN = 1;
export const HABIT_TARGET_MAX = 999999;

export interface PublicHabit {
  id: string;
  name: string;
  kind: HabitKind;
  targetValue: number;
  unit: string | null;
}

/** One day of one habit. `value: null` means nothing was recorded at all. */
export interface HabitDay {
  date: string;
  value: number | null;
  met: boolean;
}

export interface HabitStatus extends PublicHabit {
  /** The reference date's own record, or null when untouched. */
  today: HabitDay | null;
  /**
   * Consecutive met days ending at the reference date. Today is grace: an
   * unticked today does not break the count until the day is over.
   */
  currentStreak: number;
  /** Kept so a broken streak leaves an achievement, not only a loss. */
  longestStreak: number;
  /** Exactly HABIT_STRIP_DAYS entries, oldest first, ending at the reference date. */
  recentDays: HabitDay[];
}

export interface HabitsView {
  date: string;
  habits: HabitStatus[];
}

export interface CreateHabitRequest {
  name: string;
  kind: HabitKind;
  targetValue?: number;
  unit?: string | null;
}

export interface UpdateHabitRequest {
  name?: string;
  kind?: HabitKind;
  targetValue?: number;
  unit?: string | null;
}

export interface LogHabitRequest {
  value: number;
}
