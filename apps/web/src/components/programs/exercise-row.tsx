'use client';

import { useId, useState } from 'react';
import { LOAD_UNIT_LABELS, type WorkoutType } from '@gart/shared';
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';

import { Button, Input, Textarea } from '@/components/ui';
import type { DraftExercise } from '@/lib/program-draft';
import { prescriptionFieldsFor, REPS_LABELS } from '@/lib/program-rules';
import { LoadInput } from './load-input';

function summary(line: DraftExercise): string {
  const parts: string[] = [];

  if (line.sets !== null || line.reps !== null) {
    parts.push(
      `${line.sets === null ? '—' : String(line.sets)}×${line.reps === null ? '—' : String(line.reps)}`,
    );
  }
  if (line.loadValue !== null && line.loadUnit !== null) {
    parts.push(`${String(line.loadValue)} ${LOAD_UNIT_LABELS[line.loadUnit]}`);
  }
  if (line.loadText !== null && line.loadText !== '') parts.push(line.loadText);
  if (line.durationSeconds !== null) parts.push(`${String(line.durationSeconds)} с`);
  if (line.distanceMeters !== null) parts.push(`${String(line.distanceMeters)} м`);
  if (line.restSeconds !== null) parts.push(`відп. ${String(line.restSeconds)} с`);

  return parts.join(' · ');
}

export interface ExerciseRowProps {
  line: DraftExercise;
  sectionType: WorkoutType;
  index: number;
  count: number;
  onChange: (next: DraftExercise) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  dropTarget: boolean;
}

/**
 * A compact summary row that expands into the prescription grid. Which inputs
 * exist is decided by the section's type via the client rules mirror; the API
 * would accept more, never less.
 */
export function ExerciseRow({
  line,
  sectionType,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  dropTarget,
}: ExerciseRowProps) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const fields = prescriptionFieldsFor(sectionType);

  function numberField(
    label: string,
    key: 'sets' | 'reps' | 'restSeconds' | 'durationSeconds' | 'distanceMeters',
    step = 1,
  ) {
    return (
      <div>
        <label htmlFor={`${id}-${key}`} className="block text-sm font-medium text-text">
          {label}
        </label>
        <div className="mt-1.5">
          <Input
            id={`${id}-${key}`}
            type="number"
            inputMode="numeric"
            min={0}
            step={step}
            value={line[key] ?? ''}
            onChange={(event) => {
              onChange({
                ...line,
                [key]: event.target.value === '' ? null : Number(event.target.value),
              });
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <li
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={`rounded-card border bg-surface ${dropTarget ? 'border-accent' : 'border-border'}`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          draggable
          onDragStart={onDragStart}
          aria-hidden="true"
          title="Перетягніть, щоб змінити порядок"
          className="cursor-grab select-none text-text-muted"
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </span>

        <button
          type="button"
          onClick={() => {
            setExpanded((current) => !current);
          }}
          aria-expanded={expanded}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-sm font-medium text-text">{line.exerciseName}</span>
          <span className="block truncate text-xs text-text-secondary">
            {summary(line) === '' ? 'без параметрів — натисніть, щоб заповнити' : summary(line)}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Перемістити вправу «${line.exerciseName}» вгору`}
            disabled={index === 0}
            onClick={() => {
              onMove(-1);
            }}
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Перемістити вправу «${line.exerciseName}» вниз`}
            disabled={index === count - 1}
            onClick={() => {
              onMove(1);
            }}
          >
            <ArrowDown className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Прибрати вправу «${line.exerciseName}»`}
            onClick={onRemove}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="grid gap-3 border-t border-border px-3 py-3 sm:grid-cols-3">
          {fields.includes('sets') && numberField('Підходи', 'sets')}
          {fields.includes('reps') && numberField(REPS_LABELS[sectionType] ?? 'Повтори', 'reps')}
          {fields.includes('load') && (
            <LoadInput
              value={{
                loadValue: line.loadValue,
                loadUnit: line.loadUnit,
                loadText: line.loadText,
              }}
              onChange={(next) => {
                onChange({ ...line, ...next });
              }}
            />
          )}
          {fields.includes('restSeconds') && numberField('Відпочинок, с', 'restSeconds')}
          {fields.includes('tempo') && (
            <div>
              <label htmlFor={`${id}-tempo`} className="block text-sm font-medium text-text">
                Темп
              </label>
              <div className="mt-1.5">
                <Input
                  id={`${id}-tempo`}
                  type="text"
                  placeholder="3-1-1"
                  value={line.tempo ?? ''}
                  onChange={(event) => {
                    onChange({
                      ...line,
                      tempo: event.target.value === '' ? null : event.target.value,
                    });
                  }}
                />
              </div>
            </div>
          )}
          {fields.includes('durationSeconds') && numberField('Тривалість, с', 'durationSeconds')}
          {fields.includes('distanceMeters') && numberField('Дистанція, м', 'distanceMeters', 50)}
          {fields.includes('notes') && (
            <div className="sm:col-span-3">
              <label htmlFor={`${id}-notes`} className="block text-sm font-medium text-text">
                Нотатки
              </label>
              <div className="mt-1.5">
                <Textarea
                  id={`${id}-notes`}
                  rows={2}
                  value={line.notes ?? ''}
                  onChange={(event) => {
                    onChange({
                      ...line,
                      notes: event.target.value === '' ? null : event.target.value,
                    });
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
