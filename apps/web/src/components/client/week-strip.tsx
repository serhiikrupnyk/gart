'use client';

import { DAY_OF_WEEK_LABELS } from '@gart/shared';

import { cx } from '@/lib/cx';
import { formatDayTitle, isoWeekdayOf, localDateString } from '@/lib/dates';

/**
 * The tappable week: seven big targets, a dot on days with a scheduled
 * workout, today marked for orientation. Selecting a day re-queries the
 * workouts for that date; the strip itself stays anchored to today's week.
 */
export function WeekStrip({
  week,
  selected,
  today,
  scheduled,
  onSelect,
}: {
  week: Date[];
  selected: string;
  today: string;
  scheduled: ReadonlySet<string>;
  onSelect: (date: string) => void;
}) {
  return (
    <nav aria-label="Дні тижня" className="grid grid-cols-7 gap-1">
      {week.map((date) => {
        const value = localDateString(date);
        const isSelected = value === selected;
        const hasWorkout = scheduled.has(value);

        return (
          <button
            key={value}
            type="button"
            aria-pressed={isSelected}
            aria-current={value === today ? 'date' : undefined}
            aria-label={`${formatDayTitle(date)}${hasWorkout ? ', заплановано тренування' : ''}`}
            onClick={() => {
              onSelect(value);
            }}
            className={cx(
              'flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-card border transition-colors',
              isSelected
                ? 'border-accent bg-accent text-accent-contrast'
                : cx(
                    'bg-surface text-text hover:bg-bg-subtle',
                    value === today ? 'border-accent' : 'border-border',
                  ),
            )}
          >
            <span
              className={cx(
                'text-2xs uppercase tracking-wide',
                isSelected ? 'text-accent-contrast' : 'text-text-secondary',
              )}
            >
              {DAY_OF_WEEK_LABELS[isoWeekdayOf(date)]}
            </span>
            <span className="text-base font-semibold">{date.getDate()}</span>
            <span
              aria-hidden="true"
              className={cx(
                'size-1.5 rounded-full',
                hasWorkout ? (isSelected ? 'bg-accent-contrast' : 'bg-accent') : 'bg-transparent',
              )}
            />
          </button>
        );
      })}
    </nav>
  );
}
