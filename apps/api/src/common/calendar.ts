import { BadRequestException } from '@nestjs/common';

const INVALID_DATE_MESSAGE = 'Некоректна дата';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Plain calendar arithmetic for `@db.Date` columns, which come back as UTC
 * midnight. Shared by the client's own reads and the trainer's monitoring so
 * one notion of a day serves both.
 */

/**
 * 'YYYY-MM-DD' → UTC midnight. The route regex lets impossible dates like
 * 2026-02-31 through, and V8 quietly rolls those over into March — the
 * round-trip comparison rejects both cases.
 */
export function parseIsoDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(INVALID_DATE_MESSAGE);
  }

  return parsed;
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ISO weekday of a UTC-midnight date: Пн=1 … Нд=7, matching `daysOfWeek`. */
export function isoWeekday(day: Date): number {
  const weekday = day.getUTCDay();

  return weekday === 0 ? 7 : weekday;
}

export function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * MS_PER_DAY);
}

export function differenceInDays(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

/** Today as UTC midnight — the same day boundary the Date columns use. */
export function utcToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Every day from `from` to `to` inclusive. Callers bound the range first. */
export function eachDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];

  for (let day = from; day.getTime() <= to.getTime(); day = addDays(day, 1)) {
    days.push(day);
  }

  return days;
}
