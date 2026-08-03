'use client';

import { useState } from 'react';
import type { ClientWorkoutExercise, ClientWorkoutLog, ClientWorkoutSetLog } from '@gart/shared';

import { Badge, Button, Input, Textarea, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { emptySet, hasDimensions, logDimensions, prefillSets } from '@/lib/log-draft';
import { actualLine } from '@/lib/workout-format';
import { deleteWorkoutLog, saveWorkoutLog } from '@/lib/workout-logs';

interface DraftSet {
  reps: string;
  loadKg: string;
  durationSeconds: string;
  distanceMeters: string;
}

function toDraft(set: ClientWorkoutSetLog): DraftSet {
  return {
    reps: set.reps === null ? '' : String(set.reps),
    loadKg: set.loadKg === null ? '' : String(set.loadKg).replace('.', ','),
    durationSeconds: set.durationSeconds === null ? '' : String(set.durationSeconds),
    distanceMeters: set.distanceMeters === null ? '' : String(set.distanceMeters),
  };
}

/** Ukrainian keyboards type a decimal comma; the wire wants a dot. */
function toNumber(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');

  if (trimmed === '') {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

function fromDraft(draft: DraftSet): ClientWorkoutSetLog {
  return {
    reps: toNumber(draft.reps),
    loadKg: toNumber(draft.loadKg),
    durationSeconds: toNumber(draft.durationSeconds),
    distanceMeters: toNumber(draft.distanceMeters),
  };
}

/**
 * The logging affordance on an exercise card. The common case — did exactly
 * what was prescribed — is one tap: «Виконано» writes the prescription's own
 * numbers as the actuals. Everything else is behind that, so nothing has to be
 * typed mid-set unless something actually differed.
 */
export function ExerciseLog({
  line,
  date,
  canLog,
  onLogged,
}: {
  line: ClientWorkoutExercise;
  date: string;
  canLog: boolean;
  onLogged: (log: ClientWorkoutLog | null) => void;
}) {
  const { notify } = useToast();
  const log = line.log;

  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [rows, setRows] = useState<DraftSet[]>([]);
  const [notes, setNotes] = useState('');

  const dimensions = logDimensions(line);
  const showSets = hasDimensions(dimensions);

  async function submit(completed: boolean, sets: ClientWorkoutSetLog[]): Promise<void> {
    setPending(true);

    try {
      const saved = await saveWorkoutLog(line.id, date, {
        completed,
        notes: notes.trim() === '' ? null : notes.trim(),
        sets,
      });
      onLogged(saved);
      setEditing(false);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Не вдалося зберегти', 'danger');
    } finally {
      setPending(false);
    }
  }

  async function clear(): Promise<void> {
    setPending(true);

    try {
      await deleteWorkoutLog(line.id, date);
      onLogged(null);
      setEditing(false);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Не вдалося скасувати', 'danger');
    } finally {
      setPending(false);
    }
  }

  function openEditor(): void {
    // Editing an existing record starts from what was recorded, not from the
    // prescription — the client is correcting their own numbers.
    const source = log === null || log.sets.length === 0 ? prefillSets(line) : log.sets;

    setRows(source.map(toDraft));
    setNotes(log?.notes ?? '');
    setEditing(true);
  }

  if (!canLog) {
    return log === null ? null : <LoggedSummary log={log} />;
  }

  if (editing) {
    return (
      <div className="mt-3 border-t border-border pt-3">
        {showSets && (
          <ul className="space-y-2">
            {rows.map((row, index) => (
              // Rows have no identity of their own; position is the order.
              <li key={index} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-xs text-text-secondary">{index + 1}</span>

                {dimensions.reps && (
                  <SetInput
                    label={`Підхід ${String(index + 1)}, повторення`}
                    suffix="повт."
                    value={row.reps}
                    onChange={(value) => {
                      updateRow(setRows, index, { reps: value });
                    }}
                  />
                )}
                {dimensions.duration && (
                  <SetInput
                    label={`Підхід ${String(index + 1)}, секунди`}
                    suffix="с"
                    value={row.durationSeconds}
                    onChange={(value) => {
                      updateRow(setRows, index, { durationSeconds: value });
                    }}
                  />
                )}
                {dimensions.distance && (
                  <SetInput
                    label={`Підхід ${String(index + 1)}, метри`}
                    suffix="м"
                    value={row.distanceMeters}
                    onChange={(value) => {
                      updateRow(setRows, index, { distanceMeters: value });
                    }}
                  />
                )}
                {dimensions.load && (
                  <SetInput
                    label={`Підхід ${String(index + 1)}, вага в кілограмах`}
                    suffix="кг"
                    value={row.loadKg}
                    onChange={(value) => {
                      updateRow(setRows, index, { loadKg: value });
                    }}
                  />
                )}

                <button
                  type="button"
                  aria-label={`Прибрати підхід ${String(index + 1)}`}
                  onClick={() => {
                    setRows((current) => current.filter((_, position) => position !== index));
                  }}
                  className="min-h-11 shrink-0 px-2 text-text-secondary hover:text-danger"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {showSets && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRows((current) => [...current, toDraft(emptySet())]);
            }}
          >
            + Підхід
          </Button>
        )}

        <div className="mt-2">
          <Textarea
            rows={2}
            aria-label="Нотатки до вправи"
            placeholder="Як пройшло? (необов'язково)"
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="primary"
            loading={pending}
            onClick={() => void submit(true, rows.map(fromDraft))}
          >
            Зберегти
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => void submit(false, [])}>
            Пропустив
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setEditing(false);
            }}
          >
            Скасувати
          </Button>
        </div>
      </div>
    );
  }

  if (log !== null) {
    return (
      <div className="mt-3 border-t border-border pt-3">
        <LoggedSummary log={log} />

        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={openEditor}>
            Змінити
          </Button>
          <Button variant="ghost" size="sm" loading={pending} onClick={() => void clear()}>
            Скасувати запис
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
      <Button
        variant="primary"
        loading={pending}
        onClick={() => void submit(true, prefillSets(line))}
      >
        Виконано
      </Button>
      <Button variant="secondary" disabled={pending} onClick={openEditor}>
        Записати інакше
      </Button>
    </div>
  );
}

function LoggedSummary({ log }: { log: ClientWorkoutLog }) {
  const actual = actualLine(log.sets);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={log.completed ? 'success' : 'neutral'}>
          {log.completed ? 'Виконано' : 'Пропущено'}
        </Badge>
        {actual !== '' && <span className="text-sm font-medium text-text">Факт: {actual}</span>}
      </div>
      {log.notes !== null && <p className="mt-1 text-sm text-text-secondary">{log.notes}</p>}
    </div>
  );
}

function SetInput({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <Input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <span className="shrink-0 text-xs text-text-secondary">{suffix}</span>
    </span>
  );
}

/** Row edits are positional; the setter keeps that in one place. */
function updateRow(
  setRows: (updater: (current: DraftSet[]) => DraftSet[]) => void,
  index: number,
  patch: Partial<DraftSet>,
): void {
  setRows((current) =>
    current.map((row, position) => (position === index ? { ...row, ...patch } : row)),
  );
}
