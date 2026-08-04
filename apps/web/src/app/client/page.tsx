'use client';

import { useEffect, useState } from 'react';
import { LOG_WINDOW_DAYS, type ClientAssignment, type ClientWorkoutDay } from '@gart/shared';

import { PlanList } from '@/components/client/plan-list';
import { MyHabits } from '@/components/habits/my-habits';
import { WeekStrip } from '@/components/client/week-strip';
import { WorkoutCard, type WorkoutLogMap } from '@/components/client/workout-card';
import { CardListSkeleton, EmptyState, useToast } from '@/components/ui';
import { getMyWorkouts, listMyAssignments } from '@/lib/client-workouts';
import {
  formatDay,
  formatDayTitle,
  isScheduledOn,
  isWithinLogWindow,
  localDateString,
  nextScheduledDate,
  parseLocalDate,
  weekOf,
} from '@/lib/dates';

/**
 * «Сьогодні» — the client home. The DEVICE's calendar decides what today
 * means: the date is computed from local components and sent to the API
 * as-is; the server never consults its own clock.
 */
export default function ClientHomePage() {
  const { notify } = useToast();

  const [today] = useState(() => localDateString(new Date()));
  const [selected, setSelected] = useState(today);
  const [day, setDay] = useState<ClientWorkoutDay | undefined>();
  const [logs, setLogs] = useState<WorkoutLogMap>({});
  const [plans, setPlans] = useState<ClientAssignment[] | undefined>();

  useEffect(() => {
    let active = true;

    getMyWorkouts(selected)
      .then((loaded) => {
        if (!active) return;

        setDay(loaded);
        // The API is the source of truth: every fetch reseeds the records.
        setLogs(
          Object.fromEntries(
            loaded.workouts
              .flatMap((workout) => workout.sections)
              .flatMap((section) => section.exercises)
              .map((line) => [line.id, line.log]),
          ),
        );
      })
      .catch(() => {
        notify('Не вдалося завантажити тренування', 'danger');
      });

    return () => {
      active = false;
    };
  }, [selected, notify]);

  useEffect(() => {
    let active = true;

    listMyAssignments()
      .then((loaded) => {
        if (active) setPlans(loaded);
      })
      .catch(() => {
        if (active) setPlans([]);
        notify('Не вдалося завантажити план', 'danger');
      });

    return () => {
      active = false;
    };
  }, [notify]);

  if (day === undefined || plans === undefined) {
    return <CardListSkeleton count={2} label="Завантаження тренувань" />;
  }

  // A client with no programs at all gets the honest empty frame, not a
  // week strip full of nothing — but their habits still belong here, since
  // they may well have habits before they have a programme.
  if (plans.length === 0 && day.workouts.length === 0) {
    return (
      <>
        <h1 className="pb-6 text-2xl font-semibold tracking-tight text-text">Мої тренування</h1>
        <EmptyState
          title="Тренувань ще немає"
          description="Ваш тренер незабаром складе вашу першу програму — вона з'явиться тут."
        />
        <MyHabits date={selected} />
      </>
    );
  }

  const selectedDate = parseLocalDate(selected);
  const week = weekOf(parseLocalDate(today));
  const scheduled = new Set(
    week
      .filter((date) => plans.some((plan) => isScheduledOn(plan, date)))
      .map((date) => localDateString(date)),
  );
  const isToday = selected === today;
  const next = nextScheduledDate(plans, selectedDate);
  const canLog = isWithinLogWindow(selectedDate, parseLocalDate(today));

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-text">
        {isToday ? 'Сьогодні' : formatDayTitle(selectedDate)}
      </h1>
      {isToday && <p className="mt-0.5 text-sm text-text-secondary">{formatDay(selectedDate)}</p>}

      <div className="mt-4">
        <WeekStrip
          week={week}
          selected={selected}
          today={today}
          scheduled={scheduled}
          onSelect={setSelected}
        />
      </div>

      <div className="mt-6 space-y-4">
        {day.workouts.length === 0 ? (
          <EmptyState
            title={isToday ? 'Сьогодні відпочинок' : 'На цей день тренувань немає'}
            description={
              next === null
                ? 'Відновлення — теж частина плану.'
                : `Наступне тренування — ${formatDay(next)}.`
            }
          />
        ) : (
          <>
            {!canLog && (
              <p className="rounded-card border border-dashed border-border-strong bg-surface px-4 py-3 text-sm text-text-secondary">
                {`Записати тренування можна в день заняття або протягом ${String(LOG_WINDOW_DAYS)} днів після нього.`}
              </p>
            )}
            {day.workouts.map((workout) => (
              <WorkoutCard
                key={workout.id}
                workout={workout}
                date={selected}
                canLog={canLog}
                logs={logs}
                onLogged={(lineId, log) => {
                  setLogs((current) => ({ ...current, [lineId]: log }));
                }}
              />
            ))}
          </>
        )}
      </div>

      <MyHabits date={selected} />

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text">Мій план</h2>
        <div className="mt-3">
          <PlanList plans={plans} />
        </div>
      </section>
    </>
  );
}
