import { addDays, toDateString } from '../common/calendar';

export interface Streaks {
  current: number;
  longest: number;
}

/**
 * Streaks are DERIVED, never stored: a counter in a row is a copy that drifts
 * the first time a log is corrected or deleted.
 *
 * `met` holds the dates the target was actually reached — a partial amount is
 * recorded and shown, but a streak that survived 2 of 8 glasses would not mean
 * anything, and a meaningless streak motivates nobody.
 *
 * The current day is grace: an unticked today does not break the count until
 * the day is over, so a streak reads alive all day instead of zero every
 * morning. `reference` is the DEVICE's local date, per the rule Step 13 set —
 * a streak must not break at 02:00 because the server runs on UTC.
 */
export function computeStreaks(met: ReadonlySet<string>, reference: Date): Streaks {
  return { current: currentStreak(met, reference), longest: longestStreak(met) };
}

function currentStreak(met: ReadonlySet<string>, reference: Date): number {
  let cursor = met.has(toDateString(reference)) ? reference : addDays(reference, -1);
  let streak = 0;

  while (met.has(toDateString(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

function longestStreak(met: ReadonlySet<string>): number {
  const dates = [...met].sort();
  let longest = 0;
  let run = 0;
  let previous: string | undefined;

  for (const date of dates) {
    const isNext =
      previous !== undefined &&
      toDateString(addDays(new Date(`${previous}T00:00:00.000Z`), 1)) === date;

    run = isNext ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  return longest;
}
