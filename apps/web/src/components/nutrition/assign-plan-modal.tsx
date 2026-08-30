'use client';

import { type FormEvent, useEffect, useState } from 'react';
import {
  DAY_OF_WEEK_LABELS,
  DAYS_OF_WEEK,
  type ClientListItem,
  type DayOfWeek,
  type PublicMealPlan,
} from '@gart/shared';

import { Button, FormError, FormField, Input, Modal, Select } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { listClients } from '@/lib/clients';
import { assignPlan } from '@/lib/meals';
import { cx } from '@/lib/cx';
import { localDateString } from '@/lib/dates';

/**
 * Giving a plan to a client.
 *
 * The schedule lives HERE and not on the plan, because a plan is one day —
 * exactly as a Program is one workout and its assignment says when it runs.
 */
export function AssignPlanModal({
  open,
  plan,
  onClose,
  onAssigned,
}: {
  open: boolean;
  plan: PublicMealPlan;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [clientId, setClientId] = useState('');
  const [startDate, setStartDate] = useState(localDateString(new Date()));
  const [endDate, setEndDate] = useState('');
  const [days, setDays] = useState<DayOfWeek[]>([...DAYS_OF_WEEK]);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;

    listClients()
      .then((loaded) => {
        if (!active) return;
        const usable = loaded.filter((client) => client.status !== 'ARCHIVED');
        setClients(usable);
        setClientId(usable[0]?.id ?? '');
      })
      .catch(() => {
        if (active) setClients([]);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(undefined);
    setPending(true);

    try {
      await assignPlan({
        planId: plan.id,
        clientId,
        startDate,
        endDate: endDate === '' ? null : endDate,
        daysOfWeek: days,
      });
      onAssigned();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Не вдалося надати план');
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Надати «${plan.name}»`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Скасувати
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="assign-plan-form"
            loading={pending}
            disabled={clients.length === 0 || days.length === 0}
          >
            Надати
          </Button>
        </>
      }
    >
      {clients.length === 0 ? (
        <p className="mt-5 text-sm leading-relaxed text-text-secondary">
          Спершу додайте клієнта — план нема кому надати.
        </p>
      ) : (
        <form id="assign-plan-form" onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
          <div>
            <label htmlFor="assign-client" className="mb-1.5 block text-sm font-semibold text-text">
              Клієнт
            </label>
            <Select
              id="assign-client"
              options={clients.map((client) => ({ value: client.id, label: client.fullName }))}
              value={clientId}
              disabled={pending}
              onChange={(event) => {
                setClientId(event.target.value);
              }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Початок">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={startDate}
                  disabled={pending}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                  }}
                />
              )}
            </FormField>
            <FormField label="Завершення" hint="Порожньо — без обмеження.">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={endDate}
                  disabled={pending}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                  }}
                />
              )}
            </FormField>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-text">Дні тижня</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS_OF_WEEK.map((day) => {
                const chosen = days.includes(day);

                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={chosen}
                    disabled={pending}
                    onClick={() => {
                      setDays((current) =>
                        current.includes(day)
                          ? current.filter((value) => value !== day)
                          : [...current, day].sort((left, right) => left - right),
                      );
                    }}
                    className={cx(
                      'min-h-9 cursor-pointer rounded-control border px-3 text-sm font-semibold transition-colors',
                      chosen
                        ? 'border-accent/40 bg-accent-subtle text-accent-text'
                        : 'border-border bg-surface text-text-secondary hover:bg-bg-subtle',
                    )}
                  >
                    {DAY_OF_WEEK_LABELS[day]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {error !== undefined && <FormError>{error}</FormError>}
        </form>
      )}
    </Modal>
  );
}
