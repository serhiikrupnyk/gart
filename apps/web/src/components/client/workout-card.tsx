'use client';

import { useState } from 'react';
import {
  WORKOUT_TYPE_LABELS,
  type ClientWorkout,
  type ClientWorkoutExercise,
  type ClientWorkoutLog,
  type ClientWorkoutSection,
} from '@gart/shared';

import { MediaPlayer } from '@/components/exercises/media-player';
import { Badge } from '@/components/ui';
import { prescriptionLine, sectionConfigLine } from '@/lib/workout-format';
import { ExerciseLog } from './exercise-log';

export type WorkoutLogMap = Record<string, ClientWorkoutLog | null>;

interface LoggingProps {
  date: string;
  canLog: boolean;
  logs: WorkoutLogMap;
  onLogged: (lineId: string, log: ClientWorkoutLog | null) => void;
}

/** One assigned workout, phone-first: big text, big targets, media on tap. */
export function WorkoutCard({ workout, ...logging }: { workout: ClientWorkout } & LoggingProps) {
  const lines = workout.sections.flatMap((section) => section.exercises);
  const done = lines.filter((line) => logging.logs[line.id]?.completed === true).length;

  return (
    <article className="overflow-hidden rounded-panel border border-border bg-surface shadow-e2">
      <header className="relative overflow-hidden border-b border-border bg-gradient-to-br from-surface via-surface to-accent-subtle/45 px-5 py-5">
        <span
          aria-hidden="true"
          className="absolute -right-10 -top-12 size-32 rounded-full border border-accent/15"
        />
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="relative text-xl font-bold tracking-[-0.03em] text-text">
            {workout.name}
          </h2>
          <Badge tone="neutral">{WORKOUT_TYPE_LABELS[workout.type]}</Badge>
        </div>
        {workout.description !== null && (
          <p className="mt-1 text-sm text-text-secondary">{workout.description}</p>
        )}
        {lines.length > 0 && (
          <div className="relative mt-4">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-text-secondary">
              <span>Прогрес тренування</span>
              <span className="tabular">
                {done} з {lines.length} виконано
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
              <span
                className="block h-full rounded-full bg-accent transition-[width] duration-500 ease-out-expo"
                style={{ width: `${String((done / lines.length) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </header>

      <div className="divide-y divide-border">
        {workout.sections.map((section) => (
          <SectionBlock key={section.id} section={section} {...logging} />
        ))}
      </div>
    </article>
  );
}

function SectionBlock({ section, ...logging }: { section: ClientWorkoutSection } & LoggingProps) {
  const config = sectionConfigLine(section);

  return (
    <section className="px-4 py-5 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-text">
          {section.name ?? WORKOUT_TYPE_LABELS[section.type]}
        </h3>
        {section.name !== null && (
          <span className="text-xs text-text-secondary">{WORKOUT_TYPE_LABELS[section.type]}</span>
        )}
      </div>
      {config !== null && <p className="mt-0.5 text-xs text-text-secondary">{config}</p>}

      <ul className="mt-3 space-y-3">
        {section.exercises.map((line) => (
          <li key={line.id}>
            <ExerciseCard line={line} {...logging} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ExerciseCard({
  line,
  date,
  canLog,
  logs,
  onLogged,
}: { line: ClientWorkoutExercise } & LoggingProps) {
  const [showInstructions, setShowInstructions] = useState(false);
  const prescription = prescriptionLine(line);

  // The map is the live record; the tree's own `log` is only its seed.
  const logged = { ...line, log: logs[line.id] ?? null };

  return (
    <div className="rounded-card border border-border bg-bg-subtle/70 p-4 shadow-e1 sm:p-5">
      <h4 className="text-base font-bold text-text">{line.exercise.name}</h4>
      {prescription !== '' && (
        <p className="mt-1 text-lg font-semibold text-text">{prescription}</p>
      )}
      {line.notes !== null && <p className="mt-1 text-sm text-text-secondary">{line.notes}</p>}

      {line.exercise.textInstructions !== null && (
        <>
          <button
            type="button"
            aria-expanded={showInstructions}
            onClick={() => {
              setShowInstructions((open) => !open);
            }}
            className="mt-1 min-h-11 text-sm font-medium text-accent"
          >
            {showInstructions ? 'Сховати техніку' : 'Як виконувати'}
          </button>
          {showInstructions && (
            <p className="whitespace-pre-wrap pb-2 text-sm text-text-secondary">
              {line.exercise.textInstructions}
            </p>
          )}
        </>
      )}

      {line.exercise.media.length > 0 && (
        <div className="mt-3 space-y-2">
          {line.exercise.media.map((media) => (
            <MediaPlayer key={media.kind} exerciseId={line.exercise.id} media={media} />
          ))}
        </div>
      )}

      <ExerciseLog
        line={logged}
        date={date}
        canLog={canLog}
        onLogged={(log) => {
          onLogged(line.id, log);
        }}
      />
    </div>
  );
}
