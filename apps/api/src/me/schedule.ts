import { BadRequestException } from '@nestjs/common';
import { LOG_WINDOW_DAYS } from '@gart/shared';

import { differenceInDays, isoWeekday, utcToday } from '../common/calendar';

const OUT_OF_WINDOW_MESSAGE = `Записувати можна протягом ${String(LOG_WINDOW_DAYS)} днів після тренування`;
const FUTURE_DATE_MESSAGE = 'Не можна записати майбутнє тренування';

/**
 * A device's local calendar day never runs more than a day ahead of UTC, so
 * one day of tolerance keeps every real timezone from being refused its own
 * today without opening the door to logging next week.
 */
const FUTURE_TOLERANCE_DAYS = 1;

/**
 * The one schedule predicate. Reading a day's workouts and logging against it
 * ask the same question — «is this assignment on, for this client, on this
 * date?» — so they share one where clause rather than two that can drift.
 *
 * The trainer's history asks a related but different question — «what was
 * scheduled over this range?» — and expands the same rule over dates instead
 * of filtering by one; see `monitoring/occurrences.ts`.
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
 * Step 13 established that the device owns «сьогодні» — that still holds: this
 * decides nothing about what a date *means*, it only refuses dates too far
 * from now to be a memory of training rather than an invention.
 */
export function assertWithinLogWindow(day: Date, now: Date): void {
  const offsetDays = differenceInDays(day, utcToday(now));

  if (offsetDays > FUTURE_TOLERANCE_DAYS) {
    throw new BadRequestException(FUTURE_DATE_MESSAGE);
  }
  if (offsetDays < -LOG_WINDOW_DAYS) {
    throw new BadRequestException(OUT_OF_WINDOW_MESSAGE);
  }
}
