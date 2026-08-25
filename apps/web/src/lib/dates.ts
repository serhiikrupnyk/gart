import { LOG_WINDOW_DAYS, type ClientAssignment, type DayOfWeek } from '@gart/shared';

/**
 * Local calendar math for the client app. «Сьогодні» is the DEVICE's calendar
 * day: dates are built from local components and never via toISOString, which
 * would shift evening users east of UTC onto tomorrow's workout.
 */

/** 'YYYY-MM-DD' from local components. */
export function localDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${String(date.getFullYear())}-${month}-${day}`;
}

/** 'YYYY-MM-DD' → local midnight — the inverse of localDateString. */
export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);

  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** ISO weekday in local time: Пн=1 … Нд=7, matching `daysOfWeek` on the wire. */
export function isoWeekdayOf(date: Date): DayOfWeek {
  const weekday = date.getDay();

  return (weekday === 0 ? 7 : weekday) as DayOfWeek;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Пн…Нд of the week containing `date`, as local dates. */
export function weekOf(date: Date): Date[] {
  const monday = addDays(date, 1 - isoWeekdayOf(date));

  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

const DAY_TITLE = new Intl.DateTimeFormat('uk-UA', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * «25 серп. 2026 р.» — a stamp on a record that outlives the week it happened
 * in. The workout screens can say «понеділок, 3 серпня» because they are always
 * looking at the current week; a payment from last year cannot.
 */
const RECORD_DATE = new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium' });

export function formatRecordDate(iso: string): string {
  return RECORD_DATE.format(new Date(iso));
}

/** «понеділок, 3 серпня» — for use inside a sentence. */
export function formatDay(date: Date): string {
  return DAY_TITLE.format(date);
}

/** «Понеділок, 3 серпня» — the same, capitalized for a heading. */
export function formatDayTitle(date: Date): string {
  const formatted = formatDay(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/** The schedule predicate, mirroring the API query: ACTIVE ∧ window ∧ weekday. */
export function isScheduledOn(assignment: ClientAssignment, date: Date): boolean {
  if (assignment.status !== 'ACTIVE') {
    return false;
  }

  // 'YYYY-MM-DD' compares correctly as a plain string.
  const day = localDateString(date);

  if (day < assignment.startDate) {
    return false;
  }
  if (assignment.endDate !== null && day > assignment.endDate) {
    return false;
  }

  return assignment.daysOfWeek.includes(isoWeekdayOf(date));
}

/**
 * Whether a day may still be recorded, mirroring the API's window so the UI
 * hides controls the server would refuse. Both dates are local calendar days.
 */
export function isWithinLogWindow(date: Date, today: Date): boolean {
  const offset = Math.round(
    (startOfDay(date).getTime() - startOfDay(today).getTime()) / 86_400_000,
  );

  return offset <= 0 && offset >= -LOG_WINDOW_DAYS;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Far enough to bridge any weekly schedule's longest gap. */
const NEXT_SESSION_HORIZON_DAYS = 28;

/** The first scheduled date strictly after `from`, or null inside the horizon. */
export function nextScheduledDate(assignments: ClientAssignment[], from: Date): Date | null {
  for (let offset = 1; offset <= NEXT_SESSION_HORIZON_DAYS; offset += 1) {
    const candidate = addDays(from, offset);

    if (assignments.some((assignment) => isScheduledOn(assignment, candidate))) {
      return candidate;
    }
  }

  return null;
}
