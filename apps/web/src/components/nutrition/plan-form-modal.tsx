'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  compareToTarget,
  MAX_SLOTS_PER_PLAN,
  MEAL_SLOT_LABELS,
  MEAL_SLOTS,
  multiplyNutrients,
  PLAN_NAME_MAX_LENGTH,
  SLOT_NAME_MAX_LENGTH,
  sumNutrients,
  zeroNutrients,
  type CreateMealPlanRequest,
  type MealSlot,
  type Nutrients,
  type PublicMeal,
  type PublicMealPlan,
} from '@gart/shared';

import { TargetReport } from '@/components/nutrition/nutrient-summary';
import { PICKER_PAGE_SIZE, withSelected } from '@/components/nutrition/picker';
import { Button, FormError, FormField, Input, Modal, Select, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { createPlan, listMeals, updatePlan } from '@/lib/meals';
import { useDebouncedValue } from '@/lib/use-debounced-value';

interface SlotDraft {
  slot: MealSlot;
  name: string;
  mealId: string;
  servings: string;
}

const SLOT_OPTIONS = MEAL_SLOTS.map((slot) => ({ value: slot, label: MEAL_SLOT_LABELS[slot] }));
const TARGET_FIELDS = [
  ['kcal', 'Ккал'],
  ['protein', 'Білки, г'],
  ['fat', 'Жири, г'],
  ['carbs', 'Вуглеводи, г'],
] as const;

/**
 * Build a day of eating from meals.
 *
 * The plan-versus-target panel updates as the trainer composes, through the
 * same shared helpers the server uses. It is subtraction on the trainer's own
 * numbers — Gart computes no energy requirement and names no formula it has not
 * earned the right to name.
 */
export function PlanFormModal({
  open,
  plan,
  onClose,
  onSaved,
}: {
  open: boolean;
  plan?: PublicMealPlan;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(plan?.name ?? '');
  const [targets, setTargets] = useState({
    kcal: plan?.targets.kcal ?? '',
    protein: plan?.targets.protein ?? '',
    fat: plan?.targets.fat ?? '',
    carbs: plan?.targets.carbs ?? '',
  });
  const [slots, setSlots] = useState<SlotDraft[]>(
    plan?.slots.map((entry) => ({
      slot: entry.slot,
      name: entry.name ?? '',
      mealId: entry.meal.id,
      servings: entry.servings,
    })) ?? [],
  );
  const [meals, setMeals] = useState<PublicMeal[]>();
  const [mealSearch, setMealSearch] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const { notify } = useToast();
  const debouncedMealSearch = useDebouncedValue(mealSearch, 300);

  useEffect(() => {
    let active = true;

    listMeals(1, debouncedMealSearch, PICKER_PAGE_SIZE)
      .then((page) => {
        if (active) setMeals(page.items);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setMeals([]);
        notify(
          caught instanceof ApiError ? caught.message : 'Не вдалося завантажити страви',
          'danger',
        );
      });

    return () => {
      active = false;
    };
  }, [debouncedMealSearch, notify]);

  const loaded = meals ?? [];
  const mealOptions = withSelected(
    loaded.map((meal) => ({ value: meal.id, label: meal.name })),
    (plan?.slots ?? []).map((entry) => ({ value: entry.meal.id, label: entry.meal.name })),
  );

  /**
   * The day so far, or null when any slot will not resolve.
   *
   * Falling back to zeros here was the worst of both: a plan whose meals were
   * outside the loaded set reported 0 kcal against a real target and rendered
   * a large deficit in green. Nothing is better than a confident wrong number.
   */
  const planned: Nutrients | null = (() => {
    if (slots.length === 0) {
      return zeroNutrients();
    }

    const lines: Nutrients[] = [];

    for (const entry of slots) {
      const meal = loaded.find((candidate) => candidate.id === entry.mealId);
      const line = meal === undefined ? null : multiplyNutrients(meal.nutrients, entry.servings);

      if (line === null) {
        return null;
      }

      lines.push(line);
    }

    return sumNutrients(lines);
  })();

  const report =
    planned === null
      ? null
      : {
          kcal: compareToTarget(planned.kcal, targets.kcal === '' ? null : targets.kcal),
          protein: compareToTarget(
            planned.protein,
            targets.protein === '' ? null : targets.protein,
          ),
          fat: compareToTarget(planned.fat, targets.fat === '' ? null : targets.fat),
          carbs: compareToTarget(planned.carbs, targets.carbs === '' ? null : targets.carbs),
        };

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(undefined);
    setPending(true);

    const body: CreateMealPlanRequest = {
      name: name.trim(),
      targets: {
        kcal: targets.kcal.trim() === '' ? null : targets.kcal.trim(),
        protein: targets.protein.trim() === '' ? null : targets.protein.trim(),
        fat: targets.fat.trim() === '' ? null : targets.fat.trim(),
        carbs: targets.carbs.trim() === '' ? null : targets.carbs.trim(),
      },
      slots: slots.map((entry) => ({
        slot: entry.slot,
        name: entry.name.trim() === '' ? null : entry.name.trim(),
        mealId: entry.mealId,
        servings: entry.servings.trim().replace(/,/g, '.'),
      })),
    };

    try {
      if (plan === undefined) {
        await createPlan(body);
      } else {
        await updatePlan(plan.id, body);
      }
      onSaved();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Не вдалося зберегти план');
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={plan === undefined ? 'Новий план' : 'Редагувати план'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Скасувати
          </Button>
          <Button variant="primary" type="submit" form="plan-form" loading={pending}>
            Зберегти
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={handleSubmit} noValidate className="mt-5 space-y-5">
        <FormField label="Назва">
          {(props) => (
            <Input
              {...props}
              value={name}
              maxLength={PLAN_NAME_MAX_LENGTH}
              onChange={(event) => {
                setName(event.target.value);
              }}
              disabled={pending}
            />
          )}
        </FormField>

        <fieldset>
          <legend className="text-sm font-bold text-text">Прийоми їжі</legend>

          <div className="mt-2">
            <label className="sr-only" htmlFor="plan-meal-search">
              Пошук страви
            </label>
            <Input
              id="plan-meal-search"
              value={mealSearch}
              placeholder="Пошук страви…"
              disabled={pending}
              onChange={(event) => {
                setMealSearch(event.target.value);
              }}
            />
          </div>

          <div className="mt-3 space-y-2">
            {slots.map((entry, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2">
                <div className="w-32 shrink-0">
                  <label className="sr-only" htmlFor={`slot-kind-${String(index)}`}>
                    Прийом їжі
                  </label>
                  <Select
                    id={`slot-kind-${String(index)}`}
                    options={SLOT_OPTIONS}
                    value={entry.slot}
                    disabled={pending}
                    onChange={(event) => {
                      const value = event.target.value as MealSlot;
                      setSlots((current) =>
                        current.map((row, at) => (at === index ? { ...row, slot: value } : row)),
                      );
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`slot-meal-${String(index)}`}>
                    Страва
                  </label>
                  <Select
                    id={`slot-meal-${String(index)}`}
                    options={mealOptions}
                    value={entry.mealId}
                    disabled={pending}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSlots((current) =>
                        current.map((row, at) => (at === index ? { ...row, mealId: value } : row)),
                      );
                    }}
                  />
                </div>
                <div className="w-32 shrink-0">
                  <label className="sr-only" htmlFor={`slot-name-${String(index)}`}>
                    Своя назва
                  </label>
                  <Input
                    id={`slot-name-${String(index)}`}
                    value={entry.name}
                    placeholder="Своя назва"
                    maxLength={SLOT_NAME_MAX_LENGTH}
                    disabled={pending}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSlots((current) =>
                        current.map((row, at) => (at === index ? { ...row, name: value } : row)),
                      );
                    }}
                  />
                </div>
                <div className="w-24 shrink-0">
                  <label className="sr-only" htmlFor={`slot-servings-${String(index)}`}>
                    Порції
                  </label>
                  <Input
                    id={`slot-servings-${String(index)}`}
                    inputMode="decimal"
                    value={entry.servings}
                    disabled={pending}
                    onChange={(event) => {
                      const value = event.target.value.replace(/,/g, '.');
                      setSlots((current) =>
                        current.map((row, at) =>
                          at === index ? { ...row, servings: value } : row,
                        ),
                      );
                    }}
                  />
                </div>
                <Button
                  variant="ghost"
                  aria-label="Прибрати прийом їжі"
                  disabled={pending}
                  onClick={() => {
                    setSlots((current) => current.filter((_, at) => at !== index));
                  }}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>

          {meals !== undefined && loaded.length === 0 && (
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              {mealSearch === ''
                ? 'Страв ще немає — складіть першу на вкладці «Страви».'
                : 'За цим запитом нічого не знайдено.'}
            </p>
          )}

          {slots.length < MAX_SLOTS_PER_PLAN && loaded.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => {
                setSlots((current) => [
                  ...current,
                  { slot: 'BREAKFAST', name: '', mealId: loaded[0]?.id ?? '', servings: '1' },
                ]);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Додати прийом їжі
            </Button>
          )}
        </fieldset>

        <fieldset>
          <legend className="text-sm font-bold text-text">Цілі на день</legend>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            Ваші власні числа. Gart нічого не розраховує за вас — порожньо означає «без цілі».
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {TARGET_FIELDS.map(([key, label]) => (
              <FormField key={key} label={label}>
                {(props) => (
                  <Input
                    {...props}
                    inputMode="decimal"
                    value={targets[key]}
                    disabled={pending}
                    onChange={(event) => {
                      const value = event.target.value.replace(/,/g, '.');
                      setTargets((current) => ({ ...current, [key]: value }));
                    }}
                  />
                )}
              </FormField>
            ))}
          </div>
        </fieldset>

        <div>
          <p className="mb-2 text-2xs font-bold uppercase tracking-[0.12em] text-text-muted">
            План проти цілі
          </p>
          {report === null ? (
            <p className="text-sm text-text-secondary">
              Підсумок зʼявиться, коли всі прийоми їжі будуть заповнені.
            </p>
          ) : (
            <TargetReport report={report} />
          )}
        </div>

        {error !== undefined && <FormError>{error}</FormError>}
      </form>
    </Modal>
  );
}
