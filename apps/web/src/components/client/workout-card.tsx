'use client';

import { useState } from 'react';
import {
  WORKOUT_TYPE_LABELS,
  type ClientWorkout,
  type ClientWorkoutExercise,
  type ClientWorkoutSection,
} from '@gart/shared';

import { MediaPlayer } from '@/components/exercises/media-player';
import { Badge } from '@/components/ui';
import { prescriptionLine, sectionConfigLine } from '@/lib/workout-format';

/** One assigned workout, phone-first: big text, big targets, media on tap. */
export function WorkoutCard({ workout }: { workout: ClientWorkout }) {
  return (
    <article className="overflow-hidden rounded-card border border-border bg-surface">
      <header className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-text">{workout.name}</h2>
          <Badge tone="neutral">{WORKOUT_TYPE_LABELS[workout.type]}</Badge>
        </div>
        {workout.description !== null && (
          <p className="mt-1 text-sm text-text-secondary">{workout.description}</p>
        )}
      </header>

      <div className="divide-y divide-border">
        {workout.sections.map((section) => (
          <SectionBlock key={section.id} section={section} />
        ))}
      </div>
    </article>
  );
}

function SectionBlock({ section }: { section: ClientWorkoutSection }) {
  const config = sectionConfigLine(section);

  return (
    <section className="px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-text">
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
            <ExerciseCard line={line} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ExerciseCard({ line }: { line: ClientWorkoutExercise }) {
  const [showInstructions, setShowInstructions] = useState(false);
  const prescription = prescriptionLine(line);

  return (
    <div className="rounded-card border border-border bg-bg-subtle p-4">
      <h4 className="text-base font-medium text-text">{line.exercise.name}</h4>
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
    </div>
  );
}
