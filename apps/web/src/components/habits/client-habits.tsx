'use client';

import { useEffect, useState } from 'react';
import { HABIT_SUGGESTIONS, type HabitKind, type HabitStatus, type HabitsView } from '@gart/shared';

import { Button, FormField, Input, Modal, Select, Spinner, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { localDateString } from '@/lib/dates';
import { createHabit, deleteHabit, getClientHabits } from '@/lib/habits';
import { HabitStrip, StreakLabel } from './habit-strip';

/**
 * «Звички» on the trainer's client page. The trainer defines and observes;
 * recording a day is the client's own act, so there is no write path here.
 */
export function ClientHabits({ clientId }: { clientId: string }) {
  const { notify } = useToast();

  const [view, setView] = useState<HabitsView | undefined>();
  const [adding, setAdding] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    getClientHabits(clientId, localDateString(new Date()))
      .then((loaded) => {
        if (active) setView(loaded);
      })
      .catch(() => {
        notify('Не вдалося завантажити звички', 'danger');
      });

    return () => {
      active = false;
    };
  }, [clientId, reloadKey, notify]);

  function reload(): void {
    setReloadKey((key) => key + 1);
  }

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-text">Звички</h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setAdding(true);
          }}
        >
          Додати звичку
        </Button>
      </div>

      {view === undefined ? (
        <div className="flex justify-center py-8">
          <Spinner size="md" label="Завантаження звичок" />
        </div>
      ) : view.habits.length === 0 ? (
        <p className="mt-3 rounded-card border border-dashed border-border-strong bg-surface px-4 py-6 text-center text-sm text-text-secondary">
          Ще немає звичок. Додайте те, що клієнт має робити щодня.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {view.habits.map((habit) => (
            <li key={habit.id}>
              <HabitRow
                habit={habit}
                onRemoved={reload}
                onError={(message) => {
                  notify(message, 'danger');
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <AddHabitModal
        open={adding}
        clientId={clientId}
        onClose={() => {
          setAdding(false);
        }}
        onCreated={() => {
          setAdding(false);
          reload();
        }}
      />
    </section>
  );
}

function HabitRow({
  habit,
  onRemoved,
  onError,
}: {
  habit: HabitStatus;
  onRemoved: () => void;
  onError: (message: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">
          {habit.name}
          {habit.kind === 'AMOUNT' && (
            <span className="ml-2 text-text-secondary">
              ціль: {habit.targetValue} {habit.unit}
            </span>
          )}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-3">
          <StreakLabel streak={habit.currentStreak} longest={habit.longestStreak} />
          {habit.longestStreak > 0 && habit.currentStreak > 0 && (
            <span className="text-xs text-text-secondary">найдовша: {habit.longestStreak}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <HabitStrip days={habit.recentDays} />
        <button
          type="button"
          onClick={() =>
            void deleteHabit(habit.id)
              .then(onRemoved)
              .catch(() => {
                onError('Не вдалося видалити звичку');
              })
          }
          className="min-h-11 text-xs text-text-secondary hover:text-danger"
        >
          Видалити
        </button>
      </div>
    </div>
  );
}

function AddHabitModal({
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
  const [kind, setKind] = useState<HabitKind>('CHECK');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(): Promise<void> {
    setPending(true);

    try {
      // A checkbox habit carries no target or unit at all — the API refuses
      // the incoherent combination, so the form never sends one.
      await createHabit(
        clientId,
        kind === 'CHECK'
          ? { name, kind }
          : { name, kind, targetValue: Number(target.replace(',', '.')), unit },
      );
      setName('');
      setTarget('');
      setUnit('');
      setKind('CHECK');
      onCreated();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Не вдалося додати звичку', 'danger');
    } finally {
      setPending(false);
    }
  }

  const incomplete = name.trim() === '' || (kind === 'AMOUNT' && (target === '' || unit === ''));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Нова звичка"
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Скасувати
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={incomplete}
            onClick={() => void submit()}
          >
            Додати
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {HABIT_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.name}
              type="button"
              onClick={() => {
                setName(suggestion.name);
                setKind(suggestion.kind);
                setTarget(suggestion.kind === 'AMOUNT' ? String(suggestion.targetValue) : '');
                setUnit(suggestion.unit ?? '');
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

        <FormField label="Тип">
          {(field) => (
            <Select
              {...field}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as HabitKind);
              }}
              options={[
                { value: 'CHECK', label: 'Так або ні' },
                { value: 'AMOUNT', label: 'Із ціллю' },
              ]}
            />
          )}
        </FormField>

        {kind === 'AMOUNT' && (
          <div className="flex gap-3">
            <div className="flex-1">
              <FormField label="Ціль">
                {(field) => (
                  <Input
                    {...field}
                    inputMode="decimal"
                    value={target}
                    onChange={(event) => {
                      setTarget(event.target.value);
                    }}
                  />
                )}
              </FormField>
            </div>
            <div className="flex-1">
              <FormField label="Одиниця">
                {(field) => (
                  <Input
                    {...field}
                    placeholder="склянок, кроків"
                    value={unit}
                    onChange={(event) => {
                      setUnit(event.target.value);
                    }}
                  />
                )}
              </FormField>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
