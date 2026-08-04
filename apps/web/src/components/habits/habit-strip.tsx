import type { HabitDay } from '@gart/shared';
import { Flame } from 'lucide-react';

import { cx } from '@/lib/cx';
import { formatShortDate } from '@/lib/workout-format';

/**
 * The last week at a glance. Three states, and none of them is failure: met,
 * partly done, and nothing recorded — a missed day is simply empty, not red.
 */
export function HabitStrip({ days }: { days: HabitDay[] }) {
  return (
    <ul className="flex gap-1" aria-label="Останній тиждень">
      {days.map((day) => {
        const state = day.met ? 'виконано' : day.value === null ? 'без відмітки' : 'частково';

        return (
          <li
            key={day.date}
            title={`${formatShortDate(day.date)}: ${state}`}
            className={cx(
              'size-3 rounded-full',
              day.met
                ? 'bg-success'
                : day.value === null
                  ? 'border border-border-strong'
                  : 'bg-warning/60',
            )}
          >
            <span className="sr-only">
              {formatShortDate(day.date)}: {state}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** «7 днів поспіль», or an invitation when there is no streak yet. */
export function StreakLabel({ streak, longest }: { streak: number; longest: number }) {
  if (streak > 0) {
    return (
      <span className="text-sm font-medium text-accent">
        <Flame className="inline size-4 align-[-2px]" aria-hidden="true" /> {streak}{' '}
        {streak === 1 ? 'день' : streak < 5 ? 'дні' : 'днів'} поспіль
      </span>
    );
  }

  return (
    <span className="text-sm text-text-secondary">
      {longest > 0 ? `Найдовша серія: ${String(longest)}` : 'Почніть сьогодні'}
    </span>
  );
}
