'use client';

import { type FormEvent, useEffect, useState } from 'react';
import {
  DAY_OF_WEEK_LABELS,
  DAYS_OF_WEEK,
  WORKOUT_TYPE_LABELS,
  type DayOfWeek,
  type PublicAssignmentDetail,
  type PublicProgram,
} from '@gart/shared';

import { Button, FormField, Input, Modal, Select, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { createAssignment } from '@/lib/assignments';
import { listPrograms } from '@/lib/programs';

export interface AssignProgramModalProps {
  open: boolean;
  clientId: string;
  onClose: () => void;
  onAssigned: (assignment: PublicAssignmentDetail) => void;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Picks a template, sets the weekly schedule, assigns. The copy is called out
 * quietly under the form: the client receives a snapshot, later template edits
 * do not follow it.
 */
export function AssignProgramModal({
  open,
  clientId,
  onClose,
  onAssigned,
}: AssignProgramModalProps) {
  const { notify } = useToast();

  const [programs, setPrograms] = useState<PublicProgram[] | undefined>();
  const [programId, setProgramId] = useState('');
  const [startDate, setStartDate] = useState(todayString);
  const [endDate, setEndDate] = useState('');
  const [days, setDays] = useState<DayOfWeek[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;

    // One big page covers realistic template counts; a searchable picker can
    // replace this Select if libraries ever outgrow it.
    listPrograms(1, 100)
      .then((page) => {
        setPrograms(page.items);
      })
      .catch(() => {
        setPrograms([]);
        notify('Не вдалося завантажити програми', 'danger');
      });
  }, [open, notify]);

  function toggleDay(day: DayOfWeek): void {
    setDays((current) =>
      current.includes(day) ? current.filter((entry) => entry !== day) : [...current, day].sort(),
    );
  }

  function close(): void {
    setProgramId('');
    setStartDate(todayString());
    setEndDate('');
    setDays([]);
    setFieldErrors({});
    setFormError(undefined);
    onClose();
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();

    const errors: Record<string, string> = {};

    if (programId === '') errors.program = 'Оберіть програму';
    if (startDate === '') errors.startDate = 'Оберіть дату початку';
    if (days.length === 0) errors.days = 'Оберіть щонайменше один день';

    setFieldErrors(errors);
    setFormError(undefined);

    if (Object.keys(errors).length > 0) return;

    setPending(true);

    try {
      const assignment = await createAssignment(clientId, {
        programId,
        startDate,
        endDate: endDate === '' ? null : endDate,
        daysOfWeek: days,
      });

      notify('Програму призначено', 'success');
      onAssigned(assignment);
      close();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Не вдалося призначити програму');
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Призначити програму"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Скасувати
          </Button>
          <Button
            type="submit"
            form="assign-program-form"
            variant="primary"
            loading={pending}
            disabled={programs === undefined}
          >
            {pending ? 'Призначаємо…' : 'Призначити'}
          </Button>
        </>
      }
    >
      <form id="assign-program-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField
          label="Програма"
          error={fieldErrors.program === '' ? undefined : fieldErrors.program}
        >
          {(props) => (
            <Select
              {...props}
              value={programId}
              onChange={(event) => {
                setProgramId(event.target.value);
              }}
              disabled={pending || programs === undefined}
              options={[
                {
                  value: '',
                  label: programs === undefined ? 'Завантаження…' : 'Оберіть програму…',
                },
                ...(programs ?? []).map((program) => ({
                  value: program.id,
                  label: `${program.name} · ${WORKOUT_TYPE_LABELS[program.type]}`,
                })),
              ]}
            />
          )}
        </FormField>

        {programs !== undefined && programs.length === 0 && (
          <p className="text-sm text-text-secondary">
            У вас ще немає програм — створіть першу в розділі «Тренування».
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Початок"
            error={fieldErrors.startDate === '' ? undefined : fieldErrors.startDate}
          >
            {(props) => (
              <Input
                {...props}
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                }}
                disabled={pending}
              />
            )}
          </FormField>

          <FormField label="Завершення" hint="Необов'язково — без дати програма безстрокова.">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                }}
                disabled={pending}
              />
            )}
          </FormField>
        </div>

        <fieldset disabled={pending}>
          <legend className="block text-sm font-medium text-text">Дні тижня</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DAYS_OF_WEEK.map((day) => {
              const checked = days.includes(day);

              return (
                <label key={day} className={pending ? 'cursor-not-allowed' : 'cursor-pointer'}>
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={checked}
                    onChange={() => {
                      toggleDay(day);
                    }}
                  />
                  <span
                    className={`inline-flex min-w-11 items-center justify-center rounded-full border px-2.5 py-1.5 text-sm font-medium transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
                      checked
                        ? 'border-accent/40 bg-accent-subtle text-accent'
                        : 'border-border-strong text-text-secondary hover:border-text-muted hover:text-text'
                    }`}
                  >
                    {DAY_OF_WEEK_LABELS[day]}
                  </span>
                </label>
              );
            })}
          </div>
          {fieldErrors.days !== undefined && fieldErrors.days !== '' && (
            <p className="mt-1.5 text-xs text-danger">{fieldErrors.days}</p>
          )}
        </fieldset>

        {formError !== undefined && (
          <p
            role="alert"
            className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger-text"
          >
            {formError}
          </p>
        )}

        <p className="text-xs text-text-secondary">
          Клієнт отримає копію програми — подальші зміни шаблону не вплинуть на це призначення.
        </p>
      </form>
    </Modal>
  );
}
