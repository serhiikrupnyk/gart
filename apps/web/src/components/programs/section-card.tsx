'use client';

import { useId } from 'react';
import { WORKOUT_TYPE_LABELS, WORKOUT_TYPES, type WorkoutType } from '@gart/shared';

import { Button, Input, Select } from '@/components/ui';
import {
  moveItem,
  retypeSection,
  type DraftExercise,
  type DraftSection,
} from '@/lib/program-draft';
import { reorderByUid } from '@/lib/program-draft';
import { sectionConfigFor } from '@/lib/program-rules';
import { ExerciseRow } from './exercise-row';

export interface SectionDragState {
  kind: 'section' | 'exercise';
  uid: string;
  sectionUid?: string;
}

export interface SectionCardProps {
  section: DraftSection;
  index: number;
  count: number;
  error?: string | undefined;
  onChange: (next: DraftSection) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onAddExercise: () => void;
  announce: (message: string) => void;
  drag: SectionDragState | undefined;
  setDrag: (drag: SectionDragState | undefined) => void;
  dropTarget: string | undefined;
  setDropTarget: (uid: string | undefined) => void;
  onSectionDrop: () => void;
}

export function SectionCard({
  section,
  index,
  count,
  error,
  onChange,
  onMove,
  onRemove,
  onAddExercise,
  announce,
  drag,
  setDrag,
  dropTarget,
  setDropTarget,
  onSectionDrop,
}: SectionCardProps) {
  const id = useId();
  const config = sectionConfigFor(section.type);
  const title = section.name === '' ? `Секція ${String(index + 1)}` : section.name;

  function updateExercise(uid: string, next: DraftExercise): void {
    onChange({
      ...section,
      exercises: section.exercises.map((line) => (line.uid === uid ? next : line)),
    });
  }

  function moveExercise(lineIndex: number, direction: -1 | 1): void {
    onChange({ ...section, exercises: moveItem(section.exercises, lineIndex, direction) });
    announce(direction === -1 ? 'Вправу переміщено вгору' : 'Вправу переміщено вниз');
  }

  function dropExerciseOn(targetUid: string): void {
    if (drag?.kind !== 'exercise' || drag.sectionUid !== section.uid) return;

    onChange({ ...section, exercises: reorderByUid(section.exercises, drag.uid, targetUid) });
    announce('Порядок вправ змінено');
    setDrag(undefined);
    setDropTarget(undefined);
  }

  return (
    <li
      onDragOver={(event) => {
        if (drag?.kind === 'section') {
          event.preventDefault();
          setDropTarget(section.uid);
        }
      }}
      onDrop={(event) => {
        if (drag?.kind === 'section') {
          event.preventDefault();
          onSectionDrop();
        }
      }}
      className={`rounded-card border bg-surface p-4 ${
        dropTarget === section.uid && drag?.kind === 'section' ? 'border-accent' : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-end gap-2">
        <span
          draggable
          onDragStart={() => {
            setDrag({ kind: 'section', uid: section.uid });
          }}
          aria-hidden="true"
          title="Перетягніть, щоб змінити порядок"
          className="cursor-grab select-none pb-2 text-text-muted"
        >
          ⋮⋮
        </span>

        <div className="min-w-0 flex-1 basis-48">
          <label htmlFor={`${id}-name`} className="block text-sm font-medium text-text">
            Назва секції
          </label>
          <div className="mt-1.5">
            <Input
              id={`${id}-name`}
              type="text"
              placeholder={`Секція ${String(index + 1)}`}
              value={section.name}
              onChange={(event) => {
                onChange({ ...section, name: event.target.value });
              }}
            />
          </div>
        </div>

        <div className="w-40">
          <label htmlFor={`${id}-type`} className="block text-sm font-medium text-text">
            Тип секції
          </label>
          <div className="mt-1.5">
            <Select
              id={`${id}-type`}
              value={section.type}
              onChange={(event) => {
                onChange(retypeSection(section, event.target.value as WorkoutType));
              }}
              options={WORKOUT_TYPES.map((type) => ({
                value: type,
                label: WORKOUT_TYPE_LABELS[type],
              }))}
            />
          </div>
        </div>

        <div className="flex items-center gap-0.5 pb-0.5">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Перемістити секцію «${title}» вгору`}
            disabled={index === 0}
            onClick={() => {
              onMove(-1);
            }}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Перемістити секцію «${title}» вниз`}
            disabled={index === count - 1}
            onClick={() => {
              onMove(1);
            }}
          >
            ↓
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Видалити секцію «${title}»`}
            onClick={onRemove}
          >
            ✕
          </Button>
        </div>
      </div>

      {config.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {config.map((spec) => (
            <div key={spec.field} className="w-44">
              <label
                htmlFor={`${id}-${spec.field}`}
                className="block text-sm font-medium text-text"
              >
                {spec.label}
                {spec.required && (
                  <span aria-hidden="true" className="text-danger">
                    {' '}
                    *
                  </span>
                )}
              </label>
              <div className="mt-1.5">
                <Input
                  id={`${id}-${spec.field}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={section[spec.field] ?? ''}
                  onChange={(event) => {
                    onChange({
                      ...section,
                      [spec.field]: event.target.value === '' ? null : Number(event.target.value),
                    });
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {error !== undefined && (
        <p role="alert" className="mt-3 rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {section.exercises.map((line, lineIndex) => (
          <ExerciseRow
            key={line.uid}
            line={line}
            sectionType={section.type}
            index={lineIndex}
            count={section.exercises.length}
            onChange={(next) => {
              updateExercise(line.uid, next);
            }}
            onMove={(direction) => {
              moveExercise(lineIndex, direction);
            }}
            onRemove={() => {
              onChange({
                ...section,
                exercises: section.exercises.filter((entry) => entry.uid !== line.uid),
              });
            }}
            onDragStart={() => {
              setDrag({ kind: 'exercise', uid: line.uid, sectionUid: section.uid });
            }}
            onDragOver={() => {
              if (drag?.kind === 'exercise' && drag.sectionUid === section.uid) {
                setDropTarget(line.uid);
              }
            }}
            onDrop={() => {
              dropExerciseOn(line.uid);
            }}
            dropTarget={dropTarget === line.uid && drag?.kind === 'exercise'}
          />
        ))}
      </ul>

      <div className="mt-3">
        <Button variant="secondary" size="sm" onClick={onAddExercise}>
          + Додати вправу
        </Button>
      </div>
    </li>
  );
}
