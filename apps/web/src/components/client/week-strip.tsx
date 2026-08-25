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
    <nav
      aria-label="Дні тижня"
      className="grid grid-cols-7 gap-1.5 rounded-card border border-border bg-surface p-1.5 shadow-e1 sm:gap-2 sm:p-2"
    >
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
              'flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-[0.7rem] border transition-[color,background-color,border-color,box-shadow,transform] motion-safe:active:scale-95',
              isSelected
                ? 'border-accent bg-accent text-accent-contrast shadow-[0_6px_16px_rgb(255_91_50_/_0.22)]'
                : cx(
                    'bg-transparent text-text hover:bg-bg-subtle',
                    value === today ? 'border-accent/60' : 'border-transparent',
                  ),
            )}
          >
            <span
              className={cx(
                'text-[0.6rem] font-bold uppercase tracking-wide sm:text-2xs',
                isSelected ? 'text-accent-contrast' : 'text-text-secondary',
              )}
            >
              {DAY_OF_WEEK_LABELS[isoWeekdayOf(date)]}
            </span>
            <span className="text-sm font-bold sm:text-base">{date.getDate()}</span>
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
