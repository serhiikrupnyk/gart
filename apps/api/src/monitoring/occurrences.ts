import { eachDay, isoWeekday, toDateString } from '../common/calendar';

/** The schedule fields an occurrence walk needs, and nothing more. */
export interface ScheduledAssignment {
  startDate: Date;
  endDate: Date | null;
  daysOfWeek: number[];
}

/**
 * A session that *should* have happened. Logs record what a client did; nothing
 * records what they did not, so «missed» has to be generated from the schedule
 * — the same rule Step 13/14 use to filter one day, walked over a range.
 *
 * Callers bound the range (92 days), so this is at most a few dozen iterations.
 */
export function occurrenceDates(
  assignment: ScheduledAssignment,
  from: Date,
  to: Date,
): { date: Date; key: string }[] {
  const start = assignment.startDate.getTime() > from.getTime() ? assignment.startDate : from;
  const end =
    assignment.endDate !== null && assignment.endDate.getTime() < to.getTime()
      ? assignment.endDate
      : to;

  if (start.getTime() > end.getTime()) {
    return [];
  }

  const days = new Set(assignment.daysOfWeek);

  return eachDay(start, end)
    .filter((day) => days.has(isoWeekday(day)))
    .map((date) => ({ date, key: toDateString(date) }));
}

/**
 * Statuses whose occurrences count. COMPLETED means a cycle finished properly,
 * so its past sessions remain history; ARCHIVED means retired or assigned by
 * mistake, so it stops generating sessions the client was never really expected
 * to do.
 */
export const HISTORY_STATUSES = ['ACTIVE', 'COMPLETED'] as const;
