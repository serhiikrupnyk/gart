'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  LOG_STATE_LABELS,
  SESSION_STATE_LABELS,
  type ClientWorkoutHistory,
  type LogState,
  type SessionState,
  type TrainerSessionExercise,
  type TrainerWorkoutSession,
} from '@gart/shared';

import { Badge, RowsSkeleton, Tabs, type BadgeTone, useToast } from '@/components/ui';
import { actualLine, formatShortDate, prescriptionLine } from '@/lib/workout-format';
import { getWorkoutHistory } from '@/lib/monitoring';

const SESSION_TONES: Record<SessionState, BadgeTone> = {
  DONE: 'success',
  PARTIAL: 'warning',
  SKIPPED: 'danger',
  MISSED: 'neutral',
};

const STATE_TONES: Record<LogState, BadgeTone> = {
  DONE: 'success',
  DEVIATED: 'warning',
  SKIPPED: 'danger',
  MISSING: 'neutral',
};

const RANGES = [
  { value: '7', label: '7 днів' },
  { value: '30', label: '30 днів' },
  { value: '90', label: '90 днів' },
] as const;

/**
 * «Активність» — what the client actually did against what was asked of them.
 * Every scheduled session appears, including the ones nothing was recorded for:
 * a missing workout is the most actionable thing on this page.
 */
export function ClientActivity({ clientId }: { clientId: string }) {
  const { notify } = useToast();

  const [days, setDays] = useState('30');
  const [history, setHistory] = useState<ClientWorkoutHistory | undefined>();

  useEffect(() => {
    let active = true;

    // The previous range stays on screen until the next one lands — a spinner
    // between two nearly identical lists reads as a flash, not as progress.
    getWorkoutHistory(clientId, Number(days), new Date())
      .then((loaded) => {
        if (active) setHistory(loaded);
      })
      .catch(() => {
        notify('Не вдалося завантажити активність', 'danger');
      });

    return () => {
      active = false;
    };
  }, [clientId, days, notify]);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-text">Активність</h2>
        <Tabs
          label="Період активності"
          items={RANGES.map((range) => ({ ...range, content: null }))}
          value={days}
          onChange={setDays}
        />
      </div>

      {history === undefined ? (
        <RowsSkeleton label="Завантаження активності" />
      ) : (
        <>
          <AdherenceLine history={history} />

          <div className="mt-3">
            {history.sessions.length === 0 ? (
              <p className="rounded-card border border-dashed border-border-strong bg-surface px-4 py-6 text-center text-sm text-text-secondary">
                За цей період запланованих тренувань не було.
              </p>
            ) : (
              <ul className="space-y-2">
                {history.sessions.map((session) => (
                  <li key={`${session.assignmentId}-${session.date}`}>
                    <SessionRow session={session} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** Counts, never a curve — how the plan went, not how the client is changing. */
function AdherenceLine({ history }: { history: ClientWorkoutHistory }) {
  const { scheduled, done, partial, skipped, missed } = history.adherence;

  if (scheduled === 0) {
    return null;
  }

  const detail = [
    partial === 0 ? null : `${String(partial)} частково`,
    skipped === 0 ? null : `${String(skipped)} з причиною`,
    missed === 0 ? null : `${String(missed)} без запису`,
  ].filter((part): part is string => part !== null);

  return (
    <p className="mt-3 text-sm text-text">
      <span className="font-semibold">
        {done} з {scheduled} запланованих сесій виконано
      </span>
      {detail.length > 0 && <span className="text-text-secondary"> · {detail.join(' · ')}</span>}
    </p>
  );
}

function SessionRow({ session }: { session: TrainerWorkoutSession }) {
  const [open, setOpen] = useState(false);

  // A stated reason is the point of this screen — it is pulled up to the row
  // rather than left for the trainer to find inside the breakdown.
  const reasons = session.exercises
    .filter((exercise) => exercise.state === 'SKIPPED' && exercise.actual?.notes != null)
    .map((exercise) => ({
      name: exercise.planned.exercise.name,
      note: exercise.actual?.notes ?? '',
    }));
  const notes = session.exercises
    .filter((exercise) => exercise.state !== 'SKIPPED' && exercise.actual?.notes != null)
    .map((exercise) => ({
      name: exercise.planned.exercise.name,
      note: exercise.actual?.notes ?? '',
    }));

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-subtle"
      >
        <span className="w-20 shrink-0 text-sm text-text-secondary">
          {formatShortDate(session.date)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
          {session.name}
        </span>
        <Badge tone={SESSION_TONES[session.state]}>{SESSION_STATE_LABELS[session.state]}</Badge>
        {open ? (
          <ChevronDown className="size-4 text-text-secondary" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4 text-text-secondary" aria-hidden="true" />
        )}
      </button>

      {reasons.length > 0 && (
        <div className="border-t border-danger/30 bg-danger/10 px-4 py-2">
          {reasons.map((reason) => (
            <p key={reason.name} className="text-sm text-danger">
              <span className="font-medium">{reason.name}:</span> {reason.note}
            </p>
          ))}
        </div>
      )}

      {open && (
        <div className="border-t border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Заплановане та фактичне виконання</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-text-secondary">
                <th scope="col" className="px-4 py-2 font-medium">
                  Вправа
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  План
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Факт
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Стан
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {session.exercises.map((exercise) => (
                <ExerciseRow key={exercise.planned.id} exercise={exercise} />
              ))}
            </tbody>
          </table>

          {notes.length > 0 && (
            <div className="border-t border-border px-4 py-2">
              {notes.map((note) => (
                <p key={note.name} className="text-sm text-text-secondary">
                  <span className="font-medium text-text">{note.name}:</span> {note.note}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExerciseRow({ exercise }: { exercise: TrainerSessionExercise }) {
  const planned = prescriptionLine(exercise.planned);
  const actual = exercise.actual === null ? '' : actualLine(exercise.actual.sets);

  return (
    <tr>
      <td className="px-4 py-2 text-text">{exercise.planned.exercise.name}</td>
      <td className="px-4 py-2 text-text-secondary">{planned === '' ? '—' : planned}</td>
      <td
        className={
          exercise.state === 'DEVIATED'
            ? 'px-4 py-2 font-medium text-warning'
            : 'px-4 py-2 text-text'
        }
      >
        {actual === '' ? '—' : actual}
      </td>
      <td className="px-4 py-2">
        <Badge tone={STATE_TONES[exercise.state]}>{LOG_STATE_LABELS[exercise.state]}</Badge>
      </td>
    </tr>
  );
}
