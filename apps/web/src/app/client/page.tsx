'use client';

import { useEffect, useState } from 'react';
import type { ClientAssignment, ClientWorkoutDay } from '@gart/shared';

import { PlanList } from '@/components/client/plan-list';
import { WeekStrip } from '@/components/client/week-strip';
import { WorkoutCard } from '@/components/client/workout-card';
import { EmptyState, Spinner, useToast } from '@/components/ui';
import { getMyWorkouts, listMyAssignments } from '@/lib/client-workouts';
import {
  formatDay,
  formatDayTitle,
  isScheduledOn,
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
  const [plans, setPlans] = useState<ClientAssignment[] | undefined>();

  useEffect(() => {
    let active = true;

    getMyWorkouts(selected)
      .then((loaded) => {
        if (active) setDay(loaded);
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
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" label="Завантаження тренувань" />
      </div>
    );
  }

  // A client with no programs at all gets the honest empty frame, not a
  // week strip full of nothing.
  if (plans.length === 0 && day.workouts.length === 0) {
    return (
      <>
        <h1 className="pb-6 text-2xl font-semibold tracking-tight text-text">Мої тренування</h1>
        <EmptyState
          title="Тренувань ще немає"
          description="Ваш тренер незабаром складе вашу першу програму — вона з'явиться тут."
        />
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
          day.workouts.map((workout) => <WorkoutCard key={workout.id} workout={workout} />)
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text">Мій план</h2>
        <div className="mt-3">
          <PlanList plans={plans} />
        </div>
      </section>
    </>
  );
}
