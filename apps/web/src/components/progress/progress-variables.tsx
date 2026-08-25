'use client';

import { useState } from 'react';
import { PROGRESS_SUGGESTIONS, type ProgressSeries } from '@gart/shared';

import { Button, FormField, Input, Modal, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { localDateString } from '@/lib/dates';
import {
  createProgressVariable,
  deleteProgressVariable,
  saveMyProgressEntry,
  saveProgressEntry,
} from '@/lib/progress';
import { LineChart } from './line-chart';

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
 * A chart per tracked dimension, with the measurement entry beside it. The
 * trainer manages the dimensions; a client sees the same charts and may record
 * only the ones opened to them.
 */
export function ProgressVariables({
  clientId,
  variables,
  mode,
  onChanged,
}: {
  clientId: string;
  variables: ProgressSeries[];
  mode: 'trainer' | 'client';
  onChanged: () => void;
}) {
  const { notify } = useToast();
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-bold tracking-[-0.03em] text-text">Показники</h3>
        {mode === 'trainer' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setAdding(true);
            }}
          >
            Додати показник
          </Button>
        )}
      </div>

      {variables.length === 0 ? (
        <p className="mt-2 text-sm text-text-secondary">
          {mode === 'trainer'
            ? 'Ще немає показників. Додайте те, що ви відстежуєте для цього клієнта.'
            : 'Ваш тренер ще не додав показників.'}
        </p>
      ) : (
        <ul className="mt-2 space-y-4">
          {variables.map((variable) => (
            <li
              key={variable.id}
              className="rounded-card border border-border bg-surface px-4 py-4 shadow-e1 sm:p-5"
            >
              <VariableCard
                variable={variable}
                mode={mode}
                onChanged={onChanged}
                onError={(message) => {
                  notify(message, 'danger');
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {mode === 'trainer' && (
        <AddVariableModal
          open={adding}
          clientId={clientId}
          onClose={() => {
            setAdding(false);
          }}
          onCreated={() => {
            setAdding(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function VariableCard({
  variable,
  mode,
  onChanged,
  onError,
}: {
  variable: ProgressSeries;
  mode: 'trainer' | 'client';
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [value, setValue] = useState('');
  const [date, setDate] = useState(() => localDateString(new Date()));
  const [pending, setPending] = useState(false);

  const canRecord = mode === 'trainer' || variable.selfLog;
  const latest = variable.points[variable.points.length - 1];

  async function save(): Promise<void> {
    const parsed = toNumber(value);

    if (parsed === null) {
      onError('Введіть число');
      return;
    }

    setPending(true);

    try {
      const write = mode === 'trainer' ? saveProgressEntry : saveMyProgressEntry;

      await write(variable.id, date, { value: parsed });
      setValue('');
      onChanged();
    } catch (error) {
      onError(error instanceof ApiError ? error.message : 'Не вдалося зберегти замір');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-base font-bold text-text">
          {variable.name}
          <span className="ml-2 text-sm text-text-secondary">{variable.unit}</span>
        </h4>

        <div className="flex items-center gap-3">
          {latest !== undefined && (
            <span className="text-sm text-text-secondary">
              Останній: {String(latest.value).replace('.', ',')} {variable.unit}
            </span>
          )}
          {mode === 'trainer' && (
            <button
              type="button"
              onClick={() =>
                void deleteProgressVariable(variable.id)
                  .then(onChanged)
                  .catch(() => {
                    onError('Не вдалося видалити показник');
                  })
              }
              className="min-h-11 text-xs text-text-secondary hover:text-danger"
            >
              Видалити
            </button>
          )}
        </div>
      </div>

      <LineChart title={variable.name} unit={variable.unit} points={variable.points} />

      {canRecord && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex-1 text-xs text-text-secondary">
            Дата
            <Input
              type="date"
              aria-label={`Дата заміру: ${variable.name}`}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
              }}
            />
          </label>
          <label className="flex-1 text-xs text-text-secondary">
            Значення, {variable.unit}
            <Input
              type="text"
              inputMode="decimal"
              aria-label={`Значення: ${variable.name}`}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
              }}
            />
          </label>
          <Button variant="primary" size="sm" loading={pending} onClick={() => void save()}>
            Зберегти
          </Button>
        </div>
      )}
    </>
  );
}

function AddVariableModal({
  open,
  clientId,
  onClose,
  onCreated,
}: {
  open: boolean;
  clientId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [selfLog, setSelfLog] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(): Promise<void> {
    setPending(true);

    try {
      await createProgressVariable(clientId, { name, unit, selfLog });
      setName('');
      setUnit('');
      setSelfLog(false);
      onCreated();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Не вдалося додати показник', 'danger');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новий показник"
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Скасувати
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={name.trim() === '' || unit.trim() === ''}
            onClick={() => void submit()}
          >
            Додати
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {PROGRESS_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.name}
              type="button"
              onClick={() => {
                setName(suggestion.name);
                setUnit(suggestion.unit);
              }}
              className="min-h-11 rounded-control border border-border-strong px-3 text-sm text-text-secondary hover:bg-bg-subtle hover:text-text"
            >
              {suggestion.name}
            </button>
          ))}
        </div>

        <FormField label="Назва">
          {(field) => (
            <Input
              {...field}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          )}
        </FormField>

        <FormField label="Одиниця">
          {(field) => (
            <Input
              {...field}
              placeholder="кг, см, %"
              value={unit}
              onChange={(event) => {
                setUnit(event.target.value);
              }}
            />
          )}
        </FormField>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={selfLog}
            onChange={(event) => {
              setSelfLog(event.target.checked);
            }}
          />
          Клієнт може вносити цей показник сам
        </label>
      </div>
    </Modal>
  );
}
