import { BadRequestException } from '@nestjs/common';
import { LOG_WINDOW_DAYS } from '@gart/shared';

const INVALID_DATE_MESSAGE = 'Некоректна дата';
const OUT_OF_WINDOW_MESSAGE = `Записувати можна протягом ${String(LOG_WINDOW_DAYS)} днів після тренування`;
const FUTURE_DATE_MESSAGE = 'Не можна записати майбутнє тренування';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A device's local calendar day never runs more than a day ahead of UTC, so
 * one day of tolerance keeps every real timezone from being refused its own
 * today without opening the door to logging next week.
 */
const FUTURE_TOLERANCE_DAYS = 1;

/**
 * 'YYYY-MM-DD' → UTC midnight, matching the @db.Date columns. The route regex
 * lets impossible dates like 2026-02-31 through, and V8 quietly rolls those
 * over into March — the round-trip comparison rejects both cases.
 */
export function parseIsoDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(INVALID_DATE_MESSAGE);
  }

  return parsed;
}

/** ISO weekday of a UTC-midnight date: Пн=1 … Нд=7, matching `daysOfWeek`. */
export function isoWeekday(day: Date): number {
  const weekday = day.getUTCDay();

  return weekday === 0 ? 7 : weekday;
}

/**
 * The one schedule predicate. Reading a day's workouts and logging against it
 * ask the same question — «is this assignment on, for this client, on this
 * date?» — so they share one where clause rather than two that can drift.
 */
export function scheduledAssignmentWhere(trainerId: string, clientId: string, day: Date) {
  return {
    trainerId,
    clientId,
    status: 'ACTIVE' as const,
    startDate: { lte: day },
    OR: [{ endDate: null }, { endDate: { gte: day } }],
    daysOfWeek: { has: isoWeekday(day) },
  };
}

/**
 * The only place the server consults its own clock. Step 13 established that
 * the device owns «сьогодні» — that still holds: this decides nothing about
 * what a date *means*, it only refuses dates too far from now to be a memory
 * of training rather than an invention.
 */
export function assertWithinLogWindow(day: Date, now: Date): void {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const offsetDays = Math.round((day.getTime() - today) / MS_PER_DAY);

  if (offsetDays > FUTURE_TOLERANCE_DAYS) {
    throw new BadRequestException(FUTURE_DATE_MESSAGE);
  }
  if (offsetDays < -LOG_WINDOW_DAYS) {
    throw new BadRequestException(OUT_OF_WINDOW_MESSAGE);
  }
}
