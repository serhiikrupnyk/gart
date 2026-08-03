'use client';

import { useEffect, useState } from 'react';
import type { HabitStatus, HabitsView } from '@gart/shared';

import { Button, Input, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { clearHabitLog, getMyHabits, logHabit } from '@/lib/habits';
import { HabitStrip, StreakLabel } from './habit-strip';

/** Ukrainian keyboards type a decimal comma; the wire wants a dot. */
function toNumber(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');

  if (trimmed === '') {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * «Звички» on the client's home — the daily reason to open the app, including
 * on rest days. One tap for a checkbox habit; a number and save for a measured
 * one. Nothing here scolds: an unticked day is simply not ticked yet.
 */
export function MyHabits({ date }: { date: string }) {
  const { notify } = useToast();

  const [view, setView] = useState<HabitsView | undefined>();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    getMyHabits(date)
      .then((loaded) => {
        if (active) setView(loaded);
      })
      .catch(() => {
        notify('Не вдалося завантажити звички', 'danger');
      });

    return () => {
      active = false;
    };
  }, [date, reloadKey, notify]);

  if (view === undefined || view.habits.length === 0) {
    return null;
  }

  const done = view.habits.filter((habit) => habit.today?.met === true).length;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-text">Звички</h2>
        {done === view.habits.length ? (
          <span className="text-sm font-medium text-success">Усі звички на сьогодні виконано</span>
        ) : (
          <span className="text-sm text-text-secondary">
            {done} з {view.habits.length}
          </span>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {view.habits.map((habit) => (
          <li key={habit.id}>
            <HabitRow
              habit={habit}
              date={date}
              onChanged={() => {
                setReloadKey((key) => key + 1);
              }}
              onError={(message) => {
                notify(message, 'danger');
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HabitRow({
  habit,
  date,
  onChanged,
  onError,
}: {
  habit: HabitStatus;
  date: string;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [value, setValue] = useState(() =>
    habit.today?.value === undefined || habit.today.value === null
      ? ''
      : String(habit.today.value).replace('.', ','),
  );
  const [pending, setPending] = useState(false);

  const met = habit.today?.met === true;

  async function run(action: () => Promise<unknown>, message: string): Promise<void> {
    setPending(true);

    try {
      await action();
      onChanged();
    } catch (error) {
      onError(error instanceof ApiError ? error.message : message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-medium text-text">{habit.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-3">
            <StreakLabel streak={habit.currentStreak} longest={habit.longestStreak} />
            {habit.kind === 'AMOUNT' && (
              <span className="text-sm text-text-secondary">
                {habit.today?.value ?? 0} з {habit.targetValue} {habit.unit}
              </span>
            )}
          </div>
        </div>

        {habit.kind === 'CHECK' ? (
          <Button
            variant={met ? 'secondary' : 'primary'}
            loading={pending}
            onClick={() =>
              void run(
                () =>
                  met ? clearHabitLog(habit.id, date) : logHabit(habit.id, date, habit.targetValue),
                'Не вдалося зберегти',
              )
            }
          >
            {met ? '✓ Виконано' : 'Відмітити'}
          </Button>
        ) : (
          <div className="flex items-end gap-2">
            <Input
              type="text"
              inputMode="decimal"
              aria-label={`Значення: ${habit.name}`}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
              }}
            />
            <Button
              variant="primary"
              loading={pending}
              onClick={() => {
                const parsed = toNumber(value);

                if (parsed === null) {
                  onError('Введіть число');
                  return;
                }

                void run(() => logHabit(habit.id, date, parsed), 'Не вдалося зберегти');
              }}
            >
              Зберегти
            </Button>
          </div>
        )}
      </div>

      <div className="mt-2">
        <HabitStrip days={habit.recentDays} />
      </div>
    </div>
  );
}
