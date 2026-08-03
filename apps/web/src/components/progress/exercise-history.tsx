'use client';

import { useEffect, useState } from 'react';
import {
  LOAD_METRIC_LABELS,
  LOAD_METRICS,
  type ExerciseLoadHistory,
  type LoadMetric,
  type LoggedExerciseSummary,
} from '@gart/shared';

import { Select, Tabs, useToast } from '@/components/ui';
import { getExerciseHistory, listLoggedExercises } from '@/lib/progress';
import { LineChart, type ChartPoint } from './line-chart';

function pointsFor(history: ExerciseLoadHistory, metric: LoadMetric): ChartPoint[] {
  return history.points
    .map((point) => ({
      date: point.date,
      value:
        metric === 'TOP_SET'
          ? point.topSetKg
          : metric === 'VOLUME'
            ? point.volumeKg
            : point.estimatedOneRepMaxKg,
    }))
    .filter((point): point is ChartPoint => point.value !== null);
}

/**
 * The load trend for one exercise — derived from the client's own logs, which
 * is why it needs no stored series of its own. Three metrics answer three
 * different coaching questions from the same sessions.
 */
export function ExerciseHistory({ clientId }: { clientId: string }) {
  const { notify } = useToast();

  const [exercises, setExercises] = useState<LoggedExerciseSummary[] | undefined>();
  const [selected, setSelected] = useState('');
  const [metric, setMetric] = useState<LoadMetric>('TOP_SET');
  const [history, setHistory] = useState<ExerciseLoadHistory | undefined>();

  useEffect(() => {
    let active = true;

    listLoggedExercises(clientId)
      .then((loaded) => {
        if (!active) return;

        setExercises(loaded);
        setSelected(loaded[0]?.id ?? '');
      })
      .catch(() => {
        if (active) setExercises([]);
      });

    return () => {
      active = false;
    };
  }, [clientId]);

  useEffect(() => {
    if (selected === '') {
      return;
    }

    let active = true;

    getExerciseHistory(clientId, selected)
      .then((loaded) => {
        if (active) setHistory(loaded);
      })
      .catch(() => {
        notify('Не вдалося завантажити історію вправи', 'danger');
      });

    return () => {
      active = false;
    };
  }, [clientId, selected, notify]);

  if (exercises === undefined) {
    return null;
  }

  if (exercises.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-text">Динаміка по вправі</h3>
        <p className="mt-2 text-sm text-text-secondary">
          Клієнт ще не записав жодного тренування — динаміка зʼявиться після перших записів.
        </p>
      </div>
    );
  }

  const points = history === undefined ? [] : pointsFor(history, metric);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text">Динаміка по вправі</h3>
        <Tabs
          label="Показник"
          items={LOAD_METRICS.map((value) => ({
            value,
            label: LOAD_METRIC_LABELS[value],
            content: null,
          }))}
          value={metric}
          onChange={(value) => {
            setMetric(value as LoadMetric);
          }}
        />
      </div>

      <div className="mt-2 max-w-sm">
        <Select
          aria-label="Вправа"
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value);
          }}
          options={exercises.map((exercise) => ({
            value: exercise.id,
            label: `${exercise.name} (${String(exercise.sessions)})`,
          }))}
        />
      </div>

      <LineChart
        title={history?.exercise.name ?? ''}
        unit="кг"
        points={points}
        emptyLabel="Для цього показника ще немає даних"
      />
    </div>
  );
}
